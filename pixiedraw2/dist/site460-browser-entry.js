// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var SHA256 = /^[a-f0-9]{64}$/;
function asSha256(value, label = "Hash") {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}
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
async function hashCanonical(value) {
  return asSha256(await sha256Hex(canonicalJson(value)), "ContentHash");
}

// src/platform/platform-450/composition.ts
var PLATFORM450_PROVIDER_IDENTITY = "server";
var PLATFORM450_CAPABILITIES = Object.freeze({
  PUBLIC_WORK_SOCIAL: "public.social.read",
  MARKET_PURCHASE_CHAIN: "market.synthetic.purchase",
  DIRECT_WORK_CHAIN: "work.direct.compose",
  TOOL_ASSET_RUNTIME: "tool.asset.runtime",
  OPS_PROJECTION: "ops.projection.read"
});
var PLATFORM450_FLOWS = Object.freeze(Object.keys(PLATFORM450_CAPABILITIES));
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SAFE_HASH = /^[a-f0-9]{64}$/;
var COMMAND_KEYS = /* @__PURE__ */ new Set([
  "commandId",
  "flow",
  "resourceReference",
  "requestedAction"
]);
var AUTHORITY_KEYS = /* @__PURE__ */ new Set([
  "principalId",
  "tenantId",
  "resourceId",
  "action",
  "capability",
  "policyVersion",
  "currentRevision",
  "providerIdentity"
]);
var STATE_KEYS = /* @__PURE__ */ new Set([
  "revision",
  "dependencyManifest",
  "canonicalFlowState"
]);
var SENSITIVE_KEY = /jwt|token|secret|email|private|commission|\bdm\b|payment|purchase|entitlement|license|royalty|ledger|raw|pixel|audio|build/i;
var SENSITIVE_REFERENCE = /eyJ[A-Za-z0-9_-]{12,}|[^\s@]+@[^\s@]+\.[^\s@]+|private|commission|\bdm\b|payment-detail|raw[-_ ]?(pixel|audio|build)/i;
var PLATFORM450_DEPENDENCY_MANIFEST = Object.freeze([
  {
    packageId: "SITE-400",
    contractPaths: [
      "docs/contracts/SITE-400-SERVER-AUTHORIZED-REGISTRY-PROVIDER.md"
    ],
    evidencePaths: [
      "docs/inventory/site-400-evidence.json"
    ],
    contractSha256: [
      "6f1ddde05fb1aae7aaf1ad0052b5edd8939d6fde9436689c2d638084243040ed"
    ],
    evidenceSha256: [
      "9c1b063c982d00f25406253d9389828992d5ce448a3519872ae19df450b857c5"
    ]
  },
  {
    packageId: "MARKET-410",
    contractPaths: [
      "docs/contracts/MARKET-410-COMPOSITION.md"
    ],
    evidencePaths: [
      "docs/inventory/market-410-evidence.json"
    ],
    contractSha256: [
      "a2ad5e592d6db946175abda06fa9e00cd063210f4670977cd99dc66bbcbbcda8"
    ],
    evidenceSha256: [
      "ab41130b1033c82420eeb14ee9a56e505f4bca4908543d6a2b19fa73f3019fc1"
    ]
  },
  {
    packageId: "WORK-420",
    contractPaths: [
      "docs/contracts/WORK-420-COMPOSITION.md"
    ],
    evidencePaths: [
      "docs/inventory/work-420-evidence.json"
    ],
    contractSha256: [
      "cc80723204f2f2d468749522384fcf16849bc96c8af1e4fea306313b2c85fb5f"
    ],
    evidenceSha256: [
      "cf7f20a6e29fa638187f0bd5bbecc64ae107200e835af2a83a0113d0e3c1e563"
    ]
  },
  {
    packageId: "SOCIAL-430",
    contractPaths: [
      "docs/contracts/SOCIAL-430-CONTENT-BOUNDARY.md",
      "docs/contracts/SOCIAL-430-EVIDENCE.md",
      "docs/contracts/SOCIAL-430-STOP.md"
    ],
    evidencePaths: [
      "docs/inventory/social-430-evidence.json"
    ],
    contractSha256: [
      "0e57a90e760239656f753a8905e4f0213c8b422e1306fe0f4ba0875c188d88cc",
      "15c589481fcf6f2fb6623aebfbab60c059a401d591aba17cc5a33d04ad6874d5",
      "84046e9ebced91581e3aa5e374bfa1936ec6cea6b9b24dc004659e339db21e5d"
    ],
    evidenceSha256: [
      "0340e96ea93ca63efd0ff02271262da0c1d95fb279e7c14369a8ce7f9aa13a9d"
    ]
  },
  {
    packageId: "OPS-440",
    contractPaths: [
      "docs/contracts/OPS-440-COMPOSITION.md"
    ],
    evidencePaths: [
      "docs/inventory/ops-440-evidence.json"
    ],
    contractSha256: [
      "acb70e06e92eddaedc75c5d04de824b3bdf86de8cbdbf2bc3d36588530bdc076"
    ],
    evidenceSha256: [
      "60721731dcc25dd1525c61430c06abe7ea236743fa11dae6be1627db3c844e52"
    ]
  }
]);
function stable(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (seen.has(value)) return "[cycle]";
  seen.add(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable(item, seen)).join(",")}]`;
  }
  const record = value;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key], seen)}`).join(",")}}`;
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOnlyKeys(value, allowed) {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.has(key));
}
function privacyDiagnostic(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  let count = 0;
  const visit = (current, depth) => {
    if (++count > 512 || depth > 32) return "PLATFORM450_PRIVACY_SCAN_LIMIT";
    if (current === null || typeof current !== "object") {
      return typeof current === "string" && SENSITIVE_REFERENCE.test(current) ? "PLATFORM450_PRIVATE_INPUT_REJECTED" : null;
    }
    if (seen.has(current)) return "PLATFORM450_PRIVACY_CYCLE_REJECTED";
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        const result = visit(item, depth + 1);
        if (result) return result;
      }
      return null;
    }
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key !== "string") return "PLATFORM450_UNKNOWN_FIELD_REJECTED";
      if (SENSITIVE_KEY.test(key)) return "PLATFORM450_PRIVATE_FIELD_REJECTED";
      const result = visit(current[key], depth + 1);
      if (result) return result;
    }
    return null;
  };
  return visit(value, 0);
}
function validId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}
function validHash(value) {
  return typeof value === "string" && SAFE_HASH.test(value);
}
function validateCommand(input) {
  if (!isRecord(input) || !hasOnlyKeys(input, COMMAND_KEYS)) {
    return {
      ok: false,
      diagnostic: "PLATFORM450_COMMAND_SCHEMA_REJECTED"
    };
  }
  if (typeof input.commandId !== "string" || typeof input.flow !== "string" || typeof input.resourceReference !== "string" || typeof input.requestedAction !== "string" || !PLATFORM450_FLOWS.includes(input.flow) || !validId(input.commandId) || !validId(input.resourceReference) || !validId(input.requestedAction)) {
    return {
      ok: false,
      diagnostic: "PLATFORM450_COMMAND_VALUE_REJECTED"
    };
  }
  const privacy = privacyDiagnostic(input);
  if (privacy) return {
    ok: false,
    diagnostic: privacy
  };
  return {
    ok: true,
    command: input
  };
}
var FLOW_DEFINITIONS = {
  PUBLIC_WORK_SOCIAL: {
    references: (r) => [
      `search:${r}`,
      `notification:${r}`
    ],
    invariants: [
      "PUBLIC_ONLY",
      "MODERATION_REQUIRED",
      "BOUNDED_SEARCH_REFERENCES",
      "BOUNDED_NOTIFICATION_REFERENCES"
    ],
    overrides: {
      publicOnly: true,
      moderationRequired: true,
      boundedSearch: true,
      boundedNotification: true
    }
  },
  MARKET_PURCHASE_CHAIN: {
    references: (r) => [
      `product:${r}`,
      `package:${r}`,
      `purchase:${r}`,
      `entitlement:${r}`,
      `license:${r}`,
      `ledger:${r}`
    ],
    invariants: [
      "SYNTHETIC_CHAIN",
      "PAYMENT_MUTATION_FALSE",
      "RIGHTS_MUTATION_FALSE",
      "PROVIDER_WRITE_FALSE"
    ],
    overrides: {
      synthetic: true
    }
  },
  DIRECT_WORK_CHAIN: {
    references: (r) => [
      `request:${r}`,
      `quote:${r}`,
      `agreement:${r}`,
      `delivery:${r}`
    ],
    invariants: [
      "SOCIAL_SEPARATE",
      "MARKET_SEPARATE",
      "PAYMENT_MUTATION_FALSE",
      "RIGHTS_MUTATION_FALSE"
    ],
    overrides: {
      socialSeparated: true,
      marketSeparated: true
    }
  },
  TOOL_ASSET_RUNTIME: {
    references: (r) => [
      `asset:${r}`,
      `package:${r}`,
      `revision:${r}`
    ],
    invariants: [
      "ASSET_REFERENCE_EXACT",
      "PACKAGE_REFERENCE_EXACT",
      "REVISION_REFERENCE_EXACT",
      "RAW_PAYLOAD_FALSE"
    ],
    extra: (r) => ({
      assetReference: r,
      packageReference: `package:${r}`,
      revisionReference: `revision:${r}`
    })
  },
  OPS_PROJECTION: {
    references: (r) => [
      `ops:${r}`
    ],
    invariants: [
      "PRIVATE_ADS_FALSE",
      "SDK_ACCESS_FALSE",
      "ANALYTICS_ALLOWLISTED_SCALARS",
      "REVENUE_SHADOW_ONLY"
    ],
    overrides: {
      analyticsScalars: [
        "flow",
        "stage",
        "status",
        "revision"
      ],
      revenueMode: "SHADOW_ONLY"
    }
  }
};
function canonicalFlowState(flow, resourceReference) {
  const definition = FLOW_DEFINITIONS[flow];
  return {
    flow,
    resourceReference,
    references: definition.references(resourceReference),
    invariants: definition.invariants,
    publicOnly: false,
    moderationRequired: false,
    boundedSearch: false,
    boundedNotification: false,
    synthetic: false,
    socialSeparated: false,
    marketSeparated: false,
    paymentMutation: false,
    rightsMutation: false,
    privateAds: false,
    sdkAccess: false,
    analyticsScalars: [
      "flow",
      "stage",
      "status"
    ],
    revenueMode: "NONE",
    ...definition.overrides,
    ...definition.extra?.(resourceReference) ?? {}
  };
}
function createPlatform450PackageState(revision, flow, resourceReference) {
  return {
    revision,
    dependencyManifest: PLATFORM450_DEPENDENCY_MANIFEST,
    canonicalFlowState: canonicalFlowState(flow, resourceReference)
  };
}
function manifestMatches(value) {
  if (!Array.isArray(value) || value.length !== PLATFORM450_DEPENDENCY_MANIFEST.length) {
    return false;
  }
  return value.every((entry, index) => {
    const expected = PLATFORM450_DEPENDENCY_MANIFEST[index];
    if (!isRecord(entry) || expected === void 0) return false;
    if (!hasOnlyKeys(entry, /* @__PURE__ */ new Set([
      "packageId",
      "contractPaths",
      "evidencePaths",
      "contractSha256",
      "evidenceSha256"
    ]))) return false;
    return stable(entry) === stable(expected) && Array.isArray(entry.contractPaths) && Array.isArray(entry.evidencePaths) && Array.isArray(entry.contractSha256) && Array.isArray(entry.evidenceSha256) && entry.contractPaths.every((path) => typeof path === "string") && entry.evidencePaths.every((path) => typeof path === "string") && entry.contractSha256.every(validHash) && entry.evidenceSha256.every(validHash);
  });
}
function authorityMatches(authority, command) {
  if (!isRecord(authority) || !hasOnlyKeys(authority, AUTHORITY_KEYS)) {
    return false;
  }
  if (![
    authority.principalId,
    authority.tenantId,
    authority.resourceId,
    authority.action,
    authority.capability,
    authority.policyVersion,
    authority.currentRevision,
    authority.providerIdentity
  ].every(validId)) return false;
  return authority.resourceId === command.resourceReference && authority.action === command.requestedAction && authority.capability === PLATFORM450_CAPABILITIES[command.flow] && authority.providerIdentity === PLATFORM450_PROVIDER_IDENTITY;
}
function stateMatches(state, command, authority) {
  if (!isRecord(state) || !hasOnlyKeys(state, STATE_KEYS)) return false;
  if (!validId(state.revision) || state.revision !== authority.currentRevision) {
    return false;
  }
  if (!manifestMatches(state.dependencyManifest)) return false;
  const expected = canonicalFlowState(command.flow, command.resourceReference);
  return stable(state.canonicalFlowState) === stable(expected);
}
function resultBase(commandId, fingerprint, status, diagnostics) {
  return {
    commandId,
    fingerprint,
    stage: "VALIDATED",
    status,
    commit: "NOT_COMMITTED",
    eventRecorded: false,
    outboxReady: false,
    inboxApplied: false,
    projection: "NOT_ATTEMPTED",
    diagnostics
  };
}
function consumerResult(input, status, sideEffects, retryCount, diagnostic) {
  return {
    consumerId: input.consumerId,
    eventId: input.eventId,
    status,
    sideEffects,
    retryCount,
    diagnostics: [
      diagnostic
    ]
  };
}
function cloneConsumerShadow(value) {
  return {
    ...value
  };
}
function createPlatform450Composition(options) {
  if (!options || typeof options.authorityResolver !== "function" || typeof options.packageStateResolver !== "function" || !options.consumerAdapter || typeof options.consumerAdapter.apply !== "function" || !options.flags || typeof options.killSwitch !== "boolean" || options.now !== void 0 && typeof options.now !== "function") {
    throw new Error("PLATFORM450_COMPOSITION_OPTIONS_REQUIRED");
  }
  const entries = /* @__PURE__ */ new Map();
  const events = /* @__PURE__ */ new Map();
  const snapshots = /* @__PURE__ */ new Map();
  const consumerShadow = /* @__PURE__ */ new Map();
  const aggregateSequences = /* @__PURE__ */ new Map();
  const projectionShadow = /* @__PURE__ */ new Set();
  const activeFlags = new Map(Object.entries(options.flags));
  const now = options.now ?? (() => Date.now());
  const acceptedIdentityCount = () => [
    ...entries.values()
  ].reduce((count, entry) => count + 2 + (entry.inboxId ? 1 : 0), 0);
  const flagFor = (flow) => activeFlags.get(flow) ?? activeFlags.get("platform-450") ?? activeFlags.get("PLATFORM450") ?? "UNKNOWN";
  const sourceHash = async (state) => hashCanonical({
    revision: state.revision,
    dependencyManifest: state.dependencyManifest
  });
  const consume = async (input) => {
    const entry = events.get(input.eventId);
    if (!entry || !validId(input.consumerId) || !validId(input.aggregateReference) || !validHash(input.fingerprint) || input.providerIdentity !== PLATFORM450_PROVIDER_IDENTITY || entry.event.aggregateReference !== input.aggregateReference || entry.event.fingerprint !== input.fingerprint || entry.event.providerIdentity !== input.providerIdentity || entry.event.sequence !== input.sequence) {
      return consumerResult(input, "REJECTED", 0, 0, "PLATFORM450_EVENT_IDENTITY_REJECTED");
    }
    const key = `${input.consumerId}\0${input.aggregateReference}`;
    const previous = consumerShadow.get(key);
    const head = previous?.headSequence ?? 0;
    const retryCount = input.retry ?? previous?.retryCount ?? 0;
    const storeShadow = (headSequence, nextRetry, dlq, event) => {
      const lastEventId = event?.eventId ?? previous?.lastEventId;
      const lastFingerprint = event?.fingerprint ?? previous?.lastFingerprint;
      consumerShadow.set(key, {
        consumerId: input.consumerId,
        aggregateReference: input.aggregateReference,
        headSequence,
        ...lastEventId === void 0 ? {} : {
          lastEventId
        },
        ...lastFingerprint === void 0 ? {} : {
          lastFingerprint
        },
        retryCount: nextRetry,
        dlq
      });
    };
    if (previous?.dlq) {
      return consumerResult(input, "DLQ", 0, retryCount, "PLATFORM450_CONSUMER_DLQ");
    }
    if (input.sequence < head) {
      return consumerResult(input, "STALE", 0, retryCount, "PLATFORM450_STALE_EVENT");
    }
    if (input.sequence === head) {
      return consumerResult(input, "DUPLICATE", 0, retryCount, "PLATFORM450_DUPLICATE_EVENT");
    }
    if (input.sequence > head + 1) {
      return consumerResult(input, "PENDING_GAP", 0, retryCount, "PLATFORM450_EVENT_GAP");
    }
    if (retryCount > 3) {
      storeShadow(head, retryCount, true);
      return consumerResult(input, "DLQ", 0, retryCount, "PLATFORM450_RETRY_LIMIT");
    }
    let applied;
    try {
      const candidate = await options.consumerAdapter.apply({
        consumerId: input.consumerId,
        event: entry.event,
        replay: input.replay === true
      });
      applied = isRecord(candidate) && typeof candidate.ok === "boolean" && typeof candidate.sideEffects === "number" ? {
        ok: candidate.ok,
        sideEffects: candidate.sideEffects
      } : {
        ok: false,
        sideEffects: Number.NaN
      };
    } catch {
      applied = {
        ok: false,
        sideEffects: 0
      };
    }
    if (input.replay === true && applied.sideEffects !== 0) {
      return consumerResult(input, "REJECTED", 0, retryCount, "PLATFORM450_REPLAY_SIDE_EFFECT_REJECTED");
    }
    if (!applied.ok || !Number.isFinite(applied.sideEffects) || applied.sideEffects < 0) {
      const nextRetry = retryCount + 1;
      storeShadow(head, nextRetry, false);
      return consumerResult(input, "RETRY", 0, nextRetry, "PLATFORM450_PROJECTION_RETRY");
    }
    storeShadow(input.sequence, 0, false, entry.event);
    projectionShadow.add(entry.outboxId);
    entry.inboxId = `inbox:${input.consumerId}:${input.eventId}`;
    return consumerResult(input, "APPLIED", applied.sideEffects, 0, "PLATFORM450_CONSUMER_APPLIED");
  };
  const execute = async (input) => {
    const validation = validateCommand(input);
    if (!validation.ok) {
      return resultBase("invalid", "invalid", "REJECTED", [
        validation.diagnostic
      ]);
    }
    const command = validation.command;
    const fingerprint = await hashCanonical(command);
    const existing = entries.get(command.commandId);
    if (existing) {
      if (existing.fingerprint === fingerprint) {
        return {
          ...existing.result,
          status: "IDEMPOTENT"
        };
      }
      return {
        ...resultBase(command.commandId, fingerprint, "CONFLICT", [
          "PLATFORM450_COMMAND_ID_CONFLICT"
        ]),
        commit: "NOT_COMMITTED"
      };
    }
    if (options.killSwitch) {
      return resultBase(command.commandId, fingerprint, "REJECTED", [
        "PLATFORM450_KILL_SWITCH_ACTIVE"
      ]);
    }
    const flag = flagFor(command.flow);
    if (flag !== "ON") {
      return resultBase(command.commandId, fingerprint, "REJECTED", [
        flag === "UNKNOWN" ? "PLATFORM450_FLAG_UNKNOWN" : "PLATFORM450_FLAG_OFF"
      ]);
    }
    let authority;
    let state;
    try {
      authority = await options.authorityResolver(command);
      if (!authorityMatches(authority, command)) {
        return resultBase(command.commandId, fingerprint, "REJECTED", [
          "PLATFORM450_AUTHORITY_MISMATCH"
        ]);
      }
      state = await options.packageStateResolver({
        flow: command.flow,
        resourceReference: command.resourceReference
      });
      if (!stateMatches(state, command, authority)) {
        return resultBase(command.commandId, fingerprint, "REJECTED", [
          "PLATFORM450_DEPENDENCY_OR_STATE_MISMATCH"
        ]);
      }
    } catch {
      return resultBase(command.commandId, fingerprint, "REJECTED", [
        "PLATFORM450_AUTHORITY_OR_DEPENDENCY_UNAVAILABLE"
      ]);
    }
    const sequence = (aggregateSequences.get(command.resourceReference) ?? 0) + 1;
    aggregateSequences.set(command.resourceReference, sequence);
    const event = {
      eventId: `event:${command.commandId}:${fingerprint}`,
      commandId: command.commandId,
      aggregateReference: command.resourceReference,
      fingerprint,
      providerIdentity: authority.providerIdentity,
      sequence
    };
    const entry = {
      command,
      fingerprint,
      event,
      outboxId: `outbox:${command.commandId}:${fingerprint}`,
      createdAt: now(),
      stage: "VALIDATED",
      result: resultBase(command.commandId, fingerprint, "APPLIED", [])
    };
    entry.stage = "AUTHORIZED";
    entry.stage = "COMMITTED";
    entry.stage = "EVENT_RECORDED";
    entry.stage = "OUTBOX_READY";
    entries.set(command.commandId, entry);
    events.set(event.eventId, entry);
    const consumed = await consume({
      consumerId: "canonical",
      eventId: event.eventId,
      aggregateReference: event.aggregateReference,
      sequence: event.sequence,
      fingerprint: event.fingerprint,
      providerIdentity: event.providerIdentity,
      replay: false
    });
    const flowState = state.canonicalFlowState;
    if (consumed.status !== "APPLIED") {
      if (consumed.status === "RETRY") {
        consumerShadow.delete(`canonical\0${event.aggregateReference}`);
      }
      entry.result = {
        commandId: command.commandId,
        fingerprint,
        stage: entry.stage,
        status: "PROJECTION_FAILED",
        commit: "COMMITTED",
        eventRecorded: true,
        outboxReady: true,
        inboxApplied: false,
        projection: "FAILED",
        flowState,
        eventId: event.eventId,
        diagnostics: [
          "PLATFORM450_PROJECTION_NOT_APPLIED",
          ...consumed.diagnostics
        ]
      };
      return entry.result;
    }
    entry.stage = "INBOX_APPLIED";
    entry.result = {
      commandId: command.commandId,
      fingerprint,
      stage: entry.stage,
      status: "APPLIED",
      commit: "COMMITTED",
      eventRecorded: true,
      outboxReady: true,
      inboxApplied: true,
      projection: "APPLIED",
      flowState,
      eventId: event.eventId,
      diagnostics: []
    };
    return entry.result;
  };
  const snapshot = async (snapshotId) => {
    if (!validId(snapshotId)) {
      throw new Error("PLATFORM450_SNAPSHOT_ID_INVALID");
    }
    const state = await options.packageStateResolver({
      flow: "OPS_PROJECTION",
      resourceReference: `snapshot:${snapshotId}`
    });
    if (!manifestMatches(state.dependencyManifest)) {
      throw new Error("PLATFORM450_DEPENDENCY_MANIFEST_STALE");
    }
    const base = {
      snapshotVersion: 1,
      snapshotId,
      sourceRevision: state.revision,
      sourceHash: await sourceHash(state),
      projectionShadow: [
        ...projectionShadow
      ].sort(),
      flagShadow: [
        ...activeFlags.entries()
      ].sort(([left], [right]) => left.localeCompare(right)),
      consumerShadow: [
        ...consumerShadow.values()
      ].map(cloneConsumerShadow).sort((left, right) => `${left.consumerId}:${left.aggregateReference}`.localeCompare(`${right.consumerId}:${right.aggregateReference}`))
    };
    const result = {
      ...base,
      snapshotHash: await hashCanonical(base)
    };
    snapshots.set(snapshotId, result);
    return result;
  };
  const rollback = async (input) => {
    const value = typeof input === "string" ? snapshots.get(input) : input;
    const snapshotId = typeof input === "string" ? input : input?.snapshotId ?? "invalid";
    const failed = (diagnostic) => ({
      snapshotId,
      restored: false,
      compensated: false,
      acceptedIdentityCount: acceptedIdentityCount(),
      diagnostics: [
        diagnostic
      ]
    });
    if (!value || value.snapshotVersion !== 1 || !validHash(value.snapshotHash)) {
      return failed("PLATFORM450_SNAPSHOT_INVALID");
    }
    const { snapshotHash, ...snapshotBody } = value;
    if (await hashCanonical(snapshotBody) !== snapshotHash) {
      return failed("PLATFORM450_SNAPSHOT_HASH_MISMATCH");
    }
    let state;
    try {
      state = await options.packageStateResolver({
        flow: "OPS_PROJECTION",
        resourceReference: `snapshot:${snapshotId}`
      });
    } catch {
      return failed("PLATFORM450_CURRENT_SOURCE_UNAVAILABLE");
    }
    if (state.revision !== value.sourceRevision || await sourceHash(state) !== value.sourceHash || !manifestMatches(state.dependencyManifest)) {
      return failed("PLATFORM450_SNAPSHOT_SOURCE_STALE");
    }
    projectionShadow.clear();
    for (const id of value.projectionShadow) projectionShadow.add(id);
    activeFlags.clear();
    for (const [key, flag] of value.flagShadow) activeFlags.set(key, flag);
    consumerShadow.clear();
    for (const item of value.consumerShadow) {
      const key = `${item.consumerId}\0${item.aggregateReference}`;
      consumerShadow.set(key, cloneConsumerShadow(item));
    }
    return {
      snapshotId,
      restored: true,
      compensated: false,
      acceptedIdentityCount: acceptedIdentityCount(),
      diagnostics: [
        "PLATFORM450_ROLLBACK_SHADOW_RESTORED"
      ]
    };
  };
  return Object.freeze({
    execute,
    consume,
    snapshot,
    rollback,
    acceptedIdentities: () => Object.freeze([
      ...entries.values()
    ].flatMap((entry) => [
      entry.event.eventId,
      entry.outboxId,
      ...entry.inboxId ? [
        entry.inboxId
      ] : []
    ]))
  });
}

// src/platform/site-460/browser-entry.ts
var LOCAL_HOSTS = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "[::1]"
]);
var RESOURCE = "resource:site460-public-work";
function enabled() {
  return LOCAL_HOSTS.has(location.hostname) && new URLSearchParams(location.search).get("site460") === "on";
}
function fixedComposition() {
  return createPlatform450Composition({
    authorityResolver: (command) => ({
      principalId: "principal:site460-local",
      tenantId: "tenant:site460-local",
      resourceId: command.resourceReference,
      action: command.requestedAction,
      capability: PLATFORM450_CAPABILITIES[command.flow],
      policyVersion: "policy:site460-v1",
      currentRevision: "revision:site460-v1",
      providerIdentity: "server"
    }),
    packageStateResolver: (input) => createPlatform450PackageState("revision:site460-v1", input.flow, input.resourceReference),
    consumerAdapter: {
      apply: () => ({
        ok: true,
        sideEffects: 0
      })
    },
    flags: {
      PUBLIC_WORK_SOCIAL: "ON"
    },
    killSwitch: false
  });
}
async function mountSite460BrowserEntry() {
  if (!enabled()) return;
  const host = document.querySelector("#site460Status") ?? document.body;
  host.hidden = false;
  const output = document.createElement("output");
  output.dataset.site460Status = "loading";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  output.textContent = "SITE-460 connecting\u2026";
  host.append(output);
  const command = {
    commandId: "cmd:site460-public-work",
    flow: "PUBLIC_WORK_SOCIAL",
    resourceReference: RESOURCE,
    requestedAction: "platform.public-work-social.complete"
  };
  const result = await fixedComposition().execute(command);
  if (result.status === "APPLIED" && result.stage === "INBOX_APPLIED") {
    output.dataset.site460Status = "completed";
    output.textContent = "PUBLIC_WORK_SOCIAL \xB7 COMPLETED";
    return;
  }
  output.dataset.site460Status = "failed";
  output.textContent = "SITE-460 unavailable (fail closed).";
}
if (typeof document !== "undefined") void mountSite460BrowserEntry();
