import { readToolOutput, saveToolOutputItems, sanitizeOutputFilename } from './output-handoff.mjs?rev=20261008-output-8';
import { inspectPixelPng } from '../pixel-png-metadata.mjs?rev=20260928-pixel-roundtrip-1';
import { encodeOutput } from './output-encoders.mjs?rev=20261008-output-4';
import { renderAudioWav } from './audio-export.mjs?rev=20261008-output-1';
import { chooseAudioVideoMimeType, renderAudioVideo } from './audio-video.mjs?rev=20261008-output-1';

const MAX_IMAGE_EDGE = 4096;
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
const outputItemsList = $('#output-items');
const addOutputItem = $('#output-add-item');
const copyOutputItem = $('#output-copy-item');
const deleteOutputItem = $('#output-delete-item');
const sourceSelect = $('#output-source');
const sourceLabel = $('#output-source-label');
const formatButton = $('#output-extension');
const formatPicker = $('#output-format-picker');
const formatSelect = $('#output-format-select');
const jpegSetting = $('#output-jpeg-setting');
const jpegQualitySetting = $('#output-jpeg-quality-setting');
const jpegQuality = $('#output-jpeg-quality');
const jpegQualityValue = $('#output-jpeg-quality-value');
const formatHelp = $('#output-filename-help');

let record = null;
let outputItems = [];
let activeItem = null;
let mediaSources = [];
let activeSource = null;
let generatedDownloadUrls = new Map();
let generationEpoch = 0;
let generationController = null;
let sourceUrl = null;
let fileUrl = null;
let currentBlob = null;
let pngBaseSize = null;
let maxScale = 1;
let currentScale = 1;
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
  return record ? sanitizeOutputFilename(filename.value, activeItem?.extension || record.extension) : '';
}

function createItemId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sourceFrames(source = activeSource) {
  if (source?.kind === 'rgba-frames') return source.mediaSource.frames;
  if (source?.kind === 'audio-video' && source.image) return [source.image];
  return source?.mediaSource?.frames || [];
}

function sourceFormats(source = activeSource) {
  if (source?.kind === 'rgba-frames') return source.mediaSource.frames.length > 1
    ? [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター'], ['gif', 'GIFアニメーション'], ['apng', 'APNGアニメーション']]
    : [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター']];
  if (source?.kind === 'audio-song') return [['wav', 'WAV音声']];
  if (source?.kind === 'audio-video') {
    const supported = chooseAudioVideoMimeType();
    return supported ? [[supported.extension, supported.extension.toUpperCase() + '動画']] : [];
  }
  if (source?.kind === 'legacy-image' && source.mediaSource?.frames?.length > 1) return [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター'], ['gif', 'GIFアニメーション'], ['apng', 'APNGアニメーション']];
  if (source?.kind === 'legacy-image') return [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター']];
  if (source?.kind === 'legacy-file' && source.extension === 'pxd') return [];
  return source?.mime && source?.extension ? [[source.extension, displayFormat({ mime: source.mime, extension: source.extension })]] : [];
}

function outputMime(formatValue) {
  return ({ png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', apng: 'image/apng', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' })[formatValue] || '';
}

function setActiveItem(item) {
  const previousFileUrl = fileUrl;
  const previousSourceUrl = sourceUrl;
  activeItem = item;
  const foundSource = mediaSources.find((source) => source.id === item.sourceId);
  activeSource = foundSource || mediaSources[0] || null;
  record.mime = item.mime; record.extension = item.extension; record.filename = item.filename; record.blob = item.blob;
  record.currentMetadata = item.metadata || {};
  jpegQuality.value = String(item.metadata?.jpegQuality || 90);
  jpegQualityValue.value = `${jpegQuality.value}%`;
  jpegQualityValue.textContent = `${jpegQuality.value}%`;
  record.mediaSource = activeSource?.mediaSource || (activeSource?.kind === 'rgba-frames' ? activeSource.mediaSource : null) || null;
  currentBlob = item.blob;
  fileUrl = URL.createObjectURL(item.blob);
  if (previousFileUrl && previousFileUrl !== previousSourceUrl) URL.revokeObjectURL(previousFileUrl);
  if (previousSourceUrl) URL.revokeObjectURL(previousSourceUrl);
  sourceUrl = URL.createObjectURL(record.sourceBlob);
  pageTitle.textContent = record.title || '出力を確認';
  format.textContent = displayFormat(record);
  fileExtension.textContent = record.extension.toUpperCase();
  extension.textContent = `.${item.extension}`;
  filename.value = outputBaseName(item.filename, item.extension);
  filename.setAttribute('aria-label', `ファイル名（.${item.extension}は固定）`);
  returnLink.href = record.returnUrl;
  displayMetadata(record, item.blob, item.metadata?.outputWidth || item.metadata?.width, item.metadata?.outputHeight || item.metadata?.height);
  setMedia(record);
  syncFilename();
}

function renderOutputItems() {
  outputItemsList.replaceChildren();
  for (const item of outputItems) {
    let url = generatedDownloadUrls.get(item.id);
    if (!url || item.__urlBlob !== item.blob) {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(item.blob); generatedDownloadUrls.set(item.id, url); item.__urlBlob = item.blob;
    }
    const row = document.createElement('div'); row.className = 'output-item'; row.setAttribute('role', 'listitem'); row.setAttribute('aria-current', String(item.id === activeItem?.id));
    const select = document.createElement('button'); select.type = 'button'; select.className = 'output-item__select'; select.setAttribute('aria-label', `編集: ${item.filename}`);
    const type = document.createElement('strong'); type.textContent = item.extension.toUpperCase();
    const name = document.createElement('span'); name.textContent = item.filename;
    select.append(type, name); select.addEventListener('click', () => activateItem(item.id));
    const save = document.createElement('a'); save.className = 'output-item__download'; save.href = url; save.download = item.filename; save.textContent = '保存'; save.setAttribute('aria-label', `${item.filename}をダウンロード`);
    save.addEventListener('click', () => { status.textContent = 'ダウンロードを開始しました。完了はブラウザーの保存先で確認してください。'; trackSave('download'); });
    row.append(select, save); outputItemsList.append(row);
  }
  deleteOutputItem.disabled = outputItems.length <= 1;
  copyOutputItem.disabled = outputItems.length >= 12;
  addOutputItem.disabled = outputItems.length >= 12;
}

function fillSourceAndFormatControls({ preferredFormat = activeItem?.extension } = {}) {
  sourceSelect.replaceChildren();
  for (const source of mediaSources) {
    const option = document.createElement('option'); option.value = source.id; option.textContent = source.label; sourceSelect.append(option);
  }
  sourceSelect.value = activeSource?.id || '';
  sourceSelect.hidden = mediaSources.length <= 1;
  sourceLabel.hidden = mediaSources.length <= 1;
  const formats = sourceFormats(activeSource);
  formatSelect.replaceChildren();
  for (const [value, label] of formats) {
    const option = document.createElement('option'); option.value = value; option.textContent = `${label}（.${value}）`; formatSelect.append(option);
  }
  formatSelect.value = formats.some(([value]) => value === preferredFormat) ? preferredFormat : formats[0]?.[0] || '';
  formatButton.textContent = `.${formatSelect.value || activeItem?.extension || ''} ⌄`;
  formatButton.hidden = formats.length <= 1;
  formatHelp.hidden = formats.length <= 1;
  jpegSetting.hidden = formatSelect.value !== 'jpeg';
  jpegQualitySetting.hidden = formatSelect.value !== 'jpeg';
  formatPicker.hidden = true;
  formatButton.setAttribute('aria-expanded', 'false');
}

async function persistOutputItems(nextItems) {
  const saved = await saveToolOutputItems(record.id, nextItems);
  outputItems = saved;
  activeItem = outputItems.find((item) => item.id === activeItem?.id) || outputItems[0];
  return outputItems;
}

async function activateItem(id) {
  const item = outputItems.find((candidate) => candidate.id === id);
  if (!item || item === activeItem) return;
  setActiveItem(item); fillSourceAndFormatControls({ preferredFormat: item.extension }); renderOutputItems();
}

function displayMetadata(entry, blob = currentBlob, width = entry.metadata?.width, height = entry.metadata?.height) {
  const values = [];
  const itemMetadata = { ...entry.metadata, ...entry.currentMetadata };
  if (width && height) values.push(`${width} × ${height}px`);
  if (['image/gif', 'image/apng'].includes(entry.mime) && entry.mediaSource?.frames?.length > 1) values.push(`${entry.mediaSource.frames.length}フレーム`);
  if (itemMetadata.durationSeconds) values.push(`${itemMetadata.durationSeconds}秒`);
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
  sourceSelect.disabled = busy;
  formatSelect.disabled = busy;
  addOutputItem.disabled = busy || outputItems.length >= 12;
  copyOutputItem.disabled = busy || outputItems.length >= 12;
  deleteOutputItem.disabled = busy || outputItems.length <= 1;
  cancelSettings.hidden = !busy || !canCancel;
  cancelSettings.disabled = false;
  scaleSettings.setAttribute('aria-busy', String(busy));
  jpegQuality.disabled = busy;
}

function setCurrentBlob(blob, { width = null, height = null, animated = false } = {}) {
  const previous = fileUrl;
  currentBlob = blob;
  fileUrl = URL.createObjectURL(blob);
  download.href = fileUrl;
  if (record.mime.startsWith('image/')) {
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

async function canvasRaster(frame, mime, quality = 0.9) {
  const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
  try {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('画像のプレビューを準備できません。');
    context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('画像を書き出せませんでした。')), mime, mime === 'image/jpeg' ? quality : undefined));
  } finally { canvas.width = canvas.height = 1; }
}

async function createOutputBlob(source, formatValue, dimensions, controller) {
  if (source?.kind === 'rgba-frames' || source?.kind === 'legacy-image') {
    const frames = source.kind === 'rgba-frames' ? source.mediaSource.frames : source.mediaSource?.frames;
    if (!Array.isArray(frames) || !frames.length) throw new Error('画像の元データを確認できません。');
    return { blob: await encodeOutput({ format: formatValue, frames, width: dimensions?.width || null, height: dimensions?.height || null, background: $('#output-jpeg-background')?.value || '#ffffff', quality: Number(jpegQuality.value) / 100, loopCount: source.mediaSource.loopCount ?? 0 }, { encodeRaster: canvasRaster, signal: controller.signal }), metadata: {} };
  }
  if (source?.kind === 'audio-song' && formatValue === 'wav') {
    const result = await renderAudioWav(source.song);
    return { blob: result.blob, metadata: { durationSeconds: result.seconds, sampleRate: 44100, loops: result.loops } };
  }
  if (source?.kind === 'audio-video' && ['mp4', 'webm'].includes(formatValue)) {
    const frame = source.image;
    const result = await renderAudioVideo(source.song, { width: frame.width, height: frame.height, rgba: frame.data }, { signal: controller.signal });
    if (result.extension !== formatValue || result.blob.type.split(';')[0] !== outputMime(formatValue)) throw new Error('動画の形式が選択内容と一致しません。元の項目はそのまま保存できます。');
    return { blob: result.blob, metadata: { durationSeconds: result.seconds, width: result.width, height: result.height, outputWidth: result.width, outputHeight: result.height } };
  }
  if (source?.kind === 'legacy-file' && source.blob && source.extension === formatValue) return { blob: source.blob, metadata: {} };
  throw new Error('この素材では選択した形式を書き出せません。');
}

async function generateOutputItem({ sourceId = sourceSelect.value, formatValue = formatSelect.value, dimensions = null } = {}) {
  if (!record || !activeItem || generationController) return;
  const source = mediaSources.find((item) => item.id === sourceId);
  if (!source || !sourceFormats(source).some(([value]) => value === formatValue)) { status.textContent = 'この素材では選べない形式です。'; return; }
  const formats = sourceFormats(source);
  const extensionValue = formatValue;
  const framesForSource = sourceFrames(source);
  let outputDimensions = dimensions;
  if (!outputDimensions && framesForSource.length) {
    if (source.id === activeItem.sourceId && Number(widthInput.value) > 0 && Number(heightInput.value) > 0) {
      outputDimensions = { width: Number(widthInput.value), height: Number(heightInput.value) };
    } else {
      const scale = Math.max(1, Math.min(16, Math.round(Number(record.metadata?.defaultScale) || 1)));
      outputDimensions = { width: framesForSource[0].width * scale, height: framesForSource[0].height * scale };
    }
  }
  const previousItem = activeItem;
  const epoch = ++generationEpoch;
  const controller = new AbortController(); generationController = controller;
  setBusy(true, true); addOutputItem.disabled = true; copyOutputItem.disabled = true; deleteOutputItem.disabled = true;
  status.textContent = '出力を作成しています…';
  try {
    const generatedOutput = await createOutputBlob(source, extensionValue, outputDimensions, controller);
    const blob = generatedOutput.blob;
    if (controller.signal.aborted || pageDisposed || epoch !== generationEpoch) return;
    const baseName = filename.value || outputBaseName(previousItem.filename, previousItem.extension);
    const nextFilename = sanitizeOutputFilename(baseName, extensionValue);
    const frames = sourceFrames(source);
    const animatedOutput = ['gif', 'apng'].includes(extensionValue);
    const metadataValue = {
      ...(frames[0] ? { width: frames[0].width, height: frames[0].height } : {}),
      ...(outputDimensions ? { outputWidth: outputDimensions.width, outputHeight: outputDimensions.height } : {}),
      ...(extensionValue === 'jpeg' ? { jpegQuality: Number(jpegQuality.value) || 90 } : {}),
      ...(animatedOutput && frames.length > 1 ? { frameCount: frames.length, durationSeconds: frames.reduce((sum, frame) => sum + (frame.delayMs || 100), 0) / 1000, loopCount: source.mediaSource?.loopCount ?? 0 } : {}),
      ...generatedOutput.metadata
    };
    const updated = { ...previousItem, sourceId: source.id, mime: outputMime(extensionValue), extension: extensionValue, filename: nextFilename, blob, metadata: metadataValue };
    const nextItems = outputItems.map((item) => item.id === previousItem.id ? updated : item);
    const savedItems = await saveToolOutputItems(record.id, nextItems);
    if (controller.signal.aborted || pageDisposed || epoch !== generationEpoch) return;
    outputItems = savedItems;
    activeItem = outputItems.find((item) => item.id === previousItem.id) || outputItems[0];
    activeSource = source;
    record.mime = activeItem.mime; record.extension = activeItem.extension; record.filename = activeItem.filename; record.blob = activeItem.blob;
    record.currentMetadata = activeItem.metadata; record.mediaSource = source.mediaSource || null;
    currentScale = outputDimensions?.width && frames[0] && outputDimensions.width % frames[0].width === 0 ? outputDimensions.width / frames[0].width : 1;
    const outputWidth = generatedOutput.metadata.outputWidth || outputDimensions?.width || frames[0]?.width;
    const outputHeight = generatedOutput.metadata.outputHeight || outputDimensions?.height || frames[0]?.height;
    setCurrentBlob(activeItem.blob, { width: outputWidth, height: outputHeight, animated: frames.length > 1 && ['gif', 'apng'].includes(extensionValue) });
    setMedia(record);
    format.textContent = displayFormat(record); extension.textContent = `.${activeItem.extension}`; filename.value = outputBaseName(activeItem.filename, activeItem.extension);
    filename.setAttribute('aria-label', `ファイル名（.${activeItem.extension}は固定）`);
    fillSourceAndFormatControls({ preferredFormat: activeItem.extension });
    renderOutputItems(); displayMetadata(record, activeItem.blob, outputWidth, outputHeight);
    status.textContent = `${formats.find(([value]) => value === extensionValue)?.[1] || extensionValue.toUpperCase()}を端末内に準備しました。保存できます。`;
  } catch (error) {
    if (error?.name !== 'AbortError') status.textContent = error?.message || '出力を作成できませんでした。前の項目はそのまま保存できます。';
    fillSourceAndFormatControls({ preferredFormat: previousItem.extension });
  } finally {
    if (generationController === controller) generationController = null;
    if (!pageDisposed) setBusy(false);
    renderOutputItems();
  }
}

async function addOutput(copy = false) {
  if (!activeItem || outputItems.length >= 12 || generationController) return;
  const item = { ...activeItem, id: createItemId(), filename: activeItem.filename, metadata: { ...activeItem.metadata } };
  const next = [...outputItems, item];
  try {
    const saved = await saveToolOutputItems(record.id, next);
    outputItems = saved; activeItem = outputItems.at(-1); setActiveItem(activeItem);
    fillSourceAndFormatControls({ preferredFormat: activeItem.extension }); renderOutputItems();
    status.textContent = copy ? '出力項目を複製しました。名前や形式を個別に変更できます。' : '出力項目を追加しました。素材・形式・名前を個別に設定できます。';
  } catch (error) { status.textContent = error?.message || '出力項目を保存できませんでした。前の項目はそのままです。'; }
}

async function removeActiveOutput() {
  if (outputItems.length <= 1 || !activeItem || generationController) return;
  const id = activeItem.id; const next = outputItems.filter((item) => item.id !== id);
  try {
    const saved = await saveToolOutputItems(record.id, next);
    const url = generatedDownloadUrls.get(id); if (url) URL.revokeObjectURL(url); generatedDownloadUrls.delete(id);
    outputItems = saved; activeItem = outputItems[0]; setActiveItem(activeItem); fillSourceAndFormatControls({ preferredFormat: activeItem.extension }); renderOutputItems();
    status.textContent = '出力項目を削除しました。元の素材は保持されています。';
  } catch (error) { status.textContent = error?.message || '項目を削除できませんでした。出力内容は保持されています。'; }
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
  if (['gif', 'apng'].includes(activeItem?.extension) && record?.mediaSource?.frames?.length > 1 && width * height * record.mediaSource.frames.length > MAX_GIF_INPUT_PIXELS) {
    throw new RangeError('GIFの全フレーム合計が800万画素を超えています。幅と高さを小さくしてください。');
  }
  return { width, height };
}

async function applySelectedSize() {
  if (!record || applySettings.disabled) return;
  let dimensions;
  try { dimensions = targetDimensions(); }
  catch (error) { status.textContent = error?.message || '出力サイズを確認してください。'; return; }
  await generateOutputItem({ dimensions });
}

function displayFormat(entry) {
  if (entry.mime === 'image/png') return 'PNG画像';
  if (entry.mime === 'image/jpeg') return 'JPEG画像';
  if (entry.mime === 'image/svg+xml') return 'SVGベクター画像';
  if (entry.mime === 'image/gif') return 'GIFアニメーション';
  if (entry.mime === 'image/apng') return 'APNGアニメーション';
  if (entry.mime === 'audio/wav') return 'WAV音声';
  if (entry.mime === 'video/mp4') return 'MP4動画';
  if (entry.mime === 'video/webm') return 'WebM動画';
  return `${entry.extension.toUpperCase()}ファイル`;
}

function setMedia(entry) {
  const type = entry.mime;
  image.hidden = audio.hidden = video.hidden = fileCard.hidden = true;
  scaleSettings.hidden = animationSettings.hidden = audioSettings.hidden = true;
  if (type.startsWith('image/')) {
    image.hidden = false; image.src = fileUrl;
    image.onload = () => displayMetadata(record, currentBlob, image.naturalWidth, image.naturalHeight);
    image.alt = `${entry.title || '作品'}の${['image/gif', 'image/apng'].includes(type) ? 'アニメーション' : '画像'}プレビュー`;
    const frames = sourceFrames(activeSource);
    if (frames.length) {
      const { width, height } = frames[0];
      const startScale = entry.currentMetadata?.scale || entry.metadata?.defaultScale || 1;
      const animated = frames.length > 1 && ['image/gif', 'image/apng'].includes(type);
      setupScaleInput({ width, height, startScale, startWidth: entry.currentMetadata?.outputWidth || width * startScale, startHeight: entry.currentMetadata?.outputHeight || height * startScale, kind: animated ? 'gif' : 'png', frameCount: animated ? frames.length : 1 });
      pngBaseSize = { width, height };
      animationSettings.hidden = !animated;
      animationToggle.hidden = !animated;
      if (animated) void prepareGifPoster(entry.blob, image);
    } else {
      if (type === 'image/png') void preparePngSettings(entry).catch((error) => { scaleSettings.hidden = true; status.textContent = error?.message || '画像サイズを読み込めませんでした。元の画像は保存できます。'; });
      else { scaleSettings.hidden = true; animationSettings.hidden = true; }
    }
  } else if (type === 'audio/wav') {
    audio.hidden = false; audio.src = fileUrl;
    fileCard.hidden = true;
    const itemMetadata = { ...entry.metadata, ...entry.currentMetadata };
    if (itemMetadata.sampleRate || itemMetadata.loops || activeSource?.kind === 'audio-song') {
      const rate = itemMetadata.sampleRate ? `${Number((itemMetadata.sampleRate / 1000).toFixed(2))}kHz` : '';
      const loops = itemMetadata.loops ? `${itemMetadata.loops}回ループ` : '';
      audioDetails.textContent = ['ステレオ · 16-bit PCM', rate, loops].filter(Boolean).join(' · ') || '曲をWAV音声に書き出しました。';
      audioSettings.hidden = false;
    }
  } else if (type.startsWith('video/')) {
    video.hidden = false; video.src = fileUrl;
    fileCard.hidden = true;
  } else {
    fileTitle.textContent = 'ファイルを準備しました';
    fileDescription.textContent = entry.metadata?.description || 'この形式はPiXiEED内でプレビューできません。';
    fileCard.hidden = false;
  }
}

async function mount() {
  const params = new URLSearchParams(location.search);
  if (params.getAll('id').length !== 1) { setError('編集画面から開いた出力データを確認できません。'); return; }
  try {
    record = await readToolOutput(params.get('id'));
    pageTitle.textContent = record.title || '出力を確認';
    intro.textContent = record.source ? `${record.source}からのファイルです。プレビューを確認して端末へ保存できます。` : 'プレビューを確認して、ファイル名を決めて端末へ保存できます。';
    returnLink.href = record.returnUrl;
    returnLink.textContent = '編集画面へ戻る';
    mediaSources = record.mediaSources || [];
    if (!mediaSources.length && record.mediaSource) mediaSources = [{ id: 'legacy', label: '元の画像', kind: 'legacy-image', mediaSource: record.mediaSource }];
    if (!mediaSources.length && record.mime.startsWith('image/')) {
      let sourceUrlToRelease = null; let sourceCanvas = null;
      try {
        const original = new Image(); sourceUrlToRelease = URL.createObjectURL(record.sourceBlob); original.src = sourceUrlToRelease; await original.decode();
        if (original.naturalWidth * original.naturalHeight <= MAX_IMAGE_PIXELS) {
          sourceCanvas = document.createElement('canvas'); sourceCanvas.width = original.naturalWidth; sourceCanvas.height = original.naturalHeight;
          const context = sourceCanvas.getContext('2d', { willReadFrequently: true }); context.drawImage(original, 0, 0);
          const pixels = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
          const mediaSource = { kind: 'rgba-frames', width: sourceCanvas.width, height: sourceCanvas.height, frames: [{ width: sourceCanvas.width, height: sourceCanvas.height, data: new Uint8Array(pixels.data) }], loopCount: 0 };
          mediaSources = [{ id: 'legacy', label: '元の画像', kind: 'rgba-frames', mediaSource }];
        }
      } catch { /* Keep the original file downloadable when pixel decoding is unavailable. */ }
      finally { if (sourceCanvas) sourceCanvas.width = sourceCanvas.height = 1; if (sourceUrlToRelease) URL.revokeObjectURL(sourceUrlToRelease); }
    }
    if (!mediaSources.length) mediaSources = [{ id: 'legacy', label: record.source || '元のファイル', kind: 'legacy-file', blob: record.sourceBlob, mime: record.mime, extension: record.extension }];
    outputItems = record.outputs?.length ? record.outputs : [{ id: 'default', sourceId: mediaSources[0]?.id || '', mime: record.mime, extension: record.extension, filename: record.filename, blob: record.blob, metadata: record.currentMetadata || {} }];
    activeItem = outputItems[0];
    if (!activeItem.sourceId) activeItem.sourceId = mediaSources[0]?.id || '';
    setActiveItem(activeItem); fillSourceAndFormatControls({ preferredFormat: activeItem.extension }); renderOutputItems();
    filename.setAttribute('aria-label', `ファイル名（.${activeItem.extension}は固定）`);
  } catch (error) { setError(error?.message || '端末内の出力を開けませんでした。'); }
}

filename.addEventListener('input', syncFilename);
filename.addEventListener('change', async () => {
  if (!record) return;
  try {
    const updated = { ...activeItem, filename: currentFilename() };
    await persistOutputItems(outputItems.map((item) => item.id === activeItem.id ? updated : item));
    record.filename = activeItem.filename; renderOutputItems();
  } catch { status.textContent = 'ファイル名を保持できませんでした。画面を閉じる前にもう一度入力してください。'; }
});
formatButton.addEventListener('click', () => {
  formatPicker.hidden = !formatPicker.hidden;
  formatButton.setAttribute('aria-expanded', String(!formatPicker.hidden));
  if (!formatPicker.hidden) formatSelect.focus();
});
sourceSelect.addEventListener('change', () => {
  const source = mediaSources.find((item) => item.id === sourceSelect.value);
  const formats = sourceFormats(source);
  fillSourceAndFormatControls({ preferredFormat: activeItem?.extension });
  const nextFormat = formats.some(([value]) => value === activeItem?.extension) ? activeItem.extension : formats[0]?.[0];
  void generateOutputItem({ sourceId: source?.id, formatValue: nextFormat });
});
formatSelect.addEventListener('change', () => {
  jpegSetting.hidden = formatSelect.value !== 'jpeg';
  jpegQualitySetting.hidden = formatSelect.value !== 'jpeg';
  void generateOutputItem({ sourceId: sourceSelect.value, formatValue: formatSelect.value });
});
jpegSetting.addEventListener('change', () => {
  if (formatSelect.value === 'jpeg') void generateOutputItem({ sourceId: sourceSelect.value, formatValue: formatSelect.value });
});
jpegQuality.addEventListener('input', () => { jpegQualityValue.value = `${jpegQuality.value}%`; jpegQualityValue.textContent = `${jpegQuality.value}%`; });
jpegQuality.addEventListener('change', () => {
  if (formatSelect.value === 'jpeg') void generateOutputItem({ sourceId: sourceSelect.value, formatValue: formatSelect.value });
});
addOutputItem.addEventListener('click', () => { void addOutput(false); });
copyOutputItem.addEventListener('click', () => { void addOutput(true); });
deleteOutputItem.addEventListener('click', () => { void removeActiveOutput(); });
download.addEventListener('click', (event) => {
  if (!record || !fileUrl || !currentBlob) { event.preventDefault(); return; }
  syncFilename();
  status.textContent = 'ダウンロードを開始しました。完了はブラウザーの保存先で確認してください。';
  trackSave('download');
});
scaleInput.addEventListener('input', () => {
  if (!record) return;
  const frame = sourceFrames()[0]; const width = frame?.width || pngBaseSize?.width; const height = frame?.height || pngBaseSize?.height;
  if (!width || !height) return;
  const scale = Math.max(1, Math.min(maxScale, Math.round(Number(scaleInput.value) || 1)));
  widthInput.value = String(width * scale); heightInput.value = String(height * scale);
  updateScaleSummary(width, height, sourceFrames().length > 1 ? 'gif' : 'png', sourceFrames().length || 1);
});
function onDimensionInput(axis) {
  if (!record) return;
  const frame = sourceFrames()[0]; const width = frame?.width || pngBaseSize?.width; const height = frame?.height || pngBaseSize?.height;
  if (!width || !height) return;
  if (aspectLock.checked) {
    if (axis === 'width' && Number(widthInput.value) > 0) heightInput.value = String(Math.max(1, Math.round(Number(widthInput.value) * height / width)));
    if (axis === 'height' && Number(heightInput.value) > 0) widthInput.value = String(Math.max(1, Math.round(Number(heightInput.value) * width / height)));
  }
  updateScaleSummary(width, height, sourceFrames().length > 1 ? 'gif' : 'png', sourceFrames().length || 1);
}
widthInput.addEventListener('input', () => onDimensionInput('width'));
heightInput.addEventListener('input', () => onDimensionInput('height'));
aspectLock.addEventListener('change', () => { if (aspectLock.checked) onDimensionInput('width'); });
applySettings.addEventListener('click', () => { void applySelectedSize(); });
cancelSettings.addEventListener('click', () => { generationController?.abort(); });
animationToggle.addEventListener('click', () => {
  if (!posterUrl || !['image/gif', 'image/apng'].includes(record?.mime)) return;
  animationStopped = !animationStopped;
  image.src = animationStopped ? posterUrl : fileUrl;
  animationToggle.textContent = animationStopped ? 'アニメーションを再生' : 'アニメーションを停止';
  animationToggle.setAttribute('aria-pressed', String(animationStopped));
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  pageDisposed = true;
  generationController?.abort();
  for (const url of [sourceUrl, fileUrl, posterUrl, ...generatedDownloadUrls.values()]) if (url) URL.revokeObjectURL(url);
});

void mount();
