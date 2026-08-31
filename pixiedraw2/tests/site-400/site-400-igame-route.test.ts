import {
  createSite400IGameRoute,
  type Site400IGameProjectRecord,
  type Site400IGameRegistryRequest,
  type Site400IGameResolvedMetadata,
} from "../../src/platform/site-400/igame-route.ts";
import type {
  Site400ResolvedAssetV1,
  Site400ResolveResult,
} from "../../src/platform/site-400/server-authorized-registry-provider.ts";

type Project = { readonly label: string };

const registryRequest: Site400IGameRegistryRequest = {
  requestId: "request:igame-route",
  sessionReference: "session:igame-route",
  correlationId: "correlation:igame-route",
  assetId: "asset:igame-hero",
  requestedTenantId: "tenant:igame",
};

function record(
  projectId: string,
  revisionId: string,
  label = projectId,
): Site400IGameProjectRecord<Project> {
  return {
    project: { label },
    identity: {
      projectId,
      ownerId: "owner:igame",
      tenantId: "tenant:igame",
      revisionId,
    },
  };
}

function resolved(
  projectId: string,
): { readonly ok: true; readonly value: Site400ResolvedAssetV1 } {
  return {
    ok: true,
    value: {
      identity: {
        schemaVersion: 1,
        status: "REGISTERED_ASSET",
        assetId: registryRequest.assetId,
        projectId,
        sourcePxdId: "pxd:igame",
        definitionId: "definition:igame",
        ownerId: "owner:igame",
        sourceRevisionId: "revision:asset:v1",
        definitionDigest: "a".repeat(64),
        referenceMode: "LIVE",
      },
      tenantId: "tenant:igame",
      registryRevision: "registered:asset:v1",
      resolvedBy: "SITE400_SERVER_COMPOSITION_ROOT",
    },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function lazy(counter: { value: number }, order: string[] = []) {
  return {
    load: async () => {
      counter.value += 1;
      order.push("entry");
      return {
        moduleId: "SITE-400" as const,
        status: "ISOLATED_READY" as const,
        connectedRoutes: [] as const,
        heavyModules: [] as const,
      };
    },
  };
}

function baseOptions(input: {
  readonly flag?: "off" | "on" | "unknown";
  readonly entryCount?: { value: number };
  readonly order?: string[];
  readonly creator?: (
    input: string,
  ) => Promise<Site400IGameProjectRecord<Project>>;
  readonly loader?: (
    request: { projectId: string; acceptedRevisionId?: string },
  ) => Promise<Site400IGameProjectRecord<Project> | null>;
  readonly resolve?: (
    request: { projectId: string },
  ) => Promise<Site400ResolveResult>;
  readonly projected?: Site400IGameResolvedMetadata[];
} = {}) {
  const order = input.order ?? [];
  const entryCount = input.entryCount ?? { value: 0 };
  return {
    featureFlag: input.flag ?? "on",
    lazyEntry: lazy(entryCount, order),
    creator: {
      create: input.creator ??
        (async () => record("project:created", "revision:created")),
    },
    loader: {
      load: input.loader ??
        (async ({ projectId, acceptedRevisionId }) =>
          record(projectId, acceptedRevisionId ?? "revision:opened")),
    },
    resolveRegisteredAsset: input.resolve ?? (async ({ projectId }) => {
      order.push(`registry:${projectId}`);
      return resolved(projectId);
    }),
    ...(input.projected === undefined ? {} : {
      host: {
        projectResolvedMetadata: (metadata: Site400IGameResolvedMetadata) =>
          input.projected!.push(metadata),
      },
    }),
  };
}

Deno.test("SITE400-IGAME-ROUTE-001 create/open/reload share one ordered controller", async () => {
  const order: string[] = [];
  const entryCount = { value: 0 };
  const opened = record("project:opened", "revision:accepted", "opened");
  const route = createSite400IGameRoute<Project, string>({
    ...baseOptions({ entryCount, order }),
    creator: {
      create: async () => {
        order.push("create");
        return record("project:created", "revision:created");
      },
    },
    loader: {
      load: async (request) => {
        order.push(
          request.acceptedRevisionId === undefined ? "open" : "reload",
        );
        return opened;
      },
    },
  });

  const created = await route.dispatch({
    operationId: "op:create",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  const openedResult = await route.dispatch({
    operationId: "op:open",
    type: "open",
    projectId: opened.identity.projectId,
    registryRequest,
  });
  const reload = route.dispatch({ operationId: "op:reload", type: "reload" });
  const duplicateReload = route.dispatch({
    operationId: "op:reload",
    type: "reload",
  });

  assert(created.status === "READY", "create must be ready");
  assert(openedResult.status === "READY", "open must be ready");
  assert(
    await reload === await duplicateReload,
    "duplicate operation must share the same Promise result",
  );
  assert((await reload).status === "READY", "reload must be ready");
  assert(entryCount.value === 1, "iGAME entry must load once");
  assert(
    order.join(",") ===
      "create,registry:project:created,entry,open,registry:project:opened,reload,registry:project:opened",
    "controller order must be explicit",
  );
  assert(
    route.currentProject()?.identity.revisionId === "revision:accepted",
    "reload must keep the accepted revision",
  );
});

Deno.test("SITE400-IGAME-ROUTE-002 direct concurrent create stays fail-closed", async () => {
  const route = createSite400IGameRoute<Project, string>({
    ...baseOptions(),
    creator: {
      create: async () => record("project:concurrent", "revision:created"),
    },
  });
  const firstPromise = route.dispatch({
    operationId: "op:concurrent-create-1",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  const secondPromise = route.dispatch({
    operationId: "op:concurrent-create-2",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  const first = await firstPromise;
  const second = await secondPromise;
  assert(first.status === "READY", "the first create must be accepted");
  assert(
    second.status === "ERROR" &&
      second.reason === "CREATE_REUSES_ACTIVE_PROJECT",
    "the generic controller must reject a direct duplicate create",
  );
});

Deno.test("SITE400-IGAME-REGISTRY-001 uses server resolver identity and fails closed", async () => {
  const projected: Site400IGameResolvedMetadata[] = [];
  const resolverRequests: string[] = [];
  const route = createSite400IGameRoute<Project, string>({
    ...baseOptions({ projected }),
    resolveRegisteredAsset: async ({ projectId }) => {
      resolverRequests.push(projectId);
      return {
        ok: true,
        value: {
          ...resolved("project:server").value,
          identity: {
            ...resolved("project:server").value.identity,
            ownerId: "owner:server",
          },
        },
      };
    },
  });
  const denied = await route.dispatch({
    operationId: "op:registry-denied",
    type: "open",
    projectId: "project:local",
    registryRequest,
  });
  assert(
    denied.status === "DENIED",
    "provider identity mismatch must be denied",
  );
  assert(
    resolverRequests[0] === "project:local",
    "resolver must receive the requested project identity",
  );
  assert(
    projected.length === 0,
    "denied provider result must not project metadata",
  );

  const errorRoute = createSite400IGameRoute<Project, string>({
    ...baseOptions(),
    resolveRegisteredAsset: async () => {
      throw new Error("provider unavailable");
    },
  });
  const errored = await errorRoute.dispatch({
    operationId: "op:registry-error",
    type: "open",
    projectId: "project:local",
    registryRequest,
  });
  assert(
    errored.status === "ERROR",
    "provider exception must fail closed as ERROR",
  );
});

Deno.test("SITE400-IGAME-CROSSFLOW-001 reload reads the same project accepted revision", async () => {
  const loadRequests: { projectId: string; acceptedRevisionId?: string }[] = [];
  const route = createSite400IGameRoute<Project, string>({
    ...baseOptions(),
    creator: {
      create: async () => record("project:crossflow", "revision:accepted"),
    },
    loader: {
      load: async (request) => {
        loadRequests.push(request);
        return record(
          request.projectId,
          request.acceptedRevisionId ?? "revision:accepted",
        );
      },
    },
  });
  const created = await route.dispatch({
    operationId: "op:cross-create",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  assert(created.status === "READY", "crossflow create must be ready");
  const reloaded = await route.dispatch({
    operationId: "op:cross-reload",
    type: "reload",
  });
  assert(reloaded.status === "READY", "crossflow reload must be ready");
  assert(loadRequests.length === 1, "reload must use one loader call");
  assert(
    loadRequests[0]?.projectId === "project:crossflow",
    "reload project identity mismatch",
  );
  assert(
    loadRequests[0]?.acceptedRevisionId === "revision:accepted",
    "reload must request accepted revision",
  );
  assert(
    reloaded.metadata?.acceptedRevisionId === "revision:accepted",
    "host metadata must carry accepted revision",
  );
});

Deno.test("SITE400-IGAME-FLAG-ROLLBACK-001 off/unknown and rollback do not invoke new dependencies", async () => {
  const entryCount = { value: 0 };
  const calls = { create: 0, load: 0, resolve: 0 };
  const options = baseOptions({ entryCount });
  const route = createSite400IGameRoute<Project, string>({
    ...options,
    creator: {
      create: async () => {
        calls.create += 1;
        return record("project:rollback", "revision:accepted");
      },
    },
    loader: {
      load: async () => {
        calls.load += 1;
        return record("project:rollback", "revision:accepted");
      },
    },
    resolveRegisteredAsset: async ({ projectId }) => {
      calls.resolve += 1;
      return resolved(projectId);
    },
  });
  route.setFeatureFlag("off");
  const off = await route.dispatch({
    operationId: "op:rollback-off",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  assert(off.status === "OFF", "rollback OFF must disable iGAME route");
  assert(
    entryCount.value === 0 && calls.create === 0 && calls.load === 0 &&
      calls.resolve === 0,
    "OFF must not invoke lazy entry, creator, loader, or resolver",
  );

  route.setFeatureFlag("on");
  const ready = await route.dispatch({
    operationId: "op:rollback-on",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  assert(ready.status === "READY", "re-enabled iGAME route must work");
  route.setFeatureFlag("off");
  const afterRollback = await route.dispatch({
    operationId: "op:rollback-reload",
    type: "reload",
  });
  assert(
    afterRollback.status === "OFF",
    "post-success rollback must stop reload",
  );
  const finalCounts: number[] = [
    entryCount.value,
    calls.create,
    calls.load,
    calls.resolve,
  ];
  assert(
    finalCounts.join(",") === "1,1,0,1",
    "rollback must not call loader or resolver again",
  );

  const unknownRoute = createSite400IGameRoute<Project, string>({
    ...options,
    featureFlag: "unknown",
  });
  const unknown = await unknownRoute.dispatch({
    operationId: "op:unknown",
    type: "reload",
  });
  assert(unknown.status === "UNKNOWN_FLAG", "unknown flag must fail closed");
  const finalEntryCount: number = entryCount.value;
  assert(finalEntryCount === 1, "unknown flag must not load a second entry");
});

Deno.test("SITE400-IGAME-SECURITY-001 keeps accepted identity immutable and rejects malformed operations", async () => {
  const accepted = record("project:immutable", "revision:accepted");
  const route = createSite400IGameRoute<Project, string>({
    ...baseOptions(),
    creator: { create: async () => accepted },
    loader: {
      load: async (request) =>
        record(
          request.projectId,
          request.acceptedRevisionId ?? "revision:accepted",
        ),
    },
  });
  const ready = await route.dispatch({
    operationId: "op:immutable",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  assert(ready.status === "READY", "fixture must create an accepted project");
  const visible = route.currentProject();
  assert(visible !== undefined, "accepted project should be visible");
  try {
    (visible.identity as { revisionId: string }).revisionId = "revision:forged";
  } catch {
    // Frozen identity is the expected boundary.
  }
  const reloaded = await route.dispatch({
    operationId: "op:immutable-reload",
    type: "reload",
  });
  assert(reloaded.status === "READY", "reload must use the accepted identity");
  assert(
    reloaded.metadata?.acceptedRevisionId === "revision:accepted",
    "reload must not trust a mutated identity",
  );

  const malformed = await route.dispatch(
    { operationId: "op:malformed", type: "unexpected" } as never,
  );
  assert(
    malformed.status === "ERROR" && malformed.reason === "INVALID_OPERATION",
    "malformed operation must fail closed",
  );
  const malformedExtra = await route.dispatch(
    {
      operationId: "op:malformed-extra",
      type: "reload",
      unexpected: true,
    } as never,
  );
  assert(
    malformedExtra.status === "ERROR" &&
      malformedExtra.reason === "INVALID_OPERATION",
    "unknown operation keys must fail closed",
  );

  const duplicate = route.dispatch({
    operationId: "op:duplicate-id",
    type: "reload",
  });
  const conflictingDuplicate = await route.dispatch({
    operationId: "op:duplicate-id",
    type: "open",
    projectId: "project:other",
    registryRequest,
  });
  assert(
    conflictingDuplicate.status === "ERROR" &&
      conflictingDuplicate.reason === "DUPLICATE_OPERATION_ID",
    "a conflicting operation must not reuse an existing operation ID",
  );
  assert(
    (await duplicate).status === "READY",
    "the original operation must remain independently ordered",
  );
});

Deno.test("SITE400-IGAME-SECURITY-002 snapshots creator identity before an async Registry resolve", async () => {
  const created = record("project:async-snapshot", "revision:accepted");
  const route = createSite400IGameRoute<Project, string>({
    ...baseOptions(),
    creator: { create: async () => created },
    resolveRegisteredAsset: async () => {
      (created.identity as { revisionId: string }).revisionId =
        "revision:forged-during-await";
      return resolved("project:async-snapshot");
    },
  });
  const result = await route.dispatch({
    operationId: "op:async-snapshot",
    type: "create",
    createInput: "RPG",
    registryRequest,
  });
  assert(
    result.status === "READY",
    "creator should remain ready after the provider resolves",
  );
  assert(
    result.metadata?.acceptedRevisionId === "revision:accepted",
    "metadata must use the pre-await accepted revision",
  );
});
