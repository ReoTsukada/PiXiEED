import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { runReadonlyPreview, readonlyPreviewBounds } from '../../js/creation/conversion-readonly-preview.mjs';
import { encodePcm } from '../../js/creation/conversion-pcm.mjs';

const page = readFileSync(new URL('../../js/creation/conversion-page.mjs', import.meta.url), 'utf8');
const from = page.indexOf('  const materials = {');
const to = page.indexOf('    getState() {', from);
const extractedApi = page.slice(from, to).replace('  const materials = {', 'globalThis.api = {') + '};';

function makeApi({ source, formatValue, fields = {}, availableFormats, convert, signal } = {}) {
  const values = { '[data-frame]': '1', '[data-width]': '16', '[data-height]': '12', '[data-loop]': '0',
    '[data-quality]': '84', '[data-background]': '#abcdef', '[data-threshold]': '128', '[data-bits]': '16', ...fields };
  const context = { source, format: { value: formatValue }, rate: 1.5, shown: 1, webp: true,
    animated: () => false, animationPlan: () => ({}), $: selector => ({ value: values[selector] }),
    conversionChoices: candidate => availableFormats.map(value => ({ value })),
    readonlyPreviewBounds, safeConvertedName: (name, format) => `${name}.${format}`,
    convertWithTimeline: convert, runReadonlyPreview, DOMException, Uint8Array, Float32Array,
    createObjectURL: () => { throw new Error('preview must not create native result URLs'); },
    persistOutput: () => { throw new Error('preview must not persist output'); },
    download: () => { throw new Error('preview must not download'); } };
  for (const key of ['resultUrl', 'resultName', 'currentBlob', 'unsaved', 'status', 'progress', 'historyState']) {
    Object.defineProperty(context, key, { configurable: true, get() { return `native-${key}`; }, set() { throw new Error(`preview mutated ${key}`); } });
  }
  vm.createContext(context);
  vm.runInContext(extractedApi, context);
  return context.api;
}

test('actual extracted API previews animated GIF/APNG through the converter before any save action', async () => {
  for (const format of ['gif', 'apng']) {
    const calls = [];
    const frames = [{ width: 16, height: 12, delayMs: 250, data: new Uint8Array(16 * 12 * 4) },
      { width: 16, height: 12, delayMs: 500, data: new Uint8Array(16 * 12 * 4) }];
    const api = makeApi({ source: { kind: 'image', name: 'loop', frames, totalPlays: 2 }, formatValue: format,
      availableFormats: ['gif', 'apng'], convert: async (...args) => { calls.push(args); return new Blob([format]); } });
    const cap = api.previewCapability();
    assert.deepEqual({ supported: cap.supported, automatic: cap.automatic }, { supported: true, automatic: false });
    const result = await api.previewOutput();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], format);
    assert.equal(calls[0][2].frameIndex, 0);
    assert.deepEqual([...calls[0][0].frames].map(frame => frame.delayMs), [250, 500]);
    assert.deepEqual(result, { blob: result.blob, filename: `loop.${format}`, format });
    assert.equal(result.blob.size, format.length);
    assert.equal(api.previewCapability().supported, true);
  }
});

test('actual extracted API preview availability follows the full native image choice list', async () => {
  const still = { kind: 'image', name: 'still', frames: [{ width: 32, height: 24, delayMs: 100, data: new Uint8Array(32 * 24 * 4) }] };
  for (const format of ['png', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'tiff', 'tga', 'qoi', 'ico', 'ppm', 'pgm', 'pbm', 'pam']) {
    let encodedFormat = '';
    const api = makeApi({ source: still, formatValue: format, availableFormats: [format],
      convert: async (_source, selected) => { encodedFormat = selected; return new Blob([selected]); } });
    assert.equal(api.previewCapability().supported, true, `${format} should be previewable when native choices exposes it`);
    const output = await api.previewOutput();
    assert.equal(encodedFormat, format);
    assert.equal(output.format, format);
    assert.equal(output.blob.size, format.length);
  }
});

test('actual extracted API previews WAV from captured audio without changing input channels or output state', async () => {
  const channels = [new Float32Array([0.1, -0.2, 0.4])];
  const source = { kind: 'audio', name: 'tone', audio: { sampleRate: 48000, channels } };
  const before = [...channels[0]];
  let captured;
  const api = makeApi({ source, formatValue: 'wav', availableFormats: ['wav'], convert: async (...args) => {
    captured = args;
    args[0].audio.channels[0][0] = 0.9;
    return new Blob(['pcm']);
  } });
  assert.deepEqual({ supported: api.previewCapability().supported, automatic: api.previewCapability().automatic }, { supported: true, automatic: false });
  const result = await api.previewOutput();
  assert.equal(result.filename, 'tone.wav');
  assert.equal(result.format, 'wav');
  assert.equal(result.blob.size, 3);
  assert.deepEqual([...channels[0]], before, 'encoder receives a copy of the source channels');
  assert.equal(captured[2].bitDepth, 16);
  assert.equal(captured[2].width, 1);
  assert.equal(captured[2].height, 1);
});

test('actual extracted API preserves Float64 PCM precision and produces native-save-identical WAV bytes', async () => {
  const precise = 0.5 + 1 / 2 ** 31;
  const channel = new Float64Array([precise, -precise, 0]);
  const source = { kind: 'audio', name: 'precise', audio: { sampleRate: 48000, channels: [channel] } };
  const sourceBefore = channel.slice();
  let capturedChannel;
  const api = makeApi({ source, formatValue: 'wav', availableFormats: ['wav'], fields: { '[data-bits]': '32' },
    convert: async (captured, format, options) => {
      capturedChannel = captured.audio.channels[0];
      return new Blob([encodePcm(captured.audio, format, { bitDepth: options.bitDepth })]);
    } });
  const preview = await api.previewOutput();
  const nativeBlob = await encodePcm(source.audio, 'wav', { bitDepth: 32 });
  assert.ok(capturedChannel instanceof Float64Array);
  assert.notEqual(capturedChannel, channel);
  assert.deepEqual([...capturedChannel], [...sourceBefore]);
  assert.deepEqual([...new Uint8Array(await preview.blob.arrayBuffer())], [...new Uint8Array(await nativeBlob.arrayBuffer())]);
  assert.deepEqual([...channel], [...sourceBefore]);
});

test('actual extracted API previews every supplied native audio format before save', async () => {
  const audio = { kind: 'audio', name: 'track', audio: { sampleRate: 44100, channels: [new Float32Array([0.2, -0.2])] } };
  for (const format of ['wav', 'aiff', 'au', 'm4a', 'webm', 'ogg']) {
    let encodedFormat = '';
    const api = makeApi({ source: audio, formatValue: format, availableFormats: [format],
      convert: async (_source, selected) => { encodedFormat = selected; return new Blob([selected]); } });
    assert.equal(api.previewCapability().supported, true, `${format} should be previewable when native choices exposes it`);
    const output = await api.previewOutput();
    assert.equal(encodedFormat, format);
    assert.equal(output.format, format);
    assert.equal(output.filename, `track.${format}`);
  }
});

test('actual API rejects unsupported native formats and preserves pre- and mid-encode aborts', async () => {
  let encoded = 0;
  const image = { kind: 'image', name: 'one', frames: [{ width: 8, height: 8, data: new Uint8Array(256) }] };
  const unsupported = makeApi({ source: image, formatValue: 'webp', availableFormats: ['png'], convert: async () => { encoded++; return new Blob(['x']); } });
  assert.equal(unsupported.previewCapability().supported, false);
  await assert.rejects(unsupported.previewOutput(), /cannot|この素材|形式/);
  assert.equal(encoded, 0);

  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  const api = makeApi({ source: image, formatValue: 'png', availableFormats: ['png'], signal: alreadyAborted.signal,
    convert: async () => { encoded++; return new Blob(['x']); } });
  await assert.rejects(api.previewOutput({ signal: alreadyAborted.signal }), { name: 'AbortError' });
  assert.equal(encoded, 0);

  const controller = new AbortController();
  const during = makeApi({ source: image, formatValue: 'png', availableFormats: ['png'], convert: async () => {
    encoded++; controller.abort(); return new Blob(['x']);
  } });
  await assert.rejects(during.previewOutput({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(encoded, 1);
});

test('actual API allows 7M-pixel manual previews and rejects native edge or pixel-limit violations', async () => {
  const large = { kind: 'image', name: 'large', frames: [{ width: 3500, height: 2000, data: new Uint8Array(1) }] };
  const api = makeApi({ source: large, formatValue: 'png', availableFormats: ['png'],
    fields: { '[data-width]': '3500', '[data-height]': '2000' }, convert: async () => new Blob(['large']) });
  assert.equal(api.previewCapability().supported, true);
  assert.equal(api.previewCapability().automatic, false);

  const tooLarge = makeApi({ source: large, formatValue: 'png', availableFormats: ['png'],
    fields: { '[data-width]': '4096', '[data-height]': '2000' }, convert: async () => new Blob(['bad']) });
  assert.equal(tooLarge.previewCapability().supported, false, 'output over native eight-million-pixel cap is unavailable');
  const badEdge = makeApi({ source: { kind: 'image', name: 'edge', frames: [{ width: 5000, height: 1000, data: new Uint8Array(1) }] },
    formatValue: 'png', availableFormats: ['png'], fields: { '[data-width]': '1000', '[data-height]': '200' }, convert: async () => new Blob(['bad']) });
  assert.equal(badEdge.previewCapability().supported, false, 'source over native edge limit is unavailable');
});

test('video-poster image output follows the native image export path but explicitly labels the partial source',async()=>{
 const api=makeApi({source:{kind:'image',video:{poster:true},name:'clip.webm',frames:[{width:8,height:8,data:new Uint8Array(256)}]},formatValue:'png',availableFormats:['png'],convert:async()=>new Blob(['encoded PNG'])});
 const cap=api.previewCapability();assert.equal(cap.supported,true);assert.equal(cap.automatic,false);assert.match(cap.notice,/1コマ/);assert.match(cap.notice,/動画全体.*ではありません/);
 const result=await api.previewOutput();assert.equal(result.format,'png');assert.equal(result.blob.size,11);
});
