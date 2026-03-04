document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (el, text) => { if (el) el.textContent = text || ''; };
  const show = (el) => { if (el) el.classList.remove('hidden'); };
  const hide = (el) => { if (el) el.classList.add('hidden'); };
  const setActive = (el, on) => { if (el) el.classList.toggle('active', !!on); };

  // ---------- Elements ----------
  const authModal = $('authModal');
  const chatContainer = $('chatContainer');

  const registerTab = $('registerTab');
  const loginTab = $('loginTab');

  const regUsername = $('regUsername');
  const regPassword = $('regPassword');
  const registerBtn = $('registerBtn');
  const registerError = $('registerError');

  const loginUsername = $('loginUsername');
  const loginPassword = $('loginPassword');
  const loginBtn = $('loginBtn');
  const loginError = $('loginError');

  const switchToLogin = $('switchToLogin');
  const switchToRegister = $('switchToRegister');
  const closeBtn = $('closeBtn');

  const messages = $('messages');
  const messageInput = $('messageInput');
  const sendBtn = $('sendBtn');

  const onlineList = $('onlineList');
  const onlineCount = $('onlineCount'); // optional (falls du es noch irgendwo hast)

  // Games menu (optional)
  const gamesMenu = $('gamesMenu');
  const toggleGamesBtn = $('toggleGamesBtn');

  // ---------- Tab switching ----------
  function openLogin() {
    setActive(loginTab, true);
    setActive(registerTab, false);
    setText(registerError, '');
    setText(loginError, '');
  }

  function openRegister() {
    setActive(registerTab, true);
    setActive(loginTab, false);
    setText(registerError, '');
    setText(loginError, '');
  }

  if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      openLogin();
    });
  }

  if (switchToRegister) {
    switchToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      openRegister();
    });
  }

  // Close button: optional; ich lasse es zu, aber Login ist dann nicht möglich
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (authModal) authModal.classList.remove('active');
    });
  }

  // ---------- Register/Login ----------
  function doRegister() {
    const username = (regUsername?.value || '').trim();
    const password = (regPassword?.value || '').trim();

    if (username.length < 3 || !password) {
      setText(registerError, 'Username min. 3 Zeichen + Passwort nötig.');
      return;
    }
    setText(registerError, '…');
    socket.emit('register', { username, password });
  }

  function doLogin() {
    const username = (loginUsername?.value || '').trim();
    const password = (loginPassword?.value || '').trim();

    if (!username || !password) {
      setText(loginError, 'Bitte Username + Passwort eingeben.');
      return;
    }
    setText(loginError, '…');
    socket.emit('login', { username, password });
  }

  if (registerBtn) registerBtn.addEventListener('click', doRegister);
  if (loginBtn) loginBtn.addEventListener('click', doLogin);

  // ---------- Socket connection feedback ----------
  socket.on('connect', () => {
    // Wenn du willst: setText(loginError, '');
  });

  socket.on('connect_error', (err) => {
    // Sehr hilfreich auf Render / Handy
    setText(loginError, `Server nicht erreichbar: ${err?.message || err}`);
  });

  // ---------- Auth responses ----------
  socket.on('registerSuccess', () => {
    setText(registerError, '✅ Registriert! Du kannst dich jetzt einloggen.');
    // optional automatisch auf Login wechseln:
    openLogin();
  });

  socket.on('registerError', (err) => {
    setText(registerError, `❌ ${err}`);
  });

  socket.on('loginSuccess', () => {
    // Modal aus, Chat an
    if (authModal) authModal.classList.remove('active');
    if (chatContainer) {
      chatContainer.classList.remove('hidden');
      chatContainer.style.display = 'flex';
    }
    if (messageInput) messageInput.focus();
    setText(loginError, '');
  });

  socket.on('loginError', (err) => {
    setText(loginError, `❌ ${err}`);
  });

  // ---------- Chat send ----------
  function sendMessage() {
    const msg = (messageInput?.value || '').trim();
    if (!msg) return;
    socket.emit('chatMessage', msg);
    messageInput.value = '';
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // ---------- Chat receive ----------
  socket.on('chatMessage', (data) => {
    if (!messages) return;
    const div = document.createElement('div');
    div.classList.add('message');
    div.innerHTML = `<strong>${data.username}</strong> <time>${data.timestamp || ''}</time><br>${data.msg}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

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

  // ---------- User list (online/offline) ----------
  // Neuer Server-Eventname:
  socket.on('updateUserList', (data) => {
    if (!onlineList) return;
    onlineList.innerHTML = '';

    const online = Array.isArray(data?.online) ? data.online : [];
    const offline = Array.isArray(data?.offline) ? data.offline : [];

    if (onlineCount) onlineCount.textContent = String(online.length);

    online.forEach((user) => {
      const li = document.createElement('li');
      li.textContent = `🟢 ${user}`;
      li.style.background = 'rgba(0,255,136,0.2)';
      onlineList.appendChild(li);
    });

    offline.forEach((user) => {
      const li = document.createElement('li');
      li.textContent = `🔴 ${user}`;
      li.style.background = 'rgba(255,0,0,0.15)';
      li.style.color = '#ccc';
      onlineList.appendChild(li);
    });
  });

  // Fallback, falls du noch den alten Event irgendwo hast:
  socket.on('onlineUsersUpdate', (users) => {
    if (!onlineList) return;
    onlineList.innerHTML = '';
    (users || []).forEach((user) => {
      const li = document.createElement('li');
      li.textContent = `🟢 ${user}`;
      onlineList.appendChild(li);
    });
    if (onlineCount) onlineCount.textContent = String((users || []).length);
  });

  // ---------- Games menu (optional) ----------
  if (gamesMenu && toggleGamesBtn) {
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

    if (isMobile()) gamesMenu.classList.add('closed');

    toggleGamesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      gamesMenu.classList.toggle('closed');
    });

    document.addEventListener('click', (e) => {
      if (isMobile() && !gamesMenu.classList.contains('closed') && !gamesMenu.contains(e.target)) {
        gamesMenu.classList.add('closed');
      }
    });

    window.addEventListener('resize', () => {
      if (isMobile()) gamesMenu.classList.add('closed');
      else gamesMenu.classList.remove('closed');
    });
  }
});
