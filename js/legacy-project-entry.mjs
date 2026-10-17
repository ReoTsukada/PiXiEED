const DRAW_PATH = '/draw/';
const DRAW_HELP_PATH = '/draw/#draw-how-to';
const PIXFIND_GAMES = Object.freeze({
  'hidden-object': '/play/hidden-object/',
  'spot-difference': '/play/spot-difference/',
});
const PIXFIND_CREATORS = Object.freeze({
  'hidden-object': '/hidden-object/',
  'spot-difference': '/spot-difference/',
});
const TRACKING_KEY = /^(?:utm_[a-z0-9_]+|gclid|fbclid|ref|from)$/i;
const POINTER_KEYS = ['pxd', 'pxdRevision', 'pxdImage', 'modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool'];

function queryFrom(search) {
  return search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams(String(search || '').replace(/^\?/, ''));
}

function suffix(search = '', hash = '') {
  const query = String(search || '');
  const fragment = String(hash || '');
  return `${query && query !== '?' ? (query.startsWith('?') ? query : `?${query}`) : ''}${fragment && fragment !== '#' ? (fragment.startsWith('#') ? fragment : `#${fragment}`) : ''}`;
}

function once(params, keys) {
  return keys.every((key) => params.getAll(key).length <= 1);
}

function trackingOnly(params, permitted = new Set()) {
  return [...params.keys()].every((key) => TRACKING_KEY.test(key) || permitted.has(key));
}

function nonemptyOnce(params, key) {
  const values = params.getAll(key);
  return values.length === 1 && Boolean(values[0].trim());
}

function drawPointerPlan(params) {
  if (!once(params, POINTER_KEYS)) return { ok: false, reason: 'repeated-pointer' };
  const directKeys = ['pxd', 'pxdRevision', 'pxdImage'].filter((key) => params.has(key));
  const modeKeys = ['modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool'].filter((key) => params.has(key));
  if (directKeys.length && modeKeys.length) return { ok: false, reason: 'mixed-pointer' };

  const result = new URLSearchParams(params);
  if (directKeys.length) {
    if (!params.has('pxd') || !nonemptyOnce(params, 'pxd') || !params.has('pxdRevision') || !nonemptyOnce(params, 'pxdRevision')) {
      return { ok: false, reason: 'incomplete-pointer' };
    }
    if (params.has('pxdImage') && !nonemptyOnce(params, 'pxdImage')) return { ok: false, reason: 'incomplete-pointer' };
    return { ok: true, params: result };
  }

  if (modeKeys.length) {
    if (!['modePxd', 'modePxdRevision', 'modeProjectTool'].every((key) => params.has(key) && nonemptyOnce(params, key))) {
      return { ok: false, reason: 'incomplete-mode-pointer' };
    }
    if (params.has('modePxdImage') && !nonemptyOnce(params, 'modePxdImage')) return { ok: false, reason: 'incomplete-mode-pointer' };
    const mode = params.get('modeProjectTool').toLowerCase();
    if (!['draw', 'camera', 'audio'].includes(mode)) return { ok: false, reason: 'unsupported-mode' };
    if (mode === 'draw') {
      result.delete('modeProjectTool');
      result.set('pxd', params.get('modePxd'));
      result.set('pxdRevision', params.get('modePxdRevision'));
      if (params.has('modePxdImage')) result.set('pxdImage', params.get('modePxdImage'));
      result.delete('modePxd');
      result.delete('modePxdRevision');
      result.delete('modePxdImage');
      result.delete('mode');
    } else {
      result.set('modeProjectTool', mode);
      result.set('mode', mode);
    }
    return { ok: true, params: result };
  }
  return { ok: false, reason: 'no-pointer' };
}

/** Decide whether an old PiXiEEDraw URL can safely enter the current editor. */
export function resolveLegacyDrawEntry({ search = '', hash = '' } = {}) {
  const params = queryFrom(search);
  if (!once(params, ['mode', ...POINTER_KEYS])) return { action: 'stay', reason: 'repeated-authority' };
  const fragment = String(hash || '').replace(/^#/, '');
  const knownFragment = !fragment || ['main', 'draw-canvas'].includes(fragment);
  if (!knownFragment) return { action: 'stay', reason: 'unknown-fragment' };

  const pointerKeys = POINTER_KEYS.filter((key) => params.has(key));
  const legacyKeys = ['project', 'new_project', 'lens', 'market_import', 'sync', 'embed', 'embedRole', 'channel', 'standalone', 'to', 'drawRequest', 'audioRequest', 'drawCamera', 'audioCamera'];
  if (legacyKeys.some((key) => params.has(key))) return { action: 'stay', reason: 'legacy-state' };
  if (pointerKeys.length) {
    const pointer = drawPointerPlan(params);
    if (!pointer.ok || !trackingOnly(params, new Set([...POINTER_KEYS, 'mode']))) return { action: 'stay', reason: pointer.reason || 'unknown-state' };
    if (params.has('mode')) {
      const mode = params.get('mode').toLowerCase();
      if (!['draw', 'camera', 'audio'].includes(mode)) return { action: 'stay', reason: 'unsupported-mode' };
      const expectedMode = params.get('modeProjectTool')?.toLowerCase() || 'draw';
      if (mode !== expectedMode) return { action: 'stay', reason: 'conflicting-mode' };
    }
    if (pointer.params.has('mode')) pointer.params.set('mode', pointer.params.get('mode').toLowerCase());
    const query = pointer.params.toString();
    return { action: 'redirect', reason: 'recognized-pointer', url: `${DRAW_PATH}${query ? `?${query}` : ''}${hash || ''}` };
  }
  if (params.has('mode')) {
    const mode = params.get('mode').toLowerCase();
    if (!['draw', 'camera', 'audio'].includes(mode) || !trackingOnly(params, new Set(['mode']))) return { action: 'stay', reason: 'unsupported-mode' };
    params.set('mode', mode);
    return { action: 'redirect', reason: 'recognized-mode', url: `${DRAW_PATH}?${params}${hash || ''}` };
  }
  if (!trackingOnly(params)) return { action: 'stay', reason: 'unknown-state' };
  return { action: 'redirect', reason: 'clean-entry', url: `${DRAW_PATH}${suffix(search, hash)}` };
}

/** Build explicit recovery links while retaining the original suffix. */
export function legacyDrawRecoveryLinks({ search = '', hash = '' } = {}) {
  const query = String(search || '').replace(/^\?/, '');
  // A present but incomplete PXD pointer blocks Draw's normal last-project fallback.
  const params = queryFrom(search);
  const drawQuery = params.has('pxd')
    ? query
    : `${query}${query ? '&' : ''}pxd=legacy-state-unavailable`;
  const helpPath = DRAW_HELP_PATH.slice(0, DRAW_HELP_PATH.indexOf('#'));
  const helpFragment = DRAW_HELP_PATH.slice(DRAW_HELP_PATH.indexOf('#'));
  return {
    draw: `${DRAW_PATH}${drawQuery ? `?${drawQuery}` : ''}${hash || ''}`,
    guide: `${helpPath}${query ? `?${query}` : ''}${helpFragment}`,
  };
}

function legacyPuzzleMode(value) {
  const id = String(value || '').trim().toLowerCase();
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  if (new RegExp(`^pixfind-ho-${uuid}$`, 'i').test(id)) return 'hidden-object';
  if (new RegExp(`^pixfind-(?:sd-)?${uuid}$`, 'i').test(id)) return 'spot-difference';
  return null;
}

function normalizedMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'hidden-object' || mode === 'spot-difference' ? mode : null;
}

/** Route only typed or explicitly selected old PiXFiND states. */
export function resolveLegacyPixfindEntry({ search = '', hash = '' } = {}) {
  const params = queryFrom(search);
  const fragment = String(hash || '').replace(/^#/, '');
  const special = ['localHidden', 'localSpot', 'puzzle', 'postPuzzle', 'mode', 'creator', 'edit'];
  if (!once(params, special)) return { action: 'stay', reason: 'repeated-authority' };
  if (params.has('localHidden') && params.has('localSpot')) return { action: 'stay', reason: 'conflicting-local-drafts' };
  if (params.has('creator') || params.has('edit')) return { action: 'stay', reason: 'legacy-creator-state' };
  const unknownKeys = [...params.keys()].filter((key) => !TRACKING_KEY.test(key) && !special.includes(key));
  if (unknownKeys.length) return { action: 'stay', reason: 'unknown-state' };

  if (params.has('localHidden') || params.has('localSpot')) {
    const key = params.has('localHidden') ? 'localHidden' : 'localSpot';
    if (!nonemptyOnce(params, key)) return { action: 'stay', reason: 'invalid-local-draft' };
    if (params.has('puzzle') || params.has('postPuzzle') || params.has('mode') || (fragment && !['main', 'games'].includes(fragment))) {
      return { action: 'stay', reason: 'conflicting-local-state' };
    }
    return { action: 'redirect', mode: key === 'localHidden' ? 'hidden-object' : 'spot-difference', reason: 'local-draft' };
  }

  const puzzleValues = params.getAll('puzzle');
  const fragmentPuzzle = fragment.startsWith('puzzle=') ? fragment.slice('puzzle='.length) : '';
  if (params.has('puzzle') && (!nonemptyOnce(params, 'puzzle') || fragmentPuzzle)) return { action: 'stay', reason: 'ambiguous-puzzle-state' };
  if (fragment && !fragmentPuzzle && !['main', 'games'].includes(fragment)) return { action: 'stay', reason: 'unknown-fragment' };
  let typedMode = puzzleValues.length ? legacyPuzzleMode(puzzleValues[0]) : null;
  if (fragmentPuzzle) {
    let decoded = fragmentPuzzle;
    try { decoded = decodeURIComponent(fragmentPuzzle); } catch { return { action: 'stay', reason: 'invalid-puzzle-fragment' }; }
    const fragmentMode = legacyPuzzleMode(decoded);
    if (typedMode && fragmentMode && typedMode !== fragmentMode) return { action: 'stay', reason: 'conflicting-puzzle-types' };
    typedMode ||= fragmentMode;
  }
  if (params.has('postPuzzle')) {
    if (!nonemptyOnce(params, 'postPuzzle') || params.has('puzzle') || fragmentPuzzle) return { action: 'stay', reason: 'ambiguous-public-post' };
    if (typedMode) return { action: 'stay', reason: 'ambiguous-public-post' };
  }
  const explicitMode = params.has('mode') ? normalizedMode(params.get('mode')) : null;
  if (params.has('mode') && !explicitMode) return { action: 'stay', reason: 'unknown-mode' };
  if (typedMode && explicitMode && typedMode !== explicitMode) return { action: 'stay', reason: 'conflicting-mode' };
  const mode = explicitMode || typedMode;
  const onlyTrackingAndKnown = [...params.keys()].every((key) => TRACKING_KEY.test(key) || special.includes(key));
  if (mode && onlyTrackingAndKnown && (!params.has('postPuzzle') || Boolean(explicitMode))) {
    return { action: 'redirect', mode, reason: explicitMode ? 'explicit-mode' : 'typed-puzzle' };
  }
  return { action: 'stay', reason: params.has('postPuzzle') ? 'ambiguous-public-post' : puzzleValues.length || fragmentPuzzle ? 'untyped-puzzle' : 'landing' };
}

/** Add a game path to an arbitrary original query/hash without normalizing either. */
export function legacyPixfindGameUrl(mode, { search = '', hash = '' } = {}) {
  const path = PIXFIND_GAMES[mode];
  if (!path) throw new TypeError('Unknown PiXFiND game mode.');
  return `${path}${suffix(search, hash)}`;
}

export function initLegacyDrawEntry(locationLike = globalThis.location, documentLike = globalThis.document) {
  if (!locationLike || !documentLike) return { action: 'stay', reason: 'no-browser' };
  const result = resolveLegacyDrawEntry({ search: locationLike.search, hash: locationLike.hash });
  const drawLink = documentLike.querySelector('[data-legacy-draw-link]');
  const guideLink = documentLike.querySelector('[data-legacy-draw-guide]');
  const status = documentLike.querySelector('[data-legacy-entry-status]');
  if (drawLink && guideLink) {
    const links = legacyDrawRecoveryLinks({ search: locationLike.search, hash: locationLike.hash });
    drawLink.href = links.draw;
    guideLink.href = links.guide;
  }
  if (result.action === 'redirect') {
    locationLike.replace(result.url);
    return result;
  }
  if (drawLink) drawLink.textContent = '旧状態を復元せず開く';
  if (status) status.textContent = 'このURLには、以前の作品・モード・編集状態が含まれています。現在のエディターではその状態を復元できません。元のURLはそのままです。';
  return result;
}

export function initLegacyPixfindEntry(locationLike = globalThis.location, documentLike = globalThis.document) {
  if (!locationLike || !documentLike) return { action: 'stay', reason: 'no-browser' };
  const result = resolveLegacyPixfindEntry({ search: locationLike.search, hash: locationLike.hash });
  if (result.action === 'redirect') {
    locationLike.replace(legacyPixfindGameUrl(result.mode, { search: locationLike.search, hash: locationLike.hash }));
    return result;
  }
  const status = documentLike.querySelector('[data-legacy-entry-status]');
  if (status) {
    status.textContent = result.reason === 'landing'
      ? '間違い探しともの探しから選べます。'
      : result.reason === 'legacy-creator-state'
        ? '以前の作成・編集状態は復元できません。新しい問題を作るか、ゲームを選んでください。'
        : 'このURLの問題形式や編集状態を判別できません。下の2つから形式を選ぶと、元のクエリとハッシュを保って開きます。';
  }
  const createChoices = documentLike.querySelector('[data-legacy-create-choices]');
  if (createChoices && result.reason === 'legacy-creator-state') createChoices.hidden = false;
  for (const link of documentLike.querySelectorAll('[data-legacy-game]')) {
    const mode = link.getAttribute('data-legacy-game');
    if (mode === 'hidden-object' || mode === 'spot-difference') link.href = legacyPixfindGameUrl(mode, { search: locationLike.search, hash: locationLike.hash });
  }
  for (const link of documentLike.querySelectorAll('[data-legacy-create]')) {
    const mode = link.getAttribute('data-legacy-create');
    const path = PIXFIND_CREATORS[mode];
    if (path) link.href = `${path}${suffix(locationLike.search, locationLike.hash)}`;
  }
  return result;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  const entry = document.querySelector('[data-legacy-entry]')?.getAttribute('data-legacy-entry');
  if (entry === 'draw') initLegacyDrawEntry(location, document);
  if (entry === 'pixfind') initLegacyPixfindEntry(location, document);
}
