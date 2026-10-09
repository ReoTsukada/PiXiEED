import { detectPixelScale, wholePixelFit } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';
import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { documentRgba } from './draw-core.mjs';
import { createPuzzleHintController } from './puzzle-hint.mjs?rev=20261001-free-tools-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20261006-result-list-1';
import { resolveLocalDrawRevision, validateSpotDifferenceDraft } from './spot-difference-core.mjs';
import { buildHiddenObjectHitBoxes, HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH, validateHiddenObjectDraft } from './hidden-object-core.mjs?rev=20260928-short-hitboxes-1';
import { computeDifferenceRegions, computeHiddenObjectRegions, regionContainsPoint, resolvePuzzleFromLocation, validateHiddenObjectMarkers, validateLocalDifferenceGroups, validateStoredDifferenceRegions } from './pixfind-regions.mjs';
import { selectPixfindHit } from './pixfind-hit-test.mjs';
import { clampPixfindViewport, mapPixfindPoint, pinchPixfindViewport, pixfindViewportGeometry, pixfindWheelZoomFactor, zoomPixfindViewport } from './pixfind-viewport.mjs';
import { verifyPuzzleSharePage } from './puzzle-share-client.mjs?rev=20261004-legacy-puzzle-share-1';
import { isLegacyPuzzleShareId } from './puzzle-share-identity.mjs?rev=20261004-legacy-puzzle-share-1';
import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261006-header-controls-1';
import { createLevelTracker, trackSiteEvent } from '../site-analytics.mjs';

const BUCKETS = new Set(['pixfind-puzzles', 'pixieed-contest']);
const HEADERS = { apikey: supabaseConfig.publishableKey };
const SELECT = Object.freeze({ posts: 'id,status,post_kind,distribution_mode,pixfind_puzzle_id', puzzles: 'id,slug,label,author_name,original_url,diff_url,thumbnail_url,mode,game_mode,play_mode,targets,regions' });

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
/** 間違い探し and もの探し are separate games, each on its own page. */
export const PUZZLE_PLAY_PATHS = Object.freeze({ 'spot-difference': '/play/spot-difference/', 'hidden-object': '/play/hidden-object/' });
export const MODE_NAMES = Object.freeze({ 'spot-difference': '間違い探し', 'hidden-object': 'もの探し' });
/** Results leave a preview/direct link for its game's list, independent of browser history. */
export const puzzleResultListHref = (mode) => PUZZLE_PLAY_PATHS[mode] || '/tools/';

/** The game page an older /pixfind/ link belongs to; a local もの探し draft is known from its address, anything else starts at 間違い探し and moves on once the puzzle's mode is known. */
export function playPathForLegacyLink(location) {
  try {
    const params = new URLSearchParams(location?.search || '');
    if (params.has('localHidden')) return PUZZLE_PLAY_PATHS['hidden-object'];
    if (['postPuzzle', 'localSpot', 'puzzle'].some((key) => params.has(key)) || String(location?.hash || '').startsWith('#puzzle=')) return PUZZLE_PLAY_PATHS['spot-difference'];
  } catch { /* fall through */ }
  return '/tools/';
}

/** Where 戻る goes from a single puzzle: the tool a local draft came from, otherwise this game's own list. */
export function exitDestination(location, pageMode) {
  try {
    const params = new URLSearchParams(location?.search || '');
    if (params.has('localSpot')) return '/spot-difference/';
    if (params.has('localHidden')) return '/hidden-object/';
  } catch { /* fall through */ }
  return PUZZLE_PLAY_PATHS[pageMode] || '/tools/';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolvePostPuzzleId(location) {
  try {
    const params = new URLSearchParams(location?.search || ''); const values = params.getAll('postPuzzle');
    if (!values.length) return undefined;
    if (values.length !== 1 || !UUID.test(values[0]) || ['puzzle', 'localSpot', 'localHidden'].some((key) => params.has(key)) || Boolean(location?.hash)) return null;
    return values[0];
  } catch { return null; }
}

export function safePublicPostImageUrl(value, supabaseUrl = supabaseConfig.url) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const rawPath = value.match(/^https:\/\/[^/]+(\/[^?#]*)/i)?.[1];
    if (!rawPath || rawPath.split('/').some((part) => part === '.' || part === '..')) return null;
    const project = new URL(supabaseUrl); const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== project.origin || url.username || url.password || url.search || url.hash) return null;
    if (!url.pathname.startsWith('/storage/v1/object/public/post-public/')) return null;
    const key = url.pathname.slice('/storage/v1/object/public/post-public/'.length);
    if (!key || !/^[A-Za-z0-9_./-]+$/.test(key) || key.split('/').some((part) => !part || part === '.' || part === '..') || !/\.png$/i.test(key)) return null;
    return url.href;
  } catch { return null; }
}

export function preparePublicPostPuzzle(payload, postId, supabaseUrl = supabaseConfig.url) {
  const fail = () => { throw new Error('公開問題の定義を安全に確認できませんでした。'); };
  if (!UUID.test(String(postId || '')) || !payload || payload.ok !== true || (payload.postId !== undefined && payload.postId !== postId) || !payload.puzzle || payload.puzzle.postId !== postId) fail();
  const row = payload.puzzle; const mode = row.mode;
  if (!['spot_difference', 'hidden_object'].includes(mode)) fail();
  const originalUrl = safePublicPostImageUrl(row.originalImage?.url, supabaseUrl);
  if (!originalUrl) fail();
  const width = row.originalImage?.width; const height = row.originalImage?.height;
  const definition = row.definition;
  const allowedSizes = new Set([16, 32, 64, 128, 256, 512]);
  if (![width, height].every((value) => allowedSizes.has(value))
      || definition?.schemaVersion !== 1 || definition?.confirmed !== true || definition.width !== width || definition.height !== height) fail();
  const cleanText = (value, fallback, limit) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : fallback;
  if (typeof row.title !== 'string' || !row.title.trim() || typeof row.author !== 'string' || !row.author.trim()) fail();
  if (mode === 'spot_difference') {
    const changedUrl = safePublicPostImageUrl(row.changedImage?.url, supabaseUrl);
    if (!changedUrl || row.changedImage.width !== width || row.changedImage.height !== height || !Array.isArray(definition.candidates) || !definition.candidates.length) fail();
    const used = new Set(); const ids = new Set();
    for (const group of definition.candidates) {
      if (!group || typeof group.id !== 'string' || !group.id || ids.has(group.id) || !Array.isArray(group.pixels) || !group.pixels.length) fail();
      ids.add(group.id);
      for (const pixel of group.pixels) { if (!Number.isInteger(pixel) || pixel < 0 || pixel >= width * height || used.has(pixel)) fail(); used.add(pixel); }
    }
    return Object.freeze({ id: postId, postId, slug: null, label: cleanText(row.title, MODE_NAMES['spot-difference'], 160), author: cleanText(row.author, '作者不明', 120), mode: 'spot-difference', originalUrl, changedUrl, thumbnailUrl: originalUrl, width, height, publicPostOnly: true, candidates: definition.candidates });
  }
  if (row.changedImage !== undefined || !Array.isArray(definition.targets) || !definition.targets.length || !Array.isArray(definition.hitBoxes)) fail();
  let hitBoxes;
  try { hitBoxes = buildHiddenObjectHitBoxes(definition.targets, width, height, HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH); } catch { fail(); }
  if (definition.hitBoxes.length !== hitBoxes.length || hitBoxes.some((box, index) => {
    const supplied = definition.hitBoxes[index];
    return !supplied || supplied.targetId !== box.targetId || supplied.minX !== box.minX || supplied.minY !== box.minY || supplied.maxX !== box.maxX || supplied.maxY !== box.maxY;
  })) fail();
  const regions = localHiddenHitBoxRegions(definition.targets, hitBoxes, width, height);
  if (!regions) fail();
  return Object.freeze({ id: postId, postId, slug: null, label: cleanText(row.title, MODE_NAMES['hidden-object'], 160), author: cleanText(row.author, '作者不明', 120), mode: 'hidden-object', originalUrl, thumbnailUrl: originalUrl, width, height, publicPostOnly: true, targets: definition.targets, regions });
}

export async function fetchPublicPostPuzzle(postId, fetchImpl = fetch, supabaseUrl = supabaseConfig.url) {
  if (!UUID.test(String(postId || ''))) throw new Error('公開問題IDを確認できません。');
  const url = new URL('/functions/v1/public-post-puzzle', `${supabaseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('postId', postId);
  const response = await fetchImpl(url.href, { method: 'GET', headers: HEADERS, cache: 'no-store', credentials: 'omit' });
  if (!response?.ok || response.status !== 200) throw new Error('この公開問題は現在利用できません。');
  let payload;
  try { payload = await response.json(); } catch { throw new Error('公開問題の応答を読み取れませんでした。'); }
  return preparePublicPostPuzzle(payload, postId, supabaseUrl);
}

export function resolveLocalSpotDraftId(location) {
  try {
    const values = new URLSearchParams(location?.search || '').getAll('localSpot');
    if (!values.length) return undefined;
    return values.length === 1 && UUID.test(values[0]) ? values[0] : null;
  } catch { return null; }
}

export function resolveLocalHiddenDraftId(location) {
  try {
    const values = new URLSearchParams(location?.search || '').getAll('localHidden');
    if (!values.length) return undefined;
    return values.length === 1 && UUID.test(values[0]) ? values[0] : null;
  } catch { return null; }
}

function sameRevisionReference(reference, revision) {
  return reference?.assetId === revision.asset.assetId
    && reference.revisionId === revision.revisionId
    && reference.contentHash === revision.documentHash
    && reference.hashScheme === revision.hashScheme;
}

function rgbaDocument(document) {
  return { width: document.width, height: document.height, data: new Uint8ClampedArray(documentRgba(document)) };
}

/** Read and revalidate one confirmed local Spot draft without network or persistence. */
export async function loadLocalSpotDraft(draftAdapter, drawAdapter, draftId) {
  if (!UUID.test(String(draftId || ''))) throw new Error('端末内の試遊IDが正しくありません');
  const saved = await createLocalDraftStore(draftAdapter).load(draftId);
  if (!saved || saved.revisionId == null || saved.asset.kind !== 'spot_difference' || saved.asset.visibility !== 'draft'
      || saved.asset.owner?.type !== 'local' || saved.asset.owner.id !== 'local-owner' || saved.asset.reusePermission !== 'owner_only') {
    throw new Error('この端末に自分の間違い探し下書きが見つかりません');
  }
  const draft = validateSpotDifferenceDraft(saved.document);
  if (draft.gameId !== draftId || draft.confirmed !== true || draft.publication !== 'draft' || draft.published === true) {
    throw new Error('確認済みの端末内下書きではありません');
  }
  if (saved.asset.source?.type !== 'local_draft_copy' || saved.asset.source.assetId !== draft.before.assetId || saved.asset.source.revisionId !== draft.before.revisionId) {
    throw new Error('間違い探しの元作品参照が一致しません');
  }
  const before = await resolveLocalDrawRevision(drawAdapter, draft.before.draftId, draft.before.revisionId);
  const after = await resolveLocalDrawRevision(drawAdapter, draft.after.draftId, draft.after.revisionId);
  if (!sameRevisionReference(draft.before, before) || !sameRevisionReference(draft.after, after)
      || before.document.width !== draft.width || before.document.height !== draft.height
      || after.document.width !== draft.width || after.document.height !== draft.height) {
    throw new Error('元または変更後の保存版が下書きの固定版と一致しません');
  }
  const difference = computeDifferenceRegions(rgbaDocument(before.document), rgbaDocument(after.document));
  const regions = validateLocalDifferenceGroups(draft.candidates, difference);
  if (!regions) throw new Error('正解候補に実際の差分以外の画素が含まれています');
  return { id: draftId, revisionId: saved.revisionId, draft, beforeDocument: before.document, afterDocument: after.document, regions, differenceMask: difference.mask };
}

/** Read and revalidate one confirmed local Hidden Object draft without network or persistence. */
export async function loadLocalHiddenDraft(draftAdapter, drawAdapter, draftId) {
  if (!UUID.test(String(draftId || ''))) throw new Error('端末内の試遊IDが正しくありません');
  const saved = await createLocalDraftStore(draftAdapter).load(draftId);
  if (!saved || saved.revisionId == null || saved.asset.kind !== 'hidden_object' || saved.asset.visibility !== 'draft'
      || saved.asset.owner?.type !== 'local' || saved.asset.owner.id !== 'local-owner' || saved.asset.reusePermission !== 'owner_only') {
    throw new Error('この端末に自分のもの探し下書きが見つかりません');
  }
  const draft = validateHiddenObjectDraft(saved.document);
  if (draft.gameId !== draftId || draft.confirmed !== true || draft.publication !== 'draft' || draft.published === true) throw new Error('確認済みの端末内下書きではありません');
  if (saved.asset.source?.type !== 'local_draft_copy' || saved.asset.source.assetId !== draft.source.assetId || saved.asset.source.revisionId !== draft.source.revisionId) throw new Error('もの探しの元作品参照が一致しません');
  const source = await resolveLocalDrawRevision(drawAdapter, draft.source.draftId, draft.source.revisionId);
  if (!sameRevisionReference(draft.source, source) || source.document.width !== draft.width || source.document.height !== draft.height) throw new Error('元画像の固定版が下書きと一致しません');
  let hitBoxes;
  try { hitBoxes = buildHiddenObjectHitBoxes(draft.targets, draft.width, draft.height, HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH); }
  catch { throw new Error('この下書きは短い画面で対象を押し分けられません。対象を離して作り直してください。'); }
  const regions = localHiddenHitBoxRegions(draft.targets, hitBoxes, draft.width, draft.height);
  if (!regions) throw new Error('保存した正解範囲を安全に確認できません');
  return { id: draftId, revisionId: saved.revisionId, draft, sourceDocument: source.document, regions };
}

function localHiddenHitBoxRegions(targets, hitBoxes, width, height) {
  if (!Array.isArray(targets) || !targets.length || !Array.isArray(hitBoxes) || hitBoxes.length !== targets.length) return null;
  const used = new Set(); const regions = [];
  for (const target of targets) {
    const matches = hitBoxes.filter((box) => box?.targetId === target.id);
    if (matches.length !== 1) return null;
    const box = matches[0];
    if (![box.minX, box.maxX, box.minY, box.maxY].every(Number.isInteger) || box.minX < 0 || box.minY < 0 || box.maxX < box.minX || box.maxY < box.minY || box.maxX >= width || box.maxY >= height) return null;
    const pixels = [];
    for (let y = box.minY; y <= box.maxY; y += 1) for (let x = box.minX; x <= box.maxX; x += 1) {
      const pixel = y * width + x;
      if (used.has(pixel)) return null;
      used.add(pixel); pixels.push(pixel);
    }
    const maskWidth = box.maxX - box.minX + 1; const maskHeight = box.maxY - box.minY + 1;
    regions.push({ minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY, centerX: (box.minX + box.maxX) / 2, centerY: (box.minY + box.maxY) / 2, count: pixels.length, maskWidth, maskHeight, mask: new Uint8Array(maskWidth * maskHeight).fill(1), pixels: Uint32Array.from(pixels), hitTolerance: 0 });
  }
  return regions;
}

export function publishedPuzzleRows(posts, puzzles) {
  const publicIds = new Set((Array.isArray(posts) ? posts : []).filter((post) => post?.status === 'published' && post.post_kind === 'pixfind' && post.distribution_mode === 'pixfind' && typeof post.pixfind_puzzle_id === 'string').map((post) => post.pixfind_puzzle_id));
  return (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => publicIds.has(puzzle?.id) && typeof puzzle?.id === 'string' && typeof puzzle?.slug === 'string');
}

export function safePuzzleImageUrl(value, supabaseUrl = supabaseConfig.url) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value, `${supabaseUrl.replace(/\/$/, '')}/`);
    const project = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.origin !== project.origin || url.username || url.password || url.search || url.hash) return null;
    const prefix = '/storage/v1/object/public/';
    if (!url.pathname.startsWith(prefix)) return null;
    const [bucket, ...path] = url.pathname.slice(prefix.length).split('/');
    if (!BUCKETS.has(bucket) || path.length !== 3 || path[0] !== 'puzzles' || !/^[a-zA-Z0-9_-]{1,128}$/.test(path[1]) || !/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(path[2])) return null;
    return url.href;
  } catch { return null; }
}

function requestUrl(table, query) { return `${supabaseConfig.url.replace(/\/$/, '')}/rest/v1/${table}?${query}`; }
async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }

/** Sharing is available only for loaded public puzzles of this page's game. */
export function isPublicPuzzleShareable(puzzle, pageMode) {
  return Boolean(puzzle && puzzle.mode === pageMode && !puzzle.localOnly && !puzzle.localHiddenOnly
    && ((puzzle.publicPostOnly === true && typeof puzzle.id === 'string' && UUID.test(puzzle.id))
      || (puzzle.publicLegacyOnly === true && isLegacyPuzzleShareId(puzzle.mode, puzzle.id))));
}

function safePuzzle(row) {
  const originalUrl = safePuzzleImageUrl(row.original_url);
  const changedUrl = safePuzzleImageUrl(row.diff_url);
  const thumbnailUrl = safePuzzleImageUrl(row.thumbnail_url) || originalUrl;
  if (!originalUrl || !changedUrl || !row.id || !row.slug) return null;
  const mode = [row.mode, row.game_mode, row.play_mode].includes('hidden-object') ? 'hidden-object' : 'spot-difference';
  return Object.freeze({ id: row.id, slug: row.slug, label: typeof row.label === 'string' ? row.label.slice(0, 160) : MODE_NAMES[mode], author: typeof row.author_name === 'string' ? row.author_name.slice(0, 120) : '作者不明', originalUrl, changedUrl, thumbnailUrl, mode, publicLegacyOnly: isLegacyPuzzleShareId(mode, row.id), targets: Array.isArray(row.targets) ? row.targets : [], storedRegions: Array.isArray(row.regions) ? row.regions : null });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image(); if (/^https?:/i.test(url)) image.crossOrigin = 'anonymous'; image.decoding = 'async';
    image.onload = () => resolve(image); image.onerror = () => reject(new Error('画像を読み込めません。公開画像の設定を確認してください。'));
    image.src = url;
  });
}

function imageData(image) {
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) throw new Error('画像の画素を読み取れません。');
  context.drawImage(image, 0, 0);
  try { return context.getImageData(0, 0, canvas.width, canvas.height); }
  catch { throw new Error('画像を安全に解析できません。公開画像のCORS設定が必要です。'); }
}

function localDocumentObjectUrl(documentData) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas'); canvas.width = documentData.width; canvas.height = documentData.height;
    const context = canvas.getContext('2d');
    if (!context) { reject(new Error('端末内画像を準備できません')); return; }
    context.putImageData(new ImageData(new Uint8ClampedArray(documentRgba(documentData)), documentData.width, documentData.height), 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('端末内画像を準備できません')); return; }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

function mount() {
  const status = document.querySelector('#pixfind-status'); const list = document.querySelector('#pixfind-list');
  const game = document.querySelector('#pixfind-game'); const primary = document.querySelector('#pixfind-primary');
  if (!status || !list || !game || !primary) return;
  const sharePanel = document.querySelector('#puzzle-share');
  const shareButton = document.querySelector('#puzzle-share-copy');
  const shareStatus = document.querySelector('#puzzle-share-status');
  const shareInput = document.querySelector('#puzzle-share-url');
  if (shareButton) {
    shareButton.setAttribute('aria-label', '共有URLをコピー'); shareButton.title = '共有URLをコピー';
    shareButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';
  }
  mountToolHeaderControls(document, { selectors: ['#pixfind-back', '#puzzle-share-copy', '#pixfind-hint'] });
  document.querySelector('.px-tool-header-controls')?.setAttribute('aria-label', 'ゲームの操作');
  let shareRequest = 0;
  let puzzles = []; let selected = null; let regions = []; let found = new Set(); let original = null; let changed = null; let currentMask = null; let cursorX = NaN; let cursorY = NaN; let readOnly = false; let authoritativeAnswers = false; let answerInstruction = ''; let localRoute = false; let postPuzzleRoute = false;
  let resultRun = 0; let resultShownRun = -1; let resultTimer = 0; let feedbackTimer = 0; let feedbackToken = 0;
  const resultListHref = puzzleResultListHref(document.body.dataset.puzzleMode);
  const resultView = createToolResultView({ key: document.body.dataset.puzzleMode === 'hidden-object' ? 'find-result' : 'spot-result', main: document.querySelector('#main'),
    returnLabel: '問題一覧に戻る', returnHref: resultListHref, onReturn: () => window.location.assign(resultListHref) });
  const cancelResult = (newRun = false) => { window.clearTimeout(resultTimer); resultTimer = 0; if (newRun) resultRun += 1; resultView.close(); };
  const clearTapFeedback = () => {
    feedbackToken += 1; window.clearTimeout(feedbackTimer); feedbackTimer = 0;
    statusGame.removeAttribute('data-visible'); statusGame.removeAttribute('data-feedback');
    for (const area of [playArea, changedArea].filter(Boolean)) { area.removeAttribute('data-feedback'); area.style.removeProperty('--pixfind-feedback-x'); area.style.removeProperty('--pixfind-feedback-y'); }
  };
  const showTapFeedback = (kind, message, area, clientX, clientY, duration = 1450) => {
    clearTapFeedback(); const token = feedbackToken;
    statusGame.dataset.visible = 'true'; statusGame.dataset.feedback = kind; statusGame.textContent = message;
    const rect = area.getBoundingClientRect(); area.dataset.feedback = kind;
    area.style.setProperty('--pixfind-feedback-x', `${clientX - rect.left}px`); area.style.setProperty('--pixfind-feedback-y', `${clientY - rect.top}px`);
    feedbackTimer = window.setTimeout(() => {
      if (token !== feedbackToken) return;
      statusGame.removeAttribute('data-visible'); statusGame.removeAttribute('data-feedback');
      area.removeAttribute('data-feedback'); area.style.removeProperty('--pixfind-feedback-x'); area.style.removeProperty('--pixfind-feedback-y');
      feedbackTimer = 0;
    }, duration);
  };
  const localObjectUrls = new Set();
  const pageMode = PUZZLE_PLAY_PATHS[document.body.dataset.puzzleMode] ? document.body.dataset.puzzleMode : null;
  const originalNode = document.querySelector('#pixfind-original'); const changedNode = document.querySelector('#pixfind-changed'); const compareButton = document.querySelector('#pixfind-compare');
  const localNotice = document.querySelector('#pixfind-local-only');
  const playArea = document.querySelector('#pixfind-play-area'); const overlay = document.querySelector('#pixfind-overlay');
  const changedArea = document.querySelector('#pixfind-changed-area'); const changedOverlay = document.querySelector('#pixfind-changed-overlay'); const changedFigure = document.querySelector('#pixfind-changed-figure');
  const statusGame = document.querySelector('#pixfind-game-status'); const progress = document.querySelector('#pixfind-progress');
  const foundList = document.querySelector('#pixfind-found-list');
  let cell = 1;
  let levelTracker = null;
  let viewport = { zoom: 1, x: 0, y: 0 }; let baseScale = 1;
  const activePointers = new Map();
  const viewportAreas = () => [playArea, ...(changedArea && changedFigure && !changedFigure.hidden ? [changedArea] : [])].filter((area) => area && !area.hidden).map((area) => ({ width: area.clientWidth, height: area.clientHeight }));
  // The art is shown at a whole number of device pixels per dot, as large as the play area allows.
  const geometry = (area = playArea) => {
    return pixfindViewportGeometry({ width: original.naturalWidth, height: original.naturalHeight, areaWidth: area.clientWidth, areaHeight: area.clientHeight, baseScale, viewport });
  };
  const placeImages = () => {
    if (!original) return;
    for (const [node, area] of [[originalNode, playArea], [changedNode, changedArea || playArea]]) {
      const g = geometry(area);
      Object.assign(node.style, { left: `${g.xoff}px`, top: `${g.yoff}px`, width: `${g.width}px`, height: `${g.height}px` });
    }
  };
  const paint = () => {
    placeImages();
    if (!original) return;
    const sourceW = original.naturalWidth; const sourceH = original.naturalHeight;
    let maskCanvas = null;
    if (found.size && currentMask) {
      maskCanvas = document.createElement('canvas'); maskCanvas.width = sourceW; maskCanvas.height = sourceH;
      const maskContext = maskCanvas.getContext('2d'); const pixels = maskContext.createImageData(sourceW, sourceH);
      for (const index of found) for (const pixel of regions[index].pixels) { const p = pixel * 4; pixels.data[p] = 255; pixels.data[p + 1] = 194; pixels.data[p + 2] = 55; pixels.data[p + 3] = 150; }
      maskContext.putImageData(pixels, 0, 0);
    }
    for (const [area, targetOverlay] of [[playArea, overlay], [changedArea, changedOverlay]]) {
      if (!area || !targetOverlay || !area.clientWidth || !area.clientHeight) continue;
      const w = area.clientWidth; const h = area.clientHeight; const ratio = devicePixelRatio || 1;
      targetOverlay.width = Math.max(1, Math.round(w * ratio)); targetOverlay.height = Math.max(1, Math.round(h * ratio));
      const context = targetOverlay.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, w, h);
      if (!currentMask) continue;
      const { scale, xoff, yoff } = geometry(area);
      context.imageSmoothingEnabled = false;
      if (maskCanvas) context.drawImage(maskCanvas, xoff, yoff, sourceW * scale, sourceH * scale);
      for (const index of found) { const region = regions[index]; context.strokeStyle = '#146c43'; context.lineWidth = Math.max(2, 3 / scale); context.strokeRect(xoff + region.minX * scale, yoff + region.minY * scale, Math.max(3, (region.maxX - region.minX + 1) * scale), Math.max(3, (region.maxY - region.minY + 1) * scale)); }
      if (hint && performance.now() < hint.until && !found.has(hint.index)) {
        const region = regions[hint.index]; const t = (hint.until - performance.now()) / HINT_MS;
        const cx = xoff + (region.minX + region.maxX + 1) / 2 * scale; const cy = yoff + (region.minY + region.maxY + 1) / 2 * scale;
        const r = Math.max((Math.max(region.maxX - region.minX, region.maxY - region.minY) + 1) * scale, Math.min(sourceW, sourceH) * scale * 0.2) * (1 + 0.08 * Math.sin(t * 18));
        context.lineWidth = 4; context.strokeStyle = `rgba(255, 211, 90, ${Math.min(1, t * 2.5)})`; context.setLineDash([6, 5]);
        context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
      }
      if (Number.isFinite(cursorX) && Number.isFinite(cursorY)) { const cx = xoff + cursorX * scale; const cy = yoff + cursorY * scale; context.strokeStyle = '#3159a5'; context.lineWidth = 2; context.beginPath(); context.moveTo(cx - 7, cy); context.lineTo(cx + 7, cy); context.moveTo(cx, cy - 7); context.lineTo(cx, cy + 7); context.stroke(); }
    }
  };
  // ---- hints never require an ad; concurrent taps and stale puzzles are guarded ----
  const HINT_MS = 2600; let hint = null; const hintButton = document.querySelector('#pixfind-hint');
  let hintFrame = 0; let hintTimer = 0;
  const reduceHintMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const stopHintMotion = () => { if (hintFrame) cancelAnimationFrame(hintFrame); hintFrame = 0; window.clearTimeout(hintTimer); hintTimer = 0; };
  const hintController = createPuzzleHintController({ storage: null, onState: ({ pending, freeUsed }) => {
    if (!hintButton) return;
    hintButton.disabled = pending;
    hintButton.setAttribute('aria-label', 'ヒント：未発見の場所を一時表示');
    hintButton.setAttribute('aria-busy', String(pending));
    hintButton.dataset.used = String(freeUsed);
    hintButton.title = '未発見の場所を一時表示（正解には数えません）';
  } });
  const syncHint = () => { if (hintButton) hintButton.hidden = readOnly || !regions.length || found.size >= regions.length; };
  const animateHint = () => {
    hintFrame = 0; paint();
    if (hint && performance.now() >= hint.until) { hint = null; window.clearTimeout(hintTimer); hintTimer = 0; paint(); }
    else if (hint && !document.hidden && !reduceHintMotion()) hintFrame = requestAnimationFrame(animateHint);
  };
  hintButton?.addEventListener('click', async () => {
    await hintController.request(() => {
      const left = regions.map((_, index) => index).filter((index) => !found.has(index));
      if (!left.length || readOnly) return false;
      stopHintMotion();
      hint = { index: left[Math.floor(Math.random() * left.length)], until: performance.now() + HINT_MS };
      statusGame.textContent = 'このあたりをよく見てみよう';
      hintTimer = window.setTimeout(() => { hint = null; hintTimer = 0; if (hintFrame) cancelAnimationFrame(hintFrame); hintFrame = 0; if (!document.hidden) paint(); }, HINT_MS);
      paint(); if (!document.hidden && !reduceHintMotion()) hintFrame = requestAnimationFrame(animateHint);
      return true;
    });
  });
  const updateProgress = () => {
    syncHint();
    progress.textContent = `見つけた場所 ${found.size} / ${regions.length}`;
    foundList.replaceChildren(...regions.map((_, index) => {
      const target = selected?.targets?.[index];
      const targetLabel = typeof target === 'string' ? target : target && typeof target === 'object' ? (target.label || target.name || target.title) : null;
      const label = selected?.mode === 'hidden-object' ? (typeof targetLabel === 'string' && targetLabel.trim() ? targetLabel.trim().slice(0, 100) : `見つけたもの ${index + 1}`) : `変化 ${index + 1}`;
      const item = el('li', found.has(index) ? 'pixfind-target--found' : '', label);
      item.title = label;
      item.setAttribute('aria-label', `${label}：${found.has(index) ? '発見済み' : '未発見'}`);
      return item;
    }));
    const complete = found.size === regions.length && regions.length > 0 && !readOnly && original && selected;
    if (complete) {
      levelTracker.end({ success: authoritativeAnswers === true, completion_kind: authoritativeAnswers ? 'solved' : 'candidates_reviewed' });
      statusGame.textContent = authoritativeAnswers ? '全部見つかりました。おめでとうございます！' : '自動検出の候補をすべて確認しました。';
      if (resultShownRun !== resultRun && !resultTimer) {
        const scheduledRun = resultRun; const scheduledPuzzle = selected;
        resultTimer = window.setTimeout(() => {
          resultTimer = 0;
          if (scheduledRun !== resultRun || selected !== scheduledPuzzle || game.hidden || !original || readOnly || !regions.length || found.size !== regions.length || resultShownRun === scheduledRun) return;
          resultShownRun = scheduledRun;
          const title = authoritativeAnswers ? 'すべて見つけました' : '候補をすべて確認しました';
          resultView.show({ title, detail: `${selected.label} · ${found.size} / ${regions.length}件`, preview: originalNode,
            controls: isPublicPuzzleShareable(selected, pageMode) ? sharePanel : undefined,
            actions: isPublicPuzzleShareable(selected, pageMode) ? [{ label: '共有する', onClick: () => sharePuzzle(true) }] : [] });
        }, 350);
      }
    }
    paint();
  };
  const start = async (puzzle) => {
    levelTracker?.reset();
    levelTracker = createLevelTracker(puzzle?.mode === 'hidden-object' ? 'hidden_object' : 'spot_difference');
    shareRequest += 1;
    if (sharePanel) sharePanel.hidden = true;
    if (shareButton) { shareButton.disabled = false; shareButton.title = '共有URLをコピー'; }
    if (shareStatus) shareStatus.textContent = '';
    if (shareInput) { shareInput.hidden = true; shareInput.value = ''; }
    cancelResult(true); resultShownRun = -1;
    const loadRun = resultRun;
    game.dataset.puzzleRun = crypto.randomUUID();
    clearTapFeedback();
    // Each game shows only its own kind; a link to the other kind moves to that game.
    if (pageMode && puzzle.mode !== pageMode) { window.location.replace(PUZZLE_PLAY_PATHS[puzzle.mode] + window.location.search + window.location.hash); return; }
    stopHintMotion();
    hint = null;
    const hintIdentity = puzzle.localOnly || puzzle.localHiddenOnly
      ? `local:${puzzle.mode || 'puzzle'}:${String(puzzle.id || 'draft')}:${String(puzzle.hintRevision || 'revision-unknown')}`
      : `public:${puzzle.mode || 'puzzle'}:${String(puzzle.id || puzzle.slug || 'puzzle')}`;
    hintController.setProblem(`pixfind:${hintIdentity}:run:${loadRun}`);
    selected = puzzle; found = new Set(); regions = []; cursorX = NaN; cursorY = NaN; viewport = { zoom: 1, x: 0, y: 0 }; activePointers.clear(); readOnly = false; authoritativeAnswers = false; answerInstruction = ''; primary.disabled = false; statusGame.dataset.visible = 'true'; statusGame.textContent = '絵を準備しています。';
    originalNode.hidden = false; changedNode.hidden = puzzle.mode === 'hidden-object';
    if (changedFigure) changedFigure.hidden = puzzle.mode !== 'spot-difference';
    if (compareButton) { compareButton.hidden = puzzle.mode === 'hidden-object' || Boolean(changedArea); compareButton.setAttribute('aria-pressed', 'false'); compareButton.textContent = '変化後を見る'; }
    document.querySelector('.pixfind-page').classList.add('pixfind-page--playing');
    document.body.classList.add('pixfind-is-playing');
    if (puzzle.localOnly || puzzle.localHiddenOnly) localRoute = true;
    else if (puzzle.publicPostOnly) postPuzzleRoute = true;
    else { const nextUrl = new URL(window.location.href); nextUrl.searchParams.delete('localSpot'); nextUrl.searchParams.set('puzzle', puzzle.id); nextUrl.hash = ''; history.replaceState(null, '', nextUrl); }
    game.hidden = false; list.hidden = true; document.querySelector('#pixfind-title').textContent = puzzle.label;
    progress.textContent = '準備中';
    document.querySelector('#pixfind-author').textContent = `作者：${puzzle.author}`;
    if (localNotice) localNotice.hidden = !(puzzle.localOnly || puzzle.localHiddenOnly);
    document.querySelector('#pixfind-image-label').textContent = puzzle.mode === 'hidden-object' ? '絵をタップして探す' : '元の絵';
    primary.innerHTML = '<span aria-hidden="true">↻</span>'; primary.setAttribute('aria-label', '最初から遊び直す');
    primary.className = 'pixfind-primary-ready';
    try {
      if (puzzle.localHiddenOnly || (puzzle.publicPostOnly && puzzle.mode === 'hidden-object')) {
        const nextOriginal = await loadImage(puzzle.originalUrl);
        if (selected !== puzzle || resultRun !== loadRun) return;
        original = nextOriginal; changed = null; originalNode.src = puzzle.originalUrl; changedNode.removeAttribute('src'); changedNode.hidden = true; if (compareButton) compareButton.hidden = true;
        if (original.naturalWidth !== puzzle.width || original.naturalHeight !== puzzle.height) throw new Error('元画像の保存版サイズが一致しません。');
      } else {
        const nextImages = await Promise.all([loadImage(puzzle.originalUrl), loadImage(puzzle.changedUrl)]);
        if (selected !== puzzle || resultRun !== loadRun) return;
        [original, changed] = nextImages;
        originalNode.src = puzzle.originalUrl; changedNode.src = puzzle.changedUrl;
        if (original.naturalWidth !== changed.naturalWidth || original.naturalHeight !== changed.naturalHeight) throw new Error('2枚の画像サイズが一致しないため、この問題は遊べません。');
      }
      const base = imageData(original); const layer = puzzle.localHiddenOnly || (puzzle.publicPostOnly && puzzle.mode === 'hidden-object') ? null : imageData(changed);
      // Older puzzles may be saved enlarged; count their dots, not their pixels, when sizing the view.
      cell = layer ? gcd(detectPixelScale(base), detectPixelScale(layer)) : detectPixelScale(base);
      playArea.style.aspectRatio = `${original.naturalWidth}/${original.naturalHeight}`;
      if (changedArea) changedArea.style.aspectRatio = playArea.style.aspectRatio;
      updateBaseScale();
      const metrics = viewportAreas();
      viewport = clampPixfindViewport(viewport, original.naturalWidth, original.naturalHeight, baseScale, metrics);
      placeImages();
      let result; let viewMessage = '';
      if (puzzle.localOnly) {
        result = computeDifferenceRegions(base, layer);
        const confirmed = validateLocalDifferenceGroups(puzzle.candidates, result);
        if (!confirmed) throw new Error('保存した正解候補が実際の差分と一致しません');
        regions = confirmed; authoritativeAnswers = true; answerInstruction = `作者が確認した${confirmed.length}箇所を探してください。`;
      } else if (puzzle.localHiddenOnly) {
        regions = puzzle.regions; authoritativeAnswers = true; answerInstruction = `作者が確認した${regions.length}個の対象を探してください。`;
        result = { width: puzzle.width, height: puzzle.height, mask: new Uint8Array(puzzle.width * puzzle.height) };
      } else if (puzzle.publicPostOnly && puzzle.mode === 'spot-difference') {
        if (original.naturalWidth !== puzzle.width || original.naturalHeight !== puzzle.height || changed.naturalWidth !== puzzle.width || changed.naturalHeight !== puzzle.height) throw new Error('公開画像の寸法が登録情報と一致しません。');
        result = computeDifferenceRegions(base, layer);
        const confirmed = validateLocalDifferenceGroups(puzzle.candidates, result);
        if (!confirmed) throw new Error('公開された正解候補を実画像から確認できませんでした。');
        regions = confirmed; authoritativeAnswers = true; answerInstruction = `作者が確認した${regions.length}箇所を探してください。`;
      } else if (puzzle.publicPostOnly && puzzle.mode === 'hidden-object') {
        if (original.naturalWidth !== puzzle.width || original.naturalHeight !== puzzle.height) throw new Error('公開画像の寸法が登録情報と一致しません。');
        regions = puzzle.regions; authoritativeAnswers = true; answerInstruction = `作者が確認した${regions.length}個の対象を探してください。`;
        result = { width: puzzle.width, height: puzzle.height, mask: new Uint8Array(puzzle.width * puzzle.height) };
      } else if (puzzle.mode === 'hidden-object') {
        result = computeHiddenObjectRegions(layer);
        const marked = validateHiddenObjectMarkers(puzzle.targets, result.width, result.height);
        if (marked) { regions = marked; authoritativeAnswers = true; answerInstruction = `作者指定の${marked.length}箇所を探してください。`; }
        else if (puzzle.targets.length && puzzle.targets.every((target) => typeof target === 'string') && puzzle.targets.length === result.regions.length) {
          // Legacy target strings were paired to detected components in sorted image order.
          regions = result.regions; authoritativeAnswers = true;
        } else { readOnly = true; viewMessage = '正解位置を画像から確認できないため、画像のみ表示しています。'; }
      } else {
        // The old published-player fallback used the creator's 4px merge rule
        // on 64px source images when no author-confirmed regions were saved.
        result = computeDifferenceRegions(base, layer, { mergeDistance: 4 });
        if (puzzle.storedRegions?.length) {
          const confirmed = validateStoredDifferenceRegions(puzzle.storedRegions, result);
          if (confirmed) { regions = confirmed; authoritativeAnswers = true; }
          else { readOnly = true; viewMessage = '保存された正解位置を画像から確認できないため、画像のみ表示しています。'; }
        } else { regions = result.regions; viewMessage = '正解位置の保存データがないため、自動検出した候補で遊べます。'; }
      }
      currentMask = result.mask;
      if (!readOnly && !regions.length) { readOnly = true; viewMessage = '正解位置を確認できないため、画像のみ表示しています。'; }
      if (readOnly) { primary.disabled = true; primary.setAttribute('aria-label', '正解位置未確認のためプレイできません'); progress.textContent = '閲覧のみ'; foundList.replaceChildren(); statusGame.textContent = viewMessage; }
      else { primary.setAttribute('aria-label', '最初から遊び直す'); statusGame.textContent = viewMessage || answerInstruction || (puzzle.mode === 'hidden-object' ? '絵をタップして、隠れているものを探してください。' : '変化している場所をタップしてください。'); if (!viewMessage) delete statusGame.dataset.visible; if (regions.length) levelTracker.start(); updateProgress(); }
      document.dispatchEvent(new CustomEvent('pixfind:run-start'));
      updateBaseScale(); constrainViewport(); paint();
      if (sharePanel) {
        sharePanel.hidden = !isPublicPuzzleShareable(puzzle, pageMode);
        if (!sharePanel.hidden) { updateBaseScale(); constrainViewport(); paint(); }
      }
    } catch (error) {
      if (selected !== puzzle || resultRun !== loadRun) return;
      statusGame.textContent = error.message || '問題を読み込めませんでした。'; primary.disabled = true;
      if (puzzle.publicPostOnly) {
        readOnly = true; regions = []; found.clear(); currentMask = null;
        progress.textContent = 'プレイできません'; foundList.replaceChildren();
      }
    }
  };
  const showList = () => {
    shareRequest += 1;
    if (sharePanel) sharePanel.hidden = true;
    cancelResult(true); resultShownRun = -1;
    clearTapFeedback();
    stopHintMotion();
    hint = null; hintController.setProblem('');
    if (localRoute || postPuzzleRoute) {
      for (const url of localObjectUrls) URL.revokeObjectURL(url);
      localObjectUrls.clear();
      window.location.assign(exitDestination(window.location, pageMode));
      return;
    }
    game.hidden = true; list.hidden = false; selected = null; document.querySelector('.pixfind-page').classList.remove('pixfind-page--playing'); document.body.classList.remove('pixfind-is-playing'); primary.innerHTML = '<span aria-hidden="true">▶</span>'; primary.setAttribute('aria-label', '一覧の先頭の問題を遊ぶ'); primary.className = ''; primary.disabled = false; const nextUrl = new URL(window.location.href); nextUrl.searchParams.delete('puzzle'); nextUrl.hash = ''; history.replaceState(null, '', nextUrl);
  };
  const renderList = () => {
    list.replaceChildren(...puzzles.map((puzzle) => {
      const article = el('article', 'pixfind-card'); const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', `${puzzle.label}、作者 ${puzzle.author}、遊ぶ`);
      const img = document.createElement('img'); img.src = puzzle.thumbnailUrl; img.alt = ''; img.loading = 'lazy'; img.crossOrigin = 'anonymous';
      const body = el('div', 'pixfind-card__body'); body.append(el('h2', '', puzzle.label), el('p', '', `作者：${puzzle.author}`)); button.append(img, body); button.addEventListener('click', () => start(puzzle)); article.append(button); return article;
    }));
  };
  primary.setAttribute('aria-label', '一覧の先頭の問題を遊ぶ');
  primary.addEventListener('click', () => { if (selected) start(selected); else if (puzzles.length) start(puzzles[0]); });
  const sharePuzzle = async (nativeShare = false) => {
    const puzzle = selected;
    if (!isPublicPuzzleShareable(puzzle, pageMode) || !sharePanel || shareButton.disabled) return;
    const request = ++shareRequest;
    shareButton.disabled = true;
    shareButton.title = '公開ページを確認しています…';
    shareStatus.textContent = '';
    shareInput.hidden = true;
    try {
      const url = await verifyPuzzleSharePage({ mode: puzzle.mode, postId: puzzle.id, origin: window.location.origin });
      if (request !== shareRequest || selected !== puzzle) return;
      shareInput.value = url;
      if (nativeShare && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: puzzle.label, url });
          trackSiteEvent('share', { method: 'native' });
          if (request === shareRequest && selected === puzzle) shareStatus.textContent = '共有しました。';
          return;
        } catch (error) { if (error?.name === 'AbortError') return; /* Other share failures fall back to URL copying. */ }
        if (request !== shareRequest || selected !== puzzle) return;
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(url);
        trackSiteEvent('link_copy', { method: 'clipboard' });
        if (request !== shareRequest || selected !== puzzle) return;
        shareStatus.textContent = '公開ページと共有画像を確認し、URLをコピーしました。';
        shareButton.title = 'もう一度コピー';
      } catch {
        if (request !== shareRequest || selected !== puzzle) return;
        shareInput.hidden = false;
        shareInput.focus(); shareInput.select();
        shareStatus.textContent = 'コピーできませんでした。選択したURLをコピーするか、もう一度お試しください。';
        shareButton.title = 'もう一度コピー';
      }
    } catch (error) {
      if (request !== shareRequest || selected !== puzzle) return;
      shareStatus.textContent = error instanceof Error ? error.message : '共有ページを確認できません。時間をおいて再試行してください。';
      shareButton.title = '再試行';
    } finally {
      if (request === shareRequest) shareButton.disabled = false;
    }
  };
  shareButton?.addEventListener('click', () => sharePuzzle());
  document.querySelector('#pixfind-back').addEventListener('click', showList);
  compareButton?.addEventListener('click', () => {
    const showingChanged = compareButton.getAttribute('aria-pressed') !== 'true';
    originalNode.hidden = showingChanged; changedNode.hidden = !showingChanged;
    compareButton.setAttribute('aria-pressed', String(showingChanged));
    compareButton.textContent = showingChanged ? '元の絵を見る' : '変化後を見る';
    paint();
  });
  const markAt = (x, y, area, clientX, clientY, pointerType = 'mouse') => {
    if (!original || !regions.length || readOnly) return;
    let selection;
    if (selected.mode === 'spot-difference') {
      selection = selectPixfindHit(regions, x, y, { width: original.naturalWidth, height: original.naturalHeight, scale: geometry(area).scale, pointerType, found });
    } else {
      if (x < 0 || y < 0 || x >= original.naturalWidth || y >= original.naturalHeight) return;
      const hit = regions.findIndex((region) => regionContainsPoint(region, x, y, region.hitTolerance ?? 2));
      selection = hit < 0 ? { type: 'miss', index: -1 } : found.has(hit) ? { type: 'found', index: hit } : { type: 'hit', index: hit };
    }
    if (selection.type === 'outside' || selection.type === 'found') return;
    if (selection.type !== 'hit') {
      showTapFeedback('miss', 'ここではありません。少し場所を変えてみて。', area, clientX, clientY);
      paint(); return;
    }
    found.add(selection.index); updateProgress();
    const complete = found.size === regions.length;
    showTapFeedback('correct', complete ? statusGame.textContent : '見つけました！', area, clientX, clientY, complete ? 1900 : 1450);
  };
  const locate = (clientX, clientY, area = playArea, pointerType = 'mouse') => {
    if (!original || !regions.length || readOnly) return;
    const rect = area.getBoundingClientRect();
    const point = mapPixfindPoint(clientX, clientY, rect, geometry(area));
    cursorX = NaN; cursorY = NaN;
    markAt(point.x, point.y, area, clientX, clientY, pointerType);
  };
  const constrainViewport = () => { viewport = clampPixfindViewport(viewport, original.naturalWidth, original.naturalHeight, baseScale, viewportAreas()); };
  const viewportInteractionEnabled = () => Boolean(original && selected && ['spot-difference', 'hidden-object'].includes(selected.mode));
  const updateBaseScale = () => {
    const metrics = viewportAreas();
    if (!metrics.length || !metrics.every(({ width, height }) => width > 0 && height > 0)) return;
    const fitWidth = Math.min(...metrics.map(({ width }) => width)); const fitHeight = Math.min(...metrics.map(({ height }) => height));
    const fit = wholePixelFit(original.naturalWidth / cell, original.naturalHeight / cell, fitWidth, fitHeight, { devicePixelRatio: devicePixelRatio || 1 });
    baseScale = fit.width / original.naturalWidth;
  };
  const observedAreaSizes = new WeakMap();
  const imageLayout = game.querySelector('.pixfind-images');
  let areaResizeFrame = 0;
  const areaResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const area = entry.target; const next = { width: entry.contentRect.width, height: entry.contentRect.height }; const previous = observedAreaSizes.get(area);
      observedAreaSizes.set(area, next);
      if (previous && (Math.abs(previous.width - next.width) > 0.5 || Math.abs(previous.height - next.height) > 0.5)) changed = true;
    }
    if (changed && original && !areaResizeFrame) areaResizeFrame = requestAnimationFrame(() => {
      areaResizeFrame = 0;
      if (!original || game.hidden || document.body.dataset.toolResultOpen) return;
      updateBaseScale(); constrainViewport(); paint();
    });
  }) : null;
  if (imageLayout) areaResizeObserver?.observe(imageLayout);
  const pointerDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let pinch = null;
  for (const area of [playArea, changedArea].filter(Boolean)) {
    area.addEventListener('wheel', (event) => {
      if (!viewportInteractionEnabled()) return;
      event.preventDefault(); const rect = area.getBoundingClientRect(); const factor = pixfindWheelZoomFactor(event.deltaY, event.deltaMode, area.clientHeight);
      viewport = zoomPixfindViewport(viewport, factor, event.clientX - rect.left, event.clientY - rect.top, area.clientWidth / 2, area.clientHeight / 2, baseScale);
      constrainViewport(); paint();
    }, { passive: false });
    area.addEventListener('pointerdown', (event) => {
      if (event.button > 0) return;
      event.preventDefault(); area.setPointerCapture?.(event.pointerId);
      activePointers.set(event.pointerId, { area, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false });
      if (activePointers.size === 2 && viewportInteractionEnabled()) {
        const [a, b] = [...activePointers.values()];
        if (a.area !== b.area) return;
        const rect = area.getBoundingClientRect();
        pinch = { ids: [...activePointers.keys()], distance: Math.max(1, pointerDistance(a, b)), viewport: { ...viewport }, area,
          startX: (a.x + b.x) / 2 - rect.left, startY: (a.y + b.y) / 2 - rect.top };
        for (const state of activePointers.values()) state.moved = true;
      }
    });
    area.addEventListener('pointermove', (event) => {
      const state = activePointers.get(event.pointerId); if (!state) return;
      state.x = event.clientX; state.y = event.clientY;
      if (pinch && pinch.ids.every((id) => activePointers.has(id))) {
        const [a, b] = pinch.ids.map((id) => activePointers.get(id)); const rect = pinch.area.getBoundingClientRect();
        const midpointX = (a.x + b.x) / 2 - rect.left; const midpointY = (a.y + b.y) / 2 - rect.top;
        viewport = pinchPixfindViewport(pinch.viewport, pointerDistance(a, b) / pinch.distance,
          pinch.startX, pinch.startY, midpointX, midpointY, pinch.area.clientWidth / 2, pinch.area.clientHeight / 2, baseScale);
        constrainViewport(); paint(); return;
      }
      const canPan = viewportInteractionEnabled();
      if (canPan && Math.hypot(state.x - state.startX, state.y - state.startY) > 6) state.moved = true;
      if (canPan && state.moved) {
        viewport.x += state.x - (state.lastX ?? state.startX); viewport.y += state.y - (state.lastY ?? state.startY);
        state.lastX = state.x; state.lastY = state.y; constrainViewport(); paint();
      }
    });
    const finishPointer = (event, canceled = false) => {
      const state = activePointers.get(event.pointerId); if (!state) return;
      const wasPinching = Boolean(pinch); activePointers.delete(event.pointerId);
      if (pinch && pinch.ids.includes(event.pointerId)) pinch = null;
      if (!canceled && !state.moved && !wasPinching) locate(event.clientX, event.clientY, state.area, event.pointerType);
      if (wasPinching) for (const remaining of activePointers.values()) {
        remaining.moved = true; remaining.lastX = remaining.x; remaining.lastY = remaining.y;
      }
    };
    area.addEventListener('pointerup', (event) => finishPointer(event));
    area.addEventListener('pointercancel', (event) => finishPointer(event, true));
    area.addEventListener('lostpointercapture', (event) => finishPointer(event, true));
  }
  for (const area of [playArea, changedArea].filter(Boolean)) area.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key) && original) {
      event.preventDefault(); const step = Math.max(1, Math.round(Math.min(original.naturalWidth, original.naturalHeight) / 24));
      if (!Number.isFinite(cursorX)) { cursorX = Math.floor(original.naturalWidth / 2); cursorY = Math.floor(original.naturalHeight / 2); }
      if (event.key === 'ArrowLeft') cursorX = Math.max(0, cursorX - step); if (event.key === 'ArrowRight') cursorX = Math.min(original.naturalWidth - 1, cursorX + step);
      if (event.key === 'ArrowUp') cursorY = Math.max(0, cursorY - step); if (event.key === 'ArrowDown') cursorY = Math.min(original.naturalHeight - 1, cursorY + step);
      paint(); statusGame.textContent = '矢印キーで場所を選び、Enter または Space で調べます。';
    } else if ((event.key === 'Enter' || event.key === ' ') && original && Number.isFinite(cursorX)) {
      event.preventDefault(); const rect = area.getBoundingClientRect(); const g = geometry(area);
      markAt(cursorX, cursorY, area, rect.left + g.xoff + (cursorX + 0.5) * g.scale, rect.top + g.yoff + (cursorY + 0.5) * g.scale, 'keyboard');
    }
  });
  window.addEventListener('resize', () => { if (!original) return; updateBaseScale(); constrainViewport(); paint(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (hintFrame) cancelAnimationFrame(hintFrame); hintFrame = 0; }
    else if (hint) animateHint();
    else paint();
  });
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => {
    if (event.matches) { if (hintFrame) cancelAnimationFrame(hintFrame); hintFrame = 0; paint(); }
    else if (hint && !document.hidden && !hintFrame) hintFrame = requestAnimationFrame(animateHint);
  });
  window.addEventListener('pagehide', (event) => {
    shareRequest += 1; cancelResult(true); clearTapFeedback(); areaResizeObserver?.disconnect(); stopHintMotion();
    if (areaResizeFrame) cancelAnimationFrame(areaResizeFrame); areaResizeFrame = 0;
    if (!event.persisted) { for (const url of localObjectUrls) URL.revokeObjectURL(url); localObjectUrls.clear(); }
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    if (imageLayout) areaResizeObserver?.observe(imageLayout);
    if (selected && !game.hidden) void start(selected);
  });
  window.addEventListener('popstate', () => {
    const puzzle = resolvePuzzleFromLocation(window.location, puzzles);
    if (puzzle) void start(puzzle);
    else if (selected && (localRoute || postPuzzleRoute)) void start(selected);
    else showList();
  });
  (async () => {
    const query = new URLSearchParams(window.location.search || ''); const hasPostPuzzle = query.has('postPuzzle'); const publicPostId = resolvePostPuzzleId(window.location);
    if (hasPostPuzzle) {
      postPuzzleRoute = true; list.hidden = true; game.hidden = false; primary.disabled = true;
      document.querySelector('#pixfind-title').textContent = '公開された問題';
      document.querySelector('#pixfind-author').textContent = '';
      progress.textContent = '読み込み中'; status.textContent = '公開問題を確認しています。';
      if (publicPostId === null || query.has('localSpot') || query.has('localHidden')) {
        status.textContent = '問題の指定が正しくありません。世界地図の投稿から開き直してください。'; statusGame.textContent = status.textContent; progress.textContent = 'プレイできません'; return;
      }
      try { const puzzle = await fetchPublicPostPuzzle(publicPostId); await start(puzzle); }
      catch (error) { status.textContent = error instanceof Error ? error.message : '公開問題を読み込めませんでした。'; statusGame.textContent = status.textContent; progress.textContent = 'プレイできません'; primary.disabled = true; }
      return;
    }
    const spotId = resolveLocalSpotDraftId(window.location); const hiddenId = resolveLocalHiddenDraftId(window.location);
    const localMode = spotId !== undefined && hiddenId === undefined ? 'spot-difference' : hiddenId !== undefined && spotId === undefined ? 'hidden-object' : null;
    if (pageMode && localMode && localMode !== pageMode) { window.location.replace(PUZZLE_PLAY_PATHS[localMode] + window.location.search); return; }
    if (spotId !== undefined || hiddenId !== undefined) {
      localRoute = true;
      list.hidden = true; game.hidden = false;
      if (localNotice) localNotice.hidden = false;
      document.querySelector('#pixfind-title').textContent = '端末内の試遊';
      document.querySelector('#pixfind-author').textContent = '公開されていない下書き';
      progress.textContent = '試遊準備中'; primary.disabled = true;
      if (spotId === null || hiddenId === null || (spotId !== undefined && hiddenId !== undefined)) {
        status.textContent = 'この端末内の試遊IDを確認できません。下書き作成画面からもう一度開いてください。';
        statusGame.textContent = status.textContent;
        progress.textContent = '試遊できません';
        return;
      }
      status.textContent = 'この端末の確認済み下書きを読み込んでいます。';
      try {
        const gameAdapter = createIndexedDbDraftAdapter(); const drawAdapter = createIndexedDbDraftAdapter();
        if (hiddenId !== undefined) {
          const local = await loadLocalHiddenDraft(gameAdapter, drawAdapter, hiddenId);
          const originalUrl = await localDocumentObjectUrl(local.sourceDocument); localObjectUrls.add(originalUrl);
          await start({ id: local.id, hintRevision: local.revisionId, slug: null, label: '端末内のもの探し', author: '端末内の下書き', mode: 'hidden-object', originalUrl, thumbnailUrl: originalUrl, localHiddenOnly: true, width: local.draft.width, height: local.draft.height, targets: local.draft.targets, regions: local.regions });
        } else {
          const local = await loadLocalSpotDraft(gameAdapter, drawAdapter, spotId);
          const originalUrl = await localDocumentObjectUrl(local.beforeDocument); localObjectUrls.add(originalUrl);
          const changedUrl = await localDocumentObjectUrl(local.afterDocument); localObjectUrls.add(changedUrl);
          await start({ id: local.id, hintRevision: local.revisionId, slug: null, label: '端末内の間違い探し', author: '端末内の下書き', mode: 'spot-difference', originalUrl, changedUrl, thumbnailUrl: originalUrl, localOnly: true, candidates: local.draft.candidates });
        }
      } catch (error) {
        status.textContent = `この端末では試遊できません：${error instanceof Error ? error.message : '下書きを確認できません'}`;
        statusGame.textContent = status.textContent; progress.textContent = '試遊できません'; primary.disabled = true;
      }
      return;
    }
    try {
      const [posts, puzzleRows] = await Promise.all([
        getJson(requestUrl('social_posts', `select=${encodeURIComponent(SELECT.posts)}&status=eq.published&post_kind=eq.pixfind&distribution_mode=eq.pixfind&order=id.asc`)),
        getJson(requestUrl('pixfind_puzzles', `select=${encodeURIComponent(SELECT.puzzles)}&order=id.asc`)),
      ]);
      const everyPuzzle = publishedPuzzleRows(posts, puzzleRows).map(safePuzzle).filter(Boolean);
      puzzles = pageMode ? everyPuzzle.filter((puzzle) => puzzle.mode === pageMode) : everyPuzzle;
      renderList(); status.textContent = puzzles.length ? `${puzzles.length}件の問題から遊べます。` : '遊べる問題はまだありません。';
      const requested = resolvePuzzleFromLocation(window.location, everyPuzzle);
      if (requested) await start(requested);
      else if (window.location.search.includes('puzzle=') || window.location.hash.startsWith('#puzzle=')) status.textContent = '指定された問題は見つかりませんでした。下の一覧から問題を選んでください。';
    } catch { status.textContent = '公開問題を読み込めませんでした。通信状態を確認して、再読み込みしてください。'; }
  })();
}

if (typeof document !== 'undefined') mount();
