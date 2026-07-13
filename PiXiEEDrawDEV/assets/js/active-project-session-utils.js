(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  /**
   * Pure metadata helpers for the one active editor session. This module never
   * reads DOM, IndexedDB, File System Access API, or document pixel data.
   */
  function createActiveProjectSessionUtils({
    normalizeAutosaveProjectId = value => (typeof value === 'string' ? value.trim() : ''),
    normalizeProjectSourceKind = (value, fallback = 'unknown') => (
      typeof value === 'string' && value.trim() ? value.trim() : fallback
    ),
    normalizeProjectStorageAdapterId = value => (
      typeof value === 'string' && value.trim() ? value.trim() : null
    ),
    normalizeProjectSaveHandleState = (value, fallback = 'none') => (
      typeof value === 'string' && value.trim() ? value.trim() : fallback
    ),
    normalizeProjectSaveHandleMeta = value => (value && typeof value === 'object' ? { ...value } : null),
    now = () => new Date().toISOString(),
  } = {}) {
    const asString = value => (typeof value === 'string' ? value.trim() : '');
    const normalizeTimestamp = value => {
      const candidate = asString(value);
      return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : '';
    };
    const normalizeHandle = value => (value && typeof value === 'object' ? value : null);
    const normalizeSchemaVersion = value => Math.max(0, Math.round(Number(value) || 0));
    const normalizeIdentity = (value, projectId) => asString(value) || projectId || null;

    function normalizeActiveProjectSession(input = {}) {
      const value = input && typeof input === 'object' ? input : {};
      const projectId = normalizeAutosaveProjectId(value.projectId || '');
      const sourceKind = normalizeProjectSourceKind(value.sourceKind, 'unknown');
      const sourceAdapterId = normalizeProjectStorageAdapterId(
        Object.prototype.hasOwnProperty.call(value, 'sourceAdapterId')
          ? value.sourceAdapterId
          : value.sourceStorageAdapterId
      );
      const lastSavedAdapterId = normalizeProjectStorageAdapterId(
        Object.prototype.hasOwnProperty.call(value, 'lastSavedAdapterId')
          ? value.lastSavedAdapterId
          : value.lastSavedStorageAdapterId
      );
      const projectSaveHandleState = normalizeProjectSaveHandleState(value.projectSaveHandleState, 'none');
      const projectSaveHandle = normalizeHandle(value.projectSaveHandle);
      const projectSaveHandleMeta = normalizeProjectSaveHandleMeta(
        value.projectSaveHandleMeta,
        null,
        {
          sourceStorageAdapterId: sourceAdapterId,
          lastSavedStorageAdapterId: lastSavedAdapterId,
          sourceProjectToken: asString(value.sourceProjectToken) || null,
        }
      );
      const timestamp = now();
      return {
        projectId,
        documentId: asString(value.documentId),
        sourceKind,
        sourceAdapterId,
        canonicalPayloadFormat: asString(value.canonicalPayloadFormat),
        canonicalSchemaVersion: normalizeSchemaVersion(value.canonicalSchemaVersion),
        sourceProjectToken: asString(value.sourceProjectToken) || null,
        lastSavedAdapterId,
        projectSaveHandle: projectSaveHandleState === 'bound' ? projectSaveHandle : null,
        projectSaveHandleMeta: projectSaveHandleState === 'bound'
          ? projectSaveHandleMeta
          : (projectSaveHandleState === 'unavailable' ? projectSaveHandleMeta : null),
        projectSaveHandleState,
        autosaveIdentity: normalizeIdentity(value.autosaveIdentity, projectId),
        recoveryIdentity: normalizeIdentity(value.recoveryIdentity, projectId),
        dirty: value.dirty === true,
        openedAt: normalizeTimestamp(value.openedAt) || timestamp,
        updatedAt: normalizeTimestamp(value.updatedAt) || timestamp,
      };
    }

    function validateActiveProjectSession(session = null) {
      if (!session || typeof session !== 'object') {
        return { ok: false, errors: ['missing-session'] };
      }
      const errors = [];
      if (!normalizeAutosaveProjectId(session.projectId || '')) errors.push('missing-project-id');
      if (!asString(session.sourceKind)) errors.push('missing-source-kind');
      if (!asString(session.projectSaveHandleState)) errors.push('missing-save-handle-state');
      if (session.projectSaveHandleState === 'bound' && !normalizeHandle(session.projectSaveHandle)) {
        errors.push('bound-handle-missing');
      }
      if (!normalizeIdentity(session.autosaveIdentity, '')) errors.push('missing-autosave-identity');
      if (!normalizeIdentity(session.recoveryIdentity, '')) errors.push('missing-recovery-identity');
      return { ok: errors.length === 0, errors };
    }

    function createActiveProjectSession(input = {}) {
      const session = normalizeActiveProjectSession(input);
      return { ...session, validation: undefined };
    }

    function replaceActiveProjectSession(_current = null, next = {}) {
      return createActiveProjectSession(next);
    }

    function updateActiveProjectSession(current = null, patch = {}) {
      const base = current && typeof current === 'object' ? current : {};
      const nextPatch = patch && typeof patch === 'object' ? patch : {};
      const merged = {
        ...base,
        ...nextPatch,
        projectSaveHandleMeta: Object.prototype.hasOwnProperty.call(nextPatch, 'projectSaveHandleMeta')
          ? nextPatch.projectSaveHandleMeta
          : base.projectSaveHandleMeta,
        updatedAt: Object.prototype.hasOwnProperty.call(nextPatch, 'updatedAt')
          ? nextPatch.updatedAt
          : now(),
      };
      return createActiveProjectSession(merged);
    }

    function getActiveProjectSessionPersistenceState(session = null) {
      const validation = validateActiveProjectSession(session);
      if (!validation.ok) return null;
      return {
        sourceKind: session.sourceKind,
        sourceStorageAdapterId: session.sourceAdapterId,
        sourceProjectToken: session.sourceProjectToken,
        lastSavedStorageAdapterId: session.lastSavedAdapterId,
        projectSaveHandleState: session.projectSaveHandleState,
      };
    }

    function getActiveProjectSessionSaveBinding(session = null) {
      const validation = validateActiveProjectSession(session);
      if (!validation.ok) return null;
      return {
        projectSaveHandle: session.projectSaveHandle || null,
        projectSaveHandleMeta: session.projectSaveHandleMeta || null,
        projectSaveHandleState: session.projectSaveHandleState,
      };
    }

    function bindActiveProjectSessionSaveHandle(session = null, input = {}) {
      const value = input && typeof input === 'object' ? input : {};
      const handle = normalizeHandle(value.projectSaveHandle || value.handle);
      if (!handle) {
        return clearActiveProjectSessionSaveHandle(session, value);
      }
      return updateActiveProjectSession(session, {
        projectSaveHandle: handle,
        projectSaveHandleMeta: value.projectSaveHandleMeta || value.meta || null,
        projectSaveHandleState: 'bound',
        lastSavedAdapterId: Object.prototype.hasOwnProperty.call(value, 'lastSavedAdapterId')
          ? value.lastSavedAdapterId
          : session?.lastSavedAdapterId,
      });
    }

    function clearActiveProjectSessionSaveHandle(session = null, { preserveMeta = false } = {}) {
      return updateActiveProjectSession(session, {
        projectSaveHandle: null,
        projectSaveHandleMeta: preserveMeta ? session?.projectSaveHandleMeta || null : null,
        projectSaveHandleState: 'none',
      });
    }

    function markActiveProjectSessionSaveHandleUnavailable(session = null, input = {}) {
      const value = input && typeof input === 'object' ? input : {};
      return updateActiveProjectSession(session, {
        projectSaveHandle: null,
        projectSaveHandleMeta: Object.prototype.hasOwnProperty.call(value, 'projectSaveHandleMeta')
          ? value.projectSaveHandleMeta
          : session?.projectSaveHandleMeta || null,
        projectSaveHandleState: 'unavailable',
      });
    }

    function comparableMeta(meta = null, handleState = 'none') {
      if (handleState === 'none') {
        return null;
      }
      const value = meta && typeof meta === 'object' ? meta : {};
      return {
        fileName: asString(value.fileName),
        adapterId: normalizeProjectStorageAdapterId(value.adapterId),
      };
    }

    function compareActiveProjectSessionWithTab(session = null, tab = null) {
      const value = tab && typeof tab === 'object' ? tab : null;
      const mismatches = [];
      const recordMismatch = (field, sessionValue, tabValue) => {
        mismatches.push({ field, sessionValue, tabValue });
      };
      if (!value) {
        recordMismatch('activeTab', Boolean(session), null);
      }
      if (value && session && typeof session === 'object') {
        const sessionHandleState = normalizeProjectSaveHandleState(session.projectSaveHandleState, 'none');
        const tabHandleState = normalizeProjectSaveHandleState(value.projectSaveHandleState, 'none');
        const pairs = [
          ['sourceKind', session.sourceKind, normalizeProjectSourceKind(value.sourceKind, 'unknown')],
          ['sourceAdapterId', session.sourceAdapterId, normalizeProjectStorageAdapterId(value.sourceStorageAdapterId)],
          ['sourceProjectToken', session.sourceProjectToken || '', asString(value.sourceProjectToken)],
          ['lastSavedAdapterId', session.lastSavedAdapterId, normalizeProjectStorageAdapterId(value.lastSavedStorageAdapterId)],
          ['projectSaveHandleState', sessionHandleState, tabHandleState],
          ['dirty', session.dirty === true, value.unsaved === true],
        ];
        pairs.forEach(([field, left, right]) => {
          if ((left || null) !== (right || null)) recordMismatch(field, left || null, right || null);
        });
        const sessionHasHandle = Boolean(normalizeHandle(session.projectSaveHandle));
        const tabHasHandle = Boolean(normalizeHandle(value.projectSaveHandle));
        if (sessionHasHandle !== tabHasHandle) {
          recordMismatch('hasProjectSaveHandle', sessionHasHandle, tabHasHandle);
        }
        const sessionMeta = comparableMeta(session.projectSaveHandleMeta, sessionHandleState);
        const tabMeta = comparableMeta(value.projectSaveHandleMeta, tabHandleState);
        if ((sessionMeta?.fileName || null) !== (tabMeta?.fileName || null)) {
          recordMismatch('projectSaveHandleMeta.fileName', sessionMeta?.fileName || null, tabMeta?.fileName || null);
        }
        if ((sessionMeta?.adapterId || null) !== (tabMeta?.adapterId || null)) {
          recordMismatch('projectSaveHandleMeta.adapterId', sessionMeta?.adapterId || null, tabMeta?.adapterId || null);
        }
      }
      return {
        ok: mismatches.length === 0,
        mismatches,
        session: session && typeof session === 'object' ? session : null,
        tab: value,
      };
    }

    function getActiveProjectSessionDebugSummary(session = null) {
      if (!session || typeof session !== 'object') return null;
      return {
        projectId: session.projectId || '',
        documentId: session.documentId || '',
        sourceKind: session.sourceKind || '',
        sourceAdapterId: session.sourceAdapterId || null,
        canonicalPayloadFormat: session.canonicalPayloadFormat || '',
        canonicalSchemaVersion: session.canonicalSchemaVersion || 0,
        sourceProjectToken: session.sourceProjectToken || null,
        lastSavedAdapterId: session.lastSavedAdapterId || null,
        projectSaveHandleState: session.projectSaveHandleState || 'none',
        hasProjectSaveHandle: Boolean(session.projectSaveHandle),
        projectSaveHandleMeta: session.projectSaveHandleMeta || null,
        autosaveIdentity: session.autosaveIdentity || null,
        recoveryIdentity: session.recoveryIdentity || null,
        dirty: session.dirty === true,
        openedAt: session.openedAt || '',
        updatedAt: session.updatedAt || '',
      };
    }

    return Object.freeze({
      normalizeActiveProjectSession,
      createActiveProjectSession,
      replaceActiveProjectSession,
      updateActiveProjectSession,
      getActiveProjectSessionPersistenceState,
      getActiveProjectSessionSaveBinding,
      bindActiveProjectSessionSaveHandle,
      clearActiveProjectSessionSaveHandle,
      markActiveProjectSessionSaveHandleUnavailable,
      validateActiveProjectSession,
      compareActiveProjectSessionWithTab,
      getActiveProjectSessionDebugSummary,
    });
  }

  root.activeProjectSessionUtils = Object.freeze({
    createActiveProjectSessionUtils,
  });
})();
