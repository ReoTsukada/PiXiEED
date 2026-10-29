import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_TOOL_CARDS } from '../../js/social/app.mjs?rev=20261029-explore-1';
import { getToolStartRoute } from '../../js/tool-start-routes.mjs?rev=20261024-all-tools-offerwall-1';

test('official social tool cards open new tool-start documents without editor-state parameters', () => {
  assert.deepEqual(OFFICIAL_TOOL_CARDS.map(({ id, href }) => [id, href]), [
    ['pixel-drawing', '/tools/start/draw/?social=1'],
    ['pixel-camera', '/tools/start/camera/?social=1'],
    ['pixel-audio', '/tools/start/audio/?social=1'],
    ['spot-difference', '/tools/start/spot-difference/?social=1']
  ]);
  for (const { href } of OFFICIAL_TOOL_CARDS) {
    const url = new URL(href, 'https://example.test');
    assert.ok(getToolStartRoute(url.pathname));
    assert.equal(url.searchParams.get('social'), '1');
    assert.equal(url.searchParams.has('workspace'), false);
    assert.equal(url.hash, '');
  }
});
