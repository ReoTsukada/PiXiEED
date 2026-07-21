import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');

function startServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>PXD index8 roundtrip</title>');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const server = await startServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({
    path: path.join(repoRoot, 'pixiedraw/assets/js/modules/project-storage-v2-archive-codec.js'),
  });

  const result = await page.evaluate(async () => {
    const encodeTypedArray = view => {
      const bytes = view instanceof Uint8Array
        ? view
        : new Uint8Array(view.buffer, view.byteOffset || 0, view.byteLength || 0);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    };
    const decodeBase64 = value => {
      const binary = atob(String(value || ''));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    };
    const decodeInt16 = value => {
      const bytes = decodeBase64(value);
      return Array.from(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
    };
    const codec = window.PiXiEEDrawModules.projectStorageV2ArchiveCodec
      .createProjectStorageV2ArchiveCodec({ encodeTypedArray, decodeBase64 });
    const makeProject = ({ palette, indices }) => ({
      type: 'pixieedraw-project',
      packageVersion: 2,
      version: 2,
      document: {
        version: 2,
        width: 2,
        height: 2,
        documentName: 'index8-test',
        palette,
        frames: [{
          id: 'frame-1',
          duration: 100,
          layers: [{
            id: 'layer-1',
            name: 'Layer 1',
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            indices: encodeTypedArray(indices),
            direct: null,
            importSourceDirect: null,
            directOnly: false,
          }],
        }],
        activeFrame: 0,
        activeLayer: 'layer-1',
        colorMode: 'index',
        activePaletteIndex: 0,
        secondaryPaletteIndex: 1,
      },
      session: { timelapse: { enabled: false, fps: 12, byCanvas: {}, operationLogsByCanvas: {} } },
    });

    const compactSource = makeProject({
      palette: [
        { r: 12, g: 34, b: 56, a: 255 },
        { r: 200, g: 100, b: 50, a: 255 },
      ],
      indices: new Int16Array([-1, 0, 1, -1]),
    });
    const compactEncoded = await codec.encodePackagedProject(compactSource, { adapterId: 'pxd-v2-zip' });
    const compactDecoded = await codec.decodeArchiveBytes(
      new Uint8Array(await compactEncoded.blob.arrayBuffer()),
      { adapterId: 'pxd-v2-zip' }
    );

    const fullPalette = Array.from({ length: 256 }, (_unused, index) => ({
      r: index,
      g: (index * 31) % 256,
      b: (index * 97) % 256,
      a: 255,
    }));
    const fullSource = makeProject({
      palette: fullPalette,
      indices: new Int16Array([255, 0, -1, 100]),
    });
    const fullEncoded = await codec.encodePackagedProject(fullSource, { adapterId: 'pxd-v2-zip' });
    const fullDecoded = await codec.decodeArchiveBytes(
      new Uint8Array(await fullEncoded.blob.arrayBuffer()),
      { adapterId: 'pxd-v2-zip' }
    );

    const implicitSource = makeProject({
      palette: [{ r: 12, g: 34, b: 56, a: 255 }],
      indices: new Int16Array([-1, -1, -1, -1]),
    });
    implicitSource.document.frames[0].layers[0].indices = null;
    implicitSource.document.frames[0].layers[0].indicesImplicitTransparent = true;
    const implicitEncoded = await codec.encodePackagedProject(implicitSource, { adapterId: 'pxd-v2-zip' });
    const implicitDecoded = await codec.decodeArchiveBytes(
      new Uint8Array(await implicitEncoded.blob.arrayBuffer()),
      { adapterId: 'pxd-v2-zip' }
    );

    const transparentPaletteSource = makeProject({
      palette: [
        { r: 255, g: 0, b: 255, a: 0 },
        { r: 24, g: 48, b: 96, a: 255 },
      ],
      indices: new Int16Array([0, 1, -1, 0]),
    });
    const transparentPaletteEncoded = await codec.encodePackagedProject(
      transparentPaletteSource,
      { adapterId: 'pxd-v2-zip' }
    );
    const transparentPaletteDecoded = await codec.decodeArchiveBytes(
      new Uint8Array(await transparentPaletteEncoded.blob.arrayBuffer()),
      { adapterId: 'pxd-v2-zip' }
    );

    return {
      compactEncoding: compactEncoded.archiveProject.document.pixelIndexEncoding || '',
      compactStoredPalette: compactEncoded.archiveProject.document.palette,
      compactDecodedPalette: compactDecoded.packaged.document.palette,
      compactDecodedIndices: decodeInt16(compactDecoded.packaged.document.frames[0].layers[0].indices),
      compactActivePaletteIndex: compactDecoded.packaged.document.activePaletteIndex,
      fullEncoding: fullEncoded.archiveProject.document.pixelIndexEncoding || '',
      fullDecodedPaletteLength: fullDecoded.packaged.document.palette.length,
      fullDecodedIndices: decodeInt16(fullDecoded.packaged.document.frames[0].layers[0].indices),
      implicitEncoding: implicitEncoded.archiveProject.document.pixelIndexEncoding || '',
      implicitMarker: implicitDecoded.packaged.document.frames[0].layers[0].indicesImplicitTransparent,
      implicitDecodedIndices: decodeInt16(implicitDecoded.packaged.document.frames[0].layers[0].indices),
      transparentPaletteEncoding: transparentPaletteEncoded.archiveProject.document.pixelIndexEncoding || '',
      transparentPaletteStoredPalette: transparentPaletteEncoded.archiveProject.document.palette,
      transparentPaletteDecodedIndices: decodeInt16(
        transparentPaletteDecoded.packaged.document.frames[0].layers[0].indices
      ),
    };
  });

  assert.equal(result.compactEncoding, 'pxd-index8-zero-transparent-v1');
  assert.equal(result.compactStoredPalette[0].a, 0);
  assert.deepEqual(result.compactDecodedPalette.slice(1), [
    { r: 12, g: 34, b: 56, a: 255 },
    { r: 200, g: 100, b: 50, a: 255 },
  ]);
  assert.deepEqual(result.compactDecodedIndices, [-1, 1, 2, -1]);
  assert.equal(result.compactActivePaletteIndex, 1);
  assert.equal(result.fullEncoding, '');
  assert.equal(result.fullDecodedPaletteLength, 256);
  assert.deepEqual(result.fullDecodedIndices, [255, 0, -1, 100]);
  assert.equal(result.implicitEncoding, 'pxd-index8-zero-transparent-v1');
  assert.equal(result.implicitMarker, true);
  assert.deepEqual(result.implicitDecodedIndices, []);
  assert.equal(result.transparentPaletteEncoding, 'pxd-index8-zero-transparent-v1');
  assert.deepEqual(result.transparentPaletteStoredPalette, [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 24, g: 48, b: 96, a: 255 },
  ]);
  assert.deepEqual(result.transparentPaletteDecodedIndices, [-1, 1, -1, -1]);
  console.log('PXD index8 roundtrip checks passed');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
