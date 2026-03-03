const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const bcrypt = require('bcrypt');
const path = require('path');

app.use(express.static('public'));
app.use(express.json());

// Users.json Helper
function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8') || '[]');
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
}

// API Routes
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3) {
    return res.json({ success: false, error: 'Username min. 3 Zeichen' });
  }
  let users = getUsers();
  if (users.find(u => u.username === username)) {
    return res.json({ success: false, error: 'Name bereits vergeben' });
  }
  const hashed = bcrypt.hashSync(password, 10);
  users.push({ username, password: hashed });
  saveUsers(users);
  res.json({ success: true });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  let users = getUsers();
  const user = users.find(u => u.username === username);
  if (user && bcrypt.compareSync(password, user.password)) {
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Falscher Name oder Passwort' });
  }
});

app.post('/check-login', (req, res) => {
  const { username } = req.body;
  let users = getUsers();
  const user = users.find(u => u.username === username);
  res.json({ valid: !!user });
});

// Socket.io
const onlineUsers = new Set();

io.on('connection', (socket) => {
  socket.on('user joined', (username) => {
    onlineUsers.add(username);
    io.emit('user list', Array.from(onlineUsers)); // Für Spieler-Liste
    socket.broadcast.emit('chat message', `${username} ist beigetreten`);
  });

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    // Username nicht mehr tracken (vereinfacht)
  });
});

http.listen(3000, () => {
  console.log('Server läuft auf http://localhost:3000');
});
