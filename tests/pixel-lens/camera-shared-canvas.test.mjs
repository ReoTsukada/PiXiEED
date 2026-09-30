import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_FRAME_RATIO, sharedFrameRatios, sharedOutputSizes } from '../../js/pixel-studio/framing.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('new camera framing uses shared-canvas bounds and excludes viewport-dependent saved dimensions', () => {
  assert.equal(DEFAULT_FRAME_RATIO, '1:1');
  assert.deepEqual(sharedOutputSizes(false), [16, 32, 64, 96, 128]);
  assert.deepEqual(sharedOutputSizes(true), [16, 32, 64, 96, 128, 160, 256]);
  assert.equal(sharedFrameRatios().some(({ value }) => value === 'screen'), false);
});

test('camera adopts only accepted captures into the shared PXD image and preserves opened legacy bytes', () => {
  const app = read('js/pixel-lens/app.mjs');
  assert.match(app, /prepareSharedCanvasImage\(/);
  assert.match(app, /if \(!sharedImageEdited \|\| !state\.result/);
  assert.match(app, /return putPxdSharedImage\(base, \{ width: frame\.width, height: frame\.height, rgba: new Uint8Array\(frame\.data\) \}\)/);
  assert.match(app, /sharedImageEdited = false;/);
  assert.match(app, /cameraPxd\.markDirty\(\)/);
  assert.match(app, /if \(!existingPolicy\.supported \|\| existingPolicy\.locked\)/);
  assert.match(app, /await cameraPxd\.startNewCaptureProject\(\)/);
  assert.match(app, /cameraPxd\.markDirty\(\);[\s\S]*?await cameraPxd\.save\(\)/);
});

test('camera capture UI no longer offers unrestricted-color looks and uses the unified project workspace', () => {
  const html = read('pixel-camera.html');
  const app = read('js/pixel-lens/app.mjs');
  assert.doesNotMatch(html, /data-look="(?:c256|full)"/);
  const loaded = html.match(/<script type="module" src="([^\"]*pixel-lens\/app\.mjs\?rev=[^\"]+)"/);
  assert.ok(loaded, 'camera entry must have a versioned runtime');
  assert.ok(html.includes(`rel="modulepreload" href="${loaded[1]}"`), 'preload and runtime must use the same version');
  assert.match(app, /tool: 'camera', projectWorkspace: true/);
  assert.match(app, /if \(sharedProjectBound && sharedImageTarget\) return \{ width: sharedImageTarget\.width, height: sharedImageTarget\.height \}/);
});

test('a premium-locked canvas remains an actionable upgrade entry and audio captures pass the same shutter policy', () => {
  const app = read('js/pixel-lens/app.mjs');
  assert.match(app, /label = '時間を追加して撮影'/);
  assert.match(app, /requestPass\(\{ perk: 'project\.canvas-expanded' \}\)/);
  assert.match(app, /if \(policy\.reason === 'premium-required'\) \{ void requestCanvasExpansion\(\); return; \}/);
  assert.match(app, /finishAudioCamera\(\{ \.\.\.state\.result, width: target\.width, height: target\.height, data: rgba, palette: paletteFromRgba\(rgba\) \}\)/);
});
