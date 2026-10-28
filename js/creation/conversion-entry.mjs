/** All editor handoffs and local conversions share one output destination. */
const query = new URLSearchParams(location.search);
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
