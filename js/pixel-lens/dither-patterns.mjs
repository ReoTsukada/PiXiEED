/**
 * Dither patterns for the pixel camera.
 *
 * Ordered patterns are either a rank matrix (every step of a Bayer net or a blue-noise tile) or hand-drawn
 * tiles, one per tone step from dark to light ('#' = the lighter of the two colours being mixed). A flat
 * tone always becomes one clean tile repeated, so every step is a regular, deliberate pattern.
 * Diffusion patterns (Atkinson, Floyd–Steinberg) spread each pixel's error to its neighbours instead.
 */
export const DITHER_PATTERNS = Object.freeze([
  ranks('net8', '網目 8×8', [
       0, 32,  8, 40,  2, 34, 10, 42,
      48, 16, 56, 24, 50, 18, 58, 26,
      12, 44,  4, 36, 14, 46,  6, 38,
      60, 28, 52, 20, 62, 30, 54, 22,
       3, 35, 11, 43,  1, 33,  9, 41,
      51, 19, 59, 27, 49, 17, 57, 25,
      15, 47,  7, 39, 13, 45,  5, 37,
      63, 31, 55, 23, 61, 29, 53, 21,
    ]),
  ranks('net4', '網目 4×4', [
       0,  8,  2, 10,
      12,  4, 14,  6,
       3, 11,  1,  9,
      15,  7, 13,  5,
    ]),
  ranks('net2', '粗い網目 2×2', [
      0, 2,
      3, 1,
    ]),
  tiles('checker', '市松', [
      ['#.#.#.#.', '.#.#.#.#', '#.#.#.#.', '.#.#.#.#', '#.#.#.#.', '.#.#.#.#', '#.#.#.#.', '.#.#.#.#'],
    ]),
  tiles('lines', '横線', [
      ['########', '........', '........', '........', '........', '........', '........', '........'],
      ['########', '........', '........', '........', '########', '........', '........', '........'],
      ['########', '........', '########', '........', '########', '........', '########', '........'],
      ['########', '########', '########', '........', '########', '########', '########', '........'],
      ['########', '########', '########', '########', '########', '########', '########', '........'],
    ]),
  tiles('diagonal', '斜め線', [
      ['#.......', '.......#', '......#.', '.....#..', '....#...', '...#....', '..#.....', '.#......'],
      ['#...#...', '...#...#', '..#...#.', '.#...#..', '#...#...', '...#...#', '..#...#.', '.#...#..'],
      ['##..##..', '#..##..#', '..##..##', '.##..##.', '##..##..', '#..##..#', '..##..##', '.##..##.'],
      ['###.###.', '##.###.#', '#.###.##', '.###.###', '###.###.', '##.###.#', '#.###.##', '.###.###'],
      ['#######.', '######.#', '#####.##', '####.###', '###.####', '##.#####', '#.######', '.#######'],
    ]),
  tiles('halftone', '網点', [
      ['........', '.#......', '........', '........', '........', '.....#..', '........', '........'],
      ['.#......', '###.....', '.#......', '........', '.....#..', '....###.', '.....#..', '........'],
      ['###.....', '###.....', '###.....', '........', '....###.', '....###.', '....###.', '........'],
      ['###.....', '####...#', '###.....', '.#...#..', '....###.', '...#####', '....###.', '.#...#..'],
      ['####...#', '###.....', '####...#', '#.###.##', '...#####', '....###.', '...#####', '#.###.##'],
      ['####...#', '####...#', '####...#', '########', '...#####', '...#####', '...#####', '########'],
      ['#####.##', '####...#', '#####.##', '########', '#.######', '...#####', '#.######', '########'],
      ['########', '#####.##', '########', '########', '########', '#.######', '########', '########'],
    ]),
  ranks('grain', '砂目', [
      143,  15, 159, 103,  67,   7, 237, 172, 125, 196, 253, 140, 208,   4,  41, 247,
      202, 113, 217,  35, 198, 151,  80,  48,  96, 161,  17,  86, 222, 115, 163,  79,
       21,  66, 177, 138, 240, 116, 219,  29, 242,  60, 183,  44, 155,  57, 231, 184,
      100, 254,   3,  84,  51,  19, 182, 129, 203, 107, 227, 132, 194,  94,  25, 134,
      207, 154, 121, 221, 192,  97, 158,  69,   0, 146,  32,  78,   8, 244, 175,  50,
      235,  38, 173,  68, 145,  30, 251, 216,  88, 174, 249, 123, 213, 148, 110,  75,
      142,  93,  18, 243, 106, 204,  55, 120,  40, 195,  64, 166,  37,  58, 199,  14,
      118, 188, 214,  45, 133,   6, 170, 141, 234,  98,  20, 108, 238,  85, 169, 226,
       56, 152,  77, 165, 233,  91, 190,  73,  11, 160, 209, 137, 185,   2, 130,  33,
       89, 241,  24, 114,  63, 215,  34, 246, 112, 223,  46,  71, 220, 101, 252, 206,
       10, 136, 200, 179,  16, 127, 150,  53, 168,  82, 144,  27, 156,  42,  65, 162,
      105, 228,  39,  95, 255, 186,  99, 205,  22, 189, 250, 111, 201, 180, 124, 191,
       49,  72, 167, 147,  47,  76,   9, 239, 122,  62,   5,  90, 236,  23,  81, 245,
      117, 211,   1, 218, 119, 225, 164, 139,  87, 178, 210, 131,  54, 149,  12, 157,
       31, 176, 128,  83,  26, 193,  59,  36, 232, 153,  43, 229, 171, 102, 224, 197,
       92, 230,  52, 248, 181, 135, 104, 212,  13,  70, 109,  28,  74, 187, 126,  61,
    ]),
  diffusion('atkinson', 'アトキンソン', [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]]),
  diffusion('fs', '誤差拡散', [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]])
]);

/** tone (0..255, share of the lighter colour) → the step whose coverage is closest */
function toneTable(coverage) {
  const table = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const f = v / 255; let best = 0;
    for (let k = 1; k < coverage.length; k++) if (Math.abs(coverage[k] - f) < Math.abs(coverage[best] - f)) best = k;
    table[v] = best;
  }
  return table;
}
function ordered(id, label, size, steps) {
  const area = size * size;
  const coverage = [0, ...steps.map((bits) => bits.reduce((sum, bit) => sum + bit, 0) / area), 1];
  const levels = [new Uint8Array(area), ...steps, new Uint8Array(area).fill(1)];
  return Object.freeze({ id, label, kind: 'ordered', size, mask: size - 1, shift: Math.log2(size), levels: Object.freeze(levels), coverage: Object.freeze(coverage), levelForTone: toneTable(coverage) });
}
/** Every step of a rank matrix: step k lights the cells ranked below k. */
function ranks(id, label, matrix) {
  const n = Math.sqrt(matrix.length); const size = Math.max(8, n); const steps = [];
  for (let k = 1; k < n * n; k++) {
    const bits = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) bits[y * size + x] = matrix[(y % n) * n + (x % n)] < k ? 1 : 0;
    steps.push(bits);
  }
  return Object.freeze({ ...ordered(id, label, size, steps), ranks: Object.freeze(matrix) });
}
/** Hand-drawn 8×8 tiles, one per step. */
function tiles(id, label, drawn) {
  const steps = drawn.map((rows) => {
    const bits = new Uint8Array(64);
    rows.forEach((row, y) => { for (let x = 0; x < 8; x++) bits[y * 8 + x] = row[x] === '#' ? 1 : 0; });
    return bits;
  });
  return Object.freeze({ ...ordered(id, label, 8, steps), tiles: Object.freeze(drawn) });
}
function diffusion(id, label, kernel) {
  return Object.freeze({ id, label, kind: 'diffusion', kernel: Object.freeze(kernel.map((k) => Object.freeze(k))) });
}
