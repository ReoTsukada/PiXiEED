import { strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20261001-animation-1';
import { pixelLineCells } from './pixel-input.mjs?rev=20261001-connected-editor-1';
import { symmetryPoints } from './drawing-symmetry.mjs';
import { visitOpaqueDrawSelection } from './draw-selection-operations.mjs';

const MAX_SIDE = 512;
const MAX_COORDINATE_FACTOR = 4;

function validDimensions(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= MAX_SIDE && height <= MAX_SIDE;
}

function boundedPoints(from, to, width, height) {
  if (!from || !to || ![from.x, from.y, to.x, to.y].every(Number.isFinite)) return null;
  const x0 = Math.floor(from.x); const y0 = Math.floor(from.y);
  const x1 = Math.floor(to.x); const y1 = Math.floor(to.y);
  const limit = Math.max(width, height) * MAX_COORDINATE_FACTOR;
  if ([x0, y0, x1, y1].some((coordinate) => !Number.isSafeInteger(coordinate) || Math.abs(coordinate) > limit)) return null;
  return { x0, y0, x1, y1, minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1) };
}

function validateValue(document, value) {
  if (!Number.isInteger(value) || value < -1 || value >= document.palette.length) throw new TypeError('Invalid pixel value');
}

function combineSymmetry(symmetry, mirror) {
  if (!symmetry || typeof symmetry !== 'object' || Array.isArray(symmetry)) throw new TypeError('Symmetry options must be an object');
  return { ...symmetry, horizontal: mirror || symmetry.horizontal === true };
}

function paintCells(document, cells, value, tracker) {
  const changed = [];
  for (const index of cells) {
    const x = index % document.width; const y = Math.floor(index / document.width);
    changed.push(...strokePixels(document, { x, y }, { x, y }, value, { trusted: true, tracker }));
  }
  return Uint32Array.from(changed);
}

/** Draw a normalized, inclusive rectangle or ellipse and return the changed pixel indices. */
export function drawShapePixels(document, from, to, value, { shape = 'rectangle', filled = false, mirror = false, symmetry = {}, tracker = null } = {}) {
  validateDrawDocument(document);
  validateValue(document, value);
  if (shape !== 'rectangle' && shape !== 'ellipse') throw new RangeError('Shape must be rectangle or ellipse');
  if (typeof filled !== 'boolean' || typeof mirror !== 'boolean') throw new TypeError('Shape options must be boolean');
  const symmetryFlags = combineSymmetry(symmetry, mirror);
  const hasSymmetry = symmetryFlags.horizontal || symmetryFlags.vertical || symmetryFlags.diagonalDown || symmetryFlags.diagonalUp;
  const points = boundedPoints(from, to, document.width, document.height);
  if (!points) return new Uint32Array(0);

  const { minX, maxX, minY, maxY } = points;
  const left = Math.max(0, minX); const right = Math.min(document.width - 1, maxX);
  const top = Math.max(0, minY); const bottom = Math.min(document.height - 1, maxY);
  if (left > right || top > bottom) return new Uint32Array(0);
  const width = maxX - minX + 1; const height = maxY - minY + 1;
  const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
  const radiusX = (width - 1) / 2; const radiusY = (height - 1) / 2;
  const ellipseRow = (y) => {
    if (y < minY || y > maxY) return null;
    if (width <= 2 || height <= 2) return { left: minX, right: maxX };
    const vertical = (y - centerY) / radiusY;
    const span = radiusX * Math.sqrt(Math.max(0, 1 - vertical * vertical));
    return { left: Math.max(minX, Math.floor(centerX - span)), right: Math.min(maxX, Math.ceil(centerX + span)) };
  };
  const cells = new Set();
  for (let y = top; y <= bottom; y += 1) {
    const row = shape === 'ellipse' ? ellipseRow(y) : { left: minX, right: maxX };
    if (!row) continue;
    const rowLeft = Math.max(left, row.left); const rowRight = Math.min(right, row.right);
    if (rowLeft > rowRight) continue;
    const above = shape === 'ellipse' && !filled ? ellipseRow(y - 1) : null;
    const below = shape === 'ellipse' && !filled ? ellipseRow(y + 1) : null;
    for (let x = rowLeft; x <= rowRight; x += 1) {
      let include;
      if (shape === 'rectangle') {
        include = filled || x === minX || x === maxX || y === minY || y === maxY;
      } else {
        include = filled || x === row.left || x === row.right
          || !above || x < above.left || x > above.right
          || !below || x < below.left || x > below.right;
      }
      if (!include) continue;
      if (hasSymmetry) {
        for (const point of symmetryPoints({ x, y }, document.width, document.height, symmetryFlags)) {
          cells.add(point.y * document.width + point.x);
        }
      } else cells.add(y * document.width + x);
    }
  }
  return paintCells(document, cells, value, tracker);
}

/** Spray deterministic-injectable dots along a line, with a bounded circular brush radius. */
export function sprayPixels(document, from, to, value, { radius = 2, random = Math.random, mirror = false, symmetry = {}, tracker = null } = {}) {
  validateDrawDocument(document);
  validateValue(document, value);
  if (!Number.isFinite(radius) || !Number.isInteger(radius) || radius < 0 || radius > 16) throw new RangeError('Spray radius must be an integer from 0 to 16');
  if (typeof random !== 'function' || typeof mirror !== 'boolean') throw new TypeError('Invalid spray options');
  const symmetryFlags = combineSymmetry(symmetry, mirror);
  const hasSymmetry = symmetryFlags.horizontal || symmetryFlags.vertical || symmetryFlags.diagonalDown || symmetryFlags.diagonalUp;
  const points = boundedPoints(from, to, document.width, document.height);
  if (!points) return new Uint32Array(0);
  const cells = new Set();
  const sampleCount = radius === 0 ? 1 : Math.min(24, Math.max(1, Math.ceil(Math.PI * radius * radius / 2)));
  const unitRandom = () => {
    const value = Number(random());
    return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
  };
  for (const { x, y } of pixelLineCells({ x: points.x0, y: points.y0 }, { x: points.x1, y: points.y1 })) {
    for (let sample = 0; sample < sampleCount; sample += 1) {
      let px = x; let py = y;
      if (radius > 0) {
        const angle = unitRandom() * Math.PI * 2;
        const distance = Math.sqrt(unitRandom()) * radius;
        px = Math.floor(x + Math.cos(angle) * distance + 0.5);
        py = Math.floor(y + Math.sin(angle) * distance + 0.5);
      }
      if (px < 0 || py < 0 || px >= document.width || py >= document.height) continue;
      if (hasSymmetry) {
        for (const point of symmetryPoints({ x: px, y: py }, document.width, document.height, symmetryFlags)) {
          cells.add(point.y * document.width + point.x);
        }
      } else cells.add(py * document.width + px);
    }
  }
  return paintCells(document, cells, value, tracker);
}

/** Return an inclusive drag rectangle clipped to the canvas, or null when it misses. */
export function selectionBounds(from, to, width, height) {
  if (!validDimensions(width, height)) return null;
  const points = boundedPoints(from, to, width, height);
  if (!points) return null;
  const x = Math.max(0, points.minX); const y = Math.max(0, points.minY);
  const right = Math.min(width - 1, points.maxX); const bottom = Math.min(height - 1, points.maxY);
  if (x > right || y > bottom) return null;
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
}

function validatedBounds(bounds, width, height) {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger)
      || bounds.x < 0 || bounds.y < 0 || bounds.width < 1 || bounds.height < 1
      || bounds.x + bounds.width > width || bounds.y + bounds.height > height) throw new RangeError('Selection bounds must fit the active canvas');
  return bounds;
}

/** Move only opaque cells from the original snapshot; holes preserve destination artwork. */
export function moveSelectionPixels(document, originalPixels, bounds, dx, dy, { tracker = null } = {}) {
  validateDrawDocument(document);
  validatedBounds(bounds, document.width, document.height);
  if (!originalPixels || originalPixels.length !== document.pixels.length) throw new TypeError('Selection snapshot does not match the active document');
  if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) || Math.abs(dx) > document.width * MAX_COORDINATE_FACTOR || Math.abs(dy) > document.height * MAX_COORDINATE_FACTOR) throw new RangeError('Selection movement is outside the supported bounds');
  for (const value of originalPixels) if (!Number.isInteger(value) || value < -1 || value >= document.palette.length) throw new TypeError('Selection snapshot contains an invalid pixel');

  const destination = new Map();
  const source = (x, y) => originalPixels[(bounds.y + y) * document.width + bounds.x + x];
  visitOpaqueDrawSelection(source, bounds.width, bounds.height, bounds, document.width, document.height, index => destination.set(index, -1), { transparent: -1 });
  visitOpaqueDrawSelection(source, bounds.width, bounds.height, { x: bounds.x + dx, y: bounds.y + dy }, document.width, document.height, (index, value) => destination.set(index, value), { transparent: -1 });
  return applyDestination(document, destination, tracker);
}

function applyDestination(document, destination, tracker) {
  const changed = [];
  for (const [index, value] of destination) {
    const x = index % document.width; const y = Math.floor(index / document.width);
    changed.push(...strokePixels(document, { x, y }, { x, y }, value, { trusted: true, tracker }));
  }
  return Uint32Array.from(changed);
}
