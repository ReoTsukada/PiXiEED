import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodeFlac } from '../../js/creation/conversion-flac.mjs';
import { conversionChoices, outputNotice, safeConvertedName, convertLocal } from '../../js/creation/conversion-service.mjs';

const source = (frames = 17, count = 1, sampleRate = 44100, Type = Float32Array) => ({
  sampleRate, channels: Array.from({ length: count }, (_, c) => Type.from({ length: frames }, (_, i) => ((i + c) % 17 - 8) / 8)),
});
const crc = (bytes, bits, poly) => {
  let value = 0;
  for (const byte of bytes) {
    value ^= byte << (bits - 8);
    for (let i = 0; i < 8; i++) value = ((value << 1) ^ ((value & (1 << (bits - 1))) ? poly : 0)) & ((1 << bits) - 1);
  }
  return value;
};
function verify(bytes, input) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'fLaC');
  assert.deepEqual([...bytes.subarray(4, 8)], [128, 0, 0, 34]);
  const info = view.getBigUint64(18);
  assert.equal(Number(info >> 44n), input.sampleRate);
  assert.equal(Number((info >> 41n) & 7n) + 1, input.channels.length);
  assert.equal(Number((info >> 36n) & 31n) + 1, 16);
  assert.equal(Number(info & ((1n << 36n) - 1n)), input.channels[0].length);
  assert.ok(view.getUint16(8) >= 16);
  assert.ok(view.getUint16(10) >= view.getUint16(8));
  let p = 42, samples = 0, expectedIndex = 0;
  while (p < bytes.length) {
    const start = p;
    assert.equal(view.getUint16(p), 0xfff8); p += 2;
    assert.equal(bytes[p++], 0x70);
    assert.equal(bytes[p++], ((input.channels.length - 1) << 4) | 8);
    const lead = bytes[p++]; let index = lead;
    if (lead >= 0xe0) { index = ((lead & 15) << 12) | ((bytes[p++] & 63) << 6) | (bytes[p++] & 63); }
    else if (lead >= 0xc0) { index = ((lead & 31) << 6) | (bytes[p++] & 63); }
    assert.equal(index, expectedIndex++);
    const count = view.getUint16(p) + 1; p += 2;
    assert.equal(bytes[p], crc(bytes.subarray(start, p), 8, 7)); p++;
    for (let c = 0; c < input.channels.length; c++) {
      assert.equal(bytes[p++], 2);
      for (let i = 0; i < count; i++, p += 2) {
        const value = input.channels[c][samples + i];
        const expected = Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, value)) * 32768)));
        assert.equal(view.getInt16(p), expected);
      }
    }
    assert.equal(view.getUint16(p), crc(bytes.subarray(start, p), 16, 0x8005)); p += 2;
    samples += count;
  }
  assert.equal(samples, input.channels[0].length);
  assert.equal(p, bytes.length);
}
for (const frames of [1, 15, 16, 4095, 4096, 4097, 9000]) {
  test(`FLAC framing, sample count, CRC and samples: ${frames}`, () => {
    const input = source(frames, 2); verify(encodeFlac(input), input);
  });
}
test('Float64 PCM is accepted and source arrays remain unchanged', () => {
  const input = source(100, 1, 8000, Float64Array), original = input.channels[0].slice();
  verify(encodeFlac(input), input); assert.deepEqual(input.channels[0], original);
});
test('frame indices greater than 127 and the final short frame decode exactly', () => {
  const input = source(4096 * 128 + 1); verify(encodeFlac(input), input);
});
test('invalid rates, lengths, channel types and non-finite samples are rejected', () => {
  for (const input of [null, source(0), source(2, 3), source(2, 1, 7999), source(2, 1, 48001),
    { sampleRate: 8000, channels: [[0]] }, { sampleRate: 8000, channels: [new Float32Array(1), new Float32Array(2)] },
    { sampleRate: 8000, channels: [Float32Array.of(NaN)] }, { sampleRate: 8000, channels: [Float64Array.of(Infinity)] },
    source(8000 * 120 + 1, 1, 8000)]) assert.throws(() => encodeFlac(input));
});
test('audio UI advertises bounded FLAC without changing image choices', () => {
  const audio = { kind: 'audio', audio: source() };
  const choices = conversionChoices(audio, { MediaRecorderImpl: null });
  assert.equal(choices.filter(c => c.value === 'flac').length, 1);
  assert.match(outputNotice(audio, 'flac'), /16bit固定/);
  assert.match(outputNotice(audio, 'flac'), /サイズの削減は保証しません/);
  assert.doesNotMatch(outputNotice(audio, 'flac'), /約120ms/);
  assert.ok(!conversionChoices({ kind: 'image', frames: [{}] }).some(c => c.value === 'flac'));
  assert.equal(safeConvertedName('sample.wav', 'flac'), 'sample.flac');
});
test('aborted conversions never start a worker', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(convertLocal({ kind: 'audio', audio: source() }, 'flac', {}, controller.signal), { name: 'AbortError' });
});
test('worker, UI and guide expose matching support and preserve original routes', async () => {
  const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  const [worker, page, guide, entry] = await Promise.all([
    read('js/creation/conversion-worker.mjs'), read('js/creation/conversion-page.mjs'),
    read('output/index.html'), read('js/creation/conversion-entry.mjs'),
  ]);
  assert.match(worker, /operation==='encode-flac'/);
  assert.match(worker, /type:'audio\/flac'/);
  assert.doesNotMatch(page, /MP3・FLACへの保存/);
  assert.doesNotMatch(guide, /MP3・FLAC出力は未対応/);
  assert.match(entry, /!query\.has\('id'\)/);
  assert.match(entry, /output-page\.mjs\?rev=20261024-common-tool-start-1/);
});
