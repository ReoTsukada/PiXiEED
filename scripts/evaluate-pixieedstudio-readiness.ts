#!/usr/bin/env -S deno run --no-remote --allow-read

/**
 * Read-only PiXiEEDstudio release gate.
 *
 * The command accepts a verified Studio Release Candidate and a JSON array of
 * readiness evidence. It delegates the decision to the same typed gate used by
 * the application and never uploads, publishes, deploys, or changes flags.
 */

import {
  evaluateStudioReadiness,
  type StudioReadinessDecision,
  type StudioReadinessEvidence,
  type StudioReadinessTarget,
} from "../pixiedraw2/src/studio/release-readiness.ts";
import type { StudioReleaseCandidate } from
  "../pixiedraw2/src/studio/package-publish.ts";

export type StudioReadinessCliOptions = {
  readonly candidatePath: string;
  readonly evidencePath: string;
  readonly target: StudioReadinessTarget;
};

export type StudioReadinessCliParseResult =
  | { readonly kind: "help" }
  | { readonly kind: "options"; readonly value: StudioReadinessCliOptions }
  | { readonly kind: "error"; readonly message: string };

const HELP = `Usage:
  deno run --no-remote --allow-read scripts/evaluate-pixieedstudio-readiness.ts \\
    --candidate <release-candidate.json> \\
    --evidence <readiness-evidence.json> \\
    --target <STAGING|BETA|PRODUCTION>

Inputs are read-only. Evidence may be a JSON array or an object with an
"evidence" or "readinessEvidence" array; a candidate may be direct or
wrapped in "candidate".
`;

function valueFor(
  args: readonly string[],
  index: number,
  option: string,
): { readonly value?: string; readonly nextIndex: number; readonly error?: string } {
  const current = args[index]!;
  const equalsPrefix = `${option}=`;
  if (current.startsWith(equalsPrefix)) {
    const value = current.slice(equalsPrefix.length).trim();
    return value.length > 0
      ? { value, nextIndex: index }
      : { nextIndex: index, error: `${option} requires a value.` };
  }
  const next = args[index + 1]?.trim();
  return next !== undefined && next.length > 0
    ? { value: next, nextIndex: index + 1 }
    : { nextIndex: index, error: `${option} requires a value.` };
}

function isTarget(value: string): value is StudioReadinessTarget {
  return value === "STAGING" || value === "BETA" || value === "PRODUCTION";
}

export function parseStudioReadinessArgs(
  args: readonly string[],
): StudioReadinessCliParseResult {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { kind: "help" };
  }
  let candidatePath: string | undefined;
  let evidencePath: string | undefined;
  let target: StudioReadinessTarget | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--candidate" || argument.startsWith("--candidate=")) {
      const parsed = valueFor(args, index, "--candidate");
      if (parsed.error !== undefined) return { kind: "error", message: parsed.error };
      candidatePath = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === "--evidence" || argument.startsWith("--evidence=")) {
      const parsed = valueFor(args, index, "--evidence");
      if (parsed.error !== undefined) return { kind: "error", message: parsed.error };
      evidencePath = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === "--target" || argument.startsWith("--target=")) {
      const parsed = valueFor(args, index, "--target");
      if (parsed.error !== undefined) return { kind: "error", message: parsed.error };
      if (parsed.value === undefined || !isTarget(parsed.value)) {
        return {
          kind: "error",
          message: "--target must be STAGING, BETA, or PRODUCTION.",
        };
      }
      target = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    return { kind: "error", message: `Unknown option: ${argument}` };
  }
  if (candidatePath === undefined) {
    return { kind: "error", message: "--candidate is required." };
  }
  if (evidencePath === undefined) {
    return { kind: "error", message: "--evidence is required." };
  }
  if (target === undefined) {
    return { kind: "error", message: "--target is required." };
  }
  return { kind: "options", value: { candidatePath, evidencePath, target } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(path: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`${label} could not be read.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function unwrapCandidate(value: unknown): unknown {
  return isRecord(value) && "candidate" in value ? value.candidate : value;
}

function unwrapEvidence(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    if (Array.isArray(value.evidence)) return value.evidence;
    if (Array.isArray(value.readinessEvidence)) return value.readinessEvidence;
  }
  throw new Error(
    "Evidence JSON must be an array or contain an evidence/readinessEvidence array.",
  );
}

export function expectedStudioReadinessDecision(
  target: StudioReadinessTarget,
): Exclude<StudioReadinessDecision, "NOT_READY" | "BLOCKED"> {
  if (target === "STAGING") return "READY_FOR_STAGING";
  if (target === "BETA") return "READY_FOR_BETA";
  return "READY_FOR_PRODUCTION";
}

export function readinessExitCode(
  decision: StudioReadinessDecision,
): 0 | 1 {
  return decision === "READY_FOR_STAGING" || decision === "READY_FOR_BETA" ||
      decision === "READY_FOR_PRODUCTION"
    ? 0
    : 1;
}

function outputForFailure(
  target: StudioReadinessTarget,
  diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[],
) {
  return {
    reportKind: "PIXEEDSTUDIO_READINESS_CLI_RESULT_V1",
    ok: false,
    decision: "BLOCKED" as const,
    target,
    diagnostics,
  };
}

export async function evaluateStudioReadinessFiles(
  options: StudioReadinessCliOptions,
): Promise<{
  readonly ok: boolean;
  readonly output: unknown;
  readonly exitCode: 0 | 1;
}> {
  const candidate = unwrapCandidate(
    await readJson(options.candidatePath, "Release Candidate"),
  ) as StudioReleaseCandidate;
  const evidence = unwrapEvidence(
    await readJson(options.evidencePath, "Readiness evidence"),
  ) as StudioReadinessEvidence[];
  const result = await evaluateStudioReadiness({
    candidate,
    target: options.target,
    evidence,
  });
  if (!result.ok || result.value === undefined) {
    const output = outputForFailure(options.target, result.diagnostics);
    return { ok: false, output, exitCode: 1 };
  }
  const report = result.value;
  const output = {
    reportKind: "PIXEEDSTUDIO_READINESS_CLI_RESULT_V1",
    ok: true,
    decision: report.decision,
    target: report.target,
    packageId: report.packageId,
    packageVersion: report.packageVersion,
    projectRevisionId: report.projectRevisionId,
    packageHash: report.packageHash,
    checks: report.checks,
    untested: report.untested,
    evidenceHash: report.evidenceHash,
  };
  return {
    ok: report.decision === expectedStudioReadinessDecision(options.target),
    output,
    exitCode: readinessExitCode(report.decision),
  };
}

export async function main(args: readonly string[] = Deno.args): Promise<number> {
  const parsed = parseStudioReadinessArgs(args);
  if (parsed.kind === "help") {
    console.log(HELP);
    return 0;
  }
  if (parsed.kind === "error") {
    console.log(JSON.stringify({
      reportKind: "PIXEEDSTUDIO_READINESS_CLI_RESULT_V1",
      ok: false,
      decision: "BLOCKED",
      diagnostics: [{ code: "INVALID_ARGUMENT", path: "args", message: parsed.message }],
    }, null, 2));
    return 1;
  }
  try {
    const result = await evaluateStudioReadinessFiles(parsed.value);
    console.log(JSON.stringify(result.output, null, 2));
    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Readiness evaluation failed.";
    console.log(JSON.stringify({
      reportKind: "PIXEEDSTUDIO_READINESS_CLI_RESULT_V1",
      ok: false,
      decision: "BLOCKED",
      target: parsed.value.target,
      diagnostics: [{ code: "INPUT_ERROR", path: "input", message }],
    }, null, 2));
    return 1;
  }
}

if (import.meta.main) {
  Deno.exit(await main());
}

