(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectSnapshotFetchUtils(rawScope = {}) {
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
  function shouldTrustSharedProjectSnapshotRevision(snapshotRevision = 0, latestRevision = 0) {
    const normalizedSnapshotRevision = Math.max(0, Math.round(Number(snapshotRevision) || 0));
    const normalizedLatestRevision = Math.max(0, Math.round(Number(latestRevision) || 0));
    if (normalizedLatestRevision <= 0) {
      return true;
    }
    if (normalizedSnapshotRevision <= 0 && normalizedLatestRevision > 0) {
      return false;
    }
    return normalizedSnapshotRevision <= normalizedLatestRevision;
  }

  function readSharedProjectRevisionNumber(projectRecord, fieldName, fallbackValue = 0) {
    if (projectRecord && Object.prototype.hasOwnProperty.call(projectRecord, fieldName)) {
      const rawValue = projectRecord[fieldName];
      if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue)) {
          return Math.max(0, Math.round(numericValue));
        }
      }
    }
    return Math.max(0, Math.round(Number(fallbackValue) || 0));
  }

  function getSharedProjectLatestRevision(projectRecord) {
    return readSharedProjectRevisionNumber(projectRecord, 'latest_revision', 0);
  }

  function getSharedProjectLatestStructureRevision(projectRecord) {
    return readSharedProjectRevisionNumber(projectRecord, 'latest_structure_revision', 0);
  }

  function getSharedProjectSnapshotRevision(projectRecord) {
    return readSharedProjectRevisionNumber(projectRecord, 'latest_snapshot_revision', 0);
  }

  function getSharedProjectSnapshotStructureRevision(projectRecord) {
    return readSharedProjectRevisionNumber(projectRecord, 'latest_snapshot_structure_revision', 0);
  }

  async function ensureSharedProjectMembership(projectKey, { createIfMissing = false, title = '', inviteToken = '', visibility = 'private' } = {}) {
    if (!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) {
      return null;
    }
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey);
    if (!normalizedProjectKey) {
      return null;
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return null;
      }
      const { data, error } = await supabase.rpc('pixieed_ensure_shared_project_membership', {
        target_project_key: normalizedProjectKey,
        target_title: createSharedProjectSnapshotTitle(title),
        target_invite_token: (typeof inviteToken === 'string' && inviteToken.trim()) || createSharedProjectInviteToken(),
        target_visibility: visibility === MULTI_ROOM_VISIBILITY_PUBLIC ? 'public' : 'shared',
        target_create_if_missing: Boolean(createIfMissing),
      });
      if (error) {
        handleSharedProjectsBackendError(error, 'ensure-membership-rpc');
        return null;
      }
      const project = Array.isArray(data) ? (data[0] || null) : (data || null);
      return project || null;
    } catch (error) {
      handleSharedProjectsBackendError(error, 'ensure-membership-exception');
      return null;
    }
  }

  async function loadSharedProjectSnapshotRecord(projectKey, { createIfMissing = false, title = '' } = {}) {
    const project = await ensureSharedProjectMembership(projectKey, { createIfMissing, title });
    return project || null;
  }

  async function loadSharedProjectSnapshotRecordByInvite(inviteToken, { createIfMissing = false, title = '' } = {}) {
    if (!canUseSharedProjectsBackend()) {
      return null;
    }
    const normalizedInviteToken = typeof inviteToken === 'string' ? inviteToken.trim() : '';
    if (!normalizedInviteToken) {
      return null;
    }
    if (!await ensureSharedProjectBackendSession()) {
      return null;
    }
    let project = null;
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return null;
      }
      const joined = await supabase.rpc('pixieed_join_shared_project_by_invite_token', {
        target_invite_token: normalizedInviteToken,
      });
      if (joined.error) {
        handleSharedProjectsBackendError(joined.error, 'join-by-token');
        return null;
      }
      project = Array.isArray(joined.data) ? (joined.data[0] || null) : (joined.data || null);
    } catch (error) {
      handleSharedProjectsBackendError(error, 'join-by-token-exception');
      return null;
    }
    return project || null;
  }

  async function awaitFreshSharedProjectSnapshot(projectRecord, {
    inviteToken = '',
    minRevision = 0,
    requireExactLatest = false,
    timeoutMs = 1800,
    pollIntervalMs = 160,
  } = {}) {
    const initialProject = projectRecord && typeof projectRecord === 'object' ? projectRecord : null;
    if (!initialProject) {
      return null;
    }
    const normalizedInviteToken = typeof inviteToken === 'string' ? inviteToken.trim() : '';
    const targetProjectKey = normalizeMultiProjectKey(initialProject.project_key || activeSharedProjectKey);
    const requiredRevision = Math.max(
      0,
      Math.round(Number(minRevision) || 0),
      Math.round(Number(initialProject.latest_revision) || 0)
    );
    let candidate = initialProject;
    let candidateSnapshotRevision = getSharedProjectSnapshotRevision(candidate);
    if (candidateSnapshotRevision >= requiredRevision && (!requireExactLatest || candidateSnapshotRevision === requiredRevision)) {
      return candidate;
    }
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < Math.max(0, Math.round(Number(timeoutMs) || 0))) {
      await new Promise(resolve => {
        window.setTimeout(resolve, Math.max(32, Math.round(Number(pollIntervalMs) || 160)));
      });
      const nextProject = normalizedInviteToken
        ? await loadSharedProjectSnapshotRecordByInvite(normalizedInviteToken, {
            createIfMissing: false,
            title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
          })
        : await loadSharedProjectSnapshotRecord(targetProjectKey, {
            createIfMissing: false,
            title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
          });
      if (!nextProject?.project_key) {
        continue;
      }
      candidate = nextProject;
      candidateSnapshotRevision = getSharedProjectSnapshotRevision(candidate);
      if (candidateSnapshotRevision >= requiredRevision && (!requireExactLatest || candidateSnapshotRevision === requiredRevision)) {
        return candidate;
      }
    }
    return candidate;
  }

  return {
    shouldTrustSharedProjectSnapshotRevision,
    readSharedProjectRevisionNumber,
    getSharedProjectLatestRevision,
    getSharedProjectLatestStructureRevision,
    getSharedProjectSnapshotRevision,
    getSharedProjectSnapshotStructureRevision,
    ensureSharedProjectMembership,
    loadSharedProjectSnapshotRecord,
    loadSharedProjectSnapshotRecordByInvite,
    awaitFreshSharedProjectSnapshot,
  };
      }
    })(scope);
  }

  root.sharedProjectSnapshotFetchUtils = Object.freeze({
    createSharedProjectSnapshotFetchUtils,
  });
})();
