import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_FOUR_COLOR_PALETTE, lensPalette, lensPaletteEdited, processLensFrame, resetLensPalette, setLensPalette, setLensPaletteColor, setLensSettings } from '../../js/pixel-lens/engine.mjs';

const frame = (width, height, color = [0, 0, 0]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...color, 255], i);
  return { width, height, data };
};

function coloredScene(width = 128, height = 128, colors = [[220, 130, 60], [55, 170, 90], [45, 110, 210], [245, 220, 150]]) {
  const image = frame(width, height);
  const halfW = Math.floor(width / 2); const halfH = Math.floor(height / 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = colors[(y >= halfH ? 2 : 0) + (x >= halfW ? 1 : 0)];
    image.data.set([...color, 255], (y * width + x) * 4);
  }
  return image;
}

function configure(depth, paletteMode = 'source') {
  setLensSettings({ colorDepth: String(depth), paletteMode, gradientMode: 'none', surfaceSimplify: 0, cameraSettings: { brightness: 0, contrast: 0, saturation: 0, exposure: 0, shadows: 0, whiteBalance: 0 } });
  resetLensPalette();
}

test('black-only automatic palettes stay provisional through dark noise, then recover and lock for depths 2, 4, 8 and 16', () => {
  const cases = [
    ['2', 'source'], ['4', 'source'], ['8', 'gameboy'], ['8', 'source'], ['16', 'gameboy'], ['16', 'source']
  ];
  for (const [depth, mode] of cases) {
    configure(depth, mode);
    assert.deepEqual(lensPalette(), []);
    processLensFrame(frame(128, 128));
    assert.deepEqual(lensPalette(), [[0, 0, 0]], `${depth}/${mode}: initial black frame is provisional`);

    const noise = frame(128, 128);
    for (let pixel = 0; pixel < 96; pixel++) noise.data.set([pixel % 13, (pixel * 3) % 17, (pixel * 5) % 19, 255], pixel * 4);
    processLensFrame(noise);
    assert.deepEqual(lensPalette(), [[0, 0, 0]], `${depth}/${mode}: dark noise does not lock a new palette`);

    processLensFrame(coloredScene());
    const selected = lensPalette();
    assert.ok(selected.some(([r, g, b]) => Math.max(r, g, b) > 24), `${depth}/${mode}: bright scene replaces the provisional black palette`);
    processLensFrame(coloredScene(128, 128, [[120, 45, 190], [210, 70, 100], [60, 205, 180], [250, 170, 35]]));
    assert.deepEqual(lensPalette(), selected, `${depth}/${mode}: later scenes keep the recovered palette`);
  }
});

test('a single bright night light recovers a black source palette and stays fixed after the light leaves', () => {
  for (const lightPixels of [1, 3]) {
    configure('16', 'source');
    processLensFrame(frame(128, 128));
    const night = frame(128, 128);
    for (let pixel = 0; pixel < lightPixels; pixel++) night.data.set([255, 255, 255, 255], pixel * 4);
    processLensFrame(night);
    const selected = lensPalette();
    assert.ok(selected.some(([r, g, b]) => r === 255 && g === 255 && b === 255), `${lightPixels}px light is retained in the recovered palette`);
    processLensFrame(frame(128, 128));
    assert.deepEqual(lensPalette(), selected, 'ordinary darkness after recovery does not repick the palette');
  }
});

test('single gray automatic palettes wait through near-gray input, recover from a distinct scene, then lock', () => {
  configure('16', 'source');
  processLensFrame(frame(128, 128, [128, 128, 128]));
  assert.deepEqual(lensPalette(), [[128, 128, 128]]);

  processLensFrame(frame(128, 128, [136, 136, 136]));
  assert.deepEqual(lensPalette(), [[128, 128, 128]], 'nearby gray remains within the provisional palette distance');

  const monochromeScene = frame(128, 128, [24, 24, 24]);
  for (let y = 0; y < 128; y++) for (let x = 64; x < 128; x++) {
    monochromeScene.data.set([232, 232, 232, 255], (y * 128 + x) * 4);
  }
  processLensFrame(monochromeScene);
  const recovered = lensPalette();
  assert.ok(recovered.length > 1, 'a distinct monochrome scene with light/dark structure triggers automatic recovery');

  processLensFrame(coloredScene(128, 128, [[210, 40, 50], [20, 200, 60], [30, 70, 220], [230, 210, 40]]));
  assert.deepEqual(lensPalette(), recovered, 'after recovery, ordinary scene changes keep the selected palette fixed');
});

test('a hand-edited single gray palette stays fixed when the scene changes', () => {
  configure('16', 'source');
  processLensFrame(frame(128, 128, [128, 128, 128]));
  assert.ok(setLensPaletteColor(0, [136, 136, 136]));
  const edited = lensPalette();
  processLensFrame(coloredScene());
  assert.deepEqual(lensPalette(), edited);
  assert.equal(lensPaletteEdited(), true);
});

test('a gray source palette recovers from dark monochrome structure below the black-noise cutoff', () => {
  configure('16', 'source');
  processLensFrame(frame(128, 128, [128, 128, 128]));
  const monochromeScene = frame(128, 128, [0, 0, 0]);
  for (let y = 0; y < 128; y++) for (let x = 64; x < 128; x++) {
    monochromeScene.data.set([55, 55, 55, 255], (y * 128 + x) * 4);
  }
  processLensFrame(monochromeScene);
  assert.ok(lensPalette().length > 1, 'distinct grayscale detail under RGB 64 still replaces the single-color source palette');
});

test('saved and hand-edited near-black palettes are never automatically replaced', () => {
  configure('16', 'source');
  const savedBlack = [[0, 0, 0]];
  setLensPalette(savedBlack);
  processLensFrame(coloredScene());
  assert.deepEqual(lensPalette(), savedBlack, 'saved black palette remains exact despite its one-colour size');
  assert.equal(lensPaletteEdited(), true);

  configure('16', 'source');
  processLensFrame(frame(128, 128));
  assert.ok(setLensPaletteColor(0, [2, 3, 4]));
  const editedBlack = lensPalette();
  processLensFrame(coloredScene());
  assert.deepEqual(lensPalette(), editedBlack, 'edited black palette remains exact');
  assert.equal(lensPaletteEdited(), true);
});

test('explicit palette reset makes a dark palette provisional again and it recovers on a bright frame', () => {
  configure('16', 'source');
  processLensFrame(frame(128, 128));
  resetLensPalette();
  processLensFrame(frame(128, 128));
  assert.deepEqual(lensPalette(), [[0, 0, 0]]);
  processLensFrame(coloredScene());
  assert.ok(lensPalette().some(([r, g, b]) => Math.max(r, g, b) > 24));
});

test('fixed Game Boy and grayscale looks do not enter provisional source recovery', () => {
  configure('2', 'gameboy');
  processLensFrame(frame(128, 128));
  const twoColor = lensPalette();
  assert.deepEqual(twoColor, [[0, 0, 0], [255, 255, 255]]);
  processLensFrame(coloredScene());
  assert.deepEqual(lensPalette(), twoColor);

  configure('4', 'gameboy');
  processLensFrame(frame(128, 128));
  const fourColor = lensPalette();
  assert.deepEqual(fourColor, FIXED_FOUR_COLOR_PALETTE.map(({ r, g, b }) => [r, g, b]));
  processLensFrame(coloredScene());
  assert.deepEqual(lensPalette(), fourColor);

  configure('gray', 'source');
  processLensFrame(frame(128, 128));
  const gray = lensPalette();
  assert.deepEqual(gray, [[192, 192, 192]]);
  processLensFrame(coloredScene());
  assert.deepEqual(lensPalette(), gray);
});
