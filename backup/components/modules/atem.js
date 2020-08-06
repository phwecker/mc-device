const { Atem } = require("atem-connection");
const myAtem = new Atem({ externalLog: console.log });

var localTwin = null;
module.exports.twin = localTwin;
module.exports.setTwin = function setTwin(inTwin) {
  localTwin = inTwin;
};

var atemAddress = null;
module.exports.setAtemAddress = function (inAtemAddress) {
  atemAddress = inAtemAddress;
};
// 192.168.1.200

module.exports.init = function () {
  return new Promise((resolve, reject) => {
    console.log("ATEM :: Address " + atemAddress);
    myAtem.connect(atemAddress);

    myAtem
      .on("connected", () => {
        console.log("ATEM :: connected");

        // set switcher to bars as initial input
        this.setInput("program", 1000);
        this.setInput("preview", 1000);

        var patch = {
          switcherConnected: true,
          switcherProgram: 1000,
          switcherPreview: 1000,
        };

        // send the patch
        localTwin.properties.reported.update(patch, function (err) {
          if (err) throw err;
          console.log("ATEM :: state reported");
        });
        return resolve;
        // console.log(myAtem.state.inputs);
      })
      .catch((error) => {
        console.log(error);
        return reject;
      });
  });
};

myAtem.on("stateChanged", function (err, state) {
  console.log(state); // catch the ATEM state.
  obsScenes = ["Scene", "Scene 2", "Scene 3", "Scene 4"];
  currentProgram = myAtem.listVisibleInputs("program")[0];
});

module.exports.setInput = async function setInput(inChannel, inInput) {
  console.log("ATEM :: switching input " + inChannel);
  switch (inChannel) {
    case "program":
      await myAtem
        .changeProgramInput(inInput)
        .then((res) => {
          var patch = {
            switcherProgram: inInput,
          };

          // send the patch
          localTwin.properties.reported.update(patch, function (err) {
            if (!!err) throw err;
            console.log("ATEM :: Program changed to " + inInput);
          });
        })
        .catch((error) => {
          console.log("ATEM :: Error", error);
        });
      break;
    case "preview":
      await myAtem
        .changePreviewInput(inInput)
        .then((res) => {
          var patch = {
            switcherPreview: inInput,
          };

          // send the patch
          localTwin.properties.reported.update(patch, function (err) {
            if (!!err) throw err;
            console.log("ATEM :: Preview changed to " + inInput);
          });
        })
        .catch((error) => {
          console.log("ATEM :: Error", error);
        });
      break;
    default:
      console.log("ATEM :: setInput :: Invalid Input");
  }
};
