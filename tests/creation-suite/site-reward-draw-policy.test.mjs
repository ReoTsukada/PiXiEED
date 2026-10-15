import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteRewardDrawPolicy, countDrawRgbaColors, getDrawBonusColorKeys, preservesDrawBonusColorPixels } from '../../js/creation/site-reward-draw-policy.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs?rev=20261015-alpha-opacity-1';

const limits = Object.freeze({ colors: 32, rewardColors: 64, layers: 3, rewardLayers: 8, frames: 16, rewardFrames: 128 });

test('counts used RGBA values only; transparent, unused, and palette option slots do not count', () => {
  const palette = ['#ff0000', '#ff0000ff', '#00ff0080', '#00ff0000', '#abcdef'];
  assert.equal(countDrawRgbaColors(palette, [0, 1, 2, 3]), 2);
  assert.equal(countDrawRgbaColors(palette, [0, 1, 2, 3, 4]), 3);
  assert.equal(countDrawRgbaColors([...palette, ...Array(100).fill('#010203')], [0, 1, 2, 3, 4]), 3);
});

test('free limits are 32 used colors, 3 art layers, and 16 frames; reward expands colors to 64', () => {
  let active = false, asks = [];
  const policy = createSiteRewardDrawPolicy({ enabled: () => true, hasReward: () => active,
    requireReward: feature => { asks.push(feature); return false; }, limits });
  const lease = policy.capture('draw');
  assert.equal(policy.validate({ colors: 31, layers: 3, frames: 16 }, { colors: 32, layers: 3, frames: 16 }, { lease }).allowed, true);
  assert.equal(policy.validate({ colors: 32, layers: 3, frames: 16 }, { colors: 33, layers: 3, frames: 16 }, { lease }).allowed, false);
  const reward = createSiteRewardDrawPolicy({ enabled: () => true, hasReward: () => true, limits }).capture('draw');
  assert.equal(policy.validate({ colors: 32, layers: 3, frames: 16 }, { colors: 64, layers: 3, frames: 16 }, { lease: reward }).allowed, true);
  assert.equal(policy.validate({ colors: 64, layers: 3, frames: 16 }, { colors: 65, layers: 3, frames: 16 }, { lease: reward }).allowed, false);
  assert.equal(policy.validate({ colors: 32, layers: 3, frames: 16 }, { colors: 32, layers: 4, frames: 16 }, { lease }).allowed, false);
  assert.equal(policy.validate({ colors: 32, layers: 3, frames: 16 }, { colors: 32, layers: 3, frames: 17 }, { lease }).allowed, false);
  assert.equal(policy.validate({ colors: 33, layers: 3, frames: 16 }, { colors: 33, layers: 3, frames: 16 }, { lease }).allowed, true,
    'imported colors can remain intact when an edit does not add a new used RGBA');
  assert.deepEqual(asks, []);
});

test('bonus-color identity is RGBA based and stays locked across palette index remaps', () => {
  const palette = Array.from({ length: 34 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`);
  palette[33] = `${palette[0]}ff`;
  const bonus = getDrawBonusColorKeys(palette, Array.from({ length: 34 }, (_, index) => index), 32);
  assert.deepEqual(bonus, [`${palette[32]}ff`]);
  const remapped = [palette[32], ...palette.slice(0, 32)];
  assert.equal(preservesDrawBonusColorPixels(Uint8Array.of(33), Uint8Array.of(1), palette, remapped, bonus, { oneBased: true }), true,
    'moving the palette index while preserving RGBA is safe');
  assert.equal(preservesDrawBonusColorPixels(Uint8Array.of(33), Uint8Array.of(0), palette, palette, bonus, { oneBased: true }), false,
    'erasing a bonus pixel is denied');
  assert.equal(preservesDrawBonusColorPixels(Uint8Array.of(1), Uint8Array.of(33), palette, palette, bonus, { oneBased: true }), false,
    'painting a bonus color into a free pixel is denied');
  const alpha = ['#12345680', '#12345681', '#fedcba00'];
  assert.deepEqual(getDrawBonusColorKeys([...palette.slice(0, 31), ...alpha], [...Array(31).keys(), 31, 32, 33], 32), ['#12345681']);
});

test('captured reward lease lasts through an in-flight operation; limits apply only when enabled', () => {
  let active = true;
  const policy = createSiteRewardDrawPolicy({ enabled: () => true, hasReward: () => active, limits });
  const lease = policy.capture('draw');
  active = false;
  assert.equal(policy.validate({ colors: 32, layers: 3, frames: 16 }, { colors: 32, layers: 4, frames: 17 }, { lease }).allowed, true);
  const disabled = createSiteRewardDrawPolicy({ enabled: () => false, limits });
  assert.equal(disabled.validate({ colors: 32, layers: 3, frames: 16 }, { colors: 40, layers: 9, frames: 129 }).allowed, true);
});

test('prepared Draw document exposes and commits the exact validated timeline object', () => {
  const document = createDrawDocument(16);
  const session = createDrawAnimationSession(document);
  const before = session.animation;
  const nextDocument = { ...document, pixels: [...document.pixels] };
  nextDocument.pixels[0] = 2;
  const prepared = session.prepareDocument(nextDocument);
  assert.ok(prepared.animation);
  assert.equal(session.animation, before, 'the session stays unchanged while the candidate is only prepared');
  assert.notEqual(prepared.animation, before);
  prepared();
  assert.equal(session.snapshot().timeline.current, prepared.animation);
});

test('Draw routes guard transaction/history, camera, settings, and shared music before mutation', async () => {
  const source = await readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
  assert.match(source, /function guardDrawTransition\(/);
  assert.match(source, /function guardDrawDocumentTransition\(/);
  assert.match(source, /if \(key === 'commit' \|\| key === 'commitPatch'\)/);
  assert.match(source, /preparedCommit\.animation/);
  assert.match(source, /preparedCommit\(\)/);
  assert.match(source, /timeline\.past\.at\(-1\)/);
  assert.match(source, /timeline\.future\.at\(-1\)/);
  assert.match(source, /async applyCameraRgba\(/);
  assert.match(source, /request: Boolean\(detail\)/);
  assert.match(source, /8秒の詳細GIF/);
  assert.match(source, /guardDrawTransition\(plan\.animation, \{ lease, mutation: 'project-settings' \}\)/);
  assert.match(source, /guardDrawTransition\(imported, \{ lease, mutation: 'import' \}\)/);
  assert.match(source, /guardDrawTransition\(next, \{ lease: drawRewardPolicy\.capture\('draw'\), target: drawRewardTarget\(next, chosenCel\.frameId, chosenCel\.layerId\), mutation: 'music-page' \}\)/);
  assert.match(source, /setMusicTimelineValidator\(callback\)/);
  assert.match(source, /snapshotTimeline\(\)/);
  assert.match(source, /restoreTimelineSnapshot\(snapshot\)/);
  assert.match(source, /before\.width !== after\.width \|\| before\.height !== after\.height/);
  assert.match(source, /beforeLayers\.map\(layer => layer\.id\)/);
  assert.match(source, /beforeFrames\.map\(frame => frame\.id\)/);
  assert.match(source, /imageIsReadOnly = image && \(image\.width > 256 \|\| image\.height > 256 \|\| countSharedImageColors/);
});
