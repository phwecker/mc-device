const OBSWebSocket = require("obs-websocket-js");
const obs = new OBSWebSocket();

module.exports.client = obs;

module.exports.init = async function init(inLocation, inPassword, inTwin) {
  localTwin = inTwin;
  console.log("Encoder :: connecting ...");
  return obs
    .connect({
      address: inLocation,
      password: inPassword,
    })
    .then(() => {
      console.log(`Encoder :: connected`);
      var patch = {
        encoderConnected: true,
      };

      // send the patch
      localTwin.properties.reported.update(patch, function (err) {
        if (err) throw err;
        console.log("Encoder :: state reported");
      });

      obs.on("SwitchScenes", (data) => {
        console.log(`Encoder :: New Active Scene: ${data.sceneName}`);
        // create a patch to send to the hub
        var patch = {
          currentScene: data.sceneName,
        };

        // send the patch
        inTwin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("Encoder :: scene changed");
        });
      });
    })
    .catch((error) => {
      console.log("Encoder :: Connection error", error);
    });
};

module.exports.getSceneList = function getSceneList() {
  return obs.send("GetSceneList");
};

module.exports.setScene = async function setScene(inScene) {
  return await obs.send("SetCurrentScene", {
    "scene-name": inScene,
  });
};
