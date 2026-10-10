/** Two fixed contextual action slots, separate from held mouse-button inputs. */
export function mountDrawSelectionPanel({ scope, host, getState, onAction, beforeOpen, auxiliaryHost }) {
  const doc = host.ownerDocument, root = doc.createElement('section');
  root.id = 'draw-selection-controls'; root.className = 'draw-selection-controls'; root.setAttribute('aria-label', '選択と貼り付け');
  root.innerHTML = `<div class="draw-selection-controls__row"><button type="button" data-selection-slot="0"></button><button type="button" data-selection-slot="1"></button></div><button type="button" class="draw-selection-controls__deselect" data-selection-action="deselect">確定・選択解除</button><p data-selection-status aria-live="polite"></p>`;
  const controls = host.querySelector('.draw-controls'), right = controls.querySelector('.draw-fixed-right'); right.prepend(root);
  const fields = doc.createElement('details'); fields.id = 'draw-selection-numbers'; fields.className = 'draw-selection-numbers';
  fields.innerHTML = `<summary>選択の数値補助</summary><label class="draw-selection-panel__ratio"><input id="draw-selection-ratio" type="checkbox" checked>幅・高さの比率を固定</label><div class="draw-selection-numbers__grid"><label>幅<input id="draw-selection-width" type="number" min="1" max="256" step="1"></label><label>高さ<input id="draw-selection-height" type="number" min="1" max="256" step="1"></label><label>角度 °<input id="draw-selection-angle" type="number" min="-3600" max="3600" step="any" data-selection-field="angle"></label><label>位置 X<input id="draw-selection-x" type="number" min="-1024" max="1024" step="any" data-selection-field="position" data-axis="x"></label><label>位置 Y<input id="draw-selection-y" type="number" min="-1024" max="1024" step="any" data-selection-field="position" data-axis="y"></label><label>中心 X<input id="draw-selection-pivot-x" type="number" min="-1024" max="1024" step="any" data-selection-field="pivot" data-axis="x"></label><label>中心 Y<input id="draw-selection-pivot-y" type="number" min="-1024" max="1024" step="any" data-selection-field="pivot" data-axis="y"></label></div><p>四隅は中心を基準に拡縮＋回転。幅・高さの個別変更は数値で。カット後の貼付取消ではカットは戻りません。</p>`;
  auxiliaryHost.append(fields);
  let mode = 'select', wasPending = false;
  const buttons = [...root.querySelectorAll('[data-selection-slot]')], held = new Map();
  function sync() {
    const s = getState();
    if (wasPending && !s.pending) mode = s.hasClipboard ? 'paste' : 'select';
    if (!s.bounds && s.hasClipboard) mode = 'paste';
    wasPending = s.pending;
    root.dataset.pending = String(s.pending); root.dataset.mode = s.pending ? 'pending' : mode; root.dataset.active = String(Boolean(s.selectTool || s.bounds || s.pending));
    const actions = s.pending ? [['confirm', '✓ 確定', !s.busy], ['cancel', '× 取消', !s.busy]]
      : mode === 'paste' ? [['paste', '貼り付け', s.canPaste], ['back', '範囲へ', !s.busy]]
        : [['copy', 'コピー', s.canCopy], ['cut', 'カット', s.canCut]];
    buttons.forEach((button, i) => {
      const [action, label, enabled] = actions[i]; button.dataset.selectionAction = action;
      // Preserve the pressed text node: WebKit can drop a native mouse click
      // when pointerdown synchronization replaces that node with the same label.
      if (button.textContent !== label) button.textContent = label;
      button.disabled = !enabled;
    });
    root.querySelector('p').textContent = s.error || (s.pending ? '✓で確定。選択ツールで外をタップすると確定・解除。取消は× / Esc。' : s.bounds ? '選択内に描画できます。選択ツールで外タップは解除、Shiftで追加、Ctrl / ⌘で減算。' : s.hasClipboard ? '貼付で前のコピーを使えます。範囲へで新しい範囲を選べます。' : s.colorMode ? '画素をタップすると、このレイヤーの同じ色をすべて選びます。' : '選択ツールで範囲を囲んでください。');
    const bounds = s.bounds;
    for (const input of fields.querySelectorAll('input[type="number"]')) {
      const field = input.dataset.selectionField, axis = input.dataset.axis;
      const value = !bounds ? '' : field === 'pivot' ? bounds.pivot[axis] : field === 'position' ? bounds[axis] : field === 'angle' ? bounds.angle : bounds[input.id.endsWith('width') ? 'width' : 'height'];
      if (doc.activeElement !== input) input.value = typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : value;
      input.disabled = !s.canTransform || s.busy;
    }
  }
  scope.listen(root, 'pointerdown', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    held.set(event.pointerId, { button, action: button.dataset.selectionAction, phase: root.dataset.mode });
  });
  scope.listen(root, 'pointercancel', event => held.delete(event.pointerId));
  scope.listen(root, 'click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    const record = held.get(event.pointerId); held.clear();
    if (record && (record.button !== button || record.action !== button.dataset.selectionAction || record.phase !== root.dataset.mode)) return;
    const action = record?.action || button.dataset.selectionAction;
    if (action === 'back') { mode = 'select'; onAction('back'); }
    else if (onAction(action) && ['copy', 'cut'].includes(action)) mode = 'paste';
    sync();
  });
  const deselectButton = root.querySelector('[data-selection-action="deselect"]');
  scope.listen(deselectButton, 'click', () => { held.clear(); onAction('deselect'); sync(); });
  for (const input of fields.querySelectorAll('input[type="number"]')) scope.listen(input, 'change', () => {
    if (input.value && input.reportValidity()) onAction(input.dataset.selectionField || 'resize', { axis: input.dataset.axis || (input.id.endsWith('width') ? 'width' : 'height'), value: Number(input.value), fixedRatio: fields.querySelector('#draw-selection-ratio').checked });
    sync();
  });
  scope.add(() => { fields.remove(); right.remove(); });
  return { sync, deselectButton, hide() { fields.open = false; }, get fixedRatio() { return fields.querySelector('#draw-selection-ratio').checked; },
    contains(target) { return root.contains(target) || fields.contains(target) || deselectButton.contains(target); },
    setMode(next) { mode = next; sync(); }, focus() { beforeOpen(); fields.open = true; fields.querySelector('input[type="number"]')?.focus({ preventScroll: true }); } };
}
