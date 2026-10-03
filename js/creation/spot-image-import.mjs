import { createSpotDifferenceImagePair, decodeDrawImageFile } from './draw-import.mjs?rev=20261002-inline-draw-1';

export async function decodeSpotImagePair(beforeFile, afterFile, options = {}) {
  if (!beforeFile || !afterFile) throw new TypeError('元の絵と変更後の絵を選んでください。');
  const decode = (file) => decodeDrawImageFile(file, { documentRef: options.documentRef, keepScale: true, inferScale: false });
  const [before, after] = await Promise.all([decode(beforeFile), decode(afterFile)]);
  return createSpotDifferenceImagePair(before, after);
}

export async function decodeSpotSingleImage(file, options = {}) {
  if (!file) throw new TypeError('画像を選んでください。');
  const image = await decodeDrawImageFile(file, { documentRef: options.documentRef, keepScale: true, inferScale: false });
  return createSpotDifferenceImagePair(image, image);
}
