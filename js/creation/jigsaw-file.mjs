import { normalizePixelFile } from '../pixel-scale.mjs?rev=20260928-pixel-roundtrip-1';

// The picker preview and puzzle builder share one decode of the selected file.
// Weak keys release the normalized pixels when that file is no longer selected.
const normalizedFiles = new WeakMap();
export function normalizeJigsawFile(file) {
  let result = normalizedFiles.get(file);
  if (!result) {
    result = normalizePixelFile(file);
    normalizedFiles.set(file, result);
    result.catch(() => { if (normalizedFiles.get(file) === result) normalizedFiles.delete(file); });
  }
  return result;
}
