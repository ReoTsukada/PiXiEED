import test from 'node:test';
import assert from 'node:assert/strict';
import { __segmenterTestUtils } from '../../js/pixel-studio/segmenter.mjs';

test('low-IoU masks skip full logits stability reads and the batch mask postprocess', () => {
  const predMasks = {
    dims: [1, 2, 3, 1, 1],
    data: new Proxy({ length: 6 }, {
      get(target, property) {
        if (property === 'length') return target.length;
        throw new Error('low-score masks must not read logits');
      }
    })
  };
  const iouScores = { dims: [1, 2, 3], data: Float32Array.from([0.77, 0.1, 0.4, 0, 0.5, 0.2]) };
  const eligible = __segmenterTestUtils.eligibleCandidates(predMasks, iouScores, 2);
  let postprocessCalls = 0;

  assert.deepEqual(eligible, []);
  assert.equal(__segmenterTestUtils.postProcessIfEligible(eligible, () => { postprocessCalls++; }), null);
  assert.equal(postprocessCalls, 0);
});

test('candidate prefilter preserves point order, mask order, scores, and stability', () => {
  const predMasks = {
    dims: [1, 2, 3, 1, 2],
    data: Float32Array.from([1, 1, -1, -1, 0, 0, 1, 1, 0.2, 0.2, -1, -1])
  };
  const iouScores = { dims: [1, 2, 3], data: Float32Array.from([0.9, 0.99, 0.99, 0.82, 0.99, 0.99]) };
  const eligible = __segmenterTestUtils.eligibleCandidates(predMasks, iouScores, 2);

  assert.deepEqual(eligible, [
    { pointIndex: 0, maskIndex: 0, score: Math.fround(0.9), stability: 1 },
    { pointIndex: 1, maskIndex: 0, score: Math.fround(0.82), stability: 1 }
  ]);
  let postprocessCalls = 0;
  const result = { processed: true };
  assert.equal(__segmenterTestUtils.postProcessIfEligible(eligible, () => { postprocessCalls++; return result; }), result);
  assert.equal(postprocessCalls, 1);
});
