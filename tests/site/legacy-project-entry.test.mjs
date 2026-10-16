import test from 'node:test';
import assert from 'node:assert/strict';
import {
  legacyDrawRecoveryLinks,
  legacyPixfindGameUrl,
  resolveLegacyDrawEntry,
  resolveLegacyPixfindEntry,
} from '../../js/legacy-project-entry.mjs';

test('Draw redirects a clean legacy entry once and preserves tracking and known anchors', () => {
  assert.deepEqual(resolveLegacyDrawEntry({ search: '?utm_source=archive&ref=mail', hash: '#main' }), {
    action: 'redirect', reason: 'clean-entry', url: '/draw/?utm_source=archive&ref=mail#main',
  });
});

test('Draw forwards a direct PXD pointer without losing unknown tracking order or fragment', () => {
  const result = resolveLegacyDrawEntry({ search: '?pxd=work-7&pxdRevision=r3&utm_campaign=spring&x=1', hash: '#draw-canvas' });
  assert.equal(result.action, 'stay'); // An unknown query key makes the full state ambiguous.
  const supported = resolveLegacyDrawEntry({ search: '?pxd=work-7&pxdRevision=r3&utm_campaign=spring', hash: '#draw-canvas' });
  assert.equal(supported.url, '/draw/?pxd=work-7&pxdRevision=r3&utm_campaign=spring#draw-canvas');
});

test('Draw translates supported tool pointers and refuses unsupported or incomplete state', () => {
  assert.equal(resolveLegacyDrawEntry({ search: '?mode=audio&modeProjectTool=AUDIO&modePxd=a&modePxdRevision=b' }).url,
    '/draw/?mode=audio&modeProjectTool=audio&modePxd=a&modePxdRevision=b');
  assert.equal(resolveLegacyDrawEntry({ search: '?modeProjectTool=DRAW&modePxd=a&modePxdRevision=b' }).url,
    '/draw/?pxd=a&pxdRevision=b');
  assert.equal(resolveLegacyDrawEntry({ search: '?modeProjectTool=ANIMATE&modePxd=a&modePxdRevision=b' }).action, 'stay');
  assert.equal(resolveLegacyDrawEntry({ search: '?pxd=a' }).action, 'stay');
  assert.equal(resolveLegacyDrawEntry({ search: '?pxd=a&pxd=b&pxdRevision=r' }).action, 'stay');
  assert.equal(resolveLegacyDrawEntry({ search: '?project=old-123&new_project=1' }).action, 'stay');
  assert.equal(resolveLegacyDrawEntry({ search: '?utm_source=x', hash: '#unknown' }).action, 'stay');
  assert.equal(resolveLegacyDrawEntry({ search: '?mode=AUDIO', hash: '#main' }).url, '/draw/?mode=audio#main');
  assert.equal(resolveLegacyDrawEntry({ search: '?mode=DRAW&mode=AUDIO' }).action, 'stay');
});

test('Draw recovery link blocks current editor last-project fallback and retains original guide suffix', () => {
  const links = legacyDrawRecoveryLinks({ search: '?project=old-123&x=one&x=two', hash: '#legacy' });
  assert.match(links.draw, /^\/draw\/\?/);
  assert.match(links.draw, /pxd=legacy-state-unavailable/);
  assert.equal(links.guide, '/draw/about/?project=old-123&x=one&x=two#legacy');
});

test('PiXFiND routes recognized local drafts and historical typed IDs to their matching game', () => {
  assert.deepEqual(resolveLegacyPixfindEntry({ search: '?localHidden=draft-4' }), { action: 'redirect', mode: 'hidden-object', reason: 'local-draft' });
  assert.equal(resolveLegacyPixfindEntry({ search: '?puzzle=pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70' }).mode, 'spot-difference');
  assert.equal(resolveLegacyPixfindEntry({ hash: '#puzzle=pixfind-ho-a90bc7c5-e055-447c-b67f-d0b9fa61e3fa' }).mode, 'hidden-object');
  assert.equal(resolveLegacyPixfindEntry({ search: '?puzzle=pixfind-hidden-42' }).action, 'stay');
  assert.equal(resolveLegacyPixfindEntry({ search: '?postPuzzle=8f57d95e-16d7-4db2-9e44-0bd9a5a6c001&mode=hidden-object' }).mode, 'hidden-object');
  assert.equal(legacyPixfindGameUrl('spot-difference', { search: '?puzzle=pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70&keep=a&keep=b', hash: '#puzzle=pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70' }),
    '/play/spot-difference/?puzzle=pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70&keep=a&keep=b#puzzle=pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70');
});

test('PiXFiND keeps ambiguous IDs, public post IDs, conflicting modes, and creator states on the dual-game landing', () => {
  for (const location of [
    { search: '?puzzle=8f57d95e-16d7-4db2-9e44-0bd9a5a6c001' },
    { search: '?postPuzzle=8f57d95e-16d7-4db2-9e44-0bd9a5a6c001' },
    { search: '?localHidden=draft&localSpot=draft' },
    { search: '?localHidden=a&localHidden=b' },
    { search: '?localHidden=a&localSpot=b' },
    { search: '?localHidden=a&mode=spot-difference' },
    { search: '?localSpot=a', hash: '#puzzle=pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70' },
    { search: '?puzzle=pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70&mode=hidden-object' },
    { search: '?mode=hidden-object&creator=1' },
  ]) assert.equal(resolveLegacyPixfindEntry(location).action, 'stay', JSON.stringify(location));
});
