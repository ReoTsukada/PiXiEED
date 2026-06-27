const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
const STORAGE_BUCKET = 'pixieed-contest';
const ROOM_ID = 'main';
const MAX_COMMENT_ITEMS = 100;
const MAX_ARTWORK_POOL = 500;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 256;
const THUMB_EDGE = 256;
const ARTWORK_SLOT_COUNT = 10;
const ARTWORK_ROTATION_INTERVAL_MS = 10000;
const BUBBLE_DURATION_MS = 6500;
const ARTWORK_REPLY_BUBBLE_MS = 30000;
const PRESENCE_TTL_MS = 18000;
const PRESENCE_POLL_MS = 2000;
const PRESENCE_DB_WRITE_MS = 2500;
const REMOTE_AVATAR_STALE_MS = 30000;
const REMOTE_AVATAR_SEND_MS = 240;
const REMOTE_AVATAR_SEND_STEP = 6;
const REMOTE_AVATAR_LERP = 0.2;
const REMOTE_AVATAR_WARP_DISTANCE = 520;
const REMOTE_AVATAR_INTEREST_PADDING = 360;
const REMOTE_AVATAR_FADE_MS = 180;
const ARTWORK_RETENTION_MS = 24 * 60 * 60 * 1000;
const WORLD_WIDTH = 4400;
const WORLD_HEIGHT = 820;
const PLAYER_LANE_Y = 690;
const CAMERA_GROUND_RATIO = 0.76;
const GRID_SIZE = 40;
const AVATAR_ACTIVE_PADDING = 260;
const MIN_ZOOM = 0.58;
const MAX_ZOOM = 1.7;
const ZOOM_STEP = 0.16;

const WORLD_OBJECTS = [];

const SPAWN_ZONES = [
  { x: 720, y: PLAYER_LANE_Y, width: 760, height: 1 }
];

const AVATARS = [
  { id: 'mao', src: '../character-dots/maousama.png' },
  { id: 'jerin1', src: '../character-dots/Jerin1.png' },
  { id: 'jerin2', src: '../character-dots/Jerin2.png' },
  { id: 'jerin3', src: '../character-dots/Jerin3.png' },
  { id: 'jerin4', src: '../character-dots/Jerin4.png' },
  { id: 'jerin5', src: '../character-dots/Jerin5.png' },
  { id: 'jerin6', src: '../character-dots/Jerin6.png' },
  { id: 'jerin7', src: '../character-dots/Jerin7.png' },
  { id: 'jerin8', src: '../character-dots/Jerin8.png' },
  { id: 'jellnall1', src: '../character-dots/JELLNALL1.png' },
  { id: 'jellnall2', src: '../character-dots/JELLNALL2.png' },
  { id: 'jellnall3', src: '../character-dots/JELLNALL3.png' },
  { id: 'jellnall4', src: '../character-dots/JELLNALL4.png' },
  { id: 'jellnall5', src: '../character-dots/JELLNALL5.png' },
  { id: 'jellnall6', src: '../character-dots/JELLNALL6.png' },
  { id: 'jellnall7', src: '../character-dots/JELLNALL7.png' },
  { id: 'jellnall8', src: '../character-dots/JELLNALL8.png' },
  { id: 'jellnall9', src: '../character-dots/JELLNALL9.png' },
  { id: 'jellnall10', src: '../character-dots/JELLNALL10.png' },
  { id: 'jellnall11', src: '../character-dots/JELLNALL11.png' },
  { id: 'jellnall12', src: '../character-dots/JELLNALL12.png' },
  { id: 'jellnall13', src: '../character-dots/JELLNALL13.png' },
  { id: 'jellnall14', src: '../character-dots/JELLNALL14.png' },
  { id: 'jellnall15', src: '../character-dots/JELLNALL15.png' },
  { id: 'jellnall16', src: '../character-dots/JELLNALL16.png' },
  { id: 'jellnall17', src: '../character-dots/JELLNALL17.png' },
  { id: 'jellnall18', src: '../character-dots/JELLNALL18.png' },
  { id: 'jellnall19', src: '../character-dots/JELLNALL19.png' },
  { id: 'baburin', src: '../character-dots/baburinpng.png' }
];

const SAMPLE_ARTWORKS = [
  {
    id: 'sample-pixieed-maker',
    title: 'PiXiEED Plaza',
    display_name: 'PiXiEED',
    avatar: 'mao',
    image_url: '../assets/og/pixel-art-maker.png',
    thumbnail_url: '../assets/og/pixel-art-maker.png',
    width: 1200,
    height: 630,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ARTWORK_RETENTION_MS).toISOString(),
    is_sample: true
  },
  {
    id: 'sample-pixieed-online',
    title: 'Gallery Chat',
    display_name: 'PiXiEED',
    avatar: 'jerin1',
    image_url: '../assets/og/pixel-art-online.png',
    thumbnail_url: '../assets/og/pixel-art-online.png',
    width: 1200,
    height: 630,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ARTWORK_RETENTION_MS).toISOString(),
    is_sample: true
  }
];

const state = {
  supabase: null,
  supabasePromise: null,
  authUser: null,
  clientId: '',
  presenceId: '',
  realtimeChannel: null,
  commentsChannel: null,
  artworksChannel: null,
  artworks: [],
  displayedArtworkIds: [],
  artworkRotationDeck: [],
  artworkRotationCursor: 0,
  artworkDeckSignature: '',
  currentArtwork: null,
  currentArtworkId: '',
  messageMode: 'world',
  directTargetName: '',
  directTargetArtworkId: '',
  artworkBubbles: new Map(),
  comments: [],
  commentIds: new Set(),
  remoteAvatars: new Map(),
  avatarElements: new Map(),
  avatarFadeTimers: new Map(),
  localAvatar: {
    x: 1200,
    y: PLAYER_LANE_Y,
    targetX: 1200,
    targetY: PLAYER_LANE_Y,
    path: [],
    bubble: '',
    bubbleMode: 'world',
    bubbleTargetName: '',
    bubbleTargetArtworkId: '',
    bubbleUntil: 0,
    walking: false
  },
  camera: {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    width: 0,
    height: 0,
    scale: 1
  },
  keys: new Set(),
  activePointers: new Map(),
  pinchStart: null,
  pendingTap: null,
  moveMarkerTimer: 0,
  lastFrameAt: 0,
  lastPresenceAt: 0,
  lastAvatarBroadcastAt: 0,
  lastPresenceDbWriteAt: 0,
  lastPresenceSnapshot: '',
  sceneNoticeTimer: 0,
  optionMenuOpen: false,
  presenceDbAvailable: true
};

function $(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampWorldX(value) {
  return clamp(Number(value) || 0, 40, WORLD_WIDTH - 40);
}

function clampWorldY(value) {
  return PLAYER_LANE_Y;
}

function getSceneRect() {
  const scene = $('plazaScene');
  return scene?.getBoundingClientRect() || { width: 0, height: 0, left: 0, top: 0 };
}

function isPointBlocked(x, y) {
  return WORLD_OBJECTS.some(object => (
    x >= object.x - 24
    && x <= object.x + object.width + 24
    && y >= object.y - 28
    && y <= object.y + object.height + 28
  ));
}

function isGridBlocked(gx, gy) {
  const x = gx * GRID_SIZE + GRID_SIZE / 2;
  const y = gy * GRID_SIZE + GRID_SIZE / 2;
  return x < 20 || y < 20 || x > WORLD_WIDTH - 20 || y > WORLD_HEIGHT - 20 || isPointBlocked(x, y);
}

function screenToWorld(clientX, clientY) {
  const rect = getSceneRect();
  return {
    x: clampWorldX((clientX - rect.left) / state.camera.scale + state.camera.x),
    y: PLAYER_LANE_Y
  };
}

function isAvatarInViewport(avatar, padding = AVATAR_ACTIVE_PADDING) {
  const x = Number(avatar?.renderX ?? avatar?.targetX ?? avatar?.x) || 0;
  const y = Number(avatar?.renderY ?? avatar?.targetY ?? avatar?.y) || 0;
  const visibleWidth = state.camera.width / state.camera.scale;
  const visibleHeight = state.camera.height / state.camera.scale;
  return (
    x >= state.camera.x - padding
    && x <= state.camera.x + visibleWidth + padding
    && y >= state.camera.y - padding
    && y <= state.camera.y + visibleHeight + padding
  );
}

function getRemoteInterestBounds(padding = REMOTE_AVATAR_INTEREST_PADDING) {
  const visible = getVisibleWorldSize();
  return {
    minX: clampWorldX(state.localAvatar.x - visible.width / 2 - padding),
    maxX: clampWorldX(state.localAvatar.x + visible.width / 2 + padding)
  };
}

function isAvatarWithinInterestRange(avatar, padding = REMOTE_AVATAR_INTEREST_PADDING) {
  const x = Number(avatar?.targetX ?? avatar?.x ?? avatar?.renderX) || 0;
  const { minX, maxX } = getRemoteInterestBounds(padding);
  return x >= minX && x <= maxX;
}

function clearAvatarFadeTimer(clientId) {
  const timer = state.avatarFadeTimers.get(clientId);
  if (!timer) return;
  window.clearTimeout(timer);
  state.avatarFadeTimers.delete(clientId);
}

function removeAvatarElement(clientId) {
  clearAvatarFadeTimer(clientId);
  state.avatarElements.get(clientId)?.remove();
  state.avatarElements.delete(clientId);
}

function ensureAvatarVisible(clientId, el) {
  clearAvatarFadeTimer(clientId);
  if (!el.dataset.visible || el.classList.contains('is-fading-out')) {
    el.classList.remove('is-fading-out');
    el.classList.add('is-fading-in');
    el.dataset.visible = '1';
    window.requestAnimationFrame(() => {
      el.classList.remove('is-fading-in');
    });
  }
}

function fadeOutAvatar(clientId, el) {
  if (!el || clientId === state.clientId) return;
  if (state.avatarFadeTimers.has(clientId)) return;
  el.classList.remove('is-fading-in');
  el.classList.add('is-fading-out');
  el.dataset.visible = '';
  const timer = window.setTimeout(() => {
    removeAvatarElement(clientId);
  }, REMOTE_AVATAR_FADE_MS);
  state.avatarFadeTimers.set(clientId, timer);
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = 'id') {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadLocal(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (_error) {
    return fallback;
  }
}

function saveLocal(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch (_error) {}
}

function getClientId() {
  const key = 'pixieed_client_id';
  const existing = loadLocal(key, window.PIXIEED_CLIENT_ID || '');
  if (existing) {
    window.PIXIEED_CLIENT_ID = existing;
    saveLocal(key, existing);
    return existing;
  }
  const id = makeId('guest');
  saveLocal(key, id);
  window.PIXIEED_CLIENT_ID = id;
  return id;
}

function getNickname() {
  return loadLocal('pixieed_nickname', '').trim();
}

function setNickname(value) {
  saveLocal('pixieed_nickname', String(value || '').trim().slice(0, 32));
}

function getAvatarId() {
  const avatar = loadLocal('pixieed_avatar', 'mao');
  return avatar === 'pixiedraw' ? 'mao' : avatar;
}

function setAvatarId(value) {
  const id = AVATARS.some(item => item.id === value) ? value : 'mao';
  saveLocal('pixieed_avatar', id);
}

function getXUrl() {
  return loadLocal('pixieed_x_url', '');
}

function normalizeXUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch (_error) {
      return '';
    }
  }
  const handle = raw.replace(/^@+/, '').trim();
  if (!handle) return '';
  const candidate = /^(x\.com|twitter\.com)\//i.test(handle) ? `https://${handle}` : `https://x.com/${handle}`;
  try {
    return new URL(candidate).toString();
  } catch (_error) {
    return '';
  }
}

function setXUrl(value) {
  saveLocal('pixieed_x_url', normalizeXUrl(value));
}

function getDisplayName() {
  return getNickname() || state.authUser?.email?.split('@')[0] || 'ゲスト';
}

function getAvatarSrc(id = getAvatarId()) {
  return AVATARS.find(item => item.id === id)?.src || AVATARS[0].src;
}

function createRandomSpawn() {
  const zone = SPAWN_ZONES[Math.floor(Math.random() * SPAWN_ZONES.length)] || SPAWN_ZONES[0];
  const x = zone.x + Math.random() * zone.width;
  return { x: clampWorldX(x), y: PLAYER_LANE_Y };
}

function applyRandomSpawn() {
  const spawn = createRandomSpawn();
  state.localAvatar.x = spawn.x;
  state.localAvatar.y = spawn.y;
  state.localAvatar.targetX = spawn.x;
  state.localAvatar.targetY = spawn.y;
  state.localAvatar.path = [];
  const visibleWidth = state.camera.width / state.camera.scale;
  const visibleHeight = state.camera.height / state.camera.scale;
  state.camera.x = spawn.x - visibleWidth / 2;
  state.camera.y = getCameraYForGround(spawn.y, visibleHeight);
  state.camera.targetX = state.camera.x;
  state.camera.targetY = state.camera.y;
}

function getVisibleWorldSize() {
  return {
    width: Math.max(1, state.camera.width / state.camera.scale),
    height: Math.max(1, state.camera.height / state.camera.scale)
  };
}

function getCameraYForGround(groundY, visibleHeight) {
  return groundY - visibleHeight * CAMERA_GROUND_RATIO;
}

function formatTime(value) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return '';
  try {
    return new Date(time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  } catch (_error) {
    return '';
  }
}

function formatDate(value) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return '-';
  try {
    return new Date(time).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_error) {
    return '-';
  }
}

function chunkTextByWidth(text, width = 10) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  let current = '';
  chars.forEach(char => {
    if (char === '\n') {
      lines.push(current);
      current = '';
      return;
    }
    current += char;
    if (current.length >= width) {
      lines.push(current);
      current = '';
    }
  });
  if (current || !lines.length) lines.push(current);
  return lines;
}

function formatBubbleBody(rawText, options = {}) {
  const suffix = String(options.suffix || '、、、、');
  const normalized = String(rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  const lines = chunkTextByWidth(normalized, 10);
  const truncated = lines.length > 2;
  const visible = lines.slice(0, 2);
  if (truncated) {
    const secondLine = visible[1] || '';
    visible[1] = `${Array.from(secondLine).slice(0, Math.max(0, 10 - suffix.length)).join('')}${suffix}`;
  }
  return visible.join('\n');
}

function isArtworkWithinRetention(artwork) {
  if (!artwork) return false;
  if (artwork.is_sample) return true;
  const createdAt = Date.parse(artwork.created_at || '');
  const expiresAt = Date.parse(artwork.expires_at || '');
  const now = Date.now();
  if (Number.isFinite(createdAt) && now - createdAt > ARTWORK_RETENTION_MS) return false;
  if (Number.isFinite(expiresAt) && expiresAt <= now) return false;
  return true;
}

function getArtworkRemainingLabel(artwork) {
  const expiresAt = Date.parse(artwork?.expires_at || '');
  if (!Number.isFinite(expiresAt)) return '24時間表示';
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) return '終了';
  const hours = Math.floor(remainingMs / 3600000);
  const minutes = Math.max(1, Math.ceil((remainingMs % 3600000) / 60000));
  if (hours > 0) return `残り${hours}時間`;
  return `残り${minutes}分`;
}

function normalizeTargetName(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .slice(0, 32);
}

function normalizeBubbleMode(value) {
  return value === 'image' ? 'image' : value === 'direct' ? 'direct' : 'world';
}

function quantizeAvatarX(value) {
  return Math.round((Number(value) || 0) / REMOTE_AVATAR_SEND_STEP) * REMOTE_AVATAR_SEND_STEP;
}

function getReplyLabel(artwork = state.currentArtwork) {
  if (state.messageMode === 'image' && artwork?.id) {
    const author = normalizeTargetName(artwork.display_name) || '投稿者';
    return `画像リプライ: @${author} / ${artwork.title || '無題'}`;
  }
  if (state.messageMode === 'direct' && state.directTargetName) {
    return `宛先: @${state.directTargetName} / エメラルド`;
  }
  return 'ワールド発言';
}

function setStatus(message) {
  const el = $('plazaStatus');
  if (el) el.textContent = message || '';
}

function setPostStatus(message, tone = '') {
  const el = $('postStatus');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('is-error', tone === 'error');
  el.classList.toggle('is-ok', tone === 'ok');
}

function setDetailStatus(message, tone = '') {
  const el = $('detailStatus');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('is-error', tone === 'error');
  el.classList.toggle('is-ok', tone === 'ok');
}

function showSceneNotice(message) {
  const el = $('sceneNotice');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('is-visible', Boolean(message));
  window.clearTimeout(state.sceneNoticeTimer);
  if (message) {
    state.sceneNoticeTimer = window.setTimeout(() => {
      el.classList.remove('is-visible');
    }, 2600);
  }
}

async function ensureSupabase() {
  if (state.supabase) return state.supabase;
  if (state.supabasePromise) return state.supabasePromise;
  state.supabasePromise = (async () => {
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
      state.supabase = window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
      return state.supabase;
    }
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) {
      state.supabase = await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
      return state.supabase;
    }
    const module = await import(SUPABASE_MODULE_URL);
    state.supabase = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY
      },
      realtime: {
        params: { eventsPerSecond: 10 }
      },
      global: {
        headers: { 'x-client-id': getClientId() }
      }
    });
    window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = state.supabase;
    return state.supabase;
  })().catch(error => {
    state.supabasePromise = null;
    throw error;
  });
  return state.supabasePromise;
}

async function syncAuthUser() {
  try {
    const supabase = await ensureSupabase();
    const { data } = await supabase.auth.getSession();
    state.authUser = data?.session?.user || null;
    supabase.auth.onAuthStateChange((_event, session) => {
      state.authUser = session?.user || null;
      updateProfileUi();
      trackPresence(true);
    });
  } catch (_error) {
    state.authUser = null;
  }
  updateProfileUi();
}

function sortArtworks(items) {
  const now = Date.now();
  return (Array.isArray(items) ? items : []).slice().sort((a, b) => {
    const aPriority = Date.parse(a.priority_until || '') > now ? 1 : 0;
    const bPriority = Date.parse(b.priority_until || '') > now ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
  });
}

function getRetainedArtworks() {
  return sortArtworks(state.artworks.filter(isArtworkWithinRetention)).slice(0, MAX_ARTWORK_POOL);
}

function shuffleItems(items) {
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function syncArtworkDeck(pool) {
  const signature = pool.map(item => `${item.id}:${item.created_at || ''}:${item.expires_at || ''}`).join('|');
  if (signature && signature === state.artworkDeckSignature && state.artworkRotationDeck.length) return false;
  const now = Date.now();
  const priorityIds = pool
    .filter(item => Date.parse(item.priority_until || '') > now)
    .map(item => item.id);
  const prioritySet = new Set(priorityIds);
  const randomIds = shuffleItems(pool.map(item => item.id).filter(id => !prioritySet.has(id)));
  state.artworkRotationDeck = priorityIds.concat(randomIds);
  state.artworkRotationCursor = 0;
  state.artworkDeckSignature = signature;
  return true;
}

function takeNextArtworkIds(pool) {
  const slotCount = Math.min(ARTWORK_SLOT_COUNT, pool.length);
  const poolIds = pool.map(item => item.id);
  const validIds = new Set(poolIds);
  const result = [];
  const used = new Set();
  if (!state.artworkRotationDeck.length) {
    state.artworkRotationDeck = shuffleItems(poolIds);
    state.artworkRotationCursor = 0;
  }
  let attempts = 0;
  while (result.length < slotCount && attempts < state.artworkRotationDeck.length * 2) {
    const id = state.artworkRotationDeck[state.artworkRotationCursor % state.artworkRotationDeck.length];
    state.artworkRotationCursor = (state.artworkRotationCursor + 1) % state.artworkRotationDeck.length;
    attempts += 1;
    if (!validIds.has(id) || used.has(id)) continue;
    result.push(id);
    used.add(id);
  }
  if (result.length < slotCount) {
    poolIds.forEach(id => {
      if (result.length < slotCount && !used.has(id)) {
        result.push(id);
        used.add(id);
      }
    });
  }
  return result;
}

function syncArtworkSlots({ advance = false } = {}) {
  const pool = getRetainedArtworks();
  state.artworks = pool;
  const counter = $('artworkCounter');
  if (counter) counter.textContent = String(pool.length);
  if (!pool.length) {
    state.displayedArtworkIds = [];
    state.artworkRotationDeck = [];
    state.artworkRotationCursor = 0;
    state.artworkDeckSignature = '';
    return pool;
  }
  const deckChanged = syncArtworkDeck(pool);
  const poolIdSet = new Set(pool.map(item => item.id));
  const validDisplayedIds = state.displayedArtworkIds.filter(id => poolIdSet.has(id));
  const shouldAdvance = advance || deckChanged || validDisplayedIds.length !== Math.min(ARTWORK_SLOT_COUNT, pool.length);
  state.displayedArtworkIds = shouldAdvance ? takeNextArtworkIds(pool) : validDisplayedIds;
  return pool;
}

function getDisplayedArtworks() {
  const byId = new Map(state.artworks.map(item => [item.id, item]));
  return state.displayedArtworkIds.map(id => byId.get(id)).filter(Boolean);
}

function normalizeArtwork(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    user_id: row.user_id || '',
    room_id: row.room_id || ROOM_ID,
    title: String(row.title || '無題').trim() || '無題',
    display_name: String(row.display_name || row.name || '投稿者').trim() || '投稿者',
    avatar: String(row.avatar || 'mao').trim() || 'mao',
    image_url: row.image_url || row.public_url || '',
    thumbnail_url: row.thumbnail_url || row.thumb_url || row.image_url || '',
    storage_path: row.storage_path || '',
    thumbnail_path: row.thumbnail_path || '',
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    mime_type: row.mime_type || '',
    file_size: Number(row.file_size) || 0,
    created_at: row.created_at || row.submitted_at || nowIso(),
    expires_at: row.expires_at || '',
    priority_until: row.priority_until || '',
    deleted_at: row.deleted_at || '',
    moderation_status: row.moderation_status || 'visible',
    is_sample: Boolean(row.is_sample)
  };
}

async function loadArtworks() {
  let loaded = [];
  try {
    const supabase = await ensureSupabase();
    const visibleSince = new Date(Date.now() - ARTWORK_RETENTION_MS).toISOString();
    const { data, error } = await supabase
      .from('plaza_artworks')
      .select('id,user_id,room_id,storage_path,thumbnail_path,image_url,thumbnail_url,title,display_name,avatar,width,height,mime_type,file_size,created_at,expires_at,priority_until,deleted_at,moderation_status')
      .eq('room_id', ROOM_ID)
      .eq('moderation_status', 'visible')
      .is('deleted_at', null)
      .gt('expires_at', nowIso())
      .gt('created_at', visibleSince)
      .order('created_at', { ascending: false })
      .limit(MAX_ARTWORK_POOL);
    if (error) throw error;
    loaded = (data || []).map(normalizeArtwork).filter(item => item?.id && isArtworkWithinRetention(item));
    setStatus(loaded.length ? '広場に接続中' : '投稿待ち');
  } catch (error) {
    loaded = SAMPLE_ARTWORKS.map(normalizeArtwork);
    setStatus('オフライン表示中。移動と吹き出しは使えます');
    console.warn('[plaza] artwork load skipped', error);
  }
  state.artworks = sortArtworks(loaded.length ? loaded : SAMPLE_ARTWORKS.map(normalizeArtwork));
  updateArtworkRotation(true);
  renderArtworkWall();
}

function updateArtworkRotation(force = false) {
  const pool = syncArtworkSlots({ advance: force });
  const next = state.messageMode === 'image' && state.currentArtworkId
    ? pool.find(item => item.id === state.currentArtworkId) || null
    : null;
  if (state.messageMode === 'image' && state.currentArtworkId && !next) {
    setWorldMessageMode({ clearArtwork: true });
    renderArtworkWall();
    return;
  }
  const nextId = next?.id || '';
  const changed = nextId !== state.currentArtworkId;
  if (!force && !changed) {
    renderArtworkWall();
    return;
  }
  state.currentArtwork = next;
  state.currentArtworkId = nextId;
  renderArtwork();
  renderArtworkWall();
  if (force || changed) {
    loadCommentsForCurrentArtwork();
    subscribeCurrentArtworkComments();
  }
}

function renderArtwork() {
  const artwork = state.currentArtwork;
  const imageUrl = artwork?.image_url || '';
  const thumbUrl = artwork?.thumbnail_url || imageUrl;
  const title = artwork?.title || '作品を待っています';
  setImage($('mainArtworkImage'), imageUrl);
  setImage($('airshipArtworkImage'), thumbUrl);
  setImage($('chatArtworkThumb'), thumbUrl);
  setImage($('detailArtworkImage'), imageUrl);
  const empty = $('emptyArtwork');
  if (empty) empty.classList.toggle('is-hidden', Boolean(imageUrl));
  setText('mainArtworkTitle', title);
  setText('chatArtworkTitle', title);
  setText('artworkPanelTitle', title);
  setText('detailArtworkTitle', title);
  setText('chatArtworkAuthor', `投稿者: ${artwork?.display_name || '-'}`);
  setText('chatArtworkExpires', `表示期限: ${artwork?.expires_at ? formatDate(artwork.expires_at) : '-'}`);
  setText('detailArtworkMeta', artwork
    ? `投稿者: ${artwork.display_name || '-'} / ${artwork.width || '-'} x ${artwork.height || '-'} / 表示期限: ${artwork.expires_at ? formatDate(artwork.expires_at) : '-'}`
    : '-');
  updateReplyTargetUi();
  updateArtworkActionUi();
}

function updateReplyTargetUi() {
  const artwork = state.currentArtwork;
  const label = $('replyTargetLabel');
  const input = $('chatInput');
  const text = getReplyLabel(artwork);
  if (label) label.textContent = text;
  if (input) {
    input.placeholder = state.messageMode === 'image'
      ? 'この画像にリプライ'
      : state.messageMode === 'direct'
        ? 'エメラルドグリーンで宛て発言'
        : '/to 名前 本文 または コメント';
  }
}

function isCurrentArtworkOwner() {
  const artwork = state.currentArtwork;
  return Boolean(artwork?.id && !artwork.is_sample && state.authUser?.id && artwork.user_id === state.authUser.id);
}

function updateArtworkActionUi() {
  const artwork = state.currentArtwork;
  const canReport = Boolean(artwork?.id && !artwork.is_sample);
  const reportButton = $('reportArtworkButton');
  if (reportButton) {
    reportButton.disabled = !canReport;
    reportButton.hidden = !canReport;
  }
  const deleteButton = $('deleteArtworkButton');
  if (deleteButton) {
    deleteButton.hidden = !isCurrentArtworkOwner();
    deleteButton.disabled = !isCurrentArtworkOwner();
  }
}

function setImage(img, src) {
  if (!img) return;
  img.src = src || '';
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value || '';
}

function getArtworkTilePosition(index) {
  const stepX = 400;
  const startX = 220;
  const startY = 320;
  return {
    x: startX + index * stepX,
    y: startY
  };
}

function getArtworkBubblePosition(index) {
  const positions = [
    { x: -42, y: -28 },
    { x: 148, y: -38 },
    { x: 232, y: 42 },
    { x: 178, y: 228 },
    { x: -34, y: 202 },
    { x: -70, y: 78 }
  ];
  return positions[index % positions.length];
}

function pruneArtworkBubbles() {
  const now = Date.now();
  state.artworkBubbles.forEach((items, artworkId) => {
    const next = items.filter(item => item.until > now);
    if (next.length) {
      state.artworkBubbles.set(artworkId, next);
    } else {
      state.artworkBubbles.delete(artworkId);
    }
  });
}

function getArtworkBubbles(artworkId) {
  pruneArtworkBubbles();
  return (state.artworkBubbles.get(String(artworkId || '')) || []).slice(-4);
}

function addArtworkBubble(artworkId, bubble = {}) {
  const id = String(artworkId || '');
  const body = String(bubble.body || '').trim().slice(0, 120);
  if (!id || !body) return;
  const items = state.artworkBubbles.get(id) || [];
  const next = items
    .filter(item => item.id !== bubble.id)
    .concat({
      id: bubble.id || makeId('art-bubble'),
      body,
      displayName: String(bubble.displayName || bubble.display_name || 'ゲスト').slice(0, 32),
      createdAt: bubble.createdAt || bubble.created_at || nowIso(),
      until: Date.now() + ARTWORK_REPLY_BUBBLE_MS
    })
    .slice(-8);
  state.artworkBubbles.set(id, next);
}

function renderArtworkReplyBubbles(tile, artwork) {
  const bubbles = getArtworkBubbles(artwork.id);
  if (!bubbles.length) return;
  const layer = document.createElement('span');
  layer.className = 'plaza-artwork-replies';
  bubbles.forEach((bubble, index) => {
    const position = getArtworkBubblePosition(index);
    const item = document.createElement('span');
    item.className = 'plaza-artwork-reply';
    item.style.setProperty('--reply-x', `${position.x}px`);
    item.style.setProperty('--reply-y', `${position.y}px`);
    const name = document.createElement('span');
    name.className = 'plaza-artwork-reply__name';
    name.textContent = bubble.displayName || 'ゲスト';
    const text = document.createElement('span');
    text.className = 'plaza-artwork-reply__text';
    text.textContent = bubble.body;
    item.append(name, text);
    layer.appendChild(item);
  });
  tile.appendChild(layer);
}

function renderArtworkWall() {
  const wall = $('artworkWall');
  const empty = $('emptyArtworkWall');
  if (!wall) return;
  const items = getDisplayedArtworks();
  wall.textContent = '';
  if (empty) empty.classList.toggle('is-hidden', Boolean(state.artworks.length));
  const fragment = document.createDocumentFragment();
  items.forEach((artwork, index) => {
    const position = getArtworkTilePosition(index);
    const button = document.createElement('button');
    const isSelected = state.messageMode === 'image' && artwork.id === state.currentArtworkId;
    button.className = `plaza-artwork-tile${isSelected ? ' is-selected' : ''}`;
    button.type = 'button';
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    button.setAttribute('aria-label', `${artwork.title || '無題'}にリプライ`);
    button.setAttribute('aria-pressed', String(isSelected));

    const imageWrap = document.createElement('span');
    imageWrap.className = 'plaza-artwork-tile__image';
    const img = document.createElement('img');
    img.src = artwork.thumbnail_url || artwork.image_url || '';
    img.alt = '';
    imageWrap.appendChild(img);

    const meta = document.createElement('span');
    meta.className = 'plaza-artwork-tile__meta';
    const title = document.createElement('span');
    title.className = 'plaza-artwork-tile__title';
    title.textContent = artwork.title || '無題';
    const sub = document.createElement('span');
    sub.className = 'plaza-artwork-tile__sub';
    sub.textContent = `${artwork.display_name || '投稿者'} / ${getArtworkRemainingLabel(artwork)}`;
    meta.append(title, sub);

    button.append(imageWrap, meta);
    renderArtworkReplyBubbles(button, artwork);
    button.addEventListener('click', () => {
      selectArtwork(artwork.id, { focusInput: true, announce: true });
    });
    fragment.appendChild(button);
  });
  wall.appendChild(fragment);
}

function setWorldMessageMode({ clearArtwork = false, announce = false } = {}) {
  state.messageMode = 'world';
  state.directTargetName = '';
  state.directTargetArtworkId = '';
  if (clearArtwork) {
    state.currentArtwork = null;
    state.currentArtworkId = '';
    state.comments = [];
    state.commentIds.clear();
    renderArtwork();
    renderComments();
    subscribeCurrentArtworkComments();
  }
  updateReplyTargetUi();
  renderArtworkWall();
  if (announce) showSceneNotice('ワールド発言に切り替えました');
}

function setDirectMessageMode(target = {}, options = {}) {
  const name = normalizeTargetName(target.name || target.display_name || target.displayName);
  if (!name) {
    showSceneNotice('宛て先のユーザーがありません');
    return false;
  }
  state.messageMode = 'direct';
  state.directTargetName = name;
  state.directTargetArtworkId = String(target.artworkId || target.artwork_id || '');
  if (options.clearArtwork) {
    state.currentArtwork = null;
    state.currentArtworkId = '';
    state.comments = [];
    state.commentIds.clear();
    renderArtwork();
    renderComments();
    subscribeCurrentArtworkComments();
  }
  updateReplyTargetUi();
  renderArtworkWall();
  if (options.announce) showSceneNotice(`@${name} へエメラルド発言します`);
  return true;
}

function setImageReplyMode(artwork, options = {}) {
  if (!artwork?.id) {
    showSceneNotice('リプライする画像がありません');
    return false;
  }
  state.currentArtwork = artwork;
  state.currentArtworkId = artwork.id;
  state.messageMode = 'image';
  state.directTargetName = normalizeTargetName(artwork.display_name);
  state.directTargetArtworkId = artwork.id;
  updateReplyTargetUi();
  renderArtworkWall();
  if (options.announce) showSceneNotice(`「${artwork.title || '無題'}」へ画像リプライします`);
  return true;
}

function rotateArtworkSlots() {
  syncArtworkSlots({ advance: true });
  if (state.currentArtworkId) {
    const current = state.artworks.find(item => item.id === state.currentArtworkId) || null;
    if (!current) {
      setWorldMessageMode({ clearArtwork: true });
      renderArtwork();
    } else {
      state.currentArtwork = current;
      if (state.messageMode === 'image' && state.directTargetArtworkId === current.id) {
        state.directTargetName = normalizeTargetName(current.display_name);
      }
      updateReplyTargetUi();
    }
  }
  renderArtworkWall();
}

function selectArtwork(artworkId, options = {}) {
  const artwork = state.artworks.find(item => item.id === artworkId);
  if (!artwork) return;
  const changed = artwork.id !== state.currentArtworkId;
  setImageReplyMode(artwork);
  renderArtwork();
  renderArtworkWall();
  if (changed) {
    loadCommentsForCurrentArtwork();
    subscribeCurrentArtworkComments();
  }
  if (options.announce) showSceneNotice(`「${artwork.title || '無題'}」へ画像リプライします`);
  if (options.focusInput) {
    window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 40);
  }
}

async function loadCommentsForCurrentArtwork() {
  state.comments = [];
  state.commentIds.clear();
  const artwork = state.currentArtwork;
  if (!artwork || artwork.is_sample) {
    renderComments();
    return;
  }
  try {
    const supabase = await ensureSupabase();
    const { data, error } = await supabase
      .from('plaza_artwork_comments')
      .select('id,artwork_id,user_id,display_name,avatar,body,comment_type,is_paid,gift_type,created_at')
      .eq('artwork_id', artwork.id)
      .eq('moderation_status', 'visible')
      .order('created_at', { ascending: true })
      .limit(80);
    if (error) throw error;
    (data || []).forEach(comment => {
      addComment(comment);
      addArtworkBubble(artwork.id, {
        id: comment.id,
        body: comment.body,
        displayName: comment.display_name,
        createdAt: comment.created_at
      });
    });
  } catch (error) {
    console.warn('[plaza] comments load skipped', error);
  }
  renderComments();
}

function addComment(comment) {
  if (!comment?.id || state.commentIds.has(comment.id)) return;
  state.commentIds.add(comment.id);
  const body = String(comment.body || '').slice(0, 280);
  state.comments.push({
    id: comment.id,
    display_name: String(comment.display_name || 'ゲスト').slice(0, 32),
    avatar: String(comment.avatar || 'mao'),
    body,
    bubble_body: formatBubbleBody(body),
    comment_type: comment.comment_type || 'comment',
    chat_mode: comment.chat_mode === 'direct' ? 'direct' : 'world',
    target_name: normalizeTargetName(comment.target_name),
    is_paid: Boolean(comment.is_paid),
    created_at: comment.created_at || nowIso(),
    is_live: Boolean(comment.is_live)
  });
  if (state.comments.length > MAX_COMMENT_ITEMS) {
    const removed = state.comments.splice(0, state.comments.length - MAX_COMMENT_ITEMS);
    removed.forEach(item => state.commentIds.delete(item.id));
  }
}

function renderComments() {
  const list = $('commentList');
  if (!list) return;
  list.textContent = '';
  if (!state.comments.length) {
    const empty = document.createElement('li');
    empty.className = 'comment-empty';
    empty.textContent = 'コメントはまだありません';
    list.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  state.comments.forEach(comment => {
    const item = document.createElement('li');
    item.className = `comment-item${comment.is_live ? ' is-live' : ''}${comment.is_paid ? ' is-paid' : ''}`;

    const avatar = document.createElement('img');
    avatar.className = 'comment-item__avatar';
    avatar.src = getAvatarSrc(comment.avatar);
    avatar.alt = '';

    const body = document.createElement('div');
    body.className = 'comment-item__body';

    const meta = document.createElement('div');
    meta.className = 'comment-item__meta';

    const name = document.createElement('span');
    name.className = 'comment-item__name';
    name.textContent = comment.display_name;

    const time = document.createElement('span');
    time.textContent = formatTime(comment.created_at);

    const text = document.createElement('p');
    text.className = 'comment-item__text';
    text.textContent = comment.body;

    meta.append(name, time);
    body.append(meta, text);
    item.append(avatar, body);
    fragment.appendChild(item);
  });
  list.appendChild(fragment);
  list.scrollTop = list.scrollHeight;
}

async function subscribeRealtime() {
  try {
    const supabase = await ensureSupabase();
    const channel = supabase.channel(`plaza-room-${ROOM_ID}`, {
      config: {
        presence: { key: state.presenceId },
        broadcast: { self: false }
      }
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        syncPresenceState(channel.presenceState());
      })
      .on('broadcast', { event: 'comment:new' }, ({ payload }) => {
        handleCommentBroadcast(payload);
      })
      .on('broadcast', { event: 'avatar:state' }, ({ payload }) => {
        handleAvatarStateBroadcast(payload);
      })
      .on('broadcast', { event: 'bubble' }, ({ payload }) => {
        handleBubbleBroadcast(payload);
      })
      .on('broadcast', { event: 'artwork:new' }, ({ payload }) => {
        handleNewArtworkBroadcast(payload);
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          state.realtimeChannel = channel;
          await trackPresence(true);
          setStatus('広場に接続中');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus('Realtimeへ接続できませんでした');
        }
      });
  } catch (error) {
    console.warn('[plaza] realtime skipped', error);
    setStatus('オフライン表示中。移動と吹き出しは使えます');
  }
}

async function subscribeArtworkChanges() {
  try {
    const supabase = await ensureSupabase();
    const channel = supabase
      .channel(`plaza-artworks-${ROOM_ID}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'plaza_artworks',
        filter: `room_id=eq.${ROOM_ID}`
      }, payload => {
        handleArtworkChange(payload);
      })
      .subscribe();
    state.artworksChannel = channel;
  } catch (error) {
    console.warn('[plaza] artwork subscription skipped', error);
  }
}

function handleArtworkChange(payload) {
  const eventType = payload?.eventType || '';
  const oldId = payload?.old?.id ? String(payload.old.id) : '';
  const next = normalizeArtwork(payload?.new);
  const isVisible = next?.id
    && next.room_id === ROOM_ID
    && !next.deleted_at
    && next.moderation_status !== 'hidden'
    && next.moderation_status !== 'review'
    && next.moderation_status !== 'deleted'
    && isArtworkWithinRetention(next);
  if (eventType === 'DELETE' || !isVisible) {
    removeArtworkById(next?.id || oldId);
    return;
  }
  upsertArtwork(next, eventType === 'INSERT');
  if (eventType === 'INSERT') showSceneNotice('新しい作品が届きました');
}

function removeArtworkById(artworkId) {
  const id = String(artworkId || '');
  if (!id) return;
  const wasCurrent = state.currentArtworkId === id;
  state.artworks = state.artworks.filter(item => item.id !== id);
  if (wasCurrent) {
    setWorldMessageMode({ clearArtwork: true });
  }
  updateArtworkRotation(true);
  renderArtworkWall();
  renderComments();
}

async function subscribeCurrentArtworkComments() {
  if (state.commentsChannel && state.supabase) {
    try {
      await state.supabase.removeChannel(state.commentsChannel);
    } catch (_error) {}
    state.commentsChannel = null;
  }
  const artwork = state.currentArtwork;
  if (!artwork || artwork.is_sample) return;
  try {
    const supabase = await ensureSupabase();
    const channel = supabase
      .channel(`plaza-comments-${artwork.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'plaza_artwork_comments',
        filter: `artwork_id=eq.${artwork.id}`
      }, payload => {
        addComment(payload.new);
        addArtworkBubble(artwork.id, {
          id: payload.new?.id,
          body: payload.new?.body,
          displayName: payload.new?.display_name,
          createdAt: payload.new?.created_at
        });
        renderComments();
        renderArtworkWall();
      })
      .subscribe();
    state.commentsChannel = channel;
  } catch (error) {
    console.warn('[plaza] comment subscription skipped', error);
  }
}

function syncPresenceState(presenceState) {
  const livePresenceIds = new Set();
  Object.values(presenceState || {}).forEach(entries => {
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const avatar = normalizeRemoteAvatar(entry);
      if (!avatar) return;
      livePresenceIds.add(avatar.clientId);
      if (isAvatarWithinInterestRange(avatar, REMOTE_AVATAR_INTEREST_PADDING * 1.5)) {
        upsertRemoteAvatar(avatar, { render: false });
      }
    });
  });
  state.remoteAvatars.forEach((_avatar, id) => {
    if (livePresenceIds.size && !livePresenceIds.has(id)) {
      state.remoteAvatars.delete(id);
      fadeOutAvatar(id, state.avatarElements.get(id));
    }
  });
  updateParticipantCount();
  renderAvatars();
}

function normalizeRemoteAvatar(payload) {
  if (!payload || payload.presenceId === state.presenceId) return null;
  const peerId = String(payload.presenceId || payload.clientId || '');
  if (!peerId) return null;
  const targetX = clampWorldX(Number(payload.x) || WORLD_WIDTH / 2);
  const targetY = clampWorldY(Number(payload.y) || WORLD_HEIGHT / 2);
  return {
    clientId: peerId,
    guestClientId: String(payload.clientId || ''),
    presenceId: peerId,
    name: String(payload.name || 'ゲスト').slice(0, 32),
    avatar: String(payload.avatar || 'mao'),
    x: targetX,
    y: targetY,
    targetX,
    targetY,
    renderX: targetX,
    renderY: targetY,
    bubble: String(payload.bubble || '').slice(0, 120),
    bubbleMode: normalizeBubbleMode(payload.bubbleMode),
    bubbleTargetName: normalizeTargetName(payload.bubbleTargetName),
    bubbleTargetArtworkId: String(payload.bubbleTargetArtworkId || payload.targetArtworkId || ''),
    bubbleUntil: Number(payload.bubbleUntil) || 0,
    walking: Boolean(payload.walking),
    updatedAt: Number(payload.updatedAt) || Date.now()
  };
}

function upsertRemoteAvatar(payload, options = {}) {
  const shouldRender = options.render !== false;
  const avatar = normalizeRemoteAvatar(payload);
  if (!avatar) return;
  const existing = state.remoteAvatars.get(avatar.clientId);
  if (existing) {
    const previousRenderX = Number(existing.renderX ?? existing.x ?? avatar.x);
    const previousRenderY = Number(existing.renderY ?? existing.y ?? avatar.y);
    const shouldWarp = Math.abs(avatar.x - previousRenderX) > REMOTE_AVATAR_WARP_DISTANCE;
    avatar.renderX = shouldWarp ? avatar.x : previousRenderX;
    avatar.renderY = shouldWarp ? avatar.y : previousRenderY;
  }
  state.remoteAvatars.set(avatar.clientId, {
    ...existing,
    ...avatar
  });
  if (shouldRender) {
    updateParticipantCount();
    renderAvatars();
  }
}

function handleAvatarStateBroadcast(payload) {
  const avatar = normalizeRemoteAvatar(payload);
  if (!avatar) return;
  if (!isAvatarWithinInterestRange(avatar, REMOTE_AVATAR_INTEREST_PADDING * 1.5)) {
    state.remoteAvatars.delete(avatar.clientId);
    fadeOutAvatar(avatar.clientId, state.avatarElements.get(avatar.clientId));
    return;
  }
  upsertRemoteAvatar(avatar);
}

function pruneRemoteAvatars() {
  const now = Date.now();
  state.remoteAvatars.forEach((avatar, id) => {
    const updatedAt = Number(avatar.updatedAt) || 0;
    const hasLiveBubble = avatar.bubble && avatar.bubbleUntil > now;
    if (!hasLiveBubble && updatedAt && now - updatedAt > REMOTE_AVATAR_STALE_MS) {
      state.remoteAvatars.delete(id);
      removeAvatarElement(id);
    }
  });
}

function updateParticipantCount() {
  pruneRemoteAvatars();
  const count = Math.max(1, state.remoteAvatars.size + 1);
  setText('participantCount', String(count));
}

async function trackPresence(force = false) {
  const now = Date.now();
  if (!force && now - state.lastPresenceAt < REMOTE_AVATAR_SEND_MS) return;
  const payload = buildLocalPresencePayload(now);
  const snapshot = JSON.stringify(payload);
  if (!force && snapshot === state.lastPresenceSnapshot && now - state.lastPresenceAt < 1200) return;
  state.lastPresenceSnapshot = snapshot;
  state.lastPresenceAt = now;
  if (state.realtimeChannel) {
    try {
      await state.realtimeChannel.track(payload);
    } catch (error) {
      console.warn('[plaza] presence track failed', error);
    }
    await broadcastAvatarState(payload, force);
  }
  await upsertPresenceRow(payload, force);
}

function buildLocalPresencePayload(now = Date.now()) {
  return {
    presenceId: state.presenceId,
    clientId: state.clientId,
    userId: state.authUser?.id || '',
    name: getDisplayName(),
    avatar: getAvatarId(),
    x: quantizeAvatarX(state.localAvatar.x),
    y: Math.round(state.localAvatar.y * 10) / 10,
    bubble: state.localAvatar.bubbleUntil > now ? state.localAvatar.bubble : '',
    bubbleMode: state.localAvatar.bubbleMode,
    bubbleTargetName: state.localAvatar.bubbleTargetName,
    bubbleTargetArtworkId: state.localAvatar.bubbleTargetArtworkId,
    bubbleUntil: state.localAvatar.bubbleUntil,
    walking: state.localAvatar.walking,
    updatedAt: now
  };
}

async function broadcastAvatarState(payload, force = false) {
  const now = Date.now();
  if (!state.realtimeChannel) return;
  if (!force && now - state.lastAvatarBroadcastAt < 1000) return;
  state.lastAvatarBroadcastAt = now;
  try {
    await state.realtimeChannel.send({
      type: 'broadcast',
      event: 'avatar:state',
      payload
    });
  } catch (error) {
    console.warn('[plaza] avatar broadcast failed', error);
  }
}

async function upsertPresenceRow(payload, force = false) {
  if (!state.presenceDbAvailable) return;
  const now = Date.now();
  if (!force && now - state.lastPresenceDbWriteAt < PRESENCE_DB_WRITE_MS) return;
  state.lastPresenceDbWriteAt = now;
  try {
    const supabase = await ensureSupabase();
    const { error } = await supabase
      .from('plaza_presence')
      .upsert({
        room_id: ROOM_ID,
        presence_id: payload.presenceId,
        client_id: payload.clientId,
        user_id: payload.userId || null,
        display_name: payload.name,
        avatar: payload.avatar,
        x: payload.x,
        y: payload.y,
        bubble: payload.bubble || null,
        bubble_mode: normalizeBubbleMode(payload.bubbleMode),
        bubble_target_name: payload.bubbleTargetName || null,
        bubble_target_artwork_id: payload.bubbleTargetArtworkId || null,
        bubble_until: payload.bubbleUntil ? new Date(payload.bubbleUntil).toISOString() : null,
        walking: Boolean(payload.walking),
        updated_at: new Date(now).toISOString(),
        expires_at: new Date(now + PRESENCE_TTL_MS).toISOString()
      }, { onConflict: 'room_id,presence_id' });
    if (error) throw error;
  } catch (error) {
    state.presenceDbAvailable = false;
    console.warn('[plaza] presence db fallback disabled', error);
  }
}

function normalizePresenceRow(row) {
  if (!row) return null;
  const bubbleUntil = Date.parse(row.bubble_until || '');
  return normalizeRemoteAvatar({
    presenceId: row.presence_id,
    clientId: row.client_id,
    userId: row.user_id,
    name: row.display_name,
    avatar: row.avatar,
    x: row.x,
    y: row.y,
    bubble: row.bubble,
    bubbleMode: row.bubble_mode,
    bubbleTargetName: row.bubble_target_name,
    bubbleTargetArtworkId: row.bubble_target_artwork_id,
    bubbleUntil: Number.isFinite(bubbleUntil) ? bubbleUntil : 0,
    walking: row.walking,
    updatedAt: Date.parse(row.updated_at || '') || Date.now()
  });
}

async function pollPresenceRows() {
  if (!state.presenceDbAvailable) return;
  try {
    const supabase = await ensureSupabase();
    const { minX, maxX } = getRemoteInterestBounds(REMOTE_AVATAR_INTEREST_PADDING * 1.5);
    const { data, error } = await supabase
      .from('plaza_presence')
      .select('room_id,presence_id,client_id,user_id,display_name,avatar,x,y,bubble,bubble_mode,bubble_target_name,bubble_target_artwork_id,bubble_until,walking,updated_at,expires_at')
      .eq('room_id', ROOM_ID)
      .gt('expires_at', nowIso())
      .gte('x', minX)
      .lte('x', maxX)
      .order('updated_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    (data || []).forEach(row => {
      const avatar = normalizePresenceRow(row);
      if (!avatar) return;
      upsertRemoteAvatar(avatar, { render: false });
      if (avatar.bubbleMode === 'image' && avatar.bubbleTargetArtworkId && avatar.bubble && avatar.bubbleUntil > Date.now()) {
        addArtworkBubble(avatar.bubbleTargetArtworkId, {
          id: `presence-${avatar.clientId}-${avatar.bubbleUntil}`,
          body: avatar.bubble,
          displayName: avatar.name,
          createdAt: avatar.updatedAt ? new Date(avatar.updatedAt).toISOString() : nowIso()
        });
      }
    });
    updateParticipantCount();
    renderAvatars();
  } catch (error) {
    state.presenceDbAvailable = false;
    console.warn('[plaza] presence db poll disabled', error);
  }
}

function handleCommentBroadcast(payload) {
  if (!payload || payload.presenceId === state.presenceId) return;
  const body = String(payload.body || '').trim().slice(0, 280);
  if (!body) return;
  const commentId = String(payload.commentId || makeId('remote-comment'));
  const mode = normalizeBubbleMode(payload.mode);
  const targetArtworkId = String(payload.targetArtworkId || '');
  addComment({
    id: commentId,
    display_name: String(payload.name || 'ゲスト').slice(0, 32),
    avatar: String(payload.avatar || 'mao'),
    body,
    chat_mode: mode,
    target_name: normalizeTargetName(payload.targetName),
    created_at: payload.created_at || nowIso(),
    is_live: true
  });
  renderComments();
  if (mode === 'image' && targetArtworkId) {
    addArtworkBubble(targetArtworkId, {
      id: commentId,
      body,
      displayName: String(payload.name || 'ゲスト').slice(0, 32),
      createdAt: payload.created_at || nowIso()
    });
    renderArtworkWall();
  }
}

function handleBubbleBroadcast(payload) {
  if (!payload || payload.presenceId === state.presenceId) return;
  const peerId = String(payload.presenceId || payload.clientId || '');
  if (!peerId) return;
  const existing = state.remoteAvatars.get(peerId) || {
    clientId: peerId,
    guestClientId: String(payload.clientId || ''),
    presenceId: peerId,
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    avatar: 'mao',
    name: 'ゲスト'
  };
  existing.bubble = String(payload.body || '').slice(0, 120);
  existing.bubbleMode = normalizeBubbleMode(payload.mode);
  existing.bubbleTargetName = normalizeTargetName(payload.targetName);
  existing.bubbleUntil = Date.now() + BUBBLE_DURATION_MS;
  existing.name = String(payload.name || existing.name || 'ゲスト').slice(0, 32);
  existing.avatar = String(payload.avatar || existing.avatar || 'mao');
  const targetX = clampWorldX(Number(payload.x) || existing.targetX || existing.x || WORLD_WIDTH / 2);
  const targetY = clampWorldY(Number(payload.y) || existing.targetY || existing.y || WORLD_HEIGHT / 2);
  const currentRenderX = Number(existing.renderX ?? existing.x ?? targetX);
  const shouldWarp = Math.abs(targetX - currentRenderX) > REMOTE_AVATAR_WARP_DISTANCE;
  existing.x = targetX;
  existing.y = targetY;
  existing.targetX = targetX;
  existing.targetY = targetY;
  existing.renderX = shouldWarp ? targetX : currentRenderX;
  existing.renderY = shouldWarp ? targetY : Number(existing.renderY ?? existing.y ?? targetY);
  existing.walking = Boolean(payload.walking);
  existing.updatedAt = Date.now();
  if (isAvatarWithinInterestRange(existing, REMOTE_AVATAR_INTEREST_PADDING * 1.25)) {
    state.remoteAvatars.set(peerId, existing);
  } else {
    state.remoteAvatars.delete(peerId);
    fadeOutAvatar(peerId, state.avatarElements.get(peerId));
  }
  renderAvatars();
}

function updateRemoteAvatarMotion() {
  state.remoteAvatars.forEach((avatar, id) => {
    const targetX = Number(avatar.targetX ?? avatar.x ?? WORLD_WIDTH / 2);
    const targetY = Number(avatar.targetY ?? avatar.y ?? PLAYER_LANE_Y);
    const currentX = Number(avatar.renderX ?? avatar.x ?? targetX);
    const currentY = Number(avatar.renderY ?? avatar.y ?? targetY);
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    const shouldWarp = Math.abs(dx) > REMOTE_AVATAR_WARP_DISTANCE;
    avatar.renderX = shouldWarp ? targetX : currentX + dx * REMOTE_AVATAR_LERP;
    avatar.renderY = shouldWarp ? targetY : currentY + dy * REMOTE_AVATAR_LERP;
    avatar.walking = Math.abs(dx) > 1.5;
    state.remoteAvatars.set(id, avatar);
  });
}

function handleNewArtworkBroadcast(payload) {
  const artwork = normalizeArtwork(payload?.artwork);
  if (!artwork?.id) return;
  upsertArtwork(artwork, true);
  showSceneNotice('新しい作品が届きました');
}

function upsertArtwork(artwork, prioritize = false) {
  const next = state.artworks.filter(item => item.id !== artwork.id);
  if (prioritize) {
    artwork.priority_until = artwork.priority_until || new Date(Date.now() + 60 * 1000).toISOString();
  }
  next.unshift(artwork);
  state.artworks = sortArtworks(next).filter(isArtworkWithinRetention).slice(0, MAX_ARTWORK_POOL);
  updateArtworkRotation(true);
  renderArtworkWall();
}

function renderAvatars() {
  const layer = $('avatarLayer');
  if (!layer) return;
  const avatars = new Map();
  state.remoteAvatars.forEach((avatar, id) => {
    if (isAvatarWithinInterestRange(avatar) || isAvatarInViewport(avatar, REMOTE_AVATAR_INTEREST_PADDING)) {
      avatars.set(id, avatar);
    }
  });
  avatars.set(state.clientId, {
    clientId: state.clientId,
    name: getDisplayName(),
    avatar: getAvatarId(),
    x: state.localAvatar.x,
    y: state.localAvatar.y,
    bubble: state.localAvatar.bubbleUntil > Date.now() ? state.localAvatar.bubble : '',
    bubbleMode: state.localAvatar.bubbleMode,
    bubbleTargetName: state.localAvatar.bubbleTargetName,
    bubbleUntil: state.localAvatar.bubbleUntil,
    walking: state.localAvatar.walking,
    isSelf: true
  });
  const liveIds = new Set(avatars.keys());
  Array.from(state.avatarElements.keys()).forEach(id => {
    if (id === state.clientId) return;
    if (!liveIds.has(id)) fadeOutAvatar(id, state.avatarElements.get(id));
  });
  avatars.forEach(avatar => {
    let el = state.avatarElements.get(avatar.clientId);
    if (!el) {
      el = createAvatarElement();
      state.avatarElements.set(avatar.clientId, el);
      layer.appendChild(el);
    }
    ensureAvatarVisible(avatar.clientId, el);
    const renderX = avatar.isSelf ? avatar.x : Number(avatar.renderX ?? avatar.x ?? 0);
    const renderY = avatar.isSelf ? avatar.y : Number(avatar.renderY ?? avatar.y ?? PLAYER_LANE_Y);
    el.style.left = `${renderX}px`;
    el.style.top = `${renderY}px`;
    el.classList.toggle('is-self', Boolean(avatar.isSelf));
    el.classList.toggle('is-walking', false);
    const img = el.querySelector('.plaza-avatar__sprite');
    if (img) img.src = getAvatarSrc(avatar.avatar);
    const name = el.querySelector('.plaza-avatar__name');
    if (name) name.textContent = avatar.name || 'ゲスト';
    const bubble = el.querySelector('.plaza-avatar__bubble');
    if (bubble) {
      const visible = avatar.bubble && avatar.bubbleUntil > Date.now();
      bubble.hidden = !visible;
      bubble.classList.toggle('is-direct', visible && avatar.bubbleMode === 'direct');
      bubble.textContent = visible ? formatBubbleText(avatar) : '';
    }
  });
}

function createAvatarElement() {
  const el = document.createElement('div');
  el.className = 'plaza-avatar';
  const bubble = document.createElement('div');
  bubble.className = 'plaza-avatar__bubble';
  bubble.hidden = true;
  const img = document.createElement('img');
  img.className = 'plaza-avatar__sprite';
  img.alt = '';
  const name = document.createElement('div');
  name.className = 'plaza-avatar__name';
  el.append(bubble, img, name);
  return el;
}

function formatBubbleText(avatar) {
  const body = String(avatar?.bubble || '').slice(0, 120);
  if (avatar?.bubbleMode !== 'direct') return formatBubbleBody(body);
  const targetName = normalizeTargetName(avatar.bubbleTargetName);
  return formatBubbleBody(targetName ? `@${targetName} ${body}` : body);
}

function setLocalBubble(body, options = {}) {
  state.localAvatar.bubble = String(body || '').slice(0, 120);
  state.localAvatar.bubbleMode = normalizeBubbleMode(options.mode);
  state.localAvatar.bubbleTargetName = normalizeTargetName(options.targetName);
  state.localAvatar.bubbleTargetArtworkId = String(options.targetArtworkId || '');
  state.localAvatar.bubbleUntil = Date.now() + BUBBLE_DURATION_MS;
  renderAvatars();
  trackPresence(true);
}

async function broadcastBubble(body, options = {}) {
  setLocalBubble(body, options);
  if (!state.realtimeChannel) return;
  try {
    await state.realtimeChannel.send({
      type: 'broadcast',
      event: 'bubble',
      payload: {
        presenceId: state.presenceId,
        clientId: state.clientId,
        commentId: options.commentId || '',
        name: getDisplayName(),
        avatar: getAvatarId(),
        x: quantizeAvatarX(state.localAvatar.x),
        y: Math.round(state.localAvatar.y * 10) / 10,
        walking: state.localAvatar.walking,
        body,
        mode: normalizeBubbleMode(options.mode),
        targetName: normalizeTargetName(options.targetName),
        targetArtworkId: String(options.targetArtworkId || ''),
        created_at: nowIso()
      }
    });
  } catch (error) {
    console.warn('[plaza] bubble broadcast failed', error);
  }
}

async function broadcastComment(body, options = {}) {
  if (!state.realtimeChannel) return;
  try {
    await state.realtimeChannel.send({
      type: 'broadcast',
      event: 'comment:new',
      payload: {
        presenceId: state.presenceId,
        clientId: state.clientId,
        commentId: options.commentId || makeId('comment'),
        name: getDisplayName(),
        avatar: getAvatarId(),
        body: String(body || '').slice(0, 280),
        mode: normalizeBubbleMode(options.mode),
        targetName: normalizeTargetName(options.targetName),
        targetArtworkId: String(options.targetArtworkId || ''),
        created_at: options.createdAt || nowIso()
      }
    });
  } catch (error) {
    console.warn('[plaza] comment broadcast failed', error);
  }
}

function bindMovement() {
  const scene = $('plazaScene');
  if (scene) {
    scene.addEventListener('wheel', event => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      zoomAtClientPoint(state.camera.scale + direction * ZOOM_STEP);
    }, { passive: false });
    scene.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.activePointers.size === 2) {
        state.pendingTap = null;
        state.pinchStart = createPinchSnapshot();
        scene.setPointerCapture?.(event.pointerId);
        return;
      }
      if (event.pointerType === 'touch') {
        state.pendingTap = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false
        };
        scene.focus({ preventScroll: true });
        return;
      }
      const target = screenToWorld(event.clientX, event.clientY);
      setWorldMessageMode({ clearArtwork: true });
      setPathTarget(target.x, target.y);
      scene.focus({ preventScroll: true });
    });
    scene.addEventListener('pointermove', event => {
      if (!state.activePointers.has(event.pointerId)) return;
      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pendingTap?.pointerId === event.pointerId) {
        const distance = Math.hypot(event.clientX - state.pendingTap.x, event.clientY - state.pendingTap.y);
        if (distance > 12) state.pendingTap.moved = true;
      }
      if (state.activePointers.size === 2 && state.pinchStart) {
        event.preventDefault();
        updatePinchZoom();
      }
    }, { passive: false });
    scene.addEventListener('pointerup', event => {
      finishTouchTap(event);
      state.activePointers.delete(event.pointerId);
      if (state.activePointers.size < 2) state.pinchStart = null;
    });
    ['pointercancel', 'pointerleave'].forEach(type => {
      scene.addEventListener(type, event => {
        if (state.pendingTap?.pointerId === event.pointerId) state.pendingTap = null;
        state.activePointers.delete(event.pointerId);
        if (state.activePointers.size < 2) state.pinchStart = null;
      });
    });
  }

  window.addEventListener('keydown', event => {
    const key = normalizeMoveKey(event.key);
    if (!key || isTypingTarget(event.target)) return;
    state.keys.add(key);
    event.preventDefault();
  });
  window.addEventListener('keyup', event => {
    const key = normalizeMoveKey(event.key);
    if (!key) return;
    state.keys.delete(key);
  });
  $('centerAvatar')?.addEventListener('click', () => {
    updateCamera();
  });
  $('zoomOutButton')?.addEventListener('click', () => zoomAtAvatar(state.camera.scale - ZOOM_STEP));
  $('zoomInButton')?.addEventListener('click', () => zoomAtAvatar(state.camera.scale + ZOOM_STEP));
}

function finishTouchTap(event) {
  const tap = state.pendingTap;
  if (!tap || tap.pointerId !== event.pointerId) return;
  state.pendingTap = null;
  if (tap.moved || state.pinchStart || state.activePointers.size > 1) return;
  const target = screenToWorld(tap.x, tap.y);
  setWorldMessageMode({ clearArtwork: true });
  setPathTarget(target.x, target.y);
}

function zoomAtAvatar(nextScale) {
  zoomAtClientPoint(nextScale);
}

function zoomAtClientPoint(nextScale) {
  state.camera.scale = clamp(Number(nextScale) || 1, MIN_ZOOM, MAX_ZOOM);
  updateCamera();
  updateZoomLabel();
}

function createPinchSnapshot() {
  const points = Array.from(state.activePointers.values()).slice(0, 2);
  const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
  return {
    distance,
    scale: state.camera.scale
  };
}

function updatePinchZoom() {
  const points = Array.from(state.activePointers.values()).slice(0, 2);
  if (points.length < 2 || !state.pinchStart) return;
  const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
  const nextScale = state.pinchStart.scale * (distance / state.pinchStart.distance);
  zoomAtClientPoint(nextScale);
}

function updateZoomLabel() {
  const label = $('zoomLabel');
  if (label) label.textContent = `${Math.round(state.camera.scale * 100)}%`;
}

function setPathTarget(x, y) {
  const target = { x: clampWorldX(x), y: PLAYER_LANE_Y };
  state.localAvatar.targetX = target.x;
  state.localAvatar.targetY = target.y;
  state.localAvatar.path = [target];
  showMoveTarget(target);
}

function showMoveTarget(target) {
  const marker = $('moveTargetMarker');
  if (!marker) return;
  marker.hidden = false;
  marker.style.left = `${target.x}px`;
  marker.style.top = `${target.y}px`;
  window.clearTimeout(state.moveMarkerTimer);
  state.moveMarkerTimer = window.setTimeout(() => {
    marker.hidden = true;
  }, 1200);
}

function findNearestWalkablePoint(x, y) {
  const gx = clamp(Math.floor(x / GRID_SIZE), 0, Math.floor(WORLD_WIDTH / GRID_SIZE) - 1);
  const gy = clamp(Math.floor(y / GRID_SIZE), 0, Math.floor(WORLD_HEIGHT / GRID_SIZE) - 1);
  if (!isGridBlocked(gx, gy)) return gridToPoint(gx, gy);
  const maxRadius = 8;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let yy = gy - radius; yy <= gy + radius; yy += 1) {
      for (let xx = gx - radius; xx <= gx + radius; xx += 1) {
        if (Math.abs(xx - gx) !== radius && Math.abs(yy - gy) !== radius) continue;
        if (xx < 0 || yy < 0 || xx >= WORLD_WIDTH / GRID_SIZE || yy >= WORLD_HEIGHT / GRID_SIZE) continue;
        if (!isGridBlocked(xx, yy)) return gridToPoint(xx, yy);
      }
    }
  }
  return { x: clampWorldX(x), y: clampWorldY(y) };
}

function pointToGrid(point) {
  return {
    x: clamp(Math.floor(point.x / GRID_SIZE), 0, Math.floor(WORLD_WIDTH / GRID_SIZE) - 1),
    y: clamp(Math.floor(point.y / GRID_SIZE), 0, Math.floor(WORLD_HEIGHT / GRID_SIZE) - 1)
  };
}

function gridToPoint(gx, gy) {
  return {
    x: clampWorldX(gx * GRID_SIZE + GRID_SIZE / 2),
    y: clampWorldY(gy * GRID_SIZE + GRID_SIZE / 2)
  };
}

function gridKey(x, y) {
  return `${x},${y}`;
}

function findPath(startPoint, endPoint) {
  const start = pointToGrid(startPoint);
  const goal = pointToGrid(endPoint);
  if (isGridBlocked(start.x, start.y) || isGridBlocked(goal.x, goal.y)) {
    return [endPoint];
  }
  const open = [start];
  const cameFrom = new Map();
  const gScore = new Map([[gridKey(start.x, start.y), 0]]);
  const fScore = new Map([[gridKey(start.x, start.y), heuristic(start, goal)]]);
  const openKeys = new Set([gridKey(start.x, start.y)]);
  const closed = new Set();
  const dirs = [
    { x: 1, y: 0, cost: 1 },
    { x: -1, y: 0, cost: 1 },
    { x: 0, y: 1, cost: 1 },
    { x: 0, y: -1, cost: 1 },
    { x: 1, y: 1, cost: 1.4 },
    { x: 1, y: -1, cost: 1.4 },
    { x: -1, y: 1, cost: 1.4 },
    { x: -1, y: -1, cost: 1.4 }
  ];
  let guard = 0;
  while (open.length && guard < 2200) {
    guard += 1;
    let currentIndex = 0;
    let currentScore = Infinity;
    for (let i = 0; i < open.length; i += 1) {
      const score = fScore.get(gridKey(open[i].x, open[i].y)) ?? Infinity;
      if (score < currentScore) {
        currentScore = score;
        currentIndex = i;
      }
    }
    const current = open.splice(currentIndex, 1)[0];
    const currentKey = gridKey(current.x, current.y);
    openKeys.delete(currentKey);
    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(cameFrom, current).concat([endPoint]).filter(Boolean);
    }
    closed.add(currentKey);
    for (const dir of dirs) {
      const neighbor = { x: current.x + dir.x, y: current.y + dir.y };
      if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= WORLD_WIDTH / GRID_SIZE || neighbor.y >= WORLD_HEIGHT / GRID_SIZE) continue;
      if (isGridBlocked(neighbor.x, neighbor.y)) continue;
      if (dir.x && dir.y && (isGridBlocked(current.x + dir.x, current.y) || isGridBlocked(current.x, current.y + dir.y))) continue;
      const neighborKey = gridKey(neighbor.x, neighbor.y);
      if (closed.has(neighborKey)) continue;
      const tentative = (gScore.get(currentKey) ?? Infinity) + dir.cost;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue;
      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentative);
      fScore.set(neighborKey, tentative + heuristic(neighbor, goal));
      if (!openKeys.has(neighborKey)) {
        open.push(neighbor);
        openKeys.add(neighborKey);
      }
    }
  }
  return [endPoint];
}

function heuristic(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function reconstructPath(cameFrom, current) {
  const path = [];
  let cursor = current;
  let cursorKey = gridKey(cursor.x, cursor.y);
  while (cameFrom.has(cursorKey)) {
    path.unshift(gridToPoint(cursor.x, cursor.y));
    cursor = cameFrom.get(cursorKey);
    cursorKey = gridKey(cursor.x, cursor.y);
  }
  return simplifyPath(path);
}

function simplifyPath(path) {
  if (!Array.isArray(path) || path.length <= 2) return path || [];
  const simplified = [path[0]];
  let lastDx = 0;
  let lastDy = 0;
  for (let i = 1; i < path.length; i += 1) {
    const previous = path[i - 1];
    const current = path[i];
    const dx = Math.sign(current.x - previous.x);
    const dy = Math.sign(current.y - previous.y);
    if (i > 1 && (dx !== lastDx || dy !== lastDy)) {
      simplified.push(previous);
    }
    lastDx = dx;
    lastDy = dy;
  }
  simplified.push(path[path.length - 1]);
  return simplified;
}

function normalizeMoveKey(key) {
  const value = String(key || '').toLowerCase();
  if (value === 'arrowleft' || value === 'a') return 'left';
  if (value === 'arrowright' || value === 'd') return 'right';
  return '';
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
}

function animationLoop(timestamp) {
  const last = state.lastFrameAt || timestamp;
  const dt = Math.min(0.05, Math.max(0, (timestamp - last) / 1000));
  state.lastFrameAt = timestamp;
  updateLocalMovement(dt);
  updateCamera();
  updateRemoteAvatarMotion();
  renderAvatars();
  trackPresence(false);
  window.requestAnimationFrame(animationLoop);
}

function updateLocalMovement(dt) {
  let dx = 0;
  if (state.keys.has('left')) dx -= 1;
  if (state.keys.has('right')) dx += 1;
  const speed = 24;
  state.localAvatar.y = PLAYER_LANE_Y;
  if (dx) {
    state.localAvatar.path = [];
    state.localAvatar.x = clampWorldX(state.localAvatar.x + dx * speed * 10 * dt);
    state.localAvatar.targetX = state.localAvatar.x;
    state.localAvatar.targetY = PLAYER_LANE_Y;
    state.localAvatar.walking = true;
    return;
  }
  const currentTarget = state.localAvatar.path[0] || {
    x: state.localAvatar.targetX,
    y: PLAYER_LANE_Y
  };
  const targetDx = currentTarget.x - state.localAvatar.x;
  const distance = Math.abs(targetDx);
  if (distance > 3) {
    const step = Math.min(distance, speed * 10 * dt);
    state.localAvatar.x = clampWorldX(state.localAvatar.x + Math.sign(targetDx) * step);
    state.localAvatar.y = PLAYER_LANE_Y;
    state.localAvatar.walking = true;
  } else {
    if (state.localAvatar.path.length) {
      state.localAvatar.path.shift();
      state.localAvatar.walking = Boolean(state.localAvatar.path.length);
    } else {
      state.localAvatar.walking = false;
    }
    state.localAvatar.targetY = PLAYER_LANE_Y;
    state.localAvatar.y = PLAYER_LANE_Y;
  }
}

function updateCamera() {
  const rect = getSceneRect();
  state.camera.width = Math.max(1, rect.width || state.camera.width || 1);
  state.camera.height = Math.max(1, rect.height || state.camera.height || 1);
  const visible = getVisibleWorldSize();
  state.camera.targetX = state.localAvatar.x - visible.width / 2;
  state.camera.targetY = getCameraYForGround(state.localAvatar.y, visible.height);
  state.camera.x = state.camera.targetX;
  state.camera.y = state.camera.targetY;
  const world = $('plazaWorld');
  if (world) {
    const translateX = -Math.round(state.camera.x * state.camera.scale);
    const translateY = -Math.round(state.camera.y * state.camera.scale);
    world.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${state.camera.scale})`;
  }
}

function parseChatCommand(rawBody) {
  const raw = String(rawBody || '').trim();
  const worldMatch = raw.match(/^\/world(?:\s+(.+))?$/i);
  if (worldMatch) {
    return {
      body: String(worldMatch[1] || '').trim(),
      mode: 'world',
      targetName: '',
      targetArtworkId: '',
      switchOnly: !worldMatch[1]
    };
  }
  const clearMatch = raw.match(/^\/(?:clear|replyoff|off)$/i);
  if (clearMatch) {
    return {
      body: '',
      mode: 'world',
      targetName: '',
      targetArtworkId: '',
      switchOnly: true
    };
  }
  const toMatch = raw.match(/^\/to\s+(@?\S+)\s+(.+)$/i);
  if (toMatch) {
    return {
      body: String(toMatch[2] || '').trim(),
      mode: 'direct',
      targetName: normalizeTargetName(toMatch[1]),
      targetArtworkId: ''
    };
  }
  const mentionMatch = raw.match(/^@(\S+)\s+(.+)$/);
  if (mentionMatch) {
    return {
      body: String(mentionMatch[2] || '').trim(),
      mode: 'direct',
      targetName: normalizeTargetName(mentionMatch[1]),
      targetArtworkId: ''
    };
  }
  return {
    body: raw,
    mode: state.messageMode,
    targetName: state.directTargetName,
    targetArtworkId: state.directTargetArtworkId
  };
}

function bindChat() {
  $('chatForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('chatInput');
    const command = parseChatCommand(input?.value || '');
    if (command.switchOnly) {
      if (command.mode === 'world') setWorldMessageMode({ clearArtwork: true, announce: true });
      if (input) input.value = '';
      window.setTimeout(() => input?.focus({ preventScroll: true }), 40);
      return;
    }
    if (!command.body) return;
    if (input) input.value = '';
    await sendComment(command);
  });
}

function setOptionMenuOpen(open) {
  state.optionMenuOpen = Boolean(open);
  const menu = $('plazaOptionMenu');
  const button = $('plazaPlusButton');
  if (menu) menu.hidden = !state.optionMenuOpen;
  if (button) button.setAttribute('aria-expanded', String(state.optionMenuOpen));
}

function closeOptionMenu() {
  setOptionMenuOpen(false);
}

function insertTextIntoChat(text) {
  const input = $('chatInput');
  if (!input) return;
  const value = input.value || '';
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? value.length;
  input.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const nextPosition = start + text.length;
  input.focus({ preventScroll: true });
  input.setSelectionRange(nextPosition, nextPosition);
}

function insertCurrentMention() {
  const artwork = state.currentArtwork;
  const name = state.directTargetName || normalizeTargetName(artwork?.display_name);
  if (!name) {
    showSceneNotice('メンションする画像を選んでください');
    window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 40);
    return;
  }
  insertTextIntoChat(`@${name} `);
}

function clearReplyTarget() {
  setWorldMessageMode({ clearArtwork: true, announce: true });
  renderArtwork();
  window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 40);
}

function handleOptionAction(action) {
  closeOptionMenu();
  if (action === 'post') {
    openModal('postPanel');
    return;
  }
  if (action === 'world') {
    clearReplyTarget();
    return;
  }
  if (action === 'direct') {
    if (state.currentArtwork?.id) {
      setDirectMessageMode({
        name: state.currentArtwork.display_name,
        artworkId: state.currentArtwork.id
      }, { announce: true });
      window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 40);
    } else {
      showSceneNotice('宛て発言する画像を選んでください');
    }
    return;
  }
  if (action === 'mention') {
    insertCurrentMention();
    return;
  }
  if (action === 'clear') {
    clearReplyTarget();
  }
}

function bindOptionMenu() {
  $('plazaPlusButton')?.addEventListener('click', event => {
    event.preventDefault();
    setOptionMenuOpen(!state.optionMenuOpen);
  });
  $('plazaOptionMenu')?.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('[data-option-action]');
    if (!button) return;
    event.preventDefault();
    handleOptionAction(button.dataset.optionAction || '');
  });
  document.addEventListener('pointerdown', event => {
    if (!state.optionMenuOpen) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.plaza-plus-wrap')) return;
    closeOptionMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOptionMenu();
  });
}

function openChatPanel() {
  window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 60);
}

async function sendComment(command) {
  const message = typeof command === 'string' ? parseChatCommand(command) : command;
  const body = String(message?.body || '').trim();
  if (!body) return;
  const requestedMode = message?.mode === 'image' || message?.mode === 'direct' ? message.mode : 'world';
  const targetArtworkId = requestedMode === 'image' ? String(message.targetArtworkId || '') : '';
  const targetName = requestedMode === 'direct' || requestedMode === 'image'
    ? normalizeTargetName(message.targetName)
    : '';
  const artwork = requestedMode === 'image' && targetArtworkId
    ? state.artworks.find(item => item.id === targetArtworkId) || null
    : null;
  const mode = artwork ? 'image' : requestedMode === 'direct' && targetName ? 'direct' : 'world';
  if (mode === 'image') {
    setImageReplyMode(artwork);
  } else if (mode === 'direct') {
    setDirectMessageMode({
      name: targetName,
      artworkId: ''
    }, { clearArtwork: true });
  } else {
    setWorldMessageMode({ clearArtwork: true });
  }
  const bubbleOptions = {
    mode,
    targetName,
    targetArtworkId: artwork?.id || ''
  };
  const createdAt = nowIso();
  if (!artwork || artwork.is_sample) {
    addComment({
      id: makeId('live'),
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      body,
      chat_mode: mode,
      target_name: targetName,
      created_at: createdAt,
      is_live: true
    });
    renderComments();
    if (artwork?.id) {
      addArtworkBubble(artwork.id, {
        id: makeId('local-art-bubble'),
        body,
        displayName: getDisplayName()
      });
      renderArtworkWall();
    }
    await broadcastComment(body, {
      ...bubbleOptions,
      createdAt
    });
    await broadcastBubble(body, bubbleOptions);
    return;
  }
  if (!state.authUser?.id) {
    addComment({
      id: makeId('guest'),
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      body,
      chat_mode: mode,
      target_name: targetName,
      created_at: createdAt,
      is_live: true
    });
    renderComments();
    if (artwork?.id) {
      addArtworkBubble(artwork.id, {
        id: makeId('guest-art-bubble'),
        body,
        displayName: getDisplayName()
      });
      renderArtworkWall();
    }
    await broadcastComment(body, {
      ...bubbleOptions,
      createdAt
    });
    await broadcastBubble(body, bubbleOptions);
    showSceneNotice('ログインすると作品コメントとして保存されます');
    return;
  }
  try {
    const supabase = await ensureSupabase();
    const payload = {
      artwork_id: artwork.id,
      user_id: state.authUser.id,
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      body,
      comment_type: 'comment',
      expires_at: artwork.expires_at || new Date(Date.now() + ARTWORK_RETENTION_MS).toISOString()
    };
    const { data, error } = await supabase
      .from('plaza_artwork_comments')
      .insert(payload)
      .select('id,artwork_id,user_id,display_name,avatar,body,comment_type,is_paid,gift_type,created_at')
      .single();
    if (error) throw error;
    addComment(data);
    renderComments();
    addArtworkBubble(artwork.id, {
      id: data.id,
      body,
      displayName: getDisplayName(),
      createdAt: data.created_at
    });
    renderArtworkWall();
    await broadcastComment(body, {
      ...bubbleOptions,
      commentId: data.id,
      createdAt: data.created_at
    });
    await broadcastBubble(body, {
      ...bubbleOptions,
      commentId: data.id
    });
  } catch (error) {
    console.warn('[plaza] comment insert failed', error);
    addComment({
      id: makeId('live'),
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      body,
      chat_mode: mode,
      target_name: targetName,
      created_at: createdAt,
      is_live: true
    });
    renderComments();
    if (artwork?.id) {
      addArtworkBubble(artwork.id, {
        id: makeId('failed-art-bubble'),
        body,
        displayName: getDisplayName()
      });
      renderArtworkWall();
    }
    await broadcastComment(body, {
      ...bubbleOptions,
      createdAt
    });
    await broadcastBubble(body, bubbleOptions);
    showSceneNotice('コメント保存に失敗しました');
  }
}

function bindPostPanel() {
  document.querySelectorAll('[data-open-post]').forEach(button => {
    button.addEventListener('click', () => openModal('postPanel'));
  });
  $('closePostPanel')?.addEventListener('click', () => closeModal('postPanel'));
  $('postFile')?.addEventListener('change', updatePostPreview);
  $('postForm')?.addEventListener('submit', handlePostSubmit);
}

async function updatePostPreview() {
  const input = $('postFile');
  const preview = $('postPreview');
  const img = $('postPreviewImage');
  const file = input?.files?.[0];
  if (!preview || !img) return;
  if (!file) {
    preview.classList.remove('has-image');
    img.src = '';
    return;
  }
  const url = URL.createObjectURL(file);
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;
  preview.classList.add('has-image');
}

async function handlePostSubmit(event) {
  event.preventDefault();
  setPostStatus('');
  if (!state.authUser?.id) {
    setPostStatus('投稿の保存にはオンライン接続とログインが必要です', 'error');
    openModal('authPanel');
    return;
  }
  const input = $('postFile');
  const file = input?.files?.[0];
  if (!file) {
    setPostStatus('画像を選択してください', 'error');
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    setPostStatus('PNG / JPEG / WebP を選択してください', 'error');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    setPostStatus('5MB以内の画像を選択してください', 'error');
    return;
  }
  try {
    setPostStatus('画像を準備しています');
    const imageInfo = await buildUploadImage(file);
    const title = String($('postTitle')?.value || '').trim().slice(0, 60) || '無題';
    const supabase = await ensureSupabase();
    const keyBase = createStorageKey();
    const imagePath = `${keyBase}.png`;
    const thumbPath = `${keyBase}_thumb.png`;
    setPostStatus('アップロードしています');
    const bucket = supabase.storage.from(STORAGE_BUCKET);
    const imageUpload = await bucket.upload(imagePath, imageInfo.imageBlob, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false
    });
    if (imageUpload.error) throw imageUpload.error;
    const thumbUpload = await bucket.upload(thumbPath, imageInfo.thumbBlob, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false
    });
    if (thumbUpload.error) throw thumbUpload.error;
    const imageUrl = bucket.getPublicUrl(imagePath).data.publicUrl;
    const thumbUrl = bucket.getPublicUrl(thumbPath).data.publicUrl;
    const expiresAt = new Date(Date.now() + ARTWORK_RETENTION_MS).toISOString();
    const payload = {
      room_id: ROOM_ID,
      user_id: state.authUser.id,
      storage_path: imagePath,
      thumbnail_path: thumbPath,
      image_url: imageUrl,
      thumbnail_url: thumbUrl,
      title,
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      width: imageInfo.width,
      height: imageInfo.height,
      mime_type: 'image/png',
      file_size: imageInfo.imageBlob.size,
      expires_at: expiresAt,
      priority_until: new Date(Date.now() + 60 * 1000).toISOString()
    };
    setPostStatus('広場へ登録しています');
    const { data, error } = await supabase
      .from('plaza_artworks')
      .insert(payload)
      .select('id,user_id,room_id,storage_path,thumbnail_path,image_url,thumbnail_url,title,display_name,avatar,width,height,mime_type,file_size,created_at,expires_at,priority_until,deleted_at,moderation_status')
      .single();
    if (error) throw error;
    const artwork = normalizeArtwork(data);
    upsertArtwork(artwork, true);
    selectArtwork(artwork.id);
    await broadcastNewArtwork(artwork);
    setPostStatus('投稿しました', 'ok');
    showSceneNotice('新しい作品が届きました');
    window.setTimeout(() => closeModal('postPanel'), 600);
    if (input) input.value = '';
    $('postPreview')?.classList.remove('has-image');
    setImage($('postPreviewImage'), '');
  } catch (error) {
    console.warn('[plaza] post failed', error);
    setPostStatus('投稿に失敗しました。DBとStorage設定を確認してください', 'error');
  }
}

async function broadcastNewArtwork(artwork) {
  if (!state.realtimeChannel || !artwork) return;
  try {
    await state.realtimeChannel.send({
      type: 'broadcast',
      event: 'artwork:new',
      payload: { artwork }
    });
  } catch (error) {
    console.warn('[plaza] artwork broadcast failed', error);
  }
}

function createStorageKey() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `plaza/${ROOM_ID}/${date}/${makeId('artwork')}`;
}

async function buildUploadImage(file) {
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('invalid image');
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const thumb = createThumbCanvas(canvas);
  return {
    width,
    height,
    imageBlob: await canvasToBlob(canvas, 'image/png'),
    thumbBlob: await canvasToBlob(thumb, 'image/png')
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

function createThumbCanvas(source) {
  const scale = Math.min(1, THUMB_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('blob create failed'));
    }, type);
  });
}

function bindArtworkPanel() {
  $('openArtworkDetail')?.addEventListener('click', () => openModal('artworkPanel'));
  $('closeArtworkPanel')?.addEventListener('click', () => closeModal('artworkPanel'));
  $('reportArtworkButton')?.addEventListener('click', reportCurrentArtwork);
  $('deleteArtworkButton')?.addEventListener('click', deleteCurrentArtwork);
}

async function deleteCurrentArtwork() {
  setDetailStatus('');
  const artwork = state.currentArtwork;
  if (!isCurrentArtworkOwner()) {
    setDetailStatus('削除できるのは自分の投稿だけです', 'error');
    return;
  }
  const ok = window.confirm('この投稿を広場から削除します。よろしいですか？');
  if (!ok) return;
  try {
    setDetailStatus('削除しています');
    const supabase = await ensureSupabase();
    const { error } = await supabase
      .from('plaza_artworks')
      .update({
        deleted_at: nowIso(),
        moderation_status: 'deleted'
      })
      .eq('id', artwork.id)
      .eq('user_id', state.authUser.id);
    if (error) throw error;
    removeArtworkById(artwork.id);
    closeModal('artworkPanel');
    showSceneNotice('投稿を削除しました');
  } catch (error) {
    console.warn('[plaza] artwork delete failed', error);
    setDetailStatus('削除に失敗しました', 'error');
  }
}

async function reportCurrentArtwork() {
  setDetailStatus('');
  const artwork = state.currentArtwork;
  if (!artwork || artwork.is_sample) {
    setDetailStatus('通報対象の作品がありません', 'error');
    return;
  }
  if (!state.authUser?.id) {
    setDetailStatus('通報にはログインが必要です', 'error');
    openModal('authPanel');
    return;
  }
  try {
    const supabase = await ensureSupabase();
    const { error } = await supabase.from('plaza_reports').insert({
      target_type: 'artwork',
      target_id: artwork.id,
      user_id: state.authUser.id,
      reason: 'user_report'
    });
    if (error) throw error;
    setDetailStatus('通報を受け付けました', 'ok');
  } catch (error) {
    console.warn('[plaza] report failed', error);
    setDetailStatus('通報に失敗しました', 'error');
  }
}

function bindProfilePanel() {
  $('openProfilePanel')?.addEventListener('click', () => openModal('authPanel'));
  $('closeAuthPanel')?.addEventListener('click', () => closeModal('authPanel'));
  $('avatarToggle')?.addEventListener('click', () => {
    const panel = $('avatarPanel');
    const expanded = panel?.hidden !== false;
    if (panel) panel.hidden = !expanded;
    $('avatarToggle')?.setAttribute('aria-expanded', String(expanded));
  });
  $('saveProfile')?.addEventListener('click', () => {
    setNickname($('profileNickname')?.value || '');
    setXUrl($('profileX')?.value || '');
    updateProfileUi();
    trackPresence(true);
    window.dispatchEvent(new CustomEvent('pixieed:profile-updated'));
    const status = $('authStatus');
    if (status) {
      status.textContent = 'プロフィールを保存しました';
      status.classList.add('is-ok');
      status.classList.remove('is-error');
    }
  });
  renderAvatarChoices();
  updateProfileUi();
}

function renderAvatarChoices() {
  const grid = $('avatarGrid');
  if (!grid) return;
  grid.textContent = '';
  const current = getAvatarId();
  AVATARS.forEach(avatar => {
    const button = document.createElement('button');
    button.className = `avatar-choice${avatar.id === current ? ' is-active' : ''}`;
    button.type = 'button';
    button.setAttribute('aria-label', avatar.id);
    const img = document.createElement('img');
    img.src = avatar.src;
    img.alt = '';
    button.appendChild(img);
    button.addEventListener('click', () => {
      setAvatarId(avatar.id);
      renderAvatarChoices();
      updateProfileUi();
      trackPresence(true);
      window.dispatchEvent(new CustomEvent('pixieed:profile-updated'));
    });
    grid.appendChild(button);
  });
}

function updateProfileUi() {
  const nickname = getNickname();
  const avatarSrc = getAvatarSrc();
  const brandUser = $('brandUser');
  if (brandUser) brandUser.textContent = nickname || state.authUser?.email || 'ユーザー';
  const brandAvatar = $('brandAvatar')?.querySelector('img');
  if (brandAvatar) brandAvatar.src = avatarSrc;
  const avatarPreview = $('avatarPreview');
  if (avatarPreview) {
    avatarPreview.textContent = '';
    const img = document.createElement('img');
    img.src = avatarSrc;
    img.alt = '';
    avatarPreview.appendChild(img);
  }
  const nickInput = $('profileNickname');
  if (nickInput && document.activeElement !== nickInput) nickInput.value = nickname;
  const xInput = $('profileX');
  if (xInput && document.activeElement !== xInput) xInput.value = getXUrl();
  renderAvatarChoices();
  renderAvatars();
  updateArtworkActionUi();
}

function openModal(id) {
  const panel = $(id);
  if (!panel) return;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  const panel = $(id);
  if (!panel) return;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
}

function bindGlobalModalClose() {
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    ['postPanel', 'artworkPanel', 'authPanel'].forEach(closeModal);
    document.body.classList.remove('is-chat-open');
    closeOptionMenu();
  });
  document.querySelectorAll('.modal-panel, .auth-panel').forEach(panel => {
    panel.addEventListener('pointerdown', event => {
      if (event.target === panel) {
        closeModal(panel.id);
      }
    });
  });
}

function bindVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      trackPresence(true);
      loadArtworks();
    }
  });
  window.addEventListener('resize', () => {
    updateCamera();
    renderAvatars();
  }, { passive: true });
}

async function init() {
  state.clientId = getClientId();
  state.presenceId = makeId('presence');
  updateCamera();
  applyRandomSpawn();
  updateCamera();
  updateZoomLabel();
  bindProfilePanel();
  bindGlobalModalClose();
  bindMovement();
  bindChat();
  bindOptionMenu();
  bindPostPanel();
  bindArtworkPanel();
  bindVisibility();
  await syncAuthUser();
  await loadArtworks();
  await subscribeRealtime();
  await subscribeArtworkChanges();
  updateParticipantCount();
  await trackPresence(true);
  await pollPresenceRows();
  window.setInterval(() => {
    trackPresence(true);
  }, 3000);
  window.setInterval(() => {
    pollPresenceRows();
  }, PRESENCE_POLL_MS);
  window.setInterval(() => {
    rotateArtworkSlots();
  }, ARTWORK_ROTATION_INTERVAL_MS);
  window.setInterval(() => renderAvatars(), 500);
  window.requestAnimationFrame(animationLoop);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
