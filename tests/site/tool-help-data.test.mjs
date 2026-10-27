import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOL_GUIDES, getToolGuide } from '../../js/tool-help-data.mjs';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_SOURCE_PIXELS } from '../../js/creation/draw-import.mjs';
import { JIGSAW_MAX_IMAGE_BYTES, JIGSAW_MAX_SOURCE_PIXELS } from '../../js/creation/jigsaw-core.mjs';
import { MAX_PIXEL_FILE_BYTES, MAX_PIXEL_IMAGE_EDGE, MAX_PIXEL_IMAGE_PIXELS } from '../../js/pixel-scale.mjs';

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

test('draw and audio steps match the shared editor controls and distinguish saving from export', () => {
  const draw = getToolGuide({ pathname: '/draw/' });
  assert.match(draw.steps[2], /画面下.*出力.*作品を保存/);
  assert.doesNotMatch(draw.steps.join(' '), /中央の「保存」|ファイルに保存/);
  assert.match(draw.controls.find(({ action }) => action === '取り消し・やり直し').detail, /中央の再生ボタン/);
  assert.match(draw.notes.join(' '), /ブラウザーに保存/);

  const audio = getToolGuide({ pathname: '/audio/' });
  assert.match(audio.steps[0], /［モード］.*［音楽］/);
  assert.match(audio.steps[2], /中央の再生.*［出力］/);
  assert.match(audio.controls.find(({ action }) => action === '写真・保存・書き出し').detail, /この作品を保存.*別ファイル/);
  assert.match(audio.notes.join(' '), /共通キャンバス・パレット.*専用レイヤー/);
});

test('camera guide keeps the explicit start action and browser permission step', () => {
  const camera = getToolGuide({ pathname: '/camera/' });
  assert.match(camera.steps[0], /「カメラを開始」.*ブラウザーの利用許可/);
});

test('jigsaw startup guidance does not ask players to choose the hidden engine grid size', () => {
  const guide = getToolGuide({ pathname: '/jigsaw/' });
  const html = readFileSync(new URL('../../jigsaw/index.html', import.meta.url), 'utf8');
  const arcade = readFileSync(new URL('../../js/creation/jigsaw-arcade.mjs', import.meta.url), 'utf8');
  assert.match(html, /<label class="jigsaw-field" hidden aria-hidden="true">[^<]*<select id="jigsaw-grid-size"/);
  assert.match(html, /<button id="jigsaw-start"[^>]*>パズルをはじめる<\/button>/);
  assert.match(arcade, /const gridField = grid\.closest\('label'\); if \(gridField\) gridField\.hidden = true;/);
  assert.doesNotMatch(arcade, /gridField\.hidden\s*=\s*false/);
  assert.match(arcade, /const start = \$\('#jigsaw-start'\)/);
  assert.match(arcade, /start\.textContent = 'スタート'/);
  assert.match(arcade, /start\.addEventListener\('click'/);
  assert.doesNotMatch(guide.steps[1], /ピースの大きさを選び/);
  assert.match(guide.steps[1], /開始ボタンを押して、パズルをはじめます/);
});

test('tool guide image formats, size limits, and import steps match implementation', () => {
  const paths = { draw: '/draw/', camera: '/camera/', jigsaw: '/jigsaw/', spot: '/spot-difference/', hidden: '/hidden-object/' };
  const noteText = id => {
    const guide = getToolGuide({ pathname: paths[id] });
    return [...guide.steps, ...guide.notes].join(' ');
  };
  const megabytes = bytes => `${bytes / 1024 / 1024}MB`;
  const approximatePixels = pixels => `${Math.round(pixels / 100_000) * 10}万画素`;

  const draw = noteText('draw');
  assert.match(draw, /PNG・WebP/);
  assert.ok(draw.includes(megabytes(MAX_IMPORT_FILE_BYTES)));
  assert.ok(draw.includes(approximatePixels(MAX_IMPORT_SOURCE_PIXELS)));
  assert.match(draw, /最大256×256px/);
  const drawSource = readFileSync(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
  assert.match(drawSource, /value > 256/);

  const camera = noteText('camera');
  assert.match(camera, /PNG・JPEG・WebP/);
  assert.ok(camera.includes(megabytes(MAX_PIXEL_FILE_BYTES)));
  assert.match(camera, /4096px.*1600万画素/);
  const cameraGuide = getToolGuide({ pathname: '/camera/' });
  assert.match(cameraGuide.steps[0], /下部の［ファイル］→［画像を読み込む］/);
  const cameraHtml = readFileSync(new URL('../../camera/index.html', import.meta.url), 'utf8');
  assert.match(cameraHtml, /下部の［ファイル］→［画像を読み込む］/);
  const cameraSource = readFileSync(new URL('../../js/pixel-lens/image-source.mjs', import.meta.url), 'utf8');
  assert.match(cameraSource, /image\/png', 'image\/jpeg', 'image\/webp/);

  const jigsaw = noteText('jigsaw');
  assert.match(jigsaw, /PNG・WebP・JPEG/);
  assert.ok(jigsaw.includes(megabytes(JIGSAW_MAX_IMAGE_BYTES)));
  assert.ok(jigsaw.includes(approximatePixels(JIGSAW_MAX_SOURCE_PIXELS)));
  const jigsawSource = readFileSync(new URL('../../js/creation/jigsaw-page.mjs', import.meta.url), 'utf8');
  assert.match(jigsawSource, /image\/png', 'image\/webp', 'image\/jpeg/);

  const spot = noteText('spot');
  assert.match(spot, /PNG・WebP/);
  assert.ok(spot.includes(megabytes(MAX_IMPORT_FILE_BYTES)));
  assert.ok(spot.includes(approximatePixels(MAX_IMPORT_SOURCE_PIXELS)));
  assert.match(spot, /同じ幅・高さ/);
  const spotSource = readFileSync(new URL('../../js/creation/spot-image-import.mjs', import.meta.url), 'utf8');
  assert.match(spotSource, /keepScale:\s*true/);

  const hidden = noteText('hidden');
  assert.match(hidden, /PNG・WebP/);
  assert.ok(hidden.includes(megabytes(MAX_IMPORT_FILE_BYTES)));
  assert.match(hidden, /4096px.*1600万画素/);
  assert.ok(hidden.includes(approximatePixels(MAX_IMPORT_SOURCE_PIXELS)));
  const hiddenHtml = readFileSync(new URL('../../hidden-object/index.html', import.meta.url), 'utf8');
  assert.match(hiddenHtml, /accept="image\/png,image\/webp"/);
});

test('integrated output guide documents formats and limits exposed by the converter', () => {
  const outputGuide = readFileSync(new URL('../../output/index.html', import.meta.url), 'utf8');
  assert.match(outputGuide, /PNG・JPEG・静止WebP・静止GIF/);
  assert.match(outputGuide, /WAV.*M4A.*WebM.*Ogg/);
  assert.match(outputGuide, /120秒以内.*モノラル\/ステレオ.*8〜48kHz/);
  assert.match(outputGuide, /出力できる動画形式はブラウザーのMediaRecorder対応状況によります/);
});
