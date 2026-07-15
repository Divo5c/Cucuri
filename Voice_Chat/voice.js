// public/Voice_Chat/voice.js
document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  let localStream = null;
  let peers = new Map();
  let currentRoomId = null;
  let isMuted = false;
  let username = localStorage.getItem("cucuri_username") || "Unbekannt";

  const getEl = (id) => document.getElementById(id);

  const voiceRoomsList = getEl("voiceRoomsList");
  const participantsGrid = getEl("participantsGrid");
  const currentRoomNameEl = getEl("currentRoomName");
  const voiceStatus = getEl("voiceStatus");
  const adminVoiceControls = getEl("adminVoiceControls");
  const newRoomNameInput = getEl("newRoomName");
  const createRoomBtn = getEl("createRoomBtn");

  const iceConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:openrelay.metered.ca:80" },
    ],
  };

  socket.emit("getVoiceRooms");

  socket.on("voiceRoomsList", (rooms) => renderRooms(rooms));
  socket.on("voiceRoomsUpdated", (rooms) => renderRooms(rooms));

  function renderRooms(rooms) {
    voiceRoomsList.innerHTML = "";
    rooms.forEach((room) => {
      const li = document.createElement("li");
      li.textContent = room.name + (room.isDefault ? " ★" : "");
      li.dataset.roomId = room._id;
      if (room._id === currentRoomId) li.classList.add("active");
      li.addEventListener("click", () => joinVoiceRoom(room._id, room.name));
      voiceRoomsList.appendChild(li);
    });
  }

  async function joinVoiceRoom(roomId, roomName) {
    if (currentRoomId === roomId) return;
    if (currentRoomId) await leaveVoiceRoom();

    currentRoomId = roomId;
    currentRoomNameEl.textContent = roomName;
    voiceStatus.textContent = "Verbinde...";

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      voiceStatus.textContent = "✅ Verbunden";
      if (username === "Divo") adminVoiceControls.classList.remove("hidden");

      addParticipantToUI(username, true);
      socket.emit("joinVoiceRoom", { roomId, username });
    } catch (err) {
      voiceStatus.textContent = "❌ Mikrofon-Fehler";
      console.error(err);
    }
  }

  async function leaveVoiceRoom() {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    peers.forEach((pc) => pc.close());
    peers.clear();
    participantsGrid.innerHTML = "";
    currentRoomId = null;
    voiceStatus.textContent = "Verlassen";
  }

  function addParticipantToUI(name, isLocal = false) {
    if (document.getElementById(`participant-${name}`)) return;

    const div = document.createElement("div");
    div.className = "participant";
    div.id = `participant-${name}`;
    div.innerHTML = `
      <div style="font-size:2.5rem;margin-bottom:10px;">${isLocal ? "🎤" : "👤"}</div>
      <strong>${name}</strong>
      ${isLocal ? '<small style="color:#00FF88;">(Du)</small>' : ""}
    `;
    participantsGrid.appendChild(div);
  }

  // Mute
  getEl("toggleMuteBtn").addEventListener("click", () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    getEl("toggleMuteBtn").textContent = isMuted ? "🔊 Unmute" : "🔇 Mute";
  });

  getEl("leaveVoiceBtn").addEventListener("click", leaveVoiceRoom);

  createRoomBtn.addEventListener("click", () => {
    const name = newRoomNameInput.value.trim();
    if (name) socket.emit("adminCreateVoiceRoom", { name });
    newRoomNameInput.value = "";
  });

  // WebRTC Signaling
  socket.on("userJoinedVoice", async ({ username: newUser }) => {
    if (newUser === username) return;
    addParticipantToUI(newUser);
    const pc = createPeerConnection(newUser);
    peers.set(newUser, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { target: newUser, offer });
  });

  function createPeerConnection(targetUsername) {
    const pc = new RTCPeerConnection(iceConfiguration);

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        socket.emit("iceCandidate", { target: targetUsername, candidate });
    };

    pc.ontrack = (event) => {
      console.log("Audio received from", targetUsername);
    };

    return pc;
  }

  socket.on("offer", async ({ from, offer }) => {
    let pc = peers.get(from);
    if (!pc) {
      pc = createPeerConnection(from);
      peers.set(from, pc);
    }
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { target: from, answer });
  });

  socket.on("answer", async ({ from, answer }) => {
    const pc = peers.get(from);
    if (pc) await pc.setRemoteDescription(answer);
  });

  socket.on("iceCandidate", async ({ from, candidate }) => {
    const pc = peers.get(from);
    if (pc) await pc.addIceCandidate(candidate);
  });

  window.addEventListener("beforeunload", leaveVoiceRoom);
});
