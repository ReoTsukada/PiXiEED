import { serializeAnimationPool } from './animation-core.mjs?rev=20261016-color-capability-1';

function fnv1a(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function sha256(bytes, cryptoRef = crypto) {
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Return the same deterministic state shape used by the iframe bridge. */
export async function getCreationSnapshot({ draw, modes, role = 'draw', documentRef = document, cryptoRef = crypto } = {}) {
  const timeline = draw.getTimeline();
  const image = draw.getImage?.();
  const pixels = image?.rgba ? new Uint8Array(image.rgba.buffer, image.rgba.byteOffset, image.rgba.byteLength) : new Uint8Array();
  const tileHashes = new Map();
  const cels = new Map();
  for (const tile of serializeAnimationPool(timeline)) {
    if (tile.bytes && !tileHashes.has(tile.tileId)) tileHashes.set(tile.tileId, await sha256(tile.bytes, cryptoRef));
    const key = JSON.stringify([tile.frameId, tile.layerId]);
    const tiles = cels.get(key) || [];
    tiles.push({ x: tile.x, y: tile.y, width: tile.width, height: tile.height, hash: tileHashes.get(tile.tileId) || null });
    cels.set(key, tiles);
  }
  const celRows = [];
  for (const frame of timeline.frames || []) for (const layer of timeline.layers || []) {
    const tiles = (cels.get(JSON.stringify([frame.id, layer.id])) || []).sort((a, b) => a.y - b.y || a.x - b.x);
    celRows.push({ frameId: frame.id, layerId: layer.id, tiles });
  }
  const canonical = {
    schemaVersion: timeline?.schemaVersion || null, width: timeline?.width || 0, height: timeline?.height || 0,
    palette: timeline?.palette || [],
    frames: (timeline?.frames || []).map(frame => ({ id: frame.id, durationMs: frame.durationMs })),
    layers: (timeline?.layers || []).map(layer => ({ id: layer.id, visible: layer.visible, locked: layer.locked, opacity: layer.opacity ?? 1, role: layer.role || null })),
    cels: celRows
  };
  const timelineHash = await sha256(new TextEncoder().encode(JSON.stringify(canonical)), cryptoRef);
  return {
    role,
    mode: modes.mode,
    image: { width: image?.width || 0, height: image?.height || 0, hash: fnv1a(pixels) },
    timeline: {
      width: timeline?.width || 0,
      height: timeline?.height || 0,
      frames: canonical.frames,
      layers: canonical.layers,
      frameCount: timeline?.frames?.length || 0,
      layerCount: timeline?.layers?.length || 0,
      celCount: celRows.length,
      tileCount: celRows.reduce((sum, cel) => sum + cel.tiles.length, 0),
      hash: timelineHash,
      history: draw.getTimelineHistoryPosition?.(timeline) || 'unavailable'
    },
    controls: {
      undoDisabled: Boolean(documentRef.querySelector('#draw-undo')?.disabled),
      redoDisabled: Boolean(documentRef.querySelector('#draw-redo')?.disabled)
    }
  };
}
