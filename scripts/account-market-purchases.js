(function () {
  'use strict';

  const list = document.getElementById('marketPurchaseList');
  const count = document.getElementById('marketPurchaseCount');
  const delivery = window.PiXiEEDMarketDelivery;
  if (!list || !count || !delivery) return;

  const scriptUrl = document.currentScript?.src || window.location.href;
  const assetUrl = (path) => new URL(path, scriptUrl).href;
  const FORMAT_LABELS = {
    'pixiedraw-project': 'PiXiEEDraw',
    png: 'PNG',
    webp: 'WebP',
    gif: 'GIF',
    apng: 'APNG',
    'sprite-sheet-png': 'PNGスプライトシート',
    'gif-frames-png': 'GIF → 各フレームPNG',
    'gif-spritemap-png': 'GIF → SpriteMAP＋カラーマップ'
  };
  const GIF_DERIVED_FORMATS = new Set(['gif-frames-png', 'gif-spritemap-png']);
  let renderToken = 0;

  const formatLabel = (value) => FORMAT_LABELS[String(value || '')] || String(value || 'ファイル');
  const formatDate = (value) => {
    const date = new Date(value || '');
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(date)
      : '購入日不明';
  };
  const safeArchiveName = (value) => String(value || 'purchased-assets')
    .normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'purchased-assets';

  function renderMessage(titleText, detailText, actionLabel, actionHref) {
    const item = document.createElement('article');
    item.className = 'account-item';
    const cover = document.createElement('div'); cover.className = 'account-cover';
    const image = new Image(); image.src = assetUrl('../assets/icons/Market.png'); image.alt = ''; cover.appendChild(image);
    const body = document.createElement('div'); body.className = 'account-item__body';
    const title = document.createElement('strong'); title.textContent = titleText;
    const detail = document.createElement('span'); detail.textContent = detailText;
    body.append(title, detail); item.append(cover, body);
    if (actionLabel && actionHref) {
      const action = document.createElement('a'); action.className = 'account-action';
      action.href = assetUrl(actionHref); action.textContent = actionLabel; item.appendChild(action);
    }
    list.replaceChildren(item);
  }

  async function functionErrorMessage(error, fallback) {
    try {
      const payload = await error?.context?.clone?.().json?.();
      if (payload?.error) return String(payload.error);
    } catch (_error) {}
    return String(error?.message || fallback);
  }

  async function invoke(client, body) {
    const { data, error } = await client.functions.invoke('market-download', { body });
    if (error) throw new Error(await functionErrorMessage(error, '購入済み素材を準備できませんでした。'));
    if (data?.error) throw new Error(String(data.error));
    return data || {};
  }

  async function sha256(blob) {
    if (!crypto.subtle || !blob) return '';
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function fetchDeliveredFiles(files, onProgress) {
    const results = new Array(files.length);
    let nextIndex = 0;
    let completed = 0;
    const declaredBytes = files.reduce((sum, file) => sum + Math.max(0, Number(file?.size) || 0), 0);
    const workerCount = declaredBytes >= 64 * 1024 * 1024
      ? 1
      : declaredBytes >= 16 * 1024 * 1024
        ? Math.min(2, files.length)
        : Math.min(4, files.length);
    async function worker() {
      while (nextIndex < files.length) {
        const index = nextIndex; nextIndex += 1;
        const file = files[index];
        const response = await fetch(file.url, { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error(`${file.name || 'ファイル'}を取得できませんでした。もう一度お試しください。`);
        const blob = await response.blob();
        if (file.sha256) {
          const actualHash = await sha256(blob);
          if (actualHash && actualHash !== file.sha256) throw new Error(`${file.name || 'ファイル'}の整合性を確認できませんでした。`);
        }
        results[index] = { ...file, blob };
        completed += 1; onProgress?.(completed, files.length);
      }
    }
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  function licenseText(payload) {
    const optionIds = Array.isArray(payload.license?.selected_option_ids) ? payload.license.selected_option_ids : [];
    const isAdminGrant = payload.purchase?.status === 'granted';
    return [
      isAdminGrant ? 'PiXiEED マーケット管理者取得素材' : 'PiXiEED マーケット購入素材',
      '',
      `商品: ${payload.asset?.title || ''}`,
      `${isAdminGrant ? '管理者取得ID' : '購入ID'}: ${payload.purchase?.id || ''}`,
      `出力追跡番号: ${payload.trace_id || ''}`,
      `${isAdminGrant ? '取得日' : '購入日'}: ${formatDate(payload.purchase?.paid_at)}`,
      `選択形式: ${(payload.output_modes || payload.formats || []).map(formatLabel).join(' / ')}`,
      `購入オプション: ${optionIds.length ? optionIds.join(', ') : 'なし'}`,
      `派生出品: ${payload.license?.derivative_sales_allowed ? '商品条件に従い可能' : '不可'}`,
      '',
      '禁止: 素材データそのものの無断再配布、共有URLの第三者提供、生成AI・機械学習の学習データやデータセットへの利用。',
      '許諾範囲は商品条件とPiXiEED利用規約が優先されます。',
      'https://pixieed.jp/terms/'
    ].join('\n');
  }

  function createFormatSwitch(format, selected, description = '') {
    const label = document.createElement('label'); label.className = 'account-market-format';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = format; input.checked = selected;
    const copy = document.createElement('span'); copy.className = 'account-market-format__copy';
    const text = document.createElement('strong'); text.textContent = formatLabel(format); copy.appendChild(text);
    if (description) { const detail = document.createElement('small'); detail.textContent = description; copy.appendChild(detail); }
    label.append(input, copy); return label;
  }

  function createButton(label, className = '') {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `account-market-button ${className}`.trim(); button.textContent = label; return button;
  }

  function createCard(client, purchase) {
    const product = purchase.asset || {};
    const formats = Array.from(new Set(Array.isArray(product.included_formats) ? product.included_formats : [product.asset_format])).filter(Boolean);
    const card = document.createElement('article'); card.className = 'market-card account-market-card';
    const previewLink = document.createElement('a'); previewLink.className = 'market-card__preview';
    previewLink.href = assetUrl(`../market/items/${encodeURIComponent(product.id || '')}/`);
    const image = new Image(); image.src = product.preview_url || assetUrl('../assets/icons/Market.png'); image.alt = ''; image.draggable = false; image.dataset.marketProtectedMedia = 'true'; previewLink.appendChild(image);
    const body = document.createElement('div'); body.className = 'market-card__body';
    const title = document.createElement('h3'); title.textContent = product.title || '購入済み素材';
    const author = document.createElement('p'); author.className = 'market-card__author'; author.textContent = `作者 ${product.creator_display_name || 'PiXiEEDクリエイター'}`;
    const badges = document.createElement('div'); badges.className = 'market-card__badges';
    const productType = document.createElement('span');
    productType.className = formats.includes('pixiedraw-project') ? 'is-pixiedraw-product' : 'is-general-product';
    productType.textContent = formats.includes('pixiedraw-project') ? 'PiXiEEDraw作品' : '一般素材';
    badges.appendChild(productType);
    const paid = document.createElement('span');
    paid.textContent = purchase.status === 'granted' ? '管理者取得' : '購入済み';
    badges.appendChild(paid);
    const right = purchase.derivative_listing_right;
    if (right?.status === 'active') { const badge = document.createElement('span'); badge.textContent = '派生出品可能'; badges.appendChild(badge); }
    if (right?.status === 'used') { const badge = document.createElement('span'); badge.textContent = '派生出品済み'; badges.appendChild(badge); }
    const meta = document.createElement('div'); meta.className = 'market-card__meta';
    const format = document.createElement('span'); format.className = 'market-card__format'; format.textContent = formats.map(formatLabel).join(' / ');
    const date = document.createElement('strong'); date.className = 'market-card__price'; date.textContent = formatDate(purchase.paid_at || purchase.created_at);
    meta.append(format, date);

    const fieldset = document.createElement('fieldset'); fieldset.className = 'account-market-formats';
    const legend = document.createElement('legend'); legend.textContent = 'ZIPに入れる形式';
    const switches = formats.map((entry) => createFormatSwitch(entry, true));
    if (formats.includes('gif')) {
      switches.push(
        createFormatSwitch('gif-frames-png', false, '拡大ドット絵は1px単位へ自動補正し、全フレームを連番PNGで収録'),
        createFormatSwitch('gif-spritemap-png', false, '1px単位へ自動補正した全フレームを配置し、PNG・JSONのカラーマップを同梱')
      );
    }
    fieldset.append(legend, ...switches);
    const actions = document.createElement('div'); actions.className = 'account-market-actions';
    const drawButton = createButton('PiXiEEDrawで開く', 'account-market-button--primary'); actions.appendChild(drawButton);
    if (right?.status === 'active' && right?.id && right?.source_asset_id) {
      const derivative = document.createElement('a');
      derivative.className = 'account-market-button account-market-button--derivative';
      derivative.href = assetUrl(`../market/sell.html?source_asset_id=${encodeURIComponent(right.source_asset_id)}&derivative_license_id=${encodeURIComponent(right.id)}`);
      derivative.textContent = '派生作品を出品';
      actions.appendChild(derivative);
    }
    const exportDetails = document.createElement('details'); exportDetails.className = 'account-market-export';
    const exportSummary = document.createElement('summary'); exportSummary.textContent = 'ZIP出力の形式を選ぶ';
    const zipButton = createButton('選択形式をZIPで出力');
    exportDetails.append(exportSummary, fieldset, zipButton);
    const status = document.createElement('p'); status.className = 'account-market-status'; status.setAttribute('aria-live', 'polite');

    const setBusy = (busy) => {
      zipButton.disabled = busy;
      drawButton.disabled = busy;
      switches.forEach((label) => { label.querySelector('input').disabled = busy; });
    };
    switches.forEach((label) => label.querySelector('input').addEventListener('change', () => {
      zipButton.disabled = !switches.some((item) => item.querySelector('input').checked);
    }));

    zipButton.addEventListener('click', async () => {
      const selected = switches.filter((item) => item.querySelector('input').checked).map((item) => item.querySelector('input').value);
      if (!selected.length) { status.textContent = '出力する形式を1つ以上選択してください。'; return; }
      setBusy(true); status.textContent = '安全な出力を準備しています…';
      try {
        const sourceFormats = Array.from(new Set(selected.map((format) => GIF_DERIVED_FORMATS.has(format) ? 'gif' : format)));
        const payload = await invoke(client, { action: 'authorize', kind: 'zip', asset_id: product.id, formats: sourceFormats });
        const downloaded = await fetchDeliveredFiles(payload.files || [], (done, total) => { status.textContent = `ファイルを確認しています（${done}/${total}）…`; });
        const tasks = downloaded
          .filter((file) => selected.includes(file.format))
          .map((file) => ({ filename: file.original_path || file.name, blob: file.blob }));
        const gifFiles = downloaded.filter((file) => file.format === 'gif');
        if (selected.includes('gif-frames-png')) {
          for (let index = 0; index < gifFiles.length; index += 1) {
            const file = gifFiles[index];
            const generated = await delivery.buildGifFramePngTasks(file.blob, file.original_path || file.name, (done, total) => {
              status.textContent = `GIFを各フレームPNGへ変換しています（${index + 1}/${gifFiles.length}・${done}/${total}）…`;
            });
            tasks.push(...generated);
          }
        }
        if (selected.includes('gif-spritemap-png')) {
          for (let index = 0; index < gifFiles.length; index += 1) {
            const file = gifFiles[index];
            const generated = await delivery.buildGifSpriteMapTasks(file.blob, file.original_path || file.name, (done, total) => {
              status.textContent = `GIFのSpriteMAPを作成しています（${index + 1}/${gifFiles.length}・${done}/${total}）…`;
            });
            tasks.push(...generated);
          }
        }
        const deliveryPayload = { ...payload, output_modes: selected };
        const manifest = {
          schema: 'pixieed-market-delivery/v1',
          asset: payload.asset,
          purchase: payload.purchase,
          trace_id: payload.trace_id,
          formats: payload.formats,
          output_modes: selected,
          license: payload.license,
          files: downloaded.map(({ url, blob, ...file }) => file),
          generated_files: tasks.filter((task) => !downloaded.some((file) => (file.original_path || file.name) === task.filename)).map((task) => ({
            name: task.filename,
            size: task.blob.size,
            mime_type: task.blob.type || 'application/octet-stream'
          }))
        };
        tasks.push(
          { filename: 'PiXiEED-LICENSE.txt', blob: new Blob([licenseText(deliveryPayload)], { type: 'text/plain;charset=utf-8' }) },
          { filename: 'PiXiEED-MANIFEST.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) }
        );
        status.textContent = 'ZIPを作成しています…';
        const zip = await delivery.buildZipBlob(tasks, ({ fileIndex, fileCount, processedBytes, totalBytes }) => {
          const percent = totalBytes > 0 ? Math.min(100, Math.round((processedBytes / totalBytes) * 100)) : 100;
          status.textContent = `ZIPを作成しています（${fileIndex}/${fileCount}・${percent}%）…`;
        });
        delivery.saveBlob(zip, `${safeArchiveName(product.title)}.zip`);
        status.textContent = 'ZIPを出力しました。購入済み商品はいつでも再出力できます。';
      } catch (error) {
        status.textContent = error.message || 'ZIPを出力できませんでした。';
      } finally { setBusy(false); }
    });

    drawButton.addEventListener('click', async () => {
      setBusy(true); status.textContent = 'PiXiEEDrawで開く素材を確認しています…';
      try {
        const payload = await invoke(client, { action: 'authorize', kind: 'pixieedraw-open', asset_id: product.id });
        const [file] = await fetchDeliveredFiles(payload.files || []);
        if (!file) throw new Error('PiXiEEDrawで開ける素材ファイルがありません。');
        const token = await delivery.stagePiXiEEDrawFile(file.blob, {
          filename: file.name || file.original_path,
          assetId: product.id,
          traceId: payload.trace_id
        });
        status.textContent = 'PiXiEEDrawを開きます…';
        window.location.assign(assetUrl(`../pixiedraw/?market_import=${encodeURIComponent(token)}`));
      } catch (error) {
        status.textContent = error.message || 'PiXiEEDrawで開けませんでした。'; setBusy(false);
      }
    });

    body.append(title, author);
    body.append(badges, meta, actions, exportDetails, status);
    card.append(previewLink, body); return card;
  }

  async function render(client) {
    const token = ++renderToken; count.textContent = '確認中';
    const { data: sessionData } = await client.auth.getSession();
    if (token !== renderToken) return;
    if (!sessionData?.session?.user) {
      count.textContent = '未ログイン';
      renderMessage('ログインすると購入済み商品を確認できます', '上のアカウント欄からログインしてください。', 'マーケットを見る', '../market/'); return;
    }
    try {
      const data = await invoke(client, { action: 'library' });
      if (token !== renderToken) return;
      const purchases = Array.isArray(data.items) ? data.items : [];
      count.textContent = `${purchases.length}件`;
      if (!purchases.length) {
        renderMessage('購入済み商品はありません', 'マーケットで購入した素材がここへ並びます。', '素材を探す', '../market/'); return;
      }
      list.replaceChildren(...purchases.map((purchase) => createCard(client, purchase)));
    } catch (error) {
      count.textContent = '取得失敗';
      renderMessage('購入済み商品を読み込めませんでした', error.message || '時間をおいて再試行してください。', 'マーケットを見る', '../market/');
    }
  }

  async function init() {
    try {
      if (window.location.origin === 'null') {
        count.textContent = 'ローカル直開き';
        renderMessage(
          '購入履歴はローカルファイルから開けません',
          'account/index.html を直接開かず、PiXiEED のWebサイトまたは http://localhost:8000/ から開いてください。',
          'PiXiEEDを開く',
          'https://pixieed.jp/account/'
        );
        return;
      }
      const marketAccess = window.PiXiEEDMarketAccess ? await window.PiXiEEDMarketAccess.check() : null;
      if (!marketAccess?.client) return;
      let client = null;
      for (let attempt = 0; attempt < 50 && !client; attempt += 1) {
        client = window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ || null;
        if (!client && window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) client = await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
        if (!client) await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      if (!client) throw new Error('Supabase client unavailable');
      await render(client);
      client.auth.onAuthStateChange(() => window.setTimeout(() => render(client), 0));
    } catch (_error) {
      count.textContent = '準備中';
      renderMessage('購入履歴は準備中です', 'ログイン機能の接続後に自動で表示されます。', 'マーケットを見る', '../market/');
    }
  }

  window.setTimeout(init, 0);
})();
