import { createFrameLoop } from './frame-loop.mjs';
import { FRAME_RATIOS, OUTPUT_SIZES, resolveAspect, centerCrop, frameGeometry, fitFrame } from './framing.mjs';
import { cameraStartErrorMessage, deriveCameraPrimaryAction } from './camera-ui-state.mjs';

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
const worker = new Worker(new URL('./preview-worker.mjs?v=20260924-lighting-1', import.meta.url), { type: 'module' });
const EDGE_CAP = 640;
let activeStream = null;
let cameraSequence = 0;
let renderSequence = 0;
let paletteEpoch = 0;
let previewAspect = 0;
let requestId = 0;
let pendingWorker = null;
let workerUnavailable = null;
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

const state = { mode: 'idle', facing: 'environment', result: null, error: '', ratio: 'screen', size: 256 };

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
  $('#outputSummary').textContent = `${dimensions.width} × ${dimensions.height} px · PNG`;
  root.dataset.framing = state.ratio;
  root.dataset.outputSize = String(state.size);
  $('#imageSettings').setAttribute('aria-label', state.mode === 'captured'
    ? `撮影画像 ${dimensions.width} × ${dimensions.height} ピクセル`
    : `撮影サイズを変更、${ratio.label}、長辺 ${state.size} ピクセル`);
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
  worker.postMessage({ type: 'cancel', session: renderSequence++ });
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
  const nativeWidth = video.videoWidth;
  const nativeHeight = video.videoHeight;
  const output = frameGeometry(currentAspect(), state.size);
  const aspect = output.width / output.height;
  const crop = centerCrop(nativeWidth, nativeHeight, aspect);
  // Integer multiples avoid rounding the short edge twice (source then output).
  const samplesPerPixel = Math.max(1, Math.floor(EDGE_CAP / state.size));
  const width = output.width * samplesPerPixel;
  const height = output.height * samplesPerPixel;
  if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
    sourceCanvas.width = width; sourceCanvas.height = height;
  }
  sourceContext.imageSmoothingEnabled = false;
  sourceContext.save();
  if (state.facing === 'user') {
    sourceContext.translate(width, 0);
    sourceContext.scale(-1, 1);
  }
  sourceContext.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  sourceContext.restore();
  const image = sourceContext.getImageData(0, 0, width, height);
  return { width, height, data: image.data, aspect };
}

function requestWorker(frame, signal) {
  if (workerUnavailable) return Promise.reject(workerUnavailable);
  const id = ++requestId;
  const requestedPaletteEpoch = paletteEpoch;
  const transferFrame = { width: frame.width, height: frame.height, data: frame.data };
  return new Promise((resolve, reject) => {
    const cancel = () => worker.postMessage({ type: 'cancel', requestId: id });
    signal?.addEventListener('abort', cancel, { once: true });
    const settle = (callback) => (value) => {
      signal?.removeEventListener('abort', cancel);
      callback(value);
    };
    pendingWorker = { id, resolve: settle((result) => resolve(
      requestedPaletteEpoch === paletteEpoch && result ? { ...result, aspect: frame.aspect } : null
    )), reject: settle(reject) };
    try {
      worker.postMessage({
        requestId: id,
        frame: transferFrame,
        session: renderSequence,
        size: state.size,
        paletteEpoch
      }, [transferFrame.data.buffer]);
    } catch (error) {
      const pending = pendingWorker;
      pendingWorker = null;
      pending.reject(error);
    }
  });
}
worker.addEventListener('message', (event) => {
  const message = event.data ?? {};
  if (!pendingWorker || message.requestId !== pendingWorker.id) return;
  if (message.type === 'progress') {
    if (!previewReady && state.mode === 'live') say('写真の境界を調べる準備をしています…');
    return;
  }
  const pending = pendingWorker;
  pendingWorker = null;
  if (message.cancelled) pending.resolve(null);
  else if (message.error) pending.reject(new Error(message.error));
  else if (!message.result?.data || !message.result.width || !message.result.height) pending.reject(new Error('変換結果が不正です'));
  else pending.resolve(message.result);
});
worker.addEventListener('error', (event) => {
  workerUnavailable = new Error(event.message || '画像変換を開始できませんでした');
  if (state.mode === 'live') { state.error = 'worker'; setInfoForMode('live'); }
  updatePrimaryAction();
  pendingWorker?.reject(workerUnavailable);
  pendingWorker = null;
  loop?.stop();
  say('カメラ変換を開始できません。ページを再読み込みしてください。', { visible: true });
});
worker.addEventListener('messageerror', () => {
  workerUnavailable = new Error('画像変換の結果を読み込めませんでした');
  if (state.mode === 'live') { state.error = 'worker'; setInfoForMode('live'); }
  updatePrimaryAction();
  pendingWorker?.reject(workerUnavailable);
  pendingWorker = null;
  loop?.stop();
  say('カメラ変換を開始できません。ページを再読み込みしてください。', { visible: true });
});

loop = createFrameLoop({
  captureFrame: async () => cameraFrame(),
  processFrame: async (source, { signal }) => {
    if (signal.aborted) return null;
    return requestWorker(source, signal);
  },
  publishFrame: (result) => {
    if (state.mode === 'live') {
      try {
        const wasError = Boolean(state.error);
        drawCompleted(result);
        const previewMessage = result.aiStatus === 'ready' || result.aiStatus === 'processing' ? ''
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
  intervalMs: 100,
  minDelayMs: 16
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

function refreshPalette() {
  if (state.mode !== 'live') return;
  paletteEpoch++;
  root.dataset.paletteEpoch = String(paletteEpoch);
  captureFrame.classList.remove('pc-palette-refresh');
  requestAnimationFrame(() => captureFrame.classList.add('pc-palette-refresh'));
  window.setTimeout(() => captureFrame.classList.remove('pc-palette-refresh'), 360);
}

view.addEventListener('click', refreshPalette);
view.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
    event.preventDefault();
    refreshPalette();
  }
});

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
  let canvas;
  try {
    canvas = document.createElement('canvas');
    canvas.width = frozen.width;
    canvas.height = frozen.height;
    canvas.getContext('2d').putImageData(new ImageData(frozen.data, frozen.width, frozen.height), 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNGを作成できませんでした')), 'image/png'));
    if (generation !== downloadGeneration || state.mode !== 'captured' || state.result !== frozen) return;
    downloadUrl = URL.createObjectURL(blob);
    const link = $('#savePng');
    link.href = downloadUrl;
    link.download = `pixieed-pixel-camera-${frozen.width}x${frozen.height}.png`;
    updateSaveLinkState();
    sayToast('撮影しました。PNGを保存できます。');
    focusVisible('#savePng');
  } catch (error) {
    if (generation !== downloadGeneration || state.mode !== 'captured' || state.result !== frozen) return;
    updateSaveLinkState();
    info.textContent = 'PNGを準備できませんでした。撮り直してもう一度お試しください。';
    say(error instanceof Error ? error.message : 'PNGを保存できませんでした。', { visible: true });
  } finally {
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

settingsPanel.addEventListener('toggle', (event) => {
  if (event.newState === 'open') updateSizeSummary();
});
settingsPanel.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLSelectElement) || state.mode === 'captured') return;
  if (input.name === 'aspect' && FRAME_RATIOS.some((ratio) => ratio.value === input.value)) state.ratio = input.value;
  else if (input.name === 'pixels' && OUTPUT_SIZES.includes(Number(input.value))) state.size = Number(input.value);
  else return;
  restartPreview();
  fitPreview(state.result);
  updateSizeSummary();
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
