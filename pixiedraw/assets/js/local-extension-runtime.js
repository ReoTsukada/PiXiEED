(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const STORAGE_KEY_ENABLED = 'pixieedraw:local-extension:enabled';
  const STORAGE_KEY_CODE = 'pixieedraw:local-extension:code';
  const STORAGE_KEY_PLUGIN_DATA = 'pixieedraw:local-extension:data';
  const TEMPLATE_SCRIPT_FILENAME = 'pixieedraw-8way-sprite-assistant-template.js';
  const SCRIPT_WATCH_INTERVAL_MS = 1800;
  const LOCAL_TOOL_MAX_COUNT = 24;
  const LOCAL_PAINT_BATCH_MAX = 32768;
  const SANDBOX_FRAME_MIN_HEIGHT = 180;
  const SANDBOX_FRAME_MAX_HEIGHT = 560;
  const RETIRED_AI_STORAGE_KEYS = Object.freeze([
    'pixieedraw:local-extension:ai-enabled',
    'pixieedraw:local-extension:ai-endpoint',
    'pixieedraw:local-extension:ai-api-format',
    'pixieedraw:local-extension:ai-api-key',
    'pixieedraw:local-extension:ai-model',
    'pixieedraw:local-extension:ai-system-prompt',
    'pixieedraw:local-extension:ai-last-prompt',
    'pixieedraw:local-extension:ai-code-preset',
  ]);

  const runtimeState = {
    enabled: false,
    code: '',
    frame: null,
    frameReady: false,
    messageQueue: [],
    intervalTimer: null,
    ui: null,
    localTools: new Map(),
    localToolOrder: [],
    activeLocalToolId: '',
    captureCanvasPointer: false,
    trackedPointerId: null,
    localOverlayCanvas: null,
    localOverlayCtx: null,
    localInputLayer: null,
    localOverlayObserver: null,
    localPaintMap: new Map(),
    builtInToolObserver: null,
    scriptFileHandle: null,
    scriptFileName: '',
    scriptFileLastModified: 0,
    scriptFileWatchTimer: null,
    scriptFileReadInFlight: false,
    frameHeight: 240,
  };

  function isEnglishUi() {
    const lang = String(document?.documentElement?.lang || 'ja').toLowerCase();
    return lang.startsWith('en');
  }

  function localizeText(jaText, enText) {
    return isEnglishUi() ? enText : jaText;
  }

  function buildTemplateCode() {
    return String.raw`/*
 * PiXiEEDraw Local Extension Template
 * 8-Way Sprite Assistant
 *
 * このファイルを GPT に渡す時は、このコメントを残してください。
 * GPT が PiXiEEDraw の内部構造を知らなくても編集できるように、
 * 「どこまで安全に触れてよいか」をここにまとめています。
 *
 * 実行環境:
 * - この拡張は PiXiEEDraw のローカル拡張です
 * - 実行場所は sandbox iframe の中だけです
 * - このファイル内の document / window は iframe 自身のものです
 * - 親ページ DOM や他ユーザーの画面には触れません
 * - 拡張はこの端末だけで動き、共有同期されません
 *
 * 安全に追加しやすいもの:
 * - 独自UI
 * - 独自canvas
 * - ローカル保存付きの設定
 * - 補助プレビュー
 * - 簡単な音やアニメーション
 *
 * できないこと:
 * - 外部通信
 * - 親ページ DOM の直接編集
 * - 共有データの直接変更
 * - 他人の端末への反映
 * - 既存ツール欄へのボタン追加
 * - メインキャンバス上への重ね描き
 * - キャンバス入力の横取り
 *
 * 使える API:
 * - api.on(name, handler)
 * - api.toast(message, level)
 * - api.ui.getRoot()
 * - api.ui.clear()
 * - api.ui.mount(node)
 * - api.ui.append(node)
 * - api.ui.setTitle(text)
 * - api.ui.setSubtitle(text)
 * - api.ui.setStatus(text, kind)
 * - api.ui.addStyles(css)
 * - api.ui.el(tag, props, children)
 * - api.getContext()
 * - api.storage.get(key, fallback)
 * - api.storage.set(key, value)
 * - api.storage.remove(key)
 *
 * よく使う event:
 * - init
 * - context
 * - interval
 *
 * GPT に守らせる条件:
 * - 単一の .js ファイルのまま編集する
 * - 外部ライブラリを使わない
 * - 外部通信しない
 * - 親ページ DOM は触らない
 * - 既存の拡張パネル shell は api.ui から使う
 * - 既存のコード構造とコメントをできるだけ保つ
 * - 完成コードだけを返す
 */

(() => {
  'use strict';

  // 1) Config
  const STORAGE_KEY = 'eight-way-sprite-assistant-state-v1';
  const GRID_SIZE = 24;
  const EDITOR_CELL_SIZE = 12;
  const PREVIEW_CELL_SIZE = 4;
  const MASTER_DIRECTIONS = ['N', 'E', 'S', 'W'];
  const ALL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const DERIVED_DIRECTIONS = {
    NE: ['N', 'E'],
    SE: ['E', 'S'],
    SW: ['S', 'W'],
    NW: ['W', 'N'],
  };
  const COLORS = {
    bg: '#071018',
    panel: 'rgba(8, 18, 26, 0.88)',
    panelStrong: 'rgba(12, 26, 36, 0.96)',
    border: 'rgba(166, 234, 255, 0.24)',
    grid: 'rgba(166, 234, 255, 0.12)',
    fill: '#7ce3ff',
    fillSoft: 'rgba(124, 227, 255, 0.18)',
    hover: 'rgba(255, 223, 120, 0.32)',
    text: '#eaf8ff',
    muted: 'rgba(234, 248, 255, 0.72)',
    accent: '#ffd27a',
    derived: 'rgba(255, 210, 122, 0.15)',
    active: 'rgba(124, 227, 255, 0.18)',
  };

  // 2) State
  const state = {
    activeMaster: 'E',
    masters: createMasterState(),
    hover: null,
    drag: {
      paintValue: true,
      pointerId: null,
    },
    saveTimer: null,
  };

  // 3) Helpers
  function createGrid(size) {
    return Array.from({ length: size }, () => Array(size).fill(false));
  }

  function createMasterState() {
    const next = {};
    MASTER_DIRECTIONS.forEach(dir => {
      next[dir] = createGrid(GRID_SIZE);
    });
    return next;
  }

  function clearGrid(grid) {
    for (let y = 0; y < grid.length; y += 1) {
      grid[y].fill(false);
    }
  }

  function cloneGrid(source) {
    return source.map(row => row.slice());
  }

  function makeEl(tag, props, children) {
    const el = document.createElement(tag);
    if (props && typeof props === 'object') {
      Object.keys(props).forEach(key => {
        const value = props[key];
        if (key === 'className') {
          el.className = value;
        } else if (key === 'text') {
          el.textContent = value;
        } else {
          el[key] = value;
        }
      });
    }
    if (Array.isArray(children)) {
      children.forEach(child => {
        if (child) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  function isMasterDirection(direction) {
    return MASTER_DIRECTIONS.includes(direction);
  }

  function getSourceDirections(direction) {
    return isMasterDirection(direction) ? [direction] : (DERIVED_DIRECTIONS[direction] || ['E']);
  }

  function getPreferredEditorDirection(direction) {
    const sources = getSourceDirections(direction);
    if (sources.length <= 1) {
      return sources[0];
    }
    return state.activeMaster === sources[0] ? sources[1] : sources[0];
  }

  function resolveDirectionLabel(direction) {
    return {
      N: 'Front',
      NE: 'Front-Right',
      E: 'Right',
      SE: 'Back-Right',
      S: 'Back',
      SW: 'Back-Left',
      W: 'Left',
      NW: 'Front-Left',
    }[direction] || direction;
  }

  function computeSignedField(grid) {
    const field = createGrid(GRID_SIZE);
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const inside = Boolean(grid[y][x]);
        let nearest = Infinity;
        for (let yy = 0; yy < GRID_SIZE; yy += 1) {
          for (let xx = 0; xx < GRID_SIZE; xx += 1) {
            if (Boolean(grid[yy][xx]) === inside) {
              continue;
            }
            const distance = Math.hypot(xx - x, yy - y);
            if (distance < nearest) {
              nearest = distance;
            }
          }
        }
        field[y][x] = inside ? nearest : -nearest;
      }
    }
    return field;
  }

  function cleanupGrid(grid) {
    const next = cloneGrid(grid);
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        let neighbors = 0;
        for (let yy = y - 1; yy <= y + 1; yy += 1) {
          for (let xx = x - 1; xx <= x + 1; xx += 1) {
            if (xx === x && yy === y) {
              continue;
            }
            if (yy < 0 || xx < 0 || yy >= GRID_SIZE || xx >= GRID_SIZE) {
              continue;
            }
            if (grid[yy][xx]) {
              neighbors += 1;
            }
          }
        }
        if (grid[y][x] && neighbors <= 1) {
          next[y][x] = false;
        } else if (!grid[y][x] && neighbors >= 5) {
          next[y][x] = true;
        }
      }
    }
    return next;
  }

  function blendFields(fieldA, fieldB, mix) {
    const ratio = Number.isFinite(mix) ? mix : 0.5;
    const next = createGrid(GRID_SIZE);
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const value = fieldA[y][x] * (1 - ratio) + fieldB[y][x] * ratio;
        next[y][x] = value >= 0;
      }
    }
    return cleanupGrid(next);
  }

  function buildDirectionSet() {
    const fields = MASTER_DIRECTIONS.reduce((acc, direction) => {
      acc[direction] = computeSignedField(state.masters[direction]);
      return acc;
    }, {});
    return {
      N: cloneGrid(state.masters.N),
      NE: blendFields(fields.N, fields.E, 0.5),
      E: cloneGrid(state.masters.E),
      SE: blendFields(fields.E, fields.S, 0.5),
      S: cloneGrid(state.masters.S),
      SW: blendFields(fields.S, fields.W, 0.5),
      W: cloneGrid(state.masters.W),
      NW: blendFields(fields.W, fields.N, 0.5),
    };
  }

  function paintPattern(grid, pattern, offsetX, offsetY) {
    pattern.forEach((row, rowIndex) => {
      for (let i = 0; i < row.length; i += 1) {
        if (row[i] !== '#') {
          continue;
        }
        const x = offsetX + i;
        const y = offsetY + rowIndex;
        if (x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE) {
          grid[y][x] = true;
        }
      }
    });
  }

  function serializeState() {
    return {
      activeMaster: state.activeMaster,
      masters: MASTER_DIRECTIONS.reduce((acc, dir) => {
        acc[dir] = cloneGrid(state.masters[dir]);
        return acc;
      }, {}),
    };
  }

  async function saveStateSoon() {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }
    state.saveTimer = setTimeout(async () => {
      state.saveTimer = null;
      try {
        await api.storage.set(STORAGE_KEY, serializeState());
      } catch (_) {
        // ignore local save errors
      }
    }, 120);
  }

  async function loadState() {
    try {
      const saved = await api.storage.get(STORAGE_KEY, null);
      if (!saved || typeof saved !== 'object') {
        return;
      }
      if (saved.masters && typeof saved.masters === 'object') {
        MASTER_DIRECTIONS.forEach(name => {
          const source = saved.masters[name];
          if (!Array.isArray(source)) {
            return;
          }
          const next = createGrid(GRID_SIZE);
          for (let y = 0; y < GRID_SIZE; y += 1) {
            const row = Array.isArray(source[y]) ? source[y] : [];
            for (let x = 0; x < GRID_SIZE; x += 1) {
              next[y][x] = Boolean(row[x]);
            }
          }
          state.masters[name] = next;
        });
      }
      if (typeof saved.activeMaster === 'string' && isMasterDirection(saved.activeMaster)) {
        state.activeMaster = saved.activeMaster;
      }
    } catch (_) {
      // ignore local load errors
    }
  }

  function clearCurrentDirection() {
    clearGrid(state.masters[state.activeMaster]);
    renderAll();
    saveStateSoon();
  }

  function clearAllDirections() {
    MASTER_DIRECTIONS.forEach(name => {
      clearGrid(state.masters[name]);
    });
    renderAll();
    saveStateSoon();
  }

  function applySampleSprite() {
    clearAllDirections();
    const centerX = 8;
    const centerY = 5;
    paintPattern(state.masters.N, [
      '..####....',
      '.######...',
      '.######...',
      '..####....',
      '.######...',
      '########..',
      '..####....',
      '.##..##...',
      '.##..##...',
      '.#....#...',
    ], centerX, centerY);
    paintPattern(state.masters.E, [
      '..###.....',
      '.#####....',
      '#######...',
      '..#####...',
      '.######...',
      '.#######..',
      '..#####...',
      '..##..##..',
      '..##...##.',
      '.##.....#.',
    ], centerX, centerY);
    paintPattern(state.masters.S, [
      '..####....',
      '.######...',
      '.######...',
      '..####....',
      '.######...',
      '..######..',
      '...####...',
      '..##..##..',
      '..##..##..',
      '..#....#..',
    ], centerX, centerY);
    paintPattern(state.masters.W, [
      '.....###..',
      '....#####.',
      '...#######',
      '...#####..',
      '...######.',
      '..#######.',
      '...#####..',
      '..##..##..',
      '.##...##..',
      '.#.....##.',
    ], centerX - 1, centerY);
    renderAll();
    saveStateSoon();
  }

  // 4) Panel shell + DOM
  const ui = api.ui;
  ui.setTitle('8-Way Sprite Assistant');
  ui.setSubtitle('N / E / S / W を描くと、斜め4方向を自動 in-between で補完します。');
  ui.addStyles([
    '.app {',
    '  display: grid;',
    '  gap: 10px;',
    '}',
    '.hero {',
    '  display: grid;',
    '  gap: 6px;',
    '  padding: 10px;',
    '  border: 1px solid ' + COLORS.border + ';',
    '  background: ' + COLORS.panel + ';',
    '}',
    '.hero__title {',
    '  font-weight: 800;',
    '  letter-spacing: 0.03em;',
    '}',
    '.hero__text {',
    '  color: ' + COLORS.muted + ';',
    '}',
    '.toolbar {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: 8px;',
    '}',
    '.stats {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: 10px 14px;',
    '  color: ' + COLORS.muted + ';',
    '}',
    '.master-strip {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: 8px;',
    '}',
    '.master-button {',
    '  min-width: 74px;',
    '}',
    '.master-button.is-active {',
    '  border-color: rgba(166, 234, 255, 0.74);',
    '  box-shadow: inset 0 0 0 1px rgba(166, 234, 255, 0.36);',
    '  background: rgba(22, 52, 74, 0.98);',
    '}',
    '.layout {',
    '  display: grid;',
    '  gap: 10px;',
    '  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);',
    '}',
    '.panel {',
      '  display: grid;',
      '  gap: 10px;',
      '  padding: 10px;',
      '  border: 1px solid ' + COLORS.border + ';',
      '  background: ' + COLORS.panelStrong + ';',
    '}',
    '.panel__head {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: 8px;',
    '}',
    '.panel__title {',
    '  font-weight: 700;',
    '}',
    '.panel__meta {',
    '  color: ' + COLORS.muted + ';',
    '  font-size: 11px;',
    '}',
    '.panel__actions {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: 8px;',
    '}',
    '.editor-canvas {',
    '  width: 100%;',
    '}',
    '.preview-grid {',
    '  display: grid;',
    '  gap: 8px;',
    '  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));',
    '}',
    '.preview-card {',
    '  display: grid;',
    '  gap: 6px;',
    '  padding: 8px;',
    '  border: 1px solid rgba(166, 234, 255, 0.18);',
    '  background: rgba(10, 20, 28, 0.74);',
    '}',
    '.preview-card.is-derived {',
    '  background: ' + COLORS.derived + ';',
    '}',
    '.preview-card.is-active {',
    '  border-color: rgba(166, 234, 255, 0.7);',
    '  box-shadow: inset 0 0 0 1px rgba(166, 234, 255, 0.28);',
    '  background: ' + COLORS.active + ';',
    '}',
    '.preview-card__head {',
    '  display: flex;',
    '  align-items: baseline;',
    '  justify-content: space-between;',
    '  gap: 6px;',
    '}',
    '.preview-card__label {',
    '  font-weight: 700;',
    '  font-size: 0.82rem;',
    '}',
    '.preview-card__meta {',
    '  font-size: 0.72rem;',
    '  color: ' + COLORS.muted + ';',
    '}',
    'button {',
    '  min-height: 34px;',
    '  padding: 6px 10px;',
    '  border: 1px solid rgba(166, 234, 255, 0.32);',
    '  background: rgba(18, 40, 56, 0.96);',
    '  color: ' + COLORS.text + ';',
    '  cursor: pointer;',
    '}',
    'button:hover {',
    '  border-color: rgba(166, 234, 255, 0.58);',
    '}',
    'canvas {',
    '  display: block;',
    '  max-width: 100%;',
    '  image-rendering: pixelated;',
    '  background: ' + COLORS.bg + ';',
    '  border: 1px solid rgba(166, 234, 255, 0.22);',
    '  touch-action: none;',
    '}',
    '.preview-canvas {',
    '  width: 100%;',
    '}',
    '.panel__hint {',
    '  color: ' + COLORS.muted + ';',
    '}',
    '@media (max-width: 760px) {',
    '  .layout {',
    '    grid-template-columns: 1fr;',
    '  }',
    '}'
  ].join('\n'));

  ui.clear();
  const app = makeEl('div', { className: 'app' });
  ui.mount(app);

  const hero = makeEl('section', { className: 'hero' });
  const heroTitle = makeEl('div', { className: 'hero__title', text: '8-Way Sprite Assistant Template' });
  const heroText = makeEl('div', {
    className: 'hero__text',
    text: 'N / E / S / W の4方向を描くと、NE / SE / SW / NW を隣接方向どうしの中間として自動生成します。'
  });
  const toolbar = makeEl('div', { className: 'toolbar' });
  const clearCurrentButton = makeEl('button', { type: 'button', text: 'Clear Current' });
  const clearAllButton = makeEl('button', { type: 'button', text: 'Clear All' });
  const sampleButton = makeEl('button', { type: 'button', text: 'Sample' });
  toolbar.append(clearCurrentButton, clearAllButton, sampleButton);
  const stats = makeEl('div', { className: 'stats' });
  const activeText = makeEl('span', { text: 'Editing: E' });
  const uniqueText = makeEl('span', { text: 'Manual directions: 4' });
  const derivedText = makeEl('span', { text: 'Auto in-between: NE / SE / SW / NW' });
  stats.append(activeText, uniqueText, derivedText);
  hero.append(heroTitle, heroText, toolbar, stats);
  app.appendChild(hero);

  const masterStrip = makeEl('div', { className: 'master-strip' });
  const masterButtons = {};
  MASTER_DIRECTIONS.forEach(direction => {
    const button = makeEl('button', {
      type: 'button',
      className: 'master-button',
      text: direction,
    });
    button.addEventListener('click', () => {
      state.activeMaster = direction;
      renderAll();
      saveStateSoon();
    });
    masterButtons[direction] = button;
    masterStrip.appendChild(button);
  });
  app.appendChild(masterStrip);

  const layout = makeEl('section', { className: 'layout' });
  app.appendChild(layout);

  const editorPanel = makeEl('section', { className: 'panel' });
  const editorHead = makeEl('div', { className: 'panel__head' });
  const editorTitle = makeEl('div', { className: 'panel__title', text: 'Editor' });
  const editorMeta = makeEl('div', { className: 'panel__meta', text: 'L: paint / Alt or R: erase' });
  const editorCanvas = makeEl('canvas', { className: 'editor-canvas' });
  editorCanvas.width = GRID_SIZE * EDITOR_CELL_SIZE;
  editorCanvas.height = GRID_SIZE * EDITOR_CELL_SIZE;
  const editorCtx = editorCanvas.getContext('2d');
  const editorHint = makeEl('div', {
    className: 'panel__hint',
    text: '斜め4方向は自動補完です。派生方向をクリックすると、その元になる編集方向へ移動します。',
  });
  editorHead.append(editorTitle, editorMeta);
  editorPanel.append(editorHead, editorCanvas, editorHint);
  layout.appendChild(editorPanel);

  const previewPanel = makeEl('section', { className: 'panel' });
  const previewHead = makeEl('div', { className: 'panel__head' });
  const previewTitle = makeEl('div', { className: 'panel__title', text: '8-Way Preview' });
  const previewMeta = makeEl('div', { className: 'panel__meta', text: '4 manual + 4 auto in-between' });
  const previewGrid = makeEl('div', { className: 'preview-grid' });
  const previewCards = {};
  ALL_DIRECTIONS.forEach(direction => {
    const card = makeEl('button', {
      type: 'button',
      className: 'preview-card',
    });
    const head = makeEl('div', { className: 'preview-card__head' });
    const label = makeEl('div', { className: 'preview-card__label', text: direction });
    const meta = makeEl('div', { className: 'preview-card__meta', text: isMasterDirection(direction) ? 'edit' : 'auto' });
    const canvas = makeEl('canvas', { className: 'preview-canvas' });
    canvas.width = GRID_SIZE * PREVIEW_CELL_SIZE;
    canvas.height = GRID_SIZE * PREVIEW_CELL_SIZE;
    head.append(label, meta);
    card.append(head, canvas);
    card.addEventListener('click', () => {
      state.activeMaster = getPreferredEditorDirection(direction);
      renderAll();
      saveStateSoon();
    });
    previewCards[direction] = {
      card,
      canvas,
      ctx: canvas.getContext('2d'),
      label,
      meta,
    };
    previewGrid.appendChild(card);
  });
  previewHead.append(previewTitle, previewMeta);
  previewPanel.append(previewHead, previewGrid);
  layout.appendChild(previewPanel);

  // 5) Rendering
  function drawGrid(ctx, canvas, grid, cellSize, options) {
    const settings = options || {};
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = settings.background || COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!grid[y][x]) {
          continue;
        }
        ctx.fillStyle = settings.fill || COLORS.fill;
        ctx.fillRect(
          x * cellSize + 1,
          y * cellSize + 1,
          Math.max(1, cellSize - 2),
          Math.max(1, cellSize - 2)
        );
      }
    }
    if (settings.hover) {
      ctx.fillStyle = COLORS.hover;
      ctx.fillRect(
        settings.hover.x * cellSize + 1,
        settings.hover.y * cellSize + 1,
        Math.max(1, cellSize - 2),
        Math.max(1, cellSize - 2)
      );
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      const pos = i * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }
  }

  function renderEditor() {
    const current = state.masters[state.activeMaster];
    if (!editorCtx || !current) {
      return;
    }
    editorMeta.textContent = 'Editing: ' + state.activeMaster + ' / L: paint / Alt or R: erase';
    drawGrid(editorCtx, editorCanvas, current, EDITOR_CELL_SIZE, {
      hover: state.hover,
      fill: COLORS.fill,
    });
  }

  function renderMasterButtons() {
    MASTER_DIRECTIONS.forEach(direction => {
      const button = masterButtons[direction];
      if (!button) {
        return;
      }
      const active = state.activeMaster === direction;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderPreviewCards() {
    const directions = buildDirectionSet();
    ALL_DIRECTIONS.forEach(direction => {
      const card = previewCards[direction];
      if (!card || !card.ctx) {
        return;
      }
      drawGrid(card.ctx, card.canvas, directions[direction], PREVIEW_CELL_SIZE, {
        fill: COLORS.fill,
      });
      const sources = getSourceDirections(direction);
      const derived = !isMasterDirection(direction);
      card.card.classList.toggle('is-derived', derived);
      card.card.classList.toggle('is-active', sources.includes(state.activeMaster));
      card.meta.textContent = derived ? ('auto ' + sources.join(' + ')) : 'edit';
      card.label.textContent = direction;
    });
  }

  function renderStats() {
    activeText.textContent = 'Editing: ' + state.activeMaster + ' (' + resolveDirectionLabel(state.activeMaster) + ')';
    uniqueText.textContent = 'Unique directions: ' + String(MASTER_DIRECTIONS.length);
    derivedText.textContent = 'Auto in-between: NE(N+E) / SE(E+S) / SW(S+W) / NW(W+N)';
  }

  function renderAll() {
    renderMasterButtons();
    renderEditor();
    renderPreviewCards();
    renderStats();
  }

  // 6) Editor input
  function getCellFromEvent(event) {
    const canvas = editorCanvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const rawX = (event.clientX - rect.left) * scaleX;
    const rawY = (event.clientY - rect.top) * scaleY;
    const x = Math.floor(rawX / EDITOR_CELL_SIZE);
    const y = Math.floor(rawY / EDITOR_CELL_SIZE);
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return null;
    }
    return { x, y };
  }

  function setCell(cell, value) {
    const grid = state.masters[state.activeMaster];
    if (!cell || !grid) {
      return false;
    }
    const nextValue = Boolean(value);
    if (grid[cell.y][cell.x] === nextValue) {
      return false;
    }
    grid[cell.y][cell.x] = nextValue;
    return true;
  }

  editorCanvas.addEventListener('contextmenu', event => {
    event.preventDefault();
  });

  editorCanvas.addEventListener('pointerdown', event => {
    const cell = getCellFromEvent(event);
    if (!cell) {
      return;
    }
    state.drag.paintValue = !(event.button === 2 || event.altKey);
    state.drag.pointerId = event.pointerId;
    state.hover = cell;
    setCell(cell, state.drag.paintValue);
    renderAll();
    saveStateSoon();
    try {
      editorCanvas.setPointerCapture(event.pointerId);
    } catch (_) {
      // ignore
    }
    event.preventDefault();
  });

  editorCanvas.addEventListener('pointermove', event => {
    const cell = getCellFromEvent(event);
    state.hover = cell;
    if (state.drag.pointerId === event.pointerId && cell) {
      if (setCell(cell, state.drag.paintValue)) {
        saveStateSoon();
      }
    }
    renderAll();
  });

  editorCanvas.addEventListener('pointerleave', () => {
    state.hover = null;
    renderAll();
  });

  const finishPaint = event => {
    if (state.drag.pointerId !== event.pointerId) {
      return;
    }
    state.drag.pointerId = null;
    renderAll();
  };

  editorCanvas.addEventListener('pointerup', finishPaint);
  editorCanvas.addEventListener('pointercancel', finishPaint);
  clearCurrentButton.addEventListener('click', clearCurrentDirection);
  clearAllButton.addEventListener('click', clearAllDirections);
  sampleButton.addEventListener('click', applySampleSprite);

  // 7) Init
  api.on('init', async () => {
    api.toast('8-Way Sprite Assistant loaded', 'success');
    await loadState();
    renderAll();
  });
})();
`;
  }

  function canUseScriptFileSystem() {
    return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
  }

  function applyImportedCode(nextCode, { autoEnable = true } = {}) {
    const ui = runtimeState.ui;
    const code = String(nextCode || '');
    runtimeState.code = code;
    writeStorage(STORAGE_KEY_CODE, code);
    if (ui?.code instanceof HTMLTextAreaElement) {
      ui.code.value = code;
    }
    if (autoEnable) {
      if (!runtimeState.enabled) {
        setEnabled(true, { persist: true, restart: true });
      } else {
        reloadRuntime();
      }
    }
  }

  function clearScriptWatchTimer() {
    if (runtimeState.scriptFileWatchTimer !== null) {
      window.clearInterval(runtimeState.scriptFileWatchTimer);
      runtimeState.scriptFileWatchTimer = null;
    }
  }

  function getBoundScriptLabel() {
    const name = sanitizeText(runtimeState.scriptFileName, 180);
    return name || localizeText('未選択', 'Not selected');
  }

  function refreshScriptBindingUi() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.scriptValue instanceof HTMLElement)) {
      return;
    }
    const hasBinding = Boolean(String(runtimeState.scriptFileName || '').trim());
    ui.scriptValue.textContent = getBoundScriptLabel();
    ui.scriptValue.dataset.empty = hasBinding ? 'false' : 'true';
  }

  async function readBoundScriptFile({ apply = true, silent = false, ignoreTimestamp = false, autoEnable = runtimeState.enabled } = {}) {
    const handle = runtimeState.scriptFileHandle;
    if (!handle || typeof handle.getFile !== 'function' || runtimeState.scriptFileReadInFlight) {
      return false;
    }
    runtimeState.scriptFileReadInFlight = true;
    try {
      const file = await handle.getFile();
      if (!(file instanceof File)) {
        if (!silent) {
          setStatus(localizeText('スクリプトファイルを読めませんでした', 'Could not read the script file'), 'error');
        }
        return false;
      }
      runtimeState.scriptFileName = file.name || runtimeState.scriptFileName || '';
      if (!ignoreTimestamp && runtimeState.scriptFileLastModified && file.lastModified === runtimeState.scriptFileLastModified) {
        return false;
      }
      const text = await file.text();
      if (!String(text || '').trim()) {
        if (!silent) {
          setStatus(localizeText('スクリプトファイルが空です', 'The script file is empty'), 'warn');
        }
        return false;
      }
      runtimeState.scriptFileLastModified = Number(file.lastModified) || Date.now();
      if (apply) {
        applyImportedCode(text, { autoEnable });
      }
      if (!silent) {
        setStatus(
          localizeText(
            `スクリプトを再読込して反映しました: ${getBoundScriptLabel()}`,
            `Reloaded and applied the script: ${getBoundScriptLabel()}`
          ),
          'success'
        );
      }
      return true;
    } catch (error) {
      if (!silent) {
        setStatus(localizeText('スクリプトファイルの再読込に失敗しました', 'Failed to reload the script file'), 'error');
      }
      return false;
    } finally {
      runtimeState.scriptFileReadInFlight = false;
    }
  }

  function startWatchingBoundScriptFile() {
    clearScriptWatchTimer();
    if (!runtimeState.scriptFileHandle || typeof runtimeState.scriptFileHandle.getFile !== 'function') {
      return;
    }
    runtimeState.scriptFileWatchTimer = window.setInterval(() => {
      readBoundScriptFile({ apply: true, silent: true, ignoreTimestamp: false, autoEnable: runtimeState.enabled }).catch(() => {});
    }, SCRIPT_WATCH_INTERVAL_MS);
  }

  async function bindScriptFileHandle(handle, { readNow = true, autoEnableOnRead = true } = {}) {
    if (!handle || typeof handle.getFile !== 'function') {
      return false;
    }
    runtimeState.scriptFileHandle = handle;
    runtimeState.scriptFileName = handle.name || '';
    runtimeState.scriptFileLastModified = 0;
    refreshScriptBindingUi();
    startWatchingBoundScriptFile();
    if (readNow) {
      return await readBoundScriptFile({ apply: true, silent: false, ignoreTimestamp: true, autoEnable: autoEnableOnRead });
    }
    return true;
  }

  async function createTemplateScriptFile() {
    if (!canUseScriptFileSystem()) {
      setStatus(localizeText('このブラウザではスクリプトファイル作成に対応していません', 'This browser does not support script file creation'), 'warn');
      return false;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: TEMPLATE_SCRIPT_FILENAME,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'PiXiEEDraw Script',
            accept: {
              'text/javascript': ['.js'],
              'text/plain': ['.txt'],
            },
          },
        ],
      });
      if (!handle || typeof handle.createWritable !== 'function') {
        return false;
      }
      const writable = await handle.createWritable();
      await writable.write(buildTemplateCode());
      await writable.close();
      await bindScriptFileHandle(handle, { readNow: true, autoEnableOnRead: true });
      setStatus(
        localizeText(
          `雛形スクリプトを作成しました: ${getBoundScriptLabel()}`,
          `Created the template script: ${getBoundScriptLabel()}`
        ),
        'success'
      );
      return true;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return false;
      }
      setStatus(localizeText('雛形スクリプトの作成に失敗しました', 'Failed to create the template script'), 'error');
      return false;
    }
  }

  async function pickScriptFileHandle() {
    if (!canUseScriptFileSystem()) {
      return false;
    }
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'PiXiEEDraw Script',
            accept: {
              'text/javascript': ['.js'],
              'text/plain': ['.txt'],
            },
          },
        ],
      });
      const handle = Array.isArray(handles) ? handles[0] : null;
      if (!handle) {
        return false;
      }
      return await bindScriptFileHandle(handle, { readNow: true, autoEnableOnRead: true });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return false;
      }
      setStatus(localizeText('スクリプトファイルを開けませんでした', 'Could not open the script file'), 'error');
      return false;
    }
  }

  async function importScriptFile(file) {
    if (!(file instanceof File)) {
      return false;
    }
    const name = String(file.name || '').toLowerCase();
    if (name && !name.endsWith('.js') && !name.endsWith('.txt')) {
      setStatus(localizeText('`.js` または `.txt` のスクリプトを読み込んでください', 'Load a `.js` or `.txt` script file'), 'warn');
      return false;
    }
    let text = '';
    try {
      text = await file.text();
    } catch (error) {
      setStatus(localizeText('スクリプトの読込に失敗しました', 'Failed to read the script file'), 'error');
      return false;
    }
    if (!String(text || '').trim()) {
      setStatus(localizeText('スクリプトが空です', 'The script file is empty'), 'warn');
      return false;
    }
    applyImportedCode(text, { autoEnable: true });
    runtimeState.scriptFileHandle = null;
    runtimeState.scriptFileName = file.name || '';
    runtimeState.scriptFileLastModified = Number(file.lastModified) || Date.now();
    refreshScriptBindingUi();
    clearScriptWatchTimer();
    setStatus(localizeText('スクリプトを読み込み、自動で反映しました', 'Loaded the script and applied it automatically'), 'success');
    return true;
  }

  const SANDBOX_SRC = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; object-src 'none'; media-src data: blob:; font-src data:; frame-src 'none'; child-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;padding:0;background:transparent;color:#eaf8ff;font:12px/1.5 ui-sans-serif,system-ui,sans-serif}body{overflow:auto;padding:8px;box-sizing:border-box}*,*::before,*::after{box-sizing:border-box}button,input,textarea,select{font:inherit}canvas{image-rendering:pixelated;display:block;max-width:100%}</style></head><body>
<script>
(() => {
  const HOST_MARK = '__pixieLocalHost';
  const EXT_MARK = '__pixieLocalExt';
  const handlers = new Map();
  const pendingRequests = new Map();
  let requestSeq = 0;
  let latestContext = Object.freeze({});
  let layoutFrame = 0;
  let lastReportedWidth = 0;
  let lastReportedHeight = 0;

  function makeEl(tag, props, children) {
    const el = document.createElement(tag);
    if (props && typeof props === 'object') {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (key === 'className') {
          el.className = String(value || '');
        } else if (key === 'text') {
          el.textContent = String(value == null ? '' : value);
        } else if (key === 'hidden') {
          el.hidden = Boolean(value);
        } else {
          el[key] = value;
        }
      });
    }
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (child instanceof Node) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  const shell = (() => {
    const style = document.createElement('style');
    style.textContent = [
      ':root { color-scheme: dark; }',
      'body { overflow: auto; padding: 8px; box-sizing: border-box; }',
      '.pixie-ext-shell {',
      '  display: grid;',
      '  gap: 8px;',
      '  border: 1px solid rgba(166, 234, 255, 0.24);',
      '  background: rgba(7, 14, 20, 0.92);',
      '  padding: 10px;',
      '}',
      '.pixie-ext-shell__header {',
      '  display: grid;',
      '  gap: 4px;',
      '}',
      '.pixie-ext-shell__title {',
      '  font-weight: 800;',
      '  letter-spacing: 0.03em;',
      '}',
      '.pixie-ext-shell__subtitle {',
      '  color: rgba(234, 248, 255, 0.72);',
      '}',
      '.pixie-ext-shell__status {',
      '  min-height: 1.2em;',
      '}',
      '.pixie-ext-shell__status[data-kind="success"] { color: #84f3ad; }',
      '.pixie-ext-shell__status[data-kind="warn"] { color: #ffd27a; }',
      '.pixie-ext-shell__status[data-kind="error"] { color: #ff9c9c; }',
      '.pixie-ext-shell__body {',
      '  display: grid;',
      '  gap: 10px;',
      '  align-content: start;',
      '}',
    ].join('\n');
    document.head.appendChild(style);

    const shellEl = makeEl('div', { className: 'pixie-ext-shell' });
    const header = makeEl('div', { className: 'pixie-ext-shell__header' });
    const title = makeEl('div', { className: 'pixie-ext-shell__title', text: 'Local Extension' });
    const subtitle = makeEl('div', {
      className: 'pixie-ext-shell__subtitle',
      text: 'Build custom UI inside this dedicated panel only.',
    });
    const status = makeEl('div', {
      className: 'pixie-ext-shell__status',
      hidden: true,
    });
    const body = makeEl('div', { className: 'pixie-ext-shell__body' });
    header.append(title, subtitle);
    shellEl.append(header, status, body);
    document.body.appendChild(shellEl);
    return { shellEl, title, subtitle, status, body };
  })();

  function clearOwnedStyles() {
    Array.from(document.querySelectorAll('style[data-pixie-ext-owned="1"]')).forEach((node) => {
      node.remove();
    });
  }

  function setShellTitle(text) {
    const next = String(text || '').trim();
    shell.title.textContent = next || 'Local Extension';
    reportLayout();
    return shell.title.textContent;
  }

  function setShellSubtitle(text) {
    const next = String(text || '').trim();
    shell.subtitle.textContent = next;
    shell.subtitle.hidden = !next;
    reportLayout();
    return shell.subtitle.textContent;
  }

  function setShellStatus(text, kind = 'info') {
    const next = String(text || '').trim();
    shell.status.textContent = next;
    shell.status.hidden = !next;
    shell.status.dataset.kind = String(kind || 'info');
    reportLayout();
    return shell.status.textContent;
  }

  function resetShell() {
    clearOwnedStyles();
    setShellTitle('Local Extension');
    setShellSubtitle('Build custom UI inside this dedicated panel only.');
    setShellStatus('', 'info');
    shell.body.replaceChildren();
    reportLayout();
  }

  function blockedCapability(name) {
    return () => {
      throw new Error(name + ' is disabled in PiXiEEDraw local extensions');
    };
  }

  const blockedAsyncCapability = (name) => () => Promise.reject(new Error(name + ' is disabled in PiXiEEDraw local extensions'));
  try { window.fetch = blockedAsyncCapability('fetch'); } catch (_) {}
  try {
    window.XMLHttpRequest = class BlockedXMLHttpRequest {
      constructor() {
        throw new Error('XMLHttpRequest is disabled in PiXiEEDraw local extensions');
      }
    };
  } catch (_) {}
  try {
    window.WebSocket = class BlockedWebSocket {
      constructor() {
        throw new Error('WebSocket is disabled in PiXiEEDraw local extensions');
      }
    };
  } catch (_) {}
  try {
    window.EventSource = class BlockedEventSource {
      constructor() {
        throw new Error('EventSource is disabled in PiXiEEDraw local extensions');
      }
    };
  } catch (_) {}
  try {
    window.Worker = class BlockedWorker {
      constructor() {
        throw new Error('Worker is disabled in PiXiEEDraw local extensions');
      }
    };
  } catch (_) {}
  try {
    window.SharedWorker = class BlockedSharedWorker {
      constructor() {
        throw new Error('SharedWorker is disabled in PiXiEEDraw local extensions');
      }
    };
  } catch (_) {}
  try { window.open = blockedCapability('window.open'); } catch (_) {}
  try {
    if (navigator && typeof navigator === 'object') {
      navigator.sendBeacon = blockedCapability('navigator.sendBeacon');
    }
  } catch (_) {}

  function post(type, payload) {
    parent.postMessage({ [EXT_MARK]: 1, type, payload }, '*');
  }

  function flushLayout() {
    layoutFrame = 0;
    try {
      const width = Math.ceil(Math.max(
        shell.shellEl ? shell.shellEl.scrollWidth : 0,
        shell.shellEl ? shell.shellEl.getBoundingClientRect().width : 0,
        document.body ? document.body.getBoundingClientRect().width : 0
      ));
      const height = Math.ceil(Math.max(
        shell.shellEl ? shell.shellEl.scrollHeight : 0,
        shell.shellEl ? shell.shellEl.getBoundingClientRect().height : 0
      ));
      if (width === lastReportedWidth && height === lastReportedHeight) {
        return;
      }
      lastReportedWidth = width;
      lastReportedHeight = height;
      post('layout', { width, height });
    } catch (_) {
      // ignore
    }
  }

  function reportLayout() {
    if (layoutFrame) {
      return;
    }
    layoutFrame = requestAnimationFrame(flushLayout);
  }

  function on(eventName, handler) {
    if (typeof eventName !== 'string' || typeof handler !== 'function') {
      return;
    }
    const list = handlers.get(eventName) || [];
    list.push(handler);
    handlers.set(eventName, list);
  }

  function emit(eventName, payload) {
    const list = handlers.get(eventName) || [];
    for (const handler of list) {
      try {
        const result = handler(payload);
        if (result && typeof result.then === 'function') {
          result.catch((error) => {
            post('status', {
              ok: false,
              message: '[handler:' + eventName + '] ' + (error && error.message ? error.message : String(error)),
            });
          });
        }
      } catch (error) {
        post('status', {
          ok: false,
          message: '[handler:' + eventName + '] ' + (error && error.message ? error.message : String(error)),
        });
      }
    }
  }

  function clearHandlers() {
    handlers.clear();
  }

  function rejectPendingRequests(reason) {
    for (const pending of pendingRequests.values()) {
      try {
        pending.reject(new Error(reason || 'Request cancelled'));
      } catch (_) {
        // ignore
      }
    }
    pendingRequests.clear();
  }

  function request(type, payload) {
    return new Promise((resolve, reject) => {
      const id = 'req_' + Date.now() + '_' + (requestSeq += 1);
      pendingRequests.set(id, { resolve, reject });
      post(type, {
        id,
        ...(payload && typeof payload === 'object' ? payload : {}),
      });
    });
  }

  function settleRequest(payload) {
    const id = payload && payload.id ? String(payload.id) : '';
    if (!id || !pendingRequests.has(id)) {
      return;
    }
    const pending = pendingRequests.get(id);
    pendingRequests.delete(id);
    if (!pending) {
      return;
    }
    if (payload && payload.ok) {
      pending.resolve(payload);
      return;
    }
    const message = payload && payload.message ? String(payload.message) : 'Request failed';
    pending.reject(new Error(message));
  }

  function disabledBridge(name) {
    post('disabled-capability', { name: String(name || 'API') });
    return false;
  }

  const api = Object.freeze({
    on,
    toast(message, level = 'info') {
      post('toast', { message: String(message || ''), level: String(level || 'info') });
    },
    badge(text = '') {
      post('badge', { text: String(text || '') });
    },
    panel(title = '', body = '') {
      post('panel', { title: String(title || ''), body: String(body || '') });
    },
    registerTool(tool) {
      return disabledBridge('api.registerTool');
    },
    unregisterTool(id) {
      return disabledBridge('api.unregisterTool');
    },
    clearTools() {
      return disabledBridge('api.clearTools');
    },
    activateTool(id) {
      return disabledBridge('api.activateTool');
    },
    capturePointer(enabled = true) {
      return disabledBridge('api.capturePointer');
    },
    drawPixels(pixels, color) {
      return disabledBridge('api.drawPixels');
    },
    clearPixels() {
      return disabledBridge('api.clearPixels');
    },
    getContext() {
      return latestContext;
    },
    ui: Object.freeze({
      getRoot() {
        return shell.body;
      },
      clear() {
        shell.body.replaceChildren();
        reportLayout();
        return shell.body;
      },
      mount(node) {
        shell.body.replaceChildren();
        if (node instanceof Node) {
          shell.body.appendChild(node);
        }
        reportLayout();
        return shell.body;
      },
      append(node) {
        if (node instanceof Node) {
          shell.body.appendChild(node);
          reportLayout();
        }
        return shell.body;
      },
      setTitle(text = '') {
        return setShellTitle(text);
      },
      setSubtitle(text = '') {
        return setShellSubtitle(text);
      },
      setStatus(text = '', kind = 'info') {
        return setShellStatus(text, kind);
      },
      addStyles(css = '') {
        const style = document.createElement('style');
        style.dataset.pixieExtOwned = '1';
        style.textContent = String(css || '');
        document.head.appendChild(style);
        reportLayout();
        return style;
      },
      el(tag, props, children) {
        return makeEl(tag, props, children);
      },
    }),
    storage: Object.freeze({
      async get(key, fallback = null) {
        const result = await request('storage-get', { key: String(key || ''), fallback });
        return result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : fallback;
      },
      async set(key, value) {
        await request('storage-set', { key: String(key || ''), value });
        return true;
      },
      async remove(key) {
        await request('storage-remove', { key: String(key || '') });
        return true;
      },
    }),
    ai: Object.freeze({
      request() {
        return Promise.reject(new Error('PiXiEEDraw local AI integration has been retired'));
      },
    }),
    log(...values) {
      post('log', { values: values.map(value => {
        try {
          if (typeof value === 'string') return value;
          return JSON.stringify(value);
        } catch (_) {
          return String(value);
        }
      }) });
    },
  });

  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || data[HOST_MARK] !== 1) {
      return;
    }
    if (data.type === 'load') {
      clearHandlers();
      rejectPendingRequests('Extension reloaded');
      latestContext = Object.freeze(data.context && typeof data.context === 'object' ? data.context : {});
      resetShell();
      try {
        const fn = new Function('api', '"use strict";\n' + String(data.code || '') + '\n//# sourceURL=pixieed-local-extension.js');
        fn(api);
        emit('init', latestContext);
        post('status', { ok: true, message: 'Local extension loaded' });
      } catch (error) {
        setShellStatus(error && error.message ? error.message : String(error), 'error');
        shell.body.replaceChildren();
        post('status', {
          ok: false,
          message: error && error.message ? error.message : String(error),
        });
      }
      return;
    }
    if (data.type === 'unload') {
      clearHandlers();
      rejectPendingRequests('Extension stopped');
      resetShell();
      post('status', { ok: true, message: 'Local extension stopped' });
      return;
    }
    if (data.type === 'request-result') {
      settleRequest(data.payload && typeof data.payload === 'object' ? data.payload : {});
      return;
    }
    if (data.type === 'ai-result') {
      settleRequest(data.payload && typeof data.payload === 'object' ? data.payload : {});
      return;
    }
    if (data.type === 'event') {
      if (data.name === 'context') {
        latestContext = Object.freeze(data.payload && typeof data.payload === 'object' ? data.payload : {});
      }
      emit(String(data.name || 'event'), data.payload);
    }
  });

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => {
      reportLayout();
    });
    observer.observe(shell.shellEl);
  }
  resetShell();
  window.addEventListener('load', reportLayout, { once: true });
  window.addEventListener('resize', reportLayout, { passive: true });
  post('ready', {});
})();
</script>
</body></html>`;

  function readStorage(key, fallback = '') {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // ignore
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // ignore
    }
  }

  function sanitizeText(value, limit = 1200) {
    return String(value || '').replace(/\s+$/g, '').slice(0, limit);
  }

  function sanitizeMultilineText(value, limit = 4000) {
    return String(value || '').replace(/\r\n?/g, '\n').replace(/\s+$/g, '').slice(0, limit);
  }

  function notifyPanelOnlyCapability(name) {
    const label = sanitizeText(name, 80) || 'API';
    setStatus(
      localizeText(
        `${label} は無効です。拡張は専用パネル内だけで動作します。`,
        `${label} is disabled. Extensions run only inside the dedicated panel.`
      ),
      'warn'
    );
  }

  function getPluginStorageNamespace() {
    const source = sanitizeText(runtimeState.scriptFileName || '', 180).trim().toLowerCase();
    return source || 'default';
  }

  function readPluginStorageRoot() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_PLUGIN_DATA);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writePluginStorageRoot(root) {
    try {
      window.localStorage.setItem(STORAGE_KEY_PLUGIN_DATA, JSON.stringify(root || {}));
      return true;
    } catch (error) {
      return false;
    }
  }

  function readPluginStorageValue(key, fallback = null) {
    const storageKey = sanitizeText(key, 120).trim();
    if (!storageKey) {
      return fallback;
    }
    const root = readPluginStorageRoot();
    const namespace = getPluginStorageNamespace();
    const bucket = root[namespace];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket) || !(storageKey in bucket)) {
      return fallback;
    }
    return bucket[storageKey];
  }

  function writePluginStorageValue(key, value) {
    const storageKey = sanitizeText(key, 120).trim();
    if (!storageKey) {
      return false;
    }
    const root = readPluginStorageRoot();
    const namespace = getPluginStorageNamespace();
    const bucket = root[namespace] && typeof root[namespace] === 'object' && !Array.isArray(root[namespace])
      ? root[namespace]
      : {};
    bucket[storageKey] = value;
    root[namespace] = bucket;
    return writePluginStorageRoot(root);
  }

  function removePluginStorageValue(key) {
    const storageKey = sanitizeText(key, 120).trim();
    if (!storageKey) {
      return false;
    }
    const root = readPluginStorageRoot();
    const namespace = getPluginStorageNamespace();
    const bucket = root[namespace];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket) || !(storageKey in bucket)) {
      return true;
    }
    delete bucket[storageKey];
    root[namespace] = bucket;
    return writePluginStorageRoot(root);
  }

  function clearRetiredAiStorage() {
    RETIRED_AI_STORAGE_KEYS.forEach(key => {
      removeStorage(key);
    });
  }

  function normalizeToolId(value) {
    const base = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32);
    return base || '';
  }

  function normalizeToolDefinition(tool) {
    if (!tool || typeof tool !== 'object') {
      return null;
    }
    const id = normalizeToolId(tool.id);
    if (!id) {
      return null;
    }
    const label = sanitizeText(tool.label || id, 36) || id;
    const hint = sanitizeText(tool.hint || '', 120);
    return { id, label, hint };
  }

  function clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return min;
    }
    return Math.min(max, Math.max(min, num));
  }

  function normalizePaintColor(color) {
    const source = color && typeof color === 'object' ? color : {};
    const r = Math.round(clampNumber(source.r, 0, 255));
    const g = Math.round(clampNumber(source.g, 0, 255));
    const b = Math.round(clampNumber(source.b, 0, 255));
    let alpha = Number(source.a);
    if (!Number.isFinite(alpha)) {
      alpha = 255;
    }
    if (alpha >= 0 && alpha <= 1) {
      alpha *= 255;
    }
    const a = Math.round(clampNumber(alpha, 0, 255));
    return {
      key: `${r},${g},${b},${a}`,
      css: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
      a,
    };
  }

  function parsePixelCoordinate(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    return Math.trunc(num);
  }

  function getCanvasDomRefs() {
    const viewport = document.getElementById('canvasViewport');
    if (!(viewport instanceof HTMLElement)) {
      return null;
    }
    const activeLocalSurface = document.querySelector('.local-canvas-surface.is-active');
    if (activeLocalSurface instanceof HTMLElement) {
      const stack = activeLocalSurface.querySelector('.local-canvas-stack');
      const drawing = activeLocalSurface.querySelector('.local-canvas-surface__canvas');
      const selection = activeLocalSurface.querySelector('.local-canvas-surface__selection');
      if (stack instanceof HTMLElement && drawing instanceof HTMLCanvasElement) {
        return {
          viewport,
          stack,
          drawing,
          selection: selection instanceof HTMLCanvasElement ? selection : null,
        };
      }
    }
    const stack = document.getElementById('canvasStack');
    const drawing = document.getElementById('drawingCanvas');
    const selection = document.getElementById('selectionCanvas');
    if (!(stack instanceof HTMLElement) || !(drawing instanceof HTMLCanvasElement)) {
      return null;
    }
    return {
      viewport,
      stack,
      drawing,
      selection: selection instanceof HTMLCanvasElement ? selection : null,
    };
  }

  function clearLocalPaintOverlaySurface() {
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function repaintLocalPaintOverlay() {
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return;
    }
    clearLocalPaintOverlaySurface();
    if (!runtimeState.localPaintMap.size) {
      return;
    }
    let lastColor = '';
    for (const [key, paint] of runtimeState.localPaintMap.entries()) {
      if (!paint || typeof paint.css !== 'string') {
        continue;
      }
      const comma = key.indexOf(',');
      if (comma <= 0) {
        continue;
      }
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        continue;
      }
      if (paint.css !== lastColor) {
        ctx.fillStyle = paint.css;
        lastColor = paint.css;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function pruneLocalPaintOutsideBounds(width, height) {
    if (!runtimeState.localPaintMap.size) {
      return false;
    }
    let changed = false;
    const maxX = Math.max(0, Number(width) - 1);
    const maxY = Math.max(0, Number(height) - 1);
    for (const key of Array.from(runtimeState.localPaintMap.keys())) {
      const comma = key.indexOf(',');
      if (comma <= 0) {
        runtimeState.localPaintMap.delete(key);
        changed = true;
        continue;
      }
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > maxX || y > maxY) {
        runtimeState.localPaintMap.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  function syncLocalCanvasGeometry({ forceRepaint = false } = {}) {
    const refs = getCanvasDomRefs();
    const overlay = runtimeState.localOverlayCanvas;
    if (!refs || !(overlay instanceof HTMLCanvasElement)) {
      return;
    }
    const width = Math.max(1, Math.trunc(Number(refs.drawing.width) || 1));
    const height = Math.max(1, Math.trunc(Number(refs.drawing.height) || 1));
    const sizeChanged = overlay.width !== width || overlay.height !== height;
    if (sizeChanged) {
      overlay.width = width;
      overlay.height = height;
    }
    const styleWidth = refs.drawing.style.width || `${Math.max(1, refs.drawing.clientWidth || width)}px`;
    const styleHeight = refs.drawing.style.height || `${Math.max(1, refs.drawing.clientHeight || height)}px`;
    overlay.style.width = styleWidth;
    overlay.style.height = styleHeight;
    const inputLayer = runtimeState.localInputLayer;
    if (inputLayer instanceof HTMLElement) {
      inputLayer.style.width = styleWidth;
      inputLayer.style.height = styleHeight;
    }
    const pruned = pruneLocalPaintOutsideBounds(width, height);
    if (sizeChanged || pruned || forceRepaint) {
      repaintLocalPaintOverlay();
    }
  }

  function ensureLocalOverlayCanvas() {
    const refs = getCanvasDomRefs();
    if (!refs) {
      return null;
    }
    let canvas = runtimeState.localOverlayCanvas;
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) {
      canvas = document.createElement('canvas');
      canvas.id = 'localExtensionOverlayCanvas';
      canvas.className = 'local-ext-overlay-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const insertionPoint = refs.selection && refs.selection.parentElement === refs.stack ? refs.selection : null;
      refs.stack.insertBefore(canvas, insertionPoint);
      runtimeState.localOverlayCanvas = canvas;
      runtimeState.localOverlayCtx = canvas.getContext('2d');
    } else if (canvas.parentElement !== refs.stack) {
      const insertionPoint = refs.selection && refs.selection.parentElement === refs.stack ? refs.selection : null;
      refs.stack.insertBefore(canvas, insertionPoint);
    }
    syncLocalCanvasGeometry({ forceRepaint: true });
    return canvas;
  }

  function ensureLocalInputLayer() {
    const refs = getCanvasDomRefs();
    if (!refs) {
      return null;
    }
    let layer = runtimeState.localInputLayer;
    if (!(layer instanceof HTMLDivElement) || !layer.isConnected) {
      layer = document.createElement('div');
      layer.id = 'localExtensionInputLayer';
      layer.className = 'local-ext-input-layer';
      layer.setAttribute('aria-hidden', 'true');
      refs.stack.appendChild(layer);
      runtimeState.localInputLayer = layer;
    } else if (layer.parentElement !== refs.stack) {
      refs.stack.appendChild(layer);
    }
    syncLocalCanvasGeometry();
    return layer;
  }

  function shouldCaptureCanvasPointer() {
    return runtimeState.enabled && runtimeState.captureCanvasPointer && Boolean(runtimeState.activeLocalToolId);
  }

  function updateLocalInputLayerState() {
    const layer = ensureLocalInputLayer();
    if (!(layer instanceof HTMLDivElement)) {
      return;
    }
    const active = shouldCaptureCanvasPointer();
    layer.classList.toggle('is-active', active);
    layer.hidden = !active;
    layer.style.pointerEvents = active ? 'auto' : 'none';
  }

  function clearLocalPaintPixels() {
    runtimeState.localPaintMap.clear();
    clearLocalPaintOverlaySurface();
  }

  function paintLocalPixels(pixels, color) {
    ensureLocalOverlayCanvas();
    syncLocalCanvasGeometry();
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return 0;
    }
    if (!Array.isArray(pixels) || !pixels.length) {
      return 0;
    }
    const normalizedColor = normalizePaintColor(color);
    let painted = 0;
    const limit = Math.min(LOCAL_PAINT_BATCH_MAX, pixels.length);
    for (let i = 0; i < limit; i += 1) {
      const pixel = pixels[i];
      if (!pixel || typeof pixel !== 'object') {
        continue;
      }
      const x = parsePixelCoordinate(pixel.x);
      const y = parsePixelCoordinate(pixel.y);
      if (x === null || y === null) {
        continue;
      }
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        continue;
      }
      const key = `${x},${y}`;
      if (normalizedColor.a <= 0) {
        if (runtimeState.localPaintMap.delete(key)) {
          ctx.clearRect(x, y, 1, 1);
          painted += 1;
        }
        continue;
      }
      runtimeState.localPaintMap.set(key, {
        key: normalizedColor.key,
        css: normalizedColor.css,
      });
      ctx.fillStyle = normalizedColor.css;
      ctx.fillRect(x, y, 1, 1);
      painted += 1;
    }
    return painted;
  }

  function getToolPointerPayload(event, refs, trackedByPointer) {
    if (!refs) {
      return null;
    }
    const rect = refs.drawing.getBoundingClientRect();
    const width = Math.max(1, Math.trunc(Number(refs.drawing.width) || 1));
    const height = Math.max(1, Math.trunc(Number(refs.drawing.height) || 1));
    const safeRectWidth = rect.width > 0 ? rect.width : width;
    const safeRectHeight = rect.height > 0 ? rect.height : height;
    const rawX = ((event.clientX - rect.left) / safeRectWidth) * width;
    const rawY = ((event.clientY - rect.top) / safeRectHeight) * height;
    const x = Math.floor(rawX);
    const y = Math.floor(rawY);
    const clampedX = Math.min(width - 1, Math.max(0, x));
    const clampedY = Math.min(height - 1, Math.max(0, y));
    const inside = rawX >= 0 && rawY >= 0 && rawX < width && rawY < height;
    const target = event.target instanceof HTMLElement ? event.target : null;
    return {
      toolId: runtimeState.activeLocalToolId,
      pointerId: event.pointerId,
      pointerType: String(event.pointerType || ''),
      button: event.button,
      buttons: event.buttons,
      pressure: Number.isFinite(event.pressure) ? event.pressure : 0,
      isPrimary: Boolean(event.isPrimary),
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      trackedByPointer: Boolean(trackedByPointer),
      now: Date.now(),
      targetId: target ? target.id || '' : '',
      targetClass: target ? sanitizeText(target.className || '', 160) : '',
      client: { x: Math.round(event.clientX), y: Math.round(event.clientY) },
      cell: {
        x,
        y,
        clampedX,
        clampedY,
        inside,
        width,
        height,
      },
    };
  }

  function buildLocalToolSummary() {
    return runtimeState.localToolOrder
      .map(id => runtimeState.localTools.get(id))
      .filter(Boolean)
      .map(tool => ({ id: tool.id, label: tool.label, hint: tool.hint }));
  }

  function getLocalToolToolbarGlyph(label) {
    const text = sanitizeText(label, 40).trim();
    if (!text) {
      return 'LX';
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return text.replace(/\s+/g, '').slice(0, 2).toUpperCase();
  }

  function renderLocalToolButtons() {
    const ui = runtimeState.ui;
    const toolList = ui?.toolList instanceof HTMLElement ? ui.toolList : null;
    const toolGrid = document.getElementById('toolGrid');
    if (toolList) {
      toolList.innerHTML = '';
    }
    if (toolGrid instanceof HTMLElement) {
      Array.from(toolGrid.querySelectorAll('.local-ext-toolbar-button')).forEach(button => button.remove());
    }
    const tools = runtimeState.localToolOrder
      .map(id => runtimeState.localTools.get(id))
      .filter(Boolean);
    if (!tools.length) {
      if (toolList) {
        const empty = document.createElement('p');
        empty.className = 'help-text local-ext-panel__tool-empty';
        empty.textContent = localizeText(
          '専用パネル内で使う拡張UIを表示できます。',
          'Show extension UI inside the dedicated panel.'
        );
        toolList.appendChild(empty);
      }
      updatePanelVisibility();
      return;
    }
    const fragment = document.createDocumentFragment();
    tools.forEach(tool => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip local-ext-tool-button';
      button.dataset.toolId = tool.id;
      button.textContent = tool.label;
      if (tool.hint) {
        button.title = tool.hint;
      }
      const isActive = runtimeState.activeLocalToolId === tool.id;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.setAttribute(
        'aria-label',
        tool.hint
          ? `${tool.label}: ${tool.hint}`
          : `${tool.label}: ${localizeText('ローカルツール', 'Local tool')}`
      );
      button.addEventListener('click', () => {
        const currentlyActive = runtimeState.activeLocalToolId === tool.id;
        setActiveLocalToolId(currentlyActive ? '' : tool.id, { notifyRuntime: true });
      });
      fragment.appendChild(button);
    });
    if (toolList) {
      toolList.appendChild(fragment);
    }
    if (toolGrid instanceof HTMLElement) {
      const toolbarFragment = document.createDocumentFragment();
      tools.forEach(tool => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-button local-ext-toolbar-button';
        button.dataset.localExtToolId = tool.id;
        const isActive = runtimeState.activeLocalToolId === tool.id;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
        button.title = tool.hint
          ? `${tool.label} / ${tool.hint}`
          : `${tool.label} / ${localizeText('ローカルツール', 'Local tool')}`;
        button.setAttribute(
          'aria-label',
          tool.hint
            ? `${tool.label}: ${tool.hint}`
            : `${tool.label}: ${localizeText('ローカルツール', 'Local tool')}`
        );

        const icon = document.createElement('div');
        icon.className = 'tool-icon local-ext-toolbar-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = getLocalToolToolbarGlyph(tool.label);

        const label = document.createElement('span');
        label.textContent = tool.label;

        button.append(icon, label);
        button.addEventListener('click', () => {
          const currentlyActive = runtimeState.activeLocalToolId === tool.id;
          setActiveLocalToolId(currentlyActive ? '' : tool.id, { notifyRuntime: true });
        });
        toolbarFragment.appendChild(button);
      });
      toolGrid.appendChild(toolbarFragment);
    }
    updatePanelVisibility();
  }

  function renderLocalToolMeta() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.toolMeta instanceof HTMLElement)) {
      return;
    }
    const active = runtimeState.activeLocalToolId
      ? runtimeState.localTools.get(runtimeState.activeLocalToolId)
      : null;
    const activeLabel = active ? active.label : localizeText('なし', 'None');
    const captureLabel = runtimeState.captureCanvasPointer ? 'ON' : 'OFF';
    ui.toolMeta.textContent = localizeText(
      `選択中: ${activeLabel} / キャンバス入力取得: ${captureLabel}`,
      `Selected: ${activeLabel} / Canvas Capture: ${captureLabel}`
    );
    updatePanelVisibility();
  }

  function updatePanelVisibility() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    const hasWorkspace = runtimeState.enabled && Boolean(String(runtimeState.code || '').trim());
    if (ui.workspace instanceof HTMLElement) {
      ui.workspace.hidden = !hasWorkspace;
    }
    if (ui.toolBox instanceof HTMLElement) {
      ui.toolBox.hidden = true;
    }
    if (ui.clearToolButton instanceof HTMLButtonElement) {
      ui.clearToolButton.hidden = true;
    }
    const hasOutput = Boolean(
      (ui.outputTitle instanceof HTMLElement && ui.outputTitle.dataset.customized)
      || (ui.outputBody instanceof HTMLElement && ui.outputBody.dataset.customized)
    );
    if (ui.output instanceof HTMLElement) {
      ui.output.hidden = !hasOutput;
    }
  }

  function setActiveLocalToolId(toolId, { notifyRuntime = false } = {}) {
    const next = normalizeToolId(toolId);
    const hasNext = next && runtimeState.localTools.has(next);
    const resolved = hasNext ? next : '';
    if (runtimeState.activeLocalToolId === resolved) {
      renderLocalToolButtons();
      renderLocalToolMeta();
      updateLocalInputLayerState();
      return;
    }
    runtimeState.activeLocalToolId = resolved;
    runtimeState.trackedPointerId = null;
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
  }

  function bindBuiltInToolOverride() {
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target ? target.closest('.tool-button') : null;
      if (!(button instanceof HTMLElement) || button.classList.contains('local-ext-toolbar-button')) {
        return;
      }
      if (runtimeState.activeLocalToolId) {
        setActiveLocalToolId('', { notifyRuntime: true });
      }
    }, true);

    const toolGrid = document.getElementById('toolGrid');
    if (!(toolGrid instanceof HTMLElement) || typeof MutationObserver !== 'function') {
      return;
    }
    if (runtimeState.builtInToolObserver instanceof MutationObserver) {
      runtimeState.builtInToolObserver.disconnect();
    }
    runtimeState.builtInToolObserver = new MutationObserver(mutations => {
      if (!runtimeState.activeLocalToolId) {
        return;
      }
      const builtInToolActivated = mutations.some(mutation => {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') {
          return false;
        }
        const target = mutation.target;
        return target instanceof HTMLElement
          && target.matches('.tool-button[data-tool]:not(.local-ext-toolbar-button)')
          && target.classList.contains('is-active');
      });
      if (builtInToolActivated) {
        setActiveLocalToolId('', { notifyRuntime: true });
      }
    });
    runtimeState.builtInToolObserver.observe(toolGrid, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function clearLocalTools({ notifyRuntime = true } = {}) {
    runtimeState.localTools.clear();
    runtimeState.localToolOrder = [];
    runtimeState.activeLocalToolId = '';
    runtimeState.captureCanvasPointer = false;
    runtimeState.trackedPointerId = null;
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
  }

  function registerLocalTool(tool, { notifyRuntime = true } = {}) {
    const normalized = normalizeToolDefinition(tool);
    if (!normalized) {
      return false;
    }
    if (!runtimeState.localTools.has(normalized.id)) {
      if (runtimeState.localToolOrder.length >= LOCAL_TOOL_MAX_COUNT) {
        setStatus(
          localizeText(
            `ローカルツールは最大 ${LOCAL_TOOL_MAX_COUNT} 件までです`,
            `Local tools are limited to ${LOCAL_TOOL_MAX_COUNT}.`
          ),
          'warn'
        );
        return false;
      }
      runtimeState.localToolOrder.push(normalized.id);
    }
    runtimeState.localTools.set(normalized.id, normalized);
    if (!runtimeState.activeLocalToolId) {
      runtimeState.activeLocalToolId = normalized.id;
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    return true;
  }

  function unregisterLocalTool(toolId, { notifyRuntime = true } = {}) {
    const normalizedId = normalizeToolId(toolId);
    if (!normalizedId || !runtimeState.localTools.has(normalizedId)) {
      return false;
    }
    runtimeState.localTools.delete(normalizedId);
    runtimeState.localToolOrder = runtimeState.localToolOrder.filter(id => id !== normalizedId);
    if (runtimeState.activeLocalToolId === normalizedId) {
      runtimeState.activeLocalToolId = runtimeState.localToolOrder[0] || '';
      runtimeState.trackedPointerId = null;
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    return true;
  }

  function makeContextSnapshot() {
    const activeTool = document.querySelector('.tool-button.is-active')?.getAttribute('data-tool') || '';
    const activeLeft = document.querySelector('.rail-tab[data-left-tab][aria-selected="true"]')?.getAttribute('data-left-tab') || '';
    const activeRight = document.querySelector('.rail-tab[data-right-tab][aria-selected="true"]')?.getAttribute('data-right-tab') || '';
    const multiStatusText = (document.getElementById('multiStatus')?.textContent || '').trim();
    return {
      href: window.location.href,
      language: (document.documentElement.lang || 'ja').toLowerCase(),
      now: Date.now(),
      isMobileLayout: document.body.classList.contains('is-mobile-layout'),
      activeTool,
      activeLeftTab: activeLeft,
      activeRightTab: activeRight,
      multiStatus: multiStatusText,
      isMultiActive: !/off|OFF|オフ/.test(multiStatusText),
      localToolCount: runtimeState.localToolOrder.length,
      activeLocalToolId: runtimeState.activeLocalToolId || '',
      localToolCapture: Boolean(runtimeState.captureCanvasPointer),
      localPaintPixelCount: runtimeState.localPaintMap.size,
    };
  }

  function setStatus(message, kind = 'info') {
    const ui = runtimeState.ui;
    if (!ui || !(ui.status instanceof HTMLElement)) {
      return;
    }
    ui.status.textContent = sanitizeText(message, 300);
    ui.status.dataset.kind = kind;
  }

  function setOutput(title = '', body = '') {
    const ui = runtimeState.ui;
    if (!ui || !(ui.outputTitle instanceof HTMLElement) || !(ui.outputBody instanceof HTMLElement)) {
      return;
    }
    const nextTitle = sanitizeText(title, 80);
    const nextBody = sanitizeText(body, 1800);
    if (nextTitle) {
      ui.outputTitle.textContent = nextTitle;
      ui.outputTitle.dataset.customized = 'true';
    } else {
      ui.outputTitle.textContent = localizeText('ローカル出力', 'Local Output');
      delete ui.outputTitle.dataset.customized;
    }
    if (nextBody) {
      ui.outputBody.textContent = nextBody;
      ui.outputBody.dataset.customized = 'true';
    } else {
      ui.outputBody.textContent = localizeText(
        '拡張コードから api.panel(title, body) で表示できます。',
        'Display text here from extension code with api.panel(title, body).'
      );
      delete ui.outputBody.dataset.customized;
    }
    updatePanelVisibility();
  }

  function setBadge(text) {
    const ui = runtimeState.ui;
    if (!ui || !(ui.badge instanceof HTMLElement)) {
      return;
    }
    const label = sanitizeText(text, 160);
    ui.badge.textContent = label;
    ui.badge.classList.toggle('is-visible', Boolean(label));
  }

  function syncSandboxFrameMount(frame) {
    const host = runtimeState.ui?.workspaceBody instanceof HTMLElement ? runtimeState.ui.workspaceBody : null;
    if (!(frame instanceof HTMLIFrameElement) || !(host instanceof HTMLElement)) {
      return;
    }
    if (frame.parentElement !== host) {
      host.appendChild(frame);
    }
  }

  function setSandboxFrameHeight(height) {
    const frame = runtimeState.frame;
    if (!(frame instanceof HTMLIFrameElement)) {
      return;
    }
    const nextHeight = Math.round(clampNumber(height, SANDBOX_FRAME_MIN_HEIGHT, SANDBOX_FRAME_MAX_HEIGHT));
    if (runtimeState.frameHeight === nextHeight && frame.style.height === `${nextHeight}px`) {
      return;
    }
    runtimeState.frameHeight = nextHeight;
    frame.style.height = `${nextHeight}px`;
  }

  function postSandboxRequestResult(requestId, ok, payload = {}) {
    const id = sanitizeText(requestId, 120).trim();
    if (!id) {
      return;
    }
    postToSandbox('request-result', {
      payload: {
        id,
        ok: Boolean(ok),
        ...(payload && typeof payload === 'object' ? payload : {}),
      },
    });
  }

  function destroySandboxFrame() {
    if (runtimeState.frame instanceof HTMLIFrameElement) {
      runtimeState.frame.remove();
    }
    runtimeState.frame = null;
    runtimeState.frameReady = false;
    runtimeState.messageQueue = [];
  }

  function ensureSandboxFrame() {
    if (runtimeState.frame instanceof HTMLIFrameElement) {
      syncSandboxFrameMount(runtimeState.frame);
      setSandboxFrameHeight(runtimeState.frameHeight);
      return runtimeState.frame;
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'local-ext-runtime-frame';
    iframe.setAttribute('title', 'Local extension sandbox');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.srcdoc = SANDBOX_SRC;
    iframe.addEventListener('load', () => {
      runtimeState.frameReady = true;
      setSandboxFrameHeight(runtimeState.frameHeight);
      flushQueuedMessages();
    });
    syncSandboxFrameMount(iframe);
    runtimeState.frame = iframe;
    runtimeState.frameReady = false;
    runtimeState.messageQueue = [];
    setSandboxFrameHeight(runtimeState.frameHeight);
    return iframe;
  }

  function postToSandbox(type, payload = {}) {
    const frame = ensureSandboxFrame();
    const targetWindow = frame.contentWindow;
    const packet = {
      __pixieLocalHost: 1,
      type,
      ...payload,
    };
    if (!runtimeState.frameReady || !targetWindow) {
      runtimeState.messageQueue.push(packet);
      return;
    }
    targetWindow.postMessage(packet, '*');
  }

  function flushQueuedMessages() {
    const frame = runtimeState.frame;
    const targetWindow = frame instanceof HTMLIFrameElement ? frame.contentWindow : null;
    if (!(frame instanceof HTMLIFrameElement) || !targetWindow || !runtimeState.frameReady) {
      return;
    }
    const queued = runtimeState.messageQueue.slice();
    runtimeState.messageQueue = [];
    queued.forEach(packet => {
      targetWindow.postMessage(packet, '*');
    });
  }

  function unloadRuntime() {
    if (runtimeState.frame instanceof HTMLIFrameElement && runtimeState.frameReady) {
      postToSandbox('unload');
    }
    destroySandboxFrame();
    if (runtimeState.intervalTimer !== null) {
      window.clearInterval(runtimeState.intervalTimer);
      runtimeState.intervalTimer = null;
    }
    clearLocalTools({ notifyRuntime: false });
    clearLocalPaintPixels();
    updateLocalInputLayerState();
    setBadge('');
    setOutput('', '');
    updatePanelVisibility();
  }

  function dispatchEventToRuntime(name, payload) {
    if (!runtimeState.enabled) {
      return;
    }
    postToSandbox('event', {
      name,
      payload,
    });
  }

  function startRuntime() {
    if (!runtimeState.enabled) {
      return;
    }
    const code = String(runtimeState.code || '').trim();
    if (!code) {
      setStatus(localizeText('拡張コードが空です', 'Extension code is empty'), 'warn');
      setBadge('');
      return;
    }
    unloadRuntime();
    syncLocalCanvasGeometry();
    ensureSandboxFrame();
    postToSandbox('load', {
      code,
      context: makeContextSnapshot(),
    });
    dispatchEventToRuntime('context', makeContextSnapshot());
    if (runtimeState.intervalTimer !== null) {
      window.clearInterval(runtimeState.intervalTimer);
    }
    runtimeState.intervalTimer = window.setInterval(() => {
      syncLocalCanvasGeometry();
      const snapshot = makeContextSnapshot();
      dispatchEventToRuntime('context', snapshot);
      dispatchEventToRuntime('interval', {
        now: Date.now(),
        context: snapshot,
      });
    }, 1500);
  }

  function reloadRuntime() {
    if (!runtimeState.enabled) {
      unloadRuntime();
      setStatus(localizeText('ローカル拡張はOFFです', 'Local extension is OFF'), 'info');
      return;
    }
    startRuntime();
  }

  function setEnabled(enabled, { persist = true, restart = true } = {}) {
    runtimeState.enabled = Boolean(enabled);
    if (runtimeState.ui?.enabled instanceof HTMLInputElement) {
      runtimeState.ui.enabled.checked = runtimeState.enabled;
    }
    if (persist) {
      writeStorage(STORAGE_KEY_ENABLED, runtimeState.enabled ? '1' : '0');
    }
    updatePanelVisibility();
    if (restart) {
      reloadRuntime();
    } else {
      updateLocalInputLayerState();
    }
  }

  function maybeDispatchToolPointerEvent(event, phase) {
    if (!runtimeState.enabled || !runtimeState.activeLocalToolId) {
      return false;
    }
    const refs = getCanvasDomRefs();
    if (!refs) {
      return false;
    }
    const targetNode = event.target instanceof Node ? event.target : null;
    const isInViewport = targetNode ? refs.viewport.contains(targetNode) : false;
    const isTracked = runtimeState.trackedPointerId !== null && event.pointerId === runtimeState.trackedPointerId;
    if (phase === 'pointerdown' && !isInViewport) {
      return false;
    }
    if (phase !== 'pointerdown' && !isInViewport && !isTracked) {
      return false;
    }
    ensureLocalOverlayCanvas();
    syncLocalCanvasGeometry();
    const payload = getToolPointerPayload(event, refs, isTracked);
    if (!payload) {
      return false;
    }
    dispatchEventToRuntime(`tool:${phase}`, payload);
    if (phase === 'pointerdown' && (isInViewport || payload.cell.inside)) {
      runtimeState.trackedPointerId = event.pointerId;
      const layer = runtimeState.localInputLayer;
      if (shouldCaptureCanvasPointer() && layer instanceof HTMLDivElement && event.target === layer && typeof layer.setPointerCapture === 'function') {
        try {
          layer.setPointerCapture(event.pointerId);
        } catch (error) {
          // ignore
        }
      }
    }
    if (phase === 'pointerup' || phase === 'pointercancel') {
      const layer = runtimeState.localInputLayer;
      if (isTracked && layer instanceof HTMLDivElement && typeof layer.releasePointerCapture === 'function') {
        try {
          if (typeof layer.hasPointerCapture === 'function' && layer.hasPointerCapture(event.pointerId)) {
            layer.releasePointerCapture(event.pointerId);
          }
        } catch (error) {
          // ignore
        }
      }
      if (runtimeState.trackedPointerId === event.pointerId) {
        runtimeState.trackedPointerId = null;
      }
    }
    const captured = shouldCaptureCanvasPointer() && (isInViewport || isTracked);
    if (captured) {
      event.preventDefault();
      event.stopPropagation();
    }
    return captured;
  }

  function replyRetiredAiRequest(payload, sourceWindow) {
    const requestId = sanitizeText(payload?.id || '', 120);
    const frame = runtimeState.frame;
    if (!requestId || !(frame instanceof HTMLIFrameElement) || frame.contentWindow !== sourceWindow) {
      return;
    }
    postToSandbox('ai-result', {
      payload: {
        id: requestId,
        ok: false,
        message: localizeText(
          'PiXiEEDraw の GPT連携は廃止されました',
          'PiXiEEDraw local AI integration has been retired'
        ),
      },
    });
  }

  function bindGlobalEvents() {
    window.addEventListener('message', event => {
      const frame = runtimeState.frame;
      if (!(frame instanceof HTMLIFrameElement) || event.source !== frame.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || data.__pixieLocalExt !== 1) {
        return;
      }
      if (data.type === 'ready') {
        flushQueuedMessages();
        return;
      }
      if (data.type === 'ai-request') {
        replyRetiredAiRequest(data.payload && typeof data.payload === 'object' ? data.payload : {}, event.source);
        return;
      }
      if (data.type === 'disabled-capability') {
        notifyPanelOnlyCapability(data.payload && data.payload.name ? data.payload.name : 'API');
        return;
      }
      if (data.type === 'layout') {
        const height = Number(data.payload && data.payload.height);
        if (Number.isFinite(height)) {
          setSandboxFrameHeight(height + 2);
        }
        return;
      }
      if (data.type === 'storage-get') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const fallback = Object.prototype.hasOwnProperty.call(payload, 'fallback') ? payload.fallback : null;
        const value = readPluginStorageValue(payload.key, fallback);
        postSandboxRequestResult(payload.id, true, { value });
        return;
      }
      if (data.type === 'storage-set') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const ok = writePluginStorageValue(payload.key, payload.value);
        postSandboxRequestResult(
          payload.id,
          ok,
          ok ? {} : {
            message: localizeText('ローカル保存に失敗しました', 'Failed to save local extension data'),
          }
        );
        return;
      }
      if (data.type === 'storage-remove') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const ok = removePluginStorageValue(payload.key);
        postSandboxRequestResult(
          payload.id,
          ok,
          ok ? {} : {
            message: localizeText('ローカル保存の削除に失敗しました', 'Failed to remove local extension data'),
          }
        );
        return;
      }
      if (data.type === 'tool-register') {
        notifyPanelOnlyCapability('api.registerTool');
        return;
      }
      if (data.type === 'tool-unregister') {
        notifyPanelOnlyCapability('api.unregisterTool');
        return;
      }
      if (data.type === 'tools-clear') {
        notifyPanelOnlyCapability('api.clearTools');
        return;
      }
      if (data.type === 'tool-activate') {
        notifyPanelOnlyCapability('api.activateTool');
        return;
      }
      if (data.type === 'pointer-capture') {
        notifyPanelOnlyCapability('api.capturePointer');
        return;
      }
      if (data.type === 'local-paint') {
        notifyPanelOnlyCapability('api.drawPixels');
        return;
      }
      if (data.type === 'local-paint-clear') {
        notifyPanelOnlyCapability('api.clearPixels');
        return;
      }
      if (data.type === 'status') {
        const ok = Boolean(data.payload && data.payload.ok);
        const message = sanitizeText(data.payload && data.payload.message ? data.payload.message : '', 320);
        setStatus(
          message || localizeText(ok ? '読み込み完了' : 'エラー', ok ? 'Loaded' : 'Error'),
          ok ? 'success' : 'error'
        );
        return;
      }
      if (data.type === 'toast') {
        const message = sanitizeText(data.payload && data.payload.message ? data.payload.message : '', 300);
        const level = sanitizeText(data.payload && data.payload.level ? data.payload.level : 'info', 16);
        setStatus(message, level === 'success' ? 'success' : (level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info')));
        return;
      }
      if (data.type === 'badge') {
        setBadge(data.payload && data.payload.text ? data.payload.text : '');
        return;
      }
      if (data.type === 'panel') {
        const title = data.payload && data.payload.title ? data.payload.title : '';
        const body = data.payload && data.payload.body ? data.payload.body : '';
        setOutput(title, body);
        return;
      }
      if (data.type === 'log') {
        const values = Array.isArray(data.payload && data.payload.values) ? data.payload.values : [];
        if (values.length) {
          setStatus(values.join(' | '), 'info');
        }
      }
    });
  }

  function buildUi() {
    const extensionsBody = document.querySelector('#panelExtensions .panel-section__body');
    if (!(extensionsBody instanceof HTMLElement)) {
      return null;
    }

    const panel = document.createElement('div');
    panel.className = 'field field--list local-ext-panel';
    panel.id = 'localExtensionPanel';

    const title = document.createElement('div');
    title.className = 'local-ext-panel__title';
    title.textContent = localizeText('ローカル拡張（外付け）', 'Local Extension (External)');
    panel.appendChild(title);

    const body = document.createElement('div');
    body.className = 'local-ext-panel__body';

    const description = document.createElement('p');
    description.className = 'help-text ui-guide-text';
    description.textContent = localizeText(
      'この端末だけで動く sandbox 内で拡張を実行します。独自UIや canvas は作れますが、既存UI・メインキャンバス・共有状態・外部サイトには触れません。',
      'Extensions run only on this device inside a sandbox. They can build custom UI and canvases, but cannot touch the existing UI, main canvas, shared state, or external sites.'
    );
    body.appendChild(description);

    const row = document.createElement('div');
    row.className = 'local-ext-panel__row';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-option';
    toggleLabel.setAttribute('for', 'localExtensionEnabled');
    const enabled = document.createElement('input');
    enabled.id = 'localExtensionEnabled';
    enabled.type = 'checkbox';
    const toggleText = document.createElement('span');
    toggleText.textContent = localizeText('有効化', 'Enable');
    toggleLabel.append(enabled, toggleText);
    row.appendChild(toggleLabel);
    body.appendChild(row);

    const scriptField = document.createElement('div');
    scriptField.className = 'local-ext-panel__field';

    const scriptLabel = document.createElement('span');
    scriptLabel.className = 'local-ext-panel__script-label';
    scriptLabel.textContent = localizeText('拡張ファイル', 'Extension File');

    const scriptValue = document.createElement('div');
    scriptValue.className = 'local-ext-panel__script-value';
    scriptValue.textContent = getBoundScriptLabel();
    scriptValue.dataset.empty = 'true';

    const scriptHint = document.createElement('p');
    scriptHint.className = 'help-text local-ext-panel__script-hint';
    scriptHint.textContent = canUseScriptFileSystem()
      ? localizeText(
        '作成または選択した `.js` を外部エディタで保存すると自動反映します。',
        'Save the created or selected `.js` in an external editor to auto-apply changes.'
      )
      : localizeText(
        '既存の `.js` を選んで使えます。更新後はもう一度選び直してください。',
        'You can use an existing `.js` file here. Re-select it after editing to update it.'
      );

    scriptField.append(scriptLabel, scriptValue, scriptHint);
    body.appendChild(scriptField);

    const code = document.createElement('textarea');
    code.id = 'localExtensionCode';
    code.className = 'local-ext-panel__code';
    code.spellcheck = false;
    code.readOnly = true;
    code.placeholder = localizeText('ここに現在のスクリプトが表示されます', 'The current script is shown here');
    code.hidden = true;
    body.appendChild(code);

    const scriptFileInput = document.createElement('input');
    scriptFileInput.type = 'file';
    scriptFileInput.accept = '.js,.txt,text/javascript,text/plain';
    scriptFileInput.hidden = true;
    scriptFileInput.id = 'localExtensionScriptFile';
    body.appendChild(scriptFileInput);

    const actions = document.createElement('div');
    actions.className = 'local-ext-panel__actions';

    const createScriptButton = document.createElement('button');
    createScriptButton.type = 'button';
    createScriptButton.className = 'button button--primary';
    createScriptButton.textContent = localizeText('拡張ファイルを作る', 'Create Extension File');

    const chooseScriptButton = document.createElement('button');
    chooseScriptButton.type = 'button';
    chooseScriptButton.className = 'button';
    chooseScriptButton.textContent = localizeText('既存ファイルを選ぶ', 'Choose Existing File');

    actions.append(createScriptButton, chooseScriptButton);
    body.appendChild(actions);

    const workspace = document.createElement('div');
    workspace.className = 'local-ext-panel__workspace';
    workspace.hidden = true;

    const workspaceTitle = document.createElement('div');
    workspaceTitle.className = 'local-ext-panel__workspace-title';
    workspaceTitle.textContent = localizeText('拡張UI', 'Extension UI');

    const workspaceBody = document.createElement('div');
    workspaceBody.className = 'local-ext-panel__workspace-body';

    workspace.append(workspaceTitle, workspaceBody);
    body.appendChild(workspace);

    const toolBox = document.createElement('div');
    toolBox.className = 'local-ext-panel__tools';
    toolBox.hidden = true;

    const toolHeading = document.createElement('div');
    toolHeading.className = 'local-ext-panel__tools-heading';
    toolHeading.textContent = localizeText('ローカルツール', 'Local Tools');

    const clearToolButton = document.createElement('button');
    clearToolButton.type = 'button';
    clearToolButton.className = 'chip';
    clearToolButton.textContent = localizeText('選択解除', 'Clear Selection');

    const toolHeadingActions = document.createElement('div');
    toolHeadingActions.className = 'local-ext-panel__tools-actions';
    toolHeadingActions.appendChild(clearToolButton);

    const toolHeadingRow = document.createElement('div');
    toolHeadingRow.className = 'local-ext-panel__tools-row';
    toolHeadingRow.append(toolHeading, toolHeadingActions);

    const toolList = document.createElement('div');
    toolList.className = 'local-ext-panel__tool-list';

    const toolMeta = document.createElement('p');
    toolMeta.className = 'help-text local-ext-panel__tool-meta';

    toolBox.append(toolHeadingRow, toolList, toolMeta);
    body.appendChild(toolBox);

    const status = document.createElement('p');
    status.className = 'help-text local-ext-panel__status';
    status.id = 'localExtensionStatus';
    status.setAttribute('aria-live', 'polite');
    body.appendChild(status);

    const output = document.createElement('div');
    output.className = 'local-ext-panel__output';
    output.hidden = true;
    const outputTitle = document.createElement('div');
    outputTitle.className = 'local-ext-panel__output-title';
    outputTitle.textContent = localizeText('ローカル出力', 'Local Output');
    const outputBody = document.createElement('div');
    outputBody.className = 'local-ext-panel__output-body';
    outputBody.textContent = localizeText(
      '拡張コードから api.panel(title, body) で表示できます。',
      'Display text here from extension code with api.panel(title, body).'
    );
    output.append(outputTitle, outputBody);
    body.appendChild(output);

    panel.appendChild(body);
    extensionsBody.prepend(panel);

    return {
      panel,
      title,
      description,
      enabled,
      toggleText,
      scriptLabel,
      scriptValue,
      scriptHint,
      code,
      scriptFileInput,
      createScriptButton,
      chooseScriptButton,
      workspace,
      workspaceTitle,
      workspaceBody,
      toolBox,
      toolHeading,
      clearToolButton,
      toolList,
      toolMeta,
      status,
      output,
      outputTitle,
      outputBody,
      badge: null,
    };
  }

  function applyUiLocalization() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    if (ui.title instanceof HTMLElement) {
      ui.title.textContent = localizeText('ローカル拡張（外付け）', 'Local Extension (External)');
    }
    if (ui.description instanceof HTMLElement) {
      ui.description.textContent = localizeText(
        'この端末だけで動く sandbox 内で拡張を実行します。独自UIや canvas を作れますが、共有状態や外部サイトには触れません。',
        'Extensions run only on this device inside a sandbox. They can build custom UI and canvases, but cannot touch shared state or external sites.'
      );
    }
    if (ui.toggleText instanceof HTMLElement) {
      ui.toggleText.textContent = localizeText('有効化', 'Enable');
    }
    if (ui.code instanceof HTMLTextAreaElement) {
      ui.code.placeholder = localizeText('ここに現在のスクリプトが表示されます', 'The current script is shown here');
    }
    if (ui.scriptLabel instanceof HTMLElement) {
      ui.scriptLabel.textContent = localizeText('拡張ファイル', 'Extension File');
    }
    refreshScriptBindingUi();
    if (ui.scriptHint instanceof HTMLElement) {
      ui.scriptHint.textContent = canUseScriptFileSystem()
        ? localizeText(
          '作成または選択した `.js` を外部エディタで保存すると自動反映します。',
          'Save the created or selected `.js` in an external editor to auto-apply changes.'
        )
        : localizeText(
          '既存の `.js` を選んで使えます。更新後はもう一度選び直してください。',
          'You can use an existing `.js` file here. Re-select it after editing to update it.'
        );
    }
    if (ui.createScriptButton instanceof HTMLButtonElement) {
      ui.createScriptButton.textContent = localizeText('拡張ファイルを作る', 'Create Extension File');
      ui.createScriptButton.hidden = !canUseScriptFileSystem();
    }
    if (ui.chooseScriptButton instanceof HTMLButtonElement) {
      ui.chooseScriptButton.textContent = localizeText('既存ファイルを選ぶ', 'Choose Existing File');
    }
    if (ui.workspaceTitle instanceof HTMLElement) {
      ui.workspaceTitle.textContent = localizeText('拡張UI', 'Extension UI');
    }
    if (ui.toolHeading instanceof HTMLElement) {
      ui.toolHeading.textContent = localizeText('ローカルツール', 'Local Tools');
    }
    if (ui.clearToolButton instanceof HTMLButtonElement) {
      ui.clearToolButton.textContent = localizeText('選択解除', 'Clear Selection');
    }
    if (ui.outputTitle instanceof HTMLElement && !ui.outputTitle.dataset.customized) {
      ui.outputTitle.textContent = localizeText('ローカル出力', 'Local Output');
    }
    if (ui.outputBody instanceof HTMLElement && !ui.outputBody.dataset.customized) {
      ui.outputBody.textContent = localizeText(
        '拡張コードから api.panel(title, body) で表示できます。',
        'Display text here from extension code with api.panel(title, body).'
      );
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updatePanelVisibility();
  }

  function hydrateUi() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    clearRetiredAiStorage();
    runtimeState.code = readStorage(STORAGE_KEY_CODE, '');
    runtimeState.enabled = readStorage(STORAGE_KEY_ENABLED, '0') === '1';
    ui.enabled.checked = runtimeState.enabled;
    ui.code.value = runtimeState.code;
    applyUiLocalization();
    refreshScriptBindingUi();

    ui.enabled.addEventListener('change', () => {
      setEnabled(ui.enabled.checked, { persist: true, restart: true });
    });

    ui.createScriptButton.addEventListener('click', async () => {
      await createTemplateScriptFile();
    });

    ui.chooseScriptButton.addEventListener('click', async () => {
      if (canUseScriptFileSystem()) {
        const picked = await pickScriptFileHandle();
        if (picked) {
          return;
        }
      }
      if (ui.scriptFileInput instanceof HTMLInputElement) {
        ui.scriptFileInput.click();
      }
    });

    ui.scriptFileInput.addEventListener('change', async () => {
      const file = ui.scriptFileInput.files && ui.scriptFileInput.files[0] ? ui.scriptFileInput.files[0] : null;
      if (file) {
        await importScriptFile(file);
      }
      ui.scriptFileInput.value = '';
    });

    ui.clearToolButton.addEventListener('click', () => {
      setActiveLocalToolId('', { notifyRuntime: true });
      setStatus(localizeText('ローカルツールの選択を解除しました', 'Cleared local tool selection'), 'info');
    });

    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    updatePanelVisibility();
  }

  function init() {
    clearRetiredAiStorage();
    const ui = buildUi();
    if (!ui) {
      return;
    }
    runtimeState.ui = ui;
    hydrateUi();
    window.addEventListener('pixieedraw:uilanguagechange', () => {
      applyUiLocalization();
    });
    bindGlobalEvents();
    bindBuiltInToolOverride();
    if (runtimeState.enabled) {
      startRuntime();
    } else {
      setStatus(localizeText('ローカル拡張はOFFです', 'Local extension is OFF'), 'info');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
