(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectWorkflowUtils(rawScope = {}) {
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
  async function fetchSharedProjectRecord(projectKey) {
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
      return await fetchSharedProjectRecordViaRpc(supabase, normalizedProjectKey, 'fetch');
    } catch (error) {
      handleSharedProjectsBackendError(error, 'fetch-exception');
      return null;
    }
  }

  async function claimSharedProjectSessionLock(projectKey, projectId = '') {
    if (!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) {
      return false;
    }
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    if (!normalizedProjectKey) {
      return false;
    }
    if (!normalizedProjectId) {
      setMultiStatus(
        localizeText(
          '共有プロジェクトの識別子が壊れているため開けません。共有一覧を更新してから再度開いてください。',
          'This shared project is missing its identifier and cannot be opened. Refresh your shared project list and try again.'
        ),
        'error'
      );
      console.warn('[shared-backend] missing project id before claiming session lock', {
        projectKey: normalizedProjectKey,
        projectId,
      });
      return false;
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return false;
      }
      const { data, error } = await supabase.rpc('pixieed_claim_shared_project_session', {
        target_project_key: normalizedProjectKey,
        target_project_id: normalizedProjectId,
        target_device_id: ensureSharedProjectSessionInstanceId(),
        target_session_id: ensureSharedProjectSessionInstanceId(),
      });
      if (error) {
        if (isRecoverableSharedBackendPreflightError(error)) {
          setMultiStatus(
            localizeText(
              '共有セッション確認に一時失敗したため、ロック確認を省略して共有プロジェクトを開きます。一部の同時利用制御は無効です。',
              'Shared session checking temporarily failed, so the project will open without session locking. Some concurrent-use protections are disabled.'
            ),
            'warn'
          );
          console.debug('[shared-backend] bypassing claim-shared-session after recoverable preflight failure', {
            projectKey: normalizedProjectKey,
            projectId: normalizedProjectId,
            message: String(error?.message || ''),
          });
          return true;
        }
        if (String(error?.code || '') === '42804') {
          setMultiStatus(
            localizeText(
              '共有セッション確認APIが古いため、ロック確認を省略して共有プロジェクトを開きます。一部の同時利用制御は無効です。',
              'The shared session claim API is outdated, so the project will open without session locking. Some concurrent-use protections are disabled.'
            ),
            'warn'
          );
          console.warn('[shared-backend] bypassing broken claim-shared-session rpc', {
            projectKey: normalizedProjectKey,
            projectId: normalizedProjectId,
            code: error?.code || '',
            message: error?.message || '',
            details: error?.details || '',
          });
          return true;
        }
        if (Number(error?.status || 0) === 400) {
          setMultiStatus(
            localizeText(
              'この共有プロジェクトのセッション情報が古いか壊れています。共有一覧を更新してから開き直してください。',
              'This shared project has stale or broken session metadata. Refresh your shared project list and open it again.'
            ),
            'error'
          );
        }
        handleSharedProjectsBackendError(error, 'claim-shared-session');
        return false;
      }
      const result = Array.isArray(data) ? (data[0] || null) : (data || null);
      if (result?.allowed === true) {
        return true;
      }
      if (result?.conflict_reason === 'same-account-active-elsewhere') {
        setMultiStatus(
          localizeText(
            'この共有プロジェクトは同じアカウントの別端末で開かれているため、この端末では開けません。',
            'This shared project is already open on another device with the same account, so it cannot be opened here.'
          ),
          'error'
        );
        return false;
      }
      setMultiStatus(
        localizeText(
          'この共有プロジェクトは現在開けません。別端末で開いている可能性があります。',
          'This shared project cannot be opened right now. It may already be open on another device.'
        ),
        'error'
      );
      return false;
    } catch (error) {
      if (isRecoverableSharedBackendPreflightError(error)) {
        setMultiStatus(
          localizeText(
            '共有セッション確認に一時失敗したため、ロック確認を省略して共有プロジェクトを開きます。一部の同時利用制御は無効です。',
            'Shared session checking temporarily failed, so the project will open without session locking. Some concurrent-use protections are disabled.'
          ),
          'warn'
        );
        console.debug('[shared-backend] bypassing claim-shared-session exception after recoverable preflight failure', {
          projectKey: normalizedProjectKey,
          projectId: normalizedProjectId,
          message: String(error?.message || ''),
        });
        return true;
      }
      handleSharedProjectsBackendError(error, 'claim-shared-session-exception');
      return false;
    }
  }

  async function touchSharedProjectSessionLock(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey || !accountState.isLoggedIn || accountState.isAnonymous) {
      return false;
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return false;
      }
      const { data, error } = await supabase.rpc('pixieed_touch_shared_project_session', {
        target_project_key: normalizedProjectKey,
        target_session_id: ensureSharedProjectSessionInstanceId(),
      });
      if (error) {
        handleSharedProjectsBackendError(error, 'touch-shared-session');
        return false;
      }
      return data === true || (Array.isArray(data) && data[0] === true);
    } catch (error) {
      handleSharedProjectsBackendError(error, 'touch-shared-session-exception');
      return false;
    }
  }

  async function releaseSharedProjectSessionLock(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey || !accountState.isLoggedIn || accountState.isAnonymous) {
      return false;
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return false;
      }
      const { data, error } = await supabase.rpc('pixieed_release_shared_project_session', {
        target_project_key: normalizedProjectKey,
        target_session_id: ensureSharedProjectSessionInstanceId(),
      });
      if (error) {
        if (isRecoverableSharedBackendPreflightError(error)) {
          console.debug('[shared-backend] release-shared-session skipped after recoverable preflight failure', {
            projectKey: normalizedProjectKey,
            message: String(error?.message || ''),
          });
          return true;
        }
        handleSharedProjectsBackendError(error, 'release-shared-session');
        return false;
      }
      return data === true || (Array.isArray(data) && data[0] === true);
    } catch (error) {
      if (isRecoverableSharedBackendPreflightError(error)) {
        console.debug('[shared-backend] release-shared-session exception skipped after recoverable preflight failure', {
          projectKey: normalizedProjectKey,
          message: String(error?.message || ''),
        });
        return true;
      }
      handleSharedProjectsBackendError(error, 'release-shared-session-exception');
      return false;
    }
  }

  function ensureSharedProjectSessionHeartbeat() {
    if (sharedProjectSessionHeartbeatTimer !== null) {
      window.clearInterval(sharedProjectSessionHeartbeatTimer);
      sharedProjectSessionHeartbeatTimer = null;
    }
    if (!activeSharedProjectKey || !accountState.isLoggedIn || accountState.isAnonymous) {
      return;
    }
    sharedProjectSessionHeartbeatTimer = window.setInterval(() => {
      if (!activeSharedProjectKey || !accountState.isLoggedIn || accountState.isAnonymous) {
        return;
      }
      touchSharedProjectSessionLock(activeSharedProjectKey).catch(() => {});
    }, SHARED_PROJECT_SESSION_HEARTBEAT_INTERVAL_MS);
  }

  async function fetchSharedProjectRecordByInviteToken(inviteToken) {
    if (!canLookupSharedProjectsBackend()) {
      return null;
    }
    const normalizedInviteToken = typeof inviteToken === 'string' ? inviteToken.trim() : '';
    if (!normalizedInviteToken) {
      return null;
    }
    try {
      const supabase = accountState.isLoggedIn
        ? await ensurePixieedAccountClient()
        : await ensureMultiSupabaseClient();
      if (!supabase) {
        return null;
      }
      const { data, error } = await supabase
        .rpc('pixieed_get_shared_project_by_invite_token', {
          target_invite_token: normalizedInviteToken,
        });
      if (error) {
        handleSharedProjectsBackendError(error, 'fetch-by-token');
        return null;
      }
      return Array.isArray(data) ? (data[0] || null) : (data || null);
    } catch (error) {
      handleSharedProjectsBackendError(error, 'fetch-by-token-exception');
      return null;
    }
  }

  async function fetchSharedProjectOpsSince(projectKey, afterRevision = 0, limit = 256) {
    if (!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) {
      return [];
    }
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey);
    if (!normalizedProjectKey) {
      return [];
    }
    const startedAt = Date.now();
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return [];
      }
      const rpcDebugInfo = {
        context: 'fetch-ops-since',
        projectKey: normalizedProjectKey,
        afterRevision: Math.max(0, Math.round(Number(afterRevision) || 0)),
        limit: Math.max(1, Math.round(Number(limit) || 256)),
        locationOrigin: typeof window !== 'undefined' && window.location ? String(window.location.origin || '') : '',
        locationHref: typeof window !== 'undefined' && window.location ? String(window.location.href || '') : '',
        referrer: typeof document !== 'undefined' ? String(document.referrer || '') : '',
        visibilityState: typeof document !== 'undefined' ? String(document.visibilityState || '') : '',
        online: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : null,
      };
      const shouldLogFetchStart = (Date.now() - sharedProjectLastEmptyOpsFetchLogAt) > 30000;
      if (shouldLogFetchStart) {
        console.debug('[shared-backend] fetch-ops-since start', rpcDebugInfo);
      }
      const { data, error } = await supabase.rpc('pixieed_get_shared_project_ops_since', {
        target_project_key: normalizedProjectKey,
        after_revision: Math.max(0, Math.round(Number(afterRevision) || 0)),
        max_ops: Math.max(1, Math.round(Number(limit) || 256)),
      });
      if (error) {
        if (isRecoverableSharedBackendPreflightError(error)) {
          console.debug('[shared-backend] fetch-ops-since skipped after recoverable preflight failure', rpcDebugInfo);
          return [];
        }
        console.warn('[shared-backend] fetch-ops-since failed', rpcDebugInfo);
        handleSharedProjectsBackendError(error, 'fetch-ops-since');
        return [];
      }
      const result = Array.isArray(data) ? data : [];
      sharedProjectLastOpsFetchSucceededAt = Date.now();
      confirmSharedProjectLocalOpsFromServerOps(result, { source: 'refresh' });
      const shouldLogEmptyResult = result.length > 0 || (Date.now() - sharedProjectLastEmptyOpsFetchLogAt) > 30000;
      if (shouldLogEmptyResult) {
        if (!result.length) {
          sharedProjectLastEmptyOpsFetchLogAt = Date.now();
        }
        console.debug('[shared-backend] fetch-ops-since result', {
          ...rpcDebugInfo,
          durationMs: Math.max(0, Date.now() - startedAt),
          opCount: result.length,
        });
      }
      if (result.length > 0) {
        markSharedProjectTrafficActivity('rx');
      } else if (
        normalizedProjectKey === activeSharedProjectKey
        && activeSharedProjectDocumentLoaded
        && hasUsableActiveSharedProjectDocumentState()
        && !sharedProjectPendingRemoteOps.size
      ) {
        markSharedProjectDrawReadinessVerified('ops-fetch-empty');
      }
      return result;
    } catch (error) {
      if (isRecoverableSharedBackendPreflightError(error)) {
        console.debug('[shared-backend] fetch-ops-since exception skipped after recoverable preflight failure', {
          context: 'fetch-ops-since',
          projectKey: normalizedProjectKey,
          afterRevision: Math.max(0, Math.round(Number(afterRevision) || 0)),
          limit: Math.max(1, Math.round(Number(limit) || 256)),
          durationMs: Math.max(0, Date.now() - startedAt),
          message: String(error?.message || error || ''),
        });
        return [];
      }
      console.warn('[shared-backend] fetch-ops-since exception', {
        context: 'fetch-ops-since',
        projectKey: normalizedProjectKey,
        afterRevision: Math.max(0, Math.round(Number(afterRevision) || 0)),
        limit: Math.max(1, Math.round(Number(limit) || 256)),
        durationMs: Math.max(0, Date.now() - startedAt),
        locationOrigin: typeof window !== 'undefined' && window.location ? String(window.location.origin || '') : '',
        locationHref: typeof window !== 'undefined' && window.location ? String(window.location.href || '') : '',
        referrer: typeof document !== 'undefined' ? String(document.referrer || '') : '',
        visibilityState: typeof document !== 'undefined' ? String(document.visibilityState || '') : '',
        online: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : null,
        message: String(error?.message || error || ''),
      });
      handleSharedProjectsBackendError(error, 'fetch-ops-since-exception');
      return [];
    }
  }

  async function applySharedProjectOpsSinceRevision(projectRecord, afterRevision = 0) {
    const sessionTokenAtStart = activeSharedProjectSessionToken;
    // Shared project reopen / reconnect path:
    // load canonical snapshot first, then replay ordered ops since the snapshot revision.
    const projectKey = normalizeMultiProjectKey(projectRecord?.project_key || activeSharedProjectKey);
    if (!projectKey) {
      return false;
    }
    const targetRevision = Math.max(0, Math.round(Number(projectRecord?.latest_revision) || 0));
    const targetStructureRevision = Math.max(0, Math.round(Number(projectRecord?.latest_structure_revision) || 0));
    if (targetRevision <= afterRevision) {
      if (!activeSharedProjectDocumentLoaded && hasUsableActiveSharedProjectDocumentState()) {
        markActiveSharedProjectDocumentLoaded(projectKey);
        setActiveSharedProjectSession(
          projectKey,
          Math.max(activeSharedProjectRevision, targetRevision, afterRevision),
          Math.max(targetStructureRevision, activeSharedProjectStructureRevision),
          projectRecord?.id || activeSharedProjectId
        );
        setSharedProjectDeferRealtimeUntilSynced(false);
      }
      if (!activeSharedProjectDocumentLoaded) {
        return false;
      }
      setActiveSharedProjectSyncState('synced');
      // abort if session changed while we prepared
      if (sessionTokenAtStart !== activeSharedProjectSessionToken) {
        console.info('[shared-sync] abort-apply-ops-due-to-session-change', { projectKey });
        return false;
      }
      return true;
    }
    setActiveSharedProjectSyncState('catching-up', { announce: true });
    const requestedBaseRevision = Math.max(0, Math.round(Number(afterRevision) || 0));
    const appliedBaseRevision = Math.max(0, Math.round(Number(sharedProjectLastAppliedSeq) || 0));
    const baseRevision = appliedBaseRevision > 0
      ? Math.min(requestedBaseRevision, appliedBaseRevision)
      : requestedBaseRevision;
    if (baseRevision < requestedBaseRevision) {
      console.info('[shared-sync]', {
        event: 'replay-base-clamped-to-applied-revision',
        projectKey,
        requestedBaseRevision,
        appliedBaseRevision,
        baseRevision,
        targetRevision,
      });
    }
    // If session changed during setup, abort early
    if (sessionTokenAtStart !== activeSharedProjectSessionToken) {
      console.info('[shared-sync] abort-apply-ops-due-to-session-change-before-fetch', { projectKey });
      return false;
    }
    sharedProjectLastAppliedSeq = Math.max(sharedProjectLastAppliedSeq, baseRevision);
    while (sharedProjectLastAppliedSeq < targetRevision) {
      console.info('[shared-sync]', {
        event: 'refresh-ops-fetched',
        projectKey,
        afterRevision: sharedProjectLastAppliedSeq,
        targetRevision,
      });
      console.info('[shared-sync]', {
        event: 'missing-ops-fetch-start',
        projectKey,
        afterRevision: sharedProjectLastAppliedSeq,
        targetRevision,
      });
      const ops = await fetchMissingOps(
        projectKey,
        sharedProjectLastAppliedSeq,
        Math.max(SHARED_PROJECT_MAX_MISSING_OP_FETCH, targetRevision - sharedProjectLastAppliedSeq + 8)
      );
      // abort if session changed while waiting for missing ops
      if (sessionTokenAtStart !== activeSharedProjectSessionToken) {
        console.info('[shared-sync] abort-apply-ops-due-to-session-change-after-fetch', { projectKey, afterRevision: sharedProjectLastAppliedSeq });
        return false;
      }
      console.info('[shared-sync]', {
        event: 'missing-ops-fetch-done',
        projectKey,
        afterRevision: sharedProjectLastAppliedSeq,
        fetchedCount: ops.length,
      });
      if (!ops.length) {
        console.info('[shared-sync]', {
          event: 'replay-gap-fallback',
          projectKey,
          afterRevision: sharedProjectLastAppliedSeq,
          targetRevision,
        });
        return false;
      }
      confirmSharedProjectLocalOpsFromServerOps(ops, { source: 'refresh' });
      const replayed = await replayOps(ops, { fromRemote: true });
      // abort if session changed while replaying ops
      if (sessionTokenAtStart !== activeSharedProjectSessionToken) {
        console.info('[shared-sync] abort-apply-ops-due-to-session-change-after-replay', { projectKey, afterRevision: sharedProjectLastAppliedSeq });
        return false;
      }
      if (!replayed) {
        return false;
      }
      console.info('[shared-sync]', {
        event: 'refresh-ops-replayed',
        projectKey,
        activeRevision: sharedProjectLastAppliedSeq,
        fetchedCount: ops.length,
      });
      if (sharedProjectPendingRemoteOps.size && sharedProjectLastAppliedSeq < targetRevision) {
        console.info('[shared-sync]', {
          event: 'replay-gap-detected',
          projectKey,
          activeRevision: sharedProjectLastAppliedSeq,
          pendingRemoteCount: sharedProjectPendingRemoteOps.size,
        });
        break;
      }
    }
    if (sharedProjectPendingRemoteOps.size || sharedProjectLastAppliedSeq < targetRevision) {
      if (!sharedProjectSnapshotReplayInFlight && !sharedProjectRefreshInFlight) {
        queueSharedProjectRefresh({
          immediate: true,
          reason: 'replay-gap-fallback',
          force: true,
        });
      }
      return false;
    }
    console.info('[shared-sync]', {
      event: 'replay-gap-filled',
      projectKey,
      activeRevision: sharedProjectLastAppliedSeq,
      targetRevision,
    });
    setActiveSharedProjectSession(
      projectKey,
      Math.max(sharedProjectLastAppliedSeq, targetRevision),
      Math.max(targetStructureRevision, activeSharedProjectStructureRevision),
      projectRecord?.id || activeSharedProjectId
    );
    if (sharedProjectLastAppliedSeq >= targetRevision) {
      setActiveSharedProjectSyncState('synced');
      if (sharedProjectDeferRealtimeUntilSynced) {
        setSharedProjectDeferRealtimeUntilSynced(false);
      }
      ensureActiveSharedProjectRealtimeChannel().catch(error => {
        reportSharedProjectRealtimeSubscribeFailure(error);
      });
    }
    return sharedProjectLastAppliedSeq >= targetRevision;
  }

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
      if (!project) {
        return null;
      }
      return project;
    } catch (error) {
      handleSharedProjectsBackendError(error, 'ensure-membership-exception');
      return null;
    }
  }

  async function loadSharedProjectSnapshotRecord(projectKey, { createIfMissing = false, title = '' } = {}) {
    const project = await ensureSharedProjectMembership(projectKey, { createIfMissing, title });
    if (!project) {
      return null;
    }
    return project;
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
      const joined = await supabase
        .rpc('pixieed_join_shared_project_by_invite_token', {
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
    if (!project) {
      return null;
    }
    return project;
  }

  async function fetchSharedProjectMemberProfileNicknames(userIds = []) {
    const normalizedUserIds = Array.from(new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    ));
    const nicknames = new Map();
    if (!normalizedUserIds.length || !canUseSharedProjectsBackend()) {
      return nicknames;
    }
    if (accountState.userId) {
      const selfNickname = readPixieedAccountNickname();
      if (selfNickname) {
        nicknames.set(accountState.userId, selfNickname);
      }
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return nicknames;
      }
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, nickname')
        .in('id', normalizedUserIds);
      if (shouldIgnorePixieedProfileError(error)) {
        return nicknames;
      }
      if (error) {
        throw error;
      }
      (Array.isArray(data) ? data : []).forEach(profile => {
        const userId = typeof profile?.id === 'string' ? profile.id.trim() : '';
        const nickname = normalizeMultiParticipantName(profile?.nickname || '', '');
        if (userId && nickname) {
          nicknames.set(userId, nickname);
        }
      });
    } catch (error) {
      if (!shouldIgnorePixieedProfileError(error)) {
        console.warn('Failed to load shared project member profiles', error);
      }
    }
    return nicknames;
  }

  async function syncSharedProjectMembers(projectKey = activeSharedProjectKey, projectId = activeSharedProjectId) {
    if ((!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) || !accountState.userId) {
      sharedProjectMembers = [];
      renderMultiParticipantsList();
      return [];
    }
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    if (!normalizedProjectKey && !normalizedProjectId) {
      sharedProjectMembers = [];
      renderMultiParticipantsList();
      return [];
    }
    if (sharedProjectMembersSyncPromise) {
      return sharedProjectMembersSyncPromise;
    }
    sharedProjectMembersSyncPromise = (async () => {
      try {
        const supabase = await ensurePixieedAccountClient();
        if (!supabase) {
          return [];
        }
        const memberColumns = 'project_key, project_id, user_id, role, joined_at, updated_at, last_opened_at';
        let query = supabase
          .from('shared_project_members')
          .select(`${memberColumns}, active_session_id, active_heartbeat_at`);
        query = normalizedProjectId
          ? query.eq('project_id', normalizedProjectId)
          : query.eq('project_key', normalizedProjectKey);
        let { data, error } = await query;
        if (error) {
          let fallbackQuery = supabase
            .from('shared_project_members')
            .select(memberColumns);
          fallbackQuery = normalizedProjectId
            ? fallbackQuery.eq('project_id', normalizedProjectId)
            : fallbackQuery.eq('project_key', normalizedProjectKey);
          const fallbackResponse = await fallbackQuery;
          data = fallbackResponse.data;
          error = fallbackResponse.error;
          if (error) {
            handleSharedProjectsBackendError(error, 'list-active-members');
            return [];
          }
        }
        const rows = Array.isArray(data) ? data : [];
        const userIds = rows
          .map(entry => (typeof entry?.user_id === 'string' ? entry.user_id.trim() : ''))
          .filter(Boolean);
        const profileNicknames = await fetchSharedProjectMemberProfileNicknames(userIds);
        const selfMember = rows.find(entry => (
          typeof entry?.user_id === 'string'
          && entry.user_id.trim() === accountState.userId
        )) || null;
        const selfMembershipRole = normalizeSharedProjectMembershipRole(selfMember?.role || '');
        if (selfMembershipRole && normalizeMultiProjectKey(selfMember?.project_key || normalizedProjectKey) === normalizedProjectKey) {
          activeSharedProjectMembershipRole = selfMembershipRole;
        }
        sharedProjectMembers = rows.map(entry => {
          const userId = typeof entry?.user_id === 'string' ? entry.user_id.trim() : '';
          const isSelf = Boolean(userId) && userId === accountState.userId;
          const membershipRole = normalizeSharedProjectMembershipRole(entry?.role || '');
          const activeSessionId = typeof entry?.active_session_id === 'string' ? entry.active_session_id.trim() : '';
          const activeHeartbeatAt = Date.parse(entry?.active_heartbeat_at || '') || 0;
          const isCurrentlyPresent = Boolean(activeSessionId)
            && activeHeartbeatAt > 0
            && (Date.now() - activeHeartbeatAt) < 70000;
          const profileName = userId ? normalizeMultiParticipantName(profileNicknames.get(userId) || '', '') : '';
          const avatarId = isSelf ? getLocalMultiParticipantAvatarId() : '';
          return {
            clientId: userId || `${entry?.project_key || normalizedProjectKey}:${entry?.joined_at || entry?.updated_at || Date.now()}`,
            projectKey: normalizeMultiProjectKey(entry?.project_key || normalizedProjectKey),
            projectId: typeof entry?.project_id === 'string' ? entry.project_id.trim() : normalizedProjectId,
            userId,
            membershipRole,
            role: mapSharedProjectMembershipRoleToUiRole(membershipRole),
            name: isSelf
              ? (readPixieedAccountNickname() || DEFAULT_MULTI_PARTICIPANT_NAME)
              : (profileName || DEFAULT_MULTI_PARTICIPANT_NAME),
            avatarId,
            avatarSrc: avatarId ? resolvePixieedAvatarSrcFromId(avatarId) : '../icon/PiXiEED.icon512.png',
            online: isSelf ? isCurrentProjectSharedEntry() : isCurrentlyPresent,
            joinedAt: Date.parse(entry?.joined_at || entry?.updated_at || entry?.last_opened_at || '') || Date.now(),
            locked: false,
          };
        });
        renderMultiParticipantsList();
        scheduleSharedProjectFreeTimelineCellEnsure('members-sync');
        return sharedProjectMembers;
      } catch (error) {
        if (isRecoverableSharedBackendPreflightError(error)) {
          handleSharedProjectsBackendError(error, 'list-active-members-exception');
          return [];
        }
        console.warn('Failed to sync shared project members', error);
        return [];
      } finally {
        sharedProjectMembersSyncPromise = null;
      }
    })();
    return sharedProjectMembersSyncPromise;
  }

  async function retainActiveSharedProjectDocumentDuringRefresh(projectRecord, {
    force = false,
    reason = 'refresh',
    result = 'active-document-retained',
    nextRevision = activeSharedProjectRevision,
    nextStructureRevision = activeSharedProjectStructureRevision,
    snapshotRevision = activeSharedProjectSnapshotRevision,
    snapshotStructureRevision = activeSharedProjectStructureRevision,
  } = {}) {
    const projectKey = normalizeMultiProjectKey(projectRecord?.project_key || activeSharedProjectKey);
    if (!projectKey || !hasUsableActiveSharedProjectDocumentState()) {
      return false;
    }
    const retainedRevision = Math.max(
      activeSharedProjectRevision,
      Math.max(0, Math.round(Number(nextRevision) || 0))
    );
    const retainedStructureRevision = Math.max(
      activeSharedProjectStructureRevision,
      Math.max(0, Math.round(Number(nextStructureRevision) || 0))
    );
    const retainedSnapshotRevision = Math.max(
      activeSharedProjectSnapshotRevision,
      retainedRevision,
      Math.max(0, Math.round(Number(snapshotRevision) || 0))
    );
    const retainedSnapshotStructureRevision = Math.max(
      retainedStructureRevision,
      Math.max(0, Math.round(Number(snapshotStructureRevision) || 0))
    );
    const projectId = typeof projectRecord?.id === 'string' && projectRecord.id.trim()
      ? projectRecord.id.trim()
      : activeSharedProjectId;
    markDocumentDurablySaved();
    markActiveSharedProjectDocumentLoaded(projectKey);
    setSharedProjectDeferRealtimeUntilSynced(false);
    setActiveSharedProjectSession(
      projectKey,
      retainedRevision,
      retainedStructureRevision,
      projectId
    );
    setActiveSharedProjectSnapshotState(retainedSnapshotRevision, {
      structureRevision: retainedSnapshotStructureRevision,
      synced: true,
      canonicalLoadedAt: Date.now(),
    });
    setActiveSharedProjectSyncState('synced');
    try {
      await syncSharedProjectMembers(projectKey, projectId || '');
      await upsertSharedRecentProjectEntry({
        projectKey,
        projectId: projectId || '',
        inviteToken: projectRecord?.invite_token || '',
        visibility: projectRecord?.visibility || 'private',
        name: createSharedProjectSnapshotTitle(projectRecord?.title || projectKey),
        roleHint: projectRecord?.owner_user_id === accountState.userId ? 'master' : 'guest',
        membershipRole: projectRecord?.membership_role || '',
        ownerUserId: projectRecord?.owner_user_id || '',
        autoJoin: false,
        revision: retainedRevision,
        structureRevision: retainedStructureRevision,
      });
    } catch (error) {
      console.warn('Failed to update retained shared project metadata', error);
    }
    try {
      await restorePendingSharedLocalOps(projectKey, {
        announce: false,
        refreshReason: `${reason || 'refresh'}-resume-pending-local-ops`,
      });
      pendingSharedProjectConflictReplay = null;
      maybeReplayPendingSharedProjectConflictAfterRefresh(projectKey);
    } catch (error) {
      console.warn('Failed to restore retained shared project local ops', error);
    }
    ensureActiveSharedProjectRealtimeChannel().catch(error => {
      reportSharedProjectRealtimeSubscribeFailure(error);
    });
    if (
      retainedSnapshotRevision < retainedRevision
      && !hasSharedProjectHardLocalWorkInFlight()
    ) {
      queueSharedProjectCurrentSnapshotCapture({
        delayMs: 0,
        projectKey,
        historyLabel: 'recovery-verified-checkpoint',
        force: true,
        revision: retainedRevision,
      });
    }
    logSharedProjectRealtimeChannelLifecycle('refresh-result', {
      caller: 'refreshActiveSharedProjectSnapshot',
      reason: reason || 'refresh',
      projectKey,
      projectId,
      extra: {
        force,
        result,
        retainedRevision,
        retainedStructureRevision,
        snapshotRevision,
        nextRevision,
      },
    });
    return true;
  }

  function isSharedProjectAuthoritativeRefreshReason(reason = '') {
    const normalizedReason = String(reason || '');
    return Boolean(
      normalizedReason.includes('manual')
      || normalizedReason.includes('reload')
      || normalizedReason.includes('open-shared')
      || normalizedReason.includes('canonical-resync')
      || normalizedReason.includes('apply-skip')
      || normalizedReason.includes('missing-target')
    );
  }

  async function refreshActiveSharedProjectSnapshot({ force = false, reason = '' } = {}) {
    console.info('[shared-sync]', {
      event: reason && reason.includes('canonical') ? 'canonical-resync-start' : 'refresh-start',
      reason,
      force,
      projectKey: activeSharedProjectKey || '',
      activeRevision: activeSharedProjectRevision,
      snapshotRevision: activeSharedProjectSnapshotRevision,
    });
    sharedProjectRecoveryInProgress = Boolean(reason && (reason.includes('canonical') || reason.includes('recovery')));
    if ((!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) || !activeSharedProjectKey) {
      logSharedProjectRealtimeChannelLifecycle('refresh-skip', {
        caller: 'refreshActiveSharedProjectSnapshot',
        reason: reason || 'refresh',
        extra: {
          force,
          blockedBy: 'missing-backend-session-or-project-key',
        },
      });
      return false;
    }
    logSharedProjectRealtimeChannelLifecycle('refresh-start', {
      caller: 'refreshActiveSharedProjectSnapshot',
      reason: reason || 'refresh',
      extra: { force },
    });
    if (sharedProjectRefreshInFlight) {
      logSharedProjectRealtimeChannelLifecycle('refresh-skip', {
        caller: 'refreshActiveSharedProjectSnapshot',
        reason: reason || 'refresh',
        extra: {
          force,
          blockedBy: 'refresh-in-flight',
        },
      });
      return false;
    }
    sharedProjectRefreshInFlight = true;
    try {
      const fetchedProject = await fetchSharedProjectRecord(activeSharedProjectKey);
      let project = fetchedProject;
      const requiresFreshSnapshot = Boolean(
        fetchedProject
        && (!fetchedProject.latest_snapshot || typeof fetchedProject.latest_snapshot !== 'object')
      );
      if (requiresFreshSnapshot) {
        project = await awaitFreshSharedProjectSnapshot(fetchedProject, {
          minRevision: 0,
          requireExactLatest: false,
          timeoutMs: force ? 2400 : 1400,
          pollIntervalMs: 180,
        }) || fetchedProject;
      }
      if (!project) {
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'missing-project-record',
          },
        });
        return false;
      }
      if (!activeSharedProjectId) {
        const fetchedProjectId = typeof project?.id === 'string' ? project.id.trim() : '';
        let recoveredProjectId = fetchedProjectId;
        if (!recoveredProjectId) {
          const membershipProject = await ensureSharedProjectMembership(activeSharedProjectKey, { createIfMissing: false });
          recoveredProjectId = typeof membershipProject?.id === 'string' ? membershipProject.id.trim() : '';
          if (membershipProject?.project_key && !project?.project_key) {
            project = membershipProject;
          }
        }
        if (recoveredProjectId) {
          setActiveSharedProjectSession(
            activeSharedProjectKey,
            activeSharedProjectRevision,
            activeSharedProjectStructureRevision,
            recoveredProjectId
          );
          logSharedProjectRealtimeChannelLifecycle('refresh-project-id-recovered', {
            caller: 'refreshActiveSharedProjectSnapshot',
            reason: reason || 'refresh',
            projectKey: activeSharedProjectKey,
            projectId: recoveredProjectId,
          });
        }
      }
      const nextRevision = getSharedProjectLatestRevision(project);
      const nextStructureRevision = getSharedProjectLatestStructureRevision(project);
      const snapshotRevision = getSharedProjectSnapshotRevision(project);
      const snapshotStructureRevision = getSharedProjectSnapshotStructureRevision(project);
      console.info('[shared-sync]', {
        event: 'refresh-fetched-project',
        reason: reason || 'refresh',
        projectKey: activeSharedProjectKey || '',
        latestRevision: nextRevision,
        latestSnapshotRevision: Math.max(0, Math.round(Number(project.latest_snapshot_revision) || 0)),
      });
      if (nextRevision > activeSharedProjectRevision) {
        console.info('[shared-sync]', {
          event: 'refresh-prefers-missing-ops',
          reason: reason || 'refresh',
          projectKey: activeSharedProjectKey || '',
          activeRevision: activeSharedProjectRevision,
          latestRevision: nextRevision,
          snapshotRevision,
        });
      }
      const normalizedReason = String(reason || '');
      const requiresAuthoritativeServerRead = Boolean(
        force && isSharedProjectAuthoritativeRefreshReason(normalizedReason)
      );
      const prefersOpReplayRecovery = (
        normalizedReason === 'poll-recovery'
        || normalizedReason === 'focus'
        || normalizedReason === 'visibility'
        || normalizedReason === 'online'
        || normalizedReason.includes('reconnect')
        || normalizedReason.includes('resume-pending-local-ops')
        || normalizedReason.includes('poll-recovery-')
      );
      const requiresCanonicalSnapshot = (
        normalizedReason === 'canonical-resync'
        || normalizedReason.includes('canonical-resync-')
      );
      const activeAlreadyAtLatest = (
        nextRevision <= activeSharedProjectRevision
        && nextStructureRevision <= activeSharedProjectStructureRevision
      );
      if (activeAlreadyAtLatest && activeSharedProjectKey) {
        sharedProjectLastVerifiedLatestAt = Date.now();
        sharedProjectLastVerifiedLatestKey = activeSharedProjectKey;
        sharedProjectLastVerifiedLatestRevision = activeSharedProjectRevision;
        sharedProjectLastVerifiedLatestStructureRevision = activeSharedProjectStructureRevision;
      }
      const snapshotBehindActiveRevision = snapshotRevision < activeSharedProjectRevision;
      const canReloadStaleSnapshotForUnloadedDocument = Boolean(
        snapshotBehindActiveRevision
        && !activeSharedProjectDocumentLoaded
        && project.latest_snapshot
        && typeof project.latest_snapshot === 'object'
        && !hasSharedProjectHardLocalWorkInFlight()
      );
      logSharedProjectRealtimeChannelLifecycle('refresh-fetched-project', {
        caller: 'refreshActiveSharedProjectSnapshot',
        reason: reason || 'refresh',
        extra: {
          force,
          nextRevision,
          nextStructureRevision,
          snapshotRevision,
          snapshotStructureRevision,
        },
      });
      if (snapshotBehindActiveRevision && !canReloadStaleSnapshotForUnloadedDocument) {
        if (nextRevision > activeSharedProjectRevision && !hasSharedProjectHardLocalWorkInFlight()) {
          console.info('[shared-sync]', {
            event: 'stale-snapshot-op-replay-start',
            reason: reason || 'refresh',
            projectKey: activeSharedProjectKey || '',
            snapshotRevision,
            activeRevision: activeSharedProjectRevision,
            latestRevision: nextRevision,
          });
          const replayedAhead = await applySharedProjectOpsSinceRevision(project, activeSharedProjectRevision);
          if (replayedAhead) {
            console.info('[shared-sync]', {
              event: 'stale-snapshot-op-replay-done',
              reason: reason || 'refresh',
              projectKey: activeSharedProjectKey || '',
              activeRevision: activeSharedProjectRevision,
              latestRevision: nextRevision,
            });
            return true;
          }
        }
        if (activeAlreadyAtLatest && !hasSharedProjectHardLocalWorkInFlight()) {
          const retained = await retainActiveSharedProjectDocumentDuringRefresh(project, {
            force,
            reason: reason || 'refresh',
            result: 'active-document-newer-than-canonical-snapshot',
            nextRevision,
            nextStructureRevision,
            snapshotRevision,
            snapshotStructureRevision,
          });
          if (retained) {
            return true;
          }
        }
        console.info('[shared-sync]', {
          event: 'stale-snapshot-ignored',
          reason: reason || 'refresh',
          projectKey: activeSharedProjectKey || '',
          snapshotRevision,
          activeRevision: activeSharedProjectRevision,
          latestRevision: nextRevision,
        });
        if (nextRevision > activeSharedProjectRevision) {
          setActiveSharedProjectSyncState('catching-up', { announce: true });
          queueSharedProjectRefresh({
            immediate: false,
            reason: `${reason || 'refresh'}-stale-snapshot-op-retry`,
            force: true,
          });
        }
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'stale-snapshot-skipped',
            snapshotRevision,
            activeRevision: activeSharedProjectRevision,
            nextRevision,
          },
        });
        return false;
      }
      if (canReloadStaleSnapshotForUnloadedDocument) {
        console.info('[shared-sync]', {
          event: 'stale-snapshot-reload-for-unloaded-document',
          reason: reason || 'refresh',
          projectKey: activeSharedProjectKey || '',
          snapshotRevision,
          activeRevision: activeSharedProjectRevision,
          latestRevision: nextRevision,
        });
      }
      if (
        force
        && activeAlreadyAtLatest
        && activeSharedProjectDocumentLoaded
        && !sharedProjectDeferRealtimeUntilSynced
        && !requiresCanonicalSnapshot
        && !requiresAuthoritativeServerRead
        && !hasSharedProjectHardLocalWorkInFlight()
      ) {
        setActiveSharedProjectSyncState('synced');
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'already-current-forced-skip',
            nextRevision,
            nextStructureRevision,
            snapshotRevision,
          },
        });
        return true;
      }
      if (
        !force
        && activeAlreadyAtLatest
        && activeSharedProjectDocumentLoaded
        && !requiresAuthoritativeServerRead
      ) {
        if (!sharedProjectDeferRealtimeUntilSynced) {
          setActiveSharedProjectSyncState('synced');
        }
        if ((project?.id && !activeSharedProjectId) || sharedProjectDeferRealtimeUntilSynced) {
          const retained = await retainActiveSharedProjectDocumentDuringRefresh(project, {
            force,
            reason: reason || 'refresh',
            result: 'already-current-active-document',
            nextRevision,
            nextStructureRevision,
            snapshotRevision,
            snapshotStructureRevision,
          });
          if (retained) {
            return true;
          }
        }
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'already-current',
            nextRevision,
            nextStructureRevision,
          },
        });
        return false;
      }
      // Prefer ordered op replay whenever structure is unchanged. Forced refreshes still
      // avoid snapshot rollback for recovery-only reasons such as poll/focus recovery.
      if (
        nextStructureRevision === activeSharedProjectStructureRevision
        && (
          (!force && !requiresCanonicalSnapshot)
          || (prefersOpReplayRecovery && !requiresCanonicalSnapshot)
        )
      ) {
        const syncedByOps = await applySharedProjectOpsSinceRevision(project, activeSharedProjectRevision);
        logSharedProjectRealtimeChannelLifecycle('refresh-ops-replay-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            syncedByOps,
            afterRevision: activeSharedProjectRevision,
            targetRevision: nextRevision,
          },
        });
        if (syncedByOps) {
          sharedProjectLastRealtimeActivityAt = Date.now();
          console.info('[shared-sync]', {
            event: 'refresh-ops-catchup-success',
            reason: reason || 'refresh',
            projectKey: activeSharedProjectKey || '',
            activeRevision: activeSharedProjectRevision,
            latestRevision: nextRevision,
          });
          logSharedProjectRealtimeChannelLifecycle('refresh-result', {
            caller: 'refreshActiveSharedProjectSnapshot',
            reason: reason || 'refresh',
            extra: {
              force,
              result: 'replayed-ops',
              nextRevision,
              nextStructureRevision,
            },
          });
          return true;
        }
        if (
          prefersOpReplayRecovery
          && !requiresCanonicalSnapshot
          && nextRevision > activeSharedProjectRevision
        ) {
          console.info('[shared-sync]', {
            event: 'refresh-ops-catchup-failed',
            reason: reason || 'refresh',
            projectKey: activeSharedProjectKey || '',
            activeRevision: activeSharedProjectRevision,
            latestRevision: nextRevision,
          });
          logSharedProjectRealtimeChannelLifecycle('refresh-result', {
            caller: 'refreshActiveSharedProjectSnapshot',
            reason: reason || 'refresh',
            extra: {
              force,
              result: 'ops-replay-incomplete-retry',
              afterRevision: activeSharedProjectRevision,
              nextRevision,
              nextStructureRevision,
            },
          });
          queueSharedProjectRefresh({
            immediate: false,
            reason: `${reason || 'refresh'}-ops-retry`,
            force: true,
          });
          return false;
        }
      }
      console.info('[shared-sync]', {
        event: 'canonical-resync-required',
        reason: reason || 'refresh',
        projectKey: activeSharedProjectKey || '',
        activeRevision: activeSharedProjectRevision,
        latestRevision: nextRevision,
      });
      if (!canApplyIncomingSharedProjectSnapshot({ force })) {
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'snapshot-apply-blocked',
            blockedByLocalWork: hasSharedProjectLocalWorkInFlight(),
            blockedByHardLocalWork: hasSharedProjectHardLocalWorkInFlight(),
          },
        });
        if (force) {
          queueSharedProjectRefresh({
            immediate: false,
            reason: `${reason || 'refresh'}-deferred-local-work`,
            force: true,
          });
        }
        return false;
      }
      const hadLoadedDocument = activeSharedProjectDocumentLoaded;
      activeSharedProjectDocumentLoaded = false;
      const restoreLoadedDocumentStateAfterSnapshotAbort = () => {
        if (activeSharedProjectDocumentLoaded) {
          return;
        }
        if (!hadLoadedDocument && !hasUsableActiveSharedProjectDocumentState()) {
          return;
        }
        markActiveSharedProjectDocumentLoaded(activeSharedProjectKey);
      };
      const sharedSnapshot = project.latest_snapshot;
      if (!sharedSnapshot || typeof sharedSnapshot !== 'object') {
        restoreLoadedDocumentStateAfterSnapshotAbort();
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'missing-shared-snapshot',
            nextRevision,
          },
        });
        return false;
      }
      confirmSharedProjectLocalOpsFromServerOps(await fetchMissingOps(activeSharedProjectKey, Math.max(0, snapshotRevision - 1), Math.min(64, SHARED_PROJECT_MAX_MISSING_OP_FETCH)), {
        source: 'refresh',
      });
      if (deferSharedProjectSnapshotApplyIfLocalOpsInFlight(reason || 'snapshot-refresh')) {
        restoreLoadedDocumentStateAfterSnapshotAbort();
        return false;
      }
      const snapshotWouldRollbackActiveRevision = Boolean(
        snapshotRevision < activeSharedProjectRevision
        && (
          activeSharedProjectDocumentLoaded
          || hadLoadedDocument
          || hasUsableActiveSharedProjectDocumentState()
        )
      );
      if (snapshotWouldRollbackActiveRevision) {
        restoreLoadedDocumentStateAfterSnapshotAbort();
        console.debug('[shared-realtime] skip-stale-snapshot', {
          reason: reason || 'refresh',
          projectKey: activeSharedProjectKey || '',
          snapshotRevision,
          activeRevision: activeSharedProjectRevision,
          latestRevision: nextRevision,
        });
        logSharedProjectRealtimeChannelLifecycle('skip-stale-snapshot', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            snapshotRevision,
            activeRevision: activeSharedProjectRevision,
            nextRevision,
          },
        });
        if (nextRevision > activeSharedProjectRevision && !hasSharedProjectHardLocalWorkInFlight()) {
          const replayedAhead = await applySharedProjectOpsSinceRevision(project, activeSharedProjectRevision);
          if (replayedAhead) {
            return true;
          }
          setActiveSharedProjectSyncState('catching-up', { announce: true });
          queueSharedProjectRefresh({
            immediate: false,
            reason: `${reason || 'refresh'}-stale-snapshot-op-retry`,
            force: true,
          });
        } else if (nextRevision <= activeSharedProjectRevision) {
          setActiveSharedProjectSyncState('synced');
          return true;
        }
        return false;
      }
      if (snapshotRevision < activeSharedProjectRevision && nextRevision > activeSharedProjectRevision) {
        console.info('[shared-sync]', {
          event: 'snapshot-older-than-active',
          reason: reason || 'refresh',
          projectKey: activeSharedProjectKey || '',
          snapshotRevision,
          activeRevision: activeSharedProjectRevision,
          latestRevision: nextRevision,
        });
        const replayedAhead = await applySharedProjectOpsSinceRevision(project, activeSharedProjectRevision);
        if (replayedAhead) {
          restoreLoadedDocumentStateAfterSnapshotAbort();
          console.info('[shared-sync]', {
            event: 'missing-ops-preferred-over-snapshot',
            reason: reason || 'refresh',
            projectKey: activeSharedProjectKey || '',
            activeRevision: activeSharedProjectRevision,
            latestRevision: nextRevision,
          });
          return true;
        }
        console.info('[shared-sync]', {
          event: 'stale-snapshot-ignored',
          reason: reason || 'refresh',
          projectKey: activeSharedProjectKey || '',
          snapshotRevision,
          activeRevision: activeSharedProjectRevision,
          latestRevision: nextRevision,
        });
      }
      const trustedSnapshotRevision = shouldTrustSharedProjectSnapshotRevision(snapshotRevision, nextRevision);
      const shouldReplayFromSnapshotAfterLoad = Boolean(
        trustedSnapshotRevision
        || (!hadLoadedDocument && snapshotRevision < nextRevision)
      );
      const prefersFreshCanonicalSnapshot = (
        force
        && (
          normalizedReason.includes('apply-skip-missing-canvas-or-frame')
        )
      );
      if (prefersFreshCanonicalSnapshot && snapshotRevision < nextRevision) {
        restoreLoadedDocumentStateAfterSnapshotAbort();
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'awaiting-fresher-canonical-snapshot',
            snapshotRevision,
            nextRevision,
          },
        });
        queueSharedProjectRefresh({
          immediate: false,
          reason: `${reason || 'refresh'}-await-snapshot`,
          force: true,
        });
        return false;
      }
      const loaded = await loadDocumentFromText(JSON.stringify(sharedSnapshot), null, {
        projectId: buildSharedRecentProjectId(activeSharedProjectKey),
        suppressAutosaveStatus: true,
        openedFromRecent: true,
        preserveView: true,
        preserveDotStats: true,
        preserveDocumentIds: true,
        preserveCanvasIds: true,
        preserveFrameIds: true,
        preserveLayerIds: true,
        sharedProjectKey: activeSharedProjectKey,
        sharedProjectBackendId: project.id || activeSharedProjectId || '',
        sharedProjectRevision: snapshotRevision,
        sharedProjectStructureRevision: snapshotStructureRevision,
        sharedRoleHint: mapSharedProjectMembershipRoleToUiRole(
          project.owner_user_id === accountState.userId
            ? 'owner'
            : normalizeSharedProjectMembershipRole(project.membership_role || '')
        ),
        sharedAutoJoin: false,
      });
      if (loaded === 'deferred') {
        // The incoming snapshot targets a different tab/project in this
        // window. Abort applying and leave active document state intact.
        restoreLoadedDocumentStateAfterSnapshotAbort();
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'snapshot-deferred-different-tab',
            snapshotRevision,
          },
        });
        return false;
      }
      if (!loaded) {
        restoreLoadedDocumentStateAfterSnapshotAbort();
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'snapshot-load-failed',
            snapshotRevision,
          },
        });
        return false;
      }
      logSharedProjectRealtimeChannelLifecycle('refresh-snapshot-loaded', {
        caller: 'refreshActiveSharedProjectSnapshot',
        reason: reason || 'refresh',
        extra: {
          force,
          snapshotRevision,
          snapshotStructureRevision,
        },
      });
      compareSharedProjectSnapshotIdentity(sharedSnapshot?.document || sharedSnapshot, {
        projectKey: activeSharedProjectKey,
        projectId: project.id || '',
        snapshotRevision,
        latestRevision: nextRevision,
      });
      sharedProjectRemoteApplyFailureKeys.clear();
      markDocumentDurablySaved();
      markActiveSharedProjectDocumentLoaded(activeSharedProjectKey);
      setActiveSharedProjectSnapshotState(snapshotRevision, {
        structureRevision: snapshotStructureRevision,
        synced: false,
        canonicalLoadedAt: Date.now(),
      });
      setSharedProjectDeferRealtimeUntilSynced(true);
      setActiveSharedProjectSession(
        activeSharedProjectKey,
        shouldReplayFromSnapshotAfterLoad ? snapshotRevision : nextRevision,
        shouldReplayFromSnapshotAfterLoad ? snapshotStructureRevision : nextStructureRevision,
        project.id || ''
      );
      activeSharedProjectMembershipRole = project.owner_user_id === accountState.userId
        ? 'owner'
        : normalizeSharedProjectMembershipRole(project.membership_role || activeSharedProjectMembershipRole || '');
      resetPendingSharedProjectRemoteState();
      let replayedAfterSnapshot = false;
      if (shouldReplayFromSnapshotAfterLoad) {
        sharedProjectLastAppliedSeq = Math.max(0, snapshotRevision);
        activeSharedProjectRevision = sharedProjectLastAppliedSeq;
        pruneSharedProjectConfirmedOpStateAfterRevision(sharedProjectLastAppliedSeq);
        sharedProjectSnapshotReplayInFlight = true;
        try {
          replayedAfterSnapshot = await applySharedProjectOpsSinceRevision(project, snapshotRevision);
        } finally {
          sharedProjectSnapshotReplayInFlight = false;
        }
      }
      logSharedProjectRealtimeChannelLifecycle('refresh-post-snapshot-ops', {
        caller: 'refreshActiveSharedProjectSnapshot',
        reason: reason || 'refresh',
        extra: {
          force,
          replayedAfterSnapshot,
          snapshotRevision,
          trustedSnapshotRevision,
          targetRevision: nextRevision,
        },
      });
      if (replayedAfterSnapshot || snapshotRevision >= nextRevision) {
        setSharedProjectDeferRealtimeUntilSynced(false);
        setActiveSharedProjectSnapshotState(snapshotRevision, {
          structureRevision: snapshotStructureRevision,
          synced: true,
          canonicalLoadedAt: Date.now(),
        });
        setActiveSharedProjectSyncState('synced');
        ensureActiveSharedProjectRealtimeChannel().catch(error => {
          reportSharedProjectRealtimeSubscribeFailure(error);
        });
        console.info('[shared-sync]', {
          event: reason && reason.includes('canonical') ? 'canonical-resync-done' : 'refresh-ops-replayed',
          reason,
          projectKey: activeSharedProjectKey || '',
          revision: activeSharedProjectRevision,
          snapshotRevision,
        });
        scheduleSharedProjectVerifiedSnapshotCheckpoint({
          reason: 'recovery-verified-checkpoint',
          delayMs: 1200,
          snapshotRevision,
          latestRevision: activeSharedProjectRevision,
        });
      }
      if (snapshotRevision < nextRevision && !replayedAfterSnapshot) {
        setActiveSharedProjectSyncState('catching-up', { announce: true });
        queueSharedProjectRefresh({
          immediate: false,
          reason: `${reason || 'refresh'}-post-snapshot-replay-incomplete`,
          force: true,
        });
        logSharedProjectRealtimeChannelLifecycle('refresh-result', {
          caller: 'refreshActiveSharedProjectSnapshot',
          reason: reason || 'refresh',
          extra: {
            force,
            result: 'post-snapshot-replay-incomplete',
            snapshotRevision,
            nextRevision,
          },
        });
        return false;
      }
      await syncSharedProjectMembers(activeSharedProjectKey, project.id || '');
      await upsertSharedRecentProjectEntry({
        projectKey: activeSharedProjectKey,
        projectId: project.id || '',
        inviteToken: project.invite_token || '',
        visibility: project.visibility || 'private',
        name: createSharedProjectSnapshotTitle(project.title || activeSharedProjectKey),
        roleHint: mapSharedProjectMembershipRoleToUiRole(
          project.owner_user_id === accountState.userId
            ? 'owner'
            : normalizeSharedProjectMembershipRole(project.membership_role || '')
        ),
        membershipRole: project.owner_user_id === accountState.userId
          ? 'owner'
          : normalizeSharedProjectMembershipRole(project.membership_role || ''),
        ownerUserId: project.owner_user_id || '',
        autoJoin: false,
        revision: nextRevision,
        structureRevision: Math.max(0, Math.round(Number(project.latest_structure_revision) || 0)),
      });
      await restorePendingSharedLocalOps(activeSharedProjectKey, {
        announce: false,
        refreshReason: `${reason || 'refresh'}-resume-pending-local-ops`,
      });
      replaySharedProjectLocalProvisionalAfterRemoteOps('post-snapshot-pending-local-visibility');
      pendingSharedProjectConflictReplay = null;
      maybeReplayPendingSharedProjectConflictAfterRefresh(activeSharedProjectKey);
      if (reason) {
        updateAutosaveStatus(
          localizeText('共有プロジェクトの最新内容を反映しました', 'Shared project updated'),
          'info'
        );
      }
      logSharedProjectRealtimeChannelLifecycle('refresh-result', {
        caller: 'refreshActiveSharedProjectSnapshot',
        reason: reason || 'refresh',
        extra: {
          force,
          result: 'loaded-snapshot',
          snapshotRevision,
          nextRevision,
          replayedAfterSnapshot,
        },
      });
      return true;
    } catch (error) {
      if (activeSharedProjectKey && !activeSharedProjectDocumentLoaded) {
        markActiveSharedProjectDocumentLoaded(activeSharedProjectKey);
      }
      logSharedProjectRealtimeChannelLifecycle('refresh-result', {
        caller: 'refreshActiveSharedProjectSnapshot',
        reason: reason || 'refresh',
        extra: {
          force,
          result: 'exception',
          error: String(error?.message || error || ''),
        },
      });
      handleSharedProjectsBackendError(error, `refresh-${reason || 'snapshot'}`);
      return false;
    } finally {
      sharedProjectRefreshInFlight = false;
      sharedProjectRecoveryInProgress = false;
      syncSharedProjectVisibleStatus();
    }
  }

  async function persistSharedProjectSnapshot(projectKey, packagedPayload, { title = '', revision = null, visibility = 'shared', reason = '' } = {}) {
    // Full snapshot commit is now reserved for:
    // - project creation
    // - checkpoints
    // - structure-heavy fallback / refresh recovery
    const snapshotReasonForFailure = String(reason || packagedPayload?.sharedHistoryLabel || '').trim();
    const recordCreationSnapshotFailure = (failureReason = '', failureDetail = '') => {
      if (snapshotReasonForFailure !== 'sharedProjectCreate') {
        return;
      }
      setSharedProjectCreationFailureReason(failureReason, failureDetail);
    };
    if (!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) {
      recordCreationSnapshotFailure(
        localizeText('Supabase共有セッションを開始できませんでした。', 'Could not start the Supabase shared session.'),
        localizeText('ログイン状態とネットワークを確認してください。', 'Check sign-in state and network.')
      );
      return null;
    }
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey);
    if (!normalizedProjectKey || !packagedPayload || typeof packagedPayload !== 'object') {
      recordCreationSnapshotFailure(
        localizeText('共有プロジェクトの保存データが不正です。', 'The shared project save payload is invalid.'),
        localizeText('プロジェクトキーまたはスナップショットを作成できませんでした。', 'The project key or snapshot could not be created.')
      );
      return null;
    }
    const project = await ensureSharedProjectMembership(normalizedProjectKey, {
      createIfMissing: true,
      title,
      visibility,
    });
    if (!project) {
      recordCreationSnapshotFailure(
        localizeText('共有プロジェクトの作成権限を確認できませんでした。', 'Shared project creation permission could not be verified.'),
        localizeText('Supabaseのプロジェクト作成またはメンバー登録に失敗しました。', 'Creating the Supabase project or member record failed.')
      );
      return null;
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        recordCreationSnapshotFailure(
          localizeText('Supabaseクライアントを初期化できませんでした。', 'Could not initialize the Supabase client.'),
          localizeText('ログイン状態とネットワークを確認してください。', 'Check sign-in state and network.')
        );
        return null;
      }
      const opType = classifySharedProjectOpType(packagedPayload?.sharedHistoryLabel || '');
      const baseRevision = Math.max(0, Math.round(Number(project.latest_revision) || 0));
      const baseStructureRevision = Math.max(0, Math.round(Number(project.latest_structure_revision) || 0));
      const snapshotReason = String(reason || packagedPayload?.sharedHistoryLabel || '').trim();
      const nextRevision = baseRevision;
      const nextStructureRevision = baseStructureRevision;
      let opPayload = opType === 'draw'
        ? buildSharedProjectDrawOpPayload(packagedPayload?.sharedHistoryLabel || '')
        : (opType === 'structure'
          ? buildSharedProjectStructureOpPayload(packagedPayload?.sharedHistoryLabel || '')
          : null);
      if (snapshotReason === 'sharedProjectCreate') {
        opPayload = {
          timelapseBaseSnapshot: packagedPayload,
          documentName: state.documentName || DEFAULT_DOCUMENT_NAME,
          createdAt: new Date().toISOString(),
        };
      }
      const snapshotGate = canWriteSharedProjectCanonicalSnapshot({
        reason: snapshotReason,
        snapshotRevision: nextRevision,
        latestRevision: Math.max(baseRevision, Number(project.latest_revision) || 0),
        structureRevision: nextStructureRevision,
      });
      if (!snapshotGate.allowed) {
        recordCreationSnapshotFailure(
          localizeText('共有スナップショットを書き込めませんでした。', 'The shared snapshot could not be written.'),
          localizeText('安全な書き込み条件を満たしていません。少し待ってから再試行してください。', 'The safe write condition was not met. Wait briefly and retry.')
        );
        return null;
      }
      const snapshotRpcArgs = {
        target_project_key: normalizedProjectKey,
        next_title: createSharedProjectSnapshotTitle(title || state.documentName || DEFAULT_DOCUMENT_NAME),
        next_snapshot: packagedPayload,
        base_revision: baseRevision,
        next_revision: nextRevision,
        base_structure_revision: baseStructureRevision,
        next_structure_revision: nextStructureRevision,
        op_type: opType,
        history_label: String(packagedPayload?.sharedHistoryLabel || ''),
        snapshot_reason: snapshotReason,
        op_payload: opPayload || {},
      };
      const {
        snapshot_reason: _snapshotReason,
        ...legacySnapshotRpcArgs
      } = snapshotRpcArgs;
      let usedSnapshotRpcSignature = 'legacy';
      let { data, error } = await supabase.rpc('pixieed_commit_shared_project_snapshot', legacySnapshotRpcArgs);
      if (error && isMissingRpcFunction(error, 'pixieed_commit_shared_project_snapshot')) {
        usedSnapshotRpcSignature = 'modern';
        console.info('[shared-sync]', {
          event: 'snapshot-rpc-modern-fallback',
          reason: snapshotReason,
          projectKey: normalizedProjectKey,
          error: String(error?.message || error || ''),
        });
        ({ data, error } = await supabase.rpc('pixieed_commit_shared_project_snapshot', snapshotRpcArgs));
      }
      if (error) {
        console.info('[shared-sync]', {
          event: 'snapshot-write-rejected-by-server',
          reason: snapshotReason,
          projectKey: normalizedProjectKey,
          error: String(error?.message || error || ''),
        });
        handleSharedProjectsBackendError(error, 'persist-rpc');
        recordCreationSnapshotFailure(
          localizeText('Supabase RPCで共有プロジェクト作成に失敗しました。', 'Shared project creation failed in the Supabase RPC.'),
          String(error?.message || error || '')
        );
        return null;
      }
      let result = Array.isArray(data) ? (data[0] || null) : (data || null);
      if (
        result
        && result.commit_status === 'rejected'
        && snapshotReason
        && usedSnapshotRpcSignature === 'legacy'
      ) {
        console.info('[shared-sync]', {
          event: 'snapshot-rpc-modern-retry-after-legacy-rejected',
          reason: snapshotReason,
          projectKey: normalizedProjectKey,
        });
        const modernResponse = await supabase.rpc('pixieed_commit_shared_project_snapshot', snapshotRpcArgs);
        if (!modernResponse.error) {
          usedSnapshotRpcSignature = 'modern';
          data = modernResponse.data;
          result = Array.isArray(data) ? (data[0] || null) : (data || null);
        } else if (!isMissingRpcFunction(modernResponse.error, 'pixieed_commit_shared_project_snapshot')) {
          usedSnapshotRpcSignature = 'modern';
          error = modernResponse.error;
        }
      }
      if (error) {
        console.info('[shared-sync]', {
          event: 'snapshot-write-rejected-by-server',
          reason: snapshotReason,
          projectKey: normalizedProjectKey,
          error: String(error?.message || error || ''),
        });
        handleSharedProjectsBackendError(error, 'persist-rpc');
        recordCreationSnapshotFailure(
          localizeText('Supabase RPCで共有プロジェクト作成に失敗しました。', 'Shared project creation failed in the Supabase RPC.'),
          String(error?.message || error || '')
        );
        return null;
      }
      if (!result) {
        recordCreationSnapshotFailure(
          localizeText('Supabaseから共有プロジェクト作成結果を取得できませんでした。', 'No shared project creation result was returned from Supabase.'),
          localizeText('RPCの戻り値または通信状態を確認してください。', 'Check the RPC return value or network state.')
        );
        return null;
      }
      if (result.commit_status === 'rejected' || result.commit_status === 'failed') {
        console.info('[shared-sync]', {
          event: 'snapshot-write-rejected-by-server',
          reason: snapshotReason,
          projectKey: normalizedProjectKey,
          status: result.commit_status,
        });
        recordCreationSnapshotFailure(
          localizeText('Supabaseが共有プロジェクト作成を拒否しました。', 'Supabase rejected the shared project creation.'),
          localizeText(`commit_status: ${result.commit_status}`, `commit_status: ${result.commit_status}`)
        );
        return null;
      }
      if (result.commit_status === 'conflict') {
        if (opType === 'draw' && opPayload) {
          pendingSharedProjectConflictReplay = {
            projectKey: normalizedProjectKey,
            opPayload,
            historyLabel: String(packagedPayload?.sharedHistoryLabel || ''),
          };
        }
        setActiveSharedProjectSyncState('catching-up', { announce: true });
        queueSharedProjectRefresh({ immediate: true, reason: 'commit-conflict', force: true });
        setMultiStatus(
          localizeText('共有プロジェクトの更新競合が発生したため最新状態へ再同期します', 'Shared project conflict detected. Refreshing to latest state.'),
          'warn'
        );
        recordCreationSnapshotFailure(
          localizeText('共有プロジェクト作成中に更新競合が発生しました。', 'A revision conflict occurred while creating the shared project.'),
          localizeText('最新状態へ再同期してからもう一度試してください。', 'Resync to the latest state and try again.')
        );
        return null;
      }
      sharedProjectLastCheckpointAt = Date.now();
      sharedProjectOpsSinceCheckpoint = 0;
      flushOrCompactSharedLocalOpJournal(normalizedProjectKey, {
        checkpointRevision: Math.max(0, Math.round(Number(result.checkpoint_seq) || Number(result.latest_revision) || 0)),
      }).catch(error => {
        console.warn('Failed to compact shared local op journal after checkpoint', error);
      });
      return result;
    } catch (error) {
      handleSharedProjectsBackendError(error, 'persist-exception');
      recordCreationSnapshotFailure(
        localizeText('共有プロジェクト保存中に例外が発生しました。', 'An exception occurred while saving the shared project.'),
        String(error?.message || error || '')
      );
      return null;
    }
  }

  function markSharedProjectLocalCommitRevision(result, resolvedOp, { source = 'db', rememberSeen = true } = {}) {
    const committedRevision = Math.max(0, Math.round(Number(result?.committed_revision || result?.latest_revision) || 0));
    const committedStructureRevision = Math.max(0, Math.round(Number(result?.committed_structure_revision || result?.latest_structure_revision) || 0));
    markSharedProjectLocalOpCommitConfirmed(resolvedOp, {
      source,
      revision: committedRevision,
      structureRevision: committedStructureRevision,
      rememberSeen,
    });
    return { committedRevision, committedStructureRevision };
  }

  function advanceSharedProjectAfterLocalCommit(projectKey, result, resolvedOp) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey);
    const committedRevision = Math.max(0, Math.round(Number(result?.committed_revision || result?.latest_revision) || 0));
    const committedStructureRevision = Math.max(0, Math.round(Number(result?.committed_structure_revision || result?.latest_structure_revision) || 0));
    const latestRevision = Math.max(0, Math.round(Number(result?.latest_revision ?? committedRevision) || 0));
    const canAdvanceContiguously = committedRevision > 0 && committedRevision <= sharedProjectLastAppliedSeq + 1;
    const resolvedOpType = classifySharedProjectOpType(String(resolvedOp?.historyLabel || ''));
    markSharedProjectLocalCommitRevision(result, resolvedOp, {
      source: result?.commit_status === 'duplicate' ? 'db-duplicate' : 'db',
      rememberSeen: canAdvanceContiguously || !(resolvedOpType === 'draw' || resolvedOpType === 'palette'),
    });
    if (canAdvanceContiguously) {
      sharedProjectLastAppliedSeq = Math.max(sharedProjectLastAppliedSeq, committedRevision);
      setActiveSharedProjectSession(
        normalizedProjectKey,
        Math.max(activeSharedProjectRevision, committedRevision),
        Math.max(activeSharedProjectStructureRevision, committedStructureRevision),
        result?.id || activeSharedProjectId
      );
      drainPendingSharedProjectRemoteOps();
      scheduleSharedProjectPostCommitCatchup('local-commit-confirmed-catchup');
      return true;
    }
    setActiveSharedProjectSyncState('catching-up', { announce: true });
    console.info('[shared-sync]', {
      event: 'local-commit-confirmed-with-gap',
      projectKey: normalizedProjectKey,
      opId: getSharedProjectOpId(resolvedOp),
      committedRevision,
      latestRevision,
      appliedRevision: sharedProjectLastAppliedSeq,
    });
    triggerImmediateSharedProjectRecovery('local-commit-gap').then(recovered => {
      if (!recovered) {
        queueSharedProjectRefresh({ immediate: true, reason: 'local-commit-gap', force: true });
      }
    }).catch(() => {
      queueSharedProjectRefresh({ immediate: true, reason: 'local-commit-gap', force: true });
    });
    return false;
  }

  async function commitSharedProjectOperation(projectKey, {
    // Realtime draw path:
    // local commit -> op RPC insert -> remote apply -> periodic checkpoint only.
    historyLabel = '',
    op = null,
    opPayload = null,
    retryOnConflict = true,
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey);
    const resolvedOp = op && typeof op === 'object'
      ? op
      : createOp(historyLabel, opPayload, { projectKey: normalizedProjectKey });
    const resolvedOpType = classifySharedProjectOpType(resolvedOp?.historyLabel || historyLabel);
    if (!normalizedProjectKey || !resolvedOp?.payload || typeof resolvedOp.payload !== 'object' || resolvedOpType === 'snapshot') {
      return null;
    }
    if (!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) {
      requeueSharedProjectOperationCommit(resolvedOp, {
        retryOnConflict,
        prioritize: resolvedOpType === 'draw',
        source: 'missing-backend-session',
        retryDelayMs: SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS,
      });
      return null;
    }
    const project = await ensureSharedProjectMembership(normalizedProjectKey, {
      createIfMissing: resolvedOpType === 'create',
      title: state.documentName || DEFAULT_DOCUMENT_NAME,
    });
    if (!project) {
      requeueSharedProjectOperationCommit(resolvedOp, {
        retryOnConflict,
        prioritize: resolvedOpType === 'draw',
        source: 'missing-shared-project-membership',
        retryDelayMs: SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS,
      });
      return null;
    }
    try {
      markSharedProjectLocalOpCommitStarted(resolvedOp, { source: 'db' });
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        requeueSharedProjectOperationCommit(resolvedOp, {
          retryOnConflict,
          prioritize: resolvedOpType === 'draw',
          source: 'missing-db-client',
          retryDelayMs: SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS,
        });
        return null;
      }
      const previousRevision = Math.max(0, Math.round(Number(activeSharedProjectRevision) || 0));
      const previousStructureRevision = Math.max(0, Math.round(Number(activeSharedProjectStructureRevision) || 0));
      console.info('[shared-sync]', {
        event: 'commit-started',
        opId: resolvedOp.opId || '',
        projectKey: normalizedProjectKey,
        baseRevision: previousRevision,
        baseStructureRevision: previousStructureRevision,
      });
      const { data, error } = await supabase.rpc('pixieed_commit_shared_project_op', {
        target_project_key: normalizedProjectKey,
        base_revision: previousRevision,
        base_structure_revision: previousStructureRevision,
        op_type: resolvedOpType,
        history_label: String(resolvedOp.historyLabel || historyLabel || ''),
        op_payload: {
          ...resolvedOp.payload,
          opId: resolvedOp.opId,
          clientId: resolvedOp.clientId,
          sessionId: resolvedOp.sessionId,
          kind: resolvedOp.kind,
          canvasId: resolvedOp.canvasId,
          frameIndex: resolvedOp.frameIndex,
          layerId: resolvedOp.layerId,
          createdAt: resolvedOp.createdAt,
        },
      });
      if (error) {
        markSharedProjectLocalOpCommitFailed(resolvedOp, error, { source: 'db' });
        requeueSharedProjectOperationCommit(resolvedOp, {
          retryOnConflict,
          prioritize: resolvedOpType === 'draw',
          source: isRecoverableSharedBackendPreflightError(error) ? 'recoverable-commit-failure' : 'commit-failure',
          retryDelayMs: isRecoverableSharedBackendPreflightError(error) ? SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS : 300,
        });
        if (resolvedOpType === 'draw' || resolvedOpType === 'palette' || resolvedOpType === 'structure') {
          queueSharedProjectRefresh({ immediate: true, reason: 'commit-failed', force: true });
        }
        handleSharedProjectsBackendError(error, 'commit-op-rpc');
        return null;
      }
      const result = Array.isArray(data) ? (data[0] || null) : (data || null);
      if (!result) {
        markSharedProjectLocalOpCommitFailed(resolvedOp, new Error('Missing commit result'), { source: 'db' });
        requeueSharedProjectOperationCommit(resolvedOp, {
          retryOnConflict,
          prioritize: resolvedOpType === 'draw',
          source: 'missing-commit-result',
          retryDelayMs: SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS,
        });
        if (resolvedOpType === 'draw' || resolvedOpType === 'palette' || resolvedOpType === 'structure') {
          queueSharedProjectRefresh({ immediate: true, reason: 'commit-failed', force: true });
        }
        return null;
      }
      if (result.commit_status === 'conflict') {
        markSharedProjectLocalOpCommitFailed(resolvedOp, new Error('commit conflict'), { source: 'db' });
        discardSharedProjectRejectedLocalOp(resolvedOp, {
          source: result.conflict_reason || 'commit-conflict',
        });
        queueSharedProjectRefresh({ immediate: true, reason: 'commit-failed', force: true });
        if (
          result.conflict_reason === 'stale-structure-revision'
          && (resolvedOpType === 'draw' || resolvedOpType === 'palette')
        ) {
          setActiveSharedProjectSyncState('catching-up', { announce: true });
          setMultiStatus(
            localizeText(
              '共有プロジェクトの構造変更と重なったため、この描画は最新構造へ再同期します',
              'This draw overlapped a shared structure change, so the document will resync to the latest structure.'
            ),
            'warn'
          );
          queueSharedProjectRefresh({ immediate: true, reason: 'stale-structure-draw-conflict', force: true });
          return null;
        }
        if (retryOnConflict && (resolvedOpType === 'draw' || resolvedOpType === 'palette')) {
          pendingSharedProjectConflictReplay = {
            projectKey: normalizedProjectKey,
            opPayload: resolvedOp.payload,
            historyLabel: String(resolvedOp.historyLabel || historyLabel || ''),
          };
          const conflictProject = await fetchSharedProjectRecord(normalizedProjectKey);
          if (conflictProject && await applySharedProjectOpsSinceRevision(conflictProject, previousRevision)) {
            if (resolvedOpType === 'draw') {
              maybeReplayPendingSharedProjectConflictAfterRefresh(normalizedProjectKey);
            }
            enqueueSharedProjectOperationCommit(normalizedProjectKey, {
              historyLabel: String(resolvedOp.historyLabel || historyLabel || ''),
              opPayload: resolvedOp.payload,
              retryOnConflict: false,
            });
            setMultiStatus(
              localizeText(
                resolvedOpType === 'palette'
                  ? '共有競合を検知したため、最新状態へ追従してからパレット変更を再送しました'
                  : '共有競合を検知したため、最新状態へ追従してから描画を再送しました',
                resolvedOpType === 'palette'
                  ? 'A shared edit conflict was detected. Your palette update was resent on top of the latest state.'
                  : 'A shared edit conflict was detected. Your draw op was resent on top of the latest state.'
              ),
              'info'
            );
          } else {
            setActiveSharedProjectSyncState('catching-up', { announce: true });
            queueSharedProjectRefresh({ immediate: true, reason: 'op-conflict', force: true });
          }
        } else if (resolvedOpType === 'draw') {
          queueSharedProjectRefresh({ immediate: true, reason: 'op-conflict-final', force: true });
        }
        return null;
      }
      if (result.commit_status === 'duplicate') {
        advanceSharedProjectAfterLocalCommit(normalizedProjectKey, result, resolvedOp);
        console.info('[shared-sync]', {
          event: 'commit-confirmed',
          status: 'duplicate',
          opId: resolvedOp.opId || '',
          revision: Math.max(0, Math.round(Number(result.committed_revision || result.latest_revision) || 0)),
        });
        return result;
      }
      if (result.commit_status && result.commit_status !== 'committed') {
        markSharedProjectLocalOpCommitFailed(
          resolvedOp,
          new Error(`commit ${result.commit_status}${result.conflict_reason ? `: ${result.conflict_reason}` : ''}`),
          { source: 'db' }
        );
        if (result.conflict_reason === 'not-editor') {
          discardSharedProjectRejectedLocalOp(resolvedOp, {
            source: result.conflict_reason,
          });
          setMultiStatus(
            localizeText(
              'この共有プロジェクトの編集権限がないため、変更を送信できませんでした',
              'You do not have edit permission for this shared project.'
            ),
            'error'
          );
        } else {
          requeueSharedProjectOperationCommit(resolvedOp, {
            retryOnConflict,
            prioritize: resolvedOpType === 'draw',
            source: `commit-${result.commit_status}`,
            retryDelayMs: SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS,
          });
        }
        return null;
      }
      advanceSharedProjectAfterLocalCommit(normalizedProjectKey, result, resolvedOp);
      console.info('[shared-sync]', {
        event: 'commit-confirmed',
        status: result.commit_status || 'committed',
        opId: resolvedOp.opId || '',
        revision: Math.max(0, Math.round(Number(result.committed_revision || result.latest_revision) || 0)),
      });
      markDocumentDurablySaved();
      noteSharedProjectOperationApplied({ opType: resolvedOpType, fromRemote: false });
      if (resolvedOpType === 'draw') {
        const snapshotRefreshed = refreshSharedProjectLayerSnapshotForPayload(extractSharedProjectOpPayload(resolvedOp));
        console.debug('[shared-realtime] draw-commit-confirmed', {
          projectKey: normalizedProjectKey,
          opId: resolvedOp.opId || '',
          latestRevision: Math.max(0, Math.round(Number(result.latest_revision) || 0)),
          latestStructureRevision: Math.max(0, Math.round(Number(result.latest_structure_revision) || 0)),
          snapshotRefreshed,
        });
      }
      if (shouldCreateSharedProjectCheckpoint(resolvedOpType)) {
        scheduleSharedProjectCheckpoint({
          historyLabel: resolvedOpType === 'structure' ? historyLabel : 'checkpoint',
        });
      }
      flushOrCompactSharedLocalOpJournal(normalizedProjectKey, {
        checkpointRevision: Math.max(0, Math.round(Number(result.checkpoint_seq) || 0)),
      }).catch(error => {
        console.warn('Failed to compact shared local op journal', error);
      });
      return result;
    } catch (error) {
      console.info('[shared-sync]', {
        event: 'commit-failed',
        opId: resolvedOp?.opId || '',
        projectKey: normalizedProjectKey,
        error: String(error?.message || error || ''),
      });
      markSharedProjectLocalOpCommitFailed(resolvedOp, error, { source: 'db-exception' });
      requeueSharedProjectOperationCommit(resolvedOp, {
        retryOnConflict,
        prioritize: resolvedOpType === 'draw',
        source: 'commit-exception',
        retryDelayMs: SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS,
      });
      if (resolvedOpType === 'draw' || resolvedOpType === 'palette' || resolvedOpType === 'structure') {
        queueSharedProjectRefresh({ immediate: true, reason: 'commit-failed', force: true });
      }
      handleSharedProjectsBackendError(error, 'commit-op-exception');
      return null;
    }
  }

  function flushSharedProjectPendingLocalOps() {
    if (sharedProjectOpCommitInFlight || !sharedProjectPendingLocalOps.length) {
      return;
    }
    sortSharedProjectPendingLocalOps();
    const nextQueuedOp = sharedProjectPendingLocalOps[0] || null;
    if (
      activeSharedProjectKey
      && (
        sharedProjectRecoveryInProgress
        || sharedProjectReconnectRecoveryPromise
        || sharedProjectWakeRecoveryPromise
        || sharedProjectRefreshInFlight
        || sharedProjectSnapshotReplayInFlight
        || sharedProjectDeferRealtimeUntilSynced
        || activeSharedProjectSyncState === 'catching-up'
      )
      && !canFlushSharedProjectLocalOpDuringCatchup(nextQueuedOp)
    ) {
      scheduleSharedProjectPendingLocalOpsRetry(700, 'wait-for-latest-verification');
      return;
    }
    if (isSharedProjectLocalOpExpiredForRetry(nextQueuedOp)) {
      discardSharedProjectExpiredLocalOp(nextQueuedOp, { source: 'commit-queue-expired' });
      if (sharedProjectPendingLocalOps.length) {
        scheduleSharedProjectPendingLocalOpsFlush(0, 'skip-expired-op');
      }
      return;
    }
    const retryDelayRemaining = Math.max(0, sharedProjectPendingLocalRetryBlockedUntil - Date.now());
    if (retryDelayRemaining > 0) {
      scheduleSharedProjectPendingLocalOpsRetry(retryDelayRemaining, 'retry-backoff');
      return;
    }
    const roomCommitDelay = getSharedProjectRoomCommitDelay(nextQueuedOp?.projectKey || activeSharedProjectKey);
    if (roomCommitDelay > 0) {
      scheduleSharedProjectPendingLocalOpsFlush(roomCommitDelay, 'room-commit-rate-limit');
      return;
    }
    const nextOp = sharedProjectPendingLocalOps.shift();
    if (!nextOp) {
      return;
    }
    const nextOpId = getSharedProjectOpId(nextOp.op || nextOp);
    if (nextOpId && sharedProjectSeenOpIds.has(nextOpId)) {
      console.info('[shared-sync]', {
        event: 'commit-queue-drain-skipped-confirmed',
        opId: nextOpId,
        projectKey: nextOp.projectKey || '',
        remainingQueueLength: sharedProjectPendingLocalOps.length,
      });
      deleteSharedLocalOpJournalEntry(nextOpId).catch(error => {
        console.warn('Failed to delete confirmed queued shared local op journal entry', error);
      });
      scheduleSharedProjectPendingLocalOpsFlush(0, 'skip-confirmed-op');
      return;
    }
    console.info('[shared-sync]', {
      event: 'commit-queue-drain-start',
      opId: nextOpId,
      projectKey: nextOp.projectKey || '',
      remainingQueueLength: sharedProjectPendingLocalOps.length,
    });
    console.info('[shared-sync]', {
      event: 'local-op-retry-start',
      opId: nextOpId,
      projectKey: nextOp.projectKey || '',
    });
    sharedProjectOpCommitInFlight = true;
    markSharedProjectRoomCommitSent(nextOp.projectKey);
    commitSharedProjectOperation(nextOp.projectKey, {
      historyLabel: nextOp.historyLabel,
      op: nextOp.op || null,
      opPayload: nextOp.opPayload,
      retryOnConflict: nextOp.retryOnConflict !== false,
    }).finally(() => {
      sharedProjectOpCommitInFlight = false;
      scheduleSharedProjectPostCommitCatchup('local-commit-finished-catchup');
      if (sharedProjectPendingLocalOps.length) {
        scheduleSharedProjectPendingLocalOpsFlush(
          getSharedProjectRoomCommitDelay(sharedProjectPendingLocalOps[0]?.projectKey || activeSharedProjectKey),
          'continue-commit-queue'
        );
      }
    });
  }

  function enqueueSharedProjectOperationCommit(projectKey, {
    historyLabel = '',
    opPayload = null,
    retryOnConflict = true,
  } = {}) {
    if (!projectKey || !opPayload || typeof opPayload !== 'object') {
      return;
    }
    const op = createOp(historyLabel, opPayload, { projectKey });
    sendOp(op, { retryOnConflict });
  }

  async function appendSharedProjectOp(projectRecord, {
    revision = 0,
    baseRevision = 0,
    structureRevision = 0,
    historyLabel = '',
    opType = '',
    opPayload = null,
  } = {}) {
    if (!canUseSharedProjectsBackend() || !projectRecord?.id || !accountState.userId) {
      return null;
    }
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return null;
      }
      const payload = {
        project_id: projectRecord.id,
        revision: Math.max(0, Math.round(Number(revision) || 0)),
        base_revision: Math.max(0, Math.round(Number(baseRevision) || 0)),
        structure_revision: Math.max(0, Math.round(Number(structureRevision) || 0)),
        op_type: opType || classifySharedProjectOpType(historyLabel),
        actor_user_id: accountState.userId,
        payload: {
          historyLabel: String(historyLabel || ''),
          documentName: state.documentName || DEFAULT_DOCUMENT_NAME,
          activeCanvasId: getActiveProjectCanvasDocument()?.id || '',
          activeFrame: clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, (state.frames?.length || 1) - 1)),
          createdAt: new Date().toISOString(),
          op: opPayload && typeof opPayload === 'object' ? opPayload : null,
        },
      };
      const { error } = await supabase.from('shared_project_ops').insert(payload);
      if (error) {
        if (String(error.code || '') === '23505' || Number(error.status || 0) === 409) {
          queueSharedProjectRefresh({ immediate: true, reason: 'op-conflict' });
          return payload;
        }
        handleSharedProjectsBackendError(error, 'append-op');
        return null;
      }
      return payload;
    } catch (error) {
      handleSharedProjectsBackendError(error, 'append-op-exception');
      return null;
    }
  }

  async function syncSharedRecentProjectsFromAccount() {
    if (!canUseSharedProjectsBackend() && !await ensureSharedProjectBackendSession()) {
      return [];
    }
    if (!accountState.userId || accountState.isAnonymous) {
      return [];
    }
    try {
      await enforceSharedProjectOwnershipLimit();
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        return [];
      }
      const [membershipResponse, ownerProjectsResponse] = await Promise.all([
        supabase
          .from('shared_project_members')
          .select('project_key, role, updated_at, joined_at')
          .eq('user_id', accountState.userId),
        supabase
          .from('shared_projects')
          .select('project_key')
          .eq('owner_user_id', accountState.userId),
      ]);

      if (membershipResponse.error) {
        if (isRecoverableSharedBackendPreflightError(membershipResponse.error)) {
          console.debug('[shared-backend] list-memberships skipped after recoverable preflight failure', {
            context: 'list-memberships',
            status: Number(membershipResponse.error?.status || 0),
            code: String(membershipResponse.error?.code || ''),
            message: String(membershipResponse.error?.message || ''),
            online: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : null,
            visibilityState: typeof document !== 'undefined' ? String(document.visibilityState || '') : '',
          });
          return [];
        }
        handleSharedProjectsBackendError(membershipResponse.error, 'list-memberships');
        return [];
      }

      const memberships = Array.isArray(membershipResponse.data) ? membershipResponse.data : [];
      const membershipProjectKeys = memberships
        .map(entry => normalizeMultiProjectKey(entry?.project_key || ''))
        .filter(Boolean);

      let ownerProjectKeys = [];
      if (ownerProjectsResponse.error) {
        if (!isRecoverableSharedBackendPreflightError(ownerProjectsResponse.error)) {
          // Owner key listing is a best-effort fallback to catch projects created on other devices.
          console.debug('[shared-backend] list-owned-project-keys failed', {
            context: 'list-owned-project-keys',
            status: Number(ownerProjectsResponse.error?.status || 0),
            code: String(ownerProjectsResponse.error?.code || ''),
            message: String(ownerProjectsResponse.error?.message || ''),
          });
        }
      } else {
        ownerProjectKeys = (Array.isArray(ownerProjectsResponse.data) ? ownerProjectsResponse.data : [])
          .map(entry => normalizeMultiProjectKey(entry?.project_key || ''))
          .filter(Boolean);
      }

      const uniqueProjectKeys = [...new Set([
        ...membershipProjectKeys,
        ...ownerProjectKeys,
      ])];
      if (!uniqueProjectKeys.length) {
        await pruneSharedRecentEntriesToKnownProjects([]);
        return [];
      }

      const hiddenProjectKeys = readHiddenSharedProjectKeys();
      const visibleProjectKeys = uniqueProjectKeys.filter(projectKey => !hiddenProjectKeys.has(projectKey));
      if (!visibleProjectKeys.length) {
        await pruneSharedRecentEntriesToKnownProjects(visibleProjectKeys);
        return [];
      }

      const projectEntries = await Promise.all(
        visibleProjectKeys.map(projectKey => fetchSharedProjectRecordViaRpc(supabase, projectKey, 'list-projects'))
      );
      const projectsByKey = new Map();
      projectEntries.forEach(entry => {
        const normalizedProjectKey = normalizeMultiProjectKey(entry?.project_key || '');
        if (!normalizedProjectKey) {
          return;
        }
        projectsByKey.set(normalizedProjectKey, entry);
      });

      const membershipByProjectKey = new Map();
      memberships.forEach(entry => {
        const projectKey = normalizeMultiProjectKey(entry?.project_key || '');
        if (!projectKey) {
          return;
        }
        const existing = membershipByProjectKey.get(projectKey);
        if (!existing) {
          membershipByProjectKey.set(projectKey, entry);
          return;
        }
        const existingTime = Date.parse(existing?.updated_at || existing?.joined_at || '') || 0;
        const nextTime = Date.parse(entry?.updated_at || entry?.joined_at || '') || 0;
        if (nextTime >= existingTime) {
          membershipByProjectKey.set(projectKey, entry);
        }
      });

      const normalizedEntries = [];
      for (let index = 0; index < visibleProjectKeys.length; index += 1) {
        const projectKey = visibleProjectKeys[index];
        const project = projectsByKey.get(projectKey) || null;
        if (!project?.project_key) {
          continue;
        }
        const membership = membershipByProjectKey.get(projectKey) || null;
        const existingSharedEntry = getSharedRecentProjectEntry(projectKey);
        const thumbnail = existingSharedEntry?.thumbnail || null;
        const sharedEntry = await upsertSharedRecentProjectEntry({
          projectKey,
          projectId: project?.id || '',
          inviteToken: project?.invite_token || '',
          visibility: project?.visibility || 'private',
          name: createSharedProjectSnapshotTitle(project?.title || projectKey),
          thumbnail,
          roleHint: project?.owner_user_id === accountState.userId ? 'master' : 'guest',
          membershipRole: membership?.role || project?.membership_role || '',
          ownerUserId: project?.owner_user_id || '',
          autoJoin: false,
          revision: Math.max(0, Math.round(Number(project?.latest_revision) || 0)),
          structureRevision: Math.max(0, Math.round(Number(project?.latest_structure_revision) || 0)),
        });
        if (sharedEntry) {
          normalizedEntries.push(sharedEntry);
        }
      }
      await pruneSharedRecentEntriesToKnownProjects(visibleProjectKeys);
      return normalizedEntries;
    } catch (error) {
      handleSharedProjectsBackendError(error, 'sync-recent-projects-exception');
      return [];
    } finally {
      sharedRecentProjectsLastAccountSyncAt = Date.now();
    }
  }

  function queueSharedProjectSnapshotPersist(packagedPayload, {
    projectKey = '',
    title = '',
    historyLabel = '',
    delayMs = SHARED_PROJECT_SYNC_DELAY,
  } = {}) {
    if (!canUseSharedProjectsBackend()) {
      return;
    }
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState(projectKey);
    if (!resolvedProjectKey || !packagedPayload || typeof packagedPayload !== 'object') {
      return;
    }
    if (!canPersistActiveSharedProjectDocument(resolvedProjectKey, historyLabel)) {
      return;
    }
    sharedProjectSyncQueuedPayload = {
      projectKey: resolvedProjectKey,
      title: createSharedProjectSnapshotTitle(title || state.documentName || DEFAULT_DOCUMENT_NAME),
      historyLabel: String(historyLabel || ''),
      baseRevision: activeSharedProjectRevision,
      baseStructureRevision: activeSharedProjectStructureRevision,
      packagedPayload: {
        ...packagedPayload,
        sharedHistoryLabel: String(historyLabel || ''),
      },
    };
    if (sharedProjectSyncTimer !== null) {
      window.clearTimeout(sharedProjectSyncTimer);
    }
    const persistDelayMs = Math.max(0, Math.round(Number(delayMs) || 0));
    sharedProjectSyncTimer = window.setTimeout(async () => {
      sharedProjectSyncTimer = null;
      if (!sharedProjectSyncQueuedPayload) {
        return;
      }
      if (sharedProjectSyncInFlight) {
        const queuedPayload = sharedProjectSyncQueuedPayload;
        queueSharedProjectSnapshotPersist(queuedPayload.packagedPayload, {
          projectKey: queuedPayload.projectKey,
          title: queuedPayload.title,
          historyLabel: queuedPayload.historyLabel,
          delayMs: Math.max(120, persistDelayMs),
        });
        return;
      }
      const nextPayload = sharedProjectSyncQueuedPayload;
      sharedProjectSyncQueuedPayload = null;
      sharedProjectSyncInFlight = true;
      try {
        const saved = await persistSharedProjectSnapshot(
          nextPayload.projectKey,
          nextPayload.packagedPayload,
          { title: nextPayload.title, reason: nextPayload.historyLabel }
        );
        if (saved) {
          const nextStructureRevision = Math.max(
            0,
            Math.round(Number(saved.latest_structure_revision) || nextPayload.baseStructureRevision || 0)
          );
          if (nextPayload.projectKey === activeSharedProjectKey) {
            setActiveSharedProjectSession(
              nextPayload.projectKey,
              Math.max(0, Math.round(Number(saved.latest_revision) || activeSharedProjectRevision)),
              nextStructureRevision,
              saved.id || activeSharedProjectId
            );
            markDocumentDurablySaved();
          }
          await upsertSharedRecentProjectEntry({
            projectKey: nextPayload.projectKey,
            projectId: saved.id || '',
            inviteToken: saved.invite_token || '',
            visibility: saved.visibility || 'private',
            name: createSharedProjectSnapshotTitle(saved.title || nextPayload.title),
            roleHint: saved.owner_user_id === accountState.userId ? 'master' : 'guest',
            membershipRole: saved.membership_role || '',
            ownerUserId: saved.owner_user_id || accountState.userId || '',
            autoJoin: false,
            revision: Math.max(0, Math.round(Number(saved.latest_revision) || 0)),
            structureRevision: nextStructureRevision,
          });
        }
      } finally {
        sharedProjectSyncInFlight = false;
        if (sharedProjectSyncQueuedPayload) {
          queueSharedProjectSnapshotPersist(
            sharedProjectSyncQueuedPayload.packagedPayload,
            {
              projectKey: sharedProjectSyncQueuedPayload.projectKey,
              title: sharedProjectSyncQueuedPayload.title,
              historyLabel: sharedProjectSyncQueuedPayload.historyLabel,
              delayMs: persistDelayMs,
            }
          );
        }
      }
    }, persistDelayMs);
  }

  function queueSharedProjectRefresh({ immediate = false, reason = '', force = false } = {}) {
    if (!activeSharedProjectKey || !canUseSharedProjectsBackend()) {
      return;
    }
    const normalizedReason = String(reason || '');
    const now = Date.now();
    const realtimeSubscribed = sharedProjectRealtimeStatus === 'subscribed';
    const refreshAlreadyQueuedOrRunning = Boolean(
      sharedProjectRefreshInFlight
      || sharedProjectRefreshTimer !== null
      || sharedProjectImmediateRecoveryPromise
    );
    const isCanonicalRefreshReason = (
      normalizedReason === 'canonical-resync'
      || normalizedReason.includes('canonical-resync-')
    );
    const isForegroundRecoveryReason = (
      normalizedReason === 'focus'
      || normalizedReason === 'visibility'
      || normalizedReason === 'online'
    );
    const isReconnectRecoveryReason = (
      normalizedReason.includes('reconnect')
      || normalizedReason.includes('resume-pending-local-ops')
    );
    const recentlyVerifiedLatest = Boolean(
      activeSharedProjectKey
      && sharedProjectLastVerifiedLatestKey === activeSharedProjectKey
      && sharedProjectLastVerifiedLatestRevision >= activeSharedProjectRevision
      && sharedProjectLastVerifiedLatestStructureRevision >= activeSharedProjectStructureRevision
      && activeSharedProjectDocumentLoaded
      && activeSharedProjectSynced
      && !sharedProjectDeferRealtimeUntilSynced
      && !hasSharedProjectHardLocalWorkInFlight()
      && (now - sharedProjectLastVerifiedLatestAt) < SHARED_PROJECT_FORCE_REFRESH_DEDUPE_MS
    );
    if (
      !force
      && realtimeSubscribed
      && (
        normalizedReason === 'poll-idle'
        || isForegroundRecoveryReason
      )
    ) {
      logSharedProjectRealtimeChannelLifecycle('skip-queue-refresh', {
        caller: 'queueSharedProjectRefresh',
        reason: 'realtime-subscribed',
        extra: {
          requestedReason: normalizedReason,
          immediate,
          force,
          realtimeStatus: sharedProjectRealtimeStatus,
        },
      });
      return;
    }
    if (
      !immediate
      && normalizedReason === 'poll-idle'
      && (
        sharedProjectRefreshInFlight
        || sharedProjectRealtimeConnectPromise
        || sharedProjectRefreshTimer !== null
        || sharedProjectRealtimeRetryBlockedUntil > now
        || (
          sharedProjectLastRefreshQueuedReason === 'poll-idle'
          && (now - sharedProjectLastRefreshQueuedAt) < (SHARED_PROJECT_REFRESH_LOOP_INTERVAL_MS * 2)
        )
      )
    ) {
      logSharedProjectRealtimeChannelLifecycle('skip-queue-refresh', {
        caller: 'queueSharedProjectRefresh',
        reason: 'poll-idle-suppressed',
        extra: {
          requestedReason: normalizedReason,
          immediate,
          force,
        },
      });
      return;
    }
    if (
      immediate
      && isForegroundRecoveryReason
      && (
        sharedProjectRefreshInFlight
        || sharedProjectRealtimeConnectPromise
        || sharedProjectRefreshTimer !== null
        || sharedProjectRealtimeRetryBlockedUntil > now
        || (
          sharedProjectLastRefreshQueuedReason === normalizedReason
          && (now - sharedProjectLastRefreshQueuedAt) < SHARED_PROJECT_REFRESH_LOOP_INTERVAL_MS
        )
      )
    ) {
      logSharedProjectRealtimeChannelLifecycle('skip-queue-refresh', {
        caller: 'queueSharedProjectRefresh',
        reason: 'foreground-refresh-suppressed',
        extra: {
          requestedReason: normalizedReason,
          immediate,
          force,
        },
      });
      return;
    }
    if (
      force
      && normalizedReason
      && refreshAlreadyQueuedOrRunning
      && sharedProjectLastForceRefreshQueuedReason === normalizedReason
      && (now - sharedProjectLastForceRefreshQueuedAt) < SHARED_PROJECT_FORCE_REFRESH_DEDUPE_MS
    ) {
      logSharedProjectRealtimeChannelLifecycle('skip-queue-refresh', {
        caller: 'queueSharedProjectRefresh',
        reason: 'duplicate-force-refresh-suppressed',
        extra: {
          requestedReason: normalizedReason,
          immediate,
          force,
        },
      });
      return;
    }
    if (
      force
      && recentlyVerifiedLatest
      && refreshAlreadyQueuedOrRunning
      && (isReconnectRecoveryReason || normalizedReason === sharedProjectLastForceRefreshQueuedReason)
    ) {
      logSharedProjectRealtimeChannelLifecycle('skip-queue-refresh', {
        caller: 'queueSharedProjectRefresh',
        reason: 'recent-latest-verification-suppressed',
        extra: {
          requestedReason: normalizedReason,
          immediate,
          force,
          activeRevision: activeSharedProjectRevision,
          activeStructureRevision: activeSharedProjectStructureRevision,
        },
      });
      return;
    }
    if (
      force
      && isCanonicalRefreshReason
      && sharedProjectLastCanonicalRefreshQueuedAt > 0
      && (now - sharedProjectLastCanonicalRefreshQueuedAt) < SHARED_PROJECT_CANONICAL_REFRESH_COOLDOWN_MS
      && (
        refreshAlreadyQueuedOrRunning
        || normalizedReason === 'canonical-resync'
      )
    ) {
      logSharedProjectRealtimeChannelLifecycle('skip-queue-refresh', {
        caller: 'queueSharedProjectRefresh',
        reason: 'canonical-refresh-cooldown',
        extra: {
          requestedReason: normalizedReason,
          immediate,
          force,
          cooldownMs: SHARED_PROJECT_CANONICAL_REFRESH_COOLDOWN_MS,
        },
      });
      return;
    }
    logSharedProjectRealtimeChannelLifecycle('queue-refresh', {
      caller: 'queueSharedProjectRefresh',
      reason: normalizedReason || (immediate ? 'immediate' : 'scheduled'),
      extra: { immediate, force },
    });
    sharedProjectLastRefreshQueuedAt = now;
    sharedProjectLastRefreshQueuedReason = normalizedReason;
    if (force) {
      sharedProjectLastForceRefreshQueuedAt = now;
      sharedProjectLastForceRefreshQueuedReason = normalizedReason;
    }
    if (isCanonicalRefreshReason) {
      sharedProjectLastCanonicalRefreshQueuedAt = now;
    }
    if (sharedProjectRefreshTimer !== null) {
      window.clearTimeout(sharedProjectRefreshTimer);
      sharedProjectRefreshTimer = null;
    }
    // Refresh is fallback, not the primary draw sync path.
    const delayMs = immediate ? 0 : Math.max(SHARED_PROJECT_SYNC_DELAY, SHARED_PROJECT_REFRESH_LOOP_INTERVAL_MS);
    sharedProjectRefreshTimer = window.setTimeout(() => {
      sharedProjectRefreshTimer = null;
      sharedProjectLastRefreshQueuedAt = 0;
      sharedProjectLastRefreshQueuedReason = '';
      refreshActiveSharedProjectSnapshot({ reason, force }).catch(error => {
        console.warn('Failed to refresh shared project snapshot', error);
      });
    }, delayMs);
  }

  function triggerImmediateSharedProjectRecovery(reason = 'recovery') {
    if (!activeSharedProjectKey || sharedProjectImmediateRecoveryPromise) {
      return sharedProjectImmediateRecoveryPromise || Promise.resolve(false);
    }
    sharedProjectImmediateRecoveryPromise = Promise.resolve()
      .then(() => refreshActiveSharedProjectSnapshot({ reason, force: true }))
      .catch(error => {
        console.warn('[shared-realtime] immediate-recovery-failed', {
          reason,
          projectKey: activeSharedProjectKey || '',
          error: String(error?.message || error || ''),
        });
        return false;
      })
      .finally(() => {
        sharedProjectImmediateRecoveryPromise = null;
      });
    return sharedProjectImmediateRecoveryPromise;
  }

  function scheduleSharedProjectConvergenceResync(reason = 'convergence-resync', delayMs = 240) {
    if (!activeSharedProjectKey) {
      return;
    }
    if (sharedProjectConvergenceResyncTimer !== null) {
      return;
    }
    sharedProjectConvergenceResyncTimer = window.setTimeout(() => {
      sharedProjectConvergenceResyncTimer = null;
      runSharedProjectConvergenceResync(reason).catch(() => {});
    }, Math.max(32, Math.round(Number(delayMs) || 240)));
  }

  async function runSharedProjectConvergenceResync(reason = 'convergence-resync') {
    if (!activeSharedProjectKey || !canUseSharedProjectsBackend()) {
      return false;
    }
    if (sharedProjectConvergenceResyncPromise) {
      return sharedProjectConvergenceResyncPromise;
    }
    sharedProjectConvergenceResyncPromise = (async () => {
      const projectKey = activeSharedProjectKey;
      const startedAt = Date.now();
      const pendingLocalCount = sharedProjectPendingLocalOps.length
        + sharedProjectLocalInFlightOps.size
        + (sharedProjectOpCommitInFlight ? 1 : 0);
      sharedProjectLastConvergenceResyncAt = startedAt;
      console.info('[shared-sync]', {
        event: 'convergence-resync-start',
        reason,
        projectKey,
        appliedRevision: sharedProjectLastAppliedSeq,
        activeRevision: activeSharedProjectRevision,
        pendingRemoteOps: sharedProjectPendingRemoteOps.size,
        pendingLocalOps: pendingLocalCount,
      });
      setActiveSharedProjectSyncState('catching-up', { announce: true });
      try {
        const beforeRevision = sharedProjectLastAppliedSeq;
        const project = await fetchSharedProjectRecord(projectKey);
        if (!project || projectKey !== activeSharedProjectKey) {
          throw new Error('missing shared project checkpoint');
        }
        const snapshotRevision = Math.max(0, Math.round(Number(project.checkpoint_seq ?? project.latest_revision) || 0));
        console.info('[shared-sync]', {
          event: 'convergence-resync-loaded-checkpoint',
          reason,
          projectKey,
          snapshotRevision,
          latestRevision: Math.max(0, Math.round(Number(project.latest_revision) || 0)),
        });
        const refreshed = await refreshActiveSharedProjectSnapshot({
          reason: `convergence-resync-${reason || 'recovery'}`,
          force: true,
        });
        console.info('[shared-sync]', {
          event: 'convergence-resync-replayed-confirmed-ops',
          reason,
          projectKey,
          replayed: Math.max(0, sharedProjectLastAppliedSeq - beforeRevision),
          revision: sharedProjectLastAppliedSeq,
        });
        const replayedLocal = replaySharedProjectLocalProvisionalAfterRemoteOps('convergence-resync');
        console.info('[shared-sync]', {
          event: 'convergence-resync-replayed-local-pending',
          reason,
          projectKey,
          replayed: replayedLocal,
          pendingLocalOps: sharedProjectPendingLocalOps.length + sharedProjectLocalInFlightOps.size,
        });
        const hash = createSharedProjectDocumentFingerprint();
        if (!refreshed || sharedProjectPendingRemoteOps.size > 0) {
          console.warn('[shared-sync]', {
            event: 'convergence-resync-hash-mismatch',
            reason,
            projectKey,
            refreshed,
            pendingRemoteOps: sharedProjectPendingRemoteOps.size,
            hash: hash?.hash || '',
          });
          throw new Error('convergence resync incomplete');
        }
        console.info('[shared-sync]', {
          event: 'convergence-resync-hash-ok',
          reason,
          projectKey,
          hash: hash?.hash || '',
          revision: sharedProjectLastAppliedSeq,
        });
        setSharedProjectDeferRealtimeUntilSynced(false);
        setActiveSharedProjectSyncState('synced');
        updateAutosaveStatus(
          localizeText('共有プロジェクトを最新状態に補正しました', 'Shared project corrected to the latest state'),
          'info'
        );
        console.info('[shared-sync]', {
          event: 'convergence-resync-complete',
          reason,
          projectKey,
          revision: sharedProjectLastAppliedSeq,
          elapsedMs: Date.now() - startedAt,
        });
        sharedProjectConvergenceResyncFailureKey = '';
        sharedProjectConvergenceResyncFailureCount = 0;
        return true;
      } catch (error) {
        const errorMessage = String(error?.message || error || '');
        const failureKey = `${projectKey}:${errorMessage}`;
        if (failureKey === sharedProjectConvergenceResyncFailureKey) {
          sharedProjectConvergenceResyncFailureCount += 1;
        } else {
          sharedProjectConvergenceResyncFailureKey = failureKey;
          sharedProjectConvergenceResyncFailureCount = 1;
        }
        const normalizedRetryReason = String(reason || 'convergence').replace(/(?:-retry)+$/g, '');
        const shouldRetryConvergence = (
          projectKey === activeSharedProjectKey
          && sharedProjectConvergenceResyncFailureCount <= SHARED_PROJECT_CONVERGENCE_RESYNC_MAX_RETRIES
        );
        console.warn('[shared-sync]', {
          event: 'convergence-resync-failed',
          reason,
          projectKey,
          error: errorMessage,
          failureCount: sharedProjectConvergenceResyncFailureCount,
          willRetry: shouldRetryConvergence,
        });
        setActiveSharedProjectSyncState('catching-up', { announce: true });
        updateAutosaveStatus(
          localizeText('通信不安定。ローカル変更を保護中です', 'Connection unstable. Local changes are protected.'),
          'warn'
        );
        if (shouldRetryConvergence) {
          scheduleSharedProjectConvergenceResync(`${normalizedRetryReason}-retry`, 1200);
        } else {
          console.warn('[shared-sync]', {
            event: 'convergence-resync-retry-suppressed',
            reason: normalizedRetryReason,
            projectKey,
            error: errorMessage,
            failureCount: sharedProjectConvergenceResyncFailureCount,
          });
          queueSharedProjectReconnectRecovery(`${normalizedRetryReason}-fallback`, {
            immediate: false,
            blockEditing: false,
          }).catch(() => {});
        }
        return false;
      }
    })();
    try {
      return await sharedProjectConvergenceResyncPromise;
    } finally {
      sharedProjectConvergenceResyncPromise = null;
    }
  }

  function queueSharedProjectCurrentSnapshotCapture({
    delayMs = SHARED_PROJECT_DEFERRED_PERSIST_DELAY,
    projectKey = '',
    title = '',
    historyLabel = '',
    force = false,
    revision = null,
  } = {}) {
    if (!canUseSharedProjectsBackend()) {
      return;
    }
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState(projectKey);
    console.info('[shared-sync]', {
      event: 'snapshot-write-attempt',
      reason: String(historyLabel || ''),
      projectKey: resolvedProjectKey || '',
      activeSharedProjectRevision,
      snapshotRevision: Math.max(0, Math.round(Number(revision ?? activeSharedProjectRevision) || 0)),
    });
    if (!resolvedProjectKey || (!force && !hasDocumentUnsavedChanges())) {
      return;
    }
    if (!force && isSharedProjectCatchingUp(resolvedProjectKey)) {
      return;
    }
    const resolvedOpType = classifySharedProjectOpType(historyLabel);
    if (
      isSharedProjectRealtimePrimaryActive(resolvedProjectKey)
      && !shouldPersistSharedProjectSnapshotForHistoryLabel(historyLabel, resolvedOpType)
    ) {
      // op history remains the source of truth
      // snapshot persistence is deferred and checkpoint-oriented
      return;
    }
    const snapshotGate = canWriteSharedProjectCanonicalSnapshot({
      reason: String(historyLabel || ''),
      snapshotRevision: Math.max(0, Math.round(Number(revision ?? activeSharedProjectRevision) || 0)),
      latestRevision: activeSharedProjectRevision,
      structureRevision: activeSharedProjectStructureRevision,
    });
    if (!snapshotGate.allowed) {
      const transientBlockReasons = new Set([
        'refresh-in-flight',
        'wake-recovery-in-progress',
        'recovery-in-progress',
        'local-in-flight-ops',
        'not-synced',
        'active-revision-not-latest',
      ]);
      if (force && transientBlockReasons.has(snapshotGate.blockReason)) {
        const retryDelayMs = getSharedProjectEffectiveSnapshotDelay(delayMs, { force });
        if (sharedProjectCaptureTimer !== null) {
          window.clearTimeout(sharedProjectCaptureTimer);
          sharedProjectCaptureTimer = null;
        }
        sharedProjectCaptureTimer = window.setTimeout(() => {
          sharedProjectCaptureTimer = null;
          queueSharedProjectCurrentSnapshotCapture({
            delayMs,
            projectKey: resolvedProjectKey,
            title,
            historyLabel,
            force,
            revision,
          });
        }, Math.max(800, retryDelayMs, 1200));
      }
      return;
    }
    if (sharedProjectCaptureTimer !== null) {
      window.clearTimeout(sharedProjectCaptureTimer);
      sharedProjectCaptureTimer = null;
    }
    const effectiveDelayMs = getSharedProjectEffectiveSnapshotDelay(delayMs, { force });
    sharedProjectCaptureTimer = window.setTimeout(() => {
      sharedProjectCaptureTimer = null;
      if (!canUseSharedProjectsBackend() || (!force && !hasDocumentUnsavedChanges())) {
        return;
      }
      if (!force && isSharedProjectCatchingUp(resolvedProjectKey)) {
        return;
      }
      if (resolvedProjectKey !== resolveSharedProjectKeyForCurrentState(resolvedProjectKey)) {
        return;
      }
      if (
        isSharedProjectRealtimePrimaryActive(resolvedProjectKey)
        && !shouldPersistSharedProjectSnapshotForHistoryLabel(historyLabel, resolvedOpType)
      ) {
        return;
      }
      const delayedGate = canWriteSharedProjectCanonicalSnapshot({
        reason: String(historyLabel || ''),
        snapshotRevision: Math.max(0, Math.round(Number(revision ?? activeSharedProjectRevision) || 0)),
        latestRevision: activeSharedProjectRevision,
        structureRevision: activeSharedProjectStructureRevision,
      });
      if (!delayedGate.allowed) {
        return;
      }
      const snapshot = makeHistorySnapshot({ clonePixelData: false });
      const session = buildAutosaveSessionPayload();
      const packaged = buildPackagedProjectPayload(snapshot, { session });
      queueSharedProjectSnapshotPersist(packaged, {
        projectKey: resolvedProjectKey,
        title: createSharedProjectSnapshotTitle(title || state.documentName || DEFAULT_DOCUMENT_NAME),
        historyLabel,
        revision,
        delayMs: force ? 0 : SHARED_PROJECT_SYNC_DELAY,
      });
    }, effectiveDelayMs);
  }

  function flushActiveSharedProjectFinalSnapshot({ historyLabel = 'sharedFinalSnapshot' } = {}) {
    const activeRevision = Math.max(0, Math.round(Number(activeSharedProjectRevision) || 0));
    const snapshotRevision = Math.max(0, Math.round(Number(activeSharedProjectSnapshotRevision) || 0));
    const snapshotBehind = activeRevision > snapshotRevision;
    if (!canUseSharedProjectsBackend() || !activeSharedProjectKey || (!hasDocumentUnsavedChanges() && !snapshotBehind)) {
      return false;
    }
    if (snapshotBehind && !activeSharedProjectSynced) {
      return false;
    }
    if (sharedProjectCaptureTimer !== null) {
      window.clearTimeout(sharedProjectCaptureTimer);
      sharedProjectCaptureTimer = null;
    }
    const snapshot = makeHistorySnapshot({ clonePixelData: false });
    const session = buildAutosaveSessionPayload();
    const packaged = buildPackagedProjectPayload(snapshot, { session });
    queueSharedProjectSnapshotPersist(packaged, {
      projectKey: activeSharedProjectKey,
      title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
      historyLabel,
    });
    return true;
  }

  async function disconnectActiveSharedProjectRealtimeChannel({ reason = 'disconnect', caller = 'unknown' } = {}) {
    const channel = activeSharedProjectChannel;
    logSharedProjectRealtimeChannelLifecycle('disconnect-channel', {
      caller,
      reason,
      extra: {
        hasChannel: Boolean(channel),
        channelTopic: channel?.topic || '',
      },
    });
    activeSharedProjectChannel = null;
    activeSharedProjectChannelKey = '';
    activeSharedProjectChannelSignature = '';
    clearSharedProjectCellPresence({ render: false });
    if (!channel) {
      return;
    }
    try {
      if (typeof channel.unsubscribe === 'function') {
        logSharedProjectRealtimeChannelLifecycle('channel-unsubscribe', {
          caller,
          reason,
          extra: {
            channelTopic: channel?.topic || '',
          },
        });
        await channel.unsubscribe();
      }
    } catch (error) {
      // Ignore unsubscribe failures.
    }
  }

  async function ensureActiveSharedProjectRealtimeChannel() {
    if (!canUseSharedProjectsBackend() || !activeSharedProjectKey) {
      console.debug('[shared-realtime] skipped subscribe: backend unavailable or no active project', {
        canUseSharedProjectsBackend: canUseSharedProjectsBackend(),
        activeSharedProjectKey: activeSharedProjectKey || '',
      });
      return null;
    }
    if (Date.now() < sharedProjectRealtimeRetryBlockedUntil) {
      console.debug('[shared-realtime] skipped subscribe: retry block active', {
        activeSharedProjectKey: activeSharedProjectKey || '',
        activeSharedProjectId: activeSharedProjectId || '',
        retryBlockedUntil: sharedProjectRealtimeRetryBlockedUntil,
      });
      return null;
    }
    const projectKey = activeSharedProjectKey;
    const recoverActiveSharedProjectId = async (targetProjectKey) => {
      const normalizedProjectKey = normalizeMultiProjectKey(targetProjectKey || '');
      if (!normalizedProjectKey) {
        return '';
      }
      let recoveredProject = null;
      try {
        recoveredProject = await fetchSharedProjectRecord(normalizedProjectKey);
      } catch (_error) {
        recoveredProject = null;
      }
      let recoveredProjectId = typeof recoveredProject?.id === 'string' ? recoveredProject.id.trim() : '';
      if (!recoveredProjectId) {
        try {
          const membershipProject = await ensureSharedProjectMembership(normalizedProjectKey, { createIfMissing: false });
          recoveredProjectId = typeof membershipProject?.id === 'string' ? membershipProject.id.trim() : '';
        } catch (_error) {
          recoveredProjectId = '';
        }
      }
      if (recoveredProjectId) {
        setActiveSharedProjectSession(
          normalizedProjectKey,
          activeSharedProjectRevision,
          activeSharedProjectStructureRevision,
          recoveredProjectId
        );
        console.debug('[shared-realtime] missing projectId recovered', {
          projectKey: normalizedProjectKey,
          projectId: recoveredProjectId,
        });
      }
      return recoveredProjectId;
    };
    let projectId = activeSharedProjectId || '';
    if (!projectId) {
      projectId = await recoverActiveSharedProjectId(projectKey);
    }
    const channelSignature = `${projectKey}::${projectId}`;
    const supabase = await ensurePixieedAccountClient();
    if (!supabase) {
      console.debug('[shared-realtime] subscribe aborted: missing authenticated supabase client', {
        accountLoggedIn: Boolean(accountState.isLoggedIn),
        accountUserId: accountState.userId || '',
        accountAnonymous: Boolean(accountState.isAnonymous),
      });
      return null;
    }
    const realtimeSocketOpen = typeof supabase.realtime?.isConnected === 'function'
      ? supabase.realtime.isConnected()
      : true;
    if (sharedProjectRealtimeConnectPromise && sharedProjectRealtimeConnectSignature === channelSignature) {
      logSharedProjectRealtimeChannelLifecycle('reuse-connect-promise', {
        caller: 'ensureActiveSharedProjectRealtimeChannel',
        reason: 'same-channel-signature',
        projectKey,
        projectId,
        channelSignature,
      });
      return await sharedProjectRealtimeConnectPromise;
    }
    if (
      activeSharedProjectChannel
      && activeSharedProjectChannelSignature === channelSignature
    ) {
      if (!projectId) {
        logSharedProjectRealtimeChannelLifecycle('stale-channel-reconnect', {
          caller: 'ensureActiveSharedProjectRealtimeChannel',
          reason: 'missing-project-id-rebind-required',
          projectKey,
          projectId,
          channelSignature,
        });
        await disconnectActiveSharedProjectRealtimeChannel({
          reason: 'missing-project-id-rebind-required',
          caller: 'ensureActiveSharedProjectRealtimeChannel',
        });
      } else {
      const channelState = typeof activeSharedProjectChannel.state === 'string' ? activeSharedProjectChannel.state : '';
      const joinState = typeof activeSharedProjectChannel.joinPush?.state === 'string' ? activeSharedProjectChannel.joinPush.state : '';
      const channelJoined = (
        channelState === 'joined'
        || channelState === 'subscribed'
        || (
          sharedProjectRealtimeStatus === 'subscribed'
          && channelState !== 'closed'
          && channelState !== 'errored'
        )
      );
      if (channelJoined && realtimeSocketOpen) {
        sharedProjectRealtimeStatus = 'subscribed';
        console.debug('[shared-realtime] reusing active channel', {
          channelSignature,
          topic: `shared-project:${projectKey}`,
          channelState,
          joinState,
          socketOpen: realtimeSocketOpen,
        });
        return activeSharedProjectChannel;
      }
      logSharedProjectRealtimeChannelLifecycle('stale-channel-reconnect', {
        caller: 'ensureActiveSharedProjectRealtimeChannel',
        reason: 'active-channel-not-healthy',
        projectKey,
        projectId,
        channelSignature,
        extra: {
          channelState,
          joinState,
          socketOpen: realtimeSocketOpen,
          realtimeStatus: sharedProjectRealtimeStatus,
        },
      });
      await disconnectActiveSharedProjectRealtimeChannel({
        reason: 'stale-channel-before-subscribe',
        caller: 'ensureActiveSharedProjectRealtimeChannel',
      });
      }
    }
    sharedProjectRealtimeStatus = 'subscribing';
    activeSharedProjectChannelSignature = channelSignature;
    sharedProjectRealtimeConnectSignature = channelSignature;
    sharedProjectRealtimeConnectPromise = (async () => {
      await disconnectActiveSharedProjectRealtimeChannel({
        reason: 'recreate-before-subscribe',
        caller: 'ensureActiveSharedProjectRealtimeChannel',
      });
      const sessionAccessToken = typeof accountState.session?.access_token === 'string'
        ? accountState.session.access_token.trim()
        : '';
      if (!sessionAccessToken) {
        throw new Error('Shared realtime auth session missing access token');
      }
      if (supabase.realtime && typeof supabase.realtime.setAuth === 'function') {
        try {
          await supabase.realtime.setAuth(sessionAccessToken);
        } catch (error) {
          console.warn('[shared-realtime] failed to push auth token into realtime client', error);
        }
      }
      const topic = `shared-project:${projectKey}`;
      const realtimeStage = getSharedProjectRealtimeDebugStage();
      const subscribeStartedAt = Date.now();
      const debugInfo = {
        clientType: getSharedProjectRealtimeClientType(supabase),
        accountLoggedIn: Boolean(accountState.isLoggedIn),
        accountUserId: accountState.userId || '',
        accountAnonymous: Boolean(accountState.isAnonymous),
        projectKey,
        projectId,
        topic,
        realtimeStage,
        realtimeStageDescription: getSharedProjectRealtimeStageDescription(realtimeStage),
        broadcastEvent: SHARED_PROJECT_BROADCAST_EVENT,
        postgresFilters: [
          shouldEnableSharedProjectRealtimeStage(realtimeStage, 'projects')
            ? `shared_projects:project_key=eq.${projectKey}`
            : '',
          shouldEnableSharedProjectRealtimeStage(realtimeStage, 'ops') && projectId
            ? `shared_project_ops:project_id=eq.${projectId}`
            : '',
          shouldEnableSharedProjectRealtimeStage(realtimeStage, 'members') && projectId
            ? `shared_project_members:project_id=eq.${projectId}`
            : '',
        ].filter(Boolean),
      };
      console.debug('[shared-realtime] subscribe start', debugInfo);
      const channel = supabase.channel(topic, {
        config: {
          broadcast: {
            ack: false,
            self: false,
          },
        },
      });
      channel.on(
      'broadcast',
      { event: SHARED_PROJECT_BROADCAST_EVENT },
      payload => {
        if (projectKey !== activeSharedProjectKey) {
          return;
        }
        const op = payload?.payload && typeof payload.payload === 'object' ? payload.payload : null;
        if (!op || op.projectKey !== projectKey) {
          console.debug('[shared-realtime] broadcast-op-ignored', {
            reason: 'invalid-payload-or-project-mismatch',
            projectKey,
            activeProjectKey: activeSharedProjectKey || '',
            eventProjectKey: op?.projectKey || '',
          });
          return;
        }
        if (isSharedProjectRemoteOpFromCurrentSession(op)) {
          console.debug('[shared-realtime] broadcast-op-ignored', {
            reason: 'same-session',
            projectKey,
            opId: getSharedProjectOpId(op),
            kind: typeof op?.kind === 'string' ? op.kind : '',
          });
          return;
        }
        console.debug('[shared-realtime] broadcast-op-received', {
          projectKey,
          opId: getSharedProjectOpId(op),
          kind: typeof op?.kind === 'string' ? op.kind : '',
          seq: getSharedProjectOpSeq(op),
          clientId: typeof op?.clientId === 'string' ? op.clientId : '',
          sessionId: typeof op?.sessionId === 'string' ? op.sessionId : '',
        });
        const drawKind = typeof op?.kind === 'string' ? op.kind : '';
        if (isSharedProjectDrawKind(drawKind) && !shouldDeferIncomingSharedProjectRemoteApply()) {
          applyOp(op, { fromRemote: true, provisional: true });
        }
        const recoveryReason = SHARED_PROJECT_REMOTE_DRAW_CONFIRMED_ONLY && isSharedProjectDrawKind(drawKind)
          ? 'broadcast-draw-gap'
          : 'broadcast-op-gap';
        // Broadcast can arrive before the sender's RPC commit is visible.
        // Coalesce a short catch-up window so fast strokes are fetched in revision batches.
        scheduleSharedProjectOpsRescueRetry(
          SHARED_PROJECT_REMOTE_DRAW_CONFIRMED_ONLY && isSharedProjectDrawKind(drawKind) ? 180 : 220,
          recoveryReason
        );
        scheduleSharedProjectBroadcastCatchupRetry({
          reason: recoveryReason,
          delays: [420, 1100, 2400, 4200],
        });
      }
    );
      channel.on(
      'broadcast',
      { event: SHARED_PROJECT_CELL_PRESENCE_EVENT },
      payload => {
        if (projectKey !== activeSharedProjectKey) {
          return;
        }
        handleSharedProjectCellPresenceBroadcast(payload);
      }
    );
      channel.on(
      'broadcast',
      { event: SHARED_PROJECT_COMMENT_EVENT },
      payload => {
        if (projectKey !== activeSharedProjectKey) {
          return;
        }
        handleSharedProjectCommentBroadcast(payload);
      }
    );
      if (shouldEnableSharedProjectRealtimeStage(realtimeStage, 'projects')) {
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'shared_projects',
            filter: `project_key=eq.${projectKey}`,
          },
          payload => {
            const nextRevision = Math.max(0, Math.round(Number(payload?.new?.latest_revision) || 0));
            const nextStructureRevision = Math.max(0, Math.round(Number(payload?.new?.latest_structure_revision) || 0));
            if (projectKey !== activeSharedProjectKey) {
              return;
            }
            if (nextRevision <= activeSharedProjectRevision) {
              return;
            }
            if (nextStructureRevision > activeSharedProjectStructureRevision) {
              scheduleSharedProjectStructureMismatchRecovery(64);
              queueSharedProjectRefresh({ immediate: false, reason: 'realtime-structure', force: true });
              return;
            }
            if (nextRevision > sharedProjectLastAppliedSeq) {
              recoverSharedProjectRealtimeGap(projectKey, {
                afterSeq: sharedProjectLastAppliedSeq,
                reason: 'project-update-canonical-fetch',
              }).then(recovered => {
                if (!recovered) {
                  scheduleSharedProjectOpsRescueRetry();
                }
              }).catch(() => {
                scheduleSharedProjectOpsRescueRetry();
              });
            }
          }
        );
      }
      if (projectId && shouldEnableSharedProjectRealtimeStage(realtimeStage, 'members')) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shared_project_members',
            filter: `project_id=eq.${projectId}`,
          },
          () => {
            syncSharedProjectMembers(projectKey, projectId).catch(() => {});
          }
        );
      }
      if (projectId && shouldEnableSharedProjectRealtimeStage(realtimeStage, 'ops')) {
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'shared_project_ops',
            filter: `project_id=eq.${projectId}`,
          },
          payload => {
            if (projectKey !== activeSharedProjectKey) {
              return;
            }
            if (isSharedProjectRemoteOpFromCurrentSession(payload?.new || null)) {
              console.debug('[shared-realtime] db-op-ignored', {
                reason: 'same-session',
                projectKey,
                revision: Math.max(0, Math.round(Number(payload?.new?.revision) || 0)),
                opType: typeof payload?.new?.op_type === 'string' ? payload.new.op_type.trim() : '',
                sessionId: typeof payload?.new?.session_id === 'string' ? payload.new.session_id : '',
              });
              return;
            }
            const nextRevision = Math.max(0, Math.round(Number(payload?.new?.revision) || 0));
            const nextStructureRevision = Math.max(0, Math.round(Number(payload?.new?.structure_revision) || 0));
            console.debug('[shared-realtime] db-op-received', {
              projectKey,
              revision: nextRevision,
              structureRevision: nextStructureRevision,
              opType: typeof payload?.new?.op_type === 'string' ? payload.new.op_type.trim() : '',
              opId: getSharedProjectOpId(payload?.new || null),
              clientId: typeof payload?.new?.client_id === 'string' ? payload.new.client_id : '',
              sessionId: typeof payload?.new?.session_id === 'string' ? payload.new.session_id : '',
              actorUserId: typeof payload?.new?.actor_user_id === 'string' ? payload.new.actor_user_id : '',
            });
            if (
                nextRevision <= activeSharedProjectRevision
              && nextStructureRevision <= activeSharedProjectStructureRevision
            ) {
              return;
            }
            const opType = typeof payload?.new?.op_type === 'string' ? payload.new.op_type.trim() : '';
            recoverSharedProjectRealtimeGap(projectKey, {
              afterSeq: sharedProjectLastAppliedSeq,
              reason: opType === 'structure' ? 'structure-op-canonical-fetch' : 'op-realtime-canonical-fetch',
            }).then(recovered => {
              if (!recovered) {
                if (opType === 'structure') {
                  queueSharedProjectRefresh({ immediate: true, reason: 'structure-op', force: true });
                } else {
                  scheduleSharedProjectOpsRescueRetry();
                }
              }
            }).catch(() => {
              if (opType === 'structure') {
                queueSharedProjectRefresh({ immediate: true, reason: 'structure-op', force: true });
              } else {
                scheduleSharedProjectOpsRescueRetry();
              }
            });
          }
        );
      }
      console.debug('[shared-realtime] subscribe stage registration complete', debugInfo);
      try {
        await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          const details = {
            elapsedMs: Date.now() - subscribeStartedAt,
            state: typeof channel.state === 'string' ? channel.state : '',
            joinState: typeof channel.joinPush?.state === 'string' ? channel.joinPush.state : '',
            socketState: typeof supabase.realtime?.isConnected === 'function'
              ? (supabase.realtime.isConnected() ? 'open' : 'not-open')
              : '',
            channels: typeof supabase.getChannels === 'function'
              ? supabase.getChannels().map(entry => entry?.topic || '').filter(Boolean)
              : [],
          };
          console.warn('[shared-realtime] subscribe timed out', {
            ...debugInfo,
            ...details,
          });
          reject(new Error('Shared project realtime subscribe timed out'));
        }, SHARED_PROJECT_REALTIME_SUBSCRIBE_TIMEOUT_MS);
        channel.subscribe(status => {
          console.debug('[shared-realtime] subscribe status', {
            ...debugInfo,
            status,
            elapsedMs: Date.now() - subscribeStartedAt,
            state: typeof channel.state === 'string' ? channel.state : '',
            joinState: typeof channel.joinPush?.state === 'string' ? channel.joinPush.state : '',
          });
          if (status === 'SUBSCRIBED' && !settled) {
            settled = true;
            window.clearTimeout(timeout);
            sharedProjectLastRealtimeActivityAt = Date.now();
            resolve();
            return;
          }
          if (status === 'CLOSED' && !settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error('Shared project realtime failed: CLOSED'));
            return;
          }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error(`Shared project realtime failed: ${status}`));
          }
        });
        });
      } catch (error) {
        sharedProjectRealtimeRetryBlockedUntil = Date.now() + 30000;
        sharedProjectRealtimeStatus = String(error?.message || '').includes('CLOSED') ? 'closed' : 'error';
        try {
          logSharedProjectRealtimeChannelLifecycle('remove-channel', {
            caller: 'ensureActiveSharedProjectRealtimeChannel',
            reason: 'subscribe-failure-cleanup',
            projectKey,
            projectId,
            channelSignature,
            extra: {
              channelTopic: channel?.topic || '',
              errorMessage: String(error?.message || error || ''),
            },
          });
          await supabase.removeChannel(channel);
        } catch (_removeError) {
          // Ignore realtime cleanup failures and rely on polling fallback.
        }
        throw error;
      }
      sharedProjectRealtimeRetryBlockedUntil = 0;
      sharedProjectRealtimeWarnedAt = 0;
      sharedProjectRealtimeStatus = 'subscribed';
      activeSharedProjectChannel = channel;
      activeSharedProjectChannelKey = projectKey;
      activeSharedProjectChannelSignature = channelSignature;
      ensureSharedProjectCellPresenceHeartbeat();
      scheduleSharedProjectCellPresenceBroadcast('subscribe');
      scheduleSharedProjectFreeTimelineCellEnsure('subscribe');
      recoverSharedProjectRealtimeGap(projectKey, {
        afterSeq: sharedProjectLastAppliedSeq,
        reason: 'post-subscribe-gap-check',
      }).then(recovered => {
        if (!recovered) {
          scheduleSharedProjectOpsRescueRetry();
        }
      }).catch(() => {
        scheduleSharedProjectOpsRescueRetry();
      });
      return channel;
    })();
    try {
      return await sharedProjectRealtimeConnectPromise;
    } finally {
      sharedProjectRealtimeConnectPromise = null;
      sharedProjectRealtimeConnectSignature = '';
      if (!activeSharedProjectChannel) {
        if (sharedProjectRealtimeStatus === 'subscribing') {
          sharedProjectRealtimeStatus = 'idle';
        }
        activeSharedProjectChannelSignature = activeSharedProjectKey
          ? `${activeSharedProjectKey}::${activeSharedProjectId || ''}`
          : '';
      }
    }
  }



  async function openSharedProjectCanonical({
    projectKey = '',
    inviteToken = '',
    requestedRole = 'guest',
    autoJoin = true,
    reason = 'open',
    hideStartup = true,
    silent = false,
    successMessage = '',
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    const normalizedInviteToken = typeof inviteToken === 'string' ? inviteToken.trim() : '';
    const normalizedRequestedRole = requestedRole === 'master' || requestedRole === 'guest' || requestedRole === 'spectator'
      ? requestedRole
      : 'guest';
    if (
      normalizedProjectKey
      && activeSharedProjectCanonicalOpenPromise
      && activeSharedProjectCanonicalOpenKey === normalizedProjectKey
    ) {
      if (!activeSharedProjectCanonicalOpenReasons.includes(reason)) {
        activeSharedProjectCanonicalOpenReasons.push(reason);
      }
      console.info('[shared-sync]', {
        event: 'shared-open-singleflight-reused',
        projectKey: normalizedProjectKey,
        reasons: activeSharedProjectCanonicalOpenReasons.slice(),
      });
      return await activeSharedProjectCanonicalOpenPromise;
    }
    activeSharedProjectCanonicalOpenKey = normalizedProjectKey;
    activeSharedProjectCanonicalOpenReasons = [reason];
    console.info('[shared-sync]', {
      event: 'shared-open-singleflight-start',
      projectKey: normalizedProjectKey,
      reasons: activeSharedProjectCanonicalOpenReasons.slice(),
    });
    activeSharedProjectCanonicalOpenPromise = (async () => {
    activeSharedProjectOpenInProgress = true;
    activeSharedProjectOpenReadOnly = true;
    activeSharedProjectSynced = false;
    console.info('[shared-sync]', {
      event: 'shared-open-readonly-start',
      reason,
      projectKey: normalizedProjectKey,
      inviteToken: normalizedInviteToken ? 'present' : '',
    });
    try {
      const sharedProject = normalizedProjectKey
        ? await loadSharedProjectSnapshotRecord(normalizedProjectKey, {
            createIfMissing: false,
            title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
          })
        : await loadSharedProjectSnapshotRecordByInvite(normalizedInviteToken, {
            createIfMissing: false,
            title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
          });
      if (!sharedProject?.project_key) {
        if (!silent) {
          setMultiStatus(localizeText('共有プロジェクトが見つかりませんでした', 'Shared project not found'), 'error');
        }
        console.info('[shared-sync]', { event: 'shared-open-failed', reason, failure: 'project-not-found' });
        return false;
      }
      console.info('[shared-sync]', {
        event: 'shared-open-project-fetched',
        reason,
        projectKey: sharedProject.project_key || '',
        latestRevision: Math.max(0, Math.round(Number(sharedProject.latest_revision) || 0)),
        latestSnapshotRevision: Math.max(0, Math.round(Number(sharedProject.latest_snapshot_revision) || 0)),
      });
      const opened = await openSharedProjectAccess({
        inviteToken: normalizedInviteToken,
        projectKey: sharedProject.project_key || normalizedProjectKey,
        requestedRole: normalizedRequestedRole,
        autoJoin,
      }, {
        hideStartup,
        silent,
        successMessage,
        prefetchedProject: sharedProject,
      });
      if (opened) {
        activeSharedProjectSynced = activeSharedProjectSyncState === 'synced';
        sharedProjectLastCanonicalLoadAt = Date.now();
        console.info('[shared-sync]', {
          event: 'shared-open-readonly-synced',
          reason,
          projectKey: activeSharedProjectKey || '',
          revision: activeSharedProjectRevision,
          snapshotRevision: activeSharedProjectSnapshotRevision,
        });
      }
      console.info('[shared-sync]', {
        event: 'shared-open-singleflight-done',
        projectKey: normalizedProjectKey,
        reasons: activeSharedProjectCanonicalOpenReasons.slice(),
        opened,
      });
      return opened;
    } catch (error) {
      console.info('[shared-sync]', {
        event: 'shared-open-readonly-failed',
        reason,
        projectKey: normalizedProjectKey,
        error: String(error?.message || error || ''),
      });
      console.info('[shared-sync]', {
        event: 'shared-open-singleflight-failed',
        projectKey: normalizedProjectKey,
        reasons: activeSharedProjectCanonicalOpenReasons.slice(),
        error: String(error?.message || error || ''),
      });
      throw error;
    } finally {
      activeSharedProjectOpenInProgress = false;
      activeSharedProjectOpenReadOnly = false;
      activeSharedProjectCanonicalOpenPromise = null;
      activeSharedProjectCanonicalOpenKey = '';
      activeSharedProjectCanonicalOpenReasons = [];
    }
    })();
    return await activeSharedProjectCanonicalOpenPromise;
  }

  async function openSharedProjectAccess(access, {
    hideStartup = true,
    silent = false,
    successMessage = '',
    prefetchedProject = null,
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(access?.projectKey || '');
    const normalizedInviteToken = typeof access?.inviteToken === 'string' ? access.inviteToken.trim() : '';
    const requestedRole = access?.requestedRole === 'master' || access?.requestedRole === 'guest' || access?.requestedRole === 'spectator'
      ? access.requestedRole
      : 'guest';
    const prefetchedProjectKey = normalizeMultiProjectKey(prefetchedProject?.project_key || '');
    const canUsePrefetchedProject = Boolean(
      prefetchedProject?.project_key
      && (
        !normalizedProjectKey
        || prefetchedProjectKey === normalizedProjectKey
      )
      && (
        normalizedProjectKey
        || !normalizedInviteToken
        || String(prefetchedProject?.invite_token || '').trim() === normalizedInviteToken
      )
    );
    const sharedProject = canUsePrefetchedProject
      ? prefetchedProject
      : (normalizedProjectKey
      ? await loadSharedProjectSnapshotRecord(normalizedProjectKey, {
          createIfMissing: false,
          title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
        })
      : await loadSharedProjectSnapshotRecordByInvite(normalizedInviteToken, {
          createIfMissing: false,
          title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
        }));
    if (!sharedProject?.project_key) {
      if (!silent) {
        setMultiStatus(
          localizeText('共有プロジェクトが見つかりませんでした', 'Shared project not found'),
          'error'
        );
      }
      return false;
    }
    if (!normalizedProjectKey && normalizedInviteToken && isBrokenSharedInviteBinding(sharedProject, {
      expectedInviteToken: normalizedInviteToken,
      expectedProjectKey: normalizedProjectKey,
    })) {
      if (!silent) {
        setMultiStatus(
          localizeText(
            '共有リンクと共有プロジェクトの結び付きが壊れています。URL を再発行してください。',
            'The invite link does not match the shared project. Please generate a new invite URL.'
          ),
          'error'
        );
      }
      return false;
    }
    const resolvedProjectKey = normalizeMultiProjectKey(sharedProject.project_key);
    if (!resolvedProjectKey) {
      if (!silent) {
        setMultiStatus(localizeText('共有プロジェクトを開けませんでした', 'Failed to open shared project'), 'error');
      }
      return false;
    }
    if (
      resolvedProjectKey === normalizeMultiProjectKey(activeSharedProjectKey || '')
      && isCurrentProjectSharedEntry()
      && activeSharedProjectDocumentLoaded
      && activeSharedProjectSyncState === 'synced'
      && !sharedProjectDeferRealtimeUntilSynced
      && startupSharedReloadProjectKey !== resolvedProjectKey
    ) {
      storeMultiProjectKey(resolvedProjectKey);
      syncMultiProjectKeyInputValues(resolvedProjectKey, { preserveFocused: false });
      setActiveSharedProjectSession(
        resolvedProjectKey,
        activeSharedProjectRevision,
        activeSharedProjectStructureRevision,
        sharedProject.id || activeSharedProjectId
      );
      await refreshActiveSharedProjectSnapshot({
        force: false,
        reason: 'open-already-active-latest',
      });
      const stabilized = await stabilizeActiveSharedProjectConnection(sharedProject, {
        reason: 'open-already-active-latest',
        announce: !silent,
      });
      if (!stabilized) {
        const openedWithFallback = markSharedProjectOpenWithReconnectFallback(resolvedProjectKey, {
          projectRecord: sharedProject,
          reason: 'open-already-active-stabilize-failed',
          announce: !silent,
        });
        if (!silent) {
          setMultiStatus(
            localizeText(
              openedWithFallback
                ? '共有リアルタイム接続が不安定です。保存済み履歴から同期を継続します。'
                : '共有プロジェクトの最新状態へ接続できませんでした。再接続を続けます。',
              openedWithFallback
                ? 'Shared realtime is unstable. Sync continues from saved history.'
                : 'Could not stabilize the shared project connection. Reconnection will continue.'
            ),
            'warn'
          );
        }
        queueSharedProjectReconnectRecovery('open-already-active-stabilize-failed', {
          immediate: false,
          blockEditing: !openedWithFallback,
        }).catch(() => {});
        if (!openedWithFallback) {
          return false;
        }
        revealActiveProjectAfterOpen({ hideStartup });
        return true;
      }
      revealActiveProjectAfterOpen({ hideStartup });
      if (!silent) {
        setMultiStatus(
          successMessage || localizeText(
            'この共有プロジェクトはすでに開いています。',
            'This shared project is already open.'
          ),
          'info'
        );
      }
      return true;
    }
    unhideSharedProjectFromRecentSync(resolvedProjectKey);
    const openingOwnedSharedProject = Boolean(
      accountState.userId
      && typeof sharedProject.owner_user_id === 'string'
      && sharedProject.owner_user_id === accountState.userId
    );
    let sharedProjectMembershipRole = openingOwnedSharedProject
      ? 'owner'
      : normalizeSharedProjectMembershipRole(sharedProject.membership_role || '');
    let sharedProjectUiRole = mapSharedProjectMembershipRoleToUiRole(
      sharedProjectMembershipRole || (openingOwnedSharedProject ? 'owner' : 'editor')
    );
    if (!(await ensureSharedProjectCapacity(resolvedProjectKey, {
      announce: !silent,
      countOwned: openingOwnedSharedProject,
    }))) {
      return false;
    }
    setStartupProgressLabel(localizeText('共有プロジェクトを読込中…', 'Loading shared project...'));
    let freshestProject = sharedProject;
    if (!freshestProject.latest_snapshot || typeof freshestProject.latest_snapshot !== 'object') {
      freshestProject = await awaitFreshSharedProjectSnapshot(sharedProject, {
        inviteToken: normalizedInviteToken,
        minRevision: 0,
        requireExactLatest: false,
        timeoutMs: 4000,
        pollIntervalMs: 180,
      }) || sharedProject;
    }
    sharedProjectMembershipRole = openingOwnedSharedProject
      ? 'owner'
      : normalizeSharedProjectMembershipRole(freshestProject.membership_role || sharedProjectMembershipRole || '');
    sharedProjectUiRole = mapSharedProjectMembershipRoleToUiRole(
      sharedProjectMembershipRole || (openingOwnedSharedProject ? 'owner' : 'editor')
    );
    if (!(await claimSharedProjectSessionLock(resolvedProjectKey, freshestProject.id || ''))) {
      return false;
    }
    let freshestSnapshotRevision = getSharedProjectSnapshotRevision(freshestProject);
    let freshestLatestRevision = getSharedProjectLatestRevision(freshestProject);
    let sharedSnapshot = freshestProject.latest_snapshot;
    const canReuseReloadBase = false;
    if (!sharedSnapshot || typeof sharedSnapshot !== 'object') {
      const canRepairEmptyOwnedProject = Boolean(
        openingOwnedSharedProject
        && freshestLatestRevision === 0
        && Math.max(0, Math.round(Number(freshestProject.latest_snapshot_revision) || 0)) === 0
      );
      if (canRepairEmptyOwnedProject) {
        const repairSnapshot = makeHistorySnapshot({ clonePixelData: true });
        const repairPackaged = buildPackagedProjectPayload(repairSnapshot);
        repairPackaged.sharedHistoryLabel = 'sharedProjectCreate';
        const repairedProject = await persistSharedProjectSnapshot(resolvedProjectKey, repairPackaged, {
          title: createSharedProjectSnapshotTitle(freshestProject.title || state.documentName || DEFAULT_DOCUMENT_NAME),
          reason: 'sharedProjectCreate',
        });
        if (repairedProject?.latest_snapshot && typeof repairedProject.latest_snapshot === 'object') {
          freshestProject = repairedProject;
          freshestSnapshotRevision = getSharedProjectSnapshotRevision(freshestProject);
          freshestLatestRevision = getSharedProjectLatestRevision(freshestProject);
          sharedSnapshot = freshestProject.latest_snapshot;
        }
      }
    }
    if (!sharedSnapshot || typeof sharedSnapshot !== 'object') {
      if (!silent) {
        setMultiStatus(
          localizeText(
            '共有プロジェクトのスナップショットを取得できないため、もう一度読み込みます。',
            'The shared project snapshot is not available yet. Retrying the load.'
          ),
          'info'
        );
      }
      return false;
    }
    let loadedSnapshot = true;
    if (!canReuseReloadBase) {
      console.info('[shared-sync]', {
        event: 'shared-open-readonly-snapshot-loaded',
        reason: 'canonical-open',
        projectKey: resolvedProjectKey,
        snapshotRevision: freshestSnapshotRevision,
      });
      loadedSnapshot = await loadDocumentFromText(JSON.stringify(sharedSnapshot), null, {
        projectId: buildSharedRecentProjectId(resolvedProjectKey),
        suppressAutosaveStatus: true,
        openedFromRecent: true,
        allowProjectMismatchLoad: true,
        preserveDotStats: true,
        preserveDocumentIds: true,
        preserveCanvasIds: true,
        preserveFrameIds: true,
        preserveLayerIds: true,
        sharedProjectKey: resolvedProjectKey,
        sharedProjectBackendId: freshestProject.id || '',
        sharedProjectRevision: freshestSnapshotRevision,
        sharedProjectStructureRevision: getSharedProjectSnapshotStructureRevision(freshestProject),
        sharedRoleHint: sharedProjectUiRole,
        sharedAutoJoin: access?.autoJoin !== false,
      });
      if (loadedSnapshot === 'deferred') {
        console.warn('[shared-sync]', {
          event: 'shared-open-deferred-aborted',
          reason: 'canonical-open',
          projectKey: resolvedProjectKey,
          snapshotRevision: freshestSnapshotRevision,
        });
        if (!silent) {
          setMultiStatus(
            localizeText(
              '共有プロジェクトの読み込み先を安全に確定できませんでした。もう一度開き直してください。',
              'Could not safely choose where to load this shared project. Please open it again.'
            ),
            'error'
          );
        }
        return false;
      }
      if (!loadedSnapshot) {
        if (!silent) {
          setMultiStatus(
            localizeText(
              '共有プロジェクトの最新スナップショットを読み込めませんでした。',
              'Failed to load the latest shared project snapshot.'
            ),
            'error'
          );
        }
        return false;
      }
      const identityCheck = compareSharedProjectSnapshotIdentity(sharedSnapshot?.document || sharedSnapshot, {
        projectKey: resolvedProjectKey,
        projectId: freshestProject.id || '',
        snapshotRevision: freshestSnapshotRevision,
        latestRevision: freshestLatestRevision,
      });
      if (identityCheck.mismatch) {
        console.warn('[shared-sync]', {
          event: 'shared-document-identity-mismatch-warning',
          projectKey: resolvedProjectKey,
          projectId: freshestProject.id || '',
          snapshotRevision: freshestSnapshotRevision,
          latestRevision: freshestLatestRevision,
          mismatchReason: identityCheck.mismatchReasons,
          fallback: 'single-canvas-adopt',
        });
      } else {
        console.info('[shared-sync]', {
          event: 'shared-open-identity-check-passed',
          projectKey: resolvedProjectKey,
          snapshotRevision: freshestSnapshotRevision,
          latestRevision: freshestLatestRevision,
        });
      }
    }
    markActiveSharedProjectDocumentLoaded(resolvedProjectKey);
    setActiveAutosaveProjectId(buildSharedRecentProjectId(resolvedProjectKey));
    try {
      window.localStorage.removeItem(getScopedStorageKey(SESSION_STORAGE_KEY));
    } catch (_error) {
      // Ignore storage errors.
    }
    try {
      window.sessionStorage.removeItem(getScopedStorageKey(RELOAD_SNAPSHOT_STORAGE_KEY));
    } catch (_error) {
      // Ignore storage errors.
    }
    try {
      window.localStorage.removeItem(getScopedStorageKey(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY));
    } catch (_error) {
      // Ignore storage errors.
    }
    storeMultiProjectKey(resolvedProjectKey);
    syncMultiProjectKeyInputValues(resolvedProjectKey, { preserveFocused: false });
    setMultiDesiredRole(sharedProjectUiRole);
    setMultiUiView(sharedProjectUiRole);
    multiEntryJoinPanelOpen = false;
    setSharedProjectDeferRealtimeUntilSynced(true);
    const baseRevision = canReuseReloadBase
      ? Math.max(0, Math.round(Number(activeSharedProjectRevision) || 0))
      : getSharedProjectSnapshotRevision(freshestProject);
    const baseStructureRevision = canReuseReloadBase
      ? Math.max(0, Math.round(Number(activeSharedProjectStructureRevision) || 0))
      : getSharedProjectSnapshotStructureRevision(freshestProject);
    setActiveSharedProjectSession(
      resolvedProjectKey,
      baseRevision,
      baseStructureRevision,
      freshestProject.id || ''
    );
    activeSharedProjectMembershipRole = sharedProjectMembershipRole || (openingOwnedSharedProject ? 'owner' : 'editor');
    ensureSharedProjectSessionHeartbeat();
    markActiveSharedProjectDocumentLoaded(resolvedProjectKey);
    const sharedSnapshotRevision = baseRevision;
    const sharedLatestRevision = freshestLatestRevision;
    activeSharedProjectRevision = sharedSnapshotRevision;
    activeSharedProjectSnapshotRevision = sharedSnapshotRevision;
    sharedProjectLastAppliedSeq = sharedSnapshotRevision;
    pruneSharedProjectConfirmedOpStateAfterRevision(sharedSnapshotRevision);
    console.info('[shared-sync]', {
      event: 'shared-open-revision-initialized',
      projectKey: resolvedProjectKey,
      snapshotRevision: sharedSnapshotRevision,
      activeSharedProjectRevision,
    });
    setActiveSharedProjectSnapshotState(sharedSnapshotRevision, {
      structureRevision: baseStructureRevision,
      synced: false,
      canonicalLoadedAt: Date.now(),
    });
    if (sharedSnapshotRevision < sharedLatestRevision) {
      console.info('[shared-sync]', {
        event: 'shared-open-ops-fetch-start',
        reason: 'canonical-open',
        projectKey: resolvedProjectKey,
        afterRevision: sharedSnapshotRevision,
        latestRevision: sharedLatestRevision,
      });
      setActiveSharedProjectSyncState('catching-up', { announce: !silent });
      console.info('[shared-sync]', {
        event: 'shared-open-ops-replay-start',
        reason: 'canonical-open',
        projectKey: resolvedProjectKey,
      });
      const replayedToLatest = await applySharedProjectOpsSinceRevision(
        freshestProject,
        sharedSnapshotRevision
      );
      console.info('[shared-sync]', {
        event: 'shared-open-ops-replay-done',
        reason: 'canonical-open',
        projectKey: resolvedProjectKey,
        replayedToLatest,
        revision: activeSharedProjectRevision,
      });
      if (!replayedToLatest) {
        if (!silent) {
          setMultiStatus(
            localizeText(
              '共有プロジェクトの最新差分を取得できなかったため開けませんでした。古い状態は表示していません。',
              'The latest shared project changes could not be loaded, so the project was not opened. No stale state was shown.'
            ),
            'error'
          );
        }
        return false;
      }
    }
    const connectionStable = await stabilizeActiveSharedProjectConnection(freshestProject, {
      reason: 'canonical-open',
      announce: !silent,
    });
    if (!connectionStable) {
      const openedWithFallback = markSharedProjectOpenWithReconnectFallback(resolvedProjectKey, {
        projectRecord: freshestProject,
        snapshotRevision: Math.max(sharedSnapshotRevision, activeSharedProjectSnapshotRevision),
        structureRevision: Math.max(baseStructureRevision, activeSharedProjectStructureRevision),
        reason: 'canonical-open-stabilize-failed',
        announce: !silent,
      });
      if (!silent) {
        setMultiStatus(
          localizeText(
            openedWithFallback
              ? '共有リアルタイム接続が不安定です。保存済み履歴から同期を継続します。'
              : '共有プロジェクトの最新状態へ接続できませんでした。古い状態では開きません。',
            openedWithFallback
              ? 'Shared realtime is unstable. Sync continues from saved history.'
              : 'Could not stabilize the shared project connection. The project will not open in a stale state.'
          ),
          openedWithFallback ? 'warn' : 'error'
        );
      }
      queueSharedProjectReconnectRecovery('canonical-open-stabilize-failed', {
        immediate: false,
        blockEditing: !openedWithFallback,
      }).catch(() => {});
      if (!openedWithFallback) {
        return false;
      }
    }
    setActiveSharedProjectSnapshotState(Math.max(sharedSnapshotRevision, activeSharedProjectSnapshotRevision), {
      structureRevision: Math.max(baseStructureRevision, activeSharedProjectStructureRevision),
      synced: true,
      canonicalLoadedAt: Date.now(),
    });
    console.info('[shared-sync]', {
      event: 'shared-open-synced',
      reason: 'canonical-open',
      projectKey: resolvedProjectKey,
      revision: activeSharedProjectRevision,
    });
    scheduleSharedProjectVerifiedSnapshotCheckpoint({
      reason: 'recovery-verified-checkpoint',
      delayMs: 1000,
      snapshotRevision: sharedSnapshotRevision,
      latestRevision: activeSharedProjectRevision,
    });
    await upsertSharedRecentProjectEntry({
      projectKey: resolvedProjectKey,
      projectId: freshestProject.id || '',
      inviteToken: freshestProject.invite_token || normalizedInviteToken || '',
      visibility: freshestProject.visibility || 'shared',
      name: createSharedProjectSnapshotTitle(freshestProject.title || state.documentName || resolvedProjectKey),
      roleHint: sharedProjectUiRole,
      membershipRole: sharedProjectMembershipRole || freshestProject.membership_role || '',
      ownerUserId: freshestProject.owner_user_id || '',
      autoJoin: access?.autoJoin !== false,
      revision: Math.max(0, Math.round(Number(freshestProject.latest_revision) || 0)),
      structureRevision: Math.max(0, Math.round(Number(freshestProject.latest_structure_revision) || 0)),
      project: sharedSnapshot && typeof sharedSnapshot === 'object' ? sharedSnapshot : null,
    });
    syncMultiControls();
    renderMultiParticipantsList();
    if (!silent) {
      setMultiStatus(
        connectionStable
          ? (successMessage || localizeText(
            '共有プロジェクトを開きました。編集内容は自動で共有されます。',
            'Opened shared project. Your edits will sync automatically.'
          ))
          : localizeText(
            '共有プロジェクトを開きました。リアルタイム接続は復旧を続けます。',
            'Opened shared project. Realtime reconnection will continue.'
          ),
        connectionStable ? 'success' : 'warn'
      );
    }
    revealActiveProjectAfterOpen({ hideStartup });
    return true;
  }

  async function openSharedRecentProject(entry, { hideStartup = true, silent = false, skipLatestRefresh = true } = {}) {
    const sessionTokenAtStart = activeSharedProjectSessionToken;
    let normalizedEntry = normalizeSharedRecentProjectEntry(entry);
    if (!normalizedEntry) {
      return false;
    }
    if (normalizedEntry.sharedProjectTransferLocked) {
      if (!silent) {
        setMultiStatus(
          localizeText(
            'この共有プロジェクトはアカウント引き継ぎ時の上限超過分のため、開けません。',
            'This shared project cannot be opened because it exceeds the shared-project limit after account transfer.'
          ),
          'warn'
        );
      }
      return false;
    }
    if (accountState.isLoggedIn && !accountState.isAnonymous) {
      try {
        if (typeof ensureSharedRecentProjectsAccountSynced === 'function') {
          await ensureSharedRecentProjectsAccountSynced({ force: true });
        }
        const syncedEntry = getSharedRecentProjectEntry(normalizedEntry.sharedProjectKey || '');
        if (syncedEntry) {
          normalizedEntry = syncedEntry;
        } else if (normalizedEntry.id) {
          await removeRecentProjectEntry(normalizedEntry.id);
          if (!silent) {
            setMultiStatus(
              localizeText(
                '共有一覧が更新され、このプロジェクトは現在アクセスできないため一覧から外しました。',
                'Shared list was refreshed and this project is currently unavailable, so it was removed from your list.'
              ),
              'warn'
            );
          }
          return false;
        }
      } catch (error) {
        console.warn('Failed to force shared recent account sync before opening', error);
      }
    }
    clearPendingSharedInvite();
    const closeBlockingLoading = beginBlockingGlobalLoading(localizeText(
      '共有プロジェクトを開いています…',
      'Opening shared project...'
    ));
    if (
      normalizeMultiProjectKey(normalizedEntry.sharedProjectKey || '') === normalizeMultiProjectKey(activeSharedProjectKey || '')
      && isCurrentProjectSharedEntry()
    ) {
      storeMultiProjectKey(normalizedEntry.sharedProjectKey || '');
      syncMultiProjectKeyInputValues(normalizedEntry.sharedProjectKey || '', { preserveFocused: false });
      try {
        const refreshedEntry = await refreshSharedRecentProjectEntryFromBackend(normalizedEntry);
        normalizedEntry = normalizeSharedRecentProjectEntry(refreshedEntry || normalizedEntry) || normalizedEntry;
      } catch (error) {
        console.warn('Failed to refresh active shared recent project entry', error);
      }
      if (normalizedEntry.sharedProjectBackendId) {
        setActiveSharedProjectSession(
          normalizedEntry.sharedProjectKey || activeSharedProjectKey,
          activeSharedProjectRevision,
          activeSharedProjectStructureRevision,
          normalizedEntry.sharedProjectBackendId
        );
      }
      await refreshActiveSharedProjectSnapshot({
        force: false,
        reason: 'recent-open-already-active-latest',
      });
      revealActiveProjectAfterOpen({ hideStartup });
      if (!silent) {
        setMultiStatus(
          localizeText(
            'この共有プロジェクトはすでに開いています。',
            'This shared project is already open.'
          ),
          'info'
        );
      }
      closeBlockingLoading();
      return true;
    }
    try {
      setStartupProgressLabel(localizeText('共有プロジェクトの接続を確認中…', 'Checking shared project connection...'));
      if (startupRestoreCancelRequested) {
        return false;
      }
      if (sessionTokenAtStart !== activeSharedProjectSessionToken) {
        console.info('[shared-sync] abort-open-shared-recent-due-to-session-change-before-open', { entry: normalizedEntry });
        return false;
      }
      const refreshedEntry = await refreshSharedRecentProjectEntryFromBackend(normalizedEntry);
      if (sessionTokenAtStart !== activeSharedProjectSessionToken) {
        console.info('[shared-sync] abort-open-shared-recent-due-to-session-change-after-refresh', { entry: normalizedEntry });
        return false;
      }
      if (startupRestoreCancelRequested) {
        return false;
      }
      normalizedEntry = normalizeSharedRecentProjectEntry(refreshedEntry || normalizedEntry) || normalizedEntry;
      if (!accountState.isLoggedIn || accountState.isAnonymous) {
        storePendingSharedInvite({
          inviteToken: normalizedEntry.sharedProjectInviteToken || '',
          projectKey: normalizedEntry.sharedProjectKey || '',
          requestedRole: normalizedEntry.sharedRoleHint || 'guest',
          autoJoin: normalizedEntry.sharedAutoJoin !== false,
          source: 'recent-open',
        });
      }
      if (!(await ensureSharedProjectAuthenticatedStart({ requireLogin: true }))) {
        return false;
      }
      if (startupRestoreCancelRequested) {
        return false;
      }
      await initPixieedAccount();
      if (startupRestoreCancelRequested) {
        return false;
      }
      await ensureNoLegacyMultiSessionForSharedProject();
      if (startupRestoreCancelRequested) {
        return false;
      }
      if (!await ensureSharedProjectBackendSession()) {
        if (!silent) {
          setMultiStatus(
            localizeText('共有プロジェクトを開けませんでした。共有セッションを初期化できません。', 'Could not initialize a shared session for this project.'),
            'warn'
          );
        }
        return false;
      }
      multiAutoResumeAttempted = true;
      clearStoredMultiResumeSession();
      let opened = false;
      let latestEntryForFallback = normalizedEntry;
      const openAttempts = skipLatestRefresh ? 5 : 6;
      for (let attempt = 0; attempt < openAttempts; attempt += 1) {
        if (startupRestoreCancelRequested) {
          return false;
        }
        if (attempt > 0) {
          setStartupProgressLabel(localizeText('共有プロジェクトの最新内容を再確認中…', 'Retrying the latest shared project state...'));
          await waitForSharedOpenRetry(220 + (attempt * 180));
          if (startupRestoreCancelRequested) {
            return false;
          }
        }
        const refreshedEntry = await refreshSharedRecentProjectEntryFromBackend(latestEntryForFallback);
        if (startupRestoreCancelRequested) {
          return false;
        }
        latestEntryForFallback = normalizeSharedRecentProjectEntry(refreshedEntry || latestEntryForFallback) || latestEntryForFallback;
        setStartupProgressLabel(localizeText('共有プロジェクトを読み込み中…', 'Loading shared project...'));
        opened = await openSharedProjectCanonical({
          inviteToken: latestEntryForFallback.sharedProjectInviteToken || '',
          projectKey: latestEntryForFallback.sharedProjectKey || '',
          requestedRole: latestEntryForFallback.sharedRoleHint || 'guest',
          autoJoin: latestEntryForFallback.sharedAutoJoin !== false,
          reason: 'recent-open',
          hideStartup,
          silent,
          successMessage: localizeText(
            '共有プロジェクトを開きました',
            'Opened shared project'
          ),
        });
        if (startupRestoreCancelRequested) {
          return false;
        }
        if (opened) {
          normalizedEntry = latestEntryForFallback;
          break;
        }
      }
      if (opened) {
        if (!skipLatestRefresh) {
          setStartupProgressLabel(localizeText('共有プロジェクトの最新内容を取得中…', 'Fetching the latest shared project state...'));
          await refreshActiveSharedProjectSnapshot({
            force: true,
            reason: 'open-shared-recent-latest',
          });
        }
        clearPendingSharedInvite();
        setActiveAutosaveProjectId(buildSharedRecentProjectId(normalizedEntry.sharedProjectKey || '') || normalizedEntry.id);
        revealActiveProjectAfterOpen({ hideStartup });
        closeBlockingLoading();
        return true;
      }
      clearPendingSharedInvite();
      if (!silent) {
        setMultiStatus(
          localizeText(
            '共有プロジェクトの最新状態をサーバーから取得できなかったため開けませんでした。古い状態は読み込まず停止しました。',
            'The latest shared project state could not be loaded from the server, so the project was not opened. No stale local state was loaded.'
          ),
          'error'
        );
      }
      closeBlockingLoading();
      return false;
    } catch (error) {
      console.warn('Failed to open shared recent project', error);
      clearPendingSharedInvite();
      if (!silent) {
        setMultiStatus(
          localizeText(
            '共有プロジェクトの最新状態をサーバーから取得できなかったため開けませんでした。古い状態は読み込まず停止しました。',
            'The latest shared project state could not be loaded from the server, so the project was not opened. No stale local state was loaded.'
          ),
          'error'
        );
      }
      closeBlockingLoading();
      return false;
    } finally {
      closeBlockingLoading();
    }
  }

  return Object.freeze({
    fetchSharedProjectRecord,
    claimSharedProjectSessionLock,
    touchSharedProjectSessionLock,
    releaseSharedProjectSessionLock,
    ensureSharedProjectSessionHeartbeat,
    fetchSharedProjectRecordByInviteToken,
    fetchSharedProjectOpsSince,
    applySharedProjectOpsSinceRevision,
    shouldTrustSharedProjectSnapshotRevision,
    readSharedProjectRevisionNumber,
    getSharedProjectLatestRevision,
    getSharedProjectLatestStructureRevision,
    getSharedProjectSnapshotRevision,
    getSharedProjectSnapshotStructureRevision,
    awaitFreshSharedProjectSnapshot,
    ensureSharedProjectMembership,
    loadSharedProjectSnapshotRecord,
    loadSharedProjectSnapshotRecordByInvite,
    fetchSharedProjectMemberProfileNicknames,
    syncSharedProjectMembers,
    retainActiveSharedProjectDocumentDuringRefresh,
    isSharedProjectAuthoritativeRefreshReason,
    refreshActiveSharedProjectSnapshot,
    persistSharedProjectSnapshot,
    markSharedProjectLocalCommitRevision,
    advanceSharedProjectAfterLocalCommit,
    commitSharedProjectOperation,
    flushSharedProjectPendingLocalOps,
    enqueueSharedProjectOperationCommit,
    appendSharedProjectOp,
    syncSharedRecentProjectsFromAccount,
    queueSharedProjectSnapshotPersist,
    queueSharedProjectRefresh,
    triggerImmediateSharedProjectRecovery,
    scheduleSharedProjectConvergenceResync,
    runSharedProjectConvergenceResync,
    queueSharedProjectCurrentSnapshotCapture,
    flushActiveSharedProjectFinalSnapshot,
    disconnectActiveSharedProjectRealtimeChannel,
    ensureActiveSharedProjectRealtimeChannel,
    openSharedProjectCanonical,
    openSharedProjectAccess,
    openSharedRecentProject,
  });
      }
    })(scope);
  }

  root.sharedProjectWorkflowUtils = Object.freeze({
    createSharedProjectWorkflowUtils,
  });
})();
