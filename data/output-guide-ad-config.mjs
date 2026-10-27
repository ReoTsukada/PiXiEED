import { ordinaryAdConfig } from './ordinary-ad-config.mjs?rev=20261024-ordinary-ad-config-1';

/** Reuse the existing responsive Display unit, not a rewarded unit.
 * Enable only after checking account serving, CMP/Auto Ads and integration tests.
 * This switch owns only /output/ and never changes the conversion workspace.
 */
export const outputGuideAdConfig = Object.freeze({
  enabled: false,
  unit: ordinaryAdConfig.feed.unit,
});
