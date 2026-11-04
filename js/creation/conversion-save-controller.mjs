/** One explicit save intent follows its settings revision through existing engines. */
export function createConversionSaveIntent({ snapshot, run, save, choose, stageComplete = () => {}, blocked = () => {}, settled = () => {} }) {
  let pending = null;
  function start(stage, state) {
    pending = { mode: state.mode, revision: state.revision, before: state.href, stage, sawBusy: state.working };
    const job = pending;
    let task;
    try { task = run(stage); }
    catch (error) { if (pending === job) { pending = null; blocked(error); settled(); } return; }
    if (pending !== job) {
      // The native action still owns its promise after cancellation; consume a
      // rejected stale job without changing a newer save or reporting old errors.
      if (task && typeof task.then === 'function') Promise.resolve(task).catch(() => {});
      return;
    }
    if (task === false) { pending = null; return; }
    if (task && typeof task.then === 'function') {
      job.awaiting = true;
      Promise.resolve(task).then(ok => {
        if (pending !== job) return;
        job.awaiting = false;
        // Native actions report whether persistence/encoding succeeded; a settings
        // write (FPS) need not create a Blob before the final generation stage.
        if (ok !== true) pending = null;
        else job.succeeded = true;
        settled();
      }, () => { if (pending === job) { pending = null; blocked(); settled(); } });
      return;
    }
    const next = snapshot();
    if (!pending) return;
    pending.sawBusy ||= next.working;
    // No task was started (for example an unchanged FPS); do not leave saving locked.
    if (!next.working && next.href === pending.before && !pending.sawBusy) pending = null;
  }
  function deliver(state) {
    try { if (save(state.link, state) === false) blocked(); }
    catch (error) { blocked(error); settled(); }
  }
  function advance(state) {
    if (!state.loaded) { choose(); return; }
    if (state.live) {
      if (state.ready && state.matchesFormat !== false && !state.working) deliver(state);
      else start('live', state);
      return;
    }
    if (state.working) return;
    if (state.fpsDirty) { start('fps', state); return; }
    if (state.sizeDirty) { start('size', state); return; }
    if (state.ready && state.matchesFormat !== false) { deliver(state); return; }
    start('convert', state);
  }
  return {
    get pending() { return Boolean(pending); },
    request() { if (!pending) advance(snapshot()); },
    cancel() { pending = null; },
    observe() {
      if (!pending) return;
      const state = snapshot();
      if (state.mode !== pending.mode || state.revision !== pending.revision) { pending = null; return; }
      if (pending.awaiting || state.working) { pending.sawBusy = true; return; }
      if (pending.succeeded && pending.stage === 'fps') { pending = null; stageComplete('fps'); advance(snapshot()); return; }
      if (state.href && state.href !== pending.before) {
        const completed = pending; pending = null;
        if (completed.stage === 'fps' || completed.stage === 'size') {
          stageComplete(completed.stage); advance(snapshot());
        } else if (state.ready && state.matchesFormat) deliver(state);
        else blocked();
      } else if (pending.sawBusy) pending = null; // Error/cancel never saves the old result.
    },
  };
}
