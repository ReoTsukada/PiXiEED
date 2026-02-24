(function () {
  const viewer = document.getElementById('gameGalleryMain');
  const placeholder = document.getElementById('gameGalleryPlaceholder');
  const buttonsContainer = document.getElementById('gameGalleryButtons');
  const itemsSource = document.getElementById('gameGalleryItems');
  const nameEl = document.getElementById('gameGalleryName');
  const metaEl = document.getElementById('gameGalleryMeta');
  const detailEl = document.getElementById('gameGalleryDetail');
  const linkEl = document.getElementById('gameGalleryLink');
  const updateEl = document.getElementById('gameGalleryUpdate');
  const hubUpdates = document.getElementById('hubUpdates');
  const hubLatest = document.getElementById('hubLatest');
  const LANG = (document.documentElement.getAttribute('lang') || 'ja').toLowerCase();
  const IS_EN = LANG.startsWith('en');
  const I18N = IS_EN
    ? {
        project: 'Project',
        tool: 'Tool',
        game: 'Game',
        updatedPrefix: 'Updated',
        updatePrefix: 'Update',
        updatedOnPrefix: 'Updated on',
        openProject: 'Open this project',
        useTool: 'Use this tool',
        playGame: 'Play this game',
        updatesPending: 'Updates are being prepared.',
        latestPending: 'New picks are being prepared.',
        descPending: 'Description is being prepared.'
      }
    : {
        project: 'プロジェクト',
        tool: 'ツール',
        game: 'ゲーム',
        updatedPrefix: '更新',
        updatePrefix: '更新',
        updatedOnPrefix: '更新日',
        openProject: 'この作品を見る',
        useTool: 'このツールを使う',
        playGame: 'このゲームで遊ぶ',
        updatesPending: '更新情報は準備中です。',
        latestPending: '新着情報は準備中です。',
        descPending: '紹介文を準備中です。'
      };

  if (!itemsSource) {
    return;
  }

  const entries = Array.from(itemsSource.querySelectorAll('li'))
    .map((node, index) => ({
      title: node.getAttribute('data-title') || `Project ${index + 1}`,
      image: node.getAttribute('data-image') || '',
      type: node.getAttribute('data-type') || '',
      desc: node.getAttribute('data-desc') || '',
      updated: node.getAttribute('data-updated') || '',
      update: node.getAttribute('data-update') || '',
      link: node.getAttribute('data-link') || ''
    }))
    .filter(entry => entry.image);

  if (!entries.length) return;

  const normalizePath = (src) => {
    if (!src) return '';
    if (src.startsWith('http') || src.startsWith('data:')) return src;
    return src;
  };

  const buildMeta = (entry) => {
    const typeLabel = entry.type === 'tool' ? I18N.tool : (entry.type === 'game' ? I18N.game : I18N.project);
    const updated = entry.updated ? `${I18N.updatedPrefix}: ${entry.updated}` : '';
    return updated ? `${typeLabel} / ${updated}` : typeLabel;
  };

  const updateLink = (entry) => {
    if (!linkEl) return;
    if (!entry || !entry.link) {
      linkEl.textContent = I18N.openProject;
      linkEl.setAttribute('href', 'tools.html');
      linkEl.hidden = false;
      return;
    }
    linkEl.hidden = false;
    linkEl.setAttribute('href', entry.link);
    if (entry.type === 'tool') {
      linkEl.textContent = I18N.useTool;
      return;
    }
    if (entry.type === 'game') {
      linkEl.textContent = I18N.playGame;
      return;
    }
    linkEl.textContent = I18N.openProject;
  };

  const updateUpdateText = (entry) => {
    if (!updateEl) return;
    const update = entry?.update || '';
    const updated = entry?.updated || '';
    let text = '';
    if (update && updated) {
      text = `${I18N.updatePrefix} (${updated}): ${update}`;
    } else if (update) {
      text = `${I18N.updatePrefix}: ${update}`;
    } else if (updated) {
      text = `${I18N.updatedOnPrefix}: ${updated}`;
    }
    updateEl.textContent = text;
    updateEl.hidden = !text;
  };

  const parseTimestamp = (value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const formatDate = (timestamp, fallback) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return fallback || '';
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  };

  const getTypeLabel = (entry) => {
    if (!entry) return I18N.project;
    if (entry.type === 'tool') return I18N.tool;
    if (entry.type === 'game') return I18N.game;
    return I18N.project;
  };

  const buildUpdateRow = (entry, options = {}) => {
    const row = document.createElement('li');
    row.className = 'project-place__update';
    const time = document.createElement('time');
    const timestamp = parseTimestamp(entry.updated);
    if (entry.updated) {
      time.dateTime = entry.updated;
    }
    time.textContent = formatDate(timestamp, entry.updated);
    const title = entry.link ? document.createElement('a') : document.createElement('strong');
    if (entry.link) {
      title.href = entry.link;
      title.className = 'hub-update__link';
    }
    title.textContent = entry.title || I18N.project;
    const desc = document.createElement('span');
    desc.textContent = options.desc || '';
    row.append(time, title, desc);
    return row;
  };

  const renderHubLists = (sourceEntries) => {
    if (!hubUpdates && !hubLatest) return;
    const sorted = sourceEntries
      .map(entry => ({ ...entry, timestamp: parseTimestamp(entry.updated) }))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (hubUpdates) {
      hubUpdates.innerHTML = '';
      const updates = sorted.filter(entry => entry.update || entry.desc);
      if (!updates.length) {
        const empty = document.createElement('li');
        empty.className = 'project-place__update project-place__update--empty';
        empty.textContent = I18N.updatesPending;
        hubUpdates.appendChild(empty);
      } else {
        updates.slice(0, 4).forEach(entry => {
          const desc = entry.update || entry.desc || '';
          hubUpdates.appendChild(buildUpdateRow(entry, { desc }));
        });
      }
    }

    if (hubLatest) {
      hubLatest.innerHTML = '';
      if (!sorted.length) {
        const empty = document.createElement('li');
        empty.className = 'project-place__update project-place__update--empty';
        empty.textContent = I18N.latestPending;
        hubLatest.appendChild(empty);
      } else {
        sorted.slice(0, 4).forEach(entry => {
          const desc = entry.desc ? `${getTypeLabel(entry)} / ${entry.desc}` : getTypeLabel(entry);
          hubLatest.appendChild(buildUpdateRow(entry, { desc }));
        });
      }
    }
  };

  renderHubLists(entries);

  const canRenderGallery = Boolean(
    viewer &&
    placeholder &&
    buttonsContainer &&
    nameEl &&
    detailEl
  );

  if (!canRenderGallery) {
    return;
  }

  const buttons = entries.map((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dot-gallery__button' + (index === 0 ? ' is-active' : '');
    button.setAttribute('role', 'option');
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.setAttribute('aria-label', entry.title || I18N.project);
    button.dataset.index = String(index);

    const img = document.createElement('img');
    img.src = normalizePath(entry.image);
    img.alt = '';
    img.loading = 'lazy';
    button.appendChild(img);

    button.addEventListener('click', () => {
      selectEntry(entry, button);
    });

    buttonsContainer.appendChild(button);
    return button;
  });

  function selectEntry(entry, activeButton) {
    if (!entry) return;
    viewer.hidden = false;
    viewer.src = normalizePath(entry.image);
    viewer.alt = entry.title || I18N.project;
    placeholder.hidden = true;

    nameEl.textContent = entry.title || I18N.project;
    if (metaEl) {
      metaEl.textContent = buildMeta(entry);
    }
    detailEl.textContent = entry.desc || entry.update || I18N.descPending;
    updateLink(entry);
    updateUpdateText(entry);

    buttons.forEach(btn => {
      const isActive = btn === activeButton;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  selectEntry(entries[0], buttons[0]);
})();
