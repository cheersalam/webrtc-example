const express = require('express');
const app = express();
const server = require('http').createServer(app);
const _ = require('lodash');

const io = require('socket.io')(server, {
});
const path = require('path');


app.use(express.static(__dirname + '/node_modules'));
app.get('/', function(req, res,next) {
    res.sendFile(path.resolve('./client/index.html'));
});

app.get('/webrtc.js', function(req, res,next) {
    res.sendFile(path.resolve('./client/webrtc.js'));
});

server.listen(8002);


let captureNodeSocketId;
let clientSockets = [];
io.on('connection', function(socket) {
    socket.on('connect', function (id, msg) {
        console.log('connect ', id, ' saying ', msg);
    });

    socket.on('message', function (id, msg) {
        console.log('I received a private message by ', id, ' saying ', msg);
    });

    socket.on('client', function (msg) {
        HandleClientData(msg, socket.id);
    });

    socket.on('CaptureNodeConfig', function (id, msg) {
        //console.log('CaptureNodeConfig ', id, ' saying ', msg);
    });

    socket.on('CaptureNodeStatusUpdate', function (msg) {
        captureNodeSocketId = socket.id;
        console.log('Capture Node connected ', captureNodeSocketId);
        //console.log('captureNode ', msg);
        let ci = getCaptureNodeDefaultConfiguration(JSON.parse(msg));
        //console.log('data ', JSON.stringify(ci));
        socket.emit('ConfigureCaptureNodeRequest', JSON.stringify(ci));
    });

    socket.on('CaptureNodeConfigResponse', function (msg) {
        //console.log('CaptureNodeConfigResponse ', msg);
        socket.broadcast.emit('CaptureNodeConfigResponse', msg);
    });

    socket.on('WebRTCSignallingMessage', function (msg) {
        console.log('WebRTCSignallingMessage ', msg);

        //FIXME: double parsing, CN should send object not string
        msg = JSON.parse(msg);
        let signalingMsg = JSON.parse(msg);

        if (signalingMsg.msgId === 103) {
            socket.broadcast.emit('offer', msg);
        }
        else if (signalingMsg.msgId === 104) {
            socket.broadcast.emit('iceCandidate', msg);
        }
        else {
            console.log('undefined msgId:', signalingMsg.msgId);
        }
    });

    socket.on('disconnect', function () {
        if (captureNodeSocketId === socket.id)
        {
            captureNodeSocketId = null;
        }
        _.remove(clientSockets, {
            id: socket.id
        });
        console.log(socket.id + ' disconnected ' + JSON.stringify(clientSockets));
    });
});

//This is from web client to CNs ONLY
function HandleClientData(data, socketId)
{
    console.log('Received client message ', data);
    let jsonData = JSON.parse(data);

    if (jsonData.msgId === 100) {
        clientSockets.push({'id': socketId, 'uuid': data.uuid});
    }
    else if (jsonData.msgId === 101)
    {
        if (!_.isNil(captureNodeSocketId)) {
            io.to(captureNodeSocketId).emit('CaptureNodeConfigRequest', '');
        }
        else
        {
            console.log('CaptureNode not connected');
        }
    }
    else
    {
        if (!_.isNil(captureNodeSocketId)) {
            console.log('server: sending WebRTCSignallingMessage ', jsonData.data);
            io.to(captureNodeSocketId).emit('WebRTCSignallingMessage', jsonData.data);
        }
        else
        {
            console.log('CaptureNode not connected');
        }
    }
}

function getCaptureNodeDefaultConfiguration(captureNode) {
    let validCaptureInputs = captureNode.captureInputs.filter(ci => {
        return ci.videoStatus ==='ready' && ci.channels.length === 0;
    });

    let captureInputs = validCaptureInputs.map((ci, k) => {
        let quality = 'normal';
        return {
            "captureInputId": ci.captureInputId,
            "channelConfigurations": [ci.defaultChannelConfigurations[quality]]
        };
    });

    return {
        captureInputs: captureInputs
    };
}