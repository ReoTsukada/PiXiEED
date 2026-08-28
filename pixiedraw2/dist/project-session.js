// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});
function jsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not accept non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== void 0) result[key] = jsonValue(item);
    }
    return result;
  }
  throw new Error("Canonical JSON accepts only JSON-compatible values.");
}
function canonicalJson(value) {
  return JSON.stringify(jsonValue(value));
}
async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/pixync/contracts.ts
var PIXYNC_DRAW2_SCHEMA_VERSION = "PIXYNC_DRAW2_OPERATION_V1";
var PixyncError = class extends Error {
  code;
  path;
  constructor(code, message, path) {
    super(message);
    this.name = "PixyncError";
    this.code = code;
    this.path = path;
  }
};

// src/pixync/core.ts
var PIXYNC_DRAW2_MAX_PAYLOAD_BYTES = 16384;
var PIXYNC_DRAW2_MAX_PAYLOAD_DEPTH = 8;
var PIXYNC_DRAW2_MAX_PAYLOAD_KEYS = 96;
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
var SHA256 = /^[a-f0-9]{64}$/u;
var FORBIDDEN_KEY_PARTS = [
  "pointer",
  "preview",
  "snapshot",
  "rawaudioblob",
  "audioblob",
  "blob",
  "dom"
];
var REVISION_REFERENCE_KEYS = /* @__PURE__ */ new Set([
  "operationId",
  "aggregate",
  "projectRevision",
  "aggregateRevision"
]);
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function reject(code, message, path) {
  throw new PixyncError(code, message, path);
}
function assertSafeId(value, path) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    reject("INVALID_ENVELOPE", "A bounded stable identifier is required.", path);
  }
}
function assertAggregate(value, path) {
  if (value !== "draw" && value !== "audio" && value !== "game") {
    reject("INVALID_ENVELOPE", "Unknown aggregate.", path);
  }
}
function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    reject("INVALID_ENVELOPE", "A non-negative safe integer is required.", path);
  }
}
function assertJsonValue(value, depth, path) {
  if (depth > PIXYNC_DRAW2_MAX_PAYLOAD_DEPTH) {
    reject("PAYLOAD_TOO_LARGE", "Payload nesting exceeds the bounded command limit.", path);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      reject("INVALID_ENVELOPE", "Payload numbers must be finite.", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > PIXYNC_DRAW2_MAX_PAYLOAD_KEYS) {
      reject("PAYLOAD_TOO_LARGE", "Payload arrays exceed the bounded command limit.", path);
    }
    value.forEach((item, index) => assertJsonValue(item, depth + 1, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    reject("INVALID_ENVELOPE", "Payload must contain JSON values only.", path);
  }
  const keys = Object.keys(value);
  if (keys.length > PIXYNC_DRAW2_MAX_PAYLOAD_KEYS) {
    reject("PAYLOAD_TOO_LARGE", "Payload object has too many keys.", path);
  }
  for (const key of keys) {
    const normalized = key.toLowerCase().replaceAll("_", "");
    if (FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part))) {
      reject("PAYLOAD_FORBIDDEN", "UI previews, pointer samples, snapshots, and raw blobs are not sync payloads.", `${path}.${key}`);
    }
    assertJsonValue(value[key], depth + 1, `${path}.${key}`);
  }
}
function assertRevisionReference(value, path) {
  if (!isRecord(value) || Object.keys(value).some((key) => !REVISION_REFERENCE_KEYS.has(key))) {
    reject("PAYLOAD_FORBIDDEN", "Revision references must not carry snapshots.", path);
  }
  assertSafeId(value.operationId, `${path}.operationId`);
  assertAggregate(value.aggregate, `${path}.aggregate`);
  assertNonNegativeInteger(value.projectRevision, `${path}.projectRevision`);
  assertNonNegativeInteger(value.aggregateRevision, `${path}.aggregateRevision`);
  if (value.projectRevision === 0 || value.aggregateRevision === 0) {
    reject("INVALID_ENVELOPE", "A locked revision reference must point to a committed revision.", path);
  }
}
function assertNestedRevisionReferences(value, path) {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNestedRevisionReferences(item, `${path}[${index}]`));
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "revisionRef") assertRevisionReference(child, `${path}.${key}`);
    else assertNestedRevisionReferences(child, `${path}.${key}`);
  }
}
async function payloadHash(payload) {
  assertJsonValue(payload, 0, "payload");
  assertNestedRevisionReferences(payload, "payload");
  const serialized = canonicalJson(payload);
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.byteLength > PIXYNC_DRAW2_MAX_PAYLOAD_BYTES) {
    reject("PAYLOAD_TOO_LARGE", "Payload exceeds the bounded command limit.", "payload");
  }
  return sha256Hex(serialized);
}
async function validatePixyncDraft(draft) {
  if (!isRecord(draft) || draft.schemaVersion !== PIXYNC_DRAW2_SCHEMA_VERSION) {
    reject("INVALID_ENVELOPE", "Unsupported PiXYNC Draw2 envelope schema.", "schemaVersion");
  }
  assertSafeId(draft.operationId, "operationId");
  assertSafeId(draft.projectId, "projectId");
  assertAggregate(draft.aggregate, "aggregate");
  assertSafeId(draft.actorId, "actorId");
  assertSafeId(draft.clientId, "clientId");
  if (!Number.isSafeInteger(draft.clientSequence) || draft.clientSequence <= 0) {
    reject("INVALID_ENVELOPE", "clientSequence must be a positive safe integer.", "clientSequence");
  }
  assertNonNegativeInteger(draft.baseProjectRevision, "baseProjectRevision");
  assertNonNegativeInteger(draft.aggregateRevision, "aggregateRevision");
  if (typeof draft.payloadHash !== "string" || !SHA256.test(draft.payloadHash)) {
    reject("INVALID_ENVELOPE", "payloadHash must be a lowercase SHA-256 value.", "payloadHash");
  }
  if (!isRecord(draft.payload)) {
    reject("INVALID_ENVELOPE", "payload must be a JSON object.", "payload");
  }
  const expectedHash = await payloadHash(draft.payload);
  if (expectedHash !== draft.payloadHash) {
    reject("PAYLOAD_HASH_MISMATCH", "payloadHash does not match the canonical payload.", "payloadHash");
  }
  if (draft.compensation !== void 0) assertCompensation(draft.compensation);
}
function assertCompensation(value) {
  if (!isRecord(value)) {
    reject("INVALID_ENVELOPE", "Compensation guard must be an object.", "compensation");
  }
  assertSafeId(value.targetOperationId, "compensation.targetOperationId");
  const hasRevision = value.expectedAggregateRevision !== void 0;
  const hasWriter = value.writerGuard !== void 0;
  if (!hasRevision && !hasWriter) {
    reject("INVALID_ENVELOPE", "Compensation requires a revision or writer guard.", "compensation");
  }
  if (hasRevision) {
    assertNonNegativeInteger(value.expectedAggregateRevision, "compensation.expectedAggregateRevision");
  }
  if (hasWriter) assertSafeId(value.writerGuard, "compensation.writerGuard");
}
async function operationFingerprint(operation) {
  return sha256Hex(canonicalJson({
    schemaVersion: operation.schemaVersion,
    operationId: operation.operationId,
    projectId: operation.projectId,
    aggregate: operation.aggregate,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
    baseProjectRevision: operation.baseProjectRevision,
    payloadHash: operation.payloadHash,
    payload: operation.payload,
    compensation: operation.compensation
  }));
}
async function committedOperationFingerprint(operation) {
  return sha256Hex(canonicalJson({
    submissionFingerprint: await operationFingerprint(operation),
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision
  }));
}
function writerGuard(operation) {
  return `${operation.aggregate}:${operation.aggregateRevision}:${operation.operationId}`;
}
async function validatePixyncCommitted(operation) {
  await validatePixyncDraft(operation);
  if (!Number.isSafeInteger(operation.projectRevision) || operation.projectRevision <= 0) {
    reject("INVALID_ENVELOPE", "Committed projectRevision must be positive.", "projectRevision");
  }
  if (typeof operation.committedAt !== "string" || !Number.isFinite(Date.parse(operation.committedAt))) {
    reject("INVALID_ENVELOPE", "Committed timestamp must be a valid ISO timestamp.", "committedAt");
  }
}
function revisionReferences(payload) {
  const references = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "revisionRef") {
        references.push(child);
      } else visit(child);
    }
  };
  visit(payload);
  return references;
}

// src/pixync/in-memory.ts
var AGGREGATES = [
  "draw",
  "audio",
  "game"
];
function emptyRevisions() {
  return {
    draw: 0,
    audio: 0,
    game: 0
  };
}
function adapterMap(adapters) {
  const result = /* @__PURE__ */ new Map();
  for (const adapter of adapters) {
    if (result.has(adapter.aggregate)) {
      throw new PixyncError("INVALID_ENVELOPE", "Each aggregate needs one adapter.", "adapter.aggregate");
    }
    result.set(adapter.aggregate, adapter);
  }
  for (const aggregate of AGGREGATES) {
    if (!result.has(aggregate)) {
      throw new PixyncError("INVALID_ENVELOPE", "Draw, Audio, and Game adapters are all required.", "adapters");
    }
  }
  return result;
}
var PixyncInMemoryTransport = class {
  #log = [];
  #receivers = /* @__PURE__ */ new Map();
  broadcast(operation) {
    this.#log.push(operation);
  }
  connect(clientId, receiver) {
    if (this.#receivers.has(clientId)) {
      throw new PixyncError("IDEMPOTENCY_CONFLICT", "Client is already connected.", "clientId");
    }
    this.#receivers.set(clientId, receiver);
    return () => this.#receivers.delete(clientId);
  }
  operationsSince(projectRevision) {
    return this.#log.filter((operation) => operation.projectRevision > projectRevision);
  }
  async deliver(clientId, operations) {
    const receiver = this.#receivers.get(clientId);
    if (!receiver) {
      throw new PixyncError("INVALID_ENVELOPE", "Client is not connected.", "clientId");
    }
    for (const operation of operations) await receiver(operation);
  }
  async reconnectCatchUp(clientId, projectRevision) {
    await this.deliver(clientId, this.operationsSince(projectRevision));
  }
};
var PixyncInMemorySequencer = class {
  #projectId;
  #adapters;
  #transport;
  #now;
  #operations = [];
  #byId = /* @__PURE__ */ new Map();
  #projectRevision = 0;
  #aggregateRevisions = emptyRevisions();
  constructor(options) {
    this.#projectId = options.projectId;
    this.#adapters = adapterMap(options.adapters);
    this.#transport = options.transport ?? new PixyncInMemoryTransport();
    this.#now = options.now ?? (() => /* @__PURE__ */ new Date("2026-01-01T00:00:00.000Z"));
  }
  get transport() {
    return this.#transport;
  }
  snapshot() {
    return {
      projectId: this.#projectId,
      projectRevision: this.#projectRevision,
      aggregateRevisions: {
        ...this.#aggregateRevisions
      },
      operationIds: this.#operations.map((operation) => operation.operationId)
    };
  }
  log() {
    return [
      ...this.#operations
    ];
  }
  async commit(draft) {
    await validatePixyncDraft(draft);
    if (draft.projectId !== this.#projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Operation belongs to another project.", "projectId");
    }
    const existing = this.#byId.get(draft.operationId);
    if (existing) {
      const currentFingerprint = await operationFingerprint(existing);
      const incomingFingerprint = await operationFingerprint(draft);
      if (currentFingerprint !== incomingFingerprint) {
        throw new PixyncError("IDEMPOTENCY_CONFLICT", "Operation ID was reused with a different payload or identity.", "operationId");
      }
      return {
        operation: existing,
        duplicate: true
      };
    }
    if (draft.baseProjectRevision > this.#projectRevision) {
      throw new PixyncError("SEQUENCER_NOT_CONTIGUOUS", "baseProjectRevision is ahead of the sequencer.", "baseProjectRevision");
    }
    const currentAggregateRevision = this.#aggregateRevisions[draft.aggregate];
    if (draft.aggregateRevision !== 0 && draft.aggregateRevision !== currentAggregateRevision + 1) {
      throw new PixyncError("AGGREGATE_REVISION_STALE", "aggregateRevision is not the next canonical revision.", "aggregateRevision");
    }
    for (const reference of revisionReferences(draft.payload)) {
      if (reference.projectRevision > this.#projectRevision) {
        throw new PixyncError("SEQUENCER_NOT_CONTIGUOUS", "Cross-domain reference points to a future revision.", "payload.revisionRef.projectRevision");
      }
      const referenced = this.#byId.get(reference.operationId);
      if (!referenced || referenced.projectRevision !== reference.projectRevision || referenced.aggregateRevision !== reference.aggregateRevision || referenced.aggregate !== reference.aggregate) {
        throw new PixyncError("INVALID_ENVELOPE", "Cross-domain reference is not bound to a committed operation.", "payload.revisionRef");
      }
    }
    this.#assertCompensation(draft);
    const operation = {
      ...draft,
      aggregateRevision: currentAggregateRevision + 1,
      projectRevision: this.#projectRevision + 1,
      committedAt: this.#now().toISOString()
    };
    const adapter = this.#adapters.get(operation.aggregate);
    const context = {
      source: "sequencer",
      projectRevision: operation.projectRevision,
      aggregateRevision: operation.aggregateRevision
    };
    try {
      await adapter.apply(operation, context);
    } catch {
      throw new PixyncError("AGGREGATE_APPLY_FAILED", "Aggregate apply failed; project revision was not advanced.", "aggregate");
    }
    this.#projectRevision = operation.projectRevision;
    this.#aggregateRevisions = {
      ...this.#aggregateRevisions,
      [operation.aggregate]: operation.aggregateRevision
    };
    this.#operations.push(operation);
    this.#byId.set(operation.operationId, operation);
    this.#transport.broadcast(operation);
    return {
      operation,
      duplicate: false
    };
  }
  #assertCompensation(draft) {
    if (!draft.compensation) return;
    const target = this.#byId.get(draft.compensation.targetOperationId);
    if (!target || target.aggregate !== draft.aggregate) {
      throw new PixyncError("COMPENSATION_GUARD_STALE", "Compensation target is missing or belongs to another aggregate.", "compensation.targetOperationId");
    }
    if (draft.compensation.expectedAggregateRevision !== void 0 && draft.compensation.expectedAggregateRevision !== this.#aggregateRevisions[draft.aggregate]) {
      throw new PixyncError("COMPENSATION_GUARD_STALE", "Compensation expectedAggregateRevision is stale.", "compensation.expectedAggregateRevision");
    }
    if (draft.compensation.writerGuard !== void 0 && draft.compensation.writerGuard !== writerGuard(target)) {
      throw new PixyncError("COMPENSATION_GUARD_STALE", "Compensation writer guard is stale.", "compensation.writerGuard");
    }
  }
};
var PixyncOrderKeeper = class {
  #projectId;
  #adapters;
  #pending = /* @__PURE__ */ new Map();
  #applied = /* @__PURE__ */ new Map();
  #projectRevision = 0;
  #aggregateRevisions = emptyRevisions();
  constructor(options) {
    this.#projectId = options.projectId;
    this.#adapters = adapterMap(options.adapters);
    const initialState = options.initialState;
    if (initialState !== void 0) {
      if (initialState.projectId !== options.projectId) {
        throw new PixyncError("PROJECT_MISMATCH", "OrderKeeper initial state belongs to another project.", "initialState.projectId");
      }
      if (!Number.isSafeInteger(initialState.projectRevision) || initialState.projectRevision < 0) {
        throw new PixyncError("INVALID_ENVELOPE", "OrderKeeper initial project revision is invalid.", "initialState.projectRevision");
      }
      this.#projectRevision = initialState.projectRevision;
      for (const aggregate of AGGREGATES) {
        const revision = initialState.aggregateRevisions[aggregate];
        if (!Number.isSafeInteger(revision) || revision < 0) {
          throw new PixyncError("INVALID_ENVELOPE", "OrderKeeper initial aggregate revision is invalid.", `initialState.aggregateRevisions.${aggregate}`);
        }
        this.#aggregateRevisions[aggregate] = revision;
      }
      const byRevision = /* @__PURE__ */ new Set();
      const byId = /* @__PURE__ */ new Set();
      for (const applied of initialState.appliedOperations) {
        if (byId.has(applied.operationId) || byRevision.has(applied.projectRevision) || typeof applied.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(applied.fingerprint) || !Number.isSafeInteger(applied.projectRevision) || applied.projectRevision <= 0 || applied.projectRevision > this.#projectRevision || !Number.isSafeInteger(applied.aggregateRevision) || applied.aggregateRevision <= 0) {
          throw new PixyncError("INVALID_ENVELOPE", "OrderKeeper initial operation receipt is invalid or duplicated.", "initialState.appliedOperations");
        }
        byId.add(applied.operationId);
        byRevision.add(applied.projectRevision);
        this.#applied.set(applied.operationId, applied.fingerprint);
      }
      if (byRevision.size !== this.#projectRevision) {
        throw new PixyncError("SEQUENCER_NOT_CONTIGUOUS", "OrderKeeper initial receipts do not form a complete revision prefix.", "initialState.appliedOperations");
      }
    }
  }
  snapshot() {
    return {
      projectId: this.#projectId,
      projectRevision: this.#projectRevision,
      aggregateRevisions: {
        ...this.#aggregateRevisions
      },
      operationIds: [
        ...this.#applied.keys()
      ]
    };
  }
  async receive(operation) {
    await validatePixyncCommitted(operation);
    if (operation.projectId !== this.#projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Operation belongs to another project.", "projectId");
    }
    const fingerprint = await committedOperationFingerprint(operation);
    const appliedFingerprint = this.#applied.get(operation.operationId);
    if (appliedFingerprint) {
      if (appliedFingerprint !== fingerprint) {
        throw new PixyncError("IDEMPOTENCY_CONFLICT", "Applied operation ID has a different payload.", "operationId");
      }
      return "duplicate";
    }
    const held = this.#pending.get(operation.projectRevision);
    if (held) {
      if (await committedOperationFingerprint(held) !== fingerprint) {
        throw new PixyncError("IDEMPOTENCY_CONFLICT", "Held operation revision has a different payload.", "projectRevision");
      }
      if (operation.projectRevision === this.#projectRevision + 1) {
        await this.#drain();
        return "applied";
      }
      return "duplicate";
    }
    if (operation.projectRevision <= this.#projectRevision) {
      throw new PixyncError("SEQUENCER_NOT_CONTIGUOUS", "Unknown old project revision cannot be applied.", "projectRevision");
    }
    this.#pending.set(operation.projectRevision, operation);
    if (operation.projectRevision > this.#projectRevision + 1) {
      return "gap-held";
    }
    await this.#drain();
    return "applied";
  }
  async catchUp(operations) {
    for (const operation of [
      ...operations
    ].sort((left, right) => left.projectRevision - right.projectRevision)) await this.receive(operation);
  }
  async #drain() {
    while (this.#pending.has(this.#projectRevision + 1)) {
      const operation = this.#pending.get(this.#projectRevision + 1);
      const expectedAggregateRevision = this.#aggregateRevisions[operation.aggregate] + 1;
      if (operation.aggregateRevision !== expectedAggregateRevision) {
        throw new PixyncError("AGGREGATE_REVISION_STALE", "Aggregate revision is not contiguous.", "aggregateRevision");
      }
      const adapter = this.#adapters.get(operation.aggregate);
      try {
        await adapter.apply(operation, {
          source: "remote",
          projectRevision: operation.projectRevision,
          aggregateRevision: operation.aggregateRevision
        });
      } catch {
        throw new PixyncError("AGGREGATE_APPLY_FAILED", "Remote aggregate apply failed; order keeper did not advance.", "aggregate");
      }
      this.#pending.delete(operation.projectRevision);
      this.#applied.set(operation.operationId, await committedOperationFingerprint(operation));
      this.#projectRevision = operation.projectRevision;
      this.#aggregateRevisions = {
        ...this.#aggregateRevisions,
        [operation.aggregate]: operation.aggregateRevision
      };
    }
  }
};

// src/pixync/project-session.ts
var AGGREGATES2 = [
  "draw",
  "audio",
  "game"
];
var SAFE_ID2 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
var MAX_META_TEXT = 160;
var MAX_OPERATION_BYTES = 32768;
var DEFAULT_PRESENCE_TTL_MS = 3e4;
function assertSafeId2(value, path) {
  if (typeof value !== "string" || !SAFE_ID2.test(value)) {
    throw new PixyncError("INVALID_ENVELOPE", "A bounded stable identifier is required.", path);
  }
}
function assertBoundedText(value, path, allowEmpty = false) {
  if (typeof value !== "string" || value.length > MAX_META_TEXT || !allowEmpty && value.trim().length === 0) {
    throw new PixyncError("INVALID_ENVELOPE", "Presence metadata must be short text.", path);
  }
}
function assertMode(value, path) {
  if (value !== "iDRAW" && value !== "iAUDIO" && value !== "iGAME") {
    throw new PixyncError("INVALID_ENVELOPE", "Unknown session mode.", path);
  }
}
function assertRole(value, path) {
  if (value !== "owner" && value !== "editor" && value !== "viewer") {
    throw new PixyncError("INVALID_ENVELOPE", "Unknown session role.", path);
  }
}
function assertCheckpointKind(value, path) {
  if (value !== "MANUAL" && value !== "AUTOSAVE") {
    throw new PixyncError("INVALID_ENVELOPE", "Unknown checkpoint kind.", path);
  }
}
function validateCheckpointInput(input) {
  if (input === null || typeof input !== "object") {
    throw new PixyncError("INVALID_ENVELOPE", "Checkpoint must be a bounded metadata object.", "checkpoint");
  }
  const value = input;
  assertExactKeys(value, [
    "checkpointId",
    "label",
    "kind"
  ], "checkpoint");
  assertSafeId2(value.checkpointId, "checkpoint.checkpointId");
  assertBoundedText(value.label, "checkpoint.label");
  assertCheckpointKind(value.kind, "checkpoint.kind");
}
function validateCheckpoint(value) {
  const record = value;
  assertExactKeys(record, [
    "checkpointId",
    "projectId",
    "label",
    "kind",
    "createdByActorId",
    "createdByClientId",
    "createdAt",
    "projectRevision",
    "aggregateRevisions",
    "operationCount"
  ], "checkpoint");
  assertSafeId2(record.checkpointId, "checkpoint.checkpointId");
  assertSafeId2(record.projectId, "checkpoint.projectId");
  assertBoundedText(record.label, "checkpoint.label");
  assertCheckpointKind(record.kind, "checkpoint.kind");
  assertSafeId2(record.createdByActorId, "checkpoint.createdByActorId");
  assertSafeId2(record.createdByClientId, "checkpoint.createdByClientId");
  if (typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new PixyncError("INVALID_ENVELOPE", "Checkpoint createdAt must be an ISO timestamp.", "checkpoint.createdAt");
  }
  if (!Number.isSafeInteger(record.projectRevision) || record.projectRevision < 0 || !Number.isSafeInteger(record.operationCount) || record.operationCount < 0) {
    throw new PixyncError("INVALID_ENVELOPE", "Checkpoint revisions must be non-negative safe integers.", "checkpoint.projectRevision");
  }
  const revisions = record.aggregateRevisions;
  if (revisions === null || typeof revisions !== "object") {
    throw new PixyncError("INVALID_ENVELOPE", "Checkpoint aggregate revisions are required.", "checkpoint.aggregateRevisions");
  }
  assertExactKeys(revisions, [
    "draw",
    "audio",
    "game"
  ], "checkpoint.aggregateRevisions");
  for (const aggregate of AGGREGATES2) {
    const revision = revisions[aggregate];
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new PixyncError("INVALID_ENVELOPE", "Checkpoint aggregate revision is invalid.", `checkpoint.aggregateRevisions.${aggregate}`);
    }
  }
}
function sortCheckpoints(checkpoints) {
  return [
    ...checkpoints
  ].sort((left, right) => left.projectRevision - right.projectRevision || left.checkpointId.localeCompare(right.checkpointId));
}
function assertExactKeys(value, keys, path) {
  const expected = new Set(keys);
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !expected.has(key))) {
    throw new PixyncError("PAYLOAD_FORBIDDEN", "Project Session metadata has an unsupported field.", path);
  }
}
function validatePresenceInput(input) {
  if (input === null || typeof input !== "object") {
    throw new PixyncError("INVALID_ENVELOPE", "Presence must be a bounded metadata object.", "presence");
  }
  const value = input;
  assertExactKeys(value, [
    "actorId",
    "clientId",
    "displayName",
    "mode",
    "selectionLabel"
  ], "presence");
  assertSafeId2(value.actorId, "presence.actorId");
  assertSafeId2(value.clientId, "presence.clientId");
  assertBoundedText(value.displayName, "presence.displayName");
  assertMode(value.mode, "presence.mode");
  assertBoundedText(value.selectionLabel, "presence.selectionLabel", true);
}
function validatePresence(value) {
  const record = value;
  assertExactKeys(record, [
    "actorId",
    "clientId",
    "displayName",
    "mode",
    "selectionLabel",
    "updatedAt"
  ], "presence");
  assertSafeId2(record.actorId, "presence.actorId");
  assertSafeId2(record.clientId, "presence.clientId");
  assertBoundedText(record.displayName, "presence.displayName");
  assertMode(record.mode, "presence.mode");
  assertBoundedText(record.selectionLabel, "presence.selectionLabel", true);
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new PixyncError("INVALID_ENVELOPE", "Presence updatedAt must be an ISO timestamp.", "presence.updatedAt");
  }
}
async function validateBoundedOperation(operation) {
  if ("projectRevision" in operation) await validatePixyncCommitted(operation);
  else await validatePixyncDraft(operation);
  const bytes = new TextEncoder().encode(canonicalJson(operation)).byteLength;
  if (bytes > MAX_OPERATION_BYTES) {
    throw new PixyncError("PAYLOAD_TOO_LARGE", "Project Session operation envelope exceeds the bounded limit.", "operation");
  }
}
function errorDetails(error) {
  if (error instanceof PixyncError) {
    return {
      code: error.code,
      message: error.message
    };
  }
  if (error instanceof Error) return {
    code: "ERROR",
    message: error.message
  };
  return {
    code: "ERROR",
    message: "Project Session operation failed."
  };
}
function isConflictCode(code) {
  return [
    "IDEMPOTENCY_CONFLICT",
    "PROJECT_MISMATCH",
    "AGGREGATE_REVISION_STALE",
    "SEQUENCER_NOT_CONTIGUOUS",
    "COMPENSATION_GUARD_STALE",
    "GAP_HELD"
  ].includes(code);
}
var LocalProjectSessionBroker = class {
  #projectId;
  #sequencer;
  #transport;
  #now;
  #presenceTtlMs;
  #connections = /* @__PURE__ */ new Map();
  #presence = /* @__PURE__ */ new Map();
  #checkpoints = /* @__PURE__ */ new Map();
  #commitTail = Promise.resolve();
  constructor(options) {
    assertSafeId2(options.projectId, "projectId");
    this.#projectId = options.projectId;
    this.#now = options.now ?? (() => /* @__PURE__ */ new Date("2026-01-01T00:00:00.000Z"));
    this.#presenceTtlMs = options.presenceTtlMs ?? DEFAULT_PRESENCE_TTL_MS;
    if (!Number.isSafeInteger(this.#presenceTtlMs) || this.#presenceTtlMs <= 0) {
      throw new PixyncError("INVALID_ENVELOPE", "Presence TTL must be a positive safe integer.", "presenceTtlMs");
    }
    this.#sequencer = options.sequencer ?? new PixyncInMemorySequencer({
      projectId: options.projectId,
      adapters: options.adapters,
      ...options.transport === void 0 ? {} : {
        transport: options.transport
      },
      now: this.#now
    });
    this.#transport = this.#sequencer.transport;
    if (this.#sequencer.snapshot().projectId !== this.#projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Sequencer belongs to another project.", "sequencer.projectId");
    }
  }
  snapshot() {
    return this.#sequencer.snapshot();
  }
  async connect(input) {
    assertSafeId2(input.projectId, "projectId");
    assertSafeId2(input.actorId, "actorId");
    assertSafeId2(input.clientId, "clientId");
    const role = input.role ?? "editor";
    assertRole(role, "role");
    if (input.projectId !== this.#projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Session belongs to another project.", "projectId");
    }
    if (this.#connections.has(input.clientId)) {
      throw new PixyncError("IDEMPOTENCY_CONFLICT", "Client is already connected to this Project Session.", "clientId");
    }
    const initialPresence = [
      ...this.#presence.values()
    ].sort((left, right) => left.clientId.localeCompare(right.clientId));
    const initialCheckpoints = sortCheckpoints(this.#checkpoints.values());
    this.#connections.set(input.clientId, input);
    let closed = false;
    const unsubscribe = this.#transport.connect(input.clientId, async (operation) => {
      if (!closed) await input.onOperation(operation);
    });
    const connection = {
      role,
      initialPresence,
      initialCheckpoints,
      submit: (draft) => this.#submit(input, draft),
      fetchSince: async (projectRevision) => {
        if (closed) {
          throw new PixyncError("INVALID_ENVELOPE", "Connection is closed.", "clientId");
        }
        if (!Number.isSafeInteger(projectRevision) || projectRevision < 0) {
          throw new PixyncError("INVALID_ENVELOPE", "Revision must be non-negative.", "projectRevision");
        }
        return this.#transport.operationsSince(projectRevision);
      },
      latestProjectRevision: () => this.#sequencer.snapshot().projectRevision,
      publishPresence: async (presence) => {
        if (closed) {
          throw new PixyncError("INVALID_ENVELOPE", "Connection is closed.", "clientId");
        }
        validatePresenceInput(presence);
        if (presence.clientId !== input.clientId || presence.actorId !== input.actorId) {
          throw new PixyncError("INVALID_ENVELOPE", "Presence identity is not bound to the connection.", "presence.clientId");
        }
        const next = {
          ...presence,
          updatedAt: this.#now().toISOString()
        };
        validatePresence(next);
        this.#presence.set(input.clientId, next);
        await this.#broadcastPresence({
          kind: "upsert",
          presence: next
        });
        return next;
      },
      createCheckpoint: async (checkpointInput) => {
        if (closed) {
          throw new PixyncError("INVALID_ENVELOPE", "Connection is closed.", "clientId");
        }
        if (role === "viewer") {
          throw new PixyncError("ROLE_FORBIDDEN", "Viewer sessions cannot create checkpoints.", "role");
        }
        validateCheckpointInput(checkpointInput);
        const snapshot = this.#sequencer.snapshot();
        const next = {
          checkpointId: checkpointInput.checkpointId,
          projectId: this.#projectId,
          label: checkpointInput.label,
          kind: checkpointInput.kind,
          createdByActorId: input.actorId,
          createdByClientId: input.clientId,
          createdAt: this.#now().toISOString(),
          projectRevision: snapshot.projectRevision,
          aggregateRevisions: {
            ...snapshot.aggregateRevisions
          },
          operationCount: snapshot.operationIds.length
        };
        validateCheckpoint(next);
        const existing = this.#checkpoints.get(next.checkpointId);
        if (existing !== void 0) {
          const sameIdentity = existing.projectId === next.projectId && existing.label === next.label && existing.kind === next.kind && existing.createdByActorId === next.createdByActorId && existing.createdByClientId === next.createdByClientId;
          if (!sameIdentity) {
            throw new PixyncError("IDEMPOTENCY_CONFLICT", "Checkpoint ID was reused with different metadata.", "checkpointId");
          }
          return existing;
        }
        this.#checkpoints.set(next.checkpointId, next);
        await this.#broadcastCheckpoint({
          kind: "upsert",
          checkpoint: next
        });
        return next;
      },
      listCheckpoints: async () => {
        if (closed) {
          throw new PixyncError("INVALID_ENVELOPE", "Connection is closed.", "clientId");
        }
        return sortCheckpoints(this.#checkpoints.values());
      },
      close: async () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        this.#connections.delete(input.clientId);
        if (this.#presence.delete(input.clientId)) {
          await this.#broadcastPresence({
            kind: "remove",
            clientId: input.clientId,
            reason: "disconnect"
          });
        }
      }
    };
    return connection;
  }
  /** Deterministic local fixture seam for reordered authoritative delivery. */
  async deliverTo(clientId, operations) {
    await this.#transport.deliver(clientId, operations);
  }
  async expirePresence() {
    const now = this.#now().getTime();
    const expired = [];
    for (const [clientId, presence] of this.#presence) {
      if (now - Date.parse(presence.updatedAt) >= this.#presenceTtlMs) {
        this.#presence.delete(clientId);
        expired.push(clientId);
        await this.#broadcastPresence({
          kind: "remove",
          clientId,
          reason: "expired"
        });
      }
    }
    return expired;
  }
  async #submit(connection, draft) {
    if (!this.#connections.has(connection.clientId)) {
      throw new PixyncError("INVALID_ENVELOPE", "Connection is closed.", "clientId");
    }
    if ((connection.role ?? "editor") === "viewer") {
      throw new PixyncError("ROLE_FORBIDDEN", "Viewer sessions cannot submit Project Session operations.", "role");
    }
    await validateBoundedOperation(draft);
    if (draft.projectId !== this.#projectId || draft.projectId !== connection.projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Operation belongs to another project.", "projectId");
    }
    if (draft.actorId !== connection.actorId || draft.clientId !== connection.clientId) {
      throw new PixyncError("INVALID_ENVELOPE", "Operation identity is not bound to the connection.", "clientId");
    }
    return this.#enqueue(async () => {
      const result = await this.#sequencer.commit(draft);
      await validateBoundedOperation(result.operation);
      await this.#broadcastOperation(result.operation);
      return result;
    });
  }
  async #broadcastOperation(operation) {
    const clientIds = [
      ...this.#connections.keys()
    ];
    for (const clientId of clientIds) {
      try {
        await this.#transport.deliver(clientId, [
          operation
        ]);
      } catch {
      }
    }
  }
  async #broadcastPresence(event) {
    const receivers = [
      ...this.#connections.values()
    ];
    for (const receiver of receivers) {
      try {
        await receiver.onPresence(event);
      } catch {
      }
    }
  }
  async #broadcastCheckpoint(event) {
    validateCheckpoint(event.checkpoint);
    const receivers = [
      ...this.#connections.values()
    ];
    for (const receiver of receivers) {
      try {
        await receiver.onCheckpoint(event);
      } catch {
      }
    }
  }
  #enqueue(work) {
    const result = this.#commitTail.then(work, work);
    this.#commitTail = result.then(() => void 0, () => void 0);
    return result;
  }
};
var ProjectSessionClient = class {
  #broker;
  #projectId;
  #actorId;
  #clientId;
  #displayName;
  #role;
  #keeper;
  #presence = /* @__PURE__ */ new Map();
  #checkpoints = /* @__PURE__ */ new Map();
  #pending = /* @__PURE__ */ new Set();
  #listeners = /* @__PURE__ */ new Set();
  #activeMode;
  #status = "OFFLINE";
  #lastError;
  #connection;
  constructor(options) {
    assertSafeId2(options.projectId, "projectId");
    assertSafeId2(options.actorId, "actorId");
    assertSafeId2(options.clientId, "clientId");
    assertBoundedText(options.displayName, "displayName");
    const role = options.role ?? "editor";
    assertRole(role, "role");
    this.#broker = options.broker;
    this.#projectId = options.projectId;
    this.#actorId = options.actorId;
    this.#clientId = options.clientId;
    this.#displayName = options.displayName;
    this.#role = role;
    this.#activeMode = options.activeMode ?? "iDRAW";
    assertMode(this.#activeMode, "activeMode");
    this.#keeper = new PixyncOrderKeeper({
      projectId: options.projectId,
      adapters: options.adapters
    });
  }
  state() {
    const snapshot = this.#keeper.snapshot();
    return {
      projectId: this.#projectId,
      activeMode: this.#activeMode,
      role: this.#role,
      status: this.#status,
      projectRevision: snapshot.projectRevision,
      aggregateRevisions: {
        ...snapshot.aggregateRevisions
      },
      pendingOperationIds: [
        ...this.#pending
      ].sort(),
      presence: [
        ...this.#presence.values()
      ].sort((left, right) => left.clientId.localeCompare(right.clientId)),
      checkpoints: sortCheckpoints(this.#checkpoints.values()),
      lastError: this.#lastError
    };
  }
  onState(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  setActiveMode(mode) {
    assertMode(mode, "activeMode");
    this.#activeMode = mode;
    this.#emit();
  }
  async connect(options = {}) {
    if (this.#connection !== void 0) return;
    this.#setStatus("RECOVERING");
    try {
      const connection = await this.#broker.connect({
        projectId: this.#projectId,
        actorId: this.#actorId,
        clientId: this.#clientId,
        role: this.#role,
        onOperation: async (operation) => {
          await this.#receive(operation);
        },
        onPresence: (event) => this.#receivePresence(event),
        onCheckpoint: (event) => this.#receiveCheckpoint(event)
      });
      this.#connection = connection;
      this.#presence.clear();
      for (const presence of connection.initialPresence) {
        validatePresence(presence);
        this.#presence.set(presence.clientId, presence);
      }
      this.#checkpoints.clear();
      for (const checkpoint of connection.initialCheckpoints) {
        validateCheckpoint(checkpoint);
        this.#checkpoints.set(checkpoint.checkpointId, checkpoint);
      }
      if (options.catchUp !== false) await this.catchUp();
      else this.#setStatus("RECOVERING");
      this.#emit();
    } catch (error) {
      const connection = this.#connection;
      this.#connection = void 0;
      if (connection !== void 0) await connection.close("disconnect");
      this.#setError(error, "OFFLINE");
      throw error;
    }
  }
  async catchUp() {
    const connection = this.#connection;
    if (connection === void 0) {
      this.#setStatus("OFFLINE");
      throw new PixyncError("INVALID_ENVELOPE", "Project Session is offline.", "clientId");
    }
    this.#setStatus("RECOVERING");
    try {
      const operations = await connection.fetchSince(this.#keeper.snapshot().projectRevision);
      await this.#keeper.catchUp(operations);
      if (this.#keeper.snapshot().projectRevision === connection.latestProjectRevision()) {
        this.#setStatus("CONFIRMED");
        this.#lastError = void 0;
      } else {
        this.#setStatus("RECOVERING");
      }
      this.#emit();
    } catch (error) {
      this.#setError(error, "ERROR");
      throw error;
    }
  }
  async submit(draft) {
    const connection = this.#connection;
    if (connection === void 0) {
      this.#setStatus("OFFLINE");
      throw new PixyncError("INVALID_ENVELOPE", "Project Session is offline.", "clientId");
    }
    if (draft.projectId !== this.#projectId) {
      this.#setError(new PixyncError("PROJECT_MISMATCH", "Operation belongs to another project.", "projectId"), "CONFLICT");
      throw new PixyncError("PROJECT_MISMATCH", "Operation belongs to another project.", "projectId");
    }
    this.#pending.add(draft.operationId);
    this.#setStatus("LOCAL_OPTIMISTIC");
    this.#setStatus("PENDING");
    try {
      const result = await connection.submit(draft);
      await this.#receive(result.operation);
      this.#pending.delete(draft.operationId);
      if (this.#keeper.snapshot().projectRevision === connection.latestProjectRevision()) {
        this.#setStatus("CONFIRMED");
      }
      this.#lastError = void 0;
      this.#emit();
      return result;
    } catch (error) {
      this.#pending.delete(draft.operationId);
      this.#setError(error, isConflictCode(errorDetails(error).code) ? "CONFLICT" : "ERROR");
      throw error;
    }
  }
  async publishPresence(selectionLabel) {
    const connection = this.#connection;
    if (connection === void 0) {
      this.#setStatus("OFFLINE");
      throw new PixyncError("INVALID_ENVELOPE", "Project Session is offline.", "clientId");
    }
    const input = {
      actorId: this.#actorId,
      clientId: this.#clientId,
      displayName: this.#displayName,
      mode: this.#activeMode,
      selectionLabel
    };
    const presence = await connection.publishPresence(input);
    this.#presence.set(presence.clientId, presence);
    this.#emit();
    return presence;
  }
  async createCheckpoint(input) {
    const connection = this.#connection;
    if (connection === void 0) {
      this.#setStatus("OFFLINE");
      throw new PixyncError("INVALID_ENVELOPE", "Project Session is offline.", "clientId");
    }
    try {
      const checkpoint = await connection.createCheckpoint(input);
      validateCheckpoint(checkpoint);
      this.#checkpoints.set(checkpoint.checkpointId, checkpoint);
      this.#lastError = void 0;
      this.#emit();
      return checkpoint;
    } catch (error) {
      this.#setError(error, isConflictCode(errorDetails(error).code) ? "CONFLICT" : "ERROR");
      throw error;
    }
  }
  async listCheckpoints() {
    const connection = this.#connection;
    if (connection === void 0) {
      this.#setStatus("OFFLINE");
      throw new PixyncError("INVALID_ENVELOPE", "Project Session is offline.", "clientId");
    }
    const checkpoints = await connection.listCheckpoints();
    for (const checkpoint of checkpoints) {
      validateCheckpoint(checkpoint);
      this.#checkpoints.set(checkpoint.checkpointId, checkpoint);
    }
    this.#emit();
    return sortCheckpoints(this.#checkpoints.values());
  }
  async disconnect() {
    const connection = this.#connection;
    this.#connection = void 0;
    if (connection !== void 0) await connection.close("disconnect");
    this.#presence.delete(this.#clientId);
    this.#setStatus("OFFLINE");
  }
  async #receive(operation) {
    try {
      await validateBoundedOperation(operation);
      const outcome = await this.#keeper.receive(operation);
      if (outcome === "gap-held") this.#setStatus("RECOVERING");
      else if (outcome === "applied" && this.#pending.size === 0) {
        this.#setStatus("CONFIRMED");
      }
      this.#emit();
      return outcome;
    } catch (error) {
      this.#setError(error, isConflictCode(errorDetails(error).code) ? "CONFLICT" : "ERROR");
      throw error;
    }
  }
  #receivePresence(event) {
    if (event.kind === "upsert") {
      validatePresence(event.presence);
      this.#presence.set(event.presence.clientId, event.presence);
    } else {
      assertSafeId2(event.clientId, "presence.clientId");
      this.#presence.delete(event.clientId);
    }
    this.#emit();
  }
  #receiveCheckpoint(event) {
    validateCheckpoint(event.checkpoint);
    if (event.checkpoint.projectId !== this.#projectId) {
      this.#setError(new PixyncError("PROJECT_MISMATCH", "Checkpoint belongs to another project.", "checkpoint.projectId"), "CONFLICT");
      return;
    }
    this.#checkpoints.set(event.checkpoint.checkpointId, event.checkpoint);
    this.#emit();
  }
  #setStatus(status) {
    this.#status = status;
    this.#emit();
  }
  #setError(error, status) {
    this.#status = status;
    this.#lastError = errorDetails(error);
    this.#emit();
  }
  #emit() {
    const state = this.state();
    for (const listener of this.#listeners) listener(state);
  }
};
export {
  LocalProjectSessionBroker,
  ProjectSessionClient
};
