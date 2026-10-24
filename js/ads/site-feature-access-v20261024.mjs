/**
 * Permanent free-access compatibility service.
 *
 * Legacy callers may continue to ask for a reward, subscribe to access state,
 * or mount the old reward widget. Those requests have no side effects and
 * never create or claim an advertising receipt.
 */
const STATE = Object.freeze({
  policyEnabled: false,
  active: false,
  expiresAt: null,
  remainingMs: 0,
  grantedAt: null,
  receiptCount: 0
});

export function getSiteRewardPresentation() {
  return Object.freeze({
    openPeriod: false,
    title: 'すべての制作機能を無料で利用できます',
    message: '制作機能の個別解放や期限付き特典はありません。',
    intro: '追加機能のための広告視聴は不要です。各機能の技術上の上限やブラウザーの制約は適用されます。',
    primaryAction: '制作を続ける'
  });
}

export function createSiteRewardService(_legacyOptions = {}) {
  let disposed = false;
  return Object.freeze({
    hasSiteReward: () => false,
    requireSiteReward: (_feature) => true,
    isSiteRewardPolicyEnabled: () => false,
    getSiteRewardState: () => STATE,
    subscribeSiteReward(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      try { listener(STATE); } catch { /* Consumers are isolated. */ }
      return () => {};
    },
    mountSiteRewardUI: () => null,
    requestSiteReward: (_feature) => true,
    dispose() { disposed = true; },
    get disposed() { return disposed; }
  });
}

const siteReward = createSiteRewardService();
export const hasSiteReward = () => siteReward.hasSiteReward();
export const requireSiteReward = feature => siteReward.requireSiteReward(feature);
export const isSiteRewardPolicyEnabled = () => siteReward.isSiteRewardPolicyEnabled();
export const getSiteRewardState = () => siteReward.getSiteRewardState();
export const subscribeSiteReward = listener => siteReward.subscribeSiteReward(listener);
export const mountSiteRewardUI = () => siteReward.mountSiteRewardUI();
export const requestSiteReward = feature => siteReward.requestSiteReward(feature);
