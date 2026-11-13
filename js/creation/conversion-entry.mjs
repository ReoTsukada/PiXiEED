import { createConversionStartupView } from './conversion-startup-view.mjs?rev=20261105-video-size-1';
import { prepareOutputEntry, outputEntrySearch, isOutputEntryPath } from './output-entry-context.mjs?rev=20261111-output-offerwall-1';
import { notifyToolEntryReady } from '../tool-offerwall-entry.mjs?rev=20261111-output-offerwall-1';

/** Output startup owns visibility; conversion engines continue to own media and storage. */
let entryError;
try { prepareOutputEntry(window); } catch (error) { entryError = error; }
const query = new URLSearchParams(outputEntrySearch());
const main = document.getElementById('main');
const view = createConversionStartupView(document);
// The real output workspace, including restored and handed-off work, owns readiness.
const entryHistoryState = history.state;
const outputEntry = isOutputEntryPath(location.pathname);
let result;
try {
  if (entryError) throw entryError;
  const { runConversionStartup } = await import('./conversion-startup.mjs?rev=20261111-output-offerwall-1');
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
        const { sharedOutputRequest, mountSharedOutput } = await import('./output-receive.mjs?rev=20261113-canvas1028-shared-2');
        await mountSharedOutput(sharedOutputRequest(outputEntrySearch()));
      } else if (query.get('mode') === 'convert') {
        const { mountConversionPage } = await import('./conversion-page.mjs?rev=20261111-output-offerwall-1');
        mountConversionPage();
      } else {
        const { outputPageReady } = await import('./output-page.mjs?rev=20261113-canvas1028-shared-2');
        await outputPageReady;
      }
      const failure = main.querySelector('[role="alert"]');
      if (failure) throw new Error(failure.textContent || '端末内の出力を開けませんでした。');
    },
    loadText: () => import('./text-tools.mjs?rev=20261111-output-offerwall-1'),
    loadIntent: () => import('./conversion-intent.mjs?rev=20261028-discovery-1'),
    loadUI: () => import('./conversion-smart-ui.mjs?rev=20261111-output-offerwall-1'),
    onWarning(error) { console.warn('Optional conversion module unavailable; media conversion remains available.', error); },
  });
} catch (error) { view.fail(error); }

// Advertising stays optional and starts only after a usable workspace is exposed.
if (result?.status === 'ready') {
  // Do not let the provider load until the converter startup view has succeeded.
  const recoveryReady = await Promise.resolve(result.entryRecoveryReady ?? true).catch(() => false);
  notifyToolEntryReady(outputEntry && recoveryReady, { output: true });
  if (recoveryReady) void import('../ads/conversion-display-ad.mjs?rev=20261111-output-offerwall-1')
    .then(({ mountConversionDisplayAd }) => mountConversionDisplayAd({ entryHistoryState }))
    .catch(() => { /* Conversion and download remain available without advertising. */ });
} else notifyToolEntryReady(false);
