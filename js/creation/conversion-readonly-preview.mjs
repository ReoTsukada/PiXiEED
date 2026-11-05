/** Run a snapshotted preview encoder without owning or mutating page state. */
export async function runReadonlyPreview(snapshot, encode, signal) {
  const abort = () => {
    if (signal?.aborted) throw new DOMException('プレビューを中止しました。', 'AbortError');
  };
  abort();
  const result = await encode(snapshot, signal);
  abort();
  const blob = result?.blob || result;
  if (!blob || typeof blob.size !== 'number') throw new TypeError('プレビュー画像を作成できませんでした。');
  return { blob, filename: snapshot.filename, format: snapshot.format };
}

/** Encode one captured raster still with the exact output-encoder options. */
export function runReadonlyRasterPreview(snapshot, encodeOutput, encodeRaster, signal) {
  return runReadonlyPreview(snapshot, captured => encodeOutput({
    format: captured.format, frames: [captured.frame], width: captured.width, height: captured.height,
    background: captured.background, pngBackground: captured.pngBackground,
    quality: captured.quality, totalPlays: 1,
  }, { encodeRaster, signal }), signal);
}


/** Preserve native still-export bounds; the smaller budget only gates automatic previews. */
export function readonlyPreviewBounds(frame, width, height, frameCount = 1) {
  const dimensions=[frame?.width,frame?.height,width,height];
  const valid=dimensions.every(value=>Number.isSafeInteger(value)&&value>0);
  const sourcePixels=(frame?.width||0)*(frame?.height||0),outputPixels=width*height;
  const nativeSupported=valid&&frame.width<=4096&&frame.height<=4096&&width<=4096&&height<=4096
    &&sourcePixels<=8_000_000&&outputPixels<=8_000_000;
  return {supported:nativeSupported,automatic:nativeSupported&&frameCount===1&&sourcePixels<=1_000_000&&outputPixels<=1_000_000};
}
