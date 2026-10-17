const definitions = {
  jigsaw: {
    center: '#jigsaw-save',
    states: () => document.querySelector('#jigsaw-play')?.hidden
      ? [null, '#jigsaw-start', '#jigsaw-save', '#jigsaw-current', '#jigsaw-resume']
      : ['#jigsaw-preview-toggle', '#jigsaw-hint', '#jigsaw-save', '#jigsaw-rotate', '#jigsaw-return'],
  },
  'spot-difference': {
    center: '#spot-save',
    states: () => document.body.classList.contains('spot-inline-open')
      ? ['#spot-inline-original', '#spot-inline-undo', '#spot-save', '#spot-inline-redo', '#spot-inline-finish']
      : document.body.classList.contains('spot-editing')
        ? ['.spot-settings', '#spot-candidate-undo', '#spot-save', '#spot-candidate-redo', '#spot-redraw']
        : ['#spot-import-pair', '#spot-resume', '#spot-save', null, '#spot-start'],
  },
  'hidden-object': {
    center: '#hidden-save',
    states: () => !document.querySelector('#hidden-editor')?.hidden
      ? document.querySelector('#hidden-editor')?.dataset.confirmed === 'true'
        ? ['#hidden-target-settings', '#hidden-undo', '#hidden-save', '#hidden-redo', '#hidden-play-local']
        : ['#hidden-target-settings', '#hidden-undo', '#hidden-save', '#hidden-redo', '#hidden-confirm']
      : [null, '#hidden-start', '#hidden-save', '#hidden-resume', null],
  },
  'spot-game': { center: '#pixfind-primary', mode: 'game' },
  'find-game': { center: '#pixfind-primary', mode: 'game' },
};

function mount() {
  const definition = definitions[document.body.dataset.page];
  const nav = document.querySelector('.app-tabs');
  const center = definition && document.querySelector(definition.center);
  if (!definition || !nav || !center || nav.dataset.operationBarReady === 'true') return;

  document.body.dataset.toolOperationBar = '';
  nav.setAttribute('aria-label', 'ツールの操作');
  nav.dataset.operationBarReady = 'true';
  const initialSlots = [...nav.querySelectorAll(':scope > [data-operation-slot]')];
  const slots = Array.from({ length: 4 }, (_, index) => {
    const slot = initialSlots[index] || document.createElement('div');
    slot.className = 'tool-operation-slot';
    slot.dataset.operationSlot = String(index < 2 ? index : index + 1);
    slot.setAttribute('role', 'group');
    slot.setAttribute('aria-label', 'ツール操作');
    slot.replaceChildren();
    return slot;
  });

  // Keep the original central button as a direct child; result views reuse it.
  nav.replaceChildren(slots[0], slots[1], center, slots[2], slots[3]);
  const records = new Map();
  const assigned = new Map();
  const localPanels = new WeakSet();

  const recordFor = (node) => {
    if (!records.has(node)) {
      // A comment marks the exact original position, even when a selected
      // operation is nested inside another operation that also moves.
      const marker = document.createComment('tool-operation-origin');
      node.parentNode?.insertBefore(marker, node);
      const sourceAncestors = [];
      for (let parent = marker.parentElement; parent && parent !== document.body; parent = parent.parentElement) sourceAncestors.push(parent);
      const headerSlot = node.closest('.px-tool-header-slot');
      node.setAttribute('data-tool-operation', '');
      records.set(node, { marker, sourceAncestors, headerSlot });
      for (const ancestor of sourceAncestors) observer.observe(ancestor, { attributes:true, attributeFilter:['hidden', 'inert', 'aria-hidden'] });
      if (node.matches('details')) installPanelDismissal(node);
    }
    return records.get(node);
  };

  const installPanelDismissal = (details) => {
    if (localPanels.has(details)) return;
    localPanels.add(details);
    const summary = details.querySelector(':scope > summary');
    if (!summary) return;
    const sync = () => summary.setAttribute('aria-expanded', String(details.open));
    details.addEventListener('toggle', sync);
    sync();
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !details.open) return;
      event.preventDefault();
      details.open = false;
      summary.focus({ preventScroll: true });
    });
    document.addEventListener('pointerdown', (event) => {
      if (details.open && !details.contains(event.target)) details.open = false;
    });
  };

  const restore = (node) => {
    const record = records.get(node);
    if (record?.marker.parentNode) record.marker.parentNode.insertBefore(node, record.marker.nextSibling);
  };

  const visibleFor = (node, record) => node.hidden !== true && node.inert !== true
    && node.getAttribute('aria-hidden') !== 'true'
    && record.sourceAncestors.every((parent) => !parent.hidden && !parent.inert && parent.getAttribute('aria-hidden') !== 'true')
    && (!record.headerSlot || (!record.headerSlot.hidden && !record.headerSlot.inert));

  const resultOpen = () => document.body.hasAttribute('data-tool-result-open');
  const playState = () => {
    if (resultOpen()) return 'result';
    return document.querySelector('#pixfind-game')?.hidden ? 'list' : 'active';
  };
  const playRouteLeavesPage = () => {
    const params = new URLSearchParams(window.location.search || '');
    return params.has('localSpot') || params.has('localHidden') || params.has('postPuzzle');
  };
  const stateControls = () => {
    if (definition.mode === 'game') {
      const state = playState();
      if (state === 'active') return [playRouteLeavesPage() ? null : '#pixfind-back', '#pixfind-hint', definition.center, '#pixfind-compare', '#puzzle-share-copy'];
      if (state === 'list') return [null, null, definition.center, null, null];
      return [null, null, definition.center, null, '#puzzle-share-copy'];
    }
    return definition.states();
  };

  const update = () => {
    const controls = resultOpen()
      ? [null, null, definition.center, null, null]
      : stateControls();
    const centerIndex = controls.findIndex((selector) => selector === definition.center);
    const sideControls = controls.filter((_, index) => index !== centerIndex);
    const wanted = new Map();

    sideControls.forEach((selector, index) => {
      const node = selector ? document.querySelector(selector) : null;
      if (node && node !== center && ![...wanted.values()].includes(node)) wanted.set(slots[index], node);
    });

    // Restore controls leaving this state before placing new controls. This
    // retains listener-bearing node identity and its exact original parent.
    for (const [slot, node] of assigned) {
      if (wanted.get(slot) !== node) {
        if (node.matches('details')) node.open = false;
        restore(node);
        node.dataset.toolOperationInactive = '';
        assigned.delete(slot);
        slot.replaceChildren();
      }
    }

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const node = wanted.get(slot) || null;
      if (!node) {
        if (!slot.hidden) slot.hidden = true;
        if (!slot.inert) slot.inert = true;
        continue;
      }
      const record = recordFor(node);
      delete node.dataset.toolOperationInactive;
      if (node.parentElement !== slot) slot.replaceChildren(node);
      if (assigned.get(slot) !== node) assigned.set(slot, node);
      const inactive = !visibleFor(node, record);
      if (slot.hidden !== inactive) slot.hidden = inactive;
      if (slot.inert !== inactive) slot.inert = inactive;
    }
  };

  const observer = new MutationObserver(update);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-tool-result-open'] });
  observer.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'disabled', 'data-confirmed'] });
  document.querySelectorAll('#jigsaw-setup,#jigsaw-play,#jigsaw-start,#jigsaw-resume,#jigsaw-current,#jigsaw-preview-toggle,#jigsaw-hint,#jigsaw-rotate,#jigsaw-return,#spot-setup,#spot-editor,#spot-inline-draw,#spot-import-pair,#spot-start,#spot-resume,#spot-inline-pen,#spot-inline-undo,#spot-inline-redo,#spot-inline-eraser,#spot-inline-original,#spot-inline-finish,#spot-candidate-undo,#spot-candidate-redo,.spot-settings,#spot-redraw,#spot-play-local,#hidden-setup,#hidden-editor,#hidden-start,#hidden-resume,[data-hidden-mode="paint"],[data-hidden-mode="erase"],#hidden-target-settings,#hidden-confirm,#hidden-new,#hidden-play-local,#hidden-undo,#hidden-redo,#pixfind-list,#pixfind-game,#pixfind-back,#pixfind-hint,#pixfind-compare,#puzzle-share,#puzzle-share-copy,#puzzle-create-link').forEach((node) => {
    if (!node) return;
    observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'data-confirmed'] });
  });
  update();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
