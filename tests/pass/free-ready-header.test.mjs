import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the shared header no longer presents daily pass or expiry state', async () => {
  const source = await readFile(new URL('../../js/site-header.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /deriveHeaderPassState|freeWithoutAd|passRemainingMs|formatPassRemaining/);
  assert.doesNotMatch(source, /data-header-pass-label|px-pass-gauge|passRemainingMs/);
  assert.match(source, /querySelectorAll\('\[data-header-pass\]'\)\.forEach\(\(button\) => button\.remove\(\)\)/);
});
