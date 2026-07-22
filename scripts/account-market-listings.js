(function () {
  'use strict';

  const list = document.getElementById('marketListingList');
  const count = document.getElementById('marketListingCount');
  const shareStatus = document.getElementById('marketListingShareStatus');
  const rebuildButton = document.getElementById('marketRebuildPreviews');
  const currentScript = document.currentScript;
  let renderToken = 0;
  let rebuildInProgress = false;

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

  function imageSourcePaths(entry) {
    const files = Array.isArray(entry?.files) ? entry.files : [];
    const storagePaths = Array.isArray(entry?.storage_file_paths) ? entry.storage_file_paths : [];
    const sourceByOriginalPath = new Map(files.map((file, index) => [String(file?.original_path || ''), String(storagePaths[index] || '')]));
    const selected = entry?.preview_selection || {};
    const requested = [selected.thumbnail_source_path, ...(Array.isArray(selected.sample_source_paths) ? selected.sample_source_paths : [])]
      .map((path) => String(path || ''))
      .filter(Boolean);
    const paths = requested.map((path) => sourceByOriginalPath.get(path)).filter((path) => /^.+\/.+/.test(path || ''));
    if (paths.length) return [...new Set(paths)];
    return storagePaths.filter((path) => /\.(png|webp|gif|apng|jpe?g)$/i.test(String(path || ''))).slice(0, 6);
  }

  async function loadImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } catch (error) {
      throw error;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function drawFixedWatermark(context, width, height) {
    const label = 'PiXiEED SAMPLE';
    const fontSize = 16;
    const stepX = 132;
    const stepY = 50;
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(-Math.PI / 10);
    context.font = `800 ${fontSize}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const diagonal = Math.ceil(Math.hypot(width, height));
    context.lineWidth = Math.max(1, fontSize / 14);
    context.strokeStyle = 'rgba(0,0,0,.22)';
    context.fillStyle = 'rgba(255,255,255,.26)';
    for (let y = -diagonal; y <= diagonal; y += stepY) {
      const offset = Math.round(y / stepY) % 2 ? stepX / 2 : 0;
      for (let x = -diagonal - stepX; x <= diagonal + stepX; x += stepX) {
        context.strokeText(label, x + offset, y);
        context.fillText(label, x + offset, y);
      }
    }
    context.restore();
  }

  async function fixedPreviewBlob(sourceBlob, { thumbnail = false } = {}) {
    const image = await loadImage(sourceBlob);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const maxSide = thumbnail ? 640 : 960;
    const scale = maxSide / Math.max(sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // 元ファイルから再生成し、サムネイルと試聴へ同じ固定サイズ透かしを一度だけ焼き込む。
    drawFixedWatermark(context, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('preview_conversion_failed')), 'image/webp', .9));
  }

  async function rebuildListingPreviews(client, user, entry, revision) {
    const sourcePaths = imageSourcePaths(entry);
    if (!sourcePaths.length) throw new Error('元画像が見つかりません');
    const uploadedPaths = [];
    try {
      const sourceBlobs = [];
      for (const path of sourcePaths) {
        const { data, error } = await client.storage.from('market-private').download(path);
        if (error || !data) throw error || new Error('元画像を読み込めません');
        sourceBlobs.push(data);
      }
      const basePath = `${user.id}/${entry.id}/previews/fixed-v2-${revision}`;
      const thumbnailBlob = await fixedPreviewBlob(sourceBlobs[0], { thumbnail: true });
      const thumbnailPath = `${basePath}/thumbnail.webp`;
      let result = await client.storage.from('market-private').upload(thumbnailPath, thumbnailBlob, { upsert: false, contentType: 'image/webp' });
      if (result.error) throw result.error;
      uploadedPaths.push(thumbnailPath);
      const samplePaths = [];
      for (let index = 0; index < sourceBlobs.length; index += 1) {
        const sampleBlob = await fixedPreviewBlob(sourceBlobs[index], { thumbnail: false });
        const samplePath = `${basePath}/sample-${String(index + 1).padStart(2, '0')}.webp`;
        result = await client.storage.from('market-private').upload(samplePath, sampleBlob, { upsert: false, contentType: 'image/webp' });
        if (result.error) throw result.error;
        uploadedPaths.push(samplePath); samplePaths.push(samplePath);
      }
      const { error } = await client.rpc('market_replace_my_listing_previews_v1', {
        input_asset_id: entry.id,
        input_preview_object_path: thumbnailPath,
        input_sample_preview_paths: samplePaths
      });
      if (error) throw error;
    } catch (error) {
      if (uploadedPaths.length) await client.storage.from('market-private').remove(uploadedPaths);
      throw error;
    }
  }

  async function rebuildAllPreviews(client) {
    if (rebuildInProgress) return;
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;
    const { data, error } = await client.rpc('market_my_listing_preview_sources_v1');
    if (error) throw error;
    const entries = Array.isArray(data) ? data : [];
    if (!entries.length) {
      if (shareStatus) shareStatus.textContent = '再生成できる公開中の出品はありません。';
      return;
    }
    if (!window.confirm(`公開中の${entries.length}件を再生成します。\n元ファイルから、サムネイルと試聴へ同じ固定サイズ透かしを入れ直します。今のプレビューは残ります。続けますか？`)) return;
    rebuildInProgress = true;
    rebuildButton.disabled = true;
    let complete = 0;
    const skipped = [];
    const revision = Date.now();
    try {
      for (const entry of entries) {
        if (shareStatus) shareStatus.textContent = `透かしを再生成しています（${complete + 1}/${entries.length}）: ${entry.title || '出品物'}`;
        try {
          await rebuildListingPreviews(client, user, entry, `${revision}-${complete + 1}`);
          complete += 1;
        } catch (_error) {
          skipped.push(entry.title || '名称未設定');
        }
      }
      if (shareStatus) shareStatus.textContent = skipped.length
        ? `${complete}件を更新しました。${skipped.join('、')}は対応画像を確認してください。`
        : `${complete}件すべてを更新しました。サムネイルと試聴へ同じ固定サイズ透かしを入れました。`;
      await render(client);
    } finally {
      rebuildInProgress = false;
      rebuildButton.disabled = false;
    }
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
    if (rebuildButton) rebuildButton.hidden = !entries.some((entry) => entry?.status === 'published');
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
      if (rebuildButton && rebuildButton.dataset.bound !== 'true') {
        rebuildButton.dataset.bound = 'true';
        rebuildButton.addEventListener('click', () => {
          rebuildAllPreviews(access.client).catch((error) => {
            if (shareStatus) shareStatus.textContent = `透かしを更新できませんでした: ${error?.message || '通信を確認してください'}`;
          });
        });
      }
      access.client.auth.onAuthStateChange(() => window.setTimeout(() => render(access.client), 0));
    } catch (_error) {
      count.textContent = '取得失敗';
      renderMessage('出品物を読み込めませんでした', '時間をおいてページを再読み込みしてください。');
    }
  }

  window.setTimeout(init, 0);
})();
