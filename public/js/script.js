let username = prompt("Bitte gib deinen Vornamen ein:");
if (!username || username.length < 1) {
  username = "X";
}
username = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();

const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

form.addEventListener('submit', function(event) {
  event.preventDefault();
  if (input.value) {
    const message = `${username}/ ${input.value}`;
    socket.emit('chat message', message);
    input.value = '';
  }
});

socket.on('chat message', function(msg) {
  const item = document.createElement('li');
  item.textContent = msg;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
});

