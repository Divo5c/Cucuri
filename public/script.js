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
  const closeBtn = getEl("closeBtn");

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

  // === NEU: Voice Button ===
  const voiceChatBtn = getEl("voiceChatBtn");

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

  // Registrieren
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

  // Login
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

    // Voice Button nach Login anzeigen
    if (voiceChatBtn) voiceChatBtn.classList.remove("hidden");
  });

  socket.on("loginError", (err) => {
    if (loginError) loginError.textContent = err;
  });

  // Chat-Historie
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
    div.innerHTML = `<strong>${data.username}</strong> <time>${data.timestamp || ""}</time><br>${data.msg}`;

    const currentUser = localStorage.getItem("cucuri_username");
    if (currentUser === "Divo" && data._id) {
      div.classList.add("deletable");
      div.addEventListener("click", () => {
        if (confirm("Diese Nachricht löschen?")) {
          socket.emit("adminDeleteMessage", { id: data._id });
        }
      });
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

  // ==================== VOICE CHAT INTEGRATION ====================
  if (voiceChatBtn) {
    voiceChatBtn.addEventListener("click", () => {
      window.open("/Voice_Chat/voice.html", "_blank");
    });
  }
});
