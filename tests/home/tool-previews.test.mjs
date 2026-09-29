import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCircleMask, createToolToys, TOOL_TOY_NAMES, TOOL_TOY_SIZE } from '../../js/tool-toys.mjs';

test('Bresenham circle masks are eight-way symmetric, continuous by row, and clipped to 24px', () => {
  const size = TOOL_TOY_SIZE; const center = Math.floor(size / 2);
  for (const radius of [4, 8, 10]) {
    const mask = createCircleMask(radius, size);
    assert.equal(mask.length, size * size);
    for (let y = 0; y < size; y++) {
      const xs = [];
      for (let x = 0; x < size; x++) {
        const pixel = mask[y * size + x];
        assert.ok(pixel === 0 || pixel === 1);
        if (pixel) xs.push(x);
        const dx = x - center; const dy = y - center;
        const rotatedX = center - dy; const rotatedY = center + dx;
        if (rotatedX >= 0 && rotatedX < size && rotatedY >= 0 && rotatedY < size) {
          assert.equal(pixel, mask[rotatedY * size + rotatedX], 'the circle is symmetric in all eight directions');
        }
        const reflectedX = 2 * center - x;
        if (reflectedX >= 0 && reflectedX < size) assert.equal(pixel, mask[y * size + reflectedX], 'the circle mirrors across the vertical axis');
      }
      if (xs.length) assert.equal(xs.at(-1) - xs[0] + 1, xs.length, `radius ${radius}, row ${y} is one continuous span`);
    }
    assert.equal(mask[center * size + center], 1);
    assert.equal(mask[(center - radius) * size + center], 1);
    assert.equal(mask[(center - radius - 1) * size + center], 0);
  }
  assert.equal(createCircleMask(8, size).reduce((sum, pixel) => sum + pixel, 0), 221);
});

test('telescope moon starts bright gibbous, gets curved phases, and is full in its reduced-motion sample', () => {
  const captureAt = (time) => {
    const pixels = new Map();
    const context = {
      fillStyle: '#000', globalAlpha: 1,
      fillRect(x, y, width, height) {
        if (width === 1 && height === 1) pixels.set(`${x},${y}`, this.fillStyle);
      },
    };
    const canvas = { width: 0, height: 0, style: {}, getContext: () => context, addEventListener() {} };
    const card = { querySelector: () => canvas, dataset: {}, addEventListener() {} };
    createToolToys({ animate: (_element, draw) => { draw(time); return () => {}; }, interactive: false }).telescope(card);
    return pixels;
  };
  const start = captureAt(0); const quarter = captureAt(9000); const newMoon = captureAt(14000); const reduced = captureAt(4000);
  const circle = createCircleMask(8);
  const moonPoints = [];
  for (let y = 4; y <= 20; y++) for (let x = 4; x <= 20; x++) {
    if (circle[y * 24 + x]) moonPoints.push(`${x},${y}`);
  }
  const count = (frame, color) => moonPoints.filter((point) => frame.get(point) === color).length;
  assert.ok(count(start, '#f3ecd2') > 130, 'the initial moon is a bright gibbous phase');
  assert.ok(count(quarter, '#f3ecd2') > 80 && count(quarter, '#f3ecd2') < 120, 'quarter-cycle lighting curves across half the sphere');
  assert.equal(count(newMoon, '#252f40'), moonPoints.length, 'the opposite phase is fully dark with no stray rim pixels');
  assert.ok(count(reduced, '#f3ecd2') > 170, 'the 4000ms reduced-motion frame is a bright full moon');
  assert.ok(count(reduced, '#c4b99b') + count(reduced, '#d3c9ad') >= 8, 'few grouped crater marks replace random speckling');
});

test('shared tool toys paint recognizable opaque scenes on a 24 by 24 integer grid', () => {
  assert.equal(TOOL_TOY_SIZE, 24);
  const html = readFileSync(new URL('../../tools/index.html', import.meta.url), 'utf8');
  const markupScenes = [...html.matchAll(/data-tool-preview="([a-z]+)"/g)].map((match) => match[1]);
  assert.ok(markupScenes.length >= 9);
  for (const scene of markupScenes) assert.ok(TOOL_TOY_NAMES.includes(scene), `missing ${scene} scene`);

  for (const scene of TOOL_TOY_NAMES) {
    const fills = [];
    const context = {
      fillStyle: '#000', globalAlpha: 1, imageSmoothingEnabled: true,
      fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle, alpha: this.globalAlpha }); },
    };
    const canvas = {
      width: 0, height: 0, style: {},
      getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 24, height: 24 }),
      addEventListener() {},
    };
    const card = {
      dataset: {}, querySelector: (selector) => selector === 'canvas' ? canvas : null,
      addEventListener() {},
    };
    const animate = (_element, draw) => { draw(4000); return () => {}; };
    const toys = createToolToys({ note() {}, animate, interactive: false });
    toys[scene](card);
    assert.equal(canvas.width, 24, `${scene} uses a 24px backing width`);
    assert.equal(canvas.height, 24, `${scene} uses a 24px backing height`);
    const covered = new Set();
    for (const fill of fills) {
      for (let y = Math.max(0, fill.y); y < Math.min(24, fill.y + fill.height); y++) {
        for (let x = Math.max(0, fill.x); x < Math.min(24, fill.x + fill.width); x++) covered.add(`${x},${y}`);
      }
    }
    assert.equal(covered.size, 24 * 24, `${scene} must paint every pixel opaquely`);
    assert.ok(fills.length > 10, `${scene} should have a recognizable pixel scene`);
    for (const fill of fills) {
      assert.ok([fill.x, fill.y, fill.width, fill.height].every(Number.isInteger), `${scene} has fractional geometry: ${JSON.stringify(fill)}`);
      assert.ok(fill.width > 0 && fill.height > 0, `${scene} has a non-positive paint size: ${JSON.stringify(fill)}`);
      assert.equal(fill.alpha, 1, `${scene} uses a translucent pixel`);
      assert.doesNotMatch(fill.color, /rgba\(|transparent/i, `${scene} uses a transparent color`);
    }
  }
});
