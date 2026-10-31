/** Local presentation: input materials, editable preview and encoded output stay distinct. */
export function saveActionLabel({ loaded, working, mode = 'media', format = '', filename = '' }) {
  if (working) return '作成中…';
  if (!loaded) return mode === 'input' ? '文字を入力' : '素材を選ぶ';
  if (mode === 'output') return 'TXTで保存';
  const extension = mode === 'media' ? format || filename.split('.').pop() : filename.includes('.') ? filename.split('.').pop() : '';
  return /^[a-z0-9]{1,8}$/i.test(extension) ? `${extension.toUpperCase()}で保存` : '変換して保存';
}

export function changedSettingChips(current, baseline) {
  if (!baseline) return [];
  const result = [];
  const add = (id, label, resetLabel, keys) => result.push({ id, label, resetLabel, keys });
  if (current.width && current.height && baseline.width && baseline.height && (current.width !== baseline.width || current.height !== baseline.height))
    add('size', `${current.width} × ${current.height}px`, `サイズを${baseline.width} × ${baseline.height}pxに戻す`, ['width', 'height']);
  for (const [key, title, suffix] of [['quality','画質','%'], ['rate','速度','倍'], ['fps','FPS',''], ['threshold','白黒しきい値',''], ['loop','再生','回'], ['bits','音声','bit'], ['background','背景','']]) {
    if (current[key] !== undefined && baseline[key] !== undefined && current[key] !== baseline[key])
      add(key, key === 'loop' && current[key] === '0' ? 'ずっと再生' : `${title} ${current[key]}${suffix}`, `${title}だけを${baseline[key]}${suffix}に戻す`, [key]);
  }
  return result;
}

/** Baselines follow an output item; adding/removing inputs never resets edited settings. */
export function createSettingBaselineTracker() {
  const contexts = new Map();
  return {
    read({ ids = [], context = 'inputs', values, replaced = false }) {
      if (!ids.length) { contexts.delete(context); return null; }
      const previous = contexts.get(context);
      if (!previous || replaced || !ids.some(id => previous.ids.includes(id))) {
        contexts.set(context, { ids: [...ids], values: { ...values } });
      } else previous.ids = [...ids];
      return contexts.get(context).values;
    },
  };
}

/** The simple engine replaces all inputs; detailed replacements target one source. */
export async function applyMaterialFiles({ api, files, intent, loaded, activeId, fallback }) {
  const selected = Array.from(files || []);
  if (!selected.length) return false;
  if (!loaded) return fallback?.(selected);
  if (intent === 'add') return api?.addFiles?.(selected) ?? false;
  if (!api?.replaceFiles) return fallback?.(selected);
  if (api.getMaterialState) return activeId ? api.replaceFiles(activeId, selected) : false;
  return api.replaceFiles(selected);
}

// Settings persistence may be part of an existing save intent (for example FPS).
export const materialChangeInvalidatesSave = detail => Boolean(detail?.changed && detail.mutation !== 'settings');

const fields = {
  width: '[data-width],#output-width', height: '[data-height],#output-height',
  quality: '[data-quality],#output-jpeg-quality', rate: '[data-rate-input]', fps: '#output-fps', threshold: '[data-threshold]',
  loop: '[data-loop],#output-loop-count', bits: '[data-bits]', background: '[data-background],#output-jpeg-background',
};

export function mountConversionStage({ main, toolbar, panel, showSettings, doc = document, win = window }) {
  const legacy = main.querySelector('.text-legacy') || main;
  const empty = legacy.querySelector('[data-drop],#output-start');
  const editor = legacy.querySelector('[data-editor],#output-layout');
  if (!empty || !editor) return { update() {}, bindActions() {}, destroy() {} };
  const surface = doc.createElement('section'); surface.className = 'sc-material-surface';
  surface.setAttribute('aria-label', '素材の追加とプレビュー');
  empty.before(surface); surface.append(empty, editor);
  const header = doc.createElement('div'); header.className = 'sc-material-heading';
  header.innerHTML = '<div><strong data-sc-material-name>素材を追加</strong><span data-sc-material-count></span></div><div class="sc-material-buttons"><button type="button" data-sc-material-add>＋ 画像を追加</button><button type="button" data-sc-material-replace>素材を差し替え</button><button type="button" data-sc-material-remove>素材を削除</button></div>';
  const list = doc.createElement('div'); list.className = 'sc-material-strip'; list.hidden = true;
  list.setAttribute('role', 'list'); list.setAttribute('aria-label', '入力素材。出力項目とは別です');
  const summary = doc.createElement('div'); summary.className = 'sc-preview-summary';
  summary.innerHTML = '<button type="button" data-sc-size-edit aria-label="出力サイズを編集">サイズ</button><p data-sc-output-bytes>保存容量は生成後に確定</p><p data-sc-preview-kind></p><p data-sc-stage-warning role="status" hidden></p>';
  const materialNote = doc.createElement('p'); materialNote.className = 'sc-material-note'; materialNote.hidden = true; materialNote.id = 'sc-material-note';
  header.append(materialNote);
  const chips = doc.createElement('div'); chips.className = 'sc-setting-chips'; chips.hidden = true;
  chips.setAttribute('aria-label', '変更した設定。各設定だけを元に戻せます');
  const feedback = doc.createElement('p'); feedback.className = 'sc-material-feedback'; feedback.hidden = true;
  feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const overlay = doc.createElement('div'); overlay.className = 'sc-material-drop-overlay'; overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true');
  overlay.textContent = 'ここにドロップして素材を追加';
  const input = doc.createElement('input'); input.type = 'file'; input.multiple = true; input.hidden = true;
  input.dataset.scMaterialFile = '';
  surface.prepend(header, list, summary, chips, feedback); surface.append(overlay, input);
  const formatRow = main.querySelector('[data-sc-format-row]');
  const anchor = doc.createComment('format settings position'); if (formatRow) formatRow.before(anchor);
  const $ = selector => surface.querySelector(selector);
  const hidden = (node, value) => { if (node && node.hidden !== value) node.hidden = value; };
  const disabled = (node, value) => { if (node.disabled !== value) node.disabled = value; };
  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  let actions = {}, state = { assets: [] }, current = {}, baseline = null, listSignature = '', chipSignature = '', pickIntent = 'replace', replaced = false, localError = '';
  const baselines = createSettingBaselineTracker(), pixels = new WeakMap(); let pixelSequence = 0;
  const pixelKey = value => { if (!value || typeof value !== 'object') return 0; if (!pixels.has(value)) pixels.set(value, ++pixelSequence); return pixels.get(value); };
  const api = () => main.conversionMaterials || main.querySelector('#output-layout')?.conversionActions;
  const getState = () => api()?.getState?.() || api()?.getMaterialState?.() || { assets: [], loaded: false };
  const activeAsset = () => state.assets.find(asset => asset.id === state.activeId) || state.assets[0];
  const readSettings = (visibleOnly = true) => Object.fromEntries(Object.entries(fields).flatMap(([key, selector]) => {
    const field = main.querySelector(selector); return field && (!visibleOnly || !field.closest('[hidden]')) ? [[key, field.value]] : [];
  }));
  function reveal(key) {
    showSettings();
    const field = main.querySelector(fields[key] || fields.width);
    if (!field) return;
    for (let p = field.parentElement; p && p !== panel; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    win.requestAnimationFrame(() => { field.focus({ preventScroll: true }); field.scrollIntoView({ block: 'nearest' }); });
  }
  function choose(intent) {
    if (current.working) return;
    pickIntent = intent;
    const native = main.querySelector('[data-file],#output-file-input');
    input.accept = native?.accept || 'image/*,audio/*,video/*';
    input.multiple = intent === 'add' || !current.loaded || Boolean(main.conversionMaterials);
    input.value = ''; input.click();
  }
  async function accept(files, intent) {
    if (!files?.length || current.working) return;
    const materialApi = api(); localError = '';
    if (intent === 'add' && state.canAdd === false) {
      localError = 'この素材には追加できません。「素材を差し替え」か、詳細ワークスペースの素材管理を使ってください。';
    } else try {
      const ok = await applyMaterialFiles({ api: materialApi, files, intent, loaded: current.loaded,
        activeId: activeAsset()?.id, fallback: actions.replace });
      if (ok === true) { replaced = intent === 'replace'; listSignature = ''; }
    } catch (error) { localError = error?.message || '素材を読み込めませんでした。素材と設定は保持しています。'; }
    actions.refresh?.();
  }
  $('[data-sc-material-add]').addEventListener('click', () => choose(current.loaded ? 'add' : 'replace'));
  $('[data-sc-material-replace]').addEventListener('click', () => choose('replace'));
  $('[data-sc-material-remove]').addEventListener('click', async () => { const asset = activeAsset(); if (asset && !current.working && asset.canRemove !== false) { await api()?.removeAsset?.(asset.id); actions.refresh?.(); } });
  input.addEventListener('change', () => { const files = Array.from(input.files || []); input.value = ''; void accept(files, pickIntent); });
  $('[data-sc-size-edit]').addEventListener('click', () => reveal('width'));
  list.addEventListener('click', async event => {
    const remove = event.target.closest('[data-remove-material]');
    if (remove && !current.working) { await api()?.removeAsset?.(remove.dataset.removeMaterial); actions.refresh?.(); }
  });
  chips.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || current.working) return;
    const chip = changedSettingChips(readSettings(), baseline).find(x => x.id === button.dataset.settingChip);
    if (!chip) return;
    if (!button.dataset.resetSetting) { reveal(chip.keys[0]); return; }
    for (const key of chip.keys) {
      const field = main.querySelector(fields[key]); if (!field || field.disabled) continue;
      field.value = baseline[key]; field.dispatchEvent(new win.Event('input', { bubbles: true })); field.dispatchEvent(new win.Event('change', { bubbles: true }));
    }
    actions.refresh?.();
  });
  const fileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  surface.addEventListener('dragenter', event => { if (!fileDrag(event) || current.working) return; event.preventDefault(); hidden(overlay, false); });
  surface.addEventListener('dragover', event => { if (!fileDrag(event) || current.working) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; hidden(overlay, false); });
  surface.addEventListener('dragleave', event => { if (!surface.contains(event.relatedTarget)) hidden(overlay, true); });
  const clearDrag = () => hidden(overlay, true);
  win.addEventListener('dragend', clearDrag);
  surface.addEventListener('drop', event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); hidden(overlay, true);
    void accept(Array.from(event.dataTransfer?.files || []), current.loaded ? 'add' : 'replace');
  }, true); // Capture prevents the original empty-state drop handler importing twice.
  function renderList() {
    if (state.assets.length < 2) { if (list.childElementCount) list.replaceChildren(); listSignature = ''; return; }
    const signature = JSON.stringify(state.assets.map(a => [a.id, a.name, a.kind, pixelKey(a.firstFrame?.data)]));
    if (signature === listSignature) return;
    listSignature = signature; list.replaceChildren();
    for (const asset of state.assets) {
      const item = doc.createElement('div'); item.className = 'sc-material-thumb'; item.setAttribute('role', 'listitem');
      const first = asset.firstFrame;
      if (first?.data && first.width > 0 && first.height > 0) try {
        const raw = doc.createElement('canvas'); raw.width = first.width; raw.height = first.height;
        raw.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(first.data), first.width, first.height), 0, 0);
        const canvas = doc.createElement('canvas'); canvas.width = 48; canvas.height = 48;
        const ratio = Math.min(48 / first.width, 48 / first.height), w = first.width * ratio, h = first.height * ratio;
        canvas.getContext('2d').drawImage(raw, (48 - w) / 2, (48 - h) / 2, w, h); raw.width = raw.height = 1;
        canvas.setAttribute('aria-hidden', 'true'); item.append(canvas);
      } catch { /* A failed thumbnail never blocks material controls or saving. */ }
      const name = doc.createElement('span'); name.textContent = asset.name; item.append(name);
      const remove = doc.createElement('button'); remove.type = 'button'; remove.textContent = '削除'; remove.dataset.removeMaterial = asset.id;
      remove.disabled = asset.canRemove === false || current.working; remove.setAttribute('aria-label', `${asset.name}を素材から削除`); remove.title = asset.removeReason || '';
      item.append(remove); list.append(item);
    }
  }
  function update(next) {
    current = next; const nativeState = getState(); state = { ...nativeState, assets: nativeState.assets || [] };
    const enabled = Boolean(next.media);
    surface.dataset.loaded = String(Boolean(next.loaded));
    main.classList.add('has-conversion-stage');
    if (formatRow) {
      if (enabled && next.loaded && formatRow.parentElement !== summary) summary.prepend(formatRow);
      else if ((!enabled || !next.loaded) && formatRow.parentElement === summary) anchor.after(formatRow);
    }
    hidden(header, !enabled || !next.loaded); hidden(summary, !enabled || !next.loaded); hidden(list, !enabled || state.assets.length < 2);
    baseline = baselines.read({ ids: state.assets.map(asset => asset.id), context: state.activeItemId ? `output:${state.activeItemId}:${state.activeId}` : 'inputs', values: readSettings(false), replaced });
    replaced = false;
    const name = state.assets.length === 1 ? state.assets[0].name : state.assets.length > 1 ? '素材を確認' : next.loaded ? '素材のプレビュー' : '素材を追加';
    text($('[data-sc-material-name]'), name);
    text($('[data-sc-material-count]'), state.assets.length ? `${state.assets.length}${state.grouped ? '素材グループ' : '素材'}${state.frameCount > 1 ? ` · ${state.frameCount}コマ` : ''}` : '画像・動画・音声');
    const add = $('[data-sc-material-add]'), replace = $('[data-sc-material-replace]'), remove = $('[data-sc-material-remove]');
    text(add, next.loaded ? main.conversionMaterials ? '＋ 画像を追加' : '＋ 素材を追加' : '素材を選ぶ');
    hidden(add, next.loaded && state.canAdd === false && !state.busy && Boolean(main.conversionMaterials)); disabled(add, Boolean(next.working));
    const selected = activeAsset();
    hidden(replace, !next.loaded); disabled(replace, Boolean(next.working || state.canReplace === false || selected?.canReplace === false));
    text(replace, main.conversionMaterials && state.assets.length > 1 ? '全素材を差し替え' : '素材を差し替え');
    replace.title = selected?.replaceReason || '';
    replace.setAttribute('aria-label', main.conversionMaterials ? (state.assets.length > 1 ? '入力素材すべてを差し替え' : '入力素材を差し替え') : `${selected?.name || '選択中の素材'}を差し替え`);
    const only = state.assets[0]; hidden(remove, !next.loaded || state.assets.length !== 1 || !api()?.removeAsset);
    disabled(remove, Boolean(next.working || only?.canRemove === false)); remove.title = only?.removeReason || '';
    remove.setAttribute('aria-describedby', materialNote.id); replace.setAttribute('aria-describedby', materialNote.id);
    const reason = !next.working && next.loaded ? (only?.canRemove === false && state.assets.length === 1 ? only.removeReason : selected?.canReplace === false ? selected.replaceReason : '') : '';
    hidden(materialNote, !reason); text(materialNote, reason);
    renderList(); for (const button of list.querySelectorAll('button')) { const asset = state.assets.find(a => a.id === button.dataset.removeMaterial); disabled(button, Boolean(next.working || asset?.canRemove === false)); button.title = asset?.removeReason || ''; }
    const values = readSettings();
    const dims = values.width && values.height ? `${values.width} × ${values.height}px` : '';
    hidden($('[data-sc-size-edit]'), !dims); text($('[data-sc-size-edit]'), dims || 'サイズ');
    text($('[data-sc-preview-kind]'), main.dataset.workspaceInspectResult === 'true' ? '保存するファイルのプレビュー' : state.previewKind === 'output' ? (next.ready ? '現在の出力プレビュー' : '前回の出力プレビュー · 保存で変更を反映') : '素材のプレビュー · 色数・画質は保存形式で変わります');
    const outputFormat = main.querySelector('[data-sc-format]')?.value || '';
    const isStill = /^(png|jpeg|webp|bmp|tiff|tga|qoi|ico|ppm|pgm|pbm|pnm|pam|svg)$/.test(outputFormat);
    const notice = [outputFormat === 'jpeg' ? 'JPEGでは透過を背景色に合成します。' : outputFormat === 'gif' ? 'GIFは最大256色・半透明を保持しません。' : '', state.frameCount > 1 && isStill ? '選んだ1コマを静止画で保存します。' : ''].filter(Boolean).join(' ');
    text($('[data-sc-stage-warning]'), notice); hidden($('[data-sc-stage-warning]'), !notice);
    const size = next.ready ? next.link?.textContent?.match(/[\d,.]+\s*(?:KB|MB|bytes|バイト)/i)?.[0] : '';
    text($('[data-sc-output-bytes]'), size ? `実出力 ${size}` : '保存容量は生成後に確定');
    const changed = changedSettingChips(values, baseline), signature = JSON.stringify(changed);
    hidden(chips, !enabled || !next.loaded || !changed.length);
    if (signature !== chipSignature) {
      chipSignature = signature; chips.replaceChildren();
      for (const chip of changed) {
        const group = doc.createElement('span');
        const edit = doc.createElement('button'); edit.type = 'button'; edit.textContent = chip.label; edit.dataset.settingChip = chip.id; edit.setAttribute('aria-label', `${chip.label}を編集`);
        const reset = doc.createElement('button'); reset.type = 'button'; reset.textContent = '戻す'; reset.dataset.settingChip = chip.id; reset.dataset.resetSetting = 'true'; reset.setAttribute('aria-label', chip.resetLabel);
        group.append(edit, reset); chips.append(group);
      }
    }
    for (const button of chips.querySelectorAll('button')) disabled(button, Boolean(next.working));
    const error = /できません|できませんでした|失敗|不正|超え|読み込めません|対応していません|専用|以内|上限/.test(next.status || '');
    hidden(feedback, !enabled || !(localError || error)); if (localError || error) text(feedback, localError || next.status);
    const frames = state.frameCount || 0;
    main.classList.toggle('sc-single-material', state.assets.length === 1 && frames <= 1);
    if (!enabled || next.working) hidden(overlay, true);
  }
  return { update, bindActions(value) { actions = value; }, destroy() { hidden(overlay, true); win.removeEventListener('dragend', clearDrag); } };
}
