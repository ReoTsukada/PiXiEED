import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../../js/creation/jigsaw-page.mjs', import.meta.url), 'utf8');
const start = page.indexOf('async function resumeGame(');
const end = page.indexOf('\nfunction resolveJigsawRouteId', start);
assert.ok(start >= 0 && end > start, 'page resumeGame() is available for isolated execution');
const resumeSource = page.slice(start, end);
const invalidateStart = page.indexOf('function invalidatePendingJigsawResume() {');
const invalidateEnd = page.indexOf('\nfunction cancelJigsawResult', invalidateStart);
assert.ok(invalidateStart >= 0 && invalidateEnd > invalidateStart, 'resume invalidation helper is available');
const invalidateSource = page.slice(invalidateStart, invalidateEnd);
const existingGame = { gameId: 'existing', groups: [{ id: 'old' }], source: { type: 'draw', draftId: 'old-source' } };
const existingLayout = { width: 24, height: 24, columns: 2, rows: 2, pieceSize: 12, seed: 'old' };
const existingPieces = [{ id: 'old-piece' }]; const existingPreview = { width: 24, height: 24, rgba: [1] };
function harness({ width = 24, height = 24, failure = null, legacy = false, loadRevision = null, resolveSource = null } = {}) {
  const statuses = []; const previewChanges = []; const actions = [];
  const stored = legacy
    ? { schemaVersion: 1, gameId: 'candidate', source: { type: 'draw', draftId: 'new-source', revisionId: 'new-rev', assetId: 'new-asset', contentHash: 'new-hash', hashScheme: 'sha256-canonical-v1' }, gridSize: 2, groups: [] }
    : { schemaVersion: 2, gameId: 'candidate', source: { type: 'draw', draftId: 'new-source', revisionId: 'new-rev', assetId: 'new-asset', contentHash: 'new-hash', hashScheme: 'sha256-canonical-v1' }, layout: { width: 24, height: 24, columns: 2, rows: 2, pieceSize: 12, seed: 'candidate' }, groups: [] };
  let loadCount = 0;
  const revisionFor = (id) => ({ asset: { kind: 'jigsaw', owner: { type: 'local', id: 'local-owner' }, visibility: 'draft' }, document: { ...stored, gameId: id } });
  const context = {
    resumeRequestId: 0, draftStore: { async load(id) { const index = loadCount++; return loadRevision ? loadRevision(id, index, revisionFor(id)) : revisionFor(id); } }, adapter: {},
    localStorageValue: () => null, JIGSAW_LAST_DRAFT_KEY: 'last', resumeButton: { hidden: false, disabled: false },
    game: existingGame, layoutData: existingLayout, pieces: existingPieces, sourcePixels: existingPreview,
    sourceDraftId: 'old-source', sourceRevision: { revisionId: 'old-rev' }, sourceLabel: { textContent: 'old label' }, gameDraftId: 'existing',
    selectedGroupId: 'old-selection', trayPage: 4, view: { scale: 2, x: 3, y: 4 }, pxdOriginalRefs: { old: true }, pxdPreservedPayload: { old: true },
    async resolveLocalDrawRevision() { if (failure === 'source') throw new Error('source unavailable'); return resolveSource ? resolveSource() : { asset: { assetId: 'new-asset' }, revisionId: 'new-rev', documentHash: 'new-hash', hashScheme: 'sha256-canonical-v1', document: { width, height, pixels: [1] } }; },
    documentRgba() { return [1]; }, validateJigsawWorkspace(value) { return value; },
    createJigsawLayout(input) { return { ...input, columns: input.columns || 2, rows: input.rows || 2, pieceSize: input.pieceSize || 12 }; },
    migrateLegacyJigsawGame(value) { return { ...value, migrated: true }; },
    sliceJigsawPieces(_rgba, layout) { if (failure === 'decode') throw new Error('decode failed'); return [{ width: layout.width, id: 'new-piece' }]; },
    setSourcePreview(value) { previewChanges.push(value); context.sourcePixels = value; },
    cancelJigsawResult(openingNewRun = false) { actions.push('cancel-result'); if (openingNewRun) context.resultRun += 1; }, resultRun: 0, resultShownRun: -1, clearSelectionCache() { actions.push('clear-cache'); },
    pxdBridge: { reset() { actions.push('reset-bridge'); } }, showGame() { actions.push('show-game'); if (failure === 'render') throw new Error('render failed'); }, updateViewport() {}, renderGame() {},
    updateStatus(text) { statuses.push(text); },
  };
  const api = runInNewContext(`${invalidateSource}\n${resumeSource}\n({ resumeGame, invalidatePendingJigsawResume });`, context);
  return { context, resume: api.resumeGame, invalidate: api.invalidatePendingJigsawResume, statuses, previewChanges, actions, stored };
}
function unchanged(context) {
  assert.equal(context.game, existingGame); assert.equal(context.layoutData, existingLayout); assert.equal(context.pieces, existingPieces);
  assert.equal(context.sourcePixels, existingPreview); assert.equal(context.sourceDraftId, 'old-source'); assert.equal(context.sourceRevision.revisionId, 'old-rev');
  assert.equal(context.sourceLabel.textContent, 'old label'); assert.equal(context.gameDraftId, 'existing'); assert.equal(context.selectedGroupId, 'old-selection');
  assert.equal(context.trayPage, 4); assert.deepEqual(context.view, { scale: 2, x: 3, y: 4 }); assert.deepEqual(context.pxdOriginalRefs, { old: true });
}

test('resume button click does not pass the browser event as a draft id', () => {
  const handlerStart = page.indexOf("resumeButton.addEventListener('click'");
  const handlerEnd = page.indexOf('\n', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'resume button click handler is available');
  let clickHandler;
  const calls = [];
  runInNewContext(page.slice(handlerStart, handlerEnd), {
    resumeGame(...args) { calls.push(args); },
    resumeButton: { addEventListener(_event, handler) { clickHandler = handler; } },
  });
  clickHandler({ type: 'click', isTrusted: true });
  assert.deepEqual(calls, [[]], 'the click handler invokes resumeGame without a PointerEvent argument');
});

test('failed source resolution leaves active game and source state unchanged', async () => {
  const env = harness({ failure: 'source' }); await env.resume('candidate'); unchanged(env.context);
  assert.deepEqual(env.previewChanges, []); assert.deepEqual(env.actions, []); assert.match(env.statuses.at(-1), /再開できませんでした/);
});
test('dimension mismatch leaves active game and source state unchanged', async () => {
  const env = harness({ width: 16 }); await env.resume('candidate'); unchanged(env.context);
  assert.deepEqual(env.previewChanges, []); assert.deepEqual(env.actions, []); assert.match(env.statuses.at(-1), /寸法が一致しません/);
});
test('piece decoding failure leaves active game and source state unchanged', async () => {
  const env = harness({ failure: 'decode' }); await env.resume('candidate'); unchanged(env.context);
  assert.deepEqual(env.previewChanges, []); assert.deepEqual(env.actions, []); assert.match(env.statuses.at(-1), /decode failed/);
});
test('valid resume installs new workspace/source together', async () => {
  const env = harness({ width: 24 }); await env.resume('candidate');
  assert.equal(env.context.game.gameId, 'candidate'); assert.notEqual(env.context.layoutData, existingLayout); assert.notEqual(env.context.pieces, existingPieces);
  assert.equal(env.context.sourceDraftId, 'new-source'); assert.equal(env.context.sourceRevision.revisionId, 'new-rev'); assert.match(env.context.sourceLabel.textContent, /new-rev/);
  assert.equal(env.context.gameDraftId, 'candidate'); assert.equal(JSON.stringify(env.previewChanges), JSON.stringify([{ width: 24, height: 24, rgba: [1] }]));
  assert.deepEqual(env.actions, ['cancel-result', 'clear-cache', 'reset-bridge', 'show-game']);
});
test('legacy resume still migrates before installing the workspace', async () => {
  const env = harness({ width: 24, legacy: true }); await env.resume('candidate');
  assert.equal(env.context.game.migrated, true); assert.equal(env.context.gameDraftId, 'candidate'); assert.equal(env.context.layoutData.width, 24);
});


function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
function savedRevision(gameId) {
  return { asset: { kind: 'jigsaw', owner: { type: 'local', id: 'local-owner' }, visibility: 'draft' }, document: { schemaVersion: 2, gameId, source: { type: 'draw', draftId: 'new-source', revisionId: 'new-rev', assetId: 'new-asset', contentHash: 'new-hash', hashScheme: 'sha256-canonical-v1' }, layout: { width: 24, height: 24, columns: 2, rows: 2, pieceSize: 12, seed: gameId }, groups: [] } };
}
function replacementState(context, gameId = 'replacement') {
  const game = { gameId, groups: [{ id: 'replacement-piece' }], source: { type: 'draw', draftId: 'replacement-source' } };
  const layout = { width: 12, height: 12, columns: 1, rows: 1, pieceSize: 12, seed: gameId };
  const pieces = [{ id: 'replacement-piece' }]; const preview = { width: 12, height: 12, rgba: [9] };
  Object.assign(context, { game, gameDraftId: gameId, layoutData: layout, pieces, sourcePixels: preview, sourceDraftId: 'replacement-source', sourceRevision: { revisionId: 'replacement-rev' } });
  context.sourceLabel.textContent = 'replacement label';
  return { game, layout, pieces, preview };
}

test('resume loaded before replacement cannot overwrite the newer workspace or its status', async () => {
  const gate = deferred(); const env = harness({ loadRevision: () => gate.promise });
  const pending = env.resume('candidate');
  await new Promise((resolve) => setImmediate(resolve));
  const replacement = replacementState(env.context);
  env.context.resumeButton.disabled = true;
  env.invalidate();
  gate.resolve(savedRevision('candidate')); await pending;
  assert.equal(env.context.game, replacement.game); assert.equal(env.context.gameDraftId, 'replacement');
  assert.equal(env.context.sourcePixels, replacement.preview); assert.equal(env.context.sourceLabel.textContent, 'replacement label');
  assert.equal(env.context.resumeButton.disabled, true); assert.equal(env.previewChanges.length, 0);
  assert.ok(!env.statuses.some((text) => /再開できませんでした|同じ元の固定版で再開/.test(text)));
});

test('source resolution finishing after New leaves the replacement state intact', async () => {
  const gate = deferred(); let sourceStarted; const started = new Promise((resolve) => { sourceStarted = resolve; });
  const env = harness({ resolveSource: () => { sourceStarted(); return gate.promise; } });
  const pending = env.resume('candidate'); await started;
  const replacement = replacementState(env.context); env.invalidate();
  gate.resolve({ asset: { assetId: 'new-asset' }, revisionId: 'new-rev', documentHash: 'new-hash', hashScheme: 'sha256-canonical-v1', document: { width: 24, height: 24, pixels: [1] } });
  await pending;
  assert.equal(env.context.game, replacement.game); assert.equal(env.context.gameDraftId, 'replacement');
  assert.equal(env.context.sourcePixels, replacement.preview); assert.equal(env.context.sourceLabel.textContent, 'replacement label');
  assert.equal(env.previewChanges.length, 0);
});

test('overlapping resumes use latest request and stale completion cannot re-enable its button', async () => {
  const first = deferred(); const second = deferred();
  const env = harness({ loadRevision: (_id, index) => index === 0 ? first.promise : second.promise });
  const older = env.resume('older'); const newer = env.resume('newer');
  assert.equal(env.context.resumeButton.disabled, true);
  second.resolve(savedRevision('newer')); await newer;
  assert.equal(env.context.game.gameId, 'newer'); assert.equal(env.context.resumeButton.disabled, false);
  env.context.resumeButton.disabled = true;
  first.resolve(savedRevision('older')); await older;
  assert.equal(env.context.game.gameId, 'newer'); assert.equal(env.context.gameDraftId, 'newer');
  assert.equal(env.context.resumeButton.disabled, true);
});


test('renderer failure after atomic install still reports and releases this resume request', async () => {
  const env = harness({ failure: 'render' }); await env.resume('candidate');
  assert.equal(env.context.game.gameId, 'candidate');
  assert.match(env.statuses.at(-1), /再開できませんでした：render failed/);
  assert.equal(env.context.resumeButton.disabled, false);
});


function invokeCurrentButton(env) {
  const handlerStart = page.indexOf("$('#jigsaw-current').addEventListener('click'");
  const handlerEnd = page.indexOf('\n', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'current-game click handler is available');
  let clickHandler;
  const context = {
    game: env.context.game,
    resumeButton: env.context.resumeButton,
    workspaceElement: { focus() {} },
    showGame() {},
    invalidatePendingJigsawResume: env.invalidate,
    $(selector) { assert.equal(selector, '#jigsaw-current'); return { addEventListener(_event, handler) { clickHandler = handler; } }; }
  };
  runInNewContext(page.slice(handlerStart, handlerEnd), context);
  clickHandler();
}

test('current-game click invalidates a pending resume and restores its button', async () => {
  const gate = deferred(); const env = harness({ loadRevision: () => gate.promise });
  const pending = env.resume('candidate'); await new Promise((resolve) => setImmediate(resolve));
  const retained = env.context.game;
  invokeCurrentButton(env);
  assert.equal(env.context.resumeButton.disabled, false);
  gate.resolve(savedRevision('candidate')); await pending;
  assert.equal(env.context.game, retained); assert.equal(env.context.gameDraftId, 'existing');
  assert.equal(env.context.resumeButton.disabled, false);
});

test('latest request cleanup releases button when game identity changes without ticket change', async () => {
  const gate = deferred(); const env = harness({ loadRevision: () => gate.promise });
  const pending = env.resume('candidate'); await new Promise((resolve) => setImmediate(resolve));
  const replacement = replacementState(env.context);
  gate.resolve(savedRevision('candidate')); await pending;
  assert.equal(env.context.game, replacement.game); assert.equal(env.context.gameDraftId, 'replacement');
  assert.equal(env.context.resumeButton.disabled, false);
});
