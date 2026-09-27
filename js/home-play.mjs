/**
 * PiXiEED home: the page is a set of small working toys.
 *
 * The first screen is a pixel canvas — drag to draw, every new dot plays a note (a taste of the editor and
 * the sound tool together). Below it, each tool card runs a tiny live version of that tool. Toys animate only
 * while on screen, and hold still (but stay playable) for people who prefer reduced motion.
 */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = {
  ink: '#17232d', night: '#0f1822', paper: '#f7f8f6', red: '#e75445', blue: '#315fd0', sky: '#8ecdf0',
  yellow: '#ffd35a', green: '#5fb36b', leaf: '#2f7a45', orange: '#f29b52', pink: '#f3a6c0', brown: '#8a5a3c',
  white: '#ffffff', grey: '#9aa6b2', purple: '#8b6ad8'
};
const KEY = { k: C.ink, w: C.white, W: C.paper, r: C.red, b: C.blue, s: C.sky, y: C.yellow, g: C.green, G: C.leaf, o: C.orange, p: C.pink, n: C.brown, e: C.grey, v: C.purple };
const sprite = (rows) => rows.map((row) => [...row].map((c) => KEY[c] ?? null));

// ---------- tiny audio: one soft square-ish voice, created on the first touch ----------
let audio = null; let soundOn = true;
const SCALE = [0, 2, 4, 7, 9]; // pentatonic: any dots sound good together
function note(step, { length = 0.16, volume = 0.05, type = 'triangle' } = {}) {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const octave = Math.floor(step / SCALE.length); const degree = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
    const freq = 261.63 * 2 ** ((octave * 12 + degree) / 12);
    const t = audio.currentTime; const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(audio.destination); osc.start(t); osc.stop(t + length + 0.02);
  } catch { /* no audio */ }
}

// ---------- shared pixel canvas helper ----------
function pixelCanvas(canvas, w, h) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  return {
    ctx, w, h,
    clear(color) { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); },
    px(x, y, color) { if (color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, 1, 1); } },
    rect(x, y, rw, rh, color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, rw, rh); },
    sprite(rows, x, y, scale = 1) { rows.forEach((row, j) => row.forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect(x + i * scale, y + j * scale, scale, scale); } })); },
    cell(event) { const r = canvas.getBoundingClientRect(); return { x: Math.floor(((event.clientX - r.left) / r.width) * w), y: Math.floor(((event.clientY - r.top) / r.height) * h) }; }
  };
}
// run draw(t) every frame while the element is on screen
function animate(element, draw) {
  let raf = 0; let visible = false;
  const loop = (t) => { draw(t); if (visible && !reduced) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; cancelAnimationFrame(raf);
    if (visible) raf = requestAnimationFrame(loop);
  }, { rootMargin: '80px' }).observe(element);
  draw(0);
  return () => { if (reduced || !visible) draw(performance.now()); };
}

// ---------- a 3×5 pixel font for the hero word ----------
const FONT = {
  P: ['###', '#.#', '###', '#..', '#..'], i: ['.', '#', '.', '#', '#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'], D: ['##.', '#.#', '#.#', '#.#', '##.']
};
const WORD = ['P', 'i', 'X', 'i', 'E', 'E', 'D'];
const WORD_COLORS = [C.red, C.yellow, C.sky, C.yellow, C.green, C.pink, C.orange];

// =========================================================================================================
// Hero
// =========================================================================================================
function hero() {
  const stage = document.getElementById('hpStage'); const canvas = document.getElementById('hpCanvas');
  const hint = document.getElementById('hpHint');
  const colors = [C.red, C.yellow, C.green, C.sky, C.blue, C.pink, C.white];
  let color = 0; let W = 48; let H = 30; let g = null; let paint = new Map(); let letters = []; let stars = [];
  const colorBox = document.getElementById('hpColors');
  colors.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.style.setProperty('--c', c);
    b.setAttribute('aria-label', `色 ${i + 1}`); b.addEventListener('click', () => { color = i; syncColors(); note(i + 5, { length: 0.1 }); });
    colorBox.appendChild(b);
  });
  const syncColors = () => [...colorBox.children].forEach((b, i) => b.setAttribute('aria-checked', String(i === color)));
  syncColors();

  function layout() {
    const r = stage.getBoundingClientRect();
    const cell = r.width < 520 ? 9 : r.width < 900 ? 12 : 14;
    W = Math.max(24, Math.round(r.width / cell)); H = Math.max(18, Math.round(r.height / cell));
    g = pixelCanvas(canvas, W, H);
    // the word, centred in the upper part, each dot falling in from above
    const wordWidth = WORD.reduce((s, ch) => s + FONT[ch][0].length + 1, -1);
    const scale = W >= 60 ? 2 : 1;
    let x0 = Math.floor((W - wordWidth * scale) / 2); const y0 = Math.floor(H * 0.2);
    letters = [];
    WORD.forEach((ch, li) => {
      FONT[ch].forEach((row, j) => [...row].forEach((c, i) => {
        if (c !== '#') return;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) letters.push({ li, x: x0 + i * scale + sx, y: y0 + j * scale + sy, color: WORD_COLORS[li], delay: li * 90 + Math.random() * 260, from: -2 - Math.random() * 12 });
      }));
      x0 += (FONT[ch][0].length + 1) * scale;
    });
    stars = Array.from({ length: Math.round(W * H / 40) }, () => ({ x: Math.random() * W | 0, y: Math.random() * H | 0, p: Math.random() * 6.28, s: 0.5 + Math.random() * 1.5 }));
    paint = new Map();
  }
  let start = performance.now();
  function draw(t) {
    if (!g) return;
    const now = t || performance.now(); const time = (now - start) / 1000;
    g.clear(C.night);
    for (const s of stars) { const a = 0.35 + 0.35 * Math.sin(time * s.s + s.p); if (a > 0.45) g.px(s.x, s.y, `rgba(255,255,255,${a.toFixed(2)})`); }
    // a slow shooting star
    const k = (time % 9) / 9; if (k < 0.12) { const sx = Math.floor(W * (0.2 + k * 5)); const sy = Math.floor(H * 0.1 + k * 30); for (let i = 0; i < 4; i++) g.px(sx - i, sy - i * 0.5, `rgba(255,255,255,${(0.8 - i * 0.2).toFixed(2)})`); }
    for (const d of letters) {
      const p = reduced ? 1 : Math.min(1, Math.max(0, (now - start - d.delay) / 520));
      const e = 1 - (1 - p) ** 3; const y = Math.round(d.from + (d.y - d.from) * e);
      const wave = p >= 1 && !reduced ? Math.round(Math.sin(time * 2.4 - d.li * 0.7) * 0.75) : 0; // each letter hops as a whole
      if (p > 0) g.px(d.x, y + wave, d.color);
    }
    for (const [key, c] of paint) { const [x, y] = key.split(',').map(Number); g.px(x, y, c.color); }
    // painted dots twinkle once when born
    for (const [, c] of paint) if (now - c.born < 260) g.px(c.x, c.y, C.white);
  }
  const redraw = animate(stage, draw);
  let drawing = false; let last = null;
  function paintAt(e) {
    const { x, y } = g.cell(e); if (x < 0 || y < 0 || x >= W || y >= H) return;
    const cells = [];
    if (last) { const n = Math.max(Math.abs(x - last.x), Math.abs(y - last.y)); for (let i = 1; i <= n; i++) cells.push({ x: Math.round(last.x + ((x - last.x) * i) / n), y: Math.round(last.y + ((y - last.y) * i) / n) }); } else cells.push({ x, y });
    last = { x, y };
    for (const c of cells) {
      const key = `${c.x},${c.y}`;
      if (paint.get(key)?.color === colors[color]) continue;
      paint.set(key, { x: c.x, y: c.y, color: colors[color], born: performance.now() });
      note(Math.round((H - c.y) / H * 12) + 2, { length: 0.18 });
    }
    hint.classList.add('is-used');
    redraw();
  }
  canvas.addEventListener('pointerdown', (e) => { drawing = true; last = null; canvas.setPointerCapture(e.pointerId); paintAt(e); });
  canvas.addEventListener('pointermove', (e) => { if (drawing) paintAt(e); });
  const stop = () => { drawing = false; last = null; };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
  document.getElementById('hpClear').addEventListener('click', () => { paint.clear(); start = performance.now(); note(0, { length: 0.25 }); note(4, { length: 0.25 }); redraw(); });
  const soundButton = document.getElementById('hpSound');
  soundButton.addEventListener('click', () => { soundOn = !soundOn; soundButton.setAttribute('aria-pressed', String(soundOn)); if (soundOn) note(7); });
  layout();
  new ResizeObserver(() => { const before = paint; layout(); for (const [k, v] of before) if (v.x < W && v.y < H) paint.set(k, v); redraw(); }).observe(stage);
}

// =========================================================================================================
// Toys
// =========================================================================================================
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

const TOYS = {
  // Dithering a sunset through three looks, like the camera does
  camera(el) {
    const N = 24; const g = pixelCanvas(el.querySelector('canvas'), N, N);
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    // three looks of the same sunset, like switching looks in the camera
    const looks = [['#0f380f', '#306230', '#8bac0f', '#9bbc0f'], ['#1b1f3a', '#8a3f7a', '#e75445', '#ffd35a'], ['#141414', '#5a5a5a', '#b0b0b0', '#f4f4f4']];
    let look = 1;
    const ridge = (x) => 14 + Math.round(Math.sin(x * 0.45) * 1.6 + Math.sin(x * 0.9 + 1) * 0.8);
    const draw = (t) => {
      const time = (t || 0) / 1000; const pal = looks[look];
      const sunY = 12.5 + Math.sin(time * 0.5) * 1.2;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let v;
        if (y >= 17) v = 0.18 + (Math.abs(x - 12) < 3 - (y - 17) * 0.3 && Math.sin(y * 3 + time * 4) > -0.3 ? 0.7 : 0.08 * Math.sin(x + y * 2 + time * 3));
        else if (y >= ridge(x)) v = 0.05;
        else v = Math.hypot(x - 12, (y - sunY) * 1.1) < 4 ? 1 : 0.95 - y / 18 * 0.75;
        const level = v * 3 + (bayer[y & 3][x & 3] / 16 - 0.5) * 0.95;
        g.px(x, y, pal[Math.max(0, Math.min(3, Math.round(level)))]);
      }
    };
    animate(el, draw);
    const next = () => { look = (look + 1) % looks.length; };
    el.addEventListener('pointerenter', next);
    setInterval(() => { if (!reduced && document.visibilityState === 'visible') next(); }, 3200);
  },
  // A spinning pixel globe with blinking pins
  map(el) {
    const N = 26; const g = pixelCanvas(el.querySelector('canvas'), N, N);
    const land = (lon, lat) => Math.sin(lon * 3) * Math.cos(lat * 4) + Math.sin(lon * 5 + lat * 2) * 0.6 > 0.45;
    const draw = (t) => {
      const rot = (t || 0) / 3000; g.clear(C.night);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const nx = (x - N / 2 + 0.5) / 11; const ny = (y - N / 2 + 0.5) / 11; const r2 = nx * nx + ny * ny;
        if (r2 > 1) { if ((x * 7 + y * 13) % 29 === 0) g.px(x, y, 'rgba(255,255,255,.5)'); continue; }
        const nz = Math.sqrt(1 - r2); const lat = Math.asin(-ny); const lon = Math.atan2(nx, nz) + rot;
        const shade = nx * -0.4 + ny * -0.3 + nz * 0.8;
        g.px(x, y, land(lon, lat) ? (shade > 0.55 ? '#6cc47a' : '#3f9153') : (shade > 0.55 ? '#3b78c9' : '#2a5aa3'));
        if (land(lon, lat) && Math.abs(Math.sin(lon * 7 + lat * 9)) > 0.985 && Math.sin((t || 0) / 250 + lon) > 0) g.px(x, y, C.red);
      }
    };
    animate(el, draw);
  },
  // Moon phases and twinkling stars
  telescope(el) {
    const N = 24; const g = pixelCanvas(el.querySelector('canvas'), N, N);
    const stars = Array.from({ length: 22 }, () => [Math.random() * N | 0, Math.random() * N | 0, Math.random() * 6]);
    let shoot = -1;
    const draw = (t) => {
      const time = (t || 0) / 1000; g.clear('#0c1320');
      for (const [x, y, p] of stars) if (Math.sin(time * 2 + p) > -0.2) g.px(x, y, Math.sin(time * 2 + p) > 0.7 ? C.white : '#7d8aa0');
      const phase = (time * 0.15) % 2; // 0..2
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x - 12; const dy = y - 12; if (dx * dx + dy * dy > 49) continue;
        const lit = phase < 1 ? dx / 7 > 1 - 2 * phase : dx / 7 < 3 - 2 * phase;
        g.px(x, y, lit ? ((dx * 3 + dy * 5) % 7 === 0 ? '#d9d2b8' : '#f3ecd2') : '#1f2a3d');
      }
      if (shoot >= 0) { const k = (time - shoot) / 0.6; if (k > 1) shoot = -1; else for (let i = 0; i < 5; i++) g.px(2 + k * 20 - i, 3 + k * 6 - i * 0.3, `rgba(255,255,255,${1 - i * 0.18})`); }
    };
    animate(el, draw);
    el.addEventListener('pointerenter', () => { shoot = performance.now() / 1000; });
  },
  // Mirror drawing; it doodles a heart by itself until touched
  editor(el) {
    const N = 16; const g = pixelCanvas(el.querySelector('canvas'), N, N); const canvas = el.querySelector('canvas');
    const cells = new Map(); let touched = false; let hue = 0;
    const HEART = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
    const demo = []; HEART.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') demo.push([x + 4, y + 5]); }));
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
    canvas.addEventListener('pointerdown', (e) => { if (!touched) { touched = true; cells.clear(); } down = true; hue++; canvas.setPointerCapture(e.pointerId); put(e); });
    canvas.addEventListener('pointermove', (e) => { if (down) put(e); });
    canvas.addEventListener('pointerup', () => { down = false; });
  },
  // A pixel melody: columns are time, rows are pitch; tap to toggle, it plays while on screen once touched
  sound(el) {
    const COLS = 12; const ROWS = 8; const g = pixelCanvas(el.querySelector('canvas'), COLS * 2, ROWS * 2 + 2); const canvas = el.querySelector('canvas');
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
        g.rect(c * 2, r * 2, 2, 2, lit ? (hot ? C.white : rowColor[r]) : ((c + r) % 2 ? '#2e2442' : '#2a2140'));
      }
      g.rect(head * 2, ROWS * 2 + 0.5, 2, 1, C.yellow);
    };
    const redraw = animate(el, draw);
    canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e); const c = Math.floor(x / 2); const r = Math.floor(y / 2); if (r >= ROWS) return;
      const key = `${c},${r}`; if (on.has(key)) on.delete(key); else { on.add(key); note(ROWS - r + 1, { length: 0.15, type: 'square', volume: 0.04 }); }
      playing = true; redraw();
    });
  },
  // Tap to jump over blocks
  game(el) {
    const W = 28; const H = 16; const g = pixelCanvas(el.querySelector('canvas'), W, H);
    const HERO = sprite(['.kk.', 'kyyk', 'kyky', '.rr.', '.k.k']);
    let y = 0; let vy = 0; let blocks = [30, 46]; let flash = 0; let lastT = 0;
    const jump = () => { if (y === 0) { vy = 3.6; note(9, { length: 0.1, type: 'square', volume: 0.03 }); } };
    const draw = (t) => {
      const now = t || 0; const dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
      g.clear('#bfe3f2');
      g.rect(3, 3, 3, 3, C.yellow);
      for (let i = 0; i < 3; i++) g.rect(((i * 11 - now / 180) % 34 + 34) % 34 - 4, 3 + i * 2, 5, 1, C.white);
      g.rect(0, H - 3, W, 3, C.green); g.rect(0, H - 3, W, 1, C.leaf);
      if (dt > 0) {
        vy -= 9.5 * dt; y = Math.max(0, y + vy * dt * 6); if (y === 0) vy = 0;
        blocks = blocks.map((b) => b - dt * 12); if (blocks[0] < -3) { blocks.shift(); blocks.push(Math.max(W + 2, blocks[blocks.length - 1] + 12 + Math.random() * 10)); }
        // the demo jumps by itself until someone plays
        if (!el.dataset.played && blocks[0] > 5 && blocks[0] < 8.5) jump();
        if (blocks.some((b) => b > 3 && b < 7) && y < 2.5) { flash = now; blocks = [W + 4, W + 18]; }
      }
      for (const b of blocks) { g.rect(b, H - 6, 2, 3, C.red); g.rect(b, H - 6, 2, 1, '#f08a7e'); }
      if (!(now - flash < 400 && Math.floor(now / 80) % 2)) g.sprite(HERO, 4, H - 8 - Math.round(y));
    };
    animate(el, draw);
    el.addEventListener('pointerdown', () => { el.dataset.played = '1'; jump(); });
    el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.dataset.played = '1'; jump(); } });
  },
  // 4×4 pieces of the scene; tap two pieces to swap them
  jigsaw(el) {
    const g = pixelCanvas(el.querySelector('canvas'), 18, 18); const canvas = el.querySelector('canvas');
    let order = []; let pick = -1; let solvedAt = 0;
    const shuffle = () => { order = [...Array(16).keys()]; for (let i = 15; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; } if (order.every((v, i) => v === i)) shuffle(); };
    shuffle();
    const draw = (t) => {
      const now = t || performance.now(); g.clear('#e9e3d6');
      order.forEach((piece, slot) => {
        const sx = (piece % 4) * 4; const sy = Math.floor(piece / 4) * 4; const dx = 1 + (slot % 4) * 4; const dy = 1 + Math.floor(slot / 4) * 4;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.px(dx + x, dy + y, SCENE[sy + y][sx + x]);
        if (slot === pick) { g.rect(dx, dy, 4, 1, C.white); g.rect(dx, dy + 3, 4, 1, C.white); g.rect(dx, dy, 1, 4, C.white); g.rect(dx + 3, dy, 1, 4, C.white); }
      });
      if (solvedAt && now - solvedAt < 900) for (let i = 0; i < 12; i++) g.px((i * 7 + now / 40) % 18, (i * 5 + now / 60) % 18, C.yellow);
      if (solvedAt && now - solvedAt > 1600) { solvedAt = 0; shuffle(); }
    };
    const redraw = animate(el, draw);
    canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e); const col = Math.floor((x - 1) / 4); const row = Math.floor((y - 1) / 4); if (col < 0 || row < 0 || col > 3 || row > 3) return;
      const slot = row * 4 + col;
      if (pick < 0) { pick = slot; note(4, { length: 0.08 }); } else { [order[pick], order[slot]] = [order[slot], order[pick]]; pick = -1; note(7, { length: 0.1 }); if (order.every((v, i) => v === i)) { solvedAt = performance.now(); [0, 2, 4, 7].forEach((n, i) => setTimeout(() => note(n + 5), i * 90)); } }
      redraw();
    });
  },
  // Two small copies of the scene, three differences on the right one
  diff(el) {
    const g = pixelCanvas(el.querySelector('canvas'), 34, 18); const canvas = el.querySelector('canvas');
    let diffs = []; let found = new Set();
    const make = () => {
      diffs = []; found = new Set();
      while (diffs.length < 3) { const x = 1 + (Math.random() * 14 | 0); const y = 1 + (Math.random() * 14 | 0); if (diffs.every((d) => Math.abs(d.x - x) + Math.abs(d.y - y) > 5)) diffs.push({ x, y, c: [C.red, C.purple, C.yellow, C.blue, C.pink][Math.random() * 5 | 0] }); }
    };
    make();
    const draw = (t) => {
      const now = t || performance.now(); g.clear('#e6edf3');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.px(1 + x, 1 + y, SCENE[y][x]); g.px(17 + x, 1 + y, SCENE[y][x]); }
      for (const d of diffs) g.rect(17 + d.x, 1 + d.y, 2, 2, d.c);
      for (const i of found) { const d = diffs[i]; for (const [ox, oy] of [[-1, -1], [2, -1], [-1, 2], [2, 2], [0, -1], [1, -1], [0, 2], [1, 2], [-1, 0], [-1, 1], [2, 0], [2, 1]]) g.px(17 + d.x + ox, 1 + d.y + oy, Math.floor(now / 200) % 2 ? C.red : C.white); }
      if (found.size === 3 && !el.dataset.done) { el.dataset.done = '1'; setTimeout(() => { make(); delete el.dataset.done; }, 1400); }
    };
    const redraw = animate(el, draw);
    canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e); const px = x >= 17 ? x - 17 : x - 1; const py = y - 1;
      const i = diffs.findIndex((d) => px >= d.x - 1 && px <= d.x + 2 && py >= d.y - 1 && py <= d.y + 2);
      if (i >= 0 && !found.has(i)) { found.add(i); note(5 + found.size * 2, { length: 0.14 }); } else if (i < 0) note(0, { length: 0.06, volume: 0.02 });
      redraw();
    });
  },
  // A busy garden with one cat hiding in it
  find(el) {
    const N = 24; const g = pixelCanvas(el.querySelector('canvas'), N, N); const canvas = el.querySelector('canvas');
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
      if (foundAt) { const r = 4 + ((now - foundAt) / 90) % 3; for (let a = 0; a < 6.28; a += 0.4) g.px(cat.x + 2 + Math.cos(a) * r, cat.y + 2 + Math.sin(a) * r, C.red); if (now - foundAt > 1500) make(); }
    };
    const redraw = animate(el, draw);
    canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = g.cell(e);
      if (!foundAt && x >= cat.x - 1 && x <= cat.x + 5 && y >= cat.y - 1 && y <= cat.y + 4) { foundAt = performance.now(); [7, 9, 12].forEach((n, i) => setTimeout(() => note(n, { length: 0.14 }), i * 90)); }
      else if (!foundAt) note(1, { length: 0.05, volume: 0.02 });
      redraw();
    });
  }
};

hero();
// every toy sits in the same square window, whatever its own pixel size
for (const canvas of document.querySelectorAll('[data-toy] canvas')) {
  const view = document.createElement('span'); view.className = 'hp-view'; canvas.replaceWith(view); view.appendChild(canvas);
}
// cards rise in one after another as they come into view
const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (!entry.isIntersecting) return;
  const index = [...entry.target.parentElement.children].indexOf(entry.target);
  setTimeout(() => entry.target.classList.add('is-in'), reduced ? 0 : (index % 3) * 90);
  reveal.unobserve(entry.target);
}), { threshold: 0.2 });
document.querySelectorAll('.hp-toy').forEach((el) => reveal.observe(el));
for (const el of document.querySelectorAll('[data-toy]')) {
  try { TOYS[el.dataset.toy]?.(el); } catch (error) { console.warn('toy', el.dataset.toy, error); }
  // the "もうすぐ" toys are not links: touching them only plays, never navigates
  if (el.tagName !== 'A') el.addEventListener('click', (e) => e.preventDefault());
}
