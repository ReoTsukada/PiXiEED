import type { CanonicalRegistryAdapter } from "./authority-contracts.ts";
import type { CanonicalTenantMembershipRegistryV1 } from "./internal/authenticated-context.ts";

/**
 * Isolated default. Production wiring can replace this adapter inside the
 * server deployment only; this package never connects to Production DB.
 */
export function createFailClosedCanonicalRegistryAdapter(): CanonicalRegistryAdapter {
  const unavailable = (): never => {
    throw new Error("SERVER_AUTHORITY_UNAVAILABLE");
  };
  const membershipRegistry: CanonicalTenantMembershipRegistryV1 = {
    async getCurrent() {
      return null;
    },
  };
  return Object.freeze({
    membershipRegistry,
    resolveTenantContext: unavailable,
    getCurrent: unavailable,
    resolvePrincipal: unavailable,
    getCurrentDirectWorkChain: unavailable,
    getCurrentMarketSettlement: unavailable,
    getCollaborativeRevenueAuthority: unavailable,
    materializeLedger: unavailable,
  });
}
