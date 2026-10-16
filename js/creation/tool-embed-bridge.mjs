import { serializeAnimationPool } from './animation-core.mjs?rev=20261016-color-capability-1';
import { EMBED_TOOL_START_EVENT } from '../site-analytics.mjs?rev=20261016-tool-shell-1';

const PROTOCOL = 'pixieed-tool-embed';
const VERSION = 1;
const COMMANDS = new Set(['activate', 'suspend', 'snapshot', 'mode-change']);
const TOOL_STARTS = new Set(['draw', 'audio', 'pixel-camera']);

function fnv1a(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Same-origin, per-iframe bridge for keeping a real editor mounted in an embed. */
export function installToolEmbedBridge({ draw, modes, windowRef = window, documentRef = document } = {}) {
  const boot = windowRef.__PIXIEED_TOOL_EMBED__;
  if (!boot?.channel || !['draw', 'camera', 'audio'].includes(boot.role) || !draw?.getTimeline || !modes?.switchMode) {
    throw new Error('PiXiEED埋め込みツールの準備ができません。');
  }
  const { channel, role } = boot;
  let commandQueue = Promise.resolve();
  let activated = false;
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
      layers: (timeline?.layers || []).map(layer => ({ id: layer.id, visible: layer.visible, locked: layer.locked, opacity: layer.opacity ?? 1, role: layer.role || null })),
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
  const execute = async (command, message) => {
    if (!COMMANDS.has(command)) throw new TypeError('未対応の埋め込み操作です。');
    if (command === 'activate') {
      // The shared shell schedules its initial audio switch asynchronously.
      // Only the first activation waits for the entry role; reopening retains
      // whichever mode the user subsequently selected.
      if (!activated) {
        await modes.switchMode(role);
        if (modes.mode !== role) throw new Error('制作モードを準備できませんでした。');
        activated = true;
      }
      modes.resumeForEmbed?.();
    } else if (command === 'suspend') modes.suspendForEmbed?.();
    else if (command === 'mode-change') {
      if (!['draw', 'camera', 'audio'].includes(message.mode)) throw new TypeError('未対応の制作モードです。');
      await modes.switchMode(message.mode);
      activated = true;
    }
    return snapshot();
  };
  const hasVisibleEscapeLayer = () => [...documentRef.querySelectorAll('dialog[open],details[open],[role="dialog"][aria-modal="true"]')]
    .some(node => {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true' || !node.getClientRects().length) return false;
      const style = windowRef.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  const escapeStartedInsideLayer = new WeakSet();
  const onMessage = event => {
    const message = event.data;
    if (event.origin !== windowRef.location.origin || event.source !== windowRef.parent || !message
        || message.kind !== PROTOCOL || message.version !== VERSION || message.channel !== channel
        || typeof message.requestId !== 'string' || !COMMANDS.has(message.command)) return;
    commandQueue = commandQueue.then(async () => {
      try {
        const state = await execute(message.command, message);
        windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, requestId: message.requestId, type: 'reply', ok: true, state }, windowRef.location.origin);
      } catch (error) {
        windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, requestId: message.requestId, type: 'reply', ok: false, error: String(error?.message || error) }, windowRef.location.origin);
      }
    });
  };
  windowRef.addEventListener('message', onMessage);
  const onExpansionState = event => {
    const message = event.data;
    if (event.origin !== windowRef.location.origin || event.source !== windowRef.parent || !message
        || message.kind !== PROTOCOL || message.version !== VERSION || message.channel !== channel
        || message.type !== 'expansion-state' || typeof message.expanded !== 'boolean') return;
    documentRef.documentElement.toggleAttribute('data-tool-embed-expanded', message.expanded);
  };
  windowRef.addEventListener('message', onExpansionState);
  const onFullscreenChange = () => {
    windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'fullscreen-state', active: Boolean(documentRef.fullscreenElement) }, windowRef.location.origin);
  };
  documentRef.addEventListener('fullscreenchange', onFullscreenChange);
  const onToolStart = event => {
    const tool = event.detail?.tool;
    if (!TOOL_STARTS.has(tool)) return;
    windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'tool-start', tool }, windowRef.location.origin);
  };
  documentRef.addEventListener(EMBED_TOOL_START_EVENT, onToolStart);
  const announceMode = () => {
    const mode = modes.mode;
    if (['draw', 'camera', 'audio'].includes(mode)) {
      windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'mode-state', mode }, windowRef.location.origin);
    }
  };
  const modeObserver = windowRef.MutationObserver ? new windowRef.MutationObserver(announceMode) : null;
  if (documentRef.body) modeObserver?.observe(documentRef.body, { attributes: true, attributeFilter: ['data-creation-mode'] });
  const announceRoute = () => {
    windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'route-change', pathname: windowRef.location.pathname, search: windowRef.location.search, hash: windowRef.location.hash }, windowRef.location.origin);
  };
  const historyRef = windowRef.history;
  const originalReplaceState = historyRef.replaceState;
  const ownReplaceState = Object.getOwnPropertyDescriptor(historyRef, 'replaceState');
  const wrappedReplaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    announceRoute();
    return result;
  };
  historyRef.replaceState = wrappedReplaceState;
  windowRef.addEventListener('hashchange', announceRoute);
  windowRef.addEventListener('popstate', announceRoute);
  // Snapshot the visible layer before a dialog's own Escape handler can hide it.
  documentRef.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && hasVisibleEscapeLayer()) {
      escapeStartedInsideLayer.add(event);
    }
  }, true);
  documentRef.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented
        && !escapeStartedInsideLayer.has(event) && !hasVisibleEscapeLayer()) {
      windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'escape-request' }, windowRef.location.origin);
    }
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const focusable = [...documentRef.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    if ((!event.shiftKey && event.target === focusable.at(-1)) || (event.shiftKey && event.target === focusable[0])) {
      event.preventDefault();
      windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'focus-edge', direction: event.shiftKey ? 'backward' : 'forward' }, windowRef.location.origin);
    }
  });
  const bridge = Object.freeze({ role, channel, getState: snapshot, dispose() {
    windowRef.removeEventListener('message', onMessage); windowRef.removeEventListener('message', onExpansionState);
    documentRef.removeEventListener('fullscreenchange', onFullscreenChange);
    documentRef.removeEventListener(EMBED_TOOL_START_EVENT, onToolStart);
    modeObserver?.disconnect();
    windowRef.removeEventListener('hashchange', announceRoute); windowRef.removeEventListener('popstate', announceRoute);
    if (historyRef.replaceState === wrappedReplaceState) {
      if (ownReplaceState) Object.defineProperty(historyRef, 'replaceState', ownReplaceState);
      else delete historyRef.replaceState;
    }
  } });
  windowRef.__PIXIEED_TOOL_EMBED_BRIDGE__ = bridge;
  const announce = () => windowRef.parent.postMessage({ kind: PROTOCOL, version: VERSION, channel, type: 'ready', role, mode: modes.mode }, windowRef.location.origin);
  if (documentRef.readyState === 'complete') announce(); else windowRef.addEventListener('load', announce, { once: true });
  return bridge;
}
