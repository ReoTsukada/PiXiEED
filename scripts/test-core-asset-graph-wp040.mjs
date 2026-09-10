import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../core-shell/assets/core-asset-graph-utils.js', import.meta.url));
const source = await readFile(modulePath, 'utf8');
const appWindow = {};
const load = new Function('window', `${source}\nreturn window.PiXiEEDrawModules.coreAssetGraphUtils;`);
const api = load(appWindow);
const graph = api.createCoreAssetGraph();

const blob = { contentHash: 'a'.repeat(64), byteLength: 4, mimeType: 'image/x-pixi-index8' };
assert.equal(graph.registerBlob(blob).created, true);
assert.equal(graph.registerBlob(blob).created, false, 'same immutable Blob must be reused');
graph.registerAsset({ assetId: 'draw-asset', kind: 'pixel.sprite', ownerId: 'creator-1' });
graph.registerAsset({ assetId: 'game-asset', kind: 'game.scene', ownerId: 'creator-1' });
graph.publishRevision({ assetId: 'draw-asset', revisionId: 'draw-r1', contentHash: blob.contentHash, metadata: { width: 2, height: 2 } });

const secondBlob = { contentHash: 'b'.repeat(64), byteLength: 4, mimeType: blob.mimeType };
graph.registerBlob(secondBlob);
graph.publishRevision({ assetId: 'draw-asset', revisionId: 'draw-r2', contentHash: secondBlob.contentHash, parentRevisionId: 'draw-r1' });
const live = graph.createReference({ edgeId: 'game-draw-edge', sourceId: 'game-asset', targetAssetId: 'draw-asset', mode: 'LIVE' });
assert.equal(live.targetRevisionId, 'draw-r2');
graph.transitionReference('game-draw-edge', { mode: 'REVIEW', candidateRevisionId: 'draw-r2' });
const pinned = graph.transitionReference('game-draw-edge', { mode: 'PINNED', targetRevisionId: 'draw-r2', approvedBy: 'reviewer-1' });
assert.equal(pinned.mode, 'PINNED');
assert.equal(pinned.targetRevisionId, 'draw-r2');

const beforeFailure = graph.snapshot();
assert.throws(() => graph.transitionReference('game-draw-edge', { mode: 'PINNED', targetRevisionId: 'draw-r1' }), /approvedBy/);
assert.deepEqual(graph.snapshot(), beforeFailure, 'invalid transition must not partially mutate graph');

const forked = graph.transitionReference('game-draw-edge', { mode: 'FORKED', targetRevisionId: 'draw-r2', derivedAssetId: 'draw-fork-1' });
assert.equal(forked.mode, 'FORKED');
assert.equal(forked.derivedAssetId, 'draw-fork-1');

assert.throws(() => graph.publishRevision({ assetId: 'draw-asset', revisionId: 'draw-r3', contentHash: secondBlob.contentHash }), /Identical content/);
graph.tombstoneAsset('draw-asset', 'source-retired');
assert.equal(graph.snapshot().assets['draw-asset'].status, 'tombstoned');
assert.equal(graph.inspect().modes.PINNED, 0, 'reference is forked after transition');
assert.equal(graph.inspect().modes.FORKED, 1);
assert.deepEqual(api.REFERENCE_MODES, ['LIVE', 'PINNED', 'REVIEW', 'FORKED']);
assert.doesNotMatch(source, /\b(indexedDB|fetch|XMLHttpRequest|Date|Math\.random)\b/, 'Asset Graph adapter must remain storage/network/time/random independent');
console.log('WP-040 Core Asset Graph tests passed: Blob reuse, immutable revisions, reference modes, fork, tombstone, failure atomicity');
