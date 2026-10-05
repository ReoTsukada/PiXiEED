/** Bounded state-history stacks. State capture and restoration stay with the editor. */
export function createAudioHistory(limit = 40) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('履歴数が不正です。');
  const undoStack = [];
  const redoStack = [];
  return Object.freeze({
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    commit(previousState) {
      undoStack.push(previousState);
      if (undoStack.length > limit) undoStack.splice(0, undoStack.length - limit);
      redoStack.length = 0;
    },
    undo(currentState) {
      if (!undoStack.length) return null;
      redoStack.push(currentState);
      return undoStack.pop();
    },
    redo(currentState) {
      if (!redoStack.length) return null;
      undoStack.push(currentState);
      return redoStack.pop();
    },
    reset() { undoStack.length = 0; redoStack.length = 0; }
  });
}
