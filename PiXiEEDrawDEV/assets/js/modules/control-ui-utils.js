(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createControlUiUtils(rawScope = {}) {
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
  function updateThemeColorMeta(theme = state.uiTheme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!(meta instanceof HTMLMetaElement)) {
      return;
    }
    const normalized = normalizeUiTheme(theme, DEFAULT_UI_THEME);
    const preset = UI_THEME_PRESETS[normalized] || UI_THEME_PRESETS[DEFAULT_UI_THEME];
    meta.setAttribute('content', preset.themeColor);
  }

  function applyUiTheme(theme, { persist = true, syncControl = true } = {}) {
    const normalized = normalizeUiTheme(theme, state.uiTheme || DEFAULT_UI_THEME);
    state.uiTheme = normalized;
    if (document.documentElement) {
      document.documentElement.dataset.uiTheme = normalized;
    }
    updateThemeColorMeta(normalized);
    if (syncControl && dom.controls.toggleUiTheme instanceof HTMLButtonElement) {
      const preset = UI_THEME_PRESETS[normalized] || UI_THEME_PRESETS[DEFAULT_UI_THEME];
      const label = localizeUiThemePresetLabel(preset?.label || UI_THEME_PRESETS[DEFAULT_UI_THEME].label);
      dom.controls.toggleUiTheme.textContent = `UI:${label}`;
      dom.controls.toggleUiTheme.setAttribute('aria-label', localizeText(`UIカラー:${label}`, `UI theme: ${label}`));
      dom.controls.toggleUiTheme.setAttribute('aria-pressed', String(normalized !== DEFAULT_UI_THEME));
    }
    renderBrushShapeButtonIcons();
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function createMirrorToolPopoverButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mirror-axis-button';
    button.dataset.mirrorToolKey = item.key;
    button.setAttribute('aria-pressed', 'false');
    if (typeof item.label === 'string' && item.label) {
      button.setAttribute('aria-label', item.label);
    }
    if (item.type === 'axis' && isMirrorAxisKey(item.axis)) {
      button.dataset.mirrorAxis = item.axis;
    }
    const icon = document.createElement('img');
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.className = 'mirror-tool-popover__axis-icon';
    icon.width = 21;
    icon.height = 21;
    icon.src = item.icon;
    button.appendChild(icon);
    return button;
  }

  function renderMirrorToolPopover() {
    const container = dom.controls.mirrorToolPopoverItems;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    container.textContent = '';
    const splitBySection = MIRROR_TOOL_ITEMS.length > MIRROR_TOOL_SECTION_SPLIT_THRESHOLD;
    const groupedItems = new Map();
    MIRROR_TOOL_ITEMS.forEach(item => {
      const sectionName = splitBySection
        ? (typeof item.section === 'string' && item.section.trim() ? item.section.trim() : 'その他')
        : '__single__';
      if (!groupedItems.has(sectionName)) {
        groupedItems.set(sectionName, []);
      }
      groupedItems.get(sectionName).push(item);
    });
    groupedItems.forEach((items, sectionName) => {
      const localizedSectionName = localizeText(sectionName, sectionName === '対称' ? 'Mirror' : sectionName);
      let buttonHost = null;
      if (splitBySection) {
        const section = document.createElement('section');
        section.className = 'mirror-tool-popover__section';
        const title = document.createElement('h4');
        title.className = 'mirror-tool-popover__section-title';
        title.textContent = localizedSectionName;
        const axes = document.createElement('div');
        axes.className = 'mirror-tool-popover__axes';
        axes.setAttribute('role', 'group');
        axes.setAttribute('aria-label', localizeText(`${sectionName}ツール`, `${localizedSectionName} tools`));
        section.appendChild(title);
        section.appendChild(axes);
        container.appendChild(section);
        buttonHost = axes;
      } else {
        const axes = document.createElement('div');
        axes.className = 'mirror-tool-popover__axes';
        axes.setAttribute('role', 'group');
        axes.setAttribute('aria-label', localizeText('対称ツール', 'Mirror tools'));
        container.appendChild(axes);
        buttonHost = axes;
      }
      items.forEach(item => {
        buttonHost.appendChild(createMirrorToolPopoverButton(item));
      });
    });
  }

  function onMirrorToolClick(toolKey) {
    if (typeof toolKey !== 'string' || !toolKey) {
      return;
    }
    const item = MIRROR_TOOL_ITEM_BY_KEY.get(toolKey);
    if (!item) {
      return;
    }
    if (item.type === 'axis' && isMirrorAxisKey(item.axis)) {
      const mirrorState = getNormalizedMirrorState();
      const nextAxisEnabled = !Boolean(mirrorState.axes[item.axis]);
      setMirrorAxisEnabled(item.axis, nextAxisEnabled);
    }
  }

  function syncMirrorToolPopoverControls(mirrorState = getNormalizedMirrorState()) {
    if (dom.controls.mirrorToolPopoverItems instanceof HTMLElement) {
      dom.controls.mirrorToolPopoverItems.hidden = false;
      dom.controls.mirrorToolPopoverItems.setAttribute('aria-hidden', 'false');
    }
    if (dom.controls.mirrorToolPopoverHelp instanceof HTMLElement) {
      dom.controls.mirrorToolPopoverHelp.hidden = false;
    }
    if (!(dom.controls.mirrorToolPopoverItems instanceof HTMLElement)) {
      return;
    }
    const axisButtons = Array.from(dom.controls.mirrorToolPopoverItems.querySelectorAll('.mirror-axis-button[data-mirror-axis]'));
    axisButtons.forEach(button => {
      const axis = button.dataset.mirrorAxis;
      const pressed = isMirrorAxisKey(axis) ? Boolean(mirrorState.axes[axis]) : false;
      button.classList.toggle('is-active', pressed);
      button.setAttribute('aria-pressed', String(pressed));
      button.setAttribute('aria-disabled', 'false');
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
      }
    });
  }

  function syncVirtualCursorControlVisibility(options = {}) {
    const { syncToggle = true } = options;
    const available = true;
    const showVirtualCursorOptions = Boolean(state.showVirtualCursor);
    const showMobileVirtualCursorOptions = layoutMode === 'mobilePortrait' && showVirtualCursorOptions;
    if (syncToggle && dom.controls.toggleVirtualCursor instanceof HTMLInputElement) {
      dom.controls.toggleVirtualCursor.checked = showVirtualCursorOptions;
    }
    const toggleOption = dom.controls.toggleVirtualCursor instanceof HTMLElement
      ? (dom.controls.toggleVirtualCursor.closest('li') || dom.controls.toggleVirtualCursor.closest('.toggle-option'))
      : null;
    if (toggleOption instanceof HTMLElement) {
      toggleOption.hidden = !available;
      toggleOption.setAttribute('aria-hidden', String(!available));
    }
    if (dom.controls.virtualCursorScale instanceof HTMLElement) {
      dom.controls.virtualCursorScale.hidden = !showMobileVirtualCursorOptions;
      dom.controls.virtualCursorScale.setAttribute('aria-hidden', String(!showMobileVirtualCursorOptions));
    }
    if (dom.controls.mobileDrawHelp instanceof HTMLElement) {
      dom.controls.mobileDrawHelp.hidden = !showMobileVirtualCursorOptions;
      dom.controls.mobileDrawHelp.setAttribute('aria-hidden', String(!showMobileVirtualCursorOptions));
    }
    updateFloatingDrawButtonScaleControl();
    updateFloatingMovePadVisibilityIfReady();
    updateVirtualCursorActionToolButtons();
  }

  function getCustomBrushStatusText() {
    if (!isCustomBrushData(state.customBrush)) {
      return localizeText('カスタム: 未作成', 'Custom: Not created');
    }
    const customBrush = state.customBrush;
    return localizeText(
      `カスタム: ${customBrush.pixelCount}px (${customBrush.width}x${customBrush.height})`,
      `Custom: ${customBrush.pixelCount}px (${customBrush.width}x${customBrush.height})`
    );
  }

  function getBrushShapeIconFillStyle(alpha = 0.95) {
    const styles = document.documentElement ? window.getComputedStyle(document.documentElement) : null;
    const rawRgb = styles ? styles.getPropertyValue('--ui-rgb-focus') : '';
    const rgb = typeof rawRgb === 'string' && rawRgb.trim() ? rawRgb.trim() : '188, 236, 255';
    return `rgba(${rgb}, ${clamp(Number(alpha) || 1, 0, 1)})`;
  }

  function getBrushShapeDotGlyph(shape) {
    if (shape === BRUSH_SHAPE_SQUARE) {
      return [
        '0000000000000',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0111111111110',
        '0000000000000',
      ];
    }
    if (shape === BRUSH_SHAPE_CIRCLE) {
      return [
        '0000011100000',
        '0001111111000',
        '0011111111100',
        '0111111111110',
        '0111111111110',
        '1111111111111',
        '1111111111111',
        '1111111111111',
        '0111111111110',
        '0111111111110',
        '0011111111100',
        '0001111111000',
        '0000011100000',
      ];
    }
    return null;
  }

  function drawBrushShapeDotGlyph(context, iconWidth, iconHeight, glyphRows) {
    if (!context || !Array.isArray(glyphRows) || !glyphRows.length) {
      return false;
    }
    const glyphHeight = glyphRows.length;
    const glyphWidth = typeof glyphRows[0] === 'string' ? glyphRows[0].length : 0;
    if (!glyphWidth || glyphWidth <= 0) {
      return false;
    }
    const startX = Math.floor((iconWidth - glyphWidth) / 2);
    const startY = Math.floor((iconHeight - glyphHeight) / 2);
    context.fillStyle = getBrushShapeIconFillStyle(0.96);
    for (let y = 0; y < glyphHeight; y += 1) {
      const row = glyphRows[y];
      if (typeof row !== 'string') {
        continue;
      }
      for (let x = 0; x < glyphWidth; x += 1) {
        if (row[x] !== '1') {
          continue;
        }
        context.fillRect(startX + x, startY + y, 1, 1);
      }
    }
    return true;
  }

  function renderBrushShapeButtonIcon(button, shape) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const canvas = button.querySelector('.brush-shape-button__icon');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    const iconWidth = Math.max(1, Number(canvas.width) || 18);
    const iconHeight = Math.max(1, Number(canvas.height) || 18);
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) {
      return;
    }
    context.clearRect(0, 0, iconWidth, iconHeight);

    if (shape === BRUSH_SHAPE_CUSTOM && !hasCustomBrushData()) {
      context.strokeStyle = getBrushShapeIconFillStyle(0.6);
      context.lineWidth = 1;
      context.strokeRect(4.5, 4.5, iconWidth - 9, iconHeight - 9);
      return;
    }

    const iconShape = normalizeBrushShape(shape, BRUSH_SHAPE_SQUARE);
    const fixedGlyph = getBrushShapeDotGlyph(iconShape);
    if (fixedGlyph && drawBrushShapeDotGlyph(context, iconWidth, iconHeight, fixedGlyph)) {
      return;
    }
    const iconBrushSize = iconShape === BRUSH_SHAPE_CIRCLE || iconShape === BRUSH_SHAPE_SQUARE ? 5 : (state.brushSize || 1);
    const offsets = getBrushOffsets(iconBrushSize, iconShape);
    if (!offsets.length) {
      return;
    }

    let minDx = Infinity;
    let minDy = Infinity;
    let maxDx = -Infinity;
    let maxDy = -Infinity;
    for (let i = 0; i < offsets.length; i += 1) {
      const offset = offsets[i];
      if (offset.dx < minDx) minDx = offset.dx;
      if (offset.dy < minDy) minDy = offset.dy;
      if (offset.dx > maxDx) maxDx = offset.dx;
      if (offset.dy > maxDy) maxDy = offset.dy;
    }

    const padding = 2;
    const innerWidth = Math.max(1, iconWidth - (padding * 2));
    const innerHeight = Math.max(1, iconHeight - (padding * 2));
    const shapeWidth = Math.max(1, maxDx - minDx + 1);
    const shapeHeight = Math.max(1, maxDy - minDy + 1);
    const scaleX = shapeWidth > 1 ? (innerWidth - 1) / (shapeWidth - 1) : 0;
    const scaleY = shapeHeight > 1 ? (innerHeight - 1) / (shapeHeight - 1) : 0;
    const centerX = Math.floor((innerWidth - 1) / 2);
    const centerY = Math.floor((innerHeight - 1) / 2);
    const raster = new Uint8Array(innerWidth * innerHeight);

    for (let i = 0; i < offsets.length; i += 1) {
      const offset = offsets[i];
      const px = shapeWidth > 1 ? Math.round((offset.dx - minDx) * scaleX) : centerX;
      const py = shapeHeight > 1 ? Math.round((offset.dy - minDy) * scaleY) : centerY;
      const clampedX = clamp(px, 0, innerWidth - 1);
      const clampedY = clamp(py, 0, innerHeight - 1);
      raster[(clampedY * innerWidth) + clampedX] = 1;
    }

    context.fillStyle = getBrushShapeIconFillStyle(0.96);
    for (let y = 0; y < innerHeight; y += 1) {
      for (let x = 0; x < innerWidth; x += 1) {
        if (raster[(y * innerWidth) + x] !== 1) {
          continue;
        }
        context.fillRect(padding + x, padding + y, 1, 1);
      }
    }
  }

  function renderBrushShapeButtonIcons() {
    const buttons = Array.isArray(dom.controls.brushShapeButtons) ? dom.controls.brushShapeButtons : [];
    const custom = isCustomBrushData(state.customBrush) ? state.customBrush : null;
    const customKey = custom
      ? (() => {
        const first = custom.offsets[0];
        const last = custom.offsets[custom.offsets.length - 1];
        return `${custom.pixelCount}:${custom.width}:${custom.height}:${first.dx},${first.dy}:${last.dx},${last.dy}`;
      })()
      : 'none';
    for (let i = 0; i < buttons.length; i += 1) {
      const button = buttons[i];
      if (!(button instanceof HTMLButtonElement)) {
        continue;
      }
      const shape = normalizeBrushShape(button.dataset.brushShape, BRUSH_SHAPE_SQUARE);
      const canvas = button.querySelector('.brush-shape-button__icon');
      const renderKey = `${shape}:${state.uiTheme}:${customKey}`;
      if (canvas instanceof HTMLCanvasElement && canvas.dataset.iconKey === renderKey) {
        continue;
      }
      renderBrushShapeButtonIcon(button, shape);
      if (canvas instanceof HTMLCanvasElement) {
        canvas.dataset.iconKey = renderKey;
      }
    }
  }

  function syncBrushControls(options = {}) {
    const hasSelection = Object.prototype.hasOwnProperty.call(options, 'hasSelection')
      ? Boolean(options.hasSelection)
      : selectionMaskHasPixels(state.selectionMask);
    if (dom.controls.selectionOutlineField instanceof HTMLElement) {
      dom.controls.selectionOutlineField.hidden = !hasSelection;
      dom.controls.selectionOutlineField.setAttribute('aria-hidden', String(!hasSelection));
    }
    if (dom.controls.outlineSizeField instanceof HTMLElement) {
      dom.controls.outlineSizeField.hidden = !hasSelection;
      dom.controls.outlineSizeField.setAttribute('aria-hidden', String(!hasSelection));
    }
    const effectiveShape = getEffectiveBrushShape(state.brushShape);
    if (state.brushShape !== effectiveShape) {
      state.brushShape = effectiveShape;
    }
    const hasCustomBrush = hasCustomBrushData();
    if (Array.isArray(dom.controls.brushShapeButtons)) {
      dom.controls.brushShapeButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const shape = normalizeBrushShape(button.dataset.brushShape, BRUSH_SHAPE_SQUARE);
        const pressed = shape === effectiveShape;
        button.classList.toggle('is-active', pressed);
        button.setAttribute('aria-pressed', String(pressed));
        if (shape === BRUSH_SHAPE_CUSTOM) {
          button.disabled = !hasCustomBrush && !hasSelection;
        } else {
          button.disabled = false;
        }
      });
      renderBrushShapeButtonIcons();
    }
    if (dom.controls.customBrushInfo instanceof HTMLOutputElement) {
      dom.controls.customBrushInfo.textContent = getCustomBrushStatusText();
    }
  }

  function syncBrushSizeFieldVisibility() {
    const shouldShow = true;
    if (dom.controls.brushSizeField instanceof HTMLElement) {
      dom.controls.brushSizeField.hidden = !shouldShow;
      dom.controls.brushSizeField.setAttribute('aria-hidden', String(!shouldShow));
    }
    if (dom.controls.brushSize instanceof HTMLInputElement) {
      dom.controls.brushSize.disabled = false;
      dom.controls.brushSize.setAttribute('aria-disabled', 'false');
    }
  }

  function syncSelectSameModeControls() {
    const activeMode = normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED);
    if (state.selectSameMode !== activeMode) {
      state.selectSameMode = activeMode;
    }
    const shouldShow = state.tool === 'selectSame' || FILL_TOOLS.has(state.tool);
    if (dom.controls.selectSameModeField instanceof HTMLElement) {
      dom.controls.selectSameModeField.hidden = !shouldShow;
      dom.controls.selectSameModeField.setAttribute('aria-hidden', String(!shouldShow));
    }
    if (!Array.isArray(dom.controls.selectSameModeButtons)) {
      return;
    }
    dom.controls.selectSameModeButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const mode = normalizeSelectSameMode(button.dataset.selectSameMode, SELECT_SAME_MODE_CONNECTED);
      const pressed = mode === activeMode;
      button.classList.toggle('is-active', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    });
  }

  function syncFillStyleControls() {
    const activeStyle = getActiveFillStyle(state.tool);
    if (state.fillStyle !== activeStyle) {
      state.fillStyle = activeStyle;
    }
  }

  function syncSelectionShapeModeControls() {
    const activeMode = normalizeSelectionShapeMode(state.selectionShapeMode, SELECTION_SHAPE_MODE_CONTENT);
    if (state.selectionShapeMode !== activeMode) {
      state.selectionShapeMode = activeMode;
    }
    const shouldShow = state.tool === 'selectRect' || state.tool === 'selectLasso';
    if (dom.controls.selectionShapeModeField instanceof HTMLElement) {
      dom.controls.selectionShapeModeField.hidden = !shouldShow;
      dom.controls.selectionShapeModeField.setAttribute('aria-hidden', String(!shouldShow));
    }
    if (!Array.isArray(dom.controls.selectionShapeModeButtons)) {
      return;
    }
    dom.controls.selectionShapeModeButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const mode = normalizeSelectionShapeMode(button.dataset.selectionShapeMode, SELECTION_SHAPE_MODE_CONTENT);
      const pressed = mode === activeMode;
      button.classList.toggle('is-active', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    });
  }

  function syncZoomControls(scaleValue = state.scale) {
    const normalizedScale = normalizeZoomScale(scaleValue, MIN_ZOOM_SCALE);
    const normalizedRatio = getZoomRatioForScale(normalizedScale);
    if (dom.controls.zoomSlider instanceof HTMLInputElement) {
      dom.controls.zoomSlider.value = String(Math.round(normalizedRatio * 100));
    }
    if (dom.controls.zoomInput instanceof HTMLInputElement) {
      dom.controls.zoomInput.min = String(ZOOM_SLIDER_MIN);
      dom.controls.zoomInput.max = String(ZOOM_SLIDER_MAX);
      dom.controls.zoomInput.step = '1';
      dom.controls.zoomInput.value = String(Math.round(normalizedRatio * 100));
    }
    if (dom.controls.zoomLevel) {
      dom.controls.zoomLevel.textContent = formatZoomLabel(normalizedScale);
    }
  }

  function syncControlsWithState() {
    if (dom.controls.brushSize) {
      dom.controls.brushSize.value = String(state.brushSize);
    }
    if (dom.controls.brushSizeValue) {
      dom.controls.brushSizeValue.textContent = `${state.brushSize}px`;
    }
    if (dom.controls.outlineSize) {
      dom.controls.outlineSize.value = String(state.outlineSize);
    }
    if (dom.controls.outlineSizeValue) {
      dom.controls.outlineSizeValue.textContent = localizeText(`${state.outlineSize}マス`, `${state.outlineSize} cells`);
    }
    syncBrushControls();
    syncBrushSizeFieldVisibility();
    syncSelectSameModeControls();
    syncFillStyleControls();
    syncSelectionShapeModeControls();
    if (dom.controls.canvasWidth instanceof HTMLInputElement) {
      if (document.activeElement !== dom.controls.canvasWidth) {
        dom.controls.canvasWidth.value = String(state.width);
      }
    }
    if (dom.controls.canvasHeight instanceof HTMLInputElement) {
      if (document.activeElement !== dom.controls.canvasHeight) {
        dom.controls.canvasHeight.value = String(state.height);
      }
    }
    updateCanvasResizeControls();
    if (dom.controls.toggleGrid instanceof HTMLInputElement) {
      dom.controls.toggleGrid.checked = state.showGrid;
    }
    if (dom.controls.toggleMajorGrid instanceof HTMLInputElement) {
      dom.controls.toggleMajorGrid.checked = state.showMajorGrid;
    }
    if (dom.controls.toggleBackgroundMode) {
      const labelMap = {
        dark: localizeText('背景:黒', 'BG: Black', '背景：黑'),
        light: localizeText('背景:白', 'BG: White', '背景：白'),
        pink: localizeText('背景:桃', 'BG: Pink', '背景：粉'),
      };
      dom.controls.toggleBackgroundMode.setAttribute('aria-pressed', String(state.backgroundMode !== 'dark'));
      const label = labelMap[state.backgroundMode] || localizeText('背景', 'BG');
      dom.controls.toggleBackgroundMode.textContent = label;
      dom.controls.toggleBackgroundMode.setAttribute('aria-label', label);
      dom.controls.toggleBackgroundMode.setAttribute('title', label);
    }
    if (dom.controls.toggleUiTheme instanceof HTMLButtonElement) {
      const normalizedTheme = normalizeUiTheme(state.uiTheme, DEFAULT_UI_THEME);
      const preset = UI_THEME_PRESETS[normalizedTheme] || UI_THEME_PRESETS[DEFAULT_UI_THEME];
      const label = localizeUiThemePresetLabel(preset?.label || UI_THEME_PRESETS[DEFAULT_UI_THEME].label);
      dom.controls.toggleUiTheme.textContent = `UI:${label}`;
      dom.controls.toggleUiTheme.setAttribute('aria-label', localizeText(`UIカラー:${label}`, `UI theme: ${label}`));
      dom.controls.toggleUiTheme.setAttribute('aria-pressed', String(normalizedTheme !== DEFAULT_UI_THEME));
    }
    if (dom.controls.toggleChecker) {
      dom.controls.toggleChecker.checked = state.showChecker;
    }
    if (dom.canvases.stack) {
      dom.canvases.stack.classList.toggle('is-flat', !state.showChecker);
    }
    if (dom.controls.togglePixelPreview) {
      dom.controls.togglePixelPreview.checked = state.showPixelGuides;
    }
    const mirrorState = getNormalizedMirrorState();
    if (dom.controls.toggleMirrorMode instanceof HTMLInputElement) {
      dom.controls.toggleMirrorMode.checked = Boolean(mirrorState.enabled);
    }
    const showMirrorOptions = Boolean(mirrorState.enabled);
    if (dom.controls.mirrorAxisOptions instanceof HTMLElement) {
      dom.controls.mirrorAxisOptions.hidden = !showMirrorOptions;
      dom.controls.mirrorAxisOptions.setAttribute('aria-hidden', String(!showMirrorOptions));
    }
    if (dom.controls.mirrorAxisHelp instanceof HTMLElement) {
      dom.controls.mirrorAxisHelp.hidden = !showMirrorOptions;
    }
    if (dom.controls.mirrorAxisVertical instanceof HTMLInputElement) {
      dom.controls.mirrorAxisVertical.checked = Boolean(mirrorState.axes[MIRROR_AXIS_VERTICAL]);
      dom.controls.mirrorAxisVertical.disabled = false;
    }
    if (dom.controls.mirrorAxisHorizontal instanceof HTMLInputElement) {
      dom.controls.mirrorAxisHorizontal.checked = Boolean(mirrorState.axes[MIRROR_AXIS_HORIZONTAL]);
      dom.controls.mirrorAxisHorizontal.disabled = false;
    }
    if (dom.controls.mirrorAxisDiagonalA instanceof HTMLInputElement) {
      dom.controls.mirrorAxisDiagonalA.checked = Boolean(mirrorState.axes[MIRROR_AXIS_DIAGONAL_A]);
      dom.controls.mirrorAxisDiagonalA.disabled = false;
    }
    if (dom.controls.mirrorAxisDiagonalB instanceof HTMLInputElement) {
      dom.controls.mirrorAxisDiagonalB.checked = Boolean(mirrorState.axes[MIRROR_AXIS_DIAGONAL_B]);
      dom.controls.mirrorAxisDiagonalB.disabled = false;
    }
    syncMirrorToolPopoverControls(mirrorState);
    updateMirrorActionButtons();
    updateVirtualCursorActionToolButtons();
    updateLocalCanvasActionToolButtons();
    updateFloatingPreviewActionToolButtons();
    syncVirtualCursorControlVisibility({ syncToggle: true });
    if (dom.controls.toggleFloatingPreview instanceof HTMLInputElement) {
      dom.controls.toggleFloatingPreview.checked = Boolean(state.floatingPreview?.enabled) || isVoxelExtensionModeEnabled();
      dom.controls.toggleFloatingPreview.disabled = isVoxelExtensionModeEnabled();
    }
    const qrEditPayload = syncQrEditModeWithActivePayload();
    if (dom.controls.qrModeToggleField instanceof HTMLElement) {
      const visible = Boolean(qrEditPayload);
      dom.controls.qrModeToggleField.hidden = !visible;
      dom.controls.qrModeToggleField.setAttribute('aria-hidden', String(!visible));
    }
    if (dom.controls.toggleQrMode instanceof HTMLInputElement) {
      dom.controls.toggleQrMode.checked = qrEditPayload ? qrEditPayload.panelVisible !== false : false;
      dom.controls.toggleQrMode.disabled = !qrEditPayload;
    }
    if (dom.controls.toggleCanvasResizeHandles instanceof HTMLInputElement) {
      dom.controls.toggleCanvasResizeHandles.checked = Boolean(state.showCanvasResizeHandles ?? true);
    }
    const localCanvasCount = normalizeLocalViewportCanvasState(
      localViewportCanvasState,
      LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE
    ).count;
    const canEditProjectStructure = canCurrentClientEditProjectStructure();
    const voxelModeEnabled = isVoxelExtensionModeEnabled();
    if (dom.controls.toggleLocalCanvas instanceof HTMLInputElement) {
      dom.controls.toggleLocalCanvas.checked = MULTI_CANVAS_FEATURE_ENABLED && localCanvasCount > 0;
      dom.controls.toggleLocalCanvas.disabled = !MULTI_CANVAS_FEATURE_ENABLED || !canEditProjectStructure || voxelModeEnabled;
    }
    if (dom.controls.localCanvasCountControls instanceof HTMLElement) {
      const showControls = MULTI_CANVAS_FEATURE_ENABLED && localCanvasCount > 0;
      dom.controls.localCanvasCountControls.hidden = !showControls;
      dom.controls.localCanvasCountControls.classList.toggle('is-hidden', !showControls);
      dom.controls.localCanvasCountControls.setAttribute('aria-hidden', String(!showControls));
    }
    if (dom.controls.localCanvasCountValue instanceof HTMLElement) {
      dom.controls.localCanvasCountValue.textContent = String(MULTI_CANVAS_FEATURE_ENABLED ? localCanvasCount : 0);
    }
    if (dom.controls.removeLocalCanvas instanceof HTMLButtonElement) {
      dom.controls.removeLocalCanvas.disabled = !MULTI_CANVAS_FEATURE_ENABLED || localCanvasCount <= 0 || !canEditProjectStructure || voxelModeEnabled;
    }
    if (dom.controls.addLocalCanvas instanceof HTMLButtonElement) {
      dom.controls.addLocalCanvas.disabled = !MULTI_CANVAS_FEATURE_ENABLED || localCanvasCount >= getLocalViewportCanvasMaxCount() || !canEditProjectStructure || voxelModeEnabled;
    }
    if (MULTI_CANVAS_FEATURE_ENABLED && localCanvasCount > 0) {
      syncMultiCanvasSelectionUi();
    } else if (dom.mainCanvasArea instanceof HTMLElement) {
      dom.mainCanvasArea.classList.add('is-multi-canvas-selected');
    }
    syncVoxelExtensionModeUi();
    if (dom.controls.toggleInlineHelp instanceof HTMLInputElement) {
      dom.controls.toggleInlineHelp.checked = inlineGuidesVisible;
    }
    updateFloatingPreviewPanelPlaybackButtons();
    syncZoomControls(state.scale);
    if (toolButtons.length) {
      setActiveTool(state.tool, toolButtons, { persist: false });
    }
    syncColorModeControls();
    updateColorTabSwatch();
    updateLeftTabUI();
    updateLeftTabVisibility();
    updateRightTabUI();
    updateRightTabVisibility();
    updateGridDecorations();
    updateHistoryButtons();
    updateCanvasControlButtons();
    syncActiveLayerSettingsUI();
    syncActiveFrameSettingsUI();
    updatePixfindModeUI();
    updateExportOriginalToggleUI();
    syncTimelapseControls();
    updateMirrorGuideHandles();
    updateCanvasResizeHandlePosition();
    syncCanvasResizeHandleVisibility();
    syncMultiControls();
    applyMultiRoleUiLocks();
  }

  function setLocalizedTextContent(target, jaText, enText, zhText = '') {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.textContent = localizeText(jaText, enText, zhText);
  }

  function setLocalizedHtmlContent(target, jaHtml, enHtml, zhHtml = '') {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.innerHTML = localizeText(jaHtml, enHtml, zhHtml);
  }

  function setLocalizedAttribute(target, attributeName, jaText, enText, zhText = '') {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.setAttribute(attributeName, localizeText(jaText, enText, zhText));
  }

  function setLocalizedToggleLabel(controlId, jaText, enText, zhText = '') {
    const label = document.querySelector(`label[for="${controlId}"] > span`);
    if (!(label instanceof HTMLElement)) {
      return;
    }
    label.textContent = localizeText(jaText, enText, zhText);
  }

  function setLocalizedControlLabel(controlId, jaText, enText, zhText = '') {
    const control = document.getElementById(controlId);
    if (!(control instanceof HTMLElement)) {
      return;
    }
    const label = control.closest('label');
    if (!(label instanceof HTMLElement)) {
      return;
    }
    const span = Array.from(label.children).find(child => child instanceof HTMLElement && child.tagName === 'SPAN');
    if (!(span instanceof HTMLElement)) {
      return;
    }
    span.textContent = localizeText(jaText, enText, zhText);
  }

  function setLocalizedSelectOption(selectNode, optionValue, jaText, enText, zhText = '') {
    if (!(selectNode instanceof HTMLSelectElement)) {
      return;
    }
    const option = selectNode.querySelector(`option[value="${optionValue}"]`);
    if (!(option instanceof HTMLOptionElement)) {
      return;
    }
    option.textContent = localizeText(jaText, enText, zhText);
  }

  function setInlineGuidesVisible(visible, { persist = true } = {}) {
    inlineGuidesVisible = Boolean(visible);
    document.body.classList.toggle('show-inline-guides', inlineGuidesVisible);
    if (dom.controls.toggleInlineHelp instanceof HTMLInputElement) {
      dom.controls.toggleInlineHelp.checked = inlineGuidesVisible;
    }
    if (persist) {
      storeInlineGuidesVisibility(inlineGuidesVisible);
    }
  }

  function renderHelpGuideEntries() {
    const container = dom.controls.helpArticleList;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const openIds = new Set(
      Array.from(container.querySelectorAll('.help-guide-item[open]')).map(node => node.dataset.helpItemId || '')
    );
    container.textContent = '';
    const fragment = document.createDocumentFragment();
    HELP_GUIDE_ITEMS.forEach((item, index) => {
      const details = document.createElement('details');
      details.className = 'help-guide-item';
      details.dataset.helpItemId = item.id;
      if (openIds.has(item.id) || (index === 0 && openIds.size === 0)) {
        details.open = true;
      }
      const searchSource = [
        item.title.ja,
        item.title.en,
        item.title.zh,
        item.keywords.ja,
        item.keywords.en,
        item.keywords.zh,
        ...item.points.ja,
        ...item.points.en,
        ...item.points.zh,
      ]
        .join(' ')
        .toLowerCase();
      details.dataset.helpSearch = searchSource;

      const summary = document.createElement('summary');
      summary.textContent = localizeText(item.title.ja, item.title.en, item.title.zh);
      details.appendChild(summary);

      const list = document.createElement('ul');
      list.className = 'help-guide-item__list';
      const points = isChineseUi() && Array.isArray(item.points.zh)
        ? item.points.zh
        : (uiLanguage === UI_LANGUAGE_JA ? item.points.ja : item.points.en);
      points.forEach(point => {
        const listItem = document.createElement('li');
        listItem.textContent = point;
        list.appendChild(listItem);
      });
      details.appendChild(list);
      fragment.appendChild(details);
    });
    container.appendChild(fragment);
  }

  function applyHelpGuideSearchFilter() {
    const container = dom.controls.helpArticleList;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const input = dom.controls.helpSearchInput;
    const normalized = normalizeHelpSearchQuery(input instanceof HTMLInputElement ? input.value : '');
    const tokens = normalized ? normalized.split(' ').filter(Boolean) : [];
    const items = Array.from(container.querySelectorAll('.help-guide-item'));
    const totalCount = items.length;
    let visibleCount = 0;

    items.forEach(item => {
      if (!(item instanceof HTMLElement)) {
        return;
      }
      const haystack = String(item.dataset.helpSearch || '').toLowerCase();
      const visible = tokens.length === 0 || tokens.every(token => haystack.includes(token));
      item.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });

    if (dom.controls.helpNoResults instanceof HTMLElement) {
      dom.controls.helpNoResults.hidden = visibleCount > 0;
    }
    if (dom.controls.helpSearchCount instanceof HTMLElement) {
      dom.controls.helpSearchCount.textContent = localizeText(
        `${visibleCount}/${totalCount} 件`,
        `${visibleCount}/${totalCount} items`,
        `${visibleCount}/${totalCount} 项`
      );
    }
  }

  function openOperationHelpPanel() {
    const dialog = dom.controls.operationHelpDialog;
    if (dialog instanceof HTMLDialogElement && typeof dialog.showModal === 'function') {
      renderHelpGuideEntries();
      applyHelpGuideSearchFilter();
      if (!dialog.open) {
        dialog.showModal();
      }
      window.requestAnimationFrame(() => {
        dom.controls.helpSearchInput?.focus?.({ preventScroll: true });
      });
      return;
    }
    if (layoutMode === 'mobilePortrait') {
      activateMobileTab('help', { ensureDrawer: true });
      window.requestAnimationFrame(() => {
        dom.controls.helpSearchInput?.focus?.({ preventScroll: true });
      });
      return;
    }
    const compactMode = isCompactRightRailMode();
    if (state.activeRightTab !== 'help') {
      setRightTab('help');
    }
    if (compactMode) {
      setRailWidth('right', getRailExpandedToggleWidth('right'), { persist: true });
      setCompactRightFlyoutOpen(false);
      updateRightTabVisibility();
    }
    window.requestAnimationFrame(() => {
      dom.controls.helpSearchInput?.focus?.({ preventScroll: true });
    });
  }



  function getDefaultLayerName(layerNumber = 1) {
    const safeNumber = Math.max(1, Math.round(Number(layerNumber) || 1));
    return localizeText(`レイヤー ${safeNumber}`, `Layer ${safeNumber}`, `图层 ${safeNumber}`);
  }

  function getDefaultFrameName(frameNumber = 1) {
    const safeNumber = Math.max(1, Math.round(Number(frameNumber) || 1));
    return localizeText(`フレーム ${safeNumber}`, `Frame ${safeNumber}`, `帧 ${safeNumber}`);
  }


  return Object.freeze({
    updateThemeColorMeta,
    applyUiTheme,
    createMirrorToolPopoverButton,
    renderMirrorToolPopover,
    onMirrorToolClick,
    syncMirrorToolPopoverControls,
    syncVirtualCursorControlVisibility,
    getCustomBrushStatusText,
    getBrushShapeIconFillStyle,
    getBrushShapeDotGlyph,
    drawBrushShapeDotGlyph,
    renderBrushShapeButtonIcon,
    renderBrushShapeButtonIcons,
    syncBrushControls,
    syncBrushSizeFieldVisibility,
    syncSelectSameModeControls,
    syncFillStyleControls,
    syncSelectionShapeModeControls,
    syncZoomControls,
    syncControlsWithState,
    setLocalizedTextContent,
    setLocalizedHtmlContent,
    setLocalizedAttribute,
    setLocalizedToggleLabel,
    setLocalizedControlLabel,
    setLocalizedSelectOption,
    setInlineGuidesVisible,
    renderHelpGuideEntries,
    applyHelpGuideSearchFilter,
    openOperationHelpPanel,
    getDefaultLayerName,
    getDefaultFrameName,
  });
      }
    })(scope);
  }

  root.controlUiUtils = Object.freeze({
    createControlUiUtils,
  });
})();
