const DENY = Object.freeze({ ok: false, decision: 'deny', serverAuthorized: false });
const CORE_SHELL_ROUTE_IDS = new Set(['home', 'projects', 'assets', 'tools', 'search', 'notifications', 'market', 'sns', 'account', 'help']);

export const CORE_SHELL_ROUTE_STATUS = Object.freeze({
  unknownRoute: 404,
  flagOff: 404,
  sessionUnverified: 403,
  accountInactive: 403,
  resourceDenied: 403,
});

export function authorizeCoreShellRoute({
  routeId,
  verifiedSession,
  account,
  resourcePermission,
} = {}) {
  if (!CORE_SHELL_ROUTE_IDS.has(routeId)) {
    return { ...DENY, phase: 'route', code: 'CORE_SHELL_ROUTE_NOT_FOUND', httpStatus: CORE_SHELL_ROUTE_STATUS.unknownRoute, routeId: routeId || null };
  }
  if (!verifiedSession || verifiedSession.signatureVerified !== true || verifiedSession.expired === true) {
    return { ...DENY, phase: 'identity', code: 'CORE_SHELL_SESSION_UNVERIFIED', httpStatus: CORE_SHELL_ROUTE_STATUS.sessionUnverified, routeId };
  }
  if (!account || account.status !== 'active') {
    return { ...DENY, phase: 'account', code: 'CORE_SHELL_ACCOUNT_INACTIVE', httpStatus: CORE_SHELL_ROUTE_STATUS.accountInactive, routeId };
  }
  if (!resourcePermission || resourcePermission.allowed !== true) {
    return { ...DENY, phase: 'resource', code: 'CORE_SHELL_RESOURCE_DENIED', httpStatus: CORE_SHELL_ROUTE_STATUS.resourceDenied, routeId };
  }
  return { ok: true, decision: 'authorized', serverAuthorized: true, phase: 'server-route', routeId };
}

export function selectCoreShellRoute({ serverDecision, flagDecision } = {}) {
  if (!serverDecision || serverDecision.ok !== true) return serverDecision || { ...DENY, code: 'CORE_SHELL_SERVER_DECISION_MISSING' };
  if (!flagDecision || flagDecision.decision !== 'enabled') {
    return { ok: false, decision: flagDecision?.decision || 'unknown', serverAuthorized: true, phase: 'flag', code: 'CORE_SHELL_ROUTE_FLAG_OFF', httpStatus: CORE_SHELL_ROUTE_STATUS.flagOff, routeId: serverDecision.routeId };
  }
  return { ok: true, decision: 'enabled', serverAuthorized: true, phase: 'route', routeId: serverDecision.routeId };
}

export function createCoreShellRouteResponse({ routeId, serverDecision, flagDecision } = {}) {
  const selected = selectCoreShellRoute({ serverDecision, flagDecision });
  if (selected.ok === true) return { status: 200, exposeRoute: true, routeId: selected.routeId, cacheControl: 'private, no-store' };
  return {
    status: selected.httpStatus || CORE_SHELL_ROUTE_STATUS.unknownRoute,
    exposeRoute: false,
    routeId: routeId || selected.routeId || null,
    code: selected.code || 'CORE_SHELL_ROUTE_DENIED',
    cacheControl: 'private, no-store',
    doNotPrefetch: true,
  };
}
