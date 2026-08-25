import {
  mountSite400LocalRoute,
  type Site400LocalRouteHost,
  type Site400LocalRouteStatusHost,
} from "../../src/platform/site-400/local-route.ts";
import type { Site400ResolveRequestV1 } from "../../src/platform/site-400/server-authorized-registry-provider.ts";

class FakeStatus implements Site400LocalRouteStatusHost {
  readonly dataset: Record<string, string> = {};
  textContent: string | null = null;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  readonly output = new FakeStatus();

  createElement(): FakeStatus {
    return this.output;
  }
}

class FakeHost implements Site400LocalRouteHost {
  readonly dataset: Record<string, string> = {};
  readonly ownerDocument = new FakeDocument();
  private status: FakeStatus | null = null;

  querySelector(): FakeStatus | null {
    return this.status;
  }

  append(child: Site400LocalRouteStatusHost): void {
    this.status = child as FakeStatus;
  }
}

const request: Site400ResolveRequestV1 = {
  requestId: "request:site400-local-test",
  sessionReference: "session:site400-local-test",
  correlationId: "correlation:site400-local-test",
  assetId: "asset:site400-local-test",
  projectId: "project:site400-local-test",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function lazyEntry(counter: { value: number }) {
  return {
    load: async () => {
      counter.value += 1;
      return {
        moduleId: "SITE-400" as const,
        status: "ISOLATED_READY" as const,
        connectedRoutes: [] as const,
        heavyModules: [] as const,
      };
    },
  };
}

Deno.test("SITE400-LOCAL-01 OFF and unknown do not load or resolve", async () => {
  const load = { value: 0 };
  const resolve = { value: 0 };
  const options = {
    host: new FakeHost(),
    featureFlag: "off" as const,
    lazyEntry: lazyEntry(load),
    request,
    resolveRegisteredAsset: async () => {
      resolve.value += 1;
      return { ok: false as const, code: "AUTHORITY_DENIED" as const, message: "denied" };
    },
  };
  const off = await mountSite400LocalRoute(options);
  assert(off.status === "OFF" && !off.mounted, "OFF must be unavailable");
  assert(load.value === 0 && resolve.value === 0, "OFF must not load or resolve");

  const unknown = await mountSite400LocalRoute({
    ...options,
    host: new FakeHost(),
    featureFlag: "unknown",
  });
  assert(unknown.status === "UNKNOWN_FLAG", "unknown flag must fail closed");
  assert(load.value === 0 && resolve.value === 0, "unknown flag must not load or resolve");
});

Deno.test("SITE400-LOCAL-02 ON is memoized and exposes identity metadata only", async () => {
  const load = { value: 0 };
  const resolve = { value: 0 };
  const host = new FakeHost();
  const options = {
    host,
    featureFlag: "on" as const,
    lazyEntry: lazyEntry(load),
    request,
    resolveRegisteredAsset: async () => {
      resolve.value += 1;
      return {
        ok: true as const,
        value: {
          identity: {
            schemaVersion: 1 as const,
            status: "REGISTERED_ASSET" as const,
            assetId: request.assetId,
            projectId: request.projectId,
            sourcePxdId: "pxd:local",
            definitionId: "definition:local",
            ownerId: "principal:local",
            sourceRevisionId: "revision:local:v1",
            definitionDigest: "a".repeat(64),
            referenceMode: "LIVE" as const,
          },
          tenantId: "tenant:local",
          registryRevision: "registered:v1",
          resolvedBy: "SITE400_SERVER_COMPOSITION_ROOT" as const,
        },
      };
    },
  };
  const [first, second] = await Promise.all([
    mountSite400LocalRoute(options),
    mountSite400LocalRoute(options),
  ]);
  assert(first === second, "same host must share one mount Promise");
  assert(first.status === "RESOLVED", "registered asset must resolve");
  assert(load.value === 1 && resolve.value === 1, "lazy route/resolver must run once");
  assert(host.dataset.site400ResolvedAsset === request.assetId, "asset identity missing");
  assert(host.dataset.site400ResolvedTenant === "tenant:local", "tenant metadata missing");
  assert(host.dataset.site400RegistryRevision === "registered:v1", "revision metadata missing");
});

Deno.test("SITE400-LOCAL-03 denial never becomes a successful projection", async () => {
  const host = new FakeHost();
  const result = await mountSite400LocalRoute({
    host,
    featureFlag: "on",
    lazyEntry: lazyEntry({ value: 0 }),
    request,
    resolveRegisteredAsset: async () => ({
      ok: false as const,
      code: "PROJECT_MISMATCH" as const,
      message: "project mismatch",
    }),
  });
  assert(result.status === "DENIED", "denied result must remain denied");
  assert(host.dataset.site400ResolvedAsset === undefined, "denied result must not expose asset");
});

Deno.test("SITE400-LOCAL-04 local route adapter has no workspace or hot-path ownership", async () => {
  const source = await Deno.readTextFile(
    new URL("../../src/platform/site-400/local-route.ts", import.meta.url),
  );
  for (const forbidden of ["draw2Workspace", "requestAnimationFrame", "setInterval", "fetch(", "localStorage"]) {
    assert(!source.includes(forbidden), `local route must not own ${forbidden}`);
  }
});
