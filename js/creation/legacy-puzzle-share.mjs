import { isLegacyPuzzleShareId, legacyPuzzleImageUrl } from './puzzle-share-identity.mjs';

const MODES = new Set(['spot_difference', 'hidden_object']);
const validDimension = (value) => Number.isInteger(value) && value > 0 && value <= 512;
const cleanText = (value, max) => typeof value === 'string' && value.trim()
  && Array.from(value.trim()).length <= max && !/[\u0000-\u001f\u007f]/.test(value)
  ? value.trim() : null;

function rowMode(row) {
  const values = [row?.mode, row?.game_mode, row?.play_mode].filter((value) => value !== null && value !== undefined && value !== '');
  if (!values.length) return null;
  const normalized = values.map((value) => value === 'spot-difference' ? 'spot_difference'
    : value === 'hidden-object' ? 'hidden_object' : value);
  if (normalized.some((value) => !MODES.has(value)) || normalized.some((value) => value !== normalized[0])) return null;
  return normalized[0];
}

function targetName(target) {
  if (typeof target === 'string') return cleanText(target, 80);
  if (!target || typeof target !== 'object' || Array.isArray(target)) return null;
  return cleanText(target.name ?? target.label, 80);
}

/** Adapt only a legacy puzzle with an exactly matching, published social post. */
export function legacyPuzzleSharePayload(posts, row, { original, changed, supabaseUrl } = {}) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string') return null;
  const mode = rowMode(row);
  if (!mode || !isLegacyPuzzleShareId(mode, row.id)) return null;
  const published = Array.isArray(posts) && posts.some((post) => post?.status === 'published'
    && post.post_kind === 'pixfind' && post.distribution_mode === 'pixfind'
    && post.pixfind_puzzle_id === row.id);
  if (!published) return null;
  const title = cleanText(row.label, 60);
  const author = cleanText(row.author_name, 80);
  const width = original?.width; const height = original?.height;
  if (!title || !author || !validDimension(width) || !validDimension(height)) return null;
  const originalUrl = legacyPuzzleImageUrl(row.original_url, { puzzleId: row.id, supabaseUrl });
  if (!originalUrl) return null;
  const puzzle = {
    postId: row.id,
    source: 'legacy',
    mode,
    title,
    author,
    originalImage: { url: originalUrl, width, height },
  };
  if (mode === 'spot_difference') {
    const changedUrl = legacyPuzzleImageUrl(row.diff_url, { puzzleId: row.id, supabaseUrl });
    if (!changedUrl || !validDimension(changed?.width) || !validDimension(changed?.height)
        || changed.width !== width || changed.height !== height) return null;
    puzzle.changedImage = { url: changedUrl, width: changed.width, height: changed.height };
  } else {
    if (!Array.isArray(row.targets) || !row.targets.length || row.targets.length > 128) return null;
    const targets = row.targets.map(targetName);
    if (targets.some((name) => !name)) return null;
    puzzle.definition = { targets: targets.map((name) => ({ name })) };
  }
  return { ok: true, puzzle };
}
