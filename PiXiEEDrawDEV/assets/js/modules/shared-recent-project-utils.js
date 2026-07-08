(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedRecentProjectUtils(rawScope = {}) {
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
  function buildSharedRecentProjectId(projectKey) {
    const normalizedKey = normalizeMultiProjectKey(projectKey);
    return normalizedKey ? `${SHARED_PROJECT_ID_PREFIX}${normalizedKey}` : '';
  }

  function isSharedRecentProjectEntry(entry) {
    return getRecentProjectStorageKind(entry) === RECENT_PROJECT_STORAGE_SHARED;
  }

  function getSharedRecentProjectEntries(entries = Array.from(recentProjectsCache.values())) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries.filter(entry => isSharedRecentProjectEntry(entry));
  }

  function isOwnedSharedRecentProjectEntry(entry = null) {
    if (!isSharedRecentProjectEntry(entry)) {
      return false;
    }
    const ownerUserId = typeof entry?.sharedProjectOwnerUserId === 'string'
      ? entry.sharedProjectOwnerUserId.trim()
      : '';
    const currentUserId = typeof accountState?.userId === 'string'
      ? accountState.userId.trim()
      : '';
    if (ownerUserId && currentUserId) {
      return ownerUserId === currentUserId;
    }
    if (currentUserId) {
      return false;
    }
    const roleHint = typeof entry?.sharedRoleHint === 'string' ? entry.sharedRoleHint.trim() : '';
    return roleHint === 'master';
  }

  function getHiddenSharedProjectsStorageKey() {
    const userId = typeof accountState?.userId === 'string' ? accountState.userId.trim() : '';
    return `${HIDDEN_SHARED_PROJECT_KEYS_STORAGE_PREFIX}${userId || 'anonymous'}`;
  }

  function readHiddenSharedProjectKeys() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return new Set();
    }
    try {
      const raw = window.localStorage.getItem(getHiddenSharedProjectsStorageKey());
      const parsed = JSON.parse(raw || '[]');
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      return new Set(parsed.map(value => normalizeMultiProjectKey(value || '')).filter(Boolean));
    } catch (_error) {
      return new Set();
    }
  }

  function writeHiddenSharedProjectKeys(projectKeys = []) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      const normalizedKeys = [...new Set((Array.isArray(projectKeys) ? projectKeys : [])
        .map(value => normalizeMultiProjectKey(value || ''))
        .filter(Boolean))];
      window.localStorage.setItem(getHiddenSharedProjectsStorageKey(), JSON.stringify(normalizedKeys));
    } catch (_error) {
      // Ignore localStorage write failures.
    }
  }

  function hideSharedProjectFromRecentSync(projectKey = '') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return;
    }
    const hiddenKeys = readHiddenSharedProjectKeys();
    hiddenKeys.add(normalizedProjectKey);
    writeHiddenSharedProjectKeys([...hiddenKeys]);
  }

  function unhideSharedProjectFromRecentSync(projectKey = '') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return;
    }
    const hiddenKeys = readHiddenSharedProjectKeys();
    if (!hiddenKeys.delete(normalizedProjectKey)) {
      return;
    }
    writeHiddenSharedProjectKeys([...hiddenKeys]);
  }

  function isSharedProjectHiddenFromRecentSync(projectKey = '') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return false;
    }
    return readHiddenSharedProjectKeys().has(normalizedProjectKey);
  }

  function getOwnedSharedRecentProjectEntries(entries = Array.from(recentProjectsCache.values())) {
    return getSharedRecentProjectEntries(entries).filter(entry => isOwnedSharedRecentProjectEntry(entry));
  }

  function enforceSharedRecentProjectLimit(entries = []) {
    if (!Array.isArray(entries) || !entries.length) {
      return [];
    }
    return entries.slice();
  }

  function buildSharedProjectLimitMessage(maxSharedProjects = getMaxSharedProjectCount()) {
    if (maxSharedProjects > SHARED_PROJECT_LIMIT_DEFAULT) {
      return localizeText(
        `自分が作成した共有プロジェクトは同時に最大 ${maxSharedProjects} 件まで使えます`,
        `You can have up to ${maxSharedProjects} shared projects you own at the same time`
      );
    }
    return localizeText(
      '自分が作成した共有プロジェクトは同時に1件まで使えます。',
      'You can have 1 shared project you own at the same time.'
    );
  }

  function getSharedProjectOwnershipStatus(entries = null) {
    const sourceEntries = Array.isArray(entries) ? entries : Array.from(recentProjectsCache.values());
    const ownedProjectCount = getOwnedSharedRecentProjectEntries(sourceEntries).length;
    const effectiveLimit = Math.max(1, getMaxSharedProjectCount());
    const excessCount = Math.max(0, ownedProjectCount - effectiveLimit);
    return {
      ownedProjectCount,
      effectiveLimit,
      excessCount,
      overLimit: excessCount > 0,
    };
  }

  function buildSharedProjectCreationBlockedMessage({
    effectiveLimit = getMaxSharedProjectCount(),
    ownedProjectCount = 0,
    excessCount = 0,
  } = {}) {
    const normalizedOwnedProjectCount = Math.max(0, Math.round(Number(ownedProjectCount) || 0));
    const normalizedEffectiveLimit = Math.max(1, Math.round(Number(effectiveLimit) || getMaxSharedProjectCount()));
    const normalizedExcessCount = Math.max(0, Math.round(Number(excessCount) || 0));
    return localizeText(
      `共有プロジェクトは ${normalizedOwnedProjectCount} 件あります。現在の上限は ${normalizedEffectiveLimit} 件です。既存の共有プロジェクトはそのまま開けますが、新しく作成するには ${normalizedExcessCount} 件整理してください。`,
      `You currently have ${normalizedOwnedProjectCount} shared projects. Your current limit is ${normalizedEffectiveLimit}. Existing shared projects stay available, but you need to remove ${normalizedExcessCount} before creating a new one.`
    );
  }

  function buildSharedProjectOpenBlockedMessage({
    effectiveLimit = getMaxSharedProjectCount(),
    ownedProjectCount = 0,
  } = {}) {
    const normalizedOwnedProjectCount = Math.max(0, Math.round(Number(ownedProjectCount) || 0));
    const normalizedEffectiveLimit = Math.max(1, Math.round(Number(effectiveLimit) || getMaxSharedProjectCount()));
    const reduceCount = Math.max(1, normalizedOwnedProjectCount - normalizedEffectiveLimit + 1);
    return localizeText(
      `共有プロジェクトは ${normalizedOwnedProjectCount} 件あり、現在の上限 ${normalizedEffectiveLimit} 件以上です。この状態では共有プロジェクトを開けません。先に ${reduceCount} 件整理してください。`,
      `You have ${normalizedOwnedProjectCount} shared projects, which is at or above your current limit of ${normalizedEffectiveLimit}. Shared projects cannot be opened in this state. Please remove ${reduceCount} first.`
    );
  }

  function buildSharedProjectGraceMessage({
    effectiveLimit = getMaxSharedProjectCount(),
    ownedProjectCount = 0,
    graceUntil = '',
  } = {}) {
    return buildSharedProjectCreationBlockedMessage({
      effectiveLimit,
      ownedProjectCount,
      excessCount: Math.max(0, Math.round(Number(ownedProjectCount) || 0) - Math.max(1, Math.round(Number(effectiveLimit) || getMaxSharedProjectCount()))),
    });
  }

  function buildSharedProjectUsageLabel({
    ownedProjectCount = 0,
    effectiveLimit = getMaxSharedProjectCount(),
  } = {}) {
    const normalizedOwnedProjectCount = Math.max(0, Math.round(Number(ownedProjectCount) || 0));
    const normalizedEffectiveLimit = Math.max(1, Math.round(Number(effectiveLimit) || getMaxSharedProjectCount()));
    return `${normalizedOwnedProjectCount}/${normalizedEffectiveLimit}`;
  }

  function normalizeSharedProjectMembershipRole(role = '') {
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    if (normalizedRole === 'owner' || normalizedRole === 'master') {
      return 'owner';
    }
    if (
      normalizedRole === 'editor'
      || normalizedRole === 'guest'
      || normalizedRole === 'participant'
      || normalizedRole === 'collaborator'
      || normalizedRole === 'member'
    ) {
      return 'editor';
    }
    if (
      normalizedRole === 'viewer'
      || normalizedRole === 'spectator'
      || normalizedRole === 'read_only'
      || normalizedRole === 'read-only'
      || normalizedRole === 'readonly'
    ) {
      return 'viewer';
    }
    if (normalizedRole === 'pending') {
      return 'pending';
    }
    return '';
  }

  function mapSharedProjectMembershipRoleToUiRole(role = '') {
    const normalizedRole = normalizeSharedProjectMembershipRole(role);
    if (normalizedRole === 'owner') {
      return 'master';
    }
    if (normalizedRole === 'viewer' || normalizedRole === 'pending') {
      return 'spectator';
    }
    return 'guest';
  }

  function canSharedProjectMembershipRoleEdit(role = '') {
    const normalizedRole = normalizeSharedProjectMembershipRole(role);
    return normalizedRole === 'owner' || normalizedRole === 'editor';
  }

  function normalizeSharedRecentProjectEntry(entry = {}) {
    const projectKey = normalizeMultiProjectKey(entry.sharedProjectKey || entry.projectKey || '');
    if (!projectKey) {
      return null;
    }
    const sharedRecentProjectId = buildSharedRecentProjectId(projectKey);
    const id = normalizeAutosaveProjectId(entry.id || sharedRecentProjectId);
    if (!id) {
      return null;
    }
    const roleHintSource = typeof entry.sharedRoleHint === 'string' ? entry.sharedRoleHint.trim() : '';
    const sharedRoleHint = roleHintSource === 'master' || roleHintSource === 'guest'
      ? roleHintSource
      : 'guest';
    const fileName = normalizeDocumentName(entry.fileName || entry.name || `${projectKey}.pixiedraw`);
    const name = extractDocumentBaseName(entry.name || fileName || projectKey);
    const updatedAt = Number.isFinite(Date.parse(entry.updatedAt || ''))
      ? entry.updatedAt
      : new Date().toISOString();
    const sharedProjectRevision = Math.max(0, Math.round(Number(entry.sharedProjectRevision) || 0));
    const sharedProjectStructureRevision = Math.max(0, Math.round(Number(entry.sharedProjectStructureRevision) || 0));
    const sharedProjectMembershipRole = normalizeSharedProjectMembershipRole(
      entry.sharedProjectMembershipRole || entry.membershipRole || ''
    );
    const sharedProjectOwnerUserId = typeof entry.sharedProjectOwnerUserId === 'string' && entry.sharedProjectOwnerUserId.trim()
      ? entry.sharedProjectOwnerUserId.trim()
      : '';
    const cachedProjectPayload = entry.project && typeof entry.project === 'object'
      ? entry.project
      : null;
    return {
      id,
      accountUserId: normalizeRecentProjectAccountUserId(entry.accountUserId || ''),
      storageKind: RECENT_PROJECT_STORAGE_SHARED,
      sharedProjectBackendId: typeof entry.sharedProjectBackendId === 'string' && entry.sharedProjectBackendId.trim()
        ? entry.sharedProjectBackendId.trim()
        : '',
      sharedProjectId: sharedRecentProjectId,
      sharedProjectKey: projectKey,
      sharedProjectInviteToken: typeof entry.sharedProjectInviteToken === 'string' && entry.sharedProjectInviteToken.trim()
        ? entry.sharedProjectInviteToken.trim()
        : '',
      sharedProjectVisibility: typeof entry.sharedProjectVisibility === 'string' && entry.sharedProjectVisibility.trim()
        ? entry.sharedProjectVisibility.trim()
        : 'private',
      sharedProjectRevision,
      sharedProjectStructureRevision,
      sharedProjectMembershipRole,
      sharedProjectOwnerUserId,
      sharedProjectTransferLocked: Boolean(entry.sharedProjectTransferLocked),
      sharedRoleHint,
      sharedAutoJoin: entry.sharedAutoJoin !== false,
      name,
      fileName,
      updatedAt,
      thumbnail: typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0 ? entry.thumbnail : null,
      thumbnailSheetId: typeof entry.thumbnailSheetId === 'string' ? entry.thumbnailSheetId : '',
      project: cachedProjectPayload,
    };
  }

        return Object.freeze({
          buildSharedRecentProjectId,
          isSharedRecentProjectEntry,
          getSharedRecentProjectEntries,
          isOwnedSharedRecentProjectEntry,
          getHiddenSharedProjectsStorageKey,
          readHiddenSharedProjectKeys,
          writeHiddenSharedProjectKeys,
          hideSharedProjectFromRecentSync,
          unhideSharedProjectFromRecentSync,
          isSharedProjectHiddenFromRecentSync,
          getOwnedSharedRecentProjectEntries,
          enforceSharedRecentProjectLimit,
          buildSharedProjectLimitMessage,
          getSharedProjectOwnershipStatus,
          buildSharedProjectCreationBlockedMessage,
          buildSharedProjectOpenBlockedMessage,
          buildSharedProjectGraceMessage,
          buildSharedProjectUsageLabel,
          normalizeSharedProjectMembershipRole,
          mapSharedProjectMembershipRoleToUiRole,
          canSharedProjectMembershipRoleEdit,
          normalizeSharedRecentProjectEntry,
        });
      }
    })(scope);
  }

  root.sharedRecentProjectUtils = Object.freeze({
    createSharedRecentProjectUtils,
  });
})();
