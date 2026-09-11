document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const $ = (id) => document.getElementById(id);
  const authModal = $("authModal"), chatContainer = $("chatContainer");
  const messages = $("messages"), onlineList = $("onlineList");
  const currentUser = () => localStorage.getItem("cucuri_username");
  // Identität DIESES Tabs (localStorage teilen sich alle Tabs -> pro Tab merken)
  let sessionUsername = null;
  const activeUser = () => sessionUsername || currentUser();

  // ===== Profil-Konstanten (Spiegel der Server-Whitelists) =====
  const PROFILE_AVATARS = ["😀", "😎", "🤖", "👾", "🐱", "🦊", "🐼", "🚀", "⭐", "🎮", "🎧", "💜"];
  const PROFILE_COLORS = ["#79dce8", "#ffd166", "#ff8fa3", "#95d5b2", "#b8a9ff", "#ffa36b", "#7dd3fc", "#f472b6"];
  let currentProfile = null, selectedAvatar = null, selectedColor = null;
  // Online-Liste für Profil-Farben/Avatare (Welt-Spieler)
  let lastOnline = [];

  function showTab(tab) { ["registerTab", "loginTab"].forEach((id) => $(id)?.classList.toggle("active", id === tab)); }
  $("switchToLogin")?.addEventListener("click", (e) => { e.preventDefault(); showTab("loginTab"); });
  $("switchToRegister")?.addEventListener("click", (e) => { e.preventDefault(); showTab("registerTab"); });
  $("closeBtn")?.addEventListener("click", () => authModal?.classList.remove("active"));
  $("registerBtn")?.addEventListener("click", () => socket.emit("register", { username: $("regUsername").value.trim(), password: $("regPassword").value.trim() }));
  $("loginBtn")?.addEventListener("click", () => socket.emit("login", { username: $("loginUsername").value.trim(), password: $("loginPassword").value.trim() }));
  ["regUsername", "regPassword", "loginUsername", "loginPassword"].forEach((id) => $(id)?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $(id.startsWith("reg") ? "registerBtn" : "loginBtn")?.click(); } }));
  socket.on("registerSuccess", () => { $("registerError").textContent = "Erfolgreich registriert. Bitte einloggen."; showTab("loginTab"); });
  socket.on("registerError", (message) => { $("registerError").textContent = message; });
  socket.on("loginError", (message) => { $("loginError").textContent = message; sessionUsername = null; try { localStorage.removeItem("cucuri_session"); } catch {} });
  // Reconnect: Sitzung nach Server-Neustart automatisch wiederherstellen
  let socketFirstConnect = true;
  socket.on("connect", () => {
    if (socketFirstConnect) { socketFirstConnect = false; return; }
    if (worldActive) { socket.emit("worldJoin"); worldEmitMove(true); }
    if (roomId || stream) leaveVoice();
    let sess = null;
    try { sess = JSON.parse(localStorage.getItem("cucuri_session") || "null"); } catch {}
    if (sess && sess.username && sess.token) {
      socket.emit("loginWithToken", { username: sess.username, token: sess.token });
    } else if (currentUser()) {
      try { localStorage.removeItem("cucuri_username"); } catch {}
      if (chatContainer) chatContainer.style.display = "none";
      chatContainer?.classList.add("hidden");
      authModal?.classList.add("active");
      setView("chat");
      ["logoutBtn", "profileBtn", "adminToggle", "coinPill"].forEach((id) => $(id)?.classList.add("hidden"));
      const le = $("loginError");
      if (le) le.textContent = "Verbindung neu aufgebaut – bitte erneut einloggen.";
    }
  });
  // Automatisch eingeloggt bleiben ("Dieses Gerät merken")
  try {
    const sess = JSON.parse(localStorage.getItem("cucuri_session") || "null");
    if (sess && sess.username && sess.token) socket.emit("loginWithToken", { username: sess.username, token: sess.token });
  } catch {}
  socket.on("loginSuccess", (data) => {
    const username = typeof data === "string" ? data : data?.username;
    const token = typeof data === "object" && data ? data.token : null;
    if (!username) return;
    sessionUsername = username;
    localStorage.setItem("cucuri_username", username);
    try {
      if (token && $("rememberMe")?.checked !== false) localStorage.setItem("cucuri_session", JSON.stringify({ username, token }));
      else localStorage.removeItem("cucuri_session");
    } catch {}
    authModal?.classList.remove("active"); chatContainer?.classList.remove("hidden");
    if (chatContainer) chatContainer.style.display = "flex";
    $("jugendwortBtn")?.classList.remove("hidden");
    $("logoutBtn")?.classList.remove("hidden"); $("profileBtn")?.classList.remove("hidden"); $("coinPill")?.classList.remove("hidden");
    if (username === "Divo") $("adminToggle")?.classList.remove("hidden");
    // Mikrofon-Zugriff automatisch anfragen (Stream wird nur lokal gehalten,
    // übertragen wird erst nach "Voice beitreten").
    ensureMic();
  });
  $("logoutBtn")?.addEventListener("click", () => {
    socket.emit("logout");
    leaveVoice();
    setView("chat");
    sessionUsername = null;
    activeJob = null;
    renderJobPanel();
    try { localStorage.removeItem("cucuri_session"); } catch {}
    if (chatContainer) chatContainer.style.display = "none";
    chatContainer?.classList.add("hidden");
    authModal?.classList.add("active");
    $("logoutBtn")?.classList.add("hidden");
    $("profileBtn")?.classList.add("hidden");
    $("coinPill")?.classList.add("hidden");
    $("adminToggle")?.classList.add("hidden");
  });
  $("coinPill")?.addEventListener("click", () => {
    socket.emit("getEconomy");
    renderWallet();
    openGameModal("walletModal");
  });
  for (const [btn, modal] of [["walletClose", "walletModal"], ["jobClose", "jobModal"], ["shopClose", "shopModal"], ["cityClose", "cityModal"], ["computerClose", "computerModal"]]) {
    $(btn)?.addEventListener("click", () => $(modal)?.classList.remove("active"));
  }
  function addMessage(data) { if (!messages) return; const node = document.createElement("div"); node.className = "message"; if (data._id) node.dataset.mid = data._id; if (data.username === "System") node.classList.add("is-system"); node.innerHTML = `<div class="msg-header"><span class="msg-avatar"></span><span class="msg-username"></span><time class="msg-time"></time></div><div class="msg-text"></div>`; const unameEl = node.querySelector(".msg-username"); const msgIsAdmin = data.isAdmin === true; unameEl.textContent = data.username; unameEl.dataset.username = data.username; if (msgIsAdmin) { node.classList.add("is-admin"); const rank = document.createElement("span"); rank.className = "rank-badge"; rank.textContent = "Admin"; unameEl.after(rank); } else if (data.senderBanned === true) { node.classList.add("is-banned"); const ban = document.createElement("span"); ban.className = "rank-badge rank-badge--banned"; ban.textContent = "Gebannt"; unameEl.after(ban); } else if (data.color) unameEl.style.color = data.color; node.querySelector(".msg-avatar").textContent = data.avatar || ""; node.querySelector(".msg-time").textContent = data.timestamp || ""; node.querySelector(".msg-text").textContent = data.msg; if (activeUser() === "Divo" && data._id) { node.classList.add("deletable"); const del = document.createElement("button"); del.type = "button"; del.className = "msg-delete-btn"; del.textContent = "✕"; del.title = "Nachricht löschen"; del.addEventListener("click", (e) => { e.stopPropagation(); if (confirm("Diese Nachricht wirklich löschen?")) socket.emit("adminDeleteMessage", { id: data._id }); }); node.querySelector(".msg-header").append(del); } messages.appendChild(node); }
  socket.on("adminMessageDeleted", ({ id }) => { if (id) document.querySelector(`.message[data-mid="${id}"]`)?.remove(); });
  socket.on("loadHistory", (history) => { messages.innerHTML = ""; history.forEach(addMessage); messages.scrollTop = messages.scrollHeight; });
  socket.on("chatMessage", (data) => { addMessage(data); messages.scrollTop = messages.scrollHeight; spawnWorldBubble(data.username, data.msg); });
  const sendMessage = () => { const input = $("messageInput"); const text = input?.value.trim(); if (text) { socket.emit("chatMessage", text); input.value = ""; } };
  $("sendBtn")?.addEventListener("click", sendMessage); $("messageInput")?.addEventListener("keydown", (e) => e.key === "Enter" && sendMessage());
  socket.on("updateUserList", ({ online, offline }) => {
    if (!onlineList) return;
    onlineList.innerHTML = "";
    const norm = (e) => (typeof e === "string" ? { username: e } : e);
    lastOnline = (online || []).map(norm).filter((e) => e && e.username);
    [...(online || []).map((e) => [norm(e), true]), ...(offline || []).map((e) => [norm(e), false])].forEach(([entry, isOnline]) => {
      const li = document.createElement("li");
      li.dataset.username = entry.username;
      li.classList.add("user-entry");
      if (!isOnline) li.classList.add("is-offline");
      if (entry.isAdmin) li.classList.add("is-admin");
      const dot = document.createElement("span");
      dot.className = "lobby-dot";
      dot.textContent = isOnline ? "🟢" : "🔴";
      li.append(dot);
      if (entry.avatar) {
        const av = document.createElement("span");
        av.className = "lobby-avatar";
        av.textContent = entry.avatar;
        li.append(av);
      }
      const nm = document.createElement("span");
      nm.textContent = entry.username;
      if (entry.color) nm.style.color = entry.color;
      li.append(nm);
      if (entry.isAdmin) {
        const rank = document.createElement("span");
        rank.className = "rank-badge";
        rank.textContent = "Admin";
        li.append(rank);
      }
      if (entry.banned || entry.tempBanned) {
        li.classList.add("is-banned");
        nm.style.color = "#ff8d98";
        const ban = document.createElement("span");
        ban.className = "rank-badge rank-badge--banned";
        ban.textContent = "Gebannt";
        li.append(ban);
      }
      onlineList.appendChild(li);
    });
  });


  // Existing navigation and admin controls remain available alongside Voice.
  const gamesMenu = $("gamesMenu"), toggleGamesBtn = $("toggleGamesBtn");
  toggleGamesBtn?.addEventListener("click", (event) => { event.stopPropagation(); gamesMenu?.classList.toggle("closed"); });
  $("adminToggle")?.addEventListener("click", () => $("adminPanel")?.classList.toggle("hidden"));
  $("banBtn")?.addEventListener("click", () => { const username = $("banUsername")?.value.trim(); if (username) socket.emit("adminToggleBan", { username }); });
  $("renameBtn")?.addEventListener("click", () => { const oldName = $("oldName")?.value.trim(), newName = $("newName")?.value.trim(); if (oldName && newName) socket.emit("adminRenameUser", { oldName, newName }); });
  $("clearChatBtn")?.addEventListener("click", () => { if (confirm("Gesamten Chat wirklich löschen?")) socket.emit("adminClearChat"); });
  socket.on("adminActionResult", ({ message }) => alert(message));
  const youthModal = $("jugendwortModal");
  $("jugendwortBtn")?.addEventListener("click", () => youthModal?.classList.add("active"));
  $("jwCloseBtn")?.addEventListener("click", () => youthModal?.classList.remove("active"));

  // ===== Profil =====
  const profileModal = $("profileModal");
  function profileMsg(text, isError = false) { const el = $("profileMsg"); if (!el) return; el.textContent = text || ""; el.style.color = isError ? "#ff8d98" : ""; }
  function markSelected(gridId, value) { document.querySelectorAll(`#${gridId} button`).forEach((b) => b.classList.toggle("selected", b.dataset.value === (value || ""))); }
  function buildPickers() {
    const ag = $("avatarGrid"), cg = $("colorGrid");
    if (ag && !ag.children.length) {
      const none = document.createElement("button");
      none.type = "button"; none.textContent = "✕"; none.title = "Kein Avatar"; none.dataset.value = "";
      none.addEventListener("click", () => { selectedAvatar = null; markSelected("avatarGrid", ""); });
      ag.appendChild(none);
      PROFILE_AVATARS.forEach((e) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = e; b.dataset.value = e;
        b.addEventListener("click", () => { selectedAvatar = e; markSelected("avatarGrid", e); });
        ag.appendChild(b);
      });
    }
    if (cg && !cg.children.length) {
      const none = document.createElement("button");
      none.type = "button"; none.title = "Standardfarbe"; none.dataset.value = ""; none.style.background = "transparent"; none.textContent = "✕";
      none.addEventListener("click", () => { selectedColor = null; markSelected("colorGrid", ""); });
      cg.appendChild(none);
      PROFILE_COLORS.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button"; b.title = c; b.dataset.value = c; b.style.background = c;
        b.addEventListener("click", () => { selectedColor = c; markSelected("colorGrid", c); });
        cg.appendChild(b);
      });
    }
  }
  function openProfile(username) {
    if (!username) return;
    currentProfile = username;
    profileMsg("");
    $("profileName").textContent = username;
    $("profileAvatarBig").textContent = "👤";
    $("profileName").style.color = "";
    $("profileAdminBadge")?.classList.add("hidden");
    $("profileBannedBadge")?.classList.add("hidden");
    $("profileBioView").textContent = "Lädt …";
    $("profileEditFields")?.classList.add("hidden");
    profileModal?.classList.add("active");
    socket.emit("getProfile", { username });
  }
  socket.on("profileData", (p) => {
    if (!p || !p.ok || p.username !== currentProfile) { if (p && !p.ok) profileMsg(p.message || "Fehler.", true); return; }
    $("profileName").textContent = p.username;
    $("profileAvatarBig").textContent = p.avatar || "👤";
    $("profileName").style.color = p.color || "";
    $("profileAdminBadge")?.classList.toggle("hidden", !p.isAdmin);
    const banBadge = $("profileBannedBadge");
    if (banBadge) {
      const isBanned = Boolean(p.banned || p.tempBanned);
      banBadge.classList.toggle("hidden", !isBanned);
      if (isBanned) banBadge.textContent = "GEBANNT";
    }
    $("profileBioView").textContent = p.bio || "Noch keine Bio.";
    const own = Boolean(p.isOwn);
    $("profileEditFields")?.classList.toggle("hidden", !own);
    if (own) {
      buildPickers();
      selectedAvatar = p.avatar || null;
      selectedColor = p.color || null;
      markSelected("avatarGrid", selectedAvatar || "");
      markSelected("colorGrid", selectedColor || "");
      $("profileBioInput").value = p.bio || "";
    }
  });
  socket.on("profileSaved", (res) => {
    if (!res?.ok) return profileMsg(res?.message || "Fehler.", true);
    profileMsg("Gespeichert ✓");
    socket.emit("getProfile", { username: currentProfile });
  });
  $("profileBtn")?.addEventListener("click", () => openProfile(activeUser()));
  $("profileClose")?.addEventListener("click", () => profileModal?.classList.remove("active"));
  $("profileSaveBtn")?.addEventListener("click", () => {
    profileMsg("Speichert …");
    socket.emit("saveProfile", { bio: $("profileBioInput")?.value || "", color: selectedColor, avatar: selectedAvatar });
  });
  // Klick auf Username (Chat) oder Lobby-Eintrag öffnet das Profil
  document.addEventListener("click", (event) => {
    if (event.target.closest("#profileModal")) return;
    const el = event.target.closest("[data-username]");
    if (!el || !activeUser() || chatContainer?.classList.contains("hidden")) return;
    const profName = el.dataset.username;
    if (profName && profName !== "System") openProfile(profName);
  });

  const VIEW_IDS = { chat: "Chat", world: "World" };
  function setView(view) {
    if (!VIEW_IDS[view]) view = "chat";
    ["chat", "world"].forEach((v) => $("viewBtn" + VIEW_IDS[v])?.classList.toggle("active", v === view));
    $("messages")?.classList.toggle("hidden", view !== "chat");
    $("worldView")?.classList.toggle("hidden", view !== "world");
    // Chat-Fenster: Chat + alte Lobby. Welt-Fenster: Welt + Voice.
    $("chatContainer")?.classList.toggle("view-voice", view !== "chat");
    if (view === "world") worldStart(); else worldStop();
  }
  $("viewBtnChat")?.addEventListener("click", () => setView("chat"));
  $("viewBtnWorld")?.addEventListener("click", () => setView("world"));

  // ===== 2D-Welt: Datenmodell (Geometrie zuerst, Deko danach) =====
  // Koordinatenraum 960x600 = Server-Protokoll (kein Backend-Change).
  // Maßstab: Player-Radius 16 (Durchmesser 32) als Referenz für alles.
  const WORLD = {
    w: 960, h: 600,
    rooms: [
      { id: "kitchen", name: "Küche", x: 36, y: 36, w: 288, h: 276, floor: "rgba(170,200,215,.08)" },
      { id: "living", name: "Wohnzimmer", x: 336, y: 36, w: 288, h: 276, floor: "rgba(150,130,200,.08)" },
      { id: "gaming", name: "Gaming", x: 636, y: 36, w: 288, h: 276, floor: "rgba(121,220,232,.07)" },
      { id: "chill", name: "Chill-Ecke", x: 36, y: 400, w: 252, h: 164, floor: "rgba(255,190,120,.09)" },
      { id: "lounge", name: "Eingang & Flur", x: 36, y: 312, w: 888, h: 252, floor: "rgba(200,150,100,.05)" },
    ],
    walls: [
      { x: 24, y: 24, w: 912, h: 12 },
      { x: 24, y: 564, w: 912, h: 12 },
      { x: 24, y: 24, w: 12, h: 552 },
      { x: 924, y: 24, w: 12, h: 552 },
      { x: 36, y: 300, w: 110, h: 12 },
      { x: 200, y: 300, w: 253, h: 12 },
      { x: 507, y: 300, w: 253, h: 12 },
      { x: 814, y: 300, w: 110, h: 12 },
      { x: 324, y: 36, w: 12, h: 264 },
      { x: 624, y: 36, w: 12, h: 264 },
      { x: 288, y: 400, w: 12, h: 100 },
    ],
    doors: [
      { x: 146, y: 296, w: 54, h: 20, from: "kitchen", to: "lounge" },
      { x: 453, y: 296, w: 54, h: 20, from: "living", to: "lounge" },
      { x: 760, y: 296, w: 54, h: 20, from: "gaming", to: "lounge" },
    ],
    seats: [
      { id: "k1", x: 140, y: 244, room: "kitchen" },
      { id: "k2", x: 240, y: 244, room: "kitchen" },
      { id: "s1", x: 440, y: 180, room: "living" },
      { id: "s2", x: 520, y: 180, room: "living" },
      { id: "g1", x: 695, y: 172, room: "gaming" },
      { id: "g2", x: 780, y: 172, room: "gaming" },
      { id: "g3", x: 865, y: 172, room: "gaming" },
      { id: "c1", x: 215, y: 505, room: "chill" },
    ],
    spawn: { x: 480, y: 500 },
    exit: { x: 455, y: 516, w: 50, h: 32 },
  };
  const ROOM_NAMES = { lounge: "Eingang", kitchen: "Küche", living: "Wohnzimmer", gaming: "Gaming-Zimmer", chill: "Chill-Ecke" };
  const PLAYER_R = 14;
  // Solide Möbel (AABB). Alles hier blockiert; Deko ohne Eintrag ist begehbar.
  const WORLD_FURNITURE_SOLIDS = [
    { x: 60, y: 60, w: 160, h: 26 },
    { x: 252, y: 58, w: 40, h: 72 },
    { x: 60, y: 150, w: 64, h: 56 },
    { x: 174, y: 184, w: 52, h: 52 },
    { x: 400, y: 120, w: 130, h: 44 },
    { x: 425, y: 188, w: 80, h: 28 },
    { x: 430, y: 58, w: 70, h: 18 },
    { x: 566, y: 60, w: 40, h: 100 },
    { x: 660, y: 90, w: 70, h: 26 },
    { x: 745, y: 90, w: 70, h: 26 },
    { x: 830, y: 90, w: 70, h: 26 },
    { x: 685, y: 130, w: 20, h: 20 },
    { x: 770, y: 130, w: 20, h: 20 },
    { x: 855, y: 130, w: 20, h: 20 },
    { x: 90, y: 470, w: 32, h: 32 },
    { x: 160, y: 490, w: 32, h: 32 },
    { x: 120, y: 440, w: 44, h: 24 },
    { x: 700, y: 460, w: 30, h: 56 },
    { x: 860, y: 480, w: 24, h: 24 },
  ];
  const WORLD_SOLIDS = WORLD.walls.concat(WORLD_FURNITURE_SOLIDS);
  // Echte Raum-Geometrie (keine Nähe-Heuristik): spezifische Räume zuerst.
  function worldRoomAt(x, y) {
    if (x >= 36 && x <= 324 && y >= 36 && y <= 312) return "kitchen";
    if (x >= 336 && x <= 624 && y >= 36 && y <= 312) return "living";
    if (x >= 636 && x <= 924 && y >= 36 && y <= 312) return "gaming";
    if (x >= 36 && x <= 288 && y >= 400 && y <= 564) return "chill";
    return "lounge";
  }
  // Kreis-gegen-AABB. Achsengetrennt aufgerufen -> Gleiten an Wänden statt Festhängen.
  function worldHitsSolid(x, y) {
    const r = PLAYER_R;
    const solids = WORLD_SOLIDS.concat(worldDynamicSolids);
    for (const s of solids) {
      const cx = Math.max(s.x, Math.min(x, s.x + s.w));
      const cy = Math.max(s.y, Math.min(y, s.y + s.h));
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  const worldPlayer = { x: WORLD.spawn.x, y: WORLD.spawn.y, sitting: false, seatId: null, room: "lounge" };
  const worldRemotes = new Map();
  let worldActive = false, worldRAF = 0, worldCtx = null, worldStarted = false, worldSelfBanned = false, worldResizeBound = false;
  let lastWorldEmit = 0, lastEmittedRoom = null, lastEmittedSeat = undefined;
  let worldFlashMsg = "", worldFlashUntil = 0;

  function worldNote(msg) { worldFlashMsg = msg; worldFlashUntil = Date.now() + 4000; }
  function worldMyProfile() {
    const me = activeUser();
    const entry = lastOnline.find((e) => e && e.username === me);
    return { avatar: entry?.avatar || "😀", color: entry?.color || "#79dce8" };
  }
  // Senden bei Bewegung, sofort bei Raum-/Sitz-Wechsel (Voice reagiert schnell).
  function worldEmitMove(force = false) {
    const now = Date.now();
    const roomChanged = worldPlayer.room !== lastEmittedRoom;
    const seatChanged = worldPlayer.seatId !== lastEmittedSeat;
    if (!force && !roomChanged && !seatChanged && now - lastWorldEmit < 250) return;
    lastWorldEmit = now;
    lastEmittedRoom = worldPlayer.room;
    lastEmittedSeat = worldPlayer.seatId;
    socket.emit("worldMove", {
      x: Math.round(worldPlayer.x),
      y: Math.round(worldPlayer.y),
      room: worldPlayer.room,
      seat: worldPlayer.seatId,
    });
  }
  const worldDynamicSolids = []; // z.B. Café-Theke nach Completion (wächst mit der Stadt)
  // ===== Interactables: datengetrieben {id, Typ, Position, Radius, Raum} =====
  // Neue Objekte: Eintrag hier + ggf. Deko in worldBuildStatic + ggf. Solid.
  // Interaktionstypen (erweiterbar): voice, sit, job, dropoff, shop, city, hub.
  // Später möglich: open, close, use, sleep, work, buy, sell, read, toggle,
  // enter, exit, build, repair, collect, deposit, withdraw.
  const INTERACTABLES = [
    { id: "exit_door", type: "voice", x: 480, y: 532, range: 48, room: "lounge" },
    { id: "job_terminal", type: "job", x: 620, y: 505, range: 55, room: "lounge" },
    { id: "market", type: "shop", shopId: "market", x: 350, y: 505, range: 60, room: "lounge" },
    { id: "fridge", type: "shop", shopId: "fridge", x: 272, y: 150, range: 55, room: "kitchen" },
    { id: "city_board", type: "city", x: 580, y: 548, range: 60, room: "lounge" },
    { id: "drop_kitchen", type: "dropoff", spotId: "drop_kitchen", x: 140, y: 112, range: 55, room: "kitchen" },
    { id: "drop_living", type: "dropoff", spotId: "drop_living", x: 620, y: 130, range: 55, room: "living" },
    { id: "drop_gaming", type: "dropoff", spotId: "drop_gaming", x: 890, y: 150, range: 60, room: "gaming" },
    { id: "drop_chill", type: "dropoff", spotId: "drop_chill", x: 150, y: 420, range: 55, room: "chill" },
    { id: "comp_g1", type: "hub", x: 695, y: 140, range: 48, room: "gaming" },
    { id: "comp_g2", type: "hub", x: 780, y: 140, range: 48, room: "gaming" },
    { id: "comp_g3", type: "hub", x: 865, y: 140, range: 48, room: "gaming" },
  ];
  for (const s of WORLD.seats) {
    INTERACTABLES.push({ id: "chair_" + s.id, type: "sit", seatId: s.id, x: s.x, y: s.y, range: 40, room: s.room });
  }
  const dynamicInteractables = []; // z.B. Café-Theke nach Gebäude-Completion
  function allInteractables() { return INTERACTABLES.concat(dynamicInteractables); }
  let currentInteractable = null;
  function nearestInteractable() {
    if (worldPlayer.sitting && worldPlayer.seatId) {
      const own = allInteractables().find((it) => it.type === "sit" && it.seatId === worldPlayer.seatId);
      if (own) return own;
    }
    let best = null, bd = Infinity;
    for (const it of allInteractables()) {
      if (it.enabled === false) continue;
      if (it.type === "dropoff" && !(activeJob && activeJob.targetId === it.spotId)) continue;
      const dx = worldPlayer.x - it.x, dy = worldPlayer.y - it.y;
      const d = Math.hypot(dx, dy);
      if (d <= it.range && d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function interactLabel(it) {
    if (!it) return "";
    switch (it.type) {
      case "voice": return roomId ? "[E] Voice verlassen" : "[E] Voice beitreten";
      case "sit": return worldPlayer.sitting ? "[E] Aufstehen" : "[E] Hinsetzen";
      case "job": return activeJob ? "[E] Auftrag ansehen" : "[E] Job annehmen";
      case "dropoff": return "[E] Lieferung abgeben";
      case "shop": return "[E] Shop öffnen";
      case "city": return "[E] Rathaus öffnen";
      case "hub": return "[E] Computer benutzen";
      default: return "[E] Interagieren";
    }
  }
  function updateInteractPrompt() {
    const el = $("interactPrompt");
    const it = worldActive ? nearestInteractable() : null;
    currentInteractable = it;
    if (!el) return;
    const label = it ? interactLabel(it) : "";
    if (el.textContent !== label) el.textContent = label;
    el.classList.toggle("hidden", !label);
  }
  function standUp(silent) {
    if (!worldPlayer.sitting && !worldPlayer.seatId) return;
    worldPlayer.sitting = false;
    worldPlayer.seatId = null;
    worldEmitMove(true);
    if (!silent) worldNote("Aufgestanden.");
  }
  function doInteract() {
    const it = currentInteractable;
    if (!it || !worldActive) return;
    switch (it.type) {
      case "voice":
        if (roomId) leaveVoice();
        else joinVoice();
        break;
      case "sit": {
        if (worldPlayer.sitting) { standUp(); break; }
        const seat = WORLD.seats.find((s) => s.id === it.seatId);
        if (!seat) break;
        if (!worldSeatFree(seat)) { worldNote("Besetzt."); break; }
        worldPlayer.sitting = true;
        worldPlayer.seatId = seat.id;
        worldEmitMove(true);
        break;
      }
      case "job":
        socket.emit("jobState");
        openGameModal("jobModal");
        break;
      case "dropoff":
        socket.emit("jobComplete");
        break;
      case "shop":
        socket.emit("shopOpen", { shopId: it.shopId });
        break;
      case "city":
        socket.emit("cityInfo");
        openGameModal("cityModal");
        break;
      case "hub":
        openGameModal("computerModal");
        renderComputer();
        break;
      default: break;
    }
  }
  function openGameModal(id) {
    const m = $(id);
    if (m) m.classList.add("active");
  }
  function closeGameModals() {
    document.querySelectorAll(".game-modal.active").forEach((m) => m.classList.remove("active"));
  }
  // NPC-Architektur (Platzhalter für später: id, Name, Position, Rolle, Interaktionen)
  const NPCS = [];
  // Sound-Architektur (Platzhalter; Voice-Audio bleibt getrennt)
  function playSound(name) { void name; }
  // ===== Input: WASD + Pfeile (kein Click-to-Move). Tippen blockiert nie. =====
  const worldKeys = { up: false, down: false, left: false, right: false };
  const WORLD_KEYMAP = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
  function worldTypingTarget(t) {
    return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable));
  }
  function worldClearKeys() { worldKeys.up = worldKeys.down = worldKeys.left = worldKeys.right = false; }
  document.addEventListener("keydown", (event) => {
    const k = WORLD_KEYMAP[event.code];
    if (!k || event.ctrlKey || event.metaKey || event.altKey) return;
    if (worldTypingTarget(event.target) || !worldActive || !activeUser()) return;
    worldKeys[k] = true;
    if (event.code.indexOf("Arrow") === 0) event.preventDefault();
  });
  document.addEventListener("keyup", (event) => {
    const k = WORLD_KEYMAP[event.code];
    if (k) worldKeys[k] = false;
  });
  window.addEventListener("blur", worldClearKeys);
  // Achsengetrennt bewegen: blockierte Achse entfällt, Gleiten bleibt möglich.
  function worldTryMove(mx, my) {
    if (mx !== 0 && !worldHitsSolid(worldPlayer.x + mx, worldPlayer.y, PLAYER_R)) worldPlayer.x += mx;
    if (my !== 0 && !worldHitsSolid(worldPlayer.x, worldPlayer.y + my, PLAYER_R)) worldPlayer.y += my;
    worldPlayer.x = Math.max(PLAYER_R, Math.min(WORLD.w - PLAYER_R, worldPlayer.x));
    worldPlayer.y = Math.max(PLAYER_R, Math.min(WORLD.h - PLAYER_R, worldPlayer.y));
  }
  function worldApplyInput(dt) {
    let dx = (worldKeys.right ? 1 : 0) - (worldKeys.left ? 1 : 0);
    let dy = (worldKeys.down ? 1 : 0) - (worldKeys.up ? 1 : 0);
    if (!dx && !dy) return false;
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len; // diagonal normalisiert: keine Turbo-Diagonalen
    worldPlayer.sitting = false;
    worldPlayer.seatId = null;
    worldJoinFresh = false; // selbst gelaufen -> kein Server-Spawn mehr
    const sp = 175 * dt;
    worldTryMove(dx * sp, dy * sp);
    return true;
  }
  function worldSeatFree(seat) {
    return !Array.from(worldRemotes.values()).some(
      (m) => m.seat === seat.id || Math.hypot(m.x - seat.x, m.y - seat.y) < 30,
    );
  }
  // Spieler: Avatar-Kreis, Name DARÜBER, Self-Glow, Speaking-Ring. Kein Emoji-Deko.
  function worldDrawCharacter(ctx, f) {
    const { x, y } = f;
    const ring = f.banned ? "#ff2d55" : f.color || "#79dce8";
    if (f.speaking && !WORLD_REDUCED) {
      const pr = 26 + 3 * Math.sin(performance.now() / 220);
      ctx.save();
      ctx.strokeStyle = "rgba(121,220,232,.8)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(121,220,232,.3)";
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(x, y, pr + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (f.self && !WORLD_REDUCED) {
      ctx.save();
      ctx.strokeStyle = "rgba(121,220,232,.35)";
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.fillStyle = "#101c36";
    ctx.fill();
    ctx.lineWidth = f.self ? 3.5 : 2.5;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.font = "23px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(f.avatar || "?", x, y + 1);
    ctx.font = "600 12px 'Hanken Grotesk', sans-serif";
    const tw = ctx.measureText(f.name).width;
    const bw = tw + 14;
    const ny = y - 40;
    ctx.fillStyle = "rgba(4,16,31,.85)";
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - bw / 2, ny - 9, bw, 18, 9); ctx.fill(); }
    else ctx.fillRect(x - bw / 2, ny - 9, bw, 18);
    ctx.fillStyle = f.banned ? "#ff8d98" : f.color || "#fff";
    ctx.fillText(f.name, x, ny);
    ctx.restore();
  }
  const WORLD_REDUCED = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function wRR(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  let worldStatic = null;
  const WORLD_SS = 2; // statische Ebene in doppelter Weltauflösung (1920x1200)
  // HiDPI-scharf: Backing-Store folgt der CSS-Größe des Wraps × Display-Dichte.
  function worldFit() {
    const canvas = $("worldCanvas");
    const wrap = $("worldWrap");
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = (wrap && wrap.clientWidth) || canvas.clientWidth || 800;
    const cssH = (wrap && wrap.clientHeight) || canvas.clientHeight || 480;
    const w = Math.max(320, Math.round(cssW * dpr));
    const h = Math.max(200, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  // Kamera: folgt dem Spieler weich, bleibt in der Welt. Zoom nach Viewport.
  const worldCam = { x: 480, y: 300, zoom: 1 };
  function worldViewSize() {
    const canvas = $("worldCanvas");
    return { w: (canvas && canvas.clientWidth) || 800, h: (canvas && canvas.clientHeight) || 480 };
  }
  function worldUpdateCamera(dt) {
    const view = worldViewSize();
    const zoom = Math.max(0.55, Math.min(1.25, Math.min(view.w / 720, view.h / 460)));
    worldCam.zoom = zoom;
    const k = Math.min(1, dt * 5);
    worldCam.x += (worldPlayer.x - worldCam.x) * k;
    worldCam.y += (worldPlayer.y - worldCam.y) * k;
    const vw = view.w / zoom, vh = view.h / zoom;
    worldCam.x = vw >= WORLD.w ? WORLD.w / 2 : Math.max(vw / 2 - 30, Math.min(WORLD.w - vw / 2 + 30, worldCam.x));
    worldCam.y = vh >= WORLD.h ? WORLD.h / 2 : Math.max(vh / 2 - 30, Math.min(WORLD.h - vh / 2 + 30, worldCam.y));
  }
  function worldToScreen(x, y) {
    const view = worldViewSize();
    return {
      x: (x - worldCam.x) * worldCam.zoom + view.w / 2,
      y: (y - worldCam.y) * worldCam.zoom + view.h / 2,
    };
  }
  // Statische Ebene (einmal rendern, dann nur blitten) für Detailreichtum ohne Kosten
  // ---- Statische Ebene: Boden, Räume, Wände, Türen, Deko (einmalig, 1920x1200) ----
  // Keine Emoji-Deko: reine Shapes, konsistente Perspektive, ruhige Farben.
  function worldBuildStatic() {
    const off = document.createElement("canvas");
    off.width = WORLD.w * WORLD_SS;
    off.height = WORLD.h * WORLD_SS;
    const ctx = off.getContext("2d");
    const W = WORLD;
    ctx.setTransform(WORLD_SS, 0, 0, WORLD_SS, 0, 0);
    // Boden mit Verlauf
    const floorGrad = ctx.createLinearGradient(0, 0, 0, W.h);
    floorGrad.addColorStop(0, "#41301f");
    floorGrad.addColorStop(1, "#33261a");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, W.w, W.h);
    // Raumtönungen: Lounge zuerst, speziellere Räume darüber
    for (const r of W.rooms) {
      if (r.id === "lounge") { ctx.fillStyle = r.floor; ctx.fillRect(r.x, r.y, r.w, r.h); }
    }
    for (const r of W.rooms) {
      if (r.id === "lounge") continue;
      ctx.fillStyle = r.floor;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // Dielen mit versetzten Fugen
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 1;
    let plankRow = 0;
    for (let py = 52; py < W.h; py += 32, plankRow++) {
      ctx.beginPath(); ctx.moveTo(24, py); ctx.lineTo(936, py); ctx.stroke();
      const offx = (plankRow % 2) * 220;
      for (let jx = 24 + offx; jx < 936; jx += 440) {
        ctx.beginPath(); ctx.moveTo(jx, py); ctx.lineTo(jx, Math.min(py + 32, W.h)); ctx.stroke();
      }
    }
    // Teppiche mit Bordüre
    const rug = (x, y, w, h, c, edge) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, w - 9, h - 7, 0, 0, Math.PI * 2); ctx.stroke();
    };
    rug(180, 258, 92, 40, "rgba(255,150,120,.12)", "rgba(255,150,120,.25)");
    rug(480, 240, 120, 58, "rgba(200,90,90,.14)", "rgba(200,90,90,.3)");
    rug(162, 505, 105, 42, "rgba(255,190,120,.12)", "rgba(255,190,120,.28)");
    ctx.fillStyle = "rgba(160,60,60,.22)"; wRR(ctx, 360, 354, 240, 16, 8); ctx.fill();
    ctx.fillStyle = "rgba(90,61,42,.8)"; wRR(ctx, 450, 500, 60, 18, 4); ctx.fill();
    // Wände: Verlauf, Kantenlicht, Fußleiste
    for (const wl of W.walls) {
      const wg = ctx.createLinearGradient(0, wl.y, 0, wl.y + wl.h);
      wg.addColorStop(0, "#243c6e");
      wg.addColorStop(1, "#16264a");
      ctx.fillStyle = wg;
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
      ctx.fillStyle = "rgba(255,190,120,.35)";
      ctx.fillRect(wl.x, wl.y, wl.w, 3);
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(wl.x, wl.y + wl.h - 3, wl.w, 3);
    }
    // Türen: Pfosten + Schwelle
    for (const d of W.doors) {
      ctx.fillStyle = "#4a3524";
      ctx.fillRect(d.x - 5, d.y - 6, 7, 32);
      ctx.fillRect(d.x + d.w - 2, d.y - 6, 7, 32);
      ctx.fillStyle = "rgba(255,190,120,.25)";
      ctx.fillRect(d.x - 5, d.y - 6, 7, 3);
      ctx.fillRect(d.x + d.w - 2, d.y - 6, 7, 3);
      ctx.fillStyle = "rgba(120,90,70,.55)";
      wRR(ctx, d.x + 6, d.y + 2, d.w - 12, 16, 4); ctx.fill();
    }
    // Raumbeschriftungen dezent auf dem Boden (Environment-Labels, kein Emoji)
    ctx.fillStyle = "rgba(255,235,210,.38)";
    ctx.font = "700 13px 'Hanken Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("K Ü C H E", 110, 272);
    ctx.fillText("W O H N E N", 480, 290);
    ctx.fillText("G A M I N G", 790, 282);
    ctx.fillText("C H I L L", 150, 552);
    ctx.fillText("E I N G A N G", 600, 505);
    ctx.fillText("F L U R", 480, 392);
    // Fenster mit Nachtblick (Shapes only)
    const winShape = (wx) => {
      ctx.fillStyle = "#0e2a5c"; ctx.fillRect(wx - 35, 22, 72, 40);
      ctx.fillStyle = "#f4f1de"; ctx.beginPath(); ctx.arc(wx + 15, 36, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(wx - 12, 48, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(wx - 2, 40, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(wx + 4, 52, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wx - 20, 60); ctx.lineTo(wx + 5, 28); ctx.stroke();
      ctx.strokeStyle = "#6b4a2c"; ctx.lineWidth = 4; ctx.strokeRect(wx - 35, 22, 72, 40);
      ctx.beginPath(); ctx.moveTo(wx + 1, 22); ctx.lineTo(wx + 1, 62); ctx.stroke();
      ctx.fillStyle = "#6e3030"; ctx.fillRect(wx - 47, 18, 12, 50); ctx.fillRect(wx + 35, 18, 12, 50);
    };
    winShape(150); winShape(480); winShape(810);
    // Bilder an Wänden (abstrakte Geometrie)
    const picture = (x, y, w, h, c1, c2) => {
      ctx.fillStyle = "#2c2117"; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 5, y + h - 6); ctx.lineTo(x + w / 2, y + 6); ctx.lineTo(x + w - 5, y + h - 8); ctx.stroke();
    };
    picture(300, 284, 60, 26, "#1d4a5a", "#0e2a3a");
    picture(560, 284, 60, 26, "#3a1d2a", "#2a0e1a");
    picture(287, 450, 15, 38, "#2a3a1d", "#1a2a0e");
    // Wanduhr (Zifferblatt statisch, Zeiger dynamisch)
    ctx.fillStyle = "#f4ead2";
    ctx.beginPath(); ctx.arc(30, 200, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4a3524"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(30, 200, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#4a3524";
    for (let hh = 0; hh < 12; hh++) {
      const a = (hh / 12) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(30 + 7 * Math.cos(a), 200 + 7 * Math.sin(a), 1, 0, Math.PI * 2); ctx.fill();
    }
    // Ausgangstür + Schild (Puls dynamisch)
    ctx.fillStyle = "#4a2f18"; ctx.fillRect(446, 558, 68, 26);
    ctx.fillStyle = "#7a5636"; wRR(ctx, 452, 556, 56, 26, 4); ctx.fill();
    ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(500, 569, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd98c"; ctx.font = "700 11px 'Hanken Grotesk', sans-serif"; ctx.textAlign = "center";
    ctx.fillText("AUSGANG · VOICE", 480, 552);
    // Marktstand (Mini-Markt): Theke + Markise + Kisten
    ctx.fillStyle = "#6b4a2c"; ctx.fillRect(330, 462, 40, 36);
    ctx.fillStyle = "#a97e4e"; ctx.fillRect(330, 458, 40, 8);
    for (let sx = 0; sx < 4; sx++) {
      ctx.fillStyle = sx % 2 ? "#c94f4f" : "#f4ead2";
      ctx.beginPath();
      ctx.moveTo(326 + sx * 11, 440); ctx.lineTo(337 + sx * 11, 440); ctx.lineTo(335 + sx * 11, 458); ctx.lineTo(324 + sx * 11, 458);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#4a3524"; ctx.fillRect(326, 440, 4, 22); ctx.fillRect(366, 440, 4, 22);
    ctx.fillStyle = "#7a5636"; ctx.fillRect(376, 470, 16, 14); ctx.fillRect(376, 486, 16, 14);
    ctx.fillStyle = "#5a3d1e"; ctx.fillRect(300, 470, 16, 14);
    // Job-Terminal: Säule + leuchtender Screen
    ctx.fillStyle = "#2a2f3a"; wRR(ctx, 606, 482, 28, 36, 4); ctx.fill();
    ctx.fillStyle = "#79dce8"; ctx.fillRect(611, 488, 18, 14);
    ctx.fillStyle = "#04101f"; ctx.font = "700 9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("JOB", 620, 499);
    // Stadt-Board (Rathaus): Tafel + Pins
    ctx.fillStyle = "#4a3524"; ctx.fillRect(566, 526, 28, 30);
    ctx.fillStyle = "#f4ead2"; ctx.fillRect(570, 530, 20, 22);
    ctx.fillStyle = "#c94f4f"; ctx.beginPath(); ctx.arc(576, 536, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3f6ea5"; ctx.beginPath(); ctx.arc(583, 543, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(578, 547, 2, 0, Math.PI * 2); ctx.fill();
    // Café-Grundstück: Baustelle oder fertiges Gebäude (aus City-State)
    if (completedBuildings.has("cafe")) {
      ctx.fillStyle = "rgba(0,0,0,.3)"; wRR(ctx, 758, 468, 114, 32, 6); ctx.fill();
      ctx.fillStyle = "#6b4a2c"; wRR(ctx, 760, 470, 110, 28, 6); ctx.fill();
      ctx.fillStyle = "#a97e4e"; wRR(ctx, 760, 470, 110, 8, 4); ctx.fill();
      ctx.fillStyle = "#3f6ea5"; ctx.fillRect(800, 478, 24, 12);
      ctx.fillStyle = "#e8e0d0"; ctx.fillRect(830, 478, 8, 6);
      for (const [tx, ty] of [[780, 520], [850, 520]]) {
        ctx.fillStyle = "#7a5636"; ctx.beginPath(); ctx.ellipse(tx, ty, 16, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#a97e4e"; ctx.beginPath(); ctx.ellipse(tx, ty - 2, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      const cg = ctx.createRadialGradient(815, 452, 4, 815, 452, 40);
      cg.addColorStop(0, "rgba(255,210,140,.5)"); cg.addColorStop(1, "rgba(255,210,140,0)");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(815, 452, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd98c"; ctx.font = "700 12px 'Hanken Grotesk', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("CAFÉ", 815, 456);
    } else {
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = "rgba(255,209,102,.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(740, 440, 170, 110);
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffd98c"; ctx.font = "700 11px 'Hanken Grotesk', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("CAFÉ-BAUSTELLE", 825, 500);
    }
    // Vignette
    const vg = ctx.createRadialGradient(480, 300, 200, 480, 300, 640);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.38)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W.w, W.h);
    return off;
  }
  // Möbel als Daten (y = Sortierkante): konsistente Shapes, keine Emoji-Deko.
  const WORLD_FURNITURE = [
    { y: 64, draw: (c) => {
      c.fillStyle = "#7a5636"; c.fillRect(95, 40, 36, 24); c.fillRect(140, 40, 36, 24);
      c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(128, 46, 3, 10); c.fillRect(173, 46, 3, 10);
    } },
    { y: 96, draw: (c) => {
      c.fillStyle = "#6b4a2c"; c.fillRect(60, 60, 160, 26);
      c.fillStyle = "#a97e4e"; c.fillRect(60, 54, 180, 10);
      c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 1;
      for (let dx = 115; dx < 250; dx += 45) { c.beginPath(); c.moveTo(dx, 66); c.lineTo(dx, 86); c.stroke(); }
      c.fillStyle = "#33506e"; c.fillRect(200, 64, 34, 18);
      c.fillStyle = "#9fc2dd"; c.fillRect(214, 58, 4, 12);
    } },
    { y: 155, draw: (c) => {
      c.fillStyle = "#cfd6e4"; wRR(c, 252, 58, 40, 97, 8); c.fill();
      c.strokeStyle = "#8b95a8"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(252, 95); c.lineTo(292, 95); c.stroke();
      c.fillStyle = "#8b95a8"; c.fillRect(262, 66, 4, 20); c.fillRect(262, 104, 4, 26);
      c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(260, 148); c.lineTo(282, 64); c.stroke();
    } },
    { y: 212, draw: (c) => {
      c.fillStyle = "#2a2f3a"; wRR(c, 60, 150, 64, 62, 6); c.fill();
      [[82, 164], [106, 164], [82, 190], [106, 190]].forEach(([bx, by]) => {
        c.fillStyle = "#101318"; c.beginPath(); c.arc(bx, by, 9, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "#3a4152"; c.lineWidth = 2; c.beginPath(); c.arc(bx, by, 9, 0, Math.PI * 2); c.stroke();
      });
      c.fillStyle = "#0c0e14"; c.fillRect(68, 196, 48, 10);
      c.fillStyle = "#c96a6a"; c.fillRect(68, 152, 48, 3);
    } },
    { y: 236, draw: (c) => {
      c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(200, 214, 30, 24, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#7a5636"; c.beginPath(); c.ellipse(200, 210, 30, 24, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#a97e4e"; c.beginPath(); c.ellipse(200, 208, 24, 19, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3f6ea5"; c.beginPath(); c.ellipse(200, 210, 8, 6, 0, 0, Math.PI * 2); c.fill();
    } },
    { y: 244, draw: (c) => {
      [[140, 244], [240, 244]].forEach(([sx, sy]) => {
        c.fillStyle = "#4a3524"; c.beginPath(); c.arc(sx, sy, 12, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#c98f4e"; c.beginPath(); c.arc(sx, sy - 2, 8, 0, Math.PI * 2); c.fill();
      });
    } },
    { y: 76, draw: (c) => {
      c.fillStyle = "#4a3524"; c.fillRect(430, 58, 70, 18);
      c.fillStyle = "#101828"; c.fillRect(436, 32, 58, 26);
      c.strokeStyle = "rgba(121,220,232,.8)"; c.lineWidth = 2; c.strokeRect(436, 32, 58, 26);
    } },
    { y: 160, draw: (c) => {
      c.fillStyle = "#4a3524"; c.fillRect(566, 60, 40, 100);
      const cols = ["#c96a6a", "#6ac98f", "#6a8fc9", "#c9b86a", "#a86ac9", "#6ac9c2"];
      cols.forEach((cc, i) => { c.fillStyle = cc; c.fillRect(571 + (i % 3) * 12, 66 + Math.floor(i / 3) * 30, 9, 26); });
      c.fillStyle = "rgba(0,0,0,.3)";
      c.fillRect(566, 94, 40, 3); c.fillRect(566, 126, 40, 3);
    } },
    { y: 164, draw: (c) => {
      c.fillStyle = "rgba(0,0,0,.3)"; wRR(c, 398, 122, 134, 46, 14); c.fill();
      c.fillStyle = "#46538a"; wRR(c, 400, 120, 130, 44, 14); c.fill();
      ["#5a6aa8", "#6778bd", "#5a6aa8"].forEach((cc, i) => { c.fillStyle = cc; wRR(c, 406 + i * 41, 126, 37, 26, 7); c.fill(); });
      c.fillStyle = "#38447a"; c.fillRect(392, 128, 12, 36); c.fillRect(526, 128, 12, 36);
      c.fillStyle = "#a83a4a"; wRR(c, 500, 124, 22, 30, 6); c.fill();
    } },
    { y: 200, draw: (c) => {
      c.strokeStyle = "#2c2117"; c.lineWidth = 4;
      c.beginPath(); c.moveTo(604, 200); c.lineTo(604, 142); c.stroke();
      const g = c.createRadialGradient(604, 130, 4, 604, 130, 40);
      g.addColorStop(0, "rgba(255,210,140,.5)"); g.addColorStop(1, "rgba(255,210,140,0)");
      c.fillStyle = g; c.beginPath(); c.arc(604, 130, 40, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3a2c1c"; c.beginPath(); c.arc(604, 130, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#ffd98c"; c.beginPath(); c.arc(604, 130, 8, 0, Math.PI * 2); c.fill();
    } },
    { y: 216, draw: (c) => {
      c.fillStyle = "#6b4a2c"; wRR(c, 425, 188, 80, 28, 6); c.fill();
      c.fillStyle = "#8a6238"; wRR(c, 425, 188, 80, 8, 4); c.fill();
      c.fillStyle = "#3f6ea5"; c.beginPath(); c.arc(465, 198, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e8e0d0"; c.fillRect(486, 194, 5, 7);
    } },
  ];
  [695, 780, 865].forEach((cx) => {
    WORLD_FURNITURE.push(
      { y: 116, draw: (c) => {
        c.fillStyle = "#3a2c1c"; c.fillRect(cx - 35, 90, 70, 26);
        c.fillStyle = "#54402a"; c.fillRect(cx - 35, 90, 70, 5);
        c.fillStyle = "#20242e"; c.fillRect(cx - 20, 98, 40, 6);
        c.fillStyle = "#79dce8"; c.fillRect(cx - 22, 60, 44, 28);
        c.fillStyle = "#04101f"; c.fillRect(cx - 18, 64, 36, 20);
        c.strokeStyle = "rgba(121,220,232,.6)"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(cx - 35, 117); c.lineTo(cx + 35, 117); c.stroke();
        c.fillStyle = "#20242e"; c.fillRect(cx - 3, 88, 6, 6);
      } },
      { y: 150, draw: (c) => {
        c.fillStyle = "#232a3d"; c.beginPath(); c.arc(cx, 140, 11, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#3b4763"; wRR(c, cx - 11, 118, 22, 12, 4); c.fill();
      } },
    );
  });
  WORLD_FURNITURE.push(
    { y: 464, draw: (c) => {
      c.fillStyle = "#6b4a2c"; c.beginPath(); c.ellipse(142, 452, 26, 13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#8a6238"; c.beginPath(); c.ellipse(142, 450, 22, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3f6ea5"; c.fillRect(132, 442, 12, 6);
      c.fillStyle = "#c96a6a"; c.fillRect(146, 444, 10, 5);
    } },
    { y: 502, draw: (c) => {
      c.fillStyle = "#c9713a"; c.beginPath(); c.arc(106, 486, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e09a5a"; c.beginPath(); c.arc(100, 480, 8, 0, Math.PI * 2); c.fill();
    } },
    { y: 522, draw: (c) => {
      c.fillStyle = "#7a5ac9"; c.beginPath(); c.arc(176, 506, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#9a7de0"; c.beginPath(); c.arc(170, 500, 8, 0, Math.PI * 2); c.fill();
    } },
    { y: 504, draw: (c) => {
      c.fillStyle = "#5a3d1e"; wRR(c, 862, 484, 20, 20, 3); c.fill();
      c.fillStyle = "#2f7a4d"; c.beginPath(); c.arc(872, 476, 12, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3f9a5d";
      c.beginPath(); c.arc(866, 470, 6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(878, 472, 5, 0, Math.PI * 2); c.fill();
    } },
    { y: 516, draw: (c) => {
      c.strokeStyle = "#4a3524"; c.lineWidth = 4;
      c.beginPath(); c.moveTo(715, 516); c.lineTo(715, 462); c.stroke();
      c.fillStyle = "#c96a6a"; wRR(c, 706, 470, 18, 26, 5); c.fill();
      c.fillStyle = "#6a8fc9"; c.beginPath(); c.arc(724, 466, 7, 0, Math.PI * 2); c.fill();
    } },
    { y: 544, draw: (c) => {
      c.fillStyle = "#5a3d1e"; wRR(c, 82, 524, 20, 20, 3); c.fill();
      c.fillStyle = "#2f7a4d"; c.beginPath(); c.arc(92, 516, 12, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3f9a5d"; c.beginPath(); c.arc(86, 510, 6, 0, Math.PI * 2); c.fill();
    } },
  );
  const worldSpeaking = new Map();
  function worldDraw() {
    const ctx = worldCtx;
    const canvas = $("worldCanvas");
    if (!ctx || !canvas) return;
    const view = worldViewSize();
    if (!worldStatic) worldStatic = worldBuildStatic();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = canvas.width, bh = canvas.height;
    const zoom = worldCam.zoom;
    const vw = view.w / zoom, vh = view.h / zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#060b16";
    ctx.fillRect(0, 0, bw, bh);
    const SS = WORLD_SS;
    ctx.drawImage(worldStatic, (worldCam.x - vw / 2) * SS, (worldCam.y - vh / 2) * SS, vw * SS, vh * SS, 0, 0, bw, bh);
    const s = dpr * zoom;
    ctx.setTransform(s, 0, 0, s, dpr * (view.w / 2 - worldCam.x * zoom), dpr * (view.h / 2 - worldCam.y * zoom));
    // Dynamik: Tür-Puls, Uhrzeiger, TV-Flimmern
    const pulse = WORLD_REDUCED ? 30 : 26 + 5 * Math.sin(performance.now() / 450);
    ctx.strokeStyle = "rgba(255,209,102,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(480, 534, pulse + 12, pulse * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    const clockNow = new Date();
    const hourA = (((clockNow.getHours() % 12) + clockNow.getMinutes() / 60) / 12) * Math.PI * 2;
    const minA = (clockNow.getMinutes() / 60) * Math.PI * 2;
    ctx.strokeStyle = "#4a3524"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, 200);
    ctx.lineTo(30 + 4 * Math.cos(hourA - Math.PI / 2), 200 + 4 * Math.sin(hourA - Math.PI / 2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, 200);
    ctx.lineTo(30 + 6 * Math.cos(minA - Math.PI / 2), 200 + 6 * Math.sin(minA - Math.PI / 2)); ctx.stroke();
    if (!WORLD_REDUCED) {
      ctx.fillStyle = "rgba(160,220,255,.5)";
      for (let st = 0; st < 8; st++) ctx.fillRect(440 + Math.random() * 50, 34 + Math.random() * 20, 2, 2);
    }
    // Y-Sort: Möbel + Spieler nach Unterkante
    const items = [];
    for (const fn of WORLD_FURNITURE) items.push({ y: fn.y, draw: () => fn.draw(ctx) });
    drawJobMarker(ctx);
    if (currentInteractable) {
      const it = currentInteractable;
      const bob = WORLD_REDUCED ? 0 : 3 * Math.sin(performance.now() / 300);
      items.push({
        y: it.y - 30,
        draw: () => {
          ctx.save();
          ctx.translate(it.x, it.y - 30 + bob);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = "rgba(121,220,232,.95)";
          ctx.fillRect(-5, -5, 10, 10);
          ctx.restore();
        },
      });
    }
    const me = worldMyProfile();
    const selfName = activeUser() || "Du";
    if (worldPresent) {
      items.push({ y: worldPlayer.y, draw: () => worldDrawCharacter(ctx, { x: worldPlayer.x, y: worldPlayer.y, avatar: me.avatar, name: selfName, color: me.color, banned: worldSelfBanned, self: true, sitting: worldPlayer.sitting, speaking: worldSpeaking.get("local") === true }) });
    }
    worldRemotes.forEach((m, id) => items.push({ y: m.y, draw: () => worldDrawCharacter(ctx, { x: m.x, y: m.y, avatar: m.avatar, name: m.username, color: m.color, banned: Boolean(m.banned || m.tempBanned), speaking: worldSpeaking.get(id) === true, sitting: Boolean(m.seat) }) }));
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function worldLoop(ts) {
    if (!worldActive) return;
    const dt = Math.min(0.05, (ts - (worldLoop._t || ts)) / 1000 || 0);
    worldLoop._t = ts;
    const moving = worldApplyInput(dt);
    if (moving) {
      const room = worldRoomAt(worldPlayer.x, worldPlayer.y);
      if (room !== worldPlayer.room) {
        worldPlayer.room = room;
        worldVoiceUpdate();
      }
      worldEmitMove(false);
    }
    updateInteractPrompt();
    worldRemotes.forEach((m) => {
      if (m.tx === undefined) { m.tx = m.x; m.ty = m.y; }
      m.x += (m.tx - m.x) * 0.15;
      m.y += (m.ty - m.y) * 0.15;
    });
    worldLoop._f = (worldLoop._f || 0) + 1;
    if (worldLoop._f % 120 === 0) worldVoiceUpdate();
    worldUpdateCamera(dt);
    worldDraw();
    worldUpdateStatus();
    worldBubblesFrame();
    worldRAF = requestAnimationFrame(worldLoop);
  }
  function worldStart() {
    if (worldActive) return;
    if (!activeUser()) { setView("chat"); return; }
    worldActive = true;
    const canvas = $("worldCanvas");
    if (canvas) {
      worldFit();
      if (!worldResizeBound) {
        worldResizeBound = true;
        window.addEventListener("resize", () => { if (worldActive) { worldFit(); worldStatic = null; } });
      }
    }
    if (canvas && !worldCtx) {
      worldCtx = canvas.getContext("2d");
    }
    if (!worldStarted) {
      worldPlayer.x = WORLD.spawn.x;
      worldPlayer.y = WORLD.spawn.y;
      worldPlayer.room = worldRoomAt(worldPlayer.x, worldPlayer.y);
      worldStarted = true;
    }
    worldClearKeys();
    worldCam.x = worldPlayer.x;
    worldCam.y = worldPlayer.y;
    worldJoinFresh = true;
    if (roomId) {
      socket.emit("worldJoin");
    } else {
      worldNote("Tritt dem Voice bei (V), um in der Welt zu erscheinen.");
    }
    socket.emit("cityInfo");
    socket.emit("jobState");
    socket.emit("getEconomy");
    worldEmitMove(true);
    worldLoop._t = 0;
    worldRAF = requestAnimationFrame(worldLoop);
  }
  function worldStop() {
    if (!worldActive) return;
    worldActive = false;
    cancelAnimationFrame(worldRAF);
    worldClearKeys();
    worldClearBubbles();
    socket.emit("worldLeave");
    worldPeerCloseAll();
  }
  function worldRoomLabel(r) { return ROOM_NAMES[r] || r; }
  function worldUpdateStatus() {
    const el = $("worldStatus");
    if (!el) return;
    if (worldFlashMsg && Date.now() < worldFlashUntil) { el.textContent = worldFlashMsg; return; }
    const myRoom = worldPlayer.room;
    const here = Array.from(worldRemotes.values()).filter((m) => m.room === myRoom).map((m) => m.username);
    let s = `${worldRoomLabel(myRoom)} • ${here.length + (worldPresent ? 1 : 0)} hier`;
    if (!roomId) s += " • ⚪ Nicht im Voice – V drücken, um zu erscheinen";
    else if (!worldPresent) s += " • 🟡 Verbinde …";
    else s += " • 🟢 Im Voice • In der Welt";
    if (roomId) s += " • 🎙 du hörst Lobby-Voice (Welt stumm)";
    else if (!stream) s += " • 🎙 kein Mikro";
    else if (here.length) s += ` • 🎙 Welt: du hörst ${here.join(", ")}`;
    else s += " • 🎙 Welt: niemand hier";
    el.textContent = s;
  }
  // Welt-Präsenz leitet sich aus der Server-Liste ab (server-autoritativ).
  let worldPresent = false;
  let worldJoinFresh = false;
  socket.on("worldPresence", ({ users }) => {
    const seen = new Set();
    let sawSelf = false;
    (users || []).forEach((u) => {
      if (!u || !u.socketId) return;
      if (u.socketId === socket.id) {
        worldSelfBanned = Boolean(u.banned || u.tempBanned);
        worldPresent = true;
        sawSelf = true;
        return;
      }
      seen.add(u.socketId);
      const old = worldRemotes.get(u.socketId);
      if (old) Object.assign(old, { tx: u.x, ty: u.y, room: u.room, seat: u.seat, avatar: u.avatar, color: u.color, banned: u.banned, tempBanned: u.tempBanned, username: u.username });
      else worldRemotes.set(u.socketId, { username: u.username, x: u.x, y: u.y, tx: u.x, ty: u.y, room: u.room, seat: u.seat, avatar: u.avatar, color: u.color, banned: u.banned, tempBanned: u.tempBanned });
    });
    Array.from(worldRemotes.keys()).forEach((id) => { if (!seen.has(id)) { worldRemotes.delete(id); worldPeerClose(id); } });
    if (!sawSelf) worldPresent = false;
    worldVoiceUpdate();
  });

  socket.on("worldJoined", ({ x, y }) => {
    // Spawn vom Server (letzte Position oder Standard) nur übernehmen, wenn noch nicht gelaufen.
    if (!worldJoinFresh) return;
    worldJoinFresh = false;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      worldPlayer.x = Math.max(20, Math.min(940, x));
      worldPlayer.y = Math.max(20, Math.min(580, y));
      worldPlayer.room = worldRoomAt(worldPlayer.x, worldPlayer.y);
      worldCam.x = worldPlayer.x;
      worldCam.y = worldPlayer.y;
      worldEmitMove(true);
    }
  });
  socket.on("worldError", (message) => {
    if (message) worldNote(String(message));
  });

  // ===== Chat-Bubbles: HTML-Overlay, an Weltpositionen gekoppelt =====
  // Max 3 pro Spieler (älteste verschwindet zuerst), Lebensdauer 3-6s nach Länge.
  const worldBubbles = new Map(); // username -> { col, items: [{ el, timer }] }
  const BUBBLE_MAX = 3;
  function bubbleLifetime(text) { return Math.min(6000, 3200 + text.length * 30); }
  function bubbleAnchor(username) {
    if (username && username === activeUser()) {
      if (!worldPresent) return null;
      return { x: worldPlayer.x, y: worldPlayer.y };
    }
    for (const m of worldRemotes.values()) {
      if (m.username === username) return { x: m.x, y: m.y };
    }
    return null;
  }
  function spawnWorldBubble(username, text) {
    if (!worldActive || !username) return;
    text = String(text ?? "").slice(0, 200);
    if (!text.trim()) return;
    if (!bubbleAnchor(username)) return; // Absender nicht in der Welt
    const layer = $("worldBubbles");
    if (!layer) return;
    let rec = worldBubbles.get(username);
    if (!rec) {
      const col = document.createElement("div");
      col.className = "wb-col";
      layer.appendChild(col);
      rec = { col, items: [] };
      worldBubbles.set(username, rec);
    }
    while (rec.items.length >= BUBBLE_MAX) removeWorldBubble(username, rec.items[0], true);
    const el = document.createElement("div");
    el.className = "wbubble";
    el.textContent = text; // textContent = XSS-sicher, kein HTML
    el.dataset.exp = String(Date.now() + bubbleLifetime(text));
    rec.col.appendChild(el);
    const item = { el, timer: 0 };
    item.timer = setTimeout(() => removeWorldBubble(username, item, false), bubbleLifetime(text));
    rec.items.push(item);
  }
  function removeWorldBubble(username, item, fast) {
    const rec = worldBubbles.get(username);
    if (!rec) return;
    const i = rec.items.indexOf(item);
    if (i === -1) return;
    rec.items.splice(i, 1);
    clearTimeout(item.timer);
    const el = item.el;
    const done = () => {
      el.remove();
      if (rec.items.length === 0 && rec.col.parentNode) {
        rec.col.remove();
        worldBubbles.delete(username);
      }
    };
    if (fast || WORLD_REDUCED) { done(); return; }
    el.classList.add("out");
    setTimeout(done, 320);
  }
  function worldClearBubbles() {
    worldBubbles.forEach((rec, username) => {
      rec.items.slice().forEach((item) => removeWorldBubble(username, item, true));
    });
    worldBubbles.clear();
  }
  function worldClearBubbles() {
    worldBubbles.forEach((rec, username) => {
      rec.items.slice().forEach((item) => removeWorldBubble(username, item, true));
    });
    worldBubbles.clear();
  }
  // ===== Economy / Jobs / City (Client-State + UI, Server autoritativ) =====
  let myBalance = null;
  let myInventory = [];
  let activeJob = null;
  let cityCache = null;
  const completedBuildings = new Set();
  function updateCoinPill(flash) {
    const el = $("coinPill");
    if (!el) return;
    el.textContent = `🪙 ${myBalance ?? "–"}`;
    el.classList.remove("hidden");
    if (flash) {
      el.classList.remove("coin-flash");
      void el.offsetWidth;
      el.textContent = `${flash} ${el.textContent}`;
      el.classList.add("coin-flash");
    }
  }
  socket.on("economyData", (data) => {
    if (!data) return;
    const old = myBalance;
    myBalance = data.balance ?? 0;
    myInventory = Array.isArray(data.inventory) ? data.inventory : [];
    updateCoinPill(typeof old === "number" && myBalance > old ? `+${myBalance - old}` : typeof old === "number" && myBalance < old ? `-${old - myBalance}` : null);
    renderWallet();
  });
  socket.on("shopData", (data) => {
    if (!data) return;
    renderShop(data);
    openGameModal("shopModal");
  });
  socket.on("shopResult", (res) => {
    const el = $("shopMsg");
    if (el && res) {
      el.textContent = res.message || "";
      el.style.color = res.ok ? "" : "#ff8d98";
    }
  });
  socket.on("jobUpdate", (data) => {
    activeJob = (data && data.job) || null;
    if (data && data.completed) worldNote(`Auftrag erledigt! +${data.completed.reward} 🪙`);
    renderJobPanel();
    if ($("jobModal")?.classList.contains("active")) renderJobModal();
  });
  socket.on("jobResult", (res) => {
    const el = $("jobMsg");
    if (el && res) {
      el.textContent = res.message || "";
      el.style.color = res.ok ? "" : "#ff8d98";
    }
  });
  socket.on("cityData", (data) => {
    if (!data) return;
    cityCache = data;
    applyCityBuildings(data.buildings || []);
    renderCity();
    if ($("cityModal")?.classList.contains("active")) renderCity();
  });
  socket.on("cityResult", (res) => {
    const el = $("cityMsg");
    if (el && res) {
      el.textContent = res.message || "";
      el.style.color = res.ok ? "" : "#ff8d98";
    }
  });
  socket.on("buildingUpdate", (data) => {
    if (data && data.building) {
      applyCityBuildings([data.building.id]);
      worldNote(`${data.building.id === "cafe" ? "Café" : data.building.id} wurde gebaut! 🎉`);
    }
  });
  // Gebäude aus City-State übernehmen: Kollision + Interactable + Neuzeichnen.
  function applyCityBuildings(ids) {
    let changed = false;
    for (const id of ids || []) {
      if (id === "cafe" && !completedBuildings.has("cafe")) {
        completedBuildings.add("cafe");
        if (!worldDynamicSolids.some((s) => s.id === "cafe_counter")) {
          worldDynamicSolids.push({ id: "cafe_counter", x: 760, y: 470, w: 110, h: 28 });
          changed = true;
        }
        if (!dynamicInteractables.some((it) => it.id === "cafe_counter")) {
          dynamicInteractables.push({ id: "cafe_counter", type: "shop", shopId: "cafe", x: 815, y: 515, range: 55, room: "lounge" });
          changed = true;
        }
      }
    }
    if (changed) worldStatic = null;
  }
  function renderWallet() {
    const bal = $("walletBalance");
    if (bal) bal.textContent = `Kontostand: ${myBalance ?? 0} 🪙`;
    const list = $("walletItems");
    if (!list) return;
    list.innerHTML = "";
    if (!myInventory.length) {
      const p = document.createElement("p");
      p.className = "wallet-empty";
      p.textContent = "Noch keine Items. Schau im Mini-Markt vorbei!";
      list.appendChild(p);
      return;
    }
    myInventory.forEach((it) => {
      const row = document.createElement("div");
      row.className = "wallet-row";
      const n = document.createElement("span");
      n.textContent = it.name || it.id;
      const q = document.createElement("span");
      q.textContent = `× ${it.qty || 0}`;
      row.appendChild(n);
      row.appendChild(q);
      list.appendChild(row);
    });
  }
  function renderShop(data) {
    const title = $("shopTitle");
    if (title) title.textContent = data.name || "Shop";
    const msg = $("shopMsg");
    if (msg) { msg.textContent = ""; }
    const list = $("shopItems");
    if (!list) return;
    list.innerHTML = "";
    (data.items || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "shop-row";
      const n = document.createElement("span");
      n.textContent = `${item.name} – ${item.price} 🪙`;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Kaufen";
      b.addEventListener("click", () => socket.emit("shopBuy", { shopId: data.shopId, itemId: item.id }));
      row.appendChild(n);
      row.appendChild(b);
      list.appendChild(row);
    });
  }
  function renderJobModal() {
    const body = $("jobBody");
    if (!body) return;
    body.innerHTML = "";
    const h = document.createElement("h3");
    h.textContent = "Lieferdienst";
    body.appendChild(h);
    const p = document.createElement("p");
    p.textContent = activeJob
      ? `Aktiver Auftrag: ${activeJob.targetLabel} (${activeJob.targetRoom}) – Belohnung ${activeJob.reward} 🪙`
      : "Bringe Pakete zu den markierten Orten. Belohnung: 40 🪙 pro Lieferung.";
    body.appendChild(p);
    if (!activeJob) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Auftrag starten";
      b.addEventListener("click", () => socket.emit("jobStart", { jobId: "delivery" }));
      body.appendChild(b);
    }
    const m = document.createElement("p");
    m.id = "jobMsg";
    m.className = "profile-msg";
    body.appendChild(m);
  }
  function renderJobPanel() {
    const panel = $("jobPanel");
    if (!panel) return;
    if (!activeJob) { panel.classList.add("hidden"); return; }
    panel.classList.remove("hidden");
    panel.innerHTML = "";
    const t = document.createElement("strong");
    t.textContent = "📦 Lieferung";
    const d = document.createElement("span");
    d.textContent = `Ziel: ${activeJob.targetLabel} (+${activeJob.reward} 🪙)`;
    panel.appendChild(t);
    panel.appendChild(d);
  }
  function renderCity() {
    const data = cityCache;
    if (!data) return;
    const head = $("cityHead");
    if (head) head.textContent = `Stadt • Level ${data.level}`;
    const goal = $("cityGoal");
    if (goal) goal.textContent = `Nächstes Ziel: ${data.goal}`;
    const list = $("cityProjects");
    if (list) {
      list.innerHTML = "";
      (data.projects || []).forEach((p) => {
        const box = document.createElement("div");
        box.className = "city-project";
        const h = document.createElement("h3");
        h.textContent = `${p.name}${p.status === "completed" ? " ✓" : ""}`;
        const d = document.createElement("p");
        d.textContent = p.desc || "";
        const bar = document.createElement("div");
        bar.className = "city-bar";
        const fill = document.createElement("div");
        fill.className = "city-fill";
        fill.style.width = `${Math.min(100, Math.round((100 * (p.total || 0)) / Math.max(1, p.cost)))}%`;
        bar.appendChild(fill);
        const prog = document.createElement("p");
        prog.textContent = `${p.total || 0} / ${p.cost} 🪙 (von dir: ${p.mine || 0})`;
        box.appendChild(h);
        box.appendChild(d);
        box.appendChild(bar);
        box.appendChild(prog);
        if (p.status !== "completed") {
          const row = document.createElement("div");
          row.className = "city-actions";
          [10, 25, 50].forEach((amt) => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = `+${amt} 🪙`;
            b.addEventListener("click", () => socket.emit("cityContribute", { projectId: p.id, amount: amt }));
            row.appendChild(b);
          });
          box.appendChild(row);
        }
        list.appendChild(box);
      });
    }
    const m = $("cityMsg");
    if (m) m.textContent = "";
  }
  function renderComputer() {
    const body = $("computerBody");
    if (!body) return;
    body.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = `Kontostand: ${myBalance ?? 0} 🪙 • Items: ${myInventory.reduce((s, it) => s + (it.qty || 0), 0)}`;
    body.appendChild(p);
    const mkBtn = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", fn);
      body.appendChild(b);
    };
    mkBtn("Inventar ansehen", () => { renderWallet(); openGameModal("walletModal"); });
    mkBtn("Job annehmen", () => { socket.emit("jobState"); openGameModal("jobModal"); renderJobModal(); });
    mkBtn("Stadt-Projekt", () => { socket.emit("cityInfo"); openGameModal("cityModal"); });
  }
  // Job-Zielmarker (pulsierend) + Interactable-Markierung im Canvas.
  function drawJobMarker(ctx) {
    if (!activeJob || typeof activeJob.targetX !== "number") return;
    const pulse = WORLD_REDUCED ? 0 : 4 * Math.sin(performance.now() / 350);
    ctx.save();
    ctx.strokeStyle = "rgba(255,209,102,.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(activeJob.targetX, activeJob.targetY, 22 + pulse, 12 + pulse * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.font = "700 13px 'Hanken Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📦", activeJob.targetX, activeJob.targetY - 16);
    ctx.restore();
  }
  function worldBubblesFrame() {
    const view = worldViewSize();
    worldBubbles.forEach((rec, username) => {
      const a = bubbleAnchor(username);
      if (!a) { rec.col.style.display = "none"; return; }
      const s = worldToScreen(a.x, a.y - 52);
      if (s.x < -160 || s.y < -60 || s.x > view.w + 160 || s.y > view.h + 60) {
        rec.col.style.display = "none";
        return;
      }
      rec.col.style.display = "";
      rec.col.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%,-100%)`;
    });
  }

  // ===== Welt: Proximity-Voice (gleicher Raum = verbunden) =====
  const worldPeers = new Map();
  function worldPeerClose(id) {
    worldPeers.get(id)?.close();
    worldPeers.delete(id);
    document.querySelector(`audio[data-world-peer="${id}"]`)?.remove();
  }
  function worldPeerCloseAll() { Array.from(worldPeers.keys()).forEach(worldPeerClose); }
  function worldCanTalk() { return Boolean(stream) && !roomId && worldActive; }
  function worldMakePeer(id) {
    const peer = new RTCPeerConnection(rtcConfig);
    stream.getTracks().forEach((t) => peer.addTrack(t, stream));
    peer.onicecandidate = ({ candidate }) => candidate && socket.emit("worldIce", { targetId: id, candidate });
    peer.onconnectionstatechange = () => { if (peer.connectionState === "failed") worldPeerClose(id); };
    peer.ontrack = ({ streams }) => {
      let audio = document.querySelector(`audio[data-world-peer="${id}"]`);
      if (!audio) { audio = document.createElement("audio"); audio.autoplay = true; audio.playsInline = true; audio.dataset.worldPeer = id; document.body.appendChild(audio); }
      audio.srcObject = streams[0];
    };
    worldPeers.set(id, peer);
    return peer;
  }
  function worldVoiceUpdate() {
    if (!worldActive) return;
    const myRoom = worldPlayer.room;
    const ok = worldCanTalk();
    worldPeers.forEach((peer, id) => {
      const m = worldRemotes.get(id);
      if (!ok || !m || m.room !== myRoom) {
        console.debug(`[welt-voice] trenne ${m?.username || id} (ich: ${myRoom}, peer: ${m?.room || "weg"})`);
        worldPeerClose(id);
      }
    });
    if (!ok) return;
    worldRemotes.forEach((m, id) => {
      if (m.room === myRoom && !worldPeers.has(id)) {
        console.debug(`[welt-voice] verbinde mit ${m.username} in ${myRoom}`);
        try {
          const peer = worldMakePeer(id);
          peer.createOffer()
            .then((offer) => peer.setLocalDescription(offer))
            .then(() => socket.emit("worldOffer", { targetId: id, offer: peer.localDescription }))
            .catch(() => worldPeerClose(id));
        } catch { worldPeerClose(id); }
      }
    });
  }
  socket.on("worldOffer", async ({ fromId, offer }) => {
    if (!worldCanTalk()) return;
    const m = worldRemotes.get(fromId);
    if (!m || m.room !== worldPlayer.room) return;
    try {
      const peer = worldPeers.get(fromId) || worldMakePeer(fromId);
      await peer.setRemoteDescription(offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("worldAnswer", { targetId: fromId, answer });
    } catch { worldPeerClose(fromId); }
  });
  socket.on("worldAnswer", async ({ fromId, answer }) => {
    const peer = worldPeers.get(fromId);
    if (peer) { try { await peer.setRemoteDescription(answer); } catch { /* ignore */ } }
  });
  socket.on("worldIce", async ({ fromId, candidate }) => {
    const peer = worldPeers.get(fromId);
    if (peer && candidate) { try { await peer.addIceCandidate(candidate); } catch { /* ignore */ } }
  });

  // ===== Voice Chat (WebRTC + Socket.IO-Signaling) =====
  // Ein UI, zwei Ansichten: Das Desktop-Panel wird für Mobil geclont.
  // Damit keine doppelten IDs entstehen, werden sie im Klon entfernt und
  // alles per Klasse innerhalb der `.voice-panel`-Wurzeln abgefragt.
  const desktopVoice = $("voiceSidebar"), mobileVoice = $("voicePanelMobile"), mobileToggle = $("voiceMobileToggle");
  if (desktopVoice && mobileVoice) {
    const clone = desktopVoice.cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    mobileVoice.appendChild(clone);
  }
  const voicePanels = () => document.querySelectorAll(".voice-panel");
  const voiceQuery = (sel) => { const out = []; voicePanels().forEach((p) => p.querySelectorAll(sel).forEach((el) => out.push(el))); return out; };
  const voiceStatusEls = () => voiceQuery(".voice-panel__status");
  const voiceDotEls = () => voiceQuery(".voice-dot");
  const voiceJoinBtns = () => voiceQuery(".voice-panel__actions .voice-action--primary");
  const voiceMuteBtns = () => voiceQuery(".voice-panel__actions .voice-action:not(.voice-action--primary):not(.voice-action--danger)");
  const voiceLeaveBtns = () => voiceQuery(".voice-panel__actions .voice-action--danger");
  const voiceLists = () => voiceQuery("ul.voice-members");
  const voiceCountEls = () => voiceQuery(".voice-panel__room small");
  let stream = null, roomId = null, muted = false, joining = false;
  const peers = new Map();
  const peerMuted = new Map(); // socketId -> true (Stummschaltung der anderen)
  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // Freier TURN-Fallback für restriktive Netze (z. B. Schul-WLAN ohne UDP).
      // Für den Dauerbetrieb eigenen TURN-Server (z. B. coturn) eintragen.
      { urls: "stun:openrelay.mrtc.io:80" },
      { urls: "turn:openrelay.mrtc.io:80", username: "openrelay", credential: "openrelay" },
      { urls: "turn:openrelay.mrtc.io:443", username: "openrelay", credential: "openrelay" },
      { urls: "turns:openrelay.mrtc.io:443", username: "openrelay", credential: "openrelay" },
    ],
  };
  function setVoiceStatus(text, connected = false) { voiceStatusEls().forEach((el) => (el.textContent = text)); voiceDotEls().forEach((dot) => dot.classList.toggle("connected", connected)); }
  function updateVoiceButtons() { const joined = Boolean(roomId); voiceJoinBtns().forEach((b) => { b.textContent = joined ? "Im Voice verbunden" : "Voice beitreten"; b.disabled = joining || joined; }); voiceMuteBtns().forEach((b) => { b.textContent = muted ? "Mikro aktivieren" : "Mikro stumm"; b.disabled = !joined; }); voiceLeaveBtns().forEach((b) => (b.disabled = !joined)); }
  function renderMembers(members = []) {
    const myId = socket.id;
    voiceLists().forEach((list) => {
      list.innerHTML = "";
      if (!members.length) list.innerHTML = '<li class="voice-members__empty">Noch niemand im Raum</li>';
      members.forEach((member) => {
        const isSelf = member.socketId && member.socketId === myId;
        const isMuted = isSelf ? muted : peerMuted.get(member.socketId) === true;
        const item = document.createElement("li");
        item.className = "voice-member" + (isMuted ? " is-muted" : "");
        item.dataset.socket = member.socketId;
        if (isSelf) item.dataset.mine = "1";
        item.innerHTML = `<span class="voice-member__avatar"></span><span class="voice-member__name"></span><span class="voice-member__state"></span>${isSelf ? '<span class="voice-member__you">Du</span>' : ""}`;
        const avEl = item.querySelector(".voice-member__avatar");
        avEl.textContent = member.avatar || (member.username || "?").slice(0, 1).toUpperCase();
        const nmEl = item.querySelector(".voice-member__name");
        nmEl.textContent = member.username;
        if (member.isAdmin) {
          item.classList.add("is-admin");
          const rank = document.createElement("span");
          rank.className = "rank-badge";
          rank.textContent = "Admin";
          nmEl.after(rank);
        } else if (member.color) nmEl.style.color = member.color;
        if (isMuted) item.querySelector(".voice-member__state").textContent = "🔇";
        list.appendChild(item);
      });
    });
    voiceCountEls().forEach((el) => (el.textContent = `${members.length} Teilnehmer`));
  }
  // Sprechanzeige: misst pro Stream die Lautstärke und markiert den Eintrag.
  let voiceAudioCtx = null;
  const speakingMonitors = new Map(); // key ("local" | socketId) -> { timer, src }
  function speakingSelector(key) { return key === "local" ? ".voice-member[data-mine=\"1\"]" : `.voice-member[data-socket="${key}"]`; }
  function startSpeakingMonitor(mediaStream, key) {
    try {
      voiceAudioCtx = voiceAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (voiceAudioCtx.state === "suspended") voiceAudioCtx.resume();
      stopSpeakingMonitor(key);
      const src = voiceAudioCtx.createMediaStreamSource(mediaStream);
      const analyser = voiceAudioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i] - 128) / 128; if (v > peak) peak = v; }
        const active = peak > 0.12 && (key === "local" ? !muted : true);
        document.querySelectorAll(speakingSelector(key)).forEach((li) => li.classList.toggle("speaking", active));
        worldSpeaking.set(key, active); // Welt-Ring liest denselben Wert
      }, 200);
      speakingMonitors.set(key, { timer, src });
    } catch (e) { console.warn("Sprechanzeige deaktiviert:", e); }
  }
  function stopSpeakingMonitor(key) { const mon = speakingMonitors.get(key); if (!mon) return; clearInterval(mon.timer); try { mon.src.disconnect(); } catch {} speakingMonitors.delete(key); worldSpeaking.delete(key); document.querySelectorAll(speakingSelector(key)).forEach((li) => li.classList.remove("speaking")); }
  // Mikrofon-Zugriff (wird u. a. automatisch nach dem Login angefragt).
  // Der Stream bleibt lokal, bis der Raum betreten wird.
  async function ensureMic() {
    if (stream) return true;
    if (!window.isSecureContext) { setVoiceStatus("Mikrofon braucht localhost oder HTTPS"); return false; }
    if (!navigator.mediaDevices?.getUserMedia) { setVoiceStatus("Browser unterstützt kein Mikrofon"); return false; }
    try {
      setVoiceStatus("Mikrofon wird angefragt …");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      muted = false;
      startSpeakingMonitor(stream, "local");
      setVoiceStatus("Mikrofon bereit – trete dem Voice bei");
      updateVoiceButtons();
      return true;
    } catch (error) {
      console.error("Mikrofon-Fehler:", error?.name, error?.message, error);
      stream = null;
      const kind = error?.name || "";
      if (kind === "NotFoundError" || kind === "OverconstrainedError")
        setVoiceStatus("Kein Mikrofon gefunden – Gerät anschließen / OS-Freigabe prüfen (Klick für Retry)");
      else if (kind === "NotReadableError")
        setVoiceStatus("Mikrofon von anderer App belegt (Klick für Retry)");
      else if (kind === "AbortError")
        setVoiceStatus("Anfrage abgebrochen – klicke zum Wiederholen");
      else if (kind === "SecurityError")
        setVoiceStatus("Nur über localhost/HTTPS möglich");
      else
        setVoiceStatus("Mikrofon blockiert – Adressleisten-Symbol prüfen (Klick für Retry)");
      return false;
    }
  }
  function closePeer(id) { peers.get(id)?.close(); peers.delete(id); stopSpeakingMonitor(id); document.querySelector(`audio[data-voice-peer="${id}"]`)?.remove(); }
  function peerFor(id) {
    const peer = new RTCPeerConnection(rtcConfig);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = ({ candidate }) => candidate && socket.emit("iceCandidate", { targetId: id, candidate });
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setVoiceStatus("Mit der Lobby verbunden", true);
      else if (peer.connectionState === "failed") { setVoiceStatus("Verbindung fehlgeschlagen – bitte erneut beitreten"); closePeer(id); }
    };
    peer.ontrack = ({ streams }) => {
      let audio = document.querySelector(`audio[data-voice-peer="${id}"]`);
      if (!audio) { audio = document.createElement("audio"); audio.autoplay = true; audio.playsInline = true; audio.dataset.voicePeer = id; document.body.appendChild(audio); }
      audio.srcObject = streams[0];
      startSpeakingMonitor(streams[0], id);
    };
    return peer;
  }
  async function joinVoice() {
    if (roomId || joining) return;
    if (voiceAudioCtx?.state === "suspended") voiceAudioCtx.resume();
    joining = true;
    updateVoiceButtons();
    if (!stream && !(await ensureMic())) { joining = false; updateVoiceButtons(); return; }
    setVoiceStatus("Verbinde mit der Lobby …");
    socket.emit("getVoiceRooms");
    setTimeout(() => { if (joining && !roomId) { joining = false; setVoiceStatus("Keine Antwort – erneut auf Beitreten klicken"); updateVoiceButtons(); } }, 8000);
  }
  function leaveVoice() {
    if (roomId) socket.emit("leaveVoiceRoom");
    peers.forEach((_, id) => closePeer(id));
    stopSpeakingMonitor("local");
    stream?.getTracks().forEach((track) => track.stop());
    stream = null; roomId = null; muted = false; joining = false;
    peerMuted.clear();
    setVoiceStatus("Bereit zum Beitreten");
    updateVoiceButtons();
    renderMembers();
  }
  socket.on("voiceRoomsList", (rooms) => { joining = false; if (!stream) { updateVoiceButtons(); return; } const room = rooms.find((item) => item.isDefault) || rooms[0]; if (!room) { updateVoiceButtons(); return setVoiceStatus("Lobby ist noch nicht verfügbar"); } roomId = room._id; updateVoiceButtons(); socket.emit("joinVoiceRoom", { roomId }); });
  socket.on("voicePresence", ({ roomId: updatedRoom, members }) => { if (!roomId || updatedRoom === roomId) renderMembers(members); });
  socket.on("voicePeers", async (ids) => { setVoiceStatus("Mit der Lobby verbunden", true); updateVoiceButtons(); if (worldActive) { socket.emit("worldJoin"); } for (const id of ids) { const peer = peerFor(id); peers.set(id, peer); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); socket.emit("offer", { targetId: id, offer }); } });
  socket.on("offer", async ({ fromId, offer }) => { if (!stream) return; let peer = peers.get(fromId); if (!peer) { peer = peerFor(fromId); peers.set(fromId, peer); } await peer.setRemoteDescription(offer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit("answer", { targetId: fromId, answer }); });
  socket.on("answer", async ({ fromId, answer }) => { const peer = peers.get(fromId); if (peer) await peer.setRemoteDescription(answer); });
  socket.on("iceCandidate", async ({ fromId, candidate }) => { const peer = peers.get(fromId); if (peer && candidate) await peer.addIceCandidate(candidate); });
  socket.on("userLeftVoice", ({ socketId }) => { peerMuted.delete(socketId); closePeer(socketId); });
  socket.on("voiceMuteState", ({ socketId, muted: isMuted }) => {
    if (isMuted) peerMuted.set(socketId, true); else peerMuted.delete(socketId);
    document.querySelectorAll(`.voice-member[data-socket="${socketId}"]`).forEach((li) => {
      li.classList.toggle("is-muted", isMuted);
      const st = li.querySelector(".voice-member__state");
      if (st) st.textContent = isMuted ? "🔇" : "";
    });
  });
  socket.on("voiceError", (message) => { leaveVoice(); setVoiceStatus(message); });
  socket.on("voiceKicked", ({ message }) => { leaveVoice(); setVoiceStatus(message || "Aus dem Voice entfernt."); });
  function toggleMute() {
    if (!stream || !roomId) return;
    muted = !muted;
    stream.getAudioTracks().forEach((track) => (track.enabled = !muted));
    socket.emit("voiceMuteState", { muted });
    // Eigener Eintrag sofort rot markieren (Server meldet es nur den anderen).
    document.querySelectorAll('.voice-member[data-mine="1"]').forEach((li) => {
      li.classList.toggle("is-muted", muted);
      const st = li.querySelector(".voice-member__state");
      if (st) st.textContent = muted ? "🔇" : "";
    });
    updateVoiceButtons();
  }
  // Button-Tooltips mit Kürzel-Hinweis
  voiceJoinBtns().forEach((b) => (b.title = "Beitreten / Verlassen (Taste V)"));
  voiceMuteBtns().forEach((b) => (b.title = "Stumm schalten (Taste M)"));
  voiceLeaveBtns().forEach((b) => (b.title = "Verlassen (Taste V)"));
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".voice-panel .voice-action");
    if (!button || button.disabled) return;
    if (button.classList.contains("voice-action--primary")) joinVoice();
    else if (button.classList.contains("voice-action--danger")) leaveVoice();
    else toggleMute();
  });
  // Tastenkürzel: V = Voice beitreten/verlassen, M = stumm/aktiv (nicht beim Tippen)
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (!activeUser() || chatContainer?.classList.contains("hidden")) return;
    const key = event.key?.toLowerCase();
    if (key === "v") { event.preventDefault(); roomId ? leaveVoice() : joinVoice(); }
    else if (key === "m") { event.preventDefault(); toggleMute(); }
  });
  // E = interagieren mit dem nächsten Objekt, Escape = Modals schließen / aufstehen.
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (!activeUser() || chatContainer?.classList.contains("hidden")) return;
    if (event.code === "Escape") {
      closeGameModals();
      if (worldPlayer.sitting) standUp();
      return;
    }
    if (event.code !== "KeyE" || !worldActive) return;
    event.preventDefault();
    doInteract();
  });
  // Klick auf die Statuszeile fragt das Mikrofon erneut an (Retry).
  document.addEventListener("click", (event) => {
    if (event.target.closest(".voice-panel__status") && !stream) ensureMic();
  });
  mobileToggle?.addEventListener("click", () => { mobileVoice.classList.toggle("open"); mobileVoice.setAttribute("aria-hidden", String(!mobileVoice.classList.contains("open"))); });
  window.addEventListener("beforeunload", leaveVoice);
});
