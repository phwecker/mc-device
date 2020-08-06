// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

"use strict";

const Protocol = require("azure-iot-device-mqtt").Mqtt;

// Uncomment one of these transports and then change it in fromConnectionString to test other transports
// const Protocol = require('azure-iot-device-amqp').AmqpWs;
// const Protocol = require("azure-iot-device-http").Http;
// const Protocol = require('azure-iot-device-amqp').Amqp;
// const Protocol = require("azure-iot-device-mqtt").MqttWs;

const Client = require("azure-iot-device").Client;
const Message = require("azure-iot-device").Message;

const obs = require("./components/modules/obs.js");
const hyperdeck = require("./components/modules/hyperdeck.js");
const atem = require("./components/modules/atem.js");

// String containing Hostname, Device Id & Device Key in the following formats:
//  "HostName=<iothub_host_name>;DeviceId=<device_id>;SharedAccessKey=<device_key>"
const deviceConnectionString =
  process.env.DEVICE_CONNECTION_STRING ||
  "HostName=phwecker-iot-stream.azure-devices.net;DeviceId=studio-device;SharedAccessKey=iKkICwNUwvxuPEOKw0K8T2INlLY4lG2JP2o9eSiKFP4=";
let sendInterval;

var client = null;
var globalTwin = null;

async function main() {
  // open a connection to the device
  client = Client.fromConnectionString(deviceConnectionString, Protocol);
  client.open(onConnect);
}

async function onConnect(err) {
  if (!!err) {
    console.error("Could not connect: " + err.message);
  } else {
    console.log("Connected to device. Registering handlers for methods.");
    // create device twin
    client.getTwin(async function (err, twin) {
      if (err) {
        console.error("could not get twin");
      } else {
        console.log("twin created");

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

        // connecting encoder
        console.log("OBS :: connecting ...");
        obs.setTwin(twin);

        var obsSession = await obs.init("192.168.1.102:4444", "");

        // connecting player
        console.log("HYPERDECK :: connecting ...");
        hyperdeck.setTwin(twin);
        await hyperdeck.init("192.168.1.116");

        let clipsRecord = await hyperdeck.getClips();
        let clips = { clips: clipsRecord.params };

        // connecting switcher
        atem.setTwin(twin);
        atem.setAtemAddress("192.168.1.200");
        atem.init().then((result) => {
          console.log("ATEM :: Test ", result);
        });
        // Twin Property Update Handlers
        twin.on("properties.desired.currentScene", async function (delta) {
          console.log("OBS :: scene change received - " + delta);
          await obs.setScene(delta).catch((error) => {
            console.log(error);
          });
        });
      }
    });
    // register handlers for all the method names we are interested in
    client.onDeviceMethod("studioReady", onStudioReady);
  }
}

async function onStudioReady(request, response) {
  console.log(request.payload);

  if (request.payload && request.payload.scene) {
    await obs.setScene(request.payload.scene);
  }
  obs.getSceneList().then((studioSetup) => {
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

// get the app rolling
main();
