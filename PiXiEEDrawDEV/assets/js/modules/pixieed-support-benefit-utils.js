(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixieedSupportBenefitUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function hasPixieedrawAdFreeSupport() {
    return true;
  }

  function hasPixieedrawMultiCanvasSupport() {
    return true;
  }

  function hasPixieedrawSignedInAccount() {
    return Boolean(accountState.isLoggedIn && accountState.userId && !accountState.isAnonymous);
  }

  function getLocalViewportCanvasAccountLimit() {
    return LOCAL_VIEWPORT_CANVAS_STANDARD_MAX_COUNT;
  }

  function getSharedProjectMemberLimitForCurrentPlan() {
    return hasPixieedrawAdFreeSupport()
      ? SHARED_PROJECT_MEMBER_LIMIT_AD_FREE
      : SHARED_PROJECT_MEMBER_LIMIT_DEFAULT;
  }

  function getMultiGuestLimitForCurrentPlan() {
    return Math.max(
      MULTI_GUEST_LIMIT_MIN,
      getSharedProjectMemberLimitForCurrentPlan() - 1
    );
  }

  function getPixieedAdFreeStateSnapshot() {
    return window.pixieedAdFree?.state || null;
  }

  function getPixieedAdFreeRemainingDays(adFreeState = getPixieedAdFreeStateSnapshot()) {
    const raw = typeof adFreeState?.expiresAt === 'string' ? adFreeState.expiresAt : '';
    if (!raw) {
      return null;
    }
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) {
      return null;
    }
    return Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000));
  }

  function buildPixieedSupportStatusText(adFreeState = getPixieedAdFreeStateSnapshot()) {
    return localizeText(
      '広告非表示が有効です。',
      'Ads are hidden.'
    );
  }

  function syncPixieedSupportBenefitUi(adFreeState = getPixieedAdFreeStateSnapshot()) {
    const message = buildPixieedSupportStatusText(adFreeState);
    const status = document.getElementById('pixieedAdFreeStatus');
    if (status instanceof HTMLElement && !window.pixieedAdFree?.state?.lastError) {
      status.textContent = message;
    }
    if (dom.controls.multiSupportStatus instanceof HTMLElement) {
      dom.controls.multiSupportStatus.textContent = message;
    }
    if (dom.controls.multiSupportPurchase instanceof HTMLElement) {
      dom.controls.multiSupportPurchase.textContent = localizeText('利用可能', 'Available');
    }
  }

  function getMaxSharedProjectCount() {
    return hasPixieedrawAdFreeSupport()
      ? SHARED_PROJECT_LIMIT_AD_FREE
      : SHARED_PROJECT_LIMIT_DEFAULT;
  }

  return Object.freeze({
    hasPixieedrawAdFreeSupport,
    hasPixieedrawMultiCanvasSupport,
    hasPixieedrawSignedInAccount,
    getLocalViewportCanvasAccountLimit,
    getSharedProjectMemberLimitForCurrentPlan,
    getMultiGuestLimitForCurrentPlan,
    getPixieedAdFreeStateSnapshot,
    getPixieedAdFreeRemainingDays,
    buildPixieedSupportStatusText,
    syncPixieedSupportBenefitUi,
    getMaxSharedProjectCount,
  });
      }
    })(scope);
  }

  root.pixieedSupportBenefitUtils = Object.freeze({
    createPixieedSupportBenefitUtils,
  });
})();
