import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const source = read('js/tool-shell.mjs');
const copy = runInNewContext('(' + source.match(/const copy = ([\s\S]*?)\[mode\];/)[1] + ')');

test('each mode keeps the same purpose before and after JavaScript initialization', () => {
  for (const mode of ['draw', 'camera', 'audio']) {
    const html = read(mode + '/index.html');
    const text = (tag, marker) => html.match(new RegExp(`<${tag}[^>]*${marker}[^>]*>([^<]+)</${tag}>`))[1];
    assert.equal(copy[mode].documentTitle, html.match(/<title>([^<]+)<\/title>/)[1], mode);
    assert.equal(copy[mode].title, text('h1', 'data-shell-title'), mode);
    assert.equal(copy[mode].lead, text('p', 'data-shell-lead'), mode);
    assert.equal(copy[mode].workspace.replace(/\.$/, '。'), text('p', 'data-shell-workspace-copy'), mode);
    assert.equal(copy[mode].workspaceTitle, text('h2', 'id="tool-embed-title"'), mode);
    assert.ok(html.includes(`data-tool-mode="${mode}"`));
    assert.ok(html.includes(`rel="canonical" href="https://pixieed.jp/${mode}/"`));
    assert.equal((html.match(/data-embed-start\b/g) || []).length, 1);
  }
});

test('purpose metadata and direct-use links describe existing modes without a separate GIF page', () => {
  for (const mode of ['draw', 'camera', 'audio']) {
    const html = read(mode + '/index.html');
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    const description = html.match(/name="description" content="([^"]+)"/)[1];
    for (const attribute of ['property="og:title"', 'name="twitter:title"']) {
      assert.ok(html.includes(`${attribute} content="${title}"`));
    }
    for (const attribute of ['property="og:description"', 'name="twitter:description"']) {
      assert.ok(html.includes(`${attribute} content="${description}"`));
    }
    for (const entry of ['welcome/index.html', 'tools/index.html']) {
      assert.ok(read(entry).includes(`href="/${mode}/?workspace=1"`));
    }
  }
  assert.doesNotMatch(read('welcome/index.html') + read('index.html') + read('tools/index.html'), /href="\/gif(?:[/?#"])/);
  assert.match(read('audio/index.html'), /音声ファイルを保存してから<a href="\/output\/">/);
});
