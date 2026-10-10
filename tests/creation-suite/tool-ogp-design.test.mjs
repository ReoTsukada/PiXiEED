import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_OGP_CARDS, TOOL_OGP_EXTRA_ICONS, toolOgpMarkup } from '../../scripts/lib/tool-ogp-design.mjs';

const expectedNames = ['draw', 'camera', 'audio', 'output', 'jigsaw', 'spot-game', 'find-game', 'globe', 'events', 'stores'];
const logoData = 'data:image/png;base64,logo';
const iconData = 'data:image/svg+xml,%3Csvg%3Eicon%3C/svg%3E';

test('the ten cards retain the simple catalog, route titles, and established line icon keys', () => {
  assert.deepEqual(TOOL_OGP_CARDS.map(({ name }) => name), expectedNames);
  assert.deepEqual(TOOL_OGP_CARDS.map(({ title }) => title), [
    'ドット絵を描く', '写真をドット絵に変換', '音をつくる', '画像・動画と音楽を合成',
    'ジグソーパズル', 'ドット絵間違い探し', 'ドット絵もの探し', '世界地図で作品を探す',
    'ドット絵イベント', '作品に会えるお店',
  ]);
  assert.deepEqual(Object.keys(TOOL_OGP_EXTRA_ICONS), ['output', 'camera', 'calendar', 'store']);
  assert.match(TOOL_OGP_EXTRA_ICONS.output, /M18 17V8L22 7V15/);
  assert.match(TOOL_OGP_EXTRA_ICONS.output, /<ellipse cx="17" cy="18" rx="1\.5" ry="1\.1"/);
  assert.match(TOOL_OGP_EXTRA_ICONS.output, /<ellipse cx="21" cy="16" rx="1\.5" ry="1\.1"/);
  assert.match(TOOL_OGP_EXTRA_ICONS.camera, /<rect x="3" y="7" width="18" height="13" rx="2"/);
  assert.match(TOOL_OGP_EXTRA_ICONS.camera, /<circle cx="12" cy="13" r="4"/);
  assert.match(TOOL_OGP_EXTRA_ICONS.camera, /M5\.5 10h1/);
  assert.match(TOOL_OGP_EXTRA_ICONS.store, /M8 21v-6h5v6M16 16h2v2h-2Z/);
  for (const [name, svg] of Object.entries(TOOL_OGP_EXTRA_ICONS)) {
    assert.match(svg, /^<svg[^>]+width="24"[^>]+height="24"/);
    assert.match(svg, /stroke="#0B232F" stroke-width="1\.8"/);
    assert.ok(TOOL_OGP_CARDS.some((card) => card.icon === name));
  }
});

test('markup keeps the original spacious paper card, simple title and icon tile', () => {
  for (const card of TOOL_OGP_CARDS) {
    const html = toolOgpMarkup(card, { logoData, iconData });
    assert.match(html, new RegExp(`data-ogp-card="${card.name}"`));
    assert.ok(html.includes(`>${card.title}</div>`));
    assert.match(html, /PIXEL CREATION STUDIO/);
    assert.match(html, /PiXi<b>EED<\/b>/);
    assert.match(html, /class="wordmark" data-ogp-bound="brand"/);
    assert.match(html, /class="tap-hint" data-ogp-bound="tap-hint">TAP TO START<\/div>/);
    assert.match(html, /width:1200px;height:630px/);
    assert.match(html, /right:105px;top:158px/);
    assert.match(html, /width:264px;height:264px/);
    assert.match(html, /width:150px;height:150px/);
    assert.match(html, /max-width:710px/);
    assert.match(html, /src="data:image\/svg\+xml,%3Csvg%3Eicon%3C\/svg%3E"/);
    assert.match(html, /src="data:image\/png;base64,logo"/);
    assert.doesNotMatch(html, /ここをタップ|scene-art|tile-label|arrowSvg/);
    assert.match(html, /\.tap-hint\{position:absolute;left:50%;bottom:72px;transform:translateX\(-50%\);margin:0;font:700 28px\/1\.2 ui-monospace,monospace;letter-spacing:\.08em;color:#185d78;white-space:nowrap;text-align:center\}/);
  }
});

test('markup escapes title, alt and data URI attributes and requires both images', () => {
  const card = { name: 'custom', title: '<作品&絵>', icon: 'camera', alt: 'A "quoted" <icon>' };
  const html = toolOgpMarkup(card, { logoData: 'data:image/png;base64,logo&x', iconData: 'data:image/svg+xml,<svg/>' });
  assert.match(html, /&lt;作品&amp;絵&gt;/);
  assert.match(html, /A &quot;quoted&quot; &lt;icon&gt;/);
  assert.match(html, /data:image\/png;base64,logo&amp;x/);
  assert.match(html, /data:image\/svg\+xml,&lt;svg\/&gt;/);
  assert.throws(() => toolOgpMarkup(card, { iconData }), /logoData image data URI/);
  assert.throws(() => toolOgpMarkup(card, { logoData }), /iconData image data URI/);
  assert.throws(() => toolOgpMarkup(card, { logoData: 'not-image', iconData }), /logoData image data URI/);
});
