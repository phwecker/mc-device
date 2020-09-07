//
// SWITCHER CODE
//

function Switcher() {

  const {
    Atem
  } = require("atem-connection");

  const switcher = new Atem({
    externalLog: console.log
  });

  let switcherReconnect = false;

  var switcherAvailableInputs = {};

  this.properties = { connected: false };

  self = this;

  this.input = function (inChannel, inInput) {
    return setInput(switcher, inChannel, inInput);
  }

  this.transition = function (inTransition) {
    return doTransition(switcher, inTransition)
  }

  this.inputs = function () {
    return new Promise((res, rej) => {
      var inputList = [];
      for (var i in switcherAvailableInputs) {
        inputList.push(i)
      }
      res(inputList);
    })
  }

  this.init = function (inSwitcherConfig, inStartupConfig, inReportUpdate) {

    console.log(`SWITCHER :: Init`)
    self.reportUpdate = inReportUpdate;
    self.config = inSwitcherConfig;
    self.startupConfig = inStartupConfig;
    self.properties = { connected: false };

    switcher.on("disconnected", () => {
      console.log("SWITCHER :: disconnected");
      self.properties.connected = false;
      var patch = {
        switcher: {
          connected: self.properties.connected
        },
      };
      inReportUpdate(patch);

    });

    switcher.on("connected", async () => {
      var patch = {}

      if (!switcherReconnect) {
        console.log("SWITCHER :: connected");

        // set switcher to bars as initial input
        await setInput(
          switcher,
          "program",
          self.startupConfig.startupProgram,
        );

        await setInput(
          switcher,
          "preview",
          self.startupConfig.startupPreview
        );
        console.log(`SWITCHER :: startup inputs set`)

        self.properties.connected = true;
        switcherReconnect = true;

      } else {
        console.log("SWITCHER :: connection restablished");
        self.properties.connected = true;
      }
      patch = {
        switcher: self.properties
      };
      // send the patch
      self.reportUpdate(patch);
    });

    switcher.on("stateChanged", async function (err, state) {

      var patch = {};

      if (state.startsWith("inputs")) {
        console.log("SWITCHER :: Initial state -- ", state.split('.'))
        switcherAvailableInputs[state.split('.')[1]] = true;
      }

      switch (state) {
        case "video.ME.0.previewInput": {
          self.properties.preview = switcher.listVisibleInputs("preview")[0];
          console.log("SWITCHER :: State received ", state)
          break;
        }
        case "video.ME.0.programInput": {
          self.properties.program = switcher.listVisibleInputs("program")[0];
          console.log("SWITCHER :: State received ", state)
          break;
        }
      }
      if (state == "video.ME.0.previewInput" || state == "video.ME.0.programInput") {
        let patch = {
          switcher: self.properties,
        };
        // send the patch
        self.reportUpdate(patch);
      }
    });

    switcher.connect(self.config.address);
  }

  function setInput(inSwitcher, inChannel, inInput) {
    return new Promise(async (res, rej) => {
      switch (inChannel) {
        case "program":
          inSwitcher.changeProgramInput(inInput)
            .then((result) => {
              console.log("SWITCHER :: switching program to ", inInput);
              self.properties.program = inInput;
              let patch = {
                switcher: self.properties,
              };
              self.reportUpdate(patch);
              res(result)
            })
            .catch((error) => {
              console.log("SWITCHER :: Error ", error);
              res(error.resolve(''));
            });
          break;
        case "preview":
          inSwitcher.changePreviewInput(inInput)
            .then((result) => {
              console.log("SWITCHER :: switching preview to ", inInput);

              self.properties.preview = inInput;
              let patch = {
                switcher: self.properties,
              };
              self.reportUpdate(patch);
              res(result)
            })
            .catch((error) => {
              console.log("SWITCHER :: Error ", error);
              res(error.resolve(''));
            });
          break;
        default:
          console.log("SWITCHER :: setInput :: Invalid Input");
          res({ code: 404, text: "invalid input" })
      }
    })
  }

  function doTransition(inSwitcher, inType) {
    console.log("SWITCHER :: transition  " + inType);
    return new Promise((res, rej) => {

      switch (inType) {
        case "cut":
          inSwitcher
            .cut()
            .then((result) => {
              self.properties.program = switcher.listVisibleInputs("program")[0];
              self.properties.preview = switcher.listVisibleInputs("preview")[0];
              let patch = {
                switcher: self.properties,
              };
              self.reportUpdate(patch);
              console.log("SWITCHER :: CUT Transition executed", self.properties);
              res(result)
            })
            .catch((error) => {
              console.log("SWITCHER :: Error", error);
              res(error)
            });
          break;
        case "auto":
          inSwitcher
            .autoTransition()
            .then((result) => {
              self.properties.program = switcher.listVisibleInputs("program")[0];
              self.properties.preview = switcher.listVisibleInputs("preview")[0];
              let patch = {
                switcher: self.properties,
              };
              self.reportUpdate(patch);
              console.log("SWITCHER :: AUTO Transition executed", self.properties);
              res(result)
            })
            .catch((error) => {
              console.log("SWITCHER :: Error", error);
              res(error)
            });
          break;
        default:
          console.log("SWITCHER :: Transition :: Invalid type");
          res({ code: 404, text: "unknown transition" })
      }
    })
  }
}

module.exports.Switcher = Switcher;
