// Local-only qualification entry. Set the fixture marker before importing the
// real Shell module so the normal entry remains default-off.
window.__PIXIEED_CORE_SHELL_LOCAL_TEST__ = true;
history.replaceState(null, '', '/core-shell/');
await import('./core-shell.js?site400-local-entry-20260816-5');
