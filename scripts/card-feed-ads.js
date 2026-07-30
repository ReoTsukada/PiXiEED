(function () {
  'use strict';

  if (window.PiXiEEDCardFeedAds) return;

  const ROWS_PER_AD = 3;
  const COMMON_SLOT = '2141591954';
  const AD_OUTCOME_TIMEOUT_MS = 12000;
  const SHARED_AD_PRIORITY_TIMEOUT_MS = 1800;

  function gridColumnCount(grid) {
    if (!(grid instanceof HTMLElement)) return 1;
    const columns = String(window.getComputedStyle(grid).gridTemplateColumns || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return Math.max(1, columns.length);
  }

  // Card collections use this instead of a fixed item count.  A placement is
  // inserted after every third *rendered row*, whether the viewport currently
  // has two, three, or more card columns.
  function shouldInsertAfterRows(grid, renderedCardCount, rows = ROWS_PER_AD) {
    const count = Number(renderedCardCount) || 0;
    const rowCount = Math.max(1, Number(rows) || ROWS_PER_AD);
    return count > 0 && count % (gridColumnCount(grid) * rowCount) === 0;
  }

  function reserve(wrapper, height) {
    if (!(wrapper instanceof HTMLElement)) return wrapper;
    wrapper.dataset.pixieedReserveAdSpace = 'true';
    if (height) wrapper.style.setProperty('--pixieed-card-feed-ad-height', height);
    return wrapper;
  }

  function hasAdOutcome(slot) {
    if (!(slot instanceof HTMLElement)) return true;
    return Boolean(slot.getAttribute('data-ad-status')
      || slot.getAttribute('data-adsbygoogle-status') === 'done'
      || slot.dataset.adsRequestState === 'push-failed');
  }

  function waitForSharedAdPriority() {
    return new Promise((resolve) => {
      if (window.matchMedia?.('(orientation: landscape)').matches) {
        resolve();
        return;
      }
      const finish = () => {
        observer?.disconnect();
        window.clearTimeout(timeout);
        resolve();
      };
      const sharedSlot = () => document.querySelector('.pixieed-shared-top-ad ins.adsbygoogle');
      const ready = () => {
        const slot = sharedSlot();
        return slot instanceof HTMLElement && hasAdOutcome(slot);
      };
      if (ready()) {
        resolve();
        return;
      }
      const observer = new MutationObserver(() => {
        if (ready()) finish();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'],
      });
      const timeout = window.setTimeout(finish, SHARED_AD_PRIORITY_TIMEOUT_MS);
    });
  }

  // Keep the catalog readable and prevent a long list from queueing every ad
  // on first paint: reveal three rendered rows, wait for that shared ad's
  // response (including an unfilled response), then reveal the next rows.
  function waitForAdOutcome(wrapper, requestAd) {
    return new Promise((resolve) => {
      const slot = wrapper?.querySelector?.('ins.adsbygoogle, ins[data-ad-slot]');
      if (!(slot instanceof HTMLElement) || hasAdOutcome(slot)) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        window.clearTimeout(timeout);
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (hasAdOutcome(slot)) finish();
      });
      observer.observe(slot, {
        attributes: true,
        attributeFilter: ['data-ad-status', 'data-adsbygoogle-status', 'data-ads-request-state'],
      });
      const timeout = window.setTimeout(() => {
        wrapper.dataset.pixieedAdOutcome = 'timeout';
        finish();
      }, AD_OUTCOME_TIMEOUT_MS);
      void waitForSharedAdPriority().then(() => {
        try {
          requestAd?.(wrapper);
        } catch (_error) {
          wrapper.dataset.pixieedAdOutcome = 'request-failed';
          finish();
        }
      });
      if (hasAdOutcome(slot)) finish();
    });
  }

  async function renderProgressively({ grid, cards = [], createAd, requestAd, isCurrent = () => true } = {}) {
    if (!(grid instanceof HTMLElement)) return;
    const items = Array.isArray(cards) ? cards.filter((card) => card instanceof HTMLElement) : [];
    const batchSize = Math.max(1, gridColumnCount(grid) * ROWS_PER_AD);
    grid.replaceChildren();
    for (let index = 0; index < items.length && isCurrent(); index += batchSize) {
      grid.append(...items.slice(index, index + batchSize));
      if (index + batchSize >= items.length || !isCurrent()) break;
      const ad = createAd?.();
      if (!(ad instanceof HTMLElement)) continue;
      grid.appendChild(ad);
      await waitForAdOutcome(ad, requestAd);
    }
  }

  window.PiXiEEDCardFeedAds = Object.freeze({
    ROWS_PER_AD,
    COMMON_SLOT,
    gridColumnCount,
    shouldInsertAfterRows,
    reserve,
    waitForAdOutcome,
    waitForSharedAdPriority,
    renderProgressively,
  });
})();
