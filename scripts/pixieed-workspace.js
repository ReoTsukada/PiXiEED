(() => {
  'use strict';

  if (typeof window === 'undefined' || window.PiXiEEDWorkspace) {
    return;
  }

  const WORKSPACE_NAME = 'PiXiEED';
  const DB_NAME = 'pixieed-workspace-v1';
  const DB_VERSION = 1;
  const HANDLE_STORE = 'handles';
  const WORKSPACE_HANDLE_KEY = 'workspaceDirectory';
  const LEGACY_DB_NAME = 'pixieedraw-autosave';
  const LEGACY_HANDLE_STORE = 'handles';
  const LEGACY_HANDLE_KEY = 'exportDirectory';
  const PICKER_ID = 'pixieed-workspace';
  const PROJECTS_DIRECTORY = 'Projects';
  const EXPORTS_DIRECTORY = 'Exports';
  const PROJECT_EXTENSION = '.pixieedraw';

  let cachedWorkspaceHandle = null;
  let pendingWorkspaceHandle = null;
  let hydrationPromise = null;

  function supportsIndexedDb() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  function supportsDirectoryPicker() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function openDatabase(name = DB_NAME, version = undefined) {
    if (!supportsIndexedDb()) {
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      const request = version == null ? indexedDB.open(name) : indexedDB.open(name, version);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (name === DB_NAME && !db.objectStoreNames.contains(HANDLE_STORE)) {
          db.createObjectStore(HANDLE_STORE);
        }
      };
      request.onerror = () => reject(request.error || new Error(`Failed to open ${name}`));
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function readStoredValue(dbName, storeName, key) {
    let db = null;
    try {
      db = await openDatabase(dbName, dbName === DB_NAME ? DB_VERSION : undefined);
      if (!db || !db.objectStoreNames.contains(storeName)) {
        db?.close?.();
        return null;
      }
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).get(key);
        let result = null;
        request.onsuccess = () => { result = request.result || null; };
        request.onerror = () => reject(request.error || new Error('Workspace handle read failed'));
        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
        transaction.onerror = () => {
          const error = transaction.error || new Error('Workspace handle transaction failed');
          db.close();
          reject(error);
        };
      });
    } catch (error) {
      db?.close?.();
      console.warn('[PiXiEED workspace] stored handle read failed', { dbName, error });
      return null;
    }
  }

  async function storeWorkspaceHandle(handle) {
    if (!handle || !supportsIndexedDb()) {
      return false;
    }
    let db = null;
    try {
      db = await openDatabase(DB_NAME, DB_VERSION);
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(HANDLE_STORE, 'readwrite');
        transaction.objectStore(HANDLE_STORE).put(handle, WORKSPACE_HANDLE_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Workspace handle write failed'));
      });
      db.close();
      return true;
    } catch (error) {
      db?.close?.();
      console.warn('[PiXiEED workspace] stored handle write failed', error);
      return false;
    }
  }

  async function ensurePermission(handle, { request = false, mode = 'readwrite' } = {}) {
    if (!handle) return false;
    try {
      if (typeof handle.queryPermission === 'function') {
        const current = await handle.queryPermission({ mode });
        if (current === 'granted') return true;
        if (!request || typeof handle.requestPermission !== 'function') return false;
        return await handle.requestPermission({ mode }) === 'granted';
      }
      if (request && typeof handle.requestPermission === 'function') {
        return await handle.requestPermission({ mode }) === 'granted';
      }
      return false;
    } catch (error) {
      console.warn('[PiXiEED workspace] permission check failed', error);
      return false;
    }
  }

  async function normalizeWorkspaceHandle(rootHandle, { create = true } = {}) {
    if (!rootHandle || typeof rootHandle.getDirectoryHandle !== 'function') {
      return null;
    }
    if (String(rootHandle.name || '').trim().toLowerCase() === WORKSPACE_NAME.toLowerCase()) {
      return rootHandle;
    }
    try {
      return await rootHandle.getDirectoryHandle(WORKSPACE_NAME, { create });
    } catch (error) {
      console.warn('[PiXiEED workspace] failed to resolve workspace directory', error);
      return null;
    }
  }

  async function hydrate() {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = (async () => {
      let stored = await readStoredValue(DB_NAME, HANDLE_STORE, WORKSPACE_HANDLE_KEY);
      if (!stored) {
        stored = await readStoredValue(LEGACY_DB_NAME, LEGACY_HANDLE_STORE, LEGACY_HANDLE_KEY);
      }
      if (!stored) return null;
      const workspace = await normalizeWorkspaceHandle(stored, { create: false }) || stored;
      if (await ensurePermission(workspace, { request: false })) {
        cachedWorkspaceHandle = workspace;
        pendingWorkspaceHandle = null;
        await storeWorkspaceHandle(workspace);
        return workspace;
      }
      pendingWorkspaceHandle = workspace;
      return null;
    })();
    return hydrationPromise;
  }

  async function connect({ requestPermission = true } = {}) {
    await hydrate();
    if (cachedWorkspaceHandle && await ensurePermission(cachedWorkspaceHandle, { request: requestPermission })) {
      return cachedWorkspaceHandle;
    }
    if (pendingWorkspaceHandle && await ensurePermission(pendingWorkspaceHandle, { request: requestPermission })) {
      cachedWorkspaceHandle = pendingWorkspaceHandle;
      pendingWorkspaceHandle = null;
      await storeWorkspaceHandle(cachedWorkspaceHandle);
      return cachedWorkspaceHandle;
    }
    if (!requestPermission || !supportsDirectoryPicker()) {
      return null;
    }
    try {
      const rootHandle = await window.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite' });
      if (!await ensurePermission(rootHandle, { request: true })) return null;
      const workspace = await normalizeWorkspaceHandle(rootHandle, { create: true });
      if (!workspace || !await ensurePermission(workspace, { request: true })) return null;
      cachedWorkspaceHandle = workspace;
      pendingWorkspaceHandle = null;
      await storeWorkspaceHandle(workspace);
      window.dispatchEvent(new CustomEvent('pixieed:workspace-connected', { detail: { name: workspace.name } }));
      return workspace;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('[PiXiEED workspace] connection failed', error);
      }
      return null;
    }
  }

  async function getSubdirectory(name, { create = true, requestPermission = false } = {}) {
    const workspace = await connect({ requestPermission });
    if (!workspace || typeof workspace.getDirectoryHandle !== 'function') return null;
    try {
      return await workspace.getDirectoryHandle(name, { create });
    } catch (error) {
      if (error?.name !== 'NotFoundError') {
        console.warn('[PiXiEED workspace] subdirectory access failed', { name, error });
      }
      return null;
    }
  }

  async function getNestedSubdirectory(names, { create = true, requestPermission = false } = {}) {
    const parts = Array.isArray(names)
      ? names.map(name => String(name || '').trim()).filter(Boolean)
      : [String(names || '').trim()].filter(Boolean);
    let directory = await connect({ requestPermission });
    if (!directory) return null;
    for (const name of parts) {
      if (typeof directory.getDirectoryHandle !== 'function') return null;
      try {
        directory = await directory.getDirectoryHandle(name, { create });
      } catch (error) {
        if (error?.name !== 'NotFoundError') {
          console.warn('[PiXiEED workspace] nested directory access failed', { name, error });
        }
        return null;
      }
    }
    return directory;
  }

  async function listProjects({ requestPermission = false, includeWorkspaceRoot = true } = {}) {
    const workspace = await connect({ requestPermission });
    if (!workspace) return [];
    const directories = [];
    const projectsDirectory = await getSubdirectory(PROJECTS_DIRECTORY, { create: requestPermission, requestPermission });
    if (projectsDirectory) directories.push({ handle: projectsDirectory, relativeDirectory: PROJECTS_DIRECTORY });
    if (includeWorkspaceRoot) directories.push({ handle: workspace, relativeDirectory: '' });
    const seen = new Set();
    const entries = [];
    for (const directory of directories) {
      if (!directory.handle || typeof directory.handle.values !== 'function') continue;
      try {
        for await (const handle of directory.handle.values()) {
          if (handle?.kind !== 'file' || !String(handle.name || '').toLowerCase().endsWith(PROJECT_EXTENSION)) continue;
          const key = `${directory.relativeDirectory}/${handle.name}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          try {
            const file = await handle.getFile();
            entries.push({
              name: file.name || handle.name,
              handle,
              file,
              relativeDirectory: directory.relativeDirectory,
              size: Math.max(0, Number(file.size) || 0),
              lastModified: Math.max(0, Number(file.lastModified) || 0),
            });
          } catch (error) {
            console.warn('[PiXiEED workspace] project metadata read failed', { name: handle.name, error });
          }
        }
      } catch (error) {
        console.warn('[PiXiEED workspace] project enumeration failed', error);
      }
    }
    return entries.sort((a, b) => b.lastModified - a.lastModified || a.name.localeCompare(b.name, 'ja'));
  }

  function sanitizeProjectFilename(name) {
    const source = String(name || 'untitled')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim() || 'untitled';
    return source.toLowerCase().endsWith(PROJECT_EXTENSION) ? source : `${source}${PROJECT_EXTENSION}`;
  }

  function buildNumberedFilename(filename, sequence) {
    if (!sequence) return filename;
    const extensionIndex = filename.lastIndexOf('.');
    const hasExtension = extensionIndex > 0;
    const base = hasExtension ? filename.slice(0, extensionIndex) : filename;
    const extension = hasExtension ? filename.slice(extensionIndex) : '';
    return `${base}-${sequence}${extension}`;
  }

  function sanitizeFilename(name, fallback = 'export.bin') {
    return String(name || fallback)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim() || fallback;
  }

  async function createUniqueFileEntry(directoryNames, name, {
    requestPermission = true,
    maxSequence = 999,
    fallbackFilename = 'export.bin',
  } = {}) {
    const directory = await getNestedSubdirectory(directoryNames, { create: true, requestPermission });
    if (!directory || typeof directory.getFileHandle !== 'function') return null;
    const filename = sanitizeFilename(name, fallbackFilename);
    for (let sequence = 0; sequence <= maxSequence; sequence += 1) {
      const candidate = buildNumberedFilename(filename, sequence);
      try {
        await directory.getFileHandle(candidate, { create: false });
      } catch (error) {
        if (error?.name !== 'NotFoundError') {
          console.warn('[PiXiEED workspace] filename check failed', error);
        }
        try {
          const fileHandle = await directory.getFileHandle(candidate, { create: true });
          return { directoryHandle: directory, fileHandle, filename: candidate };
        } catch (createError) {
          console.warn('[PiXiEED workspace] file creation failed', createError);
          return null;
        }
      }
    }
    return null;
  }

  function resolveDerivedExportCategory(filename) {
    const normalized = String(filename || '').toLowerCase();
    if (normalized.includes('timelapse')) return 'Timelapse';
    if (normalized.endsWith('.png')) return normalized.includes('spritemap') ? 'SpriteMAP' : 'PNG';
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'JPEG';
    if (normalized.endsWith('.gif')) return 'GIF';
    if (normalized.endsWith('.svg')) return 'SVG';
    if (normalized.endsWith('.glb')) return 'GLB';
    if (normalized.endsWith('.zip')) return 'ZIP';
    return 'Other';
  }

  async function createDerivedExportFileEntry(name, options = {}) {
    const category = resolveDerivedExportCategory(name);
    return await createUniqueFileEntry([EXPORTS_DIRECTORY, category], name, options);
  }

  async function createProjectFileHandle(name, { requestPermission = true, maxSequence = 999 } = {}) {
    const filename = sanitizeProjectFilename(name);
    const entry = await createUniqueFileEntry([PROJECTS_DIRECTORY], filename, {
      requestPermission,
      maxSequence,
      fallbackFilename: `untitled${PROJECT_EXTENSION}`,
    });
    return entry?.fileHandle || null;
  }

  async function removeProjectFile(name, { requestPermission = false } = {}) {
    const filename = sanitizeProjectFilename(name);
    const directory = await getSubdirectory(PROJECTS_DIRECTORY, {
      create: false,
      requestPermission,
    });
    if (!directory || typeof directory.removeEntry !== 'function') return false;
    try {
      await directory.removeEntry(filename);
      return true;
    } catch (error) {
      if (error?.name !== 'NotFoundError') {
        console.warn('[PiXiEED workspace] failed to remove project file', { filename, error });
      }
      return false;
    }
  }

  function collectProjectFiles(fileList) {
    return Array.from(fileList || [])
      .filter(file => String(file?.name || '').toLowerCase().endsWith(PROJECT_EXTENSION))
      .sort((a, b) => (Number(b.lastModified) || 0) - (Number(a.lastModified) || 0));
  }

  function getStatus() {
    return {
      workspaceName: WORKSPACE_NAME,
      directoryPickerSupported: supportsDirectoryPicker(),
      indexedDbSupported: supportsIndexedDb(),
      connected: Boolean(cachedWorkspaceHandle),
      permissionPending: Boolean(pendingWorkspaceHandle),
    };
  }

  window.PiXiEEDWorkspace = Object.freeze({
    WORKSPACE_NAME,
    PROJECTS_DIRECTORY,
    EXPORTS_DIRECTORY,
    PROJECT_EXTENSION,
    getStatus,
    ensurePermission,
    hydrate,
    connect,
    getSubdirectory,
    getNestedSubdirectory,
    listProjects,
    createProjectFileHandle,
    removeProjectFile,
    createUniqueFileEntry,
    createDerivedExportFileEntry,
    resolveDerivedExportCategory,
    collectProjectFiles,
    storeWorkspaceHandle,
  });
})();
