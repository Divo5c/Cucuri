// Jugendwort Voting Script
(() => {
  const STORAGE_KEY_WORDS = "jw_words_v1";
  const STORAGE_KEY_VOTES = "jw_votes_v1";

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

  let words = [];
  let voteHistory = new Set();

  function loadVoteHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VOTES);
      voteHistory = raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      voteHistory = new Set();
    }
  }

  function saveVoteHistory() {
    try {
      localStorage.setItem(STORAGE_KEY_VOTES, JSON.stringify([...voteHistory]));
    } catch {
      // ignore
    }
  }

  function loadWords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_WORDS);
      if (raw) {
        words = JSON.parse(raw);
        return Promise.resolve();
      }
    } catch {
      // ignore and fall back to JSON
    }

    return fetch("jw-data.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        words = Array.isArray(data) ? data : [];
      })
      .catch(() => {
        words = [];
      });
  }

  function saveWords() {
    try {
      localStorage.setItem(STORAGE_KEY_WORDS, JSON.stringify(words));
    } catch {
      // ignore
    }
  }

  function voteFor(id) {
    if (voteHistory.has(id)) return;

    const entry = words.find((w) => w.id === id);
    if (!entry) return;

    entry.votes = (entry.votes || 0) + 1;
    voteHistory.add(id);
    saveWords();
    saveVoteHistory();
    render();
  }

  function render() {
    const search = (searchEl?.value || "").trim().toLowerCase();
    const sort = sortEl?.value || "votes-desc";

    let visible = [...words];

    if (search) {
      visible = visible.filter((w) => {
        const base = `${w.term || ""} ${w.meaning || ""} ${(w.tags || []).join(" ")}`.toLowerCase();
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
      if (sort === "newest") {
        return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
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
      const alreadyVoted = voteHistory.has(w.id);
      const rankClass =
        idx === 0 ? "jw-rank-1" : idx === 1 ? "jw-rank-2" : idx === 2 ? "jw-rank-3" : "";

      const card = document.createElement("article");
      card.className = `jw-card ${rankClass}`;

      const dateObj = w.date ? new Date(w.date) : null;
      const dateStr = dateObj ? dateObj.toLocaleDateString("de-DE") : "";

      const tagsHtml = (w.tags || [])
        .map((t) => `<span class="jw-tag">${escapeHtml(t)}</span>`)
        .join("");

      card.innerHTML = `
        <div class="jw-card-header">
          <h3 class="jw-term">
            <span class="jw-term-main">${escapeHtml(w.term || "")}</span>
            <span class="jw-term-secondary">#${idx + 1}</span>
          </h3>
          <span class="jw-badge-rank">Rank ${idx + 1}</span>
        </div>
        <p class="jw-meaning">${escapeHtml(w.meaning || "")}</p>
        ${
          w.example
            ? `<p class="jw-example">„${escapeHtml(w.example)}“</p>`
            : ""
        }
        <div class="jw-meta-row">
          <span>${w.author ? `von ${escapeHtml(w.author)}` : ""}${
        dateStr ? (w.author ? " · " : "") + dateStr : ""
      }</span>
          <div class="jw-tags">${tagsHtml}</div>
        </div>
        <div class="jw-meta-row">
          <span class="jw-vote-count">${votes} Vote${votes === 1 ? "" : "s"}</span>
          <div class="jw-vote-area">
            <button
              class="jw-btn jw-vote-btn"
              data-id="${encodeURIComponent(w.id)}"
              ${alreadyVoted ? "disabled" : ""}
            >
              ${alreadyVoted ? "Schon gevotet" : "Vote geben"}
            </button>
          </div>
        </div>
      `;

      listEl.appendChild(card);
    });

    listEl.querySelectorAll(".jw-vote-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = decodeURIComponent(btn.getAttribute("data-id"));
        voteFor(id);
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

  function uuid() {
    return "jw-" + crypto.randomUUID();
  }

  function setupEvents() {
    searchEl?.addEventListener("input", () => render());
    sortEl?.addEventListener("change", () => render());

    adminToggleBtn?.addEventListener("click", () => {
      const isHidden = adminPanel.classList.contains("jw-hidden");
      adminPanel.classList.toggle("jw-hidden", !isHidden);
      adminToggleBtn.textContent = isHidden ? "Admin verstecken" : "Admin anzeigen";
    });

    addForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(addForm);
      const term = (data.get("term") || "").toString().trim();
      const meaning = (data.get("meaning") || "").toString().trim();
      const example = (data.get("example") || "").toString().trim();
      const author = (data.get("author") || "").toString().trim();
      const tagsStr = (data.get("tags") || "").toString().trim();

      if (!term || !meaning) return;

      const nowIso = new Date().toISOString();
      const tags = tagsStr
        ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      words.push({
        id: uuid(),
        term,
        meaning,
        example: example || "",
        author: author || "",
        date: nowIso,
        tags,
        votes: 0
      });

      saveWords();
      addForm.reset();
      render();
    });

    exportBtn?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(words, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "jugendwoerter-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    importInput?.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!Array.isArray(parsed)) return;
          words = parsed;
          saveWords();
          render();
        } catch {
          // invalid JSON
        }
      };
      reader.readAsText(file, "utf-8");
      // reset input so same file can be chosen again
      importInput.value = "";
    });

    clearBtn?.addEventListener("click", () => {
      if (!confirm("Alle lokalen Jugendwörter löschen? (localStorage)")) return;
      words = [];
      voteHistory = new Set();
      localStorage.removeItem(STORAGE_KEY_WORDS);
      localStorage.removeItem(STORAGE_KEY_VOTES);
      render();
    });
  }

  // Init
  loadVoteHistory();
  loadWords().then(() => {
    setupEvents();
    render();
  });
})();