(function () {
  const viewer = document.getElementById('dotGalleryMain');
  const buttonsContainer = document.getElementById('dotGalleryButtons');
  if (!viewer || !buttonsContainer) return;

  const PORTFOLIO_SEEN_STORAGE_KEY = 'pixieed:portfolioSeen';
  const headerPortfolioLink = document.querySelector('.portfolio-nav a[href="#dot-gallery"]');
  const assetBase = normalizeBasePath(
    buttonsContainer.dataset.assetBase ||
    viewer.dataset.assetBase ||
    'portfolio/dots/'
  );
  const manifestPath =
    buttonsContainer.dataset.manifestPath ||
    viewer.dataset.manifestPath ||
    'portfolio/dots/manifest.json';
  let portfolioSeen = loadPortfolioSeenState();

  if (Array.isArray(window.DOT_GALLERY_MANIFEST) && window.DOT_GALLERY_MANIFEST.length) {
    initialize(window.DOT_GALLERY_MANIFEST);
  } else {
    fetch(manifestPath, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => initialize(Array.isArray(data) ? data : []))
      .catch(() => initialize([]));
  }

  function initialize(entries) {
    if (!entries.length) {
      entries = [
        {
          file: 'icon/icon-192-4.png',
          label: 'PiXiEEDraw',
          date: new Date().toISOString().slice(0, 10),
          alt: 'PiXiEEDraw'
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
      const src = resolveAssetPath(entry.file);
      const thumb = entry.thumb
        ? resolveAssetPath(entry.thumb)
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
    const frame = img.parentElement;
    const isMobile = window.matchMedia('(max-width: 720px)').matches;

    img.dataset.pixelArtFit = 'off';
    if (frame) {
      frame.style.position = 'relative';
      frame.style.overflow = 'hidden';
    }
    img.style.position = 'absolute';
    img.style.inset = 'auto';
    img.style.top = '50%';
    img.style.left = '50%';
    img.style.right = 'auto';
    img.style.bottom = 'auto';
    img.style.margin = '0';
    img.style.transform = 'translate(-50%, -50%)';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center';
    if (isMobile) {
      img.style.width = '100%';
      img.style.height = '100%';
      return;
    }
    img.style.width = 'auto';
    img.style.height = '100%';
  }

  function normalizeBasePath(value) {
    const base = String(value || '').trim();
    if (!base) return '';
    return base.endsWith('/') ? base : `${base}/`;
  }

  function resolveAssetPath(file) {
    const source = String(file || '').trim();
    if (!source) return '';
    if (/^(?:https?:)?\/\//.test(source) || source.startsWith('data:') || source.startsWith('/')) {
      return source;
    }
    if (source.startsWith('./') || source.startsWith('../') || source.includes('/')) {
      return source;
    }
    return assetBase ? `${assetBase}${source}` : source;
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
