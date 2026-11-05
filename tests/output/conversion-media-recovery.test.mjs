import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversionRecoverySnapshot, validateConversionRecovery } from '../../js/creation/conversion-media-recovery.mjs';
import { encodePcm, decodePcm } from '../../js/creation/conversion-pcm.mjs';

const frame = (id, delayMs, color) => ({ width: 1, height: 1, data: new Uint8ClampedArray([color, 0, 0, 255]), delayMs, frameId: id, assetId: 'asset-a' });
const settings = { format: 'gif', width: 1, height: 1, quality: 90, background: '#ffffff', threshold: 128, frame: 2, bits: '16', ratio: true, loop: 0, rate: 1.5 };

test('recovery snapshot preserves pixels, frame order, delays and selected frame without copying pixel arrays', () => {
  const first = frame('a:0', 80, 17), second = frame('a:1', 240, 201);
  const source = { kind: 'image', name: 'anim.gif', inputFormat: 'gif', totalPlays: 0,
    assets: [{ id: 'asset-a', name: 'anim.gif', bytes: 8, kind: 'image', rawFrames: [first, second] }], frames: [second, first] };
  const snapshot = createConversionRecoverySnapshot({ source, original: source, activeId: 'asset-a', assetSequence: 4, settings });
  validateConversionRecovery(snapshot, { formats: ['gif', 'png'] });
  assert.equal(snapshot.source.frames[0].frameId, 'a:1');
  assert.equal(snapshot.source.frames[0].delayMs, 240);
  assert.deepEqual([...snapshot.source.frames[1].data], [17, 0, 0, 255]);
  assert.equal(snapshot.source.frames[1].data, first.data);
  assert.equal(snapshot.settings.frame, 2);
});

test('recovery validation accepts audio sample buffers and editable PCM settings', () => {
  const audio = { sampleRate: 44100, channels: [new Float32Array([.1, -.2]), new Float32Array([.3, -.4])] };
  const source = { kind: 'audio', name: 'tone.wav', audio, assets: [{ id: 'audio-a', name: 'tone.wav', bytes: 16, kind: 'audio' }], frames: [] };
  const snapshot = createConversionRecoverySnapshot({ source, original: source, activeId: 'audio-a', settings: { ...settings, format: 'wav', frame: 1, bits: '24' } });
  assert.doesNotThrow(() => validateConversionRecovery(snapshot, { formats: ['wav', 'aiff'] }));
  assert.equal(snapshot.source.audio.channels[0], audio.channels[0]);
});

test('real AIFF/AU PCM32 Float64 decode snapshots validate and structured-clone without precision loss', async () => {
  const precise = 0.5 + 1 / 2 ** 31;
  for (const format of ['aiff', 'au']) {
    const sourceAudio = { sampleRate: 48000, channels: [new Float64Array([precise, -0.25, 0.125])] };
    const encoded = await encodePcm(sourceAudio, format, { bitDepth: 32 });
    const decoded = decodePcm(new Uint8Array(await encoded.arrayBuffer()));
    assert.ok(decoded.channels[0] instanceof Float64Array);
    assert.equal(decoded.channels[0][0], precise);
    const source = { kind: 'audio', name: `tone.${format}`, audio: decoded,
      assets: [{ id: 'audio-pcm', name: `tone.${format}`, bytes: encoded.size, kind: 'audio' }], frames: [] };
    const snapshot = createConversionRecoverySnapshot({ source, original: source, activeId: 'audio-pcm',
      settings: { ...settings, format, frame: 1, bits: '32' } });
    validateConversionRecovery(snapshot, { formats: [format] });
    const restored = structuredClone(snapshot);
    validateConversionRecovery(restored, { formats: [format] });
    assert.ok(restored.source.audio.channels[0] instanceof Float64Array);
    assert.deepEqual([...restored.source.audio.channels[0]], [...decoded.channels[0]]);

    const asset = { id: 'audio-pcm', name: `tone.${format}`, bytes: encoded.size, kind: 'audio', rawFrames: [] };
    const part = { id: 'audio-pcm', asset, assetIndex: 0, slots: [], base: { kind: 'audio', audio: decoded } };
    const undoSnapshot = createConversionRecoverySnapshot({ source: null, original: null,
      undoTicket: { current: part, original: part, activeIdBefore: 'audio-pcm' }, activeId: null,
      settings: { ...settings, format, frame: 1, bits: '32' } });
    validateConversionRecovery(undoSnapshot, { formats: [format] });
    const restoredUndo = structuredClone(undoSnapshot);
    validateConversionRecovery(restoredUndo, { formats: [format] });
    assert.ok(restoredUndo.undoTicket.current.base.audio.channels[0] instanceof Float64Array);
    assert.equal(restoredUndo.undoTicket.current.base.audio.channels[0][0], precise);
  }
});

test('audio recovery still rejects non-floating channels and mismatched channel lengths', () => {
  const valid = { sampleRate: 44100, channels: [new Float64Array([.1, -.2]), new Float32Array([.3, -.4])] };
  const source = { kind: 'audio', name: 'tone.au', audio: valid,
    assets: [{ id: 'audio-a', name: 'tone.au', bytes: 16, kind: 'audio' }], frames: [] };
  const snapshot = createConversionRecoverySnapshot({ source, original: source, activeId: 'audio-a',
    settings: { ...settings, format: 'au', frame: 1, bits: '32' } });
  assert.doesNotThrow(() => validateConversionRecovery(snapshot, { formats: ['au'] }));
  snapshot.source.audio.channels[0] = new Int16Array([1, 2]);
  assert.throws(() => validateConversionRecovery(snapshot, { formats: ['au'] }));
  snapshot.source.audio.channels = [new Float64Array([1, 2]), new Float32Array([3])];
  assert.throws(() => validateConversionRecovery(snapshot, { formats: ['au'] }));
});

test('invalid later frame or selected format rejects the whole snapshot without mutation', () => {
  const validSource = { kind: 'image', name: 'still.png', totalPlays: 1,
    assets: [{ id: 'asset-a', name: 'still.png', bytes: 4, kind: 'image', rawFrames: [frame('a:0', 100, 7)] }], frames: [frame('a:0', 100, 7)] };
  const snapshot = createConversionRecoverySnapshot({ source: validSource, original: validSource, activeId: 'asset-a', settings: { ...settings, format: 'png', frame: 1 } });
  const before = structuredClone(snapshot);
  snapshot.source.frames.push({ ...frame('a:1', 100, 9), data: new Uint8Array([1, 2]) });
  assert.throws(() => validateConversionRecovery(snapshot, { formats: ['png'] }));
  snapshot.source.frames.pop(); snapshot.settings.format = 'unavailable';
  assert.throws(() => validateConversionRecovery(snapshot, { formats: ['png'] }));
  snapshot.settings.format = 'png';
  assert.deepEqual(snapshot.source.frames, before.source.frames);
});

test('empty source recovery retains a validated undo ticket for the deleted final image', () => {
  const removed = frame('a:0', 100, 42);
  const asset = { id: 'asset-a', name: 'last.png', bytes: 4, kind: 'image', rawFrames: [removed] };
  const ticket = { current: { id: 'asset-a', asset, assetIndex: 0, slots: [{ frame: removed, index: 0, beforeId: null, afterId: null }], base: { kind: 'image', totalPlays: 1 } }, original: null, activeIdBefore: 'asset-a', selectedFrameIdBefore: 'a:0' };
  const snapshot = createConversionRecoverySnapshot({ source: null, original: null, undoTicket: ticket, assetSequence: 1, settings: { ...settings, format: 'png', frame: 1 } });
  assert.doesNotThrow(() => validateConversionRecovery(snapshot, { formats: ['png'] }));
});

test('native capture of an empty converter remains restorable for text-only work', async () => {
  const { readFileSync }=await import('node:fs'),vm=await import('node:vm');
  const code=readFileSync(new URL('../../js/creation/conversion-page.mjs',import.meta.url),'utf8');
  const start=code.indexOf('    captureRecovery() {'),end=code.indexOf('    validateRecovery(snapshot)',start);assert.ok(start>=0&&end>start);
  const values={'[data-width]':'','[data-height]':'','[data-quality]':'90','[data-background]':'#ffffff','[data-threshold]':'128','[data-frame]':'','[data-bits]':'16','[data-loop]':'1'};
  const context={source:null,original:null,activeId:null,undoTicket:null,assetSequence:0,format:{value:''},rate:1,shown:-1,animated:()=>false,$:selector=>({value:values[selector],checked:true}),createConversionRecoverySnapshot};
  vm.runInNewContext(`globalThis.api={${code.slice(start,end)}}`,context);const saved=context.api.captureRecovery();assert.equal(saved.settings.width,1);assert.equal(saved.settings.height,1);assert.doesNotThrow(()=>validateConversionRecovery(saved));
});


test('last audio deletion keeps its PCM undo data even without an image frame selection',()=>{
  const audio={sampleRate:8000,channels:[new Float32Array([.25,-.5])]},asset={id:'audio-a',name:'tone.wav',bytes:4,kind:'audio',rawFrames:[]};
  const part={id:'audio-a',asset,assetIndex:0,slots:[],base:{kind:'audio',audio}};
  const snapshot=createConversionRecoverySnapshot({source:null,original:null,undoTicket:{current:part,original:part,activeIdBefore:'audio-a',selectedFrameIdBefore:undefined},settings:{...settings,format:'wav',frame:1},activeId:null});
  assert.doesNotThrow(()=>validateConversionRecovery(snapshot,{formats:['wav']}));assert.equal(snapshot.undoTicket.current.base.audio.channels[0][1],-.5);
});
