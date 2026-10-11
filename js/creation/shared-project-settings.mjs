import { composeAnimationFrame } from './animation-core.mjs';

const PRESETS = [16, 32, 64, 128, 256];
const ASPECTS = [['free', '自由'], ['1:1', '1:1'], ['3:4', '3:4'], ['9:16', '9:16'], ['4:3', '4:3'], ['16:9', '16:9']];
const COLOR_COUNTS = [1, 2, 4, 8, 16, 32];

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'type') node.type = value;
    else node.setAttribute(key, String(value));
  }
  if (text) node.textContent = text;
  return node;
}

function formatSummary(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const details = [];
  if (Number.isFinite(value.croppedPixels)) details.push(`切り取られる画素 ${value.croppedPixels}`);
  if (Number.isFinite(value.remappedColors)) details.push(`色の置換 ${value.remappedColors}色`);
  if (Number.isFinite(value.musicAssignmentsAffected)) details.push(`音の割り当てに影響 ${value.musicAssignmentsAffected}件`);
  if (value.musicImpact) details.push(String(value.musicImpact));
  return details.join(' / ');
}

/** Shared project-level canvas settings. The Draw API owns preview and history commits. */
export function mountSharedProjectSettings({ draw, scope } = {}) {
  if (!draw?.getTimeline || !draw?.subscribe || !scope?.listen || !scope?.add) throw new TypeError('Shared project settings require Draw, a scope, and a timeline subscription');

  const root = el('section', { id: 'creation-project-settings', class: 'creation-project-settings', 'data-mode-owner': 'shared', 'aria-label': 'キャンバス設定' });
  const launcher = el('button', { id: 'creation-project-settings-open', type: 'button', class: 'creation-control-button', 'aria-expanded': 'false', 'aria-controls': 'creation-project-settings-panel' }, 'キャンバス');
  const panel = el('div', { id: 'creation-project-settings-panel', class: 'creation-project-settings__panel', hidden: '' });
  const panelHeader = el('header', { class: 'creation-project-settings__header' });
  panelHeader.append(el('strong', {}, 'キャンバス設定'));
  const close = el('button', { type: 'button', 'aria-label': '設定を閉じる' }, '閉じる');
  panelHeader.append(close);
  const spriteScale = el('button', { type: 'button', id: 'creation-project-sprite-scale' }, '絵の倍率');
  panelHeader.append(spriteScale);
  const form = el('form', { class: 'creation-project-settings__form' });
  const dimensions = el('div', { class: 'creation-project-settings__dimensions' });
  const width = el('input', { id: 'creation-project-width', type: 'number', min: '1', max: '256', step: '1', inputmode: 'numeric', required: '' });
  const height = el('input', { id: 'creation-project-height', type: 'number', min: '1', max: '256', step: '1', inputmode: 'numeric', required: '' });
  dimensions.append(el('label', { for: width.id }, '幅'), width, el('label', { for: height.id }, '高さ'), height);
  const ratio = el('input', { id: 'creation-project-ratio', type: 'checkbox' });
  const ratioLabel = el('label', { class: 'creation-project-settings__check' }); ratioLabel.append(ratio, document.createTextNode('縦横比を固定'));
  const aspect = el('select', { id: 'creation-project-aspect', 'aria-label': '縦横比プリセット' });
  for (const [value, label] of ASPECTS) aspect.append(el('option', { value }, label));
  const aspectLabel = el('label', { class: 'creation-project-settings__field' }, '縦横比'); aspectLabel.append(aspect);
  const presetRow = el('div', { class: 'creation-project-settings__presets', role: 'group', 'aria-label': '長辺のサイズ' });
  for (const size of PRESETS) presetRow.append(el('button', { type: 'button', 'data-long-side': size }, String(size)));
  const palette = el('textarea', { id: 'creation-project-palette', rows: '3', 'aria-describedby': 'creation-project-palette-help' });
  const palettePreset = el('select', { id: 'creation-project-palette-preset', 'aria-label': 'パレットを選ぶ' });
  const palettePresets = new Map([['current', null], ['mono', ['#000000','#ffffff']], ['gray', ['#222222','#666666','#aaaaaa','#eeeeee']], ['gb', ['#e0f8d0','#a8c070','#587830','#203810']]]);
  for (const [value,label] of [['current','プリセット'],['mono','白黒'],['gray','グレー4色'],['gb','GB4色']]) palettePreset.append(el('option',{value},label));
  try { for (const saved of JSON.parse(localStorage.getItem('pixieed:camera-palettes:v1') || '[]')) { if (!Array.isArray(saved?.colors) || saved.colors.length < 1 || saved.colors.length > 32 || saved.colors.some(rgb=>!Array.isArray(rgb)||rgb.length<3||rgb.some(c=>!Number.isInteger(c)||c<0||c>255))) continue; const id = `saved-${palettePresets.size}`; palettePresets.set(id,saved.colors.map(rgb=>'#'+rgb.slice(0,3).map(c=>c.toString(16).padStart(2,'0')).join(''))); palettePreset.append(el('option',{value:id},saved.name || '保存したパレット')); } } catch {}
  const swatches = el('div', { class: 'creation-project-settings__swatches', 'aria-label': 'パレットの各色' });
  const colorCount = el('select', { id: 'creation-project-color-count', 'aria-label': 'パレット色数' });
  for (const count of COLOR_COUNTS) colorCount.append(el('option', { value: count }, `${count}色まで`));
  const colorCountLabel = el('label', { class: 'creation-project-settings__field' }, '色数'); colorCountLabel.append(colorCount);
  const paletteHelp = el('small', { id: 'creation-project-palette-help' }, 'HEXカラーを改行またはカンマで区切ります。変更したパレットに合わせて全コマ・全レイヤーの色を量子化します。音の色割り当てにも影響します。');
  const previewCanvas = el('canvas', { class: 'creation-project-settings__thumbnail', width: '1', height: '1', 'aria-label': '設定後の作品プレビュー' });
  const preview = el('div', { class: 'creation-project-settings__preview', role: 'status', 'aria-live': 'polite' });
  const actions = el('div', { class: 'creation-project-settings__actions' });
  const previewButton = el('button', { type: 'button', 'data-project-action': 'preview' }, '変更をプレビュー');
  const applyButton = el('button', { type: 'submit', 'data-project-action': 'apply', disabled: '' }, '適用');
  actions.append(previewButton, applyButton);
  form.append(presetRow, dimensions, aspectLabel, ratioLabel, colorCountLabel, palettePreset, swatches, el('label', { for: palette.id }, 'パレット'), palette, paletteHelp, previewCanvas, preview, actions);
  panel.append(panelHeader, form);
  root.append(launcher, panel);

  let lastPreview = null;
  let syncing = false;
  let revision = 0;
  let applying = false;
  const timeline = () => draw.getTimeline();
  const ratioOf = value => value === 'free' ? null : value.split(':').map(Number).reduce((a, b) => a / b);
  const selectedPalette = () => palette.value.split(/[\s,]+/).filter(Boolean).slice(0, Number(colorCount.value) || 32);
  const currentSettings = () => {
    const animation = timeline();
    return { width: Number(width.value), height: Number(height.value), palette: selectedPalette(), aspectLocked: ratio.checked, aspectRatio: aspect.value,
      sourceWidth: animation.width, sourceHeight: animation.height, sourcePalette: [...animation.palette] };
  };
  function sync({ force = false, preserveStatus = false } = {}) {
    if (syncing) return;
    const animation = timeline(); if (!animation) return;
    syncing = true;
    const signature = `${animation.width}x${animation.height}:${animation.palette.join(',')}`;
    if (force || root.dataset.signature !== signature) {
      width.value = String(animation.width); height.value = String(animation.height);
      palette.value = animation.palette.join('\n'); palettePreset.value = 'current'; renderSwatches();
      colorCount.value = String(COLOR_COUNTS.find(count => count >= animation.palette.length) || 32);
      aspect.value = 'free';
      root.dataset.signature = signature;
      invalidatePreview(preserveStatus ? '' : '作品が変わったため、プレビューを更新してください。');
    }
    for (const button of presetRow.querySelectorAll('[data-long-side]')) button.setAttribute('aria-pressed', String(Number(button.dataset.longSide) === Math.max(animation.width, animation.height)));
    syncing = false;
  }
  function renderSwatches() {
    swatches.replaceChildren();
    palette.value.split(/[\s,]+/).filter(Boolean).slice(0,32).forEach((color,index)=>{
      if (!/^#[\da-f]{6}(?:ff)?$/i.test(color)) return;
      const input = el('input',{type:'color',value:color.slice(0,7),'aria-label':`色 ${index+1}`});
      input.addEventListener('input',()=>{const colors=palette.value.split(/[\s,]+/).filter(Boolean);colors[index]=input.value;palette.value=colors.join('\n');palettePreset.value='current';invalidatePreview();}); swatches.append(input);
    });
  }
  function invalidatePreview(message = '設定に未適用の変更があります。適用前にもう一度プレビューしてください。') {
    revision++; lastPreview = null; applyButton.disabled = true; previewCanvas.hidden = true;
    if (message) preview.textContent = message;
  }
  function renderThumbnail(animation) {
    if (!animation?.frames?.length) { previewCanvas.hidden = true; return; }
    const preferredFrame = draw.getEditorState?.().frameId;
    const frameId = animation.frames.some(frame => frame.id === preferredFrame) ? preferredFrame : animation.frames[0].id;
    const cel = composeAnimationFrame(animation, frameId);
    previewCanvas.width = cel.width; previewCanvas.height = cel.height;
    const context = previewCanvas.getContext('2d'); if (!context) { previewCanvas.hidden = true; return; }
    const pixels = cel.pixels;
    for (let y = 0; y < cel.height; y++) for (let x = 0; x < cel.width; x++) {
      const index = pixels[y * cel.width + x];
      if (index < 0) continue;
      const hex = cel.palette[index] || '#000000';
      context.fillStyle = hex.length === 9 ? `#${hex.slice(1, 7)}${hex.slice(7, 9)}` : hex;
      context.fillRect(x, y, 1, 1);
    }
    previewCanvas.hidden = false;
  }
  async function makePreview() {
    const settings = currentSettings();
    if (!Number.isInteger(settings.width) || !Number.isInteger(settings.height) || settings.width < 1 || settings.height < 1 || settings.width > 256 || settings.height > 256) {
      invalidatePreview(); preview.textContent = '幅と高さは1〜256の整数で入力してください。'; return;
    }
    if (!settings.palette.length || settings.palette.length > 32 || settings.palette.some(color => !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color))) {
      invalidatePreview(); preview.textContent = 'パレットは有効なHEXカラーを1〜32色入力してください。'; return;
    }
    if (typeof draw.previewProjectSettings !== 'function') {
      invalidatePreview(); preview.textContent = '設定プレビューAPIを読み込めません。'; return;
    }
    previewButton.disabled = true; preview.textContent = 'プレビューを作成しています…';
    const requestedRevision = revision;
    const owner = timeline();
    try {
      const result = await draw.previewProjectSettings(settings);
      if (requestedRevision !== revision || owner !== timeline()) { preview.textContent = '作品が変わりました。もう一度プレビューしてください。'; return; }
      lastPreview = { settings, result, owner, revision: requestedRevision };
      renderThumbnail(result?.animation);
      const summary = formatSummary(result?.summary || result);
      preview.textContent = `${settings.sourceWidth}×${settings.sourceHeight} → ${settings.width}×${settings.height} px${summary ? `。${summary}` : ''}`;
      applyButton.disabled = false;
    } catch (error) { invalidatePreview(); preview.textContent = error?.message || 'プレビューを作成できませんでした。'; }
    finally { previewButton.disabled = false; }
  }
  const adjustRatio = event => {
    const selectedRatio = ratioOf(aspect.value);
    if (!ratio.checked && !selectedRatio) return;
    const source = event.target; const other = source === width ? height : width;
    const sourceValue = Number(source.value); const animation = timeline();
    if (!Number.isInteger(sourceValue) || sourceValue < 1 || sourceValue > 256 || !animation?.width || !animation?.height) return;
    const ratioValue = selectedRatio || animation.width / animation.height;
    const computed = source === width ? Math.round(sourceValue / ratioValue) : Math.round(sourceValue * ratioValue);
    other.value = String(Math.min(256, Math.max(1, computed))); invalidatePreview();
  };
  function closePanel({ restoreFocus = true } = {}) {
    if (panel.hidden) return false;
    panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    if (restoreFocus) launcher.focus({ preventScroll: true });
    return true;
  }
  function openPanel() {
    draw.cancelInput?.();
    panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); sync({ force: true });
  }
  scope.listen(launcher, 'click', () => { if (panel.hidden) openPanel(); else closePanel({ restoreFocus: false }); });
  scope.listen(spriteScale, 'click', () => { closePanel({ restoreFocus: false }); draw.openSpriteScale?.(); });
  scope.listen(close, 'click', () => closePanel());
  scope.listen(width, 'input', adjustRatio); scope.listen(height, 'input', adjustRatio);
  scope.listen(aspect, 'change', () => { ratio.checked = aspect.value !== 'free'; adjustRatio({ target: width }); });
  scope.listen(form, 'input', () => invalidatePreview());
  scope.listen(palette, 'input', renderSwatches);
  scope.listen(palettePreset, 'change', () => { const colors = palettePresets.get(palettePreset.value); if (!colors) return; palette.value=colors.join('\n');colorCount.value=String(COLOR_COUNTS.find(count=>count>=colors.length)||32);renderSwatches();invalidatePreview(); });
  scope.listen(colorCount, 'change', () => invalidatePreview());
  scope.listen(palette, 'input', () => { const count = palette.value.split(/[\s,]+/).filter(Boolean).length; if (count <= 32) colorCount.value = String(COLOR_COUNTS.find(size => size >= count) || 32); invalidatePreview(); });
  scope.listen(previewButton, 'click', () => void makePreview());
  scope.listen(presetRow, 'click', event => {
    const button = event.target.closest('[data-long-side]'); if (!button) return;
    const size = Number(button.dataset.longSide), animation = timeline();
    const requestedAspect = ratioOf(aspect.value) || animation.width / animation.height;
    width.value = String(Math.max(1, Math.round(requestedAspect >= 1 ? size : size * requestedAspect)));
    height.value = String(Math.max(1, Math.round(requestedAspect >= 1 ? size / requestedAspect : size))); invalidatePreview();
    adjustRatio({ target: width });
  });
  scope.listen(form, 'submit', async event => {
    event.preventDefault();
    if (applying) return;
    if (!lastPreview || typeof draw.setProjectSettings !== 'function') { await makePreview(); return; }
    const settings = currentSettings();
    if (lastPreview.owner !== timeline() || lastPreview.revision !== revision || JSON.stringify(settings) !== JSON.stringify(lastPreview.settings)) { invalidatePreview(); await makePreview(); return; }
    const previewToApply = lastPreview;
    applyButton.disabled = true;
    previewButton.disabled = true; applying = true; form.inert = true;
    try {
      invalidatePreview('');
      const changed = await draw.setProjectSettings(settings, { expectedOwner: previewToApply.owner, preview: previewToApply.result });
      sync({ force: true, preserveStatus: true });
      preview.textContent = changed === false ? '設定に変更はありません。作品の状態はそのままです。' : '共通設定を適用し、Undoに記録しました。';
    } catch (error) {
      sync({ force: true, preserveStatus: true }); invalidatePreview();
      preview.textContent = error?.message || '設定を適用できませんでした。もう一度プレビューしてください。';
    } finally {
      form.inert = false; applying = false; previewButton.disabled = false;
      applyButton.disabled = true;
    }
  });
  const unsubscribe = draw.subscribe(() => {
    if (applying) { sync({ preserveStatus: true }); return; }
    invalidatePreview('作品が変わったため、プレビューを更新してください。'); sync();
  });
  scope.add(() => { unsubscribe?.(); });
  sync({ force: true });
  return { nodes: [root], root, launcher, panel, open(value = {}) { openPanel(); if (value.width) width.value = String(value.width); if (value.height) height.value = String(value.height); }, sync,
    isOpen() { return !panel.hidden; }, close: closePanel };
}
