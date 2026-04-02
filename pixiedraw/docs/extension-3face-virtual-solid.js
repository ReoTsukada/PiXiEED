/*
 * PiXiEEDraw Extension Template
 * 3-Face Virtual Solid
 * Name: 3-Face Virtual Solid
 * Version: 0.1.0
 * Author: OpenAI Codex
 * Description: 前面・横面・上面の3面入力から仮想立体プレビューを生成する拡張機能
 *
 * この拡張は PiXiEEDraw の拡張機能です。
 * sandbox iframe の中だけで動作します。
 * 外部通信や Supabase 接続は行いません。
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'three-face-virtual-solid-v1';
  const GRID_SIZE = 16;
  const CELL_SIZE = 16;
  const PREVIEW_SCALE = 12;
  const FACES = ['front', 'side', 'top'];
  const FACE_LABELS = {
    front: '前面 Front',
    side: '横面 Side',
    top: '上面 Top',
  };
  const COLORS = {
    bg: '#071018',
    panel: 'rgba(8, 18, 26, 0.88)',
    panelStrong: 'rgba(12, 26, 36, 0.96)',
    grid: 'rgba(166, 234, 255, 0.12)',
    fill: '#7ce3ff',
    fillSoft: 'rgba(124, 227, 255, 0.18)',
    hover: 'rgba(255, 210, 122, 0.26)',
    text: '#eaf8ff',
    muted: 'rgba(234, 248, 255, 0.72)',
    line: 'rgba(166, 234, 255, 0.24)',
    top: '#ffd27a',
    front: '#7ce3ff',
    side: '#5ab6d6',
  };

  const state = {
    activeFace: 'front',
    faces: createFaceSet(),
    hover: null,
    dragPointerId: null,
    dragPaintValue: true,
    saveTimer: null,
  };

  function createGrid() {
    return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  }

  function cloneGrid(grid) {
    return grid.map(row => row.slice());
  }

  function createFaceSet() {
    return {
      front: createGrid(),
      side: createGrid(),
      top: createGrid(),
    };
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
        if (child instanceof Node) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  function serializeState() {
    return {
      activeFace: state.activeFace,
      faces: {
        front: cloneGrid(state.faces.front),
        side: cloneGrid(state.faces.side),
        top: cloneGrid(state.faces.top),
      },
    };
  }

  async function loadState() {
    try {
      const saved = await api.storage.get(STORAGE_KEY, null);
      if (!saved || typeof saved !== 'object') {
        return;
      }
      if (saved.activeFace && FACES.includes(saved.activeFace)) {
        state.activeFace = saved.activeFace;
      }
      FACES.forEach(face => {
        const source = saved.faces && Array.isArray(saved.faces[face]) ? saved.faces[face] : null;
        if (!source) {
          return;
        }
        const next = createGrid();
        for (let y = 0; y < GRID_SIZE; y += 1) {
          const row = Array.isArray(source[y]) ? source[y] : [];
          for (let x = 0; x < GRID_SIZE; x += 1) {
            next[y][x] = Boolean(row[x]);
          }
        }
        state.faces[face] = next;
      });
    } catch (_) {
      // ignore
    }
  }

  function saveStateSoon() {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }
    state.saveTimer = setTimeout(async () => {
      state.saveTimer = null;
      try {
        await api.storage.set(STORAGE_KEY, serializeState());
      } catch (_) {
        // ignore
      }
    }, 120);
  }

  function clearFace(face) {
    state.faces[face] = createGrid();
    renderAll();
    saveStateSoon();
  }

  function clearAllFaces() {
    state.faces = createFaceSet();
    renderAll();
    saveStateSoon();
  }

  function setCell(face, x, y, value) {
    if (!FACES.includes(face)) {
      return false;
    }
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return false;
    }
    const nextValue = Boolean(value);
    if (state.faces[face][y][x] === nextValue) {
      return false;
    }
    state.faces[face][y][x] = nextValue;
    return true;
  }

  function getCellFromPointer(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const rawX = (event.clientX - rect.left) * scaleX;
    const rawY = (event.clientY - rect.top) * scaleY;
    const x = Math.floor(rawX / CELL_SIZE);
    const y = Math.floor(rawY / CELL_SIZE);
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return null;
    }
    return { x, y };
  }

  function buildVoxelVolume() {
    const front = state.faces.front;
    const side = state.faces.side;
    const top = state.faces.top;
    const voxels = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          if (front[y][x] && side[y][z] && top[z][x]) {
            voxels.push({ x, y, z });
          }
        }
      }
    }
    voxels.sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z));
    return voxels;
  }

  function projectIso(x, y, z) {
    const px = (x - z) * PREVIEW_SCALE;
    const py = (x + z) * (PREVIEW_SCALE * 0.5) - y * PREVIEW_SCALE;
    return { x: px, y: py };
  }

  function drawDiamond(ctx, cx, cy, scale, fill) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - scale * 0.5);
    ctx.lineTo(cx + scale, cy);
    ctx.lineTo(cx, cy + scale * 0.5);
    ctx.lineTo(cx - scale, cy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = COLORS.line;
    ctx.stroke();
  }

  function drawQuad(ctx, points, fill) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = COLORS.line;
    ctx.stroke();
  }

  function renderPreview() {
    const ctx = refs.preview.ctx;
    const canvas = refs.preview.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const voxels = buildVoxelVolume();
    const baseX = canvas.width * 0.5;
    const baseY = canvas.height * 0.72;
    voxels.forEach(voxel => {
      const origin = projectIso(voxel.x, voxel.y, voxel.z);
      const ox = baseX + origin.x;
      const oy = baseY + origin.y;

      drawDiamond(ctx, ox, oy - PREVIEW_SCALE * 0.5, PREVIEW_SCALE, COLORS.top);
      drawQuad(ctx, [
        { x: ox - PREVIEW_SCALE, y: oy },
        { x: ox, y: oy + PREVIEW_SCALE * 0.5 },
        { x: ox, y: oy + PREVIEW_SCALE * 1.5 },
        { x: ox - PREVIEW_SCALE, y: oy + PREVIEW_SCALE },
      ], COLORS.front);
      drawQuad(ctx, [
        { x: ox + PREVIEW_SCALE, y: oy },
        { x: ox, y: oy + PREVIEW_SCALE * 0.5 },
        { x: ox, y: oy + PREVIEW_SCALE * 1.5 },
        { x: ox + PREVIEW_SCALE, y: oy + PREVIEW_SCALE },
      ], COLORS.side);
    });

    refs.stats.textContent = [
      `front=${countPixels(state.faces.front)}`,
      `side=${countPixels(state.faces.side)}`,
      `top=${countPixels(state.faces.top)}`,
      `voxels=${voxels.length}`,
    ].join(' / ');
  }

  function countPixels(grid) {
    let count = 0;
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (grid[y][x]) {
          count += 1;
        }
      }
    }
    return count;
  }

  function drawEditor(face) {
    const ref = refs.editors[face];
    const ctx = ref.ctx;
    const canvas = ref.canvas;
    const grid = state.faces[face];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!grid[y][x]) {
          continue;
        }
        ctx.fillStyle = COLORS.fill;
        ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }

    if (state.hover && state.hover.face === face) {
      ctx.fillStyle = COLORS.hover;
      ctx.fillRect(state.hover.x * CELL_SIZE + 1, state.hover.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      const pos = i * CELL_SIZE + 0.5;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }

    ref.button.classList.toggle('is-active', state.activeFace === face);
  }

  function renderAll() {
    FACES.forEach(drawEditor);
    renderPreview();
  }

  function bindEditor(face) {
    const ref = refs.editors[face];
    const canvas = ref.canvas;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      state.activeFace = face;
      const cell = getCellFromPointer(event, canvas);
      if (!cell) {
        return;
      }
      state.dragPointerId = event.pointerId;
      state.dragPaintValue = !(event.button === 2 || event.altKey);
      state.hover = { face, x: cell.x, y: cell.y };
      setCell(face, cell.x, cell.y, state.dragPaintValue);
      renderAll();
      saveStateSoon();
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (_) {
        // ignore
      }
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      const cell = getCellFromPointer(event, canvas);
      state.hover = cell ? { face, x: cell.x, y: cell.y } : null;
      if (state.dragPointerId === event.pointerId && cell) {
        if (setCell(face, cell.x, cell.y, state.dragPaintValue)) {
          saveStateSoon();
        }
      }
      renderAll();
    });
    canvas.addEventListener('pointerleave', () => {
      state.hover = null;
      renderAll();
    });
    const finish = event => {
      if (state.dragPointerId !== event.pointerId) {
        return;
      }
      state.dragPointerId = null;
      renderAll();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    ref.button.addEventListener('click', () => {
      state.activeFace = face;
      renderAll();
    });
    ref.clearButton.addEventListener('click', () => {
      clearFace(face);
    });
  }

  api.ui.setTitle('3-Face Virtual Solid');
  api.ui.setSubtitle('前面・横面・上面の3面から仮想立体を生成します。');
  api.ui.addStyles(`
    .solid3-app { display: grid; gap: 10px; }
    .solid3-hero { display: grid; gap: 6px; padding: 8px; background: ${COLORS.panel}; }
    .solid3-hero__title { font-weight: 800; letter-spacing: 0.03em; }
    .solid3-hero__text { color: ${COLORS.muted}; }
    .solid3-toolbar { display: flex; flex-wrap: wrap; gap: 6px; }
    .solid3-layout { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .solid3-panel { display: grid; gap: 8px; padding: 8px; background: ${COLORS.panelStrong}; }
    .solid3-panel--preview { grid-column: 1 / -1; }
    .solid3-panel__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .solid3-panel__title { font-weight: 700; }
    .solid3-panel__meta { color: ${COLORS.muted}; font-size: 0.8rem; }
    .solid3-canvas { display: block; width: 100%; image-rendering: pixelated; border: 1px solid ${COLORS.line}; background: ${COLORS.bg}; touch-action: none; }
    .solid3-face-button.is-active { box-shadow: inset 0 0 0 1px rgba(166, 234, 255, 0.7); }
    .solid3-stats { color: ${COLORS.muted}; }
    button { min-height: 34px; padding: 6px 10px; border: 1px solid rgba(166, 234, 255, 0.32); background: rgba(18, 40, 56, 0.96); color: ${COLORS.text}; cursor: pointer; }
    button:hover { border-color: rgba(166, 234, 255, 0.58); }
    @media (max-width: 760px) { .solid3-layout { grid-template-columns: 1fr; } }
  `);

  const app = makeEl('div', { className: 'solid3-app' });
  const hero = makeEl('section', { className: 'solid3-hero' });
  hero.append(
    makeEl('div', { className: 'solid3-hero__title', text: '3-Face Virtual Solid' }),
    makeEl('div', {
      className: 'solid3-hero__text',
      text: '前面・横面・上面の3面シルエットが同時に成立する部分だけを仮想ボクセルとして扱い、疑似立体プレビューを生成します。',
    })
  );
  app.appendChild(hero);

  const toolbar = makeEl('div', { className: 'solid3-toolbar' });
  const clearAllButton = makeEl('button', { type: 'button', text: '3面をクリア' });
  toolbar.appendChild(clearAllButton);
  app.appendChild(toolbar);

  const layout = makeEl('div', { className: 'solid3-layout' });
  app.appendChild(layout);

  const refs = {
    editors: {},
    preview: {},
    stats: null,
  };

  FACES.forEach(face => {
    const panel = makeEl('section', { className: 'solid3-panel' });
    const head = makeEl('div', { className: 'solid3-panel__head' });
    const faceButton = makeEl('button', {
      type: 'button',
      className: 'solid3-face-button',
      text: FACE_LABELS[face],
    });
    const clearButton = makeEl('button', { type: 'button', text: 'この面をクリア' });
    head.append(faceButton, clearButton);
    const meta = makeEl('div', {
      className: 'solid3-panel__meta',
      text: face === 'front'
        ? 'X-Y 平面'
        : (face === 'side' ? 'Z-Y 平面' : 'X-Z 平面'),
    });
    const canvas = makeEl('canvas', { className: 'solid3-canvas' });
    canvas.width = GRID_SIZE * CELL_SIZE;
    canvas.height = GRID_SIZE * CELL_SIZE;
    panel.append(head, meta, canvas);
    layout.appendChild(panel);
    refs.editors[face] = {
      button: faceButton,
      clearButton,
      canvas,
      ctx: canvas.getContext('2d'),
    };
  });

  const previewPanel = makeEl('section', { className: 'solid3-panel solid3-panel--preview' });
  previewPanel.append(
    makeEl('div', { className: 'solid3-panel__title', text: '仮想立体プレビュー' }),
    makeEl('div', {
      className: 'solid3-panel__meta',
      text: '3面すべてに存在するセルだけを仮想ボクセル化します。',
    })
  );
  const previewCanvas = makeEl('canvas', { className: 'solid3-canvas' });
  previewCanvas.width = 680;
  previewCanvas.height = 440;
  const stats = makeEl('div', { className: 'solid3-stats', text: '' });
  previewPanel.append(previewCanvas, stats);
  layout.appendChild(previewPanel);
  refs.preview = {
    canvas: previewCanvas,
    ctx: previewCanvas.getContext('2d'),
  };
  refs.stats = stats;

  clearAllButton.addEventListener('click', clearAllFaces);
  FACES.forEach(bindEditor);

  api.ui.clear();
  api.ui.mount(app);

  api.on('init', async () => {
    await loadState();
    renderAll();
    api.toast('3-Face Virtual Solid loaded', 'success');
  });
})();
