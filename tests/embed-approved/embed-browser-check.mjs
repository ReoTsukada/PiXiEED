const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE
  || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
let chromium;
try { ({ chromium } = await import(playwrightPath)); }
catch (error) { throw new Error(`Playwright was not found. Set PIXIEED_PLAYWRIGHT_MODULE to its index.mjs path. ${error.message}`); }
const baseUrl = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4193';
const { dirname, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const { mkdir, readFile, writeFile } = await import('node:fs/promises');
const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceRoot = '/tmp/pixieed-approved-release-20261015/evidence';
await mkdir(evidenceRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  window.__embedMediaCallCount = 0;
  const media = navigator.mediaDevices;
  if (media?.getUserMedia) media.getUserMedia = async () => { window.__embedMediaCallCount += 1; throw new DOMException('Camera denied by test harness.', 'NotAllowedError'); };
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${baseUrl}/tests/embed-approved/embed-harness.html`);
await page.getByRole('button', { name: '開始', exact: true }).click();
await page.waitForFunction(() => document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));
const frame = page.frames().find(item => item.url().includes('embedRole=draw'));
if (!frame) throw new Error('Draw iframe was not created.');
await frame.waitForSelector('#draw-canvas');
const bootstrapState = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__?.getState());
if (!bootstrapState) throw new Error('The real editor bridge did not become ready.');
await frame.evaluate(() => { window.__embedPersistenceProof = crypto.randomUUID(); });
const seedBoard = await frame.locator('#draw-canvas').boundingBox();
await page.mouse.click(seedBoard.x + seedBoard.width / 4, seedBoard.y + seedBoard.height / 4);
await frame.waitForFunction(hash => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState().then(state => state.image.hash !== hash), bootstrapState.image.hash);
await frame.locator('[data-action="toggle-frames"]').click();
await frame.locator('#draw-animation-controls-panel [data-action="add-frame"]').last().click();
await frame.waitForFunction(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState().then(state => state.timeline.frameCount === 2));
await frame.locator('#draw-animation-controls-panel [data-action="add-layer"]').click();
await frame.waitForFunction(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState().then(state => state.timeline.layerCount === 3));
const timelineEdited = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
const initial = timelineEdited;
if (timelineEdited.timeline.celCount !== 6 || timelineEdited.timeline.tileCount < 1 || !timelineEdited.timeline.hash) throw new Error('Frame/layer cels were not included in the timeline digest.');
await frame.locator('#draw-animation-controls-panel [data-action="close-animation"]').click();
const board = await frame.locator('#draw-canvas').boundingBox();
await page.mouse.click(board.x + board.width / 2, board.y + board.height / 2);
await frame.waitForFunction(() => !document.querySelector('#draw-undo')?.disabled);
const painted = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
if (painted.image.hash === initial.image.hash) throw new Error('Drawing did not change real canvas pixels.');
await frame.locator('#draw-undo').click();
await frame.waitForFunction(hash => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState().then(state => state.image.hash === hash), initial.image.hash);
const undone = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
if (undone.image.hash !== initial.image.hash) throw new Error('Undo did not restore initial pixels.');
await frame.locator('#draw-redo').click();
await frame.waitForTimeout(300);
const redone = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
if (redone.image.hash !== painted.image.hash) throw new Error('Redo did not restore painted pixels.');
// Undo remains available while the editor is suspended, then Redo must restore the same project.
await frame.locator('#draw-undo').click();
await frame.waitForFunction(hash => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState().then(state => state.image.hash === hash && !state.controls.redoDisabled), initial.image.hash);
const suspendedHistory = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
await page.getByRole('button', { name: '拡大' }).click();
await page.getByRole('button', { name: '閉じる' }).click();
await page.waitForFunction(() => document.querySelector('[data-embed-stage]').hidden);
await page.getByRole('button', { name: '開始', exact: true }).click();
await page.waitForFunction(() => document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));
const resumed = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
if (resumed.image.hash !== suspendedHistory.image.hash || resumed.timeline.hash !== suspendedHistory.timeline.hash
    || JSON.stringify(resumed.timeline.frames) !== JSON.stringify(suspendedHistory.timeline.frames)
    || JSON.stringify(resumed.timeline.layers) !== JSON.stringify(suspendedHistory.timeline.layers)) throw new Error('Close and resume lost the existing editor content or timeline.');
if (resumed.controls.redoDisabled) throw new Error('Close and resume discarded the Redo history.');
const persistentContext = await frame.evaluate(() => window.__embedPersistenceProof);
if (!persistentContext) throw new Error('The iframe browsing context was replaced during resume.');
await frame.locator('#draw-redo').click();
await frame.waitForFunction(() => document.querySelector('#draw-redo')?.disabled);
if (page.frames().filter(item => item.url().includes('embedRole=draw')).length !== 1) throw new Error('Resume replaced the editor browsing context.');
const afterResumeRedo = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
if (afterResumeRedo.image.hash !== painted.image.hash) throw new Error('Redo after resume did not restore edited pixels.');
const preCamera = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
await frame.locator('#creation-mode-menu > summary').click();
await frame.locator('#creation-mode-menu [data-creation-mode="camera"]').click();
await frame.waitForFunction(() => document.body.dataset.creationMode === 'camera');
const noPermissionBeforeStart = await frame.evaluate(() => window.__embedMediaCallCount);
if (noPermissionBeforeStart !== 0) throw new Error('Camera requested media before a user camera action.');
await frame.locator('#cameraImageInput').setInputFiles(resolve(siteRoot, 'assets/pixel-studio/samples/coffee.png'));
await frame.waitForFunction(() => document.querySelector('#cameraStatus')?.textContent !== '準備中');
await frame.locator('#toolbarHome [data-tool="look"]').click();
if (await frame.locator('#looks [data-look="c8"]').isHidden()) await frame.locator('#toolbarContextMore').click();
await frame.locator('#looks [data-look="c8"]').click();
const cameraImport = await frame.evaluate(() => ({
  sourceLabel: document.querySelector('#cameraStatus')?.textContent,
  reducedPalette: document.querySelector('#looks [data-look="c8"]')?.getAttribute('aria-checked'),
  mediaCalls: window.__embedMediaCallCount
}));
if (cameraImport.reducedPalette !== 'true' || cameraImport.mediaCalls !== 0) throw new Error('Camera image import/reduced-color flow failed or requested media.');
await frame.locator('#creation-mode-menu > summary').click();
await frame.locator('#creation-mode-menu [data-creation-mode="draw"]').click();
await frame.waitForFunction(() => document.body.dataset.creationMode === 'draw');
const afterCameraMode = await frame.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
if (afterCameraMode.image.hash !== preCamera.image.hash || afterCameraMode.timeline.hash !== preCamera.timeline.hash) throw new Error('Switching to camera and back changed Draw pixels/history.');
await page.getByRole('button', { name: '拡大' }).click();
await page.screenshot({ path: `${evidenceRoot}/draw-embed-390.png`, fullPage: true, animations: 'disabled' });
await page.getByRole('button', { name: '縮小' }).click();
await page.locator('[data-tool-mode="camera"] [data-embed-start]').click();
await page.waitForFunction(() => document.querySelector('[data-tool-mode="camera"] [data-embed-status]')?.textContent.includes('編集を保持'));
const cameraFrame = page.frames().find(item => item.url().includes('embedRole=camera'));
if (!cameraFrame) throw new Error('The camera tool iframe was not created.');
await cameraFrame.waitForSelector('#pixelStudio');
await cameraFrame.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
if (await cameraFrame.evaluate(() => window.__embedMediaCallCount) !== 0) throw new Error('Camera iframe requested media before the explicit camera action.');
await page.getByRole('button', { name: '拡大' }).last().click();
await cameraFrame.evaluate(() => { window.__cameraEmbedPersistenceProof = crypto.randomUUID(); });
await page.screenshot({ path: `${evidenceRoot}/camera-embed-390.png`, fullPage: true, animations: 'disabled' });
const cameraProof = await cameraFrame.evaluate(() => window.__cameraEmbedPersistenceProof);
await page.getByRole('button', { name: '閉じる' }).last().click();
await page.locator('[data-tool-mode="draw"] [data-embed-start]').click();
await page.waitForFunction(() => document.querySelector('[data-tool-mode="draw"] [data-embed-status]')?.textContent.includes('編集を保持'));
if (await cameraFrame.evaluate(() => window.__cameraEmbedPersistenceProof) !== cameraProof) throw new Error('Camera resume replaced its iframe browsing context.');
await frame.locator('#creation-output-open').click();
await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(item => item.contentWindow?.location?.pathname?.startsWith('/output/work/'))).catch(async () => {
  await page.waitForTimeout(1500);
});
await frame.waitForFunction(() => {
  const download = document.querySelector('#output-download');
  return download && download.getAttribute('href') && download.getAttribute('href') !== '#';
}, null, { timeout: 30000 });
const downloadWait = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await frame.locator('#output-download').click();
const download = await downloadWait;
let pngEvidence = null;
if (download) {
  const pngPath = `${evidenceRoot}/draw-embed-output.png`;
  await download.saveAs(pngPath);
  const bytes = await readFile(pngPath);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('The embedded drawing output is not a PNG.');
  pngEvidence = { path: pngPath, bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), signature };
} else throw new Error('The embedded drawing export did not start a PNG download.');
const report = {
  viewport: '390×844',
  pixels: { changed: painted.image.hash !== initial.image.hash, undoRestored: undone.image.hash === initial.image.hash, redoRestored: redone.image.hash === painted.image.hash },
  timeline: {
    frameCount: timelineEdited.timeline.frames.length, layerCount: timelineEdited.timeline.layers.length,
    celCount: timelineEdited.timeline.celCount, tileCount: timelineEdited.timeline.tileCount,
    hash: timelineEdited.timeline.hash,
    retainedThroughResume: resumed.timeline.hash === suspendedHistory.timeline.hash
      && JSON.stringify(resumed.timeline.frames) === JSON.stringify(suspendedHistory.timeline.frames)
      && JSON.stringify(resumed.timeline.layers) === JSON.stringify(suspendedHistory.timeline.layers)
  },
  closeResume: { sameBrowsingContext: Boolean(persistentContext), redoAvailable: !resumed.controls.redoDisabled, redoRestored: afterResumeRedo.image.hash === painted.image.hash },
  camera: { noPermissionBeforeExplicitAction: noPermissionBeforeStart === 0, importedSample: cameraImport.sourceLabel === 'プレビュー', reducedPalette: cameraImport.reducedPalette === 'true', mediaRequests: cameraImport.mediaCalls },
  dedicatedCameraIframe: { mediaRequestsBeforeExplicitAction: await cameraFrame.evaluate(() => window.__embedMediaCallCount), sameBrowsingContextOnResume: await cameraFrame.evaluate(() => window.__cameraEmbedPersistenceProof) === cameraProof },
  pngOutput: pngEvidence,
  screenshots: [`${evidenceRoot}/draw-embed-390.png`, `${evidenceRoot}/camera-embed-390.png`],
  iframeCounts: { draw: await page.locator('[data-tool-mode="draw"] iframe').count(), camera: await page.locator('[data-tool-mode="camera"] iframe').count() },
  errors
};
await writeFile(`${evidenceRoot}/embed-results.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pixels.changed || !report.pixels.undoRestored || !report.pixels.redoRestored || !report.timeline.retainedThroughResume
    || !report.closeResume.sameBrowsingContext || !report.closeResume.redoAvailable || !report.closeResume.redoRestored
    || !report.camera.noPermissionBeforeExplicitAction || !report.camera.importedSample || !report.camera.reducedPalette
    || report.camera.mediaRequests !== 0 || report.dedicatedCameraIframe.mediaRequestsBeforeExplicitAction !== 0
    || !report.dedicatedCameraIframe.sameBrowsingContextOnResume || !report.pngOutput || report.iframeCounts.draw !== 1
    || report.iframeCounts.camera !== 1 || errors.length) throw new Error(`Embed acceptance report failed: ${JSON.stringify(report)}`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
