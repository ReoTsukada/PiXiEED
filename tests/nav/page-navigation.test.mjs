import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PAGE_DESTINATIONS, currentPageDestination, creationModeDestination } from '../../js/page-navigation.mjs';

test('all public menu destinations exist and include the prior direct feature entrances', () => {
  const links = PAGE_DESTINATIONS.flatMap(group => group.links);
  const hrefs = links.map(([href]) => href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const [href, label] of links) {
    const path = new URL(href, 'https://example.test').pathname;
    assert.ok(existsSync(new URL(`../../${path.slice(1)}${path.endsWith('/') ? 'index.html' : ''}`, import.meta.url)), `${label}: ${path}`);
  }
  for (const href of ['/', '/draw/', '/draw/?mode=camera', '/draw/?mode=audio', '/output/', '/jigsaw/', '/play/spot-difference/', '/play/hidden-object/', '/globe/', '/globe/?post=1', '/events/', '/stores/', '/books/', '/profile/', '/collection/', '/privacy/']) assert.ok(hrefs.includes(href), href);
  assert.ok(!hrefs.includes('/shops/'), 'retired shop invitation is not a public destination');
});

test('current destination distinguishes sibling modes and profile views, including legacy camera entrances', () => {
  const current = (path, mode) => currentPageDestination(`https://example.test${path}`, mode);
  assert.equal(current('/draw/?mode=camera&from=globe'), '/draw/?mode=camera');
  assert.equal(current('/draw/?mode=camera', 'audio'), '/draw/?mode=audio');
  assert.equal(current('/draw/index.html'), '/draw/');
  assert.equal(current('/audio/'), '/draw/?mode=audio');
  assert.equal(current('/pixel-camera.html'), '/draw/?mode=camera');
  assert.equal(current('/pixel-camera.html?standalone=1'), null);
  assert.equal(current('/profile/?view=likes&track=1'), '/profile/?view=likes');
  assert.equal(current('/globe/?post=1'), '/globe/?post=1');
  assert.equal(current('/globe/?art=abc'), '/globe/');
  assert.equal(current('/events/pixelween-2026/'), null, 'detail is not falsely described as the events index');
});

test('only same-origin plain mode destinations can switch a live project instead of navigating', () => {
  const location = 'https://example.test/draw/?pxd=current&pxdRevision=r';
  for (const mode of ['draw', 'camera', 'audio']) assert.equal(creationModeDestination(`/draw/${mode === 'draw' ? '' : `?mode=${mode}`}`, location), mode);
  for (const href of ['/draw/?pxd=other&mode=camera', '/draw/?mode=unknown', '/draw/#palette', '/audio/', 'https://other.test/draw/?mode=camera', '/globe/']) assert.equal(creationModeDestination(href, location), null, href);
});
