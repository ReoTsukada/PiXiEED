/**
 * WP-260 Billing Framework.
 *
 * This module defines the client-visible billing vocabulary and the
 * fail-closed transition boundary. It never handles card data, provider
 * secrets, checkout payloads, or financial authority. A server-owned adapter
 * must materialize the paid entitlement and AuthorizationProofV1.
 */

import {
  requireAuthorizationProofV1,
  type AuthorizationProofV1,
} from "./wp160-contracts.ts";

export const BILLING_FRAMEWORK_SCHEMA_VERSION = 1 as const;
export const BILLING_EXTERNAL_BUILD_CAPABILITY = "game.build.external" as const;
export const BILLING_EXTERNAL_BUILD_RESOURCE_TYPE =
  "igame-external-build" as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const MAX_EVENT_IDS = 32;

export type BillingProductId = "studio.internal" | "game.external-build";
export type BillingProductKind = "INTERNAL_INCLUDED" | "EXTERNAL_BUILD";
export type BillingCurrency = "JPY";
export type BillingPurchaseKind = "INCLUDED" | "ONE_TIME";
export type BillingProviderState = "NOT_CONNECTED" | "CONNECTED";
export type BillingEntitlementStatus =
  | "NOT_PURCHASED"
  | "CHECKOUT_PENDING"
  | "ENTITLED"
  | "EXPIRED"
  | "REVOKED";
export type ExternalBuildTarget =
  | "ANDROID_APK"
  | "ANDROID_AAB"
  | "IOS_IPA"
  | "DESKTOP_PACKAGE"
  | "WEB_PACKAGE";

export interface BillingPrice {
  readonly currency: BillingCurrency;
  /** A price is server-catalogued; null means the catalog is not connected. */
  readonly amountMinorUnits: number | null;
  readonly source: "INTERNAL_POLICY" | "SERVER_CATALOG";
}

export interface BillingProductDefinition {
  readonly productId: BillingProductId;
  readonly kind: BillingProductKind;
  readonly label: string;
  readonly purchaseKind: BillingPurchaseKind;
  readonly price: BillingPrice;
  readonly capability: "studio.internal" | typeof BILLING_EXTERNAL_BUILD_CAPABILITY;
  readonly targets: readonly ExternalBuildTarget[];
}

/**
 * Product definitions are UI-safe catalog metadata. They are not payment
 * authority and the external price intentionally remains server-sourced.
 */
export const BILLING_PRODUCT_CATALOG: readonly BillingProductDefinition[] =
  Object.freeze([
    Object.freeze({
      productId: "studio.internal" as const,
      kind: "INTERNAL_INCLUDED" as const,
      label: "PiXiEED Studio内利用",
      purchaseKind: "INCLUDED" as const,
      price: Object.freeze({
        currency: "JPY" as const,
        amountMinorUnits: 0,
        source: "INTERNAL_POLICY" as const,
      }),
      capability: "studio.internal" as const,
      targets: Object.freeze([]) as readonly ExternalBuildTarget[],
    }),
    Object.freeze({
      productId: "game.external-build" as const,
      kind: "EXTERNAL_BUILD" as const,
      label: "iGAME 外部ビルド解放",
      purchaseKind: "ONE_TIME" as const,
      price: Object.freeze({
        currency: "JPY" as const,
        amountMinorUnits: null,
        source: "SERVER_CATALOG" as const,
      }),
      capability: BILLING_EXTERNAL_BUILD_CAPABILITY,
      targets: Object.freeze([
        "ANDROID_APK",
        "ANDROID_AAB",
        "IOS_IPA",
        "DESKTOP_PACKAGE",
        "WEB_PACKAGE",
      ]) as readonly ExternalBuildTarget[],
    }),
  ]);

export interface BillingScope {
  readonly projectId: string;
  readonly revisionId: string;
  readonly ownerId: string;
  readonly tenantId: string;
}

export interface BillingStateSnapshot {
  readonly schemaVersion: 1;
  readonly productId: "game.external-build";
  readonly capability: typeof BILLING_EXTERNAL_BUILD_CAPABILITY;
  readonly scope: BillingScope;
  readonly status: BillingEntitlementStatus;
  readonly checkoutId: string | null;
  readonly entitlementId: string | null;
  readonly grantId: string | null;
  readonly expiresAt: string | null;
  readonly lastSequence: number;
  readonly appliedEventIds: readonly string[];
  readonly source: "LOCAL_SAFE_DEFAULT" | "SERVER";
}

export type BillingDiagnosticCode =
  | "INVALID_IDENTITY"
  | "INVALID_EVENT"
  | "DUPLICATE_EVENT"
  | "EVENT_OUT_OF_ORDER"
  | "SCOPE_MISMATCH"
  | "INVALID_TRANSITION"
  | "SERVER_ENTITLEMENT_REQUIRED"
  | "PROVIDER_NOT_CONNECTED"
  | "TARGET_UNSUPPORTED"
  | "AUTHORIZATION_INVALID"
  | "GRANT_MISMATCH"
  | "ENTITLEMENT_EXPIRED";

export interface BillingDiagnostic {
  readonly code: BillingDiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export type BillingResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly BillingDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly BillingDiagnostic[] };

function success<T>(value: T, diagnostics: readonly BillingDiagnostic[] = []): BillingResult<T> {
  return { ok: true, value, diagnostics };
}

function failure<T = never>(
  code: BillingDiagnosticCode,
  message: string,
  path?: string,
): BillingResult<T> {
  const diagnostic: BillingDiagnostic = path === undefined
    ? { code, message }
    : { code, message, path };
  return { ok: false, diagnostics: [diagnostic] };
}

function validId(value: string): boolean {
  return SAFE_ID.test(value);
}

function validIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function equalScope(left: BillingScope, right: BillingScope): boolean {
  return left.projectId === right.projectId &&
    left.revisionId === right.revisionId &&
    left.ownerId === right.ownerId &&
    left.tenantId === right.tenantId;
}

function validateScope(scope: BillingScope): BillingResult<BillingScope> {
  for (const [value, path] of [
    [scope.projectId, "scope.projectId"],
    [scope.revisionId, "scope.revisionId"],
    [scope.ownerId, "scope.ownerId"],
    [scope.tenantId, "scope.tenantId"],
  ] as const) {
    if (!validId(value)) {
      return failure(
        "INVALID_IDENTITY",
        "Project・Revision・Owner・Tenant must be stable opaque identifiers.",
        path,
      );
    }
  }
  return success(scope);
}

export function isExternalBuildTarget(value: string): value is ExternalBuildTarget {
  return [
    "ANDROID_APK",
    "ANDROID_AAB",
    "IOS_IPA",
    "DESKTOP_PACKAGE",
    "WEB_PACKAGE",
  ].includes(value as ExternalBuildTarget);
}

export function billingExternalBuildResourceId(
  scope: BillingScope,
  target: ExternalBuildTarget,
): string {
  return [
    "igame-build",
    scope.tenantId,
    scope.ownerId,
    scope.projectId,
    scope.revisionId,
    target,
  ].map((value) => encodeURIComponent(value)).join(":");
}

export function createExternalBuildBillingSnapshot(
  scope: BillingScope,
  source: BillingStateSnapshot["source"] = "LOCAL_SAFE_DEFAULT",
): BillingResult<BillingStateSnapshot> {
  const valid = validateScope(scope);
  if (!valid.ok) return valid;
  return success({
    schemaVersion: BILLING_FRAMEWORK_SCHEMA_VERSION,
    productId: "game.external-build",
    capability: BILLING_EXTERNAL_BUILD_CAPABILITY,
    scope,
    status: "NOT_PURCHASED",
    checkoutId: null,
    entitlementId: null,
    grantId: null,
    expiresAt: null,
    lastSequence: 0,
    appliedEventIds: [],
    source,
  });
}

interface BillingEventBase {
  readonly eventId: string;
  readonly sequence: number;
  readonly scope: BillingScope;
}

export type BillingEvent =
  | (BillingEventBase & {
    readonly kind: "CHECKOUT_STARTED";
    readonly checkoutId: string;
  })
  | (BillingEventBase & {
    readonly kind: "CHECKOUT_FAILED";
  })
  | (BillingEventBase & {
    readonly kind: "PAYMENT_CONFIRMED";
    readonly entitlementId: string;
    readonly grantId: string;
    readonly expiresAt: string;
  })
  | (BillingEventBase & {
    readonly kind: "ENTITLEMENT_EXPIRED";
  })
  | (BillingEventBase & {
    readonly kind: "ENTITLEMENT_REVOKED";
  });

function validateEvent(event: BillingEvent): BillingResult<true> {
  if (!validId(event.eventId) || !Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    return failure("INVALID_EVENT", "Billing event identity and sequence are invalid.", "event");
  }
  const validScope = validateScope(event.scope);
  if (!validScope.ok) return failure("INVALID_EVENT", "Billing event scope is invalid.", "event.scope");
  if (event.kind === "CHECKOUT_STARTED" && !validId(event.checkoutId)) {
    return failure("INVALID_EVENT", "Checkout ID is invalid.", "event.checkoutId");
  }
  if (event.kind === "PAYMENT_CONFIRMED") {
    if (!validId(event.entitlementId) || !validId(event.grantId)) {
      return failure("INVALID_EVENT", "Entitlement and grant IDs are invalid.", "event");
    }
    if (!validIsoDate(event.expiresAt)) {
      return failure("INVALID_EVENT", "Entitlement expiry must be an ISO date.", "event.expiresAt");
    }
  }
  return success(true);
}

/** Apply only ordered, scope-bound, idempotent server lifecycle events. */
export function transitionBillingSnapshot(
  snapshot: BillingStateSnapshot,
  event: BillingEvent,
): BillingResult<BillingStateSnapshot> {
  const eventValid = validateEvent(event);
  if (!eventValid.ok) return eventValid;
  if (snapshot.appliedEventIds.includes(event.eventId)) {
    return failure("DUPLICATE_EVENT", "The billing event has already been applied.", "event.eventId");
  }
  if (!equalScope(snapshot.scope, event.scope)) {
    return failure("SCOPE_MISMATCH", "Billing event is bound to another Project・Revision・Owner・Tenant.", "event.scope");
  }
  if (event.sequence !== snapshot.lastSequence + 1) {
    return failure("EVENT_OUT_OF_ORDER", "Billing events must be applied exactly once and in order.", "event.sequence");
  }
  let next: BillingStateSnapshot = snapshot;
  switch (event.kind) {
    case "CHECKOUT_STARTED":
      if (!["NOT_PURCHASED", "EXPIRED", "REVOKED"].includes(snapshot.status)) {
        return failure("INVALID_TRANSITION", "A duplicate or concurrent Checkout is not allowed.", "status");
      }
      next = {
        ...snapshot,
        status: "CHECKOUT_PENDING",
        checkoutId: event.checkoutId,
        entitlementId: null,
        grantId: null,
        expiresAt: null,
      };
      break;
    case "CHECKOUT_FAILED":
      if (snapshot.status !== "CHECKOUT_PENDING") {
        return failure("INVALID_TRANSITION", "Only a pending Checkout can fail.", "status");
      }
      next = {
        ...snapshot,
        status: "NOT_PURCHASED",
        checkoutId: null,
      };
      break;
    case "PAYMENT_CONFIRMED":
      if (snapshot.status !== "CHECKOUT_PENDING") {
        return failure("INVALID_TRANSITION", "Payment confirmation requires a pending Checkout.", "status");
      }
      next = {
        ...snapshot,
        status: "ENTITLED",
        entitlementId: event.entitlementId,
        grantId: event.grantId,
        expiresAt: event.expiresAt,
        source: "SERVER",
      };
      break;
    case "ENTITLEMENT_EXPIRED":
      if (snapshot.status !== "ENTITLED") {
        return failure("INVALID_TRANSITION", "Only an active entitlement can expire.", "status");
      }
      next = { ...snapshot, status: "EXPIRED" };
      break;
    case "ENTITLEMENT_REVOKED":
      if (!["ENTITLED", "CHECKOUT_PENDING"].includes(snapshot.status)) {
        return failure("INVALID_TRANSITION", "This entitlement state cannot be revoked again.", "status");
      }
      next = { ...snapshot, status: "REVOKED" };
      break;
  }
  const appliedEventIds = [
    ...snapshot.appliedEventIds,
    event.eventId,
  ].slice(-MAX_EVENT_IDS);
  return success({
    ...next,
    lastSequence: event.sequence,
    appliedEventIds,
  });
}

export type BillingAccessDecisionCode =
  | "ALLOWED"
  | "PROVIDER_NOT_CONNECTED"
  | "TARGET_UNSUPPORTED"
  | "SERVER_ENTITLEMENT_REQUIRED"
  | "SCOPE_MISMATCH"
  | "ENTITLEMENT_EXPIRED"
  | "GRANT_MISMATCH"
  | "AUTHORIZATION_INVALID";

export interface ExternalBuildAccessInput {
  readonly snapshot: BillingStateSnapshot;
  readonly scope: BillingScope;
  readonly target: ExternalBuildTarget;
  readonly proof: AuthorizationProofV1 | null;
  readonly provider: BillingProviderState;
  readonly now?: string;
}

export interface ExternalBuildAccessDecision {
  readonly allowed: boolean;
  readonly code: BillingAccessDecisionCode;
  readonly message: string;
  readonly grantId: string | null;
}

function denied(
  code: Exclude<BillingAccessDecisionCode, "ALLOWED">,
  message: string,
): ExternalBuildAccessDecision {
  return { allowed: false, code, message, grantId: null };
}

/**
 * Final client-side admission check. The server Build worker must repeat the
 * same check; this function does not create an artifact or a payment record.
 */
export function evaluateExternalBuildAccess(
  input: ExternalBuildAccessInput,
): ExternalBuildAccessDecision {
  if (input.provider !== "CONNECTED") {
    return denied("PROVIDER_NOT_CONNECTED", "決済プロバイダが未接続のため、外部Buildを停止しました。");
  }
  if (!isExternalBuildTarget(input.target)) {
    return denied("TARGET_UNSUPPORTED", "この外部Build対象には対応していません。");
  }
  if (!equalScope(input.snapshot.scope, input.scope)) {
    return denied("SCOPE_MISMATCH", "外部Buildの対象Identityが課金権限の対象と一致しません。");
  }
  if (input.snapshot.status !== "ENTITLED" || input.snapshot.source !== "SERVER") {
    return denied("SERVER_ENTITLEMENT_REQUIRED", "課金済みのサーバーEntitlementが必要です。");
  }
  const expiresAt = input.snapshot.expiresAt;
  const now = input.now === undefined ? Date.now() : Date.parse(input.now);
  if (expiresAt === null || !validIsoDate(expiresAt) || !Number.isFinite(now)) {
    return denied("AUTHORIZATION_INVALID", "Entitlementの期限情報が不正です。");
  }
  if (Date.parse(expiresAt) <= now) {
    return denied("ENTITLEMENT_EXPIRED", "外部Build権限の期限が切れています。");
  }
  const resourceId = billingExternalBuildResourceId(input.scope, input.target);
  try {
    const proof = requireAuthorizationProofV1(input.proof, {
      principalId: input.scope.ownerId,
      resourceType: BILLING_EXTERNAL_BUILD_RESOURCE_TYPE,
      resourceId,
      action: "build",
      capability: BILLING_EXTERNAL_BUILD_CAPABILITY,
      tenantId: input.scope.tenantId,
    });
    if (proof.grantId === null || proof.grantId !== input.snapshot.grantId) {
      return denied("GRANT_MISMATCH", "課金Grantが外部BuildEntitlementと一致しません。");
    }
    return {
      allowed: true,
      code: "ALLOWED",
      message: "課金済みEntitlementとサーバーProofを確認しました。Build受付を開けます。",
      grantId: proof.grantId,
    };
  } catch {
    return denied("AUTHORIZATION_INVALID", "外部BuildのAuthorizationProofが不正または期限切れです。");
  }
}

export interface BillingOverviewModel {
  readonly internalUse: "INCLUDED";
  readonly inProductPlay: "INCLUDED";
  readonly externalBuild: {
    readonly productId: "game.external-build";
    readonly status: BillingEntitlementStatus;
    readonly provider: BillingProviderState;
    readonly access: "LOCKED" | "READY";
  };
}

export function createBillingOverview(
  snapshot: BillingStateSnapshot,
  provider: BillingProviderState,
): BillingOverviewModel {
  return {
    internalUse: "INCLUDED",
    inProductPlay: "INCLUDED",
    externalBuild: {
      productId: "game.external-build",
      status: snapshot.status,
      provider,
      access: snapshot.status === "ENTITLED" && provider === "CONNECTED"
        ? "READY"
        : "LOCKED",
    },
  };
}

/** A server adapter may implement this port without exposing payment data to the editor. */
export interface BillingProviderPort {
  readonly provider: BillingProviderState;
  startCheckout(input: {
    readonly scope: BillingScope;
    readonly target: ExternalBuildTarget;
    readonly idempotencyKey: string;
  }): Promise<{ readonly checkoutId: string }>;
  resolveEntitlement(input: {
    readonly scope: BillingScope;
    readonly checkoutId: string;
  }): Promise<BillingStateSnapshot>;
}
