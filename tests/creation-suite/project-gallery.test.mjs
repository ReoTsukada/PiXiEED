import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryBreakRanges, gallerySegmentLayout, galleryWindow } from '../../js/creation/project-gallery.mjs';
import { projectGalleryAdPositions } from '../../js/ads/project-manager-ad.mjs';

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
  assert.equal(result.start % 3, 0);
  assert.ok(result.start > 0);
  assert.ok(result.end - result.start <= 40);
  assert.ok(Math.floor(result.start / 3) * result.stride < 1200);
});
test('gallery clamps empty, short, and past-the-end windows', () => {
  assert.equal(galleryWindow({ count: 0, width: 300, viewportHeight: 700 }).height, 0);
  assert.equal(galleryWindow({ count: 3, width: 300, viewportHeight: 700 }).end, 3);
  const tail = galleryWindow({ count: 203, width: 360, viewportHeight: 400, offset: 1000000 });
  assert.ok(tail.end <= 203);
  assert.ok(tail.start <= tail.end);
});

test('square card geometry stays equal within complete ad groups at phone and desktop widths', () => {
  const counts = [1, 2, 3, 6, 7, 13];
  const widths = [320, 390, 1280];
  for (const count of counts) {
    const positions = projectGalleryAdPositions(count);
    for (const width of widths) {
      const columns = width >= 600 ? 6 : 3;
      const ranges = galleryBreakRanges(count, positions.map(after => ({ after })));
      const groups = ranges.filter(range => range.end > range.start);
      const expectedEnds = [...positions, count].filter((point, index, all) => index === 0 || point !== all[index - 1]);
      assert.deepEqual(groups.map(({ end }) => end), expectedEnds);
      const layouts = groups.map(({ start, end }) => gallerySegmentLayout({ count: end - start, width, columns }));
      assert.ok(layouts.every(layout => layout.size === layouts[0].size && layout.stride === layouts[0].stride), `equal card size at ${width}px for ${count} works`);
      assert.ok(columns * layouts[0].size + (columns - 1) * 3 <= width + 1e-9, `no horizontal overflow at ${width}px`);
      assert.equal(layouts[0].size, (width - (columns - 1) * 3) / columns);
    }
  }
});

test('gallery column rules keep three mobile and six desktop columns through resize', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../css/project-workspace.css', import.meta.url), 'utf8');
  assert.match(css, /\.project-gallery\.project-list \{ --gallery-columns: 3;/);
  assert.match(css, /@media \(min-width: 600px\) \{ \.project-gallery\.project-list \{ --gallery-columns: 6;/);
  assert.doesNotMatch(css, /@media \(max-width: 340px\) \{ \.project-gallery\.project-list \{ --gallery-columns/);
});

test('integrated Draw keeps current-work notes outside the image library', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../js/creation/creation-modes.mjs', import.meta.url), 'utf8');
  assert.match(source, /currentProjectPane\?\.querySelector\('\.project-current-card'\)\?\.after\(imageImportSection\)/);
  assert.match(source, /currentProjectPane\?\.append\(projectNotes\)/);
  assert.doesNotMatch(source, /currentProjectPane\?\.before\((imageImportActions|projectNotes)\)/);
});


test('current-work continuation reads pixels without saving and camera warnings stay outside folded help', async () => {
  const { readFile } = await import('node:fs/promises');
  const workspace = await readFile(new URL('../../js/creation/project-workspace.mjs', import.meta.url), 'utf8');
  assert.match(workspace, /button\('編集を続ける', 'project-continue', \(\) => dialog\.close\(\)\)/);
  const preview = workspace.split('function refreshCurrentPreview() {')[1].split('const identityName')[0];
  assert.match(preview, /context\.drawImage/);
  assert.doesNotMatch(preview, /(?:session\.|save\(|forkProject\(|getProject\()/);
  const modes = await readFile(new URL('../../js/creation/creation-modes.mjs', import.meta.url), 'utf8');
  assert.match(modes, /const projectNotes = document\.createElement\('details'\)/);
  assert.match(modes, /projectNotes\.append\(projectNotesSummary, saveScopeNote, historyNote\)/);
  assert.match(modes, /querySelector\('\.project-current-card'\)\?\.append\(cameraProjectNote\)/);
});
