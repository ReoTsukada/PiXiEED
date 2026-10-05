/**
 * Small, dependency-free tilemap validator and cached canvas renderer for the room prototype.
 * Tilemap JSON uses a 0-based pixel origin, with tile IDs >= 1 mapped to tileset index id - 1.
 */
const MAX_DIMENSION = 256;
const MAX_CELLS = 65_536;
const MAX_CANVAS_PIXELS = 16_777_216;
const FALLBACK_COLORS = {
  'wood-floor': ['#c89768', '#bd895d', '#d0a072'],
  'plaster-wall': ['#f0e6cf', '#e8dcc1'],
  'wall-trim': ['#765340', '#936646'],
  'window-frame': ['#536b69', '#e5cf9a'],
  'window-glass': ['#a9c6ba', '#c5d4bf'],
  'window-light': ['#e7c977', '#f3df9f'],
  'shelf-back': ['#7c5943', '#886149'],
  'shelf-rail': ['#c78e5b', '#684836'],
  'book-red': ['#b85442', '#e5cfa9'],
  'book-green': ['#557967', '#ddcba8'],
  'book-blue': ['#5b7880', '#ead7ae'],
  'book-gold': ['#c89f4f', '#73513c'],
  'counter-front': ['#79543e', '#916546'],
  'counter-top': ['#c79260', '#edd8aa'],
  'plant-leaf': ['#4e765c', '#82a36d'],
  'plant-pot': ['#ae5945', '#d28b60'],
  rug: ['#6d8375', '#8c9a7e'],
  'rug-edge': ['#d4b16e', '#c79c5d'],
  'wall-art': ['#66847a', '#d7ad5e'],
};
const BOOK_KEYS = new Set(['book-red', 'book-green', 'book-blue', 'book-gold']);

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Return true only when all dimensions, tile references, layer grids, and collision cells are valid. */
export function validateTilemap(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  const { tileSize, width, height, tileset, tiles, layers, collision } = candidate;
  if (!integer(tileSize, 1, 128) || !integer(width, 1, MAX_DIMENSION)
      || !integer(height, 1, MAX_DIMENSION) || width * height > MAX_CELLS
      || width * height * tileSize * tileSize > MAX_CANVAS_PIXELS) return false;
  if (!tileset || !integer(tileset.columns, 1, 64)
      || !(tileset.src === null || (typeof tileset.src === 'string' && tileset.src.startsWith('/assets/books/')))) return false;
  if (!Array.isArray(tiles) || !Array.isArray(layers) || layers.length < 1 || layers.length > 16) return false;

  const ids = new Set();
  for (const tile of tiles) {
    if (!tile || !integer(tile.id, 1, 65_535) || ids.has(tile.id)
        || typeof tile.key !== 'string' || !tile.key || typeof tile.label !== 'string') return false;
    ids.add(tile.id);
  }

  const layerNames = new Set();
  for (const layer of layers) {
    if (!layer || typeof layer.name !== 'string' || !layer.name || layerNames.has(layer.name)
        || !Array.isArray(layer.rows) || layer.rows.length !== height) return false;
    layerNames.add(layer.name);
    for (const row of layer.rows) {
      if (!Array.isArray(row) || row.length !== width) return false;
      for (const id of row) if (!integer(id, 0, 65_535) || (id !== 0 && !ids.has(id))) return false;
    }
  }

  if (!Array.isArray(collision) || collision.length !== height) return false;
  for (const row of collision) {
    if (!Array.isArray(row) || row.length !== width) return false;
    for (const solid of row) if (solid !== 0 && solid !== 1) return false;
  }
  return true;
}

/** Return a detached, normalized plain-data copy or throw TypeError when invalid. */
export function normalizeTilemap(candidate) {
  if (!validateTilemap(candidate)) throw new TypeError('Invalid room tilemap');
  return {
    tileSize: candidate.tileSize,
    width: candidate.width,
    height: candidate.height,
    tileset: { src: candidate.tileset.src, columns: candidate.tileset.columns },
    tiles: candidate.tiles.map(({ id, key, label, solid }) => ({ id, key, label, ...(solid === undefined ? {} : { solid: Boolean(solid) }) })),
    layers: candidate.layers.map(({ name, rows }) => ({ name, rows: rows.map((row) => [...row]) })),
    collision: candidate.collision.map((row) => [...row]),
  };
}

function paintFallback(context, key, x, y, size, variant) {
  const palette = FALLBACK_COLORS[key] || ['#b9a88a', '#766b59'];
  const cell = (color, px, py, pw, ph) => {
    context.fillStyle = color;
    context.fillRect(x + px, y + py, pw, ph);
  };
  const a = palette[variant % palette.length];
  const b = palette[(variant + 1) % palette.length];
  const u = size / 16;
  const rect = (color, px, py, pw, ph) => cell(color, Math.round(px * u), Math.round(py * u), Math.max(1, Math.round(pw * u)), Math.max(1, Math.round(ph * u)));

  context.fillStyle = a;
  context.fillRect(x, y, size, size);
  switch (key) {
    case 'wood-floor':
      rect(b, 0, variant % 2 ? 3 : 11, 16, 1);
      rect('#e1b583', variant % 3 * 5, 4, 1, 6);
      rect('#96694d', (variant % 3) * 4 + 2, 5, 1, 2);
      break;
    case 'plaster-wall':
      rect(b, 2, 3, 1, 1); rect(b, 11, 9, 2, 1); rect('#f7eedc', 5, 12, 3, 1);
      break;
    case 'wall-trim':
      rect('#b98455', 0, 2, 16, 3); rect('#563e32', 0, 14, 16, 2);
      break;
    case 'window-frame':
      rect('#d4b77f', 2, 2, 12, 12); rect('#526b68', 4, 4, 8, 8); rect('#a6c6bb', 5, 5, 6, 6);
      rect('#526b68', 7, 4, 2, 8); rect('#526b68', 4, 7, 8, 2);
      break;
    case 'window-glass':
      rect('#b9d0c2', 0, 0, 16, 16); rect('#e7d49f', 2, 2, 4, 3); rect('#91b0a6', 9, 8, 5, 5);
      break;
    case 'window-light':
      rect('#f1d98e', 1, 2, 14, 12); rect('#fff0b8', 3, 4, 4, 3); rect('#dfbd68', 9, 9, 4, 3);
      break;
    case 'shelf-back':
      rect('#9a6e4f', 1, 1, 14, 14); rect('#b07d56', 2, 2, 1, 12);
      break;
    case 'shelf-rail':
      rect('#e0ad70', 0, 1, 16, 4); rect('#80563e', 0, 5, 16, 3); rect('#5f4537', 1, 9, 14, 2);
      break;
    case 'book-red': case 'book-green': case 'book-blue': case 'book-gold':
      rect('#4e3b31', 2, 1, 12, 14); rect(a, 3, 1, 10, 13); rect(b, 5, 2, 2, 10); rect('#f0d8a8', 4, 12, 8, 1);
      break;
    case 'counter-front':
      rect('#a27450', 1, 1, 14, 3); rect('#664937', 2, 5, 12, 9); rect('#956847', 4, 6, 2, 7);
      break;
    case 'counter-top':
      rect('#f0d3a0', 0, 3, 16, 4); rect('#a9764c', 0, 7, 16, 3); rect('#694938', 1, 10, 14, 3);
      break;
    case 'plant-leaf':
      rect('#3f684f', 6, 8, 4, 7); rect('#83a86f', 2, 3, 5, 4); rect('#4f7959', 1, 4, 5, 5);
      rect('#9bb77a', 9, 1, 5, 4); rect('#547d5c', 9, 4, 6, 5); rect('#739765', 5, 0, 5, 4);
      break;
    case 'plant-pot':
      rect('#e0a774', 2, 2, 12, 3); rect('#ae5945', 3, 5, 10, 8); rect('#754a3b', 4, 13, 8, 2);
      break;
    case 'rug':
      rect('#a4aa87', 2, 2, 12, 12); rect('#83917d', 4, 4, 8, 8);
      break;
    case 'rug-edge':
      rect('#e1c27c', 0, 0, 16, 16); rect('#788878', 2, 2, 12, 12); rect('#d7b66e', 4, 4, 8, 8);
      break;
    case 'wall-art':
      rect('#d5bd87', 1, 1, 14, 14); rect('#536b69', 3, 3, 10, 10); rect('#e8c46e', 5, 5, 6, 6);
      break;
    default:
      rect(b, 2, 2, 12, 12);
  }
}

/**
 * Create one cached canvas for the whole map. `tilesetImage` is optional and should be loaded by the caller.
 * Canvas creation is browser-only; the validator/normalizer are safe to import in a Node test.
 */
export function createTilemapRenderer(input, tilesetImage = null) {
  const map = normalizeTilemap(input);
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('Tilemap rendering requires a browser canvas');
  }
  const canvas = document.createElement('canvas');
  canvas.width = map.width * map.tileSize;
  canvas.height = map.height * map.tileSize;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#f0e6cf';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const tileById = new Map(map.tiles.map((tile) => [tile.id, tile]));
  const sheetReady = Boolean(tilesetImage && tilesetImage.complete !== false
    && Number(tilesetImage.naturalWidth || tilesetImage.width) >= map.tileSize
    && Number(tilesetImage.naturalHeight || tilesetImage.height) >= map.tileSize);
  const sheetWidth = sheetReady ? Number(tilesetImage.naturalWidth || tilesetImage.width) : 0;
  const sheetHeight = sheetReady ? Number(tilesetImage.naturalHeight || tilesetImage.height) : 0;

  for (const layer of map.layers) {
    for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
      const row = layer.rows[rowIndex];
      for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
        const id = row[columnIndex];
        if (id === 0) continue;
        const tile = tileById.get(id);
        const sourceIndex = id - 1;
        const sourceX = (sourceIndex % map.tileset.columns) * map.tileSize;
        const sourceY = Math.floor(sourceIndex / map.tileset.columns) * map.tileSize;
        const x = columnIndex * map.tileSize;
        const y = rowIndex * map.tileSize;
        if (sheetReady && sourceX + map.tileSize <= sheetWidth && sourceY + map.tileSize <= sheetHeight) {
          context.drawImage(tilesetImage, sourceX, sourceY, map.tileSize, map.tileSize, x, y, map.tileSize, map.tileSize);
        } else {
          paintFallback(context, tile.key, x, y, map.tileSize, (columnIndex * 7 + rowIndex * 3 + id) % 5);
        }
      }
    }
  }

  const isSolidPixel = (x, y) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return true;
    return map.collision[Math.floor(y / map.tileSize)][Math.floor(x / map.tileSize)] === 1;
  };
  const canStandAt = (x, y, radius = 0) => {
    if (![x, y, radius].every(Number.isFinite) || radius < 0 || radius > map.tileSize * 8) return false;
    if (radius === 0) return !isSolidPixel(x, y);
    const diagonal = radius * Math.SQRT1_2;
    const offsets = [
      [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [diagonal, diagonal], [diagonal, -diagonal], [-diagonal, diagonal], [-diagonal, -diagonal],
    ];
    return offsets.every(([dx, dy]) => !isSolidPixel(x + dx, y + dy));
  };

  return Object.freeze({
    canvas,
    width: canvas.width,
    height: canvas.height,
    tileSize: map.tileSize,
    columns: map.width,
    rows: map.height,
    canStandAt,
  });
}
