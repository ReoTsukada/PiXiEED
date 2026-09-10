/** Pure iGAME projection for one public Market catalog record. */

export type GameMarketAccess =
  | "FREE"
  | "PURCHASED"
  | "AVAILABLE"
  | "AUTH_REQUIRED"
  | "UNAVAILABLE";

export type GameMarketAction =
  | "USE_IN_GAME"
  | "ACQUIRE_FREE"
  | "OPEN_MARKET"
  | "SIGN_IN"
  | "UNAVAILABLE";

export interface GameMarketPrice {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface GameMarketCreator {
  readonly id: string;
  readonly name: string;
}

export interface GameMarketCatalogRecord {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly formats: readonly string[];
  readonly price: GameMarketPrice;
  readonly creator: GameMarketCreator;
  readonly rights: readonly string[];
  readonly previewUrl?: string;
}

export type GameMarketEntitlementStatus =
  | "ACTIVE"
  | "PAID"
  | "GRANTED"
  | "FAILED"
  | "PENDING"
  | "CANCELED"
  | "REVOKED"
  | "EXPIRED"
  | "UNKNOWN";

export interface GameMarketAccessInput {
  readonly catalog: GameMarketCatalogRecord;
  readonly isAuthenticated: boolean;
  readonly entitlementStatus?: string;
  /** Formats that the current iGAME surface can consume. */
  readonly supportedFormats?: readonly string[];
}

export interface GameMarketAccessResult {
  readonly access: GameMarketAccess;
  readonly action: GameMarketAction;
}

const NON_EMPTY = /\S/;
const CURRENCY = /^[A-Z]{3}$/;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && NON_EMPTY.test(value.trim());
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const result = value.map((item) => typeof item === "string" ? item.trim() : "")
    .filter((item) => item.length > 0);
  return result.length === value.length && new Set(result).size === result.length
    ? result
    : null;
}

function price(value: unknown): GameMarketPrice | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as { amountMinor?: unknown; currency?: unknown };
  return typeof candidate.amountMinor === "number" &&
      Number.isSafeInteger(candidate.amountMinor) && candidate.amountMinor >= 0 &&
      typeof candidate.currency === "string" && CURRENCY.test(candidate.currency)
    ? { amountMinor: candidate.amountMinor, currency: candidate.currency }
    : null;
}

function creator(value: unknown): GameMarketCreator | null {
  if (typeof value === "string" && nonEmptyString(value)) {
    return { id: value.trim(), name: value.trim() };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as { id?: unknown; name?: unknown; displayName?: unknown };
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const nameValue = candidate.name ?? candidate.displayName;
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  return id && name ? { id, name } : null;
}

/** Normalize a public record; malformed records are rejected without throwing. */
export function normalizeGameMarketCatalogRecord(
  input: unknown,
): GameMarketCatalogRecord | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const kind = typeof candidate.kind === "string" ? candidate.kind.trim() : "";
  const formats = stringList(candidate.formats);
  const rights = stringList(candidate.rights);
  const normalizedPrice = price(candidate.price);
  const normalizedCreator = creator(candidate.creator);
  if (!id || !title || !kind || !formats || formats.length === 0 || !rights ||
    !normalizedPrice || !normalizedCreator) return null;

  const previewUrl = typeof candidate.previewUrl === "string"
    ? candidate.previewUrl.trim()
    : "";
  const normalized: GameMarketCatalogRecord = {
    id,
    title,
    kind,
    formats,
    price: normalizedPrice,
    creator: normalizedCreator,
    rights,
    ...(previewUrl.startsWith("https://") ? { previewUrl } : {}),
  };
  return normalized;
}

function hasPurchasedEntitlement(status: string | undefined): boolean {
  return status === "ACTIVE" || status === "PAID" || status === "GRANTED";
}

function supportsCatalogFormat(
  catalog: GameMarketCatalogRecord,
  supportedFormats: readonly string[] | undefined,
): boolean {
  if (supportedFormats === undefined) return true;
  const supported = new Set(supportedFormats);
  return catalog.formats.some((format) => supported.has(format));
}

/** Classify access without consulting, changing, or inferring server state. */
export function classifyGameMarketAccess(
  input: GameMarketAccessInput,
): GameMarketAccessResult {
  // A public card is not an entitlement or license snapshot. Without an
  // explicit rights list the editor cannot safely promise in-game use.
  if (input.catalog.rights.length === 0) {
    return { access: "UNAVAILABLE", action: "UNAVAILABLE" };
  }
  if (!supportsCatalogFormat(input.catalog, input.supportedFormats)) {
    return { access: "UNAVAILABLE", action: "UNAVAILABLE" };
  }
  if (input.catalog.price.amountMinor === 0) {
    // A zero price is not an entitlement. The server must record a free
    // acquisition before secure delivery can produce an iGAME binding.
    return { access: "FREE", action: "ACQUIRE_FREE" };
  }
  if (hasPurchasedEntitlement(input.entitlementStatus)) {
    // Entitlement is not a PXD merge/direct binding; keep the next step explicit.
    return { access: "PURCHASED", action: "OPEN_MARKET" };
  }
  if (!input.isAuthenticated) {
    return { access: "AUTH_REQUIRED", action: "SIGN_IN" };
  }
  return { access: "AVAILABLE", action: "OPEN_MARKET" };
}

/** Resolve only the UI action for callers that do not need the access label. */
export function resolveGameMarketAction(input: GameMarketAccessInput): GameMarketAction {
  return classifyGameMarketAccess(input).action;
}
