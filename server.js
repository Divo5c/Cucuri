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
const MONGO_URI = process.env.MONGO_URI || 'DEIN_FALLBACK_STRING_HIER_NUR_ZUM_LOKALEN_TESTEN';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Erfolgreich mit MongoDB verbunden!'))
  .catch(err => console.error('❌ MongoDB Verbindungsfehler:', err));

// ==========================================
// DATENBANK MODELLE (Schemas)
// ==========================================
// So sieht ein User in der Datenbank aus
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// So sieht eine Nachricht in der Datenbank aus (Chat-Historie)
const messageSchema = new mongoose.Schema({
  username: String,
  msg: String,
  timestamp: String
});
const Message = mongoose.model('Message', messageSchema);

// ==========================================
// VARIABLEN FÜR DEN SERVER
// ==========================================
const sessions = new Map(); // Speichert, welcher Socket zu welchem User gehört
const onlineUsers = new Set(); // Speichert alle aktuell aktiven User

// Hilfsfunktion: Schickt die aktuelle Online/Offline Liste an alle
async function broadcastUserList() {
  try {
    // Holt alle User aus der Datenbank (nur die Namen)
    const allUsers = await User.find({}, 'username');
    const allUsernames = allUsers.map(u => u.username);
    
    const onlineArray = Array.from(onlineUsers);
    const offlineArray = allUsernames.filter(u => !onlineArray.includes(u));

    io.emit('updateUserList', {
      online: onlineArray,
      offline: offlineArray
    });
  } catch (err) {
    console.error("Fehler beim Laden der User-Liste:", err);
  }
}

// ==========================================
// SOCKET.IO LOGIK
// ==========================================
io.on('connection', (socket) => {
  
  // REGISTRIEREN
  socket.on('register', async (data) => {
    const { username, password } = data;
    if (username.length < 3) {
      return socket.emit('registerError', 'Min. 3 Zeichen erforderlich');
    }

    try {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        socket.emit('registerError', 'Username existiert bereits');
      } else {
        // Neuen User in die Datenbank speichern!
        const newUser = new User({ username, password });
        await newUser.save();
        
        socket.emit('registerSuccess');
        broadcastUserList(); 
      }
    } catch (err) {
      socket.emit('registerError', 'Datenbank-Fehler beim Registrieren.');
    }
  });

  // EINLOGGEN
  socket.on('login', async (data) => {
    const { username, password } = data;
    
    try {
      // Prüfen, ob User in der Datenbank existiert und Passwort stimmt
      const user = await User.findOne({ username, password });
      
      if (user) {
        sessions.set(socket.id, username);
        onlineUsers.add(username);
        
        socket.emit('loginSuccess', username);
        
        // Letzte 100 Nachrichten aus der Datenbank holen und senden
        const chatHistory = await Message.find().sort({ _id: -1 }).limit(100);
        socket.emit('loadHistory', chatHistory.reverse()); // Umdrehen, damit die älteste oben ist
        
        socket.broadcast.emit('userJoined', username);
        broadcastUserList(); 
      } else {
        socket.emit('loginError', 'Falsche Daten!');
      }
    } catch (err) {
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
        // Nachricht in der Datenbank speichern
        const newMsg = new Message(messageData);
        await newMsg.save();
        
        // An alle schicken
        io.emit('chatMessage', messageData);

        // Optional: Lösche alte Nachrichten, wenn es mehr als 100 sind
        const count = await Message.countDocuments();
        if (count > 100) {
          const oldestMsg = await Message.findOne().sort({ _id: 1 });
          if (oldestMsg) await Message.findByIdAndDelete(oldestMsg._id);
        }
      } catch (err) {
        console.error("Fehler beim Speichern der Nachricht:", err);
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
