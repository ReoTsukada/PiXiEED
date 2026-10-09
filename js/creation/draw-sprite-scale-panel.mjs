/** Sprite-wide nearest-neighbor scale controls for the Draw canvas panel. */
export const DRAW_SPRITE_SCALE_PRESETS = Object.freeze([25, 50, 100, 200, 300, 1000]);

export function mountDrawSpriteScalePanel({ scope, root, getState, plan, onApply, onLayout } = {}) {
  if (!scope?.listen || typeof scope.disposed !== 'boolean') throw new TypeError('Sprite scale panel requires a lifecycle scope');
  if (!root || typeof getState !== 'function' || typeof plan !== 'function' || typeof onApply !== 'function') {
    throw new TypeError('Sprite scale panel requires its root, state, plan, and apply handlers');
  }
  const form = root.querySelector('#draw-sprite-scale-form');
  const input = root.querySelector('#draw-sprite-scale-percent');
  const preview = root.querySelector('#draw-sprite-scale-preview');
  const reason = root.querySelector('#draw-sprite-scale-reason');
  const apply = root.querySelector('#draw-sprite-scale-apply');
  const note = root.querySelector('#draw-sprite-scale-note');
  const presets = [...root.querySelectorAll('[data-draw-sprite-scale]')];
  if (![form, input, preview, reason, apply, note].every(Boolean) || presets.length !== DRAW_SPRITE_SCALE_PRESETS.length) {
    throw new TypeError('Sprite scale panel markup is incomplete');
  }

  let cachedAnimation = null;
  let cachedBlockedReason = null;
  let cachedPercent = null;
  let cachedPlan = null;
  let lastLayout = '';
  let failedAnimation = null;
  let failedPercent = null;
  let failureReason = '';

  const formatDimensions = (width, height) => Number.isFinite(width) && Number.isFinite(height)
    ? `${width} × ${height} px`
    : '—';
  const setText = (node, value) => {
    const text = String(value ?? '');
    if (node.textContent !== text) node.textContent = text;
    return text;
  };
  function readPercent() {
    const raw = String(input.value ?? '').trim();
    const value = Number(raw);
    const valid = raw !== '' && Number.isFinite(value) && value > 0 && input.validity?.valid !== false;
    return { value, valid };
  }
  function plannedResult(animation, blockedReason, percent, valid) {
    if (!valid || !animation) return null;
    if (animation === cachedAnimation && blockedReason === cachedBlockedReason && percent === cachedPercent) return cachedPlan;
    let next;
    try {
      next = plan(animation, percent);
      if (!next || typeof next !== 'object') throw new TypeError('倍率のプレビューを計算できません。');
    } catch (error) {
      next = { width: animation.width, height: animation.height, changed: false, allowed: false, reason: error?.message || '倍率を確認できません。' };
    }
    cachedAnimation = animation;
    cachedBlockedReason = blockedReason;
    cachedPercent = percent;
    cachedPlan = next;
    return next;
  }
  function sync() {
    if (scope.disposed) return null;
    const state = getState() || {};
    const animation = state.animation || null;
    const blockedReason = String(state.blockedReason || '');
    const { value: percent, valid } = readPercent();
    if (failureReason && (animation !== failedAnimation || (valid && percent !== failedPercent))) {
      failedAnimation = null; failedPercent = null; failureReason = '';
    }
    const result = plannedResult(animation, blockedReason, percent, valid);
    const width = state.readOnlyDimensions?.width ?? animation?.width;
    const height = state.readOnlyDimensions?.height ?? animation?.height;
    setText(preview, animation
      ? `現在 ${formatDimensions(width, height)} → ${state.readOnlyDimensions ? '—' : formatDimensions(result?.width ?? width, result?.height ?? height)}`
      : 'スプライトを読み込み中');

    const fractional = valid && !Number.isInteger(percent / 100);
    note.hidden = valid && percent >= 100 && !fractional;
    let message = '';
    if (!valid) message = '0より大きい倍率を入力してください。';
    else if (blockedReason) message = blockedReason;
    else if (failureReason && animation === failedAnimation && percent === failedPercent) message = failureReason;
    else if (!animation) message = 'スプライトを読み込んでから倍率を設定できます。';
    else if (result?.reason) message = result.reason;
    else if (percent === 100) message = '100%ではサイズが変わらないため適用できません。';
    else if (result && !result.allowed) message = 'この倍率は適用できません。';
    else if (result && !result.changed) message = '丸め後のサイズが現在と同じため変更はありません。';
    setText(reason, message);

    if (valid) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
    for (const button of presets) button.setAttribute('aria-pressed', String(Number(button.dataset.drawSpriteScale) === percent));
    const matchingFailure = Boolean(failureReason && animation === failedAnimation && percent === failedPercent);
    const disabled = !valid || !animation || Boolean(blockedReason) || matchingFailure || !result?.allowed || !result.changed || percent === 100;
    apply.disabled = disabled;
    const layout = [preview.textContent, reason.textContent, String(note.hidden), String(disabled)].join('\u0000');
    if (layout !== lastLayout) { lastLayout = layout; onLayout?.(); }
    return { percent, result, disabled };
  }

  scope.listen(input, 'input', sync);
  scope.listen(input, 'change', sync);
  for (const button of presets) scope.listen(button, 'click', event => {
    event.preventDefault();
    input.value = button.dataset.drawSpriteScale;
    sync();
  });
  scope.listen(form, 'submit', event => {
    event.preventDefault();
    const current = sync();
    if (!current || current.disabled) return;
    onApply(current.percent, current.result);
  });
  sync();
  function reportFailure(message, animation, percent) {
    failedAnimation = animation;
    failedPercent = Number(percent);
    failureReason = String(message || 'スプライト倍率を適用できませんでした。');
    return sync();
  }
  return { sync, reportFailure };
}
