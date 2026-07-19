(function () {
  'use strict';

  const list = document.getElementById('marketListingList');
  const count = document.getElementById('marketListingCount');
  const shareStatus = document.getElementById('marketListingShareStatus');
  const currentScript = document.currentScript;
  let renderToken = 0;

  if (!list || !count) return;

  const STATUS_LABELS = Object.freeze({
    draft: '下書き',
    review: '審査中',
    published: '公開中',
    rejected: '要修正',
    suspended: '公開停止',
    archived: '終了'
  });

  function asset(relativePath) {
    try {
      return new URL(relativePath, currentScript?.src || window.location.href).href;
    } catch (_error) {
      return relativePath;
    }
  }

  function formatPrice(value) {
    return `${Math.max(0, Number(value) || 0).toLocaleString('ja-JP')}円`;
  }

  function formatDate(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return '更新日不明';
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  }

  function safePreview(value) {
    const preview = String(value || '').trim();
    return /^https:\/\//i.test(preview) ? preview : asset('../Market.png');
  }

  function renderMessage(titleText, detailText) {
    const item = document.createElement('div');
    item.className = 'account-item';
    const cover = document.createElement('div');
    cover.className = 'account-cover';
    const image = new Image();
    image.src = asset('../Market.png');
    image.alt = '';
    cover.appendChild(image);
    const body = document.createElement('div');
    body.className = 'account-item__body';
    const title = document.createElement('strong');
    title.textContent = titleText;
    const detail = document.createElement('span');
    detail.textContent = detailText;
    body.append(title, detail);
    item.append(cover, body);
    list.replaceChildren(item);
  }

  function createCard(entry) {
    const id = String(entry?.id || '').trim();
    const titleText = String(entry?.title || '出品物');
    const published = entry?.status === 'published';
    const publicUrl = asset(`../market/item.html?id=${encodeURIComponent(id)}`);
    const card = document.createElement('article');
    card.className = 'account-listing-card';

    const preview = document.createElement(published ? 'a' : 'div');
    preview.className = 'account-listing-card__preview';
    if (published) {
      preview.href = publicUrl;
      preview.setAttribute('aria-label', `${titleText}の商品ページを開く`);
    }
    const image = new Image();
    image.src = safePreview(entry?.preview_url);
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    image.dataset.marketProtectedMedia = 'true';
    const status = document.createElement('span');
    status.className = `account-listing-card__status${published ? ' is-published' : ''}`;
    status.textContent = STATUS_LABELS[entry?.status] || '確認中';
    preview.append(image, status);

    const body = document.createElement('div');
    body.className = 'account-listing-card__body';
    const title = document.createElement('strong');
    title.textContent = titleText;
    title.title = titleText;
    const meta = document.createElement('div');
    meta.className = 'account-listing-card__meta';
    const price = document.createElement('span');
    price.textContent = formatPrice(entry?.sale_price_yen);
    const date = document.createElement('span');
    date.textContent = formatDate(entry?.published_at || entry?.updated_at || entry?.created_at);
    meta.append(price, date);

    const actions = document.createElement('div');
    actions.className = 'account-card-actions';
    if (published) {
      const open = document.createElement('a');
      open.className = 'account-card-action account-card-action--primary';
      open.href = publicUrl;
      open.textContent = '商品を見る';
      actions.appendChild(open);
    }
    const share = document.createElement('button');
    share.className = 'account-card-action';
    share.type = 'button';
    share.disabled = !published;
    share.textContent = published ? 'リンクをコピー' : '公開後に共有';
    share.setAttribute('aria-label', published ? `${titleText}のリンクをコピー` : `${titleText}は公開後に共有できます`);
    if (!published) actions.classList.add('account-card-actions--single');
    share.addEventListener('click', async () => {
      share.disabled = true;
      try {
        if (!window.PiXiEEDAccountShare) throw new Error('share-unavailable');
        await window.PiXiEEDAccountShare.copyLink(publicUrl);
        share.textContent = 'コピーしました';
        if (shareStatus) shareStatus.textContent = `「${titleText}」の商品リンクをコピーしました。`;
      } catch (_error) {
        share.textContent = 'コピーできません';
        if (shareStatus) shareStatus.textContent = 'リンクをコピーできませんでした。';
      }
      window.setTimeout(() => {
        share.disabled = false;
        share.textContent = 'リンクをコピー';
      }, 1800);
    });
    actions.appendChild(share);
    body.append(title, meta, actions);
    card.append(preview, body);
    return card;
  }

  async function render(client) {
    const token = ++renderToken;
    count.textContent = '確認中';
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (token !== renderToken) return;
    if (!user) {
      count.textContent = '未ログイン';
      renderMessage('ログインすると出品物を確認できます', '上のアカウント欄からログインしてください。');
      return;
    }

    const { data, error } = await client.rpc('market_my_listings_v1');
    if (token !== renderToken) return;
    if (error) throw error;
    const entries = Array.isArray(data) ? data : [];
    count.textContent = `${entries.length}件`;
    if (!entries.length) {
      renderMessage('出品物はまだありません', '作品を商品として登録すると、ここへ並びます。');
      return;
    }
    list.replaceChildren(...entries.map(createCard));
  }

  async function init() {
    try {
      const access = window.PiXiEEDDevAccess ? await window.PiXiEEDDevAccess.check() : null;
      if (!access?.allowed || !access.client) return;
      await render(access.client);
      access.client.auth.onAuthStateChange(() => window.setTimeout(() => render(access.client), 0));
    } catch (_error) {
      count.textContent = '取得失敗';
      renderMessage('出品物を読み込めませんでした', '時間をおいてページを再読み込みしてください。');
    }
  }

  window.setTimeout(init, 0);
})();
