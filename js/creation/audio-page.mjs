import { createLocalDraftStore } from './local-drafts.mjs';
import { hashCanonical } from './asset-contract.mjs';
import { imageToLoop } from './image-to-loop.mjs?rev=20260927-source-colors-1';
import { CAMERA_HANDOFF_KEY, cameraHandoffImage, createImportedDrawDocument, decodeDrawImageFile } from './draw-import.mjs';
import { validateDrawDocument } from './draw-core.mjs';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { AUDIO_INSTRUMENT_GROUPS } from './audio-timbres.mjs';
import {
  AUDIO_INSTRUMENTS, AUDIO_PIXEL_COLUMNS, AUDIO_PIXEL_PALETTE, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PPQ,
  collectAudioEvents, createAudioPlayer, createAudioSong, normalizeAudioPixelSong, setAudioPixel, setAudioPixelPalette, setAudioTempo, validateAudioSong
} from './audio-core.mjs?rev=20260928-pending-playback-1';

const LAST_DRAFT_KEY = 'pixieed:creation:audio:last-draft:v1';
const LAST_DRAW_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const PITCHES = Object.freeze(AUDIO_PIXEL_PITCHES.map((midi, index) => ({ midi, label: ['ド6', 'ラ5', 'ソ5', 'ミ5', 'レ5', 'ド5', 'ラ4', 'ソ4', 'ミ4', 'レ4', 'ド4', 'ラ3', 'ソ3', 'ミ3', 'レ3', 'ド3'][index] })));
const status = document.querySelector('#audio-status');
const gridWrap = document.querySelector('#audio-grid-wrap');
const pixelCanvas = document.querySelector('#audio-pixel-canvas');
const pixelSurface = createPixelCanvasSurface(pixelCanvas, { alpha: false, emptyColor: '#ffffff' });
const audioPixels = new Int16Array(AUDIO_PIXEL_COLUMNS * PITCHES.length).fill(-1);
const cursor = document.querySelector('#audio-cursor');
const playhead = document.querySelector('#audio-playhead');
const tracksEl = document.querySelector('#audio-tracks');
const paletteRows = document.querySelector('#audio-palette-rows');
const tempoInput = document.querySelector('#audio-tempo');
const tempoValue = document.querySelector('#audio-tempo-value');
const playButton = document.querySelector('#audio-play-toggle');
const saveButton = document.querySelector('#audio-save');
const resumeButton = document.querySelector('#audio-resume');
const drawSourceButton = document.querySelector('#audio-from-draw');
const cameraSourceButton = document.querySelector('#audio-from-camera');
const penButton = document.querySelector('#audio-tool-pen');
const eraserButton = document.querySelector('#audio-tool-eraser');

let draftStore = null;
let song = createAudioSong({ songId: globalThis.crypto?.randomUUID?.() || `song-${Date.now()}` });
let activeTrackId = song.tracks[0].trackId;
let currentDraftId = song.songId;
let cameraHandoff = cameraHandoffImage();
let activeTool = 'pen';
let pointerDrawId = null;
let pointerDrawMode = 'paint';
let pointerLastCell = null;
let cursorCell = { x: 0, y: 0 };
let keyboardCursor = false;
let playheadFrame = 0;
let canvasPaletteSource = null;
let canvasPaletteColors = null;

try { draftStore = createLocalDraftStore(); }
catch { saveButton.disabled = true; status.textContent = 'このブラウザーでは端末内保存を利用できません。'; }

const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
const player = createAudioPlayer({
  audioContextFactory: () => {
    if (!AudioContextConstructor) throw new Error('AudioContext unavailable');
    return new AudioContextConstructor();
  },
  onStateChange(playing, starting) {
    playButton.textContent = playing || starting ? '停止' : '再生';
    playButton.setAttribute('aria-label', starting ? '曲の再生を中止' : playing ? '曲を停止' : '曲を再生');
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.toggleAttribute('aria-busy', starting);
    if (playing) startPlayhead(); else stopPlayhead();
  }
});

function setStatus(message) { status.textContent = message; }
function selectedTrack() { return song.tracks.find((track) => track.trackId === activeTrackId) || song.tracks[0]; }
function trackNoteAt(track, pitch, tick) { return track.clips.flatMap((clip) => clip.notes).find((note) => note.pitch === pitch && tick >= note.startTick && tick < note.startTick + note.durationTicks) || null; }
function pitchName(pitch) { return PITCHES.find((item) => item.midi === pitch)?.label || `音程${pitch}`; }

function setTool(tool) {
  activeTool = tool; penButton.setAttribute('aria-pressed', String(tool === 'pen')); eraserButton.setAttribute('aria-pressed', String(tool === 'eraser'));
  updateCanvasLabel();
}

function scalePixelBoard() {
  const cellSize = Math.max(8, Math.floor(Math.min(gridWrap.clientWidth / AUDIO_PIXEL_COLUMNS, gridWrap.clientHeight / PITCHES.length)));
  pixelCanvas.style.width = `${AUDIO_PIXEL_COLUMNS * cellSize}px`;
  pixelCanvas.style.height = `${PITCHES.length * cellSize}px`;
  positionCursor();
}

function positionCursor() {
  cursor.hidden = document.activeElement !== pixelCanvas || !keyboardCursor;
  if (cursor.hidden) return;
  const canvasRect = pixelCanvas.getBoundingClientRect();
  const wrapRect = gridWrap.getBoundingClientRect();
  const cellWidth = canvasRect.width / AUDIO_PIXEL_COLUMNS;
  const cellHeight = canvasRect.height / PITCHES.length;
  cursor.style.left = `${canvasRect.left - wrapRect.left + cursorCell.x * cellWidth}px`;
  cursor.style.top = `${canvasRect.top - wrapRect.top + cursorCell.y * cellHeight}px`;
  cursor.style.width = `${cellWidth}px`;
  cursor.style.height = `${cellHeight}px`;
}

function refreshImageSources() {
  try { drawSourceButton.hidden = !localStorage.getItem(LAST_DRAW_DRAFT_KEY); }
  catch { drawSourceButton.hidden = true; }
  cameraHandoff = cameraHandoffImage(); cameraSourceButton.hidden = !cameraHandoff;
}

function loopSeedToSong(seed) {
  const nextSong = createAudioSong({ songId: globalThis.crypto?.randomUUID?.() || `song-${Date.now()}` });
  const preferred = new Map(); const usedColors = new Set();
  for (const slot of nextSong.pixelPalette) {
    const color = seed.suggestedColors?.[slot.slotId];
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color) || usedColors.has(color.toLowerCase())) continue;
    preferred.set(slot.slotId, color.toLowerCase()); usedColors.add(color.toLowerCase());
  }
  const fallbackColors = [...nextSong.pixelPalette.map((slot) => slot.color), '#38546e', '#f2865a', '#754d72', '#407d77'];
  const palette = nextSong.pixelPalette.map((slot) => {
    if (preferred.has(slot.slotId)) return { ...slot, color: preferred.get(slot.slotId) };
    const color = !usedColors.has(slot.color.toLowerCase()) ? slot.color : fallbackColors.find((candidate) => !usedColors.has(candidate.toLowerCase()));
    usedColors.add(color.toLowerCase());
    return { ...slot, color };
  });
  const tracks = nextSong.tracks.map((track) => {
    const seedTrack = seed.tracks.find((item) => item.instrument === track.instrument);
    const notes = seedTrack.notes.map((note) => ({
      noteId: note.noteId, startTick: note.startTick, durationTicks: note.durationTicks,
      pitch: note.pitch < 48 ? note.pitch + 12 : note.pitch > 57 ? note.pitch - 12 : note.pitch,
      velocity: note.velocity
    }));
    return { ...track, clips: track.clips.map((clip) => ({ ...clip, notes })) };
  });
  return normalizeAudioPixelSong(validateAudioSong({ ...nextSong, title: '画像から作ったループ', pixelPalette: palette, tracks, imageSource: { ...seed.source, rulesVersion: seed.rulesVersion } }));
}

async function beginFromImage(asset, document) {
  const seed = await imageToLoop({ asset, document, actorId: 'local-owner' });
  if (player.isPlaying || player.isStarting) player.stop();
  song = loopSeedToSong(seed); currentDraftId = song.songId; activeTrackId = song.tracks[0].trackId;
  renderSong();
  setStatus('画像の色から曲のたたき台を作りました。音符やテンポを自由に編集できます。');
}

drawSourceButton.addEventListener('click', async () => {
  let draftId;
  try { draftId = localStorage.getItem(LAST_DRAW_DRAFT_KEY); } catch {}
  if (!draftId || !draftStore) { refreshImageSources(); setStatus('端末に保存した絵が見つかりません。'); return; }
  drawSourceButton.disabled = true; setStatus('保存した絵を確認しています…');
  try {
    const revision = await draftStore.load(draftId);
    if (!revision || revision.asset.kind !== 'pixel_art' || revision.asset.owner.type !== 'local' || revision.asset.owner.id !== 'local-owner' || revision.asset.visibility !== 'draft' || revision.asset.hashScheme !== 'sha256-canonical-v1' || await hashCanonical(revision.document) !== revision.asset.contentHash) throw new Error('自分の保存版を確認できませんでした');
    validateDrawDocument(revision.document);
    await beginFromImage(revision.asset, revision.document);
  } catch (error) { setStatus(error.message || '保存した絵から曲を作れませんでした。'); }
  finally { drawSourceButton.disabled = false; refreshImageSources(); }
});

cameraSourceButton.addEventListener('click', async () => {
  cameraSourceButton.disabled = true; setStatus('端末内のカメラ画像を確認しています…');
  try {
    const handoff = cameraHandoffImage();
    if (!handoff) throw new Error('カメラ画像が見つからないか、受け渡し期限が切れています');
    const image = await decodeDrawImageFile(handoff.file);
    const document = createImportedDrawDocument(image, 128).document;
    const contentHash = await hashCanonical(document);
    const asset = {
      schemaVersion: 1, assetId: `camera-${handoff.createdAt}`, revisionId: `camera-revision-${handoff.createdAt}`,
      contentHash, hashScheme: 'sha256-canonical-v1', kind: 'pixel_camera',
      source: { type: 'pixel_camera', assetId: null, revisionId: null },
      owner: { type: 'local', id: 'local-owner' }, visibility: 'draft', reusePermission: 'owner_only'
    };
    await beginFromImage(asset, document);
  } catch (error) { setStatus(error.message || 'カメラ画像から曲を作れませんでした。'); }
  finally { cameraSourceButton.disabled = false; refreshImageSources(); }
});

window.addEventListener('storage', (event) => {
  if (event.key === CAMERA_HANDOFF_KEY || event.key === LAST_DRAW_DRAFT_KEY) refreshImageSources();
});
window.addEventListener('resize', scalePixelBoard, { passive: true });
if (typeof globalThis.ResizeObserver === 'function') new globalThis.ResizeObserver(scalePixelBoard).observe(gridWrap);

function currentPalette() { return song.pixelPalette || AUDIO_PIXEL_PALETTE; }
function canvasColors() {
  const palette = currentPalette();
  if (palette !== canvasPaletteSource) {
    canvasPaletteSource = palette;
    canvasPaletteColors = palette.map((slot) => slot.color);
  }
  return canvasPaletteColors;
}
function paletteSlot(slotId) { return currentPalette().find((slot) => slot.slotId === slotId); }
function paletteSoundName(slotId) { return AUDIO_INSTRUMENTS.find((instrument) => instrument.id === paletteSlot(slotId)?.instrument)?.name || '音色'; }
function paletteShortName(slotId) { return ({ square: '矩形', triangle: '三角', sawtooth: 'のこぎり', noise: 'ノイズ' })[paletteSlot(slotId)?.instrument] || paletteSoundName(slotId); }
function paletteNumber(slotId) { return currentPalette().findIndex((slot) => slot.slotId === slotId) + 1; }

function renderPalette() {
  tracksEl.replaceChildren();
  for (const slot of currentPalette()) {
    const track = song.tracks.find((candidate) => candidate.instrument === slot.slotId);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'audio-track-choice'; button.dataset.trackId = track.trackId;
    button.setAttribute('aria-pressed', String(track.trackId === activeTrackId));
    button.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}、${slot.color}、${paletteSoundName(slot.slotId)}。描く色を選ぶ`);
    const mark = document.createElement('span'); mark.className = 'audio-track-choice__mark'; mark.style.backgroundColor = slot.color; mark.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.className = 'audio-track-choice__label'; label.textContent = `色${paletteNumber(slot.slotId)}`;
    const preset = document.createElement('small'); preset.className = 'audio-track-choice__preset'; preset.textContent = paletteShortName(slot.slotId);
    button.append(mark, label, preset);
    tracksEl.append(button);
  }
}

function renderPaletteSettings() {
  paletteRows.replaceChildren();
  for (const slot of currentPalette()) {
    const row = document.createElement('div'); row.className = 'audio-palette-row';
    const label = document.createElement('span'); label.textContent = `色${paletteNumber(slot.slotId)}`;
    const color = document.createElement('input'); color.type = 'color'; color.value = slot.color; color.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}の色`);
    const instrument = document.createElement('select'); instrument.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}の音色`);
    for (const group of AUDIO_INSTRUMENT_GROUPS) {
      const options = document.createElement('optgroup'); options.label = group.name;
      for (const option of group.instruments) { const item = document.createElement('option'); item.value = option.id; item.textContent = option.name; options.append(item); }
      instrument.append(options);
    }
    instrument.value = slot.instrument;
    color.addEventListener('change', () => {
      try { song = setAudioPixelPalette(song, { slotId: slot.slotId, color: color.value }); renderPalette(); renderGrid(); setStatus(`色${paletteNumber(slot.slotId)}を変更しました。`); }
      catch (error) { color.value = paletteSlot(slot.slotId).color; setStatus(error.message || '色を変更できませんでした。'); }
    });
    instrument.addEventListener('change', () => {
      try { if (player.isPlaying || player.isStarting) player.stop(); song = setAudioPixelPalette(song, { slotId: slot.slotId, instrument: instrument.value }); renderPalette(); updateCanvasLabel(); setStatus(`色${paletteNumber(slot.slotId)}の音色を${paletteSoundName(slot.slotId)}にしました。`); }
      catch (error) { instrument.value = paletteSlot(slot.slotId).instrument; setStatus(error.message || '音色を変更できませんでした。'); }
    });
    row.append(label, color, instrument); paletteRows.append(row);
  }
}

function cellOwner(x, y) { return song.tracks.find((track) => trackNoteAt(track, PITCHES[y].midi, x * AUDIO_PIXEL_TICKS)) || null; }
function cellDescription(x, y) {
  const owner = cellOwner(x, y); const pitch = PITCHES[y];
  const willErase = activeTool === 'eraser' || owner?.trackId === selectedTrack().trackId;
  return `${pitch.label}、${Math.floor(x / 4) + 1}拍目の${x % 4 + 1}つ目の16分音符、${owner ? `色${paletteNumber(owner.instrument)}の${paletteSoundName(owner.instrument)}あり` : '音なし'}。${willErase ? 'EnterまたはSpaceで消去' : `選択中の色${paletteNumber(selectedTrack().instrument)}でEnterまたはSpaceを押して描画`}。矢印キーで移動します。`;
}
function updateCanvasLabel() { pixelCanvas.setAttribute('aria-label', `16列×16音程の音楽ピクセルキャンバス。${cellDescription(cursorCell.x, cursorCell.y)}`); positionCursor(); }
function renderGrid() { scalePixelBoard(); paintPixelCanvas(); updateCanvasLabel(); }

function paintPixelCanvas(changed = null) {
  const indices = changed === null ? audioPixels.keys() : changed;
  for (const index of indices) {
    const x = index % AUDIO_PIXEL_COLUMNS; const y = Math.floor(index / AUDIO_PIXEL_COLUMNS);
    const owner = cellOwner(x, y);
    audioPixels[index] = owner ? currentPalette().findIndex((slot) => slot.slotId === owner.instrument) : -1;
  }
  pixelSurface.paint(audioPixels, canvasColors(), changed);
}

function canvasCellAt(event) {
  const rect = pixelCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / rect.width * AUDIO_PIXEL_COLUMNS);
  const y = Math.floor((event.clientY - rect.top) / rect.height * PITCHES.length);
  if (x < 0 || x >= AUDIO_PIXEL_COLUMNS || y < 0 || y >= PITCHES.length) return null;
  return { x, y };
}

function applyPixel(cell, mode, { render = true, announce = true } = {}) {
  if (!cell) return false;
  const { x, y } = cell; const pitch = PITCHES[y].midi; const tick = x * AUDIO_PIXEL_TICKS;
  const track = selectedTrack(); const active = mode === 'paint';
  const owner = cellOwner(x, y);
  if (active && owner?.trackId === track.trackId) return false;
  if (!active && !owner) return false;
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    song = setAudioPixel(song, { trackId: track.trackId, pitch, startTick: tick, noteId: `note-${globalThis.crypto?.randomUUID?.() || Date.now()}-${x}-${y}`, active });
    if (render) { paintPixelCanvas([y * AUDIO_PIXEL_COLUMNS + x]); updateCanvasLabel(); }
    if (announce) setStatus(`${pitchName(pitch)}の音を${active ? `色${paletteNumber(track.instrument)}で描きました` : '消しました'}。`);
    return true;
  } catch (error) { setStatus(error.message || '音符を更新できませんでした。'); return false; }
}

function startPlayhead() {
  stopPlayhead(); playhead.hidden = false;
  const startedAt = performance.now(); const loopMs = song.loopTicks * 60 / song.tempo / AUDIO_PPQ * 1000;
  const draw = (now) => {
    if (!player.isPlaying) { stopPlayhead(); return; }
    if (pixelCanvas) {
      const boardRect = gridWrap.getBoundingClientRect(); const canvasRect = pixelCanvas.getBoundingClientRect();
      const phase = ((now - startedAt) % loopMs) / loopMs;
      playhead.style.left = `${canvasRect.left - boardRect.left + canvasRect.width * phase}px`;
      playhead.style.top = `${canvasRect.top - boardRect.top}px`;
      playhead.style.height = `${canvasRect.height}px`;
    }
    playheadFrame = requestAnimationFrame(draw);
  };
  playheadFrame = requestAnimationFrame(draw);
}

function stopPlayhead() {
  if (playheadFrame) cancelAnimationFrame(playheadFrame);
  playheadFrame = 0; if (playhead) playhead.hidden = true;
}

function renderSong({ focusCell = null } = {}) {
  validateAudioSong(song);
  activeTrackId = song.tracks.some((track) => track.trackId === activeTrackId) ? activeTrackId : song.tracks[0].trackId;
  renderPalette(); renderPaletteSettings(); renderGrid();
  tempoInput.value = String(song.tempo); tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
}

tracksEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-track-id]');
  if (!button) return;
  activeTrackId = button.dataset.trackId; renderPalette();
  const selected = [...tracksEl.querySelectorAll('button[data-track-id]')].find((candidate) => candidate.dataset.trackId === activeTrackId);
  selected?.focus(); updateCanvasLabel();
});

penButton.addEventListener('click', () => setTool('pen'));
eraserButton.addEventListener('click', () => setTool('eraser'));

gridWrap.addEventListener('pointerdown', (event) => {
  if (event.target !== pixelCanvas) return;
  const cell = canvasCellAt(event); if (!cell) return;
  event.preventDefault(); pixelCanvas.focus(); pointerDrawId = event.pointerId; pointerLastCell = cell; pixelCanvas.setPointerCapture(event.pointerId);
  const owner = cellOwner(cell.x, cell.y);
  pointerDrawMode = activeTool === 'eraser' || owner?.trackId === selectedTrack().trackId ? 'erase' : 'paint';
  keyboardCursor = false; cursorCell = cell; updateCanvasLabel(); applyPixel(cell, pointerDrawMode);
});
gridWrap.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointerDrawId) return;
  const cell = canvasCellAt(event); if (!cell || !pointerLastCell) return;
  const changed = [];
  for (const point of lineCells(pointerLastCell, cell)) if (applyPixel(point, pointerDrawMode, { render: false, announce: false })) changed.push(point.y * AUDIO_PIXEL_COLUMNS + point.x);
  pointerLastCell = cell; cursorCell = cell; if (changed.length) paintPixelCanvas(changed); updateCanvasLabel();
});
function lineCells(from, to) {
  const cells = []; let x = from.x; let y = from.y;
  const dx = Math.abs(to.x - from.x); const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y); const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push({ x, y }); if (x === to.x && y === to.y) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return cells;
}
function finishPointer(event) {
  if (event.pointerId !== pointerDrawId) return;
  pointerDrawId = null; pointerLastCell = null;
}
document.addEventListener('pointerup', finishPointer);
document.addEventListener('pointercancel', finishPointer);
pixelCanvas.addEventListener('focus', () => { keyboardCursor = pixelCanvas.matches(':focus-visible'); updateCanvasLabel(); });
pixelCanvas.addEventListener('blur', () => { cursor.hidden = true; });
pixelCanvas.addEventListener('keydown', (event) => {
  const next = { ...cursorCell };
  if (event.key === 'ArrowRight') next.x = Math.min(AUDIO_PIXEL_COLUMNS - 1, next.x + 1);
  else if (event.key === 'ArrowLeft') next.x = Math.max(0, next.x - 1);
  else if (event.key === 'ArrowUp') next.y = Math.max(0, next.y - 1);
  else if (event.key === 'ArrowDown') next.y = Math.min(PITCHES.length - 1, next.y + 1);
  else if (event.key === 'Enter' || event.key === ' ') {
    keyboardCursor = true;
    event.preventDefault(); const owner = cellOwner(cursorCell.x, cursorCell.y);
    applyPixel(cursorCell, activeTool === 'eraser' || owner?.trackId === selectedTrack().trackId ? 'erase' : 'paint'); return;
  } else return;
  event.preventDefault(); keyboardCursor = true; cursorCell = next; updateCanvasLabel();
  setStatus(cellDescription(cursorCell.x, cursorCell.y));
});

tempoInput.addEventListener('input', () => {
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    song = setAudioTempo(song, Number(tempoInput.value));
    tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
    setStatus('テンポを更新しました。');
  } catch (error) { setStatus(error.message || 'テンポを変更できませんでした。'); }
});

playButton.addEventListener('click', async () => {
  if (player.isPlaying || player.isStarting) { player.stop(); setStatus('再生を停止しました。'); return; }
  try {
    const started = await player.play(song);
    if (started) setStatus('再生中です。中央の停止ボタンで音を止められます。');
    else if (!collectAudioEvents(song).length) setStatus('まだ音符がありません。グリッドのマスを押して音を追加してください。');
  } catch {
    setStatus('このブラウザーで音を開始できませんでした。再生をもう一度押すか、対応したブラウザーをお使いください。');
  }
});

saveButton.addEventListener('click', async () => {
  if (!draftStore) return;
  saveButton.disabled = true; setStatus('端末に保存しています…');
  try {
    validateAudioSong(song);
    await draftStore.save({ draftId: currentDraftId, kind: 'song', ownerId: 'local-owner', document: song, source: song.imageSource ? { type: 'image_to_loop', assetId: song.imageSource.assetId, revisionId: song.imageSource.revisionId } : { type: 'hand_composed', assetId: null, revisionId: null } });
  } catch (error) {
    saveButton.disabled = false; setStatus(`保存できませんでした：${error.message || '空き容量とブラウザーの保存設定を確認してください。'}`); return;
  }
  try {
    localStorage.setItem(LAST_DRAFT_KEY, currentDraftId);
    resumeButton.hidden = false; saveButton.disabled = false; setStatus('曲をこの端末に保存しました。');
  } catch {
    saveButton.disabled = false; setStatus('曲本体は保存されましたが、前回の曲を開く目印を保存できませんでした。');
  }
});

resumeButton.addEventListener('click', async () => {
  if (!draftStore) return;
  let draftId;
  try { draftId = localStorage.getItem(LAST_DRAFT_KEY); }
  catch { setStatus('前回の曲を読み出せませんでした。'); return; }
  if (!draftId) { resumeButton.hidden = true; setStatus('前回の曲はありません。'); return; }
  resumeButton.disabled = true; setStatus('前回の曲を開いています…'); player.stop();
  try {
    const revision = await draftStore.load(draftId);
    if (!revision || revision.asset.kind !== 'song' || revision.asset.owner.type !== 'local' || revision.asset.owner.id !== 'local-owner' || revision.asset.visibility !== 'draft' || revision.document.songId !== draftId) throw new Error('保存した曲が見つかりません');
    validateAudioSong(revision.document);
    song = normalizeAudioPixelSong(revision.document); currentDraftId = draftId; activeTrackId = song.tracks[0].trackId;
    renderSong(); resumeButton.disabled = false; setStatus('前回の曲を開きました。');
  } catch {
    resumeButton.disabled = false; setStatus('曲を開けませんでした。端末内の保存内容を確認してください。');
  }
});

function stopOnExit() {
  if (player.isPlaying || player.isStarting) setStatus('画面を離れるため音を停止しました。');
  void player.dispose();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') stopOnExit(); });
window.addEventListener('pagehide', stopOnExit);
window.addEventListener('beforeunload', stopOnExit);

renderSong();
try { resumeButton.hidden = !draftStore || !localStorage.getItem(LAST_DRAFT_KEY); }
catch { resumeButton.hidden = true; }
refreshImageSources();
