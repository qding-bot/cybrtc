<template>
    <div id="videos">
        <video id="localVideo" :srcObject.prop="localStream" autoplay muted playsinline></video>
        <video id="remoteVideo" :srcObject.prop="remoteStream" autoplay playsinline></video>
    </div>
</template>

<script>
    export default {
        name: 'VideoFrame',
        props: {
            msg: String,
        },
        data: function () {
            return {
                room: undefined,
                isStarted: false,
                isInitiator: false,
                isChannelReady: false,
                turnReady: false,
                pc: undefined,
                pcConfig: {
                    'iceServers': [{
                        'urls': 'stun:stun.l.google.com:19302'
                    }]
                },
                localStream: undefined,
                remoteStream: undefined

            }
        },
        methods: {
            sendMessage (message) {
                console.log('Client sending message: ', message);
                this.$socket.send(JSON.stringify({action: 'message', message: message, 'room': this.room}));
            },

            maybeStart () {
                console.log('>>>>>>> maybeStart() ', this.isStarted, this.localStream, this.isChannelReady);
                if (!this.isStarted && typeof this.localStream !== 'undefined' && this.isChannelReady) {
                    console.log('>>>>>> creating peer connection');
                    this.createPeerConnection();
                    this.pc.addStream(this.localStream);
                    this.isStarted = true;
                    console.log('isInitiator', this.isInitiator);
                    if (this.isInitiator) {
                        this.doCall();
                    }
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

            handleIceCandidate (event) {
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

            setLocalAndSendMessage (sessionDescription) {
                this.pc.setLocalDescription(sessionDescription);
                console.log('setLocalAndSendMessage sending message', sessionDescription);
                this.sendMessage(sessionDescription);
            },

            handleCreateOfferError (event) {
                console.log('createOffer() error: ', event);
            },

            doCall () {
                console.log('Sending offer to peer');
                this.pc.createOffer(this.setLocalAndSendMessage, this.handleCreateOfferError);
            },

            onCreateSessionDescriptionError (error) {
                console.trace('Failed to create session description: ' + error.toString());
            },

            requestTurn (turnURL) {
                let turnExists = false;
                for (let i in this.pcConfig.iceServers) {
                    if (this.pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
                        turnExists = true;
                        this.turnReady = true;
                        break;
                    }
                }
                if (!turnExists) {
                    console.log('Getting TURN server from ', turnURL);
                    // No TURN server. Get one from computeengineondemand.appspot.com:
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                            let turnServer = JSON.parse(xhr.responseText);
                            console.log('Got TURN server: ', turnServer);
                            this.pcConfig.iceServers.push({
                                'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                                'credential': turnServer.password
                            });
                            this.turnReady = true;
                        }
                    };
                    xhr.open('GET', turnURL, true);
                    xhr.send();
                }
            },

            handleRemoteStreamAdded (event) {
                console.log('Remote stream added.');
                this.remoteStream = event.stream;
                // remoteVideo.srcObject = remoteStream;
            },

            handleRemoteStreamRemoved (event) {
                console.log('Remote stream removed. Event: ', event);
            },

            handleRemoteHangup () {
                console.log('Session terminated.');
                stop();
                this.isInitiator = false;
            },

            stop () {
                this.isStarted = false;
                this.pc.close();
                this.pc = null;
            },

            doAnswer () {
                console.log('Sending answer to peer.');
                this.pc.createAnswer().then(
                    this.setLocalAndSendMessage,
                    this.onCreateSessionDescriptionError
                );
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
                                    this.pc.setRemoteDescription(new RTCSessionDescription(message));
                                    this.doAnswer();
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
                                        this.pc.addIceCandidate(candidate);
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
            }

        },
        mounted () {
            this.room = prompt('Enter room name:');
            this.$options.sockets.onopen = this.onOpen;
            this.$options.sockets.onclose = this.onClose;
            this.$options.sockets.onmessage = this.onMessage;
            this.$options.sockets.onerror = this.onError;

            navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: true
                })
                .then(this.gotStream)
                .catch(function (e) {
                    alert('getUserMedia() error: ' + e.name);
                });
        }
    }
</script>
