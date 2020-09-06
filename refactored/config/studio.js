module.exports = {
    encoder: {
        enabled: true,
        deviceCode: "encoder.js",
        startupScene: "00preshow",
        address: "localhost:4444",
        password: "",
        stream: {
            url: "",
            key: "",
        },
    },
    switcher: {
        enabled: true,
        deviceCode: "switcher.js",
        address: "192.168.1.200",
        startupProgram: 1000,
        startupPreview: 1000,
    },
    player: {
        enabled: true,
        deviceCode: "player.js",
        address: "192.168.1.116",
        startupTrack: 1,
    },
    deviceConnectionString:
        "HostName=phwecker-iot-stream.azure-devices.net;DeviceId=studiod3914604acb74e2fb96ba2680a16ce70;SharedAccessKey=wPHqRcRcqduqSzo+ijYEfDH7Xy3IunUhEKLKFuBSFBI=",
};