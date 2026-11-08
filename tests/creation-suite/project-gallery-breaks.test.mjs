import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryBreakRanges, gallerySegmentNearViewport, galleryWindow } from '../../js/creation/project-gallery.mjs';

test('gallery break ranges preserve every configured reservation as results shrink', () => {
  assert.deepEqual(galleryBreakRanges(20, [{ after: 1 }, { after: 7 }, { after: 13 }]), [
    { start: 0, end: 1 }, { start: 1, end: 7 }, { start: 7, end: 13 }, { start: 13, end: 20 },
  ]);
  assert.deepEqual(galleryBreakRanges(3, [{ after: 1 }, { after: 7 }, { after: 13 }]), [
    { start: 0, end: 1 }, { start: 1, end: 3 }, { start: 3, end: 3 }, { start: 3, end: 3 },
  ]);
});

test('distant segmented groups are skipped before row-window work', () => {
  const viewport = { viewportTop: 100, viewportBottom: 700, overscan: 200 };
  assert.equal(gallerySegmentNearViewport({ segmentTop: 850, segmentBottom: 1200, ...viewport }), true);
  assert.equal(gallerySegmentNearViewport({ segmentTop: 1500, segmentBottom: 1800, ...viewport }), false);
  const distantGroup = galleryBreakRanges(10001, [{ after: 1 }, { after: 7 }, { after: 13 }]).at(-1);
  assert.equal(distantGroup.end - distantGroup.start, 9988);
  assert.equal(gallerySegmentNearViewport({ segmentTop: 250000, segmentBottom: 400000, ...viewport }), false);
});

test('a visible window in a large segmented group remains viewport-bounded', () => {
  const group = galleryWindow({ count: 9988, width: 360, viewportHeight: 700, offset: 120000, columns: 4 });
  assert.ok(group.end - group.start <= 60);
  assert.ok(group.start > 0);
  assert.ok(group.end <= 9988);
});
