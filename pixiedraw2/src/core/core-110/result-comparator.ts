import type { ContentHash } from "../../wp160-contracts.ts";
import type { Core110Comparison, Core110ResultIdentity } from "./contracts.ts";

const VOLATILE_KEYS = new Set(["committedAt"]);

function canonicalize(value: unknown, path = "$"): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  }
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (VOLATILE_KEYS.has(key)) {
      output[key] = "<COMMIT_TIME>";
    } else {
      output[key] = canonicalize(record[key], `${path}.${key}`);
    }
  }
  return output;
}

export function canonicalResultMaterial(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function sha256(value: string): Promise<ContentHash> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("") as ContentHash;
}

function resultKind(value: unknown): string {
  if (value === null || typeof value !== "object") return "SCALAR";
  if (Array.isArray(value)) return "ARRAY";
  const record = value as Record<string, unknown>;
  if (record.ok === true || record.ok === false) {
    if (record.ok === false) return "ERROR";
    const result = record.value;
    if (result !== null && typeof result === "object") {
      if ("event" in (result as Record<string, unknown>)) return "COMMIT";
      if ("inbox" in (result as Record<string, unknown>)) return "INBOX";
      if ("projectionRevision" in (result as Record<string, unknown>)) {
        return "CONSUMER";
      }
      if ("outcome" in (result as Record<string, unknown>)) return "OUTBOX";
    }
    return "SUCCESS";
  }
  return "OBJECT";
}

export async function canonicalResultIdentity(
  value: unknown,
): Promise<Core110ResultIdentity> {
  let material: string;
  try {
    material = canonicalResultMaterial(value);
  } catch {
    material = JSON.stringify({ ok: false, resultKind: "UNSERIALIZABLE" });
  }
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  const diagnostics = record?.diagnostics;
  const diagnosticCodes = Array.isArray(diagnostics)
    ? diagnostics.map((item) =>
      item !== null && typeof item === "object" &&
        typeof (item as Record<string, unknown>).code === "string"
        ? (item as Record<string, unknown>).code as string
        : "MALFORMED_DIAGNOSTIC"
    )
    : [];
  return {
    ok: record?.ok === true,
    resultKind: resultKind(value),
    resultHash: await sha256(material),
    identityMaterial: material,
    diagnosticCodes,
  };
}

export async function compareCanonicalResults(
  left: unknown,
  right: unknown,
): Promise<Core110Comparison> {
  const [leftIdentity, rightIdentity] = await Promise.all([
    canonicalResultIdentity(left),
    canonicalResultIdentity(right),
  ]);
  return {
    equal: leftIdentity.resultHash === rightIdentity.resultHash,
    left: leftIdentity,
    right: rightIdentity,
    differingPaths: leftIdentity.resultHash === rightIdentity.resultHash
      ? []
      : ["$"],
  };
}

export async function resultHash(value: unknown): Promise<ContentHash> {
  return (await canonicalResultIdentity(value)).resultHash as ContentHash;
}
