import type {
  AudioAssetizationInput,
  AudioDeliveryRole,
} from "./assetization.ts";

export type AudioAssetPackageKind = "BGM" | "SE" | "VOICE";

export interface AudioAssetPackageSelectionInput {
  readonly projectId: string;
  readonly projectRevision: string;
  readonly projectStateHash: string;
  readonly label: string;
  readonly kind: AudioAssetPackageKind;
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly durationTick: number;
  readonly rangeId?: string;
}

export type AudioAssetPackageResult =
  | { readonly ok: true; readonly value: AudioAssetizationInput }
  | { readonly ok: false; readonly errors: readonly string[] };

function normalized(value: string): string {
  return value.trim();
}

function stableRangeId(input: AudioAssetPackageSelectionInput, trackIds: readonly string[]): string {
  const key = JSON.stringify({
    projectId: normalized(input.projectId),
    projectRevision: normalized(input.projectRevision),
    projectStateHash: normalized(input.projectStateHash),
    kind: input.kind,
    trackIds,
    startTick: input.startTick,
    durationTick: input.durationTick,
  });
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `audio-range:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Build the UI-independent input consumed by detectAudioAssetization. */
export function createAudioAssetizationInput(
  input: AudioAssetPackageSelectionInput,
): AudioAssetPackageResult {
  const errors: string[] = [];
  const projectId = normalized(input.projectId);
  const projectRevision = normalized(input.projectRevision);
  const projectStateHash = normalized(input.projectStateHash);
  const label = normalized(input.label);
  const trackIds = input.trackIds.map(normalized);

  if (projectId.length === 0) errors.push("projectId is required");
  if (projectRevision.length === 0) errors.push("projectRevision is required");
  if (projectStateHash.length === 0) errors.push("projectStateHash is required");
  if (label.length === 0) errors.push("label is required");
  if (!["BGM", "SE", "VOICE"].includes(input.kind)) errors.push("kind must be BGM, SE, or VOICE");
  if (trackIds.length === 0 || trackIds.some((trackId) => trackId.length === 0)) {
    errors.push("trackIds must contain at least one non-empty track ID");
  }
  if (!Number.isSafeInteger(input.startTick) || input.startTick < 0) {
    errors.push("startTick must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(input.durationTick) || input.durationTick <= 0) {
    errors.push("durationTick must be a positive safe integer");
  }
  if (input.rangeId !== undefined && normalized(input.rangeId).length === 0) {
    errors.push("rangeId must be non-empty when provided");
  }
  if (errors.length > 0) return { ok: false, errors };

  const rangeId = input.rangeId === undefined
    ? stableRangeId(input, trackIds)
    : normalized(input.rangeId);
  const role: AudioDeliveryRole = input.kind;
  return {
    ok: true,
    value: {
      sourceProjectId: projectId,
      sourceRevisionId: projectRevision,
      contentHash: projectStateHash,
      ranges: [{
        rangeId,
        label,
        trackIds,
        startTick: input.startTick,
        durationTick: input.durationTick,
        role,
        loop: input.kind === "BGM",
      }],
    },
  };
}

export const buildAudioAssetizationInput = createAudioAssetizationInput;
