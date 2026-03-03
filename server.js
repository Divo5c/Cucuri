const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static('public'));
app.use(express.json());

let users = {};
if (fs.existsSync('users.json')) {
  users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
}

const sessions = new Map(); // socket.id -> username
const onlineUsers = new Set(); // Aktive Usernames

function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', ({ username, password }) => {
    if (users[username]) {
      socket.emit('registerError', 'Username existiert bereits');
    } else if (username.length < 3) {
      socket.emit('registerError', 'Username mind. 3 Zeichen');
    } else {
      users[username] = password;
      saveUsers();
      socket.emit('registerSuccess');
    }
  });

  socket.on('login', ({ username, password }) => {
    if (users[username] && users[username] === password) {
      sessions.set(socket.id, username);
      onlineUsers.add(username);
      io.emit('onlineUsersUpdate', Array.from(onlineUsers));
      socket.emit('loginSuccess', username);
      socket.broadcast.emit('userJoined', username);
    } else {
      socket.emit('loginError', 'Falscher Username oder Passwort');
    }
  });

  socket.on('chatMessage', (msg) => {
    const username = sessions.get(socket.id);
    if (username) {
      const timestamp = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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
server.listen(PORT, () => console.log(`Server auf Port ${PORT}`));
