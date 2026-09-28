/**
 * PiXiEED arcade helpers shared by the play tools: pixel icons, tiny sounds, a self-assembling title picture,
 * a play timer, confetti and the celebration card. Pure DOM + canvas, no dependencies.
 */
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const ARC = { ink: '#17232d', night: '#15202b', red: '#e75445', yellow: '#ffd35a', green: '#5fb36b', sky: '#8ecdf0', blue: '#315fd0', pink: '#f3a6c0', orange: '#f29b52', white: '#ffffff', brown: '#8a5a3c', grey: '#9aa6b2' };
const KEY = { k: ARC.ink, r: ARC.red, y: ARC.yellow, g: ARC.green, s: ARC.sky, b: ARC.blue, p: ARC.pink, o: ARC.orange, w: ARC.white, n: ARC.brown, e: ARC.grey };

/** A crisp pixel icon as inline SVG from rows like ['.kk.', 'kyyk'] (. = empty). */
export function pixelIcon(rows, label = '') {
  const h = rows.length; const w = Math.max(...rows.map((r) => r.length));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('aria-hidden', label ? 'false' : 'true');
  if (label) svg.setAttribute('aria-label', label);
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (!KEY[c]) return; const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1); r.setAttribute('fill', KEY[c]); svg.appendChild(r);
  }));
  return svg;
}
export const ICON = {
  brush: ['.......kk', '......kyk', '.....kyk.', '....kyk..', '...kyk...', '..kpk....', '.krrk....', 'krrk.....', 'kkk......'],
  globe: ['...kkk...', '.kkbgbkk.', '.kbggbbk.', 'kbbggbbgk', 'kbbbgbggk', 'kgbbbbggk', '.kgbbbbk.', '.kkbbbkk.', '...kkk...'],
  photo: ['kkkkkkkkk', 'kssssssyk', 'kssssssss', 'ksskssssk', 'kskgkssek', 'kkgggkeek', 'kgggggggk', 'kgggggggk', 'kkkkkkkkk'],
  star: ['....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '.yyy.yyy.', '.yy...yy.']
};

// ---------- sounds: short, soft, on a pentatonic scale ----------
let audio = null;
function ctx() { try { audio ??= new AudioContext(); if (audio.state === 'suspended') audio.resume(); return audio; } catch { return null; } }
export function tone(freq, { type = 'triangle', length = 0.14, volume = 0.05, at = 0, slide = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at; const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + length);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + length + 0.03);
}
const NOTE = (step) => 261.63 * 2 ** (([0, 2, 4, 7, 9][((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);
export const sfx = {
  tap: () => tone(NOTE(7), { length: 0.07, volume: 0.035, type: 'square' }),
  pick: (i = 0) => tone(NOTE(5 + i), { length: 0.1, volume: 0.04 }),
  snap: (combo = 0) => { tone(NOTE(8 + Math.min(combo, 6)), { length: 0.09, volume: 0.05, type: 'square' }); tone(NOTE(10 + Math.min(combo, 6)), { length: 0.16, volume: 0.03, at: 0.05 }); },
  start: () => [0, 2, 4, 7].forEach((n, i) => tone(NOTE(n + 5), { length: 0.12, volume: 0.045, type: 'square', at: i * 0.07 })),
  fanfare: () => { [0, 2, 4, 7, 9, 12].forEach((n, i) => tone(NOTE(n + 5), { length: 0.18, volume: 0.05, type: 'square', at: i * 0.09 })); tone(NOTE(17), { length: 0.7, volume: 0.05, at: 0.6 }); tone(NOTE(14), { length: 0.7, volume: 0.03, at: 0.6 }); }
};

// ---------- a play timer that survives reloads per game ----------
export function formatTime(ms) { const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
export function createTimer(onTick, storagePrefix = 'pixieed:arcade:time:') {
  let id = null; let base = 0; let since = 0; let running = false; let raf = 0;
  const read = (k) => { try { return Number(localStorage.getItem(storagePrefix + k)) || 0; } catch { return 0; } };
  const write = () => { if (!id) return; try { localStorage.setItem(storagePrefix + id, String(Math.round(elapsed()))); } catch { /* private mode */ } };
  const elapsed = () => base + (running ? performance.now() - since : 0);
  const loop = () => { onTick(elapsed()); if (running) raf = setTimeout(loop, 250); };
  addEventListener('pagehide', write); document.addEventListener('visibilitychange', () => { if (document.hidden) write(); });
  setInterval(write, 5000);
  return {
    use(gameId) { if (gameId === id) return; write(); id = gameId; base = read(gameId); since = performance.now(); onTick(elapsed()); },
    start() { if (running) return; running = true; since = performance.now(); clearTimeout(raf); loop(); },
    stop() { if (!running) return; base = elapsed(); running = false; clearTimeout(raf); write(); onTick(base); },
    elapsed, get running() { return running; }
  };
}

// ---------- confetti ----------
export function confetti(canvas, { duration = 2600, colors = [ARC.red, ARC.yellow, ARC.green, ARC.sky, ARC.pink, ARC.blue, ARC.white] } = {}) {
  if (reduced) return;
  const r = canvas.getBoundingClientRect(); const scale = 4; // chunky pixel confetti
  canvas.width = Math.max(1, Math.round(r.width / scale)); canvas.height = Math.max(1, Math.round(r.height / scale));
  const g = canvas.getContext('2d'); const W = canvas.width; const H = canvas.height;
  const bits = Array.from({ length: Math.round(W * 1.4) }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.55, vx: (Math.random() - 0.5) * W * 1.6, vy: -H * (0.9 + Math.random() * 0.9), c: colors[(Math.random() * colors.length) | 0], s: Math.random() < 0.3 ? 2 : 1, spin: Math.random() * 6 }));
  const t0 = performance.now(); let last = t0;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; g.clearRect(0, 0, W, H);
    for (const b of bits) { b.vy += H * 1.6 * dt; b.vx *= 0.985; b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 10; g.fillStyle = b.c; g.fillRect(b.x | 0, b.y | 0, Math.abs(Math.sin(b.spin)) > 0.4 ? b.s : 1, b.s); }
    if (now - t0 < duration) requestAnimationFrame(frame); else g.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}

// ---------- the title picture: pieces fly in and click together, over and over ----------
const DEMO = [
  'ssssssssssssssss', 'sssssssssssyyyss', 'sswwwssssssyyyss', 'swwwwwsssssyyyss', 'sssssssssrrsssss', 'ssssssssrrrrssss',
  'sssggsssrrrrrsss', 'ssggggsswwwwwsss', 'sggggggswbwwbsss', 'ssggggsswwwwwsss', 'sssnnssswwnnwsss', 'gggnngggwwnnwggg',
  'gggggggggggggggg', 'ggpgggggyggggpgg', 'gggggpgggggggggg', 'gggggggggggggggg'
];
export function demoPicture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
  DEMO.forEach((row, y) => [...row].forEach((ch, x) => { g.fillStyle = KEY[ch] || ARC.sky; g.fillRect(x, y, 1, 1); }));
  return c;
}
export function assembleTitle(canvas, { grid = 3 } = {}) {
  let picture = demoPicture(); let t0 = performance.now(); let raf = 0; let visible = true;
  const g = canvas.getContext('2d'); const W = 180; const H = 64; canvas.width = W; canvas.height = H; g.imageSmoothingEnabled = false;
  let scatter = [];
  const reshuffle = () => { scatter = Array.from({ length: grid * grid }, () => ({ x: (Math.random() - 0.5) * W * 0.9, y: (Math.random() - 0.5) * H * 0.7, r: ((Math.random() * 4) | 0) * Math.PI / 2 })); };
  reshuffle();
  const draw = (now) => {
    const cycle = 4200; const t = ((now - t0) % cycle) / cycle; if (t < 0.02) reshuffle();
    g.clearRect(0, 0, W, H);
    const size = 54; const ox = (W - size) / 2; const oy = (H - size) / 2; const cell = size / grid;
    const pw = picture.width / grid; const ph = picture.height / grid;
    // a faint frame where the picture belongs
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    for (let i = 0; i < grid * grid; i++) {
      const col = i % grid; const row = (i / grid) | 0; const s = scatter[i];
      const start = 0.08 + i * 0.035; const p = reduced ? 1 : Math.max(0, Math.min(1, (t - start) / 0.22)); const out = t > 0.86 ? (t - 0.86) / 0.14 : 0;
      const e = 1 - (1 - p) ** 3; const k = (1 - e) + out * out;
      const x = ox + col * cell + s.x * k; const y = oy + row * cell + s.y * k;
      g.save(); g.translate(Math.round(x + cell / 2), Math.round(y + cell / 2)); g.rotate(s.r * k);
      g.drawImage(picture, col * pw, row * ph, pw, ph, -cell / 2, -cell / 2, cell, cell);
      if (p < 1 || out) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.strokeRect(-cell / 2 + 0.5, -cell / 2 + 0.5, cell - 1, cell - 1); }
      g.restore();
      const landed = start + 0.22; if (!reduced && !out && t >= landed && t < landed + 0.035) { g.fillStyle = 'rgba(255,211,90,.9)'; g.fillRect(Math.round(ox + col * cell), Math.round(oy + row * cell), cell, 1); }
    }
    if (visible && !reduced) raf = requestAnimationFrame(draw);
  };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(draw); }).observe(canvas);
  draw(performance.now());
  return { setPicture(source) { picture = source || demoPicture(); t0 = performance.now(); reshuffle(); if (reduced) draw(performance.now()); } };
}

// ---------- the celebration card ----------
export function winOverlay(host, { title = 'かんせい！', stars = 0, maxStars = 4, stats = [], actions = [] }) {
  let overlay = host.querySelector(':scope > .arc-win');
  if (!overlay) { overlay = document.createElement('div'); overlay.className = 'arc-win'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'false'); host.appendChild(overlay); }
  const card = document.createElement('div'); card.className = 'arc-win-card arc-panel';
  const h = document.createElement('p'); h.className = 'arc-win-title'; h.textContent = title;
  const starRow = document.createElement('div'); starRow.className = 'arc-win-stars'; starRow.setAttribute('aria-label', `むずかしさ ${stars} / ${maxStars}`);
  for (let i = 0; i < maxStars; i++) { const s = document.createElement('i'); s.textContent = '★'; if (i >= stars) s.className = 'is-off'; s.style.animationDelay = `${0.15 + i * 0.12}s`; starRow.appendChild(s); }
  const dl = document.createElement('dl'); dl.className = 'arc-win-stats';
  for (const [k, v] of stats) { const d = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; d.append(dt, dd); dl.appendChild(d); }
  const row = document.createElement('div'); row.className = 'arc-win-actions';
  for (const a of actions) { const b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; b.className = a.primary ? 'arc-start' : 'arc-press arc-sub-button'; b.addEventListener('click', a.onClick); row.appendChild(b); }
  const confettiCanvas = document.createElement('canvas'); confettiCanvas.className = 'arc-confetti'; confettiCanvas.setAttribute('aria-hidden', 'true');
  card.append(h, starRow, dl, row); overlay.replaceChildren(confettiCanvas, card); overlay.hidden = false;
  h.setAttribute('tabindex', '-1'); requestAnimationFrame(() => { confetti(confettiCanvas); h.focus({ preventScroll: true }); });
  sfx.fanfare();
  return { close() { overlay.hidden = true; } };
}

/** A little "+1" that floats up from a point inside host. */
export function floatText(host, x, y, text = '+1') {
  const f = document.createElement('span'); f.className = 'arc-float'; f.textContent = text; f.style.left = `${x}px`; f.style.top = `${y}px`;
  host.appendChild(f); setTimeout(() => f.remove(), 950);
}

// ---------- title demos for the other play tools ----------
const CAT = ['o...o', 'ooooo', 'okoko', 'oopoo', '.ooo.'];
function drawRows(g, rows, x0, y0, s = 1) { rows.forEach((row, y) => [...row].forEach((ch, x) => { if (KEY[ch]) { g.fillStyle = KEY[ch]; g.fillRect(x0 + x * s, y0 + y * s, s, s); } })); }
/**
 * A small looping scene that shows what the tool is about:
 *  'spot'   two pictures side by side, the differences get circled one by one
 *  'find'   a magnifier drifts over a picture until it finds the hidden cat
 *  'runner' a little hero runs, jumps and collects stars
 */
export function demoTitle(canvas, kind) {
  const W = 180; const H = 64; canvas.width = W; canvas.height = H; const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
  const pic = demoPicture(); let raf = 0; let visible = true; const t0 = performance.now();
  const diffs = [[3, 2, 'r'], [12, 5, 'b'], [6, 13, 'y']];
  const frame = (now) => {
    const t = (now - t0) / 1000; g.clearRect(0, 0, W, H);
    if (kind === 'spot') {
      const s = 3; const y = 8; const ax = 30; const bx = 102;
      g.drawImage(pic, ax, y, 16 * s, 16 * s); g.drawImage(pic, bx, y, 16 * s, 16 * s);
      for (const [x, yy, c] of diffs) { g.fillStyle = KEY[c]; g.fillRect(bx + x * s, y + yy * s, s * 2, s * 2); }
      const shown = reduced ? 3 : Math.floor((t % 5) / 1.2);
      diffs.slice(0, Math.min(3, shown)).forEach(([x, yy]) => { g.strokeStyle = ARC.yellow; g.lineWidth = 2; g.beginPath(); g.arc(bx + x * s + s, y + yy * s + s, 7, 0, 6.3); g.stroke(); });
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(88, 28, 4, 2); g.fillRect(88, 33, 4, 2); // =
    } else if (kind === 'find') {
      const s = 3; const x0 = 66; const y0 = 8; g.drawImage(pic, x0, y0, 16 * s, 16 * s);
      const cx = 11; const cy = 9; drawRows(g, CAT, x0 + cx * s, y0 + cy * s, 1);
      const cycle = reduced ? 1 : (t % 5) / 5; const tx = x0 + cx * s + 2; const ty = y0 + cy * s + 2;
      const k = Math.min(1, cycle / 0.7); const mx = x0 + 6 + (tx - x0 - 6) * k + Math.sin(t * 3) * 8 * (1 - k); const my = y0 + 10 + (ty - y0 - 10) * k + Math.cos(t * 2.4) * 6 * (1 - k);
      const found = cycle > 0.7;
      g.strokeStyle = found ? ARC.yellow : ARC.white; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 9, 0, 6.3); g.stroke();
      g.strokeStyle = ARC.brown; g.lineWidth = 3; g.beginPath(); g.moveTo(mx + 7, my + 7); g.lineTo(mx + 14, my + 14); g.stroke();
      if (found) for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 2; g.fillStyle = ARC.yellow; g.fillRect(Math.round(mx + Math.cos(a) * 14), Math.round(my + Math.sin(a) * 14), 2, 2); }
    } else {
      const ground = 50; const speed = 40; const off = reduced ? 0 : (t * speed) % 16;
      g.fillStyle = ARC.green; g.fillRect(0, ground, W, 3); g.fillStyle = '#3f7a4a'; for (let x = -off; x < W; x += 16) g.fillRect(Math.round(x), ground + 3, 8, 2);
      for (let i = 0; i < 4; i++) { const sx = ((i * 52 - (reduced ? 0 : t * speed)) % (W + 20) + W + 20) % (W + 20) - 10; const sy = 22 + (i % 2) * 8; if (Math.abs(sx - 60) > 6 || reduced) drawRows(g, ['.y.', 'yyy', '.y.'], Math.round(sx), sy, 2); }
      const jump = reduced ? 0 : Math.max(0, Math.sin(t * 4.2)) * 18; const hx = 56; const hy = ground - 12 - jump;
      drawRows(g, ['.kk.', 'kwwk', 'kwwk', '.rr.', 'r..r'], hx, Math.round(hy), 3);
    }
    if (visible && !reduced) raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(frame); }).observe(canvas);
  frame(performance.now());
}

/** Confetti over the whole page for a moment (no card), for "done!" moments inside editors. */
export function burst() {
  const c = document.createElement('canvas'); c.className = 'arc-burst'; c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c); requestAnimationFrame(() => confetti(c, { duration: 2200 })); setTimeout(() => c.remove(), 2400);
  sfx.fanfare();
}
