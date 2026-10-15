import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPxdProject, encodePxd, decodePxd, setPxdBytes } from '../../js/creation/pxd-codec.mjs';
import { findPxdOriginalBackup } from '../../js/creation/pxd-original-backup.mjs';

const drawPage = await readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
const functionBody = (source, signature, nextSignature) => {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const end = source.indexOf(nextSignature, start + signature.length);
  assert.notEqual(end, -1, `missing boundary ${nextSignature}`);
  return source.slice(start, end);
};

test('a successful document replacement drops the previous staged source bytes, including PXD loads', () => {
  const replace = functionBody(drawPage, 'function replaceDocument(', 'function commitChange(');
  assert.match(replace, /importedOriginal\s*=\s*null/);
  assert.match(replace, /if\s*\(!fromPxd\)\s*\{\s*pxdBridge\?\.reset\(\)/);
  assert.ok(replace.indexOf('importedOriginal = null') < replace.indexOf('documentData = nextDocument'));
});

test('failed or stale image imports do not clear the active original; replacement follows decode and final ticket check', () => {
  const importer = functionBody(drawPage, 'async function importImage(', "$('#draw-import-local').addEventListener");
  const replaceAt = importer.indexOf('replaceDocument(next, importSource)');
  assert.notEqual(replaceAt, -1);
  const bytesAt = importer.indexOf('await file.arrayBuffer()');
  const lastGateAt = importer.lastIndexOf('!loadGate.isCurrent(ticket)');
  const decodeAt = importer.indexOf('await decodeDrawImageFile(file)');
  assert.ok(decodeAt < bytesAt && bytesAt < lastGateAt && lastGateAt < replaceAt);
  assert.match(importer, /catch\s*\(error\)[\s\S]*status\.textContent[\s\S]*finally/);
  assert.doesNotMatch(importer.slice(importer.indexOf('catch (error)'), importer.indexOf('finally')), /importedOriginal\s*=\s*null/);
});

test('read-only adoption clears staged source only after the PXD image has been read successfully', () => {
  const open = functionBody(drawPage, 'async openProject(project, { imageRole = null } = {})', 'async getProject(project)');
  const readAt = open.indexOf('const image = await readPxdImage(project, role)');
  const clearAt = open.indexOf('importedOriginal = null');
  assert.ok(readAt >= 0 && clearAt > readAt);
  const failureCatch = open.slice(open.indexOf('catch (error)'), open.indexOf('if (!nextDocument)'));
  assert.match(failureCatch, /if\s*\(!image\s*\|\|\s*\!\(error instanceof RangeError\)\) throw error/);
  const unsupported = failureCatch.slice(0, failureCatch.indexOf("readOnlyImage = image"));
  assert.doesNotMatch(unsupported, /importedOriginal\s*=\s*null/);
  assert.match(failureCatch, /readOnlyImage = image; importedOriginal = null/);
});

test('opening and saving PXD B keeps B own original and unrelated entries, without touching source archive', async () => {
  const originalB = new Uint8Array([137, 80, 78, 71, 66]);
  const unrelated = new Uint8Array([4, 8, 15, 16, 23, 42]);
  let projectB = setPxdBytes(createPxdProject(), 'originals/imported-source.png', originalB, 'image/png');
  projectB = setPxdBytes(projectB, 'future/unknown.bin', unrelated, 'application/octet-stream');
  const sourceSnapshot = await encodePxd(projectB);
  const openedB = await decodePxd(sourceSnapshot);
  // This is the source project supplied as getProject's base. A stale staged A
  // would overwrite the same imported-source path; the page lifecycle tests
  // above guard the state transition that prevents that overwrite.
  const savedB = await encodePxd(openedB);
  const reopenedB = await decodePxd(savedB);
  assert.deepEqual(reopenedB.entries.find(({ path }) => path === 'originals/imported-source.png').bytes, originalB);
  assert.deepEqual(reopenedB.entries.find(({ path }) => path === 'future/unknown.bin').bytes, unrelated);
  assert.deepEqual(await encodePxd(projectB), sourceSnapshot);
});
