import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveOutputFps, getOutputTiming, outputFpsToDelayMs } from '../../js/creation/output-timing.mjs';

test('preview, animated export summaries, and video share speed-adjusted frame timing', () => {
  const cases = [
    { delayMs: 10, rates: [0.25, 1.5, 4], gif: [40, 20, 20], apng: [40, 7, 3], video: [40, 10 / 1.5, 2.5] },
    { delayMs: 6000, rates: [0.25, 1.5, 4], gif: [24000, 4000, 1500], apng: [24000, 4000, 1500], video: [24000, 4000, 1500] }
  ];
  for (const { delayMs, rates, gif: gifExpected, apng: apngExpected, video: videoExpected } of cases) {
    for (const [index, playbackRate] of rates.entries()) {
      const gif = getOutputTiming([{ delayMs }], { format: 'gif', playbackRate });
      const apng = getOutputTiming([{ delayMs }], { format: 'apng', playbackRate });
      const video = getOutputTiming([{ delayMs }], { format: 'video', playbackRate });
      assert.equal(gif.durationMs, gifExpected[index]);
      assert.equal(apng.durationMs, apngExpected[index]);
      assert.equal(video.durationMs, videoExpected[index]);
      assert.equal(video.sourceDelaysMs[0], delayMs, 'video keeps source timeline and applies speed in elapsed time');
      assert.equal(video.previewDelaysMs[0], delayMs / playbackRate, 'video preview uses the same elapsed frame delay as recording');
    }
  }
});

test('GIF timing matches its 20ms floor and 10ms centisecond quantization without an upper clamp', () => {
  assert.equal(getOutputTiming([{ delayMs: 21 }], { format: 'gif' }).durationMs, 20);
  assert.equal(getOutputTiming([{ delayMs: 25 }], { format: 'gif' }).durationMs, 30);
  assert.equal(getOutputTiming([{ delayMs: 6000 }], { format: 'gif' }).durationMs, 6000);
  assert.equal(getOutputTiming([{ delayMs: 100000 }], { format: 'apng' }).durationMs, 100000);
});

test('effective FPS is only reported for a uniform output timeline', () => {
  assert.equal(getEffectiveOutputFps([{ delayMs: 40 }, { delayMs: 40 }]), 25);
  assert.equal(getEffectiveOutputFps([{ delayMs: 40 }, { delayMs: 80 }]), null);
  assert.equal(getEffectiveOutputFps([{ delayMs: 21 }, { delayMs: 24 }], { format: 'gif' }), 50, 'GIF quantization may make distinct source delays uniform');
  assert.equal(getEffectiveOutputFps([{ delayMs: 40 }, { delayMs: 40 }], { format: 'video', playbackRate: 2 }), 50);
});

test('FPS input converts to precise frame delays and rejects delays outside the output format range', () => {
  assert.equal(outputFpsToDelayMs(25), 40);
  assert.equal(outputFpsToDelayMs(12.5), 80);
  assert.ok(Math.abs(outputFpsToDelayMs(24) - 1000 / 24) < 1e-12);
  assert.throws(() => outputFpsToDelayMs(0), RangeError);
  assert.throws(() => outputFpsToDelayMs(51, { minDelayMs: 20, maxDelayMs: 655350 }), RangeError);
});
