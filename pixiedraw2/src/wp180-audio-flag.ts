export type AudioFeatureFlag = "on" | "off";

export type AudioFeatureFlagReason =
  | "default-on"
  | "default-off"
  | "explicit-on"
  | "explicit-off"
  | "unknown";

export interface AudioFeatureFlagResolution {
  readonly flag: AudioFeatureFlag;
  readonly reason: AudioFeatureFlagReason;
}

function normalizeFlag(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.trim().toLowerCase();
}

/**
 * Resolve the host-level Audio switch without making an absent query a
 * silent default.  Only an explicit `audio=off` disables the desktop Audio
 * surface; malformed values fail closed so a typo can never enable an
 * unexpected path.
 */
export function resolveAudioFeatureFlag(
  queryValue: string | null | undefined,
  defaultValue: string | null | undefined = "on",
): AudioFeatureFlagResolution {
  const query = normalizeFlag(queryValue);
  if (query === "on") return { flag: "on", reason: "explicit-on" };
  if (query === "off") return { flag: "off", reason: "explicit-off" };
  if (queryValue !== null && queryValue !== undefined) {
    return { flag: "off", reason: "unknown" };
  }

  const fallback = normalizeFlag(defaultValue) === "off" ? "off" : "on";
  return fallback === "off"
    ? { flag: "off", reason: "default-off" }
    : { flag: "on", reason: "default-on" };
}
