/** Local, bounded codecs for less common formats. No network or DOM access. */
export const LIMITS = Object.freeze({ edge: 4096, pixels: 8_000_000, bytes: 64 * 1024 * 1024, seconds: 120 });
export const IMAGE_TYPES = Object.freeze({ bmp: 'image/bmp', tga: 'image/x-tga', qoi: 'image/qoi', pbm: 'image/x-portable-bitmap', pgm: 'image/x-portable-graymap', ppm: 'image/x-portable-pixmap', tiff: 'image/tiff', ico: 'image/vnd.microsoft.icon' });
const error = (message = 'ファイルの内容が不正か、この種類の圧縮・設定にはまだ対応していません。') => new Error(message);
const text = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
const bytes = value => {
  const b = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (!b.length || b.length > LIMITS.bytes) throw error('ファイルは64MB以下にしてください。');
  return b;
};
const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
function range(b, p, n) { if (!Number.isSafeInteger(p) || !Number.isSafeInteger(n) || p < 0 || n < 0 || p + n > b.length) throw error('ファイルが途中で切れているか、ヘッダーが不正です。'); }
export function checkDimensions(w, h) {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || w > LIMITS.edge || h > LIMITS.edge || w * h > LIMITS.pixels) throw error('画像は各辺4096px・800万画素以内にしてください。');
}
function image(w, h) { checkDimensions(w, h); return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
function checkFrame(f) { checkDimensions(f?.width, f?.height); if (!(f.data instanceof Uint8Array || f.data instanceof Uint8ClampedArray) || f.data.length !== f.width * f.height * 4) throw error(); }
function white(f, i, c) { const a = f.data[i + 3] / 255; return Math.round(f.data[i + c] * a + 255 * (1 - a)); }
export function detectExtraFormat(value, name = '') {
  const b = bytes(value), tag = text(b, 0, 4);
  if (tag === 'qoif') return 'qoi';
  if (text(b, 0, 2) === 'BM') return 'bmp';
  if (/^P[1-6]\s/.test(text(b, 0, 3))) return 'pnm';
  if (tag === 'II*\0' || tag === 'MM\0*') return 'tiff';
  if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
  if (tag === 'FORM' && ['AIFF', 'AIFC'].includes(text(b, 8, 4))) return 'aiff';
  if (tag === '.snd') return 'au';
  if (/\.tga$/i.test(name)) return 'tga';
  return '';
}
function decodeBmp(b) {
  range(b, 0, 54); const v = view(b), start = v.getUint32(10, true), header = v.getUint32(14, true);
  if (![40, 108, 124].includes(header) || v.getUint16(26, true) !== 1 || v.getUint32(30, true) !== 0) throw error('BMPは非圧縮の1/4/8/24/32bitに対応しています。');
  range(b, 14, header); const w = v.getInt32(18, true), sh = v.getInt32(22, true), h = Math.abs(sh), bits = v.getUint16(28, true);
  checkDimensions(w, h); if (![1, 4, 8, 24, 32].includes(bits)) throw error();
  const stride = Math.ceil(w * bits / 32) * 4; range(b, start, stride * h);
  let colors = 0;
  if (bits <= 8) { colors = v.getUint32(46, true) || 2 ** bits; if (colors > 2 ** bits) throw error(); range(b, 14 + header, colors * 4); }
  if (start < 14 + header + colors * 4) throw error();
  const f = image(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const row = start + (sh < 0 ? y : h - y - 1) * stride; let p;
    if (bits <= 8) { const bit = x * bits, index = (b[row + (bit >> 3)] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1); if (index >= colors) throw error(); p = 14 + header + index * 4; }
    else p = row + x * (bits / 8);
    const i = (y * w + x) * 4; f.data.set([b[p + 2], b[p + 1], b[p], 255], i);
  }
  return f;
}
function decodeTga(b) {
  range(b, 0, 18); const v = view(b), type = b[2], bits = b[16], descriptor = b[17];
  if (b[1] !== 0 || ![2, 3, 10, 11].includes(type) || descriptor & 0xc0 || ([3, 11].includes(type) ? bits !== 8 : ![24, 32].includes(bits)) || ![0, 8].includes(descriptor & 15)) throw error('TGAはグレー8bit・カラー24/32bit、非圧縮/RLEに対応しています。');
  const f = image(v.getUint16(12, true), v.getUint16(14, true)), n = f.width * f.height, step = bits / 8;
  let p = 18 + b[0], done = 0; range(b, 18, b[0]);
  const write = pixel => { let x = done % f.width, y = Math.floor(done / f.width); if (descriptor & 16) x = f.width - x - 1; if (!(descriptor & 32)) y = f.height - y - 1; f.data.set(pixel, (y * f.width + x) * 4); done++; };
  const read = () => { range(b, p, step); const a = step === 4 && (descriptor & 15) === 8 ? b[p + 3] : 255; const pixel = step === 1 ? [b[p], b[p], b[p], 255] : [b[p + 2], b[p + 1], b[p], a]; p += step; return pixel; };
  while (done < n) {
    let count = 1, run = false;
    if (type >= 10) { range(b, p, 1); const packet = b[p++]; count = (packet & 127) + 1; run = !!(packet & 128); }
    if (done + count > n) throw error();
    if (run) { const pixel = read(); for (let j = 0; j < count; j++) write(pixel); }
    else for (let j = 0; j < count; j++) write(read());
  }
  return f;
}
function decodeQoi(b) {
  range(b, 0, 22); const v = view(b), w = v.getUint32(4), h = v.getUint32(8); checkDimensions(w, h);
  if (![3, 4].includes(b[12]) || b[13] > 1 || ![0, 0, 0, 0, 0, 0, 0, 1].every((v, i) => b[b.length - 8 + i] === v)) throw error('QOIのヘッダーまたは終端が不正です。');
  const f = image(w, h), index = new Uint8Array(256); let p = 14, rgba = [0, 0, 0, 255], run = 0;
  const need = n => { if (p + n > b.length - 8) throw error(); };
  for (let i = 0; i < w * h; i++) {
    if (run) run--;
    else {
      need(1); const op = b[p++];
      if (op === 254) { need(3); rgba = [b[p++], b[p++], b[p++], rgba[3]]; }
      else if (op === 255) { need(4); rgba = [b[p++], b[p++], b[p++], b[p++]]; }
      else if ((op & 192) === 0) rgba = Array.from(index.subarray((op & 63) * 4, (op & 63) * 4 + 4));
      else if ((op & 192) === 64) rgba = [(rgba[0] + ((op >> 4) & 3) - 2) & 255, (rgba[1] + ((op >> 2) & 3) - 2) & 255, (rgba[2] + (op & 3) - 2) & 255, rgba[3]];
      else if ((op & 192) === 128) { need(1); const next = b[p++], dg = (op & 63) - 32; rgba = [(rgba[0] + dg + (next >> 4) - 8) & 255, (rgba[1] + dg) & 255, (rgba[2] + dg + (next & 15) - 8) & 255, rgba[3]]; }
      else { run = op & 63; if (i + run >= w * h) throw error(); }
    }
    index.set(rgba, ((rgba[0] * 3 + rgba[1] * 5 + rgba[2] * 7 + rgba[3] * 11) % 64) * 4); f.data.set(rgba, i * 4);
  }
  if (p !== b.length - 8 || run) throw error('QOIの画素数とデータ長が一致しません。');
  return f;
}
function decodePnm(b) {
  let p = 2; const kind = b[1] - 48, whitespace = v => [9, 10, 11, 12, 13, 32].includes(v);
  const token = () => { while (p < b.length) { if (whitespace(b[p])) { p++; continue; } if (b[p] === 35) { while (p < b.length && ![10, 13].includes(b[p])) p++; continue; } break; } const start = p; while (p < b.length && b[p] >= 48 && b[p] <= 57) p++; if (start === p || p - start > 10) throw error(); return Number(text(b, start, p - start)); };
  if (![1, 2, 3, 4, 5, 6].includes(kind)) throw error();
  const w = token(), h = token(), max = [1, 4].includes(kind) ? 1 : token(); checkDimensions(w, h);
  if (max < 1 || max > 65535) throw error();
  const f = image(w, h), channels = [3, 6].includes(kind) ? 3 : 1;
  if (kind >= 4) { if (!whitespace(b[p])) throw error(); if (b[p++] === 13 && b[p] === 10) p++; }
  const sample = () => { let v; if (kind <= 3) v = token(); else { range(b, p, max > 255 ? 2 : 1); v = max > 255 ? b[p++] * 256 + b[p++] : b[p++]; } if (v > max) throw error(); return [1, 4].includes(kind) ? (v ? 0 : 255) : Math.round(v * 255 / max); };
  if (kind === 4) { const stride = Math.ceil(w / 8); range(b, p, stride * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = (b[p + y * stride + (x >> 3)] & (128 >> (x & 7))) ? 0 : 255; f.data.set([c, c, c, 255], (y * w + x) * 4); } p += stride * h; }
  else for (let i = 0; i < w * h; i++) { const r = sample(), g = channels === 3 ? sample() : r, bl = channels === 3 ? sample() : r; f.data.set([r, g, bl, 255], i * 4); }
  while (p < b.length && whitespace(b[p])) p++;
  if (p !== b.length) throw error('複数画像を連結したPNMは、1画像ずつのファイルに分けてください。');
  return f;
}
function decodeTiff(b) {
  range(b, 0, 8); const v = view(b), le = b[0] === 73, u16 = p => { range(b, p, 2); return v.getUint16(p, le); }, u32 = p => { range(b, p, 4); return v.getUint32(p, le); };
  const offset = u32(4), count = u16(offset); if (count > 256) throw error(); range(b, offset + 2, count * 12 + 4);
  if (u32(offset + 2 + count * 12) !== 0) throw error('複数ページのTIFFは未対応です。単一ページを選んでください。');
  const tags = new Map();
  for (let i = 0; i < count; i++) { const p = offset + 2 + i * 12, tag = u16(p), type = u16(p + 2), n = u32(p + 4); if (tags.has(tag)) throw error(); if (![1, 3, 4].includes(type)) continue; if (n > 65536) throw error(); const size = type === 1 ? 1 : type === 3 ? 2 : 4, start = n * size <= 4 ? p + 8 : u32(p + 8); range(b, start, n * size); tags.set(tag, Array.from({ length: n }, (_, j) => type === 1 ? b[start + j] : type === 3 ? u16(start + j * 2) : u32(start + j * 4))); }
  const first = (tag, fallback) => tags.get(tag)?.[0] ?? fallback;
  const w = first(256), h = first(257), samples = first(277, 1), photo = first(262), orientation = first(274, 1), bits = tags.get(258) || [1]; checkDimensions(w, h);
  if (first(259, 1) !== 1 || first(284, 1) !== 1 || first(317, 1) !== 1 || tags.has(324) || ![1, 2, 3, 4].includes(orientation) || (tags.get(339) || [1]).some(n => n !== 1) || bits.length !== samples || bits.some(n => n !== 8) || !([0, 1].includes(photo) && samples === 1 || photo === 2 && [3, 4].includes(samples)) || samples === 4 && first(338) !== 2) throw error('TIFFは非圧縮8bitのグレー・RGB・RGBA（単一ページ）に対応しています。');
  const offsets = tags.get(273), lengths = tags.get(279), rows = first(278, h); if (!offsets || !lengths || !rows || offsets.length !== Math.ceil(h / rows) || lengths.length !== offsets.length) throw error();
  const f = image(w, h);
  for (let s = 0; s < offsets.length; s++) { const lines = Math.min(rows, h - s * rows), need = lines * w * samples; if (lengths[s] < need) throw error(); range(b, offsets[s], lengths[s]); for (let y = 0; y < lines; y++) for (let x = 0; x < w; x++) { const p = offsets[s] + (y * w + x) * samples, sx = [2, 3].includes(orientation) ? w - 1 - x : x, sy = [3, 4].includes(orientation) ? h - 1 - (s * rows + y) : s * rows + y, i = (sy * w + sx) * 4; const gray = photo === 0 ? 255 - b[p] : b[p]; f.data.set(samples === 1 ? [gray, gray, gray, 255] : [b[p], b[p + 1], b[p + 2], samples === 4 ? b[p + 3] : 255], i); } }
  return f;
}
function decodeIco(b) {
  range(b, 0, 6); const v = view(b), n = v.getUint16(4, true); if (!n || n > 256) throw error(); range(b, 6, n * 16);
  let best;
  for (let i = 0; i < n; i++) { const p = 6 + i * 16, w = b[p] || 256, h = b[p + 1] || 256, len = v.getUint32(p + 8, true), off = v.getUint32(p + 12, true); range(b, off, len); if (off < 6 + n * 16 || len < 24) throw error(); if (text(b, off + 1, 3) === 'PNG' && (!best || w * h > best.width * best.height)) { if (v.getUint32(off + 16) !== w || v.getUint32(off + 20) !== h) throw error(); best = { width: w, height: h, png: b.slice(off, off + len) }; } }
  if (!best) throw error('ICOの読み込みはPNG内包形式に対応しています。古いDIB形式は未対応です。'); return best;
}
export function decodeExtraImage(value, format) {
  const b = bytes(value); const fn = { bmp: decodeBmp, tga: decodeTga, qoi: decodeQoi, pnm: decodePnm, tiff: decodeTiff, ico: decodeIco }[format]; if (!fn) throw error(); return fn(b);
}
export function encodeExtraImage(f, format) {
  checkFrame(f); const { width: w, height: h } = f; let b, v;
  if (format === 'bmp') { const stride = Math.ceil(w * 3 / 4) * 4; b = new Uint8Array(54 + stride * h); v = view(b); b.set([66, 77]); v.setUint32(2, b.length, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, stride * h, true); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, p = 54 + (h - y - 1) * stride + x * 3; b.set([white(f, i, 2), white(f, i, 1), white(f, i, 0)], p); } }
  else if (format === 'tga') { b = new Uint8Array(18 + w * h * 4 + 26); v = view(b); b[2] = 2; v.setUint16(12, w, true); v.setUint16(14, h, true); b[16] = 32; b[17] = 40; for (let i = 0; i < f.data.length; i += 4) b.set([f.data[i + 2], f.data[i + 1], f.data[i], f.data[i + 3]], 18 + i); b.set(new TextEncoder().encode('TRUEVISION-XFILE.\0'), b.length - 18); }
  else if (format === 'qoi') { b = new Uint8Array(22 + w * h * 5); v = view(b); b.set([113, 111, 105, 102]); v.setUint32(4, w); v.setUint32(8, h); b[12] = 4; let p = 14; for (let i = 0; i < f.data.length; i += 4) { b[p++] = 255; b.set(f.data.subarray(i, i + 4), p); p += 4; } b[p + 7] = 1; b = b.slice(0, p + 8); }
  else if (['pbm', 'pgm', 'ppm'].includes(format)) { const header = new TextEncoder().encode(`P${{ pbm: 4, pgm: 5, ppm: 6 }[format]}\n${w} ${h}\n${format === 'pbm' ? '' : '255\n'}`); const stride = format === 'pbm' ? Math.ceil(w / 8) : w * (format === 'ppm' ? 3 : 1); b = new Uint8Array(header.length + stride * h); b.set(header); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, r = white(f, i, 0), g = white(f, i, 1), bl = white(f, i, 2), gray = Math.round(.299 * r + .587 * g + .114 * bl), p = header.length + y * stride; if (format === 'ppm') b.set([r, g, bl], p + x * 3); else if (format === 'pgm') b[p + x] = gray; else if (gray < 128) b[p + (x >> 3)] |= 128 >> (x & 7); } }
  else if (format === 'tiff') { const tags = [[256, 4, 1, w], [257, 4, 1, h], [258, 3, 4, 158], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, 166], [274, 3, 1, 1], [277, 3, 1, 4], [278, 4, 1, h], [279, 4, 1, w * h * 4], [284, 3, 1, 1], [338, 3, 1, 2]]; b = new Uint8Array(166 + w * h * 4); v = view(b); b.set([73, 73, 42, 0, 8, 0, 0, 0]); v.setUint16(8, tags.length, true); tags.forEach(([tag, type, n, value], i) => { const p = 10 + i * 12; v.setUint16(p, tag, true); v.setUint16(p + 2, type, true); v.setUint32(p + 4, n, true); v.setUint32(p + 8, value, true); }); for (let p = 158; p < 166; p += 2) v.setUint16(p, 8, true); b.set(f.data, 166); }
  else throw error();
  return new Blob([b], { type: IMAGE_TYPES[format] });
}
export function encodeIco(png, width, height) {
  const data = bytes(png); if (width < 1 || height < 1 || width > 256 || height > 256 || !Number.isInteger(width) || !Number.isInteger(height) || text(data, 1, 3) !== 'PNG') throw error();
  range(data, 0, 24); const pv = view(data); if (pv.getUint32(16) !== width || pv.getUint32(20) !== height) throw error();
  const b = new Uint8Array(22 + data.length), v = view(b); v.setUint16(2, 1, true); v.setUint16(4, 1, true); b[6] = width & 255; b[7] = height & 255; v.setUint16(10, 1, true); v.setUint16(12, 32, true); v.setUint32(14, data.length, true); v.setUint32(18, 22, true); b.set(data, 22); return new Blob([b], { type: IMAGE_TYPES.ico });
}
function audioBounds(rate, channels, frames) { if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || ![1, 2].includes(channels) || !Number.isSafeInteger(frames) || frames < 1 || frames / rate > LIMITS.seconds || frames * channels * 4 > LIMITS.bytes) throw error('音声は120秒以内・8〜48kHz・モノラル/ステレオに対応しています。'); }
function extendedRate(v, p) { const exp = v.getUint16(p), hi = v.getUint32(p + 2), lo = v.getUint32(p + 6); if (exp & 32768 || exp === 32767) throw error(); return (hi * 2 ** 32 + lo) * 2 ** ((exp & 32767) - 16383 - 63); }
export function decodeExtraAudio(value, format) {
  const b = bytes(value), v = view(b); let rate, channels, frames, bits, start, length;
  if (format === 'aiff') { range(b, 0, 12); if (text(b, 8, 4) !== 'AIFF') throw error('圧縮AIFF（AIFC）は未対応です。非圧縮PCMのAIFFを選んでください。'); const end = v.getUint32(4) + 8; if (end !== b.length) throw error(); let p = 12, comm = false, sound = false;
    while (p + 8 <= end) { const tag = text(b, p, 4), n = v.getUint32(p + 4); range(b, p + 8, n); if (tag === 'COMM') { if (comm || n < 18) throw error(); channels = v.getUint16(p + 8); frames = v.getUint32(p + 10); bits = v.getUint16(p + 14); rate = extendedRate(v, p + 16); comm = true; } if (tag === 'SSND') { if (sound || n < 8 || v.getUint32(p + 12) !== 0) throw error(); const offset = v.getUint32(p + 8); if (offset > n - 8) throw error(); start = p + 16 + offset; length = n - 8 - offset; sound = true; } p += 8 + n + (n & 1); } if (!comm || !sound || p !== end) throw error();
  } else if (format === 'au') { range(b, 0, 24); start = v.getUint32(4); length = v.getUint32(8); bits = ({ 2: 8, 3: 16, 4: 24, 5: 32 })[v.getUint32(12)]; rate = v.getUint32(16); channels = v.getUint32(20); if (start < 24 || !bits) throw error('AUは線形PCMの8/16/24/32bitに対応しています。'); if (length === 0xffffffff) length = b.length - start; frames = length / (channels * bits / 8); }
  else throw error();
  if (![8, 16, 24, 32].includes(bits)) throw error('PCMの8/16/24/32bit音声を選んでください。'); audioBounds(rate, channels, frames); const step = bits / 8, need = frames * channels * step; if (length < need) throw error(); range(b, start, length);
  const output = Array.from({ length: channels }, () => new Float32Array(frames)); let p = start;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { let sample = b[p++]; for (let j = 1; j < step; j++) sample = sample * 256 + b[p++]; if (sample >= 2 ** (bits - 1)) sample -= 2 ** bits; output[c][i] = sample / 2 ** (bits - 1); }
  return { sampleRate: rate, durationSeconds: frames / rate, channels: output };
}
export function encodeExtraAudio(source, format) {
  const { channels, sampleRate: rate } = source || {}, frames = channels?.[0]?.length; audioBounds(rate, channels?.length, frames);
  if (channels.some(c => !(c instanceof Float32Array) || c.length !== frames)) throw error();
  const length = frames * channels.length * 2, header = format === 'aiff' ? 54 : format === 'au' ? 24 : format === 'wav' ? 44 : 0; if (!header) throw error();
  const b = new Uint8Array(header + length), v = view(b), put = (p, s) => b.set(new TextEncoder().encode(s), p);
  if (format === 'aiff') { put(0, 'FORM'); v.setUint32(4, b.length - 8); put(8, 'AIFFCOMM'); v.setUint32(16, 18); v.setUint16(20, channels.length); v.setUint32(22, frames); v.setUint16(26, 16); const exponent = Math.floor(Math.log2(rate)), mantissa = BigInt(rate) << BigInt(63 - exponent); v.setUint16(28, 16383 + exponent); v.setBigUint64(30, mantissa); put(38, 'SSND'); v.setUint32(42, length + 8); }
  else if (format === 'au') { put(0, '.snd'); v.setUint32(4, 24); v.setUint32(8, length); v.setUint32(12, 3); v.setUint32(16, rate); v.setUint32(20, channels.length); }
  else { put(0, 'RIFF'); v.setUint32(4, b.length - 8, true); put(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels.length, true); v.setUint32(24, rate, true); v.setUint32(28, rate * channels.length * 2, true); v.setUint16(32, channels.length * 2, true); v.setUint16(34, 16, true); put(36, 'data'); v.setUint32(40, length, true); }
  let p = header; for (let i = 0; i < frames; i++) for (const c of channels) { if (!Number.isFinite(c[i])) throw error(); const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(p, Math.round(s < 0 ? s * 32768 : s * 32767), format === 'wav'); p += 2; }
  return new Blob([b], { type: { aiff: 'audio/aiff', au: 'audio/basic', wav: 'audio/wav' }[format] });
}
