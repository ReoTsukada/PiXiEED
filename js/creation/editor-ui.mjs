/** Small, shared editor chrome. Artwork and song state stay in their own tools. */
function editorDetails(root) {
  return [...root.ownerDocument.querySelectorAll('details')].filter(panel => root.contains(panel) || panel.closest('[data-editor-header-control]'));
}
export function closeEditorPanels(root) {
  for (const panel of root ? editorDetails(root).filter(panel => panel.open) : []) {
    panel.open = false;
    panel.querySelector('summary')?.setAttribute('aria-expanded', 'false');
    // PXD's sheet lives outside the workspace to avoid Safari containing blocks.
    const controlledId = panel.querySelector('summary')?.getAttribute('aria-controls');
    if (controlledId === 'pxd-panel') {
      const sheet = root.ownerDocument?.getElementById(controlledId);
      if (sheet) sheet.hidden = true;
    }
  }
}

export function editorViewportInsets({ height, headerBottom = 64, navTop = height - 84 }) {
  return {
    header: Math.max(0, Math.ceil(headerBottom)),
    bottom: Math.max(0, Math.ceil(height - navTop + 12))
  };
}

export function mountCreationEditorUi(root, { beforePanelOpen = () => {} } = {}) {
  const doc = root.ownerDocument; const win = doc.defaultView;
  let disposed = false;
  function updateInsets() {
    if (disposed) return;
    const header = doc.querySelector('body > .site-header');
    const nav = doc.querySelector('.app-tabs');
    const insets = editorViewportInsets({ height: win.innerHeight,
      headerBottom: header?.getBoundingClientRect().bottom || 64,
      navTop: nav?.getBoundingClientRect().top });
    for (const [name, value] of Object.entries(insets)) {
      const property = `--creation-editor-${name}`;
      if (doc.body.style.getPropertyValue(property) !== `${value}px`) doc.body.style.setProperty(property, `${value}px`);
    }
  }
  function onToggle(event) {
    const panel = event.target;
    if (!panel.matches?.('details') || (!root.contains(panel) && !panel.closest('[data-editor-header-control]'))) return;
    panel.querySelector('summary')?.setAttribute('aria-expanded', String(panel.open));
    if (!panel.open) return;
    beforePanelOpen();
    for (const other of editorDetails(root).filter(panel => panel.open)) {
      // A nested PXD menu retains the parent that contains its launcher.
      if (other !== panel && !other.contains(panel) && !panel.contains(other)) other.open = false;
    }
  }
  function onPointerDown(event) {
    const panels = editorDetails(root).filter(panel => panel.open);
    // Interacting with a body-mounted sheet also keeps its ancestor menus open.
    if (panels.some((panel) => {
      const id = panel.querySelector('summary')?.getAttribute('aria-controls');
      return id && doc.getElementById(id)?.contains(event.target);
    })) return;
    for (const panel of panels) {
      const controlled = panel.querySelector('summary')?.getAttribute('aria-controls');
      const portal = controlled && doc.getElementById(controlled);
      const launcher = event.target.closest?.('[aria-controls]');
      if (panel.contains(event.target) || portal?.contains(event.target)
          || launcher?.getAttribute('aria-controls') === panel.id) continue;
      panel.open = false;
    }
  }
  function onKey(event) {
    if (event.key !== 'Escape') return;
    const panel = editorDetails(root).filter(panel => panel.open).at(-1);
    if (!panel) return;
    closeEditorPanels(root); panel.querySelector('summary')?.focus({ preventScroll: true });
  }
  doc.addEventListener('toggle', onToggle, true);
  doc.addEventListener('pointerdown', onPointerDown);
  doc.addEventListener('keydown', onKey);
  win.addEventListener('resize', updateInsets, { passive: true });
  const observer = win.ResizeObserver ? new win.ResizeObserver(updateInsets) : null;
  for (const node of [doc.querySelector('body > .site-header'), doc.querySelector('.app-tabs')]) if (node) observer?.observe(node);
  updateInsets();
  return { closePanels: () => closeEditorPanels(root), dispose() {
    disposed = true; observer?.disconnect();
    doc.removeEventListener('toggle', onToggle, true);
    doc.removeEventListener('pointerdown', onPointerDown); doc.removeEventListener('keydown', onKey);
    win.removeEventListener('resize', updateInsets);
  } };
}
