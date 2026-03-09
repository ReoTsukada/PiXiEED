(() => {
  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const SYNC_RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/sync_project_dot_count`;
  const FETCH_RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/get_global_dot_total`;
  const MAX_PROJECT_ID_LENGTH = 120;

  const inflightSyncs = new Map();
  const queuedSyncs = new Map();
  const lastSyncedCounts = new Map();
  const RPC_VALUE_KEYS = ['get_global_dot_total', 'sync_project_dot_count', 'total_dots', 'value'];

  function normalizeDotCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.round(parsed));
  }

  function normalizeBigIntCount(value) {
    if (typeof value === 'bigint') {
      return value < 0n ? 0n : value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return 0n;
      }
      return BigInt(Math.max(0, Math.round(value)));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || !/^-?\d+$/.test(trimmed)) {
        return 0n;
      }
      try {
        const parsed = BigInt(trimmed);
        return parsed < 0n ? 0n : parsed;
      } catch (error) {
        return 0n;
      }
    }
    return 0n;
  }

  function clampProjectId(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.slice(0, MAX_PROJECT_ID_LENGTH);
  }

  function createProjectId(prefix = 'pixieed') {
    const safePrefix = clampProjectId(prefix) || 'pixieed';
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${safePrefix}-${crypto.randomUUID()}`;
    }
    return `${safePrefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function normalizeFrameDotEntry(entry, index) {
    if (!entry || typeof entry !== 'object') {
      return {
        frameId: `frame-${index + 1}`,
        name: `Frame ${index + 1}`,
        dotCount: 0,
      };
    }
    return {
      frameId: clampProjectId(typeof entry.frameId === 'string' ? entry.frameId : `frame-${index + 1}`) || `frame-${index + 1}`,
      name: typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim()
        : `Frame ${index + 1}`,
      dotCount: normalizeDotCount(entry.dotCount ?? entry.totalDots ?? entry.total),
    };
  }

  function normalizeDotStats(stats) {
    if (!stats || typeof stats !== 'object') {
      return null;
    }
    const totalDots = normalizeDotCount(stats.totalDots ?? stats.total);
    const sourceFrames = Array.isArray(stats.frameDots)
      ? stats.frameDots
      : (Array.isArray(stats.frames) ? stats.frames : []);
    const frameDots = sourceFrames.map((entry, index) => normalizeFrameDotEntry(entry, index));
    return {
      totalDots,
      frameDots,
    };
  }

  function getPaletteAlpha(palette, index) {
    if (!Array.isArray(palette) || index < 0 || index >= palette.length) {
      return 0;
    }
    const color = palette[index];
    if (!color || typeof color !== 'object') {
      return 0;
    }
    return normalizeDotCount(color.a);
  }

  function countLayerDots(layer, pixelCount, palette) {
    if (!layer || typeof layer !== 'object' || pixelCount <= 0) {
      return 0;
    }
    const indices = layer.indices instanceof Int16Array && layer.indices.length >= pixelCount
      ? layer.indices
      : null;
    const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= pixelCount * 4
      ? layer.direct
      : null;
    if (!indices && !direct) {
      return 0;
    }
    let total = 0;
    for (let i = 0; i < pixelCount; i += 1) {
      const paletteIndex = indices ? indices[i] : -1;
      const paletteAlpha = paletteIndex >= 0 ? getPaletteAlpha(palette, paletteIndex) : 0;
      const directAlpha = direct ? normalizeDotCount(direct[(i * 4) + 3]) : 0;
      if (paletteAlpha > 0 || directAlpha > 0) {
        total += 1;
      }
    }
    return total;
  }

  function countEditorSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { totalDots: 0, frameDots: [] };
    }
    const width = Math.max(1, Math.floor(Number(snapshot.width) || 0));
    const height = Math.max(1, Math.floor(Number(snapshot.height) || 0));
    const pixelCount = width * height;
    const palette = Array.isArray(snapshot.palette) ? snapshot.palette : [];
    const frames = Array.isArray(snapshot.frames) ? snapshot.frames : [];
    const frameDots = [];
    let totalDots = 0;
    frames.forEach((frame, index) => {
      if (!frame || !Array.isArray(frame.layers)) {
        return;
      }
      let frameTotal = 0;
      frame.layers.forEach(layer => {
        frameTotal += countLayerDots(layer, pixelCount, palette);
      });
      frameDots.push({
        frameId: clampProjectId(typeof frame.id === 'string' ? frame.id : `frame-${index + 1}`) || `frame-${index + 1}`,
        name: typeof frame.name === 'string' && frame.name.trim()
          ? frame.name.trim()
          : `Frame ${index + 1}`,
        dotCount: frameTotal,
      });
      totalDots += frameTotal;
    });
    return {
      totalDots,
      frameDots,
    };
  }

  function countImageData(imageData, options = {}) {
    const data = imageData?.data instanceof Uint8ClampedArray ? imageData.data : null;
    const width = Math.max(1, Math.floor(Number(imageData?.width) || 0));
    const height = Math.max(1, Math.floor(Number(imageData?.height) || 0));
    if (!data || data.length < width * height * 4) {
      return {
        totalDots: 0,
        frameDots: [{
          frameId: 'frame-1',
          name: typeof options.frameName === 'string' && options.frameName.trim()
            ? options.frameName.trim()
            : 'Canvas',
          dotCount: 0,
        }],
      };
    }
    let totalDots = 0;
    for (let base = 3; base < data.length; base += 4) {
      if (data[base] > 0) {
        totalDots += 1;
      }
    }
    return {
      totalDots,
      frameDots: [{
        frameId: clampProjectId(typeof options.frameId === 'string' ? options.frameId : 'frame-1') || 'frame-1',
        name: typeof options.frameName === 'string' && options.frameName.trim()
          ? options.frameName.trim()
          : 'Canvas',
        dotCount: totalDots,
      }],
    };
  }

  async function postRpc(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload || {}),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `RPC failed (${response.status})`);
    }
    const rawText = await response.text().catch(() => '');
    let data = null;
    if (typeof rawText === 'string' && rawText.trim()) {
      try {
        data = JSON.parse(rawText);
      } catch (error) {
        data = rawText;
      }
    }
    return { data, rawText };
  }

  function extractNumericRpcValue(payload) {
    if (typeof payload === 'number' && Number.isFinite(payload)) {
      return Math.round(payload);
    }
    if (typeof payload === 'string' && payload.trim()) {
      const parsed = Number(payload);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed);
      }
    }
    if (Array.isArray(payload) && payload.length === 1) {
      return extractNumericRpcValue(payload[0]);
    }
    if (payload && typeof payload === 'object') {
      for (let index = 0; index < RPC_VALUE_KEYS.length; index += 1) {
        const key = RPC_VALUE_KEYS[index];
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          const resolved = extractNumericRpcValue(payload[key]);
          if (Number.isFinite(resolved)) {
            return resolved;
          }
        }
      }
    }
    return null;
  }

  function extractBigIntValueFromRawText(rawText) {
    if (typeof rawText !== 'string') {
      return null;
    }
    const trimmed = rawText.trim();
    if (!trimmed) {
      return null;
    }
    if (/^-?\d+$/.test(trimmed)) {
      return normalizeBigIntCount(trimmed);
    }
    const quotedMatch = trimmed.match(/^"(-?\d+)"$/);
    if (quotedMatch && quotedMatch[1]) {
      return normalizeBigIntCount(quotedMatch[1]);
    }
    for (let index = 0; index < RPC_VALUE_KEYS.length; index += 1) {
      const key = RPC_VALUE_KEYS[index];
      const pattern = new RegExp(`"${key}"\\s*:\\s*(?:"(-?\\\\d+)"|(-?\\\\d+))`);
      const match = trimmed.match(pattern);
      const value = match?.[1] || match?.[2] || '';
      if (value) {
        return normalizeBigIntCount(value);
      }
    }
    const scalarArrayMatch = trimmed.match(/^\[\s*(?:"(-?\d+)"|(-?\d+))\s*\]$/);
    if (scalarArrayMatch) {
      return normalizeBigIntCount(scalarArrayMatch[1] || scalarArrayMatch[2] || '0');
    }
    return null;
  }

  function extractBigIntRpcValue(payload, rawText = '') {
    const fromRawText = extractBigIntValueFromRawText(rawText);
    if (typeof fromRawText === 'bigint') {
      return fromRawText;
    }
    const fromPayload = (() => {
      if (typeof payload === 'bigint') {
        return normalizeBigIntCount(payload);
      }
      if (typeof payload === 'number' && Number.isFinite(payload)) {
        return normalizeBigIntCount(payload);
      }
      if (typeof payload === 'string' && payload.trim()) {
        if (/^-?\d+$/.test(payload.trim())) {
          return normalizeBigIntCount(payload.trim());
        }
      }
      if (Array.isArray(payload) && payload.length === 1) {
        return extractBigIntRpcValue(payload[0], rawText);
      }
      if (payload && typeof payload === 'object') {
        for (let index = 0; index < RPC_VALUE_KEYS.length; index += 1) {
          const key = RPC_VALUE_KEYS[index];
          if (Object.prototype.hasOwnProperty.call(payload, key)) {
            const resolved = extractBigIntRpcValue(payload[key], rawText);
            if (typeof resolved === 'bigint') {
              return resolved;
            }
          }
        }
      }
      return null;
    })();
    return typeof fromPayload === 'bigint' ? fromPayload : null;
  }

  async function flushProjectSync(queueKey, projectId, app) {
    let latestResult = null;
    while (queuedSyncs.has(queueKey)) {
      const dotCount = queuedSyncs.get(queueKey);
      queuedSyncs.delete(queueKey);
      if (lastSyncedCounts.get(queueKey) === dotCount) {
        continue;
      }
      const payload = {
        p_project_id: projectId,
        p_dot_count: normalizeDotCount(dotCount),
        p_app: typeof app === 'string' && app.trim() ? app.trim() : 'pixieed',
      };
      const rpcResponse = await postRpc(SYNC_RPC_ENDPOINT, payload);
      lastSyncedCounts.set(queueKey, payload.p_dot_count);
      latestResult = extractNumericRpcValue(rpcResponse?.data);
    }
    inflightSyncs.delete(queueKey);
    return latestResult;
  }

  function syncProjectDotCount({ projectId, dotCount, app = 'pixieed' } = {}) {
    const normalizedProjectId = clampProjectId(projectId);
    const normalizedCount = normalizeDotCount(dotCount);
    const normalizedApp = typeof app === 'string' && app.trim() ? app.trim() : 'pixieed';
    if (!normalizedProjectId) {
      return Promise.resolve(null);
    }
    const queueKey = `${normalizedApp}:${normalizedProjectId}`;
    queuedSyncs.set(queueKey, normalizedCount);
    if (inflightSyncs.has(queueKey)) {
      return inflightSyncs.get(queueKey);
    }
    const promise = flushProjectSync(queueKey, normalizedProjectId, normalizedApp).catch(error => {
      inflightSyncs.delete(queueKey);
      console.warn('Failed to sync project dot count', error);
      return null;
    });
    inflightSyncs.set(queueKey, promise);
    return promise;
  }

  async function fetchGlobalDotTotal() {
    const rpcResponse = await postRpc(FETCH_RPC_ENDPOINT, {});
    const total = extractBigIntRpcValue(rpcResponse?.data, rpcResponse?.rawText || '');
    return normalizeBigIntCount(total);
  }

  function formatCount(value, locale = undefined) {
    const normalized = normalizeBigIntCount(value);
    try {
      return new Intl.NumberFormat(locale || undefined).format(normalized);
    } catch (error) {
      return String(normalized);
    }
  }

  function formatCompactCount(value, locale = 'en-US') {
    const normalized = normalizeBigIntCount(value);
    const isJapanese = typeof locale === 'string' && locale.toLowerCase().startsWith('ja');
    const units = isJapanese
      ? [
        { value: 100000000000000000000n, suffix: '垓' },
        { value: 10000000000000000n, suffix: '京' },
        { value: 1000000000000n, suffix: '兆' },
        { value: 100000000n, suffix: '億' },
        { value: 10000n, suffix: '万' },
      ]
      : [
        { value: 1000000000000000n, suffix: 'Q' },
        { value: 1000000000000n, suffix: 'T' },
        { value: 1000000000n, suffix: 'B' },
        { value: 1000000n, suffix: 'M' },
        { value: 1000n, suffix: 'K' },
      ];
    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      if (normalized < unit.value) {
        continue;
      }
      const whole = normalized / unit.value;
      const remainder = normalized % unit.value;
      const decimalDigit = Number((remainder * 10n) / unit.value);
      if (whole >= 100n || decimalDigit <= 0) {
        return `${formatCount(whole, locale)}${unit.suffix}`;
      }
      return `${formatCount(whole, locale)}.${decimalDigit}${unit.suffix}`;
    }
    return formatCount(normalized, locale);
  }

  window.PiXiEEDDotStats = {
    SUPABASE_URL,
    normalizeDotStats,
    normalizeDotCount,
    normalizeBigIntCount,
    createProjectId,
    countEditorSnapshot,
    countImageData,
    syncProjectDotCount,
    fetchGlobalDotTotal,
    formatCount,
    formatCompactCount,
  };
})();
