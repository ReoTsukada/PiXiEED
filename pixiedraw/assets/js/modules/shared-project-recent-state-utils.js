(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectRecentStateUtils(rawScope = {}) {
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
  async function pruneSharedRecentEntriesToKnownProjects(knownProjectKeys = []) {
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }
    const normalizedKnownProjectKeys = new Set(
      (Array.isArray(knownProjectKeys) ? knownProjectKeys : [])
        .map(projectKey => normalizeMultiProjectKey(projectKey || ''))
        .filter(Boolean)
    );
    const existingEntries = await loadRecentProjectsMetadata();
    const nextEntries = existingEntries.filter(entry => {
      if (!isSharedRecentProjectEntry(entry)) {
        return true;
      }
      const projectKey = normalizeMultiProjectKey(entry.sharedProjectKey || '');
      return normalizedKnownProjectKeys.has(projectKey);
    });
    const limitedEntries = enforceSharedRecentProjectLimit(nextEntries);
    if (limitedEntries.length === existingEntries.length) {
      setRecentProjectsCache(limitedEntries);
      return;
    }
    await saveRecentProjectsList(existingEntries, limitedEntries);
    setRecentProjectsCache(limitedEntries);
  }

  async function enforceSharedProjectOwnershipLimit() {
    const effectiveLimit = Math.max(1, getMaxSharedProjectCount());
    const existingEntries = await loadRecentProjectsMetadata();
    const ownedProjectCount = getOwnedSharedRecentProjectEntries(existingEntries).length;
    const result = {
      effective_limit: effectiveLimit,
      owned_project_count: ownedProjectCount,
      deleted_project_keys: [],
      grace_active: ownedProjectCount > effectiveLimit,
      grace_until: '',
    };
    if (ownedProjectCount > effectiveLimit) {
      setMultiStatus(buildSharedProjectGraceMessage({
        effectiveLimit,
        ownedProjectCount,
      }), 'warn');
    }
    return result;
  }

  async function deleteOwnedSharedProjectFromBackend(entry = null) {
    if (!isSharedRecentProjectEntry(entry)) {
      return true;
    }
    const normalizedProjectKey = normalizeMultiProjectKey(entry?.sharedProjectKey || '');
    if (!normalizedProjectKey) {
      return false;
    }
    const currentUserId = typeof accountState?.userId === 'string' ? accountState.userId.trim() : '';
    const ownerUserId = typeof entry?.sharedProjectOwnerUserId === 'string' ? entry.sharedProjectOwnerUserId.trim() : '';
    if (!currentUserId || (ownerUserId && ownerUserId !== currentUserId)) {
      return false;
    }
    if (!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) {
      return false;
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return false;
      }
      const { data, error } = await supabase.rpc('pixieed_delete_owned_shared_project', {
        target_project_key: normalizedProjectKey,
      });
      if (error) {
        if (isMissingRpcFunction(error, 'pixieed_delete_owned_shared_project')) {
          console.warn('Shared project delete RPC is not deployed on this environment yet', {
            projectKey: normalizedProjectKey,
          });
          setMultiStatus(
            localizeText(
              '共有プロジェクト削除APIが未デプロイです。サーバー更新後に削除してください。',
              'Shared project deletion API is not deployed yet. Delete it after the server is updated.'
            ),
            'error'
          );
          return false;
        }
        handleSharedProjectsBackendError(error, 'delete-owned-shared-project');
        return false;
      }
      const result = Array.isArray(data) ? (data[0] || null) : (data || null);
      const deleted = Boolean(result?.deleted);
      if (deleted) {
        unhideSharedProjectFromRecentSync(normalizedProjectKey);
        await purgeDeletedSharedProjectLocalReferences(
          normalizedProjectKey,
          buildSharedRecentProjectId(normalizedProjectKey)
        );
      }
      return deleted;
    } catch (error) {
      handleSharedProjectsBackendError(error, 'delete-owned-shared-project-exception');
      return false;
    }
  }

  async function ensureSharedProjectCapacity(projectKey = '', { announce = true, countOwned = false } = {}) {
    if (!countOwned) {
      return true;
    }
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    const existingEntries = await loadRecentProjectsMetadata();
    if (normalizedProjectKey) {
      const existingOwnedEntry = existingEntries.find(entry => (
        isOwnedSharedRecentProjectEntry(entry)
        && normalizeMultiProjectKey(entry?.sharedProjectKey || '') === normalizedProjectKey
      )) || null;
      if (existingOwnedEntry) {
        return true;
      }
    }
    const { ownedProjectCount, effectiveLimit } = getSharedProjectOwnershipStatus(existingEntries);
    if (ownedProjectCount < effectiveLimit) {
      return true;
    }
    if (announce) {
      setMultiStatus(buildSharedProjectOpenBlockedMessage({
        effectiveLimit,
        ownedProjectCount,
      }), 'warn');
      openSharedProjectLimitDialog(effectiveLimit);
    }
    return false;
  }

  function resolveSharedProjectKeyForCurrentState(fallbackProjectKey = '') {
    const normalizedFallback = normalizeMultiProjectKey(fallbackProjectKey || '');
    if (normalizedFallback) {
      return normalizedFallback;
    }
    const currentProjectId = normalizeAutosaveProjectId(autosaveProjectId || '');
    const activeEntry = recentProjectsCache.get(currentProjectId) || null;
    if (isSharedRecentProjectEntry(activeEntry)) {
      return normalizeMultiProjectKey(activeEntry.sharedProjectKey || '');
    }
    if (activeSharedProjectKey) {
      const activeSharedEntry = recentProjectsCache.get(buildSharedRecentProjectId(activeSharedProjectKey)) || null;
      if (isSharedRecentProjectEntry(activeSharedEntry)) {
        return normalizeMultiProjectKey(activeSharedProjectKey);
      }
    }
    return '';
  }

  function isCurrentProjectSharedEntry() {
    const currentProjectId = normalizeAutosaveProjectId(autosaveProjectId || '');
    if (!currentProjectId) {
      return false;
    }
    if (isSharedRecentProjectEntry(recentProjectsCache.get(currentProjectId) || null)) {
      return true;
    }
    if (activeSharedProjectKey) {
      return currentProjectId === buildSharedRecentProjectId(activeSharedProjectKey);
    }
    return false;
  }

  function getCurrentSharedRecentProjectEntry(projectKey = '') {
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState(projectKey);
    if (!resolvedProjectKey) {
      return null;
    }
    const sharedProjectId = buildSharedRecentProjectId(resolvedProjectKey);
    return normalizeSharedRecentProjectEntry(recentProjectsCache.get(sharedProjectId) || {
      id: sharedProjectId,
      sharedProjectBackendId: '',
      sharedProjectKey: resolvedProjectKey,
      sharedProjectInviteToken: '',
      sharedProjectVisibility: 'private',
      sharedProjectRevision: activeSharedProjectKey === resolvedProjectKey ? activeSharedProjectRevision : 0,
      name: extractDocumentBaseName(state.documentName || DEFAULT_DOCUMENT_NAME),
      sharedRoleHint: prefersSharedProjectFlow()
        ? 'guest'
        : normalizeMultiDesiredRole(multiState.role || multiState.desiredRole || 'spectator'),
      sharedAutoJoin: false,
    });
  }

  function getTrackedSharedRecentProjectEntry(projectKey = '') {
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState(projectKey);
    if (!resolvedProjectKey) {
      return null;
    }
    const sharedProjectId = buildSharedRecentProjectId(resolvedProjectKey);
    const entry = recentProjectsCache.get(sharedProjectId) || null;
    return isSharedRecentProjectEntry(entry) ? normalizeSharedRecentProjectEntry(entry) : null;
  }

  function resolveSharedProjectKeyForLightweightLocalSave(projectId = '') {
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || autosaveProjectId || '');
    const directEntry = normalizedProjectId ? recentProjectsCache.get(normalizedProjectId) : null;
    if (isSharedRecentProjectEntry(directEntry)) {
      return normalizeMultiProjectKey(directEntry.sharedProjectKey || '');
    }
    const projectKeyFromId = getSharedProjectKeyFromProjectId(normalizedProjectId);
    if (projectKeyFromId) {
      return projectKeyFromId;
    }
    const currentSharedProjectKey = normalizeMultiProjectKey(activeSharedProjectKey || '');
    if (
      currentSharedProjectKey
      && (
        !normalizedProjectId
        || normalizedProjectId === buildSharedRecentProjectId(currentSharedProjectKey)
        || isCurrentProjectSharedEntry()
      )
    ) {
      return currentSharedProjectKey;
    }
    return '';
  }

  function shouldUseLightweightSharedProjectLocalSave(projectId = '') {
    return Boolean(resolveSharedProjectKeyForLightweightLocalSave(projectId));
  }

  async function recordSharedProjectLightweightLocalSave({
    projectId = '',
    projectKey = '',
    name = '',
    fileName = '',
    thumbnail = null,
  } = {}) {
    if (!AUTOSAVE_SUPPORTED) {
      return null;
    }
    const resolvedProjectKey = normalizeMultiProjectKey(
      projectKey || resolveSharedProjectKeyForLightweightLocalSave(projectId)
    );
    if (!resolvedProjectKey) {
      return null;
    }
    const existingEntry =
      getTrackedSharedRecentProjectEntry(resolvedProjectKey)
      || getCurrentSharedRecentProjectEntry(resolvedProjectKey)
      || null;
    const resolvedName = extractDocumentBaseName(
      name
      || existingEntry?.name
      || state.documentName
      || DEFAULT_DOCUMENT_NAME
    );
    const resolvedFileName = normalizeDocumentName(
      fileName
      || existingEntry?.fileName
      || `${resolvedName || DEFAULT_DOCUMENT_BASENAME}${PROJECT_FILE_EXTENSION}`
    );
    const isActiveSharedProject = normalizeMultiProjectKey(activeSharedProjectKey || '') === resolvedProjectKey;
    const backendProjectId = isActiveSharedProject && activeSharedProjectId
      ? activeSharedProjectId
      : (existingEntry?.sharedProjectBackendId || '');
    const revision = isActiveSharedProject
      ? activeSharedProjectRevision
      : existingEntry?.sharedProjectRevision;
    const structureRevision = isActiveSharedProject
      ? activeSharedProjectStructureRevision
      : existingEntry?.sharedProjectStructureRevision;
    return await upsertSharedRecentProjectEntry({
      projectKey: resolvedProjectKey,
      projectId: backendProjectId,
      inviteToken: existingEntry?.sharedProjectInviteToken || '',
      visibility: existingEntry?.sharedProjectVisibility || 'shared',
      name: resolvedName,
      fileName: resolvedFileName,
      thumbnail: typeof thumbnail === 'string' && thumbnail.length > 0
        ? thumbnail
        : existingEntry?.thumbnail || null,
      roleHint: existingEntry?.sharedRoleHint || getCurrentSharedProjectUiRole(resolvedProjectKey) || 'guest',
      membershipRole: isActiveSharedProject
        ? (activeSharedProjectMembershipRole || existingEntry?.sharedProjectMembershipRole || '')
        : (existingEntry?.sharedProjectMembershipRole || ''),
      ownerUserId: existingEntry?.sharedProjectOwnerUserId || '',
      autoJoin: existingEntry?.sharedAutoJoin !== false,
      revision: Math.max(0, Math.round(Number(revision) || 0)),
      structureRevision: Math.max(0, Math.round(Number(structureRevision) || 0)),
      project: null,
    });
  }

  function getCurrentSharedProjectMembershipRole(projectKey = activeSharedProjectKey) {
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState(projectKey);
    const currentUserId = typeof accountState.userId === 'string' ? accountState.userId.trim() : '';
    const trackedEntry = resolvedProjectKey ? getTrackedSharedRecentProjectEntry(resolvedProjectKey) : null;
    const trackedOwnerUserId = typeof trackedEntry?.sharedProjectOwnerUserId === 'string'
      ? trackedEntry.sharedProjectOwnerUserId.trim()
      : '';
    if (currentUserId && trackedOwnerUserId && currentUserId === trackedOwnerUserId) {
      return 'owner';
    }
    const activeRole = resolvedProjectKey && resolvedProjectKey === activeSharedProjectKey
      ? normalizeSharedProjectMembershipRole(activeSharedProjectMembershipRole)
      : '';
    if (activeRole) {
      return activeRole;
    }
    const selfMember = currentUserId && Array.isArray(sharedProjectMembers)
      ? sharedProjectMembers.find(row => {
          const rowUserId = typeof row?.userId === 'string' ? row.userId.trim() : '';
          if (!rowUserId || rowUserId !== currentUserId) {
            return false;
          }
          const rowProjectKey = normalizeMultiProjectKey(row?.projectKey || '');
          return !resolvedProjectKey || !rowProjectKey || rowProjectKey === resolvedProjectKey;
        }) || null
      : null;
    const selfMemberRole = normalizeSharedProjectMembershipRole(
      selfMember?.membershipRole || selfMember?.sharedProjectMembershipRole || selfMember?.role || ''
    );
    if (selfMemberRole) {
      return selfMemberRole;
    }
    const trackedRole = normalizeSharedProjectMembershipRole(trackedEntry?.sharedProjectMembershipRole || '');
    if (trackedRole) {
      return trackedRole;
    }
    const currentEntry = resolvedProjectKey ? getCurrentSharedRecentProjectEntry(resolvedProjectKey) : null;
    const currentOwnerUserId = typeof currentEntry?.sharedProjectOwnerUserId === 'string'
      ? currentEntry.sharedProjectOwnerUserId.trim()
      : '';
    if (currentUserId && currentOwnerUserId && currentUserId === currentOwnerUserId) {
      return 'owner';
    }
    const currentRole = normalizeSharedProjectMembershipRole(currentEntry?.sharedProjectMembershipRole || '');
    if (currentRole) {
      return currentRole;
    }
    const roleHint = typeof currentEntry?.sharedRoleHint === 'string' ? currentEntry.sharedRoleHint.trim() : '';
    if (roleHint === 'master') {
      return 'owner';
    }
    if (roleHint === 'spectator') {
      return 'viewer';
    }
    if (roleHint === 'guest') {
      return 'editor';
    }
    return isSharedProjectCollaborativeMode(resolvedProjectKey) ? 'editor' : '';
  }

  function getCurrentSharedProjectUiRole(projectKey = activeSharedProjectKey) {
    return mapSharedProjectMembershipRoleToUiRole(getCurrentSharedProjectMembershipRole(projectKey));
  }

  function canCurrentSharedProjectEdit(projectKey = activeSharedProjectKey) {
    const membershipRole = getCurrentSharedProjectMembershipRole(projectKey);
    if (!membershipRole) {
      return !activeSharedProjectOpenReadOnly;
    }
    return canSharedProjectMembershipRoleEdit(membershipRole);
  }

  function isCurrentSharedProjectReadOnlyMember(projectKey = activeSharedProjectKey) {
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState(projectKey);
    return Boolean(
      resolvedProjectKey
      && isSharedProjectCollaborativeMode(resolvedProjectKey)
      && !canCurrentSharedProjectEdit(resolvedProjectKey)
    );
  }

  function announceSharedProjectEditPermissionBlocked() {
    setMultiStatus(
      localizeText(
        'この共有プロジェクトは閲覧権限のため編集できません。',
        'This shared project is view-only for your account.'
      ),
      'warn'
    );
  }

  function resolveSharedRecentProjectRoleHint(projectKey = '', fallbackRole = 'guest') {
    const trackedEntry = getTrackedSharedRecentProjectEntry(projectKey);
    const trackedRoleHint = typeof trackedEntry?.sharedRoleHint === 'string' ? trackedEntry.sharedRoleHint.trim() : '';
    if (trackedRoleHint === 'master' || trackedRoleHint === 'guest') {
      return trackedRoleHint;
    }
    return fallbackRole === 'master' ? 'master' : 'guest';
  }

  function getSharedRecentProjectEntry(projectKey = '') {
    return getCurrentSharedRecentProjectEntry(projectKey);
  }

  function ensureBoundSharedProjectSessionFromCurrentState(projectKey = '') {
    if (!canUseSharedProjectsBackend()) {
      return null;
    }
    const currentEntry = getCurrentSharedRecentProjectEntry(projectKey);
    if (!currentEntry || !isSharedRecentProjectEntry(currentEntry)) {
      return null;
    }
    const entryProjectKey = normalizeMultiProjectKey(currentEntry.sharedProjectKey || '');
    if (!entryProjectKey) {
      return null;
    }
    const entryProjectId = typeof currentEntry.sharedProjectBackendId === 'string'
      ? currentEntry.sharedProjectBackendId.trim()
      : '';
    const needsRebind = (
      !activeSharedProjectKey
      || activeSharedProjectKey !== entryProjectKey
      || (entryProjectId && activeSharedProjectId !== entryProjectId)
    );
    if (needsRebind) {
      setActiveSharedProjectSession(
        entryProjectKey,
        Math.max(0, Math.round(Number(currentEntry.sharedProjectRevision) || 0)),
        Math.max(0, Math.round(Number(currentEntry.sharedProjectStructureRevision) || 0)),
        entryProjectId
      );
    }
    return currentEntry;
  }



  return Object.freeze({
    pruneSharedRecentEntriesToKnownProjects,
    enforceSharedProjectOwnershipLimit,
    deleteOwnedSharedProjectFromBackend,
    ensureSharedProjectCapacity,
    resolveSharedProjectKeyForCurrentState,
    isCurrentProjectSharedEntry,
    getCurrentSharedRecentProjectEntry,
    getTrackedSharedRecentProjectEntry,
    resolveSharedProjectKeyForLightweightLocalSave,
    shouldUseLightweightSharedProjectLocalSave,
    recordSharedProjectLightweightLocalSave,
    getCurrentSharedProjectMembershipRole,
    getCurrentSharedProjectUiRole,
    canCurrentSharedProjectEdit,
    isCurrentSharedProjectReadOnlyMember,
    announceSharedProjectEditPermissionBlocked,
    resolveSharedRecentProjectRoleHint,
    getSharedRecentProjectEntry,
    ensureBoundSharedProjectSessionFromCurrentState,
  });
      }
    })(scope);
  }

  root.sharedProjectRecentStateUtils = Object.freeze({
    createSharedProjectRecentStateUtils,
  });
})();
