const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const loginModal = document.getElementById('loginModal');
const authForm = document.getElementById('authForm');
const modalTitle = document.getElementById('modalTitle');
const submitBtn = document.getElementById('submitBtn');
const toggleLink = document.getElementById('toggleLink');
const toggleText = document.getElementById('toggleText');
const errorMsg = document.getElementById('errorMsg');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const closeModal = document.getElementById('closeModal');

let isLogin = true;
let currentUsername = localStorage.getItem('username');

// Auto-Login versuchen
if (currentUsername) {
  fetch('/check-login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: currentUsername})
  }).then(res => res.json()).then(data => {
    if (data.valid) {
      showChat(currentUsername);
    } else {
      loginModal.style.display = 'flex';
    }
  }).catch(() => loginModal.style.display = 'flex');
} else {
  loginModal.style.display = 'flex';
}

// Toggle Login/Register
toggleLink.onclick = () => {
  isLogin = !isLogin;
  modalTitle.textContent = isLogin ? 'Login' : 'Registrieren';
  submitBtn.textContent = isLogin ? 'Einloggen' : 'Registrieren';
  toggleText.textContent = isLogin ? 'Registrieren' : 'Einloggen';
  errorMsg.style.display = 'none';
  authForm.reset();
};

// Submit Form
authForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const endpoint = isLogin ? 'login' : 'register';

  try {
    const res = await fetch(`/${endpoint}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password})
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('username', username);
      showChat(username);
    } else {
      errorMsg.textContent = data.error;
      errorMsg.style.display = 'block';
      passwordInput.focus();
    }
  } catch (err) {
    errorMsg.textContent = 'Server-Fehler!';
    errorMsg.style.display = 'block';
  }
};

// Close nur erlauben nach Login (oder gar nicht)
closeModal.onclick = () => {}; // Ignorieren

function showChat(username) {
  loginModal.style.display = 'none';
  messages.style.display = 'block';
  form.style.display = 'flex';
  socket.emit('user joined', username);
}

// Chat-Funktionen
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value.trim()) {
    socket.emit('chat message', input.value.trim());
    input.value = '';
  }
});

socket.on('chat message', (msg) => {
  const item = document.createElement('li');
  item.textContent = msg;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
});

socket.on('user list', (users) => {
  console.log('Online:', users); // Für Spieler-Liste später
});
