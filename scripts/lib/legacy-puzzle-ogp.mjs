import { isLegacyPuzzleShareId } from '../../js/creation/puzzle-share-identity.mjs';

const MODE_NAMES = Object.freeze({ spot_difference: 'spot-difference', hidden_object: 'hidden-object' });
const SAFE_POST_ID = /^[A-Za-z0-9_-]{1,128}$/;

function legacyMode(row) {
  const idMode = isLegacyPuzzleShareId('spot_difference', row?.id) ? 'spot_difference'
    : isLegacyPuzzleShareId('hidden_object', row?.id) ? 'hidden_object' : null;
  if (!idMode) return null;
  const values = [row.mode, row.game_mode, row.play_mode].filter(value => value !== null && value !== undefined && value !== '');
  const normalized = values.map(value => value === 'spot-difference' ? 'spot_difference' : value === 'hidden-object' ? 'hidden_object' : value);
  if (normalized.some(value => value !== idMode)) return null;
  return idMode;
}

/** Join only published legacy puzzle posts to exact puzzle IDs; never guess a missing join. */
export function linkLegacyPuzzleOgpCandidates(posts, puzzles, { postLimit = 500, puzzleLimit = 500 } = {}) {
  if (!Array.isArray(posts) || posts.length >= postLimit) throw new Error(`Legacy post limit (${postLimit}) reached or response is invalid.`);
  if (!Array.isArray(puzzles) || puzzles.length >= puzzleLimit) throw new Error(`Legacy puzzle limit (${puzzleLimit}) reached or response is invalid.`);
  const postIds = new Set();
  const publishedPosts = posts.filter(post => post?.status === 'published'
    && post.post_kind === 'pixfind' && post.distribution_mode === 'pixfind'
    && typeof post.pixfind_puzzle_id === 'string');
  for (const post of publishedPosts) {
    if (typeof post.id !== 'string' || !SAFE_POST_ID.test(post.id) || postIds.has(post.id.toLowerCase())) throw new Error('Legacy public post rows are invalid or duplicated.');
    postIds.add(post.id.toLowerCase());
  }
  const rows = new Map();
  for (const row of puzzles) {
    if (typeof row?.id !== 'string' || rows.has(row.id.toLowerCase())) throw new Error('Legacy puzzle rows are invalid or duplicated.');
    rows.set(row.id.toLowerCase(), row);
  }
  const seenPuzzleIds = new Set();
  const result = [];
  for (const post of publishedPosts) {
    const row = rows.get(post.pixfind_puzzle_id.toLowerCase());
    if (!row) continue;
    const mode = legacyMode(row);
    if (!mode) continue;
    if (seenPuzzleIds.has(row.id.toLowerCase())) throw new Error('Legacy public puzzle ID is linked more than once.');
    seenPuzzleIds.add(row.id.toLowerCase());
    result.push({ source: 'legacy', mode, game: MODE_NAMES[mode], post, row });
  }
  return result;
}
