import { hashCanonical, validateAsset } from './asset-contract.mjs';
import { documentRgba, validateDrawDocument } from './draw-core.mjs';
import { supabaseConfig } from '../../data/site-config.js';

export const JIGSAW_SCHEMA_VERSION = 1;
export const JIGSAW_GRID_SIZES = Object.freeze([2, 3, 4]);
export const JIGSAW_MAX_SOURCE_PIXELS = 2 * 1024 * 1024;
export const JIGSAW_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const LOCAL_DRAW_OWNER_ID = 'local-owner';

function assertGridSize(gridSize) {
  if (!JIGSAW_GRID_SIZES.includes(gridSize)) throw new RangeError('盤面は2×2、3×3、4×4から選んでください');
}

function assertLocalDrawRevisionShape(revision, draftId, assetId) {
  if (!revision || revision.schemaVersion !== 1 || typeof revision.revisionId !== 'string' || !revision.revisionId || !/^[a-f0-9]{64}$/.test(revision.documentHash) || revision.hashScheme !== 'sha256-canonical-v1' || !revision.document) throw new TypeError('保存版の情報が壊れています');
  const asset = validateAsset(revision.asset);
  if (asset.assetId !== assetId || asset.revisionId !== revision.revisionId || asset.contentHash !== revision.documentHash || asset.hashScheme !== revision.hashScheme || asset.kind !== 'pixel_art' || asset.visibility !== 'draft' || asset.owner.type !== 'local' || asset.owner.id !== LOCAL_DRAW_OWNER_ID || asset.reusePermission !== 'owner_only') throw new Error('ジグソーに使える自分の手描き保存版ではありません');
  if (typeof draftId !== 'string' || !draftId) throw new TypeError('保存版のIDがありません');
  validateDrawDocument(revision.document);
  return revision;
}

async function validateFixedRevision(revision, draftId, assetId) {
  assertLocalDrawRevisionShape(revision, draftId, assetId);
  if (await hashCanonical(revision.document) !== revision.documentHash) throw new Error('保存版のhashと編集データが一致しません');
  return revision;
}

export async function resolveLocalDrawRevision(adapter, draftId, revisionId) {
  if (!adapter || typeof adapter.get !== 'function' || typeof draftId !== 'string' || !draftId || typeof revisionId !== 'string' || !revisionId) throw new TypeError('保存版を特定するIDが必要です');
  const record = await adapter.get(draftId);
  if (!record || record.schemaVersion !== 1 || record.draftId !== draftId || typeof record.assetId !== 'string' || !Array.isArray(record.revisions)) throw new Error('端末に保存した絵が見つかりません');
  const revision = record.revisions.find((candidate) => candidate?.revisionId === revisionId);
  if (!revision) throw new Error('指定された保存版が見つかりません。別の版へ自動変更はしません');
  return validateFixedRevision(revision, draftId, record.assetId);
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

function deterministicOrder(pieceCount, seedText) {
  let state = fnv1a(seedText) || 1;
  const values = Array.from({ length: pieceCount }, (_, index) => index);
  for (let index = values.length - 1; index > 0; index -= 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const other = (state >>> 0) % (index + 1);
    [values[index], values[other]] = [values[other], values[index]];
  }
  if (values.every((value, index) => value === index)) values.push(values.shift());
  return values;
}

export async function createJigsawGame({ adapter, gameId, sourceDraftId, sourceRevision, gridSize }) {
  assertGridSize(gridSize);
  if (typeof gameId !== 'string' || !gameId) throw new TypeError('パズルIDが必要です');
  const fixedRevision = await resolveLocalDrawRevision(adapter, sourceDraftId, sourceRevision?.revisionId);
  if (fixedRevision.documentHash !== sourceRevision.documentHash || fixedRevision.asset.assetId !== sourceRevision.asset.assetId) throw new Error('選択した保存版が端末の固定版と一致しません');
  sourceRevision = fixedRevision;
  const count = gridSize * gridSize;
  const pieces = Array.from({ length: count }, (_, correctCell) => ({ pieceId: `piece-${String(correctCell + 1).padStart(2, '0')}`, correctCell }));
  const source = {
    draftId: sourceDraftId,
    assetId: sourceRevision.asset.assetId,
    revisionId: sourceRevision.revisionId,
    contentHash: sourceRevision.documentHash,
    hashScheme: sourceRevision.hashScheme
  };
  return validateJigsawGame({
    schemaVersion: JIGSAW_SCHEMA_VERSION,
    gameId,
    gridSize,
    source,
    pieceOrder: deterministicOrder(count, `${source.draftId}:${source.revisionId}:${gridSize}`).map((index) => pieces[index].pieceId),
    pieces,
    placements: []
  });
}

export function validateJigsawGame(game) {
  if (!game || game.schemaVersion !== JIGSAW_SCHEMA_VERSION || typeof game.gameId !== 'string' || !game.gameId) throw new TypeError('パズルの保存データが壊れています');
  assertGridSize(game.gridSize);
  const expectedCount = game.gridSize * game.gridSize;
  validateJigsawSource(game.source);
  if (!Array.isArray(game.pieces) || game.pieces.length !== expectedCount || !Array.isArray(game.pieceOrder) || game.pieceOrder.length !== expectedCount || !Array.isArray(game.placements)) throw new TypeError('ピース一覧が壊れています');
  const pieceMap = new Map();
  for (let cell = 0; cell < game.pieces.length; cell += 1) {
    const piece = game.pieces[cell];
    if (!piece || piece.pieceId !== `piece-${String(cell + 1).padStart(2, '0')}` || piece.correctCell !== cell) throw new TypeError('ピースの正解セルが壊れています');
    pieceMap.set(piece.pieceId, piece);
  }
  if (new Set(game.pieceOrder).size !== expectedCount || game.pieceOrder.some((pieceId) => !pieceMap.has(pieceId))) throw new TypeError('ピース順が壊れています');
  const placedPieces = new Set(); const placedCells = new Set();
  for (const placement of game.placements) {
    if (!placement || !pieceMap.has(placement.pieceId) || placedPieces.has(placement.pieceId) || !Number.isInteger(placement.cell) || placement.cell < 0 || placement.cell >= expectedCount || placedCells.has(placement.cell)) throw new TypeError('ピースの配置が壊れています');
    placedPieces.add(placement.pieceId); placedCells.add(placement.cell);
  }
  return game;
}

/** Validate source identity while keeping schema-v1 local Draw saves readable. */
export function validateJigsawSource(source) {
  if (!source || typeof source !== 'object') throw new TypeError('元作品の固定版参照が壊れています');
  if (!source.type || source.type === 'draw' || source.draftId) {
    if (typeof source.draftId !== 'string' || !source.draftId || typeof source.assetId !== 'string' || !source.assetId || typeof source.revisionId !== 'string' || !source.revisionId || source.hashScheme !== 'sha256-canonical-v1' || !/^[a-f0-9]{64}$/.test(source.contentHash)) throw new TypeError('元作品の固定版参照が壊れています');
    return source;
  }
  if (source.type === 'public') {
    let parsed; try { parsed = new URL(source.url); } catch { throw new TypeError('公開作品の参照が壊れています'); }
    const storageOrigin = new URL(supabaseConfig.url).origin;
    const path = parsed.pathname.split('/');
    const pixfindMatch = typeof source.postId === 'string' ? /^pixfind:([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{1,128})$/.exec(source.postId) : null;
    const isPixfind = !!pixfindMatch;
    const isExistingPublic = typeof source.postId === 'string' && /^(map|showcase):[A-Za-z0-9_-]{1,128}$/.test(source.postId);
    const validUrl = isPixfind
      ? isSafeJigsawPixfindOriginalUrl(source.url, supabaseConfig.url, source.puzzleId)
      : isSafeJigsawPublicUrl(source.url, supabaseConfig.url);
    if ((!isPixfind && !isExistingPublic) || (isPixfind && (!/^[A-Za-z0-9_-]{1,128}$/.test(source.puzzleId || '') || pixfindMatch[2] !== source.puzzleId)) || typeof source.title !== 'string' || !source.title.trim() || source.title.length > 120 || source.url.length > 2048 || parsed.protocol !== 'https:' || parsed.origin !== storageOrigin || parsed.username || parsed.password || parsed.search || parsed.hash || !validUrl || !/^[a-f0-9]{64}$/.test(source.fingerprint) || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 2 || source.height < 2 || source.width * source.height > JIGSAW_MAX_SOURCE_PIXELS || Object.hasOwn(source, 'dataUrl') || Object.hasOwn(source, 'imageDataUrl') || Object.hasOwn(source, 'rgba')) throw new TypeError('公開作品の参照が壊れています');
    return source;
  }
  if (source.type === 'file') {
    if (typeof source.dataUrl !== 'string' || source.dataUrl.length > Math.ceil(JIGSAW_MAX_IMAGE_BYTES * 4 / 3) + 128 || !/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(source.dataUrl) || !/^[a-f0-9]{64}$/.test(source.fingerprint) || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 2 || source.height < 2 || source.width * source.height > JIGSAW_MAX_SOURCE_PIXELS) throw new TypeError('選択した画像の保存データが壊れています');
    return source;
  }
  throw new TypeError('元作品の種類が不正です');
}

export function isSafeJigsawPublicUrl(value, supabaseUrl) {
  try {
    const url = new URL(value); const base = new URL(supabaseUrl); const path = url.pathname.split('/');
    return url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash && path[1] === 'storage' && path[2] === 'v1' && path[3] === 'object' && path[4] === 'public' && ['post-public', 'social-posts'].includes(path[5]) && path.length >= 8 && path.slice(6).every((part) => { const decoded = decodeURIComponent(part); return part && decoded !== '..' && decoded !== '.' && !decoded.includes('/') && !decoded.includes('\\'); });
  } catch { return false; }
}

export function isSafeJigsawPixfindOriginalUrl(value, supabaseUrl, puzzleId) {
  try {
    if (typeof puzzleId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(puzzleId)) return false;
    const url = new URL(value); const base = new URL(supabaseUrl);
    const match = /^\/storage\/v1\/object\/public\/(pixfind-puzzles|pixieed-contest)\/puzzles\/([A-Za-z0-9_-]{1,128})\/original\.png$/.exec(url.pathname);
    return url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash && value === `${url.origin}${url.pathname}` && !!match && match[2] === puzzleId;
  } catch { return false; }
}

export async function fingerprintBytes(bytes) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 1 || bytes.byteLength > JIGSAW_MAX_IMAGE_BYTES) throw new TypeError('画像のファイルサイズが上限を超えています');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function collectPagedRows(fetchPage, { pageSize = 500, maxRows = 100000 } = {}) {
  if (typeof fetchPage !== 'function' || !Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxRows) || maxRows < pageSize) throw new TypeError('一覧取得のページ設定が不正です');
  const rows = []; let offset = 0;
  for (;;) {
    const page = await fetchPage(offset, pageSize);
    if (!Array.isArray(page) || page.length > pageSize) throw new TypeError('一覧取得のページ形式が不正です');
    rows.push(...page);
    if (rows.length > maxRows) throw new RangeError('一覧取得の上限を超えています');
    if (page.length < pageSize) return rows;
    offset += page.length;
  }
}

export function chunkJigsawPuzzleIds(ids, chunkSize = 50) {
  if (!Array.isArray(ids) || !Number.isInteger(chunkSize) || chunkSize < 1 || ids.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new TypeError('PiXFiND問題IDの分割設定が不正です');
  const chunks = [];
  for (let offset = 0; offset < ids.length; offset += chunkSize) chunks.push(ids.slice(offset, offset + chunkSize));
  return chunks;
}

/** The input order comes from published_at.desc, so the first public reference wins. */
export function firstPublishedPixfindReferences(posts) {
  if (!Array.isArray(posts)) throw new TypeError('PiXFiND投稿一覧が不正です');
  const references = new Map();
  for (const post of posts) {
    if (post?.status !== 'published' || post.post_kind !== 'pixfind' || post.distribution_mode !== 'pixfind' || typeof post.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(post.id) || typeof post.pixfind_puzzle_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(post.pixfind_puzzle_id) || references.has(post.pixfind_puzzle_id)) continue;
    references.set(post.pixfind_puzzle_id, post);
  }
  return references;
}

export function placeJigsawPiece(game, pieceId, cell) {
  validateJigsawGame(game);
  if (!game.pieces.some((piece) => piece.pieceId === pieceId) || !Number.isInteger(cell) || cell < 0 || cell >= game.pieces.length) throw new RangeError('ピースまたは置き場所がありません');
  if (game.placements.some((placement) => placement.pieceId === pieceId)) throw new Error('このピースはすでに盤面にあります');
  if (game.placements.some((placement) => placement.cell === cell)) throw new Error('この場所にはすでにピースがあります');
  return validateJigsawGame({ ...game, placements: [...game.placements, { pieceId, cell }] });
}

export function removeJigsawPiece(game, cell) {
  validateJigsawGame(game);
  const placement = game.placements.find((item) => item.cell === cell);
  if (!placement) throw new RangeError('この場所にピースはありません');
  return { game: validateJigsawGame({ ...game, placements: game.placements.filter((item) => item !== placement) }), pieceId: placement.pieceId };
}

export function isJigsawComplete(game) {
  validateJigsawGame(game);
  return game.placements.length === game.pieces.length && game.placements.every((placement) => game.pieces.find((piece) => piece.pieceId === placement.pieceId)?.correctCell === placement.cell);
}

export function sliceRgbaImage({ width, height, rgba }, gridSize) {
  assertGridSize(gridSize);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < gridSize || height < gridSize || width * height > JIGSAW_MAX_SOURCE_PIXELS || !ArrayBuffer.isView(rgba) || rgba.BYTES_PER_ELEMENT !== 1 || rgba.length !== width * height * 4) throw new TypeError('画像の画素データまたはサイズが不正です');
  const pieces = [];
  for (let row = 0; row < gridSize; row += 1) for (let column = 0; column < gridSize; column += 1) {
    const x = Math.floor(column * width / gridSize); const right = Math.floor((column + 1) * width / gridSize);
    const y = Math.floor(row * height / gridSize); const bottom = Math.floor((row + 1) * height / gridSize);
    const pieceWidth = right - x; const pieceHeight = bottom - y; const pieceRgba = new Uint8ClampedArray(pieceWidth * pieceHeight * 4);
    for (let line = 0; line < pieceHeight; line += 1) {
      const start = ((y + line) * width + x) * 4; const end = start + pieceWidth * 4;
      pieceRgba.set(rgba.subarray(start, end), line * pieceWidth * 4);
    }
    const correctCell = row * gridSize + column;
    pieces.push({ pieceId: `piece-${String(correctCell + 1).padStart(2, '0')}`, correctCell, row, column, x, y, width: pieceWidth, height: pieceHeight, rgba: pieceRgba });
  }
  return pieces;
}

export function sliceDrawDocument(document, gridSize) {
  validateDrawDocument(document);
  return sliceRgbaImage({ width: document.width, height: document.height, rgba: documentRgba(document) }, gridSize);
}

export function reassembleRgbaImage({ width, height, gridSize, pieces }) {
  assertGridSize(gridSize);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < gridSize || height < gridSize || !Array.isArray(pieces) || pieces.length !== gridSize * gridSize) throw new TypeError('再組立てに必要な画像サイズまたはピースがありません');
  const output = new Uint8ClampedArray(width * height * 4); const seen = new Set();
  for (const piece of pieces) {
    if (!piece || !Number.isInteger(piece.correctCell) || piece.correctCell < 0 || piece.correctCell >= pieces.length || seen.has(piece.correctCell)) throw new TypeError('ピースの正解セルが重複または不正です');
    seen.add(piece.correctCell);
    const row = Math.floor(piece.correctCell / gridSize); const column = piece.correctCell % gridSize;
    const x = Math.floor(column * width / gridSize); const right = Math.floor((column + 1) * width / gridSize);
    const y = Math.floor(row * height / gridSize); const bottom = Math.floor((row + 1) * height / gridSize);
    const pieceWidth = right - x; const pieceHeight = bottom - y;
    if (piece.x !== x || piece.y !== y || piece.width !== pieceWidth || piece.height !== pieceHeight || piece.rgba?.length !== pieceWidth * pieceHeight * 4 || !ArrayBuffer.isView(piece.rgba) || piece.rgba.BYTES_PER_ELEMENT !== 1) throw new TypeError('ピースの元画素境界が一致しません');
    for (let line = 0; line < pieceHeight; line += 1) {
      const sourceStart = line * pieceWidth * 4; const targetStart = ((y + line) * width + x) * 4;
      output.set(piece.rgba.subarray(sourceStart, sourceStart + pieceWidth * 4), targetStart);
    }
  }
  return output;
}
