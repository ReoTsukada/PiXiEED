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
    return `${title} ${description} ${difficulty}`;
  }

  const keywords = new Map(playable.map(card => [card, getKeywords(card)]));

  function filterGames() {
    const term = normalize(searchInput.value.trim());
    if (!term) {
      playable.forEach(card => { card.hidden = false; });
      placeholders.forEach(card => { card.hidden = false; });
      return;
    }

    let anyVisible = false;
    playable.forEach(card => {
      const match = keywords.get(card).includes(term);
      card.hidden = !match;
      if (match) anyVisible = true;
    });
    placeholders.forEach(card => { card.hidden = true; });

    if (!anyVisible) {
      // 何も見つからない場合はプレースホルダーを1枚だけ表示
      const firstPlaceholder = placeholders[0];
      if (firstPlaceholder) firstPlaceholder.hidden = false;
    }
  }

  searchInput.addEventListener('input', filterGames);
  filterGames();
})();
