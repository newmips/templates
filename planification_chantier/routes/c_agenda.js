var express = require('express');
var router = express.Router();
var block_access = require('../utils/block_access');

// Sequelize
var models = require('../models/');

var model_builder = require('../utils/model_builder');
var moment = require("moment");

var attributes = require('../models/attributes/e_agenda_event');
var options = require('../models/options/e_agenda_event');
var attributes_chantier = require('../models/attributes/e_chantier');
var options_chantier = require('../models/options/e_chantier');
var model_builder = require('../utils/model_builder');
var entity_helper = require('../utils/entity_helper');

// Winston logger
var logger = require('../utils/logger');

router.get('/', block_access.isLoggedIn, function(req, res) {
    var data = {};
    models.E_agenda_event.findAll({
        include: [{
            model: models.E_agenda_category,
            as: "r_category"
        }, {
            model: models.E_user,
            as: "r_users"
        }]
    }).then(function(events) {

        var eventsArray = [];
        for(var i=0; i<events.length; i++){
            if(events[i].r_category == null){
                events[i].r_category = {
                    f_color: "#CCCCCC"
                };
            }
            var ressourceIds = [];
            for(var j=0; j<events[i].r_users.length; j++){
                ressourceIds.push(events[i].r_users[j].id);
            }
            eventsArray.push({
                eventId: events[i].id,
                title: events[i].f_title,
                start: events[i].f_start_date,
                end: events[i].f_end_date,
                allDay: events[i].f_all_day,
                idCategory: events[i].r_category.id,
                backgroundColor: events[i].r_category.f_color,
                url: "/agenda_event/show?id="+events[i].id,
                ressourceIds: ressourceIds
            });
        }
        models.E_agenda_category.findAll().then(function(categories){
            models.E_user.findAll().then(function(users){

                var include = model_builder.getTwoLevelIncludeAll(models, options_chantier);
                models.E_chantier.findAll({include: include}).then(function(chantiers){

                    models.E_chantier.findAll({
                        include: [
							{
								model: models.E_agenda_event,
								as: "r_events",
								include: [{
									model: models.E_user,
									as: "r_users"
								}]
							}
						]
                    }).then(function(chantierNonAffecte){
                        var chantierToAffect = [];
                        for(var k=0; k<chantierNonAffecte.length; k++){
                            if(chantierNonAffecte[k].r_events.length == 0){
                                chantierToAffect.push(chantierNonAffecte[k]);
                            } else {
                                for(var l=0; l<chantierNonAffecte[k].r_events.length; l++){
                                    if(chantierNonAffecte[k].r_events[l].r_users.length == 0){
                                        chantierToAffect.push(chantierNonAffecte[k]);
                                    }
                                }
                            }
                        }

                        data.chantierToAffect = chantierToAffect;
                        data.categories = categories;
                        data.events = eventsArray;
                        data.users = users;
                        data.chantiers = chantiers;

                        // Récupération des toastr en session
                        data.toastr = req.session.toastr;
                        // Nettoyage de la session
                        req.session.toastr = [];
                        res.render('c_agenda/view_agenda', data);
                    });

                });
            });
        });
    });
});

router.post('/add_event', block_access.actionAccessMiddleware("agenda_event", "create"), function(req, res) {

    if(req.body.idCategory == "" || req.body.idCategory == 0)
        req.body.idCategory = null;

    var createObj = {
        version: 0,
        f_title: req.body.title,
        f_start_date: req.body.start,
        f_end_date: req.body.end,
        f_all_day: req.body.allday,
        fk_id_agenda_category_category: req.body.idCategory,
        fk_id_chantier_chantier: req.body.idChantier
    };

    models.E_agenda_event.create(createObj).then(function(createdEvent){

		// Update e_chantier status and set value to "Planifie"
		var f_id_chantier_chantier =  parseInt(req.body.idChantier);
		if (f_id_chantier_chantier) {
			id_e_chantier = f_id_chantier_chantier;
			console.log(id_e_chantier);
			var updateObject = model_builder.buildForRoute(attributes_chantier, options_chantier, req.body);
			models.E_chantier.findOne({where: {id: id_e_chantier}}).then(function (e_chantier) {
				if (!e_chantier) {
					data.error = 404;
					logger.debug("Not found - Update");
					return res.render('common/error', data);
				}

				updateObject.f_statut = "Planifie";

				e_chantier.update(updateObject, {where: {id: id_e_chantier}}).then(function () {

					// We have to find value in req.body that are linked to an hasMany or belongsToMany association
					// because those values are not updated for now
					model_builder.setAssocationManyValues(e_chantier, req.body, updateObject, options_chantier);

					var include = model_builder.getTwoLevelIncludeAll(models, options_chantier);
					models.E_chantier.findAll({ where: {f_statut: {$eq: "Demande"}}, include:include}).then(function(result){
						req.session.e_chantiers = result;

						// Answer request
						var users = [];
						if(req.body.idUser != null)
							users.push(req.body.idUser);
						createdEvent.setR_users(users).then(function(){
							res.json({
								success: true,
								idEvent: createdEvent.id
							});
						});

					}).catch(function (err) {
						error500(err, req, res, '/agenda');
					});
				}).catch(function (err) {
					error500(err, req, res, '/agenda');
				});
			}).catch(function (err) {
				error500(err, req, res, '/agenda');
			});
		}
		else {
			// Answer request
			var users = [];
			if(req.body.idUser != null)
				users.push(req.body.idUser);
			createdEvent.setR_users(users).then(function(){
				res.json({
					success: true,
					idEvent: createdEvent.id
				});
			});
		}
    });
});

router.post('/resize_event', block_access.actionAccessMiddleware("agenda_event", "create"), function(req, res) {

    var updateObj = {
        f_start_date: req.body.start,
        f_end_date: req.body.end
    };

    models.E_agenda_event.update(updateObj, {where: {id: req.body.eventId}}).then(function(updatedEvent){
        res.json({
            success: true
        });
    });
});

router.post('/update_event', block_access.actionAccessMiddleware("agenda_event", "update"), function(req, res) {
    var id_e_agenda_event = parseInt(req.body.id);

    if (typeof req.body.version !== "undefined" && req.body.version != null && !isNaN(req.body.version) && req.body.version != '')
        req.body.version = parseInt(req.body.version) + 1;
    else
        req.body.version = 0;

    var updateObject = model_builder.buildForRoute(attributes, options, req.body);

    models.E_agenda_event.findOne({
        where: {
            id: id_e_agenda_event
        }
    }).then(function(e_agenda_event) {
        if (!e_agenda_event) {
            data.error = 404;
            logger.debug("Not found - Update");
            return res.render('common/error', data);
        }

        e_agenda_event.update(updateObject).then(function(updatedObject) {

            // We have to find value in req.body that are linked to an hasMany or belongsToMany association
            // because those values are not updated for now
            model_builder.setAssocationManyValues(e_agenda_event, req.body, updateObject, options).then(function() {
                res.send(updatedObject);
            });
        }).catch(function(err) {
            entity_helper.error(err, req, res, '/agenda_event/update_form?id=' + id_e_agenda_event);
        });
    }).catch(function(err) {
        entity_helper.error(err, req, res, '/agenda_event/update_form?id=' + id_e_agenda_event);
    });
});

router.post('/update_event_drop', block_access.actionAccessMiddleware("agenda_event", 'update'), function(req, res) {

    var updateObj = {
        f_start_date: req.body.start,
        f_end_date: req.body.end
    };

    models.E_agenda_event.findByPk(req.body.eventId).then(function(currentEvent){
        currentEvent.update(updateObj, {where: {id: req.body.eventId}}).then(function(updateEvent){
            var users = [];
            if(req.body.idUsers != null){
                users = req.body.idUsers;
            } else if (req.body.idUser != null){
                users.push(req.body.idUser);
            }
            currentEvent.setR_users(users).then(function(){
                res.json({
                    success: true
                });
            });
        });
    });
});

router.post('/delete_event', block_access.actionAccessMiddleware("agenda_event", "delete"), function (req, res) {
    var id_e_agenda_event = parseInt(req.body.id);

    models.E_agenda_event.findOne({where: {id: id_e_agenda_event}}).then(function (deleteObject) {
        if (!deleteObject) {
            req.session.toastr = [{level: 'error', message: 'error.404.title'}];
            return res.redirect('/agenda_event/list');
        }
        deleteObject.destroy().then(() => {
            res.send(true);
            entity_helper.remove_files("e_agenda_event", deleteObject, attributes);
        }).catch(function (err) {
            entity_helper.error(err, req, res, '/agenda_event/list');
        });
    }).catch(function (err) {
        entity_helper.error(err, req, res, '/agenda_event/list');
    });
});

module.exports = router;