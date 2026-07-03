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
    if (window.__PIXIEED_ADS_DISABLED__) {
      return true;
    }
    const adFreeState = window.pixieedAdFree?.state || null;
    if (!adFreeState || adFreeState.isActive !== true) {
      return false;
    }
    const entitlements = adFreeState.activeEntitlements;
    if (!entitlements || typeof entitlements !== 'object') {
      return true;
    }
    return Boolean(entitlements.pixiedraw_ad_free || entitlements.browser_ad_free);
  }

  function hasPixieedrawMultiCanvasSupport() {
    return hasPixieedrawAdFreeSupport();
  }

  function hasPixieedrawSignedInAccount() {
    return Boolean(accountState.isLoggedIn && accountState.userId && !accountState.isAnonymous);
  }

  function getLocalViewportCanvasAccountLimit() {
    if (hasPixieedrawMultiCanvasSupport()) {
      return LOCAL_VIEWPORT_CANVAS_STANDARD_MAX_COUNT;
    }
    if (hasPixieedrawSignedInAccount()) {
      return LOCAL_VIEWPORT_CANVAS_SIGNED_IN_MAX_COUNT;
    }
    return 0;
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
    const { ownedProjectCount, effectiveLimit } = getSharedProjectOwnershipStatus();
    const usageLabel = buildSharedProjectUsageLabel({ ownedProjectCount, effectiveLimit });
    const supporterUsageLabel = buildSharedProjectUsageLabel({
      ownedProjectCount,
      effectiveLimit: SHARED_PROJECT_LIMIT_AD_FREE,
    });
    const memberLimit = getSharedProjectMemberLimitForCurrentPlan();
    if (adFreeState?.isActive === true || hasPixieedrawAdFreeSupport()) {
      const days = getPixieedAdFreeRemainingDays(adFreeState);
      if (days === null) {
        return localizeText(
          `サポーター特典（500円）が適用中です。広告非表示、共有プロジェクト作成枠 ${usageLabel}、共同編集最大 ${memberLimit} 人、マルチキャンバスは追加3つ（メイン含め最大4つ）まで利用できます。`,
          `Supporter benefits (500 yen) are active. Ads are hidden, shared project slots are ${usageLabel}, shared editing supports up to ${memberLimit} people, and Multi Canvas supports 3 extra canvases (4 total including the main canvas).`
        );
      }
      return localizeText(
        `サポーター特典（500円）が適用中です。広告非表示、共有プロジェクト作成枠 ${usageLabel}、共同編集最大 ${memberLimit} 人、マルチキャンバス追加3つまで利用できます。残り ${days} 日です。`,
        `Supporter benefits (500 yen) are active. Ads are hidden, shared project slots are ${usageLabel}, shared editing supports up to ${memberLimit} people, and Multi Canvas supports 3 extra canvases. ${days} days remaining.`
      );
    }
    return localizeText(
      `通常ログインでは共有プロジェクト1件、共同編集最大2人、マルチキャンバス追加1つまで利用できます。サポーター特典は500円で、共有プロジェクト4件、共同編集最大4人、マルチキャンバス追加3つ、広告非表示になります。サポーター枠 ${supporterUsageLabel}。`,
      `With a standard signed-in account, you get 1 shared project, shared editing for up to 2 people, and 1 extra Multi Canvas. Supporter benefits are 500 yen and unlock 4 shared projects, shared editing for up to 4 people, 3 extra Multi Canvases, and ad removal. Supporter slots: ${supporterUsageLabel}.`
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
    const active = adFreeState?.isActive === true || hasPixieedrawAdFreeSupport();
    if (dom.controls.multiSupportPurchase instanceof HTMLElement) {
      dom.controls.multiSupportPurchase.textContent = active
        ? localizeText('特典を確認', 'View Benefits')
        : localizeText('サポーター特典を見る', 'View Supporter Benefits');
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
