const unavailableSnapshot = () => Object.freeze({
  available: false,
  mode: undefined,
  value: undefined,
  disabled: true,
  options: Object.freeze([]),
});

function copySnapshot(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.options)) {
    return unavailableSnapshot();
  }

  const options = state.options.map(option => Object.freeze({
    value: option?.value,
    label: option?.label,
    disabled: Boolean(option?.disabled),
    ...(Object.hasOwn(option ?? {}, 'group') ? { group: option.group } : {}),
  }));

  return Object.freeze({
    available: true,
    mode: state.mode,
    value: state.value,
    disabled: Boolean(state.disabled),
    options: Object.freeze(options),
  });
}

/**
 * Keeps format choices synchronized with an authoritative native bridge.
 * `read` returns a plain state snapshot or null when the bridge is unavailable.
 */
export function createConversionFormatController({ read, write } = {}) {
  if (typeof read !== 'function') {
    throw new TypeError('conversion format controller requires a read function');
  }

  return Object.freeze({
    snapshot({ busy = false } = {}) {
      if (busy) {
        const state = copySnapshot(read());
        if (!state.available) return state;
        return Object.freeze({ ...state, disabled: true });
      }
      return copySnapshot(read());
    },

    choose(value, { busy = false } = {}) {
      if (busy || typeof write !== 'function') return false;

      const state = copySnapshot(read());
      if (!state.available || state.disabled || value === state.value) return false;
      if (!state.options.some(option => option.value === value && !option.disabled)) return false;

      write(value);
      return true;
    },
  });
}
