/** Local 16-bit FLAC export using verbatim subframes (RFC 9639).
 * This preserves the quantized PCM samples and sample count, not source metadata
 * or >16-bit precision. It does not promise file-size reduction.
 */
const vOf = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
function sample16(value) {
  if (!Number.isFinite(value)) throw new Error('音声に不正なサンプルが含まれています。');
  return Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, value)) * 32768)));
}
function validate(source) {
  const { sampleRate, channels } = source || {};
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000
      || !Array.isArray(channels) || ![1, 2].includes(channels.length)
      || channels.some(c => !(c instanceof Float32Array || c instanceof Float64Array))) {
    throw new Error('音声はモノラル/ステレオ・8〜48kHzのPCMを選んでください。');
  }
  const frames = channels[0].length;
  if (!frames || frames > sampleRate * 120 || channels.some(c => c.length !== frames)) {
    throw new Error('音声は120秒以内で、各チャンネルの長さが一致するものを選んでください。');
  }
  return { frames, sampleRate, count: channels.length };
}
function crc8(data) { let n = 0; for (const b of data) {
    n ^= b;
    for (let k = 0; k < 8; k++)
        n = ((n << 1) ^ (n & 128 ? 7 : 0)) & 255;
} return n; }
function crc16(data) { let n = 0; for (const b of data) {
    n ^= b << 8;
    for (let k = 0; k < 8; k++)
        n = ((n << 1) ^ (n & 32768 ? 0x8005 : 0)) & 65535;
} return n; }
function utf8Number(n) { if (n < 128)
    return [n]; if (n < 2048)
    return [192 | (n >> 6), 128 | (n & 63)]; return [224 | (n >> 12), 128 | ((n >> 6) & 63), 128 | (n & 63)]; }
export function encodeFlac(source) {
    const spec = validate(source);
    const { sampleRate, count, frames } = spec, block = 4096, parts = [], header = new Uint8Array(42), h = vOf(header);
    header.set([102, 76, 97, 67, 128, 0, 0, 34]);
    h.setUint16(8, Math.max(16, Math.min(block, frames)));
    h.setUint16(10, Math.max(16, Math.min(block, frames)));
    const info = (BigInt(sampleRate) << 44n) | (BigInt(count - 1) << 41n) | (15n << 36n) | BigInt(frames);
    h.setBigUint64(18, info);
    parts.push(header); // Unknown MD5 is represented by zero, as specified in RFC 9639.
    for (let start = 0, index = 0; start < frames; start += block, index++) {
        const n = Math.min(block, frames - start), prefix = Uint8Array.from([255, 248, 112, ((count - 1) << 4) | 8, ...utf8Number(index), (n - 1) >> 8, (n - 1) & 255]), data = new Uint8Array(prefix.length + 1 + count * (1 + n * 2) + 2), v = vOf(data);
        data.set(prefix);
        let p = prefix.length;
        data[p++] = crc8(prefix);
        for (let c = 0; c < count; c++) {
            data[p++] = 2;
            for (let i = 0; i < n; i++, p += 2)
                v.setInt16(p, sample16(source.channels[c][start + i]));
        }
        v.setUint16(p, crc16(data.subarray(0, p)));
        parts.push(data);
    }
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}
