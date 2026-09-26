import { createFrameLoop } from '../pixel-studio/frame-loop.mjs';
import { encodeCameraPng, pngExportGeometry } from '../pixel-studio/png-export.mjs';
import { FRAME_RATIOS, OUTPUT_SIZES, resolveAspect, centerCrop, frameGeometry, fitFrame } from '../pixel-studio/framing.mjs?v=20260925-lens-sizes-1';
import { cameraStartErrorMessage, deriveCameraPrimaryAction } from '../pixel-studio/camera-ui-state.mjs';
import { CAMERA_SETTING_DEFAULTS, lensFrameFilter, lensPalette, processLensFrame, resetLensPalette, setLensSettings } from './engine.mjs?v=20260926-ux-1';
import { attachZoomGestures, formatZoom, splitZoom, zoomRange, zoomStops } from './zoom.mjs?v=20260926-ux-1';

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
  colorDepth: '4', paletteMode: 'gameboy', gradientMode: 'dither', surfaceSimplify: 55, camera: { ...CAMERA_SETTING_DEFAULTS }, zoom: 1 };
let zoomInfo = zoomRange(null); let appliedHardwareZoom = 1; let zoomApplyPending = false;
// 面のまとまり is automatic: it only calms dither speckle with 8-16 colours (measured: no change at 2-4 colours,
// heavy posterising at high strength), so it runs at PiXiEELENS's default 55 there and is skipped elsewhere.
const autoSurface = (depth) => (depth === '8' || depth === '16' ? 55 : 0);
// A little more punch than the raw camera by default; the tone sliders still read 0 at this standard look.
const BASE_TONE = { contrast: 15, saturation: 20 };
const withBaseTone = (camera) => { const out = { ...camera }; for (const [key, add] of Object.entries(BASE_TONE)) out[key] = Math.max(-100, Math.min(100, (out[key] ?? 0) + add)); return out; };
function syncLens() { setLensSettings({ colorDepth: state.colorDepth, paletteMode: state.paletteMode, gradientMode: state.gradientMode, surfaceSimplify: autoSurface(state.colorDepth), cameraSettings: withBaseTone(state.camera) }); }
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
  $('#flipCamera').disabled = mode !== 'live';
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
        const previewMessage = result.aiStatus === 'ready' || result.aiStatus === 'processing' || result.aiStatus === 'disabled' ? ''
          : result.aiStatus === 'no-instances' ? ''
          : 'この端末に合わせた画質で表示しています。';
        if (!previewReady || previousAiStatus !== result.aiStatus) {
          previewReady = true;
          setInfoForMode('live');
          say(previewMessage);
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
  const dither = settingsPanel.querySelector('input[name="dither"]'); if (dither) dither.checked = state.gradientMode === 'dither';
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
$('#looks').addEventListener('click', (event) => {
  const button = event.target.closest('[data-look]'); if (!button || state.mode === 'captured') return;
  Object.assign(state, LOOKS[button.dataset.look]);
  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  navigator.vibrate?.(8);
  applyChange();
  sayToast(button.textContent.trim());
});
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
  onTap: () => refreshObjects()
});
stage.addEventListener('keydown', (event) => {
  if (event.key === '+' || event.key === '=') setZoom(state.zoom * 1.25, { gesture: 'key' });
  else if (event.key === '-') setZoom(state.zoom / 1.25, { gesture: 'key' });
  else if (event.key === '0') setZoom(1, { gesture: 'key' });
  else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); refreshObjects(); }
});

$('#flipCamera').addEventListener('click', () => {
  lastFacing = state.facing === 'environment' ? 'user' : 'environment';
  void startCamera();
});
$('#capture').addEventListener('click', () => {
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
  suspendCamera();
  invalidateCaptureDownload();
});
window.addEventListener('pageshow', () => {
  // A captured frame can return through the back/forward cache after its URL was released.
  if (state.mode === 'captured' && state.result && !downloadUrl) {
    invalidateCaptureDownload();
    say('PNGを準備しています…', { visible: true });
    void prepareCaptureDownload(state.result);
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
