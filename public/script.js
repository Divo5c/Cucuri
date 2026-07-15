document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  const getEl = (id) => document.getElementById(id);

  const authModal = getEl("authModal");
  const chatContainer = getEl("chatContainer");
  const registerTab = getEl("registerTab");
  const loginTab = getEl("loginTab");

  const regUsername = getEl("regUsername");
  const regPassword = getEl("regPassword");
  const registerBtn = getEl("registerBtn");
  const registerError = getEl("registerError");

  const loginUsername = getEl("loginUsername");
  const loginPassword = getEl("loginPassword");
  const loginBtn = getEl("loginBtn");
  const loginError = getEl("loginError");

  const switchToLogin = getEl("switchToLogin");
  const switchToRegister = getEl("switchToRegister");
  const closeBtn = getEl("closeBtn"); // existiert im HTML nicht mehr, stört aber nicht

  const messages = getEl("messages");
  const messageInput = getEl("messageInput");
  const sendBtn = getEl("sendBtn");
  const onlineList = getEl("onlineList");

  const gamesMenu = getEl("gamesMenu");
  const toggleGamesBtn = getEl("toggleGamesBtn");

  const adminToggle = getEl("adminToggle");
  const adminPanel = getEl("adminPanel");
  const adminNameEl = getEl("adminName");
  const banUsernameInput = getEl("banUsername");
  const banBtn = getEl("banBtn");
  const oldNameInput = getEl("oldName");
  const newNameInput = getEl("newName");
  const renameBtn = getEl("renameBtn");
  const clearChatBtn = getEl("clearChatBtn");

  // Voice-Button
  const voiceChatBtn = getEl("voiceChatBtn");

  // NEU: Jugendwort-Button + Modal
  const jugendwortBtn = getEl("jugendwortBtn");
  const jugendwortModal = getEl("jugendwortModal");
  const jwCloseBtn = getEl("jwCloseBtn");

  // Tabs
  if (switchToLogin) {
    switchToLogin.addEventListener("click", (e) => {
      e.preventDefault();
      registerTab.classList.remove("active");
      loginTab.classList.add("active");
      if (registerError) registerError.textContent = "";
    });
  }

  if (switchToRegister) {
    switchToRegister.addEventListener("click", (e) => {
      e.preventDefault();
      loginTab.classList.remove("active");
      registerTab.classList.add("active");
      if (loginError) loginError.textContent = "";
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (authModal) authModal.classList.remove("active");
    });
  }

  // ==================== REGISTER ====================

  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      const username = regUsername.value.trim();
      const password = regPassword.value.trim();
      if (!username || !password) {
        if (registerError) registerError.textContent = "Bitte alles ausfüllen!";
        return;
      }
      socket.emit("register", { username, password });
    });
  }

  // ENTER für Register
  function handleRegisterEnter(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (registerBtn) registerBtn.click();
    }
  }
  if (regUsername) regUsername.addEventListener("keydown", handleRegisterEnter);
  if (regPassword) regPassword.addEventListener("keydown", handleRegisterEnter);

  socket.on("registerSuccess", () => {
    if (registerError) {
      registerError.style.color = "green";
      registerError.textContent = "Erfolgreich! Bitte einloggen.";
    }
    setTimeout(() => {
      if (registerTab && loginTab) {
        registerTab.classList.remove("active");
        loginTab.classList.add("active");
      }
      if (registerError) {
        registerError.textContent = "";
        registerError.style.color = "red";
      }
    }, 1500);
  });

  socket.on("registerError", (err) => {
    if (registerError) {
      registerError.style.color = "red";
      registerError.textContent = err;
    }
  });

  // ==================== LOGIN ====================

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      if (loginError) loginError.textContent = "Lade...";
      const username = loginUsername.value.trim();
      const password = loginPassword.value.trim();
      if (!username || !password) {
        if (loginError) loginError.textContent = "Bitte alles ausfüllen!";
        return;
      }
      socket.emit("login", { username, password });
    });
  }

  // ENTER für Login
  function handleLoginEnter(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (loginBtn) loginBtn.click();
    }
  }
  if (loginUsername)
    loginUsername.addEventListener("keydown", handleLoginEnter);
  if (loginPassword)
    loginPassword.addEventListener("keydown", handleLoginEnter);

  socket.on("loginSuccess", (username) => {
    try {
      localStorage.setItem("cucuri_username", username);
    } catch {}

    if (authModal) authModal.classList.remove("active");
    if (chatContainer) {
      chatContainer.classList.remove("hidden");
      chatContainer.style.display = "flex";
    }

    // Admin sichtbar machen, wenn Divo
    if (username === "Divo" && adminToggle && adminPanel && adminNameEl) {
      adminToggle.classList.remove("hidden");
      adminNameEl.textContent = username;

      adminToggle.addEventListener("click", () => {
        const isHidden = adminPanel.classList.contains("hidden");
        adminPanel.classList.toggle("hidden", !isHidden);
        adminToggle.classList.toggle("active", isHidden);
      });
    }

    // Jugendwort-Button nur für Divo anzeigen
    if (username === "Divo" && jugendwortBtn) {
      jugendwortBtn.classList.remove("hidden");
    }

    // Voice Button nach Login anzeigen
    if (voiceChatBtn) voiceChatBtn.classList.remove("hidden");
  });

  socket.on("loginError", (err) => {
    if (loginError) loginError.textContent = err;
  });

  // ==================== CHAT-HISTORIE ====================

  socket.on("loadHistory", (history) => {
    if (!messages) return;
    messages.innerHTML = "";
    history.forEach((data) => addMessageToDom(data));
    messages.scrollTop = messages.scrollHeight;
  });

  // Nachricht senden
  function sendMessage() {
    const msg = messageInput.value.trim();
    if (msg) {
      socket.emit("chatMessage", msg);
      messageInput.value = "";
    }
  }

  if (sendBtn) sendBtn.addEventListener("click", sendMessage);
  if (messageInput) {
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }

  // Nachricht empfangen
  socket.on("chatMessage", (data) => {
    if (!messages) return;
    addMessageToDom(data);
    messages.scrollTop = messages.scrollHeight;
  });

  function addMessageToDom(data) {
    if (!messages) return;
    const div = document.createElement("div");
    div.classList.add("message");
    div.dataset.id = data._id || "";

    const currentUser = localStorage.getItem("cucuri_username");

    div.innerHTML = `
      <div class="msg-header">
        <span class="msg-username">${data.username}</span>
        <div class="msg-meta">
          <time class="msg-time">${data.timestamp || ""}</time>
        </div>
      </div>
      <div class="msg-text">${data.msg}</div>
    `;

    if (currentUser === "Divo" && data._id) {
      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("msg-delete-btn");
      deleteBtn.innerHTML = "🗑";

      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Diese Nachricht löschen?")) {
          socket.emit("adminDeleteMessage", { id: data._id });
        }
      });

      const meta = div.querySelector(".msg-meta");
      meta.appendChild(deleteBtn);

      div.classList.add("deletable");
    }

    messages.appendChild(div);
  }

  // Nachricht entfernt (von Admin)
  socket.on("adminMessageDeleted", ({ id }) => {
    if (!messages || !id) return;
    const nodes = messages.querySelectorAll(".message");
    nodes.forEach((node) => {
      if (node.dataset.id === id) {
        node.remove();
      }
    });
  });

  // User-Liste
  socket.on("updateUserList", (data) => {
    if (!onlineList) return;
    onlineList.innerHTML = "";
    data.online.forEach((user) => {
      const li = document.createElement("li");
      li.innerHTML = `🟢 ${user}`;
      li.style.background = "rgba(0,255,136,0.2)";
      onlineList.appendChild(li);
    });
    data.offline.forEach((user) => {
      const li = document.createElement("li");
      li.innerHTML = `🔴 ${user}`;
      li.style.background = "rgba(255,0,0,0.2)";
      li.style.color = "#ccc";
      onlineList.appendChild(li);
    });
  });

  socket.on("userJoined", (username) => {
    if (!messages) return;
    const div = document.createElement("div");
    div.classList.add("message");
    div.style.color = "#00FF88";
    div.textContent = `➕ ${username} ist beigetreten`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

  socket.on("userLeft", (username) => {
    if (!messages) return;
    const div = document.createElement("div");
    div.classList.add("message");
    div.style.color = "#FF4444";
    div.textContent = `➖ ${username} hat verlassen`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

  // Games Menü
  if (gamesMenu && toggleGamesBtn) {
    if (window.innerWidth <= 768) {
      gamesMenu.classList.add("closed");
    }
    toggleGamesBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      gamesMenu.classList.toggle("closed");
    });
    document.addEventListener("click", (e) => {
      if (
        window.innerWidth <= 768 &&
        !gamesMenu.classList.contains("closed") &&
        !gamesMenu.contains(e.target)
      ) {
        gamesMenu.classList.add("closed");
      }
    });
  }

  // Admin-Funktionen
  if (banBtn && banUsernameInput) {
    banBtn.addEventListener("click", () => {
      const user = banUsernameInput.value.trim();
      if (!user) return alert("Username eingeben.");
      socket.emit("adminToggleBan", { username: user });
    });
  }

  if (renameBtn && oldNameInput && newNameInput) {
    renameBtn.addEventListener("click", () => {
      const oldName = oldNameInput.value.trim();
      const newName = newNameInput.value.trim();
      if (!oldName || !newName) return alert("Beide Felder ausfüllen.");
      socket.emit("adminRenameUser", { oldName, newName });
    });
  }

  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      if (!confirm("Gesamten Chat wirklich löschen?")) return;
      socket.emit("adminClearChat");
    });
  }

  socket.on("adminActionResult", (data) => {
    alert(data.message || "Admin-Aktion ausgeführt.");
  });

  // ==================== Jugendwort Ergebnis-Modal ====================

  if (jugendwortBtn && jugendwortModal) {
    jugendwortBtn.addEventListener("click", () => {
      jugendwortModal.classList.add("active");
    });
  }

  if (jwCloseBtn && jugendwortModal) {
    jwCloseBtn.addEventListener("click", () => {
      jugendwortModal.classList.remove("active");
    });
  }

  // ==================== VOICE CHAT INTEGRATION (Mini-Panel) ====================

  const voiceSidebar = document.getElementById("voiceSidebar");
  const voiceCollapseBtn = document.getElementById("voiceCollapseBtn");
  const voiceJoinBtn = document.getElementById("voiceJoinBtn");
  const voiceMuteMiniBtn = document.getElementById("voiceMuteMiniBtn");
  const voiceStatusMini = document.getElementById("voiceStatusMini");
  const voiceParticipantsMini = document.getElementById(
    "voiceParticipantsMini",
  );

  let vcLocalStream = null;
  let vcPeers = new Map(); // socketId -> RTCPeerConnection
  let vcRoomId = "lobby"; // ein fester Standard-Raum
  let vcMuted = false;

  const vcIceConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:openrelay.metered.ca:80" },
    ],
  };

  function vcSetStatus(text) {
    if (voiceStatusMini) voiceStatusMini.textContent = text;
  }

  function vcAddParticipant(id, label, isYou = false) {
    if (!voiceParticipantsMini) return;
    const existing = voiceParticipantsMini.querySelector(
      `[data-vp-id="${id}"]`,
    );
    if (existing) return;

    const li = document.createElement("li");
    li.dataset.vpId = id;
    li.innerHTML = `
      <div class="vp-name">
        <span class="vp-icon">${isYou ? "🎤" : "👤"}</span>
        <span>${label}</span>
        ${isYou ? '<span class="vp-you">(Du)</span>' : ""}
      </div>
    `;
    voiceParticipantsMini.appendChild(li);
  }

  function vcRemoveParticipant(id) {
    if (!voiceParticipantsMini) return;
    const el = voiceParticipantsMini.querySelector(`[data-vp-id="${id}"]`);
    if (el) el.remove();
  }

  function vcClearParticipants() {
    if (voiceParticipantsMini) voiceParticipantsMini.innerHTML = "";
  }

  // Sidebar ein-/ausklappen
  if (voiceCollapseBtn && voiceSidebar) {
    voiceCollapseBtn.addEventListener("click", () => {
      voiceSidebar.classList.toggle("collapsed");
    });
  }

  async function vcStartLocalAudio() {
    vcLocalStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    vcSetStatus("Mikro aktiv");
    const currentUser = localStorage.getItem("cucuri_username") || "Du";
    vcAddParticipant("local", currentUser, true);
  }

  async function vcJoinRoom() {
    if (vcLocalStream) {
      // schon drin
      return;
    }
    try {
      await vcStartLocalAudio();
      const currentUser =
        localStorage.getItem("cucuri_username") || "Unbekannt";
      socket.emit("joinVoiceRoom", { roomId: vcRoomId, username: currentUser });
      vcSetStatus("Verbinde...");
    } catch (err) {
      console.error("VC Mikro Fehler:", err);
      vcSetStatus("Mikro-Fehler");
    }
  }

  async function vcLeaveRoom() {
    if (vcLocalStream) {
      vcLocalStream.getTracks().forEach((t) => t.stop());
      vcLocalStream = null;
    }
    vcPeers.forEach((pc) => pc.close());
    vcPeers.clear();
    vcClearParticipants();
    vcSetStatus("Nicht verbunden");
  }

  function vcCreatePeerConnection(peerSocketId) {
    const pc = new RTCPeerConnection(vcIceConfig);

    if (vcLocalStream) {
      vcLocalStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, vcLocalStream));
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit("iceCandidate", { targetId: peerSocketId, candidate });
      }
    };

    pc.ontrack = (event) => {
      // Fürs Mini-Widget machen wir nur Audio, kein UI-Element pro Stream
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = event.streams[0];
    };

    return pc;
  }

  if (voiceJoinBtn) {
    voiceJoinBtn.addEventListener("click", () => {
      if (!vcLocalStream) {
        vcJoinRoom();
        voiceJoinBtn.textContent = "Leave";
      } else {
        vcLeaveRoom();
        voiceJoinBtn.textContent = "Join Voice";
      }
    });
  }

  if (voiceMuteMiniBtn) {
    voiceMuteMiniBtn.addEventListener("click", () => {
      if (!vcLocalStream) return;
      vcMuted = !vcMuted;
      vcLocalStream.getAudioTracks().forEach((t) => (t.enabled = !vcMuted));
      voiceMuteMiniBtn.textContent = vcMuted ? "Unmute" : "Mute";
    });
  }

  // Signaling (wiederverwendet server.js-Logik)

  socket.on("voicePeers", async (peerIds) => {
    const currentUser = localStorage.getItem("cucuri_username") || "Unbekannt";
    vcSetStatus("Verbunden");
    vcAddParticipant("local", currentUser, true);

    for (const peerId of peerIds) {
      if (!peerId) continue;
      vcAddParticipant(peerId, "User");
      const pc = vcCreatePeerConnection(peerId);
      vcPeers.set(peerId, pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { targetId: peerId, offer });
    }
  });

  socket.on("userJoinedVoice", ({ socketId, username }) => {
    if (!socketId) return;
    vcAddParticipant(socketId, username || "User");
  });

  socket.on("offer", async ({ fromId, offer }) => {
    let pc = vcPeers.get(fromId);
    if (!pc) {
      pc = vcCreatePeerConnection(fromId);
      vcPeers.set(fromId, pc);
    }
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { targetId: fromId, answer });
  });

  socket.on("answer", async ({ fromId, answer }) => {
    const pc = vcPeers.get(fromId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  });

  socket.on("iceCandidate", async ({ fromId, candidate }) => {
    const pc = vcPeers.get(fromId);
    if (pc && candidate) {
      await pc.addIceCandidate(candidate);
    }
  });

  socket.on("userLeftVoice", ({ socketId }) => {
    const pc = vcPeers.get(socketId);
    if (pc) {
      pc.close();
      vcPeers.delete(socketId);
    }
    vcRemoveParticipant(socketId);
  });

  window.addEventListener("beforeunload", vcLeaveRoom);

  // Voice-Button im Header: einfach Sidebar fokussieren
  if (voiceChatBtn && voiceSidebar) {
    voiceChatBtn.addEventListener("click", () => {
      voiceSidebar.classList.remove("collapsed");
      voiceSidebar.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
});
