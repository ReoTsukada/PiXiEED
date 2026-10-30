/** All editor handoffs and local conversions share one output destination. */
const query = new URLSearchParams(location.search);
// This converter uses ordinary page advertising, not an entry gate. CMP consent is untouched.
try { window.__PIXIEED_OFFERWALL_ENTRY__?.retire?.(); } catch { /* Optional site policy. */ }
try {
  if (query.has('id') || query.has('file')) {
    const { sharedOutputRequest, mountSharedOutput } = await import('./output-receive.mjs?rev=20261028-unified-output-1');
    await mountSharedOutput(sharedOutputRequest(location.search));
  } else if (query.get('mode') === 'convert') {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/conversion-simple.css?rev=20261028-motion-1'; document.head.append(css);
    const { mountConversionPage } = await import('./conversion-page.mjs?rev=20261028-unified-output-1'); mountConversionPage();
  } else {
    await import('./output-page.mjs?rev=20261024-common-tool-start-1');
  }
} catch (error) {
  const main = document.getElementById('main');
  if (main) {
    main.replaceChildren();
    const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = error?.message || '出力画面を開けませんでした。制作画面からもう一度書き出してください。';
    const back = document.createElement('button'); back.type = 'button'; back.textContent = '前の画面に戻る'; back.addEventListener('click', () => history.back());
    const link = document.createElement('a'); link.href = '/output/'; link.textContent = '変換ガイドを開く'; main.append(message, back, link);
  }
}

// Add text input/output without replacing media conversion or private handoff state.
try {
  const { installTextTools } = await import('./text-tools.mjs?rev=20261030-live-text-1');
  await installTextTools();
} catch (error) {
  console.warn('Text tools unavailable; existing media conversion remains usable.', error);
}

// Search/guide intent is a suggestion, never an automatic conversion. Private handoffs win.
try {
  const { installConversionIntent } = await import('./conversion-intent.mjs?rev=20261028-discovery-1');
  installConversionIntent();
} catch { /* The ordinary converter remains available without the enhancement. */ }

// Share one contextual UI and fixed export action without replacing any conversion engine.
try {
  const { mountSmartConversion } = await import('./conversion-smart-ui.mjs?rev=20261030-live-text-1');
  mountSmartConversion();
} catch (error) {
  console.warn('Smart conversion UI unavailable; original conversion controls remain available.', error);
}

// Advertising is optional and never awaited by import, preview, generation or saving.
void import('../ads/conversion-display-ad.mjs?rev=20261030-converter-ads-3')
  .then(({ mountConversionDisplayAd }) => mountConversionDisplayAd())
  .catch(() => { /* Conversion and download remain available without advertising. */ });
