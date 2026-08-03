(() => {
  'use strict';

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const INVITE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

  function parseInviteToken(value) {
    const raw = String(value || '').trim();
    if (INVITE_TOKEN_PATTERN.test(raw)) return raw.toLowerCase();
    const compactCode = raw.replace(/[\s-]/g, '').toLowerCase();
    if (INVITE_TOKEN_PATTERN.test(compactCode)) return compactCode;
    return '';
  }

  function createJoinFailure(reason, error = null, details = {}) {
    return Object.freeze({
      ok: false,
      reason,
      error: error instanceof Error ? error : null,
      ...details,
    });
  }

  function inspectRuntimeProject(runtime = null) {
    let snapshot = null;
    try {
      snapshot = runtime?.snapshot?.() || null;
    } catch (_error) {
      snapshot = null;
    }
    return Object.freeze({
      enabled: snapshot?.enabled !== false,
      projectKey: String(snapshot?.session?.projectKey || '').trim(),
      roomId: String(snapshot?.roomId || snapshot?.session?.roomId || '').trim().toLowerCase(),
      role: String(snapshot?.role || snapshot?.session?.role || ''),
      phase: String(snapshot?.session?.phase || ''),
    });
  }

  function runtimeMatchesProjectBinding(runtime, projectKey, binding = null) {
    if (!runtime || !binding || typeof binding !== 'object') return false;
    const targetProjectKey = String(projectKey || '').trim();
    const targetRoomId = String(binding.roomId || '').trim().toLowerCase();
    const targetRole = binding.role === 'owner'
      ? 'owner'
      : (binding.role === 'participant' ? 'participant' : '');
    if (!targetProjectKey || !targetRoomId) return false;
    const current = inspectRuntimeProject(runtime);
    return current.enabled
      && ['creating', 'joining', 'syncing', 'active', 'reconnecting'].includes(current.phase)
      && current.projectKey === targetProjectKey
      && current.roomId === targetRoomId
      && (!targetRole || current.role === targetRole);
  }

  async function prepareProjectRuntimeSwitch({
    targetProjectKey = '',
    targetBinding = null,
    preserveMatchingRuntime = false,
    runtime = null,
    disposeRuntime = async target => target?.dispose?.(),
    clearRuntimeBridge = () => {},
  } = {}) {
    const normalizedTarget = String(targetProjectKey || '').trim();
    const current = inspectRuntimeProject(runtime);
    if (!runtime) {
      return Object.freeze({ disposed: false, kept: false, current, targetProjectKey: normalizedTarget });
    }
    if (preserveMatchingRuntime === true
      && runtimeMatchesProjectBinding(runtime, normalizedTarget, targetBinding)) {
      return Object.freeze({ disposed: false, kept: true, current, targetProjectKey: normalizedTarget });
    }
    let disposeError = null;
    // Stop document-operation routing immediately, before waiting for the
    // transport and editing lease to finish shutting down.
    try { clearRuntimeBridge(); } catch (_error) {}
    try {
      await disposeRuntime(runtime);
    } catch (error) {
      disposeError = error instanceof Error ? error : new Error(String(error || 'runtime-dispose-failed'));
    } finally {
      try { clearRuntimeBridge(); } catch (_error) {}
    }
    return Object.freeze({
      disposed: true,
      kept: false,
      current,
      targetProjectKey: normalizedTarget,
      disposeError,
    });
  }

  async function runSafeProjectJoin({
    inviteValue = '',
    locationHref = window.location?.href || '',
    ensureAuthenticated = async () => true,
    captureCurrentProject = async () => null,
    disconnectCurrentRuntime = async () => {},
    createSharedWorkingProject = async () => ({ ok: false, projectId: '' }),
    initializeRuntime = async () => null,
    disposeRuntime = async runtime => runtime?.dispose?.(),
    removeProject = async () => false,
    restoreProject = async () => false,
  } = {}) {
    const inviteToken = parseInviteToken(inviteValue, { locationHref });
    if (!inviteToken) return createJoinFailure('invalid-invite-code');

    const authenticated = await ensureAuthenticated();
    if (authenticated !== true) return createJoinFailure('authentication-required');

    const previousProject = await captureCurrentProject();
    const previousProjectId = String(previousProject?.id || '');
    let workingProjectId = '';
    let runtime = null;
    let stage = 'disconnect-runtime';
    try {
      await disconnectCurrentRuntime();
      stage = 'create-working-project';
      const created = await createSharedWorkingProject(previousProject);
      workingProjectId = String(created?.projectId || '');
      if (
        created?.ok !== true
        || !workingProjectId
        || (workingProjectId === previousProjectId && created?.reuseExisting !== true)
      ) {
        throw new Error('PiXiSYNC project switch: shared-working-project-unavailable');
      }

      stage = 'initialize-runtime';
      runtime = await initializeRuntime();
      if (!runtime || typeof runtime.join !== 'function') {
        throw new Error('PiXiSYNC project switch: runtime-unavailable');
      }

      stage = 'join-room';
      const roomId = String(await runtime.join(inviteToken) || '');
      if (!roomId) throw new Error('PiXiSYNC project switch: room-unavailable');
      return Object.freeze({
        ok: true,
        roomId,
        inviteToken,
        previousProjectId,
        projectId: workingProjectId,
        runtime,
      });
    } catch (error) {
      try { await disposeRuntime(runtime); } catch (_disposeError) {}
      let removedWorkingProject = false;
      if (workingProjectId && workingProjectId !== previousProjectId) {
        try { removedWorkingProject = await removeProject(workingProjectId) === true; } catch (_removeError) {}
      }
      let restoredPreviousProject = false;
      if (previousProjectId) {
        try { restoredPreviousProject = await restoreProject(previousProject) === true; } catch (_restoreError) {}
      }
      return createJoinFailure(
        typeof error?.reason === 'string' && error.reason
          ? error.reason
          : stage === 'create-working-project'
            ? 'local-project-save-failed'
            : 'join-failed',
        error,
        {
          stage,
          previousProjectId,
          workingProjectId,
          removedWorkingProject,
          restoredPreviousProject,
        }
      );
    }
  }

  root.pixisyncProjectSwitchUtils = Object.freeze({
    parseInviteToken,
    inspectRuntimeProject,
    runtimeMatchesProjectBinding,
    prepareProjectRuntimeSwitch,
    runSafeProjectJoin,
  });
})();
