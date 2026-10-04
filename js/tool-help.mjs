import { getToolGuide, TOOL_GUIDES } from './tool-help-data.mjs?rev=20261003-tool-help-1';

const mountedDocuments = new WeakMap();
const HELP_CSS_ID = 'px-tool-help-styles';

export function isToolsHubPath(pathname) {
  const normalized = String(pathname || '').replace(/\/index\.html\/?$/i, '/').replace(/\/+$/, '');
  return normalized === '/tools';
}

function addHelpStyles(document) {
  if (document.getElementById(HELP_CSS_ID)) return;
  const link = document.createElement('link');
  link.id = HELP_CSS_ID;
  link.rel = 'stylesheet';
  link.href = '/css/tool-help.css?rev=20261003-tool-help-3';
  document.head?.append(link);
}

function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const GUIDE_ICONS = {
  draw: 'artwork', camera: 'camera', telescope: 'telescope', audio: 'music', jigsaw: 'jigsaw',
  'spot-play': 'spot-difference', 'spot-create': 'spot-difference',
  'hidden-play': 'hidden-object', 'hidden-create': 'hidden-object', game: 'play'
};

const PICKER_CATEGORIES = [
  { title: 'つくる・見る', ids: ['draw', 'camera', 'telescope', 'audio'] },
  { title: '遊ぶ', ids: ['jigsaw', 'spot-play', 'hidden-play'] },
  { title: '問題を作る', ids: ['spot-create', 'hidden-create'] }
];

function guideIcon(document, guide, className) {
  const iconName = GUIDE_ICONS[guide.id];
  if (!iconName) return null;
  const icon = el(document, 'img', className);
  icon.src = `/assets/icons/pixieed/${iconName}.svg`;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function renderGuide(document, host, guide) {
  host.replaceChildren();

  const hero = el(document, 'div', 'px-tool-help__hero');
  const icon = guideIcon(document, guide, 'px-tool-help__hero-icon');
  if (icon) hero.append(icon);
  hero.append(el(document, 'p', 'px-tool-help__intro', guide.intro || ''));
  host.append(hero);

  const stepsSection = el(document, 'section', 'px-tool-help__section px-tool-help__steps-section');
  stepsSection.id = 'px-tool-help-steps';
  stepsSection.dataset.toolHelpTarget = 'steps';
  stepsSection.tabIndex = -1;
  const stepsHeading = el(document, 'h3', '', 'はじめ方');
  stepsHeading.id = 'px-tool-help-steps-title';
  stepsSection.setAttribute('aria-labelledby', stepsHeading.id);
  stepsSection.append(stepsHeading);
  const steps = el(document, 'ol', 'px-tool-help__steps');
  (Array.isArray(guide.steps) ? guide.steps : []).forEach((step) => steps.append(el(document, 'li', '', step)));
  stepsSection.append(steps);
  host.append(stepsSection);

  const controlsSection = el(document, 'section', 'px-tool-help__section px-tool-help__controls-section');
  controlsSection.id = 'px-tool-help-controls';
  controlsSection.dataset.toolHelpTarget = 'controls';
  controlsSection.tabIndex = -1;
  const controlsHeading = el(document, 'h3', '', '操作');
  controlsHeading.id = 'px-tool-help-controls-title';
  controlsSection.setAttribute('aria-labelledby', controlsHeading.id);
  controlsSection.append(controlsHeading);
  const list = el(document, 'dl', 'px-tool-help__controls');
  (Array.isArray(guide.controls) ? guide.controls : []).forEach(({ action, detail }) => {
    const row = el(document, 'div', 'px-tool-help__control');
    row.append(el(document, 'dt', '', action || ''), el(document, 'dd', '', detail || ''));
    list.append(row);
  });
  controlsSection.append(list);
  host.append(controlsSection);

  const notesSection = el(document, 'section', 'px-tool-help__section px-tool-help__notes-section');
  notesSection.id = 'px-tool-help-notes';
  notesSection.dataset.toolHelpTarget = 'notes';
  notesSection.tabIndex = -1;
  const notesHeading = el(document, 'h3', '', '保存・ヒント');
  notesHeading.id = 'px-tool-help-notes-title';
  notesSection.setAttribute('aria-labelledby', notesHeading.id);
  notesSection.append(notesHeading);
  const notes = el(document, 'ul', 'px-tool-help__note-list');
  (Array.isArray(guide.notes) ? guide.notes : []).forEach((note) => notes.append(el(document, 'li', '', note)));
  notesSection.append(notes);
  host.append(notesSection);
}

function renderPicker(document, host, onChoose) {
  host.replaceChildren();
  host.append(el(document, 'p', 'px-tool-help__intro', '道具やゲームを選ぶと、使い方と操作を確認できます。'));
  const guideById = new Map(TOOL_GUIDES.filter((guide) => guide && guide.listed !== false).map((guide) => [guide.id, guide]));
  for (const category of PICKER_CATEGORIES) {
    const guidesInCategory = TOOL_GUIDES.filter((guide) => guideById.has(guide.id) && category.ids.includes(guide.id));
    if (!guidesInCategory.length) continue;
    const section = el(document, 'section', 'px-tool-help__picker-category');
    const heading = el(document, 'h3', 'px-tool-help__category-title', category.title);
    section.append(heading);
    const list = el(document, 'div', 'px-tool-help__guide-list');
    for (const guide of guidesInCategory) {
      const button = el(document, 'button', 'px-tool-help__guide-choice');
      button.type = 'button';
      const icon = guideIcon(document, guide, 'px-tool-help__choice-icon');
      if (icon) button.append(icon);
      const copy = el(document, 'span', 'px-tool-help__choice-copy');
      copy.append(el(document, 'strong', '', guide.title || '使い方を見る'));
      if (guide.intro) copy.append(el(document, 'span', '', guide.intro));
      button.append(copy, el(document, 'span', 'px-tool-help__choice-arrow', '›'));
      button.addEventListener('click', () => onChoose(guide));
      list.append(button);
    }
    section.append(list);
    host.append(section);
  }
}

/** Mount route-specific usage help without coupling it to a tool's editor state. */
export function mountToolHelp({ document = globalThis.document, window = globalThis.window, menu, onCloseMenu, returnFocus } = {}) {
  if (!document || !window || !menu || typeof getToolGuide !== 'function') return null;
  if (mountedDocuments.has(document)) return mountedDocuments.get(document);

  const hub = isToolsHubPath(window.location?.pathname);
  const routeGuide = hub ? null : getToolGuide({ pathname: window.location?.pathname || '/', search: window.location?.search || '' });
  if (!hub && !routeGuide) return null;

  addHelpStyles(document);
  const dialog = el(document, 'dialog', 'px-tool-help');
  dialog.id = 'px-tool-help-dialog';
  dialog.setAttribute('aria-labelledby', 'px-tool-help-title');
  const panel = el(document, 'div', 'px-tool-help__panel');
  const header = el(document, 'header', 'px-tool-help__head');
  const headingGroup = el(document, 'div', 'px-tool-help__heading');
  headingGroup.append(el(document, 'p', 'px-tool-help__eyebrow', hub ? '道具・ゲーム' : '使い方・操作'));
  const title = el(document, 'h2', '', hub ? 'ツールの使い方' : routeGuide.title);
  title.id = 'px-tool-help-title';
  headingGroup.append(title);
  const close = el(document, 'button', 'px-tool-help__close', '閉じる');
  close.type = 'button';
  close.setAttribute('aria-label', '使い方を閉じる');
  const back = el(document, 'button', 'px-tool-help__back', '一覧');
  back.type = 'button';
  back.setAttribute('aria-label', '一覧へ戻る');
  back.hidden = true;
  header.append(headingGroup, back, close);
  const sectionNav = el(document, 'nav', 'px-tool-help__section-nav');
  sectionNav.setAttribute('aria-label', '説明の項目へ移動');
  sectionNav.hidden = true;
  const content = el(document, 'div', 'px-tool-help__content');
  content.tabIndex = 0;
  content.setAttribute('role', 'region');
  content.setAttribute('aria-label', '使い方と操作の説明');
  const jumpSections = [
    { id: 'steps', title: 'はじめ方' },
    { id: 'controls', title: '操作' },
    { id: 'notes', title: '保存・ヒント' }
  ];
  for (const item of jumpSections) {
    const button = el(document, 'button', 'px-tool-help__section-jump');
    button.type = 'button';
    if (item.id === 'notes') {
      button.setAttribute('aria-label', item.title);
      button.append(document.createTextNode('保存・'));
      button.append(el(document, 'span', 'px-tool-help__jump-word', 'ヒント'));
    } else {
      button.textContent = item.title;
    }
    button.dataset.toolHelpSection = item.id;
    button.setAttribute('aria-controls', `px-tool-help-${item.id}`);
    button.addEventListener('click', () => {
      const section = content.querySelector(`#px-tool-help-${item.id}`);
      if (!section) return;
      const containerTop = content.getBoundingClientRect().top;
      const sectionTop = section.getBoundingClientRect().top;
      content.scrollTop += sectionTop - containerTop - 8;
      section.focus({ preventScroll: true });
    });
    sectionNav.append(button);
  }
  panel.append(header, sectionNav, content);
  dialog.append(panel);
  document.body.append(dialog);

  let opener = null;
  const showGuide = (guide) => {
    title.textContent = guide.title || '使い方・操作';
    back.hidden = !hub;
    sectionNav.hidden = false;
    renderGuide(document, content, guide);
    content.scrollTop = 0;
    if (dialog.open && hub) back.focus({ preventScroll: true });
  };
  const showPicker = () => {
    const shouldRestoreFocus = dialog.open;
    title.textContent = 'ツールの使い方';
    back.hidden = true;
    sectionNav.hidden = true;
    renderPicker(document, content, showGuide);
    content.scrollTop = 0;
    if (shouldRestoreFocus) content.querySelector('.px-tool-help__guide-choice')?.focus({ preventScroll: true });
  };
  const open = (trigger, chooseGuide = routeGuide) => {
    opener = trigger || returnFocus || document.activeElement;
    if (!menu.hidden) onCloseMenu?.();
    if (chooseGuide) showGuide(chooseGuide);
    else showPicker();
    if (!dialog.open) dialog.showModal();
    close.focus({ preventScroll: true });
  };
  const closeDialog = () => { if (dialog.open) dialog.close(); };
  close.addEventListener('click', closeDialog);
  back.addEventListener('click', showPicker);
  dialog.addEventListener('cancel', () => { /* Keep native Escape behavior. */ });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || event.detail === 0) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
  });
  dialog.addEventListener('close', () => {
    const target = opener?.isConnected ? opener : returnFocus;
    opener = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', (event) => {
    if (!dialog.open) return;
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll(
        'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])'
      )].filter((node) => {
        if (node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true' || node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
        if (node.getClientRects().length === 0) return false;
        const style = window.getComputedStyle?.(node);
        return style?.display !== 'none' && style?.visibility !== 'hidden';
      });
      const first = focusable[0]; const last = focusable.at(-1); const active = document.activeElement;
      if (first && (!dialog.contains(active)
          || (event.shiftKey && active === first)
          || (!event.shiftKey && active === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    // Stop bubbling before page-level shortcuts while preserving key defaults
    // at the focused target (including PageDown and Space/details).
    event.stopImmediatePropagation();
  });

  if (routeGuide || hub) {
    const menuButton = el(document, 'button', 'px-tool-help__menu-button', hub ? 'ツールの使い方' : '使い方・操作');
    menuButton.type = 'button';
    menuButton.setAttribute('data-tool-help-open', '');
    menuButton.setAttribute('aria-haspopup', 'dialog');
    menuButton.setAttribute('aria-controls', dialog.id);
    const menuHelpGroup = el(document, 'div', 'site-menu__group px-tool-help__menu-group');
    menuHelpGroup.append(el(document, 'span', 'site-menu__label', '使い方'));
    menuHelpGroup.append(menuButton);
    menu.querySelector('.site-menu__nav')?.prepend(menuHelpGroup);
    menuButton.addEventListener('click', () => open(returnFocus || menuButton, hub ? null : routeGuide));
  }

  let hubButton = null;
  if (hub) {
    const hubHead = document.querySelector('.tool-shell__head');
    if (hubHead && !hubHead.querySelector('[data-tool-help-hub]')) {
      hubButton = el(document, 'button', 'px-tool-help__hub-button', 'ツールの使い方');
      hubButton.type = 'button';
      hubButton.setAttribute('data-tool-help-hub', '');
      hubButton.setAttribute('aria-haspopup', 'dialog');
      hubButton.setAttribute('aria-controls', dialog.id);
      hubHead.append(hubButton);
      hubButton.addEventListener('click', () => open(hubButton, null));
    }
  }

  const controller = { dialog, open, close: closeDialog, showPicker, showGuide };
  mountedDocuments.set(document, controller);
  return controller;
}
