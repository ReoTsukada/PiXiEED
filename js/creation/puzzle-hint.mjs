/** One free hint per stable puzzle identity, then hints while a site reward is active. */
import { REWARD_LIMITS } from '../ads/site-reward-config.mjs?rev=20261016-color-capability-1';

export const PUZZLE_HINT_STORE_PREFIX = 'pixieed:puzzle-hint:v2:';
export const PUZZLE_HINT_FREE_LIMIT = REWARD_LIMITS.puzzle.freeHints;

/** Stable across a restart of the same source and cut, independent of random game IDs. */
export function jigsawPuzzleHintKey(game) {
  if (!game || !game.source || !game.layout) return '';
  const source = game.source;
  const sourceIdentity = source.type === 'file' || source.type === 'public'
    ? source.fingerprint || (source.type === 'public' ? source.postId : game.gameId)
    : source.contentHash || `${source.draftId || ''}:${source.assetId || ''}:${source.revisionId || ''}`;
  if (!sourceIdentity) return game.gameId ? `jigsaw:${game.gameId}` : '';
  const { width, height, columns, rows, pieceSize } = game.layout;
  return `jigsaw:${source.type}:${sourceIdentity}:${width}x${height}:${columns}x${rows}:${pieceSize}`;
}

function resolvedStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function storageKey(problemKey) { return `${PUZZLE_HINT_STORE_PREFIX}${encodeURIComponent(problemKey)}`; }
function readCount(storage, problemKey, volatileCounts) {
  if (!problemKey) return 0;
  try {
    const raw = resolvedStorage(storage)?.getItem(storageKey(problemKey));
    if (raw !== null && raw !== undefined) {
      const count = Number(raw);
      if (Number.isSafeInteger(count) && count >= 0) return Math.max(count, volatileCounts.get(problemKey) || 0);
    }
    const legacy = resolvedStorage(storage)?.getItem(`pixieed:puzzle-hint:v1:${problemKey}`);
    if (legacy === 'used') return 1;
  } catch { /* use the in-memory session count */ }
  return volatileCounts.get(problemKey) || 0;
}
function writeCount(storage, problemKey, count) {
  try { resolvedStorage(storage)?.setItem(storageKey(problemKey), String(count)); } catch { /* storage may be disabled */ }
}

/**
 * A stable puzzle key owns its free hint across reloads and restarts. Extra hints
 * are admitted only by the shared site reward gate; the gate is synchronous so
 * it can open its consent UI before returning false. History changes only after
 * `show` succeeds, and stale async hints are discarded when the puzzle changes.
 */
export function createPuzzleHintController({
  storage,
  requireReward = () => false,
  hasReward = () => false,
  isRewardPolicyEnabled = () => false,
  subscribeReward = () => () => {},
  feature = 'puzzle.hint',
  onState = () => {}
} = {}) {
  const volatileCounts = new Map();
  let problemKey = '';
  let generation = 0;
  let pending = false;
  const state = () => {
    const usedCount = readCount(storage, problemKey, volatileCounts);
    const freeRemaining = Math.max(0, PUZZLE_HINT_FREE_LIMIT - usedCount);
    const policyEnabled = !!isRewardPolicyEnabled();
    const rewardActive = !!hasReward();
    const current = { problemKey, usedCount, freeLimit: PUZZLE_HINT_FREE_LIMIT, freeRemaining, freeUsed: freeRemaining === 0, rewardActive, policyEnabled, pending };
    onState(current);
    return current;
  };
  let unsubscribe = () => {};
  try { unsubscribe = subscribeReward(() => state()) || (() => {}); } catch { /* reward UI may be unavailable */ }
  return {
    setProblem(key) {
      const next = typeof key === 'string' ? key : '';
      if (next !== problemKey) { problemKey = next; generation += 1; }
      return state();
    },
    getState: state,
    destroy() { try { unsubscribe(); } catch { /* no-op */ } },
    async request(show) {
      const key = problemKey; const turn = generation;
      if (!key || pending || typeof show !== 'function') return false;
      pending = true; state();
      try {
        if (turn !== generation || key !== problemKey) return false;
        const usedCount = readCount(storage, key, volatileCounts);
        const isFree = usedCount < PUZZLE_HINT_FREE_LIMIT;
        if (!isFree && isRewardPolicyEnabled()) {
          let admitted = false;
          try { admitted = requireReward(feature) === true; } catch { admitted = false; }
          if (!admitted) return false;
        }
        if (turn !== generation || key !== problemKey) return false;
        const shown = await show();
        if (turn !== generation || key !== problemKey || shown === false) return false;
        volatileCounts.set(key, usedCount + 1);
        writeCount(storage, key, usedCount + 1);
        return true;
      } catch { return false; }
      finally { pending = false; state(); }
    }
  };
}
