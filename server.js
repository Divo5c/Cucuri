const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

// ==========================================
// MONGODB VERBINDUNG AUFBAUEN
// ==========================================
// Wir lesen den String aus den Render Environment Variables
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ KRITISCHER FEHLER: MONGO_URI wurde in Render nicht gefunden!');
} else {
  // WICHTIG: Keine alten Optionen mehr, damit Mongoose nicht warnt/crasht
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Erfolgreich mit MongoDB verbunden!'))
    .catch(err => console.error('❌ MongoDB Verbindungsfehler:', err.message));
}

// ==========================================
// DATENBANK MODELLE (Schemas)
// ==========================================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  username: String,
  msg: String,
  timestamp: String
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// ==========================================
// VARIABLEN FÜR DEN SERVER
// ==========================================
const sessions = new Map();
const onlineUsers = new Set();

async function broadcastUserList() {
  try {
    const allUsers = await User.find({}, 'username');
    const allUsernames = allUsers.map(u => u.username);
    
    const onlineArray = Array.from(onlineUsers);
    const offlineArray = allUsernames.filter(u => !onlineArray.includes(u));

    io.emit('updateUserList', {
      online: onlineArray,
      offline: offlineArray
    });
  } catch (err) {
    console.error("Fehler beim Laden der User-Liste:", err.message);
  }
}

// ==========================================
// SOCKET.IO LOGIK
// ==========================================
io.on('connection', (socket) => {
  
  // REGISTRIEREN
  socket.on('register', async (data) => {
    // Falls Mongoose noch lädt, blockieren wir den Versuch
    if (mongoose.connection.readyState !== 1) {
      return socket.emit('registerError', 'Server hat keine Verbindung zur Datenbank.');
    }

    const { username, password } = data;
    if (username.length < 3) {
      return socket.emit('registerError', 'Min. 3 Zeichen erforderlich');
    }

    try {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        socket.emit('registerError', 'Username existiert bereits');
      } else {
        const newUser = new User({ username, password });
        await newUser.save();
        socket.emit('registerSuccess');
        broadcastUserList(); 
      }
    } catch (err) {
      console.error('Register Fehler:', err.message);
      socket.emit('registerError', 'Datenbank-Fehler beim Registrieren.');
    }
  });

  // EINLOGGEN
  socket.on('login', async (data) => {
    if (mongoose.connection.readyState !== 1) {
      return socket.emit('loginError', 'Server hat keine Verbindung zur Datenbank.');
    }

    const { username, password } = data;
    
    try {
      const user = await User.findOne({ username, password });
      
      if (user) {
        sessions.set(socket.id, username);
        onlineUsers.add(username);
        
        socket.emit('loginSuccess', username);
        
        const chatHistory = await Message.find().sort({ _id: -1 }).limit(100);
        socket.emit('loadHistory', chatHistory.reverse()); 
        
        socket.broadcast.emit('userJoined', username);
        broadcastUserList(); 
      } else {
        socket.emit('loginError', 'Falsche Daten oder Account existiert nicht!');
      }
    } catch (err) {
      console.error('Login Fehler:', err.message);
      socket.emit('loginError', 'Datenbank-Fehler beim Login.');
    }
  });

  // CHAT-NACHRICHT SENDEN
  socket.on('chatMessage', async (msg) => {
    const username = sessions.get(socket.id);
    if (username) {
      const timestamp = new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
      const messageData = { username, msg, timestamp };
      
      try {
        const newMsg = new Message(messageData);
        await newMsg.save();
        io.emit('chatMessage', messageData);

        const count = await Message.countDocuments();
        if (count > 100) {
          const oldestMsg = await Message.findOne().sort({ _id: 1 });
          if (oldestMsg) await Message.findByIdAndDelete(oldestMsg._id);
        }
      } catch (err) {
        console.error("Fehler beim Speichern der Nachricht:", err.message);
      }
    }
  });

  // VERLASSEN
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
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
