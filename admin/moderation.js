import { supabaseConfig } from '../data/site-config.js?rev=20260918-post-v2';

const SESSION_KEY = 'PiXiEED:admin-supabase-session:v1';

function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return value?.access_token ? value : null;
  } catch {
    return null;
  }
}

function storeSession(session) {
  try {
    if (session?.access_token) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // セッション保存が使えない環境でも、現在の画面は表示できる。
  }
}

function isConfigured() {
  return Boolean(String(supabaseConfig.url || '').trim() && String(supabaseConfig.publishableKey || '').trim());
}

function baseUrl() {
  return String(supabaseConfig.url || '').trim().replace(/\/$/, '');
}

function headers(token = '') {
  const key = String(supabaseConfig.publishableKey || '').trim();
  return {
    apikey: key,
    Authorization: `Bearer ${token || key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日時不明' : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function readError(response) {
  try {
    const payload = await response.json();
    return String(payload?.error_description || payload?.message || payload?.error || '接続に失敗しました。');
  } catch {
    return '接続に失敗しました。';
  }
}

async function signIn(email, password) {
  const response = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(await readError(response));
  const session = await response.json();
  if (!session?.access_token) throw new Error('管理者セッションを開始できませんでした。');
  storeSession(session);
  return session;
}

async function callModeration(session, body) {
  const functionName = encodeURIComponent(supabaseConfig.moderationFunction || 'moderate-post');
  const response = await fetch(`${baseUrl()}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: headers(session.access_token),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

function renderSetup(root) {
  root.innerHTML = `<div class="admin-moderation__empty"><strong>投稿審査の接続待ちです。</strong><p>SupabaseのURLとpublishable keyを設定すると、ここから審査できます。secret keyはこの画面へ置きません。</p></div>`;
}

function renderLogin(root, onLogin) {
  root.innerHTML = `
    <div class="admin-section-heading"><div><span class="eyebrow">user posts</span><h2>投稿審査</h2></div><p>公開前の画像をここで確認し、セル位置を確定してから地図へ公開します。</p></div>
    <form class="admin-moderation__login" data-moderation-login>
      <label><span>Supabase管理者メール</span><input type="email" autocomplete="username" data-moderation-email required></label>
      <label><span>パスワード</span><input type="password" autocomplete="current-password" data-moderation-password required></label>
      <button class="button button--primary" type="submit">審査室へログイン</button>
      <p class="admin-status" data-moderation-status role="status">Supabase側で作成した管理者アカウントを使います。</p>
    </form>`;
  root.querySelector('[data-moderation-login]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.querySelector('[data-moderation-email]')?.value.trim() || '';
    const password = form.querySelector('[data-moderation-password]')?.value || '';
    const status = form.querySelector('[data-moderation-status]');
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    if (status) status.textContent = 'ログインしています…';
    try {
      const session = await signIn(email, password);
      await onLogin(session);
    } catch (error) {
      storeSession(null);
      if (status) status.textContent = error instanceof Error ? error.message : 'ログインできませんでした。';
      submit.disabled = false;
    }
  });
}

function postLocationLabel(post) {
  const cell = post.location?.mapCell;
  if (!cell) return '<span class="admin-moderation__location admin-moderation__location--missing">公開セル未選択。公開前にセル位置を指定してください。</span>';
  return `<span class="admin-moderation__location">公開セル：${escapeHtml(cell.prefectureCode)} / ${cell.grid}×${cell.grid} / ${cell.x}, ${cell.y}</span>`;
}

function renderPosts(root, posts, onAction) {
  if (!posts.length) {
    root.innerHTML = '<div class="admin-moderation__empty"><strong>審査待ちの投稿はありません。</strong><p>新しい投稿が届くと、ここに表示されます。</p></div>';
    return;
  }
  root.innerHTML = `<div class="admin-moderation__list">${posts.map((post) => {
    const hasCell = Boolean(post.location?.mapCell);
    return `<article class="admin-moderation__post" data-moderation-post="${escapeHtml(post.postId)}">
      <div class="admin-moderation__image-wrap"><img class="admin-moderation__image" src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.title)}" loading="lazy" decoding="async" width="128" height="128"></div>
      <div class="admin-moderation__post-body">
        <div class="admin-moderation__post-head"><div><span class="eyebrow">pending</span><h3>${escapeHtml(post.title)}</h3></div><time datetime="${escapeHtml(post.createdAt)}">${escapeHtml(formatDate(post.createdAt))}</time></div>
        <p class="admin-moderation__caption">${escapeHtml(post.caption || 'コメントなし')}</p>
        <p class="admin-moderation__meta">${post.imageWidth}×${post.imageHeight}px · ${post.colorCount || '—'}色 · ${Math.ceil(Number(post.imageBytes || 0) / 1024)}KB</p>
        ${postLocationLabel(post)}
        <label class="admin-moderation__note"><span>管理メモ</span><textarea rows="2" maxlength="500" data-moderation-note placeholder="公開しない理由や確認メモ"></textarea></label>
        <div class="admin-moderation__actions"><button class="button button--primary" type="button" data-moderation-action="approve" ${hasCell ? '' : 'disabled'}>${hasCell ? 'このセルで公開' : '公開セルが必要'}</button><button class="button button--quiet" type="button" data-moderation-action="reject">非公開にする</button></div>
      </div>
    </article>`;
  }).join('')}</div>`;
  root.querySelectorAll('[data-moderation-post]').forEach((card) => {
    card.querySelectorAll('[data-moderation-action]').forEach((button) => {
      button.addEventListener('click', () => onAction({
        postId: card.dataset.moderationPost,
        action: button.dataset.moderationAction,
        note: card.querySelector('[data-moderation-note]')?.value.trim() || '',
        mapCell: posts.find((post) => post.postId === card.dataset.moderationPost)?.location?.mapCell || null
      }));
    });
  });
}

export function bindModerationPanel(root) {
  if (!root) return;
  const state = { session: readSession(), posts: [], busy: false };

  const render = () => {
    if (!isConfigured()) return renderSetup(root);
    if (!state.session) return renderLogin(root, async (session) => { state.session = session; render(); await loadPosts(); });
    root.innerHTML = `
      <div class="admin-section-heading"><div><span class="eyebrow">user posts</span><h2>投稿審査</h2></div><div class="admin-moderation__toolbar"><span>${escapeHtml(state.session.user?.email || '管理者セッション')}</span><button class="button button--quiet" type="button" data-moderation-refresh>再読み込み</button><button class="button button--light" type="button" data-moderation-logout>ログアウト</button></div></div>
      <p class="admin-status" data-moderation-status role="status">審査待ちを読み込んでいます。</p>
      <div data-moderation-list></div>`;
    root.querySelector('[data-moderation-refresh]')?.addEventListener('click', loadPosts);
    root.querySelector('[data-moderation-logout]')?.addEventListener('click', () => { storeSession(null); state.session = null; render(); });
  };

  const loadPosts = async () => {
    if (!state.session || state.busy) return;
    state.busy = true;
    const status = root.querySelector('[data-moderation-status]');
    if (status) status.textContent = '審査待ちを読み込んでいます…';
    try {
      const result = await callModeration(state.session, { action: 'list' });
      state.posts = Array.isArray(result.posts) ? result.posts : [];
      const list = root.querySelector('[data-moderation-list]');
      if (list) renderPosts(list, state.posts, moderate);
      if (status) status.textContent = `${state.posts.length}件の審査待ちです。`;
    } catch (error) {
      if (/authentication|admin_access/.test(error instanceof Error ? error.message : '')) {
        storeSession(null);
        state.session = null;
        render();
      } else if (status) status.textContent = error instanceof Error ? error.message : '審査データを読み込めませんでした。';
    } finally {
      state.busy = false;
    }
  };

  const moderate = async (payload) => {
    if (!state.session || state.busy) return;
    const card = root.querySelector(`[data-moderation-post="${CSS.escape(payload.postId)}"]`);
    const buttons = [...(card?.querySelectorAll('button') || [])];
    buttons.forEach((button) => { button.disabled = true; });
    const status = root.querySelector('[data-moderation-status]');
    if (status) status.textContent = payload.action === 'approve' ? '画像を公開領域へ移しています…' : '非公開として保存しています…';
    try {
      await callModeration(state.session, payload);
      await loadPosts();
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; });
      if (status) status.textContent = error instanceof Error ? error.message : '審査処理に失敗しました。';
    }
  };

  render();
  if (state.session && isConfigured()) void loadPosts();
}
