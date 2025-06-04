// Nutzer nach Anfangsbuchstaben fragen
let username = prompt("Bitte gib deinen Vornamen ein:");
if (!username || username.length !== 10) {
  username = "X"; // Falls nichts oder mehr als 10 Buchstaben eingegeben wird
}
username = username.toUpperCase();

const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

// Nachricht absenden, Buchstaben automatisch voranstellen
form.addEventListener('submit', function(event) {
  event.preventDefault();
  if (input.value) {
    const message = `${username}/ ${input.value}`;
    socket.emit('chat message', message);
    input.value = '';
  }
});

// Nachrichten empfangen und anzeigen
socket.on('chat message', function(msg) {
  const item = document.createElement('li');
  item.textContent = msg;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
});

