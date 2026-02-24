const MULTI_SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
const MULTI_SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
const MULTI_SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const MULTI_PUBLIC_LOBBY_CHANNEL = 'pixiedraw-public-rooms-v1';
const PUBLIC_LOBBY_SYNC_THROTTLE_MS = 2400;
const PUBLIC_LOBBY_THUMBNAIL_MAX_EDGE = 128;
const PUBLIC_LOBBY_THUMBNAIL_MAX_DATA_URL_LENGTH = 180000;

const PIXIEED_NICKNAME_STORAGE_KEY = 'pixieed_nickname';
const DEFAULT_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#4cd964', '#34c759', '#007aff', '#5856d6', '#af52de'];
const BRUSH_SIZE_OPTIONS = [1, 2, 3, 4, 6];
const OWNER_LOCKED = '__locked__';
const ROOM_STATE_EVENT = 'room-state';
const ROOM_STATE_REQUEST_EVENT = 'room-state-request';
const DRAW_EVENT = 'draw';
const STATUS_REQUEST_EVENT = 'status-request';
const STATUS_RESPONSE_EVENT = 'status-response';
const SNAPSHOT_REQUEST_RETRY_MS = 1200;
const CUSTOM_PALETTE_STORAGE_PREFIX = 'pixieed:resident-palette-custom:';
const PALETTE_ZOOM_STORAGE_PREFIX = 'pixieed:resident-palette-zoom:';
const MAX_CUSTOM_PALETTE_COLORS = 24;
const PALETTE_ZOOM_MIN = 80;
const PALETTE_ZOOM_MAX = 220;
const PALETTE_ZOOM_DEFAULT = 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeChannelName(input, fallback) {
  const raw = String(input || '').trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 80);
  return normalized || fallback;
}

function normalizeProjectKey(input, fallback = '') {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : '';
  const normalized = raw.replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (normalized) return normalized;
  const fallbackRaw = typeof fallback === 'string' ? fallback.trim().toLowerCase() : '';
  return fallbackRaw.replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function normalizeDisplayName(value, fallback = 'ゲスト') {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw) return raw.slice(0, 32);
  return fallback;
}

function readLocalNickname() {
  try {
    const stored = window.localStorage.getItem(PIXIEED_NICKNAME_STORAGE_KEY);
    return normalizeDisplayName(stored || '', '');
  } catch (error) {
    return '';
  }
}

function shortClientId(clientId) {
  const raw = String(clientId || '').trim();
  if (!raw) return 'unknown';
  return raw.length <= 8 ? raw : raw.slice(0, 8);
}

function normalizeHexColor(input, fallback = '#ffffff') {
  const raw = String(input || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    const [r, g, b] = raw.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function normalizeBrushSize(value, fallback = 1) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return clamp(Math.round(Number(fallback) || 1), 1, 12);
  }
  return clamp(parsed, 1, 12);
}

function uniqueClientList(values, allowedSet = null) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const output = [];
  for (let i = 0; i < values.length; i += 1) {
    const clientId = typeof values[i] === 'string' ? values[i].trim() : '';
    if (!clientId || seen.has(clientId)) continue;
    if (allowedSet && !allowedSet.has(clientId)) continue;
    seen.add(clientId);
    output.push(clientId);
  }
  return output;
}

function sameClientArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameSeatMap(a, b) {
  const aKeys = Object.keys(a || {}).sort();
  const bKeys = Object.keys(b || {}).sort();
  if (!sameClientArray(aKeys, bKeys)) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i];
    if (Number(a[key]) !== Number(b[key])) return false;
  }
  return true;
}

function stateEquals(a, b) {
  if (!a || !b) return false;
  return a.leaderId === b.leaderId
    && sameClientArray(a.activeIds, b.activeIds)
    && sameClientArray(a.queueIds, b.queueIds)
    && sameSeatMap(a.seatMap, b.seatMap);
}

function buildSeatRect(seatIndex, cellSize, canvasWidth, canvasHeight) {
  const cols = Math.max(1, Math.floor(canvasWidth / cellSize));
  const rows = Math.max(1, Math.floor(canvasHeight / cellSize));
  const maxSeat = cols * rows - 1;
  const normalizedSeat = clamp(Math.floor(Number(seatIndex) || 0), 0, maxSeat);
  const col = normalizedSeat % cols;
  const row = Math.floor(normalizedSeat / cols);
  return {
    x: col * cellSize,
    y: row * cellSize,
    w: cellSize,
    h: cellSize,
    col,
    row,
  };
}

function pointInRect(point, rect) {
  if (!rect) return false;
  return point.x >= rect.x
    && point.y >= rect.y
    && point.x < rect.x + rect.w
    && point.y < rect.y + rect.h;
}

function createClientId(prefix = 'resident') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function startResidentRoom(rawConfig = {}) {
  const config = {
    roomId: typeof rawConfig.roomId === 'string' ? rawConfig.roomId : 'resident-room',
    title: typeof rawConfig.title === 'string' ? rawConfig.title : '常駐ルーム',
    description: typeof rawConfig.description === 'string' ? rawConfig.description : '',
    defaultChannel: typeof rawConfig.defaultChannel === 'string' ? rawConfig.defaultChannel : 'resident-room-main',
    width: clamp(Math.round(Number(rawConfig.width) || 128), 32, 1024),
    height: clamp(Math.round(Number(rawConfig.height) || 128), 32, 1024),
    maxUsers: clamp(Math.round(Number(rawConfig.maxUsers) || 8), 1, 32),
    mode: rawConfig.mode === 'fixed-cell' ? 'fixed-cell' : 'free-no-overwrite',
    cellSize: clamp(Math.round(Number(rawConfig.cellSize) || 32), 8, 256),
  };

  const params = new URLSearchParams(window.location.search);
  const channelName = normalizeChannelName(params.get('room'), config.defaultChannel);
  const projectKey = normalizeProjectKey(channelName, config.defaultChannel || config.roomId);
  const clientId = createClientId(config.roomId);
  const localNickname = readLocalNickname();
  const localName = normalizeDisplayName(localNickname, shortClientId(clientId));
  const joinedAt = Date.now();
  const paletteStorageKey = `${CUSTOM_PALETTE_STORAGE_PREFIX}${projectKey || config.roomId}`;
  const paletteZoomStorageKey = `${PALETTE_ZOOM_STORAGE_PREFIX}${projectKey || config.roomId}`;

  const roomTitleEl = document.getElementById('roomTitle');
  const roomDescriptionEl = document.getElementById('roomDescription');
  const statusEl = document.getElementById('status');
  const roleBadgeEl = document.getElementById('roleBadge');
  const activeCountEl = document.getElementById('activeCount');
  const maxCountEl = document.getElementById('maxCount');
  const queueCountEl = document.getElementById('queueCount');
  const activeListEl = document.getElementById('activeList');
  const queueListEl = document.getElementById('queueList');
  const cellInfoEl = document.getElementById('cellInfo');
  const paletteEl = document.getElementById('palette');
  const brushSizeEl = document.getElementById('brushSize');
  const customColorPickerEl = document.getElementById('customColorPicker');
  const addCustomColorEl = document.getElementById('addCustomColor');
  const paletteZoomEl = document.getElementById('paletteZoom');
  const canvas = document.getElementById('roomCanvas');
  const overlay = document.getElementById('roomOverlay');
  const roomKeyEl = document.getElementById('roomKey');

  if (!(canvas instanceof HTMLCanvasElement) || !(overlay instanceof HTMLCanvasElement)) {
    throw new Error('Required canvas elements are missing');
  }
  if (!(paletteEl instanceof HTMLElement) || !(brushSizeEl instanceof HTMLSelectElement)) {
    throw new Error('Required control elements are missing');
  }

  if (roomTitleEl) roomTitleEl.textContent = config.title;
  if (roomDescriptionEl) roomDescriptionEl.textContent = config.description;
  if (roomKeyEl) roomKeyEl.textContent = channelName;
  if (maxCountEl) maxCountEl.textContent = String(config.maxUsers);

  canvas.width = config.width;
  canvas.height = config.height;
  overlay.width = config.width;
  overlay.height = config.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const overlayCtx = overlay.getContext('2d');
  if (!ctx || !overlayCtx) {
    throw new Error('Failed to initialize canvas context');
  }
  ctx.imageSmoothingEnabled = false;
  overlayCtx.imageSmoothingEnabled = false;

  const pixelCount = config.width * config.height;
  const ownerMap = config.mode === 'free-no-overwrite'
    ? Array.from({ length: pixelCount }, () => '')
    : null;

  let supabase = null;
  let channel = null;
  let lobbyChannel = null;
  let connected = false;
  let snapshotApplied = false;
  let localDrawn = false;
  let drawing = false;
  let lastPoint = null;
  let drawSendTimer = null;
  let queuedPoints = [];
  let heartbeatTimer = null;
  let snapshotRetryTimer = null;
  let lastStateRequestAt = 0;
  let publicLobbySyncTimer = null;
  let publicLobbySyncInFlight = false;

  let currentColor = DEFAULT_COLORS[0];
  let currentBrushSize = BRUSH_SIZE_OPTIONS[0];
  let paletteColors = [...DEFAULT_COLORS];

  let presenceEntries = [];
  const participantMap = new Map();
  let roomState = {
    leaderId: '',
    activeIds: [],
    queueIds: [],
    seatMap: {},
    version: 0,
  };

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function clearPublicLobbySyncTimer() {
    if (publicLobbySyncTimer !== null) {
      window.clearTimeout(publicLobbySyncTimer);
      publicLobbySyncTimer = null;
    }
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, config.width, config.height);
    if (ownerMap) {
      ownerMap.fill('');
    }
  }

  function readStoredCustomPaletteColors() {
    try {
      const raw = window.localStorage.getItem(paletteStorageKey);
      if (typeof raw !== 'string' || !raw.trim()) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      const output = [];
      for (let i = 0; i < parsed.length; i += 1) {
        const normalized = normalizeHexColor(parsed[i], '');
        if (!normalized || seen.has(normalized) || DEFAULT_COLORS.includes(normalized)) continue;
        seen.add(normalized);
        output.push(normalized);
        if (output.length >= MAX_CUSTOM_PALETTE_COLORS) break;
      }
      return output;
    } catch (error) {
      return [];
    }
  }

  function writeStoredCustomPaletteColors(colors) {
    const next = Array.isArray(colors)
      ? colors
        .map(value => normalizeHexColor(value, ''))
        .filter((value, index, arr) => value && !DEFAULT_COLORS.includes(value) && arr.indexOf(value) === index)
        .slice(0, MAX_CUSTOM_PALETTE_COLORS)
      : [];
    try {
      if (!next.length) {
        window.localStorage.removeItem(paletteStorageKey);
      } else {
        window.localStorage.setItem(paletteStorageKey, JSON.stringify(next));
      }
    } catch (error) {
      // Ignore storage write errors.
    }
  }

  function readStoredPaletteZoomPercent() {
    try {
      const raw = window.localStorage.getItem(paletteZoomStorageKey);
      if (typeof raw !== 'string') return PALETTE_ZOOM_DEFAULT;
      const parsed = Math.round(Number(raw));
      if (!Number.isFinite(parsed)) return PALETTE_ZOOM_DEFAULT;
      return clamp(parsed, PALETTE_ZOOM_MIN, PALETTE_ZOOM_MAX);
    } catch (error) {
      return PALETTE_ZOOM_DEFAULT;
    }
  }

  function writeStoredPaletteZoomPercent(percent) {
    const normalized = clamp(Math.round(Number(percent) || PALETTE_ZOOM_DEFAULT), PALETTE_ZOOM_MIN, PALETTE_ZOOM_MAX);
    try {
      window.localStorage.setItem(paletteZoomStorageKey, String(normalized));
    } catch (error) {
      // Ignore storage write errors.
    }
  }

  function getCurrentCustomPaletteColors() {
    return paletteColors.filter(colorValue => !DEFAULT_COLORS.includes(colorValue));
  }

  function applyPaletteZoomPercent(percent, { persist = true } = {}) {
    const normalized = clamp(Math.round(Number(percent) || PALETTE_ZOOM_DEFAULT), PALETTE_ZOOM_MIN, PALETTE_ZOOM_MAX);
    const swatchPx = Math.max(18, Math.round((28 * normalized) / 100));
    paletteEl.style.setProperty('--swatch-size', `${swatchPx}px`);
    if (paletteZoomEl instanceof HTMLInputElement) {
      paletteZoomEl.min = String(PALETTE_ZOOM_MIN);
      paletteZoomEl.max = String(PALETTE_ZOOM_MAX);
      paletteZoomEl.value = String(normalized);
    }
    if (persist) {
      writeStoredPaletteZoomPercent(normalized);
    }
  }

  function renderPaletteSwatches() {
    paletteEl.innerHTML = '';
    const normalizedCurrent = normalizeHexColor(currentColor, DEFAULT_COLORS[0]);
    currentColor = normalizedCurrent;
    paletteColors.forEach(colorValue => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `swatch${colorValue === currentColor ? ' is-active' : ''}`;
      button.style.background = colorValue;
      button.title = colorValue;
      button.addEventListener('click', () => {
        currentColor = colorValue;
        renderPaletteSwatches();
      });
      paletteEl.appendChild(button);
    });
    if (customColorPickerEl instanceof HTMLInputElement) {
      customColorPickerEl.value = normalizeHexColor(currentColor, '#ffffff');
    }
  }

  function createPublicLobbyThumbnailDataUrl() {
    try {
      const sourceWidth = Math.max(1, canvas.width || config.width || 1);
      const sourceHeight = Math.max(1, canvas.height || config.height || 1);
      const maxEdge = Math.max(8, PUBLIC_LOBBY_THUMBNAIL_MAX_EDGE);
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
      const thumb = document.createElement('canvas');
      thumb.width = targetWidth;
      thumb.height = targetHeight;
      const thumbCtx = thumb.getContext('2d');
      if (!thumbCtx) return '';
      thumbCtx.imageSmoothingEnabled = false;
      thumbCtx.clearRect(0, 0, targetWidth, targetHeight);
      thumbCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
      let dataUrl = thumb.toDataURL('image/png');
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return '';
      if (dataUrl.length > PUBLIC_LOBBY_THUMBNAIL_MAX_DATA_URL_LENGTH) {
        dataUrl = thumb.toDataURL('image/jpeg', 0.82);
      }
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return '';
      if (dataUrl.length > PUBLIC_LOBBY_THUMBNAIL_MAX_DATA_URL_LENGTH) return '';
      return dataUrl;
    } catch (error) {
      return '';
    }
  }

  function buildPublicLobbyPresencePayload() {
    if (!projectKey) return null;
    const activeCount = Array.isArray(roomState.activeIds) ? roomState.activeIds.length : 0;
    const queueCount = Array.isArray(roomState.queueIds) ? roomState.queueIds.length : 0;
    return {
      projectKey,
      room: channelName,
      roomVisibility: 'public',
      isPublic: true,
      participantCount: Math.max(0, activeCount),
      guestCount: Math.max(0, activeCount),
      spectatorCount: Math.max(0, queueCount),
      maxGuests: Math.max(1, Math.round(Number(config.maxUsers) || 1)),
      updatedAt: Date.now(),
      sentAt: Date.now(),
      thumbnailDataUrl: createPublicLobbyThumbnailDataUrl(),
    };
  }

  async function ensurePublicLobbyChannel() {
    if (!supabase) return null;
    if (lobbyChannel) return lobbyChannel;
    const nextLobby = supabase.channel(MULTI_PUBLIC_LOBBY_CHANNEL, {
      config: {
        presence: {
          key: `resident-public-${clientId}`,
        },
      },
    });
    lobbyChannel = nextLobby;
    try {
      await nextLobby.subscribe();
    } catch (error) {
      // Ignore subscribe failure and retry on next sync.
    }
    return lobbyChannel;
  }

  async function syncPublicLobbyPresenceNow() {
    if (!connected || publicLobbySyncInFlight) {
      return false;
    }
    const payload = buildPublicLobbyPresencePayload();
    if (!payload) return false;
    publicLobbySyncInFlight = true;
    try {
      const targetChannel = await ensurePublicLobbyChannel();
      if (!targetChannel || typeof targetChannel.track !== 'function') {
        return false;
      }
      await targetChannel.track(payload);
      return true;
    } catch (error) {
      console.warn('resident public lobby sync failed', error);
      return false;
    } finally {
      publicLobbySyncInFlight = false;
    }
  }

  function schedulePublicLobbyPresenceSync({ immediate = false } = {}) {
    if (!connected) return;
    if (immediate) {
      clearPublicLobbySyncTimer();
      syncPublicLobbyPresenceNow();
      return;
    }
    if (publicLobbySyncTimer !== null) return;
    publicLobbySyncTimer = window.setTimeout(() => {
      publicLobbySyncTimer = null;
      syncPublicLobbyPresenceNow();
    }, PUBLIC_LOBBY_SYNC_THROTTLE_MS);
  }

  function teardownPublicLobbyChannel() {
    clearPublicLobbySyncTimer();
    if (!lobbyChannel) return;
    try {
      lobbyChannel.untrack?.();
    } catch (error) {
      // Ignore untrack errors.
    }
    try {
      lobbyChannel.unsubscribe?.();
    } catch (error) {
      // Ignore unsubscribe errors.
    }
    lobbyChannel = null;
  }

  function getSeatRectForClient(clientIdValue) {
    if (config.mode !== 'fixed-cell') return null;
    const seat = roomState.seatMap && Object.prototype.hasOwnProperty.call(roomState.seatMap, clientIdValue)
      ? Number(roomState.seatMap[clientIdValue])
      : NaN;
    if (!Number.isFinite(seat)) return null;
    return buildSeatRect(seat, config.cellSize, config.width, config.height);
  }

  function isClientActive(clientIdValue) {
    return Array.isArray(roomState.activeIds) && roomState.activeIds.includes(clientIdValue);
  }

  function isLocalActive() {
    return isClientActive(clientId);
  }

  function getLocalQueueIndex() {
    return Array.isArray(roomState.queueIds) ? roomState.queueIds.indexOf(clientId) : -1;
  }

  function localNeedsSnapshotSync() {
    if (!connected || !isLocalActive() || snapshotApplied) {
      return false;
    }
    return roomState.activeIds.some(activeClientId => activeClientId !== clientId);
  }

  function stopSnapshotRetryLoop() {
    if (snapshotRetryTimer !== null) {
      window.clearInterval(snapshotRetryTimer);
      snapshotRetryTimer = null;
    }
  }

  function requestRoomStateAndSnapshotThrottled(force = false) {
    const now = Date.now();
    if (!force && now - lastStateRequestAt < SNAPSHOT_REQUEST_RETRY_MS) {
      return;
    }
    lastStateRequestAt = now;
    requestRoomStateAndSnapshot();
  }

  function ensureSnapshotRetryLoop() {
    requestRoomStateAndSnapshotThrottled();
    if (snapshotRetryTimer !== null) return;
    snapshotRetryTimer = window.setInterval(() => {
      if (!localNeedsSnapshotSync()) {
        stopSnapshotRetryLoop();
        return;
      }
      requestRoomStateAndSnapshotThrottled();
    }, SNAPSHOT_REQUEST_RETRY_MS);
  }

  function pointerToCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (config.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (config.height / rect.height));
    return {
      x: clamp(x, 0, config.width - 1),
      y: clamp(y, 0, config.height - 1),
    };
  }

  function sanitizePointForClient(clientIdValue, point, { clampToCell = false, requireInsideCell = false } = {}) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }
    let x = clamp(Math.round(point.x), 0, config.width - 1);
    let y = clamp(Math.round(point.y), 0, config.height - 1);
    if (config.mode === 'fixed-cell') {
      const rect = getSeatRectForClient(clientIdValue);
      if (!rect) return null;
      if (requireInsideCell && !pointInRect({ x, y }, rect)) {
        return null;
      }
      if (clampToCell) {
        x = clamp(x, rect.x, rect.x + rect.w - 1);
        y = clamp(y, rect.y, rect.y + rect.h - 1);
      } else if (!pointInRect({ x, y }, rect)) {
        return null;
      }
    }
    return { x, y };
  }

  function paintPixel(senderId, x, y, colorValue) {
    if (x < 0 || y < 0 || x >= config.width || y >= config.height) return;
    if (config.mode === 'free-no-overwrite' && ownerMap) {
      const idx = y * config.width + x;
      const owner = ownerMap[idx];
      if (owner && owner !== senderId) {
        return;
      }
      ownerMap[idx] = senderId;
    }
    ctx.fillStyle = colorValue;
    ctx.fillRect(x, y, 1, 1);
  }

  function stampBrush(senderId, centerX, centerY, brushSize, colorValue) {
    const size = normalizeBrushSize(brushSize, 1);
    const radius = Math.floor((size - 1) / 2);
    if (radius <= 0) {
      paintPixel(senderId, centerX, centerY, colorValue);
      return;
    }
    const radiusSq = radius * radius;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (size >= 3 && dx * dx + dy * dy > radiusSq) continue;
        paintPixel(senderId, centerX + dx, centerY + dy, colorValue);
      }
    }
  }

  function drawStroke(senderId, from, to, colorValue, brushSize) {
    let x0 = Math.round(from.x);
    let y0 = Math.round(from.y);
    const x1 = Math.round(to.x);
    const y1 = Math.round(to.y);
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
      stampBrush(senderId, x0, y0, brushSize, colorValue);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function queueDrawPoint(point) {
    queuedPoints.push({
      x: point.x,
      y: point.y,
      c: currentColor,
      s: currentBrushSize,
    });
    if (drawSendTimer !== null) return;
    drawSendTimer = window.setTimeout(() => {
      drawSendTimer = null;
      flushDrawQueue();
    }, 40);
  }

  async function flushDrawQueue() {
    if (!channel || !queuedPoints.length) return;
    const payload = {
      room: channelName,
      clientId,
      ts: Date.now(),
      points: queuedPoints.splice(0),
    };
    try {
      await channel.send({ type: 'broadcast', event: DRAW_EVENT, payload });
    } catch (error) {
      console.warn('draw broadcast failed', error);
    }
  }

  function applyRemoteDraw(payload) {
    if (!payload || payload.room !== channelName) return;
    const senderId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!senderId || senderId === clientId) return;
    if (!isClientActive(senderId)) return;
    const points = Array.isArray(payload.points) ? payload.points : [];
    if (!points.length) return;

    let prev = sanitizePointForClient(senderId, points[0], { clampToCell: true, requireInsideCell: true });
    if (!prev) return;
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      const next = sanitizePointForClient(senderId, point, { clampToCell: true, requireInsideCell: true });
      if (!next) continue;
      const colorValue = normalizeHexColor(point.c, '#ffffff');
      const sizeValue = normalizeBrushSize(point.s, 1);
      drawStroke(senderId, prev, next, colorValue, sizeValue);
      prev = next;
    }
    if (points.length === 1) {
      const only = points[0];
      drawStroke(senderId, prev, prev, normalizeHexColor(only.c, '#ffffff'), normalizeBrushSize(only.s, 1));
    }
    schedulePublicLobbyPresenceSync({ immediate: false });
  }

  function markLockedOwnersFromCanvas(ownerClientId = '') {
    if (!ownerMap) return;
    const ownerId = typeof ownerClientId === 'string' ? ownerClientId.trim() : '';
    ownerMap.fill('');
    const image = ctx.getImageData(0, 0, config.width, config.height).data;
    for (let i = 0; i < pixelCount; i += 1) {
      const alpha = image[i * 4 + 3];
      if (alpha > 0) {
        ownerMap[i] = ownerId || OWNER_LOCKED;
      }
    }
  }

  function releaseOwnerMapForMissingClients(onlineClientIds) {
    if (!ownerMap) return false;
    const onlineSet = onlineClientIds instanceof Set ? onlineClientIds : new Set();
    let changed = false;
    for (let i = 0; i < ownerMap.length; i += 1) {
      const owner = ownerMap[i];
      if (!owner || owner === OWNER_LOCKED) continue;
      if (!onlineSet.has(owner)) {
        ownerMap[i] = '';
        changed = true;
      }
    }
    return changed;
  }

  function applySnapshotDataUrl(dataUrl, ownerClientId = '') {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
    if (snapshotApplied || localDrawn) return;
    const image = new Image();
    image.onload = () => {
      clearCanvas();
      ctx.drawImage(image, 0, 0, config.width, config.height);
      if (config.mode === 'free-no-overwrite') {
        markLockedOwnersFromCanvas(ownerClientId);
      }
      snapshotApplied = true;
      stopSnapshotRetryLoop();
      updateRoleUi();
      schedulePublicLobbyPresenceSync({ immediate: false });
    };
    image.src = dataUrl;
  }

  function buildPresenceEntries() {
    participantMap.clear();
    const source = channel && typeof channel.presenceState === 'function'
      ? channel.presenceState()
      : {};
    const values = [];
    Object.keys(source || {}).forEach(key => {
      const rows = Array.isArray(source[key]) ? source[key] : [];
      rows.forEach(row => {
        const rowClientId = typeof row?.clientId === 'string' ? row.clientId.trim() : String(key || '').trim();
        if (!rowClientId) return;
        const joined = Number(row?.joinedAt);
        const joinedAtValue = Number.isFinite(joined) && joined > 0 ? joined : Date.now();
        const existing = participantMap.get(rowClientId);
        if (!existing || joinedAtValue < existing.joinedAt) {
          const entry = {
            clientId: rowClientId,
            joinedAt: joinedAtValue,
            name: normalizeDisplayName(row?.name, shortClientId(rowClientId)),
          };
          participantMap.set(rowClientId, entry);
        }
      });
    });
    participantMap.forEach(entry => values.push(entry));
    values.sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
      return a.clientId.localeCompare(b.clientId);
    });
    return values;
  }

  function firstFreeSeat(usedSeats, totalSeats) {
    for (let i = 0; i < totalSeats; i += 1) {
      if (!usedSeats.has(i)) return i;
    }
    return -1;
  }

  function buildStateFromPresence(baseState = roomState) {
    const presentClientIds = presenceEntries.map(entry => entry.clientId);
    const activeIds = presentClientIds.slice(0, config.maxUsers);
    const queueIds = presentClientIds.slice(config.maxUsers);
    const leaderId = presentClientIds[0] || '';
    const nextState = {
      leaderId,
      activeIds,
      queueIds,
      seatMap: {},
      version: Date.now(),
    };
    if (config.mode !== 'fixed-cell') {
      return nextState;
    }
    const cols = Math.max(1, Math.floor(config.width / config.cellSize));
    const rows = Math.max(1, Math.floor(config.height / config.cellSize));
    const totalSeats = cols * rows;
    const usedSeats = new Set();
    const baseSeatMap = baseState && typeof baseState.seatMap === 'object' ? baseState.seatMap : {};

    for (let i = 0; i < activeIds.length; i += 1) {
      const clientIdValue = activeIds[i];
      const candidate = Number(baseSeatMap[clientIdValue]);
      if (!Number.isFinite(candidate) || candidate < 0 || candidate >= totalSeats || usedSeats.has(candidate)) {
        continue;
      }
      nextState.seatMap[clientIdValue] = candidate;
      usedSeats.add(candidate);
    }
    for (let i = 0; i < activeIds.length; i += 1) {
      const clientIdValue = activeIds[i];
      if (Object.prototype.hasOwnProperty.call(nextState.seatMap, clientIdValue)) continue;
      const seat = firstFreeSeat(usedSeats, totalSeats);
      if (seat < 0) break;
      nextState.seatMap[clientIdValue] = seat;
      usedSeats.add(seat);
    }
    return nextState;
  }

  function normalizeIncomingState(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.room !== channelName) return null;
    const presentSet = new Set(presenceEntries.map(entry => entry.clientId));
    const activeIds = uniqueClientList(payload.activeIds, presentSet).slice(0, config.maxUsers);
    const queueIds = uniqueClientList(payload.queueIds, presentSet).filter(clientIdValue => !activeIds.includes(clientIdValue));
    const fallbackState = buildStateFromPresence(roomState);
    const normalized = {
      leaderId: typeof payload.leaderId === 'string' ? payload.leaderId.trim() : fallbackState.leaderId,
      activeIds: activeIds.length ? activeIds : fallbackState.activeIds,
      queueIds: queueIds.length || payload.queueIds?.length === 0 ? queueIds : fallbackState.queueIds,
      seatMap: {},
      version: Number(payload.version) || Date.now(),
    };
    if (!presentSet.has(normalized.leaderId)) {
      normalized.leaderId = fallbackState.leaderId;
    }

    if (config.mode === 'fixed-cell') {
      const cols = Math.max(1, Math.floor(config.width / config.cellSize));
      const rows = Math.max(1, Math.floor(config.height / config.cellSize));
      const totalSeats = cols * rows;
      const used = new Set();
      const incomingSeatMap = payload.seatMap && typeof payload.seatMap === 'object' ? payload.seatMap : {};
      normalized.activeIds.forEach(clientIdValue => {
        const seat = Number(incomingSeatMap[clientIdValue]);
        if (!Number.isFinite(seat) || seat < 0 || seat >= totalSeats || used.has(seat)) return;
        normalized.seatMap[clientIdValue] = seat;
        used.add(seat);
      });
      normalized.activeIds.forEach(clientIdValue => {
        if (Object.prototype.hasOwnProperty.call(normalized.seatMap, clientIdValue)) return;
        const seat = firstFreeSeat(used, totalSeats);
        if (seat < 0) return;
        normalized.seatMap[clientIdValue] = seat;
        used.add(seat);
      });
    }
    return normalized;
  }

  function shouldAcceptIncomingState(nextState) {
    if (!nextState) return false;
    if (!roomState || !roomState.leaderId) return true;
    if (nextState.leaderId === roomState.leaderId) {
      return Number(nextState.version) >= Number(roomState.version || 0);
    }
    const expectedLeader = presenceEntries[0]?.clientId || '';
    if (expectedLeader && nextState.leaderId === expectedLeader) {
      return true;
    }
    const currentLeaderPresent = presenceEntries.some(entry => entry.clientId === roomState.leaderId);
    if (!currentLeaderPresent) {
      return true;
    }
    return false;
  }

  function renderOverlay() {
    overlayCtx.clearRect(0, 0, config.width, config.height);
    if (config.mode !== 'fixed-cell') return;

    overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    overlayCtx.lineWidth = 1;
    for (let x = config.cellSize; x < config.width; x += config.cellSize) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(x + 0.5, 0);
      overlayCtx.lineTo(x + 0.5, config.height);
      overlayCtx.stroke();
    }
    for (let y = config.cellSize; y < config.height; y += config.cellSize) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(0, y + 0.5);
      overlayCtx.lineTo(config.width, y + 0.5);
      overlayCtx.stroke();
    }

    const seatRect = getSeatRectForClient(clientId);
    if (seatRect) {
      overlayCtx.strokeStyle = 'rgba(88, 196, 255, 0.95)';
      overlayCtx.lineWidth = 2;
      overlayCtx.strokeRect(seatRect.x + 0.5, seatRect.y + 0.5, seatRect.w - 1, seatRect.h - 1);
    }
  }

  function getParticipantLabel(clientIdValue) {
    const participant = participantMap.get(clientIdValue);
    const name = participant ? participant.name : shortClientId(clientIdValue);
    return `${name} (${shortClientId(clientIdValue)})`;
  }

  function renderParticipantLists() {
    if (activeCountEl) activeCountEl.textContent = String(roomState.activeIds.length);
    if (queueCountEl) queueCountEl.textContent = String(roomState.queueIds.length);

    if (activeListEl) {
      activeListEl.innerHTML = '';
      roomState.activeIds.forEach((activeClientId, index) => {
        const li = document.createElement('li');
        const leaderMark = activeClientId === roomState.leaderId ? ' · 仮マスター(権限なし)' : '';
        li.textContent = `${index + 1}. ${getParticipantLabel(activeClientId)}${leaderMark}`;
        activeListEl.appendChild(li);
      });
      if (!roomState.activeIds.length) {
        const li = document.createElement('li');
        li.textContent = '参加者はいません';
        activeListEl.appendChild(li);
      }
    }

    if (queueListEl) {
      queueListEl.innerHTML = '';
      roomState.queueIds.forEach((queuedClientId, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${getParticipantLabel(queuedClientId)}`;
        queueListEl.appendChild(li);
      });
      if (!roomState.queueIds.length) {
        const li = document.createElement('li');
        li.textContent = '待機中のユーザーはいません';
        queueListEl.appendChild(li);
      }
    }
  }

  function updateRoleUi() {
    const activeIndex = roomState.activeIds.indexOf(clientId);
    const queueIndex = getLocalQueueIndex();
    const leader = roomState.leaderId === clientId;
    const needsSnapshotSync = localNeedsSnapshotSync();

    if (!connected) {
      if (roleBadgeEl) roleBadgeEl.textContent = '未接続';
      canvas.classList.add('is-readonly');
      stopSnapshotRetryLoop();
      return;
    }
    if (!needsSnapshotSync) {
      stopSnapshotRetryLoop();
    }
    if (activeIndex >= 0) {
      if (needsSnapshotSync) {
        if (roleBadgeEl) roleBadgeEl.textContent = '同期中';
        setStatus('キャンバス同期中…');
        if (cellInfoEl) {
          cellInfoEl.textContent = config.mode === 'fixed-cell'
            ? '既存キャンバスを同期中です。完了後にセル内へ描画できます。'
            : '既存キャンバスを同期中です。完了後に描画できます。';
        }
        ensureSnapshotRetryLoop();
        canvas.classList.add('is-readonly');
        renderOverlay();
        return;
      }
      if (roleBadgeEl) roleBadgeEl.textContent = leader ? '先頭参加者(管理なし)' : '参加中';
      setStatus(`参加中 (${activeIndex + 1}/${config.maxUsers})`);
      if (cellInfoEl) {
        if (config.mode === 'fixed-cell') {
          const rect = getSeatRectForClient(clientId);
          if (rect) {
            cellInfoEl.textContent = `あなたのセル: ${rect.col + 1},${rect.row + 1} (${config.cellSize}x${config.cellSize})`;
          } else {
            cellInfoEl.textContent = 'セル情報を同期中…';
          }
        } else {
          cellInfoEl.textContent = 'このルームは「他人の塗り替え不可」モードです。';
        }
      }
    } else if (queueIndex >= 0) {
      if (roleBadgeEl) roleBadgeEl.textContent = '待機中';
      setStatus(`待機キュー ${queueIndex + 1} 番目（空きが出ると自動参加）`);
      if (cellInfoEl) {
        cellInfoEl.textContent = '現在は描画できません。参加枠が空くまでお待ちください。';
      }
    } else {
      if (roleBadgeEl) roleBadgeEl.textContent = '同期中';
      setStatus('参加枠を判定中…');
      if (cellInfoEl) {
        cellInfoEl.textContent = '';
      }
    }
    canvas.classList.toggle('is-readonly', !isLocalActive());
    renderOverlay();
  }

  function applyRoomState(nextState) {
    roomState = nextState;
    renderParticipantLists();
    updateRoleUi();
    schedulePublicLobbyPresenceSync({ immediate: false });
  }

  async function broadcastRoomState(nextState) {
    if (!channel) return;
    try {
      await channel.send({
        type: 'broadcast',
        event: ROOM_STATE_EVENT,
        payload: {
          room: channelName,
          leaderId: nextState.leaderId,
          activeIds: nextState.activeIds,
          queueIds: nextState.queueIds,
          seatMap: nextState.seatMap,
          version: nextState.version,
        },
      });
    } catch (error) {
      console.warn('room-state broadcast failed', error);
    }
  }

  function recomputeLocalStateAndMaybeBroadcast() {
    const computed = buildStateFromPresence(roomState);
    const isLeader = computed.leaderId === clientId && computed.leaderId !== '';
    if (!stateEquals(computed, roomState)) {
      applyRoomState(computed);
      if (isLeader) {
        broadcastRoomState(computed);
      }
      return;
    }
    if (isLeader && roomState.leaderId === clientId) {
      broadcastRoomState({
        ...roomState,
        version: Date.now(),
      });
    }
  }

  function handlePresenceSync() {
    presenceEntries = buildPresenceEntries();
    if (config.mode === 'free-no-overwrite' && ownerMap) {
      const onlineIds = new Set(presenceEntries.map(entry => entry.clientId));
      const released = releaseOwnerMapForMissingClients(onlineIds);
      if (released) {
        schedulePublicLobbyPresenceSync({ immediate: false });
      }
    }
    const expectedLeader = presenceEntries[0]?.clientId || '';
    if (!roomState.leaderId || !presenceEntries.some(entry => entry.clientId === roomState.leaderId)) {
      const fallbackState = buildStateFromPresence(roomState);
      applyRoomState(fallbackState);
    }
    if (expectedLeader === clientId) {
      recomputeLocalStateAndMaybeBroadcast();
    } else {
      renderParticipantLists();
      updateRoleUi();
    }
  }

  async function handleRoomStateRequest(payload) {
    if (!payload || payload.room !== channelName) return;
    if (!channel) return;
    if (roomState.leaderId !== clientId || !isLocalActive()) return;
    const nextState = buildStateFromPresence(roomState);
    applyRoomState(nextState);
    await broadcastRoomState(nextState);
  }

  function handleIncomingRoomState(payload) {
    const normalized = normalizeIncomingState(payload);
    if (!normalized) return;
    if (!shouldAcceptIncomingState(normalized)) return;
    applyRoomState(normalized);
  }

  async function requestRoomStateAndSnapshot() {
    if (!channel) return;
    try {
      await channel.send({
        type: 'broadcast',
        event: ROOM_STATE_REQUEST_EVENT,
        payload: { room: channelName, clientId, ts: Date.now() },
      });
      await channel.send({
        type: 'broadcast',
        event: STATUS_REQUEST_EVENT,
        payload: { room: channelName, clientId, ts: Date.now() },
      });
    } catch (error) {
      console.warn('request state/snapshot failed', error);
    }
  }

  async function handleStatusRequest(payload) {
    if (!payload || payload.room !== channelName) return;
    if (!channel || !isLocalActive()) return;
    const data = canvas.toDataURL('image/png');
    try {
      await channel.send({
        type: 'broadcast',
        event: STATUS_RESPONSE_EVENT,
        payload: {
          room: channelName,
          clientId,
          ts: Date.now(),
          data,
          state: {
            leaderId: roomState.leaderId,
            activeIds: roomState.activeIds,
            queueIds: roomState.queueIds,
            seatMap: roomState.seatMap,
            version: roomState.version,
          },
        },
      });
    } catch (error) {
      console.warn('status response failed', error);
    }
  }

  function handleStatusResponse(payload) {
    if (!payload || payload.room !== channelName) return;
    if (payload.clientId === clientId) return;
    if (payload.state) {
      handleIncomingRoomState({ ...payload.state, room: channelName });
    }
    if (typeof payload.data === 'string') {
      applySnapshotDataUrl(payload.data, payload.clientId);
    }
  }

  function handlePointerDown(event) {
    if (!isLocalActive() || localNeedsSnapshotSync()) {
      updateRoleUi();
      return;
    }
    const raw = pointerToCanvas(event);
    const point = sanitizePointForClient(clientId, raw, {
      requireInsideCell: config.mode === 'fixed-cell',
      clampToCell: config.mode === 'fixed-cell',
    });
    if (!point) return;
    drawing = true;
    localDrawn = true;
    lastPoint = point;
    drawStroke(clientId, point, point, currentColor, currentBrushSize);
    queueDrawPoint(point);
    schedulePublicLobbyPresenceSync({ immediate: false });
    canvas.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!drawing || !isLocalActive()) return;
    const raw = pointerToCanvas(event);
    const point = sanitizePointForClient(clientId, raw, {
      requireInsideCell: false,
      clampToCell: config.mode === 'fixed-cell',
    });
    if (!point || !lastPoint) return;
    drawStroke(clientId, lastPoint, point, currentColor, currentBrushSize);
    queueDrawPoint(point);
    schedulePublicLobbyPresenceSync({ immediate: false });
    lastPoint = point;
  }

  function handlePointerUp(event) {
    if (!drawing) return;
    drawing = false;
    canvas.releasePointerCapture?.(event.pointerId);
    flushDrawQueue();
    schedulePublicLobbyPresenceSync({ immediate: false });
  }

  function initControls() {
    clearCanvas();

    paletteColors = [...DEFAULT_COLORS, ...readStoredCustomPaletteColors()];
    currentColor = paletteColors[0] || DEFAULT_COLORS[0];
    applyPaletteZoomPercent(readStoredPaletteZoomPercent(), { persist: false });
    renderPaletteSwatches();

    brushSizeEl.innerHTML = '';
    BRUSH_SIZE_OPTIONS.forEach(size => {
      const option = document.createElement('option');
      option.value = String(size);
      option.textContent = String(size);
      brushSizeEl.appendChild(option);
    });
    brushSizeEl.value = String(currentBrushSize);
    brushSizeEl.addEventListener('change', () => {
      currentBrushSize = normalizeBrushSize(brushSizeEl.value, currentBrushSize);
      brushSizeEl.value = String(currentBrushSize);
    });

    if (customColorPickerEl instanceof HTMLInputElement) {
      customColorPickerEl.value = normalizeHexColor(currentColor, '#ffffff');
      customColorPickerEl.addEventListener('input', () => {
        currentColor = normalizeHexColor(customColorPickerEl.value, currentColor);
        renderPaletteSwatches();
      });
      customColorPickerEl.addEventListener('change', () => {
        currentColor = normalizeHexColor(customColorPickerEl.value, currentColor);
        renderPaletteSwatches();
      });
    }

    if (addCustomColorEl instanceof HTMLButtonElement) {
      addCustomColorEl.addEventListener('click', () => {
        const nextColor = customColorPickerEl instanceof HTMLInputElement
          ? normalizeHexColor(customColorPickerEl.value, currentColor)
          : normalizeHexColor(currentColor, '#ffffff');
        currentColor = nextColor;
        if (!paletteColors.includes(nextColor)) {
          paletteColors.push(nextColor);
          const customColors = getCurrentCustomPaletteColors();
          if (customColors.length > MAX_CUSTOM_PALETTE_COLORS) {
            const overflow = customColors.length - MAX_CUSTOM_PALETTE_COLORS;
            let removed = 0;
            paletteColors = paletteColors.filter(colorValue => {
              if (DEFAULT_COLORS.includes(colorValue)) return true;
              if (removed < overflow) {
                removed += 1;
                return false;
              }
              return true;
            });
          }
          writeStoredCustomPaletteColors(getCurrentCustomPaletteColors());
        }
        renderPaletteSwatches();
      });
    }

    if (paletteZoomEl instanceof HTMLInputElement) {
      paletteZoomEl.min = String(PALETTE_ZOOM_MIN);
      paletteZoomEl.max = String(PALETTE_ZOOM_MAX);
      const onPaletteZoomInput = () => {
        applyPaletteZoomPercent(paletteZoomEl.value, { persist: true });
      };
      paletteZoomEl.addEventListener('input', onPaletteZoomInput);
      paletteZoomEl.addEventListener('change', onPaletteZoomInput);
    }

    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    renderOverlay();
    renderParticipantLists();
    updateRoleUi();
  }

  async function connect() {
    setStatus('接続中…');
    const mod = await import(MULTI_SUPABASE_MODULE_URL);
    supabase = mod.createClient(MULTI_SUPABASE_URL, MULTI_SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 48 } },
    });
    channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false },
        presence: { key: clientId },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      handlePresenceSync();
    });
    channel.on('broadcast', { event: DRAW_EVENT }, ({ payload }) => {
      applyRemoteDraw(payload);
    });
    channel.on('broadcast', { event: ROOM_STATE_EVENT }, ({ payload }) => {
      handleIncomingRoomState(payload);
    });
    channel.on('broadcast', { event: ROOM_STATE_REQUEST_EVENT }, ({ payload }) => {
      handleRoomStateRequest(payload);
    });
    channel.on('broadcast', { event: STATUS_REQUEST_EVENT }, ({ payload }) => {
      handleStatusRequest(payload);
    });
    channel.on('broadcast', { event: STATUS_RESPONSE_EVENT }, ({ payload }) => {
      handleStatusResponse(payload);
    });

    await channel.subscribe(async subscribeStatus => {
      if (subscribeStatus === 'SUBSCRIBED') {
        connected = true;
        setStatus('接続済み');
        await channel.track({
          clientId,
          name: localName,
          joinedAt,
        });
        handlePresenceSync();
        requestRoomStateAndSnapshotThrottled(true);
        schedulePublicLobbyPresenceSync({ immediate: true });
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        connected = false;
        setStatus('接続失敗');
        teardownPublicLobbyChannel();
      } else if (subscribeStatus === 'CLOSED') {
        connected = false;
        setStatus('切断されました');
        teardownPublicLobbyChannel();
      }
      updateRoleUi();
    });

    heartbeatTimer = window.setInterval(() => {
      if (!connected || !channel) return;
      const expectedLeader = presenceEntries[0]?.clientId || '';
      if (expectedLeader === clientId) {
        const computed = buildStateFromPresence(roomState);
        computed.version = Date.now();
        applyRoomState(computed);
        broadcastRoomState(computed);
      }
    }, 2500);
  }

  function teardown() {
    connected = false;
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    stopSnapshotRetryLoop();
    teardownPublicLobbyChannel();
    if (drawSendTimer !== null) {
      window.clearTimeout(drawSendTimer);
      drawSendTimer = null;
    }
    if (channel) {
      try {
        channel.untrack?.();
      } catch (error) {
        // Ignore untrack errors
      }
      try {
        channel.unsubscribe?.();
      } catch (error) {
        // Ignore unsubscribe errors
      }
    }
  }

  window.addEventListener('beforeunload', teardown);

  initControls();
  await connect();
}
