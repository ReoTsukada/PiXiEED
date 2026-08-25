/**
 * SITE-400 iGAME route composition.
 *
 * This adapter is host-neutral.  Project creation/loading, Registry
 * authorization, and successful metadata projection are all injected.  It
 * does not own a browser route, network client, or persistence mechanism.
 */

import type { Site400EntryModule } from "./entry.ts";
import type { Site400LazyEntry } from "./lazy-entry.ts";
import type {
  Site400ResolveRequestV1,
  Site400ResolveResult,
} from "./server-authorized-registry-provider.ts";

export type Site400IGameFeatureFlag = "off" | "on" | "unknown";
export type Site400IGameOperationType = "create" | "open" | "reload";

export type Site400IGameRegistryRequest = Omit<
  Site400ResolveRequestV1,
  "projectId"
>;

export interface Site400IGameProjectIdentity {
  readonly projectId: string;
  readonly ownerId: string;
  readonly tenantId: string;
  readonly revisionId: string;
}

export interface Site400IGameProjectRecord<TProject> {
  readonly project: TProject;
  readonly identity: Site400IGameProjectIdentity;
}

export interface Site400IGameProjectCreator<TProject, TCreateInput> {
  readonly create: (
    input: TCreateInput,
  ) => Promise<Site400IGameProjectRecord<TProject>>;
}

export interface Site400IGameProjectLoadRequest {
  readonly projectId: string;
  readonly acceptedRevisionId?: string;
}

export interface Site400IGameProjectLoader<TProject> {
  readonly load: (
    request: Site400IGameProjectLoadRequest,
  ) => Promise<Site400IGameProjectRecord<TProject> | null>;
}

export interface Site400IGameResolvedMetadata {
  readonly projectId: string;
  readonly ownerId: string;
  readonly tenantId: string;
  readonly acceptedRevisionId: string;
  readonly assetId: string;
  readonly assetRevisionId: string;
  readonly registryRevision: string;
}

export interface Site400IGameHostProjection {
  /** Called only after the server-authorized identity has been validated. */
  readonly projectResolvedMetadata: (
    metadata: Site400IGameResolvedMetadata,
  ) => void;
}

export type Site400IGameOperation<TCreateInput> =
  | {
    readonly operationId: string;
    readonly type: "create";
    readonly createInput: TCreateInput;
    readonly registryRequest: Site400IGameRegistryRequest;
  }
  | {
    readonly operationId: string;
    readonly type: "open";
    readonly projectId: string;
    readonly registryRequest: Site400IGameRegistryRequest;
  }
  | {
    readonly operationId: string;
    readonly type: "reload";
  };

export type Site400IGameRouteStatus =
  | "OFF"
  | "UNKNOWN_FLAG"
  | "READY"
  | "DENIED"
  | "ERROR";

export interface Site400IGameRouteResult<TProject> {
  readonly operationId: string;
  readonly type: Site400IGameOperationType;
  readonly status: Site400IGameRouteStatus;
  readonly sequence?: number;
  readonly moduleId?: Site400EntryModule["moduleId"];
  readonly project?: TProject;
  readonly metadata?: Site400IGameResolvedMetadata;
  readonly reason?: string;
}

export interface Site400IGameRouteOptions<TProject, TCreateInput> {
  readonly featureFlag: Site400IGameFeatureFlag;
  readonly lazyEntry: Site400LazyEntry;
  readonly creator: Site400IGameProjectCreator<TProject, TCreateInput>;
  readonly loader: Site400IGameProjectLoader<TProject>;
  readonly resolveRegisteredAsset: (
    request: Site400ResolveRequestV1,
  ) => Promise<Site400ResolveResult>;
  readonly host?: Site400IGameHostProjection;
}

export interface Site400IGameRouteController<TProject, TCreateInput> {
  dispatch(
    operation: Site400IGameOperation<TCreateInput>,
  ): Promise<Site400IGameRouteResult<TProject>>;
  setFeatureFlag(flag: Site400IGameFeatureFlag): void;
  currentProject(): Site400IGameProjectRecord<TProject> | undefined;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const OPERATION_TYPES = ["create", "open", "reload"] as const;

type Site400IGameOperationRecord<TProject, TCreateInput> = {
  readonly operation: Site400IGameOperation<TCreateInput>;
  readonly promise: Promise<Site400IGameRouteResult<TProject>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isProjectRecord<TProject>(
  value: unknown,
): value is Site400IGameProjectRecord<TProject> {
  if (
    !isRecord(value) || value.project === null || value.project === undefined
  ) {
    return false;
  }
  const identity = value.identity;
  return isRecord(identity) && isStableId(identity.projectId) &&
    isStableId(identity.ownerId) && isStableId(identity.tenantId) &&
    isStableId(identity.revisionId);
}

function freezeProjectRecord<TProject>(
  record: Site400IGameProjectRecord<TProject>,
): Site400IGameProjectRecord<TProject> {
  return Object.freeze({
    project: record.project,
    identity: Object.freeze({ ...record.identity }),
  });
}

function isRegistryRequest(
  value: unknown,
): value is Site400IGameRegistryRequest {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "requestId",
    "sessionReference",
    "correlationId",
    "assetId",
    "requestedTenantId",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  return isStableId(value.requestId) && isStableId(value.sessionReference) &&
    isStableId(value.correlationId) && isStableId(value.assetId) &&
    (value.requestedTenantId === undefined ||
      isStableId(value.requestedTenantId));
}

function isOperation<TCreateInput>(
  value: unknown,
): value is Site400IGameOperation<TCreateInput> {
  if (!isRecord(value) || !isStableId(value.operationId)) return false;
  if (!OPERATION_TYPES.includes(value.type as Site400IGameOperationType)) {
    return false;
  }
  if (value.type === "reload") {
    return hasOnlyKeys(value, ["operationId", "type"]);
  }
  if (!isRegistryRequest(value.registryRequest)) return false;
  if (value.type === "create") {
    return hasOnlyKeys(value, [
      "operationId",
      "type",
      "createInput",
      "registryRequest",
    ]);
  }
  return hasOnlyKeys(value, [
    "operationId",
    "type",
    "projectId",
    "registryRequest",
  ]) && isStableId(value.projectId);
}

function invalidOperation<TProject>(
  value: unknown,
): Site400IGameRouteResult<TProject> {
  const record = isRecord(value) ? value : {};
  const type =
    OPERATION_TYPES.includes(record.type as Site400IGameOperationType)
      ? record.type as Site400IGameOperationType
      : "reload";
  return {
    operationId: isStableId(record.operationId)
      ? record.operationId
      : "invalid-operation",
    type,
    status: "ERROR",
    reason: "INVALID_OPERATION",
  };
}

function copyRegistryRequest(
  request: Site400IGameRegistryRequest,
): Site400IGameRegistryRequest {
  return Object.freeze({
    requestId: request.requestId,
    sessionReference: request.sessionReference,
    correlationId: request.correlationId,
    assetId: request.assetId,
    ...(request.requestedTenantId === undefined
      ? {}
      : { requestedTenantId: request.requestedTenantId }),
  });
}

function copyOperation<TCreateInput>(
  operation: Site400IGameOperation<TCreateInput>,
): Site400IGameOperation<TCreateInput> {
  if (operation.type === "reload") {
    return Object.freeze({
      operationId: operation.operationId,
      type: "reload" as const,
    });
  }
  if (operation.type === "create") {
    return Object.freeze({
      operationId: operation.operationId,
      type: "create" as const,
      createInput: operation.createInput,
      registryRequest: copyRegistryRequest(operation.registryRequest),
    });
  }
  return Object.freeze({
    operationId: operation.operationId,
    type: "open" as const,
    projectId: operation.projectId,
    registryRequest: copyRegistryRequest(operation.registryRequest),
  });
}

function sameRegistryRequest(
  left: Site400IGameRegistryRequest,
  right: Site400IGameRegistryRequest,
): boolean {
  return left.requestId === right.requestId &&
    left.sessionReference === right.sessionReference &&
    left.correlationId === right.correlationId &&
    left.assetId === right.assetId &&
    left.requestedTenantId === right.requestedTenantId;
}

function sameOperation<TCreateInput>(
  left: Site400IGameOperation<TCreateInput>,
  right: Site400IGameOperation<TCreateInput>,
): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "reload" && right.type === "reload") return true;
  if (left.type === "open" && right.type === "open") {
    return left.projectId === right.projectId &&
      sameRegistryRequest(left.registryRequest, right.registryRequest);
  }
  if (left.type === "create" && right.type === "create") {
    return Object.is(left.createInput, right.createInput) &&
      sameRegistryRequest(left.registryRequest, right.registryRequest);
  }
  return false;
}

function unavailable<TProject, TCreateInput>(
  operation: Site400IGameOperation<TCreateInput>,
  flag: Site400IGameFeatureFlag,
): Site400IGameRouteResult<TProject> {
  return {
    operationId: operation.operationId,
    type: operation.type,
    status: flag === "off" ? "OFF" : "UNKNOWN_FLAG",
  };
}

function failure<TProject, TCreateInput>(
  operation: Site400IGameOperation<TCreateInput>,
  status: "DENIED" | "ERROR",
  reason: string,
  sequence?: number,
): Site400IGameRouteResult<TProject> {
  return sequence === undefined
    ? {
      operationId: operation.operationId,
      type: operation.type,
      status,
      reason,
    }
    : {
      operationId: operation.operationId,
      type: operation.type,
      status,
      reason,
      sequence,
    };
}

function ready<TProject, TCreateInput>(input: {
  readonly operation: Site400IGameOperation<TCreateInput>;
  readonly sequence: number;
  readonly entry: Site400EntryModule;
  readonly record: Site400IGameProjectRecord<TProject>;
  readonly metadata: Site400IGameResolvedMetadata;
}): Site400IGameRouteResult<TProject> {
  return {
    operationId: input.operation.operationId,
    type: input.operation.type,
    status: "READY",
    sequence: input.sequence,
    moduleId: input.entry.moduleId,
    project: input.record.project,
    metadata: input.metadata,
  };
}

async function resolveMetadata<TProject>(input: {
  readonly record: Site400IGameProjectRecord<TProject>;
  readonly registryRequest: Site400IGameRegistryRequest;
  readonly resolveRegisteredAsset: Site400IGameRouteOptions<
    TProject,
    unknown
  >["resolveRegisteredAsset"];
}): Promise<
  | { readonly ok: true; readonly metadata: Site400IGameResolvedMetadata }
  | {
    readonly ok: false;
    readonly status: "DENIED" | "ERROR";
    readonly reason: string;
  }
> {
  if (!isRegistryRequest(input.registryRequest)) {
    return { ok: false, status: "DENIED", reason: "INVALID_REGISTRY_REQUEST" };
  }
  let result: unknown;
  try {
    result = await input.resolveRegisteredAsset({
      requestId: input.registryRequest.requestId,
      sessionReference: input.registryRequest.sessionReference,
      correlationId: input.registryRequest.correlationId,
      assetId: input.registryRequest.assetId,
      projectId: input.record.identity.projectId,
      ...(input.registryRequest.requestedTenantId === undefined
        ? {}
        : { requestedTenantId: input.registryRequest.requestedTenantId }),
    });
  } catch {
    return {
      ok: false,
      status: "ERROR",
      reason: "REGISTRY_PROVIDER_EXCEPTION",
    };
  }

  if (!isRecord(result)) {
    return { ok: false, status: "ERROR", reason: "REGISTRY_RESPONSE_INVALID" };
  }
  if (result.ok !== true) {
    return {
      ok: false,
      status: "DENIED",
      reason: typeof result.code === "string"
        ? result.code
        : "REGISTRY_REJECTED",
    };
  }
  const resolved = result.value;
  if (!isRecord(resolved) || !isRecord(resolved.identity)) {
    return { ok: false, status: "ERROR", reason: "REGISTRY_RESPONSE_INVALID" };
  }
  const identity = resolved.identity;
  if (
    resolved.resolvedBy !== "SITE400_SERVER_COMPOSITION_ROOT" ||
    !isStableId(resolved.tenantId) ||
    !isStableId(resolved.registryRevision) ||
    !isStableId(identity.assetId) ||
    !isStableId(identity.projectId) ||
    !isStableId(identity.ownerId) ||
    !isStableId(identity.sourceRevisionId)
  ) {
    return { ok: false, status: "ERROR", reason: "REGISTRY_IDENTITY_INVALID" };
  }
  if (identity.assetId !== input.registryRequest.assetId) {
    return { ok: false, status: "DENIED", reason: "ASSET_MISMATCH" };
  }
  if (identity.projectId !== input.record.identity.projectId) {
    return { ok: false, status: "DENIED", reason: "PROJECT_MISMATCH" };
  }
  if (identity.ownerId !== input.record.identity.ownerId) {
    return { ok: false, status: "DENIED", reason: "OWNER_MISMATCH" };
  }
  if (resolved.tenantId !== input.record.identity.tenantId) {
    return { ok: false, status: "DENIED", reason: "TENANT_MISMATCH" };
  }
  if (
    input.registryRequest.requestedTenantId !== undefined &&
    input.registryRequest.requestedTenantId !== resolved.tenantId
  ) {
    return { ok: false, status: "DENIED", reason: "TENANT_MISMATCH" };
  }
  return {
    ok: true,
    metadata: {
      projectId: input.record.identity.projectId,
      ownerId: input.record.identity.ownerId,
      tenantId: input.record.identity.tenantId,
      acceptedRevisionId: input.record.identity.revisionId,
      assetId: identity.assetId,
      assetRevisionId: identity.sourceRevisionId,
      registryRevision: resolved.registryRevision,
    },
  };
}

export function createSite400IGameRoute<TProject, TCreateInput>(
  options: Site400IGameRouteOptions<TProject, TCreateInput>,
): Site400IGameRouteController<TProject, TCreateInput> {
  let featureFlag = options.featureFlag;
  let entryPromise: Promise<Site400EntryModule> | undefined;
  let sequence = 0;
  let queue: Promise<void> = Promise.resolve();
  let current: Site400IGameProjectRecord<TProject> | undefined;
  let activeRegistryRequest: Site400IGameRegistryRequest | undefined;
  const operations = new Map<
    string,
    Site400IGameOperationRecord<TProject, TCreateInput>
  >();

  const loadEntry = (): Promise<Site400EntryModule> => {
    entryPromise ??= options.lazyEntry.load();
    return entryPromise;
  };

  const commit = async (
    operation: Site400IGameOperation<TCreateInput>,
    entry: Site400EntryModule,
    record: Site400IGameProjectRecord<TProject>,
    registryRequest: Site400IGameRegistryRequest,
    metadata: Site400IGameResolvedMetadata,
    operationSequence: number,
  ): Promise<Site400IGameRouteResult<TProject>> => {
    if (featureFlag !== "on") return unavailable(operation, featureFlag);
    if (options.host !== undefined) {
      try {
        options.host.projectResolvedMetadata(metadata);
      } catch {
        return failure(
          operation,
          "ERROR",
          "HOST_PROJECTION_FAILED",
          operationSequence,
        );
      }
    }
    const accepted = freezeProjectRecord(record);
    current = accepted;
    activeRegistryRequest = copyRegistryRequest(registryRequest);
    return ready({
      operation,
      sequence: operationSequence,
      entry,
      record: accepted,
      metadata,
    });
  };

  const execute = async (
    operation: Site400IGameOperation<TCreateInput>,
  ): Promise<Site400IGameRouteResult<TProject>> => {
    try {
      if (featureFlag !== "on") return unavailable(operation, featureFlag);
      if (!isStableId(operation.operationId)) {
        return failure(operation, "ERROR", "INVALID_OPERATION_ID");
      }
      const operationSequence = ++sequence;

      if (operation.type === "create") {
        const created = await options.creator.create(operation.createInput);
        if (!isProjectRecord<TProject>(created)) {
          return failure(
            operation,
            "ERROR",
            "PROJECT_CREATOR_RESPONSE_INVALID",
            operationSequence,
          );
        }
        const accepted = freezeProjectRecord(created);
        if (
          current !== undefined &&
          current.identity.projectId === accepted.identity.projectId
        ) {
          return failure(
            operation,
            "ERROR",
            "CREATE_REUSES_ACTIVE_PROJECT",
            operationSequence,
          );
        }
        const resolved = await resolveMetadata({
          record: accepted,
          registryRequest: operation.registryRequest,
          resolveRegisteredAsset: options.resolveRegisteredAsset,
        });
        if (!resolved.ok) {
          return failure(
            operation,
            resolved.status,
            resolved.reason,
            operationSequence,
          );
        }
        if (featureFlag !== "on") return unavailable(operation, featureFlag);
        const entry = await loadEntry();
        return await commit(
          operation,
          entry,
          accepted,
          operation.registryRequest,
          resolved.metadata,
          operationSequence,
        );
      }

      if (operation.type === "open") {
        const loaded = await options.loader.load({
          projectId: operation.projectId,
        });
        if (loaded === null) {
          return failure(
            operation,
            "DENIED",
            "PROJECT_NOT_FOUND",
            operationSequence,
          );
        }
        if (!isProjectRecord<TProject>(loaded)) {
          return failure(
            operation,
            "ERROR",
            "PROJECT_LOADER_RESPONSE_INVALID",
            operationSequence,
          );
        }
        const accepted = freezeProjectRecord(loaded);
        if (accepted.identity.projectId !== operation.projectId) {
          return failure(
            operation,
            "DENIED",
            "PROJECT_MISMATCH",
            operationSequence,
          );
        }
        const resolved = await resolveMetadata({
          record: accepted,
          registryRequest: operation.registryRequest,
          resolveRegisteredAsset: options.resolveRegisteredAsset,
        });
        if (!resolved.ok) {
          return failure(
            operation,
            resolved.status,
            resolved.reason,
            operationSequence,
          );
        }
        if (featureFlag !== "on") return unavailable(operation, featureFlag);
        const entry = await loadEntry();
        return await commit(
          operation,
          entry,
          accepted,
          operation.registryRequest,
          resolved.metadata,
          operationSequence,
        );
      }

      if (current === undefined || activeRegistryRequest === undefined) {
        return failure(
          operation,
          "DENIED",
          "NO_ACTIVE_PROJECT",
          operationSequence,
        );
      }
      const accepted = current;
      const reloaded = await options.loader.load({
        projectId: accepted.identity.projectId,
        acceptedRevisionId: accepted.identity.revisionId,
      });
      if (reloaded === null) {
        return failure(
          operation,
          "DENIED",
          "PROJECT_NOT_FOUND",
          operationSequence,
        );
      }
      if (!isProjectRecord<TProject>(reloaded)) {
        return failure(
          operation,
          "ERROR",
          "PROJECT_LOADER_RESPONSE_INVALID",
          operationSequence,
        );
      }
      const acceptedRecord = freezeProjectRecord(reloaded);
      if (
        acceptedRecord.identity.projectId !== accepted.identity.projectId ||
        acceptedRecord.identity.ownerId !== accepted.identity.ownerId ||
        acceptedRecord.identity.tenantId !== accepted.identity.tenantId ||
        acceptedRecord.identity.revisionId !== accepted.identity.revisionId
      ) {
        return failure(
          operation,
          "DENIED",
          "STALE_ACCEPTED_REVISION",
          operationSequence,
        );
      }
      const resolved = await resolveMetadata({
        record: acceptedRecord,
        registryRequest: activeRegistryRequest,
        resolveRegisteredAsset: options.resolveRegisteredAsset,
      });
      if (!resolved.ok) {
        return failure(
          operation,
          resolved.status,
          resolved.reason,
          operationSequence,
        );
      }
      if (featureFlag !== "on") return unavailable(operation, featureFlag);
      const entry = await loadEntry();
      return await commit(
        operation,
        entry,
        acceptedRecord,
        activeRegistryRequest,
        resolved.metadata,
        operationSequence,
      );
    } catch {
      return failure(operation, "ERROR", "IGAME_ROUTE_EXCEPTION");
    }
  };

  return {
    dispatch(operation): Promise<Site400IGameRouteResult<TProject>> {
      if (!isOperation<TCreateInput>(operation)) {
        return Promise.resolve(invalidOperation<TProject>(operation));
      }
      if (featureFlag !== "on") {
        return Promise.resolve(unavailable(operation, featureFlag));
      }
      if (!isStableId(operation.operationId)) {
        return Promise.resolve(
          failure(operation, "ERROR", "INVALID_OPERATION_ID"),
        );
      }
      const acceptedOperation = copyOperation(operation);
      const duplicate = operations.get(acceptedOperation.operationId);
      if (duplicate !== undefined) {
        return sameOperation(duplicate.operation, acceptedOperation)
          ? duplicate.promise
          : Promise.resolve(
            failure(
              acceptedOperation,
              "ERROR",
              "DUPLICATE_OPERATION_ID",
            ),
          );
      }
      const scheduled = queue.then(() => execute(acceptedOperation));
      operations.set(acceptedOperation.operationId, {
        operation: acceptedOperation,
        promise: scheduled,
      });
      queue = scheduled.then(() => undefined, () => undefined);
      return scheduled;
    },
    setFeatureFlag(flag): void {
      featureFlag = flag;
    },
    currentProject(): Site400IGameProjectRecord<TProject> | undefined {
      return current;
    },
  };
}
