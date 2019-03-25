<template>
    <div id="videos">
        <video id="localVideo" :srcObject.prop="localStream" autoplay muted playsinline></video>
        <video id="remoteVideo" :srcObject.prop="remoteStream" autoplay playsinline></video>
    </div>
</template>

<script>
    export default {
        name: 'VideoFrame',
        data: function () {
            return {
                room: undefined,
                isStarted: false,
                isInitiator: false,
                isChannelReady: false,
                turnReady: false,
                pc: undefined,
                pcConfig: {
                    iceServers: [{
                        'urls': 'stun:global.stun.twilio.com:3478?transport=udp'
                    }]
                },
                localStream: undefined,
                remoteStream: undefined

            }
        },
        methods: {
            requestServers (turnURL) {
                // console.log('PC Config: ' + JSON.stringify(this.pcConfig));

                let turnExists = false;
                for (let iceServer of this.pcConfig.iceServers) {
                    if (iceServer.urls.startsWith('turn:')) {
                        turnExists = true;
                        this.turnReady = true;
                        break;
                    }
                }
                if (!turnExists) {
                    // No TURN server. Get one from computeengineondemand.appspot.com:
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                            let turnServers = JSON.parse(xhr.responseText);

                            for (let server of turnServers.iceServers) {
                                if (server.url.startsWith('turn:')) {
                                    console.log('Got TURN server: ', server.url);
                                    this.pcConfig.iceServers.push({
                                        'urls': 'turn:' + server.username + '@' + server.url,
                                        'credential': server.credential
                                    });
                                }
                            }
                            this.turnReady = true;
                            // console.log('Getting TURN server from ', JSON.stringify(this.pcConfig.iceServers));
                        }
                    };
                    xhr.open('GET', turnURL, true);
                    xhr.send();
                }
            },

            sendMessage (message) {
                console.log('Client sending message: ', message);
                this.$socket.send(JSON.stringify({action: 'message', message: message, 'room': this.room}));
            },
            onOpen () {
                console.log('CONNECTED');
                if (this.room !== '') {
                    this.$socket.send(JSON.stringify({action: 'create or join', room: this.room}));
                    console.log('Attempted to create or join room', this.room);
                }
            },
            onClose () {
                console.log('CLOSED');
            },
            onMessage (event) {
                let data = JSON.parse(event.data);

                switch (data.action) {
                    case 'created': {
                        let room = data.room;
                        console.log('Created room ' + room);
                        this.isInitiator = true;
                        break;
                    }
                    case 'full': {
                        let room = data.room;
                        alert('Room ' + room + ' is full');
                        break;
                    }
                    case 'join': {
                        let room = data.room;
                        console.log('Another peer made a request to join room ' + room);
                        console.log('This peer is the initiator of room ' + room + '!');
                        this.isChannelReady = true;
                        break;
                    }
                    case 'joined': {
                        let room = data.room;
                        console.log('joined: ' + room);
                        this.isChannelReady = true;
                        this.maybeStart();
                        break;
                    }
                    case 'message': {
                        let message = data.message;
                        console.log('Client received message:', message);
                        if (message === 'got user media') {
                            this.maybeStart();
                        } else if (message === 'bye' && this.isStarted) {
                            this.handleRemoteHangup();
                        } else {
                            switch (message.type) {
                                case 'offer':
                                    if (!this.isInitiator && !this.isStarted) {
                                        this.maybeStart();
                                    }
                                    this.pc.setRemoteDescription(new RTCSessionDescription(message)).then(this.doAnswer);
                                    // this.doAnswer();
                                    break;
                                case 'answer':
                                    if (this.isStarted) {
                                        this.pc.setRemoteDescription(new RTCSessionDescription(message));
                                    }
                                    break;
                                case 'candidate':
                                    if (this.isStarted) {
                                        let candidate = new RTCIceCandidate({
                                            sdpMLineIndex: message.label,
                                            candidate: message.candidate
                                        });
                                        this.pc.addIceCandidate(candidate).then(e=> {console.log('adding ice candidate success')}).catch(e=> console.error(e.message));
                                    }
                                    break;
                            }
                        }
                        break;
                    }
                }
            },
            onError (evt) {
                console.log('ERROR', evt.data);
            },

            gotStream (stream) {
                console.log('Adding local stream.');
                this.localStream = stream;
                // this.localVideo.srcObject = stream;
                this.sendMessage('got user media');
                if (this.isInitiator) {
                    this.maybeStart();
                }
            },

            maybeStart () {
                console.log('>>>>>>> maybeStart() ', this.isStarted, this.localStream, this.isChannelReady);
                if (!this.isStarted && this.localStream !== undefined && this.isChannelReady) {
                    console.log('>>>>>> creating peer connection');
                    this.createPeerConnection();
                    this.pc.addStream(this.localStream);
                    this.isStarted = true;
                    console.log('isInitiator', this.isInitiator);
                    if (this.isInitiator) {
                        this.doCall();
                    }
                } else {
                    console.log(`Started: ${this.isStarted} channelReady: ${this.isChannelReady} localStream: ${this.localStream}`);
                    console.log('not start')
                }
            },

            createPeerConnection () {
                try {
                    this.pc = new RTCPeerConnection(null);
                    this.pc.onicecandidate = this.handleIceCandidate;
                    this.pc.onaddstream = this.handleRemoteStreamAdded;
                    this.pc.onremovestream = this.handleRemoteStreamRemoved;
                    console.log('Created RTCPeerConnnection');
                } catch (e) {
                    console.log('Failed to create PeerConnection, exception: ' + e.message);
                    alert('Cannot create RTCPeerConnection object.');
                }
            },

            doCall () {
                // While creating offer, WebRTC will ask for SELF's candidate info and trigger pc.onicecandidate
                // Then "handleIceCandidate" will broadcast SELF's candidate info to room
                // When received OTHER's "candidate" info in "onMessage", will set their info locally by pc.addCandidate()
                console.log('Sending offer to peer');
                // this.pc.createOffer(this.setLocalAndSendMessage, this.handleCreateOfferError);
                this.pc.createOffer().then(
                    this.setLocalAndSendMessage,
                    this.handleCreateOfferError);
            },

            doAnswer () {
                // While creating answer, WebRTC will ask for SELF's candidate info and trigger pc.onicecandidate
                // Then "handleIceCandidate" will broadcast SELF's candidate info to room
                // When received OTHER's "candidate" info in "onMessage", will set their info locally by pc.addCandidate()
                console.log('Sending answer to peer.');
                this.pc.createAnswer().then(
                    this.setLocalAndSendMessage,
                    this.onCreateSessionDescriptionError
                );
            },

            handleIceCandidate (event) {
                // Triggered by creating offer or answer
                console.log('icecandidate event: ', event);
                if (event.candidate) {
                    this.sendMessage({
                        type: 'candidate',
                        label: event.candidate.sdpMLineIndex,
                        id: event.candidate.sdpMid,
                        candidate: event.candidate.candidate
                    });
                } else {
                    console.log('End of candidates.');
                }
            },

            handleRemoteStreamAdded (event) {
                // After SDP exchange and candidate exchange, WebRTC will automatically send streams to each peers
                console.log('Remote stream added.');
                this.remoteStream = event.stream;
                // remoteVideo.srcObject = remoteStream;
            },

            handleRemoteStreamRemoved (event) {
                console.log('Remote stream removed. Event: ', event);
            },

            setLocalAndSendMessage (sessionDescription) {
                this.pc.setLocalDescription(sessionDescription);
                console.log('setLocalAndSendMessage sending message', sessionDescription);
                this.sendMessage(sessionDescription);
            },

            handleCreateOfferError (event) {
                console.log('createOffer() error: ', event);
            },

            onCreateSessionDescriptionError (error) {
                console.trace('Failed to create session description: ' + error.toString());
            },

            handleRemoteHangup () {
                console.log('Session terminated.');
                this.stop();
                // this.isInitiator = false;
            },

            stop () {
                this.isStarted = false;
                this.pc.close();
                this.pc = null;
            },

            init () {
                navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: true
                    })
                    .then(this.gotStream)
                    .catch(function (e) {
                        alert('getUserMedia() error: ' + e.name);
                    });
            }
        },
        async mounted () {
            await this.init();

            this.room = prompt('Enter room name:');
            this.$options.sockets.onopen = this.onOpen;
            this.$options.sockets.onclose = this.onClose;
            this.$options.sockets.onmessage = this.onMessage;
            this.$options.sockets.onerror = this.onError;

            await this.requestServers('https://3hs3ekzhqa.execute-api.us-east-1.amazonaws.com/prod/nat?sig=true');


            // navigator.mediaDevices.getUserMedia({
            //         audio: true,
            //         video: true
            //     })
            //     .then(this.gotStream)
            //     .catch(function (e) {
            //         alert('getUserMedia() error: ' + e.name);
            //     });
        }
    }
</script>
