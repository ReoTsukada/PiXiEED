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

function createRectPixels(width, height, { x0, y0, rectWidth, rectHeight, rgba }) {
  const pixels = [];
  for (let y = y0; y < y0 + rectHeight; y += 1) {
    for (let x = x0; x < x0 + rectWidth; x += 1) {
      pixels.push({ x, y, ...rgba });
    }
  }
  return buildRgba(width, height, pixels);
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

const width = 16;
const height = 16;
const redPatch = createPatchPixels(width, height, {
  x0: 4,
  y0: 5,
  size: 4,
  rgba: { r: 255, g: 20, b: 40, a: 255 },
});
const bluePatch = createPatchPixels(width, height, {
  x0: 6,
  y0: 2,
  size: 4,
  rgba: { r: 20, g: 100, b: 255, a: 255 },
});
const greenPatch = createPatchPixels(width, height, {
  x0: 2,
  y0: 10,
  size: 3,
  rgba: { r: 60, g: 220, b: 110, a: 255 },
});
const collisionTallPatch = createRectPixels(width, height, {
  x0: 1,
  y0: 1,
  rectWidth: 2,
  rectHeight: 6,
  rgba: { r: 70, g: 220, b: 110, a: 255 },
});
const collisionWidePatch = createRectPixels(width, height, {
  x0: 10,
  y0: 4,
  rectWidth: 3,
  rectHeight: 4,
  rgba: { r: 70, g: 220, b: 110, a: 255 },
});
const transparentDirect = new Uint8ClampedArray(width * height * 4);
const mixedIndices = buildIndices(width, height, 0);
for (let y = 5; y < 9; y += 1) {
  for (let x = 4; x < 8; x += 1) {
    mixedIndices[(y * width) + x] = -1;
  }
}
const extraMixedIndices = buildIndices(width, height, 0);
for (let y = 10; y < 13; y += 1) {
  for (let x = 2; x < 5; x += 1) {
    extraMixedIndices[(y * width) + x] = -1;
  }
}

const canvasA = {
  id: 'canvas-a',
  name: 'Canvas A',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-mixed',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
  frames: [{
    id: 'frame-a1',
    name: 'Frame A1',
    duration: 100,
    layers: [
      {
        id: 'layer-indexed',
        name: 'Indexed',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, 1)),
        direct: null,
        importSourceDirect: null,
        directOnly: false,
      },
      {
        id: 'layer-mixed',
        name: 'Mixed',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(mixedIndices),
        direct: encodeTypedArray(redPatch),
        importSourceDirect: null,
        directOnly: false,
      },
      {
        id: 'layer-transparent',
        name: 'Transparent',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, -1)),
        direct: encodeTypedArray(transparentDirect),
        importSourceDirect: null,
        directOnly: true,
      },
      {
        id: 'layer-import',
        name: 'Import',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, 2)),
        direct: null,
        importSourceDirect: encodeTypedArray(bluePatch),
        directOnly: false,
      },
    ],
  }],
};

const canvasB = {
  id: 'canvas-b',
  name: 'Canvas B',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-duplicate',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
  frames: [{
    id: 'frame-b1',
    name: 'Frame B1',
    duration: 100,
    layers: [
      {
        id: 'layer-duplicate',
        name: 'Duplicate',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, -1)),
        direct: encodeTypedArray(redPatch),
        importSourceDirect: null,
        directOnly: true,
      },
      {
        id: 'layer-collision-tall',
        name: 'Collision Tall',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, -1)),
        direct: encodeTypedArray(collisionTallPatch),
        importSourceDirect: null,
        directOnly: true,
      },
      {
        id: 'layer-collision-wide',
        name: 'Collision Wide',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, -1)),
        direct: encodeTypedArray(collisionWidePatch),
        importSourceDirect: null,
        directOnly: true,
      },
    ],
  }],
};

const canvasC = {
  id: 'canvas-c',
  name: 'Canvas C',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-extra-mixed',
  mirror: { enabled: true, axis: 'x' },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: { x: 2, y: 10, w: 3, h: 3 },
  frames: [{
    id: 'frame-c1',
    name: 'Frame C1',
    duration: 120,
    layers: [
      {
        id: 'layer-extra-indexed',
        name: 'Extra Indexed',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, 3)),
        direct: null,
        importSourceDirect: null,
        directOnly: false,
      },
      {
        id: 'layer-extra-mixed',
        name: 'Extra Mixed',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(extraMixedIndices),
        direct: encodeTypedArray(greenPatch),
        importSourceDirect: null,
        directOnly: false,
      },
    ],
  }],
};

const canvasD = {
  id: 'canvas-d',
  name: 'Canvas D',
  width,
  height,
  activeFrame: 0,
  activeLayer: 'layer-extra-shared',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
  frames: [{
    id: 'frame-d1',
    name: 'Frame D1',
    duration: 80,
    layers: [
      {
        id: 'layer-extra-shared',
        name: 'Extra Shared',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, -1)),
        direct: encodeTypedArray(redPatch),
        importSourceDirect: null,
        directOnly: true,
      },
      {
        id: 'layer-extra-import',
        name: 'Extra Import',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: encodeTypedArray(buildIndices(width, height, 4)),
        direct: null,
        importSourceDirect: encodeTypedArray(bluePatch),
        directOnly: false,
      },
    ],
  }],
};

const activeDocument = {
  fixtureMode: 'phase3d-multi',
  version: 1,
  width,
  height,
  palette: [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 255, g: 0, b: 0, a: 255 },
    { r: 0, g: 255, b: 0, a: 255 },
  ],
  frames: canvasA.frames,
  activeFrame: 0,
  activeLayer: 'layer-mixed',
  activeCanvasId: 'canvas-a',
  canvases: [canvasA, canvasB],
  documentName: 'phase3d-active',
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
    { r: 70, g: 220, b: 110, a: 255 },
  ],
  frames: canvasC.frames,
  activeFrame: 0,
  activeLayer: 'layer-extra-mixed',
  activeCanvasId: 'canvas-c',
  canvases: [canvasC, canvasD],
  documentName: 'phase3d-extra',
  mirror: { enabled: true, axis: 'x' },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: { x: 2, y: 10, w: 3, h: 3 },
};

const rootSession = {
  historyLimit: 24,
  historyPast: [],
  historyFuture: [],
  timelapse: {
    enabled: true,
    fps: 12,
    byCanvas: {},
    operationLogsByCanvas: {},
  },
};

const extraSession = {
  historyLimit: 18,
  historyPast: [],
  historyFuture: [],
  timelapse: {
    enabled: true,
    fps: 8,
    byCanvas: {},
    operationLogsByCanvas: {},
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
  const fixtureMode = snapshot?.fixtureMode;
  const activeSheetId = fixtureMode === 'phase3d-duplicate-sheet-id' ? 'sheet-dup' : 'sheet-active';
  const extraSheetId = fixtureMode === 'phase3d-duplicate-sheet-id'
    ? 'sheet-dup'
    : (fixtureMode === 'phase3d-path-sheet-id' ? 'sheet/../unsafe?name' : 'sheet-extra');
  const activeSheet = {
    id: activeSheetId,
    fileName: 'phase3d-active.pixieedraw',
    label: 'Active Sheet',
    project: activePackaged,
    unsaved: true,
    source: 'working',
    updatedAt: effectiveUpdatedAt,
    qrEditPayload: null,
    sharedProjectMeta: { channel: 'alpha' },
  };
  if (!['phase3d-multi', 'phase3d-duplicate-sheet-id', 'phase3d-path-sheet-id'].includes(fixtureMode)) {
    return {
      ...activePackaged,
      activeSheetId,
      sheets: [activeSheet],
    };
  }
  const extraPackaged = buildExtraPackagedProject(effectiveUpdatedAt);
  return {
    ...activePackaged,
    activeSheetId,
    sheets: [
      activeSheet,
      {
        id: extraSheetId,
        fileName: 'phase3d-extra.pixieedraw',
        label: 'Extra Sheet',
        project: extraPackaged,
        unsaved: false,
        source: 'sheet',
        updatedAt: effectiveUpdatedAt,
        qrEditPayload: { type: 'qr', version: 1 },
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
    createAutosaveFileName(name = 'phase3d-test.pixieedraw') {
      return typeof name === 'string' && name.trim() ? name : 'phase3d-test.pixieedraw';
    },
  });

  const v2Adapter = window.PiXiEEDrawModules.projectStorageV2ZipAdapter.createPixieeDrawV2ZipAdapter({
    PROJECT_FILE_EXTENSION: '.pixieedraw',
    PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
    PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
    buildPackagedProjectPayload: builder,
    createAutosaveFileName(name = 'phase3d-test.pixieedraw') {
      return typeof name === 'string' && name.trim() ? name : 'phase3d-test.pixieedraw';
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

async function runSingleSheetScenario() {
  const { registry } = createAdapters();
  const singleSnapshot = {
    ...activeDocument,
    fixtureMode: 'phase3d-single',
    documentName: 'phase3d-single',
  };
  const v2Serialized = await registry.serializeProject({
    snapshot: singleSnapshot,
    session: rootSession,
  }, {
    fileNameBase: 'phase3d-single.pixieedraw',
    preferredAdapterId: 'pixieedraw-v2-zip',
    includeSheets: true,
  });
  const parsedFromV2 = await registry.parseBlob(v2Serialized.blob);
  assert.equal(parsedFromV2.adapterId, 'pixieedraw-v2-zip');
  assert.equal(parsedFromV2.parsed.activeSheetId, undefined);
  assert.equal(parsedFromV2.parsed.sheets, undefined);
  assert.equal(parsedFromV2.parsed.document.canvases.length, 2);
}

async function runMultiSheetScenario() {
  const { registry } = createAdapters();
  const v1Serialized = await registry.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'phase3d-multi.pixieedraw',
    includeSheets: true,
  });
  const v2Serialized = await registry.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'phase3d-multi.pixieedraw',
    preferredAdapterId: 'pixieedraw-v2-zip',
    includeSheets: true,
  });

  const v2Bytes = new Uint8Array(await v2Serialized.blob.arrayBuffer());
  const zipEntries = parseStoredZipEntries(v2Bytes);
  const rootProjectJson = JSON.parse(Buffer.from(zipEntries.get('project.json')).toString('utf8'));

  assert.ok(zipEntries.has('canvases/canvas-a.json'));
  assert.ok(zipEntries.has('canvases/canvas-b.json'));
  assert.ok(!Array.from(zipEntries.keys()).some(name => name.startsWith('sheets/')));

  assert.equal(rootProjectJson.activeSheetId, undefined);
  assert.equal(rootProjectJson.sheets, undefined);
  assert.ok(Array.isArray(rootProjectJson.canvasEntries));
  assert.ok(!Array.isArray(rootProjectJson.document?.canvases));
  assert.ok(!Array.isArray(rootProjectJson.document?.frames));
  assert.ok(!JSON.stringify(rootProjectJson).includes(encodeTypedArray(redPatch)));

  const bitmapEntryNames = Array.from(zipEntries.keys()).filter(name => name.startsWith('bitmaps/'));
  assert.ok(bitmapEntryNames.length > 0, 'expected active-project bitmap entries');

  const parsedFromV2 = await registry.parseBlob(v2Serialized.blob);
  assert.equal(parsedFromV2.adapterId, 'pixieedraw-v2-zip');
  assert.equal(parsedFromV2.parsed.activeSheetId, undefined);
  assert.equal(parsedFromV2.parsed.sheets, undefined);
  assert.equal(parsedFromV2.parsed.document.canvases.length, 2);
  assert.equal(parsedFromV2.parsed.document.activeCanvasId, 'canvas-a');
  assert.equal(parsedFromV2.parsed.session.timelapse.enabled, true);
  assert.equal(parsedFromV2.parsed.session.historyLimit, 24);

  assert.equal(
    parsedFromV2.parsed.document.canvases[0].frames[0].layers[1].direct,
    canvasA.frames[0].layers[1].direct,
    'active mixed layer should roundtrip'
  );
  assert.equal(
    parsedFromV2.parsed.document.canvases[0].frames[0].layers[3].importSourceDirect,
    canvasA.frames[0].layers[3].importSourceDirect,
    'active importSourceDirect should roundtrip'
  );
  const documentSessionUtils = createDocumentSessionUtils(registry);
  const parsedSnapshot = await documentSessionUtils.snapshotFromDocumentBlob(v2Serialized.blob);
  assert.equal(parsedSnapshot.storageAdapterId, 'pixieedraw-v2-zip');
  assert.equal(parsedSnapshot.activeSheetId, '');
  assert.deepEqual(parsedSnapshot.sheets, []);
  assert.equal(parsedSnapshot.snapshot.canvases.length, 2);
  assert.equal(parsedSnapshot.projectSession.timelapse.enabled, true);

  return {
    v1Size: v1Serialized.blob.size,
    v2Size: v2Serialized.blob.size,
  };
}

await runSingleSheetScenario();
const sizes = await runMultiSheetScenario();

console.log(
  `Phase 3-D single-project archive checks passed. v1=${sizes.v1Size} bytes, v2=${sizes.v2Size} bytes`
);
