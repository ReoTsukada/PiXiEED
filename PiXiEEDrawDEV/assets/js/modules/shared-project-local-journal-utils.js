(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectLocalJournalUtils(rawScope = {}) {
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
  function buildSharedLocalOpJournalEntry(op, {
    status = 'pending',
    committedRevision = 0,
    committedStructureRevision = 0,
  } = {}) {
    if (!op || typeof op !== 'object') {
      return null;
    }
    const projectKey = normalizeMultiProjectKey(op.projectKey || '');
    const opId = getSharedProjectOpId(op) || generateSharedProjectOpId();
    if (!projectKey || !opId) {
      return null;
    }
    return {
      id: opId,
      projectKey,
      status: status === 'confirmed' ? 'confirmed' : 'pending',
      historyLabel: String(op.historyLabel || ''),
      kind: String(op.kind || ''),
      baseRevision: Math.max(0, Math.round(Number(op.baseRevision) || 0)),
      baseStructureRevision: Math.max(0, Math.round(Number(op.baseStructureRevision) || 0)),
      committedRevision: Math.max(0, Math.round(Number(committedRevision) || 0)),
      committedStructureRevision: Math.max(0, Math.round(Number(committedStructureRevision) || 0)),
      createdAt: typeof op.createdAt === 'string' && op.createdAt.trim()
        ? op.createdAt.trim()
        : new Date().toISOString(),
      canvasId: typeof op.canvasId === 'string' ? op.canvasId.trim() : '',
      frameIndex: Math.max(0, Math.round(Number(op.frameIndex) || 0)),
      layerId: typeof op.layerId === 'string' ? op.layerId.trim() : '',
      op,
    };
  }

  function normalizeSharedLocalOpJournalEntryLike(entryLike) {
    if (!entryLike || typeof entryLike !== 'object') {
      return null;
    }
    const sourceOp = entryLike?.op && typeof entryLike.op === 'object'
      ? entryLike.op
      : entryLike;
    const normalized = buildSharedLocalOpJournalEntry(sourceOp, {
      status: entryLike?.status === 'confirmed' ? 'confirmed' : 'pending',
      committedRevision: Math.max(0, Math.round(Number(entryLike?.committedRevision) || 0)),
      committedStructureRevision: Math.max(0, Math.round(Number(entryLike?.committedStructureRevision) || 0)),
    });
    if (!normalized) {
      return null;
    }
    normalized.createdAt = typeof entryLike?.createdAt === 'string' && entryLike.createdAt.trim()
      ? entryLike.createdAt.trim()
      : normalized.createdAt;
    normalized.op = sourceOp;
    return normalized;
  }

  function readSharedLocalOpJournalFallbackEntries(projectKey = '') {
    if (!canUseSessionStorage) {
      return [];
    }
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    const raw = readSessionStorageForLocalRestore(SHARED_LOCAL_OP_JOURNAL_FALLBACK_STORAGE_KEY)
      || readLocalStorageForLocalRestore(SHARED_LOCAL_OP_JOURNAL_FALLBACK_STORAGE_KEY)
      || '';
    if (!raw) {
      return [];
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return [];
    }
    const list = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.entries) ? parsed.entries : []);
    const entries = list
      .map(entryLike => normalizeSharedLocalOpJournalEntryLike(entryLike))
      .filter(Boolean)
      .filter(entry => !normalizedProjectKey || normalizeMultiProjectKey(entry?.projectKey || '') === normalizedProjectKey)
      .sort((left, right) => String(left?.createdAt || '').localeCompare(String(right?.createdAt || '')));
    return entries;
  }

  function writeSharedLocalOpJournalFallbackEntries(entries = []) {
    if (!canUseSessionStorage) {
      return false;
    }
    const normalized = entries
      .map(entryLike => normalizeSharedLocalOpJournalEntryLike(entryLike))
      .filter(Boolean)
      .sort((left, right) => String(left?.createdAt || '').localeCompare(String(right?.createdAt || '')));
    const capped = normalized.slice(Math.max(0, normalized.length - SHARED_LOCAL_OP_JOURNAL_FALLBACK_MAX_ENTRIES));
    const payload = {
      version: 1,
      entries: capped,
    };
    try {
      const serialized = JSON.stringify(payload);
      writeSessionStorageForLocalRestore(SHARED_LOCAL_OP_JOURNAL_FALLBACK_STORAGE_KEY, serialized);
      writeLocalStorageForLocalRestore(SHARED_LOCAL_OP_JOURNAL_FALLBACK_STORAGE_KEY, serialized);
      return true;
    } catch (error) {
      return false;
    }
  }

  function upsertSharedLocalOpJournalFallbackEntry(entryLike) {
    const entry = normalizeSharedLocalOpJournalEntryLike(entryLike);
    if (!entry) {
      return false;
    }
    const existing = readSharedLocalOpJournalFallbackEntries('');
    const next = existing.filter(item => item?.id !== entry.id);
    next.push(entry);
    return writeSharedLocalOpJournalFallbackEntries(next);
  }

  function removeSharedLocalOpJournalFallbackEntries(opIds = []) {
    const normalizedIds = new Set(
      (Array.isArray(opIds) ? opIds : [])
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    );
    if (!normalizedIds.size) {
      return false;
    }
    const existing = readSharedLocalOpJournalFallbackEntries('');
    if (!existing.length) {
      return false;
    }
    const next = existing.filter(entry => !normalizedIds.has(String(entry?.id || '').trim()));
    if (next.length === existing.length) {
      return false;
    }
    return writeSharedLocalOpJournalFallbackEntries(next);
  }

  function mergeSharedLocalOpJournalEntries(primaryEntries = [], secondaryEntries = []) {
    const merged = new Map();
    const ingest = (entryLike) => {
      const entry = normalizeSharedLocalOpJournalEntryLike(entryLike);
      if (!entry?.id) {
        return;
      }
      const existing = merged.get(entry.id);
      if (!existing) {
        merged.set(entry.id, entry);
        return;
      }
      const next = {
        ...existing,
        ...entry,
      };
      if (existing.status === 'confirmed' || entry.status === 'confirmed') {
        next.status = 'confirmed';
        next.committedRevision = Math.max(
          Math.max(0, Math.round(Number(existing.committedRevision) || 0)),
          Math.max(0, Math.round(Number(entry.committedRevision) || 0))
        );
        next.committedStructureRevision = Math.max(
          Math.max(0, Math.round(Number(existing.committedStructureRevision) || 0)),
          Math.max(0, Math.round(Number(entry.committedStructureRevision) || 0))
        );
      }
      next.createdAt = String(existing.createdAt || entry.createdAt || '');
      next.op = entry.op || existing.op;
      merged.set(entry.id, next);
    };
    (Array.isArray(primaryEntries) ? primaryEntries : []).forEach(ingest);
    (Array.isArray(secondaryEntries) ? secondaryEntries : []).forEach(ingest);
    return Array.from(merged.values())
      .sort((left, right) => String(left?.createdAt || '').localeCompare(String(right?.createdAt || '')));
  }

  async function appendSharedLocalOpJournal(op, { status = 'pending' } = {}) {
    const entry = buildSharedLocalOpJournalEntry(op, { status });
    if (!entry) {
      return null;
    }
    if (!AUTOSAVE_SUPPORTED) {
      upsertSharedLocalOpJournalFallbackEntry(entry);
      return entry;
    }
    const writeTask = async () => {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([SHARED_LOCAL_OP_JOURNAL_STORE], 'readwrite');
        const store = tx.objectStore(SHARED_LOCAL_OP_JOURNAL_STORE);
        store.put(entry);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
      return entry;
    };
    const nextWrite = sharedLocalOpJournalWritePromise
      .catch(() => {})
      .then(writeTask);
    sharedLocalOpJournalWritePromise = nextWrite.catch(() => {});
    try {
      const persisted = await nextWrite;
      removeSharedLocalOpJournalFallbackEntries([persisted?.id || '']);
      return persisted;
    } catch (error) {
      upsertSharedLocalOpJournalFallbackEntry(entry);
      throw error;
    }
  }

  async function updateSharedLocalOpJournalStatus(op, {
    status = 'confirmed',
    committedRevision = 0,
    committedStructureRevision = 0,
  } = {}) {
    const entry = buildSharedLocalOpJournalEntry(op, {
      status,
      committedRevision,
      committedStructureRevision,
    });
    if (!entry) {
      return null;
    }
    if (!AUTOSAVE_SUPPORTED) {
      upsertSharedLocalOpJournalFallbackEntry(entry);
      return entry;
    }
    const writeTask = async () => {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([SHARED_LOCAL_OP_JOURNAL_STORE], 'readwrite');
        const store = tx.objectStore(SHARED_LOCAL_OP_JOURNAL_STORE);
        const request = store.get(entry.id);
        request.onsuccess = () => {
          const existing = request.result && typeof request.result === 'object' ? request.result : null;
          store.put(existing
            ? {
                ...existing,
                ...entry,
                op: existing.op || entry.op,
                createdAt: existing.createdAt || entry.createdAt,
              }
            : entry);
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
      return entry;
    };
    const nextWrite = sharedLocalOpJournalWritePromise
      .catch(() => {})
      .then(writeTask);
    sharedLocalOpJournalWritePromise = nextWrite.catch(() => {});
    try {
      const persisted = await nextWrite;
      if (persisted?.status === 'confirmed') {
        removeSharedLocalOpJournalFallbackEntries([persisted.id]);
      } else {
        upsertSharedLocalOpJournalFallbackEntry(persisted);
      }
      return persisted;
    } catch (error) {
      upsertSharedLocalOpJournalFallbackEntry(entry);
      throw error;
    }
  }

  async function deleteSharedLocalOpJournalEntry(opOrOpId) {
    const opId = typeof opOrOpId === 'string' ? opOrOpId.trim() : getSharedProjectOpId(opOrOpId);
    if (!opId) {
      return false;
    }
    if (!AUTOSAVE_SUPPORTED) {
      return removeSharedLocalOpJournalFallbackEntries([opId]);
    }
    const writeTask = async () => {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([SHARED_LOCAL_OP_JOURNAL_STORE], 'readwrite');
        const store = tx.objectStore(SHARED_LOCAL_OP_JOURNAL_STORE);
        store.delete(opId);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
      return true;
    };
    const nextWrite = sharedLocalOpJournalWritePromise
      .catch(() => {})
      .then(writeTask);
    sharedLocalOpJournalWritePromise = nextWrite.catch(() => {});
    try {
      const deleted = await nextWrite;
      removeSharedLocalOpJournalFallbackEntries([opId]);
      return deleted;
    } catch (error) {
      removeSharedLocalOpJournalFallbackEntries([opId]);
      throw error;
    }
  }

  async function loadSharedLocalOpJournal(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return [];
    }
    const fallbackEntries = readSharedLocalOpJournalFallbackEntries(normalizedProjectKey);
    if (!AUTOSAVE_SUPPORTED) {
      return fallbackEntries;
    }
    try {
      const db = await openAutosaveDatabase();
      const entries = await new Promise((resolve, reject) => {
        const tx = db.transaction([SHARED_LOCAL_OP_JOURNAL_STORE], 'readonly');
        const store = tx.objectStore(SHARED_LOCAL_OP_JOURNAL_STORE);
        const request = store.getAll();
        let result = [];
        request.onsuccess = () => {
          result = Array.isArray(request.result) ? request.result : [];
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
      const filteredEntries = entries
        .filter(entry => normalizeMultiProjectKey(entry?.projectKey || '') === normalizedProjectKey);
      return mergeSharedLocalOpJournalEntries(filteredEntries, fallbackEntries);
    } catch (error) {
      console.warn('Failed to load shared local op journal', error);
      return fallbackEntries;
    }
  }

  async function pruneSharedLocalOpJournal(projectKey = activeSharedProjectKey, {
    keepConfirmed = SHARED_LOCAL_OP_JOURNAL_MAX_CONFIRMED_PER_PROJECT,
    checkpointRevision = 0,
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return 0;
    }
    const confirmedLimit = Math.max(32, Math.round(Number(keepConfirmed) || SHARED_LOCAL_OP_JOURNAL_MAX_CONFIRMED_PER_PROJECT));
    const targetCheckpointRevision = Math.max(0, Math.round(Number(checkpointRevision) || 0));
    const entries = AUTOSAVE_SUPPORTED
      ? await loadSharedLocalOpJournal(normalizedProjectKey)
      : readSharedLocalOpJournalFallbackEntries(normalizedProjectKey);
    if (!entries.length) {
      return 0;
    }
    const confirmed = entries.filter(entry => entry?.status === 'confirmed');
    if (!confirmed.length) {
      return 0;
    }
    const removable = [];
    const sortedConfirmed = confirmed
      .slice()
      .sort((left, right) => (
        Math.max(0, Math.round(Number(left?.committedRevision) || 0))
        - Math.max(0, Math.round(Number(right?.committedRevision) || 0))
      ));
    const overflow = Math.max(0, sortedConfirmed.length - confirmedLimit);
    for (let index = 0; index < sortedConfirmed.length; index += 1) {
      const entry = sortedConfirmed[index];
      const committedRevision = Math.max(0, Math.round(Number(entry?.committedRevision) || 0));
      if (targetCheckpointRevision > 0 && committedRevision > 0 && committedRevision <= targetCheckpointRevision) {
        removable.push(entry.id);
        continue;
      }
      if (index < overflow) {
        removable.push(entry.id);
      }
      if (removable.length >= SHARED_LOCAL_OP_JOURNAL_PRUNE_BATCH) {
        break;
      }
    }
    if (!removable.length) {
      return 0;
    }
    if (!AUTOSAVE_SUPPORTED) {
      removeSharedLocalOpJournalFallbackEntries(removable);
      return removable.length;
    }
    const writeTask = async () => {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([SHARED_LOCAL_OP_JOURNAL_STORE], 'readwrite');
        const store = tx.objectStore(SHARED_LOCAL_OP_JOURNAL_STORE);
        removable.forEach(id => {
          if (id) {
            store.delete(id);
          }
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
      return removable.length;
    };
    const nextWrite = sharedLocalOpJournalWritePromise
      .catch(() => {})
      .then(writeTask);
    sharedLocalOpJournalWritePromise = nextWrite.catch(() => {});
    const prunedCount = await nextWrite;
    if (prunedCount > 0) {
      removeSharedLocalOpJournalFallbackEntries(removable);
    }
    return prunedCount;
  }

  async function flushOrCompactSharedLocalOpJournal(projectKey = activeSharedProjectKey, {
    checkpointRevision = 0,
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return 0;
    }
    return await pruneSharedLocalOpJournal(normalizedProjectKey, { checkpointRevision });
  }

  async function discardPendingSharedLocalOpJournal(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return 0;
    }
    const entries = AUTOSAVE_SUPPORTED
      ? await loadSharedLocalOpJournal(normalizedProjectKey)
      : readSharedLocalOpJournalFallbackEntries(normalizedProjectKey);
    if (!entries.length) {
      return 0;
    }
    const removable = entries
      .filter(entry => entry?.status === 'pending')
      .map(entry => entry?.id)
      .filter(Boolean);
    if (!removable.length) {
      return 0;
    }
    if (!AUTOSAVE_SUPPORTED) {
      removeSharedLocalOpJournalFallbackEntries(removable);
      return removable.length;
    }
    const writeTask = async () => {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([SHARED_LOCAL_OP_JOURNAL_STORE], 'readwrite');
        const store = tx.objectStore(SHARED_LOCAL_OP_JOURNAL_STORE);
        removable.forEach(id => store.delete(id));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
      return removable.length;
    };
    const nextWrite = sharedLocalOpJournalWritePromise
      .catch(() => {})
      .then(writeTask);
    sharedLocalOpJournalWritePromise = nextWrite.catch(() => {});
    const discardedCount = await nextWrite;
    if (discardedCount > 0) {
      removeSharedLocalOpJournalFallbackEntries(removable);
    }
    return discardedCount;
  }

  async function resumeSharedLocalOpJournal(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return 0;
    }
    const entries = await loadSharedLocalOpJournal(normalizedProjectKey);
    if (!entries.length) {
      return 0;
    }
    const queuedIds = new Set(
      sharedProjectPendingLocalOps
        .map(entry => getSharedProjectOpId(entry?.op || entry))
        .filter(Boolean)
    );
    sharedProjectLocalInFlightOps.forEach((_entry, opId) => {
      if (opId) {
        queuedIds.add(opId);
      }
    });
    let resumedCount = 0;
    let discardedExpiredCount = 0;
    entries.forEach(entry => {
      if (entry?.status !== 'pending') {
        return;
      }
      if (isSharedProjectLocalOpExpiredForRetry(entry)) {
        if (discardSharedProjectExpiredLocalOp(entry, { source: 'journal-restore-expired' })) {
          discardedExpiredCount += 1;
        }
        return;
      }
      const queuedOp = entry?.op && typeof entry.op === 'object' ? entry.op : null;
      if (!queuedOp || normalizeMultiProjectKey(queuedOp.projectKey || '') !== normalizedProjectKey) {
        return;
      }
      const opId = getSharedProjectOpId(queuedOp);
      if (!opId || queuedIds.has(opId) || sharedProjectSeenOpIds.has(opId)) {
        return;
      }
      const queuedEntry = {
        projectKey: normalizedProjectKey,
        historyLabel: queuedOp.historyLabel || '',
        op: queuedOp,
        opPayload: queuedOp.payload || null,
        retryOnConflict: true,
      };
      sharedProjectPendingLocalOps.push(queuedEntry);
      rememberSharedProjectLocalInFlightOp(queuedOp, {
        source: 'journal-restore',
        status: 'pending',
        opType: classifySharedProjectOpType(queuedOp.historyLabel || ''),
      });
      queuedIds.add(opId);
      resumedCount += 1;
    });
    if (resumedCount) {
      sortSharedProjectPendingLocalOps();
      if (
        activeSharedProjectDocumentLoaded
        && hasUsableActiveSharedProjectDocumentState()
      ) {
        replaySharedProjectLocalProvisionalAfterRemoteOps('journal-restore-local-visibility');
      }
      flushSharedProjectPendingLocalOps();
    }
    if (discardedExpiredCount > 0) {
      console.warn('[shared-sync]', {
        event: 'expired-local-op-journal-pruned',
        projectKey: normalizedProjectKey,
        discardedExpiredCount,
      });
    }
    return resumedCount;
  }

  async function restorePendingSharedLocalOps(projectKey = activeSharedProjectKey, {
    announce = false,
    refreshReason = 'resume-pending-local-ops',
  } = {}) {
    const sessionTokenAtStart = activeSharedProjectSessionToken;
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return 0;
    }
    const resumedCount = await resumeSharedLocalOpJournal(normalizedProjectKey);
    if (sessionTokenAtStart !== activeSharedProjectSessionToken) {
      console.info('[shared-sync] abort-resume-pending-local-ops-due-to-session-change', { projectKey: normalizedProjectKey });
      return 0;
    }
    if (!resumedCount) {
      return 0;
    }
    if (announce) {
      setMultiStatus(
        localizeText(
          '未送信の共有描画をサーバーへ再送しています…',
          'Resending unsynced shared edits to the server...'
        ),
        'info'
      );
    }
    setActiveSharedProjectSyncState('catching-up', { announce: announce });
    queueSharedProjectRefresh({
      immediate: false,
      reason: refreshReason,
      force: true,
    });
    return resumedCount;
  }


        return Object.freeze({
          buildSharedLocalOpJournalEntry,
          normalizeSharedLocalOpJournalEntryLike,
          readSharedLocalOpJournalFallbackEntries,
          writeSharedLocalOpJournalFallbackEntries,
          upsertSharedLocalOpJournalFallbackEntry,
          removeSharedLocalOpJournalFallbackEntries,
          mergeSharedLocalOpJournalEntries,
          appendSharedLocalOpJournal,
          updateSharedLocalOpJournalStatus,
          deleteSharedLocalOpJournalEntry,
          loadSharedLocalOpJournal,
          pruneSharedLocalOpJournal,
          flushOrCompactSharedLocalOpJournal,
          discardPendingSharedLocalOpJournal,
          resumeSharedLocalOpJournal,
          restorePendingSharedLocalOps,
        });
      }
    })(scope);
  }

  root.sharedProjectLocalJournalUtils = Object.freeze({
    createSharedProjectLocalJournalUtils,
  });
})();
