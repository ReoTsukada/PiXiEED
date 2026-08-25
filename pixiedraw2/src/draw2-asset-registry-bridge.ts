/**
 * Draw2 Asset Registry Bridge.
 *
 * This is a host-neutral boundary between a validated PXD Asset Definition and
 * an external Registry identity. It is intentionally unloaded from the current
 * production route. A real server provider is a later SITE-400 responsibility.
 *
 * The bridge carries references, identity, and a definition digest only. It
 * never carries pixels, raster buffers, blobs, base64, or a complete PXD.
 */

import {
  type AssetDefinitionDraftInput,
  type ValidatedAssetDefinition,
  createAssetDefinitionDraft,
  validateAssetDefinitionDraft,
} from "./draw2-creator-workspace.ts";
import { canonicalJson, sha256Hex } from "./draw2-core.ts";

export const DRAW2_REGISTRY_BRIDGE_SCHEMA_VERSION = 1 as const;
export const REGISTERED_ASSET_STATUS = "REGISTERED_ASSET" as const;

export const REGISTRY_BRIDGE_REFERENCE_MODES = ["LIVE", "PINNED", "REVIEW", "FORKED"] as const;
export type RegistryBridgeReferenceMode = typeof REGISTRY_BRIDGE_REFERENCE_MODES[number];

export const REGISTRY_BRIDGE_CONSUMERS = ["GAME", "AUDIO", "MARKET", "CROSS_PROJECT"] as const;
export type RegistryBridgeConsumer = typeof REGISTRY_BRIDGE_CONSUMERS[number];

export type RegistryBridgeErrorCode =
  | "LOCAL_DRAFT_NOT_REGISTERABLE"
  | "INVALID_ASSET_DEFINITION"
  | "INVALID_REGISTRATION_CONTEXT"
  | "REFERENCE_POLICY_MISMATCH"
  | "PINNED_REVISION_REQUIRED"
  | "INVALID_ASSET_ID"
  | "UNRESOLVED_SOURCE_DEFINITION"
  | "PROVIDER_REJECTED"
  | "PROVIDER_FAILURE"
  | "PROVIDER_RESPONSE_INVALID"
  | "IDENTITY_CONFLICT"
  | "CONSUMER_NOT_ELIGIBLE";

export interface RegistryBridgeFailure {
  readonly ok: false;
  readonly code: RegistryBridgeErrorCode;
  readonly message: string;
  readonly providerCode?: string;
}

export type RegistryBridgeResult<T> = { readonly ok: true; readonly value: T } | RegistryBridgeFailure;

export interface RegistryBridgeRegistrationContext {
  readonly projectId: string;
  readonly sourcePxdId: string;
  readonly definitionId: string;
  readonly ownerId: string;
  readonly referenceMode: RegistryBridgeReferenceMode;
  readonly sourceRevisionId?: string;
}

export interface RegistryBridgeResolveContext extends RegistryBridgeRegistrationContext {
  readonly definitionDigest?: string;
}

export interface RegisteredAssetIdentity {
  readonly schemaVersion: 1;
  readonly status: "REGISTERED_ASSET";
  readonly assetId: string;
  readonly projectId: string;
  readonly sourcePxdId: string;
  readonly definitionId: string;
  readonly ownerId: string;
  readonly sourceRevisionId: string;
  readonly definitionDigest: string;
  readonly referenceMode: RegistryBridgeReferenceMode;
}

interface ProviderRequestBase {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly sourcePxdId: string;
  readonly definitionId: string;
  readonly ownerId: string;
  readonly referenceMode: RegistryBridgeReferenceMode;
}

export interface RegistryBridgeProviderRegisterRequest extends ProviderRequestBase {
  readonly definitionDigest: string;
  readonly sourceRevisionId?: string;
}

export interface RegistryBridgeProviderResolveRequest extends ProviderRequestBase {
  readonly assetId: string;
  readonly definitionDigest?: string;
  readonly sourceRevisionId?: string;
}

export type RegistryBridgeProviderResponse =
  | { readonly ok: true; readonly identity: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Provider authority is injected; caller-provided trusted/allowed booleans are not accepted. */
export interface RegistryBridgeProvider {
  readonly register: (
    request: RegistryBridgeProviderRegisterRequest,
  ) => RegistryBridgeProviderResponse | Promise<RegistryBridgeProviderResponse>;
  readonly resolve: (
    request: RegistryBridgeProviderResolveRequest,
  ) => RegistryBridgeProviderResponse | Promise<RegistryBridgeProviderResponse>;
}

export interface AssetRegistryBridge {
  readonly register: (
    definition: unknown,
    context: RegistryBridgeRegistrationContext,
  ) => Promise<RegistryBridgeResult<RegisteredAssetIdentity>>;
  readonly resolve: (
    assetId: string,
    context: RegistryBridgeResolveContext,
  ) => Promise<RegistryBridgeResult<RegisteredAssetIdentity>>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const VALIDATED_DEFINITION_KEYS = new Set([
  "schemaVersion", "sourceProjectId", "sourceCanvasId", "sourceKind", "sourceLayerIds",
  "frameStart", "frameEnd", "layerSelection", "frameSelection", "region", "animationMapping",
  "assetKind", "pivot", "pivotDefinition", "protection", "metadata", "dependencyIds", "persistence",
]);
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "pixel", "pixels", "pixelData", "raster", "blob", "dataUrl", "base64", "rgba", "indexedBytes",
  "payload", "bytes", "buffer", "imageData", "audioData",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function isReferenceMode(value: unknown): value is RegistryBridgeReferenceMode {
  return (REGISTRY_BRIDGE_REFERENCE_MODES as readonly unknown[]).includes(value);
}

function fail(code: RegistryBridgeErrorCode, message: string, providerCode?: string): RegistryBridgeFailure {
  return providerCode === undefined ? { ok: false, code, message } : { ok: false, code, message, providerCode };
}

function containsForbiddenPayload(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 12) return true;
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenPayload(entry, seen, depth + 1));
  return Object.entries(value).some(([key, entry]) => FORBIDDEN_PAYLOAD_KEYS.has(key) || containsForbiddenPayload(entry, seen, depth + 1));
}

function normalizeValidatedDefinition(value: unknown): RegistryBridgeResult<ValidatedAssetDefinition> {
  if (!isRecord(value) || value.persistence !== "VALIDATED_DEFINITION") {
    return fail(
      isRecord(value) && value.persistence === "LOCAL_DRAFT" ? "LOCAL_DRAFT_NOT_REGISTERABLE" : "INVALID_ASSET_DEFINITION",
      "Registry BridgeはVALIDATED_DEFINITIONだけを受け付けます。",
    );
  }
  if (value.schemaVersion !== 1) return fail("INVALID_ASSET_DEFINITION", "Asset DefinitionのSchema Versionが未対応です。");
  if (Object.keys(value).some((key) => !VALIDATED_DEFINITION_KEYS.has(key))) return fail("INVALID_ASSET_DEFINITION", "Asset Definitionに未許可のデータが含まれています。");
  if (containsForbiddenPayload(value)) return fail("INVALID_ASSET_DEFINITION", "Asset DefinitionにPixel／Blobデータを含められません。");
  if (
    typeof value.sourceProjectId !== "string"
    || typeof value.sourceCanvasId !== "string"
    || typeof value.sourceKind !== "string"
    || typeof value.assetKind !== "string"
    || typeof value.pivot !== "string"
    || !Array.isArray(value.sourceLayerIds)
    || !value.sourceLayerIds.every((entry) => typeof entry === "string")
    || !Number.isSafeInteger(value.frameStart)
    || !Number.isSafeInteger(value.frameEnd)
    || !isRecord(value.layerSelection)
    || !isRecord(value.frameSelection)
    || !isRecord(value.region)
    || !Array.isArray(value.animationMapping)
    || !isRecord(value.pivotDefinition)
    || !isRecord(value.protection)
    || !isRecord(value.metadata)
    || !Array.isArray(value.dependencyIds)
    || !value.dependencyIds.every((entry) => typeof entry === "string")
  ) return fail("INVALID_ASSET_DEFINITION", "Asset Definitionの実行時型が不正です。");
  if (value.sourceKind === "SELECTED_LAYERS" && (!Array.isArray(value.sourceLayerIds) || value.sourceLayerIds.length === 0)) return fail("INVALID_ASSET_DEFINITION", "SELECTED_LAYERSにはsourceLayerIdsが必要です。");
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
      dependencyIds: value.dependencyIds,
    } as unknown as AssetDefinitionDraftInput;
    const draft = createAssetDefinitionDraft(input);
    if (!draft.ok) return fail("INVALID_ASSET_DEFINITION", draft.message);
    const validated = validateAssetDefinitionDraft(draft.value);
    if (!validated.ok) return fail("INVALID_ASSET_DEFINITION", validated.message);
    return { ok: true, value: validated.value };
  } catch (error) {
    return fail("INVALID_ASSET_DEFINITION", error instanceof Error ? error.message : "Asset Definitionの検証に失敗しました。");
  }
}

function validateRegistrationContext(
  context: unknown,
  definition?: ValidatedAssetDefinition,
): RegistryBridgeResult<RegistryBridgeRegistrationContext | RegistryBridgeResolveContext> {
  if (!isRecord(context)) return fail("INVALID_REGISTRATION_CONTEXT", "Registry contextが不正です。");
  for (const key of ["projectId", "sourcePxdId", "definitionId", "ownerId"] as const) {
    if (!isSafeId(context[key])) return fail("INVALID_REGISTRATION_CONTEXT", `${key}が不正です。`);
  }
  if (!isReferenceMode(context.referenceMode)) return fail("INVALID_REGISTRATION_CONTEXT", "referenceModeが不正です。");
  if (context.sourceRevisionId !== undefined && !isSafeId(context.sourceRevisionId)) return fail("INVALID_REGISTRATION_CONTEXT", "sourceRevisionIdが不正です。");
  if (context.definitionDigest !== undefined && !isSha256(context.definitionDigest)) return fail("INVALID_REGISTRATION_CONTEXT", "definitionDigestが不正です。");
  if (context.referenceMode === "PINNED" && context.sourceRevisionId === undefined) return fail("PINNED_REVISION_REQUIRED", "PINNED登録にはsourceRevisionIdが必要です。");
  if (context.referenceMode === "LIVE" && context.sourceRevisionId !== undefined) return fail("INVALID_REGISTRATION_CONTEXT", "LIVE登録はsourceRevisionIdを指定できません。");
  if (definition !== undefined) {
    if (context.projectId !== definition.sourceProjectId) return fail("INVALID_REGISTRATION_CONTEXT", "Project IDがAsset Definitionと一致しません。");
    if (context.referenceMode !== definition.protection.referencePolicy) return fail("REFERENCE_POLICY_MISMATCH", "referenceModeがAsset DefinitionのPolicyと一致しません。");
  }
  return { ok: true, value: context as unknown as RegistryBridgeRegistrationContext | RegistryBridgeResolveContext };
}

function validateAssetId(assetId: unknown): RegistryBridgeFailure | undefined {
  return isSafeId(assetId) ? undefined : fail("INVALID_ASSET_ID", "assetIdが不正です。");
}

function identityMatchesContext(
  identity: RegisteredAssetIdentity,
  assetId: string | undefined,
  context: RegistryBridgeRegistrationContext | RegistryBridgeResolveContext,
  digest?: string,
): RegistryBridgeFailure | undefined {
  if (assetId !== undefined && identity.assetId !== assetId) return fail("IDENTITY_CONFLICT", "Providerが別のAsset IDを返しました。");
  if (identity.projectId !== context.projectId || identity.sourcePxdId !== context.sourcePxdId || identity.definitionId !== context.definitionId || identity.ownerId !== context.ownerId || identity.referenceMode !== context.referenceMode) return fail("IDENTITY_CONFLICT", "ProviderのAsset identityが要求Contextと一致しません。");
  if (digest !== undefined && identity.definitionDigest !== digest) return fail("IDENTITY_CONFLICT", "ProviderのdefinitionDigestが一致しません。");
  if (context.referenceMode === "PINNED") {
    if (identity.sourceRevisionId !== context.sourceRevisionId) return fail("IDENTITY_CONFLICT", "PINNEDのsourceRevisionIdが一致しません。");
    if ("definitionDigest" in context && context.definitionDigest !== undefined && identity.definitionDigest !== context.definitionDigest) return fail("IDENTITY_CONFLICT", "PINNEDのdefinitionDigestが一致しません。");
  }
  return undefined;
}

function mapProviderFailure(response: RegistryBridgeProviderResponse): RegistryBridgeFailure {
  if (response.ok) return fail("PROVIDER_RESPONSE_INVALID", "Provider responseが不正です。");
  const unresolvedCodes = new Set(["SOURCE_NOT_FOUND", "DEFINITION_NOT_FOUND", "UNKNOWN_ASSET"]);
  return fail(unresolvedCodes.has(response.code) ? "UNRESOLVED_SOURCE_DEFINITION" : "PROVIDER_REJECTED", response.message, response.code);
}

function validateRegisteredAssetIdentity(value: unknown): value is RegisteredAssetIdentity {
  if (!isRecord(value)) return false;
  const keys = ["schemaVersion", "status", "assetId", "projectId", "sourcePxdId", "definitionId", "ownerId", "sourceRevisionId", "definitionDigest", "referenceMode"];
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && value.schemaVersion === 1
    && value.status === REGISTERED_ASSET_STATUS
    && isSafeId(value.assetId)
    && isSafeId(value.projectId)
    && isSafeId(value.sourcePxdId)
    && isSafeId(value.definitionId)
    && isSafeId(value.ownerId)
    && isSafeId(value.sourceRevisionId)
    && isSha256(value.definitionDigest)
    && isReferenceMode(value.referenceMode);
}

export function isRegisteredAssetIdentity(value: unknown): value is RegisteredAssetIdentity {
  return validateRegisteredAssetIdentity(value);
}

export function canConsumeRegisteredAsset(identity: unknown, consumer: RegistryBridgeConsumer): boolean {
  return (REGISTRY_BRIDGE_CONSUMERS as readonly unknown[]).includes(consumer) && validateRegisteredAssetIdentity(identity);
}

export async function calculateAssetDefinitionDigest(definition: unknown): Promise<RegistryBridgeResult<string>> {
  const normalized = normalizeValidatedDefinition(definition);
  if (!normalized.ok) return normalized;
  return { ok: true, value: await sha256Hex(canonicalJson(normalized.value)) };
}

export function createAssetRegistryBridge(provider: RegistryBridgeProvider): AssetRegistryBridge {
  if (provider === null || typeof provider !== "object" || typeof provider.register !== "function" || typeof provider.resolve !== "function") throw new Error("Registry Bridge requires an injected provider adapter.");
  return {
    async register(definitionInput, contextInput) {
      const normalized = normalizeValidatedDefinition(definitionInput);
      if (!normalized.ok) return normalized;
      const contextResult = validateRegistrationContext(contextInput, normalized.value);
      if (!contextResult.ok) return contextResult;
      const context = contextResult.value as RegistryBridgeRegistrationContext;
      const digest = await calculateAssetDefinitionDigest(normalized.value);
      if (!digest.ok) return digest;
      const request: RegistryBridgeProviderRegisterRequest = {
        schemaVersion: 1,
        projectId: context.projectId,
        sourcePxdId: context.sourcePxdId,
        definitionId: context.definitionId,
        ownerId: context.ownerId,
        referenceMode: context.referenceMode,
        definitionDigest: digest.value,
        ...(context.sourceRevisionId === undefined ? {} : { sourceRevisionId: context.sourceRevisionId }),
      };
      let response: RegistryBridgeProviderResponse;
      try {
        response = await provider.register(request);
      } catch (error) {
        return fail("PROVIDER_FAILURE", error instanceof Error ? error.message : "Provider registerが失敗しました。");
      }
      if (!response || typeof response !== "object") return fail("PROVIDER_RESPONSE_INVALID", "Provider register responseが不正です。");
      if (!response.ok) return mapProviderFailure(response);
      if (!validateRegisteredAssetIdentity(response.identity)) return fail("PROVIDER_RESPONSE_INVALID", "Providerが不正なRegistered Asset identityを返しました。");
      const identityFailure = identityMatchesContext(response.identity, undefined, context, digest.value);
      return identityFailure === undefined ? { ok: true, value: response.identity } : identityFailure;
    },
    async resolve(assetIdInput, contextInput) {
      const assetIdFailure = validateAssetId(assetIdInput);
      if (assetIdFailure !== undefined) return assetIdFailure;
      const contextResult = validateRegistrationContext(contextInput);
      if (!contextResult.ok) return contextResult;
      const context = contextResult.value as RegistryBridgeResolveContext;
      if (context.referenceMode === "PINNED" && context.definitionDigest === undefined) return fail("INVALID_REGISTRATION_CONTEXT", "PINNED resolveにはdefinitionDigestが必要です。");
      const request: RegistryBridgeProviderResolveRequest = {
        schemaVersion: 1,
        assetId: assetIdInput,
        projectId: context.projectId,
        sourcePxdId: context.sourcePxdId,
        definitionId: context.definitionId,
        ownerId: context.ownerId,
        referenceMode: context.referenceMode,
        ...(context.definitionDigest === undefined ? {} : { definitionDigest: context.definitionDigest }),
        ...(context.sourceRevisionId === undefined ? {} : { sourceRevisionId: context.sourceRevisionId }),
      };
      let response: RegistryBridgeProviderResponse;
      try {
        response = await provider.resolve(request);
      } catch (error) {
        return fail("PROVIDER_FAILURE", error instanceof Error ? error.message : "Provider resolveが失敗しました。");
      }
      if (!response || typeof response !== "object") return fail("PROVIDER_RESPONSE_INVALID", "Provider resolve responseが不正です。");
      if (!response.ok) return mapProviderFailure(response);
      if (!validateRegisteredAssetIdentity(response.identity)) return fail("PROVIDER_RESPONSE_INVALID", "Providerが不正なResolved Asset identityを返しました。");
      const identityFailure = identityMatchesContext(response.identity, assetIdInput, context);
      return identityFailure === undefined ? { ok: true, value: response.identity } : identityFailure;
    },
  };
}

export interface TestOnlyRegistrySource {
  readonly projectId: string;
  readonly sourcePxdId: string;
  readonly definitionId: string;
  readonly ownerId: string;
  readonly sourceRevisionId: string;
  readonly definitionDigest: string;
  readonly assetId?: string;
}

export type TestOnlyProviderFailureMode = "NONE" | "REGISTER" | "RESOLVE";

export interface TestOnlyRegistryBridgeProvider extends RegistryBridgeProvider {
  readonly testOnly: true;
  readonly setFailureMode: (mode: TestOnlyProviderFailureMode) => void;
  readonly updateSource: (sourcePxdId: string, definitionId: string, patch: Partial<Pick<TestOnlyRegistrySource, "sourceRevisionId" | "definitionDigest">>) => void;
  readonly removeSource: (sourcePxdId: string, definitionId: string) => void;
}

function sourceKey(sourcePxdId: string, definitionId: string): string {
  return `${sourcePxdId}\u0000${definitionId}`;
}

/** TEST_ONLY in-memory provider; this is not SITE-400, a database, Storage, or production auth. */
export function createTestOnlyRegistryBridgeProvider(sources: readonly TestOnlyRegistrySource[]): TestOnlyRegistryBridgeProvider {
  const sourceMap = new Map(sources.map((source) => [sourceKey(source.sourcePxdId, source.definitionId), { ...source }]));
  const registered = new Map<string, RegisteredAssetIdentity>();
  let failureMode: TestOnlyProviderFailureMode = "NONE";
  const provider: TestOnlyRegistryBridgeProvider = {
    testOnly: true,
    setFailureMode(mode) { failureMode = mode; },
    updateSource(sourcePxdId, definitionId, patch) {
      const key = sourceKey(sourcePxdId, definitionId);
      const source = sourceMap.get(key);
      if (source === undefined) throw new Error("TEST_ONLY source does not exist.");
      sourceMap.set(key, { ...source, ...patch });
    },
    removeSource(sourcePxdId, definitionId) { sourceMap.delete(sourceKey(sourcePxdId, definitionId)); },
    async register(request) {
      if (failureMode === "REGISTER") return { ok: false, code: "PROVIDER_UNAVAILABLE", message: "TEST_ONLY register failure." };
      const source = sourceMap.get(sourceKey(request.sourcePxdId, request.definitionId));
      if (source === undefined) return { ok: false, code: "SOURCE_NOT_FOUND", message: "Source PXD definition is unavailable." };
      if (source.projectId !== request.projectId || source.ownerId !== request.ownerId) return { ok: false, code: "CONTEXT_MISMATCH", message: "Source ownership or Project context does not match." };
      if (source.definitionDigest !== request.definitionDigest) return { ok: false, code: "DEFINITION_DIGEST_MISMATCH", message: "Source definition digest does not match." };
      if (request.referenceMode === "PINNED" && request.sourceRevisionId !== source.sourceRevisionId) return { ok: false, code: "PINNED_REVISION_MISMATCH", message: "Requested PINNED revision is unavailable." };
      const assetId = source.assetId ?? `asset-${request.definitionId}`;
      const prior = registered.get(assetId);
      if (prior !== undefined && (prior.projectId !== request.projectId || prior.sourcePxdId !== request.sourcePxdId || prior.definitionId !== request.definitionId)) return { ok: false, code: "ASSET_ID_CONFLICT", message: "Stable Asset ID is already bound to another source." };
      if (prior !== undefined && prior.referenceMode !== request.referenceMode) return { ok: false, code: "REFERENCE_MODE_CONFLICT", message: "Reference mode changes require an explicit policy operation." };
      const identity: RegisteredAssetIdentity = {
        schemaVersion: 1,
        status: REGISTERED_ASSET_STATUS,
        assetId,
        projectId: request.projectId,
        sourcePxdId: request.sourcePxdId,
        definitionId: request.definitionId,
        ownerId: request.ownerId,
        sourceRevisionId: request.referenceMode === "PINNED" ? prior?.sourceRevisionId ?? source.sourceRevisionId : source.sourceRevisionId,
        definitionDigest: request.referenceMode === "PINNED" ? prior?.definitionDigest ?? source.definitionDigest : source.definitionDigest,
        referenceMode: request.referenceMode,
      };
      registered.set(assetId, identity);
      return { ok: true, identity };
    },
    async resolve(request) {
      if (failureMode === "RESOLVE") return { ok: false, code: "PROVIDER_UNAVAILABLE", message: "TEST_ONLY resolve failure." };
      const prior = registered.get(request.assetId);
      if (prior === undefined) return { ok: false, code: "UNKNOWN_ASSET", message: "Registered Asset identity is unavailable." };
      if (prior.projectId !== request.projectId || prior.sourcePxdId !== request.sourcePxdId || prior.definitionId !== request.definitionId || prior.ownerId !== request.ownerId || prior.referenceMode !== request.referenceMode) return { ok: false, code: "CONTEXT_MISMATCH", message: "Resolve context does not match the registered identity." };
      const source = sourceMap.get(sourceKey(request.sourcePxdId, request.definitionId));
      if (source === undefined) return { ok: false, code: "SOURCE_NOT_FOUND", message: "Source PXD definition is unavailable." };
      if (prior.referenceMode === "PINNED" && (source.sourceRevisionId !== prior.sourceRevisionId || source.definitionDigest !== prior.definitionDigest)) return { ok: false, code: "PINNED_REVISION_UNAVAILABLE", message: "Pinned source revision is no longer available." };
      if (prior.referenceMode === "PINNED" && (request.sourceRevisionId !== prior.sourceRevisionId || request.definitionDigest !== prior.definitionDigest)) return { ok: false, code: "PINNED_CONTEXT_MISMATCH", message: "Pinned resolve context does not match the registered identity." };
      const identity: RegisteredAssetIdentity = prior.referenceMode === "LIVE" ? { ...prior, sourceRevisionId: source.sourceRevisionId, definitionDigest: source.definitionDigest } : prior;
      registered.set(request.assetId, identity);
      return { ok: true, identity };
    },
  };
  return provider;
}
