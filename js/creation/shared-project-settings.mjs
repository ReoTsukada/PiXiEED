import { composeAnimationFrameRgba } from './animation-core.mjs?rev=20261016-color-capability-1';
import { getCanvasSettingsBounds, isProjectSettingsPreviewCurrent, validateCanvasSettingsFields } from './shared-project-settings-core.mjs?rev=20261017-canvas-layout-1';

const SIZE_PRESETS = [16, 32, 64, 128, 256];
const SCALE_PRESETS = [25, 50, 100, 200, 300, 1000];
const ASPECTS = [['free', '自由'], ['1:1', '1:1'], ['3:4', '3:4'], ['9:16', '9:16'], ['4:3', '4:3'], ['16:9', '16:9']];
const COLOR_COUNTS = [1, 2, 4, 8, 16, 32, 64, 128];
const TAB_LABELS = { area: '余白', scale: '絵の拡縮', palette: 'パレット' };

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

function asImage(image) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || !(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray)) return null;
  if (image.rgba.length !== image.width * image.height * 4) return null;
  return { width: image.width, height: image.height, rgba: new Uint8ClampedArray(image.rgba) };
}

function summaryText(summary) {
  if (!summary || typeof summary !== 'object') return typeof summary === 'string' ? summary : '';
  const parts = [];
  if (Number.isFinite(summary.croppedPixels)) parts.push(`切り取られる画素 ${summary.croppedPixels}`);
  if (Number.isFinite(summary.remappedColors)) parts.push(`置き換わる色 ${summary.remappedColors}色`);
  if (Number.isFinite(summary.musicAssignmentsAffected)) parts.push(`音の割り当てに影響 ${summary.musicAssignmentsAffected}件`);
  return parts.join('・');
}

/** One shared dialog for canvas area, sprite scale, and palette operations. */
export function mountSharedProjectSettings({ draw, scope } = {}) {
  if (!draw?.getTimeline || !draw?.subscribe || !scope?.listen || !scope?.add) throw new TypeError('Shared project settings require Draw, a scope, and a timeline subscription');

  const root = el('section', { id: 'creation-project-settings', class: 'creation-project-settings', 'data-mode-owner': 'shared', 'aria-label': 'キャンバス設定' });
  const launcher = el('button', { id: 'creation-project-settings-open', type: 'button', class: 'creation-control-button', 'aria-expanded': 'false', 'aria-controls': 'creation-project-settings-panel' }, 'キャンバス');
  const panel = el('div', { id: 'creation-project-settings-panel', class: 'creation-project-settings__panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'creation-project-settings-title', tabindex: '-1', hidden: '' });
  const header = el('header', { class: 'creation-project-settings__header' });
  const title = el('strong', { id: 'creation-project-settings-title' }, 'キャンバス設定');
  const close = el('button', { type: 'button', class: 'creation-project-settings__close', 'aria-label': '設定を閉じる' }, '戻る');
  header.append(title, close);

  const tabs = el('div', { class: 'creation-project-settings__tabs', role: 'tablist', 'aria-label': '変更する内容' });
  const tabButtons = new Map();
  for (const [kind, label] of Object.entries(TAB_LABELS)) {
    const button = el('button', { id: `creation-project-tab-${kind}`, type: 'button', role: 'tab', 'aria-selected': String(kind === 'area'), 'aria-controls': `creation-project-panel-${kind}`, tabindex: kind === 'area' ? '0' : '-1' }, label);
    tabButtons.set(kind, button); tabs.append(button);
  }
  const form = el('form', { id: 'creation-project-settings-form', class: 'creation-project-settings__form', novalidate: '' });
  const body = el('div', { class: 'creation-project-settings__body' });

  const compare = el('section', { class: 'creation-project-settings__compare', 'aria-label': '変更前と変更後の比較' });
  const beforeFigure = el('figure', { class: 'creation-project-settings__comparison' });
  const beforeTitle = el('figcaption', {}, '変更前');
  const beforeStage = el('div', { class: 'creation-project-settings__stage' });
  const beforeCanvas = el('canvas', { class: 'creation-project-settings__image', 'aria-label': '変更前の作品' });
  beforeStage.append(beforeCanvas);
  const beforeDimensions = el('span', { class: 'creation-project-settings__image-size' });
  beforeFigure.append(beforeTitle, beforeStage, beforeDimensions);
  const afterFigure = el('figure', { class: 'creation-project-settings__comparison' });
  const afterTitle = el('figcaption', {}, '変更後');
  const afterStage = el('div', { class: 'creation-project-settings__stage' });
  const afterCanvas = el('canvas', { class: 'creation-project-settings__image', 'aria-label': '変更後の作品' });
  afterStage.append(afterCanvas);
  const afterDimensions = el('span', { class: 'creation-project-settings__image-size' });
  afterFigure.append(afterTitle, afterStage, afterDimensions);
  compare.append(beforeFigure, afterFigure);
  const status = el('p', { class: 'creation-project-settings__status', role: 'status', 'aria-live': 'polite' }, '入力すると変更前後を比較できます。');
  const impactDetails = el('details', { class: 'creation-project-settings__impact' });
  const impactSummary = el('summary', {}, '全コマ・音楽への影響');
  const impactText = el('p'); impactDetails.append(impactSummary, impactText);

  const areaPanel = el('section', { id: 'creation-project-panel-area', class: 'creation-project-settings__tab-panel', role: 'tabpanel', 'aria-labelledby': 'creation-project-tab-area' });
  const areaHelp = el('p', { class: 'creation-project-settings__help' }, '絵の大きさはそのまま。中央基準で余白を追加・切り取ります。');
  const anchorNote = el('p', { class: 'creation-project-settings__anchor' }, '基準：中央');
  const dimensions = el('div', { class: 'creation-project-settings__dimensions' });
  const width = el('input', { id: 'creation-project-width', type: 'number', min: '1', max: '256', step: '1', inputmode: 'numeric', required: '', 'aria-label': '幅（px）', 'aria-describedby': 'creation-project-width-error' });
  const height = el('input', { id: 'creation-project-height', type: 'number', min: '1', max: '256', step: '1', inputmode: 'numeric', required: '', 'aria-label': '高さ（px）', 'aria-describedby': 'creation-project-height-error' });
  const widthError = el('small', { id: 'creation-project-width-error', class: 'creation-project-settings__field-error', hidden: '' });
  const heightError = el('small', { id: 'creation-project-height-error', class: 'creation-project-settings__field-error', hidden: '' });
  const widthLabel = el('label', { for: width.id }, '幅');
  const heightLabel = el('label', { for: height.id }, '高さ');
  const widthControl = el('div', { class: 'creation-project-settings__dimension-value' });
  const heightControl = el('div', { class: 'creation-project-settings__dimension-value' });
  widthControl.append(width, el('span', { 'aria-hidden': 'true' }, 'px'));
  heightControl.append(height, el('span', { 'aria-hidden': 'true' }, 'px'));
  const ratio = el('input', { id: 'creation-project-ratio', type: 'checkbox', 'aria-label': '縦横比を固定' });
  const ratioLabel = el('label', { class: 'creation-project-settings__check', title: '縦横比を固定' });
  ratioLabel.append(ratio, el('span', { 'aria-hidden': 'true' }, '固定'));
  dimensions.append(widthLabel, widthControl, heightLabel, heightControl, ratioLabel, widthError, heightError);
  const aspect = el('select', { id: 'creation-project-aspect', 'aria-label': '縦横比プリセット' });
  for (const [value, label] of ASPECTS) aspect.append(el('option', { value }, label));
  const aspectLabel = el('label', { class: 'creation-project-settings__field creation-project-settings__aspect' }, '比率'); aspectLabel.append(aspect);
  const sizeRow = el('div', { class: 'creation-project-settings__size-row' });
  const sizeDisclosure = el('details', { class: 'creation-project-settings__disclosure creation-project-settings__size-disclosure' });
  sizeDisclosure.append(el('summary', {}, 'サイズ候補'));
  const sizePresets = el('div', { class: 'creation-project-settings__presets', role: 'group', 'aria-label': '長辺のサイズ' });
  for (const size of SIZE_PRESETS) sizePresets.append(el('button', { type: 'button', 'data-long-side': size }, String(size)));
  sizeDisclosure.append(sizePresets);
  sizeRow.append(sizeDisclosure, aspectLabel);
  areaPanel.append(areaHelp, dimensions);
  const areaMore = el('section', { class: 'creation-project-settings__area-more', 'aria-labelledby': 'creation-project-tab-area' });
  areaMore.append(sizeRow, anchorNote);

  const scalePanel = el('section', { id: 'creation-project-panel-scale', class: 'creation-project-settings__tab-panel', role: 'tabpanel', 'aria-labelledby': 'creation-project-tab-scale', hidden: '' });
  const scaleHelp = el('p', { class: 'creation-project-settings__help' }, '絵とキャンバスを同じ倍率で変更します。全コマ・全レイヤーを最近傍補間し、寸法は四捨五入します。');
  const scaleFieldRow = el('div', { class: 'creation-project-settings__scale-row' });
  const scaleLabel = el('label', { for: 'creation-project-scale-percent', class: 'creation-project-settings__scale-field' }, '倍率');
  const scaleInput = el('input', { id: 'creation-project-scale-percent', type: 'number', min: '0', step: 'any', value: '100', inputmode: 'decimal', 'aria-label': '倍率（%）', 'aria-describedby': 'creation-project-scale-error' });
  scaleInput.setAttribute('min', '0');
  const scaleUnit = el('span', { class: 'creation-project-settings__scale-unit', 'aria-hidden': 'true' }, '％');
  scaleLabel.append(scaleInput, scaleUnit);
  const scaleError = el('small', { id: 'creation-project-scale-error', class: 'creation-project-settings__field-error', hidden: '' });
  const scalePresetDisclosure = el('details', { class: 'creation-project-settings__disclosure creation-project-settings__scale-presets' });
  scalePresetDisclosure.append(el('summary', { 'aria-label': '倍率候補を開く' }, '候補'));
  const scalePresetRow = el('div', { class: 'creation-project-settings__presets', role: 'group', 'aria-label': '倍率の候補' });
  for (const percent of SCALE_PRESETS) scalePresetRow.append(el('button', { type: 'button', 'data-scale-percent': percent }, `${percent}%`));
  scalePresetDisclosure.append(scalePresetRow);
  scaleFieldRow.append(scaleLabel, scalePresetDisclosure);
  const scaleNote = el('p', { class: 'creation-project-settings__warning' }, '縮小や小数倍率では、寸法の丸めで一部の画素が失われることがあります。');
  scalePanel.append(scaleHelp, scaleFieldRow, scaleError, scaleNote);

  const palettePanel = el('section', { id: 'creation-project-panel-palette', class: 'creation-project-settings__tab-panel', role: 'tabpanel', 'aria-labelledby': 'creation-project-tab-palette', hidden: '' });
  const paletteHelp = el('p', { class: 'creation-project-settings__help' }, 'パレットを変更すると、全コマの色と音の割り当てに影響します。');
  const palettePresets = new Map([['current', null], ['mono', ['#000000', '#ffffff']], ['gray', ['#222222', '#666666', '#aaaaaa', '#eeeeee']], ['gb', ['#e0f8d0', '#a8c070', '#587830', '#203810']]]);
  const palettePreset = el('select', { id: 'creation-project-palette-preset', 'aria-label': 'パレットを選ぶ' });
  for (const [value, label] of [['current', 'プリセット'], ['mono', '白黒'], ['gray', 'グレー4色'], ['gb', 'GB4色']]) palettePreset.append(el('option', { value }, label));
  try {
    for (const saved of JSON.parse(localStorage.getItem('pixieed:camera-palettes:v1') || '[]')) {
      if (!Array.isArray(saved?.colors) || saved.colors.length < 1 || saved.colors.length > 128 || saved.colors.some(rgb => !Array.isArray(rgb) || rgb.length < 3 || rgb.some(c => !Number.isInteger(c) || c < 0 || c > 255))) continue;
      const id = `saved-${palettePresets.size}`;
      palettePresets.set(id, saved.colors.map(rgb => '#' + rgb.slice(0, 3).map(c => c.toString(16).padStart(2, '0')).join('')));
      palettePreset.append(el('option', { value: id }, saved.name || '保存したパレット'));
    }
  } catch {}
  const paletteCount = el('select', { id: 'creation-project-color-count', 'aria-label': 'パレットの登録候補数' });
  for (const count of COLOR_COUNTS) paletteCount.append(el('option', { value: count }, String(count)));
  const paletteCountLabel = el('label', { class: 'creation-project-settings__field' }, '登録候補数'); paletteCountLabel.append(paletteCount);
  const swatches = el('div', { class: 'creation-project-settings__swatches', 'aria-label': 'パレットの各色' });
  const paletteText = el('textarea', { id: 'creation-project-palette', rows: '3', 'aria-describedby': 'creation-project-palette-error creation-project-palette-help' });
  const paletteError = el('small', { id: 'creation-project-palette-error', class: 'creation-project-settings__field-error', hidden: '' });
  const paletteDetails = el('details', { class: 'creation-project-settings__disclosure creation-project-settings__palette-details' });
  paletteDetails.append(el('summary', {}, 'HEX・登録候補を編集'), paletteCountLabel, el('label', { for: paletteText.id }, 'HEXカラー'), paletteText, paletteError,
    el('small', { id: 'creation-project-palette-help' }, 'HEXを改行またはカンマで区切ります。使用色は最大64色（透明・未使用色を除く）、未使用色を含むパレット登録候補は最大128色です。'));
  palettePanel.append(paletteHelp, palettePreset, swatches, paletteDetails);
  const tabPanels = new Map([['area', areaPanel], ['scale', scalePanel], ['palette', palettePanel]]);
  body.append(areaPanel, scalePanel, palettePanel, compare, status, impactDetails, areaMore);
  form.append(body);

  const footer = el('footer', { class: 'creation-project-settings__footer' });
  const cancelButton = el('button', { type: 'button', 'data-project-action': 'cancel' }, '取消');
  const testButton = el('button', { type: 'button', 'data-project-action': 'preview' }, '試す');
  const applyButton = el('button', { type: 'button', 'data-project-action': 'apply', disabled: '' }, '適用');
  footer.append(cancelButton, testButton, applyButton);
  panel.append(header, tabs, form, footer);
  root.append(launcher, panel);

  let activeKind = 'area';
  let lastPreview = null;
  let revision = 0;
  let requestId = 0;
  let applying = false;
  let syncing = false;
  let previewTimer = 0;
  let focusedFieldScrollFrame = 0;
  let focusReturnTarget = launcher;
  const timeline = () => draw.getTimeline();
  const ratioOf = value => value === 'free' ? null : value.split(':').map(Number).reduce((a, b) => a / b);
  const selectedPalette = () => {
    const colors = paletteText.value.split(/[\s,]+/).filter(Boolean);
    return colors.length > 128 ? colors : colors.slice(0, Number(paletteCount.value) || 128);
  };
  function setFieldError(input, node, message = '') {
    node.textContent = message;
    node.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function updateScaleWidth() {
    const count = Math.max(1, String(scaleInput.value || '').length);
    scaleInput.style.setProperty('--creation-scale-input-width', `calc(${count}ch + 32px)`);
  }
  function updateScaleWarning() {
    const percent = Number(scaleInput.value);
    scaleNote.hidden = scaleInput.value.trim() !== '' && Number.isFinite(percent) && percent >= 100 && Number.isInteger(percent / 100);
  }
  function sync({ resetScale = false } = {}) {
    if (syncing) return;
    const animation = timeline(); if (!animation) return;
    syncing = true;
    width.value = String(animation.width); height.value = String(animation.height);
    paletteText.value = animation.palette.join('\n'); palettePreset.value = 'current';
    paletteCount.value = String(COLOR_COUNTS.find(count => count >= animation.palette.length) || 128);
    aspect.value = 'free'; ratio.checked = false;
    if (resetScale) scaleInput.value = '100';
    updateScaleWidth(); updateScaleWarning(); renderSwatches();
    for (const button of sizePresets.querySelectorAll('[data-long-side]')) button.setAttribute('aria-pressed', String(Number(button.dataset.longSide) === Math.max(animation.width, animation.height)));
    syncing = false;
    clearDraftPreview('現在の作品を表示中です。変更を選び「試す」で確認してください。');
    renderBaseline();
  }
  function renderSwatches() {
    swatches.replaceChildren();
    paletteText.value.split(/[\s,]+/).filter(Boolean).slice(0, 128).forEach((color, index) => {
      if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color)) return;
      const input = el('input', { type: 'color', value: color.slice(0, 7), 'aria-label': `色 ${index + 1}` });
      scope.listen(input, 'input', () => {
        const colors = paletteText.value.split(/[\s,]+/).filter(Boolean);
        colors[index] = input.value + (colors[index]?.length === 9 ? colors[index].slice(7) : '');
        paletteText.value = colors.join('\n'); palettePreset.value = 'current';
        validateActive(); invalidate('パレットのプレビューを更新しています。');
      });
      swatches.append(input);
    });
  }
  function renderImage(canvas, image) {
    const copy = asImage(image);
    if (!copy) { canvas.width = 1; canvas.height = 1; return false; }
    canvas.width = copy.width; canvas.height = copy.height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.putImageData(new ImageData(copy.rgba, copy.width, copy.height), 0, 0);
    canvas.dataset.pixelWidth = String(copy.width); canvas.dataset.pixelHeight = String(copy.height);
    return true;
  }
  function currentFrameImage(animation = timeline()) {
    if (!animation?.frames?.length) return null;
    const preferredFrame = draw.getEditorState?.().frameId;
    const frameId = animation.frames.some(frame => frame.id === preferredFrame) ? preferredFrame : animation.frames[0].id;
    return asImage(composeAnimationFrameRgba(animation, frameId));
  }
  function renderBaseline(afterImage = null, afterSize = null) {
    const animation = timeline(); const beforeImage = currentFrameImage(animation);
    if (!beforeImage) return;
    renderImage(beforeCanvas, beforeImage);
    renderImage(afterCanvas, afterImage || beforeImage);
    beforeDimensions.textContent = `${animation.width}×${animation.height} px`;
    afterDimensions.textContent = `${afterSize?.width || beforeImage.width}×${afterSize?.height || beforeImage.height} px`;
    const maxWidth = Math.max(beforeImage.width, afterImage?.width || beforeImage.width);
    const maxHeight = Math.max(beforeImage.height, afterImage?.height || beforeImage.height);
    requestAnimationFrame(() => {
      const beforeRect = beforeStage.getBoundingClientRect(); const afterRect = afterStage.getBoundingClientRect();
      const stageWidth = Math.min(beforeRect.width || 126, afterRect.width || 126) - 8;
      const stageHeight = Math.min(beforeRect.height || 74, afterRect.height || 74) - 8;
      const pixelScale = Math.max(.01, Math.min(stageWidth / maxWidth, stageHeight / maxHeight));
      for (const [canvas, image] of [[beforeCanvas, beforeImage], [afterCanvas, afterImage || beforeImage]]) {
        canvas.style.width = `${Math.max(1, image.width * pixelScale)}px`;
        canvas.style.height = `${Math.max(1, image.height * pixelScale)}px`;
      }
    });
  }
  function currentSettings(kind = activeKind) {
    const animation = timeline();
    if (!animation) return null;
    if (kind === 'scale') return { percent: Number(scaleInput.value) };
    if (kind === 'palette') return { width: animation.width, height: animation.height, palette: selectedPalette(), sourcePalette: [...animation.palette] };
    return { width: Number(width.value), height: Number(height.value), palette: [...animation.palette], aspectLocked: ratio.checked, aspectRatio: aspect.value,
      sourceWidth: animation.width, sourceHeight: animation.height };
  }
  function validateActive() {
    if (activeKind === 'area') {
      const errors = validateCanvasSettingsFields({ width: width.value, height: height.value, palette: timeline()?.palette || [] });
      setFieldError(width, widthError, errors.width); setFieldError(height, heightError, errors.height);
      setFieldError(paletteText, paletteError); setFieldError(scaleInput, scaleError);
      return !errors.width && !errors.height;
    }
    if (activeKind === 'palette') {
      const errors = validateCanvasSettingsFields({ width: timeline()?.width, height: timeline()?.height, palette: selectedPalette() });
      setFieldError(paletteText, paletteError, errors.palette); setFieldError(width, widthError); setFieldError(height, heightError); setFieldError(scaleInput, scaleError);
      return !errors.palette;
    }
    const value = Number(scaleInput.value);
    const valid = scaleInput.value.trim() !== '' && Number.isFinite(value) && value > 0;
    setFieldError(scaleInput, scaleError, valid ? '' : '0より大きい倍率を入力してください。');
    setFieldError(width, widthError); setFieldError(height, heightError); setFieldError(paletteText, paletteError);
    return valid;
  }
  function clearDraftPreview(message = '') {
    requestId++;
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = 0; }
    revision++;
    lastPreview = null; applyButton.disabled = true; testButton.disabled = false;
    impactDetails.hidden = true; impactText.textContent = '';
    status.textContent = message;
    renderBaseline();
  }
  function invalidate(message = '設定が変わりました。新しい内容をプレビューします。') {
    clearDraftPreview(message);
    if (!panel.hidden && validateActive()) previewTimer = setTimeout(() => { previewTimer = 0; void makePreview({ arm: false, automatic: true }); }, 140);
  }
  function setActiveTab(kind, { focus = false, preview = true } = {}) {
    if (!tabPanels.has(kind)) return;
    activeKind = kind;
    for (const [key, button] of tabButtons) {
      const selected = key === kind;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      tabPanels.get(key).hidden = !selected;
    }
    areaMore.hidden = kind !== 'area';
    body.scrollTop = 0;
    if (focus) tabButtons.get(kind).focus({ preventScroll: true });
    if (preview) invalidate(`${TAB_LABELS[kind]}のプレビューを更新しています。`);
    else renderBaseline();
  }
  function buildSettings(kind) {
    const settings = currentSettings(kind);
    if (kind === 'scale') return settings;
    return settings;
  }
  function revealPreviewAndPrimaryField(kind) {
    requestAnimationFrame(() => {
      if (panel.hidden) return;
      const bodyRect = body.getBoundingClientRect(); const current = body.scrollTop;
      const primary = kind === 'area' ? width : kind === 'scale' ? scaleInput : palettePreset;
      const primaryRect = primary.getBoundingClientRect(); const compareRect = compare.getBoundingClientRect(); const statusRect = status.getBoundingClientRect();
      const contentTop = node => node.top - bodyRect.top + current;
      const contentBottom = node => node.bottom - bodyRect.top + current;
      const regionStart = Math.min(contentTop(primaryRect) - 18, contentTop(compareRect));
      const regionEnd = Math.max(contentBottom(compareRect), contentBottom(statusRect));
      const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
      if (regionEnd - regionStart <= body.clientHeight) {
        const minScroll = Math.max(0, regionEnd - body.clientHeight);
        const maxRegionScroll = Math.max(0, regionStart);
        body.scrollTop = Math.max(minScroll, Math.min(maxRegionScroll, current, maxScroll));
        return;
      }
      const compareStart = contentTop(compareRect); const compareEnd = Math.max(contentBottom(compareRect), contentBottom(statusRect));
      const minCompareScroll = Math.max(0, compareEnd - body.clientHeight);
      body.scrollTop = Math.max(minCompareScroll, Math.min(compareStart, current, maxScroll));
    });
  }
  async function makePreview({ arm = false, automatic = false } = {}) {
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = 0; }
    if (!validateActive()) {
      if (activeKind === 'palette') {
        paletteDetails.open = true;
        requestAnimationFrame(() => { paletteText.focus({ preventScroll: true }); keepFocusedFieldVisible(); });
      }
      if (!automatic) status.textContent = '入力を確認してください。';
      return;
    }
    const kind = activeKind; const settings = buildSettings(kind); const owner = timeline(); const requestedRevision = revision; const request = ++requestId;
    if (!settings || !owner) return;
    if (!automatic) status.textContent = '変更前後を確認しています…';
    testButton.disabled = true;
    try {
      let result;
      if (kind === 'scale') {
        if (typeof draw.previewSpriteScaleSettings !== 'function') throw new Error('絵の拡縮プレビューを読み込めません。');
        result = await draw.previewSpriteScaleSettings(settings.percent);
      } else {
        if (typeof draw.previewProjectSettings !== 'function') throw new Error('設定プレビューを読み込めません。');
        result = await draw.previewProjectSettings(settings);
      }
      if (request !== requestId || requestedRevision !== revision || kind !== activeKind || owner !== timeline() || result?.owner && result.owner !== owner) return;
      const image = asImage(result?.image);
      if (!image) throw new Error('プレビュー画像を作成できませんでした。');
      const changed = Boolean(result.changed);
      const previewRecord = { kind, owner, revision: requestedRevision, settings, changed, image, width: image.width, height: image.height, summary: result.summary || {} };
      lastPreview = previewRecord;
      renderBaseline(image, { width: image.width, height: image.height });
      if (arm) revealPreviewAndPrimaryField(kind);
      impactDetails.hidden = false;
      impactText.textContent = previewRecord.summary.musicImpact || (kind === 'scale' ? '倍率変更は全コマ・全レイヤーに適用されます。' : '変更は全コマに適用されます。');
      const summary = previewRecord.summary;
      const dimensionsText = `${owner.width}×${owner.height} → ${image.width}×${image.height} px`;
      const compactSummary = kind === 'area' && Number.isFinite(summary.croppedPixels)
        ? `・切り取られる画素 ${summary.croppedPixels}`
        : kind === 'palette' && Number.isFinite(summary.remappedColors)
          ? `・置き換わる色 ${summary.remappedColors}・全コマ`
          : '';
      status.textContent = kind === 'scale'
        ? `${settings.percent}%・${dimensionsText}`
        : kind === 'palette'
          ? `${image.width}×${image.height} px${compactSummary}`
          : `${dimensionsText}${compactSummary}`;
      if (arm && changed) status.textContent += '・確認済み';
      else if (automatic && changed) status.textContent += '・「試す」で適用確認';
      if (!changed) status.textContent += '・変更なし';
      applyButton.disabled = !(arm && changed);
      previewRecord.armed = Boolean(arm && changed);
      if (arm && !changed) status.textContent = '変更はありません。';
    } catch (error) {
      if (request === requestId && requestedRevision === revision && kind === activeKind) {
        lastPreview = null; applyButton.disabled = true; status.textContent = error?.message || 'プレビューできませんでした。';
        if (kind === 'scale' && (error instanceof RangeError || error?.code)) setFieldError(scaleInput, scaleError, error?.message || 'この倍率は現在の作品に適用できません。');
      }
    } finally {
      if (request === requestId) testButton.disabled = false;
    }
  }
  function adjustRatio(event) {
    const selectedRatio = ratioOf(aspect.value);
    if (!ratio.checked && !selectedRatio) return;
    const source = event.target; const other = source === width ? height : width;
    const sourceValue = Number(source.value); const animation = timeline();
    if (!Number.isInteger(sourceValue) || sourceValue < 1 || sourceValue > 256 || !animation?.width || !animation?.height) return;
    const ratioValue = selectedRatio || animation.width / animation.height;
    const computed = source === width ? Math.round(sourceValue / ratioValue) : Math.round(sourceValue * ratioValue);
    other.value = String(Math.min(256, Math.max(1, computed)));
  }
  function isVisible(node) {
    if (!node?.isConnected || node.hidden || node.disabled || !node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }
  function closePanel({ restoreFocus = true } = {}) {
    if (panel.hidden || applying) return false;
    panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    clearDraftPreview('変更を取り消しました。');
    if (restoreFocus && focusReturnTarget?.isConnected) focusReturnTarget.focus({ preventScroll: true });
    return true;
  }
  function openPanel({ trigger } = {}) {
    draw.cancelInput?.();
    if (trigger?.isConnected) focusReturnTarget = trigger;
    else if (isVisible(launcher)) focusReturnTarget = launcher;
    else focusReturnTarget = document.querySelector('#creation-settings-open') || launcher;
    panel.hidden = false; launcher.setAttribute('aria-expanded', 'true');
    sync({ resetScale: true }); setActiveTab('area', { preview: false });
    validateActive(); renderBaseline(); positionPanel();
  }
  function keepFocusedFieldVisible() {
    if (focusedFieldScrollFrame) return;
    focusedFieldScrollFrame = requestAnimationFrame(() => {
      focusedFieldScrollFrame = 0;
      if (panel.hidden) return;
      const target = document.activeElement;
      if (!target?.matches?.('input,select,textarea') || !panel.contains(target)) return;
      const scrollBody = target.closest('.creation-project-settings__body');
      if (!scrollBody) return;
      const bodyRect = scrollBody.getBoundingClientRect(); const targetRect = target.getBoundingClientRect();
      const top = bodyRect.top + 2; const bottom = bodyRect.bottom - 2;
      const delta = targetRect.top < top ? targetRect.top - top : targetRect.bottom > bottom ? targetRect.bottom - bottom : 0;
      if (delta) scrollBody.scrollTop = Math.max(0, Math.min(scrollBody.scrollHeight - scrollBody.clientHeight, scrollBody.scrollTop + delta));
    });
  }
  function positionPanel() {
    if (panel.hidden) return;
    const viewport = window.visualViewport; const viewportTop = viewport?.offsetTop ?? 0;
    const viewportHeight = viewport?.height ?? window.innerHeight; const viewportWidth = viewport?.width ?? window.innerWidth;
    const headerRect = document.querySelector('.px-site-header, .site-header')?.getBoundingClientRect();
    const navRect = document.querySelector('.app-tabs')?.getBoundingClientRect();
    const bounds = getCanvasSettingsBounds({ viewportTop, viewportLeft: viewport?.offsetLeft ?? 0, viewportWidth, viewportHeight,
      headerBottom: headerRect?.bottom ?? viewportTop, navTop: navRect?.top ?? viewportTop + viewportHeight });
    panel.style.top = `${bounds.top}px`; panel.style.bottom = 'auto'; panel.style.left = `${bounds.left}px`; panel.style.right = 'auto';
    panel.style.width = `${bounds.width}px`; panel.style.height = `${bounds.height}px`; panel.style.maxHeight = `${bounds.height}px`; panel.dataset.compact = String(bounds.compact);
    keepFocusedFieldVisible();
  }

  scope.listen(launcher, 'click', () => { if (panel.hidden) openPanel({ trigger: launcher }); else closePanel({ restoreFocus: false }); });
  scope.listen(close, 'click', () => closePanel()); scope.listen(cancelButton, 'click', () => closePanel());
  scope.listen(form, 'submit', event => event.preventDefault());
  scope.listen(document, 'keydown', event => {
    if (event.key !== 'Escape' || panel.hidden || event.isComposing || applying) return;
    event.preventDefault(); event.stopImmediatePropagation(); closePanel();
  }, { capture: true });
  scope.listen(window, 'resize', positionPanel, { passive: true });
  scope.listen(panel, 'focusin', event => { if (event.target.matches?.('input,select,textarea')) { positionPanel(); keepFocusedFieldVisible(); } });
  if (window.visualViewport) {
    scope.listen(window.visualViewport, 'resize', positionPanel, { passive: true });
    scope.listen(window.visualViewport, 'scroll', positionPanel, { passive: true });
  }
  for (const [kind, button] of tabButtons) {
    scope.listen(button, 'click', () => setActiveTab(kind));
    scope.listen(button, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const keys = [...tabButtons.keys()];
      const index = keys.indexOf(kind);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
      setActiveTab(keys[next], { focus: true });
    });
  }
  scope.listen(width, 'input', event => { adjustRatio(event); validateActive(); invalidate('余白のプレビューを更新しています。'); });
  scope.listen(height, 'input', event => { adjustRatio(event); validateActive(); invalidate('余白のプレビューを更新しています。'); });
  scope.listen(ratio, 'change', () => invalidate('縦横比のプレビューを更新しています。'));
  scope.listen(aspect, 'change', () => { ratio.checked = aspect.value !== 'free'; adjustRatio({ target: width }); validateActive(); invalidate('縦横比のプレビューを更新しています。'); });
  scope.listen(sizePresets, 'click', event => {
    const button = event.target.closest('[data-long-side]'); if (!button) return;
    const size = Number(button.dataset.longSide); const animation = timeline(); const selectedRatio = ratioOf(aspect.value) || animation.width / animation.height;
    width.value = String(Math.max(1, Math.round(selectedRatio >= 1 ? size : size * selectedRatio)));
    height.value = String(Math.max(1, Math.round(selectedRatio >= 1 ? size / selectedRatio : size)));
    adjustRatio({ target: width }); validateActive(); invalidate('余白のプレビューを更新しています。');
  });
  scope.listen(scaleInput, 'input', () => { updateScaleWidth(); updateScaleWarning(); validateActive(); invalidate('絵の拡縮プレビューを更新しています。'); });
  scope.listen(scaleInput, 'change', () => { updateScaleWidth(); updateScaleWarning(); });
  scope.listen(scalePresetRow, 'click', event => {
    const button = event.target.closest('[data-scale-percent]'); if (!button) return;
    scaleInput.value = button.dataset.scalePercent; updateScaleWidth(); updateScaleWarning(); validateActive(); invalidate('絵の拡縮プレビューを更新しています。');
    scalePresetDisclosure.open = false;
    requestAnimationFrame(() => scaleInput.focus({ preventScroll: true }));
  });
  scope.listen(paletteText, 'input', () => { renderSwatches(); palettePreset.value = 'current'; validateActive(); invalidate('パレットのプレビューを更新しています。'); });
  scope.listen(palettePreset, 'change', () => {
    const colors = palettePresets.get(palettePreset.value); if (!colors) return;
    paletteText.value = colors.join('\n'); paletteCount.value = String(COLOR_COUNTS.find(count => count >= colors.length) || 128);
    renderSwatches(); validateActive(); invalidate('パレットのプレビューを更新しています。');
  });
  scope.listen(paletteCount, 'change', () => { validateActive(); invalidate('登録候補数のプレビューを更新しています。'); });
  scope.listen(testButton, 'click', () => void makePreview({ arm: true }));
  scope.listen(applyButton, 'click', async () => {
    if (applying) return;
    const current = lastPreview; const kind = activeKind; const settings = buildSettings(kind);
    if (!current?.armed || current.kind !== kind || !isProjectSettingsPreviewCurrent(current, { owner: timeline(), revision, settings }) || !current.changed) {
      await makePreview({ arm: true }); return;
    }
    const expectedOwner = current.owner;
    applyButton.disabled = true; testButton.disabled = true; cancelButton.disabled = true; close.disabled = true; tabs.inert = true; applying = true; form.inert = true;
    try {
      const changed = kind === 'scale'
        ? await draw.setSpriteScaleSettings(settings.percent, { expectedOwner })
        : await draw.setProjectSettings(settings, { expectedOwner });
      if (changed === false && kind === 'scale') {
        clearDraftPreview('適用できませんでした。現在の作品を確認して、もう一度試してください。');
        renderBaseline();
      } else {
        sync({ resetScale: true });
        status.textContent = changed === false ? '変更はありません。作品の状態はそのままです。' : '変更を適用しました。Undoで元に戻せます。';
      }
    } catch (error) {
      clearDraftPreview(error?.message || '適用できませんでした。もう一度プレビューしてください。');
      renderBaseline();
    } finally {
      form.inert = false; tabs.inert = false; close.disabled = false; cancelButton.disabled = false; applying = false; testButton.disabled = false; applyButton.disabled = true;
    }
  });
  const unsubscribe = draw.subscribe(() => {
    if (applying) return;
    clearDraftPreview('作品が変わりました。変更前後を更新しています。');
    renderBaseline();
    if (!panel.hidden && validateActive()) previewTimer = setTimeout(() => { previewTimer = 0; void makePreview({ arm: false, automatic: true }); }, 140);
  });
  scope.add(() => { unsubscribe?.(); if (previewTimer) clearTimeout(previewTimer); });

  sync({ resetScale: true });
  setActiveTab('area', { preview: false });
  return {
    nodes: [root], root, launcher, panel,
    open(value = {}) {
      openPanel(value);
      if (value.width) width.value = String(value.width);
      if (value.height) height.value = String(value.height);
      if (value.width || value.height) { validateActive(); renderBaseline(); }
    },
    sync() { sync(); },
    position: positionPanel,
    isOpen() { return !panel.hidden; },
    close: closePanel
  };
}
