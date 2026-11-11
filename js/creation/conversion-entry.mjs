import { createConversionStartupView } from './conversion-startup-view.mjs?rev=20261105-video-size-1';
import { isFreshToolStartRequest } from '../tool-start-routes.mjs?rev=20261110-output-result-1';
import { notifyToolEntryReady } from '../tool-offerwall-entry.mjs?rev=20261110-output-result-1';

/** Output startup owns visibility; conversion engines continue to own media and storage. */
const query = new URLSearchParams(location.search);
const main = document.getElementById('main');
const view = createConversionStartupView(document);
// Only the fresh, empty output entry can use the Offerwall. Restored or parameterized
// output work stays denied; eligibility is signalled only after full converter startup.
const entryHistoryState = history.state;
const freshConverterEntry = location.pathname === '/tools/start/convert/'
  && isFreshToolStartRequest(location.href, entryHistoryState);
if (!freshConverterEntry) {
  try { window.__PIXIEED_OFFERWALL_ENTRY__?.retire?.(); } catch { /* Optional site policy. */ }
}
let result;
try {
  const { runConversionStartup } = await import('./conversion-startup.mjs?rev=20261105-video-size-1');
  result = await runConversionStartup({
    view,
    native: window.top !== window.self,
    async loadEngine() {
      for (const link of document.querySelectorAll('link[data-smart-style="conversion"],link[href*="conversion-startup.css"]')) {
        if (!link.sheet) throw new Error('画面のスタイルを読み込めませんでした。通信を確認して再読み込みしてください。');
      }
      const template = document.getElementById('output-engine-template');
      if (!template) throw new Error('出力画面の構成を確認できませんでした。再読み込みしてください。');
      main.replaceChildren(template.content.cloneNode(true)); template.remove();
      if (query.has('id') || query.has('file')) {
        const { sharedOutputRequest, mountSharedOutput } = await import('./output-receive.mjs?rev=20261105-download-name-1');
        await mountSharedOutput(sharedOutputRequest(location.search));
      } else if (query.get('mode') === 'convert') {
        const { mountConversionPage } = await import('./conversion-page.mjs?rev=20261105-video-size-1');
        mountConversionPage();
      } else {
        const { outputPageReady } = await import('./output-page.mjs?rev=20261110-output-result-1');
        await outputPageReady;
      }
      const failure = main.querySelector('[role="alert"]');
      if (failure) throw new Error(failure.textContent || '端末内の出力を開けませんでした。');
    },
    loadText: () => import('./text-tools.mjs?rev=20261110-output-result-1'),
    loadIntent: () => import('./conversion-intent.mjs?rev=20261028-discovery-1'),
    loadUI: () => import('./conversion-smart-ui.mjs?rev=20261110-output-layout-7'),
    onWarning(error) { console.warn('Optional conversion module unavailable; media conversion remains available.', error); },
  });
} catch (error) { view.fail(error); }

// Advertising stays optional and starts only after a usable workspace is exposed.
if (result?.status === 'ready') {
  // Do not let the provider load until the converter startup view has succeeded.
  notifyToolEntryReady(freshConverterEntry);
  void import('../ads/conversion-display-ad.mjs?rev=20261110-output-result-1')
    .then(({ mountConversionDisplayAd }) => mountConversionDisplayAd({ entryHistoryState }))
    .catch(() => { /* Conversion and download remain available without advertising. */ });
} else notifyToolEntryReady(false);
