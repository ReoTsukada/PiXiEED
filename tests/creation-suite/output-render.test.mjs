import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferIntegerPixelScale, shouldAutoSelectPixelOrigin, verifyPixelScaleClaim } from '../../js/creation/output-render.mjs';

function informativeFrame(width = 8, height = 8, seed = 1) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = ((x * 17 + y * 31 + x * y * 7 + seed * 13) % 251) + 1;
    const offset = (y * width + x) * 4;
    data[offset] = value; data[offset + 1] = (value * 3) % 256; data[offset + 2] = (value * 7) % 256;
    data[offset + 3] = (x + y) % 5 === 0 ? 0 : 255;
  }
  return { width, height, data };
}

function enlarge(frame, scale) {
  const width = frame.width * scale; const height = frame.height * scale;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const src = ((Math.floor(y / scale) * frame.width) + Math.floor(x / scale)) * 4;
    data.set(frame.data.subarray(src, src + 4), (y * width + x) * 4);
  }
  return { width, height, data };
}

test('detects lossless 2x, 3x and 4x integer pixel enlargements', async () => {
  for (const scale of [2, 3, 4]) {
    const result = await inferIntegerPixelScale([enlarge(informativeFrame(8, 8, scale), scale)]);
    assert.equal(result.status, 'detected');
    assert.equal(result.scale, scale);
    assert.equal(result.width, 8);
    assert.equal(result.height, 8);
    assert.equal(result.confidence, 'pixel-evidence');
  }
});

test('rejects nonmultiple dimensions and rasters without exact repeated blocks', async () => {
  const frame = informativeFrame(8, 8);
  frame.data[0] ^= 1;
  assert.deepEqual(await inferIntegerPixelScale([frame]), { status: 'skip', reason: 'no-exact-scale' });
  assert.deepEqual(await inferIntegerPixelScale([informativeFrame(13, 10)]), { status: 'skip', reason: 'no-exact-scale' });
});

test('RGBA comparison includes alpha and hidden RGB channels', async () => {
  for (const channel of [0, 3]) {
    const frame = enlarge(informativeFrame(8, 8), 3);
    frame.data[channel] ^= 1;
    assert.deepEqual(await inferIntegerPixelScale([frame]), { status: 'skip', reason: 'no-exact-scale' });
  }
});

test('marks simple low-information enlargement as a candidate without shrinking', async () => {
  const source = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) };
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
    const offset = (y * 4 + x) * 4; const color = x === 0 || x === 3 || y === 0 || y === 3 ? 255 : 60;
    source.data.set([color, color, color, 255], offset);
  }
  const result = await inferIntegerPixelScale([enlarge(source, 2)]);
  assert.equal(result.status, 'candidate');
  assert.equal(result.reason, 'low-information');
  assert.equal(result.scale, 2);
});

test('does not reduce animation when frames have different largest exact scales', async () => {
  const two = enlarge(informativeFrame(8, 8, 1), 2);
  const four = enlarge(informativeFrame(4, 4, 2), 4);
  assert.deepEqual(await inferIntegerPixelScale([two, four]), { status: 'skip', reason: 'mixed-scales' });
});

test('honors the pixel work limit and verifies metadata against frame pixels', async () => {
  const frame = enlarge(informativeFrame(8, 8), 2);
  assert.deepEqual(await inferIntegerPixelScale([frame], { maxPixels: 255 }), { status: 'skip', reason: 'pixel-limit' });
  assert.deepEqual(await verifyPixelScaleClaim([frame], { width: 8, height: 8, scale: 2 }), {
    status: 'verified', width: 8, height: 8, scale: 2, source: 'metadata'
  });
  assert.deepEqual(await verifyPixelScaleClaim([frame], { width: 4, height: 4, scale: 4 }), {
    status: 'skip', reason: 'metadata-pixels-mismatch'
  });
});

test('cancels between scan chunks', async () => {
  const controller = new AbortController();
  const frame = enlarge(informativeFrame(64, 64), 2);
  const task = inferIntegerPixelScale([frame], { signal: controller.signal });
  controller.abort();
  await assert.rejects(task, { name: 'AbortError' });
});

test('persisted original-size choice prevents automatic re-selection of the pixel derivative', () => {
  assert.equal(shouldAutoSelectPixelOrigin({ selection: 'original', needsAutoResize: true }), false);
  assert.equal(shouldAutoSelectPixelOrigin({ selection: undefined, needsAutoResize: true }), true);
  assert.equal(shouldAutoSelectPixelOrigin({ selection: 'original', needsAutoResize: false }), false);
});

test('preview CSS uses intrinsic ratio and contain sizing for raster and video media', () => {
  const css = readFileSync(new URL('../../css/tool-output.css', import.meta.url), 'utf8');
  const rasterRule = css.match(/\.output-preview\s*>\s*:is\(img,canvas\)\s*\{([^}]*)\}/)?.[1];
  const videoRule = css.match(/\.output-preview\s*>\s*video\s*\{([^}]*)\}/)?.[1];
  for (const rule of [rasterRule, videoRule]) {
    assert.ok(rule, 'the preview media rule exists');
    assert.match(rule, /\bwidth:\s*auto\s*;/);
    assert.match(rule, /\bheight:\s*auto\s*;/);
    assert.match(rule, /\bmax-width:\s*100%\s*;/);
    assert.match(rule, /\bmax-height:\s*100%\s*;/);
    assert.match(rule, /\bobject-fit:\s*contain\s*;/);
    assert.doesNotMatch(rule, /(?:^|;)\s*(?:width|height):\s*100%\s*;/, 'stretch dimensions are not used');
  }
});

test('extreme portrait and landscape art fits mobile and desktop preview bounds without cropping or stretching', () => {
  const contain = (width, height, boxWidth, boxHeight) => {
    const factor = Math.min(boxWidth / width, boxHeight / height);
    return { width: width * factor, height: height * factor };
  };
  const viewports = [
    { name: '320px mobile', boxWidth: 276, boxHeight: 230 },
    { name: '1280px desktop', boxWidth: 690, boxHeight: 563 }
  ];
  for (const { name, boxWidth, boxHeight } of viewports) for (const [width, height] of [[8, 512], [512, 8]]) {
    const fitted = contain(width, height, boxWidth, boxHeight);
    assert.ok(fitted.width <= boxWidth && fitted.height <= boxHeight, `${name} ${width}×${height} fits the preview box`);
    assert.ok(Math.abs(fitted.width / fitted.height - width / height) < 1e-10, `${name} ${width}×${height} retains its intrinsic ratio`);
  }
});

test('detects 5x and maximum 32x integer scaling, skips heuristic 37x, but verifies a 37x metadata claim', async () => {
  for (const scale of [5, 32]) {
    const result = await inferIntegerPixelScale([enlarge(informativeFrame(8, 8), scale)]);
    assert.equal(result.status, 'detected', `${scale}x is within the heuristic cap`);
    assert.equal(result.scale, scale);
  }
  const frame37 = enlarge(informativeFrame(8, 8), 37);
  assert.deepEqual(await inferIntegerPixelScale([frame37]), { status: 'skip', reason: 'no-exact-scale' });
  assert.deepEqual(await verifyPixelScaleClaim([frame37], { width: 8, height: 8, scale: 37 }), {
    status: 'verified', width: 8, height: 8, scale: 37, source: 'metadata'
  });
});
