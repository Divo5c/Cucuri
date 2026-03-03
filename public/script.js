document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // Elemente holen
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
  const onlineCount = document.getElementById('onlineCount');
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

  // Registrieren Button Logik
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

  // Einloggen Button Logik
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

  // Chat Senden Logik
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

  // Online Liste Update
  socket.on('onlineUsersUpdate', (users) => {
    onlineCount.textContent = users.length;
    onlineList.innerHTML = '';
    users.forEach(user => {
      const li = document.createElement('li');
      li.textContent = `🟢 ${user}`;
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
