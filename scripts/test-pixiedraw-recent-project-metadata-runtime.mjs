import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');

const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';
const AUTOSAVE_DB_NAME = 'pixieedraw-autosave';
const RECENT_PROJECTS_STORE = 'recentProjects';
const LEGACY_PAYLOAD_BYTES = 2 * 1024 * 1024;
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const legacyProjectId = `local-test-recent-legacy-${testRunId}`;
const v2ProjectId = `local-test-recent-v2-${testRunId}`;
const legacyProjectName = `metadata-legacy-${testRunId}`;
const v2ProjectName = `metadata-v2-${testRunId}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];

page.on('pageerror', error => {
  pageErrors.push(String(error?.message || error));
});
await page.route(
  /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
  route => route.abort()
).catch(() => {});

function isSuccessfulOperation(result) {
  return result?.success === true
    || result?.value === true
    || result?.value === 'opened'
    || result?.value?.ok === true
    || result?.value?.opened === true
    || result?.value?.status === 'success';
}

async function waitForEditorReady() {
  await page.waitForFunction(
    () => window.__PIXIEEDRAW_EDITOR_READY__ === true,
    null,
    { timeout: 20_000 }
  );
}

async function closeOptionalPiXiSyncResumeNotice() {
  const notice = page.locator('#pixisyncResumeNoticeDialog[open]');
  if (await notice.count()) {
    await page.locator('#pixisyncResumeNoticeClose').click({ timeout: 5_000 }).catch(() => {});
    await page.waitForFunction(
      () => !document.getElementById('pixisyncResumeNoticeDialog')?.open,
      null,
      { timeout: 5_000 }
    ).catch(() => {});
  }
}

async function waitForStartupProjectCards() {
  await page.waitForFunction(
    () => document.body.classList.contains('is-startup-active')
      && document.querySelectorAll('#startupWorkspaceProjectList .startup-workspace__project').length >= 2,
    null,
    { timeout: 20_000 }
  );
}

async function showLocalProjectList() {
  const alreadyVisible = await page.locator('body.is-startup-active').count() > 0;
  await page.evaluate(() => {
    document.getElementById('showLocalProjects')?.click();
  });
  if (alreadyVisible) await page.waitForTimeout(250);
  await waitForStartupProjectCards();
  await closeOptionalPiXiSyncResumeNotice();
}

async function readVisibleProjectCards() {
  return await page.evaluate(() => Array.from(
    document.querySelectorAll('#startupWorkspaceProjectList .startup-workspace__project')
  ).map((node, index) => ({
    index,
    text: node.textContent || '',
    name: node.querySelector('.startup-workspace__project-name')?.textContent || '',
  })));
}

async function clickProjectCardOpen(projectName) {
  const card = page.locator('#startupWorkspaceProjectList .startup-workspace__project')
    .filter({ hasText: projectName })
    .first();
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  await card.locator('button[data-workspace-project-open-index]').click({ timeout: 10_000 });
}

async function waitForActiveProject(projectId) {
  await page.waitForFunction(
    id => window.__pixieedrawGetActiveProjectSession?.()?.projectId === id,
    projectId,
    { timeout: 20_000 }
  );
}

async function readRecentProjectRow(projectId) {
  return await page.evaluate(async ({ databaseName, storeName, id }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readonly');
        const request = transaction.objectStore(storeName).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, { databaseName: AUTOSAVE_DB_NAME, storeName: RECENT_PROJECTS_STORE, id: projectId });
}

async function readAutosaveV2ProjectRecordCounts(projectId) {
  return await page.evaluate(async ({ databaseName, id, storeNames }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const availableStoreNames = storeNames.filter(name => database.objectStoreNames.contains(name));
      if (availableStoreNames.length !== storeNames.length) {
        return {
          manifests: 0,
          checkpoints: 0,
          journals: 0,
          thumbnails: 0,
          currentManifest: false,
          storesComplete: false,
        };
      }
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(availableStoreNames, 'readonly');
        const counts = {
          manifests: 0,
          checkpoints: 0,
          journals: 0,
          thumbnails: 0,
          currentManifest: false,
          deletedMarker: false,
          storesComplete: true,
        };
        const indexedStores = [
          ['manifests', 'localProjectManifests'],
          ['checkpoints', 'localProjectSheetCheckpoints'],
          ['journals', 'localProjectJournals'],
          ['thumbnails', 'localProjectThumbnails'],
        ];
        indexedStores.forEach(([key, storeName]) => {
          const request = transaction.objectStore(storeName).index('projectId').count(id);
          request.onsuccess = () => {
            counts[key] = Number(request.result) || 0;
          };
        });
        const currentRequest = transaction.objectStore('localProjectCurrentManifests').get(id);
        currentRequest.onsuccess = () => {
          counts.currentManifest = Boolean(currentRequest.result && currentRequest.result.deleted !== true);
          counts.deletedMarker = Boolean(currentRequest.result && currentRequest.result.deleted === true);
        };
        transaction.oncomplete = () => resolve(counts);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, {
    databaseName: 'pixieedraw-autosave-v2-experimental',
    id: projectId,
    storeNames: [
      'localProjectManifests',
      'localProjectSheetCheckpoints',
      'localProjectJournals',
      'localProjectThumbnails',
      'localProjectCurrentManifests',
    ],
  });
}

async function resolvePublicProjectSurface() {
  return await page.evaluate(() => {
    const modules = window.PiXiEEDrawModules || {};
    const candidates = [
      ['window.app', window.app],
      ['window.PiXiEEDrawModules.app', modules.app],
      ['window.__PIXIEEDRAW_APP__', window.__PIXIEEDRAW_APP__],
      ['window.__pixieedrawApp', window.__pixieedrawApp],
      ['window.PiXiEEDrawModules', modules],
    ];
    const recentListProperties = ['recentProjects', 'recentProjectEntries', 'recentProjectsCache'];
    const hasCallable = value => value && (
      typeof value === 'object' || typeof value === 'function'
    );
    const candidate = candidates.find(([, value]) => hasCallable(value) && (
      typeof value.loadRecentProjectsMetadata === 'function'
      || typeof value.openRecentProject === 'function'
      || typeof value.removeRecentProjectEntry === 'function'
      || typeof value.deleteRecentProjectEntry === 'function'
      || typeof value.deleteRecentProject === 'function'
      || recentListProperties.some(name => Array.isArray(value[name]) || value[name] instanceof Map)
    ));
    if (!candidate) {
      return {
        available: false,
        source: '',
        listMethod: '',
        openMethod: '',
        deleteMethod: '',
        candidates: candidates.map(([name, value]) => ({
          name,
          object: hasCallable(value),
        })),
      };
    }
    const [, value] = candidate;
    const findMethod = names => names.find(name => typeof value[name] === 'function') || '';
    return {
      available: true,
      source: candidate[0],
      listMethod: findMethod(['loadRecentProjectsMetadata', 'listRecentProjects', 'getRecentProjects']),
      openMethod: findMethod(['openRecentProject', 'openRecentProjectAsTab']),
      deleteMethod: findMethod(['removeRecentProjectEntry', 'deleteRecentProjectEntry', 'deleteRecentProject']),
      candidates: candidates.map(([name]) => ({ name, object: true })),
    };
  });
}

async function callPublicRecentList() {
  return await page.evaluate(async ({ legacyId, v2Id, payloadBytes }) => {
    const modules = window.PiXiEEDrawModules || {};
    const candidates = [
      ['window.app', window.app],
      ['window.PiXiEEDrawModules.app', modules.app],
      ['window.__PIXIEEDRAW_APP__', window.__PIXIEEDRAW_APP__],
      ['window.__pixieedrawApp', window.__pixieedrawApp],
      ['window.PiXiEEDrawModules', modules],
    ];
    const listNames = ['loadRecentProjectsMetadata', 'listRecentProjects', 'getRecentProjects'];
    const listProperties = ['recentProjects', 'recentProjectEntries', 'recentProjectsCache'];
    const extractEntries = value => {
      if (Array.isArray(value)) return value;
      if (value instanceof Map) return Array.from(value.values());
      if (!value || typeof value !== 'object') return [];
      for (const key of ['entries', 'projects', 'items', 'recentProjects', 'recentProjectEntries', 'list']) {
        if (Array.isArray(value[key])) return value[key];
        if (value[key] instanceof Map) return Array.from(value[key].values());
      }
      return [];
    };
    const payloadBytesIn = (value, seen = new Set(), depth = 0) => {
      if (value === null || value === undefined || depth > 6) return 0;
      if (typeof value === 'string') return value.length * 2;
      if (typeof value !== 'object' || seen.has(value)) return 0;
      seen.add(value);
      let total = 0;
      if (Array.isArray(value)) {
        value.forEach(item => {
          total += payloadBytesIn(item, seen, depth + 1);
        });
      } else {
        Object.keys(value).forEach(key => {
          total += key.length * 2;
          total += payloadBytesIn(value[key], seen, depth + 1);
        });
      }
      seen.delete(value);
      return total;
    };
    const summarize = entries => {
      const normalized = Array.isArray(entries) ? entries : [];
      const legacy = normalized.find(entry => entry?.id === legacyId) || null;
      const v2 = normalized.find(entry => entry?.id === v2Id) || null;
      const legacyPayload = legacy?.project ?? legacy?.payload ?? legacy?.packagedProject ?? legacy?.projectPayload ?? null;
      return {
        entryCount: normalized.length,
        legacyPresent: Boolean(legacy),
        v2Present: Boolean(v2),
        legacyPayloadResidentBytes: payloadBytesIn(legacyPayload),
        legacyPayloadResident: payloadBytesIn(legacyPayload) >= Math.floor(payloadBytes * 0.75),
        entries: normalized.map(entry => ({
          id: typeof entry?.id === 'string' ? entry.id : '',
          name: typeof entry?.name === 'string' ? entry.name : '',
          autosaveSchemaVersion: Number(entry?.autosaveSchemaVersion) || 0,
          hasProject: Boolean(entry && typeof entry.project === 'object'),
          hasManifestKey: typeof entry?.manifestKey === 'string' && entry.manifestKey.length > 0,
          openError: typeof entry?.openError === 'string' ? entry.openError : '',
        })),
      };
    };
    for (const [source, surface] of candidates) {
      if (!surface || (typeof surface !== 'object' && typeof surface !== 'function')) continue;
      const methodName = listNames.find(name => typeof surface[name] === 'function');
      const propertyName = listProperties.find(name => Array.isArray(surface[name]) || surface[name] instanceof Map);
      if (!methodName && !propertyName) continue;
      try {
        const result = methodName
          ? await surface[methodName].call(surface, { includePayload: false })
          : surface[propertyName];
        return {
          available: true,
          source,
          method: methodName || propertyName,
          ...summarize(extractEntries(result)),
        };
      } catch (error) {
        return {
          available: true,
          source,
          method: methodName,
          threw: true,
          error: String(error?.message || error),
          ...summarize([]),
        };
      }
    }
    return {
      available: false,
      source: '',
      method: '',
      reason: 'public recent-project list API is not exposed',
      ...summarize([]),
    };
  }, { legacyId: legacyProjectId, v2Id: v2ProjectId, payloadBytes: LEGACY_PAYLOAD_BYTES });
}

async function callPublicProjectOperation(operation, projectId, fallbackEntry) {
  return await page.evaluate(async ({ operationName, id, fallback }) => {
    const modules = window.PiXiEEDrawModules || {};
    const candidates = [
      ['window.app', window.app],
      ['window.PiXiEEDrawModules.app', modules.app],
      ['window.__PIXIEEDRAW_APP__', window.__PIXIEEDRAW_APP__],
      ['window.__pixieedrawApp', window.__pixieedrawApp],
      ['window.PiXiEEDrawModules', modules],
    ];
    const methodNames = operationName === 'open'
      ? ['openRecentProject', 'openRecentProjectAsTab']
      : ['removeRecentProjectEntry', 'deleteRecentProjectEntry', 'deleteRecentProject'];
    const listNames = ['loadRecentProjectsMetadata', 'listRecentProjects', 'getRecentProjects'];
    const listProperties = ['recentProjects', 'recentProjectEntries', 'recentProjectsCache'];
    const extractEntries = value => {
      if (Array.isArray(value)) return value;
      if (value instanceof Map) return Array.from(value.values());
      if (!value || typeof value !== 'object') return [];
      for (const key of ['entries', 'projects', 'items', 'recentProjects', 'recentProjectEntries', 'list']) {
        if (Array.isArray(value[key])) return value[key];
        if (value[key] instanceof Map) return Array.from(value[key].values());
      }
      return [];
    };
    const summarizeReturn = value => ({
      value: typeof value === 'boolean' || typeof value === 'string'
        ? value
        : value && typeof value === 'object'
          ? {
            ok: value.ok === true,
            opened: value.opened === true,
            deleted: value.deleted === true,
            status: typeof value.status === 'string' ? value.status : '',
          }
          : null,
      success: value === true
        || value === 'opened'
        || value?.ok === true
        || value?.opened === true
        || value?.deleted === true
        || value?.status === 'success',
    });
    for (const [source, surface] of candidates) {
      if (!surface || (typeof surface !== 'object' && typeof surface !== 'function')) continue;
      const methodName = methodNames.find(name => typeof surface[name] === 'function');
      if (!methodName) continue;
      let entry = fallback;
      const listName = listNames.find(name => typeof surface[name] === 'function');
      const listProperty = listProperties.find(name => Array.isArray(surface[name]) || surface[name] instanceof Map);
      if (listName) {
        try {
          const result = await surface[listName].call(surface, { includePayload: false });
          const entries = extractEntries(result);
          entry = entries.find(candidate => candidate?.id === id) || entry;
        } catch (_error) {
          // The operation itself remains the source of truth below.
        }
      } else if (listProperty) {
        const entries = extractEntries(surface[listProperty]);
        entry = entries.find(candidate => candidate?.id === id) || entry;
      }
      try {
        const value = operationName === 'open'
          ? await surface[methodName].call(surface, entry, {
            hideStartup: true,
            replaceOpenProjectTabs: true,
            silent: true,
          })
          : await surface[methodName].call(surface, id, {
            announce: false,
            reason: 'metadata-runtime-test',
          });
        return { available: true, source, method: methodName, called: true, ...summarizeReturn(value) };
      } catch (error) {
        return {
          available: true,
          source,
          method: methodName,
          called: true,
          success: false,
          threw: true,
          error: String(error?.message || error),
        };
      }
    }
    return {
      available: false,
      called: false,
      reason: `public recent-project ${operationName} API is not exposed`,
    };
  }, {
    operationName: operation,
    id: projectId,
    fallback: fallbackEntry,
  });
}

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await waitForEditorReady();
  await closeOptionalPiXiSyncResumeNotice();

  const seeded = await page.evaluate(async ({
    databaseName,
    storeName,
    legacyId,
    v2Id,
    legacyName,
    v2Name,
    legacyPayloadBytes,
  }) => {
    if (typeof window.__pixieedrawWriteAutosaveV2Experimental !== 'function') {
      throw new Error('V2 seed helper __pixieedrawWriteAutosaveV2Experimental is unavailable');
    }
    const legacyV2Write = await window.__pixieedrawWriteAutosaveV2Experimental({ projectId: legacyId });
    const v2Write = await window.__pixieedrawWriteAutosaveV2Experimental({ projectId: v2Id });
    const legacyManifestKey = typeof legacyV2Write?.manifest?.key === 'string' ? legacyV2Write.manifest.key : '';
    const manifestKey = typeof v2Write?.manifest?.key === 'string' ? v2Write.manifest.key : '';
    if (!legacyManifestKey || !manifestKey) {
      throw new Error('V2 seed helper did not return both manifest keys');
    }
    const now = Date.now();
    const legacyProject = {
      type: 'pixieedraw-project',
      packageVersion: 1,
      version: 1,
      // Deliberately unreadable: the failed-open case must preserve the card
      // until the user explicitly confirms deletion.
      document: {
        id: `${legacyId}-document`,
        width: 16,
        height: 16,
        frames: [],
      },
      legacyPayload: 'L'.repeat(legacyPayloadBytes),
    };
    const legacyEntry = {
      id: legacyId,
      accountUserId: '',
      name: legacyName,
      fileName: `${legacyName}.pxd`,
      updatedAt: new Date(now - 1_000).toISOString(),
      autosaveSchemaVersion: 1,
      project: legacyProject,
    };
    const v2Entry = {
      id: v2Id,
      accountUserId: '',
      name: v2Name,
      fileName: `${v2Name}.pxd`,
      updatedAt: new Date(now).toISOString(),
      autosaveSchemaVersion: 2,
      manifestKey,
      storageKind: 'local',
      project: null,
    };
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      store.put(legacyEntry, legacyId);
      store.put(v2Entry, v2Id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    return {
      legacyId,
      v2Id,
      legacyManifestKey,
      manifestKey,
      recentRowsWritten: 2,
      legacyPayloadBytes: legacyProject.legacyPayload.length * 2,
    };
  }, {
    databaseName: AUTOSAVE_DB_NAME,
    storeName: RECENT_PROJECTS_STORE,
    legacyId: legacyProjectId,
    v2Id: v2ProjectId,
    legacyName: legacyProjectName,
    v2Name: v2ProjectName,
    legacyPayloadBytes: LEGACY_PAYLOAD_BYTES,
  });
  assert.equal(seeded.recentRowsWritten, 2, 'the fixture must write exactly one legacy and one V2 recent-project row');
  assert.ok(seeded.legacyPayloadBytes >= LEGACY_PAYLOAD_BYTES * 2, 'the legacy fixture must be large enough to exercise payload retention');
  const legacyV2RecordsBeforeDelete = await readAutosaveV2ProjectRecordCounts(legacyProjectId);
  assert.equal(legacyV2RecordsBeforeDelete.storesComplete, true, 'the V2 schema stores must be available for the legacy-id cleanup check');
  assert.ok(
    legacyV2RecordsBeforeDelete.manifests > 0
      || legacyV2RecordsBeforeDelete.checkpoints > 0
      || legacyV2RecordsBeforeDelete.journals > 0
      || legacyV2RecordsBeforeDelete.thumbnails > 0
      || legacyV2RecordsBeforeDelete.currentManifest,
    'the legacy project id must have V2 data before deletion'
  );

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await waitForEditorReady();
  await closeOptionalPiXiSyncResumeNotice();
  await showLocalProjectList();

  const visibleCards = await readVisibleProjectCards();
  assert.ok(
    visibleCards.some(card => card.name === legacyProjectName),
    'an unreadable legacy project must remain visible as a removable card'
  );
  assert.ok(
    visibleCards.some(card => card.name === v2ProjectName),
    'the V2 metadata row must be visible in the recent-project list'
  );

  const publicSurface = await resolvePublicProjectSurface();
  const publicList = await callPublicRecentList();
  if (publicList.available) {
    assert.equal(publicList.threw, undefined, `the public recent-project list API threw: ${publicList.error || 'unknown error'}`);
    assert.equal(publicList.legacyPresent, true, 'the public recent-project list must retain the unreadable legacy card');
    assert.equal(publicList.v2Present, true, 'the public recent-project list must include the V2 metadata row');
    assert.equal(
      publicList.legacyPayloadResident,
      false,
      `the public recent-project list must not retain the large legacy payload (observed ${publicList.legacyPayloadResidentBytes} bytes)`
    );
  } else {
    console.log('recent-project-metadata-runtime: public list API UNTESTED (no window.app/PiXiEEDrawModules.app surface)');
  }

  const v2OpenFallback = {
    id: v2ProjectId,
    name: v2ProjectName,
    autosaveSchemaVersion: 2,
    manifestKey: seeded.manifestKey,
  };
  const v2Open = await callPublicProjectOperation('open', v2ProjectId, v2OpenFallback);
  if (!v2Open.available) {
    await clickProjectCardOpen(v2ProjectName);
  } else {
    assert.equal(v2Open.threw, undefined, `the public V2 open API threw: ${v2Open.error || 'unknown error'}`);
    assert.equal(isSuccessfulOperation(v2Open), true, 'the public V2 open API must report success');
  }
  await waitForActiveProject(v2ProjectId);
  assert.equal(
    await page.evaluate(id => window.__pixieedrawGetActiveProjectSession?.()?.projectId === id, v2ProjectId),
    true,
    'the V2 metadata row must open the V2 project identified by its recent-project id'
  );

  await showLocalProjectList();
  const legacyOpenFallback = {
    id: legacyProjectId,
    name: legacyProjectName,
    autosaveSchemaVersion: 1,
  };
  const legacyOpen = await callPublicProjectOperation('open', legacyProjectId, legacyOpenFallback);
  if (!legacyOpen.available) {
    await clickProjectCardOpen(legacyProjectName);
    await page.waitForTimeout(1_000);
  } else {
    assert.equal(isSuccessfulOperation(legacyOpen), false, 'the unreadable legacy project must not report a successful open');
  }
  const activeAfterLegacyFailure = await page.evaluate(() => window.__pixiedrawGetActiveProjectSession?.() || null);
  assert.notEqual(
    activeAfterLegacyFailure?.projectId,
    legacyProjectId,
    'a failed legacy open must not activate the unreadable project'
  );
  const cardsAfterLegacyFailure = await readVisibleProjectCards();
  assert.ok(
    cardsAfterLegacyFailure.some(card => card.name === legacyProjectName),
    'a failed legacy open must keep the card so the user can retry or explicitly delete it'
  );
  assert.equal(
    await page.locator('#startupWorkspaceProjectList .startup-workspace__project')
      .filter({ hasText: legacyProjectName })
      .first()
      .isVisible(),
    true,
    'a failed legacy open must keep the project card visible in the project chooser'
  );

  const legacyDelete = await callPublicProjectOperation('delete', legacyProjectId, legacyOpenFallback);
  if (!legacyDelete.available) {
    const legacyCard = page.locator('#startupWorkspaceProjectList .startup-workspace__project')
      .filter({ hasText: legacyProjectName })
      .first();
    await legacyCard.locator('button[data-workspace-project-menu-index]').click({ timeout: 10_000 });
    await legacyCard.locator('button[data-workspace-project-delete-index]').click({ timeout: 10_000 });
    await page.waitForSelector('#recentProjectDeleteConfirmDialog[open]', { timeout: 10_000 });
    await page.locator('#recentProjectDeleteConfirmConfirm').click({ timeout: 10_000 });
  } else {
    assert.equal(legacyDelete.threw, undefined, `the public legacy delete API threw: ${legacyDelete.error || 'unknown error'}`);
    assert.equal(isSuccessfulOperation(legacyDelete), true, 'explicit deletion must report success');
  }
  await page.waitForFunction(
    name => !Array.from(document.querySelectorAll('#startupWorkspaceProjectList .startup-workspace__project'))
      .some(node => node.querySelector('.startup-workspace__project-name')?.textContent === name),
    legacyProjectName,
    { timeout: 20_000 }
  );

  const legacyRowAfterDelete = await readRecentProjectRow(legacyProjectId);
  const v2RowAfterDelete = await readRecentProjectRow(v2ProjectId);
  const legacyV2RecordsAfterDelete = await readAutosaveV2ProjectRecordCounts(legacyProjectId);
  assert.equal(legacyRowAfterDelete, null, 'explicit deletion must remove the unreadable legacy row from recentProjects');
  assert.ok(v2RowAfterDelete, 'deleting the legacy row must not remove the independent V2 recent-project row');
  assert.deepEqual(
    legacyV2RecordsAfterDelete,
    {
      manifests: 0,
      checkpoints: 0,
      journals: 0,
      thumbnails: 0,
      currentManifest: false,
      deletedMarker: true,
      storesComplete: true,
    },
    'deleting a legacy card must also remove V2 records that share the same project id'
  );
  assert.equal(
    await page.evaluate(id => document.querySelector('#startupWorkspaceProjectList')?.textContent?.includes(id) || false, legacyProjectId),
    false,
    'the deleted legacy project id must not leak into the visible project list'
  );
  assert.deepEqual(pageErrors, [], 'recent-project metadata/open/delete flow must not emit page errors');

  console.log(JSON.stringify({
    status: publicList.available ? 'PASS' : 'PASS_WITH_PUBLIC_LIST_UNTESTED',
    targetUrl,
    publicSurface,
    publicList: {
      available: publicList.available,
      source: publicList.source || '',
      method: publicList.method || '',
      legacyPresent: publicList.available ? publicList.legacyPresent : 'UNTESTED',
      v2Present: publicList.available ? publicList.v2Present : 'UNTESTED',
      legacyPayloadResident: publicList.available ? publicList.legacyPayloadResident : 'UNTESTED',
      legacyPayloadResidentBytes: publicList.available ? publicList.legacyPayloadResidentBytes : null,
    },
    fixture: {
      recentRowsWritten: seeded.recentRowsWritten,
      legacyPayloadBytes: seeded.legacyPayloadBytes,
      legacyV2RecordsBeforeDelete,
      legacyV2RecordsAfterDelete,
    },
    v2Open: {
      path: v2Open.available ? `${v2Open.source}:${v2Open.method}` : 'ui-fallback',
      activeProjectId: v2ProjectId,
    },
    legacyOpen: {
      path: legacyOpen.available ? `${legacyOpen.source}:${legacyOpen.method}` : 'ui-fallback',
      failedOpenCardRetained: true,
    },
    delete: {
      path: legacyDelete.available ? `${legacyDelete.source}:${legacyDelete.method}` : 'ui-fallback',
      legacyRowRemaining: Boolean(legacyRowAfterDelete),
      v2RowRemaining: Boolean(v2RowAfterDelete),
    },
    pageErrors,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
