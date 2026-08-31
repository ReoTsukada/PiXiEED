import { createCore100Root } from "../../src/core/core-100/composition-root.ts";
import type { Core100Dependencies } from "../../src/core/core-100/contracts.ts";
const dependencies = {
  durable: {
    adapterId: "bench",
    capabilities: ["COMMIT", "FINANCE", "NOTIFICATION", "SEARCH"],
    commit: async () => ({ ok: false, diagnostics: [] }),
  },
  inboxOutbox: {
    adapterId: "bench",
    capabilities: [
      "COMMIT",
      "INBOX_ACCEPT",
      "OUTBOX_DISPATCH",
      "FINANCE",
      "NOTIFICATION",
      "SEARCH",
    ],
    acceptInbox: async () => ({ ok: false, diagnostics: [] }),
    leaseOutbox: async () => ({ ok: false, diagnostics: [] }),
    completeOutbox: async () => ({ ok: false, diagnostics: [] }),
  },
  membershipRegistry: {
    getCurrent: async ({ principalId, membershipId, tenantId }) => ({
      principalId,
      membershipId,
      tenantId,
      membershipRevision: "membership-r1",
      status: "ACTIVE" as const,
    }),
  },
  privacyStorage: {
    policy: {} as never,
    validate: () => ({ ok: true, value: undefined, diagnostics: [] }),
  },
  schemaBuild: { schemaRegistry: {} as never, resolve: () => ({}) as never },
  transport: null,
  finance: {
    consumerId: "FINANCE",
    consume: async () => ({ ok: false, diagnostics: [] }),
  },
  notification: {
    consumerId: "NOTIFICATION",
    consume: async () => ({ ok: false, diagnostics: [] }),
  },
  search: {
    consumerId: "SEARCH",
    consume: async () => ({ ok: false, diagnostics: [] }),
  },
} satisfies Core100Dependencies;
const start = performance.now();
for (let i = 0; i < 1000; i++) createCore100Root(dependencies);
console.log(
  JSON.stringify({
    benchmark: "CORE-100 composition construction",
    iterations: 1000,
    elapsedMs: performance.now() - start,
    evidence: "ISOLATED_REFERENCE",
  }),
);
