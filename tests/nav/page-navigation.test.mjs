import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PAGE_DESTINATIONS, PUBLIC_NAV_ITEMS, currentPageDestination, currentPublicNavKey, creationModeDestination } from '../../js/page-navigation.mjs';

test('public navigation has five fixed destination links with route-based active state', () => {
  assert.deepEqual(PUBLIC_NAV_ITEMS.map(({ key, label, href }) => [key, label, href]), [
    ['home', 'ホーム', '/'],
    ['explore', '探す', '/explore/'],
    ['create', 'つくる', '/tools/'],
    ['map', '地図', '/globe/'],
    ['me', '自分', '/profile/'],
  ]);
  const current = path => currentPublicNavKey(`https://example.test${path}`);
  assert.equal(current('/'), 'home');
  assert.equal(current('/feed/?view=saved'), 'home');
  assert.equal(current('/explore/?q=cat'), 'explore');
  assert.equal(current('/works/sea-cat.html'), 'explore');
  assert.equal(current('/tools/'), 'create');
  assert.equal(current('/globe/?post=1'), 'map');
  assert.equal(current('/profile/?view=posts'), 'me');
  assert.equal(current('/draw/?workspace=1'), null, 'editor pages retain their own operation navigation');
});

test('all public menu destinations exist and include the prior direct feature entrances', () => {
  const links = PAGE_DESTINATIONS.flatMap(group => group.links);
  const hrefs = links.map(([href]) => href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const [href, label] of links) {
    const path = new URL(href, 'https://example.test').pathname;
    assert.ok(existsSync(new URL(`../../${path.slice(1)}${path.endsWith('/') ? 'index.html' : ''}`, import.meta.url)), `${label}: ${path}`);
  }
  for (const href of ['/', '/draw/', '/camera/', '/audio/', '/output/', '/jigsaw/', '/play/spot-difference/', '/play/hidden-object/', '/explore/', '/globe/', '/globe/?post=1', '/events/', '/stores/', '/books/', '/profile/', '/collection/', '/privacy/']) assert.ok(hrefs.includes(href), href);
  assert.ok(!hrefs.includes('/pixiee-lens/'), 'retired PiXiEELENS is a compatibility entry, not a promoted destination');
  assert.ok(!hrefs.includes('/shops/'), 'retired shop invitation is not a public destination');
});

test('current destination distinguishes public tool routes, legacy editor modes, and profile views', () => {
  const current = (path, mode) => currentPageDestination(`https://example.test${path}`, mode);
  assert.equal(current('/draw/?mode=camera&from=globe'), '/camera/');
  assert.equal(current('/draw/?mode=camera', 'audio'), '/audio/');
  assert.equal(current('/draw/index.html'), '/draw/');
  assert.equal(current('/camera/'), '/camera/');
  assert.equal(current('/audio/'), '/audio/');
  assert.equal(current('/pixel-camera.html'), '/camera/');
  assert.equal(current('/pixel-camera.html?standalone=1'), null);
  assert.equal(current('/profile/?view=likes&track=1'), '/profile/?view=likes');
  assert.equal(current('/globe/?post=1'), '/globe/?post=1');
  assert.equal(current('/globe/?art=abc'), '/globe/');
  assert.equal(current('/events/pixelween-2026/'), null, 'detail is not falsely described as the events index');
});

test('plain dedicated tool links and simple Draw mode links can switch a live project', () => {
  const location = 'https://example.test/draw/?pxd=current&pxdRevision=r';
  for (const mode of ['draw', 'camera', 'audio']) assert.equal(creationModeDestination(`/draw/${mode === 'draw' ? '' : `?mode=${mode}`}`, location), mode);
  assert.equal(creationModeDestination('/camera/', location), 'camera');
  assert.equal(creationModeDestination('/audio/', location), 'audio');
  for (const href of ['/draw/?pxd=other&mode=camera', '/draw/?mode=unknown', '/draw/#palette', '/camera/?from=menu', '/camera/#top', '/audio/?from=menu', '/audio/#top', 'https://other.test/draw/?mode=camera', '/globe/']) assert.equal(creationModeDestination(href, location), null, href);
});
