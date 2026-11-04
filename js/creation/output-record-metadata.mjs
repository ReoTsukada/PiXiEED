/** Pure record metadata validation; persistence schema and field rules are unchanged. */
export function sanitizeOutputMetadata(metadata = {}) {
  const allowed = ['includeMusicLayer', 'includeAudio', 'visualFrameDurationsMs', 'width', 'height', 'outputWidth', 'outputHeight', 'durationSeconds', 'durationIsApproximate', 'sourceSeconds', 'paddingSeconds', 'staticFrameIndex', 'description', 'previewOnly', 'scale', 'defaultScale', 'frameCount', 'frameDelayMs', 'loopCount', 'totalPlays', 'sampleRate', 'loops', 'jpegQuality', 'aspectLocked', 'pixelOriginChoice', 'userFilename', 'cameraSize', 'cameraRatio', 'cameraColors', 'cameraFinish', 'cameraFacing', 'cameraEdges', 'cameraPaletteMode', 'cameraGradientMode', 'cameraDitherPattern', 'cameraSurfaceSimplify', 'cameraZoom', 'cameraMiniature', 'cameraCustomLook', 'cameraTone'];
  const result = {};
  for (const key of allowed) {
    const value = metadata?.[key];
    if (['includeMusicLayer','includeAudio'].includes(key) && typeof value === 'boolean') result[key] = value;
    else if (key === 'visualFrameDurationsMs' && Array.isArray(value) && value.length >= 1 && value.length <= 128 && value.every(ms=>Number.isFinite(ms)&&ms>=1&&ms<=60000)) result[key] = [...value];
    else if (key === 'description' && typeof value === 'string') result[key] = value.slice(0, 180);
    else if (key === 'previewOnly' && typeof value === 'boolean') result[key] = value;
    else if (key === 'durationIsApproximate' && typeof value === 'boolean') result[key] = value;
    else if (key === 'staticFrameIndex') { if (Number.isSafeInteger(value) && value >= 0 && value < 600) result[key] = value; }
    else if (['sourceSeconds', 'paddingSeconds'].includes(key)) { if (Number.isFinite(value) && value >= 0 && value <= 121) result[key] = Math.round(value * 1000) / 1000; }
    else if (key === 'aspectLocked' && typeof value === 'boolean') result[key] = value;
    else if (key === 'pixelOriginChoice') { if (['original', 'custom'].includes(value)) result[key] = value; }
    else if (key === 'userFilename' && value === true) result[key] = true;
    else if (['cameraRatio', 'cameraColors', 'cameraFinish', 'cameraFacing', 'cameraPaletteMode', 'cameraGradientMode', 'cameraDitherPattern'].includes(key) && typeof value === 'string' && value.length <= 24) result[key] = value;
    else if (key === 'cameraCustomLook' && typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)) result[key] = value;
    else if (['cameraEdges', 'cameraMiniature'].includes(key) && typeof value === 'boolean') result[key] = value;
    else if (key === 'cameraTone' && value && typeof value === 'object' && !Array.isArray(value)) {
      const tone = {};
      for (const name of ['brightness', 'exposure', 'saturation', 'shadows', 'contrast', 'whiteBalance', 'zoom']) {
        const amount = value[name];
        if (Number.isFinite(amount) && amount >= -100 && amount <= 100) tone[name] = Math.round(amount);
      }
      if (Object.keys(tone).length) result[key] = tone;
    }
    else if (['loopCount', 'totalPlays'].includes(key) && Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) result[key] = value;
    else if (key !== 'description' && Number.isFinite(value) && value >= 0) result[key] = Math.round(value * (key === 'durationSeconds' ? 10 : 1)) / (key === 'durationSeconds' ? 10 : 1);
  }
  return result;
}
