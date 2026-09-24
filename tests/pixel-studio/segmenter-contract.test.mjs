import test from 'node:test';
import assert from 'node:assert/strict';
import { __segmenterTestUtils, createSegmenter } from '../../js/pixel-studio/segmenter.mjs';

test('segmenter factory is lazy and exposes the asynchronous lifecycle contract', async () => {
  const segmenter = createSegmenter();
  assert.equal(typeof segmenter.segment, 'function');
  assert.equal(typeof segmenter.dispose, 'function');
  await segmenter.dispose();
  await assert.rejects(segmenter.segment({ width: 1, height: 1, data: new Uint8Array(4) }), { name: 'AbortError' });
});

test('input dimensions and RGBA byte length are checked before runtime loading', async () => {
  const segmenter = createSegmenter();
  await assert.rejects(segmenter.segment({ width: 1, height: 1, data: new Uint8Array(3) }), TypeError);
  await assert.rejects(segmenter.segment({ width: 5000, height: 4000, data: new Uint8Array(4) }), TypeError);
  await segmenter.dispose();
});

test('postprocessed [pointBatch, mask, height, width] tensors select the matching point plane', () => {
  const data = Uint8Array.from({ length: 2 * 3 * 2 * 2 }, (_, index) => index);
  const plane = __segmenterTestUtils.tensorPlane({ dims: [2, 3, 2, 2], data }, 1, 2);
  assert.deepEqual(plane, { data, offset: 20, width: 2, height: 2, planeSize: 4 });
});

test('postprocessed masks must be binary bytes with dimensions and storage that agree', () => {
  const data = Uint8Array.from([0, 1, 1, 0]);
  const plane = __segmenterTestUtils.tensorPlane({ dims: [1, 1, 2, 2], data }, 0, 0);
  assert.deepEqual(__segmenterTestUtils.assertMaskPlane(plane, { dims: [1, 1, 2, 2], data }, 0, 0), plane);
  assert.throws(() => __segmenterTestUtils.assertMaskPlane(null, { dims: [0, 2, 2] }, 0, 0), /contract failed/);
  assert.throws(() => __segmenterTestUtils.assertMaskPlane({ ...plane, data: Float32Array.from([0, 1, 1, 0]) }, {}, 0, 0), /contract failed/);
  const nonbinary = { ...plane, data: Uint8Array.from([0, 1, 2, 0]) };
  assert.throws(() => __segmenterTestUtils.assertMaskPlane(nonbinary, { dims: [1, 2, 2] }, 0, 0), /not binary/);
});

test('model scores are normalized for downstream instance contracts while raw scores remain available', () => {
  assert.equal(__segmenterTestUtils.normalizedScore(1.2), 1);
  assert.equal(__segmenterTestUtils.normalizedScore(-0.1), 0);
  assert.equal(__segmenterTestUtils.normalizedScore(0.73), 0.73);
});

test('point and label batch slicing preserves expected dtype, shape, and source tensors', () => {
  class TensorStub {
    constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; }
  }
  const points = {
    type: 'float32', dims: [1, 4, 1, 2],
    data: Float32Array.from([10, 11, 20, 21, 30, 31, 40, 41])
  };
  const labels = {
    type: 'int64', dims: [1, 4, 1],
    data: BigInt64Array.from([1n, 0n, 1n, 0n])
  };
  const beforePoints = [...points.data], beforeLabels = [...labels.data];
  __segmenterTestUtils.assertPointTensorPair(points, labels, 4);
  const pointBatch = __segmenterTestUtils.sliceTensorBatch(points, 1, 1, 2, TensorStub);
  const labelBatch = __segmenterTestUtils.sliceTensorBatch(labels, 1, 1, 2, TensorStub);
  assert.equal(pointBatch.type, 'float32');
  assert.deepEqual(pointBatch.dims, [1, 2, 1, 2]);
  assert.deepEqual([...pointBatch.data], [20, 21, 30, 31]);
  assert.equal(labelBatch.type, 'int64');
  assert.deepEqual(labelBatch.dims, [1, 2, 1]);
  assert.deepEqual([...labelBatch.data], [0n, 1n]);
  assert.deepEqual([...points.data], beforePoints);
  assert.deepEqual([...labels.data], beforeLabels);
});

test('point tensor contract rejects incompatible processor output dimensions', () => {
  assert.throws(() => __segmenterTestUtils.assertPointTensorPair({
    type: 'float32', dims: [1, 2, 2], data: new Float32Array(4)
  }, {
    type: 'int64', dims: [1, 2, 1], data: new BigInt64Array(2)
  }, 2), /unexpected shape or dtype/);
});

test('point labels may be omitted, but malformed supplied labels are rejected', () => {
  const points = { type: 'float32', dims: [1, 2, 1, 2], data: new Float32Array(4) };
  assert.doesNotThrow(() => __segmenterTestUtils.assertPointTensorPair(points, undefined, 2));
  assert.doesNotThrow(() => __segmenterTestUtils.assertPointTensorPair(points, null, 2));
  assert.throws(() => __segmenterTestUtils.assertPointTensorPair(points, {
    type: 'int64', dims: [1, 1, 1], data: new BigInt64Array(1)
  }, 2), /label tensor has unexpected shape or dtype/);
});

test('stability compares foreground at permissive and strict logit thresholds', () => {
  const data = Float32Array.from([2, 1, -1, -2]);
  const stable = __segmenterTestUtils.stabilityOf({ data, offset: 0, planeSize: 4 });
  assert.equal(stable, 1);
  const uncertainData = Float32Array.from([2, 0.2, -0.2, -2]);
  const uncertain = __segmenterTestUtils.stabilityOf({ data: uncertainData, offset: 0, planeSize: 4 });
  assert.equal(uncertain, 1 / 3);
});
