import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const sessionErrors = [];
  page.on('console', message => {
    const value = message.text();
    if (value.startsWith('autosave-runtime:idb:')) {
      console.log(value);
    }
    if (value.includes('active-project-session') && value.includes('mismatch')) {
      sessionErrors.push(value);
    }
  });
  page.on('pageerror', error => sessionErrors.push(`pageerror:${error.message}`));
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_500);
  console.log('autosave-runtime: app-ready');

  async function createProject(name, fromStartup) {
    if (fromStartup) {
      await page.locator('#startupActionNew').click({ timeout: 5_000 });
    } else {
      await page.evaluate(() => document.getElementById('newProject')?.click());
    }
    await page.waitForSelector('#newProjectDialog[open]', { timeout: 5_000 });
    await page.fill('#newProjectName', name);
    await page.click('#confirmNewProject', { timeout: 5_000 });
    await page.waitForFunction(
      () => !document.getElementById('newProjectDialog')?.open,
      null,
      { timeout: 15_000 }
    );
    await page.waitForFunction(
      () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
      null,
      { timeout: 15_000 }
    );
    return await page.evaluate(() => window.__pixieedrawGetActiveProjectSession?.() || null);
  }

  async function readPersistenceSummary() {
    return await page.evaluate(async () => {
      const readAll = async (databaseName, storeName) => {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open(databaseName);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const transaction = database.transaction([storeName], 'readonly');
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error);
          });
        } finally {
          database.close();
        }
      };
      // Read sequentially. Safari and Chromium can both keep an upgrade/write
      // transaction pending when multiple connections to the same V2 database
      // are opened concurrently during a deferred thumbnail refresh.
      console.log('autosave-runtime:idb:recent:start');
      const recent = await readAll('pixieedraw-autosave', 'recentProjects');
      console.log('autosave-runtime:idb:recent:complete');
      const current = await readAll('pixieedraw-autosave-v2-experimental', 'localProjectCurrentManifests');
      console.log('autosave-runtime:idb:current:complete');
      const manifests = await readAll('pixieedraw-autosave-v2-experimental', 'localProjectManifests');
      console.log('autosave-runtime:idb:manifests:complete');
      const checkpoints = await readAll('pixieedraw-autosave-v2-experimental', 'localProjectSheetCheckpoints');
      console.log('autosave-runtime:idb:checkpoints:complete');
      return {
        recent: recent.map(entry => ({
          id: entry?.id || '',
          name: entry?.name || '',
          manifestKey: entry?.manifestKey || '',
        })),
        current: current.map(entry => ({
          projectId: entry?.projectId || '',
          manifestKey: entry?.manifestKey || '',
          revision: Number(entry?.revision) || 0,
        })),
        manifests: manifests.map(entry => ({
          projectId: entry?.projectId || '',
          key: entry?.key || '',
          revision: Number(entry?.revision) || 0,
        })),
        checkpoints: checkpoints.map(entry => ({
          projectId: entry?.projectId || '',
          key: entry?.key || '',
          indicesType: entry?.project?.document?.frames?.[0]?.layers?.[0]?.indices?.constructor?.name || '',
          directType: entry?.project?.document?.frames?.[0]?.layers?.[0]?.direct?.constructor?.name || '',
        })),
      };
    });
  }

  const first = await createProject('autosave-project-a', true);
  console.log('autosave-runtime: first-project-saved');
  assert.ok(first?.projectId, 'first project must receive an autosave project id');
  const firstInitialPersistence = await readPersistenceSummary();
  const firstInitialCurrent = firstInitialPersistence.current.find(entry => entry.projectId === first.projectId);
  assert.ok(firstInitialCurrent?.revision >= 1, 'first project must be saved immediately');

  const canvas = page.locator('#drawingCanvas');
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox && canvasBox.width > 0 && canvasBox.height > 0, 'drawing canvas must be visible');
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(1_200);
  console.log('autosave-runtime: first-project-edit-saved');
  const firstUpdatedPersistence = await readPersistenceSummary();
  const firstUpdatedCurrent = firstUpdatedPersistence.current.find(entry => entry.projectId === first.projectId);
  assert.ok(
    firstUpdatedCurrent?.revision > firstInitialCurrent.revision,
    'editing the same project must advance its current autosave revision'
  );
  assert.equal(
    firstUpdatedPersistence.recent.filter(entry => entry.id === first.projectId).length,
    1,
    'same-project autosave must update one recent-project row instead of duplicating it'
  );

  const second = await createProject('autosave-project-b', false);
  console.log('autosave-runtime: second-project-saved');
  assert.ok(second?.projectId, 'second project must receive an autosave project id');
  assert.notEqual(second.projectId, first.projectId, 'new project must use a separate autosave identity');
  assert.equal(second.projectId, second.autosaveIdentity);
  assert.equal(second.projectId, second.recoveryIdentity);
  assert.equal(second.dirty, false);

  const memoryDiagnostics = await page.evaluate(async () => {
    return await window.__pixieedrawGetMemoryDiagnostics?.();
  });
  assert.equal(
    memoryDiagnostics?.activeDocument?.residentTabPayloadCount,
    0,
    'the active single-project tab must not retain a full serialized project payload'
  );
  assert.equal(
    memoryDiagnostics?.activeDocument?.activeTabHasResidentPayload,
    false,
    'the active tab must keep metadata only after project reset'
  );

  const blankPixelCount = await page.evaluate(() => {
    const canvas = document.getElementById('drawingCanvas');
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context) return -1;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) visible += 1;
    }
    return visible;
  });
  assert.equal(blankPixelCount, 0, 'new project drawing pixels must be blank');
  assert.equal(await page.locator('#undoAction').isDisabled(), true, 'new project undo history must be empty');

  // The initial thumbnail is intentionally refreshed after the checkpoint is
  // durable. Let that write finish before opening independent inspection
  // connections to both autosave databases.
  await page.waitForTimeout(3_500);
  const finalPersistence = await readPersistenceSummary();
  console.log('autosave-runtime: persistence-read');
  const firstCurrent = finalPersistence.current.find(entry => entry.projectId === first.projectId);
  const secondCurrent = finalPersistence.current.find(entry => entry.projectId === second.projectId);
  assert.ok(firstCurrent, 'the previous project current revision must remain after creating a new project');
  assert.ok(secondCurrent?.revision >= 1, 'the new blank project must be saved under its own id');
  const secondCheckpoint = finalPersistence.checkpoints.find(entry => entry.projectId === second.projectId);
  assert.equal(
    secondCheckpoint?.indicesType,
    'Int16Array',
    'the production autosave path must persist indexed pixels as Int16Array, not Base64 or a numeric object'
  );
  // A brand-new INDEX project has no RGB raster yet. When it does exist, it
  // must remain a typed array through the same production autosave route.
  assert.ok(
    secondCheckpoint?.directType === '' || secondCheckpoint?.directType === 'Uint8ClampedArray',
    'the production autosave path must keep direct pixels null or Uint8ClampedArray, never Base64 or a numeric object'
  );
  assert.equal(finalPersistence.recent.filter(entry => entry.id === first.projectId).length, 1);
  assert.equal(finalPersistence.recent.filter(entry => entry.id === second.projectId).length, 1);
  assert.equal(
    finalPersistence.recent.find(entry => entry.id === first.projectId)?.manifestKey,
    firstCurrent.manifestKey,
    'previous-project metadata must still point to its latest saved revision'
  );
  assert.equal(
    finalPersistence.recent.find(entry => entry.id === second.projectId)?.manifestKey,
    secondCurrent.manifestKey,
    'new-project metadata must point to the separately saved blank revision'
  );
  assert.ok(
    finalPersistence.manifests.filter(entry => entry.projectId === first.projectId).length <= 2,
    'autosave must retain no more than two recovery revisions for one project'
  );
  assert.deepEqual(sessionErrors, [], 'project replacement must not emit session mismatch or page errors');

  console.log(JSON.stringify({
    firstProjectId: first.projectId,
    firstInitialRevision: firstInitialCurrent.revision,
    firstLatestRevision: firstCurrent.revision,
    secondProjectId: second.projectId,
    secondRevision: secondCurrent.revision,
    recentRows: finalPersistence.recent.length,
    firstRetainedRevisions: finalPersistence.manifests.filter(entry => entry.projectId === first.projectId).length,
    secondBlankVisiblePixels: blankPixelCount,
    newProjectUndoDisabled: true,
    residentTabPayloadCount: memoryDiagnostics?.activeDocument?.residentTabPayloadCount,
    sessionMismatchCount: sessionErrors.length,
    checkpointIndicesType: secondCheckpoint.indicesType,
    checkpointDirectType: secondCheckpoint.directType,
  }, null, 2));
} finally {
  await browser.close();
}
