/** Move existing tool controls without importing the site's analytics or menus. */
const movedControls = new WeakMap();
const mountedDismissals = new WeakSet();

function addPanelClose(doc, details) {
  if (!details.matches('details') || doc.body.dataset.page === 'draw') return;
  const panel = [...details.children].find(node => node.tagName !== 'SUMMARY');
  if (!panel || panel.querySelector('[data-popup-closer], [data-draw-panel-close], button[aria-label*="閉じ"]')) return;
  const close = doc.createElement('button');
  close.type = 'button'; close.textContent = '×';
  close.className = 'px-tool-header-panel-close'; close.dataset.popupCloser = '';
  const name = panel.querySelector('h2')?.textContent || details.querySelector('summary')?.getAttribute('aria-label')?.replace(/を(?:開く|設定).*$/, '') || '設定';
  close.setAttribute('aria-label', `${name}を閉じる`);
  close.addEventListener('click', () => {
    details.open = false;
    details.querySelector('summary')?.setAttribute('aria-expanded', 'false');
    details.querySelector('summary')?.focus({ preventScroll: true });
  });
  panel.prepend(close);
}

function installHeaderDismissals(doc, controls) {
  // Drawing and music already use the shared editor's dismissal controller.
  if (['draw', 'audio'].includes(doc.body.dataset.page) || mountedDismissals.has(controls)) return;
  const panels = () => [...controls.querySelectorAll('details[data-editor-header-control][open]')];
  const close = panel => { panel.open = false; panel.querySelector('summary')?.setAttribute('aria-expanded', 'false'); };
  controls.addEventListener('toggle', event => {
    const panel = event.target;
    if (!panel.matches?.('details[data-editor-header-control]')) return;
    panel.querySelector('summary')?.setAttribute('aria-expanded', String(panel.open));
    if (panel.open) for (const other of panels()) if (other !== panel && !other.contains(panel) && !panel.contains(other)) close(other);
  }, true);
  doc.addEventListener('pointerdown', event => {
    for (const panel of panels()) if (!panel.contains(event.target)) close(panel);
  });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const panel = panels().at(-1);
    if (!panel) return;
    event.preventDefault();
    for (const open of panels()) close(open);
    panel.querySelector('summary')?.focus({ preventScroll: true });
  });
  mountedDismissals.add(controls);
}

export function mountToolHeaderControls(doc = document, { selectors = [], projectBar = null } = {}) {
  const header = doc.querySelector('.site-header, .audio-heading, .lc-top');
  if (!header || !doc.body.dataset.toolName) return null;
  const inner = header.querySelector('.header-inner') || header;
  doc.body.classList.add('px-tool-header');
  let controls = inner.querySelector('.px-tool-header-controls');
  if (!controls) {
    controls = doc.createElement('div');
    controls.className = 'px-tool-header-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', '編集の操作');
    inner.insertBefore(controls, inner.querySelector('[data-menu-toggle]'));
  }
  installHeaderDismissals(doc, controls);
  if (projectBar) {
    projectBar.classList.add('px-tool-header-files');
    inner.insertBefore(projectBar, controls);
  }
  for (const selector of selectors) {
    const node = typeof selector === 'string' ? doc.querySelector(selector) : selector;
    if (!node || movedControls.has(node)) continue;
    // Keep controls belonging to a hidden setup/edit/result section hidden too.
    const ancestors = [];
    for (let parent = node.parentElement; parent && parent !== doc.body; parent = parent.parentElement) ancestors.push(parent);
    const slot = doc.createElement('div');
    slot.className = 'px-tool-header-slot';
    node.dataset.editorHeaderControl = '';
    node.classList.add('px-tool-header-control');
    controls.append(slot);
    slot.append(node);
    addPanelClose(doc, node);
    const update = () => {
      slot.hidden = node.hidden || ancestors.some((parent) => parent.hidden);
      slot.inert = node.inert || ancestors.some((parent) => parent.inert);
      if (slot.hidden && node.matches('details[open]')) node.open = false;
    };
    const Observer = doc.defaultView.MutationObserver;
    const observer = Observer ? new Observer(update) : null;
    observer?.observe(node, { attributes: true, attributeFilter: ['hidden', 'inert'] });
    for (const parent of ancestors) observer?.observe(parent, { attributes: true, attributeFilter: ['hidden', 'inert'] });
    movedControls.set(node, { slot, observer });
    update();
  }
  return controls;
}
