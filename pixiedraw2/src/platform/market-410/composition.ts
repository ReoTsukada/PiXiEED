/**
 * MARKET-410 isolated Market composition boundary.
 *
 * This module is an in-memory server composition fixture. It accepts only
 * opaque references, revisions, a verified-event-shaped input, and a caller
 * AuthorizationProof. Product, Package, Purchase, Money, Fee Schedule,
 * Contributor Snapshot, License, Entitlement, and Ledger authority are
 * re-resolved from the captured registry. WP-210 and FP-003 remain the
 * canonical domain contracts; this module only composes them and adds a
 * bounded local idempotency/causal envelope.
 *
 * There is no route, provider client, database, Storage, payment transport,
 * durable persistence, or production mutation in this boundary.
 */

import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
  type ContentHash,
  requireAuthorizationProofV1,
} from "../../wp160-contracts.ts";
import {
  asPaymentEventId,
  createProductProjection,
  createPurchaseRecord,
  type EntitlementId,
  type EntitlementRecord,
  type LicenseRight,
  type LicenseSnapshot,
  type LockedPackageReference,
  type MarketProductProjection,
  type MarketProductStatus,
  type MarketPurchaseId,
  type MarketResult,
  materializePurchaseRights,
  type ProductProjectionInput,
  type PurchaseEvent,
  type PurchaseInput,
  type PurchaseRecord,
} from "../../wp210-market-rights-core.ts";
import {
  asFinancialProviderEventId,
  type CanonicalCollaborativeDeductionV1,
  type CanonicalMarketRoyaltyLedgerEntry,
  type CollaborativeRevenueAuthorityV1,
  CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION,
  type ContributorRevenueAllocationV1,
  type ContributorSnapshotV1,
  deriveCollaborativeRevenueAllocation,
  type FinancialAuthorityResolutionV1,
  type FinancialDiagnostic,
  type FinancialResult,
  FP003_FINANCIAL_ACTION,
  FP003_FINANCIAL_CAPABILITY,
  FP003_FINANCIAL_RESOURCE_TYPE,
  FP003_FINANCIAL_SCHEMA_VERSION,
  guardDuplicateProductFingerprint,
  materializeMarketFinancialSettlement,
  type ProductFingerprintV1,
  type UntrustedFinancialInput,
  type VerifiedProviderEventV1,
} from "../../fp003-financial-integrity-core.ts";

export const MARKET410_SCHEMA_VERSION = "MARKET410_COMPOSITION_V1" as const;

export const MARKET410_CONTRIBUTOR_SNAPSHOT_CONFLICT_ERROR =
  "MARKET-410 Collaborative Registry contains conflicting Contributor Snapshot for a Collaborative Work.";

const PROVIDER_EVENT_QUARANTINE_MESSAGE =
  "The Provider Event ID is quarantined after a payload conflict; replay and settlement are forbidden.";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SAFE_HASH = /^[a-f0-9]{64}$/;

export type Market410Environment = "TEST" | "LIVE";
export type Market410Permission = "ALLOW" | "DENY";
export type Market410FeatureFlag =
  | "market-410-settlement"
  | "market-410-collaboration";
export type Market410FeatureFlags = Readonly<
  Record<string, boolean | undefined>
>;

export const DEFAULT_MARKET410_FEATURE_FLAGS: Readonly<
  Record<Market410FeatureFlag, false>
> = Object.freeze({
  "market-410-settlement": false,
  "market-410-collaboration": false,
});

export type Market410DiagnosticCode =
  | "FEATURE_DISABLED"
  | "UNKNOWN_FLAG"
  | "KILL_SWITCH_ACTIVE"
  | "PERMISSION_DENIED"
  | "AUTHORIZATION_PROOF_MISMATCH"
  | "TENANT_MISMATCH"
  | "ENVIRONMENT_MISMATCH"
  | "REGISTRY_NOT_FOUND"
  | "REGISTRY_REVISION_MISMATCH"
  | "LOCK_MISMATCH"
  | "MISSING_LOCK"
  | "PROVIDER_EVENT_INVALID"
  | "PROVIDER_EVENT_CONFLICT"
  | "PROVIDER_EVENT_HOLD"
  | "INVALID_TRANSITION"
  | "CAUSAL_ORDER_INVALID"
  | "DUPLICATE_SETTLEMENT"
  | "ENTITLEMENT_BINDING_MISMATCH"
  | "LICENSE_BINDING_MISMATCH"
  | "LEDGER_BINDING_MISMATCH"
  | "AUTHORITY_RESOLUTION_FAILED"
  | "CALLER_FINANCIAL_INPUT_REJECTED"
  | "MONEY_INVALID"
  | "CURRENCY_MISMATCH"
  | "FEE_SCHEDULE_INVALID"
  | "COLLABORATIVE_SNAPSHOT_INVALID"
  | "COLLABORATIVE_OVERRIDE_REJECTED"
  | "DEDUCTION_INVALID"
  | "MONEY_OVERFLOW"
  | "DUPLICATE_PRODUCT"
  | "UNSAFE_AUDIT_DATA";

export interface Market410Diagnostic {
  readonly code: Market410DiagnosticCode;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  /** This text is constant and never contains caller or provider payloads. */
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  readonly recoverable: boolean;
}

export type Market410Result<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Market410Diagnostic[];
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly Market410Diagnostic[];
  };

function success<T>(
  value: T,
  diagnostics: readonly Market410Diagnostic[] = [],
): Market410Result<T> {
  return { ok: true, value, diagnostics };
}

function failure<T>(
  diagnostics: readonly Market410Diagnostic[],
): Market410Result<T> {
  return { ok: false, diagnostics };
}

function info(
  code: Market410DiagnosticCode,
  message: string,
  metadata?: Readonly<Record<string, string | number | boolean>>,
): Market410Diagnostic {
  return {
    code,
    severity: "INFO",
    message,
    ...(metadata === undefined ? {} : { metadata }),
    recoverable: true,
  };
}

function warning(
  code: Market410DiagnosticCode,
  message: string,
): Market410Diagnostic {
  return { code, severity: "WARNING", message, recoverable: true };
}

function error(
  code: Market410DiagnosticCode,
  message: string,
  path?: string,
): Market410Diagnostic {
  return {
    code,
    severity: "ERROR",
    message,
    ...(path === undefined ? {} : { path }),
    recoverable: false,
  };
}

function validId(value: string): boolean {
  return SAFE_ID.test(value);
}

function validHash(value: string): boolean {
  return SAFE_HASH.test(value);
}

function sameLockedPackage(
  left: LockedPackageReference,
  right: LockedPackageReference,
): boolean {
  return left.packageId === right.packageId &&
    left.packageVersion === right.packageVersion &&
    left.manifestHash === right.manifestHash &&
    left.dependencySnapshotHash === right.dependencySnapshotHash &&
    left.contentHash === right.contentHash &&
    left.licenseSnapshotId === right.licenseSnapshotId &&
    left.licenseSnapshotHash === right.licenseSnapshotHash &&
    left.mode === right.mode;
}

function sameMoneyShape(
  left: { readonly amountMinor: number; readonly currency: string },
  right: { readonly amountMinor: number; readonly currency: string },
): boolean {
  return left.amountMinor === right.amountMinor &&
    left.currency === right.currency;
}

function safeProviderIdentityKey(event: VerifiedProviderEventV1): string {
  return [
    event.eventId,
    event.sourceKind,
    event.sourceId,
    event.eventType,
    event.environment,
  ].join("\u0000");
}

function sameProviderIdentity(
  left: VerifiedProviderEventV1,
  right: VerifiedProviderEventV1,
): boolean {
  return left.eventId === right.eventId &&
    left.sourceKind === right.sourceKind &&
    left.sourceId === right.sourceId &&
    left.eventType === right.eventType &&
    left.environment === right.environment;
}

function providerEventPayloadConflictFailure(): Market410Result<never> {
  return failure([
    error(
      "PROVIDER_EVENT_CONFLICT",
      "The same Provider Event identity was received with a different payload fingerprint.",
      "providerEvent.payloadFingerprint",
    ),
  ]);
}

function providerEventQuarantineFailure(): Market410Result<never> {
  return failure([
    error(
      "PROVIDER_EVENT_CONFLICT",
      PROVIDER_EVENT_QUARANTINE_MESSAGE,
      "providerEvent.eventId",
    ),
  ]);
}

function mapFinancialCode(code: string): Market410DiagnosticCode {
  const known: ReadonlySet<string> = new Set([
    "CALLER_FINANCIAL_INPUT_REJECTED",
    "MONEY_INVALID",
    "CURRENCY_MISMATCH",
    "FEE_SCHEDULE_INVALID",
    "COLLABORATIVE_SNAPSHOT_INVALID",
    "COLLABORATIVE_OVERRIDE_REJECTED",
    "DEDUCTION_INVALID",
    "MONEY_OVERFLOW",
    "DUPLICATE_PRODUCT",
    "PROVIDER_EVENT_INVALID",
    "PURCHASE_BINDING_MISMATCH",
    "LICENSE_BINDING_MISMATCH",
    "LEDGER_INVALID",
    "PERMISSION_DENIED",
    "FINANCIAL_AUTHORITY_REQUIRED",
    "FINANCIAL_AUTHORITY_MISMATCH",
    "ROYALTY_ALLOCATION_INVALID",
    "COLLABORATIVE_OVERRIDE_REJECTED",
  ]);
  return known.has(code)
    ? code as Market410DiagnosticCode
    : "AUTHORITY_RESOLUTION_FAILED";
}

function mapExternalDiagnostics(
  diagnostics: readonly {
    readonly code: string;
    readonly severity: "INFO" | "WARNING" | "ERROR";
    readonly path?: string;
    readonly recoverable: boolean;
  }[],
): readonly Market410Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: mapFinancialCode(diagnostic.code),
    severity: diagnostic.severity,
    message: diagnostic.severity === "INFO"
      ? "A canonical WP-210 or FP-003 resolution was accepted."
      : "A canonical WP-210 or FP-003 contract rejected the composition input.",
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    recoverable: diagnostic.recoverable,
  }));
}

function mapMarketDiagnostics(
  diagnostics: readonly {
    readonly code: string;
    readonly severity: "INFO" | "WARNING" | "ERROR";
    readonly path?: string;
    readonly recoverable: boolean;
  }[],
): readonly Market410Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: mapFinancialCode(diagnostic.code),
    severity: diagnostic.severity,
    message: diagnostic.severity === "INFO"
      ? "A canonical WP-210 projection was accepted."
      : "A canonical WP-210 contract rejected the composition input.",
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    recoverable: diagnostic.recoverable,
  }));
}

function clonePackage(
  packageReference: LockedPackageReference,
): LockedPackageReference {
  return Object.freeze({ ...packageReference });
}

function cloneProduct(
  product: MarketProductProjection,
): MarketProductProjection {
  return Object.freeze({
    ...product,
    package: clonePackage(product.package),
    price: Object.freeze({ ...product.price }),
    rights: Object.freeze([...product.rights]),
  });
}

function clonePurchase(purchase: PurchaseRecord): PurchaseRecord {
  return Object.freeze({
    ...purchase,
    package: clonePackage(purchase.package),
    amount: Object.freeze({ ...purchase.amount }),
    appliedEvents: Object.freeze(
      purchase.appliedEvents.map((event) => ({ ...event })),
    ),
  });
}

function cloneRights(
  rights: Market410RightsAuthority,
): Market410RightsAuthority {
  return Object.freeze({
    ...rights,
    package: clonePackage(rights.package),
    rights: Object.freeze([...rights.rights]),
  });
}

function cloneContributorSnapshot(
  snapshot: ContributorSnapshotV1,
): ContributorSnapshotV1 {
  return Object.freeze({
    ...snapshot,
    contributors: Object.freeze(
      snapshot.contributors.map((contributor) =>
        Object.freeze({ ...contributor })
      ),
    ),
  });
}

function cloneProductFingerprint(
  fingerprint: ProductFingerprintV1,
): ProductFingerprintV1 {
  return Object.freeze({
    ...fingerprint,
    includedAssetRevisionSet: Object.freeze([
      ...fingerprint.includedAssetRevisionSet,
    ]),
  });
}

function cloneCollaborativeAuthority(
  authority: CollaborativeRevenueAuthorityV1,
): CollaborativeRevenueAuthorityV1 {
  return Object.freeze({
    ...authority,
    contributorSnapshot: cloneContributorSnapshot(
      authority.contributorSnapshot,
    ),
    productFingerprint: cloneProductFingerprint(authority.productFingerprint),
    gross: Object.freeze({ ...authority.gross }),
    deductions: Object.freeze(
      authority.deductions.map((deduction) =>
        Object.freeze({
          ...deduction,
          amount: Object.freeze({ ...deduction.amount }),
        })
      ),
    ),
  });
}

function issueSyntheticServerProof(
  expected: AuthorizationProofExpectation,
): AuthorizationProofV1 {
  const now = Date.now();
  const issuedAt = new Date(now - 1_000).toISOString();
  const expiresAt = new Date(now + 60 * 60 * 1_000).toISOString();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "market410-synthetic-server-registry",
    proofId: `market410:proof:${expected.resourceType ?? "unknown"}:${
      expected.resourceId ?? "unknown"
    }`,
    principalId: expected.principalId ?? null,
    resourceType: expected.resourceType ?? "MARKET410",
    resourceId: expected.resourceId ?? "market410",
    action: expected.action ?? "market410.resolve",
    capability: expected.capability ?? "market410.resolve",
    tenantId: expected.tenantId ?? null,
    correlationId: expected.correlationId ?? null,
    policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "market410:synthetic-grant",
    issuedAt,
    expiresAt,
  };
}

export interface Market410RightsAuthority {
  readonly entitlementId: EntitlementId;
  readonly productId: MarketProductProjection["productId"];
  readonly package: LockedPackageReference;
  readonly licenseSnapshotId: LicenseSnapshot["licenseSnapshotId"];
  readonly licenseSnapshotHash: ContentHash;
  readonly rights: readonly LicenseRight[];
}

export interface Market410LedgerAuthority {
  readonly purchaseId: MarketPurchaseId;
  readonly recipientAccountIds: readonly string[];
}

export interface Market410ProductRecord {
  readonly productRevision: string;
  readonly packageRevision: string;
  readonly tenantId: string;
  readonly environment: Market410Environment;
  readonly permission: Market410Permission;
  readonly product: MarketProductProjection;
}

export interface Market410PurchaseRecord {
  readonly purchaseRevision: string;
  readonly packageRevision: string;
  readonly tenantId: string;
  readonly environment: Market410Environment;
  readonly permission: Market410Permission;
  readonly buyerPrincipalId: string;
  readonly purchase: PurchaseRecord;
  readonly rights: Market410RightsAuthority;
  readonly ledger: Market410LedgerAuthority;
}

export interface Market410ProviderRecord {
  readonly tenantId: string;
  readonly environment: Market410Environment;
  readonly productRevision: string;
  readonly packageRevision: string;
  readonly providerEvent: VerifiedProviderEventV1;
  readonly authority: FinancialAuthorityResolutionV1;
}

export interface Market410CollaborativeRecord {
  readonly tenantId: string;
  readonly environment: Market410Environment;
  readonly permission: Market410Permission;
  readonly productRevision: string;
  readonly packageRevision: string;
  readonly authority: CollaborativeRevenueAuthorityV1;
  readonly existingFingerprints: readonly ProductFingerprintV1[];
}

export interface Market410RegistrySeed {
  readonly products: readonly Market410ProductRecord[];
  readonly purchases: readonly Market410PurchaseRecord[];
  readonly providers: readonly Market410ProviderRecord[];
  readonly collaborative?: readonly Market410CollaborativeRecord[];
}

export interface Market410Registry {
  resolveProduct(
    productId: MarketProductProjection["productId"],
    productRevision: string,
    packageRevision: string,
  ): Market410ProductRecord | undefined;
  resolvePurchase(
    purchaseId: MarketPurchaseId,
    purchaseRevision: string,
    packageRevision: string,
  ): Market410PurchaseRecord | undefined;
  resolveProviderEvent(
    event: VerifiedProviderEventV1,
  ): Market410ProviderRecord | undefined;
  resolveCollaborative(
    productRevisionId: CollaborativeRevenueAuthorityV1["productRevisionId"],
  ): Market410CollaborativeRecord | undefined;
  resolveAuthorizationProof(
    expected: AuthorizationProofExpectation,
  ): AuthorizationProofV1;
}

/**
 * Synthetic server Registry. Its maps are private and all operation methods
 * resolve against the captured records; callers cannot supply replacement
 * Product, Purchase, Fee Schedule, Snapshot, License, or Ledger authority.
 */
export class InMemoryMarket410Registry implements Market410Registry {
  readonly #products = new Map<string, Market410ProductRecord>();
  readonly #purchases = new Map<string, Market410PurchaseRecord>();
  readonly #providersByEventId = new Map<string, Market410ProviderRecord>();
  readonly #collaborative = new Map<string, Market410CollaborativeRecord>();
  readonly #collaborativeSnapshotHashesByWorkId = new Map<
    string,
    ContentHash
  >();

  constructor(seed: Market410RegistrySeed) {
    for (const input of seed.products) {
      if (
        !validId(input.productRevision) ||
        !validId(input.packageRevision) ||
        !validId(input.tenantId) ||
        input.product.package.mode !== "PINNED"
      ) {
        throw new Error(
          "MARKET-410 Product Registry seed is not locked and stable.",
        );
      }
      const serverProof = issueSyntheticServerProof({
        principalId: input.product.ownerAccountId,
        resourceType: "MARKET_PRODUCT",
        resourceId: input.product.productId,
        action: "market.product.project",
        capability: "market.product.project",
        tenantId: input.tenantId,
        policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
      });
      const proofResolver: AuthorizationProofResolver = ({ expected }) =>
        issueSyntheticServerProof(expected);
      const projectionInput: ProductProjectionInput = {
        productId: input.product.productId,
        ...(input.product.legacyProductId === undefined
          ? {}
          : { legacyProductId: input.product.legacyProductId }),
        package: input.product.package,
        classification: input.product.classification,
        publication: input.product.publication,
        status: input.product.status,
        ownerAccountId: input.product.ownerAccountId,
        ...(input.product.legacyUrl === undefined
          ? {}
          : { legacyUrl: input.product.legacyUrl }),
        price: input.product.price,
        rights: input.product.rights,
        source: input.product.source,
        authorizationProof: serverProof,
        authorizationProofResolver: proofResolver,
      };
      const projected = createProductProjection(projectionInput);
      if (!projected.ok) {
        throw new Error(
          "MARKET-410 Product Registry seed failed WP-210 projection validation.",
        );
      }
      const key = productKey(
        projected.value.productId,
        input.productRevision,
        input.packageRevision,
      );
      if (this.#products.has(key)) {
        throw new Error(
          "MARKET-410 Product Registry contains a duplicate revision.",
        );
      }
      this.#products.set(
        key,
        Object.freeze({
          ...input,
          product: cloneProduct(projected.value),
        }),
      );
    }

    for (const input of seed.purchases) {
      if (
        !validId(input.purchaseRevision) ||
        !validId(input.packageRevision) ||
        !validId(input.tenantId) ||
        !validId(input.buyerPrincipalId) ||
        input.purchase.lifecycle !== "PENDING" ||
        input.purchase.appliedEvents.length !== 0 ||
        input.purchase.buyerAccountId !== input.buyerPrincipalId ||
        input.purchase.package.mode !== "PINNED" ||
        input.rights.package.mode !== "PINNED" ||
        input.rights.productId !== input.purchase.productId ||
        input.rights.licenseSnapshotId !==
          input.purchase.package.licenseSnapshotId ||
        input.rights.licenseSnapshotHash !==
          input.purchase.package.licenseSnapshotHash ||
        !sameLockedPackage(input.rights.package, input.purchase.package) ||
        input.ledger.purchaseId !== input.purchase.purchaseId
      ) {
        throw new Error(
          "MARKET-410 Purchase Registry seed is not a canonical locked record.",
        );
      }
      const serverProof = issueSyntheticServerProof({
        principalId: input.buyerPrincipalId,
        resourceType: "MARKET_PURCHASE",
        resourceId: input.purchase.purchaseId,
        action: "market.purchase.create",
        capability: "market.purchase.create",
        tenantId: input.tenantId,
        policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
      });
      const proofResolver: AuthorizationProofResolver = ({ expected }) =>
        issueSyntheticServerProof(expected);
      const purchaseInput: PurchaseInput = {
        purchaseId: input.purchase.purchaseId,
        productId: input.purchase.productId,
        orderId: input.purchase.orderId,
        buyerAccountId: input.purchase.buyerAccountId,
        package: input.purchase.package,
        amount: input.purchase.amount,
        provider: input.purchase.provider,
        authorizationProof: serverProof,
        authorizationProofResolver: proofResolver,
      };
      const canonicalPurchase = createPurchaseRecord(purchaseInput);
      if (!canonicalPurchase.ok) {
        throw new Error(
          "MARKET-410 Purchase Registry seed failed WP-210 purchase validation.",
        );
      }
      const key = purchaseKey(
        canonicalPurchase.value.purchaseId,
        input.purchaseRevision,
        input.packageRevision,
      );
      if (this.#purchases.has(key)) {
        throw new Error(
          "MARKET-410 Purchase Registry contains a duplicate revision.",
        );
      }
      this.#purchases.set(
        key,
        Object.freeze({
          ...input,
          purchase: clonePurchase(canonicalPurchase.value),
          rights: cloneRights(input.rights),
          ledger: Object.freeze({
            ...input.ledger,
            recipientAccountIds: Object.freeze([
              ...input.ledger.recipientAccountIds,
            ]),
          }),
        }),
      );
    }

    for (const input of seed.providers) {
      if (
        !validId(input.providerEvent.eventId) ||
        !validHash(input.providerEvent.payloadFingerprint) ||
        !validId(input.providerEvent.sourceId) ||
        input.providerEvent.schemaVersion !== FP003_FINANCIAL_SCHEMA_VERSION ||
        input.authority.schemaVersion !== FP003_FINANCIAL_SCHEMA_VERSION
      ) {
        throw new Error(
          "MARKET-410 Provider Registry seed is not a verified FP-003 identity.",
        );
      }
      if (this.#providersByEventId.has(input.providerEvent.eventId)) {
        throw new Error(
          "MARKET-410 Provider Registry contains a duplicate event identity.",
        );
      }
      this.#providersByEventId.set(
        input.providerEvent.eventId,
        Object.freeze({
          ...input,
          providerEvent: Object.freeze({ ...input.providerEvent }),
          authority: Object.freeze({
            ...input.authority,
            gross: Object.freeze({ ...input.authority.gross }),
            feeSchedule: Object.freeze({
              ...input.authority.feeSchedule,
              royaltyRecipients: Object.freeze(
                input.authority.feeSchedule.royaltyRecipients.map((
                  recipient,
                ) => ({ ...recipient })),
              ),
            }),
          }),
        }),
      );
    }

    for (const input of seed.collaborative ?? []) {
      if (
        !validId(input.productRevision) ||
        !validId(input.packageRevision) ||
        !validId(input.tenantId) ||
        input.authority.schemaVersion !== "COLLABORATIVE_COMMERCE_V1" ||
        input.authority.contributorSnapshot.schemaVersion !==
          CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION
      ) {
        throw new Error(
          "MARKET-410 Collaborative Registry seed is not canonical.",
        );
      }
      if (this.#collaborative.has(input.authority.productRevisionId)) {
        throw new Error(
          "MARKET-410 Collaborative Registry contains a duplicate revision.",
        );
      }
      const collaborativeWorkId = String(input.authority.collaborativeWorkId);
      const snapshotHash = input.authority.contributorSnapshot.snapshotHash;
      const lockedSnapshotHash = this.#collaborativeSnapshotHashesByWorkId.get(
        collaborativeWorkId,
      );
      if (
        lockedSnapshotHash !== undefined &&
        lockedSnapshotHash !== snapshotHash
      ) {
        throw new Error(MARKET410_CONTRIBUTOR_SNAPSHOT_CONFLICT_ERROR);
      }
      this.#collaborativeSnapshotHashesByWorkId.set(
        collaborativeWorkId,
        snapshotHash,
      );
      const authority = cloneCollaborativeAuthority(input.authority);
      this.#collaborative.set(
        input.authority.productRevisionId,
        Object.freeze({
          ...input,
          authority,
          existingFingerprints: Object.freeze(
            input.existingFingerprints.map(cloneProductFingerprint),
          ),
        }),
      );
    }
  }

  resolveProduct(
    productId: MarketProductProjection["productId"],
    productRevision: string,
    packageRevision: string,
  ): Market410ProductRecord | undefined {
    return this.#products.get(
      productKey(productId, productRevision, packageRevision),
    );
  }

  resolvePurchase(
    purchaseId: MarketPurchaseId,
    purchaseRevision: string,
    packageRevision: string,
  ): Market410PurchaseRecord | undefined {
    return this.#purchases.get(
      purchaseKey(purchaseId, purchaseRevision, packageRevision),
    );
  }

  resolveProviderEvent(
    event: VerifiedProviderEventV1,
  ): Market410ProviderRecord | undefined {
    return this.#providersByEventId.get(event.eventId);
  }

  resolveCollaborative(
    productRevisionId: CollaborativeRevenueAuthorityV1["productRevisionId"],
  ): Market410CollaborativeRecord | undefined {
    return this.#collaborative.get(productRevisionId);
  }

  resolveAuthorizationProof(
    expected: AuthorizationProofExpectation,
  ): AuthorizationProofV1 {
    return issueSyntheticServerProof(expected);
  }
}

function productKey(
  productId: string,
  productRevision: string,
  packageRevision: string,
): string {
  return `${productId}\u0000${productRevision}\u0000${packageRevision}`;
}

function purchaseKey(
  purchaseId: string,
  purchaseRevision: string,
  packageRevision: string,
): string {
  return `${purchaseId}\u0000${purchaseRevision}\u0000${packageRevision}`;
}

export function createInMemoryMarket410Registry(
  seed: Market410RegistrySeed,
): InMemoryMarket410Registry {
  return new InMemoryMarket410Registry(seed);
}

export function market410FeatureEnabled(
  flags: Market410FeatureFlags,
  flag: string,
  killSwitch: boolean,
): Market410Result<true> {
  if (killSwitch === true) {
    return failure([
      error("KILL_SWITCH_ACTIVE", "The MARKET-410 kill switch is active."),
    ]);
  }
  if (
    !Object.prototype.hasOwnProperty.call(DEFAULT_MARKET410_FEATURE_FLAGS, flag)
  ) {
    return failure([
      error(
        "UNKNOWN_FLAG",
        "An unknown MARKET-410 feature flag is disabled.",
        "flag",
      ),
    ]);
  }
  if (flags[flag] !== true) {
    return failure([
      error(
        "FEATURE_DISABLED",
        "The MARKET-410 feature is disabled by default.",
        "flag",
      ),
    ]);
  }
  return success(true);
}

export interface Market410SettlementRequest {
  readonly productId: MarketProductProjection["productId"];
  readonly productRevision: string;
  readonly packageRevision: string;
  readonly purchaseId: MarketPurchaseId;
  readonly purchaseRevision: string;
  readonly providerEvent: VerifiedProviderEventV1;
  /** Only causal lifecycle references are accepted; Money is never accepted here. */
  readonly purchaseEvents?: readonly PurchaseEvent[];
  readonly authorizationProof: AuthorizationProofV1;
  readonly callerFinancialInput?: UntrustedFinancialInput;
  /** A caller claim is checked against the Registry environment, never used as authority. */
  readonly expectedEnvironment?: Market410Environment;
}

export interface Market410Settlement {
  readonly product: MarketProductProjection;
  readonly productRevision: string;
  readonly packageRevision: string;
  readonly purchaseRevision: string;
  readonly purchase: PurchaseRecord;
  readonly entitlement?: EntitlementRecord;
  readonly license: LicenseSnapshot;
  readonly allocations: readonly {
    readonly recipientAccountId: string;
    readonly amountMinor: number;
    readonly currency: string;
  }[];
  readonly ledgerEntries: readonly CanonicalMarketRoyaltyLedgerEntry[];
  readonly providerEvent: Readonly<{
    readonly schemaVersion: typeof FP003_FINANCIAL_SCHEMA_VERSION;
    readonly eventId: VerifiedProviderEventV1["eventId"];
    readonly payloadFingerprint: ContentHash;
    readonly sourceKind: VerifiedProviderEventV1["sourceKind"];
    readonly sourceId: string;
    readonly eventType: VerifiedProviderEventV1["eventType"];
    readonly environment: Market410Environment;
  }>;
  readonly causalOrder: readonly string[];
  readonly localLedgerIdentity: readonly string[];
}

export type Market410SettlementStatus =
  | "APPLIED"
  | "IDEMPOTENT_NOOP"
  | "HELD_OUT_OF_ORDER";

export interface Market410SettlementOutcome {
  readonly status: Market410SettlementStatus;
  readonly changed: boolean;
  readonly settlement?: Market410Settlement;
}

interface ProviderState {
  readonly payloadFingerprint: ContentHash;
  readonly status: "HELD" | "APPLIED";
  readonly settlement?: Market410Settlement;
}

interface ProviderEventQuarantineState {
  readonly reason: "PAYLOAD_CONFLICT";
}

export interface Market410CollaborativeRequest {
  readonly productRevisionId:
    CollaborativeRevenueAuthorityV1["productRevisionId"];
  readonly packageRevision: string;
  readonly authorizationProof: AuthorizationProofV1;
  readonly callerOverrides?: Readonly<Record<string, unknown>>;
  readonly expectedEnvironment?: Market410Environment;
}

export interface Market410CollaborativeOutcome {
  readonly status: "ALLOCATED";
  readonly productRevisionId:
    CollaborativeRevenueAuthorityV1["productRevisionId"];
  readonly contributorSnapshotHash: ContentHash;
  readonly productFingerprint: ContentHash;
  readonly allocations: readonly ContributorRevenueAllocationV1[];
}

/**
 * Captures the registry once. All financial and rights resolution methods are
 * deliberately absent from the request shape and close over this registry.
 */
export class Market410Composition {
  readonly #registry: Market410Registry;
  readonly #flags: Market410FeatureFlags;
  readonly #killSwitch: boolean;
  readonly #purchaseStates = new Map<string, PurchaseRecord>();
  readonly #purchaseEvents = new Map<string, PurchaseEvent>();
  readonly #providerStates = new Map<string, ProviderState>();
  readonly #providerEventQuarantine = new Map<
    string,
    ProviderEventQuarantineState
  >();

  constructor(
    registry: Market410Registry,
    options: {
      readonly flags?: Market410FeatureFlags;
      readonly killSwitch?: boolean;
    } = {},
  ) {
    this.#registry = registry;
    this.#flags = options.flags ?? {};
    this.#killSwitch = options.killSwitch === true;
  }

  async settle(
    input: Market410SettlementRequest,
  ): Promise<Market410Result<Market410SettlementOutcome>> {
    const enabled = market410FeatureEnabled(
      this.#flags,
      "market-410-settlement",
      this.#killSwitch,
    );
    if (!enabled.ok) return enabled;

    if (
      this.#providerEventQuarantine.has(String(input.providerEvent.eventId))
    ) {
      return providerEventQuarantineFailure();
    }

    if (
      input.callerFinancialInput !== undefined &&
      Object.keys(input.callerFinancialInput).length > 0
    ) {
      return failure([
        error(
          "CALLER_FINANCIAL_INPUT_REJECTED",
          "Caller financial fields are rejected; FP-003 server authority is required.",
          "callerFinancialInput",
        ),
      ]);
    }

    const product = this.#registry.resolveProduct(
      input.productId,
      input.productRevision,
      input.packageRevision,
    );
    const purchase = this.#registry.resolvePurchase(
      input.purchaseId,
      input.purchaseRevision,
      input.packageRevision,
    );
    const provider = this.#registry.resolveProviderEvent(input.providerEvent);
    if (product === undefined || purchase === undefined) {
      return failure([
        error(
          "REGISTRY_REVISION_MISMATCH",
          "The requested Product, Package, or Purchase revision is not current in the server Registry.",
          "revision",
        ),
      ]);
    }
    if (provider === undefined) {
      return failure([
        error(
          "REGISTRY_NOT_FOUND",
          "The Provider Event is not present in the server Registry.",
          "providerEvent",
        ),
      ]);
    }

    if (
      provider.providerEvent.payloadFingerprint !==
        input.providerEvent.payloadFingerprint
    ) {
      this.#providerEventQuarantine.set(String(input.providerEvent.eventId), {
        reason: "PAYLOAD_CONFLICT",
      });
      return providerEventPayloadConflictFailure();
    }

    const inputProviderKey = safeProviderIdentityKey(input.providerEvent);
    const priorInputProvider = this.#providerStates.get(inputProviderKey);
    if (
      priorInputProvider !== undefined &&
      priorInputProvider.payloadFingerprint !==
        input.providerEvent.payloadFingerprint
    ) {
      this.#providerEventQuarantine.set(String(input.providerEvent.eventId), {
        reason: "PAYLOAD_CONFLICT",
      });
      return providerEventPayloadConflictFailure();
    }

    const commonFailure = this.validateSettlementBindings(
      input,
      product,
      purchase,
      provider,
    );
    if (commonFailure !== undefined) return failure([commonFailure]);

    const providerKey = safeProviderIdentityKey(provider.providerEvent);
    const priorProvider = this.#providerStates.get(providerKey);
    if (
      priorProvider !== undefined &&
      priorProvider.payloadFingerprint !==
        input.providerEvent.payloadFingerprint
    ) {
      this.#providerEventQuarantine.set(String(input.providerEvent.eventId), {
        reason: "PAYLOAD_CONFLICT",
      });
      return providerEventPayloadConflictFailure();
    }
    if (
      priorProvider?.status === "APPLIED" &&
      priorProvider.settlement !== undefined
    ) {
      return success(
        {
          status: "IDEMPOTENT_NOOP",
          changed: false,
          settlement: priorProvider.settlement,
        },
        [info(
          "DUPLICATE_SETTLEMENT",
          "The Provider Event replay was a local idempotent no-op.",
          { idempotent: true },
        )],
      );
    }

    const currentPurchase =
      this.#purchaseStates.get(purchase.purchase.purchaseId) ??
        purchase.purchase;
    const suppliedEvents = [...(input.purchaseEvents ?? [])];
    const expectedPaymentEventId = asPaymentEventId(
      provider.providerEvent.eventId,
    );
    const expectedPurchaseEventType =
      provider.authority.settlementState === "PAID" ? "PAID" : "REVERSED";
    const providerPurchaseEvent = suppliedEvents.find((event) =>
      event.eventId === expectedPaymentEventId
    );
    if (
      providerPurchaseEvent === undefined ||
      providerPurchaseEvent.purchaseId !== currentPurchase.purchaseId ||
      providerPurchaseEvent.type !== expectedPurchaseEventType ||
      providerPurchaseEvent.payloadFingerprint !==
        provider.providerEvent.payloadFingerprint
    ) {
      return failure([
        error(
          "PROVIDER_EVENT_INVALID",
          "The Purchase Event does not bind to the server-verified Provider Event identity.",
          "purchaseEvents",
        ),
      ]);
    }

    for (const event of suppliedEvents) {
      if (
        event.purchaseId !== currentPurchase.purchaseId ||
        (event.eventId !== expectedPaymentEventId &&
          event.type !== "CHECKOUT_BOUND")
      ) {
        return failure([
          error(
            "PROVIDER_EVENT_INVALID",
            "Only the canonical Provider Event and its checkout prerequisite may cross this boundary.",
            "purchaseEvents",
          ),
        ]);
      }
      const eventKey = `${currentPurchase.purchaseId}\u0000${event.eventId}`;
      const priorEvent = this.#purchaseEvents.get(eventKey);
      if (
        priorEvent !== undefined &&
        (priorEvent.sequence !== event.sequence ||
          priorEvent.type !== event.type ||
          priorEvent.payloadFingerprint !== event.payloadFingerprint)
      ) {
        return failure([
          error(
            "PROVIDER_EVENT_CONFLICT",
            "The same Purchase Event identity was received with a different canonical payload.",
            "purchaseEvents",
          ),
        ]);
      }
    }

    const hasCheckout =
      currentPurchase.appliedEvents.some((event) =>
        event.type === "CHECKOUT_BOUND"
      ) || suppliedEvents.some((event) => event.type === "CHECKOUT_BOUND");
    const paidEligible = provider.authority.settlementState === "PAID"
      ? hasCheckout &&
        (currentPurchase.lifecycle === "PENDING" ||
          currentPurchase.lifecycle === "CHECKOUT_BOUND")
      : ["PAID", "DELIVERABLE", "DELIVERED", "DISPUTED"].includes(
        currentPurchase.lifecycle,
      );
    if (!paidEligible) {
      this.#providerStates.set(providerKey, {
        payloadFingerprint: provider.providerEvent.payloadFingerprint,
        status: "HELD",
      });
      return success(
        { status: "HELD_OUT_OF_ORDER", changed: false },
        [warning(
          "PROVIDER_EVENT_HOLD",
          "The Provider Event is held until its causal Purchase prerequisite is present.",
        )],
      );
    }

    const allEvents = this.eventsForPurchase(
      currentPurchase.purchaseId,
      suppliedEvents,
    );
    const proofExpected: AuthorizationProofExpectation = {
      principalId: purchase.buyerPrincipalId,
      resourceType: FP003_FINANCIAL_RESOURCE_TYPE,
      resourceId: currentPurchase.purchaseId,
      action: FP003_FINANCIAL_ACTION,
      capability: FP003_FINANCIAL_CAPABILITY,
      tenantId: purchase.tenantId,
      policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    };
    const serverProof = this.resolveServerProof(
      input.authorizationProof,
      proofExpected,
    );
    if (!serverProof.ok) return serverProof;

    const financialInput: Parameters<
      typeof materializeMarketFinancialSettlement
    >[0] = {
      product: product.product,
      purchase: currentPurchase,
      paymentEvents: allEvents,
      entitlementId: purchase.rights.entitlementId,
      providerEvent: provider.providerEvent,
      canonicalPrincipalId: purchase.buyerPrincipalId,
      authorizationProof: serverProof.value,
      authorizationProofResolver: ({ expected }) =>
        this.#registry.resolveAuthorizationProof(expected),
      authorityResolver: () => provider.authority,
    };
    const financial = await materializeMarketFinancialSettlement(
      financialInput,
    );
    if (!financial.ok) {
      return failure(mapExternalDiagnostics(financial.diagnostics));
    }

    const rights = materializePurchaseRights(
      financial.value.purchase,
      product.product,
      purchase.rights.entitlementId,
    );
    if (!rights.ok) return failure(mapMarketDiagnostics(rights.diagnostics));

    if (
      !sameLockedPackage(
        financial.value.license.package,
        purchase.rights.package,
      ) ||
      financial.value.license.productId !== purchase.rights.productId ||
      financial.value.license.licenseSnapshotId !==
        purchase.rights.licenseSnapshotId ||
      financial.value.license.package.licenseSnapshotHash !==
        purchase.rights.licenseSnapshotHash ||
      financial.value.license.rights.join("\u0000") !==
        purchase.rights.rights.join("\u0000")
    ) {
      return failure([
        error(
          "LICENSE_BINDING_MISMATCH",
          "The materialized License does not match the server Registry lock.",
          "license",
        ),
      ]);
    }
    if (
      (financial.value.entitlement?.entitlementId ??
          purchase.rights.entitlementId) !==
        purchase.rights.entitlementId ||
      (rights.value.entitlement?.purchaseId ?? currentPurchase.purchaseId) !==
        currentPurchase.purchaseId
    ) {
      return failure([
        error(
          "ENTITLEMENT_BINDING_MISMATCH",
          "The materialized Entitlement does not bind to the canonical Purchase.",
          "entitlement",
        ),
      ]);
    }
    const expectedRecipients = [...purchase.ledger.recipientAccountIds].sort();
    const actualRecipients = financial.value.ledgerEntries
      .map((entry) => entry.creatorAccountId)
      .sort();
    if (expectedRecipients.join("\u0000") !== actualRecipients.join("\u0000")) {
      return failure([
        error(
          "LEDGER_BINDING_MISMATCH",
          "The materialized Ledger recipients do not match the server Fee Schedule authority.",
          "ledgerEntries",
        ),
      ]);
    }
    if (
      new Set(financial.value.ledgerEntries.map((entry) => entry.ledgerEntryId))
        .size !==
        financial.value.ledgerEntries.length
    ) {
      return failure([
        error(
          "LEDGER_BINDING_MISMATCH",
          "A settlement cannot materialize duplicate Ledger entry identities.",
          "ledgerEntries",
        ),
      ]);
    }

    const settlement: Market410Settlement = {
      product: product.product,
      productRevision: input.productRevision,
      packageRevision: input.packageRevision,
      purchaseRevision: input.purchaseRevision,
      purchase: financial.value.purchase,
      ...(rights.value.entitlement === undefined
        ? {}
        : { entitlement: rights.value.entitlement }),
      license: financial.value.license,
      allocations: financial.value.allocations.map((allocation) => ({
        recipientAccountId: allocation.recipientAccountId,
        amountMinor: allocation.amount.amountMinor,
        currency: allocation.amount.currency,
      })),
      ledgerEntries: financial.value.ledgerEntries,
      providerEvent: {
        schemaVersion: provider.providerEvent.schemaVersion,
        eventId: provider.providerEvent.eventId,
        payloadFingerprint: provider.providerEvent.payloadFingerprint,
        sourceKind: provider.providerEvent.sourceKind,
        sourceId: provider.providerEvent.sourceId,
        eventType: provider.providerEvent.eventType,
        environment: provider.providerEvent.environment,
      },
      causalOrder: provider.authority.settlementState === "PAID"
        ? [
          "PRODUCT",
          "PACKAGE_LOCK",
          "PURCHASE",
          "CHECKOUT_BOUND",
          "PAID",
          "ENTITLEMENT",
          "LICENSE",
          "LEDGER",
        ]
        : [
          "PRODUCT",
          "PACKAGE_LOCK",
          "PURCHASE",
          "PAID",
          "REFUNDED",
          "ENTITLEMENT_REVOKE",
          "LICENSE_REVOKE",
          "LEDGER_REVERSAL",
        ],
      localLedgerIdentity: financial.value.ledgerEntries.map((entry) =>
        `${entry.ledgerEntryId}:${provider.providerEvent.eventId}`
      ),
    };

    this.#purchaseStates.set(
      currentPurchase.purchaseId,
      clonePurchase(financial.value.purchase),
    );
    for (const event of allEvents) {
      this.#purchaseEvents.set(
        `${currentPurchase.purchaseId}\u0000${event.eventId}`,
        event,
      );
    }
    this.#providerStates.set(providerKey, {
      payloadFingerprint: provider.providerEvent.payloadFingerprint,
      status: "APPLIED",
      settlement,
    });
    return success(
      { status: "APPLIED", changed: true, settlement },
      mapExternalDiagnostics(financial.diagnostics),
    );
  }

  async allocateCollaborative(
    input: Market410CollaborativeRequest,
  ): Promise<Market410Result<Market410CollaborativeOutcome>> {
    const enabled = market410FeatureEnabled(
      this.#flags,
      "market-410-collaboration",
      this.#killSwitch,
    );
    if (!enabled.ok) return enabled;

    const record = this.#registry.resolveCollaborative(input.productRevisionId);
    if (record === undefined) {
      return failure([
        error(
          "REGISTRY_NOT_FOUND",
          "The collaborative Product Revision is not present in the server Registry.",
          "productRevisionId",
        ),
      ]);
    }
    if (input.packageRevision !== record.packageRevision) {
      return failure([
        error(
          "REGISTRY_REVISION_MISMATCH",
          "The requested Package revision is not the Registry revision.",
          "packageRevision",
        ),
      ]);
    }
    if (record.permission !== "ALLOW") {
      return failure([
        error(
          "PERMISSION_DENIED",
          "The server Registry denied collaborative allocation.",
        ),
      ]);
    }
    if (
      input.expectedEnvironment !== undefined &&
      input.expectedEnvironment !== record.environment
    ) {
      return failure([
        error(
          "ENVIRONMENT_MISMATCH",
          "The requested environment does not match the server Registry.",
        ),
      ]);
    }
    const proofExpected: AuthorizationProofExpectation = {
      principalId: record.authority.productLeadId,
      resourceType: "MARKET_COLLABORATIVE_PRODUCT",
      resourceId: record.authority.productRevisionId,
      action: "market.collaborative.allocate",
      capability: "market.collaborative.allocate",
      tenantId: record.tenantId,
      policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    };
    const serverProof = this.resolveServerProof(
      input.authorizationProof,
      proofExpected,
    );
    if (!serverProof.ok) return serverProof;

    const duplicate = await guardDuplicateProductFingerprint(
      record.authority.productFingerprint,
      record.existingFingerprints,
    );
    if (!duplicate.ok) {
      return failure(mapExternalDiagnostics(duplicate.diagnostics));
    }

    const allocation = await deriveCollaborativeRevenueAllocation({
      authority: record.authority,
      ...(input.callerOverrides === undefined
        ? {}
        : { callerOverrides: input.callerOverrides }),
    });
    if (!allocation.ok) {
      return failure(mapExternalDiagnostics(allocation.diagnostics));
    }

    const snapshotHash = record.authority.contributorSnapshot.snapshotHash;
    if (
      allocation.value.some((entry) =>
        entry.contributorSnapshotHash !== snapshotHash
      )
    ) {
      return failure([
        error(
          "COLLABORATIVE_SNAPSHOT_INVALID",
          "Every allocation must retain the one locked Contributor Snapshot hash.",
          "contributorSnapshotHash",
        ),
      ]);
    }
    return success(
      {
        status: "ALLOCATED",
        productRevisionId: record.authority.productRevisionId,
        contributorSnapshotHash: snapshotHash,
        productFingerprint: record.authority.productFingerprint.fingerprint,
        allocations: allocation.value,
      },
      mapExternalDiagnostics(allocation.diagnostics),
    );
  }

  private resolveServerProof(
    callerProof: AuthorizationProofV1,
    expected: AuthorizationProofExpectation,
  ): Market410Result<AuthorizationProofV1> {
    try {
      requireAuthorizationProofV1(callerProof, expected);
      const serverProof = this.#registry.resolveAuthorizationProof(expected);
      requireAuthorizationProofV1(serverProof, expected);
      return success(serverProof);
    } catch {
      return failure([
        error(
          "AUTHORIZATION_PROOF_MISMATCH",
          "The caller proof is not bound to the current server principal, tenant, resource, and action.",
          "authorizationProof",
        ),
      ]);
    }
  }

  private validateSettlementBindings(
    input: Market410SettlementRequest,
    product: Market410ProductRecord,
    purchase: Market410PurchaseRecord,
    provider: Market410ProviderRecord,
  ): Market410Diagnostic | undefined {
    if (product.permission !== "ALLOW" || purchase.permission !== "ALLOW") {
      return error(
        "PERMISSION_DENIED",
        "The server Registry denied this Market operation.",
      );
    }
    if (
      product.tenantId !== purchase.tenantId ||
      provider.tenantId !== purchase.tenantId
    ) {
      return error(
        "TENANT_MISMATCH",
        "Product, Purchase, and Provider Event tenant bindings differ.",
      );
    }
    if (
      product.environment !== purchase.environment ||
      provider.environment !== purchase.environment ||
      input.providerEvent.environment !== provider.environment ||
      (input.expectedEnvironment !== undefined &&
        input.expectedEnvironment !== purchase.environment)
    ) {
      return error(
        "ENVIRONMENT_MISMATCH",
        "Product, Purchase, and Provider Event environment bindings differ.",
      );
    }
    if (
      purchase.purchase.productId !== product.product.productId ||
      !sameLockedPackage(purchase.purchase.package, product.product.package) ||
      !sameLockedPackage(purchase.rights.package, product.product.package)
    ) {
      return error(
        "LOCK_MISMATCH",
        "Product, Package, Purchase, and License references are not the same locked revision.",
        "package",
      );
    }
    if (
      provider.productRevision !== input.productRevision ||
      provider.packageRevision !== input.packageRevision ||
      provider.authority.sourceKind !== "MARKET_PURCHASE" ||
      provider.authority.sourceId !== purchase.purchase.purchaseId ||
      provider.authority.productId !== product.product.productId ||
      provider.authority.purchaseId !== purchase.purchase.purchaseId ||
      provider.providerEvent.sourceKind !== "MARKET_PURCHASE" ||
      provider.providerEvent.sourceId !== purchase.purchase.purchaseId ||
      !sameProviderIdentity(provider.providerEvent, input.providerEvent) ||
      provider.providerEvent.payloadFingerprint !==
        input.providerEvent.payloadFingerprint
    ) {
      return error(
        "PROVIDER_EVENT_INVALID",
        "The Provider Event and Financial Authority are not bound to the current Product and Purchase.",
        "providerEvent",
      );
    }
    if (
      !sameMoneyShape(product.product.price, purchase.purchase.amount) ||
      !validHash(product.product.package.licenseSnapshotHash) ||
      !validHash(purchase.rights.licenseSnapshotHash)
    ) {
      return error(
        "LOCK_MISMATCH",
        "The server Product price or License lock is not canonical.",
        "package",
      );
    }
    return undefined;
  }

  private eventsForPurchase(
    purchaseId: MarketPurchaseId,
    supplied: readonly PurchaseEvent[],
  ): readonly PurchaseEvent[] {
    const events = new Map<string, PurchaseEvent>();
    for (const [key, event] of this.#purchaseEvents.entries()) {
      if (key.startsWith(`${purchaseId}\u0000`)) {
        events.set(String(event.eventId), event);
      }
    }
    for (const event of supplied) events.set(String(event.eventId), event);
    return [...events.values()].sort((left, right) =>
      left.sequence - right.sequence ||
      String(left.eventId).localeCompare(String(right.eventId))
    );
  }
}

export function auditSafeMarket410Result(
  result: Market410Result<
    Market410SettlementOutcome | Market410CollaborativeOutcome
  >,
): Readonly<Record<string, string | number | boolean>> {
  if (!result.ok) {
    return {
      schemaVersion: MARKET410_SCHEMA_VERSION,
      ok: false,
      diagnosticCount: result.diagnostics.length,
      hasSensitiveFields: false,
      externalMutation: false,
    };
  }
  return {
    schemaVersion: MARKET410_SCHEMA_VERSION,
    ok: true,
    status: result.value.status,
    changed: "changed" in result.value ? result.value.changed : false,
    diagnosticCount: result.diagnostics.length,
    ledgerEntryCount: result.value.status === "ALLOCATED"
      ? result.value.allocations.length
      : result.value.settlement?.ledgerEntries.length ?? 0,
    hasSensitiveFields: false,
    externalMutation: false,
  };
}

export type { CanonicalCollaborativeDeductionV1, ProductFingerprintV1 };
export { asFinancialProviderEventId };
