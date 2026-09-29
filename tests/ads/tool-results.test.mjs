import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveDisplayAd } from '../../js/display-ads.mjs';
import { displayAdConfig } from '../../data/site-config.js';
const results = [
  ['camera-result', '/pixel-camera.html'], ['draw-result', '/draw/'], ['audio-result', '/audio/'],
  ['jigsaw-result', '/jigsaw/'], ['spot-result', '/play/spot-difference/'], ['find-result', '/play/hidden-object/']
];
test('result units use the owner-provided results unit and stay restricted to their own tool', () => {
  const config = { client: displayAdConfig.client, slots: Object.fromEntries(results.map(([key]) => [key, '1234567890'])) };
  for (const [key, path] of results) {
    assert.deepEqual(resolveDisplayAd(displayAdConfig, key, path), { client: 'ca-pub-9801602250480253', slot: '2995020884' });
    assert.equal(resolveDisplayAd({ ...displayAdConfig, slots: {} }, key, path), null);
    assert.ok(resolveDisplayAd(config, key, path));
    for (const [, other] of results) if (other !== path) assert.equal(resolveDisplayAd(config, key, other), null);
    for (const other of ['/globe/', '/profile/', '/privacy/']) assert.equal(resolveDisplayAd(config, key, other), null);
  }
});
test('section-root ad mounting uses its document for DOM creation and visibility', async () => {
  const source = await readFile(new URL('../../js/display-ads.mjs', import.meta.url), 'utf8');
  assert.match(source, /root.ownerDocument \|\| root/);
  assert.match(source, /doc.createElement\('ins'\)/);
  assert.match(source, /doc.visibilityState === 'hidden'/);
});
test('results are flow content, not a modal, and keep public puzzles display-only', async () => {
  const source = await readFile(new URL('../../js/tool-result-view.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /showModal|\.download\s*=|toDataURL|toBlob/);
  assert.match(source, /context.drawImage\(preview/);
  assert.match(source, /marker.replaceWith\(node\)/);
  assert.match(source, /removeEventListener\('click', interceptNav, true\)/);
  const css = await readFile(new URL('../../css/tool-result-view.css', import.meta.url), 'utf8');
  assert.match(css, /margin-block: 160px 0/);
  assert.match(css, /min-height: 48px/);
});
