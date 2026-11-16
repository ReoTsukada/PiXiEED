import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { convertPaintedNormalMap, createNormalMap, DEFAULT_NORMAL_MAP_SETTINGS, encodeNormalMapPng, normalizeNormalMapSettings, readNormalMapSettings, renderNormalMapLighting, writeNormalMapSettings } from '../../js/creation/draw-normal-map.mjs';
import { createPxdProject, decodePxd, encodePxd } from '../../js/creation/pxd-codec.mjs';

function image(width, height, pixel = [100, 120, 140, 255]) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) rgba.set(pixel, index * 4);
  return { width, height, rgba };
}

function setPixel(source, x, y, pixel) { source.rgba.set(pixel, (y * source.width + x) * 4); }
function rgb(result, x, y) { return [...result.rgba.slice((y * result.width + x) * 4, (y * result.width + x) * 4 + 3)]; }

test('flat luminance field encodes +Z and preserves the source alpha exactly', () => {
  const source = image(3, 2, [12, 80, 220, 255]); source.rgba[3] = 1; source.rgba[7] = 128; source.rgba[11] = 0;
  const before = source.rgba.slice(); const result = createNormalMap(source, { method: 'luminance' });
  assert.deepEqual(rgb(result, 1, 1), [128, 128, 255]);
  assert.deepEqual([...result.rgba].filter((_, index) => index % 4 === 3), [...source.rgba].filter((_, index) => index % 4 === 3));
  assert.deepEqual(source.rgba, before);
  assert.equal(result.width, source.width); assert.equal(result.height, source.height);
  assert.equal(result.heightValues.length, source.width * source.height);
});

test('luminance x ramp yields negative X normal and unit-length vector before quantization', () => {
  const source = image(3, 3, [0, 0, 0, 255]);
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) setPixel(source, x, y, [x * 127, x * 127, x * 127, 255]);
  const result = createNormalMap(source, { method: 'luminance', strength: 2 });
  const [red, green, blue] = rgb(result, 1, 1);
  assert.ok(red < 128); assert.equal(green, 128); assert.ok(blue > 128);
  const nx = red / 127.5 - 1; const ny = green / 127.5 - 1; const nz = blue / 127.5 - 1;
  assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 0.012);
});

test('y-down ramp maps positive height toward positive y-up green', () => {
  const source = image(3, 3, [0, 0, 0, 255]);
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) setPixel(source, x, y, [y * 127, y * 127, y * 127, 255]);
  const result = createNormalMap(source, { method: 'luminance', strength: 2 });
  const [red, green, blue] = rgb(result, 1, 1);
  assert.equal(red, 128); assert.ok(green > 128); assert.ok(blue > 128);
});

test('silhouette bevel is symmetric and its edge normals point outward', () => {
  const source = image(7, 7, [0, 0, 0, 0]);
  for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) setPixel(source, x, y, [255, 255, 255, 255]);
  const result = createNormalMap(source, { radius: 3, strength: 2 });
  const top = rgb(result, 3, 1); const bottom = rgb(result, 3, 5); const left = rgb(result, 1, 3); const right = rgb(result, 5, 3);
  assert.ok(top[1] > 128); assert.ok(bottom[1] < 128); assert.ok(left[0] < 128); assert.ok(right[0] > 128);
  assert.equal(Math.abs(top[1] - (255 - bottom[1])), 0);
  assert.equal(Math.abs(left[0] - (255 - right[0])), 0);
  assert.deepEqual(rgb(result, 0, 0), [128, 128, 255]); assert.equal(result.rgba[3], 0);
});

test('DirectX format flips only green and round trips through preview decoding', () => {
  const source = image(3, 3, [0, 0, 0, 255]);
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) setPixel(source, x, y, [y * 127, y * 127, y * 127, 255]);
  const gl = createNormalMap(source, { method: 'luminance', format: 'opengl' });
  const dx = createNormalMap(source, { method: 'luminance', format: 'directx' });
  for (let index = 0; index < gl.rgba.length; index += 4) {
    assert.equal(dx.rgba[index], gl.rgba[index]); assert.equal(dx.rgba[index + 1], 255 - gl.rgba[index + 1]);
    assert.equal(dx.rgba[index + 2], gl.rgba[index + 2]); assert.equal(dx.rgba[index + 3], gl.rgba[index + 3]);
  }
  const glRender = renderNormalMapLighting(source, gl, { azimuth: 270, elevation: 45, ambient: 0 });
  const dxRender = renderNormalMapLighting(source, dx, { azimuth: 270, elevation: 45, ambient: 0 });
  assert.deepEqual(dxRender.rgba, glRender.rgba);
});

test('top light brightens an up-facing normal; transparent source pixels stay transparent', () => {
  const source = image(2, 1, [200, 200, 200, 255]); source.rgba[7] = 0;
  const normal = { width: 2, height: 1, format: 'opengl', rgba: new Uint8ClampedArray([128, 255, 128, 255, 128, 128, 255, 0]) };
  const rendered = renderNormalMapLighting(source, normal, { azimuth: 270, elevation: 45, ambient: 0 });
  assert.ok(rendered.rgba[0] > 140);
  assert.equal(rendered.rgba[7], 0);
});

test('all-transparent output is neutral with exact alpha; all-opaque silhouette is flat', () => {
  const transparent = image(2, 2, [20, 30, 40, 0]);
  const empty = createNormalMap(transparent);
  for (let index = 0; index < 4; index += 1) assert.deepEqual(rgb(empty, index % 2, Math.floor(index / 2)), [128, 128, 255]);
  assert.deepEqual([...empty.rgba].filter((_, index) => index % 4 === 3), [0, 0, 0, 0]);
  const opaque = createNormalMap(image(4, 4));
  for (let index = 0; index < 16; index += 1) assert.deepEqual([...opaque.rgba.slice(index * 4, index * 4 + 3)], [128, 128, 255]);
});

test('input validation enforces side bounds and supported parameter ranges', () => {
  assert.throws(() => createNormalMap({ width: 1029, height: 1, rgba: new Uint8ClampedArray(1029 * 4) }), RangeError);
  assert.throws(() => createNormalMap({ width: 1.5, height: 1, rgba: new Uint8ClampedArray(4) }), RangeError);
  assert.throws(() => createNormalMap({ width: 1, height: 1, rgba: new Uint8ClampedArray(3) }), TypeError);
  assert.throws(() => createNormalMap(image(1, 1), { strength: 9 }), RangeError);
  assert.throws(() => createNormalMap(image(1, 1), { radius: 0 }), RangeError);
  assert.throws(() => createNormalMap(image(1, 1), { format: 'other' }), TypeError);
});

test('PNG IDAT inflates to byte-exact RGBA scanlines, including partial alpha', () => {
  const source = image(3, 2, [10, 20, 30, 1]);
  setPixel(source, 1, 0, [44, 55, 66, 128]); setPixel(source, 2, 0, [77, 88, 99, 255]);
  setPixel(source, 0, 1, [100, 110, 120, 0]); setPixel(source, 1, 1, [130, 140, 150, 128]); setPixel(source, 2, 1, [160, 170, 180, 255]);
  const bytes = encodeNormalMapPng(source);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes[24], 8); assert.equal(bytes[25], 6);
  let cursor = 8; let idat = [];
  while (cursor < bytes.length) {
    const length = (bytes[cursor] * 0x1000000) + (bytes[cursor + 1] << 16) + (bytes[cursor + 2] << 8) + bytes[cursor + 3];
    const type = String.fromCharCode(...bytes.subarray(cursor + 4, cursor + 8));
    if (type === 'IDAT') idat = [...idat, ...bytes.subarray(cursor + 8, cursor + 8 + length)];
    cursor += length + 12; if (type === 'IEND') break;
  }
  const raw = inflateSync(Uint8Array.from(idat));
  const decoded = new Uint8Array(source.rgba.length);
  for (let y = 0; y < source.height; y += 1) {
    assert.equal(raw[y * (source.width * 4 + 1)], 0);
    decoded.set(raw.subarray(y * (source.width * 4 + 1) + 1, (y + 1) * (source.width * 4 + 1)), y * source.width * 4);
  }
  assert.deepEqual([...decoded], [...source.rgba]);
});


test('painted normal export keeps directions and alpha without height conversion', () => {
  const source = image(2, 1);
  source.rgba.set([218, 128, 218, 255, 0, 0, 0, 0]);
  const original = new Uint8ClampedArray(source.rgba);
  const gl = convertPaintedNormalMap(source);
  const dx = convertPaintedNormalMap(source, { format: 'directx' });
  assert.deepEqual([...gl.rgba], [218, 128, 218, 255, 128, 128, 255, 0]);
  assert.deepEqual([...dx.rgba], [218, 127, 218, 255, 128, 128, 255, 0]);
  assert.deepEqual(source.rgba, original);
});


test('normal-map settings reset malformed values, clamp numbers, and return only detached known fields', () => {
  for (const value of [undefined, null, false, [], 'painted', 12]) assert.deepEqual(normalizeNormalMapSettings(value), DEFAULT_NORMAL_MAP_SETTINGS);
  const invalid = { method: 'other', strength: '4', radius: NaN, invertHeight: 1, format: 'other',
    azimuth: Infinity, elevation: NaN, ambient: null, intensity: '2', lightColor: '#fff',
    specular: Infinity, roughness: null, shadeUnpainted: 'false', initialFill: 'solid', overlayOpacity: NaN };
  assert.deepEqual(normalizeNormalMapSettings(invalid), DEFAULT_NORMAL_MAP_SETTINGS);
  const raw = { method: 'painted', strength: 99, radius: 2.6, invertHeight: true, format: 'directx',
    azimuth: -10, elevation: 100, ambient: -1, intensity: 5, lightColor: '#AABBCC',
    specular: 2, roughness: 0, shadeUnpainted: true, initialFill: 'flat', overlayOpacity: 2, unknown: { unsafe: true } };
  const snapshot = structuredClone(raw);
  const normalized = normalizeNormalMapSettings(raw);
  assert.deepEqual(normalized, { method: 'painted', strength: 8, radius: 3, invertHeight: true, format: 'directx',
    azimuth: 0, elevation: 90, ambient: 0, intensity: 2, lightColor: '#aabbcc',
    specular: 1, roughness: 0.05, shadeUnpainted: true, initialFill: 'flat', overlayOpacity: 1 });
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.deepEqual(raw, snapshot, 'normalizing preferences does not mutate the caller');
  assert.deepEqual(normalizeNormalMapSettings(Object.create(raw)), DEFAULT_NORMAL_MAP_SETTINGS, 'inherited preferences are ignored');
  assert.deepEqual(normalizeNormalMapSettings({ strength: -1, radius: 99, azimuth: 400, elevation: -1, ambient: 2,
    intensity: -1, specular: -1, roughness: 2, overlayOpacity: -1 }), {
    ...DEFAULT_NORMAL_MAP_SETTINGS, strength: 0, radius: 32, azimuth: 360, elevation: 0, ambient: 1,
    intensity: 0, specular: 0, roughness: 1, overlayOpacity: 0
  });
  normalized.lightColor = '#000000';
  assert.equal(DEFAULT_NORMAL_MAP_SETTINGS.lightColor, '#ffffff');
});

test('project normal settings round-trip through PXD without touching another project or unrelated data', async () => {
  const first = createPxdProject({ manifest: { futureField: { keep: true }, creationProject: {
    schemaVersion: 3, imageRole: 'main', musicOutput: { schemaVersion: 1, includeAudio: true },
    normalMap: { schemaVersion: 1, unknownSetting: 'discard' }
  } }, entries: [{ path: 'assets/unchanged.rgba', bytes: Uint8Array.of(12, 34, 56, 128) }] });
  const second = createPxdProject();
  const snapshot = structuredClone(first);
  const settings = { ...DEFAULT_NORMAL_MAP_SETTINGS, method: 'painted', azimuth: 135, intensity: 1.5,
    lightColor: '#aabbcc', specular: 0.8, roughness: 0.2, overlayOpacity: 0.4, initialFill: 'flat' };
  const saved = writeNormalMapSettings(first, settings);
  assert.deepEqual(readNormalMapSettings(saved), settings);
  assert.deepEqual(readNormalMapSettings(second), DEFAULT_NORMAL_MAP_SETTINGS, 'project B never inherits project A preferences');
  assert.deepEqual(first, snapshot, 'writing creates a new manifest without changing the source');
  assert.equal(saved.entries, first.entries, 'binary data is not copied or modified');
  assert.equal(saved.manifest.creationProject.schemaVersion, 3);
  assert.deepEqual(saved.manifest.futureField, { keep: true });
  assert.deepEqual(saved.manifest.creationProject.musicOutput, first.manifest.creationProject.musicOutput);
  assert.equal(saved.manifest.creationProject.normalMap.unknownSetting, undefined);
  assert.equal(saved.manifest.creationProject.normalMap.schemaVersion, 1);
  const decoded = await decodePxd(await encodePxd(saved));
  assert.deepEqual(readNormalMapSettings(decoded), settings);
  assert.deepEqual(decoded.entries[0].bytes, Uint8Array.of(12, 34, 56, 128));
  assert.deepEqual(readNormalMapSettings({ manifest: { creationProject: { normalMap: { ...settings, schemaVersion: 99 } } } }), DEFAULT_NORMAL_MAP_SETTINGS);
  assert.deepEqual(readNormalMapSettings(null), DEFAULT_NORMAL_MAP_SETTINGS);
});

test('unpainted normals preserve source bytes or shade a flat surface, while alpha and inputs stay intact', () => {
  const source = image(3, 1, [200, 100, 50, 128]);
  setPixel(source, 1, 0, [31, 63, 95, 0]); setPixel(source, 2, 0, [80, 120, 160, 64]);
  const normal = image(3, 1, [255, 0, 0, 0]);
  setPixel(normal, 2, 0, [128, 128, 255, 255]);
  const sourceBefore = source.rgba.slice(), normalBefore = normal.rgba.slice();
  const options = { azimuth: 90, elevation: 0, ambient: 0.25, shadeUnpainted: false };
  const excluded = renderNormalMapLighting(source, normal, options);
  assert.deepEqual([...excluded.rgba.slice(0, 8)], [...source.rgba.slice(0, 8)], 'unpainted RGBA is copied exactly, including hidden RGB');
  assert.deepEqual([...excluded.rgba.slice(8)], [20, 30, 40, 64], 'painted normals still receive lighting');
  const included = renderNormalMapLighting(source, normal, { ...options, shadeUnpainted: true });
  assert.deepEqual([...included.rgba.slice(0, 4)], [50, 25, 13, 128], 'transparent normal RGB is ignored and treated as +Z');
  assert.deepEqual([...included.rgba].filter((_, index) => index % 4 === 3), [128, 0, 64]);
  const dx = { ...normal, format: 'directx' };
  assert.deepEqual([...renderNormalMapLighting(source, dx, { ...options, shadeUnpainted: true }).rgba.slice(0, 4)], [50, 25, 13, 128]);
  assert.deepEqual(source.rgba, sourceBefore); assert.deepEqual(normal.rgba, normalBefore);
});

test('light color and intensity affect direct light while ambient stays a source-color floor', () => {
  const source = image(1, 1, [100, 120, 140, 192]);
  const normal = image(1, 1, [128, 128, 255, 255]);
  assert.deepEqual([...renderNormalMapLighting(source, normal, { elevation: 90, ambient: 0, lightColor: '#ff0000' }).rgba], [100, 0, 0, 192]);
  assert.deepEqual([...renderNormalMapLighting(source, normal, { elevation: 90, ambient: 0.5, intensity: 0, specular: 1 }).rgba], [50, 60, 70, 192]);
  assert.deepEqual([...renderNormalMapLighting(source, normal, { elevation: 90, ambient: 0.5, lightColor: '#000000', specular: 1 }).rgba], [50, 60, 70, 192]);
  const bright = renderNormalMapLighting(image(1, 1, [255, 255, 255, 1]), normal, { elevation: 90, ambient: 0, intensity: 2, specular: 1 });
  assert.deepEqual([...bright.rgba], [255, 255, 255, 1], 'lighting saturates color without changing partial alpha');
});

test('Blinn-Phong highlight follows the half-vector and widens with roughness', () => {
  const source = image(2, 1, [0, 0, 0, 255]);
  const normal = image(2, 1, [176, 128, 245, 255]);
  setPixel(normal, 1, 0, [79, 128, 245, 255]);
  const options = { azimuth: 0, elevation: 45, ambient: 0, specular: 0.5, roughness: 0.2 };
  const lit = renderNormalMapLighting(source, normal, options);
  assert.ok(lit.rgba[0] > 120, 'normal aimed at the light/view half-vector gets a highlight');
  assert.ok(lit.rgba[4] < 2, 'opposite-facing normal stays outside a narrow highlight');
  assert.deepEqual([...renderNormalMapLighting(source, normal, { ...options, specular: 0 }).rgba.slice(0, 3)], [0, 0, 0]);
  const flat = image(2, 1, [128, 128, 255, 255]);
  const smooth = renderNormalMapLighting(source, flat, { ...options, roughness: 0.1 });
  const rough = renderNormalMapLighting(source, flat, { ...options, roughness: 0.8 });
  assert.ok(rough.rgba[0] > smooth.rgba[0] + 100, 'roughness broadens the lobe away from its peak');
  const opposite = image(2, 1, [0, 128, 128, 255]);
  assert.deepEqual([...renderNormalMapLighting(source, opposite, options).rgba.slice(0, 3)], [0, 0, 0], 'a light behind the normal cannot produce a highlight');
});

test('extended lighting matches OpenGL and DirectX decoding and preserves legacy diffuse defaults', () => {
  const source = image(2, 1, [100, 120, 140, 128]);
  const painted = image(2, 1, [172, 218, 208, 255]);
  setPixel(painted, 1, 0, [128, 128, 255, 255]);
  const options = { azimuth: 300, elevation: 60, ambient: 0.15, intensity: 1.7,
    lightColor: '#c080ff', specular: 0.7, roughness: 0.3, shadeUnpainted: false };
  const gl = convertPaintedNormalMap(painted), dx = convertPaintedNormalMap(painted, { format: 'directx' });
  assert.deepEqual(renderNormalMapLighting(source, gl, options).rgba, renderNormalMapLighting(source, dx, options).rgba);
  const legacy = renderNormalMapLighting(image(1, 1, [100, 120, 140, 128]), image(1, 1, [128, 128, 255, 255]));
  assert.deepEqual([...legacy.rgba], [78, 94, 110, 128]);
});

test('lighting rejects invalid added parameters instead of producing corrupted pixels', () => {
  const source = image(1, 1), normal = image(1, 1, [128, 128, 255, 255]);
  for (const options of [
    { intensity: -1 }, { intensity: 2.1 }, { intensity: NaN }, { intensity: '1' },
    { specular: -1 }, { specular: 1.1 }, { specular: Infinity },
    { roughness: 0 }, { roughness: 1.1 }, { roughness: NaN },
    { lightColor: '#fff' }, { lightColor: '#12345678' }, { lightColor: 'red' },
    { shadeUnpainted: 1 }, { shadeUnpainted: null }
  ]) assert.throws(() => renderNormalMapLighting(source, normal, options));
});
