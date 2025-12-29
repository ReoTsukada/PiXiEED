import { supabase } from './supabase.js';

const NAME_STORAGE_KEY = 'maoitu_rank_name';
const LAST_SCORE_KEY = 'maoitu_last_score';

export async function submitScoreAuto(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const name = getName();
  const { error } = await supabase.from('scores').insert({
    name,
    score: safeScore
  });
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
    const saved = localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) return saved.trim().slice(0, 24) || 'Guest';
  } catch (_) {}
  return 'Guest';
}

export async function fetchRankInfo(score) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  let total = 0;
  let greater = 0;
  const totalRes = await supabase.from('scores').select('score', { count: 'exact', head: true });
  if (totalRes.error) throw totalRes.error;
  total = totalRes.count || 0;
  const greaterRes = await supabase
    .from('scores')
    .select('score', { count: 'exact', head: true })
    .gt('score', safeScore);
  if (greaterRes.error) throw greaterRes.error;
  greater = greaterRes.count || 0;
  const rank = greater + 1;
  const percentile = total > 0 ? Math.min(100, Math.max(0, (rank / total) * 100)) : 100;
  return { total, rank, percentile };
}
