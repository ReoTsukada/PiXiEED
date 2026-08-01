(() => {
  'use strict';

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const INVITE_QUERY_KEY = 'pixisync_invite';
  const INVITE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

  function parseInviteToken(value, { locationHref = window.location?.href || '' } = {}) {
    const raw = String(value || '').trim();
    if (INVITE_TOKEN_PATTERN.test(raw)) return raw.toLowerCase();
    const compactCode = raw.replace(/[\s-]/g, '').toLowerCase();
    if (INVITE_TOKEN_PATTERN.test(compactCode)) return compactCode;
    try {
      const url = new URL(raw, locationHref || 'https://pixieed.jp/pixiedraw/');
      let token = url.searchParams.get(INVITE_QUERY_KEY) || '';
      if (!token && url.hash.startsWith('#')) {
        token = new URLSearchParams(url.hash.slice(1)).get(INVITE_QUERY_KEY) || '';
      }
      token = token.trim().toLowerCase();
      return INVITE_TOKEN_PATTERN.test(token) ? token : '';
    } catch (_error) {
      return '';
    }
  }

  function createJoinFailure(reason, error = null, details = {}) {
    return Object.freeze({
      ok: false,
      reason,
      error: error instanceof Error ? error : null,
      ...details,
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
      if (created?.ok !== true || !workingProjectId || workingProjectId === previousProjectId) {
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
    runSafeProjectJoin,
  });
})();
