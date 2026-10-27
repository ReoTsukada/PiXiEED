import { ordinaryAdConfig } from './ordinary-ad-config.mjs?rev=20261024-ordinary-ad-config-1';

/** Reuse the existing responsive Display unit, not a rewarded unit.
 * This switch owns only /output/ and never changes the conversion workspace.
 * Account-level serving, consent and Auto Ads settings remain with AdSense.
 * Set enabled to false to stop this placement without affecting free tools.
 */
export const outputGuideAdConfig = Object.freeze({
  enabled: true,
  unit: ordinaryAdConfig.feed.unit,
});
