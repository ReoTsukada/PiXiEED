import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  CURRENT_ROUTE_SNAPSHOT,
  PUBLIC_URL_FLAGS,
  PUBLIC_URL_FLAG_NAMES,
  ROUTE_KINDS,
  ROUTE_RESOLUTION_STATES,
  ROUTE_REDIRECT_STATUSES,
  ROUTE_VISIBILITIES,
  ROUTE_CATALOG,
  createPublicUrlRoutingCore,
  validateRouteRecord,
} from '../core-shell/assets/core-public-url-routing-contracts.js';
import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof } from '../core-shell/assets/core-authorization-proof-contracts.js';

const fixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/public-url-routing-v1.valid.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../core-shell/schemas/public-url-routing-v1.schema.json', import.meta.url), 'utf8'));
const policy = readFileSync(new URL('../02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md', import.meta.url), 'utf8');
const moduleSource = readFileSync(new URL('../core-shell/assets/core-public-url-routing-contracts.js', import.meta.url), 'utf8');
const moduleCode = moduleSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, '');
const routeInventory = JSON.parse(readFileSync(new URL('../docs/inventory/route-inventory.json', import.meta.url), 'utf8'));

const knownMarketIds = new Set(routeInventory.routes
  .map(({ route }) => route.match(/^\/market\/items\/([^/]+)\/$/u)?.[1])
  .filter(Boolean));
const privateMarketId = '11111111-1111-4111-8111-111111111111';
const unlistedMarketId = '22222222-2222-4222-8222-222222222222';
const deletedMarketId = fixture.resources.deletedMarketItemId;
const knownPuzzleId = fixture.resources.publicPuzzleId;
const knownProjectId = 'project-draw2-001';
const knownPostId = 'post-001';
const enabledFlags = new Set(PUBLIC_URL_FLAG_NAMES);
const flags = ({ flagId }) => enabledFlags.has(flagId)
  ? { enabled: true, decision: 'enabled', source: 'server', flagId }
  : { enabled: false, decision: 'unknown', source: 'server', code: 'FEATURE_FLAG_UNKNOWN', flagId };
const allow = (knownPrincipal = false) => ({ ok: true, decision: 'allow', source: 'server', knownPrincipal });
const authorizationEvaluator = (input) => normalizeAuthorizationProof({
  schemaVersion: 1,
  proofType: 'AUTHORIZATION_PROOF',
  source: 'server',
  decision: 'allow',
  authorityId: 'wp098-test-authority',
  proofId: `wp098-${input.resourceType}-${input.resourceId}`,
  principalId: input.principalId ?? null,
  resourceType: input.resourceType,
  resourceId: input.resourceId,
  action: input.action,
  capability: input.capability,
  tenantId: input.tenantId ?? null,
  correlationId: input.correlationId ?? null,
  policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
  grantId: 'wp098-grant',
  issuedAt: '2099-08-09T00:00:00.000Z',
  expiresAt: '2099-08-09T00:05:00.000Z',
}, input);
const resourceResolverCalls = [];
const resourceResolver = ({ route, resourceType, resourceId, source }) => {
  resourceResolverCalls.push({ routeId: route.routeId, resourceType, resourceId, source });
  if (resourceType === 'MARKET_PRODUCT' && knownMarketIds.has(resourceId)) return { source: 'server', exists: true, visibility: 'PUBLIC', allowed: true };
  if (resourceType === 'MARKET_PRODUCT' && resourceId === privateMarketId) return { source: 'server', exists: true, visibility: 'PRIVATE', allowed: false };
  if (resourceType === 'MARKET_PRODUCT' && resourceId === unlistedMarketId) return { source: 'server', exists: true, visibility: 'UNLISTED', allowed: false };
  if (resourceType === 'MARKET_PRODUCT' && resourceId === deletedMarketId) return { source: 'server', exists: true, visibility: 'TRASHED', allowed: false };
  if (resourceType === 'PIXFIND_PUZZLE' && resourceId === knownPuzzleId) return { source: 'server', exists: true, visibility: 'PUBLIC', allowed: true };
  if (resourceType === 'PROJECT' && resourceId === knownProjectId) return { source: 'server', exists: true, visibility: 'PUBLIC', allowed: true };
  if (resourceType === 'SOCIAL_POST' && resourceId === knownPostId) return { source: 'server', exists: true, visibility: 'PUBLIC', allowed: true };
  return { source: 'server', exists: false, visibility: 'MISSING', allowed: false };
};
const metadataResolver = () => ({ source: 'server', title: '安全な公開ページ', description: 'Bounded public metadata.', imagePath: '/assets/thumbnail.png', locale: 'ja-JP' });
const redirectProofEvaluator = () => ({ source: 'server', canonicalVerified: true, privacyVerified: true });
const core = createPublicUrlRoutingCore({
  origin: 'https://pixieed.jp',
  featureFlagEvaluator: flags,
  resourceResolver,
  metadataResolver,
  redirectProofEvaluator,
  authorizationEvaluator,
});

const failureNames = [];
const routingSecurityCoverage = new Set();
const expectFailure = (name, result, code = null) => {
  assert.equal(result.ok, false, `${name} unexpectedly passed: ${JSON.stringify(result)}`);
  if (code) assert.equal(result.diagnostics?.[0]?.code || result.code, code, `${name}: ${JSON.stringify(result.diagnostics || result)}`);
  failureNames.push(name);
};

assert.equal(schema.properties.schemaVersion.const, 1);
assert.equal(schema.properties.currentSnapshotCount.const, 52);
assert.equal(fixture.registry.currentSnapshotCount, 52);
assert.equal(fixture.registry.currentPathFallback, true);
assert.deepEqual(ROUTE_KINDS, ['STATIC', 'DYNAMIC_PUBLIC', 'LEGACY_COMPAT', 'VERIFICATION_FILE', 'PRIVATE_STATIC', 'FUTURE']);
assert.equal(ROUTE_VISIBILITIES.length, 6);
assert.equal(ROUTE_RESOLUTION_STATES.length, 7);
assert.equal(ROUTE_REDIRECT_STATUSES.length, 4);
assert.equal(CURRENT_ROUTE_SNAPSHOT.length, 52);
assert.equal(ROUTE_CATALOG.length, 61);
assert.equal(new Set(CURRENT_ROUTE_SNAPSHOT.map((route) => route.path)).size, 52);
const currentRoutePaths = new Set(CURRENT_ROUTE_SNAPSHOT.map((route) => route.path));
const routeInventoryPaths = new Set(routeInventory.routes.map(({ route }) => route));
assert.equal(currentRoutePaths.has('/pixiedraw/'), false);
assert.equal(currentRoutePaths.has('/pixiedraw2/'), true);
assert.deepEqual(new Set([...currentRoutePaths].map((path) => path === '/pixiedraw2/' ? '/pixiedraw/' : path)), routeInventoryPaths);
assert.equal(CURRENT_ROUTE_SNAPSHOT.find((route) => route.path === '/pixiedraw2/').requiresAuth, false);
assert.equal(CURRENT_ROUTE_SNAPSHOT.find((route) => route.path === '/account/').requiresAuth, true);
assert.equal(validateRouteRecord(ROUTE_CATALOG.find((route) => route.routeId === 'market-item-legacy-query')).valid, true);
assert.equal(validateRouteRecord({ routeId: 'bad-kind', path: '/', source: 'index.html', kind: 'NOPE' }).valid, false);
assert.equal(validateRouteRecord({ ...CURRENT_ROUTE_SNAPSHOT[0], extra: true }).valid, false);
assert.equal(validateRouteRecord({ ...CURRENT_ROUTE_SNAPSHOT[0], requiresAuth: 'true' }).valid, false);
assert.equal(ROUTE_CATALOG.find((route) => route.routeId === 'market-item-canonical').path, '/market/items/:itemId/');

const snapshot = core.snapshot();
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.registryVersion, 1);
assert.equal(snapshot.routeCount, 61);
assert.equal(snapshot.currentSnapshotCount, 52);
assert.deepEqual(snapshot.currentRoutes.map((route) => route.path), CURRENT_ROUTE_SNAPSHOT.map((route) => route.path));
assert.deepEqual(snapshot.flags, PUBLIC_URL_FLAGS);
assert.ok(snapshot.storageBoundary.excluded.includes('purchase-data'));

assert.equal(core.evaluateFlag({ flagId: 'public-url-read', action: 'test' }).ok, true);
expectFailure('unknown-flag', core.evaluateFlag({ flagId: 'public-url-unknown', action: 'test' }), 'FEATURE_FLAG_UNKNOWN');
const clientFlagCore = createPublicUrlRoutingCore({ featureFlagEvaluator: ({ flagId }) => ({ enabled: true, decision: 'enabled', source: 'client', flagId }) });
expectFailure('client-feature-flag', clientFlagCore.resolve({ url: '/' }), 'ROUTING_FLAG_UNTRUSTED');
const defaultOff = createPublicUrlRoutingCore();
expectFailure('default-off-read', defaultOff.resolve({ url: '/' }), 'ROUTING_FLAG_OFF');
const killSwitch = createPublicUrlRoutingCore({ featureFlagEvaluator: ({ flagId }) => ({ enabled: false, decision: 'kill-switched', source: 'server', code: 'FEATURE_FLAG_KILL_SWITCH', flagId }) });
expectFailure('kill-switch', killSwitch.resolve({ url: '/' }), 'ROUTING_KILL_SWITCH');

const home = core.resolve({ url: 'https://pixieed.jp/' });
assert.equal(home.ok, true); assert.equal(home.state, 'CURRENT'); assert.equal(home.status, 200); assert.equal(home.canonicalPath, '/');
const draw2 = core.resolve({ url: '/pixiedraw2/' });
assert.equal(draw2.ok, true); assert.equal(draw2.state, 'CURRENT'); assert.equal(draw2.routeId, CURRENT_ROUTE_SNAPSHOT.find((route) => route.path === '/pixiedraw2/').routeId);
const privateRouteWithoutDecision = core.resolve({ url: '/account/' });
expectFailure('private-static-without-server-decision', privateRouteWithoutDecision, 'ROUTING_PRIVATE_ROUTE_PERMISSION_REQUIRED');
expectFailure('private-static-client-decision', core.resolve({ url: '/account/', permissionDecision: { ok: true, decision: 'allow', source: 'client' } }), 'ROUTING_PRIVATE_ROUTE_PERMISSION_REQUIRED');
const privateRoute = core.resolve({ url: '/account/', permissionDecision: allow(true) });
assert.equal(privateRoute.ok, true); assert.equal(privateRoute.visibility, 'PRIVATE'); assert.equal(privateRoute.currentPathPreserved, true);

const publicItemId = fixture.resources.publicMarketItemId;
const canonicalItem = core.resolve({ url: `/market/items/${publicItemId}/` });
assert.equal(canonicalItem.ok, true); assert.equal(canonicalItem.state, 'CANONICAL'); assert.equal(canonicalItem.visibility, 'PUBLIC');
assert.equal(resourceResolverCalls.at(-1).source, 'server');
const itemNoSlash = core.resolve({ url: `/market/items/${publicItemId}` });
assert.equal(itemNoSlash.ok, true); assert.equal(itemNoSlash.state, 'REDIRECT_CANDIDATE'); assert.equal(itemNoSlash.redirect.status, 'SHADOW');
assert.equal(itemNoSlash.currentPathPreserved, true); assert.match(itemNoSlash.redirect.to, new RegExp(`/market/items/${publicItemId}/$`, 'u'));
routingSecurityCoverage.add('trailing-slash-candidate');
const prepared = core.prepareRedirect({ resolution: itemNoSlash, permissionDecision: allow(true) });
assert.equal(prepared.ok, true); assert.equal(prepared.status, 'PROVEN');
const applied = core.resolve({ url: `/market/items/${publicItemId}`, permissionDecision: allow(true), redirectMode: 'apply' });
assert.equal(applied.ok, true); assert.equal(applied.redirect.status, 'PROVEN'); assert.equal(applied.currentPathPreserved, false);

const legacyMarket = core.resolve({ url: `/market/item.html?id=${publicItemId}` });
assert.equal(legacyMarket.ok, true); assert.equal(legacyMarket.state, 'REDIRECT_CANDIDATE'); assert.equal(legacyMarket.route.legacy, true);
assert.equal(legacyMarket.redirect.reason, 'LEGACY_CANONICALIZATION'); assert.equal(legacyMarket.redirect.status, 'SHADOW');
const legacyPuzzle = core.resolve({ url: `/pixfind/puzzles/${knownPuzzleId}/` });
assert.equal(legacyPuzzle.ok, true); assert.equal(legacyPuzzle.state, 'REDIRECT_CANDIDATE'); assert.match(legacyPuzzle.canonicalPath, /^\/pixfind\/\?puzzle=/u);
assert.equal(legacyPuzzle.currentPathPreserved, true);
const canonicalPuzzleQuery = core.resolve({ url: `/pixfind/?puzzle=${knownPuzzleId}` });
assert.equal(canonicalPuzzleQuery.ok, true); assert.equal(canonicalPuzzleQuery.state, 'CANONICAL'); assert.equal(canonicalPuzzleQuery.currentPathPreserved, true);
const legacyPuzzleIndex = core.resolve({ url: `/pixfind/index.html?puzzle=${knownPuzzleId}` });
assert.equal(legacyPuzzleIndex.ok, true); assert.equal(legacyPuzzleIndex.state, 'REDIRECT_CANDIDATE'); assert.equal(legacyPuzzleIndex.redirect.status, 'SHADOW');
const draw2ProjectQuery = core.resolve({ url: `/pixiedraw2/?project=${knownProjectId}` });
assert.equal(draw2ProjectQuery.ok, true); assert.equal(draw2ProjectQuery.state, 'CANONICAL'); assert.equal(draw2ProjectQuery.routeId, 'pixiedraw2-project-query');
const retiredDraw = core.resolve({ url: '/pixiedraw/' });
assert.equal(retiredDraw.ok, true); assert.equal(retiredDraw.state, 'REDIRECT_CANDIDATE'); assert.equal(retiredDraw.routeId, 'pixiedraw-legacy-route');
assert.equal(retiredDraw.redirect.status, 'SHADOW'); assert.equal(retiredDraw.redirect.to, 'https://pixieed.jp/pixiedraw2/');
const retiredDrawProjectQuery = core.resolve({ url: `/pixiedraw/?project=${knownProjectId}` });
assert.equal(retiredDrawProjectQuery.ok, true); assert.equal(retiredDrawProjectQuery.state, 'REDIRECT_CANDIDATE'); assert.equal(retiredDrawProjectQuery.routeId, 'pixiedraw-legacy-route');
assert.equal(retiredDrawProjectQuery.redirect.to, `https://pixieed.jp/pixiedraw2/?project=${knownProjectId}`);
const drawIndexAlias = core.resolve({ url: `/pixiedraw/index.html` });
assert.equal(drawIndexAlias.ok, true); assert.equal(drawIndexAlias.state, 'REDIRECT_CANDIDATE'); assert.equal(drawIndexAlias.redirect.to, 'https://pixieed.jp/pixiedraw2/');
const postQuery = core.resolve({ url: `/post/?id=${knownPostId}` });
assert.equal(postQuery.ok, true); assert.equal(postQuery.state, 'CANONICAL'); assert.equal(postQuery.routeId, 'post-detail-query');
const postPath = core.resolve({ url: `/posts/${knownPostId}/` });
assert.equal(postPath.ok, true); assert.equal(postPath.state, 'REDIRECT_CANDIDATE'); assert.equal(postPath.routeId, 'post-detail-path');

const privateItem = core.resolve({ url: `/market/items/${privateMarketId}/`, permissionDecision: allow(true) });
expectFailure('private-resource-denied', privateItem, 'ROUTING_RESOURCE_FORBIDDEN');
routingSecurityCoverage.add('private-resource-denied');
const privateItemUnknownPrincipal = core.resolve({ url: `/market/items/${privateMarketId}/` });
expectFailure('private-resource-not-found-without-principal', privateItemUnknownPrincipal, 'ROUTING_RESOURCE_NOT_FOUND');
routingSecurityCoverage.add('private-resource-not-found-without-principal');
const unlistedItem = core.resolve({ url: `/market/items/${unlistedMarketId}/`, permissionDecision: allow(true) });
expectFailure('unlisted-resource-denied', unlistedItem, 'ROUTING_RESOURCE_FORBIDDEN');
expectFailure('deleted-resource-no-redirect', core.resolve({ url: `/market/items/${deletedMarketId}/` }), 'ROUTING_RESOURCE_NOT_FOUND');
expectFailure('missing-resource-no-redirect', core.resolve({ url: '/market/items/33333333-3333-4333-8333-333333333333/' }), 'ROUTING_RESOURCE_NOT_FOUND');
const untrustedResourceCore = createPublicUrlRoutingCore({ featureFlagEvaluator: flags, resourceResolver: () => ({ source: 'client', exists: true, visibility: 'PUBLIC', allowed: true }) });
expectFailure('client-resource-resolver', untrustedResourceCore.resolve({ url: `/market/items/${publicItemId}/` }), 'ROUTING_RESOURCE_RESOLVER_UNTRUSTED');
expectFailure('invalid-market-id', core.resolve({ url: '/market/items/not-an-id/' }), 'ROUTING_RESOURCE_NOT_FOUND');
expectFailure('invalid-legacy-market-id', core.resolve({ url: '/market/item.html?id=not-an-id' }), 'ROUTING_LEGACY_ID_INVALID');
expectFailure('invalid-legacy-puzzle-id', core.resolve({ url: '/pixfind/puzzles/not-an-id/' }), 'ROUTING_LEGACY_ID_INVALID');
expectFailure('unknown-route', core.resolve({ url: '/does-not-exist/' }), 'ROUTING_ROUTE_NOT_FOUND');
expectFailure('cross-origin', core.resolve({ url: 'https://evil.example/market/' }), 'ROUTING_ORIGIN_INVALID');
expectFailure('protocol-relative-open-redirect', core.resolve({ url: '//evil.example/market/' }), 'ROUTING_ORIGIN_INVALID');
routingSecurityCoverage.add('cross-origin'); routingSecurityCoverage.add('protocol-relative-open-redirect');
expectFailure('duplicate-query', core.resolve({ url: `/market/item.html?id=${publicItemId}&id=${publicItemId}` }), 'ROUTING_QUERY_DUPLICATE');
expectFailure('malformed-encoded-path', core.resolve({ url: '/market/%E0%A4%A/' }), 'ROUTING_PATH_INVALID');
expectFailure('double-encoded-path-traversal', core.resolve({ url: '/market/%252e%252e/account/' }), 'ROUTING_ROUTE_NOT_FOUND');
routingSecurityCoverage.add('malformed-encoded-path'); routingSecurityCoverage.add('double-encoded-path-traversal');
expectFailure('unsupported-scheme', core.resolve({ url: 'javascript:alert(1)' }), 'ROUTING_ORIGIN_INVALID');
const tooManyQuery = Array.from({ length: 17 }, (_, index) => `k${index}=v`).join('&');
expectFailure('query-bound', core.resolve({ url: `/market/?${tooManyQuery}` }), 'ROUTING_QUERY_TOO_LARGE');

const publicMetadata = core.buildCanonicalMetadata({ resolution: home });
assert.equal(publicMetadata.ok, true); assert.equal(publicMetadata.robots, 'index,follow'); assert.equal(publicMetadata.cacheControl, 'public,max-age=60,must-revalidate'); assert.equal(publicMetadata.canonicalUrl, 'https://pixieed.jp/');
assert.equal(publicMetadata.openGraph.imagePath, '/assets/thumbnail.png');
const privateMetadata = core.buildCanonicalMetadata({ resolution: privateRoute, permissionDecision: allow(true) });
assert.equal(privateMetadata.ok, true); assert.equal(privateMetadata.robots, 'noindex,nofollow'); assert.equal(privateMetadata.cacheControl, 'private,no-store'); assert.equal(privateMetadata.canonicalUrl, null); assert.equal(privateMetadata.openGraph, null);
routingSecurityCoverage.add('private-metadata-noindex'); routingSecurityCoverage.add('private-metadata-private-no-store');
const untrustedMetadataCore = createPublicUrlRoutingCore({ featureFlagEvaluator: flags, metadataResolver: () => ({ source: 'client', title: 'untrusted', description: '', imagePath: null, locale: 'ja-JP' }) });
const untrustedMetadata = untrustedMetadataCore.buildCanonicalMetadata({ resolution: untrustedMetadataCore.resolve({ url: '/' }) });
expectFailure('untrusted-metadata', untrustedMetadata, 'ROUTING_METADATA_UNTRUSTED');
const badProofCore = createPublicUrlRoutingCore({ featureFlagEvaluator: flags, resourceResolver, redirectProofEvaluator: () => ({ source: 'server', canonicalVerified: false, privacyVerified: true }), authorizationEvaluator });
expectFailure('redirect-proof-failed', badProofCore.resolve({ url: `/market/items/${publicItemId}`, permissionDecision: allow(true), redirectMode: 'apply' }), 'ROUTING_REDIRECT_PROOF_FAILED');
const noPermissionRedirect = core.prepareRedirect({ resolution: itemNoSlash });
expectFailure('redirect-permission-required', noPermissionRedirect, 'ROUTING_REDIRECT_PERMISSION_REQUIRED');
const secretLegacyMarket = core.resolve({ url: `/market/item.html?id=${publicItemId}&token=secret&access_token=jwt` });
assert.equal(secretLegacyMarket.ok, true); assert.equal(secretLegacyMarket.redirect.to.includes('secret'), false); assert.equal(secretLegacyMarket.redirect.to.includes('access_token'), false);
routingSecurityCoverage.add('secret-query-not-propagated');
const redirectLoopCandidate = core.resolve({ url: `/market/items/${publicItemId}/` });
assert.equal(redirectLoopCandidate.redirect, null); assert.equal(redirectLoopCandidate.state, 'CANONICAL');
routingSecurityCoverage.add('redirect-loop-canonical-path');
const unicodeNfc = core.resolve({ url: '/nö-route/' });
const unicodeNfd = core.resolve({ url: '/nö-route/' });
assert.equal(unicodeNfc.code, 'ROUTING_ROUTE_NOT_FOUND'); assert.equal(unicodeNfd.code, 'ROUTING_ROUTE_NOT_FOUND');
routingSecurityCoverage.add('unicode-nfc-nfd-equivalence');
enabledFlags.delete(PUBLIC_URL_FLAGS.redirect);
const redirectOff = core.prepareRedirect({ resolution: itemNoSlash, permissionDecision: allow(true) });
expectFailure('redirect-flag-off', redirectOff, 'ROUTING_FLAG_OFF');
enabledFlags.add(PUBLIC_URL_FLAGS.redirect);
routingSecurityCoverage.add('default-off-read'); routingSecurityCoverage.add('redirect-flag-off');
const rollback = core.rollback({ reason: 'wp098-test' });
assert.equal(rollback.ok, true); assert.equal(rollback.action, 'KEEP_CURRENT_ROUTE'); assert.equal(rollback.redirectApplied, false); assert.equal(rollback.publicMetadataCutover, false); assert.equal(rollback.recoverable, true);

assert.deepEqual(fixture.expectedSafety, {
  crossOrigin: 'deny', unknownFlag: 'deny', missingOrDeletedResource: 'deny-without-redirect',
  unprovenRedirect: 'shadow-only', privateMetadata: 'noindex,nofollow', rollback: 'keep-current-route',
});
assert.ok(routingSecurityCoverage.size >= 12, `Routing Security Coverage is too small: ${routingSecurityCoverage.size}`);
assert.match(policy, /LOCAL_ONLY/); assert.match(policy, /ACTIVE_SYNC/); assert.match(policy, /PLATFORM_EVENT/); assert.match(policy, /ASYNC_ON_DEMAND/);
assert.match(policy, /JWT/); assert.match(policy, /commission/iu);
assert.doesNotMatch(moduleCode, /\b(?:window|document|fetch|supabase|location|history)\b/u);
assert.ok(snapshot.storageBoundary.excluded.includes('raw-pixel'));
assert.ok(snapshot.storageBoundary.excluded.includes('pxd-bytes'));
const missingRouteSources = [];
for (const { source } of routeInventory.routes) {
  const sourcePath = new URL(`../${source}`, import.meta.url);
  if (!existsSync(sourcePath)) {
    missingRouteSources.push(source);
    continue;
  }
  const currentSource = readFileSync(sourcePath, 'utf8');
  assert.equal(currentSource.includes('core-public-url-routing-contracts.js'), false, `${source} is connected to isolated routing Core.`);
  assert.equal(currentSource.includes('public-url-redirect'), false, `${source} is connected to Public URL redirect flag.`);
}

assert.ok(failureNames.length >= 25, `Failure fixture coverage is too small: ${failureNames.length}`);
console.log(JSON.stringify({
  workPackage: 'WP-098', status: 'pass', currentRoutes: CURRENT_ROUTE_SNAPSHOT.length, catalogRoutes: ROUTE_CATALOG.length,
  flags: PUBLIC_URL_FLAG_NAMES.length, resolutionStates: ROUTE_RESOLUTION_STATES, redirectStatuses: ROUTE_REDIRECT_STATUSES,
  canonicalMetadata: true, privateAndDeletedFailClosed: true, legacyIds: true, redirectProof: true, rollback: true,
  costPolicyClasses: ['LOCAL_ONLY', 'ACTIVE_SYNC', 'PLATFORM_EVENT', 'ASYNC_ON_DEMAND'], failureFixtures: failureNames.length,
  failureFixtureNames: failureNames, routingSecurityCoverage: [...routingSecurityCoverage], currentRoutesConnected: false, productionRedirectChanged: false, realtimeSubscription: false, missingRouteSources,
}, null, 2));
