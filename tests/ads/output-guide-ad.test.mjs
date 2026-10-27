import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isOutputGuideAdEligible, resolveOutputGuideAd, OUTPUT_GUIDE_CANONICAL, mountOutputGuideAd }
  from '../../js/ads/output-guide-ad.mjs';
const allowed = { origin: 'https://pixieed.jp', pathname: '/output/', search: '',
  topLevel: true, marker: 'guide-v1', privateContext: false };
const config = { enabled: true, unit: { verifiedActive: true, format: 'display',
  placement: 'inline', size: 'responsive', client: 'ca-pub-9801602250480253', slot: '4842737836' } };

test('only production public guide aliases pass', () => {
  assert.equal(isOutputGuideAdEligible(allowed), true);
  assert.equal(isOutputGuideAdEligible({ ...allowed, origin: 'https://www.pixieed.jp' }), true);
  assert.equal(isOutputGuideAdEligible({ ...allowed, pathname: '/output/index.html' }), true);
});
for (const origin of ['http://pixieed.jp', 'http://localhost:4173', 'https://preview.pixieed.jp',
  'https://pixieed.jp.evil.test', 'https://pixieed.jp:444', 'file://']) {
  test(`no requests allowed on ${origin}`, () => assert.equal(isOutputGuideAdEligible({ ...allowed, origin }), false));
}
for (const pathname of ['/output/work/', '/output/start/', '/output/work/index.html', '/output',
  '/output//', '/draw/', '/output/../output/']) {
  test(`not an advertising guide: ${pathname}`, () => assert.equal(isOutputGuideAdEligible({ ...allowed, pathname }), false));
}
for (const search of ['?id=private', '?preview=1', '?workspace=1', '?utm_source=example']) {
  test(`query-bearing requests fail closed: ${search}`, () => assert.equal(isOutputGuideAdEligible({ ...allowed, search }), false));
}
test('framed/editor/unmarked contexts fail closed', () => {
  for (const patch of [{ topLevel: false }, { privateContext: true }, { marker: '' }]) {
    assert.equal(isOutputGuideAdEligible({ ...allowed, ...patch }), false);
  }
  assert.equal(isOutputGuideAdEligible(), false);
  assert.equal(mountOutputGuideAd({ doc: null, win: null }).mounted, false);
});
test('only the configured active responsive display unit resolves', () => {
  assert.deepEqual(resolveOutputGuideAd(config), { client: config.unit.client, slot: config.unit.slot });
  assert.equal(resolveOutputGuideAd({ ...config, enabled: false }), null);
  for (const patch of [{ verifiedActive: false }, { format: 'rewarded' }, { placement: 'gutter' },
    { size: 'auto' }, { client: 'example' }, { slot: '' }, { slot: 'not-an-id' }]) {
    assert.equal(resolveOutputGuideAd({ ...config, unit: { ...config.unit, ...patch } }), null);
  }
  assert.equal(resolveOutputGuideAd(), null);
});
test('canonical share link never includes a private workspace ID', () => {
  assert.equal(OUTPUT_GUIDE_CANONICAL, 'https://pixieed.jp/output/');
});
test('HTML has one labelled ad, no inline vendor request, and all existing limit disclosures', async () => {
  const html = await readFile(new URL('../../output/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/\sdata-output-guide-ad\s/g) || []).length, 1);
  assert.match(html, /data-output-guide-ad aria-label="広告" hidden/);
  assert.match(html, /rel="canonical" href="https:\/\/pixieed.jp\/output\/"/);
  assert.doesNotMatch(html, /<script[^>]*src="https:\/\/pagead2/);
  for (const text of ['120秒以内', 'MP3・FLAC出力は未対応', '800万画素', '元動画の音声は含みません']) {
    assert.ok(html.includes(text), `preserve: ${text}`);
  }
  assert.match(html, /location\.replace\(`\/output\/work\/\?id=/);
  assert.equal((html.match(/\sdata-output-start/g) || []).length, 2);
});
