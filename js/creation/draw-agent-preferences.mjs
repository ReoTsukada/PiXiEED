/** Explicit, bounded view preferences; never dispatch arbitrary UI commands. */
export function normalizeDrawAgentPreferences(operation) {
  const ranges = operation?.type === 'normal.configure' ? {
    azimuth: [0, 360], elevation: [0, 90], ambient: [0, 1], intensity: [0, 2],
    specular: [0, 1], roughness: [0.05, 1], overlayOpacity: [0, 1],
  } : operation?.type === 'view.configure' ? { zoom: [1, 8], panX: [-100000, 100000], panY: [-100000, 100000] } : null;
  if (!ranges) throw new TypeError('Unsupported Draw preferences');
  const normal = operation.type === 'normal.configure';
  const value = normal ? operation.settings : Object.fromEntries(Object.entries(operation).filter(([key]) => key !== 'type'));
  if (normal && Object.keys(operation).some(key => !['type', 'settings'].includes(key))) throw new TypeError('Unsupported normal configuration field');
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw new TypeError('Preferences must not be empty');
  const booleans = normal ? ['shadeUnpainted', 'previewLighting'] : ['showGrid', 'onion'];
  for (const [key, entry] of Object.entries(value)) {
    if (ranges[key]) {
      if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < ranges[key][0] || entry > ranges[key][1]) throw new RangeError(`${key} is out of range`);
    } else if (booleans.includes(key)) {
      if (typeof entry !== 'boolean') throw new TypeError(`${key} must be boolean`);
    } else if (normal && key === 'lightColor') {
      if (typeof entry !== 'string' || !/^#[\da-f]{6}$/i.test(entry)) throw new TypeError('lightColor must be #RRGGBB');
    } else throw new TypeError(`Unsupported preferences field: ${key}`);
  }
  return { ...value };
}
