import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveDisplayAd } from '../../js/display-ads.mjs';
import { canMountToolResultAd, createOptionalImportGate } from '../../js/tool-result-view.mjs';
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
  assert.doesNotMatch(source, /import\s*\{[^}]*mountDisplayAds[^}]*\}\s*from\s*['"]\.\/display-ads\.mjs/);
  assert.match(source, /import\('\.\/display-ads\.mjs\?rev=20261007-lazy-ads-1'\)/);
  assert.match(source, /Promise\.resolve\(\)\.then\(loader\)\.catch\(\(\) => null\)/);
  assert.match(source, /!disposed && opened && !section\.hidden && currentAdEligible\.length > 0/);
  assert.match(source, /node\.dataset\.displayAd = key/);
  assert.match(source, /function updateAdReservation\(\)/);
  assert.match(source, /win\.addEventListener\('resize', onResize\)/);
  assert.match(source, /adRow\.hidden = true;[\s\S]*?removeProperty\('--px-tool-result-ad-reserved-height'\)/);
  assert.match(source, /if \(adRow\.querySelectorAll\('ins\.px-display-ad__unit'\)\.length > priorUnitCount && typeof cleanup === 'function'\)/);
  const showStart = source.indexOf('function show(');
  assert.ok(source.indexOf('if (disposed) return false;', showStart) < source.indexOf('beforeShow?.();', showStart));
  assert.doesNotMatch(source, /showModal|\.download\s*=|toDataURL|toBlob/);
  assert.match(source, /context.drawImage\(preview/);
  assert.match(source, /marker.replaceWith\(node\)/);
  assert.match(source, /removeEventListener\('click', interceptNav, true\)/);
  assert.match(source, /canMount: resultAdBudget/);
  assert.match(source, /max-height: 360px/);
  assert.match(source, /removeProperty\('--px-tool-result-nav-clearance'\)/);
  const css = await readFile(new URL('../../css/tool-result-view.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /margin-block:\s*160px/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /grid-template-rows: minmax\(0,1fr\) auto/);
  assert.match(css, /\.px-tool-result__ad-row\[data-reserved="true"\].*block-size: var\(--px-tool-result-ad-reserved-height/);
  assert.match(css, /\.px-tool-result__ad-row\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /min-height: 64px/);
  assert.match(css, /overflow: hidden !important/);
  assert.match(css, /@media \(max-height: 360px\)/);
  assert.match(css, /grid-template-columns: minmax\(0,1fr\) 64px minmax\(0,1fr\)/);
});

test('optional ad import failure is contained and never retried', async () => {
  let loads = 0, mounts = 0;
  const gate = createOptionalImportGate(async () => { loads++; throw new Error('blocked local module'); });
  await gate.schedule(() => true, () => mounts++);
  await gate.schedule(() => true, () => mounts++);
  assert.equal(loads, 1);
  assert.equal(mounts, 0);
});

test('a pending import cannot mount after close, and reopening mounts only the current view', async () => {
  let resolveModule, mounts = 0;
  const gate = createOptionalImportGate(() => new Promise((resolve) => { resolveModule = resolve; }));
  let open = true;
  const closedShow = gate.schedule(() => open, () => mounts++);
  await Promise.resolve();
  open = false; gate.cancel();
  resolveModule({});
  await closedShow;
  assert.equal(mounts, 0);

  open = true;
  const reopenedShow = gate.schedule(() => open, () => mounts++);
  await reopenedShow;
  assert.equal(mounts, 1);
});

test('dispose invalidates a pending import permanently', async () => {
  let resolveModule, mounts = 0;
  const gate = createOptionalImportGate(() => new Promise((resolve) => { resolveModule = resolve; }));
  const pending = gate.schedule(() => true, () => mounts++);
  await Promise.resolve();
  gate.dispose(); resolveModule({});
  await pending;
  await gate.schedule(() => true, () => mounts++);
  assert.equal(mounts, 0);
});
test('result ad preflight needs room for minimum content, the ad, and its separation gap', () => {
  assert.equal(canMountToolResultAd({ availableHeight: 400, contentMinHeight: 210, adHeight: 145, gap: 24 }), true);
  assert.equal(canMountToolResultAd({ availableHeight: 378, contentMinHeight: 210, adHeight: 145, gap: 24 }), false);
  assert.equal(canMountToolResultAd({ availableHeight: 500, contentMinHeight: 210, adHeight: 135, gap: 24 }), true);
  assert.equal(canMountToolResultAd({ availableHeight: 229, contentMinHeight: 64, adHeight: 135, gap: 24 }), true);
  assert.equal(canMountToolResultAd({ availableHeight: 222, contentMinHeight: 64, adHeight: 135, gap: 24 }), false);
  assert.equal(canMountToolResultAd({ availableHeight: NaN, contentMinHeight: 210, adHeight: 145 }), false);
});
