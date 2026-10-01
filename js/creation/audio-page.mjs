import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { mountPictureShelf } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { hashCanonical } from './asset-contract.mjs';
import { importAudioImage, AUDIO_IMAGE_RULES_VERSION } from './audio-image.mjs?rev=20260930-audio-timebase-1';
import { beginAudioCamera, takeAudioCameraReturn, readAudioCameraDraft } from './audio-camera-handoff.mjs?rev=20260930-audio-timebase-1';
import { hasPerk, requestPass, onPassChange } from '../pixieed-pass.mjs?v=20260930-rewarded-gpt-1';
import { exportAudioImage, renderAudioWav } from './audio-export.mjs?rev=20260930-audio-timebase-1';
import { renderAudioVideo } from './audio-video.mjs?rev=20260930-audio-timebase-1';
import { evaluateAudioPassPolicy } from './audio-pass-policy.mjs?rev=20260930-audio-timebase-1';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20260930-shared-canvas-5';
import { saveFile } from '../pixel-export.mjs?rev=20260928-export-1';
import { createAudioViewport } from './audio-viewport.mjs?rev=20260930-shared-canvas-5';
import { CAMERA_HANDOFF_KEY, cameraHandoffImage, createImportedDrawDocument, decodeDrawImageFile } from './draw-import.mjs?rev=20260928-pixel-roundtrip-1';
import { validateDrawDocument } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { AUDIO_INSTRUMENT_GROUPS, AUDIO_EXTRA_INSTRUMENT_IDS } from './audio-timbres.mjs?rev=20260930-four-voices-1';
import { getAudioInstrumentIcon, audioInstrumentIconFilter } from './audio-instrument-icons.mjs?rev=20260929-music-icons-1';
import { createPxdProject } from './pxd-codec.mjs';
import { mountProjectWorkspace as mountPxdTools } from './project-workspace.mjs?rev=20261001-components-1';
import { pxdImageRoles, putPxdImage, readPxdImage, readPxdSharedImage, putPxdSharedImage } from './pxd-project.mjs?rev=20260930-shared-canvas-5';
import { assertPxdAudioPixelCompatibility, assignPxdAudioColor, audioCellLink, audioSongImage, detachPxdAudioImage, prepareSharedAudioImageImport, readPxdAudioLink, readPxdAudioState, resizePxdAudioWorkingImage, setSharedAudioCell, validatePxdAudioBinding, writePxdAudioState } from './pxd-draw-audio.mjs?rev=20261001-components-1';
import { documentRgba } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { createToolResultView } from '../tool-result-view.mjs?rev=20260930-result-back-1';
import { mountCreationEditorUi } from './editor-ui.mjs?rev=20260929-shared-editor-1';
import {
  AUDIO_BAR_TICKS, AUDIO_INSTRUMENTS, AUDIO_PIXEL_COLUMNS, AUDIO_PIXEL_PALETTE, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PPQ,
  audioPixelColumns, createAudioRowPitchMap, resizeAudioCanvas, collectAudioEvents, createAudioPlayer, createAudioSong, normalizeAudioPixelSong, setAudioPixel, setAudioPixelPalette, setAudioTempo, validateAudioSong
} from './audio-core.mjs?rev=20260930-audio-timebase-1';

const LAST_DRAFT_KEY = 'pixieed:creation:audio:last-draft:v1';
const LAST_DRAW_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const PITCHES = Object.freeze(AUDIO_PIXEL_PITCHES.map((midi, index) => ({ midi, label: ['ド6', 'ラ5', 'ソ5', 'ミ5', 'レ5', 'ド5', 'ラ4', 'ソ4', 'ミ4', 'レ4', 'ド4', 'ラ3', 'ソ3', 'ミ3', 'レ3', 'ド3'][index] })));
const status = document.querySelector('#audio-status');
const gridWrap = document.querySelector('#audio-grid-wrap');
const effectHost = gridWrap;
const pixelCanvas = document.querySelector('#audio-pixel-canvas');
const resultView = createToolResultView({ key: 'audio-result', main: document.querySelector('#main'), returnLabel: '曲づくりに戻る',
  beforeShow: () => { effectEpoch += 1; editorUi.closePanels(); interactionEffects.clear(); }, onClose: () => scalePixelBoard() });
const editorUi = mountCreationEditorUi(document.querySelector('#main'));
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

let draftStore = null; let pictureShelf = null; let loadingLegacy = false;
let song = createAudioSong({ songId: globalThis.crypto?.randomUUID?.() || `song-${Date.now()}` });
const initialSharedImage = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
const initialSharedPlan = prepareSharedAudioImageImport(song, initialSharedImage);
song = initialSharedPlan.song; pxdImage = initialSharedPlan.image; pxdLink = initialSharedPlan.link;
let activeTrackId = song.tracks[0].trackId;
let selectedColorId = null;
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
  status.classList.toggle('is-visible', /できません|開けません|見つか|失われ|取り込みました|追加の音色|保存しました|まだ音符|動画|中止|無音/.test(message));
  statusTimer = setTimeout(() => status.classList.remove('is-visible'), 4000);
}
function hasSongNotes(candidate) {
  return candidate.tracks.some((track) => track.clips.some((clip) => clip.notes.length > 0));
}
function hasAudioArtwork(candidateSong, image) {
  return hasSongNotes(candidateSong) || Boolean(image?.rgba?.some((value, index) => index % 4 === 3 && value > 0));
}
function showAudioResult({ title, detail, preview = pixelCanvas }) {
  if (player.isPlaying || player.isStarting) player.stop();
  document.querySelectorAll('.audio-popover[open]').forEach((panel) => { panel.open = false; });
  resultView.show({ title, detail, preview });
}
function audioPassState() {
  const shared = pxdLink?.rulesVersion === 'shared-canvas-v1' ? pxdImage : null;
  const active = hasPerk('project.canvas-expanded') || hasPerk('audio.canvas-wide');
  return evaluateAudioPassPolicy(song, { passActive: active, extraInstrumentPassActive: hasPerk('audio.instruments-extra'), extraInstrumentIds, sharedImage: shared });
}
function refreshAudioPassUi() {
  const policy = audioPassState();
  const sizePerkActive = hasPerk('audio.canvas-wide') || hasPerk('project.canvas-expanded');
  for (const option of sizeSelect.options) if (Number(option.value) > AUDIO_PIXEL_COLUMNS) {
    option.textContent = `${option.value} × ${PITCHES.length} ${sizePerkActive ? '★' : '🔒'} 特典`;
  }
  pixelCanvas.setAttribute('aria-disabled', String(policy.locked));
  pixelCanvas.classList.toggle('is-pass-locked', policy.locked);
  tempoInput.disabled = policy.locked;
  sizeSelect.disabled = policy.locked || sharedMode();
  penButton.disabled = policy.locked;
  eraserButton.disabled = policy.locked;
  playButton.disabled = policy.locked && !player.isPlaying && !player.isStarting;
  photoButton.disabled = policy.locked;
  exportSoundButton.disabled = policy.locked || audioWavExporting;
  exportVideoButton.disabled = policy.locked || Boolean(audioVideoController);
  audioPassRequired.hidden = !policy.locked;
  if (policy.locked && (player.isPlaying || player.isStarting)) player.stopAfterCurrentLoop();
  return policy;
}
function sharedMode() { return pxdLink?.rulesVersion === 'shared-canvas-v1' && Boolean(pxdImage); }
function columns() { return sharedMode() ? pxdImage.width : audioPixelColumns(song); }
function rows() { return sharedMode() ? pxdImage.height : PITCHES.length; }
function pitchAtRow(y) { return sharedMode() ? pxdLink.rowPitchMap[y] : PITCHES[y]?.midi; }
function pitchLabelAtRow(y) { return PITCHES.find((item) => item.midi === pitchAtRow(y))?.label || `音程${pitchAtRow(y)}`; }
function tickAtColumn(x) { return x * AUDIO_PIXEL_TICKS; }
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
    try { interactionEffects.note({ canvas: pixelCanvas, host: effectHost, x: cell.x, y: cell.y, columns: columns(), rows: rows(), color, canvasRect, hostRect }); } catch {}
  });
}
function trackNoteAt(track, pitch, tick) { return track.clips.flatMap((clip) => clip.notes).find((note) => note.pitch === pitch && tick >= note.startTick && tick < note.startTick + note.durationTicks) || null; }
function pitchName(pitch) { return PITCHES.find((item) => item.midi === pitch)?.label || `音程${pitch}`; }

function setTool(tool) {
  activeTool = tool; penButton.setAttribute('aria-pressed', String(tool === 'pen')); eraserButton.setAttribute('aria-pressed', String(tool === 'eraser'));
  updateCanvasLabel();
}

function scalePixelBoard() {
  viewport.resize(columns(), rows());
}

function positionCursor() {
  cursor.hidden = document.activeElement !== pixelCanvas || !keyboardCursor;
  if (cursor.hidden) return;
  const canvasRect = pixelCanvas.getBoundingClientRect();
  const wrapRect = gridWrap.getBoundingClientRect();
  const cellWidth = canvasRect.width / columns();
  const cellHeight = canvasRect.height / rows();
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
  if (pxdBridge?.beforeReplace && !loadingLegacy) {
    await pxdBridge.beforeReplace(async () => { loadingLegacy = true; try { await beginFromImage(asset, document); } finally { loadingLegacy = false; } }); return;
  }
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  if (!asset || !['pixel_art', 'pixel_camera'].includes(asset.kind) || asset.owner?.type !== 'local' || asset.owner?.id !== 'local-owner' || asset.visibility !== 'draft' || asset.reusePermission !== 'owner_only' || asset.hashScheme !== 'sha256-canonical-v1' || await hashCanonical(document) !== asset.contentHash) throw new Error('自分の端末の画像を確認できませんでした。');
  if (player.isPlaying || player.isStarting) player.stop();
  const image = { width: document.width, height: document.height, rgba: documentRgba(document) };
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: crypto.randomUUID() }), image);
  const targetPolicy = evaluateAudioPassPolicy(plan.song, { passActive: hasPerk('project.canvas-expanded'), extraInstrumentPassActive: hasPerk('audio.instruments-extra'), sharedImage: image });
  if (targetPolicy.locked && !(await requestPass({ perk: 'project.canvas-expanded' }))) { setStatus('この画像を使うには共通キャンバスの時間が必要です。'); return; }
  pxdBridge?.reset();
  song = { ...plan.song, imageSource: { assetId: asset.assetId, revisionId: asset.revisionId, contentHash: asset.contentHash, rulesVersion: AUDIO_IMAGE_RULES_VERSION } };
  pxdImage = plan.image; pxdLink = plan.link; pxdMainImage = image;
  activeTrackId = song.tracks[0].trackId; selectedColorId = null;
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
function instrumentIcon(instrumentId) {
  return getAudioInstrumentIcon(instrumentId)
    || { name: AUDIO_INSTRUMENTS.find((instrument) => instrument.id === instrumentId)?.name || '音色', url: '' };
}
function createInstrumentIcon(instrumentId, color, className) {
  const icon = instrumentIcon(instrumentId);
  const image = document.createElement('img');
  image.className = className;
  if (icon.url) image.src = icon.url;
  else image.hidden = true;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.title = icon.name;
  image.style.filter = audioInstrumentIconFilter(color);
  return image;
}
function paletteNumber(slotId) { return currentPalette().findIndex((slot) => slot.slotId === slotId) + 1; }
function paletteShortName(slotId) { return `色${paletteNumber(slotId)}・${paletteSoundName(slotId)}`; }
function selectedPaintColor() { return selectedColorId ? `#${selectedColorId.slice(5, 11)}` : paletteSlot(selectedTrack().instrument)?.color || 'transparent'; }
function selectedPaintSlot() { return selectedColorId ? pxdLink?.colorToSlot[selectedColorId] ?? null : selectedTrack().instrument; }

function renderPalette() {
  if (selectedColorId && (!sharedMode() || !Object.hasOwn(pxdLink.colorToSlot, selectedColorId))) selectedColorId = null;
  if (selectedColorId?.endsWith('ff')) {
    const slotId = pxdLink.colorToSlot[selectedColorId];
    const slot = slotId && paletteSlot(slotId);
    if (slot?.color.toLowerCase() === `#${selectedColorId.slice(5, 11)}`) {
      activeTrackId = song.tracks.find((track) => track.instrument === slotId)?.trackId || activeTrackId;
      selectedColorId = null;
    }
  }
  tracksEl.replaceChildren();
  for (const slot of currentPalette()) {
    const track = song.tracks.find((candidate) => candidate.instrument === slot.slotId);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'audio-track-choice'; button.dataset.trackId = track.trackId;
    button.setAttribute('aria-pressed', String(track.trackId === activeTrackId));
    if (selectedColorId) button.setAttribute('aria-pressed', 'false');
    const icon = instrumentIcon(slot.instrument);
    const perkLabel = extraInstrumentIds.has(slot.instrument) ? hasPerk('audio.instruments-extra') ? '、特典音色' : '、特典音色・利用には時間を追加' : '';
    button.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}、${slot.color}、${icon.name}${perkLabel}。描く色を選ぶ`);
    button.title = `${icon.name}・色${paletteNumber(slot.slotId)}${perkLabel}`;
    const mark = document.createElement('span'); mark.className = 'audio-track-choice__mark'; mark.style.backgroundColor = slot.color; mark.setAttribute('aria-hidden', 'true');
    mark.append(createInstrumentIcon(slot.instrument, slot.color, 'audio-instrument-icon'));
    if (extraInstrumentIds.has(slot.instrument)) button.dataset.perk = hasPerk('audio.instruments-extra') ? 'active' : 'locked';
    const label = document.createElement('span'); label.className = 'audio-track-choice__label'; label.textContent = `色${paletteNumber(slot.slotId)}`;
    button.append(mark, label);
    tracksEl.append(button);
  }
  if (sharedMode()) for (const [colorId, slotId] of Object.entries(pxdLink.colorToSlot)) {
    const hex = `#${colorId.slice(5, 11)}`;
    if (currentPalette().some((slot) => slot.slotId === slotId && slot.color.toLowerCase() === hex.toLowerCase())) continue;
    const slot = slotId ? paletteSlot(slotId) : null;
    const sound = slot ? instrumentIcon(slot.instrument).name : '無音';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'audio-track-choice'; button.dataset.colorId = colorId;
    button.setAttribute('aria-pressed', String(colorId === selectedColorId));
    const perkLabel = slot && extraInstrumentIds.has(slot.instrument) ? hasPerk('audio.instruments-extra') ? '・★ 特典音色' : '・🔒 特典音色' : '';
    button.setAttribute('aria-label', `${hex}、${sound}${perkLabel}。描く色を選ぶ。もう一度押すと音を設定`);
    button.title = `${hex}・${sound}${perkLabel}`;
    const mark = document.createElement('span'); mark.className = 'audio-track-choice__mark'; mark.style.backgroundColor = hex; mark.setAttribute('aria-hidden', 'true');
    if (slot) mark.append(createInstrumentIcon(slot.instrument, hex, 'audio-instrument-icon'));
    else { const silent = document.createElement('span'); silent.className = 'audio-track-choice__silent'; silent.textContent = '無音'; mark.append(silent); }
    if (slot && extraInstrumentIds.has(slot.instrument)) button.dataset.perk = hasPerk('audio.instruments-extra') ? 'active' : 'locked';
    button.append(mark); tracksEl.append(button);
  }
  if (sharedMode() && Object.keys(pxdLink.colorToSlot).length < 32) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'audio-track-choice audio-track-choice--add';
    add.textContent = '+'; add.setAttribute('aria-label', '無音の色を追加'); add.title = '無音の色を追加';
    const picker = document.createElement('input'); picker.type = 'color'; picker.className = 'audio-add-color-input'; picker.value = '#8ecdf0'; picker.setAttribute('aria-label', '追加する色');
    add.addEventListener('click', () => picker.click());
    picker.addEventListener('change', () => {
      if (audioPassState().locked || !sharedMode()) return;
      const colorId = `rgba-${picker.value.slice(1).toLowerCase()}ff`;
      if (!Object.hasOwn(pxdLink.colorToSlot, colorId)) {
        pxdLink = { ...pxdLink, colorToSlot: { ...pxdLink.colorToSlot, [colorId]: null } };
        pxdBridge?.markDirty();
      }
      selectedColorId = colorId; setTool('pen'); renderPalette(); renderPxdColorAssignments(); updateCanvasLabel();
      setStatus('無音の色を追加しました。絵に描いてから音色を割り当てられます。');
    });
    tracksEl.append(add, picker);
  }
  penButton.style.setProperty('--audio-selected-color', selectedPaintColor());
  const current = document.querySelector('#audio-current');
  if (current) {
    current.style.setProperty('--editor-color', selectedPaintColor());
    const name = selectedColorId ? `${selectedPaintColor()}、${selectedPaintSlot() ? paletteSoundName(selectedPaintSlot()) : '無音'}` : `色${paletteNumber(selectedTrack().instrument)}、${paletteSoundName(selectedTrack().instrument)}`;
    current.setAttribute('aria-label', `選択中の${name}を設定`);
    current.title = name;
  }
}

function renderPaletteSettings() {
  const policy = refreshAudioPassUi();
  const premiumInstrumentsActive = hasPerk('audio.instruments-extra');
  const legend = document.querySelector('#audio-instrument-legend');
  if (legend) legend.textContent = premiumInstrumentsActive ? '★ 特典音色が使えます' : '🔒 印の音色は特典で使えます';
  paletteRows.replaceChildren();
  for (const slot of currentPalette()) {
    const row = document.createElement('div'); row.className = 'audio-palette-row';
    const label = document.createElement('span'); label.textContent = `色${paletteNumber(slot.slotId)}`;
    const iconData = instrumentIcon(slot.instrument);
    const icon = createInstrumentIcon(slot.instrument, '#202a33', 'audio-palette-row__icon');
    icon.title = `${iconData.name}のアイコン`;
    const color = document.createElement('input'); color.type = 'color'; color.value = slot.color; color.disabled = policy.locked; color.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}の色`);
    if (pxdImage && pxdLink) { color.disabled = true; color.title = 'PXD画像の色は保持されます。「絵の色と音」で割り当てを変更してください。'; }
    const instrument = document.createElement('select'); instrument.disabled = policy.locked; instrument.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}の音色`);
    for (const group of AUDIO_INSTRUMENT_GROUPS) {
      const options = document.createElement('optgroup'); options.label = `${extraInstrumentIds.has(group.instruments[0]?.id) ? premiumInstrumentsActive ? '★ 特典・' : '🔒 特典・' : ''}${group.name}`;
      for (const option of group.instruments) {
        const item = document.createElement('option'); item.value = option.id;
        item.textContent = `${option.name}${extraInstrumentIds.has(option.id) ? premiumInstrumentsActive ? ' ★ 特典' : ' 🔒 特典' : ''}`;
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
        if (!await requestPass({ perk: 'audio.instruments-extra' }) || !hasPerk('audio.instruments-extra')) return;
      }
      try { if (player.isPlaying || player.isStarting) player.stop(); song = setAudioPixelPalette(song, { slotId: slot.slotId, instrument: chosen }); pxdBridge?.markDirty(); renderPalette(); renderPaletteSettings(); updateCanvasLabel(); previewPitch(72, slot.slotId); setStatus(`色${paletteNumber(slot.slotId)}の音色を${paletteSoundName(slot.slotId)}にしました。`); }
      catch (error) { instrument.value = paletteSlot(slot.slotId).instrument; setStatus(error.message || '音色を変更できませんでした。'); }
    });
    row.append(label, icon, color, instrument); paletteRows.append(row);
  }
  extraInstrumentsButton.hidden = hasPerk('audio.instruments-extra');
}

function cellOwner(x, y) {
  if (sharedMode()) return song.tracks.find((track) => track.clips.some((clip) => clip.notes.some((note) => note.sourceCell?.x === x && note.sourceCell?.y === y))) || null;
  return song.tracks.find((track) => trackNoteAt(track, PITCHES[y].midi, x * AUDIO_PIXEL_TICKS)) || null;
}
function selectedCellMatches(x, y, owner = cellOwner(x, y)) {
  if (selectedColorId && sharedMode()) return imageColorId(pxdImage.rgba, (y * columns() + x) * 4) === selectedColorId;
  return owner?.trackId === selectedTrack().trackId;
}
function cellDescription(x, y) {
  const owner = cellOwner(x, y); const pitch = { midi: pitchAtRow(y), label: pitchLabelAtRow(y) };
  const tick = tickAtColumn(x);
  const timeLabel = sharedMode() ? `${Math.floor(tick / AUDIO_BAR_TICKS) + 1}小節の${tick}Tick` : `${Math.floor(x / 4) + 1}拍目の${x % 4 + 1}つ目の16分音符`;
  const willErase = activeTool === 'eraser' || selectedCellMatches(x, y, owner);
  const paintName = selectedColorId ? `${selectedPaintColor()}の${selectedPaintSlot() ? paletteSoundName(selectedPaintSlot()) : '無音の色'}` : `色${paletteNumber(selectedTrack().instrument)}`;
  return `${pitch.label}、${timeLabel}、${owner ? `色${paletteNumber(owner.instrument)}の${paletteSoundName(owner.instrument)}あり` : '音なし'}。${willErase ? 'EnterまたはSpaceで消去' : `選択中の${paintName}でEnterまたはSpaceを押して描画`}。矢印キーで移動します。`;
}
function updateCanvasLabel() { pixelCanvas.setAttribute('aria-label', `${columns()}列×${rows()}行の共有画像キャンバス。${cellDescription(cursorCell.x, cursorCell.y)}`); positionCursor(); }
function renderGrid() {
  pxdBridge?.markDirty();
  if (pixelCanvas.width !== columns() || pixelCanvas.height !== rows()) {
    pixelSurface.resize(columns(), rows());
    audioPixels = new Int16Array(columns() * rows()).fill(-1);
  }
  cursorCell.x = Math.min(cursorCell.x, columns() - 1);
  cursorCell.y = Math.min(cursorCell.y, rows() - 1);
  scalePixelBoard(); paintPixelCanvas(); updateCanvasLabel();
}

function paintPixelCanvas(changed = null) {
  if (sharedMode() && changed === null) {
    audioPixels.fill(-1);
    for (const track of song.tracks) {
      const slot = currentPalette().findIndex((entry) => entry.slotId === track.instrument);
      if (slot < 0) continue;
      for (const clip of track.clips) for (const note of clip.notes) {
        const { x, y } = note.sourceCell || {};
        if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < columns() && y >= 0 && y < rows()) audioPixels[y * columns() + x] = slot;
      }
    }
  }
  const indices = changed === null ? audioPixels.keys() : changed;
  for (const index of indices) {
    const x = index % columns(); const y = Math.floor(index / columns());
    const owner = cellOwner(x, y);
    audioPixels[index] = owner ? currentPalette().findIndex((slot) => slot.slotId === owner.instrument) : -1;
  }
  pixelSurface.paint(audioPixels, canvasColors(), changed);
  if (pxdImage && pxdImage.width === columns() && pxdImage.height === rows()) {
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
  const colors = [...new Set([...Object.keys(pxdLink.colorToSlot), ...Array.from({ length: pxdImage.rgba.length / 4 }, (_, index) => imageColorId(pxdImage.rgba, index * 4))].filter((id) => !id.endsWith('00')))];
  const pageSize = 16; const pages = Math.max(1, Math.ceil(colors.length / pageSize)); pxdColorPage = Math.min(pxdColorPage, pages - 1);
  const title = document.createElement('strong'); title.textContent = '絵の色と音'; pxdColorsPanel.append(title);
  const range = document.createElement('span'); range.textContent = `${colors.length}色 · ${pxdColorPage + 1}/${pages}`; pxdColorsPanel.append(range);
  for (const colorId of colors.slice(pxdColorPage * pageSize, (pxdColorPage + 1) * pageSize)) {
    const row = document.createElement('label'); row.className = 'audio-pxd-color';
    row.dataset.colorId = colorId;
    const swatch = document.createElement('span'); swatch.setAttribute('aria-hidden', 'true');
    const hex = `#${colorId.slice(5)}`; swatch.style.backgroundColor = hex;
    const text = document.createElement('span'); text.textContent = hex.toUpperCase();
    const select = document.createElement('select'); select.disabled = passLocked; select.setAttribute('aria-label', `${hex}の音色割り当て`);
    const none = document.createElement('option'); none.value = ''; none.textContent = '無音'; select.append(none);
    for (const slot of song.pixelPalette || AUDIO_PIXEL_PALETTE) {
      const option = document.createElement('option'); option.value = slot.slotId;
      option.textContent = `${paletteShortName(slot.slotId)}${extraInstrumentIds.has(slot.instrument) ? hasPerk('audio.instruments-extra') ? ' ★ 特典' : ' 🔒 特典' : ''}`;
      select.append(option);
    }
    select.value = pxdLink.colorToSlot[colorId] || '';
    select.addEventListener('change', async () => {
      if (audioPassState().locked) { renderSong(); return; }
      const chosenId = select.value;
      const chosenSlot = chosenId ? paletteSlot(chosenId) : null;
      if (chosenSlot && extraInstrumentIds.has(chosenSlot.instrument) && !hasPerk('audio.instruments-extra')) {
        select.value = pxdLink.colorToSlot[colorId] || '';
        if (!await requestPass({ perk: 'audio.instruments-extra' }) || !hasPerk('audio.instruments-extra')) return;
        select.value = chosenId;
      }
      try {
        const result = assignPxdAudioColor(song, pxdImage, pxdLink, colorId, select.value || null);
        song = result.song; pxdLink = result.link; pxdBridge?.markDirty(); renderSong(); setStatus(`${hex.toUpperCase()}を${select.value ? paletteShortName(select.value) : '無音'}に設定しました。`);
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
  const y = Math.floor((event.clientY - rect.top) / rect.height * rows());
  if (x < 0 || x >= columns() || y < 0 || y >= rows()) return null;
  return { x, y };
}

function applyPixel(cell, mode, { render = true, announce = true, audition = true } = {}) {
  if (!cell || audioPassState().locked) return false;
  const { x, y } = cell; const pitch = pitchAtRow(y); const tick = tickAtColumn(x);
  if (pitch === null || pitch === undefined) return false;
  const track = selectedTrack(); const active = mode === 'paint'; const slotId = selectedPaintSlot();
  if (active && slotId && extraInstrumentIds.has(paletteSlot(slotId)?.instrument) && !hasPerk('audio.instruments-extra')) { setStatus('追加の音色を使うには時間を追加してください。'); return false; }
  const owner = cellOwner(x, y);
  if (active && selectedCellMatches(x, y, owner)) return false;
  if (!active && !owner && !pxdImage?.rgba[(y * columns() + x) * 4 + 3]) return false;
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    if (sharedMode()) {
      const result = setSharedAudioCell(song, pxdImage, pxdLink, { x, y, slotId, colorId: active ? selectedColorId : null, active });
      const colorPolicy = evaluateSharedCanvasPolicy({ width: result.image.width, height: result.image.height, colorCount: result.image.colorCount }, { passActive: hasPerk('project.canvas-expanded') || hasPerk('audio.canvas-wide') });
      if (colorPolicy.locked || !colorPolicy.supported) { setStatus('この色を追加するには特典時間が必要です。'); return false; }
      song = result.song; pxdImage = result.image; pxdLink = result.link;
      pxdBridge?.markDirty();
      if (render) { paintPixelCanvas([y * columns() + x]); renderPalette(); renderPxdColorAssignments(); updateCanvasLabel(); }
      if (active && audition && slotId) previewCell(pitch, slotId, cell);
      if (announce) setStatus(active && !slotId ? '無音の色を描きました。' : `${pitchName(pitch)}の音を${active ? `色${paletteNumber(slotId)}で描きました` : '消しました'}。`);
      return true;
    }
    song = setAudioPixel(song, { trackId: track.trackId, pitch, startTick: tick, noteId: `note-${globalThis.crypto?.randomUUID?.() || Date.now()}-${x}-${y}`, active });
    pxdBridge?.markDirty();
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
  playbackCells = Array.from({ length: columns() }, (_, x) => Array.from({ length: rows() }, (_, y) => ({ x, y, slot: audioPixels[y * columns() + x] })).filter(({ slot }) => slot >= 0));
  const draw = () => {
    if (!player.isPlaying) { stopPlayhead(); return; }
    const tick = player.currentTick;
    playhead.hidden = tick === null;
    if (pixelCanvas && tick !== null) {
      const boardRect = gridWrap.getBoundingClientRect(); const canvasRect = pixelCanvas.getBoundingClientRect();
      const phase = sharedMode() ? Math.min(1, tick / (columns() * AUDIO_PIXEL_TICKS)) : tick / song.loopTicks;
      playhead.style.left = `${canvasRect.left - boardRect.left + canvasRect.width * phase}px`;
      playhead.style.top = `${canvasRect.top - boardRect.top}px`;
      playhead.style.height = `${canvasRect.height}px`;
      const column = tick < columns() * AUDIO_PIXEL_TICKS ? Math.floor(tick / AUDIO_PIXEL_TICKS) : -1;
      if (column >= 0 && column !== playbackColumn) {
        playbackColumn = column;
        for (const cell of playbackCells[column].slice(0, 4)) {
          const color = currentPalette()[cell.slot]?.color;
          if (color) { try { interactionEffects.note({ canvas: pixelCanvas, host: effectHost, x: cell.x, y: cell.y, columns: columns(), rows: rows(), color, canvasRect, hostRect: boardRect }); } catch {} }
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
  sizeSelect.disabled = sharedMode() || audioPassState().locked;
  sizeSelect.hidden = sharedMode();
  const sizeLabel = document.querySelector('.audio-size-label');
  if (sizeLabel) sizeLabel.hidden = sharedMode();
  sizeSelect.value = String(columns());
  const sizeChip = document.querySelector('#audio-size-chip');
  if (sizeChip) {
    sizeChip.textContent = sharedMode() ? (columns() === rows() ? `${columns()}²` : `${columns()}×${rows()}`) : String(columns());
    sizeChip.title = sharedMode() ? `共有キャンバス ${columns()} × ${rows()}px` : `${columns()}列`;
  }
  tempoInput.value = String(song.tempo); tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
}

tracksEl.addEventListener('click', (event) => {
  const colorButton = event.target.closest('button[data-color-id]');
  if (colorButton && sharedMode()) {
    const colorId = colorButton.dataset.colorId;
    const editSelected = selectedColorId === colorId;
    selectedColorId = colorId;
    const slotId = pxdLink.colorToSlot[colorId];
    const track = song.tracks.find((candidate) => candidate.instrument === slotId);
    if (track) activeTrackId = track.trackId;
    setTool('pen'); renderPalette(); updateCanvasLabel();
    if (editSelected) {
      const colors = [...new Set([...Object.keys(pxdLink.colorToSlot), ...Array.from({ length: pxdImage.rgba.length / 4 }, (_, index) => imageColorId(pxdImage.rgba, index * 4))].filter((id) => !id.endsWith('00')))];
      pxdColorPage = Math.max(0, Math.floor(colors.indexOf(colorId) / 16));
      renderPxdColorAssignments();
      document.querySelector('#audio-palette-settings').open = true;
      pxdColorsPanel.querySelector(`[data-color-id="${colorId}"]`)?.scrollIntoView({ block: 'nearest' });
    } else setStatus(slotId ? `${colorButton.title}で描きます。もう一度押すと音色を設定できます。` : '無音の色で描きます。もう一度押すと音色を設定できます。');
    return;
  }
  const button = event.target.closest('button[data-track-id]');
  if (!button) return;
  const editSelected = button.dataset.trackId === activeTrackId && !selectedColorId;
  const from = button.querySelector('.audio-track-choice__mark')?.getBoundingClientRect();
  const track = song.tracks.find((candidate) => candidate.trackId === button.dataset.trackId);
  const selectedColor = currentPalette().find((slot) => slot.slotId === track?.instrument)?.color;
  activeTrackId = button.dataset.trackId; selectedColorId = null; setTool('pen'); renderPalette();
  const selected = [...tracksEl.querySelectorAll('button[data-track-id]')].find((candidate) => candidate.dataset.trackId === activeTrackId);
  if (from && selected?.querySelector('.audio-track-choice__mark') && selectedColor) {
    try { interactionEffects.color({ from, to: penButton, color: selectedColor }); } catch {}
  }
  selected?.focus(); updateCanvasLabel();
  if (editSelected) document.querySelector('#audio-palette-settings').open = true;
});

penButton.addEventListener('click', () => setTool('pen'));
eraserButton.addEventListener('click', () => setTool('eraser'));
document.querySelector('#audio-current')?.addEventListener('click', () => {
  const panel = document.querySelector('#audio-palette-settings');
  panel.open = !panel.open;
  document.querySelector('#audio-current').setAttribute('aria-expanded', String(panel.open));
});
document.querySelector('#audio-palette-settings')?.addEventListener('toggle', (event) => {
  document.querySelector('#audio-current')?.setAttribute('aria-expanded', String(event.target.open));
});
document.querySelector('#audio-palette-close')?.addEventListener('click', () => { document.querySelector('#audio-palette-settings').open = false; });
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || document.body.hasAttribute('data-tool-result-open')
      || event.target.closest?.('input, select, textarea, summary, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (key === 'b' || key === 'p') setTool('pen');
  else if (key === 'e') setTool('eraser');
});

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
    if (await requestPass({ perk: sharedMode() && policy.premiumContent ? 'project.canvas-expanded' : policy.wideCanvas ? 'audio.canvas-wide' : 'audio.instruments-extra', extend: true })) {
      refreshAudioPassUi(); renderPaletteSettings(); setStatus('時間を追加しました。保存している曲と絵を続けて使えます。');
    }
  } finally { audioPassAddButton.disabled = false; }
});
onPassChange(() => { renderPalette(); renderPaletteSettings(); });

document.querySelector('#audio-output [data-output-project]')?.addEventListener('click', () => {
  editorUi.closePanels();
  void pxdBridge?.showProjects();
});

photoButton.addEventListener('click', async () => {
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  try {
    let pxd;
    if (pxdBridge) { const saved = await pxdBridge.save(); pxd = { projectId: saved.projectId, revisionId: saved.revisionId }; }
    const url = beginAudioCamera({ song, pxd, width: columns(), height: rows() }); player.stop(); location.assign(url);
  }
  catch (error) { setStatus(error.message || '撮影の準備を保存できませんでした。'); }
});
exportImageButton.addEventListener('click', async () => {
  editorUi.closePanels();
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
    if (hasAudioArtwork(songSnapshot, imageSnapshot)) showAudioResult({ title: 'PNGを保存しました', detail: `${width}×${height}px` });
  } catch (error) { setStatus(error.message || '絵を保存できませんでした。'); }
  finally { exportImageButton.disabled = false; }
});

gridWrap.addEventListener('pointerdown', (event) => {
  if (viewport.isGesturing) return;
  if (event.target !== pixelCanvas) return;
  const cell = canvasCellAt(event); if (!cell) return;
  event.preventDefault(); pixelCanvas.focus(); pointerDrawId = event.pointerId; pointerLastCell = cell; pixelCanvas.setPointerCapture(event.pointerId);
  const owner = cellOwner(cell.x, cell.y);
  pointerDrawMode = activeTool === 'eraser' || selectedCellMatches(cell.x, cell.y, owner) ? 'erase' : 'paint';
  keyboardCursor = false; cursorCell = cell; updateCanvasLabel(); applyPixel(cell, pointerDrawMode);
});
gridWrap.addEventListener('pointermove', (event) => {
  if (viewport.isGesturing) return;
  if (event.pointerId !== pointerDrawId) return;
  const cell = canvasCellAt(event); if (!cell || !pointerLastCell) return;
  const changed = [];
  let lastChanged = null;
  for (const point of lineCells(pointerLastCell, cell)) if (applyPixel(point, pointerDrawMode, { render: false, announce: false, audition: false })) { changed.push(point.y * columns() + point.x); lastChanged = point; }
  pointerLastCell = cell; cursorCell = cell; if (changed.length) { paintPixelCanvas(changed); if (pointerDrawMode === 'paint' && lastChanged && selectedPaintSlot()) previewCell(pitchAtRow(lastChanged.y), selectedPaintSlot(), lastChanged); } updateCanvasLabel();
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
  if (sharedMode()) { renderPalette(); renderPxdColorAssignments(); }
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
  else if (event.key === 'ArrowDown') next.y = Math.min(rows() - 1, next.y + 1);
  else if (event.key === 'Enter' || event.key === ' ') {
    keyboardCursor = true;
    event.preventDefault(); const owner = cellOwner(cursorCell.x, cursorCell.y);
    applyPixel(cursorCell, activeTool === 'eraser' || selectedCellMatches(cursorCell.x, cursorCell.y, owner) ? 'erase' : 'paint'); return;
  } else return;
  event.preventDefault(); keyboardCursor = true; cursorCell = next; updateCanvasLabel();
  setStatus(cellDescription(cursorCell.x, cursorCell.y));
});

tempoInput.addEventListener('input', () => {
  if (audioPassState().locked) { tempoInput.value = String(song.tempo); setStatus('続けるには時間を追加してください。'); return; }
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    song = setAudioTempo(song, Number(tempoInput.value));
    pxdBridge?.markDirty();
    tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
    setStatus('テンポを更新しました。');
  } catch (error) { setStatus(error.message || 'テンポを変更できませんでした。'); }
});

playButton.addEventListener('click', async () => {
  if (player.isPlaying || player.isStarting) { player.stop(); setStatus('再生を停止しました。'); return; }
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  try {
    const started = await player.play(song);
    if (started) setStatus('再生中です。中央の停止ボタンで音を止められます。');
    else if (!collectAudioEvents(song).length) setStatus('まだ音符がありません。グリッドのマスを押して音を追加してください。');
  } catch {
    setStatus('このブラウザーで音を開始できませんでした。再生をもう一度押すか、対応したブラウザーをお使いください。');
  }
});

saveButton.addEventListener('click', async () => {
  editorUi.closePanels();
  saveButton.disabled = true; setStatus('端末に保存しています…');
  try {
    validateAudioSong(song);
    await pxdBridge.save();
    setStatus('曲と絵を、このプロジェクトに保存しました。');
  } catch (error) {
    setStatus(`保存できませんでした：${error.message || '空き容量とブラウザーの保存設定を確認してください。'}`);
  } finally { saveButton.disabled = false; }
});

resumeButton.addEventListener('click', () => void pxdBridge.beforeReplace(loadLegacySong));
async function loadLegacySong() {
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
    song = normalizeAudioPixelSong(revision.document); currentDraftId = crypto.randomUUID(); activeTrackId = song.tracks[0].trackId;
    renderSong(); resumeButton.disabled = false; setStatus('前回の曲を開きました。');
  } catch {
    resumeButton.disabled = false; setStatus('曲を開けませんでした。端末内の保存内容を確認してください。');
  }
}

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
  projectWorkspace: true,
  getEditorState: () => ({ activeTrackId, selectedColorId, activeTool, viewport: viewport.getState() }),
  restoreEditorState(state) {
    activeTrackId = song.tracks.some((track) => track.trackId === state?.activeTrackId) ? state.activeTrackId : song.tracks[0].trackId;
    selectedColorId = state?.selectedColorId && sharedMode() && Object.hasOwn(pxdLink.colorToSlot, state.selectedColorId) ? state.selectedColorId : null;
    setTool(state?.activeTool === 'eraser' ? 'eraser' : 'pen'); viewport.restoreState(state?.viewport); renderPalette();
  },
  hasContent: () => Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject || pxdImage || collectAudioEvents(song).length),
  setStatus,
  async openProject(project) {
    if (!project.entries.length) {
      player.stop(); song = createAudioSong({ songId: crypto.randomUUID() });
      const blank = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
      const plan = prepareSharedAudioImageImport(song, blank);
      song = plan.song; pxdImage = plan.image; pxdLink = plan.link; pxdMainImage = blank;
      activeTrackId = song.tracks[0].trackId; selectedColorId = null; currentDraftId = crypto.randomUUID(); renderSong(); return;
    }
    const storedSong = readPxdAudioState(project); const sharedImage = await readPxdSharedImage(project);
    const storedLink = storedSong ? readPxdAudioLink(project) : null;
    const audioProject = storedSong && storedLink?.rulesVersion === 'shared-canvas-v1' && storedLink.imageRole === 'main'
      ? await detachPxdAudioImage(project)
      : project;
    const legacyImage = await readPxdImage(audioProject, 'audio');
    const workingLink = storedSong ? readPxdAudioLink(audioProject) : null;
    let nextSong; let nextImage; let nextLink; let mainImage = null;
    if (storedSong && workingLink?.rulesVersion === 'shared-canvas-v1' && workingLink.imageRole === 'audio' && legacyImage) {
      const colorIds = new Set(Object.keys(workingLink.colorToSlot || {}).filter((id) => /^rgba-[a-f\d]{8}$/i.test(id) && !id.endsWith('00')));
      for (let offset = 0; offset < legacyImage.rgba.length; offset += 4) if (legacyImage.rgba[offset + 3]) colorIds.add(imageColorId(legacyImage.rgba, offset));
      const rowPitchMap = workingLink.rowPitchMap?.length === legacyImage.height
        ? workingLink.rowPitchMap
        : createAudioRowPitchMap(legacyImage.height);
      const colorToSlot = Object.fromEntries([...colorIds].map((id) => [id, workingLink.colorToSlot?.[id] && storedSong.pixelPalette.some((slot) => slot.slotId === workingLink.colorToSlot[id]) ? workingLink.colorToSlot[id] : null]));
      // Validate the stored song against its exact image before rebuilding the
      // projection. This still permits the legacy compressed-timing migration,
      // while preventing an open from silently replacing mismatched notes.
      validatePxdAudioBinding(storedSong, legacyImage, workingLink);
      const projection = prepareSharedAudioImageImport(storedSong, legacyImage, { rowPitchMap, colorToSlot });
      nextSong = projection.song; nextImage = legacyImage; nextLink = projection.link;
    } else if (storedSong && legacyImage && storedLink) {
      if (legacyImage.width !== audioPixelColumns(storedSong) || legacyImage.height !== PITCHES.length) throw new TypeError('保存した音楽用画像とキャンバス寸法が一致しません。PXD原本は保持されています。');
      assertPxdAudioPixelCompatibility(storedSong); validatePxdAudioBinding(storedSong, legacyImage, workingLink);
      nextSong = storedSong; nextImage = legacyImage; nextLink = workingLink;
    } else if (storedSong && !legacyImage && !workingLink && !sharedImage) {
      assertPxdAudioPixelCompatibility(storedSong);
      nextSong = storedSong; nextImage = audioSongImage(storedSong); nextLink = audioCellLink(storedSong);
    } else if (storedSong) {
      throw new TypeError('保存した曲の画像連携が不足または不整合です。PXD原本は保持されています。');
    } else if (legacyImage) {
      const plan = prepareSharedAudioImageImport(createAudioSong({ songId: crypto.randomUUID() }), legacyImage);
      nextSong = plan.song; nextImage = plan.image; nextLink = plan.link;
    } else if (sharedImage) {
      const plan = prepareSharedAudioImageImport(createAudioSong({ songId: crypto.randomUUID() }), sharedImage);
      nextSong = plan.song; nextImage = sharedImage; nextLink = plan.link; mainImage = sharedImage;
    } else {
      const params = new URLSearchParams(location.search); const requested = params.get('pxd') === project.projectId && params.getAll('pxdImage').length === 1 ? params.get('pxdImage') : null;
      const roles = pxdImageRoles(project); const role = [requested, 'main', 'draw', 'jigsaw-main', 'hidden', 'audio', 'spot-after'].find((candidate) => candidate && roles.includes(candidate));
      if (!role) throw new TypeError('このPXDには音楽へつなげる画像がありません。');
      const selectedImage = await readPxdImage(project, role);
      const plan = prepareSharedAudioImageImport(createAudioSong({ songId: crypto.randomUUID() }), selectedImage);
      nextSong = plan.song; nextImage = plan.image; nextLink = plan.link;
    }
    validateAudioSong(nextSong);
    if (player.isPlaying || player.isStarting) player.stop();
    song = nextSong; pxdImage = nextImage; pxdLink = nextLink; pxdMainImage = mainImage; activeTrackId = song.tracks[0].trackId; selectedColorId = null; currentDraftId = crypto.randomUUID();
    renderSong();
  },
  async getProject(project) {
    const snapshot = structuredClone(song); const image = pxdImage ? structuredClone(pxdImage) : audioSongImage(snapshot);
    const link = pxdLink ? structuredClone(pxdLink) : audioCellLink(snapshot); const original = pxdMainImage ? structuredClone(pxdMainImage) : null;
    let next = project || createPxdProject();
    if (link.rulesVersion === 'shared-canvas-v1') {
      if (original && !pxdImageRoles(next).includes('main')) next = await putPxdSharedImage(next, original);
      next = await writePxdAudioState(next, snapshot, { image, link });
      return next;
    }
    if (original && !pxdImageRoles(next).includes('main')) next = await putPxdImage(next, original, 'main');
    next = await writePxdAudioState(next, snapshot, { image, link });
    return next;
  }
});

try {
  await pxdBridge.ready;
  const cancelled = new URLSearchParams(location.search).get('cancelled') === '1';
  const handoff = cancelled ? null : takeAudioCameraReturn();
  if (handoff) {
    const samePxd = Boolean(handoff.pxd && pxdBridge.currentProject?.projectId === handoff.pxd.projectId && pxdBridge.currentProject?.revisionId === handoff.pxd.revisionId);
    if (handoff.pxd && !samePxd) throw new Error('撮影前のPXD revisionが現在の作品と一致しません。保存内容を切り替えず、撮影画像を反映しませんでした。');
    const baseSong = { ...(samePxd ? song : handoff.song) };
    delete baseSong.imageSource;
    const image = { width: handoff.document.width, height: handoff.document.height, rgba: documentRgba(handoff.document) };
    const rowPitchMap = samePxd && sharedMode() && pxdLink.rowPitchMap.length === image.height ? pxdLink.rowPitchMap : createAudioRowPitchMap(image.height);
    const preserveShared = samePxd && sharedMode();
    if (preserveShared && (image.width !== pxdImage.width || image.height !== pxdImage.height)) throw new Error('撮影画像の大きさが共有キャンバスと異なります。PXDと撮影前の曲は保持しています。');
    const plan = prepareSharedAudioImageImport(baseSong, image, { rowPitchMap });
    await pxdBridge.save(); pxdBridge.reset();
    song = plan.song; pxdImage = plan.image; pxdLink = plan.link;
    pxdMainImage = null;
    currentDraftId = song.songId; activeTrackId = song.tracks[0].trackId;
    pxdBridge.markDirty();
    await pxdBridge.save();
    setStatus('撮った写真の主な色を音色に割り当て、新しいプロジェクトに保存しました。');
  } else {
    const returnParams = new URLSearchParams(location.search);
    const current = pxdBridge.currentProject;
    const matchingPxdCameraReturn = returnParams.getAll('camera').length === 1
      && returnParams.get('pxd') === current?.projectId
      && returnParams.get('pxdRevision') === current?.revisionId;
    // A prior camera request in sessionStorage must not turn a plain /audio/
    // launch into an implicit song restore. Camera return/cancel URLs are the
    // explicit authority; PXD returns additionally have to match the live revision.
    const draft = cancelled || matchingPxdCameraReturn ? readAudioCameraDraft() : null;
    if (draft) {
      const samePxd = draft.pxd && pxdBridge.currentProject?.projectId === draft.pxd.projectId && pxdBridge.currentProject?.revisionId === draft.pxd.revisionId;
      if (draft.pxd && !samePxd) throw new Error('撮影前のPXD revisionが現在の作品と一致しません。作品を切り替えず、保存済みの内容を維持しました。');
      if (!samePxd) { await pxdBridge.save(); pxdBridge.reset(); pxdImage = null; pxdLink = null; pxdMainImage = null; song = draft.song; }
      currentDraftId = song.songId; activeTrackId = song.tracks[0].trackId;
      setStatus(cancelled ? '撮影前の曲に戻りました。' : '写真を取り込めませんでした。撮影前の曲は残しています。');
    }
  }
} catch (error) { setStatus(error.message || '撮った写真を取り込めませんでした。'); }
renderSong();
try { resumeButton.hidden = !draftStore || !localStorage.getItem(LAST_DRAFT_KEY); }
catch { resumeButton.hidden = true; }
refreshImageSources();

// ---- the song as a sound file (WAV): the loop repeated to about 8 seconds, same instruments as playback ----
exportSoundButton?.addEventListener('click', async () => {
  editorUi.closePanels();
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
    if (saved !== 'cancelled' && unchanged()) {
      setStatus(`${Math.round(seconds)}秒の音を保存しました`);
      if (hasSongNotes(songSnapshot)) showAudioResult({ title: '音を保存しました', detail: `${Math.round(seconds)}秒` });
    }
    document.querySelector('#audio-more')?.removeAttribute('open');
  } catch (error) { setStatus(error.message || '音を保存できませんでした。'); }
  finally { audioWavExporting = false; refreshAudioPassUi(); }
});

exportVideoButton?.addEventListener('click', async () => {
  editorUi.closePanels();
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
    if (saved !== 'cancelled' && epoch === audioVideoEpoch && !controller.signal.aborted && unchangedSource()) {
      setStatus(`${Math.round(result.seconds)}秒の音付き動画を保存しました。`);
      if (hasSongNotes(songSnapshot)) showAudioResult({ title: '動画を保存しました', detail: `${Math.round(result.seconds)}秒` });
    }
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
