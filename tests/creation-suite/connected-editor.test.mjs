import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createModeScope } from '../../js/creation/mode-scope.mjs';
import { pixelCellAt, rawPixelCellAt, pixelLineCells } from '../../js/creation/pixel-input.mjs';
import { createDrawDocument, strokePixels } from '../../js/creation/draw-core.mjs';

test('leaving a mode releases its listeners, pending frames and timers exactly once', () => {
  let id = 0; const timers = new Map(); const frames = new Map();
  const runtime = { setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(key) { frames.delete(key); } };
  const target = new EventTarget(); let callbacks = 0; let releases = 0;
  const scope = createModeScope(runtime);
  scope.listen(target, 'draw', () => callbacks++);
  scope.timeout(() => callbacks++, 1); scope.frame(() => callbacks++); scope.add(() => releases++);
  target.dispatchEvent(new Event('draw')); assert.equal(callbacks, 1);
  scope.dispose(); scope.dispose(); target.dispatchEvent(new Event('draw'));
  assert.equal(callbacks, 1); assert.equal(releases, 1);
  assert.equal(timers.size, 0); assert.equal(frames.size, 0);
  scope.add(() => releases++); assert.equal(releases, 2);
  assert.equal(scope.timeout(() => callbacks++, 1), 0); assert.equal(scope.frame(() => callbacks++), 0);
});

test('both modes use the same fractional, panned canvas coordinates without moving their pixels', () => {
  const rect = { left: -20.5, top: 33.25, width: 201.5, height: 101.75 };
  const event = { clientX: rect.left + rect.width * 7.5 / 16, clientY: rect.top + rect.height * 4.5 / 8 };
  assert.deepEqual(pixelCellAt(event, rect, 16, 8), { x: 7, y: 4 });
  assert.equal(pixelCellAt({ clientX: rect.left + rect.width, clientY: event.clientY }, rect, 16, 8), null);
  assert.deepEqual(rawPixelCellAt({ clientX: rect.left - 1, clientY: event.clientY }, rect, 16, 8), { x: -1, y: 4 });
});

test('drawing and music strokes visit identical connected cells in every direction', () => {
  for (const from of [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 7, y: 15 }]) for (const to of [{ x: 0, y: 0 }, { x: 8, y: 15 }, { x: 15, y: 7 }]) {
    const document = createDrawDocument(16); const cells = [...pixelLineCells(from, to)];
    const changed = strokePixels(document, from, to, 2);
    assert.deepEqual(changed, cells.map(({ x, y }) => y * 16 + x));
    for (let i = 1; i < cells.length; i++) assert.equal(Math.max(Math.abs(cells[i].x - cells[i - 1].x), Math.abs(cells[i].y - cells[i - 1].y)), 1);
  }
});

test('independent entry pages start only their own mode factory and do not start shared mode routing', () => {
  for (const mode of ['draw', 'audio']) {
    const html = readFileSync(new URL(`../../${mode}/index.html`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`src="/js/creation/${mode}-entry\\.mjs\\?rev=`));
    assert.doesNotMatch(html, /src="\/js\/creation\/creation-app\.mjs/);
    const source = readFileSync(new URL(`../../js/creation/${mode}-page.mjs`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`export async function mount${mode === 'draw' ? 'Draw' : 'Audio'}Mode`));
    assert.match(source, /pxdBridge = mountWorkspace\(/);
    const entry = readFileSync(new URL(`../../js/creation/${mode}-entry.mjs`, import.meta.url), 'utf8');
    assert.match(entry, new RegExp(`import \\{ mount${mode === 'draw' ? 'Draw' : 'Audio'}Mode \\} from './${mode}-page\\.mjs`));
    assert.match(entry, /await mount(?:Draw|Audio)Mode\(\{ scope \}\)/);
    assert.doesNotMatch(entry, /popstate|setModeAdapter|creation-app/);
  }
});
