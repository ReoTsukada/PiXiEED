/**
 * FP-003Z server composition implementation.
 *
 * This module is intentionally outside every Browser/build entry. It accepts
 * only a server-owned CanonicalRegistryAdapter; there is no Provider factory
 * and no caller-controlled authority object path.
 */

import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type AuthorizationProofV1,
  hashCanonical,
} from "../wp160-contracts.ts";
import {
  createProductProjection,
  createPurchaseRecord,
  type MarketDiagnosticCode,
  type MarketProductProjection,
  type MarketResult,
  materializePurchaseRights,
  type ProductProjectionInput,
  type PurchaseInput,
  type PurchaseRecord,
} from "../wp210-market-rights-core.ts";
import {
  asDirectWorkPaymentEventId,
  type DirectWorkAcceptance,
  type DirectWorkAgreement,
  type DirectWorkDelivery,
  type DirectWorkLedgerEntry,
  type DirectWorkMilestone,
  type DirectWorkPayment,
  type DirectWorkQuote,
  type DirectWorkRequest,
  type DirectWorkRightsDecision,
  sameDirectWorkAggregateIdentity,
} from "../wp220-direct-work-core.ts";
import {
  type ContributorRevenueAllocationV1,
  deriveCollaborativeRevenueAllocation,
  type DirectWorkFinancialSettlement,
  type FinancialAuthorityInput,
  type FinancialDiagnostic,
  type MarketFinancialSettlement,
  materializeMarketFinancialSettlement,
  resolveFinancialAuthority,
  type VerifiedProviderEventV1,
} from "../fp003-financial-integrity-core.ts";
import { isServerTenantContext } from "./authority-contracts.ts";
import { consumeServerAuthorityRequestContext } from "./internal/authenticated-context.ts";
import type {
  CanonicalRecordEnvelopeV2,
  CanonicalRegistryAdapter,
  CurrentDirectWorkChain,
  MarketSettlementAuthority,
  ServerAuthorityRequestContextV1,
  ServerTenantContextV1,
} from "./authority-contracts.ts";

export interface DirectWorkAuthorityCommand {
  readonly requestId: string;
  readonly requestRevision: string;
  readonly quoteId: string;
  readonly quoteRevision: string;
  readonly agreementId: string;
  readonly agreementRevision: string;
  readonly milestoneId: string;
  readonly milestoneRevision: string;
  readonly deliveryId: string;
  readonly deliveryRevision: string;
  readonly acceptanceId: string;
  readonly acceptanceRevision: string;
  readonly rightsDecisionId: string;
  readonly rightsRevision: string;
  readonly paymentId: string;
  readonly paymentRevision: string;
  readonly sourceEventId: string;
  readonly providerEventId: string;
}

export interface DirectWorkAuthorityService {
  validateCurrentDirectWorkChain(
    command: DirectWorkAuthorityCommand,
    context: ServerAuthorityRequestContextV1,
  ): Promise<AuthorityResult<true>>;
  projectProduct(
    command: Omit<ProductProjectionInput, "authorizationProofResolver">,
  ): Promise<ReturnType<typeof createProductProjection>>;
  createPurchase(
    command: Omit<PurchaseInput, "authorizationProofResolver">,
  ): Promise<ReturnType<typeof createPurchaseRecord>>;
  materializeDirectWorkSettlement(
    command: DirectWorkAuthorityCommand,
    context: ServerAuthorityRequestContextV1,
  ): Promise<AuthorityResult<DirectWorkFinancialSettlement>>;
  materializeMarketSettlement(
    command: {
      readonly productId: string;
      readonly purchaseId: string;
      readonly providerEventId: string;
    },
  ): Promise<AuthorityResult<MarketFinancialSettlement>>;
  deriveCollaborativeRevenue(
    command: { readonly productRevisionId: string },
  ): Promise<AuthorityResult<readonly ContributorRevenueAllocationV1[]>>;
}

export type AuthorityResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string };

function deny<T>(code: string, message: string): AuthorityResult<T> {
  return { ok: false, code, message };
}

function marketDeny<T>(
  code: MarketDiagnosticCode,
  message: string,
): MarketResult<T> {
  return {
    ok: false,
    diagnostics: [{
      code,
      severity: "ERROR",
      message,
      recoverable: false,
    }],
  };
}

const DIRECT_WORK_COMMAND_KEYS = [
  "requestId",
  "requestRevision",
  "quoteId",
  "quoteRevision",
  "agreementId",
  "agreementRevision",
  "milestoneId",
  "milestoneRevision",
  "deliveryId",
  "deliveryRevision",
  "acceptanceId",
  "acceptanceRevision",
  "rightsDecisionId",
  "rightsRevision",
  "paymentId",
  "paymentRevision",
  "sourceEventId",
  "providerEventId",
] as const;

function hasOnlyKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const allowed = [...keys].sort();
  return actual.length === allowed.length &&
    actual.every((key, index) => key === allowed[index]);
}

function sameMoney(
  left: {
    readonly amountMinor: number;
    readonly currency: string;
    readonly roundingPolicyVersion: string;
  },
  right: typeof left,
): boolean {
  return left.amountMinor === right.amountMinor &&
    left.currency === right.currency &&
    left.roundingPolicyVersion === right.roundingPolicyVersion;
}

function isTextValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function normalizeLedgerMaterialization(
  value: unknown,
  command: DirectWorkAuthorityCommand,
  chain: CurrentDirectWorkChain,
): Promise<AuthorityResult<DirectWorkLedgerEntry>> {
  try {
    if (value === null || typeof value !== "object") {
      return deny(
        "REGISTRY_INVALID_RESPONSE",
        "The Canonical Registry returned a malformed Ledger result.",
      );
    }
    const result = value as Record<string, unknown>;
    if (result.ok === false) {
      if (!isTextValue(result.code) || !isTextValue(result.message)) {
        return deny(
          "REGISTRY_INVALID_RESPONSE",
          "The Canonical Registry returned a malformed Ledger error.",
        );
      }
      return {
        ok: false,
        code: result.code,
        message: result.message,
      };
    }
    if (
      result.ok !== true || result.value === null ||
      typeof result.value !== "object"
    ) {
      return deny(
        "REGISTRY_INVALID_RESPONSE",
        "The Canonical Registry returned a malformed Ledger success.",
      );
    }
    const entry = result.value as Record<string, unknown>;
    const payment = chain.payment.record;
    const sourceEvent = chain.sourceEvent;
    const expectedEntryType = sourceEvent.type === "REFUNDED"
      ? "REVERSAL"
      : "SALE";
    const expectedDirection = sourceEvent.type === "REFUNDED"
      ? "DEBIT"
      : "CREDIT";
    const amount = entry.amount;
    const amountRecord = amount !== null && typeof amount === "object"
      ? amount as Record<string, unknown>
      : null;
    if (
      entry.ledgerEntryId !==
        `${command.paymentId}:ledger:${command.sourceEventId}` ||
      entry.requestId !== payment.requestId ||
      entry.paymentId !== payment.paymentId ||
      entry.sourceEventId !== sourceEvent.eventId ||
      entry.entryType !== expectedEntryType ||
      entry.direction !== expectedDirection ||
      amountRecord === null ||
      !sameMoney(
        amountRecord as unknown as typeof payment.amount,
        payment.amount,
      ) ||
      !isTextValue(entry.immutableHash) ||
      !/^[0-9a-f]{64}$/.test(entry.immutableHash)
    ) {
      return deny(
        "REGISTRY_INVALID_RESPONSE",
        "The Canonical Registry returned a Ledger entry that is not bound to the current Payment.",
      );
    }
    return { ok: true, value: entry as unknown as DirectWorkLedgerEntry };
  } catch {
    return deny(
      "REGISTRY_INVALID_RESPONSE",
      "The Canonical Registry returned a malformed Ledger result.",
    );
  }
}

async function verifyEnvelope<T>(
  envelope: CanonicalRecordEnvelopeV2<T>,
  resourceType: string,
  resourceId: string,
  tenantContext: ServerTenantContextV1,
): Promise<AuthorityResult<T>> {
  if (
    envelope.ref.schemaVersion !== "CANONICAL_RECORD_REF_V2" ||
    envelope.ref.origin !== "SERVER_REGISTRY" ||
    envelope.ref.resourceType !== resourceType ||
    envelope.ref.resourceId !== resourceId ||
    envelope.ref.tenantId !== tenantContext.tenantId ||
    envelope.ref.revision.length === 0
  ) {
    return deny(
      "CANONICAL_RECORD_INVALID",
      "The server Registry returned a record with invalid identity or provenance.",
    );
  }
  if (await hashCanonical(envelope.record) !== envelope.ref.canonicalHash) {
    return deny(
      "CANONICAL_RECORD_HASH_MISMATCH",
      "The server Registry record hash does not match its stored canonical value.",
    );
  }
  return { ok: true, value: envelope.record };
}

function authorityExpected(
  resourceType: string,
  resourceId: string,
  action: string,
  capability: string,
  principalId: string | null,
): AuthorizationProofExpectation {
  return {
    principalId,
    resourceType,
    resourceId,
    action,
    capability,
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
  };
}

function firstFinancialError(
  result: { readonly diagnostics: readonly FinancialDiagnostic[] },
): AuthorityResult<never> {
  const diagnostic = result.diagnostics[0];
  return deny(
    diagnostic?.code ?? "FINANCIAL_DENIED",
    diagnostic?.message ?? "Financial authority resolution was denied.",
  );
}

function refMatches<T>(
  envelope: CanonicalRecordEnvelopeV2<T>,
  resourceType: string,
  resourceId: string,
  expectedRevision: string,
  tenantContext: ServerTenantContextV1,
): boolean {
  return envelope.ref.resourceType === resourceType &&
    envelope.ref.resourceId === resourceId &&
    envelope.ref.revision === expectedRevision &&
    envelope.ref.tenantId === tenantContext.tenantId;
}

function graphMatches(chain: CurrentDirectWorkChain): boolean {
  const request = chain.request.record;
  const quote = chain.quote.record;
  const agreement = chain.agreement.record;
  const milestone = chain.milestone.record;
  const delivery = chain.delivery.record;
  const acceptance = chain.acceptance.record;
  const rights = chain.rights.record;
  const payment = chain.payment.record;
  const records = [
    request,
    quote,
    agreement,
    milestone,
    delivery,
    acceptance,
    rights,
    payment,
  ];
  if (
    records.some((record) =>
      record.aggregateIdentity.tenantId !== chain.tenantContext.tenantId
    )
  ) return false;
  const quoteIdentity = {
    ...request.aggregateIdentity,
    quoteId: quote.quoteId,
  };
  const agreementIdentity = {
    ...quote.aggregateIdentity,
    agreementId: agreement.agreementId,
  };
  const milestoneIdentity = {
    ...agreement.aggregateIdentity,
    milestoneId: milestone.milestoneId,
  };
  const deliveryIdentity = {
    ...milestone.aggregateIdentity,
    deliveryId: delivery.deliveryId,
  };
  const acceptanceIdentity = {
    ...delivery.aggregateIdentity,
    acceptanceId: acceptance.acceptanceId,
  };
  const rightsIdentity = {
    ...acceptance.aggregateIdentity,
    rightsDecisionId: rights.rightsDecisionId,
  };
  const paymentIdentity = {
    ...agreement.aggregateIdentity,
    paymentId: payment.paymentId,
  };
  return sameDirectWorkAggregateIdentity(
    quote.aggregateIdentity,
    quoteIdentity,
  ) &&
    sameDirectWorkAggregateIdentity(
      agreement.aggregateIdentity,
      agreementIdentity,
    ) &&
    sameDirectWorkAggregateIdentity(
      milestone.aggregateIdentity,
      milestoneIdentity,
    ) &&
    sameDirectWorkAggregateIdentity(
      delivery.aggregateIdentity,
      deliveryIdentity,
    ) &&
    sameDirectWorkAggregateIdentity(
      acceptance.aggregateIdentity,
      acceptanceIdentity,
    ) &&
    sameDirectWorkAggregateIdentity(rights.aggregateIdentity, rightsIdentity) &&
    sameDirectWorkAggregateIdentity(
      payment.aggregateIdentity,
      paymentIdentity,
    ) &&
    quote.requestId === request.requestId &&
    quote.requestRecordVersion === request.recordVersion &&
    agreement.requestId === request.requestId &&
    agreement.quoteId === quote.quoteId &&
    agreement.quoteTermsHash === quote.termsHash &&
    milestone.requestId === request.requestId &&
    milestone.agreementId === agreement.agreementId &&
    milestone.agreementRecordVersion === agreement.agreementRecordVersion &&
    delivery.requestId === request.requestId &&
    delivery.milestoneId === milestone.milestoneId &&
    delivery.milestoneRecordVersion === milestone.milestoneRecordVersion &&
    acceptance.requestId === request.requestId &&
    acceptance.milestoneId === milestone.milestoneId &&
    acceptance.deliveryId === delivery.deliveryId &&
    acceptance.milestoneRecordVersion === milestone.milestoneRecordVersion &&
    acceptance.deliveryRecordVersion === delivery.deliveryRecordVersion &&
    rights.requestId === request.requestId &&
    rights.acceptanceId === acceptance.acceptanceId &&
    rights.acceptanceRecordVersion === acceptance.acceptanceRecordVersion &&
    payment.requestId === request.requestId &&
    payment.agreementId === agreement.agreementId &&
    payment.quoteId === quote.quoteId &&
    payment.requestRecordVersion === request.recordVersion &&
    payment.quoteRecordVersion === quote.quoteRecordVersion &&
    payment.agreementRecordVersion === agreement.agreementRecordVersion;
}

async function verifyCurrentChain(
  chain: CurrentDirectWorkChain,
  command: DirectWorkAuthorityCommand,
): Promise<AuthorityResult<true>> {
  if (!isServerTenantContext(chain.tenantContext)) {
    return deny(
      "TENANT_CONTEXT_INVALID",
      "The Registry chain is not bound to a valid Server Tenant context.",
    );
  }
  const refs: readonly [
    CanonicalRecordEnvelopeV2<unknown>,
    string,
    string,
    string,
  ][] = [
    [
      chain.request,
      "DIRECT_WORK_REQUEST",
      command.requestId,
      command.requestRevision,
    ],
    [chain.quote, "DIRECT_WORK_QUOTE", command.quoteId, command.quoteRevision],
    [
      chain.agreement,
      "DIRECT_WORK_AGREEMENT",
      command.agreementId,
      command.agreementRevision,
    ],
    [
      chain.milestone,
      "DIRECT_WORK_MILESTONE",
      command.milestoneId,
      command.milestoneRevision,
    ],
    [
      chain.delivery,
      "DIRECT_WORK_DELIVERY",
      command.deliveryId,
      command.deliveryRevision,
    ],
    [
      chain.acceptance,
      "DIRECT_WORK_ACCEPTANCE",
      command.acceptanceId,
      command.acceptanceRevision,
    ],
    [
      chain.rights,
      "DIRECT_WORK_RIGHTS",
      command.rightsDecisionId,
      command.rightsRevision,
    ],
    [
      chain.payment,
      "DIRECT_WORK_PAYMENT",
      command.paymentId,
      command.paymentRevision,
    ],
  ];
  for (const [envelope, type, id, expectedRevision] of refs) {
    if (
      !refMatches(envelope, type, id, expectedRevision, chain.tenantContext)
    ) {
      return deny(
        "STALE_RECORD",
        `${type} is not the requested current Tenant-scoped revision.`,
      );
    }
    const verified = await verifyEnvelope(
      envelope,
      type,
      id,
      chain.tenantContext,
    );
    if (!verified.ok) return verified;
  }
  const heads = chain.currentHeads;
  if (
    heads.requestRevision !== chain.request.ref.revision ||
    heads.quoteRevision !== chain.quote.ref.revision ||
    heads.agreementRevision !== chain.agreement.ref.revision ||
    heads.milestoneRevision !== chain.milestone.ref.revision ||
    heads.deliveryRevision !== chain.delivery.ref.revision ||
    heads.acceptanceRevision !== chain.acceptance.ref.revision ||
    heads.rightsRevision !== chain.rights.ref.revision ||
    heads.paymentRevision !== chain.payment.ref.revision
  ) {
    return deny(
      "STALE_AGGREGATE",
      "The Registry head set is internally inconsistent.",
    );
  }
  if (!graphMatches(chain)) {
    return deny(
      "AGGREGATE_GRAPH_INVALID",
      "The persisted Direct Work records do not form one Request-rooted graph.",
    );
  }
  return { ok: true, value: true };
}

function verifyProviderBinding(
  chain: CurrentDirectWorkChain,
): AuthorityResult<true> {
  const payment = chain.payment.record;
  const authority = chain.financial.authority;
  if (chain.financial.proof.tenantId !== chain.tenantContext.tenantId) {
    return deny(
      "TENANT_CONTEXT_MISMATCH",
      "Financial Authority is outside the current Tenant namespace.",
    );
  }
  if (
    chain.providerEvent.eventId !== authority.providerEventId ||
    chain.providerEvent.payloadFingerprint !== authority.payloadFingerprint ||
    chain.sourceEvent.eventId !==
      asDirectWorkPaymentEventId(chain.providerEvent.eventId) ||
    chain.sourceEvent.paymentId !== payment.paymentId ||
    chain.sourceEvent.requestId !== payment.requestId
  ) {
    return deny(
      "PROVIDER_EVENT_INVALID",
      "Provider Event is not bound to the current Payment and Financial Authority.",
    );
  }
  if (
    authority.sourceKind !== "DIRECT_WORK_PAYMENT" ||
    authority.paymentId !== payment.paymentId ||
    authority.requestId !== payment.requestId ||
    !sameMoney(authority.gross, payment.amount)
  ) {
    return deny(
      "PAYMENT_BINDING_MISMATCH",
      "Financial Authority is not derived from the current Payment.",
    );
  }
  if (
    payment.status !==
      (authority.settlementState === "PAID" ? "PAID" : "REFUNDED")
  ) {
    return deny(
      "PAYMENT_BINDING_MISMATCH",
      "Payment status is not derived from the verified Provider Event.",
    );
  }
  return { ok: true, value: true };
}

function toFinancialInput(
  chain: CurrentDirectWorkChain,
): FinancialAuthorityInput {
  return {
    providerEvent: chain.providerEvent,
    canonicalPrincipalId: chain.canonicalPrincipalId,
    authorizationProof: chain.financial.proof,
    authorizationProofResolver: ({ expected }) => {
      if (
        expected.resourceType !== "FINANCIAL_ALLOCATION" ||
        expected.resourceId !== chain.providerEvent.sourceId
      ) throw new Error("FINANCIAL_AUTHORITY_SCOPE_MISMATCH");
      return chain.financial.proof;
    },
    authorityResolver: () => chain.financial.authority,
  };
}

function marketFinancialInput(
  settlement: MarketSettlementAuthority,
): FinancialAuthorityInput {
  return {
    providerEvent: settlement.providerEvent,
    canonicalPrincipalId: settlement.canonicalPrincipalId,
    authorizationProof: settlement.financial.proof,
    authorizationProofResolver: ({ expected }) => {
      if (expected.resourceId !== settlement.providerEvent.sourceId) {
        throw new Error("FINANCIAL_AUTHORITY_SCOPE_MISMATCH");
      }
      return settlement.financial.proof;
    },
    authorityResolver: () => settlement.financial.authority,
  };
}

async function loadCurrentDirectWorkChain(
  registry: CanonicalRegistryAdapter,
  command: DirectWorkAuthorityCommand,
  context: ServerAuthorityRequestContextV1,
): Promise<AuthorityResult<CurrentDirectWorkChain>> {
  if (
    !await consumeServerAuthorityRequestContext(context, {
      resourceType: "DIRECT_WORK_REQUEST",
      resourceId: command.requestId,
      membershipRegistry: registry.membershipRegistry,
    })
  ) {
    return deny(
      "SERVER_CONTEXT_INVALID",
      "Direct Work authority requires a fresh authenticated Server Composition Root context.",
    );
  }
  const tenantContext = context.tenantContext;
  let chain: CurrentDirectWorkChain | null;
  try {
    chain = await registry.getCurrentDirectWorkChain({
      tenantContext,
      membershipId: context.membershipId,
      membershipRevision: context.membershipRevision,
      requestId: command.requestId,
      paymentId: command.paymentId,
      sourceEventId: command.sourceEventId,
      providerEventId: command.providerEventId,
    });
  } catch {
    return deny(
      "REGISTRY_UNAVAILABLE",
      "The Canonical Registry could not provide a current Direct Work chain.",
    );
  }
  if (chain === null) {
    return deny(
      "STALE_RECORD",
      "The requested Direct Work chain is not the current Tenant-scoped Registry chain.",
    );
  }
  try {
    if (chain.tenantContext.tenantId !== tenantContext.tenantId) {
      return deny(
        "TENANT_CONTEXT_MISMATCH",
        "The Registry returned a chain from another Tenant namespace.",
      );
    }
  } catch {
    return deny(
      "REGISTRY_INVALID_RESPONSE",
      "The Canonical Registry returned a malformed Direct Work chain.",
    );
  }
  return { ok: true, value: chain };
}

export function composeAuthorityService(
  registry: CanonicalRegistryAdapter,
): DirectWorkAuthorityService {
  return Object.freeze({
    async validateCurrentDirectWorkChain(
      command: DirectWorkAuthorityCommand,
      context: ServerAuthorityRequestContextV1,
    ): Promise<AuthorityResult<true>> {
      if (!hasOnlyKeys(command, DIRECT_WORK_COMMAND_KEYS)) {
        return deny(
          "COMMAND_SCHEMA_INVALID",
          "Direct Work commands accept IDs and expected revisions only.",
        );
      }
      const chain = await loadCurrentDirectWorkChain(
        registry,
        command,
        context,
      );
      if (!chain.ok) return chain;
      try {
        return await verifyCurrentChain(chain.value, command);
      } catch {
        return deny(
          "REGISTRY_INVALID_RESPONSE",
          "The Canonical Registry returned an invalid Direct Work chain.",
        );
      }
    },
    async projectProduct(
      command: Omit<ProductProjectionInput, "authorizationProofResolver">,
    ): Promise<MarketResult<MarketProductProjection>> {
      try {
        const tenantContext = await registry.resolveTenantContext({
          resourceType: "MARKET_PRODUCT",
          resourceId: command.productId,
        });
        if (tenantContext === null) {
          return marketDeny<MarketProductProjection>(
            "PERMISSION_DENIED",
            "The Server Registry could not resolve a Tenant namespace.",
          );
        }
        const resolved = await registry.resolvePrincipal({
          tenantContext,
          callerProof: command.authorizationProof,
          resourceType: "MARKET_PRODUCT",
          resourceId: command.productId,
          claimedPrincipalId: command.ownerAccountId,
        });
        return createProductProjection({
          ...command,
          ownerAccountId: resolved.canonicalPrincipalId ?? "",
          authorizationProof: resolved.proof,
          authorizationProofResolver: () => resolved.proof,
        });
      } catch {
        return marketDeny<MarketProductProjection>(
          "PERMISSION_DENIED",
          "The Server Registry could not provide a valid Product authority.",
        );
      }
    },
    async createPurchase(
      command: Omit<PurchaseInput, "authorizationProofResolver">,
    ): Promise<MarketResult<PurchaseRecord>> {
      try {
        const tenantContext = await registry.resolveTenantContext({
          resourceType: "MARKET_PURCHASE",
          resourceId: command.purchaseId,
        });
        if (tenantContext === null) {
          return marketDeny<PurchaseRecord>(
            "PERMISSION_DENIED",
            "The Server Registry could not resolve a Tenant namespace.",
          );
        }
        const resolved = await registry.resolvePrincipal({
          tenantContext,
          callerProof: command.authorizationProof,
          resourceType: "MARKET_PURCHASE",
          resourceId: command.purchaseId,
          claimedPrincipalId: command.buyerAccountId,
        });
        return createPurchaseRecord({
          ...command,
          buyerAccountId: resolved.canonicalPrincipalId ?? "",
          authorizationProof: resolved.proof,
          authorizationProofResolver: () => resolved.proof,
        });
      } catch {
        return marketDeny<PurchaseRecord>(
          "PERMISSION_DENIED",
          "The Server Registry could not provide a valid Purchase authority.",
        );
      }
    },
    async materializeDirectWorkSettlement(
      command: DirectWorkAuthorityCommand,
      context: ServerAuthorityRequestContextV1,
    ): Promise<AuthorityResult<DirectWorkFinancialSettlement>> {
      if (!hasOnlyKeys(command, DIRECT_WORK_COMMAND_KEYS)) {
        return deny(
          "COMMAND_SCHEMA_INVALID",
          "Settlement commands accept IDs and expected revisions only.",
        );
      }
      const loaded = await loadCurrentDirectWorkChain(
        registry,
        command,
        context,
      );
      if (!loaded.ok) return loaded;
      const chain = loaded.value;
      let current: AuthorityResult<true>;
      try {
        current = await verifyCurrentChain(chain, command);
      } catch {
        return deny(
          "REGISTRY_INVALID_RESPONSE",
          "The Canonical Registry returned an invalid Direct Work chain.",
        );
      }
      if (!current.ok) return current;
      const provider = verifyProviderBinding(chain);
      if (!provider.ok) return provider;
      const financial = resolveFinancialAuthority(toFinancialInput(chain));
      if (!financial.ok) return firstFinancialError(financial);
      let ledgerResponse: unknown;
      try {
        ledgerResponse = await registry.materializeLedger({
          tenantContext: chain.tenantContext,
          membershipId: context.membershipId,
          membershipRevision: context.membershipRevision,
          paymentId: command.paymentId,
          expectedRevision: command.paymentRevision,
          sourceEventId: command.sourceEventId,
          ledgerEntryId: `${command.paymentId}:ledger:${command.sourceEventId}`,
        });
      } catch {
        return deny(
          "REGISTRY_UNAVAILABLE",
          "The Canonical Registry could not materialize a Ledger entry.",
        );
      }
      const ledger = await normalizeLedgerMaterialization(
        ledgerResponse,
        command,
        chain,
      );
      if (!ledger.ok) return ledger;
      return {
        ok: true,
        value: {
          payment: chain.payment.record,
          allocations: financial.value.allocations,
          ledgerEntry: ledger.value,
        },
      };
    },
    async materializeMarketSettlement(
      command: {
        readonly productId: string;
        readonly purchaseId: string;
        readonly providerEventId: string;
      },
    ): Promise<AuthorityResult<MarketFinancialSettlement>> {
      try {
        const tenantContext = await registry.resolveTenantContext({
          resourceType: "MARKET_PRODUCT",
          resourceId: command.productId,
        });
        if (tenantContext === null) {
          return deny(
            "TENANT_CONTEXT_REQUIRED",
            "The Server Registry could not resolve a Tenant namespace for the Market settlement.",
          );
        }
        const settlement = await registry.getCurrentMarketSettlement({
          tenantContext,
          ...command,
        });
        if (settlement === null) {
          return deny(
            "STALE_RECORD",
            "The requested Market records are not current Registry records.",
          );
        }
        const product = await verifyEnvelope(
          settlement.product,
          "MARKET_PRODUCT",
          command.productId,
          tenantContext,
        );
        if (!product.ok) return product;
        const purchase = await verifyEnvelope(
          settlement.purchase,
          "MARKET_PURCHASE",
          command.purchaseId,
          tenantContext,
        );
        if (!purchase.ok) return purchase;
        const financial = await materializeMarketFinancialSettlement({
          ...marketFinancialInput(settlement),
          product: product.value,
          purchase: purchase.value,
          paymentEvents: settlement.paymentEvents,
          entitlementId: settlement.entitlementId as never,
        });
        if (!financial.ok) return firstFinancialError(financial);
        return { ok: true, value: financial.value };
      } catch {
        return deny(
          "REGISTRY_INVALID_RESPONSE",
          "The Server Registry returned an invalid Market settlement.",
        );
      }
    },
    async deriveCollaborativeRevenue(
      command: { readonly productRevisionId: string },
    ): Promise<AuthorityResult<readonly ContributorRevenueAllocationV1[]>> {
      if (!hasOnlyKeys(command, ["productRevisionId"])) {
        return deny(
          "COMMAND_SCHEMA_INVALID",
          "Revenue derivation accepts only the Product Revision ID.",
        );
      }
      try {
        const tenantContext = await registry.resolveTenantContext({
          resourceType: "COLLABORATIVE_REVENUE_AUTHORITY",
          resourceId: command.productRevisionId,
        });
        if (tenantContext === null) {
          return deny(
            "TENANT_CONTEXT_REQUIRED",
            "The Server Registry could not resolve a Tenant namespace for the revenue authority.",
          );
        }
        const authority = await registry.getCollaborativeRevenueAuthority({
          tenantContext,
          productRevisionId: command.productRevisionId,
        });
        if (authority === null) {
          return deny(
            "STALE_RECORD",
            "The Product Revision is not a current Registry record.",
          );
        }
        const verified = await verifyEnvelope(
          authority,
          "COLLABORATIVE_REVENUE_AUTHORITY",
          command.productRevisionId,
          tenantContext,
        );
        if (!verified.ok) return verified;
        const result = await deriveCollaborativeRevenueAllocation({
          authority: verified.value,
        });
        return result.ok
          ? {
            ok: true as const,
            value: result.value as readonly ContributorRevenueAllocationV1[],
          }
          : firstFinancialError(result);
      } catch {
        return deny(
          "REGISTRY_INVALID_RESPONSE",
          "The Server Registry returned an invalid collaborative revenue authority.",
        );
      }
    },
  });
}
