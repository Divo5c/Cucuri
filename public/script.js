  // ==========================================
  // NEU: Games Menü Toggle Logik
  // ==========================================
  const gamesMenu = document.getElementById('gamesMenu');
  const toggleGamesBtn = document.getElementById('toggleGamesBtn');

  // Menü standardmäßig auf dem Handy einklappen
  if (window.innerWidth <= 768) {
    gamesMenu.classList.add('closed');
  }

  // Auf den Controller/Pfeil klicken
  toggleGamesBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Verhindert, dass das Dokument den Klick bemerkt
    gamesMenu.classList.toggle('closed');
  });

  // Wenn man irgendwo anders auf den Bildschirm klickt -> Menü zu (nur Handy)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && !gamesMenu.classList.contains('closed') && !gamesMenu.contains(e.target)) {
      gamesMenu.classList.add('closed');
    }
  });
