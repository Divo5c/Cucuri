document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const authModal = document.getElementById('authModal');
  const chatContainer = document.getElementById('chatContainer');
  const registerTab = document.getElementById('registerTab');
  const loginTab = document.getElementById('loginTab');

  const regUsername = document.getElementById('regUsername');
  const regPassword = document.getElementById('regPassword');
  const registerBtn = document.getElementById('registerBtn');
  const registerError = document.getElementById('registerError');

  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');

  const switchToLogin = document.getElementById('switchToLogin');
  const switchToRegister = document.getElementById('switchToRegister');
  const closeBtn = document.getElementById('closeBtn');

  const messages = document.getElementById('messages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const onlineList = document.getElementById('onlineList');

  // Tabs wechseln
  switchToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerTab.classList.remove('active');
    loginTab.classList.add('active');
    registerError.textContent = '';
  });

  switchToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
    loginError.textContent = '';
  });

  closeBtn.addEventListener('click', () => {
    authModal.classList.remove('active');
  });

  // Registrieren
  registerBtn.addEventListener('click', () => {
    const username = regUsername.value.trim();
    const password = regPassword.value.trim();
    if (!username || !password) {
      registerError.textContent = 'Bitte alles ausfüllen!';
      return;
    }
    socket.emit('register', { username, password });
  });

  socket.on('registerSuccess', () => {
    registerError.style.color = 'green';
    registerError.textContent = 'Erfolgreich! Bitte einloggen.';
    setTimeout(() => {
      registerTab.classList.remove('active');
      loginTab.classList.add('active');
      registerError.textContent = '';
    }, 1500);
  });

  socket.on('registerError', (err) => {
    registerError.style.color = 'red';
    registerError.textContent = err;
  });

  // Einloggen
  loginBtn.addEventListener('click', () => {
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();
    if (!username || !password) {
      loginError.textContent = 'Bitte alles ausfüllen!';
      return;
    }
    socket.emit('login', { username, password });
  });

  socket.on('loginSuccess', (username) => {
    authModal.classList.remove('active');
    chatContainer.classList.remove('hidden');
    chatContainer.style.display = 'flex';
  });

  socket.on('loginError', (err) => {
    loginError.textContent = err;
  });

  // Chat Senden
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  function sendMessage() {
    const msg = messageInput.value.trim();
    if (msg) {
      socket.emit('chatMessage', msg);
      messageInput.value = '';
    }
  }

  // Nachrichten empfangen
  socket.on('chatMessage', (data) => {
    const div = document.createElement('div');
    div.classList.add('message');
    div.innerHTML = `<strong>${data.username}</strong> <time>${data.timestamp}</time><br>${data.msg}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

  // NEU: User Liste Update (Online & Offline)
  socket.on('updateUserList', (data) => {
    onlineList.innerHTML = '';
    
    // Zuerst alle Online User (Grün)
    data.online.forEach(user => {
      const li = document.createElement('li');
      li.innerHTML = `🟢 ${user}`;
      li.style.background = 'rgba(0,255,136,0.2)'; // Grüner Hintergrund
      onlineList.appendChild(li);
    });

    // Dann alle Offline User (Rot/Grau)
    data.offline.forEach(user => {
      const li = document.createElement('li');
      li.innerHTML = `🔴 ${user}`;
      li.style.background = 'rgba(255,0,0,0.2)'; // Roter Hintergrund
      li.style.color = '#ccc'; // Etwas ausgegraut
      onlineList.appendChild(li);
    });
  });

  // Join / Leave Alerts
  socket.on('userJoined', (username) => {
    const div = document.createElement('div');
    div.classList.add('message');
    div.style.color = '#00FF88';
    div.textContent = `➕ ${username} ist beigetreten`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });

  socket.on('userLeft', (username) => {
    const div = document.createElement('div');
    div.classList.add('message');
    div.style.color = '#FF4444';
    div.textContent = `➖ ${username} hat verlassen`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  });
});
