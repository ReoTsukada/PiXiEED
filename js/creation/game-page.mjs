import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { documentRgba } from './draw-core.mjs';
import { createAudioPlayer } from './audio-core.mjs?rev=20261004-audio-outline-color-1';
import { createLevelTracker } from '../site-analytics.mjs';
import { createWalkCollectGame, directionForGameKey, moveWalkGame, resolveLocalGameArt, resolveLocalGameSong, resolveWalkGameAssets, restoreWalkGame, setWalkGamePaused, validateWalkGame } from './game-core.mjs?rev=20260927-game-step14-2';

const DRAW_LAST_KEY = 'pixieed.simple-draw.last-draft.v1'; const AUDIO_LAST_KEY = 'pixieed:creation:audio:last-draft:v1'; const LAST_KEY = 'pixieed:creation:game:last-draft:v1';
const $ = (selector) => document.querySelector(selector); const status = $('#game-status');
const selectors = { character: $('#game-character'), background: $('#game-background'), music: $('#game-music') };
const setup = $('#game-setup'); const playSection = $('#game-play'); const boardCanvas = $('#game-board'); const boardContext = boardCanvas.getContext('2d', { alpha: false });
let adapter = null; let store = null; let game = null; let gameAssets = null; let activeDraftId = null; let drawRecord = null; let songRecord = null; let busy = false;
let levelTracker = createLevelTracker('walk');
const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
const audioPlayer = createAudioPlayer({ audioContextFactory: () => { if (!AudioContextConstructor) throw new Error('AudioContext unavailable'); return new AudioContextConstructor(); } });

function setStatus(text) { status.textContent = text; }
function byId(revisions, revisionId) { return revisions?.find((revision) => revision.revisionId === revisionId) || null; }
function artRevision(slot) { return byId(drawRecord?.revisions, selectors[slot].value); }
function musicRevision() { return byId(songRecord?.revisions, selectors.music.value); }
function updateStartAvailability() { const ready = Boolean(artRevision('character') && artRevision('background') && musicRevision()) && !busy; $('#game-prepare').disabled = !ready; if (!game) $('#game-primary').disabled = !ready; }
function revisionName(revision, index, type = 'art') {
  if (type === 'music') return `保存版 ${index + 1}・${revision.document?.title || '曲'}・${revision.document?.tempo || '?'} BPM`;
  return `保存版 ${index + 1}・${revision.document?.width || '?'}×${revision.document?.height || '?'}px`;
}
function showRevisionOptions(select, revisions, emptyText) {
  select.replaceChildren();
  if (!revisions.length) { select.add(new Option(emptyText, '')); return; }
  const type = select === selectors.music ? 'music' : 'art';
  revisions.forEach((revision, index) => select.add(new Option(revisionName(revision, index, type), revision.revisionId)));
  select.selectedIndex = revisions.length - 1;
}

async function loadOptions() {
  const drawId = readStorage(DRAW_LAST_KEY); const songId = readStorage(AUDIO_LAST_KEY);
  try {
    drawRecord = drawId ? await adapter.get(drawId) : null;
    if (!drawRecord || drawRecord.schemaVersion !== 1 || drawRecord.draftId !== drawId || !Array.isArray(drawRecord.revisions)) drawRecord = null;
    const drawRevisions = (drawRecord?.revisions || []).filter((revision) => revision?.asset?.kind === 'pixel_art' && revision.asset.owner?.type === 'local' && revision.asset.owner.id === 'local-owner' && revision.asset.visibility === 'draft');
    showRevisionOptions(selectors.character, drawRevisions, 'Draw保存版がありません');
    showRevisionOptions(selectors.background, drawRevisions, 'Draw保存版がありません');
    songRecord = songId ? await adapter.get(songId) : null;
    if (!songRecord || songRecord.schemaVersion !== 1 || songRecord.draftId !== songId || !Array.isArray(songRecord.revisions)) songRecord = null;
    const songRevisions = (songRecord?.revisions || []).filter((revision) => revision?.asset?.kind === 'song' && revision.asset.owner?.type === 'local' && revision.asset.owner.id === 'local-owner' && revision.asset.visibility === 'draft');
    showRevisionOptions(selectors.music, songRevisions, '簡易音楽の保存版がありません');
    updateStartAvailability();
    setStatus(drawRevisions.length && songRevisions.length ? 'キャラクター・背景・音の保存版を選んでください。' : 'Drawの絵と簡易音楽をそれぞれ端末へ保存してください。');
  } catch (error) { setStatus(`素材一覧を読み込めませんでした：${error.message}`); }
}

function canvasFromDocument(documentData) {
  const canvas = globalThis.document.createElement('canvas'); canvas.width = documentData.width; canvas.height = documentData.height;
  canvas.getContext('2d', { alpha: true }).putImageData(new ImageData(new Uint8ClampedArray(documentRgba(documentData)), documentData.width, documentData.height), 0, 0); return canvas;
}

function drawBoard() {
  if (!game || !gameAssets) return;
  const { columns, rows, tilePixels } = game.board; const width = columns * tilePixels; const height = rows * tilePixels;
  if (boardCanvas.width !== width || boardCanvas.height !== height) { boardCanvas.width = width; boardCanvas.height = height; }
  boardContext.imageSmoothingEnabled = false; boardContext.clearRect(0, 0, width, height); boardContext.fillStyle = '#e7ebe3'; boardContext.fillRect(0, 0, width, height);
  boardContext.drawImage(gameAssets.backgroundLayer, 0, 0, width, height);
  boardContext.fillStyle = 'rgba(28,42,37,.56)';
  for (const wall of game.walls) boardContext.fillRect(wall.x * tilePixels + 2, wall.y * tilePixels + 2, tilePixels - 4, tilePixels - 4);
  const goal = game.goal; boardContext.fillStyle = '#6b9a62'; boardContext.fillRect(goal.x * tilePixels + 5, goal.y * tilePixels + 5, tilePixels - 10, tilePixels - 10);
  boardContext.fillStyle = '#fff'; boardContext.font = 'bold 23px sans-serif'; boardContext.textAlign = 'center'; boardContext.textBaseline = 'middle'; boardContext.fillText('⚑', goal.x * tilePixels + tilePixels / 2, goal.y * tilePixels + tilePixels / 2 + 1);
  for (const item of game.collectibles) {
    if (game.collectedIds.includes(item.id)) continue;
    const x = item.x * tilePixels + tilePixels / 2; const y = item.y * tilePixels + tilePixels / 2; const outer = 10; const inner = 4;
    boardContext.beginPath(); for (let vertex = 0; vertex < 10; vertex += 1) { const angle = -Math.PI / 2 + vertex * Math.PI / 5; const radius = vertex % 2 ? inner : outer; const px = x + Math.cos(angle) * radius; const py = y + Math.sin(angle) * radius; vertex ? boardContext.lineTo(px, py) : boardContext.moveTo(px, py); } boardContext.closePath(); boardContext.fillStyle = '#ffcb43'; boardContext.fill(); boardContext.strokeStyle = '#503c13'; boardContext.lineWidth = 1; boardContext.stroke();
  }
  boardContext.strokeStyle = 'rgba(255,255,255,.38)'; boardContext.lineWidth = 1;
  for (let x = 1; x < columns; x += 1) { boardContext.beginPath(); boardContext.moveTo(x * tilePixels, 0); boardContext.lineTo(x * tilePixels, height); boardContext.stroke(); }
  for (let y = 1; y < rows; y += 1) { boardContext.beginPath(); boardContext.moveTo(0, y * tilePixels); boardContext.lineTo(width, y * tilePixels); boardContext.stroke(); }
  boardContext.drawImage(gameAssets.characterLayer, game.player.x * tilePixels + 2, game.player.y * tilePixels + 2, tilePixels - 4, tilePixels - 4);
  boardCanvas.setAttribute('aria-label', `歩いて集めるゲーム。星 ${game.collectedIds.length}/${game.collectibles.length}個。現在 ${game.player.x + 1}列${game.player.y + 1}行。${game.phase === 'won' ? 'ゴールしました' : game.phase === 'paused' ? '一時停止中' : '矢印キーまたは方向ボタンで移動'}`);
  $('#game-progress').textContent = `星 ${game.collectedIds.length}/${game.collectibles.length}個　移動 ${game.moveCount}回　${game.phase === 'won' ? 'ゴール！' : game.phase === 'paused' ? '一時停止中' : '全部集めて旗をめざそう'}`;
  $('#game-win').hidden = game.phase !== 'won';
  document.querySelectorAll('[data-game-direction]').forEach((button) => { button.disabled = game.phase !== 'playing' || busy; });
  $('#game-save').disabled = busy || !game;
}

function installAssets(revisions) {
  gameAssets = { ...revisions, characterLayer: canvasFromDocument(revisions.character.document), backgroundLayer: canvasFromDocument(revisions.background.document) };
}
function updatePrimary() {
  const button = $('#game-primary');
  if (!game) { button.textContent = '遊ぶ'; button.setAttribute('aria-label', '選んだ素材でゲームを始める'); button.disabled = !artRevision('character') || !artRevision('background') || !musicRevision() || busy; return; }
  if (game.phase === 'won') { button.textContent = '完了'; button.setAttribute('aria-label', 'ゲームクリア'); button.disabled = true; return; }
  button.disabled = busy; button.textContent = game.phase === 'playing' ? '休憩' : '遊ぶ'; button.setAttribute('aria-label', game.phase === 'playing' ? 'ゲームを一時停止して音を止める' : 'ゲームを開始または再開する');
}

async function prepareGame() {
  if (busy) return;
  busy = true; updateStartAvailability(); updatePrimary(); setStatus('選んだ素材の固定版を確認しています…');
  try {
    const character = artRevision('character'); const background = artRevision('background'); const music = musicRevision();
    if (!drawRecord || !songRecord || !character || !background || !music) throw new Error('キャラクター・背景・音を選んでください');
    const nextGame = await createWalkCollectGame({ adapter, gameId: crypto.randomUUID(), characterDraftId: drawRecord.draftId, characterRevisionId: character.revisionId, backgroundDraftId: drawRecord.draftId, backgroundRevisionId: background.revisionId, musicDraftId: songRecord.draftId, musicRevisionId: music.revisionId });
    const assets = await resolveWalkGameAssets(adapter, nextGame);
    game = nextGame; activeDraftId = game.gameId; installAssets(assets);
    $('#game-assets-label').textContent = `キャラクター ${character.revisionId.slice(0, 8)}・背景 ${background.revisionId.slice(0, 8)}・音 ${music.revisionId.slice(0, 8)} を固定して使用`;
    setup.hidden = true; playSection.hidden = false; $('#game-new').hidden = false; $('#game-primary').disabled = false;
    drawBoard(); updatePrimary(); setStatus('準備できました。中央の「遊ぶ」を押すか矢印キーで始めてください。');
  } catch (error) { setStatus(`ゲームを準備できませんでした：${error.message}`); }
  finally { busy = false; updateStartAvailability(); updatePrimary(); drawBoard(); }
}

async function beginNewGame() {
  if (busy || game) return;
  const selectedSong = musicRevision()?.document;
  let soundTask = Promise.resolve(false);
  if (selectedSong) soundTask = audioPlayer.play(selectedSong).catch(() => false); // Called synchronously from the user's central-button gesture.
  await prepareGame();
  if (!game) { audioPlayer.stop(); return; }
  game = setWalkGamePaused(game, false); levelTracker.start(); drawBoard(); updatePrimary();
  const musicStarted = await soundTask;
  setStatus(musicStarted ? 'ゲーム開始。星を全部集めて旗まで進もう。' : 'ゲーム開始。音が鳴らない場合は曲に音符を追加してください。');
}

async function togglePlay() {
  if (!game) { await beginNewGame(); return; }
  if (game.phase === 'won' || busy) return;
  if (game.phase === 'playing') { game = setWalkGamePaused(game, true); audioPlayer.stop(); drawBoard(); updatePrimary(); setStatus('一時停止しました。中央の「遊ぶ」で再開できます。'); return; }
  busy = true; updatePrimary();
  const soundTask = audioPlayer.play(gameAssets.music.document).catch(() => false); // AudioContext is created before the first await.
  game = setWalkGamePaused(game, false); levelTracker.start(); drawBoard(); updatePrimary();
  const musicStarted = await soundTask; busy = false; drawBoard(); updatePrimary();
  setStatus(musicStarted ? '再開しました。' : '再開しました。音が鳴らない場合は曲に音符を追加してください。');
}

function move(direction) {
  if (!game || game.phase !== 'playing' || busy) return;
  try {
    const result = moveWalkGame(game, direction); game = result.game;
    drawBoard(); updatePrimary();
    if (result.reason === 'wall' || result.reason === 'edge') setStatus('そこへは進めません。別の方向を試してください。');
    else if (result.won) { audioPlayer.stop(); levelTracker.end({ success: true, completion_kind: 'goal' }); setStatus('星を全部集めてゴールしました。端末に保存できます。'); }
    else if (result.collected) setStatus(`星を集めました。残り ${game.collectibles.length - game.collectedIds.length}個です。`);
  } catch (error) { setStatus(error.message); }
}

async function saveGame() {
  if (!store || !game || busy) return;
  busy = true; $('#game-save').disabled = true; setStatus('ゲームを端末に保存しています…');
  try {
    await resolveWalkGameAssets(adapter, game);
    const revision = await store.save({ draftId: activeDraftId || game.gameId, kind: 'game', ownerId: 'local-owner', document: validateWalkGame(game), source: { type: 'local_game', assetId: game.assets.character.assetId, revisionId: game.assets.character.revisionId } });
    activeDraftId = revision.document.gameId;
    try { localStorage.setItem(LAST_KEY, activeDraftId); setStatus('ゲームを端末に保存しました。次回は同じ素材版で再開できます。'); }
    catch { setStatus('ゲームは保存しましたが、再開用の目印を保存できませんでした。'); }
  } catch (error) { setStatus(`保存できませんでした：${error.message}`); }
  finally { busy = false; drawBoard(); updatePrimary(); }
}

async function resumeGame() {
  const id = readStorage(LAST_KEY); if (!id || !store || busy) return;
  busy = true; $('#game-resume').disabled = true; setStatus('前回のゲームと素材の固定版を確認しています…');
  try {
    const saved = await store.load(id);
    if (!saved || saved.asset.kind !== 'game' || saved.asset.owner.type !== 'local' || saved.asset.owner.id !== 'local-owner' || saved.asset.visibility !== 'draft') throw new Error('前回のゲームが見つかりません');
    const resumed = restoreWalkGame(saved.document); const revisions = await resolveWalkGameAssets(adapter, resumed);
    game = resumed; activeDraftId = id; installAssets(revisions);
    const c = game.assets.character.revisionId.slice(0, 8); const b = game.assets.background.revisionId.slice(0, 8); const m = game.assets.music.revisionId.slice(0, 8);
    $('#game-assets-label').textContent = `前回と同じ素材版：キャラクター ${c}・背景 ${b}・音 ${m}`;
    setup.hidden = true; playSection.hidden = false; $('#game-new').hidden = false; drawBoard(); updatePrimary();
    setStatus(game.phase === 'won' ? '前回のゴール済みゲームを開きました。' : '同じ素材版と進行状態で再開しました。中央の「遊ぶ」で続けられます。');
  } catch (error) { setStatus(`再開できませんでした：${error.message}`); }
  finally { busy = false; $('#game-resume').disabled = false; updatePrimary(); drawBoard(); }
}

function newGame() {
  levelTracker.reset(); levelTracker = createLevelTracker('walk'); audioPlayer.stop(); game = null; gameAssets = null; activeDraftId = null; playSection.hidden = true; setup.hidden = false; $('#game-primary').disabled = !artRevision('character') || !artRevision('background') || !musicRevision(); updatePrimary(); setStatus('キャラクター・背景・音の保存版を選び、ゲームを準備してください。');
}

function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }

Object.values(selectors).forEach((select) => select.addEventListener('change', updateStartAvailability));
$('#game-prepare').addEventListener('click', prepareGame); $('#game-primary').addEventListener('click', togglePlay); $('#game-save').addEventListener('click', saveGame); $('#game-resume').addEventListener('click', resumeGame); $('#game-new').addEventListener('click', newGame);
document.querySelectorAll('[data-game-direction]').forEach((button) => button.addEventListener('click', () => move(button.dataset.gameDirection)));
document.addEventListener('keydown', (event) => {
  if (!game || game.phase !== 'playing' || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) return;
  const direction = directionForGameKey(event.key);
  if (!direction) return; event.preventDefault(); move(direction);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game?.phase === 'playing') { game = setWalkGamePaused(game, true); audioPlayer.stop(); drawBoard(); updatePrimary(); setStatus('タブを離れたため一時停止しました。'); } });
window.addEventListener('pagehide', () => { void audioPlayer.dispose(); });

try { adapter = createIndexedDbDraftAdapter(); store = createLocalDraftStore(adapter); }
catch { setStatus('このブラウザーでは端末内保存を利用できません。'); $('#game-prepare').disabled = true; $('#game-resume').disabled = true; }
showRevisionOptions(selectors.character, [], 'Draw保存版を読み込み中…'); showRevisionOptions(selectors.background, [], 'Draw保存版を読み込み中…'); showRevisionOptions(selectors.music, [], '曲を読み込み中…');
$('#game-resume').hidden = !readStorage(LAST_KEY); if (adapter) void loadOptions();
