// router/routes.js
const express = require('express');
const router = express.Router();
const block_access = require('../utils/block_access');
const globalConf = require('../config/global');
const multer = require('multer');
const fs = require('fs-extra');
const crypto = require('../utils/crypto_helper');
const upload = multer().single('file');
const models = require('../models/');
const Jimp = require("jimp");
const entity_helper = require('../utils/entity_helper');
const dust = require('dustjs-linkedin');
const enums_radios = require('../utils/enum_radio.js');
const component_helper = require('../utils/component_helper');
const options = require('../models/options/e_annonce');

let SELECT_PAGE_SIZE = 10;

// ===========================================
// Redirection Home =====================
// ===========================================

/* GET status page to check if workspace is ready. */
router.get('/status', function(req, res) {
    res.sendStatus(200);
});

// *** Dynamic Module | Do not remove ***

router.get('/reporting', block_access.isLoggedIn, block_access.moduleAccessMiddleware("reporting"), function(req, res) {
    var widgetPromises = [];
    // *** Widget module m_reporting | Do not remove ***
    Promise.all(widgetPromises).then(function(results) {
        var data = {};
        for (var i = 0; i < results.length; i++)
            for (var prop in results[i])
                data[prop] = results[i][prop];
        res.render('default/m_reporting', data);
    });
});

router.get('/configuration', block_access.isLoggedIn, block_access.moduleAccessMiddleware("configuration"), function(req, res) {
    var widgetPromises = [];
    // *** Widget module m_configuration | Do not remove ***
    Promise.all(widgetPromises).then(function(results) {
        var data = {};
        for (var i = 0; i < results.length; i++)
            for (var prop in results[i])
                data[prop] = results[i][prop];
        res.render('default/m_configuration', data);
    });
});

router.get('/administration', block_access.isLoggedIn, block_access.moduleAccessMiddleware("administration"), function(req, res) {
    var widgetPromises = [];
    // *** Widget call e_user stats start | Do not remove ***
	widgetPromises.push(new Promise(function(resolve, reject){
		models.E_user.count().then(function(result){
			resolve({e_user_stats: result});
		});
	}));
	// *** Widget call e_user stats end | Do not remove ***

	// *** Widget module m_administration | Do not remove ***

    Promise.all(widgetPromises).then(function(results) {
        var data = {};
        for (var i = 0; i < results.length; i++)
            for (var prop in results[i])
                data[prop] = results[i][prop];
        res.render('default/m_administration', data);
    });
});

router.get('/home', block_access.isLoggedIn, block_access.moduleAccessMiddleware("home"), function(req, res) {
    var widgetPromises = [];
     // *** Widget call e_annonce stats start | Do not remove ***
    widgetPromises.push(new Promise(function(resolve, reject){
        models.E_annonce.count().then(function(result){
            resolve({e_annonce_stats: result});
        });
    }));
    // *** Widget module m_home | Do not remove ***
    Promise.all(widgetPromises).then(function(results) {
        var data = {};
        for (var i = 0; i < results.length; i++)
            for (var prop in results[i])
                data[prop] = results[i][prop];
        res.render('default/m_home', data);
    });
});

router.get('/search', block_access.isLoggedIn, block_access.moduleAccessMiddleware("home"), function(req, res) {

    var widgetPromises = [];
    // *** Widget module m_home | Do not remove ***


    // Filter on "Mes annonces" is only available when calling method with specific owner attribute
    // owner attribute means, connected user has been set as contact or deposant on announce
    if (req.query.owner)
        req.session.owner = req.query.owner;
    else
        req.session.owner = null;


    Promise.all(widgetPromises).then(function(results) {
        var data = {
            enum_radio: enums_radios.translated("e_annonce", req.session.lang_user, options),
            enum_radio_search: enums_radios.translated("s_annonce", req.session.lang_user, options)
        };

        for (var i = 0; i < results.length; i++)
            for (var prop in results[i])
                data[prop] = results[i][prop];
        res.render('default/search', data);
    });
});

router.post('/search', block_access.actionAccessMiddleware('annonce', 'read'), function (req, res) {

    var widgetPromises = [];

    var data = {
        enum_radio: enums_radios.translated("e_annonce", req.session.lang_user, options),
        enum_radio_search: enums_radios.translated("s_annonce", req.session.lang_user, options)
    };

    // Filter on owner is not applicable on a new search session
    req.session.owner = null;

    // Set search filters
    req.session.c_nom = req.body.f_nom;
    req.session.c_type_d_annonce = req.body.f_type_d_annonce;

    // *** Widget module m_home | Do not remove ***
    Promise.all(widgetPromises).then(function(results) {

        for (var i = 0; i < results.length; i++)
            for (var prop in results[i])
                data[prop] = results[i][prop];
        res.render('default/search', data);
    });
});

router.get('/search_reset', block_access.actionAccessMiddleware('annonce', 'read'), function (req, res) {
// router.get('/search_reset', function (req, res) {
    var widgetPromises = [];

    var data = {
        enum_radio: enums_radios.translated("e_annonce", req.session.lang_user, options),
        enum_radio_search: enums_radios.translated("s_annonce", req.session.lang_user, options)
    };
    req.session.owner = null;
    req.session.c_nom = null;
    req.session.c_type_d_annonce = null;
    req.session.c_categorie = null;
    req.session.c_region = null;
    req.session.c_site = null;
    
    // *** Widget module m_home | Do not remove ***
    Promise.all(widgetPromises).then(function(results) {
        
        for (var i = 0; i < results.length; i++)
            for (var prop in results[i])
                data[prop] = results[i][prop];
        res.render('default/search', data);
    });
});
router.get('/print/:source/:id', block_access.isLoggedIn, function(req, res) {
    var source = req.params.source;
    var id = req.params.id;

    models['E_'+source].findOne({
        where: {id: id},
        include: [{all: true, eager: true}]
    }).then(function(dustData){
        var sourceOptions;
        try {
            sourceOptions = JSON.parse(fs.readFileSync(__dirname+'/../models/options/e_'+source+'.json', 'utf8'));
        } catch(e) {res.status(500).end()}

        // Add enum / radio information
        dustData.enum_radio = enums_radios.translated("e_"+source, req.session.lang_user, sourceOptions);

        imagePromises = [];
        // Source entity images
        imagePromises.push(entity_helper.getPicturesBuffers(dustData, 'e_'+source));;
        // Relations images
        for (var i = 0; i < sourceOptions.length; i++) {
            // Has many/preset
            if (dustData[sourceOptions[i].as] instanceof Array) {
                for (var j = 0; j < dustData[sourceOptions[i].as].length; j++)
                    imagePromises.push(entity_helper.getPicturesBuffers(dustData[sourceOptions[i].as][j], sourceOptions[i].target, true));;
            }
            // Has one
            else
                imagePromises.push(entity_helper.getPicturesBuffers(dustData[sourceOptions[i].as], sourceOptions[i].target));
        }

        // Component address
        dustData.componentAddressConfig = component_helper.getMapsConfigIfComponentAddressExist('e_'+source);

        Promise.all(imagePromises).then(function() {
            // Open and render dust file
            var file = fs.readFileSync(__dirname+'/../views/e_'+source+'/print_fields.dust', 'utf8');
            dust.renderSource(file, dustData || {}, function(err, rendered) {
                if (err) {
                    console.error(err);
                    return res.status(500).end();
                }

                // Send response to ajax request
                res.json({
                    content: rendered,
                    option: {structureType: 'print'}
                });
            });
        });
    });
});

router.get('/unauthorized', block_access.isLoggedIn, function (req, res) {
    res.render('common/unauthorized');
});

router.post('/change_language', block_access.isLoggedIn, function (req, res) {
    req.session.lang_user = req.body.lang;
    res.locals.lang_user = req.body.lang;
    res.json({
        success: true
    });
});

/* Dropzone FIELD ajax upload file */
router.post('/file_upload', block_access.isLoggedIn, function (req, res) {
    upload(req, res, function (err) {
        if (err) {
            console.error(err);
            return res.status(500).end(err);
        }
        var folder = req.file.originalname.split('-');
        var dataEntity = req.body.dataEntity;
        if (folder.length > 1 && !!dataEntity) {
            var basePath = globalConfig.localstorage + dataEntity + '/' + folder[0] + '/';
            fs.mkdirs(basePath, function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).end(err);
                }
                var uploadPath = basePath + req.file.originalname;
                var outStream = fs.createWriteStream(uploadPath);
                outStream.write(req.file.buffer);
                outStream.end();
                outStream.on('finish', function (err) {
                    res.json({
                        success: true
                    });
                });

                if (req.body.dataType == 'picture') {
                    //We make thumbnail and reuse it in datalist
                    basePath = globalConfig.localstorage + globalConfig.thumbnail.folder + dataEntity + '/' + folder[0] + '/';
                    fs.mkdirs(basePath, function (err) {
                        if (err)
                            return console.error(err);

                        Jimp.read(uploadPath, function (err, imgThumb) {
                            if (err)
                                return console.error(err);

                            imgThumb.resize(globalConfig.thumbnail.height, globalConfig.thumbnail.width)
                                    .quality(globalConfig.thumbnail.quality)
                                    .write(basePath + req.file.originalname);
                        });
                    });
                }
            });
        }
    });
});

router.get('/get_picture', block_access.isLoggedIn, function (req, res) {
    try {
        let entity = req.query.entity;
        let filename = req.query.src;
        let cleanFilename = filename.substring(16);
        let folderName = filename.split("-")[0];
        let filePath = globalConfig.localstorage + entity + '/' + folderName + '/' + filename;

        if (!block_access.entityAccess(req.session.passport.user.r_group, entity.substring(2)))
            throw new Error("403 - Access forbidden");

        if (!fs.existsSync(filePath))
            throw new Error("404 - File not found");

        let picture = fs.readFileSync(filePath);

        res.json({
            result: 200,
            data: new Buffer(picture).toString('base64'),
            file: cleanFilename,
            success: true
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(false);
    }
});

router.get('/download', block_access.isLoggedIn, function (req, res) {
    try {
        let entity = req.query.entity;
        let filename = req.query.f;
        let cleanFilename = filename.substring(16);
        let folderName = filename.split("-")[0];
        let filePath = globalConfig.localstorage + entity + '/' + folderName + '/' + filename;

        if (!block_access.entityAccess(req.session.passport.user.r_group, entity.substring(2)))
            throw new Error("403 - Access forbidden");

        if (!fs.existsSync(filePath))
            throw new Error("404 - File not found");

        res.download(filePath, cleanFilename, function (err) {
            if (err)
                throw err;
        });
    } catch (err) {
        console.error(err);
        req.session.toastr.push({
            level: 'error',
            message: "error.500.file"
        });
        res.redirect(req.headers.referer);
    }
});

router.post('/delete-file-ajax', block_access.isLoggedIn, function (req, res) {
    let entity = req.body.dataEntity;
    let dataStorage = req.body.dataStorage;
    let filename = req.body.filename;
    if (entity && dataStorage && filename) {
        let partOfFilepath = filename.split('-');
        if (partOfFilepath.length) {
            let base = partOfFilepath[0];
            let completeFilePath = globalConfig.localstorage + entity + '/' + base + '/' + filename;
            // thumbnail file to delete
            let completeThumbnailPath = globalConfig.localstorage + globalConfig.thumbnail.folder + entity + '/' + base + '/' + filename;
            fs.unlink(completeFilePath, function (err) {
                if (!err) {
                    res.status(200).json({ message: 'message.delete.success'});
                    fs.unlink(completeThumbnailPath, function (err) {
                        if (err)
                            console.error(err);
                    });
                } else {
                    req.session.toastr.push({level: 'error', message: "Internal error"});
                    res.status(500).json({message: ''});
                }
            });
        } else {
            req.session.toastr.push({level: 'error', message: "File syntax not valid"});
            res.status(404).json({message: ''});
        }

    } else {
        req.session.toastr.push({level: 'error', message: "File not found"});
        res.status(400).json({message: 'Request parameters must be set'});
    }
});

/* Select 2 AJAX LOAD */
router.post('/select2_search', block_access.isLoggedIn, function (req, res) {
    var or = [];
    for (var i = 0; i < req.body.searchFields.length; i++) {
        var obj = {};
        obj[req.body.searchFields[i]] = {
            $like: "%" + req.body.search + "%"
        }
        or.push(obj);
    }
    var attributes = ["id"];

    for (var k = 0; k < req.body.searchFields.length; k++) {
        attributes.push(req.body.searchFields[k]);
    }

    var where = {
        where: {
            $or: or
        },
        attributes: attributes
    };
    models[req.body.entity].findAll(where).then(function (results) {
        var data = [];

        /* Format data for select2 */
        for (var j = 0; j < results.length; j++) {
            var text = "";
            for (var k = 0; k < req.body.searchFields.length; k++) {
                if (results[j][req.body.searchFields[k]] != null && results[j][req.body.searchFields[k]] != "") {
                    text += results[j][req.body.searchFields[k]] + " - ";
                }
            }

            //Remove last -
            text = text.substring(0, text.length - 3);

            /* TODO - color in results the search part, but the difficulty is to keep lower en upper case in result */
            /*text = text.replace(new RegExp(req.body.search, 'ig'), "<span style='color:red;'>$1</span>");*/

            data.push({
                id: results[j].id,
                text: text
            });
        }
        res.send(data);
    });
});

module.exports = router;