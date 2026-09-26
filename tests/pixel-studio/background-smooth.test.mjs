import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothRecognizedBackground } from '../../js/pixel-studio/background-smooth.mjs';

function scene() {
  const width = 11, height = 11, data = new Uint8ClampedArray(width * height * 4);
  const labels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gray = (x + y) % 2 ? 148 : 152;
    data.set([gray,gray,gray,255], (y * width + x) * 4);
  }
  for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) {
    labels[y * width + x] = 7;
    data.set([192,80,50,255], (y * width + x) * 4);
  }
  return { width, height, data, labels, segmented:true, stats:{} };
}
function rgb(frame,x,y) { return Array.from(frame.data.slice((y*frame.width+x)*4,(y*frame.width+x)*4+3)); }

test('smooths weak background texture while retaining foreground and its first outline', () => {
  const frame = scene(), original = new Uint8ClampedArray(frame.data);
  const out = smoothRecognizedBackground(frame);
  assert.ok(out.stats.backgroundSmoothedCells > 0);
  assert.deepEqual(rgb(out,2,2),[150,150,150]);
  assert.deepEqual(rgb(out,5,5),[192,80,50]);
  assert.deepEqual(rgb(out,3,5),rgb(frame,3,5), 'the immediate background rim is fixed');
  assert.deepEqual(frame.data,original);
  assert.strictEqual(out.labels,frame.labels);
});

test('does not mix a genuine background color step or invent blur without a mask', () => {
  const frame = scene();
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    if (frame.labels[y*frame.width+x]) continue;
    const gray = x < 5 ? 100 : 200;
    frame.data.set([gray,gray,gray,255], (y*frame.width+x)*4);
  }
  const out = smoothRecognizedBackground(frame);
  assert.deepEqual(rgb(out,4,8),[100,100,100]);
  assert.deepEqual(rgb(out,5,8),[200,200,200]);
  const fallback = smoothRecognizedBackground({...frame,segmented:false});
  assert.deepEqual(fallback.data,frame.data);
  assert.equal(fallback.stats.backgroundSmoothedCells,0);
  assert.throws(()=>smoothRecognizedBackground({...frame,labels:new Uint32Array(1)}),TypeError);
});
