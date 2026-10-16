import test from 'node:test';
import assert from 'node:assert/strict';
import { creationModeEntryUrl, readCreationModePointer } from '../../js/creation/mode-entry.mjs';

const query = (url) => new URL(url, 'https://example.test').searchParams;

test('tool URL switches to Draw mode, namespaces PXD pointers, and preserves unrelated query values', () => {
  const url = creationModeEntryUrl('audio', '?pxd=legacy-project&pxdRevision=rev-7&pxdImage=audio&keep=one&keep=two&mode=old');
  const params = query(url);
  assert.equal(url.startsWith('/draw/?'), true);
  assert.equal(params.get('mode'), 'audio');
  assert.equal(params.get('modeProjectTool'), 'audio');
  assert.equal(params.get('modePxd'), 'legacy-project');
  assert.equal(params.get('modePxdRevision'), 'rev-7');
  assert.equal(params.get('modePxdImage'), 'audio');
  assert.equal(params.has('pxd'), false);
  assert.equal(params.has('pxdRevision'), false);
  assert.equal(params.has('pxdImage'), false);
  assert.deepEqual(params.getAll('keep'), ['one', 'two']);
});

test('camera mode can switch from an earlier mode namespace without inheriting it', () => {
  const url = creationModeEntryUrl('camera', '?modePxd=old&modePxdRevision=old-rev&modeProjectTool=audio&projectTab=3');
  const params = query(url);
  assert.equal(params.get('mode'), 'camera');
  assert.equal(params.get('modeProjectTool'), 'camera');
  assert.equal(params.has('modePxd'), false);
  assert.equal(params.has('modePxdRevision'), false);
  assert.equal(params.get('projectTab'), '3');
});

test('re-entering the selected mode preserves its existing saved-project pointer', () => {
  const url = creationModeEntryUrl('audio', '?modeProjectTool=audio&modePxd=p&modePxdRevision=r&modePxdImage=audio&keep=yes');
  const params = query(url);
  assert.equal(params.get('modeProjectTool'), 'audio');
  assert.deepEqual(readCreationModePointer('audio', url.slice(url.indexOf('?'))), {
    projectId: 'p', revisionId: 'r', imageRole: 'audio'
  });
  assert.equal(params.get('keep'), 'yes');
});

test('re-entering the selected mode promotes its raw saved pointer when no mode pointer exists', () => {
  const url = creationModeEntryUrl('audio', '?modeProjectTool=audio&pxd=latest&pxdRevision=rev-9&pxdImage=audio');
  assert.deepEqual(readCreationModePointer('audio', url.slice(url.indexOf('?'))), {
    projectId: 'latest', revisionId: 'rev-9', imageRole: 'audio'
  });
});

test('the latest raw save pointer wins over an older namespaced entry pointer', () => {
  const url = creationModeEntryUrl('audio', '?modeProjectTool=audio&modePxd=old&modePxdRevision=rev-1&pxd=new&pxdRevision=rev-2');
  assert.deepEqual(readCreationModePointer('audio', url.slice(url.indexOf('?'))), {
    projectId: 'new', revisionId: 'rev-2'
  });
});

test('a partial raw save pointer is not hidden by a complete older mode pointer', () => {
  const url = creationModeEntryUrl('audio', '?modeProjectTool=audio&modePxd=old&modePxdRevision=rev-1&pxd=new');
  assert.throws(() => readCreationModePointer('audio', url.slice(url.indexOf('?'))), /制作モードの作品保存版/);
});

test('ambiguous pointer values fail closed instead of silently dropping duplicates', () => {
  assert.throws(() => creationModeEntryUrl('audio', '?pxd=a&pxd=b&pxdRevision=r'), /複数のpxd値/);
  assert.throws(() => creationModeEntryUrl('camera', '?pxd=a&pxdRevision=r&pxdImage=main&pxdImage=audio'), /複数のpxdImage値/);
  assert.throws(() => creationModeEntryUrl('audio', '?modeProjectTool=audio&modeProjectTool=camera'), /複数のmodeProjectTool値/);
});

test('standalone and legacy camera handoffs are left untouched', () => {
  for (const search of [
    '?standalone=1&pxd=p&pxdRevision=r',
    '?to=draw&drawRequest=d',
    '?to=audio',
    '?drawRequest=d',
    '?audioRequest=a',
    '?drawCamera=d',
    '?audioCamera=a'
  ]) assert.equal(creationModeEntryUrl('camera', search), null, search);
  assert.equal(creationModeEntryUrl('audio', '?standalone=1'), null);
  assert.equal(creationModeEntryUrl('draw', '?pxd=p'), null);
});

test('mode pointer reader validates the selected tool and returns only namespaced pointer values', () => {
  const search = '?pxd=draw-project&pxdRevision=draw-rev&modeProjectTool=audio&modePxd=audio-project&modePxdRevision=audio-rev&modePxdImage=audio';
  assert.deepEqual(readCreationModePointer('audio', search), {
    projectId: 'audio-project', revisionId: 'audio-rev', imageRole: 'audio'
  });
  assert.equal(readCreationModePointer('camera', search), undefined);
  assert.deepEqual(readCreationModePointer('camera', '?modeProjectTool=camera&modePxd=cam&modePxdRevision=rev'), {
    projectId: 'cam', revisionId: 'rev'
  });
});

test('matching mode pointer requires one nonempty project and revision and at most one image role', () => {
  for (const search of [
    '?modeProjectTool=audio',
    '?modeProjectTool=audio&modePxd=p',
    '?modeProjectTool=audio&modePxd=p&modePxdRevision=',
    '?modeProjectTool=audio&modePxd=p&modePxdRevision=r&modePxdImage=',
    '?modeProjectTool=audio&modePxd=p&modePxdRevision=r&modePxdImage=main&modePxdImage=audio'
  ]) assert.throws(() => readCreationModePointer('audio', search), /制作モードの作品保存版|複数のmodePxdImage値/);
  assert.throws(() => readCreationModePointer('unknown', '?modeProjectTool=unknown'), /制作モードが不正/);
});
