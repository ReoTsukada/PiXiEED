(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const CLIENT_ID_STORAGE_KEY = 'pixieed_client_id';
  const list = document.getElementById('pixfindPostList');
  const count = document.getElementById('pixfindPostCount');
  const currentScript = document.currentScript;
  let renderToken = 0;

  if (!list || !count) return;

  function asset(relativePath) {
    try {
      return new URL(relativePath, currentScript?.src || window.location.href).href;
    } catch (_error) {
      return relativePath;
    }
  }

  function getClientId() {
    try {
      return String(localStorage.getItem(CLIENT_ID_STORAGE_KEY) || window.PIXIEED_CLIENT_ID || '').trim();
    } catch (_error) {
      return '';
    }
  }

  function isSignedIn() {
    return document.body?.dataset.pixieedAccountAuth === 'signed-in';
  }

  async function getAccessContext() {
    const client = window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__
      || await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__?.catch(() => null);
    const result = await client?.auth?.getSession?.();
    const session = result?.data?.session || null;
    return { token: session?.access_token || SUPABASE_ANON_KEY, userId: session?.user?.id || '' };
  }

  function formatDate(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return '公開日不明';
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  function getModeLabel(entry) {
    const mode = String(entry?.game_mode || entry?.play_mode || entry?.mode || '').toLowerCase();
    return mode === 'hidden-object' ? 'もの探し' : '間違い探し';
  }

  function renderEmpty() {
    const item = document.createElement('div');
    item.className = 'account-item';

    const cover = document.createElement('div');
    cover.className = 'account-cover';
    const image = document.createElement('img');
    image.src = asset('../icon/icon-192-2.png');
    image.alt = '';
    cover.appendChild(image);

    const body = document.createElement('div');
    body.className = 'account-item__body';
    const title = document.createElement('strong');
    title.textContent = '投稿はまだありません';
    const description = document.createElement('span');
    description.textContent = 'PiXFiNDで問題を作ると、ここからすぐ確認できます。';
    body.append(title, description);

    const action = document.createElement('a');
    action.className = 'account-action';
    action.href = asset('../pixfind/index.html#creator');
    action.textContent = '作る';
    item.append(cover, body, action);
    list.replaceChildren(item);
    count.textContent = '0件';
  }

  function createCard(entry) {
    const puzzleId = String(entry?.id || '').trim();
    const puzzleUrl = asset(`../pixfind/index.html?puzzle=${encodeURIComponent(puzzleId)}`);
    const card = document.createElement('article');
    card.className = 'account-pixfind-card';

    const preview = document.createElement('a');
    preview.className = 'account-pixfind-card__preview';
    preview.href = puzzleUrl;
    preview.setAttribute('aria-label', `${entry?.label || 'PiXFiND'}を遊ぶ`);
    const image = document.createElement('img');
    image.src = String(entry?.thumbnail_url || entry?.original_url || asset('../icon/icon-192-2.png'));
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    preview.appendChild(image);

    const body = document.createElement('div');
    body.className = 'account-pixfind-card__body';
    const title = document.createElement('strong');
    title.textContent = String(entry?.label || 'PiXFiND Puzzle');
    const meta = document.createElement('span');
    meta.className = 'account-pixfind-card__meta';
    const mode = document.createElement('span');
    mode.textContent = `${getModeLabel(entry)} ${'★'.repeat(Math.max(1, Math.min(3, Number(entry?.difficulty) || 1)))}`;
    const date = document.createElement('span');
    date.textContent = formatDate(entry?.created_at);
    const plays = document.createElement('span');
    plays.textContent = `プレイ ${Math.max(0, Number(entry?.valid_play_count) || 0).toLocaleString('ja-JP')}回`;
    meta.append(mode, plays, date);
    const actions = document.createElement('div');
    actions.className = 'account-card-actions';
    const open = document.createElement('a');
    open.className = 'account-card-action account-card-action--primary';
    open.href = puzzleUrl;
    open.textContent = '開く';
    const share = document.createElement('button');
    share.className = 'account-card-action account-card-action--share';
    share.type = 'button';
    share.title = 'リンクをコピー';
    share.setAttribute('aria-label', `${entry?.label || 'PiXFiND'}のリンクをコピー`);
    share.addEventListener('click', async () => {
      share.disabled = true;
      try {
        if (!window.PiXiEEDAccountShare) throw new Error('share-unavailable');
        await window.PiXiEEDAccountShare.copyLink(puzzleUrl);
        share.classList.add('is-success');
        share.setAttribute('aria-label', `${entry?.label || 'PiXFiND'}のリンクをコピーしました`);
      } catch (_error) {
        share.classList.add('is-error');
        share.setAttribute('aria-label', `${entry?.label || 'PiXFiND'}のリンクをコピーできませんでした`);
      }
      window.setTimeout(() => {
        share.disabled = false;
        share.classList.remove('is-success', 'is-error');
        share.setAttribute('aria-label', `${entry?.label || 'PiXFiND'}のリンクをコピー`);
      }, 1800);
    });
    const remove = document.createElement('button');
    remove.className = 'account-card-action account-card-action--delete';
    remove.type = 'button';
    remove.title = '作品を削除';
    remove.setAttribute('aria-label', `${entry?.label || 'PiXFiND'}を削除`);
    remove.addEventListener('click', async () => {
      if (!puzzleId || !window.confirm(`「${entry?.label || 'この作品'}」を削除しますか？`)) return;
      remove.disabled = true;
      try {
        await deletePost(puzzleId);
        card.remove();
        const remaining = list.querySelectorAll('.account-pixfind-card').length;
        count.textContent = `${remaining}件`;
        if (!remaining) renderEmpty();
      } catch (_error) {
        remove.disabled = false;
        window.alert('削除に失敗しました。ログイン状態を確認して、もう一度お試しください。');
      }
    });
    actions.append(open, share, remove);
    body.append(title, meta, actions);
    card.append(preview, body);
    return card;
  }

  function renderError() {
    const item = document.createElement('div');
    item.className = 'account-item';
    const body = document.createElement('div');
    body.className = 'account-item__body';
    const title = document.createElement('strong');
    title.textContent = '投稿を読み込めませんでした';
    const description = document.createElement('span');
    description.textContent = '通信状態を確認して、ページを再読み込みしてください。';
    body.append(title, description);
    item.append(body);
    list.replaceChildren(item);
    count.textContent = '要確認';
  }

  async function deletePost(puzzleId) {
    const clientId = getClientId();
    const access = await getAccessContext();
    if (!access.userId && !clientId) throw new Error('ownership-missing');
    const params = new URLSearchParams({ id: `eq.${puzzleId}` });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/pixfind_puzzles?${params}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${access.token}`,
        'x-client-id': clientId,
        Prefer: 'return=representation',
      },
    });
    if (!response.ok) throw new Error(`delete failed: ${response.status}`);
  }

  async function refresh() {
    const token = ++renderToken;
    if (!isSignedIn()) return;
    const clientId = getClientId();
    const access = await getAccessContext();
    if (!access.userId && !clientId) {
      renderEmpty();
      return;
    }

    count.textContent = '確認中';
    if (access.userId && clientId) {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/pixfind_claim_my_puzzles_v1`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${access.token}`,
          'x-client-id': clientId,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }).catch(() => {});
    }
    const params = new URLSearchParams({
      select: 'id,label,difficulty,mode,game_mode,play_mode,thumbnail_url,original_url,valid_play_count,created_at',
      order: 'created_at.desc',
      limit: '100',
    });
    if (access.userId && clientId) params.set('or', `(creator_user_id.eq.${access.userId},client_id.eq.${clientId})`);
    else if (access.userId) params.set('creator_user_id', `eq.${access.userId}`);
    else params.set('client_id', `eq.${clientId}`);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/pixfind_puzzles?${params}`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${access.token}`,
          'x-client-id': clientId,
        },
      });
      if (!response.ok) throw new Error(`PiXFiND posts request failed: ${response.status}`);
      const entries = await response.json();
      if (token !== renderToken) return;
      if (!Array.isArray(entries) || entries.length === 0) {
        renderEmpty();
        return;
      }
      list.replaceChildren(...entries.map(createCard));
      count.textContent = `${entries.length}件`;
    } catch (_error) {
      if (token === renderToken) renderError();
    }
  }

  const authObserver = new MutationObserver(() => {
    if (isSignedIn()) refresh();
    else renderToken += 1;
  });
  authObserver.observe(document.body, { attributes: true, attributeFilter: ['data-pixieed-account-auth'] });
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh, { passive: true });
  window.addEventListener('storage', (event) => {
    if (event.key === CLIENT_ID_STORAGE_KEY) refresh();
  });
  window.setTimeout(refresh, 0);
})();
