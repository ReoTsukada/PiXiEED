import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { decodePixelPngRgba } from '../../supabase/functions/_shared/pixel-png.mjs';
import { createPuzzleSharePage, sharePagePath, spotDifferenceOgpLayout, hiddenObjectOgpText, hiddenObjectOgpLayout } from '../../js/creation/puzzle-share-page.mjs';

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
  const body = Buffer.concat([name, bytes]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Pure build step: verified public images only; no network, storage writes or answer marks. */
export async function buildPuzzleShareArtifacts(payload, options, { originalBytes, changedBytes, renderHidden } = {}) {
  // Validate URLs and public metadata before decoding, or before callers fetch any pixels.
  createPuzzleSharePage(payload, options);
  if (payload.puzzle.mode === 'hidden_object') {
    const original = await decodePixelPngRgba(originalBytes);
    if (original.width !== payload.puzzle.originalImage.width || original.height !== payload.puzzle.originalImage.height) throw new Error('share_ogp_source_dimensions_mismatch');
    if (typeof renderHidden !== 'function') throw new Error('share_ogp_text_renderer_required');
    const text = hiddenObjectOgpText(payload.puzzle.definition);
    const bytes = Buffer.from(await renderHidden({ originalBytes, text }));
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(16) !== 1200 || bytes.readUInt32BE(20) !== 630) throw new Error('share_ogp_render_invalid');
    const name = `ogp-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.png`;
    return { html: createPuzzleSharePage(payload, { ...options, ogpImagePath: `${sharePagePath('hidden-object', options.postId)}${name}` }), images: [{ name, bytes }], layout: hiddenObjectOgpLayout(original.width, original.height) };
  }
  const [original, changed] = await Promise.all([decodePixelPngRgba(originalBytes), decodePixelPngRgba(changedBytes)]);
  if (original.width !== payload.puzzle.originalImage.width || original.height !== payload.puzzle.originalImage.height
      || changed.width !== original.width || changed.height !== original.height) throw new Error('share_ogp_source_dimensions_mismatch');
  const layout = spotDifferenceOgpLayout(original.width, original.height);
  const { width, height } = layout;
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = 247; rgba[offset + 1] = 248; rgba[offset + 2] = 246; rgba[offset + 3] = 255;
  }
  for (const [image, bounds] of [[original, layout.original], [changed, layout.changed]]) {
    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        const source = (Math.floor(y / layout.scale) * image.width + Math.floor(x / layout.scale)) * 4;
        const target = ((bounds.y + y) * width + bounds.x + x) * 4;
        const alpha = image.rgba[source + 3] / 255;
        for (let channel = 0; channel < 3; channel += 1) rgba[target + channel] = Math.round(image.rgba[source + channel] * alpha + rgba[target + channel] * (1 - alpha));
      }
    }
  }
  const bytes = png(width, height, rgba);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const name = `ogp-${hash}.png`;
  const ogpImagePath = `${sharePagePath('spot-difference', options.postId)}${name}`;
  return { html: createPuzzleSharePage(payload, { ...options, ogpImagePath }), images: [{ name, bytes }], layout };
}
