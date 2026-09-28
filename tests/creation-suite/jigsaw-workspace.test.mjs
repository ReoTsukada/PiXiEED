import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createJigsawLayout, createJigsawWorkspace, isJigsawWorkspaceComplete, migrateLegacyJigsawGame,
  moveJigsawGroup, pieceAtPoint, reassembleJigsawPieces, rotateJigsawGroup,
  sliceJigsawPieces, snapJigsawGroup, validateJigsawWorkspace, worldGroupBounds
} from '../../js/creation/jigsaw-workspace.mjs';

function source(width, height) {
  return { type: 'file', dataUrl: 'data:image/png;base64,AAAA', fingerprint: 'a'.repeat(64), width, height };
}

function cellConnected(piece) {
  const { width, height } = piece.bounds; const cells = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (piece.mask[y * width + x]) cells.push([x, y]);
  if (!cells.length) return false;
  const all = new Set(cells.map(([x, y]) => `${x},${y}`)); const seen = new Set([`${cells[0][0]},${cells[0][1]}`]); const pending = [cells[0]];
  while (pending.length) {
    const [x, y] = pending.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (all.has(key) && !seen.has(key)) { seen.add(key); pending.push([x + dx, y + dy]); }
    }
  }
  return seen.size === all.size;
}

function findGroup(game, pieceId) { return game.groups.find((group) => group.pieceIds.includes(pieceId)); }

test('pixel partition covers every source pixel exactly once, uses concave tabs, and keeps each piece connected', () => {
  const layout = createJigsawLayout({ width: 32, height: 32, pieceSize: 8, seed: 'tabs-fixture' });
  assert.deepEqual(layout.pieces.slice(0, 4).map((piece) => piece.width), [8, 8, 8, 8]);
  assert.equal(layout.columns, 4); assert.equal(layout.rows, 4);
  assert.ok(layout.pieces.every(cellConnected), 'masks must stay 4-connected');
  assert.ok(layout.owner.every((owner) => owner >= 0 && owner < layout.pieces.length));
  for (let index = 0; index < layout.pieces.length; index += 1) {
    const piece = layout.pieces[index]; let owned = 0;
    for (let y = 0; y < layout.height; y += 1) for (let x = 0; x < layout.width; x += 1) if (layout.owner[y * layout.width + x] === index) {
      owned += 1; assert.equal(piece.mask[(y - piece.bounds.y) * piece.bounds.width + x - piece.bounds.x], 1);
    }
    assert.ok(owned > 0);
  }
  assert.ok(layout.pieces.some((piece) => piece.bounds.x < piece.x || piece.bounds.y < piece.y || piece.bounds.width > piece.width || piece.bounds.height > piece.height), 'interior pieces extend into a tab footprint');

  const uneven = createJigsawLayout({ width: 16, height: 16, pieceSize: 3, seed: 'uneven' });
  assert.deepEqual(uneven.pieces.filter((piece) => piece.row === 0).map((piece) => piece.width), [3, 3, 3, 3, 4]);
  assert.ok(uneven.pieces.some((piece) => {
    for (let y = 0; y < piece.bounds.height; y += 1) for (let x = 0; x < piece.bounds.width; x += 1) {
      if (piece.mask[y * piece.bounds.width + x] && (piece.bounds.x + x < piece.x || piece.bounds.y + y < piece.y || piece.bounds.x + x >= piece.x + piece.width || piece.bounds.y + y >= piece.y + piece.height)) return true;
    }
    return false;
  }), '3px cells still have a central pixel tab');

  for (const width of [3, 7, 16, 25, 64, 128]) for (const height of [3, 11, 16, 33, 64]) for (const pieceSize of [3, 6, 12]) {
    if (Math.max(width, height) < pieceSize) continue;
    let candidate; try { candidate = createJigsawLayout({ width, height, pieceSize, seed: `audit-${width}-${height}-${pieceSize}` }); } catch (error) { if (/上限/.test(error.message)) continue; throw error; }
    assert.ok(candidate.pieces.every(cellConnected), `${width}×${height}, piece ${pieceSize}`);
  }
  for (const [width, height] of [[3, 128], [128, 3], [7, 11]]) {
    const narrow = createJigsawLayout({ width, height, pieceSize: 3, seed: `narrow-${width}-${height}` });
    assert.ok(narrow.pieces.every(cellConnected), `${width}×${height} one-axis minimum`);
  }
});

test('non-square RGBA slice and reassembly preserve every byte, including transparent hidden RGB', () => {
  const width = 29; const height = 17; const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) { rgba[i * 4] = i & 255; rgba[i * 4 + 1] = (i * 7) & 255; rgba[i * 4 + 2] = (i * 13) & 255; rgba[i * 4 + 3] = i % 4 ? 255 : 0; }
  const image = { width, height, rgba }; const layout = createJigsawLayout({ width, height, pieceSize: 7, seed: 'alpha' });
  const pieces = sliceJigsawPieces(image, layout);
  assert.ok(pieces.some((piece) => piece.rgba.some((byte, offset) => offset % 4 === 0 && byte !== 0 && piece.rgba[offset + 3] === 0)));
  assert.deepEqual(reassembleJigsawPieces(image, layout, pieces), rgba);
});

test('workspace JSON restores deterministic shuffled pieces and validates every piece exactly once', () => {
  const layout = createJigsawLayout({ width: 24, height: 24, pieceSize: 8, seed: 'saved-layout' });
  const game = createJigsawWorkspace({ gameId: 'jigsaw-game', source: source(24, 24), layout, seed: 'tray-seed' });
  const restored = JSON.parse(JSON.stringify(game));
  assert.equal(validateJigsawWorkspace(restored), restored);
  assert.equal(restored.groups.length, layout.pieces.length);
  assert.equal(new Set(restored.pieceOrder).size, layout.pieces.length);
  assert.ok(restored.groups.every((group) => group.inTray && group.rotation >= 0 && group.rotation <= 3));
  assert.equal(Object.hasOwn(restored.layout, 'pieces'), false);
  const missing = structuredClone(restored); missing.groups.pop();
  assert.throws(() => validateJigsawWorkspace(missing), /各ピース/);
  const duplicate = structuredClone(restored); duplicate.groups[1].pieceIds[0] = duplicate.groups[0].pieceIds[0];
  assert.throws(() => validateJigsawWorkspace(duplicate), /グループ状態/);
  const changedSource = { ...restored, source: source(25, 24) };
  assert.throws(() => validateJigsawWorkspace(changedSource), /元画像と盤面/);
  assert.throws(() => validateJigsawWorkspace({ ...restored, viewport: { scale: 13, x: 0, y: 0 } }), /表示位置/);
  assert.equal(validateJigsawWorkspace({ ...restored, viewport: { scale: 1.2, x: -0.5, y: 0.25 } }).viewport.scale, 1.2);
  assert.throws(() => createJigsawLayout({ width: 24, height: 24, pieceSize: 8, seed: 7 }), /seedは/);
  assert.throws(() => createJigsawLayout({ width: 24, height: 24, pieceSize: 8, seed: 's'.repeat(129) }), /seedは/);
  assert.throws(() => validateJigsawWorkspace({ ...restored, layout: { ...restored.layout, seed: 's'.repeat(129) } }), /seedは/);
});

test('move and quarter rotation keep a group rigid and preserve its center; mask picking follows rotation', () => {
  const layout = createJigsawLayout({ width: 24, height: 24, pieceSize: 8, seed: 'pose' });
  const game = createJigsawWorkspace({ gameId: 'pose-game', source: source(24, 24), layout, seed: 'pose' });
  const piece = layout.pieces[0]; const originalGroup = findGroup(game, piece.pieceId);
  let moved = moveJigsawGroup(game, originalGroup.groupId, { x: 12, y: 17, inTray: false });
  const group = findGroup(moved, piece.pieceId); const before = worldGroupBounds(group, layout);
  const rotated = rotateJigsawGroup(moved, group.groupId, 1); const turned = findGroup(rotated, piece.pieceId); const after = worldGroupBounds(turned, layout);
  assert.equal(after.x + after.width / 2, before.x + before.width / 2);
  assert.equal(after.y + after.height / 2, before.y + before.height / 2);
  const ownedPixel = layout.owner.findIndex((owner) => owner === layout.pieces.indexOf(piece));
  const x = ownedPixel % layout.width; const y = Math.floor(ownedPixel / layout.width);
  const world = { x: -(y + 0.5) + turned.x, y: x + 0.5 + turned.y };
  assert.equal(pieceAtPoint(world, turned, layout), piece.pieceId);
  moved = moveJigsawGroup(rotated, turned.groupId, { x: 20, y: 21, inTray: false });
  assert.equal(findGroup(moved, piece.pieceId).x, 20);
});

test('only adjacent pieces with the same rotation and nearby translation merge into rigid groups', () => {
  const layout = createJigsawLayout({ width: 24, height: 16, pieceSize: 8, seed: 'merge' });
  const baseGame = createJigsawWorkspace({ gameId: 'merge-game', source: source(24, 16), layout, seed: 'merge' });
  const game = { ...baseGame, groups: baseGame.groups.map((group) => ({ ...group, rotation: 0 })) };
  const ids = layout.pieces.map((piece) => piece.pieceId);
  let placed = moveJigsawGroup(game, findGroup(game, ids[0]).groupId, { x: 0, y: 0, inTray: false });
  placed = moveJigsawGroup(placed, findGroup(placed, ids[1]).groupId, { x: 3, y: 0, inTray: false });
  let result = snapJigsawGroup(placed, findGroup(placed, ids[1]).groupId, 5);
  assert.equal(result.merged, true); assert.equal(result.game.groups.length, ids.length - 1);
  assert.deepEqual(result.game.groups.find((group) => group.pieceIds.includes(ids[0])).pieceIds.sort(), [ids[0], ids[1]].sort());
  let chain = moveJigsawGroup(result.game, findGroup(result.game, ids[2]).groupId, { x: 4, y: 0, inTray: false });
  result = snapJigsawGroup(chain, findGroup(chain, ids[2]).groupId, 5);
  assert.equal(result.game.groups.find((group) => group.pieceIds.includes(ids[0])).pieceIds.length, 3);
  assert.equal(isJigsawWorkspaceComplete(result.game), false);

  const diagonal = createJigsawLayout({ width: 16, height: 16, pieceSize: 8, seed: 'diagonal' });
  const diagonalBase = createJigsawWorkspace({ gameId: 'diagonal-game', source: source(16, 16), layout: diagonal });
  const diagonalGame = { ...diagonalBase, groups: diagonalBase.groups.map((group) => ({ ...group, rotation: 0 })) };
  let wrong = moveJigsawGroup(diagonalGame, findGroup(diagonalGame, 'piece-0-0').groupId, { x: 0, y: 0, inTray: false });
  wrong = moveJigsawGroup(wrong, findGroup(wrong, 'piece-1-1').groupId, { x: 0, y: 0, inTray: false });
  let snap = snapJigsawGroup(wrong, findGroup(wrong, 'piece-1-1').groupId, 0);
  assert.equal(snap.merged, false, 'diagonal neighbors never merge');
  wrong = rotateJigsawGroup(wrong, findGroup(wrong, 'piece-0-1').groupId, 1);
  wrong = moveJigsawGroup(wrong, findGroup(wrong, 'piece-0-1').groupId, { x: 0, y: 0, inTray: false });
  snap = snapJigsawGroup(wrong, findGroup(wrong, 'piece-0-1').groupId, 0);
  assert.equal(snap.merged, false, 'wrong rotations never merge');
  assert.equal(snapJigsawGroup(diagonalGame, findGroup(diagonalGame, 'piece-0-1').groupId, 0).merged, false, 'tray groups do not merge');
});

test('completion needs one placed connected group containing every piece', () => {
  const layout = createJigsawLayout({ width: 16, height: 16, pieceSize: 8, seed: 'complete' });
  const base = createJigsawWorkspace({ gameId: 'complete-game', source: source(16, 16), layout });
  const allIds = layout.pieces.map((piece) => piece.pieceId);
  const solved = { ...base, groups: [{ groupId: 'group-solved', pieceIds: allIds, x: -5, y: 9, rotation: 3, inTray: false }] };
  assert.equal(isJigsawWorkspaceComplete(solved), true);
  assert.throws(() => validateJigsawWorkspace({ ...solved, groups: [
    { ...solved.groups[0], groupId: 'disconnected', pieceIds: [allIds[0], allIds[3]] },
    { groupId: 'other-a', pieceIds: [allIds[1]], x: 0, y: 0, rotation: 0, inTray: true },
    { groupId: 'other-b', pieceIds: [allIds[2]], x: 0, y: 0, rotation: 0, inTray: true }
  ] }), /グループ状態/);
});

test('legacy grid migration preserves the old game ID, source, and correct adjacent placements without mutating v1', () => {
  const old = {
    schemaVersion: 1, gameId: 'old-game', gridSize: 2, source: source(16, 16),
    pieces: Array.from({ length: 4 }, (_, correctCell) => ({ pieceId: `piece-${String(correctCell + 1).padStart(2, '0')}`, correctCell })),
    pieceOrder: ['piece-03', 'piece-01', 'piece-04', 'piece-02'], placements: [{ pieceId: 'piece-01', cell: 0 }, { pieceId: 'piece-02', cell: 1 }]
  };
  const before = structuredClone(old); const migrated = migrateLegacyJigsawGame(old, { width: 16, height: 16, seed: 'migration' });
  assert.equal(migrated.gameId, old.gameId); assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.source, old.source); assert.deepEqual(old, before);
  const oldLayout = createJigsawLayout({ width: 16, height: 16, legacyGridSize: 2, seed: 'migration' });
  assert.deepEqual(oldLayout.pieces.map(({ x, y, width, height }) => [x, y, width, height]), [[0, 0, 8, 8], [8, 0, 8, 8], [0, 8, 8, 8], [8, 8, 8, 8]]);
  const placed = migrated.groups.find((group) => !group.inTray);
  assert.deepEqual(placed.pieceIds, ['piece-01', 'piece-02']);
  assert.deepEqual(migrated.pieceOrder, old.pieceOrder);
  assert.throws(() => createJigsawLayout({ width: 7, height: 7, legacyGridSize: 4 }), /小さすぎます/);
});

test('layout construction rejects oversized dimensions and piece counts', () => {
  assert.throws(() => createJigsawLayout({ width: 200, height: 200, pieceSize: 3 }), /上限/);
  assert.throws(() => createJigsawLayout({ width: 32, height: 32, pieceSize: 3, maxPieces: 16 }), /上限/);
});
