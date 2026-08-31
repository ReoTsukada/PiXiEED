import {
  createPlatform450Composition,
  createPlatform450PackageState,
  PLATFORM450_CAPABILITIES,
} from "../platform-450/composition.ts";
import type { Platform450Command } from "../platform-450/contracts.ts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const RESOURCE = "resource:site460-public-work";

declare const location: { readonly hostname: string; readonly search: string };
declare const document: {
  readonly body: Site460Host;
  readonly createElement: (tag: string) => Site460Output;
  readonly querySelector: (selector: string) => Site460Host | null;
};
declare const HTMLElement: undefined;

interface Site460Host {
  hidden: boolean;
  append: (child: Site460Output) => void;
}

interface Site460Output extends Site460Host {
  dataset: Record<string, string>;
  textContent: string | null;
  setAttribute: (name: string, value: string) => void;
}

function enabled(): boolean {
  return LOCAL_HOSTS.has(location.hostname) &&
    new URLSearchParams(location.search).get("site460") === "on";
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
      providerIdentity: "server",
    }),
    packageStateResolver: (input) =>
      createPlatform450PackageState(
        "revision:site460-v1",
        input.flow,
        input.resourceReference,
      ),
    consumerAdapter: { apply: () => ({ ok: true, sideEffects: 0 }) },
    flags: { PUBLIC_WORK_SOCIAL: "ON" },
    killSwitch: false,
  });
}

async function mountSite460BrowserEntry(): Promise<void> {
  if (!enabled()) return;
  const host = document.querySelector("#site460Status") ?? document.body;
  host.hidden = false;
  const output = document.createElement("output");
  output.dataset.site460Status = "loading";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  output.textContent = "SITE-460 connecting…";
  host.append(output);
  const command: Platform450Command = {
    commandId: "cmd:site460-public-work",
    flow: "PUBLIC_WORK_SOCIAL",
    resourceReference: RESOURCE,
    requestedAction: "platform.public-work-social.complete",
  };
  const result = await fixedComposition().execute(command);
  if (result.status === "APPLIED" && result.stage === "INBOX_APPLIED") {
    output.dataset.site460Status = "completed";
    output.textContent = "PUBLIC_WORK_SOCIAL · COMPLETED";
    return;
  }
  output.dataset.site460Status = "failed";
  output.textContent = "SITE-460 unavailable (fail closed).";
}

if (typeof document !== "undefined") void mountSite460BrowserEntry();
