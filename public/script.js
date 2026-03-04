document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // Elemente sicher holen (damit es nicht abstürzt, wenn etwas fehlt)
  const getEl = (id) => document.getElementById(id);
  
  const authModal = getEl('authModal');
  const chatContainer = getEl('chatContainer');
  const registerTab = getEl('registerTab');
  const loginTab = getEl('loginTab');

  const regUsername = getEl('regUsername');
  const regPassword = getEl('regPassword');
  const registerBtn = getEl('registerBtn');
  const registerError = getEl('registerError');

  const loginUsername = getEl('loginUsername');
  const loginPassword = getEl('loginPassword');
  const loginBtn = getEl('loginBtn');
  const loginError = getEl('loginError');

  const switchToLogin = getEl('switchToLogin');
  const switchToRegister = getEl('switchToRegister');
  const closeBtn = getEl('closeBtn');

  const messages = getEl('messages');
  const messageInput = getEl('messageInput');
  const sendBtn = getEl('sendBtn');
  const onlineList = getEl('onlineList');

  const gamesMenu = getEl('gamesMenu');
  const toggleGamesBtn = getEl('toggleGamesBtn');

  // ---------- Tabs wechseln ----------
  if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      registerTab.classList.remove('active');
      loginTab.classList.add('active');
      if (registerError) registerError.textContent = '';
    });
  }

  if (switchToRegister) {
    switchToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      loginTab.classList.remove('active');
      registerTab.classList.add('active');
      if (loginError) loginError.textContent = '';
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (authModal) authModal.classList.remove('active');
    });
  }

  // ---------- Registrieren ----------
  if (registerBtn) {
    registerBtn.addEventListener('click', () => {
      const username = regUsername.value.trim();
      const password = regPassword.value.trim();
      if (!username || !password) {
        if (registerError) registerError.textContent = 'Bitte alles ausfüllen!';
        return;
      }
      socket.emit('register', { username, password });
    });
  }

  socket.on('registerSuccess', () => {
    if (registerError) {
      registerError.style.color = 'green';
      registerError.textContent = 'Erfolgreich! Bitte einloggen.';
    }
    setTimeout(() => {
      if (registerTab && loginTab) {
        registerTab.classList.remove('active');
        loginTab.classList.add('active');
      }
      if (registerError) registerError.textContent = '';
    }, 1500);
  });

  socket.on('registerError', (err) => {
    if (registerError) {
      registerError.style.color = 'red';
      registerError.textContent = err;
    }
  });

  // ---------- Einloggen ----------
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      if (loginError) loginError.textContent = 'Lade...'; // Zeigt, dass der Knopf geklickt wurde!
      
      const username = loginUsername.value.trim();
      const password = loginPassword.value.trim();
      
      if (!username || !password) {
        if (loginError) loginError.textContent = 'Bitte alles ausfüllen!';
        return;
      }
      socket.emit('login', { username, password });
    });
  }

  socket.on('loginSuccess', (username) => {
    if (authModal) authModal.classList.remove('active');
    if (chatContainer) {
      chatContainer.classList.remove('hidden');
      chatContainer.style.display = 'flex';
    }
  });

  socket.on('loginError', (err) => {
    if (loginError) loginError.textContent = err;
  });

  // ---------- Chat Historie (Die letzten 100) ----------
  socket.on('loadHistory', (history) => {
    if (!messages) return;
    messages.innerHTML = ''; 
    
    history.forEach(data => {
      const div = document.createElement('div');
      div.classList.add('message');
      div.innerHTML = `<strong>${data.username}</strong> <time>${data.timestamp || ''}</time><br>${data.msg}`;
      messages.appendChild(div);
    });
    
    messages.scrollTop = messages.scrollHeight;
  });

  // ---------- Chat Senden ----------
  function sendMessage() {
    const msg = messageInput.value.trim();
    if (msg) {
      socket.emit('chatMessage', msg);
      messageInput.value = '';
    }
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // ---------- Nachrichten empfangen ----------
  socket.on('chatMessage', (data) => {
    if (!messages) return;
    const div = document.createElement('div');
    div.classList.add('message');
    div.innerHTML = `<strong>${data.username}</strong> <time>${data.timestamp || ''}</time><br>${data.msg}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

  // ---------- User Liste Update ----------
  socket.on('updateUserList', (data) => {
    if (!onlineList) return;
    onlineList.innerHTML = '';
    
    data.online.forEach(user => {
      const li = document.createElement('li');
      li.innerHTML = `🟢 ${user}`;
      li.style.background = 'rgba(0,255,136,0.2)';
      onlineList.appendChild(li);
    });

    data.offline.forEach(user => {
      const li = document.createElement('li');
      li.innerHTML = `🔴 ${user}`;
      li.style.background = 'rgba(255,0,0,0.2)';
      li.style.color = '#ccc';
      onlineList.appendChild(li);
    });
  });

  // ---------- Join / Leave Alerts ----------
  socket.on('userJoined', (username) => {
    if (!messages) return;
    const div = document.createElement('div');
    div.classList.add('message');
    div.style.color = '#00FF88';
    div.textContent = `➕ ${username} ist beigetreten`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

  socket.on('userLeft', (username) => {
    if (!messages) return;
    const div = document.createElement('div');
    div.classList.add('message');
    div.style.color = '#FF4444';
    div.textContent = `➖ ${username} hat verlassen`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

  // ---------- Games Menü Toggle ----------
  if (gamesMenu && toggleGamesBtn) {
    if (window.innerWidth <= 768) {
      gamesMenu.classList.add('closed');
    }

    toggleGamesBtn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      gamesMenu.classList.toggle('closed');
    });

    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && !gamesMenu.classList.contains('closed') && !gamesMenu.contains(e.target)) {
        gamesMenu.classList.add('closed');
      }
    });
  }
});
