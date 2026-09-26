/**
 * Animated GIF for the pixel camera: hold the shutter to record, release to finish.
 *
 * Frames are the camera's finished dot images (RGBA at dot resolution). They share one global palette:
 * the exact colours when the look uses 256 or fewer (every look except フル), otherwise a median-cut
 * palette over all frames. Pixels are scaled up by an integer factor with no smoothing, so the dots stay sharp.
 */
export const GIF_MAX_MS = 5000;
export const GIF_FPS = 10;
export const GIF_LONG_EDGE = 512;

const key = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

/** Count the colours used across the frames (stops counting past `limit`). */
export function collectColors(frames, limit = 256) {
  const counts = new Map();
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      const k = key(d, i);
      const c = counts.get(k);
      if (c !== undefined) counts.set(k, c + 1);
      else { counts.set(k, 1); if (counts.size > limit * 64) return counts; }
    }
  }
  return counts;
}

/** Median cut on a weighted colour histogram → up to `size` colours as ints 0xRRGGBB. */
export function medianCut(counts, size = 256) {
  const colors = [...counts.entries()].map(([k, n]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255, n]);
  let boxes = [colors];
  while (boxes.length < size) {
    let best = -1; let bestRange = -1; let bestAxis = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let axis = 0; axis < 3; axis++) {
        let lo = 255; let hi = 0;
        for (const c of box) { if (c[axis] < lo) lo = c[axis]; if (c[axis] > hi) hi = c[axis]; }
        if (hi - lo > bestRange) { bestRange = hi - lo; best = index; bestAxis = axis; }
      }
    });
    if (best < 0 || bestRange <= 0) break;
    const box = boxes[best].sort((a, b) => a[bestAxis] - b[bestAxis]);
    const total = box.reduce((s, c) => s + c[3], 0);
    let acc = 0; let cut = 1;
    for (let i = 0; i < box.length - 1; i++) { acc += box[i][3]; if (acc >= total / 2) { cut = i + 1; break; } cut = i + 1; }
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.filter((b) => b.length).map((box) => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (const c of box) { r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; n += c[3]; }
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  });
}

export function buildPalette(frames) {
  const counts = collectColors(frames);
  return counts.size <= 256 ? [...counts.keys()] : medianCut(counts, 256);
}

function nearest(palette, r, g, b) {
  let best = 0; let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]; const dr = ((p >> 16) & 255) - r; const dg = ((p >> 8) & 255) - g; const db = (p & 255) - b;
    const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Colour → palette index. Exact colours hit a Map; others use a 15-bit (5 bits per channel) nearest cache. */
function indexer(palette) {
  const exact = new Map(palette.map((c, i) => [c, i]));
  const coarse = new Int16Array(32768).fill(-1);
  return (k) => {
    const index = exact.get(k);
    if (index !== undefined) return index;
    const q = ((k >> 9) & 0x7c00) | ((k >> 6) & 0x3e0) | ((k >> 3) & 0x1f);
    let c = coarse[q];
    if (c < 0) { c = nearest(palette, ((q >> 10) << 3) | 4, (((q >> 5) & 31) << 3) | 4, ((q & 31) << 3) | 4); coarse[q] = c; }
    return c;
  };
}

class ByteWriter {
  constructor(size = 1 << 16) { this.buf = new Uint8Array(size); this.len = 0; }
  grow(n) { if (this.len + n <= this.buf.length) return; let s = this.buf.length * 2; while (s < this.len + n) s *= 2; const b = new Uint8Array(s); b.set(this.buf.subarray(0, this.len)); this.buf = b; }
  byte(v) { this.grow(1); this.buf[this.len++] = v & 255; }
  word(v) { this.byte(v); this.byte(v >> 8); }
  bytes(arr) { this.grow(arr.length); this.buf.set(arr, this.len); this.len += arr.length; }
  str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.len); }
}

/** GIF LZW compression of one frame's palette indices, written as sub-blocks. */
export function lzwEncode(indices, minCodeSize, out) {
  const clear = 1 << minCodeSize; const eoi = clear + 1;
  let codeSize = minCodeSize + 1; let next = eoi + 1;
  const table = new Map();
  const block = new Uint8Array(255); let blockLen = 0;
  let bits = 0; let bitCount = 0;
  const flushBlock = () => { if (!blockLen) return; out.byte(blockLen); out.bytes(block.subarray(0, blockLen)); blockLen = 0; };
  const emit = (code) => {
    bits |= code << bitCount; bitCount += codeSize;
    while (bitCount >= 8) { block[blockLen++] = bits & 255; bits >>>= 8; bitCount -= 8; if (blockLen === 255) flushBlock(); }
  };
  out.byte(minCodeSize);
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const combo = prefix * 4096 + k;
    const found = table.get(combo);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) {
      table.set(combo, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear); table.clear(); codeSize = minCodeSize + 1; next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bitCount > 0) { block[blockLen++] = bits & 255; if (blockLen === 255) flushBlock(); }
  flushBlock();
  out.byte(0);
}

/**
 * frames: [{ width, height, data: RGBA }] all the same size. Returns Uint8Array GIF bytes.
 * `scale` enlarges each dot to scale×scale pixels.
 */
export function encodeGif(frames, { delayMs = 1000 / GIF_FPS, scale = 1, palette = buildPalette(frames) } = {}) {
  if (!frames.length) throw new RangeError('no frames');
  const { width, height } = frames[0];
  const W = width * scale; const H = height * scale;
  let bitsPerColor = 1; while ((1 << bitsPerColor) < Math.max(2, palette.length)) bitsPerColor++;
  const tableSize = 1 << bitsPerColor;
  const out = new ByteWriter(W * H);
  out.str('GIF89a'); out.word(W); out.word(H);
  out.byte(0x80 | ((bitsPerColor - 1) << 4) | (bitsPerColor - 1)); out.byte(0); out.byte(0);
  for (let i = 0; i < tableSize; i++) { const c = palette[i] ?? 0; out.byte(c >> 16); out.byte(c >> 8); out.byte(c); }
  out.bytes([0x21, 0xff, 0x0b]); out.str('NETSCAPE2.0'); out.bytes([3, 1, 0, 0, 0]); // loop forever
  const toIndex = indexer(palette);
  const delay = Math.max(2, Math.round(delayMs / 10));
  const small = new Uint8Array(width * height);
  const big = new Uint8Array(W * H);
  for (const frame of frames) {
    const d = frame.data;
    for (let p = 0, i = 0; p < small.length; p++, i += 4) small[p] = toIndex(key(d, i));
    let indices = small;
    if (scale > 1) {
      for (let y = 0; y < H; y++) { const row = ((y / scale) | 0) * width; const o = y * W; for (let x = 0; x < W; x++) big[o + x] = small[row + ((x / scale) | 0)]; }
      indices = big;
    }
    out.bytes([0x21, 0xf9, 4, 0x04, delay & 255, delay >> 8, 0, 0]); // graphic control: keep previous, delay
    out.byte(0x2c); out.word(0); out.word(0); out.word(W); out.word(H); out.byte(0);
    lzwEncode(indices, Math.max(2, bitsPerColor), out);
  }
  out.byte(0x3b);
  return out.result();
}

export function gifScale(width, height, longEdge = GIF_LONG_EDGE) {
  return Math.max(1, Math.floor(longEdge / Math.max(width, height)));
}
