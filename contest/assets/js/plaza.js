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
  { x: 320, y: PLAYER_LANE_Y, width: 1040, height: 1 },
  { x: 1660, y: PLAYER_LANE_Y, width: 1160, height: 1 },
  { x: 3180, y: PLAYER_LANE_Y, width: 820, height: 1 }
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
  comments: [],
  commentIds: new Set(),
  remoteAvatars: new Map(),
  avatarElements: new Map(),
  localAvatar: {
    x: 1200,
    y: PLAYER_LANE_Y,
    targetX: 1200,
    targetY: PLAYER_LANE_Y,
    path: [],
    bubble: '',
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
  lastPresenceSnapshot: '',
  sceneNoticeTimer: 0,
  optionMenuOpen: false
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
  const x = Number(avatar?.x) || 0;
  const y = Number(avatar?.y) || 0;
  const visibleWidth = state.camera.width / state.camera.scale;
  const visibleHeight = state.camera.height / state.camera.scale;
  return (
    x >= state.camera.x - padding
    && x <= state.camera.x + visibleWidth + padding
    && y >= state.camera.y - padding
    && y <= state.camera.y + visibleHeight + padding
  );
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

function getReplyLabel(artwork = state.currentArtwork) {
  if (!artwork?.id) return '画像を選ぶとリプライできます';
  const author = artwork.display_name ? `@${artwork.display_name}` : '投稿者';
  return `返信先: ${author} / ${artwork.title || '無題'}`;
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
  const displayed = getDisplayedArtworks();
  const next = pool.find(item => item.id === state.currentArtworkId) || displayed[0] || pool[0] || null;
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
    input.placeholder = artwork?.id ? 'この画像にリプライ' : 'コメントを入力';
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
    button.className = `plaza-artwork-tile${artwork.id === state.currentArtworkId ? ' is-selected' : ''}`;
    button.type = 'button';
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    button.setAttribute('aria-label', `${artwork.title || '無題'}にリプライ`);
    button.setAttribute('aria-pressed', String(artwork.id === state.currentArtworkId));

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
    button.addEventListener('click', () => {
      selectArtwork(artwork.id, { focusInput: true, announce: true });
    });
    fragment.appendChild(button);
  });
  wall.appendChild(fragment);
}

function rotateArtworkSlots() {
  syncArtworkSlots({ advance: true });
  if (state.currentArtworkId) {
    const current = state.artworks.find(item => item.id === state.currentArtworkId) || null;
    if (!current) {
      state.currentArtwork = null;
      state.currentArtworkId = '';
      state.comments = [];
      state.commentIds.clear();
      renderArtwork();
      renderComments();
      subscribeCurrentArtworkComments();
    } else {
      state.currentArtwork = current;
      updateReplyTargetUi();
    }
  }
  renderArtworkWall();
}

function selectArtwork(artworkId, options = {}) {
  const artwork = state.artworks.find(item => item.id === artworkId);
  if (!artwork) return;
  const changed = artwork.id !== state.currentArtworkId;
  state.currentArtwork = artwork;
  state.currentArtworkId = artwork.id;
  renderArtwork();
  renderArtworkWall();
  if (changed) {
    loadCommentsForCurrentArtwork();
    subscribeCurrentArtworkComments();
  }
  if (options.announce) showSceneNotice(`「${artwork.title || '無題'}」へリプライします`);
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
    (data || []).forEach(addComment);
  } catch (error) {
    console.warn('[plaza] comments load skipped', error);
  }
  renderComments();
}

function addComment(comment) {
  if (!comment?.id || state.commentIds.has(comment.id)) return;
  state.commentIds.add(comment.id);
  state.comments.push({
    id: comment.id,
    display_name: String(comment.display_name || 'ゲスト').slice(0, 32),
    avatar: String(comment.avatar || 'mao'),
    body: String(comment.body || '').slice(0, 280),
    comment_type: comment.comment_type || 'comment',
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
        presence: { key: state.clientId },
        broadcast: { self: false }
      }
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        syncPresenceState(channel.presenceState());
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
    state.currentArtwork = null;
    state.currentArtworkId = '';
    state.comments = [];
    state.commentIds.clear();
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
        renderComments();
      })
      .subscribe();
    state.commentsChannel = channel;
  } catch (error) {
    console.warn('[plaza] comment subscription skipped', error);
  }
}

function syncPresenceState(presenceState) {
  const next = new Map();
  Object.values(presenceState || {}).forEach(entries => {
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      if (!entry || entry.clientId === state.clientId) return;
      const clientId = String(entry.clientId || '');
      if (!clientId) return;
      next.set(clientId, {
        clientId,
        name: String(entry.name || 'ゲスト').slice(0, 32),
        avatar: String(entry.avatar || 'mao'),
        x: clampWorldX(Number(entry.x) || WORLD_WIDTH / 2),
        y: clampWorldY(Number(entry.y) || WORLD_HEIGHT / 2),
        bubble: String(entry.bubble || '').slice(0, 120),
        bubbleUntil: Number(entry.bubbleUntil) || 0,
        walking: Boolean(entry.walking),
        updatedAt: Number(entry.updatedAt) || Date.now()
      });
    });
  });
  state.remoteAvatars = next;
  updateParticipantCount();
  renderAvatars();
}

function updateParticipantCount() {
  const count = Math.max(1, state.remoteAvatars.size + 1);
  setText('participantCount', String(count));
}

async function trackPresence(force = false) {
  if (!state.realtimeChannel) return;
  const now = Date.now();
  if (!force && now - state.lastPresenceAt < 180) return;
  const payload = {
    clientId: state.clientId,
    userId: state.authUser?.id || '',
    name: getDisplayName(),
    avatar: getAvatarId(),
    x: Math.round(state.localAvatar.x * 10) / 10,
    y: Math.round(state.localAvatar.y * 10) / 10,
    bubble: state.localAvatar.bubbleUntil > now ? state.localAvatar.bubble : '',
    bubbleUntil: state.localAvatar.bubbleUntil,
    walking: state.localAvatar.walking,
    updatedAt: now
  };
  const snapshot = JSON.stringify(payload);
  if (!force && snapshot === state.lastPresenceSnapshot && now - state.lastPresenceAt < 1200) return;
  state.lastPresenceSnapshot = snapshot;
  state.lastPresenceAt = now;
  try {
    await state.realtimeChannel.track(payload);
  } catch (error) {
    console.warn('[plaza] presence track failed', error);
  }
}

function handleBubbleBroadcast(payload) {
  if (!payload || payload.clientId === state.clientId) return;
  const clientId = String(payload.clientId || '');
  if (!clientId) return;
  const existing = state.remoteAvatars.get(clientId) || {
    clientId,
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    avatar: 'mao',
    name: 'ゲスト'
  };
  existing.bubble = String(payload.body || '').slice(0, 120);
  existing.bubbleUntil = Date.now() + BUBBLE_DURATION_MS;
  existing.name = String(payload.name || existing.name || 'ゲスト').slice(0, 32);
  existing.avatar = String(payload.avatar || existing.avatar || 'mao');
  state.remoteAvatars.set(clientId, existing);
  addComment({
    id: payload.commentId || makeId('live'),
    display_name: existing.name,
    avatar: existing.avatar,
    body: existing.bubble,
    created_at: payload.created_at || nowIso(),
    is_live: true
  });
  renderComments();
  renderAvatars();
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
  const avatars = new Map(state.remoteAvatars);
  avatars.set(state.clientId, {
    clientId: state.clientId,
    name: getDisplayName(),
    avatar: getAvatarId(),
    x: state.localAvatar.x,
    y: state.localAvatar.y,
    bubble: state.localAvatar.bubbleUntil > Date.now() ? state.localAvatar.bubble : '',
    bubbleUntil: state.localAvatar.bubbleUntil,
    walking: state.localAvatar.walking,
    isSelf: true
  });
  const liveIds = new Set(avatars.keys());
  Array.from(state.avatarElements.keys()).forEach(id => {
    const avatar = avatars.get(id);
    if (!liveIds.has(id) || (!avatar?.isSelf && !isAvatarInViewport(avatar))) {
      state.avatarElements.get(id)?.remove();
      state.avatarElements.delete(id);
    }
  });
  avatars.forEach(avatar => {
    if (!avatar.isSelf && !isAvatarInViewport(avatar)) return;
    let el = state.avatarElements.get(avatar.clientId);
    if (!el) {
      el = createAvatarElement();
      state.avatarElements.set(avatar.clientId, el);
      layer.appendChild(el);
    }
    el.style.left = `${avatar.x}px`;
    el.style.top = `${avatar.y}px`;
    el.classList.toggle('is-self', Boolean(avatar.isSelf));
    el.classList.toggle('is-walking', Boolean(avatar.walking));
    const img = el.querySelector('.plaza-avatar__sprite');
    if (img) img.src = getAvatarSrc(avatar.avatar);
    const name = el.querySelector('.plaza-avatar__name');
    if (name) name.textContent = avatar.name || 'ゲスト';
    const bubble = el.querySelector('.plaza-avatar__bubble');
    if (bubble) {
      const visible = avatar.bubble && avatar.bubbleUntil > Date.now();
      bubble.hidden = !visible;
      bubble.textContent = visible ? avatar.bubble : '';
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

function setLocalBubble(body) {
  state.localAvatar.bubble = String(body || '').slice(0, 120);
  state.localAvatar.bubbleUntil = Date.now() + BUBBLE_DURATION_MS;
  renderAvatars();
  trackPresence(true);
}

async function broadcastBubble(body, commentId = '') {
  setLocalBubble(body);
  if (!state.realtimeChannel) return;
  try {
    await state.realtimeChannel.send({
      type: 'broadcast',
      event: 'bubble',
      payload: {
        clientId: state.clientId,
        commentId,
        name: getDisplayName(),
        avatar: getAvatarId(),
        body,
        created_at: nowIso()
      }
    });
  } catch (error) {
    console.warn('[plaza] bubble broadcast failed', error);
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

function bindChat() {
  $('chatForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('chatInput');
    const body = String(input?.value || '').trim();
    if (!body) return;
    if (input) input.value = '';
    await sendComment(body);
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
  const name = String(artwork?.display_name || '').trim();
  if (!artwork?.id || !name) {
    showSceneNotice('メンションする画像を選んでください');
    window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 40);
    return;
  }
  insertTextIntoChat(`@${name.replace(/\s+/g, '_')} `);
}

function clearReplyTarget() {
  state.currentArtwork = null;
  state.currentArtworkId = '';
  state.comments = [];
  state.commentIds.clear();
  renderArtwork();
  renderArtworkWall();
  renderComments();
  subscribeCurrentArtworkComments();
  showSceneNotice('リプライ先を解除しました');
  window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 40);
}

function handleOptionAction(action) {
  closeOptionMenu();
  if (action === 'post') {
    openModal('postPanel');
    return;
  }
  if (action === 'reply') {
    if (state.currentArtwork?.id) {
      showSceneNotice(getReplyLabel());
      window.setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 40);
    } else {
      showSceneNotice('リプライする画像を選んでください');
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

async function sendComment(body) {
  const artwork = state.currentArtwork;
  if (!artwork || artwork.is_sample) {
    addComment({
      id: makeId('live'),
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      body,
      created_at: nowIso(),
      is_live: true
    });
    renderComments();
    await broadcastBubble(body);
    return;
  }
  if (!state.authUser?.id) {
    addComment({
      id: makeId('guest'),
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      body,
      created_at: nowIso(),
      is_live: true
    });
    renderComments();
    await broadcastBubble(body);
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
    await broadcastBubble(body, data.id);
  } catch (error) {
    console.warn('[plaza] comment insert failed', error);
    addComment({
      id: makeId('live'),
      display_name: getDisplayName(),
      avatar: getAvatarId(),
      body,
      created_at: nowIso(),
      is_live: true
    });
    renderComments();
    await broadcastBubble(body);
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
