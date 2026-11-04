/** Apply a file chooser result through the existing native material API. */
export async function applyMaterialFiles({ api, files, intent, loaded, activeId, targetId, fallback }) {
  const selected = Array.from(files || []);
  if (!selected.length) return false;
  // A source-specific chooser never becomes a workspace-wide import if the source disappears.
  if (intent === 'replace' && targetId && api?.getMaterialState) return api.replaceFiles?.(targetId, selected) ?? false;
  if (!loaded) return fallback?.(selected);
  if (intent === 'add') return api?.addFiles?.(selected) ?? false;
  if (!api?.replaceFiles) return fallback?.(selected);
  if (api.getMaterialState) {
    const id = targetId ?? activeId;
    return id ? api.replaceFiles(id, selected) : false;
  }
  return api.replaceFiles(selected);
}

/** Guard material commands against fresh native state, then forward unchanged to the engine. */
export function createConversionMaterialController({ read, actions = {}, isBusy = () => false } = {}) {
  if (typeof read !== 'function') throw new TypeError('conversion material controller requires a read function');

  const stateForAction = () => {
    const state = read();
    if (!state || typeof state !== 'object' || isBusy() || state.busy) return null;
    return state;
  };
  const assetsFor = state => Array.isArray(state?.assets) ? state.assets : [];

  return Object.freeze({
    select(id) {
      const state = stateForAction();
      if (!state || !assetsFor(state).some(asset => asset?.id === id) || typeof actions.selectAsset !== 'function') return false;
      return actions.selectAsset(id);
    },
    remove(id) {
      const state = stateForAction();
      const asset = assetsFor(state).find(item => item?.id === id);
      if (!state || !asset || asset.canRemove === false || typeof actions.removeAsset !== 'function') return false;
      return actions.removeAsset(id);
    },
    move(id, direction) {
      const state = stateForAction();
      const assets = assetsFor(state), index = assets.findIndex(asset => asset?.id === id);
      if (!state || index < 0 || ![-1, 1].includes(direction) || index + direction < 0 || index + direction >= assets.length || typeof actions.moveAsset !== 'function') return false;
      return actions.moveAsset(id, direction);
    },
    undo() {
      const state = stateForAction();
      if (!state || !state.canUndo || typeof actions.undoRemove !== 'function') return false;
      return actions.undoRemove();
    },
  });
}
