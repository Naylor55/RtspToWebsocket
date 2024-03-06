const express = require('express');
const expressWs = require('express-ws')
var webSocketStream = require("websocket-stream/stream");
var ffmpeg = require("fluent-ffmpeg");

const router = express.Router()
expressWs(router);

router.ws('/test', (ws, req) => {
  ws.send('连接成功')
  //定时发送消息
  // let interval
  // interval = setInterval(() => {
  //   if (ws.readyState === ws.OPEN) {
  //     ws.send(Math.random().toFixed(2))
  //   } else {
  //     clearInterval(interval)
  //   }
  // }, 1000)

  //推视频流
  const stream = webSocketStream(ws, {
    binary: true,
    browserBufferTimeout: 1000000
  }, {
    browserBufferTimeout: 1000000
  });
   var url = "rtsp://admin:Admin123@192.168.1.120:554/ch1/main/av_stream";
  //var url = "rtsp://admin:hik12345+@192.168.1.119:554/ch1/main/av_stream";
  //var url = "rtsp://192.168.1.83:554/openUrl/NZDUvlu";
  try {
    ffmpeg(url)
      .addInputOption("-rtsp_transport", "tcp", "-buffer_size", "102400") // 这里可以添加一些 RTSP 优化的参数
      .on("start", function () {
        console.log(url, "Stream started.");
      })
      .on("codecData", function () {
        console.log(url, "Stream codecData.")// 摄像机在线处理
      })
      .on("error", function (err) {
        console.log(url, "An error occured: ", err.message);
      })
      .on("end", function () {
        console.log(url, "Stream end!");// 摄像机断线的处理
      })
      .outputFormat("flv").videoCodec("copy").noAudio().pipe(stream);
  } catch (error) {
    console.log(error);
  }

  //接收到消息
  ws.on('message', msg => {
    console.log("收到消息");
    ws.send(msg)
  })
})

module.exports = router
