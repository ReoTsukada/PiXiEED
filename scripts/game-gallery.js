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
    const typeLabel = entry.type === 'tool' ? 'ツール' : (entry.type === 'game' ? 'ゲーム' : 'プロジェクト');
    const updated = entry.updated ? `更新: ${entry.updated}` : '';
    return updated ? `${typeLabel} / ${updated}` : typeLabel;
  };

  const updateLink = (entry) => {
    if (!linkEl) return;
    if (!entry || !entry.link) {
      linkEl.textContent = 'この作品を見る';
      linkEl.setAttribute('href', 'tools.html');
      linkEl.hidden = false;
      return;
    }
    linkEl.hidden = false;
    linkEl.setAttribute('href', entry.link);
    linkEl.textContent = entry.type === 'tool' ? 'このツールを使う' : 'このゲームで遊ぶ';
  };

  const updateUpdateText = (entry) => {
    if (!updateEl) return;
    const update = entry?.update || '';
    const updated = entry?.updated || '';
    let text = '';
    if (update && updated) {
      text = `更新 (${updated}): ${update}`;
    } else if (update) {
      text = `更新: ${update}`;
    } else if (updated) {
      text = `更新日: ${updated}`;
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
    if (!entry) return 'プロジェクト';
    if (entry.type === 'tool') return 'ツール';
    if (entry.type === 'game') return 'ゲーム';
    return 'プロジェクト';
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
    title.textContent = entry.title || 'プロジェクト';
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
        empty.textContent = '更新情報は準備中です。';
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
        empty.textContent = '新着情報は準備中です。';
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
    button.setAttribute('aria-label', entry.title || 'プロジェクト');
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
    viewer.alt = entry.title || 'プロジェクト';
    placeholder.hidden = true;

    nameEl.textContent = entry.title || 'プロジェクト';
    if (metaEl) {
      metaEl.textContent = buildMeta(entry);
    }
    detailEl.textContent = entry.desc || entry.update || '紹介文を準備中です。';
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
