(() => {
  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const SYNC_RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/sync_project_dot_count`;
  const FETCH_STATS_RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/get_global_dot_stats`;
  const FETCH_RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/get_global_dot_total`;
  const MAX_PROJECT_ID_LENGTH = 120;
  const HEADER_DOT_TOTAL_ROTATE_MS = 5000;

  const inflightSyncs = new Map();
  const queuedSyncs = new Map();
  const lastSyncedCounts = new Map();
  const RPC_VALUE_KEYS = ['get_global_dot_total', 'sync_project_dot_count', 'total_dots', 'value', 'all_time_total', 'today_total'];

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

  function extractObjectPayload(payload, rawText = '') {
    const resolveCandidate = candidate => {
      if (Array.isArray(candidate) && candidate.length === 1) {
        return resolveCandidate(candidate[0]);
      }
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        if (
          Object.prototype.hasOwnProperty.call(candidate, 'get_global_dot_stats')
          && candidate.get_global_dot_stats
          && typeof candidate.get_global_dot_stats === 'object'
        ) {
          return resolveCandidate(candidate.get_global_dot_stats);
        }
        return candidate;
      }
      if (typeof candidate === 'string' && candidate.trim().startsWith('{')) {
        try {
          return resolveCandidate(JSON.parse(candidate));
        } catch (error) {
          return null;
        }
      }
      return null;
    };
    const fromPayload = resolveCandidate(payload);
    if (fromPayload) {
      return fromPayload;
    }
    if (typeof rawText === 'string' && rawText.trim().startsWith('{')) {
      try {
        return resolveCandidate(JSON.parse(rawText));
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function readBigIntFromObject(source, keys) {
    if (!source || typeof source !== 'object') {
      return null;
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      const resolved = extractBigIntRpcValue(source[key], '');
      if (typeof resolved === 'bigint') {
        return normalizeBigIntCount(resolved);
      }
    }
    return null;
  }

  function readStringFromObject(source, keys) {
    if (!source || typeof source !== 'object') {
      return '';
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  function extractGlobalDotStats(payload, rawText = '') {
    const source = extractObjectPayload(payload, rawText);
    if (!source) {
      return null;
    }
    const allTimeTotal = readBigIntFromObject(source, [
      'all_time_total',
      'allTimeTotal',
      'global_dot_total',
      'total_dots',
      'total',
    ]);
    if (typeof allTimeTotal !== 'bigint') {
      return null;
    }
    const hasTodayTotal = ['today_total', 'todayTotal', 'today_dots']
      .some(key => Object.prototype.hasOwnProperty.call(source, key));
    const todayTotal = hasTodayTotal
      ? (readBigIntFromObject(source, ['today_total', 'todayTotal', 'today_dots']) ?? 0n)
      : 0n;
    return {
      allTimeTotal: normalizeBigIntCount(allTimeTotal),
      todayTotal: normalizeBigIntCount(todayTotal),
      hasTodayTotal,
      todayDateJst: readStringFromObject(source, ['today_date_jst', 'todayDateJst', 'today_date']),
      timezoneLabel: readStringFromObject(source, ['timezone_label', 'timezoneLabel', 'timezone']),
    };
  }

  async function fetchGlobalDotStats() {
    try {
      const rpcResponse = await postRpc(FETCH_STATS_RPC_ENDPOINT, {});
      const stats = extractGlobalDotStats(rpcResponse?.data, rpcResponse?.rawText || '');
      if (stats) {
        return stats;
      }
    } catch (error) {
      console.warn('Failed to load daily world dot stats, falling back to total only', error);
    }
    const total = await fetchGlobalDotTotal();
    return {
      allTimeTotal: total,
      todayTotal: 0n,
      hasTodayTotal: false,
      todayDateJst: '',
      timezoneLabel: 'Asia/Tokyo',
    };
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

  function getDocumentLocale() {
    if (typeof document === 'undefined') {
      return 'en-US';
    }
    const lang = typeof document.documentElement?.lang === 'string'
      ? document.documentElement.lang.trim()
      : '';
    if (!lang) {
      return 'en-US';
    }
    return lang.toLowerCase().startsWith('ja') ? 'ja-JP' : 'en-US';
  }

  function getHeaderDotCopy(locale) {
    const isJapanese = typeof locale === 'string' && locale.toLowerCase().startsWith('ja');
    return {
      label: 'WORLD DOT TOTAL',
      allTimeLabel: isJapanese ? '通算' : 'ALL TIME',
      todayLabel: isJapanese ? '今日' : 'TODAY',
      loadingStatValue: '...',
      unavailableStatValue: '--',
      errorValue: '--',
      loadingTitle: isJapanese ? '世界ドット総数を読み込み中' : 'Loading world dot totals',
      errorTitle: isJapanese ? '世界ドット総数を取得できませんでした' : 'Unable to load world dot totals',
      exactTitlePrefix: isJapanese ? '世界ドット総数' : 'World dot total',
      exactAllTimePrefix: isJapanese ? '通算' : 'All time',
      exactTodayPrefix: isJapanese ? '今日' : 'Today',
      todayResetSuffix: isJapanese ? '日本時間0:00リセット' : 'resets at 00:00 JST',
      unavailableTodayText: isJapanese ? '取得待ち' : 'pending',
    };
  }

  function ensureHeaderDotTotalStyles() {
    if (typeof document === 'undefined' || !document.head) {
      return;
    }
    if (document.getElementById('pixieed-header-dot-total-style')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'pixieed-header-dot-total-style';
    style.textContent = `
      .header-inner.header-dot-total-ready{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
        align-items:center;
        gap:12px;
      }
      .header-inner.header-dot-total-ready .header-slot-left{
        grid-column:1;
        justify-self:start;
        min-width:0;
      }
      .header-inner.header-dot-total-ready .header-slot-left .brand{
        min-width:0;
      }
      .header-inner.header-dot-total-ready .header-slot-left .brand-text{
        min-width:0;
      }
      .header-inner.header-dot-total-ready .header-slot-left .brand-title,
      .header-inner.header-dot-total-ready .header-slot-left .brand-sub{
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .header-inner.header-dot-total-ready .header-slot-right{
        grid-column:3;
        justify-self:end;
        min-width:0;
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:8px;
        flex-wrap:nowrap;
      }
      .header-inner.header-dot-total-ready .header-slot-right > *{
        flex:0 0 auto;
        white-space:nowrap;
      }
      .header-inner.header-dot-total-ready .header-slot-right.header-slot-right--empty{
        min-height:1px;
      }
      .header-inner.header-dot-total-ready .header-dot-total{
        grid-column:2;
        justify-self:center;
        width:clamp(214px, 29vw, 320px);
        max-width:100%;
        min-width:0;
        display:grid;
        gap:2px;
        padding:7px 12px 8px;
        border-radius:999px;
        border:1px solid rgba(126,255,214,0.24);
        background:
          linear-gradient(135deg, rgba(8,35,34,0.92), rgba(11,67,86,0.74)),
          radial-gradient(circle at top left, rgba(126,255,214,0.18), transparent 58%);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);
        text-align:center;
        text-decoration:none;
        color:#f8fffd;
      }
      .header-inner.header-dot-total-ready .header-dot-total__label{
        margin:0;
        font-size:10px;
        line-height:1;
        letter-spacing:0.14em;
        text-transform:uppercase;
        color:#9ae6cf;
        white-space:nowrap;
      }
      .header-inner.header-dot-total-ready .header-dot-total__metric-label{
        margin:0;
        font-size:8px;
        line-height:1;
        letter-spacing:0.12em;
        text-transform:uppercase;
        color:rgba(154,230,207,0.82);
        white-space:nowrap;
      }
      .header-inner.header-dot-total-ready .header-dot-total__metric-value{
        margin:0;
        font-size:clamp(16px, 2.05vw, 20px);
        line-height:1.05;
        font-weight:800;
        color:#f8fffd;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .header-inner.header-dot-total-ready .header-dot-total.is-loading .header-dot-total__metric-value{
        opacity:0.74;
      }
      @media (max-width:760px){
        .header-inner.header-dot-total-ready{
          gap:8px;
          grid-template-columns:minmax(0,1fr) minmax(0, 214px) minmax(0,1fr);
        }
        .header-inner.header-dot-total-ready .header-slot-left .brand{
          gap:8px;
        }
        .header-inner.header-dot-total-ready .header-slot-left .brand-icon{
          width:30px;
          height:30px;
          padding:3px;
          border-radius:9px;
        }
        .header-inner.header-dot-total-ready .header-dot-total{
          width:100%;
          padding:6px 10px 7px;
          border-radius:12px;
        }
        .header-inner.header-dot-total-ready .header-dot-total__label{
          font-size:9px;
          letter-spacing:0.12em;
        }
        .header-inner.header-dot-total-ready .header-dot-total__metric-label{
          font-size:7px;
        }
        .header-inner.header-dot-total-ready .header-dot-total__metric-value{
          font-size:clamp(15px, 3.5vw, 18px);
        }
        .header-inner.header-dot-total-ready .header-slot-right{
          gap:6px;
        }
        .header-inner.header-dot-total-ready .header-slot-right .lang-switch,
        .header-inner.header-dot-total-ready .header-slot-right .support-tip-link,
        .header-inner.header-dot-total-ready .header-slot-right .btn{
          padding:8px 10px !important;
          min-height:38px;
          font-size:11px !important;
        }
      }
      @media (max-width:520px){
        .header-inner.header-dot-total-ready{
          gap:6px;
          grid-template-columns:minmax(0,1fr) minmax(0, 186px) minmax(0,1fr);
        }
        .header-inner.header-dot-total-ready .header-slot-left .brand-title{
          font-size:15px;
        }
        .header-inner.header-dot-total-ready .header-slot-left .brand-sub{
          font-size:11px;
        }
        .header-inner.header-dot-total-ready .header-dot-total__label{
          font-size:8px;
          letter-spacing:0.1em;
        }
        .header-inner.header-dot-total-ready .header-dot-total__metric-label{
          font-size:6px;
          letter-spacing:0.08em;
        }
        .header-inner.header-dot-total-ready .header-dot-total__metric-value{
          font-size:clamp(14px, 4vw, 16px);
        }
        .header-inner.header-dot-total-ready .header-slot-right{
          gap:4px;
        }
        .header-inner.header-dot-total-ready .header-slot-right .lang-switch,
        .header-inner.header-dot-total-ready .header-slot-right .support-tip-link,
        .header-inner.header-dot-total-ready .header-slot-right .btn{
          padding:7px 9px !important;
          min-height:36px;
          font-size:10px !important;
        }
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight{
        gap:6px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-left .brand{
        gap:8px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-left .brand-icon{
        width:30px;
        height:30px;
        padding:3px;
        border-radius:9px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-left .brand-title{
        font-size:15px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-left .brand-sub{
        font-size:11px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-dot-total{
        width:clamp(170px, 25vw, 194px);
        padding:6px 10px 7px;
        border-radius:12px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-dot-total__label,
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-dot-total__metric-label{
        font-size:8px;
        letter-spacing:0.1em;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-dot-total__metric-value{
        font-size:clamp(13px, 1.8vw, 15px);
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-right{
        gap:4px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-right .lang-switch,
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-right .support-tip-link,
      .header-inner.header-dot-total-ready.header-dot-total-tight .header-slot-right .btn{
        padding:7px 9px !important;
        min-height:36px;
        font-size:10px !important;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact{
        gap:4px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-left .brand{
        gap:6px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-left .brand-icon{
        width:28px;
        height:28px;
        padding:3px;
        border-radius:8px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-left .brand-title{
        font-size:14px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-left .brand-sub{
        font-size:10px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-dot-total{
        width:clamp(150px, 21vw, 170px);
        padding:5px 8px 6px;
        border-radius:11px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-dot-total__label,
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-dot-total__metric-label{
        font-size:7px;
        letter-spacing:0.08em;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-dot-total__metric-value{
        font-size:clamp(12px, 1.6vw, 14px);
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-right{
        gap:3px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-right .lang-switch,
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-right .support-tip-link,
      .header-inner.header-dot-total-ready.header-dot-total-compact .header-slot-right .btn{
        padding:6px 8px !important;
        min-height:34px;
        font-size:9px !important;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro{
        gap:3px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-left .brand{
        gap:5px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-left .brand-icon{
        width:26px;
        height:26px;
        padding:2px;
        border-radius:8px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-left .brand-title{
        font-size:13px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-left .brand-sub{
        display:none;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-dot-total{
        width:clamp(128px, 18vw, 142px);
        padding:4px 6px 5px;
        border-radius:10px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-dot-total__label,
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-dot-total__metric-label{
        font-size:6px;
        letter-spacing:0.06em;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-dot-total__metric-value{
        font-size:clamp(11px, 1.4vw, 12px);
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-right{
        gap:2px;
      }
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-right .lang-switch,
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-right .support-tip-link,
      .header-inner.header-dot-total-ready.header-dot-total-micro .header-slot-right .btn{
        padding:5px 7px !important;
        min-height:32px;
        font-size:8px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function updateHeaderDotTotalLayout() {
    if (typeof document === 'undefined') {
      return;
    }
    const headerInners = Array.from(document.querySelectorAll('header .header-inner.header-dot-total-ready'))
      .filter(node => node instanceof HTMLElement);
    headerInners.forEach(headerInner => {
      const left = headerInner.querySelector('.header-slot-left');
      const right = headerInner.querySelector('.header-slot-right');
      const counter = headerInner.querySelector('.header-dot-total');
      if (!(left instanceof HTMLElement) || !(right instanceof HTMLElement) || !(counter instanceof HTMLElement)) {
        return;
      }
      const compactClasses = [
        'header-dot-total-tight',
        'header-dot-total-compact',
        'header-dot-total-micro',
      ];
      headerInner.classList.remove(...compactClasses);
      const viewportWidth = Math.round(Number(window.visualViewport?.width) || Number(window.innerWidth) || 0);
      const hasOverlap = () => {
        const headerRect = headerInner.getBoundingClientRect();
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        const counterRect = counter.getBoundingClientRect();
        if (!headerRect.width || !counterRect.width) {
          return false;
        }
        const overlapMargin = viewportWidth > 0 && viewportWidth <= 520 ? 3 : 6;
        const rightBoundary = right.classList.contains('header-slot-right--empty')
          ? headerRect.right
          : rightRect.left;
        return (
          counterRect.left < leftRect.right + overlapMargin
          || counterRect.right > rightBoundary - overlapMargin
        );
      };
      for (let index = 0; index < compactClasses.length; index += 1) {
        if (!hasOverlap()) {
          return;
        }
        headerInner.classList.add(compactClasses[index]);
      }
    });
  }

  function bindHeaderDotTotalLayoutObserver() {
    if (typeof window === 'undefined' || window.__PIXIEED_HEADER_DOT_TOTAL_LAYOUT_BOUND__) {
      return;
    }
    window.__PIXIEED_HEADER_DOT_TOTAL_LAYOUT_BOUND__ = true;
    let resizeRaf = 0;
    const handleResize = () => {
      if (resizeRaf) {
        window.cancelAnimationFrame(resizeRaf);
      }
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        updateHeaderDotTotalLayout();
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', handleResize, { passive: true });
      window.visualViewport.addEventListener('scroll', handleResize, { passive: true });
    }
  }

  function ensureHeaderDotTotalStructure(headerInner) {
    if (!(headerInner instanceof HTMLElement)) {
      return null;
    }
    const children = Array.from(headerInner.children).filter(node => node instanceof HTMLElement);
    if (!children.length) {
      return null;
    }
    let counter = children.find(node => node.classList.contains('header-dot-total')) || null;
    const contentChildren = children.filter(node => !node.classList.contains('header-dot-total'));
    const left = contentChildren[0] || null;
    let right = contentChildren.length > 1 ? contentChildren[contentChildren.length - 1] : null;
    if (!(left instanceof HTMLElement)) {
      return null;
    }
    left.classList.add('header-slot-left');
    if (!(right instanceof HTMLElement)) {
      right = document.createElement('div');
      right.className = 'header-slot-right header-slot-right--empty';
      right.setAttribute('aria-hidden', 'true');
      headerInner.appendChild(right);
    } else {
      right.classList.add('header-slot-right');
    }
    if (!(counter instanceof HTMLElement)) {
      counter = document.createElement('div');
      counter.className = 'header-dot-total is-loading';
      counter.innerHTML = `
        <span class="header-dot-total__label"></span>
        <span class="header-dot-total__metric-label"></span>
        <span class="header-dot-total__metric-value"></span>
      `;
      headerInner.insertBefore(counter, right);
    } else if (counter.nextElementSibling !== right) {
      headerInner.insertBefore(counter, right);
    }
    headerInner.classList.add('header-dot-total-ready');
    return {
      counter,
      labelNode: counter.querySelector('.header-dot-total__label'),
      metricLabelNode: counter.querySelector('.header-dot-total__metric-label'),
      metricValueNode: counter.querySelector('.header-dot-total__metric-value'),
    };
  }

  function buildHeaderDotTitle(stats, copy, locale) {
    const allTimeExact = formatCount(stats?.allTimeTotal ?? 0n, locale);
    if (stats?.hasTodayTotal) {
      const todayExact = formatCount(stats.todayTotal ?? 0n, locale);
      return `${copy.exactTitlePrefix}: ${copy.exactAllTimePrefix} ${allTimeExact} PX / ${copy.exactTodayPrefix} ${todayExact} PX (${copy.todayResetSuffix})`;
    }
    return `${copy.exactTitlePrefix}: ${copy.exactAllTimePrefix} ${allTimeExact} PX / ${copy.exactTodayPrefix} ${copy.unavailableTodayText} (${copy.todayResetSuffix})`;
  }

  function clearHeaderDotTotalRotation() {
    const intervalId = window.__PIXIEED_HEADER_DOT_TOTAL_ROTATION_ID__;
    if (intervalId) {
      window.clearInterval(intervalId);
      window.__PIXIEED_HEADER_DOT_TOTAL_ROTATION_ID__ = 0;
    }
  }

  function startHeaderDotTotalRotation(instances, metrics, cardTitle) {
    clearHeaderDotTotalRotation();
    if (!Array.isArray(metrics) || !metrics.length) {
      return;
    }
    let activeIndex = 0;
    const applyMetric = () => {
      const metric = metrics[activeIndex] || metrics[0];
      instances.forEach(instance => {
        if (!instance?.counter || !instance.metricLabelNode || !instance.metricValueNode) {
          return;
        }
        instance.metricLabelNode.textContent = metric.label;
        instance.metricValueNode.textContent = metric.value;
        instance.counter.title = cardTitle;
        instance.counter.setAttribute('aria-label', cardTitle);
      });
      updateHeaderDotTotalLayout();
    };
    applyMetric();
    if (metrics.length <= 1) {
      return;
    }
    window.__PIXIEED_HEADER_DOT_TOTAL_ROTATION_ID__ = window.setInterval(() => {
      activeIndex = (activeIndex + 1) % metrics.length;
      applyMetric();
    }, HEADER_DOT_TOTAL_ROTATE_MS);
  }

  async function mountHeaderDotTotal() {
    if (typeof document === 'undefined') {
      return;
    }
    const headerInners = Array.from(document.querySelectorAll('header .header-inner'))
      .filter(node => node instanceof HTMLElement);
    if (!headerInners.length) {
      return;
    }
    ensureHeaderDotTotalStyles();
    const locale = getDocumentLocale();
    const copy = getHeaderDotCopy(locale);
    const instances = headerInners
      .map(ensureHeaderDotTotalStructure)
      .filter(Boolean);
    if (!instances.length) {
      return;
    }
    bindHeaderDotTotalLayoutObserver();
    instances.forEach(instance => {
      if (
        !instance?.counter
        || !instance.labelNode
        || !instance.metricLabelNode
        || !instance.metricValueNode
      ) {
        return;
      }
      instance.labelNode.textContent = copy.label;
      instance.metricLabelNode.textContent = copy.allTimeLabel;
      instance.metricValueNode.textContent = copy.loadingStatValue;
      instance.counter.classList.add('is-loading');
      instance.counter.title = copy.loadingTitle;
      instance.counter.setAttribute('aria-label', copy.loadingTitle);
    });
    updateHeaderDotTotalLayout();
    try {
      const stats = await fetchGlobalDotStats();
      const metrics = [
        {
          label: copy.allTimeLabel,
          value: `${formatCompactCount(stats.allTimeTotal, locale)} PX`,
        },
      ];
      if (stats.hasTodayTotal) {
        metrics.push({
          label: copy.todayLabel,
          value: `${formatCompactCount(stats.todayTotal, locale)} PX`,
        });
      } else {
        metrics.push({
          label: copy.todayLabel,
          value: copy.unavailableStatValue,
        });
      }
      const cardTitle = buildHeaderDotTitle(stats, copy, locale);
      instances.forEach(instance => {
        if (
          !instance?.counter
          || !instance.labelNode
          || !instance.metricLabelNode
          || !instance.metricValueNode
        ) {
          return;
        }
        instance.labelNode.textContent = copy.label;
        instance.counter.classList.remove('is-loading');
      });
      startHeaderDotTotalRotation(instances, metrics, cardTitle);
    } catch (error) {
      console.warn('Failed to load world dot total', error);
      clearHeaderDotTotalRotation();
      instances.forEach(instance => {
        if (!instance?.counter || !instance.metricLabelNode || !instance.metricValueNode) {
          return;
        }
        instance.metricLabelNode.textContent = copy.allTimeLabel;
        instance.metricValueNode.textContent = copy.errorValue;
        instance.counter.title = copy.errorTitle;
        instance.counter.setAttribute('aria-label', copy.errorTitle);
        instance.counter.classList.remove('is-loading');
      });
      updateHeaderDotTotalLayout();
    }
  }

  function autoMountHeaderDotTotal() {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        mountHeaderDotTotal();
      }, { once: true });
      return;
    }
    mountHeaderDotTotal();
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
    fetchGlobalDotStats,
    formatCount,
    formatCompactCount,
    mountHeaderDotTotal,
  };
  autoMountHeaderDotTotal();
})();
