(function () {
  function init() {
    updateCopyrightYear();
    revealLastUpdated();
    setupContactOverlay();
    setupHeroReel();
    setupShowcaseFilter();
  }

  function updateCopyrightYear() {
    const yearElement = document.getElementById('year');
    if (yearElement) {
      yearElement.textContent = new Date().getFullYear().toString();
    }
  }

  function revealLastUpdated() {
    const targets = Array.from(document.querySelectorAll('[data-last-updated]'));
    if (!targets.length) return;

    const lastModifiedDate = new Date(document.lastModified);
    const isValidDate = !Number.isNaN(lastModifiedDate.getTime());
    if (!isValidDate) {
      targets.forEach(target => target.setAttribute('hidden', ''));
      return;
    }

    let formatted = '';
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      formatted = new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(lastModifiedDate);
    } else {
      const y = lastModifiedDate.getFullYear();
      const m = String(lastModifiedDate.getMonth() + 1).padStart(2, '0');
      const d = String(lastModifiedDate.getDate()).padStart(2, '0');
      formatted = `${y}年${m}月${d}日`;
    }
    const isoDate = lastModifiedDate.toISOString().split('T')[0];

    targets.forEach(target => {
      const valueElement = target.querySelector('.project-update__value');
      if (valueElement instanceof HTMLElement) {
        valueElement.textContent = formatted;
        if (valueElement.tagName === 'TIME') {
          valueElement.setAttribute('datetime', isoDate);
        }
      } else {
        target.textContent = formatted;
      }
      target.removeAttribute('hidden');
    });
  }

  function setupContactOverlay() {
    const overlay = document.getElementById('contactOverlay');
    if (!overlay) return;

    const openers = Array.from(document.querySelectorAll('.js-contact-open'));
    const closeBtn = overlay.querySelector('.js-contact-close');
    let lastFocusedElement = null;

    function openOverlay() {
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.setProperty('overflow', 'hidden');
      if (closeBtn instanceof HTMLElement) {
        closeBtn.focus();
      }
    }

    function closeOverlay() {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.removeProperty('overflow');
      if (lastFocusedElement) {
        lastFocusedElement.focus();
      }
    }

    openers.forEach(btn => btn.addEventListener('click', openOverlay));
    if (closeBtn) {
      closeBtn.addEventListener('click', closeOverlay);
    }

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) {
        event.preventDefault();
        closeOverlay();
      }
    });
  }

  function setupHeroReel() {
    const heroReel = document.querySelector('.hero-reel');
    const heroTrack = heroReel ? heroReel.querySelector('.hero-reel__track') : null;
    if (!heroReel || !heroTrack) return;

    const items = Array.from(heroTrack.children);
    if (!items.length) return;

    items.forEach(item => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      heroTrack.appendChild(clone);
    });

    let loopWidth = heroTrack.scrollWidth / 2;
    let offset = 0;
    let isPaused = false;
    const speed = 0.4;
    let last = performance.now();

    const recalcLoop = () => {
      loopWidth = heroTrack.scrollWidth / 2;
    };

    window.addEventListener('resize', recalcLoop);
    heroReel.addEventListener('mouseenter', () => { isPaused = true; });
    heroReel.addEventListener('mouseleave', () => { isPaused = false; });
    heroReel.addEventListener('focusin', () => { isPaused = true; });
    heroReel.addEventListener('focusout', () => { isPaused = false; });

    function tick(now) {
      const delta = now - last;
      last = now;
      if (!isPaused) {
        offset += (delta * speed) / 16.67;
        if (offset >= loopWidth) {
          offset -= loopWidth;
        }
        heroTrack.style.transform = `translateX(${-offset}px)`;
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function setupShowcaseFilter() {
    const searchInput = document.getElementById('showcaseSearch');
    const categoryChips = Array.from(document.querySelectorAll('.showcase-chip'));
    const showcaseCards = Array.from(document.querySelectorAll('.display-wall .display'));
    if (!searchInput || !categoryChips.length || !showcaseCards.length) {
      return;
    }

    let activeCategory = 'all';
    let searchTerm = '';

    function matchesCategory(type) {
      if (activeCategory === 'all') return true;
      return type === activeCategory;
    }

    function matchesSearch(card) {
      if (!searchTerm) return true;
      const haystack = `${card.dataset.title || ''} ${card.dataset.description || ''}`.toLowerCase();
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

    function applyFilter() {
      showcaseCards.forEach(card => {
        const type = card.dataset.type || 'other';
        const visible = matchesCategory(type) && matchesSearch(card);
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
        applyFilter();
      });
    });

    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      applyFilter();
    });

    applyFilter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
