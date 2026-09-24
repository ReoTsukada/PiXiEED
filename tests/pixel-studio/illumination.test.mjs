import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyIllumination } from '../../js/pixel-studio/illumination.mjs';

function surface(width, height, color, object = 1) {
  const rgb = new Uint8Array(width * height * 3);
  const objects = new Uint32Array(width * height).fill(object);
  for (let cell = 0; cell < width * height; cell++) rgb.set(color, cell * 3);
  return { rgb, objects, width, height };
}

function set(surfaceData, x, y, color) {
  surfaceData.rgb.set(color, (y * surfaceData.width + x) * 3);
}

function pixel(rgb, width, x, y) {
  const offset = (y * width + x) * 3;
  return [...rgb.subarray(offset, offset + 3)];
}

function light(color) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

test('suppresses a connected night-light halo while preserving the compact light core', () => {
  const input = surface(19, 19, [34, 29, 26], 2);
  // Give the lamp core a distinct owner from the surrounding illuminated wall.
  for (let y = 7; y <= 11; y++) for (let x = 7; x <= 11; x++) {
    const distance = Math.max(Math.abs(x - 9), Math.abs(y - 9));
    if (distance === 0) { set(input, x, y, [255, 250, 230]); input.objects[y * 19 + x] = 1; }
    else if (distance === 1) set(input, x, y, [91, 75, 59]);
    else if (distance === 2) set(input, x, y, [132, 108, 82]);
    else if (distance === 3) set(input, x, y, [164, 137, 107]);
  }
  const before = new Uint8Array(input.rgb);
  const result = simplifyIllumination(input);
  const coreCell = 9 * 19 + 9;
  assert.equal(result.lightCoreCells[coreCell], 1);
  assert.deepEqual(pixel(result.rgb, 19, 9, 9), [255, 250, 230]);
  assert.ok(result.haloCells.some(Boolean), 'the connected transition ring is identified');
  assert.ok(light(pixel(result.rgb, 19, 9, 11)) < light(pixel(before, 19, 9, 11)), 'a halo pixel moves toward ambient light');
  assert.deepEqual(input.rgb, before, 'source RGB remains untouched');
  const sourceColors = new Set();
  for (let i = 0; i < before.length; i += 3) sourceColors.add([...before.subarray(i, i + 3)].join(','));
  for (let i = 0; i < result.rgb.length; i += 3) assert.ok(sourceColors.has([...result.rgb.subarray(i, i + 3)].join(',')), 'output uses an existing sample');
});

test('leaves broad daylight whites and a hard-edged white object unchanged', () => {
  const daylight = surface(19, 19, [225, 228, 230]);
  const daylightResult = simplifyIllumination(daylight);
  assert.deepEqual(daylightResult.rgb, daylight.rgb);
  assert.equal(daylightResult.lightCoreCells.some(Boolean), false);
  assert.equal(daylightResult.haloCells.some(Boolean), false);

  const whiteObject = surface(19, 19, [48, 46, 43]);
  for (let y = 8; y <= 10; y++) for (let x = 8; x <= 10; x++) set(whiteObject, x, y, [250, 250, 248]);
  const objectResult = simplifyIllumination(whiteObject);
  assert.deepEqual(objectResult.rgb, whiteObject.rgb, 'an abrupt white shape without a halo is kept');
});

test('flattens only a broad gentle shadow using nearby real RGB samples', () => {
  const input = surface(21, 15, [130, 105, 80]);
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    set(input, x, y, [130 + x * 3, 105 + x * 2, 80 + x * 2]);
  }
  const source = new Uint8Array(input.rgb);
  const result = simplifyIllumination(input);
  const center = (7 * input.width + 9) * 3;
  assert.ok(result.flattenedShadowCells.some(Boolean));
  assert.ok(light(pixel(result.rgb, input.width, 9, 7)) > light(pixel(source, input.width, 9, 7)));
  assert.notDeepEqual([...result.rgb.subarray(center, center + 3)], [...source.subarray(center, center + 3)]);
  assert.deepEqual(input.rgb, source, 'source is immutable');
  const sourceColors = new Set();
  for (let i = 0; i < source.length; i += 3) sourceColors.add([...source.subarray(i, i + 3)].join(','));
  for (let i = 0; i < result.rgb.length; i += 3) assert.ok(sourceColors.has([...result.rgb.subarray(i, i + 3)].join(',')));
});

test('keeps uniform colors, dark hair, object edges, protected details, and line pixels', () => {
  const uniform = surface(13, 9, [180, 151, 125]);
  assert.deepEqual(simplifyIllumination(uniform).rgb, uniform.rgb);

  const hair = surface(15, 15, [33, 25, 19]);
  for (let x = 2; x < hair.width - 2; x++) for (let y = 5; y < hair.height - 2; y++) {
    set(hair, x, y, [35 + x * 2, 26 + x, 20 + x]);
  }
  assert.deepEqual(simplifyIllumination(hair).rgb, hair.rgb, 'dark hair stays below the conservative flattening range');

  const mixed = surface(21, 15, [130, 105, 80]);
  for (let y = 0; y < mixed.height; y++) for (let x = 0; x < mixed.width; x++) set(mixed, x, y, [130 + x * 3, 105 + x * 2, 80 + x * 2]);
  for (let y = 0; y < mixed.height; y++) for (let x = 0; x < 5; x++) mixed.objects[y * mixed.width + x] = 2;
  const protectedCells = new Uint8Array(mixed.width * mixed.height);
  protectedCells[7 * mixed.width + 12] = 1;
  // A short mouth/line stroke is protected even when the surrounding surface is eligible.
  const mouthColor = [45, 23, 20];
  for (let x = 8; x <= 12; x++) { set(mixed, x, 7, mouthColor); protectedCells[7 * mixed.width + x] = 1; }
  const mixedBefore = new Uint8Array(mixed.rgb);
  const result = simplifyIllumination({ ...mixed, protectedCells });
  assert.deepEqual(pixel(result.rgb, mixed.width, 4, 7), pixel(mixedBefore, mixed.width, 4, 7), 'other object is untouched');
  for (let x = 8; x <= 12; x++) assert.deepEqual(pixel(result.rgb, mixed.width, x, 7), mouthColor, `protected line x=${x} is untouched`);
});

test('is deterministic on rectangular small buffers and rejects invalid shapes or masks', () => {
  const input = surface(9, 13, [100, 78, 55]);
  const first = simplifyIllumination(input), second = simplifyIllumination(input);
  assert.deepEqual(first, second);
  assert.equal(first.rgb.length, 9 * 13 * 3);
  assert.equal(first.haloCells.length, 9 * 13);
  assert.equal(first.flattenedShadowCells.length, 9 * 13);
  assert.equal(first.lightCoreCells.length, 9 * 13);
  assert.throws(() => simplifyIllumination({ ...input, width: 513 }), RangeError);
  assert.throws(() => simplifyIllumination({ ...input, rgb: new Uint8Array(2) }), TypeError);
  const invalidProtection = new Uint8Array(input.width * input.height);
  invalidProtection[0] = 2;
  assert.throws(() => simplifyIllumination({ ...input, protectedCells: invalidProtection }), RangeError);
});

test('does not treat a locally dark edge in a bright photograph as a night light', () => {
  const input = surface(64, 48, [210, 200, 180]);
  for (let y = 3; y < 25; y++) for (let x = 3; x < 25; x++) {
    const d = Math.hypot(x - 14, y - 14);
    const lift = Math.round(105 * Math.exp(-d * d / 18));
    set(input, x, y, d <= 1 ? [255, 250, 240] : [20 + lift, 22 + lift, 24 + lift]);
  }
  const result = simplifyIllumination(input);
  assert.equal(result.haloCells.some(Boolean), false, 'daylight white details must not trigger halo subtraction');
  assert.deepEqual(pixel(result.rgb, 64, 14, 14), [255, 250, 240]);
});

test('flattens a full 512px background plane as well as smaller output grids', () => {
  const input = surface(512, 512, [218, 206, 181], 0);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const shade = Math.round(50 * Math.exp(-((x - 256) ** 2 + (y - 256) ** 2) / 1600));
    set(input, x, y, [218 - shade, 206 - shade, 181 - shade]);
  }
  const result = simplifyIllumination(input);
  const middle = pixel(result.rgb, 512, 256, 256);
  assert.ok(light(middle) >= light([218, 206, 181]) - 8, `wide background center: ${middle}`);
  assert.ok(result.flattenedShadowCells[256 * 512 + 256]);
});
