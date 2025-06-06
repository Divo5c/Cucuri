let username = prompt("Bitte gib deinen Vornamen ein:");
if (!username || username.length < 1) {
  username = "X";
}
username = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();

const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

// Hilfsfunktion: Prüft, ob Nachrichten älter als 10 Minuten sind
function messagesExpired() {
  const lastClear = localStorage.getItem('lastClear');
  if (!lastClear) return false;
  const now = Date.now();
  return now - parseInt(lastClear, 10) > 10 * 60 * 1000; // 10 Minuten
}

// Nachrichten beim Laden aus localStorage anzeigen oder löschen
window.addEventListener('DOMContentLoaded', () => {
  if (messagesExpired()) {
    localStorage.removeItem('messages');
    localStorage.setItem('lastClear', Date.now().toString());
  }
  let stored = JSON.parse(localStorage.getItem('messages') || '[]');
  stored.forEach(msg => {
    addMessageToList(msg);
  });
});

// Nachrichten alle 10 Minuten löschen (auch bei langer Sitzung)
setInterval(() => {
  localStorage.removeItem('messages');
  localStorage.setItem('lastClear', Date.now().toString());
  messages.innerHTML = '';
}, 10 * 60 * 1000); // 10 Minuten

form.addEventListener('submit', function(event) {
  event.preventDefault();
  if (input.value) {
    const now = new Date();
    const time = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const messageObj = {
      text: `${username}: ${input.value}`,
      time: time
    };
    socket.emit('chat message', messageObj);
    input.value = '';
  }
});

socket.on('chat message', function(msg) {
  addMessageToList(msg);

  // Nachricht im localStorage speichern und Zeitstempel aktualisieren
  let stored = JSON.parse(localStorage.getItem('messages') || '[]');
  stored.push(msg);
  localStorage.setItem('messages', JSON.stringify(stored));
  localStorage.setItem('lastClear', Date.now().toString());
});

function addMessageToList(msg) {
  const item = document.createElement('li');
  item.innerHTML = `<span class="message-text">${msg.text}</span> <span class="message-time">${msg.time}</span>`;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
}
