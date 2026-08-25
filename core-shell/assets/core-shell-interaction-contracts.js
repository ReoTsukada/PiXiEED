const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON']);
const TEXT_ENTRY_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'listbox']);

export const SHORTCUT_CONTRACT = Object.freeze({
  ignoresTextEntry: true,
  ignoresImeComposition: true,
  remappable: true,
  requiredDiscovery: 'visible-help-or-command-surface',
});

export const ROUTE_FOCUS_CONTRACT = Object.freeze({
  primaryTarget: 'new-route-heading',
  fallbackTarget: 'core-shell-main',
  announce: true,
  restoreAfterOverlay: true,
});

export const POINTER_OWNERSHIP_CONTRACT = Object.freeze({
  pointerTypes: ['mouse', 'touch', 'pen'],
  oneOwnerPerPointerId: true,
  releaseOn: ['pointerup', 'pointercancel', 'lostpointercapture'],
  noSyntheticClickDuplication: true,
});

export function isTextEntryTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable === true) return true;
  const tagName = String(target.tagName || '').toUpperCase();
  if (TEXT_ENTRY_TAGS.has(tagName)) return true;
  return TEXT_ENTRY_ROLES.has(String(target.getAttribute?.('role') || '').toLowerCase());
}

export function shouldHandleShortcut(event, { allowInTextInput = false } = {}) {
  if (!event || event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
  if (!allowInTextInput && isTextEntryTarget(event.target)) return false;
  return true;
}

function normalizeShortcut(shortcut) {
  return {
    id: String(shortcut?.id || ''),
    key: String(shortcut?.key || ''),
    description: String(shortcut?.description || ''),
    action: String(shortcut?.action || ''),
    remappable: shortcut?.remappable !== false,
  };
}

export function createShortcutRegistry(initial = []) {
  const shortcuts = new Map();
  for (const shortcut of initial) {
    const normalized = normalizeShortcut(shortcut);
    if (normalized.id) shortcuts.set(normalized.id, normalized);
  }
  return Object.freeze({
    register(shortcut) {
      const normalized = normalizeShortcut(shortcut);
      if (!normalized.id || !normalized.key || !normalized.action) {
        return { ok: false, code: 'SHORTCUT_INVALID' };
      }
      shortcuts.set(normalized.id, normalized);
      return { ok: true, shortcut: { ...normalized } };
    },
    get(id) {
      const shortcut = shortcuts.get(String(id));
      return shortcut ? { ...shortcut } : null;
    },
    list() {
      return [...shortcuts.values()].map((shortcut) => ({ ...shortcut }));
    },
    resolve(event, options) {
      if (!shouldHandleShortcut(event, options)) return null;
      return [...shortcuts.values()].find((shortcut) => shortcut.key === event.key) || null;
    },
  });
}

export function chooseFocusRestoreTarget({ origin = null, candidates = [], fallback = 'coreShellMain' } = {}) {
  const normalized = [origin, ...candidates].filter(Boolean).map((candidate) => (
    typeof candidate === 'string' ? { id: candidate } : candidate
  ));
  const target = normalized.find((candidate) => (
    candidate.id && candidate.connected !== false && candidate.hidden !== true && candidate.disabled !== true
  ));
  return target?.id || fallback;
}

export function createRouteFocusDecision({ routeId, headingId = '', fallbackId = 'coreShellMain' } = {}) {
  const safeRouteId = String(routeId || 'home');
  const safeHeadingId = String(headingId || `route-${safeRouteId}-heading`);
  return {
    routeId: safeRouteId,
    targetId: safeHeadingId,
    fallbackId: String(fallbackId),
    announcement: `${safeRouteId} routeへ移動しました。`,
  };
}

export function createPointerOwnership() {
  const owners = new Map();
  return Object.freeze({
    begin({ pointerId, pointerType, owner = 'shell' } = {}) {
      const key = String(pointerId);
      if (!['mouse', 'touch', 'pen'].includes(pointerType) || owners.has(key)) {
        return { ok: false, code: owners.has(key) ? 'POINTER_ALREADY_OWNED' : 'POINTER_TYPE_UNSUPPORTED' };
      }
      owners.set(key, { pointerType, owner: String(owner) });
      return { ok: true, pointerId: key, pointerType, owner: String(owner) };
    },
    release(pointerId, reason = 'pointerup') {
      const key = String(pointerId);
      const previous = owners.get(key);
      owners.delete(key);
      return previous ? { ok: true, ...previous, pointerId: key, reason } : { ok: false, code: 'POINTER_NOT_OWNED' };
    },
    owner(pointerId) {
      const owner = owners.get(String(pointerId));
      return owner ? { ...owner } : null;
    },
    snapshot() {
      return [...owners.entries()].map(([pointerId, owner]) => ({ pointerId, ...owner }));
    },
  });
}
