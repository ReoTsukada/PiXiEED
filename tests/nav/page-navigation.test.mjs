import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PAGE_DESTINATIONS, PUBLIC_NAV_ITEMS, currentPageDestination, currentPublicNavKey, creationModeDestination } from '../../js/page-navigation.mjs';
import { getToolStartRoute, legacyToolPath, TOOL_START_ROUTES, toolStartHref } from '../../js/tool-start-routes.mjs';

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
    const route = getToolStartRoute(path);
    const sourcePath = route?.sourcePath || `${path.slice(1)}${path.endsWith('/') ? 'index.html' : ''}`;
    assert.ok(existsSync(new URL(`../../${sourcePath}`, import.meta.url)), `${label}: ${path} -> ${sourcePath}`);
  }
  for (const href of ['/', '/tools/start/draw/', '/tools/start/camera/', '/tools/start/audio/', '/tools/start/convert/', '/tools/start/jigsaw/', '/play/spot-difference/', '/play/hidden-object/', '/explore/', '/globe/', '/globe/?post=1', '/events/', '/stores/', '/books/', '/profile/', '/collection/', '/privacy/']) assert.ok(hrefs.includes(href), href);
  assert.deepEqual(TOOL_START_ROUTES.map(({ id }) => id), ['draw', 'camera', 'audio', 'spot-difference', 'hidden-object', 'jigsaw', 'convert']);
  for (const id of ['spot-difference', 'hidden-object']) assert.ok(hrefs.includes(`/tools/start/${id}/`));
  assert.ok(!hrefs.includes('/pixiee-lens/'), 'retired PiXiEELENS is a compatibility entry, not a promoted destination');
  assert.ok(!hrefs.includes('/shops/'), 'retired shop invitation is not a public destination');
});

test('seven tool-start routes resolve legacy fresh links while preserving handoffs and play routes', () => {
  for (const route of TOOL_START_ROUTES) {
    assert.equal(toolStartHref(route.legacyPath), route.startPath);
    assert.equal(getToolStartRoute(route.startPath), route);
    assert.equal(legacyToolPath(route.startPath), route.legacyPath);
  }
  assert.equal(toolStartHref('/draw/?workspace=1&social=1'), '/tools/start/draw/?social=1');
  for (const href of [
    '/draw/?pxd=project&pxdRevision=revision',
    '/output/work/?id=opaque',
    '/camera/?from=globe',
    '/draw/#palette',
    '/play/spot-difference/',
    'https://other.example/draw/?workspace=1'
  ]) assert.equal(toolStartHref(href), href, href);
});

test('current destination distinguishes public tool routes, legacy editor modes, and profile views', () => {
  const current = (path, mode) => currentPageDestination(`https://example.test${path}`, mode);
  assert.equal(current('/draw/?mode=camera&from=globe'), '/tools/start/camera/');
  assert.equal(current('/draw/?mode=camera', 'audio'), '/tools/start/audio/');
  assert.equal(current('/draw/index.html'), '/tools/start/draw/');
  assert.equal(current('/camera/'), '/tools/start/camera/');
  assert.equal(current('/audio/'), '/tools/start/audio/');
  assert.equal(current('/pixel-camera.html'), '/tools/start/camera/');
  assert.equal(current('/tools/start/draw/'), '/tools/start/draw/');
  assert.equal(current('/spot-difference/?pxd=project'), '/tools/start/spot-difference/');
  assert.equal(current('/hidden-object/'), '/tools/start/hidden-object/');
  assert.equal(current('/jigsaw/?social=1'), '/tools/start/jigsaw/');
  assert.equal(current('/output/'), '/tools/start/convert/');
  assert.equal(current('/output/work/?id=opaque'), '/tools/start/convert/');
  assert.equal(current('/tools/start/convert/'), '/tools/start/convert/');
  assert.equal(current('/play/spot-difference/'), '/play/spot-difference/', 'public puzzle play remains a separate route');
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
