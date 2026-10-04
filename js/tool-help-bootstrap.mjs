import { isToolsHubPath, mountToolHelp } from './tool-help.mjs?rev=20261004-audio-frames-1';
import { getToolGuide } from './tool-help-data.mjs?rev=20261004-audio-frames-1';

/** Attach help after the existing shared header mounts, without loading a second header. */
export function installToolHelp({ document = globalThis.document, window = globalThis.window } = {}) {
  if (!document || !window) return null;
  const pathname = window.location?.pathname || '/';
  if (!isToolsHubPath(pathname) && !getToolGuide({ pathname, search: window.location?.search || '' })) return null;
  // Embedded globe surfaces belong to their parent page and have no shared menu.
  if (window.self !== window.top) return null;
  const mount = () => {
    const menu = document.querySelector('[data-site-menu]');
    const toggle = document.querySelector('[data-menu-toggle]');
    if (!menu || !toggle) return null;
    return mountToolHelp({ document, window, menu, returnFocus: toggle,
      onCloseMenu: () => { if (!menu.hidden) toggle.click(); } });
  };
  const mounted = mount();
  if (mounted) return mounted;
  // Header modules can finish asynchronously; only watch known tool pages briefly.
  const observer = new window.MutationObserver(() => { if (mount()) finish(); });
  const finish = () => { observer.disconnect(); window.clearTimeout(timeout); };
  const timeout = window.setTimeout(finish, 10000);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return null;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => installToolHelp(), { once: true });
  else installToolHelp();
}
