import { createFrameLoop } from '../pixel-studio/frame-loop.mjs';
import { encodeCameraPng, pngExportGeometry } from '../pixel-studio/png-export.mjs?rev=20260928-pixel-roundtrip-1';
import { DEFAULT_FRAME_RATIO, FRAME_RATIOS, normalizeOutputSize, sharedFrameRatios, sharedOutputSizes, resolveAspect, centerCrop, frameGeometry, fitFrame } from '../pixel-studio/framing.mjs?rev=20261001-free-tools-1';
import { cameraStartErrorMessage, deriveCameraPrimaryAction } from '../pixel-studio/camera-ui-state.mjs';
import { CAMERA_SETTING_DEFAULTS, DITHER_PATTERNS, lensFrameFilter, lensPalette, lensPaletteEdited, processLensFrame, resetLensPalette, resetLensPaletteEdits, setLensPalette, setLensPaletteColor, setLensSettings } from './engine.mjs?v=20261002-camera-palette-startup-2';
import { attachZoomGestures, createCameraZoomController, formatZoom, getUserMediaWithZoomPreference, zoomRange, zoomStops } from './zoom.mjs?v=20261004-camera-tap-focus-1';
import { GIF_FPS } from './gif.mjs?v=20261001-animation-1';
import { animatedCapturePlan, downsampleAnimatedFrame, encodeAnimatedGif } from '../animated-export.mjs?v=20261001-animation-1';
import { createCameraFileSave } from './file-save.mjs?rev=20261006-camera-save-1';
import { decodeCameraImageFile } from './image-source.mjs?rev=20261006-camera-upload-1';
import { cameraPostDataUrl } from './camera-post.mjs?rev=20261004-post-size-256-1';
import { createAudioSong } from '../creation/audio-core.mjs?rev=20260930-audio-timebase-1';
import { audioCameraCancelUrl, beginAudioCamera, completeAudioCamera, readAudioCameraRequest } from '../creation/audio-camera-handoff.mjs?rev=20260930-shared-canvas-5';
import { createPxdProject } from '../creation/pxd-codec.mjs';
import { evaluateSharedCanvasPolicy, SHARED_CANVAS_PREMIUM_MAX_COLORS } from '../creation/shared-canvas-policy.mjs?rev=20261001-free-tools-1';
import { countSharedImageColors, prepareSharedCanvasImage } from '../creation/shared-image.mjs?rev=20261001-free-tools-1';
import { putPxdSharedImage, readPxdSharedImage } from '../creation/pxd-project.mjs?rev=20261001-free-tools-1';
import { mountPxdTools } from '../creation/pxd-ui.mjs?rev=20261006-panel-close-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20261002-tool-transfer-1';
import { pickMergeSource, rankMergeTargets } from './merge-selection.mjs?rev=20261004-merge-selection-1';
import { createLiveRegionMergeTracker } from './live-region-merge.mjs?rev=20261004-merge-selection-1';
import { createCameraFocusController, mapPreviewPointToCameraFocus } from './focus.mjs?v=20261003-camera-focus-1';
import { createMiniatureProcessor, miniatureWorkSize } from './miniature.mjs?v=20261005-miniature-1';

const $ = (selector) => document.querySelector(selector);
const initialParams = new URLSearchParams(location.search);
const returnToAudio = initialParams.get('to') === 'audio';
let audioCameraRequest = readAudioCameraRequest({ search: location.search });
let audioCameraInvalid = false;
if (returnToAudio && !audioCameraRequest) {
  const legacyEntry = [...initialParams.entries()].length === 1 && initialParams.getAll('to').length === 1 && !initialParams.has('audioRequest');
  if (legacyEntry) {
    try {
      const nextUrl = beginAudioCamera({ song: createAudioSong() });
      history.replaceState(null, '', nextUrl);
      audioCameraRequest = readAudioCameraRequest({ search: location.search });
    } catch { audioCameraInvalid = true; }
  } else audioCameraInvalid = true;
} else if (initialParams.has('audioRequest') && !audioCameraRequest) audioCameraInvalid = true;
const root = $('#pixelStudio');
root.dataset.regionMerge = 'false';
root.dataset.mergeMaskVisible = 'false';
root.dataset.source = 'camera';
const resultView = createToolResultView({ key: 'camera-result', main: root, returnLabel: '撮り直す', onClose: retake });
const fileSave = createCameraFileSave({ dialog: $('#cameraSaveDialog') });
const video = $('#video');
const stage = $('#stage');
const view = $('#view');
const captureFrame = $('#captureFrame');
const viewContext = view.getContext('2d', { alpha: false });
const mergeSelectionOverlay = $('#mergeSelectionOverlay');
const mergeSelectionContext = mergeSelectionOverlay.getContext('2d');
const stageMessage = $('#stageMsg');
const info = $('#info');
const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
let importedSource = null;
let imageSelectionSequence = 0;
let lastImportedFrameAt = 0;
const IMPORTED_FRAME_INTERVAL_MS = 220;
const applyMiniature = createMiniatureProcessor();
const miniatureSource = document.createElement('canvas');
const miniatureSourceContext = miniatureSource.getContext('2d', { willReadFrequently: true });
const miniatureCanvas = document.createElement('canvas');
const miniatureContext = miniatureCanvas.getContext('2d');
let activeStream = null;
let cameraSequence = 0;
let renderSequence = 0;
let paletteEpoch = 0;
let previewAspect = 0;
let requestId = 0;
const workerUnavailable = null;
let previewReady = false;
let previousAiStatus = null;
let loop = null;
let lastFacing = 'environment';
let downloadUrl = null;
let downloadBlob = null;
let downloadGeneration = 0;
let gifExportJob = null;
let resumeOnVisible = true;
let pendingCameraRequest = null;
let previewSessionStarted = 0;
let previewCounter = 0;
let startupWatchdog = null;
let toastTimer = null;
let displayedPaletteRevision = null;
let capturePolicyNotice = '';
let audioFrozenFrame = null;
let captureInFlight = false;
let regionMergeSession = null;
const focusController = createCameraFocusController();
const focusMarker = $('#focusMarker');
let focusMarkerTimer = 0;
let focusRequestInFlight = false;
let focusRequestToken = 0;

// PiXiEELENS defaults (pixiee-lens/index.html): 4 colours, Game Boy palette, ordered dither, surface 55
const state = { mode: 'idle', facing: 'environment', result: null, error: '', ratio: DEFAULT_FRAME_RATIO, size: normalizeOutputSize(audioCameraRequest?.width ?? 128),
  colorDepth: '16', paletteMode: 'source', gradientMode: 'none', ditherPattern: 'net8', surfaceSimplify: 0, camera: { ...CAMERA_SETTING_DEFAULTS }, zoom: 1, miniature: false };
root.dataset.miniature = 'false';
let sharedImageTarget = null;
let sharedProjectBound = false;
let sharedImageEdited = false;
let sharedImageColorCount = 16;
let zoomInfo = zoomRange(null);
const zoomController = createCameraZoomController({ onChange: (snapshot) => {
  zoomInfo = snapshot.range;
  if (state.mode === 'live') {
    state.zoom = snapshot.requested;
    syncZoomStops();
    syncZoomHud();
    if (snapshot.hardwareFailed && snapshot.total > snapshot.requested + 0.02) {
      state.error = 'zoom';
      setInfoForMode('live');
      updatePrimaryAction();
      say(snapshot.overLimit
        ? 'カメラ倍率を40倍以内に調整できません。別のカメラをお試しください。'
        : 'カメラ倍率を設定できませんでした。カメラを切り替えるか、開き直してください。', { visible: true });
    }
  }
} });
// 面のまとまり is automatic: it only calms dither speckle with 8-16 colours (measured: no change at 2-4 colours,
// heavy posterising at high strength), so it runs at PiXiEELENS's default 55 there and is skipped elsewhere.
const autoSurface = (depth) => (depth === '8' || depth === '16' ? 55 : 0);
// A little more punch than the raw camera by default; the tone sliders still read 0 at this standard look.
const BASE_TONE = { contrast: 15, saturation: 20 };
const withBaseTone = (camera) => { const out = { ...camera }; for (const [key, add] of Object.entries(BASE_TONE)) out[key] = Math.max(-100, Math.min(100, (out[key] ?? 0) + add)); return out; };
function syncLens() { setLensSettings({ colorDepth: state.colorDepth, paletteMode: state.paletteMode, gradientMode: state.gradientMode, ditherPattern: state.ditherPattern, surfaceSimplify: autoSurface(state.colorDepth), cameraSettings: withBaseTone(state.camera) }); }
syncLens();
const COLOR_LABELS = { 2: '2色', 4: '4色', 8: '8色', 16: '16色', gray: 'グレー', 256: '256色', full: 'フルカラー' };


function say(message = '', { visible = false } = {}) {
  if (toastTimer !== null) { window.clearTimeout(toastTimer); toastTimer = null; }
  if (!message && capturePolicyNotice && state.mode === 'live') {
    message = capturePolicyNotice;
    visible = true;
  }
  stageMessage.textContent = message;
  stageMessage.hidden = !message;
  stageMessage.classList.toggle('pc-sr-only', !visible);
  stageMessage.classList.toggle('is-policy-notice', Boolean(message && message === capturePolicyNotice));
  const unavailableReason = $('#cameraUnavailableReason');
  if (unavailableReason && state.mode === 'idle' && message) unavailableReason.textContent = message;
}

function setCapturePolicyNotice(message) {
  if (message === capturePolicyNotice) return;
  const previous = capturePolicyNotice;
  capturePolicyNotice = message;
  if (message) say(message, { visible: true });
  else if (stageMessage.textContent === previous) say('');
}

function sayToast(message) {
  say(message, { visible: true });
  toastTimer = window.setTimeout(() => {
    toastTimer = null;
    if (stageMessage.textContent === message) say('');
  }, 2500);
}

function invalidateCaptureDownload() {
  downloadGeneration++;
  fileSave.reset();
  downloadBlob = null;
  gifExportJob?.abort(); gifExportJob = null;
  stopGifPlayback();
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  const link = $('#savePng');
  link.removeAttribute('href');
  link.removeAttribute('download');
  link.setAttribute('aria-disabled', 'true');
  link.setAttribute('tabindex', '-1');
}

function updateSaveLinkState() {
  const link = $('#savePng');
  const enabled = state.mode === 'captured' && Boolean(state.result && downloadUrl && downloadBlob);
  $('#resultControls').hidden = !enabled;
  $('#postCamera').hidden = Boolean(gif.pending);
  $('#useCameraImage').hidden = Boolean(audioCameraRequest || gif.pending);
  link.setAttribute('aria-disabled', String(!enabled));
  link.setAttribute('tabindex', enabled ? '0' : '-1');
  if (!enabled) link.removeAttribute('href');
}

function focusMergeTarget() {
  const target = $('#regionMergePalette button[data-recommended="true"]:not([hidden])') ?? $('#regionMergePalette button:not([hidden])');
  if (target) focusVisible(`#regionMergePalette button[data-rank="${target.dataset.rank}"]`);
}

function focusVisible(selector) {
  requestAnimationFrame(() => {
    if (document.visibilityState === 'hidden') return;
    const target = $(selector);
    if (target && !target.hidden && !target.disabled) target.focus({ preventScroll: true });
  });
}

function setInfoForMode(mode) {
  root.dataset.error = String(Boolean(state.error));
  const cameraStatus = $('#cameraStatus');
  const busy = !state.error && (mode === 'loading' || (mode === 'live' && !previewReady));
  stage.setAttribute('aria-busy', String(busy));
  if (cameraStatus) {
    cameraStatus.textContent = state.error && mode === 'live' ? '更新停止'
      : mode === 'idle' ? 'カメラ'
        : mode === 'loading' ? '準備中'
          : mode === 'live' ? (previewReady ? 'プレビュー' : '仕上げ中')
            : mode === 'captured' ? '撮影済み' : '';
  }
  if (mode === 'idle') info.textContent = '中央のカメラボタンで再開できます。';
  else if (mode === 'loading') info.textContent = '写真はこの端末で処理します。';
  else if (mode === 'live') {
    info.textContent = importedSource ? '画像を調整し、中央のボタンで確定できます。'
      : state.error === 'worker'
      ? 'ページを再読み込みしてください。'
      : state.error
        ? '前の完成画像を表示しています。'
        : previewReady
          ? '中央のボタンで撮影できます。'
          : '完成した画像から順に表示します。';
  } else if (mode === 'captured') info.textContent = '中央のボタンで撮り直せます。';
}

function setMode(mode) {
  if (mode !== 'live' && regionMergeSession) endRegionMerge({ restore: mode !== 'captured', endedStatus: mode === 'captured' ? 'captured' : 'cancelled' });
  if (mode !== 'captured') resultView.close({ focus: false, notify: false });
  state.mode = mode;
  root.dataset.mode = mode;
  root.dataset.facing = state.facing;
  $('#welcome').hidden = mode !== 'idle';
  $('#resultControls').hidden = mode !== 'captured';
  if (mode !== 'live') closeCameraSettings();
  settingsPanel.hidden = mode !== 'live' || Boolean(regionMergeSession);
  updateSizeSummary();
  updatePrimaryAction();
  updateSharedCaptureControls();
  const flipButton = $('#flipCamera');
  flipButton.disabled = mode !== 'live';
  const opensCamera = mode === 'live' && Boolean(importedSource);
  flipButton.setAttribute('aria-label', opensCamera ? 'カメラを開く' : 'インカメラと外カメラを切り替え');
  flipButton.title = opensCamera ? 'カメラを開く' : 'カメラ切り替え';
  updateSaveLinkState();
  setInfoForMode(mode);
}

function updatePrimaryAction() {
  const button = $('#capture');
  if (audioCameraRequest && audioFrozenFrame) {
    button.dataset.action = 'audio-return';
    button.setAttribute('aria-label', '画像を音楽へ戻す');
    button.title = '画像を音楽へ戻す';
    button.removeAttribute('aria-description');
    button.disabled = false;
    setCapturePolicyNotice('');
    return;
  }
  const primary = deriveCameraPrimaryAction({ mode: state.mode, hasResult: Boolean(state.result), error: state.error, workerUnavailable: Boolean(workerUnavailable) });
  button.dataset.action = primary.action;
  let label = audioCameraRequest && primary.action === 'capture' ? '撮影して音楽へ戻る' : primary.label;
  if (importedSource && state.mode === 'live') label = 'この画像を確定';
  const gifHelp = state.mode === 'live' && !audioCameraRequest && !importedSource ? 'Space長押しでGIF撮影、離すと終了' : '';
  button.setAttribute('aria-label', label);
  if (gifHelp) button.setAttribute('aria-description', gifHelp);
  else button.removeAttribute('aria-description');
  button.title = gifHelp ? `${label}（${gifHelp}）` : label;
  button.disabled = primary.disabled;
  let policyNotice = '';
  if (state.mode === 'live') {
    const dimensions = captureDimensions();
    const policy = evaluateSharedCanvasPolicy({
      width: dimensions.width,
      height: dimensions.height,
      colorCount: sharedImageTarget ? sharedImageColorCount : (Number(state.colorDepth) || 16)
    }, { passActive: sharedPassActive() });
    if (!policy.supported) {
      button.disabled = true;
      policyNotice = policy.reason === 'canvas-over-256px'
        ? 'この作品の画像サイズが上限を超えています。作品を256px以下に変更してください。'
        : policy.reason === 'colors-over-32'
          ? 'この作品の色数が上限を超えています。作品を32色以下に変更してください。'
          : 'この作品は撮影できないサイズです。作品を256px以下・32色以下に変更してください。';
      button.title = policyNotice;
      button.setAttribute('aria-label', policyNotice);
      button.removeAttribute('aria-description');
    }
  }
  setCapturePolicyNotice(policyNotice);
}

function currentAspect() {
  if (audioCameraRequest) return audioCameraRequest.width / audioCameraRequest.height;
  if (sharedProjectBound && sharedImageTarget) return sharedImageTarget.width / sharedImageTarget.height;
  return resolveAspect(state.ratio, Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
}

function sharedPassActive() { return true; }

function captureDimensions() {
  if (audioCameraRequest) return { width: audioCameraRequest.width, height: audioCameraRequest.height };
  if (sharedProjectBound && sharedImageTarget) return { width: sharedImageTarget.width, height: sharedImageTarget.height };
  return frameGeometry(currentAspect(), state.size);
}

function paletteFromRgba(rgba) {
  const palette = [];
  const seen = new Set();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2];
    const key = `${r},${g},${b}`;
    if (seen.has(key)) continue;
    seen.add(key); palette.push([r, g, b]);
  }
  return palette;
}

function updateSharedCaptureControls() {
  const passActive = sharedPassActive();
  const allowedSizes = new Set(sharedOutputSizes(passActive));
  for (const button of pixelsPanel?.querySelectorAll('[data-value]') ?? []) {
    const allowed = allowedSizes.has(Number(button.dataset.value));
    button.disabled = !allowed || Boolean(sharedImageTarget) || Boolean(audioCameraRequest);
    button.setAttribute('aria-disabled', String(button.disabled));
  }
  for (const button of aspectPanel?.querySelectorAll('[data-value]') ?? []) {
    button.disabled = Boolean(sharedImageTarget) || Boolean(audioCameraRequest);
    button.setAttribute('aria-disabled', String(button.disabled));
  }
  const dimensions = captureDimensions();
  const preliminary = evaluateSharedCanvasPolicy({ width: dimensions.width, height: dimensions.height, colorCount: sharedImageTarget ? sharedImageColorCount : (Number(state.colorDepth) || 16) }, { passActive });
  const lockedTarget = Boolean(sharedProjectBound && sharedImageTarget && (!preliminary.supported || preliminary.locked));
  root.dataset.sharedCanvasLocked = String(lockedTarget);
  root.dataset.sharedCanvasPass = String(passActive);
}

function updateSizeSummary() {
  const dimensions = ((state.mode === 'captured' || state.mode === 'live') && state.result) || captureDimensions();
  $('#frameDimensions').textContent = `${dimensions.width} × ${dimensions.height}`;
  root.dataset.framing = state.ratio;
  root.dataset.outputSize = String(state.size);
}

function updatePalettePreview(result) {
  const revision = `${(result.palette ?? []).map((c) => c.join(',')).join(';')}:${state.colorDepth}`;
  if (revision === displayedPaletteRevision) return;
  displayedPaletteRevision = revision;
  tintSwatches(result.palette);
  renderPaletteStrip(result.palette);
}

function fitPreview(frame) {
  // The frame has already been cropped before processing. Never crop it again
  // with CSS cover: the full displayed image is exactly what gets saved.
  const dimensions = frame?.width > 0 && frame?.height > 0 ? frame : frameGeometry(currentAspect(), state.size);
  const bottomUi = $('.lc-bottom');
  const helperSpace = root.dataset.settingsContext === 'tone'
    || (root.dataset.settingsContext === 'look' && $('#paletteStrip').dataset.reserved === 'false') ? 56 : 0;
  const contextSpace = `${Math.ceil(bottomUi.offsetHeight + 16 + helperSpace)}px`;
  if (root.style.getPropertyValue('--lc-context-space') !== contextSpace) {
    root.style.setProperty('--lc-context-space', contextSpace);
  }
  const stageStyle = getComputedStyle(stage);
  const horizontalPadding = Number.parseFloat(stageStyle.paddingLeft) + Number.parseFloat(stageStyle.paddingRight);
  const verticalPadding = Number.parseFloat(stageStyle.paddingTop) + Number.parseFloat(stageStyle.paddingBottom);
  const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
  const availableHeight = Math.max(1, stage.clientHeight - verticalPadding);
  const fit = fitFrame(dimensions.width, dimensions.height, availableWidth, availableHeight);
  captureFrame.style.width = `${fit.width}px`;
  captureFrame.style.height = `${fit.height}px`;
}

function invalidatePreview() {
  loop?.stop();
  renderSequence++;
}

function clearPreview() {
  state.result = null;
  state.error = '';
  previewReady = false;
  previousAiStatus = null;
  previewAspect = currentAspect();
  root.dataset.ready = 'false';
  view.width = 1;
  view.height = 1;
  fitPreview();
  updateSizeSummary();
  updatePrimaryAction();
}

function restartPreview({ preserveCompleted = false } = {}) {
  if (regionMergeSession) endRegionMerge({ restore: true });
  // Changing framing must not reopen the camera or invalidate its track token.
  // Separate render generations also prevent an old in-flight frame flashing in.
  if (state.mode !== 'live') return;
  invalidatePreview();
  if (preserveCompleted && state.result) {
    state.error = '';
    previewReady = false;
    previousAiStatus = null;
    previewAspect = currentAspect();
    root.dataset.ready = 'true';
    fitPreview(state.result);
    updateSizeSummary();
    updatePrimaryAction();
  } else clearPreview();
  setInfoForMode('live');
  if (preserveCompleted && state.result) say('画面に合わせてプレビューを更新しています…');
  if (!workerUnavailable) loop.start();
}

function drawCompleted(result) {
  if (!result?.width || !result?.height || result.data?.length !== result.width * result.height * 4) return false;
  if (view.width !== result.width || view.height !== result.height) {
    view.width = result.width;
    view.height = result.height;
  }
  viewContext.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
  fitPreview(result);
  state.result = result;
  updatePalettePreview(result);
  root.dataset.ready = 'true';
  updateSizeSummary();
  previewCounter++;
  root.dataset.previewFrames = String(previewCounter);
  root.dataset.previewElapsedMs = String(Math.round(performance.now() - previewSessionStarted));
  root.dataset.previewMs = String(Math.round(result.processingMs ?? 0));
  root.dataset.aiMs = String(Math.round(result.aiProcessingMs ?? 0));
  root.dataset.aiStatus = result.aiStatus ?? 'processing';
  root.dataset.shading = result.stats?.shading ?? 'sampled';
  root.dataset.paletteSize = String(result.palette?.length ?? 0);
  if (result.stats?.globalToneLevels) root.dataset.toneLevels = String(result.stats.globalToneLevels);
  root.dataset.paletteEpoch = String(paletteEpoch);
  root.dataset.miniatureFrame = String(Boolean(result.miniature));
  root.dataset.miniatureMs = String(Math.round(result.miniatureMs ?? 0));
  root.dataset.miniatureSourceWidth = String(result.miniatureSourceWidth ?? 0);
  root.dataset.miniatureSourceHeight = String(result.miniatureSourceHeight ?? 0);
  if (result.stats && 'paletteRevision' in result.stats) root.dataset.paletteRevision = String(result.stats.paletteRevision);
  if (result.stats && 'paletteLocked' in result.stats) root.dataset.paletteLocked = String(result.stats.paletteLocked);
  if (result.stats && 'dither' in result.stats) root.dataset.dither = String(result.stats.dither);
  root.dataset.materialCount = String(result.stats?.materialCount ?? 0);
  root.dataset.maxMaterialColors = String(result.stats?.maxMaterialColors ?? 0);
  root.dataset.straightLineCount = String(result.stats?.straightLineCount ?? 0);
  root.dataset.softenedLineCount = String(result.stats?.softenedLineCount ?? 0);
  root.dataset.straightLineCells = String(result.stats?.straightLineCells ?? 0);
  root.dataset.removedNoiseCells = String(result.stats?.removedNoiseCells ?? 0);
  root.dataset.motionReleasedCells = String(result.stats?.motionReleasedCells ?? 0);
  root.dataset.protectedDetailCells = String(result.stats?.protectedDetailCells ?? 0);
  root.dataset.faceStatus = result.faceStatus ?? 'unavailable';
  root.dataset.faceCount = String(result.faceCount ?? 0);
  root.dataset.faceMs = String(Math.round(result.faceProcessingMs ?? 0));
  if (previewCounter === 1) root.dataset.firstPreviewMs = root.dataset.previewElapsedMs;
  clearStartupWatchdog();
  state.error = '';
  if (stageMessage.textContent.startsWith('画像を処理できませんでした')) say('');
  setInfoForMode(state.mode);
  updatePrimaryAction();
  updateSaveLinkState();
  return true;
}

function mergePointFromClient(clientX, clientY) {
  const rect = view.getBoundingClientRect();
  if (!rect.width || !rect.height || clientX < rect.left || clientY < rect.top || clientX >= rect.right || clientY >= rect.bottom) return null;
  return { x: Math.floor((clientX - rect.left) * view.width / rect.width), y: Math.floor((clientY - rect.top) * view.height / rect.height) };
}

function hideFocusMarker() {
  if (focusMarkerTimer) window.clearTimeout(focusMarkerTimer);
  focusMarkerTimer = 0;
  focusMarker.hidden = true;
  focusMarker.dataset.focusState = '';
}

function showFocusRequestMarker(clientX, clientY) {
  const stageRect = stage.getBoundingClientRect();
  focusMarker.style.left = `${clientX - stageRect.left}px`;
  focusMarker.style.top = `${clientY - stageRect.top}px`;
  focusMarker.dataset.focusState = 'requested';
  focusMarker.hidden = false;
  if (focusMarkerTimer) window.clearTimeout(focusMarkerTimer);
  focusMarkerTimer = window.setTimeout(hideFocusMarker, 900);
}

async function requestCameraFocusAt(clientX, clientY, { silent = false } = {}) {
  const notify = (message) => { if (!silent) sayToast(message); };
  if (state.mode !== 'live' || gif.recording || captureInFlight) return;
  if (importedSource) { root.dataset.focusStatus = 'unavailable'; return; }
  if (focusRequestInFlight) {
    root.dataset.focusStatus = 'busy';
    notify('ピント要求中です。完了してからもう一度お試しください');
    return;
  }
  const track = activeStream?.getVideoTracks?.()[0];
  if (!track || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) { root.dataset.focusStatus = 'unavailable'; return; }
  if (zoomController.isApplying()) {
    root.dataset.focusStatus = 'busy';
    notify('ズーム調整中です。少し待ってからもう一度タップしてください');
    return;
  }
  const rect = view.getBoundingClientRect();
  const point = mapPreviewPointToCameraFocus({
    clientX, clientY, rect, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
    frameWidth: state.result?.width ?? view.width, frameHeight: state.result?.height ?? view.height,
    digitalZoom: zoomController.snapshot().digital, facing: state.facing
  });
  if (!point) return;
  hideFocusMarker();
  const cameraToken = cameraSequence;
  let supportedConstraints = {};
  try { supportedConstraints = navigator.mediaDevices?.getSupportedConstraints?.() ?? {}; } catch {}
  const requestToken = ++focusRequestToken;
  focusRequestInFlight = true;
  let result;
  try {
    result = await focusController.request(track, point, {
      supportedConstraints,
      isCurrent: (currentTrack) => currentTrack === activeStream?.getVideoTracks?.()[0] && cameraSequence === cameraToken && state.mode === 'live'
    });
  } catch {
    result = { status: 'failed', reason: 'request-error' };
  } finally {
    if (requestToken === focusRequestToken) focusRequestInFlight = false;
  }
  if (result.status === 'stale') return;
  root.dataset.focusStatus = result.status;
  if (result.status === 'requested') {
    root.dataset.focusX = String(point.x);
    root.dataset.focusY = String(point.y);
    showFocusRequestMarker(clientX, clientY);
    notify('この位置へのピント合わせを要求しました');
  } else if (result.status === 'unsupported') {
    root.dataset.focusX = '';
    root.dataset.focusY = '';
    notify('このカメラはタッチ位置でのピント合わせに対応していません');
  } else {
    root.dataset.focusX = '';
    root.dataset.focusY = '';
    notify('タッチ位置のピント要求に失敗しました');
  }
}

function beginRegionMerge(clientX, clientY) {
  if (state.mode !== 'live' || gif.recording || captureInFlight || !state.result?.sourceData) return false;
  const point = mergePointFromClient(clientX, clientY);
  if (!point) return false;
  const previousSession = regionMergeSession;
  const baseResult = previousSession?.latestRawResult ?? state.result;
  const sourceFrame = { width: baseResult.width, height: baseResult.height, data: baseResult.sourceData };
  const renderedFrame = { width: baseResult.width, height: baseResult.height, data: baseResult.data };
  const palette = baseResult.palette ?? [];
  if (!palette.length) { sayToast('色数を制限してから色統合してください'); return false; }

  let picked;
  try { picked = pickMergeSource({ source: sourceFrame, rendered: renderedFrame, palette, seed: point }); }
  catch { picked = null; }
  if (!picked) { sayToast('この位置の色を選べませんでした'); return false; }
  const sourceIndex = picked.sourceIndex;
  const seed = picked.seed;
  let tracker;
  let initialUpdate;
  let rankedTargets;
  const mode = $('#regionMergeMode').value;
  const strength = Number($('#regionMergeStrength').value);
  try {
    tracker = createLiveRegionMergeTracker({ source: sourceFrame, rendered: renderedFrame, palette, seed, sourceIndex, mode, strength });
    initialUpdate = tracker.update({ source: sourceFrame, rendered: renderedFrame, palette, targetColor: null, mode, strength, enabled: false });
    if (initialUpdate?.status !== 'tracking' || !initialUpdate.mask) throw new Error('initial mask unavailable');
    rankedTargets = rankMergeTargets({ rendered: renderedFrame, palette, mask: initialUpdate.mask, sourceIndex });
    if (!rankedTargets.length) throw new Error('target ranking unavailable');
  } catch {
    sayToast('色の追跡を開始できませんでした。もう一度長押ししてください');
    return false;
  }
  const recommendedIndex = rankedTargets.find((item) => item.recommended)?.index ?? -1;
  const signature = `|${mode}|${strength}`;
  const nextSession = {
    tracker, baseResult, latestRawResult: baseResult, sourceIndex, currentSourceIndex: initialUpdate.sourceIndex ?? sourceIndex, point: initialUpdate.seed ?? seed,
    choicePalette: palette.map((color) => [...color]), rankedTargets, recommendedIndex,
    targetColor: null, choiceTargetIndex: -1, mode, strength,
    changedPixels: 0, selectedPixels: Number(initialUpdate.selectedPixels) || 0, targetIndex: -1, mask: initialUpdate.mask,
    lastUpdatedRaw: baseResult, lastUpdateSignature: signature
  };
  // Keep the old selection intact unless the new tracker and its first mask both started cleanly.
  regionMergeSession = nextSession;
  // Replacing a target starts from the latest unmerged live frame, never the previously edited display.
  displayCurrentRegionMergeResult(baseResult);
  root.dataset.regionMerge = 'true';
  root.dataset.regionMergeStatus = 'tracking';
  root.dataset.regionMergeLastStatus = '';
  root.dataset.regionMergeSourceIndex = String(sourceIndex);
  root.dataset.regionMergeTargetIndex = '';
  root.dataset.regionMergeCurrentSourceIndex = String(nextSession.currentSourceIndex);
  root.dataset.regionMergeCurrentTargetIndex = '';
  root.dataset.regionMergeChangedPixels = '0';
  root.dataset.regionMergeSelectedPixels = String(nextSession.selectedPixels);
  root.dataset.regionMergeProcessingMs = '0';
  root.dataset.regionMergeTrackerProcessingMs = '0';
  root.dataset.regionMergeSeedX = String(nextSession.point.x);
  root.dataset.regionMergeSeedY = String(nextSession.point.y);
  captureFrame.style.translate = '';
  closeCameraSettings();
  root.dataset.settingsContext = 'merge';
  root.dataset.settingsExpanded = 'false';
  toolbarContextHead.hidden = false;
  toolbarContextLabel.textContent = '色統合';
  $('#toolbarContextBack').textContent = '← 色統合';
  $('#toolbarContextBack').setAttribute('aria-label', '色統合を解除してカメラへ戻る');
  settingsPanel.hidden = false;
  $('#gestureHint').hidden = true;
  updateRegionMergeColorSummary(nextSession, baseResult.palette ?? palette);
  $('#regionMergeHeading').textContent = '色統合中';
  $('#regionMergeCancel').textContent = '解除';
  $('#regionMergeCancel').setAttribute('aria-label', '色統合を解除してカメラ映像へ戻る');
  $('#regionMergeStatus').textContent = '枠線の範囲を確認し、候補色を選んでください。別の場所を長押しすると選び直せます。';
  $('#regionMergeUndo').disabled = true;
  $('#regionMergePanel').hidden = false;
  renderRegionMergePalette(nextSession.choicePalette, sourceIndex, -1, rankedTargets);
  updateMergeSelectionOverlay(nextSession.mask, baseResult.width, baseResult.height, renderedFrame, nextSession.currentSourceIndex, mode);
  syncContextOptions('merge');
  requestAnimationFrame(() => { if (regionMergeSession === nextSession) fitPreview(state.result); });
  say('枠線の範囲を確認し、色を選んでください');
  return true;
}

function updateRegionMergeColorSummary(session, palette = session?.latestRawResult?.palette ?? session?.choicePalette ?? [], { preserveSource = false } = {}) {
  if (!session) return;
  const sourceIndex = Number.isInteger(session.currentSourceIndex) ? session.currentSourceIndex : session.sourceIndex;
  const sourceColor = palette[sourceIndex] ?? session.choicePalette[session.sourceIndex];
  const sourceChip = $('#regionMergeSourceChip');
  const sourceLabel = $('#regionMergeSourceLabel');
  if (sourceColor && !preserveSource) {
    const rgb = sourceColor.slice(0, 3).join(',');
    const label = '色 ' + (sourceIndex + 1) + ' / ' + palette.length;
    if (sourceChip.dataset.index !== String(sourceIndex) || sourceChip.dataset.rgb !== rgb) {
      sourceChip.dataset.index = String(sourceIndex);
      sourceChip.dataset.rgb = rgb;
      sourceChip.style.setProperty('--merge-color', 'rgb(' + sourceColor.join(' ') + ')');
    }
    if (sourceLabel.textContent !== label) sourceLabel.textContent = label;
  }
  const targetChip = $('#regionMergeTargetChip');
  const targetLabel = $('#regionMergeTargetLabel');
  if (session.targetColor) {
    const targetIndex = Number.isInteger(session.targetIndex) && session.targetIndex >= 0 ? session.targetIndex : session.choiceTargetIndex;
    const targetColor = session.targetIndex >= 0 ? (palette[session.targetIndex] ?? session.targetColor) : session.targetColor;
    const rgb = targetColor.slice(0, 3).join(',');
    const indexText = targetIndex >= 0 ? String(targetIndex) : 'requested';
    if (targetChip.dataset.rgb !== rgb || targetChip.dataset.index !== indexText) {
      targetChip.dataset.index = indexText;
      targetChip.dataset.rgb = rgb;
      targetChip.style.setProperty('--merge-color', 'rgb(' + targetColor.join(' ') + ')');
    }
    if (targetChip.hidden) targetChip.hidden = false;
    const label = targetIndex >= 0 ? '色 ' + (targetIndex + 1) : '選択中';
    if (targetLabel.textContent !== label) targetLabel.textContent = label;
    if (targetLabel.dataset.recommended !== 'false') targetLabel.dataset.recommended = 'false';
    if (targetLabel.hasAttribute('title')) targetLabel.removeAttribute('title');
    return;
  }
  const recommendation = session.rankedTargets?.find((item) => item.recommended);
  if (recommendation) {
    const color = session.choicePalette[recommendation.index];
    const rgb = color.slice(0, 3).join(',');
    if (targetChip.dataset.index !== String(recommendation.index) || targetChip.dataset.rgb !== rgb) {
      targetChip.dataset.index = String(recommendation.index);
      targetChip.dataset.rgb = rgb;
      targetChip.style.setProperty('--merge-color', 'rgb(' + color.join(' ') + ')');
    }
    if (targetChip.hidden) targetChip.hidden = false;
    const label = '候補 色 ' + (recommendation.index + 1);
    if (targetLabel.textContent !== label) targetLabel.textContent = label;
    if (targetLabel.dataset.recommended !== 'true') targetLabel.dataset.recommended = 'true';
    const title = '選択範囲で多く使われている色です。自動では適用されません。';
    if (targetLabel.title !== title) targetLabel.title = title;
  } else {
    if (!targetChip.hidden) targetChip.hidden = true;
    if (targetLabel.textContent !== '候補なし') targetLabel.textContent = '候補なし';
    if (targetLabel.dataset.recommended !== 'false') targetLabel.dataset.recommended = 'false';
    if (targetLabel.title !== '他の色を選んでください。') targetLabel.title = '他の色を選んでください。';
  }
}

function updateMergeSelectionOverlay(mask, width, height, rendered = null, sourceIndex = -1, mode = 'surface') {
  if (!mask || !width || !height || mask.length !== width * height) {
    clearMergeSelectionOverlay();
    return;
  }
  if (mergeSelectionOverlay.width !== width || mergeSelectionOverlay.height !== height) {
    mergeSelectionOverlay.width = width;
    mergeSelectionOverlay.height = height;
  }
  const palette = regionMergeSession?.latestRawResult?.palette ?? [];
  const from = mode === 'color' && rendered?.data && Number.isInteger(sourceIndex) ? palette[sourceIndex] : null;
  const filteredMask = from ? new Uint8Array(mask.length) : mask;
  if (from) {
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (!mask[pixel]) continue;
      const offset = pixel * 4;
      if (rendered.data[offset] === from[0] && rendered.data[offset + 1] === from[1] && rendered.data[offset + 2] === from[2]) filteredMask[pixel] = 1;
    }
  }
  const image = mergeSelectionContext.createImageData(width, height);
  const pixels = image.data;
  const selected = (x, y) => x >= 0 && y >= 0 && x < width && y < height && filteredMask[y * width + x] !== 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!selected(x, y)) continue;
      const boundary = !selected(x - 1, y) || !selected(x + 1, y) || !selected(x, y - 1) || !selected(x, y + 1);
      if (!boundary) continue;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || selected(nx, ny)) continue;
        const outside = (ny * width + nx) * 4;
        pixels[outside] = 8; pixels[outside + 1] = 12; pixels[outside + 2] = 16; pixels[outside + 3] = 205;
      }
      const edge = (y * width + x) * 4;
      pixels[edge] = 255; pixels[edge + 1] = 220; pixels[edge + 2] = 105; pixels[edge + 3] = 235;
    }
  }
  mergeSelectionContext.putImageData(image, 0, 0);
  if (mergeSelectionOverlay.hidden) mergeSelectionOverlay.hidden = false;
  if (root.dataset.mergeMaskVisible !== 'true') root.dataset.mergeMaskVisible = 'true';
}

function clearMergeSelectionOverlay() {
  mergeSelectionContext.clearRect(0, 0, mergeSelectionOverlay.width, mergeSelectionOverlay.height);
  if (!mergeSelectionOverlay.hidden) mergeSelectionOverlay.hidden = true;
  if (root.dataset.mergeMaskVisible !== 'false') root.dataset.mergeMaskVisible = 'false';
}

function renderRegionMergePalette(palette, sourceIndex, targetIndex = -1, rankedTargets = []) {
  const box = $('#regionMergePalette');
  box.replaceChildren();
  const order = rankedTargets.length ? rankedTargets : palette.map((_color, index) => ({ index, count: 0, recommended: false }));
  order.forEach(({ index, count, recommended }, rank) => {
    const color = palette[index];
    if (!color) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.targetIndex = String(index);
    button.dataset.rank = String(rank);
    button.dataset.source = String(index === sourceIndex);
    button.dataset.recommended = String(Boolean(recommended));
    button.dataset.regionCount = String(count ?? 0);
    const recommendationLabel = recommended ? '候補。' : '';
    button.setAttribute('aria-label', `色 ${index + 1} ${recommendationLabel}をまとめ先にする`);
    button.setAttribute('aria-pressed', String(index === targetIndex));
    button.style.setProperty('--region-merge-swatch', `rgb(${color.join(' ')})`);
    button.title = `${recommended ? '候補・' : ''}色 ${index + 1}${index === sourceIndex ? '（元の色）' : ''}`;
    button.addEventListener('click', () => applyRegionMerge(index));
    box.append(button);
  });
  syncContextOptions('merge');
}

function setRegionMergeBusy(busy) {
  if (!regionMergeSession) return;
  $('#regionMergeMode').disabled = busy;
  $('#regionMergeStrength').disabled = busy;
  $('#regionMergeUndo').disabled = busy || !regionMergeSession.targetColor;
  $('#regionMergeCancel').disabled = busy;
  $('#regionMergePalette').querySelectorAll('button').forEach((button) => { button.disabled = busy; });
}

function updateLiveRegionMerge(rawResult, { force = false } = {}) {
  const session = regionMergeSession;
  if (!session || !rawResult?.sourceData) return null;
  session.latestRawResult = rawResult;
  session.baseResult = rawResult;
  const signature = `${session.targetColor?.join(',') ?? ''}|${session.mode}|${session.strength}`;
  // Controls can change during a pause, but only a fresh camera frame counts as a retry.
  if (session.lastUpdatedRaw === rawResult && (root.dataset.regionMergeStatus === 'paused' || !force || session.lastUpdateSignature === signature)) return null;
  const started = performance.now();
  let update;
  try {
    update = session.tracker.update({
      source: { width: rawResult.width, height: rawResult.height, data: rawResult.sourceData },
      rendered: { width: rawResult.width, height: rawResult.height, data: rawResult.data },
      palette: rawResult.palette ?? [], targetColor: session.targetColor,
      mode: session.mode, strength: session.strength, enabled: Boolean(session.targetColor)
    });
  } catch {
    update = { status: 'lost' };
  }
  session.lastUpdatedRaw = rawResult;
  session.lastUpdateSignature = signature;
  const trackerMs = Number.isFinite(update?.processingMs) ? update.processingMs : performance.now() - started;
  root.dataset.regionMergeTrackerProcessingMs = String(Math.round(trackerMs));
  root.dataset.regionMergeProcessingMs = String(Math.round((Number(rawResult.processingMs) || 0) + trackerMs));
  if (update?.status === 'paused') {
    root.dataset.regionMergeStatus = 'paused';
    session.changedPixels = 0;
    session.selectedPixels = 0;
    session.targetIndex = -1;
    root.dataset.regionMergeCurrentTargetIndex = '';
    updateRegionMergeColorSummary(session, rawResult.palette ?? session.choicePalette, { preserveSource: true });
    root.dataset.regionMergeChangedPixels = '0';
    root.dataset.regionMergeSelectedPixels = '0';
    clearMergeSelectionOverlay();
    const notice = '再検知中。色の選択を保ったまま、元の映像を表示しています。';
    if ($('#regionMergeStatus').textContent !== notice) $('#regionMergeStatus').textContent = notice;
    return { result: rawResult, stopped: '' };
  }
  if (update?.status !== 'tracking') {
    const status = update?.status === 'scene-changed' ? 'scene-changed' : 'lost';
    root.dataset.regionMergeLastStatus = status;
    endRegionMerge({ restore: false, endedStatus: status });
    return { result: rawResult, stopped: status };
  }
  if (root.dataset.regionMergeStatus === 'paused') {
    $('#regionMergeStatus').textContent = session.targetColor
      ? '再検知できました。選んだ色をライブ映像に適用しています。'
      : '再検知できました。枠線を確認し、まとめ先を選んでください。';
  }
  session.changedPixels = Number(update.changedPixels) || 0;
  session.selectedPixels = Number(update.selectedPixels) || 0;
  if (update.mask) session.mask = update.mask;
  if (Number.isInteger(update.sourceIndex)) session.currentSourceIndex = update.sourceIndex;
  session.targetIndex = session.targetColor && Number.isInteger(update.targetIndex) ? update.targetIndex : -1;
  root.dataset.regionMergeStatus = update.status;
  root.dataset.regionMergeCurrentSourceIndex = Number.isInteger(update.sourceIndex) ? String(update.sourceIndex) : '';
  root.dataset.regionMergeCurrentTargetIndex = session.targetIndex >= 0 ? String(session.targetIndex) : '';
  root.dataset.regionMergeSeedX = String(update.seed?.x ?? session.point.x);
  root.dataset.regionMergeSeedY = String(update.seed?.y ?? session.point.y);
  root.dataset.regionMergeChangedPixels = String(session.changedPixels);
  root.dataset.regionMergeSelectedPixels = String(session.selectedPixels);
  updateRegionMergeColorSummary(session, rawResult.palette ?? session.choicePalette);
  if (session.targetColor) {
    clearMergeSelectionOverlay();
    $('#regionMergeUndo').disabled = captureInFlight;
  } else {
    $('#regionMergeUndo').disabled = true;
    updateMergeSelectionOverlay(session.mask, rawResult.width, rawResult.height,
      { width: rawResult.width, height: rawResult.height, data: rawResult.data }, session.currentSourceIndex, session.mode);
  }
  return {
    result: { ...rawResult, data: update.data ?? rawResult.data, sourceData: rawResult.sourceData },
    stopped: ''
  };
}

function displayCurrentRegionMergeResult(result) {
  if (!result) return;
  state.result = result;
  if (view.width !== result.width || view.height !== result.height) {
    view.width = result.width;
    view.height = result.height;
  }
  viewContext.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
  fitPreview(result);
  root.dataset.ready = 'true';
  updateSizeSummary();
}

function applyRegionMerge(targetIndex = null) {
  const session = regionMergeSession;
  if (!session || captureInFlight) return;
  if (Number.isInteger(targetIndex)) {
    const palette = session.choicePalette;
    if (targetIndex < 0 || targetIndex >= palette.length) return;
    session.targetColor = [...palette[targetIndex]];
    session.targetIndex = -1;
    session.choiceTargetIndex = targetIndex;
    root.dataset.regionMergeTargetIndex = String(targetIndex);
    $('#regionMergePalette').querySelectorAll('[data-target-index]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.targetIndex) === targetIndex));
    });
    updateRegionMergeColorSummary(session);
    clearMergeSelectionOverlay();
    $('#regionMergeStatus').textContent = root.dataset.regionMergeStatus === 'paused'
      ? '再検知中。復帰したら選んだ色を適用します。' : '選んだ色をライブ映像に適用中です。';
  }
  session.mode = $('#regionMergeMode').value;
  session.strength = Number($('#regionMergeStrength').value);
  $('#regionMergeUndo').disabled = !session.targetColor;
  const update = updateLiveRegionMerge(session.latestRawResult, { force: true });
  if (update) {
    displayCurrentRegionMergeResult(update.result);
    if (update.stopped) {
      sayToast(update.stopped === 'scene-changed'
        ? '景色が変わったため色統合を解除しました。もう一度長押ししてください'
        : '追跡を続けられないため色統合を解除しました。もう一度長押ししてください');
      focusVisible('#stage');
    }
  }
}

function undoRegionMerge() {
  const session = regionMergeSession;
  if (!session || captureInFlight) return;
  session.targetColor = null;
  session.targetIndex = -1;
  session.choiceTargetIndex = -1;
  session.changedPixels = 0;
  session.selectedPixels = 0;
  root.dataset.regionMergeTargetIndex = '';
  root.dataset.regionMergeCurrentTargetIndex = '';
  root.dataset.regionMergeChangedPixels = '0';
  root.dataset.regionMergeSelectedPixels = '0';
  session.lastUpdateSignature = '';
  displayCurrentRegionMergeResult(session.latestRawResult);
  $('#regionMergePalette').querySelectorAll('[data-target-index]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
  $('#regionMergeUndo').disabled = true;
  updateRegionMergeColorSummary(session, session.latestRawResult?.palette ?? session.choicePalette);
  if (root.dataset.regionMergeStatus === 'paused') {
    clearMergeSelectionOverlay();
    $('#regionMergeStatus').textContent = '統合を元に戻しました。範囲は再検知中です。';
  } else {
    updateMergeSelectionOverlay(session.mask, session.latestRawResult.width, session.latestRawResult.height,
      { width: session.latestRawResult.width, height: session.latestRawResult.height, data: session.latestRawResult.data }, session.currentSourceIndex, session.mode);
    $('#regionMergeStatus').textContent = '色統合を解除しました。ライブ追跡は続いています。';
  }
}

function endRegionMerge({ restore = true, endedStatus = restore ? 'cancelled' : 'captured' } = {}) {
  const session = regionMergeSession;
  if (!session) return;
  regionMergeSession = null;
  root.dataset.regionMergeLastStatus = endedStatus;
  const latestRaw = session.latestRawResult ?? session.baseResult;
  if (restore && latestRaw && state.mode === 'live') displayCurrentRegionMergeResult(latestRaw);
  root.dataset.regionMerge = 'false';
  root.dataset.regionMergeStatus = '';
  root.dataset.regionMergeSourceIndex = '';
  root.dataset.regionMergeTargetIndex = '';
  root.dataset.regionMergeCurrentSourceIndex = '';
  root.dataset.regionMergeCurrentTargetIndex = '';
  root.dataset.regionMergeChangedPixels = '0';
  root.dataset.regionMergeSelectedPixels = '0';
  root.dataset.regionMergeProcessingMs = '0';
  root.dataset.regionMergeTrackerProcessingMs = '0';
  root.dataset.regionMergeSeedX = '';
  root.dataset.regionMergeSeedY = '';
  root.dataset.settingsContext = '';
  root.dataset.settingsExpanded = 'false';
  $('#regionMergePanel').hidden = true;
  clearMergeSelectionOverlay();
  settingsPanel.hidden = state.mode !== 'live';
  toolbarContextHead.hidden = true;
  toolbarMore.hidden = true;
  root.dataset.tray = '';
  openTool = null;
  captureFrame.style.translate = '';
  $('#regionMergeMode').disabled = false;
  $('#regionMergeStrength').disabled = false;
  $('#regionMergeCancel').disabled = false;
  fitPreview(state.result);
}

function returnToLiveAfterRegionMerge() {
  if (!regionMergeSession || captureInFlight) return;
  endRegionMerge({ restore: true });
  sayToast('色統合を解除しました。カメラ映像に戻りました');
  focusVisible('#stage');
}

$('#regionMergeMode').addEventListener('change', () => {
  if (regionMergeSession) $('#regionMergeStatus').textContent = 'まとめ方をライブ映像に反映しています。';
  applyRegionMerge();
});
$('#regionMergeStrength').addEventListener('input', (event) => {
  $('#regionMergeStrengthValue').value = `${event.target.value}%`;
  if (regionMergeSession) regionMergeSession.strength = Number(event.target.value);
});
$('#regionMergeStrength').addEventListener('change', (event) => {
  if (!regionMergeSession) return;
  $('#regionMergeStatus').textContent = `強さ ${event.target.value}% をライブ映像に適用中です。`;
  applyRegionMerge();
});
$('#regionMergeUndo').addEventListener('click', undoRegionMerge);
$('#regionMergeCancel').addEventListener('click', returnToLiveAfterRegionMerge);
$('#regionMergePanel').addEventListener('pointerdown', (event) => event.stopPropagation());
$('#regionMergePanel').addEventListener('click', (event) => event.stopPropagation());
$('#regionMergePanel').addEventListener('wheel', (event) => event.stopPropagation());

function clearStartupWatchdog() {
  if (startupWatchdog === null) return;
  window.clearTimeout(startupWatchdog);
  startupWatchdog = null;
}

const resizeObserver = new ResizeObserver(() => {
  if (root.ownerDocument.body.dataset.toolResultOpen === 'camera-result') return;
  if (state.mode === 'live' && !regionMergeSession && state.ratio === 'screen' && Math.abs(currentAspect() - previewAspect) > 0.0001) restartPreview({ preserveCompleted: true });
  fitPreview(state.result);
  updateSizeSummary();
});
resizeObserver.observe(stage);

function cameraFrame() {
  const isImage = Boolean(importedSource);
  const input = isImage ? importedSource.source : video;
  const inputWidth = isImage ? importedSource.width : video.videoWidth;
  const inputHeight = isImage ? importedSource.height : video.videoHeight;
  if (isImage) {
    const now = performance.now();
    if (now - lastImportedFrameAt < IMPORTED_FRAME_INTERVAL_MS) return null;
    lastImportedFrameAt = now;
  } else if (!activeStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !inputWidth || !inputHeight) return null;
  if (!input || !inputWidth || !inputHeight) return null;
  const output = captureDimensions();
  const aspect = output.width / output.height;
  const full = centerCrop(inputWidth, inputHeight, aspect);
  const zoom = zoomController.snapshot();
  // Keep the previous published preview while device zoom is still above the user's requested total.
  if (!isImage && zoom.total > zoom.requested + 0.02) return null;
  const digital = isImage ? state.zoom : zoom.digital;
  const crop = { sw: full.sw / digital, sh: full.sh / digital, sx: full.sx + (full.sw - full.sw / digital) / 2, sy: full.sy + (full.sh - full.sh / digital) / 2 };
  const { width, height } = output;
  let sampleSource = input, sampleCrop = crop, miniatureMs = 0, miniatureSourceWidth = 0, miniatureSourceHeight = 0;
  if (state.miniature) {
    const started = performance.now();
    const work = miniatureWorkSize(crop.sw, crop.sh);
    miniatureSourceWidth = work.width; miniatureSourceHeight = work.height;
    if (miniatureSource.width !== work.width || miniatureSource.height !== work.height) {
      miniatureSource.width = miniatureCanvas.width = work.width;
      miniatureSource.height = miniatureCanvas.height = work.height;
    }
    miniatureSourceContext.imageSmoothingEnabled = true;
    miniatureSourceContext.imageSmoothingQuality = 'high';
    miniatureSourceContext.clearRect(0, 0, work.width, work.height);
    // Start from the original crop every frame; tone and pixelisation follow later.
    miniatureSourceContext.drawImage(input, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, work.width, work.height);
    const original = miniatureSourceContext.getImageData(0, 0, work.width, work.height);
    const blurred = applyMiniature(original, true);
    miniatureContext.putImageData(new ImageData(blurred.data, work.width, work.height), 0, 0);
    sampleSource = miniatureCanvas;
    sampleCrop = { sx: 0, sy: 0, sw: work.width, sh: work.height };
    miniatureMs = performance.now() - started;
  }
  if (sourceCanvas.width !== width || sourceCanvas.height !== height) { sourceCanvas.width = width; sourceCanvas.height = height; }
  // PiXiEELENS renderDotFrame: draw the camera straight onto the dot grid through its smoothing blur and
  // camera tone filter, then run its colour pipeline on that dot-resolution image
  sourceContext.save();
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = 'high';
  sourceContext.filter = lensFrameFilter();
  sourceContext.clearRect(0, 0, width, height);
  if (!isImage && state.facing === 'user') { sourceContext.translate(width, 0); sourceContext.scale(-1, 1); }
  sourceContext.drawImage(sampleSource, sampleCrop.sx, sampleCrop.sy, sampleCrop.sw, sampleCrop.sh, 0, 0, width, height);
  sourceContext.restore();
  return { image: sourceContext.getImageData(0, 0, width, height), aspect, miniature: state.miniature, miniatureMs, miniatureSourceWidth, miniatureSourceHeight };
}

function renderLens(frame) {
  const started = performance.now();
  const sourceData = new Uint8ClampedArray(frame.image.data);
  const image = frame.image;
  processLensFrame(image);
  const { width, height } = image;
  // Gray can have more shades than the existing shared-capture colour limit.
  // In miniature mode show that final reduction live, so capture does not change
  // the displayed pixels. OFF retains the old live pipeline byte-for-byte.
  const data = frame.miniature && state.colorDepth === 'gray'
    ? new Uint8ClampedArray(prepareSharedCanvasImage({ width, height, rgba: image.data }, {
      passActive: sharedPassActive(), width, height, maxColors: sharedPassActive() ? 32 : 16
    }).image.rgba)
    : image.data;
  return { width, height, data, sourceData, aspect: frame.aspect, palette: lensPalette(), processingMs: performance.now() - started + frame.miniatureMs, miniature: frame.miniature, miniatureMs: frame.miniatureMs, miniatureSourceWidth: frame.miniatureSourceWidth, miniatureSourceHeight: frame.miniatureSourceHeight, aiStatus: 'disabled' };
}

loop = createFrameLoop({
  captureFrame: async () => cameraFrame(),
  processFrame: async (source, { signal }) => {
    if (signal.aborted) return null;
    return renderLens(source);
  },
  publishFrame: (result) => {
    if (state.mode === 'live') {
      try {
        const wasError = Boolean(state.error);
        let published = result;
        let mergeStopped = '';
        if (regionMergeSession) {
          const merge = updateLiveRegionMerge(result);
          if (merge) { published = merge.result; mergeStopped = merge.stopped; }
          else if (state.result) published = state.result;
        }
        if (!drawCompleted(published)) return;
        if (mergeStopped) {
          sayToast(mergeStopped === 'scene-changed'
            ? '景色が変わったため色統合を解除しました。もう一度長押ししてください'
            : '追跡を続けられないため色統合を解除しました。もう一度長押ししてください');
          focusVisible('#stage');
        }
        if (gif.recording) recordGifFrame(published);
        const previewMessage = result.aiStatus === 'ready' || result.aiStatus === 'processing' || result.aiStatus === 'disabled' ? ''
          : result.aiStatus === 'no-instances' ? ''
          : 'この端末に合わせた画質で表示しています。';
        if (!previewReady || previousAiStatus !== result.aiStatus) {
          previewReady = true;
          setInfoForMode('live');
          say(previewMessage);
          showGestureHintOnce();
        }
        if (wasError) {
          setInfoForMode('live');
          say(previewMessage);
        }
        updatePrimaryAction();
        previousAiStatus = result.aiStatus;
      }
      catch {
        state.error = 'preview';
        setInfoForMode('live');
        updatePrimaryAction();
        say('プレビューを更新できませんでした。前の画像を表示しています。', { visible: true });
      }
    }
  },
  onError: () => {
    if (workerUnavailable) {
      state.error = 'worker';
      setInfoForMode('live');
      updatePrimaryAction();
      loop.stop();
      say('カメラ変換を開始できません。ページを再読み込みしてください。', { visible: true });
      return;
    }
    if (!state.error && state.mode === 'live') {
      state.error = 'frame';
      setInfoForMode('live');
      updatePrimaryAction();
      say('画像を処理できませんでした。カメラを開き直してください。', { visible: true });
    }
  },
  intervalMs: 33,
  minDelayMs: 8
});

function stopTracks() {
  focusController.cancel();
  focusRequestToken++;
  focusRequestInFlight = false;
  hideFocusMarker();
  root.dataset.focusStatus = '';
  root.dataset.focusX = '';
  root.dataset.focusY = '';
  zoomController.detach();
  if (activeStream) {
    for (const track of activeStream.getTracks()) track.stop();
    activeStream = null;
  }
  video.pause();
  video.srcObject = null;
}

function closeCamera({ idle = true, message = '', focus = false, visible = false } = {}) {
  if (regionMergeSession) endRegionMerge({ restore: true, resume: false });
  clearStartupWatchdog();
  resumeOnVisible = false;
  cameraSequence++;
  invalidatePreview();
  stopTracks();
  if (idle) {
    setMode('idle');
    state.error = '';
    setInfoForMode('idle');
    if (focus) focusVisible('#capture');
  }
  if (message) say(message, { visible });
}

async function startCamera({ focus = true } = {}) {
  if (audioCameraInvalid) return;
  imageSelectionSequence++;
  clearImportedSource();
  if (regionMergeSession) endRegionMerge({ restore: true, resume: false });
  clearStartupWatchdog();
  resumeOnVisible = false;
  paletteEpoch++;
  root.dataset.paletteEpoch = String(paletteEpoch);
  const token = ++cameraSequence;
  previewSessionStarted = performance.now();
  previewCounter = 0;
  root.dataset.previewFrames = '0';
  invalidatePreview();
  stopTracks();
  clearPreview();
  state.facing = lastFacing;
  setMode('loading');
  say('カメラを準備しています…');
  if (focus) focusVisible('#capture');
  if (!navigator.mediaDevices?.getUserMedia) {
    setMode('idle');
    say(cameraStartErrorMessage(null, { secureContext: window.isSecureContext !== false, supported: false }), { visible: true });
    focusVisible('#capture');
    return;
  }
  try {
    // A permission prompt can outlive a hidden page. Do not stack another request.
    if (pendingCameraRequest) await pendingCameraRequest;
    if (token !== cameraSequence) return;
    let zoomSupported = false;
    try { zoomSupported = navigator.mediaDevices.getSupportedConstraints?.().zoom === true; } catch {}
    const request = getUserMediaWithZoomPreference(navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), {
      facingMode: state.facing, zoomSupported, permissions: navigator.permissions
    });
    pendingCameraRequest = request;
    let stream;
    try {
      stream = await request;
    } finally {
      if (pendingCameraRequest === request) pendingCameraRequest = null;
    }
    if (token !== cameraSequence) { stream.getTracks().forEach((track) => track.stop()); return; }
    activeStream = stream;
    startupWatchdog = window.setTimeout(() => {
      if (token !== cameraSequence || previewReady) return;
      startupWatchdog = null;
      closeCamera({ message: 'カメラ映像を受信できませんでした。中央のボタンで再試行してください。', focus: true, visible: true });
    }, 12000);
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (activeStream === stream && cameraSequence === token) {
          closeCamera({ message: 'カメラが停止しました。中央のカメラボタンで再開できます。', focus: true });
        }
      }, { once: true });
    }
    video.srcObject = stream;
    await video.play();
    if (token !== cameraSequence) { stream.getTracks().forEach((track) => track.stop()); return; }
    setupZoomForTrack(stream.getVideoTracks()[0]);
    setMode('live');
    setInfoForMode('live');
    say('最初の画像を仕上げています…');
    loop.start();
  } catch (error) {
    if (token !== cameraSequence) return;
    closeCamera({ message: cameraStartErrorMessage(error, { secureContext: window.isSecureContext !== false }), focus: true, visible: true });
  }
}

function clearImportedSource() {
  if (!importedSource) {
    root.dataset.source = 'camera';
    return;
  }
  const previous = importedSource;
  importedSource = null;
  lastImportedFrameAt = 0;
  root.dataset.source = 'camera';
  previous.dispose?.();
}

async function loadCameraImage(file) {
  const selection = ++imageSelectionSequence;
  resumeOnVisible = false;
  const imageStatus = $('#cameraImageStatus');
  if (imageStatus) { imageStatus.hidden = true; imageStatus.textContent = ''; }
  if (audioCameraInvalid || captureInFlight) {
    const message = audioCameraInvalid
      ? '音楽への受け渡しを確認できません。曲へ戻ってカメラを開き直してください。'
      : '撮影の保存が終わってから画像を選んでください。';
    if (imageStatus) { imageStatus.textContent = message; imageStatus.hidden = false; }
    say(message, { visible: true });
    return;
  }
  let decoded;
  try {
    decoded = await decodeCameraImageFile(file);
  } catch (error) {
    if (selection === imageSelectionSequence) {
      const message = error instanceof Error ? error.message : 'この画像を開けませんでした。別の画像をお試しください。';
      if (imageStatus) { imageStatus.textContent = message; imageStatus.hidden = false; }
      say(message, { visible: true });
    }
    return;
  }
  if (selection !== imageSelectionSequence) { decoded.dispose?.(); return; }
  if (state.mode === 'captured' && sharedImageEdited) {
    try {
      await cameraPxd.save();
    } catch (error) {
      decoded.dispose?.();
      if (selection === imageSelectionSequence) {
        const message = error instanceof Error ? error.message : '撮影画像を保存できませんでした。';
        if (imageStatus) { imageStatus.textContent = message; imageStatus.hidden = false; }
        say(message, { visible: true });
      }
      return;
    }
    if (selection !== imageSelectionSequence) { decoded.dispose?.(); return; }
  }

  if (regionMergeSession) endRegionMerge({ restore: false, resume: false });
  clearStartupWatchdog();
  resumeOnVisible = false;
  cameraSequence++;
  invalidatePreview();
  if (gif.recording) stopGifUi();
  gif.pending = null;
  stopTracks();
  invalidateCaptureDownload();
  const previous = importedSource;
  importedSource = decoded;
  previous?.dispose?.();
  root.dataset.source = 'image';
  lastImportedFrameAt = 0;

  sharedImageTarget = null;
  sharedImageColorCount = 16;
  sharedImageEdited = false;
  sharedProjectBound = false;
  state.zoom = 1;
  zoomInfo = zoomRange(null);
  zoomController.setZoom(1);
  if (!state.customLook) {
    resetLensPalette();
    resetLensPaletteEdits();
  }
  setPaletteEditing(-1);
  paletteEpoch++;
  displayedPaletteRevision = null;
  root.dataset.paletteEpoch = String(paletteEpoch);
  syncLens();
  syncControls();

  clearPreview();
  previewSessionStarted = performance.now();
  previewCounter = 0;
  root.dataset.previewFrames = '0';
  setMode('live');
  updateSharedCaptureControls();
  syncZoomStops();
  syncZoomHud();
  say('画像を読み込みました。色やドットを調整して確定できます。', { visible: true });
  if (!workerUnavailable) loop.start();
}

// Keep fallback buttons and scrolling outside the stage's camera gestures.
$('#welcome').addEventListener('pointerdown', (event) => event.stopPropagation());
$('#welcome').addEventListener('wheel', (event) => event.stopPropagation());
const cameraImageInput = $('#cameraImageInput');
const chooseCameraImage = () => cameraImageInput.click();
$('#cameraChooseImage').addEventListener('click', chooseCameraImage);
$('#cameraFallbackChoose').addEventListener('click', chooseCameraImage);
cameraImageInput.addEventListener('change', () => {
  const file = cameraImageInput.files?.[0];
  cameraImageInput.value = '';
  if (file) void loadCameraImage(file);
});

async function capture() {
  if (captureInFlight || state.mode !== 'live' || !state.result) return;
  imageSelectionSequence++;
  if (regionMergeSession) {
    const merge = updateLiveRegionMerge(regionMergeSession.latestRawResult, { force: true });
    if (merge) {
      displayCurrentRegionMergeResult(merge.result);
      if (merge.stopped) sayToast(merge.stopped === 'scene-changed'
        ? '景色が変わったため色統合を解除しました。撮影画像はそのまま保存します'
        : '追跡を続けられないため色統合を解除しました。撮影画像はそのまま保存します');
    }
  }
  if (audioCameraRequest) {
    if (audioFrozenFrame) { finishAudioCamera(audioFrozenFrame); return; }
    const passActive = sharedPassActive();
    const target = captureDimensions();
    const maxColors = passActive ? 32 : 16;
    const policy = evaluateSharedCanvasPolicy({ width: target.width, height: target.height, colorCount: maxColors }, { passActive });
    if (!policy.supported) { sayToast('共通キャンバスは最大256px・32色です。プロジェクトのキャンバス設定を確認してください'); return; }
    let prepared;
    try {
      prepared = prepareSharedCanvasImage({ width: state.result.width, height: state.result.height, rgba: new Uint8Array(state.result.data) }, {
        passActive, width: target.width, height: target.height, maxColors
      });
    } catch {
      sayToast('共通キャンバスの範囲を確認できないため、画像を戻しませんでした');
      return;
    }
    if (!prepared.policy.supported || prepared.image.width !== target.width || prepared.image.height !== target.height) {
      sayToast('共通キャンバスは最大256px・32色です。撮影画像は変更せず、編集画面に戻ります');
      return;
    }
    const rgba = new Uint8ClampedArray(prepared.image.rgba);
    finishAudioCamera({ ...state.result, width: target.width, height: target.height, data: rgba, palette: paletteFromRgba(rgba) });
    return;
  }
  const passActive = sharedPassActive();
  const target = captureDimensions();
  const existingPolicy = evaluateSharedCanvasPolicy({
    width: target.width,
    height: target.height,
    colorCount: sharedImageTarget ? sharedImageColorCount : (Number(state.colorDepth) || 16)
  }, { passActive });
  if (!existingPolicy.supported) {
    sayToast('共通キャンバスは最大256px・32色です。キャンバス設定を確認してください');
    return;
  }
  const maxColors = passActive ? 32 : 16;
  const sourceFrame = state.result;
  let prepared;
  try {
    prepared = prepareSharedCanvasImage({ width: sourceFrame.width, height: sourceFrame.height, rgba: new Uint8Array(sourceFrame.data) }, {
      passActive, width: target.width, height: target.height, maxColors
    });
  } catch {
    sayToast('共通キャンバスの範囲を確認できないため、画像を保存しませんでした');
    return;
  }
  if (!prepared.policy.supported || prepared.image.width !== target.width || prepared.image.height !== target.height) {
    sayToast('共通キャンバスは最大256px・32色です。撮影画像は保存データに反映しませんでした');
    return;
  }
  captureInFlight = true;
  setRegionMergeBusy(true);
  const cameraToken = cameraSequence;
  try {
    await cameraPxd.startNewCaptureProject();
    if (cameraToken !== cameraSequence || state.mode !== 'live') return;
    invalidateCaptureDownload();
    const { sourceData: _rawSource, ...captureBase } = sourceFrame;
    const frozen = { ...captureBase, width: prepared.image.width, height: prepared.image.height, data: new Uint8ClampedArray(prepared.image.rgba), palette: (sourceFrame.palette || []).slice(0, maxColors) };
    gif.pending = null;
    invalidatePreview();
    cameraSequence++;
    stopTracks();
    state.result = frozen;
    sharedImageTarget = { width: frozen.width, height: frozen.height };
    sharedImageColorCount = prepared.colorCount;
    sharedImageEdited = true;
    sharedProjectBound = true;
    setMode('captured');
    updateSharedCaptureControls();
    cameraPxd.markDirty();
    drawCompleted(frozen);
    say('PNGを準備しています…', { visible: true });
    void prepareCaptureDownload(frozen);
    await cameraPxd.save();
  } catch (error) {
    sayToast(error instanceof Error ? error.message : '新しいプロジェクトに保存できませんでした');
  } finally {
    captureInFlight = false;
    setRegionMergeBusy(false);
  }
}

function finishAudioCamera(frozen) {
  const { sourceData: _rawSource, ...finalFrame } = frozen;
  try {
    if (regionMergeSession) endRegionMerge({ restore: false, resume: false });
    const returnUrl = completeAudioCamera(audioCameraRequest, finalFrame);
    audioFrozenFrame = finalFrame;
    invalidatePreview();
    cameraSequence++;
    stopTracks();
    location.assign(returnUrl);
  } catch (error) {
    audioFrozenFrame = finalFrame;
    invalidatePreview();
    cameraSequence++;
    stopTracks();
    state.result = finalFrame;
    setMode('captured');
    fitPreview(finalFrame);
    $('#postCamera').hidden = true;
    $('#resultControls').hidden = true;
    info.textContent = '音楽へ画像を戻せませんでした。中央のボタンで再試行できます。';
    say(error instanceof Error ? error.message : '音楽へ画像を戻せませんでした。', { visible: true });
  }
}

function refreshObjects() {
  if (state.mode !== 'live' || regionMergeSession) return;
  if (performance.now() - trayClosedAt < 600) return; // that tap only folded the tray
  // feedback without covering the picture: a short ring around the frame, a tick and a toast
  const picksColours = !state.customLook && (['8', '16'].includes(state.colorDepth) || (['2', '4'].includes(state.colorDepth) && state.paletteMode === 'source'));
  if (!picksColours) { sayToast('この配色は固定です'); return; }
  resetLensPalette(); // PiXiEELENS keeps its palette; a tap picks the colours again from the current view
  setPaletteEditing(-1);
  paletteEpoch++;
  root.dataset.paletteEpoch = String(paletteEpoch);
  captureFrame.classList.remove('lc-repick');
  requestAnimationFrame(() => captureFrame.classList.add('lc-repick'));
  window.setTimeout(() => captureFrame.classList.remove('lc-repick'), 600);
  navigator.vibrate?.(8);
  sayToast('今の景色から色を選び直しました');
}

async function retake() {
  imageSelectionSequence++;
  if (captureInFlight) return;
  if (regionMergeSession) endRegionMerge({ restore: true, resume: false });
  if (state.mode === 'captured' && sharedImageEdited) {
    try { await cameraPxd.save(); }
    catch (error) { sayToast(error instanceof Error ? error.message : '写真を保存できませんでした'); return; }
  }
  gif.pending = null;
  invalidateCaptureDownload();
  sharedImageTarget = null;
  sharedImageColorCount = 16;
  sharedImageEdited = false;
  sharedProjectBound = false;
  state.result = null;
  view.width = 1;
  view.height = 1;
  if (importedSource) {
    lastImportedFrameAt = 0;
    previewSessionStarted = performance.now();
    previewCounter = 0;
    clearPreview();
    setMode('live');
    updateSharedCaptureControls();
    say('画像をプレビューしています…');
    if (!workerUnavailable) loop.start();
  } else {
    say('カメラを開き直しています…');
    void startCamera();
  }
}

async function prepareCaptureDownload(frozen) {
  const generation = downloadGeneration;
  try {
    // Export the completed frame at an integer scale; preview work stays at its
    // original dot resolution, and capture never requests a different frame.
    const { blob, width, height } = await encodeCameraPng(frozen);
    if (generation !== downloadGeneration || state.mode !== 'captured' || state.result !== frozen) return;
    downloadBlob = blob;
    downloadUrl = URL.createObjectURL(blob);
    const link = $('#savePng');
    link.href = downloadUrl;
    link.download = `pixieed-pixel-camera-${width}x${height}.png`;
    $('#saveLabel').textContent = '画像を保存（PNG）';
    updateSaveLinkState();
    sayToast('撮影しました。PNGを保存できます。');
    if (!audioCameraRequest) resultView.show({ title: '撮影できました', preview: view, controls: $('#resultControls') });
    focusVisible('#savePng');
  } catch (error) {
    if (generation !== downloadGeneration || state.mode !== 'captured' || state.result !== frozen) return;
    updateSaveLinkState();
    info.textContent = 'PNGを準備できませんでした。撮り直してもう一度お試しください。';
    say(error instanceof Error ? error.message : 'PNGを保存できませんでした。', { visible: true });
  }
}

const CAMERA_KEYS = Object.keys(CAMERA_SETTING_DEFAULTS);
// Look presets: one tap sets colour depth + palette the way PiXiEELENS names them
const LOOKS = {
  gb: { colorDepth: '4', paletteMode: 'gameboy' },
  mono: { colorDepth: '2', paletteMode: 'gameboy' },
  gray: { colorDepth: 'gray' },
  c8: { colorDepth: '8', paletteMode: 'gameboy' },
  c16: { colorDepth: '16', paletteMode: 'gameboy' },
  photo: { colorDepth: '16', paletteMode: 'source' }
};
function currentLook() {
  if (state.customLook) return `my-${state.customLook}`;
  if (state.colorDepth === '16') return state.paletteMode === 'source' ? 'photo' : 'c16';
  return Object.keys(LOOKS).find((key) => LOOKS[key].colorDepth === state.colorDepth) ?? 'gb';
}
function applyChange({ restart = false } = {}) {
  if (regionMergeSession) endRegionMerge({ restore: true });
  syncLens();
  syncControls();
  if (restart) restartPreview({ preserveCompleted: true });
  fitPreview(state.result);
  updateSizeSummary();
  updateSharedCaptureControls();
}
function selectLook(button) {
  if (!button || state.mode === 'captured' || audioCameraRequest) return;
  const mine = myPalettes.find((p) => `my-${p.id}` === button.dataset.look);
  setPaletteEditing(-1);
  if (mine) {
    // a saved palette: exactly those colours, never re-picked from the view
    Object.assign(state, { colorDepth: String(mine.colors.length), paletteMode: 'source', customLook: mine.id });
    applyChange();
    setLensPalette(mine.colors.map(([r, g, b]) => [r, g, b]));
  } else {
    Object.assign(state, LOOKS[button.dataset.look], { customLook: null });
    applyChange();
  }
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  navigator.vibrate?.(8);
  sayToast(button.textContent.trim());
}
$('#looks').addEventListener('click', (event) => selectLook(event.target.closest('[data-look]')));
// Swipe left / right on the picture steps through the looks (wraps around).
function stepLook(delta) {
  const buttons = [...document.querySelectorAll('#looks [data-look]')];
  const index = buttons.findIndex((button) => button.dataset.look === currentLook());
  selectLook(buttons[(index + delta + buttons.length) % buttons.length]);
}
// ---------- Always-visible camera rail with focused setting choices ----------
const tray = $('#tray'); const toolbar = $('#toolbar');
const settingsPanel = $('#cameraSettingsPanel');
let openTool = null; let trayClosedAt = 0;
const CONTEXT_LABELS = { look: '色', dither: 'ディザ', pixels: 'ドット', aspect: '比率', tone: '色味', zoom: 'ズーム', merge: '色統合' };
const toolbarContextHead = $('#toolbarContextHead');
const toolbarContextLabel = $('#toolbarContextLabel');
const toolbarMore = $('#toolbarContextMore');
function contextOptionButtons(tool) {
  if (tool === 'look') return [...document.querySelectorAll('#looks [data-look]')];
  if (tool === 'merge') return [...document.querySelectorAll('#regionMergePalette [data-target-index]')];
  const panel = tray.querySelector(`[data-panel="${tool}"]`);
  if (tool === 'zoom') return [...(panel?.querySelectorAll('button[data-zoom]') ?? [])];
  if (tool === 'tone') return [...(panel?.querySelectorAll('#toneChips [data-value]') ?? [])];
  return [...(panel?.querySelectorAll('[data-value]') ?? [])];
}
function syncContextOptions(tool = (regionMergeSession ? 'merge' : openTool)) {
  const buttons = contextOptionButtons(tool);
  const visibleCount = window.innerWidth <= 359 ? 3 : 4;
  const expanded = root.dataset.settingsExpanded === 'true';
  let selected = buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true' || button.getAttribute('aria-pressed') === 'true');
  if (selected < 0 && tool === 'merge' && root.dataset.regionMergeTargetIndex === '') selected = buttons.findIndex((button) => button.dataset.recommended === 'true');
  buttons.forEach((button, index) => { button.hidden = !expanded && index >= visibleCount && index !== selected; });
  toolbarMore.hidden = !tool || buttons.length <= visibleCount;
  const editingPalette = tool === 'look' && typeof editIndex !== 'undefined' && editIndex >= 0;
  toolbarMore.textContent = editingPalette ? '完了' : expanded ? '基本' : 'その他';
  toolbarMore.setAttribute('aria-label', editingPalette ? '色編集を完了' : expanded ? '基本の選択肢へ戻る' : 'その他の選択肢を表示');
  toolbarMore.setAttribute('aria-expanded', String(expanded));
}
function closeCameraSettings() {
  if (openTool) trayClosedAt = performance.now();
  openTray(null);
}
function openTray(tool) {
  if (openTool && !tool) trayClosedAt = performance.now();
  openTool = tool;
  root.dataset.tray = tool ?? '';
  root.dataset.settingsContext = tool ?? '';
  root.dataset.settingsExpanded = 'false';
  if (tool !== 'look') setPaletteEditing(-1);
  for (const panel of tray.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tool;
  for (const button of toolbar.querySelectorAll('[data-tool]')) button.setAttribute('aria-expanded', String(button.dataset.tool === tool));
  toolbarContextHead.hidden = !tool;
  toolbarContextLabel.textContent = CONTEXT_LABELS[tool] ?? '';
  $('#toolbarContextBack').textContent = tool ? `← ${CONTEXT_LABELS[tool]}` : '←';
  $('#toolbarContextBack').setAttribute('aria-label', tool ? `${CONTEXT_LABELS[tool]}の設定を閉じる` : '設定項目へ戻る');
  toolbarMore.hidden = !tool;
  syncContextOptions(tool);
  const selected = tool && tray.querySelector(`[data-panel="${tool}"] [aria-checked="true"]`);
  if (selected && !selected.hidden) requestAnimationFrame(() => selected.scrollIntoView({ inline: 'center', block: 'nearest' }));
  requestAnimationFrame(() => { if (state.result) fitPreview(state.result); });
  if (tool === 'zoom') requestAnimationFrame(() => syncZoomStops(true));
}
$('#toolbarContextBack').addEventListener('click', () => {
  if (regionMergeSession) { returnToLiveAfterRegionMerge(); return; }
  openTray(null);
  $('#toolbarHome [data-tool]')?.focus({ preventScroll: true });
});
toolbarMore.addEventListener('click', () => {
  if (!regionMergeSession && openTool === 'look' && typeof editIndex !== 'undefined' && editIndex >= 0) { setPaletteEditing(-1); return; }
  if (regionMergeSession) {
    root.dataset.settingsExpanded = String(root.dataset.settingsExpanded !== 'true');
    syncContextOptions('merge');
    return;
  }
  root.dataset.settingsExpanded = String(root.dataset.settingsExpanded !== 'true');
  syncContextOptions(openTool);
});
window.addEventListener('resize', () => syncContextOptions());
const NO_DITHER_DEPTHS = new Set(['full', 'gray']);
const TONES = [['brightness', '明るさ'], ['exposure', '露出'], ['contrast', 'コントラスト'], ['saturation', '彩度'], ['shadows', '影'], ['whiteBalance', '色温度']];
let toneKey = 'contrast';
const SHORT_LABEL = { net8: '8×8', net4: '4×4', net2: '2×2', checker: '市松', lines: '横線', diagonal: '斜線', halftone: '網点', grain: '砂目', atkinson: 'ATK', fs: '拡散' };
const SWATCH_TONE = { net8: 72, net4: 72, net2: 72, checker: 128, lines: 64, diagonal: 64, halftone: 70, grain: 90 };
let swatchColors = [[32, 56, 16], [224, 248, 208]];

function chip(value, label, { swatch = '', cls = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button'; button.setAttribute('role', 'radio'); button.dataset.value = value;
  button.innerHTML = `${swatch ? `<i class="lc-chip-sw ${cls}" aria-hidden="true"></i>` : ''}<span></span>`;
  button.querySelector('span').textContent = label;
  return button;
}

// A dither swatch shows one characteristic step 1:1 in the current palette's darkest and lightest colours;
// error diffusion is shown by diffusing a flat 35% tone.
function patternSwatch(pattern) {
  const size = 16; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d'); const image = context.createImageData(size, size);
  const bits = new Uint8Array(size * size);
  if (pattern.kind === 'ordered') {
    const step = pattern.levels[pattern.levelForTone[SWATCH_TONE[pattern.id] ?? 90]];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) bits[y * size + x] = step[((y & pattern.mask) << pattern.shift) | (x & pattern.mask)];
  } else {
    const buf = new Float32Array(size * size).fill(0.35);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = y * size + x; const on = buf[p] >= 0.5 ? 1 : 0; bits[p] = on; const e = buf[p] - on;
      for (const [dx, dy, w] of pattern.kernel) { const xx = x + dx; const yy = y + dy; if (xx >= 0 && xx < size && yy < size) buf[yy * size + xx] += e * w; }
    }
  }
  const [dark, light] = swatchColors;
  for (let p = 0; p < size * size; p++) image.data.set([...(bits[p] ? light : dark), 255], p * 4);
  context.putImageData(image, 0, 0);
  return `url(${canvas.toDataURL()})`;
}

// dither row: オフ + every pattern
const ditherPanel = $('#ditherKinds');
ditherPanel.appendChild(chip('none', 'オフ', { swatch: true, cls: 'is-off' }));
for (const pattern of DITHER_PATTERNS) ditherPanel.appendChild(chip(pattern.id, pattern.label, { swatch: true, cls: 'is-pattern' }));
function paintSwatches() {
  for (const button of ditherPanel.querySelectorAll('[data-value]')) {
    const pattern = DITHER_PATTERNS.find((p) => p.id === button.dataset.value);
    if (pattern) button.querySelector('.lc-chip-sw').style.setProperty('--swatch', patternSwatch(pattern));
  }
}
/** Colour the dither swatches with the look's own palette (called when the palette changes). */
function tintSwatches(palette) {
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sorted = (palette?.length ? [...palette] : []).sort((a, b) => lum(a) - lum(b));
  swatchColors = sorted.length >= 2 ? [sorted[0], sorted.at(-1)] : [[28, 30, 34], [236, 238, 240]];
  paintSwatches(); syncToolbar();
}
// dot-count and framing rows
const pixelsPanel = $('#pixelsPanel');
for (const size of sharedOutputSizes()) pixelsPanel.appendChild(chip(String(size), `${size}`));
const aspectPanel = $('#aspectPanel');
for (const ratio of sharedFrameRatios()) { const button = chip(ratio.value, ratio.label, { swatch: true, cls: 'is-frame' }); button.dataset.ratio = ratio.value; aspectPanel.appendChild(button); }
// tone row: pick a setting, then the slider below adjusts it
const toneChips = $('#toneChips');
for (const [key, label] of TONES) toneChips.appendChild(chip(key, label));
toneChips.appendChild(chip('miniature', 'ジオラマ'));
const toneSlider = $('#toneSlider'); const toneValue = $('#toneValue');

function currentPatternId() { return state.gradientMode === 'dither' ? state.ditherPattern : 'none'; }
function syncZoomFace() {
  const zoomFace = toolbar.querySelector('[data-tool="zoom"]');
  zoomFace.querySelector('b').textContent = formatZoom(state.zoom);
  zoomFace.title = `ズーム ${formatZoom(state.zoom)}`;
  zoomFace.setAttribute('aria-label', `ズーム ${formatZoom(state.zoom)}（タップで倍率を選ぶ）`);
}
function syncToolbar() {
  const lookButton = document.querySelector(`#looks [data-look="${currentLook()}"]`);
  const face = (tool) => toolbar.querySelector(`[data-tool="${tool}"]`);
  face('look').querySelector('.lc-tool-sw').setAttribute('style', lookButton?.querySelector('.lc-sw')?.getAttribute('style') ?? '');
  face('look').querySelector('.lc-tool-sw').className = `lc-tool-sw lc-sw ${(lookButton?.querySelector('.lc-sw')?.className ?? '').replace(/\blc-sw\b/, '').trim()}`;
  const lookFace = face('look');
  const fullLookLabel = audioCameraRequest ? '写真16色' : (lookButton?.textContent.trim() ?? '色');
  const compactLookLabel = fullLookLabel.startsWith('写真') ? '写真' : fullLookLabel;
  lookFace.querySelector('b').textContent = compactLookLabel;
  lookFace.title = `色：${fullLookLabel}`;
  lookFace.setAttribute('aria-label', `色：${fullLookLabel}（タップで色を選ぶ）`);
  const available = !NO_DITHER_DEPTHS.has(state.colorDepth);
  const pattern = available && state.gradientMode === 'dither' ? DITHER_PATTERNS.find((p) => p.id === state.ditherPattern) : null;
  const dither = face('dither');
  dither.dataset.state = !available ? 'na' : pattern ? 'on' : 'off';
  dither.querySelector('.lc-tool-sw').style.setProperty('--swatch', pattern ? patternSwatch(pattern) : 'none');
  const fullDitherLabel = !available ? 'ディザなし' : pattern ? pattern.label : 'ディザ OFF';
  dither.querySelector('b').textContent = !available ? 'なし' : pattern ? (SHORT_LABEL[pattern.id] ?? pattern.label) : 'OFF';
  dither.title = `ディザ：${fullDitherLabel}`;
  dither.setAttribute('aria-label', !available ? 'この色ではディザを使いません' : pattern ? `ディザ：${pattern.label}（タップで模様を選ぶ）` : 'ディザ：OFF（タップでオンにする）');
  const pixelFace = face('pixels');
  const fullPixelLabel = audioCameraRequest ? `${audioCameraRequest.width} × ${audioCameraRequest.height} px` : sharedImageTarget ? `${sharedImageTarget.width} × ${sharedImageTarget.height} px` : `${state.size} px`;
  pixelFace.querySelector('b').textContent = audioCameraRequest ? `${audioCameraRequest.width}×${audioCameraRequest.height}` : sharedImageTarget ? `${sharedImageTarget.width}×${sharedImageTarget.height}` : `${state.size}`;
  pixelFace.title = `ドット数：${fullPixelLabel}`;
  pixelFace.setAttribute('aria-label', `ドット数：${fullPixelLabel}（タップで選ぶ）`);
  const ratio = FRAME_RATIOS.find((r) => r.value === state.ratio);
  const aspectFace = face('aspect');
  const fullAspectLabel = audioCameraRequest ? `${audioCameraRequest.width}:16` : sharedImageTarget ? `${sharedImageTarget.width}:${sharedImageTarget.height}` : (ratio?.label ?? '');
  aspectFace.querySelector('b').textContent = fullAspectLabel;
  aspectFace.title = `比率：${fullAspectLabel}`;
  aspectFace.setAttribute('aria-label', `比率：${fullAspectLabel}（タップで選ぶ）`);
  face('aspect').dataset.ratio = sharedImageTarget ? `${sharedImageTarget.width}:${sharedImageTarget.height}` : state.ratio;
  const toneChanged = TONES.some(([key]) => state.camera[key] !== CAMERA_SETTING_DEFAULTS[key]);
  const toneFace = face('tone');
  toneFace.querySelector('b').textContent = toneChanged || state.miniature ? '設定中' : '調整';
  toneFace.title = state.miniature ? (toneChanged ? '色味：調整中・ジオラマ ON' : '色味：ジオラマ ON') : toneChanged ? '色味：調整中' : '色味：調整';
  toneFace.setAttribute('aria-label', `${toneFace.title}（タップで項目を選ぶ）`);
  toneFace.dataset.changed = String(toneChanged || state.miniature);
  syncZoomFace();
  // selected chips
  const mark = (panel, value) => { for (const b of panel.querySelectorAll('[data-value]')) b.setAttribute('aria-checked', String(b.dataset.value === value)); };
  mark(ditherPanel, currentPatternId()); mark(pixelsPanel, audioCameraRequest || sharedImageTarget ? '' : String(state.size)); mark(aspectPanel, state.ratio); mark(toneChips, toneKey);
  const [, toneLabel] = TONES.find(([key]) => key === toneKey) ?? ['miniature', 'ジオラマ'];
  $('#toneSliderPanel').hidden = toneKey === 'miniature';
  $('#miniaturePanel').hidden = toneKey !== 'miniature';
  $('#miniatureToggle').setAttribute('aria-pressed', String(state.miniature));
  $('#miniatureToggle').querySelector('span').textContent = state.miniature ? 'ON' : 'OFF';
  toneSlider.value = String(state.camera[toneKey] ?? 0);
  toneSlider.setAttribute('aria-label', toneLabel);
  const v = Number(toneSlider.value); toneValue.textContent = v > 0 ? `+${v}` : String(v);
  toneSlider.style.setProperty('--fill', `${(v + 100) / 2}%`);
  $('#toneReset').disabled = !toneChanged;
}
function syncControls() {
  const look = currentLook();
  for (const button of document.querySelectorAll('#looks [data-look]')) button.setAttribute('aria-checked', String(button.dataset.look === look));
  if (NO_DITHER_DEPTHS.has(state.colorDepth) && openTool === 'dither') syncContextOptions('dither');
  syncToolbar();
}

function lockAudioCameraControls() {
  if (!audioCameraRequest) return;
  root.dataset.audioCameraHandoff = 'true';
  for (const button of document.querySelectorAll('#looks [data-look], #ditherPanel [data-value], #pixelsPanel [data-value], #aspectPanel [data-value], #toolbar [data-tool="look"], #toolbar [data-tool="dither"], #toolbar [data-tool="pixels"], #toolbar [data-tool="aspect"]')) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
  }
  $('#postCamera').hidden = true;
}

toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tool]'); if (!button || state.mode === 'captured' || regionMergeSession) return;
  const tool = button.dataset.tool;
  if (audioCameraRequest && ['look', 'dither', 'pixels', 'aspect'].includes(tool)) return;
  navigator.vibrate?.(6);
  if (tool === 'dither') {
    if (NO_DITHER_DEPTHS.has(state.colorDepth)) { sayToast('この色ではディザを使いません'); return; }
    if (state.gradientMode !== 'dither') {
      state.gradientMode = 'dither'; applyChange(); openTray('dither');
      sayToast(`ディザ ON：${DITHER_PATTERNS.find((pattern) => pattern.id === state.ditherPattern).label}`);
      return;
    }
  }
  openTray(tool);
});
ditherPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-value]'); if (!button || state.mode === 'captured' || audioCameraRequest) return;
  navigator.vibrate?.(6);
  if (button.dataset.value === 'none') { state.gradientMode = 'none'; applyChange(); sayToast('ディザ OFF'); return; }
  state.gradientMode = 'dither'; state.ditherPattern = button.dataset.value; applyChange();
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});
pixelsPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-value]'); if (!button || state.mode === 'captured' || audioCameraRequest) return;
  state.size = Number(button.dataset.value); navigator.vibrate?.(6); applyChange({ restart: true });
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});
aspectPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-value]'); if (!button || state.mode === 'captured' || audioCameraRequest) return;
  state.ratio = button.dataset.value; navigator.vibrate?.(6); applyChange({ restart: true });
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});
toneChips.addEventListener('click', (event) => {
  const button = event.target.closest('[data-value]'); if (!button) return;
  toneKey = button.dataset.value; navigator.vibrate?.(4); syncToolbar();
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
});
toneSlider.addEventListener('input', () => {
  if (state.mode === 'captured' || toneKey === 'miniature') return;
  const value = Number(toneSlider.value);
  // a light detent at 0 so the standard look is easy to find again
  const snapped = Math.abs(value) <= 3 ? 0 : value;
  if (snapped === 0 && state.camera[toneKey] !== 0) navigator.vibrate?.(5);
  state.camera[toneKey] = snapped; applyChange();
});
$('#toneReset').addEventListener('click', () => { for (const [key] of TONES) state.camera[key] = CAMERA_SETTING_DEFAULTS[key]; navigator.vibrate?.(8); applyChange(); sayToast('色調整を元に戻しました'); });
$('#miniatureToggle').addEventListener('click', () => {
  if (state.mode !== 'live' || gif.recording || captureInFlight || regionMergeSession) return;
  state.miniature = !state.miniature;
  root.dataset.miniature = String(state.miniature);
  navigator.vibrate?.(6);
  applyChange({ restart: true });
});
document.addEventListener('pointerdown', (event) => {
  if (!settingsPanel.contains(event.target) && stage.contains(event.target) && openTool) closeCameraSettings();
}, true);
// ---------- Palette: tap a colour of the current look to change it by hand ----------
// The 色 row shows the look's palette as dots. Tapping one swaps the looks row for a hue / saturation /
// lightness slider (the same pick-then-slide control as 調整). Edits can be undone, or saved as a
// マイパレット look (up to three, kept on this device).
const PALETTE_KEY = 'pixieed:camera-palettes:v1';
const MAX_MY_PALETTES = 3;
let myPalettes = [];
try { myPalettes = JSON.parse(localStorage.getItem(PALETTE_KEY) || '[]').filter((p) => Array.isArray(p?.colors) && p.colors.length >= 2 && p.colors.length <= 16); } catch { myPalettes = []; }
function storeMyPalettes() { try { localStorage.setItem(PALETTE_KEY, JSON.stringify(myPalettes)); } catch { /* private mode: kept for this visit only */ } }
const EDITABLE_DEPTHS = new Set(['2', '4', '8', '16', 'gray']);
const CHANNELS = [['h', '色相', 360], ['s', '彩度', 100], ['l', '明るさ', 100]];
let editIndex = -1; let editChannel = 'h'; let shownPalette = [];
const paletteDots = $('#paletteDots'); const paletteEditor = $('#paletteEditor'); const editChips = $('#editChips');
const editSlider = $('#editSlider'); const editValue = $('#editValue');
for (const [key, label] of CHANNELS) editChips.appendChild(chip(key, label));

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min; const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, sat * 100, l * 100];
}
function hslToRgb([h, sat, l]) {
  sat /= 100; l /= 100; const k = (n) => (n + h / 30) % 12; const a = sat * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round);
}
const cssColor = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;
function lookSwatchVars(colors) {
  const pick = (t) => colors[Math.min(colors.length - 1, Math.round(t * (colors.length - 1)))];
  return ['a', 'b', 'c', 'd'].map((k, i) => `--${k}:${cssColor(pick(i / 3))}`).join(';');
}
function renderMyPaletteChips() {
  const looks = $('#looks');
  for (const old of looks.querySelectorAll('[data-look^="my-"]')) old.remove();
  myPalettes.forEach((palette, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('role', 'radio'); button.dataset.look = `my-${palette.id}`;
    button.innerHTML = `<i class="lc-sw" style="${lookSwatchVars(palette.colors)}"></i><span>マイ${index + 1}</span>`;
    looks.appendChild(button);
  });
}
function renderPaletteStrip(palette = lensPalette()) {
  shownPalette = palette ?? [];
  const editable = (EDITABLE_DEPTHS.has(state.colorDepth) || Boolean(state.customLook)) && shownPalette.length > 0;
  // the strip keeps its place even when this look has no palette to edit, so the rows below never jump
  $('#paletteStrip').hidden = false;
  $('#paletteStrip').dataset.reserved = String(!editable);
  if (!editable) { setPaletteEditing(-1); paletteDots.replaceChildren(); return; }
  if (paletteDots.children.length !== shownPalette.length) {
    paletteDots.replaceChildren(...shownPalette.map((_, index) => {
      const dot = document.createElement('button'); dot.type = 'button'; dot.dataset.index = String(index);
      dot.setAttribute('aria-label', `${index + 1}番目の色を変える`); return dot;
    }));
  }
  paletteDots.dataset.count = String(shownPalette.length);
  requestAnimationFrame(() => { paletteDots.dataset.overflow = String(paletteDots.scrollWidth > paletteDots.clientWidth + 1); });
  shownPalette.forEach((color, index) => {
    const dot = paletteDots.children[index];
    dot.style.setProperty('--palette-dot-color', cssColor(color));
    dot.setAttribute('aria-pressed', String(index === editIndex));
  });
  const edited = lensPaletteEdited() && !(state.customLook && !paletteDiffersFromSaved());
  $('#paletteReset').disabled = !edited;
  $('#paletteSave').hidden = state.colorDepth === 'gray';
  $('#paletteSave').disabled = shownPalette.length < 2 || !lensPaletteEdited() || (state.customLook && !paletteDiffersFromSaved());
  $('#paletteDelete').hidden = !state.customLook;
  $('#paletteDone').hidden = editIndex < 0;
  if (editIndex >= 0) syncEditSlider();
}
function paletteDiffersFromSaved() {
  const saved = myPalettes.find((p) => p.id === state.customLook);
  return !saved || saved.colors.some((c, i) => c.some((v, k) => v !== shownPalette[i]?.[k]));
}
function setPaletteEditing(index) {
  editIndex = index;
  root.dataset.editing = String(index >= 0);
  if (openTool === 'look') syncContextOptions('look');
  paletteEditor.hidden = index < 0;
  for (const dot of paletteDots.children) dot.setAttribute('aria-pressed', String(Number(dot.dataset.index) === index));
  $('#paletteDone').hidden = index < 0;
  if (index >= 0) { syncEditSlider(); paletteDots.children[index]?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }
}
function syncEditSlider() {
  const color = shownPalette[editIndex]; if (!color) return;
  const hsl = rgbToHsl(color); const [key, label, max] = CHANNELS.find(([k]) => k === editChannel); const channel = CHANNELS.indexOf(CHANNELS.find(([k]) => k === editChannel));
  for (const b of editChips.querySelectorAll('[data-value]')) b.setAttribute('aria-checked', String(b.dataset.value === key));
  editSlider.max = String(max); editSlider.value = String(Math.round(hsl[channel]));
  editSlider.setAttribute('aria-label', `${editIndex + 1}番目の色の${label}`);
  editValue.textContent = key === 'h' ? `${editSlider.value}°` : `${editSlider.value}%`;
  // the track previews what the slider does
  const stops = Array.from({ length: 7 }, (_, i) => { const v = [...hsl]; v[channel] = (max * i) / 6; return cssColor(hslToRgb(v)); });
  editSlider.style.setProperty('--track', `linear-gradient(90deg, ${stops.join(', ')})`);
  $('#editColor').style.background = cssColor(color);
}
paletteDots.addEventListener('scroll', () => { paletteDots.dataset.scrolled = String(paletteDots.scrollLeft > 2); }, { passive: true });
paletteDots.addEventListener('click', (event) => {
  const dot = event.target.closest('[data-index]'); if (!dot || state.mode === 'captured') return;
  const index = Number(dot.dataset.index);
  navigator.vibrate?.(5);
  setPaletteEditing(editIndex === index ? -1 : index);
});
editChips.addEventListener('click', (event) => {
  const button = event.target.closest('[data-value]'); if (!button) return;
  editChannel = button.dataset.value; navigator.vibrate?.(4); syncEditSlider();
});
editSlider.addEventListener('input', () => {
  const color = shownPalette[editIndex]; if (!color || state.mode === 'captured') return;
  const hsl = rgbToHsl(color); const channel = CHANNELS.findIndex(([k]) => k === editChannel);
  hsl[channel] = Number(editSlider.value);
  // keep hue meaningful when a grey is pushed into colour
  if (editChannel === 'h' && hsl[1] < 1) hsl[1] = 40;
  const rgb = hslToRgb(hsl);
  if (setLensPaletteColor(editIndex, rgb)) { shownPalette = shownPalette.map((c, i) => (i === editIndex ? rgb : c)); renderPaletteStrip(shownPalette); }
});
$('#paletteReset').addEventListener('click', () => { resetLensPaletteEdits(); navigator.vibrate?.(8); renderPaletteStrip(); sayToast('元の色に戻しました'); });
$('#paletteDone').addEventListener('click', () => setPaletteEditing(-1));
$('#paletteSave').addEventListener('click', () => {
  const colors = lensPalette(); if (colors.length < 2 || colors.length > 16) return;
  const palette = { id: Date.now().toString(36), colors };
  myPalettes = [...myPalettes, palette].slice(-MAX_MY_PALETTES);
  storeMyPalettes(); renderMyPaletteChips();
  setPaletteEditing(-1);
  selectLook($(`#looks [data-look="my-${palette.id}"]`));
  sayToast(`マイ${myPalettes.length}に保存しました`);
});
$('#paletteDelete').addEventListener('click', () => {
  const index = myPalettes.findIndex((p) => p.id === state.customLook); if (index < 0) return;
  myPalettes.splice(index, 1); storeMyPalettes(); renderMyPaletteChips();
  selectLook($('#looks [data-look="gb"]'));
  sayToast('マイパレットを削除しました');
});
renderMyPaletteChips();
lockAudioCameraControls();
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (regionMergeSession) { event.preventDefault(); returnToLiveAfterRegionMerge(); return; }
  if (openTool) { closeCameraSettings(); $('#toolbarHome [data-tool]')?.focus({ preventScroll: true }); }
});
paintSwatches();
syncControls();

// ---------- Pinch-first zoom ----------
const zoomHud = $('#zoomHud'); let hudTimer = 0;
function setupZoomForTrack(track) {
  zoomInfo = zoomController.attach(track);
  const snapshot = zoomController.setZoom(Math.min(zoomInfo.max, Math.max(zoomInfo.min, state.zoom)));
  state.zoom = snapshot.requested;
  zoomInfo = snapshot.range;
  renderZoomStops();
}
function renderZoomStops() {
  const box = $('#zoomStops'); box.replaceChildren();
  for (const stop of zoomStops(zoomInfo)) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.zoom = String(stop); button.textContent = formatZoom(stop);
    button.setAttribute('aria-label', `ズーム ${formatZoom(stop)}`);
    box.appendChild(button);
  }
  syncZoomStops();
}
function syncZoomStops(revealSelected = false) {
  const buttons = [...document.querySelectorAll('#zoomStops button')];
  let nearest = null; for (const b of buttons) if (!nearest || Math.abs(Number(b.dataset.zoom) - state.zoom) < Math.abs(Number(nearest.dataset.zoom) - state.zoom)) nearest = b;
  for (const b of buttons) {
    const on = b === nearest;
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on && Math.abs(state.zoom - Number(b.dataset.zoom)) > 0.05 ? formatZoom(state.zoom) : formatZoom(Number(b.dataset.zoom));
  }
  syncZoomFace();
  if (revealSelected && nearest) {
    const box = $('#zoomStops');
    const boxRect = box.getBoundingClientRect();
    const buttonRect = nearest.getBoundingClientRect();
    box.scrollLeft += buttonRect.left + buttonRect.width / 2 - (boxRect.left + box.clientWidth / 2);
  }
}
function syncZoomHud() {
  const value = $('#zoomHudValue');
  const fill = $('#zoomHudFill');
  const hint = $('#zoomHudHint');
  if (!value || !fill || !hint) return;
  value.textContent = formatZoom(state.zoom);
  const logRange = Math.log(zoomInfo.max / zoomInfo.min);
  fill.style.width = `${logRange > 0 ? (100 * Math.log(state.zoom / zoomInfo.min)) / logRange : 0}%`;
  const parts = zoomController.snapshot();
  const cameraZoomed = Math.abs(parts.hardware - 1) > 0.01;
  hint.textContent = cameraZoomed && parts.digital > 1.01
    ? 'カメラ＋拡大' : cameraZoomed ? 'カメラズーム' : '拡大ズーム';
}
function setZoom(value, { gesture = '', silent = false } = {}) {
  if (state.mode === 'captured') return;
  if (focusRequestInFlight) {
    sayToast('ピント要求中はズームを調整できません');
    return;
  }
  if (regionMergeSession) endRegionMerge({ restore: true });
  const previous = state.zoom;
  state.zoom = Math.min(zoomInfo.max, Math.max(zoomInfo.min, value));
  // Gentle detents let a pinch land on the preset magnifications.
  if (gesture === 'pinch') for (const stop of zoomStops(zoomInfo)) if (Math.abs(state.zoom - stop) < 0.04 * stop) { if (Math.abs(previous - stop) >= 0.04 * stop) navigator.vibrate?.(6); state.zoom = stop; }
  const snapshot = zoomController.setZoom(state.zoom);
  state.zoom = snapshot.requested;
  zoomInfo = snapshot.range;
  syncZoomStops(true);
  if (silent) return;
  syncZoomHud();
  zoomHud.classList.add('is-on');
  window.clearTimeout(hudTimer);
  hudTimer = window.setTimeout(() => zoomHud.classList.remove('is-on'), gesture === 'pinch' ? 900 : 700);
}
$('#zoomStops').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-zoom]'); if (!button) return;
  navigator.vibrate?.(6);
  setZoom(Number(button.dataset.zoom), { gesture: 'stop' });
});
stage.addEventListener('contextmenu', (event) => event.preventDefault());
attachZoomGestures(stage, {
  get: () => state.zoom,
  set: (value, info) => setZoom(value, info),
  doubleTapEnabled: false,
  onTap: (event) => {
    refreshObjects();
    if (event) void requestCameraFocusAt(event.clientX, event.clientY, { silent: true });
  },
  onLongPress: (event) => {
    if (beginRegionMerge(event.clientX, event.clientY)) focusMergeTarget();
    return true;
  },
  // the picture leans a little with the finger, so a swipe feels attached to it
  onDrag: (dx, dy) => {
    if (state.mode !== 'live' || gif.recording || regionMergeSession) return;
    captureFrame.classList.toggle('is-dragging', Boolean(dx || dy));
    captureFrame.style.translate = dx || dy ? `${Math.max(-40, Math.min(40, dx * 0.18))}px ${Math.max(-40, Math.min(40, dy * 0.18))}px` : '';
  },
  onSwipe: (direction) => {
    if (state.mode !== 'live' || gif.recording || regionMergeSession) return;
    if (direction === 'left') stepLook(1);
    else if (direction === 'right') stepLook(-1);
    else flipCamera();
  }
});
stage.addEventListener('keydown', (event) => {
  if (event.target !== stage) return;
  if (event.key === '+' || event.key === '=') setZoom(state.zoom * 1.25, { gesture: 'key' });
  else if (event.key === '-') setZoom(state.zoom / 1.25, { gesture: 'key' });
  else if (event.key === '0') setZoom(1, { gesture: 'key' });
  else if (event.key.toLowerCase() === 'm' && !event.repeat && !regionMergeSession) {
    event.preventDefault();
    const rect = view.getBoundingClientRect();
    if (beginRegionMerge(rect.left + rect.width / 2, rect.top + rect.height / 2)) focusMergeTarget();
  }
  else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); refreshObjects(); }
});

// Swipe up / down: front and back cameras.
function flipCamera() {
  if (regionMergeSession) endRegionMerge({ restore: true, resume: false });
  if (importedSource) {
    sayToast('カメラを開きます');
    void startCamera({ focus: false });
    return;
  }
  lastFacing = state.facing === 'environment' ? 'user' : 'environment';
  captureFrame.classList.remove('lc-flip');
  requestAnimationFrame(() => captureFrame.classList.add('lc-flip'));
  window.setTimeout(() => captureFrame.classList.remove('lc-flip'), 500);
  navigator.vibrate?.(8);
  sayToast(lastFacing === 'user' ? 'インカメラ' : '外カメラ');
  void startCamera({ focus: false });
}

// ---------- GIF: hold the shutter ----------
const HOLD_MS = 360;
const gif = { recording: false, frames: [], started: 0, lastAt: 0, raf: 0, playTimer: 0, pending: null, maxMs: 10000, fps: 20, maxFrames: 0, sourceWidth: 0, sourceHeight: 0, capturePlan: null };
const gifLimits = () => ({ maxMs: 10000, fps: 20 });
const captureButton = $('#capture');
let holdTimer = 0; let holdFired = false;
let keyboardShutterActive = false; let keyboardHoldTimer = 0; let keyboardHoldFired = false;
function gifProgress() {
  if (!gif.recording) return;
  const elapsed = performance.now() - gif.started;
  const left = Math.max(0, gif.maxMs - elapsed);
  captureButton.style.setProperty('--gif-progress', String(Math.min(1, elapsed / gif.maxMs)));
  $('#gifRecTime').textContent = `${(left / 1000).toFixed(1)}s`;
  if (left <= 0) { finishGif(); return; }
  gif.raf = requestAnimationFrame(gifProgress);
}
function startGif() {
  if (audioCameraRequest || importedSource || state.mode !== 'live' || !state.result) return;
  if (regionMergeSession) { sayToast('色統合中はGIFを撮影できません'); return; }
  Object.assign(gif, gifLimits());
  gif.capturePlan = animatedCapturePlan(state.result.width, state.result.height, { maxMs: gif.maxMs, fps: gif.fps });
  gif.maxFrames = gif.capturePlan.maxFrames;
  gif.sourceWidth = state.result.width; gif.sourceHeight = state.result.height;
  gif.recording = true; gif.frames = []; gif.started = performance.now(); gif.lastAt = 0;
  $('#gifRecTime').textContent = `${(gif.maxMs / 1000).toFixed(1)}s`;
  recordGifFrame(state.result);
  root.dataset.recording = 'true';
  closeCameraSettings();
  $('#gifRec').hidden = false;
  navigator.vibrate?.(15);
  gif.raf = requestAnimationFrame(gifProgress);
}
function recordGifFrame(result) {
  const now = performance.now();
  if (!gif.capturePlan || gif.frames.length >= gif.maxFrames) return;
  if (gif.frames.length && now - gif.lastAt < 1000 / gif.fps) return;
  const first = gif.frames[0];
  if (first && (gif.sourceWidth !== result.width || gif.sourceHeight !== result.height)) return;
  gif.lastAt = now;
  gif.frames.push(downsampleAnimatedFrame(result, gif.capturePlan));
}
function stopGifUi({ keepFrames = false } = {}) {
  gif.recording = false;
  cancelAnimationFrame(gif.raf);
  root.dataset.recording = 'false';
  $('#gifRec').hidden = true;
  captureButton.style.setProperty('--gif-progress', '0');
  if (!keepFrames) {
    gif.frames = [];
    gif.capturePlan = null; gif.maxFrames = 0; gif.sourceWidth = gif.sourceHeight = 0;
  }
}
function finishGif() {
  if (!gif.recording) return;
  stopGifUi({ keepFrames: true });
  const frames = gif.frames; gif.frames = []; frames.fps = gif.fps;
  gif.capturePlan = null; gif.maxFrames = 0; gif.sourceWidth = gif.sourceHeight = 0;
  if (frames.length < 2) { capture(); return; } // too short to move: keep it as a photo
  invalidateCaptureDownload();
  invalidatePreview();
  cameraSequence++;
  stopTracks();
  state.result = frames[frames.length - 1];
  setMode('captured');
  fitPreview(state.result);
  navigator.vibrate?.([10, 40, 10]);
  gif.pending = frames;
  playGif(frames);
  say('GIFを作っています…', { visible: true });
  window.setTimeout(() => void prepareGifDownload(frames), 30);
}
function playGif(frames) {
  stopGifPlayback();
  let index = 0;
  const show = () => { const f = frames[index]; index = (index + 1) % frames.length; viewContext.putImageData(new ImageData(f.data, f.width, f.height), 0, 0); };
  if (view.width !== frames[0].width || view.height !== frames[0].height) { view.width = frames[0].width; view.height = frames[0].height; }
  show();
  gif.playTimer = window.setInterval(show, 1000 / (frames.fps || GIF_FPS));
}
function stopGifPlayback() { if (gif.playTimer) { window.clearInterval(gif.playTimer); gif.playTimer = 0; } }
async function prepareGifDownload(frames) {
  const generation = downloadGeneration;
  gifExportJob?.abort();
  const job = new AbortController(); gifExportJob = job;
  try {
    const fps = frames.fps || GIF_FPS;
    const { bytes, width, height } = await encodeAnimatedGif(frames, { delayMs: 1000 / fps, signal: job.signal });
    if (generation !== downloadGeneration || state.mode !== 'captured' || job !== gifExportJob) return;
    downloadBlob = new Blob([bytes], { type: 'image/gif' });
    downloadUrl = URL.createObjectURL(downloadBlob);
    const link = $('#savePng');
    link.href = downloadUrl;
    link.download = `pixieed-pixel-camera-${width}x${height}.gif`;
    $('#saveLabel').textContent = '動画を保存（GIF）';
    root.dataset.gifFrames = String(frames.length);
    root.dataset.gifBytes = String(bytes.length);
    updateSaveLinkState();
    sayToast(`GIFを撮影しました（${(frames.length / fps).toFixed(1)}秒）`);
    stopGifPlayback();
    if (!audioCameraRequest) resultView.show({ title: 'GIFを撮影しました', detail: `${(frames.length / fps).toFixed(1)}秒`, preview: view, controls: $('#resultControls'), mediaUrl: downloadUrl });
    focusVisible('#savePng');
  } catch (error) {
    if (generation !== downloadGeneration || error.name === 'AbortError' || job !== gifExportJob) return;
    updateSaveLinkState();
    say('GIFを作れませんでした。撮り直してください。', { visible: true });
  } finally { if (gifExportJob === job) gifExportJob = null; }
}
captureButton.addEventListener('pointerdown', (event) => {
  holdFired = false;
  if (audioCameraRequest || importedSource) return;
  if (state.mode !== 'live' || !state.result || event.button > 0) return;
  try { captureButton.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => { holdFired = true; startGif(); }, HOLD_MS);
});
const releaseShutter = () => { window.clearTimeout(holdTimer); if (gif.recording) finishGif(); };
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) captureButton.addEventListener(type, releaseShutter);
captureButton.addEventListener('contextmenu', (event) => event.preventDefault());

// Space mirrors the physical hold gesture; a short press still invokes the normal button action.
captureButton.addEventListener('keydown', (event) => {
  if (event.key !== ' ') return;
  event.preventDefault();
  if (event.repeat || keyboardShutterActive) return;
  keyboardShutterActive = true;
  keyboardHoldFired = false;
  if (audioCameraRequest || importedSource || state.mode !== 'live' || !state.result) return;
  window.clearTimeout(keyboardHoldTimer);
  keyboardHoldTimer = window.setTimeout(() => {
    keyboardHoldFired = true;
    startGif();
  }, HOLD_MS);
});
function releaseKeyboardShutter() {
  if (!keyboardShutterActive) return;
  keyboardShutterActive = false;
  window.clearTimeout(keyboardHoldTimer);
  if (keyboardHoldFired) {
    keyboardHoldFired = false;
    finishGif();
    return;
  }
  captureButton.click();
}
function cancelKeyboardShutter() {
  if (!keyboardShutterActive) return;
  keyboardShutterActive = false;
  window.clearTimeout(keyboardHoldTimer);
  if (keyboardHoldFired) finishGif();
  keyboardHoldFired = false;
}
captureButton.addEventListener('keyup', (event) => {
  if (event.key !== ' ' || !keyboardShutterActive) return;
  event.preventDefault();
  releaseKeyboardShutter();
});
captureButton.addEventListener('blur', cancelKeyboardShutter);

// First time only: tell people the picture itself is the controller.
function showGestureHintOnce() {
  if (audioCameraRequest) return;
  let seen = false;
  try { seen = localStorage.getItem('pixieed:camera-gestures:v1') === '1'; localStorage.setItem('pixieed:camera-gestures:v1', '1'); } catch { seen = false; }
  if (seen) return;
  const hint = $('#gestureHint'); hint.hidden = false;
  window.setTimeout(() => { hint.hidden = true; }, 4200);
}

$('#capture').addEventListener('click', () => {
  if (audioCameraRequest && audioFrozenFrame) { finishAudioCamera(audioFrozenFrame); return; }
  if (holdFired) { holdFired = false; return; } // the hold already recorded a GIF
  const { action } = deriveCameraPrimaryAction({ mode: state.mode, hasResult: Boolean(state.result), error: state.error, workerUnavailable: Boolean(workerUnavailable) });
  if (action === 'retake') retake();
  else if (action === 'reload') location.reload();
  else if (action === 'retry') void startCamera();
  else if (action === 'resume') void startCamera();
  else if (action === 'capture') capture();
});
$('#flipCamera').addEventListener('click', () => { if (state.mode === 'live') flipCamera(); });
$('#savePng').addEventListener('click', async (event) => {
  event.preventDefault();
  const link = $('#savePng');
  if (link.getAttribute('aria-disabled') === 'true' || !downloadUrl || !downloadBlob || state.mode !== 'captured' || !state.result) return;
  const snapshot = { generation: downloadGeneration, frame: state.result, url: downloadUrl, blob: downloadBlob, filename: link.download };
  const isCurrent = () => snapshot.generation === downloadGeneration && state.mode === 'captured' && state.result === snapshot.frame && downloadUrl === snapshot.url && downloadBlob === snapshot.blob;
  try {
    // Keep the fresh ownership check for restored PXD images. The dialog's own
    // share button supplies a new user gesture after this asynchronous check.
    if (!gif.pending) await cameraPxd.assertCanSave();
    if (!isCurrent()) return;
    if (!fileSave.show({ blob: snapshot.blob, url: snapshot.url, filename: snapshot.filename, isCurrent })) {
      say('保存画面を開けませんでした。ブラウザを更新して、もう一度お試しください。', { visible: true });
    }
  } catch (error) {
    if (isCurrent()) say(error instanceof Error ? error.message : 'この画像を保存できません。', { visible: true });
  }
});
if (returnToAudio) $('#postCamera').textContent = '曲を作る';
$('#postCamera').addEventListener('click', async () => {
  if (state.mode !== 'captured' || !state.result || gif.pending) return;
  const button = $('#postCamera');
  const snapshot = { generation: downloadGeneration, frame: state.result, gif: gif.pending };
  button.disabled = true;
  try {
    await cameraPxd.assertCanSave();
    if (snapshot.generation !== downloadGeneration || state.mode !== 'captured' || state.result !== snapshot.frame || gif.pending !== snapshot.gif) throw new Error('画像が切り替わったため、地球儀へ送れません。もう一度お試しください。');
    const dataUrl = cameraPostDataUrl(snapshot.frame);
    localStorage.setItem('PiXiEED:camera-handoff:v1', JSON.stringify({ dataUrl, createdAt: Date.now() }));
    location.assign(returnToAudio ? '/audio/' : '/globe/?from=pixel-camera');
  } catch (error) {
    say(error instanceof Error ? error.message : '撮影画像を準備できませんでした。', { visible: true });
  } finally {
    button.disabled = false;
  }
});

const backLink = $('.lc-back');
if (audioCameraRequest) backLink.href = audioCameraCancelUrl({ search: location.search });
else if (returnToAudio || audioCameraInvalid) backLink.href = audioCameraCancelUrl({ search: location.search });
else if (new URLSearchParams(location.search).get('from') === 'globe') {
  backLink.href = '/globe/';
  backLink.setAttribute('aria-label', '地球儀へ戻る');
}

function suspendCamera() {
  if (regionMergeSession) endRegionMerge({ restore: true, resume: false });
  if (gif.recording) stopGifUi();
  if (state.mode !== 'live' && state.mode !== 'loading') return;
  if (importedSource) {
    clearStartupWatchdog();
    invalidatePreview();
    setMode('idle');
    say('画像プレビューを一時停止しています。', { visible: true });
    resumeOnVisible = true;
    return;
  }
  closeCamera({ message: 'カメラを一時停止しています。', focus: false });
  resumeOnVisible = true;
}

function resumeCameraIfVisible() {
  if (audioCameraInvalid || document.hidden || !resumeOnVisible || state.mode === 'captured') return;
  resumeOnVisible = false;
  if (importedSource) {
    lastImportedFrameAt = 0;
    previewSessionStarted = performance.now();
    previewCounter = 0;
    clearPreview();
    setMode('live');
    if (!workerUnavailable) loop.start();
    return;
  }
  void startCamera({ focus: false });
}

window.addEventListener('pagehide', () => {
  imageSelectionSequence++;
  if (gif.recording) stopGifUi();
  suspendCamera();
  invalidateCaptureDownload();
});
window.addEventListener('pageshow', () => {
  // A captured frame can return through the back/forward cache after its URL was released.
  if (state.mode === 'captured' && state.result && !downloadUrl) {
    invalidateCaptureDownload();
    if (gif.pending) { playGif(gif.pending); void prepareGifDownload(gif.pending); }
    else { say('PNGを準備しています…', { visible: true }); void prepareCaptureDownload(state.result); }
  }
  resumeCameraIfVisible();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendCamera();
  else resumeCameraIfVisible();
});

const cameraPxd = audioCameraRequest ? { ready: Promise.resolve(false), markDirty() {}, reset() {} } : mountPxdTools({
  tool: 'camera', projectWorkspace: true, hasContent: () => state.mode === 'captured' && Boolean(state.result) && !gif.pending,
  setStatus: (message) => say(message, { visible: true }),
  async getProject(project) {
    const base = project || createPxdProject();
    if (!sharedImageEdited || !state.result || state.mode !== 'captured' || gif.pending) return base;
    const frame = state.result;
    return putPxdSharedImage(base, { width: frame.width, height: frame.height, rgba: new Uint8Array(frame.data) });
  },
  async openProject(project) {
    const openSequence = ++imageSelectionSequence;
    const image = await readPxdSharedImage(project);
    if (openSequence !== imageSelectionSequence) return;
    clearImportedSource();
    sharedProjectBound = true;
    sharedImageEdited = false;
    sharedImageTarget = image ? { width: image.width, height: image.height } : null;
    if (!image) {
      sharedImageColorCount = 16;
      clearStartupWatchdog(); invalidatePreview(); cameraSequence++; stopTracks(); gif.pending = null; resumeOnVisible = true;
      state.result = null;
      setMode('idle');
      if (!audioCameraInvalid) { setMode('loading'); resumeCameraIfVisible(); }
      return;
    }
    sharedImageColorCount = countSharedImageColors(image, SHARED_CANVAS_PREMIUM_MAX_COLORS);
    const frame = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.rgba), palette: [] };
    invalidatePreview(); cameraSequence++; stopTracks(); gif.pending = null; resumeOnVisible = false; setMode('captured'); drawCompleted(frame);
    updateSharedCaptureControls();
    await prepareCaptureDownload(frame);
  }
});
const openedCameraPxd = await cameraPxd.ready;
$('#useCameraImage').hidden = Boolean(audioCameraRequest);
$('#useCameraImage').dataset.toolResultTransfer = '';
$('#useCameraImage').textContent = '他のツールへ';
$('#useCameraImage').addEventListener('click', async () => {
  if (state.mode !== 'captured' || !state.result || gif.pending) return;
  const generation = downloadGeneration;
  const button = $('#useCameraImage'); button.disabled = true;
  try {
    await cameraPxd.save();
    if (generation !== downloadGeneration || state.mode !== 'captured') return;
    await cameraPxd.showProjects({ pane: 'current', focusTransfer: true });
  } catch (error) {
    say(error instanceof Error ? error.message : '撮影画像を送る準備ができませんでした。', { visible: true });
  } finally { button.disabled = false; }
});
root.dataset.ready = String(openedCameraPxd);
fitPreview();
if (audioCameraInvalid) {
  resumeOnVisible = false;
  setMode('idle');
  $('#capture').disabled = true;
  for (const selector of ['#cameraChooseImage', '#cameraFallbackChoose', '#cameraImageInput']) $(selector).disabled = true;
  say('音楽への受け渡しを確認できません。曲へ戻ってカメラを開き直してください。', { visible: true });
} else if (!openedCameraPxd) {
  setMode('loading');
  resumeCameraIfVisible();
}
