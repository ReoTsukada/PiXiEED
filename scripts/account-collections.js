(function () {
  'use strict';

  const PREVIEW_LIMIT = 4;

  async function copyLink(url) {
    const absoluteUrl = new URL(url, window.location.href).href;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(absoluteUrl);
      return absoluteUrl;
    }
    const input = document.createElement('textarea');
    input.value = absoluteUrl;
    input.readOnly = true;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('copy-failed');
    return absoluteUrl;
  }

  window.PiXiEEDAccountShare = Object.freeze({ copyLink });

  document.querySelectorAll('[data-account-collection]').forEach((section) => {
    const list = section.querySelector('[data-account-collection-list]');
    const toggle = section.querySelector('[data-account-collection-toggle]');
    if (!list || !toggle) return;

    let expanded = false;
    const update = () => {
      const itemCount = list.children.length;
      const canExpand = itemCount > PREVIEW_LIMIT;
      toggle.hidden = !canExpand;
      toggle.setAttribute('aria-expanded', String(canExpand && expanded));
      toggle.textContent = expanded ? '表示を減らす' : '全て見る';
      list.classList.toggle('is-collapsed', canExpand && !expanded);
    };

    toggle.addEventListener('click', () => {
      expanded = !expanded;
      update();
      if (!expanded) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    new MutationObserver(update).observe(list, { childList: true });
    update();
  });
})();
