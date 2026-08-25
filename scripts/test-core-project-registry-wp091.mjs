#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_REGISTRY_FLAGS,
  PROJECT_REGISTRY_SCHEMA_VERSION,
  PROJECT_REGISTRY_CONTRACT,
  PROJECT_STORAGE_BOUNDARY,
  PROJECT_COMMAND_TYPES,
  PROJECT_EVENT_TYPES,
  PROJECT_LIFECYCLE_STATES,
  PROJECT_VISIBILITIES,
  createProjectCommand,
  createProjectRegistry,
  createProjectSwitcherContract,
  validateProjectRecord,
} from '../core-shell/assets/core-project-registry-contracts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = fs.readFileSync(path.join(root, 'core-shell/assets/core-project-registry-contracts.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/fixtures/project-registry-v1.valid.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/schemas/project-registry-v1.schema.json'), 'utf8'));

assert.equal(PROJECT_REGISTRY_SCHEMA_VERSION, 1);
assert.ok(PROJECT_COMMAND_TYPES.includes('REQUEST_OWNERSHIP_TRANSFER'));
assert.ok(PROJECT_EVENT_TYPES.includes('PROJECT_LEGACY_MAPPING_QUARANTINED'));
assert.deepEqual(PROJECT_LIFECYCLE_STATES, ['ACTIVE', 'ARCHIVED', 'TRASHED', 'MIGRATING', 'QUARANTINED']);
assert.deepEqual(PROJECT_VISIBILITIES, ['PRIVATE', 'UNLISTED', 'PUBLIC']);
assert.ok(PROJECT_STORAGE_BOUNDARY.excludedFromRegistry.includes('pixel-blob'));
assert.equal(schema.properties.schemaVersion.const, 1);
assert.equal(validateProjectRecord(fixture).valid, true, 'valid Project Registry fixture should validate');

for (const forbiddenToken of ['document', 'window', 'Canvas', 'fetch(', 'indexedDB', 'XMLHttpRequest']) {
  assert.equal(moduleSource.includes(forbiddenToken), false, `Registry contract must not depend on ${forbiddenToken}`);
}

let sequence = 0;
let mode = 'enabled';
const adapters = {
  clock: () => '2026-08-07T00:00:00.000Z',
  idGenerator: prefix => `${prefix}-${++sequence}`,
  random: () => 0.25,
  network: { request: () => { throw new Error('network adapter must be called by an outer adapter, not the pure Registry'); } },
};
const featureFlagEvaluator = ({ flagId, action }) => {
  if (mode === 'off') return { flagId, action, enabled: false, decision: 'fallback', serverAuthorized: true, code: 'DEFAULT_OFF' };
  if (mode === 'read-on-write-off' && action === 'write') return { flagId, action, enabled: false, decision: 'fallback', serverAuthorized: true, code: 'WRITE_OFF' };
  if (mode === 'kill-switch') return { flagId, action, enabled: false, decision: 'fallback', serverAuthorized: true, code: 'FEATURE_FLAG_KILL_SWITCH' };
  return { flagId, action, enabled: true, decision: 'enabled', serverAuthorized: true };
};
const registry = createProjectRegistry({ adapters, featureFlagEvaluator });
const allow = capability => ({ ok: true, decision: 'allow', source: 'server', capability });
const command = (commandType, actorId, payload, expectedRecordVersion = null, capability = null, projectId = null) => createProjectCommand({
  commandType,
  projectId: commandType === 'CREATE_PROJECT' ? null : (projectId || 'project-main'),
  actorId,
  expectedRecordVersion,
  payload,
  permissionDecision: allow(capability),
  adapters,
});

const basePayload = (overrides = {}) => ({
  projectId: 'project-main',
  projectKind: 'DRAW2',
  toolId: 'pixiedraw2',
  formatId: 'pixipackage',
  formatVersion: '1',
  ownerType: 'USER',
  ownerId: 'user-owner',
  name: 'Main Project',
  visibility: 'PRIVATE',
  rootAssetId: 'asset-root',
  ...overrides,
});

const createMain = command('CREATE_PROJECT', 'user-owner', basePayload());
const created = registry.executeProjectCommand(createMain);
assert.equal(created.ok, true, 'create must succeed with enabled server flags');
assert.equal(created.result.project.recordVersion, 1);
assert.equal(created.result.project.lifecycleState, 'ACTIVE');
assert.deepEqual(registry.executeProjectCommand(createMain).result.project, created.result.project, 'repeated command must be idempotent');
assert.equal(registry.executeProjectCommand(command('CREATE_PROJECT', 'user-owner', basePayload())).ok, false, 'duplicate Project ID must fail');

assert.equal(registry.getProject({ projectId: 'missing-project', actorId: 'user-owner' }).ok, false);
assert.equal(registry.getProject({ projectId: 'bad/id', actorId: 'user-owner' }).diagnostics[0].code, 'PROJECT_ID_INVALID');
assert.equal(registry.validateProjectRecord({ ...fixture, projectKind: 'UNKNOWN' }).valid, false);
assert.equal(registry.validateProjectRecord({ ...fixture, toolId: 'unknown-tool' }).valid, false);
assert.equal(registry.validateProjectRecord({ ...fixture, formatId: 'pxd', formatVersion: '999' }).valid, false);
assert.equal(registry.validateProjectRecord({ ...fixture, ownerId: '' }).valid, false);
assert.equal(registry.validateProjectRecord({ ...fixture, metadata: { blob: 'bytes' } }).valid, false);
assert.equal(registry.validateProjectRecord({ ...fixture, metadata: { summary: 'x'.repeat(513) } }).valid, false);
assert.equal(registry.validateProjectRecord({ ...fixture, metadata: { cover: 'data:image/png;base64,AAAA' } }).valid, false);

const rename = command('RENAME_PROJECT', 'user-owner', { name: 'Renamed Project' }, 1, 'update');
const renamed = registry.executeProjectCommand(rename);
assert.equal(renamed.ok, true);
assert.equal(renamed.result.project.name, 'Renamed Project');
assert.equal(registry.executeProjectCommand(command('RENAME_PROJECT', 'user-owner', { name: 'Stale' }, 1, 'update')).diagnostics[0].code, 'PROJECT_RECORD_VERSION_CONFLICT');
assert.equal(registry.executeProjectCommand(command('RENAME_PROJECT', 'user-owner', { ownerId: 'user-attacker' }, 2, 'update')).diagnostics[0].code, 'PROJECT_COMMAND_INVALID', 'owner replacement is not a rename payload');

const publicCreate = registry.executeProjectCommand(command('CREATE_PROJECT', 'user-owner', basePayload({ projectId: 'project-public', name: 'Public', visibility: 'PUBLIC' })));
assert.equal(publicCreate.ok, true);
assert.equal(registry.getProject({ projectId: 'project-public', actorId: 'user-stranger' }).ok, true, 'public read is allowed');
assert.equal(registry.executeProjectCommand(command('RENAME_PROJECT', 'user-stranger', { name: 'Hijacked' }, 1, 'update', 'project-public')).ok, false, 'public visibility is not write permission');
const visibilityChange = registry.executeProjectCommand(command('CHANGE_VISIBILITY', 'user-owner', { visibility: 'UNLISTED' }, 1, 'visibility', 'project-public'));
assert.equal(visibilityChange.ok, true);
const formatChange = registry.executeProjectCommand(command('CHANGE_TOOL_FORMAT', 'user-owner', { projectKind: 'DRAW2', toolId: 'pixiedraw2', formatId: 'pxd', formatVersion: 'archive-v2' }, 2, 'tool', 'project-public'));
assert.equal(formatChange.ok, true);
const headRevision = registry.executeProjectCommand(command('UPDATE_HEAD_REVISION', 'user-owner', { headRevisionId: 'revision-public-2' }, 3, 'revision', 'project-public'));
assert.equal(headRevision.ok, true);
const ownershipRequest = registry.executeProjectCommand(command('REQUEST_OWNERSHIP_TRANSFER', 'user-owner', { targetOwnerType: 'TEAM', targetOwnerId: 'team-pixieed', reason: 'future audited transfer' }, 4, 'ownership', 'project-public'));
assert.equal(ownershipRequest.ok, true);
assert.equal(ownershipRequest.result.project.ownerId, 'user-owner', 'ownership transfer is request-only');
assert.equal(ownershipRequest.result.event.payload.downstreamMutations, 'none', 'transfer event carries no downstream rights body');
assert.equal(registry.getProject({ projectId: 'project-main', actorId: null, identityKnown: false }).diagnostics[0].metadata.httpStatus, 404, 'private guessed existence is concealed');
assert.equal(registry.getProject({ projectId: 'project-main', actorId: 'known-stranger', identityKnown: true }).diagnostics[0].metadata.httpStatus, 403, 'known denied principal receives forbidden');

const addMember = registry.executeProjectCommand(command('ADD_MEMBER', 'user-owner', { principalId: 'user-editor', role: 'EDITOR' }, 2, 'member'));
assert.equal(addMember.ok, true);
assert.equal(registry.getProject({ projectId: 'project-main', actorId: 'user-editor' }).ok, true);
const removeMember = registry.executeProjectCommand(command('REMOVE_MEMBER', 'user-owner', { principalId: 'user-editor' }, 3, 'member'));
assert.equal(removeMember.ok, true);
assert.equal(registry.getProject({ projectId: 'project-main', actorId: 'user-editor', membershipVersion: 1 }).diagnostics[0].code, 'PROJECT_SESSION_STALE');

const archive = registry.executeProjectCommand(command('ARCHIVE_PROJECT', 'user-owner', {}, 4, 'archive'));
assert.equal(archive.ok, true);
const restore = registry.executeProjectCommand(command('RESTORE_PROJECT', 'user-owner', {}, 5, 'restore'));
assert.equal(restore.ok, true);
const trash = registry.executeProjectCommand(command('TRASH_PROJECT', 'user-owner', {}, 6, 'trash'));
assert.equal(trash.ok, true);
assert.equal(registry.executeProjectCommand(command('RESTORE_PROJECT', 'user-owner', {}, 5, 'restore-again')).diagnostics[0].code, 'PROJECT_RECORD_VERSION_CONFLICT');
assert.equal(registry.executeProjectCommand(command('CREATE_PROJECT', 'user-owner', basePayload({ projectId: 'project-main' }))).diagnostics[0].code, 'PROJECT_ID_DUPLICATE');

const legacyBinding = {
  legacySystemId: 'pixiedraw-current',
  legacyProjectId: 'local-legacy-1',
  legacyFormatVersion: 'archive-v2',
  mappingState: 'MAPPED',
  adapterVersion: '1.0.0',
  migrationStatus: 'COMPLETED',
  verificationHash: 'sha256:legacy-1',
};
const legacyProject = registry.executeProjectCommand(command('CREATE_PROJECT', 'user-owner', basePayload({ projectId: 'project-legacy', visibility: 'UNLISTED', legacyBindings: [legacyBinding] })));
assert.equal(legacyProject.ok, true);
const beginMigration = registry.executeProjectCommand(command('BEGIN_MIGRATION', 'user-owner', { legacyBinding: { ...legacyBinding, migrationStatus: 'IN_PROGRESS' } }, 1, 'migration', 'project-legacy'));
assert.equal(beginMigration.ok, true);
assert.equal(beginMigration.result.project.lifecycleState, 'MIGRATING');
const completeMigration = registry.executeProjectCommand(command('COMPLETE_MIGRATION', 'user-owner', { verificationHash: 'sha256:legacy-2' }, 2, 'migration', 'project-legacy'));
assert.equal(completeMigration.ok, true);
assert.equal(completeMigration.result.project.lifecycleState, 'ACTIVE');
assert.equal(completeMigration.result.project.legacyBindings[0].migrationStatus, 'COMPLETED');
const collision = registry.executeProjectCommand(command('CREATE_PROJECT', 'user-other', basePayload({ projectId: 'project-collision', ownerId: 'user-other', legacyBindings: [{ ...legacyBinding, verificationHash: 'sha256:other' }] })));
assert.equal(collision.ok, false);
assert.equal(registry.snapshot().projects.find(project => project.projectId === 'project-collision').lifecycleState, 'QUARANTINED');
assert.equal(registry.executeProjectCommand(command('RESTORE_PROJECT', 'user-other', {}, 1, 'restore', 'project-collision')).diagnostics[0].code, 'PROJECT_COMMAND_INVALID', 'quarantined project cannot be restored implicitly');

mode = 'off';
assert.equal(registry.getProject({ projectId: 'project-public', actorId: 'user-owner' }).diagnostics[0].code, 'PROJECT_REGISTRY_READ_FLAG_OFF');
assert.equal(registry.executeProjectCommand(command('RENAME_PROJECT', 'user-owner', { name: 'No Write' }, 7, 'flag-off')).diagnostics[0].code, 'PROJECT_REGISTRY_WRITE_FLAG_OFF');
mode = 'read-on-write-off';
assert.equal(registry.getProject({ projectId: 'project-public', actorId: 'user-owner' }).ok, true);
assert.equal(registry.executeProjectCommand(command('RENAME_PROJECT', 'user-owner', { name: 'Still No Write' }, 1, 'write-off')).diagnostics[0].code, 'PROJECT_REGISTRY_WRITE_FLAG_OFF');
mode = 'kill-switch';
assert.equal(registry.getProject({ projectId: 'project-public', actorId: 'user-owner' }).diagnostics[0].code, 'PROJECT_REGISTRY_ROLLBACK_ACTIVE');
mode = 'enabled';

const list = registry.listProjects({ actorId: 'user-owner', pageSize: 1, lifecycleStates: ['ACTIVE', 'ARCHIVED', 'TRASHED'] });
assert.equal(list.ok, true);
assert.equal(list.result.serverFiltered, true);
assert.equal(list.result.projects.length, 1);
assert.ok(list.result.nextCursor, 'stable cursor is returned when more records exist');
const nextPage = registry.listProjects({ actorId: 'user-owner', pageSize: 10, cursor: list.result.nextCursor, lifecycleStates: ['ACTIVE', 'ARCHIVED', 'TRASHED'] });
assert.equal(nextPage.ok, true);
assert.ok(nextPage.result.projects.every(project => project.visibility !== 'PRIVATE' || project.ownerId === 'user-owner'));
const switcher = createProjectSwitcherContract({ registry });
const switched = switcher.switch({ actorId: 'user-owner', projectId: 'project-public' });
assert.equal(switched.ok, true);
assert.equal(switched.result.editorStateMutation, 'none');
assert.equal(switched.result.contentBlobTransfer, 'none');

assert.deepEqual(PROJECT_REGISTRY_CONTRACT.flags, PROJECT_REGISTRY_FLAGS);
assert.equal(registry.snapshot().events.some(event => event.payload.commission !== undefined), false, 'events do not contain commission content');
assert.equal(registry.snapshot().networkAdapterInjected, true);

console.log(JSON.stringify({
  workPackage: 'WP-091',
  schemaVersion: PROJECT_REGISTRY_SCHEMA_VERSION,
  commandsCovered: PROJECT_COMMAND_TYPES.length,
  eventsCovered: PROJECT_EVENT_TYPES.length,
  failureFixtures: 22,
  projectCount: registry.snapshot().projects.length,
  status: 'pass',
}, null, 2));
