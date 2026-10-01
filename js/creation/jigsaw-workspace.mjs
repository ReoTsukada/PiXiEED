import { validateJigsawSource, validateJigsawGame, JIGSAW_MAX_SOURCE_PIXELS } from './jigsaw-core.mjs?rev=20261001-free-tools-1';

const MAX_PIECES = 4096;
const MAX_POSE = 1e7;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const layoutCache = new Map();

function cacheKey(options) {
  return [options.width, options.height, options.pieceSize, String(options.seed ?? 'default'), options.legacyGridSize ?? '', options.maxPieces ?? MAX_PIECES].join(':');
}

function rememberLayout(key, layout) {
  layoutCache.delete(key); layoutCache.set(key, layout);
  while (layoutCache.size > 2) layoutCache.delete(layoutCache.keys().next().value);
  return layout;
}

function findCell(starts, value) {
  let low = 0; let high = starts.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (starts[mid] <= value) low = mid; else high = mid - 1; }
  return Math.min(starts.length - 1, low);
}

function assertDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 3 || height < 3 || width * height > JIGSAW_MAX_SOURCE_PIXELS) {
    throw new RangeError('画像サイズが上限外です');
  }
}

function assertSeed(seed) {
  if (typeof seed !== 'string' || seed.length < 1 || seed.length > 128) throw new TypeError('seedは1〜128文字の文字列が必要です');
  return seed;
}

function hashSeed(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0 || 1;
}

function randomFrom(seed) {
  let state = hashSeed(seed);
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function partition(length, size, legacyGridSize) {
  if (legacyGridSize) {
    const starts = Array.from({ length: legacyGridSize }, (_, i) => Math.floor(i * length / legacyGridSize));
    return { starts, count: legacyGridSize, end: length };
  }
  const count = Math.max(1, Math.floor(length / size));
  const result = Array.from({ length: count }, (_, i) => i * size);
  return { starts: result, count, end: length };
}

function profile(t) {
  if (t < 0.3 || t > 0.7) return 0;
  if (t < 0.4) return (t - 0.3) * 10;
  if (t <= 0.6) return 1;
  return (0.7 - t) * 10;
}

function edgeValue(base, start, end, at, sign, depth) {
  return base + sign * depth * profile((at - start) / (end - start));
}

function makePieceId(row, column) { return `piece-${row}-${column}`; }

export function createJigsawLayout({ width, height, pieceSize = 'auto', seed = 'default', maxPieces = MAX_PIECES, legacyGridSize } = {}) {
  assertDimensions(width, height);
  assertSeed(seed);
  if (!Number.isSafeInteger(maxPieces) || maxPieces < 1 || maxPieces > MAX_PIECES) throw new RangeError('ピース数上限が不正です');
  if (legacyGridSize !== undefined && ![2, 3, 4].includes(legacyGridSize)) throw new RangeError('旧盤面サイズが不正です');
  const targetSize = pieceSize === 'auto' ? Math.max(3, Math.floor(Math.max(width, height) / 8)) : pieceSize;
  if (!Number.isSafeInteger(targetSize) || targetSize < 3 || targetSize > Math.max(width, height)) throw new RangeError('ピース寸法が不正です');
  const key = cacheKey({ width, height, pieceSize: targetSize, seed, legacyGridSize, maxPieces });
  if (layoutCache.has(key)) { const cached = layoutCache.get(key); layoutCache.delete(key); layoutCache.set(key, cached); return cached; }
  const xp = partition(width, targetSize, legacyGridSize); const yp = partition(height, targetSize, legacyGridSize);
  const columns = xp.count; const rows = yp.count; const count = columns * rows;
  if (count > maxPieces) throw new RangeError('ピース数上限を超えています');
  const xs = [...xp.starts, width]; const ys = [...yp.starts, height];
  for (let i = 0; i < columns; i += 1) if (xs[i + 1] - xs[i] < 3) throw new RangeError('画像が古いピース境界に対して小さすぎます');
  for (let i = 0; i < rows; i += 1) if (ys[i + 1] - ys[i] < 3) throw new RangeError('画像が古いピース境界に対して小さすぎます');
  const depth = Math.max(1, Math.min(4, Math.floor(targetSize / 6)));
  const rand = randomFrom(seed);
  const tinyTabs = targetSize < 5 || xs.some((value, index) => index > 0 && value - xs[index - 1] < 5) || ys.some((value, index) => index > 0 && value - ys[index - 1] < 5);
  const seedParity = hashSeed(seed) & 1;
  const vertical = Array.from({ length: Math.max(0, columns - 1) }, (_, edge) => ({ x: xs[edge + 1], edge }));
  const horizontal = Array.from({ length: Math.max(0, rows - 1) }, (_, edge) => ({ y: ys[edge + 1], edge }));
  const owner = new Int32Array(width * height); owner.fill(-1);
  const tabPixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) owner[y * width + x] = findCell(ys, y) * columns + findCell(xs, x);
  // Transfer only a bounded central tab footprint from one cell to its neighbor.
  // Keeping the footprints away from corners preserves a connected body on tiny cells.
  for (let row = 0; row < rows; row += 1) for (let edgeIndex = 0; edgeIndex < vertical.length; edgeIndex += 1) {
    const edge = vertical[edgeIndex]; const y0 = ys[row]; const y1 = ys[row + 1];
    const sign = tinyTabs ? ((row + edgeIndex + seedParity) % 2 === 0 ? 1 : -1) : (rand() < 0.5 ? -1 : 1);
    for (let y = y0; y < y1; y += 1) {
      const boundary = y1 - y0 >= 3 ? edgeValue(edge.x, y0, y1, y + 0.5, sign, depth) : edge.x;
      const minX = Math.max(0, Math.floor(edge.x - depth - 1)); const maxX = Math.min(width - 1, Math.ceil(edge.x + depth + 1));
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5; const leftId = row * columns + edgeIndex; const rightId = leftId + 1;
        const pixelIndex = y * width + x;
        if (boundary > edge.x && px >= edge.x && px < boundary && owner[pixelIndex] === rightId) { owner[pixelIndex] = leftId; tabPixels[pixelIndex] = 1; }
        else if (boundary < edge.x && px >= boundary && px < edge.x && owner[pixelIndex] === leftId) { owner[pixelIndex] = rightId; tabPixels[pixelIndex] = 1; }
      }
    }
  }
  for (let edgeIndex = 0; edgeIndex < horizontal.length; edgeIndex += 1) for (let column = 0; column < columns; column += 1) {
    const edge = horizontal[edgeIndex]; const x0 = xs[column]; const x1 = xs[column + 1];
    const sign = tinyTabs ? ((edgeIndex + column + seedParity) % 2 === 0 ? -1 : 1) : (rand() < 0.5 ? -1 : 1);
    for (let x = x0; x < x1; x += 1) {
      const boundary = x1 - x0 >= 3 ? edgeValue(edge.y, x0, x1, x + 0.5, sign, depth) : edge.y;
      const minY = Math.max(0, Math.floor(edge.y - depth - 1)); const maxY = Math.min(height - 1, Math.ceil(edge.y + depth + 1));
      for (let y = minY; y <= maxY; y += 1) {
        const py = y + 0.5; const pixelIndex = y * width + x; const topId = edgeIndex * columns + column; const bottomId = topId + columns;
        if (tabPixels[pixelIndex]) continue;
        if (boundary > edge.y && py >= edge.y && py < boundary && owner[pixelIndex] === bottomId) { owner[pixelIndex] = topId; tabPixels[pixelIndex] = 1; }
        else if (boundary < edge.y && py >= boundary && py < edge.y && owner[pixelIndex] === topId) { owner[pixelIndex] = bottomId; tabPixels[pixelIndex] = 1; }
      }
    }
  }

  const pieces = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const index = row * columns + column;
    const x = xs[column]; const y = ys[row]; const right = xs[column + 1]; const bottom = ys[row + 1];
    const leftExtra = column > 0 ? depth : 0; const rightExtra = column < columns - 1 ? depth : 0;
    const topExtra = row > 0 ? depth : 0; const bottomExtra = row < rows - 1 ? depth : 0;
    const bounds = { x: x - leftExtra, y: y - topExtra, width: right - x + leftExtra + rightExtra, height: bottom - y + topExtra + bottomExtra };
    const mask = new Uint8Array(bounds.width * bounds.height);
    for (let py = Math.max(0, bounds.y); py < Math.min(height, bounds.y + bounds.height); py += 1) for (let px = Math.max(0, bounds.x); px < Math.min(width, bounds.x + bounds.width); px += 1) {
      if (owner[py * width + px] === index) mask[(py - bounds.y) * bounds.width + px - bounds.x] = 1;
    }
    const pieceId = legacyGridSize ? `piece-${String(index + 1).padStart(2, '0')}` : makePieceId(row, column);
    pieces.push({ pieceId, row, column, x, y, width: right - x, height: bottom - y, bounds, mask });
  }
  const neighborsById = new Map(pieces.map((piece) => [piece.pieceId, []]));
  const pieceAt = new Map(pieces.map((piece) => [`${piece.row}:${piece.column}`, piece.pieceId]));
  for (const piece of pieces) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = pieceAt.get(`${piece.row + dr}:${piece.column + dc}`);
      if (neighbor) neighborsById.get(piece.pieceId).push(neighbor);
    }
  }
  return rememberLayout(key, { width, height, pieceSize: targetSize, seed, ...(legacyGridSize ? { legacyGridSize } : {}), columns, rows, pieces, owner, neighborsById });
}

function rngShuffle(values, seed) {
  const rand = randomFrom(seed); const output = [...values];
  for (let i = output.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [output[i], output[j]] = [output[j], output[i]]; }
  if (output.length > 1 && output.every((v, i) => v === values[i])) output.push(output.shift());
  return output;
}

export function createJigsawWorkspace({ gameId, source, layout, seed = layout?.seed ?? 'default', viewport } = {}) {
  if (typeof gameId !== 'string' || !ID_RE.test(gameId)) throw new TypeError('パズルIDが不正です');
  assertSeed(seed);
  validateJigsawSource(source);
  if (!layout || !Number.isSafeInteger(layout.width) || !Number.isSafeInteger(layout.height) || !Number.isSafeInteger(layout.pieceSize) || !Number.isSafeInteger(layout.columns) || !Number.isSafeInteger(layout.rows)) throw new TypeError('盤面が不正です');
  const fullLayout = materializeLayout(layout);
  const ids = fullLayout.pieces.map((piece) => piece.pieceId);
  const order = rngShuffle(ids, `${gameId}:${seed}`);
  const rand = randomFrom(`${seed}:${gameId}:poses`);
  const groups = ids.map((pieceId, index) => ({ groupId: `group-${pieceId}`, pieceIds: [pieceId], x: 0, y: 0, rotation: Math.floor(rand() * 4), inTray: true }));
  return validateJigsawWorkspace({ schemaVersion: 2, gameId, source, layout: { width: fullLayout.width, height: fullLayout.height, pieceSize: fullLayout.pieceSize, seed: fullLayout.seed, ...(fullLayout.legacyGridSize ? { legacyGridSize: fullLayout.legacyGridSize } : {}), columns: fullLayout.columns, rows: fullLayout.rows }, pieceOrder: order, groups, ...(viewport === undefined ? {} : { viewport }) }, fullLayout);
}

/** Preserve v1 history by returning a new v2 value under the same draft ID. */
export function migrateLegacyJigsawGame(saved, { width, height, seed = 'legacy' } = {}) {
  validateJigsawGame(saved);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || ![2, 3, 4].includes(saved.gridSize)) throw new TypeError('旧パズルの画像サイズが不正です');
  const layout = createJigsawLayout({ width, height, pieceSize: 'auto', seed, legacyGridSize: saved.gridSize });
  const game = createJigsawWorkspace({ gameId: saved.gameId, source: saved.source, layout, seed });
  const pieceById = new Map(layout.pieces.map((piece) => [piece.pieceId, piece]));
  const cellOrigin = (cell) => {
    const row = Math.floor(cell / saved.gridSize); const column = cell % saved.gridSize;
    return { x: Math.floor(column * width / saved.gridSize), y: Math.floor(row * height / saved.gridSize) };
  };
  const placed = new Map();
  for (const placement of saved.placements) {
    const piece = saved.pieces.find((item) => item.pieceId === placement.pieceId);
    const original = pieceById.get(piece.pieceId); const destination = cellOrigin(placement.cell);
    const key = `${destination.x - original.x}:${destination.y - original.y}`;
    if (!placed.has(key)) placed.set(key, []);
    placed.get(key).push(original.pieceId);
  }
  const newGroups = game.groups.filter((group) => !saved.placements.some((placement) => placement.pieceId === group.pieceIds[0]));
  for (const [key, members] of placed) {
    const pending = new Set(members); const [x, y] = key.split(':').map(Number);
    while (pending.size) {
      const first = pending.values().next().value; const component = [first]; pending.delete(first);
      for (let index = 0; index < component.length; index += 1) {
        for (const candidate of [...pending]) {
          if (adjacent([component[index]], [candidate], layout)) { component.push(candidate); pending.delete(candidate); }
        }
      }
      component.sort();
      newGroups.push({ groupId: `group-${component[0]}`, pieceIds: component, x, y, rotation: 0, inTray: false });
    }
  }
  const migrated = { ...game, pieceOrder: [...saved.pieceOrder], groups: newGroups };
  return validateJigsawWorkspace(migrated, layout);
}

function materializeLayout(layout) {
  if (!layout) throw new TypeError('盤面が不正です');
  return createJigsawLayout({ width: layout.width, height: layout.height, pieceSize: layout.pieceSize, seed: layout.seed, legacyGridSize: layout.legacyGridSize });
}

function validateLayout(layout) {
  if (!layout || !Number.isSafeInteger(layout.width) || !Number.isSafeInteger(layout.height)) throw new TypeError('盤面が不正です');
  assertDimensions(layout.width, layout.height);
  if (!Number.isSafeInteger(layout.columns) || !Number.isSafeInteger(layout.rows) || layout.columns < 1 || layout.rows < 1 || layout.columns * layout.rows > MAX_PIECES || !Array.isArray(layout.pieces) || layout.pieces.length !== layout.columns * layout.rows) throw new TypeError('ピース配置が不正です');
}

function isConnected(ids, layout) {
  if (ids.length < 2) return true;
  const neighborsById = layout.neighborsById;
  const set = new Set(ids); const seen = new Set([ids[0]]); const queue = [ids[0]];
  while (queue.length) {
    const id = queue.pop();
    for (const neighbor of neighborsById.get(id) ?? []) {
      if (neighbor && set.has(neighbor) && !seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
    }
  }
  return seen.size === ids.length;
}

export function validateJigsawWorkspace(game, suppliedLayout) {
  if (!game || game.schemaVersion !== 2 || typeof game.gameId !== 'string' || !ID_RE.test(game.gameId)) throw new TypeError('ワークスペースが不正です');
  validateJigsawSource(game.source);
  const layout = materializeLayout(suppliedLayout ?? game.layout);
  validateLayout(layout);
  if (game.layout.width !== layout.width || game.layout.height !== layout.height || game.layout.pieceSize !== layout.pieceSize || game.layout.seed !== layout.seed || (game.layout.legacyGridSize ?? null) !== (layout.legacyGridSize ?? null) || game.layout.columns !== layout.columns || game.layout.rows !== layout.rows) throw new TypeError('保存された盤面と画像サイズが一致しません');
  if (game.source.width !== undefined && game.source.width !== layout.width || game.source.height !== undefined && game.source.height !== layout.height) throw new TypeError('元画像と盤面のサイズが一致しません');
  if (game.viewport !== undefined && (!game.viewport || typeof game.viewport !== 'object' || Array.isArray(game.viewport) || Object.keys(game.viewport).some((key) => !['scale', 'x', 'y'].includes(key)) || !Number.isFinite(game.viewport.scale) || game.viewport.scale < 0.2 || game.viewport.scale > 12 || !Number.isFinite(game.viewport.x) || !Number.isFinite(game.viewport.y) || Math.abs(game.viewport.x) > 4 || Math.abs(game.viewport.y) > 4)) throw new TypeError('表示位置が不正です');
  const ids = layout.pieces.map((piece) => piece.pieceId); const idSet = new Set(ids);
  if (idSet.size !== ids.length || !Array.isArray(game.pieceOrder) || game.pieceOrder.length !== ids.length || new Set(game.pieceOrder).size !== ids.length || game.pieceOrder.some((id) => !idSet.has(id)) || !Array.isArray(game.groups)) throw new TypeError('ピース一覧が不正です');
  const groups = new Set(); const seen = new Set();
  for (const group of game.groups) {
    if (!group || typeof group.groupId !== 'string' || !ID_RE.test(group.groupId) || groups.has(group.groupId) || !Array.isArray(group.pieceIds) || !group.pieceIds.length || new Set(group.pieceIds).size !== group.pieceIds.length || group.pieceIds.some((id) => !idSet.has(id) || seen.has(id)) || !Number.isFinite(group.x) || !Number.isFinite(group.y) || Math.abs(group.x) > MAX_POSE || Math.abs(group.y) > MAX_POSE || !Number.isInteger(group.rotation) || group.rotation < 0 || group.rotation > 3 || typeof group.inTray !== 'boolean' || !isConnected(group.pieceIds, layout)) throw new TypeError('グループ状態が不正です');
    groups.add(group.groupId); group.pieceIds.forEach((id) => seen.add(id));
  }
  if (seen.size !== ids.length) throw new TypeError('各ピースは一度だけ所属する必要があります');
  return game;
}

function rotatePoint(x, y, q) {
  switch (((q % 4) + 4) % 4) { case 1: return [-y, x]; case 2: return [-x, -y]; case 3: return [y, -x]; default: return [x, y]; }
}

function boundsFor(group, layout) {
  const members = new Set(group.pieceIds); const corners = [];
  for (const piece of layout.pieces) if (members.has(piece.pieceId)) {
    const b = piece.bounds ?? { x: piece.x, y: piece.y, width: piece.width, height: piece.height };
    for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) corners.push(rotatePoint(x, y, group.rotation));
  }
  const xs = corners.map(([x]) => x); const ys = corners.map(([, y]) => y);
  const left = Math.min(...xs) + group.x; const top = Math.min(...ys) + group.y;
  return { x: left, y: top, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export function worldGroupBounds(group, layout) { return boundsFor(group, materializeLayout(layout)); }

export function moveJigsawGroup(game, groupId, { x, y, inTray = false } = {}) {
  validateJigsawWorkspace(game);
  if (!Number.isFinite(x) || !Number.isFinite(y) || typeof inTray !== 'boolean') throw new TypeError('移動位置が不正です');
  const found = game.groups.find((group) => group.groupId === groupId);
  if (!found) throw new RangeError('グループがありません');
  const groups = game.groups.map((group) => group === found ? { ...group, x, y, inTray } : group);
  return validateJigsawWorkspace({ ...game, groups });
}

export function rotateJigsawGroup(game, groupId, quarters = 1) {
  validateJigsawWorkspace(game);
  if (!Number.isInteger(quarters)) throw new TypeError('回転量が不正です');
  const group = game.groups.find((item) => item.groupId === groupId);
  if (!group) throw new RangeError('グループがありません');
  const fullLayout = materializeLayout(game.layout);
  const before = boundsFor(group, fullLayout); const rotation = ((group.rotation + quarters) % 4 + 4) % 4;
  const rotated = { ...group, rotation, inTray: group.inTray };
  const after = boundsFor(rotated, fullLayout);
  rotated.x += before.x + before.width / 2 - after.x - after.width / 2;
  rotated.y += before.y + before.height / 2 - after.y - after.height / 2;
  const groups = game.groups.map((item) => item === group ? rotated : item);
  return validateJigsawWorkspace({ ...game, groups });
}

function adjacent(a, b, layout) {
  const occupied = new Set(b);
  for (const aid of a) {
    for (const neighbor of layout.neighborsById.get(aid) ?? []) {
      if (neighbor && occupied.has(neighbor)) return true;
    }
  }
  return false;
}

function adjacentToSet(pieceIds, targetIds, layout) {
  for (const id of pieceIds) for (const neighbor of layout.neighborsById.get(id) ?? []) if (targetIds.has(neighbor)) return true;
  return false;
}

export function snapJigsawGroup(game, groupId, tolerance = 8) {
  validateJigsawWorkspace(game);
  const layout = materializeLayout(game.layout);
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > Math.max(game.layout.width, game.layout.height)) throw new RangeError('吸着距離が不正です');
  const moving = game.groups.find((item) => item.groupId === groupId);
  if (!moving) throw new RangeError('グループがありません');
  if (moving.inTray) return { game, merged: false, groupId };
  const candidates = game.groups.filter((other) => other !== moving && !other.inTray && other.rotation === moving.rotation && adjacent(moving.pieceIds, other.pieceIds, layout));
  const stationary = candidates.find((other) => Math.hypot(other.x - moving.x, other.y - moving.y) <= tolerance);
  if (!stationary) return { game, merged: false, groupId };
  const targetX = stationary.x; const targetY = stationary.y; const rotation = stationary.rotation;
  const connectedIds = new Set([...stationary.pieceIds, ...moving.pieceIds]);
  const removed = new Set([stationary.groupId, moving.groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of game.groups) {
      if (removed.has(candidate.groupId) || candidate.inTray || candidate.rotation !== rotation || Math.hypot(candidate.x - targetX, candidate.y - targetY) > tolerance || !adjacentToSet(candidate.pieceIds, connectedIds, layout)) continue;
      candidate.pieceIds.forEach((id) => connectedIds.add(id)); removed.add(candidate.groupId); changed = true;
    }
  }
  const groupIds = [...connectedIds].sort(); const mergedGroupId = `group-${groupIds[0]}`;
  const merged = { groupId: mergedGroupId, pieceIds: groupIds, x: targetX, y: targetY, rotation, inTray: false };
  const groups = game.groups.filter((item) => !removed.has(item.groupId)); groups.push(merged);
  const next = validateJigsawWorkspace({ ...game, groups });
  return { game: next, merged: true, groupId: mergedGroupId };
}

export function isJigsawWorkspaceComplete(game) {
  validateJigsawWorkspace(game);
  return game.groups.length === 1 && !game.groups[0].inTray && game.groups[0].pieceIds.length === game.pieceOrder.length;
}

export function pieceAtPoint(point, group, layout) {
  layout = materializeLayout(layout);
  validateLayout(layout);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !group || group.inTray || !Array.isArray(group.pieceIds)) return null;
  const [sx, sy] = rotatePoint(point.x - group.x, point.y - group.y, (4 - group.rotation) % 4);
  const x = Math.floor(sx); const y = Math.floor(sy);
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return null;
  const owner = layout.owner?.[y * layout.width + x];
  if (!Number.isInteger(owner)) return null;
  const piece = layout.pieces[owner];
  if (!group.pieceIds.includes(piece?.pieceId)) return null;
  const b = piece.bounds; const mx = x - b.x; const my = y - b.y;
  return piece.mask[my * b.width + mx] ? piece.pieceId : null;
}

export function sliceJigsawPieces({ width, height, rgba }, layout) {
  validateLayout(layout);
  if (width !== layout.width || height !== layout.height || !ArrayBuffer.isView(rgba) || rgba.BYTES_PER_ELEMENT !== 1 || rgba.length !== width * height * 4) throw new TypeError('画素データが不正です');
  return layout.pieces.map((piece) => {
    const { x, y, width: w, height: h } = piece.bounds; const output = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) {
      if (!piece.mask[py * w + px]) continue;
      const sx = x + px; const sy = y + py;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const si = (sy * width + sx) * 4; const di = (py * w + px) * 4;
      output.set(rgba.subarray(si, si + 4), di);
    }
    return { ...piece, rgba: output };
  });
}

export function reassembleJigsawPieces(image, layout, pieces) {
  validateLayout(layout);
  if (!image || image.width !== layout.width || image.height !== layout.height || !Array.isArray(pieces) || pieces.length !== layout.pieces.length) throw new TypeError('再組立て入力が不正です');
  const byId = new Map(pieces.map((piece) => [piece?.pieceId, piece]));
  if (byId.size !== layout.pieces.length || layout.pieces.some((piece) => !byId.has(piece.pieceId))) throw new TypeError('ピースが欠けているか重複しています');
  const output = new Uint8ClampedArray(layout.width * layout.height * 4);
  for (const piece of layout.pieces) {
    const data = byId.get(piece.pieceId); const b = piece.bounds;
    if (!(data.rgba instanceof Uint8Array || data.rgba instanceof Uint8ClampedArray) || data.rgba.length !== b.width * b.height * 4) throw new TypeError('ピース画素データが不正です');
    for (let y = 0; y < b.height; y += 1) for (let x = 0; x < b.width; x += 1) {
      if (!piece.mask[y * b.width + x]) continue;
      const sx = b.x + x; const sy = b.y + y;
      if (sx < 0 || sy < 0 || sx >= layout.width || sy >= layout.height) continue;
      const si = (y * b.width + x) * 4; const di = (sy * layout.width + sx) * 4;
      output.set(data.rgba.subarray(si, si + 4), di);
    }
  }
  return output;
}
