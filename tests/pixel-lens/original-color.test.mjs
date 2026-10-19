import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lensFrameFilter, lensPalette, processLensFrame, resetLensPalette, setLensSettings } from '../../js/pixel-lens/engine.mjs';
import { createPixelLensOutputOptions, preparePixelLensOutputRestore } from '../../js/pixel-lens/output-handoff.mjs';

const sourceRoot = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, sourceRoot), 'utf8');

function fixture(width = 17, height = 13) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    data.set([(x * 29 + y * 7) % 256, (y * 31 + x * 3) % 256, (x * 11 + y * 19) % 256, (x + y) % 5 === 0 ? 128 : 255], offset);
  }
  return { width, height, data };
}

function render(depth, gradientMode, input = fixture()) {
  setLensSettings({ colorDepth: depth, paletteMode: 'source', gradientMode, ditherPattern: 'net8', surfaceSimplify: 55,
    cameraSettings: { brightness: 8, contrast: 6, saturation: -7, shadows: 3, whiteBalance: 4 } });
  resetLensPalette();
  const frame = { ...input, data: new Uint8ClampedArray(input.data) };
  processLensFrame(frame);
  return frame;
}

test('full colour preserves aggregated RGBA exactly and bypasses every frame filter', () => {
  const original = fixture();
  const noDither = render('full', 'none', original);
  const dither = render('full', 'dither', original);
  assert.deepEqual(noDither.data, original.data);
  assert.deepEqual(dither.data, original.data);
  assert.deepEqual(dither.data, noDither.data);
  assert.equal(lensFrameFilter(), 'none');
  assert.deepEqual(lensPalette(), []);
});

test('existing 8, 16, 32, and 64 colour outputs stay byte-identical', () => {
  const expected = {
    '8:none': '22ca9738ad0b7d1e244c1fd230fde2f62138fd19161dab026acb61ed814588a0',
    '8:dither': '18cbc7d08bea968b1fc6780eccabd915d58755399f56e4fcf8aac386cfa2f142',
    '16:none': '74fee8e46bf3048d9e96fbcab4c1e63d1779c0e237005df5099aca64fdb8b0b7',
    '16:dither': 'd52fa551250cefd3508e9d5f97d146553128b2ac573431894f75fa76f1d5d3ab',
    '32:none': 'c6618fc21f15a80cc75d0e82bdf4c1c5c428d7648da60c21ef504646fb0f9ac7',
    '32:dither': '95e7c1c7514f6425b3a04934e8e4bfdb4331c4807c86cb90bc58c06a4f3ae52a',
    '64:none': '7361d5f1327b14154fb05987b7e7032ef11968289eabb6b68aff6fc833f06aed',
    '64:dither': '606e8e43f0e23b39528650f25021666ece4598bd740377d39bc2f3adef476190'
  };
  for (const depth of ['8', '16', '32', '64']) for (const gradientMode of ['none', 'dither']) {
    const frame = render(depth, gradientMode);
    const hash = createHash('sha256').update(frame.data).digest('hex');
    assert.equal(hash, expected[`${depth}:${gradientMode}`], `${depth} colours with ${gradientMode}`);
  }
});

test('the ordinary camera exposes the selectable full-colour look and disables corrections while selected', () => {
  const app = read('js/pixel-lens/app.mjs');
  assert.match(app, /full: \{ colorDepth: 'full', paletteMode: 'source', gradientMode: 'none', surfaceSimplify: 0 \}/);
  assert.match(app, /\['full', '元の色'\]/);
  assert.match(app, /if \(state\.colorDepth === 'full'\) return 'full'/);
  assert.match(app, /元の色では色味補正・ジオラマを使いません/);
  assert.match(app, /if \(state\.colorDepth === 'full'\) \{ state\.gradientMode = 'none'; state\.surfaceSimplify = 0; state\.miniature = false; \}/);
});

test('standalone full-colour capture stays raw and cannot forward an empty or prior project', () => {
  const app = read('js/pixel-lens/app.mjs');
  assert.match(app, /if \(integratedShared \|\| isOriginalColorMode\(\)\) \{[\s\S]*?if \(integratedShared\) \{[\s\S]*?frame\.width !== sharedImageTarget\?\.width[\s\S]*?prepareCaptureDownload\(state\.result\)/);
  const action = app.slice(app.indexOf("$('#useCameraImage').addEventListener('click'"));
  assert.match(action, /if \(isOriginalColorMode\(\) && typeof onUseImage !== 'function'\) \{[\s\S]*?元の色の撮影結果はそのまま保持しています[\s\S]*?return;[\s\S]*?cameraPxd\.save\(\)/);
});

test('PNG handoff keeps the original-colour setting and returns to the same mode', () => {
  const frame = fixture(128, 72);
  const blob = new Blob(['png bytes'], { type: 'image/png' });
  const options = createPixelLensOutputOptions({ blob, filename: 'original.png', returnUrl: '/camera/', frame,
    settings: { ratio: '16:9', size: 128, colorDepth: 'full', paletteMode: 'source', gradientMode: 'none',
      surfaceSimplify: 0, miniature: false, camera: {} } });
  assert.equal(options.metadata.cameraColors, 'full');
  assert.equal(options.metadata.cameraGradientMode, 'none');
  assert.equal(options.metadata.cameraMiniature, false);
  assert.deepEqual(options.mediaSource.frames[0].data, frame.data);
  const restored = preparePixelLensOutputRestore({ source: 'ドット絵カメラ', mime: 'image/png', sourceFilename: 'original.png',
    sourceBlob: blob, metadata: { ...options.metadata } });
  assert.equal(restored.settings.colorDepth, 'full');
  assert.equal(restored.settings.miniature, false);
});
