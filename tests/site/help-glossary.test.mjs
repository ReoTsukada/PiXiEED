import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const help = await readFile(new URL('../../help/index.html', import.meta.url), 'utf8');
const glossary = await readFile(new URL('../../glossary/index.html', import.meta.url), 'utf8');

test('help page opens common navigation and presents the six direct user actions', () => {
  assert.match(help, /class="legacy-reference-header site-header"/);
  assert.match(help, /class="brand" href="\/"/);
  assert.match(help, /href="\/css\/site-header\.css\?rev=20261024-intelligence-ui-1"/);
  assert.match(help, /src="\/js\/site-header\.mjs\?rev=20261024-common-tool-start-1"/);
  for (const [href, label] of [
    ['/draw/?workspace=1', '描く'],
    ['/camera/?workspace=1', '画像・カメラ'],
    ['/audio/?workspace=1', '音楽'],
    ['/output/work/', '書き出し'],
    ['/explore/', '作品を探す'],
    ['/guide/', '使い方'],
  ]) {
    assert.match(help, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?<strong>${label}<\\/strong>`));
  }
  assert.match(help, /<details class="help-mode-details">[\s\S]*?<summary id="help-modes-title">/);
  assert.match(help, /href="\/privacy\/"/);
});

test('glossary has common navigation and an accessible search clear and empty-result state', () => {
  assert.match(glossary, /<header class="site-header"><div class="header-inner"><a class="brand" href="\/">PiXiEED<\/a>/);
  assert.match(glossary, /href="\/css\/site-header\.css\?rev=20261024-intelligence-ui-1"/);
  assert.match(glossary, /src="\/js\/site-header\.mjs\?rev=20261024-common-tool-start-1"/);
  assert.match(glossary, /<p class="search-note" id="termCount" role="status" aria-live="polite">/);
  assert.match(glossary, /<button id="termSearchClear" type="button" hidden>検索をクリア<\/button>/);
  assert.match(glossary, /条件に合う用語はありません。検索をクリアしてください。/);
  assert.match(glossary, /section\.hidden = !Array\.from\(sectionItems\)\.some\(\(item\) => !item\.hidden\)/);
  assert.match(glossary, /input\.focus\(\)/);
});
