// Jugendwort Voting Script – Mongo-Backend, Vote änderbar, Admin nur für eingeloggt "Divo"
(() => {
  const listEl = document.getElementById("jw-list");
  const emptyEl = document.getElementById("jw-empty");
  const searchEl = document.getElementById("jw-search");
  const sortEl = document.getElementById("jw-sort");
  const adminToggleBtn = document.getElementById("jw-toggle-admin");
  const adminPanel = document.getElementById("jw-admin-panel");
  const addForm = document.getElementById("jw-add-form");
  const exportBtn = document.getElementById("jw-export");
  const importInput = document.getElementById("jw-import");
  const clearBtn = document.getElementById("jw-clear");

  let adminOverviewEl;

  let words = [];
  let currentChoice = null; // aktueller Vote des Users laut Server
  let currentUser = null;   // Username aus localStorage

  function getCurrentUser() {
    try {
      const u = localStorage.getItem("cucuri_username");
      return u && u.trim() ? u.trim() : null;
    } catch {
      return null;
    }
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
      console.error("Fehler beim Laden der Jugendwörter:", e);
      words = [];
      currentChoice = null;
    }
  }

  async function sendVoteToServer(id) {
    currentUser = getCurrentUser();
    if (!currentUser) {
      alert("Bitte im Chat einloggen, bevor du votest.");
      return;
    }

    const url = `/api/jugendwort/vote?user=${encodeURIComponent(currentUser)}`;

    try {
      const res = await fetch(url, {
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
    } catch (e) {
      console.error("Voting-Fehler:", e);
      alert("Serverfehler beim Voting.");
    }
  }

  function render() {
    const search = (searchEl?.value || "").trim().toLowerCase();
    const sort = sortEl?.value || "votes-desc";

    let visible = [...words];

    if (search) {
      visible = visible.filter((w) => {
        const base = `${w.term || ""} ${w.meaning || ""}`.toLowerCase();
        return base.includes(search);
      });
    }

    visible.sort((a, b) => {
      if (sort === "alpha-asc") {
        return (a.term || "").localeCompare(b.term || "");
      }
      if (sort === "alpha-desc") {
        return (b.term || "").localeCompare(a.term || "");
      }
      const va = a.votes || 0;
      const vb = b.votes || 0;
      return vb - va;
    });

    listEl.innerHTML = "";

    if (!visible.length) {
      emptyEl.classList.remove("jw-hidden");
      return;
    }
    emptyEl.classList.add("jw-hidden");

    visible.forEach((w, idx) => {
      const votes = w.votes || 0;
      const isChosen = currentChoice === w.id;
      const rankClass =
        idx === 0 ? "jw-rank-1" : idx === 1 ? "jw-rank-2" : idx === 2 ? "jw-rank-3" : "";

      const card = document.createElement("article");
      card.className = `jw-card ${rankClass}`;

      const btnText = isChosen ? "Gewählt (ändern)" : "Vote geben";

      card.innerHTML = `
        <div class="jw-card-header">
          <h3 class="jw-term">
            <span class="jw-term-main">${escapeHtml(w.term || "")}</span>
            <span class="jw-term-secondary">#${idx + 1}</span>
          </h3>
          <span class="jw-badge-rank">Rank ${idx + 1}</span>
        </div>
        <p class="jw-meaning">${escapeHtml(w.meaning || "")}</p>
        <div class="jw-meta-row">
          <span></span>
          <div class="jw-tags"></div>
        </div>
        <div class="jw-meta-row">
          <span class="jw-vote-count">${votes} Vote${votes === 1 ? "" : "s"}</span>
          <div class="jw-vote-area">
            <button
              class="jw-btn jw-vote-btn"
              data-id="${encodeURIComponent(w.id)}"
            >
              ${btnText}
            </button>
          </div>
        </div>
      `;

      listEl.appendChild(card);
    });

    listEl.querySelectorAll(".jw-vote-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = decodeURIComponent(btn.getAttribute("data-id"));
        sendVoteToServer(id);
      });
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setupEvents() {
    searchEl?.addEventListener("input", () => render());
    sortEl?.addEventListener("change", () => render());

    // Admin-Toggle nur einblenden, wenn Divo eingeloggt ist
    currentUser = getCurrentUser();
    if (currentUser === "Divo") {
      adminToggleBtn?.classList.remove("jw-hidden");
      adminPanel?.classList.add("jw-hidden");

      adminToggleBtn?.addEventListener("click", () => {
        const isHidden = adminPanel.classList.contains("jw-hidden");
        adminPanel.classList.toggle("jw-hidden", !isHidden);
        adminToggleBtn.textContent = isHidden ? "Admin verstecken" : "Admin anzeigen";
        if (isHidden) updateAdminOverview();
      });
    } else {
      // niemand anderes sieht das Admin-Panel
      adminPanel?.classList.add("jw-hidden");
      adminToggleBtn?.classList.add("jw-hidden");
    }

    // Admin-Form deaktiviert (Wörter kommen aus server.js)
    addForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      alert("Wörter kommen aus JUGENDWORT_WORDS im server.js.");
    });

    exportBtn?.addEventListener("click", () => {
      alert("Export ist in der Mongo-Version aktuell deaktiviert.");
    });

    importInput?.addEventListener("change", () => {
      alert("Import ist in der Mongo-Version aktuell deaktiviert.");
      importInput.value = "";
    });

    clearBtn?.addEventListener("click", () => {
      alert("Löschen geht nur im Backend (Mongo), nicht im Browser.");
    });

    setupAdminOverview();
  }

  function setupAdminOverview() {
    adminOverviewEl = document.createElement("div");
    adminOverviewEl.className = "jw-admin-overview";
    adminOverviewEl.innerHTML = `
      <hr style="margin: 0.8rem 0; border-color: rgba(255,255,255,0.2);" />
      <h3>Admin-Übersicht</h3>
      <p class="jw-admin-current-vote"></p>
      <div class="jw-admin-table-wrap">
        <table class="jw-admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Gewähltes Wort</th>
            </tr>
          </thead>
          <tbody class="jw-admin-tbody"></tbody>
        </table>
      </div>
    `;
    adminPanel.appendChild(adminOverviewEl);
  }

  async function updateAdminOverview() {
    if (!adminOverviewEl) return;

    const currentVoteEl = adminOverviewEl.querySelector(".jw-admin-current-vote");
    const tbody = adminOverviewEl.querySelector(".jw-admin-tbody");

    const adminUser = getCurrentUser();
    if (adminUser !== "Divo") {
      // Sicherheitscheck: falls jemand den Button irgendwie sichtbar macht
      currentVoteEl.textContent = "Nur für Admin (Divo) sichtbar.";
      tbody.innerHTML = "";
      return;
    }

    try {
      const res = await fetch(`/api/jugendwort/admin?user=${encodeURIComponent(adminUser)}`);
      const data = await res.json();
      if (!res.ok) {
        currentVoteEl.textContent = data.error || "Fehler beim Laden der Admin-Daten.";
        tbody.innerHTML = "";
        return;
      }

      const users = data.users || [];
      const wordStats = data.wordStats || [];

      const totalVotes = wordStats.reduce((sum, w) => sum + (w.votes || 0), 0);
      currentVoteEl.textContent = `Gesamtvotes: ${totalVotes} – User mit Vote: ${users.filter(u => u.jugendwortChoice).length}`;

      tbody.innerHTML = "";
      users.forEach((u) => {
        const chosen = words.find(w => w.id === u.jugendwortChoice);
        const label = chosen ? chosen.term : (u.jugendwortChoice || "-");

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(u.username)}</td>
          <td>${escapeHtml(label)}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error("Admin-Daten Fehler:", e);
      currentVoteEl.textContent = "Fehler beim Laden der Admin-Daten.";
      tbody.innerHTML = "";
    }
  }

  // Init
  (async () => {
    await fetchWordsFromServer();
    setupEvents();
    render();
    // Admin-Overview wird beim Öffnen des Panels geholt
  })();
})();