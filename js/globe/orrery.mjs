/**
 * Solar System view: the eight planets on their real orbits around the Sun,
 * in front of the real night sky.
 *
 * Each frame is rendered in detail at "dot" resolution (2 CSS px per dot): lit
 * spheres with surface detail (the Earth's real continents turning with the
 * clock, Jupiter's belts, Saturn's rings with the planet's shadow), the Sun's
 * limb and glow, orbits, the asteroid belt and the catalogue sky behind. The
 * frame then goes through the pixel camera's own colour pipeline
 * (PiXiEELENS, 256 colours with ordered dither), so the look is exactly
 * what the camera makes of a photo. Labels are drawn crisp on top.
 *
 * Distances are to scale. Bodies are drawn at their true size once that is
 * larger than a minimum, so from far away every planet stays visible and
 * close in the Earth fills the view like the globe does.
 *
 * Gestures: one finger turns the view, two fingers pinch the scale, a tap
 * picks a body and flies to it. Pinching further into the Earth hands back
 * to the globe.
 */

import { PLANETS, PLANET_BY_ID, centuriesSinceJ2000, heliocentricAt, orbitPath, galileanOffsets } from './planets.mjs?v=20260926-realsky-v1';
import { greenwichSiderealDegrees } from './astronomy.mjs?v=20260926-realsky-v1';
import { sharedSky, createSkySampler } from './real-sky.mjs?v=20260926-realsky-v1';
import { WORLD_LAND_MASK } from '../../assets/maps/world-land-mask-v1.mjs?v=20260920-webgl2-1';

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const OBLIQUITY = 23.43928 * DEG;
const DOT = 2; // CSS pixels per rendered dot
const MIN_SPAN_AU = 70; // the whole of Neptune's orbit fits across the short side
const EXIT_PRESSURE = 0.55;
const SKY_HALF_FOV = 32 * DEG;
const SUN_RADIUS_KM = 695700;
const MOON_RADIUS_KM = 1737.4;
// Smallest drawn radius (CSS px), so every body stays visible from afar.
const MIN_RADIUS = { sun: 11, mercury: 3.5, venus: 5, earth: 5.5, mars: 4.5, jupiter: 9, saturn: 8, uranus: 6.5, neptune: 6.5, moon: 2.2, io: 1.4, europa: 1.3, ganymede: 1.7, callisto: 1.6 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// ---- small value noise ------------------------------------------------------
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const xf = x - xi; const yf = y - yi; const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf); const w = zf * zf * (3 - 2 * zf);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u); const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u); const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
function fbm(x, y, z) { return noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15; }
const bell = (x, c, w) => { const t = (x - c) / w; return Math.exp(-t * t); };

// ---- the Earth's continents from the globe's own land mask --------------------
const LAND = (() => {
  const mask = new Uint8Array(WORLD_LAND_MASK.width * WORLD_LAND_MASK.height);
  let offset = 0;
  for (const [value, run] of WORLD_LAND_MASK.runs) { mask.fill(value, offset, offset + run); offset += run; }
  return mask;
})();
function isLand(lonDeg, latDeg) {
  const { width, height, cellDegrees } = WORLD_LAND_MASK;
  const x = Math.floor((((lonDeg + 180) % 360 + 360) % 360) / cellDegrees);
  const y = clamp(Math.floor((90 - latDeg) / cellDegrees), 0, height - 1);
  return LAND[y * width + Math.min(width - 1, x)] > 0;
}

function equatorialToEcliptic([x, y, z]) { const c = Math.cos(OBLIQUITY); const s = Math.sin(OBLIQUITY); return [x, y * c + z * s, -y * s + z * c]; }
function eclipticToEquatorial([x, y, z]) { const c = Math.cos(OBLIQUITY); const s = Math.sin(OBLIQUITY); return [x, y * c - z * s, y * s + z * c]; }
function poleEcliptic([ra, dec]) { return equatorialToEcliptic([Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)]); }

/**
 * Surface colour (0..1 RGB) of a body at world normal `n`. `frame` holds the
 * pole and a reference meridian that turns with the body's rotation.
 */
function surface(id, n, frame, out) {
  const sinLat = clamp(dot3(n, frame.pole), -1, 1);
  const lat = Math.asin(sinLat) / DEG;
  const lon = Math.atan2(dot3(n, frame.east), dot3(n, frame.meridian)) / DEG;
  if (id === 'earth') {
    // Real geography: world normal → equatorial → longitude at this sidereal time.
    const q = eclipticToEquatorial(n);
    const eLon = Math.atan2(q[1], q[0]) / DEG - frame.gmst; const eLat = Math.asin(clamp(q[2], -1, 1)) / DEG;
    let r; let g; let b;
    if (Math.abs(eLat) > 70 && (eLat < -64 || isLand(eLon, eLat))) { r = 0.92; g = 0.95; b = 0.97; }
    else if (isLand(eLon, eLat)) {
      const dry = bell(Math.abs(eLat), 24, 9) * 0.85;
      r = lerp(0.25, 0.72, dry); g = lerp(0.46, 0.60, dry); b = lerp(0.22, 0.38, dry);
    } else { r = 0.07; g = 0.24; b = 0.50; }
    const cloud = Math.max(0, fbm(n[0] * 3.2 + frame.t * 0.02, n[1] * 3.2, n[2] * 3.2) - 0.52) * 2.2;
    out[0] = lerp(r, 1, clamp(cloud, 0, 0.8)); out[1] = lerp(g, 1, clamp(cloud, 0, 0.8)); out[2] = lerp(b, 1, clamp(cloud, 0, 0.8));
    return out;
  }
  if (id === 'jupiter') {
    const d = lat + 3 * (fbm(lon * 0.05, lat * 0.25, 2) - 0.5);
    const belts = 0.95 * bell(d, 14, 5.5) + 0.85 * bell(d, -16, 5) + 0.45 * bell(d, 29, 3.5) + 0.4 * bell(d, -31, 3.5) + 0.25 * bell(d, 42, 3) + 0.25 * bell(d, -44, 3);
    const k = clamp(belts, 0, 1);
    out[0] = lerp(0.95, 0.64, k); out[1] = lerp(0.90, 0.45, k); out[2] = lerp(0.80, 0.32, k);
    const polar = clamp((Math.abs(lat) - 52) / 20, 0, 1) * 0.6;
    out[0] = lerp(out[0], 0.68, polar); out[1] = lerp(out[1], 0.66, polar); out[2] = lerp(out[2], 0.62, polar);
    let spotLon = ((lon - 40) % 360 + 540) % 360 - 180;
    const spot = Math.exp(-((spotLon / 11) ** 2) - (((lat + 22) / 4.5) ** 2));
    out[0] = lerp(out[0], 0.80, spot); out[1] = lerp(out[1], 0.42, spot); out[2] = lerp(out[2], 0.30, spot);
    return out;
  }
  if (id === 'saturn') {
    const band = Math.sin(lat * 0.24 + 0.4 * fbm(lon * 0.02, lat * 0.1, 5));
    const k = (band + 1) / 2;
    out[0] = lerp(0.80, 0.96, k); out[1] = lerp(0.69, 0.88, k); out[2] = lerp(0.48, 0.68, k);
    return out;
  }
  if (id === 'mars') {
    const dark = clamp((fbm(n[0] * 3 + 11, n[1] * 3, n[2] * 3) - 0.45) * 5, 0, 1);
    out[0] = lerp(0.86, 0.46, dark); out[1] = lerp(0.46, 0.25, dark); out[2] = lerp(0.27, 0.17, dark);
    const cap = clamp((Math.abs(lat) - 72) / 8, 0, 1);
    out[0] = lerp(out[0], 0.97, cap); out[1] = lerp(out[1], 0.96, cap); out[2] = lerp(out[2], 0.94, cap);
    return out;
  }
  if (id === 'venus') { const s = 0.92 + 0.08 * fbm(n[0] * 2 + lat * 0.02, n[1] * 2, n[2] * 2); out[0] = 0.98 * s; out[1] = 0.92 * s; out[2] = 0.78 * s; return out; }
  if (id === 'mercury' || id === 'moon' || id === 'io' || id === 'europa' || id === 'ganymede' || id === 'callisto') {
    const tint = { io: [0.95, 0.85, 0.45], europa: [0.9, 0.86, 0.78], ganymede: [0.7, 0.66, 0.6], callisto: [0.5, 0.46, 0.42] }[id] || [0.68, 0.65, 0.62];
    const s = 0.7 + 0.45 * fbm(n[0] * 5 + 3, n[1] * 5, n[2] * 5);
    const maria = id === 'moon' ? clamp((fbm(n[0] * 2 + 7, n[1] * 2, n[2] * 2) - 0.5) * 4, 0, 0.45) : 0;
    out[0] = tint[0] * s * (1 - maria); out[1] = tint[1] * s * (1 - maria); out[2] = tint[2] * s * (1 - maria);
    return out;
  }
  if (id === 'uranus') { out[0] = 0.64; out[1] = 0.87; out[2] = 0.9; return out; }
  const s = 0.94 + 0.06 * Math.sin(lat * 0.14);
  out[0] = 0.36 * s; out[1] = 0.52 * s; out[2] = 0.93 * s; return out;
}

// A deterministic asteroid belt between Mars and Jupiter, with the 3:1 and 5:2 Kirkwood gaps.
function createBelt(count = 1600) {
  const belt = [];
  for (let i = 0; i < count; i += 1) {
    const a = 2.15 + 1.15 * Math.sqrt(hash3(i, 1, 9));
    if (Math.abs(a - 2.50) < 0.03 || Math.abs(a - 2.82) < 0.025) continue;
    belt.push({ a, L0: hash3(i, 2, 9) * 360, i: (hash3(i, 3, 9) - 0.5) * 18 * DEG, node: hash3(i, 4, 9) * Math.PI * 2, e: hash3(i, 5, 9) * 0.12, w: hash3(i, 6, 9) * Math.PI * 2, shade: 0.45 + 0.4 * hash3(i, 7, 9) });
  }
  return belt;
}

export function createOrrery({ canvas, onSelect = () => {}, onExit = () => {}, onChange = () => {} }) {
  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas');
  const lowCtx = low.getContext('2d', { willReadFrequently: true });
  const belt = createBelt();
  let opened = false;
  let time = Date.now();
  let azimuth = -90 * DEG;
  let elevation = 38 * DEG;
  let scale = 120; // CSS px per AU
  let focusId = 'sun';
  let focusPos = [0, 0, 0];
  let selectedId = null;
  let bodies = [];
  let orbits = new Map();
  let orbitsAt = -Infinity;
  let moonGeo = null; // Moon relative to the Earth, AU (ecliptic)
  let frame = null;
  let flight = null;
  let exitPressure = 0;
  let screen = [];
  let lens = null; // PiXiEELENS engine, loaded on first open
  let sampleSky = null;
  let skyCache = { key: '', data: null };

  // The pixel camera's 256-colour pipeline, and the painted real sky.
  function prepare() {
    if (!lens) {
      lens = import('../pixel-lens/engine.mjs?v=20260926-ux-1').then((engine) => {
        engine.setLensSettings({ colorDepth: '256', gradientMode: 'dither', surfaceSimplify: 0 });
        return engine;
      }).catch((error) => { console.warn('Pixel camera engine unavailable; showing the raw render.', error); return null; });
      lens.then((engine) => { lens = engine || false; requestDraw(); });
    }
    if (!sampleSky) {
      sampleSky = 'loading';
      sharedSky().then(({ canvas: sky }) => {
        const small = document.createElement('canvas'); small.width = 2048; small.height = 1024;
        const s = small.getContext('2d'); s.imageSmoothingQuality = 'high'; s.drawImage(sky, 0, 0, 2048, 1024);
        sampleSky = createSkySampler(s.getImageData(0, 0, 2048, 1024));
        skyCache.key = ''; requestDraw();
      }).catch(() => { sampleSky = null; });
    }
  }

  function viewport() {
    const width = canvas.clientWidth || 1; const height = canvas.clientHeight || 1;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const lw = Math.ceil(width / DOT); const lh = Math.ceil(height / DOT);
    if (low.width !== lw || low.height !== lh) { low.width = lw; low.height = lh; skyCache.key = ''; }
    return { width, height, dpr, lw, lh };
  }

  function radiusAU(id) {
    if (id === 'sun') return SUN_RADIUS_KM / AU_KM;
    if (id === 'moon') return MOON_RADIUS_KM / AU_KM;
    return (PLANET_BY_ID[id]?.radiusKm || 1000) / AU_KM;
  }
  function minScale() { const { width, height } = viewport(); return Math.min(width, height) / MIN_SPAN_AU; }
  // Close in, a planet may fill a little under half of the short side.
  function maxScale(id = focusId) { const { width, height } = viewport(); return (0.45 * Math.min(width, height)) / radiusAU(id); }
  function focusScale(id) { const { width, height } = viewport(); const short = Math.min(width, height); return id === 'sun' ? short / 4.2 : (0.12 * short) / radiusAU(id); }

  function basis() {
    const ca = Math.cos(azimuth); const sa = Math.sin(azimuth); const ce = Math.cos(elevation); const se = Math.sin(elevation);
    return { right: [ca, -sa, 0], up: [sa * se, ca * se, ce], toward: [-sa * ce, -ca * ce, se] };
  }
  function project(p, view, b) {
    const d = [p[0] - focusPos[0], p[1] - focusPos[1], p[2] - focusPos[2]];
    return { x: view.width / 2 + dot3(d, b.right) * scale, y: view.height / 2 - dot3(d, b.up) * scale, depth: dot3(d, b.toward) };
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
    if (id === 'moon' && moonGeo) { const e = bodyPosition('earth'); return [e[0] + moonGeo[0], e[1] + moonGeo[1], e[2] + moonGeo[2]]; }
    return bodies.find((body) => body.id === id)?.position || [0, 0, 0];
  }

  // ---- rendering --------------------------------------------------------------
  function paintSky(image, view, b) {
    const key = `${azimuth.toFixed(4)}:${elevation.toFixed(4)}:${view.lw}x${view.lh}:${typeof sampleSky === 'function'}`;
    const data = image.data;
    if (skyCache.key !== key) {
      const out = new Uint8ClampedArray(view.lw * view.lh * 4);
      const focal = (view.lh / 2) / Math.tan(SKY_HALF_FOV);
      const rgb = [0, 0, 0];
      for (let y = 0; y < view.lh; y += 1) {
        for (let x = 0; x < view.lw; x += 1) {
          const i = (y * view.lw + x) * 4;
          out[i + 3] = 255;
          if (typeof sampleSky !== 'function') { out[i] = 2; out[i + 1] = 4; out[i + 2] = 9; continue; }
          const dx = x + 0.5 - view.lw / 2; const dy = view.lh / 2 - (y + 0.5);
          const dir = norm([-b.toward[0] * focal + b.right[0] * dx + b.up[0] * dy, -b.toward[1] * focal + b.right[1] * dx + b.up[1] * dy, -b.toward[2] * focal + b.right[2] * dx + b.up[2] * dy]);
          const q = eclipticToEquatorial(dir);
          sampleSky(Math.atan2(q[1], q[0]) / DEG, Math.asin(clamp(q[2], -1, 1)) / DEG, rgb);
          // Black point: the faint sky glow would only turn into coloured dither noise in 256 colours.
          const lum = Math.max(0, (rgb[0] + rgb[1] + rgb[2]) / 3 - 34) * 1.9;
          // The 256-colour palette has 8 red/green levels but only 4 blue ones, so faint grey would
          // dither into olive. Faint light goes to the blue channel first (navy dots), brighter light
          // adds red and green on top (lavender, then white stars).
          const warm = rgb[0] / Math.max(1, rgb[2]);
          out[i] = Math.max(0, lum - 26) * 1.25 * warm; out[i + 1] = Math.max(0, lum - 26) * 1.2; out[i + 2] = lum * 2.1;
        }
      }
      skyCache = { key, data: out };
    }
    data.set(skyCache.data);
  }

  /** Render one body as a lit sphere (plus glow for the Sun, rings for Saturn) into the dot buffer. */
  function paintBody(image, id, p, radiusPx, b, lightDir, frameInfo) {
    const { data, width: W, height: H } = image;
    const cx = p.x / DOT; const cy = p.y / DOT; const R = radiusPx / DOT;
    const rings = id === 'saturn';
    const reach = id === 'sun' ? Math.min(160, R * 4.5 + 10) : rings ? R * 2.35 + 1 : R + 1;
    const x0 = Math.max(0, Math.floor(cx - reach)); const x1 = Math.min(W - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach)); const y1 = Math.min(H - 1, Math.ceil(cy + reach));
    if (x0 > x1 || y0 > y1) return;
    const color = [0, 0, 0];
    const pole = frameInfo?.pole || [0, 0, 1];
    const towardPole = dot3(b.toward, pole);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const nx = (x + 0.5 - cx) / R; const ny = (cy - (y + 0.5)) / R;
        const d2 = nx * nx + ny * ny;
        const i = (y * W + x) * 4;
        if (id === 'sun') {
          const r = Math.sqrt(d2);
          // Glow first (additive), then the disc with limb darkening and granulation.
          const glow = 0.9 / (1 + (Math.max(0, r - 1) * 1.6) ** 2) * (r > 1 ? 1 : 0);
          data[i] = Math.min(255, data[i] + 255 * glow * 1.0); data[i + 1] = Math.min(255, data[i + 1] + 210 * glow); data[i + 2] = Math.min(255, data[i + 2] + 120 * glow);
          if (r <= 1) {
            const mu = Math.sqrt(1 - d2); const limb = 0.45 + 0.55 * mu;
            const gran = 0.9 + 0.1 * noise3(nx * 9 + frameInfo.t * 0.3, ny * 9, 1.7);
            const cover = clamp((1 - r) * R + 0.5, 0, 1);
            data[i] = lerp(data[i], 255, cover); data[i + 1] = lerp(data[i + 1], 255 * clamp(0.62 + 0.38 * limb * gran, 0, 1), cover); data[i + 2] = lerp(data[i + 2], 255 * clamp(0.25 + 0.6 * limb * limb * gran, 0, 1), cover);
          }
          continue;
        }
        // Rings: where the view line through this dot meets Saturn's ring plane.
        let ring = 0; let ringFront = false; let ringColor = null;
        if (rings && Math.abs(towardPole) > 1e-4) {
          const rho = [b.right[0] * nx + b.up[0] * ny, b.right[1] * nx + b.up[1] * ny, b.right[2] * nx + b.up[2] * ny];
          const t = -dot3(rho, pole) / towardPole;
          const X = [rho[0] + b.toward[0] * t, rho[1] + b.toward[1] * t, rho[2] + b.toward[2] * t];
          const rr = Math.hypot(X[0], X[1], X[2]);
          const soft = 1.2 / Math.max(R, 1);
          const band = (lo, hi) => clamp((rr - lo) / soft + 0.5, 0, 1) * clamp((hi - rr) / soft + 0.5, 0, 1);
          ring = band(1.24, 1.53) * 0.25 + band(1.53, 1.95) * 0.92 + band(2.03, 2.27) * 0.7;
          if (ring > 0) {
            ringFront = t > 0;
            const along = dot3(X, lightDir);
            const shadow = along < 0 && Math.hypot(X[0] - lightDir[0] * along, X[1] - lightDir[1] * along, X[2] - lightDir[2] * along) < 1 ? 0.15 : 1;
            const lit = (0.3 + 0.7 * Math.abs(dot3(pole, lightDir))) * shadow;
            ringColor = [0.93 * lit, 0.85 * lit, 0.66 * lit];
          }
        }
        let cover = 0;
        if (d2 <= 1.02) {
          cover = clamp((1 - Math.sqrt(d2)) * R + 0.5, 0, 1);
          const nz = Math.sqrt(Math.max(0, 1 - d2));
          const n = [b.right[0] * nx + b.up[0] * ny + b.toward[0] * nz, b.right[1] * nx + b.up[1] * ny + b.toward[1] * nz, b.right[2] * nx + b.up[2] * ny + b.toward[2] * nz];
          surface(id, n, frameInfo, color);
          const lambert = dot3(n, lightDir);
          const lit = clamp(lambert * 1.1 + 0.06, 0, 1) * (0.55 + 0.45 * nz) + 0.07 * (0.5 + 0.5 * nz);
          let r = color[0] * lit; let g = color[1] * lit; let bl = color[2] * lit;
          if (id === 'earth' || id === 'venus') {
            // Thin atmosphere: a bright rim on the day side.
            const rim = (1 - nz) ** 3 * clamp(lambert + 0.3, 0, 1);
            const tint = id === 'earth' ? [0.45, 0.7, 1] : [1, 0.95, 0.8];
            r += tint[0] * rim * 0.8; g += tint[1] * rim * 0.8; bl += tint[2] * rim * 0.8;
          }
          data[i] = lerp(data[i], 255 * clamp(r, 0, 1), cover); data[i + 1] = lerp(data[i + 1], 255 * clamp(g, 0, 1), cover); data[i + 2] = lerp(data[i + 2], 255 * clamp(bl, 0, 1), cover);
        }
        if (ring > 0 && (ringFront || cover < 1)) {
          const a = ring * (ringFront ? 1 : 1 - cover);
          data[i] = lerp(data[i], 255 * ringColor[0], a); data[i + 1] = lerp(data[i + 1], 255 * ringColor[1], a); data[i + 2] = lerp(data[i + 2], 255 * ringColor[2], a);
        }
      }
    }
  }

  function bodyFrame(id, polePair, t) {
    const pole = id === 'earth' ? equatorialToEcliptic([0, 0, 1]) : polePair ? poleEcliptic(polePair) : [0, 0, 1];
    const ref = Math.abs(pole[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const east0 = norm(cross(pole, ref)); const north0 = cross(east0, pole);
    const hours = PLANET_BY_ID[id]?.rotationHours || 655;
    const spin = ((t / 3600000) / hours) * Math.PI * 2;
    const meridian = [east0[0] * Math.cos(spin) + north0[0] * Math.sin(spin), east0[1] * Math.cos(spin) + north0[1] * Math.sin(spin), east0[2] * Math.cos(spin) + north0[2] * Math.sin(spin)];
    return { pole, meridian, east: cross(pole, meridian), t: t / 1000, gmst: greenwichSiderealDegrees(new Date(t)) };
  }

  function drawnRadius(id) { return Math.max(MIN_RADIUS[id] || 2, radiusAU(id) * scale); }

  function draw() {
    frame = null;
    if (!opened) return;
    const view = viewport();
    const b = basis();
    const days = (time - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const image = lowCtx.createImageData(view.lw, view.lh);
    paintSky(image, view, b);
    lowCtx.putImageData(image, 0, 0);

    // Orbits, thin and quiet; the focused one brighter.
    lowCtx.save();
    lowCtx.scale(1 / DOT, 1 / DOT);
    for (const [id, points] of orbits) {
      const strong = id === selectedId || id === focusId;
      lowCtx.beginPath();
      points.forEach((point, index) => { const p = project(point, view, b); if (index === 0) lowCtx.moveTo(p.x, p.y); else lowCtx.lineTo(p.x, p.y); });
      lowCtx.closePath();
      lowCtx.strokeStyle = PLANET_BY_ID[id].color;
      lowCtx.globalAlpha = strong ? 0.75 : 0.32;
      lowCtx.lineWidth = DOT;
      lowCtx.stroke();
    }
    lowCtx.restore();
    const buffer = lowCtx.getImageData(0, 0, view.lw, view.lh);

    // Asteroid belt.
    if (scale * 3.3 > 30) {
      const data = buffer.data;
      for (const rock of belt) {
        const n = 0.9856076686 / (rock.a ** 1.5);
        const M = (rock.L0 + n * days) * DEG;
        const r = rock.a * (1 - rock.e * Math.cos(M)); const u = M + rock.w;
        const p = project([r * (Math.cos(rock.node) * Math.cos(u) - Math.sin(rock.node) * Math.sin(u) * Math.cos(rock.i)), r * (Math.sin(rock.node) * Math.cos(u) + Math.cos(rock.node) * Math.sin(u) * Math.cos(rock.i)), r * Math.sin(u) * Math.sin(rock.i)], view, b);
        const x = Math.floor(p.x / DOT); const y = Math.floor(p.y / DOT);
        if (x < 0 || y < 0 || x >= view.lw || y >= view.lh) continue;
        const i = (y * view.lw + x) * 4; const v = 120 * rock.shade;
        data[i] = Math.max(data[i], v); data[i + 1] = Math.max(data[i + 1], v * 0.93); data[i + 2] = Math.max(data[i + 2], v * 0.82);
      }
    }

    // Bodies, far to near: the Sun, planets, the Moon and Jupiter's moons once they clear their planet.
    const list = [{ id: 'sun', name: '太陽', position: [0, 0, 0] }, ...bodies.map((body) => ({ id: body.id, name: body.name, position: body.position, pole: body.pole }))];
    const earth = bodyPosition('earth');
    if (moonGeo) {
      const moonPos = bodyPosition('moon');
      const gap = Math.hypot(moonGeo[0], moonGeo[1], moonGeo[2]) * scale;
      if (gap > drawnRadius('earth') + drawnRadius('moon') + 6) list.push({ id: 'moon', name: '月', position: moonPos, minor: true });
    }
    const jupiter = bodies.find((body) => body.id === 'jupiter');
    if (jupiter) {
      const jr = radiusAU('jupiter');
      const toEarth = norm([earth[0] - jupiter.position[0], earth[1] - jupiter.position[1], earth[2] - jupiter.position[2]]);
      galileanOffsets(new Date(time), poleEcliptic(jupiter.pole), toEarth).forEach((offset, index) => {
        const id = ['io', 'europa', 'ganymede', 'callisto'][index];
        const gap = Math.hypot(...offset) * jr * scale;
        if (gap > drawnRadius('jupiter') + 5) list.push({ id, name: ['イオ', 'エウロパ', 'ガニメデ', 'カリスト'][index], position: [jupiter.position[0] + offset[0] * jr, jupiter.position[1] + offset[1] * jr, jupiter.position[2] + offset[2] * jr], minor: true, radiusKm: [1821.6, 1560.8, 2634.1, 2410.3][index] });
      });
    }
    const drawn = list.map((body) => ({ body, p: project(body.position, view, b) })).sort((a, c) => a.p.depth - c.p.depth);
    screen = [];
    for (const { body, p } of drawn) {
      const radius = body.radiusKm ? Math.max(MIN_RADIUS[body.id] || 1.4, (body.radiusKm / AU_KM) * scale) : drawnRadius(body.id);
      if (p.x < -radius * 3 || p.y < -radius * 3 || p.x > view.width + radius * 3 || p.y > view.height + radius * 3) { screen.push({ id: body.id, x: p.x, y: p.y, r: 0, radius, body }); continue; }
      const light = norm([-body.position[0], -body.position[1], -body.position[2]]);
      paintBody(buffer, body.id, p, radius, b, light, bodyFrame(body.id, body.pole, time));
      screen.push({ id: body.id, x: p.x, y: p.y, r: Math.max(18, radius + 6), radius, body });
    }

    // Through the pixel camera: 256 colours with its ordered dither.
    if (lens && typeof lens.processLensFrame === 'function') {
      // The camera lifts shadows a little before dithering, which would print a faint regular grid
      // over empty space. Whatever was black before the conversion stays black.
      const px = buffer.data; const empty = new Uint8Array(px.length / 4);
      for (let k = 0, j = 0; k < px.length; k += 4, j += 1) if (px[k] + px[k + 1] + px[k + 2] < 6) empty[j] = 1;
      lens.processLensFrame(buffer);
      for (let j = 0; j < empty.length; j += 1) if (empty[j]) { px[j * 4] = 0; px[j * 4 + 1] = 0; px[j * 4 + 2] = 0; }
    }
    lowCtx.putImageData(buffer, 0, 0);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(low, 0, 0, view.lw * DOT, view.lh * DOT);

    // Crisp labels.
    ctx.textAlign = 'center';
    for (const entry of screen) {
      if (!entry.r) continue;
      const active = entry.id === selectedId;
      if (entry.body.minor && !active && entry.radius < 3 && scale < 2e5) continue;
      if (active) { ctx.strokeStyle = '#f4d45d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(entry.x, entry.y, entry.radius * (entry.id === 'saturn' ? 2.35 : 1) + 7, 0, Math.PI * 2); ctx.stroke(); }
      ctx.font = `${active ? 700 : 600} 12px ui-rounded, "Hiragino Sans", system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2, 5, 10, .85)';
      const labelY = entry.y + entry.radius * (entry.id === 'saturn' ? 1.3 : 1) + 16;
      ctx.strokeText(entry.body.name, entry.x, labelY);
      ctx.fillStyle = active ? '#ffe89a' : entry.id === 'sun' ? 'rgba(255, 232, 154, .92)' : 'rgba(233, 246, 247, .88)';
      ctx.fillText(entry.body.name, entry.x, labelY);
    }
    onChange(snapshot());
  }

  function requestDraw() { if (frame === null && opened) frame = requestAnimationFrame(draw); }

  // ---- camera flights -------------------------------------------------------
  // The azimuth that looks at `id` from its day side, a little off the Sun line so it shows some shading.
  function daySideAzimuth(id) {
    const p = bodyPosition(id); const lx = -p[0]; const ly = -p[1];
    if (Math.hypot(lx, ly) < 1e-9) return azimuth;
    return Math.atan2(-lx, -ly) + 40 * DEG;
  }
  function fly({ to = focusId, scaleTo = scale, duration = 900, then = null, turnTo = null } = {}) {
    const fromPos = focusPos.slice(); const fromScale = scale;
    const fromAzimuth = azimuth;
    let toAzimuth = turnTo ?? azimuth;
    while (toAzimuth - fromAzimuth > Math.PI) toAzimuth -= Math.PI * 2;
    while (toAzimuth - fromAzimuth < -Math.PI) toAzimuth += Math.PI * 2;
    focusId = to;
    if (reducedMotion()) { focusPos = bodyPosition(to); scale = scaleTo; azimuth = toAzimuth; then?.(); requestDraw(); return; }
    const started = performance.now();
    const current = { cancel: false }; flight = current;
    const step = (now) => {
      if (flight !== current) return;
      const t = clamp((now - started) / duration, 0, 1); const k = ease(t);
      const target = bodyPosition(to);
      scale = Math.exp(lerp(Math.log(fromScale), Math.log(scaleTo), k));
      // Move the focus in step with the visible span (1 / scale), not with time: pulling back from
      // the Earth keeps it in view until the wider system comes in, and diving in lands on it.
      const span = Math.abs(1 / scaleTo - 1 / fromScale) > 1e-12 ? clamp((1 / scale - 1 / fromScale) / (1 / scaleTo - 1 / fromScale), 0, 1) : k;
      focusPos = [lerp(fromPos[0], target[0], span), lerp(fromPos[1], target[1], span), lerp(fromPos[2], target[2], span)];
      azimuth = lerp(fromAzimuth, toAzimuth, k);
      draw();
      if (t < 1) requestAnimationFrame(step); else { flight = null; then?.(); }
    };
    requestAnimationFrame(step);
  }

  function select(id, { fly: flyThere = true } = {}) {
    selectedId = id;
    if (id && flyThere && (PLANET_BY_ID[id] || id === 'sun')) fly({ to: id, scaleTo: focusScale(id), turnTo: id === 'sun' ? null : daySideAzimuth(id) });
    onSelect(id);
    requestDraw();
  }

  // ---- gestures -------------------------------------------------------------
  const pointers = new Map();
  let drag = null; let spread = 0;
  function zoomBy(ratio) {
    if (flight) flight = null;
    const next = scale * ratio;
    const limit = maxScale();
    if (next > limit && focusId === 'earth') {
      exitPressure += Math.log(next / limit);
      if (exitPressure > EXIT_PRESSURE) { exitPressure = 0; onExit(); }
    } else exitPressure = Math.max(0, exitPressure - 0.02);
    scale = clamp(next, minScale(), limit);
    requestDraw();
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (!opened) return;
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) { const [a, c] = [...pointers.values()]; spread = Math.max(8, Math.hypot(a.x - c.x, a.y - c.y)); drag = null; return; }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, started: performance.now() };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) { const [a, c] = [...pointers.values()]; const next = Math.max(8, Math.hypot(a.x - c.x, a.y - c.y)); zoomBy(next / spread); spread = next; return; }
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
    const hit = screen.filter((entry) => entry.r).map((entry) => ({ entry, d: Math.hypot(entry.x - x, entry.y - y) })).filter(({ entry, d }) => d < Math.max(entry.r, 22)).sort((a, c) => a.d - c.d)[0];
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

  function snapshot() { return { open: opened, time, focusId, selectedId, scale, azimuth, elevation, bodies }; }

  return {
    isOpen: () => opened,
    /** Open close on the Earth (as big as the globe) and pull back to the inner Solar System. */
    open({ fromEarth = true } = {}) {
      opened = true; selectedId = null; exitPressure = 0;
      prepare();
      update();
      const { width, height } = viewport(); const short = Math.min(width, height);
      if (fromEarth) { focusId = 'earth'; focusPos = bodyPosition('earth'); scale = maxScale('earth'); azimuth = daySideAzimuth('earth'); elevation = 24 * DEG; fly({ to: 'sun', scaleTo: short / 4.2, duration: 2200 }); }
      else { focusId = 'sun'; focusPos = [0, 0, 0]; scale = short / 4.2; }
      draw();
    },
    /** Dive back into the Earth, then call `done`. */
    close(done = () => {}) {
      if (!opened) { done(); return; }
      selectedId = null;
      const finish = () => { opened = false; ctx.clearRect(0, 0, canvas.width, canvas.height); done(); };
      if (reducedMotion()) { finish(); return; }
      fly({ to: 'earth', scaleTo: maxScale('earth'), duration: 1500, then: finish, turnTo: daySideAzimuth('earth') });
    },
    setTime(next, { moon = null } = {}) { time = next; moonGeo = moon; if (opened) { update(); requestDraw(); } },
    select, focus: (id) => select(id),
    getSnapshot: snapshot,
    redraw: requestDraw
  };
}
