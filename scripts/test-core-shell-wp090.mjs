import assert from 'node:assert/strict';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const files = {
  html: 'core-shell/index.html',
  css: 'core-shell/assets/core-shell.css',
  shell: 'core-shell/assets/core-shell.js',
  shellContracts: 'core-shell/assets/core-shell-contracts.js',
  interaction: 'core-shell/assets/core-shell-interaction-contracts.js',
  async: 'core-shell/assets/core-shell-async-contracts.js',
  performance: 'core-shell/assets/core-shell-performance-contracts.js',
  server: 'core-shell/assets/core-shell-server-route-contract.js',
};
const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await read(file)])));

assert.match(content.html, /メインコンテンツへ移動|coreShellAnnouncer/);
assert.match(content.html, /noindex,nofollow/);
assert.doesNotMatch(content.html, /<script[^>]+routes\//);
assert.match(content.shell, /core-shell-interaction-contracts\.js/);
assert.match(content.shell, /core-shell-async-contracts\.js/);
assert.match(content.shell, /moveRovingFocus|setModalBackgroundIsolation|setPreviewState/);
assert.match(content.shell, /pointerdown|pointercancel|lostpointercapture/);
assert.match(content.css, /skip-link|forced-colors|touch-action: pan-y|overscroll-behavior/);
assert.match(content.css, /prefers-reduced-motion/);
assert.doesNotMatch(content.css.slice(content.css.indexOf('@layer components')), /#[0-9a-f]{3,8}\b|rgb\(/i);
assert.doesNotMatch(content.interaction, /\bdocument\b|\bwindow\b|\bCanvas\b|\bcanvas\b|\bfetch\b|Math\.random/);
assert.doesNotMatch(content.async, /\bdocument\b|\bwindow\b|\bCanvas\b|\bcanvas\b|\bfetch\b|Math\.random/);
assert.doesNotMatch(content.performance, /\bdocument\b|\bwindow\b|\bCanvas\b|\bcanvas\b|\bfetch\b|Math\.random/);

const interaction = await import('../core-shell/assets/core-shell-interaction-contracts.js');
const asyncContracts = await import('../core-shell/assets/core-shell-async-contracts.js');
const performance = await import('../core-shell/assets/core-shell-performance-contracts.js');
const server = await import('../core-shell/assets/core-shell-server-route-contract.js');
const shellContracts = await import('../core-shell/assets/core-shell-contracts.js');

assert.equal(interaction.shouldHandleShortcut({ key: 'z', target: { tagName: 'DIV', getAttribute: () => null } }), true);
assert.equal(interaction.shouldHandleShortcut({ key: 'z', target: { tagName: 'INPUT', getAttribute: () => null } }), false);
assert.equal(interaction.shouldHandleShortcut({ key: 'z', isComposing: true, target: { tagName: 'DIV', getAttribute: () => null } }), false);
const shortcuts = interaction.createShortcutRegistry([{ id: 'undo', key: 'z', action: 'undo', description: 'Undo' }]);
assert.equal(shortcuts.resolve({ key: 'z', target: { tagName: 'DIV', getAttribute: () => null } }).action, 'undo');
assert.equal(shortcuts.resolve({ key: 'z', target: { tagName: 'TEXTAREA', getAttribute: () => null } }), null);
assert.equal(interaction.chooseFocusRestoreTarget({ origin: { id: 'deleted', connected: false }, candidates: [{ id: 'fallback', connected: true }], fallback: 'main' }), 'fallback');
assert.deepEqual(interaction.createRouteFocusDecision({ routeId: 'projects' }), { routeId: 'projects', targetId: 'route-projects-heading', fallbackId: 'coreShellMain', announcement: 'projects routeへ移動しました。' });
const pointers = interaction.createPointerOwnership();
assert.equal(pointers.begin({ pointerId: 1, pointerType: 'touch', owner: 'shell' }).ok, true);
assert.equal(pointers.begin({ pointerId: 1, pointerType: 'touch', owner: 'shell' }).code, 'POINTER_ALREADY_OWNED');
assert.equal(pointers.release(1, 'pointercancel').ok, true);
assert.equal(pointers.snapshot().length, 0);

assert.deepEqual(asyncContracts.ASYNC_STATES, ['initial', 'loading', 'ready', 'empty', 'saving', 'saved', 'offline', 'reconnecting', 'degraded', 'permission-denied', 'session-expired', 'conflict', 'recoverable-error', 'fatal-error', 'unsupported-version', 'unavailable', 'rollback-recovery-available']);
const machine = asyncContracts.createAsyncStateMachine();
assert.equal(machine.transition('loading').ok, true);
assert.equal(machine.transition('ready').ok, true);
assert.equal(machine.transition('saving').ok, true);
assert.equal(machine.transition('saved').ok, true);
assert.equal(machine.transition('unsupported-version').ok, false, 'saved state cannot jump to an unsupported version without a recovery check');
assert.equal(machine.transition('offline').ok, true);
assert.equal(machine.transition('reconnecting').ok, true);
assert.equal(machine.transition('ready').ok, true);
assert.equal(machine.transition('not-a-state').code, 'ASYNC_STATE_UNKNOWN');
assert.equal(asyncContracts.createAsyncStateMachine().transition('conflict').code, 'ASYNC_TRANSITION_INVALID');
assert.equal(asyncContracts.createLiveRegionDeduper().announce({ state: 'loading', message: '読み込み中' }).message, '読み込み中');
const deduper = asyncContracts.createLiveRegionDeduper();
deduper.announce({ state: 'loading', message: '読み込み中' });
assert.equal(deduper.announce({ state: 'loading', message: '読み込み中' }), null);
assert.deepEqual(asyncContracts.createErrorSummary({ code: 'FIELD_INVALID', message: '入力を確認してください。', fieldErrors: [{ fieldId: 'projectName', message: '必須です。' }], recoverable: true }), { code: 'FIELD_INVALID', message: '入力を確認してください。', fieldErrors: [{ fieldId: 'projectName', message: '必須です。' }], recoverable: true, actions: [] });
assert.equal(asyncContracts.ASYNC_RECOVERY_CONTRACT.preserveUnsyncedOperations, true);
assert.equal(asyncContracts.ASYNC_RECOVERY_CONTRACT.offlineIsNotSaved, true);
const boundedTelemetry = shellContracts.createUiTelemetryRecorder({ maxEntries: 2 });
boundedTelemetry.record({ eventName: 'a' });
boundedTelemetry.record({ eventName: 'b' });
boundedTelemetry.record({ eventName: 'c' });
assert.equal(boundedTelemetry.snapshot().length, 2, 'telemetry history must be bounded');

const session = server.authorizeCoreShellRoute({ routeId: 'home' });
assert.equal(session.httpStatus, 403);
const unknownRoute = server.authorizeCoreShellRoute({ routeId: 'unknown-route', verifiedSession: { signatureVerified: true }, account: { status: 'active' }, resourcePermission: { allowed: true } });
assert.equal(unknownRoute.httpStatus, 404);
const denied = server.authorizeCoreShellRoute({ routeId: 'home', verifiedSession: { signatureVerified: true, expired: false }, account: { status: 'active' }, resourcePermission: { allowed: false } });
assert.equal(denied.httpStatus, 403);
const authorized = server.authorizeCoreShellRoute({ routeId: 'home', verifiedSession: { signatureVerified: true, expired: false }, account: { status: 'active' }, resourcePermission: { allowed: true } });
assert.equal(server.createCoreShellRouteResponse({ serverDecision: authorized, flagDecision: { decision: 'fallback' } }).status, 404);
assert.equal(server.createCoreShellRouteResponse({ serverDecision: authorized, flagDecision: { decision: 'enabled' } }).status, 200);
assert.equal(server.createCoreShellRouteResponse({ routeId: 'home', serverDecision: denied, flagDecision: { decision: 'enabled' } }).doNotPrefetch, true);

const initialFiles = [files.html, files.css, files.shell, files.shellContracts, files.interaction, files.async, files.performance, 'pixiedraw/assets/js/modules/core-feature-flag-rollback-utils.js'];
const initialBytes = Buffer.concat(await Promise.all(initialFiles.map(async (file) => Buffer.from(await read(file)))));
const initialStats = await Promise.all(initialFiles.map(async (file) => ({ file, bytes: (await stat(path.join(root, file))).size })));
const summary = performance.summarizeShellPerformance({ sourceBytes: initialBytes.length, gzipBytes: gzipSync(initialBytes).length, brotliBytes: brotliCompressSync(initialBytes).length, resources: [{ name: 'http://local/core-shell/assets/core-shell.js' }], longTasks: [{ duration: 4 }, { duration: 51 }] });
assert.equal(summary.routeChunkRequestCount, 0);
assert.equal(summary.longTaskCount, 1);
assert.equal(summary.sourceBaselineDelta, initialBytes.length - performance.WP080_INITIAL_SOURCE_BYTES);
assert.ok(summary.gzipBytes > 0 && summary.brotliBytes > 0);

console.log(`WP-090 contract tests passed: interaction, focus, keyboard/IME, pointer ownership, async recovery, live-region dedupe, server 403/404 fail-closed, CSS accessibility boundaries, privacy-safe performance summary; raw initial bytes=${initialBytes.length}; gzip=${summary.gzipBytes}; brotli=${summary.brotliBytes}; files=${initialStats.length}`);
