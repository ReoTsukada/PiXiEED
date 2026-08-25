var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// pixiedraw2/src/platform/site-400/entry.ts
var entry_exports = {};
__export(entry_exports, {
  SITE400_ENTRY_ID: () => SITE400_ENTRY_ID,
  createSite400EntryModule: () => createSite400EntryModule
});
function createSite400EntryModule() {
  return Object.freeze({
    moduleId: SITE400_ENTRY_ID,
    status: "ISOLATED_READY",
    connectedRoutes: Object.freeze([]),
    heavyModules: Object.freeze([])
  });
}
var SITE400_ENTRY_ID;
var init_entry = __esm({
  "pixiedraw2/src/platform/site-400/entry.ts"() {
    SITE400_ENTRY_ID = "SITE-400";
  }
});

// pixiedraw2/src/wp160-contracts.ts
var AUTHORIZATION_PROOF_SCHEMA_VERSION = 1;
var AUTHORIZATION_PROOF_TYPE = "AUTHORIZATION_PROOF";
var AUTHORIZATION_PROOF_SOURCE = "server";
var AUTHORIZATION_PROOF_POLICY_VERSION = "authorization-policy-v1";
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var AUTHORIZATION_PROOF_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "proofType",
  "source",
  "decision",
  "authorityId",
  "proofId",
  "principalId",
  "resourceType",
  "resourceId",
  "action",
  "capability",
  "tenantId",
  "correlationId",
  "policyVersion",
  "grantId",
  "issuedAt",
  "expiresAt"
]);
function authorizationText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}
function authorizationNullableText(value) {
  return value === null || authorizationText(value);
}
function isAuthorizationProofV1(value, expected = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proof2 = value;
  if (Object.keys(proof2).some((key) => !AUTHORIZATION_PROOF_KEYS.has(key))) return false;
  if (proof2.schemaVersion !== AUTHORIZATION_PROOF_SCHEMA_VERSION || proof2.proofType !== AUTHORIZATION_PROOF_TYPE || proof2.source !== AUTHORIZATION_PROOF_SOURCE) return false;
  if (![
    "allow",
    "deny",
    "unknown"
  ].includes(proof2.decision)) return false;
  if (![
    "authorityId",
    "proofId",
    "resourceType",
    "resourceId",
    "action",
    "capability",
    "policyVersion",
    "issuedAt",
    "expiresAt"
  ].every((key) => authorizationText(proof2[key]))) return false;
  if (!authorizationNullableText(proof2.principalId) || !authorizationNullableText(proof2.tenantId) || !authorizationNullableText(proof2.correlationId) || !authorizationNullableText(proof2.grantId)) return false;
  const issuedAt = Date.parse(proof2.issuedAt);
  const expiresAt = Date.parse(proof2.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) return false;
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== void 0 && proof2[key] !== expectedValue) return false;
  }
  return true;
}
function requireAuthorizationProofV1(value, expected = {}) {
  if (!isAuthorizationProofV1(value, expected)) throw new Error("AuthorizationProofV1 is invalid or not bound to the requested scope.");
  const proof2 = value;
  if (proof2.decision !== "allow") throw new Error("AuthorizationProofV1 did not grant the requested capability.");
  const now = Date.now();
  const issuedAt = Date.parse(proof2.issuedAt);
  const expiresAt = Date.parse(proof2.expiresAt);
  if (issuedAt > now + AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS) throw new Error("AuthorizationProofV1 was issued in the future.");
  if (expiresAt <= now) throw new Error("AuthorizationProofV1 has expired.");
  if (expiresAt - issuedAt > AUTHORIZATION_PROOF_MAX_LIFETIME_MS) throw new Error("AuthorizationProofV1 lifetime exceeds policy.");
  return proof2;
}
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

// pixiedraw2/src/server/internal/authenticated-context.ts
var AUTHENTICATED_SERVER_PRINCIPAL_SCHEMA_VERSION = "AUTHENTICATED_SERVER_PRINCIPAL_V1";
var SERVER_TENANT_CONTEXT_SCHEMA_VERSION = "SERVER_TENANT_CONTEXT_V1";
var SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION = "SERVER_AUTHORITY_REQUEST_CONTEXT_V1";
var SERVER_AUTHORITY_CONTEXT_SOURCE = "SERVER_COMPOSITION_ROOT";
var AUTHENTICATED_PRINCIPAL_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHENTICATED_PRINCIPAL_MAX_LIFETIME_MS = 15 * 60 * 1e3;
var SERVER_AUTHORITY_CONTEXT_MAX_LIFETIME_MS = 5 * 60 * 1e3;
var authenticatedPrincipalBrand = /* @__PURE__ */ new WeakSet();
var tenantMembershipBrand = /* @__PURE__ */ new WeakMap();
var authorityContextBrand = /* @__PURE__ */ new WeakSet();
var authorityContextBinding = /* @__PURE__ */ new WeakMap();
var authorityContextAuthorizationProof = /* @__PURE__ */ new WeakMap();
var consumedAuthorityContexts = /* @__PURE__ */ new WeakSet();
var consumingAuthorityContexts = /* @__PURE__ */ new WeakSet();
function isRecord(value) {
  return value !== null && typeof value === "object";
}
function isText(value, maxLength = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}
function parseIso(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function hasValidLifetime(issuedAt, expiresAt, now, maxLifetime) {
  if (!Number.isFinite(now) || !Number.isFinite(maxLifetime) || maxLifetime < 0) {
    return false;
  }
  const issued = parseIso(issuedAt);
  const expires = parseIso(expiresAt);
  if (issued === null || expires === null || expires <= issued) return false;
  if (issued > now + AUTHENTICATED_PRINCIPAL_ALLOWED_CLOCK_SKEW_MS) {
    return false;
  }
  if (expires <= now || expires - issued > maxLifetime) return false;
  return true;
}
function membershipShape(value) {
  if (!isRecord(value)) return false;
  return isText(value.membershipId) && isText(value.principalId) && isText(value.tenantId) && isText(value.membershipRevision) && (value.status === "ACTIVE" || value.status === "SUSPENDED" || value.status === "REVOKED");
}
function principalShape(value) {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== AUTHENTICATED_SERVER_PRINCIPAL_SCHEMA_VERSION || !isText(value.principalId) || !isText(value.authSessionId) || value.authenticationSource !== "SERVER_AUTH_ADAPTER" || value.assurance !== "SESSION_VERIFIED" && value.assurance !== "JWT_VERIFIED" || !isText(value.issuedAt, 64) || !isText(value.expiresAt, 64) || !isText(value.correlationId, 256) || !Array.isArray(value.tenantMemberships) || !value.tenantMemberships.every(membershipShape)) return false;
  const tenantIds = value.tenantMemberships.map((membership2) => membership2.tenantId);
  if (new Set(tenantIds).size !== tenantIds.length) return false;
  if (value.tenantMemberships.some((membership2) => membership2.principalId !== value.principalId)) return false;
  try {
    requireAuthorizationProofV1(value.authorizationProof, {
      principalId: value.principalId,
      resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
      resourceId: value.authSessionId,
      action: "server.authority.context.create",
      capability: "server.authority.context.create"
    });
  } catch {
    return false;
  }
  return true;
}
function issuePrincipal(input) {
  const principal = Object.freeze({
    schemaVersion: AUTHENTICATED_SERVER_PRINCIPAL_SCHEMA_VERSION,
    principalId: input.principalId,
    authSessionId: input.authSessionId,
    authenticationSource: input.authenticationSource,
    assurance: input.assurance,
    tenantMemberships: Object.freeze(input.tenantMemberships.map((membership2) => Object.freeze({
      ...membership2
    }))),
    authorizationProof: Object.freeze({
      ...input.authorizationProof
    }),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    correlationId: input.correlationId
  });
  if (!principalShape(principal)) {
    throw new Error("AUTHENTICATED_PRINCIPAL_INVALID");
  }
  authenticatedPrincipalBrand.add(principal);
  return principal;
}
function createServerAuthPrincipalProvider(adapter) {
  return Object.freeze({
    async authenticate(request) {
      let verified;
      try {
        verified = await adapter.verify(request);
      } catch {
        return null;
      }
      if (verified === null) return null;
      try {
        return issuePrincipal({
          ...verified,
          authenticationSource: "SERVER_AUTH_ADAPTER"
        });
      } catch {
        return null;
      }
    }
  });
}
function isAuthenticatedServerPrincipal(value, now = Date.now()) {
  return isRecord(value) && authenticatedPrincipalBrand.has(value) && principalShape(value) && hasValidLifetime(value.issuedAt, value.expiresAt, now, AUTHENTICATED_PRINCIPAL_MAX_LIFETIME_MS);
}
function bindCanonicalTenantMembership(input) {
  if (!isAuthenticatedServerPrincipal(input.principal)) {
    throw new Error("AUTHENTICATED_PRINCIPAL_REQUIRED");
  }
  if (input.membership.status !== "ACTIVE") {
    throw new Error("TENANT_MEMBERSHIP_INACTIVE");
  }
  const canonical = input.principal.tenantMemberships.find((membership2) => membership2.membershipId === input.membership.membershipId && membership2.principalId === input.membership.principalId && membership2.tenantId === input.membership.tenantId && membership2.status === "ACTIVE");
  if (canonical === void 0) throw new Error("TENANT_MEMBERSHIP_DENIED");
  if (input.membership.principalId !== input.principal.principalId) {
    throw new Error("TENANT_MEMBERSHIP_PRINCIPAL_MISMATCH");
  }
  const bound = Object.freeze({
    membershipId: canonical.membershipId,
    tenantId: canonical.tenantId,
    principalId: input.principal.principalId,
    membershipRevision: canonical.membershipRevision,
    status: "ACTIVE"
  });
  tenantMembershipBrand.set(bound, input.principal.principalId);
  return bound;
}
function createServerAuthorityRequestContext(input) {
  const now = input.now ?? Date.now();
  if (!isAuthenticatedServerPrincipal(input.principal, now)) {
    throw new Error("AUTHENTICATED_PRINCIPAL_INVALID_OR_EXPIRED");
  }
  if (tenantMembershipBrand.get(input.membership) !== input.principal.principalId || input.membership.principalId !== input.principal.principalId || input.membership.status !== "ACTIVE" || !isText(input.membership.membershipRevision)) throw new Error("TENANT_MEMBERSHIP_NOT_BOUND");
  if (!isText(input.request.requestId) || !isText(input.request.resourceType) || !isText(input.request.resourceId) || !isText(input.request.correlationId)) throw new Error("SERVER_REQUEST_INVALID");
  let boundAuthorizationProof = null;
  if (input.authorizationProof !== void 0) {
    try {
      boundAuthorizationProof = Object.freeze({
        ...input.authorizationProof
      });
      requireAuthorizationProofV1(boundAuthorizationProof, {
        principalId: input.principal.principalId,
        resourceType: input.request.resourceType,
        resourceId: input.request.resourceId,
        tenantId: input.membership.tenantId,
        correlationId: input.request.correlationId
      });
    } catch {
      throw new Error("SERVER_AUTHORIZATION_PROOF_NOT_BOUND");
    }
  }
  const issuedAt = new Date(now).toISOString();
  const principalExpiry = parseIso(input.principal.expiresAt);
  const expiresAt = new Date(Math.min(principalExpiry, now + SERVER_AUTHORITY_CONTEXT_MAX_LIFETIME_MS)).toISOString();
  const context = Object.freeze({
    schemaVersion: SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION,
    tenantContext: Object.freeze({
      schemaVersion: SERVER_TENANT_CONTEXT_SCHEMA_VERSION,
      tenantId: input.membership.tenantId,
      principalId: input.principal.principalId,
      source: "SERVER_REGISTRY"
    }),
    source: SERVER_AUTHORITY_CONTEXT_SOURCE,
    principalId: input.principal.principalId,
    membershipId: input.membership.membershipId,
    membershipRevision: input.membership.membershipRevision,
    authSessionId: input.principal.authSessionId,
    requestId: input.request.requestId,
    resourceType: input.request.resourceType,
    resourceId: input.request.resourceId,
    correlationId: input.request.correlationId,
    issuedAt,
    expiresAt
  });
  authorityContextBrand.add(context);
  authorityContextBinding.set(context, {
    principalId: input.principal.principalId,
    tenantId: input.membership.tenantId,
    membershipId: input.membership.membershipId,
    membershipRevision: input.membership.membershipRevision
  });
  if (boundAuthorizationProof !== null) {
    authorityContextAuthorizationProof.set(context, boundAuthorizationProof);
  }
  return context;
}
function isServerAuthorityRequestContext(value, now = Date.now()) {
  if (!isRecord(value) || !authorityContextBrand.has(value)) return false;
  const context = value;
  const binding = authorityContextBinding.get(value);
  if (binding === void 0) return false;
  return context.schemaVersion === SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION && context.source === SERVER_AUTHORITY_CONTEXT_SOURCE && isText(context.principalId) && isText(context.membershipId) && isText(context.authSessionId) && isText(context.requestId) && isText(context.resourceType) && isText(context.resourceId) && isText(context.correlationId) && isText(context.issuedAt, 64) && isText(context.expiresAt, 64) && context.tenantContext.principalId === context.principalId && binding.principalId === context.principalId && binding.tenantId === context.tenantContext.tenantId && binding.membershipId === context.membershipId && isText(context.membershipRevision) && binding.membershipRevision === context.membershipRevision && context.tenantContext.source === "SERVER_REGISTRY" && hasValidLifetime(context.issuedAt, context.expiresAt, now, SERVER_AUTHORITY_CONTEXT_MAX_LIFETIME_MS);
}
async function consumeServerAuthorityRequestContext(input, expected, now = Date.now()) {
  if (!isServerAuthorityRequestContext(input, now) || consumedAuthorityContexts.has(input) || consumingAuthorityContexts.has(input)) return false;
  const context = input;
  if (context.resourceType !== expected.resourceType || context.resourceId !== expected.resourceId) return false;
  consumingAuthorityContexts.add(input);
  try {
    const current = await expected.membershipRegistry.getCurrent({
      principalId: context.principalId,
      membershipId: context.membershipId,
      tenantId: context.tenantContext.tenantId
    });
    let matches = false;
    try {
      matches = isRecord(current) && current.status === "ACTIVE" && current.principalId === context.principalId && current.membershipId === context.membershipId && current.tenantId === context.tenantContext.tenantId && current.membershipRevision === context.membershipRevision;
    } catch {
      matches = false;
    }
    if (!matches) return false;
    consumedAuthorityContexts.add(input);
    return true;
  } catch {
    return false;
  } finally {
    consumingAuthorityContexts.delete(input);
  }
}
async function deriveServerAuthorityRequestContext(input) {
  let principal;
  try {
    principal = await input.authProvider.authenticate(input.request);
  } catch {
    return null;
  }
  if (!isRecord(principal) || principal.authenticationSource !== "SERVER_AUTH_ADAPTER" || !isAuthenticatedServerPrincipal(principal)) return null;
  let candidate;
  try {
    candidate = await input.tenantResolver.resolve({
      principal,
      resourceType: input.request.resourceType,
      resourceId: input.request.resourceId,
      ...input.request.requestedTenantId === void 0 ? {} : {
        requestedTenantId: input.request.requestedTenantId
      }
    });
  } catch {
    return null;
  }
  if (candidate === null) return null;
  let currentMembership;
  try {
    currentMembership = await input.tenantResolver.membershipRegistry.getCurrent({
      principalId: principal.principalId,
      membershipId: candidate.membershipId,
      tenantId: candidate.tenantId
    });
  } catch {
    return null;
  }
  if (currentMembership === null || currentMembership.status !== "ACTIVE" || currentMembership.principalId !== principal.principalId || currentMembership.membershipId !== candidate.membershipId || currentMembership.tenantId !== candidate.tenantId || currentMembership.membershipRevision !== candidate.membershipRevision) return null;
  let membership2;
  try {
    membership2 = bindCanonicalTenantMembership({
      principal,
      membership: candidate
    });
  } catch {
    return null;
  }
  try {
    return createServerAuthorityRequestContext({
      principal,
      membership: membership2,
      request: input.request
    });
  } catch {
    return null;
  }
}

// pixiedraw2/src/platform/site-400/lazy-entry.ts
function createSite400LazyEntry(loader = async () => {
  const module = await Promise.resolve().then(() => (init_entry(), entry_exports));
  return module.createSite400EntryModule();
}) {
  let modulePromise;
  return Object.freeze({
    load() {
      modulePromise ??= loader();
      return modulePromise;
    }
  });
}

// pixiedraw2/src/draw2-creator-workspace.ts
function isAssetSourceKind(value) {
  return [
    "LAYER_GROUP",
    "SELECTED_LAYERS",
    "VISIBLE_COMPOSITE",
    "ANIMATION_RANGE"
  ].includes(value);
}
function isCreatorAssetKind(value) {
  return [
    "CHARACTER",
    "OBJECT",
    "TILE",
    "BACKGROUND",
    "EFFECT"
  ].includes(value);
}
function isAssetPivot(value) {
  return [
    "CENTER",
    "FEET",
    "CUSTOM"
  ].includes(value);
}
function normalizeReferences(values) {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))
  ].sort();
}
function normalizeMetadata(metadata, assetKind) {
  return {
    name: (metadata?.name ?? `${assetKind.toLowerCase()}-draft`).trim(),
    description: (metadata?.description ?? "").trim(),
    tags: normalizeReferences(metadata?.tags)
  };
}
function normalizeLayerSelection(input, sourceLayerIds) {
  const selection = input.layerSelection;
  if (selection?.kind === "CURRENT_LAYER") return {
    kind: "CURRENT_LAYER",
    layerId: selection.layerId.trim()
  };
  if (selection?.kind === "SELECTED_LAYERS") return {
    kind: "SELECTED_LAYERS",
    layerIds: normalizeReferences(selection.layerIds)
  };
  if (selection?.kind === "LAYER_GROUP") return {
    kind: "LAYER_GROUP",
    groupId: selection.groupId.trim()
  };
  if (selection?.kind === "VISIBLE_LAYERS") return {
    kind: "VISIBLE_LAYERS"
  };
  if (input.sourceKind === "LAYER_GROUP" && sourceLayerIds[0] !== void 0) {
    return {
      kind: "LAYER_GROUP",
      groupId: sourceLayerIds[0]
    };
  }
  if (input.sourceKind === "VISIBLE_COMPOSITE") return {
    kind: "VISIBLE_LAYERS"
  };
  return {
    kind: "SELECTED_LAYERS",
    layerIds: sourceLayerIds
  };
}
function normalizeFrameSelection(selection) {
  if (selection === void 0) return void 0;
  if (selection.kind === "CURRENT_FRAME") return {
    kind: "CURRENT_FRAME",
    frameId: selection.frameId.trim()
  };
  if (selection.kind === "RANGE") return {
    kind: "RANGE",
    startFrameId: selection.startFrameId.trim(),
    endFrameId: selection.endFrameId.trim()
  };
  if (selection.kind === "TAG") return {
    kind: "TAG",
    tagId: selection.tagId.trim()
  };
  return {
    kind: "EXPLICIT",
    frameIds: normalizeReferences(selection.frameIds)
  };
}
function normalizeAnimationMapping(mapping) {
  return mapping.map((clip) => ({
    name: clip.name,
    ...clip.customName === void 0 ? {} : {
      customName: clip.customName.trim()
    },
    frameIds: normalizeReferences(clip.frameIds),
    loopMode: clip.loopMode,
    ...clip.fps === void 0 ? {} : {
      fps: clip.fps
    }
  }));
}
function normalizePivotDefinition(input) {
  if (input.pivotDefinition !== void 0) return input.pivotDefinition;
  if (input.pivot === "CUSTOM") return {
    kind: "CUSTOM",
    x: 0,
    y: 0
  };
  return {
    kind: input.pivot
  };
}
function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function isFiniteInteger(value) {
  return Number.isSafeInteger(value);
}
function isValidLayerSelection(selection) {
  if (selection.kind === "CURRENT_LAYER") return selection.layerId.trim().length > 0;
  if (selection.kind === "LAYER_GROUP") return selection.groupId.trim().length > 0;
  if (selection.kind === "SELECTED_LAYERS") return normalizeReferences(selection.layerIds).length > 0;
  return selection.kind === "VISIBLE_LAYERS";
}
function isValidFrameSelection(selection) {
  if (selection.kind === "CURRENT_FRAME") return selection.frameId.trim().length > 0;
  if (selection.kind === "RANGE") return selection.startFrameId.trim().length > 0 && selection.endFrameId.trim().length > 0;
  if (selection.kind === "TAG") return selection.tagId.trim().length > 0;
  return selection.frameIds.length > 0 && normalizeReferences(selection.frameIds).length === selection.frameIds.length;
}
function isValidRegionSelection(region) {
  if (region.kind === "FULL_CANVAS") return true;
  if (![
    region.x,
    region.y
  ].every(isFiniteInteger) || region.x < 0 || region.y < 0) return false;
  if (region.kind === "MANUAL") return isPositiveInteger(region.width) && isPositiveInteger(region.height);
  if (region.kind === "GRID") return (region.cellSize === 16 || region.cellSize === 32) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
  return isPositiveInteger(region.cellWidth) && isPositiveInteger(region.cellHeight) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
}
function isValidAnimationMapping(mapping) {
  const seenNames = /* @__PURE__ */ new Set();
  return mapping.every((clip) => {
    if (seenNames.has(clip.name) || clip.frameIds.length === 0 || normalizeReferences(clip.frameIds).length !== clip.frameIds.length) return false;
    seenNames.add(clip.name);
    if (clip.name === "CUSTOM" && (clip.customName ?? "").trim().length === 0) return false;
    return [
      "LOOP",
      "ONCE",
      "PING_PONG"
    ].includes(clip.loopMode) && (clip.fps === void 0 || Number.isFinite(clip.fps) && clip.fps > 0);
  });
}
function isValidPivotDefinition(pivot) {
  return pivot.kind !== "CUSTOM" || [
    pivot.x,
    pivot.y
  ].every(Number.isFinite);
}
function isValidProtection(protection) {
  return typeof protection.locked === "boolean" && protection.sourceReadOnly === true && [
    "LIVE",
    "PINNED",
    "REVIEW",
    "FORKED"
  ].includes(protection.referencePolicy);
}
function isValidDefinition(definition) {
  const validFrames = isPositiveInteger(definition.frameStart) && isPositiveInteger(definition.frameEnd) && definition.frameEnd >= definition.frameStart;
  return definition.sourceProjectId.length > 0 && definition.sourceProjectId === definition.sourceProjectId.trim() && definition.sourceCanvasId.length > 0 && definition.sourceCanvasId === definition.sourceCanvasId.trim() && validFrames && isAssetSourceKind(definition.sourceKind) && isCreatorAssetKind(definition.assetKind) && isAssetPivot(definition.pivot) && isValidLayerSelection(definition.layerSelection) && isValidFrameSelection(definition.frameSelection) && isValidRegionSelection(definition.region) && isValidAnimationMapping(definition.animationMapping) && isValidPivotDefinition(definition.pivotDefinition) && isValidProtection(definition.protection) && definition.metadata.name.length > 0;
}
function createAssetDefinitionDraft(input) {
  const sourceProjectId = input.sourceProjectId.trim();
  const sourceCanvasId = input.sourceCanvasId.trim();
  const sourceLayerIds = normalizeReferences(input.sourceLayerIds);
  const dependencyIds = normalizeReferences(input.dependencyIds);
  const layerSelection = normalizeLayerSelection(input, sourceLayerIds);
  const frameSelection = normalizeFrameSelection(input.frameSelection);
  const region = input.region ?? {
    kind: "FULL_CANVAS"
  };
  const animationMapping = normalizeAnimationMapping(input.animationMapping ?? []);
  const pivotDefinition = normalizePivotDefinition(input);
  const protection = input.protection ?? {
    locked: false,
    sourceReadOnly: true,
    referencePolicy: "LIVE"
  };
  const metadata = normalizeMetadata(input.metadata, input.assetKind);
  const validFrames = Number.isInteger(input.frameStart) && Number.isInteger(input.frameEnd) && input.frameStart > 0 && input.frameEnd >= input.frameStart;
  if (sourceProjectId.length === 0 || sourceCanvasId.length === 0 || !isAssetSourceKind(input.sourceKind) || !isCreatorAssetKind(input.assetKind) || !isAssetPivot(input.pivot) || !validFrames || frameSelection === void 0 || !isValidLayerSelection(layerSelection) || !isValidFrameSelection(frameSelection) || !isValidRegionSelection(region) || !isValidAnimationMapping(animationMapping) || !isValidPivotDefinition(pivotDefinition) || !isValidProtection(protection) || metadata.name.length === 0) {
    return {
      ok: false,
      code: "INVALID_ASSET_DRAFT",
      message: "Project\u3001Source\u3001Type\u3001Pivot\u3001Frame\u7BC4\u56F2\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      sourceProjectId,
      sourceCanvasId,
      sourceKind: input.sourceKind,
      sourceLayerIds,
      frameStart: input.frameStart,
      frameEnd: input.frameEnd,
      layerSelection,
      frameSelection,
      region,
      animationMapping,
      assetKind: input.assetKind,
      pivot: input.pivot,
      pivotDefinition,
      protection,
      metadata,
      dependencyIds,
      persistence: "LOCAL_DRAFT"
    }
  };
}
function validateAssetDefinitionDraft(draft) {
  if (draft.persistence !== "LOCAL_DRAFT" || !isValidDefinition(draft)) {
    return {
      ok: false,
      code: "INVALID_ASSET_DEFINITION",
      message: "Asset\u5B9A\u7FA9\u306E\u53C2\u7167\u3001\u7BC4\u56F2\u3001\u30E1\u30BF\u30C7\u30FC\u30BF\u3001\u4FDD\u8B77\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  return {
    ok: true,
    value: {
      ...draft,
      persistence: "VALIDATED_DEFINITION"
    }
  };
}

// pixiedraw2/src/draw2-core.ts
var NullInstrumentation = class {
  record(_point) {
  }
};
var NOOP_INSTRUMENTATION = new NullInstrumentation();
function stableValue(value) {
  if (value instanceof Uint8Array) {
    return {
      __type: "Uint8Array",
      values: Array.from(value)
    };
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).sort(([left], [right]) => String(left).localeCompare(String(right))).map(([key, entry]) => [
      key,
      stableValue(entry)
    ]);
  }
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (value !== null && typeof value === "object") {
    const object = value;
    return Object.fromEntries(Object.keys(object).filter((key) => object[key] !== void 0).sort().map((key) => [
      key,
      stableValue(object[key])
    ]));
  }
  return value;
}
function canonicalJson(value) {
  return JSON.stringify(stableValue(value)) ?? "null";
}
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// pixiedraw2/src/draw2-asset-registry-bridge.ts
var REGISTERED_ASSET_STATUS = "REGISTERED_ASSET";
var REGISTRY_BRIDGE_REFERENCE_MODES = [
  "LIVE",
  "PINNED",
  "REVIEW",
  "FORKED"
];
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
var SHA2562 = /^[a-f0-9]{64}$/u;
var VALIDATED_DEFINITION_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "sourceProjectId",
  "sourceCanvasId",
  "sourceKind",
  "sourceLayerIds",
  "frameStart",
  "frameEnd",
  "layerSelection",
  "frameSelection",
  "region",
  "animationMapping",
  "assetKind",
  "pivot",
  "pivotDefinition",
  "protection",
  "metadata",
  "dependencyIds",
  "persistence"
]);
var FORBIDDEN_PAYLOAD_KEYS = /* @__PURE__ */ new Set([
  "pixel",
  "pixels",
  "pixelData",
  "raster",
  "blob",
  "dataUrl",
  "base64",
  "rgba",
  "indexedBytes",
  "payload",
  "bytes",
  "buffer",
  "imageData",
  "audioData"
]);
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isSafeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}
function isSha256(value) {
  return typeof value === "string" && SHA2562.test(value);
}
function isReferenceMode(value) {
  return REGISTRY_BRIDGE_REFERENCE_MODES.includes(value);
}
function fail(code, message, providerCode) {
  return providerCode === void 0 ? {
    ok: false,
    code,
    message
  } : {
    ok: false,
    code,
    message,
    providerCode
  };
}
function containsForbiddenPayload(value, seen = /* @__PURE__ */ new Set(), depth = 0) {
  if (depth > 12) return true;
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenPayload(entry, seen, depth + 1));
  return Object.entries(value).some(([key, entry]) => FORBIDDEN_PAYLOAD_KEYS.has(key) || containsForbiddenPayload(entry, seen, depth + 1));
}
function normalizeValidatedDefinition(value) {
  if (!isRecord2(value) || value.persistence !== "VALIDATED_DEFINITION") {
    return fail(isRecord2(value) && value.persistence === "LOCAL_DRAFT" ? "LOCAL_DRAFT_NOT_REGISTERABLE" : "INVALID_ASSET_DEFINITION", "Registry Bridge\u306FVALIDATED_DEFINITION\u3060\u3051\u3092\u53D7\u3051\u4ED8\u3051\u307E\u3059\u3002");
  }
  if (value.schemaVersion !== 1) return fail("INVALID_ASSET_DEFINITION", "Asset Definition\u306ESchema Version\u304C\u672A\u5BFE\u5FDC\u3067\u3059\u3002");
  if (Object.keys(value).some((key) => !VALIDATED_DEFINITION_KEYS.has(key))) return fail("INVALID_ASSET_DEFINITION", "Asset Definition\u306B\u672A\u8A31\u53EF\u306E\u30C7\u30FC\u30BF\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u3059\u3002");
  if (containsForbiddenPayload(value)) return fail("INVALID_ASSET_DEFINITION", "Asset Definition\u306BPixel\uFF0FBlob\u30C7\u30FC\u30BF\u3092\u542B\u3081\u3089\u308C\u307E\u305B\u3093\u3002");
  if (typeof value.sourceProjectId !== "string" || typeof value.sourceCanvasId !== "string" || typeof value.sourceKind !== "string" || typeof value.assetKind !== "string" || typeof value.pivot !== "string" || !Array.isArray(value.sourceLayerIds) || !value.sourceLayerIds.every((entry) => typeof entry === "string") || !Number.isSafeInteger(value.frameStart) || !Number.isSafeInteger(value.frameEnd) || !isRecord2(value.layerSelection) || !isRecord2(value.frameSelection) || !isRecord2(value.region) || !Array.isArray(value.animationMapping) || !isRecord2(value.pivotDefinition) || !isRecord2(value.protection) || !isRecord2(value.metadata) || !Array.isArray(value.dependencyIds) || !value.dependencyIds.every((entry) => typeof entry === "string")) return fail("INVALID_ASSET_DEFINITION", "Asset Definition\u306E\u5B9F\u884C\u6642\u578B\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  if (value.sourceKind === "SELECTED_LAYERS" && (!Array.isArray(value.sourceLayerIds) || value.sourceLayerIds.length === 0)) return fail("INVALID_ASSET_DEFINITION", "SELECTED_LAYERS\u306B\u306FsourceLayerIds\u304C\u5FC5\u8981\u3067\u3059\u3002");
  try {
    const input = {
      sourceProjectId: String(value.sourceProjectId),
      sourceCanvasId: String(value.sourceCanvasId),
      sourceKind: value.sourceKind,
      sourceLayerIds: value.sourceLayerIds,
      frameStart: value.frameStart,
      frameEnd: value.frameEnd,
      layerSelection: value.layerSelection,
      frameSelection: value.frameSelection,
      region: value.region,
      animationMapping: value.animationMapping,
      assetKind: value.assetKind,
      pivot: value.pivot,
      pivotDefinition: value.pivotDefinition,
      protection: value.protection,
      metadata: value.metadata,
      dependencyIds: value.dependencyIds
    };
    const draft = createAssetDefinitionDraft(input);
    if (!draft.ok) return fail("INVALID_ASSET_DEFINITION", draft.message);
    const validated = validateAssetDefinitionDraft(draft.value);
    if (!validated.ok) return fail("INVALID_ASSET_DEFINITION", validated.message);
    return {
      ok: true,
      value: validated.value
    };
  } catch (error) {
    return fail("INVALID_ASSET_DEFINITION", error instanceof Error ? error.message : "Asset Definition\u306E\u691C\u8A3C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
  }
}
function validateRegistrationContext(context, definition) {
  if (!isRecord2(context)) return fail("INVALID_REGISTRATION_CONTEXT", "Registry context\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  for (const key of [
    "projectId",
    "sourcePxdId",
    "definitionId",
    "ownerId"
  ]) {
    if (!isSafeId(context[key])) return fail("INVALID_REGISTRATION_CONTEXT", `${key}\u304C\u4E0D\u6B63\u3067\u3059\u3002`);
  }
  if (!isReferenceMode(context.referenceMode)) return fail("INVALID_REGISTRATION_CONTEXT", "referenceMode\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  if (context.sourceRevisionId !== void 0 && !isSafeId(context.sourceRevisionId)) return fail("INVALID_REGISTRATION_CONTEXT", "sourceRevisionId\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  if (context.definitionDigest !== void 0 && !isSha256(context.definitionDigest)) return fail("INVALID_REGISTRATION_CONTEXT", "definitionDigest\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  if (context.referenceMode === "PINNED" && context.sourceRevisionId === void 0) return fail("PINNED_REVISION_REQUIRED", "PINNED\u767B\u9332\u306B\u306FsourceRevisionId\u304C\u5FC5\u8981\u3067\u3059\u3002");
  if (context.referenceMode === "LIVE" && context.sourceRevisionId !== void 0) return fail("INVALID_REGISTRATION_CONTEXT", "LIVE\u767B\u9332\u306FsourceRevisionId\u3092\u6307\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002");
  if (definition !== void 0) {
    if (context.projectId !== definition.sourceProjectId) return fail("INVALID_REGISTRATION_CONTEXT", "Project ID\u304CAsset Definition\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
    if (context.referenceMode !== definition.protection.referencePolicy) return fail("REFERENCE_POLICY_MISMATCH", "referenceMode\u304CAsset Definition\u306EPolicy\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  return {
    ok: true,
    value: context
  };
}
function validateAssetId(assetId) {
  return isSafeId(assetId) ? void 0 : fail("INVALID_ASSET_ID", "assetId\u304C\u4E0D\u6B63\u3067\u3059\u3002");
}
function identityMatchesContext(identity, assetId, context, digest) {
  if (assetId !== void 0 && identity.assetId !== assetId) return fail("IDENTITY_CONFLICT", "Provider\u304C\u5225\u306EAsset ID\u3092\u8FD4\u3057\u307E\u3057\u305F\u3002");
  if (identity.projectId !== context.projectId || identity.sourcePxdId !== context.sourcePxdId || identity.definitionId !== context.definitionId || identity.ownerId !== context.ownerId || identity.referenceMode !== context.referenceMode) return fail("IDENTITY_CONFLICT", "Provider\u306EAsset identity\u304C\u8981\u6C42Context\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  if (digest !== void 0 && identity.definitionDigest !== digest) return fail("IDENTITY_CONFLICT", "Provider\u306EdefinitionDigest\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  if (context.referenceMode === "PINNED") {
    if (identity.sourceRevisionId !== context.sourceRevisionId) return fail("IDENTITY_CONFLICT", "PINNED\u306EsourceRevisionId\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
    if ("definitionDigest" in context && context.definitionDigest !== void 0 && identity.definitionDigest !== context.definitionDigest) return fail("IDENTITY_CONFLICT", "PINNED\u306EdefinitionDigest\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  return void 0;
}
function mapProviderFailure(response) {
  if (response.ok) return fail("PROVIDER_RESPONSE_INVALID", "Provider response\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  const unresolvedCodes = /* @__PURE__ */ new Set([
    "SOURCE_NOT_FOUND",
    "DEFINITION_NOT_FOUND",
    "UNKNOWN_ASSET"
  ]);
  return fail(unresolvedCodes.has(response.code) ? "UNRESOLVED_SOURCE_DEFINITION" : "PROVIDER_REJECTED", response.message, response.code);
}
function validateRegisteredAssetIdentity(value) {
  if (!isRecord2(value)) return false;
  const keys = [
    "schemaVersion",
    "status",
    "assetId",
    "projectId",
    "sourcePxdId",
    "definitionId",
    "ownerId",
    "sourceRevisionId",
    "definitionDigest",
    "referenceMode"
  ];
  return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && value.schemaVersion === 1 && value.status === REGISTERED_ASSET_STATUS && isSafeId(value.assetId) && isSafeId(value.projectId) && isSafeId(value.sourcePxdId) && isSafeId(value.definitionId) && isSafeId(value.ownerId) && isSafeId(value.sourceRevisionId) && isSha256(value.definitionDigest) && isReferenceMode(value.referenceMode);
}
function isRegisteredAssetIdentity(value) {
  return validateRegisteredAssetIdentity(value);
}
async function calculateAssetDefinitionDigest(definition) {
  const normalized = normalizeValidatedDefinition(definition);
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    value: await sha256Hex(canonicalJson(normalized.value))
  };
}
function createAssetRegistryBridge(provider) {
  if (provider === null || typeof provider !== "object" || typeof provider.register !== "function" || typeof provider.resolve !== "function") throw new Error("Registry Bridge requires an injected provider adapter.");
  return {
    async register(definitionInput, contextInput) {
      const normalized = normalizeValidatedDefinition(definitionInput);
      if (!normalized.ok) return normalized;
      const contextResult = validateRegistrationContext(contextInput, normalized.value);
      if (!contextResult.ok) return contextResult;
      const context = contextResult.value;
      const digest = await calculateAssetDefinitionDigest(normalized.value);
      if (!digest.ok) return digest;
      const request = {
        schemaVersion: 1,
        projectId: context.projectId,
        sourcePxdId: context.sourcePxdId,
        definitionId: context.definitionId,
        ownerId: context.ownerId,
        referenceMode: context.referenceMode,
        definitionDigest: digest.value,
        ...context.sourceRevisionId === void 0 ? {} : {
          sourceRevisionId: context.sourceRevisionId
        }
      };
      let response;
      try {
        response = await provider.register(request);
      } catch (error) {
        return fail("PROVIDER_FAILURE", error instanceof Error ? error.message : "Provider register\u304C\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      }
      if (!response || typeof response !== "object") return fail("PROVIDER_RESPONSE_INVALID", "Provider register response\u304C\u4E0D\u6B63\u3067\u3059\u3002");
      if (!response.ok) return mapProviderFailure(response);
      if (!validateRegisteredAssetIdentity(response.identity)) return fail("PROVIDER_RESPONSE_INVALID", "Provider\u304C\u4E0D\u6B63\u306ARegistered Asset identity\u3092\u8FD4\u3057\u307E\u3057\u305F\u3002");
      const identityFailure = identityMatchesContext(response.identity, void 0, context, digest.value);
      return identityFailure === void 0 ? {
        ok: true,
        value: response.identity
      } : identityFailure;
    },
    async resolve(assetIdInput, contextInput) {
      const assetIdFailure = validateAssetId(assetIdInput);
      if (assetIdFailure !== void 0) return assetIdFailure;
      const contextResult = validateRegistrationContext(contextInput);
      if (!contextResult.ok) return contextResult;
      const context = contextResult.value;
      if (context.referenceMode === "PINNED" && context.definitionDigest === void 0) return fail("INVALID_REGISTRATION_CONTEXT", "PINNED resolve\u306B\u306FdefinitionDigest\u304C\u5FC5\u8981\u3067\u3059\u3002");
      const request = {
        schemaVersion: 1,
        assetId: assetIdInput,
        projectId: context.projectId,
        sourcePxdId: context.sourcePxdId,
        definitionId: context.definitionId,
        ownerId: context.ownerId,
        referenceMode: context.referenceMode,
        ...context.definitionDigest === void 0 ? {} : {
          definitionDigest: context.definitionDigest
        },
        ...context.sourceRevisionId === void 0 ? {} : {
          sourceRevisionId: context.sourceRevisionId
        }
      };
      let response;
      try {
        response = await provider.resolve(request);
      } catch (error) {
        return fail("PROVIDER_FAILURE", error instanceof Error ? error.message : "Provider resolve\u304C\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      }
      if (!response || typeof response !== "object") return fail("PROVIDER_RESPONSE_INVALID", "Provider resolve response\u304C\u4E0D\u6B63\u3067\u3059\u3002");
      if (!response.ok) return mapProviderFailure(response);
      if (!validateRegisteredAssetIdentity(response.identity)) return fail("PROVIDER_RESPONSE_INVALID", "Provider\u304C\u4E0D\u6B63\u306AResolved Asset identity\u3092\u8FD4\u3057\u307E\u3057\u305F\u3002");
      const identityFailure = identityMatchesContext(response.identity, assetIdInput, context);
      return identityFailure === void 0 ? {
        ok: true,
        value: response.identity
      } : identityFailure;
    }
  };
}

// pixiedraw2/src/platform/site-400/server-authorized-registry-provider.ts
var SITE400_RESOURCE_TYPE = "REGISTERED_ASSET";
var SITE400_RECORD_SCHEMA_VERSION = 1;
var SITE400_PROVIDER_SOURCE = "SITE400_SERVER_COMPOSITION_ROOT";
var SAFE_ID2 = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
var SHA2563 = /^[a-f0-9]{64}$/u;
var CANONICAL_RECORD_REF_SCHEMA_VERSION = "CANONICAL_RECORD_REF_V2";
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isSafeId2(value) {
  return typeof value === "string" && SAFE_ID2.test(value);
}
function isSha2562(value) {
  return typeof value === "string" && SHA2563.test(value);
}
function failure(code, message) {
  return {
    ok: false,
    code,
    message
  };
}
function validateRequest(value) {
  if (!isRecord3(value)) return false;
  const allowed = /* @__PURE__ */ new Set([
    "requestId",
    "sessionReference",
    "correlationId",
    "assetId",
    "projectId",
    "requestedTenantId"
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  return isSafeId2(value.requestId) && isSafeId2(value.sessionReference) && isSafeId2(value.correlationId) && isSafeId2(value.assetId) && isSafeId2(value.projectId) && (value.requestedTenantId === void 0 || isSafeId2(value.requestedTenantId));
}
function validateCanonicalRecord(value, tenantId, assetId) {
  if (!isRecord3(value)) return false;
  const keys = [
    "schemaVersion",
    "tenantId",
    "identity"
  ];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
  if (value.schemaVersion !== SITE400_RECORD_SCHEMA_VERSION || value.tenantId !== tenantId || !isRegisteredAssetIdentity(value.identity)) return false;
  return value.identity.status === REGISTERED_ASSET_STATUS && value.identity.assetId === assetId;
}
function validateCanonicalEnvelope(value, tenantId, assetId) {
  if (!isRecord3(value) || !isRecord3(value.ref)) return false;
  const ref = value.ref;
  if (ref.schemaVersion !== CANONICAL_RECORD_REF_SCHEMA_VERSION || ref.resourceType !== SITE400_RESOURCE_TYPE || ref.resourceId !== assetId || ref.tenantId !== tenantId || ref.origin !== "SERVER_REGISTRY" || !isSafeId2(ref.revision) || !isSha2562(ref.canonicalHash)) return false;
  return validateCanonicalRecord(value.record, tenantId, assetId);
}
function createResolveProvider(identity) {
  return Object.freeze({
    register() {
      return {
        ok: false,
        code: "REGISTER_NOT_SUPPORTED",
        message: "SITE-400\u306EResolve\u7D4C\u8DEF\u304B\u3089Asset\u767B\u9332\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\u3002"
      };
    },
    resolve(request) {
      if (request.assetId !== identity.assetId || request.projectId !== identity.projectId || request.sourcePxdId !== identity.sourcePxdId || request.definitionId !== identity.definitionId || request.ownerId !== identity.ownerId || request.referenceMode !== identity.referenceMode) {
        return {
          ok: false,
          code: "SERVER_CONTEXT_MISMATCH",
          message: "Server Registry identity\u3068Resolve context\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002"
        };
      }
      if (identity.referenceMode === "PINNED" && (request.sourceRevisionId !== identity.sourceRevisionId || request.definitionDigest !== identity.definitionDigest)) {
        return {
          ok: false,
          code: "PINNED_CONTEXT_MISMATCH",
          message: "PINNED Asset\u306ERevision\uFF0FDigest\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002"
        };
      }
      return {
        ok: true,
        identity
      };
    }
  });
}
function bridgeContextFor(identity) {
  return {
    projectId: identity.projectId,
    sourcePxdId: identity.sourcePxdId,
    definitionId: identity.definitionId,
    ownerId: identity.ownerId,
    referenceMode: identity.referenceMode,
    ...identity.referenceMode === "PINNED" ? {
      sourceRevisionId: identity.sourceRevisionId,
      definitionDigest: identity.definitionDigest
    } : {
      definitionDigest: identity.definitionDigest
    }
  };
}
function createSite400ServerComposition(dependencies) {
  if (dependencies === null || typeof dependencies !== "object" || dependencies.registry === null || dependencies.authProvider === null || dependencies.tenantResolver === null) throw new Error("SITE400_SERVER_COMPOSITION_DEPENDENCIES_REQUIRED");
  const authProvider = dependencies.authProvider;
  const tenantResolver = dependencies.tenantResolver;
  const registry = dependencies.registry;
  return Object.freeze({
    async resolveRegisteredAsset(requestInput) {
      if (!validateRequest(requestInput)) {
        return failure("INVALID_REQUEST", "SITE-400 Resolve request\u304C\u4E0D\u6B63\u3067\u3059\u3002");
      }
      const request = requestInput;
      const authorityContext = await deriveServerAuthorityRequestContext({
        authProvider,
        tenantResolver,
        request: {
          requestId: request.requestId,
          resourceType: SITE400_RESOURCE_TYPE,
          resourceId: request.assetId,
          sessionReference: request.sessionReference,
          correlationId: request.correlationId,
          ...request.requestedTenantId === void 0 ? {} : {
            requestedTenantId: request.requestedTenantId
          }
        }
      });
      if (authorityContext === null) {
        return failure("AUTHORITY_DENIED", "\u8A8D\u8A3C\u6E08\u307FServer Authority\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3002");
      }
      const consumed = await consumeServerAuthorityRequestContext(authorityContext, {
        resourceType: SITE400_RESOURCE_TYPE,
        resourceId: request.assetId,
        membershipRegistry: registry.membershipRegistry
      });
      if (!consumed) {
        return failure("AUTHORITY_CONTEXT_STALE", "Membership\u307E\u305F\u306FServer Authority Context\u304C\u6709\u52B9\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002");
      }
      let envelope2;
      try {
        envelope2 = await registry.getCurrent(authorityContext.tenantContext, SITE400_RESOURCE_TYPE, request.assetId);
      } catch {
        return failure("PROVIDER_UNAVAILABLE", "Canonical Registry Provider\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002");
      }
      if (envelope2 === null) {
        return failure("UNKNOWN_ASSET", "REGISTERED_ASSET\u304CCanonical Registry\u306B\u5B58\u5728\u3057\u307E\u305B\u3093\u3002");
      }
      if (!validateCanonicalEnvelope(envelope2, authorityContext.tenantContext.tenantId, request.assetId)) {
        return failure("CANONICAL_RECORD_INVALID", "Canonical Registry record\u304C\u4E0D\u6B63\u3067\u3059\u3002");
      }
      const identity = envelope2.record.identity;
      if (identity.ownerId !== authorityContext.principalId) {
        return failure("OWNER_MISMATCH", "Asset owner\u304CServer Principal\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
      }
      if (identity.projectId !== request.projectId) {
        return failure("PROJECT_MISMATCH", "Asset Project\u304CResolve request\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
      }
      if (envelope2.ref.tenantId !== authorityContext.tenantContext.tenantId) {
        return failure("TENANT_MISMATCH", "Asset Tenant\u304CServer Tenant\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
      }
      const bridge = createAssetRegistryBridge(createResolveProvider(identity));
      const resolved = await bridge.resolve(identity.assetId, bridgeContextFor(identity));
      if (!resolved.ok) {
        return failure("REGISTRY_BRIDGE_REJECTED", resolved.message);
      }
      return {
        ok: true,
        value: {
          identity: resolved.value,
          tenantId: authorityContext.tenantContext.tenantId,
          registryRevision: envelope2.ref.revision,
          resolvedBy: SITE400_PROVIDER_SOURCE
        }
      };
    }
  });
}

// pixiedraw2/src/platform/site-400/local-route.ts
var mountedHosts = /* @__PURE__ */ new WeakMap();
function statusElement(host) {
  const existing = host.querySelector("[data-site400-local-status]");
  if (existing !== null) return existing;
  const output = host.ownerDocument.createElement("output");
  output.dataset.site400LocalStatus = "true";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  host.append(output);
  return output;
}
function showStatus(output, status, message) {
  output.dataset.site400Status = status;
  output.textContent = message;
}
function onceResult(host, result) {
  const promise = Promise.resolve(Object.freeze(result));
  mountedHosts.set(host, promise);
  return promise;
}
function mountSite400LocalRoute(options) {
  const existing = mountedHosts.get(options.host);
  if (existing !== void 0) return existing;
  const output = statusElement(options.host);
  options.host.dataset.site400LocalRoute = "isolated";
  if (options.featureFlag === "off") {
    showStatus(output, "OFF", "SITE-400 is unavailable (feature flag OFF).");
    return onceResult(options.host, {
      mounted: false,
      status: "OFF"
    });
  }
  if (options.featureFlag === "unknown") {
    showStatus(output, "UNKNOWN_FLAG", "SITE-400 is unavailable (unknown flag).");
    return onceResult(options.host, {
      mounted: false,
      status: "UNKNOWN_FLAG"
    });
  }
  const promise = (async () => {
    showStatus(output, "LOADING", "SITE-400 local route loading\u2026");
    try {
      const entry = await options.lazyEntry.load();
      const resolved = await options.resolveRegisteredAsset(options.request);
      if (!resolved.ok) {
        showStatus(output, "DENIED", `SITE-400 denied: ${resolved.code}.`);
        return Object.freeze({
          mounted: true,
          status: "DENIED",
          moduleId: entry.moduleId,
          reason: resolved.code
        });
      }
      showStatus(output, "RESOLVED", `SITE-400 resolved ${resolved.value.identity.assetId} \xB7 ${resolved.value.registryRevision}`);
      options.host.dataset.site400ResolvedAsset = resolved.value.identity.assetId;
      options.host.dataset.site400ResolvedTenant = resolved.value.tenantId;
      options.host.dataset.site400RegistryRevision = resolved.value.registryRevision;
      return Object.freeze({
        mounted: true,
        status: "RESOLVED",
        moduleId: entry.moduleId,
        assetId: resolved.value.identity.assetId,
        tenantId: resolved.value.tenantId,
        registryRevision: resolved.value.registryRevision
      });
    } catch (cause) {
      showStatus(output, "ERROR", "SITE-400 local route failed closed.");
      return Object.freeze({
        mounted: true,
        status: "ERROR",
        reason: cause instanceof Error ? cause.name : "UNKNOWN_ERROR"
      });
    }
  })();
  mountedHosts.set(options.host, promise);
  return promise;
}

// pixiedraw2/src/platform/site-400/local-browser-entry.ts
var TENANT_ID = "tenant:site400-local";
var PRINCIPAL_ID = "principal:site400-local";
var PROJECT_ID = "project:site400-local";
var SESSION_REFERENCE = "session:site400-local";
var ASSET_ID = "asset:site400-local-hero";
var SOURCE_PXD_ID = "pxd:site400-local";
var DEFINITION_ID = "definition:site400-local";
var DIGEST = "b".repeat(64);
var membership = Object.freeze({
  membershipId: `membership:${PRINCIPAL_ID}:${TENANT_ID}`,
  principalId: PRINCIPAL_ID,
  tenantId: TENANT_ID,
  membershipRevision: "membership:site400-local:v1",
  status: "ACTIVE"
});
var tenantContext = Object.freeze({
  schemaVersion: "SERVER_TENANT_CONTEXT_V1",
  tenantId: TENANT_ID,
  principalId: PRINCIPAL_ID,
  source: "SERVER_REGISTRY"
});
var record = Object.freeze({
  schemaVersion: 1,
  tenantId: TENANT_ID,
  identity: Object.freeze({
    schemaVersion: 1,
    status: "REGISTERED_ASSET",
    assetId: ASSET_ID,
    projectId: PROJECT_ID,
    sourcePxdId: SOURCE_PXD_ID,
    definitionId: DEFINITION_ID,
    ownerId: PRINCIPAL_ID,
    sourceRevisionId: "revision:site400-local:v1",
    definitionDigest: DIGEST,
    referenceMode: "LIVE"
  })
});
function proof() {
  const issuedAt = new Date(Date.now() - 3e4).toISOString();
  const expiresAt = new Date(Date.now() + 4 * 6e4).toISOString();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "site400-local-server-fixture",
    proofId: `proof:${SESSION_REFERENCE}`,
    principalId: PRINCIPAL_ID,
    resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
    resourceId: `auth-session:${SESSION_REFERENCE}`,
    action: "server.authority.context.create",
    capability: "server.authority.context.create",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: `grant:${SESSION_REFERENCE}`,
    tenantId: null,
    correlationId: `auth-correlation:${SESSION_REFERENCE}`,
    issuedAt,
    expiresAt
  };
}
var LocalMembershipRegistry = class {
  async getCurrent(input) {
    if (input.principalId !== membership.principalId || input.membershipId !== membership.membershipId || input.tenantId !== membership.tenantId) return null;
    return membership;
  }
};
var LocalAuthAdapter = class {
  async verify(input) {
    if (input.sessionReference !== SESSION_REFERENCE) return null;
    const issuedAt = new Date(Date.now() - 3e4).toISOString();
    const expiresAt = new Date(Date.now() + 4 * 6e4).toISOString();
    return Object.freeze({
      principalId: PRINCIPAL_ID,
      authSessionId: `auth-session:${SESSION_REFERENCE}`,
      assurance: "SESSION_VERIFIED",
      tenantMemberships: Object.freeze([
        membership
      ]),
      authorizationProof: proof(),
      issuedAt,
      expiresAt,
      correlationId: `auth-correlation:${SESSION_REFERENCE}`
    });
  }
};
function envelope() {
  return Object.freeze({
    ref: Object.freeze({
      schemaVersion: "CANONICAL_RECORD_REF_V2",
      resourceType: "REGISTERED_ASSET",
      resourceId: ASSET_ID,
      tenantId: TENANT_ID,
      revision: "registered-asset:site400-local:v1",
      canonicalHash: asSha256("c".repeat(64)),
      origin: "SERVER_REGISTRY"
    }),
    record
  });
}
function createLocalComposition() {
  const membershipRegistry = new LocalMembershipRegistry();
  const registry = {
    membershipRegistry,
    async getCurrent(context, resourceType, resourceId) {
      if (context.tenantId !== TENANT_ID || resourceType !== "REGISTERED_ASSET" || resourceId !== ASSET_ID) return null;
      return envelope();
    }
  };
  const tenantResolver = {
    membershipRegistry,
    async resolve(input) {
      if (input.resourceType !== "REGISTERED_ASSET" || input.resourceId !== ASSET_ID || input.principal.principalId !== PRINCIPAL_ID || input.requestedTenantId !== void 0 && input.requestedTenantId !== TENANT_ID) return null;
      return membership;
    }
  };
  return createSite400ServerComposition({
    registry,
    authProvider: createServerAuthPrincipalProvider(new LocalAuthAdapter()),
    tenantResolver
  });
}
function mountSite400BrowserEntry(options) {
  const composition = createLocalComposition();
  const request = Object.freeze({
    requestId: "http:site400-local:1",
    sessionReference: SESSION_REFERENCE,
    correlationId: "correlation:site400-local:1",
    assetId: ASSET_ID,
    projectId: PROJECT_ID,
    requestedTenantId: TENANT_ID
  });
  return mountSite400LocalRoute({
    host: options.host,
    featureFlag: options.featureFlag ?? "on",
    lazyEntry: createSite400LazyEntry(),
    request,
    resolveRegisteredAsset: composition.resolveRegisteredAsset
  });
}
export {
  mountSite400BrowserEntry
};
