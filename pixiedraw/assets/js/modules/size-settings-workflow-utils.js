(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSizeSettingsWorkflowUtils(rawScope = {}) {
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
  function hasPendingCanvasResizeInputChange() {
    const widthInput = dom.controls.canvasWidth;
    const heightInput = dom.controls.canvasHeight;
    if (!(widthInput instanceof HTMLInputElement) || !(heightInput instanceof HTMLInputElement)) {
      return false;
    }
    const width = getCanvasResizeInputValue(widthInput, state.width);
    const height = getCanvasResizeInputValue(heightInput, state.height);
    return width !== state.width || height !== state.height;
  }

  function hasPendingSpriteScaleInputChange() {
    const input = dom.controls.spriteScaleInput;
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return false;
    }
    const maxMultiplier = getMaxSpriteMultiplier();
    const current = getNearestSpriteScaleOption(input.value, maxMultiplier);
    return Math.abs(current.value - 1) > SPRITE_SCALE_EPSILON;
  }

  function updateSettingsSizeApplyButtonState() {
    const button = dom.controls.applySpriteScale;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const canEdit = canCurrentClientEditProjectStructure({ announce: false })
      && lockedCanvasWidth === null
      && lockedCanvasHeight === null;
    button.disabled = !canEdit || !(hasPendingCanvasResizeInputChange() || hasPendingSpriteScaleInputChange());
  }

  function adjustSpriteScaleInputBy(delta) {
    const input = dom.controls.spriteScaleInput;
    if (!input || input.disabled) {
      return;
    }
    const maxMultiplier = getMaxSpriteMultiplier();
    const options = getSpriteScaleOptions(maxMultiplier);
    const currentIndex = getSpriteScaleOptionIndex(input.value, maxMultiplier);
    const nextIndex = clamp(currentIndex + Math.round(Number(delta) || 0), 0, options.length - 1);
    if (nextIndex === currentIndex) {
      updateSpriteScaleControlLimits();
      return;
    }
    input.value = options[nextIndex].label;
    updateSpriteScaleControlLimits();
  }



  return Object.freeze({
    hasPendingCanvasResizeInputChange,
    hasPendingSpriteScaleInputChange,
    updateSettingsSizeApplyButtonState,
    adjustSpriteScaleInputBy,
  });
      }
    })(scope);
  }

  root.sizeSettingsWorkflowUtils = Object.freeze({
    createSizeSettingsWorkflowUtils,
  });
})();
