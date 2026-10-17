import { creationModeEntryUrl } from './mode-entry.mjs?rev=20261016-tool-shell-1';

const TRACKING_KEY = /^(?:utm_[a-z0-9_]+|gclid|fbclid|ref|from)$/i;
const CAMERA_QUERY_KEYS = new Set([
  'mode', 'pxd', 'pxdRevision', 'pxdImage',
  'modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool'
]);
const OUTPUT_ID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const TRANSFER_STORAGE_KEY = 'pixiee-lens:pending-draw-import';
const TRANSFER_WINDOW_NAME_TYPE = 'pixiee-lens:draw-import-window-name';
const IMAGE_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' });

function paramsFrom(search = '') {
  return search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
}

function cleanHash(hash = '') {
  const value = String(hash || '');
  return value && value !== '#' ? (value.startsWith('#') ? value : `#${value}`) : '';
}

function hasOnlySupportedKeys(params) {
  return [...params.keys()].every((key) => TRACKING_KEY.test(key) || CAMERA_QUERY_KEYS.has(key));
}

function pointerIsComplete(params, projectKey, revisionKey, imageKey) {
  if (![projectKey, revisionKey, imageKey].some((key) => params.has(key))) return true;
  return Boolean(params.get(projectKey)?.trim() && params.get(revisionKey)?.trim()
    && (!params.has(imageKey) || Boolean(params.get(imageKey)?.trim())));
}

/** Resolve an old Lens URL without forwarding unknown or legacy authority. */
export function resolveLegacyLensEntry({ search = '', hash = '', hasPendingTransfer = false } = {}) {
  const params = paramsFrom(search);
  const outputIds = params.getAll('outputId');
  if (outputIds.length > 0) {
    const recoverable = outputIds.length === 1 && OUTPUT_ID.test(outputIds[0]);
    return {
      action: 'stay',
      reason: recoverable ? 'output-recovery' : 'invalid-output-reference',
      ...(recoverable ? { outputUrl: `/output/work/?id=${encodeURIComponent(outputIds[0])}` } : {})
    };
  }
  if (hasPendingTransfer) return { action: 'stay', reason: 'pending-transfer' };
  if (!hasOnlySupportedKeys(params)) return { action: 'stay', reason: 'legacy-or-unknown-state' };

  const modes = params.getAll('mode');
  if (modes.length > 1 || (modes.length === 1 && modes[0].toLowerCase() !== 'camera')) {
    return { action: 'stay', reason: 'conflicting-mode' };
  }
  const selectedTools = params.getAll('modeProjectTool');
  if (selectedTools.length > 1 || (selectedTools.length === 1 && selectedTools[0].toLowerCase() !== 'camera')) {
    return { action: 'stay', reason: 'conflicting-project-tool' };
  }
  if (!pointerIsComplete(params, 'pxd', 'pxdRevision', 'pxdImage')
    || !pointerIsComplete(params, 'modePxd', 'modePxdRevision', 'modePxdImage')) {
    return { action: 'stay', reason: 'ambiguous-project-pointer' };
  }
  // This entry already identifies the camera. Retain a scoped share pointer
  // even when an older sender omitted its redundant modeProjectTool hint.
  if (!params.has('modeProjectTool') && params.has('modePxd')) params.set('modeProjectTool', 'camera');

  let url;
  try {
    url = creationModeEntryUrl('camera', params);
  } catch {
    return { action: 'stay', reason: 'ambiguous-project-pointer' };
  }
  if (!url) return { action: 'stay', reason: 'unsupported-project-pointer' };
  return { action: 'redirect', reason: 'compatible-camera-entry', url: `${url}${cleanHash(hash)}` };
}

function safeBrowserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

function safeWindowName() {
  try { return globalThis.window?.name || ''; } catch { return ''; }
}

function imageDownload(payload) {
  if (!payload || typeof payload.dataUrl !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z\d+/]+={0,2})$/i.exec(payload.dataUrl);
  if (!match || match[2].length > 96 * 1024 * 1024) return null;
  let extension = Object.keys(IMAGE_TYPES).find((key) => IMAGE_TYPES[key] === match[1].toLowerCase()) || 'png';
  if (extension === 'jpeg') extension = 'jpg';
  const rawName = String(payload.filename || `pixiee-lens-recovery.${extension}`).split(/[\\/]/).pop();
  const safeBase = rawName.replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-').trim().slice(0, 76) || 'pixiee-lens-recovery';
  return { href: payload.dataUrl, filename: `${safeBase}.${extension}` };
}

function pendingLegacyTransfer(storage, windowName) {
  let localTransferFound = false;
  let localPayload = null;
  try {
    const raw = storage?.getItem?.(TRANSFER_STORAGE_KEY);
    localTransferFound = Boolean(raw);
    if (raw) localPayload = JSON.parse(raw);
  } catch { /* Storage or JSON can be unavailable; keep the entry usable. */ }

  let namedPayload = null;
  try {
    const parsed = JSON.parse(String(windowName || ''));
    if (parsed?.type === TRANSFER_WINDOW_NAME_TYPE && parsed?.version === 1) namedPayload = parsed.payload;
  } catch { /* A non-JSON window.name belongs to the host page and is left untouched. */ }
  return {
    found: localTransferFound || Boolean(namedPayload),
    download: imageDownload(localPayload) || imageDownload(namedPayload)
  };
}

/** Browser bridge. It leaves legacy transfer slots unchanged and never imports their payload. */
export function initLegacyLensEntry({ locationLike = globalThis.location, documentLike = globalThis.document,
  storage, windowName } = {}) {
  if (!locationLike || !documentLike) return { action: 'stay', reason: 'no-browser' };
  const transfer = pendingLegacyTransfer(storage === undefined ? safeBrowserStorage() : storage,
    windowName === undefined ? safeWindowName() : windowName);
  const result = resolveLegacyLensEntry({ search: locationLike.search, hash: locationLike.hash, hasPendingTransfer: transfer.found });
  const cameraLink = documentLike.querySelector('[data-legacy-camera-link]');
  const outputLink = documentLike.querySelector('[data-legacy-output-link]');
  const status = documentLike.querySelector('[data-legacy-entry-status]');
  const outputNote = documentLike.querySelector('[data-legacy-output-note]');
  const transferNote = documentLike.querySelector('[data-legacy-transfer-note]');
  const transferDownloadLink = documentLike.querySelector('[data-legacy-transfer-download]');
  const stateNote = documentLike.querySelector('[data-legacy-state-note]');

  if (result.action === 'redirect') {
    locationLike.replace(result.url);
    return result;
  }

  if (cameraLink) cameraLink.href = '/draw/?mode=camera';
  if (result.outputUrl && outputLink) {
    outputLink.href = result.outputUrl;
    outputLink.hidden = false;
    if (outputNote) outputNote.hidden = false;
  }
  if (transferNote) transferNote.hidden = !transfer.found;
  if (transfer.download && transferDownloadLink) {
    transferDownloadLink.href = transfer.download.href;
    transferDownloadLink.download = transfer.download.filename;
    transferDownloadLink.hidden = false;
  }
  if (stateNote) stateNote.hidden = !['legacy-or-unknown-state', 'conflicting-mode', 'conflicting-project-tool', 'ambiguous-project-pointer', 'unsupported-project-pointer', 'invalid-output-reference'].includes(result.reason);

  if (status) {
    status.textContent = result.reason === 'output-recovery'
      ? '旧版の撮影結果を確認できます。保存データを開き、必要なファイルをダウンロードしてください。'
      : result.reason === 'pending-transfer'
        ? '旧版からの転送データを見つけました。データを消費・変更せずに保持しています。新しいカメラは別のリンクから開けます。'
        : result.reason === 'invalid-output-reference'
          ? '撮影データへの参照を確認できませんでした。元のURLを保ったまま、この案内からカメラを開けます。'
          : 'この旧URLの状態は自動移行できません。元のURLと端末内データは変更していません。';
  }
  return result;
}

if (globalThis.document && globalThis.location) initLegacyLensEntry();
