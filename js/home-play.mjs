/**
 * PiXiEED home: the page is a set of small working toys.
 *
 * The first screen is a pixel canvas — drag to draw, every new dot plays a note (a taste of the editor and
 * the sound tool together). Below it, each tool card runs a tiny live version of that tool. Toys animate only
 * while on screen. Reduced motion keeps a gentle update rate and suppresses the letter entrance and wave.
 */
import { createVisibleAnimationScheduler } from './home-animation.mjs?rev=20260928-visible-motion-1';

const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionPreference.matches;
const animationScheduler = createVisibleAnimationScheduler(globalThis);
animationScheduler.setReducedMotion(reduced);
const updateMotionPreference = (event) => { reduced = event.matches; animationScheduler.setReducedMotion(reduced); };
if (motionPreference.addEventListener) motionPreference.addEventListener('change', updateMotionPreference);
else motionPreference.addListener?.(updateMotionPreference);
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

// ---------- seven colours, seven instruments (fixed on the home page) ----------
// red ピアノ / yellow 鉄琴 / green マリンバ / sky フルート / blue ベース / pink オルゴール / white ドラム
const INSTRUMENTS = ['ピアノ', '鉄琴', 'マリンバ', 'フルート', 'ベース', 'オルゴール', 'ドラム'];
let noiseBuffer = null;
function play(inst, step, { volume = 0.05 } = {}) {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const octave = Math.floor(step / SCALE.length); const degree = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
    const f = 261.63 * 2 ** ((octave * 12 + degree) / 12);
    const out = audio.createGain(); out.gain.value = 1; out.connect(audio.destination);
    // one partial: frequency, wave, peak, attack, decay
    const tone = (freq, type, peak, attack, decay, from = t) => {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, from); g.gain.exponentialRampToValueAtTime(peak, from + attack); g.gain.exponentialRampToValueAtTime(0.0001, from + attack + decay);
      o.connect(g).connect(out); o.start(from); o.stop(from + attack + decay + 0.05); return o;
    };
    const noise = (filterType, freq, peak, decay) => {
      if (!noiseBuffer) { noiseBuffer = audio.createBuffer(1, audio.sampleRate * 0.5, audio.sampleRate); const d = noiseBuffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const src = audio.createBufferSource(); src.buffer = noiseBuffer;
      const filter = audio.createBiquadFilter(); filter.type = filterType; filter.frequency.value = freq;
      const g = audio.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      src.connect(filter).connect(g).connect(out); src.start(t); src.stop(t + decay + 0.05);
    };
    switch (inst) {
      case 0: // ピアノ: bright hit, slow fade, a touch of the octave
        tone(f, 'triangle', volume, 0.005, 0.6); tone(f * 2, 'sine', volume * 0.3, 0.005, 0.3); break;
      case 1: // 鉄琴: an octave up, with the metal's out-of-tune partial
        tone(f * 2, 'sine', volume * 0.9, 0.002, 1.1); tone(f * 2 * 2.76, 'sine', volume * 0.25, 0.002, 0.25); break;
      case 2: // マリンバ: wooden and short, an octave down
        tone(f / 2, 'sine', volume * 1.3, 0.003, 0.32); tone(f * 2, 'sine', volume * 0.35, 0.002, 0.06); break;
      case 3: { // フルート: breathy, soft start, a little vibrato
        const o = tone(f * 2, 'sine', volume * 0.9, 0.06, 0.38);
        const lfo = audio.createOscillator(); const depth = audio.createGain(); lfo.frequency.value = 5.5; depth.gain.value = f * 0.012;
        lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + 0.5);
        noise('bandpass', f * 2, volume * 0.12, 0.12); break;
      }
      case 4: { // ベース: a low saw through a closing filter
        const o = audio.createOscillator(); const filter = audio.createBiquadFilter(); const g = audio.createGain();
        o.type = 'sawtooth'; o.frequency.value = f / 4; filter.type = 'lowpass'; filter.Q.value = 6;
        filter.frequency.setValueAtTime(900, t); filter.frequency.exponentialRampToValueAtTime(160, t + 0.3);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume * 1.6, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(filter).connect(g).connect(out); o.start(t); o.stop(t + 0.4); break;
      }
      case 5: // オルゴール: tiny and high, a comb-like second tine
        tone(f * 4, 'sine', volume * 0.7, 0.001, 0.7); tone(f * 4 * 1.003, 'triangle', volume * 0.2, 0.001, 0.4); break;
      default: { // ドラム: height picks the drum — low = kick, middle = snare, high = hi-hat
        const kind = ((step % 3) + 3) % 3;
        if (kind === 0) { const o = audio.createOscillator(); const g = audio.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18); g.gain.setValueAtTime(volume * 2.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g).connect(out); o.start(t); o.stop(t + 0.25); }
        else if (kind === 1) { noise('bandpass', 1800, volume * 1.6, 0.16); tone(190, 'triangle', volume * 0.8, 0.001, 0.08); }
        else noise('highpass', 7000, volume * 0.9, 0.05);
      }
    }
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
// Shared viewport-aware frame pump; reduced motion remains gently animated.
function animate(element, draw) {
  animationScheduler.add(element, draw);
  return () => animationScheduler.redraw(element);
}

// ---------- a 3×5 pixel font for the hero word ----------
const FONT = {
  P: ['###', '#.#', '###', '#..', '#..'], i: ['.', '#', '.', '#', '#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'], D: ['##.', '#.#', '#.#', '#.#', '##.']
};
const WORD = ['P', 'i', 'X', 'i', 'E', 'E', 'D'];
const WORD_COLORS = [C.red, C.yellow, C.sky, C.yellow, C.green, C.pink, C.orange];

// 10×10 icons for the invitations
const ICONS = {
  editor: ['..........', '.......kk.', '......kyyk', '.....kyyk.', '....kyyk..', '...kyyk...', '..kyyk....', '.kpyk.....', '.kkk......', '..........'],
  game: ['..........', '..........', '.kkkkkkkk.', 'kwwwwwwwwk', 'kwkwwwwrwk', 'kkkkwwbwrk', 'kwkwwwwgwk', 'kwwwwwwwwk', '.kkk..kkk.', '..........'],
  find: ['..........', '..kkkk....', '.kssssk...', 'kswsssk...', 'kswssssk..', '.kssssk...', '..kkkkkk..', '......kkk.', '.......kkk', '........k.'],
  sound: ['..........', '....kkkkk.', '....kvvvk.', '....k...k.', '....k...k.', '..kkk.kkk.', '.kvvk.kvvk', '.kvvk.kvvk', '..kk...kk.', '..........']
};

// =========================================================================================================
// Hero
// =========================================================================================================
function hero() {
  // One canvas, many small plays (everything makes a sound, all on one pentatonic scale):
  //  ・描く — drag to draw; let go and the drawing drops as one piece; a full row clears like Tetris
  //  ・文字 — dragging through PiXiEED knocks letters loose, a tap bursts one; flying dots catch stars they hit
  //  ・星 — tap a star to catch it; a shooting star is worth five
  //  ・ねこ — now and then a cat peeks out between the stars; tap it before it hides
  //  ・楽譜 — a light sweeps the pile left to right and plays it: height is pitch, colour is instrument
  //  ・傾ける / 振る — on a phone the sand flows with the tilt, and a shake knocks the pile loose
  const stage = document.getElementById('hpStage'); const canvas = document.getElementById('hpCanvas');
  const hint = document.getElementById('hpHint');
  // (older markup has neither the score nor the new hint: supply them)
  let score = document.getElementById('hpScore');
  if (!score) { score = document.createElement('output'); score.className = 'hp-score'; score.id = 'hpScore'; score.hidden = true; stage.appendChild(score); }
  hint.innerHTML = '<span aria-hidden="true">☝</span> 描いて、はなして、そろえて消す';
  const colors = [C.red, C.yellow, C.green, C.sky, C.blue, C.pink, C.white];
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const RGB = colors.map(rgb); const WORD_RGB = WORD_COLORS.map(rgb);
  const NIGHT = rgb(C.night); const WHITE = [255, 255, 255]; const GOLD = rgb(C.yellow);
  const BR = 2;                   // brush: 2×2 cells
  let color = 0; let W = 108; let H = 60; let F = 60; let cell = 4; let K = 2; // F: floor row; K: cells per old 9px dot
  let img = null; let ctx = null;
  let ink = new Map();            // dots being drawn right now (key -> {x,y,color,born})
  let sand = null;                // settled / falling sand: colour index + 1 per cell, 0 = empty
  let dots = [];                  // letter dots with physics
  let stars = []; let caught = 0; let bursts = []; let combo = 0; let lastCatch = 0;
  let pieces = []; let flashes = []; let lines = 0; let grains = 0; // dropped drawings, rows being cleared
  let shooter = null; let nextShooter = 0; let cat = null; let nextCat = 0; let beats = [];
  let tilt = 0; let wordTop = 0; let wordBottom = 0; let burstNo = 0; const burstCatches = new Map();
  let drawing = false; let last = null; let downAt = null;
  // what this visitor seems to enjoy: after enough of one play, the matching tool is offered once
  const interest = { ink: 0, letters: 0 };
  let cursor = null; let pen = false; // keyboard play
  const colorBox = document.getElementById('hpColors');
  colors.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.style.setProperty('--c', c);
    b.setAttribute('aria-label', `色 ${i + 1}（${INSTRUMENTS[i]}）`); b.title = INSTRUMENTS[i];
    b.addEventListener('click', () => { color = i; syncColors(); [5, 7, 9].forEach((n, k) => setTimeout(() => play(i, n), k * 110)); });
    colorBox.appendChild(b);
  });
  const syncColors = () => [...colorBox.children].forEach((b, i) => b.setAttribute('aria-checked', String(i === color)));
  syncColors();

  const cellFor = (width) => (width < 520 ? 3.6 : width < 900 ? 5 : 7);
  const newStar = () => ({ x: 2 + Math.random() * (W - 4) | 0, y: 2 + Math.random() * (H * 0.55) | 0, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.4, big: Math.random() < 0.3 });
  function layout() {
    const r = stage.getBoundingClientRect();
    cell = cellFor(r.width); K = 9 / cell;
    W = Math.max(40, Math.round(r.width / cell)); H = Math.max(30, Math.round(r.height / cell));
    canvas.width = W; canvas.height = H; ctx = canvas.getContext('2d'); img = ctx.createImageData(W, H);
    sand = new Uint8Array(W * H); pieces = []; flashes = []; beats = []; ink.clear();
    const bar = document.querySelector('.hp-tools').getBoundingClientRect();
    F = Math.max(12, Math.min(H, Math.floor((bar.top - r.top - 6) / (r.height / H))));
    const wordWidth = WORD.reduce((s, ch) => s + FONT[ch][0].length + 1, -1);
    const scale = Math.max(2, Math.min(4, Math.floor((W - 8) / wordWidth)));
    let x0 = Math.floor((W - wordWidth * scale) / 2); const y0 = Math.floor(H * 0.2);
    dots = [];
    WORD.forEach((ch, li) => {
      FONT[ch].forEach((row, j) => [...row].forEach((c, i) => {
        if (c !== '#') return;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const hx = x0 + i * scale + sx; const hy = y0 + j * scale + sy;
          dots.push({ li, hx, hy, x: hx, y: -2 - Math.random() * 12 * K, vx: 0, vy: 0, color: WORD_RGB[li], delay: li * 90 + Math.random() * 260, state: 'intro', until: 0 });
        }
      }));
      x0 += (FONT[ch][0].length + 1) * scale;
    });
    wordTop = y0; wordBottom = y0 + 5 * scale;
    stars = Array.from({ length: Math.max(14, Math.min(40, Math.round(W * H / 380))) }, newStar);
  }
  const isSolid = (x, y) => y >= F || (x >= 0 && x < W && y >= 0 && sand[y * W + x] > 0);
  const reach = (px) => Math.max(1, Math.ceil(px / cell)); // a finger-sized distance in cells

  // ---- letters: a tap or a stroke bursts a letter, dots bounce, then fly home ----
  function burstLetter(li, fromX, fromY) {
    let any = false;
    for (const d of dots) {
      if (d.li !== li || d.state === 'free') continue;
      any = true; d.state = 'free'; d.burst = burstNo + 1; d.until = performance.now() + 2600 + Math.random() * 500;
      const ang = Math.atan2(d.y - fromY, d.x - fromX) + (Math.random() - 0.5) * 0.9; const sp = (14 + Math.random() * 16) * K;
      d.vx = Math.cos(ang) * sp; d.vy = Math.sin(ang) * sp - 14 * K;
    }
    if (any) {
      burstNo += 1;
      note(li + 6, { length: 0.22, volume: 0.06, type: 'square' }); note(li + 8, { length: 0.22, volume: 0.03 });
      interest.letters += 1; if (interest.letters === 6) invite('sound');
    }
    return any;
  }
  function letterAt(x, y, r = 1) { const hit = dots.find((d) => Math.abs(Math.round(d.x) - x) <= r && Math.abs(Math.round(d.y) - y) <= r && d.state !== 'free'); return hit ? hit.li : -1; }

  // ---- stars: tap to catch; flying letter dots catch them too, and quick catches chain upward ----
  function bumpScore(worth) {
    caught += worth;
    score.textContent = `★ ${caught}`; score.hidden = false; score.classList.remove('is-pop'); requestAnimationFrame(() => score.classList.add('is-pop'));
  }
  function takeStar(i) {
    const s = stars[i]; stars[i] = newStar(); bumpScore(1);
    const now = performance.now(); combo = now - lastCatch < 900 ? combo + 1 : 1; lastCatch = now;
    sparkle(s.x, s.y, s.big ? GOLD : WHITE, 10);
    play(1, 10 + Math.min(combo, 10), { volume: 0.045 }); if (combo > 1) play(5, 12 + Math.min(combo, 10), { volume: 0.03 });
    if (caught >= 4) invite('find');
  }
  function catchStar(x, y) {
    const r = reach(16);
    const i = stars.findIndex((s) => Math.abs(s.x - x) <= r && Math.abs(s.y - y) <= r);
    if (i < 0) return false;
    takeStar(i); return true;
  }
  function sparkle(x, y, c, n, speed = 12) {
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.28 + Math.random() * 0.3; bursts.push({ x, y, vx: Math.cos(a) * speed * K, vy: Math.sin(a) * speed * K, life: 1, color: c }); }
  }

  // ---- a shooting star now and then: worth five ----
  function catchShooter(x, y) {
    if (!shooter) return false;
    const r = reach(28);
    if (Math.abs(shooter.x - x) > r || Math.abs(shooter.y - y) > r) return false;
    const { x: sx, y: sy } = shooter; shooter = null;
    bumpScore(5); if (caught >= 4) invite('find');
    sparkle(sx, sy, GOLD, 24, 20); [0, 2, 4, 7, 9].forEach((n, i) => setTimeout(() => play(1, n + 10, { volume: 0.04 }), i * 60));
    return true;
  }
  // ---- a cat that peeks out between the stars ----
  const CAT = sprite(['o.....o', 'oo...oo', 'ooooooo', 'okoooko', 'ooopooo', '.ooooo.']).map((row) => row.map((c) => c && rgb(c)));
  function catchCat(x, y) {
    if (!cat || cat.seen) return false;
    const m = reach(10); const s = cat.scale;
    if (x < cat.x - m || x > cat.x + 7 * s + m || y < cat.y - m || y > cat.y + 6 * s + m) return false;
    cat.seen = performance.now();
    for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28; const sp = (8 + Math.random() * 18) * K; bursts.push({ x: cat.x + 3.5 * s, y: cat.y + 3 * s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6 * K, life: 1.2, color: RGB[k % RGB.length] }); }
    try { // にゃ: a little falling glide
      if (soundOn) { audio ??= new AudioContext(); const t = audio.currentTime; const o = audio.createOscillator(); const g = audio.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(560, t + 0.28); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.35); }
    } catch { /* no audio */ }
    invite('find');
    return true;
  }

  // ---- the pile is a score: a light sweeps it and plays each column's top grain ----
  const STEPS = 16; const BAR_MS = 4000; let lastStep = -1;
  function playPile(now) {
    const stepIndex = Math.floor((now % BAR_MS) / (BAR_MS / STEPS));
    if (stepIndex === lastStep) return; lastStep = stepIndex;
    if (!grains) return;
    const x0 = Math.floor((stepIndex * W) / STEPS); const x1 = Math.floor(((stepIndex + 1) * W) / STEPS);
    let top = F; let tx = -1;
    for (let x = x0; x < x1; x++) for (let y = 0; y < top; y++) if (sand[y * W + x]) { top = y; tx = x; break; }
    if (tx < 0) return;
    const v = sand[top * W + tx]; const height = (F - top) / F;
    play(v - 1, 2 + Math.round(height * 12), { volume: 0.035 });
    beats.push({ x: tx, y: top, life: 1 });
  }

  // ---- phones: tilt to pour the sand sideways, shake to knock the pile loose ----
  let askedMotion = false; let lastShake = 0;
  function listenMotion() {
    addEventListener('deviceorientation', (e) => { if (e.gamma != null) tilt = Math.max(-1, Math.min(1, e.gamma / 35)); });
    let prev = null;
    addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
      if (prev) { const jolt = Math.abs(a.x - prev.x) + Math.abs(a.y - prev.y) + Math.abs(a.z - prev.z); const now = performance.now(); if (jolt > 28 && now - lastShake > 600) { lastShake = now; shake(); } }
      prev = { x: a.x, y: a.y, z: a.z };
    });
  }
  function askMotion() { // iOS asks once, and only from a gesture; elsewhere the events just flow
    if (askedMotion) return; askedMotion = true;
    const ask = globalThis.DeviceOrientationEvent?.requestPermission;
    if (typeof ask === 'function') ask.call(DeviceOrientationEvent).then((r) => { if (r === 'granted') { globalThis.DeviceMotionEvent?.requestPermission?.call(DeviceMotionEvent).catch(() => {}); listenMotion(); } }).catch(() => {});
    else listenMotion();
  }
  function shake() {
    let moved = 0;
    for (let x = 0; x < W; x++) {
      let top = -1; for (let y = 0; y < F; y++) if (sand[y * W + x]) { top = y; break; }
      if (top < 0 || Math.random() < 0.35) continue;
      for (let k = 0; k < 3 && top + k < F; k++) {
        const from = top + k; const v = sand[from * W + x]; if (!v) break;
        const to = Math.max(0, from - Math.round((3 + Math.random() * 9) * K)); const nx = Math.max(0, Math.min(W - 1, x + Math.round((Math.random() - 0.5) * 4 * K)));
        if (!sand[to * W + nx]) { sand[to * W + nx] = v; sand[from * W + x] = 0; moved++; }
      }
    }
    if (moved) [0, 3, 1, 4, 2].forEach((n, i) => setTimeout(() => play(i % 2 ? 4 : 6, n + 2, { volume: 0.04 }), i * 50));
  }

  let start = performance.now(); let lastT = performance.now(); let sandTick = 0; let lastLand = 0;
  function sandStep(now) {
    const lean = Math.abs(tilt) > 0.2 ? Math.sign(tilt) : 0;
    for (let y = F - 2; y >= 0; y--) {
      const dir = (y + Math.floor(now / 33)) % 2 ? 1 : -1;
      for (let k = 0; k < W; k++) {
        const x = dir > 0 ? k : W - 1 - k; const i = y * W + x; const v = sand[i]; if (!v) continue;
        const below = i + W;
        if (!sand[below]) { sand[below] = v; sand[i] = 0; if (y === F - 2 || sand[below + W]) maybeLand(now, x, y + 1, v - 1); continue; }
        const side = lean || (Math.random() < 0.5 ? 1 : -1);
        let slid = false;
        for (const sx of lean ? [side] : [side, -side]) { const nx = x + sx; if (nx >= 0 && nx < W && !sand[below + sx] && !sand[i + sx]) { sand[below + sx] = v; sand[i] = 0; slid = true; break; } }
        // a strong tilt lets grains roll along the surface, not just down the slope
        if (!slid && lean && Math.random() < Math.abs(tilt) * 0.5) { const nx = x + lean; if (nx >= 0 && nx < W && !sand[i + lean]) { sand[i + lean] = v; sand[i] = 0; } }
      }
    }
  }
  function step(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    // falling sand and falling pieces: 30 ticks a second, several sand steps per tick on fine grids
    sandTick += dt;
    if (sandTick > 1 / 30) {
      sandTick = 0;
      // a released drawing drops as one piece, speeding up, until any of its dots touches something
      for (const piece of pieces) {
        piece.v = Math.min(piece.v + 0.12 * K, 1.6 * K); piece.acc += piece.v;
        while (piece.acc >= 1 && !piece.landed) {
          piece.acc -= 1;
          if (piece.cells.some((c) => isSolid(c.x, c.y + 1))) piece.landed = true; else for (const c of piece.cells) c.y += 1;
        }
        if (piece.landed) {
          for (const c of piece.cells) { let y = c.y; while (y >= 0 && sand[y * W + c.x]) y--; if (y >= 0) sand[y * W + c.x] = c.v; }
          const mid = piece.cells[piece.cells.length >> 1]; play(mid.v - 1, Math.round((mid.x / W) * 8), { volume: 0.05 });
        }
      }
      pieces = pieces.filter((piece) => !piece.landed);
      const passes = Math.max(1, Math.round(K * 0.9));
      for (let p = 0; p < passes; p++) sandStep(now);
      // a full row vanishes, like Tetris: a flash, the row played as a phrase, and everything above drops
      let cleared = 0;
      for (let y = F - 1; y >= 0; y--) {
        let full = true; for (let x = 0; x < W; x++) if (!sand[y * W + x]) { full = false; break; }
        if (!full) continue;
        const row = Array.from({ length: W }, (_, x) => sand[y * W + x] - 1);
        if (!cleared) for (let k = 0; k < 8; k++) { const x = Math.floor((k + 0.5) * W / 8); setTimeout(() => play(row[x], [0, 2, 4, 7, 9, 7, 4, 2][k] + 7, { volume: 0.04 }), k * 70); }
        for (let x = 0; x < W; x++) {
          const v = sand[y * W + x]; sand[y * W + x] = 0;
          if (x % 3 === 0) bursts.push({ x, y, vx: (Math.random() - 0.5) * 10 * K, vy: (-8 - Math.random() * 10) * K, life: 1, color: Math.random() < 0.5 ? WHITE : RGB[v - 1] });
        }
        flashes.push({ y, life: 1 }); cleared += 1;
      }
      if (cleared) { lines += cleared; invite('game'); }
      // keep the pile from filling the stage: the bottom row slowly melts away when it is tall
      const tall = F - Math.floor(F * 0.45); let filled = 0; grains = 0;
      for (let x = 0; x < W; x++) if (sand[tall * W + x]) filled++;
      for (let i = 0; i < F * W; i++) if (sand[i]) { grains++; }
      if (filled > W * 0.5) for (let x = 0; x < W; x++) if (Math.random() < 0.3) sand[(F - 1) * W + x] = 0;
    }
    playPile(now);
    // letter physics; a flying dot catches any star it touches
    const gravity = 60 * K;
    for (const d of dots) {
      if (d.state === 'intro') {
        const p = reduced ? 1 : Math.min(1, Math.max(0, (now - start - d.delay) / 520));
        const e = 1 - (1 - p) ** 3; d.y = (-2 - 8 * K) * (1 - e) + d.hy * e; d.x = d.hx;
        if (p >= 1) d.state = 'home';
      } else if (d.state === 'free') {
        d.vy += gravity * dt; d.vx += tilt * gravity * 0.5 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < 0) { d.x = 0; d.vx *= -0.6; } if (d.x > W - 1) { d.x = W - 1; d.vx *= -0.6; }
        if (isSolid(Math.round(d.x), Math.round(d.y) + 1) && d.vy > 0) { d.y = Math.round(d.y); d.vy *= -0.45; d.vx *= 0.8; if (Math.abs(d.vy) < 3 * K) d.vy = 0; }
        if (d.y < 0) { d.y = 0; d.vy = Math.abs(d.vy) * 0.5; }
        if (Math.abs(d.vx) + Math.abs(d.vy) > 6 * K) {
          const i = stars.findIndex((s) => Math.abs(s.x - d.x) <= 1.5 && Math.abs(s.y - d.y) <= 1.5);
          const got = burstCatches.get(d.burst) || 0; // one burst catches at most three stars
          if (i >= 0 && got < 3) { burstCatches.set(d.burst, got + 1); takeStar(i); }
        }
        if (now > d.until) d.state = 'return';
      } else if (d.state === 'return') {
        d.x += (d.hx - d.x) * Math.min(1, dt * 7); d.y += (d.hy - d.y) * Math.min(1, dt * 7);
        if (Math.abs(d.x - d.hx) < 0.3 && Math.abs(d.y - d.hy) < 0.3) { d.x = d.hx; d.y = d.hy; d.state = 'home'; }
      }
    }
    if (dots.length && lettersWereHit && dots.every((d) => d.state === 'home')) { lettersWereHit = false; [0, 2, 4, 7].forEach((n, i) => setTimeout(() => note(n + 7, { length: 0.14, volume: 0.035 }), i * 70)); }
    // the shooting star and the cat come and go on their own
    if (!shooter && now > nextShooter) {
      if (nextShooter) shooter = { x: W * (0.05 + Math.random() * 0.4), y: H * (0.04 + Math.random() * 0.12), vx: W * 0.55, vy: H * 0.2 };
      nextShooter = now + 11000 + Math.random() * 9000;
    }
    if (shooter) { shooter.x += shooter.vx * dt; shooter.y += shooter.vy * dt; if (shooter.x > W + 4 || shooter.y > F * 0.7) shooter = null; }
    if (!cat && now > nextCat) {
      if (nextCat) { const s = Math.max(1, Math.round(7 / cell)); const lo = wordBottom + 3; const room = Math.max(0, Math.floor(F * 0.62) - lo - 6 * s); cat = { x: 3 + Math.random() * (W - 7 * s - 6) | 0, y: lo + Math.random() * room | 0, scale: s, born: now, seen: 0 }; }
      nextCat = now + 16000 + Math.random() * 14000;
    }
    if (cat && (cat.seen ? now - cat.seen > 300 : now - cat.born > 4200)) cat = null;
    for (const b of bursts) { b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.9; b.vy *= 0.9; b.life -= dt * 1.8; }
    bursts = bursts.filter((b) => b.life > 0);
    for (const f of flashes) f.life -= dt * 3; flashes = flashes.filter((f) => f.life > 0);
    for (const b of beats) b.life -= dt * 4; beats = beats.filter((b) => b.life > 0);
  }
  let lettersWereHit = false;
  function maybeLand(now, x, y, inst) { if (now - lastLand > 90) { lastLand = now; play(inst, Math.round((x / W) * 8), { volume: 0.014 }); } }

  // ---- drawing into one ImageData: cheap enough for tens of thousands of cells ----
  function put(x, y, c, a = 1) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4; const d = img.data;
    if (a >= 1) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; return; }
    d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
  }
  function draw(t) {
    if (!img) return;
    const now = t || performance.now(); const time = (now - start) / 1000;
    step(now);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = NIGHT[0]; d[i + 1] = NIGHT[1]; d[i + 2] = NIGHT[2]; d[i + 3] = 255; }
    for (const s of stars) {
      const a = 0.35 + 0.45 * Math.sin(time * s.s + s.p);
      if (a <= 0.4) continue;
      if (s.big) { put(s.x, s.y, GOLD, a); if (a > 0.6) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(s.x + dx, s.y + dy, GOLD, a * 0.45); }
      else put(s.x, s.y, WHITE, a);
    }
    if (shooter) for (let i = 0; i < 10; i++) { const k = i / 10; put(shooter.x - shooter.vx * 0.03 * i, shooter.y - shooter.vy * 0.03 * i, i < 2 ? GOLD : WHITE, 1 - k); if (i === 0) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) put(shooter.x + dx, shooter.y + dy, GOLD); }
    for (let x = 0; x < W; x++) put(x, F, WHITE, 0.07);
    // the light that plays the pile
    if (grains) { const px = Math.floor(((now % BAR_MS) / BAR_MS) * W); for (let y = 0; y < F; y++) put(px, y, WHITE, 0.05); }
    for (let i = 0; i < F * W; i++) if (sand[i]) { const c = RGB[sand[i] - 1]; const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; }
    for (const b of beats) put(b.x, b.y, WHITE, b.life);
    for (const dt of dots) {
      if (dt.state === 'intro' && dt.y < -1) continue;
      const wave = dt.state === 'home' && !reduced ? Math.round(Math.sin(time * 2.4 - dt.li * 0.7) * 0.75 * K) : 0;
      put(Math.round(dt.x), Math.round(dt.y) + wave, dt.color);
    }
    if (cat) {
      const age = now - cat.born; const a = cat.seen ? 0 : Math.min(1, age / 500, (4200 - age) / 500);
      const blink = Math.floor(age / 1400) % 3 === 2 && age % 1400 < 160;
      if (a > 0) CAT.forEach((row, j) => row.forEach((c, i) => { if (!c) return; const col = blink && j === 3 && c[0] < 60 ? rgb(C.orange) : c; for (let sy = 0; sy < cat.scale; sy++) for (let sx = 0; sx < cat.scale; sx++) put(cat.x + i * cat.scale + sx, cat.y + j * cat.scale + sy, col, a); }));
    }
    for (const piece of pieces) for (const c of piece.cells) put(c.x, c.y, RGB[c.v - 1]);
    for (const f of flashes) for (let x = 0; x < W; x++) put(x, f.y, WHITE, f.life);
    for (const [, dk] of ink) put(dk.x, dk.y, now - dk.born < 200 ? WHITE : RGB[dk.color]);
    for (const b of bursts) put(Math.round(b.x), Math.round(b.y), b.color, Math.min(1, b.life));
    if (cursor && document.activeElement === canvas) {
      const on = Math.floor(now / 400) % 2 === 0;
      for (let sy = 0; sy < BR; sy++) for (let sx = 0; sx < BR; sx++) put(cursor.x + sx, cursor.y + sy, pen ? RGB[color] : WHITE, pen || on ? 1 : 0.35);
    }
    ctx.putImageData(img, 0, 0);
  }
  const redraw = animate(stage, draw);

  let lastInkNote = 0;
  function inkAt(x, y) {
    const cells = [];
    if (last) { const n = Math.max(Math.abs(x - last.x), Math.abs(y - last.y)); for (let i = 1; i <= n; i++) cells.push({ x: Math.round(last.x + ((x - last.x) * i) / n), y: Math.round(last.y + ((y - last.y) * i) / n) }); } else cells.push({ x, y });
    last = { x, y };
    for (const c of cells) {
      // a stroke through the word knocks letters loose (it never catches stars — that is a tap)
      const li = letterAt(c.x, c.y, BR); if (li >= 0) { lettersWereHit = burstLetter(li, c.x, c.y) || lettersWereHit; continue; }
      let fresh = false;
      for (let sy = 0; sy < BR; sy++) for (let sx = 0; sx < BR; sx++) {
        const px = c.x - (BR >> 1) + sx; const py = c.y - (BR >> 1) + sy; if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const key = `${px},${py}`; if (ink.get(key)?.color === color) continue;
        ink.set(key, { x: px, y: py, color, born: performance.now() }); fresh = true;
      }
      if (!fresh) continue;
      interest.ink += 1; if (interest.ink === 90) invite('editor');
      const now = performance.now(); if (now - lastInkNote > 45) { lastInkNote = now; play(color, Math.round((H - c.y) / H * 12) + 2); }
    }
  }
  // Tap and drag never mix: nothing happens on touch-down. Moving past a small slop starts a stroke (which draws,
  // and knocks loose any letter it passes through — but never catches a star); lifting without moving is a tap
  // (shooting star, cat, letter, star, or else one dot). A long still press counts as drawing a dot.
  const SLOP = 8; const TAP_MS = 400;
  let press = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (press || !e.isPrimary) return;
    const { x, y } = cellOf(e); if (x < 0 || y < 0 || x >= W || y >= H) return;
    hint.classList.add('is-used');
    canvas.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x, y, t: performance.now() }; downAt = { x, y };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const { x, y } = cellOf(e);
    if (!drawing) {
      if (Math.hypot(e.clientX - press.cx, e.clientY - press.cy) < SLOP) return;
      drawing = true; last = null; inkAt(press.x, press.y);
    }
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    inkAt(x, y); redraw();
  });
  function cellOf(e) { const r = canvas.getBoundingClientRect(); return { x: Math.floor(((e.clientX - r.left) / r.width) * W), y: Math.floor(((e.clientY - r.top) / r.height) * H) }; }
  function tap(x, y, quick) {
    if (quick) {
      if (catchShooter(x, y) || catchCat(x, y)) return;
      const li = letterAt(x, y, reach(10));
      if (li >= 0) { lettersWereHit = burstLetter(li, x, y) || lettersWereHit; return; }
      if (catchStar(x, y)) return;
    }
    last = null; inkAt(x, y); release(); last = null;
  }
  canvas.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (drawing) stop(); else tap(press.x, press.y, performance.now() - press.t < TAP_MS);
    press = null; askMotion(); redraw();
  });
  canvas.addEventListener('pointercancel', (e) => { if (press && e.pointerId === press.id) { stop(); press = null; } });
  // letting go drops the drawing
  function release() {
    const cells = [...ink.values()].filter((d) => d.x >= 0 && d.x < W && d.y >= 0 && d.y < F).map((d) => ({ x: d.x, y: d.y, v: d.color + 1 }));
    ink.clear();
    if (cells.length) pieces.push({ cells, v: 0.2 * K, acc: 0, landed: false });
  }
  const stop = () => { if (drawing) release(); drawing = false; last = null; };
  // keyboard: arrows move a dot cursor, Space lifts / lowers the pen, Enter taps (letters, stars, one dot)
  canvas.tabIndex = 0;
  canvas.addEventListener('focus', () => { cursor ??= { x: W >> 1, y: Math.floor(F * 0.7) }; redraw(); });
  canvas.addEventListener('blur', () => { if (pen) { pen = false; stop(); } redraw(); });
  canvas.addEventListener('keydown', (e) => {
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!move && e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault(); hint.classList.add('is-used');
    cursor ??= { x: W >> 1, y: Math.floor(F * 0.7) };
    if (move) {
      cursor = { x: Math.max(0, Math.min(W - BR, cursor.x + move[0] * BR)), y: Math.max(0, Math.min(F - BR, cursor.y + move[1] * BR)) };
      if (pen) inkAt(cursor.x + 1, cursor.y + 1);
    } else if (e.key === ' ') {
      if (e.repeat) return;
      pen = !pen; if (pen) { drawing = true; last = null; inkAt(cursor.x + 1, cursor.y + 1); } else stop();
    } else if (!pen) tap(cursor.x + 1, cursor.y + 1, true);
    redraw();
  });
  document.getElementById('hpClear').addEventListener('click', () => {
    ink.clear(); sand.fill(0); caught = 0; score.hidden = true; pen = false; drawing = false; pieces = []; flashes = []; beats = []; lines = 0;
    for (const d of dots) { d.state = 'intro'; d.y = -2 - Math.random() * 12 * K; d.delay = d.li * 90 + Math.random() * 260; }
    start = performance.now(); note(0, { length: 0.25 }); note(4, { length: 0.25 }); redraw();
  });
  const soundButton = document.getElementById('hpSound');
  soundButton.addEventListener('click', () => { soundOn = !soundOn; soundButton.setAttribute('aria-pressed', String(soundOn)); if (soundOn) note(7); });
  // ---- a gentle nudge toward the tool that matches what they are doing ----
  const shown = new Set(); let inviteTimer = 0;
  const INVITES = {
    editor: { toys: ['editor'], text: 'ドット絵、しっかり描いてみる？' },
    game: { toys: ['game', 'diff', 'find'], text: 'ゲームで遊んでみる？' },
    find: { toys: ['find', 'diff'], text: 'かくれた絵、さがしてみる？' },
    sound: { toys: ['sound'], text: 'ドットで音楽つくってみる？' }
  };
  function invite(kind) {
    const spec = INVITES[kind]; if (!spec || shown.has(kind)) return;
    const cards = spec.toys.map((t) => document.querySelector(`[data-toy="${t}"]`)).filter(Boolean);
    const card = cards.find((c) => c.tagName === 'A') || cards[0]; if (!card) return;
    shown.add(kind);
    let box = document.getElementById('hpInvite');
    if (!box) { box = document.createElement('a'); box.id = 'hpInvite'; box.className = 'hp-invite'; stage.appendChild(box); }
    const icon = document.createElement('canvas'); icon.className = 'hp-invite-icon'; icon.setAttribute('aria-hidden', 'true');
    const art = sprite(ICONS[kind]); pixelCanvas(icon, art[0].length, art.length).sprite(art, 0, 0);
    const label = document.createElement('span'); label.textContent = spec.text;
    const arrow = document.createElement('span'); arrow.className = 'hp-invite-go'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→';
    box.replaceChildren(icon, label, arrow);
    box.dataset.kind = kind;
    const soon = card.tagName !== 'A';
    box.href = soon ? `#${card.id || (card.id = `hpToy-${card.dataset.toy}`)}` : card.getAttribute('href');
    box.onclick = soon ? (e) => {
      e.preventDefault(); hide();
      card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      card.classList.remove('is-called'); requestAnimationFrame(() => card.classList.add('is-called'));
      card.focus({ preventScroll: true });
    } : null;
    box.hidden = false; box.classList.remove('is-in'); requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-in')));
    [7, 9, 12].forEach((n, i) => setTimeout(() => note(n, { length: 0.18, volume: 0.035 }), i * 90));
    clearTimeout(inviteTimer); inviteTimer = setTimeout(hide, 9000);
    function hide() { box.classList.remove('is-in'); setTimeout(() => { if (!box.classList.contains('is-in')) box.hidden = true; }, 400); }
  }

  layout();
  redraw(); // animate() is registered before layout(), so render the initialized canvas now.
  nextShooter = performance.now() + 6000; nextCat = performance.now() + 9000;
  const resizeHero = () => { const r = stage.getBoundingClientRect(); const c = cellFor(r.width); if (Math.round(r.width / c) !== W || Math.round(r.height / c) !== H) { layout(); redraw(); } };
  if (typeof ResizeObserver === 'function') new ResizeObserver(resizeHero).observe(stage);
  else addEventListener('resize', resizeHero, { passive: true });
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
        else v = Math.hypot(x - 12, (y - sunY) * 1.1) < 4 ? 1 : 0.95 - y / 18 * 0.75;
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
    el.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); el.dataset.played = '1'; jump(); } });
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
// cards that open something come first and large; the "もうすぐ" ones gather, smaller, below them
(function groupToys() {
  const grid = document.getElementById('hpToys'); if (!grid) return;
  const soon = [...grid.children].filter((el) => el.matches('[data-toy]') && el.tagName !== 'A');
  if (!soon.length || soon.length === grid.children.length) return;
  const heading = document.createElement('h3'); heading.className = 'hp-subheading'; heading.id = 'hpSoonTitle'; heading.textContent = 'もうすぐ';
  const row = document.createElement('div'); row.className = 'hp-toys hp-toys--soon'; row.setAttribute('aria-labelledby', 'hpSoonTitle');
  row.append(...soon);
  grid.after(heading, row);
})();
// every toy sits in the same square window, whatever its own pixel size
for (const canvas of document.querySelectorAll('[data-toy] canvas')) {
  const view = document.createElement('span'); view.className = 'hp-view'; canvas.replaceWith(view); view.appendChild(canvas);
}
// cards rise in one after another as they come into view
const reveal = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (!entry.isIntersecting) return;
  const index = [...entry.target.parentElement.children].indexOf(entry.target);
  setTimeout(() => entry.target.classList.add('is-in'), reduced ? 0 : (index % 3) * 90);
  reveal.unobserve(entry.target);
}), { threshold: 0.2 }) : null;
document.querySelectorAll('.hp-toy').forEach((el) => {
  if (reveal) reveal.observe(el);
  else el.classList.add('is-in');
});
for (const el of document.querySelectorAll('[data-toy]')) {
  try { TOYS[el.dataset.toy]?.(el); } catch (error) { console.warn('toy', el.dataset.toy, error); }
  // the "もうすぐ" toys are not links: touching them only plays, never navigates
  if (el.tagName !== 'A') el.addEventListener('click', (e) => e.preventDefault());
}

// =========================================================================================================
// Works that people really posted, drifting by (only when there are some)
// =========================================================================================================
async function feed() {
  const slot = document.querySelector('[data-home-feed]'); if (!slot) return;
  try {
    const { supabaseConfig: cfg } = await import('../data/site-config.js');
    const base = String(cfg.url || '').replace(/\/$/, ''); const key = String(cfg.publishableKey || '');
    if (!base || !key) return;
    const url = new URL(`${base}/rest/v1/${encodeURIComponent(cfg.publicMapTable || 'post_map_points')}`);
    url.searchParams.set('select', 'post_id,title,public_image_path,published_at');
    url.searchParams.set('map_space', 'eq.globe'); url.searchParams.set('published_at', 'not.is.null');
    url.searchParams.set('order', 'published_at.desc'); url.searchParams.set('limit', '16');
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (!response.ok) return;
    const rows = (await response.json()).filter((r) => r?.public_image_path &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(r.post_id || '')));
    if (!rows.length) return;
    const bucket = encodeURIComponent(cfg.publicStorageBucket || 'post-public');
    const track = document.createElement('div'); track.className = 'hp-feed-track';
    const card = (r, copy) => {
      const a = document.createElement('a'); a.className = 'hp-feed-item'; a.href = `/globe/?art=${encodeURIComponent(r.post_id)}`;
      if (copy) { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); }
      const img = new Image(); img.loading = 'lazy'; img.decoding = 'async'; img.alt = copy ? '' : String(r.title || '地図の投稿');
      img.src = `${base}/storage/v1/object/public/${bucket}/${String(r.public_image_path).split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
      a.appendChild(img); return a;
    };
    // the list runs twice so the loop has no seam
    track.append(...rows.map((r) => card(r, false)), ...rows.map((r) => card(r, true)));
    track.style.setProperty('--n', rows.length);
    slot.replaceChildren(track); slot.hidden = false;
  } catch { /* the home stays complete without the feed */ }
}
feed();
