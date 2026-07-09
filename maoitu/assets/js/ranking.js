import { supabase } from './supabase.js';

const RANKING_LIMIT = 100;
const PAGE_SIZE = 500;
const MAX_PAGES = 10;
const NAME_STORAGE_KEY = 'maoitu_rank_name';
const CLIENT_ID_KEY = 'pixieed_client_id';
const AVATAR_STORAGE_KEY = 'pixieed_avatar';
const SUPABASE_MAINTENANCE_KEY = 'pixieed_supabase_maintenance';
const RANKING_CACHE_KEY = 'maoitu_rank_cache';
const RANKING_CACHE_LIMIT = 100;
const LAST_SCORE_KEY = 'maoitu_last_score';
const LIVE_REFRESH_MS = 8000;
const LIVE_REFRESH_DEBOUNCE_MS = 240;

let supabaseMaintenance = Boolean(readSupabaseMaintenance());

function accountKey(row) {
  const clientId = row && row.client_id ? String(row.client_id).trim() : '';
  if (clientId) return `client:${clientId}`;
  return (row?.name || '').trim().toLowerCase() || 'guest';
}

function uniqueByAccount(rows, limit = Infinity) {
  const indexByKey = new Map();
  const unique = [];
  for (const row of rows) {
    const key = accountKey(row);
    const existingIndex = indexByKey.get(key);
    if (existingIndex != null) {
      const existing = unique[existingIndex];
      const nextName = String(row?.name || '').trim();
      if (nextName) {
        existing.name = nextName;
      }
      const nextAvatar = String(row?.avatar || '').trim();
      if (nextAvatar) {
        existing.avatar = nextAvatar;
      }
      continue;
    }
    indexByKey.set(key, unique.length);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

function getCurrentAccountIdentity() {
  let clientId = '';
  let name = '';
  let avatar = '';
  try {
    clientId = String(localStorage.getItem(CLIENT_ID_KEY) || '').trim();
  } catch (_) {
    // ignore
  }
  try {
    name = String(localStorage.getItem('pixieed_nickname') || localStorage.getItem(NAME_STORAGE_KEY) || '').trim();
  } catch (_) {
    // ignore
  }
  try {
    avatar = String(localStorage.getItem(AVATAR_STORAGE_KEY) || '').trim();
  } catch (_) {
    // ignore
  }
  return { client_id: clientId, name, avatar };
}

function readSupabaseMaintenance() {
  try {
    const raw = localStorage.getItem(SUPABASE_MAINTENANCE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.active) return data;
  } catch (_) {
    // ignore
  }
  return null;
}

function setSupabaseMaintenance(active, reason = '') {
  supabaseMaintenance = active;
  try {
    if (active) {
      localStorage.setItem(SUPABASE_MAINTENANCE_KEY, JSON.stringify({ active: true, reason, ts: Date.now() }));
    } else {
      localStorage.removeItem(SUPABASE_MAINTENANCE_KEY);
    }
  } catch (_) {
    // ignore
  }
}

function noteSupabaseSuccess() {
  if (supabaseMaintenance) {
    setSupabaseMaintenance(false);
  }
}

function shouldMarkSupabaseMaintenance(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status >= 500) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch failed') || msg.includes('503') || msg.includes('502') || msg.includes('504');
}

function markSupabaseMaintenanceFromError(error) {
  if (shouldMarkSupabaseMaintenance(error)) {
    setSupabaseMaintenance(true, 'network');
  }
}

function loadRankingCache() {
  try {
    const raw = localStorage.getItem(RANKING_CACHE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data?.items) ? data.items : [];
  } catch (_) {
    return [];
  }
}

function saveRankingCache(items) {
  try {
    const trimmed = Array.isArray(items) ? items.slice(0, RANKING_CACHE_LIMIT) : [];
    localStorage.setItem(RANKING_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: trimmed }));
  } catch (_) {
    // ignore
  }
}

function isMissingClientId(error) {
  const msg = String(error?.message || '');
  return msg.includes('client_id');
}

function isMissingAvatar(error) {
  const msg = String(error?.message || '');
  return msg.includes('avatar');
}

function resolveAvatarSrcFromId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!id || id === 'mao') return '../character-dots/mao1.png';
  if (/^jerin[1-8]$/.test(id)) return `../character-dots/Jerin${id.slice(5)}.png`;
  if (/^jellnall([1-9]|1[0-9])$/.test(id)) return `../character-dots/${id.toUpperCase()}.png`;
  if (id === 'baburin') return '../character-dots/baburinpng.png';
  return '../character-dots/mao1.png';
}

function rankTierForPosition(rank) {
  if (rank === 1) return 'rainbow';
  if (rank === 2) return 'red-metallic';
  if (rank === 3) return 'gold';
  if (rank === 4) return 'silver';
  if (rank === 5) return 'bronze';
  if (rank <= 10) return 'blue';
  if (rank <= 30) return 'green';
  return 'white';
}

function tierLabelForRank(rank) {
  if (rank === 1) return 'CHAMPION';
  if (rank === 2) return 'ELITE';
  if (rank === 3) return 'MASTER';
  if (rank <= 10) return 'TOP 10';
  if (rank <= 30) return 'TOP 30';
  return 'LEADERBOARD';
}

function cloneRows(rows) {
  return Array.isArray(rows) ? rows.map(row => ({ ...row })) : [];
}

function buildRankMovement(rows, previousRows) {
  const previousRanks = new Map();
  const movementByAccount = new Map();
  if (!Array.isArray(rows) || !Array.isArray(previousRows)) {
    return movementByAccount;
  }
  previousRows.forEach((row, index) => {
    previousRanks.set(accountKey(row), index + 1);
  });
  rows.forEach((row, index) => {
    const currentRank = index + 1;
    const previousRank = previousRanks.get(accountKey(row));
    if (!previousRank || previousRank === currentRank) {
      return;
    }
    movementByAccount.set(accountKey(row), {
      direction: previousRank > currentRank ? 'up' : 'down',
      previousRank,
      currentRank,
      delta: Math.abs(previousRank - currentRank),
    });
  });
  return movementByAccount;
}

function renderMovementBadge(movement, className) {
  if (!movement) return '';
  const direction = movement.direction === 'up' ? 'up' : 'down';
  const symbol = direction === 'up' ? '↑' : '↓';
  const label = direction === 'up'
    ? `${movement.delta}位アップ`
    : `${movement.delta}位ダウン`;
  return `<span class="${className} ${className}--${direction}" aria-label="${label}" title="${label}">${symbol}</span>`;
}

function normalizeProfileUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch (_) {
      return '';
    }
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
    try {
      return new URL(`https://${raw}`).toString();
    } catch (_) {
      return '';
    }
  }
  const handle = raw.replace(/^@+/, '').trim();
  if (!handle) return '';
  try {
    return new URL(`https://x.com/${handle}`).toString();
  } catch (_) {
    return '';
  }
}

function renderProfileIdentity(nameDisplay) {
  if (!nameDisplay) return;
  const nickname = (() => {
    try {
      return (localStorage.getItem('pixieed_nickname') || '').trim();
    } catch (_) {
      return '';
    }
  })();
  const displayName = nickname || '未設定';
  const saveName = nickname || '名無し';
  try {
    localStorage.setItem(NAME_STORAGE_KEY, saveName);
  } catch (_) {
    // ignore
  }
  const avatarId = (() => {
    try {
      return localStorage.getItem('pixieed_avatar') || 'mao';
    } catch (_) {
      return 'mao';
    }
  })();
  const profileUrl = (() => {
    try {
      return normalizeProfileUrl(localStorage.getItem('pixieed_x_url') || '');
    } catch (_) {
      return '';
    }
  })();

  nameDisplay.textContent = '';
  const wrap = document.createElement('span');
  wrap.className = 'rank-profile';
  const avatar = document.createElement('img');
  avatar.className = 'rank-profile__avatar';
  avatar.src = resolveAvatarSrcFromId(avatarId);
  avatar.alt = '';
  avatar.setAttribute('aria-hidden', 'true');
  wrap.appendChild(avatar);
  if (profileUrl) {
    const link = document.createElement('a');
    link.className = 'rank-profile__name';
    link.href = profileUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = displayName;
    wrap.appendChild(link);
  } else {
    const label = document.createElement('span');
    label.className = 'rank-profile__name';
    label.textContent = displayName;
    wrap.appendChild(label);
  }
  nameDisplay.appendChild(wrap);
}

async function flushQueuedScores() {
  if (typeof window === 'undefined' || typeof window.pixieedFlushMaoituScoreQueue !== 'function') {
    return;
  }
  try {
    await window.pixieedFlushMaoituScoreQueue();
  } catch (error) {
    console.warn('maoitu ranking queue flush failed', error);
  }
}

async function fetchTopScores(includeClientId = true, includeAvatar = true) {
  const collected = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const to = from + PAGE_SIZE - 1;
    const selectColumns = ['name', 'score', 'created_at'];
    if (includeClientId) selectColumns.push('client_id');
    if (includeAvatar) selectColumns.push('avatar');
    const { data, error } = await supabase
      .from('scores')
      .select(selectColumns.join(', '))
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) {
      markSupabaseMaintenanceFromError(error);
      if (includeAvatar && isMissingAvatar(error)) {
        return fetchTopScores(includeClientId, false);
      }
      if (includeClientId && isMissingClientId(error)) {
        return fetchTopScores(false, includeAvatar);
      }
      throw error;
    }
    noteSupabaseSuccess();
    const rows = data || [];
    if (rows.length) {
      collected.push(...rows);
    }
    const unique = uniqueByAccount(collected, RANKING_LIMIT);
    if (unique.length >= RANKING_LIMIT || rows.length < PAGE_SIZE) {
      return unique;
    }
    from += PAGE_SIZE;
  }
  return uniqueByAccount(collected, RANKING_LIMIT);
}

function renderRankingRows(list, rows, movementByAccount = new Map()) {
  list.innerHTML = '';
  const currentAccount = getCurrentAccountIdentity();
  const currentAccountId = accountKey(currentAccount);
  rows.forEach((row, idx) => {
    const li = document.createElement('li');
    const rank = idx + 1;
    li.className = 'rank-item';
    li.dataset.rank = String(rank);
    li.dataset.rankTier = rankTierForPosition(rank);
    if (accountKey(row) === currentAccountId) {
      li.classList.add('rank-item--self');
      li.setAttribute('aria-label', `あなたの順位 ${rank}位`);
    }
    const avatarId = String(row?.avatar || '').trim() || (accountKey(row) === currentAccountId ? currentAccount.avatar : '');
    const movement = movementByAccount.get(accountKey(row));
    li.innerHTML = `<div class="rank-left"><span class="rank-index">${rank}.</span><img class="rank-avatar" src="${escapeHtml(resolveAvatarSrcFromId(avatarId))}" alt="" aria-hidden="true"><span class="rank-name">${escapeHtml(String(row?.name || '名無し'))}</span></div><span class="rank-right"><span class="rank-score-label">SCORE</span><span class="rank-score-row"><span class="rank-score">${Math.max(0, Math.floor(Number(row?.score) || 0))}</span>${renderMovementBadge(movement, 'rank-score-movement')}</span></span>`;
    list.appendChild(li);
  });
}

function renderFeaturedRanks(featuredEl, rows, currentAccountId, movementByAccount = new Map()) {
  if (!featuredEl) return;
  featuredEl.innerHTML = '';
  const topRows = Array.isArray(rows) ? rows.slice(0, 3) : [];
  if (!topRows.length) {
    featuredEl.innerHTML = '<div class="rank-featured__empty">最初のランカーを待っています</div>';
    return;
  }
  const podiumRows = [1, 0, 2]
    .map(index => ({ row: topRows[index], rank: index + 1 }))
    .filter(entry => entry.row);
  podiumRows.forEach(({ row, rank }) => {
    const card = document.createElement('article');
    card.className = 'rank-featured-card';
    card.dataset.rank = String(rank);
    card.dataset.rankTier = rankTierForPosition(rank);
    if (accountKey(row) === currentAccountId) {
      card.classList.add('rank-featured-card--self');
    }
    const avatarId = String(row?.avatar || '').trim();
    const movement = movementByAccount.get(accountKey(row));
    card.innerHTML = `<div class="rank-featured-card__glow" aria-hidden="true"></div><div class="rank-featured-card__content"><div class="rank-featured-card__top"><span class="rank-featured-card__badge">#${rank}</span><span class="rank-featured-card__tier">${tierLabelForRank(rank)}</span></div><img class="rank-featured-card__avatar" src="${escapeHtml(resolveAvatarSrcFromId(avatarId))}" alt="" aria-hidden="true"><div class="rank-featured-card__name">${escapeHtml(String(row?.name || '名無し'))}</div><div class="rank-featured-card__score-row"><div class="rank-featured-card__score">${Math.max(0, Math.floor(Number(row?.score) || 0))}</div>${renderMovementBadge(movement, 'rank-featured-card__trend')}</div></div>`;
    featuredEl.appendChild(card);
  });
}

function renderOverview(overviewEl, rows, currentAccountId) {
  if (!overviewEl) return;
  const total = Array.isArray(rows) ? rows.length : 0;
  const selfRank = Array.isArray(rows)
    ? rows.findIndex(row => accountKey(row) === currentAccountId) + 1
    : 0;
  overviewEl.innerHTML = `<div class="rank-overview__hero"><div class="rank-overview__eyebrow">LIVE LEADERBOARD</div><div class="rank-overview__title">避け続けた勇者たち</div><div class="rank-overview__copy">いま強いプレイヤーがひと目で分かる、まおいつのオンラインランキングです。</div></div><div class="rank-overview__stats"><div class="rank-overview__stat"><span class="rank-overview__stat-label">表示中</span><strong class="rank-overview__stat-value">TOP ${Math.max(1, total)}</strong></div><div class="rank-overview__stat"><span class="rank-overview__stat-label">あなた</span><strong class="rank-overview__stat-value">${selfRank ? `#${selfRank}` : '圏外'}</strong></div></div>`;
}

export async function initRankingUI({ formSelector, listSelector, statusSelector, featuredSelector, overviewSelector }) {
  const form = formSelector ? document.querySelector(formSelector) : null;
  const list = listSelector ? document.querySelector(listSelector) : null;
  const statusEl = statusSelector ? document.querySelector(statusSelector) : null;
  const featuredEl = featuredSelector ? document.querySelector(featuredSelector) : document.getElementById('rankFeatured');
  const overviewEl = overviewSelector ? document.querySelector(overviewSelector) : document.getElementById('rankOverview');
  const nameDisplay = form ? form.querySelector('#rankNameDisplay') : document.getElementById('rankNameDisplay');
  if (!list) return;

  const baseStatus = 'スコアはゲーム終了時に自動送信されます';
  const renderStatus = msg => { if (statusEl) statusEl.textContent = msg || ''; };
  let previousRowsSnapshot = cloneRows(loadRankingCache());
  let refreshTimer = 0;
  let liveRefreshTimer = 0;
  let liveChannel = null;
  let isRefreshing = false;
  let needsRefresh = false;

  if (supabaseMaintenance) {
    setSupabaseMaintenance(true, 'cached');
  }
  if (typeof window !== 'undefined' && window.pixieedFlushMaoituScoreQueue) {
    window.pixieedFlushMaoituScoreQueue();
  }

  renderProfileIdentity(nameDisplay);

  function scheduleRefresh(delay = LIVE_REFRESH_DEBOUNCE_MS) {
    if (typeof window === 'undefined') return;
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      refreshList().catch(error => console.warn('maoitu ranking refresh failed', error));
    }, Math.max(0, delay));
  }

  function startLiveUpdates() {
    if (typeof window === 'undefined') return;
    if (!liveRefreshTimer) {
      liveRefreshTimer = window.setInterval(() => {
        scheduleRefresh();
      }, LIVE_REFRESH_MS);
    }
    if (liveChannel || typeof supabase?.channel !== 'function') {
      return;
    }
    try {
      liveChannel = supabase
        .channel('maoitu-ranking-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
          scheduleRefresh();
        })
        .subscribe();
    } catch (error) {
      console.warn('maoitu ranking live subscribe failed', error);
    }
  }

  function cleanupLiveUpdates() {
    if (typeof window !== 'undefined' && liveRefreshTimer) {
      window.clearInterval(liveRefreshTimer);
      liveRefreshTimer = 0;
    }
    if (refreshTimer && typeof window !== 'undefined') {
      window.clearTimeout(refreshTimer);
      refreshTimer = 0;
    }
    if (liveChannel && typeof supabase?.removeChannel === 'function') {
      supabase.removeChannel(liveChannel);
      liveChannel = null;
    }
  }

  async function refreshList() {
    if (isRefreshing) {
      needsRefresh = true;
      return;
    }
    isRefreshing = true;
    renderProfileIdentity(nameDisplay);
    try {
      renderStatus('読み込み中...');
      await flushQueuedScores();
      const rows = await fetchTopScores();
      renderStatus(baseStatus);
      const currentAccount = getCurrentAccountIdentity();
      const currentAccountId = accountKey(currentAccount);
      const movementByAccount = buildRankMovement(rows, previousRowsSnapshot);
      if (!rows.length) {
        previousRowsSnapshot = [];
        renderOverview(overviewEl, [], currentAccountId);
        renderFeaturedRanks(featuredEl, [], currentAccountId, movementByAccount);
        list.innerHTML = '<li class="rank-item rank-item--empty">まだスコアがありません。</li>';
        return;
      }
      saveRankingCache(rows);
      previousRowsSnapshot = cloneRows(rows);
      renderOverview(overviewEl, rows, currentAccountId);
      renderFeaturedRanks(featuredEl, rows, currentAccountId, movementByAccount);
      renderRankingRows(list, rows, movementByAccount);
    } catch (error) {
      markSupabaseMaintenanceFromError(error);
      const cached = loadRankingCache();
      if (cached.length) {
        renderStatus('メンテナンス中のため前回のランキングを表示しています');
        const currentAccount = getCurrentAccountIdentity();
        const currentAccountId = accountKey(currentAccount);
        const movementByAccount = buildRankMovement(cached, previousRowsSnapshot);
        previousRowsSnapshot = cloneRows(cached);
        renderOverview(overviewEl, cached, currentAccountId);
        renderFeaturedRanks(featuredEl, cached, currentAccountId, movementByAccount);
        renderRankingRows(list, cached, movementByAccount);
        return;
      }
      previousRowsSnapshot = [];
      renderStatus('メンテナンス中です');
      renderOverview(overviewEl, [], 'guest');
      renderFeaturedRanks(featuredEl, [], 'guest');
      list.innerHTML = '<li class="rank-item rank-item--empty">ランキングを取得できませんでした。</li>';
    } finally {
      isRefreshing = false;
      if (needsRefresh) {
        needsRefresh = false;
        scheduleRefresh(0);
      }
    }
  }

  renderStatus(baseStatus);
  await refreshList();
  const handleProfileUpdated = () => {
    renderProfileIdentity(nameDisplay);
    scheduleRefresh(120);
  };
  const handleScoreChanged = () => {
    scheduleRefresh(0);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pixieed:profile-updated', handleProfileUpdated);
    window.addEventListener('pixieed:score-queued', handleScoreChanged);
    window.addEventListener('beforeunload', cleanupLiveUpdates, { once: true });
    window.addEventListener('storage', (event) => {
      if (!event || !event.key) return;
      if (event.key === 'pixieed_nickname' || event.key === 'pixieed_avatar' || event.key === 'pixieed_x_url') {
        handleProfileUpdated();
      }
      if (event.key === RANKING_CACHE_KEY || event.key === SUPABASE_MAINTENANCE_KEY || event.key === LAST_SCORE_KEY) {
        handleScoreChanged();
      }
    });
  }
  startLiveUpdates();
  return { refresh: refreshList, destroy: cleanupLiveUpdates };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s] || s
  ));
}
