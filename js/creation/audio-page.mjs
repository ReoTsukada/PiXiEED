import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { mountPictureShelf } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { hashCanonical } from './asset-contract.mjs';
import { importAudioImage, AUDIO_IMAGE_RULES_VERSION } from './audio-image.mjs?rev=20260928-dot-music-1';
import { beginAudioCamera, takeAudioCameraReturn, readAudioCameraDraft } from './audio-camera-handoff.mjs?rev=20260928-dot-music-1';
import { hasPerk, requestPass, onPassChange } from '../pixieed-pass.mjs?v=20260929-ad-diagnostics-1';
import { exportAudioImage, renderAudioWav } from './audio-export.mjs?rev=20260928-pixel-roundtrip-1';
import { renderAudioVideo } from './audio-video.mjs?rev=20260928-audio-video-1';
import { evaluateAudioPassPolicy } from './audio-pass-policy.mjs?rev=20260928-pass-policy-1';
import { saveFile } from '../pixel-export.mjs?rev=20260928-export-1';
import { createAudioViewport } from './audio-viewport.mjs?rev=20260928-dot-music-1';
import { CAMERA_HANDOFF_KEY, cameraHandoffImage, createImportedDrawDocument, decodeDrawImageFile } from './draw-import.mjs?rev=20260928-pixel-roundtrip-1';
import { validateDrawDocument } from './draw-core.mjs';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { AUDIO_INSTRUMENT_GROUPS, AUDIO_EXTRA_INSTRUMENT_IDS } from './audio-timbres.mjs?rev=20260928-dot-music-1';
import { createPxdProject } from './pxd-codec.mjs';
import { mountPxdTools, confirmPxdConversion } from './pxd-ui.mjs?rev=20260928-own-work-1';
import { pxdImageRoles, putPxdImage, readPxdImage } from './pxd-project.mjs';
import { assertPxdAudioPixelCompatibility, assignPxdAudioColor, audioCellLink, audioSongImage, preparePxdAudioImageImport, readPxdAudioLink, readPxdAudioState, resizePxdAudioWorkingImage, validatePxdAudioBinding, writePxdAudioState } from './pxd-draw-audio.mjs';
import { documentRgba } from './draw-core.mjs';
import {
  AUDIO_INSTRUMENTS, AUDIO_PIXEL_COLUMNS, AUDIO_PIXEL_PALETTE, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PPQ,
  audioPixelColumns, resizeAudioCanvas, collectAudioEvents, createAudioPlayer, createAudioSong, normalizeAudioPixelSong, setAudioPixel, setAudioPixelPalette, setAudioTempo, validateAudioSong
} from './audio-core.mjs?rev=20260928-touch-motion-1';

const LAST_DRAFT_KEY = 'pixieed:creation:audio:last-draft:v1';
const LAST_DRAW_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const PITCHES = Object.freeze(AUDIO_PIXEL_PITCHES.map((midi, index) => ({ midi, label: ['ド6', 'ラ5', 'ソ5', 'ミ5', 'レ5', 'ド5', 'ラ4', 'ソ4', 'ミ4', 'レ4', 'ド4', 'ラ3', 'ソ3', 'ミ3', 'レ3', 'ド3'][index] })));
const status = document.querySelector('#audio-status');
const gridWrap = document.querySelector('#audio-grid-wrap');
const effectHost = gridWrap;
const pixelCanvas = document.querySelector('#audio-pixel-canvas');
const pixelSurface = createPixelCanvasSurface(pixelCanvas, { alpha: false, emptyColor: '#ffffff' });
let audioPixels = new Int16Array(AUDIO_PIXEL_COLUMNS * PITCHES.length).fill(-1);
let pxdImage = null; let pxdLink = null; let pxdBridge = null;
const cursor = document.querySelector('#audio-cursor');
const playhead = document.querySelector('#audio-playhead');
const tracksEl = document.querySelector('#audio-tracks');
const paletteRows = document.querySelector('#audio-palette-rows');
const pxdColorsPanel = document.createElement('div'); pxdColorsPanel.className = 'audio-pxd-colors'; pxdColorsPanel.hidden = true; paletteRows.after(pxdColorsPanel);
const tempoInput = document.querySelector('#audio-tempo');
const tempoValue = document.querySelector('#audio-tempo-value');
const playButton = document.querySelector('#audio-play-toggle');
const saveButton = document.querySelector('#audio-save');
const resumeButton = document.querySelector('#audio-resume');
const cameraSourceButton = document.querySelector('#audio-from-camera');
const penButton = document.querySelector('#audio-tool-pen');
const eraserButton = document.querySelector('#audio-tool-eraser');
const sizeSelect = document.querySelector('#audio-canvas-size');
const extraInstrumentsButton = document.querySelector('#audio-extra-instruments');
const exportSoundButton = document.querySelector('#audio-export-sound');
const exportVideoButton = document.querySelector('#audio-export-video');
const cancelVideoButton = document.querySelector('#audio-cancel-video');
const audioPassRequired = document.querySelector('#audio-pass-required');
const audioPassAddButton = document.querySelector('#audio-pass-add');
const photoButton = document.querySelector('#audio-take-photo');
const exportImageButton = document.querySelector('#audio-export-image');
const extraInstrumentIds = new Set(AUDIO_EXTRA_INSTRUMENT_IDS);

let draftStore = null; let pictureShelf = null;
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
let audioVideoController = null;
let audioVideoEpoch = 0;
let audioWavExporting = false;
let canvasPaletteSource = null;
let canvasPaletteColors = null;
let gestureOriginalSong = null;
let gestureOriginalImage = null; let gestureOriginalLink = null;
const interactionEffects = createInteractionEffects();
let effectEpoch = 0;
let playbackColumn = -1;
let playbackCells = [];
const viewport = createAudioViewport(pixelCanvas, gridWrap, {
  onStrokeStart: () => { gestureOriginalSong = song; gestureOriginalImage = pxdImage ? structuredClone(pxdImage) : null; gestureOriginalLink = pxdLink ? structuredClone(pxdLink) : null; },
  onGestureStart: () => {
    // The first finger can begin a stroke before the second arrives. Restore
    // that stroke so pinching never inserts an accidental musical note.
    if (gestureOriginalSong) song = gestureOriginalSong;
    pxdImage = gestureOriginalImage; pxdLink = gestureOriginalLink;
    effectEpoch += 1; interactionEffects.clear(); player.stop(); pointerDrawId = null; pointerLastCell = null; renderGrid();
  },
  onChange: () => positionCursor()
});

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

let statusTimer = 0;
function setStatus(message) {
  status.textContent = message;
  clearTimeout(statusTimer);
  status.classList.toggle('is-visible', /できません|開けません|見つか|失われ|取り込みました|追加の音色|保存しました|まだ音符|動画|中止/.test(message));
  statusTimer = setTimeout(() => status.classList.remove('is-visible'), 4000);
}
function audioPassState() {
  return evaluateAudioPassPolicy(song, { passActive: hasPerk('audio.canvas-wide'), extraInstrumentIds: extraInstrumentIds });
}
function refreshAudioPassUi() {
  const policy = audioPassState();
  pixelCanvas.setAttribute('aria-disabled', String(policy.locked));
  pixelCanvas.classList.toggle('is-pass-locked', policy.locked);
  tempoInput.disabled = policy.locked;
  sizeSelect.disabled = policy.locked;
  penButton.disabled = policy.locked;
  eraserButton.disabled = policy.locked;
  playButton.disabled = policy.locked;
  photoButton.disabled = policy.locked;
  exportSoundButton.disabled = policy.locked || audioWavExporting;
  exportVideoButton.disabled = policy.locked || Boolean(audioVideoController);
  audioPassRequired.hidden = !policy.locked;
  if (policy.locked && (player.isPlaying || player.isStarting)) player.stop();
  return policy;
}
function columns() { return audioPixelColumns(song); }
function selectedTrack() { return song.tracks.find((track) => track.trackId === activeTrackId) || song.tracks[0]; }
function previewPitch(pitch, slotId = selectedTrack().instrument) {
  if (audioPassState().locked) return Promise.resolve(false);
  if (extraInstrumentIds.has(paletteSlot(slotId)?.instrument) && !hasPerk('audio.instruments-extra')) { setStatus('追加の音色を使うには時間を追加してください。'); return Promise.resolve(false); }
  const instrument = paletteSlot(slotId)?.instrument;
  return player.preview({ instrument, pitch }).then((played) => played, () => { setStatus('音を試聴できませんでした。端末の音量やブラウザーの設定を確認してください。'); return false; });
}
function previewCell(pitch, slotId, cell) {
  if (!cell) return;
  const epoch = effectEpoch;
  void previewPitch(pitch, slotId).then((played) => {
    if (!played || epoch !== effectEpoch || viewport.isGesturing || document.visibilityState !== 'visible') return;
    const color = paletteSlot(slotId)?.color;
    if (!color) return;
    const canvasRect = pixelCanvas.getBoundingClientRect(); const hostRect = effectHost.getBoundingClientRect();
    try { interactionEffects.note({ canvas: pixelCanvas, host: effectHost, x: cell.x, y: cell.y, columns: columns(), rows: PITCHES.length, color, canvasRect, hostRect }); } catch {}
  });
}
function trackNoteAt(track, pitch, tick) { return track.clips.flatMap((clip) => clip.notes).find((note) => note.pitch === pitch && tick >= note.startTick && tick < note.startTick + note.durationTicks) || null; }
function pitchName(pitch) { return PITCHES.find((item) => item.midi === pitch)?.label || `音程${pitch}`; }

function setTool(tool) {
  activeTool = tool; penButton.setAttribute('aria-pressed', String(tool === 'pen')); eraserButton.setAttribute('aria-pressed', String(tool === 'eraser'));
  updateCanvasLabel();
}

function scalePixelBoard() {
  viewport.resize(columns(), PITCHES.length);
}

function positionCursor() {
  cursor.hidden = document.activeElement !== pixelCanvas || !keyboardCursor;
  if (cursor.hidden) return;
  const canvasRect = pixelCanvas.getBoundingClientRect();
  const wrapRect = gridWrap.getBoundingClientRect();
  const cellWidth = canvasRect.width / columns();
  const cellHeight = canvasRect.height / PITCHES.length;
  cursor.style.left = `${canvasRect.left - wrapRect.left + cursorCell.x * cellWidth}px`;
  cursor.style.top = `${canvasRect.top - wrapRect.top + cursorCell.y * cellHeight}px`;
  cursor.style.width = `${cellWidth}px`;
  cursor.style.height = `${cellHeight}px`;
}

function refreshImageSources() {
  void pictureShelf?.refresh();
  cameraHandoff = cameraHandoffImage(); cameraSourceButton.hidden = !cameraHandoff;
}

async function beginFromImage(asset, document) {
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  if (!asset || !['pixel_art', 'pixel_camera'].includes(asset.kind) || asset.owner?.type !== 'local' || asset.owner?.id !== 'local-owner' || asset.visibility !== 'draft' || asset.reusePermission !== 'owner_only' || asset.hashScheme !== 'sha256-canonical-v1' || await hashCanonical(document) !== asset.contentHash) throw new Error('自分の端末の画像を確認できませんでした。');
  if (player.isPlaying || player.isStarting) player.stop();
  const image = { width: document.width, height: document.height, rgba: documentRgba(document) };
  const plan = preparePxdAudioImageImport(song, image);
  if (image.width !== plan.image.width || image.height !== plan.image.height) {
    const accepted = await confirmPxdConversion({ image, document: plan.workingDocument, title: '音楽用の絵を確認', applyLabel: 'このコピーで作曲', message: `${image.width} × ${image.height}pxの原本はそのまま残し、音楽用の${plan.image.width} × ${plan.image.height}pxへ縦横比を保って配置します。色は平均せず、対応する色だけ音が鳴ります。` });
    if (!accepted) { setStatus('取り込みを中止しました。元の曲と絵は変更していません。'); return; }
  }
  pxdBridge?.reset();
  song = { ...plan.song, imageSource: { assetId: asset.assetId, revisionId: asset.revisionId, contentHash: asset.contentHash, rulesVersion: AUDIO_IMAGE_RULES_VERSION } };
  pxdImage = plan.image; pxdLink = plan.link; pxdMainImage = image;
  activeTrackId = song.tracks[0].trackId;
  renderSong();
  setStatus('画像を音楽キャンバスに取り込みました。色や音色を自由に編集できます。');
}

// Any tool's picture can be brought in; the song keeps its own copy and the picture stays where it was.
try {
  pictureShelf = mountPictureShelf(document.querySelector('#audio-shelf'), {
    tool: 'audio', adapter: createIndexedDbDraftAdapter(), heading: '絵から曲をつくる',
    onPick: async (entry) => {
      const revision = entry.revision;
      if (revision.asset.hashScheme !== 'sha256-canonical-v1' || await hashCanonical(revision.document) !== revision.asset.contentHash) throw new Error('自分の保存版を確認できませんでした');
      validateDrawDocument(revision.document);
      await beginFromImage(revision.asset, revision.document);
    },
    onError: (error) => setStatus(error.message || '保存した絵から曲を作れませんでした。')
  });
} catch { pictureShelf = null; }

cameraSourceButton.addEventListener('click', async () => {
  cameraSourceButton.disabled = true; setStatus('端末内のカメラ画像を確認しています…');
  try {
    const handoff = cameraHandoffImage();
    if (!handoff) throw new Error('カメラ画像が見つからないか、受け渡し期限が切れています');
    const image = await decodeDrawImageFile(handoff.file, { keepScale: true });
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
  if (event.key === CAMERA_HANDOFF_KEY || event.key === LAST_DRAW_DRAFT_KEY || String(event.key).startsWith('pixieed:picture:')) refreshImageSources();
});
window.addEventListener('resize', () => { effectEpoch += 1; interactionEffects.clear(); scalePixelBoard(); }, { passive: true });
if (typeof globalThis.ResizeObserver === 'function') new globalThis.ResizeObserver(scalePixelBoard).observe(gridWrap);

function representativePxdColorId(slotId) {
  if (!pxdImage || !pxdLink) return null;
  return Object.entries(pxdLink.colorToSlot).find(([, mapped]) => mapped === slotId)?.[0] || null;
}
function pxdColorDisplayHex(colorId) {
  if (!colorId) return null;
  const rgba = [0, 2, 4, 6].map((index) => Number.parseInt(colorId.slice(5 + index, 7 + index), 16));
  const alpha = rgba[3] / 255;
  return `#${rgba.slice(0, 3).map((channel) => Math.round(channel * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}
function currentPalette() {
  const palette = song.pixelPalette || AUDIO_PIXEL_PALETTE;
  if (!pxdImage || !pxdLink) return palette;
  return palette.map((slot) => ({ ...slot, color: pxdColorDisplayHex(representativePxdColorId(slot.slotId)) || slot.color }));
}
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
  penButton.style.setProperty('--audio-selected-color', paletteSlot(selectedTrack().instrument)?.color || 'transparent');
}

function renderPaletteSettings() {
  const policy = refreshAudioPassUi();
  paletteRows.replaceChildren();
  for (const slot of currentPalette()) {
    const row = document.createElement('div'); row.className = 'audio-palette-row';
    const label = document.createElement('span'); label.textContent = `色${paletteNumber(slot.slotId)}`;
    const color = document.createElement('input'); color.type = 'color'; color.value = slot.color; color.disabled = policy.locked; color.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}の色`);
    if (pxdImage && pxdLink) { color.disabled = true; color.title = 'PXD画像の色は保持されます。「絵の色と音」で割り当てを変更してください。'; }
    const instrument = document.createElement('select'); instrument.disabled = policy.locked; instrument.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}の音色`);
    for (const group of AUDIO_INSTRUMENT_GROUPS) {
      const options = document.createElement('optgroup'); options.label = group.name;
      for (const option of group.instruments) {
        const item = document.createElement('option'); item.value = option.id;
        item.textContent = `${option.name}${extraInstrumentIds.has(option.id) && !hasPerk('audio.instruments-extra') ? ' ★' : ''}`;
        options.append(item);
      }
      instrument.append(options);
    }
    instrument.value = slot.instrument;
    color.addEventListener('change', () => {
      if (audioPassState().locked) { renderPaletteSettings(); return; }
      try { song = setAudioPixelPalette(song, { slotId: slot.slotId, color: color.value }); renderPalette(); renderGrid(); setStatus(`色${paletteNumber(slot.slotId)}を変更しました。`); }
      catch (error) { color.value = paletteSlot(slot.slotId).color; setStatus(error.message || '色を変更できませんでした。'); }
    });
    instrument.addEventListener('change', async () => {
      if (audioPassState().locked) { renderPaletteSettings(); return; }
      const chosen = instrument.value;
      if (extraInstrumentIds.has(chosen) && chosen !== paletteSlot(slot.slotId).instrument && !hasPerk('audio.instruments-extra')) {
        instrument.value = paletteSlot(slot.slotId).instrument;
        if (!await requestPass({ perk: 'audio.instruments-extra' })) return;
      }
      try { if (player.isPlaying || player.isStarting) player.stop(); song = setAudioPixelPalette(song, { slotId: slot.slotId, instrument: chosen }); renderPalette(); renderPaletteSettings(); updateCanvasLabel(); previewPitch(72, slot.slotId); setStatus(`色${paletteNumber(slot.slotId)}の音色を${paletteSoundName(slot.slotId)}にしました。`); }
      catch (error) { instrument.value = paletteSlot(slot.slotId).instrument; setStatus(error.message || '音色を変更できませんでした。'); }
    });
    row.append(label, color, instrument); paletteRows.append(row);
  }
  extraInstrumentsButton.hidden = hasPerk('audio.instruments-extra');
}

function cellOwner(x, y) { return song.tracks.find((track) => trackNoteAt(track, PITCHES[y].midi, x * AUDIO_PIXEL_TICKS)) || null; }
function cellDescription(x, y) {
  const owner = cellOwner(x, y); const pitch = PITCHES[y];
  const willErase = activeTool === 'eraser' || owner?.trackId === selectedTrack().trackId;
  return `${pitch.label}、${Math.floor(x / 4) + 1}拍目の${x % 4 + 1}つ目の16分音符、${owner ? `色${paletteNumber(owner.instrument)}の${paletteSoundName(owner.instrument)}あり` : '音なし'}。${willErase ? 'EnterまたはSpaceで消去' : `選択中の色${paletteNumber(selectedTrack().instrument)}でEnterまたはSpaceを押して描画`}。矢印キーで移動します。`;
}
function updateCanvasLabel() { pixelCanvas.setAttribute('aria-label', `${columns()}列×16音程の音楽ピクセルキャンバス。${cellDescription(cursorCell.x, cursorCell.y)}`); positionCursor(); }
function renderGrid() {
  if (pixelCanvas.width !== columns() || pixelCanvas.height !== PITCHES.length) {
    pixelSurface.resize(columns(), PITCHES.length);
    audioPixels = new Int16Array(columns() * PITCHES.length).fill(-1);
  }
  cursorCell.x = Math.min(cursorCell.x, columns() - 1);
  scalePixelBoard(); paintPixelCanvas(); updateCanvasLabel();
}

function paintPixelCanvas(changed = null) {
  const indices = changed === null ? audioPixels.keys() : changed;
  for (const index of indices) {
    const x = index % columns(); const y = Math.floor(index / columns());
    const owner = cellOwner(x, y);
    audioPixels[index] = owner ? currentPalette().findIndex((slot) => slot.slotId === owner.instrument) : -1;
  }
  pixelSurface.paint(audioPixels, canvasColors(), changed);
  if (pxdImage && pxdImage.width === columns() && pxdImage.height === PITCHES.length) {
    const context = pixelCanvas.getContext('2d'); const rgba = new Uint8ClampedArray(pxdImage.rgba.length);
    for (let offset = 0; offset < rgba.length; offset += 4) {
      const alpha = pxdImage.rgba[offset + 3] / 255;
      rgba[offset] = Math.round(pxdImage.rgba[offset] * alpha + 255 * (1 - alpha));
      rgba[offset + 1] = Math.round(pxdImage.rgba[offset + 1] * alpha + 255 * (1 - alpha));
      rgba[offset + 2] = Math.round(pxdImage.rgba[offset + 2] * alpha + 255 * (1 - alpha)); rgba[offset + 3] = 255;
    }
    context.putImageData(new ImageData(rgba, pxdImage.width, pxdImage.height), 0, 0);
  }
}

function imageColorId(rgba, offset) { return `rgba-${[0, 1, 2, 3].map((channel) => rgba[offset + channel].toString(16).padStart(2, '0')).join('')}`; }
function renderPxdColorAssignments() {
  pxdColorsPanel.replaceChildren(); pxdColorsPanel.hidden = !pxdImage || !pxdLink;
  if (pxdColorsPanel.hidden) return;
  const passLocked = audioPassState().locked;
  const colors = [...new Set(Array.from({ length: pxdImage.rgba.length / 4 }, (_, index) => imageColorId(pxdImage.rgba, index * 4)).filter((id) => !id.endsWith('00')))];
  const pageSize = 16; const pages = Math.max(1, Math.ceil(colors.length / pageSize)); pxdColorPage = Math.min(pxdColorPage, pages - 1);
  const title = document.createElement('strong'); title.textContent = '絵の色と音'; pxdColorsPanel.append(title);
  const range = document.createElement('span'); range.textContent = `${colors.length}色 · ${pxdColorPage + 1}/${pages}`; pxdColorsPanel.append(range);
  for (const colorId of colors.slice(pxdColorPage * pageSize, (pxdColorPage + 1) * pageSize)) {
    const row = document.createElement('label'); row.className = 'audio-pxd-color';
    const swatch = document.createElement('span'); swatch.setAttribute('aria-hidden', 'true');
    const hex = `#${colorId.slice(5)}`; swatch.style.backgroundColor = hex;
    const text = document.createElement('span'); text.textContent = hex.toUpperCase();
    const select = document.createElement('select'); select.disabled = passLocked; select.setAttribute('aria-label', `${hex}の音色割り当て`);
    const none = document.createElement('option'); none.value = ''; none.textContent = '無音'; select.append(none);
    for (const slot of song.pixelPalette || AUDIO_PIXEL_PALETTE) { const option = document.createElement('option'); option.value = slot.slotId; option.textContent = paletteShortName(slot.slotId); select.append(option); }
    select.value = pxdLink.colorToSlot[colorId] || '';
    select.addEventListener('change', () => {
      if (audioPassState().locked) { renderSong(); return; }
      try {
        const result = assignPxdAudioColor(song, pxdImage, pxdLink, colorId, select.value || null);
        song = result.song; pxdLink = result.link; renderSong(); setStatus(`${hex.toUpperCase()}を${select.value ? paletteShortName(select.value) : '無音'}に設定しました。`);
      } catch (error) { setStatus(error.message || '色の割り当てを変更できませんでした。'); renderPxdColorAssignments(); }
    });
    row.append(swatch, text, select); pxdColorsPanel.append(row);
  }
  const paging = document.createElement('div'); paging.className = 'audio-pxd-colors__paging';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '前の色'; previous.disabled = pxdColorPage === 0;
  previous.addEventListener('click', () => { pxdColorPage -= 1; renderPxdColorAssignments(); });
  const next = document.createElement('button'); next.type = 'button'; next.textContent = '次の色'; next.disabled = pxdColorPage + 1 >= pages;
  next.addEventListener('click', () => { pxdColorPage += 1; renderPxdColorAssignments(); });
  paging.append(previous, next); pxdColorsPanel.append(paging);
}

let pxdColorPage = 0; let pxdMainImage = null;
function updatePxdImageCell(cell, active, slotId) {
  if (!pxdImage || !pxdLink) return;
  const offset = (cell.y * pxdImage.width + cell.x) * 4;
  if (!active) pxdImage.rgba.set([0, 0, 0, 0], offset);
  else {
    const sourceColor = representativePxdColorId(slotId);
    let bytes;
    if (sourceColor) bytes = [0, 2, 4, 6].map((index) => Number.parseInt(sourceColor.slice(5 + index, 7 + index), 16));
    else {
      const color = paletteSlot(slotId)?.color || '#000000'; const hex = color.slice(1);
      bytes = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).concat(255);
      const id = `rgba-${bytes.map((value) => value.toString(16).padStart(2, '0')).join('')}`; pxdLink.colorToSlot[id] = slotId;
    }
    pxdImage.rgba.set(bytes, offset);
  }
}

function canvasCellAt(event) {
  const rect = pixelCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / rect.width * columns());
  const y = Math.floor((event.clientY - rect.top) / rect.height * PITCHES.length);
  if (x < 0 || x >= columns() || y < 0 || y >= PITCHES.length) return null;
  return { x, y };
}

function applyPixel(cell, mode, { render = true, announce = true, audition = true } = {}) {
  if (!cell || audioPassState().locked) return false;
  const { x, y } = cell; const pitch = PITCHES[y].midi; const tick = x * AUDIO_PIXEL_TICKS;
  const track = selectedTrack(); const active = mode === 'paint';
  if (active && extraInstrumentIds.has(paletteSlot(track.instrument)?.instrument) && !hasPerk('audio.instruments-extra')) { setStatus('追加の音色を使うには時間を追加してください。'); return false; }
  const owner = cellOwner(x, y);
  if (active && owner?.trackId === track.trackId) return false;
  if (!active && !owner && !pxdImage?.rgba[(y * columns() + x) * 4 + 3]) return false;
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    song = setAudioPixel(song, { trackId: track.trackId, pitch, startTick: tick, noteId: `note-${globalThis.crypto?.randomUUID?.() || Date.now()}-${x}-${y}`, active });
    if (pxdImage && pxdLink) updatePxdImageCell(cell, active, track.instrument);
    if (render) { paintPixelCanvas([y * columns() + x]); if (pxdImage) renderPxdColorAssignments(); updateCanvasLabel(); }
    if (active && audition) previewCell(pitch, track.instrument, cell);
    if (announce) setStatus(`${pitchName(pitch)}の音を${active ? `色${paletteNumber(track.instrument)}で描きました` : '消しました'}。`);
    return true;
  } catch (error) { setStatus(error.message || '音符を更新できませんでした。'); return false; }
}

function startPlayhead() {
  stopPlayhead(); playhead.hidden = false;
  playbackColumn = -1;
  playbackCells = Array.from({ length: columns() }, (_, x) => Array.from({ length: PITCHES.length }, (_, y) => ({ x, y, slot: audioPixels[y * columns() + x] })).filter(({ slot }) => slot >= 0));
  const draw = () => {
    if (!player.isPlaying) { stopPlayhead(); return; }
    const tick = player.currentTick;
    playhead.hidden = tick === null;
    if (pixelCanvas && tick !== null) {
      const boardRect = gridWrap.getBoundingClientRect(); const canvasRect = pixelCanvas.getBoundingClientRect();
      const phase = tick / song.loopTicks;
      playhead.style.left = `${canvasRect.left - boardRect.left + canvasRect.width * phase}px`;
      playhead.style.top = `${canvasRect.top - boardRect.top}px`;
      playhead.style.height = `${canvasRect.height}px`;
      const column = Math.min(columns() - 1, Math.floor(tick / AUDIO_PIXEL_TICKS));
      if (column !== playbackColumn) {
        playbackColumn = column;
        for (const cell of playbackCells[column].slice(0, 4)) {
          const color = currentPalette()[cell.slot]?.color;
          if (color) { try { interactionEffects.note({ canvas: pixelCanvas, host: effectHost, x: cell.x, y: cell.y, columns: columns(), rows: PITCHES.length, color, canvasRect, hostRect: boardRect }); } catch {} }
        }
      }
    }
    playheadFrame = requestAnimationFrame(draw);
  };
  playheadFrame = requestAnimationFrame(draw);
}

function stopPlayhead() {
  if (playheadFrame) cancelAnimationFrame(playheadFrame);
  playheadFrame = 0; playbackColumn = -1; playbackCells = []; interactionEffects.clear(); if (playhead) playhead.hidden = true;
}

function renderSong({ focusCell = null } = {}) {
  validateAudioSong(song);
  activeTrackId = song.tracks.some((track) => track.trackId === activeTrackId) ? activeTrackId : song.tracks[0].trackId;
  renderPalette(); renderPaletteSettings(); renderGrid(); renderPxdColorAssignments();
  sizeSelect.value = String(columns());
  tempoInput.value = String(song.tempo); tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
}

tracksEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-track-id]');
  if (!button) return;
  const from = button.querySelector('.audio-track-choice__mark')?.getBoundingClientRect();
  const track = song.tracks.find((candidate) => candidate.trackId === button.dataset.trackId);
  const selectedColor = currentPalette().find((slot) => slot.slotId === track?.instrument)?.color;
  activeTrackId = button.dataset.trackId; renderPalette();
  const selected = [...tracksEl.querySelectorAll('button[data-track-id]')].find((candidate) => candidate.dataset.trackId === activeTrackId);
  if (from && selected?.querySelector('.audio-track-choice__mark') && selectedColor) {
    try { interactionEffects.color({ from, to: penButton, color: selectedColor }); } catch {}
  }
  selected?.focus(); updateCanvasLabel();
});

penButton.addEventListener('click', () => setTool('pen'));
eraserButton.addEventListener('click', () => setTool('eraser'));

sizeSelect.addEventListener('change', async () => {
  const chosen = Number(sizeSelect.value); sizeSelect.value = String(columns());
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  if (chosen > columns() && chosen > AUDIO_PIXEL_COLUMNS && !hasPerk('audio.canvas-wide')) {
    if (!await requestPass({ perk: 'audio.canvas-wide' })) return;
  }
  try {
    player.stop();
    const resized = resizeAudioCanvas(song, chosen);
    if (pxdImage && pxdLink) {
      const copied = resizePxdAudioWorkingImage(pxdImage, pxdLink, chosen); song = resized; pxdImage = copied.image; pxdLink = copied.link;
    } else song = resized;
    renderSong();
    setStatus(`キャンバスを${columns()} × ${PITCHES.length}に変更しました。`);
  } catch (error) { sizeSelect.value = String(columns()); setStatus(error.message || 'キャンバスを変更できませんでした。'); }
});
extraInstrumentsButton.addEventListener('click', async () => {
  if (await requestPass({ perk: 'audio.instruments-extra' })) { renderPaletteSettings(); setStatus('追加の音色を「色と音」から選べます。'); }
});
audioPassAddButton.addEventListener('click', async () => {
  const policy = audioPassState();
  audioPassAddButton.disabled = true;
  try {
    if (await requestPass({ perk: policy.wideCanvas ? 'audio.canvas-wide' : 'audio.instruments-extra', extend: true })) {
      refreshAudioPassUi(); renderPaletteSettings(); setStatus('時間を追加しました。保存している曲と絵を続けて使えます。');
    }
  } finally { audioPassAddButton.disabled = false; }
});
onPassChange(() => renderPaletteSettings());

photoButton.addEventListener('click', async () => {
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  try {
    let pxd = null;
    if (pxdImage && pxdBridge) { const saved = await pxdBridge.save(); pxd = { projectId: saved.projectId, revisionId: saved.revisionId }; }
    const url = beginAudioCamera({ song, pxd }); player.stop(); location.assign(url);
  }
  catch (error) { setStatus(error.message || '撮影の準備を保存できませんでした。'); }
});
exportImageButton.addEventListener('click', async () => {
  const exportEpoch = effectEpoch;
  const sourceSnapshot = { song, image: pxdImage, link: pxdLink, bridge: pxdBridge, current: pxdBridge?.currentProject, held: pxdBridge?.heldProject };
  const selectedImage = pxdImage;
  const imageSnapshot = selectedImage ? { width: selectedImage.width, height: selectedImage.height, rgba: new Uint8ClampedArray(selectedImage.rgba) } : null;
  const songSnapshot = structuredClone(song);
  const unchangedSource = () => sourceSnapshot.song === song && sourceSnapshot.image === pxdImage && sourceSnapshot.link === pxdLink && sourceSnapshot.bridge === pxdBridge && sourceSnapshot.current === pxdBridge?.currentProject && sourceSnapshot.held === pxdBridge?.heldProject && (!sourceSnapshot.image || imageSnapshot.rgba.every((value, index) => value === sourceSnapshot.image.rgba[index]));
  exportImageButton.disabled = true;
  try {
    await pxdBridge?.assertCanSave();
    if (!unchangedSource()) throw new Error('素材が切り替わりました。絵をもう一度保存してください。');
    const { blob, width, height } = await exportAudioImage(songSnapshot, imageSnapshot ? { image: imageSnapshot } : {});
    if (!unchangedSource()) throw new Error('素材が切り替わりました。絵をもう一度保存してください。');
    const saved = await saveFile(blob, `pixieed-dot-music-${width}x${height}.png`);
    if (saved === 'cancelled') return;
    if (exportEpoch === effectEpoch && !viewport.isGesturing && document.visibilityState === 'visible') {
      try { interactionEffects.exportImage({ from: pixelCanvas, to: exportImageButton, image: pixelCanvas }); } catch {}
    }
    setStatus(`${width}×${height}pxで保存しました`);
  } catch (error) { setStatus(error.message || '絵を保存できませんでした。'); }
  finally { exportImageButton.disabled = false; }
});

// One compact panel at a time; leave the rest of the canvas available to draw.
const panels = [...document.querySelectorAll('.audio-popover')];
for (const panel of panels) panel.addEventListener('toggle', () => {
  if (panel.open) for (const other of panels) if (other !== panel) other.open = false;
});
document.addEventListener('pointerdown', (event) => {
  if (event.target.closest?.('#pxd-panel')) return;
  for (const panel of panels) if (panel.open && !panel.contains(event.target)) panel.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') for (const panel of panels) if (panel.open) { panel.open = false; panel.querySelector('summary').focus(); }
});

gridWrap.addEventListener('pointerdown', (event) => {
  if (viewport.isGesturing) return;
  if (event.target !== pixelCanvas) return;
  const cell = canvasCellAt(event); if (!cell) return;
  event.preventDefault(); pixelCanvas.focus(); pointerDrawId = event.pointerId; pointerLastCell = cell; pixelCanvas.setPointerCapture(event.pointerId);
  const owner = cellOwner(cell.x, cell.y);
  pointerDrawMode = activeTool === 'eraser' || owner?.trackId === selectedTrack().trackId ? 'erase' : 'paint';
  keyboardCursor = false; cursorCell = cell; updateCanvasLabel(); applyPixel(cell, pointerDrawMode);
});
gridWrap.addEventListener('pointermove', (event) => {
  if (viewport.isGesturing) return;
  if (event.pointerId !== pointerDrawId) return;
  const cell = canvasCellAt(event); if (!cell || !pointerLastCell) return;
  const changed = [];
  let lastChanged = null;
  for (const point of lineCells(pointerLastCell, cell)) if (applyPixel(point, pointerDrawMode, { render: false, announce: false, audition: false })) { changed.push(point.y * columns() + point.x); lastChanged = point; }
  pointerLastCell = cell; cursorCell = cell; if (changed.length) { paintPixelCanvas(changed); if (pointerDrawMode === 'paint' && lastChanged) previewCell(PITCHES[lastChanged.y].midi, selectedTrack().instrument, lastChanged); } updateCanvasLabel();
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
  if (event.type === 'pointercancel') { effectEpoch += 1; interactionEffects.clear(); }
  pointerDrawId = null; pointerLastCell = null;
}
document.addEventListener('pointerup', finishPointer);
document.addEventListener('pointercancel', finishPointer);
pixelCanvas.addEventListener('focus', () => { keyboardCursor = pixelCanvas.matches(':focus-visible'); updateCanvasLabel(); });
pixelCanvas.addEventListener('blur', () => { cursor.hidden = true; });
pixelCanvas.addEventListener('keydown', (event) => {
  const next = { ...cursorCell };
  if (event.key === 'ArrowRight') next.x = Math.min(columns() - 1, next.x + 1);
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
  if (audioPassState().locked) { tempoInput.value = String(song.tempo); setStatus('続けるには時間を追加してください。'); return; }
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    song = setAudioTempo(song, Number(tempoInput.value));
    tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
    setStatus('テンポを更新しました。');
  } catch (error) { setStatus(error.message || 'テンポを変更できませんでした。'); }
});

playButton.addEventListener('click', async () => {
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
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
  let pxdSaved = false;
  if (pxdImage && pxdBridge) {
    try { await pxdBridge.save(); pxdSaved = true; }
    catch (error) { saveButton.disabled = false; resumeButton.hidden = false; setStatus(`曲は端末に保存しましたが、PXDを更新できませんでした：${error.message}`); return; }
  }
  try {
    localStorage.setItem(LAST_DRAFT_KEY, currentDraftId);
    resumeButton.hidden = false; saveButton.disabled = false; setStatus(pxdSaved ? '曲とPXD作品をこの端末に保存しました。' : '曲をこの端末に保存しました。');
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
    pxdBridge?.reset(); pxdImage = null; pxdLink = null; pxdMainImage = null;
    song = normalizeAudioPixelSong(revision.document); currentDraftId = draftId; activeTrackId = song.tracks[0].trackId;
    renderSong(); resumeButton.disabled = false; setStatus('前回の曲を開きました。');
  } catch {
    resumeButton.disabled = false; setStatus('曲を開けませんでした。端末内の保存内容を確認してください。');
  }
});

function stopOnExit() {
  effectEpoch += 1; interactionEffects.clear();
  audioVideoController?.abort();
  if (player.isPlaying || player.isStarting) setStatus('画面を離れるため音を停止しました。');
  void player.dispose();

}
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') stopOnExit(); });
window.addEventListener('pagehide', stopOnExit);
window.addEventListener('beforeunload', stopOnExit);

pxdBridge = mountPxdTools({
  tool: 'audio',
  hasContent: () => Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject || pxdImage || collectAudioEvents(song).length),
  setStatus,
  async openProject(project) {
    const storedSong = readPxdAudioState(project); const storedImage = storedSong ? await readPxdImage(project, 'audio') : null;
    const storedLink = storedSong ? readPxdAudioLink(project) : null;
    let nextSong; let nextImage; let nextLink; let mainImage = null;
    if (storedSong && storedImage && storedLink) {
      if (storedImage.width !== audioPixelColumns(storedSong) || storedImage.height !== PITCHES.length) throw new TypeError('保存した音楽用画像とキャンバス寸法が一致しません。PXD原本は保持されています。');
      assertPxdAudioPixelCompatibility(storedSong); validatePxdAudioBinding(storedSong, storedImage, storedLink);
      nextSong = storedSong; nextImage = storedImage; nextLink = storedLink;
    } else if (storedSong && !storedImage && !storedLink) {
      assertPxdAudioPixelCompatibility(storedSong);
      nextSong = storedSong; nextImage = audioSongImage(storedSong); nextLink = audioCellLink(storedSong);
    } else if (storedSong) {
      throw new TypeError('保存した曲の画像連携が不足または不整合です。PXD原本は保持されています。');
    } else {
      const params = new URLSearchParams(location.search); const requested = params.getAll('pxdImage').length === 1 ? params.get('pxdImage') : null;
      const roles = pxdImageRoles(project); const role = [requested, 'main', 'draw', 'jigsaw-main', 'hidden', 'audio', 'spot-after'].find((candidate) => candidate && roles.includes(candidate));
      if (!role) throw new TypeError('このPXDには音楽へつなげる画像がありません。');
      mainImage = await readPxdImage(project, role);
      const plan = preparePxdAudioImageImport(song, mainImage);
      if (mainImage.width !== plan.image.width || mainImage.height !== plan.image.height) {
        const accepted = await confirmPxdConversion({ image: mainImage, document: plan.workingDocument, title: '音楽用の絵を確認', applyLabel: 'このコピーで作曲', message: `${mainImage.width} × ${mainImage.height}pxの原本をPXDに残し、${plan.image.width} × ${plan.image.height}pxの音楽用コピーを作ります。縦横比を保ち、余白を加えます。色は平均せず、割り当てた色だけ音が鳴ります。` });
        if (!accepted) throw new Error('音楽用コピーの作成を中止しました。PXD原本は変更していません。');
      }
      nextSong = plan.song; nextImage = plan.image; nextLink = plan.link;
    }
    validateAudioSong(nextSong);
    if (player.isPlaying || player.isStarting) player.stop();
    song = nextSong; pxdImage = nextImage; pxdLink = nextLink; pxdMainImage = mainImage; activeTrackId = song.tracks[0].trackId; currentDraftId = song.songId;
    renderSong();
  },
  async getProject(project) {
    let next = project || createPxdProject();
    if (!project && pxdMainImage) next = await putPxdImage(next, pxdMainImage, 'main');
    next = await writePxdAudioState(next, song, { image: pxdImage || audioSongImage(song), link: pxdLink || audioCellLink(song) });
    return next;
  }
});

try {
  await pxdBridge.ready;
  const cancelled = new URLSearchParams(location.search).get('cancelled') === '1';
  const handoff = cancelled ? null : takeAudioCameraReturn();
  if (handoff) {
    const samePxd = handoff.pxd && pxdBridge.currentProject?.projectId === handoff.pxd.projectId && pxdBridge.currentProject?.revisionId === handoff.pxd.revisionId;
    const baseSong = samePxd ? song : { ...handoff.song };
    if (!samePxd) delete baseSong.imageSource;
    const image = { width: handoff.document.width, height: handoff.document.height, rgba: documentRgba(handoff.document) };
    const plan = preparePxdAudioImageImport(baseSong, image);
    if (image.width !== plan.image.width || image.height !== plan.image.height) {
      const accepted = await confirmPxdConversion({ image, document: plan.workingDocument, title: '撮影した絵を確認', applyLabel: 'このコピーで作曲', message: `${image.width} × ${image.height}pxの撮影画像を、音楽用の${plan.image.width} × ${plan.image.height}pxへ縦横比を保って配置します。原本は残り、割り当てた色だけ音が鳴ります。` });
      if (!accepted) throw new Error('撮影画像の取り込みを中止しました。撮影前の曲は保持されています。');
    }
    song = plan.song; pxdImage = plan.image; pxdLink = plan.link;
    if (!samePxd) pxdMainImage = image;
    currentDraftId = song.songId; activeTrackId = song.tracks[0].trackId;
    setStatus('撮った写真を音楽キャンバスに取り込みました。中央のボタンで再生できます。');
    history.replaceState(null, '', '/audio/');
  } else {
    const draft = readAudioCameraDraft();
    if (draft) {
      const samePxd = draft.pxd && pxdBridge.currentProject?.projectId === draft.pxd.projectId && pxdBridge.currentProject?.revisionId === draft.pxd.revisionId;
      if (!samePxd) { pxdBridge.reset(); pxdImage = null; pxdLink = null; pxdMainImage = null; song = draft.song; }
      currentDraftId = song.songId; activeTrackId = song.tracks[0].trackId;
      setStatus(cancelled ? '撮影前の曲に戻りました。' : '写真を取り込めませんでした。撮影前の曲は残しています。');
      history.replaceState(null, '', '/audio/');
    }
  }
} catch (error) { setStatus(error.message || '撮った写真を取り込めませんでした。'); }
renderSong();
try { resumeButton.hidden = !draftStore || !localStorage.getItem(LAST_DRAFT_KEY); }
catch { resumeButton.hidden = true; }
refreshImageSources();

// ---- the song as a sound file (WAV): the loop repeated to about 8 seconds, same instruments as playback ----
exportSoundButton?.addEventListener('click', async () => {
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  const sourceSong = song; const sourceImage = pxdImage; const sourceLink = pxdLink; const sourceBridge = pxdBridge;
  const sourceCurrent = pxdBridge?.currentProject; const sourceHeld = pxdBridge?.heldProject;
  const unchanged = () => sourceSong === song && sourceImage === pxdImage && sourceLink === pxdLink && sourceBridge === pxdBridge && sourceCurrent === pxdBridge?.currentProject && sourceHeld === pxdBridge?.heldProject;
  audioWavExporting = true; refreshAudioPassUi(); setStatus('音を書き出しています…');
  try {
    await sourceBridge?.assertCanSave();
    if (!unchanged()) throw new Error('素材が切り替わりました。音をもう一度保存してください。');
    const songSnapshot = structuredClone(sourceSong);
    const { blob, seconds } = await renderAudioWav(songSnapshot);
    if (!unchanged()) throw new Error('素材が切り替わりました。音をもう一度保存してください。');
    const saved = await saveFile(blob, `pixieed-dot-music-${Math.round(seconds)}s.wav`);
    if (saved !== 'cancelled') setStatus(`${Math.round(seconds)}秒の音を保存しました`);
    document.querySelector('#audio-more')?.removeAttribute('open');
  } catch (error) { setStatus(error.message || '音を保存できませんでした。'); }
  finally { audioWavExporting = false; refreshAudioPassUi(); }
});

exportVideoButton?.addEventListener('click', async () => {
  if (audioVideoController) return;
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  const controller = new AbortController(); const epoch = ++audioVideoEpoch;
  audioVideoController = controller;
  const sourceSnapshot = { song, image: pxdImage, link: pxdLink, bridge: pxdBridge, current: pxdBridge?.currentProject, held: pxdBridge?.heldProject };
  const selectedImage = pxdImage || audioSongImage(song);
  const imageSnapshot = { width: selectedImage.width, height: selectedImage.height, rgba: new Uint8ClampedArray(selectedImage.rgba) };
  const unchangedSource = () => sourceSnapshot.song === song && sourceSnapshot.image === pxdImage && sourceSnapshot.link === pxdLink && sourceSnapshot.bridge === pxdBridge && sourceSnapshot.current === pxdBridge?.currentProject && sourceSnapshot.held === pxdBridge?.heldProject && (sourceSnapshot.image === null || imageSnapshot.rgba.every((value, index) => value === sourceSnapshot.image.rgba[index]));
  const songSnapshot = structuredClone(song);
  refreshAudioPassUi();
  cancelVideoButton.hidden = false;
  status.classList.add('is-visible'); status.textContent = '1ループの動画を作成しています…';
  try {
    await pxdBridge?.assertCanSave();
    if (!unchangedSource() || epoch !== audioVideoEpoch) throw new Error('素材が切り替わりました。音付き動画をもう一度作成してください。');
    if (controller.signal.aborted) { const error = new Error('動画の作成を中止しました。'); error.name = 'AbortError'; throw error; }
    const result = await renderAudioVideo(songSnapshot, imageSnapshot, {
      signal: controller.signal,
      onProgress(progress) {
        if (epoch === audioVideoEpoch && audioVideoController === controller && unchangedSource()) status.textContent = `動画を作成しています… ${Math.min(99, Math.floor(progress * 100))}%`;
        else controller.abort();
      }
    });
    if (epoch !== audioVideoEpoch || controller.signal.aborted || !unchangedSource()) return;
    status.textContent = '動画を端末に保存しています…';
    if (!unchangedSource()) return;
    const saved = await saveFile(result.blob, `pixieed-dot-music-${Math.round(result.seconds)}s.${result.extension}`);
    if (saved !== 'cancelled') setStatus(`${Math.round(result.seconds)}秒の音付き動画を保存しました。`);
    document.querySelector('#audio-more')?.removeAttribute('open');
  } catch (error) {
    if (epoch !== audioVideoEpoch) return;
    if (error?.name === 'AbortError') setStatus('動画の作成を中止しました。曲と絵はそのままです。');
    else setStatus(error.message || '音付き動画を作成できませんでした。PNGとWAVは引き続き保存できます。');
  } finally {
    if (audioVideoController === controller) audioVideoController = null;
    if (epoch === audioVideoEpoch) { cancelVideoButton.hidden = true; refreshAudioPassUi(); }
  }
});
cancelVideoButton?.addEventListener('click', () => audioVideoController?.abort());
