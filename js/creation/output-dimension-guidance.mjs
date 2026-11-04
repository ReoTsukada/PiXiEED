/** Explain animation limits without modifying a user's requested dimensions. */
export function outputDimensionGuidance({ format, width, height, frameCount = 1 }) {
  if (!['gif', 'apng'].includes(format)) return null;
  if (![width, height, frameCount].every(Number.isSafeInteger) || width < 1 || height < 1 || frameCount < 1 || frameCount > 600) return null;
  const maxPixels = 8_000_000, maxEdge = 4096;
  if (width <= maxEdge && height <= maxEdge && width * height * frameCount <= maxPixels) return null;
  const ratio = Math.min(1, maxEdge / width, maxEdge / height, Math.sqrt(maxPixels / frameCount / width / height));
  const suggestedWidth = Math.max(1, Math.floor(width * ratio));
  const suggestedHeight = Math.max(1, Math.floor(height * ratio));
  const label = format.toUpperCase();
  return Object.freeze({ suggestedWidth, suggestedHeight,
    summary: `${label}のサイズ上限を超えています。出力サイズから${suggestedWidth} × ${suggestedHeight}px以下に変更してください。`,
    message: `${label}は各辺4096px・全${frameCount}コマ合計800万画素以内です。現在の${width} × ${height}pxでは作成できません。サイズ欄で${suggestedWidth} × ${suggestedHeight}px以下に変更するか、対応する別の形式を選んでください。寸法・コマ数は自動変更していません。` });
}
