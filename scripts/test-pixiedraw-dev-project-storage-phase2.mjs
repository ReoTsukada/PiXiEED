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
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-zip-adapter.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');

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

const v1Adapter = window.PiXiEEDrawModules.projectStorageV1JsonAdapter.createPixieeDrawV1JsonAdapter({
  PROJECT_FILE_EXTENSION: '.pixieedraw',
  PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
  PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
  buildPackagedProjectPayload(snapshot, { session, updatedAt = '', includeSheets = true } = {}) {
    return {
      type: 'pixieedraw-project',
      packageVersion: 2,
      version: 1,
      document: snapshot,
      session,
      updatedAt: updatedAt || '2026-07-09T00:00:00.000Z',
      includeSheets,
    };
  },
  createAutosaveFileName(name = 'phase2-test.pixieedraw') {
    return typeof name === 'string' && name.trim() ? name : 'phase2-test.pixieedraw';
  },
});

const v2Adapter = window.PiXiEEDrawModules.projectStorageV2ZipAdapter.createPixieeDrawV2ZipAdapter({
  PROJECT_FILE_EXTENSION: '.pixieedraw',
  PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
  PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
  buildPackagedProjectPayload(snapshot, { session, updatedAt = '', includeSheets = true } = {}) {
    return {
      type: 'pixieedraw-project',
      packageVersion: 2,
      version: 1,
      document: snapshot,
      session,
      updatedAt: updatedAt || '2026-07-09T00:00:00.000Z',
      includeSheets,
    };
  },
  createAutosaveFileName(name = 'phase2-test.pixieedraw') {
    return typeof name === 'string' && name.trim() ? name : 'phase2-test.pixieedraw';
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
const transparentDirect = new Uint8ClampedArray(width * height * 4);
const mixedIndices = buildIndices(width, height, 0);
for (let y = 5; y < 9; y += 1) {
  for (let x = 4; x < 8; x += 1) {
    mixedIndices[(y * width) + x] = -1;
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
    ],
  }],
};

const rawDocument = {
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
  activeLayer: 'layer-mixed',
  activeCanvasId: 'canvas-a',
  canvases: [canvasA, canvasB],
  documentName: 'phase2-sample',
  mirror: { enabled: false },
  selectionMask: null,
  selectionContentMask: null,
  selectionBounds: null,
};

const sessionPayload = {
  historyLimit: 24,
  historyPast: [],
  historyFuture: [],
  timelapse: {
    enabled: false,
    fps: 12,
    byCanvas: {},
    operationLogsByCanvas: {},
  },
};

const v1Serialized = await registry.serializeProject({
  snapshot: rawDocument,
  session: sessionPayload,
}, {
  fileNameBase: 'phase2-sample.pixieedraw',
});

const v2Serialized = await registry.serializeProject({
  snapshot: rawDocument,
  session: sessionPayload,
}, {
  fileNameBase: 'phase2-sample.pixieedraw',
  preferredAdapterId: v2Adapter.id,
  includeSheets: false,
});

assert.equal(v1Serialized.adapterId, 'pixieedraw-v1-json');
assert.equal(v2Serialized.adapterId, 'pixieedraw-v2-zip-experimental');
assert.ok(v2Serialized.blob instanceof Blob);

const v2Bytes = new Uint8Array(await v2Serialized.blob.arrayBuffer());
const manifest = await v2Adapter.readManifestFromBytes(v2Bytes);
assert.equal(manifest.format, 'pixieedraw');
assert.equal(manifest.version, 2);
assert.equal(manifest.canvasCount, 2);
assert.equal(manifest.activeCanvasId, 'canvas-a');

const zipEntries = parseStoredZipEntries(v2Bytes);
const bitmapEntryNames = Array.from(zipEntries.keys()).filter(name => name.startsWith('bitmaps/'));
assert.equal(bitmapEntryNames.length, 2, 'expected deduped bitmap entries only');
assert.ok(zipEntries.has('manifest.json'));
assert.ok(zipEntries.has('project.json'));
assert.ok(zipEntries.has('canvases/canvas-a.json'));
assert.ok(zipEntries.has('canvases/canvas-b.json'));

const parsedFromV2 = await registry.parseBlob(v2Serialized.blob);
assert.equal(parsedFromV2.adapterId, 'pixieedraw-v2-zip-experimental');
assert.equal(parsedFromV2.parsed.document.width, width);
assert.equal(parsedFromV2.parsed.document.height, height);
assert.equal(parsedFromV2.parsed.document.canvases.length, 2);
assert.equal(parsedFromV2.parsed.document.canvases[0].frames.length, 1);
assert.equal(parsedFromV2.parsed.document.canvases[0].frames[0].layers.length, 4);

assert.equal(
  parsedFromV2.parsed.document.canvases[0].frames[0].layers[1].direct,
  canvasA.frames[0].layers[1].direct,
  'mixed direct payload should roundtrip'
);
assert.equal(
  parsedFromV2.parsed.document.canvases[0].frames[0].layers[3].importSourceDirect,
  canvasA.frames[0].layers[3].importSourceDirect,
  'import source direct payload should roundtrip'
);
assert.equal(
  parsedFromV2.parsed.document.canvases[0].frames[0].layers[2].direct,
  encodeTypedArray(new Uint8ClampedArray(width * height * 4)),
  'transparent directOnly layer should restore as zero-filled direct buffer'
);

const documentSessionUtils = window.PiXiEEDrawModules.documentSessionWorkflowUtils.createDocumentSessionWorkflowUtils({
  DEFAULT_HISTORY_LIMIT: 24,
  MIN_HISTORY_LIMIT: 1,
  history: { limit: 24 },
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },
  deserializeDocumentPayload(payload) {
    return {
      width: payload.width,
      height: payload.height,
      activeCanvasId: payload.activeCanvasId || '',
      frames: payload.frames,
      canvases: payload.canvases,
    };
  },
  resolvePackagedProjectDotStats(parsed) {
    return parsed.dotStats || null;
  },
  normalizePackagedProjectSheets(sheets, activeSheetId) {
    return Array.isArray(sheets) ? sheets : activeSheetId ? [activeSheetId] : [];
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
  createEmptyTimelapseTrack() {
    return { snapshots: [], operationLog: null };
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

const parsedSnapshot = await documentSessionUtils.snapshotFromDocumentBlob(v2Serialized.blob);
assert.equal(parsedSnapshot.storageAdapterId, 'pixieedraw-v2-zip-experimental');
assert.equal(parsedSnapshot.snapshot.canvases.length, 2);

const exportRenderingModule = window.PiXiEEDrawModules.exportRendering.createExportRenderingModule({
  state: {
    documentName: 'phase2-sample.pixieedraw',
    frames: [],
  },
  commitHistory() {},
  makeHistorySnapshot() {
    return rawDocument;
  },
  buildProjectSessionPayload() {
    return sessionPayload;
  },
  async serializeProjectStorageSnapshot(projectState, options) {
    return await registry.serializeProject(projectState, options);
  },
  buildPackagedProjectPayload(snapshot, { session } = {}) {
    return {
      type: 'pixieedraw-project',
      packageVersion: 2,
      version: 1,
      document: snapshot,
      session,
    };
  },
  createAutosaveFileName(name = 'phase2-sample.pixieedraw') {
    return name;
  },
  PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
});

const v2Bundle = await exportRenderingModule.buildProjectExportBundle('phase2-sample.pixieedraw', {
  preferredStorageAdapterId: v2Adapter.id,
  includeSheets: false,
});
assert.equal(v2Bundle.storageAdapterId, 'pixieedraw-v2-zip-experimental');
assert.ok(v2Bundle.blob instanceof Blob);

console.log(
  `Phase 2 project storage checks passed. v1=${v1Serialized.blob.size} bytes, v2=${v2Serialized.blob.size} bytes`
);
