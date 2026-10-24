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
  return Boolean(getToolStartRoute(url.pathname) && !url.hash && isFreshStartSearch(url.searchParams)
    && historyState?.pixieedWorkspace !== true && historyState?.projectWorkspaceSelection !== true
    && historyState?.toolStartActive !== true);
}
