(function () {
  'use strict';

  const AUTOSAVE_DB_NAME = 'pixieedraw-autosave';
  const AUTOSAVE_DB_VERSION = 3;
  const AUTOSAVE_STORE_NAME = 'handles';
  const RECENT_PROJECTS_STORE = 'recentProjects';
  const SHARED_LOCAL_OP_JOURNAL_STORE = 'sharedLocalOpJournal';
  const RECENT_PROJECT_STORAGE_SHARED = 'shared';
  const RECENT_PROJECT_STORAGE_LOCAL = 'local';
  const RELOAD_TARGET_PROJECT_ID_KEY = 'pixieedraw:reload-target-project-id-v1';
  const AUTOSAVE_ACTIVE_PROJECT_SYNC_KEY = 'pixieedraw:active-project-sync';
  const PROJECT_FILE_EXTENSION = '.pxd';
  const DEFAULT_DOCUMENT_BASENAME = '無題のドット絵';
  let localProjectsRenderToken = 0;

  const currentScript = document.currentScript;
  const asset = (relativePath) => {
    try {
      return new URL(relativePath, currentScript?.src || window.location.href).href;
    } catch (_error) {
      return relativePath;
    }
  };

  function normalizeAutosaveProjectId(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  function normalizeRecentProjectStorageKind(value) {
    return value === RECENT_PROJECT_STORAGE_SHARED
      ? RECENT_PROJECT_STORAGE_SHARED
      : RECENT_PROJECT_STORAGE_LOCAL;
  }

  function extractDocumentBaseName(value) {
    if (typeof value !== 'string') {
      return DEFAULT_DOCUMENT_BASENAME;
    }
    let base = value.trim();
    if (!base) {
      return DEFAULT_DOCUMENT_BASENAME;
    }
    const removableExtensions = [
      PROJECT_FILE_EXTENSION,
      '.pixieedraw',
      '.pxdraw',
      '.json',
      '.txt',
      '.png',
      '.gif',
      '.jpg',
      '.jpeg',
      '.webp',
      '.bmp',
      '.svg',
      '.avif',
    ];
    let changed = true;
    while (changed && base) {
      changed = false;
      const lowerBase = base.toLowerCase();
      for (let index = 0; index < removableExtensions.length; index += 1) {
        const extension = removableExtensions[index];
        if (!lowerBase.endsWith(extension)) {
          continue;
        }
        base = base.slice(0, -extension.length).trim();
        changed = true;
        break;
      }
    }
    base = base.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return base || DEFAULT_DOCUMENT_BASENAME;
  }

  function formatSavedAt(value) {
    const timestamp = Date.parse(typeof value === 'string' ? value : '');
    if (!Number.isFinite(timestamp)) {
      return '保存時刻不明';
    }
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hour}:${minute}`;
  }

  function upgradeAutosaveDatabase(db) {
    if (!db) {
      return;
    }
    if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
      db.createObjectStore(AUTOSAVE_STORE_NAME);
    }
    if (!db.objectStoreNames.contains(RECENT_PROJECTS_STORE)) {
      db.createObjectStore(RECENT_PROJECTS_STORE);
    }
    if (!db.objectStoreNames.contains(SHARED_LOCAL_OP_JOURNAL_STORE)) {
      const store = db.createObjectStore(SHARED_LOCAL_OP_JOURNAL_STORE, { keyPath: 'id' });
      store.createIndex('projectKey', 'projectKey', { unique: false });
      store.createIndex('projectKeyStatus', ['projectKey', 'status'], { unique: false });
      store.createIndex('projectKeyCreatedAt', ['projectKey', 'createdAt'], { unique: false });
    }
  }

  function openLatestAutosaveDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(AUTOSAVE_DB_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  function openAutosaveDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }
      const request = indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
      request.onupgradeneeded = (event) => {
        upgradeAutosaveDatabase(event.target.result);
      };
      request.onerror = async () => {
        if (request.error && request.error.name === 'VersionError') {
          try {
            resolve(await openLatestAutosaveDatabase());
          } catch (error) {
            reject(error);
          }
          return;
        }
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function loadLocalProjectEntries() {
    const db = await openAutosaveDatabase();
    if (!db.objectStoreNames.contains(RECENT_PROJECTS_STORE)) {
      db.close();
      return [];
    }
    return await new Promise((resolve, reject) => {
      let entries = [];
      const tx = db.transaction([RECENT_PROJECTS_STORE], 'readonly');
      const store = tx.objectStore(RECENT_PROJECTS_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        entries = Array.isArray(request.result) ? request.result.slice() : [];
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        db.close();
        resolve(entries
          .filter((entry) => {
            if (!entry || typeof entry !== 'object') {
              return false;
            }
            if (!normalizeAutosaveProjectId(entry.id || '')) {
              return false;
            }
            return normalizeRecentProjectStorageKind(entry.storageKind) === RECENT_PROJECT_STORAGE_LOCAL;
          })
          .sort((left, right) => {
            const leftTime = typeof left?.updatedAt === 'string' ? left.updatedAt : '';
            const rightTime = typeof right?.updatedAt === 'string' ? right.updatedAt : '';
            return rightTime.localeCompare(leftTime);
          }));
      };
      tx.onerror = () => {
        const error = tx.error;
        db.close();
        reject(error);
      };
    });
  }

  function setProjectCount(countLabel, count, label = '') {
    if (!(countLabel instanceof HTMLElement)) {
      return;
    }
    if (label) {
      countLabel.textContent = label;
      return;
    }
    countLabel.textContent = `${Math.max(0, count)}件`;
  }

  function createEmptyItem(message, detail, actionLabel = 'PiXiEEDrawを開く') {
    const item = document.createElement('article');
    item.className = 'account-item';
    item.setAttribute('role', 'listitem');

    const cover = document.createElement('div');
    cover.className = 'account-cover';
    const icon = new Image();
    icon.src = asset('../icon/icon-192-4.png');
    icon.alt = '';
    cover.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'account-item__body';
    const title = document.createElement('strong');
    title.textContent = message;
    const meta = document.createElement('span');
    meta.textContent = detail;
    body.append(title, meta);

    item.append(cover, body);
    if (actionLabel) {
      const action = document.createElement('a');
      action.className = 'account-action';
      action.href = asset('../pixiedraw/index.html');
      action.textContent = actionLabel;
      item.appendChild(action);
    }
    return item;
  }

  function createProjectItem(entry) {
    const projectId = normalizeAutosaveProjectId(entry.id || '');
    const displayName = extractDocumentBaseName(entry.fileName || entry.name || DEFAULT_DOCUMENT_BASENAME);
    const item = document.createElement('article');
    item.className = 'account-project-card';
    item.setAttribute('role', 'listitem');

    const cover = document.createElement('div');
    cover.className = 'account-project-card__preview';
    const img = new Image();
    img.alt = `${displayName} のプレビュー`;
    img.decoding = 'async';
    img.src = typeof entry.thumbnail === 'string' && entry.thumbnail
      ? entry.thumbnail
      : asset('../icon/icon-192-4.png');
    cover.appendChild(img);

    const body = document.createElement('div');
    body.className = 'account-project-card__body';
    const title = document.createElement('strong');
    title.textContent = displayName;
    title.title = displayName;
    const meta = document.createElement('div');
    meta.className = 'account-project-card__meta';
    meta.textContent = `${formatSavedAt(entry.updatedAt)} ・ 端末内保存`;
    const actions = document.createElement('div');
    actions.className = 'account-card-actions account-card-actions--single';

    const action = document.createElement('button');
    action.className = 'account-card-action account-card-action--primary';
    action.type = 'button';
    action.textContent = '開く';
    action.dataset.localProjectOpenId = projectId;
    action.setAttribute('aria-label', `${displayName} をPiXiEEDrawで開く`);
    actions.appendChild(action);
    body.append(title, meta, actions);

    item.append(cover, body);
    return item;
  }

  function writeRestoreKey(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_error) {
      // Ignore sessionStorage failures and try localStorage.
    }
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // PiXiEEDraw will fall back to its normal startup project if storage is unavailable.
    }
  }

  function openProjectInPixieedraw(projectId) {
    const normalizedId = normalizeAutosaveProjectId(projectId || '');
    if (!normalizedId) {
      return;
    }
    writeRestoreKey(RELOAD_TARGET_PROJECT_ID_KEY, normalizedId);
    writeRestoreKey(AUTOSAVE_ACTIVE_PROJECT_SYNC_KEY, normalizedId);
    // Keep the storage keys as a fallback for older PiXiEEDraw builds, but
    // use an explicit URL request so a normal navigation opens this exact
    // project instead of showing the default project chooser.
    window.location.href = asset(`../pixiedraw/?project=${encodeURIComponent(normalizedId)}`);
  }

  async function renderLocalProjects() {
    const list = document.getElementById('localProjectList');
    const countLabel = document.getElementById('localProjectCount');
    if (!(list instanceof HTMLElement)) {
      return;
    }
    const renderToken = localProjectsRenderToken + 1;
    localProjectsRenderToken = renderToken;
    setProjectCount(countLabel, 0, '確認中');
    list.replaceChildren(createEmptyItem(
      '読み込み中',
      'PiXiEEDrawの端末内プロジェクトを確認しています。',
      ''
    ));
    try {
      const entries = await loadLocalProjectEntries();
      if (renderToken !== localProjectsRenderToken) {
        return;
      }
      list.replaceChildren();
      setProjectCount(countLabel, entries.length);
      if (!entries.length) {
        list.appendChild(createEmptyItem(
          '作品がありません',
          'PiXiEEDrawで新規作成すると、端末内保存がここに出ます。'
        ));
        return;
      }
      entries.forEach((entry) => {
        list.appendChild(createProjectItem(entry));
      });
    } catch (error) {
      if (renderToken !== localProjectsRenderToken) {
        return;
      }
      console.warn('Failed to load PiXiEEDraw local projects', error);
      setProjectCount(countLabel, 0, '未取得');
      list.replaceChildren(createEmptyItem(
        '読み取れませんでした',
        'ブラウザの端末内保存を確認できませんでした。PiXiEEDraw側の一覧はそのまま使えます。'
      ));
    }
  }

  function setupLocalProjectList() {
    const list = document.getElementById('localProjectList');
    if (!(list instanceof HTMLElement)) {
      return;
    }
    list.setAttribute('role', 'list');
    list.addEventListener('click', (event) => {
      const action = event.target?.closest?.('button[data-local-project-open-id]');
      if (!(action instanceof HTMLButtonElement)) {
        return;
      }
      action.disabled = true;
      openProjectInPixieedraw(action.dataset.localProjectOpenId || '');
    });
    renderLocalProjects();
    window.addEventListener('pageshow', renderLocalProjects);
    window.addEventListener('focus', renderLocalProjects);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLocalProjectList, { once: true });
  } else {
    setupLocalProjectList();
  }
})();
