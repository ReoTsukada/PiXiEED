import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const pages = [
  'index.html', 'home/index.html', 'tools/index.html', 'profile/index.html', 'audio/index.html', 'pixel-camera.html',
  'draw/index.html', 'jigsaw/index.html', 'spot-difference/index.html',
  'hidden-object/index.html', 'pixfind/index.html', 'game/index.html',
  'globe-prototype.html', 'about/index.html', 'privacy/index.html', 'guide/index.html',
  'stores/index.html', 'collection/index.html', '404.html'
];

test('shared pass header is loaded once by every requested public page', async () => {
  for (const path of pages) {
    const html = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    const loads = html.match(/<script\b[^>]*\bsrc=["'][^"']*\/js\/site-header\.mjs(?:\?[^"']*)?["'][^>]*>/gi) || [];
    assert.equal(loads.length, 1, `${path} should load the shared header module exactly once`);
    assert.match(loads[0], /type=["']module["']/i, `${path} must load the header as a module`);
  }
});

test('header, Audio, and Camera resolve the same pass module instance for same-tab notifications', async () => {
  const paths = ['js/site-header.mjs', 'js/creation/audio-page.mjs', 'js/pixel-lens/app.mjs'];
  const resolved = [];
  for (const path of paths) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    const match = source.match(/from\s+['"]([^'"]*pixieed-pass\.mjs(?:\?[^'"]*)?)['"]/);
    assert.ok(match, `${path} must import the canonical pass module`);
    resolved.push(new URL(match[1], pathToFileURL(new URL(`../../${path}`, import.meta.url).pathname)).href);
  }
  assert.deepEqual(resolved, [resolved[0], resolved[0], resolved[0]], 'different query versions create separate module singletons');
});
