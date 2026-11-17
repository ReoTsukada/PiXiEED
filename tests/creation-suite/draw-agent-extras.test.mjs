import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnimationLayer, composeAnimationFrameRgba, createAnimation, ensureAnimationMusicLayer,
  ensureAnimationNormalLayer, getAnimationCelDocument, NORMAL_MAP_PALETTE, writeAnimationCel
} from '../../js/creation/animation-core.mjs';
import { prepareDrawAgentExtraOperation } from '../../js/creation/draw-agent-extras.mjs';
import { setLayerProperties } from '../../js/creation/animation-core.mjs';

function createCanvasDocumentRef() {
  return {
    createElement() {
      let width = 0, height = 0, font = '';
      const rgba = () => new Uint8ClampedArray(width * height * 4);
      let image = rgba();
      const context = {
        clearRect() { image = rgba(); },
        fillText(text, x, y) {
          // Deterministic stand-in for browser glyphs: each character paints a 2x2 block.
          for (let offset = 0; offset < text.length; offset += 1) {
            const left = Math.floor(x) + offset * 3, top = Math.floor(y);
            for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
              const px = left + dx, py = top + dy;
              if (px >= 0 && px < width && py >= 0 && py < height) image[(py * width + px) * 4 + 3] = 255;
            }
          }
        },
        getImageData() { return { data: image }; },
        set font(value) { font = value; }, get font() { return font; },
        textBaseline: '', textAlign: '', fillStyle: ''
      };
      return { set width(value) { width = value; image = rgba(); }, get width() { return width; }, set height(value) { height = value; image = rgba(); }, get height() { return height; }, getContext() { return context; } };
    }
  };
}

function fixture() {
  let animation = createAnimation({ width: 4, height: 3, palette: ['#ff0000', '#00ff00'] });
  const frameId = animation.frames[0].id, artLayer = animation.layers[0];
  animation = writeAnimationCel(animation, frameId, artLayer.id, { width: 4, height: 3, pixels: [1, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0] });
  const active = { frameId, layerId: artLayer.id, documentRef: createCanvasDocumentRef() };
  return { animation, active, frameId, artLayerId: artLayer.id };
}

test('unknown extras are left for the other planner', async () => {
  assert.equal(await prepareDrawAgentExtraOperation(null, null, { type: 'pixel.set' }), null);
});

test('normal.generate uses only art composite and preserves artwork and palette', async () => {
  const { animation: source, active, frameId, artLayerId } = fixture();
  let animation = ensureAnimationMusicLayer(source);
  const musicLayer = animation.layers.find(layer => layer.role === 'music');
  animation = writeAnimationCel(animation, frameId, musicLayer.id, { width: 4, height: 3, pixels: new Uint8Array(12).fill(1) });
  const withNormal = ensureAnimationNormalLayer(animation);
  const normalId = withNormal.layers.find(layer => layer.role === 'normal').id;
  const existing = writeAnimationCel(withNormal, frameId, normalId, { width: 4, height: 3, pixels: new Uint8Array(12).fill(1) });
  const beforeArt = getAnimationCelDocument(existing, frameId, artLayerId);
  const beforeMusic = getAnimationCelDocument(existing, frameId, musicLayer.id);
  const expectedSource = composeAnimationFrameRgba(existing, frameId, { excludeMusic: true });
  const result = await prepareDrawAgentExtraOperation(existing, active, { type: 'normal.generate', frameId: '$active', method: 'silhouette', strength: 2, radius: 2 });
  assert.equal(result.result.changed, true);
  assert.equal(result.result.replacesExisting, true);
  assert.deepEqual(result.animation.palette, existing.palette);
  assert.deepEqual(getAnimationCelDocument(result.animation, frameId, artLayerId), beforeArt);
  assert.deepEqual(getAnimationCelDocument(result.animation, frameId, musicLayer.id), beforeMusic);
  const generated = getAnimationCelDocument(result.animation, frameId, normalId);
  assert.ok(generated.pixels.some(value => value !== -1));
  assert.deepEqual(generated.palette, NORMAL_MAP_PALETTE);
  assert.equal(result.animation.layers.find(layer => layer.id === normalId).locked, false);
  assert.deepEqual(expectedSource, composeAnimationFrameRgba(existing, frameId, { excludeMusic: true }));
  const repeated = await prepareDrawAgentExtraOperation(result.animation, active, {
    type: 'normal.generate', frameId: '$active', method: 'silhouette', strength: 2, radius: 2
  });
  assert.equal(repeated.animation, result.animation);
  assert.equal(repeated.result.changed, false);
  assert.deepEqual(getAnimationCelDocument(repeated.animation, frameId, normalId), generated);
});

test('normal.generate refuses a locked normal layer without changing the source', async () => {
  const { animation, active, frameId } = fixture();
  let state = ensureAnimationNormalLayer(animation);
  const normal = state.layers.find(layer => layer.role === 'normal');
  state = setLayerProperties(state, normal.id, { locked: true });
  await assert.rejects(() => prepareDrawAgentExtraOperation(state, active, { type: 'normal.generate', frameId }), /ロック/);
  await assert.rejects(() => prepareDrawAgentExtraOperation(animation, active, { type: 'normal.generate', frameId, strength: null }), /strength/);
  assert.equal(getAnimationCelDocument(state, frameId, normal.id).pixels.every(value => value === -1), true);
});

test('text.draw adds exact mask pixels using palette index, preserving other colors and cels', async () => {
  const { animation, active, frameId, artLayerId } = fixture();
  const secondLayer = addAnimationLayer(animation, { name: 'upper' });
  const secondId = secondLayer.layers.at(-1).id;
  const text = await prepareDrawAgentExtraOperation(secondLayer, active, {
    type: 'text.draw', frameId: '$active', layerId: '$active', text: 'A', x: 1, y: 1, colorIndex: 1, font: 'mono', fontSize: 5
  });
  const cel = getAnimationCelDocument(text.animation, frameId, artLayerId);
  assert.deepEqual(Array.from(cel.pixels), [0, -1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1]);
  assert.deepEqual(getAnimationCelDocument(text.animation, frameId, secondId).pixels, getAnimationCelDocument(secondLayer, frameId, secondId).pixels);
});

test('text.draw rejects locked, normal, music, invalid font, oversized text, and extra fields', async () => {
  const { animation, active, frameId, artLayerId } = fixture();
  const locked = setLayerProperties(animation, artLayerId, { locked: true });
  const args = { type: 'text.draw', frameId, layerId: artLayerId, text: 'x', x: 0, y: 0, colorIndex: 0 };
  await assert.rejects(() => prepareDrawAgentExtraOperation(locked, active, args), /ロック/);
  const normal = ensureAnimationNormalLayer(animation);
  await assert.rejects(() => prepareDrawAgentExtraOperation(normal, active, { ...args, layerId: normal.layers.find(layer => layer.role === 'normal').id }), /通常の描画/);
  const music = ensureAnimationMusicLayer(animation);
  await assert.rejects(() => prepareDrawAgentExtraOperation(music, active, { ...args, layerId: music.layers.find(layer => layer.role === 'music').id }), /通常の描画/);
  await assert.rejects(() => prepareDrawAgentExtraOperation(animation, active, { ...args, font: 'remote-font' }), /フォント/);
  await assert.rejects(() => prepareDrawAgentExtraOperation(animation, active, { ...args, text: 'x'.repeat(257) }), /256/);
  await assert.rejects(() => prepareDrawAgentExtraOperation(animation, active, { ...args, unexpected: true }), /項目/);
  await assert.rejects(() => prepareDrawAgentExtraOperation(animation, active, { ...args, font: null }), /フォント/);
  await assert.rejects(() => prepareDrawAgentExtraOperation(animation, active, { ...args, fontSize: 1.5 }), /大きさ/);
});
