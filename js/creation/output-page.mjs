import { readToolOutput, saveToolOutputItems, saveToolOutputMedia, stageToolOutput, sanitizeOutputFilename } from './output-handoff.mjs?rev=20261009-preview-only-1';
import { inspectPixelPng } from '../pixel-png-metadata.mjs?rev=20260928-pixel-roundtrip-1';
import { encodeOutput } from './output-encoders.mjs?rev=20261008-output-7';
import { encodeImportedAudioWav, renderAudioWav } from './audio-export.mjs?rev=20261008-output-3';
import { chooseAudioVideoMimeType, renderAudioVideo } from './audio-video.mjs?rev=20261009-music-plays-1';
import { renderOutputVideo } from './output-video.mjs?rev=20261009-output-video-1';
import { boundedPreviewDimensions, createBoundedRasterPreview, fitOutputFrames, importOutputFiles, resolveRasterPreviewDimensions } from './output-import.mjs?rev=20261009-preview-only-2';
import { getEffectiveOutputFps, getOutputTiming, outputFpsToDelayMs } from './output-timing.mjs?rev=20261009-fps-1';
import { inferIntegerPixelScale, resizeRgbaNearest, shouldAutoSelectPixelOrigin, verifyPixelScaleClaim } from './output-render.mjs?rev=20261009-output-origin-restore-3';

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
const musicSourceField = $('#output-music-source-field');
const musicSourceSelect = $('#output-music-source');
const musicTotalPlaysHelp = $('#output-music-total-plays-help');
const musicTotalPlaysField = $('#output-music-total-plays-field');
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
const outputStart = $('#output-start');
const outputLayout = $('#output-layout');
const fileInput = $('#output-file-input');
const replacementInput = $('#output-audio-replacement-input');
const startChoose = $('#output-start-choose');
const dropTarget = $('#output-drop');
const importStatus = $('#output-import-status');
const importProgress = $('#output-import-progress');
const cancelImport = $('#output-cancel-import');
const assetsSection = $('#output-assets');
const assetsList = $('#output-assets-list');
const assetsNote = $('#output-assets-note');
const addAssetsButton = $('#output-add-assets');
const timelineCanvas = $('#output-timeline-preview');
const timelinePlay = $('#output-timeline-play');
const sequenceSettings = $('#output-sequence-settings');
const fpsInput = $('#output-fps');
const fpsPreset = $('#output-fps-preset');
const applyFps = $('#output-apply-fps');
const fpsCurrent = $('#output-fps-current');
const fpsHelp = $('#output-fps-help');
const loopField = $('#output-loop-field');
const loopCount = $('#output-loop-count');
const sequenceSummary = $('#output-sequence-summary');
const createVideoButton = $('#output-create-video');
const generationProgress = $('#output-generation-progress');
const cancelGeneration = $('#output-cancel-generation');
const musicTotalPlaysControl = $('#output-music-total-plays');
const viewControls = $('#output-view-controls');
const viewFitButton = $('#output-view-fit');
const viewZoomIn = $('#output-view-zoom-in');
const viewZoomOut = $('#output-view-zoom-out');
const viewZoomValue = $('#output-view-zoom-value');
const fileSettingsSummary = $('#output-file-summary');
const scaleSettingsSummary = $('#output-scale-summary');
const animationSettingsSummary = $('#output-animation-summary');
const audioSettingsSummary = $('#output-audio-summary');
const originHint = $('#output-origin-hint');
const originRestore = $('#output-origin-restore');

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
let previewUrl = null;
let previewEpoch = 0;
let currentBlob = null;
let pngBaseSize = null;
let maxScale = 1;
let currentScale = 1;
let posterUrl = null;
let animationStopped = false;
let pageDisposed = false;
let importController = null;
let timelineTimer = null;
let timelineFrameIndex = 0;
let assetPreviewUrls = [];
let pendingWrites = new Set();
let mediaSettings = { playbackRate: 1, totalPlays: 0, musicTotalPlays: 1, musicSourceId: '' };
let lastImportedMedia = null;
let mediaWritePending = false;
let itemWritePending = false;
let previewZoom = 1;
let rasterSettingsEpoch = 0;
let rasterSettingsController = null;
let rasterProfile = null;
let originRestoreItemId = '';
let originResizeActiveItemId = '';

function trackPending(promise) {
  const tracked = Promise.resolve(promise);
  pendingWrites.add(tracked);
  tracked.finally(() => pendingWrites.delete(tracked)).catch(() => {});
  return tracked;
}

function setError(message) {
  outputStart.hidden = true;
  outputLayout.hidden = true;
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

function showStart() {
  outputStart.hidden = false;
  outputLayout.hidden = true;
  pageTitle.textContent = '変換・書き出し';
  intro.textContent = '画像や音声を端末内で確認し、対応形式へ変換できます。';
  returnLink.href = '/tools/';
  returnLink.textContent = 'ツール一覧へ戻る';
}

function outputBaseName(value, ext) {
  const full = sanitizeOutputFilename(value, ext);
  return full.slice(0, -(ext.length + 1));
}

function currentFilename() {
  return record ? sanitizeOutputFilename(filename.value, activeItem?.extension || record.extension) : '';
}

function setPreviewZoom(value) {
  previewZoom = Math.max(0.5, Math.min(4, Math.round(value * 100) / 100));
  preview.style.setProperty('--output-preview-zoom', String(previewZoom));
  viewZoomValue.textContent = previewZoom === 1 ? '全体' : `${Math.round(previewZoom * 100)}%`;
  viewZoomOut.disabled = previewZoom <= 0.5;
  viewZoomIn.disabled = previewZoom >= 4;
}

function updatePreviewControls() {
  const hasVisual = !image.hidden || !video.hidden || !timelineCanvas.hidden;
  viewControls.hidden = !hasVisual;
  if (!hasVisual) setPreviewZoom(1);
}

function updateSettingsSummaries() {
  if (fileSettingsSummary) {
    const filenameText = activeItem?.filename || record?.filename || '出力を準備しています';
    const count = outputItems.length > 1 ? `${outputItems.length}項目 · ` : '';
    fileSettingsSummary.textContent = `${count}${filenameText}`;
  }
  if (scaleSettingsSummary) {
    const width = Number(widthInput.value); const height = Number(heightInput.value);
    scaleSettingsSummary.textContent = width > 0 && height > 0 ? `${width} × ${height}px` : '出力サイズ';
  }
  if (animationSettingsSummary) animationSettingsSummary.textContent = animationDetails.textContent || 'FPS・再生回数';
  if (audioSettingsSummary) audioSettingsSummary.textContent = audioDetails.textContent || '音声の設定';
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
  if (source?.kind === 'rgba-frames') {
    const frames = source.mediaSource.frames;
    const formats = frames.length > 1
      ? [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター'], ['gif', 'GIFアニメーション'], ['apng', 'APNGアニメーション']]
      : [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター']];
    const video = chooseAudioVideoMimeType();
    if (video) formats.push([video.extension, `${video.extension.toUpperCase()}動画`]);
    return formats;
  }
  if (source?.kind === 'audio-song') return [['wav', 'WAV音声']];
  if (source?.kind === 'audio-video') {
    const supported = chooseAudioVideoMimeType();
    return supported ? [[supported.extension, supported.extension.toUpperCase() + '動画']] : [];
  }
  if (source?.kind === 'legacy-image' && source.mediaSource?.frames?.length > 1) return [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター'], ['gif', 'GIFアニメーション'], ['apng', 'APNGアニメーション']];
  if (source?.kind === 'legacy-image') return [['png', 'PNG画像'], ['jpeg', 'JPEG画像'], ['svg', 'SVGベクター']];
  if (source?.kind === 'audio-buffer') return [['wav', 'WAV音声']];
  if (source?.kind === 'video-source') {
    const supported = chooseAudioVideoMimeType();
    return supported ? [[supported.extension, `${supported.extension.toUpperCase()}動画`]] : [];
  }
  if (source?.kind === 'legacy-file' && source.extension === 'pxd') return [];
  return source?.mime && source?.extension ? [[source.extension, displayFormat({ mime: source.mime, extension: source.extension })]] : [];
}

function rasterOutputDimensions(entry = record) {
  const activeItemMatchesSource = !activeItem?.sourceId || activeItem.sourceId === activeSource?.id;
  const frames = sourceFrames();
  return resolveRasterPreviewDimensions({ itemMetadata: activeItem?.metadata, currentMetadata: entry?.currentMetadata,
    recordMetadata: entry?.metadata, sourceMatches: activeItemMatchesSource, frameWidth: frames[0]?.width, frameHeight: frames[0]?.height });
}

function releaseRasterPreview() {
  previewEpoch += 1;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

function hasPixelArtEvidence() {
  return rasterProfile?.sourceId === activeSource?.id && ['detected', 'verified'].includes(rasterProfile.status);
}

async function showRasterPreview(blob, { width, height, animated = false, pixelArt = false } = {}) {
  releaseRasterPreview();
  const epoch = previewEpoch;
  image.hidden = true;
  fileCard.hidden = true;
  image.dataset.pixelArt = String(pixelArt);
  const target = width && height ? boundedPreviewDimensions(width, height) : null;
  const needsDownsample = target && (target.width !== width || target.height !== height);
  if (!target) {
    fileExtension.textContent = (activeItem?.extension || record?.extension || 'file').toUpperCase();
    fileTitle.textContent = 'プレビューを準備できませんでした';
    fileDescription.textContent = '画像の寸法を確認できません。安全なプレビューを表示できませんが、元のファイルは保存できます。';
    fileCard.hidden = false;
    updatePreviewControls();
    return;
  }
  if (animated || !needsDownsample) {
    image.src = fileUrl;
    image.hidden = false;
    return;
  }
  try {
    const previewBlob = await createBoundedRasterPreview(blob, {
      width, height, resizeQuality: pixelArt ? 'pixelated' : 'high'
    });
    if (pageDisposed || epoch !== previewEpoch) return;
    previewUrl = URL.createObjectURL(previewBlob);
    image.src = previewUrl;
    image.hidden = false;
  } catch (error) {
    if (pageDisposed || epoch !== previewEpoch) return;
    fileExtension.textContent = (activeItem?.extension || record?.extension || 'file').toUpperCase();
    fileTitle.textContent = 'プレビューを準備できませんでした';
    fileDescription.textContent = error?.message || '画像の展開に失敗しました。元のファイルは保存できます。';
    fileCard.hidden = false;
    updatePreviewControls();
  }
  image.dataset.pixelArt = String(pixelArt);
}

function availableMusicSources() {
  const audioSources = mediaSources.filter((source) => ['audio-buffer', 'audio-song'].includes(source.kind));
  return audioSources.length ? audioSources : mediaSources.filter((source) => source.kind === 'audio-video');
}

function selectedMusicSource() {
  const sources = availableMusicSources();
  return sources.find((source) => source.id === mediaSettings.musicSourceId) || sources.at(-1) || null;
}

function musicDurationSeconds(source) {
  if (source?.kind === 'audio-buffer') return source.durationSeconds;
  if (source?.song) return source.song.loopTicks * 60 / source.song.tempo / 480;
  return 0;
}

function audioBufferSource() {
  const source = selectedMusicSource();
  return source?.kind === 'audio-buffer' ? source : null;
}

function updateMusicPlayControl() {
  if (!musicTotalPlaysControl) return;
  const musicSources = availableMusicSources();
  const musicSource = selectedMusicSource();
  const hasMusic = Boolean(musicSource);
  const hasVideoFormat = ['mp4', 'webm'].includes(formatSelect.value) && Boolean(chooseAudioVideoMimeType());
  const songSeconds = musicDurationSeconds(musicSource);
  const musicViaWav = Boolean(musicSource?.song && activeSource?.kind !== 'audio-video');
  const maximumSeconds = musicViaWav ? 118.8 : 120;
  const maximumPlays = songSeconds > 0 ? Math.max(1, Math.min(8, Math.floor(maximumSeconds / songSeconds))) : 8;
  const visible = hasMusic && hasVideoFormat;
  if (musicSourceSelect) {
    musicSourceSelect.replaceChildren();
    for (const source of musicSources) {
      const option = document.createElement('option'); option.value = source.id;
      option.textContent = source.label || (source.kind === 'audio-buffer' ? '読み込んだ音声' : '曲の音声');
      musicSourceSelect.append(option);
    }
    musicSourceSelect.value = musicSource?.id || '';
    musicSourceField.hidden = !visible || musicSources.length < 2;
    musicSourceSelect.disabled = mediaWritePending || itemWritePending || Boolean(generationController) || Boolean(importController) || !visible;
  }
  if (musicTotalPlaysField) musicTotalPlaysField.hidden = !visible;
  musicTotalPlaysControl.hidden = !visible;
  if (musicTotalPlaysHelp) musicTotalPlaysHelp.hidden = !visible;
  if (audioSettings) audioSettings.hidden = !visible;
  musicTotalPlaysControl.disabled = mediaWritePending || itemWritePending || Boolean(generationController) || Boolean(importController) || !visible;
  for (const option of [...musicTotalPlaysControl.options]) option.disabled = Number(option.value) > maximumPlays;
  const selectedPlays = Math.max(1, Math.min(maximumPlays, Number(mediaSettings.musicTotalPlays) || 1));
  if (hasMusic) {
    mediaSettings.musicSourceId = musicSource.id;
    musicTotalPlaysControl.value = String(selectedPlays);
    audioDetails.textContent = [musicSource.label, songSeconds > 0 ? `${songSeconds.toFixed(2)}秒` : ''].filter(Boolean).join(' · ');
  }
}

function outputMime(formatValue) {
  return ({ png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', apng: 'image/apng', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' })[formatValue] || '';
}

async function renderSongAudioSource(source, totalPlays, signal) {
  if (!source?.song) throw new TypeError('音楽素材を読み込めません。');
  const rendered = await renderAudioWav(source.song, { loops: totalPlays });
  if (signal?.aborted) throw new DOMException('動画の作成を中止しました。', 'AbortError');
  const AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextImpl) throw new Error('このブラウザーでは音楽を動画に合成できません。画像と曲の元データは保持されています。');
  const context = new AudioContextImpl();
  try {
    const decoded = await context.decodeAudioData(await rendered.blob.arrayBuffer());
    const frames = Math.min(decoded.length, Math.ceil(rendered.seconds * decoded.sampleRate));
    return {
      sampleRate: decoded.sampleRate,
      durationSeconds: frames / decoded.sampleRate,
      channels: Array.from({ length: Math.min(2, decoded.numberOfChannels) }, (_, channel) => decoded.getChannelData(channel).slice(0, frames))
    };
  } finally { if (context.state !== 'closed') { try { await context.close(); } catch {} } }
}

function setActiveItem(item) {
  const previousFileUrl = fileUrl;
  const previousSourceUrl = sourceUrl;
  activeItem = item;
  setPreviewZoom(1);
  const foundSource = mediaSources.find((source) => source.id === item.sourceId);
  activeSource = foundSource || mediaSources[0] || null;
  record.mime = item.mime; record.extension = item.extension; record.filename = item.filename; record.blob = item.blob;
  item.metadata = { ...(record.metadata || {}), ...(item.metadata || {}) };
  record.currentMetadata = item.metadata;
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
  updateSettingsSummaries();
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
    select.disabled = Boolean(itemWritePending || mediaWritePending || generationController);
    const type = document.createElement('strong'); type.textContent = item.extension.toUpperCase();
    const name = document.createElement('span'); name.textContent = item.filename;
    select.append(type, name); select.addEventListener('click', () => activateItem(item.id));
    const save = document.createElement('a'); save.className = 'output-item__download'; save.href = url; save.download = item.filename; save.textContent = '保存'; save.setAttribute('aria-label', `${item.filename}をダウンロード`);
    save.addEventListener('click', () => { status.textContent = 'ダウンロードを開始しました。完了はブラウザーの保存先で確認してください。'; trackSave('download'); });
    row.append(select, save); outputItemsList.append(row);
  }
  deleteOutputItem.disabled = itemWritePending || mediaWritePending || Boolean(generationController) || outputItems.length <= 1;
  copyOutputItem.disabled = itemWritePending || mediaWritePending || Boolean(generationController) || outputItems.length >= 12;
  addOutputItem.disabled = itemWritePending || mediaWritePending || Boolean(generationController) || outputItems.length >= 12;
  updateSettingsSummaries();
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
  createVideoButton.hidden = !['mp4', 'webm'].includes(formatSelect.value);
  formatHelp.hidden = formats.length <= 1;
  addOutputItem.hidden = formats.length === 0;
  copyOutputItem.hidden = formats.length === 0;
  deleteOutputItem.hidden = formats.length === 0;
  jpegSetting.hidden = formatSelect.value !== 'jpeg';
  jpegQualitySetting.hidden = formatSelect.value !== 'jpeg';
  formatPicker.hidden = true;
  formatButton.setAttribute('aria-expanded', 'false');
  updateMusicPlayControl();
  updateSequenceControls();
  const previewOnly = Boolean(record?.metadata?.previewOnly || activeItem?.metadata?.previewOnly);
  if (previewOnly) {
    formatButton.hidden = true; formatSelect.disabled = true; formatPicker.hidden = true;
    addOutputItem.hidden = copyOutputItem.hidden = deleteOutputItem.hidden = true;
    applySettings.disabled = true; scaleSettings.hidden = true; animationSettings.hidden = audioSettings.hidden = true;
    createVideoButton.hidden = true;
  }
  updateSettingsSummaries();
}

function frameDuration(frames) { return getOutputTiming(frames, { format: 'video' }).sourceDurationMs; }

function effectiveFrameDelay(frame, formatValue = formatSelect.value, rate = Number(mediaSettings.playbackRate) || 1) {
  const target = formatValue === 'gif' ? 'gif' : formatValue === 'apng' ? 'apng' : 'video';
  return getOutputTiming([frame], { format: target, playbackRate: rate }).previewDelaysMs[0];
}

function stopTimelinePreview() {
  if (timelineTimer !== null) clearTimeout(timelineTimer);
  timelineTimer = null;
  timelinePlay.setAttribute('aria-pressed', 'false');
  timelinePlay.textContent = 'コマ送りを再生';
}

function paintTimelineFrame(index) {
  const frames = sourceFrames();
  if (!frames.length) return;
  timelineFrameIndex = Math.max(0, Math.min(frames.length - 1, index));
  const frame = frames[timelineFrameIndex];
  const dimensions = boundedPreviewDimensions(frame.width, frame.height);
  const previewFrame = dimensions.width === frame.width && dimensions.height === frame.height
    ? frame : resizeRgbaNearest(frame, dimensions.width, dimensions.height, { maxEdge: 1536, maxPixels: 2_000_000 });
  timelineCanvas.width = previewFrame.width; timelineCanvas.height = previewFrame.height;
  const context = timelineCanvas.getContext('2d');
  context?.putImageData(new ImageData(new Uint8ClampedArray(previewFrame.data), previewFrame.width, previewFrame.height), 0, 0);
}

function playTimelineNext() {
  const frames = sourceFrames();
  if (frames.length < 2) return;
  const rate = Number(mediaSettings.playbackRate) || 1;
  timelineFrameIndex += 1;
  if (timelineFrameIndex >= frames.length) {
    const loops = Number(mediaSettings.totalPlays) || 0;
    const currentLoops = Number(timelinePlay.dataset.loop || 0) + 1;
    timelinePlay.dataset.loop = String(currentLoops);
    if (loops > 0 && currentLoops >= loops) { stopTimelinePreview(); timelinePlay.dataset.loop = '0'; return; }
    timelineFrameIndex = 0;
  }
  paintTimelineFrame(timelineFrameIndex);
  const delay = effectiveFrameDelay(frames[timelineFrameIndex], formatSelect.value, rate);
  timelineTimer = setTimeout(playTimelineNext, delay);
}

function updateSequenceControls() {
  const frames = sourceFrames();
  const isSequence = frames.length > 1;
  const formatValue = formatSelect.value;
  sequenceSettings.hidden = !isSequence || !['gif', 'apng', 'mp4', 'webm'].includes(formatValue);
  const settingsDisabled = mediaWritePending || itemWritePending || Boolean(generationController) || Boolean(importController);
  fpsInput.disabled = settingsDisabled || !isSequence;
  applyFps.disabled = settingsDisabled || !isSequence;
  if (!isSequence) { animationSettings.hidden = activeItem?.extension !== 'gif' && activeItem?.extension !== 'apng'; updateSettingsSummaries(); return; }
  animationSettings.hidden = false;
  const targetFormat = formatValue === 'gif' ? 'gif' : formatValue === 'apng' ? 'apng' : 'video';
  const fps = getEffectiveOutputFps(frames, { format: targetFormat, playbackRate: Number(mediaSettings.playbackRate) || 1 });
  const fpsText = fps === null ? '' : Number(fps.toPrecision(8)).toString();
  fpsInput.value = fpsText;
  fpsCurrent.textContent = fps === null ? '可変' : `現在 ${fpsText} FPS`;
  fpsInput.min = String(targetFormat === 'gif' ? 1000 / 655350 : 1000 / 3600000);
  fpsInput.max = String(targetFormat === 'gif' ? 50 : 1000);
  fpsHelp.textContent = fps === null
    ? 'この素材は可変FPSです。数値を全コマに適用すると統一できます。'
    : targetFormat === 'gif'
      ? 'GIFは20〜655,350msを10ms単位で記録します。'
      : targetFormat === 'video'
        ? '動画の映像コマは最大60fpsで記録します。短いコマは記録間隔で近似されます。音声は元の速度で再生します。'
        : 'APNGは1ms以上のコマ時間で記録します。';
  const animatedFormat = ['gif', 'apng'].includes(formatValue);
  loopField.hidden = !animatedFormat;
  const loopValue = Number(mediaSettings.totalPlays ?? activeSource?.mediaSource?.totalPlays ?? activeSource?.mediaSource?.loopCount ?? 0);
  for (const option of [...loopCount.options]) if (option.dataset.original === 'true') option.remove();
  if (![0, 1, 2, 3].includes(loopValue)) {
    const option = new Option(`元ファイルと同じ（${loopValue === 0 ? '無限' : `${loopValue}回`}）`, String(loopValue)); option.dataset.original = 'true'; loopCount.add(option, 0);
  }
  loopCount.value = String(loopValue);
  const rate = Number(mediaSettings.playbackRate) || 1;
  const onePassSeconds = getOutputTiming(frames, { format: ['gif', 'apng'].includes(formatValue) ? formatValue : 'video', playbackRate: rate }).durationMs / 1000;
  const musicSource = ['mp4', 'webm'].includes(formatValue) ? selectedMusicSource() : null;
  const musicPlays = Math.max(1, Math.min(8, Number(mediaSettings.musicTotalPlays) || 1));
  const videoDuration = musicSource ? musicDurationSeconds(musicSource) * musicPlays : onePassSeconds;
  sequenceSummary.textContent = musicSource
    ? `1巡 ${onePassSeconds.toFixed(2)}秒 · 動画は音楽${musicPlays}回の終わり（約${videoDuration.toFixed(2)}秒）で終了。映像FPSを変えても音楽の速度と音程は変わりません。動画は最大60fpsで記録するため、短いコマはブラウザーの記録間隔で近似されます。`
    : ['mp4', 'webm'].includes(formatValue)
      ? `1巡 ${onePassSeconds.toFixed(2)}秒 · 動画は1巡で終了します。最大60fpsで記録するため、短いコマはブラウザーの記録間隔で近似されます。`
      : formatValue === 'gif'
        ? `1巡 ${onePassSeconds.toFixed(2)}秒 · GIFは20〜655,350msを10ms単位で書き出します。`
        : `1巡 ${onePassSeconds.toFixed(2)}秒 · APNGは1ms以上のコマ時間で書き出します。`;
  animationDetails.textContent = `${frames.length}コマ · 1巡 ${onePassSeconds.toFixed(2)}秒 · 画面操作でプレビューできます。`;
  timelinePlay.hidden = !(activeSource?.id.startsWith('local-images') && isSequence && ['png', 'jpeg', 'svg'].includes(activeItem?.extension));
  timelineCanvas.hidden = timelinePlay.hidden;
  if (!timelineCanvas.hidden) paintTimelineFrame(timelineFrameIndex);
  updateSettingsSummaries();
}

function renderAssets() {
  for (const url of assetPreviewUrls) URL.revokeObjectURL(url);
  assetPreviewUrls = [];
  assetsList.replaceChildren();
  const controlsDisabled = mediaWritePending || Boolean(generationController) || Boolean(importController);
  addAssetsButton.disabled = controlsDisabled;
  const imageSources = mediaSources.filter((source) => source.kind === 'rgba-frames' && source.id.startsWith('local-images'));
  const audioSources = mediaSources.filter((source) => source.kind === 'audio-buffer');
  const videoSources = mediaSources.filter((source) => source.kind === 'video-source');
  const localAssets = [...imageSources, ...audioSources, ...videoSources];
  assetsSection.hidden = !localAssets.length;
  if (!localAssets.length) return;
  for (const source of imageSources) {
    const frames = source.mediaSource.frames;
    frames.forEach((frame, index) => {
      const row = document.createElement('div'); row.className = 'output-asset-row';
      const name = document.createElement('span'); name.className = 'output-asset-row__name'; name.textContent = frame.name || `${source.label} · ${index + 1}`;
      const controls = document.createElement('div'); controls.className = 'output-asset-row__controls';
      const move = (delta) => {
        const nextIndex = index + delta; if (nextIndex < 0 || nextIndex >= frames.length) return;
        const nextFrames = frames.slice(); [nextFrames[index], nextFrames[nextIndex]] = [nextFrames[nextIndex], nextFrames[index]];
        void persistMediaSources(mediaSources.map((item) => item.id === source.id ? { ...item, mediaSource: { ...item.mediaSource, frames: nextFrames } } : item));
      };
      const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.setAttribute('aria-label', `${name.textContent}を前へ`); up.disabled = index === 0;
      const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.setAttribute('aria-label', `${name.textContent}を後ろへ`); down.disabled = index === frames.length - 1;
      up.disabled ||= controlsDisabled; down.disabled ||= controlsDisabled;
      up.addEventListener('click', () => move(-1)); down.addEventListener('click', () => move(1)); controls.append(up, down);
      if (frames.length > 1) {
        const duration = document.createElement('input'); duration.type = 'number'; duration.min = String(1000 / 3600000); duration.max = '1000'; duration.step = 'any'; duration.value = String(Number((1000 / (frame.delayMs || 500)).toPrecision(12))); duration.inputMode = 'decimal';
        duration.dataset.currentFps = duration.value;
        duration.setAttribute('aria-label', `${name.textContent}のFPS`);
        duration.disabled = controlsDisabled;
        duration.addEventListener('change', () => {
          const fps = Number(duration.value);
          if (fps === Number(duration.dataset.currentFps)) return;
          let delayMs;
          try { delayMs = outputFpsToDelayMs(fps); }
          catch { status.textContent = 'FPSは0.000278〜1000の範囲で指定してください。'; renderAssets(); return; }
          const nextFrames = frames.map((entry, i) => i === index ? { ...entry, delayMs } : entry);
          void persistMediaSources(mediaSources.map((item) => item.id === source.id ? { ...item, mediaSource: { ...item.mediaSource, frames: nextFrames } } : item));
        });
        controls.append(duration);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '削除'; remove.setAttribute('aria-label', `${name.textContent}を削除`); remove.disabled = frames.length <= 1;
      remove.disabled ||= controlsDisabled;
      remove.addEventListener('click', () => {
        if (frames.length <= 1) return;
        const nextFrames = frames.filter((_, i) => i !== index);
        void persistMediaSources(mediaSources.map((item) => item.id === source.id ? { ...item, label: `画像 (${nextFrames.length}コマ)`, mediaSource: { ...item.mediaSource, frames: nextFrames } } : item));
      });
      controls.append(remove); row.append(name, controls); assetsList.append(row);
    });
  }
  for (const source of audioSources) {
    const row = document.createElement('div'); row.className = 'output-asset-row';
    const name = document.createElement('span'); name.className = 'output-asset-row__name'; name.textContent = `${source.label} · ${source.durationSeconds.toFixed(1)}秒 · ${source.channels.length === 1 ? 'モノラル' : 'ステレオ'} ${source.sampleRate}Hz`;
    const controls = document.createElement('div'); controls.className = 'output-asset-row__controls';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '削除'; remove.setAttribute('aria-label', `${source.label}を削除`);
    remove.disabled = outputItems.some((item) => item.sourceId === source.id);
    remove.disabled ||= controlsDisabled;
    remove.addEventListener('click', () => void persistMediaSources(mediaSources.filter((item) => item.id !== source.id)));
    const replace = document.createElement('button'); replace.type = 'button'; replace.textContent = '置き換え'; replace.setAttribute('aria-label', `${source.label}を別の音声に置き換え`); replace.disabled = controlsDisabled;
    replace.addEventListener('click', () => replacementInput.click());
    controls.append(remove, replace); row.append(name, controls); assetsList.append(row);
  }
  for (const source of videoSources) {
    const row = document.createElement('div'); row.className = 'output-asset-row';
    const name = document.createElement('span'); name.className = 'output-asset-row__name'; name.textContent = `${source.label} · ${source.durationSeconds.toFixed(1)}秒 · ${source.width}×${source.height}`;
    const sourceVideo = document.createElement('video'); sourceVideo.className = 'output-asset-row__video-preview'; sourceVideo.controls = true; sourceVideo.playsInline = true; sourceVideo.preload = 'metadata'; sourceVideo.setAttribute('aria-label', `${source.label}の動画プレビュー`);
    const previewUrl = URL.createObjectURL(source.blob); assetPreviewUrls.push(previewUrl); sourceVideo.src = previewUrl;
    const controls = document.createElement('div'); controls.className = 'output-asset-row__controls';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '削除'; remove.setAttribute('aria-label', `${source.label}を削除`);
    remove.disabled = controlsDisabled || outputItems.some((item) => item.sourceId === source.id);
    remove.addEventListener('click', () => void persistMediaSources(mediaSources.filter((item) => item.id !== source.id)));
    controls.append(remove); row.append(name, sourceVideo, controls); assetsList.append(row);
  }
  const frames = imageSources.reduce((all, source) => [...all, ...source.mediaSource.frames], []);
  assetsNote.textContent = frames.length > 1 ? `↑↓で順番を変更 · 各コマのFPSを編集 · 合計 ${((frameDuration(frames) / 1000) / (Number(mediaSettings.playbackRate) || 1)).toFixed(2)}秒` : '画像は元の縦横比を保って読み込みました。';
}

async function persistMediaSources(nextSources, nextSettings = mediaSettings) {
  if (!record || mediaWritePending || itemWritePending || generationController) {
    status.textContent = '別の出力処理中です。終わってからもう一度操作してください。';
    return false;
  }
  mediaWritePending = true; renderAssets();
  try {
    const saved = await trackPending(saveToolOutputMedia(record.id, nextSources, nextSettings, { expectedRevision: record.revision || 0 }));
    mediaSources = saved.mediaSources; mediaSettings = saved.mediaSettings;
    record.revision = saved.revision;
    activeSource = mediaSources.find((source) => source.id === activeSource?.id) || mediaSources[0] || null;
    record.mediaSources = mediaSources; record.mediaSettings = mediaSettings; record.mediaSource = activeSource?.mediaSource || null;
    fillSourceAndFormatControls({ preferredFormat: formatSelect.value || activeItem?.extension });
    renderAssets(); updateSequenceControls(); setMedia(record); updateMusicPlayControl();
    status.textContent = '素材の並びと設定を保存しました。出力ファイルは次の作成時に反映します。';
    return true;
  } catch (error) {
    status.textContent = error?.message || '素材設定を保存できませんでした。前の設定はそのままです。';
    return false;
  } finally { mediaWritePending = false; renderAssets(); }
}

function sourcesFromImport(imported) {
  const sources = [];
  if (imported.frames.length) sources.push({ id: 'local-images', label: `画像 (${imported.frames.length}コマ)`, kind: 'rgba-frames', mediaSource: { kind: 'rgba-frames', width: imported.frames[0].width, height: imported.frames[0].height, frames: imported.frames, totalPlays: imported.totalPlays ?? 1 } });
  if (imported.audio) sources.push({ id: 'local-audio', label: imported.audio.name, kind: 'audio-buffer', sampleRate: imported.audio.sampleRate, durationSeconds: imported.audio.durationSeconds, channels: imported.audio.channels });
  if (imported.video) sources.push({ id: 'local-video', label: imported.video.name, kind: 'video-source', blob: imported.video.blob, mime: imported.video.mime, width: imported.video.width, height: imported.video.height, durationSeconds: imported.video.durationSeconds });
  return sources;
}

async function handleImport(files, { replaceAudio = false } = {}) {
  if (importController) return;
  const selected = [...(files || [])]; if (!selected.length) return;
  const controller = new AbortController(); importController = controller;
  if (record) renderAssets();
  const targetStatus = record ? status : importStatus;
  targetStatus.textContent = 'ファイルを端末内で読み込んでいます…';
  importProgress.hidden = Boolean(record); importProgress.value = 0;
  if (record) { generationProgress.hidden = false; generationProgress.value = 0; cancelGeneration.hidden = false; }
  cancelImport.hidden = false; startChoose.disabled = true; addAssetsButton.disabled = true;
  try {
    const imported = await importOutputFiles(selected, { signal: controller.signal, onProgress: ({ current, total, name, frameProgress, framesDone, framesTotal }) => {
      const portion = Number.isFinite(frameProgress) ? (current - 1 + frameProgress) / total : current / total;
      const progress = Math.round(portion * 100); importProgress.value = progress; generationProgress.value = progress;
      targetStatus.textContent = Number.isFinite(frameProgress)
        ? `${name}のコマを読み込み中（${framesDone}/${framesTotal}）…`
        : `${name}を読み込み中（${current}/${total}）…`;
    } });
    if (controller.signal.aborted || pageDisposed) return;
    if (imported.previewOnly && record) throw new Error('この画像はプレビュー専用のため、既存の出力素材には追加できません。現在の出力は保持されています。');
    const newSources = sourcesFromImport(imported);
    if (record) {
      let next = [...mediaSources];
      if (replaceAudio) {
        const existingAudio = audioBufferSource();
        const replacement = newSources.find((source) => source.kind === 'audio-buffer');
        if (!existingAudio || selected.length !== 1 || !replacement || imported.frames.length) throw new Error('置き換えには音声ファイルを1つだけ選んでください。画像や既存素材は変更していません。');
        replacement.id = existingAudio.id;
        next = next.map((source) => source.id === existingAudio.id ? replacement : source);
      } else if (imported.audio && audioBufferSource()) {
        throw new Error('音声素材は1つまでです。音声素材の「置き換え」から新しい音声を選んでください。');
      }
      const appendedImages = newSources.find((source) => source.kind === 'rgba-frames');
      const existingImages = next.find((source) => source.kind === 'rgba-frames' && source.id === 'local-images');
      if (!replaceAudio && appendedImages && existingImages) {
        const frames = fitOutputFrames([...existingImages.mediaSource.frames, ...appendedImages.mediaSource.frames]);
        const merged = { ...existingImages, label: `画像 (${frames.length}コマ)`, mediaSource: { ...existingImages.mediaSource, width: frames[0].width, height: frames[0].height, frames } };
        next = next.map((source) => source.id === existingImages.id ? merged : source);
      }
      const additions = replaceAudio ? [] : newSources.filter((source) => !(appendedImages && existingImages && source === appendedImages));
      for (const source of additions) {
        if (next.some((item) => item.id === source.id)) source.id = `${source.id}-${createItemId().slice(0, 8)}`;
        next.push(source);
      }
      if (next.length > 8) throw new RangeError('素材は8種類まで追加できます。不要な素材を削除してください。');
      if (!(await persistMediaSources(next))) throw new Error('素材を端末内に保存できませんでした。元の素材と出力はそのままです。');
      if (replaceAudio) {
        const refreshed = await generateOutputItem({ sourceId: audioBufferSource()?.id, formatValue: 'wav' });
        if (refreshed) targetStatus.textContent = '音声を置き換え、新しいWAVをプレビューできる状態にしました。';
      } else targetStatus.textContent = `${selected.length}個のファイルを追加しました。素材の順番と表示時間を調整できます。`;
      updateSequenceControls(); renderAssets();
    } else {
      let initialBlob; let initialFilename; let metadataValue = {};
      if (imported.previewOnly) {
        initialBlob = imported.previewOnly.file;
        const suffix = imported.previewOnly.mime === 'image/jpeg' ? 'jpeg' : 'png';
        const sourceName = String(imported.previewOnly.file.name || `original.${suffix}`).split(/[\\/]/).pop();
        const stem = sourceName.replace(/\.[a-z0-9]{1,8}$/i, '') || 'original';
        initialFilename = `${stem}.${suffix}`;
        metadataValue = { width: imported.previewOnly.width, height: imported.previewOnly.height, previewOnly: true,
          description: 'プレビューのみ。編集・変換はできません。原本ファイルを保存できます。' };
      } else if (imported.frames.length) {
        initialBlob = await canvasRaster(imported.frames[0], 'image/png');
        initialFilename = 'pixieed-image.png';
        metadataValue = { width: imported.frames[0].width, height: imported.frames[0].height, frameCount: imported.frames.length };
      } else if (imported.video?.poster) {
        initialBlob = await canvasRaster(imported.video.poster, 'image/png');
        initialFilename = 'pixieed-video-preview.png';
        metadataValue = { width: imported.video.width, height: imported.video.height, durationSeconds: imported.video.durationSeconds, description: '動画の最初の映像コマをプレビューしています。' };
      } else {
        initialBlob = await encodeImportedAudioWav(newSources.find((source) => source.kind === 'audio-buffer'), {
          signal: controller.signal,
          onProgress: (progress) => { const value = 70 + Math.round(progress * 30); importProgress.value = value; targetStatus.textContent = `WAVを書き出しています（${value - 70}%）…`; }
        });
        initialFilename = 'pixieed-audio.wav';
        metadataValue = { durationSeconds: imported.audio.durationSeconds, sampleRate: imported.audio.sampleRate };
      }
      const staged = await stageToolOutput({ blob: initialBlob, filename: initialFilename, returnUrl: '/output/', metadata: metadataValue, mediaSources: newSources, mediaSettings: { playbackRate: 1, totalPlays: imported.totalPlays ?? 1, musicTotalPlays: 1 }, title: '変換・書き出し', source: 'この端末の素材' });
      targetStatus.textContent = '端末内に素材を保持しました。出力ページを開いています…';
      location.assign(staged.url);
    }
  } catch (error) {
    if (error?.name !== 'AbortError') targetStatus.textContent = error?.message || 'ファイルを読み込めませんでした。元の出力と素材はそのままです。';
    else targetStatus.textContent = '読み込みを中止しました。選択前の素材と出力は保持されています。';
  } finally {
    if (importController === controller) importController = null;
    importProgress.hidden = true; cancelImport.hidden = true; startChoose.disabled = false; addAssetsButton.disabled = false; fileInput.value = ''; replacementInput.value = '';
    if (record) { generationProgress.hidden = true; cancelGeneration.hidden = true; }
    if (record) renderAssets();
  }
}

async function persistOutputItems(nextItems, { duringGeneration = false } = {}) {
  if (itemWritePending || mediaWritePending || (generationController && !duringGeneration)) throw new Error('別の出力を保存しています。少し待ってからもう一度お試しください。');
  itemWritePending = true; renderOutputItems();
  try {
    const saved = await trackPending(saveToolOutputItems(record.id, nextItems, { expectedRevision: record.revision || 0 }));
    outputItems = saved.items; record.revision = saved.revision;
    activeItem = outputItems.find((item) => item.id === activeItem?.id) || outputItems[0];
    return outputItems;
  } finally { itemWritePending = false; renderOutputItems(); }
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
  const previewOnly = Boolean(record?.metadata?.previewOnly || activeItem?.metadata?.previewOnly);
  applySettings.disabled = busy || previewOnly;
  scaleInput.disabled = busy;
  for (const button of presets.querySelectorAll('button')) button.disabled = busy;
  widthInput.disabled = busy;
  heightInput.disabled = busy;
  aspectLock.disabled = busy;
  sourceSelect.disabled = busy;
  formatSelect.disabled = busy || previewOnly;
  createVideoButton.disabled = busy;
  addOutputItem.disabled = busy || outputItems.length >= 12;
  copyOutputItem.disabled = busy || outputItems.length >= 12;
  deleteOutputItem.disabled = busy || outputItems.length <= 1;
  cancelSettings.hidden = !busy || !canCancel;
  cancelSettings.disabled = false;
  cancelGeneration.hidden = !busy || !canCancel;
  cancelGeneration.disabled = false;
  generationProgress.hidden = !busy;
  if (busy) generationProgress.value = 0;
  scaleSettings.setAttribute('aria-busy', String(busy));
  jpegQuality.disabled = busy;
  renderAssets();
}

function setCurrentBlob(blob, { width = null, height = null, animated = false } = {}) {
  const previous = fileUrl;
  currentBlob = blob;
  fileUrl = URL.createObjectURL(blob);
  download.href = fileUrl;
  if (record.mime.startsWith('image/')) {
    if (animated) {
      animationStopped = false;
      animationToggle.textContent = 'アニメーションを停止';
      animationToggle.setAttribute('aria-pressed', 'false');
      animationToggle.hidden = true;
    }
  } else if (record.mime === 'audio/wav') audio.src = fileUrl;
  else if (record.mime.startsWith('video/')) video.src = fileUrl;
  if (previous && previous !== sourceUrl) URL.revokeObjectURL(previous);
  displayMetadata(record, blob, width, height);
  updatePreviewControls();
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
  if ((source?.kind === 'rgba-frames' || source?.kind === 'legacy-image') && !['mp4', 'webm'].includes(formatValue)) {
    const originalFrames = source.kind === 'rgba-frames' ? source.mediaSource.frames : source.mediaSource?.frames;
    const rate = Number(mediaSettings.playbackRate) || 1;
    const timing = getOutputTiming(originalFrames, { format: formatValue === 'gif' ? 'gif' : 'apng', playbackRate: rate });
    if (formatValue === 'gif' && timing.frameDelaysMs.some((delay) => delay > 655350)) throw new RangeError('GIFのコマ時間は20〜655,350msです。APNGを選ぶか、再生速度を上げてください。');
    const frames = originalFrames.map((frame, index) => ({ ...frame, delayMs: timing.frameDelaysMs[index] }));
    if (!Array.isArray(frames) || !frames.length) throw new Error('画像の元データを確認できません。');
    const totalPlays = mediaSettings.totalPlays ?? source.mediaSource.totalPlays ?? source.mediaSource.loopCount ?? 0;
    return { blob: await encodeOutput({ format: formatValue, frames, width: dimensions?.width || null, height: dimensions?.height || null, background: $('#output-jpeg-background')?.value || '#ffffff', quality: Number(jpegQuality.value) / 100, totalPlays }, { encodeRaster: canvasRaster, signal: controller.signal, onProgress: (progress) => { generationProgress.value = Math.round(progress * 100); } }), metadata: {} };
  }
  if (source?.kind === 'audio-song' && formatValue === 'wav') {
    const result = await renderAudioWav(source.song);
    return { blob: result.blob, metadata: { durationSeconds: result.seconds, sampleRate: 44100, loops: result.loops } };
  }
  if (source?.kind === 'audio-buffer' && formatValue === 'wav') {
    const blob = await encodeImportedAudioWav(source, { signal: controller.signal, onProgress: (progress) => { generationProgress.value = Math.round(progress * 100); } });
    return { blob, metadata: { durationSeconds: source.durationSeconds, sampleRate: source.sampleRate } };
  }
  if (['rgba-frames', 'video-source'].includes(source?.kind) && ['mp4', 'webm'].includes(formatValue)) {
    const selectedMusic = selectedMusicSource();
    const audioSource = audioBufferSource();
    const totalMusicPlays = Math.max(1, Math.min(8, Number(mediaSettings.musicTotalPlays) || 1));
    const rate = Number(mediaSettings.playbackRate) || 1;
    const frames = source.kind === 'rgba-frames' ? source.mediaSource.frames : [];
    const mimeChoice = chooseAudioVideoMimeType();
    if (!mimeChoice || mimeChoice.extension !== formatValue) throw new Error('このブラウザーが実際に作成できる動画形式と選択内容が一致しません。画像と音声の元データは保持されています。');
    let videoSource = null; let videoUrl = null;
    if (source.kind === 'video-source') {
      videoUrl = URL.createObjectURL(source.blob); videoSource = document.createElement('video');
      videoSource.muted = true; videoSource.defaultMuted = true; videoSource.playsInline = true; videoSource.preload = 'auto'; videoSource.src = videoUrl;
      await new Promise((resolve, reject) => {
        const finish = (error) => { videoSource.removeEventListener('loadeddata', ready); videoSource.removeEventListener('error', failed); controller.signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
        const ready = () => finish(); const failed = () => finish(new Error('動画の映像コマを読み込めませんでした。元の動画は保持されています。'));
        const aborted = () => finish(new DOMException('動画の作成を中止しました。', 'AbortError'));
        videoSource.addEventListener('loadeddata', ready, { once: true }); videoSource.addEventListener('error', failed, { once: true }); controller.signal.addEventListener('abort', aborted, { once: true });
        videoSource.load(); if (videoSource.readyState >= 2) ready();
      });
    }
    let result;
    try {
      if (!audioSource && selectedMusic?.song) {
        const renderedMusic = await renderSongAudioSource(selectedMusic, totalMusicPlays, controller.signal);
        result = await renderOutputVideo(frames, { audioSource: renderedMusic, videoSource, playbackRate: rate, mimeChoice, signal: controller.signal, onProgress: (progress) => { generationProgress.value = Math.round(progress * 100); } });
      } else {
        result = await renderOutputVideo(frames, { audioSource, audioTotalPlays: audioSource ? totalMusicPlays : 1, videoSource, playbackRate: rate, mimeChoice, signal: controller.signal, onProgress: (progress) => { generationProgress.value = Math.round(progress * 100); } });
      }
    } finally { if (videoSource) { videoSource.pause(); videoSource.removeAttribute('src'); videoSource.load(); } if (videoUrl) URL.revokeObjectURL(videoUrl); }
    const hasMusic = Boolean(audioSource || selectedMusic?.song);
    if (result.extension !== formatValue || result.blob.type.split(';', 1)[0] !== outputMime(formatValue) || (hasMusic && !result.hasAudio)) throw new Error('動画の形式または音声トラックを確認できません。元の素材はそのまま保存できます。');
    return { blob: result.blob, metadata: { durationSeconds: result.seconds, width: result.width, height: result.height, outputWidth: result.width, outputHeight: result.height, ...(hasMusic ? { description: `元動画の音声は含めず、音楽を${totalMusicPlays}回、元の速度と音程で再生し、終わりに動画を終了します。` } : { description: '画像または動画の映像を元の速度で記録しました。元動画の音声は含みません。' }) } };
  }
  if (source?.kind === 'audio-video' && ['mp4', 'webm'].includes(formatValue)) {
    const frame = source.image;
    const selectedMusic = selectedMusicSource();
    const musicTotalPlays = Math.max(1, Math.min(8, Number(mediaSettings.musicTotalPlays) || 1));
    let result;
    if (selectedMusic?.song) {
      result = await renderAudioVideo(selectedMusic.song, { width: frame.width, height: frame.height, rgba: frame.data }, { totalPlays: musicTotalPlays, signal: controller.signal });
    } else if (selectedMusic?.kind === 'audio-buffer') {
      const mimeChoice = chooseAudioVideoMimeType();
      if (!mimeChoice || mimeChoice.extension !== formatValue) throw new Error('このブラウザーが実際に作成できる動画形式と選択内容が一致しません。画像と音楽の元データは保持されています。');
      result = await renderOutputVideo([{ width: frame.width, height: frame.height, data: frame.data, delayMs: 100 }], {
        audioSource: selectedMusic, audioTotalPlays: musicTotalPlays, mimeChoice,
        signal: controller.signal,
        onProgress: (progress) => { generationProgress.value = Math.round(progress * 100); }
      });
    } else throw new Error('動画に重ねる音楽を選べません。画像と音楽の元データは保持されています。');
    if (result.extension !== formatValue || result.blob.type.split(';')[0] !== outputMime(formatValue) || !result.hasAudio) throw new Error('動画の形式または音声トラックを確認できません。元の項目はそのまま保存できます。');
    return { blob: result.blob, metadata: { durationSeconds: result.seconds, width: result.width, height: result.height, outputWidth: result.width, outputHeight: result.height, description: `音楽は${musicTotalPlays}回、元の速度と音程で再生します。` } };
  }
  if (source?.kind === 'legacy-file' && source.blob && source.extension === formatValue) return { blob: source.blob, metadata: {} };
  throw new Error('この素材では選択した形式を書き出せません。');
}

async function generateOutputItem({ sourceId = sourceSelect.value, formatValue = formatSelect.value, dimensions = null, preservePrevious = false, autoPixelOrigin = false } = {}) {
  if (!record || !activeItem || generationController || mediaWritePending || itemWritePending) return false;
  if (record.metadata?.previewOnly || activeItem.metadata?.previewOnly) {
    status.textContent = 'この画像はプレビュー専用です。編集・変換はできません。原本ファイルを保存できます。';
    return false;
  }
  const source = mediaSources.find((item) => item.id === sourceId);
  if (!source || !sourceFormats(source).some(([value]) => value === formatValue)) { status.textContent = 'この素材では選べない形式です。'; return false; }
  const formats = sourceFormats(source);
  const extensionValue = formatValue;
  const framesForSource = sourceFrames(source);
  let outputDimensions = dimensions;
  if (!outputDimensions && framesForSource.length) {
    if ((source.id === activeItem.sourceId || rasterProfile?.sourceId === source.id) && Number(widthInput.value) > 0 && Number(heightInput.value) > 0) {
      outputDimensions = { width: Number(widthInput.value), height: Number(heightInput.value) };
    } else {
      const scale = Math.max(1, Math.min(16, Math.round(Number(record.metadata?.defaultScale) || 1)));
      outputDimensions = { width: framesForSource[0].width * scale, height: framesForSource[0].height * scale };
    }
  }
  const previousItem = activeItem;
  if (preservePrevious && outputItems.length >= 12) { status.textContent = '出力項目が上限のため、新しいサイズは作成できません。元のファイルはそのままです。'; return false; }
  const epoch = ++generationEpoch;
  const controller = new AbortController(); generationController = controller;
  setBusy(true, true); addOutputItem.disabled = true; copyOutputItem.disabled = true; deleteOutputItem.disabled = true;
  status.textContent = ['mp4', 'webm'].includes(extensionValue) ? '動画を作成しています。画面を開いたままお待ちください…' : '出力を作成しています…';
  let completed = false;
  try {
    const generatedOutput = await createOutputBlob(source, extensionValue, outputDimensions, controller);
    const blob = generatedOutput.blob;
    if (controller.signal.aborted || pageDisposed || epoch !== generationEpoch) return;
    const baseName = filename.value || outputBaseName(previousItem.filename, previousItem.extension);
    const nextFilename = sanitizeOutputFilename(autoPixelOrigin ? `${baseName}-pixel` : baseName, extensionValue);
    const frames = sourceFrames(source);
    const animatedOutput = ['gif', 'apng'].includes(extensionValue);
    const metadataValue = {
      ...(frames[0] ? { width: frames[0].width, height: frames[0].height } : {}),
      ...(outputDimensions ? { outputWidth: outputDimensions.width, outputHeight: outputDimensions.height } : {}),
      ...(previousItem.metadata?.pixelOriginChoice ? { pixelOriginChoice: previousItem.metadata.pixelOriginChoice } : {}),
      ...(extensionValue === 'jpeg' ? { jpegQuality: Number(jpegQuality.value) || 90 } : {}),
      ...(animatedOutput && frames.length > 1 ? { frameCount: frames.length, durationSeconds: getOutputTiming(frames, { format: extensionValue, playbackRate: 1 }).durationMs / 1000, totalPlays: mediaSettings.totalPlays ?? source.mediaSource?.totalPlays ?? source.mediaSource?.loopCount ?? 0 } : {}),
      ...generatedOutput.metadata
    };
    const updated = { ...previousItem, ...(autoPixelOrigin ? { id: createItemId() } : {}), sourceId: source.id, mime: outputMime(extensionValue), extension: extensionValue, filename: nextFilename, blob, metadata: metadataValue };
    const nextItems = autoPixelOrigin ? [...outputItems, updated] : outputItems.map((item) => item.id === previousItem.id ? updated : item);
    const savedItems = await persistOutputItems(nextItems, { duringGeneration: true });
    if (controller.signal.aborted || pageDisposed || epoch !== generationEpoch) return;
    outputItems = savedItems;
    activeItem = outputItems.find((item) => item.id === updated.id) || outputItems[0];
    if (autoPixelOrigin) { originRestoreItemId = previousItem.id; originResizeActiveItemId = updated.id; }
    activeSource = source;
    record.mime = activeItem.mime; record.extension = activeItem.extension; record.filename = activeItem.filename; record.blob = activeItem.blob;
    record.currentMetadata = activeItem.metadata; record.mediaSource = source.mediaSource || null;
    currentScale = outputDimensions?.width && frames[0] && outputDimensions.width % frames[0].width === 0 ? outputDimensions.width / frames[0].width : 1;
    const outputWidth = generatedOutput.metadata.outputWidth || outputDimensions?.width || frames[0]?.width;
    const outputHeight = generatedOutput.metadata.outputHeight || outputDimensions?.height || frames[0]?.height;
    setCurrentBlob(activeItem.blob, { width: outputWidth, height: outputHeight, animated: frames.length > 1 && ['gif', 'apng'].includes(extensionValue) });
    setMedia(record);
    updateMusicPlayControl();
    format.textContent = displayFormat(record); extension.textContent = `.${activeItem.extension}`; filename.value = outputBaseName(activeItem.filename, activeItem.extension);
    filename.setAttribute('aria-label', `ファイル名（.${activeItem.extension}は固定）`);
    fillSourceAndFormatControls({ preferredFormat: activeItem.extension });
    renderOutputItems(); displayMetadata(record, activeItem.blob, outputWidth, outputHeight);
    status.textContent = `${formats.find(([value]) => value === extensionValue)?.[1] || extensionValue.toUpperCase()}を端末内に準備しました。ダウンロードを開始できます。`;
    completed = true;
  } catch (error) {
    if (error?.name === 'AbortError') status.textContent = '作成を中止しました。前の出力と素材はそのまま保存できます。';
    else status.textContent = error?.message || '出力を作成できませんでした。前の項目はそのまま保存できます。';
    fillSourceAndFormatControls({ preferredFormat: previousItem.extension });
  } finally {
    if (generationController === controller) generationController = null;
    if (!pageDisposed) setBusy(false);
    renderOutputItems();
  }
  return completed;
}

async function addOutput(copy = false) {
  if (!activeItem || outputItems.length >= 12 || generationController || mediaWritePending || itemWritePending) return;
  const item = { ...activeItem, id: createItemId(), filename: activeItem.filename, metadata: { ...activeItem.metadata } };
  const next = [...outputItems, item];
  try {
    await persistOutputItems(next);
    activeItem = outputItems.at(-1); setActiveItem(activeItem);
    fillSourceAndFormatControls({ preferredFormat: activeItem.extension }); renderOutputItems();
    status.textContent = copy ? '出力項目を複製しました。名前や形式を個別に変更できます。' : '出力項目を追加しました。素材・形式・名前を個別に設定できます。';
  } catch (error) { status.textContent = error?.message || '出力項目を保存できませんでした。前の項目はそのままです。'; }
}

async function removeActiveOutput() {
  if (outputItems.length <= 1 || !activeItem || generationController || mediaWritePending || itemWritePending) return;
  const id = activeItem.id; const next = outputItems.filter((item) => item.id !== id);
  try {
    await persistOutputItems(next);
    const url = generatedDownloadUrls.get(id); if (url) URL.revokeObjectURL(url); generatedDownloadUrls.delete(id);
    activeItem = outputItems[0]; setActiveItem(activeItem); fillSourceAndFormatControls({ preferredFormat: activeItem.extension }); renderOutputItems();
    status.textContent = '出力項目を削除しました。元の素材は保持されています。';
  } catch (error) { status.textContent = error?.message || '項目を削除できませんでした。出力内容は保持されています。'; }
}

async function prepareGifPoster(blob) {
  if (blob.size > 64 * 1024 * 1024) return;
  const epoch = previewEpoch;
  const itemId = activeItem?.id;
  const sourceId = activeSource?.id;
  const dimensions = rasterOutputDimensions();
  if (!dimensions.width || !dimensions.height) return;
  try {
    const poster = await createBoundedRasterPreview(blob, {
      ...dimensions, maxEdge: 1024, maxPixels: 1_000_000,
      resizeQuality: hasPixelArtEvidence() ? 'pixelated' : 'high'
    });
    if (pageDisposed || epoch !== previewEpoch || itemId !== activeItem?.id || sourceId !== activeSource?.id) return;
    if (posterUrl) URL.revokeObjectURL(posterUrl);
    posterUrl = URL.createObjectURL(poster);
    animationToggle.hidden = false;
  } catch (error) {
    if (!pageDisposed && epoch === previewEpoch && itemId === activeItem?.id && sourceId === activeSource?.id) {
      status.textContent = `${error?.message || '停止用プレビューを準備できませんでした。'} アニメーション再生と元ファイルの保存は利用できます。`;
    }
  }
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
  updateSettingsSummaries();
  if (kind === 'gif' && record?.mediaSource?.frames?.length) {
    const seconds = getOutputTiming(record.mediaSource.frames, { format: 'gif' }).durationMs / 1000;
    animationDetails.textContent = `${frameCount}フレーム · ${seconds.toFixed(1)}秒 · ループ再生`;
  }
}

async function readPngMetadata(blob) {
  if (blob.size > 10 * 1024 * 1024) return null;
  try { return inspectPixelPng(new Uint8Array(await blob.arrayBuffer())).metadata || null; }
  catch { return null; }
}

function sameFrameSize(frames, width, height) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && frames.length > 0 && frames.every((frame) => frame.width === width && frame.height === height);
}

async function resolveRasterOrigin(entry, frames, actualSize, signal, onProgress) {
  if (!frames.length) return { status: 'skip', reason: 'no-frames' };
  // JPEG encoding can introduce edge noise after the original frame source was captured.
  if (entry.mime === 'image/jpeg') return { status: 'skip', reason: 'lossy-output' };
  const embedded = entry.mime === 'image/png' ? await readPngMetadata(entry.sourceBlob) : null;
  const transport = entry.metadata || {};
  const claims = [];
  if (embedded) claims.push({ ...embedded, source: 'png-metadata', verified: true });
  if (Number.isSafeInteger(transport.width) && Number.isSafeInteger(transport.height)) {
    claims.push({ width: transport.width, height: transport.height, scale: Math.max(1, Math.round(transport.defaultScale || 1)), source: 'handoff-metadata', verified: false });
  }
  for (const claim of claims) {
    if (actualSize.width !== claim.width * claim.scale || actualSize.height !== claim.height * claim.scale) continue;
    if (sameFrameSize(frames, claim.width, claim.height)) {
      const sourceGrid = await inferIntegerPixelScale(frames, { signal, onProgress });
      if (sourceGrid.status === 'detected') return {
        ...sourceGrid,
        scale: sourceGrid.scale * claim.scale,
        source: claim.source
      };
      return { status: 'verified', width: claim.width, height: claim.height, scale: 1, source: claim.source, preferredScale: claim.scale };
    }
    const claimed = await verifyPixelScaleClaim(frames, claim, { signal });
    if (claimed.status === 'verified') {
      const maximal = await inferIntegerPixelScale(frames, { signal, onProgress });
      return maximal.status === 'detected' ? { ...maximal, source: claim.source } : { ...claimed, source: claim.source, preferredScale: claim.scale };
    }
  }
  const sourceSize = frames[0];
  const outputScaleX = actualSize.width / sourceSize.width;
  const outputScaleY = actualSize.height / sourceSize.height;
  if (!Number.isSafeInteger(outputScaleX) || outputScaleX < 1 || outputScaleX !== outputScaleY) {
    return { status: 'skip', reason: 'frame-size-mismatch' };
  }
  const sourceGrid = await inferIntegerPixelScale(frames, { signal, onProgress });
  if (sourceGrid.status !== 'detected') return sourceGrid;
  const scale = sourceGrid.scale * outputScaleX;
  return {
    status: 'detected',
    scale,
    width: sourceGrid.width,
    height: sourceGrid.height,
    confidence: 'pixel-evidence'
  };
}

function updateOriginMessage(detection, isAutoOutput = false) {
  originHint.hidden = true;
  originRestore.hidden = true;
  if (detection?.status === 'candidate') {
    originHint.textContent = `整数倍のまとまり（${detection.scale}倍）がありますが、単純な形のため原寸とは断定できません。サイズは変更していません。`;
    originHint.hidden = false;
  } else if (detection?.status === 'detected' && detection.confidence === 'pixel-evidence') {
    originHint.textContent = `画素ブロックが一致する最小格子は${detection.width} × ${detection.height}pxです（${detection.scale}倍）。制作時の原寸とは限りません。元画像は保持しています。`;
    originHint.hidden = false;
  } else if (detection?.status === 'verified') {
    originHint.textContent = `PiXiEEDの寸法情報から${detection.preferredScale || detection.scale}倍の出力を確認しました。元のフレームは保持しています。`;
    originHint.hidden = false;
  }
  if (isAutoOutput && originRestoreItemId && activeItem?.id === originResizeActiveItemId) {
    originRestore.hidden = false;
  }
}

async function prepareRasterSettings(entry, frames, { autoResize = true } = {}) {
  rasterSettingsController?.abort();
  const controller = new AbortController(); rasterSettingsController = controller;
  const epoch = ++rasterSettingsEpoch;
  const sourceId = activeSource?.id;
  const itemId = activeItem?.id;
  if (controller.signal.aborted || epoch !== rasterSettingsEpoch || sourceId !== activeSource?.id || itemId !== activeItem?.id) return;
  const actualSize = rasterOutputDimensions(entry);
  const detection = await resolveRasterOrigin(entry, frames, actualSize, controller.signal, (progress) => {
    if (!controller.signal.aborted && epoch === rasterSettingsEpoch) {
      status.textContent = `画素ブロックを確認中（コマ${progress.frameIndex + 1}/${progress.frameCount}、${progress.rowsDone}/${progress.rowsTotal}行）…`;
    }
  }).catch((error) => {
    if (error?.name === 'AbortError') return { status: 'skip', reason: 'cancelled' };
    return { status: 'skip', reason: 'inference-error' };
  });
  if (controller.signal.aborted || epoch !== rasterSettingsEpoch || sourceId !== activeSource?.id || itemId !== activeItem?.id) return;
  if (status.textContent.startsWith('画素ブロックを確認中')) status.textContent = '';
  const trusted = detection.status === 'verified';
  const reduced = detection.status === 'detected';
  const canUseOrigin = trusted || reduced;
  const width = canUseOrigin ? detection.width : frames[0].width;
  const height = canUseOrigin ? detection.height : frames[0].height;
  const declaredScale = trusted ? detection.preferredScale : 1;
  const sameSourceItem = activeItem?.sourceId === sourceId;
  const visibleSize = rasterOutputDimensions(entry);
  const visibleWidth = visibleSize.width || frames[0].width;
  const visibleHeight = visibleSize.height || frames[0].height;
  const existingOutputWidth = sameSourceItem ? visibleWidth : frames[0].width;
  const existingOutputHeight = sameSourceItem ? visibleHeight : frames[0].height;
  const savedWidth = sameSourceItem && entry.currentMetadata?.outputWidth > 0 ? entry.currentMetadata.outputWidth : 0;
  const savedHeight = sameSourceItem && entry.currentMetadata?.outputHeight > 0 ? entry.currentMetadata.outputHeight : 0;
  const startWidth = savedWidth || (canUseOrigin ? width : width * declaredScale);
  const startHeight = savedHeight || (canUseOrigin ? height : height * declaredScale);
  rasterProfile = { sourceId, width, height, status: detection.status, preferredScale: declaredScale, canUseOrigin };
  pngBaseSize = { width, height };
  setupScaleInput({ width, height, startScale: startWidth / width, startWidth, startHeight, kind: frames.length > 1 ? 'gif' : 'png', frameCount: frames.length });
  scaleNote.textContent = canUseOrigin
    ? '原寸候補を基準に設定しました。表示倍率とは別に出力サイズを変更できます。'
    : '元フレームを保持したまま、出力サイズだけを変更できます。';
  updateScaleSummary(width, height, frames.length > 1 ? 'gif' : 'png', frames.length);
  const pixelEvidence = reduced || trusted;
  for (const node of [image, timelineCanvas]) node.dataset.pixelArt = String(pixelEvidence);
  const animatedPreview = frames.length > 1 && ['image/gif', 'image/apng'].includes(activeItem?.mime);
  if (animatedPreview) void prepareGifPoster(entry.blob);
  else if (pixelEvidence && activeItem?.mime?.startsWith('image/') && activeItem.mime !== 'image/svg+xml') {
    const dimensions = rasterOutputDimensions(entry);
    void showRasterPreview(entry.blob, { ...dimensions, pixelArt: true });
  }
  const currentWidth = existingOutputWidth || frames[0].width;
  const currentHeight = existingOutputHeight || frames[0].height;
  const needsAutoResize = autoResize && sameSourceItem && pixelEvidence && (currentWidth > width || currentHeight > height)
    && (currentWidth !== width || currentHeight !== height);
  const shouldAutoSelectOrigin = shouldAutoSelectPixelOrigin({
    selection: activeItem?.metadata?.pixelOriginChoice || record.currentMetadata?.pixelOriginChoice,
    needsAutoResize
  });
  const matchingOutput = outputItems.find((item) => item.id !== activeItem?.id && item.sourceId === sourceId
    && Number(item.metadata?.outputWidth) === width && Number(item.metadata?.outputHeight) === height
    && item.extension === activeItem?.extension);
  if (matchingOutput && shouldAutoSelectOrigin) {
    originRestoreItemId = activeItem.id;
    originResizeActiveItemId = matchingOutput.id;
    updateOriginMessage(detection, true);
    setActiveItem(matchingOutput); fillSourceAndFormatControls({ preferredFormat: matchingOutput.extension }); renderOutputItems();
    return;
  }
  updateOriginMessage(detection, activeItem?.id === originResizeActiveItemId);
  if (shouldAutoSelectOrigin && !matchingOutput) {
    if (outputItems.length >= 12) {
      status.textContent = '原寸候補は見つかりましたが、出力項目が上限です。元のファイルはそのまま保存できます。';
      return;
    }
    originRestoreItemId = activeItem.id;
    status.textContent = '整数倍の拡大を確認しました。元のファイルを残し、原寸候補の出力を準備しています…';
    await generateOutputItem({ sourceId, formatValue: activeItem.extension, dimensions: { width, height }, preservePrevious: true, autoPixelOrigin: true });
  }
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
  releaseRasterPreview();
  if (posterUrl) URL.revokeObjectURL(posterUrl);
  posterUrl = null;
  animationStopped = false;
  rasterProfile = null;
  animationToggle.hidden = true;
  animationToggle.textContent = 'アニメーションを停止';
  animationToggle.setAttribute('aria-pressed', 'false');
  image.hidden = audio.hidden = video.hidden = fileCard.hidden = true;
  timelineCanvas.hidden = true; timelinePlay.hidden = true; stopTimelinePreview();
  scaleSettings.hidden = animationSettings.hidden = audioSettings.hidden = true;
  originHint.hidden = originRestore.hidden = true;
  rasterSettingsController?.abort();
  if (type.startsWith('image/')) {
    const frames = sourceFrames(activeSource);
    const useTimeline = activeSource?.id.startsWith('local-images') && frames.length > 1 && !['image/gif', 'image/apng'].includes(type);
    const dimensions = rasterOutputDimensions(entry);
    const animated = frames.length > 1 && ['image/gif', 'image/apng'].includes(type);
    image.onload = () => { displayMetadata(record, currentBlob, dimensions.width || image.naturalWidth, dimensions.height || image.naturalHeight); updatePreviewControls(); };
    image.dataset.pixelArt = String(hasPixelArtEvidence());
    image.hidden = true;
    if (type === 'image/svg+xml') {
      image.src = fileUrl;
      image.hidden = false;
    } else if (!useTimeline) {
      void showRasterPreview(entry.blob, {
        ...dimensions,
        animated: animated || ['image/gif', 'image/apng'].includes(type),
        pixelArt: hasPixelArtEvidence()
      });
    }
    if (useTimeline) { timelineCanvas.hidden = false; timelinePlay.hidden = false; paintTimelineFrame(0); }
    image.alt = `${entry.title || '作品'}の${['image/gif', 'image/apng'].includes(type) ? 'アニメーション' : '画像'}プレビュー`;
    if (frames.length) {
      animationSettings.hidden = !animated;
      animationToggle.hidden = true;
      scaleSettings.hidden = false;
      void prepareRasterSettings(entry, frames);
    } else {
      scaleSettings.hidden = true;
      if (type === 'image/png') status.textContent = '画像の元ピクセルを読み込めないため、サイズ変更は使えません。元のファイルはそのまま保存できます。';
      animationSettings.hidden = true;
    }
    if (record.metadata?.previewOnly || activeItem?.metadata?.previewOnly) {
      status.textContent = 'プレビューのみ · 編集・変換はできません · 原本を保存できます。';
      scaleSettings.hidden = animationSettings.hidden = audioSettings.hidden = true;
      applySettings.disabled = true;
      image.alt = `${entry.title || entry.filename || '原本'}のプレビュー（編集・変換不可）`;
    }
  } else if (type === 'audio/wav') {
    audio.hidden = false; audio.src = fileUrl;
    fileCard.hidden = true;
    const itemMetadata = { ...entry.metadata, ...entry.currentMetadata };
    if (itemMetadata.sampleRate || itemMetadata.loops || activeSource?.kind === 'audio-song') {
      const rate = itemMetadata.sampleRate ? `${Number((itemMetadata.sampleRate / 1000).toFixed(2))}kHz` : '';
      const loops = itemMetadata.loops ? `${itemMetadata.loops}回ループ` : '';
      const channels = activeSource?.kind === 'audio-buffer' ? (activeSource.channels.length === 1 ? 'モノラル' : 'ステレオ') : 'ステレオ';
      audioDetails.textContent = [`${channels} · 16-bit PCM`, rate, loops].filter(Boolean).join(' · ') || '曲をWAV音声に書き出しました。';
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
  updatePreviewControls();
  updateSettingsSummaries();
  updateSequenceControls();
}

async function mount() {
  const params = new URLSearchParams(location.search);
  if (params.getAll('id').length === 0) { showStart(); return; }
  if (params.getAll('id').length !== 1) { setError('出力IDが複数あります。ツール一覧から新しく開いてください。'); return; }
  try {
    record = await readToolOutput(params.get('id'));
    outputStart.hidden = true; outputLayout.hidden = false;
    pageTitle.textContent = record.title || '出力を確認';
    intro.textContent = record.source ? `${record.source}からのファイルです。プレビューを確認して端末へ保存できます。` : 'プレビューを確認して、ファイル名を決めて端末へ保存できます。';
    returnLink.href = record.returnUrl;
    returnLink.textContent = new URL(record.returnUrl, location.origin).pathname === '/output/' ? '素材選択へ戻る' : '編集画面へ戻る';
    mediaSources = record.mediaSources || [];
    if (!mediaSources.length && record.mediaSource) mediaSources = [{ id: 'legacy', label: '元の画像', kind: 'legacy-image', mediaSource: record.mediaSource }];
    if (!mediaSources.length && record.mime.startsWith('image/') && !record.metadata?.previewOnly) {
      let sourceUrlToRelease = null; let sourceCanvas = null;
      try {
        const original = new Image(); sourceUrlToRelease = URL.createObjectURL(record.sourceBlob); original.src = sourceUrlToRelease; await original.decode();
        if (original.naturalWidth * original.naturalHeight <= MAX_IMAGE_PIXELS) {
          sourceCanvas = document.createElement('canvas'); sourceCanvas.width = original.naturalWidth; sourceCanvas.height = original.naturalHeight;
          const context = sourceCanvas.getContext('2d', { willReadFrequently: true }); context.drawImage(original, 0, 0);
          const pixels = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const mediaSource = { kind: 'rgba-frames', width: sourceCanvas.width, height: sourceCanvas.height, frames: [{ width: sourceCanvas.width, height: sourceCanvas.height, data: new Uint8Array(pixels.data) }], totalPlays: 1 };
          mediaSources = [{ id: 'legacy', label: '元の画像', kind: 'rgba-frames', mediaSource }];
        }
      } catch { /* Keep the original file downloadable when pixel decoding is unavailable. */ }
      finally { if (sourceCanvas) sourceCanvas.width = sourceCanvas.height = 1; if (sourceUrlToRelease) URL.revokeObjectURL(sourceUrlToRelease); }
    }
    if (!mediaSources.length) mediaSources = [{ id: 'legacy', label: record.source || '元のファイル', kind: 'legacy-file', blob: record.sourceBlob, mime: record.mime, extension: record.extension }];
  const importedTotalPlays = mediaSources.find((source) => source.mediaSource?.totalPlays !== undefined || source.mediaSource?.loopCount !== undefined)?.mediaSource?.totalPlays ?? mediaSources.find((source) => source.mediaSource?.loopCount !== undefined)?.mediaSource?.loopCount ?? 0;
    mediaSettings = { playbackRate: record.mediaSettings?.playbackRate || 1, totalPlays: record.mediaSettings?.totalPlays ?? record.mediaSettings?.loopCount ?? importedTotalPlays, musicTotalPlays: Math.max(1, Math.min(8, Number(record.mediaSettings?.musicTotalPlays) || 1)), musicSourceId: record.mediaSettings?.musicSourceId || '' };
    outputItems = record.outputs?.length ? record.outputs : [{ id: 'default', sourceId: mediaSources[0]?.id || '', mime: record.mime, extension: record.extension, filename: record.filename, blob: record.blob, metadata: record.currentMetadata || {} }];
    activeItem = outputItems[0];
    if (!activeItem.sourceId) activeItem.sourceId = mediaSources[0]?.id || '';
    setActiveItem(activeItem); fillSourceAndFormatControls({ preferredFormat: activeItem.extension }); renderOutputItems();
    renderAssets(); updateSequenceControls();
    filename.setAttribute('aria-label', `ファイル名（.${activeItem.extension}は固定）`);
  } catch (error) { setError(error?.message || '端末内の出力を開けませんでした。'); }
}

startChoose.addEventListener('click', () => fileInput.click());
addAssetsButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { void handleImport(fileInput.files); });
replacementInput.addEventListener('change', () => { void handleImport(replacementInput.files, { replaceAudio: true }); });
cancelImport.addEventListener('click', () => importController?.abort());
cancelGeneration.addEventListener('click', () => { generationController?.abort(); importController?.abort(); });
dropTarget.addEventListener('click', (event) => { if (event.target === dropTarget) fileInput.click(); });
dropTarget.addEventListener('dragover', (event) => { event.preventDefault(); dropTarget.classList.add('is-over'); });
dropTarget.addEventListener('dragleave', (event) => { if (!dropTarget.contains(event.relatedTarget)) dropTarget.classList.remove('is-over'); });
dropTarget.addEventListener('drop', (event) => { event.preventDefault(); dropTarget.classList.remove('is-over'); void handleImport(event.dataTransfer?.files); });
timelinePlay.addEventListener('click', () => {
  if (timelineTimer !== null) { stopTimelinePreview(); return; }
  if (sourceFrames().length < 2) return;
  timelineFrameIndex = 0; timelinePlay.dataset.loop = '0';
  timelinePlay.setAttribute('aria-pressed', 'true'); timelinePlay.textContent = 'コマ送りを停止';
  paintTimelineFrame(0);
  const delay = effectiveFrameDelay(sourceFrames()[0], formatSelect.value, Number(mediaSettings.playbackRate) || 1);
  timelineTimer = setTimeout(playTimelineNext, delay);
});
fpsPreset.addEventListener('change', () => { if (fpsPreset.value) fpsInput.value = fpsPreset.value; });
applyFps.addEventListener('click', () => {
  if (mediaWritePending || generationController || importController || !activeSource) return;
  const frames = sourceFrames();
  if (frames.length < 2) return;
  const formatValue = formatSelect.value;
  const options = formatValue === 'gif' ? { minDelayMs: 20, maxDelayMs: 655350 } : { minDelayMs: 1, maxDelayMs: 3600000 };
  let delayMs;
  try { delayMs = outputFpsToDelayMs(Number(fpsInput.value), options); }
  catch { status.textContent = formatValue === 'gif' ? 'GIFに設定できるFPSは約0.00153〜50です。' : 'FPSは0.000278〜1000の範囲で指定してください。'; return; }
  const selectedSourceId = activeSource.id;
  const nextFrames = frames.map((frame) => ({ ...frame, delayMs }));
  void persistMediaSources(mediaSources.map((source) => source.id === selectedSourceId
    ? { ...source, mediaSource: { ...source.mediaSource, frames: nextFrames } }
    : source), { ...mediaSettings, playbackRate: 1 });
});
loopCount.addEventListener('change', () => { void persistMediaSources(mediaSources, { ...mediaSettings, totalPlays: Number(loopCount.value) }); });
musicTotalPlaysControl?.addEventListener('change', () => {
  const plays = Number(musicTotalPlaysControl.value);
  const maximum = Math.max(1, ...[...musicTotalPlaysControl.options].filter((option) => !option.disabled).map((option) => Number(option.value) || 1));
  if (!Number.isSafeInteger(plays) || plays < 1 || plays > maximum) { musicTotalPlaysControl.value = String(mediaSettings.musicTotalPlays || 1); return; }
  void persistMediaSources(mediaSources, { ...mediaSettings, musicTotalPlays: plays });
});
musicSourceSelect?.addEventListener('change', () => {
  const source = availableMusicSources().find((item) => item.id === musicSourceSelect.value);
  if (!source) { updateMusicPlayControl(); return; }
  void persistMediaSources(mediaSources, { ...mediaSettings, musicSourceId: source.id });
});
createVideoButton.addEventListener('click', () => { void generateOutputItem({ sourceId: sourceSelect.value, formatValue: formatSelect.value }); });
returnLink.addEventListener('click', async (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !pendingWrites.size) return;
  event.preventDefault();
  const href = returnLink.href;
  await Promise.allSettled([...pendingWrites]);
  location.assign(href);
});
window.addEventListener('beforeunload', (event) => {
  if (!pendingWrites.size) return;
  event.preventDefault();
  event.returnValue = '';
});

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
  activeSource = source || activeSource;
  rasterProfile = null;
  record.mediaSource = activeSource?.mediaSource || null;
  const formats = sourceFormats(source);
  stopTimelinePreview();
  fillSourceAndFormatControls({ preferredFormat: activeItem?.extension });
  const nextFormat = formats.some(([value]) => value === activeItem?.extension) ? activeItem.extension : formats[0]?.[0];
  if (['mp4', 'webm'].includes(nextFormat)) { createVideoButton.hidden = false; status.textContent = '動画を作成するには、作成ボタンを押してください。'; return; }
  const frames = sourceFrames(source);
  void (async () => {
    if (frames.length) await prepareRasterSettings(record, frames, { autoResize: false });
    if (source?.id !== activeSource?.id) return;
    await generateOutputItem({ sourceId: source?.id, formatValue: nextFormat });
  })();
});
formatSelect.addEventListener('change', () => {
  jpegSetting.hidden = formatSelect.value !== 'jpeg';
  jpegQualitySetting.hidden = formatSelect.value !== 'jpeg';
  createVideoButton.hidden = !['mp4', 'webm'].includes(formatSelect.value);
  updateMusicPlayControl();
  updateSequenceControls();
  if (['mp4', 'webm'].includes(formatSelect.value)) { status.textContent = '動画の作成には少し時間がかかります。「この設定で動画を作る」を押して開始してください。'; return; }
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
viewFitButton.addEventListener('click', () => setPreviewZoom(1));
viewZoomOut.addEventListener('click', () => setPreviewZoom(previewZoom / 1.25));
viewZoomIn.addEventListener('click', () => setPreviewZoom(previewZoom * 1.25));
originRestore.addEventListener('click', async () => {
  const previous = outputItems.find((item) => item.id === originRestoreItemId);
  if (!previous) { originRestore.hidden = true; return; }
  rasterSettingsController?.abort();
  rasterSettingsEpoch += 1;
  const selected = { ...previous, metadata: { ...previous.metadata, pixelOriginChoice: 'original' } };
  try {
    await persistOutputItems(outputItems.map((item) => item.id === selected.id ? selected : item));
  } catch (error) {
    status.textContent = error?.message || '元のサイズを選択として保存できませんでした。出力は保持されています。';
    return;
  }
  originRestoreItemId = '';
  originResizeActiveItemId = '';
  const restored = outputItems.find((item) => item.id === selected.id) || selected;
  setActiveItem(restored);
  fillSourceAndFormatControls({ preferredFormat: restored.extension });
  renderOutputItems();
  status.textContent = '元のサイズの出力を選択しました。';
});
scaleInput.addEventListener('input', () => {
  if (!record) return;
  const frame = sourceFrames()[0]; const width = pngBaseSize?.width || frame?.width; const height = pngBaseSize?.height || frame?.height;
  if (!width || !height) return;
  const scale = Math.max(1, Math.min(maxScale, Math.round(Number(scaleInput.value) || 1)));
  widthInput.value = String(width * scale); heightInput.value = String(height * scale);
  updateScaleSummary(width, height, sourceFrames().length > 1 ? 'gif' : 'png', sourceFrames().length || 1);
});
function onDimensionInput(axis) {
  if (!record) return;
  const frame = sourceFrames()[0]; const width = pngBaseSize?.width || frame?.width; const height = pngBaseSize?.height || frame?.height;
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
  for (const url of [sourceUrl, fileUrl, previewUrl, posterUrl, ...generatedDownloadUrls.values()]) if (url) URL.revokeObjectURL(url);
});

void mount();
