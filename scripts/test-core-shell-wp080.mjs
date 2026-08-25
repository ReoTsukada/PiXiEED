import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const [html, css, shell, contracts, serverRouteContract, flagSource, draw2Route] = await Promise.all([
  read('core-shell/index.html'),
  read('core-shell/assets/core-shell.css'),
  read('core-shell/assets/core-shell.js'),
  read('core-shell/assets/core-shell-contracts.js'),
  read('core-shell/assets/core-shell-server-route-contract.js'),
  read('pixiedraw/assets/js/modules/core-feature-flag-rollback-utils.js'),
  read('core-shell/assets/routes/draw2-route.js'),
]);

assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
assert.match(html, /assets\/core-shell\.css/);
assert.match(html, /assets\/core-shell\.js/);
assert.doesNotMatch(html, /<a\b[^>]+href=["'](?:\.\.\/)?(?:pixiedraw|market|pixfind|pixiee-lens|account)\//i);
assert.doesNotMatch(html, /window\.location\.(assign|replace)|location\.href\s*=/);
assert.doesNotMatch(html, /supabase|stripe|PiXiSYNC|PXD/i);
assert.match(shell, /routeChunks = Object\.freeze/);
assert.match(shell, /import\(chunk\)/);
for (const chunk of ['draw2-route.js', 'audio-route.js', 'game-route.js', 'market-route.js']) {
  assert.match(shell, new RegExp(chunk.replace('.', '\\.')));
  assert.doesNotMatch(html, new RegExp(`<script[^>]+${chunk}`), `${chunk} must stay out of the initial HTML bundle`);
}

for (const component of ['button', 'icon-button', 'input', 'select', 'switch', 'tabs', 'tab', 'menu', 'popover', 'dialog', 'sheet', 'toast', 'state', 'card', 'status']) {
  assert.match(`${html}\n${css}\n${shell}`, new RegExp(component), `${component} contract is missing`);
}
for (const state of ['loading', 'error', 'empty', 'permission-denied', 'offline', 'unavailable']) {
  assert.match(`${html}\n${css}\n${shell}`, new RegExp(state), `${state} state is missing`);
}
for (const token of ['--color-bg', '--color-surface', '--color-text', '--color-accent', '--color-border', '--space-4', '--radius-md', '--color-canvas-canonical', '--color-pixel-canonical']) {
  assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
const componentCss = css.slice(css.indexOf('@layer components'));
assert.doesNotMatch(componentCss, /#[0-9a-f]{3,8}\b|rgb\(/i, 'components must use semantic tokens instead of arbitrary colors');
assert.match(css, /env\(safe-area-inset-bottom/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /max-width: 719px/);
assert.match(css, /max-width: 1099px/);
assert.match(css, /data-layout="split"/);
assert.match(shell, /aria-modal="true"/);
assert.match(shell, /trapFocus/);
assert.match(shell, /restoreFocus/);
assert.match(shell, /aria-describedby/);
assert.match(shell, /private-surface/);
assert.match(`${css}\n${shell}`, /ad-slot/);
assert.match(shell, /CORE_SHELL_SERVER_ROUTE_UNAVAILABLE/);
assert.match(shell, /clientRequested = false/);
assert.match(draw2Route, /const mountedHosts = new WeakMap\(\)/);
assert.match(draw2Route, /const existing = mountedHosts\.get\(host\)/);
assert.match(draw2Route, /mountedHosts\.set\(host, mountPromise\)/);
assert.doesNotMatch(serverRouteContract, /\bdocument\b|\bCanvas\b|\bcanvas\b|\bfetch\b|\bDate\b|Math\.random|crypto\.randomUUID/);
const serverRouteModule = await import('../core-shell/assets/core-shell-server-route-contract.js');
assert.equal(serverRouteModule.authorizeCoreShellRoute({ routeId: 'home' }).code, 'CORE_SHELL_SESSION_UNVERIFIED');
assert.equal(serverRouteModule.authorizeCoreShellRoute({ routeId: 'home', verifiedSession: { signatureVerified: true }, account: { status: 'active' }, resourcePermission: { allowed: false } }).code, 'CORE_SHELL_RESOURCE_DENIED');
const serverAuthorized = serverRouteModule.authorizeCoreShellRoute({ routeId: 'home', verifiedSession: { signatureVerified: true, expired: false }, account: { status: 'active' }, resourcePermission: { allowed: true } });
assert.equal(serverAuthorized.serverAuthorized, true);
assert.equal(serverRouteModule.selectCoreShellRoute({ serverDecision: serverAuthorized, flagDecision: { decision: 'fallback' } }).decision, 'fallback');
assert.equal(serverRouteModule.selectCoreShellRoute({ serverDecision: serverAuthorized, flagDecision: { decision: 'enabled' } }).decision, 'enabled');

assert.doesNotMatch(flagSource, /\bdocument\b|\bCanvas\b|\bcanvas\b|\bfetch\b|\bXMLHttpRequest\b|\bDate\b|Math\.random|crypto\.randomUUID/);
assert.doesNotMatch(flagSource, /activeLayer|currentFrame|undoStack|redoStack|pixelBuffer|editorState/i);
assert.match(flagSource, /window\.PiXiEEDrawModules/);
assert.match(flagSource, /createCoreFeatureFlagRollback/);

const contractModule = await import('../core-shell/assets/core-shell-contracts.js');
const { createCoreShellAccessContract, createShellStore, createUiTelemetryRecorder } = contractModule;
const denied = createCoreShellAccessContract({
  serverRoute: { authorized: false },
  account: { status: 'active' },
  flagEvaluator: () => ({ decision: 'enabled', ok: true }),
});
assert.equal(denied.code, 'CORE_SHELL_SERVER_ROUTE_UNAVAILABLE');
const enabled = createCoreShellAccessContract({
  serverRoute: { authorized: true },
  account: { status: 'active' },
  flagEvaluator: ({ clientRequested }) => ({ decision: clientRequested ? 'deny' : 'enabled', ok: !clientRequested, enabled: !clientRequested }),
  identity: { ok: true, accountStatus: 'active' },
  resourcePermission: { ok: true },
});
assert.equal(enabled.decision, 'enabled');
const unknown = createCoreShellAccessContract({
  serverRoute: { authorized: true },
  account: { status: 'active' },
  flagEvaluator: () => ({ decision: 'unknown', ok: false }),
  identity: { ok: true, accountStatus: 'active' },
  resourcePermission: { ok: true },
});
assert.equal(unknown.decision, 'unknown');

const store = createShellStore({ activeRoute: 'home' });
let selectedChanges = 0;
store.subscribe((state) => state.activeRoute, () => { selectedChanges += 1; });
store.set({ theme: 'dark' });
assert.equal(selectedChanges, 0, 'theme changes must not rerender the selected route slice');
store.set({ activeRoute: 'projects' });
assert.equal(selectedChanges, 1);

const recorder = createUiTelemetryRecorder();
const event = recorder.record({ eventName: 'test', routeId: 'home', email: 'hidden@example.com', jwt: 'hidden', projectContent: 'hidden', theme: 'dark' });
assert.deepEqual(event, { eventName: 'test', routeId: 'home', theme: 'dark' });

const flagModule = await import('node:fs/promises');
const flagText = await flagModule.readFile(path.join(root, 'pixiedraw/assets/js/modules/core-feature-flag-rollback-utils.js'), 'utf8');
const fakeWindow = {};
const loadFlag = new Function('window', `${flagText}\nreturn window.PiXiEEDrawModules.coreFeatureFlagRollbackUtils;`);
const flags = loadFlag(fakeWindow).createCoreFeatureFlagRollback({ flags: [{ flagId: 'core-shell-read', domain: 'core', currentPath: '/core-shell/' }] });
const context = { identity: { ok: true, accountStatus: 'active' }, serverAuthorization: { ok: true }, resourcePermission: { ok: true }, principalId: 'server-principal', principalSource: 'server' };
assert.equal(flags.evaluate({ flagId: 'core-shell-read', action: 'read', ...context }).decision, 'fallback');
flags.configureRollout({ flagId: 'core-shell-read', action: 'read', percent: 100, actor: { id: 'test-server', source: 'server' }, event: { eventId: 'e1', correlationId: 'c1', at: '2026-08-07T00:00:00Z', reason: 'test' } });
assert.equal(flags.evaluate({ flagId: 'core-shell-read', action: 'read', ...context }).decision, 'enabled');
assert.equal(flags.evaluate({ flagId: 'missing', action: 'read', ...context }).decision, 'unknown');

console.log('WP-080 Core Shell contract tests passed: isolated entry, navigation map, semantic tokens, component states, server route boundary, default-off/unknown flag contract, lazy chunks, store slice boundary, telemetry redaction, and generic WP-070 dependency');
