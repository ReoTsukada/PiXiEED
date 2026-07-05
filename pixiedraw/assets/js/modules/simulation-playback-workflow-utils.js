(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSimulationPlaybackWorkflowUtils(rawScope = {}) {
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
  function tryMoveSimulationCell(layer, fromIndex, toIndex, nextElementMap, nextVelXMap, nextVelYMap, nextLifeMap, nextTempMap, nextLightMap, nextDepthMap, nextAirMap, nextAuxMap, nextActiveMap) {
    if (toIndex < 0 || toIndex >= nextElementMap.length) {
      return false;
    }
    const target = nextElementMap[toIndex];
    const source = nextElementMap[fromIndex];
    if (target === SIM_ELEMENT_EMPTY) {
      nextElementMap[toIndex] = source;
      nextVelXMap[toIndex] = layer.velXMap[fromIndex];
      nextVelYMap[toIndex] = layer.velYMap[fromIndex];
      nextLifeMap[toIndex] = layer.lifeMap[fromIndex];
      nextTempMap[toIndex] = layer.tempMap[fromIndex];
      nextLightMap[toIndex] = layer.lightMap[fromIndex];
      nextDepthMap[toIndex] = layer.depthMap[fromIndex];
      nextAirMap[toIndex] = layer.airMap[fromIndex];
      nextAuxMap[toIndex] = layer.auxMap[fromIndex];
      nextElementMap[fromIndex] = SIM_ELEMENT_EMPTY;
      nextVelXMap[fromIndex] = 0;
      nextVelYMap[fromIndex] = 0;
      nextLifeMap[fromIndex] = 0;
      nextTempMap[fromIndex] = 0;
      nextLightMap[fromIndex] = 0;
      nextAuxMap[fromIndex] = 0;
      nextActiveMap[toIndex] = 1;
      nextActiveMap[fromIndex] = 1;
      return true;
    }
    if (source === SIM_ELEMENT_SAND && (target === SIM_ELEMENT_WATER || target === SIM_ELEMENT_SMOKE || target === SIM_ELEMENT_FIRE)) {
      nextElementMap[toIndex] = source;
      nextElementMap[fromIndex] = target;
      nextActiveMap[toIndex] = 1;
      nextActiveMap[fromIndex] = 1;
      return true;
    }
    return false;
  }

  function rebuildSimulationLightMap(layer, width, height) {
    if (!isSimulationLayer(layer)) {
      return;
    }
    layer.lightMap.fill(0);
    for (let i = 0; i < layer.elementMap.length; i += 1) {
      const element = layer.elementMap[i];
      if (element !== SIM_ELEMENT_FIRE && element !== SIM_ELEMENT_LIGHT) continue;
      const sx = i % width;
      const sy = Math.floor(i / width);
      const sourceStrength = element === SIM_ELEMENT_LIGHT ? 255 : 220;
      for (let dy = -SIM_MAX_LIGHT_RADIUS; dy <= SIM_MAX_LIGHT_RADIUS; dy += 1) {
        for (let dx = -SIM_MAX_LIGHT_RADIUS; dx <= SIM_MAX_LIGHT_RADIUS; dx += 1) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist > SIM_MAX_LIGHT_RADIUS) continue;
          const ni = (ny * width) + nx;
          const blocker = layer.elementMap[ni] === SIM_ELEMENT_WALL ? 26 : 0;
          const value = Math.max(0, sourceStrength - (dist * 36) - blocker);
          if (value > layer.lightMap[ni]) {
            layer.lightMap[ni] = value;
          }
        }
      }
    }
  }

  function stepSimulationLayer(layer, width = state.width, height = state.height, tickCount = 1) {
    if (!isSimulationLayer(layer)) {
      return false;
    }
    let changed = false;
    const size = Math.max(0, layer.elementMap.length);
    if (layer.activeMap.length !== size) {
      layer.activeMap = new Uint8Array(size);
      changed = true;
    }
    for (let i = 0; i < size; i += 1) {
      const active = layer.elementMap[i] !== SIM_ELEMENT_EMPTY ? 1 : 0;
      if (layer.activeMap[i] !== active) {
        layer.activeMap[i] = active;
        changed = true;
      }
    }
    const previousLight = new Uint8Array(layer.lightMap);
    rebuildSimulationLightMap(layer, width, height);
    for (let i = 0; i < size; i += 1) {
      if (previousLight[i] !== layer.lightMap[i]) {
        changed = true;
        break;
      }
    }
    return changed;
  }

  function stepSimulationForFrame(frame = getActiveFrame(), tickCount = 1) {
    if (!frame || !Array.isArray(frame.layers)) {
      return false;
    }
    let changed = false;
    for (let i = 0; i < frame.layers.length; i += 1) {
      const layer = frame.layers[i];
      if (isSimulationLayer(layer) && stepSimulationLayer(layer, state.width, state.height, tickCount)) {
        changed = true;
      }
    }
    if (changed) {
      clearPlaybackFrameCache();
      markCanvasDirty();
      requestRender();
      requestOverlayRender();
    }
    return changed;
  }

  function stopSimulationPlayback() {
    simulationRuntime.playing = false;
    if (simulationRuntime.handle != null) {
      window.cancelAnimationFrame(simulationRuntime.handle);
      simulationRuntime.handle = null;
    }
  }

  function runSimulationPlayback(timestamp) {
    if (!simulationRuntime.playing) {
      return;
    }
    const activeLayer = getSimulationActiveLayer();
    const tickRate = Math.max(1, Number(activeLayer?.settings?.tickRate) || SIM_DEFAULT_SETTINGS.tickRate);
    const frameDuration = 1000 / tickRate;
    if (!simulationRuntime.lastTickAt) {
      simulationRuntime.lastTickAt = timestamp;
    }
    if ((timestamp - simulationRuntime.lastTickAt) >= frameDuration) {
      stepSimulationForFrame(getActiveFrame(), 1);
      simulationRuntime.lastTickAt = timestamp;
    }
    simulationRuntime.handle = window.requestAnimationFrame(runSimulationPlayback);
  }

  function startSimulationPlayback() {
    if (simulationRuntime.playing) {
      return;
    }
    simulationRuntime.playing = true;
    simulationRuntime.lastTickAt = 0;
    simulationRuntime.handle = window.requestAnimationFrame(runSimulationPlayback);
  }



  return Object.freeze({
    tryMoveSimulationCell,
    rebuildSimulationLightMap,
    stepSimulationLayer,
    stepSimulationForFrame,
    stopSimulationPlayback,
    runSimulationPlayback,
    startSimulationPlayback,
  });
      }
    })(scope);
  }

  root.simulationPlaybackWorkflowUtils = Object.freeze({
    createSimulationPlaybackWorkflowUtils,
  });
})();
