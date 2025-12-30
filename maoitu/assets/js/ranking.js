import { supabase } from './supabase.js';

const RANKING_LIMIT = 100;
const NAME_STORAGE_KEY = 'maoitu_rank_name';

async function fetchTopScores() {
  const { data, error } = await supabase
    .from('scores')
    .select('name, score, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(RANKING_LIMIT);
  if (error) throw error;
  return data || [];
}

export async function initRankingUI({ formSelector, listSelector, statusSelector }) {
  const form = formSelector ? document.querySelector(formSelector) : null;
  const list = listSelector ? document.querySelector(listSelector) : null;
  const statusEl = statusSelector ? document.querySelector(statusSelector) : null;
  const nameInput = form ? form.querySelector('input[name="rankName"]') : document.querySelector('input[name="rankName"]');
  if (!list) return;

  const baseStatus = 'スコアはゲーム終了時に自動送信されます';
  const renderStatus = msg => { if (statusEl) statusEl.textContent = msg || ''; };

  // 既存の名前をセット（入力を保存のみ・送信はゲーム終了時に自動）
  try {
    if (nameInput) {
      const saved = localStorage.getItem(NAME_STORAGE_KEY);
      if (saved) nameInput.value = saved;
      nameInput.addEventListener('input', () => {
        try { localStorage.setItem(NAME_STORAGE_KEY, nameInput.value); } catch (_) {}
      });
    }
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

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (nameInput) {
        try { localStorage.setItem(NAME_STORAGE_KEY, nameInput.value); } catch (_) {}
      }
      renderStatus('名前を保存しました（スコアは自動送信）');
    });
  }

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
