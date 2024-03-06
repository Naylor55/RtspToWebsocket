
[toc]

# 概述

众所周知，rtsp的流是无法在浏览器中播放的，这就导致海康摄像头、海康ISC等平台的视频流无法直接在浏览器中播放。

当下是web最盛行的时代，恨不得所有功能、系统、平台。。。都装在浏览器中。

本文简单介绍如何间接实现在浏览器中播放rtsp的流，涉及技术点和工具较多，本文仅做功能实现思路的梳理和简单的代码实践，后续整理更深入的实现原理。


大致流程为：
* 准备一个rtsp流，可以通过直连摄像头、vlc自己推流等
* 使用node技术栈搭建一个基于express的应用
* 在express应用中通过 fluent-ffmpeg（可以简单认为是ffmpeg的包装器） 和ffmpeg进行交互
* 使用ffmpeg解码rtsp为flv视频格式，并返回数据流
* 在express应用中通过 express-ws 创建一个WebsocketServer服务，此服务接收ffmpeg返回的数据流，并发送到连接此服务的WebsocketClient上
* 使用flvjs（b站开源）播放flv格式的视频，即充当WebsocketClient
，实际是通过接收WebsocketServer发送的数据并渲染到video标签上面


# 环境

本文示例代码是在如下环境下调试的

* IDE：VsCode
* node：16.15.0
* npm：8.5.5
* 脚手架：未使用express脚手架工具
* ffmpeg：6.1.0


# 项目目录清单


~~~

¦   package-lock.json
¦   package.json
¦   
+---client
¦       client.html
¦       flv-1.6.2.js           
+---public
¦       index.html
¦       yikepingguo.png
¦       
+---server
        server.js
        websocket.js

~~~

* package.json ：npm包管理器配置文件
* client：WebsocketClient
    * client.html：一个单独的html页面，用来播放视频。独立于express，需要从windows资源管理器中访问，并在浏览器中打开
    * flv.js：当前最新版本1.6.2
* public：express应用静态资源存放目录，当前有一个helloWorld的html页面和一张示例图片。仅作用验证express应用是否启动。
* server：WebsocketServer
    * server.js：实例化express应用
    * websocker.js：实例化一个WebsockerServer；借助ffmpeg将rtsp转换为flv

# 项目搭建步骤

新建一个文件夹，假设取名 RtspToFlv，并在VsCode中打开此文件夹，后续所有操作均在此文件夹操作。

在RtspToFlv中创建server文件夹。

在RtspToFlv中创建client文件夹。





## 引入相关npm依赖

新建一个文件 package.json ，并填入如下内容：


~~~json


{
    "name": "RtspToWebsocket",
    "version": "1.0.0",
    "main": "index.js",
    "scripts": {
        "start": "nodemon ./server/server.js"
    },
    "keywords": [],
    "author": {
        "email": "liangchen_beijing@163.com",
        "name": "一颗苹果",
        "url": ""
    },
    "license": "Apache-2.0",
    "dependencies": {
        "express": "4.18.3",
        "express-ws": "5.0.2",
        "nodemon": "3.1.0",
        "ws": "8.16.0",
        "websocket-stream": "5.5.2",       
        "fluent-ffmpeg": "2.1.2"
    }
}



~~~

* script.start：配置启动脚本，执行server/server.js
* nodemon：nodemon 是一种工具，可在检测到目录中的文件更改时通过自动重新启动 node 应用程序来帮助开发基于 node.js 的应用程序
* dependencies：依赖包，均使用当前最新版本
* fluent-ffmpeg：该库提供了一组函数和实用程序来抽象 ffmpeg 的命令行用法。简单来说就是包装了一层使用ffmpeg的胶水代码。要使用此库，需要已经安装了 ffmpeg。也就是说本机必须安装了ffmpeg并已经添加到了系统环境变量。



使用 npm install 安装所有的依赖。

## 实例化一个express应用

在server文件夹中新建一个server.js 文件，并填入如下内容：

~~~


const express = require('express')

const app = express()

const expressWs = require('express-ws')
const websocket = require('./websocket')


expressWs(app);
app.use(express.static('public'))
app.use('/websocket', websocket)
app.get('*', (req, res) => {})
app.listen(8009, () => {
  console.log('server is listening on port 8009')
})



~~~

* app.use('/websocket', websocket)：将后面创建的websocker.js模块加载进来



## 创建WebsocketServer并解析rtsp


在server文件夹中新建一个 websocket.js 文件，并填入如下内容：


~~~


const express = require('express');
const expressWs = require('express-ws')
var webSocketStream = require("websocket-stream/stream");
var ffmpeg = require("fluent-ffmpeg");


const router = express.Router()
expressWs(router);
router.ws('/test', (ws, req) => {
  ws.send('连接成功')
  //推视频流
  const stream = webSocketStream(ws, {
    binary: true,
    browserBufferTimeout: 1000000
  }, {
    browserBufferTimeout: 1000000
  });
   var url = "rtsp://xxx:xxx@192.168.1.xxx:xxx/ch1/main/av_stream";
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



~~~


* 创建了一个Websocket端点（/websocket/test），提供给客户端连接
* webSocketStream：创建了一个stream对象，将ffmpeg解析出来的数据流存入stream中，并实时发送到了WebsocketClient
* ffmpeg有丰富的配置参数，可以通过参照官方文档进行调优



至此，WebsocketServer已经搭建好了，使用 npm start 命令尝试启动express应用。


## 使用flv播放

从flvjs官网下载flv.js文件，并放到client文件夹下面。


在client文件夹中新建一个文件 client.html ，并填入如下内容：


~~~



<html>
<head>
    <meta charset="UTF-8">
    <title>websocket客户端，使用flvjs播放视频</title>
    <style>
        .websocket {
            width: 500px;
            height: 500px;
            border: 1px solid #ccc;
            margin: 10px auto 0 auto;
            text-align: center;
        }
        #receive-box {
            width: 300px;
            height: 200px;
            overflow: auto;
            margin: 0 auto 10px auto;
            border: 1px solid #25d1ff;
        }
        #msg-need-send {
            width: 300px;
            height: 100px;
            resize: none;
            border-radius: 5px;
        }
        #send-btn {
            border: none;
            border-radius: 5px;
            background: #25d1ff;
            padding: 5px 10px;
            color: #fff;
            cursor: pointer;
        }
        #exit {
            border: 1px solid #ccc;
            border-radius: 5px;
            background: none;
            padding: 5px 10px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h5>socket-client</h5>
    <div class="websocket">
        <div class="receive">
            <p>服务端返回的消息：</p>
            <div id="receive-box"></div>
        </div>
        <div class="send">
            <p>给服务端发送消息：</p>
            <textarea type="text" id="msg-need-send"></textarea>
            <p>
                <button id="send-btn">点击发消息给服务端</button>
            </p>
        </div>
        <button id="exit">关闭连接</button>
    </div>
    <h5>播放器</h5>
    <div>
        <video id="my-player" preload="auto" muted autoplay type="rtmp/flv">
            <source src="">
        </video>
    </div>
   
    <script src="./flv-1.6.2.js"></script>
    <script>
        window.onload = function () {
            // test();
            play();
           
        };
        //测试websocket收发消息
        function test() {
            const ws = new WebSocket('ws://127.0.0.1:8009/websocket/test')
            ws.onopen = e => {
                console.log(`WebSocket 连接状态： ${ws.readyState}`)
            }
            ws.onmessage = data => {
                console.log("接收到消息");
                const receiveBox = document.getElementById('receive-box')
                receiveBox.innerHTML += `<p>${data.data}</p>`
                receiveBox.scrollTo({
                    top: receiveBox.scrollHeight,
                    behavior: "smooth"
                })
            }
            ws.onclose = data => {
                console.log('WebSocket连接已关闭')
                console.log(data);
            }
            //发送msg
            var sendBtn = document.getElementById("send-btn");
            sendBtn.onclick = () => {
                ws.send(document.getElementById('msg-need-send').value)
            }
            //关闭websocket连接
            var exitBtn = document.getElementById("exit");
            exitBtn.onclick = () => {
                ws.close()
            }
        }
        //播放视频
        function play() {
            videoElement = document.getElementById('my-player');
            if (flvjs.isSupported()) {
                flvPlayer = flvjs.createPlayer({
                    type: 'flv',                    //媒体类型
                    //flv格式媒体URL，即ws-server地址
                    url: 'ws://127.0.0.1:8009/websocket/test',
                    isLive: true,                   //数据源是否为直播流
                    hasAudio: false,                //数据源是否包含有音频
                    hasVideo: true,                 //数据源是否包含有视频
                    enableStashBuffer: false        //是否启用缓存区
                }, {
                    enableWorker: false,            //不启用分离线程
                    enableStashBuffer: false,       //关闭IO隐藏缓冲区
                    autoCleanupSourceBuffer: true   //自动清除缓存
                });
                flvPlayer.attachMediaElement(videoElement); //将播放实例注册到节点
                flvPlayer.load();                   //加载数据流
                flvPlayer.play();                   //播放数据流
            } else {
                alert("not support flvjs");
            }
        }
       
    </script>
</body>



~~~


* html文件中分两部分，第一部分是一个简单的Websocket功能测试，第二部分放了一个video的标签，flvjs将把视频流渲染到video中
* js代码中有两个方法，test用于测试Websocket连接和通信，play方法用于播放flv视频流
* url：注意url中path为/websocket/test，在服务的使用了
express.Router，实际WebsocketServer对外提供服务的端点就是/websocket/test
* flvjs参数：flvjs有丰富的各种参数和回调，可以参照官方文档做调优


# 浏览器中测试


进入windows的文件资源管理器并使用edge打开client.html，将可以看到rtsp视频流的画面已经渲染到了浏览器中，并且网络连接的地方不停的接收这WebSocketServer发送的flv视频流数据。


ws请求地址为：ws://127.0.0.1:8009/websocket/test

![](
http://img.anlu58.com/Default/ws-flv.png)


# 代码

https://github.com/Naylor55/RtspToWebsocket.git


# 引用


* ffmpeg：https://github.com/FFmpeg/FFmpeg
* flvjs：https://github.com/bilibili/flv.js
* express：https://github.com/expressjs/express