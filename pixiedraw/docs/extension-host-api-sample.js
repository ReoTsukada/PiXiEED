/*
 * PiXiEEDraw Extension Host API Sample
 *
 * 目的:
 * - 既存ツール欄へ拡張ツールを追加する
 * - キャンバス入力を受け取る
 * - オーバーレイ描画を行う
 *
 * 注意:
 * - これはメイン絵を直接変更しません
 * - drawPixels() は拡張オーバーレイ表示です
 * - 外部通信や Supabase 接続はできません
 */

(() => {
  'use strict';

  const TOOL_ID = 'host-sample';
  const STORAGE_KEY = 'host-api-sample-color-v1';
  const state = {
    drawing: false,
    color: { r: 255, g: 210, b: 122, a: 255 },
    paintedKeys: new Set(),
  };

  function toKey(x, y) {
    return `${x},${y}`;
  }

  function parseHexColor(hex) {
    const text = String(hex || '').trim();
    const normalized = /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#ffd27a';
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16),
      a: 255,
    };
  }

  function toHex(color) {
    const value = color && typeof color === 'object' ? color : state.color;
    return `#${[value.r, value.g, value.b].map(channel => {
      const safe = Math.max(0, Math.min(255, Number(channel) || 0));
      return safe.toString(16).padStart(2, '0');
    }).join('')}`;
  }

  function makePlusPixels(cx, cy) {
    return [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx + 1, y: cy },
      { x: cx, y: cy - 1 },
      { x: cx, y: cy + 1 },
    ];
  }

  function rememberPixels(pixels) {
    pixels.forEach(pixel => {
      state.paintedKeys.add(toKey(pixel.x, pixel.y));
    });
  }

  function renderPanel(root, colorInput, stats) {
    const context = api.getContext();
    stats.textContent = [
      `activeTool=${context.activeTool || 'none'}`,
      `extensionTool=${context.activeLocalToolId || 'none'}`,
      `overlay=${context.localPaintPixelCount || 0}`,
    ].join(' / ');
    colorInput.value = toHex(state.color);
    api.ui.mount(root);
  }

  async function boot() {
    const saved = await api.storage.get(STORAGE_KEY, null);
    if (saved && typeof saved === 'object') {
      state.color = {
        r: Math.max(0, Math.min(255, Number(saved.r) || state.color.r)),
        g: Math.max(0, Math.min(255, Number(saved.g) || state.color.g)),
        b: Math.max(0, Math.min(255, Number(saved.b) || state.color.b)),
        a: 255,
      };
    }

    api.ui.setTitle('Host API Sample');
    api.ui.setSubtitle('既存ツール欄・入力取得・オーバーレイ描画の最小例');
    api.ui.addStyles(`
      .host-api-sample {
        display: grid;
        gap: 8px;
      }
      .host-api-sample__row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .host-api-sample__meta {
        color: rgba(234, 248, 255, 0.72);
      }
      .host-api-sample__color {
        width: 44px;
        height: 32px;
        padding: 0;
        border: none;
        background: transparent;
      }
      .host-api-sample__button {
        min-height: 32px;
      }
    `);

    const root = api.ui.el('div', { className: 'host-api-sample' });
    const intro = api.ui.el('p', {
      className: 'host-api-sample__meta',
      text: '下の拡張ツールを有効にすると、キャンバス上で十字オーバーレイを描けます。',
    });
    const row = api.ui.el('div', { className: 'host-api-sample__row' });
    const colorInput = api.ui.el('input', {
      className: 'host-api-sample__color',
      type: 'color',
      value: toHex(state.color),
    });
    const activateButton = api.ui.el('button', {
      className: 'host-api-sample__button',
      type: 'button',
      text: '拡張ツールを有効化',
    });
    const clearButton = api.ui.el('button', {
      className: 'host-api-sample__button',
      type: 'button',
      text: 'オーバーレイを消去',
    });
    const stats = api.ui.el('div', { className: 'host-api-sample__meta', text: '' });

    row.append(colorInput, activateButton, clearButton);
    root.append(intro, row, stats);
    renderPanel(root, colorInput, stats);

    colorInput.addEventListener('input', async event => {
      state.color = parseHexColor(event.target.value);
      await api.storage.set(STORAGE_KEY, state.color);
      api.ui.setStatus(`color=${toHex(state.color)}`, 'info');
      renderPanel(root, colorInput, stats);
    });

    activateButton.addEventListener('click', () => {
      api.activateTool(TOOL_ID);
      api.capturePointer(true);
      api.ui.setStatus('拡張ツールを有効化しました', 'success');
      renderPanel(root, colorInput, stats);
    });

    clearButton.addEventListener('click', () => {
      state.paintedKeys.clear();
      api.clearPixels();
      api.ui.setStatus('オーバーレイを消去しました', 'info');
      renderPanel(root, colorInput, stats);
    });

    api.registerTool({
      id: TOOL_ID,
      label: 'HX',
      hint: 'Host API sample overlay tool',
    });
    api.capturePointer(true);
    api.activateTool(TOOL_ID);
    api.toast('Host API sample loaded', 'success');
  }

  function paintAtCell(cell) {
    if (!cell || !cell.inside) {
      return;
    }
    const pixels = makePlusPixels(cell.clampedX, cell.clampedY)
      .filter(pixel => pixel.x >= 0 && pixel.y >= 0 && pixel.x < cell.width && pixel.y < cell.height);
    api.drawPixels(pixels, state.color);
    rememberPixels(pixels);
  }

  api.on('init', boot);

  api.on('context', () => {
    const root = api.ui.getRoot();
    if (root) {
      const meta = root.querySelector('.host-api-sample__meta:last-child');
      if (meta) {
        const context = api.getContext();
        meta.textContent = [
          `activeTool=${context.activeTool || 'none'}`,
          `extensionTool=${context.activeLocalToolId || 'none'}`,
          `overlay=${context.localPaintPixelCount || 0}`,
        ].join(' / ');
      }
    }
  });

  api.on('tool:pointerdown', payload => {
    state.drawing = true;
    paintAtCell(payload.cell);
  });

  api.on('tool:pointermove', payload => {
    if (!state.drawing) {
      return;
    }
    paintAtCell(payload.cell);
  });

  const finish = () => {
    state.drawing = false;
  };

  api.on('tool:pointerup', finish);
  api.on('tool:pointercancel', finish);
})();
