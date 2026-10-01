const SAVE_ERROR_MESSAGE = '他の人の投稿作品は遊ぶ専用です。PXDや画像の保存は自分の作品で利用できます。';

export const WORK_SAVE_FORBIDDEN = 'WORK_SAVE_FORBIDDEN';

export function getPxdPublicSources(project) {
  const sources = [];
  if (project == null) return sources;
  const add = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('malformed source');
    if (value.type === 'public') { sources.push(value); return; }
    if (value.type === 'file' || value.type === 'pxd-image') return;
    // Legacy local Draw references have no `type`; the fixed revision fields identify them.
    if ((!value.type || value.type === 'draw') && ['draftId', 'assetId', 'revisionId', 'contentHash', 'hashScheme'].every((key) => typeof value[key] === 'string' && value[key])) return;
    throw new TypeError('malformed source');
  };
  const parseJson = (entry) => {
    if (!entry || typeof entry.path !== 'string' || !['puzzles/jigsaw.json', 'puzzles/spot_difference.json', 'puzzles/hidden_object.json'].includes(entry.path)) return undefined;
    try {
      const bytes = entry.bytes;
      if (!(bytes instanceof Uint8Array)) throw new TypeError();
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError();
      return value;
    } catch { throw new TypeError('malformed puzzle source'); }
  };
  try {
    if (!project || typeof project !== 'object' || Array.isArray(project)) throw new TypeError();
    {
      if (project.format !== 'PXD' || project.version !== 3 || !Array.isArray(project.entries)) throw new TypeError();
      const seenPuzzlePaths = new Set();
      for (const entry of project.entries) {
        if (!['puzzles/jigsaw.json', 'puzzles/spot_difference.json', 'puzzles/hidden_object.json'].includes(entry?.path)) continue;
        const puzzle = parseJson(entry);
        if (seenPuzzlePaths.has(entry.path)) throw new TypeError();
        seenPuzzlePaths.add(entry.path);
        const payload = puzzle.document ? puzzle : { document: puzzle, portable: null };
        if (!payload.document || typeof payload.document !== 'object' || Array.isArray(payload.document)) throw new TypeError();
        const keys = entry.path.endsWith('spot_difference.json') ? ['before', 'after'] : ['source'];
        for (const key of keys) if (Object.hasOwn(payload.document, key)) add(payload.document[key]);
        else throw new TypeError();
        if (payload.portable != null) {
          const refs = payload.portable.originalRefs;
          if (!refs || typeof refs !== 'object' || Array.isArray(refs)) throw new TypeError();
          for (const key of ['source', 'before', 'after']) if (Object.hasOwn(refs, key)) add(refs[key]);
        } else if (payload.document.source?.type === 'public' || payload.document.before?.type === 'public' || payload.document.after?.type === 'public') throw new TypeError();
      }
    }
  } catch { throw saveForbidden(); }
  return sources;
}

function saveForbidden() {
  const error = new Error(SAVE_ERROR_MESSAGE);
  error.code = WORK_SAVE_FORBIDDEN;
  return error;
}

async function defaultVerifier(source) {
  try {
    const { verifyPublicWorkOwnership } = await import('../globe/post-supabase.mjs?rev=20261001-free-tools-1');
    return await verifyPublicWorkOwnership(source);
  } catch { return false; }
}

export async function assertOwnPublicSources(sources, { verifyPublicSource = defaultVerifier } = {}) {
  try {
    if (!Array.isArray(sources) || typeof verifyPublicSource !== 'function') throw new TypeError();
    const unique = new Map();
    for (const source of sources) {
      if (!source || typeof source !== 'object' || Array.isArray(source) || source.type !== 'public') throw new TypeError();
      const map = /^map:[A-Za-z0-9_-]{1,128}$/.test(source.postId || '');
      const showcase = /^showcase:[A-Za-z0-9_-]{1,128}$/.test(source.postId || '');
      const pixfind = /^pixfind:[A-Za-z0-9_-]{1,128}:([A-Za-z0-9_-]{1,128})$/.exec(source.postId || '');
      const url = (() => { try { return new URL(source.url); } catch { return null; } })();
      if ((!map && !showcase && !pixfind) || (pixfind && source.puzzleId !== pixfind[1]) || typeof source.title !== 'string' || !source.title.trim() || source.title.length > 120 || typeof source.url !== 'string' || source.url.length > 2048 || !url || url.href !== source.url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^[a-f0-9]{64}$/.test(source.fingerprint || '') || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 2 || source.height < 2 || source.width * source.height > 2 * 1024 * 1024) throw new TypeError();
      unique.set(`${source.postId}\n${source.url}`, source);
    }
    for (const source of unique.values()) if (await verifyPublicSource(source) !== true) throw new TypeError();
    return sources;
  } catch { throw saveForbidden(); }
}

export async function assertOwnWorkProject(project, options = {}) {
  const sources = getPxdPublicSources(project);
  await assertOwnPublicSources(sources, options);
  return project;
}
