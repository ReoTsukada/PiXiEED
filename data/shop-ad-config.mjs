/** Shop-local opt-in to the publisher's existing verified responsive Display unit. */
import { ordinaryAdConfig } from './ordinary-ad-config.mjs?rev=20261024-ordinary-ad-config-1';

export const SHOP_AD_MARKER = 'catalog-v1';
export const shopAdConfig = Object.freeze({
  enabled: true,
  marker: SHOP_AD_MARKER,
  // Reuse the existing verified inventory without changing its feed placement.
  unit: Object.freeze({ ...ordinaryAdConfig.feed.unit }),
});
