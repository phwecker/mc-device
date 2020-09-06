//
// PLAYER CODE
//

function Player() {
  const hyperdeck = require("hyperdeck-js-lib");

  let self = this;

  this.hyperdeckClient = {};

  this.properties = {
    connected: false,
    playing: false,
    clipPlaying: '',
    playbackLoop: '',
  };
  this.config = {};

  this.clips = function () {
    return getClips();
  }

  this.playClip = function (inClip, playLoop) {
    return play(inClip, playLoop)
  }

  this.nextClip = function () {
    return playerNextClip();
  }

  this.prevClip = function () {
    return playerPrevClip();
  }

  this.stopClip = function () {
    return playerStop();
  }

  this.slotInfo = function (slotNo = 0) {
    if (slotNo > 0)
      return aSlot(slotNo)
    else
      return allSlots()
  }

  this.setSlot = function (inSlotNo) {
    return playerSelectSlot(inSlotNo)
  }

  this.init = function (inPlayerConfig, inReportUpdate) {
    console.log(`PLAYER :: Init`)
    self.config = inPlayerConfig;
    self.reportUpdate = inReportUpdate;
    self.hyperdeckClient = new hyperdeck.Hyperdeck(
      self.config.address
    );

    if (this.hyperDeckClient) {
      this.hyperdeckClient.getNotifier().on('connectionLost', async function () {
        console.error('PLAYER :: Connection lost.');
        this.properties.connected = false;
        this.properties.clips = null;
        let patch = {
          player: self.properties,
        };
        this.reportUpdate(patch);
      });
    }
    getClips().then((clips) => {
      this.properties.clips = clips;
      this.properties.connected = true;
      let patch = {
        player: this.properties,
      };
      self.reportUpdate(patch);
      console.log(`PLAYER :: Connected to ${self.config.address}`)
    })
  }

  // getClips
  function getClips() {
    console.log('PLAYER :: Retrieving Clips')
    return new Promise((res, rej) => {
      let hyperdeckClips = [];
      self.hyperdeckClient.clipsGet().then((clips) => {
        let clipCount = clips.params["clip count"];
        for (var i = 1; i <= clipCount; i++) {
          hyperdeckClips.push(clips.params[i.toString()]);
        }
        res(hyperdeckClips)
      })
    })
  }

  // slotInfo

  async function allSlots() {
    return new Promise((res, rej) => {
      var slotInfos = {
        slot: []
      }
      console.log("PLAYER :: fetching slot info")
      self.hyperdeckClient.makeRequest("slot info: slot id: 1").then(async function (slotInfo) {
        console.log(
          "Player :: Get slot 1 info "
        );
        slotInfos.slot[0] = slotInfo.params;
        self.hyperdeckClient.makeRequest("slot info: slot id: 2").then(slotInfo => {
          console.log(
            "Player :: Get slot 2 info "
          );
          slotInfos.slot[1] = slotInfo.params;
          res(slotInfos);
        })
      })
    })
  }

  function aSlot(inSlot) {
    return self.hyperdeckClient.makeRequest(`slot info: slot id: ${inSlot}`).then((result) => {
      console.log(`PLAYER :: Get info ${inSlot}`)
    });
  }

  // play
  function play(inClipNo, inLoop = false) {
    console.log(`PLAYER :: Play clip ${inClipNo}, ${inLoop}`)
    return new Promise(async (res, rej) => {
      if (inClipNo) {
        self.properties.playing = true;
        self.properties.clipPlaying = inClipNo;
        self.properties.playbackLoop = inLoop;
        let patch = {
          player: self.properties,
        };
        self.reportUpdate(patch);
        await self.hyperdeckClient
          .makeRequest("playrange set: clip id: " + inClipNo)
          .then(async (response) => {
            console.log("PLAYER :: Play ", inClipNo, inLoop ? "Loop" : "No Loop");
            let playresult = await self.hyperdeckClient.makeRequest("play: loop: " + inLoop);
            res(playresult)
          })
          .catch((error) => {
            res(error)
          });
      } else {
        self.properties.playing = true;
        self.properties.clipPlaying = null;
        self.properties.playbackLoop = inLoop;
        let patch = {
          player: self.properties,
        };
        self.reportUpdate(patch);
        await self.hyperdeckClient
          .makeRequest("playrange clear")
          .then(async (response) => {
            console.log("PLAYER :: Play ", inClipNo, inLoop ? "Loop" : "No Loop");
            let playresult = await self.hyperdeckClient.makeRequest("play: loop: " + inLoop);
            res(playresult)
          })
          .catch((error) => {
            res(error)
          });
      }
    })
  }

  // stop 
  function playerStop() {
    return self.hyperdeckClient.stop().then((result) => {
      console.log(`PLAYER :: Stop playback`)
      self.properties.playing = false;
      let patch = {
        player: self.properties,
      };
      self.reportUpdate(patch);
    });
  }

  // nextClip 
  function playerNextClip() {
    return self.hyperdeckClient.nextClip().then((result) => {
      console.log(`PLAYER :: Next clip`)
    });
  }

  // prevClip 
  function playerPrevClip() {
    return self.hyperdeckClient.prevClip().then((result) => {
      console.log(`PLAYER :: Previous clip`)
    });
  }

  // slotSelect
  function playerSelectSlot(inSlotNo) {
    return new Promise((res, rej) => {
      console.log(`PLAYER :: Setting slot ${inSlotNo}`)
      self.hyperdeckClient.slotSelect(inSlotNo)
        .then(async (result) => {
          console.log(`PLAYER :: Active slot ${inSlotNo}`)
          self.properties.activeSlot = inSlotNo;

          getClips().then((clips) => {
            self.properties.clips = clips;
            self.properties.connected = true;
            let patch = {
              player: self.properties,
            };
            self.reportUpdate(patch);
            res(result)
          })
        })
        .catch((error) => {
          res(error)
        });
    });
  }

}

module.exports.Player = Player;