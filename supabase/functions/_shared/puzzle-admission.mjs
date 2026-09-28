import { verifyPixelPngClaim, PixelPngError } from './pixel-png.mjs';
import { validateHiddenPuzzleDefinition, validateSpotPuzzleDefinition } from './puzzle-definition.mjs';

const MAX_IMAGE_BYTES = 512 * 1024;

export class PuzzleAdmissionError extends Error {
  constructor(code) { super(code); this.name = 'PuzzleAdmissionError'; this.code = code; }
}

function reject(code) { throw new PuzzleAdmissionError(code); }

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    reject('puzzle_changed_image_base64_invalid');
  }
  let binary;
  try { binary = atob(value); } catch { reject('puzzle_changed_image_base64_invalid'); }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) reject('puzzle_changed_image_size_invalid');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  let canonical = '';
  for (let i = 0; i < bytes.length; i += 0x8000) canonical += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  if (btoa(canonical) !== value) reject('puzzle_changed_image_base64_invalid');
  return bytes;
}

function mapImageError(error, prefix) {
  const code = error instanceof PixelPngError ? error.code : 'image_decode_invalid';
  reject(`${prefix}_${code}`);
}

function normalizeSourceReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('puzzle_source_invalid');
  const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
  if (![value.draftId, value.assetId, value.revisionId].every((id) => typeof id === 'string' && idPattern.test(id)) ||
      typeof value.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentHash) ||
      value.hashScheme !== 'sha256-canonical-v1') reject('puzzle_source_invalid');
  return {
    draftId: value.draftId,
    assetId: value.assetId,
    revisionId: value.revisionId,
    contentHash: value.contentHash,
    hashScheme: 'sha256-canonical-v1',
  };
}

function normalizePuzzleSource(value, mode) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) reject('puzzle_source_invalid');
  // This is client-declared provenance only, not proof of author identity or rights.
  // It describes canonical document hashes and is never compared with PNG byte hashes.
  const normalized = { schemaVersion: 1, original: normalizeSourceReference(value.original) };
  if (mode === 'spot_difference') {
    if (!Object.hasOwn(value, 'changed')) reject('puzzle_source_invalid');
    normalized.changed = normalizeSourceReference(value.changed);
  } else if (Object.hasOwn(value, 'changed')) {
    reject('puzzle_source_invalid');
  }
  return normalized;
}

export async function admitPuzzleUpload(puzzle, originalBytes, originalClaim) {
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) reject('puzzle_invalid');
  if (puzzle.mode !== 'spot_difference' && puzzle.mode !== 'hidden_object') reject('puzzle_mode_invalid');
  const source = normalizePuzzleSource(puzzle.source, puzzle.mode);

  let original;
  try {
    original = await verifyPixelPngClaim(originalBytes, originalClaim, { includeRgba: true });
  } catch (error) { mapImageError(error, 'puzzle_original'); }

  const definition = puzzle.definition;
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) reject('puzzle_definition_invalid');
  if (definition.schemaVersion !== 1) reject('puzzle_definition_version_unsupported');
  if (definition.width !== original.width || definition.height !== original.height) reject('puzzle_dimensions_mismatch');

  if (puzzle.mode === 'hidden_object') {
    if (Object.hasOwn(puzzle, 'changedImage')) reject('puzzle_changed_image_unexpected');
    try {
      const clean = validateHiddenPuzzleDefinition(definition, original);
      return { mode: puzzle.mode, source, definition: clean, original: { width: original.width, height: original.height, colorCount: originalClaim.colorCount } };
    } catch { reject('puzzle_definition_invalid'); }
  }

  if (!puzzle.changedImage || typeof puzzle.changedImage !== 'object' || Array.isArray(puzzle.changedImage)) reject('puzzle_changed_image_required');
  const changedBytes = decodeBase64(puzzle.changedImage.base64);
  let changed;
  try {
    const claim = { mimeType: puzzle.changedImage.mimeType, size: puzzle.changedImage.size, width: puzzle.changedImage.width, height: puzzle.changedImage.height, colorCount: puzzle.changedImage.colorCount };
    changed = await verifyPixelPngClaim(changedBytes, claim, { includeRgba: true });
  } catch (error) { mapImageError(error, 'puzzle_changed_image'); }
  let clean;
  try { clean = validateSpotPuzzleDefinition(definition, original, changed); }
  catch { reject('puzzle_definition_invalid'); }
  return {
    mode: puzzle.mode,
    source,
    definition: clean,
    original: { width: original.width, height: original.height, colorCount: originalClaim.colorCount },
    changed: { bytes: changedBytes, width: changed.width, height: changed.height, colorCount: puzzle.changedImage.colorCount },
  };
}
