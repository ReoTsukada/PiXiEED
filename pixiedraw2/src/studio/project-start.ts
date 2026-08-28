/** Shared, mode-neutral entry decisions for the isolated PiXiEED Studio. */

export const CREATOR_START_MODES = ["DRAW", "AUDIO", "GAME"] as const;

export type CreatorStartMode = typeof CREATOR_START_MODES[number];

export function isCreatorStartMode(value: unknown): value is CreatorStartMode {
  return value === "DRAW" || value === "AUDIO" || value === "GAME";
}

export function resolveCreatorStartMode(
  value: string | null | undefined,
  fallback: CreatorStartMode = "DRAW",
): CreatorStartMode {
  const normalized = value?.trim().toUpperCase();
  return isCreatorStartMode(normalized) ? normalized : fallback;
}

export interface ProjectStartIntent {
  readonly projectId?: string;
  readonly kind: "OPEN" | "NEW";
  readonly mode: CreatorStartMode;
}

export function createProjectStartIntent(input: {
  readonly projectId?: string;
  readonly kind: "OPEN" | "NEW";
  readonly mode?: string | null;
}): ProjectStartIntent {
  const projectId = input.projectId?.trim();
  return {
    ...(projectId === undefined || projectId.length === 0 ? {} : { projectId }),
    kind: input.kind,
    mode: resolveCreatorStartMode(input.mode),
  };
}
