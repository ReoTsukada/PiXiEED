import { asPackageId, asSha256 } from "../src/wp160-contracts.ts";
import {
  asEntitlementId,
  asLicenseSnapshotId,
  asMarketOrderId,
  asMarketProductId,
  asMarketPurchaseId,
  asPaymentEventId,
  asRoyaltyLedgerEntryId,
  createProductProjection,
  createPurchaseRecord,
  reconcileCommerce,
  type LockedPackageReference,
  type PurchaseEvent,
} from "../src/wp210-market-rights-core.ts";

const HASH_A = asSha256("a".repeat(64));
const HASH_B = asSha256("b".repeat(64));
const HASH_C = asSha256("c".repeat(64));
const HASH_D = asSha256("d".repeat(64));
const packageReference: LockedPackageReference = { packageId: asPackageId("benchmark-package"), packageVersion: "1.0.0", manifestHash: HASH_A, dependencySnapshotHash: HASH_B, contentHash: HASH_C, licenseSnapshotId: asLicenseSnapshotId("benchmark-license"), licenseSnapshotHash: HASH_D, mode: "PINNED" };
const productResult = createProductProjection({ productId: asMarketProductId("benchmark-product"), package: packageReference, classification: "COMPLETED_WORK", publication: "PAID", status: "PUBLISHED", ownerAccountId: "creator-benchmark", price: { amountMinor: 100, currency: "JPY" }, rights: ["PERSONAL_USE", "COMMERCIAL_USE"] });
if (!productResult.ok) throw new Error("Benchmark Product fixture is invalid.");

const iterations = 10000;
const started = performance.now();
let successful = 0;
for (let index = 0; index < iterations; index += 1) {
  const purchase = createPurchaseRecord({ purchaseId: asMarketPurchaseId(`benchmark-purchase-${index}`), productId: productResult.value.productId, orderId: asMarketOrderId(`benchmark-order-${index}`), buyerAccountId: "buyer-benchmark", package: packageReference, amount: { amountMinor: 100, currency: "JPY" }, provider: "SYNTHETIC" });
  if (!purchase.ok) throw new Error("Benchmark Purchase fixture is invalid.");
  const eventBase: Omit<PurchaseEvent, "eventId" | "type" | "sequence"> = { purchaseId: purchase.value.purchaseId, payloadFingerprint: HASH_A, source: "CURRENT_WEBHOOK_FIXTURE" };
  const events: readonly PurchaseEvent[] = [
    { ...eventBase, eventId: asPaymentEventId(`benchmark-bound-${index}`), sequence: 1, type: "CHECKOUT_BOUND" },
    { ...eventBase, eventId: asPaymentEventId(`benchmark-paid-${index}`), sequence: 2, type: "PAID" },
  ];
  const royalty = { ledgerEntryId: asRoyaltyLedgerEntryId(`benchmark-royalty-${index}`), purchaseId: purchase.value.purchaseId, productId: productResult.value.productId, creatorAccountId: "creator-benchmark", amountMinor: 80, currency: "JPY", status: "POSTED" as const, sourceEventId: events[1]!.eventId };
  const reconciled = reconcileCommerce({ product: productResult.value, purchase: purchase.value, paymentEvents: events, entitlementId: asEntitlementId(`benchmark-entitlement-${index}`), royalty });
  if (!reconciled.ok) throw new Error("Benchmark reconciliation failed.");
  successful += 1;
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP210_MARKET_RIGHTS_SYNTHETIC",
  status: "MEASURED_LOCAL_SYNTHETIC",
  iterations,
  successful,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  operationsPerSecond: Number((iterations / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)),
  notes: ["Pure projection/reconciliation only; no provider, database, Storage, route, or production data was accessed.", "This is not a checkout, browser compositor, device, memory, or production performance PASS."],
}, null, 2));
