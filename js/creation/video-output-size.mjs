function abortError() {
  try { return new DOMException('動画の確認を中止しました。', 'AbortError'); }
  catch { const error = new Error('動画の確認を中止しました。'); error.name = 'AbortError'; return error; }
}

/** Explicit dimensions are never rounded or silently changed for a codec. */
export function validateVideoOutputSize(outputSize, { mimeType = '' } = {}) {
  if (outputSize == null) return null;
  const { width, height } = outputSize;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16 * 1024 * 1024) {
    throw new RangeError('動画の出力サイズは各辺1〜4096px、合計16777216画素以内の整数で指定してください。素材と設定は保持されています。');
  }
  // This is the tool's conservative MP4 policy, not a claim about every codec.
  if (String(mimeType).split(';', 1)[0].trim().toLowerCase() === 'video/mp4' && (width % 2 || height % 2)) {
    throw new RangeError('MP4の出力サイズは幅・高さとも偶数で指定してください。奇数サイズを使う場合はWebMを選んでください。素材と設定は保持されています。');
  }
  return Object.freeze({ width, height });
}

/** Read the locally encoded Blob's metadata without playing, saving, or sending it. */
export function verifyEncodedVideoSize(blob, expected, {
  signal, documentRef = globalThis.document, URLImpl = globalThis.URL, timeoutMs = 10000,
  setTimeoutImpl = globalThis.setTimeout.bind(globalThis), clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis)
} = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  let target;
  try { target = validateVideoOutputSize(expected, { mimeType: blob?.type }); }
  catch (error) { return Promise.reject(error); }
  if (!target || !blob?.size || !documentRef?.createElement || !URLImpl?.createObjectURL || !URLImpl?.revokeObjectURL) {
    return Promise.reject(new Error('作成した動画のサイズを確認できません。このブラウザーでは動画を確定できません。素材と設定は保持されています。'));
  }
  return new Promise((resolve, reject) => {
    let video; let url; let timer; let settled = false;
    const cleanup = () => {
      if (timer !== undefined) clearTimeoutImpl(timer);
      signal?.removeEventListener('abort', onAbort);
      video?.removeEventListener?.('loadedmetadata', onMetadata);
      video?.removeEventListener?.('error', onError);
      try { video?.pause?.(); } catch { /* cleanup only */ }
      try { video?.removeAttribute?.('src'); video?.load?.(); } catch { /* cleanup only */ }
      if (url !== undefined) URLImpl.revokeObjectURL(url);
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true; cleanup();
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => finish(abortError());
    const onError = () => finish(new Error('作成した動画をデコードできず、出力サイズを確認できませんでした。別の動画形式を選ぶか再試行してください。素材と設定は保持されています。'));
    const onMetadata = () => {
      if (signal?.aborted) { onAbort(); return; }
      const width = video.videoWidth; const height = video.videoHeight;
      if (width !== target.width || height !== target.height) {
        finish(new Error(`動画の実際のサイズ（${width}×${height}px）が指定サイズ（${target.width}×${target.height}px）と一致しないため確定しませんでした。別の動画形式またはサイズを選んでください。素材と設定は保持されています。`));
      } else finish(null, Object.freeze({ width, height }));
    };
    try {
      video = documentRef.createElement('video');
      video.preload = 'metadata'; video.muted = true; video.playsInline = true;
      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      url = URLImpl.createObjectURL(blob);
      timer = setTimeoutImpl(() => finish(new Error('作成した動画のサイズ確認が時間内に終わりませんでした。再試行するか別の動画形式を選んでください。素材と設定は保持されています。')), timeoutMs);
      video.src = url;
      video.load?.();
    } catch (error) { finish(error); }
  });
}
