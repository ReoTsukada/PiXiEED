/** Layout only: move existing controls, retaining their values, nodes and listeners. */
export function mountConversionWorkspace(main, toolbar, doc = document, win = window) {
  const panel = doc.createElement('dialog'); panel.id = 'sc-settings-panel'; panel.className = 'sc-settings-panel';
  panel.setAttribute('aria-labelledby', 'sc-settings-title');
  panel.innerHTML = '<header class="sc-panel-heading"><h2 id="sc-settings-title">仕上がりを調整</h2><button type="button" data-sc-settings-close aria-label="設定を閉じる">完了</button></header><div class="sc-panel-body"></div>';
  const body = panel.querySelector('.sc-panel-body');
  for (const node of toolbar.querySelectorAll('.sc-route,.sc-format,.sc-hint')) body.append(node);
  const warning = doc.createElement('p'); warning.className = 'sc-context-warning'; warning.dataset.scWarning = ''; warning.setAttribute('role', 'status'); warning.hidden = true; body.append(warning);
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
  open.setAttribute('aria-controls', panel.id); open.setAttribute('aria-haspopup', 'dialog'); open.textContent = '形式・サイズ';
  toolbar.querySelector('.sc-input-actions').append(open);
  const back = doc.createElement('a'); back.dataset.scBack = ''; back.className = 'sc-back';
  const origin = main.querySelector('#output-return,.convert-heading a');
  back.href = origin?.getAttribute('href') || '/output/'; back.textContent = origin?.textContent?.includes('編集') ? '← 編集へ' : '← ガイド';
  back.addEventListener('click', event => {
    if (!origin || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); origin.click(); // Retain the native pending-write return handler.
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
    main.style.setProperty('--sc-space', `${Math.max(180, height - top - 124)}px`);
  }
  const resize = new win.ResizeObserver(geometry); if (header) resize.observe(header);
  win.addEventListener('resize', geometry); win.visualViewport?.addEventListener('resize', geometry); win.visualViewport?.addEventListener('scroll', geometry);
  const sourceTag = main.querySelector('.convert-preview-tag'); if (sourceTag) sourceTag.textContent = '素材のプレビュー';
  const stage = main.querySelector('.convert-stage,.output-preview-column');
  const preview = doc.createElement('section'); preview.dataset.scResultPreview = ''; preview.className = 'sc-result-preview'; preview.hidden = true;
  preview.innerHTML = '<p class="sc-result-label">保存するファイル <span data-sc-result-name></span></p><img alt="保存するファイルのプレビュー" hidden><audio controls hidden></audio><video controls playsinline hidden></video><p data-sc-result-fallback hidden>この形式はここでは表示できません。ファイルは保存できます。</p>';
  if (stage) stage.prepend(preview);
  const views = doc.createElement('div'); views.className = 'sc-preview-choice'; views.hidden = true;
  views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'プレビューを選ぶ');
  views.innerHTML = '<button type="button" data-sc-source-view aria-pressed="true">編集プレビュー</button><button type="button" data-sc-result-view aria-pressed="false">出力ファイル</button>';
  if (stage) stage.prepend(views);
  let lastUrl = '', mediaNode = null, lastLink = null, eligible = false, inspectResult = false;
  const hidden = (node, value) => { if (node.hidden !== value) node.hidden = value; };
  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  function hydrate() {
    if (!lastLink || lastUrl === lastLink.href) return;
    lastUrl = lastLink.href;
    if (mediaNode) { mediaNode.pause?.(); mediaNode.removeAttribute('src'); mediaNode.hidden = true; }
    const name = lastLink.download || '', extension = name.split('.').pop().toLowerCase();
    const audioSource = main.querySelector('[data-audio-poster],#output-audio');
    const type = (extension === 'webm' && audioSource && !audioSource.hidden) || /^(wav|mp3|ogg|opus|flac|aiff|m4a)$/.test(extension) ? 'audio' : /^(mp4|webm)$/.test(extension) ? 'video' : /^(png|jpg|jpeg|webp|gif|apng|svg|bmp|ico)$/.test(extension) ? 'img' : null;
    const fallback = preview.querySelector('[data-sc-result-fallback]'); hidden(fallback, Boolean(type));
    text(preview.querySelector('[data-sc-result-name]'), name);
    mediaNode = type && preview.querySelector(type);
    if (mediaNode) { hidden(mediaNode, false); mediaNode.onerror = () => { hidden(mediaNode, true); hidden(fallback, false); }; mediaNode.src = lastLink.href; }
  }
  function selectView(value) {
    inspectResult = Boolean(value && eligible);
    main.dataset.workspaceInspectResult = String(inspectResult);
    hidden(preview, !inspectResult);
    for (const [selector, pressed] of [['[data-sc-source-view]', !inspectResult], ['[data-sc-result-view]', inspectResult]]) {
      const node = views.querySelector(selector); if (node.getAttribute('aria-pressed') !== String(pressed)) node.setAttribute('aria-pressed', String(pressed));
    }
    if (inspectResult) hydrate(); else mediaNode?.pause?.();
  }
  views.querySelector('[data-sc-source-view]').addEventListener('click', () => selectView(false));
  views.querySelector('[data-sc-result-view]').addEventListener('click', () => selectView(true));
  function update({ media, loaded, ready, link, working = false, saveDisabled = false, status = '', progress, canCancel = false }) {
    open.disabled = false; panel.querySelector('[data-sc-settings-close]').disabled = false;
    panelController.update(media);
    main.dataset.workspaceMedia = String(media);
    main.dataset.workspaceReady = String(media && ready);
    text(open, loaded ? '形式・サイズ' : '素材・出力先');
    if (settings) hidden(settings, !media || !loaded);
    hidden(extras, !media || !loaded);
    const returnHref = origin?.getAttribute('href'); if (returnHref && back.getAttribute('href') !== returnHref) back.href = returnHref;
    text(back, origin?.textContent?.includes('編集') ? '← 編集へ' : '← ガイド');
    const notice = media && loaded ? main.querySelector('[data-notice],#output-conversion-note')?.textContent?.trim() || '' : '';
    text(warning, notice); hidden(warning, !notice);
    // Editing preview and playback stay primary. Inspecting encoded bytes is optional.
    eligible = Boolean(media && ready && link && stage); lastLink = link;
    hidden(views, !eligible); selectView(inspectResult);
    if (panelSave.disabled !== saveDisabled) panelSave.disabled = saveDisabled;
    text(panelSave, working && saveDisabled ? '作成中…' : '保存');
    text(footer.querySelector('[data-sc-panel-status]'), status);
    hidden(panelCancel, !canCancel);
    if (panelCancel.disabled) panelCancel.disabled = false;
    const panelProgress = footer.querySelector('progress'); hidden(panelProgress, !working);
    if (progress?.hasAttribute('value')) {
      if (panelProgress.max !== progress.max) panelProgress.max = progress.max;
      if (!panelProgress.hasAttribute('value') || panelProgress.value !== progress.value) panelProgress.value = progress.value;
    } else if (panelProgress.hasAttribute('value')) panelProgress.removeAttribute('value');
    geometry();
  }
  geometry();
  return { update, bindActions(next) { actions = next; }, focusSave(fallback) { (panel.matches(':modal') ? panelSave : fallback)?.focus({ preventScroll: true }); }, reveal: panelController.show, destroy() { mediaNode?.pause?.(); resize.disconnect(); win.removeEventListener('resize', geometry); win.visualViewport?.removeEventListener('resize', geometry); win.visualViewport?.removeEventListener('scroll', geometry); panelController.destroy(); } };
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

/** One explicit save intent follows its settings revision through existing engines. */
export function createConversionSaveIntent({ snapshot, run, save, choose, stageComplete = () => {}, blocked = () => {}, settled = () => {} }) {
  let pending = null;
  function start(stage, state) {
    pending = { mode: state.mode, revision: state.revision, before: state.href, stage, sawBusy: state.working };
    const task = run(stage);
    if (task === false) { pending = null; return; }
    if (task && typeof task.then === 'function') {
      const job = pending; job.awaiting = true;
      Promise.resolve(task).then(ok => {
        if (pending !== job) return;
        job.awaiting = false;
        // Native actions report whether persistence/encoding succeeded; a settings
        // write (FPS) need not create a Blob before the final generation stage.
        if (ok !== true) pending = null;
        else job.succeeded = true;
        settled();
      }, () => { if (pending === job) { pending = null; blocked(); settled(); } });
      return;
    }
    const next = snapshot();
    if (!pending) return;
    pending.sawBusy ||= next.working;
    // No task was started (for example an unchanged FPS); do not leave saving locked.
    if (!next.working && next.href === pending.before && !pending.sawBusy) pending = null;
  }
  function advance(state) {
    if (!state.loaded) { choose(); return; }
    if (state.live) {
      if (state.ready && !state.working) save(state.link);
      else start('live', state);
      return;
    }
    if (state.working) return;
    if (state.fpsDirty) { start('fps', state); return; }
    if (state.sizeDirty) { start('size', state); return; }
    if (state.ready) { save(state.link); return; }
    start('convert', state);
  }
  return {
    get pending() { return Boolean(pending); },
    request() { if (!pending) advance(snapshot()); },
    cancel() { pending = null; },
    observe() {
      if (!pending) return;
      const state = snapshot();
      if (state.mode !== pending.mode || state.revision !== pending.revision) { pending = null; return; }
      if (pending.awaiting || state.working) { pending.sawBusy = true; return; }
      if (pending.succeeded && pending.stage === 'fps') { pending = null; stageComplete('fps'); advance(snapshot()); return; }
      if (state.href && state.href !== pending.before) {
        const completed = pending; pending = null;
        if (completed.stage === 'fps' || completed.stage === 'size') {
          stageComplete(completed.stage); advance(snapshot());
        } else if (state.ready && state.matchesFormat) save(state.link);
        else blocked();
      } else if (pending.sawBusy) pending = null; // Error/cancel never saves the old result.
    },
  };
}
