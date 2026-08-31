/**
 * FP-003AA Server Authority Composition Root.
 *
 * Server startup wires the AuthPrincipalProvider and TenantMembershipResolver
 * once. Request callers receive only the handler request/command API; they
 * cannot replace those dependencies or provide an authority context.
 */

import { createFailClosedCanonicalRegistryAdapter } from "./canonical-registry-adapter.ts";
import { composeAuthorityService } from "./authority-composition-internal.ts";
import {
  createServerAuthorityHandler,
  type ServerAuthorityHandler,
} from "./server-authority-handler.ts";
import type {
  AuthPrincipalProvider,
  TenantMembershipResolver,
} from "./internal/authenticated-context.ts";
import type { CanonicalRegistryAdapter } from "./authority-contracts.ts";

interface ServerAuthorityCompositionV1 {
  readonly handler: ServerAuthorityHandler;
}

/**
 * Server startup composition. Dependencies are fixed in the returned
 * closure; they are not accepted by a request method.
 */
function createServerAuthorityCompositionRoot(input: {
  readonly registry: CanonicalRegistryAdapter;
  readonly authProvider: AuthPrincipalProvider;
  readonly tenantResolver: TenantMembershipResolver;
}): ServerAuthorityCompositionV1 {
  const service = composeAuthorityService(input.registry);
  const handler = createServerAuthorityHandler({
    service,
    authProvider: input.authProvider,
    tenantResolver: input.tenantResolver,
  });
  return Object.freeze({ handler });
}

const failClosedAuthProvider: AuthPrincipalProvider = {
  async authenticate() {
    return null;
  },
};

const failClosedTenantResolver: TenantMembershipResolver = {
  membershipRegistry: {
    async getCurrent() {
      return null;
    },
  },
  async resolve() {
    return null;
  },
};

const defaultComposition = createServerAuthorityCompositionRoot({
  registry: createFailClosedCanonicalRegistryAdapter(),
  authProvider: failClosedAuthProvider,
  tenantResolver: failClosedTenantResolver,
});

export const fp003zHandler = defaultComposition.handler;
