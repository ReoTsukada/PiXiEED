(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectPackageWorkflowUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  let projectPackagePerformanceSequence = 0;

  function beginProjectPackagePerformanceSpan(name, details = null) {
    const perf = window?.performance;
    const id = `${name}:${Date.now().toString(36)}:${++projectPackagePerformanceSequence}`;
    const startMark = `${id}:start`;
    try {
      perf?.mark?.(startMark);
    } catch (_error) {}
    return { name, details, perf, id, startMark, startedAt: perf?.now?.() ?? Date.now() };
  }

  function endProjectPackagePerformanceSpan(span, details = null) {
    if (!span) return;
    const finishedAt = span.perf?.now?.() ?? Date.now();
    const endMark = `${span.id}:end`;
    const mergedDetails = { ...(span.details || {}), ...(details || {}) };
    try {
      span.perf?.mark?.(endMark);
      span.perf?.measure?.(span.name, span.startMark, endMark);
    } catch (_error) {}
    console.info('[pixiedraw-dev:performance]', {
      phase: span.name,
      elapsedMs: Math.round(finishedAt - span.startedAt),
      ...mergedDetails,
    });
  }

  function resolveSnapshotThumbnailCanvasSource(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    const canvases = Array.isArray(snapshot.canvases) && snapshot.canvases.length
      ? snapshot.canvases
      : [snapshot];
    const activeCanvasId = typeof snapshot.activeCanvasId === 'string' ? snapshot.activeCanvasId : '';
    const source = canvases.find(canvas => canvas?.id === activeCanvasId) || canvases[0] || null;
    if (!source) {
      return null;
    }
    const width = Math.max(1, Math.floor(Number(source.width) || Number(snapshot.width) || 0));
    const height = Math.max(1, Math.floor(Number(source.height) || Number(snapshot.height) || 0));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    const frames = Array.isArray(source.frames) && source.frames.length
      ? source.frames
      : (Array.isArray(snapshot.frames) ? snapshot.frames : []);
    if (!frames.length) {
      return null;
    }
    const frameIndex = clamp(Number(source.activeFrame ?? snapshot.activeFrame) || 0, 0, frames.length - 1);
    const frame = frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      return null;
    }
    return {
      canvasCount: canvases.length,
      width,
      height,
      frame,
    };
  }

  function drawSnapshotThumbnailStackDecorations(previewCtx, x, y, width, height, canvasCount) {
    const extraCanvasCount = Math.max(0, Math.floor(Number(canvasCount) || 0) - 1);
    if (!previewCtx || extraCanvasCount <= 0) {
      return;
    }
    const badgeText = `x${Math.max(1, Math.floor(Number(canvasCount) || 1))}`;
    const badgePaddingX = 8;
    const badgeHeight = 22;
    previewCtx.font = '600 13px sans-serif';
    const badgeWidth = Math.max(20, Math.ceil(previewCtx.measureText(badgeText).width) + (badgePaddingX * 2));
    const badgeX = Math.max(4, Math.round(x + width - badgeWidth - 4));
    const badgeY = Math.max(4, Math.round(y + 4));
    previewCtx.fillStyle = 'rgba(7, 13, 24, 0.86)';
    previewCtx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    previewCtx.strokeStyle = 'rgba(230, 240, 255, 0.36)';
    previewCtx.lineWidth = 1;
    previewCtx.strokeRect(badgeX + 0.5, badgeY + 0.5, Math.max(0, badgeWidth - 1), Math.max(0, badgeHeight - 1));
    previewCtx.fillStyle = 'rgba(245, 250, 255, 0.94)';
    previewCtx.textAlign = 'center';
    previewCtx.textBaseline = 'middle';
    previewCtx.fillText(badgeText, badgeX + (badgeWidth / 2), badgeY + (badgeHeight / 2) + 0.5);
  }

  async function generateSnapshotThumbnail(snapshot) {
    const source = resolveSnapshotThumbnailCanvasSource(snapshot);
    if (!source) {
      return null;
    }
    const { width, height, frame, canvasCount } = source;
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offscreenCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offscreenCtx) {
      return null;
    }
    const palette = Array.isArray(snapshot.palette) ? snapshot.palette : [];
    const imageData = offscreenCtx.createImageData(width, height);
    imageData.data.set(compositeFramePixels(frame, width, height, palette));
    offscreenCtx.putImageData(imageData, 0, 0);

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = THUMBNAIL_CANVAS_SIZE;
    previewCanvas.height = THUMBNAIL_CANVAS_SIZE;
    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) {
      return null;
    }
    const hasStackedCanvases = canvasCount > 1;
    previewCtx.fillStyle = 'rgba(12, 20, 32, 0.92)';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    const padding = Math.round((THUMBNAIL_CANVAS_SIZE - THUMBNAIL_MAX_EDGE) / 2);
    const scale = Math.min(
      (THUMBNAIL_CANVAS_SIZE - padding * 2) / width,
      (THUMBNAIL_CANVAS_SIZE - padding * 2) / height,
    );
    const drawWidth = Math.max(1, Math.round(width * scale));
    const drawHeight = Math.max(1, Math.round(height * scale));
    const offsetX = Math.round((THUMBNAIL_CANVAS_SIZE - drawWidth) / 2);
    const offsetY = Math.round((THUMBNAIL_CANVAS_SIZE - drawHeight) / 2);
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(offscreen, 0, 0, width, height, offsetX, offsetY, drawWidth, drawHeight);
    previewCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    previewCtx.lineWidth = 1;
    previewCtx.strokeRect(offsetX + 0.5, offsetY + 0.5, Math.max(0, drawWidth - 1), Math.max(0, drawHeight - 1));
    if (hasStackedCanvases) {
      drawSnapshotThumbnailStackDecorations(previewCtx, offsetX, offsetY, drawWidth, drawHeight, canvasCount);
    }
    return previewCanvas.toDataURL('image/png');
  }

  function getDotStatsApi() {
    return window.PiXiEEDDotStats && typeof window.PiXiEEDDotStats === 'object'
      ? window.PiXiEEDDotStats
      : null;
  }

  function createEmptyTrackedDotStats(dotStatsApi = getDotStatsApi()) {
    if (dotStatsApi && typeof dotStatsApi.normalizeDotStats === 'function') {
      const normalized = dotStatsApi.normalizeDotStats({ totalDots: 0, frameDots: [] });
      if (normalized) {
        return normalized;
      }
    }
    return {
      totalDots: 0,
      frameDots: [],
    };
  }

  function setTrackedProjectDotBaseline(snapshot, dotStats = null) {
    const dotStatsApi = getDotStatsApi();
    const normalizedDotStats = dotStatsApi && typeof dotStatsApi.normalizeDotStats === 'function'
      ? (dotStatsApi.normalizeDotStats(dotStats || { totalDots: 0, frameDots: [] }) || createEmptyTrackedDotStats(dotStatsApi))
      : (dotStats || createEmptyTrackedDotStats(null));
    projectDotCumulativeStats = normalizedDotStats;
    if (!snapshot || !dotStatsApi || typeof dotStatsApi.cloneEditorSnapshot !== 'function') {
      projectDotBaselineSnapshot = null;
      return;
    }
    try {
      projectDotBaselineSnapshot = dotStatsApi.cloneEditorSnapshot(snapshot);
    } catch (error) {
      console.warn('Failed to clone dot tracking baseline snapshot', error);
      projectDotBaselineSnapshot = null;
    }
  }

  function resolveTrackedProjectDotStats(snapshot = null) {
    const dotStatsApi = getDotStatsApi();
    if (!dotStatsApi || typeof dotStatsApi.normalizeDotStats !== 'function') {
      return null;
    }
    const baseStats = dotStatsApi.normalizeDotStats(projectDotCumulativeStats || createEmptyTrackedDotStats(dotStatsApi))
      || createEmptyTrackedDotStats(dotStatsApi);
    const currentSnapshot = snapshot && typeof snapshot === 'object'
      ? snapshot
      : makeHistorySnapshot({ clonePixelData: false });
    let deltaStats = createEmptyTrackedDotStats(dotStatsApi);
    try {
      if (typeof dotStatsApi.countEditorSnapshotDiff === 'function') {
        deltaStats = dotStatsApi.countEditorSnapshotDiff(currentSnapshot, projectDotBaselineSnapshot);
      } else if (typeof dotStatsApi.countEditorSnapshot === 'function') {
        deltaStats = dotStatsApi.countEditorSnapshot(currentSnapshot);
      }
    } catch (error) {
      console.warn('Failed to compute tracked project dot stats', error);
      deltaStats = createEmptyTrackedDotStats(dotStatsApi);
    }
    if (typeof dotStatsApi.combineDotStats === 'function') {
      const combined = dotStatsApi.combineDotStats(baseStats, deltaStats);
      return dotStatsApi.normalizeDotStats(combined) || combined;
    }
    return dotStatsApi.normalizeDotStats(deltaStats) || deltaStats;
  }

  function buildProjectSheetsPayload(activePackagedProject = null) {
    const sheets = [];
    const fallbackId = activeOpenProjectTabId || openProjectTabs[0]?.id || createOpenProjectTabId();
    const activeId = activeOpenProjectTabId || fallbackId;
    const activeProjectId = normalizeAutosaveProjectId(autosaveProjectId || '') || createAutosaveProjectId();
    const fallbackPackagedProject = activeProjectId && typeof resolveStoredLocalProjectPayloadForProjectId === 'function'
      ? resolveStoredLocalProjectPayloadForProjectId(activeProjectId)
      : null;
    const sourceTabs = openProjectTabs.length
      ? openProjectTabs
      : [{
        id: fallbackId,
        projectId: activeProjectId,
        fileName: state.documentName || DEFAULT_DOCUMENT_NAME,
        label: extractDocumentBaseName(state.documentName || DEFAULT_DOCUMENT_NAME),
        source: 'working',
        project: activePackagedProject,
      }];
    sourceTabs.forEach((tab, index) => {
      const isActive = tab?.id && tab.id === activeId;
      const project = isActive && activePackagedProject
        ? activePackagedProject
        : (
          tab?.project && typeof tab.project === 'object'
            ? tab.project
            : (tab?.deferredProjectPayload && typeof tab.deferredProjectPayload === 'object'
              ? tab.deferredProjectPayload
              : (fallbackPackagedProject && typeof extractLocalProjectSheetPayload === 'function'
                ? extractLocalProjectSheetPayload(fallbackPackagedProject, typeof tab?.id === 'string' ? tab.id : '')
                : null))
        );
      if (!project) {
        return;
      }
      const fileName = normalizeDocumentName(
        (isActive ? state.documentName : tab?.fileName)
        || tab?.fileName
        || project?.document?.documentName
        || DEFAULT_DOCUMENT_NAME
      );
      const sheetSharedProjectKey = SHARED_PROJECTS_ENABLED ? getOpenProjectTabSharedKey(tab) : '';
      sheets.push({
        id: tab?.id || createOpenProjectTabId(),
        fileName,
        label: typeof tab?.label === 'string' && tab.label.trim()
          ? tab.label.trim()
          : localizeText(`シート ${index + 1}`, `Sheet ${index + 1}`),
        project,
        unsaved: Boolean(isActive ? hasDocumentUnsavedChanges() : tab?.unsaved),
        source: tab?.source || 'sheet',
        sourceKind: tab?.sourceKind || 'unknown',
        sourceStorageAdapterId: tab?.sourceStorageAdapterId || null,
        sourceProjectToken: tab?.sourceProjectToken || null,
        sourceProjectId: tab?.sourceProjectId || null,
        sourceSheetId: tab?.sourceSheetId || null,
        isImportedSheet: tab?.isImportedSheet === true,
        runtimeProjectId: tab?.runtimeProjectId || null,
        sheetRuntimeId: tab?.sheetRuntimeId || null,
        deferredPayloadKey: tab?.deferredPayloadKey || null,
        sheetPersistenceKey: tab?.sheetPersistenceKey || null,
        localPersistenceKey: tab?.localPersistenceKey || null,
        autosaveV2SheetId: tab?.autosaveV2SheetId || null,
        historyOwnerId: tab?.historyOwnerId || null,
        timelapseOwnerId: tab?.timelapseOwnerId || null,
        updatedAt: project?.updatedAt || tab?.updatedAt || new Date().toISOString(),
        qrEditPayload: normalizeQrEditPayload(tab?.qrEditPayload, activeProjectId),
        ...(sheetSharedProjectKey ? {
          sharedProjectKey: sheetSharedProjectKey,
          sharedProjectBackendId: typeof tab?.sharedProjectBackendId === 'string' ? tab.sharedProjectBackendId.trim() : '',
          sharedProjectRevision: Math.max(0, Math.round(Number(tab?.sharedProjectRevision) || 0)),
          sharedProjectStructureRevision: Math.max(0, Math.round(Number(tab?.sharedProjectStructureRevision) || 0)),
          sharedRoleHint: tab?.sharedRoleHint || '',
          sharedAutoJoin: tab?.sharedAutoJoin !== false,
        } : {}),
      });
    });
    return {
      activeSheetId: activeId || sheets[0]?.id || '',
      sheets,
    };
  }

  function syncActiveProjectSheetForPackagedSave(activePackagedProject = null, snapshot = null) {
    if (!activePackagedProject || typeof activePackagedProject !== 'object') {
      return false;
    }
    const activeId = activeOpenProjectTabId || openProjectTabs[0]?.id || createOpenProjectTabId();
    const activeProjectId = normalizeAutosaveProjectId(autosaveProjectId || '') || createAutosaveProjectId();
    const fileName = normalizeDocumentName(
      snapshot?.documentName
      || state.documentName
      || activePackagedProject?.document?.documentName
      || DEFAULT_DOCUMENT_NAME
    );
    const index = findOpenProjectTabIndex(activeId);
    const current = index >= 0 ? openProjectTabs[index] : null;
    const syncedTab = {
      ...(current && typeof current === 'object' ? current : {}),
      id: activeId,
      projectId: normalizeAutosaveProjectId(current?.projectId || activeProjectId) || activeProjectId,
      fileName,
      label: current?.label || localizeText('シート 1', 'Sheet 1'),
      project: activePackagedProject,
      deferredProjectPayload: activePackagedProject,
      deferredPayloadKey: current?.deferredPayloadKey || current?.sheetPersistenceKey || activeId,
      unsaved: hasDocumentUnsavedChanges(),
      source: current?.source || 'working',
      updatedAt: activePackagedProject.updatedAt || current?.updatedAt || new Date().toISOString(),
      qrEditPayload: normalizeQrEditPayload(current?.qrEditPayload, activeProjectId),
    };
    const lightweightSyncedTab = typeof createLightweightLocalProjectTabState === 'function'
      ? createLightweightLocalProjectTabState(
        syncedTab,
        typeof createLocalProjectEntrySignature === 'function'
          ? createLocalProjectEntrySignature(recentProjectsCache?.get?.(activeProjectId) || null)
          : {}
      )
      : syncedTab;
    if (index >= 0) {
      openProjectTabs[index] = lightweightSyncedTab;
    } else if (!openProjectTabs.length) {
      openProjectTabs.push(lightweightSyncedTab);
    } else {
      openProjectTabs.unshift(lightweightSyncedTab);
    }
    activeOpenProjectTabId = activeId;
    suppressOpenProjectTabAutoInitialize = false;
    return true;
  }

  function buildPackagedProjectPayload(snapshot, { session = null, updatedAt = '', includeSheets = true } = {}) {
    const resolvedDotStats = resolveTrackedProjectDotStats(snapshot);
    const payload = serializeDocumentSnapshot(snapshot);
    const packagedSession = session && typeof session === 'object'
      ? session
      : buildProjectSessionPayload();
    const packaged = {
      type: PROJECT_PACKAGE_TYPE,
      packageVersion: PROJECT_PACKAGE_VERSION,
      version: DOCUMENT_FILE_VERSION,
      document: payload,
      session: packagedSession,
      updatedAt: updatedAt || new Date().toISOString(),
    };
    if (resolvedDotStats) {
      packaged.dotStats = resolvedDotStats;
    }
    if (includeSheets) {
      const activeSheetPackaged = buildPackagedProjectPayload(snapshot, {
        session: packagedSession,
        updatedAt: packaged.updatedAt,
        includeSheets: false,
      });
      syncActiveProjectSheetForPackagedSave(activeSheetPackaged, snapshot);
      const projectSheets = buildProjectSheetsPayload(activeSheetPackaged);
      if (projectSheets.sheets.length > 0) {
        packaged.sheets = projectSheets.sheets;
        packaged.activeSheetId = projectSheets.activeSheetId;
      }
    }
    return packaged;
  }

  function ensurePackagedProjectSheetsForSave(packagedPayload = null, snapshot = null) {
    if (!packagedPayload || typeof packagedPayload !== 'object') {
      return packagedPayload;
    }
    const expectedSheetCount = Math.max(1, openProjectTabs.length || 1);
    const currentSheetCount = Array.isArray(packagedPayload.sheets) ? packagedPayload.sheets.length : 0;
    if (currentSheetCount >= expectedSheetCount) {
      return packagedPayload;
    }
    const activeSheetPackaged = buildPackagedProjectPayload(snapshot || makeHistorySnapshot({ clonePixelData: false }), {
      session: packagedPayload.session || null,
      updatedAt: packagedPayload.updatedAt || '',
      includeSheets: false,
    });
    syncActiveProjectSheetForPackagedSave(activeSheetPackaged, snapshot || null);
    const projectSheets = buildProjectSheetsPayload(activeSheetPackaged);
    if (projectSheets.sheets.length > 0) {
      packagedPayload.sheets = projectSheets.sheets;
      packagedPayload.activeSheetId = projectSheets.activeSheetId;
    }
    return packagedPayload;
  }

  function validatePackagedProjectSheetCountForSave(packagedPayload = null) {
    const openSheetCount = Math.max(1, openProjectTabs.length || 1);
    const packagedSheetCount = countPackagedProjectSheets(packagedPayload);
    if (openSheetCount > 1 && packagedSheetCount < openSheetCount) {
      console.warn('[project-sheets] refusing incomplete sheet save', {
        openSheetCount,
        packagedSheetCount,
        activeOpenProjectTabId,
        tabIds: openProjectTabs.map(tab => tab?.id || ''),
      });
      return false;
    }
    return true;
  }

  function preserveExistingProjectSheetsForSave(packagedPayload = null, previousProject = null) {
    if (!packagedPayload || typeof packagedPayload !== 'object' || !previousProject || typeof previousProject !== 'object') {
      return packagedPayload;
    }
    const previousSheets = Array.isArray(previousProject.sheets)
      ? previousProject.sheets.filter(sheet => sheet && typeof sheet === 'object' && sheet.project && typeof sheet.project === 'object')
      : [];
    const nextSheets = Array.isArray(packagedPayload.sheets)
      ? packagedPayload.sheets.filter(sheet => sheet && typeof sheet === 'object' && sheet.project && typeof sheet.project === 'object')
      : [];
    if (previousSheets.length <= nextSheets.length || previousSheets.length <= 1) {
      return packagedPayload;
    }
    const mergedSheets = previousSheets.map(sheet => ({ ...sheet }));
    const preferredActiveId = typeof packagedPayload.activeSheetId === 'string' ? packagedPayload.activeSheetId : '';
    nextSheets.forEach((sheet, index) => {
      const sheetId = typeof sheet.id === 'string' ? sheet.id : '';
      let replaceIndex = sheetId ? mergedSheets.findIndex(candidate => candidate?.id === sheetId) : -1;
      if (replaceIndex < 0 && preferredActiveId) {
        replaceIndex = mergedSheets.findIndex(candidate => candidate?.id === preferredActiveId);
      }
      if (replaceIndex < 0) {
        replaceIndex = Math.min(index, mergedSheets.length - 1);
      }
      mergedSheets[replaceIndex] = {
        ...mergedSheets[replaceIndex],
        ...sheet,
        id: mergedSheets[replaceIndex]?.id || sheet.id || createOpenProjectTabId(),
      };
    });
    packagedPayload.sheets = mergedSheets;
    packagedPayload.activeSheetId = preferredActiveId
      || (typeof previousProject.activeSheetId === 'string' ? previousProject.activeSheetId : '')
      || mergedSheets[0]?.id
      || '';
    return packagedPayload;
  }

  function resolvePackagedProjectDotStats(packagedPayload, snapshot = null) {
    const dotStatsApi = getDotStatsApi();
    if (!dotStatsApi || typeof dotStatsApi.normalizeDotStats !== 'function') {
      return null;
    }
    return dotStatsApi.normalizeDotStats(packagedPayload?.dotStats || null);
  }

  function getPackagedProjectFirstSheet(packagedPayload = null) {
    const sheets = Array.isArray(packagedPayload?.sheets) ? packagedPayload.sheets : [];
    return sheets.find(sheet => sheet && typeof sheet === 'object' && sheet.project && typeof sheet.project === 'object') || null;
  }

  function countPackagedProjectSheets(packagedPayload = null) {
    return Array.isArray(packagedPayload?.sheets)
      ? packagedPayload.sheets.filter(sheet => sheet && typeof sheet === 'object' && sheet.project && typeof sheet.project === 'object').length
      : 0;
  }

  async function verifyRecentProjectSheetSave(projectId = '', expectedSheetCount = 0) {
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
    const safeExpectedCount = Math.max(0, Math.round(Number(expectedSheetCount) || 0));
    if (!AUTOSAVE_SUPPORTED || !normalizedProjectId || safeExpectedCount <= 1) {
      return true;
    }
    const entries = await loadRecentProjectsMetadata({ includeAllAccounts: true });
    const savedEntry = entries.find(entry => normalizeAutosaveProjectId(entry?.id || '') === normalizedProjectId) || null;
    const savedSheetCount = countPackagedProjectSheets(savedEntry?.project || null);
    if (savedSheetCount < safeExpectedCount) {
      console.warn('[project-sheets] saved sheet count mismatch', {
        projectId: normalizedProjectId,
        expectedSheetCount: safeExpectedCount,
        savedSheetCount,
      });
      return false;
    }
    return true;
  }

  function getRecentProjectListSnapshot(packagedPayload = null, fallbackSnapshot = null) {
    const firstSheet = getPackagedProjectFirstSheet(packagedPayload);
    if (!firstSheet?.project) {
      return fallbackSnapshot;
    }
    try {
      return snapshotFromParsedDocumentValue(firstSheet.project)?.snapshot || fallbackSnapshot;
    } catch (error) {
      console.warn('Failed to resolve first sheet snapshot for project list', error);
      return fallbackSnapshot;
    }
  }

  function getRecentProjectListFileName(packagedPayload = null, fallbackSnapshot = null) {
    const firstSheet = getPackagedProjectFirstSheet(packagedPayload);
    return normalizeDocumentName(
      firstSheet?.fileName
      || firstSheet?.project?.document?.documentName
      || fallbackSnapshot?.documentName
      || DEFAULT_DOCUMENT_NAME
    );
  }

  function getRecentProjectEntryFileName(previousEntry = null, packagedPayload = null, fallbackSnapshot = null) {
    return normalizeDocumentName(
      previousEntry?.fileName
      || (previousEntry?.name ? `${extractDocumentBaseName(previousEntry.name)}${PROJECT_FILE_EXTENSION}` : '')
      || fallbackSnapshot?.documentName
      || packagedPayload?.document?.documentName
      || DEFAULT_DOCUMENT_NAME
    );
  }

  function schedulePackagedProjectDotSync(projectId, dotStats) {
    const resolvedProjectId = normalizeAutosaveProjectId(projectId || '');
    if (!resolvedProjectId || !dotStats || dotStats.totalDots <= 0) {
      return;
    }
    const dotStatsApi = window.PiXiEEDDotStats && typeof window.PiXiEEDDotStats === 'object'
      ? window.PiXiEEDDotStats
      : null;
    if (!dotStatsApi || typeof dotStatsApi.syncProjectDotCount !== 'function') {
      return;
    }
    window.setTimeout(() => {
      dotStatsApi.syncProjectDotCount({
        projectId: resolvedProjectId,
        dotCount: dotStats.totalDots,
        app: 'pixiedraw',
      }).catch(error => {
        console.warn('Failed to sync PiXiEEDraw dot total', error);
      });
    }, 0);
  }

  async function recordRecentProjectSnapshot(
    snapshot,
    packagedPayload,
    {
      projectId = '',
      skipThumbnail = false,
      thumbnailIntervalMs = LOCAL_PROJECT_THUMBNAIL_UPDATE_INTERVAL_MS,
      activateProject = true,
      journalPayload = null,
    } = {}
  ) {
    if (!AUTOSAVE_SUPPORTED) {
      return null;
    }
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    try {
      const resolvedProjectId = activateProject
        ? setActiveAutosaveProjectId(projectId || autosaveProjectId || createAutosaveProjectId())
        : (normalizeAutosaveProjectId(projectId || autosaveProjectId || '') || createAutosaveProjectId());
      const initialEntries = await loadRecentProjectsMetadata();
      const previousEntry = initialEntries.find(entry => entry?.id === resolvedProjectId) || null;
      const sharedProjectKey = SHARED_PROJECTS_ENABLED
        ? (
          isSharedRecentProjectEntry(previousEntry)
            ? normalizeMultiProjectKey(previousEntry.sharedProjectKey || '')
            : getSharedProjectKeyFromProjectId(resolvedProjectId)
        )
        : '';
      if (sharedProjectKey) {
        const fileName = getRecentProjectEntryFileName(previousEntry, packagedPayload, snapshot);
        const displayName = previousEntry?.name
          ? extractDocumentBaseName(previousEntry.name)
          : extractDocumentBaseName(fileName);
        return await recordSharedProjectLightweightLocalSave({
          projectId: resolvedProjectId,
          projectKey: sharedProjectKey,
          name: displayName,
          fileName,
          thumbnail: previousEntry?.thumbnail || null,
        });
      }
      const packageSpan = beginProjectPackagePerformanceSpan('pixiedraw-dev:autosave:package', {
        projectId: resolvedProjectId,
      });
      let savePlan;
      let packaged;
      try {
        savePlan = typeof buildActiveLocalProjectSavePlan === 'function'
          ? buildActiveLocalProjectSavePlan({
            projectId: resolvedProjectId,
            snapshot,
            packagedPayload,
            buildPackagedProjectPayload,
            buildAutosaveSessionPayload: buildProjectSessionPayload,
          })
          : null;
        packaged = savePlan?.packagedPayload && typeof savePlan.packagedPayload === 'object'
          ? savePlan.packagedPayload
          : (
            packagedPayload && typeof packagedPayload === 'object'
              ? packagedPayload
              : buildPackagedProjectPayload(snapshot)
          );
        ensurePackagedProjectSheetsForSave(packaged, snapshot);
        preserveExistingProjectSheetsForSave(packaged, previousEntry?.project || null);
        if (!validatePackagedProjectSheetCountForSave(packaged)) {
          throw new Error('Refusing to save incomplete project sheets');
        }
      } finally {
        endProjectPackagePerformanceSpan(packageSpan, {
          sheetCount: countPackagedProjectSheets(packaged),
        });
      }
      const listSnapshot = (savePlan?.journalPayload && snapshot)
        ? snapshot
        : getRecentProjectListSnapshot(packaged, snapshot);
      const listSheet = getPackagedProjectFirstSheet(packaged);
      const listThumbnailSheetId = typeof listSheet?.id === 'string' ? listSheet.id : '';
      const fileName = getRecentProjectEntryFileName(previousEntry, packaged, snapshot);
      const displayName = previousEntry?.name
        ? extractDocumentBaseName(previousEntry.name)
        : extractDocumentBaseName(fileName);
      const nowTs = Date.now();
      const previousUpdatedAt = previousEntry?.updatedAt ? Date.parse(previousEntry.updatedAt) : NaN;
      const safeThumbnailInterval = Math.max(
        0,
        Math.round(Number(thumbnailIntervalMs) || LOCAL_PROJECT_THUMBNAIL_UPDATE_INTERVAL_MS)
      );
      const shouldRefreshThumbnail =
        !skipThumbnail
        && (
          !previousEntry?.thumbnail
          || (listThumbnailSheetId && previousEntry?.thumbnailSheetId !== listThumbnailSheetId)
          || !Number.isFinite(previousUpdatedAt)
          || (nowTs - previousUpdatedAt >= safeThumbnailInterval)
        );
      const thumbnailSpan = beginProjectPackagePerformanceSpan('pixiedraw-dev:autosave:thumbnail', {
        refresh: shouldRefreshThumbnail,
      });
      let thumbnail;
      try {
        thumbnail = shouldRefreshThumbnail
          ? (await generateSnapshotThumbnail(listSnapshot || snapshot))
          : previousEntry.thumbnail;
      } finally {
        endProjectPackagePerformanceSpan(thumbnailSpan);
      }
      const dotStats = resolvePackagedProjectDotStats(packaged, snapshot);
      const updatedEntry = {
        id: resolvedProjectId,
        accountUserId: getCurrentRecentProjectAccountUserId(),
        name: displayName,
        fileName,
        updatedAt: packaged.updatedAt || new Date().toISOString(),
        thumbnail: thumbnail || null,
        thumbnailSheetId: listThumbnailSheetId || '',
        project: packaged,
      };
      const resolvedJournalPayload = journalPayload && typeof journalPayload === 'object'
        ? journalPayload
        : (savePlan?.journalPayload && typeof savePlan.journalPayload === 'object' ? savePlan.journalPayload : null);
      if (resolvedJournalPayload) {
        updatedEntry.projectJournal = resolvedJournalPayload;
        updatedEntry.checkpointId = String(resolvedJournalPayload.checkpointId || savePlan?.checkpointId || '');
        updatedEntry.dirtyOpCount = Math.max(
          0,
          Math.round(Number(resolvedJournalPayload.dirtyOpCount) || Number(savePlan?.dirtyOpCount) || 0)
        );
      }
      if (dotStats) {
        updatedEntry.dotStats = dotStats;
      }
      const latestEntries = await loadRecentProjectsMetadata();
      const latestPreviousEntry = latestEntries.find(entry => entry?.id === resolvedProjectId) || previousEntry;
      const workingEntries = latestEntries.filter(entry => entry && entry.id && entry.id !== resolvedProjectId);
      workingEntries.unshift({
        ...(latestPreviousEntry || {}),
        ...updatedEntry,
      });
      workingEntries.sort((a, b) => {
        const aTime = typeof a?.updatedAt === 'string' ? a.updatedAt : '';
        const bTime = typeof b?.updatedAt === 'string' ? b.updatedAt : '';
        return bTime.localeCompare(aTime);
      });
      const indexedDbSpan = beginProjectPackagePerformanceSpan('pixiedraw-dev:autosave:indexeddb-write', {
        projectId: resolvedProjectId,
      });
      try {
        await saveRecentProjectsList(latestEntries, workingEntries);
      } finally {
        endProjectPackagePerformanceSpan(indexedDbSpan);
      }
      const expectedSavedSheetCount = countPackagedProjectSheets(packaged);
      if (!await verifyRecentProjectSheetSave(resolvedProjectId, expectedSavedSheetCount)) {
        throw new Error(`Recent project sheet save verification failed (${expectedSavedSheetCount})`);
      }
      setRecentProjectsCache(workingEntries);
      if (dotStats) {
        setTrackedProjectDotBaseline(snapshot, dotStats);
        schedulePackagedProjectDotSync(resolvedProjectId, dotStats);
      }
      return updatedEntry;
    } catch (error) {
      console.warn('Failed to record recent project snapshot', error);
      return null;
    }
  }


        return Object.freeze({
        resolveSnapshotThumbnailCanvasSource,
        drawSnapshotThumbnailStackDecorations,
        generateSnapshotThumbnail,
        getDotStatsApi,
        createEmptyTrackedDotStats,
        setTrackedProjectDotBaseline,
        resolveTrackedProjectDotStats,
        buildProjectSheetsPayload,
        syncActiveProjectSheetForPackagedSave,
        buildPackagedProjectPayload,
        ensurePackagedProjectSheetsForSave,
        validatePackagedProjectSheetCountForSave,
        preserveExistingProjectSheetsForSave,
        resolvePackagedProjectDotStats,
        getPackagedProjectFirstSheet,
        countPackagedProjectSheets,
        verifyRecentProjectSheetSave,
        getRecentProjectListSnapshot,
        getRecentProjectListFileName,
        getRecentProjectEntryFileName,
        schedulePackagedProjectDotSync,
        recordRecentProjectSnapshot,
        });
      }
    })(scope);
  }

  root.projectPackageWorkflowUtils = Object.freeze({
    createProjectPackageWorkflowUtils,
  });
})();
