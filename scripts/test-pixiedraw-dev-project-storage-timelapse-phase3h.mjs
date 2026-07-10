import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';

function loadBrowserModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInThisContext(source, { filename: absolutePath });
}

globalThis.window = {
  document: {},
  PiXiEEDrawModules: {},
};

loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-adapter-utils.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v1-json-adapter.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-zip-adapter.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');

const adapterUtils = window.PiXiEEDrawModules.projectStorageAdapterUtils.createProjectStorageAdapterUtils({ console });

function encodeTypedArray(view) {
  if (!view) {
    return null;
  }
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64');
}

function decodeBase64(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
}

function cloneTimelapsePixelPatchValue(value = null) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const clampChannel = channel => Math.min(Math.max(Math.round(Number(channel) || 0), 0), 255);
  const cloneRgba = source => Array.isArray(source) && source.length === 4
    ? [
        clampChannel(source[0]),
        clampChannel(source[1]),
        clampChannel(source[2]),
        clampChannel(source[3]),
      ]
    : null;
  return {
    paletteIndex: Math.round(Number(value.paletteIndex) || 0),
    direct: cloneRgba(value.direct),
    importSourceDirect: cloneRgba(value.importSourceDirect),
  };
}

function encodeText(text) {
  return new TextEncoder().encode(String(text || ''));
}

function parseStoredZipEntries(bytes) {
  const entries = new Map();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }
    assert.equal(signature, 0x04034b50, 'unexpected zip local header');
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const filenameStart = offset + 30;
    const filenameEnd = filenameStart + filenameLength;
    const extraEnd = filenameEnd + extraLength;
    const dataEnd = extraEnd + compressedSize;
    const filename = Buffer.from(bytes.subarray(filenameStart, filenameEnd)).toString('utf8');
    entries.set(filename, bytes.slice(extraEnd, dataEnd));
    offset = dataEnd;
  }
  return entries;
}

let crc32Table = null;

function getCrc32Table() {
  if (crc32Table) {
    return crc32Table;
  }
  crc32Table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    crc32Table[index] = value >>> 0;
  }
  return crc32Table;
}

function computeCrc32(bytes) {
  const table = getCrc32Table();
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZipDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const month = Math.min(Math.max(date.getMonth() + 1, 1), 12);
  const day = Math.min(Math.max(date.getDate(), 1), 31);
  const hours = Math.min(Math.max(date.getHours(), 0), 23);
  const minutes = Math.min(Math.max(date.getMinutes(), 0), 59);
  const seconds = Math.min(Math.max(Math.floor(date.getSeconds() / 2), 0), 29);
  return {
    time: ((hours & 0x1F) << 11) | ((minutes & 0x3F) << 5) | (seconds & 0x1F),
    date: (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F),
  };
}

function buildStoredZipBlob(entries) {
  const now = createZipDosDateTime(new Date('2026-07-10T00:00:00.000Z'));
  const localParts = [];
  const centralParts = [];
  let localSize = 0;
  const normalizedEntries = Array.from(entries.entries());
  for (let index = 0; index < normalizedEntries.length; index += 1) {
    const [filename, value] = normalizedEntries[index];
    const filenameBytes = encodeText(filename);
    const dataBytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
    const crc32 = computeCrc32(dataBytes);
    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, now.time, true);
    localView.setUint16(12, now.date, true);
    localView.setUint32(14, crc32, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, filenameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(filenameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, now.time, true);
    centralView.setUint16(14, now.date, true);
    centralView.setUint32(16, crc32, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, filenameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localSize, true);
    centralHeader.set(filenameBytes, 46);
    centralParts.push(centralHeader);

    localSize += localHeader.length + dataBytes.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054B50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, normalizedEntries.length, true);
  endView.setUint16(10, normalizedEntries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localSize, true);
  endView.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}

async function rewriteZipBlob(sourceBlob, mutate) {
  const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
  const entries = parseStoredZipEntries(sourceBytes);
  const nextEntries = new Map(entries);
  mutate(nextEntries);
  return buildStoredZipBlob(nextEntries);
}

function buildIndices(width, height, fill = 0) {
  return new Int16Array(width * height).fill(fill);
}

function buildRgba(width, height, pixels = []) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const pixel of pixels) {
    const { x, y, r, g, b, a } = pixel;
    const base = ((y * width) + x) * 4;
    rgba[base] = r;
    rgba[base + 1] = g;
    rgba[base + 2] = b;
    rgba[base + 3] = a;
  }
  return rgba;
}

function createPatchPixels(width, height, { x0, y0, size, rgba }) {
  const pixels = [];
  for (let y = y0; y < y0 + size; y += 1) {
    for (let x = x0; x < x0 + size; x += 1) {
      pixels.push({ x, y, ...rgba });
    }
  }
  return buildRgba(width, height, pixels);
}

function createSnapshotPixelPayload(width, height, rgba) {
  return {
    width,
    height,
    pixels: encodeTypedArray(rgba),
  };
}

function createTimelapseOperationLog(canvasId = '', label = 'root') {
  return {
    version: 1,
    baseSnapshot: {
      type: 'timelapse-base',
      canvasId,
      label,
    },
    entries: [
      {
        type: 'keyframe',
        at: 1000,
        historyLabel: `${label}-keyframe`,
        snapshot: {
          type: 'keyframe-snapshot',
          canvasId,
        },
      },
      {
        type: 'pixelPatch',
        at: 1010,
        historyLabel: `${label}-patch`,
        canvasId,
        frameId: `${canvasId}-frame`,
        layerId: `${canvasId}-layer`,
        width: 8,
        height: 8,
        changes: [{
          index: 1,
          after: {
            paletteIndex: 2,
            direct: [255, 0, 0, 255],
            importSourceDirect: null,
          },
        }],
      },
    ],
  };
}

const width = 8;
const height = 8;
const redPatch = createPatchPixels(width, height, {
  x0: 2,
  y0: 2,
  size: 3,
  rgba: { r: 255, g: 20, b: 40, a: 255 },
});
const bluePatch = createPatchPixels(width, height, {
  x0: 1,
  y0: 1,
  size: 2,
  rgba: { r: 20, g: 100, b: 255, a: 255 },
});
const greenPatch = createPatchPixels(width, height, {
  x0: 4,
  y0: 4,
  size: 2,
  rgba: { r: 60, g: 220, b: 110, a: 255 },
});

const canvasA = {
  id: 'canvas-a',
  name: 'Canvas A',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-a',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
  frames: [{
    id: 'frame-a1',
    name: 'Frame A1',
    duration: 100,
    layers: [{
      id: 'layer-a',
      name: 'Layer A',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      indices: encodeTypedArray(buildIndices(width, height, -1)),
      direct: encodeTypedArray(redPatch),
      importSourceDirect: null,
      directOnly: true,
    }],
  }],
};

const canvasB = {
  id: 'canvas-b',
  name: 'Canvas B',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-b',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
  frames: [{
    id: 'frame-b1',
    name: 'Frame B1',
    duration: 120,
    layers: [{
      id: 'layer-b',
      name: 'Layer B',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      indices: encodeTypedArray(buildIndices(width, height, -1)),
      direct: encodeTypedArray(bluePatch),
      importSourceDirect: null,
      directOnly: true,
    }],
  }],
};

const canvasC = {
  id: 'canvas-c',
  name: 'Canvas C',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-c',
  mirror: { enabled: true, axis: 'x' },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
  frames: [{
    id: 'frame-c1',
    name: 'Frame C1',
    duration: 90,
    layers: [{
      id: 'layer-c',
      name: 'Layer C',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      indices: encodeTypedArray(buildIndices(width, height, -1)),
      direct: encodeTypedArray(greenPatch),
      importSourceDirect: null,
      directOnly: true,
    }],
  }],
};

const canvasD = {
  id: 'canvas-d',
  name: 'Canvas D',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-d',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
  frames: [{
    id: 'frame-d1',
    name: 'Frame D1',
    duration: 80,
    layers: [{
      id: 'layer-d',
      name: 'Layer D',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      indices: encodeTypedArray(buildIndices(width, height, -1)),
      direct: encodeTypedArray(bluePatch),
      importSourceDirect: null,
      directOnly: true,
    }],
  }],
};

const activeDocument = {
  version: 1,
  width,
  height,
  palette: [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 255, g: 0, b: 0, a: 255 },
  ],
  frames: canvasA.frames,
  activeFrame: 0,
  activeLayer: 'layer-a',
  activeCanvasId: 'canvas-a',
  canvases: [canvasA, canvasB],
  documentName: 'phase3h-active',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
};

const extraDocument = {
  version: 1,
  width,
  height,
  palette: [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 60, g: 220, b: 110, a: 255 },
  ],
  frames: canvasC.frames,
  activeFrame: 0,
  activeLayer: 'layer-c',
  activeCanvasId: 'canvas-c',
  canvases: [canvasC, canvasD],
  documentName: 'phase3h-extra',
  mirror: { enabled: true, axis: 'x' },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
};

const rootSession = {
  historyLimit: 24,
  historyPast: [],
  historyFuture: [],
  timelapse: {
    enabled: true,
    fps: 12,
    byCanvas: {
      'canvas-a': {
        warningShown: false,
        sampleStep: 1,
        lastCaptureToken: 3,
        snapshots: [
          createSnapshotPixelPayload(2, 2, new Uint8ClampedArray([
            255, 0, 0, 255,
            255, 0, 0, 255,
            255, 0, 0, 255,
            255, 0, 0, 255,
          ])),
        ],
      },
    },
    operationLogsByCanvas: {
      'canvas-b': createTimelapseOperationLog('canvas-b', 'root'),
    },
  },
};

const extraSession = {
  historyLimit: 18,
  historyPast: [],
  historyFuture: [],
  timelapse: {
    enabled: true,
    fps: 8,
    byCanvas: {
      'canvas-c': {
        warningShown: true,
        sampleStep: 2,
        lastCaptureToken: 7,
        snapshots: [
          createSnapshotPixelPayload(2, 2, new Uint8ClampedArray([
            0, 255, 0, 255,
            0, 255, 0, 255,
            0, 255, 0, 255,
            0, 255, 0, 255,
          ])),
        ],
      },
    },
    operationLogsByCanvas: {
      'canvas-d': createTimelapseOperationLog('canvas-d', 'sheet-extra'),
    },
  },
};

function buildActivePackagedProject(snapshot, session, updatedAt) {
  return {
    type: 'pixieedraw-project',
    packageVersion: 2,
    version: 1,
    document: snapshot,
    session,
    updatedAt,
  };
}

function buildExtraPackagedProject(updatedAt) {
  return {
    type: 'pixieedraw-project',
    packageVersion: 2,
    version: 1,
    document: extraDocument,
    session: extraSession,
    updatedAt,
  };
}

function buildPackagedProjectFixture(snapshot, { session, updatedAt = '', includeSheets = true } = {}) {
  const effectiveUpdatedAt = updatedAt || '2026-07-10T00:00:00.000Z';
  const activePackaged = buildActivePackagedProject(snapshot, session, effectiveUpdatedAt);
  if (includeSheets !== true) {
    return activePackaged;
  }
  const extraPackaged = buildExtraPackagedProject(effectiveUpdatedAt);
  return {
    ...activePackaged,
    activeSheetId: 'sheet-active',
    sheets: [
      {
        id: 'sheet-active',
        fileName: 'phase3h-active.pixieedraw',
        label: 'Active Sheet',
        project: activePackaged,
        unsaved: true,
        source: 'working',
        updatedAt: effectiveUpdatedAt,
      },
      {
        id: 'sheet-shared-origin',
        fileName: 'phase3h-shared.pixieedraw',
        label: 'Shared Origin Sheet',
        project: extraPackaged,
        unsaved: false,
        source: 'shared-sheet',
        updatedAt: effectiveUpdatedAt,
        sharedProjectKey: 'legacy-shared-key',
        sharedProjectBackendId: 'legacy-backend-id',
        sharedProjectRevision: 4,
        sharedProjectStructureRevision: 9,
        sharedRoleHint: 'owner',
        sharedAutoJoin: true,
        sharedSyncState: { legacy: true },
      },
    ],
  };
}

function createAdapters() {
  const builder = buildPackagedProjectFixture;
  const v1Adapter = window.PiXiEEDrawModules.projectStorageV1JsonAdapter.createPixieeDrawV1JsonAdapter({
    PROJECT_FILE_EXTENSION: '.pixieedraw',
    PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
    PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
    buildPackagedProjectPayload: builder,
    createAutosaveFileName(name = 'phase3h-test.pixieedraw') {
      return typeof name === 'string' && name.trim() ? name : 'phase3h-test.pixieedraw';
    },
  });

  const v2Adapter = window.PiXiEEDrawModules.projectStorageV2ZipAdapter.createPixieeDrawV2ZipAdapter({
    PROJECT_FILE_EXTENSION: '.pixieedraw',
    PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
    PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
    buildPackagedProjectPayload: builder,
    createAutosaveFileName(name = 'phase3h-test.pixieedraw') {
      return typeof name === 'string' && name.trim() ? name : 'phase3h-test.pixieedraw';
    },
    decodeBase64,
    encodeTypedArray,
    compressBytes(bytes) {
      return new Uint8Array(deflateSync(bytes));
    },
    decompressBytes(bytes) {
      return new Uint8Array(inflateSync(bytes));
    },
    digestBytes(bytes) {
      return new Uint8Array(createHash('sha256').update(bytes).digest());
    },
  });

  const registry = adapterUtils.createProjectStorageAdapterRegistry({
    adapters: [v1Adapter, v2Adapter],
    defaultAdapterId: v1Adapter.id,
  });

  return { v1Adapter, v2Adapter, registry };
}

function createDocumentSessionUtils(registry) {
  return window.PiXiEEDrawModules.documentSessionWorkflowUtils.createDocumentSessionWorkflowUtils({
    DEFAULT_HISTORY_LIMIT: 24,
    MIN_HISTORY_LIMIT: 1,
    history: { limit: 24 },
    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },
    decodeBase64,
    compressUint8Array(pixels) {
      return pixels;
    },
    createEmptyTimelapseTrack() {
      return { snapshots: [], operationLog: null };
    },
    deserializeDocumentPayload(payload) {
      return {
        width: payload.width,
        height: payload.height,
        activeCanvasId: payload.activeCanvasId || '',
        activeFrame: payload.activeFrame ?? 0,
        activeLayer: payload.activeLayer || '',
        frames: payload.frames,
        canvases: payload.canvases,
      };
    },
    resolvePackagedProjectDotStats(parsed) {
      return parsed.dotStats || null;
    },
    normalizePackagedProjectSheets(sheets) {
      return Array.isArray(sheets) ? sheets : [];
    },
    normalizeProjectHistoryLimit(value, fallback) {
      return Number.isFinite(Number(value)) ? Math.max(1, Math.round(Number(value))) : fallback;
    },
    normalizeTimelapseFps(value) {
      return Number.isFinite(Number(value)) ? Math.max(1, Math.round(Number(value))) : 12;
    },
    normalizeTimelapseCanvasId(canvasId, fallback = '') {
      return String(canvasId || fallback || '');
    },
    cloneTimelapsePixelPatchValue,
    normalizeSerializedTimelapseOperationEntry(entry) {
      return entry && typeof entry === 'object' ? entry : null;
    },
    parseProjectStorageText(text) {
      return registry.parseText(text);
    },
    parseProjectStoragePayload(parsed) {
      return registry.parseParsedValue(parsed);
    },
    async parseProjectStorageBlob(blob) {
      return await registry.parseBlob(blob);
    },
  });
}

function assertEmptyTimelapsePayload(timelapse, expectedFps = 12) {
  assert.equal(Boolean(timelapse?.enabled), false);
  assert.equal(Math.round(Number(timelapse?.fps) || 0), expectedFps);
  assert.deepEqual(timelapse?.byCanvas || {}, {});
  assert.deepEqual(timelapse?.operationLogsByCanvas || {}, {});
}

async function runIncludeTimelapseTrueScenario() {
  const { registry } = createAdapters();
  const documentSessionUtils = createDocumentSessionUtils(registry);

  const v1Serialized = await registry.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'phase3h-include-timelapse.pixieedraw',
    includeSheets: true,
  });

  const v2Serialized = await registry.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'phase3h-include-timelapse.pixieedraw',
    preferredAdapterId: 'pixieedraw-v2-zip-experimental',
    includeSheets: true,
    includeTimelapse: true,
  });

  const v2Bytes = new Uint8Array(await v2Serialized.blob.arrayBuffer());
  const zipEntries = parseStoredZipEntries(v2Bytes);
  assert.ok(zipEntries.has('timelapse/session.json'));
  assert.ok(zipEntries.has('sheets/sheet-active/timelapse/session.json'));
  assert.ok(zipEntries.has('sheets/sheet-shared-origin/timelapse/session.json'));

  const rootProjectJson = JSON.parse(Buffer.from(zipEntries.get('project.json')).toString('utf8'));
  assert.equal(rootProjectJson.session.timelapseArchive.included, true);
  assert.equal(rootProjectJson.session.timelapseArchive.path, 'timelapse/session.json');
  assertEmptyTimelapsePayload(rootProjectJson.session.timelapse, 12);

  const activeSheetProjectJson = JSON.parse(Buffer.from(zipEntries.get('sheets/sheet-active/project.json')).toString('utf8'));
  assert.equal(activeSheetProjectJson.session.timelapseArchive.included, true);
  assert.equal(activeSheetProjectJson.session.timelapseArchive.path, 'sheets/sheet-active/timelapse/session.json');
  assertEmptyTimelapsePayload(activeSheetProjectJson.session.timelapse, 12);

  const extraSheetProjectJson = JSON.parse(Buffer.from(zipEntries.get('sheets/sheet-shared-origin/project.json')).toString('utf8'));
  assert.equal(extraSheetProjectJson.session.timelapseArchive.included, true);
  assert.equal(extraSheetProjectJson.session.timelapseArchive.path, 'sheets/sheet-shared-origin/timelapse/session.json');
  assertEmptyTimelapsePayload(extraSheetProjectJson.session.timelapse, 8);

  const parsedFromV2 = await registry.parseBlob(v2Serialized.blob);
  assert.equal(parsedFromV2.parsed.session.timelapse.enabled, true);
  assert.equal(parsedFromV2.parsed.session.timelapse.fps, 12);
  assert.deepEqual(parsedFromV2.parsed.session.timelapse.byCanvas, rootSession.timelapse.byCanvas);
  assert.deepEqual(parsedFromV2.parsed.session.timelapse.operationLogsByCanvas, rootSession.timelapse.operationLogsByCanvas);
  assert.equal(parsedFromV2.parsed.sheets[1].project.session.timelapse.enabled, true);
  assert.equal(parsedFromV2.parsed.sheets[1].project.session.timelapse.fps, 8);
  assert.deepEqual(parsedFromV2.parsed.sheets[1].project.session.timelapse.byCanvas, extraSession.timelapse.byCanvas);
  assert.deepEqual(
    parsedFromV2.parsed.sheets[1].project.session.timelapse.operationLogsByCanvas,
    extraSession.timelapse.operationLogsByCanvas
  );
  assert.equal(parsedFromV2.parsed.sheets[1].source, 'shared-sheet');
  assert.equal(parsedFromV2.parsed.sheets[1].sharedProjectKey, 'legacy-shared-key');
  assert.equal(parsedFromV2.parsed.sheets[1].sharedProjectBackendId, 'legacy-backend-id');
  assert.deepEqual(parsedFromV2.parsed.sheets[1].sharedSyncState, { legacy: true });
  assert.equal(parsedFromV2.parsed.session.timelapseArchive, undefined);

  const parsedSnapshot = await documentSessionUtils.snapshotFromDocumentBlob(v2Serialized.blob);
  assert.equal(parsedSnapshot.projectSession.timelapse.enabled, true);
  assert.equal(parsedSnapshot.projectSession.timelapse.fps, 12);
  assert.equal(parsedSnapshot.projectSession.timelapse.tracksByCanvasId['canvas-a'].snapshots.length, 1);
  assert.equal(parsedSnapshot.projectSession.timelapse.tracksByCanvasId['canvas-b'].operationLog.entries.length, 2);
  assert.equal(parsedSnapshot.sheets[1].sharedProjectKey, 'legacy-shared-key');

  return {
    v1Size: v1Serialized.blob.size,
    v2Size: v2Serialized.blob.size,
  };
}

async function runIncludeTimelapseFalseScenario() {
  const { registry } = createAdapters();
  const documentSessionUtils = createDocumentSessionUtils(registry);
  const v2Serialized = await registry.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'phase3h-omit-timelapse.pixieedraw',
    preferredAdapterId: 'pixieedraw-v2-zip-experimental',
    includeSheets: true,
    includeTimelapse: false,
  });

  const v2Bytes = new Uint8Array(await v2Serialized.blob.arrayBuffer());
  const zipEntries = parseStoredZipEntries(v2Bytes);
  assert.ok(!zipEntries.has('timelapse/session.json'));
  assert.ok(!zipEntries.has('sheets/sheet-active/timelapse/session.json'));
  assert.ok(!zipEntries.has('sheets/sheet-shared-origin/timelapse/session.json'));

  const rootProjectJson = JSON.parse(Buffer.from(zipEntries.get('project.json')).toString('utf8'));
  assert.equal(rootProjectJson.session.timelapseArchive.included, false);
  assertEmptyTimelapsePayload(rootProjectJson.session.timelapse, 12);

  const parsedFromV2 = await registry.parseBlob(v2Serialized.blob);
  assertEmptyTimelapsePayload(parsedFromV2.parsed.session.timelapse, 12);
  assertEmptyTimelapsePayload(parsedFromV2.parsed.sheets[0].project.session.timelapse, 12);
  assertEmptyTimelapsePayload(parsedFromV2.parsed.sheets[1].project.session.timelapse, 8);

  const parsedSnapshot = await documentSessionUtils.snapshotFromDocumentBlob(v2Serialized.blob);
  assert.equal(parsedSnapshot.projectSession.timelapse.enabled, false);
  assert.equal(Object.keys(parsedSnapshot.projectSession.timelapse.tracksByCanvasId).length, 0);

  return {
    v2Size: v2Serialized.blob.size,
  };
}

async function runMissingTimelapseEntryErrorScenario() {
  const { registry } = createAdapters();
  const v2Serialized = await registry.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'phase3h-missing-timelapse.pixieedraw',
    preferredAdapterId: 'pixieedraw-v2-zip-experimental',
    includeSheets: true,
    includeTimelapse: true,
  });

  const missingRootTimelapseBlob = await rewriteZipBlob(v2Serialized.blob, entries => {
    entries.delete('timelapse/session.json');
  });

  await assert.rejects(
    registry.parseBlob(missingRootTimelapseBlob),
    /Missing project archive entry: timelapse\/session\.json/
  );
}

async function runBrokenTimelapseJsonScenario() {
  const { registry } = createAdapters();
  const v2Serialized = await registry.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'phase3h-broken-timelapse.pixieedraw',
    preferredAdapterId: 'pixieedraw-v2-zip-experimental',
    includeSheets: true,
    includeTimelapse: true,
  });

  const brokenTimelapseBlob = await rewriteZipBlob(v2Serialized.blob, entries => {
    entries.set('timelapse/session.json', encodeText('{"enabled": true,'));
  });

  await assert.rejects(
    registry.parseBlob(brokenTimelapseBlob),
    /JSON|double-quoted property name/
  );
}

const includeTrueSizes = await runIncludeTimelapseTrueScenario();
const includeFalseSizes = await runIncludeTimelapseFalseScenario();
await runMissingTimelapseEntryErrorScenario();
await runBrokenTimelapseJsonScenario();

console.log(
  `Phase 3-H timelapse archive checks passed. v1=${includeTrueSizes.v1Size} bytes, v2+timelapse=${includeTrueSizes.v2Size} bytes, v2-timelapse=${includeFalseSizes.v2Size} bytes`
);
