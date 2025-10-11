
(function () {
  const fallbackConfig = { hero: [], showcase: null, footer: [] };

  function init(adConfigInput) {
    const adConfig = adConfigInput && typeof adConfigInput === 'object' ? adConfigInput : fallbackConfig;
    const heroAds = Array.isArray(adConfig.hero) ? adConfig.hero.filter(Boolean) : [];
    const showcaseAd = adConfig.showcase || null;
    const footerAds = Array.isArray(adConfig.footer) ? adConfig.footer.filter(Boolean) : [];

  const yearElement = document.getElementById("year");
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear().toString();
  }

  const searchInput = document.getElementById('showcaseSearch');
  const categoryChips = Array.from(document.querySelectorAll('.showcase-chip'));
  const showcaseContainer = document.querySelector('.display-wall');
  let showcaseCards = Array.from(document.querySelectorAll('.display-wall .display'));
  const heroReel = document.querySelector('.hero-reel');
  const heroTrack = heroReel ? heroReel.querySelector('.hero-reel__track') : null;
  const contactOverlay = document.getElementById('contactOverlay');
  const contactOpeners = Array.from(document.querySelectorAll('.js-contact-open'));
  const contactCloseBtn = contactOverlay ? contactOverlay.querySelector('.js-contact-close') : null;
  const footerAdGrid = document.querySelector('.ad-grid');

  let lastFocusedElement = null;

  function createHeroAdCard(item) {
    if (!item || !item.image || !heroTrack) return null;
    const hasLink = Boolean(item.link);
    const wrapper = document.createElement(hasLink ? 'a' : 'div');
    wrapper.className = 'hero-card hero-card--ad';
    wrapper.setAttribute('role', 'listitem');
    if (hasLink) {
      wrapper.href = item.link;
      wrapper.target = '_blank';
      wrapper.rel = 'noopener';
    }
    const badge = item.tag || 'スポンサー';
    wrapper.innerHTML = `
      <figure>
        <img src="${item.image}" alt="${item.alt || item.title || 'スポンサー広告'}" loading="lazy">
        <figcaption>
          <span class="hero-card__tag">${badge}</span>
          <strong>${item.title || ''}</strong>
          <p>${item.description || ''}</p>
        </figcaption>
      </figure>
    `;
    return wrapper;
  }

  function createShowcaseAdCard(item) {
    if (!item || !showcaseContainer) return null;
    const article = document.createElement('article');
    article.className = 'display display--ad';
    article.setAttribute('role', 'listitem');
    article.dataset.type = 'ad';
    article.dataset.title = item.title || '';
    article.dataset.description = item.description || '';

    const linkTag = document.createElement(item.link ? 'a' : 'div');
    linkTag.classList.add('display__link');
    if (item.link) {
      linkTag.href = item.link;
      linkTag.target = '_blank';
      linkTag.rel = 'noopener';
    }

    linkTag.innerHTML = `
      <span class="display__badge display__badge--ad">${item.badge || 'Sponsor'}</span>
      <div class="display__frame">
        <div class="display__screen display__screen--image">
          ${item.image ? `<img src="${item.image}" alt="${item.alt || item.title || 'スポンサー広告'}">` : '<div class="display__screen placeholder ad">Sponsor</div>'}
        </div>
      </div>
      <div class="display__body">
        <h3 class="display__title">${item.title || ''}</h3>
        <p class="display__description">${item.description || ''}</p>
      </div>
    `;

    article.appendChild(linkTag);
    return article;
  }

  function createFooterAdSlot(item) {
    if (!item || !footerAdGrid) return null;
    const hasLink = Boolean(item.link);
    const slot = document.createElement(hasLink ? 'a' : 'div');
    slot.className = 'ad-slot ad-slot--filled';
    if (hasLink) {
      slot.href = item.link;
      slot.target = '_blank';
      slot.rel = 'noopener';
    }

    if (item.image) {
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.alt || item.label || 'スポンサー広告';
      img.loading = 'lazy';
      slot.appendChild(img);
    } else if (item.label) {
      slot.textContent = item.label;
    }
    return slot;
  }

  function openContactOverlay() {
    if (!contactOverlay) return;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    contactOverlay.hidden = false;
    contactOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.setProperty('overflow', 'hidden');
    if (contactCloseBtn) {
      contactCloseBtn.focus();
    }
  }

  function closeContactOverlay() {
    if (!contactOverlay) return;
    contactOverlay.hidden = true;
    contactOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.removeProperty('overflow');
    if (lastFocusedElement) {
      lastFocusedElement.focus();
    }
  }

  if (contactOverlay) {
    contactOpeners.forEach(btn => btn.addEventListener('click', openContactOverlay));
    if (contactCloseBtn) {
      contactCloseBtn.addEventListener('click', closeContactOverlay);
    }
    contactOverlay.addEventListener('click', (event) => {
      if (event.target === contactOverlay) {
        closeContactOverlay();
      }
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !contactOverlay.hidden) {
        event.preventDefault();
        closeContactOverlay();
      }
    });
  }

  if (heroTrack && heroAds.length) {
    heroAds.slice(0, 3).forEach(ad => {
      const card = createHeroAdCard(ad);
      if (card) {
        heroTrack.appendChild(card);
      }
    });
  }

  if (showcaseAd && showcaseContainer) {
    const adCard = createShowcaseAdCard(showcaseAd);
    if (adCard) {
      showcaseContainer.appendChild(adCard);
      showcaseCards.push(adCard);
    }
  }

  if (footerAdGrid && footerAds.length) {
    footerAds.slice(0, 3).forEach(ad => {
      const slot = createFooterAdSlot(ad);
      if (slot) {
        footerAdGrid.appendChild(slot);
      }
    });
    if (footerAdGrid.children.length) {
      footerAdGrid.hidden = false;
    }
  }

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
  }

  const ready = window.PiXiEED_ADS_READY instanceof Promise
    ? window.PiXiEED_ADS_READY
    : Promise.resolve(window.PiXiEED_ADS || fallbackConfig);

  ready
    .then(config => init(config))
    .catch(() => init(fallbackConfig));
})();
