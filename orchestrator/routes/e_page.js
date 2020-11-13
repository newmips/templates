const router = require('express').Router();
const block_access = require('../utils/block_access');
const filterDataTable = require('../utils/filter_datatable');
const models = require('../models/');
const attributes = require('../models/attributes/e_page');
const options = require('../models/options/e_page');
const model_builder = require('../utils/model_builder');
const entity_helper = require('../utils/entity_helper');
const status_helper = require('../utils/status_helper');
const component_helper = require('../utils/component_helper');
const globalConfig = require('../config/global');
const fs = require('fs-extra');
const dust = require('dustjs-linkedin');
const moment = require("moment");
const SELECT_PAGE_SIZE = 10;
const enums_radios = require('../utils/enum_radio.js');

router.get('/reorder', block_access.actionAccessMiddleware("page", "create"), (req, res) => {
	const {id, type} = req.query;

	(async () => {
		const targeted = await models.E_page.findOne({where: {id}});
		if (!targeted)
			return;

		const updatePromises = [];
		let nextPage;
		if (type == 'increment') {
			[nextPage] = await models.E_page.findAll({
				where: {
					fk_id_programme: targeted.fk_id_programme,
					f_ordre: {[models.Sequelize.Op.gt]: targeted.f_ordre}
				},
				order: [['f_ordre', 'ASC']],
				limit: 1
			});
		}
		else if (type == 'decrement') {
			[nextPage] = await models.E_page.findAll({
				where: {
					fk_id_programme: targeted.fk_id_programme,
					f_ordre: {[models.Sequelize.Op.lt]: targeted.f_ordre}
				},
				order: [['f_ordre', 'DESC']],
				limit: 1
			});
		}
		// Target is already last or first order
		if (!nextPage)
			return;

		const targetNewOrder = nextPage.f_ordre;
		const otherNewOrder = targeted.f_ordre;
		updatePromises.push(nextPage.update({f_ordre: otherNewOrder}), targeted.update({f_ordre: targetNewOrder}));

		await Promise.all(updatePromises);
	})().then(_ => {
		res.end();
	}).catch(err => {
		console.error(err);
		res.end();
	});
});

router.get('/list', block_access.actionAccessMiddleware("page", "read"), (req, res) => {
	res.render('e_page/list');
});

router.post('/datalist', block_access.actionAccessMiddleware("page", "read"), (req, res) => {
	filterDataTable("E_page", req.body).then(rawData => {
		entity_helper.prepareDatalistResult('e_page', rawData, req.session.lang_user).then(preparedData => {
			res.send(preparedData).end();
		}).catch(err => {
			console.error(err);
			res.end();
		});
	}).catch(err => {
		console.error(err);
		res.end();
	});
});

router.post('/subdatalist', block_access.actionAccessMiddleware("page", "read"), (req, res) => {
	const start = parseInt(req.body.start || 0);
	const length = parseInt(req.body.length || 10);

	const sourceId = req.query.sourceId;
	const subentityAlias = req.query.subentityAlias, subentityName = req.query.subentityModel;
	const subentityModel = entity_helper.capitalizeFirstLetter(req.query.subentityModel);
	const doPagination = req.query.paginate;

	// Build array of fields for include and search object
	const isGlobalSearch = req.body.search.value != "";
	const search = {}, searchTerm = isGlobalSearch ? models.$or : models.$and;
	search[searchTerm] = [];
	const toInclude = [];
	// Loop over columns array
	for (let i = 0, columns = req.body.columns; i < columns.length; i++) {
		if (columns[i].searchable == 'false')
			continue;

		// Push column's field into toInclude. toInclude will be used to build the sequelize include. Ex: toInclude = ['r_alias.r_other_alias.f_field', 'f_name']
		toInclude.push(columns[i].data);

		// Add column own search
		if (columns[i].search.value != "") {
			const {type, value} = JSON.parse(columns[i].search.value);
			search[searchTerm].push(model_builder.formatSearch(columns[i].data, value, type));
		}
		// Add column global search
		if (isGlobalSearch)
			search[searchTerm].push(model_builder.formatSearch(columns[i].data, req.body.search.value, req.body.columnsTypes[columns[i].data]));
	}
	for (let i = 0; i < req.body.columns.length; i++)
		if (req.body.columns[i].searchable == 'true')
			toInclude.push(req.body.columns[i].data);
	// Get sequelize include object
	const subentityInclude = model_builder.getIncludeFromFields(models, subentityName, toInclude);

	// ORDER BY
	const stringOrder = req.body.columns[req.body.order[0].column].data;
	// If ordering on an association field, use Sequelize.literal so it can match field path 'r_alias.f_name'
	const order = stringOrder.indexOf('.') != -1 ? [[models.Sequelize.literal(stringOrder), req.body.order[0].dir]] : [[stringOrder, req.body.order[0].dir]];

	const include = {
		model: models[subentityModel],
		as: subentityAlias,
		order: order,
		include: subentityInclude
	}
	if (search[searchTerm].length > 0)
		include.where = search;

	if (search[searchTerm].length > 0)
		include.where = search;

	if (doPagination == "true") {
		include.limit = length;
		include.offset = start;
	}

	include.required = false;

	models.E_page.findOne({
		where: {
			id: parseInt(sourceId)
		},
		include: include
	}).then(e_page => {
		if (!e_page['count' + entity_helper.capitalizeFirstLetter(subentityAlias)]) {
			console.error('/subdatalist: count' + entity_helper.capitalizeFirstLetter(subentityAlias) + ' is undefined');
			return res.status(500).end();
		}

		e_page['count' + entity_helper.capitalizeFirstLetter(subentityAlias)]({where: include.where}).then(count => {
			const rawData = {
				recordsTotal: count,
				recordsFiltered: count,
				data: []
			};
			for (let i = 0; i < e_page[subentityAlias].length; i++)
				rawData.data.push(e_page[subentityAlias][i].get({plain: true}));

			entity_helper.prepareDatalistResult(req.query.subentityModel, rawData, req.session.lang_user).then(preparedData => {
				res.send(preparedData).end();
			}).catch(err => {
				console.error(err);
				res.end();
			});
		});
	});
});

router.get('/show', block_access.actionAccessMiddleware("page", "read"), (req, res) => {
	const id_e_page = req.query.id;
	const tab = req.query.tab;
	const data = {
		tab: tab,
		enum_radio: enums_radios.translated("e_page", req.session.lang_user, options)
	};

	/* If we arrive from an associated tab, hide the create and the list button */
	if (typeof req.query.hideButton !== 'undefined')
		data.hideButton = req.query.hideButton;

	entity_helper.optimizedFindOne('E_page', id_e_page, options).then(e_page => {
		if (!e_page)
			return res.render('common/error', {error: 404});

		/* Update local e_page data before show */
		data.e_page = e_page;
		// Update some data before show, e.g get picture binary
		entity_helper.getPicturesBuffers(e_page, "e_page").then(_ => {
			status_helper.translate(e_page, attributes, req.session.lang_user);
			data.componentAddressConfig = component_helper.address.getMapsConfigIfComponentAddressExists("e_page");
			enums_radios.translateUsingField(e_page, options, data.enum_radio);
			// Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
			entity_helper.getLoadOnStartData(data, options).then(data => {
				res.render('e_page/show', data);
			}).catch(err => {
				entity_helper.error(err, req, res, "/", "e_page");
			})
		}).catch(err => {
			entity_helper.error(err, req, res, "/", "e_page");
		});
	}).catch(err => {
		entity_helper.error(err, req, res, "/", "e_page");
	});
});

router.get('/create_form', block_access.actionAccessMiddleware("page", "create"), (req, res) => {
	const data = {
		enum_radio: enums_radios.translated("e_page", req.session.lang_user, options)
	};

	if (typeof req.query.associationFlag !== 'undefined') {
		data.associationFlag = req.query.associationFlag;
		data.associationSource = req.query.associationSource;
		data.associationForeignKey = req.query.associationForeignKey;
		data.associationAlias = req.query.associationAlias;
		data.associationUrl = req.query.associationUrl;
	}

	models.E_page.max('f_ordre', {
		where: {
			fk_id_programme: data.associationFlag
		}
	}).then(maxOrder => {
		data.maxOrder = isNaN(maxOrder) ? 1 : maxOrder+1;
		// Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
		entity_helper.getLoadOnStartData(data, options).then(data => {
			const view = req.query.ajax ? 'e_page/create_fields' : 'e_page/create';
			res.render(view, data);
		}).catch(err => {
			entity_helper.error(err, req, res, '/page/create_form', "e_page");
		})
	}).catch(err => {
		entity_helper.error(err, req, res, '/page/create_form', "e_page");
	})

});

router.post('/create', block_access.actionAccessMiddleware("page", "create"), (req, res) => {

	const createObject = model_builder.buildForRoute(attributes, options, req.body);

	models.E_page.create(createObject, {user: req.user}).then(e_page => {
		let redirect = '/page/show?id=' + e_page.id;
		req.session.toastr = [{
			message: 'message.create.success',
			level: "success"
		}];

		const promises = [];

		if (typeof req.body.associationFlag !== 'undefined') {
			redirect = '/' + req.body.associationUrl + '/show?id=' + req.body.associationFlag + '#' + req.body.associationAlias;
			promises.push(new Promise((resolve, reject) => {
				models[entity_helper.capitalizeFirstLetter(req.body.associationSource)].findOne({
					where: {
						id: req.body.associationFlag
					}
				}).then(association => {
					if (!association) {
						e_page.destroy();
						const err = new Error();
						err.message = "Association not found.";
						reject(err);
					}

					const modelName = req.body.associationAlias.charAt(0).toUpperCase() + req.body.associationAlias.slice(1).toLowerCase();
					if (typeof association['add' + modelName] !== 'undefined') {
						association['add' + modelName](e_page.id).then(_ => {
							if(globalConfig.env == "tablet"){
								// Write add association to synchro journal
								entity_helper.synchro.writeJournal({
									verb: "associate",
									id: req.body.associationFlag,
									target: "e_page",
									entityName: req.body.associationSource,
									func: 'add' + modelName,
									ids: e_page.id
								});
							}
							resolve();
						}).catch(err => {
							reject(err);
						});
					} else {
						const obj = {};
						obj[req.body.associationForeignKey] = e_page.id;
						association.update(obj, {user: req.user}).then(resolve).catch(err => {
							reject(err);
						});
					}
				});
			}));
		}

		// We have to find value in req.body that are linked to an hasMany or belongsToMany association
		// because those values are not updated for now
		model_builder.setAssocationManyValues(e_page, req.body, createObject, options).then(_ => {
			Promise.all(promises).then(_ => {
				component_helper.address.setAddressIfComponentExists(e_page, options, req.body).then(_ => {
					status_helper.setInitialStatus(req.user, e_page, 'E_page', attributes).then((statusToastrs = []) => {
						if (statusToastrs.length)
							req.session.toastr = [...req.session.toastr, ...statusToastrs];
						res.redirect(redirect);
					}).catch(err => {
						entity_helper.error(err, req, res, '/page/create_form', "e_page");
					});
				});
			}).catch(err => {
				entity_helper.error(err, req, res, '/page/create_form', "e_page");
			});
		});
	}).catch(err => {
		entity_helper.error(err, req, res, '/page/create_form', "e_page");
	});
});

router.get('/update_form', block_access.actionAccessMiddleware("page", "update"), (req, res) => {
	const id_e_page = req.query.id;
	const data = {
		enum_radio: enums_radios.translated("e_page", req.session.lang_user, options)
	};

	if (typeof req.query.associationFlag !== 'undefined') {
		data.associationFlag = req.query.associationFlag;
		data.associationSource = req.query.associationSource;
		data.associationForeignKey = req.query.associationForeignKey;
		data.associationAlias = req.query.associationAlias;
		data.associationUrl = req.query.associationUrl;
	}

	entity_helper.optimizedFindOne('E_page', id_e_page, options).then(e_page => {
		if (!e_page) {
			data.error = 404;
			return res.render('common/error', data);
		}

		e_page.dataValues.enum_radio = data.enum_radio;
		enums_radios.translateUsingField(e_page, options, data.enum_radio);
		data.e_page = e_page;
		// Update some data before show, e.g get picture binary
		entity_helper.getPicturesBuffers(e_page, "e_page", false).then(_ => {
			// Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
			entity_helper.getLoadOnStartData(req.query.ajax ? e_page.dataValues : data, options).then(data => {
				if (req.query.ajax) {
					e_page.dataValues = data;
					res.render('e_page/update_fields', e_page.get({
						plain: true
					}));
				} else
					res.render('e_page/update', data);
			}).catch(err => {
				entity_helper.error(err, req, res, "/", "e_page");
			})
		}).catch(err => {
			entity_helper.error(err, req, res, "/", "e_page");
		})
	}).catch(err => {
		entity_helper.error(err, req, res, "/", "e_page");
	})
});

router.post('/update', block_access.actionAccessMiddleware("page", "update"), (req, res) => {
	const id_e_page = parseInt(req.body.id);
	const updateObject = model_builder.buildForRoute(attributes, options, req.body);

	models.E_page.findOne({
		where: {
			id: id_e_page
		}
	}).then(e_page => {
		if (!e_page)
			return res.render('common/error', {error: 404});

		component_helper.address.updateAddressIfComponentExists(e_page, options, req.body);

		updateObject.version = e_page.version;
		if(typeof e_page.version === 'undefined' || !e_page.version)
			updateObject.version = 0;
		updateObject.version++;

		e_page.update(updateObject, {user: req.user}).then(_ => {

			// We have to find value in req.body that are linked to an hasMany or belongsToMany association
			// because those values are not updated for now
			model_builder.setAssocationManyValues(e_page, req.body, updateObject, options).then(_ => {

				let redirect = '/page/show?id=' + id_e_page;
				if (typeof req.body.associationFlag !== 'undefined')
					redirect = '/' + req.body.associationUrl + '/show?id=' + req.body.associationFlag + '#' + req.body.associationAlias;

				req.session.toastr = [{
					message: 'message.update.success',
					level: "success"
				}];

				res.redirect(redirect);
			}).catch(err => {
				entity_helper.error(err, req, res, '/page/update_form?id=' + id_e_page, "e_page");
			});
		}).catch(err => {
			entity_helper.error(err, req, res, '/page/update_form?id=' + id_e_page, "e_page");
		});
	}).catch(err => {
		entity_helper.error(err, req, res, '/page/update_form?id=' + id_e_page, "e_page");
	});
});

router.get('/loadtab/:id/:alias', block_access.actionAccessMiddleware('page', 'read'), (req, res) => {
	const alias = req.params.alias;

	// Find tab option
	let option;
	for (let i = 0; i < options.length; i++)
		if (options[i].as == alias) {
			option = options[i];
			break;
		}

	if (!option)
		return res.status(404).end();

	// Check access rights to subentity
	if (!block_access.entityAccess(req.session.passport.user.r_group, option.target.substring(2)))
		return res.status(403).end();

	// Default value
	option.noCreateBtn = false;

	let dustData = null, subentityOptions = [], empty = false, dustFile;
	(async () => {
		if (typeof req.query.associationFlag !== 'undefined')
			dustData = req.query;

		// Get read / create / update / delete access on the sub entity to handle button display
		const userRoles = req.session.passport.user.r_role;
		option.access = {
			read: block_access.actionAccess(userRoles, option.target.substring(2), "read"),
			create: block_access.actionAccess(userRoles, option.target.substring(2), "create"),
			update: block_access.actionAccess(userRoles, option.target.substring(2), "update"),
			delete: block_access.actionAccess(userRoles, option.target.substring(2), "delete")
		};

		// Build tab specific variables
		let e_page;
		switch (option.structureType) {
			case 'hasOne':
				e_page = await models.E_page.findOne({
					where: {
						id: req.params.id
					},
					include: {
						model: models[entity_helper.capitalizeFirstLetter(option.target)],
						as: option.as,
						include: {all: true}
					}
				});
				if (!e_page)
					throw new Error('Cannot find entity object.')

				dustData = e_page[option.as];
				empty = !dustData || dustData instanceof Array && dustData.length == 0;
				dustFile = option.target + '/show_fields';

				if (empty)
					break;

				dustData.hideTab = true;
				dustData.enum_radio = enums_radios.translated(option.target, req.session.lang_user, options);
				dustData.componentAddressConfig = component_helper.address.getMapsConfigIfComponentAddressExists(option.target);
				await entity_helper.getPicturesBuffers(dustData, option.target);

				// Fetch status children to be able to switch status
				// Apply getR_children() on each current status
				subentityOptions = require('../models/options/' + option.target); // eslint-disable-line
				for (let i = 0; i < subentityOptions.length; i++) {
					if (subentityOptions[i].target.indexOf('e_status') != 0)
						continue;

					const statusAlias = subentityOptions[i].as;
					dustData[statusAlias].r_children = await dustData[statusAlias].getR_children({ // eslint-disable-line
						include: [{
							model: models.E_group,
							as: "r_accepted_group"
						}]
					});
				}
				break;

			case 'hasMany':
				// Status history specific behavior. Replace history_model by history_table to open view
				if (option.target.indexOf('e_history_') == 0)
					option.noCreateBtn = true;
				dustData.for = 'hasMany';
				dustFile = option.target + '/list_fields';
				break;

			case 'hasManyPreset':
				dustData.for = 'fieldset';
				dustFile = option.target + '/list_fields';
				break;

			default:
				throw new Error('Cannot find assocation structureType')
		}

		// Get association data that needed to be load directly here (to do so set loadOnStart param to true in options).
		return await entity_helper.getLoadOnStartData(dustData, subentityOptions); // Return dustData

	})().then(dustData => {
		// Open and render dust file
		const file = fs.readFileSync(__dirname + '/../views/' + dustFile + '.dust', 'utf8');
		dust.insertLocalsFn(dustData ? dustData : {}, req);
		dust.renderSource(file, dustData || {}, (err, rendered) => {
			if (err) {
				console.error(err);
				return res.status(500).end();
			}

			// Send response to ajax request
			res.json({
				content: rendered,
				data: dustData ? dustData.id || {} : {},
				empty: empty,
				option: option
			});
		});
	}).catch(err => {
		console.error(err);
		res.status(500).send(err);
	});
});

router.get('/set_status/:id_page/:status/:id_new_status', block_access.actionAccessMiddleware("page", "read"), block_access.statusGroupAccess, (req, res) => {
	status_helper.setStatus('e_page', req.params.id_page, req.params.status, req.params.id_new_status, req.user, req.query.comment).then(_ => {
		res.redirect(req.headers.referer);
	}).catch(err => {
		console.error(err);
		req.session.toastr.push({level: 'error', message: 'component.status.error.action_error'});
		res.redirect(req.headers.referer);
	});
});

router.post('/search', block_access.actionAccessMiddleware('page', 'read'), (req, res) => {
	const search = '%' + (req.body.search || '') + '%';
	const limit = SELECT_PAGE_SIZE;
	const offset = (req.body.page - 1) * limit;

	// ID is always needed
	if (req.body.searchField.indexOf("id") == -1)
		req.body.searchField.push('id');

	const query = {
		raw: true,
		attributes: req.body.searchField,
		where: {}
	};
	if (search != '%%') {
		if (req.body.searchField.length == 1)
			query.where[req.body.searchField[0]] = {[models.$like]: search};
		else {
			query.where[models.$or] = [];
			for (let i = 0; i < req.body.searchField.length; i++) {
				if (req.body.searchField[i] == "id")
					continue;
				const currentOrObj = {};
				if (req.body.searchField[i].indexOf(".") != -1)
					currentOrObj["$" + req.body.searchField[i] + "$"] = {[models.$like]: search}
				else
					currentOrObj[req.body.searchField[i]] = {[models.$like]: search}
				query.where[models.$or].push(currentOrObj);
			}
		}
	}

	// Example custom where in select HTML attributes, please respect " and ':
	// data-customwhere='{"myField": "myValue"}'

	// Notice that customwhere feature do not work with related to many field if the field is a foreignKey !

	// Possibility to add custom where in select2 ajax instanciation
	if (typeof req.body.customwhere !== "undefined") {
		// If customwhere from select HTML attribute, we need to parse to object
		if(typeof req.body.customwhere === "string")
			req.body.customwhere = JSON.parse(req.body.customwhere);
		for (const param in req.body.customwhere) {
			// If the custom where is on a foreign key
			if (param.indexOf("fk_") != -1)
				for (const option in options) {
					// We only add where condition on key that are standard hasMany relation, not belongsToMany association
					if ((options[option].foreignKey == param || options[option].otherKey == param) && options[option].relation != "belongsToMany"){
						// Where on include managment if fk
						if(param.indexOf(".") != -1)
							query.where["$"+param+"$"] = req.body.customwhere[param];
						else
							query.where[param] = req.body.customwhere[param];
					}
				}
			else if (param.indexOf(".") != -1)
				query.where["$"+param+"$"] = req.body.customwhere[param];
			else
				query.where[param] = req.body.customwhere[param];
		}
	}

	query.offset = offset;
	query.limit = limit;

	// If you need to show fields in the select that are in an other associate entity
	// You have to include those entity here
	// query.include = [{model: models.E_myentity, as: "r_myentity"}]

	models.E_page.findAndCountAll(query).then(results => {
		results.more = results.count > req.body.page * SELECT_PAGE_SIZE;
		// Format value like date / datetime / enum / etc...
		for (const field in attributes)
			for (let i = 0; i < results.rows.length; i++)
				for (const fieldSelect in results.rows[i])
					if(fieldSelect == field && results.rows[i][field] && results.rows[i][field] != "")
						switch(attributes[field].newmipsType) {
							case "date":
								results.rows[i][field] = moment(results.rows[i][field]).format(req.session.lang_user == "fr-FR" ? "DD/MM/YYYY" : "YYYY-MM-DD")
								break;
							case "datetime":
								results.rows[i][field] = moment(results.rows[i][field]).format(req.session.lang_user == "fr-FR" ? "DD/MM/YYYY HH:mm" : "YYYY-MM-DD HH:mm")
								break;
							case "enum":
								results.rows[i][field] = enums_radios.translateFieldValue('e_page', field, results.rows[i][field], req.session.lang_user)
								break;
							default:
								break;
						}

		res.json(results);
	}).catch(err => {
		console.error(err);
		res.status(500).json(err);
	});
});

router.post('/fieldset/:alias/remove', block_access.actionAccessMiddleware("page", "update"), (req, res) => {
	const alias = req.params.alias;
	const idToRemove = req.body.idRemove;
	const idEntity = req.body.idEntity;
	models.E_page.findOne({
		where: {
			id: idEntity
		}
	}).then(e_page => {
		if (!e_page) {
			const data = {
				error: 404
			};
			return res.render('common/error', data);
		}

		// Get all associations
		e_page['remove' + entity_helper.capitalizeFirstLetter(alias)](idToRemove).then(_ => {
			if(globalConfig.env == "tablet"){
				let target = "";
				for (let i = 0; i < options.length; i++)
					if (options[i].as == alias)
					{target = options[i].target; break;}
				entity_helper.synchro.writeJournal({
					verb: "associate",
					id: idEntity,
					target: target,
					entityName: "e_page",
					func: 'remove' + entity_helper.capitalizeFirstLetter(alias),
					ids: idToRemove
				});
			}

			res.sendStatus(200).end();
		}).catch(err => {
			entity_helper.error(err, req, res, "/", "e_page");
		});
	}).catch(err => {
		entity_helper.error(err, req, res, "/", "e_page");
	});
});

router.post('/fieldset/:alias/add', block_access.actionAccessMiddleware("page", "create"), (req, res) => {
	const alias = req.params.alias;
	const idEntity = req.body.idEntity;
	models.E_page.findOne({
		where: {
			id: idEntity
		}
	}).then(e_page => {
		if (!e_page)
			return res.render('common/error', {error: 404});

		let toAdd;
		if (typeof(toAdd = req.body.ids) === 'undefined') {
			req.session.toastr.push({
				message: 'message.create.failure',
				level: "error"
			});
			return res.redirect('/page/show?id=' + idEntity + "#" + alias);
		}

		e_page['add' + entity_helper.capitalizeFirstLetter(alias)](toAdd).then(_ => {
			res.redirect('/page/show?id=' + idEntity + "#" + alias);
		}).catch(err => {
			entity_helper.error(err, req, res, "/", "e_page");
		});
	}).catch(err => {
		entity_helper.error(err, req, res, "/", "e_page");
	});
});

router.post('/delete', block_access.actionAccessMiddleware("page", "delete"), (req, res) => {
	const id_e_page = parseInt(req.body.id);

	models.E_page.findOne({
		where: {
			id: id_e_page
		}
	}).then(deleteObject => {
		if (!deleteObject)
			return res.render('common/error', {error: 404});

		deleteObject.destroy().then(_ => {
			req.session.toastr = [{
				message: 'message.delete.success',
				level: "success"
			}];

			let redirect = '/page/list';
			if (typeof req.body.associationFlag !== 'undefined')
				redirect = '/' + req.body.associationUrl + '/show?id=' + req.body.associationFlag + '#' + req.body.associationAlias;
			res.redirect(redirect);
			entity_helper.removeFiles("e_page", deleteObject, attributes);
		}).catch(err => {
			entity_helper.error(err, req, res, '/page/list', "e_page");
		});
	}).catch(err => {
		entity_helper.error(err, req, res, '/page/list', "e_page");
	});
});

module.exports = router;