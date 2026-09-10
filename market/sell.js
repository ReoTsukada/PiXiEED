(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const MAX_FILE_COUNT = 100;
  const MAX_DETECTION_COUNT = 300;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
  const MAX_RASTER_DIMENSION = 512;
  const MAX_SAMPLE_PREVIEWS = 6;
  const PREVIEW_WATERMARK_FONT_SIZE = 16;
  const PREVIEW_WATERMARK_STEP_X = 132;
  const PREVIEW_WATERMARK_STEP_Y = 50;
  const MAX_TAGS = 5;
  const MAX_CUSTOM_OPTIONS = 10;
  const MIN_LISTING_PRICE_YEN = 500;
  const PRICE_STEP_YEN = 100;
  const MAX_LISTING_PRICE_YEN = 99999900;
  const MAX_OPTION_PRICE_YEN = 10000000;
  // The currently deployed public RPC still accepts at most six distinct
  // format IDs. Keep the local picker broader, but stop before a guaranteed
  // server rejection until that RPC contract is migrated.
  const MAX_SERVER_FORMATS = 6;
  const LISTING_DRAFT_DB = 'pixieed-market-listing-drafts';
  const LISTING_DRAFT_STORE = 'drafts';
  const MARKET_TERMS_VERSION = '2026-07-19';
  const MARKET_PRIVACY_VERSION = '2026-07-19';
  const packageUtils = window.PiXiEEDMarketPackage;
  const listingContracts = window.PiXiEEDMarketListingContracts;
  const LISTING_MODES = listingContracts?.MODES || Object.freeze({ SHOWCASE: 'showcase', ACQUIRE: 'acquire' });
  const LISTING_USE_PRESETS = listingContracts?.USE_PRESETS || Object.freeze({ VIEW_ONLY: 'view-only', USE_IN_WORK: 'use-in-work', MODIFY_AND_DERIVE: 'modify-and-derive' });
  const FORMAT_ORDER = ['pixiedraw-project', 'novel-json', 'visual-project', 'text', 'markdown', 'html', 'csv', 'rtf', 'png', 'sprite-sheet-png', 'webp', 'gif', 'apng', 'mp4', 'webm', 'mov', 'm4v', 'ogv', 'aac', 'aiff', 'flac', 'm4a', 'mid', 'midi', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba', 'json'];
  const FORMAT_LABELS = {
    'pixiedraw-project': 'iDRAW（PXD）',
    'novel-json': '小説・世界観（JSON）',
    'visual-project': '画像・動画Project（JSON）',
    text: 'テキスト', markdown: 'Markdown', html: 'HTML', csv: 'CSV', rtf: 'RTF',
    png: 'PNG',
    'sprite-sheet-png': 'PNGスプライトシート',
    webp: 'WebP',
    gif: 'GIF',
    apng: 'APNG',
    mp4: 'MP4動画', webm: 'WebM動画', mov: 'QuickTime動画', m4v: 'M4V動画', ogv: 'Ogg動画',
    aac: 'AAC', aiff: 'AIFF', flac: 'FLAC', m4a: 'M4A', mid: 'MIDI', midi: 'MIDI',
    mp3: 'MP3', oga: 'OGA', ogg: 'OGG', opus: 'Opus', wav: 'WAV', weba: 'WebM Audio', json: 'JSON'
  };
  const RASTER_FORMATS = new Set(['png', 'sprite-sheet-png', 'webp', 'gif', 'apng']);
  const AUDIO_FORMATS = new Set(['aac', 'aiff', 'flac', 'm4a', 'mid', 'midi', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba']);
  const TEXT_FORMATS = new Set(['novel-json', 'visual-project', 'text', 'markdown', 'html', 'csv', 'rtf', 'json']);
  const VIDEO_FORMATS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
  const IMAGE_FORMATS = new Set([...RASTER_FORMATS, 'pixiedraw-project']);
  // The server verifier and the format registry share the complete creator
  // surface: native projects, images, audio, text/world packages, and video.
  const SERVER_SUPPORTED_FORMATS = new Set(FORMAT_ORDER);
  const PACKAGE_COMPOSITIONS = [
    { id: 'image-only', label: '絵のみ', description: '画像・アニメーション形式だけを収録します。' },
    { id: 'audio-only', label: '音楽のみ', description: '音声ファイルだけを収録します。' },
    { id: 'image-audio', label: '絵＋音楽', description: '画像・アニメーションと音声をまとめます。' },
    { id: 'text-only', label: '文章・世界観', description: '小説、世界観、Markdownなどの文章形式だけを収録します。' },
    { id: 'video-only', label: '動画のみ', description: '動画形式だけを収録します。' },
    { id: 'image-video', label: '絵＋動画', description: '画像・アニメーションと動画をまとめます。' },
    { id: 'text-image', label: '文章＋絵', description: '文章・世界観と画像をまとめます。' },
    { id: 'pixiedraw-project', label: 'PXDプロジェクト', description: 'iDRAWで編集できるPXDを収録します。' },
    { id: 'all-files', label: '全ファイル', description: '検出できた対応形式をすべて収録します。' }
  ];
  const FALLBACK_OPTIONS = [
    { id: 'commercial-use', label: '商用・収益化利用', description: 'ゲーム、アプリ、動画、配信、広告などに利用できます。', minimum_price_yen: 0, sort_order: 10 },
    { id: 'merchandise-use', label: 'グッズ・印刷販売', description: 'グッズや印刷物を制作して販売できます。', minimum_price_yen: 0, sort_order: 20 },
    { id: 'credit-omission', label: 'クレジット表記不要', description: '利用時の作者名表記を省略できます。', minimum_price_yen: 0, sort_order: 30 }
  ];
  const pageParams = new URLSearchParams(window.location.search);
  const sourceAssetId = pageParams.get('source_asset_id') || '';
  const derivativeLicenseId = pageParams.get('derivative_license_id') || '';
  const derivativeModeRequested = pageParams.has('source_asset_id') || pageParams.has('derivative_license_id');
  const projectTransferId = pageParams.get('project_transfer') || pageParams.get('creator_transfer') || '';
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
  const tagSuggestionValues = new Map();
  let customOptions = [];
  let limitedOptionPrice = 0;
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
  let productComposition = 'auto';
  let deliveryManifest = null;
  let deliveryManifestBaseline = null;
  let deliveryManifestError = '';
  let acquisitionMode = LISTING_MODES.ACQUIRE;
  let usePreset = LISTING_USE_PRESETS.USE_IN_WORK;

  const setStatus = (value) => { status.textContent = value || ''; };
  const deliveryManifestRuntime = window.PiXiEEDCreatorMarketDeliveryManifest;
  const normalizeDeliveryManifest = (value) => (
    deliveryManifestRuntime && typeof deliveryManifestRuntime.normalize === 'function'
      ? deliveryManifestRuntime.normalize(value)
      : null
  );

  const manifestPath = (entry) => String(entry?.source?.path || entry?.source?.fileName || '').slice(0, 180);
  function syncDeliveryManifestWithEntries(entries = activeEntries()) {
    deliveryManifestError = '';
    if (!entries.length) {
      deliveryManifest = null;
      return true;
    }
    if (!deliveryManifestRuntime || typeof deliveryManifestRuntime.createManifest !== 'function') {
      deliveryManifest = null;
      deliveryManifestError = '販売内容manifestの共通契約を読み込めませんでした。';
      return false;
    }
    const current = deliveryManifest ? normalizeDeliveryManifest(deliveryManifest) : null;
    const baseline = deliveryManifestBaseline ? normalizeDeliveryManifest(deliveryManifestBaseline) : null;
    const base = current || baseline;
    const existingByPath = new Map((current?.entries || []).map((entry) => [manifestPath(entry), entry]));
    (baseline?.entries || []).forEach((entry) => existingByPath.set(manifestPath(entry), entry));
    const usedEntryIds = new Set();
    const manifestEntries = entries.map((entry, index) => {
      const path = String(entry.path || entry.file.name || `file-${index + 1}`).slice(0, 180);
      const existing = existingByPath.get(path);
      let entryId = existing?.entryId || `market-file-${index + 1}`;
      while (usedEntryIds.has(entryId)) entryId = `${entryId}-${index + 1}`;
      usedEntryIds.add(entryId);
      return existing ? {
        ...existing,
        entryId,
        source: {
          ...existing.source,
          path,
          fileName: entry.file.name,
          mimeType: entry.file.type || 'application/octet-stream',
          byteLength: entry.file.size
        }
      } : {
        entryId,
        sourceKind: entry.format === 'pixiedraw-project' ? 'DRAW' : 'EXTERNAL',
        source: { path, fileName: entry.file.name, mimeType: entry.file.type || 'application/octet-stream', byteLength: entry.file.size },
        selection: { kind: entry.format === 'pixiedraw-project' ? 'PROJECT' : 'FILE', label: path, locator: path },
        provenance: { originKind: 'EXTERNAL_FILE', rightsStatus: 'CREATOR_DECLARATION_REQUIRED' },
        capabilities: {},
        dependencyIds: []
      };
    });
    const retainedEntryIds = new Set(manifestEntries.map((entry) => entry.entryId));
    const dependencyCandidates = new Map([
      ...(current?.dependencies || []).map((dependency) => [dependency.dependencyId, dependency]),
      ...(baseline?.dependencies || []).map((dependency) => [dependency.dependencyId, dependency])
    ]);
    const dependencies = [...dependencyCandidates.values()].filter((dependency) => retainedEntryIds.has(dependency.entryId));
    const retainedDependencyIds = new Set(dependencies.map((dependency) => dependency.dependencyId));
    manifestEntries.forEach((entry) => {
      entry.dependencyIds = (entry.dependencyIds || []).filter((dependencyId) => retainedDependencyIds.has(dependencyId));
    });
    const hasExternal = manifestEntries.some((entry) => entry.sourceKind === 'EXTERNAL');
    const hasProjectContent = manifestEntries.some((entry) => entry.sourceKind !== 'EXTERNAL');
    const selectionKind = manifestEntries.length === 1 && manifestEntries[0].selection.kind === 'PROJECT'
      ? 'WHOLE_PROJECT'
      : hasExternal && hasProjectContent
      ? 'MIXED_BUNDLE'
      : hasExternal
        ? 'EXTERNAL_BUNDLE'
        : ['WHOLE_PROJECT', 'TOOL_SET', 'SELECTED_SET'].includes(base?.selectionKind)
          ? base.selectionKind
          : 'TOOL_SET';
    try {
      deliveryManifest = deliveryManifestRuntime.createManifest({
        manifestId: baseline?.manifestId || current?.manifestId,
        selectionKind,
        project: hasProjectContent ? baseline?.project || current?.project || null : null,
        entries: manifestEntries,
        dependencies,
        summary: { labels: baseline?.summary?.labels || current?.summary?.labels || [] },
        createdAt: baseline?.createdAt || current?.createdAt
      });
      return true;
    } catch (error) {
      deliveryManifest = null;
      deliveryManifestError = error instanceof Error ? error.message : '販売内容manifestを作成できませんでした。';
      return false;
    }
  }

  function removeFromDeliveryManifestBaseline(path) {
    const baseline = deliveryManifestBaseline ? normalizeDeliveryManifest(deliveryManifestBaseline) : null;
    if (!baseline) return;
    const removedEntryIds = new Set(baseline.entries.filter((entry) => manifestPath(entry) === String(path).slice(0, 180)).map((entry) => entry.entryId));
    if (!removedEntryIds.size) return;
    const entries = baseline.entries.filter((entry) => !removedEntryIds.has(entry.entryId));
    if (!entries.length) {
      deliveryManifestBaseline = null;
      return;
    }
    const dependencies = baseline.dependencies.filter((dependency) => !removedEntryIds.has(dependency.entryId));
    const dependencyIds = new Set(dependencies.map((dependency) => dependency.dependencyId));
    entries.forEach((entry) => {
      entry.dependencyIds = entry.dependencyIds.filter((dependencyId) => dependencyIds.has(dependencyId));
    });
    try {
      deliveryManifestBaseline = deliveryManifestRuntime.createManifest({ ...baseline, entries, dependencies });
    } catch (_error) {
      deliveryManifestBaseline = null;
    }
  }

  function renderDeliveryManifestSummary() {
    const summaryNode = $('listingDeliverySummary') || document.querySelector('[data-market-delivery-manifest-summary]');
    if (!summaryNode) return;
    if (deliveryManifestError) {
      summaryNode.textContent = `販売内容を確認できません：${deliveryManifestError}`;
      summaryNode.hidden = false;
      return;
    }
    if (!deliveryManifest) {
      summaryNode.textContent = 'まだ販売内容が選択されていません。';
      summaryNode.hidden = false;
      return;
    }
    const projectName = deliveryManifest.project?.name || deliveryManifest.project?.projectId || '外部ファイル';
    const selections = deliveryManifest.entries.map((entry) => entry.selection.label || entry.selection.kind).slice(0, 3).join('、') || '選択内容なし';
    const sourceLabels = { DRAW: 'iDRAW', AUDIO: 'iAUDIO', GAME: 'iGAME', WRITING: '文章・世界観', VISUAL: '画像・動画', EXTERNAL: '外部' };
    const sources = deliveryManifest.summary.sourceKinds.map((kind) => sourceLabels[kind] || kind).join('＋');
    summaryNode.textContent = `販売内容：${projectName}／${selections}${deliveryManifest.entries.length > 3 ? ' ほか' : ''}／${deliveryManifest.entries.length}件${sources ? `／由来：${sources}` : ''}`;
    summaryNode.hidden = false;
  }
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
  const minimumPrice = (value = 0) => Math.ceil(Math.max(0, Number(value) || 0) / PRICE_STEP_YEN) * PRICE_STEP_YEN;
  const normalizedPaidPrice = (value, minimum = 0, maximum = MAX_OPTION_PRICE_YEN) => {
    const floor = minimumPrice(minimum);
    const ceiling = Math.floor(maximum / PRICE_STEP_YEN) * PRICE_STEP_YEN;
    const parsed = integerValue(value);
    if (!Number.isInteger(parsed) || parsed < floor) return floor;
    return Math.min(ceiling, Math.ceil(parsed / PRICE_STEP_YEN) * PRICE_STEP_YEN);
  };
  const normalizedListingPrice = (value, minimum = 0, maximum = MAX_LISTING_PRICE_YEN) => {
    const parsed = integerValue(value);
    if (parsed === 0) return 0;
    return normalizedPaidPrice(value, Math.max(MIN_LISTING_PRICE_YEN, minimum), maximum);
  };
  const isPreviewable = (entry) => entry && Boolean(entry.format) && (
    entry.mediaKind === 'image'
    || (entry.mediaKind === 'project' && entry.previewBlob instanceof Blob)
    || ((entry.mediaKind === 'text' || entry.mediaKind === 'video') && entry.previewBlob instanceof Blob)
  );
  const isRasterEntry = (entry) => RASTER_FORMATS.has(entry?.format);
  const rasterDimensionError = (entry) => {
    const width = Math.max(0, Number(entry?.dimensions?.width) || 0);
    const height = Math.max(0, Number(entry?.dimensions?.height) || 0);
    if (!isRasterEntry(entry)) return '';
    if (!width || !height) return '画像サイズを確認できませんでした。';
    if (width > MAX_RASTER_DIMENSION || height > MAX_RASTER_DIMENSION) {
      return `画像素材は最大${MAX_RASTER_DIMENSION}×${MAX_RASTER_DIMENSION}pxです（${width}×${height}px）。`;
    }
    return '';
  };

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
      checks: Object.fromEntries(['listingLimitedEnabled', 'listingSimpleLimitedEnabled', 'listingDerivativeAllowed', 'listingTermsConfirmed', 'listingPrivacyConfirmed', 'listingRights']
        .map((id) => [id, Boolean($(id)?.checked)])),
      acquisitionMode,
      usePreset,
      simpleLimitedQuantity: $('listingSimpleLimitedQuantity')?.value || '',
      aiUsage: form.querySelector('input[name="listingAiUsage"]:checked')?.value || '',
      files: Array.from(sourceFiles.entries()).map(([path, file]) => ({ path, file })),
      fileOptimizations: Array.from(sourceOptimizations.entries()),
      selectedFormats: Array.from(selectedFormats),
      dismissedFormats: Array.from(dismissedFormats),
      productComposition,
      selectedOptionIds: Array.from(selectedOptionIds),
      optionPrices: Array.from(optionPrices.entries()),
      limitedOptionPrice,
      tags: listingTags(),
      customOptions: customOptions.map((option) => ({ ...option })),
      thumbnailPath,
      samplePreviewPaths: Array.from(samplePreviewPaths),
      previewSelectionTouched,
      ...(deliveryManifest ? { deliveryManifest } : {}),
      ...(deliveryManifestBaseline ? { deliveryManifestBaseline } : {})
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
    acquisitionMode = draft.acquisitionMode === LISTING_MODES.SHOWCASE ? LISTING_MODES.SHOWCASE : LISTING_MODES.ACQUIRE;
    usePreset = Object.values(LISTING_USE_PRESETS).includes(draft.usePreset) ? draft.usePreset : LISTING_USE_PRESETS.USE_IN_WORK;
    const acquisitionRadio = $(acquisitionMode === LISTING_MODES.SHOWCASE ? 'listingAcquisitionShowcase' : 'listingAcquisitionEnabled');
    if (acquisitionRadio) acquisitionRadio.checked = true;
    if ($('listingUsePreset')) $('listingUsePreset').value = usePreset;
    if ($('listingSimpleLimitedEnabled') && draft.simpleLimitedQuantity == null && draft.checks?.listingLimitedEnabled === true) {
      $('listingSimpleLimitedEnabled').checked = true;
    }
    if ($('listingSimpleLimitedQuantity') && draft.simpleLimitedQuantity != null) $('listingSimpleLimitedQuantity').value = String(draft.simpleLimitedQuantity);
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
    productComposition = PACKAGE_COMPOSITIONS.some((option) => option.id === draft.productComposition)
      ? draft.productComposition
      : 'auto';
    selectedOptionIds.clear(); (draft.selectedOptionIds || []).forEach((value) => selectedOptionIds.add(value));
    optionPrices.clear(); (draft.optionPrices || []).forEach(([id, value]) => optionPrices.set(id, Number(value)));
    limitedOptionPrice = 0;
    listingTagValues.splice(0, listingTagValues.length, ...(draft.tags || []).slice(0, MAX_TAGS));
    customOptions = Array.isArray(draft.customOptions)
      ? draft.customOptions.slice(0, MAX_CUSTOM_OPTIONS).map((option) => ({
        ...option,
        price_yen: 0
      }))
      : [];
    thumbnailPath = String(draft.thumbnailPath || '');
    samplePreviewPaths.clear(); (draft.samplePreviewPaths || []).forEach((value) => samplePreviewPaths.add(value));
    previewSelectionTouched = Boolean(draft.previewSelectionTouched);
    deliveryManifestError = '';
    const savedManifest = draft.deliveryManifest ?? null;
    const savedBaseline = draft.deliveryManifestBaseline ?? savedManifest;
    deliveryManifest = savedManifest ? normalizeDeliveryManifest(savedManifest) : null;
    deliveryManifestBaseline = savedBaseline ? normalizeDeliveryManifest(savedBaseline) : null;
    if (savedManifest && !deliveryManifest) {
      deliveryManifestError = '保存された販売内容manifestを確認できません。ファイルを選び直してください。';
    }
    customOptions = []; renderTags(); updateLimitedState(); renderOptions(); updatePrice();
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

  function currentListingPolicy() {
    const mode = acquisitionMode === LISTING_MODES.SHOWCASE ? LISTING_MODES.SHOWCASE : LISTING_MODES.ACQUIRE;
    const simpleLimited = Boolean($('listingSimpleLimitedEnabled')?.checked);
    const participants = Array.isArray(deliveryManifest?.participants)
      ? deliveryManifest.participants
      : Array.isArray(deliveryManifest?.contributors)
        ? deliveryManifest.contributors
        : [];
    if (listingContracts?.buildListingPolicy) {
      return listingContracts.buildListingPolicy({
        mode,
        priceYen: mode === LISTING_MODES.ACQUIRE ? $('listingPrice')?.value : 0,
        usePreset,
        derivativeSalesAllowed: usePreset === LISTING_USE_PRESETS.MODIFY_AND_DERIVE,
        limited: simpleLimited,
        limitedQuantity: $('listingSimpleLimitedQuantity')?.value,
        ownerAccountId: signedInUser?.id || 'seller',
        participants
      });
    }
    return {
      schema: 'pixieed-listing-policy/v1',
      mode,
      acquisitionEnabled: mode === LISTING_MODES.ACQUIRE,
      priceYen: mode === LISTING_MODES.ACQUIRE ? normalizedListingPrice($('listingPrice')?.value, 0, MAX_LISTING_PRICE_YEN) : 0,
      usePreset,
      derivativeSalesAllowed: usePreset === LISTING_USE_PRESETS.MODIFY_AND_DERIVE,
      participants: [{ accountId: signedInUser?.id || 'seller', role: 'owner', explicit: true, accepted: true, revenueShareBps: 10000 }],
      limited: { enabled: simpleLimited && mode === LISTING_MODES.ACQUIRE, quantity: integerValue($('listingSimpleLimitedQuantity')?.value) || null }
    };
  }

  function renderParticipantSummary(policy = currentListingPolicy()) {
    const list = $('listingParticipantList');
    if (!list) return;
    const participants = Array.isArray(policy?.participants) ? policy.participants : [];
    list.replaceChildren(...(participants.length ? participants : [{ role: 'owner', displayName: '出品者' }]).map((participant) => {
      const item = document.createElement('li');
      item.textContent = participant.role === 'owner' ? '出品者' : (participant.displayName || participant.accountId || '明示された参加者');
      return item;
    }));
  }

  function applyUsePreset() {
    if (derivativeContext) {
      usePreset = LISTING_USE_PRESETS.MODIFY_AND_DERIVE;
      $('listingUsePreset').value = usePreset;
      $('listingDerivativeAllowed').checked = true;
      renderOptions();
      return;
    }
    usePreset = Object.values(LISTING_USE_PRESETS).includes($('listingUsePreset')?.value)
      ? $('listingUsePreset').value
      : LISTING_USE_PRESETS.USE_IN_WORK;
    selectedOptionIds.clear();
    if (usePreset !== LISTING_USE_PRESETS.VIEW_ONLY && acquisitionMode === LISTING_MODES.ACQUIRE) {
      const commercial = optionCatalog.find((option) => option.id === 'commercial-use');
      const game = optionCatalog.find((option) => option.id === 'game-app-use');
      if (commercial) selectedOptionIds.add(commercial.id);
      else if (game) selectedOptionIds.add(game.id);
    }
    $('listingDerivativeAllowed').checked = usePreset === LISTING_USE_PRESETS.MODIFY_AND_DERIVE;
    renderOptions();
  }

  function syncSimplePolicyUi({ applyPreset: shouldApplyPreset = false } = {}) {
    acquisitionMode = $('listingAcquisitionShowcase')?.checked ? LISTING_MODES.SHOWCASE : LISTING_MODES.ACQUIRE;
    if (shouldApplyPreset) applyUsePreset();
    const enabled = acquisitionMode === LISTING_MODES.ACQUIRE;
    const fields = $('listingAcquisitionFields');
    const price = $('listingPrice');
    const preset = $('listingUsePreset');
    if (fields) fields.hidden = !enabled;
    if (price) {
      price.disabled = !enabled;
      price.required = false;
      if (!enabled) price.value = '0';
    }
    if (preset) preset.disabled = !enabled || Boolean(derivativeContext);
    const simpleLimited = $('listingSimpleLimitedEnabled');
    if (simpleLimited && (!enabled || Number(integerValue(price?.value) || 0) <= 0)) simpleLimited.checked = false;
    const limitedEnabled = enabled && Number(integerValue(price?.value) || 0) > 0 && Boolean(simpleLimited?.checked);
    if ($('listingLimitedEnabled')) $('listingLimitedEnabled').checked = limitedEnabled;
    if ($('listingLimitedQuantity') && $('listingSimpleLimitedQuantity')) $('listingLimitedQuantity').value = $('listingSimpleLimitedQuantity').value;
    if ($('listingSimpleLimitedQuantityField')) $('listingSimpleLimitedQuantityField').hidden = !limitedEnabled;
    if ($('listingSimpleLimitedQuantity')) $('listingSimpleLimitedQuantity').required = limitedEnabled;
    if ($('listingLimitedQuantityField')) $('listingLimitedQuantityField').hidden = true;
    const policy = currentListingPolicy();
    const summary = $('listingPolicySummary');
    if (summary) {
      if (!policy.acquisitionEnabled) summary.textContent = '公開のみです。購入・無料取得・iGAMEでの取得はできません。';
      else if (policy.usePreset === LISTING_USE_PRESETS.MODIFY_AND_DERIVE) summary.textContent = `${yen(policy.priceYen)}で取得できます。加工と派生作品への利用が可能です。`;
      else if (policy.usePreset === LISTING_USE_PRESETS.VIEW_ONLY) summary.textContent = `${yen(policy.priceYen)}で閲覧・保存できます。作品への利用や再販売は許可しません。`;
      else summary.textContent = `${yen(policy.priceYen)}で取得できます。作品やゲームで使えます。`;
    }
    renderParticipantSummary(policy);
    updatePrice();
  }

  function updatePrice() {
    const salePrice = Math.max(0, integerValue($('listingPrice').value) || 0);
    $('listingLimitedPriceLabel').textContent = '価格に含む';
  }

  function normalizePriceInput(input, minimum = 0, maximum = MAX_OPTION_PRICE_YEN) {
    const value = maximum === MAX_LISTING_PRICE_YEN
      ? normalizedListingPrice(input.value, minimum, maximum)
      : normalizedPaidPrice(input.value, minimum, maximum);
    input.value = String(value);
    input.setCustomValidity('');
    return value;
  }

  function populatePricePresets() {
    const appendValues = (list, maximum) => {
      const values = maximum === MAX_LISTING_PRICE_YEN ? [0] : [];
      for (let value = MIN_LISTING_PRICE_YEN; value <= 10000; value += PRICE_STEP_YEN) values.push(value);
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

  let tagSuggestionTimer = 0;
  async function updateTagSuggestions() {
    const input = $('listingTagInput');
    const query = normalizedTag(input.value);
    if (!client || !query) {
      $('listingTagSuggestions').replaceChildren();
      return;
    }
    const { data, error } = await client.rpc('market_tag_suggestions_v1', {
      input_query: query, input_limit: 12
    });
    if (error || input.value !== query) return;
    tagSuggestionValues.clear();
    const values = (Array.isArray(data) ? data : [])
      .map((row) => normalizedTag(row?.tag))
      .filter(Boolean)
      .filter((tag, index, all) => all.indexOf(tag) === index);
    values.forEach((tag) => tagSuggestionValues.set(tag.toLowerCase(), tag));
    $('listingTagSuggestions').replaceChildren(...values.map((tag) => Object.assign(document.createElement('option'), { value: tag })));
  }

  function scheduleTagSuggestions() {
    window.clearTimeout(tagSuggestionTimer);
    tagSuggestionTimer = window.setTimeout(() => { void updateTagSuggestions(); }, 140);
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
    const typed = normalizedTag(input.value);
    const tag = tagSuggestionValues.get(typed.toLowerCase()) || typed;
    if (!tag) return;
    if (Array.from(tag).length > 24) { setStatus('タグは1個24文字以内です。'); return; }
    if (listingTagValues.some((value) => value.toLowerCase() === tag.toLowerCase())) { input.value = ''; return; }
    if (listingTagValues.length >= MAX_TAGS) { setStatus('タグは最大5個です。'); return; }
    listingTagValues.push(tag); input.value = ''; $('listingTagSuggestions').replaceChildren(); renderTags(); scheduleListingDraftSave();
  }

  function updateLimitedState() {
    const enabled = Boolean($('listingSimpleLimitedEnabled')?.checked)
      && acquisitionMode === LISTING_MODES.ACQUIRE
      && Number(integerValue($('listingPrice')?.value) || 0) > 0;
    if ($('listingLimitedEnabled')) $('listingLimitedEnabled').checked = enabled;
    if ($('listingLimitedQuantity') && $('listingSimpleLimitedQuantity')) $('listingLimitedQuantity').value = $('listingSimpleLimitedQuantity').value;
    if ($('listingLimitedQuantityField')) $('listingLimitedQuantityField').hidden = true;
    if ($('listingSimpleLimitedQuantityField')) $('listingSimpleLimitedQuantityField').hidden = !enabled;
    if ($('listingLimitedQuantity')) $('listingLimitedQuantity').required = false;
    if ($('listingSimpleLimitedQuantity')) $('listingSimpleLimitedQuantity').required = enabled;
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
    $('listingAcquisitionEnabled').checked = true;
    $('listingAcquisitionShowcase').disabled = true;
    $('listingUsePreset').value = LISTING_USE_PRESETS.MODIFY_AND_DERIVE;
    usePreset = LISTING_USE_PRESETS.MODIFY_AND_DERIVE;
    $('listingPrice').min = String(Math.max(MIN_LISTING_PRICE_YEN, minimumPrice(context.minimum_seller_price_yen)));
    if (Number($('listingPrice').value) < Number($('listingPrice').min)) $('listingPrice').value = $('listingPrice').min;
    $('listingOptionsTitle').textContent = '継承される利用オプション';
    document.querySelector('.market-titlebar h1').textContent = '派生作品を出品';
    renderOptions(); renderOptionPriceFields(); updatePrice(); syncSimplePolicyUi({ applyPreset: true });
    return derivativeContext;
  }

  function syncOptionPrices() {
    const validIds = new Set(optionCatalog.map((option) => option.id));
    Array.from(optionPrices.keys()).forEach((id) => { if (!validIds.has(id)) optionPrices.delete(id); });
    optionCatalog.forEach((option) => {
      optionPrices.set(option.id, 0);
    });
  }

  function optionPriceFor(option) {
    return 0;
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
      meta: '価格に含む',
      checked: selectedOptionIds.has(option.id),
      disabled: Boolean(derivativeContext),
      onChange: (checked) => {
        if (checked) selectedOptionIds.add(option.id); else selectedOptionIds.delete(option.id);
        updatePrice(); scheduleListingDraftSave();
      }
    })));
  }

  function renderOptionPriceFields() {}

  function activeEntries() {
    return detectedEntries.filter((entry) => selectedFormats.has(entry.format));
  }

  function inferredComposition() {
    const entries = activeEntries();
    if (!entries.length) return 'image-only';
    if (entries.every((entry) => entry.format === 'pixiedraw-project')) return 'pixiedraw-project';
    const kinds = new Set(entries.map((entry) => entry.mediaKind));
    const hasImage = kinds.has('image');
    const hasAudio = kinds.has('audio');
    const hasText = kinds.has('text');
    const hasVideo = kinds.has('video');
    if (hasAudio && hasImage && kinds.size === 2) return 'image-audio';
    if (hasText && hasImage && kinds.size === 2) return 'text-image';
    if (hasVideo && hasImage && kinds.size === 2) return 'image-video';
    if (hasAudio && kinds.size === 1) return 'audio-only';
    if (hasText && kinds.size === 1) return 'text-only';
    if (hasVideo && kinds.size === 1) return 'video-only';
    if (hasImage && kinds.size === 1) return 'image-only';
    return 'all-files';
  }

  function effectiveComposition() {
    return productComposition === 'auto' ? inferredComposition() : productComposition;
  }

  function compositionOption(id) {
    return PACKAGE_COMPOSITIONS.find((option) => option.id === id) || PACKAGE_COMPOSITIONS[0];
  }

  function renderPackageComposition() {
    const container = $('listingPackageComposition');
    if (!container) return;
    const hasImage = detectedEntries.some((entry) => entry.mediaKind === 'image' && entry.format);
    const hasProject = detectedEntries.some((entry) => entry.mediaKind === 'project' && entry.format);
    const hasAudio = detectedEntries.some((entry) => entry.mediaKind === 'audio');
    const hasText = detectedEntries.some((entry) => entry.mediaKind === 'text');
    const hasVideo = detectedEntries.some((entry) => entry.mediaKind === 'video');
    const allFilesSupported = detectedEntries.length > 0 && detectedEntries.every((entry) => Boolean(entry.format));
    const mediaKinds = new Set(detectedEntries.filter((entry) => entry.format).map((entry) => entry.mediaKind));
    const current = effectiveComposition();
    container.replaceChildren(...PACKAGE_COMPOSITIONS.map((option) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'market-composition-option';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'listingProductComposition'; input.value = option.id;
      const available = option.id === 'image-only' ? hasImage
        : option.id === 'audio-only' ? hasAudio
          : option.id === 'image-audio' ? hasImage && hasAudio && mediaKinds.size === 2
            : option.id === 'text-only' ? hasText
              : option.id === 'video-only' ? hasVideo
                : option.id === 'image-video' ? hasImage && hasVideo && mediaKinds.size === 2
                  : option.id === 'text-image' ? hasText && hasImage && mediaKinds.size === 2
                    : option.id === 'pixiedraw-project' ? hasProject && detectedEntries.filter((entry) => entry.format).every((entry) => entry.format === 'pixiedraw-project')
                      : option.id === 'all-files' ? allFilesSupported
          : false;
      input.disabled = !available;
      input.checked = current === option.id && available;
      const text = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = option.label;
      const description = document.createElement('span'); description.textContent = option.description;
      text.append(title, description); wrapper.append(input, text);
      const note = document.createElement('small');
      if (!available) {
        note.textContent = '対応ファイルがありません';
      }
      if (note.textContent) wrapper.append(note);
      input.addEventListener('change', () => {
        if (!input.checked) return;
        productComposition = option.id;
        if (option.id === 'image-only') {
          selectedFormats.clear();
          detectedEntries.filter((entry) => entry.format && entry.mediaKind === 'image').forEach((entry) => selectedFormats.add(entry.format));
        } else if (option.id === 'audio-only') {
          selectedFormats.clear();
          detectedEntries.filter((entry) => entry.format && entry.mediaKind === 'audio').forEach((entry) => selectedFormats.add(entry.format));
        } else if (option.id === 'image-audio') {
          selectedFormats.clear();
          detectedEntries.filter((entry) => entry.format && (entry.mediaKind === 'image' || entry.mediaKind === 'audio')).forEach((entry) => selectedFormats.add(entry.format));
        } else if (option.id === 'text-only') {
          selectedFormats.clear();
          detectedEntries.filter((entry) => entry.format && entry.mediaKind === 'text').forEach((entry) => selectedFormats.add(entry.format));
        } else if (option.id === 'video-only') {
          selectedFormats.clear();
          detectedEntries.filter((entry) => entry.format && entry.mediaKind === 'video').forEach((entry) => selectedFormats.add(entry.format));
        } else if (option.id === 'image-video') {
          selectedFormats.clear();
          detectedEntries.filter((entry) => entry.format && (entry.mediaKind === 'image' || entry.mediaKind === 'video')).forEach((entry) => selectedFormats.add(entry.format));
        } else if (option.id === 'text-image') {
          selectedFormats.clear();
          detectedEntries.filter((entry) => entry.format && (entry.mediaKind === 'text' || entry.mediaKind === 'image')).forEach((entry) => selectedFormats.add(entry.format));
        } else if (option.id === 'pixiedraw-project') {
          selectedFormats.clear(); selectedFormats.add('pixiedraw-project');
        } else if (option.id === 'all-files') {
          selectedFormats.clear(); detectedEntries.filter((entry) => entry.format).forEach((entry) => selectedFormats.add(entry.format));
        }
        renderFormats(); scheduleListingDraftSave();
      });
      return wrapper;
    }));
    const statusNode = $('listingCompositionStatus');
    if (statusNode) statusNode.textContent = hasAudio
      ? '音声形式も購入後にZIPで受け取れます。音声はiAUDIOの素材として利用できます。'
      : '構成は1つ、形式スイッチは複数選択できます。';
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
    syncDeliveryManifestWithEntries(entries);
    renderDeliveryManifestSummary();
    const activeBytes = entries.reduce((total, entry) => total + entry.file.size, 0);
    const suffix = ignoredFileCount ? `／未対応 ${ignoredFileCount}件は現在出品対象外` : '';
    $('listingFileSummary').textContent = detectedEntries.length
      ? `${detectedEntries.length}件追加・対応 ${entries.length}件を出品・${fileSize(activeBytes)}${suffix}`
      : `ファイルまたはフォルダを追加してください。${suffix}`;
    $('listingFileList').replaceChildren(...detectedEntries.slice(0, 12).map((entry) => {
      const row = document.createElement('div');
      row.className = `market-file-row${entry.format ? (selectedFormats.has(entry.format) ? '' : ' is-excluded') : ' is-unsupported'}`;
      const name = document.createElement('span'); name.textContent = entry.path;
      const format = document.createElement('b'); format.textContent = entry.format
        ? FORMAT_LABELS[entry.format]
        : (entry.rejectionReason || '未対応');
      const size = document.createElement('small');
      size.textContent = entry.optimization
        ? `${fileSize(entry.file.size)}・${entry.optimization.integer_scale_factor}倍縮小済み`
        : fileSize(entry.file.size);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'market-file-row__remove';
      remove.textContent = '外す';
      remove.setAttribute('aria-label', `${entry.path} を出品ファイルから外す`);
      remove.addEventListener('click', async () => {
        removeFromDeliveryManifestBaseline(entry.path);
        sourceFiles.delete(entry.path);
        sourceOptimizations.delete(entry.path);
        await refreshDetectedFiles();
        scheduleListingDraftSave();
      });
      row.append(name, format, size, remove); return row;
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
        productComposition = 'auto';
        updateProductType(); renderFiles(); renderPreviews(); scheduleListingDraftSave();
      }
    })));
    if (!formats.length) {
      const empty = document.createElement('p'); empty.className = 'helper'; empty.textContent = '対応形式はまだ検出されていません。';
      $('listingFormatSwitches').append(empty);
    }
    updateProductType(); renderFiles(); renderPreviews(); renderPackageComposition();
  }

  function updateProductType() {
    if (!selectedFormats.size) {
      $('listingProductType').textContent = '商品種類はファイル追加後に自動判定されます。';
      $('listingProductType').className = 'market-product-type-preview';
      return;
    }
    const pixieeDraw = selectedFormats.has('pixiedraw-project');
    const composition = compositionOption(effectiveComposition());
    $('listingProductType').textContent = pixieeDraw
      ? `${composition.label}：編集用プロジェクトを含み、購入後にiDRAWで開けます。`
      : `${composition.label}：購入後に選択した形式をZIPで受け取る商品です。`;
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
      const dimensions = RASTER_FORMATS.has(format)
        ? await packageUtils.readRasterDimensions(file)
        : null;
      const rejectionReason = RASTER_FORMATS.has(format)
        ? rasterDimensionError({ format, dimensions })
        : '';
      const acceptedFormat = rejectionReason ? null : format;
      const mediaKind = packageUtils.detectMediaKind(file, acceptedFormat);
      let previewBlob = acceptedFormat === 'pixiedraw-project'
        ? await packageUtils.extractPixieeDrawPreviewPng(file)
        : null;
      if (acceptedFormat && mediaKind === 'text') {
        try { previewBlob = await createTextPreviewBlob(file); } catch (_error) { previewBlob = null; }
      } else if (acceptedFormat && mediaKind === 'video') {
        try { previewBlob = await createVideoPreviewBlob(file); } catch (_error) { previewBlob = null; }
      }
      detected.push({ path, file, format: acceptedFormat, mediaKind, previewBlob, optimization, dimensions, rejectionReason });
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
    const oversizedRasterEntries = detected.filter((entry) => entry.rejectionReason).length;
    setStatus([
      optimizationMessages.length ? `GIFをアップロード前に1px単位へ適正化しました。${optimizationMessages.join(' ')}` : '',
      ...optimizationWarnings,
      ignoredFileCount ? `未対応形式 ${ignoredFileCount}件は一覧に残していますが、現在の出品には含まれません。` : '',
      oversizedRasterEntries ? `512×512pxを超える画像素材 ${oversizedRasterEntries}件は出品に含められません。` : '',
      previewlessProjectCount ? `旧形式などPNGサムネイルを含まないiDRAW ${previewlessProjectCount}件はプレビューを生成できませんでした。` : ''
    ].filter(Boolean).join(' '));
  }

  async function addFiles(additions) {
    const normalized = Array.from(additions || []).map((item) => item?.file ? item : { file: item, path: filePath(item) })
      .map((item) => {
        if (!(item.file instanceof Blob)) return null;
        const file = item.file instanceof File
          ? item.file
          : new File([item.file], item.path || 'asset.bin', { type: item.file.type || 'application/octet-stream' });
        return { file, path: item.path || filePath(file) };
      })
      .filter(Boolean);
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
    productComposition = 'auto';
    deliveryManifest = null;
    deliveryManifestBaseline = null;
    deliveryManifestError = '';
    renderDeliveryManifestSummary();
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

  function drawPreviewWatermark(context, width, height) {
    // 画像サイズに合わせて文字を縮めると、16pxなどの小さなドット絵では
    // 透かし自体がピクセル化して作品を荒らす。公開プレビューの出力解像度と
    // 透かしの文字・間隔を固定し、表示する作品だけをニアレストネイバーで拡大する。
    const fontSize = PREVIEW_WATERMARK_FONT_SIZE;
    const label = 'PiXiEED SAMPLE';
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(-Math.PI / 10);
    context.font = `800 ${fontSize}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const labelWidth = context.measureText(label).width;
    const stepX = Math.max(labelWidth + fontSize * 1.5, PREVIEW_WATERMARK_STEP_X);
    const stepY = PREVIEW_WATERMARK_STEP_Y;
    const diagonal = Math.ceil(Math.hypot(width, height));
    context.lineWidth = Math.max(1, fontSize / 14);
    context.strokeStyle = 'rgba(0,0,0,.22)';
    context.fillStyle = 'rgba(255,255,255,.26)';
    for (let y = -diagonal; y <= diagonal; y += stepY) {
      const offset = Math.round((y / stepY)) % 2 ? stepX / 2 : 0;
      for (let x = -diagonal - stepX; x <= diagonal + stepX; x += stepX) {
        context.strokeText(label, x + offset, y);
        context.fillText(label, x + offset, y);
      }
    }
    context.restore();
  }

  function canvasBlob(canvas, mimeType = 'image/webp') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('preview conversion failed')), mimeType, .88);
    });
  }

  async function createTextPreviewBlob(file, { watermark = false } = {}) {
    const source = await file.text();
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#10182c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#e5f2ff';
    context.font = '600 24px sans-serif';
    context.fillText(String(file.name || 'Text Work').slice(0, 48), 42, 54);
    context.font = '18px sans-serif';
    context.fillStyle = '#aabbd0';
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const visible = [];
    for (const line of lines) {
      let remaining = line || ' ';
      while (remaining.length > 78) {
        visible.push(remaining.slice(0, 78));
        remaining = remaining.slice(78);
      }
      visible.push(remaining);
      if (visible.length >= 18) break;
    }
    visible.slice(0, 18).forEach((line, index) => context.fillText(line, 42, 96 + index * 24));
    if (watermark) drawPreviewWatermark(context, canvas.width, canvas.height);
    return canvasBlob(canvas);
  }

  async function createVideoPreviewBlob(file, { watermark = false } = {}) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    try {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('video preview unavailable'));
      });
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      await new Promise((resolve) => {
        if (!duration) { resolve(); return; }
        let timer = 0;
        const finish = () => {
          video.removeEventListener('seeked', finish);
          if (timer) window.clearTimeout(timer);
          resolve();
        };
        video.addEventListener('seeked', finish, { once: true });
        timer = window.setTimeout(finish, 1800);
        try { video.currentTime = Math.min(duration / 2, 0.25); } catch (_error) { finish(); }
      });
      const sourceWidth = Math.max(1, video.videoWidth || 960);
      const sourceHeight = Math.max(1, video.videoHeight || 540);
      const scale = 960 / Math.max(sourceWidth, sourceHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#10182c';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (watermark) drawPreviewWatermark(context, canvas.width, canvas.height);
      return canvasBlob(canvas);
    } finally {
      video.pause();
      video.removeAttribute('src');
      URL.revokeObjectURL(url);
    }
  }

  async function createPreviewBlob(file, { thumbnail = false, watermark = thumbnail, mimeType = 'image/webp' } = {}) {
    const source = await loadImageSource(file);
    try {
      const sourceWidth = source.width || source.naturalWidth;
      const sourceHeight = source.height || source.naturalHeight;
      const maxSide = thumbnail ? 640 : 960;
      // 小さい素材も公開プレビューでは一定の解像度まで拡大する。
      // 元絵の補間はしないため、ドットはくっきり保たれる。
      const scale = maxSide / Math.max(sourceWidth, sourceHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { alpha: true });
      context.imageSmoothingEnabled = false;
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      // サムネイルだけは画像に焼き込む。試聴はドット絵の拡大後にビューアへ
      // 固定サイズで重ねるため、素材データへは透かしを含めない。
      if (watermark) drawPreviewWatermark(context, canvas.width, canvas.height);
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
    renderOptions(); renderFormats(); syncSimplePolicyUi({ applyPreset: true }); updateLimitedState(); setSubmissionEnabled(false);
    renderTags(); renderDeliveryManifestSummary();
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
    $('listingPrice').addEventListener('input', () => { syncSimplePolicyUi(); updateLimitedState(); scheduleListingDraftSave(); });
    $('listingPrice').addEventListener('change', () => {
      const minimum = Number.isFinite(Number($('listingPrice').min)) ? Number($('listingPrice').min) : 0;
      normalizePriceInput($('listingPrice'), minimum, MAX_LISTING_PRICE_YEN);
      syncSimplePolicyUi(); updateLimitedState(); scheduleListingDraftSave();
    });
    ['listingAcquisitionShowcase', 'listingAcquisitionEnabled'].forEach((id) => $(id).addEventListener('change', () => {
      syncSimplePolicyUi({ applyPreset: true }); updateLimitedState(); scheduleListingDraftSave();
    }));
    $('listingUsePreset').addEventListener('change', () => { usePreset = $('listingUsePreset').value; applyUsePreset(); syncSimplePolicyUi(); scheduleListingDraftSave(); });
    $('listingSimpleLimitedEnabled').addEventListener('change', () => { updateLimitedState(); syncSimplePolicyUi(); scheduleListingDraftSave(); });
    $('listingSimpleLimitedQuantity').addEventListener('input', () => { updateLimitedState(); scheduleListingDraftSave(); });
    $('listingLimitedEnabled').addEventListener('change', () => { updateLimitedState(); scheduleListingDraftSave(); });
    $('listingLimitedQuantity').addEventListener('input', () => { updatePrice(); scheduleListingDraftSave(); });
    $('listingTagAdd').addEventListener('click', addTag);
    $('listingTagInput').addEventListener('input', scheduleTagSuggestions);
    $('listingTagInput').addEventListener('change', scheduleTagSuggestions);
    $('listingTagInput').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ',' && event.key !== '、') return;
      event.preventDefault(); addTag();
    });
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

  async function consumePixieeDrawProjectTransfer() {
    if (!projectTransferId || !window.indexedDB) return false;
    const transfer = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieed-market-project-transfers', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('transfers')) {
          request.result.createObjectStore('transfers', { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error || new Error('販売用PXDを読み出せませんでした'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('transfers', 'readonly');
        const store = transaction.objectStore('transfers');
        const getRequest = store.get(projectTransferId);
        getRequest.onsuccess = () => {
          const value = getRequest.result || null;
          database.close();
          resolve(value);
        };
        getRequest.onerror = () => { database.close(); reject(getRequest.error || new Error('販売用PXDを読み出せませんでした')); };
        transaction.onerror = () => { database.close(); reject(transaction.error || new Error('販売用PXDを削除できませんでした')); };
      };
    });
    const transferFiles = Array.isArray(transfer?.files) && transfer.files.length
      ? transfer.files
      : transfer?.file ? [{ file: transfer.file, path: transfer.file.name }] : [];
    const expiresAt = Number(transfer?.expiresAt);
    if (!transferFiles.length || transferFiles.some((entry) => !(entry?.file instanceof Blob)) || (Number.isFinite(expiresAt) && expiresAt < Date.now())) {
      setStatus('Creator Appからの引き継ぎ期限が切れました。制作画面からもう一度「Marketへ出品」を押してください。');
      return false;
    }
    const transferredManifest = transfer?.deliveryManifest || transfer?.delivery_manifest || transfer?.metadata?.deliveryManifest || transfer?.metadata?.delivery_manifest;
    if (transferredManifest !== undefined && transferredManifest !== null) {
      deliveryManifest = normalizeDeliveryManifest(transferredManifest);
      if (!deliveryManifest) {
        deliveryManifestError = 'Creator Appから受け取った販売内容manifestの由来・依存関係を確認できません。';
        renderDeliveryManifestSummary();
        setStatus('販売内容manifestを安全に確認できなかったため、引き継ぎを停止しました。制作画面からもう一度やり直してください。');
        return false;
      }
      deliveryManifestBaseline = deliveryManifest;
    }
    await addFiles(transferFiles);
    // 取込に成功してから削除する。後片付けに失敗しても、取込済みの画面を
    // エラー扱いにせず、短いTTL後に自然失効させる。
    await deleteProjectTransfer(projectTransferId).catch(() => {});
    const firstFile = transferFiles[0].file;
    if (!$('listingTitle').value.trim()) $('listingTitle').value = String(firstFile.name || 'creator-work').replace(/\.(?:pxd|pixieedraw|pxdraw|json|md|markdown|txt)$/i, '');
    const transferKind = String(transfer?.metadata?.kind || 'draw').toLowerCase();
    const handoffLabel = transferKind === 'writing' ? '文章・世界観'
      : transferKind === 'visual' ? '画像・動画'
        : 'iDRAW';
    setStatus(`${handoffLabel}の制作結果を受け取りました。販売する形式と購入前プレビューを確認できます。`);
    window.history.replaceState({}, '', `${location.pathname}${location.hash}`);
    return true;
  }

  async function deleteProjectTransfer(transferId) {
    if (!transferId || !window.indexedDB) return;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieed-market-project-transfers', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('transfers')) {
          request.result.createObjectStore('transfers', { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error || new Error('販売用引き渡しの後片付けに失敗しました'));
      request.onsuccess = () => {
        const database = request.result;
        let transaction;
        try {
          transaction = database.transaction('transfers', 'readwrite');
          transaction.objectStore('transfers').delete(transferId);
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => { database.close(); reject(transaction.error || new Error('販売用引き渡しの後片付けに失敗しました')); };
          transaction.onabort = () => { database.close(); reject(transaction.error || new Error('販売用引き渡しの後片付けが中断されました')); };
        } catch (error) {
          database.close();
          reject(error);
        }
      };
    });
  }

  async function submitListing(event) {
    event.preventDefault();
    syncSimplePolicyUi({ applyPreset: true });
    const salePriceMinimum = Number.isFinite(Number($('listingPrice').min)) ? Number($('listingPrice').min) : 0;
    normalizePriceInput($('listingPrice'), salePriceMinimum, MAX_LISTING_PRICE_YEN);
    optionCatalog.forEach((option) => {
      if (selectedOptionIds.has(option.id)) optionPrices.set(option.id, 0);
    });
    customOptions = [];
    limitedOptionPrice = 0;
    if (!form.reportValidity()) {
      setStatus('必須項目と確認欄をすべて入力してください。'); return;
    }
    const listingPolicy = currentListingPolicy();
    const policyErrors = listingContracts?.validateListingPolicy ? listingContracts.validateListingPolicy(listingPolicy) : [];
    if (policyErrors.length) {
      setStatus(policyErrors[0]); return;
    }
    if (!submissionEnabled || !client || !signedInUser) {
      setStatus('出品送信にはHTTPで開き、ログインと販売者確認を完了してください。'); return;
    }
    const entries = activeEntries();
    if (!entries.length) { setStatus('出品する形式を1つ以上ONにしてください。'); return; }
    if (!syncDeliveryManifestWithEntries(entries)) {
      renderDeliveryManifestSummary();
      setStatus(`販売内容manifestを確定できません: ${deliveryManifestError || '販売内容を選び直してください。'}`);
      return;
    }
    const verificationRequiredEntries = deliveryManifest.entries.filter((entry) => entry.provenance.rightsStatus === 'SERVER_VERIFICATION_REQUIRED');
    const derivativeSourceVerified = derivativeContext && verificationRequiredEntries.length > 0
      && verificationRequiredEntries.every((entry) => entry.source.assetId === sourceAssetId);
    if (verificationRequiredEntries.length && !derivativeSourceVerified) {
      setStatus('購入Assetなどサーバー確認が必要な内容を含むため、この出品経路では送信できません。対象商品の「派生作品を出品」から開き直してください。');
      return;
    }
    const invalidRaster = entries.find((entry) => rasterDimensionError(entry));
    if (invalidRaster) { setStatus(`${invalidRaster.path}: ${rasterDimensionError(invalidRaster)}`); return; }
    if (entries.length > MAX_FILE_COUNT) { setStatus(`ファイルは${MAX_FILE_COUNT}件までです。`); return; }
    const totalBytes = entries.reduce((total, entry) => total + entry.file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) { setStatus('1商品の合計ファイルサイズは50MBまでです。'); return; }
    const formats = FORMAT_ORDER.filter((format) => selectedFormats.has(format) && entries.some((entry) => entry.format === format));
    const serverUnsupportedFormats = formats.filter((format) => !SERVER_SUPPORTED_FORMATS.has(format));
    if (serverUnsupportedFormats.length) {
      setStatus(`この制作結果はローカルPackageとして準備済みですが、現在のMarketサーバーは${serverUnsupportedFormats.map((format) => FORMAT_LABELS[format] || format).join('、')}の出品に未対応です。サーバー対応後に再送信できます。`);
      return;
    }
    if (formats.length > MAX_SERVER_FORMATS) {
      setStatus(`現在のMarketサーバーは1商品につき形式を${MAX_SERVER_FORMATS}種類まで受け付けます。形式スイッチを${MAX_SERVER_FORMATS}種類以内にしてください。`);
      return;
    }
    const composition = effectiveComposition();
    const activeKinds = new Set(entries.map((entry) => entry.mediaKind));
    const onlyKinds = (...kinds) => entries.length > 0 && entries.every((entry) => kinds.includes(entry.mediaKind));
    const hasKind = (kind) => entries.some((entry) => entry.mediaKind === kind);
    if (!['image-only', 'audio-only', 'image-audio', 'pixiedraw-project', 'all-files'].includes(composition)) {
      if (!PACKAGE_COMPOSITIONS.some((option) => option.id === composition)) {
        setStatus('販売パッケージ構成を選び直してください。'); return;
      }
    }
    const detectedSupportedFormats = new Set(detectedEntries.map((entry) => entry.format).filter(Boolean));
    const compositionMismatch = composition === 'image-only'
      ? !onlyKinds('image')
      : composition === 'audio-only'
        ? !onlyKinds('audio')
        : composition === 'image-audio'
          ? !(activeKinds.size === 2 && hasKind('image') && hasKind('audio') && onlyKinds('image', 'audio'))
          : composition === 'text-only'
            ? !onlyKinds('text')
            : composition === 'video-only'
              ? !onlyKinds('video')
              : composition === 'image-video'
                ? !(activeKinds.size === 2 && hasKind('image') && hasKind('video') && onlyKinds('image', 'video'))
                : composition === 'text-image'
                  ? !(activeKinds.size === 2 && hasKind('text') && hasKind('image') && onlyKinds('text', 'image'))
                  : composition === 'pixiedraw-project'
                    ? formats.length !== 1 || formats[0] !== 'pixiedraw-project'
                    : detectedEntries.some((entry) => !entry.format) || formats.length !== detectedSupportedFormats.size;
    if (compositionMismatch) {
      setStatus('販売パッケージ構成と含める形式が一致していません。構成を選び直してください。'); return;
    }
    const optionIds = optionCatalog.filter((option) => selectedOptionIds.has(option.id)).map((option) => option.id);
    const tags = listingTags();
    if (tags.length > MAX_TAGS || tags.some((tag) => Array.from(tag).length > 24)) {
      setStatus('タグは最大5個、1個24文字以内で設定してください。'); return;
    }
    const salePrice = listingPolicy.priceYen;
    if (!Number.isInteger(salePrice) || salePrice < salePriceMinimum || salePrice > MAX_LISTING_PRICE_YEN || salePrice % PRICE_STEP_YEN !== 0) {
      setStatus(`${yen(Math.max(0, salePriceMinimum))}以上を100円単位で設定してください。`); return;
    }
    const purchasePrice = salePrice;
    if ((purchasePrice !== 0 && purchasePrice < 500) || purchasePrice % PRICE_STEP_YEN !== 0) {
      setStatus('販売価格は500円以上を100円単位で設定してください。'); return;
    }
    if (purchasePrice > 99999999) {
      setStatus('購入者の支払額は99,999,999円以下にしてください。'); return;
    }
    const limitedEnabled = listingPolicy.limited.enabled;
    const limitedQuantity = listingPolicy.limited.quantity;
    if (limitedEnabled && purchasePrice === 0) {
      setStatus('無料Assetでは限定販売を設定できません。限定販売を解除してください。'); return;
    }
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
        product_composition: composition,
        composition_label: compositionOption(composition).label,
        excluded_media: detectedEntries.filter((entry) => !entry.format).map((entry) => ({ path: entry.path, media_kind: entry.mediaKind })),
        ai_usage_status: aiUsageStatus,
        legal_confirmation: { terms_version: MARKET_TERMS_VERSION, privacy_version: MARKET_PRIVACY_VERSION },
        listing_policy: listingPolicy,
        listing_tags: tags,
        files: packageData.files,
        preview_selection: {
          thumbnail_source_path: thumbnailEntry?.path || null,
          sample_source_paths: sampleEntries.map((entry) => entry.path),
          public_preview_kind: 'baked-fixed-size-watermark',
          watermark_version: 'baked-v5'
        },
        limited_sale: limitedEnabled ? { enabled: true, quantity: limitedQuantity, option_price_yen: 0, minimum_price_yen: 0 } : { enabled: false },
        ...(deliveryManifest ? { delivery_manifest: deliveryManifest } : {})
      };
      setStatus('出品下書きを作成しています...');
      const rpcName = derivativeContext ? 'market_create_derivative_draft_v5' : 'market_create_root_asset_v8';
      const sellerPriceForRpc = salePrice;
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
        input_derivative_sales_allowed: listingPolicy.derivativeSalesAllowed,
        input_source_kind: 'external',
        input_source_sha256: packageData.sourceHash,
        input_asset_formats: formats,
        input_selected_option_ids: optionIds,
        input_option_prices: {},
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
        input_custom_options: []
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
        // ドット絵を先に960pxまでニアレストネイバー拡大してから、固定サイズの
        // 透かしを画像へ一度だけ焼き込む。表示レイヤーには依存しない。
        const blob = await createPreviewBlob(entry.previewBlob || entry.file, { watermark: true, mimeType: output.mimeType });
        const path = `${signedInUser.id}/${assetId}/previews/sample-${String(index + 1).padStart(2, '0')}.${output.extension}`;
        const { error } = await client.storage.from('market-private').upload(path, blob, { upsert: false, contentType: output.mimeType });
        if (error) throw error; uploadedPaths.push(path); sampleStoragePaths.push(path);
      }

      const manifestPath = `${signedInUser.id}/${assetId}/manifest.json`;
      const manifestFile = new Blob([JSON.stringify({ ...provenance, asset_id: assetId, files: packageData.files, preview_storage: { thumbnail: thumbnailStoragePath, samples: sampleStoragePaths } }, null, 2)], { type: 'application/json' });
      const { error: manifestError } = await client.storage.from('market-private').upload(manifestPath, manifestFile, { upsert: false, contentType: 'application/json' });
      if (manifestError) throw manifestError; uploadedPaths.push(manifestPath);
      submissionStep = 'サーバー検証';
      setStatus('Storage実体・形式・ハッシュをサーバーで検証しています...');
      const { data: verification, error: verificationError } = await client.functions.invoke('market-verify-listing-package', {
        body: {
          asset_id: assetId,
          manifest_object_path: manifestPath,
          file_object_paths: storedFiles.map((stored) => stored.path),
          preview_object_path: thumbnailStoragePath,
          sample_preview_paths: sampleStoragePaths
        }
      });
      if (verificationError || verification?.ok !== true) {
        throw verificationError || new Error(verification?.error || '販売パッケージのサーバー検証に失敗しました');
      }
      submissionStep = '送信確定';
      const attachInput = {
        input_asset_id: assetId,
        input_manifest_object_path: verification.manifest_object_path,
        input_file_object_paths: verification.file_object_paths,
        input_preview_object_path: verification.preview_object_path,
        input_sample_preview_paths: verification.sample_preview_paths || []
      };
      let attachError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        ({ error: attachError } = await client.rpc('market_attach_listing_package', attachInput));
        if (!attachError) break;
        await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
      }
      if (attachError) throw attachError;

      form.reset(); $('listingPrice').value = '0'; $('listingAcquisitionEnabled').checked = true; acquisitionMode = LISTING_MODES.ACQUIRE; usePreset = LISTING_USE_PRESETS.USE_IN_WORK; $('listingUsePreset').value = usePreset; clearFiles(); selectedOptionIds.clear(); optionPrices.clear(); listingTagValues.length = 0; customOptions = []; limitedOptionPrice = 0;
      renderTags(); renderOptions(); syncSimplePolicyUi({ applyPreset: true }); updateLimitedState(); uploadedPaths = [];
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
      if (projectTransferId) listingDraftLoaded = true;
      else await restoreListingDraft();
      renderOptions(); renderOptionPriceFields(); syncSimplePolicyUi({ applyPreset: !derivativeContext }); updatePrice(); gate.textContent = '商品を作成して審査へ送れます。入力内容とファイルはこの端末に自動保存されます。'; setSubmissionEnabled(true);
    } catch (error) {
      gate.textContent = `ファイルと価格の画面内確認は利用できますが、出品接続を開始できませんでした: ${error.message || '時間をおいて再試行してください'}`;
    }
  }

  bindLocalUi();
  consumePixieeDrawProjectTransfer().catch((error) => {
    setStatus(`販売用PXDを受け取れませんでした: ${error.message || '再度お試しください'}`);
  });
  initRemote();
})();
