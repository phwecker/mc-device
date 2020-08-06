const OBSWebSocket = require("obs-websocket-js");
const obs = new OBSWebSocket();
var localTwin = null;

module.exports.client = obs;
module.exports.twin = localTwin;
module.exports.setTwin = function setTwin(inTwin) {
  localTwin = inTwin;
};

module.exports.init = async function init(inLocation, inPassword) {
  return obs
    .connect({
      address: inLocation,
      password: inPassword,
    })
    .then(() => {
      console.log(`OBS :: connected`);
      var patch = {
        encoderConnected: true,
      };

      // send the patch
      localTwin.properties.reported.update(patch, function (err) {
        if (err) throw err;
        console.log("OBS :: state reported");
      });

      obs.on("SwitchScenes", (data) => {
        console.log(`New Active Scene: ${data.sceneName}`);
        // create a patch to send to the hub
        var patch = {
          currentScene: data.sceneName,
        };

        // send the patch
        localTwin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("OBS :: scene changed");
        });
      });
    })
    .catch((error) => {
      console.log("OBS :: Connection error", error);
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
