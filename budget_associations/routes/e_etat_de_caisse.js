var express = require('express');
var router = express.Router();
var block_access = require('../utils/block_access');
// Datalist
var filterDataTable = require('../utils/filter_datatable');

// Sequelize
var models = require('../models/');
var attributes = require('../models/attributes/e_etat_de_caisse');
var options = require('../models/options/e_etat_de_caisse');
var model_builder = require('../utils/model_builder');
var entity_helper = require('../utils/entity_helper');
var file_helper = require('../utils/file_helper');
var status_helper = require('../utils/status_helper');
var component_helper = require('../utils/component_helper');
var globalConfig = require('../config/global');
var fs = require('fs-extra');
var dust = require('dustjs-linkedin');
var moment = require("moment");
var SELECT_PAGE_SIZE = 10;

// Enum and radio managment
var enums_radios = require('../utils/enum_radio.js');

// Winston logger
var logger = require('../utils/logger');

router.get('/list', block_access.actionAccessMiddleware("etat_de_caisse", "read"), function(req, res) {
    res.render('e_etat_de_caisse/list');
});

router.post('/datalist', block_access.actionAccessMiddleware("etat_de_caisse", "read"), function(req, res) {
    /* Looking for include to get all associated related to data for the datalist ajax loading */
    var include = model_builder.getDatalistInclude(models, options, req.body.columns);
    filterDataTable("E_etat_de_caisse", req.body, include).then(function(rawData) {
        entity_helper.prepareDatalistResult('e_etat_de_caisse', rawData, req.session.lang_user).then(function(preparedData) {
            res.send(preparedData).end();
        }).catch(function(err) {
            console.log(err);
            logger.debug(err);
            res.end();
        });
    }).catch(function(err) {
        console.log(err);
        logger.debug(err);
        res.end();
    });
});

router.post('/subdatalist', block_access.actionAccessMiddleware("etat_de_caisse", "read"), function(req, res) {
    var start = parseInt(req.body.start || 0);
    var length = parseInt(req.body.length || 10);

    var sourceId = req.query.sourceId;
    var subentityAlias = req.query.subentityAlias;
    var subentityModel = entity_helper.capitalizeFirstLetter(req.query.subentityModel);
    var subentityOptions = JSON.parse(fs.readFileSync(__dirname+"/../models/options/"+req.query.subentityModel+".json"));
    var subentityInclude = model_builder.getDatalistInclude(models, subentityOptions, req.body.columns);
    var doPagination = req.query.paginate;

    var queryAttributes = [];
    for (var i = 0; i < req.body.columns.length; i++)
        if (req.body.columns[i].searchable == 'true')
            queryAttributes.push(req.body.columns[i].data);

    /* ORDER BY */
    var order;
    var stringOrder = req.body.columns[req.body.order[0].column].data;
    var arrayOrder = stringOrder.split(".");

    /* If there are inclusions, seperate with dot */
    if (arrayOrder.length > 1) {
        order = [];
        var orderContent = [];
        for (var j = 0; j < arrayOrder.length; j++) {
            if (j < arrayOrder.length - 1) {
                var modelInclude = entity_helper.searchInInclude(subentityInclude, arrayOrder[j]);
                orderContent.push({
                    model: models[modelInclude.model.name],
                    as: arrayOrder[j]
                });
            } else {
                /* Add the field and the order */
                orderContent.push(arrayOrder[j]);
                orderContent.push(req.body.order[0].dir);
            }
        }
        /* Create the new order for the Sequelize request */
        order.push(orderContent);
    } else {
        // Defining a simple order by
        order = [[req.body.columns[req.body.order[0].column].data, req.body.order[0].dir]];
    }

    var include = {
        model: models[subentityModel],
        as: subentityAlias,
        order: order,
        include: subentityInclude
    }

    if (doPagination == "true") {
        include.limit = length;
        include.offset = start;
    }

    models.E_etat_de_caisse.findOne({
        where: {
            id: parseInt(sourceId)
        },
        include: include
    }).then(function(e_etat_de_caisse) {
        if (!e_etat_de_caisse['count' + entity_helper.capitalizeFirstLetter(subentityAlias)]) {
            console.error('/subdatalist: count' + entity_helper.capitalizeFirstLetter(subentityAlias) + ' is undefined');
            return res.status(500).end();
        }

        e_etat_de_caisse['count' + entity_helper.capitalizeFirstLetter(subentityAlias)]().then(function(count) {
            var rawData = {
                recordsTotal: count,
                recordsFiltered: count,
                data: []
            };
            for (var i = 0; i < e_etat_de_caisse[subentityAlias].length; i++)
                rawData.data.push(e_etat_de_caisse[subentityAlias][i].get({
                    plain: true
                }));

            entity_helper.prepareDatalistResult(req.query.subentityModel, rawData, req.session.lang_user).then(function(preparedData) {
                res.send(preparedData).end();
            }).catch(function(err) {
                console.log(err);
                logger.debug(err);
                res.end();
            });
        });
    });
});

router.get('/show', block_access.actionAccessMiddleware("etat_de_caisse", "read"), function(req, res) {
    var id_e_etat_de_caisse = req.query.id;
    var tab = req.query.tab;
    var data = {
        tab: tab,
        enum_radio: enums_radios.translated("e_etat_de_caisse", req.session.lang_user, options)
    };

    /* If we arrive from an associated tab, hide the create and the list button */
    if (typeof req.query.hideButton !== 'undefined')
        data.hideButton = req.query.hideButton;

    entity_helper.optimizedFindOne('E_etat_de_caisse', id_e_etat_de_caisse, options).then(function(e_etat_de_caisse) {
        if (!e_etat_de_caisse) {
            data.error = 404;
            logger.debug("No data entity found.");
            return res.render('common/error', data);
        }

        /* Update local e_etat_de_caisse data before show */
        data.e_etat_de_caisse = e_etat_de_caisse;
        // Update some data before show, e.g get picture binary
        entity_helper.getPicturesBuffers(e_etat_de_caisse, "e_etat_de_caisse").then(function() {
            status_helper.translate(e_etat_de_caisse, attributes, req.session.lang_user);
            data.componentAddressConfig = component_helper.getMapsConfigIfComponentAddressExist("e_etat_de_caisse");
            // Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
            entity_helper.getLoadOnStartData(data, options).then(function(data) {
                var where = {
                    $and: [
                           {
                             fk_id_regie_regie: e_etat_de_caisse.fk_id_regie_regie
                           },
                           {
                              f_date: {$gte: e_etat_de_caisse.f_debut_de_periode}
                           },
                           {
                              f_date: {$lte: e_etat_de_caisse.f_fin_de_periode}
                           }
                    ]
                };

                models.E_recette.findAll({where: where, include: [{ all: true }]}).then(function (e_recette) {
                data.e_recette = e_recette;

                var montant = 0;
                var moyen_de_paiement = 0;
                var code = '';
                var total = 0;
                var total_cheques = 0;
                var total_especes = 0;
                var total_cesu = 0;
                var total_ancv = 0;

                var valeurs = {};
                for (var i = 0; i < e_recette.length; i++) {
                    var item = e_recette[i].dataValues;
                    montant = item.f_montant;
                    code = item.r_ligne_de_credit.f_code;
                    moyen_de_paiement = item.fk_id_moyen_de_paiement_moyen_de_paiement;
                    // lc = item.fk_id_ligne_de_credit_ligne_de_credit;

                    switch (moyen_de_paiement) {
                        case 1: total_cheques = eval(total_cheques + montant); break;
                        case 2: total_especes = eval(total_especes + montant); break;
                        case 3: total_cesu = eval(total_cesu + montant); break;
                        case 4: total_ancv = eval(total_ancv + montant); break;
                        case 5: total_ancv = eval(total_ancv + montant); break;
                        default: break;
                    }
                    // Tableau des montants groupés par codes de lignes de crédit et moyen de paiement
                    if (valeurs[code] != null) {
                        if (moyen_de_paiement != null) {
                            if (valeurs[code][moyen_de_paiement] != null) {
                                console.log(code + " " + moyen_de_paiement + " : " + valeurs[code][moyen_de_paiement]);
                                console.log("Somme " + code + " " + moyen_de_paiement + " : " + eval(valeurs[code][moyen_de_paiement] + montant));
                                valeurs[code][moyen_de_paiement] = eval(valeurs[code][moyen_de_paiement] + montant);
                            }
                            else {
                                valeurs[code][moyen_de_paiement] = montant;
                            }
                        }
                    }
                    else {
                        valeurs[code] = {};
                        valeurs[code][moyen_de_paiement] = montant;
                    }

                }
                total = eval(total_cheques + total_especes + total_cesu + total_ancv);
                total = total.toFixed(2);
                total = total.replace(".",",") + " €";

                total_cheques = total_cheques.toFixed(2);
                total_cheques = total_cheques.replace(".",",") + " €";

                total_especes = total_especes.toFixed(2);
                total_especes = total_especes.replace(".",",") + " €";

                total_cesu = total_cesu.toFixed(2);
                total_cesu = total_cesu.replace(".",",") + " €";

                total_ancv = total_ancv.toFixed(2);
                total_ancv = total_ancv.replace(".",",") + " €";

                data.valeurs = valeurs;
                data.total_cheques = total_cheques;
                data.total_especes = total_especes;
                data.total_cesu = total_cesu;
                data.total_ancv = total_ancv;
                data.total = total;
                res.render('e_etat_de_caisse/show', data);
            });
                // res.render('e_etat_de_caisse/show', data);
            }).catch(function(err) {
                entity_helper.error(err, req, res, "/");
            })
        }).catch(function(err) {
            entity_helper.error(err, req, res, "/");
        });
    }).catch(function(err) {
        entity_helper.error(err, req, res, "/");
    });
});

router.get('/create_form', block_access.actionAccessMiddleware("etat_de_caisse", "create"), function(req, res) {
    var data = {
        enum_radio: enums_radios.translated("e_etat_de_caisse", req.session.lang_user, options)
    };

    if (typeof req.query.associationFlag !== 'undefined') {
        data.associationFlag = req.query.associationFlag;
        data.associationSource = req.query.associationSource;
        data.associationForeignKey = req.query.associationForeignKey;
        data.associationAlias = req.query.associationAlias;
        data.associationUrl = req.query.associationUrl;
    }

    // Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
    entity_helper.getLoadOnStartData(data, options).then(function(data) {
        var view = req.query.ajax ? 'e_etat_de_caisse/create_fields' : 'e_etat_de_caisse/create';
        res.render(view, data);
    }).catch(function(err) {
        entity_helper.error(err, req, res, '/bb/create_form');
    })
});

router.post('/create', block_access.actionAccessMiddleware("etat_de_caisse", "create"), function(req, res) {

    var createObject = model_builder.buildForRoute(attributes, options, req.body);

    models.E_etat_de_caisse.create(createObject).then(function(e_etat_de_caisse) {
        var redirect = '/etat_de_caisse/show?id=' + e_etat_de_caisse.id;
        req.session.toastr = [{
            message: 'message.create.success',
            level: "success"
        }];

        var promises = [];

        if (typeof req.body.associationFlag !== 'undefined') {
            redirect = '/' + req.body.associationUrl + '/show?id=' + req.body.associationFlag + '#' + req.body.associationAlias;
            promises.push(new Promise(function(resolve, reject) {
                models[entity_helper.capitalizeFirstLetter(req.body.associationSource)].findOne({
                    where: {
                        id: req.body.associationFlag
                    }
                }).then(function(association) {
                    if (!association) {
                        e_etat_de_caisse.destroy();
                        var err = new Error();
                        err.message = "Association not found.";
                        reject(err);
                    }

                    var modelName = req.body.associationAlias.charAt(0).toUpperCase() + req.body.associationAlias.slice(1).toLowerCase();
                    if (typeof association['add' + modelName] !== 'undefined') {
                        association['add' + modelName](e_etat_de_caisse.id).then(function() {
                            // Write add association to synchro journal
                            entity_helper.synchro.writeJournal({
                                verb: "associate",
                                id: req.body.associationFlag,
                                target: "e_etat_de_caisse",
                                entityName: req.body.associationSource,
                                func: 'add' + modelName,
                                ids: e_etat_de_caisse.id
                            });
                            resolve();
                        }).catch(function (err) {
                            reject(err);
                        });
                    } else {
                        var obj = {};
                        obj[req.body.associationForeignKey] = e_etat_de_caisse.id;
                        association.update(obj).then(resolve).catch(function(err) {
                            reject(err);
                        });
                    }
                });
            }));
        }

        // We have to find value in req.body that are linked to an hasMany or belongsToMany association
        // because those values are not updated for now
        model_builder.setAssocationManyValues(e_etat_de_caisse, req.body, createObject, options).then(function() {
            Promise.all(promises).then(function() {
                component_helper.setAddressIfComponentExist(e_etat_de_caisse, options, req.body).then(function() {
                    res.redirect(redirect);
                });
            }).catch(function(err) {
                entity_helper.error(err, req, res, '/etat_de_caisse/create_form');
            });
        });
    }).catch(function(err) {
        entity_helper.error(err, req, res, '/etat_de_caisse/create_form');
    });
});

router.get('/update_form', block_access.actionAccessMiddleware("etat_de_caisse", "update"), function(req, res) {
    var id_e_etat_de_caisse = req.query.id;
    var data = {
        enum_radio: enums_radios.translated("e_etat_de_caisse", req.session.lang_user, options)
    };

    if (typeof req.query.associationFlag !== 'undefined') {
        data.associationFlag = req.query.associationFlag;
        data.associationSource = req.query.associationSource;
        data.associationForeignKey = req.query.associationForeignKey;
        data.associationAlias = req.query.associationAlias;
        data.associationUrl = req.query.associationUrl;
    }

    entity_helper.optimizedFindOne('E_etat_de_caisse', id_e_etat_de_caisse, options).then(function(e_etat_de_caisse) {
        if (!e_etat_de_caisse) {
            data.error = 404;
            return res.render('common/error', data);
        }

        e_etat_de_caisse.dataValues.enum_radio = data.enum_radio;
        data.e_etat_de_caisse = e_etat_de_caisse;
        // Update some data before show, e.g get picture binary
        entity_helper.getPicturesBuffers(e_etat_de_caisse, "e_etat_de_caisse", true).then(function() {
            // Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
            entity_helper.getLoadOnStartData(req.query.ajax ? e_etat_de_caisse.dataValues : data, options).then(function(data) {
                if (req.query.ajax) {
                    e_etat_de_caisse.dataValues = data;
                    res.render('e_etat_de_caisse/update_fields', e_etat_de_caisse.get({
                        plain: true
                    }));
                } else
                    res.render('e_etat_de_caisse/update', data);
            }).catch(function(err) {
                entity_helper.error(err, req, res, "/");
            })
        }).catch(function(err) {
            entity_helper.error(err, req, res, "/");
        })
    }).catch(function(err) {
        entity_helper.error(err, req, res, "/");
    })
});

router.post('/update', block_access.actionAccessMiddleware("etat_de_caisse", "update"), function(req, res) {
    var id_e_etat_de_caisse = parseInt(req.body.id);

    if (typeof req.body.version !== "undefined" && req.body.version != null && !isNaN(req.body.version) && req.body.version != '')
        req.body.version = parseInt(req.body.version) + 1;
    else
        req.body.version = 0;

    var updateObject = model_builder.buildForRoute(attributes, options, req.body);

    models.E_etat_de_caisse.findOne({
        where: {
            id: id_e_etat_de_caisse
        }
    }).then(function(e_etat_de_caisse) {
        if (!e_etat_de_caisse) {
            data.error = 404;
            logger.debug("Not found - Update");
            return res.render('common/error', data);
        }
        component_helper.updateAddressIfComponentExist(e_etat_de_caisse, options, req.body);
        e_etat_de_caisse.update(updateObject).then(function() {

            // We have to find value in req.body that are linked to an hasMany or belongsToMany association
            // because those values are not updated for now
            model_builder.setAssocationManyValues(e_etat_de_caisse, req.body, updateObject, options).then(function() {

                var redirect = '/etat_de_caisse/show?id=' + id_e_etat_de_caisse;
                if (typeof req.body.associationFlag !== 'undefined')
                    redirect = '/' + req.body.associationUrl + '/show?id=' + req.body.associationFlag + '#' + req.body.associationAlias;

                req.session.toastr = [{
                    message: 'message.update.success',
                    level: "success"
                }];

                res.redirect(redirect);
            }).catch(function(err) {
                entity_helper.error(err, req, res, '/etat_de_caisse/update_form?id=' + id_e_etat_de_caisse);
            });
        }).catch(function(err) {
            entity_helper.error(err, req, res, '/etat_de_caisse/update_form?id=' + id_e_etat_de_caisse);
        });
    }).catch(function(err) {
        entity_helper.error(err, req, res, '/etat_de_caisse/update_form?id=' + id_e_etat_de_caisse);
    });
});

router.get('/loadtab/:id/:alias', block_access.actionAccessMiddleware('etat_de_caisse', 'read'), function(req, res) {
    var alias = req.params.alias;
    var id = req.params.id;

    // Find tab option
    var option;
    for (var i = 0; i < options.length; i++)
        if (options[i].as == req.params.alias) {
            option = options[i];
            break;
        }
    if (!option)
        return res.status(404).end();

    // Check access rights to subentity
    if (!block_access.entityAccess(req.session.passport.user.r_group, option.target.substring(2)))
        return res.status(403).end();

    var queryOpts = {
        where: {
            id: id
        }
    };
    // If hasMany, no need to include anything since it will be fetched using /subdatalist
    if (option.structureType != 'hasMany')
        queryOpts.include = {
            model: models[entity_helper.capitalizeFirstLetter(option.target)],
            as: option.as,
            include: {
                all: true
            }
        }

    // Fetch tab data
    models.E_etat_de_caisse.findOne(queryOpts).then(function(e_etat_de_caisse) {
        if (!e_etat_de_caisse)
            return res.status(404).end();

        var dustData = e_etat_de_caisse[option.as] || null;
        var empty = !dustData || (dustData instanceof Array && dustData.length == 0) ? true : false;
        var dustFile, idSubentity, promisesData = [];
        var subentityOptions = [];

        // Build tab specific variables
        switch (option.structureType) {
            case 'hasOne':
                if (!empty) {
                    idSubentity = dustData.id;
                    dustData.hideTab = true;
                    dustData.enum_radio = enums_radios.translated(option.target, req.session.lang_user, options);
                    promisesData.push(entity_helper.getPicturesBuffers(dustData, option.target));
                    // Fetch status children to be able to switch status
                    // Apply getR_children() on each current status
                    var subentityOptions = require('../models/options/' + option.target);
                    dustData.componentAddressConfig = component_helper.getMapsConfigIfComponentAddressExist(option.target);
                    for (var i = 0; i < subentityOptions.length; i++)
                        if (subentityOptions[i].target.indexOf('e_status') == 0)
                            (function(alias) {
                                promisesData.push(new Promise(function(resolve, reject) {
                                    dustData[alias].getR_children().then(function(children) {
                                        dustData[alias].r_children = children;
                                        resolve();
                                    });
                                }));
                            })(subentityOptions[i].as);
                }
                dustFile = option.target + '/show_fields';
                break;

            case 'hasMany':
                dustFile = option.target + '/list_fields';
                // Status history specific behavior. Replace history_model by history_table to open view
                if (option.target.indexOf('e_history_e_') == 0)
                    option.noCreateBtn = true;
                dustData = {
                    for: 'hasMany'
                };
                if (typeof req.query.associationFlag !== 'undefined') {
                    dustData.associationFlag = req.query.associationFlag;
                    dustData.associationSource = req.query.associationSource;
                    dustData.associationForeignKey = req.query.associationForeignKey;
                    dustData.associationAlias = req.query.associationAlias;
                    dustData.associationUrl = req.query.associationUrl;
                }
                break;

            case 'hasManyPreset':
                dustFile = option.target + '/list_fields';
                var obj = {};
                obj[option.target] = dustData;
                dustData = obj;
                if (typeof req.query.associationFlag !== 'undefined') {
                    dustData.associationFlag = req.query.associationFlag;
                    dustData.associationSource = req.query.associationSource;
                    dustData.associationForeignKey = req.query.associationForeignKey;
                    dustData.associationAlias = req.query.associationAlias;
                    dustData.associationUrl = req.query.associationUrl;
                }
                dustData.for = 'fieldset';
                for (var i = 0; i < dustData[option.target].length; i++)
                    promisesData.push(entity_helper.getPicturesBuffers(dustData[option.target][i], option.target, true));

                break;

            case 'localfilestorage':
                dustFile = option.target + '/list_fields';
                var obj = {};
                obj[option.target] = dustData;
                dustData = obj;
                dustData.sourceId = id;
                break;

            default:
                return res.status(500).end();
        }

        // Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
        entity_helper.getLoadOnStartData(dustData, subentityOptions).then(function(dustData) {
            // Image buffer promise
            Promise.all(promisesData).then(function() {
                // Open and render dust file
                var file = fs.readFileSync(__dirname + '/../views/' + dustFile + '.dust', 'utf8');
                dust.renderSource(file, dustData || {}, function(err, rendered) {
                    if (err) {
                        console.error(err);
                        return res.status(500).end();
                    }

                    // Send response to ajax request
                    res.json({
                        content: rendered,
                        data: idSubentity || {},
                        empty: empty,
                        option: option
                    });
                });
            }).catch(function(err) {
                console.error(err);
                res.status(500).send(err);
            });
        }).catch(function(err) {
            console.error(err);
            res.status(500).send(err);
        });
    }).catch(function(err) {
        console.error(err);
        res.status(500).send(err);
    });
});

router.get('/set_status/:id_etat_de_caisse/:status/:id_new_status', block_access.actionAccessMiddleware("etat_de_caisse", "update"), function(req, res) {
    status_helper.setStatus('e_etat_de_caisse', req.params.id_etat_de_caisse, req.params.status, req.params.id_new_status, req.query.comment).then(()=> {
        res.redirect(req.headers.referer);
    }).catch((err)=> {
        entity_helper.error(err, req, res, '/etat_de_caisse/show?id=' + req.params.id_etat_de_caisse);
    });
});

router.post('/search', block_access.actionAccessMiddleware('etat_de_caisse', 'read'), function(req, res) {
    var search = '%' + (req.body.search || '') + '%';
    var limit = SELECT_PAGE_SIZE;
    var offset = (req.body.page - 1) * limit;

    // ID is always needed
    if (req.body.searchField.indexOf("id") == -1)
        req.body.searchField.push('id');

    var where = {
        raw: true,
        attributes: req.body.searchField,
        where: {}
    };
    if (search != '%%') {
        if (req.body.searchField.length == 1) {
            where.where[req.body.searchField[0]] = {
                $like: search
            };
        } else {
            where.where.$or = [];
            for (var i = 0; i < req.body.searchField.length; i++) {
                if (req.body.searchField[i] != "id") {
                    var currentOrObj = {};
                    if(req.body.searchField[i].indexOf(".") != -1){
                        currentOrObj["$"+req.body.searchField[i]+"$"] = {
                            $like: search
                        }
                    } else {
                        currentOrObj[req.body.searchField[i]] = {
                            $like: search
                        }
                    }
                    where.where.$or.push(currentOrObj);
                }
            }
        }
    }

    // Example custom where in select HTML attributes, please respect " and ':
    // data-customwhere='{"myField": "myValue"}'

    // Notice that customwhere feature do not work with related to many field if the field is a foreignKey !

    // Possibility to add custom where in select2 ajax instanciation
    if (typeof req.body.customwhere !== "undefined"){
        // If customwhere from select HTML attribute, we need to parse to object
        if(typeof req.body.customwhere === "string")
            req.body.customwhere = JSON.parse(req.body.customwhere);
        for (var param in req.body.customwhere) {
            // If the custom where is on a foreign key
            if (param.indexOf("fk_") != -1) {
                for (var option in options) {
                    // We only add where condition on key that are standard hasMany relation, not belongsToMany association
                    if ((options[option].foreignKey == param || options[option].otherKey == param) && options[option].relation != "belongsToMany"){
                        // Where on include managment if fk
                        if(param.indexOf(".") != -1){
                            where.where["$"+param+"$"] = req.body.customwhere[param];
                        } else {
                            where.where[param] = req.body.customwhere[param];
                        }
                    }
                }
            } else {
                if(param.indexOf(".") != -1){
                    where.where["$"+param+"$"] = req.body.customwhere[param];
                } else {
                    where.where[param] = req.body.customwhere[param];
                }
            }
        }
    }

    where.offset = offset;
    where.limit = limit;

    // If you need to show fields in the select that are in an other associate entity
    // You have to include those entity here
    // where.include = [{model: models.E_myentity, as: "r_myentity"}]

    models.E_etat_de_caisse.findAndCountAll(where).then(function(results) {
        results.more = results.count > req.body.page * SELECT_PAGE_SIZE ? true : false;
        // Format value like date / datetime / etc...
        for (var field in attributes) {
            for (var i = 0; i < results.rows.length; i++) {
                for (var fieldSelect in results.rows[i]) {
                    if(fieldSelect == field){
                        switch(attributes[field].newmipsType) {
                            case "date":
                                results.rows[i][fieldSelect] = moment(results.rows[i][fieldSelect]).format(req.session.lang_user == "fr-FR" ? "DD/MM/YYYY" : "YYYY-MM-DD")
                                break;
                            case "datetime":
                                results.rows[i][fieldSelect] = moment(results.rows[i][fieldSelect]).format(req.session.lang_user == "fr-FR" ? "DD/MM/YYYY HH:mm" : "YYYY-MM-DD HH:mm")
                                break;
                        }
                    }
                }
            }
        }
        res.json(results);
    }).catch(function(e) {
        console.error(e);
        res.status(500).json(e);
    });
});

router.post('/fieldset/:alias/remove', block_access.actionAccessMiddleware("etat_de_caisse", "delete"), function(req, res) {
    var alias = req.params.alias;
    var idToRemove = req.body.idRemove;
    var idEntity = req.body.idEntity;
    models.E_etat_de_caisse.findOne({
        where: {
            id: idEntity
        }
    }).then(function(e_etat_de_caisse) {
        if (!e_etat_de_caisse) {
            var data = {
                error: 404
            };
            return res.render('common/error', data);
        }

        // Get all associations
        e_etat_de_caisse['remove' + entity_helper.capitalizeFirstLetter(alias)](idToRemove).then(function (aliasEntities) {
            var target = "";
            for (var i = 0; i < options.length; i++)
                if (options[i].as == alias)
                    {target = options[i].target; break;}
            entity_helper.synchro.writeJournal({
                verb: "associate",
                id: idEntity,
                target: target,
                entityName: "e_etat_de_caisse",
                func: 'remove' + entity_helper.capitalizeFirstLetter(alias),
                ids: idToRemove
            });
            res.sendStatus(200).end();
        }).catch(function(err) {
            entity_helper.error(err, req, res, "/");
        });
    }).catch(function(err) {
        entity_helper.error(err, req, res, "/");
    });
});

router.post('/fieldset/:alias/add', block_access.actionAccessMiddleware("etat_de_caisse", "create"), function(req, res) {
    var alias = req.params.alias;
    var idEntity = req.body.idEntity;
    models.E_etat_de_caisse.findOne({
        where: {
            id: idEntity
        }
    }).then(function(e_etat_de_caisse) {
        if (!e_etat_de_caisse) {
            var data = {
                error: 404
            };
            logger.debug("No data entity found.");
            return res.render('common/error', data);
        }

        var toAdd;
        if (typeof(toAdd = req.body.ids) === 'undefined') {
            req.session.toastr.push({
                message: 'message.create.failure',
                level: "error"
            });
            return res.redirect('/etat_de_caisse/show?id=' + idEntity + "#" + alias);
        }

        e_etat_de_caisse['add' + entity_helper.capitalizeFirstLetter(alias)](toAdd).then(function () {
            var target = "";
            for (var i = 0; i < options.length; i++)
                if (options[i].as == alias)
                    {target = options[i].target; break;}
            entity_helper.synchro.writeJournal({
                verb: "associate",
                id: idEntity,
                target: target,
                entityName: "e_etat_de_caisse",
                func: 'add' + entity_helper.capitalizeFirstLetter(alias),
                ids: toAdd
            });
            res.redirect('/etat_de_caisse/show?id=' + idEntity + "#" + alias);
        }).catch(function(err) {
            entity_helper.error(err, req, res, "/");
        });
    }).catch(function(err) {
        entity_helper.error(err, req, res, "/");
    });
});

router.post('/delete', block_access.actionAccessMiddleware("etat_de_caisse", "delete"), function(req, res) {
    var id_e_etat_de_caisse = parseInt(req.body.id);

    models.E_etat_de_caisse.findOne({where: {id: id_e_etat_de_caisse}}).then(function (deleteObject) {
        if (!deleteObject) {
            req.session.toastr = [{level: 'error', message: 'error.404.title'}];
            return res.redirect('/etat_de_caisse/list');
        }
        deleteObject.destroy().then(() => {
            req.session.toastr = [{
                message: 'message.delete.success',
                level: "success"
            }];

            var redirect = '/etat_de_caisse/list';
            if (typeof req.body.associationFlag !== 'undefined')
                redirect = '/' + req.body.associationUrl + '/show?id=' + req.body.associationFlag + '#' + req.body.associationAlias;
            res.redirect(redirect);
            entity_helper.remove_files("e_etat_de_caisse", deleteObject, attributes);
        }).catch(function(err) {
            entity_helper.error(err, req, res, '/etat_de_caisse/list');
        });
    }).catch(function(err) {
        entity_helper.error(err, req, res, '/etat_de_caisse/list');
    });
});

module.exports = router;