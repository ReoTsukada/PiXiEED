(function () {
  const viewer = document.getElementById('dotGalleryMain');
  const buttonsContainer = document.getElementById('dotGalleryButtons');
  if (!viewer || !buttonsContainer) return;

  const PORTFOLIO_SEEN_STORAGE_KEY = 'pixieed:portfolioSeen';
  const headerPortfolioLink = document.querySelector('.portfolio-nav a[href="#dot-gallery"]');
  let portfolioSeen = loadPortfolioSeenState();

  if (Array.isArray(window.DOT_GALLERY_MANIFEST) && window.DOT_GALLERY_MANIFEST.length) {
    initialize(window.DOT_GALLERY_MANIFEST);
  } else {
    fetch('portfolio/dots/manifest.json', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => initialize(Array.isArray(data) ? data : []))
      .catch(() => initialize([]));
  }

  function initialize(entries) {
    if (!entries.length) {
      entries = [
        {
          file: 'maoitu/ogp.png',
          label: 'Maoitu',
          date: new Date().toISOString().slice(0, 10),
          alt: '魔王様!!いつまでよければいいですか!? のタイトル背景'
        }
      ];
    }

    window.addEventListener('resize', () => fitImage(viewer));
    window.addEventListener('storage', event => {
      if (event.key === PORTFOLIO_SEEN_STORAGE_KEY) {
        portfolioSeen = loadPortfolioSeenState();
        refreshSeenStates(buttons, entries);
        updateHeaderIndicator(entries);
      }
    });

    const buttons = entries.map((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dot-gallery__button' + (index === 0 ? ' is-active' : '');
      const src = entry.file.startsWith('http') || entry.file.startsWith('data:')
        ? entry.file
        : (entry.file.includes('/') ? entry.file : `portfolio/dots/${entry.file}`);
      const thumb = entry.thumb
        ? (entry.thumb.startsWith('http') || entry.thumb.startsWith('data:')
            ? entry.thumb
            : (entry.thumb.includes('/') ? entry.thumb : `portfolio/dots/${entry.thumb}`))
        : src;
      button.dataset.src = src;
      button.dataset.alt = entry.alt || entry.label || '';
      button.setAttribute('aria-label', `${entry.label || entry.file}`);
      button.addEventListener('click', () => selectArtwork(buttons, button, entries));
      const preview = document.createElement('img');
      preview.src = thumb;
      preview.alt = '';
      preview.loading = 'lazy';
      button.appendChild(preview);
      applyButtonSeenState(button, entry, index);
      buttonsContainer.appendChild(button);
      return button;
    });

    selectArtwork(buttons, buttons[0], entries);
    updateHeaderIndicator(entries);
  }

  function selectArtwork(allButtons, button, entries) {
    if (!button) return;
    const index = allButtons.indexOf(button);
    const entry = Array.isArray(entries) ? entries[index] : null;
    const src = button.dataset.src;
    const alt = button.dataset.alt;
    viewer.src = src;
    viewer.alt = alt;
    if (viewer.complete) {
      fitImage(viewer);
    } else {
      viewer.addEventListener('load', () => fitImage(viewer), { once: true });
    }
    allButtons.forEach((btn, idx) => {
      btn.classList.toggle('is-active', btn === button);
      if (entry && idx === index) {
        markPortfolioSeen(entry, idx);
        applyButtonSeenState(btn, entry, idx);
      }
    });
    updateHeaderIndicator(entries);
  }

  function fitImage(img) {
    if (!img) return;
    img.style.transform = 'none';
    img.style.width = '100%';
    img.style.height = 'auto';
  }

  function getEntryId(entry, index) {
    if (!entry) return '';
    if (entry.id) return entry.id;
    if (entry.label) return `label:${entry.label}`;
    if (entry.file) return `file:${entry.file}`;
    if (Number.isFinite(index)) return `entry-${index + 1}`;
    return '';
  }

  function loadPortfolioSeenState() {
    try {
      const raw = window.localStorage.getItem(PORTFOLIO_SEEN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function persistPortfolioSeenState() {
    try {
      window.localStorage.setItem(PORTFOLIO_SEEN_STORAGE_KEY, JSON.stringify(portfolioSeen || {}));
    } catch (error) {
      // ignore
    }
  }

  function isPortfolioSeen(entryId) {
    if (!entryId || !portfolioSeen) return false;
    return Boolean(portfolioSeen[entryId]);
  }

  function markPortfolioSeen(entry, index) {
    const entryId = getEntryId(entry, index);
    if (!entryId || isPortfolioSeen(entryId)) {
      return;
    }
    portfolioSeen = {
      ...(portfolioSeen || {}),
      [entryId]: true
    };
    persistPortfolioSeenState();
  }

  function applyButtonSeenState(button, entry, index) {
    if (!button) return;
    const entryId = getEntryId(entry, index);
    if (entryId && !isPortfolioSeen(entryId)) {
      button.setAttribute('data-unseen', 'true');
    } else {
      button.removeAttribute('data-unseen');
    }
  }

  function refreshSeenStates(buttons, entries) {
    if (!Array.isArray(buttons) || !Array.isArray(entries)) return;
    buttons.forEach((button, index) => applyButtonSeenState(button, entries[index], index));
  }

  function updateHeaderIndicator(entries) {
    if (!headerPortfolioLink) return;
    const hasUnseen = Array.isArray(entries)
      ? entries.some((entry, index) => {
          const entryId = getEntryId(entry, index);
          return entryId && !isPortfolioSeen(entryId);
        })
      : false;
    if (hasUnseen) {
      headerPortfolioLink.setAttribute('data-unseen', 'true');
    } else {
      headerPortfolioLink.removeAttribute('data-unseen');
    }
  }
})();
