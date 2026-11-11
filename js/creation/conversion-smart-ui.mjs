import { hasConversionRecoveryHistory } from '../tool-start-routes.mjs?rev=20261110-output-result-1';
import { mountResultSurface } from './conversion-result-surface.mjs?rev=20261110-output-layout-7';
import { textRenderOutputSelector } from './conversion-text-output-choice.mjs?rev=20261105-video-size-1';
import { createConversionRecoveryStore, createIndexedDbConversionRecoveryAdapter } from './conversion-recovery-store.mjs?rev=20261105-video-size-1';
import { createConversionRecoveryController, conversionRecoveryIdentity } from './conversion-recovery-controller.mjs?rev=20261105-video-size-1';
import { createConversionRecoveryWorkspace } from './conversion-recovery-workspace.mjs?rev=20261111-output-offerwall-1';
import { activateRetainedConversionInput } from './conversion-input-receipts.mjs?rev=20261105-video-size-1';
import { mountUnifiedConversionInput, writeUnifiedProperty, conversionRecoveryStatusLabel, associateCommittedMaterialFiles } from './conversion-unified-input.mjs?rev=20261110-output-layout-7';
import { createUnifiedImportController, importUnifiedMediaFiles } from './conversion-unified-import.mjs?rev=20261105-video-size-1';
import { createConversionSaveIntent } from './conversion-save-controller.mjs?rev=20261104-controllers-2';
import { downloadConversionResult } from './conversion-save-bridge.mjs?rev=20261104-controllers-2';
import { createConversionFormatOptions } from './conversion-format-view.mjs?rev=20261104-output-controller-1';
import { createConversionFormatController } from './conversion-format-controller.mjs?rev=20261104-output-controller-1';
import { createNativeFormatBridge } from './conversion-format-bridge.mjs?rev=20261104-output-controller-1';
import { mountConversionRouteChoices } from './conversion-route-choice.mjs?rev=20261101-route-choice-1';
import { conversionSaveMessage, batchSaveActionLabel } from './conversion-clarity.mjs?rev=20261101-direct-material-1';
import { mountConversionWorkspace } from './conversion-workspace.mjs?rev=20261110-output-layout-7';
import { saveActionLabel, materialChangeInvalidatesSave, createDeferredFocusGuard } from './conversion-stage.mjs?rev=20261105-video-size-1';
import { mountPublicNavigation } from '../public-navigation.mjs?rev=20261024-common-tool-start-1';

/** Use the same navigation DOM as other pages, once, retaining existing nodes. */
export function ensureConversionNavigation(doc, win) {
  return doc.querySelector('.public-destination-nav') || mountPublicNavigation({ document: doc, window: win });
}

/** A selected SVG/project link is not evidence that a new text render completed. */
export function settleTextGeneration({ generationHref, previousGenerationHref, working, dirty, resultMode, mode }) {
  return generationHref && generationHref !== previousGenerationHref && !working
    ? { previousGenerationHref:generationHref, dirty:false, resultMode:mode }
    : { previousGenerationHref, dirty, resultMode };
}
export function textRenderSaveLabel({format,loaded,working}) {
  return working?'作成中…':!loaded?'文字を入力':format==='pxtxt'?'文章と設定を保存':`${format==='svg'?'SVG':'PNG'}で保存`;
}
export function conversionOutputSaveLabel({mode,action='text',renderFormat='png',format='',filename='',loaded,working,outputPreview=null}={}) {
  if (working) return '作成中…';
  if (!loaded) return mode === 'input' ? '文章を入力' : '素材を選ぶ';
  let selected = '';
  if (mode === 'input' && action === 'text') selected = renderFormat;
  else if (mode === 'output') selected = 'txt';
  else if (mode === 'input' && outputPreview?.generationMode === 'input' && outputPreview.action === action && outputPreview.matchesInput === true) selected = outputPreview.format;
  else if (mode === 'media') selected = format;
  if (!selected && mode !== 'input') selected = String(filename || '').split('.').pop();
  selected = String(selected || '').replace(/^\./,'').toLowerCase();
  if (selected === 'pxtxt') return 'PXT（文章と設定）を保存';
  if (/^[a-z0-9]{1,8}$/.test(selected)) return `${selected.toUpperCase()}を保存`;
  return 'ファイルを保存';
}

/** Presentation adapter only: all decoding, validation and saving stay in the existing engines. */
export function mountSmartConversion(doc = document, win = window) {
  const main = doc.getElementById('main');
  if (win.top !== win.self || !main || main.dataset.smartConversion || !main.querySelector('#output-start,[data-editor],[data-text-tools]')) return null;
  const $ = selector => main.querySelector(selector);
  const available = node => Boolean(node && !node.closest('[hidden]') && !node.disabled && node.getAttribute('aria-disabled') !== 'true');
  const blobLink = node => available(node) && /^blob:/.test(node.getAttribute('href') || '') ? node : null;
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const setAttr = (node, key, value) => { if (node.getAttribute(key) !== value) node.setAttribute(key, value); };
  const media = () => main;
  const saveFocusGuard = createDeferredFocusGuard({ doc, win });
  let saveFocusTicket = null;
  const mode = () => $('.text-mode-nav [aria-pressed="true"]')?.dataset.textMode || 'media';
  const liveText = () => mode() === 'output' ? $('[data-text-tools]')?.textLivePreview : null;
  const find = selector => media().querySelector(selector);
  const selectMode = next => {
    const control = $(`[data-text-mode="${next}"]`);
    if (control && !control.disabled) control.click();
    return mode() === next;
  };
  const style = (href, key) => {
    if (doc.querySelector(`link[data-smart-style="${key}"]`)) return;
    const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = href; link.dataset.smartStyle = key; doc.head.append(link);
  };
  style('/css/conversion-smart-ui.css?rev=20261105-video-size-1', 'conversion');

  const toolbar = doc.createElement('section'); toolbar.className = 'sc-toolbar'; toolbar.setAttribute('aria-label', '変換の設定');
  toolbar.innerHTML = `<header class="sc-heading"><div><p>PIXIEED / CONVERT</p><h1>変換・出力</h1></div><span>端末内で処理</span></header>
    <div class="sc-route"><div class="sc-route-native"><label>元のデータ<select data-sc-source><option value="file">ファイル</option><option value="text">文字</option></select></label><span aria-hidden="true">→</span><label>作るもの<select data-sc-target><option value="file">ファイル</option><option value="text">文字</option></select></label></div></div>
    <div class="sc-input-actions"><button type="button" data-sc-pick>ファイルを選ぶ</button><button type="button" data-sc-paste>文字を貼り付ける</button></div>
    <label class="sc-format" data-sc-format-row hidden><span data-sc-format-label>保存形式</span><select data-sc-format></select></label>
    <p class="sc-hint" data-sc-hint>素材を選ぶと、対応する形式と必要な設定だけを表示します。</p><input type="file" data-sc-file multiple hidden>`;
  // The initial HTML owns this heading; keep the same node through hydration.
  const initialHeading = doc.querySelector('[data-conversion-heading]');
  if (initialHeading) toolbar.querySelector('.sc-heading').replaceWith(initialHeading);
  main.prepend(toolbar);
  const ui = selector => main.querySelector(selector);
  const source = ui('[data-sc-source]'), target = ui('[data-sc-target]'), format = ui('[data-sc-format]'), picker = ui('[data-sc-file]');
  const nativeInput = find('[data-file],#output-file-input');
  picker.accept = [nativeInput?.accept || 'image/*,video/*,audio/*', '.txt,.md,.json,.pxtxt,text/plain'].join(',');
  if (!$('[data-text-tools]')) { source.disabled = true; target.disabled = true; ui('[data-sc-paste]').hidden = true; }

  const routeChoices = mountConversionRouteChoices({ container: ui('.sc-route'), native: ui('.sc-route-native'), groups: [
    { select: source, label: '元のデータ', name: 'sc-source-choice' },
    { select: target, label: '作るもの', name: 'sc-target-choice' },
  ], doc, win });

  // Keep the original nodes and their handlers; never rebuild private handoff state.
  const fileSettings = $('#output-file-settings');
  if (fileSettings && !fileSettings.querySelector('.sc-multiple')) {
    const advanced = doc.createElement('details'); advanced.className = 'sc-multiple';
    const summary = doc.createElement('summary'); summary.textContent = '複数出力・素材の管理'; advanced.append(summary);
    for (const node of [...fileSettings.children]) if (node.matches('#output-items,#output-reward-note,.output-item-actions,#output-add-item,#output-source-label,#output-source')) advanced.append(node);
    fileSettings.append(advanced);
  }
  let unified = null;
  let unifiedImport = null;
  const originalFilesByMaterialId = new Map();
  const readMaterialState = () => main.conversionMaterials?.getState?.() || $('#output-layout')?.conversionActions?.getMaterialState?.() || null;
  let knownMaterialAssetIds = (readMaterialState()?.assets || []).map(asset => asset.id).filter(Boolean);
  const originalFileForAsset = id => originalFilesByMaterialId.get(id) || null;
  const materialAssetIdForFile = file => {
    if (!file) return null;
    const state = readMaterialState(), assets = state?.assets || [];
    const direct = assets.filter(asset => asset?.originalFile === file || asset?.file === file || asset?.sourceFile === file);
    if (direct.length === 1) return direct[0].id || null;
    const mapped = [...originalFilesByMaterialId].filter(([, candidate]) => candidate === file).map(([id]) => id);
    return mapped.length === 1 ? mapped[0] : null;
  };
  const pruneOriginalFiles = () => {
    const ids = new Set((readMaterialState()?.assets || []).map(asset => asset.id));
    for (const id of originalFilesByMaterialId.keys()) if (!ids.has(id)) originalFilesByMaterialId.delete(id);
  };
  let localRecovery = null, inputCount = 0;
  const workspace = mountConversionWorkspace(main, toolbar, doc, win);
  const button = doc.createElement('button'); button.type = 'button'; button.id = 'output-nav-export';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg><span>出力</span>';
  const buttonLabel = button.querySelector('span');
  const dock = doc.createElement('div'); dock.className = 'sc-export-status sc-save-bar';
  dock.innerHTML = '<progress data-sc-progress aria-label="出力作成の進行状況" hidden></progress><div class="sc-save-copy"><span class="sc-export-message" role="status" aria-live="polite" tabindex="0" aria-label="出力の状態" aria-description="長い状態メッセージはここでスクロールできます。"></span></div><div class="sc-save-actions"><button type="button" data-sc-batch hidden></button><button type="button" data-sc-cancel hidden>中止</button></div>';
  dock.querySelector('.sc-save-actions').prepend(button);
  const message = dock.querySelector('.sc-export-message'), cancel = dock.querySelector('[data-sc-cancel]'), batch = dock.querySelector('[data-sc-batch]');
  let nav = null, navObserver = null, frame = 0, revision = 0, lastMode = mode();
  let lastTextGenerationUrl = '', textResultMode = '', textDirty = true, lastMediaUrl = '', mediaDirty = false;
  let lastSaved = null, pendingDimensions = null, resultSurface = null;
  let sizeDirty = false, fpsDirty = false, stopped = false, controlSignature = '', saveError = '';
  const setSaveError = value => {
    saveError = String(value || '');
    if (saveError) setText(message, saveError);
  };
  const nativeFormat = () => mode() === 'input' ? $('[data-tx-action]') : mode() === 'output' ? $('[data-tx-style]') : find('[data-format],#output-format-select');
  const formatController = createConversionFormatController(createNativeFormatBridge({ getSelect: nativeFormat, getMode: mode, EventImpl: win.Event }));
  const result = () => {
    if (mode() === 'media') return blobLink(find('[data-download],#output-download')) || blobLink(find('a.convert-primary[download]:not([data-previous])'));
    const live = liveText(), renderedMode = $('[data-text-tools]')?.dataset.txResultMode;
    if ((live && live.state !== 'ready') || (renderedMode && renderedMode !== mode())) return null;
    if(mode()==='input' && $('[data-tx-action]')?.value==='text')return blobLink($(textRenderOutputSelector(main.textConversion?.snapshot().renderFormat||'png')));
    return blobLink($('[data-tx-download]')) || blobLink($('[data-tx-txt]'));
  };
  const cancelAction = () => {
    const selectors = mode() === 'media' ? '[data-cancel],#output-cancel-generation,#output-cancel-settings,#output-cancel-import' : '[data-tx-cancel],[data-tx-live-cancel]';
    return [...main.querySelectorAll(selectors)].find(available) || null;
  };
  // Live text generation does not lock its settings; only saving waits for a fresh result.
  const busy = () => Boolean(localRecovery?.restoring || unifiedImport?.pending || main.textConversion?.snapshot?.().importing || main.textConversion?.snapshot?.().composing)
    || main.getAttribute('aria-busy') === 'true'
    || Boolean($('#output-layout')?.conversionActions?.busy)
    || (mode() !== 'media' && $('[data-text-tools]')?.getAttribute('aria-busy') === 'true')
    || (!liveText() && Boolean(cancelAction()))
    || (mode() === 'media' && !$('#output-layout')?.conversionActions && Boolean(find('#output-format-select')?.disabled) && loaded());
  const matchesFormat = link => {
    const state = formatController.snapshot();
    if (!state.available || !link?.download) return true;
    const normalize = value => ({ jpg: 'jpeg', tif: 'tiff' }[value] || value);
    const extension = link.download.split('.').pop().toLowerCase();
    return normalize(extension) === normalize(state.value.toLowerCase());
  };
  const statusText = () => (mode() === 'media'
    ? (available($('#output-start')) ? $('#output-import-status') : find('[data-status],#output-status'))
    : $('[data-tx-status]'))?.textContent?.trim() || '';
  const loaded = () => mode() === 'media'
    ? ((main.conversionMaterials?.getState?.() || $('#output-layout')?.conversionActions?.getMaterialState?.())?.loaded ?? (available(find('[data-editor],#output-layout')) || Boolean(result())))
    : mode() === 'input' ? Boolean($('[data-tx-source]')?.value.trim()) : liveText() ? liveText().hasSource : Boolean($('[data-tx-file-name]')?.textContent && !$('[data-tx-file-name]').textContent.includes('選んでください'));
  function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(() => { frame = 0; render(); }); }
  function ensureNav() {
    const next = ensureConversionNavigation(doc, win);
    if (!next) return;
    if (next !== nav) {
      navObserver?.disconnect(); nav = next;
      navObserver = new win.MutationObserver(ensureNav); navObserver.observe(nav, { childList: true });
    }
    if (!dock.isConnected) doc.body.append(dock);
    doc.body.classList.add('has-public-destination-nav', 'has-smart-conversion');
  }
  function mirrorFormat() {
    const state = formatController.snapshot({ busy: busy() }), row = ui('[data-sc-format-row]');
    const hideRow = !state.available || state.options.length === 0 || (mode() === 'media' && !loaded());
    if (row.hidden !== hideRow) row.hidden = hideRow;
    if (row.hidden) return;
    const signature = JSON.stringify([state.mode, state.options]);
    if (signature !== controlSignature) {
      format.replaceChildren(...createConversionFormatOptions(doc, state.options)); controlSignature = signature;
    }
    if (format.value !== state.value) format.value = state.value;
    if (format.disabled !== state.disabled) format.disabled = state.disabled;
    setText(ui('[data-sc-format-label]'), mode() === 'input' ? '文字からつくるもの' : mode() === 'output' ? '文字の表現' : '保存形式');
  }
  function render() {
    ensureNav();
    const currentMode = mode(), locked = busy(), live = liveText();
    const working = locked || Boolean(live && ['queued','rendering'].includes(live.state));
    const link = result(), href = link?.getAttribute('href') || '';
    if (currentMode !== lastMode) { saveIntent.cancel(); saveFocusGuard.invalidate(); revision++; lastMode = currentMode; }
    if (currentMode === 'media') {
      if (href && href !== lastMediaUrl && !working) { lastMediaUrl = href; mediaDirty = !matchesFormat(link); }
    } else {
      const generationHref=(blobLink($('[data-tx-download]'))||blobLink($('[data-tx-txt]')))?.getAttribute('href')||'';
      const settled=settleTextGeneration({generationHref,previousGenerationHref:lastTextGenerationUrl,working,dirty:textDirty,resultMode:textResultMode,mode:currentMode});
      lastTextGenerationUrl=settled.previousGenerationHref;textDirty=settled.dirty;textResultMode=settled.resultMode;
    }
    source.value = currentMode === 'input' ? 'text' : 'file';
    target.value = currentMode === 'output' ? 'text' : 'file';
    if (target.options[1].disabled !== (currentMode === 'input')) target.options[1].disabled = currentMode === 'input';
    setText(target.options[0], 'ファイル');
    const hasText = Boolean($('[data-text-tools]'));
    const routesDisabled = locked || !hasText;
    if (source.disabled !== routesDisabled) source.disabled = routesDisabled;
    if (target.disabled !== routesDisabled) target.disabled = routesDisabled;
    routeChoices?.update();
    writeUnifiedProperty(ui('[data-sc-pick]'), 'disabled', locked); writeUnifiedProperty(ui('[data-sc-paste]'), 'disabled', locked);
    mirrorFormat();
    main.dataset.smartLoaded = String(loaded());
    setText(ui('[data-sc-pick]'), loaded() ? '素材を変更' : 'ファイルを選ぶ');
    writeUnifiedProperty(button, 'disabled', locked || saveIntent.pending || (working && !live));
    setAttr(button, 'aria-busy', String(working));
    const ready = Boolean(link && (live ? live.state === 'ready' : currentMode === 'media' ? !mediaDirty && !sizeDirty && !fpsDirty : !textDirty && textResultMode === currentMode));
    const nativeProgress = [...main.querySelectorAll('progress:not([data-sc-progress]):not([data-sc-panel-progress])')].find(available);
    const progress = dock.querySelector('progress'); writeUnifiedProperty(progress, 'hidden', !working);
    if (nativeProgress?.hasAttribute('value')) { progress.max = nativeProgress.max; progress.value = nativeProgress.value; } else progress.removeAttribute('value');
    const textState = main.textConversion?.snapshot?.() || {};
    const outputPreview = main.textConversion?.outputPreview?.() || null;
    const label = conversionOutputSaveLabel({
      mode: currentMode, action: $('[data-tx-action]')?.value || 'text', renderFormat: textState.renderFormat || 'png',
      format: currentMode === 'output' ? $('[data-tx-style]')?.value || '' : formatController.snapshot().value,
      filename: link?.download || '', loaded: loaded(), working: working && (!live || saveIntent.pending), outputPreview,
    });
    setText(buttonLabel, label);
    setAttr(button, 'aria-label', label);
    writeUnifiedProperty(cancel, 'hidden', !working || !cancelAction());
    const nativeStatus = statusText();
    const savedCurrent = lastSaved?.mode === currentMode && lastSaved.revision === revision && lastSaved.href === href;
    const displayedStatus = saveError || conversionSaveMessage({ loaded: loaded(), working, saved: savedCurrent, nativeStatus });
    setText(message, displayedStatus);
    workspace.update({ media: currentMode === 'media', loaded: loaded(), ready, link, working, saveDisabled: button.disabled, status: displayedStatus, progress: nativeProgress, canCancel: !cancel.hidden, saveLabel: label });
    const batchAction = $('#output-batch-save');
    const batchCount = Number(batchAction?.textContent.match(/（(\d+)）/)?.[1] || 0);
    writeUnifiedProperty(batch, 'hidden', currentMode !== 'media' || batchCount < 2);
    writeUnifiedProperty(batch, 'disabled', locked || saveIntent.pending || !batchAction || batchAction.disabled);
    const batchFormats = [...main.querySelectorAll('#output-items .output-item')].filter(row => row.querySelector('input[type="checkbox"]')?.checked).map(row => row.querySelector('.output-item__select strong')?.textContent?.trim() || '');
    const batchLabel = batchSaveActionLabel(batchFormats, batchCount);
    setText(batch, batchLabel);
    batch.title = '選択した作成済みの出力を保存します。現在の設定変更は保存ボタンから反映します。';
    setAttr(batch, 'aria-label', batchLabel);
    const hint = currentMode === 'input' ? '文章・文字アート・復元コードを判別します。設定は必要なときだけ開けます。'
      : currentMode === 'output' ? '設定変更でプレビューを自動更新。保存ボタンで最新の結果を保存します。復元コードは暗号化ではありません。'
      : loaded() ? '形式に応じた設定だけを表示しています。保存ボタンは画面下に固定されています。'
      : 'ファイルを選ぶと対応形式を表示します。TXT・メモは文字入力へ自動で切り替えます。';
    setText(ui('[data-sc-hint]'), hint);
    unified?.update();
    const previewApi=main.conversionMaterials||$('#output-layout')?.conversionActions;
    const capability=previewApi?.previewCapability?.()||{supported:false,automatic:false,reason:'素材・形式を確認してください。生成できる状態になると保存前にプレビューを更新できます。'};
    const materialSnapshot=previewApi?.getState?.()||previewApi?.getMaterialState?.()||{};
    resultSurface?.update({
      mode:currentMode,loaded:loaded(),ready,working,key:`${currentMode}:${revision}:${Number(fpsDirty)}:${Number(sizeDirty)}`,
      pendingFps:fpsDirty,pendingSize:sizeDirty,api:previewApi,capability,link,
      sources:currentMode==='media'?materialSnapshot.assets||[]:[],activeSourceId:currentMode==='media'?materialSnapshot.activeId||null:null,
      sourceText:currentMode==='input'?textState.text||'':'',sourceRevision:currentMode==='input'?textState.editRevision??0:0,
      outputPreview,originalFile:currentMode==='output'?textState.file:null,
    });
    saveIntent.observe();
  }

  function save(link, state) {
    if (!downloadConversionResult({ link, expectedHref: state?.href, available })) return false; lastSaved = { mode: mode(), revision, href: link.getAttribute('href') };
    setText(message, 'ダウンロードを開始しました。');
    schedule();
    const ticket = saveFocusTicket;
    if (ticket && ticket.mode === mode() && ticket.revision === revision) saveFocusGuard.schedule(ticket.guard, () => {
      if (ticket.mode === mode() && ticket.revision === revision) workspace.focusSave(button);
    });
    return true;
  }
  function validInputs(scope) {
    for (const input of scope.querySelectorAll('input,textarea,select')) {
      if (input.disabled || input.type === 'file' || input.type === 'hidden' || input.closest('[hidden]') || !input.willValidate || input.checkValidity()) continue;
      for (let parent = input.parentElement; parent && parent !== main; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      if (!unified || mode() === 'media') workspace.reveal();
      input.focus({ preventScroll: true }); input.reportValidity(); return false;
    }
    return true;
  }
  function choose() {
    // Input type follows the chosen files, never the currently displayed engine.
    picker.multiple = true;
    picker.accept = '';
    picker.click();
  }

  function saveSnapshot() {
    const currentMode = mode(), live = liveText(), link = result();
    return { mode: currentMode, revision, loaded: loaded(), live: Boolean(live),
      working: busy() || Boolean(live && ['queued','rendering'].includes(live.state)),
      link, href: link?.getAttribute('href') || '', matchesFormat: currentMode !== 'media' || matchesFormat(link),
      ready: Boolean(link && (live ? live.state === 'ready' : currentMode === 'media' ? !mediaDirty && !sizeDirty && !fpsDirty : !textDirty && textResultMode === currentMode)),
      fpsDirty: currentMode === 'media' && fpsDirty && available($('#output-apply-fps')),
      sizeDirty: currentMode === 'media' && sizeDirty && available($('#output-apply-settings')) };
  }
  const saveIntent = createConversionSaveIntent({ snapshot: saveSnapshot, save, settled: schedule,
    choose() { if (mode() === 'input') { if (unified?.openTextEditor) unified.openTextEditor(); else $('[data-tx-source]')?.focus(); } else choose(); },
    stageComplete(stage) {
      if (stage === 'fps') {
        fpsDirty = false;
        if (pendingDimensions) { $('#output-width').value = pendingDimensions.width; $('#output-height').value = pendingDimensions.height; pendingDimensions = null; }
      }
      if (stage === 'size') sizeDirty = false;
    },
    blocked(error) { setSaveError(error?.message || '設定の反映を確認してください。前回の結果は保存しません。'); },
    run(stage) {
      if (stage === 'live') {
        const live = liveText();
        if (!live) return false;
        if (!['queued','rendering'].includes(live.state)) live.refresh();
        schedule(); return true;
      }
      const detailed = mode() === 'media' && $('#output-layout')?.conversionActions;
      if (detailed) {
        if (!validInputs(media())) return false;
        return stage === 'fps' ? detailed.applyFps() : stage === 'size' ? detailed.applySize() : detailed.generate();
      }
      const action = stage === 'fps' ? $('#output-apply-fps') : stage === 'size' ? $('#output-apply-settings') : mode() !== 'media' ? $('[data-tx-run]')
        : [find('[data-convert]'), $('#output-create-video'), $('#output-create-audio')].find(available);
      if (!available(action) || !validInputs(mode() === 'media' ? media() : $('[data-text-tools]'))) return false;
      action.click(); schedule(); return true;
    },
  });
  function beginExport() {
    if (busy() || main.textConversion?.snapshot?.().composing) return false;
    setSaveError('');
    saveFocusTicket = { guard: saveFocusGuard.begin(button), mode: mode(), revision };
    if (!saveIntent.pending) pendingDimensions = fpsDirty && sizeDirty ? { width: $('#output-width')?.value, height: $('#output-height')?.value } : null;
    saveIntent.request(); schedule();
  }
  workspace.bindActions({ save: beginExport, add: choose, replace: acceptFiles, refresh: schedule, cancel() { saveIntent.cancel(); cancelAction()?.click(); schedule(); } });
  function changed(event) {
    if (toolbar.contains(event.target)) return;
    const element = event.target;
    if (!element.matches('input,textarea,select') || element.matches('[data-tx-text-result],[data-scrub],[data-sc-source],[data-sc-target]') || element.closest('[data-sc-route-choice]')) return;
    if (element.closest('#output-items')) { schedule(); return; }
    setSaveError(''); revision++; resultSurface?.invalidate(); saveIntent.cancel(); saveFocusGuard.invalidate();
    if (element.closest('[data-text-tools]') || element.type === 'file') textDirty = true;
    if (element.matches('#output-width,#output-height,#output-aspect-lock')) sizeDirty = true;
    if (element.matches('#output-fps,#output-fps-preset')) fpsDirty = true;
    if (element.closest('.output-settings,.convert-settings') && !element.closest('#output-items') && !element.matches('#output-filename,#output-aspect-lock')) mediaDirty = true;
    schedule();
  }
  function acceptFiles(files) {
    if (files?.length && main.textConversion?.snapshot?.().composing) {
      setSaveError('文字入力を確定してからファイルを追加してください。入力内容は保持しています。');
      schedule(); return false;
    }
    if (unifiedImport) return unifiedImport.request(files);
    // Optional text-tool startup failure leaves the existing media engine usable.
    if (!files?.length || busy() || !nativeInput) return false;
    try {
      const transfer = new win.DataTransfer(); for (const file of files) transfer.items.add(file);
      nativeInput.files = transfer.files; nativeInput.dispatchEvent(new win.Event('change', { bubbles: true }));
      return true;
    } catch { setText(message, 'このブラウザーでは素材欄のファイル選択を使ってください。'); return false; }
  }

  function changeRoute(next) {
    setSaveError('');
    const focused = doc.activeElement, fromChoices = focused?.closest?.('[data-sc-route-choice]');
    selectMode(next); render();
    if (fromChoices) {
      const dialog = focused.closest('dialog');
      if (dialog && !dialog.open) ui('[data-sc-settings-open]')?.focus({ preventScroll: true });
      else if (focused.isConnected && !focused.disabled) focused.focus({ preventScroll: true });
    }
  }
  source.addEventListener('change', () => changeRoute(source.value === 'text' ? 'input' : target.value === 'text' ? 'output' : 'media'));
  target.addEventListener('change', () => changeRoute(target.value === 'text' ? 'output' : source.value === 'text' ? 'input' : 'media'));
  format.addEventListener('change', () => {
    try { formatController.choose(format.value, { busy: busy() }); }
    catch (error) {
      const field = mode() === 'media' ? find('[data-status],#output-status') : $('[data-tx-status]');
      if (field) field.textContent = error?.message || '形式を切り替えられませんでした。';
    }
    schedule();
  });
  ui('[data-sc-pick]').addEventListener('click', choose);
  ui('[data-sc-paste]').addEventListener('click', () => { if (selectMode('input')) { render(); $('[data-tx-source]')?.focus(); } });
  picker.addEventListener('change', () => { acceptFiles(picker.files); picker.value = ''; });
  toolbar.addEventListener('dragover', event => event.preventDefault());
  toolbar.addEventListener('drop', event => { event.preventDefault(); acceptFiles(event.dataTransfer?.files); });
  main.addEventListener('drop', event => {
    if (!unified) return;
    const files = event.dataTransfer?.files, text = event.dataTransfer?.getData('text/plain') || '';
    const editable = event.target.closest?.('textarea,input,[contenteditable="true"]');
    if (!files?.length && (!text || editable)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    for (const overlay of main.querySelectorAll('.sc-material-drop-overlay')) overlay.hidden = true;
    for (const node of main.querySelectorAll('[data-drop].is-over,#output-drop.is-over')) node.classList.remove('is-over');
    void acceptFiles(files?.length ? files : [new win.File([text], 'ドロップした文章.txt', { type: 'text/plain' })]);
  }, true);
  main.addEventListener('paste', event => {
    if (!unified || event.defaultPrevented) return;
    const data = event.clipboardData, files = data?.files, text = data?.getData('text/plain') || '';
    const editable = event.target.closest?.('textarea,input,[contenteditable="true"]');
    // Native text paste/IME owns editable text. An image-only clipboard remains a file import.
    if (editable && (text || !files?.length)) return;
    if (files?.length) { event.preventDefault(); event.stopImmediatePropagation(); void acceptFiles(files); }
    else if (text && !editable) {
      event.preventDefault(); event.stopImmediatePropagation();
      void acceptFiles([new win.File([text], '貼り付けた文章.txt', { type: 'text/plain' })]);
    }
  }, true);
  function textSourceChanged(event) {
    setSaveError('');
    revision++; resultSurface?.invalidate(); saveIntent.cancel(); saveFocusGuard.invalidate(); if(event?.detail?.kind!=='render-format')textDirty = true; lastSaved = null;
    schedule();
  }
  main.addEventListener('pixieed:text-source', textSourceChanged);
  function committedFiles(event) {
    if (!unified) return;
    const files = Array.from(event.detail?.files || []);
    if (files.length) {
      const state = readMaterialState();
      const association = associateCommittedMaterialFiles({ assets: state?.assets || [], files, previousAssetIds: knownMaterialAssetIds });
      for (const id of association.invalidatedIds) originalFilesByMaterialId.delete(id);
      for (const [id, file] of association.associations) originalFilesByMaterialId.set(id, file);
      knownMaterialAssetIds = association.assetIds;
      pruneOriginalFiles();
      if (!unifiedImport?.pending) main.textConversion?.selectFile(files.length === 1 ? files[0] : null);
    }
    schedule();
  }
  main.addEventListener('pixieed:input-files', committedFiles);
  function useGeneratedFile(event) {
    if (!unified || busy()) return;
    event.preventDefault();
    void acceptFiles(event.detail?.files);
  }
  main.addEventListener('pixieed:use-generated-file', useGeneratedFile);
  main.addEventListener('input', changed); main.addEventListener('change', changed);
  main.addEventListener('pixieed:text-preview', schedule);
  function materialsChanged(event) {
    if (event.detail?.mutation === 'import') {
      const state = readMaterialState();
      for (const asset of state?.assets || []) if (/^local-(images|audio|video)$/.test(String(asset.id || ''))) originalFilesByMaterialId.delete(asset.id);
    }
    pruneOriginalFiles();
    if (event.detail?.changed) {
      setSaveError('');
      if (materialChangeInvalidatesSave(event.detail)) { revision++; saveIntent.cancel(); saveFocusGuard.invalidate(); }
      mediaDirty = true; lastSaved = null;
    }
    schedule();
  }
  main.addEventListener('pixieed:materials', materialsChanged);
  main.addEventListener('click', event => {
    const el = event.target.closest('button'); if (!el) return;
    if (el.matches('#output-cancel-generation,#output-cancel-settings,#output-cancel-import,[data-cancel],[data-tx-cancel],[data-tx-live-cancel]')) saveIntent.cancel();
    if (el.matches('.output-item__select,#output-add-item,#output-copy-item,#output-delete-item')) {
      sizeDirty = false; fpsDirty = false; revision++; saveIntent.cancel(); saveFocusGuard.invalidate();
    }
    if (el.matches('[data-rate],[data-reset],[data-apply-seconds],[data-move],.output-preset,#output-add-assets') || el.closest('#output-assets-list')) { mediaDirty = true; revision++; saveIntent.cancel(); saveFocusGuard.invalidate(); }
    schedule();
  });
  button.addEventListener('click', beginExport);
  batch.addEventListener('click', () => { const action = $('#output-batch-save'); if (!busy() && !saveIntent.pending && action && !action.disabled) action.click(); schedule(); });
  cancel.addEventListener('click', () => { saveIntent.cancel(); cancelAction()?.click(); schedule(); });
  const observer = new win.MutationObserver(records => {
    if (records.some(record => !toolbar.contains(record.target) && (
      record.type === 'attributes' || record.target.closest?.('.text-mode-nav,#output-status,#output-import-status,[data-status],[data-tx-status],select,[data-tx-file-name]')
    ))) schedule();
  });
  observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden','disabled','aria-busy','aria-pressed','href','download','value','open'] });
  const bodyObserver = new win.MutationObserver(ensureNav); bodyObserver.observe(doc.body, { childList: true });
  main.dataset.smartConversion = 'true';
  if (main.textConversion) {
    const textApi = main.textConversion;
    unifiedImport = createUnifiedImportController({
      snapshot: () => textApi.snapshot(),
      isBusy: () => busy(),
      isCurrent: () => !stopped,
      appendTextFiles: files => textApi.appendTextFiles(files),
      async importMedia(files) {
        const api = main.conversionMaterials || $('#output-layout')?.conversionActions;
        if (!api) throw new Error('この素材の形式変換には、新しいファイル変換画面を開いてください。文字入力と元ファイルは保持しています。');
        return importUnifiedMediaFiles(api, files);
      },
      selectFile: file => textApi.selectFile(file),
      activateMedia: () => textApi.setMode('media'),
      activateText: () => textApi.setMode('input'),
      activateCode() {
        if (!textApi.setMode('output')) return false;
        return formatController.choose('encode', { busy: false }) || formatController.snapshot().value === 'encode';
      },
      report(text) { setSaveError(text); schedule(); },
      onInvalidate() { revision++; resultSurface?.invalidate(); saveIntent.cancel(); saveFocusGuard.invalidate(); setSaveError(''); },
      onEntriesChange(entries) { schedule(); const urgent = entries.length > inputCount; inputCount = entries.length; localRecovery?.changed({ urgent }); },
      onSettled: schedule,
    });
    unified = mountUnifiedConversionInput({ main, toolbar, doc, win, getMode: mode,
      setMode: next => textApi.setMode(next), acceptFiles, choose, formatController, isBusy: busy, isOutputReady: () => saveSnapshot().ready,
      getOriginalFileForAsset: originalFileForAsset, getAssetIdForOriginalFile: materialAssetIdForFile, schedule,
      getInputs: () => unifiedImport.snapshotEntries(),
      retryInput: id => unifiedImport.retryEntry(id),
      holdInput: id => unifiedImport.holdEntry(id),
      openInput: entry => activateRetainedConversionInput(entry, { api: textApi, formatController, busy: busy() }),
    });
  }
  if(unified)resultSurface=mountResultSurface({main,doc,win,schedule,refreshText:()=>{if(busy())return;if(liveText())liveText().refresh();else $('[data-tx-run]')?.click();schedule();},cancelText:()=>{saveIntent.cancel();cancelAction()?.click();schedule();}});
  render();
  let localRecoveryHost = null, recoveryIdentity = null;
  let entryRecoveryReady = Promise.resolve(!hasConversionRecoveryHistory(win.history?.state));
  const recoveryChanged = () => localRecovery?.changed();
  const beforeRecoveryLeave = event => { if (localRecovery?.dirty || localRecovery?.snapshot().saving) { event.preventDefault(); event.returnValue = ''; } };
  if (unified && main.textConversion) {
    localRecoveryHost = doc.createElement('section'); localRecoveryHost.className = 'sc-local-recovery';
    localRecoveryHost.innerHTML = '<details><summary><span data-sc-local-recovery-status role="status">保存内容を確認中</span></summary><p data-sc-local-recovery-message role="status" aria-live="polite"></p><p>このブラウザーの端末内だけに保存します。共有端末ではデータが残ります。保存停止や取消でも前回保存版は消しません。合計256MBまで。ブラウザーのデータ消去では失われます。</p><button type="button" data-recovery-save>端末内に保存</button><button type="button" data-recovery-cancel>保存を停止</button><button type="button" data-recovery-fork hidden>今の内容を別の復元版として保存</button><button type="button" data-recovery-previous hidden>今の内容を保存して前の復元版を開く</button></details>';
    main.querySelector('.sc-unified-composer').append(localRecoveryHost);
    const updateRecovery = state => {
      localRecoveryHost.dataset.phase = state.phase;
      localRecoveryHost.dataset.dirty = String(state.dirty);
      setAttr(localRecoveryHost, 'aria-busy', String(state.loading || state.restoring || state.saving));
      let stateMessage = state.message;
      if(state.paused && state.phase!=='paused')stateMessage += ' 自動保存は停止中です。';
      try { if(win.history.state?.pixieedConversionRecoveryPaused!==state.paused)win.history.replaceState({...win.history.state,pixieedConversionRecoveryPaused:state.paused},'',win.location.href); }
      catch { stateMessage += ' 保存停止の設定を再読込後へ引き継げません。'; }
      const details = localRecoveryHost.querySelector('details');
      const summary = conversionRecoveryStatusLabel({ ...state, message: stateMessage });
      setText(localRecoveryHost.querySelector('[data-sc-local-recovery-status]'), summary);
      setText(localRecoveryHost.querySelector('[data-sc-local-recovery-message]'), stateMessage);
      if (['error', 'restore-error', 'restore-blocked', 'conflict'].includes(state.phase) || summary.includes('注意') || summary.includes('設定注意')) details.open = true;
      const save = localRecoveryHost.querySelector('[data-recovery-save]'), cancel = localRecoveryHost.querySelector('[data-recovery-cancel]'), fork = localRecoveryHost.querySelector('[data-recovery-fork]');
      setText(save, state.phase === 'error' ? '端末内保存を再試行' : state.paused ? '端末内保存を再開' : '端末内に保存'); setText(cancel, state.loading ? '復元を中止' : state.saving ? '今回の保存を取消' : '保存を停止');
      const set = (node,key,value) => { if(node[key]!==value)node[key]=value; };
      set(save,'disabled',state.loading||state.restoring||state.saving||(state.blocked&&state.phase!=='error'));set(cancel,'disabled',state.restoring||state.paused);
      set(fork,'hidden',!state.blocked);set(fork,'disabled',state.saving||state.loading||state.restoring);
      const previous=localRecoveryHost.querySelector('[data-recovery-previous]');set(previous,'hidden',!recoveryIdentity?.previous().length);set(previous,'disabled',state.saving||state.loading||state.restoring);
      schedule();
    };
    try {
      const identity = conversionRecoveryIdentity(win); recoveryIdentity=identity;
      const workspaceRecovery = createConversionRecoveryWorkspace({main,text:main.textConversion,imports:unifiedImport,location:win.location,
        captureSaveState:()=>({sizeDirty,fpsDirty,mediaDirty}),restoreSaveState:state=>{sizeDirty=state.sizeDirty;fpsDirty=state.fpsDirty;mediaDirty=state.mediaDirty;},
        owner:()=>main.conversionMaterials ? {kind:'simple',api:main.conversionMaterials} : $('#output-layout')?.conversionActions ? {kind:'detailed',api:$('#output-layout').conversionActions} : {kind:'none',api:null}});
      localRecovery = createConversionRecoveryController({store:createConversionRecoveryStore(createIndexedDbConversionRecoveryAdapter(win.indexedDB)),id:identity.id,adoptId:identity.adopt,
        capture:workspaceRecovery.capture,apply:workspaceRecovery.apply,canSave:()=>!main.textConversion.snapshot().composing,onState:updateRecovery,initiallyPaused:Boolean(win.history.state?.pixieedConversionRecoveryPaused),
        idFactory:()=>win.crypto.randomUUID(),setTimer:(fn,ms)=>win.setTimeout(fn,ms),clearTimer:id=>win.clearTimeout(id)});
      localRecoveryHost.querySelector('[data-recovery-save]').addEventListener('click',()=>void localRecovery.resume());
      localRecoveryHost.querySelector('[data-recovery-cancel]').addEventListener('click',()=>localRecovery.cancel());
      localRecoveryHost.querySelector('[data-recovery-fork]').addEventListener('click',()=>void localRecovery.fork());
      localRecoveryHost.querySelector('[data-recovery-previous]').addEventListener('click',async()=>{
        const target=identity.previous().at(-1), before=localRecovery.snapshot();if(!target||before.loading||before.restoring||before.saving)return;
        try{
          const saved=before.blocked?await localRecovery.fork():localRecovery.dirty?await localRecovery.resume():true;
          if(!saved||localRecovery.dirty||(!before.paused&&localRecovery.snapshot().paused))return;
          identity.adopt(target);win.location.reload();
        }catch(error){setText(localRecoveryHost.querySelector('[data-sc-local-recovery-status]'),`保存版を開けませんでした。${error?.message||''} 現在の内容は保持しています。`);}
      });
      for(const event of ['input','change','pixieed:text-source','pixieed:materials'])main.addEventListener(event,recoveryChanged);
      win.addEventListener('beforeunload',beforeRecoveryLeave);
      entryRecoveryReady = localRecovery.start().then(ready => ready === true, () => false);
    } catch(error) { entryRecoveryReady = Promise.resolve(false); setText(localRecoveryHost.querySelector('[data-sc-local-recovery-status]'), `端末内保存を開始できませんでした。${error?.message||''} 現在の素材は画面に残っています。`);for(const button of localRecoveryHost.querySelectorAll('button'))button.disabled=true; }
  }
  const onHide = event => { saveIntent.cancel(); unifiedImport?.cancel(); if (!event.persisted) destroy(); };
  const onShow = () => schedule();
  win.addEventListener('pagehide', onHide); win.addEventListener('pageshow', onShow);
  function destroy() {
    stopped = true; saveFocusGuard.destroy(); if (frame) win.cancelAnimationFrame(frame); observer.disconnect(); bodyObserver.disconnect(); navObserver?.disconnect();
    localRecovery?.dispose(); localRecoveryHost?.remove();
    for(const event of ['input','change','pixieed:text-source','pixieed:materials'])main.removeEventListener(event,recoveryChanged);
    win.removeEventListener('beforeunload',beforeRecoveryLeave);
    unifiedImport?.cancel(); resultSurface?.destroy(); unified?.destroy(); workspace.destroy(); routeChoices?.destroy();
    main.removeEventListener('input', changed); main.removeEventListener('change', changed);
    main.removeEventListener('pixieed:text-preview', schedule);
    main.removeEventListener('pixieed:text-source', textSourceChanged);
    main.removeEventListener('pixieed:input-files', committedFiles);
    main.removeEventListener('pixieed:use-generated-file', useGeneratedFile);
    main.removeEventListener('pixieed:materials', materialsChanged);
    win.removeEventListener('pagehide', onHide); win.removeEventListener('pageshow', onShow);
  }
  return { refresh: schedule, destroy, entryRecoveryReady };
}
