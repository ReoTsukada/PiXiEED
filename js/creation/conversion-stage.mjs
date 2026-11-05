import { createConversionSettingsController, changedSettingChips, createSettingBaselineTracker } from './conversion-settings-controller.mjs?rev=20261104-controllers-2';
import { createConversionSettingsBridge } from './conversion-settings-bridge.mjs?rev=20261104-controllers-2';
import { createConversionMaterialController, applyMaterialFiles } from './conversion-material-controller.mjs?rev=20261104-controllers-2';
export { changedSettingChips, createSettingBaselineTracker } from './conversion-settings-controller.mjs?rev=20261104-controllers-2';
export { applyMaterialFiles } from './conversion-material-controller.mjs?rev=20261104-controllers-2';
import { formatControlDestination, materialKindLabel } from './conversion-clarity.mjs?rev=20261101-direct-material-1';

/** Local presentation: input materials, editable preview and encoded output stay distinct. */
export function saveActionLabel({ loaded, working, mode = 'media', format = '', filename = '' }) {
  if (working) return '作成中…';
  if (!loaded) return mode === 'input' ? '文字を入力' : '素材を選ぶ';
  if (mode === 'output') return 'TXTで保存';
  const extension = mode === 'media' ? format || filename.split('.').pop() : filename.includes('.') ? filename.split('.').pop() : '';
  return /^[a-z0-9]{1,8}$/i.test(extension) ? `${extension.toUpperCase()}で保存` : '変換して保存';
}

// Settings persistence may be part of an existing save intent (for example FPS).
export const materialChangeInvalidatesSave = detail => Boolean(detail?.changed && detail.mutation !== 'settings');

/** Own one deferred focus move until a newer operation or user interaction takes focus. */
export function createDeferredFocusGuard({ doc = document, win = window } = {}) {
  let interaction = 0, sequence = 0, destroyed = false;
  const invalidate = () => { interaction++; };
  for (const type of ['pointerdown', 'keydown', 'focusin']) doc.addEventListener(type, invalidate, true);
  return {
    begin(owner = doc.activeElement) {
      if (destroyed) return null;
      return { sequence: ++sequence, interaction, owner };
    },
    schedule(ticket, callback, succeeded = true) {
      if (!ticket || destroyed || !succeeded) return;
      win.requestAnimationFrame(() => {
        if (destroyed || ticket.sequence !== sequence || ticket.interaction !== interaction) return;
        const active = doc.activeElement;
        if (active !== ticket.owner && active !== doc.body && active !== doc.documentElement) return;
        callback();
      });
    },
    invalidate() { sequence++; },
    destroy() {
      if (destroyed) return;
      destroyed = true; sequence++;
      for (const type of ['pointerdown', 'keydown', 'focusin']) doc.removeEventListener(type, invalidate, true);
    },
  };
}

/** Enlarge the existing native chooser while keeping its registered click handler. */
export function enhanceEmptyChooserButton(button, { title, category, instruction, hint } = {}) {
  if (!button || button.dataset.scEmptyChooserEnhanced === 'true') return button;
  const doc = button.ownerDocument;
  const decoration = button.querySelector('[aria-hidden="true"]');
  button.replaceChildren();
  if (decoration) button.append(decoration);
  for (const [className, value] of [
    ['sc-empty-chooser__title', title || 'ファイルを追加'],
    ['sc-empty-chooser__category', category || '画像・動画・音声'],
    ['sc-empty-chooser__instruction', instruction || 'クリックまたはドロップでファイルを選択'],
    ['sc-empty-chooser__hint', hint || '複数選択・ドロップ対応'],
  ]) {
    const copy = doc.createElement('span');
    copy.className = className;
    copy.textContent = value;
    button.append(copy);
  }
  button.classList.add('sc-empty-chooser');
  button.dataset.scEmptyChooserEnhanced = 'true';
  return button;
}

/** Keep the single native add control after every material card on each list rebuild. */
export function renderMaterialList(list, cards, addSlot) {
  list.replaceChildren(...cards, addSlot);
}

/** Unified input delegates additions to the shared chooser; fallback keeps native intent. */
export function invokeMaterialAdd({ main, actions = {}, choose = () => {}, loaded = false } = {}) {
  if (main?.dataset?.unifiedInput === 'true' && typeof actions.add === 'function') return actions.add();
  return choose(loaded ? 'add' : 'replace');
}

export function isMaterialAddDisabled({ working = false, unified = false, canAdd = true } = {}) {
  return Boolean(working || (!unified && canAdd === false));
}

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
  const chooser = empty.querySelector('[data-pick],#output-start-choose');
  if (chooser) {
    const simpleEmpty = empty.matches('[data-drop]');
    const hint = simpleEmpty ? empty.querySelector('small')?.textContent : chooser.querySelector('small')?.textContent;
    empty.classList.add('sc-empty-state');
    enhanceEmptyChooserButton(chooser, {
      title: 'ファイルを追加',
      category: '画像・動画・音声',
      instruction: 'ファイルをドロップするか、ここを押して選択',
      hint,
    });
  }
  const surface = doc.createElement('section'); surface.className = 'sc-material-surface';
  surface.setAttribute('aria-label', '素材の追加とプレビュー');
  empty.before(surface); surface.append(empty, editor);
  const undo = doc.createElement('div'); undo.className = 'sc-material-undo'; undo.hidden = true;
  undo.setAttribute('aria-label', '素材の削除を元に戻す'); undo.innerHTML = '<span data-sc-undo-name role="status" aria-live="polite"></span><button type="button" data-sc-material-undo>元に戻す</button>';
  const header = doc.createElement('div'); header.className = 'sc-material-heading';
  header.innerHTML = '<div><strong>素材</strong><span data-sc-material-count></span></div>';
  const list = doc.createElement('div'); list.className = 'sc-material-strip';
  list.setAttribute('role', 'list'); list.setAttribute('aria-label', '入力素材。出力項目とは別です');
  const addSlot = doc.createElement('div'); addSlot.className = 'sc-material-add-slot'; addSlot.setAttribute('role', 'listitem');
  const addButton = doc.createElement('button'); addButton.type = 'button'; addButton.dataset.scMaterialAdd = ''; addButton.textContent = '＋ 素材を追加'; addSlot.append(addButton);
  // Unified input mounts before the first update and must adopt this same slot.
  // Deferring insertion until renderList would strand text-only input without add.
  list.append(addSlot);
  const summary = doc.createElement('div'); summary.className = 'sc-preview-summary';
  summary.setAttribute('aria-label', '保存するファイル');
  summary.innerHTML = '<strong class="sc-output-group-title">保存するファイル</strong><div class="sc-size-control"><span>出力サイズ</span><button type="button" data-sc-size-edit aria-label="出力サイズを編集">サイズを編集</button><button type="button" data-size-reset data-setting-chip="size" data-reset-setting="true" hidden>元のサイズ</button></div><p data-sc-output-bytes>保存容量は生成後に確定</p><p data-sc-preview-kind></p><p id="sc-stage-warning" data-sc-stage-warning role="status" hidden></p>';
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
  surface.prepend(undo, summary, chips, feedback); surface.append(header, list, overlay, input);
  const formatRow = main.querySelector('[data-sc-format-row]');
  const anchor = doc.createComment('format settings position'); if (formatRow) formatRow.before(anchor);
  const $ = selector => surface.querySelector(selector) || main.querySelector(selector);
  const focusGuard = createDeferredFocusGuard({ doc, win });
  const hidden = (node, value) => { if (node && node.hidden !== value) node.hidden = value; };
  const disabled = (node, value) => { if (node.disabled !== value) node.disabled = value; };
  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  let actions = {}, state = { assets: [] }, current = {}, baseline = null, listSignature = '', chipSignature = '', pickIntent = 'replace', pickAssetId = null, replaced = false, localError = '', lastRemovedId = '';
  const baselines = createSettingBaselineTracker(), pixels = new WeakMap(); let pixelSequence = 0;
  const pixelKey = value => { if (!value || typeof value !== 'object') return 0; if (!pixels.has(value)) pixels.set(value, ++pixelSequence); return pixels.get(value); };
  const api = () => main.conversionMaterials || main.querySelector('#output-layout')?.conversionActions;
  const getState = () => api()?.getState?.() || api()?.getMaterialState?.() || { assets: [], loaded: false };
  const invokeMaterial = (name, ...args) => { const native = api(); return typeof native?.[name] === 'function' ? native[name](...args) : false; };
  const workingNow = () => current.working || main.getAttribute('aria-busy') === 'true' || Boolean(api()?.busy);
  const materialController = createConversionMaterialController({ read: getState, isBusy: workingNow, actions: {
    selectAsset: id => invokeMaterial('selectAsset', id), removeAsset: id => invokeMaterial('removeAsset', id),
    moveAsset: (id, direction) => invokeMaterial('moveAsset', id, direction), undoRemove: () => invokeMaterial('undoRemove'),
  } });
  const settingsController = createConversionSettingsController({ ...createConversionSettingsBridge({ main, fields, EventImpl: win.Event }), isBusy: workingNow });
  const activeAsset = () => state.assets.find(asset => asset.id === state.activeId) || state.assets[0];
  function restoreMaterialFocus(ticket, id, scrollLeft, reveal = false, succeeded = true) {
    focusGuard.schedule(ticket, () => {
      list.scrollLeft = scrollLeft;
      const buttons = Array.from(list.querySelectorAll('[data-select-material]'));
      const target = buttons.find(button => button.dataset.assetId === id) || buttons.find(button => button.getAttribute('aria-pressed') === 'true');
      (target || $('[data-sc-material-undo]') || addButton)?.focus({ preventScroll: true });
      if (reveal && target) { const bounds = list.getBoundingClientRect(), item = target.closest('.sc-material-card').getBoundingClientRect(); if (item.left < bounds.left) list.scrollLeft += item.left - bounds.left; else if (item.right > bounds.right) list.scrollLeft += item.right - bounds.right; }
    }, succeeded);
  }
  const readSettings = (visibleOnly = true) => Object.fromEntries(Object.entries(settingsController.snapshot({ visibleOnly })).map(([key, field]) => [key, field.value]));
  function resetSettings(keys) {
    localError = '';
    try { if (!settingsController.reset(keys, baseline)) localError = workingNow() ? '処理中は設定を戻せません。完了後にもう一度お試しください。' : 'この設定は現在戻せません。設定項目を確認してください。'; }
    catch (error) { localError = error?.message || '設定を戻せませんでした。現在の値を確認してください。'; }
    actions.refresh?.();
  }
  function reveal(key) {
    showSettings();
    const field = main.querySelector(fields[key] || fields.width);
    if (!field) return;
    for (let p = field.parentElement; p && p !== panel; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    win.requestAnimationFrame(() => { field.focus({ preventScroll: true }); field.scrollIntoView({ block: 'nearest' }); });
  }
  function choose(intent, targetId = null) {
    if (current.working) return;
    pickIntent = intent; pickAssetId = targetId;
    const native = main.querySelector('[data-file],#output-file-input');
    input.accept = native?.accept || 'image/*,audio/*,video/*';
    input.multiple = intent === 'add' || !current.loaded || Boolean(main.conversionMaterials);
    input.value = ''; input.click();
  }
  async function accept(files, intent, targetId = null) {
    if (!files?.length || current.working) return;
    const materialApi = api(); localError = '';
    if (intent === 'add' && state.canAdd === false) {
      localError = 'この素材には追加できません。「素材を差し替え」か、詳細ワークスペースの素材管理を使ってください。';
    } else try {
      const ok = await applyMaterialFiles({ api: materialApi, files, intent, loaded: current.loaded,
        activeId: activeAsset()?.id, targetId: intent === 'replace' ? targetId : null, fallback: actions.replace });
      if (ok === true) { replaced = intent === 'replace'; listSignature = ''; }
    } catch (error) { localError = error?.message || '素材を読み込めませんでした。素材と設定は保持しています。'; }
    actions.refresh?.();
  }
  addButton.addEventListener('click', () => { if (!current.working) invokeMaterialAdd({ main, actions, choose, loaded: current.loaded }); });
  $('[data-sc-material-undo]').addEventListener('click', async () => {
    if (current.working || !state.canUndo) return;
    const ticket = focusGuard.begin(doc.activeElement);
    const scrollLeft = list.scrollLeft; localError = '';
    let result = false;
    try { result = await materialController.undo(); } catch (error) { result = false; localError = error?.message || '削除を元に戻せませんでした。'; }
    actions.refresh?.(); restoreMaterialFocus(ticket, lastRemovedId || activeAsset()?.id, scrollLeft, false, result !== false);
  });
  input.addEventListener('change', () => { const files = Array.from(input.files || []), targetId = pickAssetId, intent = pickIntent; input.value = ''; pickAssetId = null; void accept(files, intent, targetId); });
  $('[data-sc-size-edit]').addEventListener('click', () => reveal('width'));
  $('[data-size-reset]').addEventListener('click', () => {
    if (current.working || !baseline) return;
    const chip = changedSettingChips(readSettings(), baseline).find(item => item.id === 'size');
    if (!chip) return;
    resetSettings(chip.keys);
  });
  list.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || current.working) return;
    const id = button.dataset.assetId; localError = '';
    const scrollLeft = list.scrollLeft;
    if (button.matches('[data-sc-material-replace]')) { choose('replace', id); return; }
    if (!button.matches('[data-remove-material],[data-move-material],[data-select-material]')) return;
    const ticket = focusGuard.begin(button);
    let result = true;
    try {
      if (button.matches('[data-remove-material]')) { lastRemovedId = id; result = await materialController.remove(id); }
      else if (button.matches('[data-move-material]')) result = await materialController.move(id, Number(button.dataset.moveMaterial));
      else if (button.matches('[data-select-material]')) result = await materialController.select(id);
    } catch (error) { result = false; localError = error?.message || '素材を変更できませんでした。'; }
    actions.refresh?.(); restoreMaterialFocus(ticket, button.matches('[data-select-material]') ? id : state.activeId || id, scrollLeft, false, result !== false);
  });
  list.addEventListener('keydown', async event => {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const selected = activeAsset(); if (!selected || typeof api()?.moveAsset !== 'function' || current.working) return;
      event.preventDefault(); const scrollLeft = list.scrollLeft, ticket = focusGuard.begin(doc.activeElement);
      let result = false;
      try { result = await materialController.move(selected.id, event.key === 'ArrowLeft' ? -1 : 1); } catch (error) { result = false; localError = error?.message || '素材の順序を変更できませんでした。'; }
      actions.refresh?.(); restoreMaterialFocus(ticket, selected.id, scrollLeft, true, result !== false); return;
    }
    const target = event.target.closest('[data-select-material]');
    if (!target || event.altKey || event.ctrlKey || event.metaKey || current.working) return;
    const index = state.assets.findIndex(asset => asset.id === target.dataset.assetId);
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = state.assets[Math.min(state.assets.length - 1, index + 1)];
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = state.assets[Math.max(0, index - 1)];
    if (event.key === 'Home') next = state.assets[0];
    if (event.key === 'End') next = state.assets.at(-1);
    if (event.key === 'Delete' && target.getAttribute('aria-pressed') === 'true') {
      const asset = activeAsset(); if (asset && asset.canRemove !== false) { event.preventDefault(); const scrollLeft = list.scrollLeft, ticket = focusGuard.begin(target); lastRemovedId = asset.id; let result = false; try { result = await materialController.remove(asset.id); } catch (error) { result = false; localError = error?.message || '素材を削除できませんでした。'; } actions.refresh?.(); restoreMaterialFocus(ticket, state.activeId || asset.id, scrollLeft, false, result !== false); }
      return;
    }
    if (next && next !== state.assets[index]) { event.preventDefault(); const scrollLeft = list.scrollLeft, ticket = focusGuard.begin(target); let result = false; try { result = await materialController.select(next.id); } catch (error) { result = false; localError = error?.message || '素材を選択できませんでした。'; } actions.refresh?.(); restoreMaterialFocus(ticket, next.id, scrollLeft, true, result !== false); }
  });
  chips.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || current.working) return;
    const chip = changedSettingChips(readSettings(), baseline).find(x => x.id === button.dataset.settingChip);
    if (!chip) return;
    if (!button.dataset.resetSetting) { reveal(chip.keys[0]); return; }
    resetSettings(chip.keys);
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
    const signature = JSON.stringify([state.assets.map(a => [a.id, a.name, a.kind, a.canRemove, a.removeReason, a.canReplace, pixelKey(a.firstFrame?.data)]), Boolean(state.canUndo), state.undoName, Boolean(state.busy)]);
    if (signature === listSignature) return;
    listSignature = signature; const cards = [];
    for (const asset of state.assets) {
      const selected = asset.id === state.activeId || (!state.activeId && asset === state.assets[0]);
      const item = doc.createElement('article'); item.className = 'sc-material-card'; item.setAttribute('role', 'listitem');
      item.dataset.selected = String(selected);
      const first = asset.firstFrame;
      if (first?.data && first.width > 0 && first.height > 0) try {
        const pixels = doc.createElement('canvas'); pixels.width = first.width; pixels.height = first.height;
        pixels.getContext('2d').putImageData(new win.ImageData(new Uint8ClampedArray(first.data), first.width, first.height), 0, 0);
        const preview = doc.createElement('canvas'); preview.width = preview.height = 44;
        const ratio = Math.min(44 / first.width, 44 / first.height), width = first.width * ratio, height = first.height * ratio;
        preview.getContext('2d').drawImage(pixels, (44 - width) / 2, (44 - height) / 2, width, height);
        pixels.width = pixels.height = 1; preview.className = 'sc-material-pixel'; preview.setAttribute('aria-hidden', 'true'); item.append(preview);
      } catch { /* A thumbnail failure cannot block selection or save actions. */ }
      const select = doc.createElement('button'); select.type = 'button'; select.className = 'sc-material-select';
      select.dataset.selectMaterial = ''; select.dataset.assetId = asset.id; select.setAttribute('aria-pressed', String(selected));
      select.setAttribute('aria-label', `${asset.name}, ${materialKindLabel(asset.kind)}${selected ? ', 選択中' : ''}`);
      const name = doc.createElement('strong'); name.textContent = asset.name || '名前のない素材';
      select.title = name.textContent;
      const kind = doc.createElement('span'); kind.className = 'sc-material-kind'; kind.textContent = materialKindLabel(asset.kind);
      const thumbnail = item.querySelector('.sc-material-pixel'); if (thumbnail) select.append(thumbnail);
      select.append(name, kind); item.append(select);
      const controls = doc.createElement('div'); controls.className = 'sc-material-card-actions';
      const remove = doc.createElement('button'); remove.type = 'button'; remove.textContent = '削除'; remove.dataset.removeMaterial = ''; remove.dataset.assetId = asset.id;
      remove.disabled = asset.canRemove === false || current.working; remove.setAttribute('aria-label', `${asset.name}を素材から削除`); remove.title = asset.removeReason || '';
      controls.append(remove);
      {
        const replace = doc.createElement('button'); replace.type = 'button'; replace.dataset.scMaterialReplace = '';
        replace.textContent = main.conversionMaterials && state.assets.length > 1 ? '全素材を差し替え' : '差し替え';
        replace.dataset.assetId = asset.id;
        replace.disabled = current.working || asset.canReplace === false;
        replace.setAttribute('aria-label', main.conversionMaterials && state.assets.length > 1 ? '入力素材すべてを差し替え' : `${asset.name}を差し替え`);
        replace.title = asset.replaceReason || replace.getAttribute('aria-label');
        replace.setAttribute('aria-describedby', 'sc-material-note');
        controls.append(replace);
      }
      if (state.assets.length > 1 && typeof api()?.moveAsset === 'function') {
        for (const [delta, label] of [[-1, '前へ'], [1, '次へ']]) {
          const move = doc.createElement('button'); move.type = 'button'; move.textContent = label; move.dataset.moveMaterial = String(delta); move.dataset.assetId = asset.id;
          move.disabled = current.working || (delta < 0 ? state.assets[0] === asset : state.assets.at(-1) === asset);
          move.setAttribute('aria-label', `${asset.name}を${label}移動`); controls.append(move);
        }
      }
      item.append(controls); cards.push(item);
    }
    renderMaterialList(list, cards, addSlot);
  }
  function update(next) {
    current = next; const nativeState = getState(); state = { ...nativeState, assets: nativeState.assets || [] };
    const enabled = Boolean(next.media);
    if (enabled && api()) { hidden(empty, Boolean(next.loaded)); hidden(editor, !next.loaded); }
    surface.dataset.loaded = String(Boolean(next.loaded));
    main.classList.add('has-conversion-stage');
    if (formatRow) {
      const destination = formatControlDestination({ media: enabled, loaded: Boolean(next.loaded), modal: Boolean(panel.matches(':modal')) });
      const target = destination === 'preview' && next.loaded ? summary : panel.querySelector('.sc-panel-body') || panel;
      if (formatRow.parentElement !== target) { if (target === summary) target.insertBefore(formatRow, target.querySelector('.sc-size-control')); else target.prepend(formatRow); }
    }
    hidden(header, !enabled || !next.loaded); hidden(summary, !enabled || !next.loaded); hidden(list, !enabled || !next.loaded);
    hidden(undo, !enabled || !state.canUndo); disabled($('[data-sc-material-undo]'), Boolean(next.working));
    text($('[data-sc-undo-name]'), state.undoName ? `「${state.undoName}」を削除しました。` : '素材を削除しました。');
    baseline = baselines.read({ ids: state.assets.map(asset => asset.id), context: state.activeItemId ? `output:${state.activeItemId}:${state.activeId}` : 'inputs', values: readSettings(false), replaced, retainEmpty: Boolean(state.canUndo) });
    replaced = false;
    text($('[data-sc-material-count]'), state.assets.length ? `${state.assets.length}${state.grouped ? '素材グループ' : '素材'}${state.frameCount > 1 ? ` · ${state.frameCount}コマ` : ''}` : '素材がありません');
    const selected = activeAsset();
    disabled(addButton, isMaterialAddDisabled({ working: next.working, unified: main.dataset.unifiedInput === 'true', canAdd: state.canAdd }));
    const reason = !next.working && next.loaded ? (selected?.canReplace === false ? selected.replaceReason : '') : '';
    hidden(materialNote, !reason); text(materialNote, reason);
    renderList();
    for (const card of list.querySelectorAll('.sc-material-card')) {
      const select = card.querySelector('[data-select-material]'), asset = state.assets.find(item => item.id === select.dataset.assetId);
      const selected = asset === activeAsset();
      if (card.dataset.selected !== String(selected)) card.dataset.selected = String(selected);
      if (select.getAttribute('aria-pressed') !== String(selected)) select.setAttribute('aria-pressed', String(selected));
      const label = `${asset.name}, ${materialKindLabel(asset.kind)}${selected ? ', 選択中' : ''}`;
      if (select.getAttribute('aria-label') !== label) select.setAttribute('aria-label', label);
    }
    for (const button of list.querySelectorAll('button')) {
      if (button.matches('[data-remove-material]')) {
        const asset = state.assets.find(item => item.id === button.dataset.assetId);
        disabled(button, Boolean(next.working || asset?.canRemove === false)); button.title = asset?.removeReason || '';
      } else if (button.matches('[data-select-material]')) disabled(button, Boolean(next.working));
      else if (button.matches('[data-move-material]')) { const index = state.assets.findIndex(item => item.id === button.dataset.assetId), delta = Number(button.dataset.moveMaterial); disabled(button, Boolean(next.working || index + delta < 0 || index + delta >= state.assets.length)); }
      else if (button.matches('[data-sc-material-replace]')) { const asset = state.assets.find(item => item.id === button.dataset.assetId); disabled(button, Boolean(next.working || asset?.canReplace === false)); button.title = asset?.replaceReason || button.getAttribute('aria-label'); }
    }
    const values = readSettings();
    const dims = values.width && values.height ? `${values.width} × ${values.height}px` : '';
    const dimensionIssue = main.querySelector('#output-dimension-notice:not([hidden])');
    hidden($('[data-sc-size-edit]'), !dims); text($('[data-sc-size-edit]'), dims ? `${dims}${dimensionIssue ? ' · 上限超過' : ''}` : 'サイズを編集');
    $('[data-sc-size-edit]').setAttribute('aria-describedby', 'sc-stage-warning');
    const sizeChange = changedSettingChips(values, baseline).find(chip => chip.id === 'size');
    const sizeReset = $('[data-size-reset]'); hidden(sizeReset, !sizeChange); if (sizeChange) sizeReset.setAttribute('aria-label', sizeChange.resetLabel);
    text($('[data-sc-preview-kind]'), main.dataset.workspaceInspectResult === 'true' ? '保存するファイルのプレビュー' : state.previewKind === 'output' ? (next.ready ? '現在の出力プレビュー' : '前回の出力プレビュー · 保存で変更を反映') : '元の素材');
    const outputFormat = main.querySelector('[data-sc-format]')?.value || '';
    const isStill = /^(png|jpeg|webp|bmp|tiff|tga|qoi|ico|ppm|pgm|pbm|pnm|pam|svg)$/.test(outputFormat);
    const notice = [outputFormat === 'jpeg' ? 'JPEGでは透過を背景色に合成します。' : outputFormat === 'gif' ? 'GIFは最大256色・半透明を保持しません。' : '', state.frameCount > 1 && isStill ? '選んだ1コマを静止画で保存します。' : '', dimensionIssue?.dataset.summary || ''].filter(Boolean).join(' ');
    text($('[data-sc-stage-warning]'), notice); hidden($('[data-sc-stage-warning]'), !notice);
    const size = next.ready ? next.link?.textContent?.match(/[\d,.]+\s*(?:KB|MB|bytes|バイト)/i)?.[0] : '';
    text($('[data-sc-output-bytes]'), size ? `実出力 ${size}` : '保存容量は生成後に確定');
    const changed = changedSettingChips(values, baseline), signature = JSON.stringify(changed);
    hidden(chips, !enabled || !next.loaded || !changed.length);
    if (signature !== chipSignature) {
      chipSignature = signature; chips.replaceChildren();
      for (const chip of changed) {
        if (chip.id === 'size') continue;
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
  return { update, bindActions(value) { actions = value; }, destroy() { focusGuard.destroy(); hidden(overlay, true); win.removeEventListener('dragend', clearDrag); } };
}
