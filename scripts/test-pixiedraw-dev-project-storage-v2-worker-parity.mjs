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

loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-worker-bridge.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-zip-adapter.js');

function encodeTypedArray(view) {
  if (!view) {
    return null;
  }
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64');
}

function decodeBase64(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
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

function createRectPixels(width, height, { x0, y0, rectWidth, rectHeight, rgba }) {
  const pixels = [];
  for (let y = y0; y < y0 + rectHeight; y += 1) {
    for (let x = x0; x < x0 + rectWidth; x += 1) {
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
const sharedBluePatch = createRectPixels(width, height, {
  x0: 1,
  y0: 1,
  rectWidth: 3,
  rectHeight: 3,
  rgba: { r: 20, g: 100, b: 255, a: 255 },
});
const redPatch = createRectPixels(width, height, {
  x0: 2,
  y0: 2,
  rectWidth: 3,
  rectHeight: 3,
  rgba: { r: 255, g: 20, b: 40, a: 255 },
});
const greenPatch = createRectPixels(width, height, {
  x0: 4,
  y0: 4,
  rectWidth: 2,
  rectHeight: 2,
  rgba: { r: 60, g: 220, b: 110, a: 255 },
});

function createIndexedLayer(id, name) {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    indices: encodeTypedArray(buildIndices(width, height, 2)),
    direct: encodeTypedArray(sharedBluePatch),
    importSourceDirect: null,
    directOnly: false,
  };
}

function createDirectOnlyLayer(id, name, patch) {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    indices: encodeTypedArray(buildIndices(width, height, -1)),
    direct: encodeTypedArray(patch),
    importSourceDirect: null,
    directOnly: true,
  };
}

function createMixedLayer(id, name, patch) {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    indices: encodeTypedArray(buildIndices(width, height, 1)),
    direct: encodeTypedArray(patch),
    importSourceDirect: encodeTypedArray(sharedBluePatch),
    directOnly: false,
  };
}

function createCanvas(id, name, layers, { mirror = { enabled: false } } = {}) {
  return {
    id,
    name,
    width,
    height,
    activeFrame: 0,
    activeLayer: layers[0]?.id || '',
    mirror,
    selectionMask: null,
    selectionContentMask: null,
    selectionBounds: null,
    frames: [{
      id: `${id}-frame-1`,
      name: `${name} Frame 1`,
      duration: 100,
      layers,
    }],
  };
}

const canvasA = createCanvas('canvas-a', 'Canvas A', [
  createDirectOnlyLayer('layer-a1', 'Layer A1', redPatch),
  createIndexedLayer('layer-a2', 'Layer A2'),
  createMixedLayer('layer-a3', 'Layer A3', greenPatch),
]);

const canvasB = createCanvas('canvas-b', 'Canvas B', [
  createDirectOnlyLayer('layer-b1', 'Layer B1', sharedBluePatch),
  createMixedLayer('layer-b2', 'Layer B2', redPatch),
]);

const canvasC = createCanvas('canvas-c', 'Canvas C', [
  createIndexedLayer('layer-c1', 'Layer C1'),
  createDirectOnlyLayer('layer-c2', 'Layer C2', greenPatch),
], { mirror: { enabled: true, axis: 'x' } });

const canvasD = createCanvas('canvas-d', 'Canvas D', [
  createMixedLayer('layer-d1', 'Layer D1', sharedBluePatch),
  createDirectOnlyLayer('layer-d2', 'Layer D2', redPatch),
]);

function createDocument(documentName, canvases, activeCanvasId, activeLayer) {
  const activeCanvas = canvases.find(canvas => canvas.id === activeCanvasId) || canvases[0];
  return {
    version: 1,
    width,
    height,
    palette: [
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 0, b: 0, a: 255 },
    ],
    frames: activeCanvas.frames,
    activeFrame: 0,
    activeLayer,
    activeCanvasId,
    canvases,
    documentName,
    mirror: activeCanvas.mirror,
    selectionMask: null,
    selectionContentMask: null,
    selectionBounds: null,
  };
}

function createSession(fps, snapshotCanvasId, logCanvasId, label) {
  return {
    historyLimit: 24,
    historyPast: [],
    historyFuture: [],
    timelapse: {
      enabled: true,
      fps,
      byCanvas: {
        [snapshotCanvasId]: {
          warningShown: false,
          sampleStep: 1,
          lastCaptureToken: 2,
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
        [logCanvasId]: createTimelapseOperationLog(logCanvasId, label),
      },
    },
  };
}

const activeDocument = createDocument('worker-active', [canvasA, canvasB], 'canvas-a', 'layer-a1');
const extraDocument = createDocument('worker-extra', [canvasC, canvasD], 'canvas-c', 'layer-c1');
const rootSession = createSession(12, 'canvas-a', 'canvas-b', 'root');
const extraSession = createSession(8, 'canvas-c', 'canvas-d', 'sheet-extra');

function buildPackagedProjectFixture(snapshot, { session, updatedAt = '', includeSheets = true } = {}) {
  const effectiveUpdatedAt = updatedAt || '2026-07-10T00:00:00.000Z';
  const activePackaged = {
    type: 'pixieedraw-project',
    packageVersion: 2,
    version: 1,
    document: snapshot,
    session,
    updatedAt: effectiveUpdatedAt,
  };
  if (includeSheets !== true) {
    return activePackaged;
  }
  const extraPackaged = {
    type: 'pixieedraw-project',
    packageVersion: 2,
    version: 1,
    document: extraDocument,
    session: extraSession,
    updatedAt: effectiveUpdatedAt,
  };
  return {
    ...activePackaged,
    activeSheetId: 'sheet-active',
    sheets: [
      {
        id: 'sheet-active',
        fileName: 'worker-active.pixieedraw',
        label: 'Active',
        source: 'sheet',
        unsaved: false,
        updatedAt: effectiveUpdatedAt,
        project: activePackaged,
      },
      {
        id: 'sheet-shared-origin',
        fileName: 'worker-extra.pixieedraw',
        label: 'Shared Origin',
        source: 'shared-sheet',
        unsaved: false,
        updatedAt: effectiveUpdatedAt,
        sharedProjectKey: 'legacy-shared-key',
        sharedProjectBackendId: 'legacy-backend-id',
        sharedProjectRevision: 5,
        sharedProjectStructureRevision: 7,
        sharedRoleHint: 'viewer',
        sharedAutoJoin: false,
        sharedSyncState: { legacy: true },
        project: extraPackaged,
      },
    ],
  };
}

class MockVmWorker {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.terminated = false;
    const entryPath = this.resolvePath(workerUrl, repoRoot);
    const context = {
      console,
      setTimeout,
      clearTimeout,
      Uint8Array,
      Uint8ClampedArray,
      Uint32Array,
      Int16Array,
      ArrayBuffer,
      DataView,
      Blob,
      Response,
      TextEncoder,
      TextDecoder,
      CompressionStream,
      DecompressionStream,
      crypto: globalThis.crypto,
      btoa(value = '') {
        return Buffer.from(String(value), 'binary').toString('base64');
      },
      atob(value = '') {
        return Buffer.from(String(value), 'base64').toString('binary');
      },
    };
    context.self = context;
    context.globalThis = context;
    context.PiXiEEDrawModules = {};
    context.postMessage = payload => {
      Promise.resolve().then(() => {
        if (!this.terminated && typeof this.onmessage === 'function') {
          this.onmessage({ data: payload });
        }
      });
    };
    context.importScripts = (...urls) => {
      urls.forEach(url => {
        const nextPath = this.resolvePath(url, path.dirname(entryPath));
        const source = fs.readFileSync(nextPath, 'utf8');
        vm.runInContext(source, this.context, { filename: nextPath });
      });
    };
    this.context = vm.createContext(context);
    const source = fs.readFileSync(entryPath, 'utf8');
    vm.runInContext(source, this.context, { filename: entryPath });
  }

  resolvePath(value, basePath) {
    const sanitized = String(value || '').split('?')[0].split('#')[0];
    if (path.isAbsolute(sanitized)) {
      return sanitized;
    }
    if (sanitized.startsWith('PiXiEEDrawDEV/')) {
      return path.join(repoRoot, sanitized);
    }
    return path.resolve(basePath, sanitized);
  }

  postMessage(payload) {
    Promise.resolve().then(() => {
      if (this.terminated) {
        return;
      }
      try {
        this.context.onmessage?.({ data: payload });
      } catch (error) {
        if (typeof this.onerror === 'function') {
          this.onerror({ message: error?.message || String(error), error });
        }
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function createWorkerBridge() {
  return window.PiXiEEDrawModules.projectStorageV2WorkerBridge.createProjectStorageV2WorkerBridge({
    workerUrl: 'PiXiEEDrawDEV/assets/js/workers/project-storage-v2.worker.js',
    workerFactory(workerUrl) {
      return new MockVmWorker(workerUrl);
    },
    console,
  });
}

function createAdapter() {
  const bridge = createWorkerBridge();
  const adapter = window.PiXiEEDrawModules.projectStorageV2ZipAdapter.createPixieeDrawV2ZipAdapter({
    PROJECT_FILE_EXTENSION: '.pixieedraw',
    PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
    PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
    buildPackagedProjectPayload(snapshot, { session, updatedAt = '', includeSheets = true } = {}) {
      return buildPackagedProjectFixture(snapshot, { session, updatedAt, includeSheets });
    },
    createAutosaveFileName(name = 'worker-parity.pixieedraw') {
      return typeof name === 'string' && name.trim() ? name : 'worker-parity.pixieedraw';
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
    workerBridge: bridge,
    useWorkerByDefault: false,
    console,
  });
  return { adapter, bridge };
}

function normalizeForCompare(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertEmptyTimelapsePayload(timelapse, expectedFps = 12) {
  assert.equal(Boolean(timelapse?.enabled), false);
  assert.equal(Math.round(Number(timelapse?.fps) || 0), expectedFps);
  assert.deepEqual(normalizeForCompare(timelapse?.byCanvas || {}), {});
  assert.deepEqual(normalizeForCompare(timelapse?.operationLogsByCanvas || {}), {});
}

async function runSingleSheetParityScenario() {
  const { adapter, bridge } = createAdapter();
  const projectState = {
    snapshot: activeDocument,
    session: rootSession,
  };
  const mainSerialized = await adapter.serializeProject(projectState, {
    fileNameBase: 'worker-single.pixieedraw',
    includeSheets: false,
    includeTimelapse: true,
  });
  const workerSerialized = await adapter.serializeProject(projectState, {
    fileNameBase: 'worker-single.pixieedraw',
    includeSheets: false,
    includeTimelapse: true,
    useWorker: true,
  });

  assert.equal(mainSerialized.workerUsed, false);
  assert.equal(workerSerialized.workerUsed, true);
  assert.deepEqual(normalizeForCompare(workerSerialized.archiveManifest), normalizeForCompare(mainSerialized.archiveManifest));
  assert.deepEqual(normalizeForCompare(workerSerialized.archiveProject), normalizeForCompare(mainSerialized.archiveProject));
  assert.deepEqual(normalizeForCompare(workerSerialized.diagnostics), normalizeForCompare(mainSerialized.diagnostics));

  const mainBytes = new Uint8Array(await mainSerialized.blob.arrayBuffer());
  const workerBytes = new Uint8Array(await workerSerialized.blob.arrayBuffer());
  const mainParsed = await adapter.parseBytes(mainBytes, {});
  const workerParsed = await adapter.parseBytes(workerBytes, { useWorker: true });
  assert.deepEqual(normalizeForCompare(workerParsed), normalizeForCompare(mainParsed));
  assert.equal(workerParsed.document.canvases.length, 2);
  assert.equal(workerParsed.session.timelapse.enabled, true);

  bridge.dispose();
  return workerSerialized.blob.size;
}

async function runMultiSheetTimelapseParityScenario() {
  const { adapter, bridge } = createAdapter();
  const projectState = {
    snapshot: activeDocument,
    session: rootSession,
  };
  const mainSerialized = await adapter.serializeProject(projectState, {
    fileNameBase: 'worker-multi.pixieedraw',
    includeSheets: true,
    includeTimelapse: true,
  });
  const workerSerialized = await adapter.serializeProject(projectState, {
    fileNameBase: 'worker-multi.pixieedraw',
    includeSheets: true,
    includeTimelapse: true,
    useWorker: true,
  });

  assert.deepEqual(normalizeForCompare(workerSerialized.archiveManifest), normalizeForCompare(mainSerialized.archiveManifest));
  assert.deepEqual(normalizeForCompare(workerSerialized.archiveProject), normalizeForCompare(mainSerialized.archiveProject));
  assert.deepEqual(normalizeForCompare(workerSerialized.diagnostics), normalizeForCompare(mainSerialized.diagnostics));
  assert.equal(workerSerialized.archiveProject.session.timelapseArchive.included, true);

  const mainParsed = await adapter.parseBytes(new Uint8Array(await mainSerialized.blob.arrayBuffer()), {});
  const workerParsed = await adapter.parseBytes(new Uint8Array(await workerSerialized.blob.arrayBuffer()), {
    useWorker: true,
  });
  assert.deepEqual(normalizeForCompare(workerParsed), normalizeForCompare(mainParsed));
  assert.equal(workerParsed.activeSheetId, 'sheet-active');
  assert.equal(workerParsed.sheets.length, 2);
  assert.equal(workerParsed.sheets[1].source, 'shared-sheet');
  assert.equal(workerParsed.sheets[1].sharedProjectKey, 'legacy-shared-key');
  assert.equal(workerParsed.sheets[1].project.document.canvases.length, 2);
  assert.equal(workerParsed.sheets[1].project.session.timelapse.enabled, true);

  bridge.dispose();
  return workerSerialized.blob.size;
}

async function runMultiSheetOmitTimelapseParityScenario() {
  const { adapter, bridge } = createAdapter();
  const projectState = {
    snapshot: activeDocument,
    session: rootSession,
  };
  const mainSerialized = await adapter.serializeProject(projectState, {
    fileNameBase: 'worker-multi-omit.pixieedraw',
    includeSheets: true,
    includeTimelapse: false,
  });
  const workerSerialized = await adapter.serializeProject(projectState, {
    fileNameBase: 'worker-multi-omit.pixieedraw',
    includeSheets: true,
    includeTimelapse: false,
    useWorker: true,
  });

  assert.deepEqual(normalizeForCompare(workerSerialized.archiveManifest), normalizeForCompare(mainSerialized.archiveManifest));
  assert.deepEqual(normalizeForCompare(workerSerialized.archiveProject), normalizeForCompare(mainSerialized.archiveProject));
  assert.deepEqual(normalizeForCompare(workerSerialized.diagnostics), normalizeForCompare(mainSerialized.diagnostics));
  assert.equal(workerSerialized.archiveProject.session.timelapseArchive.included, false);

  const workerParsed = await adapter.parseBytes(new Uint8Array(await workerSerialized.blob.arrayBuffer()), {
    useWorker: true,
  });
  assertEmptyTimelapsePayload(workerParsed.session.timelapse, 12);
  assertEmptyTimelapsePayload(workerParsed.sheets[0].project.session.timelapse, 12);
  assertEmptyTimelapsePayload(workerParsed.sheets[1].project.session.timelapse, 8);

  bridge.dispose();
  return workerSerialized.blob.size;
}

async function runWorkerErrorScenario() {
  const { adapter, bridge } = createAdapter();
  const serialized = await adapter.serializeProject({
    snapshot: activeDocument,
    session: rootSession,
  }, {
    fileNameBase: 'worker-broken.pixieedraw',
    includeSheets: true,
    includeTimelapse: true,
    useWorker: true,
  });
  const brokenBlob = await rewriteZipBlob(serialized.blob, entries => {
    entries.delete('timelapse/session.json');
  });
  await assert.rejects(
    async () => await adapter.parseBytes(new Uint8Array(await brokenBlob.arrayBuffer()), {
      useWorker: true,
      requireWorker: true,
    }),
    error => {
      assert.equal(error?.code, 'ERR_MISSING_ARCHIVE_ENTRY');
      assert.equal(error?.entryPath, 'timelapse/session.json');
      assert.match(String(error?.message || ''), /Missing project archive entry: timelapse\/session\.json/);
      return true;
    }
  );
  bridge.dispose();
}

const singleSize = await runSingleSheetParityScenario();
const multiSize = await runMultiSheetTimelapseParityScenario();
const omitSize = await runMultiSheetOmitTimelapseParityScenario();
await runWorkerErrorScenario();

console.log(
  `V2 worker parity checks passed. single=${singleSize} bytes, multi+timelapse=${multiSize} bytes, multi-timelapse=${omitSize} bytes`
);
