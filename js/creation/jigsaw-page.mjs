import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import {
  createJigsawGame, isJigsawComplete, placeJigsawPiece, removeJigsawPiece,
  chunkJigsawPuzzleIds, collectPagedRows, fingerprintBytes, firstPublishedPixfindReferences, isSafeJigsawPixfindOriginalUrl, resolveLocalDrawRevision, sliceDrawDocument, sliceRgbaImage, validateJigsawGame, validateJigsawSource, JIGSAW_MAX_IMAGE_BYTES, JIGSAW_MAX_SOURCE_PIXELS
} from './jigsaw-core.mjs?rev=20260928-jigsaw-pixfind-original-2';
import { supabaseConfig } from '../../data/site-config.js';

const DRAW_LAST_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const JIGSAW_LAST_DRAFT_KEY = 'pixieed:creation:jigsaw:last-draft:v1';
const $ = (selector) => document.querySelector(selector);
const status = $('#jigsaw-status'); const sourceSelect = $('#jigsaw-source-version');
const sourceKind = $('#jigsaw-source-kind'); const publicSelect = $('#jigsaw-public-version'); const fileInput = $('#jigsaw-file');
const gridSelect = $('#jigsaw-grid-size'); const startButton = $('#jigsaw-start');
const resumeButton = $('#jigsaw-resume'); const saveButton = $('#jigsaw-save');
const setupSection = $('#jigsaw-setup'); const playSection = $('#jigsaw-play');
const boardElement = $('#jigsaw-board'); const trayElement = $('#jigsaw-tray');
const completionMessage = $('#jigsaw-complete'); const sourceLabel = $('#jigsaw-source-label');
let adapter = null; let draftStore = null; let sourceDraftId = null; let gameDraftId = null;
let game = null; let sourceRevision = null; let pieces = []; let selectedPieceId = null;
let activeDrag = null; let suppressClickUntil = 0;
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
  $('#jigsaw-public-source').hidden = sourceKind.value !== 'public';
  $('#jigsaw-file-source').hidden = sourceKind.value !== 'file';
  startButton.disabled = sourceKind.value === 'draw' ? !sourceSelect.value : sourceKind.value === 'public' ? !publicSelect.value : !fileInput.files?.[0];
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
  const draftId = localStorageValue(DRAW_LAST_DRAFT_KEY);
  if (!adapter || !draftId) {
    sourceSelect.replaceChildren(new Option('保存したドット絵がありません', ''));
    displaySourceFields();
    return;
  }
  try {
    const record = await adapter.get(draftId);
    if (!record || record.schemaVersion !== 1 || record.draftId !== draftId || !Array.isArray(record.revisions)) throw new Error('保存した絵が見つかりません');
    const options = record.revisions.filter((revision) => revision?.asset?.kind === 'pixel_art' && revision.asset.owner?.type === 'local' && revision.asset.owner.id === 'local-owner' && revision.asset.visibility === 'draft');
    if (!options.length) throw new Error('使える手描き保存版がありません');
    sourceDraftId = draftId;
    sourceSelect.replaceChildren();
    options.forEach((revision, index) => {
      const option = new Option(`保存版 ${index + 1} · ${revision.document?.width || '?'}×${revision.document?.height || '?'}px`, revision.revisionId);
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

function canvasForPiece(piece, className) {
  const canvas = document.createElement('canvas'); canvas.className = className;
  canvas.width = piece.width; canvas.height = piece.height;
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d', { alpha: true });
  context.putImageData(new ImageData(piece.rgba, piece.width, piece.height), 0, 0);
  return canvas;
}

function findPiece(pieceId) { return pieces.find((piece) => piece.pieceId === pieceId); }
function findPlacement(cell) { return game.placements.find((placement) => placement.cell === cell); }
function pieceIsCorrect(pieceId, cell) { return game.pieces.find((piece) => piece.pieceId === pieceId)?.correctCell === cell; }
function pieceName(pieceId) { const orderIndex = game.pieceOrder.indexOf(pieceId); return orderIndex >= 0 ? `ピース ${orderIndex + 1}` : 'ピース'; }

function renderBoard() {
  boardElement.replaceChildren();
  boardElement.style.setProperty('--jigsaw-columns', String(game.gridSize));
  const sourceWidth = game.source.width || sourceRevision?.document?.width || 1; const sourceHeight = game.source.height || sourceRevision?.document?.height || 1;
  boardElement.style.setProperty('--jigsaw-ratio', String(sourceWidth / sourceHeight));
  sizeBoard(sourceWidth / sourceHeight);
  boardElement.setAttribute('aria-label', `${game.gridSize}×${game.gridSize}のパズル盤面`);
  for (let cell = 0; cell < game.pieces.length; cell += 1) {
    const row = Math.floor(cell / game.gridSize) + 1; const column = cell % game.gridSize + 1;
    const placement = findPlacement(cell); const button = document.createElement('button');
    button.type = 'button'; button.className = 'jigsaw-cell'; button.dataset.cell = String(cell);
    if (!placement) {
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${row}行${column}列目、空きマス${selectedPieceId ? `。選択中の${pieceName(selectedPieceId)}をここに置く` : '。ピースを選んでからここを押す'}`);
    } else {
      const correct = pieceIsCorrect(placement.pieceId, cell);
      button.dataset.correct = String(correct); button.setAttribute('aria-pressed', String(selectedPieceId === placement.pieceId));
      button.setAttribute('aria-label', `${row}行${column}列目、${pieceName(placement.pieceId)}、${correct ? '正しい場所' : '置き場所が違います'}。押すと取り外します`);
      const piece = findPiece(placement.pieceId); button.append(canvasForPiece(piece, 'jigsaw-cell__image'));
      const result = document.createElement('span'); result.className = 'jigsaw-cell__result'; result.setAttribute('aria-hidden', 'true'); result.textContent = correct ? '✓' : '×'; button.append(result);
    }
    boardElement.append(button);
  }
}

function sizeBoard(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  const landscape = globalThis.innerWidth > globalThis.innerHeight && globalThis.innerHeight <= 520;
  const maxWidth = Math.max(140, globalThis.innerWidth - (landscape ? 210 : 20));
  const maxHeight = Math.max(120, globalThis.innerHeight - (landscape ? 140 : 230));
  const width = Math.min(maxWidth, maxHeight * ratio); const height = width / ratio;
  boardElement.style.width = `${Math.floor(width)}px`; boardElement.style.height = `${Math.floor(height)}px`;
}

function renderTray() {
  trayElement.replaceChildren();
  const placed = new Set(game.placements.map((placement) => placement.pieceId));
  for (const pieceId of game.pieceOrder) {
    if (placed.has(pieceId)) continue;
    const piece = findPiece(pieceId); const button = document.createElement('button');
    button.type = 'button'; button.className = 'jigsaw-piece'; button.dataset.pieceId = pieceId;
    button.setAttribute('aria-pressed', String(selectedPieceId === pieceId));
    button.setAttribute('aria-label', `${pieceName(pieceId)}、${selectedPieceId === pieceId ? '選択中。置き先を選ぶ' : '未選択。選ぶ'}`);
    button.append(canvasForPiece(piece, 'jigsaw-piece__image'));
    const label = document.createElement('span'); label.textContent = pieceName(pieceId); button.append(label);
    trayElement.append(button);
  }
}

function renderGame() {
  validateJigsawGame(game); renderBoard(); renderTray();
  const complete = isJigsawComplete(game); completionMessage.hidden = !complete;
  saveButton.disabled = false;
}

function dragTargetCell(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)?.closest?.('button[data-cell]');
  return target && boardElement.contains(target) ? Number(target.dataset.cell) : null;
}
function beginPieceDrag(event, element, pieceId, origin) {
  if (event.button !== undefined && event.button !== 0 || !game) return;
  activeDrag = { pointerId: event.pointerId, element, pieceId, origin, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragging: false };
}
function onDragMove(event) {
  const drag = activeDrag; if (!drag || drag.pointerId !== event.pointerId) return;
  drag.x = event.clientX; drag.y = event.clientY;
  const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
  if (!drag.dragging && Math.hypot(dx, dy) >= 7) {
    drag.dragging = true; suppressClickUntil = performance.now() + 160;
    const rect = drag.element.getBoundingClientRect();
    drag.element.style.setProperty('--drag-origin-x', `${rect.left}px`); drag.element.style.setProperty('--drag-origin-y', `${rect.top}px`);
    drag.element.style.setProperty('--drag-w', `${rect.width}px`); drag.element.style.setProperty('--drag-h', `${rect.height}px`);
    drag.element.classList.add('is-dragging');
    drag.element.style.setProperty('--drag-x', `${dx}px`); drag.element.style.setProperty('--drag-y', `${dy}px`);
    try { drag.element.setPointerCapture(event.pointerId); } catch { /* The element may have been rerendered. */ }
  } else if (drag.dragging) {
    event.preventDefault();
    drag.element.style.setProperty('--drag-x', `${dx}px`); drag.element.style.setProperty('--drag-y', `${dy}px`);
    const targetCell = dragTargetCell(event.clientX, event.clientY);
    boardElement.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
    if (targetCell !== null && !findPlacement(targetCell)) boardElement.querySelector(`[data-cell="${targetCell}"]`)?.classList.add('is-drop-target');
  }
}
function finishPieceDrag(event) {
  const drag = activeDrag; if (!drag || drag.pointerId !== event.pointerId) return;
  activeDrag = null;
  if (drag.dragging) {
    suppressClickUntil = performance.now() + 160;
    drag.element.classList.remove('is-dragging');
    for (const property of ['--drag-x', '--drag-y', '--drag-origin-x', '--drag-origin-y', '--drag-w', '--drag-h']) drag.element.style.removeProperty(property);
    boardElement.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
    if (event.type === 'pointercancel') return;
    const cell = dragTargetCell(event.clientX, event.clientY);
    if (cell === null || findPlacement(cell)) { updateStatus('空いているマスにドロップしてください。'); return; }
    if (drag.origin.type === 'board' && drag.origin.cell === cell) return;
    try {
      const baseGame = drag.origin.type === 'board' ? removeJigsawPiece(game, drag.origin.cell).game : game;
      game = placeJigsawPiece(baseGame, drag.pieceId, cell); selectedPieceId = null; renderGame();
      updateStatus(isJigsawComplete(game) ? '完成しました。元の保存版は変更されていません。' : pieceIsCorrect(drag.pieceId, cell) ? '正しい場所に置けました。' : '置き場所が違います。盤面のピースもドラッグして移動できます。');
    } catch (error) { updateStatus(error.message || 'ピースを置けませんでした。'); }
    return;
  }
}

function showGame() {
  setupSection.hidden = true; playSection.hidden = false; renderGame();
}

async function startGame() {
  if (sourceKind.value === 'draw' && !adapter) return;
  startButton.disabled = true; updateStatus('固定した保存版を確認しています…');
  try {
    const gameId = globalThis.crypto.randomUUID(); const gridSize = Number(gridSelect.value);
    if (sourceKind.value === 'draw') {
      const draftId = sourceDraftId || localStorageValue(DRAW_LAST_DRAFT_KEY); const revision = await resolveLocalDrawRevision(adapter, draftId, sourceSelect.value);
      game = await createJigsawGame({ adapter, gameId, sourceDraftId: draftId, sourceRevision: revision, gridSize });
      sourceDraftId = draftId; sourceRevision = revision; pieces = sliceDrawDocument(revision.document, gridSize);
      sourceLabel.textContent = `自分の保存版 ${revision.revisionId.slice(0, 8)} · ${revision.document.width}×${revision.document.height}px`;
    } else {
      let url; let source; let choice = null;
      if (sourceKind.value === 'public') {
        choice = JSON.parse(publicSelect.value); url = choice.url;
        await assertListedPublicSource(choice.id, url, choice.puzzleId || null);
      } else {
        const file = fileInput.files?.[0];
        if (!file || file.size > JIGSAW_MAX_IMAGE_BYTES || !['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) throw new Error('PNG、WebP、JPEGの画像を8MB以内で選んでください');
        url = URL.createObjectURL(file);
      }
      try {
        const imageBytes = sourceKind.value === 'file' ? await fileInput.files[0].arrayBuffer() : await fetchImageBytes(url);
        if (imageBytes.byteLength > JIGSAW_MAX_IMAGE_BYTES) throw new Error('画像のファイルサイズが8MBを超えています');
        const decodeUrl = URL.createObjectURL(new Blob([imageBytes])); let image;
        try { image = await decodeImage(decodeUrl); } finally { URL.revokeObjectURL(decodeUrl); }
        const fingerprint = await fingerprintBytes(imageBytes); const rgba = boundedRgba(image);
        if (sourceKind.value === 'public') source = { type: 'public', postId: choice.id, ...(choice.puzzleId ? { puzzleId: choice.puzzleId } : {}), title: String(choice.label).slice(0, 120), url, fingerprint, width: rgba.width, height: rgba.height };
        else source = { type: 'file', dataUrl: `data:${fileInput.files[0].type};base64,${bytesToBase64(new Uint8Array(imageBytes))}`, fingerprint, width: rgba.width, height: rgba.height };
        validateJigsawSource(source);
        game = validateJigsawGame({ schemaVersion: 1, gameId, gridSize, source, pieces: Array.from({ length: gridSize * gridSize }, (_, cell) => ({ pieceId: `piece-${String(cell + 1).padStart(2, '0')}`, correctCell: cell })), pieceOrder: Array.from({ length: gridSize * gridSize }, (_, cell) => `piece-${String((cell + gridSize) % (gridSize * gridSize) + 1).padStart(2, '0')}`), placements: [] });
        pieces = sliceRgbaImage(rgba, gridSize); sourceLabel.textContent = `${sourceKind.value === 'public' ? `${source.title} · PiXiEEDの投稿` : '端末で選んだ画像'} · ${rgba.width}×${rgba.height}px`;
      } finally { if (sourceKind.value === 'file') URL.revokeObjectURL(url); }
    }
    selectedPieceId = null; gameDraftId = game.gameId;
    showGame(); updateStatus(`${game.gridSize}×${game.gridSize}のパズルを始めました。ピースを選んで置き先を押してください。`);
  } catch (error) { updateStatus(`パズルを作れませんでした：${error.message}`); }
  finally { displaySourceFields(); }
}

async function saveGame() {
  if (!draftStore || !game) return;
  saveButton.disabled = true; updateStatus('途中の配置を端末に保存しています…');
  try {
    validateJigsawGame(game);
    if (game.source.type === 'public' || game.source.type === 'file') {
      validateJigsawSource(game.source);
      if (game.source.type === 'public' && game.source.postId.startsWith('pixfind:')) await assertListedPublicSource(game.source.postId, game.source.url, game.source.puzzleId);
    }
    else { const fixedSource = await resolveLocalDrawRevision(adapter, game.source.draftId, game.source.revisionId); if (fixedSource.asset.assetId !== game.source.assetId || fixedSource.documentHash !== game.source.contentHash || fixedSource.hashScheme !== game.source.hashScheme) throw new Error('元の保存版が一致しません。パズルを新しく作り直してください'); }
    await draftStore.save({ draftId: gameDraftId, kind: 'jigsaw', ownerId: 'local-owner', document: game, source: { type: 'jigsaw_game', assetId: game.source.assetId, revisionId: game.source.revisionId } });
  } catch (error) {
    saveButton.disabled = false; updateStatus(`保存できませんでした：${error.message || '端末の空き容量とブラウザーの保存設定を確認してください。'}`); return;
  }
  try {
    localStorage.setItem(JIGSAW_LAST_DRAFT_KEY, gameDraftId);
    saveButton.disabled = false; updateStatus(isJigsawComplete(game) ? '完成したパズルを端末に保存しました。' : '途中の配置を端末に保存しました。');
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
    const savedGame = validateJigsawGame(revision.document);
    if (savedGame.gameId !== draftId) throw new Error('パズルIDが一致しません');
    game = savedGame; gameDraftId = draftId; selectedPieceId = null;
    if (savedGame.source.type === 'public') {
      await assertListedPublicSource(savedGame.source.postId, savedGame.source.url, savedGame.source.puzzleId || null);
      const bytes = await fetchImageBytes(savedGame.source.url); if (await fingerprintBytes(bytes) !== savedGame.source.fingerprint) throw new Error('公開画像が保存時から変わっています。別の絵へ自動変更はしません');
      const blobUrl = URL.createObjectURL(new Blob([bytes])); try { const rgba = boundedRgba(await decodeImage(blobUrl)); if (rgba.width !== savedGame.source.width || rgba.height !== savedGame.source.height) throw new Error('公開画像のサイズが保存時から変わっています。別の絵へ自動変更はしません'); pieces = sliceRgbaImage(rgba, game.gridSize); } finally { URL.revokeObjectURL(blobUrl); }
      sourceLabel.textContent = `${savedGame.source.title} · PiXiEEDの投稿`;
    } else if (savedGame.source.type === 'file') {
      validateJigsawSource(savedGame.source); if (await fingerprintBytes(bytesFromDataUrl(savedGame.source.dataUrl)) !== savedGame.source.fingerprint) throw new Error('保存した画像の内容が一致しません。別の絵へ自動変更はしません'); const image = await decodeImage(savedGame.source.dataUrl); const rgba = boundedRgba(image); if (rgba.width !== savedGame.source.width || rgba.height !== savedGame.source.height) throw new Error('保存した画像サイズが一致しません。別の絵へ自動変更はしません'); pieces = sliceRgbaImage(rgba, game.gridSize); sourceLabel.textContent = '端末で選んだ画像';
    } else {
      const fixedSource = await resolveLocalDrawRevision(adapter, savedGame.source.draftId, savedGame.source.revisionId);
      if (fixedSource.asset.assetId !== savedGame.source.assetId || fixedSource.documentHash !== savedGame.source.contentHash || fixedSource.hashScheme !== savedGame.source.hashScheme) throw new Error('元の保存版が一致しません。別の版へ自動変更はしません');
      sourceDraftId = savedGame.source.draftId; sourceRevision = fixedSource; pieces = sliceDrawDocument(fixedSource.document, game.gridSize);
      sourceLabel.textContent = `自分の保存版 ${fixedSource.revisionId.slice(0, 8)} · ${fixedSource.document.width}×${fixedSource.document.height}px`;
    }
    showGame(); resumeButton.disabled = false; updateStatus('前回の配置を、同じ元の保存版で再開しました。');
  } catch (error) { resumeButton.disabled = false; updateStatus(`再開できませんでした：${error.message}`); }
}

startButton.addEventListener('click', startGame);
sourceKind.addEventListener('change', displaySourceFields);
sourceSelect.addEventListener('change', displaySourceFields);
publicSelect.addEventListener('change', displaySourceFields);
fileInput.addEventListener('change', displaySourceFields);
resumeButton.addEventListener('click', resumeGame);
saveButton.addEventListener('click', saveGame);

trayElement.addEventListener('click', (event) => {
  if (performance.now() < suppressClickUntil) { event.preventDefault(); return; }
  const button = event.target.closest('button[data-piece-id]'); if (!button || !game) return;
  const clickedPieceId = button.dataset.pieceId;
  selectedPieceId = selectedPieceId === clickedPieceId ? null : clickedPieceId;
  renderGame();
  [...trayElement.querySelectorAll('button[data-piece-id]')].find((candidate) => candidate.dataset.pieceId === clickedPieceId)?.focus();
  updateStatus(selectedPieceId ? `${selectedPieceId}を選びました。盤面の置き先を押してください。` : 'ピースの選択を解除しました。');
});

boardElement.addEventListener('click', (event) => {
  if (performance.now() < suppressClickUntil) { event.preventDefault(); return; }
  const button = event.target.closest('button[data-cell]'); if (!button || !game) return;
  const cell = Number(button.dataset.cell); const row = Math.floor(cell / game.gridSize) + 1; const column = cell % game.gridSize + 1;
  const existing = findPlacement(cell);
  try {
    if (existing && !selectedPieceId) {
      const removed = removeJigsawPiece(game, cell); game = removed.game; selectedPieceId = removed.pieceId;
      renderGame();
      [...trayElement.querySelectorAll('button[data-piece-id]')].find((candidate) => candidate.dataset.pieceId === selectedPieceId)?.focus();
      updateStatus(`${pieceName(removed.pieceId)}を取り外しました。新しい置き先を選んでください。`); return;
    }
    if (existing) { updateStatus('この場所にはすでにピースがあります。先に置いたピースを押して取り外してください。'); return; }
    if (!selectedPieceId) { updateStatus('先にトレーからピースを選んでください。'); return; }
    const pieceId = selectedPieceId;
    game = placeJigsawPiece(game, pieceId, cell); selectedPieceId = null; renderGame();
    [...boardElement.querySelectorAll('button[data-cell]')].find((candidate) => Number(candidate.dataset.cell) === cell)?.focus();
    if (isJigsawComplete(game)) updateStatus('完成しました。元の保存版は変更されていません。');
    else if (pieceIsCorrect(pieceId, cell)) updateStatus(`${row}行${column}列目に正しく置けました。`);
    else updateStatus(`${row}行${column}列目ではありません。赤い×のピースを押すと置き直せます。`);
  } catch (error) { updateStatus(error.message || 'ピースを置けませんでした。'); }
});

trayElement.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('button[data-piece-id]'); if (!button) return;
  beginPieceDrag(event, button, button.dataset.pieceId, { type: 'tray' });
});
boardElement.addEventListener('pointerdown', (event) => {
  const cellButton = event.target.closest('button[data-cell]'); if (!cellButton) return;
  const placement = findPlacement(Number(cellButton.dataset.cell)); if (!placement) return;
  beginPieceDrag(event, cellButton, placement.pieceId, { type: 'board', cell: placement.cell });
});
document.addEventListener('pointermove', onDragMove, { passive: false });
document.addEventListener('pointerup', finishPieceDrag);
document.addEventListener('pointercancel', finishPieceDrag);
window.addEventListener('resize', () => {
  if (!game) return;
  const width = game.source.width || sourceRevision?.document?.width || 1; const height = game.source.height || sourceRevision?.document?.height || 1;
  sizeBoard(width / height);
});

$('#jigsaw-new').addEventListener('click', () => {
  game = null; sourceRevision = null; pieces = []; selectedPieceId = null;
  playSection.hidden = true; setupSection.hidden = false; saveButton.disabled = true;
  updateStatus('元の絵の保存版とピース数を選んでください。');
});

resumeButton.hidden = !draftStore || !localStorageValue(JIGSAW_LAST_DRAFT_KEY);
saveButton.disabled = true;
loadSourceOptions();
loadPublicOptions();
displaySourceFields();
