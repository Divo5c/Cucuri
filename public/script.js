  // ---------- Chat receive ----------

  // NEU: Lade den Verlauf von 100 Nachrichten beim Login
  socket.on('loadHistory', (history) => {
    if (!messages) return;
    messages.innerHTML = ''; // Vorherigen Chat leeren, falls man sich umloggt
    
    history.forEach(data => {
      const div = document.createElement('div');
      div.classList.add('message');
      div.innerHTML = `<strong>${data.username}</strong> <time>${data.timestamp || ''}</time><br>${data.msg}`;
      messages.appendChild(div);
    });
    
    // Nach dem Laden ganz nach unten scrollen
    messages.scrollTop = messages.scrollHeight;
  });

  socket.on('chatMessage', (data) => {
    if (!messages) return;
    const div = document.createElement('div');
    div.classList.add('message');
// ... (der Rest bleibt gleich) ...
