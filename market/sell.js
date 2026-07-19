(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const MAX_FILE_COUNT = 100;
  const MAX_DETECTION_COUNT = 300;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
  const MAX_SAMPLE_PREVIEWS = 6;
  const MAX_TAGS = 5;
  const MAX_CUSTOM_OPTIONS = 10;
  const MIN_PAID_PRICE_YEN = 100;
  const PRICE_STEP_YEN = 100;
  const MAX_LISTING_PRICE_YEN = 99999900;
  const MAX_OPTION_PRICE_YEN = 10000000;
  const LISTING_DRAFT_DB = 'pixieed-market-listing-drafts';
  const LISTING_DRAFT_STORE = 'drafts';
  const MARKET_TERMS_VERSION = '2026-07-19';
  const MARKET_PRIVACY_VERSION = '2026-07-19';
  const packageUtils = window.PiXiEEDMarketPackage;
  const FORMAT_ORDER = ['pixiedraw-project', 'png', 'sprite-sheet-png', 'webp', 'gif', 'apng'];
  const FORMAT_LABELS = {
    'pixiedraw-project': 'PiXiEEDraw',
    png: 'PNG',
    'sprite-sheet-png': 'PNGスプライトシート',
    webp: 'WebP',
    gif: 'GIF',
    apng: 'APNG'
  };
  const FALLBACK_OPTIONS = [
    { id: 'commercial-use', label: '商用・収益化利用', description: 'ゲーム、アプリ、動画、配信、広告などに利用できます。', minimum_price_yen: 500, sort_order: 10 },
    { id: 'merchandise-use', label: 'グッズ・印刷販売', description: 'グッズや印刷物を制作して販売できます。', minimum_price_yen: 1000, sort_order: 20 },
    { id: 'credit-omission', label: 'クレジット表記不要', description: '利用時の作者名表記を省略できます。', minimum_price_yen: 300, sort_order: 30 }
  ];
  const pageParams = new URLSearchParams(window.location.search);
  const sourceAssetId = pageParams.get('source_asset_id') || '';
  const derivativeLicenseId = pageParams.get('derivative_license_id') || '';
  const derivativeModeRequested = pageParams.has('source_asset_id') || pageParams.has('derivative_license_id');
  const validUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const form = document.getElementById('listingForm');
  const gate = document.getElementById('sellerGate');
  const status = document.getElementById('listingStatus');
  const $ = (id) => document.getElementById(id);
  const sourceFiles = new Map();
  const sourceOptimizations = new Map();
  const selectedFormats = new Set();
  const dismissedFormats = new Set();
  const selectedOptionIds = new Set();
  const optionPrices = new Map();
  const listingTagValues = [];
  let customOptions = [];
  let limitedOptionPrice = MIN_PAID_PRICE_YEN;
  const samplePreviewPaths = new Set();
  const previewUrls = new Map();
  let detectedEntries = [];
  let ignoredFileCount = 0;
  let optionCatalog = FALLBACK_OPTIONS.map((option) => ({ ...option }));
  let detectionRun = 0;
  let thumbnailPath = '';
  let previewSelectionTouched = false;
  let viewerEntries = [];
  let viewerIndex = 0;
  let client = null;
  let signedInUser = null;
  let submissionEnabled = false;
  let derivativeContext = null;
  let listingDraftKey = '';
  let listingDraftLoaded = false;
  let listingDraftSaveTimer = 0;

  const setStatus = (value) => { status.textContent = value || ''; };
  const yen = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;
  const fileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };
  const sha256Buffer = async (buffer) => Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  ).map((value) => value.toString(16).padStart(2, '0')).join('');
  const sha256File = async (file) => sha256Buffer(await file.arrayBuffer());
  const filePath = (file) => file._marketRelativePath || file.webkitRelativePath || file.name;
  const listingTags = () => [...listingTagValues];
  const integerValue = (value) => {
    const normalized = String(value ?? '').replace(/[,，\s]/g, '');
    return /^[0-9]+$/.test(normalized) ? Number(normalized) : NaN;
  };
  const minimumPrice = (value = MIN_PAID_PRICE_YEN) => Math.ceil(Math.max(MIN_PAID_PRICE_YEN, Number(value) || 0) / PRICE_STEP_YEN) * PRICE_STEP_YEN;
  const normalizedPaidPrice = (value, minimum = MIN_PAID_PRICE_YEN, maximum = MAX_OPTION_PRICE_YEN) => {
    const floor = minimumPrice(minimum);
    const ceiling = Math.floor(maximum / PRICE_STEP_YEN) * PRICE_STEP_YEN;
    const parsed = integerValue(value);
    if (!Number.isInteger(parsed) || parsed < floor) return floor;
    return Math.min(ceiling, Math.ceil(parsed / PRICE_STEP_YEN) * PRICE_STEP_YEN);
  };
  const isPreviewable = (entry) => entry && Boolean(entry.format) && (
    entry.format !== 'pixiedraw-project' || entry.previewBlob instanceof Blob
  );

  function openListingDraftDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('このブラウザでは端末保存を利用できません')); return; }
      const request = window.indexedDB.open(LISTING_DRAFT_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(LISTING_DRAFT_STORE, { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('端末保存を開けませんでした'));
    });
  }

  async function readListingDraft() {
    if (!listingDraftKey) return null;
    const database = await openListingDraftDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(LISTING_DRAFT_STORE, 'readonly').objectStore(LISTING_DRAFT_STORE).get(listingDraftKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('端末保存を読み込めませんでした'));
      });
    } finally { database.close(); }
  }

  function listingDraftSnapshot() {
    const fields = ['listingTitle', 'listingDescription', 'listingPrice', 'listingLimitedQuantity', 'listingChangeSummary'];
    const values = Object.fromEntries(fields.map((id) => [id, $(id)?.value || '']));
    return {
      key: listingDraftKey,
      savedAt: Date.now(),
      values,
      checks: Object.fromEntries(['listingLimitedEnabled', 'listingDerivativeAllowed', 'listingTermsConfirmed', 'listingPrivacyConfirmed', 'listingRights']
        .map((id) => [id, Boolean($(id)?.checked)])),
      aiUsage: form.querySelector('input[name="listingAiUsage"]:checked')?.value || '',
      files: Array.from(sourceFiles.entries()).map(([path, file]) => ({ path, file })),
      fileOptimizations: Array.from(sourceOptimizations.entries()),
      selectedFormats: Array.from(selectedFormats),
      dismissedFormats: Array.from(dismissedFormats),
      selectedOptionIds: Array.from(selectedOptionIds),
      optionPrices: Array.from(optionPrices.entries()),
      limitedOptionPrice,
      tags: listingTags(),
      customOptions: customOptions.map((option) => ({ ...option })),
      thumbnailPath,
      samplePreviewPaths: Array.from(samplePreviewPaths),
      previewSelectionTouched
    };
  }

  async function saveListingDraft() {
    if (!listingDraftLoaded || !listingDraftKey) return;
    const database = await openListingDraftDatabase();
    try {
      await new Promise((resolve, reject) => {
        const request = database.transaction(LISTING_DRAFT_STORE, 'readwrite').objectStore(LISTING_DRAFT_STORE).put(listingDraftSnapshot());
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('端末保存に失敗しました'));
      });
    } finally { database.close(); }
  }

  function scheduleListingDraftSave() {
    if (!listingDraftLoaded || !listingDraftKey) return;
    window.clearTimeout(listingDraftSaveTimer);
    listingDraftSaveTimer = window.setTimeout(() => {
      saveListingDraft().catch(() => {});
    }, 350);
  }

  async function deleteListingDraft() {
    window.clearTimeout(listingDraftSaveTimer);
    if (!listingDraftKey) return;
    const database = await openListingDraftDatabase();
    try {
      await new Promise((resolve, reject) => {
        const request = database.transaction(LISTING_DRAFT_STORE, 'readwrite').objectStore(LISTING_DRAFT_STORE).delete(listingDraftKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('端末保存を削除できませんでした'));
      });
    } finally { database.close(); }
  }

  async function restoreListingDraft() {
    let draft;
    try { draft = await readListingDraft(); } catch (error) { return; }
    if (!draft) { listingDraftLoaded = true; return; }
    const values = draft.values || {};
    Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = String(value ?? ''); });
    Object.entries(draft.checks || {}).forEach(([id, checked]) => { if ($(id)) $(id).checked = Boolean(checked); });
    const aiUsage = form.querySelector(`input[name="listingAiUsage"][value="${draft.aiUsage}"]`);
    if (aiUsage) aiUsage.checked = true;
    sourceFiles.clear();
    (draft.files || []).forEach(({ path, file }) => { if (file instanceof File) sourceFiles.set(path || filePath(file), file); });
    sourceOptimizations.clear();
    (draft.fileOptimizations || []).forEach(([path, optimization]) => {
      if (typeof path === 'string' && optimization && typeof optimization === 'object') {
        sourceOptimizations.set(path, { ...optimization });
      }
    });
    selectedFormats.clear(); (draft.selectedFormats || []).forEach((value) => selectedFormats.add(value));
    dismissedFormats.clear(); (draft.dismissedFormats || []).forEach((value) => dismissedFormats.add(value));
    selectedOptionIds.clear(); (draft.selectedOptionIds || []).forEach((value) => selectedOptionIds.add(value));
    optionPrices.clear(); (draft.optionPrices || []).forEach(([id, value]) => optionPrices.set(id, Number(value)));
    limitedOptionPrice = normalizedPaidPrice(draft.limitedOptionPrice, MIN_PAID_PRICE_YEN, MAX_OPTION_PRICE_YEN);
    listingTagValues.splice(0, listingTagValues.length, ...(draft.tags || []).slice(0, MAX_TAGS));
    customOptions = Array.isArray(draft.customOptions)
      ? draft.customOptions.slice(0, MAX_CUSTOM_OPTIONS).map((option) => ({
        ...option,
        price_yen: normalizedPaidPrice(option.price_yen, MIN_PAID_PRICE_YEN, MAX_OPTION_PRICE_YEN)
      }))
      : [];
    thumbnailPath = String(draft.thumbnailPath || '');
    samplePreviewPaths.clear(); (draft.samplePreviewPaths || []).forEach((value) => samplePreviewPaths.add(value));
    previewSelectionTouched = Boolean(draft.previewSelectionTouched);
    renderTags(); updateLimitedState(); renderOptions(); renderOptionPriceFields(); renderCustomOptions(); updatePrice();
    await refreshDetectedFiles();
    listingDraftLoaded = true;
    setStatus('端末に保存された出品下書きを復元しました。');
  }

  function setSubmissionEnabled(enabled, label) {
    submissionEnabled = enabled;
    const button = $('listingSubmit');
    button.disabled = !enabled;
    button.textContent = label || (enabled ? '出品内容を送信' : 'ログイン後に出品できます');
  }

  function updatePrice() {
    const salePrice = Math.max(0, integerValue($('listingPrice').value) || 0);
    const optionPrice = optionCatalog.reduce((total, option) => (
      selectedOptionIds.has(option.id) ? total + optionPriceFor(option) : total
    ), 0) + customOptions.reduce((total, option) => total + option.price_yen, 0)
      + ($('listingLimitedEnabled').checked ? limitedOptionPrice : 0);
    $('listingOptionPrice').textContent = yen(optionPrice);
    $('listingLimitedPriceLabel').textContent = `+${yen(limitedOptionPrice)}`;
    const purchasePrice = salePrice + optionPrice;
    $('listingTotalPrice').textContent = yen(purchasePrice);
    $('listingTotalPrice').classList.toggle('is-below-minimum', purchasePrice < MIN_PAID_PRICE_YEN);
  }

  function normalizePriceInput(input, minimum = MIN_PAID_PRICE_YEN, maximum = MAX_OPTION_PRICE_YEN) {
    const value = normalizedPaidPrice(input.value, minimum, maximum);
    input.value = String(value);
    input.setCustomValidity('');
    return value;
  }

  function populatePricePresets() {
    const appendValues = (list, maximum) => {
      const values = [];
      for (let value = MIN_PAID_PRICE_YEN; value <= 10000; value += PRICE_STEP_YEN) values.push(value);
      [20000, 30000, 50000, 100000, 300000, 500000, 1000000, maximum].forEach((value) => {
        if (value <= maximum && !values.includes(value)) values.push(value);
      });
      list.replaceChildren(...values.map((value) => Object.assign(document.createElement('option'), { value: String(value) })));
    };
    appendValues($('listingPricePresets'), MAX_LISTING_PRICE_YEN);
    appendValues($('listingOptionPricePresets'), MAX_OPTION_PRICE_YEN);
  }

  function normalizedTag(value) {
    return String(value || '').replace(/^[#＃]+/, '').trim().replace(/\s+/g, ' ');
  }

  function renderTags() {
    $('listingTags').value = listingTagValues.join(',');
    $('listingTagInput').disabled = listingTagValues.length >= MAX_TAGS;
    $('listingTagAdd').disabled = listingTagValues.length >= MAX_TAGS;
    $('listingTagChips').replaceChildren(...listingTagValues.map((tag) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'market-tag-chip';
      button.textContent = `#${tag} ×`;
      button.setAttribute('aria-label', `${tag}タグを削除`);
      button.addEventListener('click', () => {
        listingTagValues.splice(listingTagValues.indexOf(tag), 1);
        renderTags(); scheduleListingDraftSave();
      });
      return button;
    }));
  }

  function addTag() {
    const input = $('listingTagInput');
    const tag = normalizedTag(input.value);
    if (!tag) return;
    if (Array.from(tag).length > 24) { setStatus('タグは1個24文字以内です。'); return; }
    if (listingTagValues.some((value) => value.toLowerCase() === tag.toLowerCase())) { input.value = ''; return; }
    if (listingTagValues.length >= MAX_TAGS) { setStatus('タグは最大5個です。'); return; }
    listingTagValues.push(tag); input.value = ''; renderTags(); scheduleListingDraftSave();
  }

  function renderCustomOptions() {
    $('listingCustomOptionList').replaceChildren(...(customOptions.length ? customOptions.map((option) => {
      const card = document.createElement('article'); card.className = 'market-custom-option-card';
      const copy = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = option.label;
      const description = document.createElement('small'); description.textContent = option.description || '説明なし';
      copy.append(title, description);
      const price = document.createElement('b'); price.textContent = `+${yen(option.price_yen)}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '削除'; remove.className = 'market-file-button is-subtle';
      remove.addEventListener('click', () => {
        customOptions = customOptions.filter((entry) => entry.id !== option.id);
        renderCustomOptions(); updatePrice(); scheduleListingDraftSave();
      });
      card.append(copy, price, remove); return card;
    }) : [Object.assign(document.createElement('p'), { className: 'helper', textContent: 'カスタムオプションはまだありません。' })]));
  }

  function addCustomOption() {
    if (customOptions.length >= MAX_CUSTOM_OPTIONS) { setStatus(`カスタムオプションは最大${MAX_CUSTOM_OPTIONS}件です。`); return; }
    const label = String($('listingCustomOptionLabel').value || '').trim().replace(/\s+/g, ' ');
    const description = String($('listingCustomOptionDescription').value || '').trim().replace(/\s+/g, ' ');
    const price = normalizePriceInput($('listingCustomOptionPrice'), MIN_PAID_PRICE_YEN, MAX_OPTION_PRICE_YEN);
    if (!label) { setStatus('カスタムオプション名を入力してください。'); return; }
    if (!Number.isInteger(price) || price < MIN_PAID_PRICE_YEN || price > MAX_OPTION_PRICE_YEN) { setStatus('カスタムオプション料金は100〜10,000,000円で設定してください。'); return; }
    if (customOptions.some((option) => option.label.toLowerCase() === label.toLowerCase())) { setStatus('同じ名前のカスタムオプションがあります。'); return; }
    customOptions.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, label, description, price_yen: price });
    $('listingCustomOptionLabel').value = ''; $('listingCustomOptionDescription').value = ''; $('listingCustomOptionPrice').value = '100';
    renderCustomOptions(); updatePrice(); scheduleListingDraftSave();
  }

  function updateLimitedState() {
    const enabled = $('listingLimitedEnabled').checked;
    $('listingLimitedQuantityField').hidden = !enabled;
    $('listingLimitedQuantity').required = enabled;
    renderOptionPriceFields();
    updatePrice();
  }

  function changeSummary() {
    const text = String($('listingChangeSummary')?.value || '').trim();
    return text ? [{ type: 'creator-declaration', text }] : [];
  }

  async function loadDerivativeContext() {
    if (!derivativeModeRequested) return null;
    if (!validUuid(sourceAssetId) || !validUuid(derivativeLicenseId)) {
      throw new Error('派生出品の親作品または派生出品権を確認できません。マイページから開き直してください。');
    }
    const { data: context, error: contextError } = await client.rpc('market_derivative_listing_context_v1', {
      input_source_asset_id: sourceAssetId,
      input_derivative_license_id: derivativeLicenseId
    });
    if (contextError || !context) throw contextError || new Error('派生出品情報を取得できません。');

    const inheritedOptions = Array.isArray(context.inherited_terms?.license_options)
      ? context.inherited_terms.license_options
      : [];
    optionCatalog = inheritedOptions.map((option, index) => ({
      id: option.id,
      label: option.label || option.id,
      description: '親作品から継承される利用条件です。',
      minimum_price_yen: Number(option.minimum_price_yen || option.price_yen || 0),
      sort_order: index
    }));
    selectedOptionIds.clear(); optionPrices.clear();
    inheritedOptions.forEach((option) => {
      selectedOptionIds.add(option.id);
      optionPrices.set(option.id, Number(option.price_yen ?? option.minimum_price_yen ?? 0));
    });
    derivativeContext = context;
    $('listingDerivativeContext').hidden = false;
    $('listingDerivativeSourceTitle').textContent = context.source_title || '親作品';
    $('listingChangeSummaryField').hidden = false;
    $('listingChangeSummary').required = true;
    $('listingRightsLabel').textContent = '表示中の親作品を元にした派生作品であり、変更・追加内容を正しく申告しました。';
    $('listingDerivativeAllowed').checked = true;
    $('listingDerivativeAllowed').disabled = true;
    $('listingPrice').min = String(minimumPrice(context.minimum_seller_price_yen));
    if (Number($('listingPrice').value) < Number($('listingPrice').min)) $('listingPrice').value = $('listingPrice').min;
    $('listingOptionsTitle').textContent = '継承される利用オプション';
    $('listingCustomOptions').hidden = true;
    document.querySelector('.market-titlebar h1').textContent = '派生作品を出品';
    renderOptions(); renderOptionPriceFields(); updatePrice();
    return derivativeContext;
  }

  function syncOptionPrices() {
    const validIds = new Set(optionCatalog.map((option) => option.id));
    Array.from(optionPrices.keys()).forEach((id) => { if (!validIds.has(id)) optionPrices.delete(id); });
    optionCatalog.forEach((option) => {
      const current = Number(optionPrices.get(option.id));
      const minimum = minimumPrice(option.minimum_price_yen);
      if (!Number.isInteger(current) || current < minimum || current % PRICE_STEP_YEN !== 0) optionPrices.set(option.id, minimum);
    });
  }

  function optionPriceFor(option) {
    const value = Number(optionPrices.get(option.id));
    const minimum = minimumPrice(option.minimum_price_yen);
    return Number.isInteger(value) && value >= minimum && value % PRICE_STEP_YEN === 0 ? value : minimum;
  }

  function switchCard({ title, description, meta, checked, disabled = false, onChange }) {
    const label = document.createElement('label'); label.className = 'market-switch-card';
    const copy = document.createElement('span');
    const strong = document.createElement('strong'); strong.textContent = title;
    const small = document.createElement('small'); small.textContent = description;
    copy.append(strong, small);
    const side = document.createElement('span'); side.className = 'market-switch-side';
    if (meta) { const price = document.createElement('b'); price.textContent = meta; side.append(price); }
    const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'market-switch-input'; input.checked = checked; input.disabled = disabled;
    const visual = document.createElement('i'); visual.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => onChange(input.checked));
    side.append(input, visual); label.append(copy, side); return label;
  }

  function renderOptions() {
    syncOptionPrices();
    const validIds = new Set(optionCatalog.map((option) => option.id));
    Array.from(selectedOptionIds).forEach((id) => { if (!validIds.has(id)) selectedOptionIds.delete(id); });
    $('listingOptionSwitches').replaceChildren(...optionCatalog.map((option) => switchCard({
      title: option.label,
      description: option.description,
      meta: `+${yen(optionPriceFor(option))}`,
      checked: selectedOptionIds.has(option.id),
      disabled: Boolean(derivativeContext),
      onChange: (checked) => {
        if (checked) selectedOptionIds.add(option.id); else selectedOptionIds.delete(option.id);
        renderOptionPriceFields(); updatePrice(); scheduleListingDraftSave();
      }
    })));
  }

  function renderOptionPriceFields() {
    syncOptionPrices();
    const selected = derivativeContext ? [] : optionCatalog.filter((option) => selectedOptionIds.has(option.id));
    const fields = selected.map((option) => {
      const label = document.createElement('label'); label.className = 'market-option-price-field';
      const title = document.createElement('span'); title.textContent = option.label;
      const minimumValue = minimumPrice(option.minimum_price_yen);
      const minimum = document.createElement('small'); minimum.textContent = `最低 ${yen(minimumValue)}・100円単位`;
      const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '[0-9]*'; input.maxLength = 8; input.setAttribute('list', 'listingOptionPricePresets'); input.value = String(optionPriceFor(option));
      input.addEventListener('input', () => {
        const value = integerValue(input.value);
        if (Number.isInteger(value)) optionPrices.set(option.id, value);
        updatePrice(); scheduleListingDraftSave();
      });
      input.addEventListener('change', () => {
        optionPrices.set(option.id, normalizePriceInput(input, minimumValue, MAX_OPTION_PRICE_YEN));
        renderOptions(); renderOptionPriceFields(); updatePrice(); scheduleListingDraftSave();
      });
      label.append(title, minimum, input); return label;
    });
    if ($('listingLimitedEnabled').checked) {
      const label = document.createElement('label'); label.className = 'market-option-price-field';
      const title = document.createElement('span'); title.textContent = '限定販売';
      const minimum = document.createElement('small'); minimum.textContent = '最低 100円・100円単位';
      const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '[0-9]*'; input.maxLength = 8; input.setAttribute('list', 'listingOptionPricePresets'); input.value = String(limitedOptionPrice);
      input.addEventListener('input', () => {
        const value = integerValue(input.value);
        if (Number.isInteger(value)) limitedOptionPrice = value;
        updatePrice(); scheduleListingDraftSave();
      });
      input.addEventListener('change', () => {
        limitedOptionPrice = normalizePriceInput(input, MIN_PAID_PRICE_YEN, MAX_OPTION_PRICE_YEN);
        renderOptionPriceFields(); updatePrice(); scheduleListingDraftSave();
      });
      label.append(title, minimum, input); fields.unshift(label);
    }
    if (!fields.length) {
      const empty = document.createElement('p'); empty.className = 'helper'; empty.textContent = '料金を変更するオプションをONにしてください。';
      $('listingOptionPriceFields').replaceChildren(empty); return;
    }
    $('listingOptionPriceFields').replaceChildren(...fields);
  }

  function activeEntries() {
    return detectedEntries.filter((entry) => selectedFormats.has(entry.format));
  }

  function activePreviewEntries() {
    return activeEntries().filter(isPreviewable);
  }

  function getPreviewUrl(entry) {
    if (!entry) return '';
    if (!previewUrls.has(entry.path)) previewUrls.set(entry.path, URL.createObjectURL(entry.previewBlob || entry.file));
    return previewUrls.get(entry.path);
  }

  function renderFiles() {
    const entries = activeEntries();
    const activeBytes = entries.reduce((total, entry) => total + entry.file.size, 0);
    const suffix = ignoredFileCount ? `／未対応 ${ignoredFileCount}件は現在出品対象外` : '';
    $('listingFileSummary').textContent = detectedEntries.length
      ? `${detectedEntries.length}件追加・対応 ${entries.length}件を出品・${fileSize(activeBytes)}${suffix}`
      : `ファイルまたはフォルダを追加してください。${suffix}`;
    $('listingFileList').replaceChildren(...detectedEntries.slice(0, 12).map((entry) => {
      const row = document.createElement('div');
      row.className = `market-file-row${entry.format ? (selectedFormats.has(entry.format) ? '' : ' is-excluded') : ' is-unsupported'}`;
      const name = document.createElement('span'); name.textContent = entry.path;
      const format = document.createElement('b'); format.textContent = entry.format ? FORMAT_LABELS[entry.format] : '未対応';
      const size = document.createElement('small');
      size.textContent = entry.optimization
        ? `${fileSize(entry.file.size)}・${entry.optimization.integer_scale_factor}倍縮小済み`
        : fileSize(entry.file.size);
      row.append(name, format, size); return row;
    }));
    if (detectedEntries.length > 12) {
      const more = document.createElement('p'); more.className = 'helper'; more.textContent = `ほか ${detectedEntries.length - 12}ファイル`;
      $('listingFileList').append(more);
    }
  }

  function ensurePreviewSelection() {
    const entries = activePreviewEntries();
    const paths = new Set(entries.map((entry) => entry.path));
    if (!paths.has(thumbnailPath)) thumbnailPath = entries[0]?.path || '';
    Array.from(samplePreviewPaths).forEach((path) => { if (!paths.has(path)) samplePreviewPaths.delete(path); });
    if (!previewSelectionTouched && samplePreviewPaths.size === 0) {
      entries.slice(0, 4).forEach((entry) => samplePreviewPaths.add(entry.path));
    }
  }

  function openViewer(entries, startPath) {
    viewerEntries = entries.filter(isPreviewable);
    if (!viewerEntries.length) return;
    viewerIndex = Math.max(0, viewerEntries.findIndex((entry) => entry.path === startPath));
    renderViewer();
    const dialog = $('listingPreviewDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function renderViewer() {
    const entry = viewerEntries[viewerIndex];
    if (!entry) return;
    $('listingPreviewDialogImage').src = getPreviewUrl(entry);
    $('listingPreviewDialogImage').alt = `${entry.file.name}の購入前プレビュー`;
    $('listingPreviewDialogName').textContent = entry.path;
    $('listingPreviewCounter').textContent = `${viewerIndex + 1} / ${viewerEntries.length}`;
    $('listingPreviewPrev').disabled = viewerEntries.length < 2;
    $('listingPreviewNext').disabled = viewerEntries.length < 2;
  }

  function renderPreviews() {
    ensurePreviewSelection();
    const entries = detectedEntries.filter(isPreviewable);
    $('listingPreviewSection').hidden = entries.length === 0;
    $('listingOpenViewMode').disabled = samplePreviewPaths.size === 0;
    $('listingPreviewGrid').replaceChildren(...entries.map((entry) => {
      const active = selectedFormats.has(entry.format);
      const card = document.createElement('article');
      card.className = `market-preview-card${active ? '' : ' is-excluded'}`;
      const imageButton = document.createElement('button'); imageButton.type = 'button'; imageButton.className = 'market-preview-card__image'; imageButton.disabled = !active;
      const image = new Image(); image.src = getPreviewUrl(entry); image.alt = '';
      const format = document.createElement('span'); format.textContent = FORMAT_LABELS[entry.format];
      imageButton.append(image, format);
      imageButton.addEventListener('click', () => openViewer(activePreviewEntries(), entry.path));
      const body = document.createElement('div'); body.className = 'market-preview-card__body';
      const name = document.createElement('div'); name.className = 'market-preview-card__name'; name.textContent = entry.path;
      const thumbnail = document.createElement('label'); thumbnail.className = 'market-preview-choice';
      const thumbnailInput = document.createElement('input'); thumbnailInput.type = 'radio'; thumbnailInput.name = 'listingThumbnail'; thumbnailInput.checked = thumbnailPath === entry.path; thumbnailInput.disabled = !active;
      thumbnailInput.addEventListener('change', () => { thumbnailPath = entry.path; renderPreviews(); scheduleListingDraftSave(); });
      thumbnail.append(thumbnailInput, document.createTextNode('サムネイル'));
      const sample = document.createElement('label'); sample.className = 'market-preview-choice';
      const sampleInput = document.createElement('input'); sampleInput.type = 'checkbox'; sampleInput.checked = samplePreviewPaths.has(entry.path); sampleInput.disabled = !active;
      sampleInput.addEventListener('change', () => {
        previewSelectionTouched = true;
        if (sampleInput.checked && samplePreviewPaths.size >= MAX_SAMPLE_PREVIEWS) {
          sampleInput.checked = false; setStatus(`購入前プレビューは${MAX_SAMPLE_PREVIEWS}枚までです。`); return;
        }
        if (sampleInput.checked) samplePreviewPaths.add(entry.path); else samplePreviewPaths.delete(entry.path);
        renderPreviews(); scheduleListingDraftSave();
      });
      sample.append(sampleInput, document.createTextNode('購入前プレビューに含める'));
      body.append(name, thumbnail, sample); card.append(imageButton, body); return card;
    }));
  }

  function renderFormats() {
    const counts = new Map();
    detectedEntries.forEach((entry) => { if (entry.format) counts.set(entry.format, (counts.get(entry.format) || 0) + 1); });
    const formats = FORMAT_ORDER.filter((format) => counts.has(format));
    $('listingFormatSwitches').replaceChildren(...formats.map((format) => switchCard({
      title: FORMAT_LABELS[format],
      description: `${counts.get(format)}ファイルを商品に含める`,
      checked: selectedFormats.has(format),
      onChange: (checked) => {
        if (checked) { selectedFormats.add(format); dismissedFormats.delete(format); }
        else { selectedFormats.delete(format); dismissedFormats.add(format); }
        updateProductType(); renderFiles(); renderPreviews(); scheduleListingDraftSave();
      }
    })));
    if (!formats.length) {
      const empty = document.createElement('p'); empty.className = 'helper'; empty.textContent = '対応形式はまだ検出されていません。';
      $('listingFormatSwitches').append(empty);
    }
    updateProductType(); renderFiles(); renderPreviews();
  }

  function updateProductType() {
    if (!selectedFormats.size) {
      $('listingProductType').textContent = '商品種類はファイル追加後に自動判定されます。';
      $('listingProductType').className = 'market-product-type-preview';
      return;
    }
    const pixieeDraw = selectedFormats.has('pixiedraw-project');
    $('listingProductType').textContent = pixieeDraw
      ? 'PiXiEEDraw作品：編集用プロジェクトを含み、購入後にPiXiEEDrawで開けます。'
      : '一般素材：画像・アニメーション形式をZIPで受け取る商品です。';
    $('listingProductType').className = `market-product-type-preview ${pixieeDraw ? 'is-pixiedraw-product' : 'is-general-product'}`;
  }

  async function refreshDetectedFiles() {
    const run = ++detectionRun;
    const files = Array.from(sourceFiles.entries());
    setStatus(files.length ? 'ファイル形式を判定しています...' : '');
    const detected = [];
    const optimizationMessages = [];
    const optimizationWarnings = [];
    for (let index = 0; index < files.length; index += 1) {
      const [path, sourceFile] = files[index];
      let file = sourceFile;
      const format = await packageUtils.detectFormat(file);
      let optimization = sourceOptimizations.get(path) || null;
      if (format === 'gif' && !optimization && typeof packageUtils.optimizeGifIntegerScale === 'function') {
        try {
          setStatus(`GIFを1px単位で確認しています（${index + 1}/${files.length}）...`);
          const result = await packageUtils.optimizeGifIntegerScale(file, {
            onProgress: ({ phase, completed, total }) => {
              const action = phase === 'encode' ? '適正化しています' : '全フレームを確認しています';
              setStatus(`GIFを${action}（${completed}/${total}）...`);
            }
          });
          if (run !== detectionRun || sourceFiles.get(path) !== sourceFile) return;
          if (result.optimized) {
            const sourceSha256 = await sha256File(file);
            if (run !== detectionRun || sourceFiles.get(path) !== sourceFile) return;
            file = result.file;
            optimization = {
              kind: result.reason,
              source_width: result.sourceWidth,
              source_height: result.sourceHeight,
              output_width: result.width,
              output_height: result.height,
              integer_scale_factor: result.integerScaleFactor,
              frame_count: result.frameCount,
              loop_count: result.loopCount,
              duration_ms: result.durationMs,
              source_size: result.sourceBytes,
              output_size: result.outputBytes,
              source_sha256: sourceSha256
            };
            sourceFiles.set(path, file);
            sourceOptimizations.set(path, optimization);
            optimizationMessages.push(
              `${path}: ${result.sourceWidth}x${result.sourceHeight} → ${result.width}x${result.height}（${result.integerScaleFactor}倍）`
            );
          } else if (result.reason === 'verification-failed') {
            optimizationWarnings.push(`${path}: 再生成結果を完全一致で確認できなかったため元GIFを使用します。`);
          }
        } catch (error) {
          optimizationWarnings.push(`${path}: GIF最適化を適用できなかったため元GIFを使用します（${error.message || '解析エラー'}）。`);
        }
      } else if (format !== 'gif') {
        sourceOptimizations.delete(path);
        optimization = null;
      }
      const previewBlob = format === 'pixiedraw-project'
        ? await packageUtils.extractPixieeDrawPreviewPng(file)
        : null;
      detected.push({ path, file, format, previewBlob, optimization });
      if (index > 0 && index % 20 === 0) setStatus(`ファイル形式を判定しています（${index + 1}/${files.length}）...`);
    }
    if (run !== detectionRun) return;
    detectedEntries = detected;
    ignoredFileCount = detected.filter((entry) => !entry.format).length;
    new Set(detectedEntries.map((entry) => entry.format).filter(Boolean)).forEach((format) => {
      if (!dismissedFormats.has(format)) selectedFormats.add(format);
    });
    Array.from(selectedFormats).forEach((format) => {
      if (!detectedEntries.some((entry) => entry.format === format)) selectedFormats.delete(format);
    });
    previewUrls.forEach((url) => URL.revokeObjectURL(url)); previewUrls.clear();
    renderFormats();
    const previewlessProjectCount = detected.filter((entry) => entry.format === 'pixiedraw-project' && !entry.previewBlob).length;
    setStatus([
      optimizationMessages.length ? `GIFをアップロード前に1px単位へ適正化しました。${optimizationMessages.join(' ')}` : '',
      ...optimizationWarnings,
      ignoredFileCount ? `未対応形式 ${ignoredFileCount}件は一覧に残していますが、現在の出品には含まれません。` : '',
      previewlessProjectCount ? `旧形式などPNGサムネイルを含まないPiXiEEDraw ${previewlessProjectCount}件はプレビューを生成できませんでした。` : ''
    ].filter(Boolean).join(' '));
  }

  async function addFiles(additions) {
    const normalized = Array.from(additions || []).map((item) => item?.file ? item : { file: item, path: filePath(item) }).filter((item) => item.file instanceof File);
    if (!normalized.length) return;
    normalized.forEach(({ file, path }) => {
      const normalizedPath = path || filePath(file);
      sourceFiles.set(normalizedPath, file);
      sourceOptimizations.delete(normalizedPath);
    });
    if (sourceFiles.size > MAX_DETECTION_COUNT) {
      normalized.forEach(({ file, path }) => sourceFiles.delete(path || filePath(file)));
      setStatus(`一度に判定できるファイルは${MAX_DETECTION_COUNT}件までです。`); return;
    }
    await refreshDetectedFiles(); scheduleListingDraftSave();
  }

  function readDirectoryEntries(reader) {
    return new Promise((resolve, reject) => {
      const all = [];
      const read = () => reader.readEntries((entries) => {
        if (!entries.length) { resolve(all); return; }
        all.push(...entries); read();
      }, reject);
      read();
    });
  }

  async function filesFromEntry(entry, prefix = '') {
    if (!entry) return [];
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      return [{ file, path: `${prefix}${file.name}` }];
    }
    if (!entry.isDirectory) return [];
    const childPrefix = `${prefix}${entry.name}/`;
    const children = await readDirectoryEntries(entry.createReader());
    const nested = await Promise.allSettled(children.map((child) => filesFromEntry(child, childPrefix)));
    return nested.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value);
  }

  async function filesFromDrop(dataTransfer) {
    const items = Array.from(dataTransfer?.items || []);
    const handleResults = await Promise.allSettled(items.map((item) => (
      typeof item.getAsFileSystemHandle === 'function' ? item.getAsFileSystemHandle() : null
    )));
    const handles = handleResults.filter((result) => result.status === 'fulfilled' && result.value).map((result) => result.value);
    if (handles.length) {
      const collected = await Promise.allSettled(handles.map((handle) => packageUtils.collectFilesFromHandle(handle)));
      const files = collected.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value);
      if (files.length) return files;
    }
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) {
      const collected = await Promise.allSettled(entries.map((entry) => filesFromEntry(entry)));
      const files = collected.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value);
      if (files.length) return files;
    }
    return Array.from(dataTransfer?.files || []).map((file) => ({ file, path: filePath(file) }));
  }

  function clearFiles() {
    sourceFiles.clear(); detectedEntries = []; ignoredFileCount = 0; thumbnailPath = '';
    sourceOptimizations.clear();
    selectedFormats.clear(); dismissedFormats.clear(); samplePreviewPaths.clear(); previewSelectionTouched = false;
    detectionRun += 1;
    previewUrls.forEach((url) => URL.revokeObjectURL(url)); previewUrls.clear();
    renderFormats(); setStatus(''); scheduleListingDraftSave();
  }

  const safeSegment = (value) => {
    const cleaned = String(value || '').normalize('NFC').replace(/[\\/#?%\u0000-\u001f]/g, '_').trim();
    return (!cleaned || cleaned === '.' || cleaned === '..' ? 'file' : cleaned).slice(0, 120);
  };
  const safeRelativePath = (value) => value.split('/').filter(Boolean).map(safeSegment).join('/');
  const storagePathFor = (userId, assetId, entry, index) => `${userId}/${assetId}/files/${String(index + 1).padStart(3, '0')}/${safeRelativePath(entry.path)}`;

  async function buildPackage(entries) {
    const files = [];
    for (let index = 0; index < entries.length; index += 1) {
      setStatus(`ハッシュを計算しています（${index + 1}/${entries.length}）...`);
      const entry = entries[index];
      files.push({
        original_path: entry.path,
        name: entry.file.name,
        size: entry.file.size,
        mime_type: entry.file.type || 'application/octet-stream',
        format: entry.format,
        sha256: await sha256File(entry.file),
        ...(entry.optimization ? { optimization: { ...entry.optimization } } : {})
      });
    }
    const fingerprint = JSON.stringify(files.map(({ original_path, size, format, sha256 }) => ({ original_path, size, format, sha256 })));
    return {
      sourceHash: await sha256Buffer(new TextEncoder().encode(fingerprint)),
      files,
      totalBytes: entries.reduce((total, entry) => total + entry.file.size, 0)
    };
  }

  async function loadImageSource(file) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode(); return image;
    } catch (error) {
      URL.revokeObjectURL(url); throw error;
    }
  }

  async function createPreviewBlob(file, { thumbnail = false, mimeType = 'image/webp' } = {}) {
    const source = await loadImageSource(file);
    try {
      const sourceWidth = source.width || source.naturalWidth;
      const sourceHeight = source.height || source.naturalHeight;
      const maxSide = thumbnail ? 640 : 960;
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { alpha: true });
      context.imageSmoothingEnabled = false;
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      if (!thumbnail) {
        const fontSize = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) / 9));
        context.save();
        context.translate(canvas.width / 2, canvas.height / 2); context.rotate(-Math.PI / 10);
        context.font = `900 ${fontSize}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.lineWidth = Math.max(2, fontSize / 12); context.strokeStyle = 'rgba(0,0,0,.45)'; context.fillStyle = 'rgba(255,255,255,.48)';
        context.strokeText('PiXiEED SAMPLE', 0, 0); context.fillText('PiXiEED SAMPLE', 0, 0); context.restore();
      }
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('preview conversion failed')), mimeType, .88));
    } finally {
      if (typeof source.close === 'function') source.close();
      if (source instanceof HTMLImageElement && source.src.startsWith('blob:')) URL.revokeObjectURL(source.src);
    }
  }

  function previewStorageFormat(entry) {
    return entry?.format === 'pixiedraw-project'
      ? { extension: 'png', mimeType: 'image/png' }
      : { extension: 'webp', mimeType: 'image/webp' };
  }

  function bindLocalUi() {
    form.hidden = false;
    populatePricePresets();
    renderOptions(); renderFormats(); updateLimitedState(); setSubmissionEnabled(false);
    renderOptionPriceFields(); renderTags(); renderCustomOptions();
    const sourceDialog = $('listingSourceDialog');
    const openSourceDialog = () => {
      if (typeof sourceDialog.showModal === 'function') sourceDialog.showModal(); else sourceDialog.setAttribute('open', '');
    };
    const closeSourceDialog = () => {
      if (typeof sourceDialog.close === 'function') sourceDialog.close(); else sourceDialog.removeAttribute('open');
    };
    $('listingFiles').addEventListener('change', async (event) => { await addFiles(event.target.files); event.target.value = ''; });
    $('listingFolder').addEventListener('change', async (event) => { await addFiles(event.target.files); event.target.value = ''; });
    $('listingSourcePicker').addEventListener('click', openSourceDialog);
    $('listingSourceClose').addEventListener('click', closeSourceDialog);
    $('listingChooseFiles').addEventListener('click', () => { closeSourceDialog(); $('listingFiles').click(); });
    $('listingChooseFolder').addEventListener('click', () => { closeSourceDialog(); $('listingFolder').click(); });
    $('listingFilesClear').addEventListener('click', clearFiles);
    $('listingPrice').addEventListener('input', () => { updatePrice(); scheduleListingDraftSave(); });
    $('listingPrice').addEventListener('change', () => {
      normalizePriceInput($('listingPrice'), Number($('listingPrice').min) || MIN_PAID_PRICE_YEN, MAX_LISTING_PRICE_YEN);
      updatePrice(); scheduleListingDraftSave();
    });
    $('listingLimitedEnabled').addEventListener('change', () => { updateLimitedState(); scheduleListingDraftSave(); });
    $('listingLimitedQuantity').addEventListener('input', () => { updatePrice(); scheduleListingDraftSave(); });
    $('listingTagAdd').addEventListener('click', addTag);
    $('listingTagInput').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ',' && event.key !== '、') return;
      event.preventDefault(); addTag();
    });
    $('listingCustomOptionAdd').addEventListener('click', addCustomOption);
    form.addEventListener('input', scheduleListingDraftSave);
    form.addEventListener('change', scheduleListingDraftSave);
    const dropZone = $('listingDropZone');
    dropZone.addEventListener('click', openSourceDialog);
    dropZone.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); openSourceDialog();
    });
    ['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (event) => {
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; dropZone.classList.add('is-dragover');
    }));
    ['dragleave', 'dragend'].forEach((type) => dropZone.addEventListener(type, () => dropZone.classList.remove('is-dragover')));
    dropZone.addEventListener('drop', async (event) => {
      event.preventDefault(); dropZone.classList.remove('is-dragover');
      setStatus('ドロップされた内容を確認しています...');
      try { await addFiles(await filesFromDrop(event.dataTransfer)); }
      catch (error) { setStatus(`フォルダを読み込めませんでした: ${error.message || '再度お試しください'}`); }
    });
    $('listingOpenViewMode').addEventListener('click', () => {
      const entries = activePreviewEntries().filter((entry) => samplePreviewPaths.has(entry.path));
      openViewer(entries, entries[0]?.path);
    });
    $('listingPreviewClose').addEventListener('click', () => $('listingPreviewDialog').close());
    $('listingPreviewPrev').addEventListener('click', () => { viewerIndex = (viewerIndex - 1 + viewerEntries.length) % viewerEntries.length; renderViewer(); });
    $('listingPreviewNext').addEventListener('click', () => { viewerIndex = (viewerIndex + 1) % viewerEntries.length; renderViewer(); });
    form.addEventListener('submit', submitListing);
  }

  async function submitListing(event) {
    event.preventDefault();
    const salePriceMinimum = Number($('listingPrice').min) || MIN_PAID_PRICE_YEN;
    normalizePriceInput($('listingPrice'), salePriceMinimum, MAX_LISTING_PRICE_YEN);
    optionCatalog.forEach((option) => {
      if (selectedOptionIds.has(option.id)) optionPrices.set(option.id, normalizedPaidPrice(optionPriceFor(option), option.minimum_price_yen, MAX_OPTION_PRICE_YEN));
    });
    customOptions = customOptions.map((option) => ({
      ...option,
      price_yen: normalizedPaidPrice(option.price_yen, MIN_PAID_PRICE_YEN, MAX_OPTION_PRICE_YEN)
    }));
    limitedOptionPrice = normalizedPaidPrice(limitedOptionPrice, MIN_PAID_PRICE_YEN, MAX_OPTION_PRICE_YEN);
    if (!form.reportValidity()) {
      setStatus('必須項目と確認欄をすべて入力してください。'); return;
    }
    if (!submissionEnabled || !client || !signedInUser) {
      setStatus('出品送信にはHTTPで開き、ログインと販売者確認を完了してください。'); return;
    }
    const entries = activeEntries();
    if (!entries.length) { setStatus('出品する形式を1つ以上ONにしてください。'); return; }
    if (entries.length > MAX_FILE_COUNT) { setStatus(`ファイルは${MAX_FILE_COUNT}件までです。`); return; }
    const totalBytes = entries.reduce((total, entry) => total + entry.file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) { setStatus('1商品の合計ファイルサイズは50MBまでです。'); return; }
    const formats = FORMAT_ORDER.filter((format) => selectedFormats.has(format) && entries.some((entry) => entry.format === format));
    const optionIds = optionCatalog.filter((option) => selectedOptionIds.has(option.id)).map((option) => option.id);
    const tags = listingTags();
    if (tags.length > MAX_TAGS || tags.some((tag) => Array.from(tag).length > 24)) {
      setStatus('タグは最大5個、1個24文字以内で設定してください。'); return;
    }
    const salePrice = integerValue($('listingPrice').value);
    if (!Number.isInteger(salePrice) || salePrice < salePriceMinimum || salePrice > MAX_LISTING_PRICE_YEN || salePrice % PRICE_STEP_YEN !== 0) {
      setStatus(`作品価格は${yen(salePriceMinimum)}以上、100円単位で設定してください。`); return;
    }
    const optionPrice = optionCatalog.reduce((total, option) => (
      selectedOptionIds.has(option.id) ? total + optionPriceFor(option) : total
    ), 0) + (derivativeContext ? 0 : customOptions.reduce((total, option) => total + option.price_yen, 0))
      + ($('listingLimitedEnabled').checked ? limitedOptionPrice : 0);
    const purchasePrice = salePrice + optionPrice;
    if (purchasePrice < MIN_PAID_PRICE_YEN || purchasePrice % PRICE_STEP_YEN !== 0) {
      setStatus('購入者の支払合計は100円以上、100円単位で設定してください。'); return;
    }
    if (purchasePrice > 99999999) {
      setStatus('購入者の支払額は99,999,999円以下にしてください。'); return;
    }
    const limitedEnabled = $('listingLimitedEnabled').checked;
    const limitedQuantity = integerValue($('listingLimitedQuantity').value);
    if (limitedEnabled && (!Number.isInteger(limitedQuantity) || limitedQuantity < 1 || limitedQuantity > 100000)) {
      setStatus('限定販売の先着人数は1〜100,000名で設定してください。'); return;
    }
    const aiUsageStatus = form.querySelector('input[name="listingAiUsage"]:checked')?.value || '';
    if (!['used', 'not-used'].includes(aiUsageStatus)) {
      setStatus('AI使用の有無を選択してください。'); return;
    }
    if (!$('listingTermsConfirmed').checked || !$('listingPrivacyConfirmed').checked || !$('listingRights').checked) {
      setStatus('規約、プライバシーポリシー、出品権限の確認が必要です。'); return;
    }
    if (derivativeModeRequested && (!derivativeContext || changeSummary().length === 0)) {
      setStatus('派生作品は、親作品から変更・追加した内容の記載が必要です。'); return;
    }

    const button = $('listingSubmit'); button.disabled = true;
    let uploadedPaths = [];
    let assetId = null;
    let submissionStep = '下書き作成';
    try {
      const packageData = await buildPackage(entries);
      const previewEntries = activePreviewEntries();
      const thumbnailEntry = previewEntries.find((entry) => entry.path === thumbnailPath) || null;
      const sampleEntries = previewEntries.filter((entry) => samplePreviewPaths.has(entry.path)).slice(0, MAX_SAMPLE_PREVIEWS);
      const provenance = {
        schema: 'pixieed-market-package/v1',
        detection: 'automatic',
        file_count: entries.length,
        total_bytes: packageData.totalBytes,
        detected_formats: formats,
        ai_usage_status: aiUsageStatus,
        legal_confirmation: { terms_version: MARKET_TERMS_VERSION, privacy_version: MARKET_PRIVACY_VERSION },
        listing_tags: tags,
        files: packageData.files,
        preview_selection: {
          thumbnail_source_path: thumbnailEntry?.path || null,
          sample_source_paths: sampleEntries.map((entry) => entry.path),
          public_preview_kind: 'watermarked-derivative'
        },
        limited_sale: limitedEnabled ? { enabled: true, quantity: limitedQuantity, option_price_yen: limitedOptionPrice, minimum_price_yen: 100 } : { enabled: false }
      };
      setStatus('出品下書きを作成しています...');
      const rpcName = derivativeContext ? 'market_create_derivative_draft_v4' : 'market_create_root_asset_v7';
      const sellerPriceForRpc = salePrice + (limitedEnabled ? limitedOptionPrice : 0);
      const rpcInput = derivativeContext ? {
        input_source_asset_id: sourceAssetId,
        input_derivative_license_id: derivativeLicenseId,
        input_title: $('listingTitle').value.trim(),
        input_description: $('listingDescription').value.trim(),
        input_seller_price_yen: sellerPriceForRpc,
        input_source_kind: 'external',
        input_source_sha256: packageData.sourceHash,
        input_asset_formats: formats,
        input_provenance_manifest: { ...provenance, derivative_source_asset_id: sourceAssetId, derivative_listing_right_id: derivativeLicenseId },
        input_change_summary: changeSummary(),
        input_terms_version: MARKET_TERMS_VERSION,
        input_privacy_version: MARKET_PRIVACY_VERSION,
        input_ai_usage_status: aiUsageStatus,
        input_terms_confirmed: $('listingTermsConfirmed').checked,
        input_privacy_confirmed: $('listingPrivacyConfirmed').checked
      } : {
        input_title: $('listingTitle').value.trim(),
        input_description: $('listingDescription').value.trim(),
        input_sale_price_yen: sellerPriceForRpc,
        input_derivative_sales_allowed: $('listingDerivativeAllowed').checked,
        input_source_kind: 'external',
        input_source_sha256: packageData.sourceHash,
        input_asset_formats: formats,
        input_selected_option_ids: optionIds,
        input_option_prices: Object.fromEntries(optionCatalog.filter((option) => selectedOptionIds.has(option.id)).map((option) => [option.id, optionPriceFor(option)])),
        input_provenance_manifest: provenance,
        input_inherited_terms: {},
        input_prohibited_uses: [],
        input_change_summary: [],
        input_terms_version: MARKET_TERMS_VERSION,
        input_privacy_version: MARKET_PRIVACY_VERSION,
        input_ai_usage_status: aiUsageStatus,
        input_terms_confirmed: $('listingTermsConfirmed').checked,
        input_privacy_confirmed: $('listingPrivacyConfirmed').checked,
        input_original_work_confirmed: $('listingRights').checked,
        input_custom_options: customOptions.map(({ label, description, price_yen }) => ({ label, description, price_yen }))
      };
      const { data: createdAssetId, error: draftError } = await client.rpc(rpcName, rpcInput);
      if (draftError) throw draftError;
      assetId = createdAssetId;
      submissionStep = 'タグ設定';
      const { error: tagsError } = await client.rpc('market_set_listing_tags', {
        input_asset_id: assetId,
        input_tags: tags
      });
      if (tagsError) throw tagsError;
      submissionStep = '限定販売設定';
      const { error: limitedError } = await client.rpc('market_set_listing_limited_sale', {
        input_asset_id: assetId,
        input_enabled: limitedEnabled,
        input_quantity: limitedEnabled ? limitedQuantity : null
      });
      if (limitedError) throw limitedError;

      submissionStep = 'ファイル送信';
      const storedFiles = entries.map((entry, index) => ({ entry, path: storagePathFor(signedInUser.id, assetId, entry, index), metadata: packageData.files[index] }));
      for (let index = 0; index < storedFiles.length; index += 1) {
        const stored = storedFiles[index]; setStatus(`ファイルを送信しています（${index + 1}/${storedFiles.length}）...`);
        const { error: uploadError } = await client.storage.from('market-private').upload(stored.path, stored.entry.file, { upsert: false, contentType: stored.entry.file.type || 'application/octet-stream' });
        if (uploadError) throw uploadError;
        uploadedPaths.push(stored.path); stored.metadata.storage_path = stored.path;
      }

      let thumbnailStoragePath = null;
      if (thumbnailEntry) {
        setStatus('サムネイルを生成しています...');
        const output = previewStorageFormat(thumbnailEntry);
        const blob = await createPreviewBlob(thumbnailEntry.previewBlob || thumbnailEntry.file, { thumbnail: true, mimeType: output.mimeType });
        thumbnailStoragePath = `${signedInUser.id}/${assetId}/previews/thumbnail.${output.extension}`;
        const { error } = await client.storage.from('market-private').upload(thumbnailStoragePath, blob, { upsert: false, contentType: output.mimeType });
        if (error) throw error; uploadedPaths.push(thumbnailStoragePath);
      }
      const sampleStoragePaths = [];
      for (let index = 0; index < sampleEntries.length; index += 1) {
        setStatus(`購入前プレビューを生成しています（${index + 1}/${sampleEntries.length}）...`);
        const entry = sampleEntries[index];
        const output = previewStorageFormat(entry);
        const blob = await createPreviewBlob(entry.previewBlob || entry.file, { mimeType: output.mimeType });
        const path = `${signedInUser.id}/${assetId}/previews/sample-${String(index + 1).padStart(2, '0')}.${output.extension}`;
        const { error } = await client.storage.from('market-private').upload(path, blob, { upsert: false, contentType: output.mimeType });
        if (error) throw error; uploadedPaths.push(path); sampleStoragePaths.push(path);
      }

      const manifestPath = `${signedInUser.id}/${assetId}/manifest.json`;
      const manifestFile = new Blob([JSON.stringify({ ...provenance, asset_id: assetId, files: packageData.files, preview_storage: { thumbnail: thumbnailStoragePath, samples: sampleStoragePaths } }, null, 2)], { type: 'application/json' });
      const { error: manifestError } = await client.storage.from('market-private').upload(manifestPath, manifestFile, { upsert: false, contentType: 'application/json' });
      if (manifestError) throw manifestError; uploadedPaths.push(manifestPath);
      submissionStep = '送信確定';
      const attachInput = {
        input_asset_id: assetId,
        input_manifest_object_path: manifestPath,
        input_file_object_paths: storedFiles.map((stored) => stored.path),
        input_preview_object_path: thumbnailStoragePath,
        input_sample_preview_paths: sampleStoragePaths
      };
      let attachError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        ({ error: attachError } = await client.rpc('market_attach_listing_package', attachInput));
        if (!attachError) break;
        await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
      }
      if (attachError) throw attachError;

      form.reset(); clearFiles(); selectedOptionIds.clear(); optionPrices.clear(); listingTagValues.length = 0; customOptions = []; limitedOptionPrice = MIN_PAID_PRICE_YEN;
      renderTags(); renderCustomOptions(); renderOptions(); renderOptionPriceFields(); updateLimitedState(); uploadedPaths = [];
      await deleteListingDraft();
      setStatus(aiUsageStatus === 'used' || derivativeContext
        ? '出品を審査へ送りました。確認後に公開されます。'
        : '出品を公開しました。');
    } catch (error) {
      if (!assetId && uploadedPaths.length) await client.storage.from('market-private').remove(uploadedPaths);
      if (assetId) {
        setStatus(`下書きは作成済みです（ID: ${assetId}）。${submissionStep}で応答を確認できませんでした。重複送信はせず、このIDを添えて連絡してください: ${error.message || '通信を確認してください'}`);
      } else {
        setStatus(`出品を作成できませんでした: ${error.message || '通信を確認してください'}`);
      }
    } finally {
      button.disabled = !submissionEnabled;
    }
  }

  async function initRemote() {
    try {
      const access = window.PiXiEEDMarketPageAccess ? await window.PiXiEEDMarketPageAccess.ready : null;
      if (!access?.allowed || !access.client || !access.user) return;
      client = access.client;
      const user = access.user;
      const { data: canSell } = await client.rpc('market_current_user_can_sell');
      if (!canSell) { gate.innerHTML = '出品送信にはメール確認済みのログインが必要です。<a href="../account/index.html">ログイン・確認へ</a>'; return; }
      const { data: options, error: optionError } = await client.from('market_license_options').select('id,label,description,minimum_price_yen,sort_order').eq('active', true).order('sort_order');
      if (optionError) throw optionError;
      optionCatalog = options || FALLBACK_OPTIONS; signedInUser = user;
      if (derivativeModeRequested) await loadDerivativeContext();
      listingDraftKey = `v1:${signedInUser.id}:${derivativeModeRequested ? `${sourceAssetId}:${derivativeLicenseId}` : 'root'}`;
      await restoreListingDraft();
      renderOptions(); renderOptionPriceFields(); updatePrice(); gate.textContent = '商品を作成して審査へ送れます。入力内容とファイルはこの端末に自動保存されます。'; setSubmissionEnabled(true);
    } catch (error) {
      gate.textContent = `ファイルと価格の画面内確認は利用できますが、出品接続を開始できませんでした: ${error.message || '時間をおいて再試行してください'}`;
    }
  }

  bindLocalUi();
  initRemote();
})();
