import {
  classifyGameMarketAccess,
  normalizeGameMarketCatalogRecord,
  resolveGameMarketAction,
} from "../src/game/game-350/game-market-catalog.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const paidRecord = {
  id: "market:hero",
  title: "Hero",
  kind: "SPRITE",
  formats: ["png", "pxd"],
  price: { amountMinor: 300, currency: "JPY" },
  creator: { id: "creator:1", name: "Creator" },
  rights: ["PERSONAL_USE"],
  previewUrl: "https://cdn.example.test/hero.png",
};

function access(overrides: Record<string, unknown> = {}) {
  const catalog = normalizeGameMarketCatalogRecord({ ...paidRecord, ...overrides });
  assert(catalog !== null, "test catalog must normalize");
  return catalog;
}

Deno.test("GAME350-MARKET-CATALOG-001 normalizes the minimum public record", () => {
  const catalog = normalizeGameMarketCatalogRecord(paidRecord);
  assert(catalog !== null, "valid record must normalize");
  assert(catalog.id === "market:hero" && catalog.formats.length === 2, "minimum fields must survive");
  assert(catalog.previewUrl === paidRecord.previewUrl, "https preview must survive");
});

Deno.test("GAME350-MARKET-CATALOG-002 rejects malformed records and drops non-https previews", () => {
  assert(normalizeGameMarketCatalogRecord({ ...paidRecord, title: "" }) === null, "missing title must fail closed");
  assert(normalizeGameMarketCatalogRecord({ ...paidRecord, formats: ["png", 4] }) === null, "malformed formats must fail closed");
  const catalog = normalizeGameMarketCatalogRecord({ ...paidRecord, previewUrl: "http://example.test/hero.png" });
  assert(catalog !== null && catalog.previewUrl === undefined, "non-https preview must be discarded");
});

Deno.test("GAME350-MARKET-CATALOG-003 distinguishes free, purchased and pending purchase", () => {
  const free = classifyGameMarketAccess({ catalog: access({ price: { amountMinor: 0, currency: "JPY" } }), isAuthenticated: false });
  assert(free.access === "FREE" && free.action === "ACQUIRE_FREE", "free catalog must acquire a server entitlement before use");
  const purchased = classifyGameMarketAccess({ catalog: access(), isAuthenticated: true, entitlementStatus: "PAID" });
  assert(purchased.access === "PURCHASED" && purchased.action === "OPEN_MARKET", "paid entitlement must not claim immediate use");
  const granted = classifyGameMarketAccess({ catalog: access(), isAuthenticated: true, entitlementStatus: "GRANTED" });
  assert(granted.access === "PURCHASED", "granted entitlement must count as purchased");
  const pending = classifyGameMarketAccess({ catalog: access(), isAuthenticated: true, entitlementStatus: "PENDING" });
  assert(pending.access === "AVAILABLE", "pending entitlement must not count as purchased");
});

Deno.test("GAME350-MARKET-CATALOG-004 distinguishes auth and supported-format boundaries", () => {
  const auth = classifyGameMarketAccess({ catalog: access(), isAuthenticated: false });
  assert(auth.access === "AUTH_REQUIRED" && auth.action === "SIGN_IN", "anonymous paid access must request sign-in");
  const available = classifyGameMarketAccess({ catalog: access(), isAuthenticated: true });
  assert(available.access === "AVAILABLE" && available.action === "OPEN_MARKET", "authenticated unpaid access must open Market");
  const unavailable = classifyGameMarketAccess({ catalog: access(), isAuthenticated: true, supportedFormats: ["wav"] });
  assert(unavailable.access === "UNAVAILABLE" && unavailable.action === "UNAVAILABLE", "unsupported formats must be unavailable");
  assert(resolveGameMarketAction({ catalog: access(), isAuthenticated: false }) === "SIGN_IN", "action resolver must preserve the contract");
});
