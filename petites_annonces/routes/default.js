// router/routes.js
var express = require('express');
var router = express.Router();
var block_access = require('../utils/block_access');
var languageConfig = require('../config/language');
var globalConf = require('../config/global');
var multer = require('multer');
var fs = require('fs');
var fse = require('fs-extra');
var crypto = require('../utils/crypto_helper');
var upload = multer().single('file');
var models = require('../models/');
var Jimp = require("jimp");
var entity_helper = require('../utils/entity_helper');
var dust = require('dustjs-linkedin');
var enums_radios = require('../utils/enum_radio.js');
var component_helper = require('../utils/component_helper');
var options = require('../models/options/e_annonce');
var SELECT_PAGE_SIZE = 10;

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
    languageConfig.lang = req.body.lang;
    fs.writeFileSync(__dirname + "/../config/language.json", JSON.stringify(languageConfig, null, 2));
    res.json({
        success: true
    });
});

/* Dropzone FIELD ajax upload file */
router.post('/file_upload', block_access.isLoggedIn, function (req, res) {
    upload(req, res, function (err) {
        if (err) {
            console.log(err);
            return res.status(500).end(err);
        }
        var folder = req.file.originalname.split('-');
        var dataEntity = req.body.dataEntity;
        if (folder.length > 1 && !!dataEntity) {
            var basePath = globalConf.localstorage + dataEntity + '/' + folder[0] + '/';
            fse.mkdirs(basePath, function (err) {
                if (err) {
                    console.log(err);
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
                    basePath = globalConf.localstorage + globalConf.thumbnail.folder + dataEntity + '/' + folder[0] + '/';
                    fse.mkdirs(basePath, function (err) {
                        if (err)
                            return console.log(err);

                        Jimp.read(uploadPath, function (err, imgThumb) {
                            if (err)
                                return console.log(err);

                            imgThumb.resize(globalConf.thumbnail.height, globalConf.thumbnail.width)
                                    .quality(globalConf.thumbnail.quality)
                                    .write(basePath + req.file.originalname);
                        });
                    });
                }
            });
        }
    });
});

router.get('/get_file', block_access.isLoggedIn, function (req, res) {
    var entity = req.query.entity;
    var src = req.query.src;
    if (!!entity && !!src) {
        var partOfFilepath = src.split('-');
        if (partOfFilepath.length > 1) {
            var base = partOfFilepath[0];
            var completeFilePath = globalConf.localstorage + 'thumbnail/' + entity + '/' + base + '/' + src;
            fs.readFile(completeFilePath, function (err, data) {
                if (!err) {
                    var buffer = new Buffer(data).toString('base64');
                    res.json({
                        result: 200,
                        data: buffer,
                        file: src,
                        success: true
                    });
                } else
                    res.end();
            });
        } else
            res.end();
    } else
        res.end();
});

router.get('/download', block_access.isLoggedIn, function (req, res) {
    var entity = req.query.entity;
    var filepath = req.query.f;
    // Filename without date and hours prefix
    var filename = filepath.substring(16);
    var p = new Promise(function (resolve, reject) {
        if (!!entity && !!filepath) {
            var partOfFilepath = filepath.split('-');
            if (partOfFilepath.length > 1) {
                var base = partOfFilepath[0];
                // Taking dirname from globalConf cause a bug on filename param for res.download
                // So we take again __dirname here and remove it from globalConf
                var dir = __dirname;
                var completeFilePath = dir + globalConf.localstorage.substring(dir.length) + entity + '/' + base + '/' + filepath;
                res.download(completeFilePath, filename, function (err) {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            } else
                reject();

        } else
            reject();
    });
    p.then(function () {
        console.log("The file "+filename+" was successfully downloaded !");
    }).catch(function (err) {
        console.log(err);
        req.session.toastr.push({level: 'error', message: "File not found"});
        res.writeHead(303, {Location: req.headers.referer});
        res.end();
    });
});

router.post('/delete_file', block_access.isLoggedIn, function (req, res) {
    var entity = req.body.dataEntity;
    var dataStorage = req.body.dataStorage;
    var filename = req.body.filename;
    if (!!entity && !!dataStorage && !!filename) {
        var partOfFilepath = filename.split('-');
        if (partOfFilepath.length) {
            var base = partOfFilepath[0];
            var completeFilePath = globalConf.localstorage + entity + '/' + base + '/' + filename;
            // thumbnail file to delete
            var completeThumbnailPath = globalConf.localstorage + globalConf.thumbnail.folder + entity + '/' + base + '/' + filename;
            fs.unlink(completeFilePath, function (err) {
                if (!err) {
                    req.session.toastr.push({level: 'success', message: "message.delete.success"});
                    res.json({result: 200, message: ''});
                    fs.unlink(completeThumbnailPath,function (err) {
                        if(err)
                            console.log(err);
                    });
                } else {
                    req.session.toastr.push({level: 'error', message: "Internal error"});
                    res.json({result: 500, message: ''});
                }

            });
        } else {
            req.session.toastr.push({level: 'error', message: "File syntax not valid"});
            res.json({result: 404, message: ''});
        }

    } else {
        req.session.toastr.push({level: 'error', message: "File not found"});
        res.json({result: 404, message: ''});
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