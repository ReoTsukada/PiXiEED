import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [spotMarkup, hiddenMarkup, spotPage, hiddenPage] = await Promise.all([
  readFile(new URL('../../spot-difference/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../hidden-object/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../js/creation/spot-difference-page.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../js/creation/hidden-object-page.mjs', import.meta.url), 'utf8')
]);

test('both confirmed creators show local play as the primary choice and an explicit labeled post action', () => {
  for (const [markup, playId, postId] of [[spotMarkup, 'spot-play-local', 'spot-publish'], [hiddenMarkup, 'hidden-play-local', 'hidden-publish']]) {
    const play = markup.match(new RegExp(`<button[^>]*id="${playId}"[\\s\\S]*?<\\/button>`))?.[0] || '';
    const post = markup.match(new RegExp(`<button[^>]*id="${postId}"[\\s\\S]*?<\\/button>`))?.[0] || '';
    assert.ok(play.includes('<svg') && /自分だけで遊ぶ<\/span>/.test(play));
    assert.ok(post.includes('<svg') && post.includes('<span>投稿する</span>'));
    assert.match(post, /background:#fff;color:#49643c/);
  }
});

test('creator post actions are preparation-only feed handoffs guarded by editor identity and busy state', () => {
  for (const source of [spotPage, hiddenPage]) {
    assert.match(source, /if \(handoffBusy \|\|/);
    assert.match(source, /handoffBusy = true/);
    assert.match(source, /destination: 'feed'/);
    assert.match(source, /localDraftId: UUID\.test\(id\) \? id : undefined/);
    assert.match(source, /isCurrent/);
  }
  assert.doesNotMatch(spotPage.slice(spotPage.indexOf("publishButton.addEventListener('click'"), spotPage.indexOf("$('#spot-split-mode')")), /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(hiddenPage.slice(hiddenPage.indexOf("publishButton.addEventListener('click'"), hiddenPage.indexOf("$('#hidden-share-prompt-text')")), /fetch\(|XMLHttpRequest|sendBeacon/);
});
