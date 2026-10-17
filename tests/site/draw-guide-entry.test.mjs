import test from 'node:test';
import assert from 'node:assert/strict';
import { drawGuideDestination } from '../../js/draw-guide-entry.mjs';

test('old guide arrivals retain duplicate query values and reach consolidated sections', () => {
  assert.equal(drawGuideDestination('?ref=a&ref=b'), '/draw/?ref=a&ref=b#draw-how-to');
  assert.equal(drawGuideDestination('?mode=camera', '#draw-formats-title'), '/draw/?mode=camera#draw-save');
  assert.equal(drawGuideDestination('', '#draw-faq-title'), '/draw/#draw-faq');
  assert.equal(drawGuideDestination('', '#draw-try'), '/draw/#draw-tool');
  assert.equal(drawGuideDestination('', '#custom-bookmark'), '/draw/#custom-bookmark');
});
