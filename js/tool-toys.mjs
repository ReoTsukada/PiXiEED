/** Shared miniature tool previews used by home and tools cards. */
export const TOOL_TOY_SIZE = 24;
export const TOOL_TOY_NAMES = Object.freeze(['camera', 'map', 'telescope', 'editor', 'sound', 'game', 'jigsaw', 'diff', 'find']);

/** Filled midpoint/Bresenham circle, clipped to an integer pixel grid. */
export function createCircleMask(radius, size = TOOL_TOY_SIZE) {
  if (!Number.isInteger(radius) || radius < 0 || !Number.isInteger(size) || size < 1) {
    throw new RangeError('circle dimensions must be non-negative integers');
  }
  const mask = new Uint8Array(size * size);
  const center = Math.floor(size / 2);
  const span = (y, halfWidth) => {
    const py = center + y;
    if (py < 0 || py >= size) return;
    for (let x = center - halfWidth; x <= center + halfWidth; x++) {
      if (x >= 0 && x < size) mask[py * size + x] = 1;
    }
  };
  let x = radius; let y = 0; let error = 1 - radius;
  while (x >= y) {
    span(y, x); span(-y, x);
    span(x, y); span(-x, y);
    y++;
    if (error < 0) error += 2 * y + 1;
    else { x--; error += 2 * (y - x) + 1; }
  }
  return mask;
}

const C = {
  ink: '#17232d', night: '#0f1822', paper: '#f7f8f6', red: '#e75445', blue: '#315fd0', sky: '#8ecdf0',
  yellow: '#ffd35a', green: '#5fb36b', leaf: '#2f7a45', orange: '#f29b52', pink: '#f3a6c0', brown: '#8a5a3c',
  white: '#ffffff', grey: '#9aa6b2', purple: '#8b6ad8'
};
const KEY = { k: C.ink, w: C.white, W: C.paper, r: C.red, b: C.blue, s: C.sky, y: C.yellow, g: C.green, G: C.leaf, o: C.orange, p: C.pink, n: C.brown, e: C.grey, v: C.purple };
const sprite = (rows) => rows.map((row) => [...row].map((c) => KEY[c] ?? null));

function pixelCanvas(canvas, w, h) {
  canvas.style.imageRendering = 'pixelated';
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  return {
    ctx, w, h,
    clear(color) { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); },
    px(x, y, color) { if (color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); } },
    rect(x, y, rw, rh, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(rw)), Math.max(1, Math.round(rh))); },
    sprite(rows, x, y, scale = 1) { rows.forEach((row, j) => row.forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x + i * scale), Math.round(y + j * scale), Math.max(1, Math.round(scale)), Math.max(1, Math.round(scale))); } })); },
    cell(event) { const r = canvas.getBoundingClientRect(); return { x: Math.floor(((event.clientX - r.left) / r.width) * w), y: Math.floor(((event.clientY - r.top) / r.height) * h) }; }
  };
}

export function createToolToys({ note = () => {}, animate, interactive = true } = {}) {
  if (typeof animate !== 'function') throw new TypeError('createToolToys requires an animation scheduler');
// A small original scene reused by the puzzles (16×16)
const SCENE = sprite([
  'ssssssssssssssss',
  'ssssssssssssyyss',
  'sswwwsssssssyyss',
  'swwwwwsssssssss.',
  'sssssssssrrsssss',
  'ssssssssrrrrssss',
  'sssGGsssrrrrrsss',
  'ssGGGGsswwwwwsss',
  'sGGGGGGswbwwbsss',
  'ssGGGGsswwwwwsss',
  'sssnnssswwnnwsss',
  'gggnngggwwnnwggg',
  'gggggggggggggggg',
  'ggpgggggygggggpg',
  'gggggpgggggggggg',
  'gggggggggggggggg'
].map((r) => r.replace(/\./g, 's')));

const TOY_PIXEL_SIZE = TOOL_TOY_SIZE;
const TOYS = {
  // Dithering a sunset through three looks, like the camera does
  camera(el) {
    const N = TOY_PIXEL_SIZE; const g = pixelCanvas(el.querySelector('canvas'), N, N);
    const sun = createCircleMask(4, N);
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    // three looks of the same sunset, like switching looks in the camera
    const looks = [['#0f380f', '#306230', '#8bac0f', '#9bbc0f'], ['#1b1f3a', '#8a3f7a', '#e75445', '#ffd35a'], ['#141414', '#5a5a5a', '#b0b0b0', '#f4f4f4']];
    let look = 1; let previousFrame = 0; let lookElapsed = 0;
    const ridge = (x) => 14 + Math.round(Math.sin(x * 0.45) * 1.6 + Math.sin(x * 0.9 + 1) * 0.8);
    const draw = (t) => {
      const frame = t || 0;
      if (previousFrame) lookElapsed += Math.min(100, Math.max(0, frame - previousFrame));
      previousFrame = frame;
      if (lookElapsed >= 3200) { look = (look + Math.floor(lookElapsed / 3200)) % looks.length; lookElapsed %= 3200; }
      const time = frame / 1000; const pal = looks[look];
      const sunY = 12.5 + Math.sin(time * 0.5) * 1.2;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let v;
        if (y >= 17) v = 0.18 + (Math.abs(x - 12) < 3 - (y - 17) * 0.3 && Math.sin(y * 3 + time * 4) > -0.3 ? 0.7 : 0.08 * Math.sin(x + y * 2 + time * 3));
        else if (y >= ridge(x)) v = 0.05;
        else {
          const sunRow = y - (Math.round(sunY) - 12);
          v = sunRow >= 0 && sunRow < N && sun[sunRow * N + x] ? 1 : 0.95 - y / 18 * 0.75;
        }
        const level = v * 3 + (bayer[y & 3][x & 3] / 16 - 0.5) * 0.95;
        g.px(x, y, pal[Math.max(0, Math.min(3, Math.round(level)))]);
      }
    };
    animate(el, draw);
    const next = () => { look = (look + 1) % looks.length; };
    el.addEventListener('pointerenter', next);
  },
  // A spinning pixel globe with blinking pins
  map(el) {
    const N = TOY_PIXEL_SIZE; const g = pixelCanvas(el.querySelector('canvas'), N, N);
    const globe = createCircleMask(10, N);
    const land = (lon, lat) => Math.sin(lon * 3) * Math.cos(lat * 4) + Math.sin(lon * 5 + lat * 2) * 0.6 > 0.45;
    const draw = (t) => {
      const rot = (t || 0) / 3000; g.clear(C.night);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!globe[y * N + x]) { if ((x * 7 + y * 13) % 29 === 0) g.px(x, y, C.grey); continue; }
        const nx = (x - 12) / 10.5; const ny = (y - 12) / 10.5;
        const r2 = Math.min(1, nx * nx + ny * ny);
        const nz = Math.sqrt(Math.max(0, 1 - r2)); const lat = Math.asin(-ny); const lon = Math.atan2(nx, nz) + rot;
        const shade = nx * -0.4 + ny * -0.3 + nz * 0.8;
        g.px(x, y, land(lon, lat) ? (shade > 0.55 ? '#6cc47a' : '#3f9153') : (shade > 0.55 ? '#3b78c9' : '#2a5aa3'));
        if (land(lon, lat) && Math.abs(Math.sin(lon * 7 + lat * 9)) > 0.985 && Math.sin((t || 0) / 250 + lon) > 0) g.px(x, y, C.red);
      }
    };
    animate(el, draw);
  },
  // Moon phases and twinkling stars
  telescope(el) {
    const N = TOY_PIXEL_SIZE; const g = pixelCanvas(el.querySelector('canvas'), N, N);
    const radius = 8; const sphereRadius = radius + 0.5; const moon = createCircleMask(radius, N);
    const moonPoints = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!moon[y * N + x]) continue;
      const nx = (x - 12) / sphereRadius; const ny = (y - 12) / sphereRadius;
      moonPoints.push({ x, y, nx, nz: Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) });
    }
    const craterPixels = [
      { x: 8, y: 9, shape: [[0, 0], [1, 0], [-1, 1], [0, 1]], shade: '#c4b99b' },
      { x: 15, y: 10, shape: [[0, 0], [1, 0], [-1, 1], [0, 1]], shade: '#d3c9ad' },
      { x: 10, y: 15, shape: [[0, 0], [1, 0], [-1, 1]], shade: '#c4b99b' },
    ].flatMap(({ x, y, shape, shade }) => shape.map(([ox, oy]) => {
      const px = x + ox; const py = y + oy;
      const nx = (px - 12) / sphereRadius; const ny = (py - 12) / sphereRadius;
      return moon[py * N + px] ? { x: px, y: py, nx, nz: Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), shade } : null;
    })).filter(Boolean);
    const starClearance = createCircleMask(radius + 2, N);
    const starPlaces = Array.from({ length: N * N }, (_, index) => index).filter((index) => !starClearance[index]);
    const stars = Array.from({ length: 22 }, () => {
      const index = starPlaces[Math.random() * starPlaces.length | 0];
      return [index % N, Math.floor(index / N), Math.random() * 6];
    });
    let shoot = -1;
    const draw = (t) => {
      const time = (t || 0) / 1000; g.clear('#0c1320');
      for (const [x, y, p] of stars) if (Math.sin(time * 2 + p) > -0.2) g.px(x, y, Math.sin(time * 2 + p) > 0.7 ? C.white : '#7d8aa0');
      const phase = 2 * Math.PI * (time - 4) / 20;
      const lightX = Math.sin(phase); const lightZ = Math.cos(phase);
      for (const point of moonPoints) {
        const lit = point.nx * lightX + point.nz * lightZ > 1e-6;
        g.px(point.x, point.y, lit ? '#f3ecd2' : '#252f40');
      }
      for (const crater of craterPixels) if (crater.nx * lightX + crater.nz * lightZ > 1e-6) g.px(crater.x, crater.y, crater.shade);
      if (shoot >= 0) {
        const k = (time - shoot) / 0.6;
        if (k > 1) shoot = -1;
        else for (let i = 0; i < 5; i++) {
          const x = Math.round(2 + k * 20 - i); const y = Math.round(3 + k * 6 - i);
          if (!starClearance[y * N + x]) g.px(x, y, i < 2 ? C.white : '#7d8aa0');
        }
      }
    };
    animate(el, draw);
    el.addEventListener('pointerenter', () => { shoot = performance.now() / 1000; });
  },
  // Mirror drawing; it doodles a heart by itself until touched
  editor(el) {
    const N = TOY_PIXEL_SIZE; const g = pixelCanvas(el.querySelector('canvas'), N, N); const canvas = el.querySelector('canvas');
    const cells = new Map(); let touched = false; let hue = 0;
    const HEART = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
    const demo = []; HEART.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') demo.push([x + 8, y + 9]); }));
    const cols = [C.red, C.orange, C.yellow, C.green, C.sky, C.blue, C.purple, C.pink];
    const draw = (t) => {
      g.clear('#f1eee6');
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2) g.px(x, y, '#e8e4da');
      if (!touched) { const n = Math.floor(((t || 0) / 90) % (demo.length + 30)); demo.slice(0, n).forEach(([x, y]) => g.px(x, y, C.red)); }
      for (const [k, c] of cells) { const [x, y] = k.split(',').map(Number); g.px(x, y, c); }
    };
    const redraw = animate(el, draw);
    const put = (e) => {
      const { x, y } = g.cell(e); if (x < 0 || y < 0 || x >= N || y >= N) return;
      const c = cols[hue % cols.length];
      for (const xx of [x, N - 1 - x]) { const key = `${xx},${y}`; if (cells.get(key) !== c) { cells.set(key, c); } }
      note(y % 10, { length: 0.08, volume: 0.03 }); redraw();
    };
    let down = false;
    if (interactive) {
      canvas.addEventListener('pointerdown', (e) => { if (!touched) { touched = true; cells.clear(); } down = true; hue++; canvas.setPointerCapture(e.pointerId); put(e); });
      canvas.addEventListener('pointermove', (e) => { if (down) put(e); });
      canvas.addEventListener('pointerup', () => { down = false; });
    }
  },
  // A pixel melody: columns are time, rows are pitch; tap to toggle, it plays while on screen once touched
  sound(el) {
    const COLS = 12; const ROWS = 8; const X = 0; const Y = 3; const g = pixelCanvas(el.querySelector('canvas'), TOY_PIXEL_SIZE, TOY_PIXEL_SIZE); const canvas = el.querySelector('canvas');
    const on = new Set(['0,4', '1,3', '2,2', '3,3', '4,4', '5,5', '6,4', '7,2', '8,1', '9,2', '10,4', '11,6']);
    const rowColor = [C.pink, C.red, C.orange, C.yellow, C.green, C.sky, C.blue, C.purple];
    let playing = false; let step = -1; let lastStep = 0;
    const draw = (t) => {
      g.clear('#231a33');
      const now = t || 0;
      if (playing && now - lastStep > 220) { lastStep = now; step = (step + 1) % COLS; for (let r = 0; r < ROWS; r++) if (on.has(`${step},${r}`)) note(ROWS - r + 1, { length: 0.2, volume: 0.04, type: 'square' }); }
      const head = playing ? step : Math.floor(now / 220) % COLS;
      for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
        const lit = on.has(`${c},${r}`); const hot = c === head && lit;
        g.rect(X + c * 2, Y + r * 2, 2, 2, lit ? (hot ? C.white : rowColor[r]) : ((c + r) % 2 ? '#2e2442' : '#2a2140'));
      }
      g.rect(X + head * 2, Y + ROWS * 2, 2, 1, C.yellow);
    };
    const redraw = animate(el, draw);
    if (interactive) canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e); const c = Math.floor((x - X) / 2); const r = Math.floor((y - Y) / 2); if (x < X || y < Y || c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
      const key = `${c},${r}`; if (on.has(key)) on.delete(key); else { on.add(key); note(ROWS - r + 1, { length: 0.15, type: 'square', volume: 0.04 }); }
      playing = true; redraw();
    });
  },
  // Tap to jump over blocks
  game(el) {
    const W = TOY_PIXEL_SIZE; const H = TOY_PIXEL_SIZE; const g = pixelCanvas(el.querySelector('canvas'), W, H);
    const HERO = sprite(['.kk.', 'kyyk', 'kyky', '.rr.', '.k.k']);
    let y = 0; let vy = 0; let blocks = [26, 42]; let flash = 0; let lastT = 0;
    const jump = () => { if (y === 0) { vy = 3.6; note(9, { length: 0.1, type: 'square', volume: 0.03 }); } };
    const draw = (t) => {
      const now = t || 0; const dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
      g.clear('#bfe3f2');
      g.rect(3, 3, 3, 3, C.yellow);
      for (let i = 0; i < 3; i++) g.rect(((i * 11 - now / 180) % 32 + 32) % 32 - 4, 3 + i * 2, 5, 1, C.white);
      g.rect(0, H - 3, W, 3, C.green); g.rect(0, H - 3, W, 1, C.leaf);
      if (dt > 0) {
        vy -= 9.5 * dt; y = Math.max(0, y + vy * dt * 6); if (y === 0) vy = 0;
        blocks = blocks.map((b) => b - dt * 12); if (blocks[0] < -3) { blocks.shift(); blocks.push(Math.max(W + 2, blocks[blocks.length - 1] + 12 + (Math.random() * 10 | 0))); }
        // the demo jumps by itself until someone plays
        if (!el.dataset.played && blocks[0] > 5 && blocks[0] < 8.5) jump();
        if (blocks.some((b) => b > 3 && b < 7) && y < 2.5) { flash = now; blocks = [W + 4, W + 18]; }
      }
      for (const b of blocks) { g.rect(b, H - 6, 2, 3, C.red); g.rect(b, H - 6, 2, 1, '#f08a7e'); }
      if (!(now - flash < 400 && Math.floor(now / 80) % 2)) g.sprite(HERO, 4, H - 8 - Math.round(y));
    };
    animate(el, draw);
    if (interactive) {
      el.addEventListener('pointerdown', () => { el.dataset.played = '1'; jump(); });
      el.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); el.dataset.played = '1'; jump(); } });
    }
  },
  // 4×4 pieces of the scene; tap two pieces to swap them
  jigsaw(el) {
    const g = pixelCanvas(el.querySelector('canvas'), TOY_PIXEL_SIZE, TOY_PIXEL_SIZE); const canvas = el.querySelector('canvas');
    let order = []; let pick = -1; let solvedAt = 0;
    const shuffle = () => { order = [...Array(16).keys()]; for (let i = 15; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; } if (order.every((v, i) => v === i)) shuffle(); };
    shuffle();
    const draw = (t) => {
      const now = t || performance.now(); g.clear('#e9e3d6');
      order.forEach((piece, slot) => {
        const sx = (piece % 4) * 4; const sy = Math.floor(piece / 4) * 4; const dx = 4 + (slot % 4) * 4; const dy = 4 + Math.floor(slot / 4) * 4;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.px(dx + x, dy + y, SCENE[sy + y][sx + x]);
        if (slot === pick) { g.rect(dx, dy, 4, 1, C.white); g.rect(dx, dy + 3, 4, 1, C.white); g.rect(dx, dy, 1, 4, C.white); g.rect(dx + 3, dy, 1, 4, C.white); }
      });
      if (solvedAt && now - solvedAt < 900) for (let i = 0; i < 12; i++) g.px(Math.floor((i * 7 + now / 40) % 24), Math.floor((i * 5 + now / 60) % 24), C.yellow);
      if (solvedAt && now - solvedAt > 1600) { solvedAt = 0; shuffle(); }
    };
    const redraw = animate(el, draw);
    if (interactive) canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e); const col = Math.floor((x - 4) / 4); const row = Math.floor((y - 4) / 4); if (col < 0 || row < 0 || col > 3 || row > 3) return;
      const slot = row * 4 + col;
      if (pick < 0) { pick = slot; note(4, { length: 0.08 }); } else { [order[pick], order[slot]] = [order[slot], order[pick]]; pick = -1; note(7, { length: 0.1 }); if (order.every((v, i) => v === i)) { solvedAt = performance.now(); [0, 2, 4, 7].forEach((n, i) => setTimeout(() => note(n + 5), i * 90)); } }
      redraw();
    });
  },
  // Two small copies of the scene, three differences on the right one
  diff(el) {
    const HALF = TOY_PIXEL_SIZE / 2; const g = pixelCanvas(el.querySelector('canvas'), TOY_PIXEL_SIZE, TOY_PIXEL_SIZE); const canvas = el.querySelector('canvas');
    let diffs = []; let found = new Set();
    const make = () => {
      diffs = []; found = new Set();
      while (diffs.length < 3) { const x = 1 + (Math.random() * 8 | 0); const y = 1 + (Math.random() * 8 | 0); if (diffs.every((d) => Math.abs(d.x - x) + Math.abs(d.y - y) > 4)) diffs.push({ x, y, c: [C.red, C.purple, C.yellow, C.blue, C.pink][Math.random() * 5 | 0] }); }
    };
    make();
    const draw = (t) => {
      const now = t || performance.now(); g.clear('#e6edf3');
      for (let y = 0; y < HALF; y++) for (let x = 0; x < HALF; x++) {
        const sx = Math.floor(x * 16 / HALF); const sy = Math.floor(y * 16 / HALF);
        g.px(x, 6 + y, SCENE[sy][sx]); g.px(HALF + x, 6 + y, SCENE[sy][sx]);
      }
      for (const d of diffs) g.rect(HALF + d.x, 6 + d.y, 2, 2, d.c);
      for (const i of found) { const d = diffs[i]; for (const [ox, oy] of [[-1, -1], [2, -1], [-1, 2], [2, 2], [0, -1], [1, -1], [0, 2], [1, 2], [-1, 0], [-1, 1], [2, 0], [2, 1]]) g.px(HALF + d.x + ox, 6 + d.y + oy, Math.floor(now / 200) % 2 ? C.red : C.white); }
      if (found.size === 3 && !el.dataset.done) { el.dataset.done = '1'; setTimeout(() => { make(); delete el.dataset.done; }, 1400); }
    };
    const redraw = animate(el, draw);
    if (interactive) canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e);
      const px = x >= HALF ? x - HALF : x; const py = y - 6;
      const i = y < 6 || y >= 18 ? -1 : diffs.findIndex((d) => px >= d.x - 1 && px <= d.x + 2 && py >= d.y - 1 && py <= d.y + 2);
      if (i >= 0 && !found.has(i)) { found.add(i); note(5 + found.size * 2, { length: 0.14 }); } else if (i < 0) note(0, { length: 0.06, volume: 0.02 });
      redraw();
    });
  },
  // A busy garden with one cat hiding in it
  find(el) {
    const N = TOY_PIXEL_SIZE; const g = pixelCanvas(el.querySelector('canvas'), N, N); const canvas = el.querySelector('canvas');
    const CAT = sprite(['n...n', 'nnnnn', 'nknkn', 'nnnnn']);
    const THINGS = [sprite(['.r.', 'ryr', '.r.']), sprite(['.p.', 'pyp', '.p.']), sprite(['.b.', 'byb', '.b.']), sprite(['ee', 'ee']), sprite(['.G.', 'GGG'])];
    let clutter = []; let cat = { x: 5, y: 5 }; let foundAt = 0;
    const make = () => {
      cat = { x: 1 + (Math.random() * (N - 7) | 0), y: 1 + (Math.random() * (N - 6) | 0) };
      clutter = Array.from({ length: 34 }, () => ({ s: THINGS[Math.random() * THINGS.length | 0], x: Math.random() * (N - 2) | 0, y: Math.random() * (N - 2) | 0 }))
        .filter((c) => c.x + 3 < cat.x || c.x > cat.x + 5 || c.y + 3 < cat.y || c.y > cat.y + 4);
      foundAt = 0;
    };
    make();
    const draw = (t) => {
      const now = t || performance.now(); g.clear('#dcebd2');
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x * 3 + y * 5) % 11 === 0) g.px(x, y, '#c6dcb8');
      for (const c of clutter) g.sprite(c.s, c.x, c.y);
      const blink = Math.floor(now / 2400) % 5 === 0 && now % 2400 < 160;
      g.sprite(CAT, cat.x, cat.y); if (blink) { g.px(cat.x + 1, cat.y + 2, C.brown); g.px(cat.x + 3, cat.y + 2, C.brown); }
      if (foundAt) {
        const r = 4 + (Math.floor((now - foundAt) / 90) % 3);
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) g.px(cat.x + 2 + dx, cat.y + 2 + dy, C.red);
        if (now - foundAt > 1500) make();
      }
    };
    const redraw = animate(el, draw);
    if (interactive) canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e);
      if (!foundAt && x >= cat.x - 1 && x <= cat.x + 5 && y >= cat.y - 1 && y <= cat.y + 4) { foundAt = performance.now(); [7, 9, 12].forEach((n, i) => setTimeout(() => note(n, { length: 0.14 }), i * 90)); }
      else if (!foundAt) note(1, { length: 0.05, volume: 0.02 });
      redraw();
    });
  }
};
  return TOYS;
}
