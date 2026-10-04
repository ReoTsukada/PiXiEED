import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_GUIDES, getToolGuide } from '../../js/tool-help-data.mjs';

const expected = new Map([
  ['/draw/', 'draw'],
  ['/pixel-camera.html', 'camera'],
  ['/telescope/', 'telescope'],
  ['/audio/', 'audio'],
  ['/jigsaw/', 'jigsaw'],
  ['/play/spot-difference/', 'spot-play'],
  ['/play/hidden-object/', 'hidden-play'],
  ['/spot-difference/', 'spot-create'],
  ['/hidden-object/', 'hidden-create'],
  ['/game/', 'game']
]);

test('tool guide catalog covers exactly the supported route guides', () => {
  assert.equal(TOOL_GUIDES.length, 10);
  assert.deepEqual(new Set(TOOL_GUIDES.map(({ id }) => id)), new Set([
    'draw', 'camera', 'telescope', 'audio', 'jigsaw', 'spot-play', 'hidden-play', 'spot-create', 'hidden-create', 'game'
  ]));
  for (const [pathname, id] of expected) assert.equal(getToolGuide({ pathname })?.id, id);
  assert.equal(TOOL_GUIDES.find(({ id }) => id === 'game')?.listed, false);
  assert.equal(TOOL_GUIDES.filter(({ listed }) => listed === false).length, 1);
});

test('guide lookup normalizes trailing slash and index.html route forms', () => {
  assert.equal(getToolGuide({ pathname: '/draw' })?.id, 'draw');
  assert.equal(getToolGuide({ pathname: '/draw/index.html' })?.id, 'draw');
  assert.equal(getToolGuide({ pathname: '/play/hidden-object/index.html' })?.id, 'hidden-play');
});

test('telescope aliases require exactly tool=telescope', () => {
  assert.equal(getToolGuide({ pathname: '/globe-prototype.html', search: '?tool=telescope' })?.id, 'telescope');
  assert.equal(getToolGuide({ pathname: '/globe-prototype.html?tool=telescope' })?.id, 'telescope');
  assert.equal(getToolGuide({ pathname: '/globe-prototype.html', search: '?tool=other' }), null);
  assert.equal(getToolGuide({ pathname: '/globe-prototype.html', search: '?tool=telescope&tool=other' }), null);
  assert.equal(getToolGuide({ pathname: '/globe-prototype.html', search: '?Tool=telescope' }), null);
});

test('unknown routes and the tool directory have no route-specific guide', () => {
  assert.equal(getToolGuide({ pathname: '/tools/' }), null);
  assert.equal(getToolGuide({ pathname: '/legacy/draw/' }), null);
  assert.equal(getToolGuide({ pathname: '/' }), null);
  assert.equal(getToolGuide({}), null);
});

test('each guide has concise complete content and valid row shape', () => {
  for (const guide of TOOL_GUIDES) {
    assert.ok(guide.title.trim());
    assert.ok(guide.intro.trim());
    assert.equal(guide.steps.length, 3, `${guide.id} should have three starting steps`);
    assert.ok(guide.controls.length >= 4 && guide.controls.length <= 6, `${guide.id} control row count`);
    assert.ok(guide.notes.length >= 2 && guide.notes.length <= 3, `${guide.id} note count`);
    for (const step of guide.steps) assert.ok(typeof step === 'string' && step.trim());
    for (const row of guide.controls) {
      assert.deepEqual(Object.keys(row).sort(), ['action', 'detail']);
      assert.ok(row.action.trim() && row.detail.trim());
    }
    for (const note of guide.notes) assert.ok(typeof note === 'string' && note.trim());
  }
});


test('guide copy reflects conditional rotation, camera gestures, and Game phases', () => {
  const camera = getToolGuide({ pathname: '/pixel-camera.html' });
  assert.equal(camera.controls.find(({ action }) => action === '色を選び直す')?.detail.includes('映像をタップ'), true);
  const jigsaw = getToolGuide({ pathname: '/jigsaw/' });
  assert.match(jigsaw.controls.find(({ action }) => action === '回転').detail, /選択がないときは回転しません/);
  const game = getToolGuide({ pathname: '/game/' });
  assert.match(game.controls.find(({ action }) => action === '開始・休憩').detail, /「休憩」/);
  assert.doesNotMatch(game.controls.map(({ detail }) => detail).join(' '), /プレビューと編集を切り替え/);
  assert.doesNotMatch(game.notes.join(' '), /ツール一覧|公開投稿/);
});
