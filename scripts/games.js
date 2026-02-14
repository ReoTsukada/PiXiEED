(function () {
  const searchInput = document.getElementById('gameSearch');
  const cards = Array.from(document.querySelectorAll('.game-grid .ogp-card'));
  if (!searchInput || !cards.length) return;

  const placeholders = cards.filter(card => card.dataset.placeholder === 'true');
  const playable = cards.filter(card => card.dataset.placeholder !== 'true');

  function normalize(text) {
    return (text || '').toString().toLowerCase();
  }

  function getKeywords(card) {
    const title = normalize(card.dataset.title);
    const description = normalize(card.dataset.description);
    const difficulty = normalize(card.dataset.difficulty);
    const aliases = normalize(card.dataset.keywords);
    return `${title} ${description} ${difficulty} ${aliases}`;
  }

  const keywords = new Map(playable.map(card => [card, getKeywords(card)]));

  function filterGames() {
    const term = normalize(searchInput.value.trim());
    let visibleCount = 0;

    playable.forEach(card => {
      const match = !term || keywords.get(card).includes(term);
      card.hidden = !match;
      if (match) {
        visibleCount += 1;
      }
    });

    const placeholderCount = Math.min(
      placeholders.length,
      Math.max(0, 3 - visibleCount)
    );

    placeholders.forEach((card, index) => {
      card.hidden = index >= placeholderCount;
    });
  }

  searchInput.addEventListener('input', filterGames);
  filterGames();
})();
