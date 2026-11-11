/** Real tool documents grouped for provider URL targeting; no intermediary page. */
export const TOOL_START_BASE = '/tools/start/';
export const TOOL_START_ROUTES = Object.freeze([
  ['draw', '/draw/', 'draw'],
  ['camera', '/camera/', 'camera'],
  ['audio', '/audio/', 'audio'],
  ['spot-difference', '/spot-difference/', null],
  ['hidden-object', '/hidden-object/', null],
  ['jigsaw', '/jigsaw/', null],
  ['convert', '/output/work/', null],
].map(([id, legacyPath, mode]) => Object.freeze({ id, legacyPath, mode,
  startPath: `${TOOL_START_BASE}${id}/`, sourcePath: `${legacyPath.slice(1)}index.html` })));

const normalizedPath = path => String(path || '').replace(/index\.html$/, '').replace(/\/?$/, '/');
export const getToolStartRoute = pathname => TOOL_START_ROUTES.find(route => route.startPath === normalizedPath(pathname)) || null;
export const legacyToolPath = pathname => getToolStartRoute(pathname)?.legacyPath || pathname;

export function isFreshStartSearch(params) {
  for (const key of params.keys()) {
    if (!['workspace', 'social'].includes(key) || params.getAll(key).length !== 1 || params.get(key) !== '1') return false;
  }
  return true;
}

/** Conservative converter resume markers stored in history state, not the URL. */
export function hasConversionRecoveryHistory(state) {
  return ['pixieedConversionRecovery', 'pixieedConversionRecoveryPrevious', 'pixieedConversionRecoveryPaused']
    .some(key => Object.prototype.hasOwnProperty.call(state || {}, key));
}

/** Google documents this exact pair for Offerwall look-and-feel previews. */
export function isConverterOfferwallPreviewSearch(params) {
  const keys = [...params.keys()];
  return keys.length === 2
    && params.getAll('fc').length === 1 && params.get('fc') === 'alwaysshow'
    && params.getAll('fctype').length === 1 && params.get('fctype') === 'monetization';
}

/** Preserve pointers, shared play, fragments and unknown parameters verbatim. */
export function toolStartHref(href) {
  let url;
  try { url = new URL(href, 'https://pixieed.jp'); } catch { return href; }
  if (url.origin !== 'https://pixieed.jp' || url.hash || !isFreshStartSearch(url.searchParams)) return href;
  const route = TOOL_START_ROUTES.find(item => item.legacyPath === normalizedPath(url.pathname));
  if (!route) return href;
  url.searchParams.delete('workspace');
  return `${route.startPath}${url.search}`;
}

/** Capture before the retained host writes its own history/mode parameters. */
export function isFreshToolStartRequest(href, historyState) {
  let url;
  try { url = new URL(href); } catch { return false; }
  const route = getToolStartRoute(url.pathname);
  const freshSearch = isFreshStartSearch(url.searchParams)
    || (route?.id === 'convert' && isConverterOfferwallPreviewSearch(url.searchParams));
  return Boolean(route && !url.hash && freshSearch
    && !(route.id === 'convert' && hasConversionRecoveryHistory(historyState))
    && historyState?.pixieedWorkspace !== true && historyState?.projectWorkspaceSelection !== true
    && historyState?.toolStartActive !== true);
}
