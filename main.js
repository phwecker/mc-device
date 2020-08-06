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
const Client = require("azure-iot-device").Client;
const Message = require("azure-iot-device").Message;

// Encoder Device
//
const OBSWebSocket = require("obs-websocket-js");
const Encoder = new OBSWebSocket();

// Switcher Device
//
const { Atem } = require("atem-connection");
const switcher = new Atem({ externalLog: console.log });

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
console.log(deviceConnectionString)
var encoderAddress = ""
var encoderPassword = "";
var switcherAddress = "";
var playerAddress = "";

let sendInterval;

var client = null;
var globalTwin = null;

async function main() {
  // open a connection to the device
  client = Client.fromConnectionString(deviceConnectionString, Protocol);
  client.open(onConnect);
}

function connectEncoder() {
  encoderRetryTimer = setInterval(() => {
    encoderClient = Encoder.connect({
      address: encoderAddress,
      password: encoderPassword,
    })
      .then(() => {
        console.log(`Encoder :: connected`);
        clearInterval(encoderRetryTimer);
        encoderHeartbeat = setInterval(() => { getStats() }, 5000);
        var patch = {
          encoderConnected: true,
        };
        // send the patch
        globalTwin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("Encoder :: state reported");
        });

        setScene(globalTwin.properties.desired.encoder.startupScene || Studio.config.encoder.startupScene).then((result) => {
          console.log("Encoder :: ready -- ", globalTwin.properties.desired.encoder.startupScene, Studio.config.encoder.startupScene);
        });
      })
      .catch((error) => {
        console.log("Encoder :: Connection error", error);
        var patch = {
          encoderConnected: false,
        };
        // send the patch
        globalTwin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("Encoder :: state reported");
        });
      });
  }, 5000)
}

function onConnect(err) {
  if (!!err) {
    console.error("Could not connect: " + err.message);
  } else {
    console.log("Connected to device. Registering handlers for methods.");
    // create device twin
    client.getTwin(async function (err, twin) {
      if (err) {
        console.error("could not get twin");
      } else {
        console.log("STUDIO :: twin created");

        globalTwin = twin;

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

        // ENCODER

        connectEncoder();

        // SWITCHER

        console.log("SWITCHER :: Address " + switcherAddress);
        switcher.connect(switcherAddress);

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
              switcherProgram: 1000,
              switcherPreview: 1000,
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

        // PLAYER
        hyperdeckClient = await new hyperdeck.Hyperdeck(
          Studio.config.player.address
        );

        await hyperdeckClient.onConnected().then(async function () {
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

          // send the patch
          globalTwin.properties.reported.update(patch, function (err) {
            if (err) throw err;
            console.log("PLAYER :: state reported");
          });

          // playerRetryTimer = setInterval(async function () {
          //   await getClips()
          //     .then((hyperdeckClips) => {
          //       Player.clips = hyperdeckClips;
          //       console.log("PLAYER :: Clips ", Player.clips);
          //     }).catch(error => { console.log(error) })
          // }, 3000)

        });
        // Twin Property Update Handlers
        twin.on("properties.desired.startupScene", async function (delta) {
          console.log("Encoder :: startup scene change received - " + delta);
        });

        twin.on("properties.desired.encoder.stream.url", async function (delta) {
          console.log("Encoder :: Stream URL changed", delta);
          setStreamInfo(delta);
        });
        twin.on("properties.desired.encoder.stream.key", async function (delta) {
          console.log("Encoder :: Stream Key changed", delta);
          setStreamInfo(null, delta);
        });
        twin.on("properties.desired.switcher.currentProgram", async function (delta) {
          await setInput(
            switcher,
            "program",
            delta,
            globalTwin
          );
          console.log("Encoder :: currentProgram changed", delta);

        });
        twin.on("properties.desired.switcher.currentPreview", async function (delta) {
          await setInput(
            switcher,
            "preview",
            delta,
            globalTwin
          );
          console.log("Encoder :: currentPreview changed", delta);

        });
      }
    });
    //
    //
    // register handlers for all the method names we are interested in
    //
    //
    // Studio Handlers
    client.onDeviceMethod("studioReady", onStudioReady);

    // Player Handlers
    client.onDeviceMethod("playClip", onPlayClip);
    client.onDeviceMethod("stop", onStop);
    client.onDeviceMethod("listClips", onListClips);

    client.onDeviceMethod("slotInfo", onSlotInfo);

    // Switcher Handlers
    client.onDeviceMethod("doTransition", onTransition)

    // Encoder Handlers
    client.onDeviceMethod("getScenes", onGetScenes);
    client.onDeviceMethod("setScene", onSetScene);
    client.onDeviceMethod("streamStatus", onStreamStatus);
    client.onDeviceMethod("startStream", onStartStream);
    client.onDeviceMethod("stopStream", onStopStream);

  }
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
  var slotInfos = { slot: [] }
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
  var slotInfos = { slot: [] }
  console.log(await slotInfo());
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
        status: "stop", playing: Player.clips[request.payload.clip - 1]
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

    response.send(200, { player: { status: "stop", playing: "" } }, function (err) {
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
      response.send(503, { err }, function (err) {
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

    response.send(200, { clips }, function (err) {
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
      response.send(404, { err }, function (err) {
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
    stream(request.payload.status);
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

async function onStartStream(request, response) {
  console.debug(request);
  if (request.payload) {
    var streamResult = await stream('start')
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
    console.log("ENCODER :: armeters missing (startStream)");
  }
}

async function onStopStream(request, response) {
  console.debug(request);
  if (request.payload) {
    var streamResult = await stream('stop');
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
    console.log("ENCODER :: parmeters missing (stopStream)");
  }
}

/*
 **
 ** SWITCHER CODE
 **
 **
 */

switcher.on("stateChanged", async function (err, state) {
  // console.log(state);
  // console.debug(
  //   "SWITCHER :: Current Program ",
  //   switcher.listVisibleInputs("program")[0],
  //   switcher.listVisibleInputs("preview")[0]
  // );
  console.log("SWITCHER :: State received ", state)
  var patch = {
  };

  switch (state) {
    case "video.ME.0.previewInput": {
      patch.switcherPreview = switcher.listVisibleInputs("preview")[0];
      break;
    }
    case "video.ME.0.programInput": {
      patch.switcherProgram = switcher.listVisibleInputs("program")[0];
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
          console.log("SWITCHER :: Error", error);
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
          console.log("SWITCHER :: Error", error);
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
      connectEncoder();
    }
  })
}
async function setStreamInfo(inUrl = null, inKey = null) {
  var settings = { settings: {} };
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
      return await Encoder.send("StartStreaming", {});
      break;
    case "stop":
      console.log("ENCODER :: Stopping Stream");
      return await Encoder.send("StopStreaming", {});
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
 ** MAIN METHOD START
 **
 **
 */
// get the app rolling
main();
