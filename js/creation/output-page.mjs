import { readToolOutput, saveToolOutputFilename, saveToolOutputVariant, sanitizeOutputFilename } from './output-handoff.mjs?rev=20261008-output-3';
import { inspectPixelPng, withPixelPngMetadata } from '../pixel-png-metadata.mjs?rev=20260928-pixel-roundtrip-1';
import { resizeRgbaNearest } from './output-render.mjs?rev=20261008-output-1';

const MAX_IMAGE_EDGE = 8192;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const MAX_GIF_INPUT_PIXELS = 8 * 1000 * 1000;
const $ = (selector) => document.querySelector(selector);
const pageTitle = $('#output-title');
const intro = $('#output-copy');
const preview = $('#output-preview');
const image = $('#output-image');
const audio = $('#output-audio');
const video = $('#output-video');
const fileCard = $('#output-file-card');
const fileExtension = $('#output-file-extension');
const fileTitle = $('#output-file-title');
const fileDescription = $('#output-file-description');
const metadata = $('#output-metadata');
const format = $('#output-format');
const filename = $('#output-filename');
const extension = $('#output-extension');
const download = $('#output-download');
const status = $('#output-status');
const returnLink = $('#output-return');
const animationToggle = $('#output-animation-toggle');
const scaleSettings = $('#output-scale-settings');
const scaleInput = $('#output-scale');
const presets = $('#output-scale-presets');
const widthInput = $('#output-width');
const heightInput = $('#output-height');
const aspectLock = $('#output-aspect-lock');
const sizeSummary = $('#output-size-summary');
const scaleNote = $('#output-scale-note');
const applySettings = $('#output-apply-settings');
const cancelSettings = $('#output-cancel-settings');
const animationSettings = $('#output-animation-settings');
const animationDetails = $('#output-animation-details');
const audioSettings = $('#output-audio-settings');
const audioDetails = $('#output-audio-details');

let record = null;
let sourceUrl = null;
let fileUrl = null;
let currentBlob = null;
let pngSourceImage = null;
let pngBaseSize = null;
let pngMetadata = null;
let maxScale = 1;
let currentScale = 1;
let gifController = null;
let posterUrl = null;
let animationStopped = false;
let pageDisposed = false;

function setError(message) {
  pageTitle.textContent = '出力を開けません';
  intro.textContent = message;
  preview.replaceChildren();
  metadata.textContent = '';
  format.textContent = '';
  download.hidden = true;
  filename.disabled = true;
  extension.textContent = '';
  scaleSettings.hidden = true;
  animationSettings.hidden = true;
  audioSettings.hidden = true;
  status.textContent = '元の編集内容は変更していません。';
  returnLink.textContent = 'ツール一覧へ戻る';
  returnLink.href = '/tools/';
}

function outputBaseName(value, ext) {
  const full = sanitizeOutputFilename(value, ext);
  return full.slice(0, -(ext.length + 1));
}

function currentFilename() {
  return record ? sanitizeOutputFilename(filename.value, record.extension) : '';
}

function displayMetadata(entry, blob = currentBlob, width = entry.metadata?.width, height = entry.metadata?.height) {
  const values = [];
  if (width && height) values.push(`${width} × ${height}px`);
  if (entry.mime === 'image/gif' && entry.mediaSource?.frames?.length) values.push(`${entry.mediaSource.frames.length}フレーム`);
  if (entry.metadata?.durationSeconds) values.push(`${entry.metadata.durationSeconds}秒`);
  if (blob) values.push(`${(blob.size / (1024 * 1024)).toFixed(blob.size < 1024 * 1024 ? 2 : 1)} MB`);
  metadata.textContent = values.join(' · ');
}

function syncFilename() {
  if (!record || !fileUrl) return;
  const safeName = currentFilename();
  filename.value = outputBaseName(safeName, record.extension);
  download.href = fileUrl;
  download.download = safeName;
}

function trackSave(method) {
  void import('../site-analytics.mjs').then(({ trackSiteEvent }) => {
    trackSiteEvent('file_export', { file_type: record.extension, method, export_status: 'download_started' });
  }).catch(() => { /* Analytics never blocks a local preview or download. */ });
}

function setBusy(busy, canCancel = false) {
  applySettings.disabled = busy;
  scaleInput.disabled = busy;
  for (const button of presets.querySelectorAll('button')) button.disabled = busy;
  widthInput.disabled = busy;
  heightInput.disabled = busy;
  aspectLock.disabled = busy;
  cancelSettings.hidden = !busy || !canCancel;
  cancelSettings.disabled = false;
  scaleSettings.setAttribute('aria-busy', String(busy));
}

function setCurrentBlob(blob, { width = null, height = null, animated = false } = {}) {
  const previous = fileUrl;
  currentBlob = blob;
  fileUrl = URL.createObjectURL(blob);
  download.href = fileUrl;
  if (record.mime === 'image/png' || record.mime === 'image/gif') {
    image.src = fileUrl;
    if (animated) {
      animationStopped = false;
      animationToggle.textContent = 'アニメーションを停止';
      animationToggle.setAttribute('aria-pressed', 'false');
      animationToggle.hidden = true;
      void prepareGifPoster(blob, image);
    }
  } else if (record.mime === 'audio/wav') audio.src = fileUrl;
  else if (record.mime.startsWith('video/')) video.src = fileUrl;
  if (previous && previous !== sourceUrl) URL.revokeObjectURL(previous);
  displayMetadata(record, blob, width, height);
}

async function prepareGifPoster(blob, imageNode) {
  if (blob.size > 64 * 1024 * 1024) return;
  if (typeof imageNode.decode === 'function') await imageNode.decode().catch(() => {});
  const width = imageNode.naturalWidth; const height = imageNode.naturalHeight;
  if (!width || !height || width * height > 16_000_000) return;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  try {
    const context = canvas.getContext('2d', { alpha: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(imageNode, 0, 0);
    const poster = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!poster) return;
    if (posterUrl) URL.revokeObjectURL(posterUrl);
    posterUrl = URL.createObjectURL(poster);
    animationToggle.hidden = false;
  } catch { /* Keep GIF playback when a still poster cannot be prepared. */ }
  finally { canvas.width = 1; canvas.height = 1; }
}

function setupScaleInput({ width, height, startScale, startWidth, startHeight, kind, frameCount = 1 }) {
  const totalPixels = width * height * frameCount;
  const pixelLimit = kind === 'gif' ? MAX_GIF_INPUT_PIXELS : MAX_IMAGE_PIXELS;
  maxScale = Math.max(1, Math.min(Math.floor(MAX_IMAGE_EDGE / Math.max(width, height)), Math.floor(Math.sqrt(pixelLimit / totalPixels))));
  currentScale = Math.max(1, Math.min(maxScale, Math.round(startScale || 1)));
  scaleInput.min = '1'; scaleInput.max = String(maxScale); scaleInput.value = String(currentScale);
  widthInput.min = heightInput.min = '1'; widthInput.max = heightInput.max = String(MAX_IMAGE_EDGE);
  widthInput.value = String(Math.max(1, Math.min(MAX_IMAGE_EDGE, Math.round(startWidth || width * currentScale))));
  heightInput.value = String(Math.max(1, Math.min(MAX_IMAGE_EDGE, Math.round(startHeight || height * currentScale))));
  scaleSettings.hidden = false;
  aspectLock.checked = record?.currentMetadata?.aspectLocked !== false;
  scaleNote.textContent = kind === 'png'
    ? 'ピクセルの輪郭と透明部分を保ちます。'
    : '全フレームと再生時間を保ちます。';
  scaleInput.disabled = maxScale <= 1;
  applySettings.disabled = false;
  buildScalePresets(width, height, kind, frameCount);
  updateScaleSummary(width, height, kind, frameCount);
}

function buildScalePresets(width, height, kind, frameCount = 1) {
  presets.replaceChildren();
  const candidates = [1, 2, 4, currentScale].filter((value, index, values) => values.indexOf(value) === index && value >= 1 && value <= maxScale);
  if (maxScale < 4 && !candidates.includes(maxScale)) candidates.push(maxScale);
  for (const scale of candidates) {
    const button = document.createElement('button');
    button.className = 'output-preset'; button.type = 'button'; button.dataset.scale = String(scale);
    button.setAttribute('aria-pressed', 'false');
    const heading = document.createElement('strong'); heading.textContent = scale === currentScale && scale > 8 ? '元の書き出し' : `${scale}倍`;
    const dimensions = document.createElement('span'); dimensions.textContent = `${width * scale} × ${height * scale}px`;
    button.append(heading, dimensions);
    button.addEventListener('click', () => {
      if (applySettings.disabled) return;
      scaleInput.value = String(scale);
      widthInput.value = String(width * scale); heightInput.value = String(height * scale);
      updateScaleSummary(width, height, kind, frameCount);
      void applySelectedSize();
    });
    presets.append(button);
  }
  updatePresetSelection(width, height);
}

function updatePresetSelection(width, height) {
  const outWidth = Number(widthInput.value); const outHeight = Number(heightInput.value);
  const scale = outWidth / width;
  const isPreset = Number.isInteger(scale) && outHeight === height * scale;
  scaleInput.value = isPreset ? String(scale) : '';
  for (const button of presets.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(isPreset && Number(button.dataset.scale) === scale));
  }
}

function updateScaleSummary(width, height, kind, frameCount = 1) {
  const requested = Math.max(1, Math.min(maxScale, Math.round(Number(scaleInput.value) || currentScale || 1)));
  const outWidth = Math.max(1, Math.round(Number(widthInput.value) || width * requested));
  const outHeight = Math.max(1, Math.round(Number(heightInput.value) || height * requested));
  const uniformScale = outWidth / width === outHeight / height && Number.isInteger(outWidth / width) && outWidth / width >= 1;
  sizeSummary.textContent = `${width} × ${height}px → ${outWidth} × ${outHeight}px${uniformScale ? ` · ${outWidth / width}倍` : ''}`;
  updatePresetSelection(width, height);
  if (kind === 'gif' && record?.mediaSource?.frames?.length) {
    const seconds = record.mediaSource.frames.reduce((total, frame) => total + frame.delayMs, 0) / 1000;
    animationDetails.textContent = `${frameCount}フレーム · ${seconds.toFixed(1)}秒 · ループ再生`;
  }
}

async function readPngMetadata(blob) {
  if (blob.size > 10 * 1024 * 1024) return null;
  try { return inspectPixelPng(new Uint8Array(await blob.arrayBuffer())).metadata || null; }
  catch { return null; }
}

async function preparePngSettings(entry) {
  const sourceBlob = entry.sourceBlob;
  const parsedMetadata = await readPngMetadata(sourceBlob);
  pngMetadata = parsedMetadata;
  const imageDecoder = new Image();
  imageDecoder.src = sourceUrl;
  await imageDecoder.decode();
  const savedDimensions = entry.currentMetadata?.width && entry.currentMetadata?.height
    ? entry.currentMetadata
    : (entry.metadata?.width && entry.metadata?.height ? entry.metadata : null);
  pngBaseSize = parsedMetadata
    ? { width: parsedMetadata.width, height: parsedMetadata.height }
    : savedDimensions ? { width: savedDimensions.width, height: savedDimensions.height }
      : { width: imageDecoder.naturalWidth, height: imageDecoder.naturalHeight };
  const sourceScale = parsedMetadata?.scale || entry.metadata?.defaultScale || 1;
  const startScale = entry.currentMetadata?.scale || entry.metadata?.scale || sourceScale;
  const startWidth = entry.currentMetadata?.outputWidth || pngBaseSize.width * startScale;
  const startHeight = entry.currentMetadata?.outputHeight || pngBaseSize.height * startScale;
  pngSourceImage = imageDecoder;
  setupScaleInput({ ...pngBaseSize, startScale, startWidth, startHeight, kind: 'png' });
  if (maxScale <= 1) scaleNote.textContent += ' 基準サイズが上限に達しているため、この画像は1倍で書き出します。';
  updateScaleSummary(pngBaseSize.width, pngBaseSize.height, 'png');
}

function targetDimensions() {
  const width = Number(widthInput.value); const height = Number(heightInput.value);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
    throw new RangeError('出力サイズが上限を超えています。幅と高さを小さくしてください。');
  }
  if (record?.mime === 'image/gif' && width * height * record.mediaSource.frames.length > MAX_GIF_INPUT_PIXELS) {
    throw new RangeError('GIFの全フレーム合計が800万画素を超えています。幅と高さを小さくしてください。');
  }
  return { width, height };
}

async function renderPngAtSize(outWidth, outHeight) {
  if (!pngSourceImage || !pngBaseSize || pageDisposed) return;
  const { width, height } = pngBaseSize;
  if (outWidth > MAX_IMAGE_EDGE || outHeight > MAX_IMAGE_EDGE || outWidth * outHeight > MAX_IMAGE_PIXELS) throw new RangeError('出力サイズが上限を超えています。倍率を下げてください。');
  const base = document.createElement('canvas'); const output = document.createElement('canvas');
  base.width = width; base.height = height; output.width = outWidth; output.height = outHeight;
  try {
    const baseContext = base.getContext('2d', { alpha: true });
    const outputContext = output.getContext('2d', { alpha: true });
    if (!baseContext || !outputContext) throw new Error('画像の書き出しを開始できません。');
    baseContext.imageSmoothingEnabled = false;
    baseContext.drawImage(pngSourceImage, 0, 0, pngSourceImage.naturalWidth, pngSourceImage.naturalHeight, 0, 0, width, height);
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(base, 0, 0, width, height, 0, 0, outWidth, outHeight);
    let blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNGを書き出せませんでした。');
    const scaleX = outWidth / width; const scaleY = outHeight / height;
    const scale = scaleX === scaleY && Number.isSafeInteger(scaleX) && scaleX >= 1 ? scaleX : null;
    if (pngMetadata && scale) blob = await withPixelPngMetadata(blob, { width, height, scale });
    if (pageDisposed) return;
    const nextMetadata = { width, height, outputWidth: outWidth, outputHeight: outHeight, aspectLocked: aspectLock.checked };
    if (scale) nextMetadata.scale = scale;
    await saveToolOutputVariant(record.id, blob, nextMetadata);
    if (pageDisposed) return;
    currentScale = scale || 1; record.currentMetadata = nextMetadata;
    setCurrentBlob(blob, { width: outWidth, height: outHeight });
    updateScaleSummary(width, height, 'png');
    status.textContent = `${outWidth} × ${outHeight}px のPNGを端末内に準備しました。保存できます。`;
  } finally { base.width = base.height = output.width = output.height = 1; }
}

async function renderGifAtSize(outWidth, outHeight) {
  const source = record?.mediaSource;
  if (source?.kind !== 'gif-frames' || pageDisposed) return;
  gifController?.abort();
  const controller = new AbortController(); gifController = controller;
  setBusy(true, true); status.textContent = 'アニメーションを再生成しています…';
  try {
    const { encodeAnimatedGif } = await import('../animated-export.mjs?v=20261001-animation-1');
    const resizedFrames = [];
    for (const frame of source.frames) {
      if (controller.signal.aborted || pageDisposed) throw new DOMException('生成を中止しました。', 'AbortError');
      resizedFrames.push({ ...resizeRgbaNearest(frame, outWidth, outHeight, { maxPixels: MAX_GIF_INPUT_PIXELS }), delayMs: frame.delayMs });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const result = await encodeAnimatedGif(resizedFrames, { signal: controller.signal, longEdge: Math.max(outWidth, outHeight), maxPixels: MAX_GIF_INPUT_PIXELS, maxInputPixels: MAX_GIF_INPUT_PIXELS });
    if (controller.signal.aborted || pageDisposed) return;
    const blob = new Blob([result.bytes], { type: 'image/gif' });
    const frameDelayMs = source.frames.every((frame) => frame.delayMs === source.frames[0].delayMs) ? source.frames[0].delayMs : undefined;
    const seconds = source.frames.reduce((total, frame) => total + frame.delayMs, 0) / 1000;
    const scaleX = outWidth / source.width; const scaleY = outHeight / source.height;
    const scale = scaleX === scaleY && Number.isSafeInteger(scaleX) && scaleX >= 1 ? scaleX : null;
    const nextMetadata = { width: source.width, height: source.height, outputWidth: outWidth, outputHeight: outHeight, aspectLocked: aspectLock.checked, frameCount: source.frames.length, durationSeconds: seconds, loopCount: source.loopCount ?? 0 };
    if (scale) nextMetadata.scale = scale;
    if (frameDelayMs) nextMetadata.frameDelayMs = frameDelayMs;
    await saveToolOutputVariant(record.id, blob, nextMetadata);
    if (controller.signal.aborted || pageDisposed) return;
    currentScale = scale || 1; record.currentMetadata = nextMetadata;
    setCurrentBlob(blob, { width: outWidth, height: outHeight, animated: true });
    updateScaleSummary(source.width, source.height, 'gif', source.frames.length);
    status.textContent = `${result.width} × ${result.height}px · ${source.frames.length}フレームのGIFを端末内に準備しました。保存できます。`;
  } catch (error) {
    if (error?.name === 'AbortError') status.textContent = '生成を中止しました。前のGIFはそのまま保存できます。';
    else status.textContent = error?.message || 'GIFを書き出せませんでした。前のGIFはそのまま保存できます。';
  } finally {
    if (gifController === controller) gifController = null;
    if (!pageDisposed) setBusy(false);
  }
}

async function applySelectedSize() {
  if (!record || applySettings.disabled) return;
  let dimensions;
  try { dimensions = targetDimensions(); }
  catch (error) { status.textContent = error?.message || '出力サイズを確認してください。'; return; }
  if (record.mime === 'image/gif') { void renderGifAtSize(dimensions.width, dimensions.height); return; }
  setBusy(true); status.textContent = 'プレビューを更新しています…';
  try { await renderPngAtSize(dimensions.width, dimensions.height); }
  catch (error) { status.textContent = error?.message || 'PNGを書き出せませんでした。前の画像はそのまま保存できます。'; }
  finally { if (!pageDisposed) setBusy(false); }
}

function displayFormat(entry) {
  if (entry.mime === 'image/png') return 'PNG画像';
  if (entry.mime === 'image/gif') return 'GIFアニメーション';
  if (entry.mime === 'audio/wav') return 'WAV音声';
  if (entry.mime === 'video/mp4') return 'MP4動画';
  if (entry.mime === 'video/webm') return 'WebM動画';
  return `${entry.extension.toUpperCase()}ファイル`;
}

function setMedia(entry) {
  const type = entry.mime;
  if (type === 'image/png' || type === 'image/gif') {
    image.hidden = false; image.src = fileUrl;
    image.onload = () => displayMetadata(record, currentBlob, image.naturalWidth, image.naturalHeight);
    image.alt = `${entry.title || '作品'}の${type === 'image/gif' ? 'アニメーション' : '画像'}プレビュー`;
    if (type === 'image/png') void preparePngSettings(entry).catch((error) => { scaleSettings.hidden = true; status.textContent = error?.message || '画像サイズを読み込めませんでした。元の画像は保存できます。'; });
    else if (entry.mediaSource?.kind === 'gif-frames') {
      const { width, height, frames } = entry.mediaSource;
      const startScale = entry.currentMetadata?.scale || entry.metadata?.defaultScale || 1;
      setupScaleInput({ width, height, startScale, startWidth: entry.currentMetadata?.outputWidth || width * startScale, startHeight: entry.currentMetadata?.outputHeight || height * startScale, kind: 'gif', frameCount: frames.length });
      animationSettings.hidden = false;
      animationToggle.hidden = true;
      void prepareGifPoster(entry.blob, image);
    } else {
      scaleSettings.hidden = true;
      animationSettings.hidden = true;
      status.textContent = 'このGIFのフレームデータはサイズ設定の上限外です。元のアニメーションはそのまま保存できます。';
    }
  } else if (type === 'audio/wav') {
    audio.hidden = false; audio.src = fileUrl;
    fileCard.hidden = true;
    if (entry.metadata?.sampleRate || entry.metadata?.loops) {
      const rate = entry.metadata.sampleRate ? `${Number((entry.metadata.sampleRate / 1000).toFixed(2))}kHz` : '';
      const loops = entry.metadata.loops ? `${entry.metadata.loops}回ループ` : '';
      audioDetails.textContent = ['ステレオ · 16-bit PCM', rate, loops].filter(Boolean).join(' · ');
      audioSettings.hidden = false;
    }
  } else if (type.startsWith('video/')) {
    video.hidden = false; video.src = fileUrl;
    fileCard.hidden = true;
  } else {
    fileTitle.textContent = 'ファイルを準備しました';
    fileDescription.textContent = 'この形式はPiXiEED内でプレビューできません。';
    fileCard.hidden = false;
  }
}

async function mount() {
  const params = new URLSearchParams(location.search);
  if (params.getAll('id').length !== 1) { setError('編集画面から開いた出力データを確認できません。'); return; }
  try {
    record = await readToolOutput(params.get('id'));
    if (record.mime === 'image/gif' && record.mediaSource?.kind === 'gif-frames') {
      const total = record.mediaSource.width * record.mediaSource.height * record.mediaSource.frames.length;
      if (total > MAX_GIF_INPUT_PIXELS) record.mediaSource = null;
    }
    currentBlob = record.blob;
    sourceUrl = URL.createObjectURL(record.sourceBlob);
    fileUrl = URL.createObjectURL(currentBlob);
    pageTitle.textContent = record.title || '出力を確認';
    intro.textContent = record.source ? `${record.source}からのファイルです。プレビューを確認して端末へ保存できます。` : 'プレビューを確認して、ファイル名を決めて保存できます。';
    format.textContent = displayFormat(record);
    fileExtension.textContent = record.extension.toUpperCase();
    extension.textContent = `.${record.extension}`;
    filename.value = outputBaseName(record.filename, record.extension);
    filename.setAttribute('aria-label', `ファイル名（.${record.extension}は固定）`);
    returnLink.href = record.returnUrl;
    returnLink.textContent = '編集画面へ戻る';
    displayMetadata(record, currentBlob);
    setMedia(record);
    syncFilename();
  } catch (error) { setError(error?.message || '端末内の出力を開けませんでした。'); }
}

filename.addEventListener('input', syncFilename);
filename.addEventListener('change', async () => {
  if (!record) return;
  try { await saveToolOutputFilename(record.id, currentFilename()); }
  catch { status.textContent = 'ファイル名を保持できませんでした。画面を閉じる前にもう一度入力してください。'; }
});
download.addEventListener('click', (event) => {
  if (!record || !fileUrl || !currentBlob) { event.preventDefault(); return; }
  syncFilename();
  status.textContent = 'ダウンロードを開始しました。完了はブラウザーの保存先で確認してください。';
  trackSave('download');
});
scaleInput.addEventListener('input', () => {
  if (!record) return;
  const width = record.mime === 'image/gif' ? record.mediaSource.width : pngBaseSize.width;
  const height = record.mime === 'image/gif' ? record.mediaSource.height : pngBaseSize.height;
  const scale = Math.max(1, Math.min(maxScale, Math.round(Number(scaleInput.value) || 1)));
  widthInput.value = String(width * scale); heightInput.value = String(height * scale);
  updateScaleSummary(width, height, record.mime === 'image/gif' ? 'gif' : 'png', record.mediaSource?.frames?.length || 1);
});
function onDimensionInput(axis) {
  if (!record) return;
  const width = record.mime === 'image/gif' ? record.mediaSource.width : pngBaseSize.width;
  const height = record.mime === 'image/gif' ? record.mediaSource.height : pngBaseSize.height;
  if (aspectLock.checked) {
    if (axis === 'width' && Number(widthInput.value) > 0) heightInput.value = String(Math.max(1, Math.round(Number(widthInput.value) * height / width)));
    if (axis === 'height' && Number(heightInput.value) > 0) widthInput.value = String(Math.max(1, Math.round(Number(heightInput.value) * width / height)));
  }
  updateScaleSummary(width, height, record.mime === 'image/gif' ? 'gif' : 'png', record.mediaSource?.frames?.length || 1);
}
widthInput.addEventListener('input', () => onDimensionInput('width'));
heightInput.addEventListener('input', () => onDimensionInput('height'));
aspectLock.addEventListener('change', () => { if (aspectLock.checked) onDimensionInput('width'); });
applySettings.addEventListener('click', () => { void applySelectedSize(); });
cancelSettings.addEventListener('click', () => gifController?.abort());
animationToggle.addEventListener('click', () => {
  if (!posterUrl || record?.mime !== 'image/gif') return;
  animationStopped = !animationStopped;
  image.src = animationStopped ? posterUrl : fileUrl;
  animationToggle.textContent = animationStopped ? 'アニメーションを再生' : 'アニメーションを停止';
  animationToggle.setAttribute('aria-pressed', String(animationStopped));
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  pageDisposed = true; gifController?.abort();
  for (const url of [sourceUrl, fileUrl, posterUrl]) if (url) URL.revokeObjectURL(url);
});

void mount();
