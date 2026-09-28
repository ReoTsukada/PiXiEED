import { normalizePixelFile, scaleNotice } from '../pixel-scale.mjs?v=20260928-pixel-scale-1';
import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { createUploadedWalkCollectGame, directionForUploadGameKey, moveUploadedWalkGame, restoreUploadedWalkGame, setUploadedWalkGamePaused, validateUploadedWalkGame } from './game-upload-core.mjs?rev=20260927-game-upload-1';

const LAST_KEY = 'pixieed:creation:game-upload:last-draft:v1';
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/flac']);
const $ = (selector) => document.querySelector(selector);
const status = $('#game-status'); const setup = $('#game-setup'); const playSection = $('#game-play'); const canvas = $('#game-board'); const context = canvas.getContext('2d', { alpha: false });
const files = { character: null, background: null, music: null }; const layers = { character: null, background: null };
let adapter = null; let store = null; let game = null; let busy = false; let gameAudio = null;
let boardPointer = null; let playerDragPreview = null;
const previewAudio = $('#game-audio-preview');

function setStatus(message) { status.textContent = message; }
function readLastId() { try { return localStorage.getItem(LAST_KEY); } catch { return null; } }
function setLastId(id) { try { localStorage.setItem(LAST_KEY, id); return true; } catch { return false; } }
function mimeForFile(file) {
  if (file.type) return file.type.toLowerCase().split(';', 1)[0].trim();
  const extension = file.name.toLowerCase().split('.').at(-1);
  return ({ png: 'image/png', webp: 'image/webp', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', flac: 'audio/flac' })[extension] || '';
}
function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('ファイルを読み取れません'));
    reader.onerror = () => reject(reader.error || new Error('ファイルを読み取れません')); reader.readAsDataURL(file);
  });
}
function decodeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('この画像を表示できませんでした'));
    image.src = dataUrl; if (image.complete && image.naturalWidth) resolve(image);
  });
}
function maxBytes(slot) { return slot === 'music' ? 3 * 1024 * 1024 : 2 * 1024 * 1024; }
function typeAllowed(slot, mime) { return slot === 'music' ? AUDIO_TYPES.has(mime) : mime === 'image/png' || mime === 'image/webp'; }
function updatePrepareButton() { $('#game-prepare').disabled = busy || !files.character || !files.background; }
function filenameSafe(name) { return name.replace(/[\\/\u0000-\u001f]/g, '').slice(0, 120) || 'local-file'; }
function setSlotSummary(slot, asset) {
  const summary = $(`#game-${slot}-summary`); const image = $(`#game-${slot}-preview`);
  if (!asset) { summary.textContent = slot === 'music' ? '音を選ばない場合は無音です。' : 'ファイルを選んでください。'; if (image) { image.removeAttribute('src'); image.hidden = true; } return; }
  summary.textContent = `${asset.fileName}・${asset.width ? `${asset.width}×${asset.height}px・` : ''}${Math.ceil(asset.sizeBytes / 1024)}KB・端末内のみ`;
  if (image) { image.src = asset.dataUrl; image.hidden = false; }
}

async function selectFile(slot, file) {
  if (!file) {
    files[slot] = null; setSlotSummary(slot, null);
    if (slot === 'music') { previewAudio.pause(); previewAudio.removeAttribute('src'); previewAudio.hidden = true; }
    updatePrepareButton(); return;
  }
  const tooLarge = () => new RangeError(slot === 'music' ? '音声は3MBまで選べます' : '画像は1ファイル2MBまで選べます');
  if (file.size < 1 || file.size > (slot === 'music' ? maxBytes(slot) : 8 * 1024 * 1024)) throw tooLarge();
  let mimeType = mimeForFile(file); if (!typeAllowed(slot, mimeType)) throw new TypeError(slot === 'music' ? 'MP3、OGG、WAV、M4A、AAC、WebM、FLACに対応しています' : 'PNGまたはWebPを選んでください');
  let notice = '';
  if (slot !== 'music') {
    // Pixel art saved enlarged comes back at one pixel per dot; the name stays the one the person chose.
    const normalized = await normalizePixelFile(file, { minDots: 1 });
    if (normalized.scale > 1) { notice = scaleNotice(normalized); mimeType = 'image/png'; file = new File([normalized.file], file.name, { type: 'image/png' }); }
    if (file.size > maxBytes(slot)) throw tooLarge();
  }
  const dataUrl = await readDataUrl(file); const asset = { fileName: filenameSafe(file.name), mimeType, sizeBytes: file.size, dataUrl };
  if (slot !== 'music') {
    const image = await decodeImage(dataUrl); asset.width = image.naturalWidth; asset.height = image.naturalHeight;
    if (asset.width > 4096 || asset.height > 4096 || asset.width * asset.height > 1024 * 1024) throw new RangeError('画像は縦横4096px以下、合計1024×1024画素までです');
    setSlotSummary(slot, asset);
  } else {
    files.music = asset; previewAudio.pause(); previewAudio.src = dataUrl; previewAudio.hidden = false;
    setSlotSummary(slot, asset); updatePrepareButton(); return;
  }
  files[slot] = asset; updatePrepareButton();
  return notice;
}

async function loadLayer(asset) { const image = await decodeImage(asset.dataUrl); return image; }
function drawCover(image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale; const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2; const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}
function drawContain(image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const targetWidth = image.naturalWidth * scale; const targetHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - targetWidth) / 2, y + (height - targetHeight) / 2, targetWidth, targetHeight);
}
function drawBoard() {
  if (!game || !layers.character || !layers.background) return;
  const { columns, rows, tilePixels } = game.board; const width = columns * tilePixels; const height = rows * tilePixels;
  canvas.width = width; canvas.height = height; context.imageSmoothingEnabled = false;
  context.fillStyle = '#e7ebe3'; context.fillRect(0, 0, width, height); drawCover(layers.background, 0, 0, width, height);
  context.fillStyle = 'rgba(28,42,37,.58)';
  for (const wall of game.walls) context.fillRect(wall.x * tilePixels + 2, wall.y * tilePixels + 2, tilePixels - 4, tilePixels - 4);
  const goal = game.goal; context.fillStyle = '#6b9a62'; context.fillRect(goal.x * tilePixels + 5, goal.y * tilePixels + 5, tilePixels - 10, tilePixels - 10);
  context.fillStyle = '#fff'; context.font = 'bold 23px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('⚑', goal.x * tilePixels + tilePixels / 2, goal.y * tilePixels + tilePixels / 2 + 1);
  for (const item of game.collectibles) {
    if (game.collectedIds.includes(item.id)) continue;
    const cx = item.x * tilePixels + tilePixels / 2; const cy = item.y * tilePixels + tilePixels / 2;
    context.beginPath(); for (let vertex = 0; vertex < 10; vertex += 1) { const angle = -Math.PI / 2 + vertex * Math.PI / 5; const radius = vertex % 2 ? 4 : 10; const px = cx + Math.cos(angle) * radius; const py = cy + Math.sin(angle) * radius; vertex ? context.lineTo(px, py) : context.moveTo(px, py); }
    context.closePath(); context.fillStyle = '#ffcb43'; context.fill(); context.strokeStyle = '#503c13'; context.stroke();
  }
  context.strokeStyle = 'rgba(255,255,255,.4)'; context.lineWidth = 1;
  for (let x = 1; x < columns; x += 1) { context.beginPath(); context.moveTo(x * tilePixels, 0); context.lineTo(x * tilePixels, height); context.stroke(); }
  for (let y = 1; y < rows; y += 1) { context.beginPath(); context.moveTo(0, y * tilePixels); context.lineTo(width, y * tilePixels); context.stroke(); }
  const pad = 3;
  if (playerDragPreview) {
    const rect = canvas.getBoundingClientRect();
    const centerX = (playerDragPreview.clientX - rect.left) * width / rect.width;
    const centerY = (playerDragPreview.clientY - rect.top) * height / rect.height;
    drawContain(layers.character, centerX - tilePixels / 2 + pad, centerY - tilePixels / 2 + pad, tilePixels - pad * 2, tilePixels - pad * 2);
  } else drawContain(layers.character, game.player.x * tilePixels + pad, game.player.y * tilePixels + pad, tilePixels - pad * 2, tilePixels - pad * 2);
  canvas.setAttribute('aria-label', `歩いて集めるゲーム。星 ${game.collectedIds.length}/${game.collectibles.length}個。現在 ${game.player.x + 1}列${game.player.y + 1}行。${game.phase === 'won' ? 'ゴールしました' : game.phase === 'paused' ? '一時停止中' : '盤面をタップまたはドラッグ、矢印キーや方向ボタンで1マス移動'}`);
  $('#game-progress').textContent = `星 ${game.collectedIds.length}/${game.collectibles.length}個　移動 ${game.moveCount}回　${game.phase === 'won' ? 'ゴール！' : game.phase === 'paused' ? '一時停止中' : '星を全部集めて旗をめざそう'}`;
  $('#game-win').hidden = game.phase !== 'won';
  document.querySelectorAll('[data-game-direction]').forEach((button) => { button.disabled = busy || game.phase !== 'playing'; });
  $('#game-save').disabled = busy;
  const primary = $('#game-primary'); primary.disabled = busy || game.phase === 'won'; primary.textContent = game.phase === 'playing' ? '休憩' : game.phase === 'won' ? '完了' : '遊ぶ';
}

function releaseGameAudio() {
  if (!gameAudio) return;
  gameAudio.pause(); try { gameAudio.currentTime = 0; } catch {}
  gameAudio.removeAttribute('src'); gameAudio.load(); gameAudio = null;
}
function releasePreviewAudio() {
  previewAudio.pause(); previewAudio.removeAttribute('src'); previewAudio.load(); previewAudio.hidden = true;
}
function playGameAudio() {
  releaseGameAudio();
  if (!game?.assets.music) return Promise.resolve(false);
  gameAudio = new Audio(game.assets.music.dataUrl); gameAudio.loop = true;
  return gameAudio.play().then(() => true).catch(() => false);
}

async function prepareGame() {
  if (busy || !files.character || !files.background) return;
  busy = true; updatePrepareButton(); setStatus('選んだ画像を確認しています…');
  try {
    const next = createUploadedWalkCollectGame({ gameId: crypto.randomUUID(), character: files.character, background: files.background, music: files.music });
    layers.character = await loadLayer(next.assets.character); layers.background = await loadLayer(next.assets.background);
    game = next; setup.hidden = true; playSection.hidden = false; $('#game-new').hidden = false;
    updateGameAssetLabel();
    previewAudio.pause(); drawBoard(); setStatus('プレビューを確認してください。中央の「遊ぶ」を押すと始まります。ファイルはこの端末内だけで使います。');
  } catch (error) { setStatus(`ゲームを準備できませんでした：${error.message}`); }
  finally { busy = false; updatePrepareButton(); drawBoard(); }
}

async function togglePlay() {
  if (!game || busy || game.phase === 'won') return;
  if (game.phase === 'playing') { game = setUploadedWalkGamePaused(game, true); releaseGameAudio(); drawBoard(); setStatus('一時停止しました。中央の「遊ぶ」で再開できます。'); return; }
  const audioTask = playGameAudio(); game = setUploadedWalkGamePaused(game, false); drawBoard();
  const audioStarted = await audioTask;
  setStatus(game.assets.music ? audioStarted ? 'ゲーム開始。星を全部集めて旗まで進もう。' : 'ゲーム開始。選んだ音声をこのブラウザーで再生できませんでした。' : 'ゲーム開始。音素材は選ばれていないため無音です。');
}

function move(direction) {
  if (!game || busy || game.phase !== 'playing') return;
  const result = moveUploadedWalkGame(game, direction); game = result.game; drawBoard();
  if (result.reason === 'edge' || result.reason === 'wall') setStatus('そこへは進めません。別の方向を試してください。');
  else if (result.collected) setStatus(`星を集めました。残り ${game.collectibles.length - game.collectedIds.length}個です。`);
  else if (result.won) { releaseGameAudio(); setStatus('星を全部集めてゴールしました。端末に保存できます。'); }
}

function boardCellAt(clientX, clientY) {
  if (!game) return null;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  return { x: Math.min(game.board.columns - 1, Math.floor((clientX - rect.left) * game.board.columns / rect.width)), y: Math.min(game.board.rows - 1, Math.floor((clientY - rect.top) * game.board.rows / rect.height)) };
}
function directionToward(point) {
  if (!game || !point) return null;
  const dx = point.x - game.player.x; const dy = point.y - game.player.y;
  if (dx === 0 && dy === 0) return null;
  return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
}
canvas.addEventListener('pointerdown', (event) => {
  if (!game || game.phase !== 'playing' || busy || (event.button !== undefined && event.button !== 0)) return;
  const cell = boardCellAt(event.clientX, event.clientY);
  if (!cell) return;
  boardPointer = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, cell, playerOrigin: cell.x === game.player.x && cell.y === game.player.y };
  try { canvas.setPointerCapture(event.pointerId); } catch {}
});
canvas.addEventListener('pointermove', (event) => {
  if (!boardPointer || boardPointer.pointerId !== event.pointerId || !boardPointer.playerOrigin) return;
  if (Math.hypot(event.clientX - boardPointer.startX, event.clientY - boardPointer.startY) < 5) return;
  playerDragPreview = { clientX: event.clientX, clientY: event.clientY }; drawBoard();
});
function finishBoardPointer(event) {
  if (!boardPointer || boardPointer.pointerId !== event.pointerId) return;
  const input = boardPointer; boardPointer = null; playerDragPreview = null;
  if (event.type === 'pointercancel' || !game || game.phase !== 'playing') { drawBoard(); return; }
  const target = boardCellAt(event.clientX, event.clientY);
  let direction = directionToward(target);
  if (!direction && input.playerOrigin) {
    const dx = event.clientX - input.startX; const dy = event.clientY - input.startY;
    if (Math.hypot(dx, dy) >= 5) direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
  }
  if (direction) move(direction); else drawBoard();
}
canvas.addEventListener('pointerup', finishBoardPointer); canvas.addEventListener('pointercancel', finishBoardPointer);

async function saveGame() {
  if (!store || !game || busy) return;
  busy = true; drawBoard(); setStatus('ゲームと選んだファイルを端末に保存しています…');
  try {
    validateUploadedWalkGame(game);
    await store.save({ draftId: game.gameId, kind: 'game', ownerId: 'local-owner', document: game, source: { type: 'user_selected_files', assetId: null, revisionId: null } });
    if (!setLastId(game.gameId)) throw new Error('再開用の目印を端末に保存できませんでした');
    $('#game-resume').hidden = false; setStatus('ゲームと選んだファイルをこの端末に保存しました。次回は同じ内容を再開できます。');
  } catch (error) { setStatus(`保存できませんでした：${error.message}`); }
  finally { busy = false; drawBoard(); }
}

function showSelectedAsset(slot, asset) {
  files[slot] = asset; setSlotSummary(slot, asset);
  if (slot === 'music') { previewAudio.pause(); if (asset) { previewAudio.src = asset.dataUrl; previewAudio.hidden = false; } else { previewAudio.removeAttribute('src'); previewAudio.hidden = true; } }
}
function updateGameAssetLabel() {
  if (!game) return;
  $('#game-assets-label').textContent = `キャラクター: ${game.assets.character.fileName} (${game.assets.character.width}×${game.assets.character.height})・背景: ${game.assets.background.fileName} (${game.assets.background.width}×${game.assets.background.height})・音: ${game.assets.music?.fileName || 'なし'}`;
}
async function resumeGame() {
  const id = readLastId(); if (!id || !store || busy) return;
  busy = true; $('#game-resume').disabled = true; setStatus('前回のゲームと端末内ファイルを確認しています…');
  try {
    const revision = await store.load(id);
    if (!revision || revision.asset.kind !== 'game' || revision.asset.owner.type !== 'local' || revision.asset.owner.id !== 'local-owner' || revision.asset.visibility !== 'draft' || revision.document.gameId !== id) throw new Error('前回のゲームが見つかりません');
    game = restoreUploadedWalkGame(revision.document);
    layers.character = await loadLayer(game.assets.character); layers.background = await loadLayer(game.assets.background);
    showSelectedAsset('character', game.assets.character); showSelectedAsset('background', game.assets.background); showSelectedAsset('music', game.assets.music);
    setup.hidden = true; playSection.hidden = false; $('#game-new').hidden = false; updateGameAssetLabel(); drawBoard();
    setStatus(game.phase === 'won' ? '前回のゴール済みゲームを開きました。' : '同じゲームと選んだファイルを端末から再開しました。中央の「遊ぶ」で続けられます。');
  } catch (error) { setStatus(`再開できませんでした：${error.message}`); }
  finally { busy = false; $('#game-resume').disabled = false; drawBoard(); }
}

function newGame() { releaseGameAudio(); game = null; layers.character = null; layers.background = null; playSection.hidden = true; setup.hidden = false; $('#game-new').hidden = true; updatePrepareButton(); setStatus('画像を選んでプレビューし、ゲームを作ってください。'); }

for (const slot of ['character', 'background', 'music']) $(`#game-${slot}-file`).addEventListener('change', async (event) => {
  const file = event.currentTarget.files?.[0] || null; setStatus(`${slot === 'music' ? '音' : '画像'}を読み込んでいます…`);
  try { const notice = await selectFile(slot, file); setStatus(notice || (slot === 'music' ? files.music ? '音のプレビューを確認できます。端末外へ送信しません。' : '音なしでゲームを作れます。' : '選んだ画像をプレビューしています。端末外へ送信しません。')); }
  catch (error) { files[slot] = null; setSlotSummary(slot, null); if (slot === 'music') { previewAudio.pause(); previewAudio.removeAttribute('src'); previewAudio.hidden = true; } updatePrepareButton(); setStatus(`ファイルを使えません：${error.message}`); }
});
$('#game-prepare').addEventListener('click', prepareGame); $('#game-primary').addEventListener('click', togglePlay); $('#game-save').addEventListener('click', saveGame); $('#game-resume').addEventListener('click', resumeGame); $('#game-new').addEventListener('click', newGame);
document.querySelectorAll('[data-game-direction]').forEach((button) => button.addEventListener('click', () => move(button.dataset.gameDirection)));
document.addEventListener('keydown', (event) => { if (!game || game.phase !== 'playing' || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) return; const direction = directionForUploadGameKey(event.key); if (direction) { event.preventDefault(); move(direction); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { releasePreviewAudio(); if (game?.phase === 'playing') { game = setUploadedWalkGamePaused(game, true); releaseGameAudio(); drawBoard(); setStatus('画面を離れたためゲームと音を一時停止しました。'); } } });
window.addEventListener('pagehide', () => { releaseGameAudio(); releasePreviewAudio(); });
try { adapter = createIndexedDbDraftAdapter(); store = createLocalDraftStore(adapter); }
catch (error) { $('#game-prepare').disabled = true; $('#game-resume').disabled = true; setStatus(`端末内保存が使えません：${error.message}`); }
$('#game-resume').hidden = !readLastId(); updatePrepareButton();
