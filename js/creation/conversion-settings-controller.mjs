/** Present changed output settings as independent reset actions. */
export function changedSettingChips(current, baseline) {
  if (!baseline) return [];
  const result = [];
  const add = (id, label, resetLabel, keys) => result.push({ id, label, resetLabel, keys });
  if (current.width && current.height && baseline.width && baseline.height && (current.width !== baseline.width || current.height !== baseline.height))
    add('size', `${current.width} × ${current.height}px`, `サイズを${baseline.width} × ${baseline.height}pxに戻す`, ['width', 'height']);
  for (const [key, title, suffix] of [['quality','画質','%'], ['rate','速度','倍'], ['fps','FPS',''], ['threshold','白黒しきい値',''], ['loop','再生','回'], ['bits','音声','bit'], ['background','背景','']]) {
    if (current[key] !== undefined && baseline[key] !== undefined && current[key] !== baseline[key])
      add(key, key === 'loop' && current[key] === '0' ? 'ずっと再生' : `${title} ${current[key]}${suffix}`, `${title}だけを${baseline[key]}${suffix}に戻す`, [key]);
  }
  return result;
}

/** Baselines follow an output item; adding/removing inputs never resets edited settings. */
export function createSettingBaselineTracker() {
  const contexts = new Map();
  return {
    read({ ids = [], context = 'inputs', values, replaced = false, retainEmpty = false }) {
      if (!ids.length) { const previous = contexts.get(context); if (!retainEmpty) contexts.delete(context); return retainEmpty ? previous?.values || null : null; }
      const previous = contexts.get(context);
      if (!previous || replaced || !ids.some(id => previous.ids.includes(id))) {
        contexts.set(context, { ids: [...ids], values: { ...values } });
      } else previous.ids = [...ids];
      return contexts.get(context).values;
    },
  };
}

/** Coordinate atomic settings resets without owning fields or their state. */
export function createConversionSettingsController({ read, write, isBusy = () => false }) {
  return {
    snapshot({ visibleOnly = true } = {}) {
      const state = read({ visibleOnly }) || {};
      return Object.fromEntries(Object.entries(state).filter(([, field]) => !visibleOnly || field.visible).map(([key, field]) => [key, {
        value: field.value, disabled: Boolean(field.disabled), visible: Boolean(field.visible),
      }]));
    },
    reset(keys, baseline) {
      if (isBusy() || !baseline || !Array.isArray(keys) || keys.length === 0) return false;
      const state = read({ visibleOnly: false }) || {};
      const batch = {};
      for (const key of keys) {
        const field = state[key];
        if (!field || field.disabled || !Object.hasOwn(baseline, key) || baseline[key] === undefined) return false;
        batch[key] = baseline[key];
      }
      return write(batch) !== false;
    },
  };
}
