const TOOLS = new Set(['audio', 'camera']);
const LEGACY_HANDOFF_KEYS = ['drawRequest', 'audioRequest', 'drawCamera', 'audioCamera'];
const POINTER_KEYS = ['pxd', 'pxdRevision', 'pxdImage', 'modePxd', 'modePxdRevision', 'modePxdImage'];

function paramsFrom(search) {
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  return new URLSearchParams(String(search || '').replace(/^\?/, ''));
}

function assertUnambiguous(params, keys) {
  for (const key of keys) if (params.getAll(key).length > 1) {
    throw new TypeError(`複数の${key}値が指定されています。`);
  }
}

/** Redirect a tool pointer into the shared Draw shell without exposing it to Draw's normal PXD loader. */
export function creationModeEntryUrl(mode, search = '') {
  if (!TOOLS.has(mode)) return null;
  const params = paramsFrom(search);
  if (params.get('standalone') === '1' || ['draw', 'audio'].includes(params.get('to'))
      || LEGACY_HANDOFF_KEYS.some((key) => params.has(key))) return null;

  assertUnambiguous(params, [...POINTER_KEYS, 'modeProjectTool']);
  const selectedTool = params.get('modeProjectTool');
  const legacyKeys = ['pxd', 'pxdRevision', 'pxdImage'];
  const selectedKeys = ['modePxd', 'modePxdRevision', 'modePxdImage'];
  const legacyPointer = legacyKeys.map((key) => params.get(key));
  const selectedPointer = selectedKeys.map((key) => params.get(key));
  const hasLegacyPointer = legacyKeys.some((key) => params.has(key));
  const hasSelectedPointer = selectedKeys.some((key) => params.has(key));
  // Workspace saves update the raw PXD pointer. When both namespaces are
  // present, that newest saved revision takes precedence over the entry hint.
  const pointerToKeep = selectedTool === mode && hasLegacyPointer
    ? legacyPointer
    : selectedTool === mode && hasSelectedPointer ? selectedPointer
      : selectedTool !== mode && hasLegacyPointer ? legacyPointer : null;
  for (const key of POINTER_KEYS) params.delete(key);
  if (pointerToKeep) {
    for (const [key, value] of selectedKeys.map((key, index) => [key, pointerToKeep[index]])) {
      if (value !== null) params.set(key, value);
    }
  }
  params.set('modeProjectTool', mode);
  params.set('mode', mode);
  return `/draw/${params.size ? `?${params.toString()}` : ''}`;
}

/** Read a tool-scoped pointer while keeping ordinary Draw PXD parameters isolated. */
export function readCreationModePointer(tool, search = '') {
  if (!TOOLS.has(tool)) throw new TypeError('制作モードが不正です。');
  const params = paramsFrom(search);
  const selectedTools = params.getAll('modeProjectTool');
  if (!selectedTools.includes(tool)) return undefined;
  assertUnambiguous(params, ['modeProjectTool', 'modePxd', 'modePxdRevision', 'modePxdImage']);
  const projectId = params.get('modePxd');
  const revisionId = params.get('modePxdRevision');
  const images = params.getAll('modePxdImage');
  if (!projectId?.trim() || !revisionId?.trim() || images.length > 1 || (images.length === 1 && !images[0].trim())) {
    throw new TypeError('制作モードの作品保存版を特定できません。');
  }
  return { projectId, revisionId, ...(images.length ? { imageRole: images[0] } : {}) };
}
