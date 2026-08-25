(function () {
  'use strict';

  const manifestDbName = 'pixiedraw2-workspace-manifest';
  const manifestStoreName = 'manifests';
  const activeProjectKey = 'pixiedraw2:active-project-id:v1';
  const list = document.getElementById('studioProjectList');
  const openButton = document.getElementById('studioOpenProjectButton');
  const openForm = document.getElementById('studioOpenProjectForm');
  const projectInput = document.getElementById('studioProjectId');
  const status = document.getElementById('studioOpenProjectStatus');
  const modeStatus = document.getElementById('studioModeStatus');
  let renderVersion = 0;
  if (!(list instanceof HTMLElement)) return;

  const copy = {
    ja: {
      empty: '保存されたプロジェクトはまだありません。',
      demo: 'PiXiEEDstudioローカルワークスペース',
      demoCopy: '初めての制作はこのプロジェクトから始められます。',
      draw2: 'iDRAWを開く',
      updated: '更新',
      active: '現在のプロジェクト',
      openError: 'プロジェクトIDを入力してください。',
      gameUnavailable: 'iGAMEはローカルエディターで利用できます。',
    },
    en: {
      empty: 'No saved projects yet.',
      demo: 'PiXiEEDstudio local workspace',
      demoCopy: 'Start your first creation from this project.',
      draw2: 'Open iDRAW',
      updated: 'Updated',
      active: 'Current project',
      openError: 'Enter a project ID.',
      gameUnavailable: 'iGAME is available in the local editor.',
    },
  };

  function locale() {
    return document.documentElement.dataset.pixieedLocale === 'en' ? 'en' : 'ja';
  }

  function text(value) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  }

  function readActiveProject() {
    try {
      return text(window.localStorage.getItem(activeProjectKey));
    } catch (_error) {
      return '';
    }
  }

  function openManifestDb() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) {
        resolve(null);
        return;
      }
      let request;
      try {
        request = window.indexedDB.open(manifestDbName, 1);
      } catch (_error) {
        resolve(null);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(manifestStoreName)) {
          db.createObjectStore(manifestStoreName, { keyPath: 'projectId' });
        }
      };
    });
  }

  async function readManifests() {
    const db = await openManifestDb();
    if (!db) return [];
    return new Promise((resolve) => {
      let request;
      try {
        const transaction = db.transaction(manifestStoreName, 'readonly');
        request = transaction.objectStore(manifestStoreName).getAll();
      } catch (_error) {
        db.close();
        resolve([]);
        return;
      }
      request.onsuccess = () => {
        const records = Array.isArray(request.result) ? request.result : [];
        db.close();
        resolve(records.filter((record) => record && typeof record === 'object'));
      };
      request.onerror = () => {
        db.close();
        resolve([]);
      };
    });
  }

  function formatUpdated(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(date);
  }

  function moduleReady(manifest, key) {
    return manifest.modules && manifest.modules[key] && manifest.modules[key].status === 'READY';
  }

  function normalizeMode(value) {
    const mode = text(value).toLowerCase();
    return mode === 'audio' || mode === 'game' ? mode : 'draw';
  }

  function projectHref(projectId, mode = 'draw') {
    const normalizedMode = normalizeMode(mode);
    const params = new URLSearchParams({
      project: projectId,
      mode: normalizedMode.toUpperCase(),
    });
    if (normalizedMode === 'audio') params.set('audio', 'on');
    return `../pixiedraw2/index.html?${params.toString()}`;
  }

  function displayProjectName(manifest, id) {
    const rawName = text(manifest.name) || id;
    // Migrate only the old generated label. Custom project names remain
    // untouched, while the launcher consistently presents the iDRAW mode.
    return rawName.replace(/^Draw2(?=\s|$)/, 'iDRAW');
  }

  function renderProject(manifest, active) {
    const id = text(manifest.projectId);
    if (!id) return null;
    const name = displayProjectName(manifest, id);
    const card = document.createElement('a');
    card.className = 'studio-project-card';
    card.href = projectHref(id, manifest.activeMode);
    card.setAttribute('aria-label', `${name} · ${copy[locale()].draw2}`);

    const top = document.createElement('div');
    top.className = 'studio-project-card__top';
    const title = document.createElement('strong');
    title.textContent = name;
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    top.append(title, arrow);

    const meta = document.createElement('div');
    meta.className = 'studio-project-card__meta';
    const updated = document.createElement('span');
    updated.textContent = `${copy[locale()].updated} ${formatUpdated(manifest.updatedAt)}`.trim();
    const marker = document.createElement('span');
    marker.textContent = active ? copy[locale()].active : `ID: ${id}`;
    meta.append(updated, marker);

    const modes = document.createElement('div');
    modes.className = 'studio-project-card__modes';
    [['draw', 'iDRAW'], ['audio', 'iAUDIO'], ['game', 'iGAME']].forEach(([mode, label]) => {
      const badge = document.createElement('span');
      badge.className = `studio-mode${moduleReady(manifest, mode) ? ' is-ready' : ''}`;
      badge.textContent = label;
      modes.appendChild(badge);
    });

    card.append(top, meta, modes);
    return card;
  }

  async function render() {
    const currentRenderVersion = ++renderVersion;
    const currentCopy = copy[locale()];
    const records = (await readManifests()).sort((a, b) => {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    if (currentRenderVersion !== renderVersion) return;

    const uniqueRecords = [];
    const seenProjectIds = new Set();
    records.forEach((record) => {
      const projectId = text(record?.projectId);
      if (!projectId || seenProjectIds.has(projectId)) return;
      seenProjectIds.add(projectId);
      uniqueRecords.push(record);
    });

    list.replaceChildren();
    const activeId = readActiveProject();
    if (uniqueRecords.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'studio-empty';
      empty.textContent = currentCopy.empty;
      list.appendChild(empty);
      return;
    }
    uniqueRecords.slice(0, 12).forEach((manifest) => {
      const card = renderProject(manifest, text(manifest.projectId) === activeId);
      if (card) list.appendChild(card);
    });
  }

  openButton?.addEventListener('click', () => {
    if (!openForm || !openButton) return;
    const nextOpen = openForm.hidden;
    openForm.hidden = !nextOpen;
    openButton.setAttribute('aria-expanded', String(nextOpen));
    if (nextOpen) projectInput?.focus();
  });

  openForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const projectId = text(projectInput?.value);
    if (!projectId) {
      if (status) status.textContent = copy[locale()].openError;
      projectInput?.focus();
      return;
    }
    window.location.href = projectHref(projectId);
  });

  window.addEventListener('pixiedraw2:project-changed', render);
  window.addEventListener('pixieed:locale-changed', render);
  render();
})();
