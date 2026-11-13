import { composeAnimationFrameRgba, ANIMATION_MAX_DIMENSION } from './animation-core.mjs?rev=20261113-canvas1028-1';
import { getCanvasSettingsBounds, isProjectSettingsPreviewCurrent, validateCanvasSettingsFields, fitCanvasAspect } from './shared-project-settings-core.mjs?rev=20261113-canvas1028-1';

const SCALE_PRESETS = [25, 50, 100, 200, 300, 1000];
const ASPECTS = [['free', '自由'], ['1:1', '正方形 1:1'], ['3:2', '横長 3:2'], ['2:3', '縦長 2:3'], ['3:4', '3:4'], ['9:16', '9:16'], ['4:3', '4:3'], ['16:9', '16:9']];
const COLOR_COUNTS = [1, 2, 4, 8, 16, 32, 64, 128];
const TAB_LABELS = { area: 'キャンバス', scale: '絵の拡縮', palette: 'パレット' };

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
export function mountSharedProjectSettings({ draw, scope, getMode = () => 'draw' } = {}) {
  if (!draw?.getTimeline || !draw?.subscribe || !scope?.listen || !scope?.add) throw new TypeError('Shared project settings require Draw, a scope, and a timeline subscription');

  const maxDimension = () => getMode() === 'audio' ? 256 : ANIMATION_MAX_DIMENSION;

  const root = el('section', { id: 'creation-project-settings', class: 'creation-project-settings', 'data-mode-owner': 'shared', 'aria-label': 'キャンバス設定' });
  const launcher = el('button', { id: 'creation-project-settings-open', type: 'button', class: 'creation-control-button', 'aria-expanded': 'false', 'aria-controls': 'creation-project-settings-panel' }, 'キャンバス');
  const scrim = el('div', { class: 'creation-project-settings__scrim', 'aria-hidden': 'true', hidden: '' });
  const panel = el('div', { id: 'creation-project-settings-panel', class: 'creation-project-settings__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'creation-project-settings-title', tabindex: '-1', hidden: '' });
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

  const compare = el('section', { class: 'creation-project-settings__compare', 'aria-label': 'プレビュー' });
  const previewFigure = el('figure', { class: 'creation-project-settings__comparison' });
  const previewTitle = el('figcaption', {}, 'プレビュー');
  const previewDimensions = el('span', { class: 'creation-project-settings__image-size' });
  const afterStage = el('div', { class: 'creation-project-settings__stage' });
  const afterCanvas = el('canvas', { class: 'creation-project-settings__image', 'aria-label': '作品のプレビュー' });
  afterStage.append(afterCanvas);
  previewFigure.append(previewTitle, afterStage, previewDimensions); compare.append(previewFigure);
  const status = el('p', { class: 'creation-project-settings__status', role: 'status', 'aria-live': 'polite' }, '入力するとプレビューを更新します。');
  const largeCanvasNotice = el('small', { class: 'creation-project-settings__warning', hidden: '' }, '大きな作品はコマ・レイヤー数に制限があります。旧版では開けません。');
  const impactDetails = el('details', { class: 'creation-project-settings__impact' });
  const impactSummary = el('summary', {}, '変更の影響');
  const impactText = el('p'); impactDetails.append(impactSummary, impactText);

  const areaPanel = el('section', { id: 'creation-project-panel-area', class: 'creation-project-settings__tab-panel', role: 'tabpanel', 'aria-labelledby': 'creation-project-tab-area' });
  const areaHelp = el('p', { class: 'creation-project-settings__help' }, '絵の大きさを保ち、中央に余白を追加・切り取り。');
  const anchorNote = el('p', { class: 'creation-project-settings__anchor' }, '基準：中央');
  const dimensions = el('div', { class: 'creation-project-settings__dimensions', role: 'group', 'aria-label': 'キャンバスの幅と高さ' });
  const width = el('input', { id: 'creation-project-width', type: 'number', min: '1', max: String(ANIMATION_MAX_DIMENSION), step: '1', inputmode: 'numeric', required: '', 'aria-label': '幅（px）', 'aria-describedby': 'creation-project-width-error' });
  const height = el('input', { id: 'creation-project-height', type: 'number', min: '1', max: String(ANIMATION_MAX_DIMENSION), step: '1', inputmode: 'numeric', required: '', 'aria-label': '高さ（px）', 'aria-describedby': 'creation-project-height-error' });
  const widthError = el('small', { id: 'creation-project-width-error', class: 'creation-project-settings__field-error', hidden: '' });
  const heightError = el('small', { id: 'creation-project-height-error', class: 'creation-project-settings__field-error', hidden: '' });
  const widthLabel = el('label', { for: width.id }, '幅 ↔');
  const heightLabel = el('label', { for: height.id }, '高さ ↕');
  const widthCard = el('div', { class: 'creation-project-settings__dimension-card' });
  const heightCard = el('div', { class: 'creation-project-settings__dimension-card' });
  const widthControl = el('div', { class: 'creation-project-settings__dimension-value' });
  const heightControl = el('div', { class: 'creation-project-settings__dimension-value' });
  const widthMinus = el('button', { type: 'button', class: 'creation-project-settings__step', 'data-dimension': 'width', 'data-delta': '-1', 'aria-label': '幅を1ピクセル減らす' }, '−');
  const widthPlus = el('button', { type: 'button', class: 'creation-project-settings__step', 'data-dimension': 'width', 'data-delta': '1', 'aria-label': '幅を1ピクセル増やす' }, '+');
  const heightMinus = el('button', { type: 'button', class: 'creation-project-settings__step', 'data-dimension': 'height', 'data-delta': '-1', 'aria-label': '高さを1ピクセル減らす' }, '−');
  const heightPlus = el('button', { type: 'button', class: 'creation-project-settings__step', 'data-dimension': 'height', 'data-delta': '1', 'aria-label': '高さを1ピクセル増やす' }, '+');
  widthControl.append(widthMinus, width, widthPlus, el('span', { 'aria-hidden': 'true' }, 'px'));
  heightControl.append(heightMinus, height, heightPlus, el('span', { 'aria-hidden': 'true' }, 'px'));
  const ratio = el('input', { id: 'creation-project-ratio', type: 'checkbox', 'aria-label': '縦横比を固定' });
  const ratioLabel = el('label', { class: 'creation-project-settings__check', title: '縦横比を固定' });
  ratioLabel.append(ratio, el('span', { 'aria-hidden': 'true' }, '固定'));
  widthCard.append(widthLabel, widthControl);
  heightCard.append(heightLabel, heightControl);
  dimensions.append(widthCard, heightCard, widthError, heightError);
  const aspect = el('select', { id: 'creation-project-aspect', 'aria-label': '縦横比プリセット' });
  for (const [value, label] of ASPECTS) aspect.append(el('option', { value }, label));
  aspect.hidden = true;
  const shapeGroup = el('section', { class: 'creation-project-settings__shapes', 'aria-label': 'キャンバスの形' });
  const shapeHeading = el('div', { class: 'creation-project-settings__shape-heading' });
  shapeHeading.append(el('strong', {}, '形'), ratioLabel);
  const shapeButtons = el('div', { class: 'creation-project-settings__shape-buttons', role: 'group', 'aria-label': '形を選ぶ' });
  for (const [value, label] of [['1:1','正方形 1:1'], ['3:2','横長 3:2'], ['2:3','縦長 2:3'], ['free','自由']]) shapeButtons.append(el('button', { type: 'button', 'data-shape': value, 'aria-pressed': 'false' }, label));
  const otherShapes = el('details', { class: 'creation-project-settings__other-shapes' });
  otherShapes.append(el('summary', {}, 'ほかの比率'));
  const otherButtons = el('div', { class: 'creation-project-settings__shape-buttons' });
  for (const [value, label] of ASPECTS.filter(([value]) => !['free','1:1','3:2','2:3'].includes(value))) otherButtons.append(el('button', { type: 'button', 'data-shape': value, 'aria-pressed': 'false' }, label));
  otherShapes.append(otherButtons, shapeHeading); shapeGroup.append(shapeButtons, otherShapes, aspect);
  const gestureHint = el('small', { id: 'creation-dimension-gesture-hint', class: 'creation-project-settings__gesture-hint' }, '数値を ↔ スライド・タップで入力');
  const shapeError = el('small', { class: 'creation-project-settings__field-error', role: 'status', hidden: '' });
  shapeGroup.append(shapeError);
  areaPanel.append(areaHelp, dimensions, gestureHint, shapeGroup, largeCanvasNotice);
  const areaMore = el('section', { hidden: '' });

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
  const controls = el('div', { class: 'creation-project-settings__controls' });
  controls.append(areaPanel, areaMore, scalePanel, palettePanel);
  body.append(controls, compare, status, impactDetails);
  form.append(body);

  const footer = el('footer', { class: 'creation-project-settings__footer' });
  const cancelButton = el('button', { type: 'button', 'data-project-action': 'cancel' }, '取消');
  const applyButton = el('button', { type: 'button', 'data-project-action': 'apply', disabled: '' }, '適用');
  footer.append(cancelButton, applyButton);
  panel.append(header, tabs, form, footer);
  root.append(launcher, scrim, panel);

  let activeKind = 'area';
  let lastPreview = null;
  let revision = 0;
  let requestId = 0;
  let applying = false;
  let syncing = false;
  let previewTimer = 0;
  let focusedFieldScrollFrame = 0;
  let focusReturnTarget = launcher;
  let inertBackground = [];
  let lockedRatio = null;
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
    width.max = height.max = String(maxDimension());
    title.textContent = getMode() === 'audio' ? '音楽グリッド' : 'キャンバス設定';
    for (const [kind,button] of tabButtons) { button.hidden = getMode()==='audio' && kind!=='area'; button.disabled=button.hidden; }
    if (getMode()==='audio' && activeKind!=='area') setActiveTab('area',{preview:false});
    const music = getMode()==='audio';
    tabButtons.get('area').textContent = music ? '表示範囲' : TAB_LABELS.area;
    areaHelp.textContent = music ? '表示範囲だけ変更。曲の音程・開始時刻は変わりません。範囲外の音符も保持します。' : '絵の大きさを保ち、中央に余白を追加・切り取り。';
    anchorNote.textContent = music ? '基準：左上。幅は見える時間の列数、高さは見える音程の行数。' : '基準：中央';
    widthLabel.textContent = music ? '時間の列数 ↔' : '幅 ↔';
    heightLabel.textContent = music ? '音程の行数 ↕' : '高さ ↕';
    width.value = String(animation.width); height.value = String(animation.height);
    paletteText.value = animation.palette.join('\n'); palettePreset.value = 'current';
    paletteCount.value = String(COLOR_COUNTS.find(count => count >= animation.palette.length) || 128);
    aspect.value = 'free'; ratio.checked = false; lockedRatio = null; updateSizePresetState();
    if (resetScale) scaleInput.value = '100';
    updateScaleWidth(); updateScaleWarning(); renderSwatches();
    updateShapeState();
    syncing = false;
    clearDraftPreview('現在の作品を表示中です。変更を選ぶとプレビューします。');
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
  function renderBaseline(afterImage = null) {
    const image = afterImage || lastPreview?.image || currentFrameImage();
    if (!image) return;
    renderImage(afterCanvas, image);
    previewDimensions.textContent = `${image.width}×${image.height} px`;
    requestAnimationFrame(() => {
      const rect = afterStage.getBoundingClientRect();
      const scale = Math.max(.01, Math.min(Math.max(1, rect.width - 12) / image.width, Math.max(1, rect.height - 12) / image.height));
      afterCanvas.style.width = `${Math.max(1, image.width * scale)}px`;
      afterCanvas.style.height = `${Math.max(1, image.height * scale)}px`;
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
      const errors = validateCanvasSettingsFields({ width: width.value, height: height.value, palette: timeline()?.palette || [], maxDimension: maxDimension() });
      setFieldError(width, widthError, errors.width); setFieldError(height, heightError, errors.height);
      setFieldError(paletteText, paletteError); setFieldError(scaleInput, scaleError);
      return !errors.width && !errors.height;
    }
    if (activeKind === 'palette') {
      const errors = validateCanvasSettingsFields({ width: timeline()?.width, height: timeline()?.height, palette: selectedPalette(), maxDimension: maxDimension() });
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
    lastPreview = null; applyButton.disabled = true;
    impactDetails.hidden = true; impactText.textContent = '';
    status.textContent = message;
    renderBaseline();
  }
  function invalidate(message = '設定が変わりました。新しい内容をプレビューします。') {
    clearDraftPreview(message);
    if (!panel.hidden && validateActive()) previewTimer = setTimeout(() => { previewTimer = 0; void makePreview({ automatic: true }); }, 140);
  }
  function setActiveTab(kind, { focus = false, preview = true } = {}) {
    if (!tabPanels.has(kind) || getMode()==='audio' && kind!=='area') return;
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
  function assertLargeCanvasMode(kind, settings, owner) {
    if (getMode()==='audio' && kind!=='area') throw new Error('音楽ではグリッドの表示範囲だけ変更できます。');
    const targetWidth = kind === 'scale' ? Math.round(owner.width * settings.percent / 100) : settings.width;
    const targetHeight = kind === 'scale' ? Math.round(owner.height * settings.percent / 100) : settings.height;
    if (Math.max(targetWidth, targetHeight) > maxDimension()) throw new Error(`このモードでは${maxDimension()}pxまで設定できます。`);
  }
  function buildSettings(kind) {
    const settings = currentSettings(kind);
    if (kind === 'scale') return settings;
    return settings;
  }
  async function makePreview({ automatic = false } = {}) {
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = 0; }
    if (!validateActive()) {
      if (activeKind === 'palette') {
        paletteDetails.open = true;
        requestAnimationFrame(() => { paletteText.focus({ preventScroll: true }); keepFocusedFieldVisible(); });
      }
      if (!automatic) status.textContent = '入力を確認してください。';
      return;
    }
    const kind = activeKind; const settings = buildSettings(kind); const owner = timeline(); const requestedRevision = revision; const requestedMode = getMode(); const request = ++requestId;
    if (!settings || !owner) return;
    if (!automatic) status.textContent = 'プレビューを更新しています…';
    try {
      assertLargeCanvasMode(kind, settings, owner);
      let result;
      if (kind === 'scale') {
        if (typeof draw.previewSpriteScaleSettings !== 'function') throw new Error('絵の拡縮プレビューを読み込めません。');
        result = await draw.previewSpriteScaleSettings(settings.percent);
      } else {
        if (typeof draw.previewProjectSettings !== 'function') throw new Error('設定プレビューを読み込めません。');
        result = await draw.previewProjectSettings(settings);
      }
      if (requestedMode !== getMode() || request !== requestId || requestedRevision !== revision || kind !== activeKind || owner !== timeline() || result?.owner && result.owner !== owner) return;
      const image = asImage(result?.image);
      if (!image) throw new Error('プレビュー画像を作成できませんでした。');
      const changed = Boolean(result.changed);
      const previewRecord = { kind, mode:requestedMode, owner, revision: requestedRevision, settings, changed, image, width: image.width, height: image.height, summary: result.summary || {} };
      lastPreview = previewRecord;
      renderBaseline(image);
      impactDetails.hidden = false;
      impactText.textContent = previewRecord.summary.musicImpact || (kind === 'scale' ? '倍率変更は全コマ・全レイヤーに適用されます。' : '変更は全コマに適用されます。');
      const summary = previewRecord.summary;
      const dimensionsText = `${owner.width}×${owner.height} → ${image.width}×${image.height} px`;
      const compactSummary = getMode()==='audio' ? '・表示範囲のみ' : kind === 'area' && Number.isFinite(summary.croppedPixels)
        ? `・切り取られる画素 ${summary.croppedPixels}`
        : kind === 'palette' && Number.isFinite(summary.remappedColors)
          ? `・置き換わる色 ${summary.remappedColors}・全コマ`
          : '';
      status.textContent = kind === 'scale'
        ? `${settings.percent}%・${dimensionsText}`
        : kind === 'palette'
          ? `${image.width}×${image.height} px${compactSummary}`
          : `${dimensionsText}${compactSummary}`;
      if (!changed) status.textContent += '・変更なし';
      applyButton.disabled = !changed;
    } catch (error) {
      if (request === requestId && requestedRevision === revision && kind === activeKind) {
        lastPreview = null; applyButton.disabled = true; status.textContent = error?.message || 'プレビューできませんでした。';
        if (kind === 'scale' && (error instanceof RangeError || error?.code)) setFieldError(scaleInput, scaleError, error?.message || 'この倍率は現在の作品に適用できません。');
      }
    }
  }
  function adjustRatio(event) {
    const selectedRatio = ratioOf(aspect.value);
    if (!ratio.checked) return;
    const source = event.target; const other = source === width ? height : width;
    const sourceValue = Number(source.value); const animation = timeline();
    if (!Number.isInteger(sourceValue) || sourceValue < 1 || sourceValue > maxDimension() || !animation?.width || !animation?.height) return;
    const ratioValue = selectedRatio || lockedRatio || (Number(width.value) / Number(height.value)) || (animation.width / animation.height);
    const computed = source === width ? Math.round(sourceValue / ratioValue) : Math.round(sourceValue * ratioValue);
    other.value = String(Math.min(maxDimension(), Math.max(1, computed)));
    if (computed > maxDimension()) source.value = String(Math.max(1, Math.min(maxDimension(), Math.round(source === width ? maxDimension() * ratioValue : maxDimension() / ratioValue))));
  }
  function updateShapeState() {
    for (const button of shapeGroup.querySelectorAll('[data-shape]')) button.setAttribute('aria-pressed', String(button.dataset.shape === aspect.value));
  }
  function updateSizePresetState() {
    largeCanvasNotice.hidden = Number(width.value) <= 256 && Number(height.value) <= 256;
    panel.dataset.largeCanvas = String(!largeCanvasNotice.hidden);
    updateShapeState();
  }

  function isVisible(node) {
    if (!node?.isConnected || node.hidden || node.disabled || !node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }
  function closePanel({ restoreFocus = true } = {}) {
    if (panel.hidden || applying) return false;
    panel.hidden = true; scrim.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    for (const [node, wasInert] of inertBackground) node.inert = wasInert;
    inertBackground = [];
    clearDraftPreview('変更を取り消しました。');
    if (restoreFocus && focusReturnTarget?.isConnected) focusReturnTarget.focus({ preventScroll: true });
    return true;
  }
  function openPanel({ trigger } = {}) {
    if (!panel.hidden) return;
    draw.cancelInput?.();
    if (trigger?.isConnected) focusReturnTarget = trigger;
    else if (isVisible(launcher)) focusReturnTarget = launcher;
    else focusReturnTarget = document.querySelector('#creation-settings-open') || launcher;
    inertBackground = [...(root.parentElement?.children || [])].filter(node => node !== root).map(node => [node, node.inert]);
    for (const [node] of inertBackground) node.inert = true;
    scrim.hidden = false; panel.hidden = false; launcher.setAttribute('aria-expanded', 'true');
    sync({ resetScale: true }); setActiveTab('area', { preview: false });
    validateActive(); renderBaseline(); positionPanel();
    requestAnimationFrame(() => close.focus({ preventScroll: true }));
    invalidate('余白のプレビューを更新しています。');
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
    renderBaseline();
    keepFocusedFieldVisible();
  }

  scope.listen(launcher, 'click', () => { if (panel.hidden) openPanel({ trigger: launcher }); else closePanel({ restoreFocus: false }); });
  scope.listen(scrim, 'click', () => closePanel());
  scope.listen(close, 'click', () => closePanel()); scope.listen(cancelButton, 'click', () => closePanel());
  scope.listen(form, 'submit', event => event.preventDefault());
  scope.listen(document, 'keydown', event => {
    if (event.key === 'Tab' && !panel.hidden) {
      const focusable = [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.closest('[hidden]') && !node.closest('[inert]') && (!node.closest('details:not([open])') || node.matches('summary')) && node.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.key !== 'Escape' || panel.hidden || event.isComposing || applying) return;
    event.preventDefault(); event.stopImmediatePropagation(); closePanel();
    if (!panel.hidden) event.stopImmediatePropagation();
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
  scope.listen(dimensions, 'click', event => {
    const button = event.target.closest('[data-dimension]'); if (!button || !button.dataset.delta) return;
    const field = button.dataset.dimension === 'width' ? width : height;
    const next = Math.min(maxDimension(), Math.max(1, (Number(field.value) || 1) + Number(button.dataset.delta)));
    field.value = String(next); adjustRatio({ target: field }); updateSizePresetState(); validateActive(); invalidate('余白のプレビューを更新しています。');
  });
  // A gesture edits only the draft. Native vertical touch scrolling remains available.
  for (const field of [width, height]) {
    let gesture = null, suppressClick = false, wheelRemainder = 0, wheelAt = 0;
    const update = value => {
      const next = Math.min(maxDimension(), Math.max(1, Math.round(value)));
      if (String(next) === field.value) return;
      field.value = String(next); adjustRatio({ target: field }); updateSizePresetState(); validateActive(); invalidate('キャンバスのプレビューを更新しています。');
    };
    const finish = () => { gesture = null; field.classList.remove('is-scrubbing'); };
    scope.listen(field, 'pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || applying) return;
      suppressClick = false;
      if (event.pointerType === 'touch') event.preventDefault();
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, value: Number(field.value) || 1, dragging: false, vertical: false };
    });
    scope.listen(field, 'pointermove', event => {
      if (panel.hidden || !gesture || gesture.id !== event.pointerId || gesture.vertical) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.dragging) {
        if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { gesture.vertical = true; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        gesture.dragging = true; suppressClick = true; field.blur();
        field.setPointerCapture?.(event.pointerId); field.classList.add('is-scrubbing');
      }
      event.preventDefault(); update(gesture.value + Math.trunc(dx / 8));
    }, { passive: false });
    scope.listen(field, 'pointerup', event => {
      const tap = gesture && !gesture.dragging && !gesture.vertical && event.pointerType === 'touch';
      finish(); if (tap) field.focus({ preventScroll: true });
    });
    scope.listen(field, 'pointercancel', finish);
    scope.listen(field, 'lostpointercapture', event => { if (!field.hasPointerCapture?.(event.pointerId)) finish(); });
    scope.listen(field, 'click', event => {
      if (!suppressClick) return;
      event.preventDefault(); event.stopPropagation(); field.blur(); suppressClick = false;
    });
    scope.listen(field, 'wheel', event => {
      if (document.activeElement !== field || applying || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = performance.now(); if (now - wheelAt > 180) wheelRemainder = 0; wheelAt = now;
      wheelRemainder += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
      const steps = Math.trunc(wheelRemainder / 40);
      if (steps) { wheelRemainder -= steps * 40; update((Number(field.value) || 1) - steps); }
    }, { passive: false });
    scope.listen(field, 'blur', () => { wheelRemainder = 0; });
    field.setAttribute('title', 'タップで入力・左右にドラッグで増減。選択中はホイールでも調整');
    field.setAttribute('aria-describedby', `${field.id}-error creation-dimension-gesture-hint`);
  }
  scope.listen(width, 'input', event => { adjustRatio(event); updateSizePresetState(); validateActive(); invalidate('余白のプレビューを更新しています。'); });
  scope.listen(height, 'input', event => { adjustRatio(event); updateSizePresetState(); validateActive(); invalidate('余白のプレビューを更新しています。'); });
  scope.listen(ratio, 'change', () => {
    if (ratio.checked) lockedRatio = ratioOf(aspect.value) || (Number(width.value) / Number(height.value)) || (timeline()?.width / timeline()?.height);
    else { aspect.value = 'free'; lockedRatio = null; }
    updateShapeState(); validateActive(); invalidate('縦横比のプレビューを更新しています。');
  });
  function chooseShape(value) {
    const owner = timeline();
    const fit = fitCanvasAspect({ width: Number(width.value), height: Number(height.value), originalWidth: owner.width, originalHeight: owner.height, aspect: value, maxDimension: maxDimension() });
    if (!fit) { shapeError.hidden = false; shapeError.textContent = `この比率では${maxDimension()}pxを超えます。絵を切り取らないため変更できません。`; updateShapeState(); return; }
    shapeError.hidden = true; aspect.value = value;
    width.value = String(fit.width); height.value = String(fit.height);
    ratio.checked = value !== 'free'; lockedRatio = ratioOf(value) || null;
    updateSizePresetState(); validateActive(); invalidate('形のプレビューを更新しています。');
  }
  scope.listen(shapeGroup, 'click', event => {
    const button = event.target.closest('[data-shape]'); if (button) chooseShape(button.dataset.shape);
  });
  scope.listen(aspect, 'change', () => chooseShape(aspect.value));
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

  scope.listen(applyButton, 'click', async () => {
    if (applying) return;
    const current = lastPreview; const kind = activeKind; const settings = buildSettings(kind);
    if (!current || current.mode !== getMode() || current.kind !== kind || !isProjectSettingsPreviewCurrent(current, { owner: timeline(), revision, settings }) || !current.changed) return;
    const expectedOwner = current.owner;
    applyButton.disabled = true; cancelButton.disabled = true; close.disabled = true; tabs.inert = true; applying = true; form.inert = true;
    try {
      assertLargeCanvasMode(kind, settings, expectedOwner);
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
      form.inert = false; tabs.inert = false; close.disabled = false; cancelButton.disabled = false; applying = false; applyButton.disabled = true;
    }
  });
  const unsubscribe = draw.subscribe(() => {
    if (applying) return;
    for (const [kind,button] of tabButtons) { button.hidden=getMode()==='audio' && kind!=='area'; button.disabled=button.hidden; }
    if(getMode()==='audio' && activeKind!=='area') setActiveTab('area',{preview:false});
    clearDraftPreview('作品が変わりました。プレビューを更新しています。');
    renderBaseline();
    if (!panel.hidden && validateActive()) previewTimer = setTimeout(() => { previewTimer = 0; void makePreview({ automatic: true }); }, 140);
  });
  scope.add(() => {
    requestId++; revision++; lastPreview = null; unsubscribe?.(); if (previewTimer) clearTimeout(previewTimer);
    for (const [node, wasInert] of inertBackground) node.inert = wasInert;
    inertBackground = [];
  });

  sync({ resetScale: true });
  setActiveTab('area', { preview: false });
  return {
    nodes: [root], root, launcher, panel,
    open(value = {}) {
      openPanel(value);
      if (value.width) width.value = String(value.width);
      if (value.height) height.value = String(value.height);
      if (value.width || value.height) { validateActive(); renderBaseline(); invalidate('余白のプレビューを更新しています。'); }
    },
    sync() { sync(); },
    position: positionPanel,
    isOpen() { return !panel.hidden; },
    close: closePanel
  };
}
