(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectStorageUtils({
    RECENT_PROJECT_STORAGE_LOCAL,
    RECENT_PROJECT_STORAGE_SHARED,
  } = {}) {
    function normalizeAutosaveProjectId(value) {
      if (typeof value !== 'string') {
        return '';
      }
      const trimmed = value.trim();
      return trimmed || '';
    }

    function normalizeRecentProjectStorageKind(value) {
      return value === RECENT_PROJECT_STORAGE_SHARED
        ? RECENT_PROJECT_STORAGE_SHARED
        : RECENT_PROJECT_STORAGE_LOCAL;
    }

    function getRecentProjectStorageKind(entry) {
      return normalizeRecentProjectStorageKind(entry?.storageKind);
    }

    function normalizeRecentProjectAccountUserId(value = '') {
      const normalized = typeof value === 'string' ? value.trim() : '';
      return normalized || 'anonymous';
    }

    function parseAutosaveTabLockPayload(raw) {
      if (typeof raw !== 'string' || !raw.trim()) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          return null;
        }
        const owner = typeof parsed.owner === 'string' ? parsed.owner : '';
        const expiresAt = Number(parsed.expiresAt);
        if (!owner || !Number.isFinite(expiresAt)) {
          return null;
        }
        return {
          owner,
          expiresAt: Math.round(expiresAt),
          projectId: normalizeAutosaveProjectId(parsed.projectId || ''),
        };
      } catch (error) {
        return null;
      }
    }

    return Object.freeze({
      normalizeAutosaveProjectId,
      normalizeRecentProjectStorageKind,
      getRecentProjectStorageKind,
      normalizeRecentProjectAccountUserId,
      parseAutosaveTabLockPayload,
    });
  }

  root.projectStorageUtils = Object.freeze({
    createProjectStorageUtils,
  });
})();
