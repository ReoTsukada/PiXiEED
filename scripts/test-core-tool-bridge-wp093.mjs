import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRIDGE_API_VERSIONS,
  BRIDGE_COMPATIBILITY_STATES,
  BRIDGE_EVENT_TYPES,
  BRIDGE_OPERATIONS,
  BRIDGE_REFERENCE_POLICIES,
  CORE_TOOL_IDS,
  TOOL_BRIDGE_CAPABILITIES,
  TOOL_BRIDGE_FLAGS,
  TOOL_BRIDGE_STORAGE_BOUNDARY,
  createBridgeEvent,
  createBridgeRequest,
  createToolBridge,
  validateBridgeEvent,
  validateBridgeRequest,
  validateToolDescriptor,
} from '../core-shell/assets/core-tool-bridge-contracts.js';
import { createLegacyDrawBridgeRequest, createLegacyDrawReference } from '../core-shell/assets/core-legacy-draw-bridge-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/fixtures/tool-bridge-v1.valid.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/schemas/tool-bridge-v1.schema.json'), 'utf8'));
const moduleSource = fs.readFileSync(path.join(root, 'core-shell/assets/core-tool-bridge-contracts.js'), 'utf8');
const legacySource = fs.readFileSync(path.join(root, 'core-shell/assets/core-legacy-draw-bridge-contract.js'), 'utf8');

assert.equal(schema.$defs.toolDescriptor.additionalProperties, false);
assert.equal(schema.$defs.request.additionalProperties, false);
assert.equal(schema.$defs.event.additionalProperties, false);
assert.deepEqual(BRIDGE_API_VERSIONS, ['1']);
assert.deepEqual(CORE_TOOL_IDS.slice(0, 8), ['pixiedraw', 'pixiedraw2', 'pixieaudio', 'pixigame', 'pixiruntime', 'pixfind', 'camera-image', 'market-package']);
assert.equal(BRIDGE_OPERATIONS.length, 24);
assert.ok(BRIDGE_COMPATIBILITY_STATES.includes('SUPPORTED_WITH_ADAPTER'));
assert.deepEqual(BRIDGE_REFERENCE_POLICIES, ['LIVE', 'PINNED', 'REVIEW', 'FORKED']);
assert.deepEqual(TOOL_BRIDGE_STORAGE_BOUNDARY.excludedFromBridge.includes('raw-pixel-buffer'), true);
for (const forbidden of ['document.', 'window.', 'AudioContext', 'indexedDB', 'BroadcastChannel', 'fetch(', 'Date.now', 'Math.random', 'Uint8Array', 'ArrayBuffer']) {
  assert.equal(moduleSource.includes(forbidden), false, `Bridge module must not depend on ${forbidden}`);
  assert.equal(legacySource.includes(forbidden), false, `Legacy Bridge must not depend on ${forbidden}`);
}

for (const descriptor of fixture.descriptors) assert.equal(validateToolDescriptor(descriptor).valid, true);
assert.equal(validateToolDescriptor({ ...fixture.descriptors[0], capabilities: [{ capabilityId: 'unknown.capability', version: '1', limits: {} }] }).diagnostics[0].code, 'BRIDGE_CAPABILITY_UNKNOWN');
assert.equal(validateToolDescriptor({ ...fixture.descriptors[0], toolId: 'bad tool' }).valid, false);
assert.equal(validateBridgeRequest(fixture.request).valid, true);
assert.equal(validateBridgeEvent(fixture.event).valid, true);
assert.equal(validateBridgeRequest({ ...fixture.request, payload: 'not-allowed' }).diagnostics[0].code, 'BRIDGE_UNKNOWN_FIELD');
assert.equal(validateBridgeRequest({ ...fixture.request, payloadMetadata: { base64: 'not-allowed' } }).diagnostics[0].code, 'BRIDGE_BLOB_PAYLOAD_FORBIDDEN');
assert.equal(validateBridgeRequest({ ...fixture.request, payloadMetadata: { description: 'x'.repeat(2048) } }).valid, false);

let sequence = 0;
let flagMode = 'enabled';
const sentEvents = [];
const callbacks = [];
const ids = new Map();
const nextId = (kind) => {
  sequence += 1;
  const value = `${kind}-${sequence}`;
  ids.set(kind, value);
  return value;
};
const clock = () => `synthetic:${sequence}`;
const featureFlagEvaluator = ({ flagId }) => {
  if (flagMode === 'kill') return { enabled: false, decision: 'fallback', code: 'FEATURE_FLAG_KILL_SWITCH', flagId };
  if (flagMode === flagId) return { enabled: false, decision: 'fallback', code: 'FEATURE_FLAG_OFF_FALLBACK', flagId };
  if (flagMode === 'off') return { enabled: false, decision: 'fallback', code: 'FEATURE_FLAG_OFF_FALLBACK', flagId };
  return { enabled: true, decision: 'enabled', code: 'FEATURE_FLAG_ENABLED', flagId };
};
const permissionEvaluator = ({ actorId, projectId, assetRefs, operation }) => {
  if (actorId !== 'user-owner') return { ok: false, decision: 'deny', source: 'server', code: 'BRIDGE_PERMISSION_DENIED' };
  if (projectId === 'project-private-other' || assetRefs.some((reference) => reference.assetId === 'asset-private-other')) return { ok: false, decision: 'deny', source: 'server', code: 'BRIDGE_PERMISSION_DENIED' };
  return { ok: true, decision: 'allow', source: 'server', operation };
};
const handlers = {
  'project.open': ({ request }) => ({ resultReference: { projectId: request.projectId }, updatedProjectReferences: [{ projectId: request.projectId }] }),
  'project.resolve-legacy': ({ request }) => ({ resultReference: { projectId: request.projectId }, compatibilityWarnings: ['legacy adapter retained source'] }),
  'asset.revision.resolve': ({ request }) => ({ resultReference: request.assetRefs[0] }),
};
const bridge = createToolBridge({ clock, idGenerator: nextId, transport: { send: (message) => sentEvents.push(message) }, permissionEvaluator, featureFlagEvaluator, handlers });
const registrationDecision = { source: 'server', ok: true, decision: 'allow' };
for (const descriptor of fixture.descriptors) bridge.registerTool(descriptor, { registrationDecision });
bridge.registerTool({
  toolId: 'pixiedraw',
  displayKind: 'DRAW',
  bridgeApiVersion: '1',
  toolVersion: '1.0.0',
  supportedProjectKinds: ['DRAW'],
  supportedAssetKinds: ['RASTER_IMAGE', 'ANIMATION', 'PALETTE'],
  supportedImportFormats: [{ formatId: 'pxd', versions: ['archive-v2'], requiredAdapter: 'legacy-pxd-adapter', copyRequired: true }],
  supportedExportFormats: [{ formatId: 'pxd', versions: ['archive-v2'] }],
  capabilities: [
    { capabilityId: 'project.open', version: '1', limits: {} },
    { capabilityId: 'project.resolve-legacy', version: '1', limits: {} },
    { capabilityId: 'legacy.pxd.read', version: '1', limits: {} },
    { capabilityId: 'legacy.pixisync.read', version: '1', limits: {} },
  ],
  featureRequirements: [TOOL_BRIDGE_FLAGS.read, TOOL_BRIDGE_FLAGS.legacy],
  minimumCoreVersion: '1.0.0',
  maximumTestedCoreVersion: '1.9.0',
  availabilityState: 'AVAILABLE',
  legacyAdapterIds: ['legacy-pxd-adapter'],
}, { registrationDecision });
bridge.registerTool({
  toolId: 'pixieaudio',
  displayKind: 'AUDIO',
  bridgeApiVersion: '1',
  toolVersion: '1.0.0',
  supportedProjectKinds: ['AUDIO'],
  supportedAssetKinds: ['AUDIO', 'MUSIC_PROJECT', 'SOUND_EFFECT'],
  supportedImportFormats: [{ formatId: 'pixiaudio-project', versions: ['1'] }, { formatId: 'wav', versions: ['1'] }],
  supportedExportFormats: [{ formatId: 'pixiaudio-project', versions: ['1'] }],
  capabilities: [
    { capabilityId: 'project.open', version: '1', limits: {} },
    { capabilityId: 'asset.revision.create', version: '1', limits: {} },
    { capabilityId: 'asset.live-reference', version: '1', limits: {} },
  ],
  featureRequirements: [TOOL_BRIDGE_FLAGS.read, TOOL_BRIDGE_FLAGS.liveEvents],
  minimumCoreVersion: '1.0.0',
  maximumTestedCoreVersion: '1.9.0',
  availabilityState: 'AVAILABLE',
  legacyAdapterIds: [],
}, { registrationDecision });
bridge.registerTool({
  toolId: 'market-package',
  displayKind: 'MARKET_PACKAGE',
  bridgeApiVersion: '1',
  toolVersion: '1.0.0',
  supportedProjectKinds: ['OTHER_REGISTERED'],
  supportedAssetKinds: ['PACKAGE'],
  supportedImportFormats: [],
  supportedExportFormats: [],
  capabilities: [{ capabilityId: 'package.create', version: '1', limits: {} }],
  featureRequirements: [TOOL_BRIDGE_FLAGS.package],
  minimumCoreVersion: '1.0.0',
  maximumTestedCoreVersion: '1.9.0',
  availabilityState: 'COMING_LATER',
  legacyAdapterIds: [],
}, { registrationDecision });

assert.throws(() => bridge.registerTool(fixture.descriptors[0], { registrationDecision }), (error) => error.code === 'BRIDGE_TOOL_DUPLICATE');
assert.throws(() => bridge.registerTool({ ...fixture.descriptors[0], toolId: 'tool-untrusted' }, { registrationDecision: { source: 'client', ok: true, decision: 'allow' } }), (error) => error.code === 'BRIDGE_TOOL_REGISTRATION_UNTRUSTED');
assert.equal(bridge.getTool('tool-not-registered'), null);

const authorization = { source: 'server', ok: true, decision: 'allow', actorId: 'user-owner', toolId: 'pixiedraw2', capability: 'project.open', sourceAccess: true };
const negotiate = bridge.negotiateCapabilities({ toolId: 'pixiedraw2', toolVersion: '2.0.0', requestedCapabilities: [{ capabilityId: 'asset.read', version: '1', limits: {} }], authorization });
assert.equal(negotiate.capabilities[0].version, '2');
assert.throws(() => bridge.negotiateCapabilities({ toolId: 'pixiedraw2', toolVersion: '9.0.0', requestedCapabilities: [], authorization }), (error) => error.code === 'BRIDGE_TOOL_VERSION_UNSUPPORTED');
assert.throws(() => bridge.negotiateCapabilities({ toolId: 'pixiedraw2', requestedCapabilities: ['unknown.capability'], authorization }), (error) => error.code === 'BRIDGE_CAPABILITY_UNKNOWN');
assert.throws(() => bridge.negotiateCapabilities({ toolId: 'pixiedraw2', requestedCapabilities: ['asset.read'], advertisedCapabilities: ['asset.live-reference'], authorization }), (error) => error.code === 'BRIDGE_CAPABILITY_SPOOF');

const makeRequest = (overrides = {}) => {
  const base = {
    ...fixture.request,
    requestId: `request-${++sequence}`,
    correlationId: `correlation-${sequence}`,
    idempotencyKey: `idempotency-${sequence}`,
    createdAt: clock(),
    authorization: { ...authorization },
  };
  return { ...base, ...overrides, authorization: { ...base.authorization, ...(overrides.authorization || {}) } };
};
const openRequest = makeRequest();
const opened = bridge.executeRequest(openRequest);
assert.equal(opened.status, 'COMPLETED');
assert.equal(opened.resultReference.projectId, 'project-draw2');
const retry = bridge.executeRequest({ ...openRequest, requestId: 'request-retry', correlationId: 'correlation-retry' });
assert.equal(retry.idempotentReplay, true);
assert.equal(retry.status, 'COMPLETED');
assert.equal(bridge.executeRequest({ ...openRequest, idempotencyKey: 'idempotency-new' }).diagnostic.code, 'BRIDGE_REQUEST_DUPLICATE');
assert.equal(bridge.executeRequest(makeRequest({ toolId: 'unknown-tool', authorization: { toolId: null, capability: null } })).diagnostic.code, 'BRIDGE_TOOL_UNKNOWN');
assert.equal(bridge.executeRequest(makeRequest({ bridgeApiVersion: '2' })).diagnostic.code, 'BRIDGE_VERSION_UNSUPPORTED');
assert.equal(bridge.executeRequest(makeRequest({ toolId: 'pixigame', authorization: { toolId: 'pixiedraw2', capability: 'project.open' } })).diagnostic.code, 'BRIDGE_TOOL_SPOOF');
assert.equal(bridge.executeRequest(makeRequest({ authorization: { actorId: 'user-other' } })).diagnostic.code, 'BRIDGE_PERMISSION_DENIED');
assert.equal(bridge.executeRequest(makeRequest({ projectId: 'project-private-other' })).diagnostic.code, 'BRIDGE_PERMISSION_DENIED');
assert.equal(bridge.executeRequest(makeRequest({ assetRefs: [{ assetId: 'asset-private-other' }] })).diagnostic.code, 'BRIDGE_PERMISSION_DENIED');
assert.equal(bridge.executeRequest(makeRequest({ payloadMetadata: { accessSurface: 'source' }, authorization: { sourceAccess: false } })).diagnostic.code, 'BRIDGE_SOURCE_ACCESS_ESCALATION');
assert.equal(bridge.executeRequest(makeRequest({ authorization: { capability: 'asset.read' } })).diagnostic.code, 'BRIDGE_CAPABILITY_SPOOF');

const compatible = bridge.validateCompatibility({ toolId: 'pixiedraw2', projectKind: 'DRAW2', formatId: 'pxd', formatVersion: 'archive-v2', direction: 'import' });
assert.equal(compatible.state, 'SUPPORTED_WITH_ADAPTER');
assert.equal(compatible.requiredAdapter, 'legacy-pxd-adapter');
assert.equal(compatible.copyRequired, true);
assert.equal(bridge.validateCompatibility({ toolId: 'pixigame', assetKind: 'AUDIO', formatId: 'wav', formatVersion: '1', direction: 'export' }).state, 'READ_ONLY');
assert.equal(bridge.validateCompatibility({ toolId: 'pixigame', assetKind: 'AUDIO', formatId: 'flac', formatVersion: '1', direction: 'import' }).state, 'UNSUPPORTED');
assert.equal(bridge.validateCompatibility({ toolId: 'pixiedraw2', formatId: 'pxd', formatVersion: 'archive-v2', direction: 'import', legacyState: 'QUARANTINED' }).state, 'QUARANTINED');
assert.equal(BRIDGE_COMPATIBILITY_STATES.includes('REVIEW_REQUIRED'), true);

const pending = bridge.beginRequest(makeRequest({ operation: 'project.open' }));
assert.equal(pending.status, 'ACCEPTED');
assert.equal(bridge.cancelRequest(pending.requestId).result.status, 'CANCELLED');
const completeThenCancel = bridge.executeRequest(makeRequest({ operation: 'project.open' }));
assert.equal(completeThenCancel.status, 'COMPLETED');
assert.equal(bridge.cancelRequest(completeThenCancel.requestId).diagnostics[0].code, 'BRIDGE_CANCEL_TOO_LATE');
assert.equal(bridge.cancelRequest('request-missing').diagnostics[0].code, 'BRIDGE_REQUEST_UNKNOWN');

const subscriptionMessages = [];
bridge.subscribeAssetUpdates({ subscriptionId: 'subscription-game-raster', toolId: 'pixigame', assetId: 'asset-raster', callback: (event) => subscriptionMessages.push(event), authorization: { ...authorization, toolId: 'pixigame', capability: 'asset.live-reference' } });
const liveEvent = bridge.emitEvent(createBridgeEvent({ eventId: 'event-raster-live', originToolId: 'pixiedraw2', targetToolId: 'pixigame', eventType: 'REVISION_CHANGED', projectId: 'project-draw2', assetId: 'asset-raster', revisionId: 'revision-raster-2', correlationId: 'correlation-live', payloadMetadata: { referencePolicy: 'LIVE', change: 'head' } }));
assert.equal(liveEvent.ok, true);
assert.equal(liveEvent.delivered, 1);
assert.equal(subscriptionMessages[0].revisionId, 'revision-raster-2');
assert.equal(sentEvents.length, 1);
assert.equal(bridge.emitEvent(createBridgeEvent({ eventId: 'event-raster-live', originToolId: 'pixiedraw2', targetToolId: 'pixigame', eventType: 'REVISION_CHANGED', assetId: 'asset-raster', revisionId: 'revision-raster-2', correlationId: 'correlation-live' })).diagnostics[0].code, 'BRIDGE_EVENT_DUPLICATE');
assert.equal(bridge.emitEvent(createBridgeEvent({ eventId: 'event-loop', originToolId: 'pixiedraw2', targetToolId: 'pixigame', eventType: 'INVALIDATE', assetId: 'asset-raster', correlationId: 'correlation-loop', visitedToolIds: ['pixigame'] })).diagnostics[0].code, 'BRIDGE_EVENT_CYCLE');
assert.equal(bridge.emitEvent(createBridgeEvent({ eventId: 'event-bad-causation', originToolId: 'pixiedraw2', targetToolId: 'pixigame', eventType: 'INVALIDATE', assetId: 'asset-raster', correlationId: 'correlation-bad-causation', causationId: 'event-unknown', causationChain: ['event-unknown'] })).diagnostics[0].code, 'BRIDGE_CAUSATION_UNKNOWN');
assert.equal(validateBridgeEvent({ eventId: 'event-chain-duplicate', bridgeApiVersion: '1', originToolId: 'pixiedraw2', targetToolId: null, eventType: 'INVALIDATE', projectId: null, assetId: 'asset-raster', revisionId: null, correlationId: 'correlation-chain', causationId: null, eventChainDepth: 0, causationChain: [], visitedToolIds: ['pixigame', 'pixigame'], payloadMetadata: {} }).diagnostics[0].code, 'BRIDGE_EVENT_VISIT_CYCLE');
assert.ok(BRIDGE_EVENT_TYPES.includes('UPDATE_AVAILABLE'));

const legacy = createLegacyDrawReference({
  currentProjectId: 'project-legacy-draw',
  pxdReference: { projectId: 'project-legacy-draw', formatId: 'pxd', formatVersion: 'archive-v2', storageHandleRef: 'handle:pxd-legacy-1' },
  pixisyncReference: { projectId: 'project-legacy-draw', revisionId: 'revision-pixisync-1' },
  assetReferences: [{ assetId: 'asset-legacy-raster', revisionId: 'revision-legacy-raster' }],
  compatibilityState: 'SUPPORTED_WITH_ADAPTER',
});
assert.equal(legacy.toolId, 'pixiedraw');
assert.equal(legacy.copyRequired, true);
assert.throws(() => createLegacyDrawReference({ currentProjectId: 'project-legacy-draw', pxdReference: { projectId: 'project-other', formatId: 'pxd', formatVersion: 'archive-v2' } }), (error) => error.code === 'LEGACY_DRAW_PROJECT_MISMATCH');
assert.throws(() => createLegacyDrawReference({ currentProjectId: 'project-legacy-draw', pxdReference: { formatId: 'pxd', formatVersion: 'archive-v2', bytes: 'forbidden' } }), (error) => error.code === 'LEGACY_DRAW_UNKNOWN_FIELD');
const legacyRequest = createLegacyDrawBridgeRequest({
  bridge,
  referenceInput: { currentProjectId: 'project-legacy-draw', pxdReference: { projectId: 'project-legacy-draw', formatId: 'pxd', formatVersion: 'archive-v2', storageHandleRef: 'handle:pxd-legacy-2' } },
  requestFactory: ({ toolId, operation, projectId, payloadMetadata }) => createBridgeRequest({ requestId: 'legacy-request-1', toolId, operation, projectId, payloadMetadata, correlationId: 'legacy-correlation-1', idempotencyKey: 'legacy-idempotency-1', createdAt: clock(), authorization: { source: 'server', ok: true, decision: 'allow', actorId: 'user-owner', toolId: 'pixiedraw', capability: 'project.resolve-legacy', sourceAccess: true } }),
});
assert.equal(legacyRequest.legacyReference.legacySystem, 'pixiedraw-current');
assert.equal(legacyRequest.execute().status, 'COMPLETED');

flagMode = 'off';
assert.equal(bridge.executeRequest(makeRequest({ operation: 'project.open' })).diagnostic.code, 'BRIDGE_FLAG_OFF');
flagMode = TOOL_BRIDGE_FLAGS.liveEvents;
assert.throws(() => bridge.subscribeAssetUpdates({ toolId: 'pixigame', assetId: 'asset-raster', callback: () => {}, authorization: { ...authorization, toolId: 'pixigame', capability: 'asset.live-reference' } }), (error) => error.code === 'BRIDGE_FLAG_OFF');
flagMode = TOOL_BRIDGE_FLAGS.legacy;
assert.equal(bridge.executeRequest(makeRequest({ toolId: 'pixiedraw', operation: 'project.resolve-legacy', authorization: { ...authorization, toolId: 'pixiedraw', capability: 'project.resolve-legacy' } })).diagnostic.code, 'BRIDGE_FLAG_OFF');
flagMode = 'kill';
assert.equal(bridge.executeRequest(makeRequest({ operation: 'project.open' })).diagnostic.code, 'BRIDGE_KILL_SWITCH');
flagMode = 'enabled';

const bridgeSnapshot = bridge.snapshot();
const serializedSnapshot = JSON.stringify(bridgeSnapshot);
const serializedBridgeRecords = JSON.stringify({ requests: bridgeSnapshot.requests, events: bridgeSnapshot.events });
assert.equal(serializedBridgeRecords.includes('storageLocator'), false);
assert.equal(serializedBridgeRecords.includes('base64'), false);
assert.equal(serializedSnapshot.includes('raw-pixel-buffer'), true, 'Snapshot may expose the contract exclusion list, not payload bytes.');
assert.equal(bridge.unsubscribeAssetUpdates('subscription-game-raster').ok, true);

console.log(JSON.stringify({
  workPackage: 'WP-093',
  schemaVersion: 1,
  bridgeApiVersions: BRIDGE_API_VERSIONS,
  registeredTools: Object.keys(bridgeSnapshot.tools),
  operationsCovered: BRIDGE_OPERATIONS.length,
  capabilitiesCovered: TOOL_BRIDGE_CAPABILITIES.length,
  compatibilityStates: BRIDGE_COMPATIBILITY_STATES,
  eventTypes: BRIDGE_EVENT_TYPES,
  failureFixtures: 31,
  blobPayloadsTransferred: 0,
  transportMessages: sentEvents.length,
  status: 'pass',
}, null, 2));
