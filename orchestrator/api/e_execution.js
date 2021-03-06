const express = require('express');
const router = express.Router();
const models = require('../models/');
const attributes = require('../models/attributes/e_execution');
const options = require('../models/options/e_execution');
const model_builder = require('../utils/model_builder');
const entity_helper = require('../utils/entity_helper');
const globalConf = require('../config/global');
const multer = require('multer');
const upload = multer().single('file');
const moment = require('moment');
const fs = require('fs-extra');
const status_helper = require('../utils/status_helper');

router.post('/:id/logfile', function(req, res) {
	upload(req, res, error => {
		if (error) {
			console.error(error);
			return res.status(500).end(error);
		}
		if (!req.file) {
			console.error("No file found in request");
			return res.status(500).end("No file found in request");
		}

		models.E_execution.findOne({where: {id: req.params.id}}).then(execution => {
			if (!execution) {
				console.error("Execution not found");
				return res.status(500).end();
			}
			const folderName = moment().format('YYYYMMDD');
			const fileName = `${folderName}-${moment().format('hhmmss')}_${req.file.originalname}`;
			const basePath = `${globalConf.localstorage}/e_execution/${folderName}/`;
			fs.mkdirs(basePath, err => {
				if (err) {
					console.error(err);
					return res.status(500).end(error);
				}
				const outStream = fs.createWriteStream(basePath+fileName);
				outStream.write(req.file.buffer);
				outStream.end();
				outStream.on('finish', err => {
					if (err) {
						console.error("Couldn't create execution's error file");
						console.error(err);
						return res.status(500).end();
					}
					execution.update({
						f_logs: fileName,
					}, {user: req.user}).then(_ => {
						console.log("Execution's error file created");
						res.end();
					}).catch(err => {
						console.error("Couldn't create Documents execution DB row");
						console.error(err);
						res.status(500).end();
					});
				});
			});
		}).catch(err => {
			console.error("Couldn't find execution DB row");
			console.error(err);
			res.status(500).end();
		});
	});
});

//
// FIND ALL
//
router.get('/', function(req, res) {
	const answer = {
		limit: parseInt(req.query.limit || 50),
		offset: parseInt(req.query.offset || 0),
		error: null
	};

	// Build include from query parameter: `?include=r_asso1,r_asso2`
	const include = [];
	if (req.query.include) {
		const queryIncludes = req.query.include.split(',');
		for (let i = 0; i < queryIncludes.length; i++)
			for (let j = 0; j < options.length; j++)
				if (queryIncludes[i] == options[j].as)
					include.push({
						model: models[entity_helper.capitalizeFirstLetter(options[j].target)],
						as: options[j].as
					});
	}
	const query = {limit: answer.limit, offset: answer.offset};
	if (include.length)
		query.include = include;

	const where = {};
	for (const field in req.query)
		if (field.indexOf('fk_id_') == 0 || field.indexOf('f_') == 0 && attributes[field])
			where[field] = req.query[field];
	if (Object.keys(where).length)
		query.where = where;

	models.E_execution.findAndCountAll(query).then(function(e_executions) {
		answer["e_executions".substring(2)] = e_executions.rows || [];
		answer.totalCount = e_executions.count;
		answer.rowsCount = answer["e_executions".substring(2)].length;

		res.status(200).json(answer);
	}).catch(function(err) {
		answer.error = err;
		res.status(500).json(answer);
	});
});

//
// FIND ONE
//
router.get('/:id', function(req, res) {
	const answer = {
		error: null
	};
	const id_e_execution = parseInt(req.params.id);

	// Build include from query parameter: `?include=r_asso1,r_asso2`
	const include = [];
	if (req.query.include) {
		const queryIncludes = req.query.include.split(',');
		for (let i = 0; i < queryIncludes.length; i++)
			for (let j = 0; j < options.length; j++)
				if (queryIncludes[i] == options[j].as)
					include.push({
						model: models[entity_helper.capitalizeFirstLetter(options[j].target)],
						as: options[j].as
					});
	}
	const query = {limit: answer.limit, offset: answer.offset, };
	if (include.length)
		query.include = include;

	const where = {id: id_e_execution};
	for (const field in req.query)
		if (field.indexOf('fk_id_') == 0 || field.indexOf('f_') == 0 && attributes[field])
			where[field] = req.query[field];
	query.where = where;

	models.E_execution.findOne(query).then(function(e_execution) {
		if (!e_execution) {
			answer.error = "No e_execution with ID "+id_e_execution;
			return res.status(404).json(answer);
		}
		answer["e_execution".substring(2)] = e_execution;

		res.status(200).json(answer);
	}).catch(function(err){
		answer.error = err;
		res.status(500).json(answer);
	});
});

//
// FIND ASSOCIATION
//
router.get('/:id/:association', function(req, res) {
	const answer = {
		error: null,
		limit: parseInt(req.query.limit || 50),
		offset: parseInt(req.query.offset || 0)
	};
	const id_e_execution = req.params.id;
	const association = req.params.association;

	let include = null;
	for (let i = 0; i < options.length; i++) {
		if (options[i].as == 'r_' + association) {
			if (options[i].relation.toLowerCase().indexOf('many') != -1) {
				include = {
					model: models[entity_helper.capitalizeFirstLetter(options[i].target)],
					as: options[i].as
				};
				delete answer.limit;
				delete answer.offset;
			}
			else
				include = {
					model: models[entity_helper.capitalizeFirstLetter(options[i].target)],
					as: options[i].as,
					limit: answer.limit,
					offset: answer.offset
				}
			break;
		}
	}

	if (include == null) {
		answer.error = "No association with "+association;
		return res.status(404).json(answer);
	}

	const where = {};
	for (const field in req.query)
		if (field.indexOf('f_') == 0)
			where[field] = req.query[field];
	if (Object.keys(where).length)
		include.where = where;

	models.E_execution.findOne({
		where: {id: id_e_execution},
		include: include
	}).then(function(e_execution) {
		if (!e_execution) {
			answer.error = "No e_execution with ID "+id_e_execution;
			return res.status(404).json(answer);
		}
		answer[association] = e_execution[include.as];

		res.status(200).json(answer);
	}).catch(function(err){
		answer.error = err;
		res.status(500).json(answer);
	});
});

//
// CREATE
//
router.post('/', function(req, res) {
	const answer = {
		error: null
	};

	const createObject = model_builder.buildForRoute(attributes, options, req.body);

	models.E_execution.create(createObject, {user: req.user}).then(function(e_execution) {
		answer["e_execution".substring(2)] = e_execution;

		// Set associations
		const associationPromises = [];
		for (const prop in req.body)
			if (prop.indexOf('r_') == 0) {
				if (e_execution['set'+entity_helper.capitalizeFirstLetter(prop)] !== 'undefined')
					associationPromises.push(e_execution['set'+entity_helper.capitalizeFirstLetter(prop)](req.body[prop]));
				else
					console.error("API: Couldn't set association.\nAPI: e_execution.set"+entity_helper.capitalizeFirstLetter(prop)+"() is undefined.");
			}

		Promise.all(associationPromises).then(function() {
			res.status(200).json(answer);
		}).catch(function(err) {
			console.error(err);
			answer.error = "Error with associations";
			res.status(500).json(answer);
		});
	}).catch(function(err){
		console.error(err);
		answer.error = err;
		res.status(500).json(answer);
	});
});

//
// UPDATE
//
router.put('/:id', function(req, res) {
	const answer = {
		error: null
	};
	const id_e_execution = parseInt(req.params.id);
	const updateObject = model_builder.buildForRoute(attributes, options, req.body);

	// Fetch e_execution to update
	models.E_execution.findOne({where: {id: id_e_execution}}).then(function(e_execution) {
		if (!e_execution) {
			answer.error = "No e_execution with ID "+id_e_execution;
			return res.status(404).json(answer);
		}
console.log('111');
		const associationPromises = [];
		for (const prop in req.body) {
			if (prop.indexOf('r_') != 0)
				continue;
			for (const option of options) {
				if (option.target == 'e_status' && option.as == prop) {
					delete updateObject[option.foreignKey]
					associationPromises.push(status_helper('e_execution', id_e_execution, option.as, req.body[prop]));
					break;
				}
			}
		}

console.log('222');
		// Update e_execution
		e_execution.update(updateObject, {where: {id: id_e_execution}}, {user: req.user}).then(function() {
			answer["e_execution".substring(2)] = e_execution;
console.log('333');
			// Set associations
			for (const prop in req.body)
				if (prop.indexOf('r_') == 0) {
					if (e_execution['set'+entity_helper.capitalizeFirstLetter(prop)] !== 'undefined')
						associationPromises.push(e_execution['set'+entity_helper.capitalizeFirstLetter(prop)](req.body[prop]));
					else
						console.error("API: Couldn't set association.\nAPI: e_execution.set"+entity_helper.capitalizeFirstLetter(prop)+"() is undefined.");
				}

			Promise.all(associationPromises).then(function() {
console.log('444');
				res.status(200).json(answer);
			}).catch(function(err) {
				console.error(err);
				answer.error = "Error with associations";
				res.status(500).json(answer);
			});
		}).catch(function(err){
			console.error(err);
			answer.error = err;
			res.status(500).json(answer);
		});
	}).catch(function(err){
		console.error(err);
		answer.error = err;
		res.status(500).json(answer);
	});
});

//
// DELETE
//
router.delete('/:id', function(req, res) {
	const answer = {
		error: null
	}
	const id_e_execution = req.params.id;

	models.E_execution.destroy({where: {id: id_e_execution}}).then(function() {
		res.status(200).end();
	}).catch(function(err){
		answer.error = err;
		res.status(500).json(answer);
	});
});

module.exports = router;
