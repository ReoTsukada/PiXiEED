/**
 * Coordinates one explicitly opted-in rewarded-ad attempt.
 * Reward authority comes only from a matching `granted` adapter event after
 * show() returned true. This module has no persistence or ad-network code.
 */
export function createRewardedController({
  createAdapter,
  onChange = () => {},
  timeoutMs = 15_000,
  displayTimeoutMs = 0,
  schedule = setTimeout,
  cancelSchedule = clearTimeout
} = {}) {
  if (typeof createAdapter !== 'function') throw new TypeError('createAdapter must be a function');

  let generation = 0;
  let adapter = null;
  let timer = null;
  let showIssued = false;
  let authorized = false;
  let rewarded = false;
  let closeSeen = false;
  let invokingShow = false;
  let queuedShowEvents = [];
  let disposed = false;
  let state = { phase: 'idle', id: 0, rewarded: false, totalRewards: 0, lastEvent: 'idle', log: [] };

  const snapshot = () => ({ ...state, log: state.log.map(entry => ({ ...entry })) });
  const publish = (phase, event, patch = {}, message = '') => {
    const entry = { attempt: state.id, event, at: Date.now() };
    if (message) entry.message = String(message).slice(0, 240);
    const log = [...state.log, entry].slice(-150);
    state = { ...state, ...patch, phase, lastEvent: event, log };
    try { onChange(snapshot()); } catch { /* UI observers cannot break reward accounting. */ }
  };
  const clearTimer = () => {
    if (timer === null) return;
    try { cancelSchedule(timer); } catch { /* A scheduler failure is handled by the timeout path. */ }
    timer = null;
  };
  const destroyCurrent = ({ invalidate = true } = {}) => {
    clearTimer();
    if (invalidate) generation++;
    const old = adapter;
    adapter = null;
    queuedShowEvents = [];
    invokingShow = false;
    if (old && typeof old.destroy === 'function') {
      try { old.destroy(); } catch { /* Cleanup is best effort; controller stays terminal. */ }
    }
  };
  const isCurrent = token => !disposed && generation === token;

  function terminal(phase, event, message = '') {
    if (disposed) return;
    destroyCurrent();
    publish(phase, event, { error: message || undefined }, message);
  }

  function timeout(token, expectedPhase) {
    if (!isCurrent(token) || state.phase !== expectedPhase) return;
    terminal('error', 'timeout', expectedPhase === 'loading'
      ? '広告の準備が時間内に完了しませんでした。'
      : '広告の再生結果を時間内に受け取れませんでした。');
  }

  function processEvent(token, event) {
    if (!isCurrent(token) || !event || typeof event.type !== 'string') return;
    const { type } = event;
    const message = event.message ? String(event.message).slice(0, 240) : '';

    if (type === 'ready') {
      if (state.phase !== 'loading') return;
      clearTimer();
      publish('ready', type);
      return;
    }
    if (type === 'granted') {
      if (!showIssued || !authorized || rewarded || !['showing', 'granted', 'closed'].includes(state.phase)) return;
      rewarded = true;
      clearTimer();
      const nextPhase = closeSeen ? 'closed' : 'granted';
      publish(nextPhase, type, { rewarded: true, totalRewards: state.totalRewards + 1 });
      return;
    }
    if (type === 'closed') {
      if (!showIssued || closeSeen || !['showing', 'granted'].includes(state.phase)) return;
      closeSeen = true;
      clearTimer();
      publish('closed', type);
      // GPT may report the grant after close. Keep this attempt's listener
      // valid until a retry/cancel/dispose, while releasing the visible slot.
      try { adapter?.close?.(); } catch (error) {
        publish('closed', 'close-error', {}, error?.message || String(error));
      }
      return;
    }
    if (type === 'videoCompleted') {
      if (!showIssued || !['showing', 'granted', 'closed'].includes(state.phase)) return;
      publish(state.phase, type);
      return;
    }
    if (type === 'noFill' || type === 'unsupported') {
      if (showIssued) return;
      terminal(type === 'noFill' ? 'no-fill' : 'unsupported', type, message);
      return;
    }
    if (type === 'error') {
      if (rewarded || closeSeen) {
        publish(state.phase, 'diagnostic-error', {}, message);
        return;
      }
      terminal('error', type, message || '広告の準備または再生に失敗しました。');
    }
  }

  function receive(token, event) {
    if (!isCurrent(token)) return;
    if (invokingShow) { queuedShowEvents.push(event); return; }
    processEvent(token, event);
  }

  function prepare() {
    if (disposed || ['loading', 'ready', 'showing', 'granted'].includes(state.phase)) return Promise.resolve(false);

    destroyCurrent();
    showIssued = false; authorized = false; rewarded = false; closeSeen = false;
    const attemptId = state.id + 1;
    const token = ++generation;
    state = { phase: 'loading', id: attemptId, rewarded: false, totalRewards: state.totalRewards, lastEvent: 'prepare', log: state.log };
    publish('loading', 'prepare');

    try {
      adapter = createAdapter({ emit: event => receive(token, event) });
      if (!adapter || typeof adapter.prepare !== 'function' || typeof adapter.show !== 'function'
        || typeof adapter.close !== 'function' || typeof adapter.destroy !== 'function') {
        terminal('unsupported', 'unsupported', 'この環境ではリワード広告を利用できません。');
        return Promise.resolve(false);
      }
    } catch (error) {
      terminal('error', 'error', error?.message || String(error));
      return Promise.resolve(false);
    }

    try {
      timer = schedule(() => timeout(token, 'loading'), timeoutMs);
    } catch (error) {
      terminal('error', 'error', error?.message || String(error));
      return Promise.resolve(false);
    }

    try {
      Promise.resolve(adapter.prepare()).catch(error => {
        if (isCurrent(token)) terminal('error', 'error', error?.message || String(error));
      });
    } catch (error) {
      if (isCurrent(token)) terminal('error', 'error', error?.message || String(error));
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  function show({ optIn = false } = {}) {
    if (disposed || optIn !== true || state.phase !== 'ready' || !adapter) return false;
    authorized = true;
    showIssued = false;
    closeSeen = false;
    rewarded = false;
    queuedShowEvents = [];
    const token = generation;
    // Set the visible phase before invoking the adapter because it may emit
    // synchronously. Events are held until the adapter confirms acceptance.
    publish('showing', 'show-requested');
    invokingShow = true;
    let accepted = false;
    try { accepted = adapter.show() === true; }
    catch (error) {
      invokingShow = false;
      queuedShowEvents = [];
      terminal('error', 'error', error?.message || String(error));
      return false;
    }
    invokingShow = false;
    if (!isCurrent(token)) { queuedShowEvents = []; return false; }
    if (!accepted) {
      queuedShowEvents = [];
      authorized = false;
      terminal('error', 'show-rejected', '広告を開始できませんでした。');
      return false;
    }
    showIssued = true;
    if (Number.isFinite(displayTimeoutMs) && displayTimeoutMs > 0) {
      try { timer = schedule(() => timeout(token, 'showing'), displayTimeoutMs); }
      catch (error) { terminal('error', 'error', error?.message || String(error)); return false; }
    }
    const events = queuedShowEvents;
    queuedShowEvents = [];
    for (const event of events) processEvent(token, event);
    return true;
  }

  function cancel() {
    if (disposed) return false;
    destroyCurrent();
    showIssued = false; authorized = false; rewarded = false; closeSeen = false;
    publish('cancelled', 'cancel');
    return true;
  }

  function dispose() {
    if (disposed) return;
    destroyCurrent();
    disposed = true;
    showIssued = false; authorized = false; rewarded = false; closeSeen = false;
    publish('disposed', 'dispose');
  }

  return { prepare, show, cancel, dispose, get state() { return snapshot(); } };
}
