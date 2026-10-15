import test from 'node:test';
import assert from 'node:assert/strict';
import { autoDrawingFilename, isAutoDrawingFilename, resolveOutputFilename } from '../../js/creation/output-filename.mjs';

const source = 'PiXiEEDraw';

test('recognizes only the complete generated Draw name and keeps native dimensions', () => {
  const metadata = { width: 16, height: 16, defaultScale: 128 };
  const filename = 'pixieed-drawing-16x16@2048x2048.png';
  assert.equal(isAutoDrawingFilename({ source, filename, metadata, extension: 'png' }), true);
  assert.equal(autoDrawingFilename(metadata, 16, 16, 'png'), 'pixieed-drawing-16x16@16x16.png');
});

test('updates actual dimensions across repeated resize and format changes', () => {
  const logical = { width: 16, height: 16 };
  assert.equal(autoDrawingFilename(logical, 64, 64, 'png'), 'pixieed-drawing-16x16@64x64.png');
  const resized = { ...logical, outputWidth: 64, outputHeight: 64 };
  assert.equal(isAutoDrawingFilename({ source, filename: 'pixieed-drawing-16x16@64x64.png', metadata: resized, extension: 'png' }), true);
  assert.equal(autoDrawingFilename(resized, 32, 32, 'jpeg'), 'pixieed-drawing-16x16@32x32.jpeg');
});

test('leaves user names with dimension-like suffixes outside the generated pattern alone', () => {
  const metadata = { width: 16, height: 16, defaultScale: 128 };
  assert.equal(isAutoDrawingFilename({ source, filename: 'my-art@2048x2048.png', metadata, extension: 'png' }), false);
  assert.equal(isAutoDrawingFilename({ source: '別の素材', filename: 'pixieed-drawing-16x16@2048x2048.png', metadata, extension: 'png' }), false);
  assert.equal(autoDrawingFilename(null, 16, 16, 'png'), null);
});

test('a persisted user name that exactly matches the auto pattern survives reload and resize', () => {
  const metadata = { width: 16, height: 16, outputWidth: 32, outputHeight: 32, userFilename: true };
  const filename = 'pixieed-drawing-16x16@32x32.png';
  const autoName = isAutoDrawingFilename({ source, filename, metadata, extension: 'png' });
  assert.equal(autoName, false);
  assert.equal(resolveOutputFilename({ autoName, metadata, width: 16, height: 16, extension: 'png', baseName: 'pixieed-drawing-16x16@32x32' }), filename);
  assert.equal(resolveOutputFilename({ autoName, metadata, width: 16, height: 16, extension: 'jpeg', baseName: 'pixieed-drawing-16x16@32x32' }), 'pixieed-drawing-16x16@32x32.jpeg');
});
