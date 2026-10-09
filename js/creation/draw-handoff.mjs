export const DRAW_HANDOFF_KEY = 'PiXiEED:draw-handoff:v1';
export const HANDOFF_MAX_BYTES = 512 * 1024;
export const HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function validateDrawPixels(document) {
  if (!document || !Number.isInteger(document.width) || !Number.isInteger(document.height) || !Array.isArray(document.pixels) || document.pixels.length !== document.width * document.height || !Array.isArray(document.palette)) throw new TypeError('絵のデータを確認できません。');
  const colors = new Set(); let painted = false;
  for (const index of document.pixels) {
    if (index === -1) { colors.add('transparent'); continue; }
    if (!Number.isInteger(index) || !document.palette[index]) throw new TypeError('絵の色を確認できません。');
    const hex = document.palette[index];
    const rgba = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    rgba.push(hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255);
    if (rgba[3]) { painted = true; colors.add(rgba.join(',')); } else colors.add('transparent');
  }
  if (!painted) throw new Error('何か描いてから世界地図へ送ってください。');
  if (colors.size > 128) throw new Error('世界地図へ送れる色数は透明色を含めて128色までです。');
  return colors.size;
}

export async function encodeDrawPng(document, canvasFactory = () => documentRef().createElement('canvas')) {
  validateDrawPixels(document);
  const canvas = canvasFactory(); canvas.width = document.width; canvas.height = document.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNGを作成できませんでした。');
  const image = context.createImageData(document.width, document.height);
  const palette = document.palette.map((hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).concat(hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255));
  for (let i = 0; i < document.pixels.length; i++) {
    const color = document.pixels[i] < 0 ? [0, 0, 0, 0] : palette[document.pixels[i]];
    image.data.set(color, i * 4);
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNGを作成できませんでした。')), 'image/png'));
  if (!blob.size || blob.size > HANDOFF_MAX_BYTES) throw new Error('PNGが512KBを超えています。色数や絵の細かさを調整してください。');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!hasPngSignature(bytes)) throw new Error('PNGの形式を確認できませんでした。');
  return blob;
}

function documentRef() { return globalThis.document; }
export function hasPngSignature(bytes) { return bytes?.length >= 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value); }

export function serializeDrawHandoff(blob, revisionId, createdAt = Date.now()) {
  if (!(blob instanceof Blob) || blob.type !== 'image/png' || !blob.size || blob.size > HANDOFF_MAX_BYTES || !revisionId) throw new TypeError('世界地図へ送るPNGを確認できません。');
  return blob.arrayBuffer().then((buffer) => JSON.stringify({ source: 'draw', revisionId, createdAt, dataUrl: `data:image/png;base64,${bytesToBase64(new Uint8Array(buffer))}` }));
}

function bytesToBase64(bytes) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }

export function decodePngHandoff(serialized, expectedSource, now = Date.now()) {
  try {
    if (typeof serialized !== 'string' || serialized.length > Math.ceil(HANDOFF_MAX_BYTES * 4 / 3) + 2048) return null;
    const item = JSON.parse(serialized);
    const source = item.source || (expectedSource === 'pixel-camera' ? 'pixel-camera' : null);
    if (source !== expectedSource || (source !== 'draw' && source !== 'pixel-camera')) return null;
    if (!Number.isSafeInteger(item.createdAt) || item.createdAt > now || now - item.createdAt > HANDOFF_MAX_AGE_MS) return null;
    if (typeof item.dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.dataUrl)) return null;
    const encoded = item.dataUrl.slice('data:image/png;base64,'.length);
    if (encoded.length > Math.ceil(HANDOFF_MAX_BYTES * 4 / 3)) return null;
    const binary = atob(encoded); if (!binary.length || binary.length > HANDOFF_MAX_BYTES) return null;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0)); if (!hasPngSignature(bytes)) return null;
    return { source, revisionId: item.revisionId || null, createdAt: item.createdAt, file: new Blob([bytes], { type: 'image/png' }) };
  } catch { return null; }
}
