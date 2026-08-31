/**
 * CORE-100 server-only authority boundary.
 *
 * The existing FP-003AA context is the source context.  CORE-100 adds a
 * second, package-local WeakSet brand so a command caller cannot replace the
 * proof by spreading, cloning, proxying, JSON round-tripping, or supplying a
 * structurally valid proof to the wrapper. The action proof must already be
 * privately bound by the server context factory.
 */

import {
  getServerAuthorityRequestContextProof,
  isServerAuthorityRequestContext,
  type ServerAuthorityRequestContextV1,
} from "../../server/internal/authenticated-context.ts";
import {
  type AuthorizationProofV1,
  isAuthorizationProofV1,
  requireAuthorizationProofV1,
} from "../../wp160-contracts.ts";
import type {
  Core100ServerContext,
  Core100ServerContextFactoryInput,
} from "./contracts.ts";

interface Core100AuthorityBinding {
  readonly authorityContext: ServerAuthorityRequestContextV1;
  readonly proof: AuthorizationProofV1;
  readonly principalId: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly correlationId: string;
}

const core100ServerContextBrand = new WeakSet<object>();
const core100AuthorityBinding = new WeakMap<object, Core100AuthorityBinding>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function expectedProof(input: {
  readonly authorityContext: ServerAuthorityRequestContextV1;
  readonly action: string;
  readonly capability: string;
}): {
  readonly principalId: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly correlationId: string;
} {
  return {
    principalId: input.authorityContext.principalId,
    tenantId: input.authorityContext.tenantContext.tenantId,
    resourceType: input.authorityContext.resourceType,
    resourceId: input.authorityContext.resourceId,
    action: input.action,
    capability: input.capability,
    correlationId: input.authorityContext.correlationId,
  };
}

function validateProof(
  proof: unknown,
  expected: ReturnType<typeof expectedProof>,
): proof is AuthorizationProofV1 {
  if (!isAuthorizationProofV1(proof, expected)) return false;
  try {
    requireAuthorizationProofV1(proof, expected);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mint the only CORE-100 server context accepted by the composition root.
 * The input authority context must already be the FP-003AA branded value.
 */
export function createCore100ServerContext(
  input: Core100ServerContextFactoryInput,
): Core100ServerContext {
  if (
    isRecord(input) &&
    Object.prototype.hasOwnProperty.call(input, "authorizationProof")
  ) {
    throw new Error("CORE100_CALLER_PROOF_REJECTED");
  }
  const now = input.now ?? Date.now();
  let authorityContext: ServerAuthorityRequestContextV1;
  try {
    if (!isServerAuthorityRequestContext(input.authorityContext, now)) {
      throw new Error("FP003AA_CONTEXT_REQUIRED");
    }
    authorityContext = input.authorityContext;
  } catch {
    throw new Error("CORE100_AUTHORITY_CONTEXT_INVALID");
  }

  const expected = expectedProof({
    authorityContext,
    action: input.action,
    capability: input.capability,
  });
  let proof: AuthorizationProofV1 | null;
  try {
    proof = getServerAuthorityRequestContextProof(authorityContext);
  } catch {
    throw new Error("CORE100_AUTHORIZATION_PROOF_INVALID");
  }
  if (proof === null || !validateProof(proof, expected)) {
    throw new Error("CORE100_AUTHORIZATION_PROOF_INVALID");
  }

  const context = Object.freeze({
    authorityContext,
    authorizationProof: proof,
  });
  core100ServerContextBrand.add(context);
  core100AuthorityBinding.set(
    context,
    Object.freeze({
      authorityContext,
      proof,
      ...expected,
    }),
  );
  return context;
}

export interface Core100AuthorityExpectation {
  readonly principalId: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly correlationId?: string;
}

/** Runtime brand check; structural copies intentionally return false. */
export function isCore100ServerContext(
  value: unknown,
  expected?: Core100AuthorityExpectation,
  now = Date.now(),
): value is Core100ServerContext {
  try {
    if (!isRecord(value) || !core100ServerContextBrand.has(value)) return false;
    const context = value as unknown as Core100ServerContext;
    const binding = core100AuthorityBinding.get(value);
    if (
      binding === undefined ||
      binding.authorityContext !== context.authorityContext ||
      binding.proof !== context.authorizationProof ||
      !isServerAuthorityRequestContext(context.authorityContext, now)
    ) return false;
    const authority = context.authorityContext;
    if (
      authority.principalId !== binding.principalId ||
      authority.tenantContext.tenantId !== binding.tenantId ||
      authority.resourceType !== binding.resourceType ||
      authority.resourceId !== binding.resourceId ||
      authority.correlationId !== binding.correlationId
    ) return false;
    if (
      expected !== undefined &&
      (binding.principalId !== expected.principalId ||
        binding.tenantId !== expected.tenantId ||
        binding.resourceType !== expected.resourceType ||
        binding.resourceId !== expected.resourceId ||
        binding.action !== expected.action ||
        binding.capability !== expected.capability ||
        (expected.correlationId !== undefined &&
          binding.correlationId !== expected.correlationId))
    ) return false;
    return validateProof(context.authorizationProof, {
      principalId: binding.principalId,
      tenantId: binding.tenantId,
      resourceType: binding.resourceType,
      resourceId: binding.resourceId,
      action: binding.action,
      capability: binding.capability,
      correlationId: binding.correlationId,
    });
  } catch {
    return false;
  }
}

export function getCore100AuthorityBinding(
  value: unknown,
): Core100AuthorityExpectation | null {
  if (!isCore100ServerContext(value)) return null;
  const binding = core100AuthorityBinding.get(value as object);
  return binding === undefined ? null : {
    principalId: binding.principalId,
    tenantId: binding.tenantId,
    resourceType: binding.resourceType,
    resourceId: binding.resourceId,
    action: binding.action,
    capability: binding.capability,
    correlationId: binding.correlationId,
  };
}
