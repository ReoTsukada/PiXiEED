import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimationDocument, duplicateFrame, editCelPixel as editCropPixel, getPixelMemoryBytes as getCropBytes, writeCel } from './fixtures/animation-prototype.mjs';
import { addFrame, createTileAnimation, editPixel, getPayloadByteLength, renderFrame, resetCopiedBytes, TILE_SIZE, writeFrame } from './fixtures/animation-tile-prototype.mjs';

function palette32() { return Array.from({ length: 32 }, (_, index) => `#${(index + 1).toString(16).padStart(6, '0')}`); }

function variedBackground(size) {
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    // Vary every tile internally, then encode its 6-bit tile identity in six cells.
    const tileX = Math.floor(x / TILE_SIZE); const tileY = Math.floor(y / TILE_SIZE);
    const localX = x % TILE_SIZE; const localY = y % TILE_SIZE;
    const tileIndex = tileY * Math.ceil(size / TILE_SIZE) + tileX;
    let value = ((x * 7 + y * 11 + tileX * 3 + tileY * 5) % 32) + 1;
    if (localY === 0 && localX < 6) value = ((tileIndex >> localX) & 1) + 1;
    pixels[y * size + x] = value;
  }
  return pixels;
}

test('non-repeating 256px background: per-frame pixel edits copy one tile, less payload than crop COW', () => {
  const size = 256;
  const palette = palette32();
  const background = variedBackground(size);
  const tiled = createTileAnimation({ size, palette });
  writeFrame(tiled, 'frame-1', background);
  const tiledIds = [];
  for (let i = 0; i < 99; i += 1) tiledIds.push(addFrame(tiled));
  const initialPayload = getPayloadByteLength(tiled);
  assert.equal(initialPayload, size * size);

  for (let i = 0; i < tiledIds.length; i += 1) {
    const tileIndex = i % 64;
    const tileX = tileIndex % 8; const tileY = Math.floor(tileIndex / 8);
    const inner = (i * 31) % (TILE_SIZE * TILE_SIZE);
    const x = tileX * TILE_SIZE + inner % TILE_SIZE;
    const y = tileY * TILE_SIZE + Math.floor(inner / TILE_SIZE);
    const oldValue = background[y * size + x];
    resetCopiedBytes(tiled);
    editPixel(tiled, { frameId: tiledIds[i], x, y, value: oldValue === 32 ? 1 : oldValue + 1 });
    assert.ok(tiled.copiedBytes <= TILE_SIZE * TILE_SIZE, `edit ${i} copied ${tiled.copiedBytes} bytes`);
  }
  assert.deepEqual(renderFrame(tiled, 'frame-1'), background);
  const tiledPayload = getPayloadByteLength(tiled);
  assert.equal(tiledPayload, size * size + 99 * TILE_SIZE * TILE_SIZE);

  const crop = createAnimationDocument({ width: size, height: size, palette });
  writeCel(crop, { layerId: 'layer-1', frameId: 'frame-1', bytes: background });
  const cropIds = [];
  for (let i = 0; i < 99; i += 1) cropIds.push(duplicateFrame(crop, crop.frames[crop.frames.length - 1].id));
  for (let i = 0; i < cropIds.length; i += 1) {
    const tileIndex = i % 64;
    const tileX = tileIndex % 8; const tileY = Math.floor(tileIndex / 8);
    const inner = (i * 31) % (TILE_SIZE * TILE_SIZE);
    const x = tileX * TILE_SIZE + inner % TILE_SIZE;
    const y = tileY * TILE_SIZE + Math.floor(inner / TILE_SIZE);
    const oldValue = background[y * size + x];
    editCropPixel(crop, { layerId: 'layer-1', frameId: cropIds[i], x, y, value: oldValue === 32 ? 1 : oldValue + 1 });
  }
  assert.equal(getCropBytes(crop), 100 * size * size);
  assert.ok(tiledPayload < getCropBytes(crop), `tile payload ${tiledPayload} should be below crop payload ${getCropBytes(crop)}`);
});

test('empty frame costs no payload; transparency erases a tile and boundary pixels use adjacent tiles', () => {
  const state = createTileAnimation({ size: 64, palette: palette32() });
  const emptyFrame = addFrame(state, 'frame-1');
  assert.equal(getPayloadByteLength(state), 0);
  assert.deepEqual(renderFrame(state, emptyFrame), new Uint8Array(64 * 64));

  editPixel(state, { frameId: emptyFrame, x: 31, y: 0, value: 1 });
  editPixel(state, { frameId: emptyFrame, x: 32, y: 0, value: 2 });
  assert.equal(getPayloadByteLength(state), 2 * TILE_SIZE * TILE_SIZE);
  const result = renderFrame(state, emptyFrame);
  assert.equal(result[31], 1); assert.equal(result[32], 2);
  editPixel(state, { frameId: emptyFrame, x: 31, y: 0, value: 0 });
  assert.equal(result[31], 1); // rendered snapshots are independent output buffers
  assert.equal(renderFrame(state, emptyFrame)[31], 0);
  assert.equal(getPayloadByteLength(state), TILE_SIZE * TILE_SIZE);
});

test('partial 16px canvas stores only its actual tile dimensions', () => {
  const state = createTileAnimation({ size: 16, palette: palette32() });
  editPixel(state, { frameId: 'frame-1', x: 15, y: 15, value: 32 });
  assert.equal(getPayloadByteLength(state), 16 * 16);
  assert.equal(state.copiedBytes, 16 * 16);
  assert.equal(renderFrame(state, 'frame-1')[255], 32);
});

test('range and budget failures preserve the source frame and payload', () => {
  const state = createTileAnimation({ size: 32, palette: palette32(), maxPayloadBytes: 1024 });
  const pixels = variedBackground(32);
  writeFrame(state, 'frame-1', pixels);
  const child = addFrame(state);
  const before = renderFrame(state, child);
  const beforePayload = getPayloadByteLength(state);
  assert.throws(() => editPixel(state, { frameId: child, x: 32, y: 0, value: 2 }), /outside/);
  assert.throws(() => editPixel(state, { frameId: child, x: 0, y: 0, value: 33 }), /palette/);
  assert.throws(() => editPixel(state, { frameId: child, x: 0, y: 0, value: 2 }), /budget/);
  assert.deepEqual(renderFrame(state, child), before);
  assert.deepEqual(renderFrame(state, 'frame-1'), pixels);
  assert.equal(getPayloadByteLength(state), beforePayload);
});

test('writeFrame rolls pool, references, IDs, and copy-byte counter back when budget fails midway', () => {
  const state = createTileAnimation({ size: 64, palette: palette32(), maxPayloadBytes: 1024 });
  const frame = new Uint8Array(64 * 64);
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) frame[y * 64 + x] = ((x + y) % 32) + 1;
  for (let y = 0; y < 32; y += 1) for (let x = 32; x < 64; x += 1) frame[y * 64 + x] = ((x * 3 + y) % 32) + 1;
  assert.throws(() => writeFrame(state, 'frame-1', frame), /budget/);
  assert.equal(getPayloadByteLength(state), 0);
  assert.equal(state.frames[0].tiles.size, 0);
  assert.equal(state.nextTileId, 1);
  assert.equal(state.copiedBytes, 0);
});
