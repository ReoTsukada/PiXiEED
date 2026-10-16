import {
  getSiteRewardState,
  mountSiteRewardUI,
  requestSiteReward,
  subscribeSiteReward
} from './ads/site-reward.mjs?rev=20261016-header-benefits-2';

const BUTTON_SELECTOR = '[data-header-reward]';
let unsubscribe = null;
let button = null;
let restoreMarker = null;
let coordinationBound = false;
let dialogObserver = null;
let presentationObserver = null;
let presentationQueued = false;
let acceptGuardBound = false;
let periodKeyboardBound = false;

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function render(state = getSiteRewardState()) {
  if (!button) return;
  const openPeriod = !state.policyEnabled;
  const label = button.querySelector('[data-header-reward-label]');
  const text = openPeriod ? '開放中' : state.active ? `特典 ${formatRemaining(state.remainingMs)}` : '特典';
  if (label) label.textContent = text;
  button.setAttribute('aria-label', openPeriod
    ? '特典。期間限定・全機能開放中。機能制限なし・広告視聴不要。特典対象の機能を広告視聴なしで利用できます。詳細を開く'
    : state.active
    ? `特典。リワード有効、残り${Math.ceil(state.remainingMs / 60_000)}分。詳細を開く`
    : '特典。任意のリワード広告について確認する');
  button.dataset.active = String(state.active);
  button.title = openPeriod
    ? '期間限定・全機能開放中。機能制限なし・広告視聴不要'
    : state.active ? `リワード有効、残り ${formatRemaining(state.remainingMs)}` : '任意のリワード広告について';
  button.dataset.openPeriod = String(openPeriod);
}

function applyOpenPeriodPresentation() {
  const state = getSiteRewardState();
  if (state.policyEnabled) return;
  const root = document.querySelector('.pixieed-site-reward');
  const dialog = root?.querySelector('[data-dialog]');
  if (!root || !dialog) return;
  if (root.dataset.openPeriod !== 'true') root.dataset.openPeriod = 'true';
  const descriptionIds = 'site-reward-intro';
  if (dialog.getAttribute('aria-describedby') !== descriptionIds) dialog.setAttribute('aria-describedby', descriptionIds);
  const card = root.querySelector('[data-card], .pixieed-site-reward-card');
  if (card && card.getAttribute('aria-describedby') !== descriptionIds) card.setAttribute('aria-describedby', descriptionIds);
  const setText = (selector, text) => {
    const node = root.querySelector(selector);
    if (node && node.textContent !== text) node.textContent = text;
  };
  setText('#site-reward-title', '期間限定・全機能開放中');
  setText('[data-message]', '機能制限なし・広告視聴不要');
  setText('#site-reward-intro', '特典対象の機能を広告視聴なしで利用できます。広告が配信されない場合も、通常どおり利用できます。安全な最大値など各機能の技術上の上限は引き続き適用されます。');
  setText('[data-cancel]', '制作を続ける');
  setText('[data-requested]', '期間限定のご案内');
  for (const selector of ['[data-remaining]', '[data-metrics]', '[data-details]', '[data-retention]', '[data-notice]', '[data-context]', '[data-accept]']) {
    const node = root.querySelector(selector);
    if (node && !node.hidden) node.hidden = true;
  }
  setText('[data-feedback]', '');
  const accept = root.querySelector('[data-accept]');
  if (accept && !accept.disabled) accept.disabled = true;
}

function queueOpenPeriodPresentation() {
  if (presentationQueued) return;
  presentationQueued = true;
  queueMicrotask(() => {
    presentationQueued = false;
    applyOpenPeriodPresentation();
  });
}

function restoreButton() {
  if (!button || !restoreMarker?.parentNode) return;
  restoreMarker.parentNode.insertBefore(button, restoreMarker.nextSibling);
  restoreMarker.remove();
  restoreMarker = null;
}

function moveButtonToExpandedEmbed(section) {
  const controls = section?.querySelector('.tool-embed__controls');
  const expand = controls?.querySelector('[data-embed-expand]');
  if (!button || !controls || !expand || restoreMarker) return;
  restoreMarker = document.createComment('header-reward-position');
  button.before(restoreMarker);
  controls.insertBefore(button, expand);
}

function bindButton() {
  const header = document.querySelector('.px-site-header');
  const inner = header?.querySelector('.px-header-inner') || header;
  if (!inner) return false;
  button = inner.querySelector(BUTTON_SELECTOR);
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'px-header-reward';
    button.dataset.headerReward = '';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'site-reward-dialog');
    button.innerHTML = '<span data-header-reward-label>特典</span>';
    const menu = inner.querySelector('[data-menu-toggle]');
    if (menu) inner.insertBefore(button, menu);
    else inner.append(button);
    button.addEventListener('click', () => {
      mountSiteRewardUI();
      const expanded = document.querySelector('.tool-embed--expanded');
      if (expanded) document.dispatchEvent(new CustomEvent('pixieed:tool-embed-reward-modal', { detail: { expanded: true } }));
      requestSiteReward('site');
      applyOpenPeriodPresentation();
    });
  }
  return true;
}

export function mountSiteHeaderBenefits() {
  if (typeof document === 'undefined' || typeof window === 'undefined' || document.body?.hasAttribute('data-admin-page')) return null;
  if (window.top !== window.self) {
    document.body?.setAttribute('data-header-reward-embedded', '');
    return null;
  }
  if (!bindButton()) return null;
  const rewardRoot = mountSiteRewardUI();
  rewardRoot?.setAttribute('data-header-entry-active', '');
  const dialog = rewardRoot?.querySelector('[data-dialog]');
  if (dialog && !dialog.id) dialog.id = 'site-reward-dialog';
  applyOpenPeriodPresentation();
  if (dialog && typeof MutationObserver === 'function' && !presentationObserver) {
    presentationObserver = new MutationObserver(queueOpenPeriodPresentation);
    presentationObserver.observe(dialog, { subtree: true, childList: true, characterData: true, attributes: true });
  }
  if (!acceptGuardBound) {
    acceptGuardBound = true;
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('[data-accept]') || getSiteRewardState().policyEnabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      applyOpenPeriodPresentation();
    }, true);
  }
  if (!periodKeyboardBound) {
    periodKeyboardBound = true;
    document.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || getSiteRewardState().policyEnabled) return;
      const dialog = document.querySelector('[data-dialog]:not([hidden])');
      const cancel = dialog?.querySelector('[data-cancel]');
      if (!dialog || !cancel || cancel.hidden || cancel.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel.focus();
    }, true);
  }
  button?.setAttribute('aria-controls', 'site-reward-dialog');
  if (dialog && typeof MutationObserver === 'function' && !dialogObserver) {
    let wasHidden = dialog.hidden;
    dialogObserver = new MutationObserver(() => {
      if (dialog.hidden === wasHidden) return;
      wasHidden = dialog.hidden;
      document.dispatchEvent(new CustomEvent(wasHidden ? 'pixieed:site-reward-close' : 'pixieed:site-reward-open'));
    });
    dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['hidden'] });
  }
  if (!unsubscribe) unsubscribe = subscribeSiteReward(render);
  render();
  if (coordinationBound) return button;
  coordinationBound = true;
  document.addEventListener('pixieed:tool-embed-expanded', event => {
    if (event.detail?.expanded) moveButtonToExpandedEmbed(event.detail.section);
    else restoreButton();
  });
  document.addEventListener('pixieed:site-reward-open', () => {
    const expanded = document.querySelector('.tool-embed--expanded');
    if (expanded) document.dispatchEvent(new CustomEvent('pixieed:tool-embed-reward-modal', { detail: { expanded: true } }));
  });
  document.addEventListener('pixieed:site-reward-close', () => {
    const expanded = document.querySelector('.tool-embed--expanded');
    if (expanded) document.dispatchEvent(new CustomEvent('pixieed:tool-embed-reward-modal', { detail: { expanded: false } }));
  });
  return button;
}

if (typeof document !== 'undefined') {
  const boot = () => { mountSiteHeaderBenefits(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
