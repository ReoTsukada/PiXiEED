import { centerCrop } from '../pixel-studio/framing.mjs';
import { mountToolHeaderControls } from '../tool-header-controls.mjs';
import { mountProjectWorkspace } from './project-workspace.mjs?rev=20261012-animation-core-contract-1';

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
export async function mountCreationCamera({ scope, board, dock, nav, draw, getAudio, onReturn, onNavigate, onProjectSettings, isActive, isCurrent = isActive, initialPointer = null }) {
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
  controlStateObserver = new MutationObserver(mirrorControlState); controlStateObserver.observe(surface, { attributes: true });
  mirrorControlState();
  nav.insertBefore(shutter, nav.children[2]);
  let destination = 'draw';
  const applyButton = controls.querySelector('#useCameraImage');
  const targetSummary = document.createElement('p'); targetSummary.id = 'creation-camera-target';
  targetSummary.setAttribute('role', 'status'); targetSummary.style.cssText = 'margin:0;font-size:12px;line-height:1.5;text-align:center;max-width:100%;';
  controls.querySelector('#resultControls').append(targetSummary);
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
  const beforeHeader = new Set(document.querySelectorAll('.px-tool-header-slot,.project-bar'));
  const { mountPixelLensMode } = await import('../pixel-lens/app.mjs?rev=20261012-animation-core-contract-1');
  assertCurrent();
  instance = await mountPixelLensMode({ autoStart: false, isActive, draw, integratedShared: true, onProjectSettings,
    initialProjectSettings: readProjectSettings(),
    mountWorkspace: options => {
      workspace = mountProjectWorkspace({ ...options, root: surface, idPrefix: 'camera-', routePointer: false, initialPointer, isActive, onNavigate });
      return workspace;
    },
    onUseImage: async image => {
      if (!isActive() || !image) return;
      try {
      // Resolve the active frame, layer, selection, and palette at apply time for every entry path.
      const snapshot = await draw.cameraTarget();
      const target = snapshot.target, size = target.bounds;
      const currentImage = draw.getImage();
      if (image.width !== currentImage.width || image.height !== currentImage.height) {
        throw new Error('描画設定が変わりました。カメラを撮り直してください。');
      }
      const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
      source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
      const sampled = document.createElement('canvas'); sampled.width = size.width; sampled.height = size.height;
      const context = sampled.getContext('2d'); context.imageSmoothingEnabled = false;
      const crop = centerCrop(image.width, image.height, size.width / size.height);
      context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
      const local = context.getImageData(0, 0, size.width, size.height).data;
      const selected = new Uint8ClampedArray(target.cells.length * 4);
      target.cells.forEach((cell, index) => {
        const offset = ((Math.floor(cell / target.width) - size.y) * size.width + cell % target.width - size.x) * 4;
        selected.set(local.subarray(offset, offset + 4), index * 4);
      });
      await draw.applyCameraRgba(snapshot, selected, { paletteFixed: image.paletteFixed === true });
      instance.closeResult(); await onReturn(destination);
      } catch (error) {
        // The camera's stage notice sits behind its completed-image view.
        // Keep an apply failure readable alongside the preserved result controls.
        targetSummary.textContent = error.message;
        showApplyRecovery(error);
        throw error;
      }
    }
  });
  assertCurrent();
  surface.querySelector('.lc-back')?.remove();
  unsubscribeDraw = draw.subscribe(() => {
    try { instance.syncProjectSettings(readProjectSettings()); } catch {}
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
  scope.add(() => { enterEpoch++; setInteractive(false); unsubscribeDraw?.(); observer?.disconnect(); controlStateObserver?.disconnect(); controlHost.remove(); instance?.dispose(); style?.remove(); });
  return {
    surface, controls, controlHost, shutter, headerControls, extraNodes, workspace: instance.workspace,
    async enter(from = 'draw') {
      const epoch = ++enterEpoch;
      destination = from;
      await updateTarget();
      if (epoch !== enterEpoch || !isCurrent()) return;
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
