(function () {
  'use strict';
  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const access = document.getElementById('reviewAccessStatus');
  const queue = document.getElementById('reviewQueue');
  const sellerQueue = document.getElementById('sellerQueue');
  let client;

  const button = (label, action, tone = '') => {
    const node = document.createElement('button');
    node.type = 'button'; node.className = `market-review-action ${tone}`.trim(); node.textContent = label;
    node.addEventListener('click', action); return node;
  };
  const field = (label, value) => {
    const row = document.createElement('div'); row.className = 'market-review-field';
    const name = document.createElement('span'); name.textContent = label;
    const content = document.createElement('strong'); content.textContent = value || '—';
    row.append(name, content); return row;
  };
  async function callRpc(name, args, success) {
    const { error } = await client.rpc(name, args);
    if (error) { window.alert(error.message || '処理に失敗しました'); return false; }
    window.alert(success); await loadAll(); return true;
  }
  function renderAsset(asset) {
    const card = document.createElement('article'); card.className = 'market-review-card';
    const title = document.createElement('h3'); title.textContent = asset.title || '名称未設定';
    const details = document.createElement('div'); details.className = 'market-review-fields';
    const formats = asset.included_formats?.length ? asset.included_formats.join(' / ') : asset.asset_format;
    const productType = asset.included_formats?.includes('pixiedraw-project') ? 'PiXiEEDraw作品' : '一般素材';
    const limitedSale = Number.isInteger(asset.limited_quantity) ? `先着${asset.limited_quantity}名` : '制限なし';
    const optionLabels = asset.series?.inherited_terms?.license_options?.map((option) => `${option.label} ${option.price_yen ?? option.minimum_price_yen ?? 0}円`).join(' / ') || '基本利用のみ';
    const filePaths = asset.provenance_manifest?.storage_file_paths || [];
    const samplePreviewPaths = asset.provenance_manifest?.storage_sample_preview_paths || [];
    details.append(field('商品種類', productType), field('形式', formats), field('価格', `${asset.sale_price_yen}円`), field('限定販売', limitedSale), field('最低オプション', `${asset.series?.required_option_price_yen || 0}円`), field('利用オプション', optionLabels), field('ファイル数', `${asset.provenance_manifest?.file_count || filePaths.length || 1}件`), field('由来', asset.source_kind), field('検査', asset.file_scan_status), field('SHA-256', asset.source_sha256));
    const description = document.createElement('p'); description.textContent = asset.description || '説明なし';
    const actions = document.createElement('div'); actions.className = 'market-review-actions';
    if (asset.asset_object_path) actions.append(button('非公開ファイルを確認', async () => {
      const { data, error } = await client.storage.from('market-private').createSignedUrl(asset.asset_object_path, 60);
      if (error || !data?.signedUrl) return window.alert('確認用URLを作成できませんでした');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    }));
    filePaths.forEach((path, index) => actions.append(button(`素材 ${index + 1}を確認`, async () => {
      const { data, error } = await client.storage.from('market-private').createSignedUrl(path, 60);
      if (error || !data?.signedUrl) return window.alert('確認用URLを作成できませんでした');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    })));
    samplePreviewPaths.forEach((path, index) => actions.append(button(`試し見せ ${index + 1}を確認`, async () => {
      const { data, error } = await client.storage.from('market-private').createSignedUrl(path, 60);
      if (error || !data?.signedUrl) return window.alert('確認用URLを作成できませんでした');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    })));
    actions.append(button('検査済みにする', async () => {
      if (!window.confirm('ファイルの形式・内容・ハッシュを確認しましたか？')) return;
      await callRpc('market_mark_file_scan', { input_asset_id: asset.id, input_result: 'clean', input_note: 'review console manual inspection' }, '検査済みにしました');
    }));
    actions.append(button('承認・公開', async () => {
      if (!window.confirm('この商品を公開しますか？')) return;
      await callRpc('market_review_listing', { input_asset_id: asset.id, input_decision: 'approved', input_reason: '' }, '商品を公開しました');
    }, 'is-primary'));
    actions.append(button('却下', async () => {
      const reason = window.prompt('却下理由を入力してください'); if (!reason?.trim()) return;
      await callRpc('market_review_listing', { input_asset_id: asset.id, input_decision: 'rejected', input_reason: reason.trim() }, '出品を却下しました');
    }, 'is-danger'));
    card.append(title, details, description, actions); return card;
  }
  function renderSeller(seller) {
    const card = document.createElement('article'); card.className = 'market-review-card';
    const title = document.createElement('h3'); title.textContent = seller.user_id;
    const details = document.createElement('div'); details.className = 'market-review-fields';
    details.append(field('状態', seller.seller_status), field('本名', seller.legal_name), field('郵便番号', seller.postal_code), field('住所', seller.address), field('連絡先電話番号', seller.phone), field('二段階認証', seller.mfa_confirmed_at ? '確認済み' : '未確認'), field('規約', seller.terms_version), field('申請日時', seller.terms_accepted_at));
    const actions = document.createElement('div'); actions.className = 'market-review-actions';
    actions.append(button('運営確認済みとして承認', async () => {
      if (!window.confirm('登録情報を確認し、販売者として承認しますか？')) return;
      await callRpc('market_update_seller_verification', { input_user_id: seller.user_id, input_decision: 'verified', input_reason: 'seller registration reviewed by PiXiEED operator' }, '販売者を承認しました');
    }, 'is-primary'));
    actions.append(button('確認失敗', async () => {
      const reason = window.prompt('理由を入力してください'); if (!reason?.trim()) return;
      await callRpc('market_update_seller_verification', { input_user_id: seller.user_id, input_decision: 'failed', input_reason: reason.trim() }, '確認失敗として記録しました');
    }, 'is-danger'));
    card.append(title, details, actions); return card;
  }
  async function loadAll() {
    const { data: assets, error } = await client.from('market_assets').select('id,title,description,sale_price_yen,asset_format,included_formats,limited_quantity,source_kind,source_sha256,provenance_manifest,file_scan_status,status,asset_object_path,created_at,series:market_asset_series!market_assets_series_id_fkey(required_option_price_yen,inherited_terms)').in('status', ['draft', 'review']).order('created_at');
    if (error) throw error;
    queue.replaceChildren(...(assets || []).map(renderAsset)); document.getElementById('reviewQueueCount').textContent = `${assets?.length || 0}件`;
    const { data: isAdmin } = await client.rpc('market_current_user_is_admin');
    document.getElementById('sellerReviewSection').hidden = !isAdmin;
    if (isAdmin) {
      const { data: sellers, error: sellerError } = await client.from('market_seller_profiles').select('user_id,seller_status,identity_status,legal_name,postal_code,address,phone,mfa_confirmed_at,terms_version,terms_accepted_at,created_at').neq('seller_status', 'verified').order('created_at');
      if (sellerError) throw sellerError;
      sellerQueue.replaceChildren(...(sellers || []).map(renderSeller)); document.getElementById('sellerQueueCount').textContent = `${sellers?.length || 0}件`;
    }
  }
  async function init() {
    try {
      const devAccess = window.PiXiEEDMarketDevAccess ? await window.PiXiEEDMarketDevAccess.ready : null;
      if (!devAccess?.allowed || !devAccess.client) return;
      client = devAccess.client;
      const { data: reviewer } = await client.rpc('market_current_user_is_reviewer');
      if (!reviewer) { access.textContent = 'この画面を利用する権限がありません。'; return; }
      access.hidden = true; document.getElementById('listingReviewSection').hidden = false; await loadAll();
    } catch (error) { access.textContent = `審査画面を読み込めませんでした: ${error.message || '接続エラー'}`; }
  }
  init();
})();
