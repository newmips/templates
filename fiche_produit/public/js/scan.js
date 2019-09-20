$(".widget-row").click(function() {
    window.location = $(this).data('href');
});
$("table td").each(function() {
    var self = this;
    var type = $(self).data('type');
    var cellValue = $(self).html();
    if (type == 'color')
        cellValue = '<i style="color:' + cellValue + '" class="fa fa-lg fa-circle"></i>';
    else if (type == 'currency')
        cellValue = '<span data-type="currency">' + cellValue + '</span>';
    else if (type == 'email' && (cellValue != null && cellValue != ''))
        cellValue = '<a href="mailto:' + cellValue + '">' + cellValue + '</a>';
    else if (type == 'tel' && (cellValue != null && cellValue != ''))
        cellValue = '<a href="tel:' + cellValue + '">' + cellValue + '</a>';
    else if (type == 'picture') {
        $(self).html('');
        $.ajax({
            url: '/default/get_file?entity=' + $(self).parents('table').data('entity') + '&src=' + cellValue,
            success: function(data) {
                if (data != null && data.data != '') {
                    console.log(data);
                    $(self).html('<img src=data:image/;base64,' + data.data + ' />');
                } else {
                    $(self).html('');
                }
            }
        });
        return;
    }
    $(self).html(cellValue);
});
if (document.getElementById("qr_code")) {
    var video = document.createElement("video");
    var canvasElement = document.getElementById("canvas");
    var canvas = canvasElement.getContext("2d");
    var loadingMessage = document.getElementById("loadingMessage");
    var outputContainer = document.getElementById("output");
    var outputMessage = document.getElementById("outputMessage");
    var outputData = document.getElementById("outputData");
    var qrcode = document.getElementById("qrcode");
    var parentCanvas = canvasElement.parentElement;
    var scanned = false;

    function drawLine(begin, end, color) {
        canvas.beginPath();
        canvas.moveTo(begin.x, begin.y);
        canvas.lineTo(end.x, end.y);
        canvas.lineWidth = 4;
        canvas.strokeStyle = color;
        canvas.stroke();
    }
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment"
        }
    }).then(function(stream) {
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.play();
        requestAnimationFrame(tick);
    });

    function tick() {
        loadingMessage.innerText = " Chargement vidéo...";
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            loadingMessage.hidden = true;
            canvasElement.hidden = false;
            outputContainer.hidden = false;
            canvasElement.width = parentCanvas.offsetWidth * 0.8;
            canvasElement.height = canvasElement.width;
            canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
            var imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            var code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#FF3B58");
                drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#FF3B58");
                drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#FF3B58");
                drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#FF3B58");
                outputMessage.hidden = true;
                outputData.parentElement.hidden = false;
                outputData.innerText = code.data;
                qrcode.value = code.data;
                if (!scanned) {
                    scanned = true;
                    scanForm.submit();
                }
            } else {
                outputMessage.hidden = false;
                outputData.parentElement.hidden = true;
            }
        }
        requestAnimationFrame(tick);
    }
}
if (document.getElementById("code128_video")) {
    const videoElement = document.querySelector('video');
    const videoSelect = document.querySelector('select#videoSource');
    navigator.mediaDevices.enumerateDevices().then(gotDevices).then(getStream).catch(handleError);
    videoSelect.onchange = getStream;

    function gotDevices(deviceInfos) {
        for (var i = 0; i !== deviceInfos.length; ++i) {
            var deviceInfo = deviceInfos[i];
            var option = document.createElement('option');
            option.value = deviceInfo.deviceId;
            if (deviceInfo.kind === 'videoinput') {
                option.text = deviceInfo.label || 'camera ' + (videoSelect.length + 1);
                videoSelect.appendChild(option);
            } else {
                console.log('Found one other kind of source/device: ', deviceInfo);
            }
        }
    }

    function getStream() {
        if (window.stream) {
            window.stream.getTracks().forEach(function(track) {
                track.stop();
            });
        }
        var constraints = {
            video: {
                deviceId: {
                    exact: videoSelect.value
                }
            }
        };
        navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(handleError);
    }

    function handleError(error) {
        console.error('Error: ', error);
    }

    function gotStream(stream) {
        window.stream = stream;
        videoElement.srcObject = stream;
        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: videoElement,
                area: {
                    top: "0%",
                    right: "0%",
                    left: "0%",
                    bottom: "0%"
                },
            },
            decoder: {
                readers: ["code_128_reader"]
            },
            frequency: 10,
            debug: true,
            locate: true,
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            numOfWorkers: 2,
        }, function(err) {
            if (err) {
                console.log(err);
                return
            }
            console.log("Initialization finished. Ready to start");
            Quagga.start();
        });
        Quagga.onProcessed(function(result) {
            var drawingCtx = Quagga.canvas.ctx.overlay,
                drawingCanvas = Quagga.canvas.dom.overlay;
            if (result) {
                if (result.boxes) {
                    drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                    result.boxes.filter(function(box) {
                        return box !== result.box;
                    }).forEach(function(box) {
                        Quagga.ImageDebug.drawPath(box, {
                            x: 0,
                            y: 1
                        }, drawingCtx, {
                            color: "green",
                            lineWidth: 2
                        });
                    });
                }
                if (result.box) {
                    Quagga.ImageDebug.drawPath(result.box, {
                        x: 0,
                        y: 1
                    }, drawingCtx, {
                        color: "#00F",
                        lineWidth: 2
                    });
                }
                if (result.codeResult && result.codeResult.code) {
                    Quagga.ImageDebug.drawPath(result.line, {
                        x: 'x',
                        y: 'y'
                    }, drawingCtx, {
                        color: 'red',
                        lineWidth: 3
                    });
                }
            }
        });
        var lastResult = null;
        $("#results").text("Rien trouvé pour le moment !");
        Quagga.onDetected(function(result) {
            var code = result.codeResult.code;
            $("#results").text(code);
            $("#code_barre").val(code);
            $("#scanFormCodeBarre").submit();
            Quagga.stop();
        });
    }
}
if (document.getElementById("code128_file")) {
    $(function() {
        var App = {
            init: function() {
                App.attachListeners();
            },
            attachListeners: function() {
                var self = this;
                $(".controls input[type=file]").on("change", function(e) {
                    if (e.target.files && e.target.files.length) {
                        App.decode(URL.createObjectURL(e.target.files[0]));
                    }
                });
                $(".controls button").on("click", function(e) {
                    var input = document.querySelector(".controls input[type=file]");
                    if (input.files && input.files.length) {
                        App.decode(URL.createObjectURL(input.files[0]));
                    }
                });
                $(".controls .reader-config-group").on("change", "input, select", function(e) {
                    e.preventDefault();
                    var $target = $(e.target),
                        value = $target.attr("type") === "checkbox" ? $target.prop("checked") : $target.val(),
                        name = $target.attr("name"),
                        state = self._convertNameToState(name);
                    console.log("Value of " + state + " changed to " + value);
                    self.setState(state, value);
                });
            },
            _accessByPath: function(obj, path, val) {
                var parts = path.split('.'),
                    depth = parts.length,
                    setter = (typeof val !== "undefined") ? true : false;
                return parts.reduce(function(o, key, i) {
                    if (setter && (i + 1) === depth) {
                        o[key] = val;
                    }
                    return key in o ? o[key] : {};
                }, obj);
            },
            _convertNameToState: function(name) {
                return name.replace("_", ".").split("-").reduce(function(result, value) {
                    return result + value.charAt(0).toUpperCase() + value.substring(1);
                });
            },
            detachListeners: function() {
                $(".controls input[type=file]").off("change");
                $(".controls .reader-config-group").off("change", "input, select");
                $(".controls button").off("click");
            },
            decode: function(src) {
                var self = this,
                    config = $.extend({}, self.state, {
                        src: src
                    });
                Quagga.decodeSingle(config, function(result) {});
            },
            setState: function(path, value) {
                var self = this;
                if (typeof self._accessByPath(self.inputMapper, path) === "function") {
                    value = self._accessByPath(self.inputMapper, path)(value);
                }
                self._accessByPath(self.state, path, value);
                console.log(JSON.stringify(self.state));
                App.detachListeners();
                App.init();
            },
            inputMapper: {
                inputStream: {
                    size: function(value) {
                        return parseInt(value);
                    }
                },
                numOfWorkers: function(value) {
                    return parseInt(value);
                },
                decoder: {
                    readers: function(value) {
                        if (value === 'ean_extended') {
                            return [{
                                format: "ean_reader",
                                config: {
                                    supplements: [
                                        'ean_5_reader', 'ean_2_reader'
                                    ]
                                }
                            }];
                        }
                        return [{
                            format: value + "_reader",
                            config: {}
                        }];
                    }
                }
            },
            state: {
                inputStream: {
                    size: 800,
                    singleChannel: false
                },
                locator: {
                    patchSize: "medium",
                    halfSample: true
                },
                decoder: {
                    readers: [{
                        format: "code_128_reader",
                        config: {}
                    }]
                },
                locate: true,
                src: null
            }
        };
        App.init();

        function calculateRectFromArea(canvas, area) {
            var canvasWidth = canvas.width,
                canvasHeight = canvas.height,
                top = parseInt(area.top) / 100,
                right = parseInt(area.right) / 100,
                bottom = parseInt(area.bottom) / 100,
                left = parseInt(area.left) / 100;
            top *= canvasHeight;
            right = canvasWidth - canvasWidth * right;
            bottom = canvasHeight - canvasHeight * bottom;
            left *= canvasWidth;
            return {
                x: left,
                y: top,
                width: right - left,
                height: bottom - top
            };
        }
        Quagga.onProcessed(function(result) {
            var drawingCtx = Quagga.canvas.ctx.overlay,
                drawingCanvas = Quagga.canvas.dom.overlay,
                area;
            if (result) {
                if (result.boxes) {
                    drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                    result.boxes.filter(function(box) {
                        return box !== result.box;
                    }).forEach(function(box) {
                        Quagga.ImageDebug.drawPath(box, {
                            x: 0,
                            y: 1
                        }, drawingCtx, {
                            color: "green",
                            lineWidth: 2
                        });
                    });
                }
                if (result.box) {
                    Quagga.ImageDebug.drawPath(result.box, {
                        x: 0,
                        y: 1
                    }, drawingCtx, {
                        color: "#00F",
                        lineWidth: 2
                    });
                }
                if (result.codeResult && result.codeResult.code) {
                    Quagga.ImageDebug.drawPath(result.line, {
                        x: 'x',
                        y: 'y'
                    }, drawingCtx, {
                        color: 'red',
                        lineWidth: 3
                    });
                }
                if (App.state.inputStream.area) {
                    area = calculateRectFromArea(drawingCanvas, App.state.inputStream.area);
                    drawingCtx.strokeStyle = "#0F0";
                    drawingCtx.strokeRect(area.x, area.y, area.width, area.height);
                }
            }
        });
        Quagga.onDetected(function(result) {
            var code = result.codeResult.code,
                $node,
                canvas = Quagga.canvas.dom.image;
            $node = $('<li><div class="thumbnail"><div class="imgWrapper"><img /></div><div class="caption"><h4 class="code"></h4></div></div></li>');
            $node.find("img").attr("src", canvas.toDataURL());
            $node.find("h4.code").html(code);
            $("#code_barre").val(code);
            $("#scanFormCodeBarre").submit();
            $("#result_strip ul.thumbnails").prepend($node);
        });
    });
}
var device = "{device}";
if (device == "ios")
    $("#iosInput").click();