export const ASYNC_STATES = Object.freeze([
  'initial', 'loading', 'ready', 'empty', 'saving', 'saved', 'offline', 'reconnecting',
  'degraded', 'permission-denied', 'session-expired', 'conflict', 'recoverable-error',
  'fatal-error', 'unsupported-version', 'unavailable', 'rollback-recovery-available',
]);

const TRANSITIONS = Object.freeze({
  initial: ['loading', 'ready', 'empty', 'permission-denied', 'session-expired', 'unavailable'],
  loading: ['ready', 'empty', 'offline', 'degraded', 'permission-denied', 'session-expired', 'recoverable-error', 'fatal-error', 'unsupported-version', 'unavailable'],
  ready: ['saving', 'offline', 'reconnecting', 'degraded', 'permission-denied', 'session-expired', 'conflict', 'unavailable'],
  empty: ['loading', 'saving', 'offline', 'permission-denied', 'unavailable'],
  saving: ['saved', 'ready', 'offline', 'reconnecting', 'conflict', 'recoverable-error', 'fatal-error', 'session-expired'],
  saved: ['ready', 'offline', 'reconnecting', 'degraded', 'conflict'],
  offline: ['reconnecting', 'ready', 'saving', 'rollback-recovery-available', 'fatal-error'],
  reconnecting: ['ready', 'offline', 'degraded', 'conflict', 'session-expired', 'recoverable-error'],
  degraded: ['ready', 'reconnecting', 'offline', 'recoverable-error', 'fatal-error'],
  'permission-denied': ['ready', 'session-expired', 'unavailable'],
  'session-expired': ['loading', 'ready', 'offline', 'rollback-recovery-available'],
  conflict: ['ready', 'saving', 'offline', 'rollback-recovery-available', 'fatal-error'],
  'recoverable-error': ['loading', 'ready', 'offline', 'reconnecting', 'rollback-recovery-available', 'fatal-error'],
  'fatal-error': ['rollback-recovery-available', 'loading', 'unavailable'],
  'unsupported-version': ['loading', 'unavailable', 'rollback-recovery-available'],
  unavailable: ['loading', 'ready', 'rollback-recovery-available'],
  'rollback-recovery-available': ['loading', 'ready', 'offline', 'unavailable'],
});

export const ASYNC_RECOVERY_CONTRACT = Object.freeze({
  preserveLocalInput: true,
  preserveUnsyncedOperations: true,
  offlineIsNotSaved: true,
  permissionDeniedIsNotFound: false,
  criticalErrorNeedsPersistentSurface: true,
  liveRegionDeduplicated: true,
});

export function canTransition(from, to) {
  return ASYNC_STATES.includes(from) && ASYNC_STATES.includes(to) && (from === to || TRANSITIONS[from].includes(to));
}

export function createAsyncStateMachine(initial = 'initial') {
  let current = ASYNC_STATES.includes(initial) ? initial : 'initial';
  const history = [{ state: current, metadata: {} }];
  return Object.freeze({
    getState: () => current,
    history: () => history.map((entry) => ({ ...entry, metadata: { ...entry.metadata } })),
    canTransition: (next) => canTransition(current, next),
    transition(next, metadata = {}) {
      const target = String(next);
      if (!ASYNC_STATES.includes(target)) return { ok: false, code: 'ASYNC_STATE_UNKNOWN', state: current };
      if (!canTransition(current, target)) return { ok: false, code: 'ASYNC_TRANSITION_INVALID', state: current, requested: target };
      current = target;
      history.push({ state: current, metadata: { ...metadata } });
      return { ok: true, state: current, metadata: { ...metadata } };
    },
  });
}

export function createLiveRegionDeduper() {
  const seen = new Set();
  return Object.freeze({
    announce({ state, message } = {}) {
      const key = `${String(state || '')}:${String(message || '')}`;
      if (!message || seen.has(key)) return null;
      seen.add(key);
      return { state: String(state || ''), message: String(message) };
    },
    clear() { seen.clear(); },
    size: () => seen.size,
  });
}

export function createErrorSummary({ code = 'CORE_ERROR', message = '処理に失敗しました。', fieldErrors = [], recoverable = false, actions = [] } = {}) {
  return {
    code: String(code),
    message: String(message),
    fieldErrors: fieldErrors.filter((entry) => entry?.fieldId && entry?.message).map((entry) => ({ fieldId: String(entry.fieldId), message: String(entry.message) })),
    recoverable: recoverable === true,
    actions: actions.filter((action) => action?.id && action?.label).map((action) => ({ id: String(action.id), label: String(action.label) })),
  };
}

export function getAsyncStatePresentation(state) {
  const labels = {
    initial: ['初期化', 'loading'], loading: ['読み込み中', 'loading'], ready: ['準備完了', 'success'],
    empty: ['空です', 'neutral'], saving: ['保存中', 'loading'], saved: ['保存済み', 'success'],
    offline: ['Offline', 'warning'], reconnecting: ['再接続中', 'loading'], degraded: ['一部制限', 'warning'],
    'permission-denied': ['権限がありません', 'danger'], 'session-expired': ['Session期限切れ', 'danger'],
    conflict: ['競合', 'danger'], 'recoverable-error': ['復旧可能なError', 'danger'],
    'fatal-error': ['復旧が必要なError', 'danger'], 'unsupported-version': ['Version非対応', 'danger'],
    unavailable: ['Unavailable', 'neutral'], 'rollback-recovery-available': ['復旧可能', 'info'],
  };
  const [label, tone] = labels[state] || labels.initial;
  return { state, label, tone };
}
