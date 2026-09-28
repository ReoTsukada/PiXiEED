import { listOwnVersions, mountPictureShelf, pictureDraftId } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { normalizePixelFile, scaleNotice } from '../pixel-scale.mjs?v=20260928-pixel-scale-1';
import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import {
  chunkJigsawPuzzleIds, collectPagedRows, fingerprintBytes, firstPublishedPixfindReferences, isSafeJigsawPixfindOriginalUrl, resolveLocalDrawRevision, validateJigsawSource, JIGSAW_MAX_IMAGE_BYTES, JIGSAW_MAX_SOURCE_PIXELS
} from './jigsaw-core.mjs?rev=20260928-jigsaw-pixfind-original-2';
import { documentRgba } from './draw-core.mjs';
import {
  createJigsawLayout, createJigsawWorkspace, migrateLegacyJigsawGame,
  moveJigsawGroup, rotateJigsawGroup, snapJigsawGroup, worldGroupBounds,
  pieceAtPoint, sliceJigsawPieces, isJigsawWorkspaceComplete, validateJigsawWorkspace
} from './jigsaw-workspace.mjs?rev=20260928-jigsaw-workspace-1';
import { buildJigsawSelectionEdges } from './jigsaw-selection.mjs';
import { supabaseConfig } from '../../data/site-config.js';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { mountPxdTools } from './pxd-ui.mjs?rev=20260928-own-work-1';
import { createPxdPuzzleFromMain, hasPxdPuzzle, readPxdPuzzle, materializePxdPuzzle, writePxdPuzzle } from './pxd-puzzles.mjs?rev=20260928-pxd-puzzles-1';

const JIGSAW_LAST_DRAFT_KEY = 'pixieed:creation:jigsaw:last-draft:v1';
const $ = (selector) => document.querySelector(selector);
const status = $('#jigsaw-status'); const sourceSelect = $('#jigsaw-source-version');
const sourceKind = $('#jigsaw-source-kind'); const publicSelect = $('#jigsaw-public-version'); const fileInput = $('#jigsaw-file');
const gridSelect = $('#jigsaw-grid-size'); const startButton = $('#jigsaw-start');
const resumeButton = $('#jigsaw-resume'); const saveButton = $('#jigsaw-save');
const setupSection = $('#jigsaw-setup'); const playSection = $('#jigsaw-play');
const boardElement = $('#jigsaw-board'); const workspaceElement = $('#jigsaw-workspace'); const trayElement = $('#jigsaw-tray');
const completionMessage = $('#jigsaw-complete'); const sourceLabel = $('#jigsaw-source-label');
const trayPrev = $('#jigsaw-tray-prev'); const trayNext = $('#jigsaw-tray-next'); const trayPageLabel = $('#jigsaw-tray-page');
const interactionEffects = createInteractionEffects();
let adapter = null; let draftStore = null; let sourceDraftId = null; let gameDraftId = null;
let game = null; let sourceRevision = null; let layoutData = null; let pieces = []; let selectedGroupId = null; let trayPage = 0;
let pieceLookupSource = null; let pieceLookup = new Map(); let pieceOrderSource = null; let pieceOrderIndex = new Map();
let selectionCache = { layout: null, pieceIds: null, path: null };
let liftEffect = null; let liftValue = 0;
let pxdOriginalRefs = null; let pxdPreservedPayload = null; let pxdBridge = null;
let activePointer = null; let panGesture = null; let pendingPaint = 0; let view = { scale: 1, x: 0, y: 0 }; let lastWorkspaceSize = null;
const MAX_TRAY_DOM = 80;
const PUBLIC_BUCKETS = new Set(['post-public', 'social-posts']);
const safePublicUrl = (bucket, path) => {
  if (!PUBLIC_BUCKETS.has(bucket) || typeof path !== 'string' || path.length > 512 || path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) return null;
  const base = new URL(String(supabaseConfig.url || ''));
  if (base.protocol !== 'https:') return null;
  return `${base.origin}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
};
const restHeaders = { apikey: supabaseConfig.publishableKey, Accept: 'application/json' };
async function listAll(table, query, pageSize = 500) {
  return collectPagedRows(async (offset, limit) => {
    const url = new URL(`${String(supabaseConfig.url).replace(/\/$/, '')}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    url.searchParams.set('limit', String(limit)); url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers: restHeaders, cache: 'no-store' });
    if (!response.ok) throw new Error(`公開作品を読み込めません（${response.status}）`);
    const page = await response.json(); if (!Array.isArray(page)) throw new Error('公開作品の一覧形式が不正です');
    return page;
  }, { pageSize, maxRows: 100000 });
}
async function assertListedPublicSource(postId, url, puzzleId = null) {
  const pixfindMatch = /^pixfind:([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{1,128})$/.exec(postId || '');
  if (pixfindMatch) {
    const [, socialPostId, referencedPuzzleId] = pixfindMatch;
    if (puzzleId !== referencedPuzzleId || !isSafeJigsawPixfindOriginalUrl(url, supabaseConfig.url, referencedPuzzleId)) throw new Error('PiXFiND作品の参照が正しくありません');
    const posts = await listAll('social_posts', { select: 'id,status,post_kind,distribution_mode,pixfind_puzzle_id', id: `eq.${socialPostId}`, status: 'eq.published', post_kind: 'eq.pixfind', distribution_mode: 'eq.pixfind', pixfind_puzzle_id: `eq.${referencedPuzzleId}` });
    const puzzles = await listAll('pixfind_puzzles', { select: 'id,original_url', id: `eq.${referencedPuzzleId}` });
    const currentUrl = posts.length === 1 && puzzles.length === 1 && posts[0].pixfind_puzzle_id === puzzles[0].id && isSafeJigsawPixfindOriginalUrl(puzzles[0].original_url, supabaseConfig.url, referencedPuzzleId) ? puzzles[0].original_url : null;
    if (!currentUrl || currentUrl !== url) throw new Error('このPiXFiND作品は現在公開されていません。別の作品を選んでください');
    return;
  }
  const match = /^(map|showcase):([A-Za-z0-9_-]{1,128})$/.exec(postId || '');
  if (!match) throw new Error('公開作品の参照が正しくありません');
  const [, kind, id] = match;
  const map = kind === 'map';
  const rows = map
    ? await listAll(encodeURIComponent(supabaseConfig.publicMapTable || 'post_map_points'), { select: 'post_id,public_image_path,published_at', post_id: `eq.${id}`, published_at: 'not.is.null' })
    : await listAll('social_posts', { select: 'id,media_object_path,status,post_kind,distribution_mode', id: `eq.${id}`, status: 'eq.published', post_kind: 'eq.image', distribution_mode: 'eq.showcase' });
  const currentUrl = rows.length === 1 ? safePublicUrl(map ? 'post-public' : 'social-posts', map ? rows[0].public_image_path : rows[0].media_object_path) : null;
  if (!currentUrl || currentUrl !== url) throw new Error('この作品は現在公開されていません。別の作品を選んでください');
}
async function fetchImageBytes(url) {
  const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error(`画像を取得できません（${response.status}）`);
  const advertised = Number(response.headers.get('content-length') || 0);
  if (advertised > JIGSAW_MAX_IMAGE_BYTES) throw new Error('画像のファイルサイズが8MBを超えています');
  if (!response.body?.getReader) { const buffer = await response.arrayBuffer(); if (buffer.byteLength > JIGSAW_MAX_IMAGE_BYTES) throw new Error('画像のファイルサイズが8MBを超えています'); return buffer; }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > JIGSAW_MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('画像のファイルサイズが8MBを超えています'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes.buffer;
}
async function loadPublicOptions() {
  publicSelect.replaceChildren(new Option('読み込み中…', ''));
  try {
    // Keep the existing map source query intact; PiXFiND below is gated through
    // its explicit published social_posts reference because map-point RLS is
    // based on published_at and does not prove that relationship.
    const mapRows = await listAll(encodeURIComponent(supabaseConfig.publicMapTable || 'post_map_points'), { select: 'post_id,title,public_image_path,published_at', published_at: 'not.is.null', order: 'published_at.desc' });
    const socialRows = await listAll('social_posts', { select: 'id,title,caption,media_object_path,status,post_kind,distribution_mode,published_at', status: 'eq.published', post_kind: 'eq.image', distribution_mode: 'eq.showcase', order: 'published_at.desc' });
    const pixfindPosts = await listAll('social_posts', { select: 'id,title,caption,status,post_kind,distribution_mode,pixfind_puzzle_id,published_at', status: 'eq.published', post_kind: 'eq.pixfind', distribution_mode: 'eq.pixfind', order: 'published_at.desc' });
    const puzzleIds = [...new Set(pixfindPosts.map((post) => post.pixfind_puzzle_id).filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)))];
    const puzzleRows = [];
    for (const batch of chunkJigsawPuzzleIds(puzzleIds)) {
      puzzleRows.push(...await listAll('pixfind_puzzles', { select: 'id,label,author_name,original_url', id: `in.(${batch.join(',')})` }));
    }
    const puzzleById = new Map(puzzleRows.map((row) => [row.id, row]));
    const refsByPuzzle = firstPublishedPixfindReferences(pixfindPosts);
    const pixfindChoices = [];
    for (const [puzzleId, post] of refsByPuzzle) {
      const puzzle = puzzleById.get(puzzleId);
      if (!puzzle || !isSafeJigsawPixfindOriginalUrl(puzzle.original_url, supabaseConfig.url, puzzleId)) continue;
      pixfindChoices.push({ id: `pixfind:${post.id}:${puzzleId}`, puzzleId, label: puzzle.label || post.title || post.caption || 'PiXFiNDの公開作品', url: puzzle.original_url });
    }
    const choices = [
      ...mapRows.map((row) => ({ id: `map:${row.post_id}`, label: row.title || '公開作品', url: safePublicUrl('post-public', row.public_image_path) })),
      ...socialRows.map((row) => ({ id: `showcase:${row.id}`, label: row.title || row.caption || '公開作品', url: safePublicUrl('social-posts', row.media_object_path) })),
      ...pixfindChoices
    ].filter((row) => row.url);
    publicSelect.replaceChildren(...choices.map((row, index) => new Option(`${String(row.label).slice(0, 80)} · ${index + 1}`, JSON.stringify(row))));
    if (!choices.length) publicSelect.add(new Option('公開作品はありません', ''));
  } catch (error) { publicSelect.replaceChildren(new Option('公開作品を読み込めません', '')); updateStatus(error.message); }
  displaySourceFields();
}
function displaySourceFields() {
  $('#jigsaw-draw-source').hidden = sourceKind.value !== 'draw';
  $('#jigsaw-shelf')?.classList.toggle('is-off', sourceKind.value !== 'draw');
  $('#jigsaw-public-source').hidden = sourceKind.value !== 'public';
  $('#jigsaw-file-source').hidden = sourceKind.value !== 'file';
  startButton.disabled = sourceKind.value === 'draw' ? !sourceSelect.value : sourceKind.value === 'public' ? !publicSelect.value : !fileInput.files?.[0];
  updatePieceEstimate();
}
function updatePieceEstimate(dimensions = null) {
  if (!dimensions && sourceKind.value === 'draw') dimensions = { width: Number(sourceSelect.selectedOptions[0]?.dataset.width), height: Number(sourceSelect.selectedOptions[0]?.dataset.height) };
  const label = $('#jigsaw-piece-count');
  if (!dimensions?.width || !dimensions?.height) { label.textContent = '画像を読み込むとピース数の目安が表示されます。'; return; }
  try {
    const layout = createJigsawLayout({ width: dimensions.width, height: dimensions.height, pieceSize: gridSelect.value === 'auto' ? 'auto' : Number(gridSelect.value), seed: 'estimate' });
    label.textContent = `${layout.columns}列 × ${layout.rows}行・約${(layout.columns * layout.rows).toLocaleString('ja-JP')}ピース`;
  } catch (error) { label.textContent = `この大きさでは作れません：${error.message}`; }
}
function decodeImage(url) {
  return new Promise((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async'; image.onload = () => resolve(image); image.onerror = () => reject(new Error('画像を読み込めません。公開画像の設定またはファイルを確認してください。')); image.src = url; });
}
function boundedRgba(image) {
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error('画像の縦横サイズが大きすぎます（最大2,000万画素）');
  const scale = Math.min(1, Math.sqrt(JIGSAW_MAX_SOURCE_PIXELS / (image.naturalWidth * image.naturalHeight)));
  let width = Math.max(2, Math.floor(image.naturalWidth * scale)); let height = Math.max(2, Math.floor(image.naturalHeight * scale));
  if (width * height > JIGSAW_MAX_SOURCE_PIXELS) {
    if (image.naturalWidth >= image.naturalHeight) width = Math.max(2, Math.floor(JIGSAW_MAX_SOURCE_PIXELS / height));
    else height = Math.max(2, Math.floor(JIGSAW_MAX_SOURCE_PIXELS / width));
  }
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画像を処理できません'); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, width, height);
  try { return { width, height, rgba: ctx.getImageData(0, 0, width, height).data }; } catch { throw new Error('画像を安全に読み取れません。画像のCORS設定が必要です。'); }
}
function bytesToBase64(bytes) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
function bytesFromDataUrl(dataUrl) { const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1); const binary = atob(encoded); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes.buffer; }

try {
  adapter = createIndexedDbDraftAdapter();
  draftStore = createLocalDraftStore(adapter);
} catch {
  status.textContent = 'このブラウザーでは端末内保存を利用できません。';
}

function localStorageValue(key) { try { return globalThis.localStorage?.getItem(key) || null; } catch { return null; } }
function updateStatus(message) { status.textContent = message; }

async function loadSourceOptions() {
  sourceSelect.replaceChildren();
  sourceSelect.add(new Option('読み込み中…', ''));
  // ジグソー keeps its own picture; other tools' pictures come in through the shelf.
  const draftId = pictureDraftId('jigsaw');
  if (!adapter || !draftId) {
    sourceSelect.replaceChildren(new Option('まだ絵がありません', ''));
    displaySourceFields();
    return;
  }
  try {
    const { versions: options } = await listOwnVersions('jigsaw', { adapter });
    if (!options.length) throw new Error('使える絵がありません');
    sourceDraftId = draftId;
    sourceSelect.replaceChildren();
    options.forEach((revision, index) => {
      const option = new Option(`保存版 ${index + 1} · ${revision.document?.width || '?'}×${revision.document?.height || '?'}px`, revision.revisionId);
      option.dataset.width = String(revision.document?.width || ''); option.dataset.height = String(revision.document?.height || '');
      sourceSelect.add(option);
    });
    sourceSelect.value = options.at(-1).revisionId;
    startButton.disabled = false;
    updateStatus('元の絵を変更せず、選んだ保存版からパズルを作ります。');
  } catch (error) {
    sourceSelect.replaceChildren(new Option('保存版を読み込めません', ''));
    startButton.disabled = true;
    updateStatus(`${error.message}。絵をもう一度保存してください。`);
  }
}

function findPiece(pieceId) {
  ensurePieceLookup();
  return pieceLookup.get(pieceId);
}
function ensurePieceLookup() { if (pieceLookupSource !== pieces) { pieceLookupSource = pieces; pieceLookup = new Map(pieces.map((piece) => [piece.pieceId, piece])); } }
function findGroup(groupId) { return game?.groups.find((group) => group.groupId === groupId) || null; }
function groupName(group) { return `${group.pieceIds.length}ピースのグループ`; }
function sourceDimensions() { return { width: game?.layout.width || sourceRevision?.document?.width || 1, height: game?.layout.height || sourceRevision?.document?.height || 1 }; }
function queuePaint() { if (document.hidden || pendingPaint) return; pendingPaint = requestAnimationFrame(() => { pendingPaint = 0; paintWorkspace(); }); }
function cancelPendingPaint() { if (pendingPaint) cancelAnimationFrame(pendingPaint); pendingPaint = 0; }
function canvasMetrics() {
  const rect = boardElement.getBoundingClientRect(); const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  if (lastWorkspaceSize && (rect.width !== lastWorkspaceSize.width || rect.height !== lastWorkspaceSize.height)) {
    view.x = lastWorkspaceSize.width ? view.x * rect.width / lastWorkspaceSize.width : view.x;
    view.y = lastWorkspaceSize.height ? view.y * rect.height / lastWorkspaceSize.height : view.y;
  }
  lastWorkspaceSize = { width: rect.width, height: rect.height };
  const width = Math.max(1, Math.round(rect.width * dpr)); const height = Math.max(1, Math.round(rect.height * dpr));
  if (boardElement.width !== width || boardElement.height !== height) { boardElement.width = width; boardElement.height = height; }
  return { rect, dpr, width, height };
}
function worldScreenTransform(metrics) {
  const { width, height, dpr } = metrics; const dims = sourceDimensions();
  const fit = Math.max(0.02, Math.min(width / dpr / Math.max(1, dims.width), height / dpr / Math.max(1, dims.height)) * 0.88);
  const scale = fit * view.scale * dpr;
  return { scale, x: width / 2 + view.x * dpr - dims.width * scale / 2, y: height / 2 + view.y * dpr - dims.height * scale / 2 };
}
function screenToWorld(clientX, clientY, metrics = canvasMetrics()) {
  const transform = worldScreenTransform(metrics);
  return { x: (clientX - metrics.rect.left) * metrics.dpr / transform.scale - transform.x / transform.scale, y: (clientY - metrics.rect.top) * metrics.dpr / transform.scale - transform.y / transform.scale };
}
function scaleViewAt(scale, clientX, clientY, anchorWorld = screenToWorld(clientX, clientY)) {
  const metrics = canvasMetrics();
  view.scale = Math.max(0.2, Math.min(12, scale));
  const transform = worldScreenTransform(metrics);
  view.x += ((clientX - metrics.rect.left) * metrics.dpr - anchorWorld.x * transform.scale - transform.x) / metrics.dpr;
  view.y += ((clientY - metrics.rect.top) * metrics.dpr - anchorWorld.y * transform.scale - transform.y) / metrics.dpr;
}
function pieceCanvas(piece) {
  if (piece.canvas) return piece.canvas;
  const canvas = document.createElement('canvas'); canvas.width = piece.bounds.width; canvas.height = piece.bounds.height;
  const context = canvas.getContext('2d', { alpha: true });
  const image = new ImageData(new Uint8ClampedArray(piece.rgba), piece.bounds.width, piece.bounds.height);
  for (let index = 0; index < piece.mask.length; index += 1) {
    if (!piece.mask[index]) continue;
    const offset = index * 4;
    if (image.data[offset + 3] === 0) image.data.set([244, 243, 235, 235], offset);
  }
  context.putImageData(image, 0, 0);
  piece.canvas = canvas; return canvas;
}
function pieceIntersectsViewport(piece, group, transform, metrics) {
  const { x, y, width, height } = piece.bounds; let left; let top; let right; let bottom;
  switch (((group.rotation % 4) + 4) % 4) {
    case 1: left = -y - height; right = -y; top = x; bottom = x + width; break;
    case 2: left = -x - width; right = -x; top = -y - height; bottom = -y; break;
    case 3: left = y; right = y + height; top = -x - width; bottom = -x; break;
    default: left = x; right = x + width; top = y; bottom = y + height;
  }
  left += group.x; right += group.x; top += group.y; bottom += group.y;
  const margin = 9 / transform.scale;
  const viewLeft = -transform.x / transform.scale - margin; const viewTop = -transform.y / transform.scale - margin;
  const viewRight = (metrics.width - transform.x) / transform.scale + margin; const viewBottom = (metrics.height - transform.y) / transform.scale + margin;
  return right >= viewLeft && left <= viewRight && bottom >= viewTop && top <= viewBottom;
}
function selectedPath(group) {
  if (!globalThis.Path2D || !group) return null;
  if (selectionCache.layout !== layoutData || selectionCache.pieceIds !== group.pieceIds) {
    ensurePieceLookup();
    const path = new Path2D(); const edges = buildJigsawSelectionEdges(group, layoutData, pieceLookup);
    for (let index = 0; index < edges.length; index += 4) { path.moveTo(edges[index], edges[index + 1]); path.lineTo(edges[index + 2], edges[index + 3]); }
    selectionCache = { layout: layoutData, pieceIds: group.pieceIds, path };
  }
  return selectionCache.path;
}
function clearSelectionCache() { selectionCache = { layout: null, pieceIds: null, path: null }; }
function drawGroup(context, group, transform, metrics, liftAmountValue) {
  context.save(); context.translate(group.x, group.y); context.rotate(group.rotation * Math.PI / 2);
  for (const pieceId of group.pieceIds) {
    const piece = findPiece(pieceId); if (!piece || !pieceIntersectsViewport(piece, group, transform, metrics)) continue;
    context.drawImage(pieceCanvas(piece), piece.bounds.x, piece.bounds.y);
  }
  context.restore();
  if (group.groupId === selectedGroupId) {
    const path = selectedPath(group);
    if (path) {
      context.save(); context.translate(group.x, group.y); context.rotate(group.rotation * Math.PI / 2);
      context.lineCap = 'round'; context.lineJoin = 'round'; context.setLineDash([]);
      context.lineWidth = 3.8 * metrics.dpr / transform.scale; context.strokeStyle = 'rgba(255, 248, 219, .98)';
      if (liftAmountValue > 0) { context.shadowColor = `rgba(17, 27, 29, ${0.32 * liftAmountValue})`; context.shadowBlur = 3 * metrics.dpr * liftAmountValue; context.shadowOffsetY = 2 * metrics.dpr * liftAmountValue; }
      context.stroke(path); context.shadowColor = 'transparent'; context.shadowBlur = 0; context.shadowOffsetY = 0;
      context.lineWidth = 1.7 * metrics.dpr / transform.scale; context.strokeStyle = '#ffd35a'; context.stroke(path); context.restore();
    }
  }
}
function liftAmount(now = performance.now()) {
  if (!liftEffect) return liftValue;
  const progress = Math.max(0, Math.min(1, (now - liftEffect.started) / liftEffect.duration));
  if (progress >= 1) { liftValue = liftEffect.to; liftEffect = null; return liftValue; }
  const eased = progress * progress * (3 - 2 * progress);
  return liftEffect.from + (liftEffect.to - liftEffect.from) * eased;
}
function animateLift(groupId, to, duration) {
  if (document.hidden || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { liftEffect = null; liftValue = to; return; }
  const from = liftAmount();
  liftEffect = { groupId, from, to, started: performance.now(), duration };
}
function clearDragState() { delete workspaceElement.dataset.jigsawDragging; liftEffect = null; liftValue = 0; }
function paintWorkspace() {
  if (!game || !pieces.length) return;
  const metrics = canvasMetrics(); const context = boardElement.getContext('2d'); if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, metrics.width, metrics.height); context.imageSmoothingEnabled = false;
  const transform = worldScreenTransform(metrics); context.setTransform(transform.scale, 0, 0, transform.scale, transform.x, transform.y);
  const frameLiftAmount = liftAmount();
  const draggingId = activePointer?.type === 'group' ? activePointer.groupId : null;
  const topId = draggingId || liftEffect?.groupId || null;
  for (const group of game.groups) if (!group.inTray && group.groupId !== topId) drawGroup(context, group, transform, metrics, 0);
  if (topId) { const group = findGroup(topId); if (group && !group.inTray) drawGroup(context, group, transform, metrics, frameLiftAmount); }
  workspaceElement.dataset.jigsawSelected = selectedGroupId && findGroup(selectedGroupId) && !findGroup(selectedGroupId).inTray ? 'true' : 'false';
  if (liftEffect && !document.hidden) queuePaint();
}
function groupThumb(group) {
  const canvas = document.createElement('canvas'); canvas.width = 52; canvas.height = 52;
  const ctx = canvas.getContext('2d'); if (!ctx) return canvas; ctx.imageSmoothingEnabled = false;
  const rawBounds = worldGroupBounds({ ...group, x: 0, y: 0, rotation: 0 }, layoutData);
  const rotatedBounds = worldGroupBounds({ ...group, x: 0, y: 0 }, layoutData);
  const scale = Math.min(44 / Math.max(1, rotatedBounds.width), 44 / Math.max(1, rotatedBounds.height));
  ctx.translate(26, 26); ctx.scale(scale, scale); ctx.rotate(group.rotation * Math.PI / 2);
  for (const id of group.pieceIds) { const piece = findPiece(id); if (piece) ctx.drawImage(pieceCanvas(piece), piece.bounds.x - rawBounds.x - rawBounds.width / 2, piece.bounds.y - rawBounds.y - rawBounds.height / 2); }
  return canvas;
}
function trayGroups() {
  const order = game.pieceOrder;
  if (pieceOrderSource !== order) { pieceOrderSource = order; pieceOrderIndex = new Map(order.map((pieceId, index) => [pieceId, index])); }
  return game.groups.filter((group) => group.inTray).sort((a, b) => pieceOrderIndex.get(a.pieceIds[0]) - pieceOrderIndex.get(b.pieceIds[0]));
}
function renderTray() {
  trayElement.replaceChildren(); const groups = trayGroups(); const pageCount = Math.max(1, Math.ceil(groups.length / MAX_TRAY_DOM));
  trayPage = Math.min(trayPage, pageCount - 1); const visible = groups.slice(trayPage * MAX_TRAY_DOM, (trayPage + 1) * MAX_TRAY_DOM);
  trayPageLabel.textContent = `${trayPage + 1} / ${pageCount}`; trayPrev.disabled = trayPage === 0; trayNext.disabled = trayPage >= pageCount - 1;
  for (const group of visible) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'jigsaw-piece'; button.dataset.groupId = group.groupId; button.dataset.pieceId = group.pieceIds[0]; button.dataset.rotation = String(group.rotation); button.setAttribute('aria-pressed', String(selectedGroupId === group.groupId)); button.setAttribute('aria-label', `${groupName(group)}、${group.rotation * 90}度回転${selectedGroupId === group.groupId ? '、選択中' : '、選択して作業スペースへ置く'}`);
    button.append(groupThumb(group)); trayElement.append(button);
  }
}
function renderGame() {
  validateJigsawWorkspace(game); trayPage = Math.min(trayPage, Math.max(0, Math.ceil(trayGroups().length / MAX_TRAY_DOM) - 1));
  renderTray(); queuePaint(); completionMessage.hidden = !isJigsawWorkspaceComplete(game); saveButton.disabled = false; updateSelectionControls();
  // the arcade layer (HUD, timer, celebration) listens for this
  document.dispatchEvent(new CustomEvent('jigsaw:state', { detail: { gameId: game.gameId, pieces: layoutData.columns * layoutData.rows, groups: game.groups.length, inTray: game.groups.filter((group) => group.inTray).length, complete: isJigsawWorkspaceComplete(game), width: layoutData.width, height: layoutData.height } }));
}
function updateSelectionControls() {
  const group = findGroup(selectedGroupId); const label = $('#jigsaw-selection');
  label.textContent = group ? `${groupName(group)}を選択中・${group.rotation * 90}°` : 'ピースを選択してください';
  $('#jigsaw-rotate').disabled = !group; $('#jigsaw-return').disabled = !group || group.inTray;
}

function pointInsideWorkspace(x, y) { const rect = workspaceElement.getBoundingClientRect(); return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; }
function hitGroup(world) {
  for (let index = game.groups.length - 1; index >= 0; index -= 1) {
    const group = game.groups[index]; if (group.inTray) continue;
    if (pieceAtPoint(world, group, layoutData)) return group;
  }
  return null;
}
function poseCenteredAt(group, world) {
  const bounds = worldGroupBounds(group, layoutData);
  return { x: group.x + world.x - (bounds.x + bounds.width / 2), y: group.y + world.y - (bounds.y + bounds.height / 2), inTray: false };
}
function snapTolerance() {
  const metrics = canvasMetrics(); const pixelScale = worldScreenTransform(metrics).scale;
  return Math.min(game.layout.pieceSize * 0.25, 10 * metrics.dpr / Math.max(0.001, pixelScale));
}
function placeAt(groupId, world) {
  const group = findGroup(groupId); if (!group) return;
  game = moveJigsawGroup(game, groupId, poseCenteredAt(group, world));
  const snapped = snapJigsawGroup(game, groupId, snapTolerance());
  game = snapped.game; selectedGroupId = snapped.groupId;
  if (snapped.merged) interactionEffects.settle(workspaceElement, { color: '#6f9c5d' });
  renderGame(); updateStatus(snapped.merged ? '隣り合うピースをひとつにまとめました。' : '作業スペースに置きました。ドラッグで移動、回転ボタンで向きを変えられます。');
}
function beginPointer(event, type, groupId = null) {
  if (!game || (event.button !== undefined && event.button !== 0)) return;
  if (type !== 'tray') event.preventDefault();
  const point = { x: event.clientX, y: event.clientY }; const world = type === 'canvas' ? screenToWorld(point.x, point.y) : null;
  const initialGroup = findGroup(groupId);
  activePointer = { pointerId: event.pointerId, type, groupId, start: point, last: point, startWorld: world, moved: false, initialPose: initialGroup ? { x: initialGroup.x, y: initialGroup.y, rotation: initialGroup.rotation, inTray: initialGroup.inTray } : null };
  if (type !== 'tray') try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Document listeners track the gesture. */ }
  if (type === 'canvas') {
    const hit = hitGroup(world);
    if (hit) { selectedGroupId = hit.groupId; activePointer.groupId = hit.groupId; activePointer.type = 'group'; activePointer.startWorld = world; activePointer.initialPose = { x: hit.x, y: hit.y, rotation: hit.rotation, inTray: hit.inTray }; }
    else if (selectedGroupId && findGroup(selectedGroupId)?.inTray) { activePointer.groupId = selectedGroupId; activePointer.type = 'tray-place'; }
    else { activePointer.type = 'pan'; panGesture = { x: point.x, y: point.y, viewX: view.x, viewY: view.y }; }
    updateSelectionControls(); queuePaint();
  } else {
    selectedGroupId = groupId; updateSelectionControls();
    for (const button of trayElement.querySelectorAll('button[data-group-id]')) button.setAttribute('aria-pressed', String(button.dataset.groupId === groupId));
  }
  if (activePointer?.type === 'group') { workspaceElement.dataset.jigsawDragging = 'true'; animateLift(activePointer.groupId, 1, 120); }
  workspaceElement.dataset.jigsawSelected = selectedGroupId && !findGroup(selectedGroupId)?.inTray ? 'true' : 'false';
}
function onPointerMove(event) {
  if (activeTouches.has(event.pointerId)) activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const pointer = activePointer;
    if (pointer && pointer.pointerId === event.pointerId) {
    const dx = event.clientX - pointer.start.x; const dy = event.clientY - pointer.start.y;
    if (!pointer.moved && Math.hypot(dx, dy) >= 6) pointer.moved = true;
    if (pointer.moved && pointer.type === 'tray' && pointInsideWorkspace(event.clientX, event.clientY)) {
      const world = screenToWorld(event.clientX, event.clientY); const group = findGroup(pointer.groupId);
      if (group) {
        game = moveJigsawGroup(game, group.groupId, poseCenteredAt(group, world));
        pointer.type = 'group'; pointer.startWorld = world; pointer.start = { x: event.clientX, y: event.clientY };
        workspaceElement.dataset.jigsawDragging = 'true'; animateLift(group.groupId, 1, 120);
        try { workspaceElement.setPointerCapture(event.pointerId); } catch { /* The document listeners still track the drag. */ }
        renderGame();
      }
    } else if (pointer.moved && pointer.type === 'group') {
      const world = screenToWorld(event.clientX, event.clientY); const group = findGroup(pointer.groupId);
      if (group) { game = moveJigsawGroup(game, group.groupId, { x: group.x + world.x - pointer.startWorld.x, y: group.y + world.y - pointer.startWorld.y, inTray: false }); pointer.startWorld = world; queuePaint(); }
    } else if (pointer.moved && pointer.type === 'pan') {
      view.x = panGesture.viewX + dx; view.y = panGesture.viewY + dy; queuePaint();
    }
  }
  if (panGesture?.pinching && panGesture.ids.includes(event.pointerId)) {
    const points = panGesture.ids.map((id) => activeTouches.get(id)).filter(Boolean);
    if (points.length === 2) {
      const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
      const cx = (points[0].x + points[1].x) / 2; const cy = (points[0].y + points[1].y) / 2;
      scaleViewAt(panGesture.scale * distance / panGesture.distance, cx, cy, panGesture.anchorWorld); queuePaint();
    }
  }
}
const activeTouches = new Map();
function startPinch(ids) {
  const [a, b] = ids.map((id) => activeTouches.get(id));
  if (!a || !b) return;
  const centerX = (a.x + b.x) / 2; const centerY = (a.y + b.y) / 2;
  panGesture = { pinching: true, ids, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), scale: view.scale, centerX, centerY, anchorWorld: screenToWorld(centerX, centerY) };
}
function beginWorkspacePointer(event) {
  activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activeTouches.size >= 2) {
    if (activePointer?.type === 'group' && activePointer.initialPose) {
      const group = findGroup(activePointer.groupId);
      if (group) game = moveJigsawGroup(game, group.groupId, activePointer.initialPose);
      activePointer = null; queuePaint();
      clearDragState();
    }
    const ids = [...activeTouches.keys()].slice(0, 2);
    activePointer = null; startPinch(ids);
    event.preventDefault(); return;
  }
  beginPointer(event, 'canvas');
}
function endPointer(event) {
  if (activePointer?.pointerId === event.pointerId) {
    const pointer = activePointer; activePointer = null;
    if (event.type === 'pointercancel') {
      if (pointer.type === 'group' && pointer.initialPose) {
        const group = findGroup(pointer.groupId); if (group) game = moveJigsawGroup(game, group.groupId, pointer.initialPose);
      }
      clearDragState();
    } else {
      if (pointer.type === 'group' && pointer.moved) {
        const group = findGroup(pointer.groupId);
        if (group) { const snapped = snapJigsawGroup(game, group.groupId, snapTolerance()); game = snapped.game; selectedGroupId = snapped.groupId; if (snapped.merged) interactionEffects.settle(workspaceElement, { color: '#6f9c5d' }); }
      } else if (pointer.type === 'tray-place' && pointInsideWorkspace(event.clientX, event.clientY)) placeAt(pointer.groupId, screenToWorld(event.clientX, event.clientY));
      else if (pointer.type === 'tray' && pointer.moved && pointInsideWorkspace(event.clientX, event.clientY)) placeAt(pointer.groupId, screenToWorld(event.clientX, event.clientY));
      else if (pointer.type === 'canvas' && !pointer.moved) { const world = screenToWorld(event.clientX, event.clientY); const hit = hitGroup(world); if (hit) selectedGroupId = hit.groupId; updateSelectionControls(); }
      if (pointer.type === 'group') {
        delete workspaceElement.dataset.jigsawDragging;
        const settlingGroupId = findGroup(pointer.groupId) ? pointer.groupId : selectedGroupId;
        if (pointer.moved && findGroup(settlingGroupId)) animateLift(settlingGroupId, 0, 160);
        else clearDragState();
      }
    }
    renderGame();
  }
  workspaceElement.dataset.jigsawSelected = selectedGroupId && !findGroup(selectedGroupId)?.inTray ? 'true' : 'false';
  activeTouches.delete(event.pointerId);
  if (panGesture?.pinching) {
    const ids = [...activeTouches.keys()].slice(0, 2);
    if (ids.length === 2) startPinch(ids); else panGesture = null;
  }
  else if (panGesture && !panGesture.pinching && activePointer === null) panGesture = null;
}
function placeSelectedAtCenter() {
  const group = findGroup(selectedGroupId); if (!group) return;
  const rect = workspaceElement.getBoundingClientRect(); placeAt(group.groupId, screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2));
}
function rotateSelected() { if (!findGroup(selectedGroupId)) return; game = rotateJigsawGroup(game, selectedGroupId, 1); renderGame(); }
function returnSelected() { const group = findGroup(selectedGroupId); if (!group) return; game = moveJigsawGroup(game, group.groupId, { x: 0, y: 0, inTray: true }); selectedGroupId = group.groupId; renderGame(); }
function fitWorkspace() { view = { scale: 1, x: 0, y: 0 }; queuePaint(); }
function updateViewport() {
  if (!game?.viewport) return;
  const rect = workspaceElement.getBoundingClientRect();
  view = { scale: game.viewport.scale, x: game.viewport.x * rect.width, y: game.viewport.y * rect.height };
}

function showGame() {
  setupSection.hidden = true; playSection.hidden = false; document.body.dataset.jigsawPlaying = 'true'; renderGame();
}

async function startGame() {
  if (sourceKind.value === 'draw' && !adapter) return;
  startButton.disabled = true; updateStatus('固定した保存版を確認しています…');
  try {
    const gameId = globalThis.crypto.randomUUID(); let source; let rgba; let width; let height;
    if (sourceKind.value === 'draw') {
      const draftId = sourceDraftId || pictureDraftId('jigsaw'); const revision = await resolveLocalDrawRevision(adapter, draftId, sourceSelect.value);
      source = { draftId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme };
      sourceDraftId = draftId; sourceRevision = revision; width = revision.document.width; height = revision.document.height; rgba = { width, height, rgba: documentRgba(revision.document) };
      sourceLabel.textContent = `自分の保存版 ${revision.revisionId.slice(0, 8)} · ${revision.document.width}×${revision.document.height}px`;
    } else {
      let url; let choice = null; let localFile = null; let scaleMessage = '';
      if (sourceKind.value === 'public') {
        choice = JSON.parse(publicSelect.value); url = choice.url;
        await assertListedPublicSource(choice.id, url, choice.puzzleId || null);
      } else {
        const file = fileInput.files?.[0];
        if (!file || file.size > JIGSAW_MAX_IMAGE_BYTES || !['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) throw new Error('PNG、WebP、JPEGの画像を8MB以内で選んでください');
        // Pixel art saved enlarged comes back at one pixel per dot.
        const normalized = await normalizePixelFile(file, { minDots: 16 });
        localFile = normalized.file; scaleMessage = scaleNotice(normalized);
        url = URL.createObjectURL(localFile);
      }
      try {
        const imageBytes = sourceKind.value === 'file' ? await localFile.arrayBuffer() : await fetchImageBytes(url);
        if (imageBytes.byteLength > JIGSAW_MAX_IMAGE_BYTES) throw new Error('画像のファイルサイズが8MBを超えています');
        const decodeUrl = URL.createObjectURL(new Blob([imageBytes])); let image;
        try { image = await decodeImage(decodeUrl); } finally { URL.revokeObjectURL(decodeUrl); }
        const fingerprint = await fingerprintBytes(imageBytes); rgba = boundedRgba(image); width = rgba.width; height = rgba.height;
        if (sourceKind.value === 'public') source = { type: 'public', postId: choice.id, ...(choice.puzzleId ? { puzzleId: choice.puzzleId } : {}), title: String(choice.label).slice(0, 120), url, fingerprint, width, height };
        else source = { type: 'file', dataUrl: `data:${localFile.type};base64,${bytesToBase64(new Uint8Array(imageBytes))}`, fingerprint, width, height };
        validateJigsawSource(source);
        sourceLabel.textContent = `${sourceKind.value === 'public' ? `${source.title} · PiXiEEDの投稿` : '端末で選んだ画像'} · ${rgba.width}×${rgba.height}px${scaleMessage ? ` · ${scaleMessage}` : ''}`;
      } finally { if (sourceKind.value === 'file') URL.revokeObjectURL(url); }
    }
    const pieceSize = gridSelect.value === 'auto' ? 'auto' : Number(gridSelect.value);
    layoutData = createJigsawLayout({ width, height, pieceSize, seed: gameId });
    clearSelectionCache();
    pieces = sliceJigsawPieces(rgba, layoutData);
    game = createJigsawWorkspace({ gameId, source, layout: layoutData, seed: gameId });
    pxdOriginalRefs = null; pxdPreservedPayload = null;
    pxdBridge?.reset();
    selectedGroupId = null; trayPage = 0; view = { scale: 1, x: 0, y: 0 }; gameDraftId = game.gameId;
    updatePieceEstimate({ width, height }); showGame(); updateStatus(`作成しました。${(layoutData.columns * layoutData.rows).toLocaleString('ja-JP')}ピースを自由に動かせます。`);
  } catch (error) { updateStatus(`パズルを作れませんでした：${error.message}`); }
  finally { displaySourceFields(); }
}

async function saveGame() {
  if (!draftStore || !game) return;
  saveButton.disabled = true; updateStatus('途中の配置を端末に保存しています…');
  try {
    const rect = workspaceElement.getBoundingClientRect();
    game = { ...game, viewport: { scale: Math.max(0.2, Math.min(12, view.scale)), x: Math.max(-4, Math.min(4, rect.width ? view.x / rect.width : 0)), y: Math.max(-4, Math.min(4, rect.height ? view.y / rect.height : 0)) } };
    validateJigsawWorkspace(game, layoutData);
    if (game.source.type === 'public' || game.source.type === 'file') {
      validateJigsawSource(game.source);
      if (game.source.type === 'public' && game.source.postId.startsWith('pixfind:')) await assertListedPublicSource(game.source.postId, game.source.url, game.source.puzzleId);
    }
    else { const fixedSource = await resolveLocalDrawRevision(adapter, game.source.draftId, game.source.revisionId); if (fixedSource.asset.assetId !== game.source.assetId || fixedSource.documentHash !== game.source.contentHash || fixedSource.hashScheme !== game.source.hashScheme) throw new Error('元の保存版が一致しません。パズルを新しく作り直してください'); }
    await draftStore.save({ draftId: gameDraftId, kind: 'jigsaw', ownerId: 'local-owner', document: game, source: { type: 'jigsaw_game', assetId: game.source.assetId || null, revisionId: game.source.revisionId || null } });
  } catch (error) {
    saveButton.disabled = false; updateStatus(`保存できませんでした：${error.message || '端末の空き容量とブラウザーの保存設定を確認してください。'}`); return;
  }
  try {
    localStorage.setItem(JIGSAW_LAST_DRAFT_KEY, gameDraftId);
    saveButton.disabled = false; updateStatus(isJigsawWorkspaceComplete(game) ? '完成したパズルを端末に保存しました。' : '配置を端末に保存しました。');
  } catch {
    saveButton.disabled = false; updateStatus('パズル本体は保存されましたが、再開用の目印を保存できませんでした。');
  }
}

async function resumeGame() {
  if (!draftStore || !adapter) return;
  const draftId = localStorageValue(JIGSAW_LAST_DRAFT_KEY);
  if (!draftId) { resumeButton.hidden = true; updateStatus('前回のパズルはありません。'); return; }
  resumeButton.disabled = true; updateStatus('前回の配置と元の固定版を確認しています…');
  try {
    const revision = await draftStore.load(draftId);
    if (!revision || revision.asset.kind !== 'jigsaw' || revision.asset.owner.type !== 'local' || revision.asset.owner.id !== 'local-owner' || revision.asset.visibility !== 'draft') throw new Error('保存したパズルが見つかりません');
    const stored = revision.document; const isLegacy = stored?.schemaVersion === 1;
    const savedGame = isLegacy ? stored : validateJigsawWorkspace(stored);
    if (savedGame.gameId !== draftId) throw new Error('パズルIDが一致しません');
    let rgba; let width; let height;
    if (savedGame.source.type === 'public') {
      await assertListedPublicSource(savedGame.source.postId, savedGame.source.url, savedGame.source.puzzleId || null);
      const bytes = await fetchImageBytes(savedGame.source.url); if (await fingerprintBytes(bytes) !== savedGame.source.fingerprint) throw new Error('公開画像が保存時から変わっています。別の絵へ自動変更はしません');
      const blobUrl = URL.createObjectURL(new Blob([bytes])); try { rgba = boundedRgba(await decodeImage(blobUrl)); } finally { URL.revokeObjectURL(blobUrl); }
      width = rgba.width; height = rgba.height; if (width !== savedGame.source.width || height !== savedGame.source.height) throw new Error('公開画像のサイズが保存時から変わっています。別の絵へ自動変更はしません');
      sourceLabel.textContent = `${savedGame.source.title} · PiXiEEDの投稿`;
    } else if (savedGame.source.type === 'file') {
      validateJigsawSource(savedGame.source); if (await fingerprintBytes(bytesFromDataUrl(savedGame.source.dataUrl)) !== savedGame.source.fingerprint) throw new Error('保存した画像の内容が一致しません。別の絵へ自動変更はしません'); rgba = boundedRgba(await decodeImage(savedGame.source.dataUrl)); width = rgba.width; height = rgba.height;
      if (width !== savedGame.source.width || height !== savedGame.source.height) throw new Error('保存した画像サイズが一致しません。別の絵へ自動変更はしません'); sourceLabel.textContent = '端末で選んだ画像';
    } else {
      const fixedSource = await resolveLocalDrawRevision(adapter, savedGame.source.draftId, savedGame.source.revisionId);
      if (fixedSource.asset.assetId !== savedGame.source.assetId || fixedSource.documentHash !== savedGame.source.contentHash || fixedSource.hashScheme !== savedGame.source.hashScheme) throw new Error('元の保存版が一致しません。別の版へ自動変更はしません');
      sourceDraftId = savedGame.source.draftId; sourceRevision = fixedSource; width = fixedSource.document.width; height = fixedSource.document.height; rgba = { width, height, rgba: documentRgba(fixedSource.document) };
      sourceLabel.textContent = `自分の保存版 ${fixedSource.revisionId.slice(0, 8)} · ${width}×${height}px`;
    }
    if (isLegacy) {
      layoutData = createJigsawLayout({ width, height, pieceSize: 'auto', seed: savedGame.gameId, legacyGridSize: savedGame.gridSize });
      game = migrateLegacyJigsawGame(savedGame, { width, height, seed: savedGame.gameId });
    } else {
      if (savedGame.layout.width !== width || savedGame.layout.height !== height) throw new Error('保存した作業スペースと元画像の寸法が一致しません');
      layoutData = createJigsawLayout(savedGame.layout);
      if (layoutData.columns !== savedGame.layout.columns || layoutData.rows !== savedGame.layout.rows || layoutData.pieceSize !== savedGame.layout.pieceSize) throw new Error('保存したピース境界を再現できません');
      game = savedGame;
    }
    clearSelectionCache();
    pieces = sliceJigsawPieces(rgba, layoutData); gameDraftId = draftId; selectedGroupId = null; trayPage = 0; view = { scale: 1, x: 0, y: 0 };
    pxdOriginalRefs = null; pxdPreservedPayload = null; pxdBridge?.reset();
    showGame();
    if (savedGame.viewport && !isLegacy) {
      updateViewport();
      renderGame();
    }
    resumeButton.disabled = false; updateStatus(isLegacy ? '前回の配置を新しい作業スペースへ引き継ぎました。元の履歴は残っています。' : '前回の配置を、同じ元の固定版で再開しました。');
  } catch (error) { resumeButton.disabled = false; updateStatus(`再開できませんでした：${error.message}`); }
}

async function encodePxdJigsawImage(image) {
  if (!image || image.width < 1 || image.height < 1 || image.width * image.height > JIGSAW_MAX_SOURCE_PIXELS || !(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== image.width * image.height * 4) throw new TypeError('PXDの画像画素を確認できません。');
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', { alpha: true }); if (!context) throw new Error('PXD画像を処理できません。');
  context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG画像を書き出せません。')), 'image/png'));
  if (blob.size > JIGSAW_MAX_IMAGE_BYTES) throw new RangeError('PXD画像がジグソーの8MB上限を超えています。原本はPXD内に保持しています。');
  const bytes = new Uint8Array(await blob.arrayBuffer()); const fingerprint = await fingerprintBytes(bytes.buffer);
  const dataUrl = canvas.toDataURL('image/png'); const roundTrip = boundedRgba(await decodeImage(dataUrl));
  if (roundTrip.width !== image.width || roundTrip.height !== image.height || roundTrip.rgba.some((value, index) => value !== image.rgba[index])) throw new Error('画像のRGBAがPNG復元後に変わるため、このファイルはこの端末では遊べません。PXD原本は保持しています。');
  return { dataUrl, fingerprint, width: image.width, height: image.height };
}

async function openPxdJigsaw(project) {
  if (!draftStore || !adapter) throw new Error('端末内保存を利用できません。');
  let publicRgba = null;
  let materialized;
  if (hasPxdPuzzle(project, 'jigsaw')) {
    const loaded = await readPxdPuzzle(project, 'jigsaw');
    materialized = await materializePxdPuzzle(loaded, {
      tool: 'jigsaw', store: draftStore,
      verifyPublicSource: async (source) => {
        await assertListedPublicSource(source.postId, source.url, source.puzzleId || null);
        const bytes = await fetchImageBytes(source.url);
        if (await fingerprintBytes(bytes) !== source.fingerprint) throw new Error('公開画像が保存時から変わっています。PXDの参照は権限を引き継ぎません。');
        const blobUrl = URL.createObjectURL(new Blob([bytes]));
        try { publicRgba = boundedRgba(await decodeImage(blobUrl)); } finally { URL.revokeObjectURL(blobUrl); }
        if (publicRgba.width !== source.width || publicRgba.height !== source.height) throw new Error('公開画像サイズが一致しません。');
      },
      encodeJigsawFileImage: encodePxdJigsawImage
    });
  } else materialized = await createPxdPuzzleFromMain(project, { tool: 'jigsaw', store: draftStore, encodeJigsawFileImage: encodePxdJigsawImage });
  const nextGame = validateJigsawWorkspace(materialized.document);
  const nextLayout = createJigsawLayout(nextGame.layout);
  let sourcePixels;
  if (nextGame.source.type === 'public') sourcePixels = publicRgba;
  else if (nextGame.source.type === 'file') {
    const bytes = bytesFromDataUrl(nextGame.source.dataUrl);
    if (await fingerprintBytes(bytes) !== nextGame.source.fingerprint) throw new Error('PXDから復元した画像のfingerprintが一致しません。');
    sourcePixels = boundedRgba(await decodeImage(nextGame.source.dataUrl));
    if (sourcePixels.width !== nextGame.source.width || sourcePixels.height !== nextGame.source.height) throw new Error('PXDから復元した画像サイズが一致しません。');
  } else {
    const binding = materialized.bindings.source;
    if (!binding) throw new Error('PXDに自分の固定画像がありません。');
    sourceRevision = binding.revision; sourceDraftId = binding.draftId;
    sourcePixels = { width: binding.drawDocument.width, height: binding.drawDocument.height, rgba: documentRgba(binding.drawDocument) };
  }
  if (!sourcePixels || sourcePixels.width !== nextLayout.width || sourcePixels.height !== nextLayout.height) throw new Error('PXDの画像と盤面サイズが一致しません。');
  const nextPieces = sliceJigsawPieces(sourcePixels, nextLayout);
  pxdBridge?.reset();
  game = nextGame; layoutData = nextLayout; pieces = nextPieces; gameDraftId = game.gameId;
  clearSelectionCache(); clearDragState();
  pxdOriginalRefs = materialized.portableOriginalRefs; pxdPreservedPayload = materialized.preservedPayload || null;
  selectedGroupId = null; trayPage = 0; view = { scale: 1, x: 0, y: 0 };
  sourceLabel.textContent = game.source.type === 'public' ? `${game.source.title} · 公開作品` : game.source.type === 'file' ? 'PXD内の端末画像' : `PXDの自分の固定版 · ${sourcePixels.width}×${sourcePixels.height}px`;
  gridSelect.value = String(layoutData.pieceSize); updatePieceEstimate({ width: layoutData.width, height: layoutData.height });
  saveButton.disabled = false; showGame(); updateStatus('PXDのジグソーを開きました。配置を変えると別の端末内下書きとして保存できます。');
}

function mountPxdJigsaw() {
  if (!draftStore) return null;
  return mountPxdTools({
    tool: 'jigsaw',
    hasContent: () => Boolean(game),
    getPublicSources: () => game?.source?.type === 'public' ? [game.source] : [],
    getProject: async (project) => {
      if (!game) return project;
      const sourceDrawDocuments = {}; const sourceImages = {};
      if (game.source.type === 'file') {
        const image = boundedRgba(await decodeImage(game.source.dataUrl));
        sourceImages['jigsaw-main'] = { width: image.width, height: image.height, rgba: new Uint8Array(image.rgba) };
      } else if (game.source.type !== 'public' && sourceRevision?.document) sourceDrawDocuments['jigsaw-main'] = sourceRevision.document;
      return writePxdPuzzle(project, { tool: 'jigsaw', document: game, sourceDrawDocuments, sourceImages, portableOriginalRefs: pxdOriginalRefs, preservedPayload: pxdPreservedPayload, sourceChanged: false });
    },
    openProject: openPxdJigsaw
  });
}

startButton.addEventListener('click', startGame);
sourceKind.addEventListener('change', displaySourceFields);
sourceSelect.addEventListener('change', displaySourceFields);
publicSelect.addEventListener('change', displaySourceFields);
fileInput.addEventListener('change', displaySourceFields);
resumeButton.addEventListener('click', resumeGame);
saveButton.addEventListener('click', saveGame);
trayElement.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-group-id]'); if (!button || !game) return;
  const id = button.dataset.groupId;
  if (event.detail === 0) { selectedGroupId = selectedGroupId === id ? null : id; updateSelectionControls(); button.setAttribute('aria-pressed', String(selectedGroupId === id)); }
  trayElement.querySelector(`[data-group-id="${CSS.escape(id)}"]`)?.focus();
});
trayElement.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('button[data-group-id]'); if (button) beginPointer(event, 'tray', button.dataset.groupId);
});
workspaceElement.addEventListener('pointerdown', beginWorkspacePointer);
document.addEventListener('pointermove', onPointerMove, { passive: false });
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);
$('#jigsaw-rotate').addEventListener('click', rotateSelected);
$('#jigsaw-return').addEventListener('click', returnSelected);
$('#jigsaw-fit').addEventListener('click', fitWorkspace);
trayPrev.addEventListener('click', () => { trayPage = Math.max(0, trayPage - 1); renderTray(); });
trayNext.addEventListener('click', () => { trayPage += 1; renderTray(); });
gridSelect.addEventListener('change', displaySourceFields);
workspaceElement.addEventListener('keydown', (event) => {
  if (!game) return;
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotateSelected(); return; }
  if (event.key === 'Escape') { selectedGroupId = null; renderGame(); return; }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGroupId) { event.preventDefault(); returnSelected(); return; }
  const group = findGroup(selectedGroupId);
  if (event.key === 'Enter' && group?.inTray) { event.preventDefault(); placeSelectedAtCenter(); return; }
  const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (offsets[event.key] && group && !group.inTray) {
    event.preventDefault(); const [dx, dy] = offsets[event.key]; const step = Math.max(1, Math.round(game.layout.pieceSize / 3));
    game = moveJigsawGroup(game, group.groupId, { x: group.x + dx * step, y: group.y + dy * step, inTray: false }); queuePaint();
  }
});
workspaceElement.addEventListener('wheel', (event) => {
  if (!game || event.deltaY === 0) return; event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 0.89;
  scaleViewAt(view.scale * factor, event.clientX, event.clientY); queuePaint();
}, { passive: false });
window.addEventListener('resize', () => { if (game) queuePaint(); });
if ('ResizeObserver' in globalThis) new ResizeObserver(() => { if (game) queuePaint(); }).observe(workspaceElement);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelPendingPaint(); liftEffect = null; liftValue = activePointer?.type === 'group' ? 1 : 0; }
  else if (game) queuePaint();
});
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => {
  if (event.matches) { cancelPendingPaint(); liftEffect = null; liftValue = activePointer?.type === 'group' ? 1 : 0; if (game) queuePaint(); }
});

$('#jigsaw-new').addEventListener('click', () => {
  pxdBridge?.reset();
  game = null; sourceRevision = null; layoutData = null; pieces = []; selectedGroupId = null;
  clearSelectionCache(); clearDragState();
  delete workspaceElement.dataset.jigsawSelected;
  pieceLookupSource = pieces; pieceLookup.clear(); pieceOrderSource = null; pieceOrderIndex.clear();
  pxdOriginalRefs = null; pxdPreservedPayload = null;
  delete document.body.dataset.jigsawPlaying; playSection.hidden = true; setupSection.hidden = false; saveButton.disabled = true;
  updateStatus('絵とピースの大きさを選んでください。');
});

resumeButton.hidden = !draftStore || !localStorageValue(JIGSAW_LAST_DRAFT_KEY);
saveButton.disabled = true;
mountPictureShelf($('#jigsaw-shelf'), { tool: 'jigsaw', adapter, onBrought: async ({ from }) => { sourceKind.value = 'draw'; await loadSourceOptions(); displaySourceFields(); updateStatus(`${from.label}の絵を持ってきました。`); }, onError: (error) => updateStatus(`持ってこられませんでした：${error.message}`) });
pxdBridge = mountPxdJigsaw();
if (pxdBridge) {
  const imported = await pxdBridge.ready;
  if (!imported) { await loadSourceOptions(); await loadPublicOptions(); displaySourceFields(); }
} else {
  await loadSourceOptions(); await loadPublicOptions(); displaySourceFields();
}
