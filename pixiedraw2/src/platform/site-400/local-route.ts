/**
 * SITE-400 local browser route adapter.
 *
 * This is an isolated, noindex route adapter only.  It mounts a small
 * status projection into a host supplied by the App Shell; it never creates
 * a Canvas, Timeline, Project, PXD, Blob, or Runtime loop.  The authoritative
 * resolver is injected by the local browser fixture and remains the same
 * server-composition contract used by the Deno tests.
 */

import type {
  Site400ResolveRequestV1,
  Site400ResolveResult,
} from "./server-authorized-registry-provider.ts";
import type { Site400LazyEntry } from "./lazy-entry.ts";

/** Minimal DOM surface keeps the route adapter type-checkable in Deno. */
export interface Site400LocalRouteHost {
  readonly dataset: Record<string, string>;
  readonly ownerDocument: {
    createElement(tagName: string): Site400LocalRouteStatusHost;
  };
  querySelector(selector: string): Site400LocalRouteStatusHost | null;
  append(child: Site400LocalRouteStatusHost): void;
}

export interface Site400LocalRouteStatusHost {
  readonly dataset: Record<string, string>;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
}

export type Site400LocalFeatureFlag = "off" | "on" | "unknown";

export interface Site400LocalRouteOptions {
  readonly host: Site400LocalRouteHost;
  readonly featureFlag: Site400LocalFeatureFlag;
  readonly lazyEntry: Site400LazyEntry;
  readonly request: Site400ResolveRequestV1;
  readonly resolveRegisteredAsset: (
    request: Site400ResolveRequestV1,
  ) => Promise<Site400ResolveResult>;
}

export interface Site400LocalRouteResult {
  readonly mounted: boolean;
  readonly status: "OFF" | "UNKNOWN_FLAG" | "LOADING" | "RESOLVED" | "DENIED" | "ERROR";
  readonly moduleId?: "SITE-400";
  readonly assetId?: string;
  readonly tenantId?: string;
  readonly registryRevision?: string;
  readonly reason?: string;
}

const mountedHosts = new WeakMap<object, Promise<Site400LocalRouteResult>>();

function statusElement(host: Site400LocalRouteHost): Site400LocalRouteStatusHost {
  const existing = host.querySelector("[data-site400-local-status]");
  if (existing !== null) return existing;
  const output = host.ownerDocument.createElement("output");
  output.dataset.site400LocalStatus = "true";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  host.append(output);
  return output;
}

function showStatus(
  output: Site400LocalRouteStatusHost,
  status: Site400LocalRouteResult["status"],
  message: string,
): void {
  output.dataset.site400Status = status;
  output.textContent = message;
}

function onceResult(
  host: Site400LocalRouteHost,
  result: Site400LocalRouteResult,
): Promise<Site400LocalRouteResult> {
  const promise = Promise.resolve(Object.freeze(result));
  mountedHosts.set(host, promise);
  return promise;
}

/**
 * Mounts the local SITE-400 route once.  OFF and UNKNOWN never call the lazy
 * entry or the Registry resolver.  Repeated ON calls share one Promise.
 */
export function mountSite400LocalRoute(
  options: Site400LocalRouteOptions,
): Promise<Site400LocalRouteResult> {
  const existing = mountedHosts.get(options.host);
  if (existing !== undefined) return existing;

  const output = statusElement(options.host);
  options.host.dataset.site400LocalRoute = "isolated";

  if (options.featureFlag === "off") {
    showStatus(output, "OFF", "SITE-400 is unavailable (feature flag OFF).");
    return onceResult(options.host, { mounted: false, status: "OFF" });
  }
  if (options.featureFlag === "unknown") {
    showStatus(output, "UNKNOWN_FLAG", "SITE-400 is unavailable (unknown flag).");
    return onceResult(options.host, { mounted: false, status: "UNKNOWN_FLAG" });
  }

  const promise = (async (): Promise<Site400LocalRouteResult> => {
    showStatus(output, "LOADING", "SITE-400 local route loading…");
    try {
      const entry = await options.lazyEntry.load();
      const resolved = await options.resolveRegisteredAsset(options.request);
      if (!resolved.ok) {
        showStatus(output, "DENIED", `SITE-400 denied: ${resolved.code}.`);
        return Object.freeze({
          mounted: true,
          status: "DENIED" as const,
          moduleId: entry.moduleId,
          reason: resolved.code,
        });
      }
      showStatus(
        output,
        "RESOLVED",
        `SITE-400 resolved ${resolved.value.identity.assetId} · ${resolved.value.registryRevision}`,
      );
      options.host.dataset.site400ResolvedAsset = resolved.value.identity.assetId;
      options.host.dataset.site400ResolvedTenant = resolved.value.tenantId;
      options.host.dataset.site400RegistryRevision = resolved.value.registryRevision;
      return Object.freeze({
        mounted: true,
        status: "RESOLVED" as const,
        moduleId: entry.moduleId,
        assetId: resolved.value.identity.assetId,
        tenantId: resolved.value.tenantId,
        registryRevision: resolved.value.registryRevision,
      });
    } catch (cause) {
      showStatus(output, "ERROR", "SITE-400 local route failed closed.");
      return Object.freeze({
        mounted: true,
        status: "ERROR" as const,
        reason: cause instanceof Error ? cause.name : "UNKNOWN_ERROR",
      });
    }
  })();
  mountedHosts.set(options.host, promise);
  return promise;
}
