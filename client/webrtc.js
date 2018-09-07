let localVideo;
let localStream;
let remoteVideo;
let remoteVideo2;
let remoteVideo3;
let remoteVideo4;
//let peerConnection;
let uuid;
let serverConnection;
let captureInputs = [];


let socket = io.connect();
socket.on('connect', function (data) {
    socket.emit('client', JSON.stringify({'msgId': 100, 'uuid': uuid, 'data': ''}));
});

socket.on('CaptureNodeConfigResponse', function (data) {
    captureInputs = [];
    let captureNode = JSON.parse(data);
    _forEach(captureNode.captureInputs, function (ci) {
        _forEach(ci.channels, function (ch) {
            captureInputs.push({'captureInputId': ci.captureInputId, 'channelId': ch.channelId})
        });
    });
    document.getElementById("captureInputs").innerHTML = JSON.stringify(captureInputs);
});


function findPeerFromUuid(peerid) {
    let peer;
    peer = _filter(connections, (c) => {
        return c.peerid === peerid
    });
    return peer[0];
}

socket.on('offer', function (data) {
    let offer = JSON.parse(data);
    console.log('offer ', offer);

    let peer = findPeerFromUuid(offer.peerId);
    if (!_isNil(peer)) {
        let sdp = {'type': "offer", 'sdp': offer.sdp};
        console.log('sdp ', sdp);
        peer.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp)).then(function () {
            // Only create answers in response to offers
            peer.peerConnection.createAnswer().then(function (description) {
                createdDescription(peer, description)
            }).catch(errorHandler);
        }).catch(errorHandler);
    }
    else {
        console.log('cannot find peerId ', offer.peerId);
    }
});

socket.on('iceCandidate', function (data) {
    let candidate = JSON.parse(data);
    console.log('Received ICE candidate ', candidate.ice);

    let peer = findPeerFromUuid(candidate.peerId);
    if (!_isNil(peer)) {
        peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate.ice)).catch(errorHandler);
    }
    else {
        console.log('Cannot find peerId ', candidate.peerId);
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
    remoteVideo3 = document.getElementById('remoteVideo3');
    remoteVideo4 = document.getElementById('remoteVideo4');

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

function start(index) {
    let ci = captureInputs[index];
    if (!_isNil(ci)) {
        console.log('Starting WebRTC connection for captureInput ', ci.captureInputId);
        startWebRTCConnection(ci);
    }
}

function startAll(isCaller) {
    _forEach(captureInputs, (ci) => {
        console.log('Starting WebRTC connection for captureInput ', ci.captureInputId);
        startWebRTCConnection(ci);
    })
}

let connections = [];

function startWebRTCConnection(captureInput) {
    let peerid = createUUID();//uuid + captureInput.captureInputId;
    let peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection.onicecandidate = function (event) {
        gotIceCandidate(event, peerid);
    };
    peerConnection.ontrack = gotRemoteStream;

    let peer = {
        peerid: peerid,
        peerConnection: peerConnection,
        captureInputId: captureInput.captureInputId,
        channelId: captureInput.channelId
    };
    connections.push(peer);

    //peerConnection.addStream(localStream);

    console.log('sending get sdp message');

    //msgId: 102 = getSDP

    let webRTCSignallingMessage = {
        'peerId': peerid,
        'captureInputId': captureInput.captureInputId,
        'channelId': captureInput.channelId,
        'jsonMessage': JSON.stringify({'msgId': 102, 'uuid': peerid, 'message': ''})
    };
    let message = JSON.stringify({
        'msgId': 102,
        'peerId': peerid,
        'data': JSON.stringify(webRTCSignallingMessage)
    });

    socket.emit('client', message);
    console.log('Sending get sdp message ', message);

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
    catch (ex) {

        console.log('Cannot handle incoming message ', ex);

    }
}

function gotIceCandidate(event, peerId) {
    let peer = findPeerFromUuid(peerId);
    if (event.candidate != null) {
        let webRTCSignallingMessage = {
            'peerId': peerId,
            'captureInputId': peer.captureInputId,
            'channelId': peer.channelId,
            'jsonMessage': JSON.stringify({'msgId': 104, 'uuid': peerId, 'message': event.candidate})
        };
        console.log('sending ice candidate ', webRTCSignallingMessage);
        socket.emit('client', JSON.stringify({
            'msgId': 104,
            'uuid': peerId,
            'data': JSON.stringify(webRTCSignallingMessage)
        }));
    }
}

function createdDescription(peer, description) {
    console.log('got description');

    peer.peerConnection.setLocalDescription(description).then(function () {
        console.log('sending answer ', peer.peerConnection.localDescription);

        let webRTCSignallingMessage = {
            'peerId': peer.peerid,
            'captureInputId': peer.captureInputId,
            'channelId': peer.channelId,
            'jsonMessage': JSON.stringify({
                'msgId': 105,
                'uuid': peer.peerid,
                'message': peer.peerConnection.localDescription
            })
        };
        socket.emit('client', JSON.stringify({
            'msgId': 105,
            'uuid': peer.peerid,
            'data': JSON.stringify(webRTCSignallingMessage)
        }));
    }).catch(errorHandler);
}

let remoteVideoCount = 0;

function gotRemoteStream(event) {
    //little dumb; but it is fine for now
    console.log('got remote stream ');
    if (remoteVideoCount === 0) {
        remoteVideo.srcObject = event.streams[0];
    }
    else if (remoteVideoCount === 1){
        remoteVideo2.srcObject = event.streams[0];
    }
    else if (remoteVideoCount === 2)
    {
        remoteVideo3.srcObject = event.streams[0];
    }
    else if (remoteVideoCount === 3)
    {
        remoteVideo4.srcObject = event.streams[0];
    }
    else {
        console.log('No place to view stream');
    }
    remoteVideoCount++;
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


/////////////////////////// lodash functions /////////////////
function _forEach(collection, iteratee) {
    const func = Array.isArray(collection) ? _arrayEach : baseEach
    return func(collection, iteratee)
}

function _filter(array, predicate) {
    let index = -1
    let resIndex = 0
    const length = array == null ? 0 : array.length
    const result = []

    while (++index < length) {
        const value = array[index]
        if (predicate(value, index, array)) {
            result[resIndex++] = value
        }
    }
    return result
}

function _isNil(value) {
    return value == null
}


function _arrayEach(array, iteratee) {
    let index = -1
    const length = array == null ? 0 : array.length

    while (++index < length) {
        if (iteratee(array[index], index, array) === false) {
            break
        }
    }
    return array
}