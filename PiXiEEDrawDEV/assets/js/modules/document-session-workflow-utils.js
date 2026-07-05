(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createDocumentSessionWorkflowUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  async function loadDocumentFromHandle(handle, options = {}) {
    try {
      const file = await handle.getFile();
      if (isImportableImageFile(file)) {
        return await loadDocumentFromImageFile(file);
      }
      const text = await file.text();
      return await loadDocumentFromText(text, handle, options);
    } catch (error) {
      if (error?.name !== 'NotAllowedError') {
        console.warn('Document handle load failed', error);
      }
      const message = error && error.name === 'AbortError'
        ? null
        : (
          error?.name === 'NotAllowedError'
            ? 'この端末では旧ファイル権限が無効です。端末内プロジェクトから開いてください。'
            : (error?.source === 'image-import' ? '画像の読み込みに失敗しました' : 'ドキュメントを開けませんでした')
        );
      if (message) {
        updateAutosaveStatus(message, 'error');
      }
      return false;
    }
  }

  async function loadDocumentFromText(text, handle, options = {}) {
    if (!ensureCurrentClientCanReplaceActiveProject({ announce: !options?.suppressAutosaveStatus })) {
      return false;
    }
    // Safety: when loading snapshots that came from "recent/opened" flows
    // (or explicitly include a sharedProjectKey), avoid silently applying a
    // snapshot intended for a different project/tab. In those cases return
    // a sentinel 'deferred' so callers can create a new tab instead.
    if ((options?.openedFromRecent || options?.sharedProjectKey) && !options?.allowProjectMismatchLoad) {
      try {
        const requestedProjectId = normalizeAutosaveProjectId(String(options?.projectId || '') || '');
        const requestedSharedKey = String(options?.sharedProjectKey || '').trim() || '';
        const activeTab = getActiveOpenProjectTab();
        const activeProjectId = normalizeAutosaveProjectId(activeTab?.projectId || autosaveProjectId || '');
        const activeSharedKey = String(getOpenProjectTabSharedKey(activeTab) || '').trim() || '';
        if (requestedProjectId && activeProjectId && requestedProjectId !== activeProjectId) {
          return 'deferred';
        }
        if (requestedSharedKey && activeSharedKey && requestedSharedKey !== activeSharedKey) {
          return 'deferred';
        }
      } catch (err) {
        // Ignore guarding errors and proceed to load (safer to load than to fail)
      }
    }
    let parsedDocument = null;
    try {
      parsedDocument = snapshotFromDocumentText(text);
    } catch (error) {
      console.warn('Failed to parse document', error);
      updateAutosaveStatus('ドキュメントの読み込みに失敗しました', 'error');
      return false;
    }
    return await applyLoadedDocumentSnapshot(parsedDocument, options);
  }

  async function loadDocumentFromProjectPayload(projectPayload, options = {}) {
    if (!ensureCurrentClientCanReplaceActiveProject({ announce: !options?.suppressAutosaveStatus })) {
      return false;
    }
    if ((options?.openedFromRecent || options?.sharedProjectKey) && !options?.allowProjectMismatchLoad) {
      try {
        const requestedProjectId = normalizeAutosaveProjectId(String(options?.projectId || '') || '');
        const requestedSharedKey = String(options?.sharedProjectKey || '').trim() || '';
        const activeTab = getActiveOpenProjectTab();
        const activeProjectId = normalizeAutosaveProjectId(activeTab?.projectId || autosaveProjectId || '');
        const activeSharedKey = String(getOpenProjectTabSharedKey(activeTab) || '').trim() || '';
        if (requestedProjectId && activeProjectId && requestedProjectId !== activeProjectId) {
          return 'deferred';
        }
        if (requestedSharedKey && activeSharedKey && requestedSharedKey !== activeSharedKey) {
          return 'deferred';
        }
      } catch (_error) {
        // Ignore guard failures and continue to load.
      }
    }
    let parsedDocument = null;
    try {
      parsedDocument = snapshotFromParsedDocumentValue(projectPayload);
    } catch (error) {
      console.warn('Failed to parse in-memory project payload', error);
      if (!options?.suppressAutosaveStatus) {
        updateAutosaveStatus('ドキュメントの読み込みに失敗しました', 'error');
      }
      return false;
    }
    return await applyLoadedDocumentSnapshot(parsedDocument, options);
  }

  function restoreOpenProjectSheetsFromParsedDocument(parsedDocument = null, {
    projectId = '',
    source = 'sheet',
    sharedProjectKey = '',
    sharedProjectBackendId = '',
    sharedProjectRevision = 0,
    sharedProjectStructureRevision = 0,
    sharedRoleHint = '',
    sharedAutoJoin = false,
  } = {}) {
    const sheets = Array.isArray(parsedDocument?.sheets) ? parsedDocument.sheets : [];
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || autosaveProjectId || '') || createAutosaveProjectId();
    const normalizedSharedProjectKey = normalizeMultiProjectKey(sharedProjectKey || '')
      || getSharedProjectKeyFromProjectId(normalizedProjectId);
    if (!sheets.length) {
      resetOpenProjectTabsToCurrentProject({
        source,
        projectId: normalizedProjectId,
        sharedProjectKey: normalizedSharedProjectKey,
        sharedProjectBackendId,
        sharedProjectRevision,
        sharedProjectStructureRevision,
        sharedRoleHint,
        sharedAutoJoin,
      });
      return false;
    }
    const nextTabs = sheets
      .slice(0, MAX_PROJECT_SHEETS)
      .map((sheet, index) => createOpenProjectSheetTabFromPackagedProject({
        ...sheet,
        projectId: normalizedProjectId,
        label: typeof sheet?.label === 'string' && sheet.label.trim()
          ? sheet.label.trim()
          : localizeText(`シート ${index + 1}`, `Sheet ${index + 1}`),
        source: sheet.source || source,
        sharedProjectKey: sheet.sharedProjectKey || normalizedSharedProjectKey,
        sharedProjectBackendId: sheet.sharedProjectBackendId || sharedProjectBackendId,
        sharedProjectRevision: sheet.sharedProjectRevision || sharedProjectRevision,
        sharedProjectStructureRevision: sheet.sharedProjectStructureRevision || sharedProjectStructureRevision,
        sharedRoleHint: sheet.sharedRoleHint || sharedRoleHint,
        sharedAutoJoin: Object.prototype.hasOwnProperty.call(sheet, 'sharedAutoJoin')
          ? sheet.sharedAutoJoin
          : sharedAutoJoin,
      }))
      .filter(Boolean);
    if (!nextTabs.length) {
      resetOpenProjectTabsToCurrentProject({
        source,
        projectId: normalizedProjectId,
      });
      return false;
    }
    const activeSheetId = typeof parsedDocument?.activeSheetId === 'string' ? parsedDocument.activeSheetId : '';
    const activeTab = nextTabs.find(tab => tab.id === activeSheetId) || nextTabs[0];
    openProjectTabs.splice(0, openProjectTabs.length, ...nextTabs);
    activeOpenProjectTabId = activeTab?.id || nextTabs[0]?.id || '';
    suppressOpenProjectTabAutoInitialize = false;
    renderOpenProjectTabs();
    return true;
  }

  async function applyLoadedDocumentSnapshot(parsedDocument, options = {}) {
    const preservedSelectionClipboard = preserveCanvasSelectionClipboard();
    const snapshot = parsedDocument?.snapshot || null;
    const projectSession = parsedDocument?.projectSession || null;
    const preserveDotStats = Boolean(options?.projectId || options?.openedFromRecent || options?.preserveDotStats);
    const dotStats = preserveDotStats ? (parsedDocument?.dotStats || null) : null;
    if (!snapshot) {
      if (!options?.suppressAutosaveStatus) {
        updateAutosaveStatus('ドキュメントの読み込みに失敗しました', 'error');
      }
      return false;
    }
    synchronizeImportedSnapshotPalette(snapshot);

    autosaveRestoring = true;
    try {
      applyHistorySnapshot(snapshot, {
        forcePalettePresetSync: true,
        preserveView: Boolean(options?.preserveView),
        preserveDocumentIds: Boolean(
          options?.preserveDocumentIds
          || options?.preserveCanvasIds
          || options?.preserveFrameIds
          || options?.preserveLayerIds
        ),
      });
      history.pending = null;
      if (projectSession) {
        history.limit = projectSession.historyLimit;
        history.past = projectSession.historyPast;
        history.future = projectSession.historyFuture;
        trimHistoryStacksToLimit();

        timelapseState.tracksByCanvasId = Object.create(null);
        Object.entries(projectSession.timelapse.tracksByCanvasId || {}).forEach(([canvasId, track]) => {
          timelapseState.tracksByCanvasId[canvasId] = {
            snapshots: Array.isArray(track?.snapshots) ? track.snapshots.slice() : [],
            operationLog: track?.operationLog && typeof track.operationLog === 'object'
              ? {
                  version: 1,
                  baseSnapshot: track.operationLog.baseSnapshot || null,
                  entries: Array.isArray(track.operationLog.entries)
                    ? track.operationLog.entries
                      .map(entry => normalizeSerializedTimelapseOperationEntry(entry))
                      .filter(Boolean)
                    : [],
                }
              : null,
            warningShown: Boolean(track?.warningShown),
            sampleStep: Math.max(1, Math.round(Number(track?.sampleStep) || 1)),
            lastCaptureToken: Number.isFinite(Number(track?.lastCaptureToken))
              ? Math.round(Number(track.lastCaptureToken))
              : -1,
          };
        });
        timelapseState.enabled = projectSession.timelapse.enabled;
        timelapseState.fps = projectSession.timelapse.fps;
      } else {
        history.past = [];
        history.future = [];
        clearTimelapseRecording({ silent: true, scope: 'all' });
      }
      reconcileTimelapseTracksForSingleCanvas();
      ensureTimelapseStartCapture();
    } finally {
      autosaveRestoring = false;
    }

    syncTimelapseControls();
    updateHistoryButtons();
    updateMemoryStatus();
    restoreCanvasSelectionClipboard(preservedSelectionClipboard);
    resetDocumentUnsavedChanges();
    resetExportScaleDefaults();
    syncPixfindSnapshotAfterDocumentReset();
    setTrackedProjectDotBaseline(snapshot, dotStats);
    resetOpenedDocumentViewport({ defer: true });

    const requestedProjectId = normalizeAutosaveProjectId(options?.projectId || '');
    const requestedSharedProjectKey = normalizeMultiProjectKey(options?.sharedProjectKey || '');
    const requestedSharedProjectRevision = Math.max(0, Math.round(Number(options?.sharedProjectRevision) || 0));
    const requestedSharedProjectStructureRevision = Math.max(0, Math.round(Number(options?.sharedProjectStructureRevision) || 0));
    const activeEntryAfterLoad = recentProjectsCache.get(normalizeAutosaveProjectId(requestedProjectId || '')) || null;
    setActiveAutosaveProjectId(requestedProjectId || createAutosaveProjectId());
    if (!options?.suppressProjectSheetsRestore) {
      restoreOpenProjectSheetsFromParsedDocument(parsedDocument, {
        projectId: requestedProjectId || autosaveProjectId,
        source: options?.sharedProjectKey ? 'shared-sheet' : 'sheet',
        sharedProjectKey: requestedSharedProjectKey,
        sharedProjectBackendId: options?.sharedProjectBackendId || activeEntryAfterLoad?.sharedProjectBackendId || '',
        sharedProjectRevision: requestedSharedProjectRevision,
        sharedProjectStructureRevision: requestedSharedProjectStructureRevision,
        sharedRoleHint: options?.sharedRoleHint || activeEntryAfterLoad?.sharedRoleHint || '',
        sharedAutoJoin: options?.sharedAutoJoin !== false && activeEntryAfterLoad?.sharedAutoJoin !== false,
      });
    }
    const loadedQrEditPayload = Object.prototype.hasOwnProperty.call(options || {}, 'qrEditPayload')
      ? options.qrEditPayload
      : getActiveQrEditPayload();
    activateQrEditMode(loadedQrEditPayload || null);
    const requestedSharedProjectId = requestedProjectId.startsWith(SHARED_PROJECT_ID_PREFIX);
    const cachedSharedProjectKey = requestedSharedProjectId && isSharedRecentProjectEntry(activeEntryAfterLoad)
      ? normalizeMultiProjectKey(activeEntryAfterLoad.sharedProjectKey || '')
      : '';
    const derivedSharedProjectKey = requestedSharedProjectKey
      || cachedSharedProjectKey;
    const derivedSharedProjectId = typeof activeEntryAfterLoad?.sharedProjectBackendId === 'string'
      ? activeEntryAfterLoad.sharedProjectBackendId
      : '';
    if (derivedSharedProjectKey) {
      setActiveSharedProjectSession(
        derivedSharedProjectKey,
        requestedSharedProjectRevision
        || Math.max(0, Math.round(Number(activeEntryAfterLoad?.sharedProjectRevision) || 0)),
        Math.max(0, Math.round(Number(activeEntryAfterLoad?.sharedProjectStructureRevision) || 0)),
        derivedSharedProjectId
      );
      initializeSharedProjectCanvasIdentityFromCurrentDocument({
        source: requestedSharedProjectRevision > 0 ? 'snapshot' : 'document',
      });
      setMultiStatus(
        localizeText('共有リンクをコピーできます', 'Shared link is ready to copy'),
        'info'
      );
    } else if (requestedSharedProjectId) {
      clearActiveSharedProjectSession('shared-project-id-without-entry');
    } else if (!requestedSharedProjectId) {
      clearActiveSharedProjectSession();
    }
    markAutosaveDirty();
    scheduleSessionPersist();
    scheduleAutosaveSnapshot();
    if (!options?.suppressAutosaveStatus) {
      if (options?.openedFromRecent) {
        updateAutosaveStatus('自動保存: 端末内プロジェクトを読み込みました', 'success');
      } else {
        updateAutosaveStatus('自動保存: 読み込み内容を端末内に保存します', 'info');
      }
    }
    return true;
  }

  function normalizeProjectHistoryLimit(value, fallback = history.limit) {
    const maxLimit = Math.max(MIN_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT);
    const fallbackLimit = clamp(
      Math.round(Number(fallback) || DEFAULT_HISTORY_LIMIT),
      MIN_HISTORY_LIMIT,
      maxLimit
    );
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) {
      return fallbackLimit;
    }
    return clamp(parsed, MIN_HISTORY_LIMIT, maxLimit);
  }

  function serializeProjectHistorySnapshot(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    let snapshot = null;
    try {
      snapshot = decompressHistorySnapshot(entry);
    } catch (error) {
      return null;
    }
    try {
      return serializeDocumentSnapshot(snapshot);
    } catch (error) {
      return null;
    }
  }

  function serializeProjectHistoryList(list, historyLimit) {
    if (!Array.isArray(list) || !list.length) {
      return [];
    }
    const safeLimit = normalizeProjectHistoryLimit(historyLimit, history.limit);
    const serialized = [];
    for (let index = 0; index < list.length; index += 1) {
      const payload = serializeProjectHistorySnapshot(list[index]);
      if (payload) {
        serialized.push(payload);
      }
    }
    if (serialized.length > safeLimit) {
      return serialized.slice(serialized.length - safeLimit);
    }
    return serialized;
  }

  function serializeProjectTimelapseSnapshotList(list) {
    if (!Array.isArray(list) || !list.length) {
      return [];
    }
    const snapshots = [];
    list.forEach(entry => {
      const resolved = resolveTimelapseFrameEntry(entry);
      if (!resolved) {
        return;
      }
      snapshots.push({
        width: resolved.width,
        height: resolved.height,
        pixels: encodeTypedArray(resolved.pixels),
      });
    });
    return snapshots;
  }

  function serializeProjectTimelapseTracks({ flushPending = true } = {}) {
    if (flushPending) {
      flushPendingTimelapseCapture({ force: true });
    }
    const payload = {};
    Object.entries(getAllTimelapseTracks()).forEach(([canvasId, track]) => {
      if (track?.operationLog?.baseSnapshot) {
        return;
      }
      const snapshots = serializeProjectTimelapseSnapshotList(track?.snapshots || []);
      if (!snapshots.length) {
        return;
      }
      payload[canvasId] = {
        warningShown: Boolean(track?.warningShown),
        sampleStep: Math.max(1, Math.round(Number(track?.sampleStep) || 1)),
        lastCaptureToken: Number.isFinite(Number(track?.lastCaptureToken))
          ? Math.round(Number(track.lastCaptureToken))
          : -1,
        snapshots,
      };
    });
    return payload;
  }

  function normalizeSerializedTimelapseOperationEntry(entry = null) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    if (entry.type === 'keyframe') {
      return entry.snapshot && typeof entry.snapshot === 'object'
        ? {
            type: 'keyframe',
            at: Math.max(0, Math.round(Number(entry.at) || 0)),
            historyLabel: String(entry.historyLabel || ''),
            snapshot: entry.snapshot,
          }
        : null;
    }
    if (entry.type !== 'pixelPatch' || !Array.isArray(entry.changes) || !entry.changes.length) {
      return null;
    }
    const changes = entry.changes
      .map(change => ({
        index: Math.max(0, Math.round(Number(change?.index) || 0)),
        after: cloneTimelapsePixelPatchValue(change?.after),
      }))
      .filter(change => change.after);
    if (!changes.length) {
      return null;
    }
    return {
      type: 'pixelPatch',
      at: Math.max(0, Math.round(Number(entry.at) || 0)),
      historyLabel: String(entry.historyLabel || ''),
      canvasId: typeof entry.canvasId === 'string' ? entry.canvasId : '',
      frameId: typeof entry.frameId === 'string' ? entry.frameId : '',
      layerId: typeof entry.layerId === 'string' ? entry.layerId : '',
      width: Math.max(1, Math.round(Number(entry.width) || 1)),
      height: Math.max(1, Math.round(Number(entry.height) || 1)),
      changes,
    };
  }

  function serializeProjectTimelapseOperationLogs({ flushPending = true } = {}) {
    if (flushPending) {
      flushPendingTimelapseCapture({ force: true });
    }
    const payload = {};
    Object.entries(getAllTimelapseTracks()).forEach(([canvasId, track]) => {
      const log = track?.operationLog && typeof track.operationLog === 'object' ? track.operationLog : null;
      if (!log?.baseSnapshot || !Array.isArray(log.entries)) {
        return;
      }
      const entries = log.entries
        .map(entry => normalizeSerializedTimelapseOperationEntry(entry))
        .filter(Boolean);
      payload[canvasId] = {
        version: 1,
        baseSnapshot: log.baseSnapshot,
        entries,
      };
    });
    return payload;
  }

  function buildProjectSessionPayload() {
    const historyLimit = normalizeProjectHistoryLimit(history.limit, DEFAULT_HISTORY_LIMIT);
    return {
      historyLimit,
      historyPast: serializeProjectHistoryList(history.past, historyLimit),
      historyFuture: serializeProjectHistoryList(history.future, historyLimit),
      timelapse: {
        enabled: Boolean(timelapseState.enabled),
        fps: normalizeTimelapseFps(timelapseState.fps),
        byCanvas: serializeProjectTimelapseTracks(),
        operationLogsByCanvas: serializeProjectTimelapseOperationLogs({ flushPending: false }),
      },
    };
  }

  function buildAutosaveSessionPayload({ includeTimelapse = getAllTimelapseStepCount() > 0 } = {}) {
    const shouldIncludeTimelapse = Boolean(includeTimelapse);
    return {
      historyLimit: normalizeProjectHistoryLimit(history.limit, DEFAULT_HISTORY_LIMIT),
      historyPast: [],
      historyFuture: [],
      timelapse: {
        enabled: Boolean(timelapseState.enabled),
        fps: normalizeTimelapseFps(timelapseState.fps),
        byCanvas: shouldIncludeTimelapse
          ? serializeProjectTimelapseTracks()
          : {},
        operationLogsByCanvas: serializeProjectTimelapseOperationLogs({ flushPending: false }),
        deferredInAutosave: !shouldIncludeTimelapse,
        // Timelapse is opt-in, so autosave writes track data only after a
        // recording exists. This preserves restore counts without penalizing default sessions.
      },
    };
  }

  function deserializeProjectHistoryList(list, historyLimit) {
    if (!Array.isArray(list) || !list.length) {
      return [];
    }
    const safeLimit = normalizeProjectHistoryLimit(historyLimit, history.limit);
    const restored = [];
    for (let index = 0; index < list.length; index += 1) {
      const payload = list[index];
      if (!payload || typeof payload !== 'object') {
        continue;
      }
      try {
        const snapshot = deserializeDocumentPayload(payload);
        synchronizeImportedSnapshotPalette(snapshot);
        restored.push(compressHistorySnapshot(snapshot));
      } catch (error) {
        // Ignore invalid history entries.
      }
    }
    if (restored.length > safeLimit) {
      return restored.slice(restored.length - safeLimit);
    }
    return restored;
  }

  function deserializeProjectTimelapseSnapshots(list) {
    if (!Array.isArray(list) || !list.length) {
      return [];
    }
    const restored = [];
    for (let index = 0; index < list.length; index += 1) {
      const entry = list[index];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const width = Math.max(1, Math.floor(Number(entry.width) || 0));
      const height = Math.max(1, Math.floor(Number(entry.height) || 0));
      if (!width || !height || typeof entry.pixels !== 'string' || !entry.pixels.length) {
        continue;
      }
      try {
        const raw = decodeBase64(entry.pixels);
        if (raw.length !== width * height * 4) {
          continue;
        }
        const pixels = new Uint8ClampedArray(raw.length);
        pixels.set(raw);
        restored.push({
          width,
          height,
          pixels: compressUint8Array(pixels, { clamped: true }),
        });
      } catch (error) {
        // Ignore invalid timelapse entries.
      }
    }
    return restored;
  }

  function deserializeProjectTimelapseTracks(byCanvas, fallbackCanvasId = '') {
    const restored = Object.create(null);
    if (!byCanvas || typeof byCanvas !== 'object' || Array.isArray(byCanvas)) {
      return restored;
    }
    Object.entries(byCanvas).forEach(([canvasId, trackPayload]) => {
      const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId, fallbackCanvasId);
      if (!resolvedCanvasId || !trackPayload || typeof trackPayload !== 'object') {
        return;
      }
      const snapshots = deserializeProjectTimelapseSnapshots(trackPayload.snapshots);
      if (!snapshots.length) {
        return;
      }
      restored[resolvedCanvasId] = {
        snapshots,
        warningShown: Boolean(trackPayload.warningShown),
        sampleStep: Math.max(1, Math.round(Number(trackPayload.sampleStep) || 1)),
        lastCaptureToken: Number.isFinite(Number(trackPayload.lastCaptureToken))
          ? Math.round(Number(trackPayload.lastCaptureToken))
          : -1,
      };
    });
    return restored;
  }

  function deserializeProjectTimelapseOperationLogs(byCanvas, fallbackCanvasId = '') {
    const restored = Object.create(null);
    if (!byCanvas || typeof byCanvas !== 'object' || Array.isArray(byCanvas)) {
      return restored;
    }
    Object.entries(byCanvas).forEach(([canvasId, logPayload]) => {
      const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId, fallbackCanvasId);
      if (!resolvedCanvasId || !logPayload || typeof logPayload !== 'object' || !logPayload.baseSnapshot) {
        return;
      }
      const entries = Array.isArray(logPayload.entries)
        ? logPayload.entries
          .map(entry => normalizeSerializedTimelapseOperationEntry(entry))
          .filter(Boolean)
        : [];
      restored[resolvedCanvasId] = {
        version: 1,
        baseSnapshot: logPayload.baseSnapshot,
        entries,
      };
    });
    return restored;
  }

  function parseProjectSessionPayload(payload, fallbackCanvasId = '') {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const historyLimit = normalizeProjectHistoryLimit(payload.historyLimit, history.limit);
    const historyPast = deserializeProjectHistoryList(payload.historyPast, historyLimit);
    const historyFuture = deserializeProjectHistoryList(payload.historyFuture, historyLimit);
    const timelapsePayload = payload.timelapse && typeof payload.timelapse === 'object'
      ? payload.timelapse
      : {};
    const timelapseTracksByCanvasId = deserializeProjectTimelapseTracks(timelapsePayload.byCanvas, fallbackCanvasId);
    const timelapseOperationLogsByCanvasId = deserializeProjectTimelapseOperationLogs(
      timelapsePayload.operationLogsByCanvas,
      fallbackCanvasId
    );
    Object.entries(timelapseOperationLogsByCanvasId).forEach(([canvasId, operationLog]) => {
      if (!timelapseTracksByCanvasId[canvasId]) {
        timelapseTracksByCanvasId[canvasId] = createEmptyTimelapseTrack();
      }
      timelapseTracksByCanvasId[canvasId].operationLog = operationLog;
    });
    if (!Object.keys(timelapseTracksByCanvasId).length) {
      const legacySnapshots = deserializeProjectTimelapseSnapshots(timelapsePayload.snapshots);
      const resolvedCanvasId = normalizeTimelapseCanvasId(fallbackCanvasId);
      if (legacySnapshots.length && resolvedCanvasId) {
        timelapseTracksByCanvasId[resolvedCanvasId] = {
          snapshots: legacySnapshots,
          warningShown: Boolean(timelapsePayload.warningShown),
          sampleStep: Math.max(1, Math.round(Number(timelapsePayload.sampleStep) || 1)),
          lastCaptureToken: Number.isFinite(Number(timelapsePayload.lastCaptureToken))
            ? Math.round(Number(timelapsePayload.lastCaptureToken))
            : -1,
        };
      }
    }
    return {
      historyLimit,
      historyPast,
      historyFuture,
      timelapse: {
        enabled: Boolean(timelapsePayload.enabled),
        fps: normalizeTimelapseFps(timelapsePayload.fps),
        tracksByCanvasId: timelapseTracksByCanvasId,
      },
    };
  }

  function snapshotFromDocumentText(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Document text is empty');
    }
    const parsed = JSON.parse(text);
    return snapshotFromParsedDocumentValue(parsed);
  }

  function snapshotFromParsedDocumentValue(parsed) {
    const hasPackagedDocument = Boolean(parsed && typeof parsed === 'object' && parsed.document && typeof parsed.document === 'object');
    const payload = hasPackagedDocument ? parsed.document : parsed;
    const snapshot = deserializeDocumentPayload(payload);
    const projectSession = hasPackagedDocument
      ? parseProjectSessionPayload(parsed.session, snapshot?.activeCanvasId || '')
      : null;
    const dotStats = hasPackagedDocument
      ? resolvePackagedProjectDotStats(parsed)
      : null;
    const sheets = hasPackagedDocument
      ? normalizePackagedProjectSheets(parsed.sheets, typeof parsed.activeSheetId === 'string' ? parsed.activeSheetId : '')
      : [];
    return {
      snapshot,
      projectSession,
      dotStats,
      sheets,
      activeSheetId: hasPackagedDocument && typeof parsed.activeSheetId === 'string' ? parsed.activeSheetId : '',
    };
  }


        return Object.freeze({
        loadDocumentFromHandle,
        loadDocumentFromText,
        loadDocumentFromProjectPayload,
        restoreOpenProjectSheetsFromParsedDocument,
        applyLoadedDocumentSnapshot,
        normalizeProjectHistoryLimit,
        serializeProjectHistorySnapshot,
        serializeProjectHistoryList,
        serializeProjectTimelapseSnapshotList,
        serializeProjectTimelapseTracks,
        normalizeSerializedTimelapseOperationEntry,
        serializeProjectTimelapseOperationLogs,
        buildProjectSessionPayload,
        buildAutosaveSessionPayload,
        deserializeProjectHistoryList,
        deserializeProjectTimelapseSnapshots,
        deserializeProjectTimelapseTracks,
        deserializeProjectTimelapseOperationLogs,
        parseProjectSessionPayload,
        snapshotFromDocumentText,
        snapshotFromParsedDocumentValue,
        });
      }
    })(scope);
  }

  root.documentSessionWorkflowUtils = Object.freeze({
    createDocumentSessionWorkflowUtils,
  });
})();
