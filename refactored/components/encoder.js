//
// ECODER CODER
//

function Encoder() {
  const OBSWebSocket = require("obs-websocket-js");
  const Encoder = new OBSWebSocket();

  this.encoderRegistered = false;

  this.properties = {
    connected: false
  }

  this.scenes = function () {
    return getSceneList();
  }

  this.setScene = function (inScene) {
    return setScene(inScene)
  }

  this.setStreamInfo = function (inUrl, inKey) {
    return setStreamInfo(inUrl, inKey)
  }

  this.stream = function (inCommand) {
    return stream(inCommand)
  }

  let self = this;

  this.init = function (inEncoderConfig, inEncoderStartup, inReportUpdate) {
    console.log(`ENCODER :: Init`);
    self.config = inEncoderConfig;
    self.startupConfig = inEncoderStartup;
    self.reportUpdate = inReportUpdate;

    connectEncoderRoutine();
  }

  function connectEncoderRoutine() {
    encoderRetryTimer = setInterval(() => {
      console.log(`ENCODER :: Connection attempt`);
      encoderClient = Encoder.connect({
        address: self.config.address,
        password: self.config.password,
      })
        .then(async () => {
          console.log(`ENCODER :: connected`);
          clearInterval(encoderRetryTimer);

          encoderHeartbeat = setInterval(async () => {
            await getStats()
          }, 5000);

          self.properties.connected = true;
          let patch = {
            encoder: self.properties,
          };
          self.reportUpdate(patch);

          await stream('status')
            .then((encoderStatus) => {
              setScene(self.startupConfig.startupScene || self.config.startupScene).then((result) => {

                self.properties.connected = true;
                self.properties.streaming = encoderStatus.streaming;
                self.properties.recording = encoderStatus.recording;
                let patch = {
                  encoder: self.properties,
                };
                self.reportUpdate(patch);

                setStreamInfo(self.startupConfig.stream.url || self.config.stream.url, self.startupConfig.stream.key || self.config.stream.key)
                console.log("ENCODER :: ready ");
              });
            })
        })
        .catch((error) => {
          console.log("ENCODER :: Connection error ", self.config.address, error);
          clearInterval(encoderRetryTimer);
        });
    }, 10000)
  }

  // OPERATIONS 
  //

  // Get Stats
  async function getStats() {
    return await Encoder.send("GetStats").catch(error => {
      console.log(error);
      if (error.code == "CONNECTION_ERROR" || error.code == "NOT_CONNECTED") {
        clearInterval(encoderHeartbeat);
        connectEncoderRoutine();
      }
    })
  }

  // Set Streaming Information
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
  // Chagne Stream Status
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
  // Get Scenes 
  function getSceneList() {
    return Encoder.send("GetSceneList");
  }
  // Set Scene 
  function setScene(inScene) {
    var patch = {
      encoder: { currentScene: inScene },
    };
    self.reportUpdate(patch);
    return Encoder.send("SetCurrentScene", {
      "scene-name": inScene,
    }).catch((error) => {
      console.log(error);
    });
  }

  // EVENT HANDLERS
  //

  // Scene Switched
  Encoder.on("SwitchScenes", (data) => {
    console.log(`Encoder :: New Active Scene: ${data.sceneName}`);
    // create a patch to send to the hub
    var patch = {
      encoder: { currentScene: data.sceneName },
    };
    self.reportUpdate(patch);
  });

}

module.exports.Encoder = Encoder;