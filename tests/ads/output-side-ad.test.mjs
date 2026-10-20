import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  OUTPUT_SIDE_AD_LIVE_ENABLED, OUTPUT_SIDE_AD_METRICS, outputSideAdPlacement,
  outputSideAdPreviewMode, outputSideAdRequestedSize
} from '../../js/ads/output-side-ad.mjs';

const desktop = {
  viewportWidth: 1920, viewportHeight: 1080,
  main: { left: 320, top: 65, right: 1600, bottom: 1200 }, headerBottom: 65
};
const centered = (viewportWidth, viewportHeight = 1080) => {
  const left = (viewportWidth - 1280) / 2;
  return { viewportWidth, viewportHeight, main: { left, top: 65, right: left + 1280, bottom: 1200 }, headerBottom: 65 };
};

test('uses exact 160×600 or 300×600 units plus a 21px label', () => {
  assert.equal(OUTPUT_SIDE_AD_METRICS.unitHeight, 600);
  assert.equal(OUTPUT_SIDE_AD_METRICS.labelHeight, 21);
  assert.deepEqual(outputSideAdPlacement(desktop), {
    left: 1648, top: 113, right: 1808, bottom: 734, width: 160, height: 621
  });
  assert.deepEqual(outputSideAdPlacement({ ...desktop, viewportWidth: 2560, main: { ...desktop.main, left: 640, right: 1920 } }), {
    left: 1968, top: 113, right: 2268, bottom: 734, width: 300, height: 621
  });
});

test('auto selects the largest fixed size that fits at the 1743/1744 and 2023/2024 thresholds', () => {
  assert.equal(outputSideAdPlacement(centered(1743)), null);
  assert.equal(outputSideAdPlacement(centered(1744))?.width, 160);
  assert.equal(outputSideAdPlacement(centered(2023))?.width, 160);
  assert.equal(outputSideAdPlacement(centered(2024))?.width, 300);
  assert.equal(outputSideAdPlacement({ ...centered(1920), adSize: '300x600' }), null);
  assert.equal(outputSideAdPlacement({ ...centered(1920), adSize: '160x600' })?.width, 160);
  assert.equal(outputSideAdPlacement({ ...centered(2560), adSize: '160x600' })?.width, 160);
  assert.equal(outputSideAdPlacement({ ...centered(2560), adSize: '300x600' })?.width, 300);
  assert.equal(outputSideAdPlacement({ ...desktop, adSize: '320x600' }), null);
});

test('requires the full 621px slot and 24px viewport clearance, without shrinking main', () => {
  assert.equal(outputSideAdPlacement({ ...desktop, ...centered(1920, 757) }), null);
  assert.equal(outputSideAdPlacement({ ...centered(1920, 758) })?.bottom, 734);
  assert.equal(outputSideAdPlacement({ ...desktop, main: { ...desktop.main, bottom: 733 } }), null);
  assert.equal(outputSideAdPlacement({ ...desktop, main: { ...desktop.main, bottom: 734 } })?.height, 621);
  assert.equal(outputSideAdPlacement({ ...desktop, overflowing: true }), null);
});

test('narrow and mobile layouts stay hidden when the fixed 160px width does not fit', () => {
  for (const width of [320, 390, 768, 1024, 1280, 1366, 1440, 1743]) {
    assert.equal(outputSideAdPlacement(centered(width)), null, `viewport ${width}px`);
  }
  assert.equal(outputSideAdPlacement({ ...desktop, viewportHeight: 200 }), null);
});

test('keeps the anchor at main.top + 48px and hides instead of re-anchoring around the header', () => {
  for (const top of [65, 90, 120]) {
    const placement = outputSideAdPlacement({ ...desktop, main: { ...desktop.main, top }, headerBottom: top });
    assert.equal(placement?.top, top + 48);
  }
  assert.equal(outputSideAdPlacement({ ...desktop, main: { ...desktop.main, top: 120 }, headerBottom: 130 }), null);
});

test('rejects pinch zoom and shifted visual viewports, and permits the ordinary viewport API fallback', () => {
  const ordinary = { scale: 1, offsetLeft: 0, offsetTop: 0, width: 1920, height: 1080 };
  assert.equal(outputSideAdPlacement({ ...desktop, visualViewport: { ...ordinary, scale: 1.5 } }), null);
  assert.equal(outputSideAdPlacement({ ...desktop, visualViewport: { ...ordinary, offsetLeft: 1 } }), null);
  assert.equal(outputSideAdPlacement({ ...desktop, visualViewport: { ...ordinary, height: 757 } }), null);
  assert.ok(outputSideAdPlacement({ ...desktop, visualViewport: ordinary }));
  assert.ok(outputSideAdPlacement(desktop));
});

test('interactive obstacles inside the safety gap veto the placement', () => {
  assert.equal(outputSideAdPlacement({ ...desktop, obstacles: [{ left: 1660, right: 1800, top: 500, bottom: 550 }] }), null);
  assert.equal(outputSideAdPlacement({ ...desktop, obstacles: [{ left: 1500, right: 1620, top: 150, bottom: 180 }] }), null);
  assert.equal(outputSideAdPlacement({ ...desktop, obstacles: [{ left: 1760, right: 1900, top: 650, bottom: 770 }] }), null, 'reward badge outer bounds');
  assert.ok(outputSideAdPlacement({ ...desktop, obstacles: [{ left: 1450, right: 1500, top: 400, bottom: 500 }] }));
  assert.equal(outputSideAdPlacement({ ...desktop, main: { ...desktop.main, right: NaN } }), null);
});

test('preview and adSize query values are explicit, unique, loopback-only, and leave live ads disabled', () => {
  assert.equal(OUTPUT_SIDE_AD_LIVE_ENABLED, false);
  const url = suffix => ({ href: `http://127.0.0.1:4198/output/work/?id=synthetic${suffix}` });
  assert.equal(outputSideAdRequestedSize(url('')), 'auto');
  assert.equal(outputSideAdRequestedSize(url('&adSize=')), null);
  assert.equal(outputSideAdRequestedSize(url('&adSize=160x600')), '160x600');
  assert.equal(outputSideAdRequestedSize(url('&adSize=300x600')), '300x600');
  assert.equal(outputSideAdRequestedSize(url('&adSize=wide')), null);
  assert.equal(outputSideAdRequestedSize(url('&adSize=160x600&adSize=300x600')), null);
  for (const mode of ['slot', 'delay', 'unfilled', 'failed', 'blocked']) {
    assert.equal(outputSideAdPreviewMode(url(`&adPreview=${mode}`)), mode);
  }
  for (const href of [
    'https://pixieed.jp/output/work/?adPreview=slot',
    'https://localhost.evil/output/work/?adPreview=slot',
    'file:///output/work/?adPreview=slot',
    'http://localhost/draw/?adPreview=slot',
    'http://localhost/output/work/?adPreview=slot&adPreview=delay',
    'http://localhost/output/work/?adPreview=off',
    'http://localhost/output/work/?adPreview=slot&adSize=wide',
    'http://localhost/output/work/?adPreview=slot&adSize=160x600&adSize=300x600'
  ]) assert.equal(outputSideAdPreviewMode({ href }), null);
});

test('preview adds no provider, ad unit, event, refresh, scroll, focus, transition or live configuration', async () => {
  const source = await readFile(new URL('../../js/ads/output-side-ad.mjs', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../css/output-side-ad.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\s|fetch\(|adsbygoogle|googletag|trackSiteEvent|scrollTo|scrollIntoView|\.focus\(|setInterval/);
  assert.doesNotMatch(css, /\btransition\s*:|\banimation\s*:|position:\s*(?:fixed|sticky)/);
});
