const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ KRITISCHER FEHLER: MONGO_URI wurde in Render nicht gefunden!');
} else {
  console.log('⏳ Verbinde mit MongoDB...');
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Erfolgreich mit MongoDB verbunden!'))
    .catch(err => console.error('❌ MongoDB Verbindungsfehler:', err.message));
}

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isBanned: { type: Boolean, default: false },
  jugendwortChoice: { type: String, default: null }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  username: String,
  msg: String,
  timestamp: String
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

const sessions = new Map();
const onlineUsers = new Set();
// NEU: Verbindungszähler pro User
const userConnectionCounts = new Map();

async function broadcastUserList() {
  try {
    const allUsers = await User.find({}, 'username');
    const allUsernames = allUsers.map(u => u.username);
    const onlineArray = Array.from(onlineUsers);
    const offlineArray = allUsernames.filter(u => !onlineArray.includes(u));
    io.emit('updateUserList', { online: onlineArray, offline: offlineArray });
  } catch (err) {
    console.error("Fehler beim Laden der User-Liste:", err.message);
  }
}

// Middleware für HTTP-User (Jugendwort-Seite)
app.use((req, res, next) => {
  req.currentUsername = req.query.user || null;
  next();
});

// ===== Jugendwort Voting API =====
const JUGENDWORT_WORDS = [
  { id: 'start-1', term: 'das crazy', meaning: 'Wenn etwas komplett verrückt oder unfassbar ist.' },
  { id: 'start-2', term: 'lowkey nice', meaning: 'Etwas ist heimlich gut, aber man spielt es runter.' }
];

app.get('/api/jugendwort/votes', async (req, res) => {
  try {
    const currentUsername = req.currentUsername;
    const users = await User.find({ jugendwortChoice: { $ne: null } }, 'jugendwortChoice username');
    const counts = {};
    users.forEach(u => {
      counts[u.jugendwortChoice] = (counts[u.jugendwortChoice] || 0) + 1;
    });

    let currentChoice = null;
    if (currentUsername) {
      const me = await User.findOne({ username: currentUsername }, 'jugendwortChoice');
      if (me) currentChoice = me.jugendwortChoice;
    }

    const result = JUGENDWORT_WORDS.map(w => ({
      ...w,
      votes: counts[w.id] || 0
    }));

    res.json({ words: result, currentChoice });
  } catch (err) {
    console.error('Fehler bei /api/jugendwort/votes:', err.message);
    res.status(500).json({ error: 'Serverfehler beim Laden der Votes.' });
  }
});

app.post('/api/jugendwort/vote', async (req, res) => {
  try {
    const currentUsername = req.currentUsername;
    if (!currentUsername) return res.status(401).json({ error: 'Nicht eingeloggt.' });

    const { wordId } = req.body;
    if (!wordId) return res.status(400).json({ error: 'wordId fehlt.' });

    const exists = JUGENDWORT_WORDS.some(w => w.id === wordId);
    if (!exists) return res.status(400).json({ error: 'Unbekanntes Jugendwort.' });

    const user = await User.findOne({ username: currentUsername });
    if (!user) return res.status(404).json({ error: 'User nicht gefunden.' });

    user.jugendwortChoice = wordId;
    await user.save();

    res.json({ success: true, choice: wordId });
  } catch (err) {
    console.error('Fehler bei POST /api/jugendwort/vote:', err.message);
    res.status(500).json({ error: 'Serverfehler beim Voting.' });
  }
});

app.delete('/api/jugendwort/vote', async (req, res) => {
  try {
    const currentUsername = req.currentUsername;
    if (!currentUsername) return res.status(401).json({ error: 'Nicht eingeloggt.' });

    const user = await User.findOne({ username: currentUsername });
    if (!user) return res.status(404).json({ error: 'User nicht gefunden.' });

    user.jugendwortChoice = undefined;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Fehler bei DELETE /api/jugendwort/vote:', err.message);
    res.status(500).json({ error: 'Serverfehler beim Entfernen.' });
  }
});

app.get('/api/jugendwort/admin', async (req, res) => {
  try {
    if (req.currentUsername !== 'Divo') {
      return res.status(403).json({ error: 'Kein Admin.' });
    }

    const users = await User.find({}, 'username jugendwortChoice');
    const counts = {};
    users.forEach(u => {
      if (!u.jugendwortChoice) return;
      counts[u.jugendwortChoice] = (counts[u.jugendwortChoice] || 0) + 1;
    });

    const wordStats = JUGENDWORT_WORDS.map(w => ({
      id: w.id,
      term: w.term,
      votes: counts[w.id] || 0
    }));

    res.json({ users, wordStats });
  } catch (err) {
    console.error('Fehler bei /api/jugendwort/admin:', err.message);
    res.status(500).json({ error: 'Serverfehler bei Admin-Daten.' });
  }
});

// ===== Socket.IO Chat + Admin =====
io.on('connection', (socket) => {
  socket.on('register', async (data) => {
    if (mongoose.connection.readyState !== 1) {
      return socket.emit('registerError', 'Verbindung zur Datenbank wird aufgebaut... Bitte kurz warten.');
    }

    const { username, password } = data;
    if (!username || !password) return socket.emit('registerError', 'Bitte alles ausfüllen.');
    if (username.length < 3) return socket.emit('registerError', 'Min. 3 Zeichen.');

    try {
      const existingUser = await User.findOne({ username });
      if (existingUser) return socket.emit('registerError', 'Username existiert bereits.');

      const newUser = new User({ username, password });
      await newUser.save();

      socket.emit('registerSuccess');
      broadcastUserList();
    } catch (err) {
      console.error('Register Fehler:', err.message);
      socket.emit('registerError', 'Datenbank-Fehler beim Registrieren.');
    }
  });

  socket.on('login', async (data) => {
    if (mongoose.connection.readyState !== 1) {
      return socket.emit('loginError', 'Verbindung zur Datenbank wird aufgebaut... Bitte kurz warten.');
    }

    const { username, password } = data;
    try {
      const user = await User.findOne({ username, password });
      if (!user) return socket.emit('loginError', 'Falsche Daten oder Account existiert nicht!');
      if (user.isBanned) return socket.emit('loginError', 'Du wurdest gebannt.');

      // Session & Verbindungszähler
      sessions.set(socket.id, username);
      const prevCount = userConnectionCounts.get(username) || 0;
      userConnectionCounts.set(username, prevCount + 1);

      // Nur beim ersten Socket dieses Users: als online zählen + Join-Meldung
      if (prevCount === 0) {
        onlineUsers.add(username);
        socket.broadcast.emit('userJoined', username);
        broadcastUserList();
      }

      socket.emit('loginSuccess', username);

      const chatHistory = await Message.find().sort({ _id: -1 }).limit(100);
      socket.emit('loadHistory', chatHistory.reverse());
    } catch (err) {
      console.error('Login Fehler:', err.message);
      socket.emit('loginError', 'Datenbank-Fehler beim Login.');
    }
  });

  socket.on('chatMessage', async (msg) => {
    const username = sessions.get(socket.id);
    if (!username) return;

    try {
      const user = await User.findOne({ username }, 'isBanned');
      if (!user || user.isBanned) return;

      const timestamp = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const messageData = { username, msg, timestamp };

      const newMsg = new Message(messageData);
      await newMsg.save();

      io.emit('chatMessage', { ...messageData, _id: newMsg._id.toString() });

      const count = await Message.countDocuments();
      if (count > 100) {
        const oldestMsg = await Message.findOne().sort({ _id: 1 });
        if (oldestMsg) await Message.findByIdAndDelete(oldestMsg._id);
      }
    } catch (err) {
      console.error('Fehler beim Speichern der Nachricht:', err.message);
    }
  });

  // ===== Admin Events =====
  socket.on('adminToggleBan', async ({ username }) => {
    const caller = sessions.get(socket.id);
    if (caller !== 'Divo') return;

    try {
      const user = await User.findOne({ username });
      if (!user) {
        return socket.emit('adminActionResult', { ok: false, message: 'User nicht gefunden.' });
      }

      user.isBanned = !user.isBanned;
      await user.save();

      socket.emit('adminActionResult', {
        ok: true,
        message: `Bann für ${username}: ${user.isBanned ? 'aktiv' : 'inaktiv'}.`
      });
    } catch (err) {
      console.error('adminToggleBan Fehler:', err.message);
      socket.emit('adminActionResult', { ok: false, message: 'Fehler beim Bann.' });
    }
  });

  socket.on('adminRenameUser', async ({ oldName, newName }) => {
    const caller = sessions.get(socket.id);
    if (caller !== 'Divo') return;

    try {
      const user = await User.findOne({ username: oldName });
      if (!user) {
        return socket.emit('adminActionResult', { ok: false, message: 'User nicht gefunden.' });
      }

      user.username = newName;
      await user.save();

      socket.emit('adminActionResult', {
        ok: true,
        message: `Name geändert: ${oldName} → ${newName}`
      });

      broadcastUserList();
    } catch (err) {
      console.error('adminRenameUser Fehler:', err.message);
      socket.emit('adminActionResult', { ok: false, message: 'Fehler beim Umbenennen.' });
    }
  });

  socket.on('adminClearChat', async () => {
    const caller = sessions.get(socket.id);
    if (caller !== 'Divo') return;

    try {
      await Message.deleteMany({});
      io.emit('loadHistory', []);
      socket.emit('adminActionResult', { ok: true, message: 'Gesamter Chat gelöscht.' });
    } catch (err) {
      console.error('adminClearChat Fehler:', err.message);
      socket.emit('adminActionResult', { ok: false, message: 'Fehler beim Löschen.' });
    }
  });

  socket.on('adminDeleteMessage', async ({ id }) => {
    const caller = sessions.get(socket.id);
    if (caller !== 'Divo') return;

    try {
      if (!id) {
        return socket.emit('adminActionResult', { ok: false, message: 'Nachrichten-ID fehlt.' });
      }

      await Message.findByIdAndDelete(id);
      io.emit('adminMessageDeleted', { id });
      socket.emit('adminActionResult', { ok: true, message: 'Nachricht gelöscht.' });
    } catch (err) {
      console.error('adminDeleteMessage Fehler:', err.message);
      socket.emit('adminActionResult', { ok: false, message: 'Fehler beim Löschen der Nachricht.' });
    }
  });

  // NEU: Disconnect nur beim letzten Socket des Users
  socket.on('disconnect', () => {
    const username = sessions.get(socket.id);
    if (!username) return;

    sessions.delete(socket.id);

    const prevCount = userConnectionCounts.get(username) || 0;
    const newCount = Math.max(prevCount - 1, 0);

    if (newCount === 0) {
      userConnectionCounts.delete(username);
      onlineUsers.delete(username);
      socket.broadcast.emit('userLeft', username);
      broadcastUserList();
    } else {
      userConnectionCounts.set(username, newCount);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));