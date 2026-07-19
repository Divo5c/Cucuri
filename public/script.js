document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const $ = (id) => document.getElementById(id);
  const authModal = $("authModal"), chatContainer = $("chatContainer");
  const messages = $("messages"), onlineList = $("onlineList");
  const currentUser = () => localStorage.getItem("cucuri_username");

  function showTab(tab) { ["registerTab", "loginTab"].forEach((id) => $(id)?.classList.toggle("active", id === tab)); }
  $("switchToLogin")?.addEventListener("click", (e) => { e.preventDefault(); showTab("loginTab"); });
  $("switchToRegister")?.addEventListener("click", (e) => { e.preventDefault(); showTab("registerTab"); });
  $("closeBtn")?.addEventListener("click", () => authModal?.classList.remove("active"));
  $("registerBtn")?.addEventListener("click", () => socket.emit("register", { username: $("regUsername").value.trim(), password: $("regPassword").value.trim() }));
  $("loginBtn")?.addEventListener("click", () => socket.emit("login", { username: $("loginUsername").value.trim(), password: $("loginPassword").value.trim() }));
  ["regUsername", "regPassword", "loginUsername", "loginPassword"].forEach((id) => $(id)?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $(id.startsWith("reg") ? "registerBtn" : "loginBtn")?.click(); } }));
  socket.on("registerSuccess", () => { $("registerError").textContent = "Erfolgreich registriert. Bitte einloggen."; showTab("loginTab"); });
  socket.on("registerError", (message) => { $("registerError").textContent = message; });
  socket.on("loginError", (message) => { $("loginError").textContent = message; });
  socket.on("loginSuccess", (username) => {
    localStorage.setItem("cucuri_username", username); authModal?.classList.remove("active"); chatContainer?.classList.remove("hidden");
    if (chatContainer) chatContainer.style.display = "flex";
    $("voiceChatBtn")?.classList.remove("hidden"); $("jugendwortBtn")?.classList.remove("hidden");
    if (username === "Divo") $("adminToggle")?.classList.remove("hidden");
  });
  function addMessage(data) { if (!messages) return; const node = document.createElement("div"); node.className = "message"; node.innerHTML = `<div class="msg-header"><span class="msg-username"></span><time class="msg-time"></time></div><div class="msg-text"></div>`; node.querySelector(".msg-username").textContent = data.username; node.querySelector(".msg-time").textContent = data.timestamp || ""; node.querySelector(".msg-text").textContent = data.msg; messages.appendChild(node); }
  socket.on("loadHistory", (history) => { messages.innerHTML = ""; history.forEach(addMessage); messages.scrollTop = messages.scrollHeight; });
  socket.on("chatMessage", (data) => { addMessage(data); messages.scrollTop = messages.scrollHeight; });
  const sendMessage = () => { const input = $("messageInput"); const text = input?.value.trim(); if (text) { socket.emit("chatMessage", text); input.value = ""; } };
  $("sendBtn")?.addEventListener("click", sendMessage); $("messageInput")?.addEventListener("keydown", (e) => e.key === "Enter" && sendMessage());
  socket.on("updateUserList", ({ online, offline }) => { if (!onlineList) return; onlineList.innerHTML = ""; [...online.map((name) => [name, true]), ...offline.map((name) => [name, false])].forEach(([name, isOnline]) => { const li = document.createElement("li"); li.textContent = `${isOnline ? "🟢" : "🔴"} ${name}`; onlineList.appendChild(li); }); });

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

  // One responsive Voice UI: duplicate markup is only the mobile view of the same state.
  const desktopVoice = $("voiceSidebar"), mobileVoice = $("voicePanelMobile"), mobileToggle = $("voiceMobileToggle");
  if (desktopVoice && mobileVoice) mobileVoice.appendChild(desktopVoice.cloneNode(true));
  const voiceAll = (id) => document.querySelectorAll(`#${id}`);
  const voiceText = (id, value) => voiceAll(id).forEach((element) => (element.textContent = value));
  const voiceDisabled = (id, value) => voiceAll(id).forEach((element) => (element.disabled = value));
  let stream = null, roomId = null, muted = false;
  const peers = new Map();
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  function setVoiceStatus(text, connected = false) { voiceText("voiceStatus", text); voiceAll("voiceConnectionDot").forEach((dot) => dot.classList.toggle("connected", connected)); }
  function updateVoiceButtons() { const joined = Boolean(stream); voiceText("voiceJoinBtn", joined ? "Im Voice verbunden" : "Voice beitreten"); voiceText("voiceMuteBtn", muted ? "Mikro aktivieren" : "Mikro stumm"); voiceDisabled("voiceMuteBtn", !joined); voiceDisabled("voiceLeaveBtn", !joined); }
  function renderMembers(members = []) { const mine = currentUser(); voiceAll("voiceParticipants").forEach((list) => { list.innerHTML = ""; if (!members.length) list.innerHTML = '<li class="voice-members__empty">Noch niemand im Raum</li>'; members.forEach((member) => { const item = document.createElement("li"); item.className = "voice-member"; item.innerHTML = `<span class="voice-member__avatar"></span><span class="voice-member__name"></span>${member.username === mine ? '<span class="voice-member__you">Du</span>' : ""}`; item.querySelector(".voice-member__avatar").textContent = member.username.slice(0, 1).toUpperCase(); item.querySelector(".voice-member__name").textContent = member.username; list.appendChild(item); }); }); voiceText("voiceMemberCount", `${members.length} Teilnehmer`); }
  function closePeer(id) { peers.get(id)?.close(); peers.delete(id); document.querySelector(`audio[data-voice-peer="${id}"]`)?.remove(); }
  function peerFor(id) { const peer = new RTCPeerConnection(rtcConfig); stream.getTracks().forEach((track) => peer.addTrack(track, stream)); peer.onicecandidate = ({ candidate }) => candidate && socket.emit("iceCandidate", { targetId: id, candidate }); peer.ontrack = ({ streams }) => { let audio = document.querySelector(`audio[data-voice-peer="${id}"]`); if (!audio) { audio = document.createElement("audio"); audio.autoplay = true; audio.playsInline = true; audio.dataset.voicePeer = id; document.body.appendChild(audio); } audio.srcObject = streams[0]; }; return peer; }
  async function joinVoice() { if (stream) return; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); setVoiceStatus("Verbinde mit der Lobby …"); updateVoiceButtons(); socket.emit("getVoiceRooms"); } catch (error) { console.error(error); setVoiceStatus("Mikrofon-Zugriff wurde nicht erlaubt"); } }
  function leaveVoice() { if (roomId) socket.emit("leaveVoiceRoom"); peers.forEach((_, id) => closePeer(id)); stream?.getTracks().forEach((track) => track.stop()); stream = null; roomId = null; muted = false; setVoiceStatus("Bereit zum Beitreten"); updateVoiceButtons(); renderMembers(); }
  socket.on("voiceRoomsList", (rooms) => { if (!stream) return; const room = rooms.find((item) => item.isDefault) || rooms[0]; if (!room) return setVoiceStatus("Lobby ist noch nicht verfügbar"); roomId = room._id; socket.emit("joinVoiceRoom", { roomId }); });
  socket.on("voicePresence", ({ roomId: updatedRoom, members }) => { if (!roomId || updatedRoom === roomId) renderMembers(members); });
  socket.on("voicePeers", async (ids) => { setVoiceStatus("Mit der Lobby verbunden", true); for (const id of ids) { const peer = peerFor(id); peers.set(id, peer); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); socket.emit("offer", { targetId: id, offer }); } });
  socket.on("offer", async ({ fromId, offer }) => { if (!stream) return; let peer = peers.get(fromId); if (!peer) { peer = peerFor(fromId); peers.set(fromId, peer); } await peer.setRemoteDescription(offer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit("answer", { targetId: fromId, answer }); });
  socket.on("answer", async ({ fromId, answer }) => { const peer = peers.get(fromId); if (peer) await peer.setRemoteDescription(answer); });
  socket.on("iceCandidate", async ({ fromId, candidate }) => { const peer = peers.get(fromId); if (peer && candidate) await peer.addIceCandidate(candidate); });
  socket.on("userLeftVoice", ({ socketId }) => closePeer(socketId)); socket.on("voiceError", (message) => { leaveVoice(); setVoiceStatus(message); });
  document.addEventListener("click", (event) => { const button = event.target.closest("#voiceJoinBtn,#voiceMuteBtn,#voiceLeaveBtn"); if (!button) return; if (button.id === "voiceJoinBtn") joinVoice(); if (button.id === "voiceMuteBtn" && stream) { muted = !muted; stream.getAudioTracks().forEach((track) => (track.enabled = !muted)); updateVoiceButtons(); } if (button.id === "voiceLeaveBtn") leaveVoice(); });
  mobileToggle?.addEventListener("click", () => { mobileVoice.classList.toggle("open"); mobileVoice.setAttribute("aria-hidden", String(!mobileVoice.classList.contains("open"))); });
  $("voiceChatBtn")?.addEventListener("click", () => window.innerWidth <= 768 ? mobileToggle?.click() : desktopVoice?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  window.addEventListener("beforeunload", leaveVoice);
});
