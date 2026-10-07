import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_FRAME_RATIO, normalizeOutputSize, sharedFrameRatios, sharedOutputSizes } from '../../js/pixel-studio/framing.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('new camera framing uses shared-canvas bounds and excludes viewport-dependent saved dimensions', () => {
  assert.equal(DEFAULT_FRAME_RATIO, '1:1');
  assert.deepEqual(sharedOutputSizes(false), [16, 32, 64, 96, 128, 160, 256]);
  assert.deepEqual(sharedOutputSizes(true), [16, 32, 64, 96, 128, 160, 256]);
  assert.equal(sharedOutputSizes().includes(512), false);
  assert.equal(normalizeOutputSize(512), 256);
  assert.equal(sharedFrameRatios().some(({ value }) => value === 'screen'), false);
});

test('camera adopts only accepted captures into the shared PXD image and preserves opened legacy bytes', () => {
  const app = read('js/pixel-lens/app.mjs');
  assert.match(app, /prepareSharedCanvasImage\(/);
  assert.match(app, /if \(!sharedImageEdited \|\| !state\.result/);
  assert.match(app, /return putPxdSharedImage\(base, \{ width: frame\.width, height: frame\.height, rgba: new Uint8Array\(frame\.data\) \}\)/);
  assert.match(app, /sharedImageEdited = false;/);
  assert.match(app, /cameraPxd\.markDirty\(\)/);
  assert.match(app, /if \(!existingPolicy\.supported\)/);
  assert.match(app, /await cameraPxd\.startNewCaptureProject\(\)/);
  assert.match(app, /cameraPxd\.markDirty\(\);[\s\S]*?await cameraPxd\.save\(\)/);
});

test('camera capture UI no longer offers unrestricted-color looks and uses the unified project workspace', () => {
  const html = read('pixel-camera.html');
  const app = read('js/pixel-lens/app.mjs');
  assert.doesNotMatch(html, /data-look="(?:c256|full)"/);
  const loaded = html.match(/<script type="module" src="([^\"]*pixel-lens\/entry\.mjs\?rev=[^\"]+)"/);
  assert.ok(loaded, 'camera entry must have a versioned runtime');
  assert.ok(html.includes(`rel="modulepreload" href="${loaded[1]}"`), 'preload and runtime must use the same version');
  const entry = read('js/pixel-lens/entry.mjs');
  assert.match(entry, /params\.get\('to'\) === 'draw' \|\| params\.has\('drawRequest'\)/);
  assert.match(entry, /import\('\.\/draw-camera-page\.mjs\?rev=/);
  assert.match(entry, /else \{\s*await import\('\.\/app\.mjs\?rev=/);
  assert.match(app, /tool: 'camera', projectWorkspace: true/);
  assert.match(app, /if \(sharedProjectBound && sharedImageTarget\) return \{ width: sharedImageTarget\.width, height: sharedImageTarget\.height \}/);
});

test('supported camera canvases require no ad while audio captures retain the same shutter path', () => {
  const app = read('js/pixel-lens/app.mjs');
  assert.doesNotMatch(app, /requestPass|時間を追加して撮影|premium-required/);
  assert.match(app, /finishAudioCamera\(\{ \.\.\.state\.result, width: target\.width, height: target\.height, data: rgba, palette: paletteFromRgba\(rgba\) \}\)/);
});
