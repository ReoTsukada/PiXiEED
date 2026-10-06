/** Small Draw-only selection sheet; closing explicitly cancels the floating edit. */
export function mountDrawSelectionPanel({ scope, host, getState, onAction, beforeOpen }) {
  const doc = host.ownerDocument;
  const launcher = doc.createElement('button'); launcher.id = 'draw-selection-open'; launcher.type = 'button';
  launcher.setAttribute('aria-label', '選択の操作：コピー・貼付・変形'); launcher.title = '選択の操作';
  launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'draw-selection-panel');
  launcher.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5M9 9h6v6H9z"/></svg>';
  host.append(launcher);
  const panel = doc.createElement('section'); panel.id = 'draw-selection-panel'; panel.className = 'draw-selection-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', '選択の操作');
  panel.innerHTML = `<header class="draw-panel-header"><h2>選択の操作</h2><button type="button" class="draw-panel-close" data-selection-action="close" aria-label="選択の操作を閉じて未確定の変形を取り消す">×</button></header>
    <div class="draw-selection-panel__body">
      <p data-selection-status aria-live="polite">範囲選択で絵を囲んでください。</p>
      <div class="draw-selection-panel__clipboard"><button type="button" data-selection-action="copy">コピー</button><button type="button" data-selection-action="cut">カット</button><button type="button" data-selection-action="paste">貼り付け</button></div>
      <div class="draw-selection-panel__size"><label>幅<input id="draw-selection-width" type="number" min="1" max="256" step="1" inputmode="numeric"></label><label>高さ<input id="draw-selection-height" type="number" min="1" max="256" step="1" inputmode="numeric"></label></div>
      <label class="draw-selection-panel__ratio"><input id="draw-selection-ratio" type="checkbox" checked>縦横比を固定</label>
      <div class="draw-selection-panel__size"><label>角度 °<input id="draw-selection-angle" type="number" min="-3600" max="3600" step="any" inputmode="decimal" data-selection-field="angle"></label></div>
      <div class="draw-selection-panel__size"><label>回転中心 X<input id="draw-selection-pivot-x" type="number" min="-1024" max="1024" step="any" inputmode="decimal" data-selection-field="pivot" data-axis="x"></label><label>回転中心 Y<input id="draw-selection-pivot-y" type="number" min="-1024" max="1024" step="any" inputmode="decimal" data-selection-field="pivot" data-axis="y"></label></div>
      <div class="draw-selection-panel__size"><label>枠の位置 X<input id="draw-selection-x" type="number" min="-1024" max="1024" step="any" inputmode="decimal" data-selection-field="position" data-axis="x"></label><label>枠の位置 Y<input id="draw-selection-y" type="number" min="-1024" max="1024" step="any" inputmode="decimal" data-selection-field="position" data-axis="y"></label></div>
      <div class="draw-selection-panel__transforms"><button type="button" data-selection-action="rotate-left" aria-label="選択を左に90度回転">↶ 90°</button><button type="button" data-selection-action="rotate-right" aria-label="選択を右に90度回転">↷ 90°</button><button type="button" data-selection-action="flip-x">左右反転</button><button type="button" data-selection-action="flip-y">上下反転</button></div>
      <div class="draw-selection-panel__commit"><button type="button" data-selection-action="cancel">取消</button><button type="button" data-selection-action="confirm">確定</button></div>
      <p class="draw-selection-panel__help">四隅で拡縮、↻で自由回転、二重リングで回転中心を移動。90°付近は吸着、Shiftで90°刻み、Altで吸着なし。内側は移動（小さい範囲はAlt＋ドラッグ、または位置の数値）。幅・高さ・反転は回転した枠の軸が基準です。自由回転は画素の形が変わる場合があります。透明は上書きしません。カット後の貼付を取り消してもカットは残り、「戻す」で復元できます。</p>
    </div>`;
  doc.body.append(panel);
  // Keep commit/cancel reachable even when a phone scrolls the other operations.
  panel.append(panel.querySelector('.draw-selection-panel__commit'));
  function position() {
    const anchor = launcher.getBoundingClientRect(), controls = host.closest('.draw-controls').getBoundingClientRect();
    const top = Math.max(doc.querySelector('.site-header')?.getBoundingClientRect().bottom || 64, doc.querySelector('.project-bar')?.getBoundingClientRect().bottom || 0) + 8;
    const bottom = (doc.querySelector('.app-tabs')?.getBoundingClientRect().top || innerHeight) - 8;
    const width = Math.min(280, innerWidth - 24);
    const portrait = innerWidth <= 600 && innerHeight > innerWidth;
    const height = Math.min(380, bottom - top, portrait ? Math.max(224, (bottom - top) * .55) : Infinity);
    panel.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, controls.left + (controls.width - width) / 2))}px`;
    panel.style.top = `${portrait ? bottom - height : Math.max(top, Math.min(bottom - height, anchor.top - height - 8))}px`;
    panel.style.width = `${width}px`; panel.style.maxHeight = `${Math.max(100, height)}px`;
  }
  function hide() { panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); }
  function sync() {
    const state = getState(), bounds = state.bounds;
    launcher.dataset.pending = String(state.pending);
    panel.querySelector('[data-selection-status]').textContent = state.error || (state.pending ? '未確定です。確定／Enterで適用、Escで取消。' : bounds ? `${bounds.width} × ${bounds.height} pxを選択中` : '範囲選択で絵を囲んでください。');
    for (const input of panel.querySelectorAll('input[type="number"]')) {
      const field = input.dataset.selectionField, axis = input.dataset.axis;
      const value = !bounds ? '' : field === 'pivot' ? bounds.pivot[axis] : field === 'position' ? bounds[axis] : field === 'angle' ? bounds.angle : bounds[input.id.endsWith('width') ? 'width' : 'height'];
      if (doc.activeElement !== input) input.value = typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : value;
      input.disabled = !state.canTransform;
    }
    for (const button of panel.querySelectorAll('[data-selection-action]')) {
      const action = button.dataset.selectionAction;
      button.disabled = action === 'copy' ? !state.canCopy : action === 'cut' ? !state.canCut : action === 'paste' ? !state.canPaste
        : ['rotate-left', 'rotate-right', 'flip-x', 'flip-y'].includes(action) ? !state.canTransform
        : ['confirm', 'cancel'].includes(action) ? !state.pending : false;
    }
  }
  scope.listen(launcher, 'click', () => {
    if (!panel.hidden) { onAction('cancel'); hide(); return; }
    beforeOpen(); sync(); position(); panel.hidden = false; launcher.setAttribute('aria-expanded', 'true');
  });
  scope.listen(panel, 'click', event => {
    const action = event.target.closest('[data-selection-action]')?.dataset.selectionAction;
    if (!action) return;
    onAction(action === 'close' ? 'cancel' : action);
    if (action === 'close' || action === 'confirm' && !getState().pending) { hide(); launcher.focus({ preventScroll: true }); }
    sync();
  });
  for (const input of panel.querySelectorAll('input[type="number"]')) scope.listen(input, 'change', () => {
    if (input.value && input.reportValidity()) onAction(input.dataset.selectionField || 'resize', { axis: input.dataset.axis || (input.id.endsWith('width') ? 'width' : 'height'), value: Number(input.value), fixedRatio: panel.querySelector('#draw-selection-ratio').checked });
    sync();
  });
  scope.listen(doc, 'keydown', event => {
    if (event.key !== 'Escape' || panel.hidden || doc.querySelector('dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); onAction('cancel'); hide(); launcher.focus({ preventScroll: true });
  }, { capture: true });
  scope.listen(window, 'resize', position);
  scope.add(() => { panel.remove(); launcher.remove(); });
  return { sync, hide, get fixedRatio() { return panel.querySelector('#draw-selection-ratio').checked; }, contains(target) { return panel.contains(target) || launcher.contains(target); } };
}
