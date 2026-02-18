import { supabase } from './supabase.js';

const NAME_STORAGE_KEY = 'maoitu_rank_name';
const LAST_SCORE_KEY = 'maoitu_last_score';
const CLIENT_ID_KEY = 'pixieed_client_id';
const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const SUPABASE_MAINTENANCE_KEY = 'pixieed_supabase_maintenance';
const SCORE_QUEUE_KEY = 'maoitu_score_queue';
const SCORE_QUEUE_LIMIT = 20;
const SCORE_QUEUE_RETRY_MS = 60000;

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

function isSupabaseMaintenance() {
  return supabaseMaintenance;
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

async function probeSupabaseAvailability() {
  try {
    const { error } = await supabase
      .from('scores')
      .select('id')
      .limit(1);
    if (error) {
      markSupabaseMaintenanceFromError(error);
      return false;
    }
    noteSupabaseSuccess();
    return true;
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
    return false;
  }
}

function loadScoreQueue() {
  try {
    const raw = localStorage.getItem(SCORE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveScoreQueue(queue) {
  try {
    localStorage.setItem(SCORE_QUEUE_KEY, JSON.stringify(queue.slice(0, SCORE_QUEUE_LIMIT)));
  } catch (_) {
    // ignore
  }
}

function enqueueScore(score) {
  if (!Number.isFinite(score)) return;
  const queue = loadScoreQueue();
  queue.push({ score, ts: Date.now() });
  saveScoreQueue(queue);
}

function notifyScoreQueued(score) {
  try {
    window.dispatchEvent(new CustomEvent('pixieed:score-queued', { detail: { score } }));
  } catch (_) {
    // ignore
  }
}

function isMissingClientId(error) {
  const msg = String(error?.message || '');
  return msg.includes('client_id');
}

async function submitScoreToSupabase(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const payload = {
    name: getName(),
    score: safeScore,
    client_id: getClientId(),
  };

  let { error } = await supabase.from('scores').insert(payload);
  if (error && payload.client_id && isMissingClientId(error)) {
    delete payload.client_id;
    const retry = await supabase.from('scores').insert(payload);
    error = retry.error;
  }
  if (error) {
    throw error;
  }
  try {
    localStorage.setItem(LAST_SCORE_KEY, String(safeScore));
  } catch (_) {
    // ignore
  }
  noteSupabaseSuccess();
  return true;
}

export async function flushScoreQueue() {
  if (isSupabaseMaintenance()) {
    const recovered = await probeSupabaseAvailability();
    if (!recovered) return;
  }
  const queue = loadScoreQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await submitScoreToSupabase(item.score);
    } catch (error) {
      remaining.push(item);
      markSupabaseMaintenanceFromError(error);
      if (isSupabaseMaintenance()) break;
    }
  }
  saveScoreQueue(remaining);
}

export async function submitScoreAuto(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  if (isSupabaseMaintenance()) {
    enqueueScore(safeScore);
    notifyScoreQueued(safeScore);
    return;
  }
  await flushScoreQueue();
  try {
    await submitScoreToSupabase(safeScore);
  } catch (error) {
    console.error('score submit failed', error);
    markSupabaseMaintenanceFromError(error);
    enqueueScore(safeScore);
    notifyScoreQueued(safeScore);
  }
}

function scheduleScoreQueueFlush() {
  try {
    window.addEventListener('online', () => {
      flushScoreQueue().catch(error => console.warn('score queue flush failed', error));
    });
    window.setInterval(() => {
      if (isSupabaseMaintenance() || loadScoreQueue().length) {
        flushScoreQueue().catch(error => console.warn('score queue flush failed', error));
      }
    }, SCORE_QUEUE_RETRY_MS);
  } catch (_) {
    // ignore
  }
}

export function getName() {
  try {
    const profile = localStorage.getItem('pixieed_nickname');
    if (profile) {
      const normalized = profile.trim().slice(0, 24) || '名無し';
      try {
        localStorage.setItem(NAME_STORAGE_KEY, normalized);
      } catch (_) {
        // ignore
      }
      return normalized;
    }
  } catch (_) {
    // ignore
  }
  try {
    const saved = localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) return saved.trim().slice(0, 24) || '名無し';
  } catch (_) {
    // ignore
  }
  return '名無し';
}

export async function fetchRankInfo(score) {
  return fetchRankInfoWithColumns(score, true);
}

async function fetchRankInfoWithColumns(score, includeClientId) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
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
        return fetchRankInfoWithColumns(score, false);
      }
      throw error;
    }
    noteSupabaseSuccess();
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

try {
  window.pixieedFlushMaoituScoreQueue = flushScoreQueue;
  flushScoreQueue().catch(error => console.warn('score queue flush failed', error));
  scheduleScoreQueueFlush();
} catch (_) {
  // ignore
}
