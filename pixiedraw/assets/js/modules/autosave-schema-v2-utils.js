(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createAutosaveSchemaV2Utils() {
    const AUTOSAVE_SCHEMA_VERSION = 2;
    const AUTOSAVE_JOURNAL_VERSION = 2;
    const MAX_CANVASES_PER_SHEET = 4;
    const FORBIDDEN_RUNTIME_KEYS = new Set([
      'projectSaveHandle',
      'projectSaveHandleMeta',
      'autosaveHandle',
      'pendingAutosaveHandle',
    ]);

    function cloneJsonValue(value, fallback = null) {
      if (value === undefined) {
        return fallback;
      }
      if (typeof structuredClone === 'function') {
        try {
          return structuredClone(value);
        } catch (_error) {
          // Legacy values can contain non-cloneable runtime fields. The JSON
          // fallback below keeps the previous compatibility behavior.
        }
      }
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_error) {
        return fallback;
      }
    }

    function stableStringify(value) {
      if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
      }
      if (ArrayBuffer.isView(value)) {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        let hash = 0x811c9dc5;
        for (let index = 0; index < bytes.length; index += 1) {
          hash ^= bytes[index];
          hash = Math.imul(hash, 0x01000193);
        }
        return JSON.stringify({
          $typedArray: value.constructor?.name || 'TypedArray',
          length: Number(value.length) || 0,
          byteLength: value.byteLength,
          checksum: `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`,
        });
      }
      if (value instanceof ArrayBuffer) {
        return stableStringify(new Uint8Array(value));
      }
      if (Array.isArray(value)) {
        return `[${value.map(item => stableStringify(item)).join(',')}]`;
      }
      const keys = Object.keys(value).sort();
      return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }

    function checksum(value) {
      const text = stableStringify(value);
      let hash = 0x811c9dc5;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }

    function withChecksum(value) {
      const next = cloneJsonValue(value, {}) || {};
      delete next.checksum;
      return { ...next, checksum: checksum(next) };
    }

    function hasValidChecksum(value) {
      if (!value || typeof value !== 'object' || typeof value.checksum !== 'string') {
        return false;
      }
      const next = cloneJsonValue(value, {}) || {};
      const expected = next.checksum;
      delete next.checksum;
      return checksum(next) === expected;
    }

    function sanitizeRuntimeValues(value) {
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(item => sanitizeRuntimeValues(item));
      }
      if (!value || typeof value !== 'object') {
        return value;
      }
      const next = {};
      Object.entries(value).forEach(([key, child]) => {
        if (!FORBIDDEN_RUNTIME_KEYS.has(key)) {
          next[key] = sanitizeRuntimeValues(child);
        }
      });
      return next;
    }

    function normalizeString(value, fallback = '') {
      return typeof value === 'string' && value.trim() ? value.trim() : fallback;
    }

    function normalizeSourceMetadata(source = null) {
      const value = source && typeof source === 'object' ? source : {};
      return {
        sourceKind: normalizeString(value.sourceKind, 'unknown'),
        sourceStorageAdapterId: normalizeString(value.sourceStorageAdapterId, ''),
        sourceProjectToken: normalizeString(value.sourceProjectToken, ''),
      };
    }

    function normalizeSheetInput(sheet = null, index = 0) {
      const value = sheet && typeof sheet === 'object' ? sheet : {};
      const id = normalizeString(value.id, `sheet-${index + 1}`);
      const source = normalizeSourceMetadata(value.source || value);
      const project = sanitizeRuntimeValues(cloneJsonValue(value.project, null));
      if (!project || typeof project !== 'object') {
        throw new Error(`Autosave schema V2 sheet is missing project payload: ${id}`);
      }
      const canvases = Array.isArray(project?.document?.canvases) && project.document.canvases.length
        ? project.document.canvases
        : (project?.document ? [project.document] : []);
      if (canvases.length > MAX_CANVASES_PER_SHEET) {
        const error = new Error(`Autosave schema V2 canvas limit exceeded for ${id}: ${canvases.length}/${MAX_CANVASES_PER_SHEET}`);
        error.code = 'ERR_CANVAS_LIMIT_EXCEEDED';
        throw error;
      }
      delete project.sheets;
      delete project.activeSheetId;
      return {
        id,
        fileName: normalizeString(value.fileName, project?.document?.documentName || `${id}.pxd`),
        label: normalizeString(value.label, `Sheet ${index + 1}`),
        source,
        project,
      };
    }

    function createCheckpointKey(projectId, revision, sheetId) {
      return `autosave-v2:${projectId}:r:${revision}:s:${sheetId}:checkpoint`;
    }

    function createJournalKey(projectId, revision, sheetId) {
      return `autosave-v2:${projectId}:r:${revision}:s:${sheetId}:journal`;
    }

    function createProjectCheckpointKey(projectId, revision) {
      return `autosave-v2:${projectId}:r:${revision}:project:checkpoint`;
    }

    function createProjectJournalKey(projectId, revision) {
      return `autosave-v2:${projectId}:r:${revision}:project:journal`;
    }

    function createManifestKey(projectId, revision) {
      return `autosave-v2:${projectId}:r:${revision}:manifest`;
    }

    function normalizeJournalOps(ops = []) {
      if (!Array.isArray(ops)) {
        return [];
      }
      return ops.map(op => sanitizeRuntimeValues(cloneJsonValue(op, null))).filter(Boolean);
    }

    function createSheetJournal({ projectId, revision, sheetId, baseCheckpointKey, ops = [] } = {}) {
      const normalizedOps = normalizeJournalOps(ops);
      const normalizedProjectId = normalizeString(projectId);
      const normalizedRevision = Math.max(1, Math.round(Number(revision) || 1));
      const normalizedSheetId = normalizeString(sheetId);
      return withChecksum({
        autosaveJournalVersion: AUTOSAVE_JOURNAL_VERSION,
        key: createJournalKey(normalizedProjectId, normalizedRevision, normalizedSheetId),
        projectId: normalizedProjectId,
        sheetId: normalizedSheetId,
        baseCheckpointKey: normalizeString(baseCheckpointKey),
        revision: normalizedRevision,
        ops: normalizedOps,
        dirtyOpCount: normalizedOps.length,
      });
    }

    function normalizeSingleProjectInput(projectState = {}) {
      const value = projectState && typeof projectState === 'object' ? projectState : {};
      const project = sanitizeRuntimeValues(cloneJsonValue(value.project, null));
      if (!project || typeof project !== 'object') {
        throw new Error('Autosave schema V2 single project is missing project payload');
      }
      const canvases = Array.isArray(project?.document?.canvases) && project.document.canvases.length
        ? project.document.canvases
        : (project?.document ? [project.document] : []);
      if (canvases.length > MAX_CANVASES_PER_SHEET) {
        const error = new Error(`Autosave schema V2 canvas limit exceeded: ${canvases.length}/${MAX_CANVASES_PER_SHEET}`);
        error.code = 'ERR_CANVAS_LIMIT_EXCEEDED';
        throw error;
      }
      delete project.sheets;
      delete project.sheetOrder;
      delete project.activeSheetId;
      project.projectLayout = 'single-project';
      return {
        fileName: normalizeString(value.fileName, project?.document?.documentName || 'PiXiEEDraw.pxd'),
        source: normalizeSourceMetadata(value.source || value),
        project,
      };
    }

    function createProjectJournal({ projectId, revision, baseCheckpointKey, ops = [] } = {}) {
      const normalizedOps = normalizeJournalOps(ops);
      const normalizedProjectId = normalizeString(projectId);
      const normalizedRevision = Math.max(1, Math.round(Number(revision) || 1));
      return withChecksum({
        autosaveJournalVersion: AUTOSAVE_JOURNAL_VERSION,
        key: createProjectJournalKey(normalizedProjectId, normalizedRevision),
        projectId: normalizedProjectId,
        baseCheckpointKey: normalizeString(baseCheckpointKey),
        revision: normalizedRevision,
        ops: normalizedOps,
        dirtyOpCount: normalizedOps.length,
      });
    }

    function createSchemaV2SingleProjectRevision(projectState = {}, { revision = 1, parentRevision = 0 } = {}) {
      const projectId = normalizeString(projectState.projectId);
      if (!projectId) {
        throw new Error('Autosave schema V2 projectId is required');
      }
      const normalizedRevision = Math.max(1, Math.round(Number(revision) || 1));
      const singleProject = normalizeSingleProjectInput(projectState);
      const checkpoint = withChecksum({
        key: createProjectCheckpointKey(projectId, normalizedRevision),
        projectId,
        rootRevision: normalizedRevision,
        projectRevision: normalizedRevision,
        updatedAt: normalizeString(projectState.updatedAt, new Date().toISOString()),
        source: singleProject.source,
        fileName: singleProject.fileName,
        project: singleProject.project,
      });
      const journal = createProjectJournal({
        projectId,
        revision: normalizedRevision,
        baseCheckpointKey: checkpoint.key,
        ops: projectState.journalOps || [],
      });
      const manifest = withChecksum({
        autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
        projectLayout: 'single-project',
        key: createManifestKey(projectId, normalizedRevision),
        projectId,
        revision: normalizedRevision,
        parentRevision: Math.max(0, Math.round(Number(parentRevision) || 0)),
        updatedAt: normalizeString(projectState.updatedAt, new Date().toISOString()),
        project: {
          fileName: checkpoint.fileName,
          sourceKind: checkpoint.source.sourceKind,
          sourceStorageAdapterId: checkpoint.source.sourceStorageAdapterId,
          sourceProjectToken: checkpoint.source.sourceProjectToken,
          checkpointRef: { key: checkpoint.key, revision: normalizedRevision, checksum: checkpoint.checksum },
          journalRef: { key: journal.key, baseCheckpointKey: checkpoint.key, checksum: journal.checksum },
        },
        thumbnailRef: projectState.thumbnail ? {
          key: `autosave-v2:${projectId}:r:${normalizedRevision}:thumbnail`,
          updatedAt: normalizeString(projectState.updatedAt, new Date().toISOString()),
        } : null,
        dotStats: sanitizeRuntimeValues(cloneJsonValue(projectState.dotStats, null)),
        recovery: { previousManifestKey: parentRevision > 0 ? createManifestKey(projectId, parentRevision) : '', warnings: [] },
      });
      const thumbnail = projectState.thumbnail ? withChecksum({
        key: manifest.thumbnailRef.key,
        projectId,
        rootRevision: normalizedRevision,
        value: String(projectState.thumbnail),
      }) : null;
      const recentEntry = {
        id: projectId,
        autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
        manifestKey: manifest.key,
        name: normalizeString(projectState.name, checkpoint.fileName || 'PiXiEEDraw'),
        fileName: checkpoint.fileName,
        updatedAt: manifest.updatedAt,
        thumbnail: null,
        dotStats: manifest.dotStats,
      };
      return { manifest, checkpoints: [checkpoint], journals: [journal], thumbnail, recentEntry };
    }

    function createSchemaV2Revision(projectState = {}, { revision = 1, parentRevision = 0 } = {}) {
      if (projectState?.project && typeof projectState.project === 'object') {
        return createSchemaV2SingleProjectRevision(projectState, { revision, parentRevision });
      }
      const projectId = normalizeString(projectState.projectId);
      if (!projectId) {
        throw new Error('Autosave schema V2 projectId is required');
      }
      const normalizedRevision = Math.max(1, Math.round(Number(revision) || 1));
      const sheets = Array.isArray(projectState.sheets)
        ? projectState.sheets.map((sheet, index) => normalizeSheetInput(sheet, index))
        : [];
      if (!sheets.length) {
        throw new Error('Autosave schema V2 requires at least one sheet');
      }
      const ids = new Set();
      sheets.forEach(sheet => {
        if (ids.has(sheet.id)) {
          throw new Error(`Autosave schema V2 duplicate sheet id: ${sheet.id}`);
        }
        ids.add(sheet.id);
      });
      const requestedActiveSheetId = normalizeString(projectState.activeSheetId);
      const activeSheetId = ids.has(requestedActiveSheetId) ? requestedActiveSheetId : sheets[0].id;
      const journalsBySheet = projectState.journalsBySheet && typeof projectState.journalsBySheet === 'object'
        ? projectState.journalsBySheet
        : {};
      const checkpoints = sheets.map(sheet => {
        const key = createCheckpointKey(projectId, normalizedRevision, sheet.id);
        return withChecksum({
          key,
          projectId,
          rootRevision: normalizedRevision,
          sheetId: sheet.id,
          sheetRevision: normalizedRevision,
          updatedAt: normalizeString(projectState.updatedAt, new Date().toISOString()),
          source: sheet.source,
          fileName: sheet.fileName,
          label: sheet.label,
          project: sheet.project,
        });
      });
      const journals = checkpoints.map(checkpoint => createSheetJournal({
        projectId,
        revision: normalizedRevision,
        sheetId: checkpoint.sheetId,
        baseCheckpointKey: checkpoint.key,
        ops: journalsBySheet[checkpoint.sheetId] || [],
      }));
      const journalBySheetId = new Map(journals.map(journal => [journal.sheetId, journal]));
      const manifest = withChecksum({
        autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
        key: createManifestKey(projectId, normalizedRevision),
        projectId,
        revision: normalizedRevision,
        parentRevision: Math.max(0, Math.round(Number(parentRevision) || 0)),
        updatedAt: normalizeString(projectState.updatedAt, new Date().toISOString()),
        activeSheetId,
        sheetOrder: sheets.map(sheet => sheet.id),
        sheets: checkpoints.map(checkpoint => ({
          id: checkpoint.sheetId,
          fileName: checkpoint.fileName,
          label: checkpoint.label,
          sourceKind: checkpoint.source.sourceKind,
          sourceStorageAdapterId: checkpoint.source.sourceStorageAdapterId,
          sourceProjectToken: checkpoint.source.sourceProjectToken,
          checkpointRef: { key: checkpoint.key, revision: normalizedRevision, checksum: checkpoint.checksum },
          journalRef: {
            key: journalBySheetId.get(checkpoint.sheetId).key || createJournalKey(projectId, normalizedRevision, checkpoint.sheetId),
            baseCheckpointKey: checkpoint.key,
            checksum: journalBySheetId.get(checkpoint.sheetId).checksum,
          },
        })),
        thumbnailRef: projectState.thumbnail ? {
          key: `autosave-v2:${projectId}:r:${normalizedRevision}:thumbnail`,
          updatedAt: normalizeString(projectState.updatedAt, new Date().toISOString()),
        } : null,
        dotStats: sanitizeRuntimeValues(cloneJsonValue(projectState.dotStats, null)),
        recovery: { previousManifestKey: parentRevision > 0 ? createManifestKey(projectId, parentRevision) : '', warnings: [] },
      });
      const thumbnail = projectState.thumbnail ? withChecksum({
        key: manifest.thumbnailRef.key,
        projectId,
        rootRevision: normalizedRevision,
        value: String(projectState.thumbnail),
      }) : null;
      const recentEntry = {
        id: projectId,
        autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
        manifestKey: manifest.key,
        name: normalizeString(projectState.name, sheets.find(sheet => sheet.id === activeSheetId)?.label || 'PiXiEEDraw'),
        fileName: sheets.find(sheet => sheet.id === activeSheetId)?.fileName || '',
        updatedAt: manifest.updatedAt,
        thumbnail: null,
        dotStats: manifest.dotStats,
      };
      return { manifest, checkpoints, journals, thumbnail, recentEntry };
    }

    function createSchemaV2JournalRevision(baseManifest = null, journalsBySheet = {}, {
      revision = 0,
      updatedAt = '',
      thumbnail = null,
      dotStats = undefined,
      name = '',
    } = {}) {
      if (!baseManifest || !hasValidChecksum(baseManifest) || baseManifest.autosaveSchemaVersion !== AUTOSAVE_SCHEMA_VERSION) {
        throw new Error('Autosave schema V2 journal revision requires a valid base manifest');
      }
      if (baseManifest.projectLayout === 'single-project' && baseManifest.project?.checkpointRef?.key) {
        const projectId = normalizeString(baseManifest.projectId);
        const parentRevision = Math.max(1, Math.round(Number(baseManifest.revision) || 1));
        const normalizedRevision = Math.max(parentRevision + 1, Math.round(Number(revision) || 0));
        const requestedOps = Array.isArray(journalsBySheet)
          ? journalsBySheet
          : (Array.isArray(journalsBySheet?.project) ? journalsBySheet.project : []);
        if (!requestedOps.length) {
          throw new Error('Autosave schema V2 journal revision requires at least one changed project');
        }
        const journal = createProjectJournal({
          projectId,
          revision: normalizedRevision,
          baseCheckpointKey: baseManifest.project.checkpointRef.key,
          ops: requestedOps,
        });
        const normalizedUpdatedAt = normalizeString(updatedAt, new Date().toISOString());
        const nextThumbnail = typeof thumbnail === 'string' && thumbnail
          ? withChecksum({
            key: `autosave-v2:${projectId}:r:${normalizedRevision}:thumbnail`,
            projectId,
            rootRevision: normalizedRevision,
            value: thumbnail,
          })
          : null;
        const manifest = withChecksum({
          ...cloneJsonValue(baseManifest, {}),
          key: createManifestKey(projectId, normalizedRevision),
          revision: normalizedRevision,
          parentRevision,
          updatedAt: normalizedUpdatedAt,
          project: {
            ...cloneJsonValue(baseManifest.project, {}),
            journalRef: {
              key: journal.key,
              baseCheckpointKey: journal.baseCheckpointKey,
              checksum: journal.checksum,
            },
          },
          thumbnailRef: nextThumbnail
            ? { key: nextThumbnail.key, updatedAt: normalizedUpdatedAt }
            : cloneJsonValue(baseManifest.thumbnailRef, null),
          dotStats: typeof dotStats === 'undefined'
            ? sanitizeRuntimeValues(cloneJsonValue(baseManifest.dotStats, null))
            : sanitizeRuntimeValues(cloneJsonValue(dotStats, null)),
          recovery: { previousManifestKey: baseManifest.key, warnings: [] },
        });
        return {
          manifest,
          checkpoints: [],
          journals: [journal],
          thumbnail: nextThumbnail,
          recentEntry: {
            id: projectId,
            autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
            manifestKey: manifest.key,
            name: normalizeString(name, manifest.project?.fileName || 'PiXiEEDraw'),
            fileName: manifest.project?.fileName || '',
            updatedAt: manifest.updatedAt,
            thumbnail: null,
            dotStats: manifest.dotStats,
          },
        };
      }
      const projectId = normalizeString(baseManifest.projectId);
      const parentRevision = Math.max(1, Math.round(Number(baseManifest.revision) || 1));
      const normalizedRevision = Math.max(parentRevision + 1, Math.round(Number(revision) || 0));
      const requestedJournals = journalsBySheet && typeof journalsBySheet === 'object' ? journalsBySheet : {};
      const journals = [];
      const sheets = baseManifest.sheets.map(sheet => {
        const hasReplacementJournal = Object.prototype.hasOwnProperty.call(requestedJournals, sheet.id);
        if (!hasReplacementJournal) {
          return cloneJsonValue(sheet, null);
        }
        const journal = createSheetJournal({
          projectId,
          revision: normalizedRevision,
          sheetId: sheet.id,
          baseCheckpointKey: sheet.checkpointRef?.key || '',
          ops: requestedJournals[sheet.id],
        });
        journals.push(journal);
        return {
          ...cloneJsonValue(sheet, {}),
          journalRef: {
            key: journal.key,
            baseCheckpointKey: journal.baseCheckpointKey,
            checksum: journal.checksum,
          },
        };
      });
      if (!journals.length) {
        throw new Error('Autosave schema V2 journal revision requires at least one changed sheet');
      }
      const normalizedUpdatedAt = normalizeString(updatedAt, new Date().toISOString());
      const nextThumbnail = typeof thumbnail === 'string' && thumbnail
        ? withChecksum({
          key: `autosave-v2:${projectId}:r:${normalizedRevision}:thumbnail`,
          projectId,
          rootRevision: normalizedRevision,
          value: thumbnail,
        })
        : null;
      const manifest = withChecksum({
        ...cloneJsonValue(baseManifest, {}),
        key: createManifestKey(projectId, normalizedRevision),
        revision: normalizedRevision,
        parentRevision,
        updatedAt: normalizedUpdatedAt,
        sheets,
        thumbnailRef: nextThumbnail
          ? { key: nextThumbnail.key, updatedAt: normalizedUpdatedAt }
          : cloneJsonValue(baseManifest.thumbnailRef, null),
        dotStats: typeof dotStats === 'undefined'
          ? sanitizeRuntimeValues(cloneJsonValue(baseManifest.dotStats, null))
          : sanitizeRuntimeValues(cloneJsonValue(dotStats, null)),
        recovery: {
          previousManifestKey: baseManifest.key,
          warnings: [],
        },
      });
      const activeSheet = sheets.find(sheet => sheet.id === manifest.activeSheetId) || sheets[0];
      const recentEntry = {
        id: projectId,
        autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
        manifestKey: manifest.key,
        name: normalizeString(name, activeSheet?.label || 'PiXiEEDraw'),
        fileName: activeSheet?.fileName || '',
        updatedAt: manifest.updatedAt,
        thumbnail: null,
        dotStats: manifest.dotStats,
      };
      return { manifest, checkpoints: [], journals, thumbnail: nextThumbnail, recentEntry };
    }

    function resolveDocumentCanvas(project, canvasId) {
      const documentPayload = project?.document && typeof project.document === 'object' ? project.document : null;
      if (!documentPayload) {
        return null;
      }
      const canvases = Array.isArray(documentPayload.canvases) && documentPayload.canvases.length
        ? documentPayload.canvases
        : [documentPayload];
      return canvases.find(canvas => canvas?.id === canvasId) || canvases[0] || null;
    }

    function decodeStoredLayerArray(value, key, length) {
      if (Array.isArray(value)) {
        const Type = key === 'indices' ? Int16Array : Uint8ClampedArray;
        return new Type(value.slice(0, length));
      }
      if (ArrayBuffer.isView(value)) {
        const Type = key === 'indices' ? Int16Array : Uint8ClampedArray;
        if (value instanceof Type && value.length === length) {
          return value;
        }
        return new Type(Array.from(value).slice(0, length));
      }
      if (typeof value === 'string' && value.length > 0 && typeof globalThis.atob === 'function') {
        try {
          const binary = globalThis.atob(value);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index) & 0xff;
          }
          if (key === 'indices') {
            if (bytes.byteLength !== length * Int16Array.BYTES_PER_ELEMENT) return null;
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            return new Int16Array(copy.buffer);
          }
          if (bytes.byteLength !== length) return null;
          return new Uint8ClampedArray(bytes);
        } catch (_error) {
          return null;
        }
      }
      return null;
    }

    function ensureLayerArray(layer, key, length) {
      const fillValue = key === 'indices' ? -1 : 0;
      const Type = key === 'indices' ? Int16Array : Uint8ClampedArray;
      if (key === 'indices' && layer?.indicesEncoding === 'uint8-palette-zero-transparent-v2') {
        let runtimeIndices = null;
        if (layer.indices instanceof Uint8Array) {
          runtimeIndices = layer.indices;
        } else if (typeof layer.indices === 'string' && typeof globalThis.atob === 'function') {
          try {
            const binary = globalThis.atob(layer.indices);
            runtimeIndices = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              runtimeIndices[index] = binary.charCodeAt(index) & 0xff;
            }
          } catch (_error) {
            runtimeIndices = null;
          }
        }
        if (runtimeIndices instanceof Uint8Array && runtimeIndices.length === length) {
          layer.indices = runtimeIndices;
          return runtimeIndices;
        }
      }
      if (key === 'indices' && layer?.indicesEncoding === 'uint8-zero-transparent-v1') {
        let compact = null;
        if (layer.indices instanceof Uint8Array) {
          compact = layer.indices;
        } else if (typeof layer.indices === 'string' && typeof globalThis.atob === 'function') {
          try {
            const binary = globalThis.atob(layer.indices);
            compact = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              compact[index] = binary.charCodeAt(index) & 0xff;
            }
          } catch (_error) {
            compact = null;
          }
        }
        if (compact instanceof Uint8Array && compact.length === length) {
          const expanded = new Int16Array(length);
          for (let index = 0; index < length; index += 1) {
            expanded[index] = compact[index] === 0 ? -1 : compact[index] - 1;
          }
          layer.indices = expanded;
          delete layer.indicesEncoding;
          return expanded;
        }
      }
      const decoded = decodeStoredLayerArray(layer[key], key, length);
      if (decoded && decoded.length === length) {
        layer[key] = decoded;
        return layer[key];
      }
      layer[key] = new Type(length);
      if (fillValue !== 0) layer[key].fill(fillValue);
      return layer[key];
    }

    function applyPixelPatch(project, op) {
      if (!op || op.kind !== 'pixel-patch') {
        return false;
      }
      const canvas = resolveDocumentCanvas(project, normalizeString(op.canvasId));
      const frame = Array.isArray(canvas?.frames)
        ? canvas.frames.find(item => item?.id === op.frameId)
        : null;
      const layer = Array.isArray(frame?.layers)
        ? frame.layers.find(item => item?.id === op.layerId)
        : null;
      if (!canvas || !frame || !layer || !Array.isArray(op.changes)) {
        return false;
      }
      const pixelCount = Math.max(1, Math.round(Number(canvas.width) || 1) * Math.round(Number(canvas.height) || 1));
      const indices = ensureLayerArray(layer, 'indices', pixelCount);
      op.changes.forEach(change => {
        const index = Math.max(0, Math.round(Number(change?.index) || 0));
        if (index >= pixelCount || !change?.after) {
          return;
        }
        const after = change.after;
        const paletteIndex = Number(after.paletteIndex);
        indices[index] = Number.isFinite(paletteIndex) ? Math.round(paletteIndex) : -1;
        [['direct', after.direct], ['importSourceDirect', after.importSourceDirect]].forEach(([key, rgba]) => {
          if (!Array.isArray(rgba) || rgba.length !== 4) {
            return;
          }
          const direct = ensureLayerArray(layer, key, pixelCount * 4);
          const base = index * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            direct[base + channel] = Math.max(0, Math.min(255, Math.round(Number(rgba[channel]) || 0)));
          }
        });
      });
      return true;
    }

    function applyLayerAdd(project, op) {
      if (!op || op.kind !== 'layer-add' || !Array.isArray(op.layers) || !op.layers.length) {
        return false;
      }
      const canvas = resolveDocumentCanvas(project, normalizeString(op.canvasId));
      if (!canvas || !Array.isArray(canvas.frames) || !canvas.frames.length) {
        return false;
      }
      let changed = false;
      for (const layerEntry of op.layers) {
        const frame = canvas.frames.find(item => item?.id === layerEntry?.frameId) || null;
        const layerId = normalizeString(layerEntry?.layerId || layerEntry?.layer?.id);
        if (!frame || !Array.isArray(frame.layers) || !layerId || !layerEntry?.layer) {
          return false;
        }
        if (frame.layers.some(layer => layer?.id === layerId)) {
          continue;
        }
        const layer = sanitizeRuntimeValues(cloneJsonValue(layerEntry.layer, null));
        if (!layer || typeof layer !== 'object') {
          return false;
        }
        layer.id = layerId;
        const insertIndex = Math.min(
          Math.max(0, Math.round(Number(layerEntry.index) || 0)),
          frame.layers.length
        );
        frame.layers.splice(insertIndex, 0, layer);
        changed = true;
      }
      if (!changed) {
        return false;
      }
      canvas.activeFrame = Math.min(
        Math.max(0, Math.round(Number(op.activeFrame) || 0)),
        canvas.frames.length - 1
      );
      const activeFrame = canvas.frames[canvas.activeFrame];
      if (activeFrame?.layers?.some(layer => layer?.id === op.activeLayer)) {
        canvas.activeLayer = op.activeLayer;
      }
      return true;
    }

    function applyFrameAdd(project, op) {
      if (!op || op.kind !== 'frame-add' || !Array.isArray(op.frames) || !op.frames.length) {
        return false;
      }
      const canvas = resolveDocumentCanvas(project, normalizeString(op.canvasId));
      if (!canvas || !Array.isArray(canvas.frames)) {
        return false;
      }
      let changed = false;
      for (const frameEntry of op.frames) {
        const frameId = normalizeString(frameEntry?.frameId || frameEntry?.frame?.id);
        if (!frameId || !frameEntry?.frame || !Array.isArray(frameEntry.frame.layers) || !frameEntry.frame.layers.length) {
          return false;
        }
        if (canvas.frames.some(frame => frame?.id === frameId)) {
          continue;
        }
        const frame = sanitizeRuntimeValues(cloneJsonValue(frameEntry.frame, null));
        if (!frame || typeof frame !== 'object') {
          return false;
        }
        frame.id = frameId;
        canvas.frames.splice(
          Math.min(Math.max(0, Math.round(Number(frameEntry.index) || 0)), canvas.frames.length),
          0,
          frame
        );
        changed = true;
      }
      if (!changed || !canvas.frames.length) {
        return false;
      }
      canvas.activeFrame = Math.min(
        Math.max(0, Math.round(Number(op.activeFrame) || 0)),
        canvas.frames.length - 1
      );
      const activeFrame = canvas.frames[canvas.activeFrame];
      if (activeFrame?.layers?.some(layer => layer?.id === op.activeLayer)) {
        canvas.activeLayer = op.activeLayer;
      }
      return true;
    }

    function validateJournalSequence(journal) {
      if (!journal || !Array.isArray(journal.ops)) {
        return false;
      }
      let expected = 1;
      for (const op of journal.ops) {
        if (Math.round(Number(op?.sequence) || 0) !== expected) {
          return false;
        }
        expected += 1;
      }
      return true;
    }

    function replaySheetJournal(checkpoint, journal, options = {}) {
      // IndexedDB already returns a detached structured clone. The normal open
      // path can safely replay its small journal directly into that value. A
      // JSON round-trip here used to duplicate the complete all-frame project
      // before any frame could be shown, which was especially expensive for
      // large GIF projects.
      const project = options?.useDetachedCheckpointProject === true
        ? checkpoint?.project
        : sanitizeRuntimeValues(cloneJsonValue(checkpoint?.project, null));
      if (!project || !journal || !hasValidChecksum(journal)) {
        return { project, applied: false, reason: 'invalid-journal' };
      }
      if (journal.baseCheckpointKey !== checkpoint.key || !validateJournalSequence(journal)) {
        return { project, applied: false, reason: 'journal-base-or-sequence-mismatch' };
      }
      for (const op of journal.ops) {
        const applied = op?.kind === 'pixel-patch'
          ? applyPixelPatch(project, op)
          : (op?.kind === 'layer-add'
            ? applyLayerAdd(project, op)
            : (op?.kind === 'frame-add' ? applyFrameAdd(project, op) : false));
        if (!applied) {
          return {
            project: options?.useDetachedCheckpointProject === true
              ? null
              : sanitizeRuntimeValues(cloneJsonValue(checkpoint.project, null)),
            applied: false,
            reason: 'journal-replay-failed',
          };
        }
      }
      return { project, applied: journal.ops.length > 0, reason: '' };
    }

    function restoreSchemaV2Manifest(manifest, checkpointsByKey, journalsByKey, options = {}) {
      const trustDetachedCheckpointRecords = options?.trustDetachedCheckpointRecords === true;
      if (!hasValidChecksum(manifest) || manifest?.autosaveSchemaVersion !== AUTOSAVE_SCHEMA_VERSION) {
        throw new Error('Invalid autosave schema V2 manifest');
      }
      if (manifest.projectLayout === 'single-project' && manifest.project?.checkpointRef?.key) {
        const checkpoint = checkpointsByKey.get(manifest.project.checkpointRef.key) || null;
        const checkpointChecksumMatches = Boolean(
          checkpoint
          && checkpoint.checksum === manifest.project.checkpointRef?.checksum
        );
        if (
          !checkpoint
          || !checkpointChecksumMatches
          || (!trustDetachedCheckpointRecords && !hasValidChecksum(checkpoint))
        ) {
          throw new Error('Autosave schema V2 project checkpoint missing or corrupt');
        }
        const checkpointRevision = Math.max(1, Math.round(Number(manifest.project.checkpointRef?.revision) || 0));
        if (
          checkpoint.rootRevision !== checkpointRevision
          || checkpoint.rootRevision > manifest.revision
          || checkpoint.checksum !== manifest.project.checkpointRef?.checksum
        ) {
          throw new Error('Autosave schema V2 project checkpoint revision mismatch');
        }
        const journal = journalsByKey.get(manifest.project.journalRef?.key) || null;
        if (
          journal
          && (
            journal.revision > manifest.revision
            || journal.baseCheckpointKey !== checkpoint.key
            || journal.checksum !== manifest.project.journalRef?.checksum
          )
        ) {
          throw new Error('Autosave schema V2 project journal revision mismatch');
        }
        const replayed = replaySheetJournal(checkpoint, journal, {
          useDetachedCheckpointProject: trustDetachedCheckpointRecords,
        });
        if (!replayed.project) {
          throw new Error('Autosave schema V2 project journal replay failed');
        }
        const project = replayed.project && typeof replayed.project === 'object' ? replayed.project : {};
        delete project.sheets;
        delete project.sheetOrder;
        delete project.activeSheetId;
        project.projectLayout = 'single-project';
        return {
          ...project,
          updatedAt: manifest.updatedAt,
          dotStats: sanitizeRuntimeValues(cloneJsonValue(manifest.dotStats, null)),
          autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
          projectLayout: 'single-project',
          recovery: { journalWarnings: replayed.reason ? ['project'] : [] },
        };
      }
      const sheetOrder = Array.isArray(manifest.sheetOrder) ? manifest.sheetOrder : [];
      if (!sheetOrder.length || !Array.isArray(manifest.sheets) || manifest.sheets.length !== sheetOrder.length) {
        throw new Error('Autosave schema V2 sheet manifest mismatch');
      }
      const sheets = [];
      for (const sheetId of sheetOrder) {
        const sheet = manifest.sheets.find(item => item?.id === sheetId);
        const checkpoint = sheet ? checkpointsByKey.get(sheet.checkpointRef?.key) : null;
        const checkpointChecksumMatches = Boolean(
          checkpoint
          && checkpoint.checksum === sheet?.checkpointRef?.checksum
        );
        if (
          !sheet
          || !checkpoint
          || !checkpointChecksumMatches
          || (!trustDetachedCheckpointRecords && !hasValidChecksum(checkpoint))
        ) {
          throw new Error(`Autosave schema V2 checkpoint missing or corrupt: ${sheetId}`);
        }
        const checkpointRevision = Math.max(1, Math.round(Number(sheet.checkpointRef?.revision) || 0));
        if (
          checkpoint.rootRevision !== checkpointRevision
          || checkpoint.rootRevision > manifest.revision
          || checkpoint.sheetId !== sheetId
          || checkpoint.checksum !== sheet.checkpointRef?.checksum
        ) {
          throw new Error(`Autosave schema V2 checkpoint revision mismatch: ${sheetId}`);
        }
        const journal = journalsByKey.get(sheet.journalRef?.key) || null;
        if (
          journal
          && (
            journal.sheetId !== sheetId
            || journal.revision > manifest.revision
            || journal.baseCheckpointKey !== checkpoint.key
            || journal.checksum !== sheet.journalRef?.checksum
          )
        ) {
          throw new Error(`Autosave schema V2 journal revision mismatch: ${sheetId}`);
        }
        const replayed = replaySheetJournal(checkpoint, journal, {
          useDetachedCheckpointProject: trustDetachedCheckpointRecords,
        });
        if (!replayed.project) {
          throw new Error(`Autosave schema V2 journal replay failed: ${sheetId}`);
        }
        sheets.push({
          id: sheetId,
          fileName: sheet.fileName,
          label: sheet.label,
          sourceKind: sheet.sourceKind,
          sourceStorageAdapterId: sheet.sourceStorageAdapterId,
          sourceProjectToken: sheet.sourceProjectToken,
          project: replayed.project,
          journalRecovered: replayed.applied,
          journalWarning: replayed.reason || '',
        });
      }
      const activeSheetId = sheetOrder.includes(manifest.activeSheetId) ? manifest.activeSheetId : sheetOrder[0];
      const active = sheets.find(sheet => sheet.id === activeSheetId) || sheets[0];
      return {
        type: active.project.type,
        packageVersion: active.project.packageVersion,
        document: sanitizeRuntimeValues(cloneJsonValue(active.project.document, null)),
        session: sanitizeRuntimeValues(cloneJsonValue(active.project.session, null)),
        updatedAt: manifest.updatedAt,
        sheets,
        activeSheetId,
        dotStats: sanitizeRuntimeValues(cloneJsonValue(manifest.dotStats, null)),
        autosaveSchemaVersion: AUTOSAVE_SCHEMA_VERSION,
        recovery: { journalWarnings: sheets.filter(sheet => sheet.journalWarning).map(sheet => sheet.id) },
      };
    }

    function createInMemoryAutosaveSchemaV2Store() {
      return {
        manifests: new Map(),
        checkpoints: new Map(),
        journals: new Map(),
        thumbnails: new Map(),
        recentProjects: new Map(),
      };
    }

    function cloneStore(store) {
      const cloneMap = map => new Map(Array.from(map.entries()).map(([key, value]) => [key, cloneJsonValue(value, null)]));
      return {
        manifests: cloneMap(store.manifests),
        checkpoints: cloneMap(store.checkpoints),
        journals: cloneMap(store.journals),
        thumbnails: cloneMap(store.thumbnails),
        recentProjects: cloneMap(store.recentProjects),
      };
    }

    function replaceStore(target, source) {
      ['manifests', 'checkpoints', 'journals', 'thumbnails', 'recentProjects'].forEach(key => {
        target[key].clear();
        source[key].forEach((value, entryKey) => target[key].set(entryKey, value));
      });
    }

    function commitSchemaV2Revision(store, bundle, { failAt = '', failCleanup = false, keepManifestRevisions = 2 } = {}) {
      const draft = cloneStore(store);
      const writeOrder = [];
      const fail = stage => {
        if (failAt === stage) {
          throw new Error(`Simulated autosave schema V2 transaction abort: ${stage}`);
        }
      };
      try {
        bundle.checkpoints.forEach(checkpoint => {
          fail('checkpoint');
          draft.checkpoints.set(checkpoint.key, cloneJsonValue(checkpoint, null));
          writeOrder.push('checkpoint');
        });
        bundle.journals.forEach(journal => {
          fail('journal');
          draft.journals.set(journal.key, cloneJsonValue(journal, null));
          writeOrder.push('journal');
        });
        if (bundle.thumbnail) {
          fail('thumbnail');
          draft.thumbnails.set(bundle.thumbnail.key, cloneJsonValue(bundle.thumbnail, null));
          writeOrder.push('thumbnail');
        }
        fail('manifest');
        draft.manifests.set(bundle.manifest.key, cloneJsonValue(bundle.manifest, null));
        writeOrder.push('manifest');
        fail('recent-ref');
        draft.recentProjects.set(bundle.recentEntry.id, cloneJsonValue(bundle.recentEntry, null));
        writeOrder.push('recent-ref');
      } catch (error) {
        return { committed: false, error, writeOrder };
      }
      replaceStore(store, draft);
      let cleanupFailed = false;
      try {
        if (failCleanup) {
          throw new Error('Simulated autosave schema V2 cleanup failure');
        }
        const manifests = Array.from(store.manifests.values())
          .filter(manifest => manifest?.projectId === bundle.manifest.projectId)
          .sort((left, right) => right.revision - left.revision);
        const retained = new Set(manifests.slice(0, Math.max(1, keepManifestRevisions)).map(manifest => manifest.key));
        manifests.slice(Math.max(1, keepManifestRevisions)).forEach(manifest => {
          if (retained.has(manifest.key)) return;
          store.manifests.delete(manifest.key);
        });
      } catch (_error) {
        cleanupFailed = true;
      }
      return { committed: true, cleanupFailed, writeOrder };
    }

    function restoreSchemaV2WithFallback(store, recentEntry) {
      const entry = recentEntry && typeof recentEntry === 'object' ? recentEntry : null;
      const manifestKey = normalizeString(entry?.manifestKey);
      const current = manifestKey ? store.manifests.get(manifestKey) : null;
      const candidates = Array.from(store.manifests.values())
        .filter(manifest => manifest?.projectId === entry?.id)
        .sort((left, right) => right.revision - left.revision);
      const ordered = current ? [current, ...candidates.filter(manifest => manifest.key !== current.key)] : candidates;
      for (const manifest of ordered) {
        try {
          return { packaged: restoreSchemaV2Manifest(manifest, store.checkpoints, store.journals), manifest, fallbackUsed: manifest.key !== manifestKey };
        } catch (_error) {
          // Try the previous immutable revision.
        }
      }
      throw new Error('No valid autosave schema V2 revision is available');
    }

    function restoreRecentEntry(store, entry) {
      if (Number(entry?.autosaveSchemaVersion) === AUTOSAVE_SCHEMA_VERSION) {
        return restoreSchemaV2WithFallback(store, entry);
      }
      return {
        packaged: entry?.project && typeof entry.project === 'object' ? cloneJsonValue(entry.project, null) : null,
        manifest: null,
        fallbackUsed: false,
        legacy: true,
      };
    }

    function measureCheckpointSize(checkpoint, { includeHistory = true } = {}) {
      const next = sanitizeRuntimeValues(cloneJsonValue(checkpoint, null));
      if (!next) return 0;
      if (!includeHistory && next.project?.session) {
        next.project.session.historyPast = [];
        next.project.session.historyFuture = [];
      }
      const text = JSON.stringify(next);
      return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).byteLength : text.length;
    }

    function estimatePixelDataBytes(project) {
      let total = 0;
      const scanLayer = layer => {
        if (!layer || typeof layer !== 'object') return;
        if (Array.isArray(layer.indices) || ArrayBuffer.isView(layer.indices)) total += layer.indices.length * 2;
        if (Array.isArray(layer.direct) || ArrayBuffer.isView(layer.direct)) total += layer.direct.length;
        if (Array.isArray(layer.importSourceDirect) || ArrayBuffer.isView(layer.importSourceDirect)) {
          total += layer.importSourceDirect.length;
        }
      };
      const scanCanvas = canvas => (canvas?.frames || []).forEach(frame => (frame?.layers || []).forEach(scanLayer));
      const documentPayload = project?.document || {};
      if (Array.isArray(documentPayload.canvases) && documentPayload.canvases.length) {
        documentPayload.canvases.forEach(scanCanvas);
      } else {
        scanCanvas(documentPayload);
      }
      return total;
    }

    return Object.freeze({
      AUTOSAVE_SCHEMA_VERSION,
      AUTOSAVE_JOURNAL_VERSION,
      MAX_CANVASES_PER_SHEET,
      checksum,
      hasValidChecksum,
      sanitizeRuntimeValues,
      normalizeSourceMetadata,
      createSchemaV2Revision,
      createSchemaV2JournalRevision,
      replaySheetJournal,
      restoreSchemaV2Manifest,
      createInMemoryAutosaveSchemaV2Store,
      commitSchemaV2Revision,
      restoreSchemaV2WithFallback,
      restoreRecentEntry,
      measureCheckpointSize,
      estimatePixelDataBytes,
    });
  }

  root.autosaveSchemaV2Utils = Object.freeze({
    createAutosaveSchemaV2Utils,
  });
})();
