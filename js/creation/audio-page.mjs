import { importAudioImage } from './audio-image.mjs?rev=20260930-audio-timebase-1';
import { beginAudioCamera, takeAudioCameraReturn, readAudioCameraDraft } from './audio-camera-handoff.mjs?rev=20260930-audio-timebase-1';
import { exportAudioImage, renderAudioWav } from './audio-export.mjs?rev=20261005-audio-noise-1';
import { renderAudioVideo } from './audio-video.mjs?rev=20261005-audio-clock-sync-1';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20261001-free-tools-1';
import { saveFile } from '../pixel-export.mjs?rev=20260928-export-1';
import { createAudioViewport } from './audio-viewport.mjs?rev=20261001-connected-editor-1';
import { pixelCellAt, pixelLineCells } from './pixel-input.mjs?rev=20261001-connected-editor-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { AUDIO_INSTRUMENT_GROUPS } from './audio-timbres.mjs?rev=20261005-audio-drums-1';
import { getAudioInstrumentIcon, audioInstrumentIconFilter } from './audio-instrument-icons.mjs?rev=20261005-audio-drums-1';
import { audioHslToHex, replaceAudioSourceColor } from './audio-color-edit.mjs?rev=20261005-audio-color-instruments-1';
import { createPxdProject } from './pxd-codec.mjs';
import { mountProjectWorkspace as mountPxdTools } from './project-workspace.mjs?rev=20261006-header-controls-1';
import { pxdImageRoles, putPxdImage, readPxdImage, readPxdSharedImage, putPxdSharedImage } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { assertPxdAudioPixelCompatibility, assignPxdAudioColor, audioCellLink, audioSongImage, detachPxdAudioImage, prepareSharedAudioImageImport, pxdImageToAudioDocument, readPxdAudioLink, readPxdAudioState, resizePxdAudioWorkingImage, setSharedAudioCell, validatePxdAudioBinding, writePxdAudioState } from './pxd-draw-audio.mjs?rev=20261005-frame-cell-pitch-1';
import { documentRgba } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { addAnimationFrame, composeAnimationFrame, createAnimationFromDraw, getAnimationCelDocument, getAnimationUsedColorIndices, moveAnimationFrame, removeAnimationFrame, removeAnimationLayer, setAnimationPalette, setLayerProperties, writeAnimationCel } from './animation-core.mjs';
import { mountAnimationControls } from './animation-controls.mjs?rev=20261004-audio-frame-previews-1';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs?rev=20261001-audio-animation-1';
import { AUDIO_ANIMATION_LINK_VERSION, createAudioAnimationLink, getAudioAnimationCellPitch, getAudioAnimationRowPitchMap, prepareAudioAnimationImport, setAudioAnimationColorMapping, setAudioAnimationPixel, validateAudioAnimationBinding } from './audio-animation.mjs?rev=20261005-frame-cell-pitch-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20261002-tool-transfer-1';
import { mountCreationEditorUi } from './editor-ui.mjs?rev=20261006-header-controls-1';
import { applyDrawingToolIcons } from './drawing-tool-icons.mjs?rev=20261004-drawing-tools-4';
import { mountColorPanel } from './color-panel.mjs?rev=20261006-panel-close-1';
import { createAudioHistory } from './audio-history.mjs?rev=20261005-audio-history-1';
import { sendToolOutputAfterSaving } from './output-handoff.mjs?rev=20261008-output-3';
import {
  AUDIO_BAR_TICKS, AUDIO_INSTRUMENTS, AUDIO_PIXEL_COLUMNS, AUDIO_PIXEL_PALETTE, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PPQ,
  audioPixelColumns, createAudioRowPitchMap, resizeAudioCanvas, collectAudioEvents, createAudioPlayer, createAudioSong, getAudioColorInstrument, setAudioColorInstrument, setAudioPixel, setAudioPixelPalette, setAudioTempo, validateAudioSong
} from './audio-core.mjs?rev=20261005-audio-noise-1';

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
  beforeShow: () => { effectEpoch += 1; editorUi.closePanels(); audioColorPanel.close(); document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false'); interactionEffects.clear(); }, onClose: () => scalePixelBoard() });
const editorUi = mountCreationEditorUi(document.querySelector('#main'), { beforePanelOpen: () => { audioColorPanel.close(); animationControls?.close?.(); document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false'); } });
const pixelSurface = createPixelCanvasSurface(pixelCanvas, { alpha: false, emptyColor: '#ffffff' });
let audioPixels = new Int16Array(AUDIO_PIXEL_COLUMNS * PITCHES.length).fill(-1);
let pxdImage = null; let pxdLink = null; let pxdBridge = null;
let audioAnimation = null; let selectedAudioFrameId = null; let selectedAudioLayerId = null;
let playbackEditFrameId = null;
let animationControls = null;
const animationPanel = document.querySelector('#audio-animation-panel');
const animationControlsHost = document.querySelector('#audio-animation-controls');
const cursor = document.querySelector('#audio-cursor');
const playhead = document.querySelector('#audio-playhead');
const tracksEl = document.querySelector('#audio-tracks');
let selectedSoundSlotId = null;
let audioPaletteView = 'sound';
let activeInstrumentGroupName = null;
let instrumentPickerColorId = null;
const audioColorPanel = mountColorPanel({
  scope,
  getAnchor: () => document.querySelector('#audio-current'),
  onChange: writeSourceColor,
  onClose: () => { document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false'); flushPendingAudioHistoryEdits(); },
  id: 'audio-color-editor-panel',
  inputIds: { h: 'audio-hue', s: 'audio-saturation', l: 'audio-lightness' },
  viewTabs: { label: '色と音色の切り替え', items: [{ id: 'color', label: '色' }, { id: 'sound', label: '音色' }], active: 'color', onSelect: showAudioPaletteView }
});
const tempoInput = document.querySelector('#audio-tempo');
const tempoValue = document.querySelector('#audio-tempo-value');
const playButton = document.querySelector('#audio-play-toggle');
const saveButton = document.querySelector('#audio-save');
const undoButton = document.querySelector('#audio-undo');
const redoButton = document.querySelector('#audio-redo');
applyDrawingToolIcons(document.querySelector('.audio-tools'));
const penButton = document.querySelector('#audio-tool-pen');
const eraserButton = document.querySelector('#audio-tool-eraser');
const penIcon = penButton.querySelector('svg')?.cloneNode(true);
const eraserIcon = eraserButton.querySelector('svg')?.cloneNode(true);
eraserButton.remove();
const sizeSelect = document.querySelector('#audio-canvas-size');
const exportSoundButton = document.querySelector('#audio-export-sound');
const exportVideoButton = document.querySelector('#audio-export-video');
const cancelVideoButton = document.querySelector('#audio-cancel-video');
const photoButton = document.querySelector('#audio-take-photo');
const exportImageButton = document.querySelector('#audio-export-image');

let song = createAudioSong({ songId: globalThis.crypto?.randomUUID?.() || `song-${Date.now()}` });
const initialSharedImage = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
function blankAudioPaletteMapping(song) {
  return Object.fromEntries(song.pixelPalette.map(({ color, slotId }) => [`rgba-${color.slice(1).toLowerCase()}ff`, slotId]));
}
const initialSharedPlan = prepareSharedAudioImageImport(song, initialSharedImage, { colorToSlot: blankAudioPaletteMapping(song) });
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
let audioImageExporting = false;
let canvasPaletteSource = null;
let canvasPaletteColors = null;
let gestureOriginalSong = null;
let gestureOriginalImage = null; let gestureOriginalLink = null; let gestureOriginalAnimation = null;
let gestureOriginalFrameId = null; let gestureOriginalLayerId = null;
const interactionEffects = createInteractionEffects();
let effectEpoch = 0;
let playbackColumn = -1;
let playbackCells = [];
const audioHistory = createAudioHistory(40);
let activeHistorySnapshot = null;
let pendingTempoHistorySnapshot = null;
let pendingColorHistorySnapshot = null;

function copyHistoryImage(image) {
  return image ? { ...image, rgba: new Uint8ClampedArray(image.rgba) } : null;
}
function captureAudioHistoryState() {
  return {
    song,
    image: copyHistoryImage(pxdImage),
    mainImage: copyHistoryImage(pxdMainImage),
    link: pxdLink ? structuredClone(pxdLink) : null,
    animation: audioAnimation,
    activeTrackId, selectedColorId, selectedSoundSlotId, selectedAudioFrameId, selectedAudioLayerId, activeTool,
    identity: { animation: audioAnimation },
    songSignature: JSON.stringify(song),
    linkSignature: pxdLink ? JSON.stringify(pxdLink) : null
  };
}
function audioHistoryStateChanged(state) {
  if (state.songSignature !== JSON.stringify(song) || state.identity.animation !== audioAnimation) return true;
  if (state.linkSignature !== (pxdLink ? JSON.stringify(pxdLink) : null)) return true;
  const oldImage = state.image;
  if (Boolean(oldImage) !== Boolean(pxdImage)) return true;
  if (oldImage && pxdImage) {
    if (oldImage.width !== pxdImage.width || oldImage.height !== pxdImage.height || oldImage.rgba.length !== pxdImage.rgba.length) return true;
    for (let index = 0; index < oldImage.rgba.length; index += 1) if (oldImage.rgba[index] !== pxdImage.rgba[index]) return true;
  }
  const oldMainImage = state.mainImage;
  if (Boolean(oldMainImage) !== Boolean(pxdMainImage)) return true;
  if (oldMainImage && pxdMainImage) {
    if (oldMainImage.width !== pxdMainImage.width || oldMainImage.height !== pxdMainImage.height || oldMainImage.rgba.length !== pxdMainImage.rgba.length) return true;
    for (let index = 0; index < oldMainImage.rgba.length; index += 1) if (oldMainImage.rgba[index] !== pxdMainImage.rgba[index]) return true;
  }
  return false;
}
function refreshAudioHistoryButtons() {
  const blocked = Boolean(pointerDrawId !== null || activeHistorySnapshot || audioWavExporting || audioImageExporting || audioVideoController);
  for (const [button, canMove] of [[undoButton, audioHistory.canUndo], [redoButton, audioHistory.canRedo]]) {
    if (!button) continue;
    const disabled = blocked || !canMove;
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
  }
}
function commitAudioHistoryState(snapshot) {
  if (snapshot && audioHistoryStateChanged(snapshot)) audioHistory.commit(snapshot);
  refreshAudioHistoryButtons();
}
function beginAudioHistoryTransaction() {
  flushPendingAudioHistoryEdits();
  if (player.isPlaying || player.isStarting) player.stop();
  if (!activeHistorySnapshot) activeHistorySnapshot = captureAudioHistoryState();
  refreshAudioHistoryButtons();
  return activeHistorySnapshot;
}
function finishAudioHistoryTransaction({ discard = false } = {}) {
  const snapshot = activeHistorySnapshot;
  activeHistorySnapshot = null;
  if (!discard) commitAudioHistoryState(snapshot);
  else refreshAudioHistoryButtons();
}
function resetAudioHistory() {
  activeHistorySnapshot = null; pendingTempoHistorySnapshot = null; pendingColorHistorySnapshot = null;
  audioHistory.reset(); refreshAudioHistoryButtons();
}
function restoreAudioHistoryState(state) {
  if (!state) return false;
  audioColorPanel.close(); document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false');
  editorUi.closePanels();
  if (player.isPlaying || player.isStarting) player.stop();
  song = state.song; pxdImage = copyHistoryImage(state.image); pxdMainImage = copyHistoryImage(state.mainImage);
  pxdLink = state.link ? structuredClone(state.link) : null; audioAnimation = state.animation;
  activeTrackId = state.activeTrackId; selectedColorId = state.selectedColorId; selectedSoundSlotId = state.selectedSoundSlotId;
  selectedAudioFrameId = state.selectedAudioFrameId; selectedAudioLayerId = state.selectedAudioLayerId;
  setTool(state.activeTool === 'eraser' ? 'eraser' : 'pen');
  pxdBridge?.markDirty(); renderSong(); refreshAudioAnimationControls(); refreshAudioHistoryButtons();
  return true;
}
function moveAudioHistory(direction) {
  if (pointerDrawId !== null || activeHistorySnapshot || audioWavExporting || audioImageExporting || audioVideoController) return false;
  if (pendingTempoHistorySnapshot) { const snapshot = pendingTempoHistorySnapshot; pendingTempoHistorySnapshot = null; commitAudioHistoryState(snapshot); }
  if (pendingColorHistorySnapshot) { const snapshot = pendingColorHistorySnapshot; pendingColorHistorySnapshot = null; commitAudioHistoryState(snapshot); }
  const current = captureAudioHistoryState();
  const state = direction === 'undo' ? audioHistory.undo(current) : audioHistory.redo(current);
  if (!state) { refreshAudioHistoryButtons(); return false; }
  restoreAudioHistoryState(state);
  return true;
}
function flushPendingAudioHistoryEdits() {
  if (pendingTempoHistorySnapshot) { const snapshot = pendingTempoHistorySnapshot; pendingTempoHistorySnapshot = null; commitAudioHistoryState(snapshot); }
  if (pendingColorHistorySnapshot) { const snapshot = pendingColorHistorySnapshot; pendingColorHistorySnapshot = null; commitAudioHistoryState(snapshot); }
}
const viewport = createAudioViewport(pixelCanvas, gridWrap, {
  scope,
  onStrokeStart: () => { gestureOriginalSong = song; gestureOriginalImage = pxdImage ? structuredClone(pxdImage) : null; gestureOriginalLink = pxdLink ? structuredClone(pxdLink) : null; gestureOriginalAnimation = audioAnimation; gestureOriginalFrameId = selectedAudioFrameId; gestureOriginalLayerId = selectedAudioLayerId; },
  onGestureStart: () => {
    // The first finger can begin a stroke before the second arrives. Restore
    // that stroke so pinching never inserts an accidental musical note.
    const revertedStroke = Boolean(activeHistorySnapshot && audioHistoryStateChanged(activeHistorySnapshot));
    if (gestureOriginalSong) song = gestureOriginalSong;
    pxdImage = gestureOriginalImage; pxdLink = gestureOriginalLink; audioAnimation = gestureOriginalAnimation;
    selectedAudioFrameId = gestureOriginalFrameId; selectedAudioLayerId = gestureOriginalLayerId;
    finishAudioHistoryTransaction({ discard: true });
    effectEpoch += 1; interactionEffects.clear(); player.stop(); pointerDrawId = null; pointerLastCell = null;
    if (revertedStroke) pxdBridge?.markDirty();
    paintPixelCanvas(); updateCanvasLabel(); refreshAudioHistoryButtons();
  },
  onChange: () => { if (!disposed()) positionCursor(); }
});
scope.add(() => viewport.dispose());

const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
const player = createAudioPlayer({
  audioContextFactory: () => {
    if (!AudioContextConstructor) throw new Error('AudioContext unavailable');
    return new AudioContextConstructor({ latencyHint: 'playback' });
  },
  onStateChange(playing, starting) {
    if (disposed()) return;
    playButton.dataset.state = starting ? 'starting' : playing ? 'playing' : 'idle';
    playButton.setAttribute('aria-label', starting ? '曲の再生を中止' : playing ? '曲を停止' : '曲を再生');
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.toggleAttribute('aria-busy', starting);
    refreshAudioHistoryButtons();
    if (playing) startPlayhead(); else stopPlayhead();
  }
});

let statusTimer = 0;
function setStatus(message) {
  if (disposed()) return;
  status.textContent = message;
  clearTimeout(statusTimer);
  status.classList.toggle('is-visible', /できません|開けません|見つか|失われ|取り込みました|追加の音色|保存しました|ダウンロードを開始しました|共有画面に渡しました|まだ音符|動画|中止|無音|変更先の色|別の音に|同じ色|すでに同じ/.test(message));
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
function refreshAudioUi() {
  if (disposed()) return;
  for (const option of sizeSelect.options) if (Number(option.value) > AUDIO_PIXEL_COLUMNS) {
    option.textContent = `${option.value} × ${PITCHES.length}`;
  }
  pixelCanvas.removeAttribute('aria-disabled');
  tempoInput.disabled = false;
  sizeSelect.disabled = sharedMode();
  penButton.disabled = false;
  eraserButton.disabled = false;
  playButton.disabled = false;
  photoButton.disabled = false;
  exportSoundButton.disabled = audioWavExporting;
  exportVideoButton.disabled = Boolean(audioVideoController);
  refreshAudioHistoryButtons();
}
function animatedAudioMode() { return Boolean(audioAnimation && pxdLink?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION); }
function sharedMode() { return (pxdLink?.rulesVersion === 'shared-canvas-v1' || animatedAudioMode()) && Boolean(pxdImage); }
function columns() { return sharedMode() ? pxdImage.width : audioPixelColumns(song); }
function rows() { return sharedMode() ? pxdImage.height : PITCHES.length; }
function pitchAtRow(y) { return animatedAudioMode() ? getAudioAnimationRowPitchMap(pxdLink, selectedAudioFrameId)?.[y] : sharedMode() ? pxdLink.rowPitchMap[y] : PITCHES[y]?.midi; }
function pitchAtCell(x, y) { return animatedAudioMode() ? getAudioAnimationCellPitch(pxdLink, selectedAudioFrameId, x, y) : pitchAtRow(y); }
function pitchLabelAtRow(y) { return PITCHES.find((item) => item.midi === pitchAtRow(y))?.label || `音程${pitchAtRow(y)}`; }
function tickAtColumn(x) { const frameIndex = animatedAudioMode() ? audioAnimation.frames.findIndex((frame) => frame.id === selectedAudioFrameId) : 0; return (Math.max(0, frameIndex) * columns() + x) * AUDIO_PIXEL_TICKS; }
function flattenAudioAnimation(animation) {
  const needsFlatten = animation.layers.length > 1 || animation.layers.some((layer) => !layer.visible || layer.locked);
  if (!needsFlatten) return { animation, changed: false };
  const composites = animation.frames.map((frame) => composeAnimationFrame(animation, frame.id));
  const keptLayerId = animation.layers[0].id;
  let next = animation;
  for (let index = 0; index < animation.frames.length; index += 1) {
    const composite = composites[index];
    next = writeAnimationCel(next, animation.frames[index].id, keptLayerId, {
      ...composite,
      pixels: Uint8Array.from(composite.pixels, (value) => value + 1)
    });
  }
  for (const layer of animation.layers.slice(1)) next = removeAnimationLayer(next, layer.id);
  next = setLayerProperties(next, keptLayerId, { visible: true, locked: false });
  return { animation: next, changed: true };
}
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
    frameRowPitchMaps: priorLink?.frameRowPitchMaps,
    frameCellPitchMaps: priorLink?.width === animation.width && priorLink?.height === animation.height ? priorLink.frameCellPitchMaps : null,
    colorToSlot: colors,
    projectionReady
  });
}
function adoptAudioAnimation(animation, link = null) {
  const flattened = flattenAudioAnimation(animation);
  const hadSharedImageNotes = hasStaticImageCellNotes(song);
  if (hadSharedImageNotes) song = staticSongWithoutImageCells(song);
  audioAnimation = flattened.animation;
  selectedAudioFrameId = audioAnimation.frames[0]?.id || null;
  selectedAudioLayerId = audioAnimation.layers[0]?.id || null;
  pxdLink = audioAnimationLinkFor(audioAnimation, link, { projectionReady: Boolean(link?.projectionReady && !flattened.changed && !hadSharedImageNotes) });
  pxdImage = composedAnimationImage();
  selectedColorId = null;
}
function refreshAudioAnimationControls() {
  if (!animationPanel) return;
  animationPanel.hidden = !audioAnimation && !pxdImage;
  if (audioAnimation && !audioAnimation.frames.some((frame) => frame.id === selectedAudioFrameId)) selectedAudioFrameId = audioAnimation.frames[0].id;
  if (audioAnimation && !audioAnimation.layers.some((layer) => layer.id === selectedAudioLayerId)) selectedAudioLayerId = audioAnimation.layers.at(-1)?.id || audioAnimation.layers[0].id;
  animationControls?.refresh();
}
function animationControlState() {
  if (audioAnimation) return { frames: audioAnimation.frames, layers: audioAnimation.layers, frameId: selectedAudioFrameId,
    layerId: selectedAudioLayerId, playing: player?.isPlaying || player?.isStarting || false, onion: false, readOnly: false, audioMode: true };
  if (pxdImage) return { frames: [{ id: 'audio-static-frame', durationMs: 100 }], layers: [{ id: 'audio-static-layer', name: '絵', visible: true, locked: false }],
    frameId: 'audio-static-frame', layerId: 'audio-static-layer', playing: false, onion: false, readOnly: false, audioMode: true };
  return { frames: [], layers: [], frameId: null, layerId: null, playing: false, onion: false, readOnly: false, audioMode: true };
}
function hasStaticImageCellNotes(candidate) {
  return candidate.tracks.some((track) => track.clips.some((clip) => clip.notes.some((note) => note.sourceCell?.kind === undefined
    && Number.isInteger(note.sourceCell?.x) && Number.isInteger(note.sourceCell?.y))));
}
function staticSongWithoutImageCells(candidate) {
  if (!hasStaticImageCellNotes(candidate)) return candidate;
  return { ...candidate, tracks: candidate.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip,
    notes: clip.notes.filter((note) => !(note.sourceCell?.kind === undefined
      && Number.isInteger(note.sourceCell?.x) && Number.isInteger(note.sourceCell?.y)))
  })) })) };
}
function promoteStaticImageToAnimation() {
  if (animatedAudioMode()) return true;
  if (!pxdImage || pxdLink?.rulesVersion !== 'shared-canvas-v1') {
    setStatus('この静止画は共有キャンバス形式ではないため、フレーム化できません。画像と曲はそのままです。');
    return false;
  }
  try {
    let document = pxdImageToAudioDocument(pxdImage);
    document = { ...document, palette: document.palette.map((color) => color.length === 9 && color.slice(7).toLowerCase() === '00' ? color.slice(0, 7) : color) };
    if (document.palette.some((color) => color.length === 9 && color.slice(7).toLowerCase() !== 'ff')) {
      throw new RangeError('半透明の画素はフレーム化できません。静止画と曲はそのままです。');
    }
    const initial = createAnimationFromDraw(document);
    const baseSong = staticSongWithoutImageCells(song);
    const colorToSlot = Object.fromEntries(Object.entries(pxdLink.colorToSlot || {}).filter(([colorId]) => /^rgba-[\da-f]{8}$/i.test(colorId) && !colorId.endsWith('00')));
    const projection = prepareAudioAnimationImport(baseSong, initial, {
      rowPitchMap: pxdLink.rowPitchMap,
      frameRowPitchMaps: pxdLink.frameRowPitchMaps,
      frameCellPitchMaps: pxdLink.frameCellPitchMaps,
      colorToSlot,
    });
    audioAnimation = projection.animation;
    song = projection.song;
    pxdLink = projection.link;
    selectedAudioFrameId = audioAnimation.frames[0].id;
    selectedAudioLayerId = audioAnimation.layers[0].id;
    pxdImage = composedAnimationImage();
    pxdBridge?.markDirty();
    return true;
  } catch (error) {
    setStatus(error.message || '静止画をフレーム化できませんでした。画像と曲はそのままです。');
    return false;
  }
}
function markAudioAnimationEdited() {
  if (!audioAnimation || !pxdLink) return;
  pxdLink = createAudioAnimationLink(song, audioAnimation, {
    rowPitchMap: pxdLink.rowPitchMap?.length === audioAnimation.height ? pxdLink.rowPitchMap : null,
    frameRowPitchMaps: pxdLink.frameRowPitchMaps,
    frameCellPitchMaps: pxdLink.width === audioAnimation.width && pxdLink.height === audioAnimation.height ? pxdLink.frameCellPitchMaps : null,
    colorToSlot: pxdLink.colorToSlot,
    projectionReady: false
  });
  pxdBridge?.markDirty();
}
function ensureAudioAnimationProjection() {
  if (disposed() || !animatedAudioMode() || pxdLink.projectionReady) return song;
  const projected = prepareAudioAnimationImport(song, audioAnimation, {
    rowPitchMap: pxdLink.rowPitchMap,
    frameRowPitchMaps: pxdLink.frameRowPitchMaps,
    frameCellPitchMaps: pxdLink.width === audioAnimation.width && pxdLink.height === audioAnimation.height ? pxdLink.frameCellPitchMaps : null,
    colorToSlot: pxdLink.colorToSlot,
    composeFrame: composeAnimationFrame
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
async function handleAudioAnimationAction(action) {
  if (disposed()) return false;
  if (action.type === 'play') {
    if (player.isPlaying || player.isStarting) player.stop();
    else await player.play(ensureAudioAnimationProjection());
    animationControls?.refresh(); return true;
  }
  if (action.type === 'onion' || action.type === 'duration' || action.type.endsWith('-layer')
      || ['visibility', 'lock', 'rename-layer', 'move-layer', 'select-layer', 'select-cel'].includes(action.type)) return false;
  if (action.type === 'select-frame') {
    if (!audioAnimation?.frames.some((frame) => frame.id === action.frameId)) return false;
    showPlaybackFrame(action.frameId); pxdBridge?.markDirty(); refreshAudioAnimationControls(); return true;
  }
  if (!audioAnimation && action.type !== 'add-frame') return false;
  if (player.isPlaying || player.isStarting) player.stop();
  const historyBefore = captureAudioHistoryState();
  if (!audioAnimation && !promoteStaticImageToAnimation()) return false;
  const oldAnimation = audioAnimation;
  if (action.type === 'add-frame') {
    const sourceFrameId = audioAnimation.frames.some((frame) => frame.id === action.frameId) ? action.frameId : selectedAudioFrameId;
    const sourcePitchMap = getAudioAnimationRowPitchMap(pxdLink, sourceFrameId);
    const sourceCellPitchMap = pxdLink.frameCellPitchMaps?.[sourceFrameId];
    audioAnimation = addAnimationFrame(audioAnimation, { sourceFrameId, copy: action.copy !== false });
    selectedAudioFrameId = audioAnimation.frames.at(-1).id;
    pxdLink = { ...pxdLink, frameRowPitchMaps: { ...(pxdLink.frameRowPitchMaps || {}), ...(sourcePitchMap ? { [selectedAudioFrameId]: [...sourcePitchMap] } : {}) } };
    if (sourceCellPitchMap) pxdLink.frameCellPitchMaps = { ...(pxdLink.frameCellPitchMaps || {}), [selectedAudioFrameId]: { ...sourceCellPitchMap } };
    if (action.copy === false) for (const layer of audioAnimation.layers) {
      const cel = getAnimationCelDocument(audioAnimation, selectedAudioFrameId, layer.id); cel.pixels.fill(-1);
      cel.pixels = Uint8Array.from(cel.pixels, (value) => value + 1);
      audioAnimation = writeAnimationCel(audioAnimation, selectedAudioFrameId, layer.id, cel);
    }
  } else if (action.type === 'delete-frame') {
    audioAnimation = removeAnimationFrame(audioAnimation, action.frameId);
    if (selectedAudioFrameId === action.frameId) selectedAudioFrameId = audioAnimation.frames[Math.max(0, audioAnimation.frames.findIndex((frame) => frame.id === action.frameId))]?.id || audioAnimation.frames[0].id;
  } else if (action.type === 'move-frame') audioAnimation = moveAnimationFrame(audioAnimation, action.frameId, action.index);
  else return false;

  pxdImage = composedAnimationImage();
  if (audioAnimation !== oldAnimation) {
    markAudioAnimationEdited();
    ensureAudioAnimationProjection();
  } else renderSong();
  refreshAudioAnimationControls();
  commitAudioHistoryState(historyBefore);
  return true;
}
function selectedTrack() { return song.tracks.find((track) => track.trackId === activeTrackId) || song.tracks[0]; }
function previewPitch(pitch, slotId = selectedTrack().instrument, colorId = currentEditorColorId()) {
  const instrument = sharedMode() && colorId ? colorInstrumentFor(colorId, slotId) : paletteSlot(slotId)?.instrument;
  if (!instrument) return Promise.resolve(false);
  return player.preview({ instrument, pitch }).then((played) => played, () => { setStatus('音を試聴できませんでした。端末の音量やブラウザーの設定を確認してください。'); return false; });
}
function previewCell(pitch, slotId, cell, colorId = currentEditorColorId()) {
  if (!cell) return;
  const epoch = effectEpoch;
  void previewPitch(pitch, slotId, colorId).then((played) => {
    if (!played || epoch !== effectEpoch || viewport.isGesturing || document.visibilityState !== 'visible') return;
    const color = colorId ? pxdColorDisplayHex(colorId) : paletteSlot(slotId)?.color;
    if (!color) return;
    const canvasRect = pixelCanvas.getBoundingClientRect(); const hostRect = effectHost.getBoundingClientRect();
    try { interactionEffects.note({ canvas: pixelCanvas, host: effectHost, x: cell.x, y: cell.y, columns: columns(), rows: rows(), color, canvasRect, hostRect }); } catch {}
  });
}
function trackNoteAt(track, pitch, tick) { return track.clips.flatMap((clip) => clip.notes).find((note) => note.pitch === pitch && tick >= note.startTick && tick < note.startTick + note.durationTicks) || null; }
function pitchName(pitch) { return PITCHES.find((item) => item.midi === pitch)?.label || `音程${pitch}`; }

function setTool(tool) {
  if (disposed()) return;
  activeTool = tool; penButton.setAttribute('aria-pressed', 'true'); eraserButton.setAttribute('aria-pressed', String(tool === 'eraser'));
  const erasing = tool === 'eraser'; const glyph = erasing ? eraserIcon : penIcon;
  if (glyph) penButton.replaceChildren(glyph.cloneNode(true));
  const label = erasing ? '消しゴム（もう一度押すとペン）' : 'ペン（選択中に押すと消しゴム）';
  penButton.setAttribute('aria-label', label); penButton.title = label;
  penButton.classList.toggle('is-eraser', erasing);
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
function colorInstrumentFor(colorId, slotId = pxdLink?.colorToSlot?.[colorId]) {
  if (!colorId || !slotId) return null;
  return getAudioColorInstrument(song, colorId, slotId) || null;
}
function paletteSoundName(slotId, colorId = null) {
  const id = colorId && sharedMode() ? colorInstrumentFor(colorId, slotId) : paletteSlot(slotId)?.instrument;
  return AUDIO_INSTRUMENTS.find((instrument) => instrument.id === id)?.name || '音色';
}
function instrumentGroupFor(instrumentId) { return AUDIO_INSTRUMENT_GROUPS.find((group) => group.instruments.some((instrument) => instrument.id === instrumentId)) || null; }
function selectInstrumentGroupForSlot(slotId, colorId = currentEditorColorId()) {
  const instrumentId = sharedMode() && colorId
    ? colorInstrumentFor(colorId, slotId)
    : paletteSlot(slotId)?.instrument;
  const group = instrumentGroupFor(instrumentId);
  if (group) activeInstrumentGroupName = group.name;
}
function focusAudioEditorTab(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus({ preventScroll: true }));
}
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
function selectedPaintColor() { return selectedColorId ? `#${selectedColorId.slice(5, 11)}` : paletteSlot(selectedTrack().instrument)?.color || 'transparent'; }
function selectedPaintSlot() { return selectedColorId ? pxdLink?.colorToSlot[selectedColorId] ?? null : selectedTrack().instrument; }
function sourceColorIds() {
  if (!pxdImage || !pxdLink) return [];
  const ids = new Set(Object.keys(pxdLink.colorToSlot));
  for (let offset = 0; offset < pxdImage.rgba.length; offset += 4) if (pxdImage.rgba[offset + 3]) ids.add(imageColorId(pxdImage.rgba, offset));
  return [...ids].filter((id) => /^rgba-[\da-f]{8}$/i.test(id) && !id.endsWith('00')).slice(0, 32);
}
function currentEditorColorId() { return sharedMode() ? (selectedColorId || representativePxdColorId(selectedTrack().instrument)) : null; }
function currentEditorHex() { return currentEditorColorId() ? `#${currentEditorColorId().slice(5, 11)}` : paletteSlot(selectedTrack().instrument)?.color || '#ffffff'; }
function writeSourceColor(hex) {
  const colorId = currentEditorColorId();
  if (hex === currentEditorHex()) return currentEditorHex();
  if (player.isPlaying || player.isStarting) player.stop();
  let paletteHistoryBefore = null;
  if (colorId) pendingColorHistorySnapshot ||= captureAudioHistoryState();
  else {
    flushPendingAudioHistoryEdits();
    paletteHistoryBefore = captureAudioHistoryState();
  }
  try {
    if (!colorId) {
      song = setAudioPixelPalette(song, { slotId: selectedTrack().instrument, color: hex });
      pxdBridge?.markDirty(); renderPalette(); renderGrid(); updateCanvasLabel(); renderPaletteSettings({ sound: false });
      commitAudioHistoryState(paletteHistoryBefore);
      return currentEditorHex();
    }
    const result = replaceAudioSourceColor({ image: animatedAudioMode() ? null : pxdImage, animation: animatedAudioMode() ? audioAnimation : null, link: pxdLink, song, colorId, hex });
    pxdImage = animatedAudioMode() ? composedAnimationImageFor(result.animation, selectedAudioFrameId) : result.image;
    audioAnimation = result.animation; pxdLink = result.link; song = result.song; selectedColorId = result.colorId;
    pxdBridge?.markDirty(); renderPalette(); renderGrid(); updateCanvasLabel(); renderPaletteSettings({ sound: false });
    refreshAudioHistoryButtons();
    return currentEditorHex();
  } catch (error) {
    setStatus(error.message || '色を変更できませんでした。');
    return currentEditorHex();
  }
}
function openAudioColorEditor() {
  editorUi.closePanels();
  animationControls?.close?.();
  const settings = document.querySelector('#audio-palette-settings');
  if (settings) settings.open = false;
  audioPaletteView = 'color';
  for (const button of document.querySelectorAll('[data-audio-editor-view]')) button.setAttribute('aria-pressed', String(button.dataset.audioEditorView === 'color'));
  const trigger = document.querySelector('#audio-current');
  trigger?.setAttribute('aria-expanded', 'true');
  audioColorPanel.open({ color: currentEditorHex(), resetColor: null });
  renderPaletteSettings({ sound: false });
  focusAudioEditorTab('#audio-color-editor-panel .dce-view-tabs [data-dce-view="color"]');
}
function composedAnimationImageFor(animation, frameId) {
  if (!animation || !frameId) return null;
  const composed = composeAnimationFrame(animation, frameId);
  return { width: composed.width, height: composed.height, rgba: documentRgba(composed) };
}

function renderPalette() {
  if (disposed()) return;
  if (selectedColorId && (!sharedMode() || !Object.hasOwn(pxdLink.colorToSlot, selectedColorId))) selectedColorId = null;
  tracksEl.replaceChildren();
  if (sharedMode() && sourceColorIds().length) {
    const activeColorId = currentEditorColorId();
    for (const colorId of sourceColorIds()) {
      const hex = pxdColorDisplayHex(colorId); const slotId = pxdLink.colorToSlot[colorId];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'audio-track-choice audio-track-choice--source'; button.dataset.colorId = colorId;
      button.style.setProperty('--audio-source-color', hex);
      button.setAttribute('aria-pressed', String(colorId === activeColorId));
      const instrumentId = slotId ? colorInstrumentFor(colorId, slotId) : null;
      button.setAttribute('aria-label', `元画像の色 ${hex}${instrumentId ? `、${instrumentIcon(instrumentId).name}` : '、音の割り当てなし'}。タップで選択、もう一度で編集`);
      button.title = `${hex}${instrumentId ? `・${instrumentIcon(instrumentId).name}` : ''}`;
      const mark = document.createElement('span'); mark.className = 'audio-track-choice__mark'; mark.setAttribute('aria-hidden', 'true');
      if (instrumentId) {
        mark.append(createInstrumentIcon(instrumentId, hex, 'audio-instrument-icon'));
      }
      button.append(mark); tracksEl.append(button);
    }
  } else {
  for (const slot of currentPalette()) {
    const track = song.tracks.find((candidate) => candidate.instrument === slot.slotId);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'audio-track-choice'; button.dataset.trackId = track.trackId;
    button.style.setProperty('--audio-source-color', slot.color);
    button.setAttribute('aria-pressed', String(track.trackId === activeTrackId));
    if (selectedColorId) button.setAttribute('aria-pressed', 'false');
    const icon = instrumentIcon(slot.instrument);
    button.setAttribute('aria-label', `色${paletteNumber(slot.slotId)}、${slot.color}、${icon.name}。描く色を選ぶ`);
    button.title = `${icon.name}・色${paletteNumber(slot.slotId)}`;
    const mark = document.createElement('span'); mark.className = 'audio-track-choice__mark'; mark.setAttribute('aria-hidden', 'true');
    mark.append(createInstrumentIcon(slot.instrument, slot.color, 'audio-instrument-icon'));
    const label = document.createElement('span'); label.className = 'audio-track-choice__label'; label.textContent = `色${paletteNumber(slot.slotId)}`;
    button.append(mark, label);
    tracksEl.append(button);
  }
  }
  if (sharedMode() && (animatedAudioMode() ? audioAnimation.palette.length < 32 : Object.keys(pxdLink.colorToSlot).length < 32)) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'audio-track-choice audio-track-choice--add';
    add.textContent = '+'; add.setAttribute('aria-label', '色を追加'); add.title = '色を追加';
    scope.listen(add, 'click', () => {
      if (!sharedMode()) return;
      flushPendingAudioHistoryEdits();
      const historyBefore = captureAudioHistoryState();
      let hex = '#8ecdf0';
      for (let attempt = 0; Object.hasOwn(pxdLink.colorToSlot, `rgba-${hex.slice(1)}ff`) && attempt < 32; attempt += 1) hex = audioHslToHex((206 + attempt * 47) % 360, 65, 64);
      const colorId = `rgba-${hex.slice(1)}ff`;
      if (!Object.hasOwn(pxdLink.colorToSlot, colorId)) {
        if (animatedAudioMode() && audioAnimation.palette.length < 32) {
          audioAnimation = setAnimationPalette(audioAnimation, [...audioAnimation.palette, hex]);
          pxdLink = audioAnimationLinkFor(audioAnimation, pxdLink);
        } else pxdLink = { ...pxdLink, colorToSlot: { ...pxdLink.colorToSlot, [colorId]: null } };
        if (animatedAudioMode()) markAudioAnimationEdited();
        pxdBridge?.markDirty();
      }
      selectedColorId = colorId; setTool('pen'); renderPalette(); updateCanvasLabel();
      openAudioColorEditor();
      setStatus('色を追加しました。');
      commitAudioHistoryState(historyBefore);
    });
    tracksEl.append(add);
  }
  penButton.style.setProperty('--audio-selected-color', selectedPaintColor());
  const current = document.querySelector('#audio-current');
  if (current) {
    current.style.setProperty('--editor-color', selectedPaintColor());
    const name = selectedColorId ? selectedPaintColor() : `色${paletteNumber(selectedTrack().instrument)}、${paletteSoundName(selectedTrack().instrument)}`;
    current.setAttribute('aria-label', `選択中の${name}の色を調整`);
    current.title = name;
  }
}

function renderPaletteSettings(options = {}) {
  return renderPaletteSettingsImpl(options);
}
function renderPaletteSettingsImpl({ sound = true } = {}) {
  if (disposed()) return;
  refreshAudioUi();
  const focusedSoundSlotId = document.activeElement?.closest?.('#audio-sound-slots button[data-sound-slot]')?.dataset.soundSlot || null;
  const sourceId = currentEditorColorId(); const mappedSourceSlotId = sourceId ? pxdLink.colorToSlot[sourceId] : null;
  const slotId = mappedSourceSlotId || selectedSoundSlotId || selectedTrack().instrument;
  const hex = currentEditorHex(); const swatch = document.querySelector('#audio-edit-color-swatch'); const name = document.querySelector('#audio-edit-color-name');
  swatch?.style.setProperty('--audio-edit-color', hex); if (name) name.textContent = hex.toUpperCase();
  if (!sound || audioPaletteView !== 'sound' || !document.querySelector('#audio-palette-settings').open) return;
  const soundSlots = document.querySelector('#audio-sound-slots'); soundSlots?.replaceChildren();
  const mappedSlot = sourceId ? pxdLink.colorToSlot[sourceId] : null;
  const unassignButton = document.querySelector('#audio-sound-unassign');
  unassignButton?.setAttribute('aria-pressed', String(Boolean(sourceId && mappedSlot === null)));
  for (const slot of currentPalette()) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'audio-sound-slot'; button.dataset.soundSlot = slot.slotId;
    button.setAttribute('aria-label', `${slot.slotId}、${instrumentIcon(slot.instrument).name}をこの色に割り当て`); button.title = `${instrumentIcon(slot.instrument).name}に割り当て`;
    button.setAttribute('aria-pressed', String(mappedSlot === slot.slotId || (!sourceId && selectedSoundSlotId === slot.slotId)));
    button.append(createInstrumentIcon(slot.instrument, '#202a33', 'audio-instrument-icon'));
    const dot = document.createElement('span'); dot.className = 'audio-sound-slot__dot'; dot.style.backgroundColor = slot.color; dot.setAttribute('aria-hidden', 'true'); button.append(dot);
    soundSlots?.append(button);
  }
  const shareNote = document.querySelector('#audio-slot-share-note');
  if (shareNote) shareNote.textContent = 'ここで選んだ音色は、選択中の色だけに反映されます。';
  const retainedOverride = sourceId ? getAudioColorInstrument(song, sourceId, null) : null;
  const activeInstrument = sourceId && mappedSourceSlotId
    ? colorInstrumentFor(sourceId, mappedSourceSlotId)
    : retainedOverride || paletteSlot(slotId)?.instrument;
  if (sourceId !== instrumentPickerColorId) {
    const activeGroup = instrumentGroupFor(activeInstrument);
    if (activeGroup) activeInstrumentGroupName = activeGroup.name;
    instrumentPickerColorId = sourceId;
  }
  renderInstrumentGroupPicker(activeInstrument);
  if (focusedSoundSlotId) document.querySelector(`#audio-sound-slots button[data-sound-slot="${CSS.escape(focusedSoundSlotId)}"]`)?.focus({ preventScroll: true });
}
function renderInstrumentGroupPicker(activeInstrument) {
  const tabs = document.querySelector('#audio-instrument-group-tabs');
  const choices = document.querySelector('#audio-instrument-choices');
  const soundPanel = document.querySelector('#audio-sound-editor-panel');
  if (!tabs || !choices) return;
  const focused = document.activeElement;
  const focusedInstrument = focused?.closest?.('#audio-instrument-choices button[data-instrument]')?.dataset.instrument || null;
  const focusedGroup = focused?.closest?.('#audio-instrument-group-tabs button[data-instrument-group]')?.dataset.instrumentGroup || null;
  const previousScroll = soundPanel?.scrollTop || 0;
  const activeGroup = instrumentGroupFor(activeInstrument);
  if (!AUDIO_INSTRUMENT_GROUPS.some((group) => group.name === activeInstrumentGroupName)) activeInstrumentGroupName = activeGroup?.name || AUDIO_INSTRUMENT_GROUPS[0]?.name || null;
  const selectedGroup = AUDIO_INSTRUMENT_GROUPS.find((group) => group.name === activeInstrumentGroupName) || activeGroup;
  const drumNote = document.querySelector('#audio-drum-note');
  if (drumNote) drumNote.hidden = selectedGroup?.name !== 'ドラム';
  tabs.replaceChildren(); choices.replaceChildren();
  for (const group of AUDIO_INSTRUMENT_GROUPS) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.instrumentGroup = group.name;
    button.setAttribute('aria-pressed', String(group.name === selectedGroup?.name));
    button.setAttribute('aria-label', `${group.name}の音色を表示`); button.title = group.name; button.textContent = group.name;
    tabs.append(button);
  }
  choices.dataset.group = selectedGroup?.name || '';
  choices.setAttribute('aria-label', `${selectedGroup?.name || '音色'}の音色`);
  for (const instrument of selectedGroup?.instruments || []) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.instrument = instrument.id;
    button.setAttribute('aria-pressed', String(instrument.id === activeInstrument)); button.setAttribute('aria-label', `${instrument.name}を試聴して選択`); button.title = instrument.name;
    button.append(createInstrumentIcon(instrument.id, '#202a33', 'audio-instrument-icon'));
    const label = document.createElement('span'); label.textContent = instrument.name; button.append(label); choices.append(button);
  }
  if (soundPanel) soundPanel.scrollTop = previousScroll;
  const focusTarget = focusedInstrument ? choices.querySelector(`button[data-instrument="${CSS.escape(focusedInstrument)}"]`)
    : focusedGroup ? tabs.querySelector(`button[data-instrument-group="${CSS.escape(focusedGroup)}"]`) : null;
  focusTarget?.focus({ preventScroll: true });
}
function showAudioPaletteView(view) {
  if (view !== 'sound') { openAudioColorEditor(); return; }
  animationControls?.close?.();
  audioPaletteView = 'sound';
  audioColorPanel.close();
  document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false');
  const settings = document.querySelector('#audio-palette-settings'); if (settings) settings.open = true;
  document.querySelector('#audio-sound-editor-panel').hidden = false;
  for (const button of document.querySelectorAll('[data-audio-editor-view]')) button.setAttribute('aria-pressed', String(button.dataset.audioEditorView === audioPaletteView));
  renderPaletteSettings();
  focusAudioEditorTab('#audio-palette-settings [data-audio-editor-view="sound"]');
}
function assignCurrentColor(slotId) {
  const colorId = currentEditorColorId();
  if (!sharedMode() || !colorId) { selectedSoundSlotId = slotId; renderPaletteSettings(); return; }
  flushPendingAudioHistoryEdits();
  if (player.isPlaying || player.isStarting) player.stop();
  const historyBefore = captureAudioHistoryState();
  try {
    const mappingChanged = pxdLink.colorToSlot[colorId] !== slotId;
    if (animatedAudioMode()) {
      if (mappingChanged) {
        pxdLink = setAudioAnimationColorMapping(song, audioAnimation, pxdLink, { colorId, slotId });
        markAudioAnimationEdited();
      }
    } else {
      if (mappingChanged) {
        const result = assignPxdAudioColor(song, pxdImage, pxdLink, colorId, slotId);
        song = result.song; pxdLink = result.link;
      }
    }
    if (slotId) song = setAudioColorInstrument(song, { colorId, instrument: paletteSlot(slotId)?.instrument });
    selectedSoundSlotId = slotId || selectedSoundSlotId || selectedTrack().instrument;
    selectInstrumentGroupForSlot(selectedSoundSlotId);
    const track = mappingChanged && slotId && song.tracks.find((item) => item.instrument === slotId); if (track) activeTrackId = track.trackId;
    pxdBridge?.markDirty(); renderSong();
    if (mappingChanged) renderGrid();
    if (slotId) void previewPitch(72, slotId, colorId);
    setStatus(slotId ? `${pxdColorDisplayHex(colorId)}だけに${paletteSoundName(slotId, colorId)}を割り当てました。` : `${pxdColorDisplayHex(colorId)}を音なしにしました。`);
    commitAudioHistoryState(historyBefore);
  } catch (error) { setStatus(error.message || '色と音の割り当てを変更できませんでした。'); renderPaletteSettings(); }
}
function changeInstrument(slotId, instrumentId) {
  flushPendingAudioHistoryEdits();
  if (player.isPlaying || player.isStarting) player.stop();
  const historyBefore = captureAudioHistoryState();
  try {
    const sourceId = currentEditorColorId();
    let targetSlotId = slotId;
    let mappingChanged = false;
    if (sharedMode() && sourceId) {
      const mappedSlotId = pxdLink.colorToSlot[sourceId];
      targetSlotId = mappedSlotId || selectedSoundSlotId || selectedTrack().instrument;
      mappingChanged = mappedSlotId !== targetSlotId;
      if (mappingChanged) {
        if (animatedAudioMode()) pxdLink = setAudioAnimationColorMapping(song, audioAnimation, pxdLink, { colorId: sourceId, slotId: targetSlotId });
        else {
          const assigned = assignPxdAudioColor(song, pxdImage, pxdLink, sourceId, targetSlotId);
          song = assigned.song; pxdLink = assigned.link;
        }
      }
      song = setAudioColorInstrument(song, { colorId: sourceId, instrument: instrumentId });
      if (mappingChanged && animatedAudioMode()) markAudioAnimationEdited();
    } else {
      song = setAudioPixelPalette(song, { slotId: targetSlotId, instrument: instrumentId });
    }
    const selectedGroup = instrumentGroupFor(instrumentId); if (selectedGroup) activeInstrumentGroupName = selectedGroup.name;
    if (mappingChanged) activeTrackId = song.tracks.find((track) => track.instrument === targetSlotId)?.trackId || activeTrackId;
    selectedSoundSlotId = targetSlotId; pxdBridge?.markDirty(); renderPalette(); renderPaletteSettings(); updateCanvasLabel();
    if (mappingChanged) renderGrid();
    void previewPitch(72, targetSlotId, sourceId);
    setStatus(sourceId ? `${pxdColorDisplayHex(sourceId)}だけの音色を${instrumentIcon(instrumentId).name}に変更しました。` : `${instrumentIcon(instrumentId).name}を試聴しました。`);
    commitAudioHistoryState(historyBefore);
  } catch (error) { setStatus(error.message || '音色を変更できませんでした。'); }
}
scope.listen(document.querySelector('#audio-sound-slots'), 'click', (event) => {
  const button = event.target.closest('button[data-sound-slot]'); if (!button) return;
  selectedSoundSlotId = button.dataset.soundSlot; assignCurrentColor(selectedSoundSlotId);
});
scope.listen(document.querySelector('#audio-sound-unassign'), 'click', () => assignCurrentColor(null));
scope.listen(document.querySelector('#audio-instrument-group-tabs'), 'click', (event) => {
  const button = event.target.closest('button[data-instrument-group]'); if (!button) return;
  if (button.dataset.instrumentGroup === activeInstrumentGroupName) return;
  activeInstrumentGroupName = button.dataset.instrumentGroup;
  renderPaletteSettings();
});
scope.listen(document.querySelector('#audio-instrument-choices'), 'click', (event) => {
  const button = event.target.closest('button[data-instrument]'); if (!button) return;
  const selectedMapping = selectedColorId ? pxdLink.colorToSlot[selectedColorId] : null;
  const slotId = selectedMapping || selectedSoundSlotId || selectedTrack().instrument;
  changeInstrument(slotId, button.dataset.instrument);
});
scope.listen(document.querySelector('#audio-palette-settings'), 'click', (event) => {
  const button = event.target.closest('button[data-audio-editor-view]'); if (button) showAudioPaletteView(button.dataset.audioEditorView);
});

function cellOwner(x, y) {
  if (animatedAudioMode()) return song.tracks.find((track) => track.clips.some((clip) => clip.notes.some((note) => note.sourceCell?.kind === 'audio-animation' && note.sourceCell.frameId === selectedAudioFrameId && note.sourceCell.localX === x && note.sourceCell.y === y))) || null;
  if (sharedMode()) return song.tracks.find((track) => track.clips.some((clip) => clip.notes.some((note) => note.sourceCell?.x === x && note.sourceCell?.y === y))) || null;
  return song.tracks.find((track) => trackNoteAt(track, PITCHES[y].midi, x * AUDIO_PIXEL_TICKS)) || null;
}
function selectedCellMatches(x, y, owner = cellOwner(x, y)) {
  if (sharedMode()) {
    const slotId = selectedPaintSlot();
    const colorId = selectedColorId || representativePxdColorId(slotId) || `rgba-${selectedPaintColor().slice(1).padEnd(8, 'f').toLowerCase()}`;
    const offset = (y * columns() + x) * 4;
    return pxdImage?.rgba?.[offset + 3] > 0 && imageColorId(pxdImage.rgba, offset) === colorId;
  }
  return owner?.trackId === selectedTrack().trackId;
}
function cellDescription(x, y) {
  const owner = cellOwner(x, y); const midi = pitchAtCell(x, y); const pitch = { midi, label: PITCHES.find((item) => item.midi === midi)?.label || `音程${midi}` };
  const tick = tickAtColumn(x);
  const timeLabel = sharedMode() ? `${Math.floor(tick / AUDIO_BAR_TICKS) + 1}小節の${tick}Tick` : `${Math.floor(x / 4) + 1}拍目の${x % 4 + 1}つ目の16分音符`;
  const willErase = activeTool === 'eraser';
  const paintName = selectedColorId ? selectedPaintColor() : `色${paletteNumber(selectedTrack().instrument)}`;
  let ownerLabel = '音なし';
  if (owner) {
    let colorId = owner.colorId || null;
    if (sharedMode() && pxdImage?.rgba) {
      const offset = (y * columns() + x) * 4;
      if (pxdImage.rgba[offset + 3]) colorId = imageColorId(pxdImage.rgba, offset);
    }
    const slotId = sharedMode() && colorId ? pxdLink.colorToSlot[colorId] : owner.instrument;
    const instrumentId = sharedMode() && colorId ? colorInstrumentFor(colorId, slotId) : paletteSlot(owner.instrument)?.instrument;
    if (instrumentId) {
      const colorName = sharedMode() && colorId ? pxdColorDisplayHex(colorId) : `色${paletteNumber(owner.instrument)}`;
      ownerLabel = `${colorName}の${paletteSoundName(slotId, colorId)}あり`;
    }
  }
  return `${pitch.label}、${timeLabel}、${ownerLabel}。${willErase ? 'EnterまたはSpaceで消去' : `選択中の${paintName}でEnterまたはSpaceを押して描画`}。矢印キーで移動します。`;
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
  const indices = changed === null ? (sharedMode() ? [] : audioPixels.keys()) : changed;
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
let pxdMainImage = null;
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
  if (!cell) return false;
  const { x, y } = cell; const pitch = pitchAtCell(x, y); const tick = tickAtColumn(x);
  if (pitch === null || pitch === undefined) return false;
  const track = selectedTrack(); const active = mode === 'paint'; const slotId = selectedPaintSlot();
  const owner = cellOwner(x, y);
  if (active && selectedCellMatches(x, y, owner)) return false;
  if (!active && !owner && !pxdImage?.rgba[(y * columns() + x) * 4 + 3]) return false;
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    if (animatedAudioMode()) {
      let candidate = audioAnimation, candidateLink = pxdLink;
      const colorId = active ? selectedColorId || representativePxdColorId(slotId) || `rgba-${selectedPaintColor().slice(1).padEnd(8, 'f').toLowerCase()}` : null;
      if (active && !candidate.palette.some((color) => `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}` === colorId)) candidate = setAnimationPalette(candidate, [...candidate.palette, `#${colorId.slice(5, 11)}`]);
      if (active && !selectedColorId) candidateLink = createAudioAnimationLink(song, candidate, { rowPitchMap: pxdLink.rowPitchMap, frameRowPitchMaps: pxdLink.frameRowPitchMaps, frameCellPitchMaps: pxdLink.frameCellPitchMaps, colorToSlot: { ...pxdLink.colorToSlot, [colorId]: slotId }, projectionReady: false });
      const usedColors = getAnimationUsedColorIndices(candidate);
      if (active) usedColors.add(candidate.palette.findIndex((color) => `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}` === colorId));
      const colorPolicy = evaluateSharedCanvasPolicy({ width: candidate.width, height: candidate.height, colorCount: usedColors.size }, { passActive: true });
      if (!colorPolicy.supported) { setStatus('共有キャンバスは256px・32色までです。色を減らしてから編集してください。'); return false; }
      let changed = false;
      if (active) {
        const paintLayerId = candidate.layers.at(-1)?.id;
        if (!paintLayerId) return false;
        const result = setAudioAnimationPixel(candidate, candidateLink, { frameId: selectedAudioFrameId, layerId: paintLayerId, x, y, colorId, active: true });
        changed = result.changed; candidate = result.animation;
      } else {
        for (const layer of candidate.layers) {
          const result = setAudioAnimationPixel(candidate, candidateLink, { frameId: selectedAudioFrameId, layerId: layer.id, x, y, active: false });
          changed ||= result.changed; candidate = result.animation;
        }
      }
      if (!changed) return false;
      audioAnimation = candidate; pxdLink = candidateLink; markAudioAnimationEdited(); pxdImage = composedAnimationImage();
      pxdBridge?.markDirty();
      if (render) { paintPixelCanvas([y * columns() + x]); renderPalette(); updateCanvasLabel(); refreshAudioAnimationControls(); }
      if (active && audition && slotId) previewCell(pitch, slotId, cell, colorId);
      if (announce) setStatus('コマを編集しました。');
      return true;
    }
    if (sharedMode()) {
      const result = setSharedAudioCell(song, pxdImage, pxdLink, { x, y, slotId, colorId: active ? selectedColorId : null, active });
      const colorPolicy = evaluateSharedCanvasPolicy({ width: result.image.width, height: result.image.height, colorCount: result.image.colorCount }, { passActive: true });
      if (!colorPolicy.supported) { setStatus('共有キャンバスは256px・32色までです。色を減らしてから編集してください。'); return false; }
      song = result.song; pxdImage = result.image; pxdLink = result.link;
      pxdBridge?.markDirty();
      if (render) { paintPixelCanvas([y * columns() + x]); renderPalette(); updateCanvasLabel(); }
      if (active && audition && slotId) previewCell(pitch, slotId, cell, selectedColorId || representativePxdColorId(slotId));
      if (announce) setStatus(active && !slotId ? '色を描きました。' : `${pitchName(pitch)}の音を${active ? `色${paletteNumber(slotId)}で描きました` : '消しました'}。`);
      return true;
    }
    song = setAudioPixel(song, { trackId: track.trackId, pitch, startTick: tick, noteId: `note-${globalThis.crypto?.randomUUID?.() || Date.now()}-${x}-${y}`, active });
    pxdBridge?.markDirty();
    if (pxdImage && pxdLink) updatePxdImageCell(cell, active, track.instrument);
    if (render) { paintPixelCanvas([y * columns() + x]); updateCanvasLabel(); }
    if (active && audition) previewCell(pitch, track.instrument, cell, null);
    if (announce) setStatus(`${pitchName(pitch)}の音を${active ? `色${paletteNumber(track.instrument)}で描きました` : '消しました'}。`);
    return true;
  } catch (error) { setStatus(error.message || '音符を更新できませんでした。'); return false; }
}


function startPlayhead() {
  stopPlayhead();
  playbackEditFrameId = animatedAudioMode() ? selectedAudioFrameId : null;
  playhead.hidden = false;
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
          showPlaybackFrame(frame.id);
          playbackCells = Array.from({ length: columns() }, (_, x) => Array.from({ length: rows() }, (_, y) => ({ x, y, slot: audioPixels[y * columns() + x] })).filter(({ slot }) => slot >= 0));
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
  const restoreFrameId = playbackEditFrameId; playbackEditFrameId = null;
  if (!disposed() && restoreFrameId && animatedAudioMode() && audioAnimation.frames.some((frame) => frame.id === restoreFrameId)
      && selectedAudioFrameId !== restoreFrameId) {
    showPlaybackFrame(restoreFrameId);
  }
}

function showPlaybackFrame(frameId) {
  selectedAudioFrameId = frameId;
  pxdImage = composedAnimationImage(frameId);
  paintPixelCanvas();
  updateCanvasLabel();
  animationControls?.refresh();
}

function renderSong({ focusCell = null } = {}) {
  if (disposed()) return;
  validateAudioSong(song);
  activeTrackId = song.tracks.some((track) => track.trackId === activeTrackId) ? activeTrackId : song.tracks[0].trackId;
  renderPalette(); renderPaletteSettings(); renderGrid();
  sizeSelect.disabled = sharedMode();
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
  refreshAudioAnimationControls();
}

scope.listen(tracksEl, 'click', (event) => {
  const colorButton = event.target.closest('button[data-color-id]');
  if (colorButton && sharedMode()) {
    const colorId = colorButton.dataset.colorId;
    const editSelected = selectedColorId === colorId;
    audioColorPanel.close(); document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false');
    selectedColorId = colorId;
    const slotId = pxdLink.colorToSlot[colorId];
    selectedSoundSlotId = slotId || song.pixelPalette[0].slotId;
    selectInstrumentGroupForSlot(selectedSoundSlotId);
    const track = song.tracks.find((candidate) => candidate.instrument === slotId);
    if (track) activeTrackId = track.trackId;
    setTool('pen'); renderPalette(); updateCanvasLabel();
    if (editSelected) {
      openAudioColorEditor();
    } else setStatus(`${colorButton.title}で描きます。もう一度押すと色を調整できます。`);
    if (document.querySelector('#audio-palette-settings').open) renderPaletteSettings();
    return;
  }
  const button = event.target.closest('button[data-track-id]');
  if (!button) return;
  const editSelected = button.dataset.trackId === activeTrackId && !selectedColorId;
  audioColorPanel.close(); document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false');
  const from = button.querySelector('.audio-track-choice__mark')?.getBoundingClientRect();
  const track = song.tracks.find((candidate) => candidate.trackId === button.dataset.trackId);
  const selectedColor = currentPalette().find((slot) => slot.slotId === track?.instrument)?.color;
  activeTrackId = button.dataset.trackId; selectedColorId = null; selectedSoundSlotId = track.instrument; selectInstrumentGroupForSlot(selectedSoundSlotId); setTool('pen'); renderPalette();
  const selected = [...tracksEl.querySelectorAll('button[data-track-id]')].find((candidate) => candidate.dataset.trackId === activeTrackId);
  if (from && selected?.querySelector('.audio-track-choice__mark') && selectedColor) {
    try { interactionEffects.color({ from, to: penButton, color: selectedColor }); } catch {}
  }
  selected?.focus(); updateCanvasLabel();
  if (editSelected) openAudioColorEditor();
});

scope.listen(penButton, 'click', () => setTool(activeTool === 'pen' ? 'eraser' : 'pen'));
scope.listen(eraserButton, 'click', () => setTool('eraser'));
if (document.querySelector('#audio-current')) scope.listen(document.querySelector('#audio-current'), 'click', () => {
  if (audioColorPanel.isOpen) { audioColorPanel.close(); document.querySelector('#audio-current').setAttribute('aria-expanded', 'false'); }
  else openAudioColorEditor();
});
if (document.querySelector('#audio-palette-settings')) scope.listen(document.querySelector('#audio-palette-settings'), 'toggle', (event) => {
  if (event.target.open) {
    audioColorPanel.close(); document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false');
    audioPaletteView = 'sound'; document.querySelector('#audio-sound-editor-panel').hidden = false;
    for (const button of document.querySelectorAll('[data-audio-editor-view]')) button.setAttribute('aria-pressed', String(button.dataset.audioEditorView === 'sound'));
    renderPaletteSettings();
  }
});
if (document.querySelector('#audio-palette-close')) scope.listen(document.querySelector('#audio-palette-close'), 'click', () => { document.querySelector('#audio-palette-settings').open = false; });
scope.listen(document, 'keydown', (event) => {
  const key = event.key.toLowerCase();
  const editable = event.target?.isContentEditable || event.target?.closest?.('input:not([type="range"]), textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !editable && !document.body.hasAttribute('data-tool-result-open')
      && (key === 'z' || (key === 'y' && event.ctrlKey))) {
    event.preventDefault();
    if (key === 'z' && event.shiftKey) moveAudioHistory('redo');
    else if (key === 'z') moveAudioHistory('undo');
    else moveAudioHistory('redo');
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey || document.body.hasAttribute('data-tool-result-open')
      || event.target.closest?.('input, select, textarea, summary, [contenteditable]')) return;
  if (key === 'b' || key === 'p') setTool('pen');
  else if (key === 'e') setTool('eraser');
});
if (undoButton) scope.listen(undoButton, 'click', () => moveAudioHistory('undo'));
if (redoButton) scope.listen(redoButton, 'click', () => moveAudioHistory('redo'));

scope.listen(sizeSelect, 'change', async () => {
  const chosen = Number(sizeSelect.value); sizeSelect.value = String(columns());
  flushPendingAudioHistoryEdits();
  if (player.isPlaying || player.isStarting) player.stop();
  const historyBefore = captureAudioHistoryState();
  try {
    const resized = resizeAudioCanvas(song, chosen);
    if (pxdImage && pxdLink) {
      const copied = resizePxdAudioWorkingImage(pxdImage, pxdLink, chosen); song = resized; pxdImage = copied.image; pxdLink = copied.link;
    } else song = resized;
    renderSong();
    commitAudioHistoryState(historyBefore);
    setStatus(`キャンバスを${columns()} × ${PITCHES.length}に変更しました。`);
  } catch (error) { sizeSelect.value = String(columns()); setStatus(error.message || 'キャンバスを変更できませんでした。'); }
});

if (document.querySelector('#audio-output [data-output-project]')) scope.listen(document.querySelector('#audio-output [data-output-project]'), 'click', () => {
  editorUi.closePanels();
  void pxdBridge?.showProjects();
});

scope.listen(photoButton, 'click', async () => {
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
  const unchangedSource = () => sourceSnapshot.song === song && sourceSnapshot.image === pxdImage && sourceSnapshot.link === pxdLink && sourceSnapshot.bridge === pxdBridge && sourceSnapshot.current?.projectId === pxdBridge?.currentProject?.projectId && sourceSnapshot.held?.projectId === pxdBridge?.heldProject?.projectId && (!sourceSnapshot.image || imageSnapshot.rgba.every((value, index) => value === sourceSnapshot.image.rgba[index]));
  exportImageButton.disabled = true;
  audioImageExporting = true; refreshAudioHistoryButtons();
  try {
    await pxdBridge?.assertCanSave();
    if (disposed()) return;
    if (!unchangedSource()) throw new Error('素材が切り替わりました。絵をもう一度保存してください。');
    const { blob, width, height, scale, baseWidth, baseHeight } = await exportAudioImage(songSnapshot, imageSnapshot ? { image: imageSnapshot } : {});
    if (disposed()) return;
    if (!unchangedSource()) throw new Error('素材が切り替わりました。絵をもう一度保存してください。');
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-dot-music-${width}x${height}.png`, returnUrl: currentAudioReturnUrl, title: '音楽の画像を確認', source: 'ドットで音楽', metadata: { width: baseWidth, height: baseHeight, defaultScale: scale } }, sourceSnapshot.bridge, unchangedSource);
    if (staged.ok) return;
    if (staged.reason === 'source_changed') return;
    if (staged.reason === 'permission_blocked') { setStatus(staged.error?.message || 'この作品はファイルに書き出せません。'); return; }
    const saved = await saveFile(blob, `pixieed-dot-music-${width}x${height}.png`);
    if (disposed()) return;
    if (saved === 'cancelled') return;
    if (exportEpoch === effectEpoch && !viewport.isGesturing && document.visibilityState === 'visible') {
      try { interactionEffects.exportImage({ from: pixelCanvas, to: exportImageButton, image: pixelCanvas }); } catch {}
    }
    const shared = saved === 'shared';
    setStatus(staged.reason === 'project_save_failed'
      ? `編集内容を保存できなかったため、この画面に残りました。PNGの${shared ? '共有画面への受け渡し' : 'ダウンロード'}を開始しました。編集内容は保存し直してください。`
      : shared ? `${width}×${height}pxのPNGを共有画面に渡しました。` : `${width}×${height}pxのPNGのダウンロードを開始しました。`);
    if (hasAudioArtwork(songSnapshot, imageSnapshot)) showAudioResult({ title: shared ? 'PNGを共有画面に渡しました' : 'PNGのダウンロードを開始しました', detail: `${width}×${height}px` });
  } catch (error) { setStatus(error.message || '絵を保存できませんでした。'); }
  finally { exportImageButton.disabled = false; audioImageExporting = false; refreshAudioHistoryButtons(); }
});

scope.listen(gridWrap, 'pointerdown', (event) => {
  if (viewport.isGesturing) return;
  if (event.target !== pixelCanvas) return;
  const cell = canvasCellAt(event); if (!cell) return;
  event.preventDefault(); pixelCanvas.focus(); pointerDrawId = event.pointerId; pointerLastCell = cell; pixelCanvas.setPointerCapture(event.pointerId);
  beginAudioHistoryTransaction();
  pointerDrawMode = activeTool === 'eraser' ? 'erase' : 'paint';
  keyboardCursor = false; cursorCell = cell; updateCanvasLabel(); applyPixel(cell, pointerDrawMode);
});
scope.listen(gridWrap, 'pointermove', (event) => {
  if (viewport.isGesturing) return;
  if (event.pointerId !== pointerDrawId) return;
  const cell = canvasCellAt(event); if (!cell || !pointerLastCell) return;
  const changed = [];
  let lastChanged = null;
  for (const point of pixelLineCells(pointerLastCell, cell)) if (applyPixel(point, pointerDrawMode, { render: false, announce: false, audition: false })) { changed.push(point.y * columns() + point.x); lastChanged = point; }
  pointerLastCell = cell; cursorCell = cell; if (changed.length) { paintPixelCanvas(changed); if (pointerDrawMode === 'paint' && lastChanged && selectedPaintSlot()) previewCell(pitchAtCell(lastChanged.x, lastChanged.y), selectedPaintSlot(), lastChanged); } updateCanvasLabel();
});
function finishPointer(event) {
  if (event.pointerId !== pointerDrawId) return;
  if (event.type === 'pointercancel') { effectEpoch += 1; interactionEffects.clear(); }
  pointerDrawId = null; pointerLastCell = null;
  if (activeHistorySnapshot && audioHistoryStateChanged(activeHistorySnapshot) && animatedAudioMode() && !pxdLink.projectionReady) ensureAudioAnimationProjection();
  finishAudioHistoryTransaction();
  if (sharedMode()) { renderPalette(); renderPaletteSettings(); }
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
    event.preventDefault();
    if (player.isPlaying || player.isStarting) player.stop();
    const before = captureAudioHistoryState();
    applyPixel(cursorCell, activeTool === 'eraser' ? 'erase' : 'paint');
    commitAudioHistoryState(before); return;
  } else return;
  event.preventDefault(); keyboardCursor = true; cursorCell = next; updateCanvasLabel();
  setStatus(cellDescription(cursorCell.x, cursorCell.y));
});

scope.listen(tempoInput, 'input', () => {
  try {
    if (player.isPlaying || player.isStarting) player.stop();
    pendingTempoHistorySnapshot ||= captureAudioHistoryState();
    song = setAudioTempo(song, Number(tempoInput.value));
    pxdBridge?.markDirty();
    tempoValue.value = String(song.tempo); tempoValue.textContent = String(song.tempo);
    setStatus('テンポを更新しました。');
  } catch (error) { setStatus(error.message || 'テンポを変更できませんでした。'); }
});
scope.listen(tempoInput, 'change', flushPendingAudioHistoryEdits);

scope.listen(playButton, 'click', async () => {
  if (player.isPlaying || player.isStarting) { player.stop(); setStatus('再生を停止しました。'); return; }
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
  getEditorState: () => ({ activeTrackId, selectedColorId, activeTool, frameId: selectedAudioFrameId, viewport: viewport.getState() }),
  restoreEditorState(state) {
    activeTrackId = song.tracks.some((track) => track.trackId === state?.activeTrackId) ? state.activeTrackId : song.tracks[0].trackId;
    selectedColorId = state?.selectedColorId && sharedMode() && Object.hasOwn(pxdLink.colorToSlot, state.selectedColorId) ? state.selectedColorId : null;
    if (audioAnimation && audioAnimation.frames.some((frame) => frame.id === state?.frameId)) {
      selectedAudioFrameId = state.frameId; pxdImage = composedAnimationImage();
    }
    setTool(state?.activeTool === 'eraser' ? 'eraser' : 'pen'); viewport.restoreState(state?.viewport); renderPalette(); renderSong();
  },
  hasContent: () => Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject || pxdImage || collectAudioEvents(song).length),
  setStatus,
  async openProject(project) {
    if (!project.entries.length) {
      player.stop(); song = createAudioSong({ songId: crypto.randomUUID() });
      audioAnimation = null; selectedAudioFrameId = null; selectedAudioLayerId = null; pxdLink = null;
      const blank = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
      const plan = prepareSharedAudioImageImport(song, blank, { colorToSlot: blankAudioPaletteMapping(song) });
      song = plan.song; pxdImage = plan.image; pxdLink = plan.link; pxdMainImage = blank;
      activeTrackId = song.tracks[0].trackId; selectedColorId = null; currentDraftId = crypto.randomUUID(); renderSong(); resetAudioHistory(); return;
    }
    const storedSong = readPxdAudioState(project); const sharedImage = await readPxdSharedImage(project);
    const audioRoleAnimation = await readPxdAnimation(project, 'audio');
    if (audioRoleAnimation) {
      const animation = audioRoleAnimation;
      const animationSong = storedSong || createAudioSong({ songId: crypto.randomUUID() });
      const animationLink = audioRoleAnimation ? readPxdAudioLink(project) : null;
      if (animationLink?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION) {
        validateAudioAnimationBinding(animationSong, animation, animationLink);
      }
      if (player.isPlaying || player.isStarting) player.stop();
      song = animationSong;
      adoptAudioAnimation(animation, animationLink);
      activeTrackId = song.tracks[0].trackId; currentDraftId = crypto.randomUUID();
      if (!pxdLink.projectionReady) ensureAudioAnimationProjection();
      renderSong(); refreshAudioAnimationControls();
      resetAudioHistory();
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
    audioAnimation = null; selectedAudioFrameId = null; selectedAudioLayerId = null;
    song = nextSong; pxdImage = nextImage; pxdLink = nextLink; pxdMainImage = mainImage; activeTrackId = song.tracks[0].trackId; selectedColorId = null; currentDraftId = crypto.randomUUID();
    renderSong(); refreshAudioAnimationControls();
    resetAudioHistory();
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
  let previewAnimation = null;
  const framePreviews = new Map();
  scope.listen(animationControlsHost, 'click', (event) => {
    if (!event.target.closest?.('[data-action="toggle-frames"]')) return;
    editorUi.closePanels();
    audioColorPanel.close();
    document.querySelector('#audio-current')?.setAttribute('aria-expanded', 'false');
  });
  animationControls = mountAnimationControls({ host: animationControlsHost, scope,
    getState: animationControlState, onAction: handleAudioAnimationAction, frameOnly: true,
    getFramePreview: (frameId) => {
      // Animation edits produce a new snapshot; frame selection can reuse its previews.
      if (previewAnimation !== audioAnimation) { previewAnimation = audioAnimation; framePreviews.clear(); }
      if (audioAnimation && framePreviews.has(frameId)) return framePreviews.get(frameId);
      const image = audioAnimation ? composedAnimationImage(frameId) : frameId === 'audio-static-frame' ? pxdImage : null;
      const preview = image ? new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height) : null;
      if (audioAnimation && preview) framePreviews.set(frameId, preview);
      return preview;
    } });
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
    resetAudioHistory();
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
renderSong(); refreshAudioHistoryButtons();

// ---- the song as a sound file (WAV): the loop repeated to about 8 seconds, same instruments as playback ----
if (exportSoundButton) scope.listen(exportSoundButton, 'click', async () => {
  editorUi.closePanels();
  try { ensureAudioAnimationProjection(); } catch (error) { setStatus(error.message || '音を準備できませんでした。'); return; }
  const sourceSong = song; const sourceImage = pxdImage; const sourceLink = pxdLink; const sourceBridge = pxdBridge;
  const sourceCurrent = pxdBridge?.currentProject; const sourceHeld = pxdBridge?.heldProject;
  const unchanged = () => sourceSong === song && sourceImage === pxdImage && sourceLink === pxdLink && sourceBridge === pxdBridge && sourceCurrent?.projectId === pxdBridge?.currentProject?.projectId && sourceHeld?.projectId === pxdBridge?.heldProject?.projectId;
  audioWavExporting = true; refreshAudioUi(); setStatus('音を書き出しています…');
  try {
    await sourceBridge?.assertCanSave();
    if (disposed()) return;
    if (!unchanged()) throw new Error('素材が切り替わりました。音をもう一度保存してください。');
    const songSnapshot = structuredClone(sourceSong);
    const { blob, seconds, loops } = await renderAudioWav(songSnapshot);
    if (disposed()) return;
    if (!unchanged()) throw new Error('素材が切り替わりました。音をもう一度保存してください。');
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-dot-music-${Math.round(seconds)}s.wav`, returnUrl: currentAudioReturnUrl, title: '音を確認', source: 'ドットで音楽', metadata: { durationSeconds: seconds, sampleRate: 44100, loops } }, sourceBridge, unchanged);
    if (staged.ok) return;
    if (staged.reason === 'source_changed') return;
    if (staged.reason === 'permission_blocked') { setStatus(staged.error?.message || 'この作品はファイルに書き出せません。'); return; }
    const saved = await saveFile(blob, `pixieed-dot-music-${Math.round(seconds)}s.wav`);
    if (disposed()) return;
    if (saved !== 'cancelled' && unchanged()) {
      const shared = saved === 'shared';
      setStatus(staged.reason === 'project_save_failed'
        ? `編集内容を保存できなかったため、この画面に残りました。WAVの${shared ? '共有画面への受け渡し' : 'ダウンロード'}を開始しました。編集内容は保存し直してください。`
        : shared ? `${Math.round(seconds)}秒のWAVを共有画面に渡しました。` : `${Math.round(seconds)}秒のWAVのダウンロードを開始しました。`);
      if (hasSongNotes(songSnapshot)) showAudioResult({ title: shared ? 'WAVを共有画面に渡しました' : 'WAVのダウンロードを開始しました', detail: `${Math.round(seconds)}秒` });
    }
  } catch (error) { setStatus(error.message || '音を保存できませんでした。'); }
  finally { audioWavExporting = false; refreshAudioUi(); }
});

if (exportVideoButton) scope.listen(exportVideoButton, 'click', async () => {
  editorUi.closePanels();
  if (audioVideoController) return;
  try { ensureAudioAnimationProjection(); } catch (error) { setStatus(error.message || '動画の音を準備できませんでした。'); return; }
  const controller = new AbortController(); const epoch = ++audioVideoEpoch;
  audioVideoController = controller;
  const sourceSnapshot = { song, image: pxdImage, link: pxdLink, animation: audioAnimation, bridge: pxdBridge, currentProjectId: pxdBridge?.currentProject?.projectId, held: pxdBridge?.heldProject };
  const selectedImage = pxdImage || audioSongImage(song);
  const imageSnapshot = { width: selectedImage.width, height: selectedImage.height, rgba: new Uint8ClampedArray(selectedImage.rgba) };
  const unchangedSource = () => sourceSnapshot.song === song && sourceSnapshot.image === pxdImage && sourceSnapshot.link === pxdLink && sourceSnapshot.animation === audioAnimation && sourceSnapshot.bridge === pxdBridge && sourceSnapshot.currentProjectId === pxdBridge?.currentProject?.projectId && sourceSnapshot.held === pxdBridge?.heldProject && (sourceSnapshot.image === null || imageSnapshot.rgba.every((value, index) => value === sourceSnapshot.image.rgba[index]));
  const songSnapshot = structuredClone(song);
  refreshAudioUi();
  cancelVideoButton.hidden = false;
  status.classList.add('is-visible'); status.textContent = '曲の最後まで動画を作成しています…';
  try {
    await pxdBridge?.assertCanSave();
    if (!unchangedSource() || epoch !== audioVideoEpoch) throw new Error('素材が切り替わりました。音付き動画をもう一度作成してください。');
    if (controller.signal.aborted) { const error = new Error('動画の作成を中止しました。'); error.name = 'AbortError'; throw error; }
    const videoSeconds = songSnapshot.loopTicks * 60 / songSnapshot.tempo / AUDIO_PPQ;
    if (videoSeconds > 120) throw new RangeError('この曲は長いため動画にできません。曲を120秒以内にしてください。プロジェクト保存と再生は続けられます。');
    const frameImages = animatedAudioMode() ? audioAnimation.frames.map((frame) => {
      const frameImage = composedAnimationImage(frame.id);
      return { width: frameImage.width, height: frameImage.height, rgba: new Uint8ClampedArray(frameImage.rgba) };
    }) : null;
    const frameTicks = animatedAudioMode() ? audioAnimation.width * AUDIO_PIXEL_TICKS : null;
    const result = await renderAudioVideo(songSnapshot, imageSnapshot, {
      ...(frameImages ? { frameImages, frameTicks } : {}),
      signal: controller.signal,
      onProgress(progress) {
        if (epoch === audioVideoEpoch && audioVideoController === controller && unchangedSource()) status.textContent = `動画を作成しています… ${Math.min(99, Math.floor(progress * 100))}%`;
        else controller.abort();
      }
    });
    if (epoch !== audioVideoEpoch || controller.signal.aborted || !unchangedSource()) return;
    status.textContent = '動画を端末に保存しています…';
    if (!unchangedSource()) return;
    const outputFilename = `pixieed-dot-music-${Math.round(result.seconds)}s.${result.extension}`;
    const staged = await sendToolOutputAfterSaving({ blob: result.blob, filename: outputFilename, returnUrl: currentAudioReturnUrl, title: '音付き動画を確認', source: 'ドットで音楽', metadata: { durationSeconds: result.seconds, width: result.width, height: result.height } }, sourceSnapshot.bridge, unchangedSource);
    if (staged.ok) return;
    if (staged.reason === 'source_changed') return;
    if (staged.reason === 'permission_blocked') { setStatus(staged.error?.message || 'この作品はファイルに書き出せません。'); return; }
    const saved = await saveFile(result.blob, outputFilename);
    if (disposed() || epoch !== audioVideoEpoch) return;
    if (saved !== 'cancelled' && epoch === audioVideoEpoch && !controller.signal.aborted && unchangedSource()) {
      const shared = saved === 'shared';
      setStatus(staged.reason === 'project_save_failed'
        ? `編集内容を保存できなかったため、この画面に残りました。動画の${shared ? '共有画面への受け渡し' : 'ダウンロード'}を開始しました。編集内容は保存し直してください。`
        : shared ? `${Math.round(result.seconds)}秒の音付き動画を共有画面に渡しました。` : `${Math.round(result.seconds)}秒の音付き動画のダウンロードを開始しました。`);
      if (hasSongNotes(songSnapshot)) showAudioResult({ title: shared ? '音付き動画を共有画面に渡しました' : '音付き動画のダウンロードを開始しました', detail: `${Math.round(result.seconds)}秒` });
    }
  } catch (error) {
    if (epoch !== audioVideoEpoch) return;
    if (error?.name === 'AbortError') setStatus('動画の作成を中止しました。曲と絵はそのままです。');
    else setStatus(error.message || '音付き動画を作成できませんでした。PNGとWAVは引き続き保存できます。');
  } finally {
    if (audioVideoController === controller) audioVideoController = null;
    if (epoch === audioVideoEpoch) { cancelVideoButton.hidden = true; refreshAudioUi(); }
  }
});
if (cancelVideoButton) scope.listen(cancelVideoButton, 'click', () => audioVideoController?.abort());

function currentAudioReturnUrl() { return `${location.pathname}${location.search}${location.hash}`; }
  return { workspace: pxdBridge, dispose: disposeAudioMode };
}
