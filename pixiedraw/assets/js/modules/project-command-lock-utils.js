(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectCommandLockManager({
    now = () => Date.now(),
    staleThresholdMs = 120000,
    onDiagnostic = null,
  } = {}) {
    const state = {
      locked: false,
      token: null,
      owner: null,
      command: null,
      acquiredAt: 0,
    };

    function inspect() {
      const lockAgeMs = state.locked ? Math.max(0, now() - state.acquiredAt) : 0;
      return Object.freeze({
        locked: state.locked,
        owner: state.owner,
        command: state.command,
        acquiredAt: state.acquiredAt,
        lockAgeMs,
        tokenPresent: Boolean(state.token),
      });
    }

    function report(phase, details = {}) {
      const payload = { phase, ...inspect(), ...details };
      if (typeof onDiagnostic === 'function') {
        onDiagnostic(payload);
      }
      return payload;
    }

    function acquire({ owner = '', command = '' } = {}) {
      const normalizedOwner = String(owner || '').trim();
      const normalizedCommand = String(command || '').trim();
      if (!normalizedOwner || !normalizedCommand) {
        return Object.freeze({ ok: false, code: 'ERR_PROJECT_COMMAND_STATE_INVALID', ...inspect() });
      }
      if (state.locked) {
        return Object.freeze({
          ok: false,
          code: 'ERR_PROJECT_COMMAND_LOCKED',
          activeOwner: state.owner,
          activeCommand: state.command,
          lockAgeMs: inspect().lockAgeMs,
        });
      }
      const token = Object.freeze({ owner: normalizedOwner, sequence: Symbol(normalizedCommand) });
      state.locked = true;
      state.token = token;
      state.owner = normalizedOwner;
      state.command = normalizedCommand;
      state.acquiredAt = now();
      report('command-lock-acquired');
      return Object.freeze({ ok: true, token, owner: normalizedOwner, command: normalizedCommand, acquiredAt: state.acquiredAt });
    }

    function release({ token = null, owner = '' } = {}) {
      if (!state.locked || !state.token) {
        return Object.freeze({ ok: false, code: 'ERR_PROJECT_COMMAND_STATE_INVALID', ...inspect() });
      }
      if (token !== state.token) {
        report('command-lock-release-rejected', { code: 'ERR_PROJECT_COMMAND_RELEASE_TOKEN_MISMATCH' });
        return Object.freeze({ ok: false, code: 'ERR_PROJECT_COMMAND_RELEASE_TOKEN_MISMATCH', ...inspect() });
      }
      if (String(owner || '') !== state.owner) {
        report('command-lock-release-rejected', { code: 'ERR_PROJECT_COMMAND_RELEASE_OWNER_MISMATCH' });
        return Object.freeze({ ok: false, code: 'ERR_PROJECT_COMMAND_RELEASE_OWNER_MISMATCH', ...inspect() });
      }
      const released = inspect();
      state.locked = false;
      state.token = null;
      state.owner = null;
      state.command = null;
      state.acquiredAt = 0;
      report('command-lock-released', { releasedOwner: released.owner, releasedCommand: released.command });
      return Object.freeze({ ok: true, releasedOwner: released.owner, releasedCommand: released.command });
    }

    function isHeldBy({ token = null, owner = '' } = {}) {
      return state.locked && token === state.token && String(owner || '') === state.owner;
    }

    function detectStale() {
      const status = inspect();
      if (!status.locked || status.lockAgeMs <= staleThresholdMs) {
        return Object.freeze({ stale: false, ...status });
      }
      report('command-lock-stale-detected', { code: 'ERR_PROJECT_COMMAND_STALE' });
      return Object.freeze({ stale: true, code: 'ERR_PROJECT_COMMAND_STALE', ...status });
    }

    return Object.freeze({ acquire, release, inspect, isHeldBy, detectStale });
  }

  root.projectCommandLockUtils = Object.freeze({ createProjectCommandLockManager });
})();
