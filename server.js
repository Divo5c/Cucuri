const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
});

app.use(express.static("public"));
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error(
    "❌ KRITISCHER FEHLER: MONGO_URI wurde in Render nicht gefunden!",
  );
} else {
  console.log("⏳ Verbinde mit MongoDB...");
  mongoose
    .connect(MONGO_URI)
    .then(async () => {
      console.log("✅ Erfolgreich mit MongoDB verbunden!");
      await initDefaultVoiceRooms();
    })
    .catch((err) =>
      console.error("❌ MongoDB Verbindungsfehler:", err.message),
    );
}

// Schemas (unverändert + VoiceRoom)
const userSchema = new mongoose.Schema({
  /* ... dein User Schema ... */
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  /* ... dein Message Schema ... */
});
const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);

const voiceRoomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  isDefault: { type: Boolean, default: false },
});
const VoiceRoom =
  mongoose.models.VoiceRoom || mongoose.model("VoiceRoom", voiceRoomSchema);

const sessions = new Map();
const voiceRoomsUsers = new Map(); // roomId -> Set of usernames

async function broadcastUserList() {
  /* ... dein bestehender Code ... */
}

async function initDefaultVoiceRooms() {
  /* ... dein bestehender Code ... */
}

// Jugendwort API (unverändert)
const JUGENDWORT_WORDS = require("./public/Jugendwort/jw-data.json");
// ... alle deine Jugendwort Routes ...

io.on("connection", (socket) => {
  // === Dein bisheriger Code (register, login, chatMessage, admin events) ===
  // ... (kopiere alles von deinem aktuellen server.js hier rein) ...

  // ===== VOICE SIGNALING =====
  socket.on("joinVoiceRoom", ({ roomId, username }) => {
    if (!voiceRoomsUsers.has(roomId)) voiceRoomsUsers.set(roomId, new Set());
    voiceRoomsUsers.get(roomId).add(username);

    socket.join(`voice-${roomId}`);

    // Andere im Raum informieren
    socket.to(`voice-${roomId}`).emit("userJoinedVoice", { username });
  });

  socket.on("offer", ({ target, offer }) => {
    socket.to(target).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ target, answer }) => {
    socket.to(target).emit("answer", { from: socket.id, answer });
  });

  socket.on("iceCandidate", ({ target, candidate }) => {
    socket.to(target).emit("iceCandidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    const username = sessions.get(socket.id);
    if (username) {
      // Entferne aus Voice Rooms
      voiceRoomsUsers.forEach((users, roomId) => {
        if (users.has(username)) {
          users.delete(username);
          io.to(`voice-${roomId}`).emit("userLeftVoice", { username });
        }
      });
    }
    sessions.delete(socket.id);
    socket.broadcast.emit("userLeft", username);
    broadcastUserList();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
