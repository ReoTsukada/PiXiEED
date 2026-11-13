import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {imageToDrawDocument,putPxdDrawDocument,readPxdDrawDocument} from '../../js/creation/pxd-project.mjs';
import {createPxdProject,encodePxd,decodePxd} from '../../js/creation/pxd-codec.mjs';
import {createDrawDocument,documentRgba,encodePng} from '../../js/creation/draw-core.mjs';
function readU32(bytes, offset) { return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; }
function readPng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8; let width; let height; const idat = [];
  while (offset < bytes.length) {
    const length = readU32(bytes, offset); const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = readU32(data, 0); height = readU32(data, 4); assert.equal(data[8], 8); assert.equal(data[9], 6); }
    if (type === 'IDAT') idat.push(data);
    offset += length + 12; if (type === 'IEND') break;
  }
  const compressed = Buffer.concat(idat.map((chunk) => Buffer.from(chunk))); const raw = inflateSync(compressed);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) { assert.equal(raw[y * (width * 4 + 1)], 0); rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4); }
  return { width, height, rgba };
}

test('1028 PNG exports exact RGBA at full size including partial edge tiles',()=>{const doc=createDrawDocument(1028);for(const n of [0,1023,1024,1027])doc.pixels[n*1028+n]=2;const png=readPng(encodePng(doc));assert.equal(png.width,1028);assert.equal(png.height,1028);assert.deepEqual(png.rgba,documentRgba(doc));});

test('1028 PXD image/poster restores exact editable document without blank fallback',async()=>{const source=createDrawDocument(1028);for(const n of [0,1023,1024,1027])source.pixels[n*1028+n]=2;const rgba=documentRgba(source);const exact=imageToDrawDocument({width:1028,height:1028,rgba});assert.deepEqual(documentRgba(exact),rgba);const restored=await readPxdDrawDocument(await decodePxd(await encodePxd(await putPxdDrawDocument(createPxdProject(),source))));assert.equal(restored.width,1028);assert.deepEqual(documentRgba(restored),rgba);});
