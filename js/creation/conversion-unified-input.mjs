import { fileOutputChoices, fileOutputSelection } from './conversion-output-destination.mjs?rev=20261105-video-size-1';
import { textRenderOutputChoices } from './conversion-text-output-choice.mjs?rev=20261105-video-size-1';
import { conversionInputReceipt } from './conversion-input-receipts.mjs?rev=20261105-video-size-1';
import { classifyConversionFile } from './conversion-input-router.mjs?rev=20261105-video-size-1';
const PURPOSES = Object.freeze({
  file: Object.freeze([
    { value: 'media', label: 'ファイル形式', mode: 'media' },
    { value: 'art', label: '文字アートに', mode: 'output' },
    { value: 'restore', label: '復元コードに', mode: 'output' },
  ]),
  text: Object.freeze([
    { value: 'text', label: '文章を画像に', action: 'text', mode: 'input' },
    { value: 'restore', label: 'コードを戻す', action: 'restore', mode: 'input' },
  ]),
});
const FILE_ART = new Set(['ascii', 'block', 'braille', 'emoji', 'custom']);
const FILE_RESTORE = new Set(['encode', 'base64', 'dataurl', 'pixels']);
const TEXT_RESTORE = new Set(['restore', 'pixels', 'document', 'dataurl', 'base64', 'auto']);
const MAX_TEXT_FILE_BYTES = 16 * 1024 * 1024;

/** Keep file intent while the same workspace edits a separate text material. */
export function createUnifiedSourceSelection(initialMode = 'media') {
  let fileMode = initialMode === 'output' ? 'output' : 'media';
  return { remember(mode) { if (mode === 'media' || mode === 'output') fileMode = mode; }, get fileMode() { return fileMode; } };
}

export function showUnifiedMaterialChoices({ mode, hasText, hasFiles }) {
  return Boolean(hasFiles && (hasText || mode === 'input'));
}

export function unifiedControlsInPanel({ mode, modal }) { return mode === 'media' && Boolean(modal); }

export function unifiedPurposeOptions(source) { return PURPOSES[source] || PURPOSES.file; }

export function unifiedPurposeForMode({ mode, source = 'file', nativeValue = '' } = {}) {
  if (mode === 'media') return 'media';
  if (mode === 'input') return nativeValue === 'text' ? 'text' : 'restore';
  if (mode === 'output') return source === 'text' ? (nativeValue === 'text' ? 'text' : 'restore') : FILE_ART.has(nativeValue) ? 'art' : 'restore';
  return source === 'text' ? 'text' : 'media';
}

export function unifiedNativeFormatForPurpose(purpose, nativeOptions = []) {
  if (purpose === 'media') return null;
  const eligible = unifiedFormatOptions('file', purpose, nativeOptions);
  const wanted = purpose === 'art' ? 'ascii' : purpose === 'restore' ? 'encode' : null;
  return eligible.find(option => option.value === wanted)?.value || eligible[0]?.value || null;
}

export function unifiedMaterialLabel(state = {}) {
  state ??= {}; // Original-file passthrough has no image/audio material controller.
  const assets = Array.isArray(state.assets) ? state.assets : [];
  if (!state.loaded && assets.length === 0) return '';
  const active = assets.find(asset => asset?.id === state.activeId) || assets[0];
  const name = active?.name || active?.file?.name || active?.label;
  return assets.length > 1 ? (name ? `${name} · ${assets.length}件` : `ファイル素材 ${assets.length}件`) : name || 'ファイル素材';
}

export function unifiedFilePurposeAvailability(file) {
  const reason = !file ? 'ファイルを1つ選んでください。'
    : file.size > MAX_TEXT_FILE_BYTES ? '16MB以下のファイルを選んでください。' : '';
  const image = Boolean(file && (/^image\//i.test(file.type || '') || /\.(png|jpe?g|gif|apng|webp|bmp|avif|svg|tiff?|tga|targa|qoi|ico|ppm|pgm|pbm|pnm|pam)$/i.test(file.name || '')));
  const artReason = reason || (!image ? '文字アートには画像ファイルを選んでください。' : '');
  return { art: !artReason, restore: !reason, artReason, restoreReason: reason };
}

export function needsUnifiedRawFileChoice({ mode, loaded, file } = {}) {
  return mode === 'media' && Boolean(loaded) && !unifiedFilePurposeAvailability(file).art;
}

export function unifiedMaterialPlacement({mode,loaded,hasMaterial}) {
  return mode==='media'&&loaded?'native-strip':hasMaterial?'shared-strip':'empty';
}
export function unifiedOutputLocation({mode,loaded,modal}) {
  return mode==='media'&&modal?'panel':mode==='media'&&loaded?'preview':'composer';
}
export function availableUnifiedOriginalFiles(currentFile, entries = []) {
  const rows=[],seen=new Set();
  for(const entry of entries){if(entry.file&&!seen.has(entry.file)){seen.add(entry.file);rows.push({value:entry.id,file:entry.file,label:entry.file.name||'元ファイル'});}}
  if(currentFile&&!seen.has(currentFile))rows.unshift({value:'current-original',file:currentFile,label:currentFile.name||'元ファイル'});
  return rows;
}

/** Filter the existing native choices; this adapter never invents an engine format. */
export function unifiedFormatOptions(source, purpose, nativeOptions = []) {
  const available = nativeOptions.filter(option => option && !option.disabled);
  if (source === 'text') {
    const purposeValues = purpose === 'restore' ? TEXT_RESTORE : new Set(['text']);
    return available.filter(option => purposeValues.has(option.value));
  }
  const values = purpose === 'art' ? FILE_ART : purpose === 'restore' ? FILE_RESTORE : null;
  return values ? available.filter(option => values.has(option.value)) : available;
}


/** Avoid observer feedback when a render repeats the same DOM state. */
export function writeUnifiedProperty(node, key, value) { if (node[key] !== value) node[key] = value; }
export function writeUnifiedAttribute(node, key, value) { if (node.getAttribute(key) !== value) node.setAttribute(key, value); }

/** Return original native nodes before removing adapter wrappers. */
export function restoreUnifiedNodePositions(positions) {
  const pending = positions.filter(item => item.parent).slice();
  const moved = new Set(pending.map(item => item.node));
  while (pending.length) {
    const ready = pending.filter(item => !item.next || item.next.parentNode === item.parent || !moved.has(item.next));
    // If an outside owner removed a reference node, preserve native nodes by appending.
    const batch = ready.length ? ready : pending.slice();
    for (const item of batch) {
      item.parent.insertBefore(item.node, item.next?.parentNode === item.parent ? item.next : null);
      moved.delete(item.node); pending.splice(pending.indexOf(item), 1);
    }
  }
}

export function mountUnifiedConversionInput({ main, toolbar, doc = document, win = window, getMode, setMode, acceptFiles, choose, formatController, isBusy = () => false, schedule = () => {}, getInputs = () => [], retryInput, holdInput, openInput } = {}) {
  const root = main?.querySelector('[data-text-tools]');
  const api = main?.textConversion;
  if (!main || !root || !api || typeof api.snapshot !== 'function' || typeof api.enableUnified !== 'function') return null;
  const source = root.querySelector('[data-tx-source]');
  const textFilePick = root.querySelector('[data-tx-pick]');
  const meta = root.querySelector('.tx-input-meta');
  const label = root.querySelector('label[for="tx-source"]');
  const layout = root.querySelector('.tx-layout');
  if (!source || !layout || !meta || !label || !toolbar) return null;
  const legacy = main.querySelector('.text-legacy');
  const originalPositions = [root, source, label, meta, layout.querySelector('.tx-input-card'), textFilePick].filter(Boolean).map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));
  const oldUnifiedFlag = main.getAttribute('data-unified-input');
  const oldRootFlag = root.getAttribute('data-unified-input');
  const oldRootHidden = root.hidden;
  const originalPlaceholder = source.getAttribute('placeholder');
  source.setAttribute('placeholder', '文章・コードをここに入力');
  let ownsStyle = false;
  if (legacy && root.parentNode === main) main.insertBefore(root, legacy);
  if (!doc.querySelector('link[data-unified-input-style]')) {
    const sheet = doc.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/css/conversion-unified-input.css?rev=20261105-video-size-1'; sheet.dataset.unifiedInputStyle = ''; doc.head.append(sheet);
    ownsStyle = true;
  }
  const composer = doc.createElement('section'); composer.className = 'sc-unified-composer'; composer.setAttribute('aria-label', '入力と変換の目的');
  composer.innerHTML = `<div class="sc-unified-head"><div class="sc-unified-sources" role="group" aria-label="作業する素材とファイルの追加"><button type="button" data-ui-source="text">文章・メモ</button><button type="button" data-ui-source="file">ファイル</button></div><button type="button" data-sc-unified-add>ファイルを追加</button><button type="button" data-sc-text-alternate hidden>別の文章</button></div>
    <div class="sc-unified-text"></div><div class="sc-unified-controls">
      <label>何をしますか？<select data-sc-unified-purpose></select></label>
      <label data-sc-unified-format-row><span data-sc-unified-format-label>表現</span><select data-sc-unified-format></select></label>
    </div><p class="sc-unified-guide" data-sc-unified-guide></p><div data-sc-unified-recovery role="status" hidden></div><details class="sc-input-receipts" data-sc-input-receipts hidden><summary>追加したファイル</summary><p>選んだ順に読み込みます。文章は入力欄へ追記し、画像などは素材群へ追加します。失敗した種類の後続ファイルは順序を守るため待機します。追加状態を確認し、再試行または「元ファイルを保持して次へ」を選んでください。元ファイルはこの画面を開いている間保持します。</p><ol data-sc-input-receipt-list></ol></details>`;
  root.insertBefore(composer, layout);
  const emptyAdd = composer.querySelector('[data-sc-unified-add]');
  const addSlot = main.querySelector('.sc-material-add-slot'), addHome = addSlot?.parentNode;
  const sourceStrip = composer.querySelector('.sc-unified-sources');
  const oldPickHidden = textFilePick?.hidden;
  if(textFilePick)textFilePick.hidden=true;
  const emptyArea = legacy?.querySelector('.sc-empty-state');
  const dropNote = doc.createElement('p'); dropNote.className = 'sc-unified-drop-note';
  dropNote.textContent = 'ここにファイルをドロップできます。文章は上の入力欄へそのまま入力できます。';
  if(emptyArea){emptyAdd.classList.add('sc-unified-empty-add');emptyArea.prepend(emptyAdd,dropNote);}
  const textWrap = composer.querySelector('.sc-unified-text'); textWrap.append(label, source, meta);
  const settings = doc.createElement('details'); settings.className = 'sc-unified-settings';
  settings.innerHTML = '<summary>文字の設定</summary><label class="sc-unified-original-row" hidden>文字化する元ファイル<select data-sc-unified-original></select></label>';
  const originalRow=settings.querySelector('.sc-unified-original-row'), originalChoice=settings.querySelector('[data-sc-unified-original]');
  const artRow=doc.createElement('label');artRow.className='sc-unified-art-style';artRow.hidden=true;
  artRow.innerHTML='<span>文字アートの種類</span><select data-sc-unified-art-style></select>';
  settings.insertBefore(artRow,originalRow);
  const artStyle=artRow.querySelector('select');
  const codeTools=doc.createElement('details');codeTools.className='sc-unified-code-tools';
  codeTools.innerHTML='<summary>別の用途：元ファイルを復元コードにする</summary><p>元ファイル全体を含むコードです。暗号化ではありません。文字アートとは別の変換です（16MBまで）。</p><button type="button" data-sc-unified-code-open>復元コードの設定を開く</button><label hidden data-sc-unified-code-row>コードの形式<select data-sc-unified-code-format></select></label>';
  composer.append(codeTools);
  const codeOpen=codeTools.querySelector('[data-sc-unified-code-open]'),codeRow=codeTools.querySelector('[data-sc-unified-code-row]'),codeFormat=codeRow.querySelector('select');
  const inputCard = layout.querySelector('.tx-input-card');
  if (inputCard) { settings.append(inputCard); layout.insertBefore(settings, layout.firstChild); }
  const purpose = composer.querySelector('[data-sc-unified-purpose]'), expression = composer.querySelector('[data-sc-unified-format]');
  const controls = composer.querySelector('.sc-unified-controls'), controlsHome = doc.createComment('unified output controls');
  controls.before(controlsHome);
  const textSizeRow=doc.createElement('label');textSizeRow.className='sc-unified-text-size';textSizeRow.innerHTML='<span>画像の幅</span><button type="button" data-sc-text-size-edit></button>';controls.append(textSizeRow);
  const textSizeButton=textSizeRow.querySelector('button');
  const expressionRow = composer.querySelector('[data-sc-unified-format-row]'), expressionLabel = composer.querySelector('[data-sc-unified-format-label]');
  const fileButton = composer.querySelector('[data-ui-source="file"]'), textButton = composer.querySelector('[data-ui-source="text"]');
  const nativeAction = root.querySelector('[data-tx-action]'), nativeStyle = root.querySelector('[data-tx-style]');
  if (textFilePick) settings.append(textFilePick);
  let sourceKind = 'text', priorSource = sourceKind, destroyed = false, busyState = false, composing = false, localError = '';
  const sourceSelection = createUnifiedSourceSelection(api.snapshot().mode);
  const cleanups = [];
  const listen = (node, event, fn, options) => { node.addEventListener(event, fn, options); cleanups.push(() => node.removeEventListener(event, fn, options)); };
  const optionsFrom = select => [...(select?.options || [])].map(o => ({ value: o.value, label: o.textContent.trim(), disabled: o.disabled || (o.parentElement?.tagName==='OPTGROUP'&&o.parentElement.disabled), ...(o.parentElement?.tagName==='OPTGROUP'?{group:o.parentElement.label}:{}) }));
  const currentNative = () => formatController?.snapshot?.({ busy: isBusy() }) || { available: false, options: [], value: '' };
  function setOptions(select, options, current) {
    const sig = JSON.stringify(options.map(o => [o.value, o.label, o.disabled, o.group]));
    if (select.dataset.signature !== sig) {
      const children=[];let lastGroup=null;
      for(const option of options){
        const node=doc.createElement('option');node.value=option.value;node.textContent=option.label;node.disabled=Boolean(option.disabled);
        if(option.group){if(!lastGroup||lastGroup.label!==option.group){lastGroup=doc.createElement('optgroup');lastGroup.label=option.group;children.push(lastGroup);}lastGroup.append(node);}
        else{lastGroup=null;children.push(node);}
      }
      select.replaceChildren(...children);
      select.dataset.signature = sig;
    }
    if (options.some(o => o.value === current)) select.value = current;
    else if (options.length && !options.some(o => o.value === select.value)) select.value = options[0].value;
  }
  function activeMode() { return getMode?.() || api.snapshot().mode || 'media'; }
  function activateText() {
    if (isBusy() || api.snapshot().composing) return false;
    sourceKind = 'text'; priorSource = sourceKind;
    api.setMode('input');
    update(); schedule(); return true;
  }
  function activateFile() {
    if (isBusy() || api.snapshot().composing) return false;
    sourceKind = 'file'; priorSource = sourceKind;
    const state = api.snapshot();
    if (sourceSelection.fileMode === 'media' && state.file && !materialState()?.loaded) {
      if (classifyConversionFile(state.file) === 'media') { void setPurposeValue('media'); return true; }
      api.setMode('output');
      if (currentNative().value !== 'encode') formatController?.choose?.('encode', { busy: false });
    } else api.setMode(sourceSelection.fileMode);
    update(); schedule(); return true;
  }
  async function setPurposeValue(value) {
    if (isBusy() || api.snapshot().composing) return false;
    const item = unifiedPurposeOptions(sourceKind).find(option => option.value === value);
    if (!item) return false;
    let rawFile = api.snapshot().file;
    if(sourceKind==='file'&&value!=='media'&&!(value==='art'?unifiedFilePurposeAvailability(rawFile).art:unifiedFilePurposeAvailability(rawFile).restore)){
      const candidate=availableUnifiedOriginalFiles(rawFile,getInputs()).find(entry=>value==='art'?unifiedFilePurposeAvailability(entry.file).art:unifiedFilePurposeAvailability(entry.file).restore);
      if(candidate&&api.selectFile(candidate.file))rawFile=candidate.file;
    }
    if (sourceKind === 'file' && value === 'media' && rawFile && !materialState()?.loaded) {
      if (classifyConversionFile(rawFile) !== 'media') return false;
      const imported = await acceptFiles?.([rawFile]);
      if(!imported){update();schedule();return false;}
      // Import acceptance and the selected output mode are separate boundaries.
      // Explicitly finish the mode transition before choosing a native format.
    }
    if (sourceKind === 'file' && value !== 'media' && !(value === 'art' ? unifiedFilePurposeAvailability(rawFile).art : unifiedFilePurposeAvailability(rawFile).restore)) return false;
    if (item.action && !api.setPurpose(item.action)) return false;
    if (item.mode && !api.setMode(item.mode)) return false;
    if (sourceKind === 'file' && value !== 'media') {
      const choices = currentNative().options || [];
      const current = currentNative();
      const target = unifiedFormatOptions('file',value,choices).some(option=>option.value===current.value)?current.value:unifiedNativeFormatForPurpose(value,choices);
      if (!target || (current.value !== target && !formatController?.choose?.(target, { busy: isBusy() }))) return false;
    }
    if(value==='art')settings.open=true;
    purpose.value = value; update(); schedule(); return true;
  }
  function materialState() { return main.conversionMaterials?.getState?.() || main.querySelector('#output-layout')?.conversionActions?.getMaterialState?.() || null; }
  function hasMediaMaterial() { const mat = materialState(); return Boolean(api.snapshot().file || mat?.loaded || mat?.assets?.length); }
  const receiptRows = new Map(), receiptUrls = new Map(), announcedFailures = new Set();
  function updateReceipts() {
    const entries = getInputs(), region = composer.querySelector('[data-sc-input-receipts]'), list = region.querySelector('ol');
    writeUnifiedProperty(region, 'hidden', !entries.length || (entries.length === 1 && entries[0].kind === 'media' && entries[0].status === 'ready'));
    const failures = entries.filter(entry => entry.status === 'error' || entry.status === 'cancelled' || (entry.status === 'queued' && entry.error));
    writeUnifiedProperty(region.querySelector('summary'), 'textContent', `追加したファイル（${entries.length}件${failures.length ? `・未読込${failures.length}件` : ''}）`);
    if (failures.some(entry => !announcedFailures.has(entry.id))) region.open = true;
    for (const entry of failures) announcedFailures.add(entry.id);
    for (const entry of entries) {
      let row = receiptRows.get(entry.id);
      if (!row) {
        row = doc.createElement('li'); row.dataset.inputId = entry.id;
        const name = doc.createElement('strong'), state = doc.createElement('span'), note = doc.createElement('small');
        name.dataset.receiptName = ''; state.dataset.receiptState = ''; note.dataset.receiptNote = '';
        const actions = doc.createElement('div'); actions.className = 'sc-input-receipt-actions';
        const open = doc.createElement('button'), retry = doc.createElement('button'), hold = doc.createElement('button'), original = doc.createElement('a');
        open.type = retry.type = hold.type = 'button'; open.dataset.receiptOpen = ''; retry.dataset.receiptRetry = ''; retry.textContent = '再試行'; hold.dataset.receiptHold = ''; hold.textContent = '元ファイルを保持して次へ';
        original.textContent = '元ファイルを保存'; original.dataset.receiptOriginal = ''; original.download = entry.file?.name || 'original';
        try { const url = win.URL.createObjectURL(entry.file); receiptUrls.set(entry.id, url); original.href = url; }
        catch { original.hidden = true; }
        actions.append(open, retry, hold, original); row.append(name, state, note, actions); list.append(row); receiptRows.set(entry.id, row);
      }
      const view = conversionInputReceipt(entry);
      writeUnifiedProperty(row.querySelector('[data-receipt-name]'), 'textContent', view.name);
      writeUnifiedProperty(row.querySelector('[data-receipt-state]'), 'textContent', view.state);
      const note = row.querySelector('[data-receipt-note]'); writeUnifiedProperty(note, 'textContent', view.note); writeUnifiedProperty(note, 'hidden', !view.note);
      const open = row.querySelector('[data-receipt-open]'), retry = row.querySelector('[data-receipt-retry]'), hold = row.querySelector('[data-receipt-hold]');
      writeUnifiedProperty(open, 'hidden', !view.action); writeUnifiedProperty(open, 'textContent', view.action);
      writeUnifiedProperty(retry, 'hidden', !view.retry);
      writeUnifiedProperty(retry, 'textContent', view.retryLabel);
      writeUnifiedProperty(hold, 'hidden', !view.hold);
      writeUnifiedAttribute(hold, 'aria-label', `元ファイルを保持して次へ：${view.name}`);
      writeUnifiedAttribute(open, 'aria-label', `${view.action}：${view.name}`);
      writeUnifiedAttribute(retry, 'aria-label', `${view.retryLabel}：${view.name}`);
      writeUnifiedAttribute(row.querySelector('[data-receipt-original]'), 'aria-label', `元ファイルを保存：${view.name}`);
      for (const button of [open, retry, hold]) writeUnifiedProperty(button, 'disabled', busyState);
    }
  }
  function update() {
    if (destroyed) return;
    const state = api.snapshot(); composing = Boolean(state.composing); busyState = Boolean(isBusy() || state.busy || state.importing || composing);
    const mode = activeMode(); sourceSelection.remember(mode);
    const panel = main.querySelector('#sc-settings-panel');
    const mat = materialState();
    const location = unifiedOutputLocation({mode,loaded:Boolean(mat?.loaded),modal:panel?.matches(':modal')});
    const controlsTarget = location==='panel'?panel.querySelector('.sc-panel-body'):location==='preview'?main.querySelector('.sc-preview-summary'):composer;
    if (controlsTarget && controls.parentNode !== controlsTarget) {
      const focused = controls.contains(doc.activeElement) ? doc.activeElement : null;
      if (controlsTarget === composer) composer.insertBefore(controls, controlsHome.nextSibling); else controlsTarget.prepend(controls);
      if (focused?.isConnected && !focused.disabled) focused.focus({ preventScroll: true });
    }
    const alternate = composer.querySelector('[data-sc-text-alternate]');
    writeUnifiedProperty(alternate, 'hidden', !state.alternateTextAvailable); writeUnifiedProperty(alternate, 'disabled', busyState);
    writeUnifiedProperty(alternate, 'textContent', `別の文章（${Number(state.alternateTextLength || 0).toLocaleString()}文字）`);
    if (mode === 'input') sourceKind = 'text';
    else if (mode === 'output') sourceKind = 'file';
    else if (mode === 'media') sourceKind = 'file';
    const sourceChanged = sourceKind !== priorSource;
    writeUnifiedProperty(composer.dataset, 'source', sourceKind); writeUnifiedProperty(composer.dataset, 'mode', mode);
    const purposeItems = unifiedPurposeOptions(sourceKind);
    const preferredPurpose = unifiedPurposeForMode({ mode, source: sourceKind, nativeValue: sourceKind === 'text' ? nativeAction?.value : nativeStyle?.value });
    setOptions(purpose, purposeItems, preferredPurpose);
    const eligibility = unifiedFilePurposeAvailability(state.file);
    const originals=availableUnifiedOriginalFiles(state.file,getInputs());
    const canArt=originals.some(entry=>unifiedFilePurposeAvailability(entry.file).art), canCode=originals.some(entry=>unifiedFilePurposeAvailability(entry.file).restore);
    for (const option of purpose.options) {
      if (option.value === 'media') writeUnifiedProperty(option, 'disabled', Boolean(state.file && !materialState()?.loaded && classifyConversionFile(state.file) !== 'media'));
      if (option.value === 'art') writeUnifiedProperty(option, 'disabled', !canArt);
      if (option.value === 'restore' && sourceKind === 'file') writeUnifiedProperty(option, 'disabled', !canCode);
    }
    const native = sourceKind === 'text' ? optionsFrom(nativeAction) : optionsFrom(nativeStyle || null);
    const nativeState = currentNative();
    const available = nativeState.available && nativeState.options?.length ? nativeState.options : native;
    const textRender=sourceKind==='text'&&purpose.value==='text';
    const mediaSelect=main.querySelector('[data-format],#output-format-select');
    const fileSource=sourceKind==='file';
    const codeActive=fileSource&&mode==='output'&&purpose.value==='restore';
    const filtered = textRender?textRenderOutputChoices():fileSource
      ?fileOutputChoices(optionsFrom(mediaSelect),{canArt,codeActive})
      :unifiedFormatOptions(sourceKind,purpose.value,available);
    const selection=fileSource?fileOutputSelection({mode,nativeValue:nativeStyle?.value,mediaValue:mediaSelect?.value}):textRender?(state.renderFormat||'png'):nativeState.value||nativeAction?.value;
    writeUnifiedProperty(expressionRow,'hidden',!filtered.length);
    setOptions(expression,filtered,selection);
    writeUnifiedProperty(controls.dataset,'source',sourceKind);
    writeUnifiedProperty(purpose.parentElement,'hidden',fileSource);
    writeUnifiedProperty(expressionLabel,'textContent',fileSource?'出力形式':textRender?'保存形式':'文字の扱い');
    const artActive=fileSource&&mode==='output'&&purpose.value==='art';
    writeUnifiedProperty(artRow,'hidden',!artActive);
    setOptions(artStyle,unifiedFormatOptions('file','art',optionsFrom(nativeStyle)),nativeStyle?.value);
    writeUnifiedProperty(artStyle,'disabled',busyState);
    writeUnifiedProperty(codeTools,'hidden',!fileSource);
    writeUnifiedProperty(codeOpen,'hidden',codeActive);
    writeUnifiedProperty(codeOpen,'disabled',busyState||!canCode);
    writeUnifiedProperty(codeRow,'hidden',!codeActive);
    setOptions(codeFormat,unifiedFormatOptions('file','restore',optionsFrom(nativeStyle)).filter(option=>option.value!=='pixels'||eligibility.art),nativeStyle?.value);
    writeUnifiedProperty(codeFormat,'disabled',busyState);
    const snapFile = state.file;
    writeUnifiedProperty(originalRow,'hidden',mode!=='output'||!originals.length);
    setOptions(originalChoice,originals.map(entry=>({...entry,disabled:purpose.value==='art'||nativeStyle?.value==='pixels'?!unifiedFilePurposeAvailability(entry.file).art:!unifiedFilePurposeAvailability(entry.file).restore})),originals.find(entry=>entry.file===state.file)?.value);
    writeUnifiedProperty(originalChoice,'disabled',busyState);
    writeUnifiedProperty(textSizeRow,'hidden',!textRender&&!artActive);
    writeUnifiedProperty(textSizeRow.querySelector('span'),'textContent',artActive?'横の文字数':'画像の幅');
    writeUnifiedProperty(textSizeButton,'textContent',artActive?`${root.querySelector('[data-tx-columns]')?.value||'—'}文字`:`${root.querySelector('[data-tx-width]')?.value||'—'}px`);
    writeUnifiedProperty(textSizeButton,'disabled',busyState);
    const filename = sourceSelection.fileMode === 'output' ? snapFile?.name || unifiedMaterialLabel(mat) : unifiedMaterialLabel(mat) || snapFile?.name || '';
    const hasText = Boolean(state.text?.trim());
    const sources = sourceStrip;
    const hasMaterial=Boolean(state.text?.length||mat?.loaded||(mode!=='media'&&state.file));
    const placement=unifiedMaterialPlacement({mode,loaded:Boolean(mat?.loaded),hasMaterial});
    if(addSlot){const destination=placement==='shared-strip'?sources:addHome;if(destination&&addSlot.parentNode!==destination)destination.append(addSlot);writeUnifiedAttribute(addSlot,'role',placement==='shared-strip'?'presentation':'listitem');}
    const emptyTarget=mode==='media'&&emptyArea?emptyArea:composer.querySelector('.sc-unified-head');
    if(emptyAdd.parentNode!==emptyTarget)emptyTarget.prepend(emptyAdd);
    writeUnifiedProperty(emptyAdd,'hidden',hasMaterial);
    writeUnifiedProperty(dropNote,'hidden',hasMaterial);
    writeUnifiedProperty(textButton, 'hidden', !hasText); writeUnifiedProperty(fileButton, 'hidden', !hasMediaMaterial());
    writeUnifiedProperty(sources, 'hidden', placement!=='shared-strip'&&!showUnifiedMaterialChoices({ mode, hasText, hasFiles: hasMediaMaterial() }));
    writeUnifiedProperty(fileButton, 'textContent', filename ? `📄 ${filename}` : 'ファイル素材');
    writeUnifiedAttribute(fileButton, 'aria-pressed', String(sourceKind === 'file'));
    writeUnifiedAttribute(textButton, 'aria-pressed', String(sourceKind === 'text'));
    for (const button of [textButton, fileButton, purpose, expression, emptyAdd]) writeUnifiedProperty(button, 'disabled', busyState);
    const guide = composer.querySelector('[data-sc-unified-guide]');
    const guideText = sourceKind === 'text'
      ? (purpose.value === 'restore' ? '自動判定は案内だけに使います。Base64も復元方法を選ぶまで変換しません。' : '文章をそのまま画像にします。IME入力中は切替を待ちます。')
      : purpose.value === 'art' ? (eligibility.art ? `元ファイル「${state.file?.name || '未選択'}」の先頭コマを文字化します（16MBまで）。編集したコマ順とは別です。` : eligibility.artReason)
      : purpose.value === 'restore' ? (eligibility.restore ? (nativeStyle?.value === 'pixels' ? 'RGBA画素を文字で保存します（65,536画素まで）。元ファイルの付加情報は含みません。' : `元ファイル「${state.file?.name || '未選択'}」全体をコード化します。暗号化ではありません。`) : eligibility.restoreReason) : '出力形式から画像の文字アートも選べます（元画像の先頭コマ・16MBまで）。';
    writeUnifiedProperty(guide, 'textContent', localError || guideText);
    updateReceipts();
    priorSource = sourceKind;
  }
  api.enableUnified();
  main.dataset.unifiedInput = 'true';
  root.dataset.unifiedInput = 'true';
  const onTextInput = event => {
    if (event.isComposing || api.snapshot().composing) { schedule(); return; }
    if (source.value.trim()) { sourceKind = 'text'; api.setMode('input'); }
    update(); schedule();
  };
  listen(source, 'input', onTextInput);
  listen(source, 'compositionend', () => { if (source.value.trim()) { sourceKind = 'text'; api.setMode('input'); } update(); schedule(); });
  listen(textButton, 'click', activateText); listen(fileButton, 'click', activateFile);
  listen(originalChoice,'change',()=>{
    if(isBusy()||api.snapshot().composing)return;
    const selected=availableUnifiedOriginalFiles(api.snapshot().file,getInputs()).find(entry=>entry.value===originalChoice.value);
    if(selected)api.selectFile(selected.file);update();schedule();
  });
  listen(textSizeButton,'click',()=>{settings.open=true;const field=root.querySelector(activeMode()==='output'?'[data-tx-columns]':'[data-tx-width]');for(let node=field?.parentElement;node&&node!==settings;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;field?.focus();});
  listen(composer.querySelector('[data-sc-input-receipt-list]'), 'click', event => {
    const action = event.target.closest('button[data-receipt-open],button[data-receipt-retry],button[data-receipt-hold]');
    if (!action || busyState || api.snapshot().composing) return;
    const id = action.closest('[data-input-id]')?.dataset.inputId, entry = getInputs().find(item => item.id === id);
    if (!entry) return;
    try {
      if (action.matches('[data-receipt-retry],[data-receipt-hold]')) {
        const operation = action.matches('[data-receipt-hold]') ? holdInput : retryInput;
        void Promise.resolve(operation?.(id)).catch(error => { localError = error?.message || '処理を再開できませんでした。元ファイルは保持しています。'; update(); schedule(); });
      } else if (openInput?.(entry) === false) localError = 'この素材を表示できませんでした。元ファイルと入力内容は保持しています。';
    } catch (error) { localError = error?.message || '素材を開けませんでした。元ファイルは保持しています。'; }
    update(); schedule();
  });
  listen(purpose, 'change', async () => {
    localError = '';
    try { await setPurposeValue(purpose.value); }
    catch (error) { localError = error?.message || '目的を変更できませんでした。素材と現在の設定は保持しています。'; }
    update(); schedule();
  });
  async function chooseFileOutput(value) {
    if(value==='text-art')return setPurposeValue('art');
    const mediaSelect=main.querySelector('[data-format],#output-format-select');
    if(!optionsFrom(mediaSelect).some(option=>option.value===value&&!option.disabled))return false;
    if(!await setPurposeValue('media'))return false;
    const current=currentNative();
    return current.value===value||Boolean(formatController?.choose?.(value,{busy:isBusy()}));
  }
  const changeFileStyle=select=>{
    if(isBusy()||api.snapshot().composing)return;
    localError='';
    try{const state=currentNative();if(state.value!==select.value&&!formatController?.choose?.(select.value,{busy:isBusy()}))localError='この形式を選べません。素材と設定は保持しています。';}
    catch(error){localError=error?.message||'形式を変更できませんでした。';}
    update();schedule();
  };
  listen(artStyle,'change',()=>changeFileStyle(artStyle));
  listen(codeFormat,'change',()=>changeFileStyle(codeFormat));
  listen(codeOpen,'click',async()=>{
    if(isBusy()||api.snapshot().composing)return;
    localError='';
    try{if(await setPurposeValue('restore')){settings.open=true;codeTools.open=true;codeFormat.focus();}}
    catch(error){localError=error?.message||'復元コードの設定を開けませんでした。素材は保持しています。';}
    update();schedule();
  });
  listen(expression, 'change', event => {
    localError = '';
    try {
      if (!isBusy() && !api.snapshot().composing) {
        if (sourceKind === 'text') { if(purpose.value==='text'){event.stopPropagation();api.setRenderFormat(expression.value);}else api.setPurpose(expression.value); }
        else {event.stopPropagation();void chooseFileOutput(expression.value).then(ok=>{if(!ok)localError='この出力形式を選べません。素材と設定は保持しています。';update();schedule();}).catch(error=>{localError=error?.message||'出力形式を変更できませんでした。';update();schedule();});}
      }
    } catch (error) { localError = error?.message || '形式を変更できませんでした。現在の設定を確認してください。'; }
    update(); schedule();
  });
  listen(emptyAdd, 'click', () => { if (!isBusy() && !api.snapshot().composing) choose?.(); });
  listen(composer.querySelector('[data-sc-text-alternate]'), 'click', () => { if (!isBusy() && !api.snapshot().composing) { api.swapDraft?.(); schedule(); } });
  listen(toolbar, 'click', event => {
    const settingsButton = event.target.closest('[data-sc-settings-open]');
    if (!settingsButton || activeMode() === 'media') return;
    event.preventDefault(); event.stopImmediatePropagation(); settings.open = true; settings.querySelector('summary')?.focus();
  }, true);
  const unsubscribe = api.subscribe?.(() => { localError = ''; update(); }); if (unsubscribe) cleanups.push(unsubscribe);
  update();
  return { update, destroy() {
    destroyed = true; for (const cleanup of cleanups.splice(0)) cleanup();
    if(addSlot&&addHome){if(addSlot.parentNode!==addHome)addHome.append(addSlot);addSlot.setAttribute('role','listitem');}
    if(textFilePick)textFilePick.hidden=oldPickHidden;
    restoreUnifiedNodePositions(originalPositions);
    for (const url of receiptUrls.values()) win.URL.revokeObjectURL(url); receiptUrls.clear();
    controls.remove(); composer.remove(); settings.remove(); dropNote.remove(); emptyAdd.remove();
    if (oldUnifiedFlag === null) main.removeAttribute('data-unified-input'); else main.setAttribute('data-unified-input', oldUnifiedFlag);
    if (oldRootFlag === null) root.removeAttribute('data-unified-input'); else root.setAttribute('data-unified-input', oldRootFlag);
    if (originalPlaceholder === null) source.removeAttribute('placeholder'); else source.setAttribute('placeholder', originalPlaceholder);
    root.hidden = oldRootHidden; if (ownsStyle) doc.querySelector('link[data-unified-input-style]')?.remove();
  } };
}
