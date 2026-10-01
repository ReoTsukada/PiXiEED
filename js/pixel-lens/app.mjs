import { createFrameLoop } from '../pixel-studio/frame-loop.mjs';
import { encodeCameraPng, pngExportGeometry } from '../pixel-studio/png-export.mjs?rev=20260928-pixel-roundtrip-1';
import { DEFAULT_FRAME_RATIO, FRAME_RATIOS, normalizeOutputSize, sharedFrameRatios, sharedOutputSizes, resolveAspect, centerCrop, frameGeometry, fitFrame } from '../pixel-studio/framing.mjs?rev=20261001-free-tools-1';
import { cameraStartErrorMessage, deriveCameraPrimaryAction } from '../pixel-studio/camera-ui-state.mjs';
import { CAMERA_SETTING_DEFAULTS, DITHER_PATTERNS, lensFrameFilter, lensPalette, lensPaletteEdited, processLensFrame, resetLensPalette, resetLensPaletteEdits, setLensPalette, setLensPaletteColor, setLensSettings } from './engine.mjs?v=20260930-distinct-colors-1';
import { attachZoomGestures, createCameraZoomController, formatZoom, getUserMediaWithZoomPreference, zoomRange, zoomStops } from './zoom.mjs?v=20261001-camera-zoom-40-1';
import { GIF_FPS } from './gif.mjs?v=20261001-animation-1';
import { animatedCapturePlan, downsampleAnimatedFrame, encodeAnimatedGif } from '../animated-export.mjs?v=20261001-animation-1';
import { saveFile } from '../pixel-export.mjs?rev=20260928-export-1';
import { cameraPostDataUrl } from './camera-post.mjs';
import { createAudioSong } from '../creation/audio-core.mjs?rev=20260930-audio-timebase-1';
import { audioCameraCancelUrl, beginAudioCamera, completeAudioCamera, readAudioCameraRequest } from '../creation/audio-camera-handoff.mjs?rev=20260930-shared-canvas-5';
import { createPxdProject } from '../creation/pxd-codec.mjs';
import { evaluateSharedCanvasPolicy, SHARED_CANVAS_PREMIUM_MAX_COLORS } from '../creation/shared-canvas-policy.mjs?rev=20261001-free-tools-1';
import { countSharedImageColors, prepareSharedCanvasImage } from '../creation/shared-image.mjs?rev=20261001-free-tools-1';
import { putPxdSharedImage, readPxdSharedImage } from '../creation/pxd-project.mjs?rev=20261001-free-tools-1';
import { mountPxdTools } from '../creation/pxd-ui.mjs?rev=20261001-free-tools-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20261001-free-tools-1';

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
const resultView = createToolResultView({ key: 'camera-result', main: root, returnLabel: '撮り直す', onClose: retake });
const video = $('#video');
const stage = $('#stage');
const view = $('#view');
const captureFrame = $('#captureFrame');
const viewContext = view.getContext('2d', { alpha: false });
const stageMessage = $('#stageMsg');
const info = $('#info');
const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
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
let downloadGeneration = 0;
let gifExportJob = null;
let resumeOnVisible = true;
let pendingCameraRequest = null;
let previewSessionStarted = 0;
let previewCounter = 0;
let toastTimer = null;
let displayedPaletteRevision = null;
let audioFrozenFrame = null;
let captureInFlight = false;

// PiXiEELENS defaults (pixiee-lens/index.html): 4 colours, Game Boy palette, ordered dither, surface 55
const state = { mode: 'idle', facing: 'environment', result: null, error: '', ratio: DEFAULT_FRAME_RATIO, size: normalizeOutputSize(audioCameraRequest?.width ?? 128),
  colorDepth: '16', paletteMode: 'source', gradientMode: 'none', ditherPattern: 'net8', surfaceSimplify: 0, camera: { ...CAMERA_SETTING_DEFAULTS }, zoom: 1 };
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
  stageMessage.textContent = message;
  stageMessage.hidden = !message;
  stageMessage.classList.toggle('pc-sr-only', !visible);
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
  const enabled = state.mode === 'captured' && Boolean(state.result && downloadUrl);
  $('#resultControls').hidden = !enabled;
  $('#postCamera').hidden = Boolean(gif.pending);
  link.setAttribute('aria-disabled', String(!enabled));
  link.setAttribute('tabindex', enabled ? '0' : '-1');
  if (!enabled) link.removeAttribute('href');
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
    info.textContent = state.error === 'worker'
      ? 'ページを再読み込みしてください。'
      : state.error
        ? '前の完成画像を表示しています。'
        : previewReady
          ? '中央のボタンで撮影できます。'
          : '完成した画像から順に表示します。';
  } else if (mode === 'captured') info.textContent = '中央のボタンで撮り直せます。';
}

function setMode(mode) {
  if (mode !== 'captured') resultView.close({ focus: false, notify: false });
  state.mode = mode;
  root.dataset.mode = mode;
  root.dataset.facing = state.facing;
  $('#welcome').hidden = mode !== 'idle';
  $('#resultControls').hidden = mode !== 'captured';
  if (mode !== 'live') closeCameraSettings();
  updateSizeSummary();
  updatePrimaryAction();
  updateSharedCaptureControls();
  $('#flipCamera').disabled = mode !== 'live';
  settingsButton.disabled = mode !== 'live';
  settingsButton.hidden = mode !== 'live';
  updateSaveLinkState();
  setInfoForMode(mode);
}

function updatePrimaryAction() {
  const button = $('#capture');
  if (audioCameraRequest && audioFrozenFrame) {
    button.dataset.action = 'audio-return';
    button.setAttribute('aria-label', '画像を音楽へ戻す');
    button.title = '画像を音楽へ戻す';
    button.disabled = false;
    return;
  }
  const primary = deriveCameraPrimaryAction({ mode: state.mode, hasResult: Boolean(state.result), error: state.error, workerUnavailable: Boolean(workerUnavailable) });
  button.dataset.action = primary.action;
  let label = audioCameraRequest && primary.action === 'capture' ? '撮影して音楽へ戻る' : primary.label;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = primary.disabled;
  if (state.mode === 'live') {
    const dimensions = captureDimensions();
    const policy = evaluateSharedCanvasPolicy({
      width: dimensions.width,
      height: dimensions.height,
      colorCount: sharedImageTarget ? sharedImageColorCount : (Number(state.colorDepth) || 16)
    }, { passActive: sharedPassActive() });
    if (!policy.supported) {
      button.disabled = true;
      button.title = '共通キャンバスの範囲外です';
      button.setAttribute('aria-label', button.title);
    }
  }
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
  const fit = fitFrame(dimensions.width, dimensions.height, Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
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
  if (!result?.width || !result?.height || result.data?.length !== result.width * result.height * 4) return;
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
  state.error = '';
  if (stageMessage.textContent.startsWith('画像を処理できませんでした')) say('');
  setInfoForMode(state.mode);
  updatePrimaryAction();
  updateSaveLinkState();
}

const resizeObserver = new ResizeObserver(() => {
  if (root.ownerDocument.body.dataset.toolResultOpen === 'camera-result') return;
  if (state.mode === 'live' && state.ratio === 'screen' && Math.abs(currentAspect() - previewAspect) > 0.0001) restartPreview({ preserveCompleted: true });
  fitPreview(state.result);
  updateSizeSummary();
});
resizeObserver.observe(stage);

function cameraFrame() {
  if (!activeStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return null;
  const output = captureDimensions();
  const aspect = output.width / output.height;
  const full = centerCrop(video.videoWidth, video.videoHeight, aspect);
  const zoom = zoomController.snapshot();
  // Keep the previous published preview while device zoom is still above the user's requested total.
  if (zoom.total > zoom.requested + 0.02) return null;
  const digital = zoom.digital;
  const crop = { sw: full.sw / digital, sh: full.sh / digital, sx: full.sx + (full.sw - full.sw / digital) / 2, sy: full.sy + (full.sh - full.sh / digital) / 2 };
  const { width, height } = output;
  if (sourceCanvas.width !== width || sourceCanvas.height !== height) { sourceCanvas.width = width; sourceCanvas.height = height; }
  // PiXiEELENS renderDotFrame: draw the camera straight onto the dot grid through its smoothing blur and
  // camera tone filter, then run its colour pipeline on that dot-resolution image
  sourceContext.save();
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = 'high';
  sourceContext.filter = lensFrameFilter();
  sourceContext.clearRect(0, 0, width, height);
  if (state.facing === 'user') { sourceContext.translate(width, 0); sourceContext.scale(-1, 1); }
  sourceContext.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  sourceContext.restore();
  return { image: sourceContext.getImageData(0, 0, width, height), aspect };
}

function renderLens(frame) {
  const started = performance.now();
  processLensFrame(frame.image);
  const { width, height, data } = frame.image;
  return { width, height, data, aspect: frame.aspect, palette: lensPalette(), processingMs: performance.now() - started, aiStatus: 'disabled' };
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
        drawCompleted(result);
        if (gif.recording) recordGifFrame(result);
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
  zoomController.detach();
  if (activeStream) {
    for (const track of activeStream.getTracks()) track.stop();
    activeStream = null;
  }
  video.pause();
  video.srcObject = null;
}

function closeCamera({ idle = true, message = '', focus = false, visible = false } = {}) {
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

async function capture() {
  if (captureInFlight || state.mode !== 'live' || !state.result) return;
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
  const cameraToken = cameraSequence;
  try {
    await cameraPxd.startNewCaptureProject();
    if (cameraToken !== cameraSequence || state.mode !== 'live') return;
    invalidateCaptureDownload();
    const frozen = { ...sourceFrame, width: prepared.image.width, height: prepared.image.height, data: new Uint8ClampedArray(prepared.image.rgba), palette: (sourceFrame.palette || []).slice(0, maxColors) };
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
    fitPreview(frozen);
    say('PNGを準備しています…', { visible: true });
    void prepareCaptureDownload(frozen);
    await cameraPxd.save();
  } catch (error) {
    sayToast(error instanceof Error ? error.message : '新しいプロジェクトに保存できませんでした');
  } finally {
    captureInFlight = false;
  }
}

function finishAudioCamera(frozen) {
  try {
    const returnUrl = completeAudioCamera(audioCameraRequest, frozen);
    audioFrozenFrame = frozen;
    invalidatePreview();
    cameraSequence++;
    stopTracks();
    location.assign(returnUrl);
  } catch (error) {
    audioFrozenFrame = frozen;
    invalidatePreview();
    cameraSequence++;
    stopTracks();
    state.result = frozen;
    setMode('captured');
    fitPreview(frozen);
    $('#postCamera').hidden = true;
    $('#resultControls').hidden = true;
    info.textContent = '音楽へ画像を戻せませんでした。中央のボタンで再試行できます。';
    say(error instanceof Error ? error.message : '音楽へ画像を戻せませんでした。', { visible: true });
  }
}

function refreshObjects() {
  if (state.mode !== 'live') return;
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
  if (captureInFlight) return;
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
  say('カメラを開き直しています…');
  void startCamera();
}

async function prepareCaptureDownload(frozen) {
  const generation = downloadGeneration;
  try {
    // Export the completed frame at an integer scale; preview work stays at its
    // original dot resolution, and capture never requests a different frame.
    const { blob, width, height } = await encodeCameraPng(frozen);
    if (generation !== downloadGeneration || state.mode !== 'captured' || state.result !== frozen) return;
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
// ---------- Folded camera settings: one choice tray and six tabs ----------
// Each button shows its current value. Tapping one opens its row of choices (a carousel) above the bar;
// tapping it again, or the picture, folds it. Only one row is open at a time.
const tray = $('#tray'); const toolbar = $('#toolbar');
const settingsPanel = $('#cameraSettingsPanel'); const settingsButton = $('#cameraSettings');
let openTool = null; let trayClosedAt = 0;
function closeCameraSettings() {
  if (!settingsPanel.hidden) trayClosedAt = performance.now();
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
  openTray(null);
}
function toggleCameraSettings() {
  if (state.mode !== 'live' || gif.recording) return;
  if (!settingsPanel.hidden) { closeCameraSettings(); return; }
  settingsPanel.hidden = false;
  $('#gestureHint').hidden = true;
  settingsButton.setAttribute('aria-expanded', 'true');
  if (!openTool) openTray('look');
}
settingsButton.addEventListener('click', toggleCameraSettings);
const NO_DITHER_DEPTHS = new Set(['full', 'gray']);
const TONES = [['brightness', '明るさ'], ['exposure', '露出'], ['contrast', 'コントラスト'], ['saturation', '彩度'], ['shadows', '影'], ['whiteBalance', '色温度']];
let toneKey = 'contrast';
const SHORT_LABEL = { net8: '網目 8×8', net4: '網目 4×4', net2: '網目 2×2' };
const SWATCH_TONE = { net8: 72, net4: 72, net2: 72, checker: 128, lines: 64, diagonal: 64, halftone: 70, grain: 90 };
let swatchColors = [[32, 56, 16], [224, 248, 208]];

function openTray(tool) {
  if (openTool && !tool) trayClosedAt = performance.now();
  openTool = tool;
  if (tool !== 'look') setPaletteEditing(-1);
  root.dataset.tray = tool ?? '';
  for (const panel of tray.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tool;
  for (const button of toolbar.querySelectorAll('[data-tool]')) button.setAttribute('aria-expanded', String(button.dataset.tool === tool));
  const selected = tool && tray.querySelector(`[data-panel="${tool}"] [aria-checked="true"]`);
  if (selected) requestAnimationFrame(() => selected.scrollIntoView({ inline: 'center', block: 'nearest' }));
  if (tool === 'zoom') requestAnimationFrame(() => syncZoomStops(true));
}
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
const toneSlider = $('#toneSlider'); const toneValue = $('#toneValue');

function currentPatternId() { return state.gradientMode === 'dither' ? state.ditherPattern : 'none'; }
function syncZoomFace() {
  const zoomFace = toolbar.querySelector('[data-tool="zoom"]');
  zoomFace.querySelector('b').textContent = formatZoom(state.zoom);
  zoomFace.setAttribute('aria-label', `ズーム ${formatZoom(state.zoom)}（タップで倍率を選ぶ）`);
}
function syncToolbar() {
  const lookButton = document.querySelector(`#looks [data-look="${currentLook()}"]`);
  const face = (tool) => toolbar.querySelector(`[data-tool="${tool}"]`);
  face('look').querySelector('.lc-tool-sw').setAttribute('style', lookButton?.querySelector('.lc-sw')?.getAttribute('style') ?? '');
  face('look').querySelector('.lc-tool-sw').className = `lc-tool-sw lc-sw ${(lookButton?.querySelector('.lc-sw')?.className ?? '').replace(/\blc-sw\b/, '').trim()}`;
  face('look').querySelector('b').textContent = audioCameraRequest ? '写真16色' : (lookButton?.textContent.trim() ?? '');
  const available = !NO_DITHER_DEPTHS.has(state.colorDepth);
  const pattern = available && state.gradientMode === 'dither' ? DITHER_PATTERNS.find((p) => p.id === state.ditherPattern) : null;
  const dither = face('dither');
  dither.dataset.state = !available ? 'na' : pattern ? 'on' : 'off';
  dither.querySelector('.lc-tool-sw').style.setProperty('--swatch', pattern ? patternSwatch(pattern) : 'none');
  dither.querySelector('b').textContent = !available ? 'ディザなし' : pattern ? (SHORT_LABEL[pattern.id] ?? pattern.label) : 'ディザ OFF';
  dither.setAttribute('aria-label', !available ? 'この色ではディザを使いません' : pattern ? `ディザ：${pattern.label}（タップで模様を選ぶ）` : 'ディザをオンにする');
  face('pixels').querySelector('b').textContent = audioCameraRequest ? `${audioCameraRequest.width} × ${audioCameraRequest.height}` : sharedImageTarget ? `${sharedImageTarget.width} × ${sharedImageTarget.height}` : `${state.size} px`;
  const ratio = FRAME_RATIOS.find((r) => r.value === state.ratio);
  face('aspect').querySelector('b').textContent = audioCameraRequest ? `${audioCameraRequest.width}:16` : sharedImageTarget ? `${sharedImageTarget.width}:${sharedImageTarget.height}` : (ratio?.label ?? '');
  face('aspect').dataset.ratio = sharedImageTarget ? `${sharedImageTarget.width}:${sharedImageTarget.height}` : state.ratio;
  const toneChanged = TONES.some(([key]) => state.camera[key] !== CAMERA_SETTING_DEFAULTS[key]);
  face('tone').querySelector('b').textContent = toneChanged ? '調整中' : '調整';
  face('tone').dataset.changed = String(toneChanged);
  syncZoomFace();
  // selected chips
  const mark = (panel, value) => { for (const b of panel.querySelectorAll('[data-value]')) b.setAttribute('aria-checked', String(b.dataset.value === value)); };
  mark(ditherPanel, currentPatternId()); mark(pixelsPanel, audioCameraRequest || sharedImageTarget ? '' : String(state.size)); mark(aspectPanel, state.ratio); mark(toneChips, toneKey);
  const [, toneLabel] = TONES.find(([key]) => key === toneKey);
  toneSlider.value = String(state.camera[toneKey] ?? 0);
  toneSlider.setAttribute('aria-label', toneLabel);
  const v = Number(toneSlider.value); toneValue.textContent = v > 0 ? `+${v}` : String(v);
  toneSlider.style.setProperty('--fill', `${(v + 100) / 2}%`);
  $('#toneReset').disabled = !toneChanged;
}
function syncControls() {
  const look = currentLook();
  for (const button of document.querySelectorAll('#looks [data-look]')) button.setAttribute('aria-checked', String(button.dataset.look === look));
  if (NO_DITHER_DEPTHS.has(state.colorDepth) && openTool === 'dither') openTray(null);
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
  const button = event.target.closest('[data-tool]'); if (!button || state.mode === 'captured') return;
  const tool = button.dataset.tool;
  if (audioCameraRequest && ['look', 'dither', 'pixels', 'aspect'].includes(tool)) return;
  navigator.vibrate?.(6);
  if (tool === 'dither') {
    if (NO_DITHER_DEPTHS.has(state.colorDepth)) { sayToast('この色ではディザを使いません'); return; }
    // OFF: this button is a plain on/off switch. ON: it becomes the pattern switcher.
    if (state.gradientMode !== 'dither') {
      state.gradientMode = 'dither'; applyChange(); openTray('dither');
      sayToast(`ディザ ON：${DITHER_PATTERNS.find((p) => p.id === state.ditherPattern).label}`);
      return;
    }
  }
  openTray(openTool === tool ? null : tool);
});
ditherPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-value]'); if (!button || state.mode === 'captured' || audioCameraRequest) return;
  navigator.vibrate?.(6);
  if (button.dataset.value === 'none') { state.gradientMode = 'none'; applyChange(); openTray(null); sayToast('ディザ OFF'); return; }
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
  if (state.mode === 'captured') return;
  const value = Number(toneSlider.value);
  // a light detent at 0 so the standard look is easy to find again
  const snapped = Math.abs(value) <= 3 ? 0 : value;
  if (snapped === 0 && state.camera[toneKey] !== 0) navigator.vibrate?.(5);
  state.camera[toneKey] = snapped; applyChange();
});
$('#toneReset').addEventListener('click', () => { for (const [key] of TONES) state.camera[key] = CAMERA_SETTING_DEFAULTS[key]; navigator.vibrate?.(8); applyChange(); sayToast('色調整を元に戻しました'); });
document.addEventListener('pointerdown', (event) => {
  if (!settingsPanel.hidden && !settingsPanel.contains(event.target) && !settingsButton.contains(event.target) && stage.contains(event.target)) closeCameraSettings();
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
    dot.style.background = cssColor(color);
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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !settingsPanel.hidden) { closeCameraSettings(); settingsButton.focus(); } });
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
attachZoomGestures(stage, {
  get: () => state.zoom,
  set: (value, info) => setZoom(value, info),
  onTap: () => refreshObjects(),
  // the picture leans a little with the finger, so a swipe feels attached to it
  onDrag: (dx, dy) => {
    if (state.mode !== 'live' || gif.recording) return;
    captureFrame.classList.toggle('is-dragging', Boolean(dx || dy));
    captureFrame.style.translate = dx || dy ? `${Math.max(-40, Math.min(40, dx * 0.18))}px ${Math.max(-40, Math.min(40, dy * 0.18))}px` : '';
  },
  onSwipe: (direction) => {
    if (state.mode !== 'live' || gif.recording) return;
    if (direction === 'left') stepLook(1);
    else if (direction === 'right') stepLook(-1);
    else flipCamera();
  }
});
stage.addEventListener('keydown', (event) => {
  if (event.key === '+' || event.key === '=') setZoom(state.zoom * 1.25, { gesture: 'key' });
  else if (event.key === '-') setZoom(state.zoom / 1.25, { gesture: 'key' });
  else if (event.key === '0') setZoom(1, { gesture: 'key' });
  else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); refreshObjects(); }
});

// Swipe up / down: front and back cameras.
function flipCamera() {
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
  if (audioCameraRequest || state.mode !== 'live' || !state.result) return;
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
    downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
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
  if (audioCameraRequest) return;
  if (state.mode !== 'live' || !state.result || event.button > 0) return;
  try { captureButton.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => { holdFired = true; startGif(); }, HOLD_MS);
});
const releaseShutter = () => { window.clearTimeout(holdTimer); if (gif.recording) finishGif(); };
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) captureButton.addEventListener(type, releaseShutter);
captureButton.addEventListener('contextmenu', (event) => event.preventDefault());

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
  if (link.getAttribute('aria-disabled') === 'true' || !downloadUrl || state.mode !== 'captured' || !state.result) return;
  const snapshot = { generation: downloadGeneration, frame: state.result, url: downloadUrl, filename: link.download };
  // phones: the share sheet can put the picture straight into Photos; elsewhere a download
  const download = async () => {
    if (snapshot.generation !== downloadGeneration || state.mode !== 'captured' || state.result !== snapshot.frame || downloadUrl !== snapshot.url) return false;
    const blob = await (await fetch(snapshot.url)).blob();
    return (await saveFile(blob, snapshot.filename)) !== 'cancelled';
  };
  // GIFs come only from live camera captures. PXD restores are still frames and
  // require a fresh owner check before their PNG can leave the browser.
  if (gif.pending) { if (await download()) sayToast('GIFを保存しました。'); return; }
  try {
    await cameraPxd.assertCanSave();
    if (!await download()) { say('画像が切り替わったため、PNGを保存できません。もう一度お試しください。', { visible: true }); return; }
    sayToast('PNGを保存しました。');
  } catch (error) {
    say(error instanceof Error ? error.message : 'この画像を保存できません。', { visible: true });
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

function suspendCamera() {
  if (gif.recording) stopGifUi();
  if (state.mode !== 'live' && state.mode !== 'loading') return;
  closeCamera({ message: 'カメラを一時停止しています。', focus: false });
  resumeOnVisible = true;
}

function resumeCameraIfVisible() {
  if (document.hidden || !resumeOnVisible || state.mode === 'captured') return;
  resumeOnVisible = false;
  void startCamera({ focus: false });
}

window.addEventListener('pagehide', () => {
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
    const image = await readPxdSharedImage(project);
    sharedProjectBound = true;
    sharedImageEdited = false;
    sharedImageTarget = image ? { width: image.width, height: image.height } : null;
    if (!image) {
      sharedImageColorCount = 16;
      invalidatePreview(); cameraSequence++; stopTracks(); gif.pending = null; resumeOnVisible = false;
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
$('#useCameraImage').addEventListener('click', () => { void cameraPxd.showProjects?.(); });
root.dataset.ready = String(openedCameraPxd);
fitPreview();
if (audioCameraInvalid) {
  setMode('idle');
  $('#capture').disabled = true;
  say('音楽への受け渡しを確認できません。曲へ戻ってカメラを開き直してください。', { visible: true });
} else if (!openedCameraPxd) {
  setMode('loading');
  resumeCameraIfVisible();
}
