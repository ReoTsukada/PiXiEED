import '/js/adsense-offerwall-policy.js';
import { getAdsenseLoader } from '/js/display-ads.mjs';
import { projectManagerAdConfig } from '/data/project-gallery-ad-config.mjs';
export function mount(host) {
  const { enabled, unit } = projectManagerAdConfig;
  if (!enabled || !unit.verifiedActive || unit.placement !== 'inline'
    || typeof window.googlefc?.controlledMessagingFunction !== 'function'
    || window.__PIXIEED_OFFERWALL_ENTRY__?.isEligible?.() !== false) return;
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.cssText = 'display:inline-block;width:300px;height:100px';
  ins.dataset.adClient = unit.client;
  ins.dataset.adSlot = unit.slot;
  host.append(ins);
  host.hidden = false;
  const loader = getAdsenseLoader(document, window, unit.client);
  if (loader.failed) { host.hidden = true; return; }
  loader.errors.add(() => { host.hidden = true; });
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}
