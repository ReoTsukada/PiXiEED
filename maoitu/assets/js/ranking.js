import { supabase } from './supabase.js';

const RANKING_LIMIT = 100;
const PAGE_SIZE = 500;
const MAX_PAGES = 10;
const NAME_STORAGE_KEY = 'maoitu_rank_name';
let profileSynced = false;
let cachedUserId = null;
let checkedAuth = false;

function accountKey(row) {
  const userId = row && row.user_id ? String(row.user_id).trim() : '';
  if (userId) return `user:${userId}`;
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

function isMissingClientId(error) {
  const msg = String(error?.message || '');
  return msg.includes('client_id');
}

function isMissingUserId(error) {
  const msg = String(error?.message || '');
  return msg.includes('user_id');
}

async function getUserId() {
  if (checkedAuth) return cachedUserId;
  checkedAuth = true;
  try {
    const { data } = await supabase.auth.getSession();
    cachedUserId = data?.session?.user?.id || null;
  } catch (_) {
    cachedUserId = null;
  }
  return cachedUserId;
}

async function syncProfileFromServer() {
  if (profileSynced) return;
  profileSynced = true;
  const userId = await getUserId();
  if (!userId) return;
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('nickname')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data?.nickname) {
      localStorage.setItem('pixieed_nickname', data.nickname);
    }
  } catch (_) {
    // ignore
  }
}

async function fetchTopScores(includeUserId = true, includeClientId = true) {
  const collected = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const to = from + PAGE_SIZE - 1;
    const selectColumns = ['name', 'score', 'created_at'];
    if (includeUserId) selectColumns.push('user_id');
    if (includeClientId) selectColumns.push('client_id');
    const { data, error } = await supabase
      .from('scores')
      .select(selectColumns.join(', '))
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) {
      if (includeUserId && isMissingUserId(error)) {
        return fetchTopScores(false, includeClientId);
      }
      if (includeClientId && isMissingClientId(error)) {
        return fetchTopScores(includeUserId, false);
      }
      throw error;
    }
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

export async function initRankingUI({ formSelector, listSelector, statusSelector }) {
  const form = formSelector ? document.querySelector(formSelector) : null;
  const list = listSelector ? document.querySelector(listSelector) : null;
  const statusEl = statusSelector ? document.querySelector(statusSelector) : null;
  const nameDisplay = form ? form.querySelector('#rankNameDisplay') : document.getElementById('rankNameDisplay');
  if (!list) return;

  const baseStatus = 'スコアはゲーム終了時に自動送信されます';
  const renderStatus = msg => { if (statusEl) statusEl.textContent = msg || ''; };

  await syncProfileFromServer();

  // プロフィール名を反映（編集はプロフィールパネルのみ）
  try {
    const nick = localStorage.getItem('pixieed_nickname') || '';
    const displayName = nick.trim() || '未設定';
    const saveName = nick.trim() || '名無し';
    if (nameDisplay) nameDisplay.textContent = displayName;
    try { localStorage.setItem(NAME_STORAGE_KEY, saveName); } catch (_) {}
  } catch (_) {
    // ignore
  }

  async function refreshList() {
    try {
      renderStatus('読み込み中...');
      const rows = await fetchTopScores();
      renderStatus(baseStatus);
      list.innerHTML = '';
      if (!rows.length) {
        list.innerHTML = '<li class="rank-item">まだスコアがありません。</li>';
        return;
      }
      rows.forEach((row, idx) => {
        const li = document.createElement('li');
        li.className = 'rank-item';
        li.dataset.rank = String(idx + 1);
        const medal = idx === 0 ? '<span class="rank-medal rank-medal--1">1st</span>'
          : idx === 1 ? '<span class="rank-medal rank-medal--2">2nd</span>'
          : idx === 2 ? '<span class="rank-medal rank-medal--3">3rd</span>'
          : '';
        li.innerHTML = `<div class="rank-left"><span class="rank-index">${idx + 1}.</span>${medal}<span class="rank-name">${escapeHtml(row.name)}</span></div><span class="rank-score">${row.score}</span>`;
        list.appendChild(li);
      });
    } catch (e) {
      renderStatus('ランキングの取得に失敗しました');
    }
  }

  renderStatus(baseStatus);

  await refreshList();
  return {
    refresh: refreshList
  };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, s => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s] || s
  ));
}
