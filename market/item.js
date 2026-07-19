(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const $ = (id) => document.getElementById(id);
  const labels = {
    'pixiedraw-project': 'PiXiEEDraw', png: 'PNG', webp: 'WebP', gif: 'GIF', apng: 'APNG',
    'sprite-sheet-png': 'PNGスプライトシート'
  };
  const yen = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;
  let currentAsset = null;
  let purchaseClient = null;
  let purchaseUser = null;
  const localTestCatalog = window.PiXiEEDMarketLocalTestProducts || null;
  const favorites = window.PiXiEEDMarketFavorites;

  function assetFormats(asset) {
    return Array.isArray(asset?.included_formats) && asset.included_formats.length ? asset.included_formats : [asset?.asset_format];
  }

  function isPixieeDrawProduct(asset) {
    return assetFormats(asset).includes('pixiedraw-project');
  }

  function isSoldOut(asset) {
    const quantity = Number(asset?.limited_quantity);
    return Number.isInteger(quantity) && quantity > 0 && Number(asset?.limited_sold_count || 0) >= quantity;
  }

  function badge(text) {
    const node = document.createElement('span'); node.textContent = text; return node;
  }

  function render(asset) {
    currentAsset = asset;
    const series = asset.series || {};
    const formats = assetFormats(asset);
    const options = series.inherited_terms?.license_options || [];
    document.title = `${asset.title} | PiXiEEDマーケット`;
    $('itemTitle').textContent = asset.title || '名称未設定の素材';
    $('itemDescription').textContent = asset.description || '説明はありません。';
    $('itemPrice').textContent = yen(asset.sale_price_yen);
    $('itemFormats').textContent = formats.map((format) => labels[format] || format).join(' / ');
    $('itemOptionPrice').textContent = yen(series.required_option_price_yen);
    $('itemBasePrice').textContent = yen(Math.max(0, Number(asset.sale_price_yen || 0) - Number(series.required_option_price_yen || 0)));
    $('itemProductType').textContent = isPixieeDrawProduct(asset)
      ? 'PiXiEEDraw作品（編集用プロジェクト入り）'
      : '一般素材（画像・アニメーション）';
    const limitedQuantity = Number(asset.limited_quantity);
    const limitedSold = Math.max(0, Number(asset.limited_sold_count || 0));
    $('itemAvailability').textContent = Number.isInteger(limitedQuantity) && limitedQuantity > 0
      ? (isSoldOut(asset) ? `先着${limitedQuantity.toLocaleString('ja-JP')}名・売り切れ` : `先着${limitedQuantity.toLocaleString('ja-JP')}名・残り${Math.max(0, limitedQuantity - limitedSold).toLocaleString('ja-JP')}`)
      : '販売数の制限なし';
    $('itemPreviewFrame').classList.toggle('is-sold-out', isSoldOut(asset));
    $('itemSoldOut').hidden = !isSoldOut(asset);
    $('itemDerivative').textContent = series.derivative_sales_allowed
      ? 'OK（改変した素材を独立商品として再販売可能・系列ロイヤリティーあり）'
      : 'NG（利用・改変できる範囲でも、素材または改変素材として再販売できません）';
    const previewUrl = asset.preview_url || asset.preview_object_path;
    if (asset.local_test === true && previewUrl) {
      $('itemPreview').src = previewUrl;
    } else if (/^https?:\/\//i.test(previewUrl || '')) {
      $('itemPreview').src = previewUrl;
    }
    $('itemPreview').alt = `${asset.title || '商品'}のプレビュー`;
    $('itemAuthor').textContent = `作者: ${asset.creator_display_name || 'PiXiEEDクリエイター'}`;
    favorites?.bind?.($('itemFavorite'), asset);
    const productBadge = badge(isPixieeDrawProduct(asset) ? 'PiXiEEDraw作品' : '一般素材');
    productBadge.className = isPixieeDrawProduct(asset) ? 'is-pixiedraw-product' : 'is-general-product';
    const badges = [productBadge];
    if (asset.local_test === true) {
      badges.push(badge('DEVテスト'));
    } else if (asset.verification_status === 'verified') {
      badges.push(badge(asset.source_kind === 'pixieed-native' ? 'PiXiEED形式' : '外部形式'), badge('出品審査済み'));
    }
    if (asset.seller_identity_verified) badges.push(badge('販売者確認済み'));
    if (asset.ai_usage_status === 'used' || asset.ai_usage_status === 'not-used') {
      badges.push(badge(asset.ai_usage_status === 'used' ? 'AI使用あり' : 'AI使用なし'));
    }
    $('itemBadges').replaceChildren(...badges);
    window.PiXiEEDMarketPageviewRewards?.track?.(asset);
    $('itemOptions').replaceChildren(...(options.length ? options.map((option) => {
      const card = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = option.label;
      const price = document.createElement('span'); price.textContent = `料金 ${yen(option.price_yen ?? option.minimum_price_yen)}`;
      card.append(title, price); return card;
    }) : [Object.assign(document.createElement('p'), { textContent: '追加オプションなし' })]));
    $('itemStatus').hidden = true; $('itemContent').hidden = false;
    window.PiXiEEDMarketAds?.showDetailAd?.();
  }

  function setPurchaseState({ disabled, label, status }) {
    $('itemPurchase').disabled = disabled;
    $('itemPurchase').textContent = label;
    $('itemPurchaseStatus').textContent = status;
  }

  async function findExistingPurchase() {
    if (!purchaseClient || !currentAsset) return null;
    const { data } = await purchaseClient
      .from('market_purchases')
      .select('id,status,payment_provider')
      .eq('asset_id', currentAsset.id)
      .in('status', ['paid', 'granted', 'disputed'])
      .limit(1)
      .maybeSingle();
    return data || null;
  }

  async function grantAdminAccess() {
    if (!purchaseClient || !currentAsset) return;
    setPurchaseState({ disabled: true, label: '管理者取得を処理中', status: '無料取得権をサーバーで確認しています。' });
    try {
      const { data, error } = await purchaseClient.rpc('market_grant_admin_asset_access_v1', {
        input_asset_id: currentAsset.id
      });
      if (error || !data?.purchase_id) throw new Error(error?.message || '管理者取得を完了できませんでした');
      const alreadyPaid = data.status === 'paid';
      setPurchaseState({
        disabled: true,
        label: alreadyPaid ? '購入済み' : '管理者取得済み',
        status: alreadyPaid
          ? 'この商品は購入済みです。マイページから確認できます。'
          : '無料取得しました。販売数・限定販売枠・売上には加算されません。マイページから出力できます。'
      });
    } catch (error) {
      setPurchaseState({
        disabled: false,
        label: '管理者として無料取得',
        status: `管理者取得を完了できませんでした: ${error.message || '時間をおいて再試行してください'}`
      });
    }
  }

  async function waitForPaidPurchase() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const purchase = await findExistingPurchase();
      if (purchase?.status === 'paid') {
        setPurchaseState({ disabled: true, label: '購入済み', status: '購入済み商品へ追加しました。マイページから確認できます。' });
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    setPurchaseState({ disabled: true, label: '支払い確認中', status: 'Stripeからの確認を待っています。しばらくしてからマイページを確認してください。' });
  }

  async function createPurchaseIntent() {
    if (!purchaseClient || !purchaseUser || !currentAsset) return;
    setPurchaseState({ disabled: true, label: 'Stripeを開いています', status: '商品と販売料金をサーバーで確認しています。' });
    try {
      const { data, error } = await purchaseClient.functions.invoke('market-create-checkout', {
        body: { asset_id: currentAsset.id }
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || 'Stripe購入画面を開始できませんでした');
      }
      if (!/^https:\/\/checkout\.stripe\.com\//i.test(data?.url || '')) throw new Error('Stripe購入画面を確認できませんでした');
      window.location.assign(data.url);
    } catch (error) {
      if (/sold out|売り切れ/i.test(error?.message || '')) {
        currentAsset.limited_sold_count = currentAsset.limited_quantity;
        $('itemPreviewFrame').classList.add('is-sold-out');
        $('itemSoldOut').hidden = false;
        setPurchaseState({ disabled: true, label: 'SOLD OUT', status: '限定数に達したため売り切れました。' });
        return;
      }
      setPurchaseState({
        disabled: false,
        label: 'Stripeで購入',
        status: `購入手続きを開始できませんでした: ${error.message || '時間をおいて再試行してください'}`
      });
    }
  }

  async function initPurchase() {
    if (!currentAsset) return;
    if (currentAsset.local_test === true) {
      setPurchaseState({
        disabled: true,
        label: 'DEVテスト商品',
        status: '表示確認用の商品です。Supabaseへの登録やStripe決済は行われません。'
      });
      return;
    }
    const devAccess = window.PiXiEEDDevAccess ? await window.PiXiEEDDevAccess.check() : { allowed: false };
    if (!devAccess.allowed) {
      setPurchaseState({ disabled: true, label: '購入準備中', status: '現在はマーケットの閲覧のみ利用できます。' });
      return;
    }
    if (window.location.protocol === 'file:') {
      setPurchaseState({ disabled: true, label: 'HTTPで購入確認できます', status: 'ローカルファイル表示ではログイン状態を確認できません。' });
      return;
    }
    try {
      if (!purchaseClient) throw new Error('DEV access client unavailable');
      if (!purchaseUser) {
        const { data: { user } } = await purchaseClient.auth.getUser();
        purchaseUser = user || null;
      }
      if (!purchaseUser) {
        setPurchaseState({ disabled: false, label: 'ログインして購入', status: '購入手続きにはログインが必要です。' });
        $('itemPurchase').addEventListener('click', () => { window.location.href = '../account/index.html'; }, { once: true });
        return;
      }
      const existingPurchase = await findExistingPurchase();
      if (existingPurchase?.status === 'paid') {
        setPurchaseState({ disabled: true, label: '購入済み', status: 'この商品は購入済みです。マイページから確認できます。' });
        return;
      }
      if (existingPurchase?.status === 'granted') {
        setPurchaseState({ disabled: true, label: '管理者取得済み', status: '管理者として無料取得済みです。マイページから確認できます。' });
        return;
      }
      if (existingPurchase?.status === 'disputed') {
        setPurchaseState({ disabled: true, label: '確認中', status: 'この購入は支払い確認中のため、再購入できません。' });
        return;
      }
      const { data: isAdmin, error: adminError } = await purchaseClient.rpc('market_current_user_is_admin');
      if (!adminError && isAdmin === true) {
        setPurchaseState({
          disabled: false,
          label: '管理者として無料取得',
          status: 'Stripe決済を行わず取得できます。販売数・限定販売枠・売上には加算されません。'
        });
        $('itemPurchase').addEventListener('click', grantAdminAccess);
        return;
      }
      if (Number(currentAsset.sale_price_yen || 0) < 500) {
        setPurchaseState({ disabled: true, label: '販売停止中', status: '現在の最低販売価格500円を下回るため購入できません。' });
        return;
      }
      if (isSoldOut(currentAsset)) {
        setPurchaseState({ disabled: true, label: 'SOLD OUT', status: '限定数に達したため売り切れました。商品情報は引き続き閲覧できます。' });
        return;
      }
      if (currentAsset.creator_user_id === purchaseUser.id) {
        setPurchaseState({ disabled: true, label: '自分の商品です', status: '出品者本人は自分の商品を購入できません。' });
        return;
      }
      const purchaseResult = new URLSearchParams(location.search).get('purchase');
      if (purchaseResult === 'success') {
        setPurchaseState({ disabled: true, label: '支払いを確認しています', status: 'Stripeから購入結果を確認しています。購入済みへの反映には少し時間がかかる場合があります。' });
        await waitForPaidPurchase();
        return;
      }
      setPurchaseState({
        disabled: false,
        label: 'Stripeで購入',
        status: purchaseResult === 'cancelled'
          ? '支払いは行われませんでした。購入する場合はもう一度開始してください。'
          : `${yen(currentAsset.sale_price_yen)}をStripeの安全な購入画面で支払います。`
      });
      $('itemPurchase').addEventListener('click', createPurchaseIntent);
    } catch (_error) {
      setPurchaseState({ disabled: true, label: '購入状態を確認できません', status: '通信状態を確認して再読み込みしてください。' });
    }
  }

  async function load() {
    const access = window.PiXiEEDDevAccess
      ? await window.PiXiEEDDevAccess.check()
      : { allowed: false, client: null, user: null };
    if (!access.client) {
      $('itemStatus').textContent = '商品を読み込めませんでした。通信状態を確認して再読み込みしてください。';
      return;
    }
    purchaseClient = access.client;
    purchaseUser = access.user || null;
    await localTestCatalog?.ready;
    const id = new URLSearchParams(location.search).get('id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) {
      $('itemStatus').textContent = '商品を特定できませんでした。マーケット一覧から開き直してください。'; return;
    }
    const localTestAsset = localTestCatalog?.getById?.(id) || null;
    if (localTestAsset) {
      await favorites?.prepare?.([localTestAsset]);
      render(localTestAsset);
      await initPurchase();
      return;
    }
    try {
      const { data: asset, error } = await purchaseClient.rpc('market_public_asset_v1', { input_asset_id: id });
      if (error) throw error;
      if (!asset) { $('itemStatus').textContent = 'この商品は公開されていないか、見つかりません。'; return; }
      const { data: previewData } = await purchaseClient.functions.invoke('market-public-preview', { body: { asset_ids: [asset.id] } });
      const previewUrl = previewData?.previews?.[asset.id];
      if (typeof previewUrl === 'string' && /^https?:\/\//i.test(previewUrl)) asset.preview_url = previewUrl;
      await favorites?.prepare?.([asset]);
      render(asset);
      await initPurchase();
    } catch (_error) {
      $('itemStatus').textContent = '商品を読み込めませんでした。時間をおいて再試行してください。';
    }
  }

  load();
})();
