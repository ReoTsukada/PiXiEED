import { estimateRetainedAnimationBytes, validateAnimation } from './animation-core.mjs';

export const DRAW_ANIMATION_HISTORY_MAX_BYTES = 4 * 1024 * 1024;

/** Draw-only bounded history with a serializable handoff surface. */
export function createDrawAnimationHistory(initial, { maxBytes = DRAW_ANIMATION_HISTORY_MAX_BYTES, maxEntries = 100 } = {}) {
  validateAnimation(initial);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError('Undo履歴の上限が不正です。');
  let current = initial; const past = []; const future = [];
  const trim = () => {
    while (past.length + future.length > maxEntries) { if (past.length) past.shift(); else future.shift(); }
    const extraBytes = () => estimateRetainedAnimationBytes([...past, ...future, current]) - estimateRetainedAnimationBytes([current]);
    while (extraBytes() > maxBytes) { if (past.length) past.shift(); else if (future.length) future.shift(); else break; }
  };
  return {
    get current() { return current; }, get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
    /** Immutable references to the bounded timeline, ordered oldest to newest. */
    snapshot() { return Object.freeze({ current, past: Object.freeze([...past]), future: Object.freeze([...future]) }); },
    /** Validate and budget a complete timeline before replacing any live history. */
    restore(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.past) || !Array.isArray(snapshot.future) ||
          !Object.hasOwn(snapshot, 'current') || snapshot.past.length + snapshot.future.length > maxEntries) {
        throw new TypeError('Undo履歴のスナップショットが不正です。');
      }
      const nextPast = [...snapshot.past], nextFuture = [...snapshot.future], nextCurrent = snapshot.current;
      const nextTimeline = [...nextPast, nextCurrent, ...nextFuture];
      for (const item of nextTimeline) validateAnimation(item);
      if (estimateRetainedAnimationBytes(nextTimeline) - estimateRetainedAnimationBytes([nextCurrent]) > maxBytes) {
        throw new RangeError('Undo履歴の保存上限を超えています。');
      }
      current = nextCurrent;
      past.splice(0, past.length, ...nextPast);
      future.splice(0, future.length, ...nextFuture);
    },
    commit(next) { validateAnimation(next); if (next === current) return false; future.length = 0; past.push(current); current = next; trim(); return true; },
    undo() { if (!past.length) return false; future.push(current); current = past.pop(); return true; },
    redo() { if (!future.length) return false; past.push(current); current = future.pop(); trim(); return true; },
    reset(next) { validateAnimation(next); current = next; past.length = 0; future.length = 0; }
  };
}
