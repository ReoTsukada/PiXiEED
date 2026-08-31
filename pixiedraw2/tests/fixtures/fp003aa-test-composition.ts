import {
  composeAuthorityService,
} from "../../src/server/authority-composition-internal.ts";
import {
  createServerAuthorityHandler,
  type ServerAuthorityHandler,
} from "../../src/server/server-authority-handler.ts";
import type {
  AuthPrincipalProvider,
  TenantMembershipResolver,
} from "../../src/server/internal/authenticated-context.ts";
import type { CanonicalRegistryAdapter } from "../../src/server/authority-contracts.ts";

/** Test-only DI boundary. It is not imported by any Browser or release entry. */
export function createTestServerAuthorityComposition(input: {
  readonly registry: CanonicalRegistryAdapter;
  readonly authProvider: AuthPrincipalProvider;
  readonly tenantResolver: TenantMembershipResolver;
}): { readonly handler: ServerAuthorityHandler } {
  const service = composeAuthorityService(input.registry);
  const handler = createServerAuthorityHandler({
    service,
    authProvider: input.authProvider,
    tenantResolver: input.tenantResolver,
  });
  return Object.freeze({ handler });
}
