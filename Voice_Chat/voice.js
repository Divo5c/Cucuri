// public/Voice_Chat/voice.js
document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  let localStream = null;
  let peers = new Map(); // socketId -> RTCPeerConnection
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
  const toggleMuteBtn = getEl("toggleMuteBtn");
  const leaveVoiceBtn = getEl("leaveVoiceBtn");

  const iceConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:openrelay.metered.ca:80" },
    ],
  };

  // Räume vom Server holen
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

    // alten Raum verlassen
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

      voiceStatus.textContent = "✅ Mikrofon aktiv";
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

    // alle Remote-Audio-Elemente entfernen
    document
      .querySelectorAll("audio[id^='audio-']")
      .forEach((el) => el.remove());
  }

  function addParticipantToUI(nameOrId, isLocal = false) {
    const id = `participant-${nameOrId}`;
    if (document.getElementById(id)) return;

    const div = document.createElement("div");
    div.className = "participant";
    div.id = id;
    div.innerHTML = `
      <div style="font-size:2.5rem;margin-bottom:10px;">${isLocal ? "🎤" : "👤"}</div>
      <strong>${isLocal ? username : nameOrId}</strong>
      ${isLocal ? '<small style="color:#00FF88;">(Du)</small>' : ""}
    `;
    participantsGrid.appendChild(div);
  }

  // Mute
  toggleMuteBtn.addEventListener("click", () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    toggleMuteBtn.textContent = isMuted ? "🔊 Unmute" : "🔇 Mute";
  });

  leaveVoiceBtn.addEventListener("click", leaveVoiceRoom);

  createRoomBtn.addEventListener("click", () => {
    const name = newRoomNameInput.value.trim();
    if (name) socket.emit("adminCreateVoiceRoom", { name });
    newRoomNameInput.value = "";
  });

  // ========== WebRTC / Signaling ==========

  function createPeerConnection(peerSocketId) {
    const pc = new RTCPeerConnection(iceConfiguration);

    if (localStream) {
      localStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit("iceCandidate", { targetId: peerSocketId, candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log("Audio-Stream von", peerSocketId);

      let audioEl = document.getElementById(`audio-${peerSocketId}`);
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `audio-${peerSocketId}`;
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
      }

      const [remoteStream] = event.streams;
      if (remoteStream) {
        audioEl.srcObject = remoteStream;
      }
    };

    return pc;
  }

  // Wenn wir die Liste der vorhandenen Peers im Raum bekommen
  socket.on("voicePeers", async (peerIds) => {
    for (const peerId of peerIds) {
      addParticipantToUI(peerId, false);
      const pc = createPeerConnection(peerId);
      peers.set(peerId, pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { targetId: peerId, offer });
    }
  });

  // Ein neuer User joint den Raum (nur UI, Verbindung kommt über offer/answer)
  socket.on("userJoinedVoice", ({ socketId, username: peerName }) => {
    addParticipantToUI(socketId, false);
  });

  socket.on("offer", async ({ fromId, offer }) => {
    let pc = peers.get(fromId);
    if (!pc) {
      pc = createPeerConnection(fromId);
      peers.set(fromId, pc);
    }
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { targetId: fromId, answer });
  });

  socket.on("answer", async ({ fromId, answer }) => {
    const pc = peers.get(fromId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  });

  socket.on("iceCandidate", async ({ fromId, candidate }) => {
    const pc = peers.get(fromId);
    if (pc && candidate) {
      await pc.addIceCandidate(candidate);
    }
  });

  socket.on("userLeftVoice", ({ socketId }) => {
    const pc = peers.get(socketId);
    if (pc) {
      pc.close();
      peers.delete(socketId);
    }
    const el = document.getElementById(`participant-${socketId}`);
    if (el) el.remove();

    const audioEl = document.getElementById(`audio-${socketId}`);
    if (audioEl) audioEl.remove();
  });

  window.addEventListener("beforeunload", leaveVoiceRoom);
});
