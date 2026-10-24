const SIZED_TOOLS = new Set(['pen', 'eraser', 'line', 'rectangle', 'rectangle-fill', 'ellipse', 'ellipse-fill', 'spray']);
export function brushSettingForTool(binding = {}) {
  const spray = binding.tool === 'spray';
  return { supported: SIZED_TOOLS.has(binding.tool), value: spray ? binding.spraySize ?? 5 : binding.brushSize ?? 1,
    key: spray ? 'spraySize' : 'brushSize', min: 1, max: spray ? 33 : 16, step: spray ? 2 : 1,
    label: spray ? 'スプレーの範囲（直径）' : '線・輪郭の太さ', filled: /^(rectangle|ellipse)-fill$/.test(binding.tool || '') };
}

/** Immediate input preferences; opening/closing never edits artwork or its history. */
export function mountDrawBrushSettings({ scope, host, getState, onChange, beforeOpen }) {
  const doc = host.ownerDocument;
  const opener = doc.createElement('button'); opener.type = 'button'; opener.id = 'draw-brush-size-open'; opener.className = 'draw-brush-size-open';
  opener.setAttribute('aria-haspopup', 'dialog'); opener.setAttribute('aria-controls', 'draw-brush-settings-panel'); opener.setAttribute('aria-expanded', 'false');
  const inlineControl = doc.createElement('div'); inlineControl.className = 'draw-brush-size-inline'; inlineControl.setAttribute('role', 'group'); inlineControl.setAttribute('aria-label', '線の太さ');
  const inlineRange = doc.createElement('input'); inlineRange.type = 'range'; inlineRange.className = 'draw-brush-size-inline__range'; inlineRange.setAttribute('aria-label', '現在の線の太さ');
  const inlineValue = doc.createElement('output'); inlineValue.className = 'draw-brush-size-inline__value'; inlineValue.setAttribute('aria-live', 'polite');
  inlineControl.append(inlineRange, inlineValue, opener);
  const dialog = doc.createElement('dialog'); dialog.id = 'draw-brush-settings-panel'; dialog.className = 'draw-brush-settings'; dialog.setAttribute('aria-labelledby', 'draw-brush-settings-title');
  dialog.innerHTML = `<header><h2 id="draw-brush-settings-title">サイズ</h2><button type="button" data-brush-close aria-label="サイズ設定を閉じる">閉じる</button></header>
    <div class="draw-brush-settings__sides" role="group" aria-label="設定するマウスボタン"><button type="button" data-brush-side="left">左</button><button type="button" data-brush-side="right">右</button></div>
    <p data-brush-tool></p><label for="draw-brush-size-value" data-brush-label></label>
    <div class="draw-brush-settings__value"><input id="draw-brush-size-value" type="number" inputmode="numeric"><span>px</span></div>
    <input id="draw-brush-size-range" type="range" aria-label="サイズを変更"><p data-brush-help></p><p data-brush-status role="status" aria-live="polite"></p>`;
  doc.body.append(dialog);
  let side = 'left';
  const number = dialog.querySelector('#draw-brush-size-value'), range = dialog.querySelector('#draw-brush-size-range');
  const status = dialog.querySelector('[data-brush-status]');
  function sync() {
    const state = getState(), current = state.bindings[state.side || 'left'], setting = brushSettingForTool(current);
    // Pointer-down cancellation also syncs these controls. Replacing the label
    // during that gesture can cancel the browser's native button click.
    const text = `サイズ ${setting.supported ? `${setting.value}px` : '—'}`;
    if (opener.textContent !== text) opener.textContent = text;
    opener.setAttribute('aria-label', `サイズ設定。${state.side === 'right' ? '右' : '左'}ボタン${setting.supported ? ` ${setting.value}px` : 'の道具はサイズ対象外'}`);
    opener.disabled = Boolean(state.blockedReason);
    for (const input of [inlineRange]) { input.min = String(setting.min); input.max = String(setting.max); input.step = String(setting.step); input.disabled = !setting.supported || Boolean(state.blockedReason); input.value = String(setting.value); }
    inlineRange.title = setting.supported ? setting.label : 'この道具は線の太さを使いません';
    inlineRange.setAttribute('aria-valuetext', setting.supported ? `${state.side === 'right' ? '右' : '左'}ボタン ${setting.value}px` : 'この道具はサイズ対象外');
    inlineValue.value = setting.supported ? `${setting.value}px` : '—';
    inlineValue.textContent = inlineValue.value;
    if (!dialog.open) return;
    const binding = state.bindings[side], config = brushSettingForTool(binding);
    for (const button of dialog.querySelectorAll('[data-brush-side]')) button.setAttribute('aria-pressed', String(button.dataset.brushSide === side));
    dialog.querySelector('[data-brush-tool]').textContent = `${side === 'left' ? '左' : '右'}ボタン：${state.toolNames[binding.tool] || binding.tool}`;
    dialog.querySelector('[data-brush-label]').textContent = config.label;
    for (const input of [number, range]) { input.min = String(config.min); input.max = String(config.max); input.step = String(config.step); input.disabled = !config.supported || Boolean(state.blockedReason); input.value = String(config.value); }
    dialog.querySelector('[data-brush-help]').textContent = !config.supported ? 'この道具は線の太さを使いません。左右の道具を選び直せます。'
      : config.filled ? '塗り図形の大きさはドラッグで決めます。この太さは輪郭に切り替えたときに使います。'
        : config.key === 'spraySize' ? '1〜33pxの奇数で指定します。初期値は5pxです。' : '1〜16px。初期値は1px。選択範囲の外へは描きません。';
  }
  function close() { if (dialog.open) dialog.close(); opener.setAttribute('aria-expanded', 'false'); opener.focus({ preventScroll: true }); }
  scope.listen(opener, 'click', () => {
    if (getState().blockedReason || beforeOpen?.() === false) return;
    side = getState().side === 'right' ? 'right' : 'left'; status.textContent = ''; dialog.showModal(); opener.setAttribute('aria-expanded', 'true'); sync();
    (number.disabled ? dialog.querySelector(`[data-brush-side="${side}"]`) : number).focus({ preventScroll: true });
  });
  scope.listen(dialog.querySelector('[data-brush-close]'), 'click', close);
  scope.listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  scope.listen(dialog, 'click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); });
  for (const button of dialog.querySelectorAll('[data-brush-side]')) scope.listen(button, 'click', () => { side = button.dataset.brushSide; status.textContent = ''; sync(); });
  function change(input, targetSide = side) {
    const state = getState();
    if (state.blockedReason) return;
    const config = brushSettingForTool(state.bindings[targetSide]), value = Number(input.value);
    if (!config.supported || !Number.isInteger(value) || value < config.min || value > config.max || config.key === 'spraySize' && value % 2 !== 1) {
      if (dialog.open) status.textContent = config.key === 'spraySize' ? '範囲は1〜33pxの奇数で入力してください。' : '太さは1〜16pxの整数で入力してください。'; return;
    }
    if (onChange(targetSide, config.key, value) !== false) { if (dialog.open) status.textContent = `${value}pxに設定しました。`; sync(); }
  }
  scope.listen(number, 'change', () => change(number)); scope.listen(range, 'input', () => change(range));
  scope.listen(inlineRange, 'input', () => { const currentSide = getState().side === 'right' ? 'right' : 'left'; change(inlineRange, currentSide); });
  scope.add(() => { if (dialog.open) dialog.close(); dialog.remove(); inlineControl.remove(); });
  sync(); return { opener, inlineControl, sync, close, get isOpen() { return dialog.open; } };
}
