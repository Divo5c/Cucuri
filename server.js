const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

let users = {};
if (fs.existsSync('users.json')) {
  users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
}

const sessions = new Map(); // Socket-ID zu Username

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('login', (username) => {
    if (users[username]) {
      sessions.set(socket.id, username);
      socket.emit('loginSuccess', username);
      io.emit('userJoined', username);
    } else {
      socket.emit('loginError', 'Benutzer nicht gefunden');
    }
  });

  socket.on('chatMessage', (msg) => {
    const username = sessions.get(socket.id);
    if (username) {
      io.emit('chatMessage', { username, msg });
    }
  });

  socket.on('disconnect', () => {
    const username = sessions.get(socket.id);
    if (username) {
      io.emit('userLeft', username);
      sessions.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
