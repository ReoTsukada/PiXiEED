import test from 'node:test';
import assert from 'node:assert/strict';
import { getOutputTiming } from '../../js/creation/output-timing.mjs';

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
