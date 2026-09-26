/**
 * Solar System view: the eight planets on their real orbits around the Sun.
 *
 * Distances and orbits are to scale (planets.mjs); planet sizes are not, they
 * are pixel-art sprites lit from the Sun's direction so each one shows the
 * phase it has from where the camera is. Close in, the Moon circles the Earth
 * and the four Galilean moons circle Jupiter at their true distances.
 *
 * Gestures: one finger turns the view around the focused body, two fingers
 * pinch the scale, a tap picks a body and flies to it. Pinching further in on
 * the Earth hands back to the globe.
 */

import { PLANETS, PLANET_BY_ID, centuriesSinceJ2000, heliocentricAt, orbitPath, galileanOffsets } from './planets.mjs?v=20260926-planets-v1';

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const OBLIQUITY = 23.43928 * DEG;
const MIN_SPAN_AU = 70; // the whole of Neptune's orbit fits across the short side
const MAX_SCALE = 260000; // px per AU: the Moon's orbit is about 670px across
const SUN_MAX_SCALE = 3200;
const EXIT_PRESSURE = 0.55;
const SPRITE_SIZE = { mercury: 7, venus: 9, earth: 9, mars: 8, jupiter: 17, saturn: 14, uranus: 11, neptune: 11 };
const PALETTES = {
  mercury: ['#3b3632', '#6f665e', '#a39a90', '#cfc7bd'],
  venus: ['#5b4b2e', '#a88d58', '#e2cf9c', '#fbf1d3'],
  earth: ['#0d2b45', '#1f5f8b', '#3f9ec4', '#bfe8f2'],
  mars: ['#3c1a10', '#7d3219', '#c55a31', '#eaa06e'],
  jupiter: ['#3e2a1c', '#8b6242', '#d2ae84', '#f4e6cc'],
  saturn: ['#4a3b20', '#8f7746', '#d6c08a', '#f6ead0'],
  uranus: ['#1c4a52', '#3f8f99', '#8fd3dc', '#d8f5f7'],
  neptune: ['#101d52', '#2c46a6', '#5f82e2', '#b5c8ff']
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2);
const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function equatorialToEcliptic([x, y, z]) {
  const c = Math.cos(OBLIQUITY); const s = Math.sin(OBLIQUITY);
  return [x, y * c + z * s, -y * s + z * c];
}
function poleEcliptic([ra, dec]) {
  return equatorialToEcliptic([Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)]);
}

/**
 * A pixel-art planet: `size` pixels across, shaded in four tones with the light
 * coming from `lightAngle` (screen radians). Bands and patches are stable.
 */
function paintPlanet(id, size, lightAngle) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const palette = PALETTES[id] || PALETTES.mercury;
  const lx = Math.cos(lightAngle); const ly = Math.sin(lightAngle);
  const r = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - r) / r; const ny = (y + 0.5 - r) / r;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      let light = nx * lx + ny * ly; // light in the screen plane
      light = light * 0.9 + nz * 0.25;
      let tone = light > 0.55 ? 3 : light > 0.15 ? 2 : light > -0.2 ? 1 : 0;
      if (id === 'jupiter' || id === 'saturn') {
        const band = Math.sin(ny * (id === 'jupiter' ? 9.5 : 7) + (id === 'jupiter' ? 0.4 : 0));
        if (band < -0.35 && tone > 0) tone -= 1;
        if (id === 'jupiter' && Math.abs(nx - 0.25) < 0.18 && Math.abs(ny - 0.32) < 0.1 && tone > 0) { ctx.fillStyle = '#c0613d'; ctx.fillRect(x, y, 1, 1); continue; }
      } else if (id === 'earth') {
        const land = hash(Math.floor((nx + 1) * 3), Math.floor((ny + 1) * 3), 7) > 0.62;
        if (land && tone > 0) { ctx.fillStyle = tone >= 2 ? '#6fae5c' : '#3f6f38'; ctx.fillRect(x, y, 1, 1); continue; }
        if (Math.abs(ny) > 0.82 && tone > 0) { ctx.fillStyle = '#f2f7f8'; ctx.fillRect(x, y, 1, 1); continue; }
      } else if (id === 'mars') {
        if (Math.abs(ny) > 0.8 && tone > 0) { ctx.fillStyle = '#f4ece6'; ctx.fillRect(x, y, 1, 1); continue; }
        if (hash(Math.floor(x / 2), Math.floor(y / 2), 3) > 0.7 && tone > 1) tone -= 1;
      } else if (id === 'mercury') {
        if (hash(x, y, 11) > 0.8 && tone > 1) tone -= 1;
      }
      ctx.fillStyle = palette[tone];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function paintSun(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const tones = ['#f08a24', '#f8b73a', '#ffd95c', '#fff3b8'];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (d > 1) continue;
      const tone = d > 0.86 ? 0 : d > 0.66 ? 1 : d > 0.36 ? 2 : 3;
      ctx.fillStyle = tones[hash(x, y, 5) > 0.9 && tone > 1 ? tone - 1 : tone];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

// A fixed, deterministic asteroid belt between Mars and Jupiter.
function createBelt(count = 1400) {
  const belt = [];
  for (let i = 0; i < count; i += 1) {
    const a = 2.15 + 1.15 * Math.sqrt(hash(i, 1, 9));
    // Kirkwood gaps at the 3:1 and 5:2 resonances with Jupiter.
    if (Math.abs(a - 2.50) < 0.03 || Math.abs(a - 2.82) < 0.025) continue;
    belt.push({ a, L0: hash(i, 2, 9) * 360, i: (hash(i, 3, 9) - 0.5) * 18 * DEG, node: hash(i, 4, 9) * Math.PI * 2, e: hash(i, 5, 9) * 0.12, w: hash(i, 6, 9) * Math.PI * 2 });
  }
  return belt;
}

export function createOrrery({ canvas, onSelect = () => {}, onExit = () => {}, onChange = () => {} }) {
  const ctx = canvas.getContext('2d');
  const sprites = new Map();
  const sunSprite = typeof document !== 'undefined' ? paintSun(24) : null;
  const belt = createBelt();
  let opened = false;
  let time = Date.now();
  let azimuth = -90 * DEG;
  let elevation = 38 * DEG;
  let scale = 120; // px per AU
  let focusId = 'sun';
  let focusPos = [0, 0, 0];
  let selectedId = null;
  let bodies = [];
  let orbits = new Map();
  let orbitsAt = -Infinity;
  let moonGeo = null; // Moon position relative to the Earth, AU (ecliptic)
  let frame = null;
  let flight = null;
  let exitPressure = 0;
  let screen = [];

  function spriteFor(id, lightAngle) {
    const bucket = Math.round(((lightAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 8)) % 16;
    const key = `${id}:${bucket}`;
    if (!sprites.has(key)) sprites.set(key, paintPlanet(id, SPRITE_SIZE[id], bucket * (Math.PI / 8)));
    return sprites.get(key);
  }

  function viewport() {
    const width = canvas.clientWidth || 1; const height = canvas.clientHeight || 1;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    return { width, height, dpr };
  }

  function minScale() { const { width, height } = viewport(); return Math.min(width, height) / MIN_SPAN_AU; }
  function maxScale() { return focusId === 'sun' ? SUN_MAX_SCALE : MAX_SCALE; }

  function project(p, view) {
    const x = p[0] - focusPos[0]; const y = p[1] - focusPos[1]; const z = p[2] - focusPos[2];
    const ca = Math.cos(azimuth); const sa = Math.sin(azimuth); const ce = Math.cos(elevation); const se = Math.sin(elevation);
    const x1 = x * ca - y * sa; const y1 = x * sa + y * ca;
    return { x: view.width / 2 + x1 * scale, y: view.height / 2 - (y1 * se + z * ce) * scale, depth: -y1 * ce + z * se };
  }

  function update() {
    const date = new Date(time);
    const T = centuriesSinceJ2000(date);
    bodies = PLANETS.map((planet) => ({ ...planet, position: heliocentricAt(planet.id, T) }));
    if (Math.abs(time - orbitsAt) > 365.25 * 86400000 * 5) {
      orbits = new Map(PLANETS.map((planet) => [planet.id, orbitPath(planet.id, date, planet.id === 'mercury' ? 180 : 256)]));
      orbitsAt = time;
    }
    if (!flight) focusPos = bodyPosition(focusId);
  }

  function bodyPosition(id) {
    if (id === 'sun') return [0, 0, 0];
    return bodies.find((body) => body.id === id)?.position || [0, 0, 0];
  }

  function draw() {
    frame = null;
    if (!opened) return;
    const view = viewport();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.imageSmoothingEnabled = false;
    const days = (time - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const sun = project([0, 0, 0], view);

    // Orbits.
    for (const [id, points] of orbits) {
      const selected = id === selectedId || id === focusId;
      ctx.beginPath();
      points.forEach((point, index) => { const p = project(point, view); if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      ctx.strokeStyle = PLANET_BY_ID[id].color;
      ctx.globalAlpha = selected ? 0.85 : 0.28;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Asteroid belt.
    if (scale * 3.3 > 30) {
      ctx.fillStyle = 'rgba(206, 196, 178, .45)';
      for (const rock of belt) {
        const n = 0.9856076686 / (rock.a ** 1.5);
        const M = (rock.L0 + n * days) * DEG;
        const r = rock.a * (1 - rock.e * Math.cos(M));
        const u = M + rock.w;
        const p = project([r * (Math.cos(rock.node) * Math.cos(u) - Math.sin(rock.node) * Math.sin(u) * Math.cos(rock.i)), r * (Math.sin(rock.node) * Math.cos(u) + Math.cos(rock.node) * Math.sin(u) * Math.cos(rock.i)), r * Math.sin(u) * Math.sin(rock.i)], view);
        if (p.x < -2 || p.y < -2 || p.x > view.width + 2 || p.y > view.height + 2) continue;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }

    // Sun: pixel disc and a soft glow.
    const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 70);
    glow.addColorStop(0, 'rgba(255, 214, 110, .55)'); glow.addColorStop(0.4, 'rgba(255, 170, 60, .16)'); glow.addColorStop(1, 'rgba(255, 150, 40, 0)');
    ctx.fillStyle = glow; ctx.fillRect(sun.x - 70, sun.y - 70, 140, 140);
    if (sunSprite) ctx.drawImage(sunSprite, Math.round(sun.x - 24), Math.round(sun.y - 24), 48, 48);
    screen = [{ id: 'sun', x: sun.x, y: sun.y, r: 26 }];

    // Planets, far to near.
    const drawn = bodies.map((body) => ({ body, p: project(body.position, view) })).sort((a, b) => a.p.depth - b.p.depth);
    for (const { body, p } of drawn) {
      const size = SPRITE_SIZE[body.id] * 2;
      const lightAngle = Math.atan2(sun.y - p.y, sun.x - p.x);
      if (body.id === 'saturn') drawRings(body, p, view, 'back');
      ctx.drawImage(spriteFor(body.id, lightAngle), Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
      if (body.id === 'saturn') drawRings(body, p, view, 'front');
      if (body.id === 'earth') drawMoon(p, view);
      if (body.id === 'jupiter') drawGalilean(body, p, view);
      screen.push({ id: body.id, x: p.x, y: p.y, r: Math.max(18, size / 2 + 6) });
      const active = body.id === selectedId;
      if (active) {
        ctx.strokeStyle = '#f4d45d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, size / 2 + 7, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.font = `${active ? 700 : 600} 12px ui-rounded, "Hiragino Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = active ? '#ffe89a' : 'rgba(233, 246, 247, .82)';
      ctx.fillText(body.name, p.x, p.y + size / 2 + 16);
    }
    ctx.font = '600 12px ui-rounded, "Hiragino Sans", system-ui, sans-serif';
    ctx.fillStyle = selectedId === 'sun' ? '#ffe89a' : 'rgba(255, 232, 154, .85)';
    ctx.fillText('太陽', sun.x, sun.y + 42);
    onChange(snapshot());
  }

  function drawRings(body, p, view, half) {
    const pole = poleEcliptic(body.pole);
    const ca = Math.cos(azimuth); const sa = Math.sin(azimuth); const ce = Math.cos(elevation); const se = Math.sin(elevation);
    const px = pole[0] * ca - pole[1] * sa; const py1 = pole[0] * sa + pole[1] * ca;
    const screenPole = [px, py1 * se + pole[2] * ce];
    const tilt = Math.abs(-py1 * ce + pole[2] * se); // how face-on the rings are
    const angle = Math.atan2(-screenPole[1], screenPole[0]) + Math.PI / 2;
    const outer = SPRITE_SIZE.saturn * 2 * 1.05; const inner = SPRITE_SIZE.saturn * 2 * 0.7;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(angle);
    ctx.lineWidth = 3;
    const start = half === 'back' ? Math.PI : 0; const end = half === 'back' ? Math.PI * 2 : Math.PI;
    for (const [radius, color] of [[outer, '#d9c38e'], [inner + (outer - inner) * 0.45, '#efdfb2'], [inner, '#a8915f']]) {
      ctx.strokeStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, radius, Math.max(1.5, radius * tilt), 0, start, end); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMoon(p, view) {
    if (!moonGeo || scale * 0.00257 < 20) return;
    const earth = bodyPosition('earth');
    const m = project([earth[0] + moonGeo[0], earth[1] + moonGeo[1], earth[2] + moonGeo[2]], view);
    ctx.strokeStyle = 'rgba(200, 214, 220, .25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, scale * 0.00257, scale * 0.00257 * Math.sin(elevation), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d8d4cc'; ctx.fillRect(Math.round(m.x - 3), Math.round(m.y - 3), 6, 6);
    ctx.fillStyle = 'rgba(233, 246, 247, .8)'; ctx.font = '600 12px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('月', m.x, m.y + 18);
    screen.push({ id: 'moon', x: m.x, y: m.y, r: 16 });
  }

  function drawGalilean(body, p, view) {
    const jupiterRadiusAU = PLANET_BY_ID.jupiter.radiusKm / AU_KM;
    if (scale * jupiterRadiusAU * 26 < 34) return;
    const earth = bodyPosition('earth');
    const toEarth = [earth[0] - body.position[0], earth[1] - body.position[1], earth[2] - body.position[2]];
    const length = Math.hypot(...toEarth);
    const offsets = galileanOffsets(new Date(time), poleEcliptic(body.pole), toEarth.map((v) => v / length));
    const names = ['イオ', 'エウロパ', 'ガニメデ', 'カリスト'];
    offsets.forEach((offset, index) => {
      const m = project([body.position[0] + offset[0] * jupiterRadiusAU, body.position[1] + offset[1] * jupiterRadiusAU, body.position[2] + offset[2] * jupiterRadiusAU], view);
      ctx.fillStyle = '#efe6d2'; ctx.fillRect(Math.round(m.x - 2), Math.round(m.y - 2), 4, 4);
      if (scale * jupiterRadiusAU * 26 > 170) { ctx.fillStyle = 'rgba(233, 246, 247, .7)'; ctx.font = '12px ui-rounded, system-ui, sans-serif'; ctx.fillText(names[index], m.x, m.y + 16); }
    });
  }

  function requestDraw() { if (frame === null && opened) frame = requestAnimationFrame(draw); }

  // ---- camera flights -------------------------------------------------------
  function fly({ to = focusId, scaleTo = scale, duration = 900, then = null } = {}) {
    const fromPos = focusPos.slice(); const fromScale = scale;
    focusId = to;
    if (reducedMotion()) { focusPos = bodyPosition(to); scale = scaleTo; then?.(); requestDraw(); return; }
    const started = performance.now();
    flight = { cancel: false };
    const current = flight;
    const step = (now) => {
      if (current.cancel || flight !== current) return;
      const t = clamp((now - started) / duration, 0, 1); const k = ease(t);
      const target = bodyPosition(to);
      focusPos = [lerp(fromPos[0], target[0], k), lerp(fromPos[1], target[1], k), lerp(fromPos[2], target[2], k)];
      scale = Math.exp(lerp(Math.log(fromScale), Math.log(scaleTo), k));
      draw();
      if (t < 1) requestAnimationFrame(step); else { flight = null; then?.(); }
    };
    requestAnimationFrame(step);
  }

  function focusScale(id) {
    const { width, height } = viewport(); const short = Math.min(width, height);
    if (id === 'sun') return short / 4.2;
    if (id === 'earth') return short / 0.012;
    if (id === 'jupiter') return short / 0.04;
    if (id === 'saturn') return short / 0.03;
    return short / 0.02;
  }

  function select(id, { fly: flyThere = true } = {}) {
    selectedId = id;
    if (id && flyThere && id !== 'moon') fly({ to: id, scaleTo: focusScale(id) });
    onSelect(id);
    requestDraw();
  }

  // ---- gestures -------------------------------------------------------------
  const pointers = new Map();
  let drag = null; let spread = 0;
  function zoomBy(ratio) {
    if (flight) flight = null;
    const next = scale * ratio;
    if (next > maxScale() && focusId === 'earth') {
      exitPressure += Math.log(next / maxScale());
      if (exitPressure > EXIT_PRESSURE) { exitPressure = 0; onExit(); }
    } else exitPressure = Math.max(0, exitPressure - 0.02);
    scale = clamp(next, minScale(), maxScale());
    requestDraw();
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (!opened) return;
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()]; spread = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)); drag = null; return; }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, started: performance.now() };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()]; const next = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)); zoomBy(next / spread); spread = next; return; }
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    azimuth -= (event.clientX - drag.x) * 0.006;
    elevation = clamp(elevation + (event.clientY - drag.y) * 0.006, 4 * DEG, 89 * DEG);
    drag.x = event.clientX; drag.y = event.clientY;
    requestDraw();
  });
  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    const finished = drag; drag = null;
    if (pointers.size === 1) { const [[id, point]] = [...pointers.entries()]; drag = { id, x: point.x, y: point.y, startX: point.x, startY: point.y, moved: true, started: 0 }; return; }
    exitPressure = 0;
    if (event.type !== 'pointerup' || !finished || finished.moved || performance.now() - finished.started > 450) return;
    const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
    const hit = screen.map((entry) => ({ entry, d: Math.hypot(entry.x - x, entry.y - y) })).filter(({ entry, d }) => d < Math.max(entry.r, 22)).sort((a, b) => a.d - b.d)[0];
    select(hit ? hit.entry.id : null, { fly: Boolean(hit) });
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (event) => { if (!opened) return; event.preventDefault(); zoomBy(Math.exp(-clamp(event.deltaY, -80, 80) * 0.004)); }, { passive: false });
  canvas.addEventListener('keydown', (event) => {
    if (!opened) return;
    if (event.key === '+' || event.key === '=') zoomBy(1.25);
    else if (event.key === '-' || event.key === '_') zoomBy(0.8);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { azimuth += event.key === 'ArrowLeft' ? 0.12 : -0.12; requestDraw(); }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { elevation = clamp(elevation + (event.key === 'ArrowUp' ? 0.1 : -0.1), 4 * DEG, 89 * DEG); requestDraw(); }
    else return;
    event.preventDefault();
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => requestDraw()).observe(canvas);

  function snapshot() {
    return { open: opened, time, focusId, selectedId, scale, azimuth, elevation, bodies };
  }

  return {
    isOpen: () => opened,
    /** Open zoomed in on the Earth and pull back to the inner Solar System. */
    open({ fromEarth = true } = {}) {
      opened = true; selectedId = null; exitPressure = 0;
      update();
      const { width, height } = viewport(); const short = Math.min(width, height);
      if (fromEarth) { focusId = 'earth'; focusPos = bodyPosition('earth'); scale = MAX_SCALE; fly({ to: 'sun', scaleTo: short / 4.2, duration: 1500 }); }
      else { focusId = 'sun'; focusPos = [0, 0, 0]; scale = short / 4.2; }
      draw();
    },
    /** Dive back into the Earth, then call `done`. */
    close(done = () => {}) {
      if (!opened) { done(); return; }
      selectedId = null;
      const finish = () => { opened = false; ctx.clearRect(0, 0, canvas.width, canvas.height); done(); };
      if (reducedMotion()) { finish(); return; }
      fly({ to: 'earth', scaleTo: MAX_SCALE, duration: 1100, then: finish });
    },
    setTime(next, { moon = null } = {}) { time = next; moonGeo = moon; if (opened) { update(); requestDraw(); } },
    select, focus: (id) => select(id),
    getSnapshot: snapshot,
    redraw: requestDraw
  };
}
