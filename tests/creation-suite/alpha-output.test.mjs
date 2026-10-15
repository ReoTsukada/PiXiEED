import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeOutput } from '../../js/creation/output-encoders.mjs';

const pngSignature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const frame = { width: 1, height: 1, data: Uint8ClampedArray.of(200, 100, 50, 243) };
const pngEncoder = async (_frame, mime) => new Blob([pngSignature], { type: mime });

test('PNG defaults to transparent output and keeps the original alpha-243 source buffer', async () => {
  const original = new Uint8ClampedArray(frame.data);
  let received;
  const encodeRaster = async (value, mime) => { received = value; return pngEncoder(value, mime); };
  const blob = await encodeOutput({ format: 'png', frames: [frame] }, { encodeRaster });
  assert.equal(blob.type, 'image/png');
  assert.equal(received, frame);
  assert.deepEqual([...received.data], [200, 100, 50, 243]);
  assert.deepEqual([...frame.data], [...original]);
});

test('PNG can explicitly composite onto the selected matte without mutating source RGBA', async () => {
  const original = new Uint8ClampedArray(frame.data);
  let received;
  const encodeRaster = async (value, mime) => { received = value; return pngEncoder(value, mime); };
  const blob = await encodeOutput({ format: 'png', frames: [frame], pngBackground: '#14283c' }, { encodeRaster });
  assert.equal(blob.type, 'image/png');
  assert.notEqual(received, frame);
  assert.deepEqual([...received.data], [192, 97, 50, 255]);
  assert.deepEqual([...frame.data], [...original]);
});

test('GIF partial alpha reports PNG and background-compositing alternatives', async () => {
  await assert.rejects(encodeOutput({ format: 'gif', frames: [frame] }),
    (error) => /PNG/.test(error.message) && /背景色/.test(error.message));
});

test('output workspace exposes a transparent-default PNG background choice and matte color control', () => {
  const html = readFileSync(new URL('../../output/work/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="output-png-background-setting"[^>]*hidden/);
  assert.match(html, /id="output-png-background-mode"/);
  assert.match(html, /<option value="transparent">透過背景<\/option>/);
  assert.match(html, /<option value="color">背景色を合成<\/option>/);
  assert.match(html, /id="output-png-background" type="color" value="#ffffff"/);
});


test('PNG background controls are disabled during generation so the selected matte cannot diverge from the saved output', () => {
  const source = readFileSync(new URL('../../js/creation/output-page.mjs', import.meta.url), 'utf8');
  assert.match(source, /pngBackgroundMode\.disabled = busy;/);
  assert.match(source, /pngBackgroundColor\.disabled = busy;/);
  assert.match(source, /generationProgress\.hidden = !busy;/);
});
