(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPalettePresetWorkflowUtils(rawScope = {}) {
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
  function getPalettePresetDisplayName(definition, language = uiLanguage) {
    if (!definition || typeof definition !== 'object') {
      return '';
    }
    const normalizedLanguage = UI_LANGUAGE_SET.has(language) ? language : uiLanguage;
    const label = normalizedLanguage === UI_LANGUAGE_ZH
      ? String(definition.nameZh || definition.nameJa || definition.name || '')
      : (normalizedLanguage === UI_LANGUAGE_EN
        ? String(definition.name || '')
        : String(definition.nameJa || definition.name || ''));
    return normalizePalettePresetDisplayName(label);
  }

  function renderPalettePresetSelectOptions(select, selectedPresetId = NEW_PROJECT_PALETTE_PRESET_DEFAULT, { includeCustom = false } = {}) {
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    const language = UI_LANGUAGE_SET.has(uiLanguage) ? uiLanguage : UI_LANGUAGE_JA;
    const fragment = document.createDocumentFragment();
    if (includeCustom) {
      const customOption = document.createElement('option');
      customOption.value = CURRENT_PALETTE_PRESET_CUSTOM;
      customOption.textContent = localizeText('カスタム', 'Custom', '自定义');
      fragment.appendChild(customOption);
    }
    for (const definition of NEW_PROJECT_PALETTE_PRESET_DEFINITIONS) {
      const option = document.createElement('option');
      option.value = definition.id;
      option.textContent = getPalettePresetDisplayName(definition, language);
      fragment.appendChild(option);
    }
    select.textContent = '';
    select.appendChild(fragment);
    select.dataset.paletteLanguage = language;
    select.value = includeCustom
      ? normalizeCurrentPalettePreset(selectedPresetId, currentPalettePresetId || CURRENT_PALETTE_PRESET_CUSTOM)
      : normalizeNewProjectPalettePreset(selectedPresetId, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
  }

  function renderNewProjectPalettePresetOptions(selectedPresetId = newProjectPalettePresetId) {
    renderPalettePresetSelectOptions(
      dom.newProject?.palettePreset,
      selectedPresetId
    );
  }

  function renderColorPanelPalettePresetOptions(selectedPresetId = currentPalettePresetId) {
    renderPalettePresetSelectOptions(
      dom.controls.palettePresetSelect,
      selectedPresetId,
      { includeCustom: true }
    );
    renderPalettePresetPicker(selectedPresetId);
  }

  function getCurrentPalettePresetDisplayName(presetId = currentPalettePresetId) {
    const normalized = normalizeCurrentPalettePreset(presetId, currentPalettePresetId);
    if (normalized === CURRENT_PALETTE_PRESET_CUSTOM) {
      return localizeText('カスタム', 'Custom', '自定义');
    }
    return getPalettePresetDisplayName(
      getNewProjectPalettePresetDefinition(normalized, NEW_PROJECT_PALETTE_PRESET_DEFAULT)
    );
  }

  function getCurrentPalettePresetPreviewColors(presetId = currentPalettePresetId) {
    const normalized = normalizeCurrentPalettePreset(presetId, currentPalettePresetId);
    if (normalized === CURRENT_PALETTE_PRESET_CUSTOM) {
      if (Array.isArray(state?.palette) && state.palette.length) {
        return state.palette.map(color => normalizeColorValue(color));
      }
      return [{ r: 0, g: 0, b: 0, a: 0 }];
    }
    return getNewProjectPalettePresetColors(normalized, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
  }

  function findMatchingPalettePresetIdForPalette(palette = state?.palette) {
    const normalizedPalette = Array.isArray(palette)
      ? palette.map(color => normalizeColorValue(color))
      : [];
    if (!normalizedPalette.length) {
      return CURRENT_PALETTE_PRESET_CUSTOM;
    }
    for (const definition of NEW_PROJECT_PALETTE_PRESET_DEFINITIONS) {
      const presetColors = getNewProjectPalettePresetColors(definition.id, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
      if (presetColors.length !== normalizedPalette.length) {
        continue;
      }
      if (palettesMatch(presetColors, normalizedPalette)) {
        return definition.id;
      }
    }
    return CURRENT_PALETTE_PRESET_CUSTOM;
  }

  function syncCurrentPalettePresetFromPalette(palette = state?.palette, { syncControl = true } = {}) {
    const matchedPresetId = findMatchingPalettePresetIdForPalette(palette);
    return setCurrentPalettePresetId(matchedPresetId, { syncControl });
  }

  function renderPalettePresetPreview(
    presetId = currentPalettePresetId,
    previewNode = dom.controls.palettePresetPreview,
    maxDots = 16
  ) {
    if (!(previewNode instanceof HTMLElement)) {
      return;
    }
    const colors = getCurrentPalettePresetPreviewColors(presetId);
    previewNode.textContent = '';
    const fragment = document.createDocumentFragment();
    const limit = clamp(Math.round(Number(maxDots) || 16), 1, 32);
    colors.slice(0, limit).forEach(color => {
      const dot = document.createElement('span');
      dot.className = 'palette-preset-preview__dot';
      dot.style.background = rgbaToCss(normalizeColorValue(color));
      fragment.appendChild(dot);
    });
    previewNode.appendChild(fragment);
  }

  function appendPalettePresetSwatches(container, colors, maxSwatches = PALETTE_PRESET_BUTTON_SWATCH_MAX) {
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const normalizedColors = Array.isArray(colors) ? colors : [];
    const limit = clamp(Math.round(Number(maxSwatches) || 0), 0, PALETTE_PRESET_BUTTON_SWATCH_MAX);
    normalizedColors.slice(0, limit).forEach(color => {
      const swatch = document.createElement('span');
      swatch.className = 'palette-preset-picker__swatch';
      swatch.style.background = rgbaToCss(normalizeColorValue(color));
      container.appendChild(swatch);
    });
  }

  function getPalettePresetButtonSwatchCount(button, labelNode, colors) {
    const colorCount = clamp(Array.isArray(colors) ? colors.length : 0, 0, PALETTE_PRESET_BUTTON_SWATCH_MAX);
    if (!colorCount) {
      return 0;
    }
    if (!(button instanceof HTMLButtonElement) || !(labelNode instanceof HTMLElement)) {
      return Math.min(colorCount, PALETTE_PRESET_BUTTON_SWATCH_FALLBACK);
    }
    const style = window.getComputedStyle(button);
    const paddingInline = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const gap = Number.parseFloat(style.columnGap || style.gap || '0') || 0;
    const buttonWidth = button.clientWidth || Math.round(button.getBoundingClientRect().width) || 0;
    if (!buttonWidth) {
      return Math.min(colorCount, PALETTE_PRESET_BUTTON_SWATCH_FALLBACK);
    }
    const labelWidth = Math.ceil(
      labelNode.getBoundingClientRect().width
      || labelNode.scrollWidth
      || labelNode.offsetWidth
      || 0
    );
    const availableWidth = Math.floor(
      buttonWidth - paddingInline - labelWidth - gap - PALETTE_PRESET_BUTTON_SWATCH_FRAME_PX
    );
    if (availableWidth <= 0) {
      button.classList.add('is-preview-only');
      return Math.min(colorCount, PALETTE_PRESET_BUTTON_SWATCH_FALLBACK);
    }
    button.classList.remove('is-preview-only');
    return clamp(
      Math.floor((availableWidth + 1) / PALETTE_PRESET_BUTTON_SWATCH_STEP_PX),
      Math.min(colorCount, PALETTE_PRESET_BUTTON_SWATCH_FALLBACK),
      colorCount
    );
  }

  function refreshPalettePresetPickerButtons() {
    renderPalettePresetPicker(currentPalettePresetId);
    renderNewProjectPalettePresetPicker(newProjectPalettePresetId);
  }

  function schedulePalettePresetPickerRefresh() {
    if (palettePresetPickerRefreshFrame) {
      return;
    }
    palettePresetPickerRefreshFrame = window.requestAnimationFrame(() => {
      palettePresetPickerRefreshFrame = 0;
      refreshPalettePresetPickerButtons();
      if (dom.controls.palettePresetPickerButton?.getAttribute('aria-expanded') === 'true') {
        updatePalettePresetPickerMenuPosition();
      }
      if (dom.newProject?.palettePresetPickerButton?.getAttribute('aria-expanded') === 'true') {
        updateNewProjectPalettePresetPickerMenuPosition();
      }
    });
  }

  function setPresetPickerOpen(button, menu, open, updatePosition) {
    if (!(button instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
      return;
    }
    const nextOpen = Boolean(open) && !button.disabled;
    button.setAttribute('aria-expanded', String(nextOpen));
    menu.hidden = !nextOpen;
    if (nextOpen && typeof updatePosition === 'function') {
      updatePosition();
    }
  }

  function setPalettePresetPickerOpen(open) {
    setPresetPickerOpen(
      dom.controls.palettePresetPickerButton,
      dom.controls.palettePresetPickerMenu,
      open,
      updatePalettePresetPickerMenuPosition
    );
  }

  function setNewProjectPalettePresetPickerOpen(open) {
    setPresetPickerOpen(
      dom.newProject?.palettePresetPickerButton,
      dom.newProject?.palettePresetPickerMenu,
      open,
      updateNewProjectPalettePresetPickerMenuPosition
    );
  }

  function updatePresetPickerMenuPosition(button, menu) {
    if (!(button instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
      return;
    }
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const viewportPadding = 8;
    const maxOptionWidth = Array.from(menu.querySelectorAll('.palette-preset-picker__option')).reduce((largest, option) => {
      if (!(option instanceof HTMLElement)) {
        return largest;
      }
      const label = option.querySelector('.palette-preset-picker__label');
      const swatches = option.querySelector('.palette-preset-picker__swatches');
      const style = window.getComputedStyle(option);
      const paddingInline = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
      const borderInline = (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0);
      const gap = Number.parseFloat(style.columnGap || style.gap || '0') || 0;
      const labelWidth = label instanceof HTMLElement ? (label.scrollWidth || label.offsetWidth || 0) : 0;
      const swatchWidth = swatches instanceof HTMLElement ? (swatches.scrollWidth || swatches.offsetWidth || 0) : 0;
      const intrinsic = Math.ceil(labelWidth + swatchWidth + gap + paddingInline + borderInline);
      return Math.max(largest, intrinsic);
    }, 0);
    const preferredWidth = Math.max(rect.width, maxOptionWidth + 12, 260);
    const maxWidth = Math.max(220, window.innerWidth - (viewportPadding * 2));
    const width = Math.min(preferredWidth, maxWidth);
    let left = rect.left;
    left = clamp(left, viewportPadding, Math.max(viewportPadding, window.innerWidth - width - viewportPadding));
    const maxHeight = Math.max(160, Math.min(360, Math.floor(window.innerHeight * 0.45)));
    menu.style.position = 'fixed';
    menu.style.left = `${Math.round(left)}px`;
    menu.style.width = `${Math.round(width)}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.zIndex = '2140';
    menu.style.transform = 'none';
    menu.style.bottom = 'auto';
    menu.style.top = '0px';
    const measuredHeight = Math.min(menu.scrollHeight || maxHeight, maxHeight);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = measuredHeight > spaceBelow && spaceAbove > spaceBelow;
    if (openUpward) {
      const top = Math.max(viewportPadding, rect.top - measuredHeight - 4);
      menu.style.top = `${Math.round(top)}px`;
    } else {
      const top = Math.min(
        window.innerHeight - viewportPadding - measuredHeight,
        rect.bottom + 4
      );
      menu.style.top = `${Math.round(Math.max(viewportPadding, top))}px`;
    }
  }

  function updatePalettePresetPickerMenuPosition() {
    updatePresetPickerMenuPosition(
      dom.controls.palettePresetPickerButton,
      dom.controls.palettePresetPickerMenu
    );
  }

  function updateNewProjectPalettePresetPickerMenuPosition() {
    updatePresetPickerMenuPosition(
      dom.newProject?.palettePresetPickerButton,
      dom.newProject?.palettePresetPickerMenu
    );
  }

  function renderPalettePresetPicker(selectedPresetId = currentPalettePresetId) {
    const button = dom.controls.palettePresetPickerButton;
    const menu = dom.controls.palettePresetPickerMenu;
    if (!(button instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
      return;
    }
    const normalized = normalizeCurrentPalettePreset(selectedPresetId, currentPalettePresetId);
    const selectedLabel = getCurrentPalettePresetDisplayName(normalized);
    button.textContent = '';
    button.title = selectedLabel;
    const selectedLabelNode = document.createElement('span');
    selectedLabelNode.className = 'palette-preset-picker__button-label';
    selectedLabelNode.textContent = selectedLabel;
    const selectedColors = getCurrentPalettePresetPreviewColors(normalized);
    button.appendChild(selectedLabelNode);
    const selectedSwatchCount = getPalettePresetButtonSwatchCount(button, selectedLabelNode, selectedColors);
    if (selectedSwatchCount > 0) {
      const selectedSwatches = document.createElement('span');
      selectedSwatches.className = 'palette-preset-picker__swatches';
      appendPalettePresetSwatches(selectedSwatches, selectedColors, selectedSwatchCount);
      button.appendChild(selectedSwatches);
    }
    menu.textContent = '';
    const fragment = document.createDocumentFragment();
    const customRow = document.createElement('button');
    customRow.type = 'button';
    customRow.className = 'palette-preset-picker__option';
    customRow.dataset.presetId = CURRENT_PALETTE_PRESET_CUSTOM;
    customRow.setAttribute('role', 'option');
    const isCustomActive = normalized === CURRENT_PALETTE_PRESET_CUSTOM;
    customRow.classList.toggle('is-active', isCustomActive);
    customRow.setAttribute('aria-selected', String(isCustomActive));

    const customLabel = document.createElement('span');
    customLabel.className = 'palette-preset-picker__label';
    customLabel.textContent = localizeText('カスタム', 'Custom', '自定义');
    customRow.appendChild(customLabel);

    const customSwatches = document.createElement('span');
    customSwatches.className = 'palette-preset-picker__swatches';
    appendPalettePresetSwatches(
      customSwatches,
      getCurrentPalettePresetPreviewColors(CURRENT_PALETTE_PRESET_CUSTOM)
    );
    customRow.appendChild(customSwatches);

    customRow.addEventListener('click', () => {
      setCurrentPalettePresetId(CURRENT_PALETTE_PRESET_CUSTOM, { syncControl: true });
      setPalettePresetPickerOpen(false);
    });
    fragment.appendChild(customRow);

    NEW_PROJECT_PALETTE_PRESET_DEFINITIONS.forEach(definition => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'palette-preset-picker__option';
      row.dataset.presetId = definition.id;
      row.setAttribute('role', 'option');
      const isActive = definition.id === normalized;
      row.classList.toggle('is-active', isActive);
      row.setAttribute('aria-selected', String(isActive));

      const label = document.createElement('span');
      label.className = 'palette-preset-picker__label';
      label.textContent = getPalettePresetDisplayName(definition);
      row.appendChild(label);

      const swatches = document.createElement('span');
      swatches.className = 'palette-preset-picker__swatches';
      const colors = getNewProjectPalettePresetColors(definition.id, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
      appendPalettePresetSwatches(swatches, colors);
      row.appendChild(swatches);

      row.addEventListener('click', () => {
        applyPalettePresetToCurrentPalette(definition.id, { announce: true });
        setPalettePresetPickerOpen(false);
      });
      fragment.appendChild(row);
    });
    menu.appendChild(fragment);
  }

  function renderNewProjectPalettePresetPicker(selectedPresetId = newProjectPalettePresetId) {
    const button = dom.newProject?.palettePresetPickerButton;
    const menu = dom.newProject?.palettePresetPickerMenu;
    if (!(button instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
      return;
    }
    const normalized = normalizeNewProjectPalettePreset(selectedPresetId, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
    const selectedDefinition = getNewProjectPalettePresetDefinition(normalized, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
    const selectedLabel = getPalettePresetDisplayName(selectedDefinition);
    button.textContent = '';
    button.title = selectedLabel;
    const selectedLabelNode = document.createElement('span');
    selectedLabelNode.className = 'palette-preset-picker__button-label';
    selectedLabelNode.textContent = selectedLabel;
    const selectedColors = getNewProjectPalettePresetColors(normalized, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
    button.appendChild(selectedLabelNode);
    const selectedSwatchCount = getPalettePresetButtonSwatchCount(button, selectedLabelNode, selectedColors);
    if (selectedSwatchCount > 0) {
      const selectedSwatches = document.createElement('span');
      selectedSwatches.className = 'palette-preset-picker__swatches';
      appendPalettePresetSwatches(selectedSwatches, selectedColors, selectedSwatchCount);
      button.appendChild(selectedSwatches);
    }

    menu.textContent = '';
    const fragment = document.createDocumentFragment();
    NEW_PROJECT_PALETTE_PRESET_DEFINITIONS.forEach(definition => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'palette-preset-picker__option';
      row.dataset.presetId = definition.id;
      row.setAttribute('role', 'option');
      const isActive = definition.id === normalized;
      row.classList.toggle('is-active', isActive);
      row.setAttribute('aria-selected', String(isActive));

      const label = document.createElement('span');
      label.className = 'palette-preset-picker__label';
      label.textContent = getPalettePresetDisplayName(definition);
      row.appendChild(label);

      const swatches = document.createElement('span');
      swatches.className = 'palette-preset-picker__swatches';
      const colors = getNewProjectPalettePresetColors(definition.id, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
      appendPalettePresetSwatches(swatches, colors);
      row.appendChild(swatches);

      row.addEventListener('click', () => {
        setNewProjectPalettePresetId(definition.id, { persist: true, syncControl: true });
        setNewProjectPalettePresetPickerOpen(false);
      });
      fragment.appendChild(row);
    });
    menu.appendChild(fragment);
  }

  function setNewProjectPalettePresetId(presetId, { persist = true, syncControl = true } = {}) {
    const normalized = normalizeNewProjectPalettePreset(presetId, newProjectPalettePresetId || NEW_PROJECT_PALETTE_PRESET_DEFAULT);
    newProjectPalettePresetId = normalized;
    if (persist) {
      storeNewProjectPalettePresetId(normalized);
    }
    if (syncControl) {
      renderNewProjectPalettePresetOptions(normalized);
      if (dom.newProject?.palettePreset instanceof HTMLSelectElement) {
        dom.newProject.palettePreset.value = normalized;
      }
      renderNewProjectPalettePresetPicker(normalized);
    }
    return normalized;
  }

  function setCurrentPalettePresetId(presetId, { syncControl = true } = {}) {
    const normalized = normalizeCurrentPalettePreset(presetId, currentPalettePresetId || CURRENT_PALETTE_PRESET_CUSTOM);
    currentPalettePresetId = normalized;
    if (syncControl) {
      renderColorPanelPalettePresetOptions(normalized);
      if (dom.controls.palettePresetSelect instanceof HTMLSelectElement) {
        dom.controls.palettePresetSelect.value = normalized;
      }
      renderPalettePresetPicker(normalized);
      renderPalettePresetPreview(normalized);
    }
    return normalized;
  }

  function markCurrentPalettePresetCustom({ syncControl = true } = {}) {
    return setCurrentPalettePresetId(CURRENT_PALETTE_PRESET_CUSTOM, { syncControl });
  }


  return Object.freeze({
    getPalettePresetDisplayName,
    renderPalettePresetSelectOptions,
    renderNewProjectPalettePresetOptions,
    renderColorPanelPalettePresetOptions,
    getCurrentPalettePresetDisplayName,
    getCurrentPalettePresetPreviewColors,
    findMatchingPalettePresetIdForPalette,
    syncCurrentPalettePresetFromPalette,
    renderPalettePresetPreview,
    appendPalettePresetSwatches,
    getPalettePresetButtonSwatchCount,
    refreshPalettePresetPickerButtons,
    schedulePalettePresetPickerRefresh,
    setPresetPickerOpen,
    setPalettePresetPickerOpen,
    setNewProjectPalettePresetPickerOpen,
    updatePresetPickerMenuPosition,
    updatePalettePresetPickerMenuPosition,
    updateNewProjectPalettePresetPickerMenuPosition,
    renderPalettePresetPicker,
    renderNewProjectPalettePresetPicker,
    setNewProjectPalettePresetId,
    setCurrentPalettePresetId,
    markCurrentPalettePresetCustom,
  });
      }
    })(scope);
  }

  root.palettePresetWorkflowUtils = Object.freeze({
    createPalettePresetWorkflowUtils,
  });
})();
