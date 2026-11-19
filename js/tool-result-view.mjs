const views = new WeakMap();
const keys = new Set(['camera-result', 'draw-result', 'audio-result', 'jigsaw-result', 'spot-result', 'find-result']);
/** A normal results page inside the tool, never an advertising overlay or a save gate. */
export function createToolResultView({ key, main, returnLabel = '戻る', returnHref, beforeShow, onClose, onReturn } = {}) {
  if (!keys.has(key) || !main?.ownerDocument) return { show: () => false, close() {}, dispose() {} };
  if (views.has(main)) return views.get(main);
  const doc = main.ownerDocument; const win = doc.defaultView;
  let section, inner, contentNode, headingNode, actionGroupNode, titleNode, detailNode, previewBox, canvas, media, actionsNode, returnButton;
  let opened = false, disposed = false, previousFocus, previousScroll = 0, controlsPlacement, suspended = [];
  let navButton, navState;

  function element(tag, className, text) {
    const node = doc.createElement(tag); node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function prepare() {
    if (section) return;
    main.dataset.toolResultHost = '';
    section = element('section', 'px-tool-result'); section.hidden = true;
    section.dataset.toolResultView = key;
    titleNode = element('h2', 'px-tool-result__title'); titleNode.id = `px-${key}-title`;
    titleNode.tabIndex = -1;
    section.setAttribute('aria-labelledby', titleNode.id);
    inner = element('div', 'container px-tool-result__inner');
    contentNode = element('div', 'px-tool-result__content');
    headingNode = element('div', 'px-tool-result__heading');
    actionGroupNode = element('div', 'px-tool-result__action-group');
    detailNode = element('p', 'px-tool-result__detail');
    previewBox = element('div', 'px-tool-result__picture'); previewBox.hidden = true;
    canvas = element('canvas', 'px-tool-result__preview'); canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '作品の確認画像'); previewBox.append(canvas);
    media = element('img', 'px-tool-result__preview'); media.hidden = true;
    media.alt = '撮影したGIFの確認画像'; previewBox.append(media);
    actionsNode = element('div', 'px-tool-result__actions');
    returnButton = element(returnHref ? 'a' : 'button', 'px-tool-result__return', returnLabel);
    if (returnHref) returnButton.href = returnHref; else returnButton.type = 'button';
    returnButton.addEventListener('click', event => {
      if (returnHref && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof onReturn !== 'function')) return;
      event.preventDefault(); returnFromResult();
    });
    headingNode.append(titleNode, detailNode);
    actionGroupNode.append(actionsNode, returnButton);
    contentNode.append(headingNode, previewBox, actionGroupNode);
    inner.append(contentNode); section.append(inner); main.append(section);
  }
  function restoreControls() {
    if (!controlsPlacement) return;
    const { node, marker } = controlsPlacement;
    if (marker.parentNode) marker.replaceWith(node);
    controlsPlacement = null;
  }
  function interceptNav(event) {
    if (!opened) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.type === 'click') returnFromResult();
  }
  function prepareNav() {
    const buttons = [...doc.querySelectorAll('.app-tabs > button')];
    const isVisible = button => !button.inert && !button.hidden && button.getClientRects().length;
    const creationPrimary = doc.body.classList.contains('creation-suite')
      ? [...doc.querySelectorAll('.app-tabs > button[data-nav-primary]')].find(isVisible)
      : null;
    navButton = creationPrimary || buttons.find(isVisible);
    if (!navButton) return;
    navState = { label: navButton.getAttribute('aria-label'), title: navButton.getAttribute('title'), disabled: navButton.disabled, children: [...navButton.childNodes] };
    navButton.dataset.toolResultReturn = ''; navButton.disabled = false;
    navButton.setAttribute('aria-label', returnLabel); navButton.title = returnLabel;
    const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('px-tool-result__nav-icon'); icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
    const arrow = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M13 5 6 12l7 7M6 12h12'); icon.append(arrow);
    navButton.replaceChildren(icon);
    navButton.addEventListener('click', interceptNav, true);
    navButton.addEventListener('pointerdown', interceptNav, true);
  }
  function restoreNav() {
    if (!navButton || !navState) return;
    navButton.removeEventListener('click', interceptNav, true);
    navButton.removeEventListener('pointerdown', interceptNav, true);
    delete navButton.dataset.toolResultReturn;
    navButton.replaceChildren(...navState.children);
    for (const [name, value] of [['aria-label', navState.label], ['title', navState.title]]) {
      if (value == null) navButton.removeAttribute(name); else navButton.setAttribute(name, value);
    }
    navButton.disabled = navState.disabled; navState = null;
  }
  function clearPreview() {
    media.removeAttribute('src'); media.hidden = true;
    canvas.width = canvas.height = 1; canvas.hidden = false; previewBox.hidden = true;
  }
  function updateNavClearance() {
    if (!opened) return;
    const nav = doc.querySelector('.app-tabs');
    if (nav) main.style.setProperty('--px-tool-result-nav-clearance', `${Math.ceil(win.innerHeight - nav.getBoundingClientRect().top + 12)}px`);
  }
  function show({ title = '完成しました', detail = '', preview, controls, mediaUrl, actions = [] } = {}) {
    if (disposed) return false;
    beforeShow?.();
    prepare(); restoreControls(); clearPreview();
    titleNode.textContent = title; detailNode.textContent = detail; detailNode.hidden = !detail;
    actionsNode.replaceChildren();
    const width = preview?.naturalWidth || preview?.width;
    const height = preview?.naturalHeight || preview?.height;
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      const scale = Math.min(1, 1024 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      try { context.drawImage(preview, 0, 0, canvas.width, canvas.height); previewBox.hidden = false; }
      catch { canvas.width = canvas.height = 1; }
    }
    // Only an already-owned local capture URL may replace the still preview with animation.
    if (typeof mediaUrl === 'string' && mediaUrl.startsWith('blob:')) {
      try {
        if (new URL(mediaUrl).origin === win.location.origin) {
          media.src = mediaUrl; media.hidden = false; canvas.hidden = true; previewBox.hidden = false;
        }
      } catch { /* keep the still preview */ }
    }
    if (controls?.ownerDocument === doc) {
      const marker = doc.createComment('tool-result-controls'); controls.before(marker);
      controlsPlacement = { node: controls, marker }; actionsNode.append(controls);
    }
    for (const action of actions.slice(0, 2)) {
      if (typeof action?.onClick !== 'function') continue;
      const button = element('button', 'px-tool-result__action', String(action.label || '続ける')); button.type = 'button';
      button.addEventListener('click', action.onClick); actionsNode.append(button);
    }
    if (doc.body.dataset.toolTransferReady === 'true' && !controls?.querySelector('#useCameraImage')) {
      const transfer = element('button', 'px-tool-result__action', '他のツールへ');
      transfer.type = 'button'; transfer.dataset.toolResultTransfer = '';
      transfer.addEventListener('click', () => doc.dispatchEvent(new win.CustomEvent('pixieed:open-tool-transfer')));
      actionsNode.append(transfer);
    }
    if (!opened) {
      previousFocus = doc.activeElement; previousScroll = win.scrollY;
      suspended = [...main.children].filter((node) => node !== section && !node.matches('.lc-top,.audio-heading,.site-header'))
        .map((node) => ({ node, inert: node.inert }));
      for (const { node } of suspended) { node.dataset.toolResultSuspended = ''; node.inert = true; }
      opened = true; doc.body.dataset.toolResultOpen = key; prepareNav();
    }
    section.hidden = false;
    win.scrollTo({ top: 0, behavior: 'instant' }); titleNode.focus({ preventScroll: true });
    updateNavClearance();
    return true;
  }
  function close({ focus = true, notify = true } = {}) {
    if (!opened) return;
    opened = false; section.hidden = true; restoreControls(); restoreNav(); clearPreview();
    main.style.removeProperty('--px-tool-result-nav-clearance');
    for (const { node, inert } of suspended) { delete node.dataset.toolResultSuspended; node.inert = inert; }
    suspended = []; delete doc.body.dataset.toolResultOpen;
    win.scrollTo({ top: previousScroll, behavior: 'instant' });
    if (notify) onClose?.();
    if (focus && previousFocus?.isConnected && !previousFocus.disabled) {
      const visibleTarget = previousFocus.getClientRects().length ? previousFocus
        : previousFocus.closest('details')?.querySelector('summary');
      const target = visibleTarget?.getClientRects().length ? visibleTarget : main.querySelector('canvas[tabindex]');
      target?.focus({ preventScroll: true });
    }
  }
  // Explicit user navigation is separate from internal close/reset/dispose.
  function returnFromResult() {
    if (!opened) return;
    close({ focus: typeof onReturn !== 'function' });
    if (typeof onReturn === 'function') onReturn();
    else if (returnHref) win.location.assign(returnHref);
  }
  function onKey(event) {
    // A menu or project sheet above the result owns its own dismissal.
    if (opened && event.key === 'Escape' && !doc.querySelector('dialog[open]') && !doc.body.classList.contains('is-menu-open')) { event.preventDefault(); event.stopImmediatePropagation(); returnFromResult(); }
  }
  doc.addEventListener('keydown', onKey, true);
  win.addEventListener('resize', updateNavClearance);
  function dispose() {
    close({ focus: false, notify: false }); disposed = true;
    doc.removeEventListener('keydown', onKey, true);
    win.removeEventListener('resize', updateNavClearance);
    section?.remove(); views.delete(main); delete main.dataset.toolResultHost;
  }
  const controller = { show, close, dispose };
  views.set(main, controller); return controller;
}
