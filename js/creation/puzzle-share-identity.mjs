const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i');
const LEGACY_SPOT_PATTERN = new RegExp(`^pixfind-(?:sd-)?(${UUID})$`, 'i');
const LEGACY_HIDDEN_PATTERN = new RegExp(`^pixfind-ho-(${UUID})$`, 'i');
const BUCKETS = new Set(['pixfind-puzzles', 'pixieed-contest']);

function normalizedMode(mode) {
  if (mode === 'spot_difference' || mode === 'spot-difference') return 'spot_difference';
  if (mode === 'hidden_object' || mode === 'hidden-object') return 'hidden_object';
  return null;
}

export function isLegacyPuzzleShareId(mode, id) {
  const normalized = normalizedMode(mode);
  if (!normalized || typeof id !== 'string' || id.length > 48) return false;
  const pattern = normalized === 'spot_difference' ? LEGACY_SPOT_PATTERN : LEGACY_HIDDEN_PATTERN;
  return pattern.test(id);
}

export function isPuzzleShareId(mode, id) {
  return Boolean(normalizedMode(mode)) && typeof id === 'string' && (UUID_PATTERN.test(id) || isLegacyPuzzleShareId(mode, id));
}

/** Validate an exact legacy puzzle PNG in one of its two public storage buckets. */
export function legacyPuzzleImageUrl(value, { puzzleId, supabaseUrl } = {}) {
  if (typeof value !== 'string' || value.length > 2048
      || typeof supabaseUrl !== 'string' || !/^https:\/\/[^/?#]+\/?$/i.test(supabaseUrl)
      || !(isLegacyPuzzleShareId('spot_difference', puzzleId) || isLegacyPuzzleShareId('hidden_object', puzzleId))) return null;
  if (/%|[\\?#\u0000-\u0020\u007f]/.test(value)) return null;
  const rawPath = value.match(/^https:\/\/[^/?#]+([^?#]*)$/i)?.[1];
  if (!rawPath || rawPath.split('/').slice(1).some((part) => part === '.' || part === '..' || !part)) return null;
  let project; let image;
  try { project = new URL(supabaseUrl); image = new URL(value); } catch { return null; }
  if (project.protocol !== 'https:' || project.pathname !== '/' || project.username || project.password || project.search || project.hash
      || image.protocol !== 'https:' || image.origin !== project.origin || image.username || image.password || image.search || image.hash) return null;
  const match = rawPath.match(/^\/storage\/v1\/object\/public\/(pixfind-puzzles|pixieed-contest)\/puzzles\/([^/]+)\/([A-Za-z0-9_-]{1,128}\.png)$/);
  if (!match || !BUCKETS.has(match[1]) || match[2] !== puzzleId) return null;
  return image.href;
}
