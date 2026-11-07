import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryWindow } from '../../js/creation/project-gallery.mjs';

test('gallery bounds thumbnail work by viewport rather than collection size', () => {
  const small = galleryWindow({ count: 200, width: 360, viewportHeight: 700 });
  const huge = galleryWindow({ count: 20000, width: 360, viewportHeight: 700 });
  assert.equal(small.end, huge.end);
  assert.ok(huge.end <= 44);
  assert.ok(huge.height > small.height);
  assert.equal(huge.start, 0);
});
test('gallery virtual rows remain aligned and include overscan while scrolling', () => {
  const result = galleryWindow({ count: 203, width: 360, viewportHeight: 400, offset: 1200 });
  assert.equal(result.start % 4, 0);
  assert.ok(result.start > 0);
  assert.ok(result.end - result.start <= 40);
  assert.ok(Math.floor(result.start / 4) * result.stride < 1200);
});
test('gallery clamps empty, short, and past-the-end windows', () => {
  assert.equal(galleryWindow({ count: 0, width: 300, viewportHeight: 700 }).height, 0);
  assert.equal(galleryWindow({ count: 3, width: 300, viewportHeight: 700 }).end, 3);
  const tail = galleryWindow({ count: 203, width: 360, viewportHeight: 400, offset: 1000000 });
  assert.ok(tail.end <= 203);
  assert.ok(tail.start <= tail.end);
});

test('integrated Draw keeps current-work notes outside the image library', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../js/creation/creation-modes.mjs', import.meta.url), 'utf8');
  assert.match(source, /currentProjectPane\?\.prepend\(imageImportActions\)/);
  assert.match(source, /currentProjectPane\?\.append\(projectNotes\)/);
  assert.doesNotMatch(source, /currentProjectPane\?\.before\((imageImportActions|projectNotes)\)/);
});
