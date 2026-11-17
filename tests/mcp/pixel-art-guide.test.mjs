import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_VERSION, PIXEL_ART_GUIDE_INPUT_SCHEMA, getPixelArtGuide } from '../../js/mcp/pixel-art-guide.mjs';

test('routes subject-specific advice without leaking unrelated subject detail', () => {
  const character = getPixelArtGuide({ subject: 'character', width: 16, height: 16 });
  const food = getPixelArtGuide({ subject: 'food', width: 16, height: 16 });
  assert.ok(character.steps.some((step) => step.id === 'character'));
  assert.ok(!character.steps.some((step) => step.id === 'food'));
  assert.ok(food.steps.some((step) => step.id === 'food'));
  assert.ok(!food.steps.some((step) => step.id === 'character'));
  assert.match(food.steps.find((step) => step.id === 'food').body, /均一な円で並べず、参考写真で遮蔽や支持を確かめます/);
});

test('small dimensions emphasize selection while larger dimensions retain the same principles', () => {
  const small = getPixelArtGuide({ subject: 'character', width: 16, height: 16 });
  const large = getPixelArtGuide({ subject: 'character', width: 64, height: 64 });
  assert.ok(small.steps.some((step) => step.id === 'small-canvas' && /1pxの変化/.test(step.body)));
  assert.ok(large.steps.some((step) => step.id === 'large-canvas' && /細部を均一に増やさず/.test(step.body)));
  const narrow = getPixelArtGuide({ subject: 'other', width: 1, height: 64 });
  assert.ok(!narrow.steps.some((step) => step.id === 'small-canvas'));
  assert.ok(narrow.steps.some((step) => step.id === 'narrow-canvas'));
  assert.match(small.steps.find((step) => step.id === 'character').body, /識別に効く特徴/);
  assert.match(small.steps.find((step) => step.id === 'detail').body, /誇張/);
  assert.equal(large.steps.find((step) => step.id === 'detail').body, small.steps.find((step) => step.id === 'detail').body);
  assert.match(large.limitations.join(' '), /創作上の推奨サイズや品質基準ではありません/);
});

test('guide links observed references, structure, material diagnosis, and native comparison without prescribing a recipe', () => {
  const guide = getPixelArtGuide({ subject: 'other', width: 64, height: 64, materials: ['organic'] });
  const ids = guide.steps.map(({ id }) => id);
  assert.ok(ids.indexOf('references') < ids.indexOf('method-order'));
  assert.ok(ids.indexOf('method-order') < ids.indexOf('large-forms'));
  const method = guide.steps.find(({ id }) => id === 'method-order').body;
  assert.match(method, /支持・負の形/);
  assert.match(method, /明暗面と必要な反射/);
  assert.match(method, /材質を見分ける特徴/);
  assert.match(method, /固定テンプレートにせず/);
  assert.match(guide.reviewChecklist.join(' '), /題材と用途に役立つかを原寸で比較/);
});

test('adds each selected material module and normalizes defaults', () => {
  const guide = getPixelArtGuide({ subject: 'object', width: 24, height: 32, materials: ['metal', 'glass', 'cloth'] });
  assert.deepEqual(guide.request, { subject: 'object', width: 24, height: 32, materials: ['metal', 'glass', 'cloth'], animated: false, normalMap: false, style: 'neutral' });
  assert.deepEqual(guide.steps.filter((step) => step.id.startsWith('material-')).map((step) => step.id), ['material-metal', 'material-glass', 'material-cloth']);
  assert.deepEqual(PIXEL_ART_GUIDE_INPUT_SCHEMA.properties.materials.items.enum, ['cloth', 'metal', 'glass', 'organic', 'stone']);
  assert.ok(getPixelArtGuide({ subject: 'other', width: 8, height: 8, materials: ['stone'] }).steps.some((step) => step.id === 'material-stone'));
  assert.match(getPixelArtGuide({ subject: 'other', width: 8, height: 8, materials: ['organic'] }).steps.find((step) => step.id === 'material-organic').body, /葉・毛など/);
});

test('animation and normal map guidance state current MCP transfer limits and preserve process order', () => {
  const guide = getPixelArtGuide({ subject: 'other', width: 8, height: 8, normalMap: true });
  assert.ok(guide.steps.some((step) => step.id === 'normal-map'));
  const animated = getPixelArtGuide({ subject: 'other', width: 8, height: 8, animated: true });
  assert.ok(animated.limitations.some((line) => /単一の静止カラー画像です。アニメーションや法線マップの編集・転送機能はありません/.test(line)));
  assert.ok(guide.limitations.some((line) => /単一の静止カラー画像です。アニメーションや法線マップの編集・転送機能はありません/.test(line)));
  for (const result of [guide, animated]) {
    const ids = result.steps.map((step) => step.id);
    assert.ok(ids.indexOf('references') < ids.indexOf('large-forms'));
    assert.ok(ids.indexOf('palette-light') < ids.indexOf('detail'));
    assert.equal(ids.at(-1), 'review');
  }
});

test('provides public sources and separates technical, expressive, and user acceptance checks', () => {
  const guide = getPixelArtGuide({ subject: 'scene', width: 32, height: 24, animated: true });
  assert.equal(guide.guideVersion, GUIDE_VERSION);
  assert.ok(guide.steps.some((step) => step.id === 'animation'));
  assert.ok(guide.reviewChecklist.some((line) => /技術的な作成可否、表現の採用、依頼者の受け入れ/.test(line)));
  assert.ok(guide.sources.every((source) => source.url.startsWith('https://')));
  assert.ok(guide.sources.some((source) => source.url === 'https://saint11.art/blog/thoughts_on_low_resolution/'));
  assert.ok(guide.sources.some((source) => source.url === 'https://www.androidarts.com/pixtut/pixelart.htm'));
  assert.ok(guide.limitations.some((line) => /商業作品に共通する公式ルールではありません/.test(line)));
  const nextGuide = getPixelArtGuide({ subject: 'scene', width: 32, height: 24, animated: true });
  assert.notEqual(guide.sources, nextGuide.sources);
  assert.notEqual(guide.sources[0], nextGuide.sources[0]);
  const publicText = JSON.stringify(guide);
  assert.doesNotMatch(publicText, /Users\/|tsukadareine|traveler-16|x16,y19/);
});

test('exports strict schema and rejects malformed, unknown, duplicate, and oversized inputs', () => {
  assert.equal(PIXEL_ART_GUIDE_INPUT_SCHEMA.additionalProperties, false);
  assert.equal(PIXEL_ART_GUIDE_INPUT_SCHEMA.properties.expression.additionalProperties, false);
  assert.deepEqual(PIXEL_ART_GUIDE_INPUT_SCHEMA.required, ['subject', 'width', 'height']);
  assert.throws(() => getPixelArtGuide(null), TypeError);
  assert.throws(() => getPixelArtGuide({ subject: 'fruit', width: 8, height: 8 }), /subject/);
  assert.throws(() => getPixelArtGuide({ subject: 'other', width: 65, height: 1 }), /width/);
  assert.throws(() => getPixelArtGuide({ subject: 'other', width: 1.5, height: 1 }), /width/);
  assert.throws(() => getPixelArtGuide({ subject: 'other', width: 1, height: 1, extra: true }), /未対応/);
  assert.throws(() => getPixelArtGuide({ subject: 'other', width: 1, height: 1, materials: ['cloth', 'cloth'] }), /materials/);
  assert.throws(() => getPixelArtGuide({ subject: 'other', width: 1, height: 1, materials: ['cloth', 'metal', 'glass', 'organic', 'stone'] }), /materials/);
  const sparseMaterials = new Array(1);
  assert.throws(() => getPixelArtGuide({ subject: 'other', width: 1, height: 1, materials: sparseMaterials }), TypeError);
  assert.throws(() => getPixelArtGuide({ subject: 'other', width: 1, height: 1, animated: 'yes' }), /boolean/);
});

test('keeps expression optional and inserts conditional guidance before large forms when supplied', () => {
  const withoutExpression = getPixelArtGuide({ subject: 'other', width: 24, height: 24 });
  assert.ok(!Object.hasOwn(withoutExpression.request, 'expression'));
  const withExpression = getPixelArtGuide({ subject: 'other', width: 24, height: 24, expression: { projection: 'isometric' } });
  assert.equal(withExpression.request.expression.purpose, 'auto');
  const ids = withExpression.steps.map(({ id }) => id);
  assert.ok(ids.indexOf('expression') < ids.indexOf('large-forms'));
  assert.equal(ids.filter((id) => id === 'technique-selection').length, 1);
});

test('normalizes style and reference observations in the request while keeping references out of learning sources', () => {
  const input = {
    subject: 'object', width: 32, height: 24, style: 'haikara',
    referenceStyle: {
      status: 'observed', summary: '青緑の面と暖色の小さなアクセント。', palette: ['#0a8899', '#FFCC00'],
      mood: '軽やか', lighting: '上から柔らかい光', edges: '輪郭は部分的', shading: '大きな面で整理', detail: '細かな模様は控えめ'
    }
  };
  const guide = getPixelArtGuide(input);
  assert.equal(guide.request.style, 'haikara');
  assert.deepEqual(guide.request.referenceStyle.palette, ['#0A8899', '#FFCC00']);
  const style = guide.steps.find((step) => step.id === 'style');
  const reference = guide.steps.find((step) => step.id === 'reference-style');
  assert.match(style.body, /32×24px/);
  assert.match(reference.body, /青緑の面と暖色の小さなアクセント/);
  assert.match(reference.body, /画風プリセットの既定より優先/);
  assert.match(reference.body, /ユーザーの明示寸法や明示要望はさらに優先/);
  assert.match(reference.body, /MCPが画像を解析・検証した結果ではありません/);
  assert.ok(guide.limitations.some((line) => /observedはホストAIによる申告/.test(line)));
  assert.ok(guide.sources.every((source) => !JSON.stringify(source).includes('青緑の面')));
});

test('described-only reference is not treated as visually inspected and no reference keeps only the preset step', () => {
  const described = getPixelArtGuide({ subject: 'other', width: 16, height: 16, style: 'modern', referenceStyle: { status: 'described_only', summary: '暖色中心で柔らかな雰囲気。' } });
  assert.match(described.steps.find((step) => step.id === 'reference-style').body, /画像の実見は未確認です/);
  assert.ok(described.limitations.some((line) => /described_onlyでは画像の実見を確認していません/.test(line)));
  const presetOnly = getPixelArtGuide({ subject: 'other', width: 16, height: 16, style: 'nostalgic_rpg' });
  assert.ok(presetOnly.steps.some((step) => step.id === 'style'));
  assert.ok(!presetOnly.steps.some((step) => step.id === 'reference-style'));
});
