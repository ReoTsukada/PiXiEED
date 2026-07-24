(function () {
  'use strict';

  const MAX_LENGTH = 25;
  const form = document.getElementById('marketWantPostForm');
  const input = document.getElementById('marketWantPostInput');
  const submit = document.getElementById('marketWantPostSubmit');
  const count = document.getElementById('marketWantPostCount');
  const status = document.getElementById('marketWantPostStatus');
  const list = document.getElementById('marketWantPostList');
  const fields = document.getElementById('marketWantPostFields');
  const toggle = document.getElementById('marketWantPostToggle');
  const cancel = document.getElementById('marketWantPostCancel');
  const panel = document.getElementById('marketWantPosts');
  const title = document.getElementById('marketWantPostsTitle');
  const description = document.getElementById('marketWantPostsDescription');

  if (!form || !input || !submit || !count || !status || !list || !fields || !toggle || !cancel || !panel || !title || !description) return;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `market-want-posts__status${kind ? ` is-${kind}` : ''}`;
  }

  function updateCount() {
    count.textContent = `${input.value.length} / ${MAX_LENGTH}`;
  }

  function togglePostFields(shouldOpen) {
    fields.hidden = !shouldOpen;
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    panel.dataset.mode = shouldOpen ? 'compose' : 'featured';
    title.textContent = shouldOpen ? '欲しい素材を投稿' : '欲しい素材';
    description.textContent = shouldOpen
      ? 'テキストのみ・25文字まで入力できます。'
      : 'みんなが欲しい素材を毎日1件表示します。';
    if (shouldOpen) {
      fields.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    } else {
      setStatus('');
    }
  }

  function render(post) {
    if (!post?.body) {
      const empty = document.createElement('span');
      empty.className = 'market-want-posts__empty';
      empty.textContent = 'まだ投稿はありません。';
      list.replaceChildren(empty);
    } else {
      const item = document.createElement('span');
      item.className = 'market-want-post';
      item.textContent = String(post.body);
      list.replaceChildren(item);
    }
  }

  async function getClient() {
    return window.PiXiEEDMarketAccess?.getClient?.() || null;
  }

  async function loadPosts() {
    const client = await getClient().catch(() => null);
    if (!client) {
      render([]);
      return;
    }
    const { data, error } = await client.rpc('market_public_want_posts_v1');
    if (error) {
      render([]);
      return;
    }
    render(Array.isArray(data) ? data[0] : null);
  }

  function scheduleDailyRefresh() {
    // The database picks by Japan's calendar day. Refresh an open page just
    // after the same day boundary so it does not keep yesterday's request.
    const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const jstNow = new Date(Date.now() + JST_OFFSET_MS);
    const nextJstMidnight = Date.UTC(
      jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() + 1
    ) - JST_OFFSET_MS;
    window.setTimeout(() => {
      void loadPosts();
      scheduleDailyRefresh();
    }, Math.max(1000, nextJstMidnight - Date.now() + 250));
  }

  function goToLogin() {
    const accountUrl = new URL('../account/index.html', window.location.href);
    accountUrl.searchParams.set('returnTo', window.location.href);
    window.location.assign(accountUrl.href);
  }

  input.addEventListener('input', updateCount);
  toggle.addEventListener('click', () => togglePostFields(fields.hidden));
  cancel.addEventListener('click', () => togglePostFields(false));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) {
      setStatus('内容を入力してください。', 'error');
      input.focus();
      return;
    }
    if (body.length > MAX_LENGTH) {
      setStatus('25文字以内で入力してください。', 'error');
      return;
    }
    const access = await window.PiXiEEDMarketAccess?.check?.({ refresh: true });
    if (!access?.allowed || !access.client) {
      goToLogin();
      return;
    }
    submit.disabled = true;
    setStatus('投稿しています。');
    const { error } = await access.client.rpc('market_create_want_post_v1', { input_body: body });
    submit.disabled = false;
    if (error) {
      setStatus(error.message || '投稿できませんでした。時間をおいて再試行してください。', 'error');
      return;
    }
    input.value = '';
    updateCount();
    await loadPosts();
    togglePostFields(false);
  });

  updateCount();
  void loadPosts();
  scheduleDailyRefresh();
})();
