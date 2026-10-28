import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pages = [
  'welcome/index.html', 'globe/index.html', 'tools/index.html', 'profile/index.html', 'audio/index.html', 'pixel-camera.html',
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


test('portal home and Explore provide their own five-destination navigation', async () => {
  const destinations = [['/', 'ホーム'], ['/explore/', '探す'], ['/tools/', 'つくる'], ['/globe/', '地図'], ['/profile/', '自分']];
  for (const [path, activePath] of [['index.html', '/'], ['explore/index.html', '/explore/']]) {
    const html = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    assert.match(html, path === 'index.html' ? /<body class="home-portal">/ : /<body data-social-page="explore">/, path);
    for (const [href, label] of destinations) {
      assert.ok(html.includes(`href="${href}"`), `${path}: ${href}`);
      assert.ok(html.includes(`>${label}</span></a>`), `${path}: ${label} label`);
    }
    const current = html.match(/class="(?:mobile-nav__item|rail-link)[^"]*is-current[^"]*"[^>]*href="([^"]+)"/)
      || html.match(/class="(?:mobile-nav__item|rail-link)[^"]*"[^>]*href="([^"]+)"[^>]*aria-current="page"/);
    assert.ok(current, `${path}: current destination is marked`);
    assert.equal(current[1], activePath);
  }
});
