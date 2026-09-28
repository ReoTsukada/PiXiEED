import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDraftAdapter, createLocalDraftStore } from '../../js/creation/local-drafts.mjs';
import { createUploadedWalkCollectGame, directionForUploadGameKey, moveUploadedWalkGame, restoreUploadedWalkGame, setUploadedWalkGamePaused, validateUploadedWalkGame, MAX_UPLOAD_AUDIO_BYTES, MAX_UPLOAD_IMAGE_BYTES } from '../../js/creation/game-upload-core.mjs';

function createAssets() {
  return {
    character: { fileName: 'hero.png', mimeType: 'image/png', sizeBytes: 3, dataUrl: 'data:image/png;base64,AQID', width: 16, height: 16 },
    background: { fileName: 'garden.webp', mimeType: 'image/webp', sizeBytes: 3, dataUrl: 'data:image/webp;base64,AQID', width: 24, height: 16 },
    music: { fileName: 'song.ogg', mimeType: 'audio/ogg', sizeBytes: 3, dataUrl: 'data:audio/ogg;base64,AQID' }
  };
}
function idFactory() { let id = 0; return () => `draft-${++id}`; }
function gameFrom(assets = createAssets()) { return createUploadedWalkCollectGame({ gameId: 'upload-game', ...assets }); }

test('the user-selected images and optional sound are kept in the local game document', () => {
  const assets = createAssets(); const before = structuredClone(assets); const game = gameFrom(assets);
  assert.equal(game.phase, 'paused');
  assert.equal(game.assets.character.fileName, 'hero.png');
  assert.equal(game.assets.background.fileName, 'garden.webp');
  assert.equal(game.assets.music.fileName, 'song.ogg');
  assert.deepEqual(assets, before);
  assert.equal(validateUploadedWalkGame(game), game);
  const silent = gameFrom({ ...assets, music: null });
  assert.equal(silent.assets.music, null);
});

test('keyboard and touch direction sequences produce the same collection and win result', () => {
  const route = [...Array(3).fill('down'), ...Array(4).fill('right'), ...Array(3).fill('up'), ...Array(3).fill('right'), 'down', ...Array(3).fill('down'), ...Array(3).fill('left'), 'up', ...Array(4).fill('left'), ...Array(2).fill('down'), 'up', ...Array(4).fill('right'), 'down', ...Array(3).fill('right')];
  const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  let touch = setUploadedWalkGamePaused(gameFrom(), false); let keyboard = setUploadedWalkGamePaused(gameFrom(), false);
  for (const direction of route) {
    touch = moveUploadedWalkGame(touch, direction).game;
    keyboard = moveUploadedWalkGame(keyboard, directionForUploadGameKey(keys[direction])).game;
  }
  assert.deepEqual(touch, keyboard);
  assert.equal(touch.phase, 'won'); assert.equal(touch.collectedIds.length, 3); assert.equal(touch.moveCount, route.length);
  assert.equal(directionForUploadGameKey('Escape'), null);
});

test('walls, board edges, paused movement, and reaching the goal too early are safe', () => {
  let game = gameFrom(); assert.equal(moveUploadedWalkGame(game, 'up').moved, false);
  game = setUploadedWalkGamePaused(game, false);
  game = moveUploadedWalkGame(game, 'left').game; assert.equal(moveUploadedWalkGame(game, 'left').reason, 'edge');
  game = moveUploadedWalkGame(game, 'right').game;
  game = moveUploadedWalkGame(game, 'right').game;
  assert.deepEqual(game.player, { x: 2, y: 1 }); // next step is blocked by a wall
  assert.equal(moveUploadedWalkGame(game, 'right').reason, 'wall');
  const nearGoal = { ...setUploadedWalkGamePaused(gameFrom(), false), player: { x: 7, y: 6 } };
  const premature = moveUploadedWalkGame(nearGoal, 'right'); assert.equal(premature.won, false); assert.equal(premature.game.phase, 'playing');
});

test('file type, dimensions, base64 integrity, and storage bounds fail closed', () => {
  const assets = createAssets();
  assert.throws(() => gameFrom({ ...assets, character: { ...assets.character, mimeType: 'image/gif', dataUrl: 'data:image/gif;base64,AQID' } }), /PNG\/WebP/);
  assert.throws(() => gameFrom({ ...assets, background: { ...assets.background, width: 4097 } }), /4096px/);
  assert.throws(() => gameFrom({ ...assets, character: { ...assets.character, sizeBytes: MAX_UPLOAD_IMAGE_BYTES + 1 } }), /2MB/);
  assert.throws(() => gameFrom({ ...assets, music: { ...assets.music, sizeBytes: MAX_UPLOAD_AUDIO_BYTES + 1 } }), /3MB/);
  assert.throws(() => gameFrom({ ...assets, music: { ...assets.music, dataUrl: 'data:audio/ogg;base64,AAAA', sizeBytes: 4 } }), /一致しません/);
  assert.throws(() => validateUploadedWalkGame({ ...gameFrom(), injectedScript: 'nope' }), /任意コード/);
});

test('saving and resuming restores the same file bytes and pauses without autoplay', async () => {
  const adapter = createMemoryDraftAdapter(); const store = createLocalDraftStore(adapter, { idFactory: idFactory() });
  let game = setUploadedWalkGamePaused(gameFrom(), false); game = moveUploadedWalkGame(game, 'down').game;
  await store.save({ draftId: game.gameId, kind: 'game', document: game, source: { type: 'user_selected_files', assetId: null, revisionId: null } });
  const restored = restoreUploadedWalkGame((await store.load(game.gameId)).document);
  assert.equal(restored.phase, 'paused'); assert.deepEqual(restored.player, { x: 1, y: 2 });
  assert.equal(restored.assets.character.dataUrl, game.assets.character.dataUrl);
  assert.equal(restored.assets.background.dataUrl, game.assets.background.dataUrl);
  assert.equal(restored.assets.music.dataUrl, game.assets.music.dataUrl);
});

test('game workspace keeps the board primary and routes direct canvas gestures through one-cell movement', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../game/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../css/creation-game.css', import.meta.url), 'utf8');
  const page = await readFile(new URL('../../js/creation/game-upload-page.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="game-primary"/);
  assert.match(html, /盤面をタップして進む方向を選び、キャラクターをドラッグして1マス進みます/);
  assert.match(html, /id="game-character-file"/); assert.match(html, /id="game-background-file"/); assert.match(html, /id="game-music-file"/);
  assert.match(page, /canvas\.addEventListener\('pointerdown'/);
  assert.match(page, /canvas\.addEventListener\('pointerup', finishBoardPointer\)/);
  assert.match(page, /if \(direction\) move\(direction\)/);
  assert.match(page, /Math\.abs\(dx\) > Math\.abs\(dy\)/);
  assert.match(css, /height:100dvh/); assert.match(css, /safe-area-inset-bottom/); assert.match(css, /orientation:landscape/);
  assert.match(css, /grid-template-rows:auto minmax\(0,1fr\) auto auto auto/);
});
