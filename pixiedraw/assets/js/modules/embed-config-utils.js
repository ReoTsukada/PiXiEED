(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createEmbedConfigUtils(rawScope = {}) {
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
  function parseEmbedConfig() {
    const raw =
      typeof window !== 'undefined' &&
      window.PIXIEEDRAW_EMBED_CONFIG &&
      typeof window.PIXIEEDRAW_EMBED_CONFIG === 'object' &&
      !Array.isArray(window.PIXIEEDRAW_EMBED_CONFIG)
        ? { ...window.PIXIEEDRAW_EMBED_CONFIG }
        : {};

    let params = null;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (error) {
      params = null;
    }

    const normalizeDim = value => {
      const num = Math.round(Number(value));
      return Number.isFinite(num) ? clamp(num, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE) : null;
    };

    const setDim = (key, value) => {
      const dim = normalizeDim(value);
      if (dim !== null) {
        raw[key] = dim;
      }
    };

    if (params) {
      const sizeParam = params.get('size');
      if (sizeParam && /^\d+x\d+$/i.test(sizeParam)) {
        const [w, h] = sizeParam.toLowerCase().split('x');
        setDim('initialWidth', w);
        setDim('initialHeight', h);
      }
      setDim('initialWidth', params.get('width') ?? params.get('w'));
      setDim('initialHeight', params.get('height') ?? params.get('h'));
      const lockParam = params.get('lockSize') ?? params.get('lockCanvas') ?? params.get('lock');
      if (lockParam === '1' || lockParam === 'true') {
        raw.lockCanvasSize = true;
      }
      const skipParam = params.get('skipStartup') ?? params.get('embed');
      if (skipParam === '1' || skipParam === 'true') {
        raw.skipStartup = true;
      }
      const nameParam = params.get('name') ?? params.get('title');
      if (nameParam) {
        raw.documentName = nameParam;
      }
    }

    const normalizedWidth = normalizeDim(raw.initialWidth ?? raw.width);
    const normalizedHeight = normalizeDim(raw.initialHeight ?? raw.height ?? normalizedWidth);

    const normalized = {};
    if (normalizedWidth !== null) {
      normalized.initialWidth = normalizedWidth;
    }
    if (normalizedHeight !== null) {
      normalized.initialHeight = normalizedHeight;
    }
    if (typeof raw.documentName === 'string') {
      normalized.documentName = raw.documentName.trim();
    }
    if (raw.lockCanvasSize === 'true') {
      normalized.lockCanvasSize = true;
    } else if (typeof raw.lockCanvasSize === 'boolean') {
      normalized.lockCanvasSize = raw.lockCanvasSize;
    }
    if (raw.skipStartup === 'true') {
      normalized.skipStartup = true;
    } else if (typeof raw.skipStartup === 'boolean') {
      normalized.skipStartup = raw.skipStartup;
    }
    return normalized;
  }

  return Object.freeze({
    parseEmbedConfig,
  });
      }
    })(scope);
  }

  root.embedConfigUtils = Object.freeze({
    createEmbedConfigUtils,
  });
})();
