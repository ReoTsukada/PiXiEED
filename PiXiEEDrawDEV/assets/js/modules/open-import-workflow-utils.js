(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenImportWorkflowUtils(rawScope = {}) {
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
  let importPerformanceSequence = 0;

  function beginImportPerformanceSpan(name, details = null) {
    const perf = window?.performance;
    const id = `${name}:${Date.now().toString(36)}:${++importPerformanceSequence}`;
    const startMark = `${id}:start`;
    try {
      perf?.mark?.(startMark);
    } catch (_error) {}
    return { name, details, perf, id, startMark, startedAt: perf?.now?.() ?? Date.now() };
  }

  function endImportPerformanceSpan(span, details = null) {
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

  function getProjectCommandLockDescriptor(source = '', tabOptions = null) {
    const sourceKind = String(tabOptions?.sourceKind || '');
    if (sourceKind === 'import-gif') return { owner: 'gif-import', command: 'import-gif' };
    if (sourceKind === 'import-image') return { owner: 'png-import', command: 'import-image' };
    if (source === 'local-recent') return { owner: 'recent-project-open', command: 'append-recent-project' };
    return { owner: 'project-open-input', command: 'append-project-input' };
  }

  async function openImageFileAsNewProject(file, { source = 'import', qrEditPayload = null } = {}) {
    if (!ensureCurrentClientCanReplaceActiveProject()) {
      return false;
    }
    if (isProjectCommandLocked()) {
      return false;
    }
    const lock = acquireProjectCommandLock({ owner: isGifFile?.(file) ? 'gif-import' : 'png-import', command: 'import-image-new-project' });
    if (!lock?.ok) return false;
    try {
    if (openProjectTabs.length && activeOpenProjectTabId) {
      const persistedCurrentProject = await persistActiveOpenProjectTab({ flushAutosave: true });
      if (!persistedCurrentProject) {
        return false;
      }
    }
    const candidate = await buildImageSheetImportCandidate(file, isGifFile?.(file) ? 'gif' : 'image');
    if (!candidate?.project || typeof candidate.project !== 'object') {
      return false;
    }
    const loaded = await loadDocumentFromProjectPayload(candidate.project, {
      suppressAutosaveStatus: true,
      forceV2WorkingCopy: true,
      sourceKind: candidate.sourceKind || 'import-image',
      sourceProjectToken: candidate.sourceProjectToken || null,
      sourceStorageAdapterId: null,
      lastSavedStorageAdapterId: null,
      sourcePersistenceState: {
        sourceStorageAdapterId: null,
        sourceKind: candidate.sourceKind || 'import-image',
        sourceProjectToken: candidate.sourceProjectToken || null,
        lastSavedStorageAdapterId: null,
      },
      qrEditPayload,
    });
    if (!loaded || loaded === 'deferred') return false;
    const tab = getActiveOpenProjectTab?.() || null;
    if (qrEditPayload) {
      activateQrEditMode({
        ...qrEditPayload,
        projectId: tab?.projectId || autosaveProjectId || '',
      });
    }
    renderOpenProjectTabs();
    return true;
    } finally {
      releaseProjectCommandLock({ token: lock.token, owner: lock.owner });
    }
  }

  async function openDocumentAsNewProject(item, { source = 'open' } = {}) {
    if (!ensureCurrentClientCanReplaceActiveProject()) {
      return false;
    }
    if (!canCurrentClientImportExternalData()) {
      setMultiStatus(localizeText('参加/視聴モードでは読み込み/インポートはマスターのみ操作できます', 'In participant/viewer mode, only the master can open/import files'), 'warn');
      return false;
    }
    if (isProjectCommandLocked()) {
      return false;
    }

    let file = null;
    let handle = null;
    const lock = acquireProjectCommandLock({ owner: 'project-open-input', command: 'open-project-new' });
    if (!lock?.ok) return false;
    try {
      if (item && typeof item.getFile === 'function') {
        handle = item;
        file = await item.getFile();
      } else if (item && typeof item.text === 'function') {
        file = item;
      }
    } catch (error) {
      console.warn('Document open failed', error);
      updateAutosaveStatus('ドキュメントを開けませんでした', 'error');
      releaseProjectCommandLock({ token: lock.token, owner: lock.owner });
      return false;
    }

    if (file && isImportableImageFile(file)) {
      releaseProjectCommandLock({ token: lock.token, owner: lock.owner });
      return await openImageFileAsNewProject(file, { source });
    }
    if (!file || typeof file.arrayBuffer !== 'function') {
      updateAutosaveStatus('ドキュメントを開けませんでした', 'error');
      releaseProjectCommandLock({ token: lock.token, owner: lock.owner });
      return false;
    }

    let preparedSnapshot = null;
    try {
      try {
        if (typeof snapshotFromDocumentBlob === 'function') {
          // Parse once before persisting the current project. The validated
          // snapshot is handed to the actual load below, so large V1 JSON or
          // V2 archives are not decoded and expanded a second time.
          preparedSnapshot = await snapshotFromDocumentBlob(file);
        } else {
          preparedSnapshot = snapshotFromDocumentText(await file.text());
        }
      } catch (parseError) {
        console.warn('Failed to parse document', parseError);
        updateAutosaveStatus('ドキュメントの読み込みに失敗しました', 'error');
        return false;
      }
      if (openProjectTabs.length && activeOpenProjectTabId) {
        const persistedCurrentProject = await persistActiveOpenProjectTab({ flushAutosave: true });
        if (!persistedCurrentProject) {
          return false;
        }
      }
      const loaded = typeof loadDocumentFromBlob === 'function'
        ? await loadDocumentFromBlob(file, handle, {
          suppressAutosaveStatus: true,
          sourceKind: 'file',
          fileLoad: true,
          sourceFileName: file.name || '',
          preparedSnapshot,
        })
        : await loadDocumentFromText(await file.text(), handle, {
          suppressAutosaveStatus: true,
          sourceKind: 'file',
          fileLoad: true,
          sourceFileName: file.name || '',
          preparedSnapshot,
        });
      if (!loaded || loaded === 'deferred') {
        return false;
      }
      updateAutosaveStatus(
        localizeText('ファイルを新規プロジェクトとして開きました', 'Opened file as a new project'),
        'success'
      );
      renderOpenProjectTabs();
      return true;
    } catch (error) {
      console.warn('Document load failed', error);
      updateAutosaveStatus('ドキュメントを開けませんでした', 'error');
      return false;
    } finally {
      releaseProjectCommandLock({ token: lock.token, owner: lock.owner });
    }
  }

  function tryParseJsonSafe(text) {
    if (typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function resolveOpenProjectPayloadFileName(project = null, fallbackName = DEFAULT_DOCUMENT_NAME) {
    return normalizeDocumentName(
      fallbackName
      || project?.documentName
      || project?.document?.documentName
      || DEFAULT_DOCUMENT_NAME
    );
  }

  function normalizeExternalProjectFileCandidate(project, sourceStorageAdapterId = null) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      return null;
    }
    if (project.canonicalPayloadFormat === 'v2') {
      const validation = typeof validateCanonicalV2ProjectPayload === 'function'
        ? validateCanonicalV2ProjectPayload(project)
        : { ok: true };
      return validation?.ok ? project : null;
    }
    if (typeof normalizeExternalProjectToCanonicalV2 !== 'function'
      || typeof validateCanonicalV2ProjectPayload !== 'function') {
      return project;
    }
    const normalized = normalizeExternalProjectToCanonicalV2({
      sourceKind: 'file',
      sourceAdapterId: typeof sourceStorageAdapterId === 'string' && sourceStorageAdapterId ? sourceStorageAdapterId : null,
      decodedPayload: project,
      sourceMetadata: {
        importedFormat: sourceStorageAdapterId === 'pixieedraw-v1-json' ? 'v1-json' : 'external-project',
      },
    });
    if (!normalized?.ok || !normalized.canonicalPayload) {
      return null;
    }
    const validation = validateCanonicalV2ProjectPayload(normalized.canonicalPayload);
    if (!validation?.ok) {
      return null;
    }
    console.info('[pixiedraw-dev:canonical-import]', {
      phase: 'file-tab-normalize-success',
      sourceAdapterId: sourceStorageAdapterId || null,
      typedByteLength: normalized.metrics?.typedByteLength || 0,
      sheetCount: normalized.metrics?.sheetCount || 0,
      frameCount: normalized.metrics?.frameCount || 0,
    });
    return normalized.canonicalPayload;
  }

  async function readProjectPayloadFromOpenItem(item) {
    if (!item) {
      return null;
    }
    if (item && typeof item === 'object' && item.project && typeof item.project === 'object') {
      return {
        project: item.project,
        fileName: resolveOpenProjectPayloadFileName(item.project, item.name || item.fileName || DEFAULT_DOCUMENT_NAME),
        unsaved: Boolean(item.unsaved),
        sourceStorageAdapterId: item.sourceStorageAdapterId || null,
        sourceKind: item.sourceKind || 'unknown',
        sourceProjectId: item.projectId || item.sourceProjectId || item.id || null,
        sourceSheetId: item.sourceSheetId || item.sheetId || null,
        sourceProjectToken: item.sourceProjectToken || (typeof createProjectPersistenceToken === 'function'
          ? createProjectPersistenceToken(item.sourceKind || 'unknown')
          : null),
        lastSavedStorageAdapterId: item.lastSavedStorageAdapterId || null,
      };
    }
    let file = null;
    let fallbackName = DEFAULT_DOCUMENT_NAME;
    if (item && typeof item.getFile === 'function') {
      try {
        file = await item.getFile();
        fallbackName = file?.name || item.name || DEFAULT_DOCUMENT_NAME;
      } catch (_error) {
        return null;
      }
    } else if (item && typeof item.text === 'function') {
      file = item;
      fallbackName = item.name || DEFAULT_DOCUMENT_NAME;
    }
    if (!file || isImportableImageFile(file) || typeof file.arrayBuffer !== 'function') {
      return null;
    }
    try {
      if (typeof parseProjectStorageBlob === 'function') {
        const parsedResult = await parseProjectStorageBlob(file);
        const parsed = parsedResult && Object.prototype.hasOwnProperty.call(parsedResult, 'parsed')
          ? parsedResult.parsed
          : parsedResult;
        const project = normalizeExternalProjectFileCandidate(parsed, parsedResult?.adapterId || null);
        if (project && typeof project === 'object') {
          return {
            project,
            fileName: resolveOpenProjectPayloadFileName(project, fallbackName),
            unsaved: false,
            sourceStorageAdapterId: parsedResult?.adapterId || null,
            sourceKind: 'file',
            sourceProjectId: null,
            sourceSheetId: typeof project.activeSheetId === 'string' ? project.activeSheetId : null,
            sourceProjectToken: typeof createProjectPersistenceToken === 'function'
              ? createProjectPersistenceToken('file')
              : null,
            lastSavedStorageAdapterId: parsedResult?.adapterId || null,
          };
        }
        return null;
      }
      const parsed = tryParseJsonSafe(await file.text());
      const project = normalizeExternalProjectFileCandidate(parsed, null);
      if (!project || typeof project !== 'object') {
        return null;
      }
      return {
        project,
        fileName: resolveOpenProjectPayloadFileName(project, fallbackName),
        unsaved: false,
        sourceStorageAdapterId: null,
        sourceKind: 'file',
        sourceProjectId: null,
        sourceSheetId: typeof project.activeSheetId === 'string' ? project.activeSheetId : null,
        sourceProjectToken: typeof createProjectPersistenceToken === 'function'
          ? createProjectPersistenceToken('file')
          : null,
        lastSavedStorageAdapterId: null,
      };
    } catch (_error) {
      return null;
    }
  }

  async function appendProjectPayloadAsOpenTab({
    project = null,
    parentProjectId = '',
    fileName = DEFAULT_DOCUMENT_NAME,
    unsaved = false,
    source = 'open',
    tabOptions = null,
    sourceStorageAdapterId = null,
    sourceKind = 'unknown',
    sourceProjectToken = null,
    lastSavedStorageAdapterId = null,
    isImportedSheet = false,
    canonicalPayloadFormat = '',
    canonicalSourceMetadata = null,
  } = {}) {
    if (!project || typeof project !== 'object') {
      return null;
    }
    const normalizedParentProjectId = normalizeAutosaveProjectId(parentProjectId || autosaveProjectId || '')
      || createAutosaveProjectId();
    const tabProjectId = normalizedParentProjectId;
    const previousActiveId = activeOpenProjectTabId;
    const nextTab = createOpenProjectSheetTabFromPackagedProject({
      project,
      projectId: tabProjectId,
      fileName,
      label: extractDocumentBaseName(fileName),
      unsaved,
      source,
      updatedAt: project?.updatedAt || new Date().toISOString(),
      qrEditPayload: tabOptions?.qrEditPayload || null,
      sourceStorageAdapterId,
      sourceKind,
      sourceProjectToken,
      lastSavedStorageAdapterId,
      isImportedSheet,
    });
    if (!nextTab) {
      return null;
    }
    if (canonicalPayloadFormat === 'v2') {
      nextTab.canonicalPayloadFormat = 'v2';
      nextTab.canonicalSchemaVersion = Math.max(1, Math.round(Number(project?.canonicalSchemaVersion) || 1));
      nextTab.canonicalSourceMetadata = canonicalSourceMetadata && typeof canonicalSourceMetadata === 'object'
        ? canonicalSourceMetadata
        : null;
    }
    nextTab.residentProjectLoaded = true;
    openProjectTabs.push(nextTab);
    activeOpenProjectTabId = nextTab.id;
    suppressOpenProjectTabAutoInitialize = false;
    renderOpenProjectTabs();
    const loaded = await loadDocumentFromProjectPayload(project, {
      projectId: tabProjectId,
      suppressAutosaveStatus: true,
      qrEditPayload: tabOptions?.qrEditPayload || null,
      suppressProjectSheetsRestore: true,
      sourcePersistenceState: {
        sourceStorageAdapterId,
        sourceKind,
        sourceProjectToken,
        lastSavedStorageAdapterId,
      },
    });
    if (!loaded || loaded === 'deferred') {
      const insertedIndex = findOpenProjectTabIndex(nextTab.id);
      if (insertedIndex >= 0) {
        openProjectTabs.splice(insertedIndex, 1);
      }
      activeOpenProjectTabId = previousActiveId;
      suppressOpenProjectTabAutoInitialize = false;
      renderOpenProjectTabs();
      return null;
    }
    queueProjectTabViewportReset(nextTab.id);
    return openProjectTabs[findOpenProjectTabIndex(nextTab.id)] || nextTab;
  }

  async function loadRecentProjectPackagedPayload(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    if (Number(entry.autosaveSchemaVersion) === 2 && typeof readAutosaveV2PrimaryProject === 'function') {
      try {
        const restored = await readAutosaveV2PrimaryProject(entry.id);
        if (restored && typeof restored === 'object') {
          return restored;
        }
      } catch (error) {
        console.warn('Failed to restore V2 recent project payload', error);
      }
    }
    if (typeof reconstructLocalRecentProjectPayload === 'function') {
      const reconstructed = reconstructLocalRecentProjectPayload(entry);
      if (reconstructed && typeof reconstructed === 'object') {
        return reconstructed;
      }
    }
    if (entry.project && typeof entry.project === 'object') {
      return entry.project;
    }
    if (!entry.handle || typeof entry.handle.getFile !== 'function') {
      return null;
    }
    try {
      const file = await entry.handle.getFile();
      const text = await file.text();
      return tryParseJsonSafe(text);
    } catch (error) {
      console.warn('Failed to read recent project payload for tab open', error);
      return null;
    }
  }

  async function appendPackagedProjectTab({
    project = null,
    projectId = '',
    fileName = DEFAULT_DOCUMENT_NAME,
    unsaved = false,
    source = 'open',
    updatedAt = '',
    activateOptions = {},
    skipBusyGuardOnActivate = false,
    commandLock = null,
    ...extraTabFields
  } = {}) {
    if (!project || typeof project !== 'object') {
      return null;
    }
    ensureOpenProjectTabsInitialized();
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
    if (normalizedProjectId) {
      const existingIndex = findOpenProjectTabIndexByProjectId(normalizedProjectId);
      if (existingIndex >= 0) {
        const existingTab = openProjectTabs[existingIndex];
        const activated = await activateOpenProjectTab(existingTab?.id || '', {
          skipPersistCurrent: true,
          announce: false,
          skipBusyGuard: skipBusyGuardOnActivate,
          commandLock,
          ...activateOptions,
        });
        return activated ? existingTab : null;
      }
    }
    const normalizedFileName = normalizeDocumentName(fileName || project?.documentName || DEFAULT_DOCUMENT_NAME);
    const newTabId = createOpenProjectTabId();
    const nextTab = {
      id: newTabId,
      projectId: normalizedProjectId || createAutosaveProjectId(),
      fileName: normalizedFileName,
      label: extractDocumentBaseName(normalizedFileName),
      project,
      unsaved: Boolean(unsaved),
      source,
      updatedAt: updatedAt || project?.updatedAt || new Date().toISOString(),
      residentProjectLoaded: source === 'open',
      ...extraTabFields,
    };
    openProjectTabs.push(nextTab);
    suppressOpenProjectTabAutoInitialize = false;
    renderOpenProjectTabs();
    const activated = await activateOpenProjectTab(newTabId, {
      skipPersistCurrent: true,
      announce: false,
      skipBusyGuard: skipBusyGuardOnActivate,
      commandLock,
      ...activateOptions,
    });
    if (!activated) {
      const insertedIndex = findOpenProjectTabIndex(newTabId);
      if (insertedIndex >= 0) {
        openProjectTabs.splice(insertedIndex, 1);
      }
      renderOpenProjectTabs();
      return null;
    }
    return openProjectTabs[findOpenProjectTabIndex(newTabId)] || nextTab;
  }

  async function openRecentProjectAsTab(entry, { hideStartup = true, appendOnly = false } = {}) {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const endStartupProgress = hideStartup || startupVisible
      ? beginStartupProgress(localizeText('プロジェクトを開いています…', 'Opening project...'))
      : null;
    try {
      if (!ensureCurrentClientCanReplaceActiveProject()) {
        return false;
      }
      const projectId = normalizeAutosaveProjectId(entry.id || '');
      const latestEntry = projectId
        ? ((await loadRecentProjectsMetadata()).find(candidate => candidate?.id === projectId) || entry)
        : entry;
      if (isProjectCommandLocked()) {
        updateAutosaveStatus(localizeText('プロジェクト切替の完了を待ってください', 'Wait for the current project switch to finish'), 'info');
        return false;
      }
      ensureOpenProjectTabsInitialized();
      const existingSwitch = await switchToOpenProjectTabForRecentProjectEntry(latestEntry, {
        hideStartup,
        silent: false,
      });
      if (existingSwitch.found) {
        return existingSwitch.switched;
      }
      const shouldReuseActiveTab = !appendOnly && canReuseActiveOpenProjectTabForRecentEntry(entry);
      const source = 'local-recent';
      const lock = acquireProjectCommandLock({ owner: 'recent-project-open', command: 'open-recent-project' });
      if (!lock?.ok) return false;
      try {
        await persistActiveOpenProjectTab({ flushAutosave: true });
        const packaged = await loadRecentProjectPackagedPayload(latestEntry);
        if (packaged && typeof packaged === 'object') {
          const fileName = normalizeDocumentName(
            latestEntry?.name
            || packaged?.documentName
            || packaged?.document?.documentName
            || DEFAULT_DOCUMENT_NAME
          );
          const nextTab = await appendPackagedProjectTab({
            project: packaged,
            projectId: projectId || createAutosaveProjectId(),
            fileName,
            unsaved: Boolean(latestEntry?.unsaved),
            source,
            updatedAt: latestEntry?.updatedAt || packaged?.updatedAt || new Date().toISOString(),
            skipBusyGuardOnActivate: true,
            commandLock: lock,
            activateOptions: {
              skipPersistCurrent: true,
              announce: false,
            },
          });
          if (!nextTab) {
            return false;
          }
          queueProjectTabViewportReset(nextTab.id);
          if (hideStartup) {
            hideStartupScreen();
          }
          updateAutosaveStatus(
            localizeText('端末内プロジェクトをシートとして追加しました', 'Added local project as a sheet'),
            'success'
          );
          return true;
        }
        const loaded = await openRecentProject(entry, {
          hideStartup: false,
          silent: true,
          allowProjectMismatchLoad: true,
        });
        if (!loaded) {
          return false;
        }
        const nextTab = shouldReuseActiveTab
          ? replaceActiveOpenProjectTabFromCurrentState({
              source,
              projectId: projectId || autosaveProjectId,
            })
          : appendOpenProjectTabFromCurrentState({
              activate: true,
              source,
              projectId: projectId || autosaveProjectId,
            });
        if (!nextTab) {
          return false;
        }
        queueProjectTabViewportReset(nextTab.id);
        if (hideStartup) {
          hideStartupScreen();
        }
        updateAutosaveStatus(
          localizeText('端末内プロジェクトをシートとして追加しました', 'Added local project as a sheet'),
          'success'
        );
        return true;
      } finally {
        releaseProjectCommandLock({ token: lock.token, owner: lock.owner });
        renderOpenProjectTabs();
      }
    } finally {
      if (typeof endStartupProgress === 'function') {
        endStartupProgress();
      }
    }
  }

  async function openDocumentDialog() {
    if (!ensureCurrentClientCanReplaceActiveProject()) return false;
    if (!canCurrentClientImportExternalData()) {
      setMultiStatus(
        localizeText(
          '参加/視聴モードでは読み込み/インポートはマスターのみ操作できます',
          'In participant/viewer mode, only the master can open/import files'
        ),
        'warn'
      );
      return false;
    }
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: false,
          types: [{
            description: 'PiXiEEDraw project or image',
            accept: {
              'application/x-pixieedraw': ['.pixieedraw', '.pxdraw'],
              'application/json': ['.json'],
              'image/png': ['.png', '.apng'],
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/webp': ['.webp'],
              'image/gif': ['.gif'],
            },
          }],
        });
        if (!Array.isArray(handles) || !handles.length) return false;
        return await openDocumentAsNewProject(handles[0], { source: 'open-picker' });
      } catch (error) {
        if (error?.name === 'AbortError') return false;
        console.warn('Open picker failed; using file input fallback', error);
      }
    }
    return openDocumentViaInput();
  }

  function openDocumentViaInput() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pixieedraw,.pxdraw,.json,.png,.apng,.jpg,.jpeg,.webp,.gif';
      input.multiple = false;
      input.hidden = true;
      const cleanup = () => {
        input.value = '';
        input.remove();
      };
      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        cleanup();
        if (!file) {
          resolve(false);
          return;
        }
        try {
          resolve(await openDocumentAsNewProject(file, { source: 'open-input' }));
        } catch (error) {
          console.warn('Document input open failed', error);
          updateAutosaveStatus(localizeText('ファイルを開けませんでした', 'Unable to open the file'), 'error');
          resolve(false);
        }
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }
  function isGifFile(file) {
    if (!file) return false;
    const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
    if (type === 'image/gif') {
      return true;
    }
    const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
    return name.endsWith('.gif');
  }

  const imageUtils = window.PiXiEEDrawModules?.imageUtils?.createImageUtils?.({
    DEFAULT_IMPORT_FRAME_DURATION,
    IMPORT_FRAME_DURATION_MIN_MS,
    IMPORT_FRAME_DURATION_MAX_MS,
    MAX_IMAGE_IMPORT_SOURCE_SIZE,
    MAX_CANVAS_SIZE,
    clamp,
  }) || {};
  const {
    isImportableImageFile,
    createImageImportError,
    normalizeImportFrameDuration,
    resolveImageImportTargetSize,
    getImageImportCheckFrameIndexes,
    getGreatestCommonDivisor,
  } = imageUtils;

  const imageImportDecodeUtils = window.PiXiEEDrawModules?.imageImportDecodeUtils?.createImageImportDecodeUtils?.({
    DEFAULT_IMPORT_FRAME_DURATION,
    IMPORT_INTEGER_SCALE_SAMPLE_GRID,
    MAX_IMPORTED_PALETTE_COLORS,
    clamp,
    createImageImportError: (...args) => createImageImportError(...args),
    getImageImportCheckFrameIndexes: (...args) => getImageImportCheckFrameIndexes(...args),
    getGreatestCommonDivisor: (...args) => getGreatestCommonDivisor(...args),
    quantizeRgbaColorEntriesWithMapping: (...args) => quantizeRgbaColorEntriesWithMapping(...args),
    normalizeColorValue: (...args) => normalizeColorValue(...args),
    getPaletteColorKey: (...args) => getPaletteColorKey(...args),
    findNearestPaletteColorIndexByRgba: (...args) => findNearestPaletteColorIndexByRgba(...args),
    resolveTransparentStoragePaletteIndex: (...args) => resolveTransparentStoragePaletteIndex(...args),
    isGifFile: (...args) => isGifFile(...args),
    GifReader,
  }) || {};
  const {
    quickCheckImageDataNearestUpscale,
    isImageDataNearestNeighborUpscaled,
    detectNearestNeighborIntegerScaleForFrames,
    createImageDataFromPixels,
    resizeImageDataNearest,
    resizeImportFrames,
    buildIndexedPaletteFromFrameDataList,
    decodeImageFileToFrames,
    decodeGifFileToFrames,
    decodeGifWithImageDecoder,
    decodeGifWithReader,
    fillGifCanvas,
    resolveDisposalFillColor,
    clearGifFrameRect,
    decodeImageFileToImageData,
    imageBitmapToImageData,
    imageElementToImageData,
  } = imageImportDecodeUtils;

  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return null;
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      return null;
    }
    const mimeType = match[1] || 'application/octet-stream';
    const base64Data = match[2] || '';
    try {
      const binary = atob(base64Data);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    } catch (error) {
      console.warn('Failed to convert data URL to blob', error);
      return null;
    }
  }

  async function normalizeExternalRasterSheetCandidate(project, file, metrics = {}) {
    const kind = metrics.kind === 'gif' ? 'gif' : 'image';
    const documentValue = project?.document && typeof project.document === 'object' ? project.document : {};
    const sourceFileBytes = Math.max(0, Number(metrics.sourceFileBytes ?? file?.size) || 0);
    const sourceWidth = Math.max(0, Number(metrics.sourceWidth) || Number(project?.document?.width) || Number(project?.document?.canvases?.[0]?.width) || 0);
    const sourceHeight = Math.max(0, Number(metrics.sourceHeight) || Number(project?.document?.height) || Number(project?.document?.canvases?.[0]?.height) || 0);
    if (typeof normalizeExternalProjectToCanonicalV2 !== 'function') {
      return { ok: false, code: 'ERR_CANONICAL_V2_NORMALIZER_UNAVAILABLE', phase: 'normalize' };
    }
    if (typeof validateCanonicalV2ProjectPayload !== 'function') {
      return { ok: false, code: 'ERR_CANONICAL_V2_VALIDATOR_UNAVAILABLE', phase: 'validate' };
    }
    console.info('[pixieedraw-dev:canonical-import]', {
      phase: 'normalize-start', kind, sourceFileBytes, sourceWidth, sourceHeight,
    });
    const normalizeSpan = beginImportPerformanceSpan('pixiedraw-dev:import:canonical-normalize');
    let normalized;
    try {
      const sourceProvenance = typeof createRasterImportProvenance === 'function'
        ? await createRasterImportProvenance({ file, project, kind })
        : null;
      normalized = normalizeExternalProjectToCanonicalV2({
        sourceKind: kind === 'gif' ? 'import-gif' : 'import-image',
        sourceAdapterId: null,
        decodedPayload: project,
        sourceMetadata: {
          sourceMimeType: kind === 'gif' ? 'image/gif' : (typeof file?.type === 'string' ? file.type : 'image/png'),
          sourceFileName: typeof file?.name === 'string' ? file.name : '',
          sourceFileBytes,
          sourceWidth,
          sourceHeight,
          sourceProvenance,
          projectOriginality: typeof normalizeProjectOriginalityMetadata === 'function'
            ? normalizeProjectOriginalityMetadata(null, kind === 'gif' ? 'import-gif' : 'import-image')
            : null,
          ...(kind === 'gif' ? {
            sourceFrameCount: Math.max(1, Number(documentValue?.frames?.length) || Number(documentValue?.canvases?.[0]?.frames?.length) || 1),
            gifLoopCount: null,
          } : {}),
        },
      });
    } finally {
      endImportPerformanceSpan(normalizeSpan);
    }
    if (!normalized?.ok || !normalized.canonicalPayload) {
      return { ok: false, code: normalized?.code || 'ERR_CANONICAL_V2_NORMALIZE_FAILED', phase: normalized?.phase || 'normalize' };
    }
    const validationSpan = beginImportPerformanceSpan('pixiedraw-dev:import:canonical-validate');
    let validation;
    try {
      validation = validateCanonicalV2ProjectPayload(normalized.canonicalPayload);
    } finally {
      endImportPerformanceSpan(validationSpan);
    }
    if (!validation?.ok) {
      return { ok: false, code: validation?.code || 'ERR_CANONICAL_V2_CANDIDATE_INVALID', phase: validation?.phase || 'validate' };
    }
    console.info('[pixieedraw-dev:canonical-import]', {
      phase: 'normalize-success', kind,
      sourceFileBytes,
      sourceWidth,
      sourceHeight,
      sheetCount: normalized.metrics?.sheetCount || 0,
      canvasCount: normalized.metrics?.canvasCount || 0,
      layerCount: normalized.metrics?.layerCount || 0,
      frameCount: normalized.metrics?.frameCount || 0,
      bitmapCount: normalized.metrics?.bitmapCount || 0,
      typedByteLength: normalized.metrics?.typedByteLength || 0,
      warningCount: normalized.metrics?.warningCount || 0,
    });
    return { ok: true, canonicalPayload: normalized.canonicalPayload, metrics: normalized.metrics || {} };
  }

  async function buildImageSheetImportCandidate(file, kind = 'image') {
    // Kept as an explicit classification for the PNG-specific regression
    // checks; canonicalization itself now covers every raster input.
    const isPng = kind === 'image' && (() => {
      const type = typeof file?.type === 'string' ? file.type.toLowerCase() : '';
      const name = typeof file?.name === 'string' ? file.name.toLowerCase() : '';
      return type === 'image/png' || name.endsWith('.png');
    })();
    const isGif = kind === 'gif';
    const sourceFileBytes = Math.max(0, Number(file?.size) || 0);
    console.info('[pixieedraw-dev:canonical-import]', { phase: 'decode-start', kind, sourceFileBytes });
    let project = null;
    try {
      project = await loadDocumentFromImageFile(file, { applyToRuntime: false });
    } catch (error) {
      console.warn('[pixieedraw-dev:canonical-import]', { phase: 'decode-failed', kind, sourceFileBytes, code: 'ERR_EXTERNAL_DECODE_FAILED' });
      throw error;
    }
    if (!project || typeof project !== 'object') {
      return false;
    }
    const documentValue = project.document && typeof project.document === 'object' ? project.document : {};
    const canvasCount = Array.isArray(documentValue.canvases) && documentValue.canvases.length
      ? documentValue.canvases.length
      : 1;
    const sourceWidth = Math.max(0, Number(documentValue.width) || Number(documentValue.canvases?.[0]?.width) || 0);
    const sourceHeight = Math.max(0, Number(documentValue.height) || Number(documentValue.canvases?.[0]?.height) || 0);
    const normalized = await normalizeExternalRasterSheetCandidate(project, file, {
      kind: isGif ? 'gif' : 'image', sourceFileBytes, sourceWidth, sourceHeight,
    });
    if (!normalized?.ok) {
      console.warn('[pixieedraw-dev:canonical-import]', {
        phase: 'normalize-failed', kind, sourceFileBytes, sourceWidth, sourceHeight,
        code: normalized?.code || 'ERR_CANONICAL_V2_NORMALIZE_FAILED',
      });
      const error = new Error('ERR_CANONICAL_V2_CANDIDATE_INVALID');
      error.code = 'ERR_CANONICAL_V2_CANDIDATE_INVALID';
      error.causeCode = normalized?.code || 'ERR_CANONICAL_V2_NORMALIZE_FAILED';
      throw error;
    }
    project = normalized.canonicalPayload;
    return {
      project,
      fileName: normalizeDocumentName(typeof file?.name === 'string' ? file.name : DEFAULT_DOCUMENT_NAME),
      sourceStorageAdapterId: null,
      sourceKind: kind === 'gif' ? 'import-gif' : 'import-image',
      sourceProjectToken: typeof createProjectPersistenceToken === 'function'
        ? createProjectPersistenceToken(kind === 'gif' ? 'gif' : 'image')
        : null,
      lastSavedStorageAdapterId: null,
      isImportedSheet: true,
      canonicalPayloadFormat: project.canonicalPayloadFormat || '',
    };
  }

  async function loadDocumentFromImageFile(file, { applyToRuntime = true } = {}) {
    if (applyToRuntime && !ensureCurrentClientCanReplaceActiveProject()) {
      return false;
    }
    if (applyToRuntime) {
      deactivateQrEditMode();
    }
    const closeLoading = beginBlockingGlobalLoading(
      localizeText('画像を読み込み中…', 'Loading image...'),
      { immediate: true }
    );
    const importSpan = beginImportPerformanceSpan('pixiedraw-dev:import:total', {
      fileName: typeof file?.name === 'string' ? file.name : '',
      fileBytes: Math.max(0, Number(file?.size) || 0),
    });
    let importResult;
    try {
      setGlobalLoadingIndicatorLabel(localizeText('画像をデコード中…', 'Decoding image...'));
      const decodeSpan = beginImportPerformanceSpan('pixiedraw-dev:import:decode');
      try {
        importResult = await decodeImageFileToFrames(file);
      } catch (error) {
        throw createImageImportError('画像を読み込めませんでした', error);
      } finally {
        endImportPerformanceSpan(decodeSpan, {
          frameCount: Array.isArray(importResult?.frames) ? importResult.frames.length : 0,
        });
      }

      const framesData = Array.isArray(importResult?.frames) ? importResult.frames : [];
      if (!framesData.length) {
        throw createImageImportError('画像を読み込めませんでした');
      }

      const inferredWidth = Number(importResult?.width ?? framesData[0]?.imageData?.width ?? 0);
      const inferredHeight = Number(importResult?.height ?? framesData[0]?.imageData?.height ?? 0);
      if (!Number.isFinite(inferredWidth) || !Number.isFinite(inferredHeight) || inferredWidth <= 0 || inferredHeight <= 0) {
        throw createImageImportError('画像サイズが不正です');
      }

      const decodedIntegerScaleFactor = Math.max(1, Math.floor(Number(importResult?.integerScaleFactor) || 1));
      const integerScaleFactor = decodedIntegerScaleFactor > 1
        ? 1
        : detectNearestNeighborIntegerScaleForFrames(framesData, inferredWidth, inferredHeight);
      const importSize = resolveImageImportTargetSize(inferredWidth, inferredHeight, { integerScaleFactor });
      const width = importSize.width;
      const height = importSize.height;
      const originalSourceWidth = Math.max(inferredWidth, Number(importResult?.sourceWidth) || 0);
      const originalSourceHeight = Math.max(inferredHeight, Number(importResult?.sourceHeight) || 0);
      const effectiveIntegerScaleFactor = decodedIntegerScaleFactor > 1
        ? decodedIntegerScaleFactor
        : importSize.integerScaleFactor;
      const importWasScaled = decodedIntegerScaleFactor > 1 || importSize.scaled;
      setGlobalLoadingIndicatorLabel(localizeText('フルカラー画像を準備中…', 'Preparing full-color frames...'));
      const resizeSpan = beginImportPerformanceSpan('pixiedraw-dev:import:resize', {
        sourceWidth: originalSourceWidth,
        sourceHeight: originalSourceHeight,
        targetWidth: width,
        targetHeight: height,
        scaled: importWasScaled,
      });
      let normalizedFramesData;
      try {
        normalizedFramesData = importSize.scaled
          ? resizeImportFrames(framesData, width, height)
          : framesData;
      } finally {
        endImportPerformanceSpan(resizeSpan, { frameCount: framesData.length });
      }

    const frames = [];
    const palette = createRgbModeDefaultPalette();
    const activePaletteIndex = clamp(2, 0, Math.max(0, palette.length - 1));
    const secondaryPaletteIndex = clamp(1, 0, Math.max(0, palette.length - 1));
    const activeRgb = palette[activePaletteIndex]
      ? { ...palette[activePaletteIndex] }
      : { r: 255, g: 255, b: 255, a: 255 };

    const runtimeFramesSpan = beginImportPerformanceSpan('pixiedraw-dev:import:runtime-frames', {
      width,
      height,
      frameCount: normalizedFramesData.length,
    });
    try {
    normalizedFramesData.forEach((frameInfo, index) => {
      const layer = createLayer(localizeText('画像レイヤー', 'Image Layer'), width, height);
      layer.indices.fill(-1);
      layer.directOnly = true;
      const direct = ensureLayerDirect(layer, width, height);
      if (frameInfo?.imageData?.data instanceof Uint8ClampedArray
        && frameInfo.imageData.width === width
        && frameInfo.imageData.height === height) {
        direct.set(frameInfo.imageData.data);
      } else {
        direct.fill(0);
      }
      frames.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `frame-${Date.now().toString(36)}-${index}`,
        name: getDefaultFrameName(index + 1),
        duration: normalizeImportFrameDuration(frameInfo?.duration),
        layers: [layer],
      });
      if (frameInfo && typeof frameInfo === 'object') frameInfo.imageData = null;
      normalizedFramesData[index] = null;
    });
    } finally {
      normalizedFramesData.forEach((frameInfo, index) => {
        if (frameInfo && typeof frameInfo === 'object') frameInfo.imageData = null;
        normalizedFramesData[index] = null;
      });
      endImportPerformanceSpan(runtimeFramesSpan, { createdFrameCount: frames.length });
    }

    const activeLayerId = frames[0]?.layers[0]?.id;
    if (!activeLayerId) {
      throw createImageImportError('画像を読み込めませんでした');
    }
    const isLargeImportedDocument = width * height * Math.max(1, frames.length) >= 256 * 256 * 48;

    const documentName = normalizeDocumentName(typeof file?.name === 'string' ? file.name : state.documentName);
    const activeToolGroup = TOOL_GROUPS[state.activeToolGroup] ? state.activeToolGroup : (TOOL_TO_GROUP[state.tool] || 'pen');

    setGlobalLoadingIndicatorLabel(localizeText(
      applyToRuntime ? 'プロジェクトへ反映中…' : 'シートを準備中…',
      applyToRuntime ? 'Applying project...' : 'Preparing sheet...'
    ));
    const snapshot = {
      width,
      height,
      scale: MIN_ZOOM_RATIO,
      pan: { x: 0, y: 0 },
      tool: state.tool,
      brushSize: state.brushSize,
      outlineSize: state.outlineSize,
      palette,
      activePaletteIndex,
      secondaryPaletteIndex,
      activeRgb,
      colorMode: COLOR_MODE_RGB,
      frames,
      activeFrame: 0,
      activeLayer: activeLayerId,
      selectionMask: null,
      selectionBounds: null,
      showGrid: state.showGrid ?? true,
      showMajorGrid: state.showMajorGrid ?? true,
      gridScreenStep: state.gridScreenStep ?? 8,
      majorGridSpacing: state.majorGridSpacing ?? 16,
      backgroundMode: state.backgroundMode ?? 'dark',
      uiTheme: normalizeUiTheme(state.uiTheme, DEFAULT_UI_THEME),
      documentName,
      showPixelGuides: isLargeImportedDocument ? false : (state.showPixelGuides ?? true),
      mirror: normalizeMirrorAxisState(state.mirror, width, height),
      showVirtualCursor: state.showVirtualCursor ?? false,
      showCanvasResizeHandles: state.showCanvasResizeHandles ?? true,
      showChecker: state.showChecker ?? true,
      onionSkin: normalizeOnionSkinState(state.onionSkin),
      dualLeftRail: false,
      activeToolGroup,
      lastGroupTool: { ...DEFAULT_GROUP_TOOL, ...(state.lastGroupTool || {}) },
      activeLeftTab: state.activeLeftTab ?? 'tools',
      activeRightTab: state.activeRightTab ?? 'frames',
    };

    if (!applyToRuntime) {
      if (typeof buildPackagedProjectPayload !== 'function') {
        throw new Error('ERR_PROJECT_PAYLOAD_BUILDER_UNAVAILABLE');
      }
      return buildPackagedProjectPayload(snapshot, { includeSheets: false });
    }

    const applySnapshotSpan = beginImportPerformanceSpan('pixiedraw-dev:import:apply-history-snapshot', {
      frameCount: frames.length,
      width,
      height,
    });
    try {
      applyHistorySnapshot(snapshot, { forcePalettePresetSync: true, preservePersonalPreferences: false });
    } finally {
      endImportPerformanceSpan(applySnapshotSpan);
    }
    history.past = [];
    history.future = [];
    history.pending = null;
    clearTimelapseRecording({ silent: true, scope: 'all' });
    resetDocumentUnsavedChanges();
    updateHistoryButtons();
    resetExportScaleDefaults();
    syncPixfindSnapshotAfterDocumentReset();
    setTrackedProjectDotBaseline(snapshot, null);
    resetOpenedDocumentViewport({ defer: true });

    setActiveAutosaveProjectId(createAutosaveProjectId());
    clearActiveSharedProjectSession();
    storeMultiProjectKey('');
    syncMultiProjectKeyInputValues('', { preserveFocused: false });
    markAutosaveDirty();
    scheduleAutosaveSnapshot();
    if (importWasScaled) {
      const integerScaleLabel = effectiveIntegerScaleFactor > 1
        ? ` / 整数倍縮小 x${effectiveIntegerScaleFactor}`
        : '';
      updateAutosaveStatus(
        `画像をRGBカラーで読み込みました (${originalSourceWidth}x${originalSourceHeight} → ${width}x${height}${integerScaleLabel}) / 端末内へ自動保存します`,
        'success'
      );
    } else {
      updateAutosaveStatus('画像をRGBカラーで読み込みました / 端末内へ自動保存します', 'success');
    }
    scheduleSessionPersist();
    return true;
    } finally {
      endImportPerformanceSpan(importSpan, {
        frameCount: Array.isArray(importResult?.frames) ? importResult.frames.length : 0,
      });
      closeLoading();
    }
  }

  async function fallbackRestoreAutosaveAfterLensFailure() {
    if (!lensImportRequested) {
      return;
    }
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }
    try {
      const entries = await loadRecentProjectsMetadata();
      if (!entries.length) {
        return;
      }
      const target = autosaveProjectId
        ? (entries.find(entry => entry?.id === autosaveProjectId) || entries[0])
        : entries[0];
      const restored = await openRecentProject(target, { hideStartup: false, silent: true });
      if (restored) {
        updateAutosaveStatus('自動保存: 端末内データを復元しました', 'info');
      }
    } catch (error) {
      console.warn('Failed to restore autosave after PiXiEELENS import failure', error);
    }
  }

  async function fallbackRestoreAutosaveAfterQrFailure() {
    if (!qrImportRequested) {
      return;
    }
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }
    try {
      const entries = await loadRecentProjectsMetadata();
      if (!entries.length) {
        return;
      }
      const target = autosaveProjectId
        ? (entries.find(entry => entry?.id === autosaveProjectId) || entries[0])
        : entries[0];
      const restored = await openRecentProject(target, { hideStartup: false, silent: true });
      if (restored) {
        updateAutosaveStatus('自動保存: 端末内データを復元しました', 'info');
      }
    } catch (error) {
      console.warn('Failed to restore autosave after QR import failure', error);
    }
  }

  function setLensImportSessionFlag() {
    if (!canUseSessionStorage) {
      return;
    }
    try {
      window.sessionStorage.setItem(LENS_IMPORT_SESSION_FLAG, '1');
    } catch (error) {
      // ignore
    }
  }

  function setQrImportSessionFlag() {
    if (!canUseSessionStorage) {
      return;
    }
    try {
      window.sessionStorage.setItem(QR_IMPORT_SESSION_FLAG, '1');
    } catch (error) {
      // ignore
    }
  }

  function readMarketPurchaseTransfer(token) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB || !/^[a-z0-9-]{8,128}$/i.test(String(token || ''))) {
        resolve(null);
        return;
      }
      const request = window.indexedDB.open('pixieed-market-import-v1', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('imports')) request.result.createObjectStore('imports', { keyPath: 'token' });
      };
      request.onerror = () => reject(request.error || new Error('market transfer database unavailable'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('imports', 'readwrite');
        const store = transaction.objectStore('imports');
        let value = null;
        const getRequest = store.get(token);
        getRequest.onsuccess = () => {
          value = getRequest.result || null;
          store.delete(token);
        };
        transaction.oncomplete = () => { db.close(); resolve(value); };
        transaction.onerror = () => { const error = transaction.error; db.close(); reject(error || new Error('market transfer read failed')); };
        transaction.onabort = () => { const error = transaction.error; db.close(); reject(error || new Error('market transfer read aborted')); };
      };
    });
  }

  function clearMarketImportRequestParam() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('market_import');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_error) {}
  }

  async function maybeImportMarketPurchase() {
    let token = '';
    try {
      token = new URLSearchParams(window.location.search).get('market_import') || '';
    } catch (_error) {}
    if (!token) return false;
    let transfer = null;
    try {
      transfer = await readMarketPurchaseTransfer(token);
    } catch (error) {
      console.warn('Failed to read PiXiEED Market transfer', error);
    }
    clearMarketImportRequestParam();
    if (!transfer || !(transfer.blob instanceof Blob)) {
      updateAutosaveStatus('購入済み素材が見つかりませんでした。マイページからもう一度開いてください。', 'warn');
      return false;
    }
    if (!Number.isFinite(Number(transfer.expiresAt)) || Date.now() > Number(transfer.expiresAt)) {
      updateAutosaveStatus('購入済みファイルの受け渡し期限が切れました。マイページからもう一度開いてください。', 'warn');
      return false;
    }
    const filename = String(transfer.filename || 'purchased.pixieedraw').split('/').pop() || 'purchased.pixieedraw';
    let file;
    try {
      file = new File([transfer.blob], filename, { type: transfer.blob.type || 'application/octet-stream' });
    } catch (_error) {
      file = transfer.blob;
      file.name = filename;
    }
    try {
      const imported = await openDocumentAsNewProject(file, { source: 'market-purchase' });
      if (!imported) return false;
      hideStartupScreen();
      hideProjectHomeScreen();
      if (AUTOSAVE_SUPPORTED) {
        try { await writeAutosaveSnapshot(true); } catch (error) { console.warn('Immediate autosave after market import failed', error); }
      }
      updateAutosaveStatus('購入済み素材をPiXiEEDrawの新規プロジェクトとして開きました', 'success');
      return true;
    } catch (error) {
      console.warn('Failed to import purchased market asset', error);
      updateAutosaveStatus('購入済み素材をPiXiEEDrawで開けませんでした', 'error');
      return false;
    }
  }

  async function maybeImportLensCapture() {
    let shouldImport = false;
    try {
      const params = new URLSearchParams(window.location.search);
      shouldImport = params.get('lens') === '1';
    } catch (error) {
      shouldImport = false;
    }
    if (!shouldImport && lensImportRequested) {
      shouldImport = true;
    }
    if (!shouldImport) {
      return false;
    }

    let rawPayload = null;
    try {
      rawPayload = window.localStorage.getItem(LENS_IMPORT_STORAGE_KEY);
    } catch (error) {
      console.warn('PiXiEELENS transfer storage is not available', error);
    }

    let payload = null;
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {
        console.warn('Failed to parse PiXiEELENS transfer payload', error);
      }
    }

    if (!isLensImportPayload(payload)) {
      payload = readLensImportWindowNamePayload();
    }

    if (!isLensImportPayload(payload)) {
      payload = await waitForLensImportPayloadMessage();
    }

    clearLensImportRequestParam();

    if (!isLensImportPayload(payload)) {
      updateAutosaveStatus('PiXiEELENS からのデータが見つかりませんでした', 'warn');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt({ clearPayload: true });
      return false;
    }

    if (payload.expiresAt && Number.isFinite(payload.expiresAt) && Date.now() > payload.expiresAt) {
      updateAutosaveStatus('PiXiEELENS からのデータが期限切れです。再度送信してください。', 'warn');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt({ clearPayload: true });
      return false;
    }

    const blob = dataUrlToBlob(payload.dataUrl);
    if (!blob) {
      updateAutosaveStatus('PiXiEELENS の画像データを読み込めませんでした', 'error');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt({ clearPayload: true });
      return false;
    }

    const inferredName = typeof payload.filename === 'string' && payload.filename
      ? payload.filename
      : 'pixiee-lens.png';
    let file;
    try {
      file = new File([blob], inferredName, { type: blob.type || 'image/png' });
    } catch (error) {
      file = blob;
      file.name = inferredName;
    }

    try {
      const imported = await openImageFileAsNewProject(file, { source: 'lens' });
      if (!imported) {
        finalizeLensImportAttempt({ clearPayload: true });
        return false;
      }
      hideStartupScreen();
      hideProjectHomeScreen();
      if (AUTOSAVE_SUPPORTED) {
        try {
          await writeAutosaveSnapshot(true);
        } catch (error) {
          console.warn('Immediate autosave after PiXiEELENS import failed', error);
        }
      }
      updateAutosaveStatus(
        localizeText(
          'PiXiEELENS の画像を新規プロジェクトとして開きました',
          'Opened PiXiEELENS capture as a new project'
        ),
        'success'
      );
      finalizeLensImportAttempt({ clearPayload: true });
      return true;
    } catch (error) {
      console.warn('Failed to import capture from PiXiEELENS', error);
      updateAutosaveStatus('PiXiEELENS の取り込みに失敗しました', 'error');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt();
      return false;
    }
  }

  async function maybeImportQrCapture() {
    let shouldImport = false;
    try {
      const params = new URLSearchParams(window.location.search);
      shouldImport = params.get(QR_IMPORT_QUERY_KEY) === '1';
    } catch (error) {
      shouldImport = false;
    }
    if (!shouldImport && qrImportRequested) {
      shouldImport = true;
    }
    if (!shouldImport) {
      return false;
    }

    let rawPayload = null;
    try {
      rawPayload = window.localStorage.getItem(QR_IMPORT_STORAGE_KEY);
    } catch (error) {
      console.warn('QR transfer storage is not available', error);
    }
    if (!rawPayload) {
      try {
        rawPayload = window.sessionStorage.getItem(QR_IMPORT_STORAGE_KEY);
      } catch (error) {
        console.warn('QR transfer session storage is not available', error);
      }
    }

    let payload = null;
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {
        console.warn('Failed to parse QR transfer payload', error);
      }
    }

    clearLensImportRequestParam();

    if (!payload || typeof payload !== 'object' || typeof payload.dataUrl !== 'string') {
      updateAutosaveStatus('QR編集モードからのデータが見つかりませんでした', 'warn');
      await fallbackRestoreAutosaveAfterQrFailure();
      finalizeQrImportAttempt({ clearPayload: true });
      return false;
    }

    if (payload.expiresAt && Number.isFinite(payload.expiresAt) && Date.now() > payload.expiresAt) {
      updateAutosaveStatus('QR編集モードからのデータが期限切れです。再度送信してください。', 'warn');
      await fallbackRestoreAutosaveAfterQrFailure();
      finalizeQrImportAttempt({ clearPayload: true });
      return false;
    }

    const blob = dataUrlToBlob(payload.dataUrl);
    if (!blob) {
      updateAutosaveStatus('QR画像データを読み込めませんでした', 'error');
      await fallbackRestoreAutosaveAfterQrFailure();
      finalizeQrImportAttempt({ clearPayload: true });
      return false;
    }

    const inferredName = typeof payload.filename === 'string' && payload.filename
      ? payload.filename
      : 'pixiee-qr.png';
    let file;
    try {
      file = new File([blob], inferredName, { type: blob.type || 'image/png' });
    } catch (error) {
      file = blob;
      file.name = inferredName;
    }

    try {
      const qrEditPayload = {
        source: payload.source,
        rawValue: typeof payload.rawValue === 'string' ? payload.rawValue : '',
        editSize: payload.editSize,
      };
      const imported = await openImageFileAsNewProject(file, {
        source: 'qrmaker',
        qrEditPayload,
      });
      if (!imported) {
        finalizeQrImportAttempt({ clearPayload: true });
        return false;
      }
      hideStartupScreen();
      hideProjectHomeScreen();
      if (AUTOSAVE_SUPPORTED) {
        try {
          await writeAutosaveSnapshot(true);
        } catch (error) {
          console.warn('Immediate autosave after QR import failed', error);
        }
      }
      updateAutosaveStatus(
        localizeText(
          'QRコードを新規プロジェクトとして開きました',
          'Opened QR code as a new project'
        ),
        'success'
      );
      finalizeQrImportAttempt({ clearPayload: true });
      return true;
    } catch (error) {
      console.warn('Failed to import QR capture', error);
      updateAutosaveStatus('QRコードの取り込みに失敗しました', 'error');
      await fallbackRestoreAutosaveAfterQrFailure();
      finalizeQrImportAttempt();
      return false;
    }
  }


  return Object.freeze({
    openImageFileAsNewProject,
    openDocumentAsNewProject,
    tryParseJsonSafe,
    resolveOpenProjectPayloadFileName,
    readProjectPayloadFromOpenItem,
    normalizePngSheetCandidate: normalizeExternalRasterSheetCandidate,
    normalizeExternalRasterSheetCandidate,
    appendProjectPayloadAsOpenTab,
    loadRecentProjectPackagedPayload,
    appendPackagedProjectTab,
    openRecentProjectAsTab,
    openDocumentDialog,
    openDocumentViaInput,
    isGifFile,
    dataUrlToBlob,
    loadDocumentFromImageFile,
    fallbackRestoreAutosaveAfterLensFailure,
    fallbackRestoreAutosaveAfterQrFailure,
    setLensImportSessionFlag,
    setQrImportSessionFlag,
    maybeImportMarketPurchase,
    maybeImportLensCapture,
    maybeImportQrCapture,
  });
      }
    })(scope);
  }

  root.openImportWorkflowUtils = Object.freeze({
    createOpenImportWorkflowUtils,
  });
})();
