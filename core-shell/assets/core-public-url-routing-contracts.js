/*
 * WP-098 Public URL and Routing Core.
 *
 * This is an unloaded, framework-free route registry and compatibility resolver. It preserves the
 * WP-000 current public route snapshot, returns redirect candidates instead of applying redirects,
 * and requires server-side resource/privacy proof before a redirect or canonical metadata decision.
 * It has no DOM, browser history, network, storage, Supabase, current-route, Market, or PiXiEEDraw
 * dependency.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

export const PUBLIC_URL_ROUTING_SCHEMA_VERSION = 1;
export const ROUTE_REGISTRY_VERSION = 1;

export const PUBLIC_URL_FLAGS = Object.freeze({
  read: 'public-url-read',
  resolve: 'public-url-resolve',
  redirect: 'public-url-redirect',
  metadata: 'public-url-metadata',
  legacyAdapter: 'public-url-legacy-adapter',
});
export const PUBLIC_URL_FLAG_NAMES = Object.freeze(Object.values(PUBLIC_URL_FLAGS));

export const ROUTE_KINDS = Object.freeze(['STATIC', 'DYNAMIC_PUBLIC', 'LEGACY_COMPAT', 'VERIFICATION_FILE', 'PRIVATE_STATIC', 'FUTURE']);
export const ROUTE_VISIBILITIES = Object.freeze(['PUBLIC', 'UNLISTED', 'PRIVATE', 'MISSING', 'TRASHED', 'QUARANTINED']);
export const ROUTE_RESOLUTION_STATES = Object.freeze(['CURRENT', 'CANONICAL', 'LEGACY_MATCH', 'REDIRECT_CANDIDATE', 'NOT_FOUND', 'FORBIDDEN', 'UNAVAILABLE']);
export const ROUTE_REDIRECT_STATUSES = Object.freeze(['SHADOW', 'PROVEN', 'BLOCKED', 'DISABLED']);

export const ROUTE_LIMITS = Object.freeze({
  id: 128,
  path: 512,
  queryKey: 64,
  queryValue: 512,
  metadataTitle: 160,
  metadataDescription: 512,
  queryParams: 16,
  redirectChain: 4,
  currentSnapshotRoutes: 51,
});

const CURRENT_ROUTE_DATA = Object.freeze([
  ['/account/admin.html', 'account/admin.html', 'PRIVATE_STATIC'],
  ['/account/', 'account/index.html', 'PRIVATE_STATIC'],
  ['/account-deletion/', 'account-deletion/index.html', 'PRIVATE_STATIC'],
  ['/community/', 'community/index.html', 'STATIC'],
  ['/contact/', 'contact/index.html', 'STATIC'],
  ['/events/', 'events/index.html', 'STATIC'],
  ['/glossary/', 'glossary/index.html', 'STATIC'],
  ['/google10107469bdcc60fa.html', 'google10107469bdcc60fa.html', 'VERIFICATION_FILE'],
  ['/google92ae386aca6917c9.html', 'google92ae386aca6917c9.html', 'VERIFICATION_FILE'],
  ['/googlee776c49d223e1a38.html', 'googlee776c49d223e1a38.html', 'VERIFICATION_FILE'],
  ['/help/', 'help/index.html', 'STATIC'],
  ['/', 'index.html', 'STATIC'],
  ['/legal/', 'legal/index.html', 'STATIC'],
  ['/maoitu/game.html', 'maoitu/game.html', 'STATIC'],
  ['/maoitu/', 'maoitu/index.html', 'STATIC'],
  ['/market/about.html', 'market/about.html', 'STATIC'],
  ['/market/help.html', 'market/help.html', 'STATIC'],
  ['/market/', 'market/index.html', 'STATIC'],
  ['/market/item.html', 'market/item.html', 'LEGACY_COMPAT'],
  ['/market/items/919d97bc-cbd5-4a4d-aeee-c658759a97f3/', 'market/items/919d97bc-cbd5-4a4d-aeee-c658759a97f3/index.html', 'DYNAMIC_PUBLIC'],
  ['/market/items/c4a1dc20-fcef-4acb-bd30-cd5e6a69920f/', 'market/items/c4a1dc20-fcef-4acb-bd30-cd5e6a69920f/index.html', 'DYNAMIC_PUBLIC'],
  ['/market/items/e232a878-dc00-4dd7-b648-bb6a5b37eb5c/', 'market/items/e232a878-dc00-4dd7-b648-bb6a5b37eb5c/index.html', 'DYNAMIC_PUBLIC'],
  ['/market/items/ef0597f1-2b4e-4c96-9556-d55fd286393a/', 'market/items/ef0597f1-2b4e-4c96-9556-d55fd286393a/index.html', 'DYNAMIC_PUBLIC'],
  ['/market/review.html', 'market/review.html', 'PRIVATE_STATIC'],
  ['/market/sell.html', 'market/sell.html', 'PRIVATE_STATIC'],
  ['/market/seller.html', 'market/seller.html', 'PRIVATE_STATIC'],
  ['/notes/', 'notes/index.html', 'STATIC'],
  ['/notice/', 'notice/index.html', 'STATIC'],
  ['/pixfind/', 'pixfind/index.html', 'STATIC'],
  ['/pixfind/marker-editor.html', 'pixfind/marker-editor.html', 'PRIVATE_STATIC'],
  ['/pixfind/puzzles/pixfind-45be2f57-5271-4389-8cdf-85d56714a52b/', 'pixfind/puzzles/pixfind-45be2f57-5271-4389-8cdf-85d56714a52b/index.html', 'LEGACY_COMPAT'],
  ['/pixfind/puzzles/pixfind-9e791ac4-820b-434f-9b58-3075d4990fe3/', 'pixfind/puzzles/pixfind-9e791ac4-820b-434f-9b58-3075d4990fe3/index.html', 'LEGACY_COMPAT'],
  ['/pixfind/puzzles/pixfind-ho-a90bc7c5-e055-447c-b67f-d0b9fa61e3fa/', 'pixfind/puzzles/pixfind-ho-a90bc7c5-e055-447c-b67f-d0b9fa61e3fa/index.html', 'LEGACY_COMPAT'],
  ['/pixfind/puzzles/pixfind-ho-e52df997-0fc7-4de9-a0d6-2f9b57454bdb/', 'pixfind/puzzles/pixfind-ho-e52df997-0fc7-4de9-a0d6-2f9b57454bdb/index.html', 'LEGACY_COMPAT'],
  ['/pixfind/puzzles/pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70/', 'pixfind/puzzles/pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70/index.html', 'LEGACY_COMPAT'],
  ['/pixiedraw/', 'pixiedraw/index.html', 'STATIC'],
  ['/pixiee-lens/', 'pixiee-lens/index.html', 'STATIC'],
  ['/portfolio/', 'portfolio/index.html', 'STATIC'],
  ['/post/', 'post/index.html', 'STATIC'],
  ['/privacy/', 'privacy/index.html', 'STATIC'],
  ['/projects/', 'projects/index.html', 'STATIC'],
  ['/projects/maoitu/', 'projects/maoitu/index.html', 'STATIC'],
  ['/projects/pixfind/', 'projects/pixfind/index.html', 'STATIC'],
  ['/projects/pixiedraw/', 'projects/pixiedraw/index.html', 'STATIC'],
  ['/projects/pixiee-lens/', 'projects/pixiee-lens/index.html', 'STATIC'],
  ['/projects/qr-maker/', 'projects/qr-maker/index.html', 'STATIC'],
  ['/q/1/', 'q/1/index.html', 'STATIC'],
  ['/q/', 'q/index.html', 'STATIC'],
  ['/qr/', 'qr/index.html', 'STATIC'],
  ['/qr-maker/', 'qr-maker/index.html', 'STATIC'],
  ['/terms/', 'terms/index.html', 'STATIC'],
]);

function freezeRoute(route) {
  return Object.freeze({
    routeId: route.routeId,
    path: route.path,
    source: route.source,
    kind: route.kind,
    visibility: route.visibility || 'PUBLIC',
    requiresAuth: route.requiresAuth === true,
    redirectAllowed: route.redirectAllowed !== false,
    canonicalPath: route.canonicalPath || route.path,
    metadataKey: route.metadataKey || `route.${route.routeId}.metadata`,
    resourceType: route.resourceType || null,
    legacy: route.legacy === true,
  });
}

export const CURRENT_ROUTE_SNAPSHOT = Object.freeze(CURRENT_ROUTE_DATA.map(([path, source, kind], index) => freezeRoute({
  routeId: `current-${String(index + 1).padStart(2, '0')}`,
  path,
  source,
  kind,
  requiresAuth: kind === 'PRIVATE_STATIC',
  redirectAllowed: kind !== 'PRIVATE_STATIC',
  legacy: kind === 'LEGACY_COMPAT',
})));

export const ROUTE_CATALOG = Object.freeze([
  ...CURRENT_ROUTE_SNAPSHOT,
  freezeRoute({ routeId: 'market-item-canonical', path: '/market/items/:itemId/', source: 'market/items/:itemId/index.html', kind: 'DYNAMIC_PUBLIC', resourceType: 'MARKET_PRODUCT', canonicalPath: '/market/items/:itemId/' }),
  freezeRoute({ routeId: 'market-item-legacy-query', path: '/market/item.html', source: 'market/item.html', kind: 'LEGACY_COMPAT', resourceType: 'MARKET_PRODUCT', canonicalPath: '/market/items/:itemId/', legacy: true }),
  freezeRoute({ routeId: 'pixfind-puzzle-legacy', path: '/pixfind/puzzles/:puzzleId/', source: 'pixfind/puzzles/:puzzleId/index.html', kind: 'LEGACY_COMPAT', resourceType: 'PIXFIND_PUZZLE', canonicalPath: '/pixfind/?puzzle=:puzzleId', legacy: true }),
  freezeRoute({ routeId: 'pixfind-puzzle-canonical-query', path: '/pixfind/', source: 'pixfind/index.html', kind: 'DYNAMIC_PUBLIC', resourceType: 'PIXFIND_PUZZLE', canonicalPath: '/pixfind/?puzzle=:puzzleId' }),
  freezeRoute({ routeId: 'pixfind-puzzle-index-query', path: '/pixfind/index.html', source: 'pixfind/index.html', kind: 'LEGACY_COMPAT', resourceType: 'PIXFIND_PUZZLE', canonicalPath: '/pixfind/?puzzle=:puzzleId', legacy: true }),
  freezeRoute({ routeId: 'pixiedraw-project-query', path: '/pixiedraw/', source: 'pixiedraw/index.html', kind: 'DYNAMIC_PUBLIC', resourceType: 'PROJECT', canonicalPath: '/pixiedraw/?project=:projectId' }),
  freezeRoute({ routeId: 'post-detail-query', path: '/post/', source: 'post/index.html', kind: 'DYNAMIC_PUBLIC', resourceType: 'SOCIAL_POST', canonicalPath: '/post/?id=:postId' }),
  freezeRoute({ routeId: 'post-detail-path', path: '/posts/:postId/', source: 'post/index.html', kind: 'LEGACY_COMPAT', resourceType: 'SOCIAL_POST', canonicalPath: '/post/?id=:postId', legacy: true }),
]);

export const ROUTE_STORAGE_BOUNDARY = Object.freeze({
  registry: 'versioned-route-and-compatibility-metadata',
  resolver: 'server-filtered-reference-and-canonical-path-decision',
  metadata: 'public-safe-title-description-canonical-and-robots-only',
  excluded: Object.freeze(['private-project-body', 'purchase-data', 'entitlement-data', 'license-body', 'royalty-ledger', 'commission-body', 'jwt', 'session-token', 'secret', 'email', 'payment-card', 'raw-pixel', 'audio-bytes', 'pxd-bytes', 'pixipackage-bytes']),
});

const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const MARKET_ID = new RegExp(`^${UUID}$`, 'iu');
const PUZZLE_ID = new RegExp(`^pixfind-(?:(?:ho|sd)-)?${UUID}$`, 'iu');

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function fail(code, message, field = null, metadata = {}) {
  throw Object.assign(new Error(message), { code, field, metadata });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, field, maximum = ROUTE_LIMITS.id, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) fail('ROUTING_VALUE_INVALID', `${field} must be bounded text.`, field);
  const result = value.normalize('NFC').trim();
  if (!allowEmpty && !result) fail('ROUTING_VALUE_INVALID', `${field} must not be empty.`, field);
  return result;
}

function typedId(value, field) {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail('ROUTING_TYPED_ID_INVALID', `${field} is not a stable ID.`, field);
  return result;
}

function assertKeys(value, keys, field) {
  if (!isObject(value)) fail('ROUTING_OBJECT_INVALID', `${field} must be an object.`, field);
  for (const key of Object.keys(value)) {
    if (PROTOTYPE_KEYS.has(key)) fail('ROUTING_PROTOTYPE_POLLUTION', `${field}.${key} is forbidden.`, `${field}.${key}`);
    if (!keys.has(key)) fail('ROUTING_UNKNOWN_FIELD', `${field}.${key} is not part of the contract.`, `${field}.${key}`);
  }
}

function diagnostic(code, message, field = null, metadata = {}) {
  return { code, severity: 'error', message, field, metadata: clone(metadata) };
}

function operationFailure(error, fallbackCode) {
  return { ok: false, diagnostics: [diagnostic(error.code || fallbackCode, error.message || 'Routing operation failed.', error.field || null, error.metadata || {})] };
}

function serverAllow(decision, code, expected, authorizationEvaluator) {
  if (typeof authorizationEvaluator !== 'function') fail(code, 'Routing requires a server-owned Authorization evaluator.');
  const proof = resolveAuthorizationProofSync({
    expected: {
      ...expected,
      principalId: expected.principalId ?? decision?.principalId ?? null,
      tenantId: expected.tenantId ?? decision?.tenantId ?? null,
      correlationId: expected.correlationId ?? decision?.correlationId ?? null,
      policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    },
    callerProof: decision,
    authorizationEvaluator: (input) => authorizationEvaluator({ ...input, source: 'server' }),
  });
  if (proof.decision !== 'allow') fail(code, 'Routing AuthorizationProof did not grant the requested operation.');
  return proof;
}

function createDefaultFlagEvaluator() {
  return ({ flagId } = {}) => PUBLIC_URL_FLAG_NAMES.includes(flagId)
    ? { enabled: false, decision: 'disabled', source: 'server', flagId }
    : { enabled: false, decision: 'unknown', source: 'server', code: 'FEATURE_FLAG_UNKNOWN', flagId: flagId || null };
}

function normalizePath(path, field = 'url.pathname') {
  let result = text(path, field, ROUTE_LIMITS.path);
  if (!result.startsWith('/')) result = `/${result}`;
  if (result.includes('\\') || /\/\/(?!$)/u.test(result) || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(result)) fail('ROUTING_PATH_INVALID', 'URL path contains an unsafe segment.', field);
  try {
    result = `/${result.split('/').slice(1).map((segment) => encodeURIComponent(decodeURIComponent(segment))).join('/')}`;
  } catch {
    fail('ROUTING_PATH_INVALID', 'URL path contains malformed encoding.', field);
  }
  return result === '//' ? '/' : result;
}

function normalizeRouteTemplate(path, field) {
  const templated = text(path, field, ROUTE_LIMITS.path).replace(/:([A-Za-z][A-Za-z0-9]*)/gu, (_, key) => {
    return `__ROUTE_PARAM_${key}__`;
  });
  const normalized = normalizePath(templated, field);
  return normalized.replace(/__ROUTE_PARAM_([A-Za-z][A-Za-z0-9]*)__/gu, ':$1');
}

function parseRequestUrl(input, origin) {
  if (typeof input !== 'string' && !(input instanceof URL)) fail('ROUTING_URL_INVALID', 'Route input must be a URL or bounded URL string.');
  let parsed;
  try { parsed = new URL(String(input), origin); } catch { fail('ROUTING_URL_INVALID', 'Route URL cannot be parsed.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail('ROUTING_ORIGIN_INVALID', 'Only HTTP(S) URLs are supported.');
  if (parsed.origin !== origin) fail('ROUTING_ORIGIN_INVALID', 'Cross-origin route resolution is not allowed.');
  const params = new URLSearchParams(parsed.search);
  const query = {};
  let count = 0;
  for (const [key, value] of params.entries()) {
    count += 1;
    if (count > ROUTE_LIMITS.queryParams) fail('ROUTING_QUERY_TOO_LARGE', 'URL query has too many parameters.');
    const safeKey = text(key, 'url.query.key', ROUTE_LIMITS.queryKey);
    const safeValue = text(value, `url.query.${safeKey}`, ROUTE_LIMITS.queryValue, { allowEmpty: true });
    if (Object.prototype.hasOwnProperty.call(query, safeKey)) fail('ROUTING_QUERY_DUPLICATE', 'URL query contains a duplicate key.', safeKey);
    query[safeKey] = safeValue;
  }
  return { origin, pathname: normalizePath(parsed.pathname), rawPathname: parsed.pathname, query, hash: parsed.hash || '' };
}

function routeIdForPath(path) {
  return CURRENT_ROUTE_SNAPSHOT.find((route) => route.path === path)?.routeId || null;
}

function isIndexAlias(path, canonicalPath) {
  return path === `${canonicalPath}index.html` || (canonicalPath === '/' && path === '/index.html');
}

function matchStaticRoute(path) {
  const exact = CURRENT_ROUTE_SNAPSHOT.find((route) => route.path === path);
  if (exact) return { route: exact, trailingSlashVariant: false };
  const indexAlias = CURRENT_ROUTE_SNAPSHOT.find((route) => isIndexAlias(path, route.path) && route.source.endsWith('/index.html'));
  if (indexAlias) return { route: indexAlias, trailingSlashVariant: true };
  if (path !== '/' && path.endsWith('/')) {
    const without = path.slice(0, -1);
    const route = CURRENT_ROUTE_SNAPSHOT.find((candidate) => candidate.path === without);
    if (route) return { route, trailingSlashVariant: true };
  } else if (path !== '/') {
    const withSlash = `${path}/`;
    const route = CURRENT_ROUTE_SNAPSHOT.find((candidate) => candidate.path === withSlash);
    if (route) return { route, trailingSlashVariant: true };
  }
  return null;
}

function templatePath(template, params) {
  return normalizePath(template.replace(/:([A-Za-z][A-Za-z0-9]*)/gu, (_, key) => encodeURIComponent(params[key] || fail('ROUTING_PARAM_MISSING', `Route parameter ${key} is required.`))));
}

function safeQuery(query, allowedKeys) {
  const result = {};
  for (const key of allowedKeys) if (query[key] !== undefined) result[key] = query[key];
  return result;
}

function withQuery(path, query) {
  const entries = Object.entries(query || {});
  if (!entries.length) return path;
  return `${path}?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`;
}

function resourceVisibility(resource) {
  return ROUTE_VISIBILITIES.includes(resource?.visibility) ? resource.visibility : 'MISSING';
}

function ensurePublicResource(resource, permissionDecision, route, resourceId, authorizationEvaluator) {
  const visibility = resourceVisibility(resource);
  if (resource?.exists !== true || visibility === 'MISSING' || visibility === 'TRASHED' || visibility === 'QUARANTINED') fail('ROUTING_RESOURCE_NOT_FOUND', 'Public route resource is not available.');
  if (visibility === 'PUBLIC') return { visibility, public: true };
  if (visibility === 'UNLISTED' || visibility === 'PRIVATE') {
    if (!resource.allowed) {
      if (permissionDecision?.knownPrincipal === true) fail('ROUTING_RESOURCE_FORBIDDEN', 'Resource exists but the server denied route access.');
      fail('ROUTING_RESOURCE_NOT_FOUND', 'Private or unlisted resource is hidden.');
    }
    serverAllow(permissionDecision, 'ROUTING_RESOURCE_PERMISSION_REQUIRED', {
      resourceType: route.resourceType || 'PUBLIC_RESOURCE',
      resourceId,
      action: 'public-url.resource.read',
      capability: 'public-url.resource.read',
    }, authorizationEvaluator);
    return { visibility, public: false, authorized: true };
  }
  fail('ROUTING_RESOURCE_NOT_FOUND', 'Resource is not routeable.');
}

function normalizeMetadata(value) {
  assertKeys(value, new Set(['title', 'description', 'imagePath', 'locale']), 'metadata');
  const result = {
    title: text(value.title || '', 'metadata.title', ROUTE_LIMITS.metadataTitle, { allowEmpty: true }),
    description: text(value.description || '', 'metadata.description', ROUTE_LIMITS.metadataDescription, { allowEmpty: true }),
    imagePath: value.imagePath === null || value.imagePath === undefined ? null : normalizePath(value.imagePath, 'metadata.imagePath'),
    locale: value.locale === null || value.locale === undefined ? 'ja-JP' : text(value.locale, 'metadata.locale', 35),
  };
  if (/[\u0000-\u001f\u007f]/u.test(result.title) || /[\u0000-\u001f\u007f]/u.test(result.description)) fail('ROUTING_METADATA_INVALID', 'Canonical metadata contains control characters.');
  return result;
}

export function validateRouteRecord(route) {
  try {
    assertKeys(route, new Set(['routeId', 'path', 'source', 'kind', 'visibility', 'requiresAuth', 'redirectAllowed', 'canonicalPath', 'metadataKey', 'resourceType', 'legacy']), 'route');
    for (const [field, value] of [['route.requiresAuth', route.requiresAuth], ['route.redirectAllowed', route.redirectAllowed], ['route.legacy', route.legacy]]) {
      if (value !== undefined && typeof value !== 'boolean') fail('ROUTING_ROUTE_FIELD_INVALID', `${field} must be boolean.`, field);
    }
    if (route.resourceType !== undefined && route.resourceType !== null) text(route.resourceType, 'route.resourceType', 64);
    const result = freezeRoute({ ...route, routeId: typedId(route.routeId, 'route.routeId'), path: normalizeRouteTemplate(route.path, 'route.path'), source: text(route.source, 'route.source', ROUTE_LIMITS.path), kind: route.kind, visibility: route.visibility, canonicalPath: normalizeRouteTemplate(route.canonicalPath || route.path, 'route.canonicalPath'), metadataKey: text(route.metadataKey || 'route.metadata', 'route.metadataKey', ROUTE_LIMITS.path) });
    if (!ROUTE_KINDS.includes(result.kind)) fail('ROUTING_ROUTE_KIND_UNSUPPORTED', 'Route kind is unsupported.', 'route.kind');
    if (!ROUTE_VISIBILITIES.includes(result.visibility)) fail('ROUTING_ROUTE_VISIBILITY_INVALID', 'Route visibility is unsupported.', 'route.visibility');
    return { valid: true, value: result, diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic(error.code || 'ROUTING_ROUTE_INVALID', error.message, error.field || null, error.metadata || {})] };
  }
}

export function createPublicUrlRoutingCore({
  origin = 'https://pixieed.jp',
  featureFlagEvaluator = null,
  resourceResolver = null,
  metadataResolver = null,
  redirectProofEvaluator = null,
  authorizationEvaluator = null,
  routeCatalog = ROUTE_CATALOG,
} = {}) {
  origin = text(origin, 'origin', 128).replace(/\/$/u, '');
  const flags = typeof featureFlagEvaluator === 'function' ? featureFlagEvaluator : createDefaultFlagEvaluator();
  const catalog = routeCatalog.map((route) => {
    const valid = validateRouteRecord(route);
    if (!valid.valid) fail('ROUTING_CATALOG_INVALID', 'Route Catalog contains an invalid record.', null, { diagnostics: valid.diagnostics });
    return valid.value;
  });
  const routeById = new Map(catalog.map((route) => [route.routeId, route]));

  const evaluateFlag = ({ flagId, action = 'read' } = {}) => {
    try {
      if (!PUBLIC_URL_FLAG_NAMES.includes(flagId)) fail('FEATURE_FLAG_UNKNOWN', 'Unknown Public URL Feature Flag fails closed.', 'flagId');
      const result = flags({ flagId, action, source: 'server' });
      if (!result || result.source !== 'server') fail('ROUTING_FLAG_UNTRUSTED', 'Public URL Feature Flag decisions must come from the server.', 'flagId');
      if (!result || result.enabled !== true || result.decision !== 'enabled') fail(result?.code === 'FEATURE_FLAG_KILL_SWITCH' || result?.decision === 'kill-switched' ? 'ROUTING_KILL_SWITCH' : 'ROUTING_FLAG_OFF', 'Public URL Feature Flag denied this operation.', 'flagId', { flagId, action, decision: result?.decision || 'unknown' });
      return { ok: true, flag: clone(result) };
    } catch (error) {
      return operationFailure(error, 'ROUTING_FLAG_OFF');
    }
  };
  const requireFlag = (flagId, action) => {
    const result = evaluateFlag({ flagId, action });
    if (result.ok !== true) fail(result.diagnostics[0].code, result.diagnostics[0].message, result.diagnostics[0].field, result.diagnostics[0].metadata);
    return result.flag;
  };

  const resolveResource = ({ route, resourceId, permissionDecision }) => {
    if (typeof resourceResolver !== 'function') fail('ROUTING_RESOURCE_RESOLVER_MISSING', 'Dynamic route resolution requires a server resource resolver.');
    const resource = resourceResolver({ route: clone(route), resourceType: route.resourceType, resourceId, source: 'server' });
    if (!isObject(resource) || resource.source !== 'server') fail('ROUTING_RESOURCE_RESOLVER_UNTRUSTED', 'Resource resolver must return a server decision.');
    const visibility = ensurePublicResource(resource, permissionDecision, route, resourceId, authorizationEvaluator);
    return { resource: clone(resource), visibility };
  };

  const resolve = ({ url, permissionDecision = null, redirectMode = 'shadow' } = {}) => {
    try {
      requireFlag(PUBLIC_URL_FLAGS.read, 'resolve-read');
      requireFlag(PUBLIC_URL_FLAGS.resolve, 'resolve');
      const request = parseRequestUrl(url, origin);
      let route = null;
      let params = {};
      let state = 'NOT_FOUND';
      let resource = null;
      let visibility = 'PUBLIC';
      let canonicalPath = request.pathname;
      let legacy = false;

      const pixfindBasePath = request.pathname === '/pixfind/' || isIndexAlias(request.pathname, '/pixfind/');
      const pixfindQueryId = pixfindBasePath ? request.query.puzzle : undefined;
      if (pixfindQueryId !== undefined) {
        if (request.pathname !== '/pixfind/') requireFlag(PUBLIC_URL_FLAGS.legacyAdapter, 'legacy-pixfind-query');
        if (!PUZZLE_ID.test(pixfindQueryId)) fail('ROUTING_LEGACY_ID_INVALID', 'PiXFiND puzzle query ID is invalid.', 'query.puzzle');
        route = routeById.get(request.pathname === '/pixfind/' ? 'pixfind-puzzle-canonical-query' : 'pixfind-puzzle-index-query');
        params = { puzzleId: pixfindQueryId };
        const resolved = resolveResource({ route, resourceId: pixfindQueryId, permissionDecision });
        resource = resolved.resource; visibility = resolved.visibility.visibility; canonicalPath = withQuery('/pixfind/', { puzzle: pixfindQueryId }); legacy = request.pathname !== '/pixfind/'; state = legacy ? 'LEGACY_MATCH' : 'CANONICAL';
      }

      const pixiedrawBasePath = request.pathname === '/pixiedraw/' || isIndexAlias(request.pathname, '/pixiedraw/');
      const projectId = pixiedrawBasePath ? request.query.project : undefined;
      if (!route && projectId !== undefined) {
        if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(projectId)) fail('ROUTING_TYPED_ID_INVALID', 'PiXiEEDraw project ID is invalid.', 'query.project');
        route = routeById.get('pixiedraw-project-query'); params = { projectId };
        const resolved = resolveResource({ route, resourceId: projectId, permissionDecision });
        resource = resolved.resource; visibility = resolved.visibility.visibility; canonicalPath = withQuery('/pixiedraw/', { project: projectId }); state = 'CANONICAL';
      }

      const postQueryPath = request.pathname === '/post/' || isIndexAlias(request.pathname, '/post/');
      const postQueryId = postQueryPath ? request.query.id : undefined;
      if (!route && postQueryId !== undefined) {
        if (!postQueryId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(postQueryId)) fail('ROUTING_TYPED_ID_INVALID', 'Social post ID is invalid.', 'query.id');
        route = routeById.get('post-detail-query'); params = { postId: postQueryId };
        const resolved = resolveResource({ route, resourceId: postQueryId, permissionDecision });
        resource = resolved.resource; visibility = resolved.visibility.visibility; canonicalPath = withQuery('/post/', { id: postQueryId }); state = 'CANONICAL'; legacy = request.pathname !== '/post/';
      }

      const postPathMatch = request.pathname.match(/^\/posts\/([^/]+)\/?$/u);
      if (!route && postPathMatch) {
        const postId = decodeURIComponent(postPathMatch[1]);
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(postId)) fail('ROUTING_TYPED_ID_INVALID', 'Social post ID is invalid.', 'path');
        route = routeById.get('post-detail-path'); params = { postId };
        const resolved = resolveResource({ route, resourceId: postId, permissionDecision });
        resource = resolved.resource; visibility = resolved.visibility.visibility; canonicalPath = withQuery('/post/', { id: postId }); state = 'LEGACY_MATCH'; legacy = true;
      }

      const marketLegacyId = request.pathname === '/market/item.html' ? request.query.id : null;
      if (marketLegacyId !== undefined && marketLegacyId !== null) {
        requireFlag(PUBLIC_URL_FLAGS.legacyAdapter, 'legacy-market-item');
        if (!MARKET_ID.test(marketLegacyId)) fail('ROUTING_LEGACY_ID_INVALID', 'Legacy Market item ID is invalid.', 'query.id');
        route = routeById.get('market-item-legacy-query');
        params = { itemId: marketLegacyId };
        const resolved = resolveResource({ route, resourceId: marketLegacyId, permissionDecision });
        resource = resolved.resource; visibility = resolved.visibility.visibility; canonicalPath = templatePath('/market/items/:itemId/', params); legacy = true; state = 'LEGACY_MATCH';
      }

      const puzzleMatch = request.pathname.match(/^\/pixfind\/puzzles\/([^/]+)\/?$/u);
      if (!route && puzzleMatch) {
        requireFlag(PUBLIC_URL_FLAGS.legacyAdapter, 'legacy-pixfind-puzzle');
        const puzzleId = decodeURIComponent(puzzleMatch[1]);
        if (!PUZZLE_ID.test(puzzleId)) fail('ROUTING_LEGACY_ID_INVALID', 'Legacy PiXFiND puzzle ID is invalid.', 'path');
        route = routeById.get('pixfind-puzzle-legacy'); params = { puzzleId };
        const resolved = resolveResource({ route, resourceId: puzzleId, permissionDecision });
        resource = resolved.resource; visibility = resolved.visibility.visibility; canonicalPath = withQuery('/pixfind/', { puzzle: puzzleId }); legacy = true; state = 'LEGACY_MATCH';
      }

      const marketMatch = request.pathname.match(/^\/market\/items\/([^/]+)\/?$/u);
      if (!route && marketMatch) {
        const itemId = decodeURIComponent(marketMatch[1]);
        if (!MARKET_ID.test(itemId)) fail('ROUTING_RESOURCE_NOT_FOUND', 'Market item route ID is invalid.');
        route = routeById.get('market-item-canonical'); params = { itemId };
        const resolved = resolveResource({ route, resourceId: itemId, permissionDecision });
        resource = resolved.resource; visibility = resolved.visibility.visibility; canonicalPath = templatePath('/market/items/:itemId/', params); state = 'CANONICAL';
      }

      if (!route) {
        const matched = matchStaticRoute(request.pathname);
        if (matched) {
          route = matched.route; canonicalPath = route.canonicalPath; visibility = route.visibility;
          if (route.requiresAuth) {
            serverAllow(permissionDecision, 'ROUTING_PRIVATE_ROUTE_PERMISSION_REQUIRED', {
              resourceType: 'PUBLIC_ROUTE',
              resourceId: route.routeId,
              action: 'public-url.route.read',
              capability: 'public-url.route.read',
            }, authorizationEvaluator);
            visibility = 'PRIVATE';
          }
          state = route.legacy ? 'LEGACY_MATCH' : 'CURRENT';
          if (matched.trailingSlashVariant) state = 'REDIRECT_CANDIDATE';
        }
      }

      if (!route) return { ok: false, state: 'NOT_FOUND', status: 404, code: 'ROUTING_ROUTE_NOT_FOUND', currentPathPreserved: true, routeId: null, canonicalUrl: null, redirect: null };
      const canonicalUrl = `${origin}${canonicalPath}`;
      const needsRedirect = request.pathname !== canonicalPath.split('?')[0] || (legacy && (request.query.id !== undefined || request.pathname.startsWith('/pixfind/puzzles/')));
      let redirect = null;
      if (needsRedirect && route.redirectAllowed !== false && visibility === 'PUBLIC') {
        const candidate = { status: 'SHADOW', statusCode: 308, from: `${request.pathname}${new URLSearchParams(request.query).toString() ? `?${new URLSearchParams(request.query).toString()}` : ''}`, to: canonicalUrl, routeId: route.routeId, reason: legacy ? 'LEGACY_CANONICALIZATION' : 'TRAILING_SLASH_CANONICALIZATION' };
        if (redirectMode === 'apply') {
          requireFlag(PUBLIC_URL_FLAGS.redirect, 'redirect-apply');
          if (typeof redirectProofEvaluator !== 'function') fail('ROUTING_REDIRECT_PROOF_MISSING', 'A redirect requires a server canonical/privacy proof.');
          const proof = redirectProofEvaluator({ candidate: clone(candidate), resource: clone(resource), source: 'server' });
          if (!proof || proof.source !== 'server' || proof.canonicalVerified !== true || proof.privacyVerified !== true) fail('ROUTING_REDIRECT_PROOF_FAILED', 'Redirect canonical/privacy proof was not granted.');
          redirect = { ...candidate, status: 'PROVEN', proof: 'server-canonical-and-privacy-verified' };
        } else {
          redirect = candidate;
        }
        state = 'REDIRECT_CANDIDATE';
      }
      const status = visibility === 'PRIVATE' && !permissionDecision ? 403 : 200;
      return { ok: true, state, status, routeId: route.routeId, route: clone(route), params, resource, visibility, canonicalPath, canonicalUrl, redirect, currentPathPreserved: redirect?.status !== 'PROVEN' };
    } catch (error) {
      return operationFailure(error, 'ROUTING_RESOLUTION_FAILED');
    }
  };

  const buildCanonicalMetadata = ({ resolution, permissionDecision = null } = {}) => {
    try {
      requireFlag(PUBLIC_URL_FLAGS.metadata, 'metadata');
      if (!resolution || resolution.ok !== true || !resolution.route) fail('ROUTING_METADATA_RESOLUTION_REQUIRED', 'Canonical metadata requires a successful route resolution.');
      if (resolution.visibility !== 'PUBLIC') {
        return { ok: true, routeId: resolution.routeId, canonicalUrl: null, robots: 'noindex,nofollow', cacheControl: 'private,no-store', title: '', description: '', openGraph: null, privacy: 'non-public' };
      }
      let metadata = { title: '', description: '', imagePath: null, locale: 'ja-JP' };
      if (typeof metadataResolver === 'function') {
        const raw = metadataResolver({ route: clone(resolution.route), resource: clone(resolution.resource), permissionDecision: clone(permissionDecision), source: 'server' });
        if (!isObject(raw) || raw.source !== 'server') fail('ROUTING_METADATA_UNTRUSTED', 'Metadata resolver must return a server result.');
        const { source: _source, ...metadataPayload } = raw;
        metadata = normalizeMetadata(metadataPayload);
      } else if (resolution.route.metadataKey) {
        metadata = normalizeMetadata({ title: resolution.route.metadataKey, description: '', imagePath: null, locale: 'ja-JP' });
      }
      return {
        ok: true,
        routeId: resolution.routeId,
        canonicalUrl: resolution.canonicalUrl,
        robots: 'index,follow',
        cacheControl: 'public,max-age=60,must-revalidate',
        title: metadata.title,
        description: metadata.description,
        locale: metadata.locale,
        openGraph: { url: resolution.canonicalUrl, title: metadata.title, description: metadata.description, imagePath: metadata.imagePath },
        privacy: 'public-safe',
      };
    } catch (error) {
      return operationFailure(error, 'ROUTING_METADATA_FAILED');
    }
  };

  const prepareRedirect = ({ resolution, permissionDecision = null } = {}) => {
    try {
      if (!resolution?.redirect) return { ok: true, status: 'NONE', redirect: null };
      if (resolution.redirect.status === 'PROVEN') return { ok: true, status: 'PROVEN', redirect: clone(resolution.redirect) };
      serverAllow(permissionDecision, 'ROUTING_REDIRECT_PERMISSION_REQUIRED', {
        resourceType: 'PUBLIC_REDIRECT',
        resourceId: resolution.route?.routeId || 'public-route',
        action: 'public-url.redirect.prepare',
        capability: 'public-url.redirect.prepare',
      }, authorizationEvaluator);
      requireFlag(PUBLIC_URL_FLAGS.redirect, 'redirect-prepare');
      if (typeof redirectProofEvaluator !== 'function') fail('ROUTING_REDIRECT_PROOF_MISSING', 'Redirect proof adapter is required.');
      const proof = redirectProofEvaluator({ candidate: clone(resolution.redirect), resource: clone(resolution.resource), source: 'server' });
      if (!proof || proof.source !== 'server' || proof.canonicalVerified !== true || proof.privacyVerified !== true) fail('ROUTING_REDIRECT_PROOF_FAILED', 'Redirect proof failed.');
      return { ok: true, status: 'PROVEN', redirect: { ...resolution.redirect, status: 'PROVEN', proof: 'server-canonical-and-privacy-verified' } };
    } catch (error) {
      return operationFailure(error, 'ROUTING_REDIRECT_PREPARE_FAILED');
    }
  };

  const rollback = ({ reason = 'kill-switch-or-compatibility-mismatch' } = {}) => ({
    ok: true,
    scope: 'public-url-routing',
    action: 'KEEP_CURRENT_ROUTE',
    redirectApplied: false,
    publicMetadataCutover: false,
    disabledFlags: [...PUBLIC_URL_FLAG_NAMES],
    reason: text(reason, 'reason', 256),
    recoverable: true,
  });

  return Object.freeze({
    evaluateFlag,
    resolve,
    buildCanonicalMetadata,
    prepareRedirect,
    rollback,
    snapshot: () => ({ schemaVersion: PUBLIC_URL_ROUTING_SCHEMA_VERSION, registryVersion: ROUTE_REGISTRY_VERSION, routeCount: catalog.length, currentSnapshotCount: CURRENT_ROUTE_SNAPSHOT.length, currentRoutes: CURRENT_ROUTE_SNAPSHOT.map(clone), catalog: catalog.map(clone), flags: PUBLIC_URL_FLAGS, storageBoundary: ROUTE_STORAGE_BOUNDARY }),
  });
}

export const PUBLIC_URL_ROUTING_CONTRACT = Object.freeze({
  schemaVersion: PUBLIC_URL_ROUTING_SCHEMA_VERSION,
  registryVersion: ROUTE_REGISTRY_VERSION,
  currentRouteCount: CURRENT_ROUTE_SNAPSHOT.length,
  flags: PUBLIC_URL_FLAGS,
  routeKinds: ROUTE_KINDS,
  visibilities: ROUTE_VISIBILITIES,
  resolutionStates: ROUTE_RESOLUTION_STATES,
  redirectStatuses: ROUTE_REDIRECT_STATUSES,
  limits: ROUTE_LIMITS,
  storageBoundary: ROUTE_STORAGE_BOUNDARY,
});
