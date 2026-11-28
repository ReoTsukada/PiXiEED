import { isLegacyPuzzleShareId, legacyPuzzleImageUrl } from '../creation/puzzle-share-identity.mjs?rev=20261004-legacy-puzzle-share-1';
import { assertPublicPuzzleIntent } from './puzzle-audience.mjs?rev=20261021-jigsaw-public-1';
import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CELL_ID = /^globe:v11-meridian-parallel-quarter-degree:(0|[1-9]\d{0,2}):(0|[1-9]\d{0,3})$/;
const OPTIONAL_MAP_COLUMNS = ['post_kind', 'puzzle_mode', 'author_name'];
const MAX_LIST_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 12_000;
const SNS_ACTIONS_REV = '20261024-posting-policy-1';

export class SocialApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'SocialApiError';
    this.code = code;
    this.status = status;
  }
}

function project(config) {
  let url;
  try { url = new URL(String(config?.url || '')); }
  catch { throw new SocialApiError('not_configured', '投稿フィードの接続設定を確認できません。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new SocialApiError('not_configured', '投稿フィードの接続設定を確認できません。');
  }
  const key = String(config?.publishableKey || '').trim();
  const table = String(config?.publicMapTable || 'post_map_points');
  const bucket = String(config?.publicStorageBucket || 'post-public');
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !/^[A-Za-z0-9_-]{1,100}$/.test(bucket)) {
    throw new SocialApiError('not_configured', '投稿フィードの接続設定を確認できません。');
  }
  return { origin: url.origin, key, table, bucket };
}

function uuid(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : '';
}

function parseReference(value) {
  if (typeof value !== 'string') return null;
  const match = /^(map|showcase):([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(value);
  return match ? { source: match[1].toLowerCase(), uuid: match[2].toLowerCase(), id: `${match[1].toLowerCase()}:${match[2].toLowerCase()}` } : null;
}

function safePublicImage(origin, bucket, path) {
  if (typeof path !== 'string' || !path || path.length > 512 || path.startsWith('/') || /[?#%\\\u0000-\u001f\u007f]/.test(path)) return '';
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) return '';
  const url = new URL(`/storage/v1/object/public/${encodeURIComponent(bucket)}/${parts.map(encodeURIComponent).join('/')}`, origin);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(`/storage/v1/object/public/${encodeURIComponent(bucket)}/`)) return '';
  return url.href;
}

function cleanText(value, { max, fallback = '', required = false } = {}) {
  if (typeof value !== 'string') return required ? null : fallback;
  const text = value.normalize('NFC').trim();
  if (text.length > max || required && !text) return null;
  return text;
}

function cellId(value) {
  if (typeof value !== 'string') return false;
  const match = CELL_ID.exec(value);
  return Boolean(match && Number(match[1]) <= 719 && Number(match[2]) <= 2879);
}

function dateValue(value) {
  const result = Date.parse(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function mapPost(row, config) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = uuid(row.post_id);
  const title = cleanText(row.title, { max: 60, required: true });
  const caption = cleanText(row.caption, { max: 180 });
  const createdAt = dateValue(row.published_at);
  const image = safePublicImage(config.origin, config.bucket, row.public_image_path);
  if (!id || row.map_space !== 'globe' || !title || caption === null || !createdAt || !cellId(row.globe_cell_id)) return null;
  if (row.post_kind != null && !['pixel_art', 'pixel_camera'].includes(row.post_kind)) return null;
  if (row.puzzle_mode != null && !['spot_difference', 'hidden_object', 'jigsaw'].includes(row.puzzle_mode)) return null;
  const puzzleMode = ['spot_difference', 'hidden_object', 'jigsaw'].includes(row.puzzle_mode) ? row.puzzle_mode : null;
  const postKind = ['pixel_art', 'pixel_camera'].includes(row.post_kind) ? row.post_kind : 'pixel_art';
  if (!image) return null;
  const ref = `map:${id}`;
  const href = puzzleMode
    ? (puzzleMode === 'jigsaw' ? `/jigsaw/?postPuzzle=${encodeURIComponent(id)}` : `/play/${puzzleMode === 'hidden_object' ? 'hidden-object' : 'spot-difference'}/?postPuzzle=${encodeURIComponent(id)}`)
    : `/feed/?post=${encodeURIComponent(ref)}`;
  return Object.freeze({
    id: ref,
    postId: id,
    source: 'map',
    kind: puzzleMode ? 'puzzle' : postKind === 'pixel_camera' ? 'photo' : 'art',
    title,
    caption,
    author: Object.freeze({ name: cleanText(row.author_name, { max: 40 }) || '' }),
    createdAt,
    image: Object.freeze({ src: image }),
    ...(puzzleMode ? { puzzleMode } : {}),
    href,
    mapHref: `/globe/?art=${encodeURIComponent(id)}`,
    likeable: true
  });
}

function showcasePost(point, row, config) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = uuid(row.id);
  if (!id || row.status !== 'published' || row.post_kind !== 'image' || row.distribution_mode !== 'showcase') return null;
  const titleValue = cleanText(row.title, { max: 160 }) || cleanText(row.caption, { max: 180 });
  const title = titleValue || '公開作品';
  const caption = cleanText(row.caption, { max: 180 });
  const authorName = cleanText(row.creator_display_name, { max: 80 }) || '作者';
  const createdAt = dateValue(row.published_at);
  const image = safePublicImage(config.origin, 'social-posts', row.media_object_path);
  if (caption === null || !createdAt || !image) return null;
  const ref = `showcase:${id}`;
  return Object.freeze({
    id: ref,
    postId: id,
    source: 'showcase',
    kind: 'art',
    title,
    caption,
    author: Object.freeze({ name: authorName }),
    createdAt,
    image: Object.freeze({ src: image }),
    href: `/feed/?post=${encodeURIComponent(ref)}`,
    mapHref: point && uuid(point.social_post_id) === id && cellId(point.globe_cell_id)
      ? `/globe/?art=${encodeURIComponent(ref)}`
      : null,
    likeable: false
  });
}

function requestContext(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup() { clearTimeout(timer); signal?.removeEventListener('abort', abort); },
    get timedOut() { return timedOut; },
    get callerAborted() { return Boolean(signal?.aborted && !timedOut); }
  };
}

function tableUrl(origin, table) { return new URL(`/rest/v1/${encodeURIComponent(table)}`, origin); }

async function responseRows(response, endpoint) {
  if (!response.ok) throw new SocialApiError('http_error', `投稿一覧を読み込めませんでした (${response.status})。`, response.status);
  let rows;
  try { rows = await response.json(); }
  catch { throw new SocialApiError('invalid_response', '投稿一覧の応答を読み取れませんでした。'); }
  if (!Array.isArray(rows)) throw new SocialApiError('invalid_response', `投稿一覧の応答形式を確認できません (${endpoint})。`);
  return rows;
}

async function fetchRows({ url, select, optional = [], fetchImpl, key, signal, timeoutMs }) {
  let remaining = [...optional];
  for (;;) {
    url.searchParams.set('select', [...select.split(','), ...remaining].join(','));
    const context = requestContext(signal, timeoutMs);
    try {
      const response = await fetchImpl(url, { headers: { apikey: key, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: context.signal });
      if (response.status === 400 && remaining.length) {
        let message = '';
        try {
          const payload = await response.clone().json();
          message = String(payload?.message || payload?.details || payload?.hint || '');
        } catch { /* An unparseable 400 remains an error below. */ }
        const absent = remaining.find((column) => message.includes(column));
        if (absent) {
          remaining = remaining.filter((column) => column !== absent);
          continue;
        }
      }
      return await responseRows(response, url.pathname);
    } catch (error) {
      if (error instanceof SocialApiError) throw error;
      if (context.timedOut) throw new SocialApiError('timeout', '投稿一覧の読み込みが時間切れになりました。再試行できます。');
      if (context.callerAborted) throw new SocialApiError('aborted', '投稿一覧の読み込みを中止しました。');
      throw new SocialApiError('network_error', '投稿一覧に接続できませんでした。再試行できます。');
    } finally {
      context.cleanup();
    }
  }
}

function boundedLimit(value) {
  const requested = Number(value);
  return Number.isFinite(requested) ? Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(requested))) : 30;
}

function mapSnsPost(row, origin) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = uuid(row.id);
  const kind = row.kind;
  const title = cleanText(row.title, { max: 60, required: true });
  const caption = cleanText(row.body, { max: 180 });
  const authorName = cleanText(row.authorName, { max: 40 });
  const createdAt = dateValue(row.createdAt);
  const updatedAt = dateValue(row.updatedAt) || createdAt;
  const visibility = row.visibility;
  if (!id || !['text', 'music'].includes(kind) || !title || caption === null || !createdAt || !['public', 'private'].includes(visibility)) return null;
  const ref = `sns:${id}`;
  const post = {
    id: ref, postId: id, source: 'sns', kind, title, caption,
    author: Object.freeze({ name: authorName || '' }), createdAt, updatedAt,
    visibility, version: Number.isSafeInteger(row.version) && row.version > 0 ? row.version : 1,
    href: `/feed/?post=${encodeURIComponent(ref)}`, likeable: false
  };
  if (row.owned === true) post.owned = true;
  if (kind === 'music' && row.audio && (visibility === 'public' || row.owned === true)) {
    post.audio = Object.freeze({ src: `${origin}/functions/v1/social-feed?action=audio&postId=${encodeURIComponent(id)}` });
  }
  return Object.freeze(post);
}

function mapSnsComment(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = uuid(row.id);
  const body = cleanText(row.body, { max: 180, required: true });
  const createdAt = dateValue(row.createdAt);
  if (!id || !body || !createdAt || typeof row.target !== 'string' || !/^(sns|map|showcase):[0-9a-f-]{36}$/i.test(row.target)) return null;
  return Object.freeze({ id, target: row.target, body, authorName: cleanText(row.authorName, { max: 40 }) || '', createdAt, updatedAt: dateValue(row.updatedAt) || createdAt, version: Number.isSafeInteger(row.version) && row.version > 0 ? row.version : 1, ...(row.owned === true ? { owned: true } : {}) });
}

export function createSocialApi({ config = supabaseConfig, fetchImpl = globalThis.fetch, storage = globalThis.localStorage, loadActions = () => import('../globe/post-supabase.mjs?rev=20261116-normal-release-2'), loadServerActions = () => import(`./server-actions.mjs?rev=20261111-output-offerwall-1`), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let actionsPromise = null;
  let serverActionsPromise = null;
  let readWarnings = [];
  const actions = () => {
    if (!actionsPromise) {
      actionsPromise = Promise.resolve().then(loadActions).then((module) => {
        if (typeof module?.createSupabasePostActions !== 'function') throw new SocialApiError('actions_unavailable', '投稿操作を準備できません。');
        return module.createSupabasePostActions();
      }).catch((error) => {
        actionsPromise = null;
        throw error;
      });
    }
    return actionsPromise;
  };

  const serverActions = () => {
    if (!serverActionsPromise) {
      serverActionsPromise = Promise.resolve().then(loadServerActions).then((module) => {
        if (typeof module?.createSocialServerActions !== 'function') throw new SocialApiError('actions_unavailable', '文章・音楽の投稿操作を準備できません。');
        return module.createSocialServerActions({ config, fetchImpl, storage, timeoutMs });
      }).catch((error) => { serverActionsPromise = null; throw error; });
    }
    return serverActionsPromise;
  };

  async function readSns(action, payload = {}, signal, { authenticated = false } = {}) {
    if (authenticated) return (await serverActions())[action](payload, { authenticated: true, signal });
    const cfg = project(config);
    const context = requestContext(signal, timeoutMs);
    try {
      const response = await fetchImpl(`${cfg.origin}/functions/v1/social-feed`, {
        method: 'POST', headers: { apikey: cfg.key, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }), cache: 'no-store', redirect: 'error', signal: context.signal
      });
      let result;
      try { result = await response.json(); } catch { result = null; }
      const errorCode = String(result?.error || '').toLowerCase();
      if (response.status === 404 && ['post_not_found', 'target_not_found', 'comment_not_found', 'not_found'].includes(errorCode)) {
        throw new SocialApiError('not_found', '投稿またはコメントが見つからないか、公開されていません。', response.status);
      }
      if (response.status === 404 || response.status === 405 || response.status === 501 || ['function_not_found', 'capability_unavailable'].includes(errorCode)) {
        throw new SocialApiError('capability_unavailable', '文章・音楽のサーバーフィードはまだ利用できません。', response.status);
      }
      if (!response.ok || result?.ok !== true) throw new SocialApiError('sns_read_failed', '文章・音楽の投稿を読み込めませんでした。', response.status);
      return result;
    } catch (error) {
      if (error instanceof SocialApiError) throw error;
      if (context.timedOut) throw new SocialApiError('timeout', '文章・音楽の読み込みが時間切れになりました。再試行できます。');
      if (context.callerAborted) throw new SocialApiError('aborted', '投稿一覧の読み込みを中止しました。');
      throw new SocialApiError('network_error', '文章・音楽のサーバーに接続できませんでした。再試行できます。');
    } finally { context.cleanup(); }
  }

  function serverValue(value) { return String(value || '').replace(/^sns:/, ''); }
  function mappedServerPost(result, { origin = project(config).origin, owned = false } = {}) {
    const row = result?.post || result;
    return mapSnsPost(owned && row && typeof row === 'object' ? { ...row, owned: true } : row, origin);
  }

  async function readMap({ limit, id, signal }) {
    const cfg = project(config);
    const url = tableUrl(cfg.origin, cfg.table);
    url.searchParams.set('map_space', 'eq.globe');
    url.searchParams.set('published_at', 'not.is.null');
    if (id) url.searchParams.set('post_id', `eq.${id}`);
    else {
      url.searchParams.set('order', 'published_at.desc');
      url.searchParams.set('limit', String(limit));
    }
    return fetchRows({ url, select: 'post_id,title,caption,public_image_path,published_at,globe_cell_id,map_space', optional: OPTIONAL_MAP_COLUMNS, fetchImpl, key: cfg.key, signal, timeoutMs });
  }

  async function readLegacyPuzzles({ limit = 30, offset = 0, id, postIds, signal } = {}) {
    const cfg = project(config);
    const url = tableUrl(cfg.origin, 'social_posts');
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('post_kind', 'eq.pixfind');
    url.searchParams.set('distribution_mode', 'eq.pixfind');
    url.searchParams.set('published_at', 'not.is.null');
    url.searchParams.set('order', 'published_at.desc,id.desc');
    url.searchParams.set('limit', String(id ? 1 : limit + 1));
    if (id) url.searchParams.set('id', `eq.${id}`);
    else if (postIds) url.searchParams.set('id', `in.(${postIds.join(',')})`);
    else url.searchParams.set('offset', String(offset));
    const rows = await fetchRows({ url, select: 'id,title,caption,creator_display_name,published_at,pixfind_puzzle_id', fetchImpl, key: cfg.key, signal, timeoutMs });
    const legacyMode = (value) => isLegacyPuzzleShareId('hidden_object', value) ? 'hidden_object'
      : isLegacyPuzzleShareId('spot_difference', value) ? 'spot_difference' : null;
    const ids = [...new Set(rows.map(row => row.pixfind_puzzle_id).filter(legacyMode))];
    if (!ids.length) return { posts: [], count: rows.length };
    const puzzlesUrl = tableUrl(cfg.origin, 'pixfind_puzzles');
    puzzlesUrl.searchParams.set('id', `in.(${ids.join(',')})`);
    const puzzles = await fetchRows({ url: puzzlesUrl, select: 'id,mode,game_mode,play_mode,original_url,author_name', fetchImpl, key: cfg.key, signal, timeoutMs });
    const byId = new Map(puzzles.map(row => [row.id, row]));
    return { count: rows.length, posts: rows.slice(0, limit).flatMap((row) => {
      const postId = uuid(row.id);
      const puzzle = byId.get(row.pixfind_puzzle_id);
      const puzzleMode = legacyMode(puzzle?.id);
      const game = puzzleMode?.replace('_', '-');
      const title = cleanText(row.title, { max: 60, required: true });
      const createdAt = dateValue(row.published_at);
      const src = legacyPuzzleImageUrl(puzzle?.original_url, { puzzleId: puzzle?.id, supabaseUrl: cfg.origin });
      if (!postId || !puzzleMode || !title || !createdAt || !src
        || [puzzle.mode, puzzle.game_mode, puzzle.play_mode].some(mode => mode && mode !== game && mode !== puzzleMode)) return [];
      return [Object.freeze({
        id: `pixfind:${postId}`, postId, source: 'pixfind', kind: 'puzzle', puzzleMode, title,
        caption: cleanText(row.caption, { max: 180 }) || '',
        author: Object.freeze({ name: cleanText(row.creator_display_name || puzzle.author_name, { max: 40 }) || '' }),
        createdAt, image: Object.freeze({ src }), href: `/play/${game}/?puzzle=${encodeURIComponent(puzzle.id)}`,
        mapHref: null, likeable: false,
      })];
    }) };
  }

  async function listPuzzles({ offset = 0, signal } = {}) {
    const cfg = project(config);
    const limit = 30;
    const url = tableUrl(cfg.origin, cfg.table);
    url.searchParams.set('map_space', 'eq.globe');
    url.searchParams.set('published_at', 'not.is.null');
    url.searchParams.set('puzzle_mode', 'in.(spot_difference,hidden_object,jigsaw)');
    url.searchParams.set('order', 'published_at.desc,post_id.desc');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit + 1));
    const [rows, legacy] = await Promise.all([fetchRows({
      url, select: 'post_id,title,caption,public_image_path,published_at,globe_cell_id,map_space,puzzle_mode',
      optional: ['post_kind', 'author_name'], fetchImpl, key: cfg.key, signal, timeoutMs,
    }), readLegacyPuzzles({ limit, offset, signal })]);
    return {
      posts: [...rows.slice(0, limit).map(row => mapPost(row, cfg)).filter(post => post?.kind === 'puzzle'), ...legacy.posts],
      nextOffset: rows.length > limit || legacy.count > limit ? offset + limit : null,
    };
  }

  async function readShowcases({ limit, id, signal, onPosts }) {
    const cfg = project(config);
    const postsUrl = tableUrl(cfg.origin, 'social_posts');
    postsUrl.searchParams.set('select', 'id,title,caption,creator_display_name,media_object_path,published_at,status,post_kind,distribution_mode');
    postsUrl.searchParams.set('status', 'eq.published');
    postsUrl.searchParams.set('post_kind', 'eq.image');
    postsUrl.searchParams.set('distribution_mode', 'eq.showcase');
    if (id) {
      postsUrl.searchParams.set('id', `eq.${id}`);
      postsUrl.searchParams.set('limit', '1');
    } else {
      postsUrl.searchParams.set('order', 'published_at.desc');
      postsUrl.searchParams.set('limit', String(limit));
    }
    const rows = await fetchRows({ url: postsUrl, select: 'id,title,caption,creator_display_name,media_object_path,published_at,status,post_kind,distribution_mode', fetchImpl, key: cfg.key, signal, timeoutMs });
    const posts = rows.map((row) => showcasePost(null, row, cfg)).filter(Boolean);
    if (!posts.length) return { posts, warnings: [] };
    // Placement links are optional enrichment, never a barrier to showing artwork.
    onPosts?.(posts);

    const ids = posts.map((post) => post.postId);
    const placementWarnings = [];
    let placements = new Map();
    try {
      const placementsUrl = tableUrl(cfg.origin, 'social_post_map_points');
      placementsUrl.searchParams.set('select', 'social_post_id,globe_cell_id');
      placementsUrl.searchParams.set('social_post_id', `in.(${ids.join(',')})`);
      placementsUrl.searchParams.set('limit', String(ids.length));
      const placementRows = await fetchRows({ url: placementsUrl, select: 'social_post_id,globe_cell_id', fetchImpl, key: cfg.key, signal, timeoutMs });
      placements = new Map();
      for (const point of placementRows) {
        const postId = uuid(point?.social_post_id);
        if (ids.includes(postId) && cellId(point.globe_cell_id) && !placements.has(postId)) placements.set(postId, point);
      }
    } catch (error) {
      if (error?.code === 'aborted') throw error;
      placementWarnings.push('地図配置リンクを確認できませんでした。作品はフィードで表示できます。');
    }
    return {
      posts: posts.map((post) => placements.has(post.postId)
        ? Object.freeze({ ...post, mapHref: `/globe/?art=${encodeURIComponent(post.id)}` })
        : post),
      warnings: placementWarnings
    };
  }

  async function list({ signal, limit = 30, before, onUpdate, includeLegacyPuzzles = false } = {}) {
    const cfg = project(config);
    const bounded = boundedLimit(limit);
    let mapPosts = [], showcasePosts = [], snsPosts = [], legacyPosts = [];
    const snapshot = () => {
      const merged = new Map();
      for (const post of [...mapPosts, ...showcasePosts, ...snsPosts, ...legacyPosts]) merged.set(post.id, post);
      return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, bounded);
    };
    const publish = () => {
      if (typeof onUpdate !== 'function' || signal?.aborted) return;
      const posts = snapshot();
      if (!posts.length) return;
      // Rendering failures must not turn a successful public read into a source failure.
      try { onUpdate(posts); } catch { /* The final result remains available to the caller. */ }
    };
    // These are independent public reads. In particular, a slow/missing placement
    // table must not delay starting the text/music request or rendering other posts.
    const [mapResult, showcaseResult, snsResult, legacyResult] = await Promise.allSettled([
      readMap({ limit: bounded, signal }).then(rows => {
        mapPosts = rows.map(row => mapPost(row, cfg)).filter(Boolean); publish(); return rows;
      }),
      readShowcases({ limit: bounded, signal, onPosts(posts) { showcasePosts = posts; publish(); } }).then(result => {
        showcasePosts = result.posts; publish(); return result;
      }),
      readSns('list', { limit: bounded, ...(before ? { before } : {}) }, signal).then(result => {
        if (Array.isArray(result?.posts)) { snsPosts = result.posts.map(row => mapSnsPost(row, cfg.origin)).filter(Boolean); publish(); }
        return result;
      }),
      includeLegacyPuzzles ? readLegacyPuzzles({ limit: bounded, signal }).then(result => {
        legacyPosts = result.posts; publish();
      }) : null,
    ]);
    const failureWarning = (label, error) => error?.code === 'timeout'
      ? `${label}の読み込みが時間切れになりました。再試行できます。`
      : `${label}を読み込めませんでした。再試行できます。`;
    const failures = [];
    if (mapResult.status === 'rejected') failures.push(failureWarning('地図の投稿', mapResult.reason));
    if (showcaseResult.status === 'rejected') failures.push(failureWarning('ショーケース', showcaseResult.reason));
    if (legacyResult.status === 'rejected') failures.push(failureWarning('以前のパズル投稿', legacyResult.reason));
    let snsFailure = null;
    if (snsResult.status === 'fulfilled') {
      const rows = snsResult.value?.posts;
      if (!Array.isArray(rows)) {
        snsFailure = new SocialApiError('invalid_response', '文章・音楽の投稿一覧を読み取れませんでした。');
        snsFailure.warning = '文章・音楽の投稿を読み込めませんでした。再試行できます。';
      }
    } else {
      snsFailure = snsResult.reason;
      if (snsFailure?.code !== 'capability_unavailable') snsFailure.warning = '文章・音楽の投稿を読み込めませんでした。再試行できます。';
      else snsFailure.warning = '文章・音楽のサーバーフィードはまだ利用できません。';
    }
    if (signal?.aborted) {
      readWarnings = [];
      throw new SocialApiError('aborted', '投稿一覧の読み込みを中止しました。');
    }
    if (mapResult.status === 'rejected' && showcaseResult.status === 'rejected' && snsResult.status === 'rejected' && !legacyPosts.length) {
      readWarnings = [...failures];
      if (mapResult.reason?.code === 'timeout') throw mapResult.reason;
      if (showcaseResult.reason?.code === 'timeout') throw showcaseResult.reason;
      throw new SocialApiError('feed_unavailable', '投稿を読み込めませんでした。再試行できます。');
    }
    const showcaseData = showcaseResult.status === 'fulfilled' ? showcaseResult.value : { posts: [], warnings: [] };
    readWarnings = [...failures, ...showcaseData.warnings, ...(snsFailure && !(mapResult.status === 'rejected' && showcaseResult.status === 'rejected') ? [snsFailure.warning] : [])];
    return snapshot();
  }

  async function get(value, { signal, authenticated = false } = {}) {
    const legacyId = typeof value === 'string' && value.startsWith('pixfind:') ? uuid(value.slice(8)) : '';
    if (legacyId) return (await readLegacyPuzzles({ id: legacyId, limit: 1, signal })).posts[0] || null;
    const ref = parseReference(value);
    if (!ref && typeof value === 'string') {
      const sns = /^sns:([0-9a-f-]{36})$/i.exec(value);
      if (sns && UUID.test(sns[1])) {
        try {
          const result = await readSns('get', { postId: sns[1].toLowerCase() }, signal, { authenticated });
          return mappedServerPost(result);
        } catch (error) {
          const warning = error?.code === 'capability_unavailable' ? '文章・音楽のサーバーフィードはまだ利用できません。' : '文章・音楽の投稿を読み込めませんでした。再試行できます。';
          if (!readWarnings.includes(warning)) readWarnings = [...readWarnings, warning];
          throw error;
        }
      }
      readWarnings = [];
      return null;
    }
    readWarnings = [];
    if (!ref) return null;
    if (ref.source === 'map') {
      const cfg = project(config);
      let rows;
      try { rows = await readMap({ id: ref.uuid, signal }); }
      catch (error) {
        readWarnings = ['地図の投稿を読み込めませんでした。再試行できます。'];
        throw error;
      }
      return rows.map((row) => mapPost(row, cfg)).find((post) => post?.postId === ref.uuid) || null;
    }
    try {
      const result = await readShowcases({ id: ref.uuid, signal });
      readWarnings = result.warnings;
      const [post] = result.posts;
      return post?.postId === ref.uuid ? post : null;
    } catch (error) {
      readWarnings = ['ショーケースを読み込めませんでした。再試行できます。'];
      throw error;
    }
  }

  return Object.freeze({
    list,
    listPuzzles,
    async savedLegacyPuzzles(refs) {
      const ids = [...new Set(refs.filter(ref => ref.startsWith('pixfind:')).map(ref => uuid(ref.slice(8))).filter(Boolean))];
      const requests = [];
      for (let index = 0; index < ids.length; index += 30) {
        const postIds = ids.slice(index, index + 30);
        requests.push(readLegacyPuzzles({ postIds, limit: postIds.length }));
      }
      return (await Promise.all(requests)).flatMap(result => result.posts);
    },
    get,
    getReadWarnings: () => [...readWarnings],
    async submit(post) {
      assertPublicPuzzleIntent(post);
      if ((post?.kind === 'text' || post?.kind === 'music') && !(post.image && post.pin)) {
        const { audio = null, caption = '', ...fields } = post;
        const result = await (await serverActions()).submit({ ...fields, body: caption, ...(audio ? { audio } : {}) });
        const normalized = mappedServerPost(result, { owned: true });
        if (!normalized) throw new SocialApiError('invalid_response', '投稿の保存応答を確認できませんでした。');
        return normalized;
      }
      if (!post || (post.kind != null && !['art', 'photo', 'puzzle'].includes(post.kind)) || (post.postKind != null && !['pixel_art', 'pixel_camera'].includes(post.postKind)) || !post.image || !post.pin) {
        throw new TypeError('この投稿形式は送信できません。作品画像と地図セルを確認してください。');
      }
      return (await actions()).submit(post);
    },
    async submitTextOrMusic(input) {
      if (!input || !['text', 'music'].includes(input.kind)) throw new TypeError('文章または音楽の投稿内容を確認してください。');
      const { audio = null, caption = '', ...fields } = input;
      const result = await (await serverActions()).submit({ ...fields, body: caption, ...(audio ? { audio } : {}) });
      const post = mappedServerPost(result, { owned: true });
      if (!post) throw new SocialApiError('invalid_response', '投稿の保存応答を確認できませんでした。');
      return post;
    },
    async mine() {
      const result = await (await serverActions()).mine();
      if (!Array.isArray(result?.posts)) throw new SocialApiError('invalid_response', '自分の投稿一覧を読み取れませんでした。');
      return result.posts.map((row) => mapSnsPost({ ...row, owned: true }, project(config).origin)).filter(Boolean);
    },
    async edit(input) {
      const { postId, caption, ...fields } = input || {};
      if (!UUID.test(serverValue(postId))) throw new TypeError('投稿IDを確認してください。');
      const result = await (await serverActions()).edit({ ...fields, postId: serverValue(postId), ...(caption !== undefined ? { body: caption } : {}) });
      const post = mappedServerPost(result, { owned: true });
      if (!post) throw new SocialApiError('invalid_response', '投稿の更新応答を確認できませんでした。');
      return post;
    },
    async remove(postId) {
      if (!UUID.test(serverValue(postId))) throw new TypeError('投稿IDを確認してください。');
      return (await serverActions()).remove(serverValue(postId));
    },
    async comments() { throw new SocialApiError('comments_disabled', 'コメント機能は無効です。', 410); },
    async createComment() { throw new SocialApiError('comments_disabled', 'コメント機能は無効です。', 410); },
    async editComment() { throw new SocialApiError('comments_disabled', 'コメント機能は無効です。', 410); },
    async removeComment() { throw new SocialApiError('comments_disabled', 'コメント機能は無効です。', 410); },
    async report(input) { return (await serverActions()).report(input || {}); },
    async getAudio(postId) {
      if (!UUID.test(serverValue(postId))) throw new TypeError('投稿IDを確認してください。');
      return (await serverActions()).getAudio(serverValue(postId));
    },
    async getComments() { throw new SocialApiError('comments_disabled', 'コメント機能は無効です。', 410); },
    async hasLiked(value) {
      const ref = parseReference(value);
      if (!ref || ref.source !== 'map') return false;
      return (await actions()).hasLiked(ref.uuid);
    },
    async setLike(value, liked) {
      const ref = parseReference(value);
      if (!ref || ref.source !== 'map') throw new TypeError('この投稿にはいいねできません。');
      return (await actions()).setLike(ref.uuid, Boolean(liked));
    }
  });
}
