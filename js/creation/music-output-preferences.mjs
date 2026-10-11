export const MUSIC_OUTPUT_PREFERENCES_VERSION = 1;
export const DEFAULT_MUSIC_OUTPUT_PREFERENCES = Object.freeze({
  includeMusic: false,
  includeAudio: true,
  loops: 1
});

const validLoops = new Set([1, 2, 4, 8]);

/** Validate versioned, project-scoped export options; malformed/unknown data resets safely. */
export function normalizeMusicOutputPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== MUSIC_OUTPUT_PREFERENCES_VERSION
      || typeof value.includeMusic !== 'boolean' || typeof value.includeAudio !== 'boolean'
      || !validLoops.has(value.loops)) return { ...DEFAULT_MUSIC_OUTPUT_PREFERENCES };
  return { includeMusic: value.includeMusic, includeAudio: value.includeAudio, loops: value.loops };
}

export function readMusicOutputPreferences(project) {
  return normalizeMusicOutputPreferences(project?.manifest?.creationProject?.musicOutput);
}

/** Return a new project-like value while preserving unrelated manifest fields. */
export function writeMusicOutputPreferences(project, value) {
  const preferences = normalizeMusicOutputPreferences({ schemaVersion: MUSIC_OUTPUT_PREFERENCES_VERSION, ...value });
  const previous = project?.manifest?.creationProject?.musicOutput;
  const extensions = previous && typeof previous === 'object' && !Array.isArray(previous)
    && previous.schemaVersion === MUSIC_OUTPUT_PREFERENCES_VERSION ? previous : {};
  return {
    ...project,
    manifest: {
      ...project?.manifest,
      creationProject: {
        ...project?.manifest?.creationProject,
        musicOutput: { ...extensions, schemaVersion: MUSIC_OUTPUT_PREFERENCES_VERSION, ...preferences }
      }
    }
  };
}
