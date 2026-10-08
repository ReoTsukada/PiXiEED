import { displayAdConfig } from '../data/site-config.js?rev=20261001-free-tools-1';

const views = new WeakMap();
const keys = new Set(['camera-result', 'draw-result', 'audio-result', 'jigsaw-result', 'spot-result', 'find-result']);
const resultPaths = new Map([
  ['camera-result', '/pixel-camera.html'], ['draw-result', '/draw/'], ['audio-result', '/audio/'],
  ['jigsaw-result', '/jigsaw/'], ['spot-result', '/play/spot-difference/'], ['find-result', '/play/hidden-object/']
]);

function hasConfiguredResultAd(key, win) {
  const slot = displayAdConfig?.slots?.[key];
  const path = String(win.location.pathname || '').replace(/\/index\.html$/, '/');
  return win.top === win.self && ['http:', 'https:'].includes(win.location.protocol)
    && resultPaths.get(key) === path
    && /^ca-pub-\d{16}$/.test(displayAdConfig?.client || '')
    && typeof slot === 'string' && /^\d{6,20}$/.test(slot.trim());
}

export function canMountToolResultAd({ availableHeight, contentMinHeight, adHeight, gap = 24 } = {}) {
  return [availableHeight, contentMinHeight, adHeight, gap].every(Number.isFinite)
    && availableHeight >= contentMinHeight + adHeight + gap;
}

/** Cache one optional module load and invalidate work when its view closes or is disposed. */
export function createOptionalImportGate(loader) {
  let modulePromise, version = 0, disposed = false;
  return {
    schedule(isCurrent, mount) {
      const scheduledVersion = ++version;
      if (!modulePromise) modulePromise = Promise.resolve().then(loader).catch(() => null);
      return modulePromise.then((module) => {
        if (module && !disposed && scheduledVersion === version && isCurrent()) mount(module);
      });
    },
    cancel() { version++; },
    dispose() { disposed = true; version++; }
  };
}

/** A normal results page inside the tool, never an advertising overlay or a save gate. */
export function createToolResultView({ key, main, returnLabel = '戻る', returnHref, beforeShow, onClose, onReturn } = {}) {
  if (!keys.has(key) || !main?.ownerDocument) return { show: () => false, close() {}, dispose() {} };
  if (views.has(main)) return views.get(main);
  const doc = main.ownerDocument; const win = doc.defaultView;
  let section, inner, contentNode, headingNode, actionGroupNode, titleNode, detailNode, previewBox, canvas, media, actionsNode, returnButton, adRow;
  let opened = false, disposed = false, previousFocus, previousScroll = 0, controlsPlacement, suspended = [];
  let currentAdEligible = [];
  const adCleanups = [];
  const adImportGate = createOptionalImportGate(() => import('./display-ads.mjs?rev=20261007-lazy-ads-1'));
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
    adRow = element('div', 'px-tool-result__ad-row');
    for (const placement of ['primary', 'secondary']) {
      const ad = element('aside', 'px-display-ad'); ad.hidden = true; ad.dataset.resultAdKey = key;
      ad.dataset.resultAdPlacement = placement; ad.setAttribute('aria-label', '広告');
      const adInner = element('div', 'px-display-ad__inner');
      adInner.append(element('span', 'px-display-ad__label', '広告')); ad.append(adInner);
      adRow.append(ad);
    }
    contentNode.append(headingNode, previewBox, actionGroupNode);
    inner.append(contentNode, adRow); section.append(inner); main.append(section);
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
    navButton = doc.querySelector('.app-tabs button');
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
  function resultAdBudget(node) {
    if (win.matchMedia('(max-height: 360px), (orientation: landscape) and (max-height: 480px)').matches) return false;
    if (node.dataset.resultAdPlacement === 'secondary' && !win.matchMedia('(min-width: 1100px)').matches) return false;
    const nav = doc.querySelector('.app-tabs');
    const header = doc.querySelector('.lc-top, .audio-heading, body > .site-header');
    if (!nav || !header || !contentNode) return false;
    const navRect = nav.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const headerBottom = Math.max(headerRect.bottom, 0);
    const availableHeight = navRect.top - headerBottom - 12;
    const contentStyle = win.getComputedStyle(contentNode);
    const gap = Number.parseFloat(contentStyle.rowGap) || 0;
    const sectionStyle = win.getComputedStyle(section);
    const innerStyle = win.getComputedStyle(inner);
    const landscape = win.matchMedia('(orientation: landscape) and (max-height: 480px)').matches;
    const verticalPadding = (Number.parseFloat(contentStyle.paddingTop) || 0)
      + (Number.parseFloat(contentStyle.paddingBottom) || 0)
      + (Number.parseFloat(sectionStyle.paddingTop) || 0)
      + (Number.parseFloat(sectionStyle.paddingBottom) || 0)
      + (Number.parseFloat(innerStyle.paddingTop) || 0)
      + (Number.parseFloat(innerStyle.paddingBottom) || 0);
    const contentMinHeight = landscape
      ? Math.max(64, headingNode.getBoundingClientRect().height, actionGroupNode.getBoundingClientRect().height) + verticalPadding
      : headingNode.getBoundingClientRect().height + (previewBox.hidden ? 0 : 128)
        + actionGroupNode.getBoundingClientRect().height + gap * 2 + verticalPadding;
    const reservedHeight = Number.parseFloat(win.getComputedStyle(node).getPropertyValue('--px-display-ad-reserved-height'));
    const adHeight = Number.isFinite(reservedHeight) && reservedHeight > 0 ? reservedHeight : 145;
    return canMountToolResultAd({ availableHeight, contentMinHeight, adHeight, gap: 24 });
  }
  function mountEligibleAds() {
    adImportGate.schedule(() => !disposed && opened && !section.hidden && currentAdEligible.length > 0, (ads) => {
      // The display-ads module has a document-level initializer. Keep these nodes unregistered
      // until that initializer has finished, then mount only the configured, budgeted placements.
      for (const node of currentAdEligible) node.dataset.displayAd = key;
      try {
        const priorUnitCount = adRow.querySelectorAll('ins.px-display-ad__unit').length;
        const cleanup = ads.mountDisplayAds({ root: section, win, canMount: resultAdBudget });
        if (adRow.querySelectorAll('ins.px-display-ad__unit').length > priorUnitCount && typeof cleanup === 'function') {
          adCleanups.push(cleanup);
        }
      } catch {
        // Result controls remain usable when optional ad setup fails.
      }
    });
  }
  function updateAdReservation() {
    currentAdEligible = hasConfiguredResultAd(key, win)
      ? [...adRow.children].filter(resultAdBudget) : [];
    if (!currentAdEligible.length) {
      currentAdEligible = [];
      adRow.hidden = true;
      delete adRow.dataset.reserved;
      adRow.style.removeProperty('--px-tool-result-ad-reserved-height');
      return;
    }
    const reservedHeight = Number.parseFloat(win.getComputedStyle(currentAdEligible[0]).getPropertyValue('--px-display-ad-reserved-height')) || 145;
    adRow.hidden = false;
    adRow.dataset.reserved = 'true';
    adRow.style.setProperty('--px-tool-result-ad-reserved-height', `${reservedHeight}px`);
    mountEligibleAds();
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
    updateAdReservation();
    return true;
  }
  function close({ focus = true, notify = true } = {}) {
    if (!opened) return;
    opened = false; adImportGate.cancel(); currentAdEligible = []; section.hidden = true; restoreControls(); restoreNav(); clearPreview();
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
  function onResize() {
    updateNavClearance();
    if (opened && !disposed) updateAdReservation();
  }
  win.addEventListener('resize', onResize);
  function dispose() {
    close({ focus: false, notify: false }); disposed = true; adImportGate.dispose();
    for (const cleanup of adCleanups) cleanup?.();
    adCleanups.length = 0; doc.removeEventListener('keydown', onKey, true);
    win.removeEventListener('resize', onResize);
    section?.remove(); views.delete(main); delete main.dataset.toolResultHost;
  }
  const controller = { show, close, dispose };
  views.set(main, controller); return controller;
}
