import { createConversionReturnController } from './conversion-return-controller.mjs?rev=20261104-controllers-2';
import { createNativeReturnBridge } from './conversion-return-bridge.mjs?rev=20261104-controllers-2';
import { workspaceAvailableHeight, conversionDockBottom } from './conversion-clarity.mjs?rev=20261101-direct-material-1';
import { mountConversionStage } from './conversion-stage.mjs?rev=20261104-controllers-2';
import { createConversionPreviewController } from './conversion-preview-controller.mjs?rev=20261104-engine-boundaries-3';

/** Layout only: move existing controls, retaining their values, nodes and listeners. */
export function mountConversionWorkspace(main, toolbar, doc = document, win = window) {
  const panel = doc.createElement('dialog'); panel.id = 'sc-settings-panel'; panel.className = 'sc-settings-panel';
  panel.setAttribute('aria-labelledby', 'sc-settings-title');
  panel.innerHTML = '<header class="sc-panel-heading"><h2 id="sc-settings-title">保存の設定</h2><button type="button" data-sc-settings-close aria-label="設定を閉じる">完了</button></header><div class="sc-panel-body"></div>';
  const body = panel.querySelector('.sc-panel-body');
  const routes = doc.createElement('details'); routes.className = 'sc-route-options'; routes.innerHTML = '<summary>文字との変換</summary>';
  const route = toolbar.querySelector('.sc-route'); if (route) routes.append(route); body.append(routes);
  for (const node of toolbar.querySelectorAll('.sc-format,.sc-hint')) body.append(node);
  const warning = doc.createElement('p'); warning.className = 'sc-context-warning'; warning.dataset.scWarning = ''; warning.setAttribute('role', 'status'); warning.hidden = true; const formatHelp = doc.createElement('details'); formatHelp.className = 'sc-format-help'; formatHelp.innerHTML = '<summary>形式の注意点</summary>'; formatHelp.hidden = true; formatHelp.append(warning); body.append(formatHelp);
  const settings = main.querySelector('.convert-settings,.output-settings');
  if (settings) body.append(settings);
  // Sequence editing belongs with settings, rather than below the preview.
  const sequence = main.querySelector('[data-sequence]'); if (sequence) body.append(sequence);
  // Preserve original byte-exact recovery links and advanced handoff URLs.
  const extras = doc.createElement('details'); extras.className = 'sc-original-tools';
  extras.innerHTML = '<summary>元ファイル・複数出力</summary>';
  for (const node of main.querySelectorAll('.convert-support')) {
    for (const link of node.querySelectorAll('a[download],[data-advanced]')) extras.append(link);
    node.remove();
  }
  if (extras.querySelector('a')) body.append(extras);
  const guide = doc.createElement('a'); guide.href = '/output/#guide-format-details'; guide.className = 'sc-guide-link'; guide.textContent = '対応形式・制限・使い方'; body.append(guide);
  const footer = doc.createElement('footer'); footer.className = 'sc-panel-footer';
  footer.innerHTML = '<progress data-sc-panel-progress aria-label="出力作成の進行状況" hidden></progress><p role="status" aria-live="polite" data-sc-panel-status></p><div><button type="button" data-sc-panel-cancel hidden>中止</button><button type="button" data-sc-panel-save>保存</button></div>';
  panel.append(footer);
  let actions = {};
  const panelSave = footer.querySelector('[data-sc-panel-save]'), panelCancel = footer.querySelector('[data-sc-panel-cancel]');
  panelSave.addEventListener('click', () => actions.save?.()); panelCancel.addEventListener('click', () => actions.cancel?.());
  main.append(panel);
  const open = doc.createElement('button'); open.type = 'button'; open.dataset.scSettingsOpen = '';
  open.setAttribute('aria-controls', panel.id); open.setAttribute('aria-haspopup', 'dialog'); open.textContent = '設定';
  toolbar.querySelector('.sc-input-actions').append(open);
  const back = doc.createElement('a'); back.dataset.scBack = ''; back.className = 'sc-back';
  const returnController = createConversionReturnController(createNativeReturnBridge(() => main.querySelector('#output-return,[data-conversion-return]')));
  const initialReturn = returnController.snapshot();
  back.href = initialReturn.href; back.textContent = initialReturn.label;
  back.addEventListener('click', event => {
    try { returnController.request(event); }
    catch (error) {
      const textMode = main.querySelector('.text-mode-nav [aria-pressed="true"]')?.dataset.textMode;
      const status = textMode && textMode !== 'media' ? main.querySelector('[data-tx-status]') : main.querySelector('#output-status,[data-status]');
      if (status) status.textContent = error?.message || '戻れませんでした。現在の出力は保持しています。';
    }
  });
  toolbar.querySelector('.sc-input-actions').prepend(back);
  const desktop = win.matchMedia('(min-width: 960px)');
  const panelController = createWorkspacePanel({ panel, open, desktop, win });
  panel.querySelector('[data-sc-settings-close]').addEventListener('click', panelController.dismiss);
  panel.addEventListener('cancel', event => { event.preventDefault(); panelController.dismiss(); });
  panel.addEventListener('click', event => { if (event.target === panel) { const r = panel.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) panelController.dismiss(); } });
  // Keep the page scrollable as a fallback; bounded workspace regions scroll internally.
  const header = doc.querySelector('.output-header');
  function geometry() {
    const viewport = win.visualViewport;
    const top = Math.max(0, header?.getBoundingClientRect().bottom || 0);
    const height = viewport?.height || win.innerHeight;
    const keyboardInset = Math.max(0, win.innerHeight - height - (viewport?.offsetTop || 0));
    doc.body.style.setProperty('--sc-keyboard-inset', `${keyboardInset}px`);
    panel.style.maxHeight = `${Math.max(120, height - 12)}px`;
    const dock = doc.querySelector('.sc-save-bar'), nav = doc.querySelector('.public-destination-nav');
    if (dock && dock !== observedDock) { observedDock = dock; resize.observe(dock); }
    const navTop = nav?.getBoundingClientRect().top;
    doc.body.style.setProperty('--sc-save-bottom', `${conversionDockBottom({ layoutHeight: win.innerHeight, navTop })}px`);
    const available = workspaceAvailableHeight({ viewportHeight: height, offsetTop: viewport?.offsetTop || 0, headerBottom: top, dockTop: dock?.getBoundingClientRect().top, navTop, minHeight: 0 });
    main.style.setProperty('--sc-space', `${Math.max(180, available)}px`);
    doc.body.classList.toggle('sc-scroll-fallback', available < 180);
    doc.body.style.setProperty('--sc-bottom-reserve', `${Math.max(0, height + (viewport?.offsetTop || 0) - (dock?.getBoundingClientRect().top || height))}px`);
  }
  let observedDock = null;
  const resize = new win.ResizeObserver(geometry); if (header) resize.observe(header);
  win.addEventListener('resize', geometry); win.visualViewport?.addEventListener('resize', geometry); win.visualViewport?.addEventListener('scroll', geometry);
  const sourceTag = main.querySelector('.convert-preview-tag'); if (sourceTag) sourceTag.textContent = '元の素材';
  const stage = main.querySelector('.convert-stage,.output-preview-column');
  const preview = doc.createElement('section'); preview.dataset.scResultPreview = ''; preview.className = 'sc-result-preview'; preview.hidden = true;
  preview.innerHTML = '<p class="sc-result-label">保存するファイル <span data-sc-result-name></span></p><img alt="保存するファイルのプレビュー" hidden><audio controls hidden></audio><video controls playsinline hidden></video><p data-sc-result-fallback hidden>この形式はここでは表示できません。ファイルは保存できます。</p>';
  if (stage) stage.prepend(preview);
  const views = doc.createElement('div'); views.className = 'sc-preview-choice'; views.hidden = true;
  views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'プレビューを選ぶ');
  views.innerHTML = '<button type="button" data-sc-source-view aria-pressed="true">元の素材</button><button type="button" data-sc-result-view aria-pressed="false">作成済みファイル</button>';
  if (stage) stage.prepend(views);
  const materialStage = mountConversionStage({ main, toolbar, panel, showSettings: panelController.show, doc, win });
  const previewController = createConversionPreviewController();
  let mediaNode = null, previewState = previewController.update();
  const hidden = (node, value) => { if (node.hidden !== value) node.hidden = value; };
  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  function clearMedia() {
    if (!mediaNode) return;
    mediaNode.pause?.(); mediaNode.onerror = null; mediaNode.removeAttribute('src'); mediaNode.hidden = true;
  }
  function applyPreviewState(state) {
    previewState = state;
    main.dataset.workspaceInspectResult = String(state.inspectResult);
    hidden(preview, !state.inspectResult);
    for (const [selector, pressed] of [['[data-sc-source-view]', !state.inspectResult], ['[data-sc-result-view]', state.inspectResult]]) {
      const node = views.querySelector(selector); if (node.getAttribute('aria-pressed') !== String(pressed)) node.setAttribute('aria-pressed', String(pressed));
    }
    const fallback = preview.querySelector('[data-sc-result-fallback]');
    hidden(fallback, Boolean(state.type) && !state.failed);
    text(preview.querySelector('[data-sc-result-name]'), state.filename);
    if (state.load) {
      clearMedia();
      const previousNode = state.type && preview.querySelector(state.type);
      if (previousNode) {
        const node = previousNode.cloneNode(false), identity = state.identity;
        previousNode.onerror = null;
        previousNode.replaceWith(node);
        mediaNode = node;
        hidden(node, false);
        node.onerror = () => {
          const failure = previewController.fail(identity);
          if (failure.identity === identity && failure.failed) {
            hidden(node, true); hidden(fallback, false);
          }
        };
        node.src = state.href;
      }
    } else if (!state.inspectResult) mediaNode?.pause?.();
    if (state.failed) { mediaNode?.pause?.(); hidden(mediaNode, true); hidden(fallback, false); }
  }
  views.querySelector('[data-sc-source-view]').addEventListener('click', () => applyPreviewState(previewController.selectInspect(false)));
  views.querySelector('[data-sc-result-view]').addEventListener('click', () => applyPreviewState(previewController.selectInspect(true)));
  function update({ media, loaded, ready, link, working = false, saveDisabled = false, status = '', progress, canCancel = false, saveLabel = '保存' }) {
    open.disabled = false; panel.querySelector('[data-sc-settings-close]').disabled = false;
    panelController.update(media);
    main.dataset.workspaceMedia = String(media);
    main.dataset.workspaceReady = String(media && ready);
    text(open, '設定');
    hidden(routes, !main.querySelector('[data-text-tools]'));
    const materialState = main.querySelector('#output-layout')?.conversionActions?.getMaterialState?.();
    text(views.querySelector('[data-sc-source-view]'), materialState?.previewKind === 'output' ? '現在のプレビュー' : '元の素材');
    if (settings) hidden(settings, !media || (!loaded && !materialState?.outputCount));
    hidden(extras, !media || !loaded);
    const returnState = returnController.snapshot();
    if (back.getAttribute('href') !== returnState.href) back.href = returnState.href;
    text(back, returnState.label);
    const notice = media && loaded ? main.querySelector('[data-notice],#output-conversion-note')?.textContent?.trim() || '' : '';
    text(warning, notice); hidden(warning, !notice); hidden(formatHelp, !notice);
    // Editing preview and playback stay primary. Inspecting encoded bytes is optional.
    const audioSource = main.querySelector('[data-audio-poster],#output-audio');
    const previewResult = previewController.update({ media, ready, stageAvailable: Boolean(stage), result: link ? { href: link.href, filename: link.download } : null, audioHint: Boolean(audioSource && !audioSource.hidden) });
    if (previewState.identity && previewResult.identity !== previewState.identity) clearMedia();
    hidden(views, !previewResult.eligible); applyPreviewState(previewResult);
    if (panelSave.disabled !== saveDisabled) panelSave.disabled = saveDisabled;
    text(panelSave, saveLabel);
    text(footer.querySelector('[data-sc-panel-status]'), status);
    hidden(panelCancel, !canCancel);
    if (panelCancel.disabled) panelCancel.disabled = false;
    const panelProgress = footer.querySelector('progress'); hidden(panelProgress, !working);
    if (progress?.hasAttribute('value')) {
      if (panelProgress.max !== progress.max) panelProgress.max = progress.max;
      if (!panelProgress.hasAttribute('value') || panelProgress.value !== progress.value) panelProgress.value = progress.value;
    } else if (panelProgress.hasAttribute('value')) panelProgress.removeAttribute('value');
    materialStage.update({ media, loaded, ready, link, working, status });
    geometry();
  }
  geometry();
  return { update, bindActions(next) { actions = next; materialStage.bindActions(next); }, focusSave(fallback) { (panel.matches(':modal') ? panelSave : fallback)?.focus({ preventScroll: true }); }, reveal: panelController.show, destroy() { materialStage.destroy(); clearMedia(); resize.disconnect(); win.removeEventListener('resize', geometry); win.visualViewport?.removeEventListener('resize', geometry); win.visualViewport?.removeEventListener('scroll', geometry); panelController.destroy(); } };
}

/** History owns a mobile sheet; closing never reloads or resets conversion controls. */
export function createWorkspacePanel({ panel, open, desktop, win }) {
  const key = 'pixieedConversionSettings';
  let active = false, closing = false, reopen = false, destroyed = false;
  function expanded() { const value = String(panel.open); if (open.getAttribute('aria-expanded') !== value) open.setAttribute('aria-expanded', value); }
  function clearHistoryMarker() {
    if (!win.history.state?.[key]) return;
    const state = { ...win.history.state }; delete state[key]; win.history.replaceState(state, '');
  }
  function show() {
    if (destroyed) return;
    if (closing) { reopen = true; return; }
    if (panel.open) return;
    if (desktop.matches && active) panel.show();
    else { win.history.pushState({ ...win.history.state, [key]: true }, ''); panel.showModal(); }
    expanded();
  }
  function finish() {
    if (panel.open) panel.close(); closing = false; expanded();
    open.focus({ preventScroll: true });
    if (reopen) { reopen = false; show(); }
  }
  function dismiss() {
    if ((desktop.matches && active) || !panel.open || closing) return;
    if (win.history.state?.[key]) { closing = true; win.history.back(); }
    else finish();
  }
  function pop() {
    if (destroyed) return;
    if (closing || (panel.open && !win.history.state?.[key] && !(desktop.matches && active))) finish();
    else if (win.history.state?.[key] && !panel.open) { panel.showModal(); expanded(); }
  }
  function layout() {
    if (closing) return; // The pending popstate is the only owner of this close.
    clearHistoryMarker(); if (panel.open) panel.close();
    if (desktop.matches && active) panel.show(); expanded();
  }
  open.addEventListener('click', show); win.addEventListener('popstate', pop); desktop.addEventListener('change', layout);
  return { show, dismiss, update(next) {
    if (active !== next) { active = next; layout(); }
    else if (desktop.matches && active && !panel.open) { panel.show(); expanded(); }
  }, destroy() { destroyed = true; clearHistoryMarker(); open.removeEventListener('click', show); win.removeEventListener('popstate', pop); desktop.removeEventListener('change', layout); } };
}

// Compatibility export; save decisions live outside this DOM/layout module.
export { createConversionSaveIntent } from './conversion-save-controller.mjs?rev=20261104-controllers-2';
