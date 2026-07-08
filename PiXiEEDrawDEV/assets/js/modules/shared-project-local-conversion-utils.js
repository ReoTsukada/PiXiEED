(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectLocalConversionUtils(rawScope = {}) {
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
  function buildLocalProjectIdFromSharedRecentProjectEntry(entry = null) {
    const normalizedEntry = normalizeSharedRecentProjectEntry(entry);
    const sourceKey = normalizeMultiProjectKey(normalizedEntry?.sharedProjectKey || '');
    if (sourceKey) {
      return `local-from-shared-${sourceKey}`;
    }
    const backendId = normalizeAutosaveProjectId(normalizedEntry?.sharedProjectBackendId || '');
    if (backendId) {
      return `local-from-shared-${backendId}`;
    }
    return createAutosaveProjectId();
  }

  function stripSharedRecentProjectFields(entry = {}) {
    const {
      storageKind,
      sharedProjectBackendId,
      sharedProjectId,
      sharedProjectKey,
      sharedProjectInviteToken,
      sharedProjectVisibility,
      sharedProjectRevision,
      sharedProjectStructureRevision,
      sharedProjectMembershipRole,
      sharedProjectOwnerUserId,
      sharedProjectTransferLocked,
      sharedRoleHint,
      sharedAutoJoin,
      ...localEntry
    } = entry && typeof entry === 'object' ? entry : {};
    return localEntry;
  }

  async function loadSharedRecentProjectPayloadForLocalOpen(entry = null) {
    let normalizedEntry = normalizeSharedRecentProjectEntry(entry);
    if (!normalizedEntry) {
      return null;
    }
    if (normalizedEntry.project && typeof normalizedEntry.project === 'object') {
      return normalizedEntry.project;
    }
    if (accountState.isLoggedIn && !accountState.isAnonymous) {
      try {
        normalizedEntry = normalizeSharedRecentProjectEntry(
          await refreshSharedRecentProjectEntryFromBackend(normalizedEntry) || normalizedEntry
        ) || normalizedEntry;
      } catch (error) {
        console.warn('Failed to refresh shared recent project before local conversion', error);
      }
    }
    let project = null;
    try {
      if (normalizedEntry.sharedProjectInviteToken) {
        project = await loadSharedProjectSnapshotRecordByInvite(normalizedEntry.sharedProjectInviteToken, {
          createIfMissing: false,
          title: createSharedProjectSnapshotTitle(normalizedEntry.name || state.documentName || DEFAULT_DOCUMENT_NAME),
        });
      }
      if (!project?.project_key && normalizedEntry.sharedProjectKey) {
        project = await loadSharedProjectSnapshotRecord(normalizedEntry.sharedProjectKey, {
          createIfMissing: false,
          title: createSharedProjectSnapshotTitle(normalizedEntry.name || state.documentName || DEFAULT_DOCUMENT_NAME),
        });
      }
      if (project?.project_key) {
        const freshestProject = await awaitFreshSharedProjectSnapshot(project, {
          inviteToken: normalizedEntry.sharedProjectInviteToken || '',
          minRevision: Math.max(0, Math.round(Number(project.latest_revision) || 0)),
          requireExactLatest: false,
          timeoutMs: 1200,
          pollIntervalMs: 160,
        }) || project;
        if (freshestProject?.latest_snapshot && typeof freshestProject.latest_snapshot === 'object') {
          return freshestProject.latest_snapshot;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch shared recent project snapshot for local conversion', error);
    }
    return null;
  }

  async function storeSharedRecentProjectAsLocalProject(normalizedEntry, projectPayload, localProjectId) {
    if (!AUTOSAVE_SUPPORTED || !normalizedEntry || !projectPayload || typeof projectPayload !== 'object') {
      return null;
    }
    const resolvedLocalProjectId = normalizeAutosaveProjectId(localProjectId) || buildLocalProjectIdFromSharedRecentProjectEntry(normalizedEntry);
    const entries = await loadRecentProjectsMetadata();
    const existingLocalEntry = entries.find(entry => (
      normalizeAutosaveProjectId(entry?.id || '') === resolvedLocalProjectId
      && !isSharedRecentProjectEntry(entry)
    )) || null;
    const baseEntry = stripSharedRecentProjectFields(existingLocalEntry || normalizedEntry);
    const fileName = normalizeDocumentName(
      existingLocalEntry?.fileName
      || normalizedEntry.fileName
      || `${normalizedEntry.name || DEFAULT_DOCUMENT_NAME}`
    );
    const localEntry = {
      ...baseEntry,
      id: resolvedLocalProjectId,
      accountUserId: getCurrentRecentProjectAccountUserId(),
      storageKind: RECENT_PROJECT_STORAGE_LOCAL,
      name: extractDocumentBaseName(existingLocalEntry?.name || normalizedEntry.name || fileName),
      fileName,
      updatedAt: new Date().toISOString(),
      thumbnail: existingLocalEntry?.thumbnail || normalizedEntry.thumbnail || null,
      project: projectPayload,
    };
    if (existingLocalEntry?.thumbnailSheetId || normalizedEntry.thumbnailSheetId) {
      localEntry.thumbnailSheetId = existingLocalEntry?.thumbnailSheetId || normalizedEntry.thumbnailSheetId;
    }
    if (existingLocalEntry?.dotStats || normalizedEntry.dotStats) {
      localEntry.dotStats = existingLocalEntry?.dotStats || normalizedEntry.dotStats;
    }
    const removeIds = new Set([
      resolvedLocalProjectId,
      normalizeAutosaveProjectId(normalizedEntry.id || ''),
      buildSharedRecentProjectId(normalizedEntry.sharedProjectKey || ''),
    ].filter(Boolean));
    const workingEntries = entries.filter(entry => {
      const id = normalizeAutosaveProjectId(entry?.id || '');
      return id && !removeIds.has(id);
    });
    workingEntries.unshift(localEntry);
    workingEntries.sort((a, b) => {
      const aTime = typeof a?.updatedAt === 'string' ? a.updatedAt : '';
      const bTime = typeof b?.updatedAt === 'string' ? b.updatedAt : '';
      return bTime.localeCompare(aTime);
    });
    await saveRecentProjectsList(entries, workingEntries);
    setRecentProjectsCache(workingEntries);
    return localEntry;
  }

  async function openSharedRecentProjectAsLocalProject(entry, { hideStartup = true, silent = false } = {}) {
    const normalizedEntry = normalizeSharedRecentProjectEntry(entry);
    if (!normalizedEntry) {
      return false;
    }
    if (!silent) {
      showSharedProjectSunsetDialog();
    }
    const localProjectId = buildLocalProjectIdFromSharedRecentProjectEntry(normalizedEntry);
    const recentEntries = await loadRecentProjectsMetadata();
    const existingLocalEntry = recentEntries.find(candidate => (
      normalizeAutosaveProjectId(candidate?.id || '') === localProjectId
      && !isSharedRecentProjectEntry(candidate)
    )) || null;
    if (existingLocalEntry && (existingLocalEntry.project || existingLocalEntry.handle)) {
      return await openRecentProject(existingLocalEntry, {
        hideStartup,
        silent,
        allowProjectMismatchLoad: true,
        replaceOpenProjectTabs: true,
      });
    }
    const closeBlockingLoading = beginBlockingGlobalLoading(localizeText(
      'シェアプロジェクトを通常プロジェクトとして開いています…',
      'Opening shared project as a local project...'
    ));
    try {
      const projectPayload = await loadSharedRecentProjectPayloadForLocalOpen(normalizedEntry);
      if (!projectPayload || typeof projectPayload !== 'object') {
        if (!silent) {
          updateAutosaveStatus(
            localizeText(
              'シェアプロジェクトを通常プロジェクトとして開けませんでした',
              'Could not open the shared project as a local project'
            ),
            'error'
          );
        }
        return false;
      }
      const loaded = await loadDocumentFromText(JSON.stringify(projectPayload), null, {
        projectId: localProjectId,
        suppressAutosaveStatus: true,
        openedFromRecent: true,
        allowProjectMismatchLoad: true,
      });
      if (!loaded || loaded === 'deferred') {
        if (!silent) {
          updateAutosaveStatus(
            localizeText(
              'シェアプロジェクトを通常プロジェクトとして開けませんでした',
              'Could not open the shared project as a local project'
            ),
            'error'
          );
        }
        return false;
      }
      await storeSharedRecentProjectAsLocalProject(normalizedEntry, projectPayload, localProjectId);
      setActiveAutosaveProjectId(localProjectId);
      if (!silent) {
        updateAutosaveStatus(
          localizeText(
            'シェアプロジェクトを通常プロジェクトとして開きました',
            'Opened the shared project as a local project'
          ),
          'success'
        );
      }
      if (hideStartup) {
        hideStartupScreen();
      }
      return true;
    } catch (error) {
      console.warn('Failed to open shared recent project as local project', error);
      if (!silent) {
        updateAutosaveStatus(
          localizeText(
            'シェアプロジェクトを通常プロジェクトとして開けませんでした',
            'Could not open the shared project as a local project'
          ),
          'error'
        );
      }
      return false;
    } finally {
      closeBlockingLoading();
    }
  }

  return {
    buildLocalProjectIdFromSharedRecentProjectEntry,
    stripSharedRecentProjectFields,
    loadSharedRecentProjectPayloadForLocalOpen,
    storeSharedRecentProjectAsLocalProject,
    openSharedRecentProjectAsLocalProject,
  };
      }
    })(scope);
  }

  root.sharedProjectLocalConversionUtils = Object.freeze({
    createSharedProjectLocalConversionUtils,
  });
})();
