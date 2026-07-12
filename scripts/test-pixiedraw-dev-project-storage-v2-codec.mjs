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
    localViewportCanvases: {
      count: 1,
      selectedKind: 'local',
      selectedIndex: 0,
      layoutScale: 1,
      positionsRelative: true,
      anchorLeft: 42,
      anchorTop: 24,
      positions: [{ left: 192, top: 96 }],
    },
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

const activeDocument = createDocument('codec-active', [canvasA, canvasB], 'canvas-a', 'layer-a1');
const extraDocument = createDocument('codec-extra', [canvasC, canvasD], 'canvas-c', 'layer-c1');
const rootSession = createSession(12, 'canvas-a', 'canvas-b', 'root');
const extraSession = createSession(8, 'canvas-c', 'canvas-d', 'sheet-extra');

const activePackagedProject = {
  type: 'pixieedraw-project',
  packageVersion: 2,
  version: 1,
  document: activeDocument,
  session: rootSession,
  updatedAt: '2026-07-10T00:00:00.000Z',
};

const extraPackagedProject = {
  type: 'pixieedraw-project',
  packageVersion: 2,
  version: 1,
  document: extraDocument,
  session: extraSession,
  updatedAt: '2026-07-10T00:00:00.000Z',
};

const multiSheetPackagedProject = {
  ...activePackagedProject,
  activeSheetId: 'sheet-active',
  sheets: [
    {
      id: 'sheet-active',
      fileName: 'codec-active.pixieedraw',
      label: 'Active',
      source: 'sheet',
      unsaved: false,
      updatedAt: '2026-07-10T00:00:00.000Z',
      project: activePackagedProject,
    },
    {
      id: 'sheet-shared-origin',
      fileName: 'codec-extra.pixieedraw',
      label: 'Shared Origin',
      source: 'shared-sheet',
      unsaved: false,
      updatedAt: '2026-07-10T00:00:00.000Z',
      sharedProjectKey: 'legacy-shared-key',
      sharedProjectBackendId: 'legacy-backend-id',
      sharedProjectRevision: 5,
      sharedProjectStructureRevision: 7,
      sharedRoleHint: 'viewer',
      sharedAutoJoin: false,
      sharedSyncState: { legacy: true },
      project: extraPackagedProject,
    },
  ],
};
multiSheetPackagedProject.sheets[1].project.canonicalSourceMetadata = {
  sourceKind: 'import-gif', sourceMimeType: 'image/gif', sourceFileBytes: 42,
  sourceWidth: width, sourceHeight: height, sourceFrameCount: 3, gifLoopCount: null,
};

function createCodec() {
  return window.PiXiEEDrawModules.projectStorageV2ArchiveCodec.createProjectStorageV2ArchiveCodec({
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
}

function assertEmptyTimelapsePayload(timelapse, expectedFps = 12) {
  assert.equal(Boolean(timelapse?.enabled), false);
  assert.equal(Math.round(Number(timelapse?.fps) || 0), expectedFps);
  assert.deepEqual(timelapse?.byCanvas || {}, {});
  assert.deepEqual(timelapse?.operationLogsByCanvas || {}, {});
}

async function runSingleSheetScenario() {
  const codec = createCodec();
  const encoded = await codec.encodePackagedProject(activePackagedProject, {
    adapterId: 'pixieedraw-v2-zip-experimental',
    packageType: 'pixieedraw-project',
    fileExtension: '.pixieedraw',
    mimeType: 'application/x-pixieedraw',
    includeSheets: false,
    includeTimelapse: true,
  });

  assert.equal(encoded.archiveManifest.sheetCount, 0);
  assert.equal(encoded.archiveManifest.canvasCount, 2);
  assert.equal(encoded.diagnostics.sheetCount, 0);
  assert.equal(encoded.diagnostics.timelapseIncluded, true);
  assert.ok(encoded.diagnostics.bitmapCount >= encoded.diagnostics.dedupedBitmapCount);

  const decoded = await codec.decodeArchiveBytes(new Uint8Array(await encoded.blob.arrayBuffer()), {
    adapterId: 'pixieedraw-v2-zip-experimental',
  });

  assert.equal(decoded.archiveManifest.sheetCount, 0);
  assert.equal(decoded.packaged.document.canvases.length, 2);
  assert.equal(decoded.packaged.document.activeCanvasId, 'canvas-a');
  assert.equal(decoded.packaged.session.timelapse.enabled, true);
  assert.deepEqual(decoded.packaged.session.timelapse.byCanvas, rootSession.timelapse.byCanvas);
  assert.deepEqual(decoded.packaged.session.timelapse.operationLogsByCanvas, rootSession.timelapse.operationLogsByCanvas);
  assert.deepEqual(decoded.packaged.session.localViewportCanvases, rootSession.localViewportCanvases);
  assert.equal(decoded.packaged.session.timelapseArchive, undefined);
  assert.equal(decoded.packaged.document.canvases[0].frames[0].layers[0].directOnly, true);
  assert.equal(decoded.packaged.document.canvases[0].frames[0].layers[1].indices, canvasA.frames[0].layers[1].indices);
  assert.equal(decoded.packaged.document.canvases[0].frames[0].layers[2].importSourceDirect, canvasA.frames[0].layers[2].importSourceDirect);

  return encoded.blob.size;
}

async function runMultiSheetIncludeTimelapseScenario() {
  const codec = createCodec();
  const encoded = await codec.encodePackagedProject(multiSheetPackagedProject, {
    adapterId: 'pixieedraw-v2-zip-experimental',
    packageType: 'pixieedraw-project',
    fileExtension: '.pixieedraw',
    mimeType: 'application/x-pixieedraw',
    includeSheets: true,
    includeTimelapse: true,
  });

  assert.equal(encoded.archiveManifest.sheetCount, 2);
  assert.equal(encoded.diagnostics.sheetCount, 2);
  assert.equal(encoded.diagnostics.timelapseIncluded, true);
  assert.ok(encoded.diagnostics.dedupedBitmapCount < encoded.diagnostics.bitmapCount);
  assert.equal(encoded.archiveProject.session.timelapseArchive.included, true);
  assertEmptyTimelapsePayload(encoded.archiveProject.session.timelapse, 12);

  const zipEntries = parseStoredZipEntries(new Uint8Array(await encoded.blob.arrayBuffer()));
  assert.ok(zipEntries.has('timelapse/session.json'));
  assert.ok(zipEntries.has('sheets/sheet-active/timelapse/session.json'));
  assert.ok(zipEntries.has('sheets/sheet-shared-origin/timelapse/session.json'));
  const extraSheetProjectJson = JSON.parse(Buffer.from(zipEntries.get('sheets/sheet-shared-origin/project.json')).toString('utf8'));
  assert.equal(extraSheetProjectJson.session.timelapseArchive.included, true);
  assertEmptyTimelapsePayload(extraSheetProjectJson.session.timelapse, 8);

  const decoded = await codec.decodeArchiveBytes(new Uint8Array(await encoded.blob.arrayBuffer()), {
    adapterId: 'pixieedraw-v2-zip-experimental',
  });
  assert.equal(decoded.archiveManifest.sheetCount, 2);
  assert.equal(decoded.diagnostics.sheetCount, 2);
  assert.equal(decoded.diagnostics.timelapseIncluded, true);
  assert.equal(decoded.packaged.activeSheetId, 'sheet-active');
  assert.equal(decoded.packaged.sheets.length, 2);
  assert.equal(decoded.packaged.sheets[1].source, 'shared-sheet');
  assert.equal(decoded.packaged.sheets[1].sharedProjectKey, 'legacy-shared-key');
  assert.equal(decoded.packaged.sheets[1].project.document.canvases.length, 2);
  assert.equal(decoded.packaged.sheets[1].project.session.timelapse.enabled, true);
  assert.equal(decoded.packaged.sheets[1].project.canonicalSourceMetadata.gifLoopCount, null);
  assert.equal(decoded.packaged.sheets[1].project.canonicalSourceMetadata.sourceFrameCount, 3);
  assert.deepEqual(decoded.packaged.sheets[1].project.session.timelapse.byCanvas, extraSession.timelapse.byCanvas);
  assert.deepEqual(
    decoded.packaged.sheets[1].project.session.localViewportCanvases,
    extraSession.localViewportCanvases
  );
  assert.deepEqual(
    decoded.packaged.sheets[1].project.session.timelapse.operationLogsByCanvas,
    extraSession.timelapse.operationLogsByCanvas
  );
  assert.equal(decoded.packaged.session.timelapseArchive, undefined);

  return encoded.blob.size;
}

async function runMultiSheetOmitTimelapseScenario() {
  const codec = createCodec();
  const encoded = await codec.encodePackagedProject(multiSheetPackagedProject, {
    adapterId: 'pixieedraw-v2-zip-experimental',
    packageType: 'pixieedraw-project',
    fileExtension: '.pixieedraw',
    mimeType: 'application/x-pixieedraw',
    includeSheets: true,
    includeTimelapse: false,
  });

  assert.equal(encoded.archiveProject.session.timelapseArchive.included, false);
  assertEmptyTimelapsePayload(encoded.archiveProject.session.timelapse, 12);

  const zipEntries = parseStoredZipEntries(new Uint8Array(await encoded.blob.arrayBuffer()));
  assert.ok(!zipEntries.has('timelapse/session.json'));
  assert.ok(!zipEntries.has('sheets/sheet-active/timelapse/session.json'));
  assert.ok(!zipEntries.has('sheets/sheet-shared-origin/timelapse/session.json'));

  const decoded = await codec.decodeArchiveBytes(new Uint8Array(await encoded.blob.arrayBuffer()), {
    adapterId: 'pixieedraw-v2-zip-experimental',
  });
  assert.equal(decoded.diagnostics.timelapseIncluded, false);
  assertEmptyTimelapsePayload(decoded.packaged.session.timelapse, 12);
  assertEmptyTimelapsePayload(decoded.packaged.sheets[0].project.session.timelapse, 12);
  assertEmptyTimelapsePayload(decoded.packaged.sheets[1].project.session.timelapse, 8);
  assert.equal(decoded.packaged.sheets[1].sharedProjectBackendId, 'legacy-backend-id');

  return encoded.blob.size;
}

async function runLargeMultiSheetScenario(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, index) => {
    const id = `large-sheet-${index + 1}`;
    const project = structuredClone(activePackagedProject);
    project.document.documentName = `${id}.pixieedraw`;
    project.session.localViewportCanvases.anchorLeft = index;
    return { id, fileName: `${id}.pixieedraw`, label: `Large ${index + 1}`, source: 'sheet', sourceKind: 'file', project };
  });
  const packaged = { ...structuredClone(activePackagedProject), sheets, sheetOrder: sheets.map(sheet => sheet.id), activeSheetId: sheets[Math.floor(sheetCount / 2)].id };
  const codec = createCodec();
  const encoded = await codec.encodePackagedProject(packaged, { adapterId: 'pixieedraw-v2-zip-experimental', includeSheets: true, includeTimelapse: false });
  const decoded = await codec.decodeArchiveBytes(new Uint8Array(await encoded.blob.arrayBuffer()));
  assert.equal(decoded.packaged.sheets.length, sheetCount);
  assert.deepEqual(decoded.packaged.sheets.map(sheet => sheet.id), packaged.sheetOrder);
  assert.equal(decoded.packaged.activeSheetId, packaged.activeSheetId);
  assert.equal(decoded.packaged.sheets.at(-1).project.session.localViewportCanvases.anchorLeft, sheetCount - 1);
}

const singleSize = await runSingleSheetScenario();
const includeSize = await runMultiSheetIncludeTimelapseScenario();
const omitSize = await runMultiSheetOmitTimelapseScenario();
await runLargeMultiSheetScenario(20);
await runLargeMultiSheetScenario(50);

console.log(
  `V2 archive codec checks passed. single=${singleSize} bytes, multi+timelapse=${includeSize} bytes, multi-timelapse=${omitSize} bytes`
);
