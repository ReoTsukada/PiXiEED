import { serializeAnimationPool } from './animation-core.mjs?rev=20261012-animation-core-contract-1';

const PROTOCOL = 'pixieed-tool-embed';
const VERSION = 1;
const COMMANDS = new Set(['activate', 'suspend', 'snapshot']);

function fnv1a(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Same-origin, per-iframe bridge for keeping a real editor mounted in an embed. */
export function installToolEmbedBridge({ draw, modes, windowRef = window, documentRef = document } = {}) {
  const boot = windowRef.__PIXIEED_TOOL_EMBED__;
  if (!boot?.channel || !['draw', 'camera'].includes(boot.role) || !draw?.getTimeline || !modes?.switchMode) {
    throw new Error('PiXiEED埋め込みツールの準備ができません。');
  }
  const { channel, role } = boot;
  let commandQueue = Promise.resolve();
  async function sha256(bytes) {
    const digest = await windowRef.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const snapshot = async () => {
    const timeline = draw.getTimeline();
    const image = draw.getImage?.();
    const pixels = image?.rgba ? new Uint8Array(image.rgba.buffer, image.rgba.byteOffset, image.rgba.byteLength) : new Uint8Array();
    const tileHashes = new Map();
    const cels = new Map();
    for (const tile of serializeAnimationPool(timeline)) {
      if (tile.bytes && !tileHashes.has(tile.tileId)) tileHashes.set(tile.tileId, await sha256(tile.bytes));
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
      layers: (timeline?.layers || []).map(layer => ({ id: layer.id, visible: layer.visible, locked: layer.locked, role: layer.role || null })),
      cels: celRows
    };
    const timelineHash = await sha256(new TextEncoder().encode(JSON.stringify(canonical)));
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
  };
  const execute = async command => {
    if (!COMMANDS.has(command)) throw new TypeError('未対応の埋め込み操作です。');
    if (command === 'activate') {
      modes.resumeForEmbed?.();
    } else if (command === 'suspend') modes.suspendForEmbed?.();
    return snapshot();
  };
  const onMessage = event => {
    const message = event.data;
    if (event.origin !== windowRef.location.origin || event.source !== windowRef.parent || !message
        || message.kind !== PROTOCOL || message.version !== VERSION || message.channel !== channel
        || typeof message.requestId !== 'string' || !COMMANDS.has(message.command)) return;
    commandQueue = commandQueue.then(async () => {
      try {
        const state = await execute(message.command);
        windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, requestId: message.requestId, type: 'reply', ok: true, state }, windowRef.location.origin);
      } catch (error) {
        windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, requestId: message.requestId, type: 'reply', ok: false, error: String(error?.message || error) }, windowRef.location.origin);
      }
    });
  };
  windowRef.addEventListener('message', onMessage);
  documentRef.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !documentRef.querySelector('dialog[open],details[open], [role="dialog"][aria-modal="true"]')) {
      windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'close-request' }, windowRef.location.origin);
    }
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const focusable = [...documentRef.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    if ((!event.shiftKey && event.target === focusable.at(-1)) || (event.shiftKey && event.target === focusable[0])) {
      event.preventDefault();
      windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'focus-edge', direction: event.shiftKey ? 'backward' : 'forward' }, windowRef.location.origin);
    }
  });
  const bridge = Object.freeze({ role, channel, getState: snapshot, dispose() { windowRef.removeEventListener('message', onMessage); } });
  windowRef.__PIXIEED_TOOL_EMBED_BRIDGE__ = bridge;
  const announce = () => windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'ready', role }, windowRef.location.origin);
  if (documentRef.readyState === 'complete') announce(); else windowRef.addEventListener('load', announce, { once: true });
  return bridge;
}
