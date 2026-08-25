#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVENT_ACTIVITY_CONTRACT,
  EVENT_CATALOG,
  EVENT_CORE_FLAGS,
  EVENT_CORE_LIMITS,
  EVENT_PRODUCER_TYPES,
  EVENT_TYPES,
  EVENT_VISIBILITY_CLASSES,
  createEventActivityCore,
  validateActivityProjection,
  validateEventEnvelope,
} from '../core-shell/assets/core-event-activity-contracts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = fs.readFileSync(path.join(root, 'core-shell/assets/core-event-activity-contracts.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/fixtures/event-activity-v1.valid.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/schemas/event-activity-v1.schema.json'), 'utf8'));
const clone = value => structuredClone(value);

const allow = capability => ({ ok: true, decision: 'allow', source: 'server', capability });
const trustedProducers = [
  { producerId: 'asset-registry-v1', producerVersion: '1.0.0', producerType: 'ASSET_REGISTRY' },
  { producerId: 'project-registry-v1', producerVersion: '1.0.0', producerType: 'PROJECT_REGISTRY' },
  { producerId: 'package-registry-v1', producerVersion: '1.0.0', producerType: 'PACKAGE_REGISTRY' },
  { producerId: 'tool-bridge-v1', producerVersion: '1.0.0', producerType: 'TOOL_BRIDGE' },
  { producerId: 'core-system-v1', producerVersion: '1.0.0', producerType: 'CORE_SYSTEM' },
];
const allFlags = ({ flagId, action }) => ({ flagId, action, enabled: true, decision: 'enabled', serverAuthorized: true });

assert.equal(EVENT_ACTIVITY_CONTRACT.schemaVersion, 1);
assert.equal(EVENT_ACTIVITY_CONTRACT.envelopeVersion, 1);
for (const requiredType of ['ACCOUNT_STATE_CHANGED', 'PROJECT_CREATED', 'ASSET_REVISION_CREATED', 'ASSET_HEAD_CHANGED', 'TOOL_AVAILABLE', 'PACKAGE_VERIFIED', 'PACKAGE_READY', 'PACKAGE_FAILED', 'PACKAGE_QUARANTINED', 'PACKAGE_ARCHIVED']) assert.ok(EVENT_TYPES.includes(requiredType));
assert.deepEqual(EVENT_VISIBILITY_CLASSES, ['PRIVATE', 'PROJECT_MEMBERS', 'CREATOR_PRIVATE', 'UNLISTED', 'PUBLIC']);
assert.ok(EVENT_PRODUCER_TYPES.includes('ASSET_REGISTRY'));
assert.equal(schema.$defs.event.properties.schemaVersion.const, 1);
assert.equal(schema.$defs.event.additionalProperties, false);
assert.ok(schema.$defs.event.required.includes('causationId'));
assert.equal(validateEventEnvelope(fixture).valid, true);
assert.equal(validateEventEnvelope({ ...fixture, eventType: 'CREATE_ASSET_REQUESTED' }).diagnostics[0].code, 'EVENT_ENUM_UNSUPPORTED');
assert.equal(validateEventEnvelope({ ...fixture, eventType: 'PIXEL_CHANGED' }).diagnostics[0].code, 'EVENT_HIGH_FREQUENCY_FORBIDDEN');
assert.equal(validateEventEnvelope({ ...fixture, eventVersion: 2 }).diagnostics[0].code, 'EVENT_VERSION_UNSUPPORTED');
assert.equal(validateEventEnvelope({ ...fixture, eventId: 'event invalid' }).diagnostics[0].code, 'EVENT_TYPED_ID_INVALID');
assert.equal(validateEventEnvelope({ ...fixture, aggregateType: 'PACKAGE' }).diagnostics[0].code, 'EVENT_AGGREGATE_INVALID');
assert.equal(validateEventEnvelope({ ...fixture, payload: { blob: 'forbidden' } }).diagnostics[0].code, 'EVENT_PRIVATE_PAYLOAD_FORBIDDEN');
assert.equal(validateEventEnvelope({ ...fixture, payload: { encoded: 'data:image/png;base64,AAAA' } }).diagnostics[0].code, 'EVENT_PRIVATE_PAYLOAD_FORBIDDEN');
assert.equal(validateEventEnvelope({ ...fixture, payload: { email: 'creator@example.com' } }).diagnostics[0].code, 'EVENT_PRIVATE_PAYLOAD_FORBIDDEN');
const deepPayload = { nested: { one: { two: { three: { four: { five: { six: { seven: true } } } } } } } };
assert.equal(validateEventEnvelope({ ...fixture, payload: deepPayload }).diagnostics[0].code, 'EVENT_PAYLOAD_TOO_DEEP');
assert.equal(validateEventEnvelope({ ...fixture, payload: { huge: 'x'.repeat(2049) } }).diagnostics[0].code, 'EVENT_PRIVATE_PAYLOAD_FORBIDDEN');
assert.equal(validateActivityProjection({ activityId: 'activity-1', sourceEventId: 'event-1', activityType: 'ASSET_HEAD_CHANGED', actorReference: null, objectReference: {}, projectReference: null, occurredAt: fixture.occurredAt, visibility: 'PUBLIC', presentationKey: 'activity.asset.headChanged', metadata: { renderedText: 'not required' } }).valid, true);
assert.doesNotMatch(moduleSource, /\b(?:document|window|indexedDB|localStorage|fetch|BroadcastChannel|setTimeout|setInterval)\b/u);
for (const forbiddenToken of ['HTMLCanvasElement', 'OffscreenCanvas', 'CanvasRenderingContext2D', 'AudioContext', 'WebSocket', 'Math.random']) assert.equal(moduleSource.includes(forbiddenToken), false, `Event Core must not depend on ${forbiddenToken}`);

const makeEvent = (overrides = {}) => ({
  ...clone(fixture),
  ...overrides,
  producer: { ...clone(fixture.producer), ...(overrides.producer || {}) },
  payload: { ...clone(fixture.payload), ...(overrides.payload || {}) },
});
const eventV1 = makeEvent({ eventId: 'event-asset-revision-1', eventType: 'ASSET_REVISION_CREATED', aggregateVersion: 1, causationId: null, causationDepth: 0, causationChain: [], payload: { revisionId: 'revision-character-1', reasonCode: 'DRAW_REVISION_COMMITTED' } });
const eventV2 = makeEvent({ eventId: 'event-asset-head-2', eventType: 'ASSET_HEAD_CHANGED', aggregateVersion: 2, causationId: eventV1.eventId, causationDepth: 0, causationChain: [], payload: { previousRevisionId: 'revision-character-1', newRevisionId: 'revision-character-2', reasonCode: 'DRAW_HEAD_CHANGED' } });
const eventAudio = makeEvent({ eventId: 'event-audio-revision-1', eventType: 'ASSET_REVISION_CREATED', aggregateId: 'asset-bgm', assetId: 'asset-bgm', aggregateVersion: 1, causationId: null, payload: { revisionId: 'revision-bgm-1', reasonCode: 'AUDIO_REVISION_COMMITTED' } });
const eventPackageReady = makeEvent({ eventId: 'event-package-ready-1', eventType: 'PACKAGE_READY', producer: { producerId: 'package-registry-v1', producerType: 'PACKAGE_REGISTRY' }, aggregateType: 'PACKAGE', aggregateId: 'package-game-1', aggregateVersion: 1, projectId: 'project-game-1', assetId: null, packageId: 'package-game-1', visibilityClass: 'PUBLIC', payload: { packageVersion: '1.0.0', contentHash: 'a'.repeat(64), reasonCode: 'PACKAGE_VERIFIED' } });
const eventProjectPrivate = makeEvent({ eventId: 'event-project-private-1', eventType: 'PROJECT_CREATED', producer: { producerId: 'project-registry-v1', producerType: 'PROJECT_REGISTRY' }, aggregateType: 'PROJECT', aggregateId: 'project-private-1', aggregateVersion: 1, projectId: 'project-private-1', assetId: null, visibilityClass: 'PRIVATE', payload: { reasonCode: 'PROJECT_CREATED' } });

const makeHarness = ({ flags = allFlags, transactionMode = 'success', publisherMode = 'success', dependency = null } = {}) => {
  let sequence = 0;
  const transactions = [];
  const published = [];
  const backoffs = [];
  let publishAttempts = 0;
  const core = createEventActivityCore({
    clock: () => '2026-08-07T00:00:00.000Z',
    idGenerator: prefix => `${prefix}-${++sequence}`,
    featureFlagEvaluator: flags,
    trustedProducers,
    transactionAdapter: input => {
      transactions.push(clone(input));
      if (transactionMode === 'failure') return { ok: false, committed: false, code: 'EVENT_STATE_COMMIT_FAILED' };
      return { ok: true, committed: true, transactionId: `tx-${transactions.length}` };
    },
    publisher: ({ event, attempt }) => {
      publishAttempts += 1;
      if (publisherMode === 'retry-then-success' && publishAttempts < 3) return { ok: false, retryable: true, code: 'TEMPORARY_TRANSPORT' };
      if (publisherMode === 'poison') return { ok: false, retryable: false, code: 'POISON_EVENT' };
      published.push({ event, attempt });
      return { ok: true };
    },
    backoffAdapter: ({ attempt }) => { backoffs.push(attempt); return attempt * 100; },
    visibilityEvaluator: () => ({ ok: true, decision: 'allow', source: 'server' }),
  });
  return { core, transactions, published, backoffs, getPublishAttempts: () => publishAttempts, dependency };
};

const happy = makeHarness();
const firstCommit = happy.core.commitFact({ event: eventV1, stateChange: { revisionId: 'revision-character-1', state: 'CONFIRMED' }, permissionDecision: allow('event.write') });
assert.equal(firstCommit.ok, true, JSON.stringify(firstCommit));
assert.equal(firstCommit.committed, true);
assert.equal(happy.transactions.length, 1);
assert.equal(happy.transactions[0].outboxRow.eventId, eventV1.eventId);
assert.equal(happy.core.snapshot().eventOrder.length, 1);
const secondCommit = happy.core.commitFact({ event: eventV2, stateChange: { headRevisionId: 'revision-character-2' }, permissionDecision: allow('event.write') });
assert.equal(secondCommit.ok, true, JSON.stringify(secondCommit));
assert.equal(secondCommit.event.causationDepth, 1);
assert.deepEqual(secondCommit.event.causationChain, [eventV1.eventId]);
assert.equal(happy.core.snapshot().outbox.length, 2);
assert.equal(happy.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') }).diagnostics[0].code, 'EVENT_DUPLICATE');
assert.equal(happy.core.commitFact({ event: makeEvent({ eventId: 'event-unknown-cause', aggregateVersion: 3, causationId: 'event-not-found' }), permissionDecision: allow('event.write') }).diagnostics[0].code, 'EVENT_CAUSATION_UNKNOWN');
assert.equal(happy.core.commitFact({ event: makeEvent({ eventId: eventV1.eventId, aggregateVersion: 3, causationId: eventV2.eventId }), permissionDecision: allow('event.write') }).diagnostics[0].code, 'EVENT_CAUSATION_CYCLE');
assert.equal(happy.core.commitFact({ event: makeEvent({ eventId: 'event-stale-version', aggregateVersion: 2, causationId: null }), permissionDecision: allow('event.write') }).diagnostics[0].code, 'EVENT_STALE_AGGREGATE_VERSION');
const transactionFailure = makeHarness({ transactionMode: 'failure' });
const txFailed = transactionFailure.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') });
assert.equal(txFailed.diagnostics[0].code, 'EVENT_STATE_COMMIT_FAILED');
assert.equal(transactionFailure.core.snapshot().eventOrder.length, 0);
const writeOff = makeHarness({ flags: input => ({ ...input, enabled: input.flagId !== EVENT_CORE_FLAGS.write, decision: input.flagId !== EVENT_CORE_FLAGS.write ? 'enabled' : 'fallback' }) });
const writeOffResult = writeOff.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') });
assert.equal(writeOffResult.diagnostics[0].code, 'EVENT_FLAG_OFF');
assert.equal(writeOff.transactions.length, 0);
const spoofed = makeEvent({ eventId: 'event-client-spoof', producer: { producerId: 'client-event', producerVersion: '1.0.0', producerType: 'CORE_SYSTEM' } });
assert.equal(happy.core.commitFact({ event: spoofed, permissionDecision: allow('event.write') }).diagnostics[0].code, 'EVENT_PRODUCER_UNAUTHORIZED');
assert.equal(happy.core.registerProducer({ producer: { producerId: 'client-producer', producerVersion: '1.0.0', producerType: 'CORE_SYSTEM' }, permissionDecision: { ok: true, decision: 'allow', source: 'client' } }).diagnostics[0].code, 'EVENT_PERMISSION_DENIED');

const gameUpdates = [];
assert.equal(happy.core.registerConsumer({ consumerId: 'game-preview', handler: ({ event, replay, sideEffectAllowed }) => { gameUpdates.push({ eventId: event.eventId, assetId: event.assetId, replay, sideEffectAllowed }); return { ok: true }; }, permissionDecision: allow('event.consumer.register') }).ok, true);
const gap = happy.core.consume({ consumerId: 'game-preview', event: eventV2 });
assert.equal(gap.diagnostics[0].code, 'EVENT_VERSION_GAP');
assert.equal(happy.core.consume({ consumerId: 'game-preview', event: eventV1 }).processed, true);
assert.equal(happy.core.consume({ consumerId: 'game-preview', event: eventV2 }).processed, true);
const duplicateDelivery = happy.core.consume({ consumerId: 'game-preview', event: eventV2 });
assert.equal(duplicateDelivery.idempotentReplay, true);
assert.equal(gameUpdates.length, 2);
const staleEvent = makeEvent({ eventId: 'event-old-replay', aggregateVersion: 1, causationId: null });
assert.equal(happy.core.consume({ consumerId: 'game-preview', event: staleEvent }).diagnostics[0].code, 'EVENT_STALE_AGGREGATE_VERSION');

const audioUpdates = [];
assert.equal(happy.core.registerConsumer({ consumerId: 'game-audio-preview', handler: ({ event }) => { audioUpdates.push(event.assetId); return { ok: true }; }, permissionDecision: allow('event.consumer.register') }).ok, true);
assert.equal(happy.core.consume({ consumerId: 'game-audio-preview', event: eventAudio }).processed, true);
assert.deepEqual(audioUpdates, ['asset-bgm']);
assert.equal(happy.core.dispatchOutbox({ batchSize: 2 }).dispatched, 2);
assert.equal(happy.core.snapshot().outbox.every(row => row.status === 'DISPATCHED'), true);

const packageEvent = happy.core.commitFact({ event: eventPackageReady, permissionDecision: allow('event.write') });
assert.equal(packageEvent.ok, true, JSON.stringify(packageEvent));
const packageActivity = happy.core.createActivity({ eventId: eventPackageReady.eventId, requestedVisibility: 'PUBLIC' });
assert.equal(packageActivity.ok, true);
assert.equal(packageActivity.activity.presentationKey, 'activity.package.ready');
assert.equal(Object.prototype.hasOwnProperty.call(packageActivity.activity, 'text'), false);
assert.equal(happy.core.snapshot().activities[`${eventPackageReady.eventId}:PUBLIC`].visibility, 'PUBLIC');
assert.equal(happy.core.snapshot().activities[`${eventPackageReady.eventId}:PUBLIC`].objectReference.packageId, 'package-game-1');
const privateCommit = happy.core.commitFact({ event: eventProjectPrivate, permissionDecision: allow('event.write') });
assert.equal(privateCommit.ok, true);
assert.equal(happy.core.createActivity({ eventId: eventProjectPrivate.eventId, requestedVisibility: 'PUBLIC' }).diagnostics[0].code, 'EVENT_PRIVATE_ACTIVITY_FORBIDDEN');
const privateActivity = happy.core.createActivity({ eventId: eventProjectPrivate.eventId, requestedVisibility: 'PRIVATE' });
assert.equal(privateActivity.ok, true);
assert.equal(privateActivity.activity.visibility, 'PRIVATE');
const replayCalls = [];
assert.equal(happy.core.registerConsumer({ consumerId: 'activity-replay', handler: ({ event, replay, sideEffectAllowed }) => { replayCalls.push({ eventId: event.eventId, replay, sideEffectAllowed }); return { ok: true }; }, permissionDecision: allow('event.consumer.register') }).ok, true);
const replay = happy.core.replayProjection({ consumerId: 'activity-replay', eventIds: [eventV1.eventId, eventV2.eventId] });
assert.equal(replay.ok, true);
assert.equal(replay.externalSideEffects, 0);
assert.equal(replayCalls.every(call => call.replay === true && call.sideEffectAllowed === false), true);
assert.equal(happy.core.recordAudit({ auditId: 'audit-event-1', action: 'EVENT_COMMITTED', actorRef: fixture.actorRef, eventId: eventV1.eventId, result: 'allow', metadata: { reasonCode: 'synthetic' } }).ok, true);
assert.equal(happy.core.recordTelemetry({ telemetryId: 'telemetry-event-1', metric: 'dispatch_ms', value: 2, metadata: { surface: 'synthetic' } }).ok, true);
assert.equal(happy.core.snapshot().audit.length, 1);
assert.equal(happy.core.snapshot().telemetry.length, 1);
assert.equal(happy.core.snapshot().events[eventV1.eventId].eventType, 'ASSET_REVISION_CREATED');
assert.equal(Object.prototype.hasOwnProperty.call(happy.core.snapshot().events[eventV1.eventId], 'email'), false);

const retryHarness = makeHarness({ publisherMode: 'retry-then-success' });
assert.equal(retryHarness.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') }).ok, true);
assert.equal(retryHarness.core.dispatchOutbox().retried, 1);
assert.equal(retryHarness.core.dispatchOutbox().retried, 1);
assert.equal(retryHarness.core.dispatchOutbox().dispatched, 1);
assert.deepEqual(retryHarness.backoffs, [1, 2]);
const poisonHarness = makeHarness({ publisherMode: 'poison' });
assert.equal(poisonHarness.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') }).ok, true);
assert.equal(poisonHarness.core.dispatchOutbox().deadLettered, 1);
assert.equal(poisonHarness.core.snapshot().deadLetters.length, 1);
assert.equal(Object.prototype.hasOwnProperty.call(poisonHarness.core.snapshot().deadLetters[0], 'payload'), false);
const dispatchOff = makeHarness({ flags: input => ({ ...input, enabled: input.flagId !== EVENT_CORE_FLAGS.dispatch, decision: input.flagId !== EVENT_CORE_FLAGS.dispatch ? 'enabled' : 'fallback' }) });
assert.equal(dispatchOff.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') }).ok, true);
assert.equal(dispatchOff.core.dispatchOutbox().diagnostics[0].code, 'EVENT_FLAG_OFF');
assert.equal(dispatchOff.core.snapshot().outbox[0].status, 'PENDING');
const activityOff = makeHarness({ flags: input => ({ ...input, enabled: input.flagId !== EVENT_CORE_FLAGS.activity, decision: input.flagId !== EVENT_CORE_FLAGS.activity ? 'enabled' : 'fallback' }) });
assert.equal(activityOff.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') }).ok, true);
assert.equal(activityOff.core.createActivity({ eventId: eventV1.eventId }).diagnostics[0].code, 'EVENT_FLAG_OFF');
const killSwitch = makeHarness({ flags: input => ({ ...input, enabled: false, decision: 'fallback', code: 'FEATURE_FLAG_KILL_SWITCH' }) });
assert.equal(killSwitch.core.commitFact({ event: eventV1, permissionDecision: allow('event.write') }).diagnostics[0].code, 'EVENT_KILL_SWITCH');

console.log(JSON.stringify({
  workPackage: 'WP-095',
  eventTypes: EVENT_TYPES.length,
  catalogEntries: Object.keys(EVENT_CATALOG).length,
  producerTypes: EVENT_PRODUCER_TYPES.length,
  flags: Object.keys(EVENT_CORE_FLAGS).length,
  payloadLimitBytes: EVENT_CORE_LIMITS.payloadBytes,
  causationDepthLimit: EVENT_CORE_LIMITS.causationDepth,
  ordering: ['aggregateVersion', 'out-of-order', 'gap'],
  delivery: ['at-least-once', 'idempotent-consumer', 'retry', 'dead-letter'],
  activityProjection: true,
  financialLedgerImplemented: false,
  snsImplemented: false,
  highFrequencyEditorEventsAccepted: false,
  status: 'pass',
}, null, 2));
