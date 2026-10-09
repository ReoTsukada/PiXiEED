// Small, defensive helpers for the home canvas. Saved coordinates are normalized so
// a drawing survives a change between portrait and landscape grids.
export const HOME_PLAY_STORAGE_KEY = 'pixieed:home-play:v1';
export const HOME_PLAY_MAX_CELLS = 20_000;
export const HOME_PLAY_MAX_HISTORY = 20;

export function captureHomePlayState({ width, height, floor, sand, pieces = [], ink = new Map(), color = 0, frozen = false }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !(sand instanceof Uint8Array) || sand.length < width * height) return null;
  const settled = [];
  for (let y = 0; y < Math.min(floor, height); y++) for (let x = 0; x < width; x++) {
    const value = sand[y * width + x]; if (value) settled.push([(x + 0.5) / width, (y + 0.5) / height, value, x, y]);
  }
  const moving = [];
  for (const piece of pieces) for (const cell of piece.cells || []) {
    if (Number.isInteger(cell.x) && Number.isInteger(cell.y) && Number.isInteger(cell.v) && cell.v > 0 && cell.v <= 7 && cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < Math.min(floor, height)) moving.push([(cell.x + 0.5) / width, (cell.y + 0.5) / height, cell.v, cell.x, cell.y]);
  }
  const drawn = [...ink.values()].filter((d) => Number.isInteger(d.x) && Number.isInteger(d.y) && d.x >= 0 && d.x < width && d.y >= 0 && d.y < Math.min(floor, height) && Number.isInteger(d.color) && d.color >= 0 && d.color <= 6)
    .map((d) => [(d.x + 0.5) / width, (d.y + 0.5) / height, d.color, d.x, d.y]).slice(0, HOME_PLAY_MAX_CELLS);
  return { v: 1, width, height, settled: settled.slice(0, HOME_PLAY_MAX_CELLS), pieces: moving.slice(0, HOME_PLAY_MAX_CELLS), ink: drawn, color: Number.isInteger(color) ? Math.max(0, Math.min(6, color)) : 0, frozen: Boolean(frozen) };
}

export function restoreHomePlayState(value, width, height, floor) {
  if (!value || value.v !== 1 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  const sand = new Uint8Array(width * height); const settled = []; const moving = []; const drawn = [];
  const remapY = (y) => Math.min(Math.max(0, floor - 1), y);
  const decodeXY = (c) => {
    if (c.length === 5) {
      if (!Number.isInteger(c[3]) || !Number.isInteger(c[4]) || !Number.isInteger(value.width) || !Number.isInteger(value.height) || c[3] < 0 || c[3] >= value.width || c[4] < 0 || c[4] >= value.height) return null;
      if (value.width === width && value.height === height) return [c[3], c[4]];
      return [Math.min(width - 1, Math.floor(c[0] * width)), remapY(Math.floor(c[1] * height))];
    }
    // Older v1 snapshots stored the upper-left cell corner without integer hints.
    if (value.width === width && value.height === height) return [Math.min(width - 1, Math.round(c[0] * width)), Math.min(height - 1, Math.round(c[1] * height))];
    return [Math.min(width - 1, Math.floor(c[0] * width)), remapY(Math.floor(c[1] * height))];
  };
  const readCells = (input, output, max) => {
    if (!Array.isArray(input) || input.length > max) return false;
    for (const c of input) {
      if (!Array.isArray(c) || ![3, 5].includes(c.length) || !c.every(Number.isFinite) || c[0] < 0 || c[0] >= 1 || c[1] < 0 || c[1] >= 1 || !Number.isInteger(c[2]) || c[2] < 1 || c[2] > 7) return false;
      const xy = decodeXY(c); if (!xy) return false; const [x, y] = xy;
      if (y >= floor) continue;
      output.push({ x, y, v: c[2] });
    }
    return true;
  };
  if (!readCells(value.settled, settled, HOME_PLAY_MAX_CELLS) || !readCells(value.pieces, moving, HOME_PLAY_MAX_CELLS)) return null;
  if (value.ink !== undefined) {
    if (!Array.isArray(value.ink) || value.ink.length > HOME_PLAY_MAX_CELLS) return null;
    for (const c of value.ink) {
      if (!Array.isArray(c) || ![3, 5].includes(c.length) || !c.every(Number.isFinite) || c[0] < 0 || c[0] >= 1 || c[1] < 0 || c[1] >= 1 || !Number.isInteger(c[2]) || c[2] < 0 || c[2] > 6) return null;
      const xy = decodeXY(c); if (!xy) return null; const [x, y] = xy;
      if (y < floor) drawn.push({ x, y, color: c[2], born: 0 });
    }
  }
  for (const c of settled) sand[c.y * width + c.x] = c.v;
  return {
    sand,
    pieces: moving.length ? [{ cells: moving, vx: 0, vy: 0, ax: 0, ay: 0, landed: false }] : [],
    ink: new Map(drawn.map((d) => [`${d.x},${d.y}`, d])),
    color: Number.isInteger(value.color) ? Math.max(0, Math.min(6, value.color)) : 0,
    frozen: Boolean(value.frozen),
  };
}

export function pushHomePlayHistory(history, snapshot) {
  const next = [...history, snapshot];
  return next.slice(-HOME_PLAY_MAX_HISTORY);
}

export function settleHomePlayPieces(sand, pieces, width, height, floor) {
  if (!(sand instanceof Uint8Array) || !Number.isInteger(width) || !Number.isInteger(height) || sand.length < width * height) return null;
  const settled = sand.slice(0, width * height);
  for (const piece of pieces || []) for (const cell of piece.cells || []) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) || !Number.isInteger(cell.v) || cell.v < 1 || cell.v > 7) continue;
    if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= floor) continue;
    settled[cell.y * width + cell.x] = cell.v;
  }
  let grains = 0; for (const value of settled) if (value) grains++;
  return { sand: settled, pieces: [], grains };
}

export function finishHomePlayIntro(dots) {
  for (const dot of dots || []) if (dot.state === 'intro') { dot.state = 'home'; dot.x = dot.hx; dot.y = dot.hy; dot.vx = 0; dot.vy = 0; }
  return dots;
}
