// 1. Namen abfragen
let username = prompt("Bitte gib den ersten Buchstaben deines Vornamens ein:");
if (!username || username.length !== 1) {
  username = "X";
}
username = username.toUpperCase();

const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

// 2. Nachricht mit Buchstaben verschicken
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


