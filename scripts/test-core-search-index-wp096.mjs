import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EVENT_CORE_FLAGS,
  createEventActivityCore,
} from '../core-shell/assets/core-event-activity-contracts.js';
import {
  SEARCH_FLAGS,
  SEARCH_RESOURCE_TYPES,
  SEARCH_VISIBILITY_SCOPES,
  createInMemorySearchBackend,
  createSearchIndexCore,
  normalizeSearchDocument,
  normalizeSearchQuery,
  validateSearchDocument,
  validateSearchQuery,
} from '../core-shell/assets/core-search-index-contracts.js';

const timestamps = [
  '2026-08-07T00:00:00.000Z', '2026-08-07T00:00:01.000Z', '2026-08-07T00:00:02.000Z',
  '2026-08-07T00:00:03.000Z', '2026-08-07T00:00:04.000Z', '2026-08-07T00:00:05.000Z',
  '2026-08-07T00:00:06.000Z', '2026-08-07T00:00:07.000Z', '2026-08-07T00:00:08.000Z',
  '2026-08-07T00:00:09.000Z', '2026-08-07T00:00:10.000Z', '2026-08-07T00:00:11.000Z',
  '2026-08-07T00:00:12.000Z', '2026-08-07T00:00:13.000Z', '2026-08-07T00:00:14.000Z',
  '2026-08-07T00:00:15.000Z', '2026-08-07T00:00:16.000Z', '2026-08-07T00:00:17.000Z',
  '2026-08-07T00:00:18.000Z', '2026-08-07T00:00:19.000Z', '2026-08-07T00:00:20.000Z',
  '2026-08-07T00:00:21.000Z', '2026-08-07T00:00:22.000Z', '2026-08-07T00:00:23.000Z',
  '2026-08-07T00:00:24.000Z', '2026-08-07T00:00:25.000Z', '2026-08-07T00:00:26.000Z',
  '2026-08-07T00:00:27.000Z', '2026-08-07T00:00:28.000Z', '2026-08-07T00:00:29.000Z',
  '2026-08-07T00:00:30.000Z', '2026-08-07T00:00:31.000Z', '2026-08-07T00:00:32.000Z',
  '2026-08-07T00:00:33.000Z', '2026-08-07T00:00:34.000Z', '2026-08-07T00:00:35.000Z',
  '2026-08-07T00:00:36.000Z', '2026-08-07T00:00:37.000Z', '2026-08-07T00:00:38.000Z',
  '2026-08-07T00:00:39.000Z', '2026-08-07T00:00:40.000Z', '2026-08-07T00:00:41.000Z',
  '2026-08-07T00:00:42.000Z', '2026-08-07T00:00:43.000Z', '2026-08-07T00:00:44.000Z',
  '2026-08-07T00:00:45.000Z', '2026-08-07T00:00:46.000Z', '2026-08-07T00:00:47.000Z',
  '2026-08-07T00:00:48.000Z', '2026-08-07T00:00:49.000Z', '2026-08-07T00:00:50.000Z',
];
let timeIndex = 0;
const clock = () => timestamps[Math.min(timeIndex++, timestamps.length - 1)];
let generatedId = 0;
const idGenerator = (kind) => `${kind}-generated-${++generatedId}`;

const allEventFlags = new Set(Object.values(EVENT_CORE_FLAGS));
const eventFlags = ({ flagId }) => ({ enabled: allEventFlags.has(flagId), decision: allEventFlags.has(flagId) ? 'enabled' : 'disabled' });
const permissionAllow = { ok: true, decision: 'allow', source: 'server', capability: 'core.search.synthetic' };
const trustedProducer = {
  PROJECT: { producerId: 'project-registry-v1', producerVersion: '1.0.0', producerType: 'PROJECT_REGISTRY' },
  ASSET: { producerId: 'asset-registry-v1', producerVersion: '1.0.0', producerType: 'ASSET_REGISTRY' },
  PACKAGE: { producerId: 'package-registry-v1', producerVersion: '1.0.0', producerType: 'PACKAGE_REGISTRY' },
};

const eventCore = createEventActivityCore({
  clock,
  idGenerator,
  featureFlagEvaluator: eventFlags,
  trustedProducers: Object.values(trustedProducer),
  transactionAdapter: () => ({ ok: true, committed: true }),
  publisher: () => ({ ok: true }),
});

const flags = Object.fromEntries(Object.values(SEARCH_FLAGS).map((flag) => [flag, true]));
const searchFlags = ({ flagId }) => ({ enabled: flags[flagId] === true, decision: flags[flagId] === true ? 'enabled' : 'disabled' });

const baseProjection = ({ resourceType, resourceId, visibilityClass = 'PUBLIC', lifecycleState = 'ACTIVE', title = '星の庭 / Star Garden', summary = 'Synthetic Japanese English creator fixture.', projectReference = null }) => ({
  resourceType,
  resourceId,
  ownerReference: { referenceType: 'USER', referenceId: 'user-demo-001' },
  creatorReference: { referenceType: 'CREATOR', referenceId: 'creator-demo-001' },
  projectReference: projectReference || (resourceType === 'PROJECT' ? { referenceType: 'PROJECT', referenceId: resourceId } : { referenceType: 'PROJECT', referenceId: 'world-001' }),
  visibilityClass,
  lifecycleState,
  title,
  summary,
  tags: ['pixel-art', 'ゲーム', 'creator-platform'],
  locale: 'ja-JP',
  facets: { tool: ['pixiedraw2'], audience: ['public'] },
  sortKeys: { freshness: 1, creatorRelevance: 1, qualityReference: 0.8 },
  previewReference: { kind: 'THUMBNAIL', referenceId: `preview-${resourceId}` },
  createdAt: timestamps[0],
  updatedAt: timestamps[Math.min(timeIndex, timestamps.length - 1)],
});

const commitEvent = ({ eventId, eventType, aggregateType, aggregateId, aggregateVersion, projection, visibilityClass = 'PUBLIC' }) => {
  const result = eventCore.commitFact({
    event: {
      eventId,
      eventType,
      eventVersion: 1,
      occurredAt: timestamps[Math.min(timeIndex++, timestamps.length - 1)],
      producer: trustedProducer[aggregateType],
      aggregateType,
      aggregateId,
      aggregateVersion,
      actorRef: { actorId: 'user-demo-001', actorType: 'USER' },
      correlationId: `correlation-${aggregateType.toLowerCase()}-${aggregateId}`,
      causationId: null,
      projectId: aggregateType === 'PROJECT' ? aggregateId : 'world-001',
      assetId: aggregateType === 'ASSET' ? aggregateId : null,
      packageId: aggregateType === 'PACKAGE' ? aggregateId : null,
      visibilityClass,
      payload: { projection },
    },
    stateChange: { aggregateType, aggregateId, aggregateVersion },
    permissionDecision: permissionAllow,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.event;
};

const searchCore = createSearchIndexCore({
  clock,
  idGenerator,
  featureFlagEvaluator: searchFlags,
  eventTrustEvaluator: ({ event }) => event.producer.producerId === trustedProducer[event.aggregateType]?.producerId ? permissionAllow : { ok: false, decision: 'deny', source: 'server' },
  authorizationEvaluator: ({ document, context }) => ({ ok: true, decision: context?.memberOf === document.projectReference?.referenceId ? 'allow' : 'deny', source: 'server' }),
});

const failureFixtureNames = [];
const expectInvalid = (name, result, expectedCode = null) => {
  assert.equal(result.valid, false, `${name} unexpectedly passed: ${JSON.stringify(result)}`);
  if (expectedCode) assert.equal(result.diagnostics[0].code, expectedCode, `${name}: ${JSON.stringify(result.diagnostics)}`);
  failureFixtureNames.push(name);
};
const expectOperationFailure = (name, result, expectedCode = null) => {
  assert.equal(result.ok, false, `${name} unexpectedly passed: ${JSON.stringify(result)}`);
  if (expectedCode) assert.equal(result.diagnostics[0].code, expectedCode, `${name}: ${JSON.stringify(result.diagnostics)}`);
  failureFixtureNames.push(name);
};

const validDocument = normalizeSearchDocument({
  searchDocumentId: 'search-doc:project:valid-001',
  documentVersion: 1,
  resourceType: 'PROJECT',
  resourceId: 'valid-001',
  sourceAggregateVersion: 1,
  sourceEventId: 'event-valid-001',
  ownerReference: { referenceType: 'USER', referenceId: 'user-demo-001' },
  creatorReference: { referenceType: 'CREATOR', referenceId: 'creator-demo-001' },
  projectReference: { referenceType: 'PROJECT', referenceId: 'valid-001' },
  visibilityClass: 'PUBLIC',
  lifecycleState: 'ACTIVE',
  title: { displayValue: 'Étoile 星', normalizedSearchValue: 'wrong value is recomputed' },
  summary: 'Synthetic search fixture',
  tags: ['pixel-art'],
  locale: 'ja-JP',
  facets: { tool: ['pixiedraw2'] },
  sortKeys: { qualityReference: 1 },
  previewReference: { kind: 'PREVIEW', referenceId: 'preview-valid-001' },
  createdAt: timestamps[0],
  updatedAt: timestamps[1],
  indexedAt: timestamps[2],
  schemaVersion: 1,
});
const schemaFixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/search-index-v1.valid.json', import.meta.url), 'utf8'));
assert.equal(validateSearchDocument(schemaFixture.document).valid, true);
assert.equal(validateSearchQuery(schemaFixture.query).valid, true);

const projectCreated = commitEvent({
  eventId: 'event-project-world-001-v1',
  eventType: 'PROJECT_CREATED',
  aggregateType: 'PROJECT',
  aggregateId: 'world-001',
  aggregateVersion: 1,
  projection: baseProjection({ resourceType: 'PROJECT', resourceId: 'world-001' }),
});
const projectCreatedProjection = searchCore.projectEvent({ event: projectCreated });
assert.equal(projectCreatedProjection.ok, true, JSON.stringify(projectCreatedProjection));

let publicResults = searchCore.querySearch({ query: { text: '星 Star', resourceTypes: ['PROJECT'], pageSize: 10 } });
assert.equal(publicResults.ok, true, JSON.stringify(publicResults));
assert.equal(publicResults.results.length, 1);
assert.equal(publicResults.results[0].resourceId, 'world-001');
assert.equal(publicResults.results[0].title.displayValue, '星の庭 / Star Garden');
assert.notEqual(publicResults.results[0].resourceId, publicResults.results[0].searchDocumentId);

const projectPrivate = commitEvent({
  eventId: 'event-project-world-001-v2',
  eventType: 'PROJECT_VISIBILITY_CHANGED',
  aggregateType: 'PROJECT',
  aggregateId: 'world-001',
  aggregateVersion: 2,
  visibilityClass: 'PRIVATE',
  projection: baseProjection({ resourceType: 'PROJECT', resourceId: 'world-001', visibilityClass: 'PRIVATE' }),
});
assert.equal(searchCore.projectEvent({ event: projectPrivate }).ok, true);
publicResults = searchCore.querySearch({ query: { text: 'Star', resourceTypes: ['PROJECT'] } });
assert.equal(publicResults.results.length, 0, 'PRIVATE project leaked to public discovery.');
failureFixtureNames.push('private-to-public-leak');
const memberResults = searchCore.querySearch({ query: { text: 'Star', resourceTypes: ['PROJECT'], visibilityScope: 'MEMBER_SCOPED' }, authorizationContext: { memberOf: 'world-001' } });
assert.equal(memberResults.ok, true);
assert.equal(memberResults.results.length, 1);
assert.equal(memberResults.results[0].visibilityClass, 'PRIVATE');
assert.equal(searchCore.querySearch({ query: { resourceTypes: ['PROJECT'], visibilityScope: 'MEMBER_SCOPED' }, authorizationContext: { memberOf: 'other-project' } }).results.length, 0);
failureFixtureNames.push('member-only-to-public-leak');

const unlistedEvent = commitEvent({
  eventId: 'event-project-unlisted-v1',
  eventType: 'PROJECT_CREATED',
  aggregateType: 'PROJECT',
  aggregateId: 'unlisted-001',
  aggregateVersion: 1,
  visibilityClass: 'UNLISTED',
  projection: baseProjection({ resourceType: 'PROJECT', resourceId: 'unlisted-001', visibilityClass: 'UNLISTED' }),
});
assert.equal(searchCore.projectEvent({ event: unlistedEvent }).ok, true);
assert.equal(searchCore.querySearch({ query: { text: 'Star', resourceTypes: ['PROJECT'] } }).results.some((row) => row.resourceId === 'unlisted-001'), false);

const assetCreated = commitEvent({
  eventId: 'event-asset-sprite-001-v1',
  eventType: 'ASSET_CREATED',
  aggregateType: 'ASSET',
  aggregateId: 'sprite-001',
  aggregateVersion: 1,
  projection: baseProjection({ resourceType: 'ASSET', resourceId: 'sprite-001', title: 'Étoile 星 Sprite Star', summary: 'Public preview only; source requires authorization.' }),
});
assert.equal(searchCore.projectEvent({ event: assetCreated }).ok, true);
const assetHeadChanged = commitEvent({
  eventId: 'event-asset-sprite-001-v2',
  eventType: 'ASSET_HEAD_CHANGED',
  aggregateType: 'ASSET',
  aggregateId: 'sprite-001',
  aggregateVersion: 2,
  projection: { title: 'Étoile 星 Sprite Star Updated', updatedAt: timestamps[10], sortKeys: { freshness: 10, qualityReference: 0.9 } },
});
assert.equal(searchCore.projectEvent({ event: assetHeadChanged }).ok, true);
const japaneseSearch = searchCore.querySearch({ query: { text: '星', resourceTypes: ['ASSET'] } });
const englishSearch = searchCore.querySearch({ query: { text: 'Star', resourceTypes: ['ASSET'] } });
const mixedSearch = searchCore.querySearch({ query: { text: '星 Star', resourceTypes: ['ASSET'] } });
const accentSearch = searchCore.querySearch({ query: { text: 'etoile', resourceTypes: ['ASSET'] } });
assert.equal(japaneseSearch.results.length, 1);
assert.equal(englishSearch.results.length, 1);
assert.equal(mixedSearch.results.length, 1);
assert.equal(accentSearch.results.length, 1);
assert.match(japaneseSearch.results[0].title.displayValue, /Étoile/);
assert.equal(JSON.stringify(japaneseSearch.results[0]).includes('rawPixel'), false);

const packageReady = commitEvent({
  eventId: 'event-package-game-001-v1',
  eventType: 'PACKAGE_READY',
  aggregateType: 'PACKAGE',
  aggregateId: 'package-game-001',
  aggregateVersion: 1,
  projection: baseProjection({ resourceType: 'PACKAGE', resourceId: 'package-game-001', title: 'Star Garden Game Package', summary: 'READY Package search candidate only.' }),
});
assert.equal(searchCore.projectEvent({ event: packageReady }).ok, true);
assert.equal(searchCore.querySearch({ query: { text: 'Game', resourceTypes: ['PACKAGE'] } }).results.length, 1);
assert.equal(Object.keys(searchCore.snapshot().documents).some((key) => key.startsWith('MARKET_PRODUCT:')), false);
assert.equal(searchCore.projectEvent({ event: packageReady }).idempotentReplay, true);

const staleAssetEvent = {
  ...assetCreated,
  eventId: 'event-asset-sprite-001-old-v1',
  occurredAt: timestamps[11],
  aggregateVersion: 1,
};
const staleResult = searchCore.projectEvent({ event: staleAssetEvent });
assert.equal(staleResult.ok, true);
assert.equal(staleResult.stale, true);

const gapAssetV1 = commitEvent({
  eventId: 'event-asset-gap-001-v1',
  eventType: 'ASSET_CREATED',
  aggregateType: 'ASSET',
  aggregateId: 'gap-asset-001',
  aggregateVersion: 1,
  projection: baseProjection({ resourceType: 'ASSET', resourceId: 'gap-asset-001', title: 'Gap Asset' }),
});
assert.equal(searchCore.projectEvent({ event: gapAssetV1 }).ok, true);
const gapAssetV3 = { ...gapAssetV1, eventId: 'event-asset-gap-001-v3', occurredAt: timestamps[12], aggregateVersion: 3, payload: { projection: { title: 'Gap Asset v3' } } };
const gapResult = searchCore.projectEvent({ event: gapAssetV3 });
assert.equal(gapResult.ok, false);
assert.equal(gapResult.gap, true);
const gapAssetV2 = { ...gapAssetV1, eventId: 'event-asset-gap-001-v2', occurredAt: timestamps[13], aggregateVersion: 2, payload: { projection: { title: 'Gap Asset v2' } } };
assert.equal(searchCore.projectEvent({ event: gapAssetV2 }).ok, true);
assert.equal(searchCore.projectEvent({ event: gapAssetV3 }).ok, true);

const projectTrashed = commitEvent({
  eventId: 'event-project-world-001-v3',
  eventType: 'PROJECT_TRASHED',
  aggregateType: 'PROJECT',
  aggregateId: 'world-001',
  aggregateVersion: 3,
  visibilityClass: 'PRIVATE',
  projection: { lifecycleState: 'TRASHED' },
});
assert.equal(searchCore.projectEvent({ event: projectTrashed }).tombstoned, true);
const resurrectionAttempt = { ...projectPrivate, eventId: 'event-project-world-001-old-v2', occurredAt: timestamps[14] };
const resurrectionResult = searchCore.projectEvent({ event: resurrectionAttempt });
assert.equal(resurrectionResult.ok, true);
assert.equal(resurrectionResult.stale, true);
assert.equal(searchCore.querySearch({ query: { text: 'Star', resourceTypes: ['PROJECT'] } }).results.some((row) => row.resourceId === 'world-001'), false);
assert.equal(Boolean(searchCore.snapshot().tombstones['PROJECT:world-001']), true);
failureFixtureNames.push('old-event-resurrects-tombstone');

const creatorDocument = normalizeSearchDocument({
  ...validDocument,
  searchDocumentId: 'search-doc:creator:creator-demo-001',
  resourceType: 'CREATOR',
  resourceId: 'creator-demo-001',
  sourceEventId: 'event-creator-public-001',
  projectReference: null,
  title: 'Creator Étoile 星',
  summary: 'Public creator profile projection',
  locale: 'en-US',
});
assert.equal(searchCore.indexCanonicalResource({ document: creatorDocument, permissionDecision: permissionAllow }).ok, true);
assert.equal(searchCore.querySearch({ query: { text: 'Creator', resourceTypes: ['CREATOR'], locale: 'en-US' } }).results.length, 1);
const exactLookup = searchCore.lookupResource({ resourceType: 'CREATOR', resourceId: 'creator-demo-001', permissionDecision: permissionAllow });
assert.equal(exactLookup.ok, true);
assert.equal(exactLookup.source, 'search-index');
const unauthorizedLookup = searchCore.lookupResource({ resourceType: 'CREATOR', resourceId: 'creator-demo-001', permissionDecision: { ok: false, decision: 'deny', source: 'server' } });
assert.equal(unauthorizedLookup.ok, false);

const pageOne = searchCore.querySearch({ query: { text: '', resourceTypes: ['ASSET', 'PACKAGE', 'CREATOR'], pageSize: 1 } });
assert.equal(pageOne.ok, true);
assert.equal(pageOne.results.length, 1);
assert.ok(pageOne.nextCursor);
const pageTwo = searchCore.querySearch({ query: { text: '', resourceTypes: ['ASSET', 'PACKAGE', 'CREATOR'], pageSize: 1, cursor: pageOne.nextCursor } });
assert.equal(pageTwo.ok, true);
assert.equal(pageTwo.results.length, 1);
assert.notEqual(pageOne.results[0].searchDocumentId, pageTwo.results[0].searchDocumentId);

const allEvents = [projectCreated, projectPrivate, unlistedEvent, assetCreated, assetHeadChanged, packageReady, gapAssetV1, gapAssetV2, gapAssetV3, projectTrashed];
const rebuildFlags = Object.fromEntries(Object.values(SEARCH_FLAGS).map((flag) => [flag, true]));
const rebuildCore = createSearchIndexCore({ clock, idGenerator, featureFlagEvaluator: ({ flagId }) => ({ enabled: rebuildFlags[flagId] === true, decision: rebuildFlags[flagId] === true ? 'enabled' : 'disabled' }), eventTrustEvaluator: () => permissionAllow, authorizationEvaluator: () => permissionAllow });
const rebuildFirst = rebuildCore.rebuildIndex({ events: allEvents, batchSize: 3 });
assert.equal(rebuildFirst.ok, true);
assert.equal(rebuildFirst.complete, false);
let rebuildCursor = rebuildFirst.resumeCursor;
let rebuildRounds = 0;
while (rebuildCursor && rebuildRounds < 10) {
  const next = rebuildCore.rebuildIndex({ events: allEvents, resumeCursor: rebuildCursor, batchSize: 3 });
  assert.equal(next.ok, true, JSON.stringify(next));
  rebuildCursor = next.resumeCursor;
  rebuildRounds += 1;
}
assert.equal(rebuildCursor, null);
assert.equal(rebuildCore.rebuildResourceType({ resourceType: 'PROJECT', events: allEvents, batchSize: 20 }).ok, true);
const rebuiltPublic = rebuildCore.querySearch({ query: { text: 'Game', resourceTypes: ['PACKAGE'] } });
assert.equal(rebuiltPublic.results.length, 1);
assert.equal(rebuildCore.rebuildIndex({ events: allEvents, batchSize: 100 }).externalSideEffects, 0);
assert.equal(rebuildCore.querySearch({ query: { text: 'Game', resourceTypes: ['PACKAGE'] } }).results.length, 1);
failureFixtureNames.push('rebuild-duplicate');
const reindexResult = rebuildCore.reindexResource({ resourceType: 'CREATOR', resourceId: 'creator-demo-001', sourceSnapshot: creatorDocument, permissionDecision: permissionAllow });
assert.equal(reindexResult.ok, true);

const fallbackFlags = Object.fromEntries(Object.values(SEARCH_FLAGS).map((flag) => [flag, false]));
const fallbackCore = createSearchIndexCore({ clock, idGenerator, featureFlagEvaluator: ({ flagId }) => ({ enabled: fallbackFlags[flagId] === true, decision: fallbackFlags[flagId] === true ? 'enabled' : 'disabled' }), eventTrustEvaluator: () => permissionAllow });
const fallbackLookup = fallbackCore.lookupResource({ resourceType: 'PROJECT', resourceId: 'fallback-001', permissionDecision: permissionAllow, canonicalFallback: () => ({ ok: true, document: { ...validDocument, searchDocumentId: 'search-doc:project:fallback-001', resourceId: 'fallback-001', sourceEventId: 'event-fallback-001' } }) });
assert.equal(fallbackLookup.ok, true);
assert.equal(fallbackLookup.source, 'canonical-fallback');

const retryBackendBase = createInMemorySearchBackend();
let retryApplyCount = 0;
const retryBackend = { ...retryBackendBase, apply: (input) => { retryApplyCount += 1; return retryApplyCount <= 2 ? { ok: false, code: 'SEARCH_BACKEND_TEMPORARY', retryable: true } : retryBackendBase.apply(input); } };
const retryCore = createSearchIndexCore({ clock, idGenerator, featureFlagEvaluator: searchFlags, eventTrustEvaluator: () => permissionAllow, backendAdapter: retryBackend });
const retryEvent = { ...assetCreated, eventId: 'event-retry-asset-001', aggregateId: 'retry-asset-001', payload: { projection: baseProjection({ resourceType: 'ASSET', resourceId: 'retry-asset-001', title: 'Retry Asset' }) } };
assert.equal(retryCore.enqueueProjection({ event: retryEvent }).ok, true);
assert.equal(retryCore.processQueue({ batchSize: 1 }).retried, 1);
assert.equal(retryCore.processQueue({ batchSize: 1 }).retried, 1);
assert.equal(retryCore.processQueue({ batchSize: 1 }).processed, 1);

const deadBackend = { ...createInMemorySearchBackend(), apply: () => ({ ok: false, code: 'SEARCH_BACKEND_POISON', retryable: true }) };
const deadCore = createSearchIndexCore({ clock, idGenerator, featureFlagEvaluator: searchFlags, eventTrustEvaluator: () => permissionAllow, backendAdapter: deadBackend });
const deadEvent = { ...assetCreated, eventId: 'event-dead-asset-001', aggregateId: 'dead-asset-001', payload: { projection: baseProjection({ resourceType: 'ASSET', resourceId: 'dead-asset-001', title: 'Dead Asset' }) } };
assert.equal(deadCore.enqueueProjection({ event: deadEvent }).ok, true);
assert.equal(deadCore.processQueue({ batchSize: 1 }).retried, 1);
assert.equal(deadCore.processQueue({ batchSize: 1 }).retried, 1);
assert.equal(deadCore.processQueue({ batchSize: 1 }).deadLettered, 1);
assert.equal(deadCore.snapshot().deadLetters[0].eventId, deadEvent.eventId);
assert.equal('event' in deadCore.snapshot().deadLetters[0], false);

const docFailureBase = { ...validDocument };
expectInvalid('unknown-resource-type', validateSearchDocument({ ...docFailureBase, resourceType: 'UNKNOWN' }));
expectInvalid('invalid-search-document-id', validateSearchDocument({ ...docFailureBase, searchDocumentId: 'bad id' }));
expectInvalid('search-document-id-collision', validateSearchDocument({ ...docFailureBase, searchDocumentId: docFailureBase.resourceId }), 'SEARCH_DOCUMENT_ID_COLLISION');
expectInvalid('invalid-resource-id', validateSearchDocument({ ...docFailureBase, resourceId: 'bad id' }));
expectInvalid('unsupported-document-version', validateSearchDocument({ ...docFailureBase, documentVersion: 2 }), 'SEARCH_DOCUMENT_VERSION_UNSUPPORTED');
expectInvalid('oversized-title', validateSearchDocument({ ...docFailureBase, title: 'x'.repeat(161) }));
expectInvalid('oversized-summary', validateSearchDocument({ ...docFailureBase, summary: 'x'.repeat(513) }));
expectInvalid('excessive-tags', validateSearchDocument({ ...docFailureBase, tags: Array.from({ length: 33 }, (_, index) => `tag-${index}`) }), 'SEARCH_TAG_LIMIT');
expectInvalid('excessive-facets', validateSearchDocument({ ...docFailureBase, facets: Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`facet-${index}`, ['x']])) }), 'SEARCH_FACET_LIMIT');
expectInvalid('deep-metadata', validateSearchDocument({ ...docFailureBase, facets: { nested: [{ value: { deeper: true } }] } }));
expectInvalid('blob-field', validateSearchDocument({ ...docFailureBase, facets: { blob: ['forbidden'] } }));
expectInvalid('base64-data', validateSearchDocument({ ...docFailureBase, title: 'data:image/png;base64,AAAA' }));
expectInvalid('data-url', validateSearchDocument({ ...docFailureBase, summary: 'data:text/plain,private' }));
expectInvalid('jwt', validateSearchDocument({ ...docFailureBase, title: 'abcdefgh.ijklmnop.qrstuvwx' }));
expectInvalid('secret-field', validateSearchDocument({ ...docFailureBase, facets: { secret: ['forbidden'] } }));
expectInvalid('email-pii', validateSearchDocument({ ...docFailureBase, title: 'private@example.com' }));
expectInvalid('invalid-locale', validateSearchDocument({ ...docFailureBase, locale: 'ja_JP' }), 'SEARCH_LOCALE_INVALID');
expectInvalid('query-oversized', validateSearchQuery({ text: 'x'.repeat(257) }));
expectInvalid('query-filter-explosion', validateSearchQuery({ resourceTypes: ['PROJECT', 'ASSET', 'PACKAGE', 'CREATOR', 'UNKNOWN'] }));
expectInvalid('query-tag-explosion', validateSearchQuery({ tags: Array.from({ length: 17 }, () => 'tag') }));
expectInvalid('query-facet-explosion', validateSearchQuery({ facets: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`facet-${index}`, ['x']])) }));
expectInvalid('arbitrary-sort-field', validateSearchQuery({ sort: [{ field: 'sql', direction: 'asc' }] }));
expectInvalid('wildcard-query', validateSearchQuery({ text: '* OR 1=1' }), 'SEARCH_QUERY_WILDCARD_FORBIDDEN');
expectOperationFailure('cursor-query-mismatch', searchCore.querySearch({ query: { cursor: 'search:v1:not-a-valid-cursor' } }), 'SEARCH_CURSOR_INVALID');
expectOperationFailure('unknown-event-type', searchCore.projectEvent({ event: { ...assetCreated, eventId: 'event-unknown-type', eventType: 'UNKNOWN_EVENT' } }));
expectOperationFailure('high-frequency-pixisync-event', searchCore.projectEvent({ event: { ...assetCreated, eventId: 'event-pixisync-operation', eventType: 'PIXISYNC_OPERATION' } }));
expectOperationFailure('untrusted-producer', searchCore.projectEvent({ event: { ...assetCreated, eventId: 'event-untrusted-producer', producer: { ...assetCreated.producer, producerId: 'client-spoof' } } }));
expectOperationFailure('search-read-off', (() => { const old = flags[SEARCH_FLAGS.read]; flags[SEARCH_FLAGS.read] = false; const result = searchCore.querySearch({ query: { resourceTypes: ['ASSET'] } }); flags[SEARCH_FLAGS.read] = old; return result; })(), 'SEARCH_FLAG_OFF');
expectOperationFailure('public-discovery-off', (() => { const old = flags[SEARCH_FLAGS.publicDiscovery]; flags[SEARCH_FLAGS.publicDiscovery] = false; const result = searchCore.querySearch({ query: { resourceTypes: ['ASSET'] } }); flags[SEARCH_FLAGS.publicDiscovery] = old; return result; })(), 'SEARCH_FLAG_OFF');
expectOperationFailure('member-scope-off', (() => { const old = flags[SEARCH_FLAGS.memberScope]; flags[SEARCH_FLAGS.memberScope] = false; const result = searchCore.querySearch({ query: { resourceTypes: ['PROJECT'], visibilityScope: 'MEMBER_SCOPED' }, authorizationContext: { memberOf: 'world-001' } }); flags[SEARCH_FLAGS.memberScope] = old; return result; })(), 'SEARCH_FLAG_OFF');
expectOperationFailure('rebuild-off', (() => { const old = flags[SEARCH_FLAGS.rebuild]; flags[SEARCH_FLAGS.rebuild] = false; const result = searchCore.rebuildIndex({ events: [] }); flags[SEARCH_FLAGS.rebuild] = old; return result; })(), 'SEARCH_FLAG_OFF');
expectOperationFailure('invalid-rebuild-cursor', searchCore.rebuildIndex({ events: [], resumeCursor: 'bad-cursor' }), 'SEARCH_REBUILD_CURSOR_INVALID');
expectOperationFailure('invalid-exact-id-lookup', searchCore.lookupResource({ resourceType: 'PROJECT', resourceId: 'bad id', permissionDecision: permissionAllow }));

assert.equal(SEARCH_RESOURCE_TYPES.length, 4);
assert.deepEqual(SEARCH_VISIBILITY_SCOPES, ['PUBLIC_DISCOVERY', 'MEMBER_SCOPED', 'CREATOR_SCOPED', 'OWNER_SCOPED']);
assert.equal(failureFixtureNames.length, 37);

console.log(JSON.stringify({
  workPackage: 'WP-096',
  resourceTypes: SEARCH_RESOURCE_TYPES,
  reservedResourceTypes: 9,
  documentVersion: 1,
  queryVersion: 1,
  flags: Object.values(SEARCH_FLAGS).length,
  visibilityClasses: 5,
  visibilityScopes: SEARCH_VISIBILITY_SCOPES,
  projectionEvents: 21,
  eventCatalogEntries: 27,
  publicLeakPrevented: true,
  unlistedExcluded: true,
  tombstoneProtected: true,
  rebuild: { full: true, resourceType: true, singleResource: true, resume: true, externalSideEffects: 0 },
  multilingual: ['ja-JP', 'en-US', 'mixed', 'CJK', 'accent-folding'],
  stableCursor: true,
  retry: true,
  deadLetter: true,
  failureFixtures: failureFixtureNames.length,
  failureFixtureNames,
  highFrequencyEditorEventsAccepted: false,
  marketProductCreated: false,
  status: 'pass',
}, null, 2));
