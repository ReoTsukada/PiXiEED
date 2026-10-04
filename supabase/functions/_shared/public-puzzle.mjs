import { verifyStoredPixelPngClaim, PixelPngError } from './pixel-png.mjs';
import { validateHiddenPuzzleDefinition, validateSpotPuzzleDefinition } from './puzzle-definition.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOT_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_PUBLIC_IMAGE_URL_LENGTH = 2048;

export class PublicPuzzleResponseError extends Error {
  constructor(code) { super(code); this.name = 'PublicPuzzleResponseError'; this.code = code; }
}

function reject(code) { throw new PublicPuzzleResponseError(code); }
function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHourText && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function projectRoot(supabaseUrl) {
  if (typeof supabaseUrl !== 'string' || !/^https:\/\/[^/?#]+\/?$/i.test(supabaseUrl)) reject('public_puzzle_config_invalid');
  let url;
  try { url = new URL(supabaseUrl); } catch { reject('public_puzzle_config_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) reject('public_puzzle_config_invalid');
  return url.origin;
}

function storageKey(path, postId) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || /[\\%?#:]/.test(path) || /:\/\//.test(path)) reject('public_puzzle_image_path_invalid');
  const parts = path.split('/');
  if (parts.length < 2 || parts.some((part) => !ROOT_KEY.test(part)) || parts[0].toLowerCase() !== postId.toLowerCase() || !/\.png$/i.test(parts.at(-1))) reject('public_puzzle_image_path_invalid');
  return parts.map((part) => encodeURIComponent(part)).join('/');
}

function imageUrl(origin, path, postId) {
  const url = `${origin}/storage/v1/object/public/post-public/${storageKey(path, postId)}`;
  if (url.length > MAX_PUBLIC_IMAGE_URL_LENGTH) reject('public_puzzle_image_path_invalid');
  return url;
}

async function verifyImage(bytes, claim, prefix) {
  try { return await verifyStoredPixelPngClaim(bytes, claim, { includeRgba: true }); }
  catch (error) {
    if (error instanceof PixelPngError) reject(`${prefix}_${error.code}`);
    reject(`${prefix}_image_invalid`);
  }
}

function sameUuid(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }

/**
 * Pure adapter contract for the future privileged row reader (not raw DB rows):
 * {
 *   requestedPostId: UUID,
 *   parent: { id, status: 'published', publishedAt: ISO timestamp, title,
 *     authorLabel?: string, imageClaim: { mimeType, size, width, height, colorCount } },
 *   point: { postId: UUID, publishedAt: ISO timestamp, imagePath: relative storage object key },
 *   puzzle: { postId: UUID, reviewState: 'approved', mode: 'spot_difference'|'hidden_object',
 *     schemaVersion: 1, definition, changedImage?: { path, claim } },
 *   originalBytes: Uint8Array, changedBytes?: Uint8Array
 * }
 *
 * This builder performs no network or database access. Parent publication is
 * authoritative; the adapter must obtain and normalize the three snapshots
 * under the future reader's authorization checks before calling it.
 * @param {object} input normalized snapshot described above
 * @param {string} supabaseUrl configured HTTPS project root
 * @returns {Promise<{ok:true,puzzle:object}>} public allowlist response
 */
export async function buildPublicPuzzleResponse(input, supabaseUrl) {
  if (!isRecord(input) || typeof input.requestedPostId !== 'string' || !UUID.test(input.requestedPostId)) reject('public_puzzle_request_id_invalid');
  if (!isRecord(input.parent) || !isRecord(input.point) || !isRecord(input.puzzle)) reject('public_puzzle_snapshot_invalid');
  const postId = input.requestedPostId;
  const { parent, point, puzzle } = input;
  if (!sameUuid(parent.id, postId) || !sameUuid(point.postId, postId) || !sameUuid(puzzle.postId, postId)) reject('public_puzzle_post_id_mismatch');
  if (parent.status !== 'published') reject('public_puzzle_parent_not_published');
  if (!validTimestamp(parent.publishedAt) || !validTimestamp(point.publishedAt)) reject('public_puzzle_publication_date_invalid');
  if (puzzle.reviewState !== 'approved') reject('public_puzzle_not_approved');
  if (!['spot_difference', 'hidden_object'].includes(puzzle.mode)) reject('public_puzzle_mode_invalid');
  if (puzzle.schemaVersion !== 1) reject('public_puzzle_version_unsupported');
  if (typeof parent.title !== 'string' || !parent.title.trim() || Array.from(parent.title.trim()).length > 60) reject('public_puzzle_title_invalid');
  if (parent.authorLabel !== undefined && (typeof parent.authorLabel !== 'string' || !parent.authorLabel.trim() || Array.from(parent.authorLabel.trim()).length > 80 || /[\u0000-\u001f\u007f]/.test(parent.authorLabel))) reject('public_puzzle_author_invalid');

  const origin = projectRoot(supabaseUrl);
  const originalImageUrl = imageUrl(origin, point.imagePath, postId);
  const original = await verifyImage(input.originalBytes, parent.imageClaim, 'public_puzzle_original');
  if (!isRecord(puzzle.definition) || puzzle.definition.schemaVersion !== puzzle.schemaVersion) reject('public_puzzle_definition_version_unsupported');

  let definition; let changedImage;
  if (puzzle.mode === 'spot_difference') {
    if (!isRecord(puzzle.changedImage) || !(input.changedBytes instanceof Uint8Array)) reject('public_puzzle_changed_image_required');
    const changedUrl = imageUrl(origin, puzzle.changedImage.path, postId);
    if (changedUrl === originalImageUrl) reject('public_puzzle_image_path_duplicate');
    const changed = await verifyImage(input.changedBytes, puzzle.changedImage.claim, 'public_puzzle_changed');
    try { definition = validateSpotPuzzleDefinition(puzzle.definition, original, changed); }
    catch { reject('public_puzzle_definition_invalid'); }
    changedImage = { url: changedUrl, width: changed.width, height: changed.height };
  } else {
    if (Object.hasOwn(puzzle, 'changedImage') || Object.hasOwn(input, 'changedBytes')) reject('public_puzzle_changed_image_unexpected');
    try { definition = validateHiddenPuzzleDefinition(puzzle.definition, original); }
    catch { reject('public_puzzle_definition_invalid'); }
  }

  const author = parent.authorLabel?.trim() || '作者不明';
  const responsePuzzle = {
    postId,
    title: parent.title.trim(),
    author,
    mode: puzzle.mode,
    originalImage: { url: originalImageUrl, width: original.width, height: original.height },
    ...(changedImage ? { changedImage } : {}),
    definition,
  };
  return { ok: true, puzzle: responsePuzzle };
}
