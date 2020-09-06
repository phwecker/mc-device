<template>
  <v-app>
    <v-app-bar app color="primary" dark>
      <div class="d-flex align-center"></div>
      <h1>Studio Device - Status Screen</h1>
      <v-spacer></v-spacer>
    </v-app-bar>

    <v-main>
      <statusInfo />
    </v-main>
  </v-app>
</template>

<script>
import statusInfo from "./components/statusInfo.vue";
export default {
  name: "App",

  components: {
    statusInfo,
  },

  data: () => ({
    //
  }),
};
</script>
