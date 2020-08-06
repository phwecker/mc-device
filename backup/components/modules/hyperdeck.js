var HyperdeckLib = require("hyperdeck-js-lib");

let hyperdeck;
var hyperdeckStatus = "disconnected";
var hyperdeckClips = null;

module.exports.status = hyperdeckStatus;
module.exports.clips = hyperdeckClips;

var localTwin = null;
module.exports.twin = localTwin;
module.exports.setTwin = function setTwin(inTwin) {
  localTwin = inTwin;
};

module.exports.init = async function connect(inAdress) {
  hyperdeck = await new HyperdeckLib.Hyperdeck(inAdress);
  await hyperdeck.onConnected().then(async function () {
    hyperdeckClips = await hyperdeck.clipsGet();
    hyperdeckStatus = "connected";
    console.log("HYPERDECK :: connected");
    var patch = {
      playerConnected: true,
    };

    // send the patch
    localTwin.properties.reported.update(patch, function (err) {
      if (err) throw err;
      console.log("HYPERDECK :: state reported");
    });
  });
};

module.exports.getClips = async function getClips() {
  var clips = await hyperdeck.clipsGet();
  hyperdeckClips = clips;
  return hyperdeckClips;
};

module.exports.play = async function play(inClipNo) {
  if (inClipNo) {
    hyperdeck
      .makeRequest("playrange set: clip id: " + inClipNo)
      .then((response) => {
        hyperdeck.play();
      })
      .catch((error) => {
        console.log(error);
      });
  } else {
    hyperdeck
      .makeRequest("playrange clear")
      .then((response) => {
        hyperdeck.play();
      })
      .catch((error) => {
        console.log(error);
      });
  }
};

module.exports.stop = async function stop() {
  hyperdeck.stop();
};

module.exports.next = async function nextClip() {
  hyperdeck.nextClip();
};

module.exports.previous = async function prevClip() {
  hyperdeck.prevClip();
};

module.exports.stop = async function stop() {
  hyperdeck.stop();
};

module.exports.slotInfo = async function slotInfo(inSlot) {
  return hyperdeck.slotInfo(inSlot);
};
