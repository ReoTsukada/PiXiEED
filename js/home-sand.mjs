/** Move bounded one-cell grains in place, scanning downstream-first. */
export function stepGravitySand(sand, width, height, gravity, { random = Math.random, onLand = () => {} } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) throw new RangeError('sand dimensions must be non-negative integers');
  if (!(sand instanceof Uint8Array) || sand.length < width * height) throw new RangeError('sand must be a Uint8Array covering the field');
  if (!gravity || !Number.isFinite(gravity.x) || !Number.isFinite(gravity.y)) throw new TypeError('gravity must have finite x and y');

  let gx = Math.max(-1, Math.min(1, gravity.x));
  let gy = Math.max(-1, Math.min(1, gravity.y));
  const magnitude = Math.hypot(gx, gy);
  if (magnitude < 0.08 || width === 0 || height === 0) return sand;
  if (magnitude > 1) { gx /= magnitude; gy /= magnitude; }

  const primaryY = Math.abs(gy) >= Math.abs(gx);
  const primary = primaryY ? (gy < 0 ? -1 : 1) : (gx < 0 ? -1 : 1);
  const rawSecondary = primaryY ? gx : gy;
  const secondaryValue = Math.abs(rawSecondary) < 0.04 ? 0 : rawSecondary;
  const secondaryStrength = Math.abs(secondaryValue);
  const chance = Math.min(0.9, secondaryStrength / Math.max(0.001, primaryY ? Math.abs(gy) : Math.abs(gx)));
  const majorCount = primaryY ? height : width;
  const minorCount = primaryY ? width : height;
  const majorStep = primary > 0 ? -1 : 1;
  const majorStart = majorStep < 0 ? majorCount - 1 : 0;

  // A zero secondary component chooses a fresh scan/slip side each sweep.
  const slip = secondaryValue === 0 ? (random() < 0.5 ? -1 : 1) : (secondaryValue < 0 ? -1 : 1);
  const minorStep = slip > 0 ? -1 : 1;
  const minorStart = minorStep < 0 ? minorCount - 1 : 0;
  for (let oi = 0; oi < majorCount; oi++) {
    const major = majorStart + oi * majorStep;
    for (let ii = 0; ii < minorCount; ii++) {
      const minor = minorStart + ii * minorStep;
      const x = primaryY ? minor : major;
      const y = primaryY ? major : minor;
      const from = y * width + x;
      const value = sand[from];
      if (!value) continue;

      const px = x + (primaryY ? 0 : primary);
      const py = y + (primaryY ? primary : 0);
      const primaryInside = px >= 0 && px < width && py >= 0 && py < height;
      const canPrimary = primaryInside && sand[py * width + px] === 0;
      let moved = false;
      let nx = x; let ny = y;

      // Strong secondary gravity sometimes steers into a diagonal; blocked
      // primary motion always gets a chance to slip around a pile.
      if (!canPrimary || (chance > 0 && random() < chance)) {
        const side = secondaryValue === 0 ? (random() < 0.5 ? -1 : 1) : (secondaryValue < 0 ? -1 : 1);
        const dx = primaryY ? side : primary;
        const dy = primaryY ? primary : side;
        nx = x + dx; ny = y + dy;
        const diagonalInside = nx >= 0 && nx < width && ny >= 0 && ny < height;
        const lateralInside = primaryY ? nx >= 0 && nx < width : ny >= 0 && ny < height;
        const lateralEmpty = lateralInside && sand[primaryY ? y * width + nx : ny * width + x] === 0;
        const diagonalEmpty = diagonalInside && sand[ny * width + nx] === 0;
        // If primary is blocked, only the lateral side and diagonal destination
        // must be clear. If primary was clear, both corner sides must be clear.
        const primarySideEmpty = !canPrimary || (primaryInside && sand[py * width + px] === 0);
        if (lateralEmpty && diagonalEmpty && primarySideEmpty) {
          sand[ny * width + nx] = value; sand[from] = 0; moved = true;
        }
        if (!moved && !canPrimary && chance > 0 && random() < chance) {
          nx = x + (primaryY ? slip : 0);
          ny = y + (primaryY ? 0 : slip);
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && sand[ny * width + nx] === 0) {
            sand[ny * width + nx] = value; sand[from] = 0; moved = true;
          }
        }
      }
      if (!moved && canPrimary) {
        nx = px; ny = py;
        sand[ny * width + nx] = value; sand[from] = 0; moved = true;
      }

      // Notify only after a move that settles directly against a primary-side
      // obstacle or a hard edge; the caller can throttle any resulting sound.
      if (moved) {
        const landingPx = nx + (primaryY ? 0 : primary);
        const landingPy = ny + (primaryY ? primary : 0);
        if (landingPx < 0 || landingPx >= width || landingPy < 0 || landingPy >= height || sand[landingPy * width + landingPx] !== 0) onLand(nx, ny, value);
      }
    }
  }
  return sand;
}
