(function () {
  const yearElement = document.getElementById("year");
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear().toString();
  }

  const searchInput = document.getElementById('showcaseSearch');
  const categoryChips = Array.from(document.querySelectorAll('.showcase-chip'));
  const showcaseCards = Array.from(document.querySelectorAll('.display-wall .display'));
  const heroReel = document.querySelector('.hero-reel');
  const heroTrack = heroReel ? heroReel.querySelector('.hero-reel__track') : null;

  if (heroReel && heroTrack) {
    const heroItems = Array.from(heroTrack.children);
    if (heroItems.length) {
      heroItems.forEach(item => {
        const clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        heroTrack.appendChild(clone);
      });

      let loopWidth = heroTrack.scrollWidth / 2;
      let offset = 0;
      let isPaused = false;
      const speed = 0.4;

      const recalcLoop = () => {
        loopWidth = heroTrack.scrollWidth / 2;
      };

      window.addEventListener('resize', () => {
        recalcLoop();
      });

      heroReel.addEventListener('mouseenter', () => { isPaused = true; });
      heroReel.addEventListener('mouseleave', () => { isPaused = false; });
      heroReel.addEventListener('focusin', () => { isPaused = true; });
      heroReel.addEventListener('focusout', () => { isPaused = false; });

      let last = performance.now();
      function tick(now) {
        const delta = now - last;
        last = now;
        if (!isPaused) {
          offset += (delta * speed) / 16.67; // normalize to ~60fps
          if (offset >= loopWidth) {
            offset -= loopWidth;
          }
          heroTrack.style.transform = `translateX(${-offset}px)`;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }

  if (!searchInput || categoryChips.length === 0 || showcaseCards.length === 0) {
    return;
  }

  let activeCategory = 'all';
  let searchTerm = '';

  function matchesCategory(cardType) {
    if (activeCategory === 'all') return true;
    return cardType === activeCategory;
  }

  function matchesSearch(card) {
    if (!searchTerm) return true;
    const title = card.dataset.title || '';
    const desc = card.dataset.description || '';
    const haystack = `${title} ${desc}`.toLowerCase();
    return haystack.includes(searchTerm);
  }

  function updateDifficultyBadge(card) {
    const difficulty = Number(card.dataset.difficulty || '0');
    const scale = card.querySelectorAll('.display__difficulty-scale span');
    const value = card.querySelector('.display__difficulty-value');
    scale.forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < difficulty);
    });
    if (value) {
      value.textContent = difficulty.toString();
    }
  }

  function applyShowcaseFilter() {
    showcaseCards.forEach(card => {
      const type = card.dataset.type || 'other';
      let visible = matchesCategory(type) && matchesSearch(card);
      if (type === 'ad') {
        visible = matchesSearch(card); // 広告は常に表示する（検索一致時のみ制御）
      }
      updateDifficultyBadge(card);
      card.style.display = visible ? '' : 'none';
    });
  }

  categoryChips.forEach(chip => {
    chip.addEventListener('click', () => {
      activeCategory = chip.dataset.category || 'all';
      categoryChips.forEach(btn => {
        const isActive = btn === chip;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      applyShowcaseFilter();
    });
  });

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    applyShowcaseFilter();
  });
})();
