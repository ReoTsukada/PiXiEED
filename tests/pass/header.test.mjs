import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pages = [
  'index.html', 'globe/index.html', 'tools/index.html', 'profile/index.html', 'audio/index.html', 'pixel-camera.html',
  'draw/index.html', 'jigsaw/index.html', 'spot-difference/index.html',
  'hidden-object/index.html', 'play/spot-difference/index.html', 'play/hidden-object/index.html', 'game/index.html',
  'globe-prototype.html', 'about/index.html', 'privacy/index.html', 'guide/index.html',
  'stores/index.html', 'collection/index.html', '404.html'
];

test('shared navigation header is loaded once by every requested public page', async () => {
  for (const path of pages) {
    const html = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    const loads = html.match(/<script\b[^>]*\bsrc=["'][^"']*\/js\/site-header\.mjs(?:\?[^"']*)?["'][^>]*>/gi) || [];
    assert.equal(loads.length, 1, `${path} should load the shared header module exactly once`);
    assert.match(loads[0], /type=["']module["']/i, `${path} must load the header as a module`);
  }
});

test('shared header does not depend on timed pass state or render legacy reward controls', async () => {
  const header = await readFile(new URL('../../js/site-header.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(header, /pixieed-pass|deriveHeaderPassState|passRemainingMs|data-pass-slot/);
  assert.match(header, /querySelectorAll\('\[data-header-pass\]'\)\.forEach\(\(button\) => button\.remove\(\)\)/);
});
