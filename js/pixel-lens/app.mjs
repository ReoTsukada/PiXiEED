import { createFrameLoop } from '../pixel-studio/frame-loop.mjs';
import { encodeCameraPng, pngExportGeometry } from '../pixel-studio/png-export.mjs';
import { FRAME_RATIOS, OUTPUT_SIZES, resolveAspect, centerCrop, frameGeometry, fitFrame } from '../pixel-studio/framing.mjs?v=20260925-lens-sizes-1';
import { cameraStartErrorMessage, deriveCameraPrimaryAction } from '../pixel-studio/camera-ui-state.mjs';
import { CAMERA_SETTING_DEFAULTS, DITHER_PATTERNS, lensFrameFilter, lensPalette, processLensFrame, resetLensPalette, setLensSettings } from './engine.mjs?v=20260927-ui-1';
import { attachZoomGestures, formatZoom, splitZoom, zoomRange, zoomStops } from './zoom.mjs?v=20260927-ui-1';
import { GIF_FPS, GIF_MAX_MS, encodeGif, gifScale } from './gif.mjs?v=20260927-ui-1';

const $ = (selector) => document.querySelector(selector);
const root = $('#pixelStudio');
const video = $('#video');
const stage = $('#stage');
const view = $('#view');
const captureFrame = $('#captureFrame');
const settingsPanel = $('#sizePopover');
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
let resumeOnVisible = true;
let pendingCameraRequest = null;
let previewSessionStarted = 0;
let previewCounter = 0;
let toastTimer = null;
let displayedPaletteRevision = null;

// PiXiEELENS defaults (pixiee-lens/index.html): 4 colours, Game Boy palette, ordered dither, surface 55
const state = { mode: 'idle', facing: 'environment', result: null, error: '', ratio: 'screen', size: 256,
  colorDepth: '4', paletteMode: 'gameboy', gradientMode: 'dither', ditherPattern: 'net8', surfaceSimplify: 55, camera: { ...CAMERA_SETTING_DEFAULTS }, zoom: 1 };
let zoomInfo = zoomRange(null); let appliedHardwareZoom = 1; let zoomApplyPending = false;
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
  state.mode = mode;
  root.dataset.mode = mode;
  root.dataset.facing = state.facing;
  $('#welcome').hidden = mode !== 'idle';
  $('#cameraControls').hidden = mode !== 'live' && mode !== 'loading';
  $('#resultControls').hidden = mode !== 'captured';
  $('#imageSettings').disabled = mode === 'captured';
  if (mode === 'captured' && settingsPanel.matches(':popover-open')) settingsPanel.hidePopover();
  updateSizeSummary();
  updatePrimaryAction();
  $('#stopCamera').disabled = mode !== 'live' && mode !== 'loading';
  updateSaveLinkState();
  setInfoForMode(mode);
}

function updatePrimaryAction() {
  const button = $('#capture');
  const primary = deriveCameraPrimaryAction({ mode: state.mode, hasResult: Boolean(state.result), error: state.error, workerUnavailable: Boolean(workerUnavailable) });
  button.dataset.action = primary.action;
  button.setAttribute('aria-label', primary.label);
  button.title = primary.label;
  button.disabled = primary.disabled;
}

function currentAspect() {
  return resolveAspect(state.ratio, Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
}

function updateSizeSummary() {
  const ratio = FRAME_RATIOS.find((item) => item.value === state.ratio);
  const dimensions = ((state.mode === 'captured' || state.mode === 'live') && state.result) || frameGeometry(currentAspect(), state.size);
  $('#ratioSummary').textContent = ratio.label;
  $('#sizeSummary').textContent = state.mode === 'captured' ? `${dimensions.width} × ${dimensions.height}` : `${state.size} px`;
  $('#frameDimensions').textContent = `${dimensions.width} × ${dimensions.height}`;
  const saved = pngExportGeometry(dimensions.width, dimensions.height);
  $('#outputSummary').textContent = `${saved.width} × ${saved.height} px · PNG`;
  $('#colorSummary').textContent = COLOR_LABELS[state.colorDepth] ?? `${state.colorDepth}色`;
  root.dataset.framing = state.ratio;
  root.dataset.outputSize = String(state.size);
  $('#imageSettings').setAttribute('aria-label', state.mode === 'captured'
    ? `撮影画像 ${dimensions.width} × ${dimensions.height} ピクセル`
    : `撮影と色の設定、${ratio.label}、長辺 ${state.size} ピクセル、${COLOR_LABELS[state.colorDepth] ?? state.colorDepth}`);
}

function updatePalettePreview(result) {
  const revision = `${(result.palette ?? []).map((c) => c.join(',')).join(';')}:${state.colorDepth}`;
  if (revision === displayedPaletteRevision) return;
  displayedPaletteRevision = revision;
  tintSwatches(result.palette);
  const preview = $('#palettePreview');
  preview.replaceChildren();
  const noPalette = !result.palette?.length;
  preview.dataset.full = String(noPalette);
  if (noPalette) { preview.setAttribute('aria-label', COLOR_LABELS[state.colorDepth] ?? ''); return; }
  for (const color of result.palette ?? []) {
    const swatch = document.createElement('i');
    swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    preview.appendChild(swatch);
  }
  preview.setAttribute('aria-label', `${result.palette?.length ?? 0}色の写真由来パレット`);
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
  if (state.mode === 'live' && state.ratio === 'screen' && Math.abs(currentAspect() - previewAspect) > 0.0001) restartPreview({ preserveCompleted: true });
  fitPreview(state.result);
  updateSizeSummary();
});
resizeObserver.observe(stage);

function cameraFrame() {
  if (!activeStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return null;
  const output = frameGeometry(currentAspect(), state.size);
  const aspect = output.width / output.height;
  const full = centerCrop(video.videoWidth, video.videoHeight, aspect);
  const digital = Math.max(1, state.zoom / appliedHardwareZoom); // what the camera's optics could not do is cropped
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
  if (focus) focusVisible('#stopCamera');
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
    const request = navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: state.facing } } });
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

function capture() {
  if (state.mode !== 'live' || !state.result) return;
  invalidateCaptureDownload();
  const frozen = state.result;
  gif.pending = null;
  invalidatePreview();
  cameraSequence++;
  stopTracks();
  setMode('captured');
  fitPreview(frozen);
  say('PNGを準備しています…', { visible: true });
  void prepareCaptureDownload(frozen);
}

function refreshObjects() {
  if (state.mode !== 'live') return;
  if (performance.now() - railClosedAt < 600) return; // that tap only folded the dither list
  resetLensPalette(); // PiXiEELENS keeps its palette; a tap picks the colours again from the current view
  paletteEpoch++;
  root.dataset.paletteEpoch = String(paletteEpoch);
  // feedback without covering the picture: a short ring around the frame, a tick and a toast
  const picksColours = ['8', '16'].includes(state.colorDepth) || (['2', '4'].includes(state.colorDepth) && state.paletteMode === 'source');
  if (!picksColours) { sayToast('この配色は固定です'); return; }
  captureFrame.classList.remove('lc-repick');
  requestAnimationFrame(() => captureFrame.classList.add('lc-repick'));
  window.setTimeout(() => captureFrame.classList.remove('lc-repick'), 600);
  navigator.vibrate?.(8);
  sayToast('今の景色から色を選び直しました');
}

function retake() {
  gif.pending = null;
  invalidateCaptureDownload();
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
    $('#saveLabel').textContent = 'PNGを保存';
    updateSaveLinkState();
    sayToast('撮影しました。PNGを保存できます。');
    focusVisible('#savePng');
  } catch (error) {
    if (generation !== downloadGeneration || state.mode !== 'captured' || state.result !== frozen) return;
    updateSaveLinkState();
    info.textContent = 'PNGを準備できませんでした。撮り直してもう一度お試しください。';
    say(error instanceof Error ? error.message : 'PNGを保存できませんでした。', { visible: true });
  }
}

settingsPanel.addEventListener('toggle', (event) => {
  if (event.newState === 'open') updateSizeSummary();
});
const CAMERA_KEYS = Object.keys(CAMERA_SETTING_DEFAULTS);
// Look presets: one tap sets colour depth + palette the way PiXiEELENS names them
const LOOKS = {
  gb: { colorDepth: '4', paletteMode: 'gameboy' },
  mono: { colorDepth: '2', paletteMode: 'gameboy' },
  gray: { colorDepth: 'gray' },
  c8: { colorDepth: '8', paletteMode: 'gameboy' },
  c16: { colorDepth: '16', paletteMode: 'gameboy' },
  photo: { colorDepth: '16', paletteMode: 'source' },
  c256: { colorDepth: '256' },
  full: { colorDepth: 'full' }
};
function currentLook() {
  if (state.colorDepth === '16') return state.paletteMode === 'source' ? 'photo' : 'c16';
  return Object.keys(LOOKS).find((key) => LOOKS[key].colorDepth === state.colorDepth) ?? 'gb';
}
function syncControls() {
  for (const out of settingsPanel.querySelectorAll('output[data-for]')) {
    const input = settingsPanel.querySelector(`[name="${out.dataset.for}"]`);
    if (input) out.textContent = input.value;
  }
  const check = (name, value) => { const input = settingsPanel.querySelector(`input[name="${name}"][value="${value}"]`); if (input) input.checked = true; };
  check('aspect', state.ratio); check('pixels', String(state.size)); check('paletteMode', state.paletteMode);
  syncDitherRail();
  $('#paletteModeRow').hidden = !['2', '4', '8', '16'].includes(state.colorDepth);
  const look = currentLook();
  for (const button of document.querySelectorAll('#looks [data-look]')) button.setAttribute('aria-checked', String(button.dataset.look === look));
  const toneChanged = CAMERA_KEYS.some((key) => key !== 'zoom' && state.camera[key] !== CAMERA_SETTING_DEFAULTS[key]);
  const toneState = $('#toneState'); if (toneState) { toneState.textContent = toneChanged ? '調整中' : '標準'; toneState.dataset.changed = String(toneChanged); }
}
function applyChange({ restart = false } = {}) {
  syncLens();
  syncControls();
  if (restart) restartPreview({ preserveCompleted: true });
  fitPreview(state.result);
  updateSizeSummary();
}
function onSettingInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || state.mode === 'captured') return;
  let restart = false;
  if (input.name === 'aspect' && FRAME_RATIOS.some((ratio) => ratio.value === input.value)) { state.ratio = input.value; restart = true; }
  else if (input.name === 'pixels' && OUTPUT_SIZES.includes(Number(input.value))) { state.size = Number(input.value); restart = true; }
  else if (input.name === 'paletteMode') state.paletteMode = input.value;
  else if (input.name === 'dither') state.gradientMode = input.checked ? 'dither' : 'none';
  else if (CAMERA_KEYS.includes(input.name)) state.camera[input.name] = Number(input.value);
  else return;
  applyChange({ restart });
}
settingsPanel.addEventListener('change', onSettingInput);
settingsPanel.addEventListener('input', (event) => { if (event.target instanceof HTMLInputElement && event.target.type === 'range') onSettingInput(event); });
$('#resetCamera')?.addEventListener('click', () => {
  state.camera = { ...CAMERA_SETTING_DEFAULTS };
  for (const key of CAMERA_KEYS) { const input = settingsPanel.querySelector(`[name="${key}"]`); if (input) input.value = String(state.camera[key]); }
  applyChange();
});
$('#repick')?.addEventListener('click', () => { refreshObjects(); settingsPanel.hidePopover?.(); });
function selectLook(button) {
  if (!button || state.mode === 'captured') return;
  Object.assign(state, LOOKS[button.dataset.look]);
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  navigator.vibrate?.(8);
  applyChange();
  sayToast(button.textContent.trim());
}
$('#looks').addEventListener('click', (event) => selectLook(event.target.closest('[data-look]')));
// Swipe left / right on the picture steps through the looks (wraps around).
function stepLook(delta) {
  const buttons = [...document.querySelectorAll('#looks [data-look]')];
  const index = buttons.findIndex((button) => button.dataset.look === currentLook());
  selectLook(buttons[(index + delta + buttons.length) % buttons.length]);
}
// ---------- Dither rail ----------
// One control on the right edge. Folded, it is a single swatch of the current pattern (or "オフ"): flick it
// up / down to step through the patterns, tap it to open the list. Open, it lists every pattern with its
// name; picking one folds the rail again. It is absent for looks without dither (グレー, フル).
const NO_DITHER_DEPTHS = new Set(['full', 'gray']);
const rail = $('#ditherRail'); const railList = $('#ditherKinds'); const railCurrent = $('#ditherCurrent');
const SHORT_LABEL = { net8: '8×8', net4: '4×4', net2: '2×2', diagonal: '斜線', atkinson: 'Atkin', fs: '拡散' };
const SWATCH_TONE = { net8: 72, net4: 72, net2: 72, checker: 128, lines: 64, diagonal: 64, halftone: 70, grain: 90 };
let swatchColors = [[32, 56, 16], [224, 248, 208]];
// A swatch shows one characteristic step of the pattern 1:1 in the current palette's darkest and lightest
// colours; error diffusion is shown by diffusing a flat 35% tone.
function patternSwatch(pattern) {
  const size = 16; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d'); const image = context.createImageData(size, size);
  const bits = new Uint8Array(size * size);
  if (pattern?.kind === 'ordered') {
    const step = pattern.levels[pattern.levelForTone[SWATCH_TONE[pattern.id] ?? 90]];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) bits[y * size + x] = step[((y & pattern.mask) << pattern.shift) | (x & pattern.mask)];
  } else if (pattern?.kind === 'diffusion') {
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
function makeRailItem(id, label) {
  const button = document.createElement('button');
  button.type = 'button'; button.setAttribute('role', 'radio'); button.dataset.pattern = id;
  button.innerHTML = '<span class="lc-rail-name"></span><i class="lc-rail-swatch" aria-hidden="true"></i>';
  button.querySelector('.lc-rail-name').textContent = label;
  railList.appendChild(button);
}
makeRailItem('none', 'オフ');
for (const pattern of DITHER_PATTERNS) makeRailItem(pattern.id, pattern.label);
function paintSwatches() {
  for (const button of railList.querySelectorAll('[data-pattern]')) {
    const pattern = DITHER_PATTERNS.find((p) => p.id === button.dataset.pattern);
    button.querySelector('.lc-rail-swatch').style.setProperty('--swatch', pattern ? patternSwatch(pattern) : 'none');
  }
}
/** Colour the swatches with the look's own palette (called when the palette changes). */
function tintSwatches(palette) {
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sorted = (palette?.length ? [...palette] : []).sort((a, b) => lum(a) - lum(b));
  swatchColors = sorted.length >= 2 ? [sorted[0], sorted.at(-1)] : [[28, 30, 34], [236, 238, 240]];
  paintSwatches(); syncDitherRail();
}
function currentPatternId() { return state.gradientMode === 'dither' ? state.ditherPattern : 'none'; }
function syncDitherRail() {
  const available = !NO_DITHER_DEPTHS.has(state.colorDepth);
  rail.hidden = !available;
  if (!available) setRailOpen(false);
  const id = currentPatternId(); const pattern = DITHER_PATTERNS.find((p) => p.id === id);
  for (const button of railList.querySelectorAll('[data-pattern]')) button.setAttribute('aria-checked', String(button.dataset.pattern === id));
  railCurrent.querySelector('.lc-rail-swatch').style.setProperty('--swatch', pattern ? patternSwatch(pattern) : 'none');
  railCurrent.querySelector('.lc-rail-caption').textContent = pattern ? (SHORT_LABEL[pattern.id] ?? pattern.label) : 'オフ';
  railCurrent.dataset.off = String(!pattern);
  railCurrent.setAttribute('aria-label', `ディザ：${pattern ? pattern.label : 'オフ'}（タップで一覧、上下にはじいて切り替え）`);
}
let railTimer = 0;
function setRailOpen(open) {
  window.clearTimeout(railTimer);
  rail.dataset.open = String(open);
  railList.hidden = !open;
  railCurrent.setAttribute('aria-expanded', String(open));
  if (open) railList.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'center' });
}
function choosePattern(id, { toast = true } = {}) {
  if (state.mode === 'captured' || NO_DITHER_DEPTHS.has(state.colorDepth)) return;
  if (id === 'none') state.gradientMode = 'none';
  else { state.gradientMode = 'dither'; state.ditherPattern = id; }
  navigator.vibrate?.(6);
  applyChange();
  if (toast) sayToast(`ディザ：${DITHER_PATTERNS.find((p) => p.id === currentPatternId())?.label ?? 'オフ'}`);
}
railList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pattern]'); if (!button) return;
  choosePattern(button.dataset.pattern, { toast: false });
  railTimer = window.setTimeout(() => setRailOpen(false), 380); // let the choice show before folding
});
// the folded swatch: tap opens the list, a vertical flick steps through the patterns
{
  let start = null;
  railCurrent.addEventListener('pointerdown', (event) => { start = { y: event.clientY, t: performance.now() }; try { railCurrent.setPointerCapture(event.pointerId); } catch { /* ignore */ } });
  railCurrent.addEventListener('pointerup', (event) => {
    if (!start) return; const dy = event.clientY - start.y; const quick = performance.now() - start.t < 600; start = null;
    if (Math.abs(dy) > 24 && quick) {
      const ids = ['none', ...DITHER_PATTERNS.map((p) => p.id)];
      const index = ids.indexOf(currentPatternId());
      choosePattern(ids[(index + (dy < 0 ? -1 : 1) + ids.length) % ids.length]);
      railCurrent.classList.remove('is-stepped'); requestAnimationFrame(() => railCurrent.classList.add('is-stepped'));
      railCurrent.dataset.swallowClick = 'true';
    }
  });
  railCurrent.addEventListener('pointercancel', () => { start = null; });
  railCurrent.addEventListener('click', () => {
    if (railCurrent.dataset.swallowClick === 'true') { railCurrent.dataset.swallowClick = 'false'; return; }
    setRailOpen(rail.dataset.open !== 'true');
  });
}
let railClosedAt = 0;
document.addEventListener('pointerdown', (event) => { if (rail.dataset.open === 'true' && !rail.contains(event.target)) { setRailOpen(false); railClosedAt = performance.now(); } }, true);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && rail.dataset.open === 'true') { setRailOpen(false); railCurrent.focus(); } });
paintSwatches();
syncControls();

// ---------- Pinch-first zoom ----------
const zoomHud = $('#zoomHud'); let hudTimer = 0;
function setupZoomForTrack(track) {
  let caps = null;
  try { caps = track?.getCapabilities?.() ?? null; } catch { caps = null; }
  zoomInfo = zoomRange(caps);
  appliedHardwareZoom = 1;
  if (zoomInfo.hardware) { try { const current = track.getSettings?.().zoom; if (Number.isFinite(current)) appliedHardwareZoom = current; } catch { /* keep 1 */ } }
  setZoom(Math.min(zoomInfo.max, Math.max(zoomInfo.min, state.zoom)), { silent: true });
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
function syncZoomStops() {
  const buttons = [...document.querySelectorAll('#zoomStops button')];
  let nearest = null; for (const b of buttons) if (!nearest || Math.abs(Number(b.dataset.zoom) - state.zoom) < Math.abs(Number(nearest.dataset.zoom) - state.zoom)) nearest = b;
  for (const b of buttons) {
    const on = b === nearest;
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on && Math.abs(state.zoom - Number(b.dataset.zoom)) > 0.05 ? formatZoom(state.zoom) : formatZoom(Number(b.dataset.zoom));
  }
}
function applyHardwareZoom() {
  if (zoomApplyPending || !zoomInfo.hardware || !activeStream) return;
  zoomApplyPending = true;
  requestAnimationFrame(async () => {
    const track = activeStream?.getVideoTracks()[0];
    const { hardware } = splitZoom(state.zoom, zoomInfo);
    try { if (track && Math.abs(hardware - appliedHardwareZoom) > 0.01) { await track.applyConstraints({ advanced: [{ zoom: hardware }] }); appliedHardwareZoom = hardware; } }
    catch { zoomInfo = { ...zoomInfo, hardware: false }; appliedHardwareZoom = 1; }
    zoomApplyPending = false;
    if (Math.abs(splitZoom(state.zoom, zoomInfo).hardware - appliedHardwareZoom) > 0.01) applyHardwareZoom();
  });
}
function setZoom(value, { gesture = '', silent = false } = {}) {
  if (state.mode === 'captured') return;
  const previous = state.zoom;
  state.zoom = Math.min(zoomInfo.max, Math.max(zoomInfo.min, value));
  // gentle detents at the preset stops so a pinch lands on 1× / 2× / 3× easily
  if (gesture === 'pinch') for (const stop of zoomStops(zoomInfo)) if (Math.abs(state.zoom - stop) < 0.04 * stop) { if (Math.abs(previous - stop) >= 0.04 * stop) navigator.vibrate?.(6); state.zoom = stop; }
  applyHardwareZoom();
  syncZoomStops();
  if (silent) return;
  const { hardware } = splitZoom(state.zoom, zoomInfo);
  $('#zoomHudValue').textContent = formatZoom(state.zoom);
  $('#zoomHudFill').style.width = `${(100 * Math.log(state.zoom / zoomInfo.min)) / Math.log(zoomInfo.max / zoomInfo.min)}%`;
  $('#zoomHudHint').textContent = state.zoom <= hardware + 0.01 && zoomInfo.hardware ? '光学ズーム' : 'デジタルズーム';
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
const gif = { recording: false, frames: [], started: 0, lastAt: 0, raf: 0, playTimer: 0, pending: null };
const captureButton = $('#capture');
let holdTimer = 0; let holdFired = false;
function gifProgress() {
  if (!gif.recording) return;
  const elapsed = performance.now() - gif.started;
  const left = Math.max(0, GIF_MAX_MS - elapsed);
  captureButton.style.setProperty('--gif-progress', String(Math.min(1, elapsed / GIF_MAX_MS)));
  $('#gifRecTime').textContent = `${(left / 1000).toFixed(1)}s`;
  if (left <= 0) { finishGif(); return; }
  gif.raf = requestAnimationFrame(gifProgress);
}
function startGif() {
  if (state.mode !== 'live' || !state.result) return;
  gif.recording = true; gif.frames = []; gif.started = performance.now(); gif.lastAt = 0;
  recordGifFrame(state.result);
  root.dataset.recording = 'true';
  $('#gifRec').hidden = false;
  navigator.vibrate?.(15);
  gif.raf = requestAnimationFrame(gifProgress);
}
function recordGifFrame(result) {
  const now = performance.now();
  if (gif.frames.length && now - gif.lastAt < 1000 / GIF_FPS - 8) return;
  const first = gif.frames[0];
  if (first && (first.width !== result.width || first.height !== result.height)) return;
  gif.lastAt = now;
  gif.frames.push({ width: result.width, height: result.height, data: result.data });
}
function stopGifUi() {
  gif.recording = false;
  cancelAnimationFrame(gif.raf);
  root.dataset.recording = 'false';
  $('#gifRec').hidden = true;
  captureButton.style.setProperty('--gif-progress', '0');
}
function finishGif() {
  if (!gif.recording) return;
  stopGifUi();
  const frames = gif.frames; gif.frames = [];
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
  gif.playTimer = window.setInterval(show, 1000 / GIF_FPS);
}
function stopGifPlayback() { if (gif.playTimer) { window.clearInterval(gif.playTimer); gif.playTimer = 0; } }
async function prepareGifDownload(frames) {
  const generation = downloadGeneration;
  try {
    const { width, height } = frames[0];
    const scale = gifScale(width, height);
    const bytes = encodeGif(frames, { delayMs: 1000 / GIF_FPS, scale });
    if (generation !== downloadGeneration || state.mode !== 'captured') return;
    downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    const link = $('#savePng');
    link.href = downloadUrl;
    link.download = `pixieed-pixel-camera-${width * scale}x${height * scale}.gif`;
    $('#saveLabel').textContent = 'GIFを保存';
    root.dataset.gifFrames = String(frames.length);
    root.dataset.gifBytes = String(bytes.length);
    updateSaveLinkState();
    sayToast(`GIFを撮影しました（${(frames.length / GIF_FPS).toFixed(1)}秒）`);
    focusVisible('#savePng');
  } catch (error) {
    if (generation !== downloadGeneration) return;
    updateSaveLinkState();
    say('GIFを作れませんでした。撮り直してください。', { visible: true });
  }
}
captureButton.addEventListener('pointerdown', (event) => {
  holdFired = false;
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
  let seen = false;
  try { seen = localStorage.getItem('pixieed:camera-gestures:v1') === '1'; localStorage.setItem('pixieed:camera-gestures:v1', '1'); } catch { seen = false; }
  if (seen) return;
  const hint = $('#gestureHint'); hint.hidden = false;
  window.setTimeout(() => { hint.hidden = true; }, 4200);
}

$('#capture').addEventListener('click', () => {
  if (holdFired) { holdFired = false; return; } // the hold already recorded a GIF
  const { action } = deriveCameraPrimaryAction({ mode: state.mode, hasResult: Boolean(state.result), error: state.error, workerUnavailable: Boolean(workerUnavailable) });
  if (action === 'retake') retake();
  else if (action === 'reload') location.reload();
  else if (action === 'retry') void startCamera();
  else if (action === 'resume') void startCamera();
  else if (action === 'capture') capture();
});
$('#stopCamera').addEventListener('click', () => closeCamera({ message: 'カメラを閉じました。', focus: true }));
$('#savePng').addEventListener('click', (event) => {
  if ($('#savePng').getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
  sayToast('PNGの保存を開始しました。');
});

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

root.dataset.ready = 'false';
fitPreview();
setMode('loading');
resumeCameraIfVisible();
