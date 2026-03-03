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

function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
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
    }
  });

  socket.on('login', (data) => {
    const { username, password } = data;
    if (users[username] && users[username] === password) {
      sessions.set(socket.id, username);
      onlineUsers.add(username);
      io.emit('onlineUsersUpdate', Array.from(onlineUsers));
      socket.emit('loginSuccess', username);
      socket.broadcast.emit('userJoined', username);
    } else {
      socket.emit('loginError', 'Falsche Daten!');
    }
  });

  socket.on('chatMessage', (msg) => {
    const username = sessions.get(socket.id);
    if (username) {
      const timestamp = new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
      io.emit('chatMessage', { username, msg, timestamp });
    }
  });

  socket.on('disconnect', () => {
    const username = sessions.get(socket.id);
    if (username) {
      sessions.delete(socket.id);
      onlineUsers.delete(username);
      io.emit('onlineUsersUpdate', Array.from(onlineUsers));
      socket.broadcast.emit('userLeft', username);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server läuft auf Port ' + PORT));
