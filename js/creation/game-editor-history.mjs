/** Bounded immutable history for puzzle data, excluding selection and viewport. */
export function createGameEditorHistory(limit = 40) {
  let past = [], future = [];
  return {
    reset() { past = []; future = []; },
    record(value) { past.push(structuredClone(value)); if (past.length > limit) past.shift(); future = []; },
    undo(current) { if (!past.length) return null; future.push(structuredClone(current)); return past.pop(); },
    redo(current) { if (!future.length) return null; past.push(structuredClone(current)); return future.pop(); },
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; }
  };
}

/** Keep authored merges, splits and exclusions when an image is edited again. */
export function retainDifferenceCandidates(existing, previousDetected, nextDetected) {
  const previousPixels = new Set(previousDetected.flatMap(candidate => candidate.pixels));
  const nextPixels = new Set(nextDetected.flatMap(candidate => candidate.pixels));
  const kept = existing.map(candidate => ({ ...candidate, pixels: candidate.pixels.filter(pixel => nextPixels.has(pixel)) })).filter(candidate => candidate.pixels.length);
  const ids = new Set(kept.map(candidate => candidate.id));
  let number = 1;
  for (const candidate of nextDetected) {
    const pixels = candidate.pixels.filter(pixel => !previousPixels.has(pixel));
    if (!pixels.length) continue;
    while (ids.has(`edit-${number}`)) number++;
    const id = `edit-${number++}`; ids.add(id); kept.push({ ...candidate, id, pixels });
  }
  return kept;
}
