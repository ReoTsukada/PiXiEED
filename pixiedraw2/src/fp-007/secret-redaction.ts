/** FP-007 privacy-safe audit redaction. Raw values never cross this boundary. */

import { compareCodePointStrings } from "./stable-order.ts";

export const REDACTED = "[REDACTED]" as const;

export interface EnvironmentSnapshot {
  readonly names: readonly string[];
  readonly present: readonly string[];
  readonly fingerprints: Readonly<Record<string, string>>;
}

const SENSITIVE_KEY =
  /(?:^|[_-])(authorization|auth|bearer|cookie|set-cookie|csrf|jwt|token|secret|password|private.?key|api.?key|email|phone|address|project.?content|private.?content|commission|payment|purchase|entitlement|royalty|payout|raw|blob|pixel|audio|pxd|package.?body|base64|data.?url)(?:$|[_-])/iu;
const SENSITIVE_QUERY =
  /^(?:authorization|auth|bearer|cookie|csrf|jwt|token|secret|password|key|signature|sig|email|project|content)$/iu;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\b/u;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const PEM = /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/u;
const AUTH_HEADER =
  /((?:authorization|x-api-key|cookie|set-cookie)\s*:\s*)([^\s,;]+)/iu;
const BASE64 = /^[A-Za-z0-9+/]{24,}={0,2}$/u;

function marker(category: string): string {
  return `[REDACTED:${category}]`;
}

function containsKnownSecret(
  value: string,
  knownSecrets: readonly string[],
): string | undefined {
  for (const secret of knownSecrets) {
    if (secret.length > 0 && value.includes(secret)) return secret;
  }
  return undefined;
}

function decodedBase64(value: string): string | undefined {
  if (!BASE64.test(value)) return undefined;
  try {
    const decoded = atob(value);
    return /^[\x09\x0A\x0D\x20-\x7E]*$/u.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function redactedUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    let changed = false;
    for (const [key] of url.searchParams) {
      if (SENSITIVE_QUERY.test(key)) {
        url.searchParams.set(key, marker("QUERY"));
        changed = true;
      }
    }
    return changed ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function redactString(value: string, knownSecrets: readonly string[]): string {
  if (containsKnownSecret(value, knownSecrets) !== undefined) {
    return marker("SECRET");
  }
  if (PEM.test(value)) return marker("PRIVATE_KEY");
  if (JWT.test(value)) return value.replace(JWT, marker("JWT"));
  const url = redactedUrl(value);
  if (url !== undefined) return url;
  const header = value.replace(AUTH_HEADER, `$1${marker("HEADER")}`);
  if (header !== value) return header;
  const decodedUrl = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();
  if (
    decodedUrl !== value &&
    (JWT.test(decodedUrl) || EMAIL.test(decodedUrl) ||
      containsKnownSecret(decodedUrl, knownSecrets) !== undefined)
  ) return marker("ENCODED_SECRET");
  const decoded = decodedBase64(value);
  if (
    decoded !== undefined &&
    (JWT.test(decoded) || EMAIL.test(decoded) ||
      containsKnownSecret(decoded, knownSecrets) !== undefined ||
      /(?:secret|token|password)=/iu.test(decoded))
  ) return marker("ENCODED_SECRET");
  if (EMAIL.test(value)) return value.replace(EMAIL, marker("EMAIL"));
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function redactAuditValue(
  value: unknown,
  knownSecrets: readonly string[] = [],
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactString(value, knownSecrets);
  if (
    value === null || typeof value === "number" || typeof value === "boolean"
  ) return value;
  if (
    typeof value === "bigint" || typeof value === "function" ||
    typeof value === "symbol"
  ) return marker("UNSUPPORTED");
  const objectValue = value as object;
  if (seen.has(objectValue)) return marker("CIRCULAR");
  seen.add(objectValue);
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, knownSecrets, seen));
  }
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort(compareCodePointStrings)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? marker("FIELD")
      : redactAuditValue(record[key], knownSecrets, seen);
  }
  return output;
}

export function redactEnvironmentNames(
  values: Readonly<Record<string, string | undefined>>,
): EnvironmentSnapshot {
  const names = Object.keys(values).sort(compareCodePointStrings);
  return {
    names,
    present: names.filter((name) => values[name] !== undefined),
    fingerprints: {},
  };
}

export async function redactEnvironmentWithFingerprints(
  values: Readonly<Record<string, string | undefined>>,
  salt: string,
): Promise<EnvironmentSnapshot> {
  const snapshot = redactEnvironmentNames(values);
  const fingerprints: Record<string, string> = {};
  for (const name of snapshot.present) {
    const value = values[name];
    if (value === undefined) continue;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${salt}:${value}`),
    );
    fingerprints[name] = `sha256:${
      [...new Uint8Array(digest)].map((byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")
    }`;
  }
  return { ...snapshot, fingerprints };
}
