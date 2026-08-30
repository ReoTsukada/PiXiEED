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

  function hasPixieedrawSignedInAccount() {
    return Boolean(accountState.isLoggedIn && accountState.userId && !accountState.isAnonymous);
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

  // G3-B leaves generic support surfaces intact while removing the former
  // advertising-off entitlement UI. Keep this bridge inert until G4 removes
  // the legacy shared-project quota plumbing that still calls it.
  function syncPixieedSupportBenefitUi() {
    return undefined;
  }

  function getMaxSharedProjectCount() {
    return hasPixieedrawAdFreeSupport()
      ? SHARED_PROJECT_LIMIT_AD_FREE
      : SHARED_PROJECT_LIMIT_DEFAULT;
  }

  return Object.freeze({
    hasPixieedrawAdFreeSupport,
    hasPixieedrawSignedInAccount,
    getSharedProjectMemberLimitForCurrentPlan,
    getMultiGuestLimitForCurrentPlan,
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
