/** Draw-only dismissal chrome and input isolation for its floating editor panels. */
export function mountDrawPanelDismissals({ scope, root, cancelInput, closeFloating, hasFloating }) {
  const doc = root.ownerDocument;
  const panels = [
    ['#draw-settings-picker', '.draw-settings-panel', '描き方・表示の設定'],
    ['#draw-tool-picker', '.draw-tool-menu', '道具'],
    ['#draw-output', '.creation-output__panel', 'ファイル'],
    ['.draw-import', '.draw-canvas-panel', 'キャンバス設定'],
  ];
  const detailsList = () => {
    const topDialog = [...doc.querySelectorAll('dialog[open]')].at(-1);
    return [...root.querySelectorAll('details[open]'), ...doc.querySelectorAll('#pxd-panel[open] details[open]')]
      .filter(panel => panel.getClientRects().length && !panel.closest('[hidden]') && (!topDialog || topDialog.contains(panel)));
  };
  function dismiss(details) {
    cancelInput(); details.open = false;
    const summary = details.querySelector(':scope > summary');
    summary?.setAttribute('aria-expanded', 'false'); summary?.focus({ preventScroll: true });
  }
  function addHeader(details, panel, title) {
    if (!details || !panel || panel.querySelector('[data-draw-panel-close]')) return;
    let header = panel.querySelector(':scope > header');
    if (!header) {
      header = doc.createElement('header');
      const heading = panel.querySelector(':scope > h2') || doc.createElement('h2');
      heading.textContent = title; header.append(heading); panel.prepend(header);
    }
    header.classList.add('draw-panel-header');
    const close = doc.createElement('button'); close.type = 'button'; close.textContent = '×';
    close.dataset.drawPanelClose = ''; close.className = 'draw-panel-close';
    close.setAttribute('aria-label', `${title}を閉じる`); close.title = `${title}を閉じる`;
    header.append(close); scope.listen(close, 'click', () => dismiss(details));
  }
  function decorate() {
    for (const [selector, content, title] of panels) {
      const details = root.querySelector(selector); addHeader(details, details?.querySelector(content), title);
    }
    const project = doc.querySelector('#pxd-panel');
    if (project && !project.hasAttribute('data-draw-panel-dismissal')) {
      project.dataset.drawPanelDismissal = '';
      scope.listen(project, 'close', () => {
        cancelInput();
        for (const details of project.querySelectorAll('details[open]')) {
          details.open = false; details.querySelector('summary')?.setAttribute('aria-expanded', 'false');
        }
      });
    }
    // Project submenus are disclosures inside the existing modal, not new dialogs.
    for (const details of doc.querySelectorAll('#pxd-panel details')) {
      if (details.dataset.drawDismissible) continue;
      details.dataset.drawDismissible = 'true';
      const panel = doc.createElement('div'); panel.className = 'draw-project-subpanel';
      for (const child of [...details.children]) if (child.tagName !== 'SUMMARY') panel.append(child);
      details.append(panel); addHeader(details, panel, details.querySelector('summary')?.textContent || 'メニュー');
    }
    // Reuse the color editor's existing completion button at its persistent header.
    const color = doc.querySelector('#draw-color-editor'), done = color?.querySelector('#dce-done');
    if (done && !done.hasAttribute('data-draw-panel-close')) {
      done.dataset.drawPanelClose = ''; done.classList.add('draw-panel-close'); done.textContent = '×';
      done.setAttribute('aria-label', '色の調整を閉じる'); done.title = '色の調整を閉じる';
      const header = color.querySelector('.dce-header'); header.classList.add('draw-panel-header'); header.append(done);
    }
  }
  decorate();
  const observer = new MutationObserver(decorate); observer.observe(doc.body, { childList: true, subtree: true });
  scope.add(() => observer.disconnect());
  // This must run before the viewport's capture handler, which consumes native
  // pointers in virtual mode. A dismissal contact never becomes a drawing contact.
  scope.listen(doc, 'pointerdown', event => {
    const onBoard = event.target.closest?.('.draw-board');
    if (onBoard && (detailsList().length || hasFloating())) {
      cancelInput(); closeFloating(); event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    // Mode OFF owns its existing commit-and-release path; do not roll its accepted pixels back.
    if (!onBoard && !event.target.closest?.('[data-virtual-left], [data-virtual-right], #draw-virtual-toggle')) cancelInput();
  }, { capture: true });
  scope.listen(doc, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const details = detailsList().at(-1);
    if (!details) return;
    // The native dialog handles Escape only after its inner disclosure closes.
    event.preventDefault(); event.stopImmediatePropagation(); dismiss(details);
  }, { capture: true });
  scope.listen(doc, 'toggle', event => {
    if (event.target.matches?.('#pxd-panel details')) event.target.querySelector('summary')?.setAttribute('aria-expanded', String(event.target.open));
  }, { capture: true });
}
