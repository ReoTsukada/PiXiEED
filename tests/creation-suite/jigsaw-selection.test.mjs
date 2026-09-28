import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJigsawSelectionEdges } from '../../js/creation/jigsaw-selection.mjs';

function fixture({ width, height, owned, pieces, columns }) {
  const byId = new Map(pieces.map((piece) => [piece.pieceId, piece]));
  return { byId, layout: { width, height, columns, owner: Int32Array.from(owned) } };
}

test('selection follows the mask silhouette including a tab', () => {
  const piece = { pieceId: 'a', row: 0, column: 0, bounds: { x: 0, y: 0, width: 2, height: 2 }, mask: Uint8Array.from([1, 1, 1, 0]) };
  const { byId, layout } = fixture({ width: 2, height: 2, columns: 1, owned: [0, 0, 0, -1], pieces: [piece] });
  const edges = buildJigsawSelectionEdges({ pieceIds: ['a'], inTray: false }, layout, byId);
  assert.equal(edges.length / 4, 8);
  const segments = Array.from({ length: edges.length / 4 }, (_, index) => edges.slice(index * 4, index * 4 + 4).join(',')).sort();
  assert.deepEqual(segments, ['0,0,1,0', '0,1,0,0', '1,0,2,0', '2,0,2,1', '2,1,1,1', '1,1,1,2', '1,2,0,2', '0,2,0,1'].sort(), 'the missing corner has an inward contour rather than a rectangular frame');
});

test('adjacent selected pieces suppress their shared edge', () => {
  const a = { pieceId: 'a', row: 0, column: 0, bounds: { x: 0, y: 0, width: 1, height: 1 }, mask: Uint8Array.of(1) };
  const b = { pieceId: 'b', row: 0, column: 1, bounds: { x: 1, y: 0, width: 1, height: 1 }, mask: Uint8Array.of(1) };
  const { byId, layout } = fixture({ width: 2, height: 1, columns: 2, owned: [0, 1], pieces: [a, b] });
  const edges = buildJigsawSelectionEdges({ pieceIds: ['a', 'b'], inTray: false }, layout, byId);
  assert.equal(edges.length / 4, 6);
  const sharedVerticalEdge = edges.some((value, index) => index % 4 === 0 && value === 1 && edges[index + 2] === 1);
  assert.equal(sharedVerticalEdge, false, 'the x=1 shared edge is absent');
});

test('a hole stays open and tray groups have no selection contour', () => {
  const piece = { pieceId: 'ring', row: 0, column: 0, bounds: { x: 0, y: 0, width: 3, height: 3 }, mask: Uint8Array.from([1,1,1,1,0,1,1,1,1]) };
  const { byId, layout } = fixture({ width: 3, height: 3, columns: 1, owned: [0,0,0,0,-1,0,0,0,0], pieces: [piece] });
  const edges = buildJigsawSelectionEdges({ pieceIds: ['ring'], inTray: false }, layout, byId);
  assert.equal(edges.length / 4, 16);
  assert.deepEqual(buildJigsawSelectionEdges({ pieceIds: ['ring'], inTray: true }, layout, byId), []);
});
