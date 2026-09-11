(() => {
  const listEl = document.getElementById("jw-list");
  const emptyEl = document.getElementById("jw-empty");
  const searchEl = document.getElementById("jw-search");
  const sortEl = document.getElementById("jw-sort");
  const adminToggleBtn = document.getElementById("jw-toggle-admin");
  const adminPanel = document.getElementById("jw-admin-panel");

  let adminOverviewEl;
  let words = [];
  let currentChoice = null;
  let currentUser = null;

  function getCurrentUser() {
    try {
      return localStorage.getItem("cucuri_username") || null;
    } catch { return null; }
  }

  async function fetchWordsFromServer() {
    currentUser = getCurrentUser();
    const url = currentUser
      ? `/api/jugendwort/votes?user=${encodeURIComponent(currentUser)}`
      : "/api/jugendwort/votes";

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      words = data.words || [];
      currentChoice = data.currentChoice || null;
    } catch (e) {
      console.error("Fehler beim Laden:", e);
      words = [];
      currentChoice = null;
    }
  }

  async function sendVote(id) {
    currentUser = getCurrentUser();
    if (!currentUser) {
      alert("Bitte im Chat einloggen.");
      return;
    }
    const res = await fetch(`/api/jugendwort/vote?user=${encodeURIComponent(currentUser)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId: id })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Fehler beim Voting.");
      return;
    }
    currentChoice = data.choice;
    await fetchWordsFromServer();
    render();
    updateAdminOverview();
  }

  async function removeVote() {
    currentUser = getCurrentUser();
    if (!currentUser) {
      alert("Bitte im Chat einloggen.");
      return;
    }
    if (!currentChoice) {
      alert("Du hast aktuell keine Stimme.");
      return;
    }
    if (!confirm("Willst du deine Stimme wirklich löschen?")) return;

    const res = await fetch(`/api/jugendwort/vote?user=${encodeURIComponent(currentUser)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Fehler beim Löschen.");
      return;
    }
    currentChoice = null;
    await fetchWordsFromServer();
    render();
    updateAdminOverview();
  }

  function render() {
    const search = (searchEl?.value || "").trim().toLowerCase();
    const sort = sortEl?.value || "votes-desc";

    let visible = [...words];
    if (search) {
      visible = visible.filter(w => w.term.toLowerCase().includes(search) || w.meaning.toLowerCase().includes(search));
    }

    visible.sort((a, b) => {
      if (sort === "alpha-asc") return a.term.localeCompare(b.term);
      if (sort === "alpha-desc") return b.term.localeCompare(a.term);
      return (b.votes || 0) - (a.votes || 0);
    });

    listEl.innerHTML = "";
    if (!visible.length) {
      emptyEl.classList.remove("jw-hidden");
      return;
    }
    emptyEl.classList.add("jw-hidden");

    // Frontend-Rank (nur Anzeige im Karten-UI)
    let currentRank = 0;
    let lastVotes = null;

    visible.forEach((w) => {
      if (w.votes !== lastVotes) {
        currentRank += 1;
        lastVotes = w.votes;
      }
      const rankLabel = currentRank;

      const isChosen = currentChoice === w.id;
      const btnText = isChosen ? "Gewählt (ändern)" : "Vote geben";
      const removeBtn = isChosen ? `<button class="jw-btn jw-btn-ghost jw-remove-vote-btn">Stimme entfernen</button>` : "";

      const card = document.createElement("article");
      card.className = `jw-card jw-rank-${rankLabel}`;
      card.innerHTML = `
        <div class="jw-card-header">
          <h3 class="jw-term">
            <span class="jw-term-main">${w.term}</span>
            <span class="jw-term-secondary">#${rankLabel}</span>
          </h3>
          <span class="jw-badge-rank">Rank ${rankLabel}</span>
        </div>
        <p class="jw-meaning">${w.meaning}</p>
        <div class="jw-meta-row">
          <span class="jw-vote-count">${w.votes} Vote${w.votes === 1 ? "" : "s"}</span>
          <div class="jw-vote-area">
            <button class="jw-btn jw-vote-btn">${btnText}</button>
            ${removeBtn}
          </div>
        </div>
      `;

      card.querySelector(".jw-vote-btn").onclick = () => sendVote(w.id);
      if (card.querySelector(".jw-remove-vote-btn")) {
        card.querySelector(".jw-remove-vote-btn").onclick = removeVote;
      }
      listEl.appendChild(card);
    });
  }

  function setupEvents() {
    searchEl?.addEventListener("input", () => render());
    sortEl?.addEventListener("change", () => render());

    currentUser = getCurrentUser();
    if (currentUser === "Divo") {
      adminToggleBtn?.classList.remove("jw-hidden");
      adminPanel?.classList.add("jw-hidden");
      adminToggleBtn.addEventListener("click", () => {
        const hidden = adminPanel.classList.contains("jw-hidden");
        adminPanel.classList.toggle("jw-hidden", !hidden);
        adminToggleBtn.textContent = hidden ? "Admin anzeigen" : "Admin verstecken";
        if (hidden) updateAdminOverview();
      });
    } else {
      adminToggleBtn?.classList.add("jw-hidden");
      adminPanel?.classList.add("jw-hidden");
    }

    setupAdminOverview();
  }

  function setupAdminOverview() {
    adminOverviewEl = document.createElement("div");
    adminOverviewEl.className = "jw-admin-overview";
    adminOverviewEl.innerHTML = `
      <h3>Admin-Übersicht</h3>
      <p class="jw-admin-current-vote"></p>
      <div class="jw-admin-table-wrap">
        <h4>User → Stimme</h4>
        <table class="jw-admin-table">
          <thead><tr><th>User</th><th>Gewähltes Wort</th></tr></thead>
          <tbody class="jw-admin-tbody-users"></tbody>
        </table>
      </div>
      <div class="jw-admin-table-wrap" style="margin-top:1rem;">
        <h4>Wort → Votes & Rank</h4>
        <table class="jw-admin-table">
          <thead><tr><th>Platz</th><th>Wort</th><th>Votes</th></tr></thead>
          <tbody class="jw-admin-tbody-words"></tbody>
        </table>
      </div>
    `;
    adminPanel.appendChild(adminOverviewEl);
  }

  // DENSE RANK für Admin-Tabelle
  function buildRankedWords(wordStats) {
    const sorted = [...wordStats].sort((a, b) => (b.votes || 0) - (a.votes || 0));
    let currentRank = 0;
    let lastVotes = null;

    return sorted.map(w => {
      const v = w.votes || 0;
      if (v !== lastVotes) {
        currentRank += 1;
        lastVotes = v;
      }
      return { ...w, rank: currentRank };
    });
  }

  async function updateAdminOverview() {
    if (!adminOverviewEl) return;
    const userTbody = adminOverviewEl.querySelector(".jw-admin-tbody-users");
    const wordTbody = adminOverviewEl.querySelector(".jw-admin-tbody-words");
    const currentVoteEl = adminOverviewEl.querySelector(".jw-admin-current-vote");
    currentUser = getCurrentUser();

    if (currentUser !== "Divo") {
      currentVoteEl.textContent = "Nur für Admin sichtbar.";
      userTbody.innerHTML = "";
      wordTbody.innerHTML = "";
      return;
    }

    try {
      const res = await fetch(`/api/jugendwort/admin?user=${encodeURIComponent(currentUser)}`);
      const data = await res.json();
      if (!res.ok) {
        currentVoteEl.textContent = data.error || "Fehler bei Admin-Daten.";
        userTbody.innerHTML = "";
        wordTbody.innerHTML = "";
        return;
      }

      const users = data.users || [];
      const wordStats = data.wordStats || [];
      const totalVotes = wordStats.reduce((s, w) => s + (w.votes || 0), 0);
      currentVoteEl.textContent = `Gesamtvotes: ${totalVotes} – User mit Vote: ${users.filter(u => u.jugendwortChoice).length}`;

      // User-Tabelle
      userTbody.innerHTML = "";
      users.forEach(u => {
        const chosen = words.find(w => w.id === u.jugendwortChoice);
        const label = chosen ? chosen.term : (u.jugendwortChoice || "-");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${u.username}</td><td>${label}</td>`;
        userTbody.appendChild(tr);
      });

      // Wort-Tabelle mit Rank
      const ranked = buildRankedWords(wordStats);
      wordTbody.innerHTML = "";
      ranked.forEach(w => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${w.rank}</td><td>${w.term}</td><td>${w.votes}</td>`;
        wordTbody.appendChild(tr);
      });
    } catch (e) {
      console.error("Admin Daten Fehler:", e);
      currentVoteEl.textContent = "Fehler beim Laden.";
      userTbody.innerHTML = "";
      wordTbody.innerHTML = "";
    }
  }

  (async () => {
    await fetchWordsFromServer();
    setupEvents();
    render();
  })();
})();