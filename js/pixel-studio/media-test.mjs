import { frameGeometry, centerCrop } from './framing.mjs';
import { grayLight } from './global-tones.mjs';

const $ = (id) => document.getElementById(id);
const root = $('mediaTest');
const image = $('stillSource');
const video = $('videoSource');
const input = document.createElement('canvas');
const inputContext = input.getContext('2d', { willReadFrequently: true });
const sourceContext = $('sourceView').getContext('2d');
const resultContext = $('resultView').getContext('2d');
const worker = new Worker(new URL('./preview-worker.mjs?v=20260924-lighting-1', import.meta.url), { type: 'module' });
const photoRoot = 'assets/pixel-studio/samples/';
const photoSource = 'https://scikit-image.org/docs/stable/api/skimage.data.html';
const media = [
  { id: 'astronaut', label: '写真 · 人物', type: 'image', src: photoRoot + 'astronaut.png', credit: 'NASA · Public domain', sourceUrl: photoSource },
  { id: 'chelsea', label: '写真 · 猫', type: 'image', src: photoRoot + 'chelsea.png', credit: 'Stefan van der Walt · CC0', sourceUrl: photoSource },
  { id: 'coffee', label: '写真 · カップ', type: 'image', src: photoRoot + 'coffee.png', credit: 'Rachel Michetti · CC0', sourceUrl: photoSource },
  { id: 'rocket', label: '写真 · ロケットと風景', type: 'image', src: photoRoot + 'rocket.jpg', credit: 'SpaceX · Public domain', sourceUrl: photoSource }
];
let selected = media[0];
let session = 0;
let paletteEpoch = 0;
let requestId = 0;
let pending = null;
let loaded = false;
let loadController = null;
let failed = false;
let timer = null;
let previous = null;
let lastVideoTime = -1;
let measurements;
let lastDiagnostics = null;
let lastPublished = null;
const round = (v, digits = 2) => Number.isFinite(v) ? Number(v.toFixed(digits)) : null;
const time = (v) => `${Math.floor((v || 0) / 60)}:${((v || 0) % 60).toFixed(1).padStart(4, '0')}`;

function status(message, error = false) {
  $('status').textContent = message;
  $('status').dataset.kind = error ? 'error' : 'normal';
}
function resetMeasurements() {
  measurements = { frames: 0, started: performance.now(), processingTotal: 0, processingMax: 0, aiReadyFrames: 0, faceReadyFrames: 0, maxStaticChangePercent: 0, lastStaticChangePercent: null, staticComparisons: 0, aiStatusCounts: {}, faceStatusCounts: {}, maxColors: 0, maxMaterialColors: 0, maxLines: 0, nonOpaqueFrames: 0, paletteChanges: 0, paletteKey: null, largeStaticChanges: [], timeline: [] };
}
function reset(keepAi = false) {
  if (!keepAi) {
    worker.postMessage({ type: 'cancel', session });
    session++;
  }
  pending = null;
  previous = null;
  lastPublished = null;
  lastDiagnostics = null;
  for (const id of ['sourceView', 'resultView']) { $(id).width = 1; $(id).height = 1; }
  for (const id of ['sourceDimensions', 'outputDimensions', 'frameCount', 'fps', 'processTime', 'aiTime', 'colorCount', 'materialColors', 'toneInfo', 'faceInfo', 'objectInfo', 'lineCount', 'staticChange', 'ditherCoverage']) $(id).textContent = '—';
  $('diagnostics').textContent = '{}';
  lastVideoTime = -1;
  resetMeasurements();
}
function renderOptions() {
  const value = $('mediaSelect').value;
  $('mediaSelect').replaceChildren(...media.map((m) => new Option(m.label, m.id)));
  if (media.some((m) => m.id === value)) $('mediaSelect').value = value;
}
function credit() {
  const link = document.createElement('a');
  link.href = selected.sourceUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = selected.credit;
  $('credit').replaceChildren(link);
  if (selected.licenseUrl) {
    const license = document.createElement('a');
    license.href = selected.licenseUrl; license.target = '_blank'; license.rel = 'noopener'; license.textContent = selected.license;
    $('credit').append(' · ', license, ' ／ 右は縮小・減色・細線整形した結果（同ライセンス）');
  }
}
async function loadSelected() {
  loaded = false; failed = false;
  loadController?.abort();
  loadController = new AbortController();
  const loadSignal = loadController.signal;
  video.pause();
  paletteEpoch++;
  reset();
  const ownSession = session;
  selected = media.find((m) => m.id === $('mediaSelect').value) || media[0];
  $('videoControls').hidden = selected.type !== 'video';
  $('playToggle').textContent = '再生';
  $('seek').value = '0'; $('timeReadout').textContent = '0:00 / 0:00';
  credit(); status('素材を読み込んでいます…');
  try {
    if (selected.type === 'image') {
      video.removeAttribute('src'); video.load();
      image.src = selected.src;
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        const cleanup = () => { video.removeEventListener('loadeddata', ready); video.removeEventListener('error', error); loadSignal.removeEventListener('abort', aborted); };
        const aborted = () => { cleanup(); reject(new DOMException('素材を切り替えました', 'AbortError')); };
        const ready = () => { cleanup(); resolve(); };
        const error = () => { cleanup(); reject(new Error('動画を読み込めませんでした。')); };
        loadSignal.addEventListener('abort', aborted, { once: true });
        video.addEventListener('loadeddata', ready, { once: true });
        video.addEventListener('error', error, { once: true });
        video.src = selected.src; video.load();
      });
      $('seek').max = String(video.duration || 1);
    }
    if (session !== ownSession) return;
    loaded = true;
    status('同じフレームを処理しています。AIの準備中も比較できます。');
    tick();
  } catch (e) { if (session === ownSession) { failed = true; status(e.message, true); } }
}
function makeFrame() {
  const source = selected.type === 'video' ? video : image;
  if (selected.type === 'video' && (video.readyState < 2 || video.seeking)) return null;
  const nw = source.videoWidth || source.naturalWidth;
  const nh = source.videoHeight || source.naturalHeight;
  const ratio = $('aspectSelect').value;
  const parts = ratio.split(':').map(Number);
  const aspect = ratio === 'source' ? nw / nh : parts[0] / parts[1];
  const size = Number($('sizeSelect').value);
  const geometry = frameGeometry(aspect, size);
  const samples = Math.max(1, Math.floor(640 / size));
  const width = geometry.width * samples, height = geometry.height * samples;
  const crop = centerCrop(nw, nh, geometry.width / geometry.height);
  if (input.width !== width || input.height !== height) { input.width = width; input.height = height; }
  inputContext.imageSmoothingEnabled = false;
  inputContext.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  return inputContext.getImageData(0, 0, width, height);
}
function schedule(delay = 100) { clearTimeout(timer); timer = setTimeout(tick, delay); }
function tick() {
  clearTimeout(timer);
  if (!loaded || failed || pending || document.hidden) { schedule(); return; }
  try {
    const t = selected.type === 'video' ? video.currentTime : null;
    if (t !== null && lastVideoTime >= 0 && t < lastVideoTime - 0.02) reset();
    const frame = makeFrame();
    if (!frame) { schedule(); return; }
    lastVideoTime = t ?? -1;
    const id = ++requestId;
    pending = { id, session, paletteEpoch, frame, mediaTime: t, sentAt: performance.now(), paused: video.paused };
    const copy = new Uint8ClampedArray(frame.data);
    worker.postMessage({ requestId: id, session, paletteEpoch, size: Number($('sizeSelect').value), ...currentTone(), diagnostics: true, frame: { width: frame.width, height: frame.height, data: copy } }, [copy.buffer]);
  } catch (e) { pending = null; failed = true; status(e.message, true); }
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  const av = new Uint32Array(a.buffer, a.byteOffset, a.length / 4), bv = new Uint32Array(b.buffer, b.byteOffset, b.length / 4);
  for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
  return true;
}
function changePercent(a, b) {
  if (a.length !== b.length) return null;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++;
  return 100 * count / (a.length / 4);
}
function draw(canvas, context, data) {
  if (canvas.width !== data.width || canvas.height !== data.height) { canvas.width = data.width; canvas.height = data.height; }
  context.putImageData(data, 0, 0);
}
function currentTone() {
  const [toneLevels, dither] = $('toneSelect').value.split(':');
  return { toneLevels: Number(toneLevels), dither };
}
function grayDisplay(data) {
  const pixels = new Uint8ClampedArray(data.data);
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(grayLight(pixels[i], pixels[i + 1], pixels[i + 2]));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
  }
  return new ImageData(pixels, data.width, data.height);
}
function drawPublished() {
  if (!lastPublished) return;
  const { job, result } = lastPublished;
  const gray = $('grayView').checked;
  draw($('sourceView'), sourceContext, gray ? grayDisplay(job.frame) : job.frame);
  const output = new ImageData(result.data, result.width, result.height);
  draw($('resultView'), resultContext, gray ? grayDisplay(output) : output);
}
function publish(job, result) {
  lastPublished = { job, result };
  drawPublished();
  $('sourceDimensions').textContent = `${job.frame.width} × ${job.frame.height}`;
  $('outputDimensions').textContent = `${result.width} × ${result.height}`;
  const m = measurements;
  const paletteKey = JSON.stringify(result.palette);
  if (m.paletteKey !== null && m.paletteKey !== paletteKey) m.paletteChanges++;
  if (m.paletteKey !== paletteKey) {
    $('paletteSwatches').replaceChildren(...result.palette.map((rgb) => {
      const swatch = document.createElement('span');
      swatch.style.backgroundColor = `rgb(${rgb.join(',')})`;
      swatch.title = rgb.join(', ');
      return swatch;
    }));
  }
  m.paletteKey = paletteKey;
  $('paletteInfo').textContent = `配色固定 · ${result.palette.length}色 · 更新 ${result.stats.paletteRevision ?? '—'} · 自動変更 ${m.paletteChanges}回`;
  if (m.frames === 0) m.started = performance.now();
  m.frames++; m.processingTotal += result.processingMs; m.processingMax = Math.max(m.processingMax, result.processingMs);
  m.aiReadyFrames += result.aiStatus === 'ready' ? 1 : 0;
  m.faceReadyFrames += result.faceStatus === 'ready' ? 1 : 0;
  m.aiStatusCounts[result.aiStatus] = (m.aiStatusCounts[result.aiStatus] || 0) + 1;
  m.faceStatusCounts[result.faceStatus] = (m.faceStatusCounts[result.faceStatus] || 0) + 1;
  m.maxColors = Math.max(m.maxColors, result.palette.length);
  m.maxMaterialColors = Math.max(m.maxMaterialColors, result.stats.maxMaterialColors || 0);
  m.maxLines = Math.max(m.maxLines, result.stats.straightLineCount || 0);
  for (let i = 3; i < result.data.length; i += 4) if (result.data[i] !== 255) { m.nonOpaqueFrames++; break; }
  const identical = previous && previous.frame.width === job.frame.width && previous.frame.height === job.frame.height && sameBytes(previous.frame.data, job.frame.data);
  const changed = identical ? changePercent(previous.data, result.data) : null;
  if (changed !== null) { m.staticComparisons++; m.lastStaticChangePercent = changed; m.maxStaticChangePercent = Math.max(m.maxStaticChangePercent, changed); }
  if (changed > 1) {
    m.largeStaticChanges.push({ frame: m.frames, percent: round(changed, 4), beforeAi: previous.aiStatus, ai: result.aiStatus, beforeFace: previous.faceStatus, face: result.faceStatus });
    if (m.largeStaticChanges.length > 30) m.largeStaticChanges.shift();
  }
  previous = { frame: job.frame, data: result.data, aiStatus: result.aiStatus, faceStatus: result.faceStatus };
  const elapsed = (performance.now() - m.started) / 1000;
  const fps = elapsed > 0 ? (m.frames - 1) / elapsed : 0;
  $('frameCount').textContent = String(m.frames);
  $('fps').textContent = round(fps) + ' fps';
  $('processTime').textContent = round(result.processingMs, 1) + ' ms';
  $('aiTime').textContent = result.aiProcessingMs == null ? '待機中' : round(result.aiProcessingMs) + ' ms';
  $('ditherCoverage').textContent = round(result.stats.ditherCoveragePercent || 0, 2) + '%';
  const tone = currentTone();
  const actualToneLevels = result.stats.globalToneLevels;
  const actualGrayLevels = result.stats.globalGrayLevels;
  const colorLimit = result.stats.colorLimit ?? 24;
  $('toneInfo').textContent = `${tone.toneLevels}段階・${tone.dither === 'ordered' ? 'ディザ' : '面のみ'} ／ 実 ${actualToneLevels ?? '未計測'}段階${Array.isArray(actualGrayLevels) ? `・${actualGrayLevels.join('・')}` : ''}`;
  $('colorCount').textContent = `${result.palette.length} / ${colorLimit}`;
  $('materialColors').textContent = String(result.stats.maxMaterialColors);
  $('faceInfo').textContent = `${result.faceCount || 0} · ${result.faceStatus}`;
  $('objectInfo').textContent = `${result.instanceCount || 0} · ${result.aiStatus}`;
  $('lineCount').textContent = String(result.stats.straightLineCount || 0);
  $('staticChange').textContent = changed === null ? '入力が変化 / 初回' : round(changed, 4) + '%';
  if (job.mediaTime !== null) { $('seek').value = String(job.mediaTime); $('timeReadout').textContent = `${time(job.mediaTime)} / ${time(video.duration)}`; }
  if (m.frames === 1 || m.frames % 10 === 0) {
    m.timeline.push({ frame: m.frames, time: round(job.mediaTime), ai: result.aiStatus, face: result.faceStatus, lines: result.stats.straightLineCount, staticChangePercent: round(changed, 4) });
    if (m.timeline.length > 180) m.timeline.shift();
  }
  lastDiagnostics = { toneMode: `${tone.toneLevels}:${tone.dither}`, requestedToneLevels: tone.toneLevels, actualGlobalToneLevels: actualToneLevels ?? null, actualGlobalGrayLevels: Array.isArray(actualGrayLevels) ? actualGrayLevels : null, maxPaletteGrayError: result.stats.maxPaletteGrayError ?? null, grayscaleViewEnabled: $('grayView').checked, palette: result.palette, paletteEpoch, paletteChangesWithinEpoch: m.paletteChanges, media: selected.id, session, sourceTime: round(job.mediaTime, 3), input: [job.frame.width, job.frame.height], output: [result.width, result.height], fps: round(fps), elapsedSeconds: round(elapsed), processingMs: round(result.processingMs), processingMeanMs: round(m.processingTotal / m.frames), processingMaxMs: round(m.processingMax), aiStatus: result.aiStatus, aiProcessingMs: round(result.aiProcessingMs), aiReadyFrames: m.aiReadyFrames, aiStatusCounts: m.aiStatusCounts, instanceCount: result.instanceCount, maskAgeMs: result.maskAgeMs, maskCoverage: result.maskCoverage, maskInvalidation: result.maskInvalidation, faceStatus: result.faceStatus, faceCount: result.faceCount, faceReadyFrames: m.faceReadyFrames, faceStatusCounts: m.faceStatusCounts, faceProcessingMs: result.faceProcessingMs, stats: Object.fromEntries(Object.entries(result.stats).filter(([key]) => key !== 'overBudgetLabels')), largeStaticChanges: m.largeStaticChanges, frames: m.frames, maxColors: m.maxColors, maxMaterialColors: m.maxMaterialColors, maxLines: m.maxLines, nonOpaqueFrames: m.nonOpaqueFrames, identicalInput: Boolean(identical), staticComparisons: m.staticComparisons, staticChangePercent: round(changed, 5), maxStaticChangePercent: round(m.maxStaticChangePercent, 5), resourceOrigins: result.resourceOrigins, aiFailure: result.aiFailureReason, faceFailure: result.faceFailure, inference: result.inference, timeline: m.timeline };
  $('diagnostics').textContent = JSON.stringify(lastDiagnostics, null, 2);
  root.dataset.frames = String(m.frames); root.dataset.media = selected.id;
  status(result.aiStatus === 'ready' ? '物体認識を反映中。元画像と変換結果は同じ時刻です。' : '共通変換を表示中。物体認識の結果はまだ反映されていません。');
}
worker.addEventListener('message', ({ data }) => {
  if (data.type === 'progress' || !pending || data.requestId !== pending.id) return;
  const job = pending; pending = null;
  if (job.session === session && job.paletteEpoch === paletteEpoch && !data.cancelled) {
    if (data.error || !data.result) { failed = true; status(data.error || '変換結果を取得できませんでした。', true); }
    else { try { publish(job, data.result); } catch (e) { failed = true; status(e.message, true); } }
  }
  schedule(Math.max(16, 100 - (performance.now() - job.sentAt)));
});
function workerError(event) { pending = null; failed = true; status(event.message || '画像処理を停止しました。再読み込みしてください。', true); }
worker.addEventListener('error', workerError); worker.addEventListener('messageerror', workerError);
function refreshPalette() {
  if (!loaded || failed) return;
  paletteEpoch++;
  previous = null;
  resetMeasurements();
  status('この画面の色を取り直しています…');
  tick();
}
for (const id of ['sourceView', 'resultView']) {
  $(id).addEventListener('click', refreshPalette);
  $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refreshPalette(); } });
}
$('mediaSelect').addEventListener('change', loadSelected);
$('toneSelect').addEventListener('change', () => {
  if (!loaded || failed) return;
  reset(true);
  paletteEpoch++;
  $('paletteSwatches').replaceChildren();
  $('paletteInfo').textContent = '階調設定に合わせて配色を取得中';
  status('階調設定を反映しています…');
  tick();
});
$('grayView').addEventListener('change', () => {
  drawPublished();
  if (!lastDiagnostics) return;
  lastDiagnostics.grayscaleViewEnabled = $('grayView').checked;
  $('diagnostics').textContent = JSON.stringify(lastDiagnostics, null, 2);
});
for (const id of ['sizeSelect', 'aspectSelect']) $(id).addEventListener('change', () => {
  // The pending media load reads the latest controls when it finishes. Keep
  // its session valid if a size/aspect change arrives before image.decode().
  if (!loaded) return;
  reset(); tick();
});
$('zoomSelect').addEventListener('change', () => { root.dataset.zoom = $('zoomSelect').value; });
$('playToggle').addEventListener('click', async () => {
  try { if (video.paused) { if (video.ended) { reset(); video.currentTime = 0; } await video.play(); } else video.pause(); }
  catch (e) { status(e.message, true); }
  $('playToggle').textContent = video.paused ? '再生' : '一時停止';
});
function seekTo(value) { video.pause(); $('playToggle').textContent = '再生'; reset(); video.currentTime = Math.max(0, Math.min(video.duration || 0, value)); }
$('seek').addEventListener('input', () => seekTo(Number($('seek').value)));
$('stepBack').addEventListener('click', () => seekTo(video.currentTime - 0.1));
$('stepForward').addEventListener('click', () => seekTo(video.currentTime + 0.1));
video.addEventListener('ended', () => { $('playToggle').textContent = '再生'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { video.pause(); $('playToggle').textContent = '再生'; } else tick(); });
window.addEventListener('pagehide', () => { clearTimeout(timer); video.pause(); worker.terminate(); });
renderOptions(); root.dataset.zoom = '1';
loadSelected();
fetch('/assets/pixel-studio/test-media/catalog.json').then((r) => { if (!r.ok) throw new Error('catalog'); return r.json(); }).then((entries) => {
  for (const m of entries) if (m.type === 'video' && m.src && !media.some((item) => item.id === m.id)) media.push(m);
  renderOptions();
}).catch(() => {});
