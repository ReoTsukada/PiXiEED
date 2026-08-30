(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSpriteScaleUtils({
    MAX_CANVAS_SIZE,
    SPRITE_SCALE_DOWN_PRESETS,
    SPRITE_SCALE_EPSILON,
    SPRITE_SCALE_MIN,
    state,
    dom,
    updateSettingsSizeApplyButtonState,
  } = {}) {

    function getMaxSpriteMultiplier() {
      const largest = Math.max(state.width || 0, state.height || 0);
      if (!largest) return 1;
      return Math.max(1, Math.floor(MAX_CANVAS_SIZE / largest));
    }
  
  
    function getSpriteScaleOptions(maxMultiplier = getMaxSpriteMultiplier()) {
      const max = Math.max(1, Math.floor(Number(maxMultiplier) || 1));
      const options = SPRITE_SCALE_DOWN_PRESETS.map(option => ({ ...option }));
      for (let value = 1; value <= max; value += 1) {
        options.push({
          value,
          label: String(value),
          numerator: value,
          denominator: 1,
        });
      }
      return options;
    }
  
  
    function getNearestSpriteScaleOption(value, maxMultiplier = getMaxSpriteMultiplier()) {
      const options = getSpriteScaleOptions(maxMultiplier);
      const numeric = Number(value);
      const target = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
      let best = options.find(option => Math.abs(option.value - 1) <= SPRITE_SCALE_EPSILON) || options[0];
      let bestDiff = Number.POSITIVE_INFINITY;
      for (let i = 0; i < options.length; i += 1) {
        const option = options[i];
        const diff = Math.abs(option.value - target);
        if (diff < bestDiff - SPRITE_SCALE_EPSILON) {
          best = option;
          bestDiff = diff;
        }
      }
      return best;
    }
  
  
    function getSpriteScaleOptionIndex(value, maxMultiplier = getMaxSpriteMultiplier()) {
      const options = getSpriteScaleOptions(maxMultiplier);
      const nearest = getNearestSpriteScaleOption(value, maxMultiplier);
      return Math.max(0, options.findIndex(option => Math.abs(option.value - nearest.value) <= SPRITE_SCALE_EPSILON));
    }
  
  
    function updateSpriteScaleControlLimits() {
      const input = dom.controls.spriteScaleInput;
      const decrementButton = dom.controls.spriteScaleDecrement;
      const incrementButton = dom.controls.spriteScaleIncrement;
      if (!input) return;
      const maxMultiplier = getMaxSpriteMultiplier();
      const options = getSpriteScaleOptions(maxMultiplier);
      const currentOption = getNearestSpriteScaleOption(input.value, maxMultiplier);
      const currentIndex = getSpriteScaleOptionIndex(currentOption.value, maxMultiplier);
      input.min = String(SPRITE_SCALE_MIN);
      input.max = String(maxMultiplier);
      input.step = '0.01';
      input.value = currentOption.label;
      input.disabled = options.length <= 1;
      if (decrementButton) {
        if (input.disabled || currentIndex <= 0) decrementButton.setAttribute('disabled', 'true');
        else decrementButton.removeAttribute('disabled');
      }
      if (incrementButton) {
        if (input.disabled || currentIndex >= options.length - 1) incrementButton.setAttribute('disabled', 'true');
        else incrementButton.removeAttribute('disabled');
      }
      updateSettingsSizeApplyButtonState();
    }
  
  
    return {
      getMaxSpriteMultiplier,
      getSpriteScaleOptions,
      getNearestSpriteScaleOption,
      getSpriteScaleOptionIndex,
      updateSpriteScaleControlLimits,
    };
  }

  root.spriteScaleUtils = {
    createSpriteScaleUtils,
  };
})();
