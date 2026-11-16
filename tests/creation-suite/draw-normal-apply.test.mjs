import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { addAnimationFrame, getAnimationCelDocument, NORMAL_MAP_PALETTE } from '../../js/creation/animation-core.mjs';
import { renderNormalMapLighting } from '../../js/creation/draw-normal-map.mjs';
import { prepareNormalMapApplication, quantizeNormalMapForAnimation, normalSourceRgba, createNormalLightingFrameCache } from '../../js/creation/draw-normal-apply.mjs';
import { updateNormalLightingPixels } from '../../js/creation/draw-animation-session.mjs';

const blank = () => ({ schemaVersion: 1, width: 16, height: 16, palette: ['#101010', '#ff7777'], pixels: Array(256).fill(-1) });
const rgba = (color, alpha = 255) => [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16), alpha];

test('quantization maps all fixed directions to serialized palette bytes and preserves transparent alpha', () => {
  const input = new Uint8ClampedArray(18 * 4);
  NORMAL_MAP_PALETTE.forEach((color, index) => input.set(rgba(color, index + 1), index * 4));
  input.set([240, 20, 80, 0], 17 * 4);
  const mapped = quantizeNormalMapForAnimation({ width: 18, height: 1, rgba: input, format: 'opengl' });
  assert.deepEqual([...mapped.pixels], [...Array.from({ length: 17 }, (_, index) => index + 1), 0]);
  NORMAL_MAP_PALETTE.forEach((color, index) => assert.deepEqual([...mapped.rgba.slice(index * 4, index * 4 + 4)], rgba(color, 255)));
  assert.deepEqual([...mapped.rgba.slice(17 * 4)], [0, 0, 0, 0]);
});

test('DirectX green is inverted before nearest fixed-direction quantization', () => {
  const input = new Uint8ClampedArray(NORMAL_MAP_PALETTE.length * 4);
  NORMAL_MAP_PALETTE.forEach((color, index) => {
    const pixel = rgba(color); pixel[1] = 255 - pixel[1]; input.set(pixel, index * 4);
  });
  const mapped = quantizeNormalMapForAnimation({ width: 17, height: 1, rgba: input, format: 'directx' });
  assert.deepEqual([...mapped.pixels], Array.from({ length: 17 }, (_, index) => index + 1));
  assert.equal(mapped.format, 'opengl');
});

test('application changes only the selected frame normal cel, keeps one role layer, and undo restores artwork and normal bytes', () => {
  const session = createDrawAnimationSession(blank());
  let art = session.document(); art.pixels[0] = 0; art.pixels[1] = 1; session.commitDocument(art);
  const firstFrame = session.frameId;
  const second = addAnimationFrame(session.animation, { sourceFrameId: firstFrame, copy: false });
  session.apply(second, { frameId: second.frames[1].id, layerId: session.layerId });
  const targetFrame = session.frameId, artBefore = session.animation;
  const artCelBefore = artBefore.frames.flatMap(frame => artBefore.layers.map(layer => ({ frameId: frame.id, layerId: layer.id, cel: getAnimationCelDocument(artBefore, frame.id, layer.id) })));
  const normal = new Uint8ClampedArray(16 * 16 * 4);
  normal.set([128, 128, 255, 255], 0); normal.set([255, 128, 128, 255], 4);
  const prepared = prepareNormalMapApplication(session.animation, targetFrame, { width: 16, height: 16, rgba: normal, format: 'opengl' });
  assert.equal(prepared.replacesExisting, false);
  session.apply(prepared.animation, { frameId: targetFrame, layerId: prepared.normalLayerId });
  assert.equal(session.animation.layers.filter(layer => layer.role === 'normal').length, 1);
  assert.deepEqual(getAnimationCelDocument(session.animation, targetFrame, prepared.normalLayerId).pixels.slice(0, 3), [0, 9, -1]);
  assert.deepEqual(getAnimationCelDocument(session.animation, firstFrame, prepared.normalLayerId).pixels.slice(0, 3), [-1, -1, -1]);
  for (const { frameId, layerId, cel } of artCelBefore) assert.deepEqual(getAnimationCelDocument(session.animation, frameId, layerId), cel);
  session.undo();
  assert.equal(session.animation.layers.some(layer => layer.role === 'normal'), false);
  for (const { frameId, layerId, cel } of artCelBefore) assert.deepEqual(getAnimationCelDocument(session.animation, frameId, layerId), cel);
});

test('existing painted normal is reported as replaced and invalid inputs leave animation untouched', () => {
  const session = createDrawAnimationSession(blank());
  const normal = new Uint8ClampedArray(16 * 16 * 4); normal.set([128, 128, 255, 255], 0);
  const first = prepareNormalMapApplication(session.animation, session.frameId, { width: 16, height: 16, rgba: normal, format: 'opengl' });
  const painted = new Uint8ClampedArray(16 * 16 * 4); painted.set([255, 128, 128, 255], 0);
  const second = prepareNormalMapApplication(first.animation, session.frameId, { width: 16, height: 16, rgba: painted, format: 'opengl' });
  assert.equal(second.replacesExisting, true);
  const original = session.animation;
  for (const invalid of [
    { width: 15, height: 16, rgba: normal, format: 'opengl' },
    { width: 16, height: 16, rgba: new Uint8ClampedArray(3), format: 'opengl' },
    { width: 16, height: 16, rgba: normal, format: 'unknown' },
  ]) assert.throws(() => prepareNormalMapApplication(original, session.frameId, invalid));
  assert.equal(session.animation, original);
});

test('incremental lighting matches full renderer and preserves translucent artwork alpha', () => {
  const source = { width: 3, height: 1, rgba: new Uint8ClampedArray([80, 40, 20, 255, 100, 120, 140, 0, 20, 30, 40, 128]) };
  const normal = { width: 3, height: 1, format: 'opengl', rgba: new Uint8ClampedArray([128, 255, 128, 255, 128, 128, 255, 0, 255, 128, 128, 255]) };
  const options = { azimuth: 270, elevation: 45, ambient: 0.1, intensity: 1.2, specular: 0.35, roughness: 0.4, shadeUnpainted: false };
  const target = new Uint8ClampedArray(source.rgba.length).fill(91);
  updateNormalLightingPixels(source, normal, options, target, [0]);
  assert.deepEqual([...target.slice(4)], Array(8).fill(91));
  updateNormalLightingPixels(source, normal, options, target, [1, 2]);
  assert.deepEqual(target, renderNormalMapLighting(source, normal, options).rgba);
  assert.equal(target[11], 128, 'normal lighting keeps the artwork alpha unchanged');
});


test('lighting cache accepts real indexed dirty composites and reads only changed indices', () => {
  const session = createDrawAnimationSession(blank());
  const artId = session.layerId;
  const normal = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) normal.set([128, 128, 255, 255], i * 4);
  const prepared = prepareNormalMapApplication(session.animation, session.frameId, {width:16,height:16,rgba:normal,format:'opengl'});
  session.apply(prepared.animation, {frameId:session.frameId,layerId:artId});
  const doc = session.document(); doc.pixels[0] = 1;
  const composite = session.composite(doc);
  assert.ok(composite.pixels instanceof Int16Array);
  const layer = session.animation.layers.find(item => item.role === 'normal');
  const cache = createNormalLightingFrameCache(), options = {ambient:0.25};
  const before = new Uint8ClampedArray(cache.render(session.animation, session.frameId, layer, composite, options).rgba);
  doc.pixels[0] = -1; doc.pixels[2] = 0;
  const changed = [0, 2], updated = session.composite(doc, changed); let reads = 0;
  updated.pixels = new Proxy(updated.pixels, {get(target,key){if (/^\d+$/.test(String(key))) reads++; return Reflect.get(target,key,target);}});
  const lit = cache.render(session.animation, session.frameId, layer, updated, options, changed);
  assert.equal(reads, 2, 'dirty source conversion does not scan the full canvas');
  assert.deepEqual([...lit.rgba.slice(0,4)], [0,0,0,0]);
  assert.deepEqual(lit.rgba.slice(4,8), before.slice(4,8));
  const source = {width:16,height:16,rgba:normalSourceRgba(updated)};
  const actualNormal = {width:16,height:16,format:'opengl',rgba:normalSourceRgba(getAnimationCelDocument(session.animation,session.frameId,layer.id))};
  assert.deepEqual(lit.rgba,renderNormalMapLighting(source,actualNormal,options).rgba);
});

test('RGBA-only lighting keeps source alpha and settings changes invalidate the cached result', () => {
  const session=createDrawAnimationSession(blank());
  const normal=new Uint8ClampedArray(256*4);normal.set([128,128,255,255]);
  const prepared=prepareNormalMapApplication(session.animation,session.frameId,{width:16,height:16,rgba:normal,format:'opengl'});
  const layer=prepared.animation.layers.find(item=>item.role==='normal');
  const source={width:16,height:16,rgba:new Uint8ClampedArray(256*4)};source.rgba.set([100,60,20,128]);
  assert.equal(normalSourceRgba(source),source.rgba);
  const cache=createNormalLightingFrameCache();
  const first=new Uint8ClampedArray(cache.render(prepared.animation,session.frameId,layer,source,{ambient:1}).rgba);
  const second=cache.render(prepared.animation,session.frameId,layer,source,{ambient:0,elevation:0},[]);
  assert.equal(second.rgba[3],128);assert.notDeepEqual(second.rgba,first);
  assert.deepEqual([...source.rgba.slice(0,4)],[100,60,20,128]);
  assert.throws(()=>normalSourceRgba({width:16,height:16,rgba:new Uint8ClampedArray(4)}));
});
