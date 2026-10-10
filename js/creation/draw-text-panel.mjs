import { DRAW_TEXT_FONTS, applyTextMaskToDocument, loadDrawTextFont, rasterizeTextMask } from './draw-text.mjs';

const element = (tag, className, text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };

/** Mount the non-destructive text tool. The host owns editor-specific snapshot/history behavior. */
export function mountDrawTextPanel({ scope, host, getState, onBegin, onPreview, onApply, onCancel } = {}) {
  if (!scope || !host || typeof getState !== 'function' || typeof onBegin !== 'function' || typeof onPreview !== 'function' || typeof onApply !== 'function' || typeof onCancel !== 'function') throw new TypeError('文字ツールの接続先が不足しています。');
  const opener = element('button', 'draw-text-opener', '文字'); opener.type = 'button'; opener.setAttribute('aria-label', '文字を入力'); opener.title = '文字を入力';
  const toolbar = host.querySelector('.draw-fixed-left') || host.querySelector('.draw-controls');
  if (toolbar) toolbar.append(opener);
  const panel = element('section', 'draw-text-panel'); panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '文字を入力');
  const card = element('div', 'draw-text-panel__card');
  const header = element('header', 'draw-text-panel__header'); header.append(element('h2', '', '文字を入力'));
  const close = element('button', 'draw-text-panel__close', '閉じる'); close.type = 'button'; close.setAttribute('aria-label', '文字ツールを閉じる'); header.append(close);
  const form = element('form', 'draw-text-panel__form');
  const textLabel = element('label', '', '文字'); const textInput = element('textarea'); textInput.maxLength = 256; textInput.rows = 2; textInput.value = '文字'; textInput.setAttribute('aria-label', '描画する文字'); textLabel.append(textInput);
  const fontLabel = element('label', '', '書体'); const fontSelect = element('select'); fontSelect.setAttribute('aria-label', '書体');
  for (const font of DRAW_TEXT_FONTS) { const option = element('option', '', font.label); option.value = font.id; fontSelect.append(option); } fontLabel.append(fontSelect);
  const alignLabel = element('label', '', '配置'); const alignSelect = element('select'); alignSelect.setAttribute('aria-label', '文字の配置');
  for (const [value, label] of [['left', '左'], ['center', '中央'], ['right', '右']]) { const option = element('option', '', label); option.value = value; alignSelect.append(option); } alignLabel.append(alignSelect);
  const sizeLabel = element('label', '', '大きさ'); const sizeInput = element('input'); sizeInput.type = 'number'; sizeInput.min = '1'; sizeInput.max = '128'; sizeInput.step = '1'; sizeInput.value = '8'; sizeInput.inputMode = 'numeric'; sizeInput.setAttribute('aria-label', '文字の大きさ'); sizeLabel.append(sizeInput);
  const xLabel = element('label', '', 'X'); const xInput = element('input'); xInput.type = 'number'; xInput.step = '1'; xInput.value = '0'; xInput.inputMode = 'numeric'; xInput.setAttribute('aria-label', '文字のX位置'); xLabel.append(xInput);
  const yLabel = element('label', '', 'Y'); const yInput = element('input'); yInput.type = 'number'; yInput.step = '1'; yInput.value = '0'; yInput.inputMode = 'numeric'; yInput.setAttribute('aria-label', '文字のY位置'); yLabel.append(yInput);
  const colorLabel = element('label', '', '色'); const colorSelect = element('select'); colorSelect.setAttribute('aria-label', '文字の色'); colorLabel.append(colorSelect);
  const preview = element('canvas', 'draw-text-panel__preview'); preview.setAttribute('aria-label', '文字のプレビュー');
  const status = element('p', 'draw-text-panel__status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = element('div', 'draw-text-panel__actions'); const cancel = element('button', '', 'キャンセル'); cancel.type = 'button'; const apply = element('button', '', '適用'); apply.type = 'submit'; actions.append(cancel, apply);
  form.append(textLabel, fontLabel, alignLabel, sizeLabel, xLabel, yLabel, colorLabel, preview, status, actions); card.append(header, form); panel.append(card); host.append(panel);
  let active = false, source = null, state = null, revision = 0;
  let inertNodes = [];
  function fontDefinition(id) { return DRAW_TEXT_FONTS.find((font) => font.id === id) || DRAW_TEXT_FONTS[0]; }
  function closePanel({ restore = true } = {}) {
    if (!active) return;
    active = false; revision += 1; panel.hidden = true; opener.setAttribute('aria-expanded', 'false'); for (const [node, wasInert] of inertNodes) node.inert = wasInert; inertNodes = [];
    if (restore) onCancel(); source = null; state = null; opener.focus();
  }
  async function updatePreview() {
    if (!active || !state || !source) return;
    const run = ++revision;
    try {
      const colorIndex = Number(colorSelect.value); const font = await loadDrawTextFont(fontSelect.value);
      if (run !== revision || !active) return;
      const mask = rasterizeTextMask({ text: textInput.value, font, fontSize: Number(sizeInput.value), x: Number(xInput.value), y: Number(yInput.value), align: alignSelect.value, width: source.width, height: source.height });
      const next = applyTextMaskToDocument(source, mask, { colorIndex, selectionMask: state.selectionMask });
      if (run !== revision || !active) return;
      preview.width = source.width; preview.height = source.height; preview.style.setProperty('--draw-text-preview-color', source.palette[colorIndex]);
      const hex = source.palette[colorIndex].slice(1); const color = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)); const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255;
      const ctx = preview.getContext('2d'); if (ctx) { const image = ctx.createImageData(source.width, source.height); for (let i = 0; i < mask.length; i += 1) { const on = mask[i] >= 128 && (!state.selectionMask || state.selectionMask[i]); image.data.set(on ? [...color, alpha] : [0, 0, 0, 0], i * 4); } ctx.putImageData(image, 0, 0); }
      onPreview(next); status.textContent = state.selectionMask ? '選択範囲の内側にプレビューしています。' : 'プレビュー中。適用すると1回で戻せます。';
    } catch (error) { onPreview(source); const ctx = preview.getContext('2d'); ctx?.clearRect(0, 0, preview.width, preview.height); status.textContent = error?.message || 'プレビューを作成できません。'; }
  }
  function open() {
    if (active) return;
    const nextState = getState();
    if (nextState?.blockedReason) { status.textContent = nextState.blockedReason; return; }
    const initialDoc = nextState?.document || nextState?.doc;
    if (!initialDoc || !Array.isArray(initialDoc.palette)) return;
    if (onBegin('text') === false) return;
    state = nextState; const doc = nextState.document || nextState.doc; source = { ...doc, palette: [...doc.palette], pixels: [...doc.pixels] };
    colorSelect.replaceChildren(); source.palette.forEach((color, index) => { const option = element('option', '', `色 ${index + 1}`); option.value = String(index); option.style.color = color; colorSelect.append(option); });
    colorSelect.value = String(Number.isInteger(nextState.colorIndex) ? nextState.colorIndex : 0);
    xInput.max = String(source.width - 1); yInput.max = String(source.height - 1); sizeInput.max = String(Math.min(128, Math.max(source.width, source.height)));
    inertNodes = [...host.children].filter((node) => node !== panel).map((node) => [node, node.inert]);
    active = true; panel.hidden = false; opener.setAttribute('aria-expanded', 'true'); for (const [node] of inertNodes) node.inert = true; updatePreview(); textInput.focus(); textInput.select();
  }
  opener.setAttribute('aria-haspopup', 'dialog'); opener.setAttribute('aria-expanded', 'false'); opener.addEventListener('click', open);
  close.addEventListener('click', () => closePanel()); cancel.addEventListener('click', () => closePanel());
  for (const input of [textInput, fontSelect, alignSelect, sizeInput, xInput, yInput, colorSelect]) input.addEventListener('input', updatePreview);
  form.addEventListener('submit', async (event) => { event.preventDefault(); if (!active) return; const current = getState(); if (current?.blockedReason || !(current?.document || current?.doc)) { status.textContent = current?.blockedReason || '適用できません。'; return; }
    const run = revision;
    try { const font = await loadDrawTextFont(fontSelect.value); if (!active || run !== revision) return; const mask = rasterizeTextMask({ text: textInput.value, font, fontSize: Number(sizeInput.value), x: Number(xInput.value), y: Number(yInput.value), align: alignSelect.value, width: source.width, height: source.height }); const next = applyTextMaskToDocument(source, mask, { colorIndex: Number(colorSelect.value), selectionMask: state.selectionMask }); if (onApply(next) !== false) closePanel({ restore: false }); }
    catch (error) { status.textContent = error?.message || '文字を適用できません。'; }
  });
  scope.listen(document, 'keydown', (event) => { if (event.key === 'Escape' && active) { event.preventDefault(); closePanel(); } });
  scope.listen(document, 'keydown', (event) => { if (!active || event.key !== 'Tab') return; const items = [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')]; if (!items.length) return; const first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } });
  scope.add(() => { closePanel(); opener.remove(); panel.remove(); });
  return { open, close: closePanel, get isOpen() { return active; } };
}
