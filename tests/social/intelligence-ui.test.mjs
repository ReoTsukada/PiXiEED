import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('SNS feed and explore routes expose concise action labels and a recoverable warning detail', () => {
  for (const path of ['feed/index.html', 'explore/index.html']) {
    const html = read(path);
    assert.match(html, /id="feedWarningDetails"[^>]*hidden/ , path);
    assert.match(html, /id="feedWarningList"/ , path);
    assert.match(html, /data-type="photo"[^>]*>写真加工</, path);
    assert.match(html, /href="\/camera\/[^>]*>写真をドット絵に</, path);
    assert.match(html, /href="\/audio\/[^>]*>音楽を作る</, path);
    assert.match(html, /id="composerPostingConsent"/ , path);
    assert.match(html, /この端末に保存されます|下書きはこの端末に保存/ , path);
  }
});

test('search is mounted outside the filter disclosure and results have contextual next actions', () => {
  const app = read('js/social/app.mjs');
  assert.match(app, /const anchor = \$\('#feedViews'[\s\S]*anchor\.before\(label, note\)/);
  assert.doesNotMatch(app, /\$\('#feedFilters'[\s\S]*\.after\(input\)/);
  for (const action of ['clear-search', "'data-view': 'feed'", "'data-type': 'all'", "'data-compose': ''"]) assert.ok(app.includes(action), action);
  assert.match(app, /searchLabel\.hidden = view !== 'feed'/);
  assert.match(app, /aria-pressed/);
  assert.match(app, /if \(!posts\.length\) feed\.append\(renderEmptyState\(\)\)/);
  assert.match(app, /updateReadWarningDetails\(false\); statusText\('下書きはこの端末に保存されています。'\)/);
  assert.match(app, /const showReadWarnings = state\.filter !== 'saved'/);
  assert.match(app, /取得できた作品に一致するものはありません/);
  assert.match(app, /取得できた範囲に/);
});

test('partial-source warnings remain visible with retry and detailed causes', () => {
  const app = read('js/social/app.mjs');
  const css = read('css/social-feed.css');
  assert.match(app, /updateReadWarningDetails\(\)/);
  assert.match(app, /retry\.hidden = !showReadWarnings \|\| !state\.readWarnings\.length/);
  assert.match(app, /公開元の一部は未取得です/);
  assert.match(css, /\.feed-warning-details summary/);
  assert.match(css, /\.feed-warning-details ul/);
});
