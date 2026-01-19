import { supabase } from './supabase.js';

const NAME_STORAGE_KEY = 'maoitu_rank_name';
const LAST_SCORE_KEY = 'maoitu_last_score';
const CLIENT_ID_KEY = 'pixieed_client_id';
const PAGE_SIZE = 500;
const MAX_PAGES = 20;

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

export async function submitScoreAuto(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const name = getName();
  const clientId = getClientId();
  const payload = { name, score: safeScore, client_id: clientId };
  let { error } = await supabase.from('scores').insert(payload);
  if (error && isMissingClientId(error)) {
    const retry = await supabase.from('scores').insert({ name, score: safeScore });
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
  const collected = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const to = from + PAGE_SIZE - 1;
    const selectColumns = 'name, score, created_at, client_id';
    const { data, error } = await supabase
      .from('scores')
      .select(selectColumns)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) {
      if (isMissingClientId(error)) {
        return fetchRankInfoFallback(score);
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

async function fetchRankInfoFallback(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const collected = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('scores')
      .select('name, score, created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw error;
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
