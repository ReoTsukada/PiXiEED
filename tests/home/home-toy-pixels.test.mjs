import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toys = readFileSync(new URL('../../js/tool-toys.mjs', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../js/home-play.mjs', import.meta.url), 'utf8');
const tools = readFileSync(new URL('../../js/tool-previews.mjs', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../css/home.css', import.meta.url), 'utf8');

test('home and tools use the same 24 by 24 opaque integer-grid toy scenes', () => {
  assert.match(toys, /export const TOOL_TOY_SIZE = 24;/);
  const names = ['camera', 'map', 'telescope', 'editor', 'sound', 'game', 'jigsaw', 'diff', 'find'];
  for (const name of names) assert.match(toys, new RegExp(`\\n  ${name}\\(el\\) \\{`), `${name} is in the shared factory`);
  assert.match(toys, /Math\.round\(x \+ i \* scale\)/, 'sprite pixels land on whole logical pixels');
  assert.match(toys, /Math\.round\(x\), Math\.round\(y\)/, 'moving drawing coordinates snap to whole logical pixels');
  assert.match(home, /createToolToys\(\{ note, animate, interactive: false \}\)/, 'linked previews leave navigation and page scrolling available');
  assert.match(tools, /createToolToys\(\{ note: \(\) => \{\}, animate, interactive: false \}\)/);
  assert.match(tools, /fps: 8/);
  assert.match(tools, /draw\(4000\)/, 'reduced motion uses the complete, meaningful sample frame');
  assert.match(styles, /image-rendering: pixelated/);
});
