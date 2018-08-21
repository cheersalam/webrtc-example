let localVideo;
let localStream;
let remoteVideo;
let remoteVideo2;
let peerConnection;
let uuid;
let serverConnection;
let captureInputs = [];

var socket = io.connect();
socket.on('connect', function(data) {
    socket.emit('client', JSON.stringify({'msgId': 100, 'uuid': uuid, 'data': ''}));
});

socket.on('CaptureNodeConfigResponse', function(data) {
    //console.log('CaptureNodeConfigResponse ', data);
    captureInputs = [];
    let captureNode = JSON.parse(data);
    _.forEach(captureNode.captureInputs, function(ci) {
        _.forEach(ci.channels, function(ch) {
            captureInputs.push({'captureInputId': ci.captureInputId, 'channelId': ch.channelId})
        });
    });
    document.getElementById("captureInputs").innerHTML = JSON.stringify(captureInputs);
});

socket.on('offer', function(data) {
    console.log('offer ', data);
    let offer = JSON.parse(data);
    console.log('offer.peerId ', offer.peerId);
    console.log('offer.sdp ', offer.sdp);
    if (offer.peerId === uuid)
    {
        let sdp = {'type': "offer", 'sdp': offer.sdp};
        console.log('sdp ', sdp);
        peerConnection.setRemoteDescription(new RTCSessionDescription(sdp)).then(function () {
            // Only create answers in response to offers
            peerConnection.createAnswer().then(createdDescription).catch(errorHandler);

        }).catch(errorHandler);
    }
});

socket.on('iceCandidate', function(data) {
    console.log('iceCandidate ', data);

    let candidate = JSON.parse(data);
    console.log('candidate.ice ', candidate.ice);
    //if (offer.peerId === uuid)
    {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate.ice)).catch(errorHandler);
    }
});

let peerConnectionConfig = {
    'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'}
    ]
};

function pageReady() {
    uuid = createUUID();

    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    remoteVideo2 = document.getElementById('remoteVideo2');

/*    serverConnection = new WebSocket('ws://' + window.location.hostname + ':8002' + '/captureNode');
    serverConnection.onmessage = gotMessageFromServer;*/


    let constraints = {
        video: true,
        audio: true,
    };

    /*    if (navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(constraints).then(getUserMediaSuccess).catch(errorHandler);
        } else {
            alert('Your browser does not support getUserMedia API');
        }*/
}

function getUserMediaSuccess(stream) {
    localStream = stream;
    localVideo.srcObject = stream;
}

async function configure() {
    socket.emit('client', JSON.stringify({msgId: 101, data: ""}));
}

function start(isCaller) {
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection.onicecandidate = gotIceCandidate;
    peerConnection.ontrack = gotRemoteStream;
    //peerConnection.addStream(localStream);

    console.log('sending get sdp message');
    //serverConnection.send(JSON.stringify({'msgId': 100, 'uuid': uuid}));

    //msgId: 102 = getSDP
    let webRTCSignallingMessage = {'peerId': uuid,
        'captureInputId': captureInputs[0].captureInputId,
        'channelId': captureInputs[0].channelId,
        'jsonMessage': JSON.stringify({'msgId': 102, 'uuid': uuid, 'message': ''})
    };
    socket.emit('client', JSON.stringify({'msgId': 102, 'uuid': uuid, 'data': JSON.stringify(webRTCSignallingMessage)}));
    /*  if(isCaller) {
        peerConnection.createOffer().then(createdDescription).catch(errorHandler);
      }*/
}

function gotMessageFromServer(message) {
    try {
        console.log('message ', message);
        let signal = JSON.parse(message.data);
        if (signal.msgId === 101) //offer received
        {
            console.log('received offer');
            let sdp = {'type': "offer", 'sdp': signal.sdp};
            peerConnection.setRemoteDescription(new RTCSessionDescription(sdp)).then(function () {
                // Only create answers in response to offers
                peerConnection.createAnswer().then(createdDescription).catch(errorHandler);

            }).catch(errorHandler);
        }
        else if (signal.msgId === 103) {
            console.log('received ice candidate');
            peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
        }
        else {
            console.log('Unknown MsgId ', signal.msgId);
        }
    }
    catch (ex)
    {

        console.log('Cannot handle incoming message ',ex);

    }
}

function gotIceCandidate(event) {
    if (event.candidate != null) {
        console.log('sending ice candidate ');
        //serverConnection.send(JSON.stringify({'ice': event.candidate, 'uuid': uuid}));
        //serverConnection.send(JSON.stringify({'msgId': 103, 'message': event.candidate}));
        let webRTCSignallingMessage = {'peerId': uuid,
            'captureInputId': captureInputs[0].captureInputId,
            'channelId': captureInputs[0].channelId,
            'jsonMessage': JSON.stringify({'msgId': 104, 'uuid': uuid, 'message': event.candidate})
        };
        socket.emit('client', JSON.stringify({'msgId': 104, 'uuid': uuid, 'data': JSON.stringify(webRTCSignallingMessage)}));
    }
}

function createdDescription(description) {
    console.log('got description');

    peerConnection.setLocalDescription(description).then(function () {
        console.log('sending answer ', peerConnection.localDescription);
        //serverConnection.send(JSON.stringify({'msgId': 102, 'message': peerConnection.localDescription, 'uuid': uuid}));
        let webRTCSignallingMessage = {'peerId': uuid,
            'captureInputId': captureInputs[0].captureInputId,
            'channelId': captureInputs[0].channelId,
            'jsonMessage': JSON.stringify({'msgId': 105, 'uuid': uuid, 'message': peerConnection.localDescription})
        };
        socket.emit('client', JSON.stringify({'msgId': 105, 'uuid': uuid, 'data': JSON.stringify(webRTCSignallingMessage)}));
    }).catch(errorHandler);
}

let remoteVideoCount = 0;
function gotRemoteStream(event) {
    console.log('got remote stream');
    if (remoteVideoCount === 0) {
        remoteVideo.srcObject = event.streams[0];
        remoteVideoCount++;
    }
    else {
        remoteVideo2.srcObject = event.streams[0];
    }
}

function errorHandler(error) {
    console.log(error);
}

// Taken from http://stackoverflow.com/a/105074/515584
// Strictly speaking, it's not a real UUID, but it gets the job done here
function createUUID() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

//100: client connect
//101 configure
//102 get SDP
//103 offer
//104 Ice candidate
//105 answer

//100: get SDP
//101: offer
//102 answer
//103 ice candidate