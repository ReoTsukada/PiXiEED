import { importAudioImage } from './audio-image.mjs?rev=20260930-audio-timebase-1';
import { beginAudioCamera, takeAudioCameraReturn, readAudioCameraDraft } from './audio-camera-handoff.mjs?rev=20260930-audio-timebase-1';
import { hasPerk, requestPass, onPassChange } from '../pixieed-pass.mjs?v=20260930-rewarded-gpt-1';
import { exportAudioImage, renderAudioWav } from './audio-export.mjs?rev=20260930-audio-timebase-1';
import { renderAudioVideo } from './audio-video.mjs?rev=20260930-audio-timebase-1';
import { evaluateAudioPassPolicy } from './audio-pass-policy.mjs?rev=20260930-audio-timebase-1';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20260930-shared-canvas-5';
import { saveFile } from '../pixel-export.mjs?rev=20260928-export-1';
import { createAudioViewport } from './audio-viewport.mjs?rev=20261001-connected-editor-1';
import { pixelCellAt, pixelLineCells } from './pixel-input.mjs?rev=20261001-connected-editor-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { AUDIO_INSTRUMENT_GROUPS, AUDIO_EXTRA_INSTRUMENT_IDS } from './audio-timbres.mjs?rev=20260930-four-voices-1';
import { getAudioInstrumentIcon, audioInstrumentIconFilter } from './audio-instrument-icons.mjs?rev=20260929-music-icons-1';
import { createPxdProject } from './pxd-codec.mjs';
import { mountProjectWorkspace as mountPxdTools } from './project-workspace.mjs?rev=20261001-independent-1';
import { pxdImageRoles, putPxdImage, readPxdImage, readPxdSharedImage, putPxdSharedImage } from './pxd-project.mjs?rev=20260930-shared-canvas-5';
import { assertPxdAudioPixelCompatibility, assignPxdAudioColor, audioCellLink, audioSongImage, detachPxdAudioImage, prepareSharedAudioImageImport, readPxdAudioLink, readPxdAudioState, resizePxdAudioWorkingImage, setSharedAudioCell, validatePxdAudioBinding, writePxdAudioState } from './pxd-draw-audio.mjs?rev=20261001-audio-animation-1';
import { documentRgba } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { addAnimationFrame, addAnimationLayer, composeAnimationFrame, getAnimationCelDocument, getAnimationUsedColorIndices, moveAnimationFrame, moveAnimationLayer, removeAnimationFrame, removeAnimationLayer, setAnimationFrameDuration, setAnimationPalette, setLayerProperties, writeAnimationCel } from './animation-core.mjs';
import { mountAnimationControls } from './animation-controls.mjs?rev=20261001-audio-animation-1';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs?rev=20261001-audio-animation-1';
import { AUDIO_ANIMATION_LINK_VERSION, createAudioAnimationLink, prepareAudioAnimationImport, setAudioAnimationColorMapping, setAudioAnimationPixel, validateAudioAnimationBinding } from './audio-animation.mjs?rev=20261001-audio-animation-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20260930-result-back-1';
import { mountCreationEditorUi } from './editor-ui.mjs?rev=20260929-shared-editor-1';
import {
  AUDIO_BAR_TICKS, AUDIO_INSTRUMENTS, AUDIO_PIXEL_COLUMNS, AUDIO_PIXEL_PALETTE, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PPQ,
  audioPixelColumns, createAudioRowPitchMap, resizeAudioCanvas, collectAudioEvents, createAudioPlayer, createAudioSong, setAudioPixel, setAudioPixelPalette, setAudioTempo, validateAudioSong
} from './audio-core.mjs?rev=20260930-audio-timebase-1';

const PITCHES = Object.freeze(AUDIO_PIXEL_PITCHES.map((midi, index) => ({ midi, label: ['ド6', 'ラ5', 'ソ5', 'ミ5', 'レ5', 'ド5', 'ラ4', 'ソ4', 'ミ4', 'レ4', 'ド4', 'ラ3', 'ソ3', 'ミ3', 'レ3', 'ド3'][index] })));
export async function mountAudioMode({ scope, mountWorkspace = mountPxdTools } = {}) {
  if (!scope?.listen || !scope?.add || typeof scope.disposed !== 'boolean') throw new TypeError('Audio mode requires a lifecycle scope');
  let modeDisposed = false;
  const disposed = () => scope.disposed || modeDisposed;
  const timeout = scope.timeout.bind(scope);
  const clearTimeout = scope.clearTimeout.bind(scope);
  const requestAnimationFrame = scope.frame.bind(scope);
  const cancelAnimationFrame = scope.cancelFrame.bind(scope);
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
let audioAnimation = null; let selectedAudioFrameId = null; let selectedAudioLayerId = null;
let animationControls = null;
const animationPanel = document.querySelector('#audio-animation-panel');
const animationControlsHost = document.querySelector('#audio-animation-controls');
const cursor = document.querySelector('#audio-cursor');
const playhead = document.querySelector('#audio-playhead');
const tracksEl = document.querySelector('#audio-tracks');
const paletteRows = document.querySelector('#audio-palette-rows');
const pxdColorsPanel = document.createElement('div'); pxdColorsPanel.className = 'audio-pxd-colors'; pxdColorsPanel.hidden = true; paletteRows.after(pxdColorsPanel);
const tempoInput = document.querySelector('#audio-tempo');
const tempoValue = document.querySelector('#audio-tempo-value');
const playButton = document.querySelector('#audio-play-toggle');
const saveButton = document.querySelector('#audio-save');
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

let song = createAudioSong({ songId: globalThis.crypto?.randomUUID?.() || `song-${Date.now()}` });
const initialSharedImage = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
const initialSharedPlan = prepareSharedAudioImageImport(song, initialSharedImage);
song = initialSharedPlan.song; pxdImage = initialSharedPlan.image; pxdLink = initialSharedPlan.link;
let activeTrackId = song.tracks[0].trackId;
let selectedColorId = null;
let currentDraftId = song.songId;
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
  scope,
  onStrokeStart: () => { gestureOriginalSong = song; gestureOriginalImage = pxdImage ? structuredClone(pxdImage) : null; gestureOriginalLink = pxdLink ? structuredClone(pxdLink) : null; },
  onGestureStart: () => {
    // The first finger can begin a stroke before the second arrives. Restore
    // that stroke so pinching never inserts an accidental musical note.
    if (gestureOriginalSong) song = gestureOriginalSong;
    pxdImage = gestureOriginalImage; pxdLink = gestureOriginalLink;
    effectEpoch += 1; interactionEffects.clear(); player.stop(); pointerDrawId = null; pointerLastCell = null; renderGrid();
  },
  onChange: () => { if (!disposed()) positionCursor(); }
});
scope.add(() => viewport.dispose());

const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
const player = createAudioPlayer({
  audioContextFactory: () => {
    if (!AudioContextConstructor) throw new Error('AudioContext unavailable');
    return new AudioContextConstructor();
  },
  onStateChange(playing, starting) {
    if (disposed()) return;
    playButton.textContent = playing || starting ? '停止' : '再生';
    playButton.setAttribute('aria-label', starting ? '曲の再生を中止' : playing ? '曲を停止' : '曲を再生');
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.toggleAttribute('aria-busy', starting);
    if (playing) startPlayhead(); else stopPlayhead();
  }
});

let statusTimer = 0;
function setStatus(message) {
  if (disposed()) return;
  status.textContent = message;
  clearTimeout(statusTimer);
  status.classList.toggle('is-visible', /できません|開けません|見つか|失われ|取り込みました|追加の音色|保存しました|まだ音符|動画|中止|無音/.test(message));
  statusTimer = timeout(() => { if (!disposed()) status.classList.remove('is-visible'); }, 4000);
}
function hasSongNotes(candidate) {
  return candidate.tracks.some((track) => track.clips.some((clip) => clip.notes.length > 0));
}
function hasAudioArtwork(candidateSong, image) {
  return hasSongNotes(candidateSong) || Boolean(image?.rgba?.some((value, index) => index % 4 === 3 && value > 0));
}
function showAudioResult({ title, detail, preview = pixelCanvas }) {
  if (disposed()) return false;
  if (player.isPlaying || player.isStarting) player.stop();
  document.querySelectorAll('.audio-popover[open]').forEach((panel) => { panel.open = false; });
  resultView.show({ title, detail, preview });
}
function audioPassState() {
  const shared = animatedAudioMode() ? { ...pxdImage, colorCount: getAnimationUsedColorIndices(audioAnimation).size } : sharedMode() ? pxdImage : null;
  const active = hasPerk('project.canvas-expanded') || hasPerk('audio.canvas-wide');
  return evaluateAudioPassPolicy(song, { passActive: active, extraInstrumentPassActive: hasPerk('audio.instruments-extra'), extraInstrumentIds, sharedImage: shared });
}
function refreshAudioPassUi() {
  const policy = audioPassState();
  if (disposed()) return policy;
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
function animatedAudioMode() { return Boolean(audioAnimation && pxdLink?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION); }
function sharedMode() { return (pxdLink?.rulesVersion === 'shared-canvas-v1' || animatedAudioMode()) && Boolean(pxdImage); }
function columns() { return sharedMode() ? pxdImage.width : audioPixelColumns(song); }
function rows() { return sharedMode() ? pxdImage.height : PITCHES.length; }
function pitchAtRow(y) { return sharedMode() ? pxdLink.rowPitchMap[y] : PITCHES[y]?.midi; }
function pitchLabelAtRow(y) { return PITCHES.find((item) => item.midi === pitchAtRow(y))?.label || `音程${pitchAtRow(y)}`; }
function tickAtColumn(x) { const frameIndex = animatedAudioMode() ? audioAnimation.frames.findIndex((frame) => frame.id === selectedAudioFrameId) : 0; return (Math.max(0, frameIndex) * columns() + x) * AUDIO_PIXEL_TICKS; }
function composedAnimationImage(frameId = selectedAudioFrameId) {
  if (!audioAnimation || !frameId) return null;
  const composed = composeAnimationFrame(audioAnimation, frameId);
  return { width: composed.width, height: composed.height, rgba: documentRgba(composed) };
}
function audioAnimationLinkFor(animation, priorLink = null, { projectionReady = false } = {}) {
  const slots = new Set((song.pixelPalette || AUDIO_PIXEL_PALETTE).map(({ slotId }) => slotId));
  const colors = Object.fromEntries(Object.entries(priorLink?.colorToSlot || {}).map(([id, slotId]) => [id, slotId === null || slots.has(slotId) ? slotId : null]));
  return createAudioAnimationLink(song, animation, {
    rowPitchMap: priorLink?.rowPitchMap?.length === animation.height ? priorLink.rowPitchMap : null,
    colorToSlot: colors,
    projectionReady
  });
}
function adoptAudioAnimation(animation, link = null) {
  audioAnimation = animation;
  selectedAudioFrameId = animation.frames[0]?.id || null;
  selectedAudioLayerId = animation.layers.find((layer) => layer.visible)?.id || animation.layers[0]?.id || null;
  pxdLink = audioAnimationLinkFor(animation, link, { projectionReady: Boolean(link?.projectionReady) });
  pxdImage = composedAnimationImage();
  selectedColorId = null;
}
function refreshAudioAnimationControls() {
  if (!animationPanel) return;
  animationPanel.hidden = !audioAnimation;
  if (!audioAnimation) return;
  if (!audioAnimation.frames.some((frame) => frame.id === selectedAudioFrameId)) selectedAudioFrameId = audioAnimation.frames[0].id;
  if (!audioAnimation.layers.some((layer) => layer.id === selectedAudioLayerId)) selectedAudioLayerId = audioAnimation.layers[0].id;
  animationControls?.refresh();
}
function markAudioAnimationEdited() {
  if (!audioAnimation || !pxdLink) return;
  pxdLink = createAudioAnimationLink(song, audioAnimation, {
    rowPitchMap: pxdLink.rowPitchMap?.length === audioAnimation.height ? pxdLink.rowPitchMap : null,
    colorToSlot: pxdLink.colorToSlot,
    projectionReady: false
  });
  pxdBridge?.markDirty();
}
function ensureAudioAnimationProjection() {
  if (disposed() || !animatedAudioMode() || pxdLink.projectionReady) return song;
  const projected = prepareAudioAnimationImport(song, audioAnimation, {
    rowPitchMap: pxdLink.rowPitchMap,
    colorToSlot: pxdLink.colorToSlot
  });
  song = projected.song;
  pxdLink = projected.link;
  pxdBridge?.markDirty();
  renderSong();
  return song;
}
function refreshAudioAnimationImage({ render = true } = {}) {
  if (!animatedAudioMode()) return;
  pxdImage = composedAnimationImage();
  if (render) { renderSong(); updateCanvasLabel(); }
  refreshAudioAnimationControls();
}
function animationControlState() {
  return { frames: audioAnimation?.frames || [], layers: audioAnimation?.layers || [], frameId: selectedAudioFrameId,
    layerId: selectedAudioLayerId, playing: player?.isPlaying || player?.isStarting || false, onion: false, readOnly: audioPassState().locked, audioMode: true };
}
async function handleAudioAnimationAction(action) {
  if (!audioAnimation || disposed()) return false;
  if (!['select-frame', 'select-layer'].includes(action.type) && audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return false; }
  const oldAnimation = audioAnimation;
  if (action.type === 'select-frame') selectedAudioFrameId = action.frameId;
  else if (action.type === 'select-layer') selectedAudioLayerId = action.layerId;
  else if (action.type === 'add-frame') {
    audioAnimation = addAnimationFrame(audioAnimation, { sourceFrameId: action.frameId || selectedAudioFrameId });
    selectedAudioFrameId = audioAnimation.frames.at(-1).id;
    if (action.copy === false) for (const layer of audioAnimation.layers) {
      const cel = getAnimationCelDocument(audioAnimation, selectedAudioFrameId, layer.id); cel.pixels.fill(-1);
      cel.pixels = Uint8Array.from(cel.pixels, (value) => value + 1);
      audioAnimation = writeAnimationCel(audioAnimation, selectedAudioFrameId, layer.id, cel);
    }
  } else if (action.type === 'delete-frame') {
    audioAnimation = removeAnimationFrame(audioAnimation, action.frameId);
    if (selectedAudioFrameId === action.frameId) selectedAudioFrameId = audioAnimation.frames[Math.max(0, audioAnimation.frames.findIndex((frame) => frame.id === action.frameId))]?.id || audioAnimation.frames[0].id;
  } else if (action.type === 'move-frame') audioAnimation = moveAnimationFrame(audioAnimation, action.frameId, action.index);
  else if (action.type === 'add-layer') { audioAnimation = addAnimationLayer(audioAnimation); selectedAudioLayerId = audioAnimation.layers.at(-1).id; }
  else if (action.type === 'delete-layer') {
    audioAnimation = removeAnimationLayer(audioAnimation, action.layerId);
    if (selectedAudioLayerId === action.layerId) selectedAudioLayerId = audioAnimation.layers[0].id;
  } else if (action.type === 'move-layer') audioAnimation = moveAnimationLayer(audioAnimation, action.layerId, action.index);
  else if (action.type === 'visibility' || action.type === 'lock' || action.type === 'rename-layer') {
    const properties = action.type === 'visibility' ? { visible: action.visible }
      : action.type === 'lock' ? { locked: action.locked } : { name: action.name };
    audioAnimation = setLayerProperties(audioAnimation, action.layerId, properties);
  } else if (action.type === 'duration') audioAnimation = setAnimationFrameDuration(audioAnimation, action.frameId, action.durationMs);
  else if (action.type === 'play') {
    if (player.isPlaying || player.isStarting) player.stop();
    else await player.play(ensureAudioAnimationProjection());
    animationControls?.refresh(); return true;
  } else if (action.type === 'onion') return true;
  else return false;

  if (audioAnimation !== oldAnimation) markAudioAnimationEdited();
  pxdImage = composedAnimationImage();
  renderSong(); refreshAudioAnimationControls();
  return true;
}
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
  if (disposed()) return;
  activeTool = tool; penButton.setAttribute('aria-pressed', String(tool === 'pen')); eraserButton.setAttribute('aria-pressed', String(tool === 'eraser'));
  updateCanvasLabel();
}

function scalePixelBoard() {
  if (disposed()) return;
  viewport.resize(columns(), rows());
}

function positionCursor() {
  if (disposed()) return;
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

scope.listen(window, 'resize', () => { effectEpoch += 1; interactionEffects.clear(); scalePixelBoard(); }, { passive: true });
if (typeof globalThis.ResizeObserver === 'function') {
  const resizeObserver = new globalThis.ResizeObserver(() => { if (!disposed()) scalePixelBoard(); });
  scope.observe(resizeObserver, gridWrap);
}

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
  if (disposed()) return;
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
    const sound = slot ? `・${instrumentIcon(slot.instrument).name}` : '';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'audio-track-choice'; button.dataset.colorId = colorId;
    button.setAttribute('aria-pressed', String(colorId === selectedColorId));
    const perkLabel = slot && extraInstrumentIds.has(slot.instrument) ? hasPerk('audio.instruments-extra') ? '・★ 特典音色' : '・🔒 特典音色' : '';
    button.setAttribute('aria-label', `${hex}${sound}${perkLabel}。描く色を選ぶ。もう一度押すと音を設定`);
    button.title = `${hex}${sound}${perkLabel}`;
    const mark = document.createElement('span'); mark.className = 'audio-track-choice__mark'; mark.style.backgroundColor = hex; mark.setAttribute('aria-hidden', 'true');
    if (slot) mark.append(createInstrumentIcon(slot.instrument, hex, 'audio-instrument-icon'));
    if (slot && extraInstrumentIds.has(slot.instrument)) button.dataset.perk = hasPerk('audio.instruments-extra') ? 'active' : 'locked';
    button.append(mark); tracksEl.append(button);
  }
  if (sharedMode() && (animatedAudioMode() ? audioAnimation.palette.length < 32 : Object.keys(pxdLink.colorToSlot).length < 32)) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'audio-track-choice audio-track-choice--add';
    add.textContent = '+'; add.setAttribute('aria-label', '色を追加'); add.title = '色を追加';
    const picker = document.createElement('input'); picker.type = 'color'; picker.className = 'audio-add-color-input'; picker.value = '#8ecdf0'; picker.setAttribute('aria-label', '追加する色');
    scope.listen(add, 'click', () => picker.click());
    scope.listen(picker, 'change', () => {
      if (audioPassState().locked || !sharedMode()) return;
      const colorId = `rgba-${picker.value.slice(1).toLowerCase()}ff`;
      if (!Object.hasOwn(pxdLink.colorToSlot, colorId)) {
        if (animatedAudioMode() && audioAnimation.palette.length < 32) {
          audioAnimation = setAnimationPalette(audioAnimation, [...audioAnimation.palette, picker.value.toLowerCase()]);
          pxdLink = setAudioAnimationColorMapping(song, audioAnimation, pxdLink, { colorId, slotId: null });
        } else pxdLink = { ...pxdLink, colorToSlot: { ...pxdLink.colorToSlot, [colorId]: null } };
        if (animatedAudioMode()) markAudioAnimationEdited();
        pxdBridge?.markDirty();
      }
      selectedColorId = colorId; setTool('pen'); renderPalette(); renderPxdColorAssignments(); updateCanvasLabel();
      setStatus('色を追加しました。');
    });
    tracksEl.append(add, picker);
  }
  penButton.style.setProperty('--audio-selected-color', selectedPaintColor());
  const current = document.querySelector('#audio-current');
  if (current) {
    current.style.setProperty('--editor-color', selectedPaintColor());
    const name = selectedColorId ? selectedPaintColor() : `色${paletteNumber(selectedTrack().instrument)}、${paletteSoundName(selectedTrack().instrument)}`;
    current.setAttribute('aria-label', `選択中の${name}を設定`);
    current.title = name;
  }
}

function renderPaletteSettings() {
  if (disposed()) return;
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
    scope.listen(color, 'change', () => {
      if (audioPassState().locked) { renderPaletteSettings(); return; }
      try { song = setAudioPixelPalette(song, { slotId: slot.slotId, color: color.value }); renderPalette(); renderGrid(); setStatus(`色${paletteNumber(slot.slotId)}を変更しました。`); }
      catch (error) { color.value = paletteSlot(slot.slotId).color; setStatus(error.message || '色を変更できませんでした。'); }
    });
    scope.listen(instrument, 'change', async () => {
      if (audioPassState().locked) { renderPaletteSettings(); return; }
      const chosen = instrument.value;
      if (extraInstrumentIds.has(chosen) && chosen !== paletteSlot(slot.slotId).instrument && !hasPerk('audio.instruments-extra')) {
        instrument.value = paletteSlot(slot.slotId).instrument;
        if (!await requestPass({ perk: 'audio.instruments-extra' }) || !hasPerk('audio.instruments-extra') || disposed()) return;
      }
      try { if (player.isPlaying || player.isStarting) player.stop(); song = setAudioPixelPalette(song, { slotId: slot.slotId, instrument: chosen }); pxdBridge?.markDirty(); renderPalette(); renderPaletteSettings(); updateCanvasLabel(); previewPitch(72, slot.slotId); setStatus(`色${paletteNumber(slot.slotId)}の音色を${paletteSoundName(slot.slotId)}にしました。`); }
      catch (error) { instrument.value = paletteSlot(slot.slotId).instrument; setStatus(error.message || '音色を変更できませんでした。'); }
    });
    row.append(label, icon, color, instrument); paletteRows.append(row);
  }
  extraInstrumentsButton.hidden = hasPerk('audio.instruments-extra');
}

function cellOwner(x, y) {
  if (animatedAudioMode()) return song.tracks.find((track) => track.clips.some((clip) => clip.notes.some((note) => note.sourceCell?.kind === 'audio-animation' && note.sourceCell.frameId === selectedAudioFrameId && note.sourceCell.localX === x && note.sourceCell.y === y))) || null;
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
  const paintName = selectedColorId ? selectedPaintColor() : `色${paletteNumber(selectedTrack().instrument)}`;
  return `${pitch.label}、${timeLabel}、${owner ? `色${paletteNumber(owner.instrument)}の${paletteSoundName(owner.instrument)}あり` : '音なし'}。${willErase ? 'EnterまたはSpaceで消去' : `選択中の${paintName}でEnterまたはSpaceを押して描画`}。矢印キーで移動します。`;
}
function updateCanvasLabel() { if (disposed()) return; pixelCanvas.setAttribute('aria-label', `${columns()}列×${rows()}行の共有画像キャンバス。${cellDescription(cursorCell.x, cursorCell.y)}`); positionCursor(); }
function renderGrid() {
  if (disposed()) return;
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
  if (disposed()) return;
  if (sharedMode() && changed === null) {
    audioPixels.fill(-1);
    for (const track of song.tracks) {
      const slot = currentPalette().findIndex((entry) => entry.slotId === track.instrument);
      if (slot < 0) continue;
      for (const clip of track.clips) for (const note of clip.notes) {
        const source = note.sourceCell || {};
        if (animatedAudioMode() && (source.kind !== 'audio-animation' || source.frameId !== selectedAudioFrameId)) continue;
        const x = animatedAudioMode() ? source.localX : source.x; const { y } = source;
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
  if (disposed()) return;
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
    scope.listen(select, 'change', async () => {
      if (audioPassState().locked) { renderSong(); return; }
      const chosenId = select.value;
      const chosenSlot = chosenId ? paletteSlot(chosenId) : null;
      if (chosenSlot && extraInstrumentIds.has(chosenSlot.instrument) && !hasPerk('audio.instruments-extra')) {
        select.value = pxdLink.colorToSlot[colorId] || '';
        if (!await requestPass({ perk: 'audio.instruments-extra' }) || !hasPerk('audio.instruments-extra') || disposed()) return;
        select.value = chosenId;
      }
      try {
        if (animatedAudioMode()) {
          pxdLink = setAudioAnimationColorMapping(song, audioAnimation, pxdLink, { colorId, slotId: select.value || null });
          markAudioAnimationEdited(); renderSong(); setStatus(`${hex.toUpperCase()}を${select.value ? paletteShortName(select.value) : '無音'}に設定しました。`);
        } else {
          const result = assignPxdAudioColor(song, pxdImage, pxdLink, colorId, select.value || null);
          song = result.song; pxdLink = result.link; pxdBridge?.markDirty(); renderSong(); setStatus(`${hex.toUpperCase()}を${select.value ? paletteShortName(select.value) : '無音'}に設定しました。`);
        }
      } catch (error) { setStatus(error.message || '色の割り当てを変更できませんでした。'); renderPxdColorAssignments(); }
    });
    row.append(swatch, text, select); pxdColorsPanel.append(row);
  }
  const paging = document.createElement('div'); paging.className = 'audio-pxd-colors__paging';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '前の色'; previous.disabled = pxdColorPage === 0;
  scope.listen(previous, 'click', () => { pxdColorPage -= 1; renderPxdColorAssignments(); });
  const next = document.createElement('button'); next.type = 'button'; next.textContent = '次の色'; next.disabled = pxdColorPage + 1 >= pages;
  scope.listen(next, 'click', () => { pxdColorPage += 1; renderPxdColorAssignments(); });
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
  return pixelCellAt(event, pixelCanvas.getBoundingClientRect(), columns(), rows());
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
  if (animatedAudioMode() && audioAnimation.layers.find((layer) => layer.id === selectedAudioLayerId)?.locked) {
    if (announce) setStatus('選択中のレイヤーはロックされています。');
    return false;
  }
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    if (animatedAudioMode()) {
      let candidate = audioAnimation, candidateLink = pxdLink;
      const colorId = active ? selectedColorId || representativePxdColorId(slotId) || `rgba-${selectedPaintColor().slice(1).padEnd(8, 'f').toLowerCase()}` : null;
      if (active && !candidate.palette.some((color) => `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}` === colorId)) candidate = setAnimationPalette(candidate, [...candidate.palette, `#${colorId.slice(5, 11)}`]);
      if (active && !selectedColorId) candidateLink = createAudioAnimationLink(song, candidate, { rowPitchMap: pxdLink.rowPitchMap, colorToSlot: { ...pxdLink.colorToSlot, [colorId]: slotId }, projectionReady: false });
      const usedColors = getAnimationUsedColorIndices(candidate);
      if (active) usedColors.add(candidate.palette.findIndex((color) => `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}` === colorId));
      const colorPolicy = evaluateSharedCanvasPolicy({ width: candidate.width, height: candidate.height, colorCount: usedColors.size }, { passActive: hasPerk('project.canvas-expanded') || hasPerk('audio.canvas-wide') });
      if (colorPolicy.locked || !colorPolicy.supported) { setStatus('この色を追加するには特典時間が必要です。'); return false; }
      const result = setAudioAnimationPixel(candidate, candidateLink, {
        frameId: selectedAudioFrameId, layerId: selectedAudioLayerId, x, y,
        colorId, active
      });
      if (!result.changed) return false;
      audioAnimation = result.animation; pxdLink = candidateLink; markAudioAnimationEdited(); pxdImage = composedAnimationImage();
      pxdBridge?.markDirty();
      if (render) { paintPixelCanvas([y * columns() + x]); renderPalette(); renderPxdColorAssignments(); updateCanvasLabel(); refreshAudioAnimationControls(); }
      if (active && audition && slotId) previewCell(pitch, slotId, cell);
      if (announce) setStatus('コマを編集しました。');
      return true;
    }
    if (sharedMode()) {
      const result = setSharedAudioCell(song, pxdImage, pxdLink, { x, y, slotId, colorId: active ? selectedColorId : null, active });
      const colorPolicy = evaluateSharedCanvasPolicy({ width: result.image.width, height: result.image.height, colorCount: result.image.colorCount }, { passActive: hasPerk('project.canvas-expanded') || hasPerk('audio.canvas-wide') });
      if (colorPolicy.locked || !colorPolicy.supported) { setStatus('この色を追加するには特典時間が必要です。'); return false; }
      song = result.song; pxdImage = result.image; pxdLink = result.link;
      pxdBridge?.markDirty();
      if (render) { paintPixelCanvas([y * columns() + x]); renderPalette(); renderPxdColorAssignments(); updateCanvasLabel(); }
      if (active && audition && slotId) previewCell(pitch, slotId, cell);
      if (announce) setStatus(active && !slotId ? '色を描きました。' : `${pitchName(pitch)}の音を${active ? `色${paletteNumber(slotId)}で描きました` : '消しました'}。`);
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
      if (animatedAudioMode()) {
        const sequenceColumn = Math.floor(tick / AUDIO_PIXEL_TICKS);
        const frameIndex = Math.min(audioAnimation.frames.length - 1, Math.floor(sequenceColumn / columns()));
        const frame = audioAnimation.frames[frameIndex];
        if (frame && frame.id !== selectedAudioFrameId) {
          selectedAudioFrameId = frame.id; pxdImage = composedAnimationImage(frame.id);
          renderSong();
        }
      }
      const phase = animatedAudioMode() ? (tick % (columns() * AUDIO_PIXEL_TICKS)) / (columns() * AUDIO_PIXEL_TICKS) : sharedMode() ? Math.min(1, tick / (columns() * AUDIO_PIXEL_TICKS)) : tick / song.loopTicks;
      playhead.style.left = `${canvasRect.left - boardRect.left + canvasRect.width * phase}px`;
      playhead.style.top = `${canvasRect.top - boardRect.top}px`;
      playhead.style.height = `${canvasRect.height}px`;
      const column = animatedAudioMode() ? Math.floor((tick % (columns() * AUDIO_PIXEL_TICKS)) / AUDIO_PIXEL_TICKS) : tick < columns() * AUDIO_PIXEL_TICKS ? Math.floor(tick / AUDIO_PIXEL_TICKS) : -1;
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
  if (disposed()) return;
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

scope.listen(tracksEl, 'click', (event) => {
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
    } else setStatus(`${colorButton.title}で描きます。もう一度押すと音色を設定できます。`);
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

scope.listen(penButton, 'click', () => setTool('pen'));
scope.listen(eraserButton, 'click', () => setTool('eraser'));
if (document.querySelector('#audio-current')) scope.listen(document.querySelector('#audio-current'), 'click', () => {
  const panel = document.querySelector('#audio-palette-settings');
  panel.open = !panel.open;
  document.querySelector('#audio-current').setAttribute('aria-expanded', String(panel.open));
});
if (document.querySelector('#audio-palette-settings')) scope.listen(document.querySelector('#audio-palette-settings'), 'toggle', (event) => {
  document.querySelector('#audio-current')?.setAttribute('aria-expanded', String(event.target.open));
});
if (document.querySelector('#audio-palette-close')) scope.listen(document.querySelector('#audio-palette-close'), 'click', () => { document.querySelector('#audio-palette-settings').open = false; });
scope.listen(document, 'keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || document.body.hasAttribute('data-tool-result-open')
      || event.target.closest?.('input, select, textarea, summary, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (key === 'b' || key === 'p') setTool('pen');
  else if (key === 'e') setTool('eraser');
});

scope.listen(sizeSelect, 'change', async () => {
  const chosen = Number(sizeSelect.value); sizeSelect.value = String(columns());
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  if (chosen > columns() && chosen > AUDIO_PIXEL_COLUMNS && !hasPerk('audio.canvas-wide')) {
    if (!await requestPass({ perk: 'audio.canvas-wide' }) || disposed()) return;
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
scope.listen(extraInstrumentsButton, 'click', async () => {
  if (await requestPass({ perk: 'audio.instruments-extra' }) && !disposed()) { renderPaletteSettings(); setStatus('追加の音色を「色と音」から選べます。'); }
});
scope.listen(audioPassAddButton, 'click', async () => {
  const policy = audioPassState();
  audioPassAddButton.disabled = true;
  try {
    if (await requestPass({ perk: sharedMode() && policy.premiumContent ? 'project.canvas-expanded' : policy.wideCanvas ? 'audio.canvas-wide' : 'audio.instruments-extra', extend: true }) && !disposed()) {
      refreshAudioPassUi(); renderPaletteSettings(); setStatus('時間を追加しました。保存している曲と絵を続けて使えます。');
    }
  } finally { if (!disposed()) audioPassAddButton.disabled = false; }
});
scope.add(onPassChange(() => { if (!disposed()) { renderPalette(); renderPaletteSettings(); } }));

if (document.querySelector('#audio-output [data-output-project]')) scope.listen(document.querySelector('#audio-output [data-output-project]'), 'click', () => {
  editorUi.closePanels();
  void pxdBridge?.showProjects();
});

scope.listen(photoButton, 'click', async () => {
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  try {
    let pxd;
    if (pxdBridge) { const saved = await pxdBridge.save(); if (disposed()) return; pxd = { projectId: saved.projectId, revisionId: saved.revisionId }; }
    const url = beginAudioCamera({ song, pxd, width: columns(), height: rows() }); player.stop(); location.assign(url);
  }
  catch (error) { setStatus(error.message || '撮影の準備を保存できませんでした。'); }
});
scope.listen(exportImageButton, 'click', async () => {
  editorUi.closePanels();
  const exportEpoch = effectEpoch;
  const sourceSnapshot = { song, image: pxdImage, link: pxdLink, animation: audioAnimation, bridge: pxdBridge, current: pxdBridge?.currentProject, held: pxdBridge?.heldProject };
  const selectedImage = pxdImage;
  const imageSnapshot = selectedImage ? { width: selectedImage.width, height: selectedImage.height, rgba: new Uint8ClampedArray(selectedImage.rgba) } : null;
  const songSnapshot = structuredClone(song);
  const unchangedSource = () => sourceSnapshot.song === song && sourceSnapshot.image === pxdImage && sourceSnapshot.link === pxdLink && sourceSnapshot.bridge === pxdBridge && sourceSnapshot.current === pxdBridge?.currentProject && sourceSnapshot.held === pxdBridge?.heldProject && (!sourceSnapshot.image || imageSnapshot.rgba.every((value, index) => value === sourceSnapshot.image.rgba[index]));
  exportImageButton.disabled = true;
  try {
    await pxdBridge?.assertCanSave();
    if (disposed()) return;
    if (!unchangedSource()) throw new Error('素材が切り替わりました。絵をもう一度保存してください。');
    const { blob, width, height } = await exportAudioImage(songSnapshot, imageSnapshot ? { image: imageSnapshot } : {});
    if (disposed()) return;
    if (!unchangedSource()) throw new Error('素材が切り替わりました。絵をもう一度保存してください。');
    const saved = await saveFile(blob, `pixieed-dot-music-${width}x${height}.png`);
    if (disposed()) return;
    if (saved === 'cancelled') return;
    if (exportEpoch === effectEpoch && !viewport.isGesturing && document.visibilityState === 'visible') {
      try { interactionEffects.exportImage({ from: pixelCanvas, to: exportImageButton, image: pixelCanvas }); } catch {}
    }
    setStatus(`${width}×${height}pxで保存しました`);
    if (hasAudioArtwork(songSnapshot, imageSnapshot)) showAudioResult({ title: 'PNGを保存しました', detail: `${width}×${height}px` });
  } catch (error) { setStatus(error.message || '絵を保存できませんでした。'); }
  finally { exportImageButton.disabled = false; }
});

scope.listen(gridWrap, 'pointerdown', (event) => {
  if (viewport.isGesturing) return;
  if (event.target !== pixelCanvas) return;
  const cell = canvasCellAt(event); if (!cell) return;
  event.preventDefault(); pixelCanvas.focus(); pointerDrawId = event.pointerId; pointerLastCell = cell; pixelCanvas.setPointerCapture(event.pointerId);
  const owner = cellOwner(cell.x, cell.y);
  pointerDrawMode = activeTool === 'eraser' || selectedCellMatches(cell.x, cell.y, owner) ? 'erase' : 'paint';
  keyboardCursor = false; cursorCell = cell; updateCanvasLabel(); applyPixel(cell, pointerDrawMode);
});
scope.listen(gridWrap, 'pointermove', (event) => {
  if (viewport.isGesturing) return;
  if (event.pointerId !== pointerDrawId) return;
  const cell = canvasCellAt(event); if (!cell || !pointerLastCell) return;
  const changed = [];
  let lastChanged = null;
  for (const point of pixelLineCells(pointerLastCell, cell)) if (applyPixel(point, pointerDrawMode, { render: false, announce: false, audition: false })) { changed.push(point.y * columns() + point.x); lastChanged = point; }
  pointerLastCell = cell; cursorCell = cell; if (changed.length) { paintPixelCanvas(changed); if (pointerDrawMode === 'paint' && lastChanged && selectedPaintSlot()) previewCell(pitchAtRow(lastChanged.y), selectedPaintSlot(), lastChanged); } updateCanvasLabel();
});
function finishPointer(event) {
  if (event.pointerId !== pointerDrawId) return;
  if (event.type === 'pointercancel') { effectEpoch += 1; interactionEffects.clear(); }
  pointerDrawId = null; pointerLastCell = null;
  if (sharedMode()) { renderPalette(); renderPxdColorAssignments(); }
}
scope.listen(document, 'pointerup', finishPointer);
scope.listen(document, 'pointercancel', finishPointer);
scope.listen(pixelCanvas, 'focus', () => { keyboardCursor = pixelCanvas.matches(':focus-visible'); updateCanvasLabel(); });
scope.listen(pixelCanvas, 'blur', () => { cursor.hidden = true; });
scope.listen(pixelCanvas, 'keydown', (event) => {
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

scope.listen(tempoInput, 'input', () => {
  if (audioPassState().locked) { tempoInput.value = String(song.tempo); setStatus('続けるには時間を追加してください。'); return; }
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    song = setAudioTempo(song, Number(tempoInput.value));
    pxdBridge?.markDirty();
    tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
    setStatus('テンポを更新しました。');
  } catch (error) { setStatus(error.message || 'テンポを変更できませんでした。'); }
});

scope.listen(playButton, 'click', async () => {
  if (player.isPlaying || player.isStarting) { player.stop(); setStatus('再生を停止しました。'); return; }
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  try {
    const started = await player.play(ensureAudioAnimationProjection());
    if (disposed()) return;
    if (started) setStatus('再生中です。中央の停止ボタンで音を止められます。');
    else if (!collectAudioEvents(song).length) setStatus('まだ音符がありません。グリッドのマスを押して音を追加してください。');
  } catch {
    setStatus('このブラウザーで音を開始できませんでした。再生をもう一度押すか、対応したブラウザーをお使いください。');
  }
});

scope.listen(saveButton, 'click', async () => {
  editorUi.closePanels();
  saveButton.disabled = true; setStatus('端末に保存しています…');
  try {
    ensureAudioAnimationProjection();
    validateAudioSong(song);
    await pxdBridge.save();
    if (disposed()) return;
    setStatus('曲と絵を、このプロジェクトに保存しました。');
  } catch (error) {
    setStatus(`保存できませんでした：${error.message || '空き容量とブラウザーの保存設定を確認してください。'}`);
  } finally { if (!disposed()) saveButton.disabled = false; }
});

function stopOnExit() {
  effectEpoch += 1; interactionEffects.clear();
  audioVideoController?.abort();
  if (player.isPlaying || player.isStarting) setStatus('画面を離れるため音を停止しました。');
  void player.dispose();

}
scope.listen(document, 'visibilitychange', () => { if (document.visibilityState !== 'visible') stopOnExit(); });
scope.listen(window, 'pagehide', stopOnExit);
scope.listen(window, 'beforeunload', stopOnExit);

pxdBridge = mountWorkspace({
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
      audioAnimation = null; selectedAudioFrameId = null; selectedAudioLayerId = null; pxdLink = null;
      const blank = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
      const plan = prepareSharedAudioImageImport(song, blank);
      song = plan.song; pxdImage = plan.image; pxdLink = plan.link; pxdMainImage = blank;
      activeTrackId = song.tracks[0].trackId; selectedColorId = null; currentDraftId = crypto.randomUUID(); renderSong(); return;
    }
    const storedSong = readPxdAudioState(project); const sharedImage = await readPxdSharedImage(project);
    const audioRoleAnimation = await readPxdAnimation(project, 'audio');
    if (audioRoleAnimation) {
      const animation = audioRoleAnimation;
      const animationSong = storedSong || createAudioSong({ songId: crypto.randomUUID() });
      const animationLink = audioRoleAnimation ? readPxdAudioLink(project) : null;
      if (player.isPlaying || player.isStarting) player.stop();
      song = animationSong;
      adoptAudioAnimation(animation, animationLink);
      activeTrackId = song.tracks[0].trackId; currentDraftId = crypto.randomUUID();
      if (audioRoleAnimation && animationLink?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION) {
        validateAudioAnimationBinding(song, animation, animationLink);
      }
      renderSong(); refreshAudioAnimationControls();
      return;
    }
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
    ensureAudioAnimationProjection();
    const snapshot = structuredClone(song); const image = pxdImage ? structuredClone(pxdImage) : audioSongImage(snapshot);
    const link = pxdLink ? structuredClone(pxdLink) : audioCellLink(snapshot); const original = pxdMainImage ? structuredClone(pxdMainImage) : null;
    let next = project || createPxdProject();
    if (animatedAudioMode()) {
      const animatedLink = audioAnimationLinkFor(audioAnimation, pxdLink, { projectionReady: pxdLink.projectionReady });
      const posterFrameId = audioAnimation.frames[0]?.id;
      const posterImage = composedAnimationImage(posterFrameId);
      next = await writePxdAudioState(next, snapshot, { link: animatedLink, animation: audioAnimation });
      next = await writePxdAnimation(next, audioAnimation, { role: 'audio', posterFrameId });
      if (posterImage) next = await putPxdImage(next, posterImage, 'audio');
      return next;
    }
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

if (animationControlsHost) {
  animationControls = mountAnimationControls({ host: animationControlsHost, scope,
    getState: animationControlState, onAction: handleAudioAnimationAction,
    getFramePreview: (frameId) => { const image = composedAnimationImage(frameId); return image ? new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height) : null; } });
}

const disposeAudioMode = () => {
  if (modeDisposed) return;
  modeDisposed = true;
  clearTimeout(statusTimer);
  stopPlayhead();
  effectEpoch += 1; audioVideoEpoch += 1;
  audioVideoController?.abort(); audioVideoController = null;
  interactionEffects.clear();
  animationControls?.dispose(); animationControls = null;
  editorUi.dispose(); resultView.dispose();
  player.stop(); void player.dispose();
};
scope.add(disposeAudioMode);

try {
  await pxdBridge.ready;
  if (disposed()) return { workspace: pxdBridge, dispose: disposeAudioMode };
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
    await pxdBridge.save(); if (disposed()) return { workspace: pxdBridge, dispose: disposeAudioMode }; pxdBridge.reset();
    song = plan.song; pxdImage = plan.image; pxdLink = plan.link;
    pxdMainImage = null;
    currentDraftId = song.songId; activeTrackId = song.tracks[0].trackId;
    pxdBridge.markDirty();
    await pxdBridge.save(); if (disposed()) return { workspace: pxdBridge, dispose: disposeAudioMode };
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
      if (!samePxd) { await pxdBridge.save(); if (disposed()) return { workspace: pxdBridge, dispose: disposeAudioMode }; pxdBridge.reset(); pxdImage = null; pxdLink = null; pxdMainImage = null; song = draft.song; }
      currentDraftId = song.songId; activeTrackId = song.tracks[0].trackId;
      setStatus(cancelled ? '撮影前の曲に戻りました。' : '写真を取り込めませんでした。撮影前の曲は残しています。');
    }
  }
} catch (error) { setStatus(error.message || '撮った写真を取り込めませんでした。'); }
renderSong();

// ---- the song as a sound file (WAV): the loop repeated to about 8 seconds, same instruments as playback ----
if (exportSoundButton) scope.listen(exportSoundButton, 'click', async () => {
  editorUi.closePanels();
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  try { ensureAudioAnimationProjection(); } catch (error) { setStatus(error.message || '音を準備できませんでした。'); return; }
  const sourceSong = song; const sourceImage = pxdImage; const sourceLink = pxdLink; const sourceBridge = pxdBridge;
  const sourceCurrent = pxdBridge?.currentProject; const sourceHeld = pxdBridge?.heldProject;
  const unchanged = () => sourceSong === song && sourceImage === pxdImage && sourceLink === pxdLink && sourceBridge === pxdBridge && sourceCurrent === pxdBridge?.currentProject && sourceHeld === pxdBridge?.heldProject;
  audioWavExporting = true; refreshAudioPassUi(); setStatus('音を書き出しています…');
  try {
    await sourceBridge?.assertCanSave();
    if (disposed()) return;
    if (!unchanged()) throw new Error('素材が切り替わりました。音をもう一度保存してください。');
    const songSnapshot = structuredClone(sourceSong);
    const { blob, seconds } = await renderAudioWav(songSnapshot);
    if (disposed()) return;
    if (!unchanged()) throw new Error('素材が切り替わりました。音をもう一度保存してください。');
    const saved = await saveFile(blob, `pixieed-dot-music-${Math.round(seconds)}s.wav`);
    if (disposed()) return;
    if (saved !== 'cancelled' && unchanged()) {
      setStatus(`${Math.round(seconds)}秒の音を保存しました`);
      if (hasSongNotes(songSnapshot)) showAudioResult({ title: '音を保存しました', detail: `${Math.round(seconds)}秒` });
    }
    document.querySelector('#audio-more')?.removeAttribute('open');
  } catch (error) { setStatus(error.message || '音を保存できませんでした。'); }
  finally { audioWavExporting = false; refreshAudioPassUi(); }
});

if (exportVideoButton) scope.listen(exportVideoButton, 'click', async () => {
  editorUi.closePanels();
  if (audioVideoController) return;
  if (audioPassState().locked) { setStatus('続けるには時間を追加してください。'); return; }
  try { ensureAudioAnimationProjection(); } catch (error) { setStatus(error.message || '動画の音を準備できませんでした。'); return; }
  const controller = new AbortController(); const epoch = ++audioVideoEpoch;
  audioVideoController = controller;
  const sourceSnapshot = { song, image: pxdImage, link: pxdLink, animation: audioAnimation, bridge: pxdBridge, current: pxdBridge?.currentProject, held: pxdBridge?.heldProject };
  const selectedImage = pxdImage || audioSongImage(song);
  const imageSnapshot = { width: selectedImage.width, height: selectedImage.height, rgba: new Uint8ClampedArray(selectedImage.rgba) };
  const unchangedSource = () => sourceSnapshot.song === song && sourceSnapshot.image === pxdImage && sourceSnapshot.link === pxdLink && sourceSnapshot.animation === audioAnimation && sourceSnapshot.bridge === pxdBridge && sourceSnapshot.current === pxdBridge?.currentProject && sourceSnapshot.held === pxdBridge?.heldProject && (sourceSnapshot.image === null || imageSnapshot.rgba.every((value, index) => value === sourceSnapshot.image.rgba[index]));
  const songSnapshot = structuredClone(song);
  refreshAudioPassUi();
  cancelVideoButton.hidden = false;
  status.classList.add('is-visible'); status.textContent = '1ループの動画を作成しています…';
  try {
    await pxdBridge?.assertCanSave();
    if (!unchangedSource() || epoch !== audioVideoEpoch) throw new Error('素材が切り替わりました。音付き動画をもう一度作成してください。');
    if (controller.signal.aborted) { const error = new Error('動画の作成を中止しました。'); error.name = 'AbortError'; throw error; }
    const videoSeconds = songSnapshot.loopTicks * 60 / songSnapshot.tempo / AUDIO_PPQ;
    if (videoSeconds > 120) throw new RangeError('この曲は長いため動画にできません。曲を120秒以内にしてください。プロジェクト保存と再生は続けられます。');
    const frameImages = animatedAudioMode() ? audioAnimation.frames.map(({ id }) => composedAnimationImage(id)) : null;
    const result = await renderAudioVideo(songSnapshot, imageSnapshot, {
      signal: controller.signal,
      frameImages,
      frameTicks: animatedAudioMode() ? audioAnimation.width * AUDIO_PIXEL_TICKS : null,
      onProgress(progress) {
        if (epoch === audioVideoEpoch && audioVideoController === controller && unchangedSource()) status.textContent = `動画を作成しています… ${Math.min(99, Math.floor(progress * 100))}%`;
        else controller.abort();
      }
    });
    if (epoch !== audioVideoEpoch || controller.signal.aborted || !unchangedSource()) return;
    status.textContent = '動画を端末に保存しています…';
    if (!unchangedSource()) return;
    const saved = await saveFile(result.blob, `pixieed-dot-music-${Math.round(result.seconds)}s.${result.extension}`);
    if (disposed() || epoch !== audioVideoEpoch) return;
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
if (cancelVideoButton) scope.listen(cancelVideoButton, 'click', () => audioVideoController?.abort());
  return { workspace: pxdBridge, dispose: disposeAudioMode };
}
