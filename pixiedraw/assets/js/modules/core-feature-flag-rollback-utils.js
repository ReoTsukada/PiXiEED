(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const FLAG_ACTIONS = Object.freeze(['read', 'write']);
  const DECISIONS = Object.freeze(['enabled', 'fallback', 'deny', 'unknown']);

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function fail(message, code, field = null) {
    throw Object.assign(new Error(message), { code, field });
  }

  function requireText(value, field, maxLength = 256) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) fail(`${field} must be a non-empty stable string.`, 'FEATURE_FLAG_VALUE_INVALID', field);
    return value.trim();
  }

  function requireAction(action) {
    if (!FLAG_ACTIONS.includes(action)) fail(`Unsupported feature flag action: ${String(action)}`, 'FEATURE_FLAG_ACTION_INVALID', 'action');
    return action;
  }

  function requirePercent(value, field = 'percent') {
    if (!Number.isInteger(value) || value < 0 || value > 100) fail(`${field} must be an integer between 0 and 100.`, 'FEATURE_FLAG_PERCENT_INVALID', field);
    return value;
  }

  function requireActor(actor) {
    if (!actor || typeof actor !== 'object') fail('A trusted server actor is required.', 'FEATURE_FLAG_ACTOR_INVALID', 'actor');
    const actorId = requireText(actor.id, 'actor.id');
    if (actor.source !== 'server') fail('Client actors cannot configure flags, overrides, kill switches, or rollback.', 'FEATURE_FLAG_ACTOR_UNTRUSTED', 'actor.source');
    return { id: actorId, source: 'server' };
  }

  function requireAuditEvent(event = {}) {
    return {
      eventId: requireText(event.eventId, 'eventId'),
      correlationId: requireText(event.correlationId, 'correlationId'),
      at: requireText(event.at, 'at', 128),
      reason: requireText(event.reason, 'reason', 512),
    };
  }

  function stableBucket(flagId, principalId, salt) {
    const input = `${salt}:${flagId}:${principalId}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 100;
  }

  function diagnostic(code, severity, message, metadata = {}) {
    return { code, severity, message, metadata: clone(metadata) };
  }

  function createCoreFeatureFlagRollback({ flags = [] } = {}) {
    const state = {
      flags: Object.create(null),
      overrides: Object.create(null),
      killSwitches: Object.create(null),
      rollbacks: Object.create(null),
      audit: [],
      mismatches: [],
    };

    function getFlag(flagId) {
      return state.flags[flagId] || null;
    }

    function registerFlag({ flagId, domain, currentPath, actions = ['read', 'write'], rolloutPercent = {}, cohortSalt = 'v1' } = {}) {
      flagId = requireText(flagId, 'flagId');
      domain = requireText(domain, 'domain', 64);
      currentPath = requireText(currentPath, 'currentPath', 512);
      if (!Array.isArray(actions) || !actions.length || actions.some((action) => !FLAG_ACTIONS.includes(action))) fail('actions must contain only read/write.', 'FEATURE_FLAG_ACTIONS_INVALID', 'actions');
      if (getFlag(flagId)) fail(`Feature flag already exists: ${flagId}`, 'FEATURE_FLAG_DUPLICATE', 'flagId');
      const flag = {
        flagId,
        domain,
        currentPath,
        actions: [...new Set(actions)],
        rolloutPercent: {
          read: requirePercent(rolloutPercent.read ?? 0, 'rolloutPercent.read'),
          write: requirePercent(rolloutPercent.write ?? 0, 'rolloutPercent.write'),
        },
        cohortSalt: requireText(cohortSalt, 'cohortSalt', 128),
        defaultEnabled: false,
      };
      state.flags[flagId] = flag;
      return clone(flag);
    }

    function appendAudit({ event, actor, flagId = null, scope = null, action = null, details = {} } = {}) {
      const auditEvent = requireAuditEvent(event);
      const audit = {
        ...auditEvent,
        actorId: actor.id,
        event: requireText(event.kind, 'event.kind', 96),
        flagId,
        scope,
        action,
        details: clone(details),
      };
      state.audit.push(audit);
      return clone(audit);
    }

    function configureRollout({ flagId, action, percent, actor, event } = {}) {
      const flag = getFlag(flagId);
      if (!flag) fail(`Feature flag not found: ${flagId}`, 'FEATURE_FLAG_UNKNOWN', 'flagId');
      requireAction(action);
      if (!flag.actions.includes(action)) fail(`Feature flag does not support ${action}: ${flagId}`, 'FEATURE_FLAG_ACTION_UNSUPPORTED', 'action');
      percent = requirePercent(percent);
      actor = requireActor(actor);
      const auditEvent = requireAuditEvent(event);
      flag.rolloutPercent[action] = percent;
      appendAudit({ event: { ...auditEvent, kind: 'flag_rollout_configured' }, actor, flagId, action, details: { percent } });
      return clone(flag);
    }

    function setOverride({ flagId, action, scope = 'global', enabled, actor, event } = {}) {
      const flag = getFlag(flagId);
      if (!flag) fail(`Feature flag not found: ${flagId}`, 'FEATURE_FLAG_UNKNOWN', 'flagId');
      requireAction(action);
      if (!flag.actions.includes(action)) fail(`Feature flag does not support ${action}: ${flagId}`, 'FEATURE_FLAG_ACTION_UNSUPPORTED', 'action');
      if (typeof enabled !== 'boolean') fail('enabled must be boolean.', 'FEATURE_FLAG_VALUE_INVALID', 'enabled');
      actor = requireActor(actor);
      const auditEvent = requireAuditEvent(event);
      scope = requireText(scope, 'scope', 256);
      if (scope !== 'global' && !/^(principal|cohort):[^:]+$/.test(scope)) fail('Override scope must be global, principal:<id>, or cohort:<bucket>.', 'FEATURE_FLAG_SCOPE_INVALID', 'scope');
      const key = `${flagId}:${action}:${scope}`;
      state.overrides[key] = { flagId, action, scope, enabled, actorId: actor.id, eventId: auditEvent.eventId };
      appendAudit({ event: { ...auditEvent, kind: 'flag_override_changed' }, actor, flagId, scope, action, details: { enabled } });
      return clone(state.overrides[key]);
    }

    function setKillSwitch({ flagId, enabled, actor, event } = {}) {
      if (!getFlag(flagId)) fail(`Feature flag not found: ${flagId}`, 'FEATURE_FLAG_UNKNOWN', 'flagId');
      if (typeof enabled !== 'boolean') fail('enabled must be boolean.', 'FEATURE_FLAG_VALUE_INVALID', 'enabled');
      actor = requireActor(actor);
      const auditEvent = requireAuditEvent(event);
      state.killSwitches[flagId] = { flagId, enabled, actorId: actor.id, eventId: auditEvent.eventId };
      appendAudit({ event: { ...auditEvent, kind: enabled ? 'kill_switch_activated' : 'kill_switch_cleared' }, actor, flagId, details: { enabled } });
      return clone(state.killSwitches[flagId]);
    }

    function setRollback({ scope = 'global', enabled, actor, event } = {}) {
      if (typeof enabled !== 'boolean') fail('enabled must be boolean.', 'FEATURE_FLAG_VALUE_INVALID', 'enabled');
      actor = requireActor(actor);
      const auditEvent = requireAuditEvent(event);
      scope = requireText(scope, 'scope', 256);
      if (scope !== 'global' && !/^(domain|flag):[^:]+$/.test(scope)) fail('Rollback scope must be global, domain:<name>, or flag:<id>.', 'FEATURE_FLAG_SCOPE_INVALID', 'scope');
      state.rollbacks[scope] = { scope, enabled, actorId: actor.id, eventId: auditEvent.eventId };
      appendAudit({ event: { ...auditEvent, kind: enabled ? 'rollback_activated' : 'rollback_cleared' }, actor, scope, details: { enabled } });
      return clone(state.rollbacks[scope]);
    }

    function activateRollback(options = {}) {
      return setRollback({ ...options, enabled: true });
    }

    function clearRollback(options = {}) {
      return setRollback({ ...options, enabled: false });
    }

    function captureMismatch({ flagId, action, expected, actual, resource = null, actor, event } = {}) {
      const flag = getFlag(flagId);
      if (!flag) fail(`Feature flag not found: ${flagId}`, 'FEATURE_FLAG_UNKNOWN', 'flagId');
      requireAction(action);
      actor = requireActor(actor);
      const auditEvent = requireAuditEvent(event);
      const mismatch = {
        flagId,
        action,
        expected: clone(expected),
        actual: clone(actual),
        resource: resource ? clone(resource) : null,
        correlationId: auditEvent.correlationId,
        eventId: auditEvent.eventId,
      };
      state.mismatches.push(mismatch);
      appendAudit({ event: { ...auditEvent, kind: 'shadow_mismatch_captured' }, actor, flagId, action, details: mismatch });
      return clone(mismatch);
    }

    function rollbackActive(flag) {
      return Boolean(
        state.rollbacks.global?.enabled
        || state.rollbacks[`domain:${flag.domain}`]?.enabled
        || state.rollbacks[`flag:${flag.flagId}`]?.enabled
      );
    }

    function result({ decision, enabled, useCurrentPath, flagId, action, code, message, metadata = {}, phase = null, clientOverrideIgnored = false }) {
      if (!DECISIONS.includes(decision)) fail(`Unsupported decision: ${decision}`, 'FEATURE_FLAG_DECISION_INVALID');
      return {
        ok: decision !== 'deny' && decision !== 'unknown',
        decision,
        enabled,
        useCurrentPath,
        flagId,
        action,
        phase,
        clientOverrideIgnored,
        diagnostics: [diagnostic(code, decision === 'enabled' ? 'info' : 'warning', message, metadata)],
      };
    }

    function evaluate({ flagId, action, principalId = null, principalSource = 'server', identity, serverAuthorization, resourcePermission, clientRequested = false } = {}) {
      let flag;
      try {
        flag = getFlag(flagId);
        requireText(flagId, 'flagId');
        requireAction(action);
      } catch (error) {
        return result({ decision: 'deny', enabled: false, useCurrentPath: false, flagId: flagId || null, action: action || null, code: error.code || 'FEATURE_FLAG_INPUT_INVALID', message: error.message, phase: 'input' });
      }
      if (!flag) return result({ decision: 'unknown', enabled: false, useCurrentPath: true, flagId, action, code: 'FEATURE_FLAG_UNKNOWN_FALLBACK', message: 'Unknown feature flags cannot enable a new path; use the current path.', phase: 'flag' });
      if (!flag.actions.includes(action)) return result({ decision: 'deny', enabled: false, useCurrentPath: false, flagId, action, code: 'FEATURE_FLAG_ACTION_UNSUPPORTED', message: 'The flag does not control this action.', phase: 'flag' });
      if (!identity || identity.ok !== true) return result({ decision: 'deny', enabled: false, useCurrentPath: false, flagId, action, code: 'FEATURE_FLAG_IDENTITY_REQUIRED', message: 'Identity must be verified before feature evaluation.', phase: 'identity' });
      if (identity.accountStatus !== 'active') return result({ decision: 'deny', enabled: false, useCurrentPath: false, flagId, action, code: 'FEATURE_FLAG_ACCOUNT_INACTIVE', message: 'Inactive accounts cannot use the new path.', phase: 'account' });
      if (!serverAuthorization || serverAuthorization.ok !== true) return result({ decision: 'deny', enabled: false, useCurrentPath: false, flagId, action, code: 'FEATURE_FLAG_SERVER_AUTHORIZATION_REQUIRED', message: 'Current server/RLS authorization is required before the flag.', phase: 'server-authorization' });
      if (!resourcePermission || resourcePermission.ok !== true) return result({ decision: 'deny', enabled: false, useCurrentPath: false, flagId, action, code: 'FEATURE_FLAG_RESOURCE_PERMISSION_REQUIRED', message: 'Resource permission is required after server authorization.', phase: 'resource-permission' });
      if (state.killSwitches[flagId]?.enabled) return result({ decision: 'fallback', enabled: false, useCurrentPath: true, flagId, action, code: 'FEATURE_FLAG_KILL_SWITCH', message: 'Kill switch is active; new processing is stopped and the current path is selected.', phase: 'rollback' });
      if (rollbackActive(flag)) return result({ decision: 'fallback', enabled: false, useCurrentPath: true, flagId, action, code: 'FEATURE_FLAG_ROLLBACK_ACTIVE', message: 'Rollback is active; the current path is selected without deleting data.', phase: 'rollback' });
      const clientOverrideIgnored = clientRequested === true && principalSource !== 'server';
      const scopes = [];
      if (principalSource === 'server' && principalId) scopes.push(`principal:${principalId}`);
      scopes.push('global');
      let enabled = null;
      for (const scope of scopes) {
        const override = state.overrides[`${flagId}:${action}:${scope}`];
        if (override) {
          enabled = override.enabled;
          break;
        }
      }
      if (enabled === null && principalSource === 'server' && principalId && flag.rolloutPercent[action] > 0) {
        enabled = stableBucket(flagId, principalId, flag.cohortSalt) < flag.rolloutPercent[action];
      }
      if (enabled === true) return result({ decision: 'enabled', enabled: true, useCurrentPath: false, flagId, action, code: 'FEATURE_FLAG_ENABLED', message: 'Server-authorized request is enabled for the new path.', phase: 'flag', clientOverrideIgnored });
      return result({ decision: 'fallback', enabled: false, useCurrentPath: true, flagId, action, code: 'FEATURE_FLAG_OFF_FALLBACK', message: 'The flag is off for this request; the current path remains available.', phase: 'flag', clientOverrideIgnored });
    }

    function snapshot() {
      return clone({ flags: state.flags, overrides: state.overrides, killSwitches: state.killSwitches, rollbacks: state.rollbacks, audit: state.audit, mismatches: state.mismatches });
    }

    function inspect() {
      return {
        flagCount: Object.keys(state.flags).length,
        overrideCount: Object.keys(state.overrides).length,
        activeKillSwitchCount: Object.values(state.killSwitches).filter((entry) => entry.enabled).length,
        activeRollbackCount: Object.values(state.rollbacks).filter((entry) => entry.enabled).length,
        auditCount: state.audit.length,
        mismatchCount: state.mismatches.length,
      };
    }

    for (const flag of flags) registerFlag(flag);

    return Object.freeze({
      registerFlag,
      configureRollout,
      setOverride,
      setKillSwitch,
      setRollback,
      activateRollback,
      clearRollback,
      captureMismatch,
      evaluate,
      snapshot,
      inspect,
    });
  }

  root.coreFeatureFlagRollbackUtils = Object.freeze({ FLAG_ACTIONS, DECISIONS, createCoreFeatureFlagRollback });
})();
