import fs from 'node:fs';
import path from 'node:path';

const appPath = 'PiXiEEDDraw.dev/assets/js/app.js';
const indexPath = 'PiXiEEDDraw.dev/index.html';
const cssPath = 'PiXiEEDDraw.dev/assets/css/style.css';
const moduleDir = 'PiXiEEDDraw.dev/assets/js/modules';
const layoutViewportPath = 'PiXiEEDDraw.dev/assets/js/modules/layout-viewport.js';

const appSource = fs.readFileSync(appPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const appLines = appSource.split('\n');
const failures = [];

function lineOf(needle) {
  const index = appLines.findIndex(line => line.includes(needle));
  return index >= 0 ? index + 1 : 0;
}

function findDeclarationLine(name) {
  const functionLine = lineOf(`function ${name}(`);
  if (functionLine) {
    return { line: functionLine, kind: 'function' };
  }

  const declarationPatterns = [
    new RegExp(`\\bconst\\s+${name}\\b`),
    new RegExp(`\\blet\\s+${name}\\b`),
    new RegExp(`\\bvar\\s+${name}\\b`),
    new RegExp(`^\\s*${name}\\s*,\\s*$`),
    new RegExp(`^\\s*${name}\\s*:`),
  ];

  for (let index = 0; index < appLines.length; index += 1) {
    const line = appLines[index];
    if (declarationPatterns.some(pattern => pattern.test(line))) {
      return { line: index + 1, kind: 'binding' };
    }
  }
  return { line: 0, kind: 'missing' };
}

function requireBefore(name, boundaryLabel, boundaryLine) {
  const declaration = findDeclarationLine(name);
  if (!boundaryLine) {
    failures.push(`${boundaryLabel}: boundary not found`);
    return;
  }
  if (!declaration.line) {
    failures.push(`${name}: declaration not found before ${boundaryLabel}`);
    return;
  }
  if (declaration.kind !== 'function' && declaration.line >= boundaryLine) {
    failures.push(`${name}: ${declaration.kind} at line ${declaration.line} is after ${boundaryLabel} line ${boundaryLine}`);
  }
  if (declaration.kind === 'function' && declaration.line >= boundaryLine) {
    failures.push(`${name}: function declaration at line ${declaration.line} should stay physically before ${boundaryLabel} line ${boundaryLine} for split clarity`);
  }
}

function getExportedNames(moduleFile) {
  const source = fs.readFileSync(path.join(moduleDir, moduleFile), 'utf8');
  const marker = 'return Object.freeze({';
  const start = source.lastIndexOf(marker);
  if (start < 0) {
    return [];
  }
  const bodyStart = start + marker.length;
  let depth = 1;
  let end = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end < 0) return [];
  return source
    .slice(bodyStart, end)
    .split('\n')
    .map(line => line.trim().replace(/,$/, ''))
    .filter(line => /^[A-Za-z_$][\w$]*$/.test(line));
}

function checkDirectModuleReferenceBeforeInit(moduleKey, moduleFile) {
  const initLine = lineOf(`const ${moduleKey}Module =`);
  if (!initLine) {
    failures.push(`${moduleKey}: module init not found`);
    return;
  }
  const names = getExportedNames(moduleFile);
  const before = appLines.slice(0, initLine - 1);
  for (const name of names) {
    const direct = new RegExp(`^\\s*${name}\\s*,\\s*$`);
    const propDirect = new RegExp(`^\\s*[A-Za-z_$][\\w$]*\\s*:\\s*${name}\\s*,?\\s*$`);
    before.forEach((line, index) => {
      if (direct.test(line) || propDirect.test(line)) {
        failures.push(`${moduleKey}.${name}: direct reference before module init at line ${index + 1}`);
      }
    });
  }
}

function getModuleScopeBlock(moduleKey) {
  const start = appSource.indexOf(`const ${moduleKey}Module =`);
  if (start < 0) {
    return '';
  }
  const endMarker = '}) || {};';
  const end = appSource.indexOf(endMarker, start);
  if (end < 0) {
    return appSource.slice(start);
  }
  return appSource.slice(start, end + endMarker.length);
}

function requireInjectedGetter(moduleKey, name) {
  const block = getModuleScopeBlock(moduleKey);
  if (!block) {
    failures.push(`${moduleKey}: module scope block not found for ${name}`);
    return;
  }
  if (!new RegExp(`\\bget\\s+${name}\\s*\\(\\)`).test(block)) {
    failures.push(`${moduleKey}: missing injected getter for ${name}`);
  }
}

function getFunctionBlock(name) {
  const start = appSource.indexOf(`function ${name}(`);
  if (start < 0) {
    return '';
  }
  const next = appSource.indexOf('\n  function ', start + 1);
  return next >= 0 ? appSource.slice(start, next) : appSource.slice(start);
}

const restoreCallLine = lineOf('restoreSessionState();');
const backGuardInstallLine = lineOf('installMobileBackButtonGuard();');
const focusListenerLine = lineOf("window.addEventListener('focus', handleMultiWindowFocus)");
const stateNormalizersLine = lineOf('const stateNormalizers =');
const documentModelLine = lineOf('const documentModel =');
const initCallLine = lineOf('init();');

requireBefore('init', 'init() call', initCallLine);
requireBefore('runStartupTaskWithTimeout', 'init() call', initCallLine);

const layoutViewportSource = fs.readFileSync(layoutViewportPath, 'utf8');
if (/\basync\s+function\s+init\s*\(/.test(layoutViewportSource) || /\bfunction\s+init\s*\(/.test(layoutViewportSource)) {
  failures.push('layout-viewport.js must not own app boot init(); keep startup orchestration in app.js');
}

const uiStaticConfigSource = fs.readFileSync(path.join(moduleDir, 'ui-static-config.js'), 'utf8');
[
  'createToolActionStaticConfig',
  'createAppStaticConfig',
  'createStorageStaticConfig',
  'createRuntimeStaticConfig',
].forEach(name => {
  if (!uiStaticConfigSource.includes(`function ${name}(`) || !uiStaticConfigSource.includes(`    ${name},`)) {
    failures.push(`ui-static-config.js: missing exported ${name}`);
  }
});
const projectStorageUtilsSource = fs.readFileSync(path.join(moduleDir, 'project-storage-utils.js'), 'utf8');
if (
  !projectStorageUtilsSource.includes('function createProjectRuntimeStaticConfig(')
  || !projectStorageUtilsSource.includes('    createProjectRuntimeStaticConfig,')
) {
  failures.push('project-storage-utils.js: missing exported createProjectRuntimeStaticConfig');
}
if (
  !layoutViewportSource.includes('function createLayoutStaticConfig(')
  || !layoutViewportSource.includes('    createLayoutStaticConfig,')
) {
  failures.push('layout-viewport.js: missing exported createLayoutStaticConfig');
}
const stateNormalizersSource = fs.readFileSync(path.join(moduleDir, 'state-normalizers.js'), 'utf8');
if (
  !stateNormalizersSource.includes('function createDrawingStateStaticConfig(')
  || !stateNormalizersSource.includes('    createDrawingStateStaticConfig,')
) {
  failures.push('state-normalizers.js: missing exported createDrawingStateStaticConfig');
}

const toolActionConfigLine = lineOf('const toolActionStaticConfig =');
const toolbarConfigLine = lineOf('const toolbarStaticConfig =');
const appStaticConfigLine = lineOf('const appStaticConfig =');
const embedConfigLine = lineOf('const EMBED_CONFIG = parseEmbedConfig();');
const storageStaticConfigLine = lineOf('const storageStaticConfig =');
const canUseSessionStorageLine = lineOf('const canUseSessionStorage =');
const runtimeStaticConfigLine = lineOf('const runtimeStaticConfig =');
const exportDeliveryUtilsLine = lineOf('const exportDeliveryUtils =');
const projectRuntimeStaticConfigLine = lineOf('const projectRuntimeStaticConfig =');
const projectStorageUtilsLine = lineOf('const projectStorageUtils =');
const layoutStaticConfigLine = lineOf('const layoutStaticConfig =');
const railSizingLine = lineOf('const railSizing =');
const drawingStateStaticConfigLine = lineOf('const drawingStateStaticConfig =');
if (!toolActionConfigLine || !toolbarConfigLine || toolActionConfigLine >= toolbarConfigLine) {
  failures.push('tool action static config must initialize before toolbar static config');
}
if (!appStaticConfigLine || !embedConfigLine || appStaticConfigLine >= embedConfigLine) {
  failures.push('app static config must initialize before parseEmbedConfig()');
}
if (!storageStaticConfigLine || !canUseSessionStorageLine || storageStaticConfigLine >= canUseSessionStorageLine) {
  failures.push('storage static config must initialize before storage helpers');
}
if (!runtimeStaticConfigLine || !exportDeliveryUtilsLine || runtimeStaticConfigLine >= exportDeliveryUtilsLine) {
  failures.push('runtime static config must initialize before export delivery utils');
}
if (!projectRuntimeStaticConfigLine || !projectStorageUtilsLine || projectRuntimeStaticConfigLine >= projectStorageUtilsLine) {
  failures.push('project runtime static config must initialize before project storage utils');
}
if (!layoutStaticConfigLine || !railSizingLine || layoutStaticConfigLine >= railSizingLine) {
  failures.push('layout static config must initialize before rail sizing state');
}
if (!drawingStateStaticConfigLine || !documentModelLine || drawingStateStaticConfigLine >= documentModelLine) {
  failures.push('drawing state static config must initialize before document model');
}

[
  'normalizeExportFormat',
  'normalizeExportGridTileSize',
  'normalizeTimelapseFps',
  'deserializeLocalLayerVisibilityMap',
  'deserializeLocalLayerPreviewOpacityMap',
  'normalizeLocalViewportCanvasState',
].forEach(name => requireBefore(name, 'restoreSessionState()', restoreCallLine));

[
  'encodeTypedArray',
  'decodeBase64',
  'validateBoundsObject',
].forEach(name => requireBefore(name, 'state/document model bootstrap', Math.min(stateNormalizersLine || Infinity, documentModelLine || Infinity)));

requireBefore('isCoarsePointerDevice', 'installMobileBackButtonGuard()', backGuardInstallLine);
requireBefore('recentProjectsCache', 'handleMultiWindowFocus listener registration', focusListenerLine);
requireBefore('floatingDrawControlsReady', 'restoreSessionState()', restoreCallLine);
const setVirtualCursorButtonScaleBlock = getFunctionBlock('setVirtualCursorButtonScale');
if (!setVirtualCursorButtonScaleBlock) {
  failures.push('setVirtualCursorButtonScale: function block not found');
} else if (/\bupdateFloatingMovePadPosition\s*\(\s*\)\s*;/.test(setVirtualCursorButtonScaleBlock)) {
  failures.push('setVirtualCursorButtonScale: use updateFloatingMovePadPositionIfReady() before floatingDrawControlsUtils init');
}
const setFloatingDrawButtonPositionBlock = getFunctionBlock('setFloatingDrawButtonPosition');
if (!setFloatingDrawButtonPositionBlock) {
  failures.push('setFloatingDrawButtonPosition: function block not found');
} else if (/\bupdateFloatingMovePadPosition\s*\(\s*\)\s*;/.test(setFloatingDrawButtonPositionBlock)) {
  failures.push('setFloatingDrawButtonPosition: use updateFloatingMovePadPositionIfReady() before floatingDrawControlsUtils init');
}
const updateFloatingDrawButtonPalettePreviewBlock = getFunctionBlock('updateFloatingDrawButtonPalettePreview');
if (!updateFloatingDrawButtonPalettePreviewBlock) {
  failures.push('updateFloatingDrawButtonPalettePreview: function block not found');
} else if (/\bgetActiveDrawColor\s*\(/.test(updateFloatingDrawButtonPalettePreviewBlock)) {
  failures.push('updateFloatingDrawButtonPalettePreview: do not call getActiveDrawColor() before pointerState init');
}
const resolveFloatingDrawButtonPressTargetBlock = getFunctionBlock('resolveFloatingDrawButtonPressTarget');
if (!resolveFloatingDrawButtonPressTargetBlock) {
  failures.push('resolveFloatingDrawButtonPressTarget: function block not found');
} else {
  [
    'getBoundingClientRect',
    'clientX',
    'offsetX',
    'secondaryPaletteIndex',
  ].forEach(needle => {
    if (!resolveFloatingDrawButtonPressTargetBlock.includes(needle)) {
      failures.push(`resolveFloatingDrawButtonPressTarget: missing ${needle} branch`);
    }
  });
}
const getActiveDrawColorBlock = getFunctionBlock('getActiveDrawColor');
if (!getActiveDrawColorBlock) {
  failures.push('getActiveDrawColor: function block not found');
} else if (
  !getActiveDrawColorBlock.includes('paletteIndexOverride')
  || !getActiveDrawColorBlock.includes('overridePaletteIndex')
  || !getActiveDrawColorBlock.includes('state.palette[overridePaletteIndex]')
) {
  failures.push('getActiveDrawColor: RGB mode must honor paletteIndexOverride for virtual cursor secondary color');
}
const getPalettePresetButtonSwatchCountBlock = getFunctionBlock('getPalettePresetButtonSwatchCount');
if (!getPalettePresetButtonSwatchCountBlock) {
  failures.push('getPalettePresetButtonSwatchCount: function block not found');
} else if (/availableWidth\s*<=\s*0[\s\S]*?return\s+0\s*;/.test(getPalettePresetButtonSwatchCountBlock)) {
  failures.push('getPalettePresetButtonSwatchCount: keep fallback swatches visible on the preset button');
} else if (!getPalettePresetButtonSwatchCountBlock.includes("classList.add('is-preview-only')")) {
  failures.push('getPalettePresetButtonSwatchCount: add is-preview-only when the preset button is too narrow');
}
if (!cssSource.includes('.palette-preset-picker__button.is-preview-only')) {
  failures.push('style.css: missing palette preset preview-only button style');
}
if (
  !cssSource.includes('#panelColor .palette-preset-inline') ||
  !cssSource.includes('width: 100%;') ||
  !cssSource.includes('#panelColor .palette-preset-picker__button-label') ||
  !cssSource.includes('display: none;')
) {
  failures.push('style.css: keep right-rail palette preset button wide enough for swatches');
}
requireInjectedGetter('layoutViewport', 'LEFT_PALETTE_COMPACT_WIDTH');
requireInjectedGetter('timelineLayers', 'TIMELINE_CELL_SIZE');
[
  'EXTENSION_MODE_NONE',
  'EXTENSION_MODE_VOXEL',
  'VOXEL_EXTENSION_DEFAULT_STATE',
  'VOXEL_EXTENSION_LABELS',
  'VOXEL_EXTENSION_PROJECT_NAMES',
  'VOXEL_EXTENSION_ROLES',
  'floatingPreviewGizmoCtx',
  'voxelExtensionGuideProjections',
  'voxelExtensionPreviewMeta',
  'voxelExtensionPreviewPixels',
  'voxelExtensionRestoreSnapshot',
  'voxelExtensionState',
].forEach(name => requireInjectedGetter('voxelModeUtils', name));
[
  'hoverPixel',
  'pointerState',
  'VOXEL_EXTENSION_DEFAULT_STATE',
  'VOXEL_EXTENSION_PREVIEW_MAX_EDGE',
  'VOXEL_PREVIEW_DRAG_AXIS_LOCK_DEADZONE_PX',
  'VOXEL_PREVIEW_DRAG_TILT_DEGREES',
  'VOXEL_PREVIEW_DRAG_TURN_DEGREES',
  'voxelExtensionState',
].forEach(name => requireInjectedGetter('voxelInteractionUtils', name));
[
  'autosaveProjectId',
  'FLOATING_PREVIEW_DEFAULT_STATE',
  'FLOATING_PREVIEW_MAX_SIZE',
  'FLOATING_PREVIEW_MIN_SIZE',
  'floatingPreviewCtx',
  'floatingPreviewPanelState',
  'floatingPreviewReferenceRestoreToken',
  'floatingPreviewReferenceState',
  'floatingPreviewViewportState',
  'state',
  'VOXEL_EXTENSION_DEFAULT_STATE',
  'VOXEL_EXTENSION_DEFAULT_YAW_DEG',
  'VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG',
  'voxelExtensionPreviewMeta',
  'voxelExtensionPreviewPixels',
  'voxelExtensionState',
].forEach(name => requireInjectedGetter('floatingPreviewPanelUtils', name));
[
  'DEFAULT_FLOATING_DRAW_BUTTON_SCALE',
  'dom',
  'floatingDrawButtonState',
  'floatingMovePadState',
  'MOVE_PAD_REPEAT_DELAY_MS',
  'MOVE_PAD_REPEAT_INTERVAL_MS',
  'pointerState',
  'state',
].forEach(name => requireInjectedGetter('floatingDrawControlsUtils', name));
[
  'dom',
  'exportColorSpritesEnabled',
  'exportContestPostAfterSave',
  'exportGridTileHeight',
  'exportGridTileWidth',
  'exportIncludeOriginalSize',
  'exportInterstitialAdRequested',
  'exportSaveProjectCompanion',
  'exportSaveSpriteMapCompanion',
  'exportScaleUserOverride',
  'state',
].forEach(name => requireInjectedGetter('dialogSetupUtils', name));
[
  'VOXEL_EXTENSION_DISPLAY_PIXEL_MAX',
  'VOXEL_EXTENSION_DISPLAY_PIXEL_MIN',
  'VOXEL_EXTENSION_MAX_SOURCE_EDGE',
  'VOXEL_EXTENSION_PREVIEW_MAX_EDGE',
  'VOXEL_EXTENSION_PREVIEW_PITCH_MAX_DEG',
  'VOXEL_EXTENSION_PREVIEW_PITCH_MIN_DEG',
  'voxelExtensionState',
].forEach(name => requireInjectedGetter('voxelPreviewUtils', name));

[
  ['dialogSetupUtils', 'dialog-setup-utils.js'],
  ['exportRendering', 'export-rendering.js'],
  ['staticContent', 'static-content.js'],
  ['floatingDrawControlsUtils', 'floating-draw-controls-utils.js'],
  ['floatingPreviewPanelUtils', 'floating-preview-panel-utils.js'],
  ['voxelModeUtils', 'voxel-mode-utils.js'],
  ['voxelInteractionUtils', 'voxel-interaction-utils.js'],
  ['voxelPreviewUtils', 'voxel-preview-utils.js'],
  ['voxelGlbUtils', 'voxel-glb-utils.js'],
  ['layoutViewport', 'layout-viewport.js'],
  ['controlsMirror', 'controls-mirror.js'],
  ['timelineLayers', 'timeline-layers.js'],
].forEach(([moduleKey, moduleFile]) => checkDirectModuleReferenceBeforeInit(moduleKey, moduleFile));

for (const moduleFile of ['layout-viewport.js', 'controls-mirror.js', 'timeline-layers.js', 'export-rendering.js', 'floating-draw-controls-utils.js', 'dialog-setup-utils.js']) {
  const source = fs.readFileSync(path.join(moduleDir, moduleFile), 'utf8');
  source.split('\n').forEach((line, index) => {
    if (/(^|[^.])\b(requestAnimationFrame|cancelAnimationFrame)\(/.test(line)) {
      failures.push(`${moduleFile}: use window.requestAnimationFrame/window.cancelAnimationFrame at line ${index + 1}`);
    }
  });
}

const indexSource = fs.readFileSync(indexPath, 'utf8');
const appVersion = appSource.match(/const APP_BUILD_VERSION = '([^']+)'/)?.[1] || '';
const indexVersion = indexSource.match(/assets\/js\/app\.js\?v=([^"]+)/)?.[1] || '';
if (!appVersion || !indexVersion || appVersion !== indexVersion) {
  failures.push(`APP_BUILD_VERSION/index query mismatch: app=${appVersion || '(missing)'} index=${indexVersion || '(missing)'}`);
}

if (failures.length) {
  console.error('PiXiEEDDraw.dev TDZ guard failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('PiXiEEDDraw.dev TDZ guard passed.');
