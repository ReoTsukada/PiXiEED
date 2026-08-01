(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const MAX_BYTES = 52428800;
  const MAX_CELLS = 268435456;

  function fail(reason) { throw new Error(`PiXiSYNC raster asset: ${reason}`); }
  function assertId(value, field) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 128) fail(`invalid-${field}`);
  }
  function assertLayer(layer) {
    if (!layer || typeof layer !== 'object') fail('invalid-layer');
    const keys = Object.keys(layer).sort();
    if (keys.join(',') !== 'blendMode,id,name,opacity,pixels,trackId') fail('invalid-layer-keys');
    assertId(layer.id, 'layer-id'); assertId(layer.trackId, 'track-id');
    if (typeof layer.name !== 'string' || layer.name.length > 120) fail('invalid-layer-name');
    if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) fail('invalid-layer-opacity');
    if (typeof layer.blendMode !== 'string' || !layer.blendMode || layer.blendMode.length > 32) fail('invalid-layer-blend-mode');
    if (!Array.isArray(layer.pixels)) fail('invalid-layer-pixels');
  }
  function validate(asset) {
    if (!asset || typeof asset !== 'object') fail('invalid-asset');
    const keys = Object.keys(asset).sort();
    if (keys.join(',') !== 'canvasId,frames,height,kind,version,width') fail('invalid-asset-keys');
    if (asset.version !== 1 || !['layer-track-remove', 'frame-remove', 'canvas-resize-lost'].includes(asset.kind)) fail('unsupported-asset');
    assertId(asset.canvasId, 'canvas-id');
    for (const field of ['width', 'height']) {
      if (!Number.isInteger(asset[field]) || asset[field] < 1 || asset[field] > 16384) fail(`invalid-${field}`);
    }
    const cellCount = asset.width * asset.height;
    if (cellCount > MAX_CELLS || !Array.isArray(asset.frames) || !asset.frames.length || asset.frames.length > 4096) fail('invalid-frames');
    const frameIds = new Set(); const layerIds = new Set();
    asset.frames.forEach(frame => {
      if (!frame || typeof frame !== 'object' || Object.keys(frame).sort().join(',') !== 'duration,frameId,layers,name') fail('invalid-frame');
      assertId(frame.frameId, 'frame-id');
      if (typeof frame.name !== 'string' || frame.name.length > 120) fail('invalid-frame-name');
      if (!Number.isFinite(frame.duration) || frame.duration < 1 || frame.duration > 655350) fail('invalid-frame-duration');
      if (frameIds.has(frame.frameId) || !Array.isArray(frame.layers) || !frame.layers.length || frame.layers.length > 4096) fail('invalid-frame-layers');
      frameIds.add(frame.frameId);
      frame.layers.forEach(layer => {
        assertLayer(layer);
        if (layerIds.has(layer.id)) fail('duplicate-layer-id');
        layerIds.add(layer.id);
        let previous = -1;
        layer.pixels.forEach(pixel => {
          if (!Array.isArray(pixel) || pixel.length !== 2 || !Number.isInteger(pixel[0]) || !Number.isInteger(pixel[1])
            || pixel[0] < 0 || pixel[0] >= cellCount || pixel[0] <= previous || pixel[1] < 1 || pixel[1] > 254) fail('invalid-pixel');
          previous = pixel[0];
        });
      });
    });
    return asset;
  }
  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((out, key) => { out[key] = canonicalize(value[key]); return out; }, {});
  }
  function encode(asset) {
    validate(asset);
    const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(asset)));
    if (bytes.length < 2 || bytes.length > MAX_BYTES) fail('asset-size-out-of-range');
    return bytes;
  }
  function decode(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 2 || bytes.length > MAX_BYTES) fail('asset-size-out-of-range');
    try { return validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
    catch (error) { if (String(error?.message || '').startsWith('PiXiSYNC raster asset:')) throw error; fail('invalid-json'); }
  }
  function collectIndexedPixels(layer, width, height) {
    const indices = layer?.indices;
    const cellCount = width * height;
    if (!(indices instanceof Int16Array || indices instanceof Uint8Array) || indices.length !== cellCount) fail('non-materialized-layer');
    const pixels = [];
    for (let index = 0; index < indices.length; index += 1) {
      const value = Number(indices[index]);
      if (value > 0) pixels.push([index, value]);
    }
    return pixels;
  }
  root.pixisyncRasterAssetUtils = Object.freeze({ MAX_BYTES, validate, encode, decode, collectIndexedPixels });
})();
