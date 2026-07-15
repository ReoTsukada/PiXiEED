(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createLocalProjectJournalUtils({
    LOCAL_PROJECT_CHECKPOINT_HISTORY_INTERVAL,
    PROJECT_PACKAGE_TYPE,
    PROJECT_PACKAGE_VERSION,
    DOCUMENT_FILE_VERSION,
    DEFAULT_DOCUMENT_NAME,
    history,
    state,
    recentProjectsCache,
    normalizeAutosaveProjectId,
    normalizeDocumentName,
    extractDocumentBaseName,
    createAutosaveProjectId,
    snapshotFromParsedDocumentValue,
    serializeDocumentSnapshot,
    buildProjectSessionPayload,
    isPixelPatchHistoryEntry,
    getProjectCanvasDocuments,
    getActiveProjectCanvasDocument,
    getActiveOpenProjectTabId,
    findOpenProjectTabIndex,
    openProjectTabs,
    getRecentProjectEntryFileName,
    localizeText,
  } = {}) {
    let activeState = null;

    function cloneJsonValue(value, fallback = null) {
      if (value === undefined) {
        return fallback;
      }
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_error) {
        return fallback;
      }
    }

    function createEmptyActiveState(projectId = '') {
      return {
        projectId: normalizeAutosaveProjectId(projectId || ''),
        checkpointId: '',
        checkpointSequence: 0,
        checkpointProject: null,
        checkpointPersisted: false,
        ops: [],
        dirtyOpCount: 0,
        forceCheckpoint: false,
        historyPast: [],
        historyFuture: [],
        historyLimit: Math.max(1, Math.round(Number(history?.limit) || 30)),
      };
    }

    function getActiveState() {
      return activeState;
    }

    function clearActiveState() {
      activeState = null;
      return null;
    }

    function createCheckpointId(projectId = '', sequence = 0) {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || '') || createAutosaveProjectId();
      const safeSequence = Math.max(0, Math.round(Number(sequence) || 0));
      return `${normalizedProjectId}:cp:${safeSequence}`;
    }

    function normalizeHistoryEntryList(list = []) {
      if (!Array.isArray(list)) {
        return [];
      }
      return cloneJsonValue(list, []) || [];
    }

    function buildJournalPayloadFromState(stateValue = null) {
      if (!stateValue || typeof stateValue !== 'object') {
        return null;
      }
      return {
        version: 1,
        checkpointId: String(stateValue.checkpointId || ''),
        checkpointSequence: Math.max(0, Math.round(Number(stateValue.checkpointSequence) || 0)),
        dirtyOpCount: Math.max(0, Math.round(Number(stateValue.dirtyOpCount) || 0)),
        ops: cloneJsonValue(stateValue.ops, []) || [],
        historyPast: normalizeHistoryEntryList(stateValue.historyPast),
        historyFuture: normalizeHistoryEntryList(stateValue.historyFuture),
        historyLimit: Math.max(1, Math.round(Number(stateValue.historyLimit) || Math.round(Number(history?.limit) || 30))),
      };
    }

    function buildStateFromEntry(entry = null, projectId = '') {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || entry?.id || '');
      if (!normalizedProjectId) {
        return createEmptyActiveState('');
      }
      const journal = entry?.projectJournal && typeof entry.projectJournal === 'object'
        ? entry.projectJournal
        : null;
      const checkpointSequence = Math.max(0, Math.round(Number(journal?.checkpointSequence) || 0));
      return {
        projectId: normalizedProjectId,
        checkpointId: String(journal?.checkpointId || (entry?.checkpointId || createCheckpointId(normalizedProjectId, checkpointSequence))),
        checkpointSequence,
        checkpointProject: entry?.project && typeof entry.project === 'object'
          ? cloneJsonValue(entry.project, null)
          : null,
        checkpointPersisted: Boolean(
          (entry?.project && typeof entry.project === 'object')
          || (Number(entry?.autosaveSchemaVersion) >= 2 && entry?.manifestKey)
        ),
        ops: Array.isArray(journal?.ops) ? (cloneJsonValue(journal.ops, []) || []) : [],
        dirtyOpCount: Math.max(0, Math.round(Number(journal?.dirtyOpCount) || (Array.isArray(journal?.ops) ? journal.ops.length : 0))),
        forceCheckpoint: false,
        historyPast: normalizeHistoryEntryList(journal?.historyPast),
        historyFuture: normalizeHistoryEntryList(journal?.historyFuture),
        historyLimit: Math.max(1, Math.round(Number(journal?.historyLimit) || Math.round(Number(history?.limit) || 30))),
      };
    }

    function hydrateActiveStateFromRecentEntry(entry = null, projectId = '') {
      activeState = buildStateFromEntry(entry, projectId);
      return activeState;
    }

    function ensureActiveState(projectId = '', entry = null) {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || entry?.id || '');
      if (!normalizedProjectId) {
        return clearActiveState();
      }
      if (!activeState || activeState.projectId !== normalizedProjectId) {
        activeState = buildStateFromEntry(entry || recentProjectsCache?.get?.(normalizedProjectId) || null, normalizedProjectId);
      }
      return activeState;
    }

    function buildCheckpointProject(snapshot, session = null, updatedAt = '') {
      if (!snapshot || typeof snapshot !== 'object') {
        return null;
      }
      const packagedSession = session && typeof session === 'object'
        ? cloneJsonValue(session, null)
        : buildProjectSessionPayload();
      return {
        type: PROJECT_PACKAGE_TYPE,
        packageVersion: PROJECT_PACKAGE_VERSION,
        version: DOCUMENT_FILE_VERSION,
        document: serializeDocumentSnapshot(snapshot),
        session: packagedSession,
        updatedAt: updatedAt || new Date().toISOString(),
      };
    }

    function ensureTypedLayerBuffers(layer, length) {
      if (!(layer.indices instanceof Int16Array) || layer.indices.length !== length) {
        const indices = Array.isArray(layer.indices)
          ? layer.indices
          : Array.from(layer.indices || []);
        const next = new Int16Array(length);
        next.set(indices.slice(0, length));
        layer.indices = next;
      }
    }

    function ensureTypedDirectBuffer(layer, key, length) {
      if (!(layer[key] instanceof Uint8ClampedArray) || layer[key].length !== length) {
        const source = Array.isArray(layer[key])
          ? layer[key]
          : Array.from(layer[key] || []);
        const next = new Uint8ClampedArray(length);
        next.set(source.slice(0, length));
        layer[key] = next;
      }
      return layer[key];
    }

    function getSnapshotCanvasList(snapshot) {
      if (Array.isArray(snapshot?.canvases) && snapshot.canvases.length) {
        return snapshot.canvases;
      }
      return snapshot ? [snapshot] : [];
    }

    function resolveSnapshotPatchTarget(snapshot, entry = null) {
      if (!snapshot || !entry || typeof entry !== 'object') {
        return null;
      }
      const canvases = getSnapshotCanvasList(snapshot);
      const canvasDoc = canvases.find(canvas => canvas?.id === entry.canvasId) || canvases[0] || null;
      const frames = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames : [];
      const frame = frames.find(item => item?.id === entry.frameId) || null;
      const layer = Array.isArray(frame?.layers)
        ? (frame.layers.find(item => item?.id === entry.layerId) || null)
        : null;
      if (!canvasDoc || !frame || !layer) {
        return null;
      }
      const width = Math.max(1, Math.round(Number(canvasDoc.width) || Number(entry.width) || 1));
      const height = Math.max(1, Math.round(Number(canvasDoc.height) || Number(entry.height) || 1));
      return { canvasDoc, frame, layer, width, height };
    }

    function applyPixelPatchValueToSnapshotLayer(layer, index, value, width, height) {
      if (!layer || !value) {
        return false;
      }
      const safeIndex = Math.max(0, Math.round(Number(index) || 0));
      const pixelLength = Math.max(1, width * height);
      ensureTypedLayerBuffers(layer, pixelLength);
      if (safeIndex >= layer.indices.length) {
        return false;
      }
      const directLength = pixelLength * 4;
      const directBase = safeIndex * 4;
      layer.indices[safeIndex] = Math.round(Number(value.paletteIndex) || 0);
      if (Array.isArray(value.direct) && value.direct.length === 4) {
        const direct = ensureTypedDirectBuffer(layer, 'direct', directLength);
        direct[directBase] = Math.round(Number(value.direct[0]) || 0);
        direct[directBase + 1] = Math.round(Number(value.direct[1]) || 0);
        direct[directBase + 2] = Math.round(Number(value.direct[2]) || 0);
        direct[directBase + 3] = Math.round(Number(value.direct[3]) || 0);
      } else if (layer.direct instanceof Uint8ClampedArray && directBase + 3 < layer.direct.length) {
        layer.direct[directBase] = 0;
        layer.direct[directBase + 1] = 0;
        layer.direct[directBase + 2] = 0;
        layer.direct[directBase + 3] = 0;
      }
      if (
        Array.isArray(value.importSourceDirect)
        && value.importSourceDirect.length === 4
        && layer.importSourceDirect instanceof Uint8ClampedArray
        && layer.importSourceDirect.length === directLength
      ) {
        layer.importSourceDirect[directBase] = Math.round(Number(value.importSourceDirect[0]) || 0);
        layer.importSourceDirect[directBase + 1] = Math.round(Number(value.importSourceDirect[1]) || 0);
        layer.importSourceDirect[directBase + 2] = Math.round(Number(value.importSourceDirect[2]) || 0);
        layer.importSourceDirect[directBase + 3] = Math.round(Number(value.importSourceDirect[3]) || 0);
      } else if (layer.importSourceDirect instanceof Uint8ClampedArray && directBase + 3 < layer.importSourceDirect.length) {
        layer.importSourceDirect[directBase] = 0;
        layer.importSourceDirect[directBase + 1] = 0;
        layer.importSourceDirect[directBase + 2] = 0;
        layer.importSourceDirect[directBase + 3] = 0;
      }
      return true;
    }

    function applyPixelPatchToSnapshot(snapshot, historyEntry = null, direction = 'redo') {
      const target = resolveSnapshotPatchTarget(snapshot, historyEntry);
      const changes = Array.isArray(historyEntry?.changes) ? historyEntry.changes : [];
      if (!target || !changes.length) {
        return false;
      }
      const useAfter = direction === 'redo';
      let changed = false;
      changes.forEach(change => {
        const value = useAfter ? change?.after : change?.before;
        if (applyPixelPatchValueToSnapshotLayer(target.layer, change?.index, value, target.width, target.height)) {
          changed = true;
        }
      });
      return changed;
    }

    function patchPackagedProjectRootDocument(packagedProject = null, snapshot = null, session = null, updatedAt = '') {
      if (!packagedProject || typeof packagedProject !== 'object' || !snapshot || typeof snapshot !== 'object') {
        return packagedProject;
      }
      const next = cloneJsonValue(packagedProject, null) || {};
      next.document = serializeDocumentSnapshot(snapshot);
      next.session = session && typeof session === 'object'
        ? cloneJsonValue(session, null)
        : (next.session && typeof next.session === 'object' ? next.session : buildProjectSessionPayload());
      next.updatedAt = updatedAt || next.updatedAt || new Date().toISOString();
      return next;
    }

    function patchPackagedProjectSheetById(packagedProject = null, sheetId = '', snapshot = null, session = null, updatedAt = '', fileName = '') {
      if (!packagedProject || typeof packagedProject !== 'object' || !sheetId || !snapshot || typeof snapshot !== 'object') {
        return packagedProject;
      }
      const next = cloneJsonValue(packagedProject, null) || {};
      if (!Array.isArray(next.sheets)) {
        return next;
      }
      next.sheets = next.sheets.map(sheet => {
        if (!sheet || typeof sheet !== 'object' || sheet.id !== sheetId) {
          return sheet;
        }
        const currentProject = sheet.project && typeof sheet.project === 'object' ? sheet.project : null;
        const patchedProject = patchPackagedProjectRootDocument(currentProject || {}, snapshot, session, updatedAt);
        return {
          ...sheet,
          fileName: fileName || sheet.fileName || DEFAULT_DOCUMENT_NAME,
          project: patchedProject,
          updatedAt: updatedAt || patchedProject?.updatedAt || sheet.updatedAt || new Date().toISOString(),
        };
      });
      return next;
    }

    function reconstructPackagedProjectFromEntry(entry = null) {
      const baseProject = entry?.project && typeof entry.project === 'object' ? cloneJsonValue(entry.project, null) : null;
      if (!baseProject) {
        return null;
      }
      const journal = entry?.projectJournal && typeof entry.projectJournal === 'object'
        ? entry.projectJournal
        : null;
      if (!journal || !Array.isArray(journal.ops) || !journal.ops.length) {
        return baseProject;
      }
      let parsed = null;
      try {
        parsed = snapshotFromParsedDocumentValue(baseProject);
      } catch (error) {
        console.warn('Failed to parse checkpoint project for local journal replay', error);
        return baseProject;
      }
      const snapshot = parsed?.snapshot || null;
      if (!snapshot) {
        return baseProject;
      }
      journal.ops.forEach(op => {
        if (op?.kind === 'pixel-patch' && op?.historyEntry) {
          applyPixelPatchToSnapshot(snapshot, op.historyEntry, 'redo');
        }
      });
      const nextSession = baseProject.session && typeof baseProject.session === 'object'
        ? cloneJsonValue(baseProject.session, null)
        : buildProjectSessionPayload();
      nextSession.historyPast = normalizeHistoryEntryList(journal.historyPast);
      nextSession.historyFuture = normalizeHistoryEntryList(journal.historyFuture);
      nextSession.historyLimit = Math.max(
        1,
        Math.round(Number(journal.historyLimit) || Number(nextSession.historyLimit) || Math.round(Number(history?.limit) || 30))
      );
      const updatedAt = typeof entry?.updatedAt === 'string'
        ? entry.updatedAt
        : (baseProject.updatedAt || new Date().toISOString());
      let nextProject = patchPackagedProjectRootDocument(baseProject, snapshot, nextSession, updatedAt);
      const activeSheetId = typeof baseProject.activeSheetId === 'string'
        ? baseProject.activeSheetId
        : String(getActiveOpenProjectTabId?.() || '');
      const normalizedFileName = normalizeDocumentName(
        entry?.fileName
        || entry?.name
        || snapshot?.documentName
        || DEFAULT_DOCUMENT_NAME
      );
      if (activeSheetId) {
        nextProject = patchPackagedProjectSheetById(
          nextProject,
          activeSheetId,
          snapshot,
          nextSession,
          updatedAt,
          normalizedFileName
        );
        nextProject.activeSheetId = activeSheetId;
      }
      return nextProject;
    }

    function shouldUseJournalCheckpoint(activeValue = activeState) {
      if (!activeValue || typeof activeValue !== 'object') {
        return true;
      }
      if (!activeValue.checkpointPersisted && (!activeValue.checkpointProject || typeof activeValue.checkpointProject !== 'object')) {
        return true;
      }
      if (activeValue.forceCheckpoint) {
        return true;
      }
      return Math.max(0, Math.round(Number(activeValue.dirtyOpCount) || 0)) >= Math.max(1, Math.round(Number(LOCAL_PROJECT_CHECKPOINT_HISTORY_INTERVAL) || 30));
    }

    function captureActiveStateCheckpoint(projectId = '', snapshot = null, session = null, { historyPast = null, historyFuture = null } = {}) {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || activeState?.projectId || '');
      if (!normalizedProjectId || !snapshot || typeof snapshot !== 'object') {
        return null;
      }
      const next = ensureActiveState(normalizedProjectId) || createEmptyActiveState(normalizedProjectId);
      next.checkpointSequence = Math.max(0, Math.round(Number(next.checkpointSequence) || 0)) + 1;
      next.checkpointId = createCheckpointId(normalizedProjectId, next.checkpointSequence);
      next.checkpointProject = buildCheckpointProject(snapshot, session, session?.updatedAt || '');
      next.checkpointPersisted = false;
      next.ops = [];
      next.dirtyOpCount = 0;
      next.forceCheckpoint = false;
      next.historyPast = normalizeHistoryEntryList(historyPast || history?.past || []);
      next.historyFuture = normalizeHistoryEntryList(historyFuture || history?.future || []);
      next.historyLimit = Math.max(1, Math.round(Number(session?.historyLimit) || Number(history?.limit) || 30));
      activeState = next;
      return next;
    }

    // The V2 writer has durably committed the checkpoint. Retaining another
    // full JSON copy here duplicates large pixel buffers in the renderer.
    function markCheckpointPersisted(projectId = '') {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || activeState?.projectId || '');
      if (!normalizedProjectId || !activeState || activeState.projectId !== normalizedProjectId) {
        return false;
      }
      activeState.checkpointProject = null;
      activeState.checkpointPersisted = true;
      return true;
    }

    function noteHistoryEntry(projectId = '', historyEntry = null, historyLabel = '') {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || activeState?.projectId || '');
      if (!normalizedProjectId || !historyEntry || typeof historyEntry !== 'object') {
        return null;
      }
      const next = ensureActiveState(normalizedProjectId) || createEmptyActiveState(normalizedProjectId);
      next.historyPast = normalizeHistoryEntryList(history?.past || []);
      next.historyFuture = normalizeHistoryEntryList(history?.future || []);
      next.historyLimit = Math.max(1, Math.round(Number(history?.limit) || 30));
      if (!isPixelPatchHistoryEntry(historyEntry)) {
        next.forceCheckpoint = true;
        activeState = next;
        return next;
      }
      next.ops.push({
        kind: 'pixel-patch',
        historyLabel: String(historyLabel || historyEntry.historyLabel || ''),
        historyEntry: cloneJsonValue(historyEntry, null),
      });
      if (next.ops.length > Math.max(1, Math.round(Number(LOCAL_PROJECT_CHECKPOINT_HISTORY_INTERVAL) || 30))) {
        next.forceCheckpoint = true;
      }
      next.dirtyOpCount = next.ops.length;
      activeState = next;
      return next;
    }

    // V2 journals store the replayable patch itself, while the legacy local
    // journal wraps it in { kind, historyEntry }. Keep this conversion at the
    // persistence boundary so a malformed or structural entry can force a
    // checkpoint instead of producing an unrecoverable V2 revision.
    function normalizeV2PixelPatchJournalOps(journalPayload = null) {
      const wrappedOps = Array.isArray(journalPayload?.ops) ? journalPayload.ops : [];
      const normalized = [];
      for (let opIndex = 0; opIndex < wrappedOps.length; opIndex += 1) {
        const wrapped = wrappedOps[opIndex];
        const entry = wrapped?.kind === 'pixel-patch' ? wrapped.historyEntry : null;
        if (!entry || !isPixelPatchHistoryEntry(entry) || !Array.isArray(entry.changes) || !entry.changes.length) {
          return null;
        }
        normalized.push({
          sequence: opIndex + 1,
          kind: 'pixel-patch',
          canvasId: String(entry.canvasId || ''),
          frameId: String(entry.frameId || ''),
          layerId: String(entry.layerId || ''),
          changes: cloneJsonValue(entry.changes, []),
        });
      }
      return normalized;
    }

    function markNeedsCheckpoint(projectId = '') {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || activeState?.projectId || '');
      if (!normalizedProjectId) {
        return false;
      }
      const next = ensureActiveState(normalizedProjectId) || createEmptyActiveState(normalizedProjectId);
      next.forceCheckpoint = true;
      activeState = next;
      return true;
    }

    function buildSavePlan({
      projectId = '',
      snapshot = null,
      packagedPayload = null,
      buildPackagedProjectPayload,
      buildAutosaveSessionPayload,
    } = {}) {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || activeState?.projectId || '');
      if (!normalizedProjectId || typeof buildPackagedProjectPayload !== 'function') {
        return null;
      }
      const next = ensureActiveState(normalizedProjectId) || createEmptyActiveState(normalizedProjectId);
      const currentActiveSheetId = typeof getActiveOpenProjectTabId === 'function'
        ? String(getActiveOpenProjectTabId() || '')
        : '';
      const checkpointActiveSheetId = typeof next.checkpointProject?.activeSheetId === 'string'
        ? next.checkpointProject.activeSheetId
        : '';
      const useCheckpoint = shouldUseJournalCheckpoint(next)
        || Boolean(currentActiveSheetId && checkpointActiveSheetId && currentActiveSheetId !== checkpointActiveSheetId);
      const hasSnapshot = Boolean(snapshot && typeof snapshot === 'object');
      if (!hasSnapshot && !useCheckpoint && next.checkpointPersisted) {
        // A journal-only revision persists replayable pixel patches plus the
        // lightweight history lists. Building the complete session here used
        // to serialize every timelapse track even though that payload was
        // discarded before the V2 journal write.
        next.historyPast = normalizeHistoryEntryList(history?.past || []);
        next.historyFuture = normalizeHistoryEntryList(history?.future || []);
        next.historyLimit = Math.max(1, Math.round(Number(history?.limit) || 30));
        next.dirtyOpCount = Math.max(0, next.ops.length);
        activeState = next;
        return {
          packagedPayload: null,
          journalPayload: buildJournalPayloadFromState(next),
          checkpointId: next.checkpointId,
          dirtyOpCount: next.dirtyOpCount,
          journalOnly: true,
        };
      }
      if (!hasSnapshot) {
        return null;
      }
      const session = typeof buildAutosaveSessionPayload === 'function'
        ? buildAutosaveSessionPayload()
        : buildProjectSessionPayload();
      session.historyPast = normalizeHistoryEntryList(history?.past || []);
      session.historyFuture = normalizeHistoryEntryList(history?.future || []);
      session.historyLimit = Math.max(1, Math.round(Number(history?.limit) || Number(session.historyLimit) || 30));
      if (useCheckpoint) {
        const fullPackaged = packagedPayload && typeof packagedPayload === 'object'
          ? packagedPayload
          : buildPackagedProjectPayload(snapshot, { session });
        const checkpointProject = cloneJsonValue(fullPackaged, null);
        next.checkpointSequence = Math.max(0, Math.round(Number(next.checkpointSequence) || 0)) + 1;
        next.checkpointId = createCheckpointId(normalizedProjectId, next.checkpointSequence);
        next.checkpointProject = checkpointProject;
        next.checkpointPersisted = false;
        next.ops = [];
        next.dirtyOpCount = 0;
        next.forceCheckpoint = false;
        next.historyPast = normalizeHistoryEntryList(session.historyPast);
        next.historyFuture = normalizeHistoryEntryList(session.historyFuture);
        next.historyLimit = Math.max(1, Math.round(Number(session.historyLimit) || 30));
        activeState = next;
        return {
          packagedPayload: fullPackaged,
          journalPayload: buildJournalPayloadFromState(next),
          checkpointId: next.checkpointId,
          dirtyOpCount: 0,
        };
      }
      if (!next.checkpointProject || typeof next.checkpointProject !== 'object') {
        const fullPackaged = packagedPayload && typeof packagedPayload === 'object'
          ? packagedPayload
          : buildPackagedProjectPayload(snapshot, { session });
        next.checkpointSequence = Math.max(0, Math.round(Number(next.checkpointSequence) || 0)) + 1;
        next.checkpointId = createCheckpointId(normalizedProjectId, next.checkpointSequence);
        next.checkpointProject = cloneJsonValue(fullPackaged, null);
        next.checkpointPersisted = false;
        next.ops = [];
        next.dirtyOpCount = 0;
        next.forceCheckpoint = false;
        next.historyPast = normalizeHistoryEntryList(session.historyPast);
        next.historyFuture = normalizeHistoryEntryList(session.historyFuture);
        next.historyLimit = Math.max(1, Math.round(Number(session.historyLimit) || 30));
        activeState = next;
        return {
          packagedPayload: fullPackaged,
          journalPayload: buildJournalPayloadFromState(next),
          checkpointId: next.checkpointId,
          dirtyOpCount: 0,
        };
      }
      next.historyPast = normalizeHistoryEntryList(session.historyPast);
      next.historyFuture = normalizeHistoryEntryList(session.historyFuture);
      next.historyLimit = Math.max(1, Math.round(Number(session.historyLimit) || 30));
      next.dirtyOpCount = Math.max(0, next.ops.length);
      activeState = next;
      return {
        packagedPayload: cloneJsonValue(next.checkpointProject, null),
        journalPayload: buildJournalPayloadFromState(next),
        checkpointId: next.checkpointId,
        dirtyOpCount: next.dirtyOpCount,
        journalOnly: false,
      };
    }

    function createLightweightTabState(tab = null, overrides = {}) {
      const base = tab && typeof tab === 'object' ? tab : {};
      // A local sheet keeps one resident payload reference. `project` and
      // `deferredProjectPayload` deliberately point at that same object: this
      // avoids a full snapshot/rehydrate cycle for an unchanged GIF sheet
      // without duplicating its pixel buffers.
      const deferredProjectPayload = overrides.deferredProjectPayload
        || base.deferredProjectPayload
        || (base.project && typeof base.project === 'object' ? base.project : null);
      return {
        ...base,
        ...overrides,
        project: deferredProjectPayload,
        deferredProjectPayload,
        deferredPayloadKey: String(overrides.deferredPayloadKey || base.deferredPayloadKey || base.sheetPersistenceKey || base.id || ''),
        checkpointId: String(overrides.checkpointId || base.checkpointId || ''),
        dirtyOpCount: Math.max(0, Math.round(Number(overrides.dirtyOpCount ?? base.dirtyOpCount) || 0)),
        residentProjectLoaded: Boolean(deferredProjectPayload),
      };
    }

    function extractSheetProjectFromPackagedProject(packagedProject = null, sheetId = '') {
      if (!packagedProject || typeof packagedProject !== 'object') {
        return null;
      }
      if (!sheetId) {
        return packagedProject;
      }
      const sheets = Array.isArray(packagedProject.sheets) ? packagedProject.sheets : [];
      const sheet = sheets.find(item => item && typeof item === 'object' && item.id === sheetId && item.project && typeof item.project === 'object') || null;
      return sheet?.project || null;
    }

    function resolveStoredPackagedProjectForProjectId(projectId = '') {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
      if (!normalizedProjectId) {
        return null;
      }
      const entry = recentProjectsCache?.get?.(normalizedProjectId) || null;
      if (!entry) {
        return null;
      }
      return reconstructPackagedProjectFromEntry(entry);
    }

    function createEntrySignature(entry = null) {
      return {
        checkpointId: String(entry?.projectJournal?.checkpointId || entry?.checkpointId || ''),
        dirtyOpCount: Math.max(0, Math.round(Number(entry?.projectJournal?.dirtyOpCount) || Number(entry?.dirtyOpCount) || 0)),
      };
    }

    function pruneInactiveCanvasDirectCaches() {
      const activeCanvasId = String(getActiveProjectCanvasDocument?.()?.id || '');
      const canvases = Array.isArray(getProjectCanvasDocuments?.()) ? getProjectCanvasDocuments() : [];
      canvases.forEach(canvasDoc => {
        if (!canvasDoc || String(canvasDoc.id || '') === activeCanvasId) {
          return;
        }
        const frames = Array.isArray(canvasDoc.frames) ? canvasDoc.frames : [];
        frames.forEach(frame => {
          const layers = Array.isArray(frame?.layers) ? frame.layers : [];
          layers.forEach(layer => {
            if (!layer || layer.directOnly === true || layer.importSourceDirect instanceof Uint8ClampedArray) {
              return;
            }
            const indices = layer.indices instanceof Int16Array
              ? layer.indices
              : (Array.isArray(layer.indices) ? layer.indices : null);
            if (!indices) {
              return;
            }
            let hasNegative = false;
            for (let index = 0; index < indices.length; index += 1) {
              if (Number(indices[index]) < 0) {
                hasNegative = true;
                break;
              }
            }
            if (!hasNegative) {
              layer.direct = null;
            }
          });
        });
      });
    }

    return {
      getActiveState,
      clearActiveState,
      hydrateActiveStateFromRecentEntry,
      ensureActiveState,
      buildCheckpointProject,
      reconstructPackagedProjectFromEntry,
      captureActiveStateCheckpoint,
      markCheckpointPersisted,
      noteHistoryEntry,
      markNeedsCheckpoint,
      buildSavePlan,
      normalizeV2PixelPatchJournalOps,
      createLightweightTabState,
      extractSheetProjectFromPackagedProject,
      resolveStoredPackagedProjectForProjectId,
      createEntrySignature,
      pruneInactiveCanvasDirectCaches,
    };
  }

  root.localProjectJournalUtils = Object.freeze({
    createLocalProjectJournalUtils,
  });
})();
