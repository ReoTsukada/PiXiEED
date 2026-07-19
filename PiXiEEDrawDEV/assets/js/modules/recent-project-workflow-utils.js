(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createRecentProjectWorkflowUtils(rawScope = {}) {
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
  async function sanitizeRecentProjectsStore({ announce = false } = {}) {
    if (!AUTOSAVE_SUPPORTED) {
      return { entries: [], changed: false, removedCount: 0, repairedCount: 0 };
    }
    const existingEntries = await loadRecentProjectsMetadata();
    const sanitizedEntries = [];
    const seenIds = new Set();
    let changed = false;
    let removedCount = 0;
    let repairedCount = 0;
    const nowIso = new Date().toISOString();

    for (let index = 0; index < existingEntries.length; index += 1) {
      const original = existingEntries[index];
      if (!original || typeof original !== 'object') {
        changed = true;
        removedCount += 1;
        continue;
      }
      const originalId = normalizeAutosaveProjectId(original.id || '');
      const canRecoverAsLocalProject = Boolean(original.project && typeof original.project === 'object') || Boolean(original.handle);
      let normalizedId = originalId;
      if (!normalizedId && canRecoverAsLocalProject) {
        normalizedId = createAutosaveProjectId();
        changed = true;
        repairedCount += 1;
      }
      if (normalizedId && seenIds.has(normalizedId) && canRecoverAsLocalProject) {
        normalizedId = createAutosaveProjectId();
        changed = true;
        repairedCount += 1;
      }
      if (!normalizedId || seenIds.has(normalizedId)) {
        changed = true;
        removedCount += 1;
        continue;
      }

      if (isSharedRecentProjectEntry(original)) {
        const normalizedShared = normalizeSharedRecentProjectEntry({ ...original, id: normalizedId, project: null });
        if (!normalizedShared) {
          changed = true;
          removedCount += 1;
          continue;
        }
        const sharedChanged = JSON.stringify(normalizedShared) !== JSON.stringify(original);
        seenIds.add(normalizedId);
        if (sharedChanged) {
          changed = true;
          repairedCount += 1;
        }
        sanitizedEntries.push(normalizedShared);
        continue;
      }

      const nextEntry = { ...original, id: normalizedId };
      nextEntry.accountUserId = normalizeRecentProjectAccountUserId(original.accountUserId || '');
      let entryChanged = original.id !== normalizedId;
      const hasProjectPayload = Boolean(original.project && typeof original.project === 'object');
      if (!hasProjectPayload) {
        const fallbackFileName = normalizeDocumentName(
          original.fileName
          || original.name
          || DEFAULT_DOCUMENT_NAME
        );
        nextEntry.fileName = fallbackFileName;
        nextEntry.name = extractDocumentBaseName(fallbackFileName);
        nextEntry.storageKind = RECENT_PROJECT_STORAGE_LOCAL;
        const parsedUpdatedAt = Date.parse(typeof original.updatedAt === 'string' ? original.updatedAt : '');
        if (!Number.isFinite(parsedUpdatedAt)) {
          nextEntry.updatedAt = nowIso;
        }
        seenIds.add(normalizedId);
        const isV2Reference = Number(original.autosaveSchemaVersion) === 2
          && typeof original.manifestKey === 'string'
          && original.manifestKey.length > 0;
        entryChanged = entryChanged
          || nextEntry.accountUserId !== original.accountUserId
          || nextEntry.fileName !== original.fileName
          || nextEntry.name !== original.name
          || nextEntry.storageKind !== original.storageKind
          || !Number.isFinite(parsedUpdatedAt);
        if (entryChanged) {
          changed = true;
          repairedCount += 1;
        } else if (!isV2Reference && !original.handle) {
          nextEntry.openError = 'missing-project-payload';
        }
        sanitizedEntries.push(nextEntry);
        continue;
      }
      let parsedSnapshot = null;
      let projectPayloadReadable = true;

      try {
        const parsed = snapshotFromDocumentText(JSON.stringify(original.project));
        parsedSnapshot = parsed?.snapshot || null;
        if (!parsedSnapshot) {
          throw new Error('Snapshot missing in stored project payload');
        }
      } catch (error) {
        projectPayloadReadable = false;
        nextEntry.openError = 'invalid-project-payload';
        entryChanged = true;
      }

      const fallbackFileName = getRecentProjectEntryFileName(original, original.project, parsedSnapshot);
      if (nextEntry.fileName !== fallbackFileName) {
        nextEntry.fileName = fallbackFileName;
        entryChanged = true;
      }
      const fallbackName = extractDocumentBaseName(fallbackFileName);
      if (nextEntry.name !== fallbackName) {
        nextEntry.name = fallbackName;
        entryChanged = true;
      }
      const parsedUpdatedAt = Date.parse(typeof original.updatedAt === 'string' ? original.updatedAt : '');
      if (!Number.isFinite(parsedUpdatedAt)) {
        nextEntry.updatedAt = nowIso;
        entryChanged = true;
      }
      if (projectPayloadReadable && (typeof nextEntry.thumbnail !== 'string' || nextEntry.thumbnail.length <= 0)) {
        let regeneratedThumbnail = null;
        try {
          regeneratedThumbnail = await generateSnapshotThumbnail(getRecentProjectListSnapshot(original.project, parsedSnapshot) || parsedSnapshot);
        } catch (error) {
          regeneratedThumbnail = null;
        }
        if (regeneratedThumbnail) {
          nextEntry.thumbnail = regeneratedThumbnail;
          entryChanged = true;
        } else if (nextEntry.thumbnail !== null) {
          nextEntry.thumbnail = null;
          entryChanged = true;
        }
      }
      if (projectPayloadReadable && Object.prototype.hasOwnProperty.call(nextEntry, 'handle')) {
        delete nextEntry.handle;
        entryChanged = true;
      }
      seenIds.add(normalizedId);
      if (entryChanged) {
        changed = true;
        repairedCount += 1;
      }
      sanitizedEntries.push(nextEntry);
    }

    sanitizedEntries.sort((a, b) => {
      const aTime = typeof a?.updatedAt === 'string' ? a.updatedAt : '';
      const bTime = typeof b?.updatedAt === 'string' ? b.updatedAt : '';
      return bTime.localeCompare(aTime);
    });
    const normalizedEntries = sanitizedEntries.slice();
    if (normalizedEntries.length !== existingEntries.length) {
      changed = true;
    }

    if (changed) {
      await saveRecentProjectsList(existingEntries, normalizedEntries);
    }
    setRecentProjectsCache(changed ? normalizedEntries : existingEntries);
    if (announce && (removedCount > 0 || repairedCount > 0)) {
      updateAutosaveStatus(
        `端末内プロジェクトを整理しました（修復 ${repairedCount} / 除外 ${removedCount}）`,
        removedCount > 0 ? 'warn' : 'info'
      );
    }
    return {
      entries: changed ? normalizedEntries : existingEntries,
      changed,
      removedCount,
      repairedCount,
    };
  }

  async function removeRecentProjectEntry(projectId, { announce = false, reason = '' } = {}) {
    if (!AUTOSAVE_SUPPORTED) return false;
    const normalizedId = normalizeAutosaveProjectId(projectId || '');
    if (!normalizedId) return false;
    const existingEntries = await loadRecentProjectsMetadata();
    const removedEntry = existingEntries.find(entry => entry?.id === normalizedId) || null;
    const nextEntries = existingEntries.filter(entry => entry?.id !== normalizedId);
    if (nextEntries.length === existingEntries.length) {
      return false;
    }
    await saveRecentProjectsList(existingEntries, nextEntries);
    if (Number(removedEntry?.autosaveSchemaVersion) === 2) {
      await removeAutosaveV2ProjectData?.(normalizedId);
    }
    setRecentProjectsCache(nextEntries);
    closeOpenProjectTabsForDeletedProject({
      projectId: normalizedId,
      projectKey: isSharedRecentProjectEntry(removedEntry)
        ? removedEntry.sharedProjectKey || ''
        : getSharedProjectKeyFromProjectId(normalizedId),
      backendId: typeof removedEntry?.sharedProjectBackendId === 'string'
        ? removedEntry.sharedProjectBackendId
        : '',
      reason: 'recent-project-delete-tab',
      showHome: true,
    });
    if (announce) {
      const reasonSuffix = reason ? `（${reason}）` : '';
      updateAutosaveStatus(`読込できない端末内プロジェクトを除外しました${reasonSuffix}`, 'warn');
    }
    return true;
  }

  async function upsertSharedRecentProjectEntry({
    projectKey = '',
    name = '',
    roleHint = 'guest',
    membershipRole = '',
    ownerUserId = '',
    autoJoin = false,
    revision = 0,
    structureRevision = 0,
    inviteToken = '',
    visibility = 'private',
    projectId = '',
    thumbnail = null,
    fileName = '',
    project = null,
  } = {}) {
    if (!AUTOSAVE_SUPPORTED) {
      return null;
    }
    const normalizedEntry = normalizeSharedRecentProjectEntry({
      accountUserId: getCurrentRecentProjectAccountUserId(),
      sharedProjectKey: projectKey,
      sharedProjectBackendId: projectId || '',
      sharedProjectId: buildSharedRecentProjectId(projectKey),
      sharedProjectInviteToken: inviteToken,
      sharedProjectVisibility: visibility,
      name: name || extractDocumentBaseName(state.documentName || DEFAULT_DOCUMENT_NAME),
      fileName: fileName || normalizeDocumentName(`${name || extractDocumentBaseName(state.documentName || DEFAULT_DOCUMENT_NAME)}.pixiedraw`),
      sharedRoleHint: roleHint,
      sharedAutoJoin: autoJoin,
      sharedProjectRevision: Math.max(0, Math.round(Number(revision) || 0)),
      sharedProjectStructureRevision: Math.max(0, Math.round(Number(structureRevision) || 0)),
      sharedProjectMembershipRole: membershipRole,
      sharedProjectOwnerUserId: ownerUserId,
      thumbnail: typeof thumbnail === 'string' && thumbnail.length > 0 ? thumbnail : null,
      project: project && typeof project === 'object' ? project : null,
      updatedAt: new Date().toISOString(),
    });
    if (!normalizedEntry) {
      return null;
    }
    const existingEntries = await loadRecentProjectsMetadata();
    const previousEntry = existingEntries.find(entry => entry?.id === normalizedEntry.id) || null;
    const preferIncomingText = (incoming, existing) => {
      const normalizedIncoming = typeof incoming === 'string' ? incoming.trim() : '';
      if (normalizedIncoming) {
        return normalizedIncoming;
      }
      return typeof existing === 'string' ? existing : '';
    };
    const preferIncomingNumber = (incoming, existing) => {
      const normalizedIncoming = Math.max(0, Math.round(Number(incoming) || 0));
      const normalizedExisting = Math.max(0, Math.round(Number(existing) || 0));
      if (normalizedIncoming > 0) {
        return normalizedIncoming;
      }
      return normalizedExisting;
    };
    const mergedEntry = {
      ...(previousEntry || {}),
      ...normalizedEntry,
    };
    if (previousEntry && typeof previousEntry === 'object') {
      mergedEntry.sharedProjectBackendId = preferIncomingText(
        normalizedEntry.sharedProjectBackendId,
        previousEntry.sharedProjectBackendId
      );
      mergedEntry.sharedProjectInviteToken = preferIncomingText(
        normalizedEntry.sharedProjectInviteToken,
        previousEntry.sharedProjectInviteToken
      );
      mergedEntry.sharedProjectVisibility = preferIncomingText(
        normalizedEntry.sharedProjectVisibility,
        previousEntry.sharedProjectVisibility
      ) || 'shared';
      mergedEntry.sharedProjectRevision = preferIncomingNumber(
        normalizedEntry.sharedProjectRevision,
        previousEntry.sharedProjectRevision
      );
      mergedEntry.sharedProjectStructureRevision = preferIncomingNumber(
        normalizedEntry.sharedProjectStructureRevision,
        previousEntry.sharedProjectStructureRevision
      );
      mergedEntry.name = preferIncomingText(
        normalizedEntry.name,
        previousEntry.name
      ) || extractDocumentBaseName(state.documentName || DEFAULT_DOCUMENT_NAME);
      mergedEntry.fileName = preferIncomingText(
        normalizedEntry.fileName,
        previousEntry.fileName
      ) || normalizeDocumentName(`${mergedEntry.name}.pixiedraw`);
      if (
        !normalizedEntry.thumbnail
        && typeof previousEntry.thumbnail === 'string'
        && previousEntry.thumbnail.length > 0
      ) {
        mergedEntry.thumbnail = previousEntry.thumbnail;
      }
    }
    if (
      previousEntry
      && getRecentProjectMeaningfulSignature(previousEntry) === getRecentProjectMeaningfulSignature(mergedEntry)
    ) {
      return normalizeSharedRecentProjectEntry(previousEntry) || normalizedEntry;
    }
    const workingEntries = existingEntries.filter(entry => entry && entry.id && entry.id !== normalizedEntry.id);
    workingEntries.unshift(mergedEntry);
    const normalizedEntries = enforceSharedRecentProjectLimit(workingEntries);
    await saveRecentProjectsList(existingEntries, normalizedEntries);
    setRecentProjectsCache(normalizedEntries);
    return normalizeSharedRecentProjectEntry(mergedEntry) || normalizedEntry;
  }

  async function refreshSharedRecentProjectEntryFromBackend(entry = null) {
    const normalizedEntry = normalizeSharedRecentProjectEntry(entry);
    if (!normalizedEntry) {
      return null;
    }
    let project = null;
    if (normalizedEntry.sharedProjectInviteToken) {
      project = await fetchSharedProjectRecordByInviteToken(normalizedEntry.sharedProjectInviteToken);
    }
    if (!project?.project_key) {
      project = await loadSharedProjectSnapshotRecord(normalizedEntry.sharedProjectKey, {
        createIfMissing: false,
        title: createSharedProjectSnapshotTitle(normalizedEntry.name || state.documentName || DEFAULT_DOCUMENT_NAME),
      });
    }
    if (!project?.project_key) {
      return normalizedEntry;
    }
    const thumbnail = normalizedEntry.thumbnail || null;
    return await upsertSharedRecentProjectEntry({
      projectKey: normalizeMultiProjectKey(project.project_key),
      projectId: project.id || '',
      inviteToken: project.invite_token || normalizedEntry.sharedProjectInviteToken || '',
      visibility: project.visibility || normalizedEntry.sharedProjectVisibility || 'shared',
      name: createSharedProjectSnapshotTitle(project.title || normalizedEntry.name || state.documentName || DEFAULT_DOCUMENT_NAME),
      fileName: normalizedEntry.fileName || normalizeDocumentName(`${normalizedEntry.name || DEFAULT_DOCUMENT_NAME}.pixiedraw`),
      thumbnail,
      roleHint: project?.owner_user_id === accountState.userId ? 'master' : 'guest',
      membershipRole: project?.membership_role || normalizedEntry.sharedProjectMembershipRole || '',
      ownerUserId: project?.owner_user_id || normalizedEntry.sharedProjectOwnerUserId || '',
      autoJoin: normalizedEntry.sharedAutoJoin !== false,
      revision: Math.max(0, Math.round(Number(project.latest_revision) || 0)),
      structureRevision: Math.max(0, Math.round(Number(project.latest_structure_revision) || 0)),
      project: null,
    }) || normalizedEntry;
  }

  function getRecentProjectMeaningfulSignature(entry = null) {
    if (!entry || typeof entry !== 'object') {
      return '';
    }
    const isShared = isSharedRecentProjectEntry(entry);
    const signature = {
      id: normalizeAutosaveProjectId(entry.id || ''),
      accountUserId: normalizeRecentProjectAccountUserId(entry.accountUserId || ''),
      storageKind: getRecentProjectStorageKind(entry),
      name: String(entry.name || ''),
      fileName: String(entry.fileName || ''),
      thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : '',
    };
    if (isShared) {
      signature.sharedProjectKey = normalizeMultiProjectKey(entry.sharedProjectKey || '');
      signature.sharedProjectBackendId = String(entry.sharedProjectBackendId || '');
      signature.sharedProjectInviteToken = String(entry.sharedProjectInviteToken || '');
      signature.sharedProjectVisibility = String(entry.sharedProjectVisibility || '');
      signature.sharedRoleHint = String(entry.sharedRoleHint || '');
      signature.sharedAutoJoin = entry.sharedAutoJoin !== false;
      signature.sharedProjectRevision = Math.max(0, Math.round(Number(entry.sharedProjectRevision) || 0));
      signature.sharedProjectStructureRevision = Math.max(0, Math.round(Number(entry.sharedProjectStructureRevision) || 0));
      signature.sharedProjectMembershipRole = String(entry.sharedProjectMembershipRole || '');
      signature.sharedProjectOwnerUserId = String(entry.sharedProjectOwnerUserId || '');
      signature.hasProject = Boolean(entry.project && typeof entry.project === 'object');
    } else {
      signature.updatedAt = String(entry.updatedAt || '');
      signature.projectId = normalizeAutosaveProjectId(entry.projectId || entry.id || '');
    }
    return JSON.stringify(signature);
  }

  function getRecentProjectsUiSignature(entries = []) {
    if (!Array.isArray(entries) || !entries.length) {
      return '[]';
    }
    return JSON.stringify(entries.map(entry => getRecentProjectMeaningfulSignature(entry)));
  }

  function scheduleRecentProjectsListRender(entries = [], { immediate = false, force = false } = {}) {
    const normalizedEntries = Array.isArray(entries) ? entries.slice() : [];
    const signature = getRecentProjectsUiSignature(normalizedEntries);
    if (!force && signature === recentProjectsLastRenderSignature && !recentProjectsRenderTimer) {
      return;
    }
    recentProjectsPendingRenderEntries = normalizedEntries;
    if (recentProjectsRenderTimer !== null) {
      window.clearTimeout(recentProjectsRenderTimer);
      recentProjectsRenderTimer = null;
    }
    const render = () => {
      recentProjectsRenderTimer = null;
      const nextEntries = Array.isArray(recentProjectsPendingRenderEntries)
        ? recentProjectsPendingRenderEntries
        : [];
      recentProjectsPendingRenderEntries = null;
      const nextSignature = getRecentProjectsUiSignature(nextEntries);
      if (!force && nextSignature === recentProjectsLastRenderSignature) {
        return;
      }
      recentProjectsLastRenderSignature = nextSignature;
      renderRecentProjectsList(nextEntries);
    };
    if (immediate || !recentProjectsLastRenderSignature) {
      render();
      return;
    }
    recentProjectsRenderTimer = window.setTimeout(render, 120);
  }

  function setRecentProjectsCache(entries) {
    recentProjectsCache.clear();
    const sortedEntries = Array.isArray(entries)
      ? entries.slice().sort((a, b) => {
        const aTime = typeof a?.updatedAt === 'string' ? a.updatedAt : '';
        const bTime = typeof b?.updatedAt === 'string' ? b.updatedAt : '';
        return bTime.localeCompare(aTime);
      })
      : [];
    if (sortedEntries.length) {
      sortedEntries.forEach(entry => {
        if (entry && entry.id) {
          recentProjectsCache.set(entry.id, entry);
        }
      });
    }
    syncStartupResumeState(sortedEntries);
    scheduleRecentProjectsListRender(sortedEntries);
  }

  function syncStartupResumeState(entries = []) {
    const resumeButton = dom.startup?.resumeButton;
    const resumeHint = dom.startup?.resumeHint;
    if (!(resumeButton instanceof HTMLButtonElement)) {
      if (resumeHint instanceof HTMLElement) {
        resumeHint.textContent = '';
      }
      return;
    }
    const firstEntry = Array.isArray(entries) && entries.length ? entries[0] : null;
    if (!firstEntry || !firstEntry.id) {
      resumeButton.disabled = true;
      if (resumeHint instanceof HTMLElement) {
        resumeHint.textContent = localizeText(
          'まだ保存データがありません。まずは新規作成またはファイルを開いてください。',
          'No saved data yet. Create a new project or open a file.'
        );
      }
      return;
    }
    resumeButton.disabled = false;
    const displayLabel = extractDocumentBaseName(firstEntry.fileName || firstEntry.name || DEFAULT_DOCUMENT_NAME);
    const updatedAt = Date.parse(firstEntry.updatedAt || '');
    const atLabel = Number.isFinite(updatedAt)
      ? formatUpdateHistoryDate(updatedAt, '')
      : '';
    if (resumeHint instanceof HTMLElement) {
      resumeHint.textContent = atLabel
        ? localizeText(`最近: ${displayLabel}（${atLabel}）`, `Recent: ${displayLabel} (${atLabel})`)
        : localizeText(`最近: ${displayLabel}`, `Recent: ${displayLabel}`);
    }
  }

  function renderRecentProjectsList(entries) {
    console.info('[pixiedraw-dev:recent-projects]', {
      phase: 'recent-projects-render-start',
      count: Array.isArray(entries) ? entries.length : 0,
      hasContainer: Boolean(dom.startup?.recentList || dom.projectHomeRecentList),
      containerHidden: Boolean(dom.startup?.recentSection?.hidden && dom.projectHomeRecentSection?.hidden),
      code: '',
    });
    const hasEntries = Array.isArray(entries) && entries.length > 0;
    const targets = [
      {
        section: dom.startup?.recentSection,
        list: dom.startup?.recentList,
        titleSelector: '.startup-screen__recent-title',
        title: localizeText('端末内プロジェクト（自動保存）', 'Local Projects (Autosave)'),
      },
      {
        section: dom.projectHomeRecentSection,
        list: dom.projectHomeRecentList,
        titleSelector: '.project-home-screen__section-title',
        title: localizeText('プロジェクト', 'Projects'),
      },
    ].filter(target => target.section instanceof HTMLElement && target.list instanceof HTMLElement);
    if (!targets.length) {
      // Recent projects remain durable local metadata even when this view is
      // not mounted yet.
      return;
    }
    const renderProjectHomeEmptyState = target => {
      const titleNode = target.section.querySelector(target.titleSelector);
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = target.title;
      }
      target.list.innerHTML = '';
      const empty = document.createElement('p');
      empty.className = 'startup-recent-list__empty';
      empty.textContent = localizeText(
        'まだプロジェクトがありません。',
        'No projects yet.'
      );
      target.list.appendChild(empty);
      target.section.hidden = false;
    };
    if (!AUTOSAVE_SUPPORTED || !hasEntries) {
      targets.forEach(target => {
        if (target.list === dom.projectHomeRecentList) {
          if (
            !hasEntries
            && recentProjectsCache instanceof Map
            && recentProjectsCache.size > 0
            && target.list.children.length > 0
          ) {
            target.section.hidden = false;
            return;
          }
          renderProjectHomeEmptyState(target);
          return;
        }
        target.section.hidden = true;
      });
      updatePixieedAccountUi();
      syncPixieedSupportBenefitUi();
      console.info('[pixiedraw-dev:recent-projects]', { phase: 'recent-projects-render-success', count: Array.isArray(entries) ? entries.length : 0, hasContainer: true, containerHidden: Boolean(dom.startup?.recentSection?.hidden), code: '' });
      return;
    }
    targets.forEach(target => {
      const titleNode = target.section.querySelector(target.titleSelector);
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = target.title;
      }
      target.section.hidden = false;
    });
    targets.forEach(target => {
      target.list.innerHTML = '';
    });
    const createRecentProjectCard = entry => {
      if (!entry || !entry.id) {
        return null;
      }
      const isSharedEntry = isSharedRecentProjectEntry(entry);
      const sharedRoleHint = typeof entry.sharedRoleHint === 'string' ? entry.sharedRoleHint.trim() : '';
      const sharedMembershipRole = typeof entry.sharedProjectMembershipRole === 'string'
        ? entry.sharedProjectMembershipRole.trim()
        : '';
      const isOwnedSharedEntry = isSharedEntry && (
        isOwnedSharedRecentProjectEntry(entry)
        || sharedRoleHint === 'master'
        || sharedMembershipRole === 'owner'
      );
      const projectKind = isSharedEntry
        ? (isOwnedSharedEntry ? 'shared-owned' : 'shared-joined')
        : 'local';
      const projectKindLabel = projectKind === 'shared-owned'
        ? localizeText('自分の共有プロジェクト', 'Shared project you own')
        : projectKind === 'shared-joined'
          ? localizeText('参加した共有プロジェクト', 'Joined shared project')
          : localizeText('端末内プロジェクト', 'Local project');
      const displayLabel = extractDocumentBaseName(entry.fileName || entry.name || DEFAULT_DOCUMENT_NAME);
      const card = document.createElement('article');
      card.className = 'startup-recent-card';
      card.dataset.projectId = entry.id;
      card.dataset.projectStorageKind = getRecentProjectStorageKind(entry);
      card.dataset.projectKind = projectKind;
      card.setAttribute('role', 'listitem');
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'startup-recent-card__open';
      openButton.dataset.startupRecentOpenId = entry.id;
      openButton.dataset.projectKind = projectKind;
      openButton.setAttribute('aria-label', localizeText(`${displayLabel} を開く`, `Open ${displayLabel}`));
      const kindBadge = document.createElement('span');
      kindBadge.className = 'startup-recent-card__kind';
      kindBadge.title = projectKindLabel;
      kindBadge.setAttribute('aria-label', projectKindLabel);
      const thumb = document.createElement('div');
      thumb.className = 'startup-recent-card__thumb';
      if (entry.thumbnail) {
        const img = new Image();
        img.src = entry.thumbnail;
        img.alt = localizeText(
          `${displayLabel || 'プロジェクト'} のプレビュー`,
          `${displayLabel || 'Project'} preview`
        );
        img.decoding = 'async';
        thumb.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'startup-recent-card__thumb-placeholder';
        placeholder.textContent = localizeText('プレビューなし', 'No Preview');
        thumb.appendChild(placeholder);
      }
      const nameNode = document.createElement('span');
      nameNode.className = 'startup-recent-card__name';
      nameNode.textContent = displayLabel;
      nameNode.title = displayLabel;
      const metaNode = document.createElement('span');
      metaNode.className = 'startup-recent-card__meta';
      const updatedAt = Date.parse(entry.updatedAt || '');
      const updatedLabel = Number.isFinite(updatedAt)
        ? formatUpdateHistoryDate(updatedAt, localizeText('保存時刻不明', 'Saved time unavailable'))
        : localizeText('保存時刻不明', 'Saved time unavailable');
      metaNode.textContent = updatedLabel;
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'startup-recent-card__delete';
      deleteButton.dataset.startupRecentDeleteId = entry.id;
      deleteButton.textContent = '×';
      deleteButton.title = isSharedEntry
        ? localizeText('共有プロジェクト一覧から外す', 'Remove shared project from list')
        : localizeText('端末内プロジェクトを削除', 'Delete local project');
      deleteButton.setAttribute(
        'aria-label',
        isSharedEntry
          ? localizeText(`${displayLabel} を一覧から外す`, `Remove ${displayLabel} from list`)
          : localizeText(`${displayLabel} を削除`, `Delete ${displayLabel}`)
      );
      openButton.appendChild(kindBadge);
      openButton.appendChild(thumb);
      openButton.appendChild(nameNode);
      openButton.appendChild(metaNode);
      card.appendChild(openButton);
      card.appendChild(deleteButton);
      return card;
    };
    const createProjectHomeAdCard = () => {
      if (!window.__PIXIEEDRAW_SHOULD_SHOW_ADS__?.()) {
        return null;
      }
      const card = document.createElement('article');
      card.className = 'startup-recent-card startup-recent-card--ad';
      card.dataset.pixieedReserveAdSpace = 'true';
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', localizeText('広告', 'Ad'));
      const frame = document.createElement('div');
      frame.className = 'startup-recent-card__open startup-recent-card__open--ad';
      const kindBadge = document.createElement('span');
      kindBadge.className = 'startup-recent-card__kind';
      kindBadge.textContent = localizeText('広告', 'Ad');
      const thumb = document.createElement('div');
      thumb.className = 'startup-recent-card__thumb startup-recent-card__thumb--ad';
      const ad = document.createElement('ins');
      ad.className = 'startup-recent-card__ad-ins';
      ad.setAttribute('data-ad-client', 'ca-pub-9801602250480253');
      ad.setAttribute('data-ad-format', 'rectangle');
      ad.setAttribute('data-ad-slot', '2141591954');
      ad.setAttribute('data-full-width-responsive', 'false');
      ad.dataset.pixieedAdCard = 'true';
      ad.style.display = 'block';
      thumb.appendChild(ad);
      const nameNode = document.createElement('span');
      nameNode.className = 'startup-recent-card__name';
      nameNode.textContent = localizeText('広告', 'Ad');
      const metaNode = document.createElement('span');
      metaNode.className = 'startup-recent-card__meta';
      metaNode.textContent = localizeText('PiXiEEDを支援', 'Supports PiXiEED');
      frame.appendChild(kindBadge);
      frame.appendChild(thumb);
      frame.appendChild(nameNode);
      frame.appendChild(metaNode);
      card.appendChild(frame);
      return card;
    };
    entries.forEach((entry, index) => {
      targets.forEach(target => {
        const card = createRecentProjectCard(entry);
        if (card) {
          target.list.appendChild(card);
        }
        if (target.list === dom.projectHomeRecentList && (index + 1) % 8 === 0) {
          const adCard = createProjectHomeAdCard();
          if (adCard) {
            target.list.appendChild(adCard);
          }
        }
      });
    });
    updatePixieedAccountUi();
    syncPixieedSupportBenefitUi();
    if (startupVisible || projectHomeVisible) {
      window.requestAnimationFrame(() => {
        queueStartupRecentAdRender();
      });
    }
    console.info('[pixiedraw-dev:recent-projects]', { phase: 'recent-projects-render-success', count: entries.length, hasContainer: true, containerHidden: false, code: '' });
  }

  async function ensureSharedRecentProjectsAccountSynced({ force = false } = {}) {
    if (!AUTOSAVE_SUPPORTED || !accountState.isLoggedIn || accountState.isAnonymous) {
      return [];
    }
    const now = Date.now();
    if (!force && sharedRecentProjectsAccountSyncPromise) {
      return sharedRecentProjectsAccountSyncPromise;
    }
    if (
      force
      && sharedRecentProjectsLastAccountSyncAt > 0
      && (now - sharedRecentProjectsLastAccountSyncAt) < SHARED_RECENT_PROJECTS_FORCE_SYNC_COOLDOWN_MS
    ) {
      return [];
    }
    if (
      !force
      && sharedRecentProjectsLastAccountSyncAt > 0
      && (now - sharedRecentProjectsLastAccountSyncAt) < SHARED_RECENT_PROJECTS_ACCOUNT_SYNC_COOLDOWN_MS
    ) {
      return [];
    }
    if (sharedRecentProjectsAccountSyncPromise) {
      return sharedRecentProjectsAccountSyncPromise;
    }
    sharedRecentProjectsAccountSyncPromise = (async () => {
      try {
        return await syncSharedRecentProjectsFromAccount();
      } finally {
        sharedRecentProjectsLastAccountSyncAt = Date.now();
        sharedRecentProjectsAccountSyncPromise = null;
      }
    })();
    return sharedRecentProjectsAccountSyncPromise;
  }

  async function refreshRecentProjectsUI(options = {}) {
    console.info('[pixiedraw-dev:recent-projects]', { phase: 'recent-projects-load-start', count: 0, hasContainer: Boolean(dom.startup?.recentList || dom.projectHomeRecentList), containerHidden: Boolean(dom.startup?.recentSection?.hidden && dom.projectHomeRecentSection?.hidden), code: '' });
    const hasRecentList = (
      (dom.startup?.recentSection instanceof HTMLElement && dom.startup?.recentList instanceof HTMLElement)
      || (dom.projectHomeRecentSection instanceof HTMLElement && dom.projectHomeRecentList instanceof HTMLElement)
    );
    if (!hasRecentList) {
      // The editor deliberately has no local-project list. Project browsing
      // lives in PiXiEED My Page, so a missing list is an expected UI shape,
      // not a storage failure.
      console.info('[pixiedraw-dev:recent-projects]', { phase: 'recent-projects-load-skipped', count: recentProjectsCache.size, hasContainer: false, containerHidden: true, code: 'RECENT_UI_REMOVED' });
      return;
    }
    if (!AUTOSAVE_SUPPORTED) {
      recentProjectsCache.clear();
      [dom.startup?.recentList, dom.projectHomeRecentList].forEach(list => {
        if (list instanceof HTMLElement) {
          list.innerHTML = '';
        }
      });
      if (dom.startup?.recentSection instanceof HTMLElement) {
        dom.startup.recentSection.hidden = true;
      }
      renderRecentProjectsList([]);
      console.info('[pixiedraw-dev:recent-projects]', { phase: 'recent-projects-load-success', count: 0, hasContainer: true, containerHidden: true, code: 'AUTOSAVE_UNSUPPORTED' });
      return;
    }
    if (options?.syncSharedFromAccount !== false) {
      try {
        await ensureSharedRecentProjectsAccountSynced({ force: Boolean(options?.forceSharedAccountSync) });
      } catch (error) {
        console.warn('Failed to sync shared recent projects from account', error);
      }
    }
    const shouldSanitize = options?.sanitize !== false;
    if (shouldSanitize) {
      await sanitizeRecentProjectsStore({ announce: false });
      console.info('[pixiedraw-dev:recent-projects]', { phase: 'recent-projects-load-success', count: recentProjectsCache.size, hasContainer: true, containerHidden: Boolean(dom.startup?.recentSection?.hidden), code: 'SANITIZED' });
      return;
    }
    const entries = await loadRecentProjectsMetadata();
    const limitedEntries = enforceSharedRecentProjectLimit(entries);
    if (limitedEntries.length !== entries.length) {
      await saveRecentProjectsList(entries, limitedEntries);
    }
    setRecentProjectsCache(limitedEntries);
    console.info('[pixiedraw-dev:recent-projects]', { phase: 'recent-projects-load-success', count: limitedEntries.length, hasContainer: true, containerHidden: Boolean(dom.startup?.recentSection?.hidden), code: '' });
  }


        return Object.freeze({
        sanitizeRecentProjectsStore,
        removeRecentProjectEntry,
        upsertSharedRecentProjectEntry,
        refreshSharedRecentProjectEntryFromBackend,
        getRecentProjectMeaningfulSignature,
        getRecentProjectsUiSignature,
        scheduleRecentProjectsListRender,
        setRecentProjectsCache,
        syncStartupResumeState,
        renderRecentProjectsList,
        ensureSharedRecentProjectsAccountSynced,
        refreshRecentProjectsUI,
        });
      }
    })(scope);
  }

  root.recentProjectWorkflowUtils = Object.freeze({
    createRecentProjectWorkflowUtils,
  });
})();
