const socket = io('http://192.168.1.7:3000'); // ✅ Your real Wi-Fi IP

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || 'default-room';
socket.emit('join-room', roomId);


let localStream;
let peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const videoGrid = document.getElementById('video-grid');
const localVideo = document.createElement('video');
localVideo.autoplay = true;
localVideo.muted = true;
videoGrid.appendChild(localVideo);

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  localVideo.srcObject = stream;

  peerConnection = new RTCPeerConnection(config);
  stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

  peerConnection.ontrack = event => {
    const remoteVideo = document.createElement('video');
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.autoplay = true;
    videoGrid.appendChild(remoteVideo);
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('signal', { to: roomId, data: { candidate: event.candidate } });
    }
  };

  socket.on('user-joined', async id => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: id, data: { sdp: offer } });
  });

  socket.on('signal', async ({ from, data }) => {
    if (data.sdp) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === 'offer') {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { to: from, data: { sdp: answer } });
      }
    }
    if (data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  });

  // ✅ Mute button
  document.getElementById('muteBtn').onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('muteBtn').innerText = audioTrack.enabled ? '🎙️ Mute' : '🔇 Unmute';
  };

  // ✅ Video button
  document.getElementById('videoBtn').onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById('videoBtn').innerText = videoTrack.enabled ? '🎥 Stop Video' : '📷 Start Video';
  };

  // ✅ Screen share
  document.getElementById('screenBtn').onclick = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    sender.replaceTrack(screenTrack);

    screenTrack.onended = () => {
      sender.replaceTrack(localStream.getVideoTracks()[0]);
    };
  };

  // ✅ Leave
  document.getElementById('leaveBtn').onclick = () => {
    window.location.reload();
  };
});

// ✅ Whiteboard
const canvas = document.getElementById('whiteboard');
canvas.hidden = true;
const ctx = canvas.getContext('2d');
let drawing = false;

document.getElementById('whiteboardBtn').onclick = () => {
  canvas.hidden = !canvas.hidden;
};

canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseleave', () => drawing = false);
canvas.addEventListener('mousemove', e => {
  if (!drawing) return;
  const x = e.offsetX;
  const y = e.offsetY;
  ctx.fillRect(x, y, 2, 2);
  socket.emit('whiteboard', { x, y });
});

socket.on('whiteboard', data => {
  ctx.fillRect(data.x, data.y, 2, 2);
});

// ✅ File Sharing
const fileInput = document.getElementById('fileInput');
document.getElementById('fileBtn').onclick = () => fileInput.click();

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    socket.emit('file', { name: file.name, content: reader.result });
    alert(`Sent: ${file.name}`);
  };
  reader.readAsDataURL(file);
});

socket.on('file', ({ name, content }) => {
  const link = document.createElement('a');
  link.href = content;
  link.download = name;
  link.innerText = `Download ${name}`;
  link.style.display = 'block';
  document.body.appendChild(link);
});
