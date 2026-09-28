import { audioSongPixels } from './audio-core.mjs?rev=20260928-dot-music-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';

/** Integer scaling preserves every dot and never includes the playhead or controls. */
export function audioImageExportSize(width, height, longEdge = 1024) {
  if (![width, height, longEdge].every(Number.isInteger) || width < 1 || height < 1 || longEdge < 1 || longEdge > 4096) throw new RangeError('画像サイズが不正です');
  const scale = Math.max(1, Math.floor(longEdge / Math.max(width, height)));
  return { width: width * scale, height: height * scale, scale };
}

export async function exportAudioImage(song, { document = globalThis.document, image = null } = {}) {
  const songPixels = audioSongPixels(song);
  const width = image?.width ?? songPixels.width; const height = image?.height ?? songPixels.height;
  if (width !== songPixels.width || height !== songPixels.height || (image && (!(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== width * height * 4))) throw new TypeError('書き出す絵と音楽キャンバスのサイズが一致しません。');
  const source = document.createElement('canvas'); source.width = width; source.height = height;
  if (image) {
    const context = source.getContext('2d'); const pixels = context.createImageData(width, height); pixels.data.set(image.rgba); context.putImageData(pixels, 0, 0);
  } else createPixelCanvasSurface(source, { alpha: false, emptyColor: '#ffffff' }).paint(songPixels.pixels, songPixels.palette);
  const size = audioImageExportSize(width, height);
  const output = document.createElement('canvas'); output.width = size.width; output.height = size.height;
  const context = output.getContext('2d'); context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, size.width, size.height);
  const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('画像を保存できませんでした。');
  return { blob, width: size.width, height: size.height };
}
