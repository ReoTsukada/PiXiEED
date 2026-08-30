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
    now = () => new Date().toISOString(),
  } = {}) {
    const asString = value => (typeof value === 'string' ? value.trim() : '');
    const normalizeTimestamp = value => {
      const candidate = asString(value);
      return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : '';
    };
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
        const pairs = [
          ['sourceKind', session.sourceKind, normalizeProjectSourceKind(value.sourceKind, 'unknown')],
          ['sourceAdapterId', session.sourceAdapterId, normalizeProjectStorageAdapterId(value.sourceStorageAdapterId)],
          ['sourceProjectToken', session.sourceProjectToken || '', asString(value.sourceProjectToken)],
          ['lastSavedAdapterId', session.lastSavedAdapterId, normalizeProjectStorageAdapterId(value.lastSavedStorageAdapterId)],
          ['dirty', session.dirty === true, value.unsaved === true],
        ];
        pairs.forEach(([field, left, right]) => {
          if ((left || null) !== (right || null)) recordMismatch(field, left || null, right || null);
        });
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
      validateActiveProjectSession,
      compareActiveProjectSessionWithTab,
      getActiveProjectSessionDebugSummary,
    });
  }

  root.activeProjectSessionUtils = Object.freeze({
    createActiveProjectSessionUtils,
  });
})();
