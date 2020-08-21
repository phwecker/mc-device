<template>
  <v-container v-if="!isLoading">
    <v-row>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="344" outlined>
          <v-list-item three-line>
            <v-list-item-content>
              <div class="overline mb-4">CURRENT STATUS</div>
              <v-list-item-title class="headline mb-1">Encoder</v-list-item-title>
            </v-list-item-content>

            <v-list-item-avatar
              tile
              size="80"
              :color="studioData.data.reported.encoderConnected?'green':'red'"
            ></v-list-item-avatar>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">SETTINGS</div>
              <v-list-item-subtitle>
                Current Scene : {{studioData.data.reported.currentScene}}
                <br />
                Startup Scene : {{studioData.data.desired.encoder.startupScene}}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">ENCODER OUTPUT</div>
              <v-list-item-subtitle>
                Streaming : {{studioData.data.reported.encoderStreaming}}
                <br />
                Channel : {{studioData.data.desired.encoder.stream.channel}}
                <br />
                <br />
                Recording : {{studioData.data.reported.encoderRecording}}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-card-actions>
            <v-btn text>Attempt to connect</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="344" outlined>
          <v-list-item three-line>
            <v-list-item-content>
              <div class="overline mb-4">CURRENT STATUS</div>
              <v-list-item-title class="headline mb-1">Switcher</v-list-item-title>
            </v-list-item-content>

            <v-list-item-avatar
              tile
              size="80"
              :color="studioData.data.reported.switcherConnected?'green':'red'"
            ></v-list-item-avatar>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">SETTINGS</div>
              <v-list-item-subtitle>
                Current Program : {{studioData.data.reported.switcherProgram}}
                <br />
                Current Preview : {{studioData.data.reported.switcherPreview}}
                <br />
                <br />
                Startup Program : {{studioData.data.desired.switcher.startupProgram}}
                <br />
                Startup Preview : {{studioData.data.desired.switcher.startupPreview}}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-card-actions>
            <v-btn text>Attempt to connect</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col cols="4">
        <v-card class="mx-auto" max-width="344" outlined>
          <v-list-item three-line>
            <v-list-item-content>
              <div class="overline mb-4">CURRENT STATUS</div>
              <v-list-item-title class="headline mb-1">Player</v-list-item-title>
            </v-list-item-content>

            <v-list-item-avatar
              tile
              size="80"
              :color="studioData.data.reported.playerConnected?'green':'red'"
            ></v-list-item-avatar>
          </v-list-item>
          <v-list-item>
            <v-list-item-content>
              <div class="overline mb-4">SETTINGS</div>
              <v-list-item-subtitle>Startup Clip : {{studioData.data.desired.player.startupClip}}</v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-card-actions>
            <v-btn text>Attempt to connect</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
    <pre>{{studioData}}</pre>
  </v-container>
</template>

<script>
import axios from "axios";

function getStudioData() {
  return axios.get("/studio");
}
export default {
  name: "statusInfo",
  data: () => ({
    studioData: {},
    isLoading: true,
  }),
  mounted: async function () {
    var self = this;
    setInterval(async () => {
      self.studioData = await getStudioData();
      console.log("Data refreshed");
      self.isLoading = false;
    }, 1000);
  },
};
</script>
