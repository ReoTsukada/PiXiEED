/**
 * Server-only request handler boundary for FP-003AA.
 *
 * This is the only path that turns an authenticated adapter result into a
 * ServerAuthorityRequestContext.  Browser commands never receive this module
 * or the generated context.
 */

import {
  type AuthPrincipalProvider,
  deriveServerAuthorityRequestContext,
  type ServerAuthRequestV1,
  type TenantMembershipResolver,
} from "./internal/authenticated-context.ts";
import type {
  AuthorityResult,
  DirectWorkAuthorityCommand,
  DirectWorkAuthorityService,
} from "./authority-composition-internal.ts";
import type { DirectWorkFinancialSettlement } from "../fp003-financial-integrity-core.ts";

export interface ServerAuthorityHandler {
  validateCurrentDirectWorkChain(
    request: ServerAuthRequestV1,
    command: DirectWorkAuthorityCommand,
  ): Promise<AuthorityResult<true>>;
  materializeDirectWorkSettlement(
    request: ServerAuthRequestV1,
    command: DirectWorkAuthorityCommand,
  ): Promise<AuthorityResult<DirectWorkFinancialSettlement>>;
}

function deny<T>(code: string, message: string): AuthorityResult<T> {
  return { ok: false, code, message };
}

function validDirectWorkRequest(
  request: ServerAuthRequestV1,
  command: DirectWorkAuthorityCommand,
): boolean {
  return request.resourceType === "DIRECT_WORK_REQUEST" &&
    request.resourceId === command.requestId;
}

export function createServerAuthorityHandler(input: {
  readonly service: DirectWorkAuthorityService;
  readonly authProvider: AuthPrincipalProvider;
  readonly tenantResolver: TenantMembershipResolver;
}): ServerAuthorityHandler {
  const resolveContext = async (
    request: ServerAuthRequestV1,
    command: DirectWorkAuthorityCommand,
  ) => {
    if (!validDirectWorkRequest(request, command)) return null;
    return deriveServerAuthorityRequestContext({
      authProvider: input.authProvider,
      tenantResolver: input.tenantResolver,
      request,
    });
  };

  return Object.freeze({
    async validateCurrentDirectWorkChain(
      request: ServerAuthRequestV1,
      command: DirectWorkAuthorityCommand,
    ): Promise<AuthorityResult<true>> {
      const context = await resolveContext(request, command);
      if (context === null) {
        return deny(
          "SERVER_AUTHENTICATION_REQUIRED",
          "An authenticated Server Auth Adapter context is required.",
        );
      }
      return input.service.validateCurrentDirectWorkChain(command, context);
    },
    async materializeDirectWorkSettlement(
      request: ServerAuthRequestV1,
      command: DirectWorkAuthorityCommand,
    ): Promise<AuthorityResult<DirectWorkFinancialSettlement>> {
      const context = await resolveContext(request, command);
      if (context === null) {
        return deny(
          "SERVER_AUTHENTICATION_REQUIRED",
          "An authenticated Server Auth Adapter context is required.",
        );
      }
      return input.service.materializeDirectWorkSettlement(command, context);
    },
  });
}
