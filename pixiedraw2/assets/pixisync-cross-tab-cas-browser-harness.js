// src/pixisync/contracts.ts
var PIXISYNC_DRAW2_SCHEMA_VERSION = "PIXSYNC_DRAW2_OPERATION_V1";
var PixisyncError = class extends Error {
  code;
  path;
  constructor(code, message, path) {
    super(message);
    this.name = "PixisyncError";
    this.code = code;
    this.path = path;
  }
};

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

// src/pixisync/core.ts
var PIXISYNC_DRAW2_MAX_PAYLOAD_BYTES = 16384;
var PIXISYNC_DRAW2_MAX_PAYLOAD_DEPTH = 8;
var PIXISYNC_DRAW2_MAX_PAYLOAD_KEYS = 96;
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
  throw new PixisyncError(code, message, path);
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
  if (depth > PIXISYNC_DRAW2_MAX_PAYLOAD_DEPTH) {
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
    if (value.length > PIXISYNC_DRAW2_MAX_PAYLOAD_KEYS) {
      reject("PAYLOAD_TOO_LARGE", "Payload arrays exceed the bounded command limit.", path);
    }
    value.forEach((item, index) => assertJsonValue(item, depth + 1, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    reject("INVALID_ENVELOPE", "Payload must contain JSON values only.", path);
  }
  const keys = Object.keys(value);
  if (keys.length > PIXISYNC_DRAW2_MAX_PAYLOAD_KEYS) {
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
  if (bytes.byteLength > PIXISYNC_DRAW2_MAX_PAYLOAD_BYTES) {
    reject("PAYLOAD_TOO_LARGE", "Payload exceeds the bounded command limit.", "payload");
  }
  return sha256Hex(serialized);
}
async function createPixisyncDraft(input) {
  return {
    schemaVersion: PIXISYNC_DRAW2_SCHEMA_VERSION,
    ...input,
    payloadHash: await payloadHash(input.payload)
  };
}
async function validatePixisyncDraft(draft) {
  if (!isRecord(draft) || draft.schemaVersion !== PIXISYNC_DRAW2_SCHEMA_VERSION) {
    reject("INVALID_ENVELOPE", "Unsupported PiXiSYNC Draw2 envelope schema.", "schemaVersion");
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
async function validatePixisyncCommitted(operation) {
  await validatePixisyncDraft(operation);
  if (!Number.isSafeInteger(operation.projectRevision) || operation.projectRevision <= 0) {
    reject("INVALID_ENVELOPE", "Committed projectRevision must be positive.", "projectRevision");
  }
  if (typeof operation.committedAt !== "string" || !Number.isFinite(Date.parse(operation.committedAt))) {
    reject("INVALID_ENVELOPE", "Committed timestamp must be a valid ISO timestamp.", "committedAt");
  }
}

// src/pixisync/durability.ts
var PIXISYNC_DURABLE_SNAPSHOT_SCHEMA = "PIXSYNC_DRAW2_DURABLE_SNAPSHOT_V1";
var PIXISYNC_DURABILITY_CAPABILITY = Object.freeze({
  processDurable: false,
  productionReady: false,
  indexedDb: "UNTESTED",
  file: "UNTESTED"
});
var PixisyncDurabilityError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "PixisyncDurabilityError";
    this.code = code;
  }
};
function clone(value) {
  return structuredClone(value);
}
function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function validPositive(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function validNonNegative(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function nowIso(now) {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid durability clock.");
  }
  return now.toISOString();
}
function leaseLive(lease, now) {
  return Date.parse(lease.expiresAt) > now.getTime();
}
function withoutLease(record) {
  const { lease: _lease, ...rest } = record;
  return rest;
}
function emptySnapshot(projectId) {
  return {
    schemaVersion: PIXISYNC_DURABLE_SNAPSHOT_SCHEMA,
    projectId,
    revision: 0,
    confirmedProjectRevision: 0,
    snapshotHash: "",
    vault: {
      draft: [],
      committed: []
    },
    outbox: [],
    inbox: [],
    appliedOperationFingerprints: [],
    retrySchedule: []
  };
}
function snapshotBody(snapshot) {
  const { snapshotHash: _snapshotHash, ...body } = snapshot;
  return body;
}
async function sealSnapshot(snapshot) {
  const body = snapshotBody(snapshot);
  return {
    ...clone(body),
    snapshotHash: await sha256Hex(canonicalJson(body))
  };
}
function assertBoundedSnapshot(snapshot) {
  const serialized = JSON.stringify(snapshot);
  if (serialized.length > 512 * 1024) {
    throw new Error("PiXiSYNC durable snapshot exceeds its JSON bound.");
  }
  const visit = (value, depth) => {
    if (depth > 32) throw new Error("PiXiSYNC durable snapshot is too deep.");
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (normalized.includes("rawbytes") || normalized.includes("blob") || normalized.includes("pointer") || normalized.includes("preview")) {
        throw new Error("PiXiSYNC durable snapshot contains a raw field.");
      }
      visit(child, depth + 1);
    }
  };
  visit(snapshot, 0);
}
function sameLease(left, token) {
  return left !== void 0 && left.token === token;
}
function findByOperationId(snapshot, operationId) {
  const draft = snapshot.vault.draft.find((item) => item.envelope.operationId === operationId);
  if (draft !== void 0) {
    return {
      fingerprint: draft.fingerprint,
      kind: "draft"
    };
  }
  const committed = snapshot.vault.committed.find((item) => item.envelope.operationId === operationId);
  if (committed !== void 0) {
    return {
      fingerprint: committed.fingerprint,
      kind: "committed"
    };
  }
  const outbox = snapshot.outbox.find((item) => item.operationId === operationId);
  if (outbox !== void 0) {
    return {
      fingerprint: outbox.fingerprint,
      kind: "outbox"
    };
  }
  const inbox = snapshot.inbox.find((item) => item.operationId === operationId);
  if (inbox !== void 0) {
    return {
      fingerprint: inbox.fingerprint,
      kind: "inbox"
    };
  }
  return void 0;
}
function validateLease(lease) {
  if (lease === void 0) return;
  if (typeof lease.owner !== "string" || lease.owner.length === 0 || typeof lease.token !== "string" || lease.token.length === 0 || !validDate(lease.acquiredAt) || !validDate(lease.expiresAt) || !validPositive(lease.attempt)) throw new Error("Invalid PiXiSYNC lease in restart snapshot.");
}
async function validatePixisyncDurableSnapshot(snapshot, projectId) {
  if (snapshot === null || typeof snapshot !== "object" || snapshot.schemaVersion !== PIXISYNC_DURABLE_SNAPSHOT_SCHEMA || typeof snapshot.projectId !== "string" || projectId !== void 0 && snapshot.projectId !== projectId || !validNonNegative(snapshot.revision) || !validNonNegative(snapshot.confirmedProjectRevision) || snapshot.confirmedProjectRevision !== snapshot.revision || typeof snapshot.snapshotHash !== "string" || !Array.isArray(snapshot.vault?.draft) || !Array.isArray(snapshot.vault?.committed) || !Array.isArray(snapshot.outbox) || !Array.isArray(snapshot.inbox) || !Array.isArray(snapshot.appliedOperationFingerprints) || !Array.isArray(snapshot.retrySchedule)) throw new Error("PiXiSYNC durable snapshot is malformed.");
  assertBoundedSnapshot(snapshot);
  const expectedSnapshotHash = await sha256Hex(canonicalJson(snapshotBody(snapshot)));
  if (snapshot.snapshotHash !== expectedSnapshotHash) {
    throw new Error("PiXiSYNC durable snapshot hash mismatch.");
  }
  const operationIds = /* @__PURE__ */ new Set();
  for (const item of snapshot.vault.draft) {
    await validatePixisyncDraft(item.envelope);
    if (item.envelope.projectId !== snapshot.projectId) {
      throw new Error("PiXiSYNC draft project mismatch.");
    }
    if (await operationFingerprint(item.envelope) !== item.fingerprint) {
      throw new Error("PiXiSYNC draft fingerprint mismatch.");
    }
    operationIds.add(item.envelope.operationId);
  }
  for (const item of snapshot.vault.committed) {
    await validatePixisyncCommitted(item.envelope);
    if (item.envelope.projectId !== snapshot.projectId) {
      throw new Error("PiXiSYNC committed project mismatch.");
    }
    if (await committedOperationFingerprint(item.envelope) !== item.fingerprint) {
      throw new Error("PiXiSYNC committed fingerprint mismatch.");
    }
    operationIds.add(item.envelope.operationId);
  }
  for (const item of snapshot.outbox) {
    await validatePixisyncDraft(item.envelope);
    if (item.operationId !== item.envelope.operationId || item.projectId !== snapshot.projectId || await operationFingerprint(item.envelope) !== item.fingerprint || ![
      "PENDING",
      "LEASED",
      "DISPATCHED",
      "DLQ"
    ].includes(item.state) || !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)) throw new Error("PiXiSYNC Outbox restart record is malformed.");
    validateLease(item.lease);
    if (item.confirmedRevision !== void 0 && !validPositive(item.confirmedRevision)) {
      throw new Error("PiXiSYNC Outbox confirmed revision is malformed.");
    }
    operationIds.add(item.operationId);
  }
  const revisions = /* @__PURE__ */ new Map();
  for (const item of snapshot.inbox) {
    await validatePixisyncCommitted(item.envelope);
    if (item.operationId !== item.envelope.operationId || item.projectId !== snapshot.projectId || await committedOperationFingerprint(item.envelope) !== item.fingerprint || ![
      "ACCEPTED",
      "LEASED",
      "COMPLETED",
      "RETRYABLE",
      "DLQ",
      "CONFLICT"
    ].includes(item.state) || !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)) throw new Error("PiXiSYNC Inbox restart record is malformed.");
    validateLease(item.lease);
    if (item.receipt !== void 0 && (item.receipt.operationId !== item.operationId || item.receipt.fingerprint !== item.fingerprint || item.receipt.projectRevision !== item.envelope.projectRevision)) throw new Error("PiXiSYNC Inbox apply receipt is malformed.");
    const prior = revisions.get(item.envelope.projectRevision);
    if (prior !== void 0 && prior !== item.operationId && item.state !== "CONFLICT") {
      throw new Error("PiXiSYNC snapshot has two identities at one revision.");
    }
    revisions.set(item.envelope.projectRevision, item.operationId);
    operationIds.add(item.operationId);
  }
  for (const item of snapshot.appliedOperationFingerprints) {
    if (typeof item.operationId !== "string" || typeof item.fingerprint !== "string" || !validPositive(item.projectRevision)) throw new Error("PiXiSYNC applied operation fingerprint is malformed.");
  }
  for (const item of snapshot.retrySchedule) {
    if (typeof item.recordId !== "string" || item.kind !== "outbox" && item.kind !== "inbox" || !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)) throw new Error("PiXiSYNC retry schedule is malformed.");
  }
  if (snapshot.revision < Math.max(0, ...snapshot.vault.committed.map((x) => x.envelope.projectRevision))) {
    throw new Error("PiXiSYNC snapshot revision regressed.");
  }
}
var PixisyncDurableJournal = class _PixisyncDurableJournal {
  capability = PIXISYNC_DURABILITY_CAPABILITY;
  #projectId;
  #persistence;
  #leaseMs;
  #maxAttempts;
  #retryDelayMs;
  #now;
  #faultInjectors;
  #state;
  constructor(projectId, persistence, options, state) {
    this.#projectId = projectId;
    this.#persistence = persistence;
    this.#leaseMs = options.leaseMs ?? 3e4;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryDelayMs = options.retryDelayMs ?? 100;
    this.#now = options.now ?? (() => /* @__PURE__ */ new Date());
    this.#faultInjectors = [
      options.faultInjector,
      options.crashInjector
    ].filter((item) => item !== void 0);
    this.#state = clone(state);
  }
  static async open(projectId, persistence, options = {}) {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("PiXiSYNC journal projectId is required.");
    }
    if (options.leaseMs !== void 0 && (!validPositive(options.leaseMs) || options.leaseMs < 1) || options.maxAttempts !== void 0 && !validPositive(options.maxAttempts) || options.retryDelayMs !== void 0 && !validNonNegative(options.retryDelayMs)) throw new Error("PiXiSYNC durability options are invalid.");
    const loaded = await persistence.load();
    let state = loaded === void 0 ? await sealSnapshot(emptySnapshot(projectId)) : clone(loaded);
    await validatePixisyncDurableSnapshot(state, projectId);
    if (loaded === void 0) {
      try {
        if (persistence.compareAndSwap !== void 0) {
          await persistence.compareAndSwap(clone(state), null);
        } else {
          await persistence.atomicReplace(clone(state));
        }
      } catch (error) {
        if (persistence.compareAndSwap === void 0 || error?.code !== "SNAPSHOT_CONFLICT") throw error;
        const concurrent = await persistence.load();
        if (concurrent === void 0) throw error;
        await validatePixisyncDurableSnapshot(concurrent, projectId);
        state = clone(concurrent);
      }
    }
    const journal = new _PixisyncDurableJournal(projectId, persistence, options, state);
    return journal;
  }
  snapshot() {
    return clone(this.#state);
  }
  async enqueue(draft) {
    await validatePixisyncDraft(draft);
    if (draft.projectId !== this.#projectId) {
      throw new PixisyncError("PROJECT_MISMATCH", "Draft belongs to another project.");
    }
    const fingerprint = await operationFingerprint(draft);
    const existing = findByOperationId(this.#state, draft.operationId);
    if (existing !== void 0) {
      if (existing.fingerprint !== fingerprint) {
        throw new PixisyncDurabilityError("IDEMPOTENCY_CONFLICT", "Operation ID is bound to a different fingerprint.");
      }
      const record2 = this.#state.outbox.find((item) => item.operationId === draft.operationId);
      if (record2 !== void 0) {
        return {
          record: clone(record2),
          duplicate: true
        };
      }
      const committed = this.#state.vault.committed.find((item) => item.envelope.operationId === draft.operationId);
      if (committed !== void 0) {
        const dispatched = {
          operationId: draft.operationId,
          projectId: this.#projectId,
          envelope: clone(draft),
          fingerprint,
          state: "DISPATCHED",
          attempt: 0,
          nextAttemptAt: nowIso(this.#now()),
          confirmedRevision: committed.envelope.projectRevision
        };
        return {
          record: dispatched,
          duplicate: true
        };
      }
    }
    const now = nowIso(this.#now());
    const record = {
      operationId: draft.operationId,
      projectId: this.#projectId,
      envelope: clone(draft),
      fingerprint,
      state: "PENDING",
      attempt: 0,
      nextAttemptAt: now
    };
    const next = {
      ...this.#state,
      vault: {
        draft: [
          ...this.#state.vault.draft,
          {
            envelope: clone(draft),
            fingerprint
          }
        ],
        committed: [
          ...this.#state.vault.committed
        ]
      },
      outbox: [
        ...this.#state.outbox,
        record
      ]
    };
    await this.#commit(next);
    return {
      record: clone(record),
      duplicate: false
    };
  }
  async leaseOutbox(workerId, now = this.#now()) {
    if (workerId.length === 0 || !Number.isFinite(now.getTime())) {
      throw new Error("Invalid Outbox lease request.");
    }
    let next = clone(this.#state);
    let changed = false;
    const reclaimed = next.outbox.map((record) => {
      if (record.state === "LEASED" && record.lease !== void 0 && !leaseLive(record.lease, now)) {
        changed = true;
        if (record.attempt >= this.#maxAttempts) {
          return {
            ...withoutLease(record),
            state: "DLQ"
          };
        }
        return {
          ...withoutLease(record),
          state: "PENDING",
          nextAttemptAt: nowIso(now)
        };
      }
      return record;
    });
    next = {
      ...next,
      outbox: reclaimed
    };
    const candidate = [
      ...reclaimed
    ].filter((record) => record.state === "PENDING" && Date.parse(record.nextAttemptAt) <= now.getTime()).sort((left, right) => left.nextAttemptAt.localeCompare(right.nextAttemptAt))[0];
    if (candidate === void 0) {
      if (changed) await this.#commit(next);
      return void 0;
    }
    if (candidate.attempt >= this.#maxAttempts) {
      const dlq = {
        ...withoutLease(candidate),
        state: "DLQ"
      };
      next = {
        ...next,
        outbox: next.outbox.map((item) => item.operationId === candidate.operationId ? dlq : item)
      };
      await this.#commit(next);
      return void 0;
    }
    const attempt = candidate.attempt + 1;
    const lease = {
      owner: workerId,
      token: `outbox:${candidate.operationId}:${attempt}`,
      acquiredAt: nowIso(now),
      expiresAt: new Date(now.getTime() + this.#leaseMs).toISOString(),
      attempt
    };
    const updated = {
      ...candidate,
      state: "LEASED",
      attempt,
      lease
    };
    next = {
      ...next,
      outbox: next.outbox.map((item) => item.operationId === candidate.operationId ? updated : item)
    };
    await this.#commit(next);
    return {
      ...clone(updated),
      record: clone(updated),
      lease: clone(lease)
    };
  }
  async acknowledgeOutbox(operationId, fencingToken, confirmedRevision) {
    if (!validPositive(confirmedRevision)) {
      throw new Error("Confirmed project revision must be positive.");
    }
    const record = this.#state.outbox.find((item) => item.operationId === operationId);
    if (record === void 0) throw new Error("Outbox record was not found.");
    if (record.state === "DISPATCHED") {
      if (record.lease?.token === fencingToken && record.confirmedRevision === confirmedRevision) {
        return {
          record: clone(record),
          duplicate: true
        };
      }
      throw new PixisyncDurabilityError("LEASE_STALE", "ACK token is stale.");
    }
    if (record.state !== "LEASED" || !sameLease(record.lease, fencingToken) || !leaseLive(record.lease, this.#now())) {
      throw new PixisyncDurabilityError("LEASE_STALE", "Only the current live Outbox lease may acknowledge.");
    }
    const committed = {
      ...clone(record.envelope),
      projectRevision: confirmedRevision,
      committedAt: nowIso(this.#now())
    };
    await validatePixisyncCommitted(committed);
    const committedFingerprint = await committedOperationFingerprint(committed);
    const existingRevision = this.#state.vault.committed.find((item) => item.envelope.projectRevision === confirmedRevision);
    const existingInboxRevision = this.#state.inbox.find((item) => item.envelope.projectRevision === confirmedRevision && item.operationId !== operationId);
    if (existingRevision !== void 0 && existingRevision.envelope.operationId !== operationId || existingInboxRevision !== void 0) {
      throw new PixisyncDurabilityError("REVISION_CONFLICT", "Confirmed revision is bound to another operation.");
    }
    const nextRecord = {
      ...record,
      state: "DISPATCHED",
      confirmedRevision
    };
    const next = {
      ...this.#state,
      revision: Math.max(this.#state.revision, confirmedRevision),
      vault: {
        draft: this.#state.vault.draft.filter((item) => item.envelope.operationId !== operationId),
        committed: existingRevision === void 0 ? [
          ...this.#state.vault.committed,
          {
            envelope: committed,
            fingerprint: committedFingerprint
          }
        ] : [
          ...this.#state.vault.committed
        ]
      },
      outbox: this.#state.outbox.map((item) => item.operationId === operationId ? nextRecord : item)
    };
    await this.#commit(next);
    return {
      record: clone(nextRecord),
      duplicate: false
    };
  }
  async failOutbox(operationId, fencingToken, retryable) {
    const record = this.#state.outbox.find((item) => item.operationId === operationId);
    if (record === void 0) throw new Error("Outbox record was not found.");
    if (record.state !== "LEASED" || !sameLease(record.lease, fencingToken) || !leaseLive(record.lease, this.#now())) {
      throw new PixisyncDurabilityError("LEASE_STALE", "Stale Outbox lease cannot fail.");
    }
    const terminal = !retryable || record.attempt >= this.#maxAttempts;
    const nextRecord = terminal ? {
      ...withoutLease(record),
      state: "DLQ"
    } : {
      ...withoutLease(record),
      state: "PENDING",
      nextAttemptAt: new Date(this.#now().getTime() + this.#retryDelayMs * 2 ** Math.min(record.attempt, 8)).toISOString()
    };
    const next = {
      ...this.#state,
      outbox: this.#state.outbox.map((item) => item.operationId === operationId ? nextRecord : item)
    };
    await this.#commit(next);
    return {
      record: clone(nextRecord),
      duplicate: false
    };
  }
  async pruneConfirmed() {
    const removable = this.#state.outbox.filter((record) => record.state === "DISPATCHED" && record.confirmedRevision !== void 0 && record.confirmedRevision <= this.#state.confirmedProjectRevision);
    if (removable.length === 0) return 0;
    const operationIds = new Set(removable.map((record) => record.operationId));
    await this.#commit({
      ...this.#state,
      outbox: this.#state.outbox.filter((record) => !operationIds.has(record.operationId))
    });
    return removable.length;
  }
  async acceptIncoming(committed, identity) {
    await validatePixisyncCommitted(committed);
    if (committed.projectId !== this.#projectId) {
      throw new PixisyncError("PROJECT_MISMATCH", "Incoming operation belongs to another project.");
    }
    const fingerprint = await committedOperationFingerprint(committed);
    if (identity !== void 0 && (identity.operationId !== committed.operationId || identity.fingerprint !== fingerprint || identity.projectRevision !== committed.projectRevision)) {
      throw new PixisyncDurabilityError("INBOX_CONFLICT", "Incoming provider identity is not bound to the committed operation.");
    }
    const existing = this.#state.inbox.find((item) => item.operationId === committed.operationId);
    if (existing !== void 0) {
      if (existing.fingerprint === fingerprint) {
        return {
          record: clone(existing),
          duplicate: true
        };
      }
      const conflict = {
        ...withoutLease(existing),
        state: "CONFLICT"
      };
      const next2 = {
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === committed.operationId ? conflict : item)
      };
      await this.#commit(next2);
      return {
        record: clone(conflict),
        conflict: true
      };
    }
    const sameRevision = this.#state.inbox.find((item) => item.envelope.projectRevision === committed.projectRevision && item.operationId !== committed.operationId) ?? this.#state.vault.committed.find((item) => item.envelope.projectRevision === committed.projectRevision && item.envelope.operationId !== committed.operationId);
    const record = {
      operationId: committed.operationId,
      projectId: this.#projectId,
      envelope: clone(committed),
      fingerprint,
      state: sameRevision === void 0 ? "ACCEPTED" : "CONFLICT",
      attempt: 0,
      nextAttemptAt: nowIso(this.#now())
    };
    const next = {
      ...this.#state,
      // Inbox acceptance is durable receipt of delivery, not canonical apply.
      revision: this.#state.revision,
      vault: {
        draft: [
          ...this.#state.vault.draft
        ],
        committed: [
          ...this.#state.vault.committed
        ]
      },
      inbox: [
        ...this.#state.inbox,
        record
      ]
    };
    await this.#commit(next);
    return {
      record: clone(record),
      conflict: sameRevision !== void 0,
      duplicate: false
    };
  }
  async leaseInbox(workerId, now = this.#now()) {
    if (workerId.length === 0 || !Number.isFinite(now.getTime())) {
      throw new Error("Invalid Inbox lease request.");
    }
    let next = clone(this.#state);
    let changed = false;
    const reclaimed = next.inbox.map((record) => {
      if (record.state === "LEASED" && record.lease !== void 0 && !leaseLive(record.lease, now)) {
        changed = true;
        if (record.attempt >= this.#maxAttempts) {
          return {
            ...withoutLease(record),
            state: "DLQ"
          };
        }
        return {
          ...withoutLease(record),
          state: "RETRYABLE",
          nextAttemptAt: nowIso(now)
        };
      }
      return record;
    });
    next = {
      ...next,
      inbox: reclaimed
    };
    const candidate = [
      ...reclaimed
    ].filter((record) => (record.state === "ACCEPTED" || record.state === "RETRYABLE") && Date.parse(record.nextAttemptAt) <= now.getTime()).sort((left, right) => left.envelope.projectRevision - right.envelope.projectRevision)[0];
    if (candidate === void 0) {
      if (changed) await this.#commit(next);
      return void 0;
    }
    if (candidate.attempt >= this.#maxAttempts) {
      const dlq = {
        ...withoutLease(candidate),
        state: "DLQ"
      };
      await this.#commit({
        ...next,
        inbox: next.inbox.map((item) => item.operationId === candidate.operationId ? dlq : item)
      });
      return void 0;
    }
    const attempt = candidate.attempt + 1;
    const lease = {
      owner: workerId,
      token: `inbox:${candidate.operationId}:${attempt}`,
      acquiredAt: nowIso(now),
      expiresAt: new Date(now.getTime() + this.#leaseMs).toISOString(),
      attempt
    };
    const updated = {
      ...candidate,
      state: "LEASED",
      attempt,
      lease
    };
    next = {
      ...next,
      inbox: next.inbox.map((item) => item.operationId === candidate.operationId ? updated : item)
    };
    await this.#commit(next);
    return {
      ...clone(updated),
      record: clone(updated),
      lease: clone(lease)
    };
  }
  async applyInbox(operationId, fencingToken, orderKeeper) {
    const record = this.#state.inbox.find((item) => item.operationId === operationId);
    if (record === void 0) throw new Error("Inbox record was not found.");
    if (record.state !== "LEASED" || !sameLease(record.lease, fencingToken) || !leaseLive(record.lease, this.#now())) {
      throw new PixisyncDurabilityError("LEASE_STALE", "Only the current live Inbox lease may apply.");
    }
    if (record.receipt !== void 0) {
      const completed2 = {
        ...withoutLease(record),
        state: "COMPLETED"
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === operationId ? completed2 : item)
      });
      return "recovered";
    }
    let outcome;
    try {
      outcome = await orderKeeper.receive(record.envelope);
    } catch (error) {
      const terminal = record.attempt >= this.#maxAttempts;
      const failed = terminal ? {
        ...withoutLease(record),
        state: "DLQ"
      } : {
        ...withoutLease(record),
        state: "RETRYABLE",
        nextAttemptAt: new Date(this.#now().getTime() + this.#retryDelayMs * 2 ** Math.min(record.attempt, 8)).toISOString()
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === operationId ? failed : item)
      });
      throw error;
    }
    if (outcome === "gap-held") {
      const held = {
        ...withoutLease(record),
        state: "RETRYABLE",
        nextAttemptAt: nowIso(this.#now())
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === operationId ? held : item)
      });
      return outcome;
    }
    const receipt = {
      operationId,
      fingerprint: record.fingerprint,
      projectRevision: record.envelope.projectRevision
    };
    const withReceipt = {
      ...record,
      receipt
    };
    await this.#commit({
      ...withReceiptState(this.#state, withReceipt),
      revision: Math.max(this.#state.revision, record.envelope.projectRevision)
    }, false);
    this.#inject("AFTER_APPLY_BEFORE_ACK");
    const completed = {
      ...withoutLease(withReceipt),
      state: "COMPLETED"
    };
    await this.#commit({
      ...this.#state,
      inbox: this.#state.inbox.map((item) => item.operationId === operationId ? completed : item)
    });
    return outcome;
  }
  #inject(point) {
    for (const injector of this.#faultInjectors) injector(point);
  }
  async #commit(next, injectResponseCrash = true) {
    const staged = await sealSnapshot({
      ...clone(next),
      confirmedProjectRevision: next.revision,
      appliedOperationFingerprints: next.inbox.flatMap((record) => record.receipt === void 0 ? [] : [
        clone(record.receipt)
      ]),
      retrySchedule: [
        ...next.outbox.filter((record) => record.state === "PENDING").map((record) => ({
          recordId: record.operationId,
          kind: "outbox",
          attempt: record.attempt,
          nextAttemptAt: record.nextAttemptAt
        })),
        ...next.inbox.filter((record) => record.state === "RETRYABLE").map((record) => ({
          recordId: record.operationId,
          kind: "inbox",
          attempt: record.attempt,
          nextAttemptAt: record.nextAttemptAt
        }))
      ]
    });
    await validatePixisyncDurableSnapshot(staged, this.#projectId);
    this.#inject("BEFORE_COMMIT");
    this.#inject("AFTER_STAGE_BEFORE_PERSIST");
    if (this.#persistence.compareAndSwap !== void 0) {
      await this.#persistence.compareAndSwap(clone(staged), this.#state.snapshotHash);
    } else {
      await this.#persistence.atomicReplace(clone(staged));
    }
    if (injectResponseCrash) this.#inject("AFTER_PERSIST_BEFORE_RESPONSE");
    this.#state = clone(staged);
  }
};
function withReceiptState(snapshot, record) {
  return {
    ...snapshot,
    inbox: snapshot.inbox.map((item) => item.operationId === record.operationId ? record : item)
  };
}

// src/pixisync/indexeddb-persistence.ts
var PIXISYNC_INDEXEDDB_PERSISTENCE_SCHEMA = "PIXSYNC_DRAW2_INDEXEDDB_SNAPSHOT_V1";
var PIXISYNC_INDEXEDDB_PERSISTENCE_STATUS = Object.freeze({
  schema: PIXISYNC_INDEXEDDB_PERSISTENCE_SCHEMA,
  productionReady: false,
  crossTabConcurrency: "TRANSACTION_CAS",
  crossProcessConcurrency: "UNTESTED",
  atomicReplaceScope: "SINGLE_ADAPTER_INSTANCE_QUEUE",
  compareAndSwapScope: "INDEXEDDB_READWRITE_TRANSACTION"
});
var PixisyncIndexedDbPersistenceError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "PixisyncIndexedDbPersistenceError";
    this.code = code;
  }
};
var DB_VERSION = 1;
var STORE_NAME = "snapshots";
function clone2(value) {
  if (typeof structuredClone !== "function") {
    throw new PixisyncIndexedDbPersistenceError("INDEXEDDB_UNAVAILABLE", "structuredClone is required by the IndexedDB persistence boundary.");
  }
  return structuredClone(value);
}
function errorMessage(error, fallback) {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}
function asError(error, code, fallback) {
  if (error instanceof PixisyncIndexedDbPersistenceError) return error;
  return new PixisyncIndexedDbPersistenceError(code, errorMessage(error, fallback), {
    cause: error
  });
}
function resolveFactory(injected) {
  if (injected !== void 0) return injected;
  const candidate = globalThis.indexedDB;
  if (candidate === void 0) {
    throw new PixisyncIndexedDbPersistenceError("INDEXEDDB_UNAVAILABLE", "IndexedDB is unavailable; inject an IDBFactory in this host.");
  }
  return candidate;
}
function openDatabase(factory, dbName) {
  return new Promise((resolve, reject2) => {
    let request;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject2(asError(error, "OPEN_FAILED", "IndexedDB open failed."));
    };
    try {
      request = factory.open(dbName, DB_VERSION);
      request.onerror = () => rejectOnce(request.error);
      request.onblocked = () => rejectOnce(new PixisyncIndexedDbPersistenceError("OPEN_FAILED", "IndexedDB open was blocked by another connection."));
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          const upgrade = request.transaction;
          if (upgrade !== null) {
            upgrade.onabort = () => rejectOnce(new PixisyncIndexedDbPersistenceError("UPGRADE_FAILED", "IndexedDB schema upgrade was aborted."));
            upgrade.onerror = () => rejectOnce(asError(upgrade.error, "UPGRADE_FAILED", "IndexedDB schema upgrade failed."));
          }
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, {
              keyPath: "projectId"
            });
          }
        } catch (error) {
          try {
            request.transaction?.abort();
          } catch {
          }
          rejectOnce(asError(error, "UPGRADE_FAILED", "IndexedDB schema upgrade failed."));
        }
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.close();
          rejectOnce(new PixisyncIndexedDbPersistenceError("STORE_MISSING", "IndexedDB snapshot object store is missing."));
          return;
        }
        request.result.onversionchange = () => request.result.close();
        settled = true;
        resolve(request.result);
      };
    } catch (error) {
      rejectOnce(asError(error, "OPEN_FAILED", "IndexedDB open failed."));
    }
  });
}
function withDatabase(factory, dbName, operation) {
  return openDatabase(factory, dbName).then(async (db) => {
    try {
      return await operation(db);
    } finally {
      db.close();
    }
  });
}
function transactionError(transaction, aborted) {
  return asError(transaction.error, aborted ? "TRANSACTION_ABORTED" : "TRANSACTION_FAILED", aborted ? "IndexedDB transaction was aborted." : "IndexedDB transaction failed.");
}
function readRecord(db, projectId) {
  return new Promise((resolve, reject2) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(projectId);
      let record;
      let requestFinished = false;
      let settled = false;
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject2(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      request.onsuccess = () => {
        requestFinished = true;
        record = request.result;
      };
      transaction.onerror = () => rejectOnce(transactionError(transaction, false));
      transaction.onabort = () => rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestFinished) {
          rejectOnce(new Error("IndexedDB read completed without a request result."));
          return;
        }
        settled = true;
        resolve(record);
      };
    } catch (error) {
      reject2(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
    }
  });
}
function writeRecord(db, record) {
  return new Promise((resolve, reject2) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put(clone2(record));
      let settled = false;
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject2(asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      transaction.onerror = () => rejectOnce(transactionError(transaction, false));
      transaction.onabort = () => rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      reject2(asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."));
    }
  });
}
function compareAndSwapRecord(db, projectId, snapshot, expectedSnapshotHash) {
  return new Promise((resolve, reject2) => {
    let transaction;
    let conflict;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject2(asError(error, "TRANSACTION_FAILED", "IndexedDB CAS failed."));
    };
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const read = store.get(projectId);
      read.onerror = () => rejectOnce(read.error);
      read.onsuccess = () => {
        try {
          const current = normalizeRecord(read.result, projectId);
          if ((current?.snapshotHash ?? null) !== expectedSnapshotHash) {
            conflict = new PixisyncIndexedDbPersistenceError("SNAPSHOT_CONFLICT", "PiXYNC IndexedDB snapshot changed in another writer.");
            transaction.abort();
            return;
          }
          const write = store.put({
            projectId,
            snapshot: clone2(snapshot)
          });
          write.onerror = () => rejectOnce(write.error);
        } catch (error) {
          if (error instanceof PixisyncIndexedDbPersistenceError && error.code === "SNAPSHOT_CONFLICT") conflict = error;
          try {
            transaction.abort();
          } catch {
            rejectOnce(error);
          }
        }
      };
      transaction.onerror = () => {
        if (conflict === void 0) {
          rejectOnce(transactionError(transaction, false));
        }
      };
      transaction.onabort = () => rejectOnce(conflict ?? transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      rejectOnce(error);
    }
  });
}
function normalizeRecord(record, projectId) {
  if (record === void 0) return void 0;
  if (record === null || typeof record !== "object" || record.projectId !== projectId || !("snapshot" in record)) {
    throw new PixisyncIndexedDbPersistenceError("RECORD_MALFORMED", "IndexedDB snapshot record is malformed or belongs to another project.");
  }
  return clone2(record.snapshot);
}
var PixisyncIndexedDbSnapshotPersistence = class {
  projectId;
  dbName;
  #factory;
  #operationTail = Promise.resolve();
  constructor(projectId, options = {}) {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new PixisyncIndexedDbPersistenceError("PROJECT_MISMATCH", "IndexedDB persistence projectId is required.");
    }
    this.projectId = projectId;
    this.dbName = options.dbName ?? "pixisync-draw2";
    if (this.dbName.length === 0) {
      throw new PixisyncIndexedDbPersistenceError("OPEN_FAILED", "IndexedDB database name is required.");
    }
    this.#factory = resolveFactory(options.indexedDB);
  }
  load() {
    return this.#enqueue(async () => {
      const record = await withDatabase(this.#factory, this.dbName, (db) => readRecord(db, this.projectId));
      return normalizeRecord(record, this.projectId);
    });
  }
  atomicReplace(snapshot) {
    return this.#enqueue(async () => {
      if (snapshot.projectId !== this.projectId) {
        throw new PixisyncIndexedDbPersistenceError("PROJECT_MISMATCH", "IndexedDB snapshot belongs to another project.");
      }
      const record = {
        projectId: this.projectId,
        snapshot: clone2(snapshot)
      };
      await withDatabase(this.#factory, this.dbName, (db) => writeRecord(db, record));
    });
  }
  compareAndSwap(snapshot, expectedSnapshotHash) {
    return this.#enqueue(async () => {
      if (snapshot.projectId !== this.projectId) {
        throw new PixisyncIndexedDbPersistenceError("PROJECT_MISMATCH", "IndexedDB snapshot belongs to another project.");
      }
      if (expectedSnapshotHash !== null && (typeof expectedSnapshotHash !== "string" || expectedSnapshotHash.length === 0)) {
        throw new PixisyncIndexedDbPersistenceError("RECORD_MALFORMED", "IndexedDB expected snapshot hash is invalid.");
      }
      await withDatabase(this.#factory, this.dbName, (db) => compareAndSwapRecord(db, this.projectId, clone2(snapshot), expectedSnapshotHash));
    });
  }
  #enqueue(operation) {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(() => void 0, () => void 0);
    return result;
  }
};
function createPixisyncIndexedDbPersistence(projectId, options = {}) {
  return new PixisyncIndexedDbSnapshotPersistence(projectId, options);
}

// tests/pixisync/pixisync-draw2-180-browser-entry.ts
var PIXISYNC_DRAW2_180_DB_PREFIX = "pixisync-draw2-180-qualification-";
var PIXISYNC_DRAW2_180_DB_NAME = `${PIXISYNC_DRAW2_180_DB_PREFIX}v1`;
var PIXISYNC_DRAW2_180_PROJECT_PREFIX = "pixisync-draw2-180-";
var PIXISYNC_DRAW2_180_API_KEY = "__pixisyncDraw2CrossTabCas";
var journals = /* @__PURE__ */ new Map();
var nextJournalId = 0;
var nextOperationId = 0;
function requireProjectId(value) {
  if (typeof value !== "string" || !new RegExp(`^${PIXISYNC_DRAW2_180_PROJECT_PREFIX}[A-Za-z0-9._:/-]{1,96}$`, "u").test(value)) {
    throw new TypeError(`PiXYNC Draw2 180 qualification projectId must use ${PIXISYNC_DRAW2_180_PROJECT_PREFIX}.`);
  }
}
function requireJournalId(value) {
  if (typeof value !== "string" || !journals.has(value)) {
    throw new Error("PiXYNC Draw2 180 qualification journalId is unknown.");
  }
}
function requireOperationId(value) {
  if (value === void 0) {
    nextOperationId += 1;
    return `pixisync-draw2-180-op-${nextOperationId}`;
  }
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) {
    throw new TypeError("PiXYNC Draw2 180 qualification operationId is invalid.");
  }
  return value;
}
function snapshotErrorMessage(error) {
  return error instanceof Error && error.message.length > 0 ? error.message : "PiXYNC Draw2 180 qualification operation failed.";
}
function snapshotErrorCode(error) {
  const candidate = error;
  return typeof candidate?.code === "string" ? candidate.code : "ENQUEUE_FAILED";
}
function requireIndexedDb() {
  const candidate = globalThis.indexedDB;
  if (candidate === void 0) {
    throw new Error("PiXYNC Draw2 180 qualification requires IndexedDB.");
  }
  return candidate;
}
function deleteDedicatedTestDatabase() {
  const factory = requireIndexedDb();
  return new Promise((resolve, reject2) => {
    const request = factory.deleteDatabase(PIXISYNC_DRAW2_180_DB_NAME);
    request.onerror = () => reject2(request.error ?? new Error("Qualification database deletion failed."));
    request.onblocked = () => reject2(new Error("Qualification database deletion was blocked."));
    request.onsuccess = () => resolve();
  });
}
function persistentSnapshot(projectId) {
  return createPixisyncIndexedDbPersistence(projectId, {
    dbName: PIXISYNC_DRAW2_180_DB_NAME
  }).load();
}
async function resetTestDb() {
  journals.clear();
  await deleteDedicatedTestDatabase();
  return {
    dbName: PIXISYNC_DRAW2_180_DB_NAME,
    deleted: true
  };
}
async function openJournal(projectId) {
  requireProjectId(projectId);
  const persistence = createPixisyncIndexedDbPersistence(projectId, {
    dbName: PIXISYNC_DRAW2_180_DB_NAME
  });
  const journal = await PixisyncDurableJournal.open(projectId, persistence);
  nextJournalId += 1;
  const journalId = `pixisync-draw2-180-journal-${nextJournalId}`;
  journals.set(journalId, {
    projectId,
    journal
  });
  return {
    journalId,
    projectId,
    snapshot: journal.snapshot()
  };
}
async function getCurrentSnapshot(journalId) {
  requireJournalId(journalId);
  return journals.get(journalId).journal.snapshot();
}
async function enqueueFromBase(input) {
  requireJournalId(input?.journalId);
  const handle = journals.get(input.journalId);
  const operationId = requireOperationId(input.operationId);
  const current = handle.journal.snapshot();
  if (current.snapshotHash !== input.baseSnapshotHash) {
    const persisted = await persistentSnapshot(handle.projectId);
    return {
      ok: false,
      code: "SNAPSHOT_CONFLICT",
      journalId: input.journalId,
      operationId,
      journalSnapshot: current,
      persistentSnapshot: persisted ?? null,
      errorMessage: "The journal is no longer at the requested base snapshot."
    };
  }
  const payload = {
    command: "pixisync-draw2-180-qualification-enqueue",
    operationId
  };
  const draft = await createPixisyncDraft({
    operationId,
    projectId: handle.projectId,
    aggregate: "draw",
    actorId: "pixisync-draw2-180-qualification",
    clientId: `pixisync-draw2-180-client-${input.journalId}`,
    clientSequence: 1,
    baseProjectRevision: current.revision,
    aggregateRevision: 0,
    payload
  });
  try {
    await handle.journal.enqueue(draft);
    return {
      ok: true,
      code: "ENQUEUED",
      journalId: input.journalId,
      operationId,
      journalSnapshot: handle.journal.snapshot()
    };
  } catch (error) {
    const persisted = await persistentSnapshot(handle.projectId);
    return {
      ok: false,
      code: snapshotErrorCode(error),
      journalId: input.journalId,
      operationId,
      journalSnapshot: handle.journal.snapshot(),
      persistentSnapshot: persisted ?? null,
      errorMessage: snapshotErrorMessage(error)
    };
  }
}
async function readPersistentSnapshot(projectId) {
  requireProjectId(projectId);
  return await persistentSnapshot(projectId) ?? null;
}
var api = Object.freeze({
  resetTestDb,
  openJournal,
  getCurrentSnapshot,
  enqueueFromBase,
  readPersistentSnapshot
});
var qualificationDocument = globalThis.document;
var qualificationBridge = qualificationDocument?.getElementById("bridge");
var qualificationCommand = qualificationDocument?.getElementById("command");
var qualificationResult = qualificationDocument?.getElementById("result");
qualificationBridge?.addEventListener("click", () => {
  if (qualificationCommand === void 0 || qualificationCommand === null) {
    return;
  }
  if (qualificationResult === void 0 || qualificationResult === null) {
    return;
  }
  qualificationResult.textContent = "";
  void (async () => {
    try {
      const command = JSON.parse(qualificationCommand.value || "{}");
      let value;
      switch (command.method) {
        case "resetTestDb":
          value = await api.resetTestDb();
          break;
        case "openJournal":
          value = await api.openJournal(command.args);
          break;
        case "getCurrentSnapshot":
          value = await api.getCurrentSnapshot(command.args);
          break;
        case "enqueueFromBase":
          value = await api.enqueueFromBase(command.args);
          break;
        case "readPersistentSnapshot":
          value = await api.readPersistentSnapshot(command.args);
          break;
        default:
          throw new Error("Unknown qualification bridge method.");
      }
      qualificationResult.textContent = JSON.stringify({
        ok: true,
        value
      });
    } catch (error) {
      qualificationResult.textContent = JSON.stringify({
        ok: false,
        code: snapshotErrorCode(error),
        error: snapshotErrorMessage(error)
      });
    }
  })();
});
Object.defineProperty(globalThis, PIXISYNC_DRAW2_180_API_KEY, {
  configurable: false,
  enumerable: false,
  value: api,
  writable: false
});
var loadState = globalThis.__pixisyncDraw2CrossTabCasLoad;
if (loadState !== void 0) {
  loadState.state = "READY";
  loadState.error = null;
}
