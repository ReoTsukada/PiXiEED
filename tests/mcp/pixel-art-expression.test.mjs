import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPRESSION_FIELDS, EXPRESSION_INPUT_SCHEMA, buildExpressionSteps, normalizeExpression } from '../../js/mcp/pixel-art-expression.mjs';
import { getPixelArtGuide } from '../../js/mcp/pixel-art-guide.mjs';

test('normalizes optional expression defaults and returns independent occupancy data', () => {
  assert.equal(normalizeExpression(undefined, 16, 16), undefined);
  const input = { purpose: 'sprite', occupancy: { width: 12, height: 10 }, background: '#aBcD00' };
  const expression = normalizeExpression(input, 64, 64);
  assert.deepEqual(expression, {
    purpose: 'sprite', projection: 'auto', form: 'auto', outline: 'auto', palette: 'auto', lighting: 'auto', detail: 'auto',
    occupancy: { width: 12, height: 10 }, background: '#ABCD00'
  });
  expression.occupancy.width = 1;
  assert.equal(input.occupancy.width, 12);
  assert.equal(EXPRESSION_INPUT_SCHEMA.additionalProperties, false);
  assert.equal(EXPRESSION_FIELDS.length, 7);
});

test('strictly validates enumerations, occupancy bounds and background color', () => {
  assert.throws(() => normalizeExpression({ extra: true }, 16, 16), /未対応/);
  assert.throws(() => normalizeExpression({ purpose: 'poster' }, 16, 16), /purpose/);
  assert.throws(() => normalizeExpression({ occupancy: { width: 12 } }, 16, 16), /height/);
  assert.throws(() => normalizeExpression({ occupancy: { width: 17, height: 8 } }, 16, 16), /キャンバス寸法/);
  assert.throws(() => normalizeExpression({ occupancy: { width: 1.5, height: 8 } }, 16, 16), /整数/);
  assert.throws(() => normalizeExpression({ background: 'red' }, 16, 16), /#RRGGBB/);
});

test('expression guidance preserves a small subject footprint inside the requested canvas', () => {
  const guide = getPixelArtGuide({ subject: 'character', width: 64, height: 64, expression: { purpose: 'sprite', occupancy: { width: 12, height: 12 } } });
  assert.deepEqual(guide.request.expression.occupancy, { width: 12, height: 12 });
  const step = guide.steps.find(({ id }) => id === 'expression-occupancy');
  assert.match(step.body, /キャンバス64×64px/);
  assert.match(step.body, /主役は約12×12px/);
  assert.match(step.body, /キャンバス拡大で置き換えず/);
  assert.ok(guide.steps.findIndex(({ id }) => id === 'expression') < guide.steps.findIndex(({ id }) => id === 'large-forms'));
  assert.ok(!('expression' in getPixelArtGuide({ subject: 'other', width: 16, height: 16 }).request));
});

test('automatic technique fields remain automatic rather than imposing a style recipe', () => {
  const expression = normalizeExpression({}, 16, 16);
  const texts = buildExpressionSteps(expression, 16, 16).map(({ body }) => body).join(' ');
  assert.match(texts, /autoは技法を固定しません/);
  assert.doesNotMatch(texts, /紫|輪郭を必ず|色数を[0-9]/);
  assert.match(texts, /視点: 自動/);
});

test('selected expression values use Japanese labels and give practical direction-specific cues', () => {
  const expression = normalizeExpression({ projection: 'side', form: 'stylized', palette: 'muted', lighting: 'emissive', detail: 'dense' }, 32, 32);
  const body = buildExpressionSteps(expression, 32, 32)[0].body;
  assert.match(body, /視点: 側面/);
  assert.match(body, /形の表現: デフォルメ/);
  assert.match(body, /色調: 落ち着いた/);
  assert.match(body, /部品の接合位置/);
  assert.match(body, /焦点に必要な色差/);
  assert.match(body, /発光の芯を明瞭にし、周囲へ回り込む光/);
  assert.match(body, /主役と補助情報の差/);
  assert.doesNotMatch(body, /side|stylized|muted|emissive|dense/);
  const isometric = buildExpressionSteps(normalizeExpression({ projection: 'isometric' }, 32, 32), 32, 32)[0].body;
  assert.match(isometric, /等角投影の軸と面の向きを全体で揃え/);
});

test('occupancy chooses small-subject guidance and detail techniques even on a 64px canvas', () => {
  const guide = getPixelArtGuide({subject:'character',width:64,height:64,expression:{occupancy:{width:12,height:12}}});
  assert.match(guide.steps.find(s=>s.id==='small-canvas').body,/主役の占有範囲12×12/);
  assert.equal(guide.steps.some(s=>s.id==='large-canvas'),false);
  assert.match(guide.steps.find(s=>s.id==='technique-selection').body,/microdetail-contrast/);
  const tile=getPixelArtGuide({subject:'scene',width:16,height:16,expression:{purpose:'tile'}});
  assert.match(tile.steps.find(s=>s.id==='expression').body,/繰り返して敷き/);
});
