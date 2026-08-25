/*
 * WP-091 Project Registry Core.
 *
 * This module is deliberately a framework-free, DOM-free reference contract. It is not
 * loaded by core-shell/index.html or any current production route. Server authorization,
 * persistence, time, ID, randomness, and network behavior are injected by an adapter.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

export const PROJECT_REGISTRY_SCHEMA_VERSION = 1;
export const PROJECT_RECORD_VERSION_START = 1;

export const PROJECT_KINDS = Object.freeze([
  'DRAW',
  'DRAW2',
  'AUDIO',
  'GAME',
  'PIXFIND',
  'CAMERA_IMAGE',
  'OTHER_REGISTERED',
]);

export const PROJECT_TOOL_IDS = Object.freeze([
  'pixiedraw',
  'pixiedraw2',
  'pixieaudio',
  'pixigame',
  'pixfind',
  'camera-image',
  'registered-tool',
]);

export const PROJECT_FORMAT_IDS = Object.freeze([
  'pxd',
  'pixipackage',
  'pixiaudio-project',
  'pixigame-project',
  'image-project',
  'registered-project',
]);

export const OWNER_TYPES = Object.freeze(['USER', 'TEAM']);
export const PROJECT_VISIBILITIES = Object.freeze(['PRIVATE', 'UNLISTED', 'PUBLIC']);
export const PROJECT_LIFECYCLE_STATES = Object.freeze([
  'ACTIVE',
  'ARCHIVED',
  'TRASHED',
  'MIGRATING',
  'QUARANTINED',
]);
export const PROJECT_MEMBER_ROLES = Object.freeze([
  'USER_OWNER',
  'TEAM_OWNER',
  'CREATOR',
  'EDITOR',
  'VIEWER',
]);
export const PROJECT_MEMBER_STATUSES = Object.freeze(['ACTIVE', 'REMOVED']);
export const LEGACY_MAPPING_STATES = Object.freeze(['MAPPED', 'QUARANTINED']);
export const MIGRATION_STATUSES = Object.freeze([
  'NOT_STARTED',
  'IN_PROGRESS',
  'VERIFIED',
  'COMPLETED',
  'FAILED',
  'QUARANTINED',
]);

export const PROJECT_COMMAND_TYPES = Object.freeze([
  'CREATE_PROJECT',
  'RENAME_PROJECT',
  'CHANGE_VISIBILITY',
  'ARCHIVE_PROJECT',
  'RESTORE_PROJECT',
  'TRASH_PROJECT',
  'CHANGE_TOOL_FORMAT',
  'UPDATE_HEAD_REVISION',
  'ADD_MEMBER',
  'REMOVE_MEMBER',
  'BEGIN_MIGRATION',
  'COMPLETE_MIGRATION',
  'QUARANTINE_LEGACY_MAPPING',
  'REQUEST_OWNERSHIP_TRANSFER',
]);

export const PROJECT_EVENT_TYPES = Object.freeze([
  'PROJECT_CREATED',
  'PROJECT_METADATA_CHANGED',
  'PROJECT_VISIBILITY_CHANGED',
  'PROJECT_MEMBER_CHANGED',
  'PROJECT_ARCHIVED',
  'PROJECT_RESTORED',
  'PROJECT_TRASHED',
  'PROJECT_MIGRATION_STARTED',
  'PROJECT_MIGRATION_COMPLETED',
  'PROJECT_LEGACY_MAPPING_QUARANTINED',
  'PROJECT_OWNERSHIP_TRANSFER_REQUESTED',
]);

export const PROJECT_REGISTRY_FLAGS = Object.freeze({
  read: 'project-registry-read',
  write: 'project-registry-write',
  legacyAdapter: 'project-registry-legacy-adapter',
  migration: 'project-registry-migration',
  ownershipTransfer: 'project-registry-ownership-transfer',
});

export const PROJECT_REGISTRY_LIMITS = Object.freeze({
  projectId: 128,
  actorId: 128,
  commandId: 128,
  correlationId: 128,
  idempotencyKey: 160,
  name: 120,
  summary: 512,
  label: 64,
  labels: 16,
  members: 100,
  legacyBindings: 16,
  adapterVersion: 64,
  verificationHash: 256,
  serializedMetadata: 32768,
  pageSize: 100,
});

export const PROJECT_STORAGE_BOUNDARY = Object.freeze({
  registry: 'server-database-metadata-and-confirmed-project-identity',
  localMirror: 'indexeddb-index-and-offline-metadata-only',
  largeData: 'opfs-or-object-storage',
  excludedFromRegistry: Object.freeze([
    'pixel-blob',
    'audio-blob',
    'game-build',
    'tile-or-chunk',
    'journal',
    'checkpoint',
    'pxd-body',
    'package-body',
    'base64-or-data-url',
    'full-editor-state',
    'jwt-email-secret',
    'commission-body',
    'market-entitlement-or-payment-record',
  ]),
});

export const REGISTERED_PROJECT_TOOLS = Object.freeze([
  Object.freeze({
    toolId: 'pixiedraw',
    projectKind: 'DRAW',
    formatIds: Object.freeze(['pxd']),
    formatVersions: Object.freeze(['archive-v2', '2']),
  }),
  Object.freeze({
    toolId: 'pixiedraw2',
    projectKind: 'DRAW2',
    formatIds: Object.freeze(['pxd', 'pixipackage']),
    formatVersions: Object.freeze(['archive-v2', '2', '1']),
  }),
  Object.freeze({
    toolId: 'pixieaudio',
    projectKind: 'AUDIO',
    formatIds: Object.freeze(['pixiaudio-project']),
    formatVersions: Object.freeze(['1']),
  }),
  Object.freeze({
    toolId: 'pixigame',
    projectKind: 'GAME',
    formatIds: Object.freeze(['pixigame-project', 'pixipackage']),
    formatVersions: Object.freeze(['1']),
  }),
  Object.freeze({
    toolId: 'pixfind',
    projectKind: 'PIXFIND',
    formatIds: Object.freeze(['image-project']),
    formatVersions: Object.freeze(['1']),
  }),
  Object.freeze({
    toolId: 'camera-image',
    projectKind: 'CAMERA_IMAGE',
    formatIds: Object.freeze(['image-project']),
    formatVersions: Object.freeze(['1']),
  }),
  Object.freeze({
    toolId: 'registered-tool',
    projectKind: 'OTHER_REGISTERED',
    formatIds: Object.freeze(['registered-project']),
    formatVersions: Object.freeze(['1']),
  }),
]);

const PROJECT_RECORD_KEYS = new Set([
  'projectId', 'projectKind', 'toolId', 'formatId', 'formatVersion', 'ownerType', 'ownerId',
  'createdBy', 'name', 'visibility', 'lifecycleState', 'headRevisionId', 'rootAssetId',
  'rootReference', 'legacyBindings', 'members', 'metadata', 'schemaVersion', 'recordVersion',
  'createdAt', 'updatedAt', 'membershipVersion',
]);
const MEMBER_KEYS = new Set(['principalId', 'role', 'status', 'membershipVersion', 'addedAt', 'removedAt']);
const METADATA_KEYS = new Set(['summary', 'labels', 'locale']);
const COMMAND_KEYS = new Set([
  'commandId', 'commandType', 'schemaVersion', 'projectId', 'actorId', 'correlationId',
  'expectedRecordVersion', 'idempotencyKey', 'permissionDecision', 'createdAt', 'payload',
]);
const FORBIDDEN_KEY_PARTS = [
  'blob', 'base64', 'dataurl', 'pxdbody', 'packagebody', 'journal', 'operationpayload',
  'checkpoint', 'buildcache', 'editorstate', 'jwt', 'secret', 'commissionbody',
  'projectcontent', 'creativecontent', 'pixels', 'wav', 'audiofile', 'gamebuild',
  'entitlement', 'royalty', 'payment', 'email',
];
const FORBIDDEN_COMMAND_TYPES = new Set(['DELETE_PROJECT', 'HARD_DELETE_PROJECT']);

const LIFECYCLE_TRANSITIONS = Object.freeze({
  ACTIVE: Object.freeze(['ARCHIVED', 'TRASHED', 'MIGRATING', 'QUARANTINED']),
  ARCHIVED: Object.freeze(['ACTIVE', 'TRASHED', 'MIGRATING', 'QUARANTINED']),
  TRASHED: Object.freeze(['ACTIVE']),
  MIGRATING: Object.freeze(['ACTIVE', 'ARCHIVED', 'QUARANTINED']),
  QUARANTINED: Object.freeze([]),
});

const ROLE_CAPABILITIES = Object.freeze({
  USER_OWNER: Object.freeze(['read', 'update', 'visibility', 'archive', 'restore', 'trash', 'member', 'tool', 'revision', 'migration', 'ownership']),
  TEAM_OWNER: Object.freeze(['read', 'update', 'visibility', 'archive', 'restore', 'trash', 'member', 'tool', 'revision', 'migration', 'ownership']),
  CREATOR: Object.freeze(['read', 'update', 'revision']),
  EDITOR: Object.freeze(['read', 'update', 'revision']),
  VIEWER: Object.freeze(['read']),
});

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function diagnostic(code, message, path = null, severity = 'error', metadata = {}) {
  return { code, severity, message, path, metadata: clone(metadata) };
}

function failure(code, message, path = null, metadata = {}) {
  return { ok: false, diagnostics: [diagnostic(code, message, path, 'error', metadata)] };
}

function success(result, diagnostics = []) {
  return { ok: true, result: clone(result), diagnostics: clone(diagnostics) };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${field} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.normalize('NFC').trim();
}

function typedId(value, field, maxLength = PROJECT_REGISTRY_LIMITS.projectId) {
  const normalized = text(value, field, maxLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(normalized)) {
    throw new Error(`${field} is not a valid stable typed ID.`);
  }
  return normalized;
}

function enumValue(value, field, values) {
  if (!values.includes(value)) throw new Error(`${field} is unsupported: ${String(value)}.`);
  return value;
}

function integer(value, field, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${field} must be an integer >= ${minimum}.`);
  return value;
}

function timestamp(value, field) {
  const normalized = text(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${field} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
  return normalized;
}

function keyIsForbidden(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/gu, '');
  return FORBIDDEN_KEY_PARTS.some(part => normalized.includes(part));
}

function assertSafeMetadata(value, path = 'metadata', depth = 0) {
  if (depth > 5) throw new Error(`${path} is too deeply nested.`);
  if (typeof value === 'string') {
    if (value.length > PROJECT_REGISTRY_LIMITS.summary) throw new Error(`${path} is too large.`);
    if (/^data:/iu.test(value)) throw new Error(`${path} cannot contain a Data URL.`);
    return;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    if (value.length > PROJECT_REGISTRY_LIMITS.labels) throw new Error(`${path} contains too many values.`);
    value.forEach((child, index) => assertSafeMetadata(child, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isObject(value)) throw new Error(`${path} must be structured metadata.`);
  for (const [key, child] of Object.entries(value)) {
    if (keyIsForbidden(key)) throw new Error(`${path}.${key} is not allowed in Project Registry metadata.`);
    assertSafeMetadata(child, `${path}.${key}`, depth + 1);
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${path} must be JSON-serializable.`);
  }
  if (serialized.length > PROJECT_REGISTRY_LIMITS.serializedMetadata) throw new Error(`${path} exceeds the registry metadata limit.`);
}

function normalizeMetadata(value = {}) {
  if (!isObject(value)) throw new Error('metadata must be an object.');
  for (const key of Object.keys(value)) if (!METADATA_KEYS.has(key)) throw new Error(`metadata.${key} is unsupported.`);
  assertSafeMetadata(value);
  const result = {};
  if (value.summary !== undefined) result.summary = text(value.summary, 'metadata.summary', PROJECT_REGISTRY_LIMITS.summary);
  if (value.locale !== undefined) result.locale = text(value.locale, 'metadata.locale', 32);
  if (value.labels !== undefined) {
    if (!Array.isArray(value.labels) || value.labels.length > PROJECT_REGISTRY_LIMITS.labels) throw new Error('metadata.labels has an invalid size.');
    result.labels = [...new Set(value.labels.map(label => text(label, 'metadata.labels[]', PROJECT_REGISTRY_LIMITS.label)))].sort();
  }
  return result;
}

function normalizeRootReference({ rootAssetId = null, rootReference = null } = {}) {
  if (rootAssetId !== null) return { rootAssetId: typedId(rootAssetId, 'rootAssetId'), rootReference: null };
  if (!isObject(rootReference) || typeof rootReference.kind !== 'string' || !rootReference.kind.trim()) {
    throw new Error('rootAssetId or an equivalent rootReference is required.');
  }
  const normalized = {
    kind: text(rootReference.kind, 'rootReference.kind', 64),
    id: rootReference.id === null || rootReference.id === undefined ? null : typedId(rootReference.id, 'rootReference.id'),
  };
  return { rootAssetId: null, rootReference: normalized };
}

function normalizeMember(member, index) {
  if (!isObject(member)) throw new Error(`members[${index}] must be an object.`);
  for (const key of Object.keys(member)) if (!MEMBER_KEYS.has(key)) throw new Error(`members[${index}].${key} is unsupported.`);
  const normalized = {
    principalId: typedId(member.principalId, `members[${index}].principalId`, PROJECT_REGISTRY_LIMITS.actorId),
    role: enumValue(member.role, `members[${index}].role`, PROJECT_MEMBER_ROLES.filter(role => role !== 'USER_OWNER' && role !== 'TEAM_OWNER')),
    status: enumValue(member.status || 'ACTIVE', `members[${index}].status`, PROJECT_MEMBER_STATUSES),
    membershipVersion: integer(member.membershipVersion ?? 1, `members[${index}].membershipVersion`, 1),
    addedAt: timestamp(member.addedAt, `members[${index}].addedAt`),
    removedAt: member.removedAt === undefined || member.removedAt === null ? null : timestamp(member.removedAt, `members[${index}].removedAt`),
  };
  if (normalized.status === 'ACTIVE' && normalized.removedAt !== null) throw new Error(`members[${index}] active members cannot have removedAt.`);
  if (normalized.status === 'REMOVED' && normalized.removedAt === null) throw new Error(`members[${index}] removed members require removedAt.`);
  return normalized;
}

function normalizeLegacyBinding(binding, index) {
  if (!isObject(binding)) throw new Error(`legacyBindings[${index}] must be an object.`);
  const allowed = new Set(['legacySystemId', 'legacyProjectId', 'legacyFormatVersion', 'mappingState', 'adapterVersion', 'migrationStatus', 'verificationHash']);
  for (const key of Object.keys(binding)) if (!allowed.has(key)) throw new Error(`legacyBindings[${index}].${key} is unsupported.`);
  return {
    legacySystemId: text(binding.legacySystemId, `legacyBindings[${index}].legacySystemId`, 64),
    legacyProjectId: typedId(binding.legacyProjectId, `legacyBindings[${index}].legacyProjectId`),
    legacyFormatVersion: text(binding.legacyFormatVersion, `legacyBindings[${index}].legacyFormatVersion`, 64),
    mappingState: enumValue(binding.mappingState, `legacyBindings[${index}].mappingState`, LEGACY_MAPPING_STATES),
    adapterVersion: text(binding.adapterVersion, `legacyBindings[${index}].adapterVersion`, PROJECT_REGISTRY_LIMITS.adapterVersion),
    migrationStatus: enumValue(binding.migrationStatus, `legacyBindings[${index}].migrationStatus`, MIGRATION_STATUSES),
    verificationHash: text(binding.verificationHash, `legacyBindings[${index}].verificationHash`, PROJECT_REGISTRY_LIMITS.verificationHash),
  };
}

function normalizeRegistrations(registrations = []) {
  const entries = [...REGISTERED_PROJECT_TOOLS, ...registrations];
  const seen = new Set();
  return entries.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`registeredTools[${index}] must be an object.`);
    const toolId = text(entry.toolId, `registeredTools[${index}].toolId`, 64);
    const projectKind = text(entry.projectKind, `registeredTools[${index}].projectKind`, 64);
    const formatIds = [...new Set((entry.formatIds || []).map(value => text(value, 'formatIds[]', 64)))];
    const formatVersions = [...new Set((entry.formatVersions || []).map(value => text(value, 'formatVersions[]', 32)))];
    if (!formatIds.length || !formatVersions.length) throw new Error(`registeredTools[${index}] must register formats and versions.`);
    if (seen.has(toolId)) throw new Error(`Tool is registered more than once: ${toolId}.`);
    seen.add(toolId);
    return Object.freeze({ toolId, projectKind, formatIds: Object.freeze(formatIds), formatVersions: Object.freeze(formatVersions) });
  });
}

function getRegistration(toolId, registrations) {
  return registrations.find(entry => entry.toolId === toolId) || null;
}

function normalizePermissionDecision(value, field = 'permissionDecision') {
  try {
    return normalizeAuthorizationProof(value);
  } catch (error) {
    throw new Error(`${field} must be an AuthorizationProofV1: ${error.message}`);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function requireCommandShape(command) {
  if (!isObject(command)) throw new Error('Command must be an object.');
  for (const key of Object.keys(command)) if (!COMMAND_KEYS.has(key)) throw new Error(`Unknown command field: ${key}.`);
  const commandType = enumValue(command.commandType, 'commandType', PROJECT_COMMAND_TYPES);
  if (command.schemaVersion !== PROJECT_REGISTRY_SCHEMA_VERSION) throw new Error(`Unsupported project command schema version: ${String(command.schemaVersion)}.`);
  if (FORBIDDEN_COMMAND_TYPES.has(commandType)) throw new Error('Hard delete is not a Project Registry command.');
  const projectId = command.projectId === null || command.projectId === undefined ? null : typedId(command.projectId, 'projectId');
  if (commandType !== 'CREATE_PROJECT' && projectId === null) throw new Error('projectId is required for this command.');
  if (commandType === 'CREATE_PROJECT' && projectId !== null) throw new Error('CREATE_PROJECT must not target an existing project ID.');
  return {
    commandId: typedId(command.commandId, 'commandId', PROJECT_REGISTRY_LIMITS.commandId),
    commandType,
    schemaVersion: integer(command.schemaVersion, 'schemaVersion', 1),
    projectId,
    actorId: typedId(command.actorId, 'actorId', PROJECT_REGISTRY_LIMITS.actorId),
    correlationId: typedId(command.correlationId, 'correlationId', PROJECT_REGISTRY_LIMITS.correlationId),
    expectedRecordVersion: command.expectedRecordVersion === null || command.expectedRecordVersion === undefined ? null : integer(command.expectedRecordVersion, 'expectedRecordVersion', 1),
    idempotencyKey: text(command.idempotencyKey, 'idempotencyKey', PROJECT_REGISTRY_LIMITS.idempotencyKey),
    permissionDecision: normalizePermissionDecision(command.permissionDecision),
    createdAt: timestamp(command.createdAt, 'createdAt'),
    payload: command.payload === undefined ? {} : clone(command.payload),
  };
}

export function validateProjectCommand(command) {
  try {
    const normalized = requireCommandShape(command);
    assertSafeMetadata(normalized.payload, 'payload');
    return { valid: true, value: normalized, diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic('PROJECT_COMMAND_INVALID', error.message)] };
  }
}

export function validateProjectRecord(record, { registeredTools = [] } = {}) {
  try {
    if (!isObject(record)) throw new Error('Project record must be an object.');
    for (const key of Object.keys(record)) if (!PROJECT_RECORD_KEYS.has(key)) throw new Error(`Unknown project registry field: ${key}.`);
    const registrations = normalizeRegistrations(registeredTools);
    const registration = getRegistration(text(record.toolId, 'toolId', 64), registrations);
    if (!registration) throw new Error(`Unknown registered tool: ${String(record.toolId)}.`);
    if (record.projectKind !== registration.projectKind) throw new Error('projectKind does not match the registered tool.');
    if (!registration.formatIds.includes(record.formatId)) throw new Error('formatId is not registered for this tool.');
    if (!registration.formatVersions.includes(record.formatVersion)) throw new Error('formatVersion is not registered for this tool.');
    enumValue(record.projectKind, 'projectKind', [...new Set([...PROJECT_KINDS, ...registrations.map(entry => entry.projectKind)])]);
    const root = normalizeRootReference(record);
    const members = Array.isArray(record.members) ? record.members.map(normalizeMember) : [];
    if (members.length > PROJECT_REGISTRY_LIMITS.members) throw new Error('members exceeds the Project Registry limit.');
    if (new Set(members.map(member => member.principalId)).size !== members.length) throw new Error('members must not contain duplicate principals.');
    const bindings = Array.isArray(record.legacyBindings) ? record.legacyBindings.map(normalizeLegacyBinding) : [];
    if (bindings.length > PROJECT_REGISTRY_LIMITS.legacyBindings) throw new Error('legacyBindings exceeds the Project Registry limit.');
    const normalized = {
      projectId: typedId(record.projectId, 'projectId'),
      projectKind: record.projectKind,
      toolId: registration.toolId,
      formatId: text(record.formatId, 'formatId', 64),
      formatVersion: text(record.formatVersion, 'formatVersion', 32),
      ownerType: enumValue(record.ownerType, 'ownerType', OWNER_TYPES),
      ownerId: typedId(record.ownerId, 'ownerId', PROJECT_REGISTRY_LIMITS.actorId),
      createdBy: typedId(record.createdBy, 'createdBy', PROJECT_REGISTRY_LIMITS.actorId),
      name: text(record.name, 'name', PROJECT_REGISTRY_LIMITS.name),
      visibility: enumValue(record.visibility, 'visibility', PROJECT_VISIBILITIES),
      lifecycleState: enumValue(record.lifecycleState, 'lifecycleState', PROJECT_LIFECYCLE_STATES),
      headRevisionId: record.headRevisionId === null || record.headRevisionId === undefined ? null : typedId(record.headRevisionId, 'headRevisionId'),
      ...root,
      legacyBindings: bindings,
      members,
      metadata: normalizeMetadata(record.metadata || {}),
      schemaVersion: integer(record.schemaVersion, 'schemaVersion', 1),
      recordVersion: integer(record.recordVersion, 'recordVersion', 1),
      createdAt: timestamp(record.createdAt, 'createdAt'),
      updatedAt: timestamp(record.updatedAt, 'updatedAt'),
      membershipVersion: integer(record.membershipVersion ?? 1, 'membershipVersion', 1),
    };
    if (normalized.schemaVersion !== PROJECT_REGISTRY_SCHEMA_VERSION) throw new Error(`Unsupported project registry schema version: ${normalized.schemaVersion}.`);
    if (normalized.updatedAt < normalized.createdAt) throw new Error('updatedAt cannot be before createdAt.');
    if (!normalized.rootAssetId && !normalized.rootReference) throw new Error('A rootAssetId or equivalent rootReference is required.');
    return { valid: true, value: freezeDeep(normalized), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic('PROJECT_RECORD_INVALID', error.message)] };
  }
}

export function createProjectCommand({
  commandType,
  projectId = null,
  actorId,
  correlationId,
  expectedRecordVersion = null,
  idempotencyKey,
  permissionDecision,
  payload = {},
  adapters = {},
} = {}) {
  const idGenerator = adapters.idGenerator;
  const clock = adapters.clock;
  if (typeof idGenerator !== 'function') throw new Error('An injected idGenerator is required to create a command.');
  if (typeof clock !== 'function') throw new Error('An injected clock is required to create a command.');
  return {
    commandId: idGenerator('project-command'),
    commandType,
    schemaVersion: PROJECT_REGISTRY_SCHEMA_VERSION,
    projectId,
    actorId,
    correlationId: correlationId || idGenerator('correlation'),
    expectedRecordVersion,
    idempotencyKey: idempotencyKey || idGenerator('idempotency'),
    permissionDecision,
    createdAt: clock(),
    payload: clone(payload),
  };
}

function metadataEventPayload(project) {
  return {
    projectId: project.projectId,
    projectKind: project.projectKind,
    toolId: project.toolId,
    formatId: project.formatId,
    formatVersion: project.formatVersion,
    ownerType: project.ownerType,
    ownerId: project.ownerId,
    name: project.name,
    visibility: project.visibility,
    lifecycleState: project.lifecycleState,
    headRevisionId: project.headRevisionId,
    rootAssetId: project.rootAssetId,
    rootReference: project.rootReference,
    legacyBindingCount: project.legacyBindings.length,
    memberCount: project.members.length,
    recordVersion: project.recordVersion,
  };
}

function projectEvent({ type, project, command, at, details = {} }) {
  return freezeDeep({
    eventType: type,
    eventVersion: 1,
    eventId: command.commandId,
    commandId: command.commandId,
    correlationId: command.correlationId,
    projectId: project.projectId,
    actorId: command.actorId,
    at,
    payload: { ...metadataEventPayload(project), ...clone(details) },
  });
}

function flagFailure(flagId, action, decision) {
  const rollback = decision?.code?.includes('ROLLBACK') || decision?.code?.includes('KILL_SWITCH');
  return failure(
    rollback ? 'PROJECT_REGISTRY_ROLLBACK_ACTIVE' : (action === 'read' ? 'PROJECT_REGISTRY_READ_FLAG_OFF' : 'PROJECT_REGISTRY_WRITE_FLAG_OFF'),
    rollback ? `Project Registry ${action} is on the preserved path because ${flagId} is rolled back or killed.` : `Project Registry ${action} is unavailable while ${flagId} is default-off.`,
    null,
    { flagId, action, decision: decision?.decision || 'unknown' },
  );
}

function accessResult({ project, actorId = null, action = 'read', directReference = false, identityKnown = actorId !== null, membershipVersion = null } = {}) {
  if (!project) return { ok: false, decision: 'not-found', httpStatus: 404, code: 'PROJECT_NOT_FOUND', expose: false };
  const isOwner = actorId !== null && actorId === project.ownerId;
  const member = actorId === null ? null : project.members.find(entry => entry.principalId === actorId) || null;
  const ownerRole = isOwner ? (project.ownerType === 'TEAM' ? 'TEAM_OWNER' : 'USER_OWNER') : null;
  const role = ownerRole || (member?.status === 'ACTIVE' ? member.role : null);
  const removed = member?.status === 'REMOVED';
  const staleMembership = member && membershipVersion !== null && membershipVersion < member.membershipVersion;
  const capabilities = role ? ROLE_CAPABILITIES[role] || [] : [];

  if (action === 'read') {
    if (project.visibility === 'PUBLIC') return { ok: true, decision: 'allow', role, public: true };
    if (project.visibility === 'UNLISTED' && directReference && !removed && !staleMembership) return { ok: true, decision: 'allow', role, directReference: true };
    if (removed || staleMembership) return { ok: false, decision: 'deny', httpStatus: 403, code: 'PROJECT_SESSION_STALE', expose: true };
    if (capabilities.includes('read')) return { ok: true, decision: 'allow', role };
    if (!identityKnown) return { ok: false, decision: 'not-found', httpStatus: 404, code: 'PROJECT_NOT_FOUND', expose: false };
    return { ok: false, decision: 'deny', httpStatus: 403, code: 'PROJECT_READ_FORBIDDEN', expose: true };
  }

  if (removed || staleMembership) return { ok: false, decision: 'deny', httpStatus: 403, code: 'PROJECT_SESSION_STALE', expose: true };
  if (!capabilities.includes(action)) return { ok: false, decision: 'deny', httpStatus: 403, code: 'PROJECT_ACTION_FORBIDDEN', expose: true, role, action };
  return { ok: true, decision: 'allow', role, action };
}

export function authorizeProjectAccess(options = {}) {
  return clone(accessResult(options));
}

function legacyKey(binding) {
  return `${binding.legacySystemId}:${binding.legacyProjectId}`;
}

function validatePayloadKeys(payload, allowed, commandType) {
  if (!isObject(payload)) throw new Error(`${commandType} payload must be an object.`);
  for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new Error(`${commandType} payload.${key} is unsupported.`);
}

function transition(project, nextState) {
  enumValue(nextState, 'lifecycleState', PROJECT_LIFECYCLE_STATES);
  if (project.lifecycleState === nextState) return;
  if (!LIFECYCLE_TRANSITIONS[project.lifecycleState]?.includes(nextState)) throw new Error(`Invalid lifecycle transition ${project.lifecycleState} -> ${nextState}.`);
}

function normalizeCreateRecord(payload, command, registrations, adapters) {
  const projectId = payload.projectId || adapters.idGenerator?.('project');
  if (!projectId) throw new Error('CREATE_PROJECT requires a projectId or injected idGenerator.');
  const now = adapters.clock?.();
  if (!now) throw new Error('CREATE_PROJECT requires an injected clock.');
  const root = normalizeRootReference(payload);
  return {
    projectId,
    projectKind: payload.projectKind,
    toolId: payload.toolId,
    formatId: payload.formatId,
    formatVersion: payload.formatVersion,
    ownerType: payload.ownerType,
    ownerId: payload.ownerId,
    createdBy: command.actorId,
    name: payload.name,
    visibility: payload.visibility,
    lifecycleState: payload.lifecycleState || 'ACTIVE',
    headRevisionId: payload.headRevisionId ?? null,
    ...root,
    legacyBindings: payload.legacyBindings || [],
    members: payload.members || [],
    metadata: payload.metadata || {},
    schemaVersion: PROJECT_REGISTRY_SCHEMA_VERSION,
    recordVersion: PROJECT_RECORD_VERSION_START,
    createdAt: now,
    updatedAt: now,
    membershipVersion: 1,
  };
}

function cloneWithoutPrivateFields(record) {
  const copy = clone(record);
  delete copy._registrations;
  return copy;
}

export function createProjectRegistry({
  adapters = {},
  registeredTools = [],
  featureFlagEvaluator = null,
  permissionEvaluator = null,
} = {}) {
  const registrations = normalizeRegistrations(registeredTools);
  const state = {
    projects: new Map(),
    commands: new Map(),
    idempotency: new Map(),
    legacy: new Map(),
    events: [],
  };
  const clock = adapters.clock;
  const networkAdapter = adapters.network || null;

  function now() {
    if (typeof clock !== 'function') throw new Error('A trusted clock adapter is required.');
    return timestamp(clock(), 'clock.now');
  }

  function evaluateFlag(flagId, action, actorId = null) {
    if (typeof featureFlagEvaluator !== 'function') return { decision: 'fallback', enabled: false, serverAuthorized: false, code: 'PROJECT_REGISTRY_FLAG_EVALUATOR_MISSING' };
    const decision = featureFlagEvaluator({
      flagId,
      action,
      principalId: actorId,
      principalSource: 'server',
      clientRequested: false,
      serverAuthorized: true,
    });
    return isObject(decision) ? clone(decision) : { decision: 'unknown', enabled: false, serverAuthorized: false, code: 'PROJECT_REGISTRY_FLAG_DECISION_INVALID' };
  }

  function requireFlag(flagId, action, actorId = null) {
    const decision = evaluateFlag(flagId, action, actorId);
    if (decision.serverAuthorized !== true || decision.decision !== 'enabled' || decision.enabled !== true) return flagFailure(flagId, action, decision);
    return null;
  }

  function requireWritePermission(command, project, capability) {
    const serverDecision = normalizePermissionDecision(command.permissionDecision);
    if (serverDecision.capability !== capability) return failure('PROJECT_PERMISSION_CAPABILITY_MISMATCH', 'The AuthorizationProof capability does not match the Project Registry action.', 'permissionDecision.capability');
    if (typeof permissionEvaluator !== 'function') return failure('PROJECT_AUTHZ_EVALUATOR_REQUIRED', 'Project Registry writes require a server-owned Authorization evaluator.');
    try {
      const resolved = resolveAuthorizationProofSync({
        expected: { principalId: command.actorId, resourceType: 'PROJECT', resourceId: project?.projectId || command.projectId || command.payload?.projectId, action: capability, capability, tenantId: serverDecision.tenantId, correlationId: command.correlationId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
        callerProof: command.permissionDecision,
        authorizationEvaluator: (input) => permissionEvaluator({ project: project ? cloneWithoutPrivateFields(project) : null, principalId: input.principalId, actorId: input.principalId, action: input.action, capability: input.capability, resourceType: input.resourceType, resourceId: input.resourceId, tenantId: input.tenantId, correlationId: input.correlationId, source: 'server' }),
      });
      if (resolved.decision !== 'allow') return failure('PROJECT_PERMISSION_DENIED', 'The server AuthorizationProof denied this command.');
    } catch (error) {
      return failure(error.code || 'PROJECT_PERMISSION_DENIED', error.message, 'permissionDecision');
    }
    return null;
  }

  function checkExpected(project, command) {
    if (command.expectedRecordVersion !== null && command.expectedRecordVersion !== project.recordVersion) return failure('PROJECT_RECORD_VERSION_CONFLICT', 'The Project recordVersion is stale; no mutation was applied.', 'expectedRecordVersion', { currentRecordVersion: project.recordVersion });
    return null;
  }

  function checkLegacyMappings(project, bindings) {
    const nextBindings = bindings.map((binding, index) => normalizeLegacyBinding(binding, index));
    const seen = new Set();
    for (const binding of nextBindings) {
      const key = legacyKey(binding);
      if (seen.has(key)) return { conflict: 'LEGACY_MAPPING_MULTIPLE', binding };
      seen.add(key);
      if (binding.legacyProjectId === project.projectId) return { conflict: 'LEGACY_MAPPING_CYCLE', binding };
      const existing = state.legacy.get(key);
      if (existing && (existing.projectId !== project.projectId || existing.ownerId !== project.ownerId)) return { conflict: 'LEGACY_MAPPING_CONFLICT', binding, existing };
    }
    return { bindings: nextBindings };
  }

  function saveLegacyMappings(project) {
    for (const binding of project.legacyBindings) state.legacy.set(legacyKey(binding), { projectId: project.projectId, ownerId: project.ownerId, verificationHash: binding.verificationHash });
  }

  function storeCommand(command, fingerprint, result) {
    const saved = clone(result);
    state.commands.set(command.commandId, { fingerprint, result: saved });
    state.idempotency.set(`${command.actorId}:${command.idempotencyKey}`, { fingerprint, result: saved });
    return saved;
  }

  function replayOrConflict(command) {
    const fingerprint = stableStringify(command);
    const prior = state.commands.get(command.commandId) || state.idempotency.get(`${command.actorId}:${command.idempotencyKey}`);
    if (!prior) return { fingerprint, prior: null };
    if (prior.fingerprint !== fingerprint) return { fingerprint, conflict: failure('PROJECT_IDEMPOTENCY_KEY_REUSE', 'Command or idempotency key was reused with a different payload.') };
    return { fingerprint, replay: success({ ...prior.result.result, idempotentReplay: true }, prior.result.diagnostics || []) };
  }

  function commitProject({ previous, next, command, eventType, details = {} }) {
    const validation = validateProjectRecord(next, { registeredTools });
    if (!validation.valid) return failure('PROJECT_RECORD_INVALID', validation.diagnostics[0].message);
    const record = cloneWithoutPrivateFields(validation.value);
    const event = projectEvent({ type: eventType, project: record, command, at: record.updatedAt, details });
    state.projects.set(record.projectId, record);
    state.events.push(event);
    if (!previous || previous.ownerId !== record.ownerId || previous.legacyBindings.length !== record.legacyBindings.length) saveLegacyMappings(record);
    return success({ project: record, event, idempotentReplay: false });
  }

  function executeCreate(command) {
    validatePayloadKeys(command.payload, new Set(['projectId', 'projectKind', 'toolId', 'formatId', 'formatVersion', 'ownerType', 'ownerId', 'name', 'visibility', 'headRevisionId', 'rootAssetId', 'rootReference', 'legacyBindings', 'members', 'metadata', 'lifecycleState']), command.commandType);
    const candidate = normalizeCreateRecord(command.payload, command, registrations, adapters);
    const validation = validateProjectRecord(candidate, { registeredTools });
    if (!validation.valid) return failure('PROJECT_RECORD_INVALID', validation.diagnostics[0].message);
    const project = cloneWithoutPrivateFields(validation.value);
    if (state.projects.has(project.projectId)) return failure('PROJECT_ID_DUPLICATE', 'Project ID already exists and is never reused.', 'projectId');
    const permissionFailure = requireWritePermission(command, project, 'create');
    if (permissionFailure) return permissionFailure;
    const legacyCheck = checkLegacyMappings(project, project.legacyBindings);
    if (legacyCheck.conflict) {
      const quarantined = { ...project, lifecycleState: 'QUARANTINED', legacyBindings: project.legacyBindings.map(binding => ({ ...binding, mappingState: 'QUARANTINED', migrationStatus: 'QUARANTINED' })) };
      const quarantinedValidation = validateProjectRecord(quarantined, { registeredTools });
      if (!quarantinedValidation.valid) return failure('LEGACY_MAPPING_QUARANTINE_FAILED', quarantinedValidation.diagnostics[0].message);
      const record = cloneWithoutPrivateFields(quarantinedValidation.value);
      const event = projectEvent({ type: 'PROJECT_LEGACY_MAPPING_QUARANTINED', project: record, command, at: record.updatedAt, details: { reason: legacyCheck.conflict } });
      state.projects.set(record.projectId, record);
      state.events.push(event);
      return failure(legacyCheck.conflict, 'Legacy mapping conflict was quarantined; source identifiers were not merged or deleted.', 'payload.legacyBindings', { projectId: record.projectId, lifecycleState: 'QUARANTINED' });
    }
    return commitProject({ previous: null, next: project, command, eventType: 'PROJECT_CREATED' });
  }

  function executeUpdate(command) {
    const project = state.projects.get(command.projectId);
    if (!project) return failure('PROJECT_UNKNOWN_ID', 'Project ID was not found in this isolated Registry.', 'projectId', { httpStatus: 404 });
    const expected = checkExpected(project, command);
    if (expected) return expected;
    let next = clone(project);
    let eventType = 'PROJECT_METADATA_CHANGED';
    let capability = 'update';
    let extraDetails = {};
    const payload = command.payload;

    switch (command.commandType) {
      case 'RENAME_PROJECT':
        validatePayloadKeys(payload, new Set(['name']), command.commandType);
        next.name = text(payload.name, 'payload.name', PROJECT_REGISTRY_LIMITS.name);
        break;
      case 'CHANGE_VISIBILITY':
        validatePayloadKeys(payload, new Set(['visibility']), command.commandType);
        capability = 'visibility';
        next.visibility = enumValue(payload.visibility, 'payload.visibility', PROJECT_VISIBILITIES);
        eventType = 'PROJECT_VISIBILITY_CHANGED';
        break;
      case 'ARCHIVE_PROJECT':
        validatePayloadKeys(payload, new Set(), command.commandType);
        capability = 'archive';
        transition(next, 'ARCHIVED');
        next.lifecycleState = 'ARCHIVED';
        eventType = 'PROJECT_ARCHIVED';
        break;
      case 'RESTORE_PROJECT':
        validatePayloadKeys(payload, new Set(), command.commandType);
        capability = 'restore';
        transition(next, 'ACTIVE');
        next.lifecycleState = 'ACTIVE';
        eventType = 'PROJECT_RESTORED';
        break;
      case 'TRASH_PROJECT':
        validatePayloadKeys(payload, new Set(), command.commandType);
        capability = 'trash';
        transition(next, 'TRASHED');
        next.lifecycleState = 'TRASHED';
        eventType = 'PROJECT_TRASHED';
        break;
      case 'CHANGE_TOOL_FORMAT': {
        validatePayloadKeys(payload, new Set(['projectKind', 'toolId', 'formatId', 'formatVersion']), command.commandType);
        capability = 'tool';
        const registration = getRegistration(payload.toolId, registrations);
        if (!registration) return failure('PROJECT_TOOL_UNKNOWN', 'The requested tool is not registered.', 'payload.toolId');
        if (payload.projectKind !== registration.projectKind) return failure('PROJECT_KIND_TOOL_MISMATCH', 'projectKind does not match the registered tool.', 'payload.projectKind');
        if (!registration.formatIds.includes(payload.formatId)) return failure('PROJECT_FORMAT_UNKNOWN', 'The requested format is not registered for this tool.', 'payload.formatId');
        if (!registration.formatVersions.includes(payload.formatVersion)) return failure('PROJECT_FORMAT_VERSION_UNSUPPORTED', 'The requested format version is unsupported.', 'payload.formatVersion');
        next.projectKind = payload.projectKind;
        next.toolId = payload.toolId;
        next.formatId = payload.formatId;
        next.formatVersion = payload.formatVersion;
        break;
      }
      case 'UPDATE_HEAD_REVISION':
        validatePayloadKeys(payload, new Set(['headRevisionId']), command.commandType);
        capability = 'revision';
        next.headRevisionId = payload.headRevisionId === null ? null : typedId(payload.headRevisionId, 'payload.headRevisionId');
        break;
      case 'ADD_MEMBER': {
        validatePayloadKeys(payload, new Set(['principalId', 'role']), command.commandType);
        capability = 'member';
        const principalId = typedId(payload.principalId, 'payload.principalId', PROJECT_REGISTRY_LIMITS.actorId);
        if (next.members.some(member => member.principalId === principalId && member.status === 'ACTIVE')) return failure('PROJECT_MEMBER_DUPLICATE', 'Active project membership already exists.', 'payload.principalId');
        if (next.members.length >= PROJECT_REGISTRY_LIMITS.members) return failure('PROJECT_MEMBER_LIMIT', 'Project member limit reached.', 'members');
        next.members = next.members.filter(member => member.principalId !== principalId);
        next.members.push({ principalId, role: enumValue(payload.role, 'payload.role', ['CREATOR', 'EDITOR', 'VIEWER']), status: 'ACTIVE', membershipVersion: next.membershipVersion + 1, addedAt: now(), removedAt: null });
        next.membershipVersion += 1;
        eventType = 'PROJECT_MEMBER_CHANGED';
        extraDetails = { membershipAction: 'added', memberId: principalId };
        break;
      }
      case 'REMOVE_MEMBER': {
        validatePayloadKeys(payload, new Set(['principalId']), command.commandType);
        capability = 'member';
        const principalId = typedId(payload.principalId, 'payload.principalId', PROJECT_REGISTRY_LIMITS.actorId);
        const member = next.members.find(entry => entry.principalId === principalId);
        if (!member || member.status !== 'ACTIVE') return failure('PROJECT_MEMBER_UNKNOWN', 'Active project member was not found.', 'payload.principalId');
        next.members = next.members.map(entry => entry.principalId === principalId ? { ...entry, status: 'REMOVED', membershipVersion: entry.membershipVersion + 1, removedAt: now() } : entry);
        next.membershipVersion += 1;
        eventType = 'PROJECT_MEMBER_CHANGED';
        extraDetails = { membershipAction: 'removed', memberId: principalId };
        break;
      }
      case 'BEGIN_MIGRATION': {
        validatePayloadKeys(payload, new Set(['legacyBinding']), command.commandType);
        capability = 'migration';
        const binding = normalizeLegacyBinding(payload.legacyBinding, 0);
        if (binding.mappingState !== 'MAPPED' || binding.migrationStatus !== 'IN_PROGRESS') return failure('PROJECT_MIGRATION_STATE_INVALID', 'Begin migration requires MAPPED and IN_PROGRESS.');
        const legacyCheck = checkLegacyMappings(next, [binding]);
        if (legacyCheck.conflict) {
          next.lifecycleState = 'QUARANTINED';
          next.legacyBindings = next.legacyBindings.map(existing => ({ ...existing, mappingState: 'QUARANTINED', migrationStatus: 'QUARANTINED' }));
          eventType = 'PROJECT_LEGACY_MAPPING_QUARANTINED';
          extraDetails = { reason: legacyCheck.conflict };
        } else {
          next.lifecycleState = 'MIGRATING';
          next.legacyBindings = [...next.legacyBindings.filter(existing => legacyKey(existing) !== legacyKey(binding)), binding];
          eventType = 'PROJECT_MIGRATION_STARTED';
        }
        break;
      }
      case 'COMPLETE_MIGRATION':
        validatePayloadKeys(payload, new Set(['verificationHash']), command.commandType);
        capability = 'migration';
        if (next.lifecycleState !== 'MIGRATING') return failure('PROJECT_MIGRATION_NOT_ACTIVE', 'Project is not in MIGRATING state.');
        if (!next.legacyBindings.length) return failure('PROJECT_MIGRATION_BINDING_MISSING', 'A legacy binding is required to complete migration.');
        next.lifecycleState = 'ACTIVE';
        next.legacyBindings = next.legacyBindings.map(binding => ({ ...binding, migrationStatus: 'COMPLETED', mappingState: 'MAPPED', verificationHash: text(payload.verificationHash, 'payload.verificationHash', PROJECT_REGISTRY_LIMITS.verificationHash) }));
        eventType = 'PROJECT_MIGRATION_COMPLETED';
        break;
      case 'QUARANTINE_LEGACY_MAPPING':
        validatePayloadKeys(payload, new Set(['reason']), command.commandType);
        capability = 'migration';
        if (!next.legacyBindings.length) return failure('PROJECT_LEGACY_BINDING_MISSING', 'A legacy binding is required to quarantine.');
        next.lifecycleState = 'QUARANTINED';
        next.legacyBindings = next.legacyBindings.map(binding => ({ ...binding, mappingState: 'QUARANTINED', migrationStatus: 'QUARANTINED' }));
        eventType = 'PROJECT_LEGACY_MAPPING_QUARANTINED';
        extraDetails = { reason: text(payload.reason, 'payload.reason', 512) };
        break;
      case 'REQUEST_OWNERSHIP_TRANSFER':
        validatePayloadKeys(payload, new Set(['targetOwnerType', 'targetOwnerId', 'reason']), command.commandType);
        capability = 'ownership';
        enumValue(payload.targetOwnerType, 'payload.targetOwnerType', OWNER_TYPES);
        typedId(payload.targetOwnerId, 'payload.targetOwnerId', PROJECT_REGISTRY_LIMITS.actorId);
        if (payload.targetOwnerId === next.ownerId && payload.targetOwnerType === next.ownerType) return failure('PROJECT_OWNERSHIP_TARGET_SAME', 'Ownership transfer target is unchanged.');
        eventType = 'PROJECT_OWNERSHIP_TRANSFER_REQUESTED';
        extraDetails = { targetOwnerType: payload.targetOwnerType, targetOwnerId: payload.targetOwnerId, reason: text(payload.reason || 'not-provided', 'payload.reason', 512), downstreamMutations: 'none' };
        break;
      default:
        return failure('PROJECT_COMMAND_UNSUPPORTED', `Unsupported Project Registry command: ${command.commandType}.`);
    }

    const permissionFailure = requireWritePermission(command, project, capability);
    if (permissionFailure) return permissionFailure;
    if (next.lifecycleState !== project.lifecycleState) transition(project, next.lifecycleState);
    next.updatedAt = now();
    next.recordVersion = project.recordVersion + 1;
    const legacyCheck = checkLegacyMappings(next, next.legacyBindings);
    if (legacyCheck.conflict && next.lifecycleState !== 'QUARANTINED') return failure(legacyCheck.conflict, 'Legacy mapping conflict was rejected and originals were preserved.', 'legacyBindings');
    return commitProject({ previous: project, next, command, eventType, details: extraDetails });
  }

  function executeProjectCommand(command) {
    const validation = validateProjectCommand(command);
    if (!validation.valid) return { ok: false, diagnostics: validation.diagnostics };
    const normalized = validation.value;
    const replay = replayOrConflict(normalized);
    if (replay.conflict) return replay.conflict;
    if (replay.replay) return replay.replay;
    const specificFlags = [];
    if (normalized.commandType === 'BEGIN_MIGRATION' || normalized.commandType === 'COMPLETE_MIGRATION' || normalized.commandType === 'QUARANTINE_LEGACY_MAPPING') {
      specificFlags.push(PROJECT_REGISTRY_FLAGS.migration, PROJECT_REGISTRY_FLAGS.legacyAdapter);
    } else if (normalized.commandType === 'REQUEST_OWNERSHIP_TRANSFER') {
      specificFlags.push(PROJECT_REGISTRY_FLAGS.ownershipTransfer);
    } else if (normalized.commandType === 'CREATE_PROJECT' && Array.isArray(normalized.payload.legacyBindings) && normalized.payload.legacyBindings.length > 0) {
      specificFlags.push(PROJECT_REGISTRY_FLAGS.legacyAdapter);
    }
    specificFlags.push(PROJECT_REGISTRY_FLAGS.write);
    for (const flagId of specificFlags) {
      const flag = requireFlag(flagId, 'write', normalized.actorId);
      if (flag) return storeCommand(normalized, replay.fingerprint, flag);
    }
    let result;
    try {
      result = normalized.commandType === 'CREATE_PROJECT' ? executeCreate(normalized) : executeUpdate(normalized);
    } catch (error) {
      result = failure('PROJECT_COMMAND_INVALID', error.message);
    }
    return storeCommand(normalized, replay.fingerprint, result);
  }

  function getProject({ projectId, actorId = null, directReference = false, identityKnown = actorId !== null, membershipVersion = null } = {}) {
    const flag = requireFlag(PROJECT_REGISTRY_FLAGS.read, 'read', actorId);
    if (flag) return flag;
    let id;
    try { id = typedId(projectId, 'projectId'); } catch (error) { return failure('PROJECT_ID_INVALID', error.message, 'projectId'); }
    const project = state.projects.get(id);
    const access = accessResult({ project, actorId, action: 'read', directReference, identityKnown, membershipVersion });
    if (!access.ok) return failure(access.code, 'Project access was denied without exposing private existence.', null, { httpStatus: access.httpStatus, expose: access.expose });
    return success({ project: clone(project), access });
  }

  function listProjects({ actorId = null, cursor = null, pageSize = 25, visibility = null, ownerId = null, memberOf = null, lifecycleStates = ['ACTIVE', 'ARCHIVED'], identityKnown = actorId !== null } = {}) {
    const flag = requireFlag(PROJECT_REGISTRY_FLAGS.read, 'read', actorId);
    if (flag) return flag;
    try {
      pageSize = integer(pageSize, 'pageSize', 1);
      if (pageSize > PROJECT_REGISTRY_LIMITS.pageSize) throw new Error('pageSize exceeds the server limit.');
      if (visibility !== null) enumValue(visibility, 'visibility', PROJECT_VISIBILITIES);
      if (!Array.isArray(lifecycleStates) || lifecycleStates.some(value => !PROJECT_LIFECYCLE_STATES.includes(value))) throw new Error('lifecycleStates contains an unsupported state.');
      const after = cursor === null ? null : parseProjectCursor(cursor);
      const candidates = [...state.projects.values()]
        .filter(project => lifecycleStates.includes(project.lifecycleState))
        .filter(project => visibility === null || project.visibility === visibility)
        .filter(project => ownerId === null || project.ownerId === ownerId)
        .filter(project => memberOf === null || project.members.some(member => member.principalId === memberOf && member.status === 'ACTIVE') || project.ownerId === memberOf)
        .filter(project => accessResult({ project, actorId, action: 'read', directReference: false, identityKnown }).ok)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.projectId.localeCompare(b.projectId));
      const page = after ? candidates.filter(project => project.updatedAt > after.updatedAt || (project.updatedAt === after.updatedAt && project.projectId > after.projectId)) : candidates;
      const projects = page.slice(0, pageSize).map(clone);
      const last = projects[projects.length - 1];
      return success({ projects, nextCursor: page.length > pageSize ? createProjectCursor(last) : null, pageSize, serverFiltered: true });
    } catch (error) {
      return failure('PROJECT_LIST_INVALID', error.message);
    }
  }

  function switchProject({ actorId, projectId, sourceProjectId = null, membershipVersion = null } = {}) {
    const result = getProject({ projectId, actorId, directReference: true, identityKnown: true, membershipVersion });
    if (!result.ok) return result;
    return success({
      sourceProjectId: sourceProjectId === null ? null : typedId(sourceProjectId, 'sourceProjectId'),
      targetProjectId: result.result.project.projectId,
      targetRecordVersion: result.result.project.recordVersion,
      project: result.result.project,
      editorStateMutation: 'none',
      contentBlobTransfer: 'none',
    });
  }

  function snapshot() {
    return clone({
      projects: [...state.projects.values()],
      events: state.events,
      legacyMappings: [...state.legacy.entries()].map(([key, value]) => ({ key, ...value })),
      networkAdapterInjected: Boolean(networkAdapter),
      flags: PROJECT_REGISTRY_FLAGS,
    });
  }

  return Object.freeze({
    executeProjectCommand,
    getProject,
    listProjects,
    switchProject,
    snapshot,
    validateProjectRecord: record => validateProjectRecord(record, { registeredTools }),
    validateProjectCommand,
    adapters: Object.freeze({ clock: typeof clock === 'function', idGenerator: typeof adapters.idGenerator === 'function', random: typeof adapters.random === 'function', network: Boolean(networkAdapter) }),
  });
}

function createProjectCursor(project) {
  return `v1:${encodeURIComponent(project.updatedAt)}:${encodeURIComponent(project.projectId)}`;
}

function parseProjectCursor(cursor) {
  const parts = String(cursor).split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Cursor is invalid.');
  const updatedAt = decodeURIComponent(parts[1]);
  const projectId = typedId(decodeURIComponent(parts[2]), 'cursor.projectId');
  timestamp(updatedAt, 'cursor.updatedAt');
  return { updatedAt, projectId };
}

export function createProjectSwitcherContract({ registry } = {}) {
  if (!registry || typeof registry.listProjects !== 'function' || typeof registry.switchProject !== 'function') throw new Error('A Project Registry is required.');
  return Object.freeze({
    list: options => registry.listProjects(options),
    switch: options => registry.switchProject(options),
    rules: Object.freeze({
      stableCursor: true,
      deterministicOrder: 'updatedAt ASC, projectId ASC',
      serverPermissionFilter: true,
      noEditorStateMutation: true,
      noBlobTransfer: true,
    }),
  });
}

export const PROJECT_REGISTRY_CONTRACT = Object.freeze({
  schemaVersion: PROJECT_REGISTRY_SCHEMA_VERSION,
  recordKeys: Object.freeze([...PROJECT_RECORD_KEYS]),
  commands: PROJECT_COMMAND_TYPES,
  events: PROJECT_EVENT_TYPES,
  flags: PROJECT_REGISTRY_FLAGS,
  storage: PROJECT_STORAGE_BOUNDARY,
  lifecycleTransitions: LIFECYCLE_TRANSITIONS,
  registeredTools: REGISTERED_PROJECT_TOOLS,
  limits: PROJECT_REGISTRY_LIMITS,
});
