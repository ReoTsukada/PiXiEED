import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../core-shell/assets/core-feature-flag-rollback-utils.js', import.meta.url));
const source = await readFile(modulePath, 'utf8');
const appWindow = {};
const load = new Function('window', `${source}\nreturn window.PiXiEEDrawModules.coreFeatureFlagRollbackUtils;`);
const api = load(appWindow);
const flags = api.createCoreFeatureFlagRollback({
  flags: [
    { flagId: 'draw2-path', domain: 'pxd', currentPath: '/pixiedraw/', actions: ['read', 'write'] },
    { flagId: 'market-path', domain: 'market', currentPath: '/market/', actions: ['read', 'write'] },
    { flagId: 'pixisync-path', domain: 'pixisync', currentPath: 'current-pixisync', actions: ['read', 'write'] },
    { flagId: 'commission-path', domain: 'commission', currentPath: 'current-commission', actions: ['read', 'write'] },
    { flagId: 'subscription-path', domain: 'subscription', currentPath: 'current-subscription', actions: ['read'] },
  ],
});

const actor = { id: 'operator-1', source: 'server' };
const event = (eventId, kind = 'test') => ({ eventId, correlationId: `corr-${eventId}`, at: '2026-08-07T00:00:00Z', reason: kind, kind });
const context = {
  identity: { ok: true, accountStatus: 'active' },
  serverAuthorization: { ok: true, source: 'database-rpc' },
  resourcePermission: { ok: true, source: 'core-permission' },
};
const evaluate = (flagId, action, extra = {}) => flags.evaluate({ flagId, action, principalId: 'user-1', principalSource: 'server', ...context, ...extra });

let result = evaluate('draw2-path', 'read');
assert.equal(result.decision, 'fallback');
assert.equal(result.useCurrentPath, true);
assert.equal(result.enabled, false);
assert.equal(result.ok, true);
assert.equal(evaluate('draw2-path', 'write').decision, 'fallback', 'read rollout must not enable write');

flags.configureRollout({ flagId: 'draw2-path', action: 'read', percent: 100, actor, event: event('rollout-1', 'rollout') });
result = evaluate('draw2-path', 'read');
assert.equal(result.decision, 'enabled');
assert.equal(result.enabled, true);
assert.equal(result.useCurrentPath, false);
assert.equal(evaluate('draw2-path', 'read').decision, 'enabled', 'cohort assignment must be deterministic');
const clientAttempt = evaluate('draw2-path', 'read', { principalSource: 'client', clientRequested: true });
assert.equal(clientAttempt.decision, 'fallback');
assert.equal(clientAttempt.clientOverrideIgnored, true);

flags.setOverride({ flagId: 'market-path', action: 'read', scope: 'global', enabled: true, actor, event: event('override-1', 'override') });
assert.equal(evaluate('market-path', 'read').decision, 'enabled');
assert.throws(() => flags.setOverride({ flagId: 'market-path', action: 'write', enabled: true, actor: { id: 'browser', source: 'client' }, event: event('override-client', 'override') }), /Client actors/);

assert.equal(evaluate('draw2-path', 'read', { serverAuthorization: { ok: false } }).decision, 'deny');
assert.equal(evaluate('draw2-path', 'read', { resourcePermission: { ok: false } }).decision, 'deny');
assert.equal(evaluate('draw2-path', 'read', { identity: { ok: false, accountStatus: 'active' } }).decision, 'deny');
assert.equal(evaluate('draw2-path', 'read', { identity: { ok: true, accountStatus: 'suspended' } }).decision, 'deny');
assert.equal(evaluate('missing-path', 'read').decision, 'unknown');

flags.setKillSwitch({ flagId: 'draw2-path', enabled: true, actor, event: event('kill-1', 'kill') });
result = evaluate('draw2-path', 'read');
assert.equal(result.decision, 'fallback');
assert.equal(result.diagnostics[0].code, 'FEATURE_FLAG_KILL_SWITCH');
flags.setKillSwitch({ flagId: 'draw2-path', enabled: false, actor, event: event('kill-2', 'kill-clear') });
assert.equal(evaluate('draw2-path', 'read').decision, 'enabled');

flags.activateRollback({ scope: 'domain:pxd', actor, event: event('rollback-1', 'rollback') });
result = evaluate('draw2-path', 'read');
assert.equal(result.decision, 'fallback');
assert.equal(result.diagnostics[0].code, 'FEATURE_FLAG_ROLLBACK_ACTIVE');
assert.equal(evaluate('market-path', 'read').decision, 'enabled', 'domain rollback must not disable another domain');
flags.clearRollback({ scope: 'domain:pxd', actor, event: event('rollback-2', 'rollback-clear') });
assert.equal(evaluate('draw2-path', 'read').decision, 'enabled');

flags.captureMismatch({ flagId: 'draw2-path', action: 'read', expected: { decision: 'enabled' }, actual: { decision: 'fallback' }, resource: { type: 'project', id: 'project-1' }, actor, event: event('mismatch-1', 'shadow') });
const snapshot = flags.snapshot();
assert.equal(snapshot.flags['draw2-path'].defaultEnabled, false);
assert.equal(snapshot.mismatches.length, 1);
assert.ok(snapshot.audit.some((entry) => entry.event === 'flag_override_changed'));
assert.ok(snapshot.audit.some((entry) => entry.event === 'kill_switch_activated'));
assert.ok(snapshot.audit.some((entry) => entry.event === 'rollback_activated'));
assert.ok(snapshot.audit.some((entry) => entry.event === 'shadow_mismatch_captured'));
assert.equal(flags.inspect().activeKillSwitchCount, 0);
assert.equal(flags.inspect().activeRollbackCount, 0);
assert.equal(flags.inspect().mismatchCount, 1);
assert.doesNotMatch(source, /\b(indexedDB|fetch|XMLHttpRequest|Date|Math\.random|crypto\.randomUUID)\b/i, 'Feature flag adapter must remain storage/network/time/random independent');
console.log('WP-070 Core Feature Flag/Rollback tests passed: default-off fallback, auth ordering, read/write separation, deterministic cohort, client override rejection, kill switch, scoped rollback, mismatch capture, audit, and domain isolation');
