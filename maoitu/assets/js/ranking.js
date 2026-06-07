import { supabase } from './supabase.js';

const RANKING_LIMIT = 100;
const PAGE_SIZE = 500;
const MAX_PAGES = 10;
const NAME_STORAGE_KEY = 'maoitu_rank_name';
const SUPABASE_MAINTENANCE_KEY = 'pixieed_supabase_maintenance';
const RANKING_CACHE_KEY = 'maoitu_rank_cache';
const RANKING_CACHE_LIMIT = 100;

let supabaseMaintenance = Boolean(readSupabaseMaintenance());

function accountKey(row) {
  const clientId = row && row.client_id ? String(row.client_id).trim() : '';
  if (clientId) return `client:${clientId}`;
  return (row?.name || '').trim().toLowerCase() || 'guest';
}

function uniqueByAccount(rows, limit = Infinity) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = accountKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
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

function resolveAvatarSrcFromId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!id || id === 'mao') return '../character-dots/mao1.png';
  if (/^jerin[1-8]$/.test(id)) return `../character-dots/Jerin${id.slice(5)}.png`;
  if (/^jellnall([1-9]|1[0-9])$/.test(id)) return `../character-dots/${id.toUpperCase()}.png`;
  if (id === 'baburin') return '../character-dots/baburinpng.png';
  return '../character-dots/mao1.png';
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

async function fetchTopScores(includeClientId = true) {
  const collected = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const to = from + PAGE_SIZE - 1;
    const selectColumns = ['name', 'score', 'created_at'];
    if (includeClientId) selectColumns.push('client_id');
    const { data, error } = await supabase
      .from('scores')
      .select(selectColumns.join(', '))
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) {
      markSupabaseMaintenanceFromError(error);
      if (includeClientId && isMissingClientId(error)) {
        return fetchTopScores(false);
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

function renderRankingRows(list, rows) {
  list.innerHTML = '';
  rows.forEach((row, idx) => {
    const li = document.createElement('li');
    li.className = 'rank-item';
    li.dataset.rank = String(idx + 1);
    const medal = idx === 0 ? '<span class="rank-medal rank-medal--1">1st</span>'
      : idx === 1 ? '<span class="rank-medal rank-medal--2">2nd</span>'
      : idx === 2 ? '<span class="rank-medal rank-medal--3">3rd</span>'
      : '';
    li.innerHTML = `<div class="rank-left"><span class="rank-index">${idx + 1}.</span>${medal}<span class="rank-name">${escapeHtml(String(row?.name || '名無し'))}</span></div><span class="rank-score">${Math.max(0, Math.floor(Number(row?.score) || 0))}</span>`;
    list.appendChild(li);
  });
}

export async function initRankingUI({ formSelector, listSelector, statusSelector }) {
  const form = formSelector ? document.querySelector(formSelector) : null;
  const list = listSelector ? document.querySelector(listSelector) : null;
  const statusEl = statusSelector ? document.querySelector(statusSelector) : null;
  const nameDisplay = form ? form.querySelector('#rankNameDisplay') : document.getElementById('rankNameDisplay');
  if (!list) return;

  const baseStatus = 'スコアはゲーム終了時に自動送信されます';
  const renderStatus = msg => { if (statusEl) statusEl.textContent = msg || ''; };

  if (supabaseMaintenance) {
    setSupabaseMaintenance(true, 'cached');
  }
  if (typeof window !== 'undefined' && window.pixieedFlushMaoituScoreQueue) {
    window.pixieedFlushMaoituScoreQueue();
  }

  renderProfileIdentity(nameDisplay);

  async function refreshList() {
    renderProfileIdentity(nameDisplay);
    try {
      renderStatus('読み込み中...');
      const rows = await fetchTopScores();
      renderStatus(baseStatus);
      if (!rows.length) {
        list.innerHTML = '<li class="rank-item">まだスコアがありません。</li>';
        return;
      }
      saveRankingCache(rows);
      renderRankingRows(list, rows);
    } catch (error) {
      markSupabaseMaintenanceFromError(error);
      const cached = loadRankingCache();
      if (cached.length) {
        renderStatus('メンテナンス中のため前回のランキングを表示しています');
        renderRankingRows(list, cached);
        return;
      }
      renderStatus('メンテナンス中です');
      list.innerHTML = '<li class="rank-item">ランキングを取得できませんでした。</li>';
    }
  }

  renderStatus(baseStatus);
  await refreshList();
  return { refresh: refreshList };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s] || s
  ));
}
