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
    return /^https:\/\//i.test(preview) ? preview : asset('../assets/icons/Market.png');
  }

  function renderMessage(titleText, detailText) {
    const item = document.createElement('div');
    item.className = 'account-item';
    const cover = document.createElement('div');
    cover.className = 'account-cover';
    const image = new Image();
    image.src = asset('../assets/icons/Market.png');
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

  function withdrawalErrorMessage(error) {
    const message = String(error?.message || '');
    if (/active checkout/i.test(message)) {
      return '購入手続き中の方がいるため、決済が完了または期限切れになってから再度お試しください。';
    }
    return '取り下げできませんでした。時間をおいて再度お試しください。';
  }

  function createCard(entry, client) {
    const id = String(entry?.id || '').trim();
    const titleText = String(entry?.title || '出品物');
    const published = entry?.status === 'published';
    const withdrawn = published && Boolean(entry?.withdrawn_at);
    const publicUrl = asset(`../market/items/${encodeURIComponent(id)}/`);
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
    status.className = `account-listing-card__status${published && !withdrawn ? ' is-published' : ''}${withdrawn ? ' is-withdrawn' : ''}`;
    status.textContent = withdrawn ? 'SOLD OUT' : (STATUS_LABELS[entry?.status] || '確認中');
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
    actions.className = 'account-card-actions account-card-actions--listing';
    if (published) {
      const open = document.createElement('a');
      open.className = 'account-card-action account-card-action--primary account-card-action--market';
      open.href = publicUrl;
      open.title = '商品を見る';
      open.setAttribute('aria-label', `${titleText}の商品を見る`);
      actions.appendChild(open);
    }
    const share = document.createElement('button');
    share.className = 'account-card-action account-card-action--share';
    share.type = 'button';
    share.disabled = !published;
    share.title = published ? 'リンクをコピー' : '公開後に共有できます';
    share.setAttribute('aria-label', published ? `${titleText}のリンクをコピー` : `${titleText}は公開後に共有できます`);
    share.addEventListener('click', async () => {
      share.disabled = true;
      try {
        if (!window.PiXiEEDAccountShare) throw new Error('share-unavailable');
        await window.PiXiEEDAccountShare.copyLink(publicUrl);
        share.classList.add('is-success');
        share.setAttribute('aria-label', `${titleText}のリンクをコピーしました`);
        if (shareStatus) shareStatus.textContent = `「${titleText}」の商品リンクをコピーしました。`;
      } catch (_error) {
        share.classList.add('is-error');
        share.setAttribute('aria-label', `${titleText}のリンクをコピーできませんでした`);
        if (shareStatus) shareStatus.textContent = 'リンクをコピーできませんでした。';
      }
      window.setTimeout(() => {
        share.disabled = false;
        share.classList.remove('is-success', 'is-error');
        share.setAttribute('aria-label', `${titleText}のリンクをコピー`);
      }, 1800);
    });
    actions.appendChild(share);
    if (published && !withdrawn) {
      const withdraw = document.createElement('button');
      withdraw.className = 'account-card-action account-card-action--danger account-card-action--delete';
      withdraw.type = 'button';
      withdraw.title = '取り下げる';
      withdraw.setAttribute('aria-label', `${titleText}を取り下げる`);
      withdraw.addEventListener('click', async () => {
        const confirmed = window.confirm(
          `「${titleText}」を取り下げますか？\n\n商品はSOLD OUT表示になり、新規購入を停止します。購入済みの利用権、派生設定、報酬は維持されます。`
        );
        if (!confirmed) return;
        withdraw.disabled = true;
        withdraw.setAttribute('aria-label', `${titleText}を取り下げています`);
        if (shareStatus) shareStatus.textContent = `「${titleText}」を取り下げています。`;
        const { error } = await client.rpc('market_withdraw_my_listing_v1', { input_asset_id: id });
        if (error) {
          withdraw.disabled = false;
          withdraw.setAttribute('aria-label', `${titleText}を取り下げる`);
          if (shareStatus) shareStatus.textContent = withdrawalErrorMessage(error);
          return;
        }
        if (shareStatus) shareStatus.textContent = `「${titleText}」を取り下げ、SOLD OUTにしました。`;
        await render(client);
      });
      actions.appendChild(withdraw);
    }
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
    list.replaceChildren(...entries.map((entry) => createCard(entry, client)));
  }

  async function init() {
    try {
      const access = window.PiXiEEDMarketAccess ? await window.PiXiEEDMarketAccess.check() : null;
      if (!access?.client) return;
      await render(access.client);
      access.client.auth.onAuthStateChange(() => window.setTimeout(() => render(access.client), 0));
    } catch (_error) {
      count.textContent = '取得失敗';
      renderMessage('出品物を読み込めませんでした', '時間をおいてページを再読み込みしてください。');
    }
  }

  window.setTimeout(init, 0);
})();
