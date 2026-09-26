import { createBoundarySampler } from '../../js/pixel-studio/boundary-sampler.mjs';

const $ = (id) => document.getElementById(id);
const root = $('fourTonePreview');
const inputCanvas = $('inputCanvas');
const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true });
const originalContext = $('originalCanvas').getContext('2d');
const simplifiedContext = $('simplifiedCanvas').getContext('2d');
const resultContext = $('resultCanvas').getContext('2d');
const grayContext = $('grayCanvas').getContext('2d');
const still = $('stillSource');
const video = $('videoSource');
const photos = {
  astronaut: { type: 'image', path: '../../assets/pixel-studio/samples/astronaut.png', credit: 'NASA public domain' },
  coffee: { type: 'image', path: '../../assets/pixel-studio/samples/coffee.png', credit: 'Rachel Michetti CC0' },
  cat: { type: 'image', path: '../../assets/pixel-studio/samples/chelsea.png', credit: 'Stefan van der Walt CC0' },
  rocket: { type: 'image', path: '../../assets/pixel-studio/samples/rocket.jpg', credit: 'SpaceX public domain' },
  street: { type: 'video', path: '../../assets/pixel-studio/test-media/street.webm', credit: 'Amada44 CC BY-SA 3.0' },
  leaves: { type: 'video', path: '../../assets/pixel-studio/test-media/leaves.webm', credit: 'Undeka 11 CC BY-SA 4.0' }
};
let worker = null;
let activeMedia = photos.astronaut;
let session = 0;
let paletteEpoch = 0;
let geometryRevision = 0;
let requestId = 0;
let pending = null;
let loaded = false;
let playing = false;
let renderFinalFrame = false;
let repeatRemaining = 0;
let repeatTotal = 0;
let timer = 0;
let previous = null;
let measurements = null;
let lastFrame = null;
let lastResult = null;

function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').dataset.kind = error ? 'error' : 'normal';
  root.dataset.state = error ? 'error' : loaded ? 'ready' : 'loading';
}
function resetMeasurements() {
  measurements = { frames: 0, staticComparisons: 0, maxStaticDifferencePercent: 0,
    lastStaticDifferencePercent: null, maskTransitionComparisons: 0,
    maxMaskTransitionDifferencePercent: 0, repeatedInputFrames: 0,
    workerMsTotal: 0, workerMsMax: 0, framesWithMask: 0, aiJobs: 0,
    videoPaletteChanges: 0, lastPaletteRevision: null };
  previous = null;
  $('frameCount').textContent = '0';
  $('staticDifference').textContent = '—';
  $('maskTransitionDifference').textContent = '—';
  $('workerMeanMax').textContent = '—';
  $('aiCounts').textContent = '—';
  $('videoPaletteChanges').textContent = '—';
  $('diagnostics').textContent = '{}';
}
function clearCanvases() {
  for (const id of ['originalCanvas', 'simplifiedCanvas', 'resultCanvas', 'grayCanvas']) {
    const canvas = $(id);
    canvas.width = 1;
    canvas.height = 1;
  }
  $('sourceSize').textContent = '—';
  $('resultSize').textContent = '—';
  $('simplifiedSize').textContent = '—';
  $('paletteSwatches').replaceChildren();
}
function cancelSession() {
  clearTimeout(timer);
  if (worker && session) worker.postMessage({ type: 'cancel', session });
  pending = null;
  playing = false;
  renderFinalFrame = false;
  repeatRemaining = 0;
  $('playButton').textContent = '再生';
  $('repeatButton').disabled = false;
}
function ensureWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../../js/pixel-studio/boundary-preview-worker.mjs?v=20260925-lens-camera-4', import.meta.url), { type: 'module' });
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', (event) => setStatus(`ワーカーを起動できません: ${event.message || '読み込みに失敗しました'}`, true));
    worker.addEventListener('messageerror', () => setStatus('ワーカーの結果を読み取れませんでした。', true));
  } catch (error) {
    setStatus(`ワーカーを起動できません: ${error.message}`, true);
  }
  return worker;
}
function currentSource() { return activeMedia.type === 'video' ? video : still; }
function sourceDimensions() {
  const source = currentSource();
  return activeMedia.type === 'video'
    ? [source.videoWidth, source.videoHeight]
    : [source.naturalWidth, source.naturalHeight];
}
function makeFrame() {
  const [sourceWidth, sourceHeight] = sourceDimensions();
  if (!sourceWidth || !sourceHeight || (activeMedia.type === 'video' && (video.readyState < 2 || video.seeking))) return null;
  const lens = $('renderModeSelect').value === 'lens';
  const scale = Math.min(1, (lens ? Number($('sizeSelect').value) : 640) / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  if (inputCanvas.width !== width || inputCanvas.height !== height) {
    inputCanvas.width = width;
    inputCanvas.height = height;
  }
  inputContext.imageSmoothingEnabled = lens;
  inputContext.imageSmoothingQuality = 'high';
  inputContext.drawImage(currentSource(), 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  const image = inputContext.getImageData(0, 0, width, height);
  const sampled = lens ? image : createBoundarySampler({ size: Number($('sizeSelect').value) }).render(image);
  drawImageData($('originalCanvas'), originalContext, sampled);
  $('sourceSize').textContent = `${width} × ${height}`;
  lastFrame = { width, height, data: new Uint8ClampedArray(image.data), mediaTime: activeMedia.type === 'video' ? video.currentTime : null };
  return lastFrame;
}
function copyFrame(frame) {
  return { width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data) };
}
function requestFrame(frame = lastFrame) {
  if (!worker || !frame || pending || !loaded) return false;
  const id = ++requestId;
  const size = Number($('sizeSelect').value);
  const renderMode = $('renderModeSelect').value;
  const job = { id, session, paletteEpoch, geometryRevision, size, renderMode, frame, sentAt: performance.now(), mediaTime: activeMedia.type === 'video' ? video.currentTime : null };
  pending = job;
  const transferredFrame = copyFrame(frame);
  try {
    worker.postMessage({ requestId: id, session, paletteEpoch, size, renderMode, diagnostics: true,
      lensSettings: renderMode === 'lens' ? { colorDepth: '24', dither: 'selective', surfaceSimplify: 55, legacyTone: true } : undefined,
      frame: transferredFrame }, [transferredFrame.data.buffer]);
  } catch (error) {
    pending = null;
    setStatus(`ワーカーへフレームを送れませんでした: ${error.message}`, true);
    finishRepeat(false);
    return false;
  }
  return true;
}
function drawImageData(canvas, context, frame) {
  canvas.width = frame.width;
  canvas.height = frame.height;
  context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
}
function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function differencePercent(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let changed = 0, pixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    pixels++;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
  }
  return pixels ? changed * 100 / pixels : 0;
}
function srgbToLinear(value) {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(value) {
  const v = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
function grayscale(frame) {
  const data = new Uint8ClampedArray(frame.data);
  for (let p = 0; p < data.length; p += 4) {
    const y = 0.2126 * srgbToLinear(data[p]) + 0.7152 * srgbToLinear(data[p + 1]) + 0.0722 * srgbToLinear(data[p + 2]);
    const value = linearToSrgb(y);
    data[p] = data[p + 1] = data[p + 2] = value;
  }
  return { width: frame.width, height: frame.height, data };
}
function decodedGrayMetrics(frame) {
  const codes = new Set();
  const groups = new Set();
  let errors = 0, maximumError = 0;
  const targets = [24, 144, 192, 240];
  for (let p = 0; p < frame.data.length; p += 4) {
    const [r, g, b] = frame.data.subarray(p, p + 3);
    const gray = linearToSrgb(0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b));
    codes.add(gray);
    let nearest = 0, error = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const distance = Math.abs(gray - targets[i]);
      if (distance < error) { nearest = i; error = distance; }
    }
    if (error <= 1) groups.add(nearest);
    else errors++;
    maximumError = Math.max(maximumError, error);
  }
  return { codes: [...codes].sort((a, b) => a - b), groups: groups.size, errors, maximumError };
}
function rgbKey(rgb) { return Array.isArray(rgb) ? rgb.slice(0, 3).join(',') : ''; }
function updateSwatches(palette) {
  if (!Array.isArray(palette)) return;
  $('paletteSwatches').replaceChildren(...palette.map((rgb) => {
    const swatch = document.createElement('span');
    swatch.style.backgroundColor = `rgb(${rgbKey(rgb)})`;
    swatch.title = rgbKey(rgb);
    swatch.setAttribute('aria-label', `rgb ${rgbKey(rgb)}`);
    return swatch;
  }));
}
function onWorkerMessage({ data }) {
  if (data.type === 'progress') return;
  if (!pending || data.requestId !== pending.id) return;
  const job = pending;
  pending = null;
  if (job.session !== session) return;
  if (job.paletteEpoch !== paletteEpoch || job.geometryRevision !== geometryRevision) {
    // A refresh or size change may arrive while the worker is busy. Drop the
    // stale result, then launch the newest frame/settings without queueing it.
    scheduleFrame(0, activeMedia.type === 'video' ? null : lastFrame);
    return;
  }
  if (data.pending) {
    setStatus('動画フレームの準備を待っています。再生後に自動で続行します。');
    if (playing && activeMedia.type === 'video') scheduleFrame(100);
    return;
  }
  if (data.cancelled && !data.result && !data.error) {
    if (playing && activeMedia.type === 'video') scheduleFrame(100);
    return;
  }
  if (data.error || !data.result) {
    setStatus(data.error || 'ワーカーから出力がありません。', true);
    finishRepeat(false);
    return;
  }
  publish(job, data.result);
  finishRepeat(true);
  if (renderFinalFrame && activeMedia.type === 'video') {
    renderFinalFrame = false;
    scheduleFrame(0);
  } else if (playing && activeMedia.type === 'video') scheduleFrame(100);
}
function publish(job, result) {
  const frame = { width: result.width, height: result.height, data: result.data };
  if (result.sourceSimplified) {
    drawImageData($('simplifiedCanvas'), simplifiedContext, result.sourceSimplified);
    $('simplifiedSize').textContent = `${result.sourceSimplified.width} × ${result.sourceSimplified.height}`;
  }
  drawImageData($('resultCanvas'), resultContext, frame);
  drawImageData($('grayCanvas'), grayContext, grayscale(frame));
  $('resultSize').textContent = `${result.width} × ${result.height}`;
  updateSwatches(result.palette);

  const distinctColors = new Set();
  for (let p = 0; p < result.data.length; p += 4) distinctColors.add(`${result.data[p]},${result.data[p + 1]},${result.data[p + 2]}`);
  const gray = decodedGrayMetrics(frame);
  const paletteCount = Array.isArray(result.palette) ? result.palette.length : distinctColors.size;
  const stats = result.stats || {};
  const dithered = Number(stats.ditheredCells ?? stats.ditherCells ?? 0);
  const cellCount = result.width * result.height;
  const unchangedInput = previous && sameBytes(previous.input, job.frame.data);
  const difference = unchangedInput ? differencePercent(previous.output, result.data) : null;
  const aiStatus = result.aiStatus || 'unknown';
  const inferenceJobs = Number(result.inference?.objectJobs ?? 0);
  const instanceCount = Number(result.instanceCount ?? 0);
  const maskStateChanged = Boolean(unchangedInput && previous &&
    (previous.aiStatus !== aiStatus || previous.instanceCount !== instanceCount || previous.inferenceJobs !== inferenceJobs));
  if (difference !== null && maskStateChanged) {
    measurements.maskTransitionComparisons++;
    measurements.maxMaskTransitionDifferencePercent = Math.max(measurements.maxMaskTransitionDifferencePercent, difference);
  } else if (difference !== null) {
    measurements.staticComparisons++;
    measurements.repeatedInputFrames++;
    measurements.lastStaticDifferencePercent = difference;
    measurements.maxStaticDifferencePercent = Math.max(measurements.maxStaticDifferencePercent, difference);
  }
  previous = { input: new Uint8ClampedArray(job.frame.data), output: new Uint8ClampedArray(result.data),
    aiStatus, instanceCount, inferenceJobs };
  measurements.frames++;
  const workerMs = Number(stats.workerProcessingMs ?? result.processingMs ?? performance.now() - job.sentAt);
  measurements.workerMsTotal += workerMs;
  measurements.workerMsMax = Math.max(measurements.workerMsMax, workerMs);
  if (aiStatus === 'ready') measurements.framesWithMask++;
  measurements.aiJobs = Math.max(measurements.aiJobs, inferenceJobs);
  const revision = stats.paletteRevision ?? null;
  if (activeMedia.type === 'video' && measurements.lastPaletteRevision !== null && revision !== measurements.lastPaletteRevision) {
    measurements.videoPaletteChanges++;
  }
  if (revision !== null) measurements.lastPaletteRevision = revision;

  $('colorCount').textContent = `${paletteCount} / 24`;
  $('grayGroups').textContent = job.renderMode === 'lens' ? '対象外' : `${gray.groups} / ${stats.globalToneLevels ?? 4}`;
  $('grayCodes').textContent = gray.codes.join(', ') || 'なし';
  $('grayErrors').textContent = job.renderMode === 'lens' ? '対象外' : `${gray.errors}（最大差 ${gray.maximumError}）`;
  $('workerTime').textContent = `${workerMs.toFixed(1)} ms`;
  $('workerMeanMax').textContent = `${(measurements.workerMsTotal / measurements.frames).toFixed(1)} / ${measurements.workerMsMax.toFixed(1)} ms`;
  $('aiStatus').textContent = `${aiStatus}${instanceCount ? ` · ${instanceCount}領域` : ''}`;
  $('aiCounts').textContent = `${measurements.framesWithMask} / ${measurements.aiJobs}`;
  $('ditherCells').textContent = `${dithered} / ${cellCount}`;
  $('backgroundSmoothedCells').textContent = String(stats.backgroundSmoothedCells ?? 0);
  $('backgroundFlattenedCells').textContent = String(stats.backgroundFlattenedCells ?? 0);
  $('frameCount').textContent = String(measurements.frames);
  $('staticDifference').textContent = difference === null ? '入力変化 / 初回' : maskStateChanged
    ? `別枠に計上（安定差 最大 ${measurements.maxStaticDifferencePercent.toFixed(4)}%）`
    : `${difference.toFixed(4)}%（最大 ${measurements.maxStaticDifferencePercent.toFixed(4)}%）`;
  $('maskTransitionDifference').textContent = `${measurements.maskTransitionComparisons}回 / 最大 ${measurements.maxMaskTransitionDifferencePercent.toFixed(4)}%`;
  $('paletteRevision').textContent = String(stats.paletteRevision ?? '—');
  $('videoPaletteChanges').textContent = activeMedia.type === 'video' ? String(measurements.videoPaletteChanges) : '動画のみ';
  if (job.mediaTime !== null) $('mediaTime').textContent = `${job.mediaTime.toFixed(2)} 秒`;
  lastResult = { paletteCount, distinctColors: distinctColors.size, grayGroups: gray.groups, grayCodes: gray.codes,
    grayToleranceErrors: gray.errors, grayMaximumTargetError: gray.maximumError,
    ditheredCells: dithered, backgroundSmoothedCells: stats.backgroundSmoothedCells ?? 0,
    backgroundFlattenedCells: stats.backgroundFlattenedCells ?? 0, cellCount, aiStatus, workerMs,
    paletteRevision: stats.paletteRevision ?? null, paletteLocked: stats.paletteLocked ?? null,
    globalToneLevels: stats.globalToneLevels ?? null, staticDifferencePercent: maskStateChanged ? null : difference,
    maskTransitionDifferencePercent: maskStateChanged ? difference : null,
    staticComparisons: measurements.staticComparisons, repeatedInputFrames: measurements.repeatedInputFrames,
    maxStaticDifferencePercent: measurements.maxStaticDifferencePercent,
    maskTransitionComparisons: measurements.maskTransitionComparisons,
    maxMaskTransitionDifferencePercent: measurements.maxMaskTransitionDifferencePercent,
    workerMeanMs: measurements.workerMsTotal / measurements.frames, workerMaxMs: measurements.workerMsMax,
    framesWithMask: measurements.framesWithMask, aiJobs: measurements.aiJobs,
    videoPaletteChanges: measurements.videoPaletteChanges };
  $('diagnostics').textContent = JSON.stringify({ media: $('mediaSelect').value, session, paletteEpoch,
    input: [job.frame.width, job.frame.height], output: [result.width, result.height], metrics: lastResult,
    stats, palette: result.palette || null, resourceOrigins: result.resourceOrigins || null }, null, 2);
  root.dataset.renderMode = job.renderMode;
  $('resultHeading').textContent = job.renderMode === 'lens' ? 'PiXiEELENS方式' : '以前の4階調';
  root.dataset.frames = String(measurements.frames);
  root.dataset.colors = String(paletteCount);
  root.dataset.grayGroups = String(gray.groups);
  root.dataset.aiStatus = result.aiStatus || 'unknown';
  root.dataset.staticDifference = difference === null ? '' : difference.toFixed(6);
  setStatus(`${activeMedia.credit} · ${result.aiStatus === 'ready' ? '物体認識を反映' : '現在フレームを描画'} · ${paletteCount}色`);
}
function finishRepeat(success) {
  if (repeatRemaining <= 0) return;
  if (!success) repeatRemaining = 0;
  else repeatRemaining--;
  if (repeatRemaining > 0 && !pending) scheduleFrame(20, lastFrame);
  else {
    $('repeatButton').disabled = false;
    $('repeatButton').textContent = `写真を30回再処理${repeatTotal ? `（${repeatTotal}回完了）` : ''}`;
    repeatTotal = 0;
  }
}
function scheduleFrame(delay = 100, frame = null) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (pending || !loaded) return;
    const next = frame || makeFrame();
    if (next) requestFrame(next);
  }, delay);
}
async function loadSelected() {
  cancelSession();
  const oldSession = session;
  session++;
  const loadSession = session;
  paletteEpoch = 0;
  const selectedMedia = photos[$('mediaSelect').value] || photos.astronaut;
  activeMedia = selectedMedia;
  loaded = false;
  resetMeasurements();
  clearCanvases();
  $('repeatButton').hidden = selectedMedia.type !== 'image';
  $('playButton').hidden = selectedMedia.type !== 'video';
  $('seekWrap').hidden = selectedMedia.type !== 'video';
  if (oldSession && worker) worker.postMessage({ type: 'cancel', session: oldSession });
  if (!ensureWorker()) return;
  setStatus('素材を読み込んでいます…');
  try {
    video.pause();
    if (selectedMedia.type === 'image') {
      video.removeAttribute('src'); video.load();
      still.src = new URL(selectedMedia.path, document.baseURI).href;
      await still.decode();
    } else {
      still.removeAttribute('src');
      await new Promise((resolve, reject) => {
        const clean = () => { video.removeEventListener('loadeddata', onReady); video.removeEventListener('error', onError); };
        const onReady = () => { clean(); resolve(); };
        const onError = () => { clean(); reject(new Error('動画を読み込めませんでした。')); };
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.src = new URL(selectedMedia.path, document.baseURI).href;
        video.load();
      });
      if (session !== loadSession) return;
      $('seekInput').max = String(video.duration || 1);
      $('mediaTime').textContent = `0.00 / ${video.duration.toFixed(2)} 秒`;
    }
    if (session !== loadSession) return;
    loaded = true;
    resetMeasurements();
    const first = makeFrame();
    if (first) requestFrame(first);
  } catch (error) {
    if (session === loadSession) setStatus(`${error.message} (${selectedMedia.path})`, true);
  }
}
function refreshPalette() {
  if (!loaded) return;
  paletteEpoch++;
  previous = null;
  $('paletteRevision').textContent = '更新中…';
  if (!pending) requestFrame(activeMedia.type === 'video' ? makeFrame() : lastFrame);
}
$('mediaSelect').addEventListener('change', loadSelected);
$('renderModeSelect').addEventListener('change', () => {
  if (!loaded) return;
  paletteEpoch++;
  geometryRevision++;
  previous = null;
  const frame = makeFrame();
  if (!pending && frame) requestFrame(frame);
});
$('sizeSelect').addEventListener('change', () => {
  if (!loaded) return;
  geometryRevision++;
  previous = null;
  const frame = makeFrame();
  if (!pending && frame) requestFrame(frame);
});
$('refreshButton').addEventListener('click', refreshPalette);
$('repeatButton').addEventListener('click', () => {
  if (!loaded || activeMedia.type !== 'image' || pending) return;
  repeatRemaining = 30;
  repeatTotal = 30;
  $('repeatButton').disabled = true;
  $('repeatButton').textContent = '同じ写真を再処理中…';
  requestFrame(lastFrame);
});
$('playButton').addEventListener('click', async () => {
  if (!loaded) return;
  try {
    if (video.paused) {
      if (video.ended) { video.currentTime = 0; paletteEpoch++; previous = null; }
      await video.play();
      playing = true;
      $('playButton').textContent = '一時停止';
      scheduleFrame(0);
    } else {
      video.pause();
      playing = false;
      $('playButton').textContent = '再生';
    }
  } catch (error) { setStatus(error.message, true); }
});
$('seekInput').addEventListener('input', () => {
  if (!loaded || activeMedia.type !== 'video') return;
  video.pause(); playing = false; $('playButton').textContent = '再生'; previous = null;
  video.currentTime = Number($('seekInput').value);
  video.addEventListener('seeked', () => { const frame = makeFrame(); if (frame && !pending) requestFrame(frame); }, { once: true });
});
video.addEventListener('timeupdate', () => {
  if (activeMedia.type !== 'video') return;
  $('seekInput').value = String(video.currentTime);
  $('mediaTime').textContent = `${video.currentTime.toFixed(2)} / ${video.duration.toFixed(2)} 秒`;
});
video.addEventListener('ended', () => {
  playing = false;
  $('playButton').textContent = '再生';
  if (pending) renderFinalFrame = true;
  else {
    const finalFrame = makeFrame();
    if (finalFrame) requestFrame(finalFrame);
  }
});
window.addEventListener('pagehide', () => { cancelSession(); worker?.terminate(); });
loadSelected();
