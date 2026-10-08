const MAX_FRAME_EDGE = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_GIF_FRAMES = 600;
const MAX_GIF_FRAME_PIXELS = 8_000_000;

function validateFrame(frame) {
  if (!Number.isSafeInteger(frame?.width) || !Number.isSafeInteger(frame?.height)
    || frame.width < 1 || frame.height < 1 || frame.width > MAX_FRAME_EDGE || frame.height > MAX_FRAME_EDGE
    || frame.width * frame.height > MAX_IMAGE_PIXELS
    || !ArrayBuffer.isView(frame.data) || frame.data.BYTES_PER_ELEMENT !== 1
    || frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('撮影画像のサイズやデータを確認できません。');
  }
}

function cloneFrames(frames, delayMs) {
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > MAX_GIF_FRAMES) {
    throw new TypeError('GIFのフレーム数を確認できません。');
  }
  const width = frames[0]?.width;
  const height = frames[0]?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > MAX_FRAME_EDGE || height > MAX_FRAME_EDGE || width * height * frames.length > MAX_GIF_FRAME_PIXELS) {
    throw new TypeError('GIFの画像サイズを確認できません。');
  }
  if (!Number.isFinite(delayMs) || delayMs < 20 || delayMs > 655350) {
    throw new TypeError('GIFの再生間隔を確認できません。');
  }
  return frames.map((frame) => {
    if (frame?.width !== width || frame?.height !== height || !ArrayBuffer.isView(frame.data)
      || frame.data.BYTES_PER_ELEMENT !== 1 || frame.data.length !== width * height * 4) {
      throw new TypeError('GIFのフレームデータを確認できません。');
    }
    return { width, height, data: Uint8ClampedArray.from(frame.data), delayMs };
  });
}

function cameraMetadata(settings = {}) {
  const metadata = {
    cameraRatio: settings.ratio,
    cameraSize: settings.size,
    cameraColors: settings.colorDepth,
    cameraPaletteMode: settings.paletteMode,
    cameraGradientMode: settings.gradientMode,
    cameraDitherPattern: settings.ditherPattern,
    cameraSurfaceSimplify: settings.surfaceSimplify,
    cameraZoom: settings.zoom,
    cameraMiniature: settings.miniature,
    cameraFacing: settings.facing,
    cameraCustomLook: settings.customLook,
    cameraTone: settings.camera
  };
  return metadata;
}

/** Build the exact options used by the PiXiEELENS save action. */
export function createPixelLensOutputOptions({ blob, filename, returnUrl, frame, gifFrames = null, outputScale = 1, settings = {} } = {}) {
  validateFrame(frame);
  const frames = gifFrames == null ? null : cloneFrames(gifFrames, 1000 / (gifFrames.fps || 20));
  if (frames && (frames[0].width !== frame.width || frames[0].height !== frame.height)) {
    throw new TypeError('GIFとプレビュー画像のサイズが一致しません。');
  }
  if (!Number.isSafeInteger(outputScale) || outputScale < 1 || frame.width * outputScale > MAX_FRAME_EDGE || frame.height * outputScale > MAX_FRAME_EDGE) {
    throw new TypeError('出力倍率を確認できません。');
  }
  const width = frames?.[0].width ?? frame.width;
  const height = frames?.[0].height ?? frame.height;
  const delayMs = frames?.[0].delayMs;
  return {
    blob,
    filename,
    returnUrl,
    returnOutputId: true,
    title: frames ? 'アニメーションを確認' : '画像を確認',
    source: 'ドット絵カメラ',
    metadata: {
      width, height, defaultScale: outputScale,
      ...(frames ? { durationSeconds: frames.length * delayMs / 1000, frameCount: frames.length, frameDelayMs: delayMs, loopCount: 0 } : {}),
      ...cameraMetadata(settings)
    },
    ...(frames ? { mediaSource: { kind: 'gif-frames', frames, delayMs, loopCount: 0 } } : {})
  };
}

function validCameraSettings(metadata = {}) {
  const allowedDepths = new Set(['gray', '256', 'full', ...Array.from({ length: 15 }, (_, index) => String(index + 2))]);
  const allowedRatios = new Set(['screen', '1:1', '3:4', '9:16', '4:3', '16:9']);
  const settings = {};
  if (allowedRatios.has(metadata.cameraRatio)) settings.ratio = metadata.cameraRatio;
  if (Number.isSafeInteger(metadata.cameraSize) && [16, 32, 64, 96, 128, 160, 256].includes(metadata.cameraSize)) settings.size = metadata.cameraSize;
  if (allowedDepths.has(metadata.cameraColors)) settings.colorDepth = metadata.cameraColors;
  if (metadata.cameraPaletteMode === 'gameboy' || metadata.cameraPaletteMode === 'source') settings.paletteMode = metadata.cameraPaletteMode;
  if (metadata.cameraGradientMode === 'dither' || metadata.cameraGradientMode === 'none') settings.gradientMode = metadata.cameraGradientMode;
  if (typeof metadata.cameraDitherPattern === 'string' && metadata.cameraDitherPattern.length <= 24) settings.ditherPattern = metadata.cameraDitherPattern;
  if (Number.isFinite(metadata.cameraSurfaceSimplify) && metadata.cameraSurfaceSimplify >= 0 && metadata.cameraSurfaceSimplify <= 100) settings.surfaceSimplify = metadata.cameraSurfaceSimplify;
  if (Number.isFinite(metadata.cameraZoom) && metadata.cameraZoom >= 1 && metadata.cameraZoom <= 40) settings.zoom = metadata.cameraZoom;
  if (typeof metadata.cameraMiniature === 'boolean') settings.miniature = metadata.cameraMiniature;
  if (metadata.cameraFacing === 'user' || metadata.cameraFacing === 'environment') settings.facing = metadata.cameraFacing;
  if (typeof metadata.cameraCustomLook === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(metadata.cameraCustomLook)) settings.customLook = metadata.cameraCustomLook;
  const tone = metadata.cameraTone;
  if (tone && typeof tone === 'object' && !Array.isArray(tone)) {
    const cleanTone = {};
    for (const key of ['brightness', 'exposure', 'saturation', 'shadows', 'contrast', 'whiteBalance', 'zoom']) {
      if (Number.isFinite(tone[key]) && tone[key] >= -100 && tone[key] <= 100) cleanTone[key] = tone[key];
    }
    if (Object.keys(cleanTone).length) settings.camera = cleanTone;
  }
  return settings;
}

/** Validate and copy a saved camera result before the editor changes its current capture. */
export function preparePixelLensOutputRestore(entry) {
  if (entry?.source !== 'ドット絵カメラ' || !entry.sourceBlob || !Number.isSafeInteger(entry.metadata?.width)
    || !Number.isSafeInteger(entry.metadata?.height) || entry.metadata.width < 1 || entry.metadata.height < 1
    || entry.metadata.width > MAX_FRAME_EDGE || entry.metadata.height > MAX_FRAME_EDGE
    || entry.metadata.width * entry.metadata.height > MAX_IMAGE_PIXELS) {
    throw new TypeError('この撮影データをカメラで開けません。もう一度撮影してください。');
  }
  const filename = String(entry.sourceFilename || '');
  const scale = entry.metadata.defaultScale;
  if (!Number.isSafeInteger(scale) || scale < 1 || entry.metadata.width * scale > MAX_FRAME_EDGE || entry.metadata.height * scale > MAX_FRAME_EDGE) {
    throw new TypeError('撮影画像の出力倍率を確認できません。');
  }
  const common = { filename, blob: entry.sourceBlob, width: entry.metadata.width, height: entry.metadata.height, scale, settings: validCameraSettings(entry.metadata) };
  if (entry.mime === 'image/png' && filename.toLowerCase().endsWith('.png')) return { ...common, kind: 'png' };
  if (entry.mime !== 'image/gif' || !filename.toLowerCase().endsWith('.gif')) {
    throw new TypeError('この撮影形式はカメラで開けません。もう一度撮影してください。');
  }
  const media = entry.mediaSource;
  if (media?.kind !== 'gif-frames' || media.width !== common.width || media.height !== common.height
    || media.loopCount !== 0 || !Array.isArray(media.frames) || media.frames.length < 2) {
    throw new TypeError('GIFの撮影フレームを確認できません。もう一度撮影してください。');
  }
  const delays = new Set(media.frames.map((frame) => frame?.delayMs));
  if (delays.size !== 1) throw new TypeError('GIFの再生間隔を確認できません。');
  const [delayMs] = delays;
  const frames = cloneFrames(media.frames, delayMs);
  if (frames[0].width !== common.width || frames[0].height !== common.height) {
    throw new TypeError('GIFの撮影サイズを確認できません。');
  }
  frames.fps = 1000 / delayMs;
  return { ...common, kind: 'gif', frames, delayMs };
}
