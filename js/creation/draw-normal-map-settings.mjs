/** Lightweight project preferences; pixel generation and PNG encoding stay lazy. */
export const DEFAULT_NORMAL_MAP_SETTINGS = Object.freeze({
  method: 'silhouette', strength: 2, radius: 3, invertHeight: false, format: 'opengl',
  azimuth: 315, elevation: 45, ambient: 0.25, intensity: 1, lightColor: '#ffffff',
  specular: 0.25, roughness: 0.5, shadeUnpainted: false,
  initialFill: 'transparent', overlayOpacity: 1
});

/** Sanitize persisted panel preferences without keeping unknown keys or references. */
export function normalizeNormalMapSettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const read = key => Object.hasOwn(input, key) ? input[key] : undefined;
  const choice = (key, choices) => choices.includes(read(key)) ? read(key) : DEFAULT_NORMAL_MAP_SETTINGS[key];
  const number = (key, min, max) => Number.isFinite(read(key)) ? Math.min(max, Math.max(min, read(key))) : DEFAULT_NORMAL_MAP_SETTINGS[key];
  const boolean = key => typeof read(key) === 'boolean' ? read(key) : DEFAULT_NORMAL_MAP_SETTINGS[key];
  const color = read('lightColor');
  return {
    method: choice('method', ['silhouette', 'luminance', 'painted']),
    strength: number('strength', 0, 8), radius: Math.round(number('radius', 1, 32)),
    invertHeight: boolean('invertHeight'), format: choice('format', ['opengl', 'directx']),
    azimuth: number('azimuth', 0, 360), elevation: number('elevation', 0, 90),
    ambient: number('ambient', 0, 1), intensity: number('intensity', 0, 2),
    lightColor: typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_NORMAL_MAP_SETTINGS.lightColor,
    specular: number('specular', 0, 1), roughness: number('roughness', 0.05, 1),
    shadeUnpainted: boolean('shadeUnpainted'), initialFill: choice('initialFill', ['transparent', 'flat']),
    overlayOpacity: number('overlayOpacity', 0, 1)
  };
}


/** Unknown project-setting versions never silently change the current editor defaults. */
export function readNormalMapSettings(project) {
  const value = project?.manifest?.creationProject?.normalMap;
  return normalizeNormalMapSettings(value?.schemaVersion === 1 ? value : null);
}

/** Store settings per project, preserving unrelated metadata and binary payloads. */
export function writeNormalMapSettings(project, value) {
  return {
    ...project,
    manifest: {
      ...project?.manifest,
      creationProject: {
        ...project?.manifest?.creationProject,
        normalMap: { schemaVersion: 1, ...normalizeNormalMapSettings(value) }
      }
    }
  };
}
