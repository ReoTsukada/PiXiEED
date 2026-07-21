import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const codecSource = fs.readFileSync(new URL('pixiedraw/assets/js/modules/color-codec-utils.js', root), 'utf8');
const codecContext = {
  window: { PiXiEEDrawModules: {} },
  console,
  Uint8Array,
};
vm.createContext(codecContext);
vm.runInContext(codecSource, codecContext, { filename: 'color-codec-utils.js' });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const { GifWriter } = codecContext.window.PiXiEEDrawModules.colorCodecUtils.createColorCodecUtils({ clamp });

const width = 256;
const height = 256;
const frameCount = 50;
const gifBuffer = new Uint8Array(64 * 1024 * 1024);
const writer = new GifWriter(gifBuffer, width, height, {
  palette: [0x101020, 0x20d0c0],
  loop: 0,
});
const indices = new Uint8Array(width * height);
for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      indices[(y * width) + x] = (x + y + frameIndex) & 1;
    }
  }
  writer.addFrame(0, 0, width, height, indices, { delay: 10, disposal: 0 });
}

const temporaryDirectory = fs.mkdtempSync(join(tmpdir(), 'pixiedraw-timelapse-base-'));
const gifPath = join(temporaryDirectory, 'large-index-timelapse.gif');
fs.writeFileSync(gifPath, gifBuffer.subarray(0, writer.end()));

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const runtimeErrors = [];
  const repairEvents = [];
  const timelapseDebugEvents = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror:${error.message}`));
  page.on('console', message => {
    const text = message.text();
    if (/timelapse.*(failed|unavailable)|ERR_TIMELAPSE/i.test(text)) {
      runtimeErrors.push(`console:${text}`);
    }
    if (text.includes('[pixiedraw:timelapse-base-repair]')) {
      repairEvents.push(text);
    }
    if (/timelapse|autosave:(total|record-recent-project)/i.test(text)) {
      timelapseDebugEvents.push(text);
    }
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: undefined,
    });
  });
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_500);
  assert.match(
    await page.locator('script[src*="assets/js/app.js"]').getAttribute('src'),
    /app\.js\?v=20260721-122/
  );
  assert.equal(await page.evaluate(() => window.__PIXIEEDRAW_BUILD_ID__), '20260721-122');

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
  await page.locator('#startupActionOpen').click({ timeout: 5_000 });
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(gifPath);

  await page.waitForFunction(
    expectedFrameCount => window.__pixieedrawGetMemoryDiagnostics?.()
      .then(value => value?.activeDocument?.frameCount === expectedFrameCount),
    frameCount,
    { timeout: 45_000 }
  );
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 45_000 }
  );
  await page.waitForFunction(
    () => window.__pixieedrawGetMemoryDiagnostics?.().then(value => (
      value?.activeDocument?.residentTimelapseBaseCount === 0
      && value?.activeDocument?.diskBackedTimelapseBaseCount >= 1
    )),
    null,
    { timeout: 45_000 }
  );

  const readStableDiskBackedDiagnostics = async () => await page.evaluate(async () => {
    let stableCount = 0;
    let latest = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      latest = await window.__pixieedrawGetMemoryDiagnostics();
      if (
        latest?.activeDocument?.residentTimelapseBaseCount === 0
        && latest?.activeDocument?.diskBackedTimelapseBaseCount >= 1
      ) {
        stableCount += 1;
        if (stableCount >= 3) return latest;
      } else {
        stableCount = 0;
      }
      await new Promise(resolve => window.setTimeout(resolve, 500));
    }
    return latest;
  });

  const afterImport = await readStableDiskBackedDiagnostics();
  assert.equal(afterImport.activeDocument.width, width);
  assert.equal(afterImport.activeDocument.height, height);
  assert.equal(afterImport.activeDocument.frameCount, frameCount);
  assert.equal(afterImport.activeDocument.timelapseDiskBaseEligible, true);
  assert.equal(afterImport.activeDocument.residentTimelapseBaseCount, 0);
  assert.equal(afterImport.activeDocument.diskBackedTimelapseBaseCount, 1);
  await page.waitForTimeout(3_500);

  const readStoredBaseCount = async () => await page.evaluate(async () => {
    const projectId = window.__pixieedrawGetActiveProjectSession?.()?.projectId || '';
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-timelapse-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(['projects'], 'readonly');
        const request = transaction.objectStore('projects').get(projectId);
        request.onsuccess = () => resolve(Object.keys(request.result?.baseSnapshotsByCanvas || {}).length);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
  const removeStoredBases = async () => await page.evaluate(async () => {
    const projectId = window.__pixieedrawGetActiveProjectSession?.()?.projectId || '';
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-timelapse-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(['projects'], 'readwrite');
        const store = transaction.objectStore('projects');
        const request = store.get(projectId);
        request.onsuccess = () => {
          const record = request.result || { projectId, byCanvas: {} };
          record.baseSnapshotsByCanvas = {};
          store.put(record);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await removeStoredBases();
    await page.waitForTimeout(900);
    if (await readStoredBaseCount() === 0) {
      await page.waitForTimeout(900);
      if (await readStoredBaseCount() === 0) break;
    }
  }
  assert.equal(await readStoredBaseCount(), 0, 'the repair test must remove only the disk-backed base copy');

  await page.evaluate(() => document.getElementById('addFrame')?.click());
  await page.waitForFunction(
    expectedFrameCount => window.__pixieedrawGetMemoryDiagnostics?.()
      .then(value => value?.activeDocument?.frameCount === expectedFrameCount),
    frameCount + 1,
    { timeout: 10_000 }
  );
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 30_000 }
  );
  await page.waitForFunction(async () => {
    const projectId = window.__pixieedrawGetActiveProjectSession?.()?.projectId || '';
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-timelapse-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(['projects'], 'readonly');
        const request = transaction.objectStore('projects').get(projectId);
        request.onsuccess = () => resolve(Object.keys(request.result?.baseSnapshotsByCanvas || {}).length >= 1);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, null, { timeout: 45_000 });
  await page.waitForTimeout(500);
  if (!repairEvents.length) {
    console.log(JSON.stringify({ repairEvents, timelapseDebugEvents }, null, 2));
  }
  assert.ok(repairEvents.length >= 1, 'a missing disk base must be repaired from the V2 checkpoint');

  const confirmExportAndWaitForDownload = async () => {
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.locator('#confirmExport').click();
    const interstitial = page.locator('#exportInterstitialDialog');
    if (await interstitial.isVisible().catch(() => false)) {
      await page.locator('#closeExportInterstitial').click();
    }
    return await downloadPromise;
  };

  await page.evaluate(() => document.getElementById('exportProject')?.click());
  await page.waitForSelector('#exportDialog[open]', { timeout: 10_000 });
  await page.selectOption('#exportFormat', 'gif');
  await page.evaluate(() => {
    const toggle = document.getElementById('exportTimelapseToggle');
    if (toggle instanceof HTMLInputElement) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  const timelapseDownload = await confirmExportAndWaitForDownload();
  assert.match(timelapseDownload.suggestedFilename(), /\.gif$/i);
  await page.evaluate(() => document.getElementById('closeLoginPrompt')?.click());
  const afterTimelapseExport = await readStableDiskBackedDiagnostics();
  assert.equal(afterTimelapseExport.activeDocument.residentTimelapseBaseCount, 0);
  assert.equal(afterTimelapseExport.activeDocument.diskBackedTimelapseBaseCount, 1);

  await page.evaluate(() => document.getElementById('exportProject')?.click());
  await page.waitForSelector('#exportDialog[open]', { timeout: 10_000 });
  await page.selectOption('#exportFormat', 'project');
  const download = await confirmExportAndWaitForDownload();
  assert.match(download.suggestedFilename(), /\.pxd$/i);

  const afterExport = await readStableDiskBackedDiagnostics();
  assert.equal(afterExport.activeDocument.residentTimelapseBaseCount, 0);
  assert.equal(afterExport.activeDocument.diskBackedTimelapseBaseCount, 1);
  assert.deepEqual(runtimeErrors, []);

  console.log(JSON.stringify({
    imported: {
      width: afterImport.activeDocument.width,
      height: afterImport.activeDocument.height,
      frameCount: afterImport.activeDocument.frameCount,
      residentTimelapseBaseCount: afterImport.activeDocument.residentTimelapseBaseCount,
      diskBackedTimelapseBaseCount: afterImport.activeDocument.diskBackedTimelapseBaseCount,
    },
    exportedTimelapseFileName: timelapseDownload.suggestedFilename(),
    exportedProjectFileName: download.suggestedFilename(),
    afterExport: {
      residentTimelapseBaseCount: afterExport.activeDocument.residentTimelapseBaseCount,
      diskBackedTimelapseBaseCount: afterExport.activeDocument.diskBackedTimelapseBaseCount,
    },
    repairEventCount: repairEvents.length,
    runtimeErrorCount: runtimeErrors.length,
  }, null, 2));
} finally {
  await browser.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
