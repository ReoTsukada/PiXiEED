const KINDS = new Set(['pixel_art', 'pixel_camera', 'song', 'character', 'game', 'jigsaw', 'spot_difference', 'hidden_object']);
const VISIBILITIES = new Set(['draft', 'pending', 'published', 'hidden']);
const PERMISSIONS = new Set(['owner_only', 'playable', 'derivative_allowed']);
const HASH_SCHEMES = new Set(['sha256-file-v1', 'sha256-canonical-v1']);

export function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical content contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || !keys.includes('length')) throw new TypeError('Canonical arrays must not have holes or extra properties');
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError('Canonical arrays must not have holes');
      items.push(canonicalize(value[index]));
    }
    return `[${items.join(',')}]`;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Canonical content must contain plain JSON values');
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) throw new TypeError('Canonical objects cannot contain symbol keys');
  const entries = keys.sort().map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Canonical objects must contain enumerable data properties');
    return `${JSON.stringify(key)}:${canonicalize(descriptor.value)}`;
  });
  return `{${entries.join(',')}}`;
}

export async function hashCanonical(value) {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validateAsset(asset) {
  if (!asset || asset.schemaVersion !== 1) throw new TypeError('Unsupported asset schema version');
  for (const key of ['assetId', 'revisionId']) if (typeof asset[key] !== 'string' || !asset[key].trim()) throw new TypeError(`Invalid ${key}`);
  if (!KINDS.has(asset.kind) || !VISIBILITIES.has(asset.visibility) || !PERMISSIONS.has(asset.reusePermission)) throw new TypeError('Unknown asset classification or permission');
  if (!asset.source || typeof asset.source.type !== 'string') throw new TypeError('Invalid source');
  if (!asset.owner || !['account', 'unknown', 'local'].includes(asset.owner.type)) throw new TypeError('Invalid owner');
  if (asset.owner.type === 'account' && (typeof asset.owner.id !== 'string' || !asset.owner.id)) throw new TypeError('Invalid owner id');
  if (asset.contentHash === null) {
    if (asset.hashScheme !== 'sha256-file-v1') throw new TypeError('Only legacy file hashes may be unverified');
  } else if (!HASH_SCHEMES.has(asset.hashScheme) || !/^[a-f0-9]{64}$/.test(asset.contentHash)) throw new TypeError('Invalid content hash');
  if (asset.hashScheme === 'sha256-file-v1' && asset.kind !== 'pixel_art' && asset.kind !== 'pixel_camera') throw new TypeError('File-byte hash is reserved for legacy image assets');
  if (asset.preview) {
    const { mimeType, width, height, locator } = asset.preview;
    if (typeof mimeType !== 'string' || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || typeof locator !== 'string' || !locator) throw new TypeError('Invalid preview');
    if (asset.visibility !== 'published' && /^(https?:)?\/\//i.test(locator)) throw new TypeError('Unpublished preview locator must remain local');
  }
  return asset;
}

export function canView(asset) {
  try { validateAsset(asset); } catch { return false; }
  return asset.visibility === 'published' || asset.visibility === 'draft' && asset.owner.type === 'local';
}

export function canDerive(asset, actorId) {
  try { validateAsset(asset); } catch { return false; }
  if (asset.visibility !== 'published' || asset.owner.type !== 'account' || typeof actorId !== 'string' || !actorId) return false;
  return asset.owner.id === actorId && asset.reusePermission !== 'playable';
}

export function createDerivedAsset(parent, fields) {
  validateAsset(parent);
  if (!fields || !canDerive(parent, fields.actorId)) throw new Error('Derivation is not permitted');
  const { actorId, ...assetFields } = fields;
  return validateAsset({ ...assetFields, source: { type: 'derived', assetId: parent.assetId, revisionId: parent.revisionId } });
}

export function toShareManifest(asset) {
  validateAsset(asset);
  if (asset.visibility !== 'published' || !asset.preview || /(?:lat|lon|lng|latitude|longitude|gps|pending|review|moderation)/i.test(asset.preview.locator)) throw new Error('Asset is not safe to share');
  return Object.freeze({
    schemaVersion: asset.schemaVersion, assetId: asset.assetId, revisionId: asset.revisionId,
    contentHash: asset.contentHash, hashScheme: asset.hashScheme, kind: asset.kind,
    source: { type: asset.source.type, assetId: asset.source.assetId ?? null, revisionId: asset.source.revisionId ?? null },
    owner: { type: asset.owner.type, id: asset.owner.id ?? null }, visibility: asset.visibility,
    reusePermission: asset.reusePermission,
    preview: { mimeType: asset.preview.mimeType, width: asset.preview.width, height: asset.preview.height, locator: asset.preview.locator }
  });
}
