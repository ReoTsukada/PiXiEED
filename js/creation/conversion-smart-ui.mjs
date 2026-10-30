import { PUBLIC_NAV_ITEMS } from '../page-navigation.mjs?rev=20261024-common-tool-start-1';

/** Presentation adapter only: all decoding, validation and saving stay in the existing engines. */
export function mountSmartConversion(doc = document, win = window) {
  const main = doc.getElementById('main');
  if (win.top !== win.self || !main || main.dataset.smartConversion || !main.querySelector('#output-start,[data-editor],[data-text-tools]')) return null;
  const $ = selector => main.querySelector(selector);
  const available = node => Boolean(node && !node.closest('[hidden]') && !node.disabled && node.getAttribute('aria-disabled') !== 'true');
  const blobLink = node => available(node) && /^blob:/.test(node.getAttribute('href') || '') ? node : null;
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const setAttr = (node, key, value) => { if (node.getAttribute(key) !== value) node.setAttribute(key, value); };
  const media = () => $('.text-legacy') || main;
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
  style('/css/public-navigation.css?rev=20261030-smart-convert-1', 'navigation');
  style('/css/conversion-smart-ui.css?rev=20261030-smart-convert-1', 'conversion');

  const toolbar = doc.createElement('section'); toolbar.className = 'sc-toolbar'; toolbar.setAttribute('aria-label', '変換の設定');
  toolbar.innerHTML = `<header class="sc-heading"><div><p>PIXIEED / CONVERT</p><h1>変換・出力</h1></div><span>端末内で処理</span></header>
    <div class="sc-route"><label>素材<select data-sc-source><option value="file">ファイル</option><option value="text">文字</option></select></label><span aria-hidden="true">→</span><label>出力先<select data-sc-target><option value="file">ファイル</option><option value="text">文字</option></select></label></div>
    <div class="sc-input-actions"><button type="button" data-sc-pick>ファイルを選ぶ</button><button type="button" data-sc-paste>文字を貼り付ける</button></div>
    <label class="sc-format" data-sc-format-row hidden><span data-sc-format-label>出力形式</span><select data-sc-format></select></label>
    <p class="sc-hint" data-sc-hint>素材を選ぶと、対応する形式と必要な設定だけを表示します。</p><input type="file" data-sc-file multiple hidden>`;
  main.prepend(toolbar);
  const ui = selector => toolbar.querySelector(selector);
  const source = ui('[data-sc-source]'), target = ui('[data-sc-target]'), format = ui('[data-sc-format]'), picker = ui('[data-sc-file]');
  const nativeInput = find('[data-file],#output-file-input');
  picker.accept = [nativeInput?.accept || 'image/*,video/*,audio/*', '.txt,.md,.json,.pxtxt,text/plain'].join(',');
  if (!$('[data-text-tools]')) { source.disabled = true; target.disabled = true; ui('[data-sc-paste]').hidden = true; }

  // Keep the original nodes and their handlers; never rebuild private handoff state.
  const fileSettings = $('#output-file-settings');
  if (fileSettings && !fileSettings.querySelector('.sc-multiple')) {
    const advanced = doc.createElement('details'); advanced.className = 'sc-multiple';
    const summary = doc.createElement('summary'); summary.textContent = '複数出力・素材の管理'; advanced.append(summary);
    for (const node of [...fileSettings.children]) if (node.matches('#output-items,#output-reward-note,.output-item-actions,#output-add-item,#output-source-label,#output-source')) advanced.append(node);
    fileSettings.append(advanced);
  }
  const button = doc.createElement('button'); button.type = 'button'; button.id = 'output-nav-export';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg><span>出力</span>';
  const buttonLabel = button.querySelector('span');
  const dock = doc.createElement('div'); dock.className = 'sc-export-status';
  dock.innerHTML = '<span class="sc-export-message" role="status" aria-live="polite"></span><button type="button" hidden>中止</button>';
  const message = dock.querySelector('span'), cancel = dock.querySelector('button');
  let nav = null, navObserver = null, frame = 0, pending = null, revision = 0, lastMode = mode();
  let lastTextUrl = '', textResultMode = '', textDirty = true, lastMediaUrl = '', mediaDirty = false;
  let sizeDirty = false, fpsDirty = false, stopped = false, controlSignature = '';
  const nativeFormat = () => mode() === 'input' ? $('[data-tx-action]') : mode() === 'output' ? $('[data-tx-style]') : find('[data-format],#output-format-select');
  const result = () => {
    if (mode() === 'media') return blobLink(find('[data-download],#output-download')) || blobLink(find('a.convert-primary[download]:not([data-previous])'));
    const live = liveText(), renderedMode = $('[data-text-tools]')?.dataset.txResultMode;
    if ((live && live.state !== 'ready') || (renderedMode && renderedMode !== mode())) return null;
    return blobLink($('[data-tx-download]')) || blobLink($('[data-tx-txt]'));
  };
  const cancelAction = () => {
    const selectors = mode() === 'media' ? '[data-cancel],#output-cancel-generation,#output-cancel-settings,#output-cancel-import' : '[data-tx-cancel],[data-tx-live-cancel]';
    return [...main.querySelectorAll(selectors)].find(available) || null;
  };
  // Live text generation does not lock its settings; only saving waits for a fresh result.
  const busy = () => main.getAttribute('aria-busy') === 'true'
    || (mode() !== 'media' && $('[data-text-tools]')?.getAttribute('aria-busy') === 'true')
    || (!liveText() && Boolean(cancelAction()))
    || (mode() === 'media' && Boolean(find('#output-format-select')?.disabled) && loaded());
  const matchesFormat = link => {
    const control = find('#output-format-select');
    if (!control || !link?.download) return true;
    const normalize = value => ({ jpg: 'jpeg', tif: 'tiff' }[value] || value);
    const extension = link.download.split('.').pop().toLowerCase();
    return normalize(extension) === normalize(control.value.toLowerCase());
  };
  const statusText = () => (mode() === 'media'
    ? (available($('#output-start')) ? $('#output-import-status') : find('[data-status],#output-status'))
    : $('[data-tx-status]'))?.textContent?.trim() || '';
  const loaded = () => mode() === 'media'
    ? available(find('[data-editor],#output-layout')) || Boolean(result())
    : mode() === 'input' ? Boolean($('[data-tx-source]')?.value.trim()) : liveText() ? liveText().hasSource : Boolean($('[data-tx-file-name]')?.textContent && !$('[data-tx-file-name]').textContent.includes('選んでください'));
  function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(() => { frame = 0; render(); }); }
  function ensureNav() {
    let next = doc.querySelector('.public-destination-nav');
    if (!next) {
      next = doc.createElement('nav'); next.className = 'mobile-nav public-destination-nav'; next.setAttribute('aria-label', 'メインナビゲーション');
      for (const item of PUBLIC_NAV_ITEMS) {
        const link = doc.createElement('a'); link.href = item.href; link.dataset.publicNav = item.key;
        const icon = doc.createElement('img'); icon.src = `/assets/icons/pixieed/${item.icon}.svg`; icon.alt = '';
        const label = doc.createElement('span'); label.textContent = item.label; link.append(icon, label); next.append(link);
      }
      doc.body.append(next);
    }
    if (next !== nav) {
      navObserver?.disconnect(); nav = next;
      navObserver = new win.MutationObserver(ensureNav); navObserver.observe(nav, { childList: true });
    }
    const center = nav.querySelector('[data-public-nav="create"]');
    if (center) center.replaceWith(button);
    else if (!nav.contains(button)) { navObserver.disconnect(); return; }
    if (!dock.isConnected) doc.body.append(dock);
    doc.body.classList.add('has-public-destination-nav', 'has-smart-conversion');
  }
  function mirrorFormat() {
    const original = nativeFormat(), row = ui('[data-sc-format-row]');
    row.hidden = !original || original.options.length === 0 || (mode() === 'media' && !loaded());
    if (row.hidden) return;
    const signature = [...original.options].map(o => `${o.value}\0${o.textContent}\0${o.disabled}`).join('\n');
    if (signature !== controlSignature) {
      format.replaceChildren(...[...original.options].map(o => o.cloneNode(true))); controlSignature = signature;
    }
    if (format.value !== original.value) format.value = original.value;
    format.disabled = busy() || original.disabled;
    setText(ui('[data-sc-format-label]'), mode() === 'input' ? '文字からつくるもの' : mode() === 'output' ? '文字の表現' : '出力形式');
  }
  function render() {
    ensureNav();
    const currentMode = mode(), locked = busy(), live = liveText();
    const working = locked || Boolean(live && ['queued','rendering'].includes(live.state));
    const link = result(), href = link?.getAttribute('href') || '';
    if (currentMode !== lastMode) { pending = null; revision++; lastMode = currentMode; }
    if (currentMode === 'media') {
      if (href && href !== lastMediaUrl && !working) { lastMediaUrl = href; mediaDirty = !matchesFormat(link); }
    } else if (href && href !== lastTextUrl && !working) {
      lastTextUrl = href; textResultMode = currentMode; textDirty = false;
    }
    source.value = currentMode === 'input' ? 'text' : 'file';
    target.value = currentMode === 'output' ? 'text' : 'file';
    target.options[1].disabled = currentMode === 'input';
    setText(target.options[0], 'ファイル');
    const hasText = Boolean($('[data-text-tools]'));
    source.disabled = locked || !hasText; target.disabled = locked || !hasText;
    ui('[data-sc-pick]').disabled = locked; ui('[data-sc-paste]').disabled = locked;
    mirrorFormat();
    main.dataset.smartLoaded = String(loaded());
    setText(ui('[data-sc-pick]'), loaded() ? '素材を変更' : 'ファイルを選ぶ');
    button.disabled = working;
    setAttr(button, 'aria-busy', String(working));
    const ready = Boolean(link && (live ? live.state === 'ready' : currentMode === 'media' ? !mediaDirty && !sizeDirty && !fpsDirty : !textDirty && textResultMode === currentMode));
    const label = working ? (live ? '更新中' : '処理中') : !loaded() ? (currentMode === 'input' ? '文字を入力' : '素材を選ぶ') : '出力';
    setText(buttonLabel, label);
    setAttr(button, 'aria-label', working ? 'プレビューを更新中' : ready ? '現在の結果を端末に保存' : loaded() ? (live ? 'プレビューを更新（保存はしません）' : '現在の設定で変換して出力') : label);
    cancel.hidden = !working || !cancelAction();
    const nativeStatus = statusText();
    const summary = working ? nativeStatus || '変換しています…' : nativeStatus || (ready ? '保存できます。中央の出力ボタンから保存。' : '素材・形式を選んで、中央から出力。');
    setText(message, summary);
    const hint = currentMode === 'input' ? '文章・文字アート・復元コードを判別します。設定は必要なときだけ開けます。'
      : currentMode === 'output' ? '設定変更でプレビューを自動更新。中央の出力で確認済みの結果を保存します。復元コードは暗号化ではありません。'
      : loaded() ? '形式に応じた設定だけを表示しています。出力ボタンは画面下に固定されています。'
      : 'ファイルを選ぶと対応形式を表示します。TXT・メモは文字入力へ自動で切り替えます。';
    setText(ui('[data-sc-hint]'), hint);
    if (pending) {
      if (pending.mode !== currentMode || pending.revision !== revision) pending = null;
      else if (working) pending.sawBusy = true;
      else if (href && href !== pending.before) {
        const completed = pending; pending = null;
        if (completed.stage === 'fps') fpsDirty = false;
        if (completed.stage === 'size') sizeDirty = false;
        if (completed.stage === 'fps' || completed.stage === 'size') beginExport();
        else if (currentMode !== 'media' || matchesFormat(link)) save(link);
        else setText(message, '選択した形式を確認してください。異なる形式の結果は自動保存しません。');
      } else if (pending.sawBusy) pending = null;
    }
  }
  function save(link) {
    if (!blobLink(link)) return;
    link.click();
    setText(message, '保存を開始しました。保存されない場合は、中央の出力をもう一度押してください。');
    button.focus({ preventScroll: true });
  }
  function validInputs(scope) {
    for (const input of scope.querySelectorAll('input,textarea,select')) {
      if (input.disabled || input.type === 'file' || input.type === 'hidden' || input.closest('[hidden]') || !input.willValidate || input.checkValidity()) continue;
      for (let parent = input.parentElement; parent && parent !== main; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      input.reportValidity(); return false;
    }
    return true;
  }
  function start(action, stage = 'convert') {
    if (!available(action)) return;
    if (!validInputs(mode() === 'media' ? media() : $('[data-text-tools]'))) return;
    pending = { mode: mode(), revision, before: result()?.getAttribute('href') || '', stage, sawBusy: false };
    action.click();
    if (pending) pending.sawBusy = busy();
    render();
    if (pending && !pending.sawBusy && !busy()) pending = null;
  }
  function choose() {
    picker.multiple = mode() === 'media';
    picker.accept = mode() === 'output' ? '' : mode() === 'input' ? $('[data-tx-text-file]')?.accept || '.txt,.md,.json,.pxtxt' : [nativeInput?.accept || 'image/*,video/*,audio/*', '.txt,.md,.json,.pxtxt,text/plain'].join(',');
    picker.click();
  }
  function beginExport() {
    if (busy() || pending) return;
    if (!loaded()) {
      if (mode() === 'input') $('[data-tx-source]')?.focus(); else choose();
      return;
    }
    const live = liveText();
    if (live) {
      // Generate/refresh only, never schedule an automatic download of an unseen result.
      if (live.state === 'ready' && result()) save(result());
      else if (!['queued','rendering'].includes(live.state)) live.refresh();
      return;
    }
    if (mode() !== 'media') {
      if (result() && !textDirty && textResultMode === mode()) save(result());
      else start($('[data-tx-run]'));
      return;
    }
    if (fpsDirty && available($('#output-apply-fps'))) { start($('#output-apply-fps'), 'fps'); return; }
    if (sizeDirty && available($('#output-apply-settings'))) { start($('#output-apply-settings'), 'size'); return; }
    const direct = result();
    if (direct && !mediaDirty) { save(direct); return; }
    const action = [find('[data-convert]'), $('#output-create-video'), $('#output-create-audio')].find(available);
    if (action) start(action);
    else if (direct && !mediaDirty) save(direct);
    else { setText(message, '設定の反映を確認してください。前回の結果は自動保存しません。'); }
  }
  function changed(event) {
    if (toolbar.contains(event.target)) return;
    const element = event.target;
    if (!element.matches('input,textarea,select') || element.matches('[data-tx-text-result],[data-scrub]')) return;
    revision++; pending = null;
    if (element.closest('[data-text-tools]') || element.type === 'file') textDirty = true;
    if (element.matches('#output-width,#output-height,#output-aspect-lock')) sizeDirty = true;
    if (element.matches('#output-fps,#output-fps-preset')) fpsDirty = true;
    if (element.closest('.output-settings,.convert-settings') && !element.closest('#output-items') && !element.matches('#output-filename,#output-aspect-lock')) mediaDirty = true;
    schedule();
  }
  function acceptFiles(files) {
    if (!files?.length || busy()) return;
    const text = files.length === 1 && /\.(txt|md|pxtxt|json)$/i.test(files[0].name);
    let input;
    if (text && mode() !== 'output' && $('[data-tx-text-file]')) { selectMode('input'); input = $('[data-tx-text-file]'); }
    else input = mode() === 'input' ? $('[data-tx-text-file]') : mode() === 'output' ? $('[data-tx-file]') : nativeInput;
    if (!input) return;
    try {
      const transfer = new win.DataTransfer(); for (const file of files) transfer.items.add(file);
      input.files = transfer.files; input.dispatchEvent(new win.Event('change', { bubbles: true }));
    } catch { setText(message, 'このブラウザーでは素材欄のファイル選択を使ってください。'); }
    schedule();
  }
  source.addEventListener('change', () => { selectMode(source.value === 'text' ? 'input' : target.value === 'text' ? 'output' : 'media'); render(); });
  target.addEventListener('change', () => { selectMode(target.value === 'text' ? 'output' : source.value === 'text' ? 'input' : 'media'); render(); });
  format.addEventListener('change', () => {
    const original = nativeFormat(); if (!original || original.disabled || busy()) return;
    original.value = format.value; original.dispatchEvent(new win.Event('change', { bubbles: true })); schedule();
  });
  ui('[data-sc-pick]').addEventListener('click', choose);
  ui('[data-sc-paste]').addEventListener('click', () => { if (selectMode('input')) { render(); $('[data-tx-source]')?.focus(); } });
  picker.addEventListener('change', () => { acceptFiles(picker.files); picker.value = ''; });
  toolbar.addEventListener('dragover', event => event.preventDefault());
  toolbar.addEventListener('drop', event => { event.preventDefault(); acceptFiles(event.dataTransfer?.files); });
  main.addEventListener('drop', event => {
    if (busy() || toolbar.contains(event.target) || event.target.closest('[data-text-tools]')) return;
    const files = event.dataTransfer?.files;
    if (files?.length === 1 && /\.(txt|md|pxtxt|json)$/i.test(files[0].name) && $('[data-tx-text-file]')) {
      event.preventDefault(); event.stopPropagation(); acceptFiles(files);
    }
  }, true);
  main.addEventListener('input', changed); main.addEventListener('change', changed);
  main.addEventListener('pixieed:text-preview', schedule);
  main.addEventListener('click', event => {
    const el = event.target.closest('button'); if (!el) return;
    if (el.matches('#output-cancel-generation,#output-cancel-settings,#output-cancel-import,[data-cancel],[data-tx-cancel],[data-tx-live-cancel]')) pending = null;
    if (el.matches('[data-rate],[data-reset],[data-apply-seconds],[data-move],.output-preset')) { mediaDirty = true; revision++; pending = null; }
    schedule();
  });
  button.addEventListener('click', beginExport);
  cancel.addEventListener('click', () => { pending = null; cancelAction()?.click(); schedule(); });
  const observer = new win.MutationObserver(records => {
    if (records.some(record => !toolbar.contains(record.target) && (
      record.type === 'attributes' || record.target.closest?.('.text-mode-nav,#output-status,#output-import-status,[data-status],[data-tx-status],select,[data-tx-file-name]')
    ))) schedule();
  });
  observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden','disabled','aria-busy','aria-pressed','href','download'] });
  const bodyObserver = new win.MutationObserver(ensureNav); bodyObserver.observe(doc.body, { childList: true });
  main.dataset.smartConversion = 'true';
  render();
  const onHide = event => { pending = null; if (!event.persisted) destroy(); };
  const onShow = () => schedule();
  win.addEventListener('pagehide', onHide); win.addEventListener('pageshow', onShow);
  function destroy() {
    stopped = true; if (frame) win.cancelAnimationFrame(frame); observer.disconnect(); bodyObserver.disconnect(); navObserver?.disconnect();
    main.removeEventListener('input', changed); main.removeEventListener('change', changed);
    main.removeEventListener('pixieed:text-preview', schedule);
    win.removeEventListener('pagehide', onHide); win.removeEventListener('pageshow', onShow);
  }
  return { refresh: schedule, destroy };
}
