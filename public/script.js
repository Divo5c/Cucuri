const socket = io();

// Auth-Elemente (wie vorher)
const authModal = document.getElementById('authModal');
const registerTab = document.getElementById('registerTab');
const loginTab = document.getElementById('loginTab');
// ... alle anderen wie im vorherigen Code

// Neue Chat-Elemente
const onlineCount = document.getElementById('onlineCount');
const onlineList = document.getElementById('onlineList');
let currentUsername = '';

// Event-Listener wie vorher (register, login, switch, etc.) – kopiere aus vorherigem

socket.on('registerSuccess', () => {
  document.getElementById('registerError').textContent = '✅ Registriert! Jetzt einloggen.';
});

socket.on('loginSuccess', (username) => {
  currentUsername = username;
  authModal.classList.remove('active');
  document.getElementById('chatContainer').classList.remove('hidden');
  document.getElementById('messageInput').focus();
});

// Chat-Funktionen
function sendMessage() {
  const msg = document.getElementById('messageInput').value.trim();
  if (msg) {
    socket.emit('chatMessage', msg);
    document.getElementById('messageInput').value = '';
  }
}

socket.on('chatMessage', ({ username, msg, timestamp }) => {
  const div = document.createElement('div');
  div.classList.add('message');
  div.innerHTML = `<strong>${username}</strong> <time>${timestamp}</time><br>${msg}`;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
});

socket.on('onlineUsersUpdate', (users) => {
  onlineCount.textContent = users.length;
  onlineList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = `🟢 ${user}`;
    onlineList.appendChild(li);
  });
});

socket.on('userJoined', (username) => {
  const div = document.createElement('div');
  div.classList.add('message');
  div.style.color = '#00FF88';
  div.textContent = `➕ ${username} ist online!`;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
});

socket.on('userLeft', (username) => {
  const div = document.createElement('div');
  div.classList.add('message');
  div.style.color = '#FF4444';
  div.textContent = `➖ ${username} ist offline.`;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
});

// Rest der Event-Listener (kopiere aus vorherigem script.js)
document.getElementById('registerBtn').addEventListener('click', () => {
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  if (username && password) socket.emit('register', { username, password });
});

document.getElementById('loginBtn').addEventListener('click', () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (username && password) socket.emit('login', { username, password });
});

// Switch-Funktionen, clearErrors, etc. wie vorher
