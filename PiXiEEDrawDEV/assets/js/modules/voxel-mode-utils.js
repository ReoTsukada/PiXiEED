(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createVoxelExtensionStaticConfig({
    EXTENSION_MODE_NONE,
    VOXEL_EXTENSION_DEFAULT_YAW_DEG,
    VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG,
  } = {}) {
    const VOXEL_EXTENSION_LABELS = Object.freeze({
      front: { ja: '正面', en: 'Front', zh: '正面' },
      back: { ja: '背面', en: 'Back', zh: '背面' },
      left: { ja: '左面', en: 'Left', zh: '左面' },
      right: { ja: '右面', en: 'Right', zh: '右面' },
      top: { ja: '上面', en: 'Top', zh: '上面' },
      bottom: { ja: '下面', en: 'Bottom', zh: '下面' },
    });
    const VOXEL_EXTENSION_PROJECT_NAMES = Object.freeze({
      front: 'Front',
      back: 'Back',
      left: 'Left',
      right: 'Right',
      top: 'Top',
      bottom: 'Bottom',
    });
    const VOXEL_EXTENSION_ROLES = Object.freeze(['front', 'right', 'top', 'left', 'bottom', 'back']);
    const VOXEL_EXTENSION_DEFAULT_STATE = Object.freeze({
      mode: EXTENSION_MODE_NONE,
      frontCanvasId: '',
      backCanvasId: '',
      leftCanvasId: '',
      rightCanvasId: '',
      topCanvasId: '',
      bottomCanvasId: '',
      previewCanvasId: '',
      previewYawDeg: VOXEL_EXTENSION_DEFAULT_YAW_DEG,
      previewPitchDeg: VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG,
      displayPx: 0,
    });
    return Object.freeze({
      VOXEL_EXTENSION_LABELS,
      VOXEL_EXTENSION_PROJECT_NAMES,
      VOXEL_EXTENSION_ROLES,
      VOXEL_EXTENSION_DEFAULT_STATE,
    });
  }

  function createVoxelModeUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function getVoxelExtensionProjectName(role = 'front') {
    return VOXEL_EXTENSION_PROJECT_NAMES[role] || VOXEL_EXTENSION_PROJECT_NAMES.front;
  }

  function getVoxelExtensionRoleLabel(role = 'front') {
    const entry = VOXEL_EXTENSION_LABELS[role] || VOXEL_EXTENSION_LABELS.front;
    return localizeText(entry.ja, entry.en, entry.zh);
  }

  function getVoxelPreviewCanvasLabel() {
    return localizeText('立体プレビュー', 'Voxel Preview', '立体预览');
  }

  function getVoxelCanvasDisplayLabel(canvasDoc) {
    if (!canvasDoc) {
      return localizeText('未設定', 'Empty', '未设置');
    }
    if (isVoxelPreviewCanvasId(canvasDoc.id || '')) {
      return getVoxelPreviewCanvasLabel();
    }
    const role = getVoxelExtensionCanvasRoleById(canvasDoc.id || '');
    if (role) {
      return getVoxelExtensionRoleLabel(role);
    }
    return canvasDoc.name || localizeText('未設定', 'Empty', '未设置');
  }

  function getVoxelExtensionCanvasIndexByRole(role = 'front') {
    const resolved = getVoxelExtensionResolvedCanvases();
    const targetCanvasId = resolved?.[role]?.id || '';
    if (!targetCanvasId) {
      return -1;
    }
    return getProjectCanvasDocuments().findIndex(canvas => canvas?.id === targetCanvasId);
  }

  function getActiveVoxelExtensionRole() {
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    return getVoxelExtensionCanvasRoleById(activeCanvasId) || 'front';
  }

  function setActiveVoxelExtensionRole(role = 'front', { persist = true, syncUi = true } = {}) {
    const normalizedRole = VOXEL_EXTENSION_ROLES.includes(role) ? role : 'front';
    const targetIndex = getVoxelExtensionCanvasIndexByRole(normalizedRole);
    if (targetIndex < 0) {
      return false;
    }
    if (!finalizePendingSelectionBeforeCanvasSwitch(getProjectCanvasDocumentAt(targetIndex)?.id || '')) {
      return false;
    }
    return setActiveProjectCanvasByIndex(targetIndex, { persist, syncUi });
  }

  function rotateVoxelNavigatorVector(vector, yawDeg, pitchDeg) {
    const yaw = (normalizeVoxelPreviewYawDegrees(yawDeg) * Math.PI) / 180;
    const pitch = (-normalizeVoxelPreviewPitchDegrees(pitchDeg) * Math.PI) / 180;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const x1 = vector.x * cosYaw + vector.z * sinYaw;
    const z1 = (-vector.x * sinYaw) + (vector.z * cosYaw);
    const y2 = vector.y * cosPitch - z1 * sinPitch;
    const z2 = vector.y * sinPitch + z1 * cosPitch;
    return { x: x1, y: y2, z: z2 };
  }

  function getVoxelNavigatorFaceDepths() {
    const yawDeg = normalizeVoxelPreviewYawDegrees(voxelExtensionState.previewYawDeg);
    const pitchDeg = normalizeVoxelPreviewPitchDegrees(voxelExtensionState.previewPitchDeg);
    const normals = {
      front: { x: 0, y: 0, z: 1 },
      back: { x: 0, y: 0, z: -1 },
      left: { x: -1, y: 0, z: 0 },
      right: { x: 1, y: 0, z: 0 },
      top: { x: 0, y: 1, z: 0 },
      bottom: { x: 0, y: -1, z: 0 },
    };
    return VOXEL_EXTENSION_ROLES.map(role => ({
      role,
      ...rotateVoxelNavigatorVector(normals[role], yawDeg, pitchDeg),
    })).sort((a, b) => b.z - a.z);
  }

  function getVoxelNavigatorFrontRole() {
    return getVoxelNavigatorFaceDepths()[0]?.role || 'front';
  }

  function renderVoxelNavigatorUi() {
  }

  function renderFloatingPreviewGizmo() {
    const canvas = dom.floatingPreviewGizmo;
    const panel = dom.floatingPreviewPanel;
    const show = isVoxelExtensionModeEnabled();
    if (canvas instanceof HTMLCanvasElement) {
      canvas.hidden = !show;
    }
    if (!(canvas instanceof HTMLCanvasElement) || !(panel instanceof HTMLElement) || !show) {
      return;
    }
    if (!floatingPreviewGizmoCtx) {
      floatingPreviewGizmoCtx = canvas.getContext('2d');
    }
    const ctx = floatingPreviewGizmoCtx;
    if (!ctx) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const centerX = Math.round(width * 0.34);
    const centerY = Math.round(height * 0.66);
    const length = 22;
    const axes = [
      { label: 'X', color: '#ff6b6b', vector: { x: 1, y: 0, z: 0 } },
      { label: 'Y', color: '#78e08f', vector: { x: 0, y: 1, z: 0 } },
      { label: 'Z', color: '#6bb6ff', vector: { x: 0, y: 0, z: 1 } },
    ].map(axis => {
      const rotated = rotateVoxelNavigatorVector(
        axis.vector,
        voxelExtensionState.previewYawDeg,
        voxelExtensionState.previewPitchDeg
      );
      return { ...axis, rotated };
    }).sort((a, b) => a.rotated.z - b.rotated.z);
    axes.forEach(axis => {
      const dx = axis.rotated.x * length;
      const dy = -axis.rotated.y * length;
      const endX = centerX + dx;
      const endY = centerY + dy;
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.strokeStyle = axis.color;
      ctx.fillStyle = axis.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - Math.cos(angle - Math.PI / 6) * 7, endY - Math.sin(angle - Math.PI / 6) * 7);
      ctx.lineTo(endX - Math.cos(angle + Math.PI / 6) * 7, endY - Math.sin(angle + Math.PI / 6) * 7);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(axis.label, endX + Math.cos(angle) * 10, endY + Math.sin(angle) * 10);
      ctx.restore();
    });
  }

  function getVoxelExtensionResolvedCanvases(canvases = getProjectCanvasDocuments()) {
    if (!Array.isArray(canvases) || !canvases.length) {
      return null;
    }
    const resolveCanvas = (canvasId, fallbackIndex) => {
      if (typeof canvasId === 'string' && canvasId) {
        const matched = canvases.find(canvas => canvas?.id === canvasId);
        if (matched) {
          return matched;
        }
      }
      return canvases[fallbackIndex] || null;
    };
    return {
      preview: resolveCanvas(voxelExtensionState.previewCanvasId, 0),
      front: resolveCanvas(voxelExtensionState.frontCanvasId, 1),
      back: resolveCanvas(voxelExtensionState.backCanvasId, 2),
      left: resolveCanvas(voxelExtensionState.leftCanvasId, 3),
      right: resolveCanvas(voxelExtensionState.rightCanvasId, 4),
      top: resolveCanvas(voxelExtensionState.topCanvasId, 5),
      bottom: resolveCanvas(voxelExtensionState.bottomCanvasId, 6),
    };
  }

  function syncVoxelExtensionCanvasIdsFromDocuments(canvases = getProjectCanvasDocuments()) {
    const resolved = getVoxelExtensionResolvedCanvases(canvases);
    if (!resolved) {
      return false;
    }
    const nextState = normalizeVoxelExtensionState(voxelExtensionState, VOXEL_EXTENSION_DEFAULT_STATE);
    const previousKey = [
      nextState.frontCanvasId,
      nextState.backCanvasId,
      nextState.leftCanvasId,
      nextState.rightCanvasId,
      nextState.topCanvasId,
      nextState.bottomCanvasId,
      nextState.previewCanvasId,
    ].join(':');
    nextState.previewCanvasId = resolved.preview?.id || '';
    nextState.frontCanvasId = resolved.front?.id || '';
    nextState.backCanvasId = resolved.back?.id || '';
    nextState.leftCanvasId = resolved.left?.id || '';
    nextState.rightCanvasId = resolved.right?.id || '';
    nextState.topCanvasId = resolved.top?.id || '';
    nextState.bottomCanvasId = resolved.bottom?.id || '';
    voxelExtensionState = nextState;
    const nextKey = [
      nextState.frontCanvasId,
      nextState.backCanvasId,
      nextState.leftCanvasId,
      nextState.rightCanvasId,
      nextState.topCanvasId,
      nextState.bottomCanvasId,
      nextState.previewCanvasId,
    ].join(':');
    return previousKey !== nextKey;
  }

  function getVoxelExtensionCanvasRoleById(canvasId = '') {
    if (!isVoxelExtensionModeEnabled() || typeof canvasId !== 'string' || !canvasId) {
      return '';
    }
    if (canvasId === voxelExtensionState.frontCanvasId) {
      return 'front';
    }
    if (canvasId === voxelExtensionState.backCanvasId) {
      return 'back';
    }
    if (canvasId === voxelExtensionState.leftCanvasId) {
      return 'left';
    }
    if (canvasId === voxelExtensionState.rightCanvasId) {
      return 'right';
    }
    if (canvasId === voxelExtensionState.topCanvasId) {
      return 'top';
    }
    if (canvasId === voxelExtensionState.bottomCanvasId) {
      return 'bottom';
    }
    return '';
  }

  function isVoxelPreviewCanvasId(canvasId = '') {
    return isVoxelExtensionModeEnabled()
      && typeof canvasId === 'string'
      && canvasId
      && canvasId === voxelExtensionState.previewCanvasId;
  }

  function announceVoxelPreviewReadonly() {
    updateAutosaveStatus(
      localizeText(
        '小窓プレビューは自動生成です。6面の入力キャンバスを編集してください',
        'The floating preview is auto-generated. Edit the 6 source faces instead.'
      ),
      'info'
    );
  }

  function hasCanvasDocumentVisiblePixels(canvasDoc) {
    if (!canvasDoc || !Array.isArray(canvasDoc.frames)) {
      return false;
    }
    for (let frameIndex = 0; frameIndex < canvasDoc.frames.length; frameIndex += 1) {
      const frame = canvasDoc.frames[frameIndex];
      if (!frame || !Array.isArray(frame.layers)) {
        continue;
      }
      for (let layerIndex = 0; layerIndex < frame.layers.length; layerIndex += 1) {
        const layer = frame.layers[layerIndex];
        if (!layer) {
          continue;
        }
        if (layer.indices instanceof Int16Array) {
          for (let i = 0; i < layer.indices.length; i += 1) {
            if (layer.indices[i] >= 0) {
              return true;
            }
          }
        }
        if (layer.direct instanceof Uint8ClampedArray) {
          for (let i = 3; i < layer.direct.length; i += 4) {
            if (layer.direct[i] > 0) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  function getVoxelExtensionOverwriteConfirmation(canvases = getProjectCanvasDocuments()) {
    if (isVoxelExtensionModeEnabled() || !Array.isArray(canvases)) {
      return true;
    }
    const legacyPreviewCandidate = canvases[VOXEL_EXTENSION_SOURCE_CANVAS_TOTAL] || null;
    const overflowCanvases = canvases.slice(VOXEL_EXTENSION_SOURCE_CANVAS_TOTAL + 1);
    const hasLegacyPreviewArtwork = Boolean(legacyPreviewCandidate && hasCanvasDocumentVisiblePixels(legacyPreviewCandidate));
    const hasOverflowArtwork = overflowCanvases.some(canvas => hasCanvasDocumentVisiblePixels(canvas));
    if (!hasLegacyPreviewArtwork && !hasOverflowArtwork) {
      return true;
    }
    return window.confirm(
      localizeText(
        hasOverflowArtwork
          ? '7枚目以降のキャンバスに描画内容があります。ボクセルモードを始めると、この内容は6面構成へ切り替わります。続けますか？'
          : '7枚目の旧プレビューキャンバスに描画内容があります。ボクセルモードを始めると、この内容は小窓プレビューへ移行してキャンバス自体は外れます。続けますか？',
        hasOverflowArtwork
          ? 'Artwork exists on the 7th and later canvases. Enabling voxel mode will switch the project to the 6-face layout. Continue?'
          : 'Artwork exists on the old 7th preview canvas. Enabling voxel mode will move preview output to the floating preview and remove that canvas. Continue?'
      )
    );
  }

  function getProjectCanvasCompositePixelsForVoxel(canvasDoc, frameIndex = null) {
    const width = Math.max(1, Math.round(Number(canvasDoc?.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc?.height) || 1));
    const frame = getProjectCanvasFrameAt(canvasDoc, frameIndex);
    return compositeFramePixels(frame, width, height, state.palette, {
      useLocalLayerPreviewVisibility: true,
      useLocalLayerPreviewOpacity: true,
    });
  }

  function getVoxelSourcePixel(pixels, width, x, y) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const base = ((y * safeWidth) + x) * 4;
    return {
      r: pixels[base],
      g: pixels[base + 1],
      b: pixels[base + 2],
      a: pixels[base + 3],
    };
  }

  function getVoxelSourceAlpha(pixels, width, x, y) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const base = ((y * safeWidth) + x) * 4;
    return pixels[base + 3];
  }

  function getVoxelOpaqueBounds(pixels, width, height) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    let minX = safeWidth;
    let minY = safeHeight;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < safeHeight; y += 1) {
      for (let x = 0; x < safeWidth; x += 1) {
        if (getVoxelSourceAlpha(pixels, safeWidth, x, y) <= 0) {
          continue;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        empty: true,
      };
    }
    return {
      x: minX,
      y: minY,
      width: (maxX - minX) + 1,
      height: (maxY - minY) + 1,
      empty: false,
    };
  }

  function getVoxelBoundedPixel(pixels, width, bounds, x, y) {
    return getVoxelSourcePixel(
      pixels,
      width,
      bounds.x + x,
      bounds.y + y
    );
  }

  function hasVoxelBoundedAlpha(pixels, width, bounds, x, y) {
    if (!bounds || bounds.empty) {
      return false;
    }
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
      return false;
    }
    return getVoxelSourceAlpha(
      pixels,
      width,
      bounds.x + x,
      bounds.y + y
    ) > 0;
  }

  function pickVoxelColorChain(...colors) {
    for (let index = 0; index < colors.length; index += 1) {
      const color = colors[index];
      if (color && Number(color.a) > 0) {
        return color;
      }
    }
    return colors.find(color => color && typeof color === 'object') || { r: 0, g: 0, b: 0, a: 0 };
  }

  function getVoxelPreviewOrientationForFrame(frame, fallbackYaw = voxelExtensionState.previewYawDeg, fallbackPitch = voxelExtensionState.previewPitchDeg) {
    return {
      yawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg ?? fallbackYaw),
      pitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg ?? fallbackPitch),
    };
  }

  function setVoxelPreviewOrientationForFrame(frame, yawDeg, pitchDeg) {
    if (!frame || typeof frame !== 'object') {
      return false;
    }
    const nextYawDeg = normalizeVoxelPreviewYawDegrees(yawDeg);
    const nextPitchDeg = normalizeVoxelPreviewPitchDegrees(pitchDeg);
    if (
      normalizeVoxelPreviewYawDegrees(frame.voxelPreviewYawDeg) === nextYawDeg
      && normalizeVoxelPreviewPitchDegrees(frame.voxelPreviewPitchDeg) === nextPitchDeg
    ) {
      return false;
    }
    frame.voxelPreviewYawDeg = nextYawDeg;
    frame.voxelPreviewPitchDeg = nextPitchDeg;
    return true;
  }

  function setVoxelPreviewOrientationForFrameIndex(frameIndex, yawDeg, pitchDeg) {
    const normalizedIndex = Math.max(0, Math.round(Number(frameIndex) || 0));
    let changed = false;
    getProjectCanvasDocuments().forEach(canvasDoc => {
      if (!canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
        return;
      }
      const frame = canvasDoc.frames[Math.min(normalizedIndex, canvasDoc.frames.length - 1)] || null;
      if (setVoxelPreviewOrientationForFrame(frame, yawDeg, pitchDeg)) {
        changed = true;
      }
    });
    return changed;
  }

  function getVoxelPreviewOrientationForFrameIndex(frameIndex, fallbackYaw = voxelExtensionState.previewYawDeg, fallbackPitch = voxelExtensionState.previewPitchDeg) {
    const normalizedIndex = Math.max(0, Math.round(Number(frameIndex) || 0));
    const canvases = getProjectCanvasDocuments();
    for (let index = 0; index < canvases.length; index += 1) {
      const canvasDoc = canvases[index];
      if (!canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
        continue;
      }
      const frame = canvasDoc.frames[Math.min(normalizedIndex, canvasDoc.frames.length - 1)] || null;
      if (!frame) {
        continue;
      }
      if (Number.isFinite(Number(frame.voxelPreviewYawDeg)) || Number.isFinite(Number(frame.voxelPreviewPitchDeg))) {
        return getVoxelPreviewOrientationForFrame(frame, fallbackYaw, fallbackPitch);
      }
    }
    return {
      yawDeg: normalizeVoxelPreviewYawDegrees(fallbackYaw),
      pitchDeg: normalizeVoxelPreviewPitchDegrees(fallbackPitch),
    };
  }

  function syncVoxelExtensionCanvasBadges() {
    const mainBadge = dom.mainCanvasSurfaceBadge;
    const mainCanvas = getProjectCanvasDocumentAt(0);
    if (mainBadge instanceof HTMLElement) {
      if (isVoxelExtensionModeEnabled() && mainCanvas && isVoxelPreviewCanvasId(mainCanvas.id || '')) {
        mainBadge.hidden = false;
        mainBadge.dataset.role = 'preview';
        mainBadge.textContent = getVoxelPreviewCanvasLabel();
      } else {
        mainBadge.hidden = true;
        delete mainBadge.dataset.role;
        mainBadge.textContent = '';
      }
    }
    localViewportCanvasEntries.forEach(entry => {
      if (!(entry?.badge instanceof HTMLElement)) {
        return;
      }
      const role = getVoxelExtensionCanvasRoleById(entry.canvasDocId || '');
      if (role) {
        entry.badge.hidden = false;
        entry.badge.dataset.role = role;
        entry.badge.textContent = getVoxelExtensionRoleLabel(role);
      } else {
        entry.badge.hidden = true;
        delete entry.badge.dataset.role;
        entry.badge.textContent = '';
      }
    });
  }

  function syncVoxelExtensionModeUi() {
    const toggle = dom.controls.toggleVoxelExtensionMode;
    const status = dom.controls.voxelExtensionStatus;
    const field = dom.controls.voxelExtensionField;
    const yawControl = dom.controls.voxelPreviewYaw;
    const yawValue = dom.controls.voxelPreviewYawValue;
    const enabled = isVoxelExtensionModeEnabled();
    const available = canUseVoxelExtensionMode();
    const previewYawDeg = normalizeVoxelPreviewYawDegrees(voxelExtensionState.previewYawDeg);
    const previewPitchDeg = normalizeVoxelPreviewPitchDegrees(voxelExtensionState.previewPitchDeg);
    if (toggle instanceof HTMLInputElement) {
      toggle.checked = enabled;
      toggle.disabled = !available || !canCurrentClientEditProjectStructure();
    }
    if (dom.controls.voxelDisplayPx instanceof HTMLInputElement) {
      dom.controls.voxelDisplayPx.value = String(
        clamp(
          Math.round(Number(voxelExtensionState.displayPx) || 0),
          VOXEL_EXTENSION_DISPLAY_PIXEL_MIN,
          VOXEL_EXTENSION_DISPLAY_PIXEL_MAX
        )
      );
      dom.controls.voxelDisplayPx.disabled = !enabled;
    }
    if (yawControl instanceof HTMLInputElement) {
      yawControl.value = String(previewYawDeg);
      yawControl.disabled = !enabled;
    }
    if (yawValue instanceof HTMLOutputElement || yawValue instanceof HTMLElement) {
      yawValue.textContent = formatVoxelPreviewYawLabel(previewYawDeg);
    }
    if (field instanceof HTMLElement) {
      field.dataset.mode = enabled ? EXTENSION_MODE_VOXEL : EXTENSION_MODE_NONE;
    }
    if (status instanceof HTMLElement) {
      if (!available) {
        status.textContent = localizeText(
          '共有モード接続中はボクセルモードを使えません',
          'Voxel mode is unavailable while collab is connected'
        );
      } else if (!enabled) {
        status.textContent = voxelExtensionRestoreSnapshot
          ? localizeText('ボクセルモード: OFF（元のキャンバス構成へ復元可能）', 'Voxel mode: OFF (restorable canvas layout)')
          : localizeText('ボクセルモード: OFF', 'Voxel mode: OFF');
      } else if (voxelExtensionPreviewMeta && voxelExtensionPreviewMeta.volume) {
        const sizeLabel = localizeText(
          `ボクセル ${voxelExtensionPreviewMeta.volume.width}×${voxelExtensionPreviewMeta.volume.height}×${voxelExtensionPreviewMeta.volume.depth} / 小窓 ${voxelExtensionPreviewMeta.width}×${voxelExtensionPreviewMeta.height}`,
          `Voxel ${voxelExtensionPreviewMeta.volume.width}×${voxelExtensionPreviewMeta.volume.height}×${voxelExtensionPreviewMeta.volume.depth} / Floating ${voxelExtensionPreviewMeta.width}×${voxelExtensionPreviewMeta.height}`
        );
        const displayPxLabel = Number(voxelExtensionState.displayPx) > 0
          ? localizeText(` / 表示PX ${Math.round(Number(voxelExtensionState.displayPx) || 0)}`, ` / Display PX ${Math.round(Number(voxelExtensionState.displayPx) || 0)}`)
          : '';
        const angleLabel = localizeText(
          ` / 回転 Y${formatVoxelPreviewYawLabel(voxelExtensionPreviewMeta.yawDeg ?? previewYawDeg)} P${formatVoxelPreviewPitchLabel(voxelExtensionPreviewMeta.pitchDeg ?? previewPitchDeg)}`,
          ` / Yaw ${formatVoxelPreviewYawLabel(voxelExtensionPreviewMeta.yawDeg ?? previewYawDeg)} Pitch ${formatVoxelPreviewPitchLabel(voxelExtensionPreviewMeta.pitchDeg ?? previewPitchDeg)}`
        );
        const warningParts = [];
        if (Array.isArray(voxelExtensionPreviewMeta.missingFaces) && voxelExtensionPreviewMeta.missingFaces.length) {
          const missingLabel = voxelExtensionPreviewMeta.missingFaces
            .map(face => String(face || '').charAt(0).toUpperCase() + String(face || '').slice(1))
            .join(',');
          warningParts.push(localizeText(`不足:${missingLabel}`, `Missing:${missingLabel}`));
        }
        if (Array.isArray(voxelExtensionPreviewMeta.mismatchAxes) && voxelExtensionPreviewMeta.mismatchAxes.length) {
          warningParts.push(localizeText(`寸法差:${voxelExtensionPreviewMeta.mismatchAxes.join('/')}`, `Mismatch:${voxelExtensionPreviewMeta.mismatchAxes.join('/')}`));
        }
        const warningLabel = warningParts.length ? ` / ${warningParts.join(' / ')}` : '';
        status.textContent = voxelExtensionPreviewMeta.clamped
          ? `${sizeLabel}${displayPxLabel}${angleLabel}${warningLabel}${localizeText(`（64px上限で表示）`, ` (capped at ${VOXEL_EXTENSION_MAX_SOURCE_EDGE}px)`)}`
          : `${sizeLabel}${displayPxLabel}${angleLabel}${warningLabel}`;
      } else {
        status.textContent = localizeText('ボクセルモード: 準備中', 'Voxel mode: preparing');
      }
    }
    syncVoxelExtensionCanvasBadges();
    renderVoxelNavigatorUi();
    syncFloatingPreviewPanelVisibility({ persist: false });
  }

  function syncVoxelExtensionPreviewFromSource({ updateViewport = true } = {}) {
    if (!isVoxelExtensionModeEnabled()) {
      voxelExtensionPreviewMeta = null;
      voxelExtensionPreviewPixels = null;
      voxelExtensionGuideProjections = null;
      syncVoxelExtensionModeUi();
      renderFloatingPreviewPanel();
      return false;
    }
    syncVoxelExtensionCanvasIdsFromDocuments();
    const resolved = getVoxelExtensionResolvedCanvases();
    if (!resolved?.front || !resolved?.back || !resolved?.left || !resolved?.right || !resolved?.top || !resolved?.bottom) {
      voxelExtensionPreviewMeta = null;
      voxelExtensionPreviewPixels = null;
      voxelExtensionGuideProjections = null;
      syncVoxelExtensionModeUi();
      renderFloatingPreviewPanel();
      return false;
    }
    const activeFrameIndex = clamp(
      Math.round(Number(state.activeFrame) || 0),
      0,
      Math.max(0, (Array.isArray(state.frames) ? state.frames.length : 1) - 1)
    );
    [
      resolved.front,
      resolved.back,
      resolved.left,
      resolved.right,
      resolved.top,
      resolved.bottom,
    ].forEach(canvasDoc => {
      if (!canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
        return;
      }
      canvasDoc.activeFrame = clamp(activeFrameIndex, 0, canvasDoc.frames.length - 1);
    });
    const activeFrameOrientation = getVoxelPreviewOrientationForFrameIndex(
      activeFrameIndex,
      voxelExtensionState.previewYawDeg,
      voxelExtensionState.previewPitchDeg
    );
    voxelExtensionState = normalizeVoxelExtensionState({
      ...voxelExtensionState,
      previewYawDeg: activeFrameOrientation.yawDeg,
      previewPitchDeg: activeFrameOrientation.pitchDeg,
    }, VOXEL_EXTENSION_DEFAULT_STATE);
    const rendered = buildVoxelPreviewPixels(
      resolved.front,
      resolved.back,
      resolved.left,
      resolved.right,
      resolved.top,
      resolved.bottom,
      {
        ...activeFrameOrientation,
        frameIndex: activeFrameIndex,
      }
    );
      const scaledPreview = scaleVoxelPreviewPixels(
        rendered.pixels,
        rendered.width,
        rendered.height,
        1
      );
    voxelExtensionPreviewPixels = new Uint8ClampedArray(scaledPreview.pixels);
    voxelExtensionGuideProjections = rendered.guides || null;
    voxelExtensionPreviewMeta = {
      width: scaledPreview.width,
      height: scaledPreview.height,
      baseWidth: rendered.width,
      baseHeight: rendered.height,
      volume: { ...rendered.volume },
      clamped: Boolean(rendered.clamped),
      yawDeg: normalizeVoxelPreviewYawDegrees(rendered.yawDeg),
      pitchDeg: normalizeVoxelPreviewPitchDegrees(rendered.pitchDeg),
      scale: scaledPreview.scale,
      missingFaces: Array.isArray(rendered.missingFaces) ? rendered.missingFaces.slice() : [],
      mismatchAxes: Array.isArray(rendered.mismatchAxes) ? rendered.mismatchAxes.slice() : [],
    };
    const previewCanvasDoc = getProjectCanvasDocumentById(voxelExtensionState.previewCanvasId);
    if (previewCanvasDoc) {
      resizeProjectCanvasFrames(
        previewCanvasDoc,
        Math.max(1, Math.round(Number(scaledPreview.width) || 1)),
        Math.max(1, Math.round(Number(scaledPreview.height) || 1))
      );
      previewCanvasDoc.name = localizeText('立体プレビュー', 'Voxel Preview');
      const previewSurface = getProjectCanvasSurfaceByCanvasId(previewCanvasDoc.id || '');
      if (previewSurface) {
        renderProjectCanvasSurface(previewSurface, previewCanvasDoc);
      }
    }
    if (updateViewport) {
      syncLocalViewportCanvasDockLayout();
    }
    syncVoxelExtensionModeUi();
    renderFloatingPreviewPanel();
    return true;
  }

  function ensureVoxelExtensionCanvasSetup({ announce = true, trackChange = true } = {}) {
    if (!canUseVoxelExtensionMode() || !canCurrentClientEditProjectStructure()) {
      syncVoxelExtensionModeUi();
      return false;
    }
    const currentCanvases = getProjectCanvasDocuments();
    const currentVoxelState = normalizeVoxelExtensionState(voxelExtensionState, VOXEL_EXTENSION_DEFAULT_STATE);
    if (currentVoxelState.mode !== EXTENSION_MODE_VOXEL && !voxelExtensionRestoreSnapshot) {
      voxelExtensionRestoreSnapshot = {
        canvases: currentCanvases.map((canvas, index) => createProjectCanvasDocument(canvas, {
          clonePixelData: true,
          fallbackIndex: index + 1,
        })),
        activeCanvasId: getActiveProjectCanvasDocument()?.id || currentCanvases[0]?.id || '',
      };
    }
    if (!getVoxelExtensionOverwriteConfirmation(currentCanvases)) {
      syncControlsWithState();
      return false;
    }
    const looksLikeLegacyVoxelLayout = (
      currentCanvases.length <= 4
      && !currentVoxelState.backCanvasId
      && !currentVoxelState.leftCanvasId
      && !currentVoxelState.bottomCanvasId
      && (currentVoxelState.rightCanvasId || currentVoxelState.topCanvasId || currentVoxelState.previewCanvasId)
    );
    const sourceCanvas = currentCanvases[0] || createBlankProjectCanvasDocument(null, 1);
    const shouldResetLayoutAfterSetup = (
      currentVoxelState.mode !== EXTENSION_MODE_VOXEL
      || looksLikeLegacyVoxelLayout
      || currentCanvases.length !== VOXEL_EXTENSION_CANVAS_TOTAL
    );
    const hasDedicatedPreviewCanvas = currentCanvases.length >= VOXEL_EXTENSION_CANVAS_TOTAL;
    const resolveExistingCanvas = (canvasId, fallbackIndex = 0) => {
      if (typeof canvasId === 'string' && canvasId) {
        const matched = currentCanvases.find(canvas => canvas?.id === canvasId);
        if (matched) {
          return matched;
        }
      }
      return currentCanvases[fallbackIndex] || null;
    };
    const previewCanvas = hasDedicatedPreviewCanvas
      ? (resolveExistingCanvas(currentVoxelState.previewCanvasId, 0) || createBlankProjectCanvasDocument(sourceCanvas, 1))
      : createBlankProjectCanvasDocument(sourceCanvas, 1);
    const orderedSourceCanvases = looksLikeLegacyVoxelLayout
      ? [
          resolveExistingCanvas(currentVoxelState.frontCanvasId, 0),
          resolveExistingCanvas(currentVoxelState.backCanvasId, 4),
          resolveExistingCanvas(currentVoxelState.leftCanvasId, 5),
          resolveExistingCanvas(currentVoxelState.rightCanvasId, 1),
          resolveExistingCanvas(currentVoxelState.topCanvasId, 2),
          resolveExistingCanvas(currentVoxelState.bottomCanvasId, 3),
        ]
      : [
          resolveExistingCanvas(currentVoxelState.frontCanvasId, hasDedicatedPreviewCanvas ? 1 : 0),
          resolveExistingCanvas(currentVoxelState.backCanvasId, hasDedicatedPreviewCanvas ? 2 : 1),
          resolveExistingCanvas(currentVoxelState.leftCanvasId, hasDedicatedPreviewCanvas ? 3 : 2),
          resolveExistingCanvas(currentVoxelState.rightCanvasId, hasDedicatedPreviewCanvas ? 4 : 3),
          resolveExistingCanvas(currentVoxelState.topCanvasId, hasDedicatedPreviewCanvas ? 5 : 4),
          resolveExistingCanvas(currentVoxelState.bottomCanvasId, hasDedicatedPreviewCanvas ? 6 : 5),
        ];
    const nextSourceCanvases = orderedSourceCanvases.map((canvas, index) => (
      canvas
        ? createProjectCanvasDocument(canvas, {
            clonePixelData: true,
            fallbackIndex: index + 2,
          })
        : createBlankProjectCanvasDocument(sourceCanvas, index + 2)
    ));
    nextSourceCanvases[0].name = getVoxelExtensionProjectName('front');
    nextSourceCanvases[1].name = getVoxelExtensionProjectName('back');
    nextSourceCanvases[2].name = getVoxelExtensionProjectName('left');
    nextSourceCanvases[3].name = getVoxelExtensionProjectName('right');
    nextSourceCanvases[4].name = getVoxelExtensionProjectName('top');
    nextSourceCanvases[5].name = getVoxelExtensionProjectName('bottom');
    const nextPreviewCanvas = createProjectCanvasDocument(previewCanvas, {
      clonePixelData: false,
      fallbackIndex: 1,
    });
    nextPreviewCanvas.name = localizeText('Voxel Preview', 'Voxel Preview');
    const nextCanvases = [nextPreviewCanvas, ...nextSourceCanvases];
    const currentActiveId = currentCanvases.find(canvas => canvas?.id === getActiveProjectCanvasDocument()?.id)?.id || '';
    const activeCanvasId = nextCanvases.some(canvas => canvas?.id === currentActiveId && canvas.id !== nextPreviewCanvas.id)
      ? currentActiveId
      : (nextSourceCanvases[0]?.id || nextPreviewCanvas.id || '');
    voxelExtensionState = normalizeVoxelExtensionState({
      ...voxelExtensionState,
      mode: EXTENSION_MODE_VOXEL,
      previewCanvasId: nextPreviewCanvas?.id || '',
      frontCanvasId: nextSourceCanvases[0]?.id || '',
      backCanvasId: nextSourceCanvases[1]?.id || '',
      leftCanvasId: nextSourceCanvases[2]?.id || '',
      rightCanvasId: nextSourceCanvases[3]?.id || '',
      topCanvasId: nextSourceCanvases[4]?.id || '',
      bottomCanvasId: nextSourceCanvases[5]?.id || '',
    }, VOXEL_EXTENSION_DEFAULT_STATE);
    replaceProjectCanvasDocuments(nextCanvases, activeCanvasId);
    if (shouldResetLayoutAfterSetup) {
      requestLocalViewportCanvasLayoutReset({ clearStored: true });
    }
    ensureLocalViewportCanvasEntries();
    bindActiveCanvasSurface(getProjectCanvasSurfaceForIndex(getActiveProjectCanvasIndex()) || mainViewportCanvasSurface);
    syncVoxelExtensionCanvasIdsFromDocuments();
    syncVoxelExtensionPreviewFromSource({ updateViewport: false });
    resizeCanvases({
      forceRender: false,
      applyTransform: true,
      syncControls: true,
      updateScaleLimits: true,
    });
    renderAllProjectCanvasSurfaces();
    renderFrameList();
    renderLayerList();
    renderTimelineMatrix();
    requestRender();
    requestOverlayRender();
    if (trackChange) {
      markDocumentUnsavedChange();
      markAutosaveDirty();
      scheduleAutosaveSnapshot();
      scheduleSessionPersist();
    }
    if (announce) {
      updateAutosaveStatus(
        localizeText('ボクセル用6面キャンバスをセットアップしました', 'Voxel 6-face workspace is ready'),
        'success'
      );
    }
    return true;
  }

  function setVoxelExtensionModeEnabled(enabled, { announce = true } = {}) {
    const nextEnabled = Boolean(enabled);
    if (!nextEnabled) {
      if (voxelExtensionRestoreSnapshot?.canvases?.length) {
        replaceProjectCanvasDocuments(
          voxelExtensionRestoreSnapshot.canvases,
          voxelExtensionRestoreSnapshot.activeCanvasId || voxelExtensionRestoreSnapshot.canvases[0]?.id || ''
        );
        ensureLocalViewportCanvasEntries();
        bindActiveCanvasSurface(getProjectCanvasSurfaceForIndex(getActiveProjectCanvasIndex()) || mainViewportCanvasSurface);
        requestLocalViewportCanvasLayoutReset({ clearStored: true });
        resizeCanvases({
          forceRender: false,
          applyTransform: true,
          syncControls: true,
          updateScaleLimits: true,
        });
        renderAllProjectCanvasSurfaces();
        renderFrameList();
        renderLayerList();
        renderTimelineMatrix();
      }
      voxelExtensionState = normalizeVoxelExtensionState({
        ...voxelExtensionState,
        mode: EXTENSION_MODE_NONE,
      }, VOXEL_EXTENSION_DEFAULT_STATE);
      voxelExtensionPreviewMeta = null;
      voxelExtensionPreviewPixels = null;
      voxelExtensionGuideProjections = null;
      voxelExtensionRestoreSnapshot = null;
      syncVoxelExtensionModeUi();
      renderFloatingPreviewPanel();
      syncControlsWithState();
      markDocumentUnsavedChange();
      markAutosaveDirty();
      scheduleAutosaveSnapshot();
      scheduleSessionPersist();
      if (announce) {
        updateAutosaveStatus(localizeText('ボクセルモードをOFFにしました', 'Voxel mode disabled'), 'info');
      }
      return true;
    }
    return ensureVoxelExtensionCanvasSetup({ announce, trackChange: true });
  }

  return Object.freeze({
    getVoxelExtensionProjectName,
    getVoxelExtensionRoleLabel,
    getVoxelPreviewCanvasLabel,
    getVoxelCanvasDisplayLabel,
    getVoxelExtensionCanvasIndexByRole,
    getActiveVoxelExtensionRole,
    setActiveVoxelExtensionRole,
    rotateVoxelNavigatorVector,
    getVoxelNavigatorFaceDepths,
    getVoxelNavigatorFrontRole,
    renderVoxelNavigatorUi,
    renderFloatingPreviewGizmo,
    getVoxelExtensionResolvedCanvases,
    syncVoxelExtensionCanvasIdsFromDocuments,
    getVoxelExtensionCanvasRoleById,
    isVoxelPreviewCanvasId,
    announceVoxelPreviewReadonly,
    hasCanvasDocumentVisiblePixels,
    getVoxelExtensionOverwriteConfirmation,
    getProjectCanvasCompositePixelsForVoxel,
    getVoxelSourcePixel,
    getVoxelSourceAlpha,
    getVoxelOpaqueBounds,
    getVoxelBoundedPixel,
    hasVoxelBoundedAlpha,
    pickVoxelColorChain,
    getVoxelPreviewOrientationForFrame,
    setVoxelPreviewOrientationForFrame,
    setVoxelPreviewOrientationForFrameIndex,
    getVoxelPreviewOrientationForFrameIndex,
    syncVoxelExtensionCanvasBadges,
    syncVoxelExtensionModeUi,
    syncVoxelExtensionPreviewFromSource,
    ensureVoxelExtensionCanvasSetup,
    setVoxelExtensionModeEnabled,
  });
      }
    })(scope);
  }

  root.voxelModeUtils = Object.freeze({
    createVoxelExtensionStaticConfig,
    createVoxelModeUtils,
  });
})();
