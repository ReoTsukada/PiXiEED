import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const labels = (nav) => [...nav.matchAll(/<a\b[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

// Every page: 地球儀 and 撮影 always there, the centre is the page's own main action, then ツール and マイページ.
// Home is the PiXiEED logo in the header, not a tab.
test('site pages: globe, shoot, page action, tools, my page — the logo goes home', () => {
  const app = read('js/app.js');
  const nav = app.match(/tabs\.innerHTML = `([^`]*)`/)[1];
  assert.deepEqual(labels(nav), ['地球儀', '撮影', 'ツール', 'マイページ']);
  assert.match(nav, /aria-label="地球儀"[\s\S]*aria-label="撮影"[\s\S]*\$\{contextAction\}[\s\S]*aria-label="ツール"/);
  assert.doesNotMatch(nav, /aria-label="ホーム"/);
  assert.match(app, /brandLink\.setAttribute\('href', '\/'\)/);
  assert.match(app, /const contextAction = actions\[page\] \|\| '<a href="\/globe\/\?post=1"/);
});

test('camera pages: the same tabs with the shutter in the centre', () => {
  for (const file of ['pixel-camera.html', 'pixel-camera-studio.html']) {
    const nav = read(file).match(/<nav class="app-tabs pc-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual(labels(nav), ['地球儀', '撮影', 'ツール', 'マイページ'], file);
    assert.match(nav, /aria-label="撮影" aria-current="page"/, file);
    assert.match(nav, /aria-label="撮影"[^>]*>[\s\S]*?data-action="capture"[\s\S]*?aria-label="ツール"/, file);
  }
});
