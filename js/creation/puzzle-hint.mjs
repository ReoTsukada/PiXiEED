/** A small, per-problem hint allowance shared by puzzle players. */
export const PUZZLE_HINT_STORE_PREFIX = 'pixieed:puzzle-hint:v1:';

function resolvedStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.sessionStorage; } catch { return null; }
}

function readUsed(storage, problemKey) {
  try { return resolvedStorage(storage)?.getItem(`${PUZZLE_HINT_STORE_PREFIX}${problemKey}`) === 'used'; }
  catch { return false; }
}

function writeUsed(storage, problemKey) {
  try { resolvedStorage(storage)?.setItem(`${PUZZLE_HINT_STORE_PREFIX}${problemKey}`, 'used'); } catch { /* storage may be disabled */ }
}

/**
 * Creates a stale-safe hint gate. The free hint is recorded only after `show`
 * succeeds; pass cancellation, failed rendering, and switching problems leave
 * the new problem's allowance untouched.
 */
export function createPuzzleHintController({ perk, requestPass, storage, onState = () => {} } = {}) {
  const usedKeys = new Set();
  let problemKey = '';
  let generation = 0;
  let pending = false;
  const state = () => {
    const used = !!problemKey && (usedKeys.has(problemKey) || readUsed(storage, problemKey));
    onState({ problemKey, freeUsed: used, pending });
    return { problemKey, freeUsed: used, pending };
  };
  return {
    setProblem(key) {
      const next = typeof key === 'string' ? key : '';
      if (next !== problemKey) { problemKey = next; generation += 1; }
      return state();
    },
    getState: state,
    async request(show) {
      const key = problemKey; const turn = generation;
      if (!key || pending || typeof show !== 'function') return false;
      pending = true; state();
      try {
        const free = !usedKeys.has(key) && !readUsed(storage, key);
        if (!free && !(await requestPass?.({ perk }))) return false;
        if (turn !== generation || key !== problemKey) return false;
        const shown = await show();
        if (turn !== generation || key !== problemKey || shown === false) return false;
        if (free) { usedKeys.add(key); writeUsed(storage, key); }
        return true;
      } catch { return false; }
      finally { pending = false; state(); }
    }
  };
}
