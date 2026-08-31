/** AUDIO-240 host-neutral completion-gate contracts. */

import type { AudioContentHash, AudioProject } from "../audio-200/contracts.ts";
import type { AudioEventGraph } from "../audio-210/contracts.ts";
import type { Audio220PackageEnvelope } from "../audio-220/contracts.ts";
import type { Audio230WorkspaceProjection } from "../audio-230/contracts.ts";

export const AUDIO240_SCHEMA_VERSION = "AUDIO-240_V1" as const;
export type Audio240Decision = "PASS" | "PARTIAL" | "UNTESTED" | "BLOCKED";
export type Audio240EvidenceStatus =
  | "PASS"
  | "UNTESTED"
  | "UNKNOWN"
  | "BLOCKED";

export interface Audio240EvidenceStamp {
  readonly capturedAt: string;
  readonly validUntil: string;
  readonly sourceId: string;
  readonly sourceHash: AudioContentHash;
}

export interface Audio240EnvironmentEvidence {
  readonly browser: Audio240EvidenceStatus;
  readonly device: Audio240EvidenceStatus;
  readonly production: Audio240EvidenceStatus;
}

export interface Audio240EvidenceInput {
  readonly schemaVersion: typeof AUDIO240_SCHEMA_VERSION;
  readonly stamp: Audio240EvidenceStamp;
  readonly project: AudioProject;
  readonly graph: AudioEventGraph;
  readonly package: Audio220PackageEnvelope | null;
  readonly workspace: Audio230WorkspaceProjection;
  readonly crossTool: {
    readonly drawLiveAccepted: boolean;
    readonly drawPinnedAccepted: boolean;
    readonly gameLiveAccepted: boolean;
    readonly gamePinnedAccepted: boolean;
    readonly safeRollbackVerified: boolean;
  };
  readonly environment: Audio240EnvironmentEvidence;
}

export interface Audio240GateOptions {
  readonly nowMs: number;
  readonly maxAgeMs: number;
}

export interface Audio240Diagnostic {
  readonly code:
    | "AUDIO240_INVALID_INPUT"
    | "AUDIO240_MISSING_EVIDENCE"
    | "AUDIO240_CONTRADICTORY_EVIDENCE"
    | "AUDIO240_STALE_EVIDENCE"
    | "AUDIO240_HASH_MISMATCH"
    | "AUDIO240_LIVE_PACKAGE_UNSAFE"
    | "AUDIO240_ENVIRONMENT_UNTESTED"
    | "AUDIO240_PAGE_SCROLL"
    | "AUDIO240_PUBLISH_FORBIDDEN";
  readonly message: string;
  readonly path?: string;
}

export interface Audio240GateResult {
  readonly schemaVersion: typeof AUDIO240_SCHEMA_VERSION;
  readonly decision: Audio240Decision;
  readonly ready: false | true;
  readonly projectId: AudioProject["projectId"];
  readonly projectRevision: number;
  readonly projectStateHash: AudioContentHash;
  readonly graphHash: AudioContentHash;
  readonly packageHash: AudioContentHash | null;
  readonly referenceModes: { readonly live: number; readonly pinned: number };
  readonly diagnostics: readonly Audio240Diagnostic[];
  readonly evidence: {
    readonly project: "PASS" | "BLOCKED";
    readonly event: "PASS" | "BLOCKED";
    readonly package: "PASS" | "BLOCKED" | "MISSING";
    readonly workspace: "PASS" | "BLOCKED";
    readonly crossTool: "PASS" | "BLOCKED";
    readonly browser: Audio240EvidenceStatus;
    readonly device: Audio240EvidenceStatus;
    readonly production: Audio240EvidenceStatus;
  };
  readonly publishAllowed: false;
}

export type Audio240Result<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Audio240Diagnostic[];
  }
  | { readonly ok: false; readonly diagnostics: readonly Audio240Diagnostic[] };
