module.exports.config = {
  encoder: {
    enabled: true,
    startupScene: "00preshow",
    address: "192.168.1.102:4444",
    password: "",
    stream: {
      url: "",
      key: "",
    },
  },
  switcher: {
    enabled: false,
    address: "192.168.1.200",
    startupProgram: 1000,
    startupPreview: 1000,
  },
  player: {
    enabled: true,
    address: "192.168.1.116",
    startupTrack: 1,
  },
  deviceConnectionString:
    "HostName=phwecker-iot-stream.azure-devices.net;DeviceId=studiocc95d0fa18f64c1e867c3c3cc15a0ed0;SharedAccessKey=6AL4EvwK45b1fCZrzXgH4oWtGinkWXtM2yRm5sKQtCo=",
};
