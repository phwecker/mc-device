// 
// Studio Device Code 
//

function Studio(httpPort) {
    let StudioConfig = require('../config/studio.js');

    let Encoder;
    let Player;
    let Switcher;

    if (StudioConfig.encoder.enabled) {
        let encoders = require(`./${StudioConfig.encoder.deviceCode}`);
        Encoder = encoders.Encoder;
    }

    if (StudioConfig.player.enabled) {
        let players = require(`./${StudioConfig.player.deviceCode}`);
        Player = players.Player;
    }

    if (StudioConfig.switcher.enabled) {
        let switchers = require(`./${StudioConfig.switcher.deviceCode}`);
        Switcher = switchers.Switcher;
    }
    //  Studio Device - IoT Hub
    //
    let IotDeviceClient = require("azure-iot-device").Client;
    let Message = require("azure-iot-device").Message;
    let Protocol = require("azure-iot-device-mqtt").Mqtt;

    // Studio Properties
    // 
    this.encoder = StudioConfig.encoder.enabled ? new Encoder() : null;
    this.switcher = StudioConfig.switcher.enabled ? new Switcher() : null;
    this.player = StudioConfig.player.enabled ? new Player() : null;
    this.online = false;
    this.httpEnabled = true;
    this.studioTwin = {};
    this.encoderPreviousAddress = "";
    this.properties = {
        connected: false
    }
    self = this;

    function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function startHttp(httpPort) {
        var express = require('express');
        var app = express();
        var cors = require('cors')

        const listenPort = process.env.PORT || httpPort || 80;
        // setting middleware

        app.use(cors())

        app.get('/components', (req, res) => {
            res.send({ switcher: StudioConfig.switcher.enabled, encoder: StudioConfig.encoder.enabled, player: StudioConfig.player.enabled, });
        });
        app.get('/studio', (req, res) => {
            res.send(self.studioTwin.properties);
        });

        app.get('/encoder/scenes', async (req, res) => {
            if (self.encoder.properties.connected) {
                res.json(await self.encoder.scenes());
            }
            else {
                res.send({})
            }
        });

        app.get('/player/:command/:inNo?/:loop?', async (req, res) => {
            const command = req.params.command
            const inNo = req.params.inNo
            const loop = req.params.loop == "loop"
            if (self.player.properties.connected) {
                switch (command) {
                    case 'clips':
                        res.json(await self.player.clips());
                        break;
                    case 'play':
                        res.json(await self.player.playClip(inNo, loop));
                        break;
                    case 'stop':
                        res.json(await self.player.stopClip());
                        break;
                    case 'next':
                        res.json(await self.player.nextClip());
                        break;
                    case 'prev':
                        res.json(await self.player.prevClip());
                        break;
                    case 'slot':
                        res.json(await self.player.setSlot(inNo));
                        break;
                    case 'info':
                        res.json(await self.player.slotInfo(inNo));
                        break;
                    default:
                        res.json({ code: 503, text: "unknown command" })
                        break;
                }
            }
            else {
                res.send({})
            }
        })

        app.get('/switcher/:command/:inAddOn?', async (req, res) => {
            const command = req.params.command
            const inAddOn = req.params.inAddOn
            if (self.properties.connected) {
                switch (command) {
                    case 'program':
                        res.json(await self.switcher.input(command, inAddOn));
                        break;
                    case 'preview':
                        res.json(await self.switcher.input(command, inAddOn));
                        break;
                    case 'cut':
                        res.json(await self.switcher.transition(command));
                        break;
                    case 'auto':
                        res.json(await self.switcher.transition(command));
                        break;
                    case 'inputs':
                        res.json(await self.switcher.inputs());
                        break;
                    default:
                        res.json({ code: 503, text: "unknown command" });
                        break;
                }
            }
            else {
                res.json({ code: 404, text: "switcher not connected" });
            }
        });

        app.use(express.static(__dirname + '/../device-ui/dist')); // Serves resources from public folder

        let server = app.listen(listenPort);
        console.log(`STUDIO :: Listening on port ${listenPort}`);
    }

    this.studioClient = IotDeviceClient.fromConnectionString(StudioConfig.deviceConnectionString, Protocol);

    const reportUpdate = function (inPatch) {
        self.studioTwin.properties.reported.update(inPatch, function (err) {
            if (err) throw err;
            console.log("STUDIO :: Twin updated", inPatch);
        });
    }

    function onConnect(err) {
        if (err) {
            console.error("STUDIO :: Could not connect " + err.message);
        } else {
            console.log("STUDIO :: Connected to Hub. ");
            // create device twin
            self.studioClient.getTwin(function (err, twin) {
                if (err) {
                    console.error("STUDIO :: could not synchronize twin");
                } else {
                    console.log("STUDIO :: Twin synchronized");
                    self.studioTwin = twin;
                    // 
                    // PLAYER Registration
                    if (self.player) {
                        self.player.init(StudioConfig.player, reportUpdate);
                        console.log("STUDIO :: Registering Device Method Handlers for Player");
                        // playClip  Method
                        self.studioClient.onDeviceMethod("playClip", async function (request, response) {
                            // paylod : { clip : , loop: }
                            if (request.payload && request.payload.clip) {
                                await self.player.playClip(request.payload.clip, request.payload.loop || false);
                                response.send(200, {
                                    player: {
                                        status: "play",
                                        playing: self.player.clips[request.payload.clip - 1]
                                    }
                                }, function (err) {
                                    if (err) {
                                        console.error(
                                            "An error ocurred when sending a method response:\n" + err.toString()
                                        );
                                    } else {
                                        console.log(
                                            "Response to method '" + request.methodName + "' sent successfully."
                                        );
                                    }
                                });
                            } else {
                                console.log("PLAYER :: Clip No is missing");
                            }
                        });
                        // stop Method
                        self.studioClient.onDeviceMethod("stop", async function (request, response) {
                            await self.player.stopClip().then(result => {
                                response.send(200, {
                                    player: {
                                        status: "stop",
                                        playing: ""
                                    }
                                }, function (err) {
                                    if (err) {
                                        console.error(
                                            "An error ocurred when sending a method response:\n" + err.toString()
                                        );
                                    } else {
                                        console.log(
                                            "Response to method '" + request.methodName + "' sent successfully."
                                        );
                                    }
                                });
                            }).catch(err => {
                                if (err.code = 107)
                                    response.send(503, {
                                        err
                                    }, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    });
                            })
                        });
                        // listClips Method
                        self.studioClient.onDeviceMethod("listClips", async function (request, response) {
                            await self.player.clips().then(clips => {
                                response.send(200, {
                                    clips
                                }, function (err) {
                                    if (err) {
                                        console.error(
                                            "An error ocurred when sending a method response:\n" + err.toString()
                                        );
                                    } else {
                                        console.log(
                                            "Response to method '" + request.methodName + "' sent successfully."
                                        );
                                    }
                                });
                            }).catch(err => {
                                if (err.code = 107)
                                    response.send(404, {
                                        err
                                    }, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    });
                            })
                        });
                        // slotInfo Method
                        self.studioClient.onDeviceMethod("slotInfo", async function (request, response) {
                            var slotInfos = {
                                slot: []
                            }
                            await hyperdeckClient.makeRequest("slot info: slot id: 1").then(async function (slotInfo) {
                                slotInfos.slot[0] = slotInfo.params;
                                await hyperdeckClient.makeRequest("slot info: slot id: 2").then(slotInfo => {
                                    slotInfos.slot[1] = slotInfo.params;
                                    response.send(200, slotInfos, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    })
                                })
                            })
                        });
                    }
                    // 
                    // ENCODER Registration
                    if (self.encoder) {
                        self.encoder.init(StudioConfig.encoder, self.studioTwin.properties.desired.encoder, reportUpdate);
                        // 
                        // Desired Property Change Handlers
                        console.log("STUDIO :: Registering Desired Proprties Update Handlers for Encoder");
                        self.studioTwin.on("properties.desired.encoder.startupScene", async function (delta) {
                            console.log("ENCODER :: Startup scene change received - " + delta);
                        });
                        self.studioTwin.on("properties.desired.encoder.stream.url", async function (delta) {
                            console.log("ENCODER:: Stream URL changed", delta);
                            self.encoder.setStreamInfo(delta);
                        });
                        self.studioTwin.on("properties.desired.encoder.stream.key", async function (delta) {
                            console.log("ENCODER :: Stream Key changed", delta);
                            self.encoder.setStreamInfo(null, delta);
                        });
                        self.studioTwin.on("properties.desired.encoder.address", async function (delta) {
                            let encoderAddress = self.studioTwin.properties.desired.encoder.address;
                            let encoderPassword = self.studioTwin.properties.desired.encoder.password;
                            console.log("ENCODER :: Encoder address changed ", delta, encoderAddress, encoderPassword);
                            if (self.encoderPreviousAddress != encoderAddress) {
                                self.encoderPreviousAddress = encoderAddress;
                                encoderAddress =
                                    self.studioTwin.properties.desired.encoder.address || StudioConfig.encoder.address;
                                encoderPassword =
                                    self.studioTwin.properties.desired.encoder.password || StudioConfig.encoder.password;
                                if (encoderRetryTimer._idleTimeout < 0) {
                                    console.log("ENCODER :: Connecting to new location")
                                    self.encoder.init(StudioConfig.encoder, self.studioTwin.properties.desired.encoder, reportUpdate);
                                }
                            } else if (!self.studioTwin.properties.reported.encoder.connected) {
                                console.log("ENCODER :: reconnect attemptto same address")
                                clearInterval(encoderRetryTimer);
                                self.encoder.init(StudioConfig.encoder, self.studioTwin.properties.desired.encoder, reportUpdate);
                            } else {
                                console.log("Twin :: Encoder :: no change in address")
                            }
                        });
                        //
                        // Device Method Handlers
                        console.log("STUDIO :: Registering Device Method Handlers for Encoder");
                        // getScenes method
                        self.studioClient.onDeviceMethod("getScenes",
                            async function (request, response) {
                                var slotInfos = {
                                    slot: []
                                }
                                self.encoder.scenes().then((studioSetup) => {
                                    // complete the response
                                    response.send(200, studioSetup, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    });
                                });
                            });
                        // setScene Method
                        self.studioClient.onDeviceMethod("setScene", async function (request, response) {
                            console.log(request.payload)
                            if (request.payload && request.payload.scene) {
                                console.log(
                                    "Encoder :: Changing scene to ",
                                    request.payload.scene
                                );
                                self.encoder.setScene(request.payload.scene).then((studioSetup) => {
                                    // complete the response
                                    response.send(200, studioSetup, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    });
                                });
                            } else {
                                response.send(503, {}, function (err) {
                                    if (err) {
                                        console.error(
                                            "An error ocurred when sending a method response:\n" + err.toString()
                                        );
                                    } else {
                                        console.log(
                                            "Response to method '" + request.methodName + "' sent successfully."
                                        );
                                    }
                                });
                            }
                        });
                        // stremStatus Method
                        self.studioClient.onDeviceMethod("streamStatus", async function (request, response) {
                            let statusResponse = await self.encoder.stream('status');
                            response.send(200, statusResponse, function (err) {
                                if (err) {
                                    console.error(
                                        "An error ocurred when sending a method response:\n" + err.toString()
                                    );
                                } else {
                                    console.log(
                                        "Response to method '" + request.methodName + "' sent successfully."
                                    );
                                }
                            });
                        });
                        // startStream Method
                        self.studioClient.onDeviceMethod("startStream", async function (request, response) {
                            if (request.payload) {
                                await self.encoder.stream('start').then(async (streamResult) => {
                                    await sleep(5000);
                                    await self.encoder.stream('status').then((streamStatus) => {
                                        if (streamStatus.streaming) {
                                            response.send(200, streamResult, function (err) {
                                                if (err) {
                                                    console.error(
                                                        "An error ocurred when sending a method response:\n" + err.toString()
                                                    );
                                                } else {
                                                    console.log(
                                                        "Response to method '" + request.methodName + "' sent successfully."
                                                    );
                                                    var patch = {
                                                        encoder: { streaming: true },
                                                    };
                                                    reportUpdate(patch)
                                                }
                                            });
                                        } else {
                                            response.send(503, streamStatus, function (err) {
                                                if (err) {
                                                    console.error(
                                                        "An error ocurred when sending a method response:\n" + err.toString()
                                                    );
                                                } else {
                                                    console.log(
                                                        "Response to method '" + request.methodName + "' sent successfully."
                                                    );
                                                    var patch = {
                                                        encoder: { streaming: false },
                                                    };
                                                    reportUpdate(patch)
                                                }
                                            })
                                        }

                                    })
                                }).catch((err) => {
                                    response.send(503, err, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    })
                                })
                            } else {
                                console.log("STUDIO :: Parmeters missing (startStream)");
                            }
                        });
                        // stopStream Method
                        self.studioClient.onDeviceMethod("stopStream", async function (request, response) {
                            await self.encoder.stream('stop').then(async (streamResult) => {
                                await sleep(5000);
                                await self.encoder.stream('status').then((streamStatus) => {
                                    if (!streamStatus.streaming) {
                                        response.send(200, streamStatus, function (err) {
                                            if (err) {
                                                console.error(
                                                    "An error ocurred when sending a method response:\n" + err.toString()
                                                );

                                            } else {
                                                console.log(
                                                    "Response to method '" + request.methodName + "' sent successfully."
                                                );
                                                var patch = {
                                                    encoderStreaming: false,
                                                };
                                                reportUpdate(patch)
                                            }
                                        });
                                    } else {
                                        response.send(503, streamStatus, function (err) {
                                            if (err) {
                                                console.error(
                                                    "An error ocurred when sending a method response:\n" + err.toString()
                                                );
                                            } else {
                                                console.log(
                                                    "Response to method '" + request.methodName + "' sent successfully."
                                                );
                                                var patch = {
                                                    encoderStreaming: true,
                                                };
                                                reportUpdate(patch)
                                            }
                                        })
                                    }
                                })
                            }).catch(err => {
                                response.send(503, err, function (err) {
                                    if (err) {
                                        console.error(
                                            "An error ocurred when sending a method response:\n" + err.toString()
                                        );
                                    } else {
                                        console.log(
                                            "Response to method '" + request.methodName + "' sent successfully."
                                        );
                                    }
                                })
                            })

                        });
                    }
                    // 
                    // SWITCHER Registration
                    if (self.switcher) {
                        self.switcher.init(StudioConfig.switcher, self.studioTwin.properties.desired.switcher || {}, reportUpdate);
                        // Switcher Handlers
                        console.log("STUDIO :: Registering Device Method Handlers for Switcher");

                        try {
                            self.studioClient.onDeviceMethod("doTransition", async function (request, response) {
                                if (request.payload && request.payload.type) {
                                    console.log(`SWITCHER :: Executing transition ${request.payload.type}`)
                                    self.switcher.transition(request.payload.type).then((transition) => {
                                        // complete the response
                                        response.send(200, transition, function (err) {
                                            if (err) {
                                                console.error(
                                                    "An error ocurred when sending a method response:\n" + err.toString()
                                                );
                                            } else {
                                                console.log(
                                                    "Response to method '" + request.methodName + "' sent successfully."
                                                );
                                            }
                                        });
                                    });
                                } else {
                                    response.send(503, {}, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    });
                                }
                            })
                        } catch (err) {
                            console.log("Device Method handler already registered")
                        }
                        try {
                            self.studioClient.onDeviceMethod("setInput", async function (request, response) {
                                if (request.payload && request.payload.type && request.payload.input) {
                                    console.log(`SWITCHER :: Setting ${request.payload.type} to Input ${request.payload.input}`)
                                    self.switcher.input(request.payload.type, request.payload.input).then((transition) => {
                                        // complete the response
                                        response.send(200, transition, function (err) {
                                            if (err) {
                                                console.error(
                                                    "An error ocurred when sending a method response:\n" + err.toString()
                                                );
                                            } else {
                                                console.log(
                                                    "Response to method '" + request.methodName + "' sent successfully."
                                                );
                                            }
                                        });
                                    });
                                } else {
                                    response.send(503, {}, function (err) {
                                        if (err) {
                                            console.error(
                                                "An error ocurred when sending a method response:\n" + err.toString()
                                            );
                                        } else {
                                            console.log(
                                                "Response to method '" + request.methodName + "' sent successfully."
                                            );
                                        }
                                    });
                                }
                            })
                        } catch (err) {
                            console.log("Device Method handler already registered")
                        }

                        // Switcher Twin Registrations
                        console.log("STUDIO :: Registering Twin Update Handlers for Switcher");
                        self.studioTwin.on("properties.desired.switcher.address", async function (delta) {
                            self.switcher.init(StudioConfig.switcher, self.studioTwin.properties.desired.switcher || {}, reportUpdate);
                            console.log("SWITCHER :: Switcher address changed ", delta, StudioConfig.switcher.address);
                        })
                        // self.studioTwin.on("properties.desired.switcher.currentProgram", async function (delta) {
                        //     await setInput(
                        //         self.switcher,
                        //         "program",
                        //         delta);
                        //     console.log("SWITCHER :: currentProgram changed", delta);
                        // });
                        // self.studioTwin.on("properties.desired.switcher.currentPreview", async function (delta) {
                        //     await setInput(
                        //         self.switcher,
                        //         "preview",
                        //         delta
                        //     );
                        //     console.log("SWITCHER :: currentPreview changed", delta);
                        // });
                    }
                }
            })
        }
    }


    startHttp(httpPort);

    this.startupStudio = function () {
        console.log(`STUDIO :: Starting up studio`)
        self.studioClient.open(onConnect);
    }

}

// EXPORTS
module.exports = {
    Studio: Studio
}