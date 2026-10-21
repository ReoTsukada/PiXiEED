/** Camera-only canvas sizing. Resizing changes bounds without scaling source pixels. */
export function mountCameraCanvasSettings({ draw, scope, isActive = () => true } = {}) {
  if (!draw?.getTimeline || !draw?.setProjectSettings || !draw?.subscribe || !scope?.listen || !scope?.add) {
    throw new TypeError('Camera canvas settings require Draw, a scope, and a timeline subscription');
  }
  const root = document.createElement('section');
  root.className = 'camera-canvas-settings'; root.dataset.modeOwner = 'camera';
  root.setAttribute('aria-label', 'カメラのキャンバス設定');
  const panel = document.createElement('div');
  panel.className = 'camera-canvas-settings__panel'; panel.id = 'camera-canvas-settings-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'camera-canvas-settings-title'); panel.tabIndex = -1; panel.hidden = true;
  const header = document.createElement('header'); header.className = 'camera-canvas-settings__header';
  const title = document.createElement('h2'); title.id = 'camera-canvas-settings-title'; title.textContent = 'カメラのPX数・比率';
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'camera-canvas-settings__close';
  closeButton.textContent = '閉じる'; closeButton.setAttribute('aria-label', 'カメラのキャンバス設定を閉じる'); header.append(title, closeButton);
  const intro = document.createElement('p'); intro.className = 'camera-canvas-settings__help';
  intro.textContent = '変更するとプレビューに反映されます。撮影元の画像は変わりません。作品の絵は拡大縮小せず、中央基準で余白を切り取り・追加します。切り取った絵は「戻す」で復元できます。';
  const current = document.createElement('p'); current.className = 'camera-canvas-settings__current'; current.setAttribute('aria-live', 'polite');
  const rangeLabel = document.createElement('label'); rangeLabel.className = 'camera-canvas-settings__range-label'; rangeLabel.textContent = '長辺';
  const range = document.createElement('input'); range.type = 'range'; range.min = '1'; range.max = '256'; range.step = '1';
  range.setAttribute('aria-label', 'キャンバスの長辺（px）'); rangeLabel.append(range);
  const presets = document.createElement('div'); presets.className = 'camera-canvas-settings__presets';
  presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', '長辺のサイズ候補');
  for (const px of [16, 32, 64, 128, 256]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.px = String(px); button.textContent = `${px}px`; presets.append(button);
  }
  const dimensions = document.createElement('div'); dimensions.className = 'camera-canvas-settings__dimensions';
  const makeNumber = (name, id) => {
    const label = document.createElement('label'); label.htmlFor = id; label.textContent = name;
    const wrap = document.createElement('span'); wrap.className = 'camera-canvas-settings__number';
    const input = document.createElement('input'); input.type = 'number'; input.id = id; input.min = '1'; input.max = '256'; input.step = '1'; input.inputMode = 'numeric';
    const unit = document.createElement('span'); unit.textContent = 'px'; unit.setAttribute('aria-hidden', 'true');
    wrap.append(input, unit); dimensions.append(label, wrap); return input;
  };
  const width = makeNumber('幅', 'camera-canvas-settings-width');
  const height = makeNumber('高さ', 'camera-canvas-settings-height');
  width.setAttribute('aria-label', '幅（px）'); height.setAttribute('aria-label', '高さ（px）');
  const aspects = document.createElement('div'); aspects.className = 'camera-canvas-settings__aspects';
  aspects.setAttribute('role', 'group'); aspects.setAttribute('aria-label', '縦横比');
  for (const [ratio, label] of [['1:1', '1:1'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9'], ['free', '自由']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.ratio = ratio; button.textContent = label; aspects.append(button);
  }
  const status = document.createElement('p'); status.className = 'camera-canvas-settings__status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const footer = document.createElement('footer');
  const undoButton = document.createElement('button'); undoButton.type = 'button'; undoButton.textContent = '戻す'; undoButton.disabled = true;
  const resetButton = document.createElement('button'); resetButton.type = 'button'; resetButton.textContent = 'この画面の変更をリセット'; resetButton.disabled = true;
  footer.append(undoButton, resetButton); panel.append(header, intro, current, rangeLabel, presets, dimensions, aspects, status, footer);
  root.append(panel); document.body.append(root);

  let trigger = null, timer = 0, applyPromise = null, queued = null, revision = 0, internalOperation = '', activeTarget = null;
  let draft = null, selectedAspect = 'free', baselineSnapshot = null, baselineOwner = null, ownedChanges = [];
  const timeline = () => draw.getTimeline();
  const valid = value => Number.isInteger(value) && value >= 1 && value <= 256;
  const snapshot = () => { try { return draw.snapshotTimeline?.() ?? null; } catch { return null; } };
  const gcd = (x, y) => y ? gcd(y, x % y) : x;
  const ratioLabelFor = (a, b) => {
    if (!a || !b) return 'free';
    const divisor = gcd(a, b), ratio = `${a / divisor}:${b / divisor}`;
    return ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(ratio) ? ratio : 'free';
  };
  function refreshActionButtons() {
    const owner = timeline(), last = ownedChanges.at(-1), ownsCurrent = Boolean(last && owner === last.after);
    const busy = Boolean(applyPromise || timer || queued || internalOperation);
    undoButton.disabled = panel.hidden || busy || !ownsCurrent || !draw.canUndo;
    resetButton.disabled = panel.hidden || busy || !ownsCurrent || !baselineSnapshot || typeof draw.restoreTimelineSnapshot !== 'function';
  }
  function sync(value = timeline(), resetDraft = false) {
    if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height)) return;
    if (resetDraft || !draft) draft = { width: value.width, height: value.height };
    current.textContent = `現在のキャンバス：${value.width}×${value.height} px`;
    range.value = String(Math.max(value.width, value.height));
    for (const button of presets.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.dataset.px) === Math.max(draft.width, draft.height)));
    for (const button of aspects.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.ratio === selectedAspect));
    width.value = String(draft.width); height.value = String(draft.height);
    refreshActionButtons();
  }
  function refreshBaseline(value = timeline()) {
    cancelPending();
    baselineOwner = value; baselineSnapshot = snapshot(); ownedChanges = [];
    draft = { width: value.width, height: value.height }; selectedAspect = 'free';
    if (!panel.hidden) sync(value, true);
    refreshActionButtons();
  }
  function cancelPending() {
    revision++; queued = null;
    if (timer) clearTimeout(timer); timer = 0;
    refreshActionButtons();
  }
  function setDraft(w, h, invalidInput = null) {
    if (!valid(w) || !valid(h)) {
      cancelPending(); if (invalidInput) invalidInput.setAttribute('aria-invalid', 'true');
      status.textContent = '幅と高さは1〜256 pxの整数で入力してください。'; return false;
    }
    width.removeAttribute('aria-invalid'); height.removeAttribute('aria-invalid');
    draft = { width: w, height: h }; width.value = String(w); height.value = String(h); range.value = String(Math.max(w, h));
    for (const button of presets.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.dataset.px) === Math.max(w, h)));
    for (const button of aspects.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.ratio === selectedAspect));
    status.textContent = `反映待ち：${w}×${h} px`;
    if (timer) clearTimeout(timer);
    const version = ++revision;
    timer = setTimeout(() => { timer = 0; if (panel.hidden || !isActive() || version !== revision) return; enqueue(draft, version); }, 140);
    refreshActionButtons(); return true;
  }
  function sizeForLongSide(long, aspect = selectedAspect) {
    if (aspect !== 'free') {
      const [rw, rh] = aspect.split(':').map(Number);
      return rw >= rh ? [long, Math.max(1, Math.round(long * rh / rw))] : [Math.max(1, Math.round(long * rw / rh)), long];
    }
    const w = draft?.width ?? timeline().width, h = draft?.height ?? timeline().height, ratio = w / h;
    return w >= h ? [long, Math.max(1, Math.min(256, Math.round(long / ratio)))] : [Math.max(1, Math.min(256, Math.round(long * ratio))), long];
  }
  function enqueue(size, version) {
    if (!isActive() || panel.hidden || version !== revision || !valid(size.width) || !valid(size.height)) return;
    queued = { ...size, version };
    startDrain();
  }
  function startDrain() {
    if (applyPromise) return;
    // Schedule after assignment: an unchanged job may finish without awaiting.
    applyPromise = Promise.resolve().then(drain);
    refreshActionButtons();
  }
  async function drain() {
    try {
      while (queued && !panel.hidden && isActive()) {
        const job = queued; queued = null; const owner = timeline(), jobBaseline = baselineOwner;
        if (!owner || !isActive() || panel.hidden || job.version !== revision) break;
        if (owner.width === job.width && owner.height === job.height) { status.textContent = `適用済み：${owner.width}×${owner.height} px`; continue; }
        try {
          internalOperation = 'apply'; activeTarget = { width: job.width, height: job.height };
          await draw.setProjectSettings({ width: job.width, height: job.height, palette: [...owner.palette] }, { expectedOwner: owner });
          const after = timeline();
          if (after !== owner && baselineOwner === jobBaseline && !panel.hidden && isActive()) ownedChanges.push({ before: owner, after });
          if (job.version === revision && !panel.hidden && isActive()) {
            sync(after, false); status.textContent = `適用済み：${after.width}×${after.height} px。絵の画素は拡大縮小していません。`;
          }
        } catch (error) {
          if (job.version === revision && !panel.hidden && isActive()) {
            const afterFailure = timeline();
            if (afterFailure !== owner) refreshBaseline(afterFailure);
            else sync(afterFailure, true);
            status.textContent = error?.message || 'キャンバスを変更できませんでした。';
          }
        } finally { internalOperation = ''; activeTarget = null; refreshActionButtons(); }
      }
    } finally {
      applyPromise = null;
      if (queued && !panel.hidden && isActive()) startDrain();
      refreshActionButtons();
    }
  }
  function close({ restoreFocus = true } = {}) {
    cancelPending();
    if (panel.hidden) return;
    panel.hidden = true;
    if (trigger?.isConnected) { trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'creation-settings-panel'); }
    const previous = trigger; trigger = null; draft = null; baselineSnapshot = null; baselineOwner = null; ownedChanges = [];
    if (restoreFocus && previous?.isConnected && !previous.disabled && isActive()) previous.focus({ preventScroll: true });
    refreshActionButtons();
  }
  function open({ trigger: source } = {}) {
    if (!isActive() || applyPromise) return false;
    draw.cancelInput?.();
    cancelPending(); trigger = source?.isConnected ? source : trigger; draft = null;
    panel.hidden = false; baselineOwner = timeline(); baselineSnapshot = snapshot(); ownedChanges = [];
    selectedAspect = ratioLabelFor(baselineOwner.width, baselineOwner.height); sync(baselineOwner, true);
    trigger?.setAttribute('aria-expanded', 'true'); trigger?.setAttribute('aria-controls', panel.id);
    panel.focus({ preventScroll: true }); refreshActionButtons(); updateVisualViewport(); return true;
  }
  async function undoOwnChange() {
    cancelPending(); const change = ownedChanges.at(-1);
    if (!change || timeline() !== change.after || !draw.canUndo || applyPromise) return;
    internalOperation = 'undo';
    try {
      await draw.undo();
      if (timeline() === change.before) {
        ownedChanges.pop(); draft = { width: change.before.width, height: change.before.height };
        status.textContent = `戻しました：${change.before.width}×${change.before.height} px`;
        sync(change.before, true);
      } else refreshBaseline(timeline());
    } catch (error) { status.textContent = error?.message || '戻せませんでした。'; refreshBaseline(timeline()); }
    finally { internalOperation = ''; refreshActionButtons(); }
  }
  async function resetOwnChanges() {
    cancelPending(); const last = ownedChanges.at(-1);
    if (!last || timeline() !== last.after || !baselineSnapshot || typeof draw.restoreTimelineSnapshot !== 'function' || applyPromise) return;
    internalOperation = 'reset';
    try {
      await draw.restoreTimelineSnapshot(baselineSnapshot);
      draw.workspace?.markDirty?.();
      ownedChanges = []; baselineOwner = timeline(); draft = { width: baselineOwner.width, height: baselineOwner.height };
      selectedAspect = ratioLabelFor(baselineOwner.width, baselineOwner.height);
      sync(baselineOwner, true); status.textContent = `この画面を開いた時点に戻しました：${baselineOwner.width}×${baselineOwner.height} px`;
    } catch (error) { status.textContent = error?.message || 'リセットできませんでした。'; refreshBaseline(timeline()); }
    finally { internalOperation = ''; refreshActionButtons(); }
  }
  scope.listen(closeButton, 'click', () => close());
  scope.listen(undoButton, 'click', () => { void undoOwnChange(); });
  scope.listen(resetButton, 'click', () => { void resetOwnChanges(); });
  scope.listen(width, 'input', () => { selectedAspect = 'free'; setDraft(Number(width.value), draft?.height ?? timeline().height, width); });
  scope.listen(height, 'input', () => { selectedAspect = 'free'; setDraft(draft?.width ?? timeline().width, Number(height.value), height); });
  scope.listen(range, 'input', () => { const [w, h] = sizeForLongSide(Number(range.value)); setDraft(w, h); });
  scope.listen(presets, 'click', event => {
    const button = event.target.closest('button[data-px]'); if (!button) return;
    const [w, h] = sizeForLongSide(Number(button.dataset.px)); setDraft(w, h);
  });
  scope.listen(aspects, 'click', event => {
    const button = event.target.closest('button[data-ratio]'); if (!button) return;
    selectedAspect = button.dataset.ratio;
    for (const item of aspects.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
    if (selectedAspect === 'free') return;
    const long = Math.max(draft?.width ?? timeline().width, draft?.height ?? timeline().height);
    const [w, h] = sizeForLongSide(long, selectedAspect); setDraft(w, h);
  });
  // The page's workspace Escape listener mounts before this lazy panel.
  // Consume this panel's dismissal before that listener can hide the workspace.
  scope.listen(document, 'keydown', event => {
    if (event.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) { close(); event.preventDefault(); }
  }, { capture:true });
  scope.listen(document, 'focusin', event => {
    if (!panel.hidden && (event.target === width || event.target === height)) scope.frame(() => keepFocusedInputVisible(event.target));
  });
  scope.add(draw.subscribe(() => {
    if (panel.hidden) return;
    const currentTimeline = timeline();
    if (internalOperation === 'apply' && activeTarget && currentTimeline.width === activeTarget.width && currentTimeline.height === activeTarget.height) {
      sync(currentTimeline, false); return;
    }
    if (internalOperation) { sync(currentTimeline, false); return; }
    refreshBaseline(currentTimeline);
    status.textContent = '作品が外部で変更されたため、リセット基準を更新しました。';
  }));
  const visualViewport = window.visualViewport;
  function keepFocusedInputVisible(input) {
    if (panel.hidden || !input?.isConnected) return;
    const viewportBottom = visualViewport ? visualViewport.offsetTop + visualViewport.height : window.innerHeight;
    const rect = input.getBoundingClientRect();
    if (rect.bottom > viewportBottom - 12) panel.scrollTop += rect.bottom - viewportBottom + 20;
    else if (rect.top < 8) panel.scrollTop -= 8 - rect.top;
  }
  function updateVisualViewport() {
    if (panel.hidden) return;
    if (visualViewport) {
      panel.style.maxHeight = `${Math.max(160, visualViewport.height - 16)}px`;
      if (matchMedia('(max-width: 520px)').matches) panel.style.bottom = `${Math.max(8, window.innerHeight - (visualViewport.offsetTop + visualViewport.height) + 8)}px`;
    }
    keepFocusedInputVisible(document.activeElement);
  }
  if (visualViewport) {
    scope.listen(visualViewport, 'resize', () => scope.frame(updateVisualViewport));
    scope.listen(visualViewport, 'scroll', () => scope.frame(updateVisualViewport));
  }
  scope.add(() => { cancelPending(); panel.hidden = true; root.remove(); });
  return { panel, open, close };
}
