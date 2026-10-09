import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const PAGES = { 'spot-difference': 'spot-difference', 'hidden-object': 'hidden-object', 'play/spot-difference': 'spot-game', 'play/hidden-object': 'find-game', game: 'creation-game' };

test('play tools wear the arcade look; the dress loads after the page and knows every page by data-page', () => {
  const dress = read('js/arcade-dress.mjs');
  for (const [dir, page] of Object.entries(PAGES)) {
    const html = read(`${dir}/index.html`);
    assert.match(html, /css\/arcade\.css/, dir); assert.match(html, /css\/arcade-tools\.css/, dir);
    assert.match(html, new RegExp(`data-page="${page}"`), dir);
    assert.ok(html.indexOf('/js/creation/') < html.indexOf('arcade-dress.mjs'), `${dir}: the page script runs first`);
    assert.match(dress, new RegExp(`'?${page}'?: \\{`), `${dir} has a dress`);
  }
  for (const dir of ['draw', 'audio']) assert.match(read(`${dir}/index.html`), /css\/arcade-tools\.css/, dir);
});

test('every tool page shares the bottom bar and the logo home', () => {
  for (const dir of [...Object.keys(PAGES), 'draw', 'audio']) {
    const html = read(`${dir}/index.html`);
    const nav = html.match(/<nav class="app-tabs"[^>]*>([\s\S]*?)<\/nav>/)[1];
    const labels = [...nav.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(labels[0], '世界地図', dir); assert.equal(labels[1], '撮影', dir); assert.deepEqual(labels.slice(-2), ['ツール', 'マイページ'], dir);
    assert.doesNotMatch(nav, /aria-label="ホーム"/, dir);
    if (html.includes('class="brand"')) assert.match(html, /<a class="brand" href="\/"/, dir);
  }
});

test('the dress only reads the page: progress text drives the HUD, and it never edits page controls', () => {
  const dress = read('js/arcade-dress.mjs');
  assert.match(dress, /new MutationObserver\(read\)\.observe\(progress/);
  assert.doesNotMatch(dress, /\.value = |\.disabled = |dispatchEvent/);
  for (const fn of ['demoTitle', 'burst']) assert.match(read('js/arcade.mjs'), new RegExp(`export function ${fn}\\(`));
});
