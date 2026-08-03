import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const css = await readFile(new URL('pixiedraw/assets/css/style.css', root), 'utf8');
const mappings = [
  ['newProject', 'file-new.png'],
  ['openDocument', 'file-open.png'],
  ['showLocalProjects', 'file-projects.png'],
  ['exportProject', 'file-export.png'],
];

for (const [buttonId, filename] of mappings) {
  assert.match(
    css,
    new RegExp(`#panelFile #${buttonId}::before \\{[\\s\\S]{0,160}background-image: url\\('\\.\\./icons/${filename.replace('.', '\\.')}'\\)`),
    `${buttonId} uses ${filename}`,
  );
  const png = await readFile(new URL(`pixiedraw/assets/icons/${filename}`, root));
  assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71], `${filename} is a PNG`);
  assert.equal(png.readUInt32BE(16), 21, `${filename} width`);
  assert.equal(png.readUInt32BE(20), 21, `${filename} height`);
}

assert.doesNotMatch(
  css,
  /#panelFile #openTimelapse::before[\s\S]{0,160}background-image/,
  'Timelapse keeps its current text-only presentation until an icon is supplied',
);
assert.match(css, /#panelFile \.field-group--file-actions \.button::before[\s\S]{0,500}image-rendering: pixelated;/);

console.log('PiXiEEDraw file panel icon checks passed.');
