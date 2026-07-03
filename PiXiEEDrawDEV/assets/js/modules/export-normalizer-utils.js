(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportNormalizerUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function normalizeExportGridTileSize(value, fallback = 8) {
    const base = Number.isFinite(Number(fallback)) ? Number(fallback) : 8;
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) {
      return clamp(Math.round(base), EXPORT_GRID_TILE_MIN_SIZE, EXPORT_GRID_TILE_MAX_SIZE);
    }
    return clamp(parsed, EXPORT_GRID_TILE_MIN_SIZE, EXPORT_GRID_TILE_MAX_SIZE);
  }

  function normalizeExportFormat(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'gif') return 'gif';
    if (normalized === 'timelapse') return 'timelapse';
    if (normalized === 'jpeg' || normalized === 'jpg') return 'jpeg';
    if (normalized === 'svg') return 'svg';
    if (normalized === 'voxelpreview' || normalized === 'voxel-preview' || normalized === 'previewpng') return 'voxelpreview';
    if (normalized === 'glb') return 'glb';
    if (normalized === 'spritemap' || normalized === 'sprite-map' || normalized === 'spritesheet' || normalized === 'sprite-sheet') return 'spritemap';
    if (normalized === 'png') return 'png';
    if (normalized === 'gridpng' || normalized === 'grid') return 'gridpng';
    if (normalized === 'project') return 'project';
    return 'png';
  }

  return Object.freeze({
    normalizeExportGridTileSize,
    normalizeExportFormat,
  });
      }
    })(scope);
  }

  root.exportNormalizerUtils = Object.freeze({
    createExportNormalizerUtils,
  });
})();
