import { mountToolHeaderControls } from '../tool-header-controls.mjs';
import { mountProjectWorkspace } from './project-workspace.mjs?rev=20261016-tool-shell-1';
import { createCameraPlacementMapping, createCameraPlacementRenderer, drawCameraPlacementBoundary, sampleCameraFrameToPlacement } from './camera-placement-preview.mjs?rev=20261016-color-capability-1';

// Scope the original camera styles rather than maintaining a second, reduced camera UI.
function scopedRules(rules) {
  const prefix = 'body.creation-suite[data-creation-mode="camera"]';
  function selectors(value) {
    const parts = []; let start = 0, depth = 0;
    for (let i = 0; i < value.length; i++) {
      if ('(['.includes(value[i])) depth++;
      if (')]'.includes(value[i])) depth--;
      if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
    }
    parts.push(value.slice(start));
    return parts.map(part => {
      const selector = part.trim();
      return /^(?:html|body|:root)(?=$|[\s.:#\[])/.test(selector)
        ? selector.replace(/^(?:html|body|:root)/, prefix) : `${prefix} ${selector}`;
    }).join(',');
  }
  return [...rules].map(rule => {
    if (rule.type === CSSRule.STYLE_RULE) {
      // The standalone camera's page resets do not own the shared Draw shell.
      if (rule.selectorText === ':root') {
        const variables = [...rule.style].filter(name => name.startsWith('--')).map(name => `${name}:${rule.style.getPropertyValue(name)};`).join('');
        return `${prefix}{${variables}}`;
      }
      if (['*', 'html, body', 'body', 'button, a', ':focus-visible'].includes(rule.selectorText)) return '';
      return `${selectors(rule.selectorText)}{${rule.style.cssText}}`;
    }
    if (rule.type === CSSRule.KEYFRAMES_RULE) return rule.cssText;
    if (rule.cssRules) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${scopedRules(rule.cssRules)}}`;
    return rule.cssText;
  }).join('\n');
}

/** Full camera engine and controls occupy the Draw shell's stage, dock, header and shutter slot. */
export async function mountCreationCamera({ scope, board, dock, nav, draw, getAudio, onReturn, onNavigate, onProjectSettings, onProjectStatus, isActive, isCurrent = isActive, initialPointer = null }) {
  const existingNodes = new Set(document.querySelectorAll('*'));
  const bodyClasses = new Set(document.body.classList);
  const transferReady = document.body.getAttribute('data-tool-transfer-ready');
  let style = null, observer = null, controlStateObserver = null, instance = null, workspace = null;
  try {
  if (scope?.disposed || !isCurrent()) throw new Error('カメラモードが終了しました。');
  const assertCurrent = () => { if (scope?.disposed || !isCurrent()) throw new Error('カメラモードが終了しました。'); };
  const response = await fetch('/pixel-camera.html', { signal:scope.signal });
  assertCurrent();
  if (!response.ok) throw new Error('撮影の操作を読み込めません。');
  const markup = await response.text(); assertCurrent();
  const template = new DOMParser().parseFromString(markup, 'text/html');
  const surface = template.querySelector('#pixelStudio'), controls = surface?.querySelector('.lc-bottom'), shutter = template.querySelector('#capture');
  if (!surface || !controls || !shutter) throw new Error('撮影の操作が不足しています。');
  const cssResponse = await fetch('/css/pixel-lens-camera.css?rev=20261006-camera-upload-1', { signal:scope.signal });
  assertCurrent();
  if (!cssResponse.ok) throw new Error('撮影の表示を読み込めません。');
  const stylesheet = await cssResponse.text(); assertCurrent();
  style = document.createElement('style'); style.media = 'not all'; style.textContent = stylesheet;
  document.head.append(style);
  const scoped = scopedRules(style.sheet.cssRules); style.textContent = scoped; style.media = 'all';
  document.head.insertBefore(style, document.querySelector('link[href*="creation-modes.css"]'));
  board.closest('#main').append(surface, template.querySelector('#cameraImageStatus'), template.querySelector('#cameraSaveDialog'));
  // Portal the original camera controls into the actual shared operation dock.
  // Retain .lc and mirror state attributes for its existing contextual selectors.
  const controlHost = document.createElement('div'); controlHost.className = 'lc creation-camera-controls';
  controlHost.append(controls); dock.append(controlHost);
  controls.classList.add('creation-editor__controls');
  for (const node of controls.querySelectorAll('button[data-tool]')) node.classList.add('creation-control-button');
  const mirrorControlState = () => {
    for (const key of Object.keys(controlHost.dataset)) if (!Object.hasOwn(surface.dataset, key)) delete controlHost.dataset[key];
    Object.assign(controlHost.dataset, surface.dataset);
  };
  controlStateObserver = new MutationObserver(() => { mirrorControlState(); syncCaptureProjectState(); }); controlStateObserver.observe(surface, { attributes: true });
  mirrorControlState();
  nav.insertBefore(shutter, nav.children[2]);
  const cameraStage = surface.querySelector('#stage');
  const placementOverlay = document.createElement('canvas'); placementOverlay.id = 'cameraPlacementOverlay';
  placementOverlay.setAttribute('aria-hidden', 'true'); placementOverlay.hidden = true;
  surface.querySelector('#captureFrame').append(placementOverlay);
  let resultPreviewObserver = null, resultPreviewBox = null, resultPreviewCanvas = null, resultPlacementOverlay = null, originalPreviewPosition = '';
  const placementStatus = document.createElement('p'); placementStatus.id = 'creation-camera-placement';
  placementStatus.className = 'creation-camera-placement'; placementStatus.setAttribute('role', 'status'); placementStatus.setAttribute('aria-live', 'polite');
  placementStatus.textContent = '作品への配置先を確認しています。'; cameraStage.append(placementStatus);
  let placementSnapshot = null, placementMapping = null, placementRenderer = null;
  let placementErrorMessage = '';
  const discardResultPreview = () => {
    resultPlacementOverlay?.remove(); resultPlacementOverlay = null;
    if (resultPreviewBox) resultPreviewBox.style.position = originalPreviewPosition;
    resultPreviewBox = resultPreviewCanvas = null; originalPreviewPosition = '';
  };
  const mirrorResultBoundary = () => {
    if (!resultPlacementOverlay) return;
    const visible = Boolean(placementMapping?.mask && !placementOverlay.hidden);
    if (!visible) { resultPlacementOverlay.hidden = true; return; }
    if (resultPlacementOverlay.width !== placementOverlay.width || resultPlacementOverlay.height !== placementOverlay.height) {
      resultPlacementOverlay.width = placementOverlay.width; resultPlacementOverlay.height = placementOverlay.height;
    }
    const context = resultPlacementOverlay.getContext('2d');
    context.clearRect(0, 0, resultPlacementOverlay.width, resultPlacementOverlay.height);
    context.drawImage(placementOverlay, 0, 0);
    resultPlacementOverlay.hidden = false;
  };
  const mirrorResultFrame = (frame, pixels = frame.data) => {
    if (!resultPreviewCanvas?.isConnected || !frame?.width || !frame?.height || !pixels) return;
    if (resultPreviewCanvas.width !== frame.width || resultPreviewCanvas.height !== frame.height) {
      resultPreviewCanvas.width = frame.width; resultPreviewCanvas.height = frame.height;
    }
    const context = resultPreviewCanvas.getContext('2d');
    context.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0);
  };
  const syncResultPreview = () => {
    if (scope?.disposed || document.body.dataset.toolResultOpen !== 'camera-result') { discardResultPreview(); return; }
    const section = document.querySelector('section[data-tool-result-view="camera-result"]');
    const canvas = section?.querySelector('canvas.px-tool-result__preview');
    const box = canvas?.closest('.px-tool-result__picture');
    if (!canvas || !box) { discardResultPreview(); return; }
    if (box !== resultPreviewBox) {
      discardResultPreview(); resultPreviewBox = box; resultPreviewCanvas = canvas;
      const actionGroup = section.querySelector('.px-tool-result__action-group');
      if (actionGroup) actionGroup.scrollTop = 0;
      originalPreviewPosition = box.style.position;
      box.style.position = 'relative';
      resultPlacementOverlay = document.createElement('canvas');
      resultPlacementOverlay.id = 'cameraPlacementResultOverlay';
      resultPlacementOverlay.setAttribute('aria-hidden', 'true');
      resultPlacementOverlay.hidden = true;
      box.append(resultPlacementOverlay);
    }
    instance?.repaintPreview?.();
    mirrorResultBoundary();
  };
  const clearPlacement = (message) => {
    placementSnapshot = placementMapping = placementRenderer = null;
    placementOverlay.width = placementOverlay.height = 1; placementOverlay.hidden = true;
    mirrorResultBoundary();
    if (placementStatus.textContent !== message) placementStatus.textContent = message;
  };
  const updatePlacement = ({ repaint = true, sourceWidth = null, sourceHeight = null } = {}) => {
    if (scope?.disposed) return;
    try {
      placementErrorMessage = '';
      const snapshot = draw.cameraPlacementTarget();
      if (snapshot.supported === false || snapshot.width > 256 || snapshot.height > 256) {
        placementSnapshot = snapshot; placementMapping = placementRenderer = null;
        placementOverlay.width = placementOverlay.height = 1; placementOverlay.hidden = true;
        mirrorResultBoundary();
        const message = `作品への配置プレビュー：${snapshot.description}。このサイズでは配置プレビューを表示できません。`;
        if (placementStatus.textContent !== message) placementStatus.textContent = message;
        return;
      }
      const mapping = createCameraPlacementMapping({ sourceWidth:sourceWidth || snapshot.width, sourceHeight:sourceHeight || snapshot.height, width:snapshot.width, height:snapshot.height,
        bounds:snapshot.bounds, cells:snapshot.cells, mask:snapshot.mask });
      const renderer = createCameraPlacementRenderer(snapshot, mapping);
      placementSnapshot = snapshot; placementMapping = mapping; placementRenderer = renderer;
      if (placementOverlay.width !== snapshot.width * 4 || placementOverlay.height !== snapshot.height * 4) {
        placementOverlay.width = snapshot.width * 4; placementOverlay.height = snapshot.height * 4;
      }
      drawCameraPlacementBoundary(placementOverlay.getContext('2d'), mapping);
      placementOverlay.hidden = !mapping.mask;
      const lockNote = snapshot.activeLocked ? '選択レイヤーはロック中のため、作品画像を表示しています。'
        : snapshot.musicOnly && !snapshot.layerVisible ? '音楽レイヤーは非表示ですが、現在の音楽編集表示に合わせてプレビューしています。'
          : snapshot.layerVisible ? '' : '選択レイヤーは非表示のため、作品画像を表示しています。';
      const message = `作品への配置プレビュー：${snapshot.description}。${lockNote}`;
      if (placementStatus.textContent !== message) placementStatus.textContent = message;
      mirrorResultBoundary();
      if (repaint) instance?.repaintPreview?.();
    } catch (error) {
      clearPlacement(`作品への配置プレビューを更新できません。${error instanceof Error ? error.message : ''}`);
      instance?.repaintPreview?.();
    }
  };
  const renderPlacementFrame = frame => {
    if (!placementRenderer || !placementMapping) { mirrorResultFrame(frame); return frame.data; }
    if (placementMapping.sourceWidth !== frame.width || placementMapping.sourceHeight !== frame.height) updatePlacement({ repaint:false, sourceWidth:frame.width, sourceHeight:frame.height });
    if (!placementRenderer || !placementMapping) { mirrorResultFrame(frame); return frame.data; }
    try {
      const pixels = placementRenderer.render(frame, { paletteFixed:frame.paletteFixed === true });
      mirrorResultFrame(frame, pixels);
      return pixels;
    } catch (error) {
      mirrorResultFrame(frame);
      throw new Error(`作品への配置プレビューを更新できません。${error instanceof Error ? error.message : ''}`);
    }
  };
  const reportPlacementError = error => {
    if (!error) return;
    const detail = error instanceof Error ? error.message : '配置プレビューを更新できません。';
    const message = `配置プレビューを表示できません。撮影画像は作品へ適用されていません。${detail}`;
    placementErrorMessage = message;
    if (placementStatus.textContent !== message) placementStatus.textContent = message;
  };
  const clearPlacementError = error => {
    if (error || !placementErrorMessage || !placementSnapshot) return;
    placementErrorMessage = '';
    const lockNote = placementSnapshot.activeLocked ? '選択レイヤーはロック中のため、作品画像を表示しています。'
      : placementSnapshot.musicOnly && !placementSnapshot.layerVisible ? '音楽レイヤーは非表示ですが、現在の音楽編集表示に合わせてプレビューしています。'
        : placementSnapshot.layerVisible ? '' : '選択レイヤーは非表示のため、作品画像を表示しています。';
    const message = placementSnapshot.description ? `作品への配置プレビュー：${placementSnapshot.description}。${lockNote}` : '作品への配置プレビューを表示しています。';
    if (placementStatus.textContent !== message) placementStatus.textContent = message;
  };
  let destination = 'draw';
  const applyButton = controls.querySelector('#useCameraImage');
  const targetSummary = document.createElement('p'); targetSummary.id = 'creation-camera-target';
  targetSummary.setAttribute('role', 'status'); targetSummary.style.cssText = 'margin:0;font-size:12px;line-height:1.5;text-align:center;max-width:100%;';
  controls.querySelector('#resultControls').append(targetSummary);
  const projectStatus = document.createElement('p'); projectStatus.id = 'creation-camera-project-status';
  projectStatus.className = 'creation-camera-project-status'; projectStatus.setAttribute('role', 'status'); projectStatus.setAttribute('aria-live', 'polite');
  controls.querySelector('#resultControls').append(projectStatus);
  let cameraProjectState = 'none', appliedTimeline = null, lastCameraMode = surface.dataset.mode, captureEpoch = 0;
  let restoredCaptureExpected = new URLSearchParams(location.search).has('outputId');
  const cameraProjectCopy = {
    none: '',
    pending: '撮影画像は作品に未反映です。作品の保存には含まれず、出力は撮影画像単体です。',
    applied: '撮影画像を作品へ反映済みです。保存するのは現在の作品です。撮影画像単体の出力もできます。',
    undone: '撮影画像の反映は作品のUndoで取り消されています。作品は未反映の状態で保存され、出力は撮影画像単体です。',
    unknown: '現在の作品では撮影画像の反映状態が変わっています。保存対象は現在の作品です。撮影画像単体の出力もできます。'
  };
  const renderProjectStatus = () => {
    if (appliedTimeline) {
      let position = 'missing';
      try { position = draw.getTimelineHistoryPosition?.(appliedTimeline) || 'missing'; } catch {}
      cameraProjectState = position === 'current' || position === 'past' ? 'applied' : position === 'future' ? 'undone' : 'unknown';
    }
    const message = cameraProjectCopy[cameraProjectState] || cameraProjectCopy.unknown;
    if (projectStatus.textContent !== message) projectStatus.textContent = message;
    projectStatus.hidden = cameraProjectState === 'none';
    onProjectStatus?.({ type:cameraProjectState, timeline:appliedTimeline });
  };
  const syncCaptureProjectState = () => {
    const nextMode = surface.dataset.mode;
    if (nextMode === 'captured' && lastCameraMode !== 'captured') {
      captureEpoch++;
      cameraProjectState = restoredCaptureExpected ? 'unknown' : 'pending'; appliedTimeline = null;
      restoredCaptureExpected = false;
      onProjectStatus?.({ type:cameraProjectState === 'pending' ? 'captured' : 'unknown' }); renderProjectStatus();
    } else if (lastCameraMode === 'captured' && nextMode !== 'captured') {
      captureEpoch++; cameraProjectState = 'none'; appliedTimeline = null;
      onProjectStatus?.({ type:'idle' }); renderProjectStatus();
    }
    lastCameraMode = nextMode;
  };
  if (lastCameraMode === 'captured') { captureEpoch++; cameraProjectState = restoredCaptureExpected ? 'unknown' : 'pending'; restoredCaptureExpected = false; onProjectStatus?.({ type:cameraProjectState === 'pending' ? 'captured' : 'unknown' }); }
  renderProjectStatus();
  const recoveryActions = document.createElement('div');
  recoveryActions.className = 'creation-camera-recovery';
  recoveryActions.hidden = true;
  recoveryActions.setAttribute('role', 'group');
  recoveryActions.setAttribute('aria-label', '適用できない画像の次の操作');
  recoveryActions.style.cssText = 'display:none;flex-wrap:wrap;justify-content:center;gap:8px;width:100%;';
  controls.querySelector('#resultControls').append(recoveryActions);
  const clearApplyRecovery = () => { recoveryActions.replaceChildren(); recoveryActions.hidden = true; recoveryActions.style.display = 'none'; };
  const retakeWithSharedPalette = async () => {
    if (surface.dataset.mode === 'captured') shutter.click();
    const deadline = Date.now() + 15000;
    while (surface.dataset.mode !== 'live' && Date.now() < deadline && !scope?.disposed) {
      await new Promise(resolve => window.setTimeout(resolve, 80));
    }
    if (scope?.disposed || surface.dataset.mode !== 'live') {
      targetSummary.textContent = 'カメラを再開できませんでした。画像を選び直すか、ブラウザーのカメラ許可を確認してください。';
      return;
    }
    const fixedPalette = controlHost.querySelector('#cameraPaletteFixed');
    if (!fixedPalette || fixedPalette.disabled) {
      targetSummary.textContent = '共有パレットを利用できません。共通設定を確認するか、画像を選び直してください。';
      return;
    }
    fixedPalette.checked = true;
    fixedPalette.dispatchEvent(new Event('change', { bubbles: true }));
    targetSummary.textContent = '共有パレット固定にしました。プレビュー更新後、中央のボタンで撮影してください。';
    clearApplyRecovery();
  };
  const showApplyRecovery = (error) => {
    clearApplyRecovery();
    const addAction = (label, handler) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.style.cssText = 'min-height:44px;max-width:100%;padding:8px 12px;border:1px solid rgba(255,255,255,.3);border-radius:10px;background:#263744;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;';
      button.addEventListener('click', handler);
      recoveryActions.append(button);
    };
    if (error?.code === 'camera-palette-overflow') {
      addAction('共有パレット固定で撮り直す', () => { void retakeWithSharedPalette(); });
      addAction('共通パレット設定を開く', () => onProjectSettings?.());
      addAction('色数を減らした画像を選び直す', () => surface.querySelector('#cameraImageInput')?.click());
    } else if (error?.code === 'camera-partial-alpha') {
      addAction('不透明な画像を選び直す', () => surface.querySelector('#cameraImageInput')?.click());
    }
    recoveryActions.hidden = recoveryActions.childElementCount === 0;
    recoveryActions.style.display = recoveryActions.hidden ? 'none' : 'flex';
  };
  let targetEpoch = 0;
  const updateTarget = async () => {
    const epoch = ++targetEpoch;
    try {
      const snapshot = await draw.cameraTarget();
      if (epoch !== targetEpoch || scope?.disposed) return;
      clearApplyRecovery();
      applyButton.disabled = false;
      targetSummary.textContent = `適用先：${snapshot.description}`;
      applyButton.title = `${snapshot.description}へ適用。選択範囲外と他のレイヤー・フレームは保持し、画像と追加色を一緒にUndoできます。`;
    } catch (error) {
      if (epoch !== targetEpoch || scope?.disposed) return;
      applyButton.disabled = true; applyButton.title = error.message; targetSummary.textContent = error.message;
    }
  };
  const readProjectSettings = () => {
    const timeline = draw.getTimeline();
    const image = draw.getImage();
    return { width: image.width, height: image.height, palette: [...timeline.palette] };
  };
  let unsubscribeDraw = null;
  resultPreviewObserver = new MutationObserver(syncResultPreview);
  resultPreviewObserver.observe(document.body, { attributes:true, attributeFilter:['data-tool-result-open'] });
  syncResultPreview();
  const beforeHeader = new Set(document.querySelectorAll('.px-tool-header-slot,.project-bar'));
  const { mountPixelLensMode } = await import('../pixel-lens/app.mjs?rev=20261016-tool-shell-1');
  assertCurrent();
  updatePlacement({ repaint:false });
  instance = await mountPixelLensMode({ autoStart: false, isActive, draw, integratedShared: true, onProjectSettings,
    onPreviewFrame:renderPlacementFrame, onPreviewError:error => error ? reportPlacementError(error) : clearPlacementError(error),
    initialProjectSettings: readProjectSettings(),
    mountWorkspace: options => {
      workspace = mountProjectWorkspace({ ...options, root: surface, idPrefix: 'camera-', routePointer: false, initialPointer, isActive, onNavigate });
      return workspace;
    },
    onUseImage: async image => {
      if (!isActive() || !image) return;
      const attemptEpoch = captureEpoch;
      let applied = false;
      try {
      // Resolve the active frame, layer, selection, and palette at apply time for every entry path.
      const snapshot = await draw.cameraTarget();
      const target = snapshot.target, size = target.bounds;
      const currentImage = draw.getImage();
      if (image.width !== currentImage.width || image.height !== currentImage.height) {
        throw new Error('描画設定が変わりました。カメラを撮り直してください。');
      }
      const mapping = createCameraPlacementMapping({ sourceWidth:image.width, sourceHeight:image.height, width:target.width, height:target.height,
        bounds:size, cells:target.cells, mask:target.mask });
      const selected = sampleCameraFrameToPlacement(image, mapping);
      await draw.applyCameraRgba(snapshot, selected, { paletteFixed: image.paletteFixed === true });
      applied = true;
      // Shared palette updates may retire the camera preview during the commit.
      // Keep the successful artwork application visible without attributing it
      // to a newer captured image.
      if (attemptEpoch === captureEpoch || cameraProjectState === 'none') { appliedTimeline = draw.getTimeline(); cameraProjectState = 'applied'; renderProjectStatus(); }
      instance.closeResult(); await onReturn(destination);
      } catch (error) {
        // The camera's stage notice sits behind its completed-image view.
        // Keep an apply failure readable alongside the preserved result controls.
        if (!applied && attemptEpoch === captureEpoch) { cameraProjectState = 'pending'; onProjectStatus?.({ type:'apply-failed' }); renderProjectStatus(); }
        targetSummary.textContent = error.message;
        showApplyRecovery(error);
        throw error;
      }
    }
  });
  assertCurrent();
  restoredCaptureExpected = false;
  surface.querySelector('.lc-back')?.remove();
  unsubscribeDraw = draw.subscribe(() => {
    try { instance.syncProjectSettings(readProjectSettings()); } catch {}
    renderProjectStatus();
    if (isActive()) updatePlacement();
    if (isActive()) void updateTarget();
  });
  mountToolHeaderControls(document, { selectors: ['#cameraChooseImage', '#flipCamera'] });
  const headerControls = [...document.querySelectorAll('.px-tool-header-slot,.project-bar')].filter(node => !beforeHeader.has(node));
  const extraNodes = [document.querySelector('#cameraImageStatus'), document.querySelector('#cameraSaveDialog')].filter(Boolean);
  const setInteractive = (enabled) => {
    surface.inert = !enabled; controlHost.inert = !enabled; shutter.inert = !enabled;
    for (const node of [...headerControls, ...extraNodes]) node.inert = !enabled;
    const dialog = extraNodes.find(node => node.matches('dialog'));
    if (!enabled && dialog?.open) dialog.close();
  };
  let enterEpoch = 0;
  const stage = surface.querySelector('#stage');
  function fit() {
    if (!isActive()) return;
    // Anchor the existing preview to the actual shared frame's content box.
    // The camera result remains outside Draw's size-container stacking context.
    const rect = board.getBoundingClientRect();
    stage.style.left = `${rect.left + board.clientLeft}px`; stage.style.top = `${rect.top + board.clientTop}px`;
    stage.style.width = `${board.clientWidth}px`; stage.style.height = `${board.clientHeight}px`;
  }
  observer = new ResizeObserver(fit); observer.observe(board); observer.observe(dock);
  if (scope?.disposed || !isCurrent()) throw new Error('カメラモードが終了しました。');
  instance.closeResult(); instance.suspend(); setInteractive(false);
  scope.listen(window, 'resize', fit);
  scope.add(() => { enterEpoch++; setInteractive(false); unsubscribeDraw?.(); observer?.disconnect(); controlStateObserver?.disconnect(); resultPreviewObserver?.disconnect(); discardResultPreview(); controlHost.remove(); instance?.dispose(); style?.remove(); });
  return {
    surface, controls, controlHost, shutter, headerControls, extraNodes, workspace: instance.workspace,
    async enter(from = 'draw') {
      const epoch = ++enterEpoch;
      destination = from;
      await updateTarget();
      if (epoch !== enterEpoch || !isCurrent()) return;
      updatePlacement();
      applyButton.textContent = from === 'draw' ? '描画へ適用' : '音楽へ適用';
    },
    suspend() { enterEpoch++; setInteractive(false); instance.closeResult(); instance.suspend(); },
    closeResult: () => instance.closeResult(),
    resume() { if (!isActive() || scope?.disposed) return; setInteractive(true); fit(); instance.resume(); },
    get destination() { return destination; }
  };
  } catch (error) {
    try { instance?.dispose?.(); } catch {}
    try { observer?.disconnect(); } catch {}
    try { controlStateObserver?.disconnect(); } catch {}
    try { resultPreviewObserver?.disconnect(); discardResultPreview(); } catch {}
    try { style?.remove(); } catch {}
    try { workspace?.dispose?.(); } catch {}
    const added = [...document.querySelectorAll('*')].filter(node => !existingNodes.has(node));
    const addedSet = new Set(added);
    for (const node of added.reverse()) if (!addedSet.has(node.parentElement)) node.remove();
    for (const name of ['project-workspace-ready', 'pxd-ready']) if (!bodyClasses.has(name)) document.body.classList.remove(name);
    if (transferReady === null) document.body.removeAttribute('data-tool-transfer-ready');
    else document.body.setAttribute('data-tool-transfer-ready', transferReady);
    throw error;
  }
}
