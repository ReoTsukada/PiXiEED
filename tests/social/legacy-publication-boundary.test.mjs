import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../supabase/migrations/20261022051639_restrict_legacy_pixfind_direct_insert.sql', import.meta.url), 'utf8');
const legacyReader = await readFile(new URL('../../js/creation/pixfind-play.mjs', import.meta.url), 'utf8');
const successor = await readFile(new URL('../../supabase/functions/social-feed/index.ts', import.meta.url), 'utf8');
const consent = await readFile(new URL('../../supabase/functions/_shared/posting-consent.ts', import.meta.url), 'utf8');
const spotPage = await readFile(new URL('../../js/creation/spot-difference-page.mjs', import.meta.url), 'utf8');
const hiddenPage = await readFile(new URL('../../js/creation/hidden-object-page.mjs', import.meta.url), 'utf8');
const localDrafts = await readFile(new URL('../../js/creation/local-drafts.mjs', import.meta.url), 'utf8');

test('legacy direct puzzle inserts lose only public table permission; existing reads and service inserts remain', () => {
  assert.match(migration, /revoke\s+insert\s+on\s+table\s+public\.pixfind_puzzles\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i);
  assert.match(migration, /drop\s+policy\s+if\s+exists\s+"Public insert pixfind puzzles"/i);
  assert.match(migration, /drop\s+policy\s+if\s+exists\s+pixfind_puzzles_insert/i);
  assert.doesNotMatch(migration, /\b(delete\s+from|truncate|drop\s+table|revoke\s+all|drop\s+policy\s+if\s+exists\s+"Public read)/i);
  assert.doesNotMatch(migration, /\bgrant\s+insert\b/i);
  assert.match(legacyReader, /requestUrl\('pixfind_puzzles'/);
  assert.match(legacyReader, /async function getJson/);
  assert.match(migration, /no rows/i);
  // Legacy clients receive a database permission error (REST 403); the current
  // publisher surfaces handoff failure while retaining its confirmed draft.
  assert.match(spotPage, /投稿を準備できませんでした/);
  assert.match(hiddenPage, /投稿を準備できませんでした/);
  assert.match(localDrafts, /createIndexedDbDraftAdapter/);
});

test('current public puzzle creation requires a saved consent receipt before its server reservation', () => {
  const receipt = successor.indexOf('persistPostingConsent');
  const reservation = successor.indexOf('pixieed_sns_reserve_post');
  assert.ok(receipt >= 0 && reservation > receipt);
  assert.match(successor, /posting_consent_save_failed/);
  assert.match(consent, /posting_consents/);
  assert.match(consent, /request_digest/);
});
