const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

let users = {};
try {
  if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
  }
} catch (e) {
  fs.writeFileSync('users.json', '{}');
}

const sessions = new Map();
const onlineUsers = new Set();

// NEU: Hier speichern wir die letzten 100 Nachrichten
const chatHistory = [];
const MAX_HISTORY = 100;

function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

function broadcastUserList() {
  const allUsernames = Object.keys(users);
  const onlineArray = Array.from(onlineUsers);
  const offlineArray = allUsernames.filter(user => !onlineArray.includes(user));

  io.emit('updateUserList', {
    online: onlineArray,
    offline: offlineArray
  });
}

io.on('connection', (socket) => {
  
  socket.on('register', (data) => {
    const { username, password } = data;
    if (users[username]) {
      socket.emit('registerError', 'Username existiert bereits');
    } else if (username.length < 3) {
      socket.emit('registerError', 'Min. 3 Zeichen erforderlich');
    } else {
      users[username] = password;
      saveUsers();
      socket.emit('registerSuccess');
      broadcastUserList(); 
    }
  });

  socket.on('login', (data) => {
    const { username, password } = data;
    if (users[username] && users[username] === password) {
      sessions.set(socket.id, username);
      onlineUsers.add(username);
      
      // Beim Login: Sende dem User die letzten 100 Nachrichten!
      socket.emit('loginSuccess', username);
      socket.emit('loadHistory', chatHistory);
      
      socket.broadcast.emit('userJoined', username);
      broadcastUserList(); 
    } else {
      socket.emit('loginError', 'Falsche Daten!');
    }
  });

  socket.on('chatMessage', (msg) => {
    const username = sessions.get(socket.id);
    if (username) {
      const timestamp = new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
      
      const messageData = { username, msg, timestamp };
      
      // NEU: Speichere Nachricht in der Historie
      chatHistory.push(messageData);
      
      // Wenn es mehr als 100 sind, lösche die älteste
      if (chatHistory.length > MAX_HISTORY) {
        chatHistory.shift();
      }

      io.emit('chatMessage', messageData);
    }
  });

  socket.on('disconnect', () => {
    const username = sessions.get(socket.id);
    if (username) {
      sessions.delete(socket.id);
      onlineUsers.delete(username);
      socket.broadcast.emit('userLeft', username);
      broadcastUserList(); 
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server läuft auf Port ' + PORT));
