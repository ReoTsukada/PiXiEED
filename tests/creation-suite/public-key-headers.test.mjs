import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('unauthenticated public reads send the publishable key without treating it as a user JWT', async () => {
  const [pixfind, jigsaw, app] = await Promise.all([
    source('../../js/creation/pixfind-play.mjs'),
    source('../../js/creation/jigsaw-page.mjs'),
    source('../../js/app.js')
  ]);
  assert.match(pixfind, /const HEADERS = \{ apikey: supabaseConfig\.publishableKey \};/);
  assert.match(jigsaw, /const restHeaders = \{ apikey: supabaseConfig\.publishableKey, Accept: 'application\/json' \};/);
  assert.match(app, /headers: \{ apikey: publishableKey, Accept: 'application\/json' \}/);
  assert.doesNotMatch(pixfind, /Authorization:\s*`Bearer \$\{supabaseConfig\.publishableKey\}`/);
  assert.doesNotMatch(jigsaw, /Authorization:\s*`Bearer \$\{supabaseConfig\.publishableKey\}`/);
  assert.doesNotMatch(app, /Authorization:\s*`Bearer \$\{publishableKey\}`/);
});
