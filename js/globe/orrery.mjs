/**
 * Solar System view: the eight planets on their real orbits around the Sun,
 * in front of the real night sky.
 *
 * The bodies are rendered at display resolution as lit
 * spheres with surface detail (the Earth's real continents turning with the
 * clock, Jupiter's belts, Saturn's rings with the planet's shadow), the Sun's
 * limb and glow, orbits and the asteroid belt. The globe's
 * full-resolution sky layer sits behind this canvas and is turned to match
 * this camera (onSkyOrientation). Labels are drawn crisp on top.
 *
 * Distances are to scale. Bodies are drawn at their true size once that is
 * larger than a minimum, so the whole system stays visible in the overview.
 *
 * Gestures: one finger turns the view, zooming in returns to the globe.
 */

import { PLANETS, PLANET_BY_ID, centuriesSinceJ2000, heliocentricAt, orbitPath, galileanOffsets } from './planets.mjs?v=20260927-sky-events-v1';
import { greenwichSiderealDegrees } from './astronomy.mjs?v=20260927-sky-events-v1';
import { quaternionFromBasis } from './geometry.mjs?v=20260921-grid11-1';
import { WORLD_LAND_MASK } from '../../assets/maps/world-land-mask-v1.mjs?v=20260920-webgl2-1';

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const OBLIQUITY = 23.43928 * DEG;
const DOT = 1; // render at CSS-pixel resolution before display scaling
const MIN_SPAN_AU = 70; // the whole of Neptune's orbit fits across the short side
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

export function createOrrery({ canvas, onExit = () => {}, onSkyOrientation = () => {} }) {
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
  let focusOffset = [0, 0, 0];
  let returnEarthRadiusPx = null;
  let returnEarthSpan = 1;
  let bodies = [];
  let orbits = new Map();
  let orbitsAt = -Infinity;
  let moonGeo = null; // Moon relative to the Earth, AU (ecliptic)
  let frame = null;
  let flight = null;
  let closing = false;
  let closeCallbacks = [];
  let closeTimer = null;
  let closeFinish = null;
  let closeApproach = null;
  let closeApproachDone = false;
  let screen = [];
  function viewport() {
    const width = canvas.clientWidth || 1; const height = canvas.clientHeight || 1;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const lw = Math.ceil(width / DOT); const lh = Math.ceil(height / DOT);
    if (low.width !== lw || low.height !== lh) { low.width = lw; low.height = lh; }
    return { width, height, dpr, lw, lh };
  }

  function radiusAU(id) {
    if (id === 'sun') return SUN_RADIUS_KM / AU_KM;
    if (id === 'moon') return MOON_RADIUS_KM / AU_KM;
    return (PLANET_BY_ID[id]?.radiusKm || 1000) / AU_KM;
  }
  function minScale() { const { width, height } = viewport(); return Math.min(width, height) / MIN_SPAN_AU; }
  function returnRadius() {
    if (!returnEarthRadiusPx) return null;
    return returnEarthRadiusPx * Math.min(canvas.clientWidth || 1, canvas.clientHeight || 1) / returnEarthSpan;
  }
  // Close in, a planet may fill a little under half of the short side.
  function maxScale(id = focusId) { const { width, height } = viewport(); return (0.45 * Math.min(width, height)) / radiusAU(id); }

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
    if (!flight) {
      const position = bodyPosition(focusId);
      focusPos = [position[0] + focusOffset[0], position[1] + focusOffset[1], position[2] + focusOffset[2]];
    }
  }
  function bodyPosition(id) {
    if (id === 'sun') return [0, 0, 0];
    if (id === 'moon' && moonGeo) { const e = bodyPosition('earth'); return [e[0] + moonGeo[0], e[1] + moonGeo[1], e[2] + moonGeo[2]]; }
    return bodies.find((body) => body.id === id)?.position || [0, 0, 0];
  }

  // ---- rendering --------------------------------------------------------------
  // Composite a colour over whatever is already in the (transparent) dot buffer.
  function blend(data, i, r, g, b, a) {
    if (a <= 0) return;
    const under = data[i + 3] / 255; const outA = a + under * (1 - a);
    data[i] = (r * a + data[i] * under * (1 - a)) / outA; data[i + 1] = (g * a + data[i + 1] * under * (1 - a)) / outA; data[i + 2] = (b * a + data[i + 2] * under * (1 - a)) / outA;
    data[i + 3] = outA * 255;
  }

  // The sky layer (a smooth, full-resolution canvas behind this one) is turned to match this camera.
  // The sky shader reads its camera frame as Earth-fixed and rotates by sidereal time, which the
  // renderer holds at zero while this view is open, so camera axes go ecliptic → equatorial → that frame.
  let lastSkyKey = '';
  function aimSky(b) {
    const key = `${azimuth.toFixed(5)}:${elevation.toFixed(5)}`;
    if (key === lastSkyKey) return;
    lastSkyKey = key;
    const toSkyFrame = (v) => { const [X, Y, Z] = eclipticToEquatorial(v); return { x: Y, y: Z, z: X }; };
    onSkyOrientation(quaternionFromBasis(toSkyFrame(b.right), toSkyFrame(b.up), toSkyFrame(b.toward)));
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
          blend(data, i, 255, 214, 130, clamp(glow, 0, 1));
          if (r <= 1) {
            const mu = Math.sqrt(1 - d2); const limb = 0.45 + 0.55 * mu;
            const gran = 0.9 + 0.1 * noise3(nx * 9 + frameInfo.t * 0.3, ny * 9, 1.7);
            const cover = clamp((1 - r) * R + 0.5, 0, 1);
            blend(data, i, 255, 255 * clamp(0.62 + 0.38 * limb * gran, 0, 1), 255 * clamp(0.25 + 0.6 * limb * limb * gran, 0, 1), cover);
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
          blend(data, i, 255 * clamp(r, 0, 1), 255 * clamp(g, 0, 1), 255 * clamp(bl, 0, 1), cover);
        }
        if (ring > 0 && (ringFront || cover < 1)) {
          const a = ring * (ringFront ? 1 : 1 - cover);
          blend(data, i, 255 * ringColor[0], 255 * ringColor[1], 255 * ringColor[2], clamp(a, 0, 1));
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
    lowCtx.clearRect(0, 0, view.lw, view.lh);
    aimSky(b);

    // Orbits, thin and quiet; the focused one brighter.
    lowCtx.save();
    lowCtx.scale(1 / DOT, 1 / DOT);
    for (const [id, points] of orbits) {
      const strong = id === focusId;
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
        blend(data, i, v, v * 0.93, v * 0.82, 1);
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
    const drawn = list.map((body) => ({ body, p: project(body.position, view, b) }))
      .sort((a, c) => Number(a.body.id === 'sun') - Number(c.body.id === 'sun') || a.p.depth - c.p.depth);
    // The inner planets are deliberately exaggerated at overview scale; paint
    // the Sun last so those glyphs cannot punch dark gaps through its disc.
    screen = [];
    for (const { body, p } of drawn) {
      const radius = body.radiusKm ? Math.max(MIN_RADIUS[body.id] || 1.4, (body.radiusKm / AU_KM) * scale) : drawnRadius(body.id);
      if (p.x < -radius * 3 || p.y < -radius * 3 || p.x > view.width + radius * 3 || p.y > view.height + radius * 3) { screen.push({ id: body.id, x: p.x, y: p.y, r: 0, radius, body }); continue; }
      const light = norm([-body.position[0], -body.position[1], -body.position[2]]);
      paintBody(buffer, body.id, p, radius, b, light, bodyFrame(body.id, body.pole, time));
      screen.push({ id: body.id, x: p.x, y: p.y, r: Math.max(18, radius + 6), radius, body });
    }

    lowCtx.putImageData(buffer, 0, 0);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(low, 0, 0, view.lw * DOT, view.lh * DOT);

    // Crisp labels, in stable body order with overlaps omitted.
    ctx.textAlign = 'center';
    const labelBoxes = [];
    const labelBodies = screen.filter((entry) => entry.r && entry.id !== 'sun' && entry.id !== 'moon');
    for (const entry of screen) {
      if (!entry.r) continue;
      if (entry.body.minor && entry.radius < 3 && scale < 2e5) continue;
      if (entry.id === 'sun' || entry.id === 'moon') continue;
      ctx.font = '600 12px ui-rounded, "Hiragino Sans", system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2, 5, 10, .85)';
      const labelY = entry.y + entry.radius * (entry.id === 'saturn' ? 1.3 : 1) + 16;
      const textWidth = ctx.measureText(entry.body.name).width;
      const box = { left: entry.x - textWidth / 2 - 3, right: entry.x + textWidth / 2 + 3, top: labelY - 13, bottom: labelY + 3 };
      const crossesBody = labelBodies.some((body) => body.id !== entry.id && box.left < body.x + body.radius + 3 && box.right > body.x - body.radius - 3 && box.top < body.y + body.radius + 3 && box.bottom > body.y - body.radius - 3);
      const crossesLabel = labelBoxes.some((other) => box.left < other.right + 4 && box.right > other.left - 4 && box.top < other.bottom + 2 && box.bottom > other.top - 2);
      if (crossesBody || crossesLabel) continue;
      labelBoxes.push(box);
      ctx.strokeText(entry.body.name, entry.x, labelY);
      ctx.fillStyle = 'rgba(233, 246, 247, .88)';
      ctx.fillText(entry.body.name, entry.x, labelY);
    }
  }

  function requestDraw() { if (frame === null && opened && !document.hidden) frame = requestAnimationFrame(draw); }

  // ---- camera flights -------------------------------------------------------
  // The azimuth that looks at `id` from its day side, a little off the Sun line so it shows some shading.
  function daySideAzimuth(id) {
    const p = bodyPosition(id); const lx = -p[0]; const ly = -p[1];
    if (Math.hypot(lx, ly) < 1e-9) return azimuth;
    return Math.atan2(-lx, -ly) + 40 * DEG;
  }
  function cancelFlight() {
    if (!flight) return;
    if (flight.frame !== null) cancelAnimationFrame(flight.frame);
    flight = null;
  }
  function interruptFlight() {
    if (!flight) return;
    const fromId = flight.fromId;
    cancelFlight();
    if (fromId) focusId = fromId;
    const position = bodyPosition(focusId);
    focusOffset = [focusPos[0] - position[0], focusPos[1] - position[1], focusPos[2] - position[2]];
  }
  function fly({ to = focusId, scaleTo = scale, duration = 900, then = null, turnTo = null, allowClosing = false } = {}) {
    if ((!opened && !allowClosing) || (closing && !allowClosing)) return;
    cancelFlight();
    const fromPos = focusPos.slice(); const fromScale = scale;
    const fromAzimuth = azimuth;
    const fromId = focusId;
    let toAzimuth = turnTo ?? azimuth;
    while (toAzimuth - fromAzimuth > Math.PI) toAzimuth -= Math.PI * 2;
    while (toAzimuth - fromAzimuth < -Math.PI) toAzimuth += Math.PI * 2;
    focusId = to;
    if (reducedMotion()) { focusPos = bodyPosition(to); focusOffset = [0, 0, 0]; scale = scaleTo; azimuth = toAzimuth; then?.(); requestDraw(); return; }
    const started = performance.now();
    const current = { frame: null, scaleTo, fromId }; flight = current;
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
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      draw();
      if (t < 1) current.frame = requestAnimationFrame(step); else {
        focusOffset = [0, 0, 0];
        flight = null;
        then?.();
      }
    };
    current.frame = requestAnimationFrame(step);
  }

  // ---- gestures -------------------------------------------------------------
  const pointers = new Map();
  let drag = null; let spread = 0; let exitRequested = false;
  function localPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clamp(clientX - rect.left, 0, rect.width), y: clamp(clientY - rect.top, 0, rect.height) };
  }
  function zoomBy(ratio, fromPoint = null, toPoint = fromPoint) {
    if (!opened || closing || !Number.isFinite(ratio) || ratio <= 0 || exitRequested) return;
    interruptFlight();
    const view = viewport();
    const center = { x: view.width / 2, y: view.height / 2 };
    const from = fromPoint || center; const to = toPoint || center;
    if (ratio === 1 && from.x === to.x && from.y === to.y) return;
    // Zoom directly toward the visible body under the gesture, without moving
    // the scene first. A tap is only a shortcut to a closer view.
    const target = ratio > 1 ? bodyAt(from) : null;
    if (target && Math.hypot(target.x - from.x, target.y - from.y) <= Math.max(12, target.radius + 8)) focusId = target.id;
    const lower = minScale();
    const earthReturnScale = returnRadius() && returnRadius() / radiusAU('earth');
    const upper = Math.max(scale, maxScale(focusId), focusId === 'earth' && earthReturnScale ? earthReturnScale : 0);
    const nextScale = clamp(scale * ratio, lower, upper);
    const b = basis();
    const planePoint = [
      focusPos[0] + b.right[0] * ((from.x - center.x) / scale) - b.up[0] * ((from.y - center.y) / scale),
      focusPos[1] + b.right[1] * ((from.x - center.x) / scale) - b.up[1] * ((from.y - center.y) / scale),
      focusPos[2] + b.right[2] * ((from.x - center.x) / scale) - b.up[2] * ((from.y - center.y) / scale)
    ];
    scale = nextScale;
    if (scale <= lower) {
      focusId = 'sun'; focusPos = [0, 0, 0]; focusOffset = [0, 0, 0]; scale = lower;
    } else {
      focusPos = [
        planePoint[0] - b.right[0] * ((to.x - center.x) / scale) + b.up[0] * ((to.y - center.y) / scale),
        planePoint[1] - b.right[1] * ((to.x - center.x) / scale) + b.up[1] * ((to.y - center.y) / scale),
        planePoint[2] - b.right[2] * ((to.x - center.x) / scale) + b.up[2] * ((to.y - center.y) / scale)
      ];
      const position = bodyPosition(focusId);
      focusOffset = [focusPos[0] - position[0], focusPos[1] - position[1], focusPos[2] - position[2]];
    }
    if (ratio > 1 && focusId === 'earth' && earthReturnScale && scale >= earthReturnScale) {
      const earth = project(bodyPosition('earth'), view, b);
      const pad = Math.min(view.width, view.height) * 0.2;
      if (earth.x >= -pad && earth.x <= view.width + pad && earth.y >= -pad && earth.y <= view.height + pad) {
        scale = earthReturnScale;
        exitRequested = true;
        onExit();
        return;
      }
    }
    requestDraw();
  }
  function approachBody(id) {
    if (!(id === 'sun' || id === 'moon' || PLANET_BY_ID[id])) return;
    interruptFlight();
    const targetRadiusPx = Math.min(viewport().width, viewport().height) * 0.11;
    const targetScale = targetRadiusPx / radiusAU(id);
    fly({ to: id, scaleTo: targetScale, duration: 900, turnTo: daySideAzimuth(id) });
  }
  function bodyAt(point) {
    return screen.map((entry) => ({ entry, distance: Math.hypot(entry.x - point.x, entry.y - point.y) }))
      .filter(({ entry, distance }) => entry.r > 0 && (entry.id === 'sun' || entry.id === 'moon' || PLANET_BY_ID[entry.id]) && distance <= Math.max(24, entry.r, entry.radius + 8))
      .sort((a, b) => a.distance - b.distance)[0]?.entry || null;
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (!opened || closing) return;
    interruptFlight();
    canvas.setPointerCapture?.(event.pointerId);
    const point = localPoint(event.clientX, event.clientY);
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) { const [a, c] = [...pointers.values()]; spread = Math.max(8, Math.hypot(a.x - c.x, a.y - c.y)); drag = null; return; }
    drag = { id: event.pointerId, ...point, startX: point.x, startY: point.y, moved: false, started: performance.now() };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || closing) return;
    const point = localPoint(event.clientX, event.clientY);
    const previous = pointers.get(event.pointerId);
    const other = pointers.size >= 2 ? [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1] : null;
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      const [a, c] = [...pointers.values()]; const next = Math.max(8, Math.hypot(a.x - c.x, a.y - c.y));
      const from = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
      const to = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
      zoomBy(next / spread, from, to); spread = next; return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    azimuth -= (point.x - drag.x) * 0.006;
    elevation = clamp(elevation + (point.y - drag.y) * 0.006, 4 * DEG, 89 * DEG);
    drag.x = point.x; drag.y = point.y;
    requestDraw();
  });
  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    const finished = drag; drag = null;
    if (pointers.size === 1) { const [[id, point]] = [...pointers.entries()]; drag = { id, x: point.x, y: point.y, startX: point.x, startY: point.y, moved: true, started: 0 }; return; }
    if (event.type !== 'pointerup' || !finished || finished.moved || performance.now() - finished.started > 450) return;
    const target = bodyAt(localPoint(event.clientX, event.clientY));
    if (target) approachBody(target.id);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('wheel', (event) => {
    if (!opened || closing) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const delta = clamp(event.deltaY * units, -100, 100);
    if (!delta) return;
    zoomBy(Math.exp(-delta * (event.ctrlKey ? 0.008 : 0.007)), localPoint(event.clientX, event.clientY));
  }, { passive: false });
  canvas.addEventListener('keydown', (event) => {
    if (!opened || closing) return;
    const center = { x: (canvas.clientWidth || 1) / 2, y: (canvas.clientHeight || 1) / 2 };
    if (event.key === '+' || event.key === '=') zoomBy(1.25, center);
    else if (event.key === '-' || event.key === '_') zoomBy(0.8, center);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { azimuth += event.key === 'ArrowLeft' ? 0.12 : -0.12; requestDraw(); }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { elevation = clamp(elevation + (event.key === 'ArrowUp' ? 0.1 : -0.1), 4 * DEG, 89 * DEG); requestDraw(); }
    else return;
    event.preventDefault();
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => requestDraw()).observe(canvas);

  function snapshot() { return { open: opened, closing, flying: Boolean(flight), time, focusId, scale, focusPos: focusPos.slice(), focusOffset: focusOffset.slice(), returnEarthRadiusPx: returnRadius(), azimuth, elevation, view: { width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 }, bodies: bodies.map((body) => ({ ...body, position: body.position.slice(), pole: body.pole?.slice() })) }; }

  function finishClose() {
    if (!closing) return;
    if (closeTimer !== null) { clearTimeout(closeTimer); closeTimer = null; }
    cancelFlight();
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
    closing = false; opened = false; exitRequested = false;
    pointers.clear(); drag = null; spread = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const callbacks = closeCallbacks; closeCallbacks = [];
    closeFinish = null; closeApproach = null; closeApproachDone = false;
    callbacks.forEach((callback) => callback());
  }

  function arriveClose(immediate = false) {
    if (!closing) return;
    if (!closeApproachDone) {
      focusId = 'earth'; focusOffset = [0, 0, 0]; focusPos = bodyPosition('earth');
      if (Number.isFinite(closeFinish?.earthRadiusPx) && closeFinish.earthRadiusPx > 0) scale = closeFinish.earthRadiusPx / radiusAU('earth');
      closeApproachDone = true;
      closeApproach?.({ immediate: immediate || reducedMotion() || document.hidden });
    }
    if (immediate || reducedMotion() || document.hidden) { finishClose(); return; }
    if (closeTimer === null) closeTimer = setTimeout(finishClose, 240);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !opened) {
      if (closing) {
        if (flight) cancelFlight();
        arriveClose(true);
        return;
      }
      if (!document.hidden || !opened) return;
      if (flight) {
        interruptFlight();
      }
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      pointers.clear(); drag = null; spread = 0;
      return;
    }
    requestDraw();
  });

  return {
    isOpen: () => opened,
    /** Open at the system overview, or pull back from a supplied globe radius. */
    open({ earthRadiusPx, returnEarthRadiusPx: returnRadiusPx } = {}) {
      if (closing) return;
      cancelFlight();
      opened = true; exitRequested = false; lastSkyKey = '';
      pointers.clear(); drag = null; spread = 0;
      focusOffset = [0, 0, 0];
      returnEarthRadiusPx = Number.isFinite(returnRadiusPx) && returnRadiusPx > 0 ? returnRadiusPx : null;
      returnEarthSpan = Math.min(canvas.clientWidth || 1, canvas.clientHeight || 1);
      const enterFromEarth = Number.isFinite(earthRadiusPx) && earthRadiusPx > 0 && !reducedMotion() && !document.hidden;
      focusId = enterFromEarth ? 'earth' : 'sun';
      update();
      if (enterFromEarth) {
        scale = earthRadiusPx / radiusAU('earth');
        azimuth = daySideAzimuth('earth');
      } else {
        focusId = 'sun'; focusPos = [0, 0, 0]; scale = minScale();
      }
      draw();
      if (enterFromEarth) fly({ to: 'sun', scaleTo: minScale(), duration: 900, turnTo: -90 * DEG });
    },
    /** Dive back into the Earth, then call `done`. */
    close(done = () => {}, { earthRadiusPx = returnRadius(), onApproach = null } = {}) {
      if (!opened) { done(); return; }
      closeCallbacks.push(done);
      if (closing) return;
      closing = true;
      exitRequested = true;
      pointers.clear(); drag = null; spread = 0;
      const targetRadius = Number.isFinite(earthRadiusPx) && earthRadiusPx > 0 ? earthRadiusPx : returnRadius();
      const targetScale = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius / radiusAU('earth') : maxScale('earth');
      closeFinish = { earthRadiusPx: targetRadius };
      closeApproach = onApproach;
      closeApproachDone = false;
      if (reducedMotion() || document.hidden) {
        focusId = 'earth'; focusPos = bodyPosition('earth'); focusOffset = [0, 0, 0]; scale = targetScale;
        if (!document.hidden) draw();
        arriveClose(true); return;
      }
      fly({ to: 'earth', scaleTo: targetScale, duration: 400, then: () => arriveClose(false), turnTo: daySideAzimuth('earth'), allowClosing: true });
    },
    setTime(next, { moon = null } = {}) { time = next; moonGeo = moon; if (opened) { update(); requestDraw(); } },
    getSnapshot: snapshot,
    redraw: requestDraw
  };
}
