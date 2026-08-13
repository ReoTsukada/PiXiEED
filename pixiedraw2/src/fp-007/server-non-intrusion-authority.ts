/**
 * FP-007 client/reference-side non-intrusion verification boundary.
 *
 * A public receipt digest is diagnostic data only. This distributed module has
 * no proof creation path. A future server adapter must live in a separate,
 * non-distributed Server Composition Root and provide an opaque proof here.
 */

import { canonicalJson, sha256Hex } from "../wp160-contracts.ts";

export const FP007_SERVER_NON_INTRUSION_COMMAND =
  "fp007-current-system-impact-verifier-v1" as const;

export const FP007_SERVER_NON_INTRUSION_SCOPE = [
  "CURRENT_ROUTES",
  "CURRENT_PIXIEEDRAW",
  "PXD",
  "PIXISYNC",
  "MARKET",
] as const;

const FP007_SERVER_NON_INTRUSION_PATHS = [
  "current-routes",
  "pixiedraw",
  "pxd",
  "pixisync",
  "market",
] as const;

export type ServerNonIntrusionReceipt = {
  readonly scope: readonly string[];
  readonly commandIdentity: string;
  readonly qualification: "EXECUTED" | "NOT_EXECUTED";
  readonly exitCode: number | null;
  readonly resultDigest: string | null;
  readonly inspectedPaths: readonly string[];
  readonly workspaceState: "clean" | "dirty" | "unknown";
  readonly unresolvedDiffs: boolean;
};

/** Structural type only. Runtime eligibility is controlled by the private brand. */
export interface Fp007ServerNonIntrusionProof {
  readonly __fp007ServerNonIntrusionProof: never;
}

const proofBrand = new WeakSet<object>();
const proofBinding = new WeakMap<object, string>();

function compareCodePoints(left: string, right: string): number {
  if (left === right) return 0;
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0)!,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index];
    const rightPoint = rightPoints[index];
    if (leftPoint === undefined || rightPoint === undefined) continue;
    if (leftPoint !== rightPoint) {
      return leftPoint < rightPoint ? -1 : 1;
    }
  }
  return leftPoints.length < rightPoints.length ? -1 : 1;
}

function sortedValues(values: readonly string[]): string[] {
  return [...values].sort(compareCodePoints);
}

function sameSet(
  value: readonly string[],
  expected: readonly string[],
): boolean {
  const actual = sortedValues(value);
  const target = sortedValues(expected);
  return actual.length === target.length &&
    actual.every((item, index) => item === target[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function receiptPayload(
  receipt: ServerNonIntrusionReceipt,
): Record<string, unknown> {
  return {
    documentId: "PIXIEED-FP007-CURRENT-SYSTEM-IMPACT-RECEIPT-001",
    scope: sortedValues(receipt.scope),
    commandIdentity: receipt.commandIdentity,
    qualification: receipt.qualification,
    exitCode: receipt.exitCode,
    inspectedPaths: sortedValues(receipt.inspectedPaths),
    workspaceState: receipt.workspaceState,
    unresolvedDiffs: receipt.unresolvedDiffs,
  };
}

export async function computeServerNonIntrusionReceiptDigest(
  receipt: ServerNonIntrusionReceipt,
): Promise<string> {
  return sha256Hex(canonicalJson(receiptPayload(receipt)));
}

function isStructurallyValidServerReceipt(
  value: unknown,
): value is ServerNonIntrusionReceipt {
  if (!isRecord(value)) return false;
  const receipt = value as Partial<ServerNonIntrusionReceipt>;
  return (
    Array.isArray(receipt.scope) &&
    receipt.scope.every((item) => typeof item === "string") &&
    Array.isArray(receipt.inspectedPaths) &&
    receipt.inspectedPaths.every((item) => typeof item === "string") &&
    receipt.commandIdentity === FP007_SERVER_NON_INTRUSION_COMMAND &&
    receipt.qualification === "EXECUTED" &&
    receipt.exitCode === 0 &&
    typeof receipt.resultDigest === "string" &&
    receipt.workspaceState === "clean" &&
    receipt.unresolvedDiffs === false &&
    sameSet(receipt.scope, FP007_SERVER_NON_INTRUSION_SCOPE) &&
    sameSet(receipt.inspectedPaths, FP007_SERVER_NON_INTRUSION_PATHS)
  );
}

export function isServerNonIntrusionReceipt(
  value: unknown,
): value is ServerNonIntrusionReceipt {
  return isStructurallyValidServerReceipt(value);
}

async function isEligibleServerReceipt(value: unknown): Promise<boolean> {
  try {
    if (!isStructurallyValidServerReceipt(value)) return false;
    const expectedDigest = await computeServerNonIntrusionReceiptDigest(value);
    return value.resultDigest === expectedDigest;
  } catch {
    return false;
  }
}

export function isServerNonIntrusionProof(
  value: unknown,
): value is Fp007ServerNonIntrusionProof {
  return isRecord(value) && proofBrand.has(value);
}

export async function verifyServerNonIntrusionProof(
  proof: unknown,
  receipt: unknown,
): Promise<boolean> {
  try {
    if (!isServerNonIntrusionProof(proof)) return false;
    if (
      !isStructurallyValidServerReceipt(receipt) ||
      !(await isEligibleServerReceipt(receipt))
    ) return false;
    const boundDigest = proofBinding.get(proof);
    if (boundDigest === undefined) return false;
    return boundDigest === await computeServerNonIntrusionReceiptDigest(
      receipt,
    );
  } catch {
    return false;
  }
}
