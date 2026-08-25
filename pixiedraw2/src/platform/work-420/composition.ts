/**
 * WORK-420 server-only Direct Work composition root.
 *
 * The root resolves the current canonical aggregate before every operation.
 * Commands contain only user intent and untrusted claims.  The registry owns
 * the current records, next IDs, terms, money, Provider identity, and commit
 * boundary.  This is an isolated reference composition; it does not connect
 * to a route, database, Storage, Provider, or production system.
 */

import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type ContentHash,
  hashCanonical,
  requireAuthorizationProofV1,
} from "../../wp160-contracts.ts";
import {
  type DirectWorkFinancialSettlement,
  type FinancialAuthorityResolutionV1,
  FP003_FINANCIAL_ACTION,
  FP003_FINANCIAL_CAPABILITY,
  FP003_FINANCIAL_RESOURCE_TYPE,
  materializeDirectWorkFinancialSettlement,
  type VerifiedProviderEventV1,
} from "../../fp003-financial-integrity-core.ts";
import {
  acceptDirectWorkQuote,
  applyDirectWorkPaymentEvent,
  asDirectWorkPaymentEventId,
  createDirectWorkAgreement,
  createDirectWorkLedgerEntry,
  createDirectWorkMilestone,
  createDirectWorkPayment,
  createDirectWorkQuote,
  decideDirectWorkRights,
  type DirectWorkAcceptance,
  type DirectWorkAgreement,
  type DirectWorkDelivery,
  type DirectWorkLedgerEntry,
  type DirectWorkMilestone,
  type DirectWorkPayment,
  type DirectWorkPaymentEvent,
  type DirectWorkQuote,
  type DirectWorkRequest,
  type DirectWorkRightsDecision,
  isDirectWorkRecordSealed,
  type Money,
  recordDirectWorkAcceptance,
  signDirectWorkAgreement,
  submitDirectWorkDelivery,
  sumMoney,
  transitionDirectWorkMilestone,
  transitionDirectWorkRequest,
  validateMoney,
} from "../../wp220-direct-work-core.ts";
import { isServerTenantContext } from "../../server/authority-contracts.ts";
import {
  consumeServerAuthorityRequestContext,
  isServerAuthorityRequestContext,
  type ServerAuthorityRequestContextV1,
} from "../../server/internal/authenticated-context.ts";
import type {
  CanonicalRecordEnvelopeV2,
} from "../../server/authority-contracts.ts";
import {
  WORK420_SCHEMA_VERSION,
  type Work420AcceptanceAuthority,
  type Work420AgreementAuthority,
  type Work420Authority,
  type Work420CanonicalRegistry,
  type Work420Command,
  type Work420CommitMembershipIdentity,
  type Work420CurrentAggregate,
  type Work420CurrentHeads,
  type Work420DeliveryAuthority,
  type Work420Diagnostic,
  type Work420DiagnosticCode,
  type Work420IdempotencyLookup,
  type Work420LedgerAuthority,
  type Work420MilestoneAuthority,
  type Work420Operation,
  type Work420PaymentAuthority,
  type Work420PaymentEventAuthority,
  type Work420PublicAuditSummary,
  type Work420QuoteAuthority,
  type Work420Result,
  type Work420RightsAuthority,
  type Work420TransitionResult,
  type Work420UntrustedClaims,
} from "./contracts.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SAFE_HASH = /^[a-f0-9]{64}$/;
const ALLOWED_COMMAND_KEYS = new Set(["operation", "claims", "idempotencyKey"]);
const ALLOWED_CLAIM_KEYS = new Set([
  "requestId",
  "aggregateId",
  "parentId",
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
  "ledgerEntryId",
  "ledgerRevision",
  "termsHash",
  "amountMinor",
  "currency",
  "recipientAccountId",
  "royaltyRateBps",
  "licenseSnapshotHash",
  "rights",
  "acceptanceDecision",
  "sourceEventId",
  "providerEventId",
  "providerPayloadFingerprint",
]);
const PRIVATE_CLAIM_KEYS = new Set([
  "body",
  "rawBody",
  "requestBody",
  "privateContent",
  "contact",
  "email",
  "phone",
  "paymentDetail",
  "paymentCard",
  "license",
  "royalty",
  "ledger",
]);

export type Work420FeatureFlags = Readonly<Record<string, boolean | undefined>>;

export const DEFAULT_WORK420_FEATURE_FLAGS: Readonly<{
  "work-420-composition": false;
}> = Object.freeze({
  "work-420-composition": false,
});

export interface Work420CompositionOptions {
  readonly flags?: Work420FeatureFlags;
  readonly killSwitch?: boolean;
}

function diagnostic(
  code: Work420DiagnosticCode,
  message: string,
  path?: string,
  metadata?: Readonly<Record<string, string | number | boolean>>,
): Work420Diagnostic {
  return {
    code,
    severity: "ERROR",
    message,
    ...(path === undefined ? {} : { path }),
    ...(metadata === undefined ? {} : { metadata }),
    recoverable: false,
  };
}

function info(
  code: Work420DiagnosticCode,
  message: string,
  metadata?: Readonly<Record<string, string | number | boolean>>,
): Work420Diagnostic {
  return {
    code,
    severity: "INFO",
    message,
    ...(metadata === undefined ? {} : { metadata }),
    recoverable: true,
  };
}

function failure<T>(
  diagnostics: readonly Work420Diagnostic[],
): Work420Result<T> {
  return { ok: false, diagnostics };
}

function success<T>(
  value: T,
  diagnostics: readonly Work420Diagnostic[] = [],
): Work420Result<T> {
  return { ok: true, value, diagnostics };
}

function validId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validHash(value: unknown): value is ContentHash {
  return typeof value === "string" && SAFE_HASH.test(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recordId<T>(envelope: CanonicalRecordEnvelopeV2<T>): string {
  return envelope.ref.resourceId;
}

function sameMoney(
  left: {
    readonly amountMinor: number;
    readonly currency: string;
    readonly roundingPolicyVersion: string;
  },
  right: {
    readonly amountMinor: number;
    readonly currency: string;
    readonly roundingPolicyVersion: string;
  },
): boolean {
  return left.amountMinor === right.amountMinor &&
    left.currency === right.currency &&
    left.roundingPolicyVersion === right.roundingPolicyVersion;
}

function sameProviderIdentity(
  left: VerifiedProviderEventV1,
  right: VerifiedProviderEventV1,
): boolean {
  return left.schemaVersion === right.schemaVersion &&
    left.eventId === right.eventId &&
    left.payloadFingerprint === right.payloadFingerprint &&
    left.sourceKind === right.sourceKind &&
    left.sourceId === right.sourceId &&
    left.eventType === right.eventType &&
    left.environment === right.environment;
}

function expectedIdentity(
  parent: DirectWorkRequest["aggregateIdentity"],
  child: Readonly<Record<string, string>>,
): DirectWorkRequest["aggregateIdentity"] {
  return {
    ...parent,
    ...child,
    aggregateId: parent.requestId,
    requestId: parent.requestId,
  };
}

function appendEnvelope<T>(
  history: readonly CanonicalRecordEnvelopeV2<T>[],
  value: CanonicalRecordEnvelopeV2<T> | undefined,
): readonly CanonicalRecordEnvelopeV2<T>[] {
  if (value === undefined) return history;
  if (history.some((item) => item.ref.resourceId === value.ref.resourceId)) {
    return history;
  }
  return [...history, value];
}

function recordRevision(record: Record<string, unknown>): string {
  const version = Object.entries(record).find(([key]) =>
    key.endsWith("RecordVersion")
  )?.[1];
  return validId(String(version)) ? String(version) : "1";
}

async function makeEnvelope<T extends object>(
  record: T,
  resourceType: string,
  resourceId: string,
  tenantId: string,
  revision: string,
): Promise<CanonicalRecordEnvelopeV2<T>> {
  return {
    ref: {
      schemaVersion: "CANONICAL_RECORD_REF_V2",
      resourceType,
      resourceId,
      tenantId,
      revision,
      canonicalHash: await hashCanonical(record),
      origin: "SERVER_REGISTRY",
    },
    record,
  };
}

function revisionFor(kind: string, record: Record<string, unknown>): string {
  const versionKey: Readonly<Record<string, string>> = {
    request: "recordVersion",
    quote: "quoteRecordVersion",
    agreement: "agreementRecordVersion",
    milestone: "milestoneRecordVersion",
    delivery: "deliveryRecordVersion",
    acceptance: "acceptanceRecordVersion",
    rights: "rightsRecordVersion",
    payment: "paymentRecordVersion",
    ledger: "ledgerRevision",
  };
  const version = record[versionKey[kind] ?? "recordVersion"];
  return `${kind.toLowerCase()}:v${typeof version === "number" ? version : 1}`;
}

function headsFor(
  aggregate: Omit<Work420CurrentAggregate, "currentHeads">,
): Work420CurrentHeads {
  return {
    requestRevision: aggregate.request.ref.revision,
    ...(aggregate.quote === undefined
      ? {}
      : { quoteRevision: aggregate.quote.ref.revision }),
    ...(aggregate.agreement === undefined
      ? {}
      : { agreementRevision: aggregate.agreement.ref.revision }),
    ...(aggregate.milestone === undefined
      ? {}
      : { milestoneRevision: aggregate.milestone.ref.revision }),
    ...(aggregate.delivery === undefined
      ? {}
      : { deliveryRevision: aggregate.delivery.ref.revision }),
    ...(aggregate.acceptance === undefined
      ? {}
      : { acceptanceRevision: aggregate.acceptance.ref.revision }),
    ...(aggregate.rights === undefined
      ? {}
      : { rightsRevision: aggregate.rights.ref.revision }),
    ...(aggregate.payment === undefined
      ? {}
      : { paymentRevision: aggregate.payment.ref.revision }),
    ...(aggregate.ledger === undefined
      ? {}
      : { ledgerRevision: aggregate.ledger.ref.revision }),
  };
}

async function withNextVersion(
  current: Work420CurrentAggregate,
  patch: Partial<
    Omit<
      Work420CurrentAggregate,
      "schemaVersion" | "aggregateVersion" | "revision" | "currentHeads"
    >
  >,
  options: { readonly clearAcceptance?: boolean } = {},
): Promise<Work420CurrentAggregate> {
  const base = options.clearAcceptance === true
    ? (({ acceptance: _acceptance, ...withoutAcceptance }) =>
      withoutAcceptance)(current)
    : current;
  const next = {
    ...base,
    ...patch,
    schemaVersion: WORK420_SCHEMA_VERSION,
    aggregateVersion: current.aggregateVersion + 1,
    revision: `work420:v${current.aggregateVersion + 1}`,
    deliveryHistory: Object.freeze(
      patch.deliveryHistory ?? current.deliveryHistory,
    ),
    acceptanceHistory: Object.freeze(
      patch.acceptanceHistory ?? current.acceptanceHistory,
    ),
    ledgerHistory: Object.freeze(
      patch.ledgerHistory ?? current.ledgerHistory,
    ),
  } as Omit<Work420CurrentAggregate, "currentHeads">;
  return Object.freeze({ ...next, currentHeads: headsFor(next) });
}

async function verifyEnvelope<T>(
  envelope: CanonicalRecordEnvelopeV2<T>,
  resourceType: string,
  tenantId: string,
): Promise<Work420Diagnostic | undefined> {
  if (
    envelope.ref.schemaVersion !== "CANONICAL_RECORD_REF_V2" ||
    envelope.ref.origin !== "SERVER_REGISTRY" ||
    envelope.ref.resourceType !== resourceType ||
    envelope.ref.tenantId !== tenantId ||
    !validId(envelope.ref.resourceId) ||
    !validId(envelope.ref.revision) ||
    !validHash(envelope.ref.canonicalHash)
  ) {
    return diagnostic(
      "CANONICAL_RECORD_INVALID",
      "The server Registry returned a record with invalid identity or provenance.",
      resourceType,
    );
  }
  if (await hashCanonical(envelope.record) !== envelope.ref.canonicalHash) {
    return diagnostic(
      "CANONICAL_RECORD_HASH_MISMATCH",
      "The server Registry record hash does not match its canonical value.",
      resourceType,
    );
  }
  return undefined;
}

async function verifyCurrentAggregate(
  aggregate: Work420CurrentAggregate,
): Promise<Work420Result<true>> {
  if (
    aggregate.schemaVersion !== WORK420_SCHEMA_VERSION ||
    !isServerTenantContext(aggregate.tenantContext) ||
    !Number.isSafeInteger(aggregate.aggregateVersion) ||
    aggregate.aggregateVersion < 1 ||
    !validId(aggregate.revision)
  ) {
    return failure([diagnostic(
      "REGISTRY_INVALID_RESPONSE",
      "The server Registry returned an invalid WORK-420 aggregate envelope.",
    )]);
  }
  const tenantId = aggregate.tenantContext.tenantId;
  const envelopes:
    readonly (readonly [CanonicalRecordEnvelopeV2<unknown>, string])[] = [
      [aggregate.request, "DIRECT_WORK_REQUEST"],
      ...(aggregate.quote === undefined
        ? []
        : [[aggregate.quote, "DIRECT_WORK_QUOTE"]] as const),
      ...(aggregate.agreement === undefined
        ? []
        : [[aggregate.agreement, "DIRECT_WORK_AGREEMENT"]] as const),
      ...(aggregate.milestone === undefined
        ? []
        : [[aggregate.milestone, "DIRECT_WORK_MILESTONE"]] as const),
      ...(aggregate.delivery === undefined
        ? []
        : [[aggregate.delivery, "DIRECT_WORK_DELIVERY"]] as const),
      ...(aggregate.acceptance === undefined
        ? []
        : [[aggregate.acceptance, "DIRECT_WORK_ACCEPTANCE"]] as const),
      ...(aggregate.rights === undefined
        ? []
        : [[aggregate.rights, "DIRECT_WORK_RIGHTS"]] as const),
      ...(aggregate.payment === undefined
        ? []
        : [[aggregate.payment, "DIRECT_WORK_PAYMENT"]] as const),
      ...(aggregate.ledger === undefined
        ? []
        : [[aggregate.ledger, "DIRECT_WORK_LEDGER"]] as const),
    ];
  for (const [envelope, type] of envelopes) {
    const result = await verifyEnvelope(envelope, type, tenantId);
    if (result !== undefined) return failure([result]);
  }
  const headChecks: readonly [
    keyof Work420CurrentHeads,
    CanonicalRecordEnvelopeV2<unknown> | undefined,
  ][] = [
    ["requestRevision", aggregate.request],
    ["quoteRevision", aggregate.quote],
    ["agreementRevision", aggregate.agreement],
    ["milestoneRevision", aggregate.milestone],
    ["deliveryRevision", aggregate.delivery],
    ["acceptanceRevision", aggregate.acceptance],
    ["rightsRevision", aggregate.rights],
    ["paymentRevision", aggregate.payment],
    ["ledgerRevision", aggregate.ledger],
  ];
  for (const [head, envelope] of headChecks) {
    if (aggregate.currentHeads[head] !== envelope?.ref.revision) {
      return failure([diagnostic(
        "STALE_CURRENT_RECORD",
        "A current aggregate head does not match its canonical envelope.",
        `currentHeads.${head}`,
      )]);
    }
  }
  const request = aggregate.request.record;
  const rootIdentity = {
    graphVersion: request.aggregateIdentity.graphVersion,
    tenantId,
    aggregateId: request.requestId,
    requestId: request.requestId,
  } as const;
  if (
    request.aggregateIdentity.aggregateId !== request.requestId ||
    request.aggregateIdentity.requestId !== request.requestId ||
    request.aggregateIdentity.tenantId !== tenantId ||
    request.aggregateIdentity.graphVersion !== "DIRECT_WORK_GRAPH_V1"
  ) {
    return failure([diagnostic(
      "AGGREGATE_GRAPH_INVALID",
      "The Request is not the canonical Direct Work aggregate root.",
      "request.aggregateIdentity",
    )]);
  }
  if (
    JSON.stringify(request.aggregateIdentity) !== JSON.stringify(rootIdentity)
  ) {
    return failure([diagnostic(
      "AGGREGATE_GRAPH_INVALID",
      "The Request root contains unexpected child identity fields.",
      "request.aggregateIdentity",
    )]);
  }
  const quote = aggregate.quote?.record;
  if (quote !== undefined) {
    if (
      JSON.stringify(quote.aggregateIdentity) !==
        JSON.stringify(
          expectedIdentity(rootIdentity, { quoteId: quote.quoteId }),
        ) ||
      quote.requestId !== request.requestId ||
      quote.requesterAccountId !== request.requesterAccountId ||
      quote.creatorAccountId !== request.creatorAccountId ||
      quote.scopeHash !== request.scopeHash ||
      quote.requestRecordVersion !== request.recordVersion
    ) {
      return failure([diagnostic(
        "CROSS_RECORD_MISMATCH",
        "Quote is not bound to the current Request identity and snapshot.",
        "quote",
      )]);
    }
    if (
      quote.status === "ACCEPTED" && quote.acceptedTermsHash !== quote.termsHash
    ) {
      return failure([diagnostic(
        "TERMS_HASH_MISMATCH",
        "Accepted Quote terms are not the immutable Quote terms snapshot.",
        "quote.acceptedTermsHash",
      )]);
    }
  }
  const agreement = aggregate.agreement?.record;
  if (agreement !== undefined) {
    if (
      quote === undefined ||
      JSON.stringify(agreement.aggregateIdentity) !==
        JSON.stringify(
          expectedIdentity(quote.aggregateIdentity, {
            agreementId: agreement.agreementId,
          }),
        ) ||
      agreement.requestId !== request.requestId ||
      agreement.quoteId !== quote.quoteId ||
      agreement.requestRecordVersion !== request.recordVersion ||
      agreement.quoteTermsHash !== quote.termsHash ||
      agreement.termsHash !== quote.termsHash ||
      !sameMoney(agreement.quoteTotal, quote.total)
    ) {
      return failure([diagnostic(
        "CROSS_RECORD_MISMATCH",
        "Agreement is not bound to the accepted Quote and canonical terms.",
        "agreement",
      )]);
    }
    if (quote.status !== "ACCEPTED") {
      return failure([diagnostic(
        "INVALID_STATE_TRANSITION",
        "Agreement cannot exist before Quote acceptance.",
        "agreement.status",
      )]);
    }
  }
  const milestone = aggregate.milestone?.record;
  if (milestone !== undefined) {
    if (
      agreement === undefined ||
      JSON.stringify(milestone.aggregateIdentity) !==
        JSON.stringify(
          expectedIdentity(agreement.aggregateIdentity, {
            milestoneId: milestone.milestoneId,
          }),
        ) ||
      milestone.requestId !== request.requestId ||
      milestone.agreementId !== agreement.agreementId ||
      milestone.agreementRecordVersion !== agreement.agreementRecordVersion ||
      !sameMoney(milestone.amount, agreement.quoteTotal)
    ) {
      return failure([diagnostic(
        "CROSS_RECORD_MISMATCH",
        "Milestone is not bound to the current Agreement.",
        "milestone",
      )]);
    }
    if (agreement.status !== "ACTIVE") {
      return failure([diagnostic(
        "INVALID_STATE_TRANSITION",
        "Milestone requires an active Agreement.",
        "milestone.status",
      )]);
    }
  }
  const delivery = aggregate.delivery?.record;
  if (delivery !== undefined) {
    if (
      milestone === undefined ||
      JSON.stringify(delivery.aggregateIdentity) !==
        JSON.stringify(
          expectedIdentity(milestone.aggregateIdentity, {
            deliveryId: delivery.deliveryId,
          }),
        ) ||
      delivery.requestId !== request.requestId ||
      delivery.milestoneId !== milestone.milestoneId ||
      delivery.milestoneRecordVersion > milestone.milestoneRecordVersion
    ) {
      return failure([diagnostic(
        "CROSS_RECORD_MISMATCH",
        "Delivery is not bound to the current Milestone chain.",
        "delivery",
      )]);
    }
  }
  const acceptance = aggregate.acceptance?.record;
  if (acceptance !== undefined) {
    if (
      milestone === undefined || delivery === undefined ||
      JSON.stringify(acceptance.aggregateIdentity) !==
        JSON.stringify(
          expectedIdentity(delivery.aggregateIdentity, {
            acceptanceId: acceptance.acceptanceId,
          }),
        ) ||
      acceptance.requestId !== request.requestId ||
      acceptance.milestoneId !== milestone.milestoneId ||
      acceptance.deliveryId !== delivery.deliveryId ||
      acceptance.scopeHash !== request.scopeHash ||
      acceptance.milestoneRecordVersion !== milestone.milestoneRecordVersion ||
      acceptance.deliveryRecordVersion !== delivery.deliveryRecordVersion ||
      acceptance.acceptedByAccountId !== request.requesterAccountId
    ) {
      return failure([diagnostic(
        "CROSS_RECORD_MISMATCH",
        "Acceptance is not bound to the current Delivery and Request snapshot.",
        "acceptance",
      )]);
    }
    if (
      acceptance.decision === "REJECTED" &&
      !validHash(acceptance.reasonHash ?? "")
    ) {
      return failure([diagnostic(
        "AGGREGATE_GRAPH_INVALID",
        "Rejected Acceptance requires a bounded reason hash.",
        "acceptance.reasonHash",
      )]);
    }
  }
  const rights = aggregate.rights?.record;
  if (rights !== undefined) {
    if (
      acceptance === undefined ||
      acceptance.decision !== "ACCEPTED" ||
      JSON.stringify(rights.aggregateIdentity) !==
        JSON.stringify(
          expectedIdentity(acceptance.aggregateIdentity, {
            rightsDecisionId: rights.rightsDecisionId,
          }),
        ) ||
      rights.requestId !== request.requestId ||
      rights.acceptanceId !== acceptance.acceptanceId ||
      rights.acceptanceRecordVersion !== acceptance.acceptanceRecordVersion ||
      rights.scopeHash !== request.scopeHash ||
      rights.createsMarketEntitlement !== false
    ) {
      return failure([diagnostic(
        "CROSS_RECORD_MISMATCH",
        "Rights are not bound to an explicitly accepted Delivery.",
        "rights",
      )]);
    }
  }
  const payment = aggregate.payment?.record;
  if (payment !== undefined) {
    if (
      quote === undefined || agreement === undefined ||
      acceptance === undefined || rights === undefined ||
      acceptance.decision !== "ACCEPTED" ||
      JSON.stringify(payment.aggregateIdentity) !==
        JSON.stringify(
          expectedIdentity(agreement.aggregateIdentity, {
            paymentId: payment.paymentId,
          }),
        ) ||
      payment.requestId !== request.requestId ||
      payment.agreementId !== agreement.agreementId ||
      payment.quoteId !== quote.quoteId ||
      payment.requestRecordVersion !== request.recordVersion ||
      payment.quoteRecordVersion !== quote.quoteRecordVersion ||
      payment.agreementRecordVersion !== agreement.agreementRecordVersion ||
      payment.quoteSnapshotHash !== quote.termsHash ||
      payment.agreementTermsHash !== agreement.termsHash ||
      !sameMoney(payment.amount, quote.total)
    ) {
      return failure([diagnostic(
        "PAYMENT_BINDING_MISMATCH",
        "Payment is not derived from the accepted Request, Quote, Agreement, and Rights chain.",
        "payment",
      )]);
    }
  }
  if (aggregate.sourceEvent !== undefined) {
    if (
      payment === undefined ||
      aggregate.sourceEvent.paymentId !== payment.paymentId ||
      aggregate.sourceEvent.requestId !== request.requestId ||
      aggregate.sourceEvent.quoteSnapshotHash !== payment.quoteSnapshotHash ||
      !validHash(aggregate.sourceEvent.fingerprint)
    ) {
      return failure([diagnostic(
        "PROVIDER_EVENT_INVALID",
        "Payment Event is not bound to the current Payment and Quote terms.",
        "sourceEvent",
      )]);
    }
  }
  if (aggregate.providerEvent !== undefined) {
    if (
      payment === undefined || aggregate.sourceEvent === undefined ||
      aggregate.providerEvent.sourceId !== payment.paymentId ||
      String(aggregate.providerEvent.eventId) !==
        String(aggregate.sourceEvent.eventId) ||
      aggregate.providerEvent.payloadFingerprint !==
        aggregate.sourceEvent.fingerprint
    ) {
      return failure([diagnostic(
        "PROVIDER_EVENT_INVALID",
        "Provider Event identity is not bound to the current Payment Event.",
        "providerEvent",
      )]);
    }
  }
  const ledger = aggregate.ledger?.record;
  if (ledger !== undefined) {
    if (
      payment === undefined || aggregate.sourceEvent === undefined ||
      ledger.requestId !== payment.requestId ||
      ledger.paymentId !== payment.paymentId ||
      ledger.sourceEventId !== aggregate.sourceEvent.eventId ||
      !validHash(ledger.immutableHash)
    ) {
      return failure([diagnostic(
        "LEDGER_BINDING_MISMATCH",
        "Ledger is not append-only bound to the current Payment Event.",
        "ledger",
      )]);
    }
  }
  const allHistoryIds = [
    ...aggregate.deliveryHistory.map(recordId),
    ...aggregate.acceptanceHistory.map(recordId),
    ...aggregate.ledgerHistory.map(recordId),
  ];
  if (new Set(allHistoryIds).size !== allHistoryIds.length) {
    return failure([diagnostic(
      "AGGREGATE_GRAPH_INVALID",
      "Aggregate history contains duplicate record identities.",
      "history",
    )]);
  }
  return success(true);
}

function featureEnabled(
  flags: Work420FeatureFlags,
  killSwitch: boolean,
): Work420Result<true> {
  if (killSwitch) {
    return failure([diagnostic(
      "KILL_SWITCH_ACTIVE",
      "WORK-420 composition is disabled by the kill switch.",
    )]);
  }
  if (flags["work-420-composition"] !== true) {
    return failure([diagnostic(
      "FEATURE_DISABLED",
      "WORK-420 composition is disabled by default.",
      "work-420-composition",
    )]);
  }
  return success(true);
}

function commandShape(command: unknown): Work420Result<Work420Command> {
  const value = asRecord(command);
  if (value === null || !hasOnlyKeys(value, ALLOWED_COMMAND_KEYS)) {
    return failure([diagnostic(
      "COMMAND_SCHEMA_INVALID",
      "WORK-420 commands accept an operation, bounded claims, and an idempotency key only.",
    )]);
  }
  if (typeof value.operation !== "string") {
    return failure([diagnostic(
      "COMMAND_SCHEMA_INVALID",
      "WORK-420 command operation is invalid.",
      "operation",
    )]);
  }
  if (value.idempotencyKey !== undefined && !validId(value.idempotencyKey)) {
    return failure([diagnostic(
      "COMMAND_SCHEMA_INVALID",
      "WORK-420 idempotency key must be a bounded identifier.",
      "idempotencyKey",
    )]);
  }
  if (value.claims !== undefined) {
    const claims = asRecord(value.claims);
    if (claims === null || !hasOnlyKeys(claims, ALLOWED_CLAIM_KEYS)) {
      const hasPrivate = claims !== null &&
        Object.keys(claims).some((key) => PRIVATE_CLAIM_KEYS.has(key));
      return failure([diagnostic(
        hasPrivate ? "PRIVATE_DATA_REJECTED" : "COMMAND_SCHEMA_INVALID",
        hasPrivate
          ? "Private Direct Work content and contact fields are outside the composition boundary."
          : "WORK-420 caller claims contain an unsupported field.",
        "claims",
      )]);
    }
  }
  return success(value as unknown as Work420Command);
}

function expectedClaimId(
  current: Work420CurrentAggregate,
  authority: Work420Authority,
  key: keyof Work420UntrustedClaims,
): string | undefined {
  const map: Readonly<Record<string, string | undefined>> = {
    requestId: current.request.ref.resourceId,
    aggregateId: current.request.record.requestId,
    quoteId: current.quote?.ref.resourceId ??
      (authority as Partial<Work420QuoteAuthority>).quoteId,
    quoteRevision: current.quote?.ref.revision,
    agreementId: current.agreement?.ref.resourceId ??
      (authority as Partial<Work420AgreementAuthority>).agreementId,
    agreementRevision: current.agreement?.ref.revision,
    milestoneId: current.milestone?.ref.resourceId ??
      (authority as Partial<Work420MilestoneAuthority>).milestoneId,
    milestoneRevision: current.milestone?.ref.revision,
    deliveryId: current.delivery?.ref.resourceId ??
      (authority as Partial<Work420DeliveryAuthority>).deliveryId,
    deliveryRevision: current.delivery?.ref.revision,
    acceptanceId: current.acceptance?.ref.resourceId ??
      (authority as Partial<Work420AcceptanceAuthority>).acceptanceId,
    acceptanceRevision: current.acceptance?.ref.revision,
    rightsDecisionId: current.rights?.ref.resourceId ??
      (authority as Partial<Work420RightsAuthority>).rightsDecisionId,
    rightsRevision: current.rights?.ref.revision,
    paymentId: current.payment?.ref.resourceId ??
      (authority as Partial<Work420PaymentAuthority>).paymentId,
    paymentRevision: current.payment?.ref.revision,
    ledgerEntryId: current.ledger?.ref.resourceId,
    ledgerRevision: current.ledger?.ref.revision,
  };
  return map[key];
}

function expectedParentId(
  current: Work420CurrentAggregate,
  operation: Work420Operation,
): string | undefined {
  if (operation === "ISSUE_QUOTE" || operation === "ACCEPT_QUOTE") {
    return current.request.record.requestId;
  }
  if (
    operation === "CREATE_AGREEMENT" || operation.startsWith("SIGN_AGREEMENT")
  ) return current.quote?.record.quoteId;
  if (operation === "CREATE_MILESTONE" || operation === "START_MILESTONE") {
    return current.agreement?.record.agreementId;
  }
  if (
    operation === "SUBMIT_DELIVERY" ||
    operation === "CREATE_RECOVERY_DELIVERY" ||
    operation === "MARK_DELIVERY_PENDING"
  ) return current.milestone?.record.milestoneId;
  if (operation === "DECIDE_ACCEPTANCE") {
    return current.delivery?.record.deliveryId;
  }
  if (operation === "DECIDE_RIGHTS") {
    return current.acceptance?.record.acceptanceId;
  }
  if (operation === "CREATE_PAYMENT") {
    return current.agreement?.record.agreementId;
  }
  if (
    operation === "APPLY_PAYMENT_EVENT" || operation === "MATERIALIZE_LEDGER"
  ) return current.payment?.record.paymentId;
  return current.request.record.requestId;
}

function expectedTermsHash(
  current: Work420CurrentAggregate,
  authority: Work420Authority,
): ContentHash | undefined {
  if ("termsHash" in authority && validHash(authority.termsHash)) {
    return authority.termsHash;
  }
  return current.agreement?.record.termsHash ?? current.quote?.record.termsHash;
}

function expectedAmount(
  current: Work420CurrentAggregate,
  authority: Work420Authority,
): Money | undefined {
  if ("amount" in authority) return authority.amount;
  if ("lines" in authority) {
    const total = sumMoney(authority.lines.map((line) => line.amount));
    return total.ok ? total.value : undefined;
  }
  return current.payment?.record.amount ?? current.quote?.record.total;
}

function validateClaims(
  command: Work420Command,
  current: Work420CurrentAggregate,
  authority: Work420Authority,
): Work420Result<true> {
  const claims = command.claims;
  if (claims === undefined) return success(true);
  for (
    const key of [
      "requestId",
      "aggregateId",
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
      "ledgerEntryId",
      "ledgerRevision",
    ] as const
  ) {
    const claimed = claims[key];
    if (claimed === undefined) continue;
    const expected = expectedClaimId(current, authority, key);
    if (expected === undefined || claimed !== expected) {
      return failure([diagnostic(
        "CALLER_CLAIM_MISMATCH",
        "Caller record identities are checked against the current server graph and are never authority.",
        `claims.${key}`,
      )]);
    }
  }
  if (
    claims.parentId !== undefined &&
    claims.parentId !== expectedParentId(current, command.operation)
  ) {
    return failure([diagnostic(
      "PARENT_ID_MISMATCH",
      "Caller parent identity does not match the current server-derived parent chain.",
      "claims.parentId",
    )]);
  }
  const terms = expectedTermsHash(current, authority);
  if (claims.termsHash !== undefined && claims.termsHash !== terms) {
    return failure([diagnostic(
      "TERMS_HASH_MISMATCH",
      "Caller Terms hash cannot replace the server-derived Quote/Agreement Terms snapshot.",
      "claims.termsHash",
    )]);
  }
  const amount = expectedAmount(current, authority);
  if (
    claims.amountMinor !== undefined &&
    (amount === undefined || claims.amountMinor !== amount.amountMinor)
  ) {
    return failure([diagnostic(
      "MONEY_MISMATCH",
      "Caller amount is not the canonical server-resolved Money value.",
      "claims.amountMinor",
    )]);
  }
  if (
    claims.currency !== undefined &&
    (amount === undefined || claims.currency !== amount.currency)
  ) {
    return failure([diagnostic(
      "MONEY_MISMATCH",
      "Caller currency is not the canonical server-resolved currency.",
      "claims.currency",
    )]);
  }
  if (
    claims.recipientAccountId !== undefined ||
    claims.royaltyRateBps !== undefined ||
    claims.licenseSnapshotHash !== undefined ||
    claims.rights !== undefined
  ) {
    return failure([diagnostic(
      "CALLER_AUTHORITY_REJECTED",
      "Recipient, royalty, license, and rights values are server-derived and cannot be supplied as authority.",
      "claims",
    )]);
  }
  if (
    claims.acceptanceDecision !== undefined &&
    (!((authority as Partial<Work420AcceptanceAuthority>).decision) ||
      claims.acceptanceDecision !==
        (authority as Partial<Work420AcceptanceAuthority>).decision)
  ) {
    return failure([diagnostic(
      "CALLER_CLAIM_MISMATCH",
      "Acceptance decision does not match the explicit server-resolved action.",
      "claims.acceptanceDecision",
    )]);
  }
  const providerEvent = "providerEvent" in authority
    ? authority.providerEvent
    : undefined;
  if (
    claims.providerEventId !== undefined &&
    (providerEvent === undefined ||
      claims.providerEventId !== providerEvent.eventId)
  ) {
    return failure([diagnostic(
      "PROVIDER_EVENT_INVALID",
      "Provider Event identity is resolved by the server and does not accept caller substitution.",
      "claims.providerEventId",
    )]);
  }
  if (
    claims.providerPayloadFingerprint !== undefined &&
    (providerEvent === undefined ||
      claims.providerPayloadFingerprint !== providerEvent.payloadFingerprint)
  ) {
    return failure([diagnostic(
      "PROVIDER_EVENT_INVALID",
      "Provider Event payload fingerprint is resolved by the server.",
      "claims.providerPayloadFingerprint",
    )]);
  }
  const event = "event" in authority
    ? authority.event
    : "sourceEvent" in authority
    ? authority.sourceEvent
    : undefined;
  if (
    claims.sourceEventId !== undefined &&
    (event === undefined || claims.sourceEventId !== event.eventId)
  ) {
    return failure([diagnostic(
      "PROVIDER_EVENT_INVALID",
      "Payment Event identity is resolved by the server.",
      "claims.sourceEventId",
    )]);
  }
  return success(true);
}

function canonicalParticipantForOperation(
  current: Work420CurrentAggregate,
  operation: Work420Operation,
): string | undefined {
  const request = current.request.record;
  if (
    operation === "ISSUE_QUOTE" ||
    operation === "SIGN_AGREEMENT_CREATOR" ||
    operation === "CREATE_MILESTONE" ||
    operation === "START_MILESTONE" ||
    operation === "SUBMIT_DELIVERY" ||
    operation === "CREATE_RECOVERY_DELIVERY"
  ) return request.creatorAccountId;
  if (
    operation === "SUBMIT_REQUEST" ||
    operation === "ACCEPT_QUOTE" ||
    operation === "CREATE_AGREEMENT" ||
    operation === "SIGN_AGREEMENT_REQUESTER" ||
    operation === "MARK_DELIVERY_PENDING" ||
    operation === "DECIDE_ACCEPTANCE" ||
    operation === "DECIDE_RIGHTS" ||
    operation === "CREATE_PAYMENT" ||
    operation === "APPLY_PAYMENT_EVENT" ||
    operation === "MATERIALIZE_LEDGER"
  ) return request.requesterAccountId;
  return undefined;
}

function authorityParticipant(authority: Work420Authority): string | undefined {
  if ("creatorAccountId" in authority) return authority.creatorAccountId;
  if ("requesterAccountId" in authority) return authority.requesterAccountId;
  if ("actorAccountId" in authority) return authority.actorAccountId;
  if ("decidedByAccountId" in authority) return authority.decidedByAccountId;
  if ("event" in authority) return authority.event.accountId;
  if ("sourceEvent" in authority) return authority.sourceEvent.accountId;
  return undefined;
}

function commitMembership(
  context: ServerAuthorityRequestContextV1,
): Work420CommitMembershipIdentity {
  return {
    membershipId: context.membershipId,
    principalId: context.principalId,
    tenantId: context.tenantContext.tenantId,
    membershipRevision: context.membershipRevision,
  };
}

async function resolveCommitMembership(
  registry: Work420CanonicalRegistry,
  context: ServerAuthorityRequestContextV1,
): Promise<Work420Result<Work420CommitMembershipIdentity>> {
  let current;
  try {
    current = await registry.membershipRegistry.getCurrent({
      principalId: context.principalId,
      membershipId: context.membershipId,
      tenantId: context.tenantContext.tenantId,
    });
  } catch {
    return failure([diagnostic(
      "REGISTRY_UNAVAILABLE",
      "The server Registry could not revalidate WORK-420 membership before commit.",
    )]);
  }
  if (
    current === null ||
    current.status !== "ACTIVE" ||
    current.principalId !== context.principalId ||
    current.membershipId !== context.membershipId ||
    current.tenantId !== context.tenantContext.tenantId ||
    current.membershipRevision !== context.membershipRevision
  ) {
    return failure([diagnostic(
      "SERVER_CONTEXT_INVALID",
      "Current membership changed after context consumption and before commit.",
      "membershipRevision",
    )]);
  }
  return success(commitMembership(context));
}

function validateAuthority(
  current: Work420CurrentAggregate,
  authority: Work420Authority,
  context: ServerAuthorityRequestContextV1,
): Work420Result<true> {
  if (authority.operation !== currentOperation(authority)) {
    return failure([diagnostic(
      "REGISTRY_INVALID_RESPONSE",
      "The server Registry returned an authority record for another operation.",
    )]);
  }
  const actor = canonicalParticipantForOperation(current, authority.operation);
  if (actor === undefined || !validId(actor)) {
    return failure([diagnostic(
      "REGISTRY_INVALID_RESPONSE",
      "The current Request has no canonical participant for this operation.",
      "participant",
    )]);
  }
  if (
    actor !== context.principalId
  ) {
    return failure([diagnostic(
      "PERMISSION_DENIED",
      "The server-resolved operation actor is not the authenticated Server Context principal.",
      "principalId",
    )]);
  }
  const suppliedActor = authorityParticipant(authority);
  if (suppliedActor !== undefined && suppliedActor !== actor) {
    return failure([diagnostic(
      "REGISTRY_INVALID_RESPONSE",
      "Server operation authority is not bound to the Current Aggregate participant.",
      "participant",
    )]);
  }
  if ("termsHash" in authority && !validHash(authority.termsHash)) {
    return failure([diagnostic(
      "TERMS_HASH_MISMATCH",
      "Server Terms hash is invalid.",
      "termsHash",
    )]);
  }
  if ("amount" in authority) {
    const money = validateMoney(authority.amount);
    if (!money.ok) {
      return failure([diagnostic(
        "MONEY_INVALID",
        "Server Money authority is not canonical.",
        "amount",
      )]);
    }
  }
  if ("lines" in authority) {
    const total = sumMoney(authority.lines.map((line) => line.amount));
    if (!total.ok) {
      return failure([diagnostic(
        "MONEY_INVALID",
        "Server Quote lines are not canonical Money.",
        "lines",
      )]);
    }
    if (
      authority.lines.some((line) =>
        !validHash(line.deliverableHash) || !validId(line.lineId)
      )
    ) {
      return failure([diagnostic(
        "REGISTRY_INVALID_RESPONSE",
        "Server Quote line references are invalid.",
        "lines",
      )]);
    }
  }
  if (authority.operation === "APPLY_PAYMENT_EVENT") {
    const eventAuthority = authority as Work420PaymentEventAuthority;
    if (
      !validId(eventAuthority.event.eventId) ||
      !validHash(eventAuthority.event.fingerprint)
    ) {
      return failure([diagnostic(
        "PROVIDER_EVENT_INVALID",
        "Server Payment Event identity is invalid.",
        "event",
      )]);
    }
  }
  if (authority.operation === "MATERIALIZE_LEDGER") {
    const ledgerAuthority = authority as Work420LedgerAuthority;
    if (
      !validHash(ledgerAuthority.providerEvent.payloadFingerprint) ||
      ledgerAuthority.providerEvent.sourceKind !== "DIRECT_WORK_PAYMENT" ||
      String(ledgerAuthority.providerEvent.eventId) !==
        String(ledgerAuthority.sourceEvent.eventId)
    ) {
      return failure([diagnostic(
        "PROVIDER_EVENT_INVALID",
        "Server Provider Event identity is not a Direct Work Payment identity.",
        "providerEvent",
      )]);
    }
  }
  return success(true);
}

function currentOperation(authority: Work420Authority): Work420Operation {
  return authority.operation;
}

function requireRecord<T>(
  value: T | undefined,
  path: string,
): Work420Result<T> {
  return value === undefined
    ? failure([
      diagnostic(
        "CURRENT_RECORD_NOT_FOUND",
        "The required current record is not present in the server graph.",
        path,
      ),
    ])
    : success(value);
}

function requireSealed<T>(
  value: T,
  kind: Parameters<typeof isDirectWorkRecordSealed>[1],
  path: string,
): Work420Result<T> {
  return isDirectWorkRecordSealed(value, kind)
    ? success(value)
    : failure([diagnostic(
      "CANONICAL_RECORD_INVALID",
      "The current record did not originate from the canonical Direct Work factory boundary.",
      path,
    )]);
}

function mapCoreDiagnostics(
  diagnostics: readonly { readonly code: string; readonly path?: string }[],
  fallback: Work420DiagnosticCode,
): readonly Work420Diagnostic[] {
  return diagnostics.map((item) =>
    diagnostic(
      (item.code === "PERMISSION_DENIED"
        ? "PERMISSION_DENIED"
        : fallback) as Work420DiagnosticCode,
      "The canonical Direct Work contract rejected the composition transition.",
      item.path,
    )
  );
}

function providerEventForSource(
  event: DirectWorkPaymentEvent,
  providerEvent: VerifiedProviderEventV1 | undefined,
  payment: DirectWorkPayment,
): Work420Result<true> {
  if (event.type !== "PAID" && event.type !== "REFUNDED") return success(true);
  if (
    providerEvent === undefined ||
    providerEvent.sourceKind !== "DIRECT_WORK_PAYMENT" ||
    providerEvent.sourceId !== payment.paymentId ||
    String(providerEvent.eventId) !== String(event.eventId) ||
    providerEvent.payloadFingerprint !== event.fingerprint ||
    providerEvent.eventType !== (event.type === "PAID" ? "PAID" : "REFUNDED") ||
    providerEvent.environment !== payment.environment
  ) {
    return failure([diagnostic(
      "PROVIDER_EVENT_INVALID",
      "Final Payment state requires the exact server-verified Provider Event identity.",
      "providerEvent",
    )]);
  }
  return success(true);
}

export class Work420CompositionRoot {
  readonly #registry: Work420CanonicalRegistry;
  readonly #flags: Work420FeatureFlags;
  readonly #killSwitch: boolean;

  constructor(
    registry: Work420CanonicalRegistry,
    options: Work420CompositionOptions = {},
  ) {
    this.#registry = registry;
    this.#flags = options.flags ?? {};
    this.#killSwitch = options.killSwitch === true;
  }

  async execute(
    rawCommand: unknown,
    rawContext: unknown,
  ): Promise<Work420Result<Work420TransitionResult>> {
    const enabled = featureEnabled(this.#flags, this.#killSwitch);
    if (!enabled.ok) return enabled;
    const shaped = commandShape(rawCommand);
    if (!shaped.ok) return shaped;
    const command = shaped.value;
    if (!isServerAuthorityRequestContext(rawContext)) {
      return failure([diagnostic(
        "SERVER_CONTEXT_INVALID",
        "WORK-420 requires a fresh branded Server Composition Root context.",
      )]);
    }
    const context = rawContext as ServerAuthorityRequestContextV1;
    if (
      context.resourceType !== "DIRECT_WORK_REQUEST" ||
      !validId(context.resourceId) ||
      context.tenantContext.principalId !== context.principalId
    ) {
      return failure([diagnostic(
        "SERVER_CONTEXT_INVALID",
        "WORK-420 context is not scoped to a Direct Work Request.",
      )]);
    }
    const claims = command.claims;
    if (
      claims?.requestId !== undefined && claims.requestId !== context.resourceId
    ) {
      return failure([diagnostic(
        "CALLER_CLAIM_MISMATCH",
        "The caller Request ID is only a checked hint; the Server Context resource is authoritative.",
        "claims.requestId",
      )]);
    }
    let consumed: boolean;
    try {
      consumed = await consumeServerAuthorityRequestContext(context, {
        resourceType: "DIRECT_WORK_REQUEST",
        resourceId: context.resourceId,
        membershipRegistry: this.#registry.membershipRegistry,
      });
    } catch {
      consumed = false;
    }
    if (!consumed) {
      return failure([diagnostic(
        "SERVER_CONTEXT_INVALID",
        "Server membership was not current, active, and bound to this one-shot context.",
      )]);
    }
    const requestId = context.resourceId as DirectWorkRequest["requestId"];
    const idempotencyKey = command.idempotencyKey ??
      `auto:${command.operation}:${context.resourceId}:${context.correlationId}`;
    let requestHash: ContentHash;
    try {
      requestHash = await hashCanonical({
        operation: command.operation,
        claims: command.claims ?? null,
      });
    } catch {
      return failure([diagnostic(
        "COMMAND_SCHEMA_INVALID",
        "WORK-420 could not canonicalize the bounded command.",
      )]);
    }
    let lookup: Work420IdempotencyLookup | "CONFLICT" | null;
    try {
      lookup = await this.#registry.lookupIdempotency({
        tenantId: context.tenantContext.tenantId,
        requestId,
        key: idempotencyKey,
        requestHash,
      });
    } catch {
      return failure([diagnostic(
        "REGISTRY_UNAVAILABLE",
        "The server Registry could not resolve the WORK-420 idempotency key.",
      )]);
    }
    if (lookup === "CONFLICT") {
      return failure([diagnostic(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key is already bound to a different command hash.",
      )]);
    }
    if (lookup !== null) {
      const audit = auditSummary(
        command.operation,
        "IDEMPOTENT_NOOP",
        lookup.aggregate,
      );
      return success({
        schemaVersion: WORK420_SCHEMA_VERSION,
        operation: command.operation,
        status: "IDEMPOTENT_NOOP",
        changed: false,
        aggregate: lookup.aggregate,
        audit,
      }, [
        info(
          "DUPLICATE_NOOP",
          "Identical WORK-420 command replayed as a local idempotent no-op.",
          { changed: false },
        ),
      ]);
    }
    let current: Work420CurrentAggregate | null;
    try {
      current = await this.#registry.resolveCurrent({
        tenantContext: context.tenantContext,
        requestId,
        operation: command.operation,
      });
    } catch {
      return failure([diagnostic(
        "REGISTRY_UNAVAILABLE",
        "The server Registry could not resolve the current WORK-420 aggregate.",
      )]);
    }
    if (current === null) {
      return failure([diagnostic(
        "CURRENT_RECORD_NOT_FOUND",
        "The requested Direct Work Request is not a current server record.",
      )]);
    }
    const currentCheck = await verifyCurrentAggregate(current);
    if (!currentCheck.ok) return currentCheck;
    let authority: Work420Authority | null;
    try {
      authority = await this.#registry.resolveAuthority({
        tenantContext: context.tenantContext,
        requestId,
        operation: command.operation,
        principalId: context.principalId,
      });
    } catch {
      return failure([diagnostic(
        "REGISTRY_UNAVAILABLE",
        "The server Registry could not resolve the current operation authority.",
      )]);
    }
    if (authority === null || authority.operation !== command.operation) {
      return failure([diagnostic(
        "REGISTRY_INVALID_RESPONSE",
        "The server Registry did not return a canonical authority for this operation.",
      )]);
    }
    const authorityCheck = validateAuthority(current, authority, context);
    if (!authorityCheck.ok) return authorityCheck;
    const claimCheck = validateClaims(command, current, authority);
    if (!claimCheck.ok) return claimCheck;
    let next: Work420Result<Work420CurrentAggregate>;
    try {
      next = await this.apply(current, authority, command.operation, context);
    } catch {
      return failure([diagnostic(
        "REGISTRY_INVALID_RESPONSE",
        "The canonical transition adapter returned an invalid result.",
      )]);
    }
    if (!next.ok) return next;
    const membership = await resolveCommitMembership(
      this.#registry,
      context,
    );
    if (!membership.ok) return membership;
    let committed;
    try {
      committed = await this.#registry.commit({
        tenantContext: context.tenantContext,
        membership: membership.value,
        requestId,
        expectedAggregateVersion: current.aggregateVersion,
        requestHash,
        idempotencyKey,
        aggregate: next.value,
      });
    } catch {
      return failure([diagnostic(
        "REGISTRY_UNAVAILABLE",
        "The server Registry could not commit the bounded WORK-420 transition.",
      )]);
    }
    if (
      committed === null || typeof committed !== "object" ||
      !("ok" in committed)
    ) {
      return failure([diagnostic(
        "MALFORMED_SUCCESS",
        "The server Registry returned a malformed commit result.",
      )]);
    }
    if (!committed.ok) {
      return failure([diagnostic(
        committed.code === "STALE_CURRENT_RECORD"
          ? "STALE_CURRENT_RECORD"
          : committed.code === "IDEMPOTENCY_CONFLICT"
          ? "IDEMPOTENCY_CONFLICT"
          : "REGISTRY_INVALID_RESPONSE",
        "The server Registry rejected the transition commit.",
      )]);
    }
    const status = committed.value.duplicate ? "IDEMPOTENT_NOOP" : "APPLIED";
    const result: Work420TransitionResult = {
      schemaVersion: WORK420_SCHEMA_VERSION,
      operation: command.operation,
      status,
      changed: committed.value.changed,
      aggregate: committed.value.aggregate,
      audit: auditSummary(command.operation, status, committed.value.aggregate),
    };
    return success(
      result,
      committed.value.duplicate
        ? [
          info(
            "DUPLICATE_NOOP",
            "The server commit returned an idempotent duplicate.",
            { changed: false },
          ),
        ]
        : [],
    );
  }

  private async apply(
    current: Work420CurrentAggregate,
    authority: Work420Authority,
    operation: Work420Operation,
    context: ServerAuthorityRequestContextV1,
  ): Promise<Work420Result<Work420CurrentAggregate>> {
    const request = current.request.record;
    if (operation === "SUBMIT_REQUEST") {
      if (request.status !== "DRAFT" || current.quote !== undefined) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Only a draft Request without child records may be submitted.",
          "request.status",
        )]);
      }
      const result = transitionDirectWorkRequest(request, "SUBMIT");
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "INVALID_STATE_TRANSITION"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_REQUEST",
        result.value.requestId,
        current.tenantContext.tenantId,
        revisionFor(
          "request",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { request: envelope }));
    }
    if (operation === "ISSUE_QUOTE") {
      const quoteAuthority = authority as Work420QuoteAuthority;
      if (request.status !== "SUBMITTED" || current.quote !== undefined) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Quote issuance requires the current submitted Request and no prior Quote.",
          "request.status",
        )]);
      }
      const expected: AuthorizationProofExpectation = {
        principalId: quoteAuthority.creatorAccountId,
        resourceType: "DIRECT_WORK_REQUEST",
        resourceId: request.requestId,
        action: "direct-work.quote.create",
        capability: "direct-work.quote.create",
        tenantId: current.tenantContext.tenantId,
        policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
      };
      const proof = this.#registry.resolveAuthorizationProof({
        principalId: expected.principalId ?? null,
        tenantId: expected.tenantId ?? current.tenantContext.tenantId,
        resourceType: expected.resourceType ?? "DIRECT_WORK_REQUEST",
        resourceId: expected.resourceId ?? request.requestId,
        action: expected.action ?? "direct-work.quote.create",
        capability: expected.capability ?? "direct-work.quote.create",
        policyVersion: expected.policyVersion ??
          AUTHORIZATION_PROOF_POLICY_VERSION,
      });
      const result = createDirectWorkQuote({
        quoteId: quoteAuthority.quoteId,
        request,
        creatorAccountId: request.creatorAccountId,
        lines: quoteAuthority.lines,
        termsHash: quoteAuthority.termsHash,
        royaltyRuleVersion: quoteAuthority.royaltyRuleVersion,
        authorizationProof: proof,
        authorizationProofResolver: ({ expected: nested }) =>
          this.#registry.resolveAuthorizationProof({
            principalId: nested.principalId ?? quoteAuthority.creatorAccountId,
            tenantId: nested.tenantId ?? current.tenantContext.tenantId,
            resourceType: nested.resourceType ?? "DIRECT_WORK_REQUEST",
            resourceId: nested.resourceId ?? request.requestId,
            action: nested.action ?? "direct-work.quote.create",
            capability: nested.capability ?? "direct-work.quote.create",
            policyVersion: nested.policyVersion ??
              AUTHORIZATION_PROOF_POLICY_VERSION,
          }),
      });
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "REGISTRY_INVALID_RESPONSE"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_QUOTE",
        result.value.quoteId,
        current.tenantContext.tenantId,
        revisionFor(
          "quote",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { quote: envelope }));
    }
    const quoteResult = requireRecord(current.quote, "quote");
    if (operation === "ACCEPT_QUOTE") {
      if (!quoteResult.ok) return quoteResult;
      if (quoteResult.value.record.status !== "ISSUED") {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Only an issued Quote can be accepted.",
          "quote.status",
        )]);
      }
      const result = acceptDirectWorkQuote(
        quoteResult.value.record,
        request.requesterAccountId,
      );
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "INVALID_STATE_TRANSITION"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_QUOTE",
        result.value.quoteId,
        current.tenantContext.tenantId,
        revisionFor(
          "quote",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { quote: envelope }));
    }
    const agreementResult = requireRecord(current.agreement, "agreement");
    if (operation === "CREATE_AGREEMENT") {
      if (!quoteResult.ok) return quoteResult;
      const agreementAuthority = authority as Work420AgreementAuthority;
      if (
        quoteResult.value.record.status !== "ACCEPTED" ||
        current.agreement !== undefined
      ) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Agreement creation requires the current accepted Quote and no prior Agreement.",
          "quote.status",
        )]);
      }
      const result = createDirectWorkAgreement({
        agreementId: agreementAuthority.agreementId,
        request,
        quote: quoteResult.value.record,
        termsHash: agreementAuthority.termsHash,
      });
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "TERMS_HASH_MISMATCH"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_AGREEMENT",
        result.value.agreementId,
        current.tenantContext.tenantId,
        revisionFor(
          "agreement",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { agreement: envelope }));
    }
    if (
      operation === "SIGN_AGREEMENT_REQUESTER" ||
      operation === "SIGN_AGREEMENT_CREATOR"
    ) {
      if (!agreementResult.ok) return agreementResult;
      const role = operation === "SIGN_AGREEMENT_REQUESTER"
        ? "REQUESTER"
        : "CREATOR";
      if (agreementResult.value.record.status !== "PENDING_SIGNATURE") {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Agreement is not accepting this signature.",
          "agreement.status",
        )]);
      }
      const actorAccountId = canonicalParticipantForOperation(
        current,
        operation,
      );
      if (actorAccountId === undefined) {
        return failure([diagnostic(
          "REGISTRY_INVALID_RESPONSE",
          "Agreement signer is not bound to a canonical participant.",
          "participant",
        )]);
      }
      const result = signDirectWorkAgreement(
        agreementResult.value.record,
        actorAccountId,
        role,
      );
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "PERMISSION_DENIED"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_AGREEMENT",
        result.value.agreementId,
        current.tenantContext.tenantId,
        revisionFor(
          "agreement",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { agreement: envelope }));
    }
    const milestoneResult = requireRecord(current.milestone, "milestone");
    if (operation === "CREATE_MILESTONE") {
      if (!agreementResult.ok) return agreementResult;
      const milestoneAuthority = authority as Work420MilestoneAuthority;
      if (
        agreementResult.value.record.status !== "ACTIVE" ||
        current.milestone !== undefined
      ) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Milestone creation requires the current active Agreement and no prior current Milestone.",
          "agreement.status",
        )]);
      }
      const result = createDirectWorkMilestone({
        milestoneId: milestoneAuthority.milestoneId,
        agreement: agreementResult.value.record,
        sequence: milestoneAuthority.sequence,
        deliverableHash: milestoneAuthority.deliverableHash,
        amount: milestoneAuthority.amount,
      });
      if (!result.ok) {
        return failure(mapCoreDiagnostics(result.diagnostics, "MONEY_INVALID"));
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_MILESTONE",
        result.value.milestoneId,
        current.tenantContext.tenantId,
        revisionFor(
          "milestone",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { milestone: envelope }));
    }
    if (operation === "START_MILESTONE") {
      if (!milestoneResult.ok) return milestoneResult;
      if (
        milestoneResult.value.record.status !== "PLANNED" &&
        milestoneResult.value.record.status !== "REJECTED"
      ) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Only a planned or recovery Milestone may start.",
          "milestone.status",
        )]);
      }
      const result = transitionDirectWorkMilestone(
        milestoneResult.value.record,
        "START",
      );
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "INVALID_STATE_TRANSITION"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_MILESTONE",
        result.value.milestoneId,
        current.tenantContext.tenantId,
        revisionFor(
          "milestone",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { milestone: envelope }));
    }
    const deliveryResult = requireRecord(current.delivery, "delivery");
    if (
      operation === "SUBMIT_DELIVERY" ||
      operation === "CREATE_RECOVERY_DELIVERY"
    ) {
      if (!milestoneResult.ok) return milestoneResult;
      const deliveryAuthority = authority as Work420DeliveryAuthority;
      const isRecovery = operation === "CREATE_RECOVERY_DELIVERY";
      if (isRecovery) {
        if (
          milestoneResult.value.record.status !== "REJECTED" ||
          deliveryResult.ok === false ||
          deliveryResult.value.record.status !== "REJECTED"
        ) {
          return failure([diagnostic(
            "INVALID_STATE_TRANSITION",
            "Recovery Delivery requires a rejected current Delivery and Milestone.",
            "delivery.status",
          )]);
        }
      } else if (
        milestoneResult.value.record.status !== "IN_PROGRESS" ||
        deliveryResult.ok
      ) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Initial Delivery requires an in-progress Milestone without a current Delivery.",
          "milestone.status",
        )]);
      }
      const result = submitDirectWorkDelivery({
        deliveryId: deliveryAuthority.deliveryId,
        milestone: milestoneResult.value.record,
        revisionHash: deliveryAuthority.revisionHash,
        ...(deliveryAuthority.packageReference === undefined
          ? {}
          : { packageReference: deliveryAuthority.packageReference }),
        attempt: deliveryAuthority.attempt,
        ...(deliveryAuthority.previousDeliveryId === undefined
          ? {}
          : { previousDeliveryId: deliveryAuthority.previousDeliveryId }),
      });
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "DELIVERY_REQUIRED"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_DELIVERY",
        result.value.deliveryId,
        current.tenantContext.tenantId,
        revisionFor(
          "delivery",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(
        await withNextVersion(current, {
          delivery: envelope,
          deliveryHistory: deliveryResult.ok
            ? appendEnvelope(current.deliveryHistory, deliveryResult.value)
            : current.deliveryHistory,
          acceptanceHistory: isRecovery && current.acceptance !== undefined
            ? appendEnvelope(current.acceptanceHistory, current.acceptance)
            : current.acceptanceHistory,
        }, isRecovery ? { clearAcceptance: true } : {}),
      );
    }
    if (operation === "MARK_DELIVERY_PENDING") {
      if (!milestoneResult.ok || !deliveryResult.ok) {
        return failure([diagnostic(
          "DELIVERY_REQUIRED",
          "Delivery submission must exist before the Milestone enters acceptance pending.",
        )]);
      }
      if (
        milestoneResult.value.record.status !== "IN_PROGRESS" ||
        deliveryResult.value.record.status !== "SUBMITTED"
      ) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Only a submitted Delivery on an in-progress Milestone may enter acceptance pending.",
        )]);
      }
      const result = transitionDirectWorkMilestone(
        milestoneResult.value.record,
        "DELIVERY_SUBMITTED",
      );
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "INVALID_STATE_TRANSITION"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_MILESTONE",
        result.value.milestoneId,
        current.tenantContext.tenantId,
        revisionFor(
          "milestone",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { milestone: envelope }));
    }
    const acceptanceResult = requireRecord(current.acceptance, "acceptance");
    if (operation === "DECIDE_ACCEPTANCE") {
      if (!milestoneResult.ok || !deliveryResult.ok) {
        return failure([diagnostic(
          "DELIVERY_REQUIRED",
          "Acceptance requires the current Milestone and Delivery.",
        )]);
      }
      const acceptanceAuthority = authority as Work420AcceptanceAuthority;
      if (
        milestoneResult.value.record.status !== "DELIVERY_PENDING" ||
        deliveryResult.value.record.status !== "SUBMITTED"
      ) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Acceptance requires a Delivery-pending Milestone and submitted Delivery.",
        )]);
      }
      const actorAccountId = canonicalParticipantForOperation(
        current,
        operation,
      );
      if (actorAccountId === undefined) {
        return failure([diagnostic(
          "REGISTRY_INVALID_RESPONSE",
          "Acceptance actor is not bound to a canonical participant.",
          "participant",
        )]);
      }
      const result = recordDirectWorkAcceptance({
        acceptanceId: acceptanceAuthority.acceptanceId,
        request,
        milestone: milestoneResult.value.record,
        delivery: deliveryResult.value.record,
        actorAccountId,
        decision: acceptanceAuthority.decision,
        ...(acceptanceAuthority.reasonHash === undefined
          ? {}
          : { reasonHash: acceptanceAuthority.reasonHash }),
      });
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "INVALID_STATE_TRANSITION"),
        );
      }
      const delivery = await makeEnvelope(
        result.value.delivery,
        "DIRECT_WORK_DELIVERY",
        result.value.delivery.deliveryId,
        current.tenantContext.tenantId,
        revisionFor(
          "delivery",
          result.value.delivery as unknown as Record<string, unknown>,
        ),
      );
      const milestone = await makeEnvelope(
        result.value.milestone,
        "DIRECT_WORK_MILESTONE",
        result.value.milestone.milestoneId,
        current.tenantContext.tenantId,
        revisionFor(
          "milestone",
          result.value.milestone as unknown as Record<string, unknown>,
        ),
      );
      const acceptance = await makeEnvelope(
        result.value.acceptance,
        "DIRECT_WORK_ACCEPTANCE",
        result.value.acceptance.acceptanceId,
        current.tenantContext.tenantId,
        revisionFor(
          "acceptance",
          result.value.acceptance as unknown as Record<string, unknown>,
        ),
      );
      return success(
        await withNextVersion(current, {
          milestone,
          delivery,
          acceptance,
          deliveryHistory: appendEnvelope(
            current.deliveryHistory,
            deliveryResult.value,
          ),
          acceptanceHistory: acceptanceResult.ok
            ? appendEnvelope(current.acceptanceHistory, acceptanceResult.value)
            : current.acceptanceHistory,
        }),
      );
    }
    if (operation === "DECIDE_RIGHTS") {
      if (!acceptanceResult.ok) return acceptanceResult;
      const rightsAuthority = authority as Work420RightsAuthority;
      if (
        acceptanceResult.value.record.decision !== "ACCEPTED" ||
        current.rights !== undefined
      ) {
        return failure([diagnostic(
          "RIGHTS_REQUIRED",
          "Rights require an accepted current Delivery and are explicit once per revision.",
        )]);
      }
      const decidedByAccountId = canonicalParticipantForOperation(
        current,
        operation,
      );
      if (decidedByAccountId === undefined) {
        return failure([diagnostic(
          "REGISTRY_INVALID_RESPONSE",
          "Rights decision is not bound to a canonical participant.",
          "participant",
        )]);
      }
      const result = decideDirectWorkRights({
        rightsDecisionId: rightsAuthority.rightsDecisionId,
        request,
        acceptance: acceptanceResult.value.record,
        licenseSnapshotHash: rightsAuthority.licenseSnapshotHash,
        rights: rightsAuthority.rights,
        decidedByAccountId,
        status: rightsAuthority.status,
      });
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "RIGHTS_REQUIRED"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_RIGHTS",
        result.value.rightsDecisionId,
        current.tenantContext.tenantId,
        revisionFor(
          "rights",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { rights: envelope }));
    }
    const rightsResult = requireRecord(current.rights, "rights");
    if (operation === "CREATE_PAYMENT") {
      if (
        !quoteResult.ok || !agreementResult.ok || !acceptanceResult.ok ||
        !rightsResult.ok
      ) {
        return failure([diagnostic(
          "ACCEPTANCE_REQUIRED",
          "Payment requires the current Quote, Agreement, accepted Delivery, and explicit Rights decision.",
        )]);
      }
      const paymentAuthority = authority as Work420PaymentAuthority;
      if (
        quoteResult.value.record.status !== "ACCEPTED" ||
        agreementResult.value.record.status !== "ACTIVE" ||
        acceptanceResult.value.record.decision !== "ACCEPTED" ||
        current.payment !== undefined
      ) {
        return failure([diagnostic(
          "INVALID_STATE_TRANSITION",
          "Payment can be created only after the ordered Agreement, Acceptance, and Rights stages.",
        )]);
      }
      const result = createDirectWorkPayment({
        paymentId: paymentAuthority.paymentId,
        request,
        agreement: agreementResult.value.record,
        quote: quoteResult.value.record,
        provider: paymentAuthority.provider,
        environment: paymentAuthority.environment,
      });
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "PAYMENT_BINDING_MISMATCH"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_PAYMENT",
        result.value.paymentId,
        current.tenantContext.tenantId,
        revisionFor(
          "payment",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(await withNextVersion(current, { payment: envelope }));
    }
    const paymentResult = requireRecord(current.payment, "payment");
    if (operation === "APPLY_PAYMENT_EVENT") {
      if (!paymentResult.ok) return paymentResult;
      const eventAuthority = authority as Work420PaymentEventAuthority;
      if (
        eventAuthority.event.paymentId !==
          paymentResult.value.record.paymentId ||
        eventAuthority.event.requestId !== request.requestId
      ) {
        return failure([diagnostic(
          "PAYMENT_BINDING_MISMATCH",
          "Payment Event is not bound to the current Payment and Request.",
        )]);
      }
      const providerCheck = providerEventForSource(
        eventAuthority.event,
        eventAuthority.providerEvent,
        paymentResult.value.record,
      );
      if (!providerCheck.ok) return providerCheck;
      const result = applyDirectWorkPaymentEvent(
        paymentResult.value.record,
        eventAuthority.event,
      );
      if (!result.ok) {
        return failure(
          mapCoreDiagnostics(result.diagnostics, "PAYMENT_BINDING_MISMATCH"),
        );
      }
      const envelope = await makeEnvelope(
        result.value,
        "DIRECT_WORK_PAYMENT",
        result.value.paymentId,
        current.tenantContext.tenantId,
        revisionFor(
          "payment",
          result.value as unknown as Record<string, unknown>,
        ),
      );
      return success(
        await withNextVersion(current, {
          payment: envelope,
          sourceEvent: eventAuthority.event,
          ...(eventAuthority.providerEvent === undefined
            ? {}
            : { providerEvent: eventAuthority.providerEvent }),
        }),
      );
    }
    if (operation === "MATERIALIZE_LEDGER") {
      if (
        !paymentResult.ok || current.sourceEvent === undefined ||
        current.providerEvent === undefined
      ) {
        return failure([diagnostic(
          "LEDGER_BINDING_MISMATCH",
          "Ledger materialization requires the current final Payment Event and Provider identity.",
        )]);
      }
      const ledgerAuthority = authority as Work420LedgerAuthority;
      if (
        !sameProviderIdentity(
          current.providerEvent,
          ledgerAuthority.providerEvent,
        ) ||
        ledgerAuthority.sourceEvent.eventId !== current.sourceEvent.eventId ||
        ledgerAuthority.financialAuthority.paymentId !==
          paymentResult.value.record.paymentId ||
        ledgerAuthority.financialAuthority.requestId !== request.requestId
      ) {
        return failure([diagnostic(
          "PROVIDER_EVENT_INVALID",
          "Ledger authority is not derived from the current Provider Event and Payment.",
        )]);
      }
      if (
        current.ledger !== undefined &&
        current.ledger.record.sourceEventId === current.sourceEvent.eventId
      ) {
        return success(current, [
          info(
            "DUPLICATE_NOOP",
            "Ledger materialization is already present for this Payment Event.",
            { changed: false },
          ),
        ]);
      }
      let proof: ReturnType<
        Work420CanonicalRegistry["resolveAuthorizationProof"]
      >;
      try {
        proof = ledgerAuthority.financialProof;
        requireAuthorizationProofV1(proof, {
          principalId: paymentResult.value.record.requesterAccountId,
          resourceType: FP003_FINANCIAL_RESOURCE_TYPE,
          resourceId: paymentResult.value.record.paymentId,
          action: FP003_FINANCIAL_ACTION,
          capability: FP003_FINANCIAL_CAPABILITY,
          tenantId: current.tenantContext.tenantId,
          policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
        });
      } catch {
        return failure([diagnostic(
          "PERMISSION_DENIED",
          "Ledger materialization requires a current server Financial AuthorizationProofV1.",
          "financialProof",
        )]);
      }
      const settlement: Promise<Work420Result<DirectWorkFinancialSettlement>> =
        materializeDirectWorkFinancialSettlement({
          providerEvent: ledgerAuthority.providerEvent,
          canonicalPrincipalId: paymentResult.value.record.requesterAccountId,
          authorizationProof: proof,
          authorizationProofResolver: ({ expected }) =>
            this.#registry.resolveAuthorizationProof({
              principalId: expected.principalId ?? null,
              tenantId: expected.tenantId ?? current.tenantContext.tenantId,
              resourceType: expected.resourceType ??
                FP003_FINANCIAL_RESOURCE_TYPE,
              resourceId: expected.resourceId ??
                paymentResult.value.record.paymentId,
              action: expected.action ?? FP003_FINANCIAL_ACTION,
              capability: expected.capability ?? FP003_FINANCIAL_CAPABILITY,
              policyVersion: expected.policyVersion ??
                AUTHORIZATION_PROOF_POLICY_VERSION,
            }),
          authorityResolver: () => ledgerAuthority.financialAuthority,
          payment: paymentResult.value.record,
          sourceEvent: ledgerAuthority.sourceEvent,
        }).then((result) =>
          result.ok
            ? success(result.value)
            : failure(result.diagnostics.map((item) =>
              diagnostic(
                item.code === "PERMISSION_DENIED"
                  ? "PERMISSION_DENIED"
                  : "LEDGER_BINDING_MISMATCH",
                "The canonical FP-003 Financial/Ledger boundary rejected the settlement.",
                item.path,
              )
            ))
        );
      const result = await settlement;
      if (!result.ok) return result;
      const ledgerEnvelope = await makeEnvelope(
        result.value.ledgerEntry,
        "DIRECT_WORK_LEDGER",
        result.value.ledgerEntry.ledgerEntryId,
        current.tenantContext.tenantId,
        "ledger:v1",
      );
      return success(
        await withNextVersion(current, {
          ledger: ledgerEnvelope,
          ledgerHistory: current.ledger === undefined
            ? current.ledgerHistory
            : appendEnvelope(current.ledgerHistory, current.ledger),
        }),
      );
    }
    return failure([diagnostic(
      "COMMAND_SCHEMA_INVALID",
      "WORK-420 operation is not implemented by this bounded composition root.",
    )]);
  }
}

function auditSummary(
  operation: Work420Operation,
  status: "APPLIED" | "IDEMPOTENT_NOOP",
  aggregate: Work420CurrentAggregate,
): Work420PublicAuditSummary {
  return {
    schemaVersion: WORK420_SCHEMA_VERSION,
    domain: "DIRECT_WORK",
    requestId: aggregate.request.record.requestId,
    aggregateVersion: aggregate.aggregateVersion,
    operation,
    status,
    deliveryRevisionCount: aggregate.deliveryHistory.length +
      (aggregate.delivery === undefined ? 0 : 1),
    ledgerRevisionCount: aggregate.ledgerHistory.length +
      (aggregate.ledger === undefined ? 0 : 1),
    hasSensitiveFields: false,
    publicProjectionAllowed: false,
  };
}

export function createWork420CompositionRoot(
  registry: Work420CanonicalRegistry,
  options: Work420CompositionOptions = {},
): Work420CompositionRoot {
  return new Work420CompositionRoot(registry, options);
}

export function auditSafeWork420Result(
  result: Work420Result<Work420TransitionResult>,
): Readonly<Record<string, string | number | boolean>> {
  if (!result.ok) {
    return {
      schemaVersion: WORK420_SCHEMA_VERSION,
      ok: false,
      diagnosticCount: result.diagnostics.length,
      hasSensitiveFields: false,
      publicProjectionAllowed: false,
      externalMutation: false,
    };
  }
  return {
    schemaVersion: WORK420_SCHEMA_VERSION,
    ok: true,
    operation: result.value.operation,
    status: result.value.status,
    changed: result.value.changed,
    aggregateVersion: result.value.aggregate.aggregateVersion,
    deliveryRevisionCount: result.value.aggregate.deliveryHistory.length,
    ledgerRevisionCount: result.value.aggregate.ledgerHistory.length,
    hasSensitiveFields: false,
    publicProjectionAllowed: false,
    externalMutation: false,
  };
}

export type {
  Work420Command,
  Work420CurrentAggregate,
  Work420Result,
  Work420TransitionResult,
};
