import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const manifest = read('pixiedraw2/src/workspace/project-manifest.ts');
const workspaceContract = read('docs/contracts/wp180-workspace-contract.md');
const featureMatrix = read('docs/ui/MODE_FEATURE_MATRIX.md');
const workspaceUi = read('pixiedraw2/src/wp180-workspace-ui.ts');
const draw2Html = read('pixiedraw2/index.html');
const entry = read('pixiedraw2/src/draw2-entry.ts');
const lazySync = read('pixiedraw2/src/pixync/lazy-aggregate-sync.ts');
const composition = read('pixiedraw2/src/pixync/composition-root.ts');
const drawBridge = read('pixiedraw2/src/pixync/draw-product-bridge.ts');
const audioBridge = read('pixiedraw2/src/pixync/audio-product-bridge.ts');
const gameBridge = read('pixiedraw2/src/pixync/game-product-bridge.ts');

const expect = (source, pattern, label) => {
  assert.match(source, pattern, `Local sharing boundary missing: ${label}`);
};

// One Project identity is shared, but each mode owns its state/checkpoint/journal.
expect(manifest, /modules:\s*\{\s*draw:\s*moduleManifest\("draw"/s, 'draw module');
expect(manifest, /audio:\s*moduleManifest\(\s*"audio"/s, 'audio module');
expect(manifest, /game:\s*moduleManifest\(\s*"game"/s, 'game module');
expect(manifest, /stateRef:\s*string/,
  'module state references');
expect(manifest, /checkpointRef:\s*string/,
  'module checkpoint references');
expect(manifest, /journalRef:\s*string/,
  'module journal references');

// Workspace/UI state cannot become canonical project or history state.
expect(workspaceContract, /Canonical Project state.*Undo/s, 'canonical history boundary');
expect(workspaceContract, /PiXiSYNC.*Canonical Operation/s, 'PiXYNC workspace boundary');
expect(featureMatrix, /Draw\/Audio timeline can align by adapter, not shared cell type/,
  'mode-specific timebases');
expect(workspaceUi, /Audio FPS never writes to the Audio Project|Audio resolution is read-only in this surface/s,
  'Audio FPS isolation');
expect(workspaceUi, /Draw FPS remains independent/,
  'Draw FPS isolation');
expect(workspaceUi, /Draw FPS unchanged/,
  'Audio tempo does not mutate Draw FPS');
expect(draw2Html, /data-creator-mode="GAME"/,
  'iGAME mode switch');
assert.doesNotMatch(draw2Html, /data-creator-mode="GAME"[^>]*aria-disabled="true"/,
  'iGAME mode switch must not remain locked');
expect(workspaceUi, /Canonical GameProject|preparePixyncGameState/,
  'iGAME canonical project hydration');

// The local entry updates one module manifest at a time and never replaces the
// other module's canonical state as a side effect of a mode switch.
expect(entry, /workspaceManifestStore\.updateModule\(\s*asWorkspaceProjectId\(projectId\),\s*"draw"/s,
  'Draw manifest update');
expect(workspaceUi, /workspaceManifestStore\.updateModule\(\s*asWorkspaceProjectId\(record\.value\.projectId\),\s*"audio"/s,
  'Audio manifest update');
expect(workspaceUi, /workspaceManifestStore\.updateModule\(\s*asWorkspaceProjectId\(projectId\),\s*"game"/s,
  'Game manifest update');

// Cross-mode synchronization is metadata-first and demand-driven.
expect(lazySync, /Metadata only\. Audio bytes, snapshots, and command payloads are forbidden/,
  'metadata-only invalidations');
for (const demand of ['DRAW_AUDIO_LANE', 'DRAW_PLAYBACK', 'DRAW_EXPORT', 'AUDIO_WORKSPACE']) {
  expect(lazySync, new RegExp(demand), `Audio demand ${demand}`);
}
for (const demand of ['GAME_CATALOG', 'GAME_EDITOR', 'GAME_BUILD']) {
  expect(lazySync, new RegExp(demand), `Game demand ${demand}`);
}

// Remote operations must not enter the local Undo/Redo stack in any mode.
for (const [source, name] of [[drawBridge, 'Draw'], [audioBridge, 'Audio'], [gameBridge, 'Game']]) {
  expect(source, /preservesLocalHistory:\s*true/, `${name} history preservation`);
  expect(source, /HISTORY_MUTATION_FORBIDDEN/, `${name} remote history guard`);
}

// The production composition is complete only when all three adapters are present.
expect(composition, /products\.adapters\.length !== 3/, 'three-adapter requirement');
for (const aggregate of ['draw', 'audio', 'game']) {
  expect(composition, new RegExp(`aggregates\\.has\\("${aggregate}"\\)`), `${aggregate} adapter registration`);
}
expect(composition, /draw2:raster-operation-committed/, 'Draw commit event');
expect(composition, /draw2:audio-journal-committed/, 'Audio commit event');
expect(composition, /draw2:game-editor-committed/, 'Game commit event');

console.log('Local sharing audit passed: shared project identity, isolated mode state/history, demand-driven hydration, and three-mode PiXYNC composition.');
