import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNIQUES, selectPixelArtTechniques } from '../../js/mcp/pixel-art-techniques.mjs';
import { getPixelArtGuide } from '../../js/mcp/pixel-art-guide.mjs';

test('provides twelve conditional technique records and separates accepted from comparison evidence', () => {
  assert.equal(TECHNIQUES.length, 12);
  for (const technique of TECHNIQUES) {
    assert.ok(technique.id && technique.title && technique.appliesWhen && technique.avoidWhen);
    assert.ok(technique.steps.length && technique.checks.length && technique.sourceUrls.length);
    assert.ok(Array.isArray(technique.caseIds));
  }
  const selected=selectPixelArtTechniques({subject:'other',width:64,height:64,materials:['organic']});
  assert.ok(selected.every(t=>Array.isArray(t.caseIds)&&Array.isArray(t.comparisonCaseIds)));
  assert.deepEqual(selected.find(t=>t.id==='natural-clusters').caseIds,['animal-64']);
  assert.ok(selected.some(t=>t.comparisonCaseIds.length>0));
  assert.ok(selected.every(t=>t.comparisonCaseIds.every(id=>id!=='animal-64')));
  assert.ok(TECHNIQUES.every(({ sourceUrls }) => sourceUrls.every((url) => [
    'https://www.androidarts.com/pixtut/pixelart.htm', 'https://saint11.art/blog/thoughts_on_low_resolution/'
  ].includes(url))));
});

test('selection responds to relevant material and expression conditions and stays bounded', () => {
  const unspecified = selectPixelArtTechniques({ subject: 'other', width: 32, height: 32, materials: [] }).map(({ id }) => id);
  const emptyExpression = selectPixelArtTechniques({ subject: 'other', width: 32, height: 32, materials: [], expression: {} }).map(({ id }) => id);
  assert.deepEqual(unspecified, emptyExpression);
  assert.ok(!unspecified.includes('lighting-markings'));
  assert.ok(!unspecified.includes('contour-banding'));
  const metal = selectPixelArtTechniques({ subject: 'object', width: 32, height: 32, materials: ['metal'] });
  assert.ok(metal.some(({ id }) => id === 'reflective-metal'));
  assert.ok(!metal.some(({ id }) => id === 'transparency-edges'));
  const emissive = selectPixelArtTechniques({ subject: 'scene', width: 32, height: 32, materials: [], expression: { lighting: 'emissive' } });
  assert.ok(emissive.some(({ id }) => id === 'emissive-core'));
  assert.ok(emissive.some(({ id }) => id === 'depth-focus'));
  assert.ok(emissive.length <= 6);
  assert.ok(selectPixelArtTechniques({ subject: 'other', width: 8, height: 8 }).some(({ id }) => id === 'microdetail-contrast'));
  const transparency = TECHNIQUES.find(({ id }) => id === 'transparency-edges');
  assert.match(transparency.checks[0], /予定した背景/);
  assert.match(transparency.checks[0], /汎用素材として使う場合/);
  const organic = selectPixelArtTechniques({ subject: 'other', width: 64, height: 64, materials: ['organic'] });
  assert.ok(organic.find(({ id }) => id === 'natural-clusters').caseIds.includes('animal-64'));
});

test('guide exposes one selection step and a post-production review item without changing top-level shape', () => {
  const guide = getPixelArtGuide({ subject: 'object', width: 24, height: 24, materials: ['glass'] });
  const selection = guide.steps.find(({ id }) => id === 'technique-selection');
  assert.ok(selection);
  assert.match(selection.body, /選択ID:/);
  assert.match(selection.body, /原寸で違いを確かめてから採用/);
  assert.ok(guide.reviewChecklist.some((item) => /選んだ技法が題材と用途に役立つか/.test(item)));
  assert.deepEqual(Object.keys(guide).sort(), ['guideVersion', 'limitations', 'request', 'reviewChecklist', 'sources', 'steps'].sort());
});
