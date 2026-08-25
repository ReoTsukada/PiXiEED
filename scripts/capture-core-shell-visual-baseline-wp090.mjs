import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromScreenshots = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = requireFromScreenshots('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseDir = path.join(root, 'docs/visual-regression/wp-090/core-shell');
const url = 'http://127.0.0.1:8000/core-shell/';
const viewports = [
  { id: '390x844', width: 390, height: 844 },
  { id: '540x900', width: 540, height: 900 },
  { id: '900x900', width: 900, height: 900 },
  { id: '1440x900', width: 1440, height: 900 },
];
const themes = ['light', 'dark'];
const states = ['default', 'loading', 'empty', 'error', 'permission-denied', 'offline', 'dialog', 'mobile-sheet'];
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      for (const state of states) {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.evaluate((nextTheme) => { document.documentElement.dataset.theme = nextTheme; }, theme);
        if (state === 'default') {
          // The default overview is already deterministic after the theme is fixed.
        } else if (state === 'dialog') {
          await page.getByRole('button', { name: 'Shellの境界を見る' }).click();
        } else if (state === 'mobile-sheet') {
          await page.getByRole('button', { name: '通知を開く' }).click();
        } else {
          await page.evaluate((nextState) => window.__PIXIEED_CORE_SHELL__.setPreviewState(nextState), state);
        }
        const directory = path.join(baseDir, viewport.id, theme);
        await mkdir(directory, { recursive: true });
        await page.screenshot({ path: path.join(directory, `${state}.png`), fullPage: true, animations: 'disabled' });
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const manifest = {
  id: 'WP-090-CORE-SHELL-VISUAL-001',
  status: 'BASELINE_REGISTERED_ISOLATED',
  source: '/core-shell/',
  deterministic: { themes, reducedMotion: true, dynamicClock: false, randomIds: false, animations: 'disabled' },
  viewports,
  themes,
  states,
  imagePattern: 'core-shell/{viewport}/{theme}/{state}.png',
  semanticInteractionTestsRemainRequired: true,
  reference: { wp080InitialSourceBytes: 62052 },
};
await writeFile(path.join(baseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`WP-090 visual baseline captured: ${viewports.length * themes.length * states.length} deterministic PNGs across ${viewports.length} viewports, Light/Dark, and ${states.length} states`);
