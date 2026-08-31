import { composeAuthorityService } from "../../src/server/authority-composition-internal.ts";
import type { DirectWorkAuthorityService } from "../../src/server/authority-composition-internal.ts";
import type { CanonicalRegistryAdapter } from "../../src/server/authority-contracts.ts";

/** Test-only composition. It injects a Registry fixture, never a Provider. */
export function createFp003ZTestService(registry: CanonicalRegistryAdapter): DirectWorkAuthorityService {
  return composeAuthorityService(registry);
}
