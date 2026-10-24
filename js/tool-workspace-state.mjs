import { getToolStartRoute } from './tool-start-routes.mjs?rev=20261024-common-tool-start-1';
export function createWorkspaceHistoryEntry(currentHref, currentState, open) {
  const url = new URL(currentHref);
  url.searchParams.delete('workspace');
  if (open) url.searchParams.set('workspace', '1');
  const state = currentState && typeof currentState === 'object' ? { ...currentState } : {};
  state.pixieedWorkspace = Boolean(open);
  return { state, url: `${url.pathname}${url.search}${url.hash}` };
}

export function isWorkspaceRequested(currentHref, currentState) {
  const url = new URL(currentHref);
  if (url.searchParams.has('workspace')) return url.searchParams.get('workspace') === '1';
  if (typeof currentState?.pixieedWorkspace === 'boolean') return currentState.pixieedWorkspace;
  if (getToolStartRoute(url.pathname)?.mode) return true;
  return currentState?.pixieedWorkspace === true;
}
