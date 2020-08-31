// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

"use strict";

var Studio = require("./config/startup.js");
var Player = require("./config/player.js");

const Protocol = require("azure-iot-device-mqtt").Mqtt;
// Uncomment one of these transports and then change it in fromConnectionString to test other transports
// const Protocol = require('azure-iot-device-amqp').AmqpWs;
// const Protocol = require("azure-iot-device-http").Http;
// const Protocol = require('azure-iot-device-amqp').Amqp;
// const Protocol = require("azure-iot-device-mqtt").MqttWs;

//  Studio Device - IoT Hub
//
const IotDeviceClient = require("azure-iot-device").Client;
const Message = require("azure-iot-device").Message;

// Encoder Device
//
const OBSWebSocket = require("obs-websocket-js");
const Encoder = new OBSWebSocket();
var encoderRegistered = false;

// Switcher Device
//
const {
  Atem
} = require("atem-connection");

const switcher = new Atem({
  externalLog: console.log
});

var switcherAvailableInputs = {};

// Player Device
//
var hyperdeck = require("hyperdeck-js-lib");
let hyperdeckClient;

var encoderRetryTimer = '';
var encoderHeartbeat = '';
let encoderClient = {}

var switcherReconnect = false;

var playerRetryTimer = '';

// String containing Hostname, Device Id & Device Key in the following formats:
//  "HostName=<iothub_host_name>;DeviceId=<device_id>;SharedAccessKey=<device_key>"
const deviceConnectionString =
  Studio.config.deviceConnectionString || process.env.DEVICE_CONNECTION_STRING;
var encoderAddress = "";
var encoderPreviousAddress = "";
var encoderPassword = "";
var switcherAddress = "";
var playerAddress = "";

let sendInterval;

var studioClient = null;
var globalTwin = null;

function main() {
  // open  connection to IoT Hub
  studioClient = IotDeviceClient.fromConnectionString(deviceConnectionString, Protocol);
  studioClient.open(onConnect);
}

// when connected ...
function onConnect(err) {
  if (err) {
    console.error("STUDIO :: Could not connect " + err.message);
  } else {
    console.log("STUDIO :: Connected to Hub. ");
    // create device twin
    studioClient.getTwin(function (err, twin) {
      if (err) {
        console.error("STUDIO :: could not synchronize twin");
      } else {
        console.log("STUDIO :: Twin synchronized");

        globalTwin = twin;

        startHttp();

        encoderAddress =
          process.env.ENCODER_ADDRESS || globalTwin.properties.desired.encoder.address || Studio.config.encoder.address;
        encoderPassword =
          process.env.ENCODER_PASSWORD || globalTwin.properties.desired.encoder.password || Studio.config.encoder.password;
        switcherAddress =
          process.env.SWITCHER_ADDRESS || globalTwin.properties.desired.switcher.address || Studio.config.switcher.address;
        playerAddress =
          process.env.PLAYER_ADDRESS || globalTwin.properties.desired.player.address || Studio.config.player.address;

        console.log("STUDIO :: Desired Properties - ", twin.properties.desired);

        // reporting initial status
        var patch = {
          encoderConnected: false,
          playerConnected: false,
          switcherConnected: false,
        };

        twin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("STUDIO :: Initial state reported");
        });

        // SWITCHER

        connectSwitcher();

        // ENCODER
        // connectEncoder();

        // PLAYER
        connectPlayer();

        //
        //
        // register handlers for all the method names we are interested in
        //
        //

        console.log("STUDIO :: Registering Device Method Handlers ");

        // Studio Handlers
        studioClient.onDeviceMethod("studioReady", onStudioReady);
      }
    });
  }
}

/* 
 ****************************************************************
 ***
 *** STUDIO EQUIPMENT FUNCTIONALITY
 ***
 */


/*
...
... ENCODER
...
*/

function connectEncoder() {

  if (!encoderRegistered) {
    // Encoder Twin Registrations
    console.log("STUDIO :: Registering Twin Update Handlers for Encoder");

    globalTwin.on("properties.desired.encoder.startupScene", async function (delta) {
      console.log("Twin :: Encoder :: startup scene change received - " + delta);
    });
    globalTwin.on("properties.desired.encoder.stream.url", async function (delta) {
      console.log("Twin :: Encoder :: Stream URL changed", delta);
      setStreamInfo(delta);
    });
    globalTwin.on("properties.desired.encoder.stream.key", async function (delta) {
      console.log("Twin :: Encoder :: Stream Key changed", delta);
      setStreamInfo(null, delta);
    });
    globalTwin.on("properties.desired.encoder.address", async function (delta) {
      console.log("Twin :: Encoder :: Encoder address changed ", delta, encoderAddress, encoderPassword);
      if (encoderPreviousAddress != encoderAddress) {
        encoderPreviousAddress = encoderAddress;
        encoderAddress =
          process.env.ENCODER_ADDRESS || globalTwin.properties.desired.encoder.address || Studio.config.encoder.address;
        encoderPassword =
          process.env.ENCODER_PASSWORD || globalTwin.properties.desired.encoder.password || Studio.config.encoder.password;
        if (encoderRetryTimer._idleTimeout < 0) {
          console.log("Twin :: Encoder :: Connecting to new location")
          disconnectEncoder()
          connectEncoder();
        }
      } else if (!globalTwin.properties.reported.encoderConnected) {
        console.log("Twin :: Encoder :: reconnect attemptto same address")
        clearInterval(encoderRetryTimer);
        connectEncoderRoutine();
      } else {
        console.log("Twin :: Encoder :: no change in address")
      }
    });

    // Encoder Handlers
    console.log("STUDIO :: Registering Device Method Handlers for Encoder");

    studioClient.onDeviceMethod("getScenes", onGetScenes);
    studioClient.onDeviceMethod("setScene", onSetScene);
    studioClient.onDeviceMethod("streamStatus", onStreamStatus);
    studioClient.onDeviceMethod("startStream", onStartStream);
    studioClient.onDeviceMethod("stopStream", onStopStream);
    encoderRegistered = true;
  }
  connectEncoderRoutine();
}

function connectEncoderRoutine() {
  var patch = {
    encoderStreaming: false,
    encoderRecording: false,
  };

  // send the patch for encoder delta initial state
  globalTwin.properties.reported.update(patch, function (err) {
    if (err) throw err;
    console.log("Encoder :: initial state reported - encoder connecting ... ", patch.encoderConnected);
  });

  encoderRetryTimer = setInterval(() => {
    console.log(`Encoder :: Connection attempt`);
    encoderClient = Encoder.connect({
      address: encoderAddress,
      password: encoderPassword,
    })
      .then(async () => {
        console.log(`Encoder :: connected`);
        clearInterval(encoderRetryTimer);

        encoderHeartbeat = setInterval(() => {
          getStats()
        }, 5000);
        var patch = {
          encoderConnected: true,
        };
        // send the patch
        globalTwin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("Encoder :: state reported - encoderConnected ", patch.encoderConnected);
        });

        await stream('status')
          .then((encoderStatus) => {
            var patch = {
              encoderStreaming: encoderStatus.streaming,
              encoderRecording: encoderStatus.recording,
              encoderConnected: true,
            };
            // send the patch
            globalTwin.properties.reported.update(patch, function (err) {
              if (err) throw err;
              console.log("Encoder :: state reported - encoderConnected ", patch.encoderConnected);
            });

            setScene(globalTwin.properties.desired.encoder.startupScene || Studio.config.encoder.startupScene).then((result) => {
              console.log("Encoder :: ready -- ", globalTwin.properties.desired.encoder.startupScene, Studio.config.encoder.startupScene);
            });
          })
      })
      .catch((error) => {
        console.log("Encoder :: Connection error ", encoderAddress, error);
        clearInterval(encoderRetryTimer);

        var patch = {
          encoderConnected: false,
        };
        // send the patch
        globalTwin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("Encoder :: state reported - encoderConnected ", patch.encoderConnected);
        });
      });
  }, 10000)
}

function disconnectEncoder() {
  clearInterval(encoderHeartbeat);
  clearInterval(encoderRetryTimer);
  Encoder.disconnect();
  var patch = {
    encoderConnected: false,
  };
  // send the patch
  globalTwin.properties.reported.update(patch, function (err) {
    if (err) throw err;
    console.log("Encoder :: state reported - encoderConnected ", patch.encoderConnected);
  });
}

/*
...
... SWITCHER
...
*/

function connectSwitcher() {

  console.log("SWITCHER :: Address " + switcherAddress);
  switcher.connect(switcherAddress);

  // Switcher Handlers
  try {
    studioClient.onDeviceMethod("doTransition", onTransition)
  } catch (err) {
    console.log("Device Method handler already registered")
  }
  // Switcher Twin Registrations
  console.log("STUDIO :: Registering Twin Update Handlers for Switcher");
  globalTwin.on("properties.desired.switcher.address", async function (delta) {
    switcherAddress =
      process.env.SWITCHER_ADDRESS || globalTwin.properties.desired.switcher.address || Studio.config.switcher.address;
    switcher.connect(switcherAddress);

    console.log("Twin :: Encoder :: Switcher address changed ", delta, switcherAddress);
  })
  globalTwin.on("properties.desired.switcher.currentProgram", async function (delta) {
    await setInput(
      switcher,
      "program",
      delta,
      globalTwin
    );
    console.log("Twin :: Encoder :: currentProgram changed", delta);
  });
  globalTwin.on("properties.desired.switcher.currentPreview", async function (delta) {
    await setInput(
      switcher,
      "preview",
      delta,
      globalTwin
    );
    console.log("Twin :: Encoder :: currentPreview changed", delta);
  });
}

switcher.on("disconnected", () => {
  console.log("SWITCHER :: disconnected");
  var patch = {
    switcherConnected: false,
  };

  // send the patch
  globalTwin.properties.reported.update(patch, function (err) {
    if (err) throw err;
    console.log("SWITCHER :: state reported");
  });
});

switcher.on("connected", () => {
  var patch = {}

  connectEncoder();

  if (!switcherReconnect) {
    console.log("SWITCHER :: connected");

    // set switcher to bars as initial input
    setInput(
      switcher,
      "program",
      globalTwin.properties.desired.switcher.startupProgram,
      globalTwin
    );

    globalTwin.properties.desired.switcher.currentProgram = null;

    setInput(
      switcher,
      "preview",
      globalTwin.properties.desired.switcher.startupPreview,
      globalTwin
    );

    globalTwin.properties.desired.switcher.currentPreview = null;

    console.log("SWITCHER :: startup inputs set", globalTwin.properties.desired.switcher.startupPreview, globalTwin.properties.desired.switcher.startupProgram)

    patch = {
      switcherConnected: true,
      switcherProgram: globalTwin.properties.desired.switcher.startupProgram,
      switcherPreview: globalTwin.properties.desired.switcher.startupPreview,
    };

    switcherReconnect = true;

  } else {
    console.log("SWITCHER :: connection restablished");

    patch = {
      switcherConnected: true,
    };
  }

  // send the patch
  globalTwin.properties.reported.update(patch, function (err) {
    if (err) throw err;
    console.log("SWITCHER :: state reported");
  });
  // console.log(myAtem.state.inputs);
});


/*
...
... PLAYER
...
*/


function connectPlayer() {

  hyperdeckClient = new hyperdeck.Hyperdeck(
    Studio.config.player.address
  );

  hyperdeckClient.onConnected().then(async function () {
    console.log("PLAYER :: connected");

    hyperdeckClient.getNotifier().on("connectionLost", async function () {
      console.error("PLAYER :: Connection lost.");
      var patch = {
        playerConnected: false,
      };

      // send the patch
      globalTwin.properties.reported.update(patch, function (err) {
        if (err) throw err;
        console.log("PLAYER :: state reported");
      });

      hyperdeckClient = new hyperdeck.Hyperdeck(
        Studio.config.player.address
      );
    });

    await getClips()
      .then((hyperdeckClips) => {
        Player.clips = hyperdeckClips;
        console.log("PLAYER :: Clips ", Player.clips);
      })
      .catch((error) => {
        console.log("PLAYER :: no clips or disk ", error);
      });

    var patch = {
      playerConnected: true,
    };


    // Player Handlers
    studioClient.onDeviceMethod("playClip", onPlayClip);
    studioClient.onDeviceMethod("stop", onStop);
    studioClient.onDeviceMethod("listClips", onListClips);

    studioClient.onDeviceMethod("slotInfo", onSlotInfo);
    // Encoder Twin Registrations
    console.log("STUDIO :: Registering Twin Update Handlers for Player");
    globalTwin.on("properties.desired.player.address", async function (delta) {
      playerAddress =
        process.env.PLAYER_ADDRESS || globalTwin.properties.desired.player.address || Studio.config.player.address;
      // Hyperdeck has "connectionLost" event, just setting new connection. 
      console.log("Twin :: Player address changed ", delta, playerAddress);
    });

    // send the patch
    globalTwin.properties.reported.update(patch, function (err) {
      if (err) throw err;
      console.log("PLAYER :: state reported");
    });

  });
}

/*
 **
 ** REMOTE METHODS HANDLERS
 **
 **
 */


async function onTransition(request, response) {
  console.log(request.payload)
  if (request.payload && request.payload.type) {
    console.log(
      "SWITCHER :: Transition ",
      request.payload.type
    );
    doTransition(switcher, request.payload.type).then((transition) => {
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
}


async function onSetScene(request, response) {
  console.log(request.payload)
  if (globalTwin.properties.reported.encoderConnected) {
    if (request.payload && request.payload.scene) {
      console.log(
        "Encoder :: Changing scene to ",
        request.payload.scene
      );
      setScene(request.payload.scene).then((studioSetup) => {
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
  }
}

async function onGetScenes(request, response) {
  var slotInfos = {
    slot: []
  }
  if (globalTwin.properties.reported.encoderConnected) {
    getSceneList().then((studioSetup) => {
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
}

async function onSlotInfo(request, response) {
  var slotInfos = {
    slot: []
  }
  console.log("PLAYER :: fetching slot info")
  await hyperdeckClient.makeRequest("slot info: slot id: 1").then(async function (slotInfo) {
    console.log(
      "Player :: Get slot 1 info "
    );
    slotInfos.slot[0] = slotInfo.params;
    await hyperdeckClient.makeRequest("slot info: slot id: 2").then(slotInfo => {
      console.log(
        "Player :: Get slot 2 info "
      );
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
}


async function onPlayClip(request, response) {
  console.debug(request);
  if (request.payload && request.payload.clip) {
    play(request.payload.clip, request.payload.loop || false);
    response.send(200, {
      player: {
        status: "stop",
        playing: Player.clips[request.payload.clip - 1]
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
    console.log("PLAYER :: Invalid Clip No. ");
  }
}

async function onStop(request, response) {
  await playerStop().then(result => {
    console.log(
      "Player :: Stop playback "
    );

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

}

async function onListClips(request, response) {
  await getClips().then(clips => {
    console.log(
      "Player :: Get Clip List ",
      JSON.stringify(clips)
    );

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

}

async function onStudioReady(request, response) {
  if (request.payload && request.payload.scene) {
    //
  }
  Encoder.getSceneList().then((studioSetup) => {
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
}

async function onStreamStatus(request, response) {
  if (request.payload && request.payload.status) {
    console.log(
      "Encoder :: Changing stream status to ",
      request.payload.status
    );
    await stream(request.payload.status);
  }
  response.send(200, request.payload, function (err) {
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function onStartStream(request, response) {
  console.debug(request);
  if (request.payload) {
    await stream('start').then(async (streamResult) => {
      await sleep(5000);
      await stream('status').then((streamStatus) => {
        console.log("encoder :: streaming retrieved ", streamStatus)
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
                encoderStreaming: true,
              };

              // send the patch
              globalTwin.properties.reported.update(patch, function (err) {
                if (!!err) throw err;
                console.log("ENCODER :: Stream started");
              });
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
                encoderStreaming: false,
              };

              // send the patch
              globalTwin.properties.reported.update(patch, function (err) {
                if (!!err) throw err;
                console.log("ENCODER :: Stream stopped");
              });
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
    console.log("ENCODER :: Parmeters missing (startStream)");
  }
}

async function onStopStream(request, response) {
  if (request.payload) {
    await stream('stop').then(async (streamResult) => {
      await sleep(5000);
      await stream('status').then((streamStatus) => {
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

              // send the patch
              globalTwin.properties.reported.update(patch, function (err) {
                if (!!err) throw err;
                console.log("ENCODER :: Stream stopped");
              });
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

              // send the patch
              globalTwin.properties.reported.update(patch, function (err) {
                if (!!err) throw err;
                console.log("ENCODER :: Stream stopped");
              });
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
  } else {
    console.log("ENCODER :: Parmeters missing (startStream)");
  }
}

/*
 **
 ** SWITCHER CODE
 **
 **
 */

switcher.on("stateChanged", async function (err, state) {

  var patch = {};

  if (state.startsWith("inputs")) {
    console.log("SWITCHER :: INITIAL STATE -- ", state.split('.'))
    switcherAvailableInputs[state.split('.')[1]] = true;
  }

  switch (state) {
    case "video.ME.0.previewInput": {
      patch.switcherPreview = switcher.listVisibleInputs("preview")[0];
      console.log("SWITCHER :: State received ", state)
      break;
    }
    case "video.ME.0.programInput": {
      patch.switcherProgram = switcher.listVisibleInputs("program")[0];
      console.log("SWITCHER :: State received ", state)
      break;
    }
  }
  if (state == "video.ME.0.previewInput" || state == "video.ME.0.programInput") {
    // send the patch
    await globalTwin.properties.reported.update(patch, function (err) {
      if (!!err) throw err;
      console.log("SWITCHER :: State reported ", state, patch);
    });
  }
});

async function setInput(inSwitcher, inChannel, inInput, inTwin) {
  console.log(inInput.length)
  console.log("SWITCHER :: switching input " + inChannel);
  switch (inChannel) {
    case "program":
      await inSwitcher
        .changeProgramInput(inInput)
        .then((res) => {
          var patch = {
            switcherProgram: inInput,
          };

          // send the patch
          inTwin.properties.reported.update(patch, function (err) {
            if (!!err) throw err;
            console.log("SWITCHER :: Program changed to " + inInput);
          });
        })
        .catch((error) => {
          console.log("SWITCHER :: Error ", error);
        });
      break;
    case "preview":
      await inSwitcher
        .changePreviewInput(inInput)
        .then((res) => {
          var patch = {
            switcherPreview: inInput,
          };

          // send the patch
          inTwin.properties.reported.update(patch, function (err) {
            if (!!err) throw err;
            console.log("SWITCHER :: Preview changed to " + inInput);
          });
        })
        .catch((error) => {
          console.log("SWITCHER :: Error ", error);
        });
      break;
    default:
      console.log("SWITCHER :: setInput :: Invalid Input");
  }

}

async function doTransition(inSwitcher, inType) {
  console.log("SWITCHER :: transition  " + inType);
  switch (inType) {
    case "cut":
      await inSwitcher
        .cut()
        .then((res) => {

          console.log("SWITCHER :: Transition executed");

        })
        .catch((error) => {
          console.log("SWITCHER :: Error", error);
        });
      break;
    case "auto":
      await inSwitcher
        .autoTransition()
        .then((res) => {

          console.log("SWITCHER :: Transition executed");

        })
        .catch((error) => {
          console.log("SWITCHER :: Error", error);
        });
      break;
    default:
      console.log("SWITCHER :: Transition :: Invalid type");
  }

}

/*
 **
 ** ENCODER CODE
 **
 **
 */

function getSceneList() {
  return Encoder.send("GetSceneList");
}

async function setScene(inScene) {
  var patch = {
    currentScene: inScene,
  };

  // send the patch
  globalTwin.properties.reported.update(patch, function (err) {
    if (!!err) throw err;
    console.log("ENCODER :: Scene changed to " + inScene);
  });

  return await Encoder.send("SetCurrentScene", {
    "scene-name": inScene,
  }).catch((error) => {
    console.log(error);
  });
}

async function getStats() {
  return await Encoder.send("GetStats").catch(error => {
    console.log(error);
    if (error.code == "CONNECTION_ERROR" || error.code == "NOT_CONNECTED") {
      clearInterval(encoderHeartbeat);
      connectEncoderRoutine();
    }
  })
}
async function setStreamInfo(inUrl = null, inKey = null) {
  var settings = {
    settings: {}
  };
  if (inUrl) {
    settings.settings["server"] = inUrl;
  }
  if (inKey) {
    settings.settings["key"] = inKey;
  }
  console.log(settings);
  return await Encoder.send("SetStreamSettings", settings).catch((error) => {
    console.log(error);
  });
}



async function stream(inCommand) {
  switch (inCommand) {
    case "start":
      console.log("ENCODER :: Starting Stream");
      return Encoder.send("StartStreaming", {});
      break;
    case "stop":
      console.log("ENCODER :: Stopping Stream");
      return Encoder.send("StopStreaming", {});
      break;
    case "status":
      console.log("ENCODER :: Streaming status");
      return Encoder.send("GetStreamingStatus", {});
      break;
  }
}

Encoder.on("SwitchScenes", (data) => {
  console.log(`Encoder :: New Active Scene: ${data.sceneName}`);
  // create a patch to send to the hub
  var patch = {
    currentScene: data.sceneName,
  };

  // send the patch
  globalTwin.properties.reported.update(patch, function (err) {
    if (err) throw err;
    console.log("Encoder :: scene changed");
  });
});

/*
 **
 ** PLAYER CODE
 **
 **
 */

async function getClips() {
  var clips = await hyperdeckClient.clipsGet();
  let clipCount = clips.params["clip count"];
  let hyperdeckClips = [];
  for (var i = 1; i <= clipCount; i++) {
    hyperdeckClips.push(clips.params[i.toString()]);
  }
  return hyperdeckClips;
}

async function setClip(inClipNo) {
  var clips = await hyperdeckClient.clipsGet();
  let clipCount = clips.params["clip count"];
  let hyperdeckClips = [];
  for (var i = 1; i <= clipCount; i++) {
    hyperdeckClips.push(clips.params[i.toString()]);
  }
  return hyperdeckClips;
}

async function slotInfo() {
  await hyperdeckClient
    .makeRequest("slot info")
    .then((response) => {
      return response
    })
    .catch((error) => {
      console.log(error);
    });
}

async function play(inClipNo, inLoop = false) {
  if (inClipNo) {
    hyperdeckClient
      .makeRequest("playrange set: clip id: " + inClipNo)
      .then((response) => {
        hyperdeckClient.makeRequest("play: loop: " + inLoop).then((result) => {
          console.log("PLAYER :: Play ", inClipNo, inLoop ? "Loop" : "No Loop");
        });
      })
      .catch((error) => {
        console.log(error);
      });
  } else {
    hyperdeckClient
      .makeRequest("playrange clear")
      .then((response) => {
        hyperdeckClient.makeRequest("play: loop: " + inLoop).then((result) => {
          console.log("PLAYER :: Play ", inClipNo, inLoop ? "Loop" : "No Loop");
        });
      })
      .catch((error) => {
        console.log(error);
      });
  }
}

function playerStop() {
  hyperdeckClient.stop();
}

function playerNextClip() {
  hyperdeckClient.nextClip();
}

function playerPrevClip() {
  hyperdeckClient.prevClip();
}

async function slotInfo() {
  await hyperdeckClient
    .makeRequest("slot info")
    .then((response) => {
      return response
    })
    .catch((error) => {
      console.log(error);
    });
}

function slotInfo(inSlot) {
  return hyperdeckClient.slotInfo(inSlot);
}

/*
 **
 ** HTTP SERVER START
 **
 **
 */

function startHttp() {
  var express = require('express');
  var app = express();
  var cors = require('cors')

  // setting middleware

  app.use(cors())

  app.get('/studio', (req, res) => {
    res.send(globalTwin.properties,);
  });

  app.get('/switcher/inputs', (req, res) => {
    var inputList = [];
    for (var i in switcherAvailableInputs) {
      inputList.push(i)
    }
    res.send(inputList);
  })

  app.get('/set/:channel/:input', (req, res) => {
    const channel = req.params.channel;
    const input = req.params.input;
    setInput(
      switcher,
      channel,
      input, globalTwin);
    console.log(`SWITCHER :: Setting ${channel} to ${input}`)
    res.send({ channel, input });
  })

  app.get('/switch/:transition', (req, res) => {
    const transition = req.params.transition;

    doTransition(switcher, transition)

    console.log(`SWITCHER :: Transition ${transition}`)

    res.send({ transition });
  })

  app.get('/connect/:component', (req, res) => {
    const inComponent = req.params.component || "";
    switch (inComponent) {
      case 'encoder':
        break;
      case 'player':
        break;
      case 'switcher':
        break;
      default:
        break;
    }
    res.send(inComponent);
  });

  app.use(express.static(__dirname + '/device-ui/dist')); //Serves resources from public folder
  var server = app.listen(process.env.PORT || 80);
}

/*
 **
 ** MAIN METHOD START
 **
 **
 */
// get the app rolling
main();