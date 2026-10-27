import { displayAdConfig } from './site-config.js?rev=20261008-map-detail-1';

/** Reuse the public tools page's ordinary Display unit and publisher setting.
 * This switch owns only /output/ and never changes the conversion workspace.
 * Account-level serving, consent and Auto Ads settings remain with AdSense.
 * Set enabled to false to stop this placement without affecting free tools.
 */
export const outputGuideAdConfig = Object.freeze({
  enabled: true,
  unit: Object.freeze({
    client: displayAdConfig.client,
    slot: displayAdConfig.slots.tools,
    format: 'display',
    placement: 'inline',
    size: 'responsive',
    verifiedActive: true,
  }),
});
