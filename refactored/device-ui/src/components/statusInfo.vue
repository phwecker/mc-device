<template>
  <v-container v-if="!isLoading">
    <v-row>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="344" outlined v-if="studioComponents.encoder">
          <v-list-item three-line>
            <v-list-item-content>
              <div class="overline mb-4">CURRENT STATUS</div>
              <v-list-item-title class="headline mb-1">Encoder</v-list-item-title>
            </v-list-item-content>

            <v-list-item-avatar
              tile
              size="80"
              :color="studioData.data.reported.encoder.connected?'green':'red'"
            ></v-list-item-avatar>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">SETTINGS</div>
              <v-list-item-subtitle>
                Current Scene : {{studioData.data.reported.encoder.currentScene}}
                <br />
                Startup Scene : {{studioData.data.desired.encoder.startupScene}}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">ENCODER OUTPUT</div>
              <v-list-item-subtitle>
                Streaming : {{studioData.data.reported.encoder.streaming}}
                <br />
                Channel : {{studioData.data.desired.encoder.stream.channel}}
                <br />
                <br />
                Recording : {{studioData.data.reported.encoder.recording}}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-card-actions>
            <v-btn text>Attempt to connect</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="344" outlined v-if="studioComponents.switcher">
          <v-list-item three-line>
            <v-list-item-content>
              <div class="overline mb-4">CURRENT STATUS</div>
              <v-list-item-title class="headline mb-1">Switcher</v-list-item-title>
            </v-list-item-content>

            <v-list-item-avatar
              tile
              size="80"
              :color="studioData.data.reported.switcher.connected?'green':'red'"
            ></v-list-item-avatar>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">SETTINGS</div>
              <v-list-item-subtitle>
                Current Program : {{studioData.data.reported.switcher.program}}
                <br />
                Current Preview : {{studioData.data.reported.switcher.preview}}
                <br />
                <br />
                Startup Program : {{studioData.data.desired.switcher.startupProgram}}
                <br />
                Startup Preview : {{studioData.data.desired.switcher.startupPreview}}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">ACTIONS</div>
            </v-list-item-content>
          </v-list-item>
          <v-list-item>
            <v-select
              @change="setInput('preview', setPreview)"
              class="green lighten-3"
              v-model="setPreview"
              :items="inputs"
              label="Preview"
            ></v-select>
          </v-list-item>
          <v-list-item>
            <v-select
              @change="setInput('program', setProgram)"
              class="red lighten-3"
              v-model="setProgram"
              :items="inputs"
              label="Program"
            ></v-select>
          </v-list-item>
          <v-list-item>
            <v-btn @click="doTransition('cut')">CUT</v-btn>
            <v-spacer></v-spacer>
            <v-btn @click="doTransition('auto')">AUTO</v-btn>
          </v-list-item>
          <v-card-actions>
            <v-btn text>Attempt to connect</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="344" outlined v-if="studioComponents.player">
          <v-list-item three-line>
            <v-list-item-content>
              <div class="overline mb-4">CURRENT STATUS</div>
              <v-list-item-title class="headline mb-1">Player</v-list-item-title>
            </v-list-item-content>

            <v-list-item-avatar
              tile
              size="80"
              :color="studioData.data.reported.player.connected?'green':'red'"
            ></v-list-item-avatar>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">SETTINGS</div>
              <v-list-item-subtitle>Startup Clip : {{studioData.data.desired.player.startupTrack}}</v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-card-actions>
            <v-btn text>Attempt to connect</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
    <!-- <pre>{{studioData}}</pre> -->
  </v-container>
</template>

<script>
import axios from "axios";

function getStudioData() {
  return axios.get("/studio");
}

function getStudioComponents() {
  return axios.get("/components");
}

function getInputs() {
  return axios.get("/switcher/inputs");
}

export default {
  name: "statusInfo",
  data: () => ({
    studioData: {},
    studioComponents: {},
    isLoading: true,
    inputs: [],
    setProrgam: 0,
    setPreview: 0,
  }),
  methods: {
    setInput(inChannel, inInput) {
      return axios.get(`/switcher/${inChannel}/${inInput}`);
    },
    doTransition(inTransition) {
      return axios.get(`/switcher/${inTransition}`);
    },
  },
  mounted: async function () {
    var self = this;
    self.inputs = await getInputs();
    self.inputs = self.inputs.data;

    setInterval(async () => {
      self.studioData = await getStudioData();
      self.studioComponents = await getStudioComponents();
      self.studioComponents = self.studioComponents.data;
      console.log("Data refreshed");
      self.isLoading = false;
    }, 1000);
  },
};
</script>
