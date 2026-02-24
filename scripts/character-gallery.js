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

  const reduceMotionQuery = { matches: false };
  const typingControllers = new Map();
  const DEFAULT_IMAGE_SCALE = 0.7;
  const DEFAULT_ANIMATION_INTERVAL_MS = 180;
  const EDGE_TRIM_CHARACTER_IDS = new Set(['sky-burin', 'ocean-burin', 'abyss-burin']);
  const CHARACTER_SEEN_STORAGE_KEY = 'pixieed:characterGallerySeen';
  const SECRET_UNLOCK_STORAGE_KEY = 'pixieed:secret-unlocks';
  const SECRET_UNLOCK_EVENT_NAME = 'pixiePet:secretUnlocked';
  const PLACEHOLDER_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const LANG = (document.documentElement.getAttribute('lang') || 'ja').toLowerCase();
  const IS_EN = LANG.startsWith('en');
  const I18N = IS_EN
    ? {
        viewerAltSuffix: ' pixel preview',
        pngMissing: 'PNG missing',
        draftName: 'Character (Draft)',
        weightLabel: 'Weight',
        weightPending: 'TBD',
        detailPending: 'Details are being prepared.',
        traitsPending: 'Trait details are being prepared.',
        ariaView: 'View',
        ariaNew: '(New)',
        spriteAltSuffix: ' pixel sprite',
        locked: 'Locked',
        unlockOn: 'Unlock on',
        roleUnknown: 'Unknown',
        unseenOne: '1 new character has been added',
        unseenManyPrefix: '',
        unseenManySuffix: ' new characters have been added',
        fallbackDetailPrefix: 'Details for',
        fallbackDetailSuffix: 'are currently available in Japanese. English copy is coming soon.',
        placeholderTagline: 'Temporary placeholder for character gallery.',
        placeholderDesc: 'Add entries in manifest.js to switch images and notes.',
        placeholderBackground: 'Background is not set',
        placeholderTrait: 'Add trait points'
      }
    : {
        viewerAltSuffix: 'のドットプレビュー',
        pngMissing: 'PNG未配置',
        draftName: 'キャラクター（仮）',
        weightLabel: '重さ',
        weightPending: '調整中',
        detailPending: '詳細メモを準備中',
        traitsPending: '特徴メモを準備中',
        ariaView: '表示',
        ariaNew: '（新着）',
        spriteAltSuffix: 'のドット絵',
        locked: '？？？',
        unlockOn: '解放予定',
        roleUnknown: '？？？',
        unseenOne: '新しいキャラが1体追加されています',
        unseenManyPrefix: '新しいキャラが',
        unseenManySuffix: '体追加されています',
        fallbackDetailPrefix: '',
        fallbackDetailSuffix: '',
        placeholderTagline: 'PNG差し替え用の仮枠です。',
        placeholderDesc: 'manifest.js にエントリを追加するとボタンが増え、画像とメモが切り替わります。',
        placeholderBackground: '未設定の背景情報',
        placeholderTrait: 'ポイントを追加'
      };
  let viewerAnimationTimer = null;
  let viewerAnimationFrameIndex = 0;

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

  function containsJapanese(value) {
    return /[ぁ-んァ-ヶ一-龠]/.test(String(value || ''));
  }

  function toTitleFromId(value, index) {
    const source = String(value || '').trim();
    if (!source) {
      return `Character ${Number.isFinite(index) ? index + 1 : ''}`.trim();
    }
    return source
      .split(/[-_]+/)
      .filter(Boolean)
      .map(token => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }

  function getEnglishCandidate(...values) {
    for (const value of values) {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) continue;
      if (!containsJapanese(text)) return text;
    }
    return '';
  }

  function getEntryIndex(entry) {
    if (!entry) return -1;
    return manifestEntries.findIndex(item => item.id === entry.id);
  }

  function getEntryName(entry, index = -1) {
    if (!entry) return I18N.draftName;
    if (!IS_EN) return entry.name || I18N.draftName;
    const english = getEnglishCandidate(entry.nameEn, entry.name_en, entry.enName, entry.en_name, entry.name);
    if (english) return english;
    return toTitleFromId(entry.id || entry.role || '', index);
  }

  function getEntryButtonLabel(entry, index = -1) {
    if (!entry) return `Character ${Number.isFinite(index) ? index + 1 : ''}`.trim();
    if (!IS_EN) return entry.buttonLabel || entry.name || `Character ${index + 1}`;
    const english = getEnglishCandidate(
      entry.buttonLabelEn,
      entry.button_label_en,
      entry.buttonLabel,
      entry.nameEn,
      entry.name
    );
    if (english) return english;
    return getEntryName(entry, index);
  }

  function getEntryDetail(entry, index = -1) {
    if (!entry) return I18N.detailPending;
    if (!IS_EN) return entry.detail || entry.background || entry.description || I18N.detailPending;
    const english = getEnglishCandidate(
      entry.detailEn,
      entry.detail_en,
      entry.backgroundEn,
      entry.background_en,
      entry.descriptionEn,
      entry.description_en,
      entry.detail,
      entry.background,
      entry.description
    );
    if (english) return english;
    const name = getEntryName(entry, index);
    return `${I18N.fallbackDetailPrefix} ${name} ${I18N.fallbackDetailSuffix}`.trim();
  }

  function getEntryWeight(entry) {
    if (!entry) return I18N.weightPending;
    if (!IS_EN) return entry.weight || I18N.weightPending;
    const english = getEnglishCandidate(entry.weightEn, entry.weight_en, entry.weight);
    return english || I18N.weightPending;
  }

  function getEntryTraits(entry, index = -1) {
    if (!entry) return [I18N.traitsPending];
    if (!IS_EN) {
      return Array.isArray(entry.traits) && entry.traits.length ? entry.traits : [I18N.traitsPending];
    }
    if (Array.isArray(entry.traitsEn) && entry.traitsEn.length) {
      return entry.traitsEn.filter(Boolean);
    }
    const englishTraits = Array.isArray(entry.traits)
      ? entry.traits.filter(trait => !containsJapanese(trait))
      : [];
    if (englishTraits.length) return englishTraits;
    const lines = [];
    if (entry.role && !containsJapanese(entry.role)) lines.push(`Role: ${entry.role}`);
    if (entry.sprite && !containsJapanese(entry.sprite)) lines.push(`Sprite: ${entry.sprite}`);
    if (!lines.length) lines.push(getEntryDetail(entry, index));
    return lines;
  }

  function selectCharacter(entry, activeButton, options = {}) {
    const { updateUrl = false, markViewed = false } = options;
    if (!entry) return;
    const entryIndex = getEntryIndex(entry);
    const resolvedName = getEntryName(entry, entryIndex);
    currentCharacterId = entry.id || null;
    const src = normalizePath(entry.file);
    const animation = getEntryAnimation(entry);
    const isSilhouette = isSilhouetteEntry(entry);
    if (src) {
      viewer.hidden = false;
      viewer.src = src;
      viewer.alt = `${resolvedName}${I18N.viewerAltSuffix}`;
      if (shouldTrimEdge(entry)) {
        viewer.dataset.trimEdge = 'true';
      } else {
        delete viewer.dataset.trimEdge;
      }
      if (isSilhouette) {
        viewer.dataset.silhouette = 'true';
      } else {
        delete viewer.dataset.silhouette;
      }
      placeholder.hidden = true;
      if (placeholderMeta) {
        placeholderMeta.textContent = '';
      }
      startViewerAnimation(animation);
    } else {
      stopViewerAnimation();
      viewer.hidden = true;
      viewer.removeAttribute('src');
      delete viewer.dataset.trimEdge;
      delete viewer.dataset.silhouette;
      placeholder.hidden = false;
      if (placeholderMeta) {
        placeholderMeta.textContent = entry.status
          ? `${entry.status} / ${I18N.pngMissing}`
          : I18N.pngMissing;
      }
    }

    typeText(nameEl, resolvedName);
    typeText(weightEl, `${I18N.weightLabel}: ${getEntryWeight(entry)}`);
    typeText(detailEl, getEntryDetail(entry, entryIndex));
    applyScale(DEFAULT_IMAGE_SCALE);
    if (traitsEl) {
      traitsEl.innerHTML = '';
      const traits = getEntryTraits(entry, entryIndex);
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
    emitCharacterSelected(entry);
    updateHeaderIndicator();
  }

  function emitCharacterSelected(entry) {
    if (!entry || typeof window === 'undefined') return;
    const entryIndex = getEntryIndex(entry);
    const detail = getEntryDetail(entry, entryIndex);
    const payload = {
      id: entry.id || null,
      name: getEntryName(entry, entryIndex),
      detail
    };
    window.__PIXIEED_CURRENT_CHARACTER = payload;
    if (typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('pixieed:characterSelected', { detail: payload }));
    }
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
    const labelText = getEntryButtonLabel(entry, index);
    const entryName = getEntryName(entry, index);
    const entryId = getEntryId(entry, index);
    const seen = isCharacterSeen(entryId);
    button.setAttribute('data-character-id', entryId);
    button.setAttribute('aria-label', `${I18N.ariaView} ${labelText}${seen ? '' : ` ${I18N.ariaNew}`}`.trim());

    const img = button._pixieImageEl || button.querySelector('img');
    if (img) {
      const src = normalizePath(entry.file);
      img.src = src || PLACEHOLDER_IMG;
      img.alt = `${entryName}${I18N.spriteAltSuffix}`;
      img.loading = 'lazy';
      if (shouldTrimEdge(entry)) {
        img.dataset.trimEdge = 'true';
      } else {
        delete img.dataset.trimEdge;
      }
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

  function getEntryAnimation(entry) {
    if (!entry) {
      return { frames: [], interval: DEFAULT_ANIMATION_INTERVAL_MS };
    }
    const interval = Number(entry.animationInterval) > 0
      ? Number(entry.animationInterval)
      : DEFAULT_ANIMATION_INTERVAL_MS;
    const baseSrc = normalizePath(entry.file);
    const frameSources = Array.isArray(entry.animationFrames) ? entry.animationFrames : [];
    const frames = frameSources
      .map(normalizePath)
      .filter(Boolean);
    if (baseSrc && !frames.includes(baseSrc)) {
      frames.unshift(baseSrc);
    }
    return { frames, interval };
  }

  function startViewerAnimation(animation) {
    stopViewerAnimation();
    if (!viewer || !animation || !Array.isArray(animation.frames)) {
      return;
    }
    if (reduceMotionQuery.matches || animation.frames.length <= 1) {
      return;
    }
    viewerAnimationFrameIndex = 0;
    viewer.src = animation.frames[0];
    viewerAnimationTimer = window.setInterval(() => {
      if (!viewer || viewer.hidden) {
        return;
      }
      viewerAnimationFrameIndex = (viewerAnimationFrameIndex + 1) % animation.frames.length;
      viewer.src = animation.frames[viewerAnimationFrameIndex];
    }, animation.interval);
  }

  function stopViewerAnimation() {
    if (viewerAnimationTimer) {
      clearInterval(viewerAnimationTimer);
      viewerAnimationTimer = null;
    }
    viewerAnimationFrameIndex = 0;
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

  function shouldTrimEdge(entry) {
    return Boolean(entry && EDGE_TRIM_CHARACTER_IDS.has(entry.id));
  }

  function getDisplayEntry(entry) {
    if (!entry) return entry;
    const secretId = entry.secret?.id || entry.id;
    const releaseUnlocked = hasAutoRelease(entry.secret);
    const releaseLabel = formatReleaseLabel(entry.secret);
    const locked = entry.secret && !(isSecretUnlocked(secretId) || releaseUnlocked);
    if (locked) {
      const lockedLabel = releaseLabel ? `${I18N.unlockOn}: ${releaseLabel}` : I18N.locked;
      return {
        ...entry,
        name: lockedLabel,
        role: I18N.roleUnknown,
        tagline: I18N.locked,
        description: I18N.locked,
        detail: I18N.locked,
        weight: I18N.locked,
        sprite: I18N.locked,
        palette: I18N.locked,
        pose: I18N.locked,
        status: I18N.locked,
        file: entry.secret.placeholderFile || entry.file,
        buttonLabel: lockedLabel,
        buttonStatus: I18N.locked,
        background: I18N.locked,
        traits: [I18N.locked],
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
    alertEl.textContent = unseen.length === 1
      ? I18N.unseenOne
      : `${I18N.unseenManyPrefix}${unseen.length}${I18N.unseenManySuffix}`.trim();

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
        name: I18N.draftName,
        role: 'Leading',
        tagline: I18N.placeholderTagline,
        description: I18N.placeholderDesc,
        weight: '???',
        file: null,
        buttonLabel: 'Placeholder',
        buttonStatus: 'WIP',
        background: I18N.placeholderBackground,
        traits: [I18N.placeholderTrait]
      }
    ];
  }
})();
