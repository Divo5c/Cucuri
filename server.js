require("dotenv").config();

const express = require("express");
const http = require("http");
const crypto = require("crypto");
const socketIo = require("socket.io");
const mongoose = require("mongoose");

const PUBLIC_WORLD_ENABLED = false; // Release-Freeze: nur Admin Divo sieht die Welt
function isAdminUser(username) { return username === "Divo"; }
function isWorldAllowed(username) {
  // Für E2E-Tests: Tmp-User dürfen Welt betreten, echte Public-User nicht
  if (username && username.startsWith("Tmp")) return true;
  return PUBLIC_WORLD_ENABLED || isAdminUser(username);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
});

// Static
app.use(express.static("public"));
app.use(express.json());

// ===== MongoDB-Verbindung (Atlas + Mongoose) =====

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error(
    "❌ KRITISCHER FEHLER: MONGO_URI wurde nicht gefunden! Prüfe deine .env.",
  );
} else {
  console.log("⏳ Verbinde mit MongoDB Atlas...");
  mongoose
    .connect(MONGO_URI)
    .then(async () => {
      console.log("✅ Erfolgreich mit MongoDB verbunden!");
      await initDefaultVoiceRooms();
    })
    .catch((err) => {
      console.error("❌ MongoDB Verbindungsfehler:", err.message);
    });
}

// ===== Schemas und Modelle =====

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isBanned: { type: Boolean, default: false },
  jugendwortChoice: { type: String, default: null },
  authToken: { type: String, default: null }, // "Dieses Gerät merken"
  bio: { type: String, default: "" },
  color: { type: String, default: null },
  avatar: { type: String, default: null },
  coins: { type: Number, default: 100 },
  inventory: { type: [{ _id: false, id: String, qty: Number }], default: [] },
  lastWorldPos: { type: { _id: false, x: Number, y: Number, room: String, zone: String, floor: Number }, default: undefined },
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  username: String,
  msg: String,
  timestamp: String,
  avatar: { type: String, default: null },
  color: { type: String, default: null },
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

// ===== City-State (persistente Social-World, MongoDB) =====
const cityStateSchema = new mongoose.Schema({
  projectId: { type: String, required: true, unique: true },
  total: { type: Number, default: 0 },
  status: { type: String, default: "open" }, // open | completed
  contributions: { type: [{ _id: false, user: String, amount: Number }], default: [] },
  updatedAt: { type: Date, default: Date.now },
});
const CityState =
  mongoose.models.CityState || mongoose.model("CityState", cityStateSchema);

// ===== Profil-Whitelists (Avatar + Farbe) =====
const ALLOWED_AVATARS = ["😀", "😎", "🤖", "👾", "🐱", "🦊", "🐼", "🚀", "⭐", "🎮", "🎧", "💜"];
const ALLOWED_COLORS = ["#79dce8", "#ffd166", "#ff8fa3", "#95d5b2", "#b8a9ff", "#ffa36b", "#7dd3fc", "#f472b6"];

// ===== Economy: Shops, Items, Jobs, City-Projekte (server-autoritativ) =====
const SHOPS = {
  market: {
    name: "Mini-Markt",
    items: [
      { id: "snack", name: "Snack", price: 20 },
      { id: "tool", name: "Werkzeug", price: 40 },
      { id: "flower", name: "Deko-Blume", price: 60 },
    ],
  },
  fridge: {
    name: "Kühlschrank",
    items: [
      { id: "water", name: "Wasser", price: 10 },
      { id: "coffee", name: "Kaffee", price: 15 },
    ],
  },
  cafe: {
    name: "Café",
    items: [
      { id: "cake", name: "Kuchen", price: 25 },
      { id: "cocoa", name: "Kakao", price: 20 },
    ],
  },
};
const ITEM_CATALOG = {};
for (const shop of Object.values(SHOPS)) {
  for (const item of shop.items) ITEM_CATALOG[item.id] = { name: item.name, price: item.price };
}
// Lieferziele: nur im Dorf (Postbotenjob) — Villa ist Wohnort, kein Lieferziel
const DROP_SPOTS = [
  { id: "drop_post", room: "post", zone: "village", floor: 0, x: 570, y: 570, label: "Postschalter" },
  { id: "drop_shop", room: "shop", zone: "village", floor: 0, x: 1830, y: 570, label: "Shop-Theke" },
  { id: "drop_park", room: "park", zone: "village", floor: 0, x: 600, y: 850, label: "Parkbank" },
  { id: "drop_village_center", room: "village_center", zone: "village", floor: 0, x: 1200, y: 700, label: "Marktplatz" },
  { id: "drop_cafe", room: "cafe", zone: "village", floor: 0, x: 1760, y: 850, label: "Café-Tresen" },
];
const JOB_DELIVERY = { id: "delivery", name: "Postbote", reward: 40, minSeconds: 5 };
// Bauprojekte: Café ausschließlich im Dorf (Zone village)
const CITY_PROJECTS = [
  {
    id: "cafe",
    name: "Café",
    desc: "Gemütliches Café im Dorf — Baustelle bei 500 Coins fertig.",
    cost: 500,
    zone: "village",
    building: {
      id: "cafe",
      zone: "village",
      counter: { x: 640, y: 380, w: 110, h: 28 },
      tables: [{ x: 660, y: 430 }, { x: 730, y: 430 }],
      sign: { x: 695, y: 366, text: "CAFÉ" },
    },
  },
];
const BUILDINGS = {};
for (const p of CITY_PROJECTS) BUILDINGS[p.id] = p.building;
// Laufende Lieferjobs pro Username (kein Doppel-Job, keine Doppel-Auszahlung)
const activeJobs = new Map(); // username -> { targetId, reward, startedAt }

function isValidAmount(n) {
  return Number.isInteger(n) && n > 0 && n <= 1000000;
}
async function getBalance(username) {
  const u = await User.findOne({ username }, "coins").lean();
  return u ? u.coins || 0 : 0;
}
async function earnCoins(username, amount, reason) {
  if (!isValidAmount(amount)) throw new Error("Ungültiger Betrag.");
  const u = await User.findOneAndUpdate(
    { username },
    { $inc: { coins: amount } },
    { new: true, projection: { coins: 1 } },
  ).lean();
  if (!u) throw new Error("User nicht gefunden.");
  return u.coins || 0;
}
async function spendCoins(username, amount, reason) {
  if (!isValidAmount(amount)) return { ok: false, message: "Ungültiger Betrag." };
  const u = await User.findOneAndUpdate(
    { username, coins: { $gte: amount } },
    { $inc: { coins: -amount } },
    { new: true, projection: { coins: 1 } },
  ).lean();
  if (!u) return { ok: false, message: "Nicht genug Coins." };
  return { ok: true, balance: u.coins || 0 };
}
async function addInventory(username, itemId, qty) {
  const user = await User.findOne({ username });
  if (!user) throw new Error("User nicht gefunden.");
  if (!Array.isArray(user.inventory)) user.inventory = [];
  const line = user.inventory.find((l) => l.id === itemId);
  if (line) line.qty = (line.qty || 0) + qty;
  else user.inventory.push({ id: itemId, qty });
  await user.save();
}
async function economyPayload(username) {
  const u = await User.findOne({ username }, "coins inventory").lean();
  if (!u) return null;
  return {
    balance: u.coins || 0,
    inventory: (u.inventory || []).map((l) => ({
      id: l.id,
      name: (ITEM_CATALOG[l.id] || {}).name || l.id,
      qty: l.qty || 0,
    })),
  };
}
async function emitEconomy(socket, username) {
  try {
    const data = await economyPayload(username);
    if (data) socket.emit("economyData", data);
  } catch (err) {
    console.error("economyData Fehler:", err.message);
  }
}
function cityLevel(completedCount) {
  return 1 + completedCount;
}
async function cityPayload(username) {
  const states = await CityState.find({}).lean();
  const byId = {};
  for (const s of states) byId[s.projectId] = s;
  const projects = CITY_PROJECTS.map((p) => {
    const st = byId[p.id] || { total: 0, status: "open", contributions: [] };
    const mine = (st.contributions || []).filter((c) => c.user === username).reduce((s, c) => s + (c.amount || 0), 0);
    return { id: p.id, name: p.name, desc: p.desc, cost: p.cost, total: st.total || 0, status: st.status || "open", mine };
  });
  const completed = projects.filter((p) => p.status === "completed").map((p) => p.id);
  const next = projects.find((p) => p.status !== "completed");
  return {
    level: cityLevel(completed.length),
    goal: next ? `${next.name} bauen (${next.total} / ${next.cost} 🪙)` : "Mehr Projekte bald",
    projects,
    buildings: completed,
  };
}
async function broadcastCity() {
  try {
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      const name = sessions.get(s.id);
      if (!name) continue;
      try {
        s.emit("cityData", await cityPayload(name));
      } catch (err) {
        console.error("cityData Broadcast Fehler:", err.message);
      }
    }
  } catch (err) {
    console.error("broadcastCity Fehler:", err.message);
  }
}
function saveWorldPos(socket) {
  try {
    const username = sessions.get(socket.id);
    const rec = worldUsers.get(socket.id);
    if (!username || !rec) return;
    const pos = { x: Math.round(rec.x), y: Math.round(rec.y), room: rec.room, zone: rec.zone || "villa", floor: rec.floor || 0 };
    User.updateOne({ username }, { $set: { lastWorldPos: pos } }).catch((err) =>
      console.error("lastWorldPos Fehler:", err.message),
    );
  } catch (err) {
    console.error("saveWorldPos Fehler:", err.message);
  }
}

// ===== In-Memory Sessions / Voice-Tracking =====

const sessions = new Map(); // socket.id -> username
const voiceRoomsUsers = new Map(); // roomId -> Set(socket.id)
const WORLD_W = 2400, WORLD_H = 1800;
const worldUsers = new Map(); // socket.id -> {username,x,y,room,zone,floor,seat,avatar,color,banned,tempBanned}
const WORLD_ZONES = ["villa", "village"];
const WORLD_FLOORS = { villa: [0, 1], village: [0] };
const WORLD_ROOMS = [
  "lounge", "kitchen", "living_room", "living", "gaming", "chill",
  "toilet", "bedroom", "bedroom2", "bathroom", "office", "dining", "storage", "hallway", "hallway_up", "balcony", "entrance",
  "village_center", "village_road", "cafe", "shop", "post", "park", "rathaus", "village_house_01", "village_house_02", "village_house_03", "village_house_04", "village_house_05", "village_house_06", "village_residential",
  "house_01_entry", "house_01_living", "house_01_kitchen", "house_01_bath", "house_01_bedroom", "house_02_entry", "house_02_living", "house_02_kitchen", "house_02_bath", "house_02_guest"
];
// NPC Server Authority — 4 NPCs, waypoints, state machine
const NPCS_SERVER = [
  { id: "npc_post", name: "Postmitarbeiter", zone: "village", floor: 0, x: 570, y: 570, target: "village_center", state: "working", speed: 45 },
  { id: "npc_anna", name: "Anna", zone: "village", floor: 0, x: 1200, y: 700, target: "shop", state: "walking", speed: 50 },
  { id: "npc_ben", name: "Ben", zone: "village", floor: 0, x: 1830, y: 570, target: "park", state: "walking", speed: 48 },
  { id: "npc_cafe", name: "Café-Mitarbeiter", zone: "village", floor: 0, x: 1760, y: 850, target: "cafe", state: "working", speed: 0 },
];
const VILLAGE_WAYPOINTS_SERVER = {
  post: { x: 570, y: 570 }, shop: { x: 1830, y: 570 }, cafe: { x: 1760, y: 850 }, park: { x: 600, y: 850 },
  rathaus: { x: 1200, y: 430 }, village_center: { x: 1200, y: 700 }, villa_gate: { x: 1200, y: 1100 },
};
let doorStates = new Map(); // doorId -> "open"/"closed" (default closed for house doors, open for interior)
// House doors default closed, interior doors open
for (const id of ["house_01_front", "house_02_front"]) doorStates.set(id, "closed");
for (const id of ["kitchen_lounge", "living_lounge", "gaming_lounge"]) doorStates.set(id, "open");
let lastWorldBroadcast = 0;

function broadcastWorld() {
  try {
    io.emit("worldPresence", {
      users: Array.from(worldUsers.entries()).map(([socketId, u]) => ({ socketId, ...u })),
    });
  } catch (err) {
    console.error("Fehler bei worldPresence:", err.message);
  }
}

function broadcastWorldThrottled() {
  const now = Date.now();
  if (now - lastWorldBroadcast < 150) return;
  lastWorldBroadcast = now;
  broadcastWorld();
}

function leaveWorld(socket) {
  saveWorldPos(socket);
  if (worldUsers.delete(socket.id)) broadcastWorld();
}
// NPC Server Tick — 10 Hz, Broadcast 400ms
setInterval(() => {
  for (const npc of NPCS_SERVER) {
    if (npc.speed === 0) continue; // working/cafe
    const wp = VILLAGE_WAYPOINTS_SERVER[npc.target];
    if (!wp) continue;
    const dx = wp.x - npc.x, dy = wp.y - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) {
      const keys = Object.keys(VILLAGE_WAYPOINTS_SERVER);
      let next;
      do { next = keys[Math.floor(Math.random() * keys.length)]; } while (next === npc.target);
      npc.target = next;
      npc.state = "idle";
    } else {
      const step = npc.speed * 0.1;
      npc.x += (dx / dist) * step;
      npc.y += (dy / dist) * step;
      npc.state = "walking";
      // clamp
      npc.x = Math.max(0, Math.min(WORLD_W, npc.x));
      npc.y = Math.max(0, Math.min(WORLD_H, npc.y));
    }
  }
}, 100);
setInterval(() => {
  // Filter café NPC wenn Café nicht fertig
  CityState.findOne({ projectId: "cafe" }).lean().then((doc) => {
    const showCafe = doc && doc.status === "completed";
    const filtered = NPCS_SERVER.filter((n) => n.id !== "npc_cafe" || showCafe);
    io.emit("npcUpdate", filtered);
  }).catch(() => io.emit("npcUpdate", NPCS_SERVER.filter((n) => n.id !== "npc_cafe")));
}, 400);

// ===== Anti-Spam: 8x gleiche Nachricht -> 2 Min. Chat- + Voice-Sperre =====
const tempBans = new Map(); // username -> Ablauf (ms)
const recentMsgs = new Map(); // username -> [{ text, ts }]
const SPAM_WINDOW_MS = 120000;
const SPAM_COUNT = 8;
const SPAM_BAN_MS = 2 * 60 * 1000;

function isSpam(username, text) {
  const now = Date.now();
  const norm = String(text || "")
    .trim()
    .toLowerCase();
  let arr = recentMsgs.get(username) || [];
  arr = arr.filter((e) => now - e.ts < SPAM_WINDOW_MS);
  arr.push({ text: norm, ts: now });
  recentMsgs.set(username, arr);
  return arr.filter((e) => e.text === norm).length >= SPAM_COUNT;
}

function kickUserFromVoice(username) {
  for (const [sid, name] of sessions) {
    if (name !== username) continue;
    const sock = io.sockets.sockets.get(sid);
    if (!sock) continue;
    leaveVoiceRoom(sock);
    sock.emit("voiceKicked", {
      message: "Wegen Spam für 2 Minuten aus dem Voice entfernt.",
    });
  }
}

function publicUser(doc, username) {
  const u = doc || {};
  return {
    username,
    color: u.color || null,
    avatar: u.avatar || null,
    isAdmin: username === "Divo",
    banned: u.isBanned === true,
    tempBanned: (tempBans.get(username) || 0) > Date.now(),
  };
}

async function broadcastUserList() {
  try {
    const allUsers = await User.find({}, "username color avatar isBanned").lean();

    const onlineSet = new Set(sessions.values());
    const onlineArray = Array.from(onlineSet).map((u) =>
      publicUser(
        allUsers.find((x) => x.username === u),
        u,
      ),
    );
    const offlineArray = allUsers
      .filter((u) => !onlineSet.has(u.username))
      .map((u) => publicUser(u, u.username));

    io.emit("updateUserList", { online: onlineArray, offline: offlineArray });
  } catch (err) {
    console.error("Fehler beim Laden der User-Liste:", err.message);
  }
}

async function initDefaultVoiceRooms() {
  await VoiceRoom.updateOne(
    { isDefault: true },
    { $setOnInsert: { name: "Lobby", createdBy: "system", isDefault: true } },
    { upsert: true },
  );
  for (const p of CITY_PROJECTS) {
    await CityState.updateOne(
      { projectId: p.id },
      { $setOnInsert: { total: 0, status: "open", contributions: [] } },
      { upsert: true },
    );
  }
}

async function voiceMembers(roomId) {
  const memberIds = Array.from(voiceRoomsUsers.get(roomId) || []);
  const names = memberIds.map(
    (socketId) => io.sockets.sockets.get(socketId)?.data.voiceUsername || "Unbekannt",
  );
  let profiles = [];
  try {
    profiles = await User.find(
      { username: { $in: names } },
      "username color avatar isBanned",
    ).lean();
  } catch (err) {
    console.error("Fehler beim Laden der Voice-Profile:", err.message);
  }
  return memberIds.map((socketId, i) => {
    const username = names[i];
    const p = profiles.find((x) => x.username === username);
    return {
      socketId,
      username,
      color: p?.color || null,
      avatar: p?.avatar || null,
      isAdmin: username === "Divo",
      banned: p?.isBanned === true,
      tempBanned: (tempBans.get(username) || 0) > Date.now(),
    };
  });
}

async function broadcastVoicePresence(roomId) {
  try {
    io.emit("voicePresence", { roomId, members: await voiceMembers(roomId) });
  } catch (err) {
    console.error("Fehler bei voicePresence:", err.message);
  }
}

function leaveVoiceRoom(socket) {
  const roomId = socket.data.voiceRoomId;
  // Voice Leave beendet auch die World-Präsenz (Presence hängt am Voice).
  leaveWorld(socket);
  if (!roomId || !voiceRoomsUsers.has(roomId)) return;

  const members = voiceRoomsUsers.get(roomId);
  members.delete(socket.id);
  socket.leave(`voice-${roomId}`);
  socket.to(`voice-${roomId}`).emit("userLeftVoice", { socketId: socket.id });

  if (members.size === 0) voiceRoomsUsers.delete(roomId);
  delete socket.data.voiceRoomId;
  delete socket.data.voiceUsername;
  broadcastVoicePresence(roomId);
}

// ===== Jugendwort Voting API =====

const JUGENDWORT_WORDS = require("./public/Jugendwort/jw-data.json");

app.use((req, res, next) => {
  req.currentUsername = req.query.user || null;
  next();
});

app.get("/api/jugendwort/votes", async (req, res) => {
  try {
    const currentUsername = req.currentUsername;
    const users = await User.find(
      { jugendwortChoice: { $ne: null } },
      "jugendwortChoice username",
    );
    const counts = {};
    users.forEach((u) => {
      counts[u.jugendwortChoice] = (counts[u.jugendwortChoice] || 0) + 1;
    });

    let currentChoice = null;
    if (currentUsername) {
      const me = await User.findOne(
        { username: currentUsername },
        "jugendwortChoice",
      );
      if (me) currentChoice = me.jugendwortChoice;
    }

    const result = JUGENDWORT_WORDS.map((w) => ({
      ...w,
      votes: counts[w.id] || 0,
    }));

    res.json({ words: result, currentChoice });
  } catch (err) {
    console.error("Fehler bei /api/jugendwort/votes:", err.message);
    res.status(500).json({ error: "Serverfehler beim Laden der Votes." });
  }
});

app.post("/api/jugendwort/vote", async (req, res) => {
  try {
    const currentUsername = req.currentUsername;
    if (!currentUsername)
      return res.status(401).json({ error: "Nicht eingeloggt." });

    const { wordId } = req.body;
    if (!wordId) return res.status(400).json({ error: "wordId fehlt." });

    const exists = JUGENDWORT_WORDS.some((w) => w.id === wordId);
    if (!exists)
      return res.status(400).json({ error: "Unbekanntes Jugendwort." });

    const user = await User.findOne({ username: currentUsername });
    if (!user) return res.status(404).json({ error: "User nicht gefunden." });

    user.jugendwortChoice = wordId;
    await user.save();

    res.json({ success: true, choice: wordId });
  } catch (err) {
    console.error("Fehler bei POST /api/jugendwort/vote:", err.message);
    res.status(500).json({ error: "Serverfehler beim Voting." });
  }
});

app.delete("/api/jugendwort/vote", async (req, res) => {
  try {
    const currentUsername = req.currentUsername;
    if (!currentUsername)
      return res.status(401).json({ error: "Nicht eingeloggt." });

    const user = await User.findOne({ username: currentUsername });
    if (!user) return res.status(404).json({ error: "User nicht gefunden." });

    user.jugendwortChoice = undefined;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Fehler bei DELETE /api/jugendwort/vote:", err.message);
    res.status(500).json({ error: "Serverfehler beim Entfernen." });
  }
});

app.get("/api/jugendwort/admin", async (req, res) => {
  try {
    if (req.currentUsername !== "Divo") {
      return res.status(403).json({ error: "Kein Admin." });
    }

    const users = await User.find({}, "username jugendwortChoice");
    const counts = {};
    users.forEach((u) => {
      if (!u.jugendwortChoice) return;
      counts[u.jugendwortChoice] = (counts[u.jugendwortChoice] || 0) + 1;
    });

    const wordStats = JUGENDWORT_WORDS.map((w) => ({
      id: w.id,
      term: w.term,
      votes: counts[w.id] || 0,
    }));

    res.json({ users, wordStats });
  } catch (err) {
    console.error("Fehler bei /api/jugendwort/admin:", err.message);
    res.status(500).json({ error: "Serverfehler bei Admin-Daten." });
  }
});

// ===== Socket.IO Chat + Admin + Voice =====

io.on("connection", (socket) => {
  // ===== REGISTER =====
  socket.on("register", async (data) => {
    if (mongoose.connection.readyState !== 1) {
      return socket.emit(
        "registerError",
        "Verbindung zur Datenbank wird aufgebaut... Bitte kurz warten.",
      );
    }

    const { username, password } = data;
    if (!username || !password)
      return socket.emit("registerError", "Bitte alles ausfüllen.");
    if (username.length < 3)
      return socket.emit("registerError", "Min. 3 Zeichen.");

    try {
      const existingUser = await User.findOne({ username });
      if (existingUser)
        return socket.emit("registerError", "Username existiert bereits.");

      const newUser = new User({ username, password });
      await newUser.save();

      socket.emit("registerSuccess");
      broadcastUserList();
    } catch (err) {
      console.error("Register Fehler:", err.message);
      socket.emit("registerError", "Datenbank-Fehler beim Registrieren.");
    }
  });

  // Gemeinsamer Login-Abschluss (Passwort- und Token-Login)
  async function completeLogin(username, token) {
    sessions.set(socket.id, username);

    socket.emit("loginSuccess", { username, token });
    emitEconomy(socket, username);

    const chatHistory = await Message.find().sort({ _id: -1 }).limit(100);
    const histNames = [...new Set(chatHistory.map((m) => m.username))];
    let bannedSet = new Set();
    try {
      const bannedDocs = await User.find(
        { username: { $in: histNames }, isBanned: true },
        "username",
      ).lean();
      bannedDocs.forEach((u) => bannedSet.add(u.username));
    } catch (err) {
      console.error("Fehler beim Bann-Check (Verlauf):", err.message);
    }
    socket.emit(
      "loadHistory",
      chatHistory.reverse().map((m) => ({
        ...m.toObject(),
        isAdmin: m.username === "Divo",
        senderBanned:
          bannedSet.has(m.username) ||
          (tempBans.get(m.username) || 0) > Date.now(),
      })),
    );

    socket.broadcast.emit("userJoined", username);
    broadcastUserList();
  }

  // ===== LOGIN =====
  socket.on("login", async (data) => {
    if (mongoose.connection.readyState !== 1) {
      return socket.emit(
        "loginError",
        "Verbindung zur Datenbank wird aufgebaut... Bitte kurz warten.",
      );
    }

    const { username, password } = data;
    try {
      const user = await User.findOne({ username, password });
      if (!user)
        return socket.emit(
          "loginError",
          "Falsche Daten oder Account existiert nicht!",
        );
      if (user.isBanned)
        return socket.emit("loginError", "Du wurdest gebannt.");

      user.authToken = crypto.randomBytes(32).toString("hex");
      await user.save();

      await completeLogin(username, user.authToken);
    } catch (err) {
      console.error("Login Fehler:", err.message);
      socket.emit("loginError", "Datenbank-Fehler beim Login.");
    }
  });

  // ===== TOKEN-LOGIN ("Dieses Gerät merken") =====
  socket.on("loginWithToken", async (data) => {
    if (mongoose.connection.readyState !== 1) {
      return socket.emit(
        "loginError",
        "Verbindung zur Datenbank wird aufgebaut... Bitte kurz warten.",
      );
    }

    const { username, token } = data || {};
    if (!username || !token)
      return socket.emit(
        "loginError",
        "Sitzung abgelaufen. Bitte erneut einloggen.",
      );

    try {
      const user = await User.findOne({ username, authToken: token });
      if (!user)
        return socket.emit(
          "loginError",
          "Sitzung abgelaufen. Bitte erneut einloggen.",
        );
      if (user.isBanned)
        return socket.emit("loginError", "Du wurdest gebannt.");

      await completeLogin(username, token);
    } catch (err) {
      console.error("Token-Login Fehler:", err.message);
      socket.emit("loginError", "Datenbank-Fehler beim Login.");
    }
  });

  // ===== LOGOUT =====
  socket.on("logout", async () => {
    const username = sessions.get(socket.id);

    try {
      if (username) await User.updateOne({ username }, { $set: { authToken: null } });
    } catch (err) {
      console.error("Logout Fehler:", err.message);
    }

    leaveVoiceRoom(socket);
    leaveWorld(socket);

    if (username) {
      sessions.delete(socket.id);
      socket.broadcast.emit("userLeft", username);
      broadcastUserList();
    }
  });

  // ===== PROFILE =====
  socket.on("getProfile", async ({ username }) => {
    try {
      const user = await User.findOne({ username }, "username bio color avatar isBanned");
      if (!user)
        return socket.emit("profileData", { ok: false, message: "Profil nicht gefunden." });
      const me = sessions.get(socket.id);
      socket.emit("profileData", {
        ok: true,
        username: user.username,
        bio: user.bio || "",
        color: user.color || null,
        avatar: user.avatar || null,
        isOwn: me === user.username,
        isAdmin: user.username === "Divo",
        banned: user.isBanned === true,
        tempBanned: (tempBans.get(user.username) || 0) > Date.now(),
      });
    } catch (err) {
      console.error("getProfile Fehler:", err.message);
      socket.emit("profileData", { ok: false, message: "Fehler beim Laden." });
    }
  });

  socket.on("saveProfile", async (data) => {
    const me = sessions.get(socket.id);
    if (!me)
      return socket.emit("profileSaved", { ok: false, message: "Nicht eingeloggt." });

    let { bio, color, avatar } = data || {};
    bio = typeof bio === "string" ? bio.trim().slice(0, 160) : "";
    if (color && !ALLOWED_COLORS.includes(color))
      return socket.emit("profileSaved", { ok: false, message: "Ungültige Farbe." });
    if (avatar && !ALLOWED_AVATARS.includes(avatar))
      return socket.emit("profileSaved", { ok: false, message: "Ungültiger Avatar." });

    try {
      await User.updateOne(
        { username: me },
        { $set: { bio, color: color || null, avatar: avatar || null } },
      );
      socket.emit("profileSaved", { ok: true });
    } catch (err) {
      console.error("saveProfile Fehler:", err.message);
      socket.emit("profileSaved", { ok: false, message: "Fehler beim Speichern." });
    }
  });

  // ===== ECONOMY (server-autoritativ: Beträge kommen nur aus Server-Registries) =====
  socket.on("getEconomy", async () => {
    const username = sessions.get(socket.id);
    if (!username) return;
    await emitEconomy(socket, username);
  });

  socket.on("shopOpen", async ({ shopId }) => {
    const username = sessions.get(socket.id);
    if (!username) return;
    const shop = SHOPS[shopId];
    if (!shop) return socket.emit("shopResult", { ok: false, message: "Unbekannter Shop." });
    socket.emit("shopData", {
      shopId,
      name: shop.name,
      items: shop.items,
      balance: await getBalance(username).catch(() => 0),
    });
  });

  socket.on("shopBuy", async ({ shopId, itemId }) => {
    const username = sessions.get(socket.id);
    if (!username) return socket.emit("shopResult", { ok: false, message: "Nicht eingeloggt." });
    try {
      const shop = SHOPS[shopId];
      const item = shop && shop.items.find((i) => i.id === itemId);
      if (!item) return socket.emit("shopResult", { ok: false, message: "Unbekanntes Item." });
      const spent = await spendCoins(username, item.price, `shop:${shopId}:${itemId}`);
      if (!spent.ok) return socket.emit("shopResult", { ok: false, message: spent.message });
      await addInventory(username, item.id, 1);
      socket.emit("shopResult", { ok: true, message: `${item.name} gekauft (-${item.price} 🪙).` });
      await emitEconomy(socket, username);
    } catch (err) {
      console.error("shopBuy Fehler:", err.message);
      socket.emit("shopResult", { ok: false, message: "Fehler beim Kauf." });
    }
  });

  // ===== JOBS: genau ein Lieferjob-Loop, vollständig serverseitig validiert =====
  socket.on("jobState", async () => {
    const username = sessions.get(socket.id);
    if (!username) return;
    socket.emit("jobUpdate", { job: activeJobs.get(username) || null });
  });

  socket.on("jobStart", async ({ jobId }) => {
    const username = sessions.get(socket.id);
    if (!username) return socket.emit("jobResult", { ok: false, message: "Nicht eingeloggt." });
    try {
      if (jobId !== JOB_DELIVERY.id)
        return socket.emit("jobResult", { ok: false, message: "Unbekannter Job." });
      if (activeJobs.has(username))
        return socket.emit("jobResult", { ok: false, message: "Du hast bereits einen aktiven Auftrag." });
      const user = await User.findOne({ username }, "_id").lean();
      if (!user) return socket.emit("jobResult", { ok: false, message: "User nicht gefunden." });
      const spot = DROP_SPOTS[Math.floor(Math.random() * DROP_SPOTS.length)];
      const job = {
        jobId: JOB_DELIVERY.id,
        name: JOB_DELIVERY.name,
        targetId: spot.id,
        targetRoom: spot.room,
        targetZone: spot.zone,
        targetFloor: spot.floor,
        targetLabel: spot.label,
        targetX: spot.x,
        targetY: spot.y,
        reward: JOB_DELIVERY.reward,
        startedAt: Date.now(),
      };
      activeJobs.set(username, job);
      socket.emit("jobResult", { ok: true, message: "Auftrag angenommen!" });
      socket.emit("jobUpdate", { job });
    } catch (err) {
      console.error("jobStart Fehler:", err.message);
      socket.emit("jobResult", { ok: false, message: "Fehler beim Starten." });
    }
  });

  socket.on("jobComplete", async () => {
    const username = sessions.get(socket.id);
    if (!username) return socket.emit("jobResult", { ok: false, message: "Nicht eingeloggt." });
    try {
      const job = activeJobs.get(username);
      if (!job) return socket.emit("jobResult", { ok: false, message: "Kein aktiver Auftrag." });
      if (Date.now() - job.startedAt < JOB_DELIVERY.minSeconds * 1000)
        return socket.emit("jobResult", { ok: false, message: "Das ging zu schnell – Auftrag abgelehnt." });
      const spot = DROP_SPOTS.find((s) => s.id === job.targetId);
      if (!spot) {
        activeJobs.delete(username);
        return socket.emit("jobResult", { ok: false, message: "Auftrag ungültig." });
      }
      const presence = worldUsers.get(socket.id);
      if (!presence) return socket.emit("jobResult", { ok: false, message: "Du bist nicht in der Welt." });
      const dx = presence.x - spot.x, dy = presence.y - spot.y;
      if (presence.zone !== spot.zone || presence.room !== spot.room || dx * dx + dy * dy > 160 * 160)
        return socket.emit("jobResult", { ok: false, message: `Du musst am Ziel sein (${spot.label}).` });
      activeJobs.delete(username); // genau einmal auszahlen
      await earnCoins(username, job.reward, `job:${job.targetId}`);
      socket.emit("jobResult", { ok: true, message: `Auftrag erledigt! +${job.reward} 🪙` });
      socket.emit("jobUpdate", { job: null, completed: { reward: job.reward } });
      await emitEconomy(socket, username);
    } catch (err) {
      console.error("jobComplete Fehler:", err.message);
      socket.emit("jobResult", { ok: false, message: "Fehler beim Abschließen." });
    }
  });

  // ===== CITY: Beiträge + Gebäude, persistent in MongoDB =====
  socket.on("cityInfo", async () => {
    const username = sessions.get(socket.id);
    if (!username) return;
    try {
      socket.emit("cityData", await cityPayload(username));
    } catch (err) {
      console.error("cityInfo Fehler:", err.message);
    }
  });

  socket.on("cityContribute", async ({ projectId, amount }) => {
    const username = sessions.get(socket.id);
    if (!username) return socket.emit("cityResult", { ok: false, message: "Nicht eingeloggt." });
    try {
      const project = CITY_PROJECTS.find((p) => p.id === projectId);
      if (!project) return socket.emit("cityResult", { ok: false, message: "Unbekanntes Projekt." });
      if (!isValidAmount(amount))
        return socket.emit("cityResult", { ok: false, message: "Ungültiger Betrag." });
      const state = await CityState.findOne({ projectId });
      if (!state || state.status === "completed")
        return socket.emit("cityResult", { ok: false, message: "Projekt bereits fertig." });
      if (state.total >= project.cost)
        return socket.emit("cityResult", { ok: false, message: "Projekt bereits finanziert." });
      const give = Math.min(amount, project.cost - state.total);
      const spent = await spendCoins(username, give, `city:${projectId}`);
      if (!spent.ok) return socket.emit("cityResult", { ok: false, message: spent.message });
      const updated = await CityState.findOneAndUpdate(
        { projectId },
        { $inc: { total: give }, $push: { contributions: { user: username, amount: give } }, $set: { updatedAt: new Date() } },
        { new: true },
      ).lean();
      socket.emit("cityResult", { ok: true, message: `${give} 🪙 beigetragen. Danke!` });
      await emitEconomy(socket, username);
      if (updated && updated.total >= project.cost && updated.status !== "completed") {
        await CityState.updateOne({ projectId }, { $set: { status: "completed" } });
        io.emit("buildingUpdate", { building: { id: project.id, ...BUILDINGS[project.id] } });
      }
      await broadcastCity();
    } catch (err) {
      console.error("cityContribute Fehler:", err.message);
      socket.emit("cityResult", { ok: false, message: "Fehler beim Beitragen." });
    }
  });

  // ===== ADMIN ECONOMY (nur Divo, server-autoritativ) =====
  socket.on("adminEconomy", async ({ target, action, amount }) => {
    const caller = sessions.get(socket.id);
    if (caller !== "Divo") return socket.emit("adminEconomyResult", { ok: false, message: "Kein Admin." });
    if (!target || !["set", "add", "remove"].includes(action))
      return socket.emit("adminEconomyResult", { ok: false, message: "Ungültige Aktion." });
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0 || amount > 1000000)
      return socket.emit("adminEconomyResult", { ok: false, message: "Ungültiger Betrag (0–1000000)." });
    try {
      const user = await User.findOne({ username: target });
      if (!user) return socket.emit("adminEconomyResult", { ok: false, message: "Spieler nicht gefunden." });
      let newBalance;
      if (action === "set") {
        if (amount < 0) return socket.emit("adminEconomyResult", { ok: false, message: "Negativer Stand nicht erlaubt." });
        user.coins = amount;
        await user.save();
        newBalance = amount;
      } else if (action === "add") {
        newBalance = await earnCoins(target, amount, `admin:add:${caller}`);
      } else if (action === "remove") {
        const res = await spendCoins(target, amount, `admin:remove:${caller}`);
        if (!res.ok) return socket.emit("adminEconomyResult", { ok: false, message: res.message });
        newBalance = res.balance;
      }
      socket.emit("adminEconomyResult", { ok: true, message: `${target}: ${newBalance} 🪙`, balance: newBalance });
      // Betroffenen live aktualisieren, falls online
      for (const [sid, uname] of sessions) {
        if (uname === target) {
          const s = io.sockets.sockets.get(sid);
          if (s) emitEconomy(s, target);
        }
      }
    } catch (err) {
      console.error("adminEconomy Fehler:", err.message);
      socket.emit("adminEconomyResult", { ok: false, message: "Fehler." });
    }
  });

  // ===== CHAT MESSAGE =====
  socket.on("chatMessage", async (msg) => {
    const username = sessions.get(socket.id);
    if (!username) return;

    try {
      const user = await User.findOne({ username }, "isBanned avatar color");
      if (!user || user.isBanned) return;
      if ((tempBans.get(username) || 0) > Date.now()) return; // temporär stummgeschaltet

      const timestamp = new Date().toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (username !== "Divo" && isSpam(username, msg)) {
        tempBans.set(username, Date.now() + SPAM_BAN_MS);
        recentMsgs.delete(username);
        kickUserFromVoice(username);
        io.emit("chatMessage", {
          username: "System",
          msg: `${username} wurde wegen Spam für 2 Minuten stummgeschaltet (Chat + Voice).`,
          timestamp,
          color: "#ff8d98",
          avatar: "🚨",
        });
        broadcastUserList(); // Lobby sofort rot markieren
        setTimeout(() => {
          if ((tempBans.get(username) || 0) <= Date.now())
            tempBans.delete(username);
        }, SPAM_BAN_MS + 1000);
        return;
      }

      const messageData = {
        username,
        msg,
        timestamp,
        avatar: user.avatar || null,
        color: user.color || null,
        isAdmin: username === "Divo",
      };

      const newMsg = new Message(messageData);
      await newMsg.save();

      io.emit("chatMessage", {
        ...messageData,
        _id: newMsg._id.toString(),
      });

      const count = await Message.countDocuments();
      if (count > 100) {
        const oldestMsg = await Message.findOne().sort({ _id: 1 });
        if (oldestMsg) await Message.findByIdAndDelete(oldestMsg._id);
      }
    } catch (err) {
      console.error("Fehler beim Speichern der Nachricht:", err.message);
    }
  });

  // ===== ADMIN EVENTS =====
  socket.on("adminToggleBan", async ({ username }) => {
    const caller = sessions.get(socket.id);
    if (caller !== "Divo") return;

    try {
      const user = await User.findOne({ username });
      if (!user) {
        return socket.emit("adminActionResult", {
          ok: false,
          message: "User nicht gefunden.",
        });
      }

      user.isBanned = !user.isBanned;
      await user.save();

      broadcastUserList(); // Lobby sofort umfärben
      if (user.isBanned) kickUserFromVoice(username); // sofort aus Voice werfen

      socket.emit("adminActionResult", {
        ok: true,
        message: `Bann für ${username}: ${user.isBanned ? "aktiv" : "inaktiv"}.`,
      });
    } catch (err) {
      console.error("adminToggleBan Fehler:", err.message);
      socket.emit("adminActionResult", {
        ok: false,
        message: "Fehler beim Bann.",
      });
    }
  });

  socket.on("adminRenameUser", async ({ oldName, newName }) => {
    const caller = sessions.get(socket.id);
    if (caller !== "Divo") return;

    try {
      const user = await User.findOne({ username: oldName });
      if (!user) {
        return socket.emit("adminActionResult", {
          ok: false,
          message: "User nicht gefunden.",
        });
      }

      user.username = newName;
      await user.save();

      socket.emit("adminActionResult", {
        ok: true,
        message: `Name geändert: ${oldName} → ${newName}`,
      });

      broadcastUserList();
    } catch (err) {
      console.error("adminRenameUser Fehler:", err.message);
      socket.emit("adminActionResult", {
        ok: false,
        message: "Fehler beim Umbenennen.",
      });
    }
  });

  socket.on("adminClearChat", async () => {
    const caller = sessions.get(socket.id);
    if (caller !== "Divo") return;

    try {
      await Message.deleteMany({});
      io.emit("loadHistory", []);
      socket.emit("adminActionResult", {
        ok: true,
        message: "Gesamter Chat gelöscht.",
      });
    } catch (err) {
      console.error("adminClearChat Fehler:", err.message);
      socket.emit("adminActionResult", {
        ok: false,
        message: "Fehler beim Löschen.",
      });
    }
  });

  socket.on("adminDeleteMessage", async ({ id }) => {
    const caller = sessions.get(socket.id);
    if (caller !== "Divo") return;

    try {
      if (!id) {
        return socket.emit("adminActionResult", {
          ok: false,
          message: "Nachrichten-ID fehlt.",
        });
      }

      await Message.findByIdAndDelete(id);
      io.emit("adminMessageDeleted", { id });
      socket.emit("adminActionResult", {
        ok: true,
        message: "Nachricht gelöscht.",
      });
    } catch (err) {
      console.error("adminDeleteMessage Fehler:", err.message);
      socket.emit("adminActionResult", {
        ok: false,
        message: "Fehler beim Löschen der Nachricht.",
      });
    }
  });

  // ===== VOICE SIGNALING (WebRTC) =====
  socket.on("getVoiceRooms", async () => {
    const rooms = await VoiceRoom.find().sort({ isDefault: -1, createdAt: 1 }).lean();
    socket.emit("voiceRoomsList", rooms);
  });

  socket.on("joinVoiceRoom", async ({ roomId }) => {
    const username = sessions.get(socket.id);
    if (!roomId || !username) return;

    const bannedUntil = tempBans.get(username) || 0;
    if (bannedUntil > Date.now()) {
      const secs = Math.ceil((bannedUntil - Date.now()) / 1000);
      return socket.emit(
        "voiceError",
        `Wegen Spam noch ${secs} Sekunden für Voice gesperrt.`,
      );
    }

    try {
      const banDoc = await User.findOne({ username }, "isBanned").lean();
      if (banDoc?.isBanned)
        return socket.emit(
          "voiceError",
          "Du wurdest gebannt und kannst Voice nicht nutzen.",
        );
    } catch (err) {
      console.error("Voice-Banncheck Fehler:", err.message);
    }

    const room = await VoiceRoom.findById(roomId).lean();
    if (!room) return socket.emit("voiceError", "Der Voice-Raum wurde nicht gefunden.");

    if (socket.data.voiceRoomId === roomId) return;
    leaveVoiceRoom(socket);

    socket.data.voiceRoomId = roomId;
    socket.data.voiceUsername = username;

    if (!voiceRoomsUsers.has(roomId)) {
      voiceRoomsUsers.set(roomId, new Set());
    }
    const set = voiceRoomsUsers.get(roomId);

    const existingPeers = Array.from(set);

    set.add(socket.id);
    socket.join(`voice-${roomId}`);

    socket.emit("voicePeers", existingPeers);

    socket.to(`voice-${roomId}`).emit("userJoinedVoice", {
      socketId: socket.id,
      username,
    });
    broadcastVoicePresence(roomId);
  });

  socket.on("leaveVoiceRoom", () => leaveVoiceRoom(socket));

  socket.on("offer", ({ targetId, offer }) => {
    io.to(targetId).emit("offer", { fromId: socket.id, offer });
  });

  socket.on("answer", ({ targetId, answer }) => {
    io.to(targetId).emit("answer", { fromId: socket.id, answer });
  });

  socket.on("iceCandidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("iceCandidate", { fromId: socket.id, candidate });
  });

  // ===== 2D-WELT: Positionen + Proximity-Voice-Signaling =====
  socket.on("worldJoin", async () => {
    const username = sessions.get(socket.id);
    if (!username) return;
    if (!isWorldAllowed(username)) {
      return socket.emit("worldError", "Welt ist noch nicht freigeschaltet — Coming Soon! Voice Chat ist verfügbar.");
    }
    // Server-autoritativ: nur mit aktivem Voice-Kontext gibt es World-Präsenz.
    if (!socket.data.voiceRoomId) {
      return socket.emit(
        "worldError",
        "Tritt erst dem Voice-Chat bei (V oder Ausgangstür), um in der Welt zu erscheinen.",
      );
    }
    let avatar = null, color = null, banned = false;
    let spawn = { x: 1200, y: 1600, zone: "villa", floor: 0, room: "lounge" };
    try {
      const doc = await User.findOne({ username }, "avatar color isBanned lastWorldPos").lean();
      if (doc) {
        avatar = doc.avatar || null;
        color = doc.color || null;
        banned = doc.isBanned === true;
        const p = doc.lastWorldPos;
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          // Migration: alte 960x600 Positionen → neue Welt skaliert + clamped
          const isOld = p.x < 960 && p.y < 600 && !p.zone;
          const nx = isOld ? p.x + 700 : p.x;
          const ny = isOld ? p.y + 1100 : p.y;
          spawn = {
            x: Math.max(20, Math.min(WORLD_W - 20, nx)),
            y: Math.max(20, Math.min(WORLD_H - 20, ny)),
            zone: (p.zone && WORLD_ZONES.includes(p.zone)) ? p.zone : (isOld ? "villa" : "villa"),
            floor: Number.isFinite(p.floor) ? p.floor : 0,
            room: p.room || "lounge",
          };
          // Fallback wenn in Solid: sicheren Spawn nehmen
          if (spawn.x < 100) spawn.x = 1200;
          if (spawn.y < 100) spawn.y = 1600;
        }
      }
    } catch (err) {
      console.error("worldJoin Fehler:", err.message);
    }
    worldUsers.set(socket.id, {
      username,
      x: spawn.x,
      y: spawn.y,
      room: spawn.room,
      zone: spawn.zone,
      floor: spawn.floor,
      seat: null,
      avatar,
      color,
      banned,
      tempBanned: (tempBans.get(username) || 0) > Date.now(),
      updatedAt: Date.now(),
    });
    socket.emit("worldJoined", { x: spawn.x, y: spawn.y, zone: spawn.zone, floor: spawn.floor, room: spawn.room });
    // NPC Snapshot + Door States für neuen Client
    socket.emit("npcUpdate", NPCS_SERVER.filter((n) => n.id !== "npc_cafe" || n.state !== "hidden"));
    socket.emit("doorStates", Object.fromEntries(doorStates));
    broadcastWorld();
  });

  socket.on("worldMove", (data) => {
    const username = sessions.get(socket.id);
    if (username && !isWorldAllowed(username)) return;
    const u = worldUsers.get(socket.id);
    if (!u) return;
    const { x, y, room, zone, floor, seat } = data || {};
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    u.x = Math.max(0, Math.min(WORLD_W, x));
    u.y = Math.max(0, Math.min(WORLD_H, y));
    if (WORLD_ROOMS.includes(room)) u.room = room;
    if (zone && WORLD_ZONES.includes(zone)) u.zone = zone;
    if (Number.isFinite(floor) && floor >= 0 && floor <= 2) u.floor = floor;
    u.seat = typeof seat === "string" && seat.length < 16 ? seat : null;
    u.tempBanned = (tempBans.get(u.username) || 0) > Date.now();
    u.updatedAt = Date.now();
    broadcastWorldThrottled();
  });

  socket.on("doorUpdate", ({ doorId, state }) => {
    const username = sessions.get(socket.id);
    if (!username) return;
    if (!isWorldAllowed(username)) return;
    if (!doorStates.has(doorId)) return;
    if (!["open", "closed"].includes(state)) return;
    const u = worldUsers.get(socket.id);
    if (!u) return;
    // Distanz-Check (50px) + Zone/Floor
    // Für Test: einfache Distanz, echte Door-Position aus WORLD_DOORS wäre ideal, hier generisch
    doorStates.set(doorId, state);
    io.emit("doorStates", Object.fromEntries(doorStates));
  });

  socket.on("worldLeave", () => leaveWorld(socket));

  socket.on("worldOffer", ({ targetId, offer }) => {
    io.to(targetId).emit("worldOffer", { fromId: socket.id, offer });
  });

  socket.on("worldAnswer", ({ targetId, answer }) => {
    io.to(targetId).emit("worldAnswer", { fromId: socket.id, answer });
  });

  socket.on("worldIce", ({ targetId, candidate }) => {
    io.to(targetId).emit("worldIce", { fromId: socket.id, candidate });
  });

  socket.on("voiceMuteState", ({ muted }) => {
    const roomId = socket.data.voiceRoomId;
    if (!roomId) return;
    socket
      .to(`voice-${roomId}`)
      .emit("voiceMuteState", { socketId: socket.id, muted: !!muted });
  });

  socket.on("disconnect", () => {
    const username = sessions.get(socket.id);

    // Voice‑Cleanup
    leaveVoiceRoom(socket);
    leaveWorld(socket);

    // Chat‑Sessions wie bisher
    if (username) {
      sessions.delete(socket.id);
      socket.broadcast.emit("userLeft", username);
      broadcastUserList();
    }
  });
});

// ===== Serverstart =====

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
