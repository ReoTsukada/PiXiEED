export const sessionKey = 'pixieed:library-envelope:v1';
const base64url = /^[A-Za-z0-9_-]+$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const limit = 131072;

export function isEnvelope(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === 'cipher,id,iv,v'
    && value.v === 1 && typeof value.id === 'string' && uuid.test(value.id)
    && typeof value.iv === 'string' && value.iv.length === 16 && base64url.test(value.iv)
    && typeof value.cipher === 'string' && value.cipher.length >= 22 && value.cipher.length <= limit
    && value.cipher.length % 4 !== 1 && base64url.test(value.cipher);
}

export function decodeEnvelope(fragment) {
  if (!fragment || fragment.length > limit || !base64url.test(fragment)) return null;
  try {
    const value = JSON.parse(atob(fragment.replace(/-/g, '+').replace(/_/g, '/')));
    return isEnvelope(value) ? value : null;
  } catch { return null; }
}
