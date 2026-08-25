const SENSITIVE_KEYS = new Set([
  'access_token', 'refresh_token', 'jwt', 'email', 'userEmail', 'projectContent',
  'projectData', 'creativeContent', 'commissionDetails', 'secret', 'token',
]);

export const NAVIGATION_MAP = Object.freeze([
  { id: 'home', label: 'ホーム', icon: '⌂', category: 'core' },
  { id: 'projects', label: 'Projects', icon: '▦', category: 'project' },
  { id: 'assets', label: 'Assets', icon: '◇', category: 'project' },
  { id: 'tools', label: 'Tools', icon: '✦', category: 'tool' },
  { id: 'search', label: 'Search', icon: '⌕', category: 'discovery' },
  { id: 'notifications', label: '通知', icon: '♢', category: 'account' },
  { id: 'market', label: 'Market', icon: '◎', category: 'commerce' },
  { id: 'sns', label: 'Community', icon: '◌', category: 'community' },
  { id: 'account', label: 'Account', icon: '●', category: 'account' },
  { id: 'help', label: 'Help', icon: '?', category: 'support' },
]);

export const COMPONENT_STATES = Object.freeze([
  'default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error',
  'empty', 'saving', 'saved', 'reconnecting', 'degraded', 'permission-denied',
  'session-expired', 'conflict', 'recoverable-error', 'fatal-error', 'unsupported-version',
  'offline', 'rollback-recovery-available', 'unavailable',
]);

export const RESPONSIVE_BREAKPOINTS = Object.freeze({
  phone: '< 720px',
  tablet: '720px–1099px',
  desktop: '1100px–1439px',
  wide: '>= 1440px',
  split: '[data-layout="split"]',
});

export const CORE_SHELL_FLAGS = Object.freeze({
  shellRead: 'core-shell-read',
  shellWrite: 'core-shell-write',
  draw2: 'draw2-route',
  audio: 'audio-route',
  game: 'game-route',
  market: 'market-route',
});

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createCoreShellAccessContract({
  flagEvaluator,
  flagId = CORE_SHELL_FLAGS.shellRead,
  action = 'read',
  serverRoute = null,
  identity = null,
  account = null,
  resourcePermission = null,
  principalId = null,
} = {}) {
  if (!serverRoute || serverRoute.authorized !== true) {
    return {
      ok: false,
      decision: 'deny',
      phase: 'server-route',
      code: 'CORE_SHELL_SERVER_ROUTE_UNAVAILABLE',
      message: 'サーバー側Route認可が確認できないため、Shell機能はUnavailableです。',
      useCurrentPath: false,
    };
  }
  if (!account || account.status !== 'active') {
    return {
      ok: false,
      decision: 'deny',
      phase: 'account',
      code: 'CORE_SHELL_ACCOUNT_INACTIVE',
      message: 'Account状態を確認できないため、Shell機能はUnavailableです。',
      useCurrentPath: false,
    };
  }
  if (typeof flagEvaluator !== 'function') {
    return {
      ok: false,
      decision: 'unknown',
      phase: 'flag',
      code: 'CORE_SHELL_FLAG_EVALUATOR_MISSING',
      message: 'Feature Flag評価器が未接続です。',
      useCurrentPath: false,
    };
  }
  const result = flagEvaluator({
    flagId,
    action,
    principalId,
    principalSource: 'server',
    identity,
    serverAuthorization: serverRoute,
    resourcePermission,
    clientRequested: false,
  });
  return {
    ...clone(result),
    serverRouteAuthorized: true,
    accountStatus: account.status,
  };
}

export function sanitizeUiTelemetry(event = {}) {
  const allowed = ['eventName', 'routeId', 'component', 'state', 'correlationId', 'viewportClass', 'theme'];
  const result = {};
  for (const key of allowed) {
    if (SENSITIVE_KEYS.has(key)) continue;
    const value = event[key];
    if (typeof value === 'string') result[key] = value.slice(0, 160);
  }
  return result;
}

export function createShellStore(initial = {}) {
  let state = Object.freeze({
    activeRoute: 'home',
    theme: 'system',
    layout: 'auto',
    mobileNavOpen: false,
    ...clone(initial),
  });
  const listeners = new Set();
  return Object.freeze({
    getState: () => clone(state),
    subscribe(selector, listener) {
      let previous = selector(state);
      const entry = () => {
        const next = selector(state);
        if (Object.is(previous, next)) return;
        previous = next;
        listener(next, state);
      };
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    set(patch) {
      state = Object.freeze({ ...state, ...clone(patch) });
      listeners.forEach((listener) => listener());
      return clone(state);
    },
  });
}

export function createUiTelemetryRecorder({ maxEntries = 100 } = {}) {
  const events = [];
  return Object.freeze({
    record(event) {
      const safe = sanitizeUiTelemetry(event);
      events.push(safe);
      while (events.length > Math.max(1, Number(maxEntries) || 100)) events.shift();
      return clone(safe);
    },
    snapshot() {
      return clone(events);
    },
  });
}
