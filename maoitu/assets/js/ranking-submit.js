import { supabase } from './supabase.js';

const NAME_STORAGE_KEY = 'maoitu_rank_name';
const LAST_SCORE_KEY = 'maoitu_last_score';
const CLIENT_ID_KEY = 'pixieed_client_id';
const PAGE_SIZE = 500;
const MAX_PAGES = 20;
let cachedUserId = null;
let checkedAuth = false;
let profileSynced = false;
let scoreMigrated = false;

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

function getClientId() {
  try {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID ? crypto.randomUUID() : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch (_) {
    return `guest-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function isMissingClientId(error) {
  const msg = String(error?.message || '');
  return msg.includes('client_id');
}

function isMissingUserId(error) {
  const msg = String(error?.message || '');
  return msg.includes('user_id');
}

async function hasOtherUserLinkedScores(userId, clientId) {
  try {
    const { data, error } = await supabase
      .from('scores')
      .select('user_id')
      .eq('client_id', clientId)
      .not('user_id', 'is', null)
      .limit(1);
    if (error) {
      if (isMissingUserId(error)) return false;
      return false;
    }
    const linked = data && data[0] ? data[0].user_id : null;
    return !!(linked && linked !== userId);
  } catch (_) {
    return false;
  }
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

async function migrateGuestScores() {
  if (scoreMigrated) return;
  const userId = await getUserId();
  if (!userId) return;
  const clientId = getClientId();
  const conflict = await hasOtherUserLinkedScores(userId, clientId);
  if (conflict) {
    try { localStorage.setItem('pixieed_link_conflict', '1'); } catch (_) {}
    return;
  }
  try {
    const { error } = await supabase
      .from('scores')
      .update({ user_id: userId })
      .eq('client_id', clientId)
      .is('user_id', null);
    if (error) {
      if (isMissingUserId(error)) {
        scoreMigrated = true;
        return;
      }
      console.warn('score migrate failed', error);
      return;
    }
    scoreMigrated = true;
  } catch (err) {
    console.warn('score migrate failed', err);
  }
}

async function prepareAuthContext() {
  await syncProfileFromServer();
  await migrateGuestScores();
}

export async function submitScoreAuto(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  await prepareAuthContext();
  const name = getName();
  const clientId = getClientId();
  const userId = await getUserId();
  const payload = { name, score: safeScore, client_id: clientId };
  if (userId) payload.user_id = userId;
  let { error } = await supabase.from('scores').insert(payload);
  if (error && payload.user_id && isMissingUserId(error)) {
    delete payload.user_id;
    const retry = await supabase.from('scores').insert(payload);
    error = retry.error;
  }
  if (error && payload.client_id && isMissingClientId(error)) {
    delete payload.client_id;
    const retry = await supabase.from('scores').insert(payload);
    error = retry.error;
  }
  if (error) {
    console.error('score submit failed', error);
  }
  try {
    localStorage.setItem(LAST_SCORE_KEY, String(safeScore));
  } catch (_) {
    // ignore
  }
}

export function getName() {
  try {
    const profile = localStorage.getItem('pixieed_nickname');
    if (profile) {
      const normalized = profile.trim().slice(0, 24) || '名無し';
      try { localStorage.setItem(NAME_STORAGE_KEY, normalized); } catch (_) {}
      return normalized;
    }
  } catch (_) {}
  try {
    const saved = localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) return saved.trim().slice(0, 24) || '名無し';
  } catch (_) {}
  return '名無し';
}

export async function fetchRankInfo(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  return fetchRankInfoWithColumns(score, true, true);
}

async function fetchRankInfoWithColumns(score, includeUserId, includeClientId) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
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
        return fetchRankInfoWithColumns(score, false, includeClientId);
      }
      if (includeClientId && isMissingClientId(error)) {
        return fetchRankInfoWithColumns(score, includeUserId, false);
      }
      throw error;
    }
    const rows = data || [];
    if (rows.length) {
      collected.push(...rows);
    }
    if (rows.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }
  const unique = uniqueByAccount(collected);
  const total = unique.length;
  let greater = 0;
  for (const row of unique) {
    const rowScore = Math.max(0, Math.floor(Number(row.score) || 0));
    if (rowScore > safeScore) {
      greater++;
    } else {
      break;
    }
  }
  const rank = total > 0 ? greater + 1 : 0;
  const percentile = total > 0 ? Math.min(100, Math.max(0, (rank / total) * 100)) : 100;
  return { total, rank, percentile };
}
