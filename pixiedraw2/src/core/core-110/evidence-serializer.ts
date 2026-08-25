import type {
  Core110EvidenceDocument,
  Core110EvidenceRow,
} from "./contracts.ts";
import { canonicalResultMaterial, resultHash } from "./result-comparator.ts";

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortRows(rows: readonly Core110EvidenceRow[]): Core110EvidenceRow[] {
  return [...rows].sort((left, right) =>
    compareCanonicalStrings(
      `${left.adapterClass}:${left.failureId}:${left.fixtureId}`,
      `${right.adapterClass}:${right.failureId}:${right.fixtureId}`,
    )
  );
}

/** Stable document material with the display-only generation time removed. */
export function canonicalEvidenceIdentityMaterial(
  document: Core110EvidenceDocument,
): string {
  const { generatedAt: _generatedAt, ...stableDocument } = document;
  return canonicalResultMaterial(stableDocument);
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function serializeCore110Evidence(input: {
  readonly rows: readonly Core110EvidenceRow[];
  readonly commands: readonly string[];
  readonly untested?: readonly string[];
  readonly generatedAt?: string;
}): Promise<{
  readonly document: Core110EvidenceDocument;
  readonly json: string;
}> {
  const rows = sortRows(input.rows);
  const commands = [...input.commands].sort(compareCanonicalStrings);
  const untested = [...(input.untested ?? [])].sort(compareCanonicalStrings);
  const sideEffectCounts = rows.reduce(
    (total, row) => ({
      provider: total.provider + row.sideEffectCounts.provider,
      finance: total.finance + row.sideEffectCounts.finance,
      notification: total.notification + row.sideEffectCounts.notification,
      search: total.search + row.sideEffectCounts.search,
      externalTotal: total.externalTotal + row.sideEffectCounts.externalTotal,
    }),
    { provider: 0, finance: 0, notification: 0, search: 0, externalTotal: 0 },
  );
  const restartTranscript = rows.flatMap((row) => row.restartTranscript);
  const baselineMaterial = canonicalResultMaterial({
    evidenceVersion: "CORE-110_V1",
    commands,
    adapters: rows.map((row) => ({
      adapterClass: row.adapterClass,
      adapterId: row.adapterId,
    })),
  });
  const baselineIdentity = await digest(baselineMaterial);
  const resultMaterial = canonicalResultMaterial({
    commands,
    rows,
    sideEffectCounts,
  });
  const aggregateResultHash = await digest(resultMaterial);
  const document: Core110EvidenceDocument = {
    evidenceVersion: "CORE-110_V1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    commands,
    rows,
    baselineIdentity,
    resultHash: aggregateResultHash,
    sideEffectCounts,
    restartTranscript,
    independentReview: "PENDING",
    untested,
  };
  return { document, json: JSON.stringify(document, null, 2) + "\n" };
}

export { resultHash };
