import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Reuse the installed browser renderer for Japanese text. Never install dependencies. */
export function createHiddenObjectOgpRenderer() {
  let browserPromise;
  const modulePromise = readFile(new URL('../../js/creation/puzzle-share-page.mjs', import.meta.url)).then(bytes => `data:text/javascript;base64,${bytes.toString('base64')}`);
  async function browser() {
    if (!browserPromise) browserPromise = (async () => {
      let runtime;
      try { runtime = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright'); }
      catch { throw new Error('Japanese OGP text requires an existing Playwright installation. Set PIXIEED_PLAYWRIGHT_MODULE; no dependency was installed.'); }
      return runtime.chromium.launch({ headless: true });
    })();
    return browserPromise;
  }
  return {
    async render({ originalBytes, text }) {
      const instance = await browser(), page = await instance.newPage();
      try {
        await page.route('**/*', route => route.abort());
        const result = await page.evaluate(async ({ moduleUrl, imageUrl, text }) => {
          const { drawHiddenObjectPuzzleOgp } = await import(moduleUrl);
          const image = new Image(); image.src = imageUrl; await image.decode();
          await document.fonts.ready;
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
          drawHiddenObjectPuzzleOgp(canvas.getContext('2d'), image, text);
          return canvas.toDataURL('image/png').split(',')[1];
        }, { moduleUrl: await modulePromise, imageUrl: `data:image/png;base64,${Buffer.from(originalBytes).toString('base64')}`, text });
        return Buffer.from(result, 'base64');
      } finally { await page.close(); }
    },
    async close() { if (browserPromise) { const instance = await browserPromise.catch(() => null); await instance?.close(); } },
  };
}
