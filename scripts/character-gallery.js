(function () {
  const viewer = document.getElementById('characterGalleryMain');
  const placeholder = document.getElementById('characterGalleryPlaceholder');
  const placeholderMeta = document.getElementById('characterPlaceholderMeta');
  const buttonsContainer = document.getElementById('characterGalleryButtons');
  const headerCharacterLink = document.querySelector('.portfolio-nav a[href="#character-intro"]');
  const nameEl = document.getElementById('characterGalleryName');
  const weightEl = document.getElementById('characterGalleryWeight');
  const detailEl = document.getElementById('characterGalleryDetail');
  const traitsEl = document.getElementById('characterTraits');
  const detailsEl = document.getElementById('characterPreviewDetails');

  if (
    !viewer ||
    !placeholder ||
    !buttonsContainer ||
    !nameEl ||
    !weightEl ||
    !detailEl ||
    !traitsEl ||
    !detailsEl
  ) {
    return;
  }

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const typingControllers = new Map();
  const DEFAULT_IMAGE_SCALE = 0.7;
  const CHARACTER_SEEN_STORAGE_KEY = 'pixieed:characterGallerySeen';
  const SECRET_UNLOCK_STORAGE_KEY = 'pixieed:secret-unlocks';
  const SECRET_UNLOCK_EVENT_NAME = 'pixiePet:secretUnlocked';
  const PLACEHOLDER_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  const manifestEntries = getManifest();
  if (!manifestEntries.length) {
    return;
  }

  const initialCharacterId = getInitialCharacterId();
  let seenCharacters = loadSeenCharacterState();
  let secretUnlocks = loadSecretUnlockState();
  const displayEntries = manifestEntries.map(entry => getDisplayEntry(entry));
  const buttons = displayEntries.map((entry, index) => createButton(entry, index));
  let currentCharacterId = null;

  const initialIndex = manifestEntries.findIndex(entry => entry.id === initialCharacterId);
  if (initialIndex >= 0) {
    selectCharacter(displayEntries[initialIndex], buttons[initialIndex], { updateUrl: false });
  } else {
    selectCharacter(displayEntries[0], buttons[0], { updateUrl: false });
  }
  updateHeaderIndicator();
  announceUnseenCharacters({ autoHide: true, duration: 4200 });
  window.PIXIEED_CHARACTER_GALLERY = {
    hasUnseenCharacters: () => getUnseenEntries().length > 0,
    getUnseenCharacterCount: () => getUnseenEntries().length,
    announceUnseenCharacters
  };

  window.addEventListener('storage', handleStorageEvent);
  window.addEventListener(SECRET_UNLOCK_EVENT_NAME, event => {
    const entryId = event?.detail?.id;
    if (!entryId) return;
    markSecretUnlocked(entryId);
    refreshSecretEntry(entryId);
  });

  function selectCharacter(entry, activeButton, options = {}) {
    const { updateUrl = false, markViewed = false } = options;
    if (!entry) return;
    currentCharacterId = entry.id || null;
    const src = normalizePath(entry.file);
    const isSilhouette = isSilhouetteEntry(entry);
    if (src) {
      viewer.hidden = false;
      viewer.src = src;
      viewer.alt = `${entry.name || 'キャラクター'}のドットプレビュー`;
      if (isSilhouette) {
        viewer.dataset.silhouette = 'true';
      } else {
        delete viewer.dataset.silhouette;
      }
      placeholder.hidden = true;
      if (placeholderMeta) {
        placeholderMeta.textContent = '';
      }
    } else {
      viewer.hidden = true;
      viewer.removeAttribute('src');
      delete viewer.dataset.silhouette;
      placeholder.hidden = false;
      if (placeholderMeta) {
        placeholderMeta.textContent = entry.status
          ? `${entry.status} / PNG未配置`
          : 'PNG未配置';
      }
    }

    typeText(nameEl, entry.name || 'キャラクター（仮）');
    typeText(weightEl, `重さ: ${entry.weight || '調整中'}`);
    typeText(detailEl, entry.detail || entry.background || entry.description || '詳細メモを準備中');
    applyScale(DEFAULT_IMAGE_SCALE);
    if (traitsEl) {
      traitsEl.innerHTML = '';
      const traits = Array.isArray(entry.traits) && entry.traits.length ? entry.traits : ['特徴メモを準備中'];
      traits.forEach(trait => {
        const li = document.createElement('li');
        traitsEl.appendChild(li);
        typeText(li, trait);
      });
    }

    if (Array.isArray(buttons)) {
      buttons.forEach(btn => {
        const isActive = btn === activeButton;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    adjustDetailsScale();
    if (updateUrl) {
      syncCharacterParam(entry.id);
    }

    if (markViewed) {
      const index = manifestEntries.findIndex(item => item.id === entry.id);
      const entryId = entry.id || (index >= 0 ? getEntryId(entry, index) : null);
      if (entryId) {
        markCharacterSeen(entryId);
      }
    }
    updateHeaderIndicator();
  }

  function createButton(entry, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'character-sprite' + (index === 0 ? ' is-active' : '');
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.setAttribute('role', 'option');
    button.dataset.entryIndex = String(index);

    const img = document.createElement('img');
    const label = document.createElement('span');
    button._pixieImageEl = img;
    button._pixieLabelEl = label;

    button.appendChild(img);
    button.appendChild(label);
    applyEntryToButton(button, entry, index);

    button.addEventListener('click', () => {
      const nextEntry = displayEntries[index];
      selectCharacter(nextEntry, button, { updateUrl: true, markViewed: true });
    });
    buttonsContainer.appendChild(button);
    return button;
  }

  function applyEntryToButton(button, entry, index) {
    if (!button || !entry) return;
    const labelText = entry.buttonLabel || entry.name || `Character ${index + 1}`;
    const entryId = getEntryId(entry, index);
    const seen = isCharacterSeen(entryId);
    button.setAttribute('data-character-id', entryId);
    button.setAttribute('aria-label', `${labelText} を表示${seen ? '' : '（新着）'}`);

    const img = button._pixieImageEl || button.querySelector('img');
    if (img) {
      const src = normalizePath(entry.file);
      img.src = src || PLACEHOLDER_IMG;
      img.alt = `${entry.name || 'キャラクター'}のドット絵`;
      img.loading = 'lazy';
      if (isSilhouetteEntry(entry)) {
        img.dataset.silhouette = 'true';
      } else {
        delete img.dataset.silhouette;
      }
    }
    const label = button._pixieLabelEl || button.querySelector('span');
    if (label) {
      label.textContent = labelText;
    }
    if (seen) {
      button.removeAttribute('data-unseen');
    } else {
      button.setAttribute('data-unseen', 'true');
    }
  }

  function applyScale(scaleValue) {
    const scale = typeof scaleValue === 'number' ? scaleValue : DEFAULT_IMAGE_SCALE;
    if (viewer) {
      viewer.style.setProperty('--character-image-scale', scale);
    }
    const frame = viewer?.parentElement;
    if (frame) {
      frame.style.setProperty('--character-image-scale', scale);
    }
  }

  function typeText(element, text) {
    if (!element) return;
    const content = typeof text === 'string' ? text : '';

    if (reduceMotionQuery.matches) {
      element.textContent = content;
      return;
    }

    stopTyping(element);
    const chars = Array.from(content);
    let index = 0;
    element.textContent = '';

    if (!chars.length) {
      return;
    }

    const step = () => {
      if (index >= chars.length) {
        typingControllers.delete(element);
        return;
      }
      element.textContent += chars[index++];
      const delay = Math.random() * 25 + 15;
      typingControllers.set(element, window.setTimeout(step, delay));
    };

    step();
  }

  function stopTyping(element) {
    const controller = typingControllers.get(element);
    if (controller) {
      clearTimeout(controller);
      typingControllers.delete(element);
    }
  }

  function syncCharacterParam(characterId) {
    if (!characterId || typeof history.replaceState !== 'function') return;
    const url = new URL(window.location.href);
    url.searchParams.set('character', characterId);
    history.replaceState(null, '', url.toString());
  }

  function getInitialCharacterId() {
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get('character');
    if (paramId) {
      return paramId;
    }
    const hash = window.location.hash;
    if (hash && hash.startsWith('#character-')) {
      return hash.replace('#character-', '').trim();
    }
    return null;
  }

  function adjustDetailsScale() {
    if (!detailsEl) return;

    detailsEl.classList.remove('character-preview__details--compact', 'character-preview__details--dense');

    requestAnimationFrame(() => {
      if (!detailsEl) return;

      if (detailsEl.scrollHeight > detailsEl.clientHeight + 4) {
        detailsEl.classList.add('character-preview__details--compact');
      }

      if (detailsEl.scrollHeight > detailsEl.clientHeight + 4) {
        detailsEl.classList.add('character-preview__details--dense');
      }
    });
  }

  function normalizePath(file) {
    if (!file) {
      return '';
    }
    const isAbsolute = /^(?:https?:)?\/\//.test(file) || file.startsWith('data:') || file.startsWith('/');
    if (isAbsolute) {
      return file;
    }
    if (file.startsWith('./') || file.startsWith('../') || file.startsWith('character-dots/')) {
      return file;
    }
    return `character-dots/${file}`;
  }

  function isSilhouetteEntry(entry) {
    return Boolean(entry?.isSecretPlaceholder);
  }

  function getDisplayEntry(entry) {
    if (!entry) return entry;
    const secretId = entry.secret?.id || entry.id;
    const releaseUnlocked = hasAutoRelease(entry.secret);
    const releaseLabel = formatReleaseLabel(entry.secret);
    const locked = entry.secret && !(isSecretUnlocked(secretId) || releaseUnlocked);
    if (locked) {
      return {
        ...entry,
        name: releaseLabel ? `解放予定: ${releaseLabel}` : '？？？',
        role: '？？？',
        tagline: '？？？',
        description: '？？？',
        detail: '？？？',
        weight: '？？？',
        sprite: '？？？',
        palette: '？？？',
        pose: '？？？',
        status: '？？？',
        file: entry.secret.placeholderFile || entry.file,
        buttonLabel: releaseLabel ? `解放予定: ${releaseLabel}` : '？？？',
        buttonStatus: '？？？',
        background: '？？？',
        traits: ['？？？'],
        isSecretPlaceholder: true
      };
    }
    return { ...entry, isSecretPlaceholder: false };
  }

  function isSecretUnlocked(entryId) {
    if (!entryId || !secretUnlocks) {
      return false;
    }
    return Boolean(secretUnlocks[entryId]);
  }

  function loadSecretUnlockState() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return {};
      }
      const raw = window.localStorage.getItem(SECRET_UNLOCK_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function markSecretUnlocked(entryId) {
    if (!entryId) return;
    secretUnlocks = {
      ...(secretUnlocks || {}),
      [entryId]: true
    };
  }

  function hasAutoRelease(secret) {
    if (!secret || !secret.releaseAtJst) {
      return false;
    }
    const releaseTime = Date.parse(secret.releaseAtJst);
    if (!Number.isFinite(releaseTime)) {
      return false;
    }
    const now = Date.now();
    return now >= releaseTime;
  }

  function formatReleaseLabel(secret) {
    if (!secret || !secret.releaseAtJst) {
      return '';
    }
    const timestamp = Date.parse(secret.releaseAtJst);
    if (!Number.isFinite(timestamp)) {
      return '';
    }
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  function handleStorageEvent(event) {
    if (event.key === SECRET_UNLOCK_STORAGE_KEY) {
      secretUnlocks = loadSecretUnlockState();
      refreshAllSecretEntries();
      return;
    }
    if (event.key === CHARACTER_SEEN_STORAGE_KEY) {
      seenCharacters = loadSeenCharacterState();
      refreshSeenStates();
      return;
    }
  }

  function refreshSecretEntry(entryId) {
    if (!entryId) return;
    const index = manifestEntries.findIndex(entry => entry.id === entryId);
    if (index < 0) return;
    displayEntries[index] = getDisplayEntry(manifestEntries[index]);
    applyEntryToButton(buttons[index], displayEntries[index], index);
    if (displayEntries[index] && displayEntries[index].id === currentCharacterId) {
      selectCharacter(displayEntries[index], buttons[index], { updateUrl: false });
    }
  }

  function refreshAllSecretEntries() {
    manifestEntries.forEach((entry, index) => {
      displayEntries[index] = getDisplayEntry(entry);
      applyEntryToButton(buttons[index], displayEntries[index], index);
    });
    if (currentCharacterId) {
      const idx = manifestEntries.findIndex(entry => entry.id === currentCharacterId);
      if (idx >= 0) {
        selectCharacter(displayEntries[idx], buttons[idx], { updateUrl: false });
      }
    }
    updateHeaderIndicator();
  }

  function getUnseenEntries() {
    return displayEntries.filter((entry, index) => {
      const entryId = getEntryId(entry, index);
      if (!entryId || entry.isSecretPlaceholder) {
        return false;
      }
      return !isCharacterSeen(entryId);
    });
  }

  function getEntryId(entry, index) {
    if (entry?.id) {
      return entry.id;
    }
    if (Number.isFinite(index) && index >= 0) {
      return `character-${index + 1}`;
    }
    return '';
  }

  function isCharacterSeen(entryId) {
    if (!entryId || !seenCharacters) {
      return false;
    }
    return Boolean(seenCharacters[entryId]);
  }

  function markCharacterSeen(entryId) {
    if (!entryId || isCharacterSeen(entryId)) {
      return;
    }
    seenCharacters = {
      ...(seenCharacters || {}),
      [entryId]: true
    };
    persistSeenCharacterState();
    updateButtonSeenState(entryId);
    updateHeaderIndicator();
  }

  function updateButtonSeenState(entryId) {
    if (!entryId) return;
    const index = manifestEntries.findIndex((entry, idx) => entry.id === entryId || getEntryId(entry, idx) === entryId);
    if (index < 0 || !buttons[index]) {
      return;
    }
    applyEntryToButton(buttons[index], displayEntries[index], index);
  }

  function loadSeenCharacterState() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return {};
      }
      const raw = window.localStorage.getItem(CHARACTER_SEEN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function persistSeenCharacterState() {
    try {
      if (!seenCharacters || typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      window.localStorage.setItem(CHARACTER_SEEN_STORAGE_KEY, JSON.stringify(seenCharacters));
    } catch (error) {
      // ignore
    }
  }

  function refreshSeenStates() {
    displayEntries.forEach((entry, index) => {
      applyEntryToButton(buttons[index], entry, index);
    });
    updateHeaderIndicator();
  }

  function announceUnseenCharacters(options = {}) {
    const { autoHide = true, duration = 4000, mount } = options;
    const unseen = getUnseenEntries();
    if (!unseen.length) {
      return false;
    }
    const target =
      mount instanceof HTMLElement
        ? mount
        : buttonsContainer?.parentElement || buttonsContainer || document.body;
    if (!target) {
      return false;
    }

    const existing = target.querySelector('.character-new-alert');
    if (existing) {
      existing.remove();
    }

    const alertEl = document.createElement('div');
    alertEl.className = 'character-new-alert';
    alertEl.setAttribute('role', 'status');
    alertEl.textContent = unseen.length === 1 ? '新しいキャラが1体追加されています' : `新しいキャラが${unseen.length}体追加されています`;

    if (target.firstChild) {
      target.insertBefore(alertEl, target.firstChild);
    } else {
      target.appendChild(alertEl);
    }

    if (autoHide && duration > 0) {
      window.setTimeout(() => {
        alertEl.remove();
      }, duration);
    }
    return true;
  }

  function updateHeaderIndicator() {
    if (!headerCharacterLink) {
      return;
    }
    const hasUnseen = getUnseenEntries().length > 0;
    if (hasUnseen) {
      headerCharacterLink.setAttribute('data-unseen', 'true');
    } else {
      headerCharacterLink.removeAttribute('data-unseen');
    }
  }

  function getManifest() {
    if (Array.isArray(window.CHARACTER_GALLERY_MANIFEST) && window.CHARACTER_GALLERY_MANIFEST.length) {
      return window.CHARACTER_GALLERY_MANIFEST;
    }
    return [
      {
        id: 'placeholder',
        name: 'キャラクター（仮）',
        role: 'Leading',
        tagline: 'PNG差し替え用の仮枠です。',
        description: 'manifest.js にエントリを追加するとボタンが増え、画像とメモが切り替わります。',
        weight: '???',
        file: null,
        buttonLabel: 'Placeholder',
        buttonStatus: 'WIP',
        background: '未設定の背景情報',
        traits: ['ポイントを追加']
      }
    ];
  }
})();
