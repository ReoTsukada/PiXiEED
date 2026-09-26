/**
 * The real night sky: 19,000 stars down to magnitude 7.2 from the Hipparcos
 * catalogue and the Milky Way's outline, both from d3-celestial (BSD-3-Clause,
 * © Olaf Frohn), packed by scripts/build-real-sky.mjs into a 155 KB file.
 *
 * `paintSky` turns it into an equirectangular canvas in celestial (RA/Dec)
 * coordinates: u = RA / 360° + 0.5 (RA taken in -180..180°), v = 0.5 - Dec / 180°,
 * the layout the globe and telescope shaders already sample.
 */

const DEG = Math.PI / 180;
export const REAL_SKY_URL = new URL('../../assets/sky/real-sky-v1.bin', import.meta.url).href;

export function parseRealSky(buffer) {
  const view = new DataView(buffer);
  const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (tag !== 'SKY1') throw new Error('Not a real-sky file');
  let offset = 4;
  const starCount = view.getUint32(offset, true); offset += 4;
  const ra = new Float32Array(starCount); const dec = new Float32Array(starCount);
  const mag = new Float32Array(starCount); const bv = new Float32Array(starCount);
  for (let i = 0; i < starCount; i += 1) {
    ra[i] = (view.getUint16(offset, true) / 65535) * 360;
    dec[i] = (view.getInt16(offset + 2, true) / 32767) * 90;
    mag[i] = view.getUint8(offset + 4) / 25 - 2;
    bv[i] = view.getUint8(offset + 5) / 80 - 0.5;
    offset += 6;
  }
  const levelCount = view.getUint32(offset, true); offset += 4;
  const milkyWay = [];
  for (let level = 0; level < levelCount; level += 1) {
    const ringCount = view.getUint32(offset, true); offset += 4;
    const rings = [];
    for (let r = 0; r < ringCount; r += 1) {
      const count = view.getUint32(offset, true); offset += 4;
      const ring = new Float32Array(count * 2);
      for (let k = 0; k < count; k += 1) {
        ring[k * 2] = (view.getUint16(offset, true) / 65535) * 360;
        ring[k * 2 + 1] = (view.getInt16(offset + 2, true) / 32767) * 90;
        offset += 4;
      }
      rings.push(ring);
    }
    milkyWay.push(rings);
  }
  return { count: starCount, ra, dec, mag, bv, milkyWay };
}

export async function loadRealSky(url = REAL_SKY_URL) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`real sky ${response.status}`);
  return parseRealSky(await response.arrayBuffer());
}

/** Star colour from the B-V colour index (Ballesteros' temperature, then a blackbody tint). */
export function starColor(bvIndex) {
  const bv = Math.max(-0.4, Math.min(2.0, bvIndex));
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const k = t / 100;
  const r = k <= 66 ? 255 : 329.7 * (k - 60) ** -0.1332;
  const g = k <= 66 ? 99.47 * Math.log(k) - 161.12 : 288.12 * (k - 60) ** -0.0755;
  const b = k >= 66 ? 255 : k <= 19 ? 0 : 138.52 * Math.log(k - 10) - 305.04;
  // Keep the tint gentle: stars read as white with a hint of blue or amber.
  const mix = (c) => Math.round(255 * 0.45 + Math.max(0, Math.min(255, c)) * 0.55);
  return [mix(r), mix(g), mix(b)];
}

const x = (raDeg, width) => (((raDeg + 180) % 360 + 360) % 360) / 360 * width; // RA 0 sits at u = 0.5
const y = (decDeg, height) => (0.5 - decDeg / 180) * height;

function paintMilkyWay(ctx, sky, width, height) {
  // Draw the nested brightness levels small, then scale up: the upscale is the blur.
  const small = document.createElement('canvas');
  small.width = Math.round(width / 6); small.height = Math.round(height / 6);
  const s = small.getContext('2d');
  s.fillStyle = '#000'; s.fillRect(0, 0, small.width, small.height);
  s.globalCompositeOperation = 'lighter';
  const tones = ['rgba(92, 104, 150, .045)', 'rgba(118, 124, 165, .045)', 'rgba(150, 146, 170, .05)', 'rgba(190, 176, 170, .055)', 'rgba(225, 205, 180, .06)'];
  sky.milkyWay.forEach((rings, level) => {
    s.fillStyle = tones[Math.min(level, tones.length - 1)];
    for (const ring of rings) {
      // Unwrap the ring across the 0/360 seam, then draw it three times so the seam is covered.
      const lon = []; let previous = null;
      for (let k = 0; k < ring.length; k += 2) {
        let value = ((ring[k] + 180) % 360 + 360) % 360;
        if (previous !== null) { while (value - previous > 180) value -= 360; while (value - previous < -180) value += 360; }
        lon.push(value); previous = value;
      }
      for (const shift of [-360, 0, 360]) {
        s.beginPath();
        lon.forEach((value, i) => { const px = ((value + shift) / 360) * small.width; const py = y(ring[i * 2 + 1], small.height); if (i === 0) s.moveTo(px, py); else s.lineTo(px, py); });
        s.closePath(); s.fill();
      }
    }
  });
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(small, 0, 0, width, height);
  ctx.restore();
}

/**
 * Paint the sky into a new canvas. Faint stars are single soft pixels; bright
 * ones get a small halo. Near the poles each star is widened by 1/cos(dec) so it
 * stays round once wrapped onto the sphere.
 */
export function paintSky(sky, { width = 4096, height = 2048, milkyWay = true, brightness = 1, brighterThan = -Infinity } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(3, 5, 10)';
  ctx.fillRect(0, 0, width, height);
  if (milkyWay) paintMilkyWay(ctx, sky, width, height);
  ctx.globalCompositeOperation = 'lighter';
  const pixelDegrees = 360 / width;
  for (let i = sky.count - 1; i >= 0; i -= 1) {
    const m = sky.mag[i];
    if (m < brighterThan) continue; // drawn elsewhere as sharp sprites
    const flux = Math.min(8, 10 ** (-0.4 * (m - 2.2))) * brightness;
    const px = x(sky.ra[i], width); const py = y(sky.dec[i], height);
    const stretch = 1 / Math.max(0.08, Math.cos(sky.dec[i] * DEG));
    const [r, g, b] = starColor(sky.bv[i]);
    if (m > 4.2) {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, 0.18 + flux * 0.9).toFixed(3)})`;
      const w = Math.max(1, stretch * (pixelDegrees < 0.06 ? 1.2 : 1));
      ctx.fillRect(px - w / 2, py - 0.5, w, 1);
      continue;
    }
    const radius = 1.1 + (4.2 - m) * 0.55;
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2.2);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    gradient.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, ${Math.min(1, 0.35 + flux * 0.08).toFixed(3)})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.save();
    ctx.translate(px, py); ctx.scale(stretch, 1);
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(0, 0, radius * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  return canvas;
}

/** Sample helper for CPU renderers: RGB at a celestial direction from an ImageData made by paintSky. */
export function createSkySampler(imageData) {
  const { width, height, data } = imageData;
  return function sample(raDeg, decDeg, out) {
    const px = Math.floor(x(raDeg, width)) % width;
    const py = Math.max(0, Math.min(height - 1, Math.floor(y(decDeg, height))));
    const index = (py * width + px) * 4;
    out[0] = data[index]; out[1] = data[index + 1]; out[2] = data[index + 2];
    return out;
  };
}

let shared = null;
/** The sky loaded and painted once per page, shared by the globe, the telescope and the Solar System view. */
export function sharedSky() {
  if (!shared) shared = loadRealSky().then((sky) => {
    sky.colors = (i) => starColor(sky.bv[i]);
    return { sky, canvas: paintSky(sky) };
  });
  return shared;
}
let sharedFaint = null;
/** The same sky without the stars brighter than `SPRITE_MAGNITUDE`, for layers that draw those as sprites. */
export const SPRITE_MAGNITUDE = 4.6;
export function sharedFaintSky() {
  if (!sharedFaint) sharedFaint = sharedSky().then(({ sky }) => ({ sky, canvas: paintSky(sky, { brighterThan: SPRITE_MAGNITUDE }) }));
  return sharedFaint;
}
