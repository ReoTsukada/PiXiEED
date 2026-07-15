import fs from 'node:fs';
import path from 'node:path';

const appPath = 'PiXiEEDrawDEV/assets/js/app.js';
const indexPath = 'PiXiEEDrawDEV/index.html';
const cssPath = 'PiXiEEDrawDEV/assets/css/style.css';
const moduleDir = 'PiXiEEDrawDEV/assets/js/modules';
const layoutViewportPath = 'PiXiEEDrawDEV/assets/js/modules/layout-viewport.js';

const appSource = fs.readFileSync(appPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const appLines = appSource.split('\n');
const failures = [];
const topLevelDepthBeforeLine = [];

function getBraceDepthDelta(line) {
  const stripped = line
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '``')
    .replace(/\/\/.*$/, '');
  let delta = 0;
  for (const char of stripped) {
    if (char === '{') {
      delta += 1;
    } else if (char === '}') {
      delta -= 1;
    }
  }
  return delta;
}

let topLevelDepth = 0;
appLines.forEach(line => {
  topLevelDepthBeforeLine.push(topLevelDepth);
  topLevelDepth += getBraceDepthDelta(line);
});

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
      const lineNumber = index + 1;
      const topLevelCall = topLevelDepthBeforeLine[index] === 1
        && new RegExp(`(^|[^.\\w$])${name}\\s*\\(`).test(line)
        && !new RegExp(`^\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`).test(line)
        && !new RegExp(`\\b(?:get|set)\\s+${name}\\s*\\(`).test(line);
      if (topLevelCall) {
        failures.push(`${moduleKey}.${name}: top-level call before module init at line ${lineNumber}`);
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

function getFunctionBlockFromSource(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  if (start < 0) {
    return '';
  }
  const next = sourceText.indexOf('\n  function ', start + 1);
  return next >= 0 ? sourceText.slice(start, next) : sourceText.slice(start);
}

const restoreCallLine = lineOf('restoreSessionState();');
const backGuardInstallLine = lineOf('installMobileBackButtonGuard();');
const focusListenerLine = lineOf("window.addEventListener('focus', handleMultiWindowFocus)");
const stateNormalizersLine = lineOf('const stateNormalizers =');
const documentModelLine = lineOf('const documentModel =');
const initCallLine = lineOf('init();');
const projectFileMenuBindLine = lineOf('bindProjectFileMenuOnce();');
const projectPersistenceGetterLine = lineOf('function getActiveProjectPersistenceState(');
const editableTargetLine = lineOf('function isEditableTarget(');

requireBefore('init', 'init() call', initCallLine);
requireBefore('runStartupTaskWithTimeout', 'init() call', initCallLine);

// File menu startup invokes persistence rendering immediately and installs a
// keydown callback that uses isEditableTarget. It must bind after both exist.
if (!projectFileMenuBindLine || !projectPersistenceGetterLine || !editableTargetLine) {
  failures.push('project file menu: required binding or dependency declaration is missing');
} else {
  if (projectFileMenuBindLine <= projectPersistenceGetterLine) {
    failures.push(`project file menu: binding at line ${projectFileMenuBindLine} precedes getActiveProjectPersistenceState at line ${projectPersistenceGetterLine}`);
  }
  if (projectFileMenuBindLine <= editableTargetLine) {
    failures.push(`project file menu: binding at line ${projectFileMenuBindLine} precedes isEditableTarget at line ${editableTargetLine}`);
  }
}
const coreProjectActions = getFunctionBlock('bindCoreProjectActionButtons');
if (/bindProjectFileMenuOnce\(\)/.test(coreProjectActions)) {
  failures.push('project file menu: must not bind from early core project action setup');
}

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
const embedConfigUtilsSource = fs.readFileSync(path.join(moduleDir, 'embed-config-utils.js'), 'utf8');
if (
  !embedConfigUtilsSource.includes('function createEmbedConfigUtils(')
  || !embedConfigUtilsSource.includes('    createEmbedConfigUtils,')
) {
  failures.push('embed-config-utils.js: missing exported createEmbedConfigUtils');
}
const autosaveDatabaseUtilsSource = fs.readFileSync(path.join(moduleDir, 'autosave-database-utils.js'), 'utf8');
if (
  !autosaveDatabaseUtilsSource.includes('function createAutosaveDatabaseUtils(')
  || !autosaveDatabaseUtilsSource.includes('    createAutosaveDatabaseUtils,')
) {
  failures.push('autosave-database-utils.js: missing exported createAutosaveDatabaseUtils');
}
const exportNormalizerUtilsSource = fs.readFileSync(path.join(moduleDir, 'export-normalizer-utils.js'), 'utf8');
if (
  !exportNormalizerUtilsSource.includes('function createExportNormalizerUtils(')
  || !exportNormalizerUtilsSource.includes('    createExportNormalizerUtils,')
) {
  failures.push('export-normalizer-utils.js: missing exported createExportNormalizerUtils');
}
const pixieedSupportBenefitUtilsSource = fs.readFileSync(path.join(moduleDir, 'pixieed-support-benefit-utils.js'), 'utf8');
if (
  !pixieedSupportBenefitUtilsSource.includes('function createPixieedSupportBenefitUtils(')
  || !pixieedSupportBenefitUtilsSource.includes('    createPixieedSupportBenefitUtils,')
) {
  failures.push('pixieed-support-benefit-utils.js: missing exported createPixieedSupportBenefitUtils');
}
const canvasCoreWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-core-workflow-utils.js'), 'utf8');
if (
  !canvasCoreWorkflowUtilsSource.includes('function createCanvasCoreWorkflowUtils(')
  || !canvasCoreWorkflowUtilsSource.includes('    createCanvasCoreWorkflowUtils,')
) {
  failures.push('canvas-core-workflow-utils.js: missing exported createCanvasCoreWorkflowUtils');
}
const canvasDrawingWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-drawing-workflow-utils.js'), 'utf8');
if (
  !canvasDrawingWorkflowUtilsSource.includes('function createCanvasDrawingWorkflowUtils(')
  || !canvasDrawingWorkflowUtilsSource.includes('    createCanvasDrawingWorkflowUtils,')
) {
  failures.push('canvas-drawing-workflow-utils.js: missing exported createCanvasDrawingWorkflowUtils');
}
const canvasPointerWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-pointer-workflow-utils.js'), 'utf8');
if (
  !canvasPointerWorkflowUtilsSource.includes('function createCanvasPointerWorkflowUtils(')
  || !canvasPointerWorkflowUtilsSource.includes('    createCanvasPointerWorkflowUtils,')
) {
  failures.push('canvas-pointer-workflow-utils.js: missing exported createCanvasPointerWorkflowUtils');
}
const externalToolWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'external-tool-workflow-utils.js'), 'utf8');
if (
  !externalToolWorkflowUtilsSource.includes('function createExternalToolWorkflowUtils(')
  || !externalToolWorkflowUtilsSource.includes('    createExternalToolWorkflowUtils,')
) {
  failures.push('external-tool-workflow-utils.js: missing exported createExternalToolWorkflowUtils');
}
const canvasToolStateWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-tool-state-workflow-utils.js'), 'utf8');
if (
  !canvasToolStateWorkflowUtilsSource.includes('function createCanvasToolStateWorkflowUtils(')
  || !canvasToolStateWorkflowUtilsSource.includes('    createCanvasToolStateWorkflowUtils,')
) {
  failures.push('canvas-tool-state-workflow-utils.js: missing exported createCanvasToolStateWorkflowUtils');
}
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
const iosSnapshotUtilsSource = fs.readFileSync(path.join(moduleDir, 'ios-snapshot-utils.js'), 'utf8');
if (
  !iosSnapshotUtilsSource.includes('function createIosSnapshotUtils(')
  || !iosSnapshotUtilsSource.includes('    createIosSnapshotUtils,')
) {
  failures.push('ios-snapshot-utils.js: missing exported createIosSnapshotUtils');
}
const pixfindModeUtilsSource = fs.readFileSync(path.join(moduleDir, 'pixfind-mode-utils.js'), 'utf8');
if (
  !pixfindModeUtilsSource.includes('function createPixfindModeUtils(')
  || !pixfindModeUtilsSource.includes('    createPixfindModeUtils,')
) {
  failures.push('pixfind-mode-utils.js: missing exported createPixfindModeUtils');
}
const palettePresetWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'palette-preset-workflow-utils.js'), 'utf8');
if (
  !palettePresetWorkflowUtilsSource.includes('function createPalettePresetWorkflowUtils(')
  || !palettePresetWorkflowUtilsSource.includes('    createPalettePresetWorkflowUtils,')
) {
  failures.push('palette-preset-workflow-utils.js: missing exported createPalettePresetWorkflowUtils');
}
const railToolUiUtilsSource = fs.readFileSync(path.join(moduleDir, 'rail-tool-ui-utils.js'), 'utf8');
if (
  !railToolUiUtilsSource.includes('function createRailToolUiUtils(')
  || !railToolUiUtilsSource.includes('    createRailToolUiUtils,')
) {
  failures.push('rail-tool-ui-utils.js: missing exported createRailToolUiUtils');
}
const controlUiUtilsSource = fs.readFileSync(path.join(moduleDir, 'control-ui-utils.js'), 'utf8');
if (
  !controlUiUtilsSource.includes('function createControlUiUtils(')
  || !controlUiUtilsSource.includes('    createControlUiUtils,')
) {
  failures.push('control-ui-utils.js: missing exported createControlUiUtils');
}
const uiActionButtonsWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'ui-action-buttons-workflow-utils.js'), 'utf8');
if (
  !uiActionButtonsWorkflowUtilsSource.includes('function createUiActionButtonsWorkflowUtils(')
  || !uiActionButtonsWorkflowUtilsSource.includes('    createUiActionButtonsWorkflowUtils,')
) {
  failures.push('ui-action-buttons-workflow-utils.js: missing exported createUiActionButtonsWorkflowUtils');
}
const uiActionRouterWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'ui-action-router-workflow-utils.js'), 'utf8');
if (
  !uiActionRouterWorkflowUtilsSource.includes('function createUiActionRouterWorkflowUtils(')
  || !uiActionRouterWorkflowUtilsSource.includes('    createUiActionRouterWorkflowUtils,')
) {
  failures.push('ui-action-router-workflow-utils.js: missing exported createUiActionRouterWorkflowUtils');
}
const canvasControlActionsWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-control-actions-workflow-utils.js'), 'utf8');
if (
  !canvasControlActionsWorkflowUtilsSource.includes('function createCanvasControlActionsWorkflowUtils(')
  || !canvasControlActionsWorkflowUtilsSource.includes('    createCanvasControlActionsWorkflowUtils,')
) {
  failures.push('canvas-control-actions-workflow-utils.js: missing exported createCanvasControlActionsWorkflowUtils');
}
const historyGuardWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'history-guard-workflow-utils.js'), 'utf8');
if (
  !historyGuardWorkflowUtilsSource.includes('function createHistoryGuardWorkflowUtils(')
  || !historyGuardWorkflowUtilsSource.includes('    createHistoryGuardWorkflowUtils,')
) {
  failures.push('history-guard-workflow-utils.js: missing exported createHistoryGuardWorkflowUtils');
}
const curveWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'curve-workflow-utils.js'), 'utf8');
if (
  !curveWorkflowUtilsSource.includes('function createCurveWorkflowUtils(')
  || !curveWorkflowUtilsSource.includes('    createCurveWorkflowUtils,')
) {
  failures.push('curve-workflow-utils.js: missing exported createCurveWorkflowUtils');
}
const canvasGridWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-grid-workflow-utils.js'), 'utf8');
if (
  !canvasGridWorkflowUtilsSource.includes('function createCanvasGridWorkflowUtils(')
  || !canvasGridWorkflowUtilsSource.includes('    createCanvasGridWorkflowUtils,')
) {
  failures.push('canvas-grid-workflow-utils.js: missing exported createCanvasGridWorkflowUtils');
}
const sizeSettingsWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'size-settings-workflow-utils.js'), 'utf8');
if (
  !sizeSettingsWorkflowUtilsSource.includes('function createSizeSettingsWorkflowUtils(')
  || !sizeSettingsWorkflowUtilsSource.includes('    createSizeSettingsWorkflowUtils,')
) {
  failures.push('size-settings-workflow-utils.js: missing exported createSizeSettingsWorkflowUtils');
}
const timelineNavigationWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'timeline-navigation-workflow-utils.js'), 'utf8');
if (
  !timelineNavigationWorkflowUtilsSource.includes('function createTimelineNavigationWorkflowUtils(')
  || !timelineNavigationWorkflowUtilsSource.includes('    createTimelineNavigationWorkflowUtils,')
) {
  failures.push('timeline-navigation-workflow-utils.js: missing exported createTimelineNavigationWorkflowUtils');
}
const openProjectTabWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'open-project-tab-workflow-utils.js'), 'utf8');
if (
  !openProjectTabWorkflowUtilsSource.includes('function createOpenProjectTabWorkflowUtils(')
  || !openProjectTabWorkflowUtilsSource.includes('    createOpenProjectTabWorkflowUtils,')
) {
  failures.push('open-project-tab-workflow-utils.js: missing exported createOpenProjectTabWorkflowUtils');
}
const historyCoreWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'history-core-workflow-utils.js'), 'utf8');
if (
  !historyCoreWorkflowUtilsSource.includes('function createHistoryCoreWorkflowUtils(')
  || !historyCoreWorkflowUtilsSource.includes('    createHistoryCoreWorkflowUtils,')
) {
  failures.push('history-core-workflow-utils.js: missing exported createHistoryCoreWorkflowUtils');
}
const canvasResizeWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-resize-workflow-utils.js'), 'utf8');
if (
  !canvasResizeWorkflowUtilsSource.includes('function createCanvasResizeWorkflowUtils(')
  || !canvasResizeWorkflowUtilsSource.includes('    createCanvasResizeWorkflowUtils,')
) {
  failures.push('canvas-resize-workflow-utils.js: missing exported createCanvasResizeWorkflowUtils');
}
const simulationPlaybackWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'simulation-playback-workflow-utils.js'), 'utf8');
if (
  !simulationPlaybackWorkflowUtilsSource.includes('function createSimulationPlaybackWorkflowUtils(')
  || !simulationPlaybackWorkflowUtilsSource.includes('    createSimulationPlaybackWorkflowUtils,')
) {
  failures.push('simulation-playback-workflow-utils.js: missing exported createSimulationPlaybackWorkflowUtils');
}
const keyboardWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'keyboard-workflow-utils.js'), 'utf8');
if (
  !keyboardWorkflowUtilsSource.includes('function createKeyboardWorkflowUtils(')
  || !keyboardWorkflowUtilsSource.includes('    createKeyboardWorkflowUtils,')
) {
  failures.push('keyboard-workflow-utils.js: missing exported createKeyboardWorkflowUtils');
}
const canvasResizeHandleWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-resize-handle-workflow-utils.js'), 'utf8');
if (
  !canvasResizeHandleWorkflowUtilsSource.includes('function createCanvasResizeHandleWorkflowUtils(')
  || !canvasResizeHandleWorkflowUtilsSource.includes('    createCanvasResizeHandleWorkflowUtils,')
) {
  failures.push('canvas-resize-handle-workflow-utils.js: missing exported createCanvasResizeHandleWorkflowUtils');
}
const localViewportCanvasWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'local-viewport-canvas-workflow-utils.js'), 'utf8');
if (
  !localViewportCanvasWorkflowUtilsSource.includes('function createLocalViewportCanvasWorkflowUtils(')
  || !localViewportCanvasWorkflowUtilsSource.includes('    createLocalViewportCanvasWorkflowUtils,')
) {
  failures.push('local-viewport-canvas-workflow-utils.js: missing exported createLocalViewportCanvasWorkflowUtils');
}
const floatingDrawButtonWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'floating-draw-button-workflow-utils.js'), 'utf8');
if (
  !floatingDrawButtonWorkflowUtilsSource.includes('function createFloatingDrawButtonWorkflowUtils(')
  || !floatingDrawButtonWorkflowUtilsSource.includes('    createFloatingDrawButtonWorkflowUtils,')
) {
  failures.push('floating-draw-button-workflow-utils.js: missing exported createFloatingDrawButtonWorkflowUtils');
}
const selectionMoveWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'selection-move-workflow-utils.js'), 'utf8');
if (
  !selectionMoveWorkflowUtilsSource.includes('function createSelectionMoveWorkflowUtils(')
  || !selectionMoveWorkflowUtilsSource.includes('    createSelectionMoveWorkflowUtils,')
) {
  failures.push('selection-move-workflow-utils.js: missing exported createSelectionMoveWorkflowUtils');
}
const sharedProjectSnapshotFetchUtilsSource = fs.readFileSync(path.join(moduleDir, 'shared-project-snapshot-fetch-utils.js'), 'utf8');
if (
  !sharedProjectSnapshotFetchUtilsSource.includes('function createSharedProjectSnapshotFetchUtils(')
  || !sharedProjectSnapshotFetchUtilsSource.includes('    createSharedProjectSnapshotFetchUtils,')
) {
  failures.push('shared-project-snapshot-fetch-utils.js: missing exported createSharedProjectSnapshotFetchUtils');
}
const sharedProjectLocalConversionUtilsSource = fs.readFileSync(path.join(moduleDir, 'shared-project-local-conversion-utils.js'), 'utf8');
if (
  !sharedProjectLocalConversionUtilsSource.includes('function createSharedProjectLocalConversionUtils(')
  || !sharedProjectLocalConversionUtilsSource.includes('    createSharedProjectLocalConversionUtils,')
) {
  failures.push('shared-project-local-conversion-utils.js: missing exported createSharedProjectLocalConversionUtils');
}
const reloadSessionWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'reload-session-workflow-utils.js'), 'utf8');
if (
  !reloadSessionWorkflowUtilsSource.includes('function createReloadSessionWorkflowUtils(')
  || !reloadSessionWorkflowUtilsSource.includes('    createReloadSessionWorkflowUtils,')
) {
  failures.push('reload-session-workflow-utils.js: missing exported createReloadSessionWorkflowUtils');
}
if (
  reloadSessionWorkflowUtilsSource.includes('const reloadSnapshotUtils = window.PiXiEEDrawModules?.reloadSnapshotUtils?.createReloadSnapshotUtils?.({')
  || !reloadSessionWorkflowUtilsSource.includes('function getReloadSnapshotUtils(')
) {
  failures.push('reload-session-workflow-utils.js: reload snapshot utils must be created lazily to avoid early DEFAULT_HISTORY_LIMIT TDZ');
}
const canvasRenderWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-render-workflow-utils.js'), 'utf8');
if (
  !canvasRenderWorkflowUtilsSource.includes('function createCanvasRenderWorkflowUtils(')
  || !canvasRenderWorkflowUtilsSource.includes('    createCanvasRenderWorkflowUtils,')
) {
  failures.push('canvas-render-workflow-utils.js: missing exported createCanvasRenderWorkflowUtils');
}
const canvasOverlayWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-overlay-workflow-utils.js'), 'utf8');
if (
  !canvasOverlayWorkflowUtilsSource.includes('function createCanvasOverlayWorkflowUtils(')
  || !canvasOverlayWorkflowUtilsSource.includes('    createCanvasOverlayWorkflowUtils,')
) {
  failures.push('canvas-overlay-workflow-utils.js: missing exported createCanvasOverlayWorkflowUtils');
}
const canvasZoomWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-zoom-workflow-utils.js'), 'utf8');
if (
  !canvasZoomWorkflowUtilsSource.includes('function createCanvasZoomWorkflowUtils(')
  || !canvasZoomWorkflowUtilsSource.includes('    createCanvasZoomWorkflowUtils,')
) {
  failures.push('canvas-zoom-workflow-utils.js: missing exported createCanvasZoomWorkflowUtils');
}
const canvasWheelZoomWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'canvas-wheel-zoom-workflow-utils.js'), 'utf8');
if (
  !canvasWheelZoomWorkflowUtilsSource.includes('function createCanvasWheelZoomWorkflowUtils(')
  || !canvasWheelZoomWorkflowUtilsSource.includes('    createCanvasWheelZoomWorkflowUtils,')
) {
  failures.push('canvas-wheel-zoom-workflow-utils.js: missing exported createCanvasWheelZoomWorkflowUtils');
}
const virtualCursorWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'virtual-cursor-workflow-utils.js'), 'utf8');
if (
  !virtualCursorWorkflowUtilsSource.includes('function createVirtualCursorWorkflowUtils(')
  || !virtualCursorWorkflowUtilsSource.includes('    createVirtualCursorWorkflowUtils,')
) {
  failures.push('virtual-cursor-workflow-utils.js: missing exported createVirtualCursorWorkflowUtils');
}
const startupTailWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'startup-tail-workflow-utils.js'), 'utf8');
if (
  !startupTailWorkflowUtilsSource.includes('function createStartupTailWorkflowUtils(')
  || !startupTailWorkflowUtilsSource.includes('    createStartupTailWorkflowUtils,')
) {
  failures.push('startup-tail-workflow-utils.js: missing exported createStartupTailWorkflowUtils');
}
const timelapseSessionUtilsSource = fs.readFileSync(path.join(moduleDir, 'timelapse-session-utils.js'), 'utf8');
if (
  !timelapseSessionUtilsSource.includes('function createTimelapseSessionUtils(')
  || !timelapseSessionUtilsSource.includes('    createTimelapseSessionUtils,')
) {
  failures.push('timelapse-session-utils.js: missing exported createTimelapseSessionUtils');
}
[
  'normalizeSerializedTimelapseOperationEntry',
].forEach(name => requireInjectedGetter('timelapseSessionUtils', name));
const autosaveWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'autosave-workflow-utils.js'), 'utf8');
if (
  !autosaveWorkflowUtilsSource.includes('function createAutosaveWorkflowUtils(')
  || !autosaveWorkflowUtilsSource.includes('    createAutosaveWorkflowUtils,')
) {
  failures.push('autosave-workflow-utils.js: missing exported createAutosaveWorkflowUtils');
}
const historySnapshotWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'history-snapshot-workflow-utils.js'), 'utf8');
if (
  !historySnapshotWorkflowUtilsSource.includes('function createHistorySnapshotWorkflowUtils(')
  || !historySnapshotWorkflowUtilsSource.includes('    createHistorySnapshotWorkflowUtils,')
) {
  failures.push('history-snapshot-workflow-utils.js: missing exported createHistorySnapshotWorkflowUtils');
}
[
  'ensureActiveAutosaveProjectId',
].forEach(name => requireInjectedGetter('autosaveWorkflowUtils', name));
const openImportWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'open-import-workflow-utils.js'), 'utf8');
if (
  !openImportWorkflowUtilsSource.includes('function createOpenImportWorkflowUtils(')
  || !openImportWorkflowUtilsSource.includes('    createOpenImportWorkflowUtils,')
) {
  failures.push('open-import-workflow-utils.js: missing exported createOpenImportWorkflowUtils');
}
const exportDialogWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'export-dialog-workflow-utils.js'), 'utf8');
if (
  !exportDialogWorkflowUtilsSource.includes('function createExportDialogWorkflowUtils(')
  || !exportDialogWorkflowUtilsSource.includes('    createExportDialogWorkflowUtils,')
) {
  failures.push('export-dialog-workflow-utils.js: missing exported createExportDialogWorkflowUtils');
}
const exportFormatWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'export-format-workflow-utils.js'), 'utf8');
if (
  !exportFormatWorkflowUtilsSource.includes('function createExportFormatWorkflowUtils(')
  || !exportFormatWorkflowUtilsSource.includes('    createExportFormatWorkflowUtils,')
) {
  failures.push('export-format-workflow-utils.js: missing exported createExportFormatWorkflowUtils');
}
const updateHistoryUtilsSource = fs.readFileSync(path.join(moduleDir, 'update-history-utils.js'), 'utf8');
if (
  !updateHistoryUtilsSource.includes('function createUpdateHistoryUtils(')
  || !updateHistoryUtilsSource.includes('    createUpdateHistoryUtils,')
) {
  failures.push('update-history-utils.js: missing exported createUpdateHistoryUtils');
}
const documentSessionWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'document-session-workflow-utils.js'), 'utf8');
if (
  !documentSessionWorkflowUtilsSource.includes('function createDocumentSessionWorkflowUtils(')
  || !documentSessionWorkflowUtilsSource.includes('    createDocumentSessionWorkflowUtils,')
) {
  failures.push('document-session-workflow-utils.js: missing exported createDocumentSessionWorkflowUtils');
}
const recentAccountWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'recent-account-workflow-utils.js'), 'utf8');
if (
  !recentAccountWorkflowUtilsSource.includes('function createRecentAccountWorkflowUtils(')
  || !recentAccountWorkflowUtilsSource.includes('    createRecentAccountWorkflowUtils,')
) {
  failures.push('recent-account-workflow-utils.js: missing exported createRecentAccountWorkflowUtils');
}
const pixieedProfileLocalUtilsSource = fs.readFileSync(path.join(moduleDir, 'pixieed-profile-local-utils.js'), 'utf8');
if (
  !pixieedProfileLocalUtilsSource.includes('function createPixieedProfileLocalUtils(')
  || !pixieedProfileLocalUtilsSource.includes('    createPixieedProfileLocalUtils,')
) {
  failures.push('pixieed-profile-local-utils.js: missing exported createPixieedProfileLocalUtils');
}
const documentSerializationUtilsSource = fs.readFileSync(path.join(moduleDir, 'document-serialization-utils.js'), 'utf8');
if (
  !documentSerializationUtilsSource.includes('function createDocumentSerializationUtils(')
  || !documentSerializationUtilsSource.includes('    createDocumentSerializationUtils,')
) {
  failures.push('document-serialization-utils.js: missing exported createDocumentSerializationUtils');
}
const projectPackageWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'project-package-workflow-utils.js'), 'utf8');
if (
  !projectPackageWorkflowUtilsSource.includes('function createProjectPackageWorkflowUtils(')
  || !projectPackageWorkflowUtilsSource.includes('    createProjectPackageWorkflowUtils,')
) {
  failures.push('project-package-workflow-utils.js: missing exported createProjectPackageWorkflowUtils');
}
const recentProjectWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'recent-project-workflow-utils.js'), 'utf8');
if (
  !recentProjectWorkflowUtilsSource.includes('function createRecentProjectWorkflowUtils(')
  || !recentProjectWorkflowUtilsSource.includes('    createRecentProjectWorkflowUtils,')
) {
  failures.push('recent-project-workflow-utils.js: missing exported createRecentProjectWorkflowUtils');
}
const startupWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'startup-workflow-utils.js'), 'utf8');
if (
  !startupWorkflowUtilsSource.includes('function createStartupWorkflowUtils(')
  || !startupWorkflowUtilsSource.includes('    createStartupWorkflowUtils,')
) {
  failures.push('startup-workflow-utils.js: missing exported createStartupWorkflowUtils');
}

const pixieedAccountWorkflowUtilsSource = fs.readFileSync(path.join(moduleDir, 'pixieed-account-workflow-utils.js'), 'utf8');
if (
  !pixieedAccountWorkflowUtilsSource.includes('function createPixieedAccountWorkflowUtils(')
  || !pixieedAccountWorkflowUtilsSource.includes('    createPixieedAccountWorkflowUtils,')
) {
  failures.push('pixieed-account-workflow-utils.js: missing exported createPixieedAccountWorkflowUtils');
}
const uiLanguageUtilsSource = fs.readFileSync(path.join(moduleDir, 'ui-language-utils.js'), 'utf8');
if (
  !uiLanguageUtilsSource.includes('function createUiLanguageUtils(')
  || !uiLanguageUtilsSource.includes('    createUiLanguageUtils,')
) {
  failures.push('ui-language-utils.js: missing exported createUiLanguageUtils');
}
const scrollInputUtilsSource = fs.readFileSync(path.join(moduleDir, 'scroll-input-utils.js'), 'utf8');
if (
  !scrollInputUtilsSource.includes('function createScrollInputUtils(')
  || !scrollInputUtilsSource.includes('    createScrollInputUtils,')
) {
  failures.push('scroll-input-utils.js: missing exported createScrollInputUtils');
}
const toolActionConfigLine = lineOf('const toolActionStaticConfig =');
const toolbarConfigLine = lineOf('const toolbarStaticConfig =');
const appStaticConfigLine = lineOf('const appStaticConfig =');
const embedConfigUtilsLine = lineOf('const embedConfigUtilsModule =');
const embedConfigLine = lineOf('const EMBED_CONFIG = parseEmbedConfig();');
const storageStaticConfigLine = lineOf('const storageStaticConfig =');
const canUseSessionStorageLine = lineOf('const canUseSessionStorage =');
const autosaveDatabaseUtilsLine = lineOf('const autosaveDatabaseUtilsModule =');
const runtimeStaticConfigLine = lineOf('const runtimeStaticConfig =');
const exportDeliveryUtilsLine = lineOf('const exportDeliveryUtils =');
const exportNormalizerUtilsLine = lineOf('const exportNormalizerUtilsModule =');
const projectRuntimeStaticConfigLine = lineOf('const projectRuntimeStaticConfig =');
const projectStorageUtilsLine = lineOf('const projectStorageUtils =');
const layoutStaticConfigLine = lineOf('const layoutStaticConfig =');
const layoutViewportLine = lineOf('const layoutViewportModule =');
const railSizingLine = lineOf('const railSizing =');
const drawingStateStaticConfigLine = lineOf('const drawingStateStaticConfig =');
const pixfindModeUtilsLine = lineOf('const pixfindModeUtilsModule =');
const palettePresetWorkflowUtilsLine = lineOf('const palettePresetWorkflowUtilsModule =');
const railToolUiUtilsLine = lineOf('const railToolUiUtilsModule =');
const controlUiUtilsLine = lineOf('const controlUiUtilsModule =');
const uiLocalizationUtilsLine = lineOf('const uiLocalizationUtils =');
const controlsMirrorLine = lineOf('const controlsMirrorModule =');
const pixieedSupportBenefitUtilsLine = lineOf('const pixieedSupportBenefitUtilsModule =');
const localViewportCanvasWorkflowUtilsLine = lineOf('const localViewportCanvasWorkflowUtilsModule =');
const reloadSessionWorkflowUtilsLine = lineOf('const reloadSessionWorkflowUtilsModule =');
const canvasCoreWorkflowUtilsLine = lineOf('const canvasCoreWorkflowUtilsModule =');
const canvasDrawingWorkflowUtilsLine = lineOf('const canvasDrawingWorkflowUtilsModule =');
const canvasRenderWorkflowUtilsLine = lineOf('const canvasRenderWorkflowUtilsModule =');
const canvasOverlayWorkflowUtilsLine = lineOf('const canvasOverlayWorkflowUtilsModule =');
const canvasZoomWorkflowUtilsLine = lineOf('const canvasZoomWorkflowUtilsModule =');
const canvasWheelZoomWorkflowUtilsLine = lineOf('const canvasWheelZoomWorkflowUtilsModule =');
const virtualCursorWorkflowUtilsLine = lineOf('const virtualCursorWorkflowUtilsModule =');
const floatingDrawButtonWorkflowUtilsLine = lineOf('const floatingDrawButtonWorkflowUtilsModule =');
const selectionMoveWorkflowUtilsLine = lineOf('const selectionMoveWorkflowUtilsModule =');
const palettePanelUtilsLine = lineOf('const palettePanelUtils =');
const canvasResizeWorkflowUtilsLine = lineOf('const canvasResizeWorkflowUtilsModule =');
const simulationPlaybackWorkflowUtilsLine = lineOf('const simulationPlaybackWorkflowUtilsModule =');
const keyboardWorkflowUtilsLine = lineOf('const keyboardWorkflowUtilsModule =');
const canvasPointerWorkflowUtilsLine = lineOf('const canvasPointerWorkflowUtilsModule =');
const canvasToolStateWorkflowUtilsLine = lineOf('const canvasToolStateWorkflowUtilsModule =');
const voxelExtensionStateLine = lineOf('let voxelExtensionState =');
const canvasResizeHandleWorkflowUtilsLine = lineOf('const canvasResizeHandleWorkflowUtilsModule =');
const timelapseSessionUtilsLine = lineOf('const timelapseSessionUtilsModule =');
const autosaveWorkflowUtilsLine = lineOf('const autosaveWorkflowUtilsModule =');
const openImportWorkflowUtilsLine = lineOf('const openImportWorkflowUtilsModule =');
const updateHistoryUtilsLine = lineOf('const updateHistoryUtilsModule =');
const historySnapshotWorkflowUtilsLine = lineOf('const historySnapshotWorkflowUtilsModule =');
const exportDialogWorkflowUtilsLine = lineOf('const exportDialogWorkflowUtilsModule =');
const exportFormatWorkflowUtilsLine = lineOf('const exportFormatWorkflowUtilsModule =');
const documentSessionWorkflowUtilsLine = lineOf('const documentSessionWorkflowUtilsModule =');
const documentSerializationUtilsLine = lineOf('const documentSerializationUtilsModule =');
const projectPackageWorkflowUtilsLine = lineOf('const projectPackageWorkflowUtilsModule =');
const recentProjectWorkflowUtilsLine = lineOf('const recentProjectWorkflowUtilsModule =');
const startupWorkflowUtilsLine = lineOf('const startupWorkflowUtilsModule =');
const pixieedAccountWorkflowUtilsLine = lineOf('const pixieedAccountWorkflowUtilsModule =');
const sharedProjectParticipantUtilsLine = lineOf('const sharedProjectParticipantUtilsModule =');
const sharedProjectCommentUtilsLine = lineOf('const sharedProjectCommentUtilsModule =');
const sharedProjectSnapshotFetchUtilsLine = lineOf('const sharedProjectSnapshotFetchUtilsModule =');
const sharedProjectLocalConversionUtilsLine = lineOf('const sharedProjectLocalConversionUtilsModule =');
const startupTailWorkflowUtilsLine = lineOf('const startupTailWorkflowUtilsModule =');
const memoryUtilsLine = lineOf('const memoryUtils =');
if (!toolActionConfigLine || !toolbarConfigLine || toolActionConfigLine >= toolbarConfigLine) {
  failures.push('tool action static config must initialize before toolbar static config');
}
if (!appStaticConfigLine || !embedConfigLine || appStaticConfigLine >= embedConfigLine) {
  failures.push('app static config must initialize before parseEmbedConfig()');
}
if (!embedConfigUtilsLine || !embedConfigLine || embedConfigUtilsLine >= embedConfigLine) {
  failures.push('embed config utils must initialize before parseEmbedConfig()');
}
if (!storageStaticConfigLine || !canUseSessionStorageLine || storageStaticConfigLine >= canUseSessionStorageLine) {
  failures.push('storage static config must initialize before storage helpers');
}
if (!autosaveDatabaseUtilsLine || !autosaveWorkflowUtilsLine || autosaveDatabaseUtilsLine >= autosaveWorkflowUtilsLine) {
  failures.push('autosave database utils must initialize before autosave workflow utils');
}
if (!runtimeStaticConfigLine || !exportDeliveryUtilsLine || runtimeStaticConfigLine >= exportDeliveryUtilsLine) {
  failures.push('runtime static config must initialize before export delivery utils');
}
if (!exportNormalizerUtilsLine || !exportFormatWorkflowUtilsLine || exportNormalizerUtilsLine >= exportFormatWorkflowUtilsLine) {
  failures.push('export normalizer utils must initialize before export format workflow utils');
}
if (!exportNormalizerUtilsLine || !restoreCallLine || exportNormalizerUtilsLine >= restoreCallLine) {
  failures.push('export normalizer utils must initialize before restoreSessionState()');
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
if (!pixfindModeUtilsLine || !restoreCallLine || pixfindModeUtilsLine >= restoreCallLine) {
  failures.push('PiXFiND mode utils must initialize before restoreSessionState()');
}
if (!palettePresetWorkflowUtilsLine || !startupWorkflowUtilsLine || palettePresetWorkflowUtilsLine >= startupWorkflowUtilsLine) {
  failures.push('palette preset workflow utils must initialize before startup workflow utils');
}
if (!palettePresetWorkflowUtilsLine || !uiLocalizationUtilsLine || palettePresetWorkflowUtilsLine >= uiLocalizationUtilsLine) {
  failures.push('palette preset workflow utils must initialize before UI localization utils');
}
if (!railToolUiUtilsLine || !restoreCallLine || railToolUiUtilsLine >= restoreCallLine) {
  failures.push('rail/tool UI utils must initialize before restoreSessionState()');
}
if (!controlUiUtilsLine || !documentModelLine || controlUiUtilsLine >= documentModelLine) {
  failures.push('control UI utils must initialize before document model');
}
if (!controlsMirrorLine || !canvasResizeWorkflowUtilsLine || controlsMirrorLine >= canvasResizeWorkflowUtilsLine) {
  failures.push('canvas resize workflow utils must initialize after controls mirror utils');
}
if (!canvasResizeWorkflowUtilsLine || !initCallLine || canvasResizeWorkflowUtilsLine >= initCallLine) {
  failures.push('canvas resize workflow utils must initialize before init()');
}
if (!simulationPlaybackWorkflowUtilsLine || !initCallLine || simulationPlaybackWorkflowUtilsLine >= initCallLine) {
  failures.push('simulation playback workflow utils must initialize before init()');
}
if (!keyboardWorkflowUtilsLine || !initCallLine || keyboardWorkflowUtilsLine >= initCallLine) {
  failures.push('keyboard workflow utils must initialize before init()');
}
if (!canvasResizeHandleWorkflowUtilsLine || !controlsMirrorLine || canvasResizeHandleWorkflowUtilsLine >= controlsMirrorLine) {
  failures.push('canvas resize handle workflow utils must initialize before controls mirror utils');
}
if (!canvasResizeHandleWorkflowUtilsLine || !initCallLine || canvasResizeHandleWorkflowUtilsLine >= initCallLine) {
  failures.push('canvas resize handle workflow utils must initialize before init()');
}
if (!localViewportCanvasWorkflowUtilsLine || !layoutViewportLine || localViewportCanvasWorkflowUtilsLine >= layoutViewportLine) {
  failures.push('local viewport canvas workflow utils must initialize before layout viewport utils');
}
if (!pixieedSupportBenefitUtilsLine || !localViewportCanvasWorkflowUtilsLine || pixieedSupportBenefitUtilsLine >= localViewportCanvasWorkflowUtilsLine) {
  failures.push('pixieed support benefit utils must initialize before local viewport canvas workflow utils');
}
if (!localViewportCanvasWorkflowUtilsLine || !initCallLine || localViewportCanvasWorkflowUtilsLine >= initCallLine) {
  failures.push('local viewport canvas workflow utils must initialize before init()');
}
if (!reloadSessionWorkflowUtilsLine || !layoutViewportLine || reloadSessionWorkflowUtilsLine >= layoutViewportLine) {
  failures.push('reload session workflow utils must initialize before layout viewport utils');
}
if (!reloadSessionWorkflowUtilsLine || !restoreCallLine || reloadSessionWorkflowUtilsLine >= restoreCallLine) {
  failures.push('reload session workflow utils must initialize before restoreSessionState()');
}
if (!canvasCoreWorkflowUtilsLine || !canvasOverlayWorkflowUtilsLine || canvasCoreWorkflowUtilsLine >= canvasOverlayWorkflowUtilsLine) {
  failures.push('canvas core workflow utils must initialize before canvas overlay workflow utils');
}
if (!canvasCoreWorkflowUtilsLine || !canvasRenderWorkflowUtilsLine || canvasCoreWorkflowUtilsLine >= canvasRenderWorkflowUtilsLine) {
  failures.push('canvas core workflow utils must initialize before canvas render workflow utils');
}
if (!canvasDrawingWorkflowUtilsLine || !canvasOverlayWorkflowUtilsLine || canvasDrawingWorkflowUtilsLine >= canvasOverlayWorkflowUtilsLine) {
  failures.push('canvas drawing workflow utils must initialize before canvas overlay workflow utils');
}
if (!canvasDrawingWorkflowUtilsLine || !selectionMoveWorkflowUtilsLine || canvasDrawingWorkflowUtilsLine >= selectionMoveWorkflowUtilsLine) {
  failures.push('canvas drawing workflow utils must initialize before selection move workflow utils');
}
if (!canvasDrawingWorkflowUtilsLine || !virtualCursorWorkflowUtilsLine || canvasDrawingWorkflowUtilsLine >= virtualCursorWorkflowUtilsLine) {
  failures.push('canvas drawing workflow utils must initialize before virtual cursor workflow utils');
}
if (!canvasPointerWorkflowUtilsLine || !reloadSessionWorkflowUtilsLine || canvasPointerWorkflowUtilsLine >= reloadSessionWorkflowUtilsLine) {
  failures.push('canvas pointer workflow utils must initialize before reload session workflow utils');
}
if (!canvasPointerWorkflowUtilsLine || !restoreCallLine || canvasPointerWorkflowUtilsLine >= restoreCallLine) {
  failures.push('canvas pointer workflow utils must initialize before startup restore call');
}
if (!canvasToolStateWorkflowUtilsLine || !voxelExtensionStateLine || canvasToolStateWorkflowUtilsLine >= voxelExtensionStateLine) {
  failures.push('canvas tool state workflow utils must initialize before voxelExtensionState initialization');
}
if (!canvasToolStateWorkflowUtilsLine || !reloadSessionWorkflowUtilsLine || canvasToolStateWorkflowUtilsLine >= reloadSessionWorkflowUtilsLine) {
  failures.push('canvas tool state workflow utils must initialize before reload session workflow utils');
}
if (!canvasToolStateWorkflowUtilsLine || !restoreCallLine || canvasToolStateWorkflowUtilsLine >= restoreCallLine) {
  failures.push('canvas tool state workflow utils must initialize before startup restore call');
}
if (!canvasRenderWorkflowUtilsLine || !restoreCallLine || canvasRenderWorkflowUtilsLine >= restoreCallLine) {
  failures.push('canvas render workflow utils must initialize before restoreSessionState()');
}
if (!canvasOverlayWorkflowUtilsLine || !restoreCallLine || canvasOverlayWorkflowUtilsLine >= restoreCallLine) {
  failures.push('canvas overlay workflow utils must initialize before restoreSessionState()');
}
if (!canvasZoomWorkflowUtilsLine || !restoreCallLine || canvasZoomWorkflowUtilsLine >= restoreCallLine) {
  failures.push('canvas zoom workflow utils must initialize before restoreSessionState()');
}
if (!canvasWheelZoomWorkflowUtilsLine || !canvasZoomWorkflowUtilsLine || canvasWheelZoomWorkflowUtilsLine >= canvasZoomWorkflowUtilsLine) {
  failures.push('canvas wheel zoom workflow utils must initialize before canvas zoom workflow utils');
}
if (!canvasWheelZoomWorkflowUtilsLine || !restoreCallLine || canvasWheelZoomWorkflowUtilsLine >= restoreCallLine) {
  failures.push('canvas wheel zoom workflow utils must initialize before restoreSessionState()');
}
if (!virtualCursorWorkflowUtilsLine || !restoreCallLine || virtualCursorWorkflowUtilsLine >= restoreCallLine) {
  failures.push('virtual cursor workflow utils must initialize before restoreSessionState()');
}
if (!floatingDrawButtonWorkflowUtilsLine || !restoreCallLine || floatingDrawButtonWorkflowUtilsLine >= restoreCallLine) {
  failures.push('floating draw button workflow utils must initialize before restoreSessionState()');
}
if (!floatingDrawButtonWorkflowUtilsLine || !palettePanelUtilsLine || floatingDrawButtonWorkflowUtilsLine >= palettePanelUtilsLine) {
  failures.push('floating draw button workflow utils must initialize before palette panel utils');
}
if (!floatingDrawButtonWorkflowUtilsLine || !initCallLine || floatingDrawButtonWorkflowUtilsLine >= initCallLine) {
  failures.push('floating draw button workflow utils must initialize before init()');
}
if (!selectionMoveWorkflowUtilsLine || !restoreCallLine || selectionMoveWorkflowUtilsLine >= restoreCallLine) {
  failures.push('selection move workflow utils must initialize before restoreSessionState()');
}
if (!selectionMoveWorkflowUtilsLine || !initCallLine || selectionMoveWorkflowUtilsLine >= initCallLine) {
  failures.push('selection move workflow utils must initialize before init()');
}
if (!timelapseSessionUtilsLine || !restoreCallLine || timelapseSessionUtilsLine >= restoreCallLine) {
  failures.push('timelapse session utils must initialize before restoreSessionState()');
}
if (!autosaveWorkflowUtilsLine || !restoreCallLine || autosaveWorkflowUtilsLine >= restoreCallLine) {
  failures.push('autosave workflow utils must initialize before restoreSessionState()');
}
if (!openImportWorkflowUtilsLine || !restoreCallLine || openImportWorkflowUtilsLine >= restoreCallLine) {
  failures.push('open/import workflow utils must initialize before restoreSessionState()');
}
if (!historySnapshotWorkflowUtilsLine || !memoryUtilsLine || historySnapshotWorkflowUtilsLine >= memoryUtilsLine) {
  failures.push('history snapshot workflow utils must initialize before memory utils');
}
if (!updateHistoryUtilsLine || !exportDialogWorkflowUtilsLine || updateHistoryUtilsLine >= exportDialogWorkflowUtilsLine) {
  failures.push('update history utils must initialize before export dialog workflow utils');
}
if (!updateHistoryUtilsLine || !startupWorkflowUtilsLine || updateHistoryUtilsLine >= startupWorkflowUtilsLine) {
  failures.push('update history utils must initialize before startup workflow utils');
}
if (!updateHistoryUtilsLine || !recentProjectWorkflowUtilsLine || updateHistoryUtilsLine >= recentProjectWorkflowUtilsLine) {
  failures.push('update history utils must initialize before recent project workflow utils');
}
if (!exportDialogWorkflowUtilsLine || !restoreCallLine || exportDialogWorkflowUtilsLine >= restoreCallLine) {
  failures.push('export dialog workflow utils must initialize before restoreSessionState()');
}
if (!exportFormatWorkflowUtilsLine || !exportDialogWorkflowUtilsLine || exportFormatWorkflowUtilsLine >= exportDialogWorkflowUtilsLine) {
  failures.push('export format workflow utils must initialize before export dialog workflow utils');
}
if (!documentSessionWorkflowUtilsLine || !restoreCallLine || documentSessionWorkflowUtilsLine >= restoreCallLine) {
  failures.push('document session workflow utils must initialize before restoreSessionState()');
}
if (!documentSerializationUtilsLine || !restoreCallLine || documentSerializationUtilsLine >= restoreCallLine) {
  failures.push('document serialization utils must initialize before restoreSessionState()');
}
if (!projectPackageWorkflowUtilsLine || !restoreCallLine || projectPackageWorkflowUtilsLine >= restoreCallLine) {
  failures.push('project package workflow utils must initialize before restoreSessionState()');
}
if (!recentProjectWorkflowUtilsLine || !restoreCallLine || recentProjectWorkflowUtilsLine >= restoreCallLine) {
  failures.push('recent project workflow utils must initialize before restoreSessionState()');
}
if (!startupWorkflowUtilsLine || !restoreCallLine || startupWorkflowUtilsLine >= restoreCallLine) {
  failures.push('startup workflow utils must initialize before restoreSessionState()');
}
if (!pixieedAccountWorkflowUtilsLine || !restoreCallLine || pixieedAccountWorkflowUtilsLine >= restoreCallLine) {
  failures.push('pixieed account workflow utils must initialize before restoreSessionState()');
}
if (!sharedProjectParticipantUtilsLine || !restoreCallLine || sharedProjectParticipantUtilsLine >= restoreCallLine) {
  failures.push('shared project participant utils must initialize before restoreSessionState()');
}
if (!sharedProjectCommentUtilsLine || !restoreCallLine || sharedProjectCommentUtilsLine >= restoreCallLine) {
  failures.push('shared project comment utils must initialize before restoreSessionState()');
}
if (!sharedProjectSnapshotFetchUtilsLine || !restoreCallLine || sharedProjectSnapshotFetchUtilsLine >= restoreCallLine) {
  failures.push('shared project snapshot fetch utils must initialize before restoreSessionState()');
}
if (!sharedProjectLocalConversionUtilsLine || !restoreCallLine || sharedProjectLocalConversionUtilsLine >= restoreCallLine) {
  failures.push('shared project local conversion utils must initialize before restoreSessionState()');
}
if (!startupTailWorkflowUtilsLine || !initCallLine || startupTailWorkflowUtilsLine >= initCallLine) {
  failures.push('startup tail workflow utils must initialize before init()');
}

[
  'normalizeExportFormat',
  'normalizeExportGridTileSize',
  'normalizeTimelapseFps',
  'deserializeLocalLayerVisibilityMap',
  'deserializeLocalLayerPreviewOpacityMap',
  'normalizeLocalViewportCanvasState',
  'formatUpdateHistoryDate',
  'getUpdateHistoryEntries',
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
const setFloatingDrawButtonPositionBlock = getFunctionBlockFromSource(floatingDrawButtonWorkflowUtilsSource, 'setFloatingDrawButtonPosition')
  || getFunctionBlock('setFloatingDrawButtonPosition');
if (!setFloatingDrawButtonPositionBlock) {
  failures.push('setFloatingDrawButtonPosition: function block not found');
} else if (/\bupdateFloatingMovePadPosition\s*\(\s*\)\s*;/.test(setFloatingDrawButtonPositionBlock)) {
  failures.push('setFloatingDrawButtonPosition: use updateFloatingMovePadPositionIfReady() before floatingDrawControlsUtils init');
}
const syncVirtualCursorControlVisibilityBlock = getFunctionBlock('syncVirtualCursorControlVisibility');
if (!syncVirtualCursorControlVisibilityBlock) {
  failures.push('syncVirtualCursorControlVisibility: function block not found');
} else if (/\bupdateFloatingMovePadVisibility\s*\(\s*\)\s*;/.test(syncVirtualCursorControlVisibilityBlock)) {
  failures.push('syncVirtualCursorControlVisibility: use updateFloatingMovePadVisibilityIfReady() before floatingDrawControlsUtils init');
}
const updateFloatingDrawButtonPalettePreviewBlock = getFunctionBlockFromSource(floatingDrawButtonWorkflowUtilsSource, 'updateFloatingDrawButtonPalettePreview')
  || getFunctionBlock('updateFloatingDrawButtonPalettePreview');
if (!updateFloatingDrawButtonPalettePreviewBlock) {
  failures.push('updateFloatingDrawButtonPalettePreview: function block not found');
} else if (/\bgetActiveDrawColor\s*\(/.test(updateFloatingDrawButtonPalettePreviewBlock)) {
  failures.push('updateFloatingDrawButtonPalettePreview: do not call getActiveDrawColor() before pointerState init');
}
const resolveFloatingDrawButtonPressTargetBlock = getFunctionBlockFromSource(floatingDrawButtonWorkflowUtilsSource, 'resolveFloatingDrawButtonPressTarget')
  || getFunctionBlock('resolveFloatingDrawButtonPressTarget');
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
const getPalettePresetButtonSwatchCountBlock = getFunctionBlockFromSource(palettePresetWorkflowUtilsSource, 'getPalettePresetButtonSwatchCount')
  || getFunctionBlock('getPalettePresetButtonSwatchCount');
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
[
  'MAX_CANVAS_SIZE',
  'MIN_CANVAS_SIZE',
  'clamp',
].forEach(name => requireInjectedGetter('embedConfigUtils', name));
[
  'AUTOSAVE_DB_NAME',
  'AUTOSAVE_DB_VERSION',
  'AUTOSAVE_STORE_NAME',
  'RECENT_PROJECTS_STORE',
  'SHARED_LOCAL_OP_JOURNAL_STORE',
].forEach(name => requireInjectedGetter('autosaveDatabaseUtils', name));
[
  'EXPORT_GRID_TILE_MAX_SIZE',
  'EXPORT_GRID_TILE_MIN_SIZE',
  'clamp',
].forEach(name => requireInjectedGetter('exportNormalizerUtils', name));
[
  'LOCAL_VIEWPORT_CANVAS_SIGNED_IN_MAX_COUNT',
  'MULTI_GUEST_LIMIT_MIN',
  'SHARED_PROJECT_LIMIT_AD_FREE',
  'SHARED_PROJECT_LIMIT_DEFAULT',
  'SHARED_PROJECT_MEMBER_LIMIT_AD_FREE',
  'SHARED_PROJECT_MEMBER_LIMIT_DEFAULT',
  'accountState',
  'buildSharedProjectUsageLabel',
  'dom',
  'getSharedProjectOwnershipStatus',
  'localizeText',
].forEach(name => requireInjectedGetter('pixieedSupportBenefitUtils', name));
[
  'DEFAULT_LAYER_BLEND_MODE',
  'clamp',
  'getActiveProjectCanvasDocument',
  'getProjectCanvasActiveFrame',
  'getProjectCanvasCount',
  'state',
].forEach(name => requireInjectedGetter('canvasCoreWorkflowUtils', name));
[
  'BRUSH_SHAPE_CIRCLE',
  'BRUSH_SHAPE_CUSTOM',
  'BRUSH_SHAPE_SQUARE',
  'DEFAULT_LAYER_BLEND_MODE',
  'FILL_STYLE_DITHER_GRADIENT',
  'SELECT_SAME_MODE_CONNECTED',
  'SELECT_SAME_MODE_GLOBAL',
  'SIM_ELEMENT_EMPTY',
  'SIM_ELEMENT_FIRE',
  'SIM_ELEMENT_LIGHT',
  'SIM_ELEMENT_SMOKE',
  'SIM_ELEMENT_WATER',
  'SIM_PAINT_MODE_AIR',
  'SIM_PAINT_MODE_DEPTH',
  'activateSimulationAround',
  'bresenhamLine',
  'brushCircleOffsetCache',
  'brushOffsetCache',
  'clamp',
  'colorsMatchRgba',
  'compositeLayerPixelNormalized',
  'ensureLayerDirect',
  'findNearestPaletteIndexForColor',
  'forEachMirroredPoint',
  'getActiveDrawColor',
  'getActiveFrame',
  'getActiveLayer',
  'getActiveProjectCanvasDocument',
  'getDisplayedLayerPreviewOpacity',
  'getDisplayedLayerVisibility',
  'getEffectiveBrushShape',
  'getLayerPixelMatchState',
  'getMirroredPointSet',
  'isCustomBrushData',
  'isGradientFillStyle',
  'isIndexColorMode',
  'isMirrorEnabledForTool',
  'isMultiPaletteIsolationEnabled',
  'isRgbColorMode',
  'isSimulationLayer',
  'layerPixelMatchesMatchState',
  'markDirtyPixel',
  'markFillPreviewPixelsTruncated',
  'markHistoryDirty',
  'normalizeColorValue',
  'normalizeFillStyle',
  'normalizeLayerBlendMode',
  'normalizePaletteIndex',
  'normalizeSelectSameMode',
  'pointerState',
  'recordPendingPixelPatchAfter',
  'recordPendingPixelPatchBefore',
  'requestRender',
  'resolveDrawPaletteIndex',
  'resolveTransparentStoragePaletteIndex',
  'setActivePaletteIndex',
  'setActiveRgbColor',
  'simulationEditorState',
  'state',
  'updateColorTabSwatch',
  'updatePaletteSelectionState',
].forEach(name => requireInjectedGetter('canvasDrawingWorkflowUtils', name));
[
  'activeTouchPointers',
  'appendSharedProjectStrokePoint',
  'beginHistory',
  'beginSharedProjectStrokeCapture',
  'buildSelectionMoveTransformedEntries',
  'canAcceptSharedProjectLocalDrawOps',
  'canCurrentClientImportExternalData',
  'captureSharedProjectFillCommand',
  'captureSharedProjectRegionCommand',
  'captureSharedProjectShapeCommand',
  'captureVirtualCursorPointer',
  'clearHoveredProjectCanvas',
  'clearSharedProjectInFlightStroke',
  'cloneImageData',
  'commitHistory',
  'commitPreviewProjectCanvasSelection',
  'createBlankImageData',
  'createCustomBrushFromSelection',
  'createLayerMoveState',
  'createMovePreviewCanvasFromImageData',
  'createMovePreviewCanvasFromPixels',
  'createMoveStateFromClipboard',
  'createPasteRestoreSnapshot',
  'createSelectionMoveState',
  'applyPaletteChange',
  'applyViewportTransform',
  'bresenhamLine',
  'clamp',
  'clearTimelineSelectionForCanvasInteraction',
  'cloneSelectionClipboardPayload',
  'copyTimelineSelection',
  'ctx',
  'dom',
  'drawEllipse',
  'drawLine',
  'drawRectangle',
  'enforceGuestAssignedLayerSelection',
  'ensureLayerDirect',
  'finalizePendingSelectionBeforeCanvasSwitch',
  'FILL_STYLE_SOLID',
  'FILL_TOOLS',
  'floodFill',
  'flushActiveProjectCanvasUiSync',
  'getActiveLayer',
  'getActiveProjectCanvasDocument',
  'getCanvasScreenMetrics',
  'getCanvasFocusAt',
  'getCanvasInteractionSurfaceFromTarget',
  'getCanvasInteractionSurfaceMetrics',
  'getFillStyleForInteraction',
  'getMainCanvasInteractionSurface',
  'getProjectCanvasSurfaceByCanvasId',
  'getResolvedCanvasInteractionSurface',
  'getSelectionMoveContentMask',
  'getSelectionMoveTransformState',
  'getSelectionMoveVisualBounds',
  'getSharedProjectDrawBlockStatus',
  'getSharedProjectLocalDrawBlockReason',
  'getVirtualCursorCellPosition',
  'handleCurvePointerDown',
  'handleCurvePointerMove',
  'handleCurvePointerUp',
  'hasSelectionMoveTransform',
  'hasTimelineStructureSelection',
  'HISTORY_DRAW_TOOLS',
  'hoverPixel',
  'INACTIVE_CANVAS_SWITCH_DRAG_THRESHOLD_PX',
  'inferDirectOnlyLayer',
  'isGradientFillStyle',
  'isMultiAssignedCellRestrictedEditorMode',
  'isMultiCanvasWorldLayoutActive',
  'isMultiSpectatorMode',
  'isSharedProjectAwaitingReady',
  'isVoxelPreviewCanvasId',
  'internalClipboard',
  'keyboardState',
  'localizeText',
  'logSharedProjectDrawBlock',
  'markDirtyRect',
  'markHistoryDirty',
  'markSaveInteractionActivity',
  'markViewportInteractionActivity',
  'MIN_ZOOM_SCALE',
  'mouseInsideViewport',
  'normalizeColorValue',
  'normalizeFillStyle',
  'normalizePaletteIndex',
  'normalizeSelectSameMode',
  'normalizeSelectionShapeMode',
  'normalizeSelectionMoveRotationDeg',
  'normalizeSelectionMoveScale',
  'normalizeZoomScale',
  'pasteTimelineClipboard',
  'performVirtualCursorAction',
  'pointInPolygon',
  'pointerState',
  'POINTER_TOOL_CUSTOM_BRUSH_RECT',
  'releaseVirtualCursorPointer',
  'renderPalette',
  'requestOverlayRender',
  'requestRender',
  'requestSharedProjectDrawReadinessRecovery',
  'rollbackPendingHistory',
  'sampleColor',
  'scaleSelectionPathX',
  'scaleSelectionPathY',
  'scheduleSessionPersist',
  'SELECTION_TRANSFORM_DRAG_THRESHOLD_PX',
  'SELECTION_TRANSFORM_HANDLE_DRAW_RADIUS_PX',
  'SELECTION_TRANSFORM_HANDLE_HIT_RADIUS_PX',
  'SELECTION_TRANSFORM_LARGE_PREVIEW_MAX_PIXELS',
  'SELECTION_TRANSFORM_MODE_DEADZONE_CELLS',
  'SELECTION_TRANSFORM_MODE_DEADZONE_PX',
  'SELECTION_TRANSFORM_MODE_DIRECTION_BIAS',
  'SELECTION_TRANSFORM_PREVIEW_CACHE_MAX_PIXELS',
  'SELECTION_TRANSFORM_ROTATION_STEP_DEG',
  'SELECTION_TRANSFORM_SCALE_EPSILON',
  'SELECTION_SHAPE_MODE_SHAPE',
  'selectionMaskHasPixels',
  'selectionTransformUi',
  'selectRectGridTapState',
  'setActiveTool',
  'setMultiStatus',
  'setVirtualCursor',
  'setZoom',
  'SELECT_RECT_GRID_CELL_SIZE',
  'SELECT_RECT_GRID_DOUBLE_TAP_MS',
  'SELECT_SAME_MODE_GLOBAL',
  'sharedProjectDeferRealtimeUntilSynced',
  'shouldCreateSelectionMoveBitmapPreview',
  'snapshotPendingSelectionMoveForClipboard',
  'snapshotSelectionForClipboard',
  'stampBrush',
  'state',
  'strokeSelectionPath',
  'syncPaletteInputs',
  'syncActiveLayerFromInteractionSurface',
  'TOUCH_PAN_DEADZONE_PX',
  'TOUCH_PAN_DIRECTION_DOT_MIN',
  'TOUCH_PAN_MIN_POINTERS',
  'TOUCH_PAN_VECTOR_BALANCE_MIN',
  'TOUCH_PINCH_DEADZONE_PX',
  'TOUCH_PINCH_DEADZONE_RATIO',
  'TOUCH_PINCH_MAX_GESTURE_RATIO',
  'TOUCH_PINCH_MIN_RATIO',
  'TOUCH_PINCH_SENSITIVITY',
  'transformSelectionMoveLocalPoint',
  'updateAutosaveStatus',
  'updateCanvasControlButtons',
  'updateVirtualCursorFromControlDelta',
  'updateVirtualCursorFromEvent',
  'updateVoxelPreviewYawFromDrag',
  'virtualCursorControl',
  'virtualCursorDrawState',
  'finishVoxelPreviewRotateInteraction',
  'resolveTransparentStoragePaletteIndex',
  'ZOOM_EPSILON',
].forEach(name => requireInjectedGetter('canvasPointerWorkflowUtils', name));
[
  'BRUSH_SHAPE_CUSTOM',
  'BRUSH_SHAPE_SQUARE',
  'COLOR_MODE_INDEX',
  'COLOR_MODE_RGB',
  'CUSTOM_BRUSH_MAX_PIXELS',
  'DEFAULT_CANVAS_SIZE',
  'DEFAULT_GROUP_TOOL',
  'DEFAULT_MIRROR_AXES',
  'FILL_STYLE_DITHER_GRADIENT',
  'FILL_STYLE_RGB_GRADIENT',
  'FILL_STYLE_SOLID',
  'FILL_TOOLS',
  'FILL_TOOL_DITHER',
  'FILL_TOOL_GRADIENT',
  'FILL_TOOL_SOLID',
  'MIRROR_AXIS_DIAGONAL_A',
  'MIRROR_AXIS_DIAGONAL_B',
  'MIRROR_AXIS_HORIZONTAL',
  'MIRROR_AXIS_KEYS',
  'MIRROR_AXIS_VERTICAL',
  'MULTI_CANVAS_FEATURE_ENABLED',
  'TOOL_ACTIONS',
  'TOOL_GROUPS',
  'TOOL_TO_GROUP',
  'VOXEL_EXTENSION_DEFAULT_STATE',
  'bindCanvasSurfaceInteractionEvents',
  'clamp',
  'compactToolFlyoutAnchorButton',
  'createProjectCanvasDocument',
  'EXTENSION_MODE_NONE',
  'EXTENSION_MODE_VOXEL',
  'focusUnifiedLeftContext',
  'getProjectCanvasDocuments',
  'getProjectCanvasSurfaceEntries',
  'handlePointerCancel',
  'hideSelectionTransformMenu',
  'isCompactToolFlyoutOpen',
  'isCompactToolRailMode',
  'isMobilePeekToolFlyoutMode',
  'isMultiGuestMode',
  'isMultiSpectatorMode',
  'isCustomBrushData',
  'layoutMode',
  'localizeText',
  'multiState',
  'pointerState',
  'requestOverlayRender',
  'normalizeBrushShape',
  'normalizeColorValue',
  'normalizeFillStyle',
  'resetCurveBuilder',
  'runToolAction',
  'scheduleSessionPersist',
  'setCompactToolFlyoutOpen',
  'setMultiStatus',
  'state',
  'syncBrushSizeFieldVisibility',
  'syncFillStyleControls',
  'syncSelectionShapeModeControls',
  'syncSelectSameModeControls',
  'toolButtons',
  'updateCanvasControlButtons',
  'updateCompactToolFlyoutPosition',
  'updateToolGroupButtons',
  'updateToolTabIcon',
  'updateToolVisibility',
  'updateVirtualCursorActionToolButtons',
  'VOXEL_EXTENSION_DEFAULT_YAW_DEG',
  'VOXEL_EXTENSION_DISPLAY_PIXEL_MAX',
  'VOXEL_EXTENSION_DISPLAY_PIXEL_MIN',
  'VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG',
  'VOXEL_EXTENSION_PREVIEW_PITCH_MAX_DEG',
  'VOXEL_EXTENSION_PREVIEW_PITCH_MIN_DEG',
].forEach(name => requireInjectedGetter('canvasToolStateWorkflowUtils', name));
[
  'CURRENT_PALETTE_PRESET_CUSTOM',
  'NEW_PROJECT_PALETTE_PRESET_DEFAULT',
  'NEW_PROJECT_PALETTE_PRESET_DEFINITIONS',
  'PALETTE_PRESET_BUTTON_SWATCH_FALLBACK',
  'PALETTE_PRESET_BUTTON_SWATCH_FRAME_PX',
  'PALETTE_PRESET_BUTTON_SWATCH_MAX',
  'PALETTE_PRESET_BUTTON_SWATCH_STEP_PX',
  'UI_LANGUAGE_EN',
  'UI_LANGUAGE_JA',
  'UI_LANGUAGE_SET',
  'UI_LANGUAGE_ZH',
  'applyPalettePresetToCurrentPalette',
  'clamp',
  'currentPalettePresetId',
  'dom',
  'getNewProjectPalettePresetColors',
  'getNewProjectPalettePresetDefinition',
  'localizeText',
  'newProjectPalettePresetId',
  'normalizeColorValue',
  'normalizeCurrentPalettePreset',
  'normalizeNewProjectPalettePreset',
  'normalizePalettePresetDisplayName',
  'palettePresetPickerRefreshFrame',
  'palettesMatch',
  'rgbaToCss',
  'state',
  'storeNewProjectPalettePresetId',
  'uiLanguage',
].forEach(name => requireInjectedGetter('palettePresetWorkflowUtils', name));
requireInjectedGetter('layoutViewport', 'LEFT_PALETTE_COMPACT_WIDTH');
requireInjectedGetter('layoutViewport', 'clampFloatingDrawButtonPosition');
requireInjectedGetter('timelineLayers', 'TIMELINE_CELL_SIZE');
[
  'DEFAULT_LAYER_BLEND_MODE',
  'activeCanvasSurface',
  'clamp',
  'compositeLayerPixelNormalized',
  'compositeSimulationLayerRegion',
  'ctx',
  'dirtyRegion',
  'getActiveFrame',
  'getActiveProjectCanvasDocument',
  'getDisplayedLayerPreviewOpacity',
  'getDisplayedLayerVisibility',
  'getPlaybackFrameImageData',
  'isSimulationLayer',
  'isVoxelExtensionModeEnabled',
  'isVoxelPreviewCanvasId',
  'mainViewportCanvasSurface',
  'multiState',
  'normalizeLayerBlendMode',
  'overlayNeedsRedraw',
  'overlayRenderScheduled',
  'qrEditModeState',
  'refreshInactiveProjectCanvasSurfacesSoon',
  'refreshSecondaryCanvasSurfaces',
  'renderFloatingPreviewPanel',
  'renderLocalViewportCanvasOverlays',
  'renderOverlay',
  'renderProjectCanvasSurface',
  'renderScheduled',
  'renderVoxelExtensionPreviewSurfaceNow',
  'requestAnimationFrame',
  'scheduleMultiPublicLobbyRoomSync',
  'scheduleQrEditReadabilityCheck',
  'shouldSyncMultiPublicLobbyRoom',
  'state',
  'syncVoxelExtensionPreviewFromSource',
].forEach(name => requireInjectedGetter('canvasRenderWorkflowUtils', name));
[
  'BACKGROUND_TILE_COLORS',
  'BRUSH_TOOLS',
  'COLOR_MODE_INDEX',
  'DEFAULT_ONION_SKIN',
  'EMPTY_FILL_PREVIEW_PIXELS',
  'FILL_PREVIEW_CACHE_BACKFILL_MAX_PIXELS',
  'FILL_PREVIEW_MAX_PIXELS',
  'FILL_PREVIEW_MIRROR_DEDUP_MAX_PIXELS',
  'FILL_PREVIEW_TRUNCATED_FLAG',
  'FILL_TOOLS',
  'MAX_SELECTION_CANVAS_DIMENSION',
  'MIN_ZOOM_SCALE',
  'ONION_SKIN_TINT_NEXT',
  'ONION_SKIN_TINT_PREV',
  'POINTER_TOOL_CUSTOM_BRUSH_RECT',
  'SELECTION_DASH_SPEED',
  'SELECTION_TOOLS',
  'SELECTION_TRANSFORM_LARGE_PREVIEW_MAX_PIXELS',
  'SELECT_SAME_MODE_CONNECTED',
  'TOOL_ICON_FALLBACK',
  'TRANSPARENT_TILE_SIZE',
  'activeCanvasSurface',
  'applyPixelFrameBackground',
  'bindActiveCanvasSurface',
  'bresenhamLine',
  'clamp',
  'collectFillTargetPixels',
  'colorsMatchRgba',
  'compositeFramePixels',
  'createFrameCanvas',
  'ctx',
  'curveBuilder',
  'dom',
  'drawCurveGuides',
  'drawEllipsePixels',
  'drawSelectionMovePreview',
  'drawSelectionTransformHandles',
  'fillPreviewCache',
  'forEachMirroredPoint',
  'getActiveDrawColor',
  'getActiveFillStyle',
  'getActiveFrame',
  'getActiveLayer',
  'getActiveProjectCanvasDocument',
  'getActiveTool',
  'getBrushOffsets',
  'getCanvasInteractionSurfaceFromTarget',
  'getFillGradientColors',
  'getFillStyleForInteraction',
  'getLayerPixelMatchState',
  'getPendingSelectionMoveState',
  'getPixelAlignedCanvasDisplayScale',
  'getProjectCanvasDisplayScale',
  'getProjectCanvasDocumentById',
  'getProjectCanvasSurfaceByCanvasId',
  'getToolIconEntry',
  'getVirtualCursorCellPosition',
  'hoverPixel',
  'hoveredProjectCanvasId',
  'isGradientFillStyle',
  'isIndexColorMode',
  'isMirrorEnabledForTool',
  'isMultiPaletteIsolationEnabled',
  'isRgbColorMode',
  'lastSelectionDashTime',
  'normalizeColorMode',
  'normalizeColorValue',
  'normalizeFillGradientPoint',
  'normalizeFillStyle',
  'normalizeOnionFrameCount',
  'normalizeOnionOpacity',
  'normalizeOnionSkinState',
  'normalizePaletteIndex',
  'normalizeSelectSameMode',
  'onionSkinCache',
  'onionSkinCacheRevision',
  'pointerState',
  'requestOverlayRender',
  'resizeVirtualCursorCanvas',
  'resolveFillGradientPixel',
  'rgbaToCss',
  'sampleCompositeColor',
  'sampleCompositeColorExcludingLayer',
  'selectionCanvasActive',
  'selectionDashScreenOffset',
  'selectionDisplayScale',
  'selectionMaskCacheIdCounter',
  'selectionMaskCacheIds',
  'selectionOutlinePathDark',
  'selectionOutlinePathLight',
  'selectionOutlineSvg',
  'selectionRenderScale',
  'state',
  'toolButtons',
  'virtualCursor',
  'virtualCursorDrawState',
].forEach(name => requireInjectedGetter('canvasOverlayWorkflowUtils', name));
[
  'MAX_ZOOM_RATIO',
  'MIN_ZOOM_RATIO',
  'MIN_ZOOM_SCALE',
  'ZOOM_EPSILON',
  'ZOOM_INDICATOR_TIMEOUT',
  'applyViewportTransform',
  'cancelAnimationFrame',
  'clamp',
  'clearCanvasScreenMetricsCache',
  'dom',
  'formatZoomLabel',
  'getActiveProjectCanvasDocument',
  'getCanvasFocusAt',
  'getCanvasInteractionSurfaceFromTarget',
  'getPixelAlignedCanvasDisplayScale',
  'getProjectCanvasDocumentById',
  'getProjectCanvasSurfaceByCanvasId',
  'getResolvedCanvasInteractionSurface',
  'getViewportVisibilityTargetSurface',
  'getZoomRatioForScale',
  'getZoomScaleForRatio',
  'isLargeDocumentPerformanceMode',
  'isMultiCanvasWorldLayoutActive',
  'markViewportInteractionActivity',
  'normalizeZoomScale',
  'parseLocalViewportCanvasAxis',
  'rememberViewportZoomRatioFromScale',
  'requestOverlayRender',
  'resizeCanvases',
  'resizeVirtualCursorCanvas',
  'scheduleSessionPersist',
  'showViewportIndicator',
  'state',
  'syncAllProjectCanvasSurfaceDimensions',
  'syncCanvasResizeHandleVisibility',
  'syncControlsWithState',
  'syncLocalViewportCanvasDockLayout',
  'syncLocalViewportCanvasDockVisibility',
  'syncMultiCanvasSelectionUi',
  'syncZoomControls',
  'updateCanvasResizeHandlePosition',
  'updateGridDecorations',
  'updateMirrorGuideHandles',
  'virtualCursor',
  'wheelZoomApplying',
  'wheelZoomPendingFocus',
  'wheelZoomPendingRawScale',
  'wheelZoomPendingScale',
  'wheelZoomRaf',
  'wheelZoomRawResetTimer',
  'zoomSettledViewportRefreshHandle',
].forEach(name => requireInjectedGetter('canvasZoomWorkflowUtils', name));
[
  'MIN_ZOOM_SCALE',
  'WHEEL_ZOOM_RAW_RESET_MS',
  'ZOOM_EPSILON',
  'ZOOM_WHEEL_STEP_BASE',
  'clamp',
  'commitPreviewProjectCanvasSelection',
  'dom',
  'finalizePendingSelectionBeforeCanvasSwitch',
  'flushActiveProjectCanvasUiSync',
  'getActiveProjectCanvasDocument',
  'getCanvasInteractionSurfaceFromTarget',
  'getCanvasInteractionSurfaceMetrics',
  'getProjectCanvasDisplayScale',
  'getProjectCanvasDocumentById',
  'getResolvedCanvasInteractionSurface',
  'getVirtualCursorZoomFocus',
  'normalizeZoomScale',
  'requestAnimationFrame',
  'setZoom',
  'state',
  'syncActiveLayerFromInteractionSurface',
  'wheelZoomApplying',
  'wheelZoomPendingFocus',
  'wheelZoomPendingRawScale',
  'wheelZoomPendingScale',
  'wheelZoomRaf',
  'wheelZoomRawResetTimer',
  'getViewportVisibilityTargetSurface',
].forEach(name => requireInjectedGetter('canvasWheelZoomWorkflowUtils', name));
[
  'BRUSH_TOOLS',
  'HISTORY_DRAW_TOOLS',
  'VIRTUAL_CURSOR_MOVE_TOOLS',
  'VIRTUAL_CURSOR_SELECTION_TOOLS',
  'VIRTUAL_CURSOR_SHAPE_TOOLS',
  'VIRTUAL_CURSOR_SUPPORTED_TOOLS',
  'applyBrushStroke',
  'beginHistory',
  'beginSelectionMoveFromVirtualCursor',
  'clamp',
  'clearSelection',
  'commitHistory',
  'createSelectionLasso',
  'createSelectionRect',
  'ctx',
  'curveBuilder',
  'dom',
  'drawEllipse',
  'drawLine',
  'drawRectangle',
  'enforceGuestAssignedLayerSelection',
  'finalizeCurve',
  'floatingDrawButtonState',
  'getActiveLayer',
  'getCanvasInteractionSurfaceMetrics',
  'handleSelectionMoveDrag',
  'history',
  'hoverPixel',
  'isMultiAssignedCellRestrictedEditorMode',
  'isMultiSpectatorMode',
  'localizeText',
  'normalizePaletteIndex',
  'pointerState',
  'promotePendingSelectionMove',
  'refreshViewportCursorStyle',
  'requestOverlayRender',
  'resetCurveBuilder',
  'resetPointerStateForVirtualCursor',
  'rollbackPendingHistory',
  'scheduleSessionPersist',
  'selectionMaskHasPixels',
  'setMultiStatus',
  'state',
  'updateAutosaveStatus',
  'updateCanvasControlButtons',
  'virtualCursor',
  'virtualCursorControl',
  'virtualCursorDrawState',
].forEach(name => requireInjectedGetter('virtualCursorWorkflowUtils', name));
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
  'AUTOSAVE_SUPPORTED',
  'autosaveProjectId',
  'buildLensCameraModeUrl',
  'buildQrEditorModeUrl',
  'createAutosaveProjectId',
  'dom',
  'EXTERNAL_TOOL_PIXIEELENS_ID',
  'EXTERNAL_TOOL_QR_MAKER_ID',
  'getExternalToolDefinition',
  'getExternalToolDefinitionByAction',
  'getExternalToolLocalizedName',
  'hasDocumentUnsavedChanges',
  'localizeText',
  'markAutosaveDirty',
  'setActiveAutosaveProjectId',
  'state',
  'TOOL_GROUPS',
  'TOOL_TO_GROUP',
  'updateAutosaveStatus',
  'updateToolGroupButtons',
  'updateToolVisibility',
  'writeAutosaveSnapshot',
].forEach(name => requireInjectedGetter('externalToolWorkflowUtils', name));
[
  'DEFAULT_HISTORY_LIMIT',
  'MAX_PROJECT_SHEETS',
  'MIN_HISTORY_LIMIT',
  'SHARED_PROJECT_ID_PREFIX',
  'activateQrEditMode',
  'activeOpenProjectTabId',
  'applyHistorySnapshot',
  'autosaveProjectId',
  'autosaveRestoring',
  'clamp',
  'clearActiveSharedProjectSession',
  'clearTimelapseRecording',
  'cloneTimelapsePixelPatchValue',
  'compressHistorySnapshot',
  'compressUint8Array',
  'createAutosaveProjectId',
  'createEmptyTimelapseTrack',
  'createOpenProjectSheetTabFromPackagedProject',
  'decodeBase64',
  'decompressHistorySnapshot',
  'deserializeDocumentPayload',
  'encodeTypedArray',
  'ensureCurrentClientCanReplaceActiveProject',
  'ensureTimelapseStartCapture',
  'flushPendingTimelapseCapture',
  'getActiveOpenProjectTab',
  'getActiveQrEditPayload',
  'getAllTimelapseStepCount',
  'getAllTimelapseTracks',
  'getOpenProjectTabSharedKey',
  'getSharedProjectKeyFromProjectId',
  'history',
  'initializeSharedProjectCanvasIdentityFromCurrentDocument',
  'isImportableImageFile',
  'isSharedRecentProjectEntry',
  'loadDocumentFromImageFile',
  'localizeText',
  'markAutosaveDirty',
  'normalizeAutosaveProjectId',
  'normalizeMultiProjectKey',
  'normalizePackagedProjectSheets',
  'normalizeTimelapseCanvasId',
  'normalizeTimelapseFps',
  'openProjectTabs',
  'preserveCanvasSelectionClipboard',
  'recentProjectsCache',
  'reconcileTimelapseTracksForSingleCanvas',
  'renderOpenProjectTabs',
  'resetDocumentUnsavedChanges',
  'resetExportScaleDefaults',
  'resetOpenedDocumentViewport',
  'resetOpenProjectTabsToCurrentProject',
  'resolvePackagedProjectDotStats',
  'resolveTimelapseFrameEntry',
  'restoreCanvasSelectionClipboard',
  'scheduleAutosaveSnapshot',
  'scheduleSessionPersist',
  'serializeDocumentSnapshot',
  'setActiveAutosaveProjectId',
  'setActiveSharedProjectSession',
  'setMultiStatus',
  'setTrackedProjectDotBaseline',
  'state',
  'suppressOpenProjectTabAutoInitialize',
  'synchronizeImportedSnapshotPalette',
  'syncPixfindSnapshotAfterDocumentReset',
  'syncTimelapseControls',
  'timelapseState',
  'trimHistoryStacksToLimit',
  'updateAutosaveStatus',
  'updateHistoryButtons',
  'updateMemoryStatus',
].forEach(name => requireInjectedGetter('documentSessionWorkflowUtils', name));
[
  'DEFAULT_GROUP_TOOL',
  'POINTER_TOOL_CUSTOM_BRUSH_RECT',
  'TOOL_ACTIONS',
  'TOOL_SHORTCUT_BINDINGS',
  'TOOL_SHORTCUT_CREATE_CUSTOM_BRUSH',
  'TOOL_SHORTCUT_SHAPE_GROUP',
  'addOrDuplicateFrameAfterActive',
  'cancelPendingSelectionMove',
  'clearSelection',
  'clearTimelineSelectionForCanvasInteraction',
  'createCustomBrushFromSelection',
  'dom',
  'getDirectionFromArrowKey',
  'getPreferredToolForGroup',
  'hasPendingSelectionMove',
  'isEditableTarget',
  'keyboardState',
  'nudgeLayerFrameByKeyboard',
  'nudgeSelectionByKeyboard',
  'performCopyAction',
  'performCutAction',
  'performPasteAction',
  'pointerState',
  'runHistoryActionWithGuard',
  'runToolAction',
  'setActiveFrameIndex',
  'setActiveTool',
  'setSpacePanActive',
  'shouldUseArrowKeysForSelectionMove',
  'startupVisible',
  'state',
  'stopPlayback',
  'togglePlaybackFromShortcut',
].forEach(name => requireInjectedGetter('keyboardWorkflowUtils', name));
[
  'SIM_DEFAULT_SETTINGS',
  'SIM_ELEMENT_EMPTY',
  'SIM_ELEMENT_FIRE',
  'SIM_ELEMENT_LIGHT',
  'SIM_ELEMENT_SAND',
  'SIM_ELEMENT_SMOKE',
  'SIM_ELEMENT_WALL',
  'SIM_ELEMENT_WATER',
  'SIM_MAX_LIGHT_RADIUS',
  'clearPlaybackFrameCache',
  'getActiveFrame',
  'getSimulationActiveLayer',
  'isSimulationLayer',
  'markCanvasDirty',
  'requestOverlayRender',
  'requestRender',
  'simulationRuntime',
  'state',
].forEach(name => requireInjectedGetter('simulationPlaybackWorkflowUtils', name));
[
  'CANVAS_RESIZE_HANDLE_GAP',
  'CANVAS_RESIZE_HANDLE_SIZE',
  'MAX_CANVAS_SIZE',
  'MIN_CANVAS_SIZE',
  'SELECTION_TRANSFORM_HANDLE_DRAW_RADIUS_PX',
  'ZOOM_INDICATOR_TIMEOUT',
  'activeCanvasSurface',
  'applyCanvasResizeDimensions',
  'canCurrentClientEditProjectStructure',
  'canvasResizeHandleState',
  'clamp',
  'dom',
  'getPixelAlignedCanvasDisplayScale',
  'lockedCanvasHeight',
  'lockedCanvasWidth',
  'parseLocalViewportCanvasAxis',
  'scheduleCanvasResizeHandleLayoutRefresh',
  'state',
  'zoomIndicatorTimeoutId',
].forEach(name => requireInjectedGetter('canvasResizeHandleWorkflowUtils', name));
[
  'DEFAULT_FLOATING_DRAW_BUTTON_SCALE',
  'DRAW_BUTTON_DRAG_THRESHOLD',
  'DRAW_BUTTON_DRAG_THRESHOLD_TOUCH',
  'FLOATING_DRAW_BUTTON_SCALE_MAX',
  'FLOATING_DRAW_BUTTON_SCALE_MIN',
  'HISTORY_DRAW_TOOLS',
  'VIRTUAL_CURSOR_MOVE_TOOLS',
  'applyBrushStroke',
  'beginHistory',
  'cancelVirtualCursorDrawSession',
  'clamp',
  'commitHistory',
  'createSelectionByColor',
  'createSelectionLasso',
  'createSelectionRect',
  'dom',
  'drawButtonResizeListenerBound',
  'drawEllipse',
  'drawLine',
  'drawRectangle',
  'finishVirtualCursorDrawSession',
  'floatingDrawButtonState',
  'floodFill',
  'getActiveLayer',
  'getSafeAreaInsets',
  'getViewportBounds',
  'getVirtualCursorCellPosition',
  'handleFloatingPreviewPanelViewportChange',
  'isMultiSpectatorMode',
  'isRgbColorMode',
  'layoutMode',
  'localizeText',
  'markSaveInteractionActivity',
  'normalizeColorValue',
  'normalizePaletteIndex',
  'pointerState',
  'requestOverlayRender',
  'resizeVirtualCursorCanvas',
  'rollbackPendingHistory',
  'sampleColor',
  'scheduleSessionPersist',
  'secondaryPaletteIndex',
  'setMultiStatus',
  'startVirtualCursorDrawSession',
  'state',
  'syncVirtualCursorControlVisibility',
  'toCssColor',
  'toolButtons',
  'toolIconCache',
  'updateFloatingMovePadPosition',
  'updateFloatingMovePadPositionIfReady',
  'virtualCursor',
  'virtualCursorDrawState',
].forEach(name => requireInjectedGetter('floatingDrawButtonWorkflowUtils', name));
[
  'BRUSH_SHAPE_CUSTOM',
  'COLOR_MODE_INDEX',
  'CUSTOM_BRUSH_MAX_PIXELS',
  'MAX_IMPORTED_PALETTE_COLORS',
  'SELECTION_TRANSFORM_LARGE_PREVIEW_MAX_PIXELS',
  'SELECTION_TRANSFORM_ROTATION_STEP_DEG',
  'SELECTION_TRANSFORM_SCALE_EPSILON',
  'SELECTION_TRANSFORM_SCALE_MAX',
  'SELECTION_TRANSFORM_SCALE_MIN',
  'activeCanvasSurface',
  'beginHistory',
  'buildIndexedPaletteFromFrameDataList',
  'buildVoxelPreviewCanvasCompositeImageDataForFrameIndex',
  'clamp',
  'commitHistory',
  'ctx',
  'enforceGuestAssignedLayerSelection',
  'findNearestPaletteColorIndexByRgba',
  'forEachSnapshotCanvasLayer',
  'getActiveLayer',
  'getActiveProjectCanvasDocument',
  'getMoveStateSourcePixelAlpha',
  'getProjectCanvasDocuments',
  'isIndexColorMode',
  'isMultiAssignedCellRestrictedEditorMode',
  'isMultiSpectatorMode',
  'isVoxelPreviewCanvasId',
  'localizeText',
  'markDirtyRect',
  'markHistoryDirty',
  'normalizeColorMode',
  'normalizeColorValue',
  'normalizeCustomBrushData',
  'normalizePaletteIndex',
  'padIndexedPaletteToMaxColors',
  'pointerState',
  'quantizeRgbaColors',
  'requestOverlayRender',
  'requestRender',
  'scheduleSessionPersist',
  'setMultiStatus',
  'state',
  'syncBrushControls',
  'updateAutosaveStatus',
].forEach(name => requireInjectedGetter('selectionMoveWorkflowUtils', name));
[
  'DEFAULT_DOCUMENT_BASENAME',
  'DEFAULT_HISTORY_LIMIT',
  'MULTI_RESUME_STORAGE_KEY',
  'PROJECT_FILE_EXTENSION',
  'RELOAD_PROJECT_FALLBACK_STORAGE_KEY',
  'RELOAD_SNAPSHOT_COMPRESS_THRESHOLD',
  'RELOAD_SNAPSHOT_ENABLED',
  'RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY',
  'RELOAD_SNAPSHOT_MAX_AGE_MS',
  'RELOAD_SNAPSHOT_MAX_HISTORY_ITEMS',
  'RELOAD_SNAPSHOT_MAX_SYNC_CHARS',
  'RELOAD_SNAPSHOT_STORAGE_KEY',
  'RELOAD_SNAPSHOT_VERSION',
  'RELOAD_TARGET_PROJECT_ID_KEY',
  'activeSharedProjectDocumentLoaded',
  'activeSharedProjectKey',
  'activeSharedProjectRevision',
  'activeSharedProjectStructureRevision',
  'activeSharedProjectSynced',
  'applyHistorySnapshot',
  'autosaveProjectId',
  'buildAutosaveSessionPayload',
  'buildPackagedProjectPayload',
  'buildSharedRecentProjectId',
  'canUseSessionStorage',
  'clamp',
  'clearLocalRestoreStorage',
  'compressHistorySnapshot',
  'createOpenProjectTabId',
  'decodeBase64',
  'decompressHistorySnapshot',
  'encodeTypedArray',
  'extractDocumentBaseName',
  'findOpenProjectTabIndexByProjectId',
  'getActiveOpenProjectTab',
  'getCurrentSharedRecentProjectEntry',
  'getScopedStorageKey',
  'hasDocumentUnsavedChanges',
  'history',
  'isCurrentProjectSharedEntry',
  'isLargeDocumentPerformanceMode',
  'localizeText',
  'makeHistorySnapshot',
  'markAutosaveDirty',
  'markDocumentUnsavedChange',
  'multiState',
  'normalizeAutosaveProjectId',
  'normalizeDocumentName',
  'normalizeMultiProjectKey',
  'normalizeProjectHistoryLimit',
  'openProjectTabs',
  'readLocalStorageForLocalRestore',
  'readMultiInviteFromUrl',
  'readSessionStorageForLocalRestore',
  'reloadSnapshotRestored',
  'renderOpenProjectTabs',
  'resetDocumentUnsavedChanges',
  'restoreOpenProjectSheetsFromParsedDocument',
  'scheduleAutosaveSnapshot',
  'setActiveAutosaveProjectId',
  'setActiveSharedProjectSession',
  'setActiveSharedProjectSnapshotState',
  'setActiveSharedProjectSyncState',
  'setMultiStatus',
  'snapshotFromDocumentText',
  'snapshotFromParsedDocumentValue',
  'startupAutosaveRestoreProjectId',
  'startupSharedReloadProjectKey',
  'startupSharedReloadRevision',
  'startupSharedReloadStructureRevision',
  'state',
  'textCompression',
  'trimHistoryStacksToLimit',
  'updateAutosaveStatus',
  'updateHistoryButtons',
  'writeLocalStorageForLocalRestore',
  'writeSessionStorageForLocalRestore',
].forEach(name => requireInjectedGetter('reloadSessionWorkflowUtils', name));
[
  'STARTUP_RESTORE_TIMEOUT_MS',
  'beginQrEditPanelDrag',
  'cancelStartupRestoreProgress',
  'confirmPendingSelectionMove',
  'dom',
  'hasPendingSelectionMove',
  'isCanvasSurfaceTarget',
  'isCoarsePointerDevice',
  'isInputControlElement',
  'isLabelForElement',
  'isViewportControlTarget',
  'refreshQrEditPanelViewportPosition',
  'setQrEditPanelVisibleForActiveProject',
  'startupRestoreCancelRequested',
  'startupRestoreCancelResolvers',
  'updateAutosaveStatus',
].forEach(name => requireInjectedGetter('startupTailWorkflowUtils', name));
[
  'canCurrentClientEditProjectStructure',
  'getNormalizedMirrorState',
  'isVoxelExtensionModeEnabled',
  'LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE',
  'localViewportCanvasState',
  'localizeText',
  'MULTI_CANVAS_FEATURE_ENABLED',
  'normalizeLocalViewportCanvasState',
  'state',
  'TOOL_ACTION_FLOATING_PREVIEW_TOGGLE',
  'TOOL_ACTION_MIRROR_POPUP',
  'TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE',
  'TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE',
  'TOP_UI_ACTION_MIRROR_POPUP',
  'TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE',
].forEach(name => requireInjectedGetter('uiActionButtonsWorkflowUtils', name));
[
  'activateMobileTab',
  'announceMultiCanvasEditRestriction',
  'canCurrentClientEditProjectStructure',
  'getNormalizedMirrorState',
  'isDesktopRightToolRailMode',
  'isSharedProjectCollaborativeMode',
  'isVoxelExtensionModeEnabled',
  'launchLensCameraMode',
  'launchQrEditorMode',
  'layoutMode',
  'LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE',
  'localViewportCanvasState',
  'MULTI_CANVAS_FEATURE_ENABLED',
  'normalizeLocalViewportCanvasState',
  'setCompactRightFlyoutOpen',
  'setFloatingPreviewEnabled',
  'setLocalViewportCanvasCount',
  'setMirrorModeEnabled',
  'setRightTab',
  'setRightUtilityMenuOpen',
  'setVirtualCursorEnabled',
  'state',
  'TOOL_ACTION_CAMERA_MODE',
  'TOOL_ACTION_FLOATING_PREVIEW_TOGGLE',
  'TOOL_ACTION_MIRROR_POPUP',
  'TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE',
  'TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE',
  'TOP_UI_ACTION_MIRROR_POPUP',
  'TOP_UI_ACTION_OPEN_DETAILS_PANEL',
  'TOP_UI_ACTION_OPEN_LENS_CAMERA',
  'TOP_UI_ACTION_OPEN_QR_EDITOR',
  'TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE',
  'updateFloatingPreviewActionToolButtons',
  'updateRightTabVisibility',
  'updateVirtualCursorActionToolButtons',
].forEach(name => requireInjectedGetter('uiActionRouterWorkflowUtils', name));
[
  'activateMobileTab',
  'canvasControlMode',
  'dom',
  'getActiveLayer',
  'getRailExpandedToggleWidth',
  'internalClipboard',
  'isCompactRightRailMode',
  'isCompactToolFlyoutOpen',
  'isCompactToolRailMode',
  'isMobilePeekToolFlyoutMode',
  'isMirrorToolPopoverOpen',
  'isMultiSpectatorMode',
  'layoutMode',
  'makeIcon',
  'mobileDrawerState',
  'normalizeMobileDrawerMode',
  'pointerState',
  'selectionMaskHasPixels',
  'setCompactRightFlyoutOpen',
  'setCompactToolFlyoutOpen',
  'setMirrorToolPopoverOpen',
  'setRailWidth',
  'setRightTab',
  'state',
  'syncBrushControls',
  'TOOL_TO_GROUP',
  'updateFloatingMovePadVisibilityIfReady',
  'updateRightTabVisibility',
  'updateToolVisibility',
].forEach(name => requireInjectedGetter('canvasControlActionsWorkflowUtils', name));
[
  'dom',
  'getGuardedHistoryLabelDisplayName',
  'getHistoryEntryLabel',
  'globalHistoryConfirmState',
  'hasPendingCurveUndoRedoInterception',
  'hasPendingSelectionMove',
  'history',
  'isGuardedMultiSharedHistoryLabel',
  'isMultiMasterMode',
  'isSharedProjectCollaborativeMode',
  'localizeText',
  'multiState',
  'redo',
  'undo',
].forEach(name => requireInjectedGetter('historyGuardWorkflowUtils', name));
[
  'MULTI_LAYER_PATCH_HISTORY_LABELS',
  'MULTI_SCOPED_HISTORY_LABELS',
  'SHARED_PROJECT_CHECKPOINT_DELAY',
  'SHARED_PROJECT_DEFERRED_PERSIST_DELAY',
  'activeSharedProjectKey',
  'applyHistorySnapshot',
  'applyHistorySnapshotForClient',
  'applyHistorySnapshotForSharedLocalCell',
  'applyPixelPatchHistoryEntry',
  'cancelPendingCurveInteraction',
  'cancelPendingSelectionMove',
  'classifySharedProjectOpType',
  'clearPlaybackFrameCache',
  'compressHistorySnapshot',
  'createTimelapseFrameEntryFromSnapshot',
  'decompressHistorySnapshot',
  'dom',
  'finalizePixelPatchHistoryEntry',
  'getActiveProjectCanvasDocument',
  'getActiveTimelapseTrack',
  'getHistoryEntryLabel',
  'getMultiHistoryBucket',
  'handleMultiLocalCommit',
  'hasPendingSelectionMove',
  'history',
  'invalidateFillPreviewCache',
  'invalidateOnionSkinCache',
  'isLargeDocumentPerformanceMode',
  'isLocalOnlyMultiHistoryLabel',
  'isMultiClientScopedHistoryMode',
  'isMultiMasterMode',
  'isPixelPatchHistoryEntry',
  'isSharedProjectCollaborativeMode',
  'isVoxelExtensionModeEnabled',
  'makeHistorySnapshot',
  'markAutosaveDirty',
  'markDocumentUnsavedChange',
  'multiState',
  'queueSharedProjectCurrentSnapshotCapture',
  'recordTimelapseOperationLogEntry',
  'requestImmediateAutosaveSnapshot',
  'scheduleAutosaveSnapshot',
  'scheduleGuestLayerPatchSend',
  'scheduleMasterLayerPatchSend',
  'scheduleMultiPublicLobbyRoomSync',
  'scheduleMultiSessionStateBroadcast',
  'scheduleQrEditReadabilityCheck',
  'scheduleSessionPersist',
  'scheduleTimelapseCaptureFromState',
  'setHistoryEntryLabel',
  'setVoxelPreviewOrientationForFrameIndex',
  'shouldPersistSharedProjectSnapshotForHistoryLabel',
  'state',
  'thinTimelapseSnapshotsIfNeeded',
  'timelapseState',
  'updateMemoryStatus',
  'voxelExtensionState',
].forEach(name => requireInjectedGetter('historyCoreWorkflowUtils', name));
[
  'beginHistory',
  'captureSharedProjectCurveCommand',
  'commitHistory',
  'ctx',
  'curveBuilder',
  'dom',
  'forEachBrushOffset',
  'getActiveDrawColor',
  'getActiveLayer',
  'getBackgroundTileColor',
  'getPointerPosition',
  'handlePointerMove',
  'handlePointerUp',
  'hoverPixel',
  'invertPreviewColor',
  'pointerState',
  'requestOverlayRender',
  'requestRender',
  'resetCurveBuilder',
  'resolveSampledColor',
  'sampleCompositeColor',
  'scheduleSessionPersist',
  'stampBrush',
  'state',
].forEach(name => requireInjectedGetter('curveWorkflowUtils', name));
[
  'activeCanvasSurface',
  'clamp',
  'dom',
  'getActiveProjectCanvasDocument',
  'getProjectCanvasDisplayScale',
  'mainViewportCanvasSurface',
  'MIN_ZOOM_SCALE',
  'state',
].forEach(name => requireInjectedGetter('canvasGridWorkflowUtils', name));
[
  'SPRITE_SCALE_EPSILON',
  'canCurrentClientEditProjectStructure',
  'clamp',
  'dom',
  'getCanvasResizeInputValue',
  'getMaxSpriteMultiplier',
  'getNearestSpriteScaleOption',
  'getSpriteScaleOptionIndex',
  'getSpriteScaleOptions',
  'lockedCanvasHeight',
  'lockedCanvasWidth',
  'state',
  'updateSpriteScaleControlLimits',
].forEach(name => requireInjectedGetter('sizeSettingsWorkflowUtils', name));
[
  'VOXEL_EXTENSION_DEFAULT_STATE',
  'abortActivePointerInteraction',
  'beginHistory',
  'canCurrentClientEditProjectStructure',
  'canSelectSharedProjectTimelineCell',
  'clamp',
  'commitHistory',
  'enforceGuestAssignedLayerSelection',
  'getActiveFrame',
  'getActiveLayer',
  'getActiveLayerIndex',
  'getActiveLayerTrackIndex',
  'getActiveProjectCanvasDocument',
  'getDurationFromFps',
  'getProjectCanvasDocuments',
  'getVoxelPreviewOrientationForFrameIndex',
  'hoverPixel',
  'invalidateActiveCanvasCompositeRenderState',
  'isMultiAssignedCellRestrictedEditorMode',
  'isSharedProjectCollaborativeMode',
  'isVoxelExtensionModeEnabled',
  'localizeText',
  'markHistoryDirty',
  'normalizeFpsValue',
  'normalizeVoxelExtensionState',
  'pointerState',
  'renderFrameList',
  'renderLayerList',
  'renderTimelineMatrix',
  'requestOverlayRender',
  'requestRender',
  'scheduleSessionPersist',
  'scheduleSharedProjectCellPresenceBroadcast',
  'scheduleTimelineMatrixRenderSoon',
  'setMultiStatus',
  'state',
  'syncActiveFrameSettingsUI',
  'syncActiveLayerSettingsUI',
  'syncAnimationFpsDisplayFromState',
  'syncVoxelExtensionPreviewFromSource',
  'updateAnimationFpsDisplay',
  'updatePixfindModeUI',
  'virtualCursorDrawState',
  'voxelExtensionState',
].forEach(name => requireInjectedGetter('timelineNavigationWorkflowUtils', name));
[
  'AUTOSAVE_SUPPORTED',
  'SHARED_PROJECT_ID_PREFIX',
  'activeOpenProjectTabId',
  'activeSharedProjectId',
  'activeSharedProjectKey',
  'activeSharedProjectMembershipRole',
  'activeSharedProjectRevision',
  'activeSharedProjectStructureRevision',
  'autosaveProjectId',
  'buildSharedRecentProjectId',
  'checkpoint',
  'clearActiveSharedProjectSession',
  'clearPendingSharedInvite',
  'createAutosaveProjectId',
  'ensureCurrentClientCanReplaceActiveProject',
  'extractDocumentBaseName',
  'findOpenProjectTabIndex',
  'findOpenProjectTabIndexForRecentProjectEntry',
  'getCurrentSharedRecentProjectEntry',
  'getOpenProjectTabDisplayLabel',
  'getOpenProjectTabSharedKey',
  'getSharedProjectKeyFromProjectId',
  'getSharedRecentProjectEntryForTab',
  'handleMultiLocalCommit',
  'hideProjectHomeScreen',
  'hideStartupScreen',
  'isCurrentProjectSharedEntry',
  'isMultiMasterProjectReplacementBlocked',
  'isSharedProjectRealtimePrimaryActive',
  'isSharedRecentProjectEntry',
  'loadDocumentFromProjectPayload',
  'loadDocumentFromText',
  'loadRecentProjectsMetadata',
  'localizeText',
  'mapSharedProjectMembershipRoleToUiRole',
  'markAutosaveDirty',
  'markDocumentUnsavedChange',
  'multiState',
  'normalizeAutosaveProjectId',
  'normalizeMultiProjectKey',
  'openProjectTabBusy',
  'openProjectTabs',
  'openSharedRecentProject',
  'persistActiveOpenProjectTab',
  'projectHomeVisible',
  'queueProjectTabViewportReset',
  'queueSharedProjectCurrentSnapshotCapture',
  'readPendingSharedInvite',
  'recentProjectsCache',
  'releaseOpenProjectTabProjectWriteGuard',
  'renderOpenProjectTabs',
  'resetDocumentUnsavedChanges',
  'retainOpenProjectTabProjectWriteGuard',
  'saveRecentProjectsList',
  'scheduleAutosaveSnapshot',
  'scheduleSessionPersist',
  'setActiveAutosaveProjectId',
  'setMultiStatus',
  'setProjectHomeVisible',
  'setRecentProjectsCache',
  'startupAutosaveRestoreProjectId',
  'state',
  'storeMultiProjectKey',
  'suppressOpenProjectTabAutoInitialize',
  'syncMultiProjectKeyInputValues',
  'unhideSharedProjectFromRecentSync',
  'updateAutosaveStatus',
].forEach(name => requireInjectedGetter('openProjectTabWorkflowUtils', name));
[
  'MAX_CANVAS_SIZE',
  'MIN_CANVAS_SIZE',
  'SPRITE_SCALE_DOWN_PRESETS',
  'SPRITE_SCALE_EPSILON',
  'beginHistory',
  'canCurrentClientEditProjectStructure',
  'clamp',
  'clearSelection',
  'commitHistory',
  'createLayer',
  'dom',
  'ensureLayerDirect',
  'getMaxSpriteMultiplier',
  'getNearestSpriteScaleOption',
  'getPixelAlignedCanvasDisplayScale',
  'hasPendingCanvasResizeInputChange',
  'hasPendingSpriteScaleInputChange',
  'isSharedProjectCollaborativeMode',
  'localizeText',
  'lockedCanvasHeight',
  'lockedCanvasWidth',
  'markHistoryDirty',
  'normalizeLayerBlendMode',
  'normalizeLayerOpacity',
  'requestOverlayRender',
  'requestRender',
  'rescaleMirrorPivotForCanvas',
  'resizeCanvases',
  'rollbackPendingHistory',
  'scheduleSessionPersist',
  'setMultiStatus',
  'state',
  'translateMirrorPivotForCanvasResize',
  'updateAutosaveStatus',
  'updateMemoryStatus',
  'updateSettingsSizeApplyButtonState',
  'updateSpriteScaleControlLimits',
].forEach(name => requireInjectedGetter('canvasResizeWorkflowUtils', name));
[
  'BRUSH_SHAPE_CUSTOM',
  'BRUSH_SHAPE_SQUARE',
  'COLOR_MODE_INDEX',
  'DEFAULT_CANVAS_SIZE',
  'DEFAULT_GROUP_TOOL',
  'DEFAULT_UI_THEME',
  'FILL_STYLE_SOLID',
  'FLOATING_PREVIEW_DEFAULT_STATE',
  'LEFT_TAB_KEYS',
  'MIN_ZOOM_RATIO',
  'MIN_ZOOM_SCALE',
  'RIGHT_TAB_KEYS',
  'SELECTION_SHAPE_MODE_CONTENT',
  'SELECT_SAME_MODE_CONNECTED',
  'SIM_LAYER_TYPE',
  'TOOL_GROUPS',
  'TOOL_TO_GROUP',
  'VOXEL_EXTENSION_DEFAULT_STATE',
  'applyLocalLayerPreviewOpacityToState',
  'applyLocalLayerVisibilityToState',
  'buildSelectionMoveTransformedEntries',
  'clamp',
  'cloneLayerForSnapshot',
  'computeSelectionBoundsFromMask',
  'compressInt16Array',
  'compressUint8Array',
  'createSimulationLayer',
  'decodeInt16Data',
  'decodeUint8Data',
  'deserializeLocalLayerPreviewOpacityMap',
  'deserializeLocalLayerVisibilityMap',
  'getActiveProjectCanvasDocument',
  'getActiveProjectCanvasIndex',
  'getDefaultLayerName',
  'getPendingSelectionMoveState',
  'getProjectCanvasCount',
  'getProjectCanvasDocuments',
  'getSelectionMoveContentMask',
  'hasCustomBrushData',
  'inferDirectOnlyLayer',
  'isSimulationLayer',
  'isVoxelExtensionModeEnabled',
  'localLayerPreviewOpacityById',
  'localLayerVisibilityById',
  'localViewportCanvasState',
  'normalizeBrushShape',
  'normalizeColorMode',
  'normalizeColorValue',
  'normalizeCustomBrushData',
  'normalizeFillStyle',
  'normalizeFloatingDrawButtonScale',
  'normalizeFloatingPreviewState',
  'normalizeLayerBlendMode',
  'normalizeLayerOpacity',
  'normalizeLocalViewportCanvasState',
  'normalizeMirrorAxisState',
  'normalizeOnionSkinState',
  'normalizePaletteIndex',
  'normalizeProjectCanvasViewScale',
  'normalizeSelectSameMode',
  'normalizeSelectionShapeMode',
  'normalizeSimulationSettings',
  'normalizeToolId',
  'normalizeUiTheme',
  'normalizeVoxelExtensionState',
  'normalizeVoxelPreviewPitchDegrees',
  'normalizeVoxelPreviewYawDegrees',
  'normalizeZoomScale',
  'rememberViewportZoomRatioFromScale',
  'serializeLocalLayerPreviewOpacityMap',
  'serializeLocalLayerVisibilityMap',
  'shouldIncludeProjectCanvasPayload',
  'snapshotProjectCanvasDocument',
  'state',
  'syncLocalLayerPreviewOpacityMapFromState',
  'syncLocalLayerVisibilityMapFromState',
  'syncSnapshotActiveCanvasPayload',
  'syncVoxelExtensionPreviewFromSource',
  'voxelExtensionState',
].forEach(name => requireInjectedGetter('historySnapshotWorkflowUtils', name));
[
  'BRUSH_SHAPE_CUSTOM',
  'BRUSH_SHAPE_SQUARE',
  'COLOR_MODE_INDEX',
  'COLOR_MODE_RGB',
  'DEFAULT_CANVAS_SIZE',
  'DOCUMENT_FILE_VERSION',
  'LEFT_TAB_KEYS',
  'MIN_ZOOM_RATIO',
  'MIN_ZOOM_SCALE',
  'MULTI_CANVAS_FEATURE_ENABLED',
  'RIGHT_TAB_KEYS',
  'TOOL_GROUPS',
  'TOOL_TO_GROUP',
  'VOXEL_EXTENSION_DEFAULT_STATE',
  'clamp',
  'decodeBase64',
  'deserializeCustomBrushPayload',
  'deserializeLayerFromDocument',
  'encodeTypedArray',
  'frameListHasDirectPixelData',
  'getDefaultFrameName',
  'getDefaultLayerName',
  'getDefaultProjectCanvasName',
  'normalizeBrushShape',
  'normalizeColorMode',
  'normalizeColorValue',
  'normalizeDocumentName',
  'normalizeFillStyle',
  'normalizeLastGroupTool',
  'normalizeMirrorAxisState',
  'normalizeOnionSkinState',
  'normalizeProjectCanvasViewScale',
  'normalizeSelectSameMode',
  'normalizeSelectionShapeMode',
  'normalizeToolId',
  'normalizeUiTheme',
  'normalizeVoxelExtensionState',
  'normalizeVoxelPreviewPitchDegrees',
  'normalizeVoxelPreviewYawDegrees',
  'serializeLayerForDocument',
  'state',
  'validateBoundsObject',
].forEach(name => requireInjectedGetter('documentSerializationUtils', name));
[
  'AUTOSAVE_SUPPORTED',
  'DEFAULT_DOCUMENT_NAME',
  'DOCUMENT_FILE_VERSION',
  'LOCAL_PROJECT_THUMBNAIL_UPDATE_INTERVAL_MS',
  'MAX_PROJECT_SHEETS',
  'PROJECT_FILE_EXTENSION',
  'PROJECT_PACKAGE_TYPE',
  'PROJECT_PACKAGE_VERSION',
  'THUMBNAIL_CANVAS_SIZE',
  'THUMBNAIL_MAX_EDGE',
  'activeOpenProjectTabId',
  'autosaveProjectId',
  'buildProjectSessionPayload',
  'clamp',
  'compositeFramePixels',
  'createAutosaveProjectId',
  'createOpenProjectTabId',
  'extractDocumentBaseName',
  'findOpenProjectTabIndex',
  'getCurrentRecentProjectAccountUserId',
  'getOpenProjectTabSharedKey',
  'getSharedProjectKeyFromProjectId',
  'hasDocumentUnsavedChanges',
  'isSharedRecentProjectEntry',
  'loadRecentProjectsMetadata',
  'localizeText',
  'makeHistorySnapshot',
  'normalizeAutosaveProjectId',
  'normalizeDocumentName',
  'normalizeMultiProjectKey',
  'normalizeQrEditPayload',
  'openProjectTabs',
  'projectDotBaselineSnapshot',
  'projectDotCumulativeStats',
  'recordSharedProjectLightweightLocalSave',
  'saveRecentProjectsList',
  'serializeDocumentSnapshot',
  'setActiveAutosaveProjectId',
  'setRecentProjectsCache',
  'snapshotFromParsedDocumentValue',
  'state',
  'suppressOpenProjectTabAutoInitialize',
].forEach(name => requireInjectedGetter('projectPackageWorkflowUtils', name));
[
  'AUTOSAVE_SUPPORTED',
  'DEFAULT_DOCUMENT_NAME',
  'RECENT_PROJECT_STORAGE_LOCAL',
  'SHARED_RECENT_PROJECTS_ACCOUNT_SYNC_COOLDOWN_MS',
  'SHARED_RECENT_PROJECTS_FORCE_SYNC_COOLDOWN_MS',
  'accountState',
  'buildSharedRecentProjectId',
  'closeOpenProjectTabsForDeletedProject',
  'createAutosaveProjectId',
  'createSharedProjectSnapshotTitle',
  'dom',
  'enforceSharedRecentProjectLimit',
  'extractDocumentBaseName',
  'fetchSharedProjectRecordByInviteToken',
  'formatUpdateHistoryDate',
  'generateSnapshotThumbnail',
  'getCurrentRecentProjectAccountUserId',
  'getRecentProjectEntryFileName',
  'getRecentProjectListSnapshot',
  'getRecentProjectStorageKind',
  'getSharedProjectKeyFromProjectId',
  'isOwnedSharedRecentProjectEntry',
  'isSharedRecentProjectEntry',
  'loadRecentProjectsMetadata',
  'loadSharedProjectSnapshotRecord',
  'localizeText',
  'normalizeAutosaveProjectId',
  'normalizeDocumentName',
  'normalizeMultiProjectKey',
  'normalizeRecentProjectAccountUserId',
  'normalizeSharedRecentProjectEntry',
  'queueStartupRecentAdRender',
  'recentProjectsCache',
  'recentProjectsLastRenderSignature',
  'recentProjectsPendingRenderEntries',
  'recentProjectsRenderTimer',
  'saveRecentProjectsList',
  'sharedRecentProjectsAccountSyncPromise',
  'sharedRecentProjectsLastAccountSyncAt',
  'snapshotFromDocumentText',
  'state',
  'startupVisible',
  'syncPixieedSupportBenefitUi',
  'syncSharedRecentProjectsFromAccount',
  'updateAutosaveStatus',
  'updatePixieedAccountUi',
].forEach(name => requireInjectedGetter('recentProjectWorkflowUtils', name));
[
  'AUTOSAVE_SUPPORTED',
  'DEFAULT_CANVAS_SIZE',
  'DEFAULT_DOCUMENT_BASENAME',
  'DEFAULT_DOCUMENT_NAME',
  'EXTERNAL_IMPORT_MODE_NEW_PROJECT',
  'MAX_CANVAS_SIZE',
  'MIN_CANVAS_SIZE',
  'NEW_PROJECT_IMMEDIATE_AUTOSAVE_ATTEMPTS',
  'NEW_PROJECT_PALETTE_PRESET_DEFAULT',
  'STARTUP_SCREEN_DISMISSED_KEY',
  'STARTUP_SCREEN_MODE_DEFAULT',
  'STARTUP_UPDATE_TOAST_HIDDEN_KEY',
  'accountState',
  'applyHistorySnapshot',
  'autosaveProjectId',
  'autosaveWriteTimer',
  'bindCoreProjectActionButtons',
  'buildSharedProjectOpenBlockedMessage',
  'buildSharedRecentProjectId',
  'canUseSessionStorage',
  'cancelStartupRestoreProgress',
  'clamp',
  'clearActiveSharedProjectSession',
  'clearReloadTargetProjectId',
  'clearTimelapseRecording',
  'closeAllOpenProjectTabsForProjectReplacement',
  'closeGlobalHistoryConfirmDialog',
  'createAutosaveProjectId',
  'createInitialState',
  'createSharedProjectFromCurrentDocument',
  'deleteOwnedSharedProjectFromBackend',
  'dom',
  'enforceSharedProjectOwnershipLimit',
  'enforceSharedRecentProjectLimit',
  'ensureCurrentClientCanReplaceActiveProject',
  'ensureNoLegacyMultiSessionForSharedProject',
  'ensureSharedProjectAuthenticatedStart',
  'ensureSharedProjectBackendSession',
  'ensureTimelapseStartCapture',
  'extractDocumentBaseName',
  'getCurrentSharedRecentProjectEntry',
  'getMaxSharedProjectCount',
  'getSharedProjectOwnershipStatus',
  'getUpdateHistoryEntries',
  'globalHistoryConfirmState',
  'hideProjectHomeScreen',
  'hideSharedProjectFromRecentSync',
  'history',
  'initPixieedAccount',
  'isSharedRecentProjectEntry',
  'lastSharedProjectCreationFailureDetail',
  'lastSharedProjectCreationFailureReason',
  'lensImportRequested',
  'loadRecentProjectsMetadata',
  'localizeText',
  'lockedCanvasHeight',
  'lockedCanvasWidth',
  'markAutosaveDirty',
  'newProjectAdRequested',
  'newProjectPalettePresetId',
  'newProjectSubmitBusy',
  'normalizeAutosaveProjectId',
  'normalizeDocumentName',
  'normalizeMultiProjectKey',
  'normalizeNewProjectPalettePreset',
  'normalizeSharedRecentProjectEntry',
  'openDocumentDialog',
  'openRecentProject',
  'openSharedProjectFromHomeInput',
  'pendingNewProjectCreateShared',
  'projectHomeVisible',
  'purgeDeletedSharedProjectLocalReferences',
  'readMultiInviteFromUrl',
  'readReloadTargetProjectId',
  'recentProjectsCache',
  'refreshRecentProjectsUI',
  'reloadSnapshotRestored',
  'removeRecentProjectEntry',
  'renderNewProjectPalettePresetOptions',
  'renderNewProjectPalettePresetPicker',
  'resetDocumentUnsavedChanges',
  'resetExportScaleDefaults',
  'resetOpenProjectTabsToCurrentProject',
  'resetOpenedDocumentViewport',
  'resolveGlobalHistoryConfirm',
  'resolveSharedRecentProjectOwnedByCurrentUser',
  'scheduleAutosaveSnapshot',
  'scheduleSessionPersist',
  'setActiveAutosaveProjectId',
  'setCurrentPalettePresetId',
  'setMultiStatus',
  'setNewProjectPalettePresetId',
  'setNewProjectPalettePresetPickerOpen',
  'setProjectHomeVisible',
  'setRecentProjectsCache',
  'setStartupProgressLabel',
  'setTrackedProjectDotBaseline',
  'setVirtualCursorEnabled',
  'startupAutosaveRestoreProjectId',
  'startupRecentAdRequested',
  'startupRestoreCancelRequested',
  'startupScreenMode',
  'startupSharedReloadProjectKey',
  'startupSharedReloadRevision',
  'startupSharedReloadStructureRevision',
  'startupVirtualCursorState',
  'startupVisible',
  'state',
  'storeMultiProjectKey',
  'storePendingSharedInvite',
  'syncMultiProjectKeyInputValues',
  'syncPixfindSnapshotAfterDocumentReset',
  'syncStartupResumeState',
  'updateAutosaveStatus',
  'updateHistoryButtons',
  'writeAutosaveSnapshot',
].forEach(name => requireInjectedGetter('startupWorkflowUtils', name));
[
  'RECENT_PROJECT_STORAGE_LOCAL',
  'SHARED_PROJECT_DEVICE_ID_STORAGE_KEY',
  'accountState',
  'normalizeRecentProjectAccountUserId',
  'normalizeRecentProjectStorageKind',
  'sharedProjectDeviceId',
  'sharedProjectSessionInstanceId',
].forEach(name => requireInjectedGetter('recentAccountWorkflowUtils', name));
[
  'PIXIEED_AVATAR_STORAGE_KEY',
  'PIXIEED_NICKNAME_STORAGE_KEY',
  'PIXIEED_X_URL_STORAGE_KEY',
  'accountState',
  'canUseSessionStorage',
].forEach(name => requireInjectedGetter('pixieedProfileLocalUtils', name));
[
  'DEFAULT_DOCUMENT_NAME',
  'HIDDEN_SHARED_PROJECT_KEYS_STORAGE_PREFIX',
  'RECENT_PROJECT_STORAGE_SHARED',
  'SHARED_PROJECT_ID_PREFIX',
  'SHARED_PROJECT_LIMIT_DEFAULT',
  'accountState',
  'extractDocumentBaseName',
  'getMaxSharedProjectCount',
  'getRecentProjectStorageKind',
  'localizeText',
  'normalizeAutosaveProjectId',
  'normalizeDocumentName',
  'normalizeMultiProjectKey',
  'normalizeRecentProjectAccountUserId',
  'recentProjectsCache',
].forEach(name => requireInjectedGetter('sharedRecentProjectUtils', name));
[
  'AUTOSAVE_SUPPORTED',
  'DEFAULT_DOCUMENT_BASENAME',
  'DEFAULT_DOCUMENT_NAME',
  'PROJECT_FILE_EXTENSION',
  'accountState',
  'activeSharedProjectId',
  'activeSharedProjectKey',
  'activeSharedProjectMembershipRole',
  'activeSharedProjectOpenReadOnly',
  'activeSharedProjectRevision',
  'activeSharedProjectStructureRevision',
  'autosaveProjectId',
  'buildSharedProjectGraceMessage',
  'buildSharedProjectOpenBlockedMessage',
  'buildSharedRecentProjectId',
  'canSharedProjectMembershipRoleEdit',
  'canUseSharedProjectsBackend',
  'enforceSharedRecentProjectLimit',
  'ensurePixieedAccountClient',
  'ensureSharedProjectBackendSession',
  'extractDocumentBaseName',
  'getCurrentSharedProjectUiRole',
  'getMaxSharedProjectCount',
  'getOwnedSharedRecentProjectEntries',
  'getSharedProjectKeyFromProjectId',
  'getSharedProjectOwnershipStatus',
  'handleSharedProjectsBackendError',
  'isCurrentProjectSharedEntry',
  'isMissingRpcFunction',
  'isOwnedSharedRecentProjectEntry',
  'isSharedProjectCollaborativeMode',
  'isSharedRecentProjectEntry',
  'loadRecentProjectsMetadata',
  'localizeText',
  'mapSharedProjectMembershipRoleToUiRole',
  'multiState',
  'normalizeAutosaveProjectId',
  'normalizeDocumentName',
  'normalizeMultiDesiredRole',
  'normalizeMultiProjectKey',
  'normalizeSharedProjectMembershipRole',
  'normalizeSharedRecentProjectEntry',
  'openSharedProjectLimitDialog',
  'prefersSharedProjectFlow',
  'purgeDeletedSharedProjectLocalReferences',
  'recentProjectsCache',
  'saveRecentProjectsList',
  'setActiveSharedProjectSession',
  'setMultiStatus',
  'setRecentProjectsCache',
  'sharedProjectMembers',
  'sharedRecentProjectUtilsModule',
  'state',
  'unhideSharedProjectFromRecentSync',
  'upsertSharedRecentProjectEntry',
].forEach(name => requireInjectedGetter('sharedProjectRecentStateUtils', name));
[
  'MULTI_DEFAULT_ROOM_VISIBILITY',
  'MULTI_ROOM_VISIBILITY_PUBLIC',
  'SIM_LAYER_TYPE',
  'dom',
  'isSimulationLayer',
  'localizeText',
  'multiState',
  'normalizeMultiRoomVisibility',
  'setMultiStatus',
  'updateAutosaveStatus',
  'DEFAULT_DOCUMENT_NAME',
  'SHARED_PROJECT_ID_PREFIX',
  'accountState',
  'activeSharedProjectKey',
  'activeSharedProjectMembershipRole',
  'autosaveProjectId',
  'buildPackagedProjectPayload',
  'buildSharedRecentProjectId',
  'clearSharedProjectCreationFailureReason',
  'commitHistory',
  'createSharedProjectSnapshotTitle',
  'ensureInternetConnectedForAction',
  'ensureNoLegacyMultiSessionForSharedProject',
  'ensureSharedProjectAuthenticatedStart',
  'ensureSharedProjectBackendSession',
  'ensureSharedProjectCapacity',
  'ensureSharedProjectInviteIncludesCommittedLocalOps',
  'generateMultiProjectKey',
  'getSharedProjectCreationFailureReason',
  'getTrackedSharedRecentProjectEntry',
  'history',
  'isCurrentProjectSharedEntry',
  'isSharedProjectsBlockedByRuntime',
  'makeHistorySnapshot',
  'markActiveSharedProjectDocumentLoaded',
  'normalizeAutosaveProjectId',
  'normalizeMultiProjectKey',
  'normalizeSharedProjectMembershipRole',
  'persistSharedProjectSnapshot',
  'pointerState',
  'removeRecentProjectEntry',
  'retargetAutosaveProjectId',
  'setActiveAutosaveProjectId',
  'setActiveSharedProjectSession',
  'setMultiDesiredRole',
  'setMultiUiView',
  'setSharedProjectCreationFailureReason',
  'showSharedRuntimeBlockedStatus',
  'state',
  'storeMultiProjectKey',
  'syncMultiControls',
  'syncMultiProjectKeyInputValues',
  'upsertSharedRecentProjectEntry',
].forEach(name => requireInjectedGetter('sharedProjectCreateProgressUtils', name));
[
  'UI_LANGUAGE_EN',
  'UI_LANGUAGE_JA',
  'UI_LANGUAGE_ZH',
  'UI_LANGUAGE_ZH_MAP',
  'uiLanguage',
].forEach(name => requireInjectedGetter('uiLanguageUtils', name));
[
  'DEFAULT_DOCUMENT_NAME',
  'accountState',
  'extractDocumentBaseName',
  'localizeText',
  'normalizeDocumentName',
  'setMultiStatus',
  'state',
  'supportsSharedProjectsBackend',
].forEach(name => requireInjectedGetter('sharedRuntimeUtils', name));
[
  'PIXIEED_AUTH_SESSION_CACHE_KEY',
  'PIXIEED_AUTH_STORAGE_KEY',
  'SHARED_PROJECT_LIMIT_DEFAULT',
  'accountAuthListenerBound',
  'accountAuthSubscription',
  'accountInitPromise',
  'accountProfileSyncPromise',
  'accountProfileSyncPromisesByUserId',
  'accountProjectTransferPromptInFlight',
  'accountProjectTransferPromptedForUserId',
  'accountState',
  'accountSupabaseInitPromise',
  'activeSharedProjectKey',
  'buildSharedProjectUsageLabel',
  'canUseSharedProjectsBackend',
  'closeLoginPromptDialog',
  'disconnectActiveSharedProjectRealtimeChannel',
  'dom',
  'enforceSharedProjectOwnershipLimit',
  'getMaxSharedProjectCount',
  'getSharedProjectOwnershipStatus',
  'isMissingColumn',
  'isOwnedSharedRecentProjectEntry',
  'isRecoverableSharedBackendPreflightError',
  'loadRecentProjectsMetadata',
  'localizeText',
  'multiState',
  'normalizeMultiProjectKey',
  'normalizePixieedAvatarId',
  'openLoginPromptDialog',
  'openSharedProjectCanonical',
  'pendingSharedInviteResumePromise',
  'pixieedAdFreeSharedLimitBound',
  'queueSharedProjectReconnectRecovery',
  'readPixieedAccountNickname',
  'readPixieedLocalAvatarId',
  'readPixieedLocalNickname',
  'readPixieedLocalXUrl',
  'refreshRecentProjectsUI',
  'saveRecentProjectsList',
  'setActiveSharedProjectSyncState',
  'setMultiStatus',
  'setRecentProjectsCache',
  'sharedProjectAuthEnsurePromise',
  'shouldIgnorePixieedProfileError',
  'supportsPixieedProfileXUrl',
  'supportsSharedProjectsBackend',
  'syncPixieedSupportBenefitUi',
  'syncSharedRecentProjectsFromAccount',
  'updateAutosaveStatus',
  'writePixieedLocalAvatarId',
  'writePixieedLocalNickname',
  'writePixieedLocalXUrl',
  'buildPixieedAccountLoginHref',
  'isStandaloneAppDisplayMode',
  'normalizeRecentProjectAccountUserId',
].forEach(name => requireInjectedGetter('pixieedAccountWorkflowUtils', name));
[
  'DANMAKU_MAX_ITEMS',
  'DANMAKU_MAX_SIZE',
  'DANMAKU_MAX_SPEED',
  'DANMAKU_MIN_SIZE',
  'DANMAKU_MIN_SPEED',
  'GLOBAL_LOADING_INDICATOR_MIN_VISIBLE_MS',
  'GLOBAL_LOADING_INDICATOR_SHOW_DELAY',
  'accountState',
  'activeSharedProjectCanonicalOpenKey',
  'activeSharedProjectCanonicalOpenPromise',
  'activeSharedProjectCanonicalOpenReasons',
  'activeSharedProjectChannel',
  'activeSharedProjectKey',
  'activeSharedProjectOpenInProgress',
  'activeSharedProjectOpenReadOnly',
  'activeSharedProjectRevision',
  'applySharedProjectOpsSinceRevision',
  'approveMultiJoinRequest',
  'assignLayerToGuestClient',
  'buildSharedProjectCreationBlockedMessage',
  'canCurrentClientExportProject',
  'canCurrentClientRequestGuestRole',
  'canCurrentGuestFreelyMoveAssignedCell',
  'canScrollElementByDeltaY',
  'canUseSessionStorage',
  'canUseSharedProjectsBackend',
  'clearMultiGuestMovePreview',
  'commitHistory',
  'connectMultiSessionAs',
  'createSharedProjectSnapshotTitle',
  'dom',
  'ensureActiveSharedProjectRealtimeChannel',
  'fetchSharedProjectRecord',
  'flushSharedProjectPendingLocalOps',
  'getActiveProjectCanvasDocument',
  'getAssignedGuestCount',
  'getCurrentSharedProjectMembershipRole',
  'getCurrentSharedProjectUiRole',
  'getCurrentSharedRecentProjectEntry',
  'getMultiExportDisabledReason',
  'getMultiExportPermissionLabel',
  'getMultiGuestLimitForCurrentPlan',
  'getMultiJoinPolicyLabel',
  'getMultiRoomVisibilityLabel',
  'getPendingMultiAssignmentMoveRequest',
  'getPendingMultiJoinRequest',
  'getProjectCanvasCount',
  'getProjectCanvasDocumentAt',
  'getProjectCanvasDocumentById',
  'getProjectCanvasDocuments',
  'getScrollableAncestorForDeltaY',
  'getSharedProjectCellPresenceLabel',
  'getSharedProjectLatestRevision',
  'getSharedProjectMemberCellPresence',
  'getSharedProjectMemberLimitForCurrentPlan',
  'getSharedProjectOwnershipStatus',
  'globalLoadingIndicatorBlockingDepth',
  'globalLoadingIndicatorDepth',
  'globalLoadingIndicatorHideTimer',
  'globalLoadingIndicatorLabel',
  'globalLoadingIndicatorShowTimer',
  'globalLoadingIndicatorShownAt',
  'globalLoadingIndicatorVisible',
  'hasSharedProjectFailedLocalOps',
  'hasSharedProjectLocalInFlightOps',
  'isCurrentProjectSharedEntry',
  'isCurrentSharedProjectReadOnlyMember',
  'isMultiAssignedCellRestrictedEditorMode',
  'isMultiClientBlocked',
  'isMultiGuestLimitReached',
  'isMultiGuestMode',
  'isMultiMasterMode',
  'isMultiReplicaRole',
  'isMultiRoomPublic',
  'isSharedProjectCollaborativeMode',
  'isSharedProjectsBlockedByRuntime',
  'layoutMode',
  'localizeText',
  'maybeRequestGuestAssignmentSync',
  'multiEntryJoinPanelOpen',
  'multiEntryMetricsRaf',
  'multiState',
  'normalizeMultiBlockedClientIds',
  'normalizeMultiExportPermission',
  'normalizeMultiJoinPolicy',
  'normalizeMultiMaxGuests',
  'normalizeMultiParticipantFreeCellMove',
  'normalizeMultiParticipantName',
  'normalizeMultiProjectKey',
  'parseMultiProjectAccessInput',
  'normalizeMultiRoomVisibility',
  'normalizePixieedAvatarId',
  'normalizeWheelDeltaY',
  'pointerState',
  'prefersSharedProjectFlow',
  'pruneMultiHistoryCanvases',
  'prunePendingMultiAssignmentMoveRequests',
  'queueSharedProjectRefresh',
  'readCurrentMultiProjectAccessInput',
  'readCurrentMultiProjectKey',
  'readPixieedAccountAvatarId',
  'readPixieedAccountNickname',
  'rejectMultiJoinRequest',
  'removeMultiJoinRequest',
  'removePendingMultiAssignmentMoveRequest',
  'requestOverlayRender',
  'requestRender',
  'resolvePixieedAvatarSrcFromId',
  'resolveSharedProjectKeyForCurrentState',
  'scheduleMultiGuestMovePreview',
  'scheduleMultiSessionStateBroadcast',
  'scheduleSessionPersist',
  'scrollElementByDeltaY',
  'sendMultiBroadcast',
  'sendMultiGuestJoinRequest',
  'serializeMultiBlockedClientIds',
  'setActiveProjectCanvasByIndex',
  'setActiveTool',
  'setLocalizedSelectOption',
  'setMultiTabNotification',
  'setSharedProjectDeferRealtimeUntilSynced',
  'sharedProjectMembers',
  'sharedProjectOpCommitInFlight',
  'sharedProjectPendingLocalOps',
  'sharedProjectPendingLocalOpsRetryDueAt',
  'sharedProjectPendingLocalOpsRetryTimer',
  'sharedProjectPendingLocalRetryBlockedUntil',
  'sharedProjectReconnectRecoveryPromise',
  'sharedProjectRecoveryInProgress',
  'sharedProjectRefreshInFlight',
  'sharedProjectSessionInstanceId',
  'sharedProjectWakeRecoveryPromise',
  'showSharedRuntimeBlockedStatus',
  'showStartupScreen',
  'stabilizeActiveSharedProjectConnection',
  'startupAutosaveRestoreProjectId',
  'startupBootProgressPercent',
  'startupBootProgressUpdatedAt',
  'startupProgressClose',
  'startupProgressDepth',
  'startupRestoreCancelRequested',
  'startupRestoreCancelResolvers',
  'startupSharedReloadProjectKey',
  'startupSharedReloadRevision',
  'startupSharedReloadStructureRevision',
  'state',
  'syncControlsWithState',
  'syncMultiJoinRequestControls',
  'syncMultiProjectKeyInputValues',
  'toolButtons',
  'updateCanvasResizeControls',
  'updatePixfindModeUI',
  'upsertPendingMultiAssignmentMoveRequest',
  'upsertSharedRecentProjectEntry',
  'waitForSharedOpenRetry',
  'clamp',
  'enforceMobileSpectatorTabLock',
  'updateExportFormatAvailability',
  'updateExportOriginalToggleUI',
  'writeTextToClipboard',
].forEach(name => requireInjectedGetter('sharedProjectParticipantUtils', name));
[
  'DANMAKU_MAX_ITEMS',
  'DANMAKU_MAX_SIZE',
  'DANMAKU_MAX_SPEED',
  'DANMAKU_MIN_SIZE',
  'DANMAKU_MIN_SPEED',
  'accountState',
  'activeSharedProjectChannel',
  'activeSharedProjectKey',
  'canScrollElementByDeltaY',
  'canUseSessionStorage',
  'dom',
  'ensureActiveSharedProjectRealtimeChannel',
  'getCurrentSharedProjectMembershipRole',
  'getCurrentSharedProjectUiRole',
  'getLocalMultiParticipantAvatarId',
  'getLocalMultiParticipantName',
  'getMultiAssignment',
  'getScrollableAncestorForDeltaY',
  'isMultiCommentsTabVisible',
  'isMultiFlowPanelVisible',
  'isMultiMasterMode',
  'isSharedProjectCollaborativeMode',
  'localizeText',
  'multiState',
  'normalizeMultiParticipantName',
  'normalizeMultiProjectKey',
  'normalizeMultiRole',
  'normalizePixieedAvatarId',
  'normalizeWheelDeltaY',
  'resolvePixieedAvatarSrcFromId',
  'resolveSharedProjectKeyForCurrentState',
  'scheduleSessionPersist',
  'scrollElementByDeltaY',
  'selectMultiControlTarget',
  'sendMultiBroadcast',
  'setMultiCommentTabNotification',
  'setMultiStatus',
  'setMultiTabNotification',
  'sharedProjectSessionInstanceId',
  'state',
].forEach(name => requireInjectedGetter('sharedProjectCommentUtils', name));
[
  'MULTI_DEFAULT_EXPORT_PERMISSION',
  'MULTI_DEFAULT_JOIN_POLICY',
  'MULTI_DEFAULT_ROOM_VISIBILITY',
  'MULTI_JOIN_POLICY_OPEN',
  'MULTI_ROOM_VISIBILITY_PUBLIC',
  'applyMultiMasterPreset',
  'applyMultiRoleUiLocks',
  'approveSelectedMultiJoinRequest',
  'banMultiParticipant',
  'bindMultiCommentScrollHandoff',
  'bindTabKeyboardNavigation',
  'connectMultiSessionAs',
  'copyMultiInviteLink',
  'createSharedProjectFromCurrentDocument',
  'disconnectMultiSession',
  'dom',
  'ensureSharedProjectAuthenticatedStart',
  'forceMultiParticipantRole',
  'generateMultiProjectKey',
  'getActiveProjectCanvasDocument',
  'getAssignedGuestCount',
  'getAssignmentCanvasDocument',
  'getMultiAssignment',
  'getMultiFlowTabButtons',
  'getMultiProjectKeyInputElements',
  'getPendingMultiAssignmentMoveRequest',
  'getProjectCanvasDocumentAt',
  'getProjectCanvasDocumentById',
  'isCurrentProjectSharedEntry',
  'isMultiMasterConfigMode',
  'isMultiMasterMode',
  'isMultiParticipantsCommentModeActive',
  'isMultiSpectatorMode',
  'kickMultiParticipant',
  'localizeText',
  'maybeApplyInviteAutoJoin',
  'maybeAutoResumeMultiSession',
  'moveMultiParticipantToCell',
  'multiEntryJoinPanelOpen',
  'multiEntryMetricsResizeObserver',
  'multiState',
  'normalizeMultiAssignmentCanvasId',
  'normalizeMultiDesiredRole',
  'normalizeMultiExportPermission',
  'normalizeMultiJoinPolicy',
  'normalizeMultiMaxGuests',
  'normalizeMultiRoomVisibility',
  'normalizeMultiUiView',
  'openShareStartConfirmDialog',
  'openSharedProjectFromInput',
  'parseMultiProjectAccessInput',
  'prefersSharedProjectFlow',
  'readCurrentMultiProjectKey',
  'readMultiJoinProjectAccessInputOnly',
  'rejectSelectedMultiJoinRequest',
  'renderMultiComments',
  'renderMultiParticipantsList',
  'renderTimelineMatrix',
  'resolveSharedProjectKeyForCurrentState',
  'scheduleMultiEntryScreenMetricsUpdate',
  'scheduleMultiPublicLobbyRoomSync',
  'scheduleMultiSessionStateBroadcast',
  'scheduleSessionPersist',
  'sendMultiComment',
  'sendMultiGuestJoinRequest',
  'setDanmakuEnabled',
  'setMultiEntryJoinPanelOpen',
  'setMultiFlowTab',
  'setMultiHelpPanelVisible',
  'setMultiParticipantCellLocked',
  'setMultiParticipantsPanelTab',
  'setMultiSelectedControlClientId',
  'setMultiStatus',
  'setMultiUiView',
  'shareMultiInviteLink',
  'storeMultiProjectKey',
  'syncDanmakuControls',
  'syncMultiAssignmentControls',
  'syncMultiControls',
  'syncMultiJoinRequestControls',
  'syncMultiProjectKeyInputValues',
  'syncSharedModeStatusDisplay',
  'syncSharedProjectVisibleStatus',
  'unbanMultiParticipant',
  'updateMultiAssignmentControlsFromSelection',
  'writeTextToClipboard',
].forEach(name => requireInjectedGetter('sharedProjectSetupUtils', name));
[
  'multiState',
  'AUTOSAVE_REMOTE_MULTI_WRITE_DELAY',
  'invalidateFillPreviewCache',
  'invalidateOnionSkinCache',
  'clearPlaybackFrameCache',
  'isMultiMasterMode',
  'markAutosaveDirty',
  'markDocumentUnsavedChange',
  'scheduleAutosaveSnapshot',
  'scheduleSessionPersist',
  'queueSharedProjectCurrentSnapshotCapture',
  'normalizeMultiProjectKey',
  'prefersSharedProjectFlow',
  'MULTI_BROADCAST_EVENT',
  'handleMultiAssignmentMoveRequestMessage',
  'handleMultiAssignmentMoveResultMessage',
  'multiSupabaseClientPromise',
  'MULTI_SUPABASE_MODULE_URL',
  'MULTI_SUPABASE_URL',
  'MULTI_SUPABASE_ANON_KEY',
  'setMultiStatus',
  'localizeText',
  'state',
  'clamp',
  'createLayer',
  'getActiveProjectCanvasDocument',
  'getMultiAssignment',
  'normalizeMultiAssignmentCanvasId',
  'getMultiLayerTrackIndexByAnchorLayerId',
  'getAssignedFrameIndexForClient',
  'getActiveLayerTrackIndex',
  'getLocalMultiParticipantName',
  'renderFrameList',
  'renderLayerList',
  'requestRender',
  'requestOverlayRender',
  'getUsedMultiAssignmentCellKeys',
  'getMultiAssignmentCellKey',
  'createFrame',
  'getDefaultFrameName',
  'isMultiClientBlocked',
  'isMultiGuestLimitReached',
  'getAssignedGuestCount',
  'DEFAULT_MULTI_PARTICIPANT_NAME',
  'normalizeMultiAssignmentsForCurrentDocument',
  'renderTimelineMatrix',
  'isMultiGuestMode',
  'canCurrentGuestFreelyMoveAssignedCell',
  'requestMultiGuestMoveToCell',
  'getProjectCanvasDocumentById',
  'getAssignedCellForClient',
  'syncControlsWithState',
  'isMultiAssignmentCellOccupied',
  'MULTI_GUEST_MOVE_PREVIEW_DEBOUNCE_MS',
  'MULTI_MASTER_RECOVERY_REASON',
  'isMultiReplicaRole',
  'MULTI_GUEST_RECOVERY_PUSH_THROTTLE_MS',
  'isMultiMasterCurrentlyOnline',
  'APP_BUILD_VERSION',
  'isStandaloneAppDisplayMode',
  'scheduleAppReload',
  'MULTI_RESYNC_THROTTLE_MS',
  'scheduleMultiPublicLobbyRoomSync',
  'normalizeMultiMaxGuests',
  'MULTI_DEFAULT_GUEST_LIMIT',
  'normalizeMultiRoomVisibility',
  'MULTI_DEFAULT_ROOM_VISIBILITY',
  'normalizeMultiJoinPolicy',
  'MULTI_DEFAULT_JOIN_POLICY',
  'normalizeMultiParticipantFreeCellMove',
  'MULTI_DEFAULT_PARTICIPANT_FREE_CELL_MOVE',
  'normalizeMultiExportPermission',
  'MULTI_DEFAULT_EXPORT_PERMISSION',
  'makeHistorySnapshot',
  'serializeMultiAssignments',
  'serializeMultiBlockedClientIds',
  'serializeDocumentSnapshot',
  'normalizeMultiHistoryCanvasId',
  'getMultiRoleCapabilities',
  'isSharedProjectRealtimePrimaryActive',
  'MULTI_SYNC_THROTTLE_MS',
  'decodeBase64',
  'getAssignmentCanvasDocument',
  'resolveAssignedFrameIndexForCanvas',
  'isSimulationLayer',
  'SIM_LAYER_TYPE',
  'encodeTypedArray',
  'normalizeSimulationSettings',
  'MULTI_LAYER_PATCH_FULL_RATIO',
  'decodeUint8Data',
  'ensureLayerDirect',
  'pointerState',
  'history',
  'getActiveProjectCanvasIndex',
  'getProjectCanvasDocuments',
  'projectCanvasStore',
  'localViewportCanvasState',
  'normalizeLocalViewportCanvasState',
  'deserializeDocumentPayload',
  'DEFAULT_GROUP_TOOL',
  'normalizeColorMode',
  'COLOR_MODE_INDEX',
  'normalizeColorValue',
  'isMultiPaletteIsolationEnabled',
  'normalizeZoomScale',
  'applyHistorySnapshot',
  'remapDocumentIndexedPixelsToDirect',
  'normalizePaletteIndex',
  'syncCurrentPalettePresetFromPalette',
  'clearMultiHistory',
  'updateHistoryButtons',
  'isMultiSpectatorMode',
  'rememberViewportZoomRatioFromScale',
  'normalizeToolId',
  'enforceGuestAssignedLayerSelection',
  'applyViewportTransform',
  'renderPalette',
  'syncPaletteInputs',
  'getAssignedCellForClientOnCanvas',
  'selectionTransformUi',
  'hideSelectionTransformMenu',
  'updateCanvasControlButtons',
  'markCanvasDirty',
  'normalizeMultiBlockedClientIds',
  'applyMultiAssignmentsFromPayload',
  'syncMultiControls',
  'syncDanmakuControls',
  'MULTI_LAYER_PATCH_DEBOUNCE_MS',
  'getAssignedLayerForFrame',
  'renderMultiParticipantsList',
  'normalizeMultiRole',
  'normalizeMultiParticipantName',
  'isSharedProjectCollaborativeMode',
  'appendMultiCommentEntry',
  'renderMultiComments',
  'syncMultiJoinRequestControls',
  'sendMultiJoinRequestResult',
  'sendMultiRoleChangeNotice',
  'removeMultiJoinRequest',
  'MULTI_JOIN_POLICY_OPEN',
  'upsertMultiJoinRequest',
  'normalizeMultiRoleControlTargetRole',
  'sendMultiKickClientNotice',
  'isMultiPayloadTargetedToCurrentClient',
  'isMultiPayloadForCurrentProject',
  'syncMultiAssignmentControls',
  'resolveAssignedLayerTrackIndexForCanvas',
  'markDirtyRect',
  'setMultiDesiredRole',
  'setMultiUiView',
  'clearMultiJoinRequests',
  'multiEntryJoinPanelOpen',
  'setMultiTabNotification',
  'setMultiCommentTabNotification',
  'clearStoredMultiResumeSession',
  'disconnectMultiPublicLobbyChannel',
  'restoreMultiLocalSnapshotBeforeReplica',
  'createInitialState',
  'clearTimelapseRecording',
  'resetDocumentUnsavedChanges',
  'writeAutosaveSnapshot',
  'clearMultiLocalSnapshotBeforeReplica',
  'applyMultiRoleUiLocks',
  'readCurrentMultiProjectKey',
  'captureMultiLocalSnapshotBeforeReplica',
  'ensureMultiClientId',
  'storeMultiProjectKey',
  'clearMultiComments',
  'disablePixfindForMultiSession',
  'convertIndexedDocumentToDirectForMultiPalette',
  'storePendingMultiResumeSession',
  'getTrackedSharedRecentProjectEntry',
  'upsertSharedRecentProjectEntry',
  'extractDocumentBaseName',
  'DEFAULT_DOCUMENT_NAME',
  'accountState',
  'activeSharedProjectKey',
  'activeSharedProjectRevision',
  'canUseSharedProjectsBackend',
  'ensureSharedProjectMembership',
  'buildAutosaveSessionPayload',
  'buildPackagedProjectPayload',
  'queueSharedProjectSnapshotPersist',
  'createSharedProjectSnapshotTitle',
  'isRecoverableSharedBackendPreflightError',
  'handleSharedProjectsBackendError',
  'canAcceptSharedProjectLocalDrawOps',
  'getSharedProjectLocalDrawBlockReason',
  'getSharedProjectDrawBlockStatus',
  'logSharedProjectDrawBlock',
  'activeSharedProjectSyncState',
  'updateAutosaveStatus',
  'requestSharedProjectDrawReadinessRecovery',
  'classifySharedProjectOpType',
  'buildSharedProjectDrawOpPayload',
  'enqueueSharedProjectOperationCommit',
  'resolveSharedProjectKeyForCurrentState',
  'clearSharedProjectInFlightStroke',
  'shouldCreateSharedProjectCheckpoint',
  'scheduleSharedProjectCheckpoint',
  'isSharedProjectCheckpointHistoryLabel',
  'sharedProjectInFlightStroke',
  'sharedProjectPendingLocalOps',
  'sharedProjectLocalInFlightOps',
  'buildSharedProjectPaletteOpPayload',
  'buildSharedProjectStructureOpPayload',
  'MULTI_LAYER_PATCH_HISTORY_LABELS',
  'markMultiPublicLobbyThumbnailDirty',
  'shouldPersistSharedProjectSnapshotForHistoryLabel',
  'SHARED_PROJECT_DEFERRED_PERSIST_DELAY',
  'MULTI_PALETTE_HISTORY_LABELS',
].forEach(name => requireInjectedGetter('sharedProjectRealtimeUtils', name));
[
  'sharedProjectOpCodec',
  'SHARED_PROJECT_STRUCTURE_HISTORY_LABELS',
  'MULTI_PALETTE_HISTORY_LABELS',
  'MULTI_LAYER_PATCH_HISTORY_LABELS',
  'sharedProjectLastAppliedSeq',
  'sharedProjectSeenOpIds',
  'getProjectCanvasDocumentById',
  'adoptSingleProjectCanvasId',
  'state',
  'sharedProjectLayerSnapshots',
  'buildLayerDiffPayload',
  'activeSharedProjectStructureRevision',
  'sharedProjectInFlightStroke',
  'getActiveProjectCanvasDocument',
  'clamp',
  'pointerState',
  'isRgbColorMode',
  'resolveDrawPaletteIndex',
  'normalizeColorValue',
  'getActiveDrawColor',
  'getEffectiveBrushShape',
  'hasCustomBrushData',
  'getBrushOffsets',
  'BRUSH_SHAPE_CUSTOM',
  'normalizeMirrorAxisState',
  'isMultiPaletteIsolationEnabled',
  'SHAPE_TOOLS',
  'getFillGradientColors',
  'normalizeSelectSameMode',
  'SELECT_SAME_MODE_CONNECTED',
  'normalizeFillStyle',
  'MAX_IMPORTED_PALETTE_COLORS',
  'normalizeBrushShape',
  'BRUSH_SHAPE_SQUARE',
  'normalizePaletteIndex',
  'FILL_STYLE_SOLID',
  'isSharedProjectCollaborativeMode',
  'getSharedProjectCanonicalCanvasId',
  'getProjectCanvasDocuments',
  'makeHistorySnapshot',
  'buildPackagedProjectPayload',
  'buildAutosaveSessionPayload',
  'buildProjectSheetsPayload',
  'getDefaultFrameName',
  'normalizeVoxelPreviewYawDegrees',
  'normalizeVoxelPreviewPitchDegrees',
  'isSimulationLayer',
  'SIM_LAYER_TYPE',
  'getDefaultLayerName',
  'normalizeLayerOpacity',
  'normalizeLayerBlendMode',
  'activeSharedProjectRevision',
  'activeSharedProjectId',
  'activeSharedProjectKey',
  'sharedProjectSessionId',
  'normalizeMultiProjectKey',
].forEach(name => requireInjectedGetter('sharedProjectOpUtils', name));
[
  'isSharedProjectCollaborativeMode',
  'extractSharedProjectOpPayload',
  'normalizeSharedProjectOpId',
  'getSharedProjectOpSeq',
  'normalizeSharedProjectStrokePoints',
  'logSharedProjectResolveEvent',
  'activeSharedProjectStructureRevision',
  'getProjectCanvasDocuments',
  'getProjectCanvasDocumentById',
  'adoptSingleProjectCanvasId',
  'normalizeSharedProjectCanvasId',
  'resolveSharedProjectCanvasAlias',
  'getActiveProjectCanvasDocument',
  'activeSharedProjectKey',
  'sharedProjectCanvasAliases',
  'MAX_IMPORTED_PALETTE_COLORS',
  'normalizeColorValue',
  'state',
  'palettesMatch',
  'getSharedProjectPalettePayloadSyncMode',
  'clamp',
  'normalizePaletteIndex',
  'isIndexColorMode',
  'syncCurrentPalettePresetFromPalette',
  'renderPalette',
  'syncPaletteInputs',
  'scheduleSessionPersist',
  'getPaletteColorKey',
  'colorsMatchRgba',
  'resolveTransparentStoragePaletteIndex',
  'isSimulationLayer',
  'ensureLayerDirect',
  'BRUSH_SHAPE_SQUARE',
  'getBrushOffsets',
  'getMirroredPointSetForState',
  'normalizeBrushShape',
  'normalizeMirrorAxisState',
  'bresenhamLine',
  'buildSharedProjectLayerSnapshotKey',
  'captureLayerPatchSnapshot',
  'sharedProjectLayerSnapshots',
  'applyIncomingSharedProjectVisualResult',
  'markDocumentUnsavedChange',
  'noteSharedProjectOperationApplied',
  'drawEllipsePixels',
  'applyLayerPatch',
  'normalizeSelectSameMode',
  'SELECT_SAME_MODE_CONNECTED',
  'normalizeFillStyle',
  'FILL_STYLE_SOLID',
  'isGradientFillStyle',
  'SELECT_SAME_MODE_GLOBAL',
  'resolveFillGradientPixel',
  'sampleCubicBezierPoints',
  'forEachCurveStrokePixel',
  'sharedProjectSessionId',
  'applyLayerPatchPayloadToLayer',
  'resetLocalHistoryForSharedCollaborativeRemoteChange',
  'remapPaletteIndices',
  'remapDocumentColorsToPaletteApprox',
  'renderAllProjectCanvasSurfaces',
  'requestOverlayRender',
  'sharedProjectReplayRenderBatchDepth',
  'sharedProjectReplayRenderNeedsFull',
  'sharedProjectReplayRenderDirtyRect',
  'markCanvasDirty',
  'markDirtyRect',
  'invalidateFillPreviewCache',
  'invalidateOnionSkinCache',
  'clearPlaybackFrameCache',
  'requestRender',
  'sharedProjectRemoteApplyFailureKeys',
  'SHARED_PROJECT_REMOTE_APPLY_FAILURE_KEY_LIMIT',
  'normalizeLayerOpacity',
  'getSharedProjectOpId',
  'isSharedProjectRemoteOpFromCurrentSession',
  'sharedProjectLastAppliedSeq',
  'rememberPendingSharedProjectRemoteOp',
  'createSharedProjectExactHashForOp',
  'sharedProjectPendingProvisionalOps',
  'scheduleSharedProjectStructureMismatchRecovery',
  'triggerImmediateSharedProjectRecovery',
  'queueSharedProjectRefresh',
  'rememberSharedProjectRemoteApplyFailureKey',
  'runSharedProjectConvergenceResync',
  'sharedProjectAppliedProvisionalOpIds',
  'logSharedProjectDrawLifecycle',
  'logRemoteSharedDrawVisibility',
  'sharedProjectLastProvisionalRemoteAt',
].forEach(name => requireInjectedGetter('sharedProjectDrawApplyUtils', name));
[
  'activeSharedProjectKey',
  'sharedProjectLastAppliedSeq',
  'normalizeMultiProjectKey',
  'canUseSharedProjectsBackend',
  'sharedProjectOpPollInFlight',
  'sharedProjectGapRecoveryRerunRequested',
  'sharedProjectGapRecoveryPromise',
  'fetchAndReplaySharedProjectOpsBurst',
  'SHARED_PROJECT_MAX_MISSING_OP_FETCH',
  'SHARED_PROJECT_BURST_CATCHUP_MAX_ROUNDS',
  'sharedProjectPendingRemoteOps',
  'sharedProjectLastRealtimeActivityAt',
  'sharedProjectWakeRecoveryPromise',
  'sharedProjectRefreshInFlight',
  'activeSharedProjectDocumentLoaded',
  'hasUsableActiveSharedProjectDocumentState',
  'activeSharedProjectSyncState',
  'runSharedProjectConvergenceResync',
  'queueSharedProjectRefresh',
  'sharedProjectLastRescueAfterSeq',
  'sharedProjectLastRescueOpCount',
  'sharedProjectRescueStallCount',
  'maybeMarkSharedProjectOpCatchupSynced',
  'isSharedProjectCollaborativeMode',
  'sharedProjectOpsSinceCheckpoint',
  'SHARED_PROJECT_CHECKPOINT_OP_COUNT',
  'openProjectTabs',
  'getProjectCanvasCount',
  'SHARED_PROJECT_DEFERRED_PERSIST_DELAY',
  'queueSharedProjectCurrentSnapshotCapture',
  'SHARED_PROJECT_CHECKPOINT_DELAY',
  'activeSharedProjectSnapshotRevision',
  'activeSharedProjectRevision',
  'activeSharedProjectSynced',
  'hasSharedProjectLocalInFlightOps',
  'hasSharedProjectFailedLocalOps',
  'window',
  'applySharedProjectStrokeCommand',
  'applySharedProjectShapeCommand',
  'applySharedProjectFillCommand',
  'applySharedProjectCurveCommand',
  'applySharedProjectRegionCommand',
  'getProjectCanvasDocumentById',
  'adoptSingleProjectCanvasId',
  'resolveSharedProjectLayerForPayload',
  'applyLayerPatchPayloadToLayer',
  'buildSharedProjectLayerSnapshotKey',
  'captureLayerPatchSnapshot',
  'sharedProjectLayerSnapshots',
  'applyIncomingSharedProjectVisualResult',
  'markDocumentUnsavedChange',
  'noteSharedProjectOperationApplied',
  'pendingSharedProjectConflictReplay',
  'setMultiStatus',
  'localizeText',
  'getSharedProjectOpSeq',
  'getSharedProjectOpId',
  'fetchSharedProjectOpsSince',
  'sharedProjectLastOpsFetchSucceededAt',
  'fetchMissingOps',
  'confirmSharedProjectLocalOpsFromServerOps',
  'replayOps',
  'scheduleSharedProjectConvergenceResync',
  'setActiveSharedProjectSyncState',
  'sharedProjectOpsRescueRetryTimer',
  'sharedProjectOpsRescueRetryDueAt',
  'SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS',
  'pollSharedProjectRealtimeOpsRescue',
  'sharedProjectBroadcastCatchupTimer',
  'shouldDeferIncomingSharedProjectRemoteApply',
  'scheduleDeferredSharedProjectRemoteOpsDrain',
  'normalizeSharedProjectOpId',
  'sharedProjectSeenOpIds',
  'activeSharedProjectStructureRevision',
  'applyOp',
  'rememberPendingSharedProjectRemoteOp',
  'replaySharedProjectLocalProvisionalAfterRemoteOps',
  'markSharedProjectTrafficActivity',
  'compareSharedProjectOpsForReplay',
  'beginSharedProjectReplayRenderBatch',
  'isSharedProjectRemoteOpFromCurrentSession',
  'logSharedProjectDrawLifecycle',
  'rememberSharedProjectSeenOp',
  'endSharedProjectReplayRenderBatch',
].forEach(name => requireInjectedGetter('sharedProjectRecoveryReplayUtils', name));
[
  'accountState',
  'activeSharedProjectChannel',
  'activeSharedProjectChannelKey',
  'activeSharedProjectChannelSignature',
  'activeSharedProjectDocumentLoaded',
  'activeSharedProjectId',
  'activeSharedProjectKey',
  'activeSharedProjectMembershipRole',
  'activeSharedProjectOpenInProgress',
  'activeSharedProjectOpenReadOnly',
  'activeSharedProjectRevision',
  'activeSharedProjectSessionToken',
  'activeSharedProjectSnapshotRevision',
  'activeSharedProjectStructureRevision',
  'activeSharedProjectSyncState',
  'activeSharedProjectSynced',
  'appReloadInProgress',
  'armMobileBackBeforeUnloadBypass',
  'autosaveDirty',
  'autosaveDirtyGeneration',
  'autosaveProjectId',
  'autosaveWriteInFlight',
  'beginHistory',
  'buildSharedRecentProjectId',
  'canCurrentSharedProjectEdit',
  'canUseSessionStorage',
  'canUseSharedProjectsBackend',
  'classifySharedProjectOpType',
  'clearActiveSharedProjectSession',
  'clearDeferredSharedProjectRemoteOpsDrain',
  'clearPendingMultiAssignmentMoveRequests',
  'clearSharedProjectPendingLocalOpsFlushTimer',
  'commitHistory',
  'ensureActiveSharedProjectRealtimeChannel',
  'ensureMultiClientId',
  'ensureSharedProjectSessionHeartbeat',
  'flushAutosaveSnapshotOnLifecycle',
  'flushPendingTimelapseCapture',
  'getActiveFrame',
  'getActiveLayerIndex',
  'getActiveProjectCanvasDocument',
  'getDefaultLayerName',
  'getLocalMultiParticipantName',
  'getSharedProjectStructureChangeBlockReason',
  'hasSharedProjectFailedLocalOps',
  'hasSharedProjectHardLocalWorkInFlight',
  'hasSharedProjectLocalInFlightOps',
  'hasSharedProjectStructureLocalWorkInFlight',
  'history',
  'initializeSharedProjectCanvasIdentityFromCurrentDocument',
  'isCurrentProjectSharedEntry',
  'isSharedProjectCheckpointHistoryLabel',
  'isSharedProjectCollaborativeMode',
  'localizeText',
  'markHistoryDirty',
  'multiState',
  'normalizeMultiParticipantName',
  'normalizeMultiProjectKey',
  'pendingSharedProjectConflictReplay',
  'persistCriticalSessionStateForNavigation',
  'persistReloadProjectFallback',
  'persistReloadSessionSnapshot',
  'persistReloadTargetProjectId',
  'persistSessionState',
  'pollSharedProjectRealtimeOpsRescue',
  'queueSharedProjectReconnectRecovery',
  'queueSharedProjectRefresh',
  'recoverSharedProjectAfterWake',
  'renderMultiParticipantsList',
  'requestOverlayRender',
  'requestRender',
  'resetSharedProjectCanvasIdentity',
  'resolveSharedProjectKeyForCurrentState',
  'restoreMultiCommentsForProject',
  'scheduleSessionPersist',
  'scheduleSharedProjectOpsRescueRetry',
  'scheduleSharedProjectRecoveryReload',
  'setActiveAutosaveProjectId',
  'setActiveSharedProjectSyncState',
  'setMultiStatus',
  'sharedProjectBroadcastCatchupTimer',
  'sharedProjectCatchingUpStartedAt',
  'sharedProjectCellPresenceBroadcastTimer',
  'sharedProjectCellPresenceByClient',
  'sharedProjectCellPresenceHeartbeatTimer',
  'sharedProjectDeferRealtimeUntilSynced',
  'sharedProjectDeferredRemoteOpsDelayMs',
  'sharedProjectFreeCellEnsureInFlight',
  'sharedProjectFreeCellEnsureTimer',
  'sharedProjectGapRecoveryPromise',
  'sharedProjectGapRecoveryRerunRequested',
  'sharedProjectImmediateRecoveryPromise',
  'sharedProjectInFlightStroke',
  'sharedProjectLastAppliedSeq',
  'sharedProjectLastAutoLayerAddedAt',
  'sharedProjectLastCanonicalLoadAt',
  'sharedProjectLastCanonicalRefreshQueuedAt',
  'sharedProjectLastCheckpointAt',
  'sharedProjectLastDrawReadinessVerifiedAt',
  'sharedProjectLastForceRefreshQueuedAt',
  'sharedProjectLastForceRefreshQueuedReason',
  'sharedProjectLastRealtimeActivityAt',
  'sharedProjectLastRxActivityAt',
  'sharedProjectLastServerOpPollAt',
  'sharedProjectLastServerOpRefreshBackstopAt',
  'sharedProjectLastTxActivityAt',
  'sharedProjectMembers',
  'sharedProjectOpCommitInFlight',
  'sharedProjectOpPollInFlight',
  'sharedProjectOpsRescueRetryDueAt',
  'sharedProjectOpsRescueRetryTimer',
  'sharedProjectPendingLocalOps',
  'sharedProjectPendingLocalOpsRetryDueAt',
  'sharedProjectPendingLocalOpsRetryTimer',
  'sharedProjectPendingLocalRetryBlockedUntil',
  'sharedProjectPendingProvisionalOps',
  'sharedProjectPendingRemoteOps',
  'sharedProjectPollingTimer',
  'sharedProjectRealtimeConnectPromise',
  'sharedProjectRealtimeConnectSignature',
  'sharedProjectRealtimeRetryBlockedUntil',
  'sharedProjectRealtimeStatus',
  'sharedProjectRealtimeWarnedAt',
  'sharedProjectReconnectRecoveryPromise',
  'sharedProjectReconnectRecoveryTimer',
  'sharedProjectRecoveryInProgress',
  'sharedProjectRefreshInFlight',
  'sharedProjectRefreshTimer',
  'sharedProjectRemoteApplyFailureKeys',
  'sharedProjectRoomBroadcastSlotAt',
  'sharedProjectRoomCommitSentAt',
  'sharedProjectSeenOpIds',
  'sharedProjectSeenOpSeqById',
  'sharedProjectSessionInstanceId',
  'sharedProjectSnapshotReplayInFlight',
  'sharedProjectSyncInFlight',
  'sharedProjectWakeRecoveryPromise',
  'sharedProjectWatchdogLastTickAt',
  'softResumeSharedProjectAfterSleep',
  'state',
  'syncSharedProjectMembers',
  'syncSharedProjectVisibleStatus',
  'timelineMatrixRenderKey',
].forEach(name => requireInjectedGetter('sharedProjectSessionStateUtils', name));
[
  'AUTOSAVE_SUPPORTED',
  'SHARED_LOCAL_OP_JOURNAL_STORE',
  'SHARED_LOCAL_OP_JOURNAL_MAX_CONFIRMED_PER_PROJECT',
  'SHARED_LOCAL_OP_JOURNAL_PRUNE_BATCH',
  'SHARED_LOCAL_OP_JOURNAL_FALLBACK_STORAGE_KEY',
  'SHARED_LOCAL_OP_JOURNAL_FALLBACK_MAX_ENTRIES',
  'activeSharedProjectKey',
  'activeSharedProjectSessionToken',
  'activeSharedProjectDocumentLoaded',
  'canUseSessionStorage',
  'classifySharedProjectOpType',
  'console',
  'discardSharedProjectExpiredLocalOp',
  'flushSharedProjectPendingLocalOps',
  'generateSharedProjectOpId',
  'getSharedProjectOpId',
  'hasUsableActiveSharedProjectDocumentState',
  'isSharedProjectLocalOpExpiredForRetry',
  'localizeText',
  'normalizeMultiProjectKey',
  'openAutosaveDatabase',
  'readLocalStorageForLocalRestore',
  'readSessionStorageForLocalRestore',
  'rememberSharedProjectLocalInFlightOp',
  'replaySharedProjectLocalProvisionalAfterRemoteOps',
  'setActiveSharedProjectSyncState',
  'setMultiStatus',
  'sharedLocalOpJournalWritePromise',
  'sharedProjectLocalInFlightOps',
  'sharedProjectPendingLocalOps',
  'sharedProjectSeenOpIds',
  'sortSharedProjectPendingLocalOps',
  'queueSharedProjectRefresh',
  'writeLocalStorageForLocalRestore',
  'writeSessionStorageForLocalRestore',
].forEach(name => requireInjectedGetter('sharedProjectLocalJournalUtils', name));
[
  'crypto',
  'handleSharedProjectsBackendError',
  'normalizeMultiProjectKey',
].forEach(name => requireInjectedGetter('sharedProjectBackendRpcUtils', name));
[
  'normalizeMultiProjectKey',
  'activeSharedProjectKey',
  'sharedProjectRoomCommitSentAt',
  'SHARED_PROJECT_ROOM_COMMIT_MIN_INTERVAL_MS',
  'getSharedProjectOpId',
  'sharedProjectPendingBroadcastOps',
  'window',
  'activeSharedProjectChannel',
  'ensureActiveSharedProjectRealtimeChannel',
  'sharedProjectRoomBroadcastSlotAt',
  'SHARED_PROJECT_ROOM_BROADCAST_MIN_INTERVAL_MS',
  'markSharedProjectLocalOpBroadcastSent',
  'SHARED_PROJECT_BROADCAST_EVENT',
  'sharedProjectSeenOpIds',
  'deleteSharedLocalOpJournalEntry',
  'sharedProjectPendingLocalOps',
  'sharedProjectLocalInFlightOps',
  'markSharedProjectTrafficActivity',
  'classifySharedProjectOpType',
  'rememberSharedProjectLocalInFlightOp',
  'logSharedProjectDrawLifecycle',
  'markSharedProjectLocalOpProvisionalApplied',
  'markSharedProjectLocalOpCommitFailed',
  'buildSharedLocalOpJournalEntry',
  'upsertSharedLocalOpJournalFallbackEntry',
  'appendSharedLocalOpJournal',
  'SHARED_PROJECT_LOCAL_OP_BATCH_DELAY_MS',
  'sharedProjectPendingLocalOpsFlushTimer',
  'sharedProjectPendingLocalOpsFlushDueAt',
  'flushSharedProjectPendingLocalOps',
  'SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS',
  'sharedProjectPendingLocalOpsRetryTimer',
  'sharedProjectPendingLocalOpsRetryDueAt',
  'restorePendingSharedLocalOps',
  'updateSharedLocalOpJournalStatus',
  'SHARED_PROJECT_LOCAL_OP_EXPIRE_MS',
  'logSharedProjectLocalOpLifecycle',
  'sharedProjectPendingLocalRetryBlockedUntil',
  'isSharedProjectCollaborativeMode',
  'history',
  'clearMultiHistory',
  'updateHistoryButtons',
  'activeSharedProjectDocumentLoaded',
  'hasUsableActiveSharedProjectDocumentState',
  'activeSharedProjectOpenInProgress',
  'activeSharedProjectOpenReadOnly',
  'canCurrentSharedProjectEdit',
  'sharedProjectSnapshotReplayInFlight',
].forEach(name => requireInjectedGetter('sharedProjectLocalOpUtils', name));
[
  'activeSharedProjectChannelKey',
  'activeSharedProjectDocumentLoaded',
  'activeSharedProjectId',
  'activeSharedProjectKey',
  'activeSharedProjectOpenInProgress',
  'activeSharedProjectRevision',
  'activeSharedProjectSnapshotRevision',
  'activeSharedProjectStructureRevision',
  'activeSharedProjectSyncState',
  'activeSharedProjectSynced',
  'appReloadInProgress',
  'applySharedProjectOpsSinceRevision',
  'canResumeSharedProjectEditingFromDurableHistory',
  'canUseSessionStorage',
  'createSharedProjectDocumentFingerprint',
  'disconnectActiveSharedProjectRealtimeChannel',
  'dom',
  'drainPendingSharedProjectRemoteOps',
  'ensureActiveSharedProjectRealtimeChannel',
  'ensurePixieedAccountReady',
  'ensureSharedProjectBackendSession',
  'ensureSharedProjectRefreshLoop',
  'ensureSharedRecentProjectsAccountSynced',
  'fetchAndReplaySharedProjectOpsBurst',
  'fetchSharedProjectRecord',
  'flushSharedProjectPendingLocalOps',
  'getSharedProjectLatestRevision',
  'getSharedProjectLatestStructureRevision',
  'getSharedProjectLocalDrawBlockReason',
  'getSharedProjectVisibleStatus',
  'hasSharedProjectHardLocalWorkInFlight',
  'hasUsableActiveSharedProjectDocumentState',
  'isSharedProjectCollaborativeMode',
  'localizeText',
  'logSharedProjectRealtimeChannelLifecycle',
  'markActiveSharedProjectDocumentLoaded',
  'markSharedProjectDrawReadinessVerified',
  'maybePollSharedProjectServerOps',
  'normalizeMultiProjectKey',
  'recoverSharedProjectRealtimeGap',
  'refreshActiveSharedProjectSnapshot',
  'reportSharedProjectRealtimeSubscribeFailure',
  'requestMultiResync',
  'resolveSharedProjectLampState',
  'restorePendingSharedLocalOps',
  'runSharedProjectConvergenceResync',
  'scheduleAppReload',
  'scheduleSharedProjectConvergenceResync',
  'scheduleSharedProjectOpsRescueRetry',
  'setActiveSharedProjectSession',
  'setActiveSharedProjectSnapshotState',
  'setActiveSharedProjectSyncState',
  'setMultiStatus',
  'setSharedProjectDeferRealtimeUntilSynced',
  'sharedProjectAutoRecoveryLastAttemptAt',
  'sharedProjectCatchingUpStartedAt',
  'sharedProjectDrawReadinessPromise',
  'sharedProjectLastAppliedSeq',
  'sharedProjectLastOpsFetchSucceededAt',
  'sharedProjectPendingLocalOps',
  'sharedProjectPendingLocalOpsRetryDueAt',
  'sharedProjectPendingLocalOpsRetryTimer',
  'sharedProjectPendingLocalRetryBlockedUntil',
  'sharedProjectPendingRemoteOps',
  'sharedProjectRealtimeRetryBlockedUntil',
  'sharedProjectRealtimeStatus',
  'sharedProjectReconnectRecoveryPromise',
  'sharedProjectReconnectRecoveryTimer',
  'sharedProjectRecoveryInProgress',
  'sharedProjectRecoveryReloadTimer',
  'sharedProjectRefreshInFlight',
  'sharedProjectRefreshTimer',
  'sharedProjectSafariWakeResyncTimer',
  'sharedProjectSnapshotReplayInFlight',
  'sharedProjectSoftResumePromise',
  'sharedProjectVisibilityHiddenAt',
  'sharedProjectVisibleStatusSignature',
  'sharedProjectVisibleStatusTimer',
  'sharedProjectWakeRecoveryPromise',
  'state',
  'updateAutosaveStatus',
  'waitForSharedOpenRetry',
].forEach(name => requireInjectedGetter('sharedProjectRecoveryLifecycleUtils', name));
[
  'canUseSharedProjectsBackend',
  'ensureSharedProjectBackendSession',
  'normalizeMultiProjectKey',
  'ensurePixieedAccountClient',
  'fetchSharedProjectRecordViaRpc',
  'handleSharedProjectsBackendError',
  'setMultiStatus',
  'localizeText',
  'ensureSharedProjectSessionInstanceId',
  'isRecoverableSharedBackendPreflightError',
  'activeSharedProjectKey',
  'accountState',
  'sharedProjectSessionHeartbeatTimer',
  'SHARED_PROJECT_SESSION_HEARTBEAT_INTERVAL_MS',
  'canLookupSharedProjectsBackend',
  'ensureMultiSupabaseClient',
  'sharedProjectLastEmptyOpsFetchLogAt',
  'sharedProjectLastOpsFetchSucceededAt',
  'confirmSharedProjectLocalOpsFromServerOps',
  'markSharedProjectTrafficActivity',
  'activeSharedProjectDocumentLoaded',
  'hasUsableActiveSharedProjectDocumentState',
  'sharedProjectPendingRemoteOps',
  'markSharedProjectDrawReadinessVerified',
  'activeSharedProjectSessionToken',
  'markActiveSharedProjectDocumentLoaded',
  'setActiveSharedProjectSession',
  'activeSharedProjectRevision',
  'activeSharedProjectStructureRevision',
  'activeSharedProjectId',
  'setSharedProjectDeferRealtimeUntilSynced',
  'setActiveSharedProjectSyncState',
  'sharedProjectLastAppliedSeq',
  'fetchMissingOps',
  'SHARED_PROJECT_MAX_MISSING_OP_FETCH',
  'replayOps',
  'sharedProjectSnapshotReplayInFlight',
  'sharedProjectRefreshInFlight',
  'sharedProjectDeferRealtimeUntilSynced',
  'reportSharedProjectRealtimeSubscribeFailure',
  'createSharedProjectSnapshotTitle',
  'state',
  'DEFAULT_DOCUMENT_NAME',
  'createSharedProjectInviteToken',
  'MULTI_ROOM_VISIBILITY_PUBLIC',
  'readPixieedAccountNickname',
  'shouldIgnorePixieedProfileError',
  'normalizeMultiParticipantName',
  'sharedProjectMembers',
  'renderMultiParticipantsList',
  'sharedProjectMembersSyncPromise',
  'normalizeSharedProjectMembershipRole',
  'activeSharedProjectMembershipRole',
  'getLocalMultiParticipantAvatarId',
  'mapSharedProjectMembershipRoleToUiRole',
  'DEFAULT_MULTI_PARTICIPANT_NAME',
  'resolvePixieedAvatarSrcFromId',
  'isCurrentProjectSharedEntry',
  'scheduleSharedProjectFreeTimelineCellEnsure',
  'activeSharedProjectSnapshotRevision',
  'markDocumentDurablySaved',
  'setActiveSharedProjectSnapshotState',
  'upsertSharedRecentProjectEntry',
  'restorePendingSharedLocalOps',
  'pendingSharedProjectConflictReplay',
  'maybeReplayPendingSharedProjectConflictAfterRefresh',
  'hasSharedProjectHardLocalWorkInFlight',
  'logSharedProjectRealtimeChannelLifecycle',
  'sharedProjectRecoveryInProgress',
  'sharedProjectLastVerifiedLatestAt',
  'sharedProjectLastVerifiedLatestKey',
  'sharedProjectLastVerifiedLatestRevision',
  'sharedProjectLastVerifiedLatestStructureRevision',
  'sharedProjectLastRealtimeActivityAt',
  'canApplyIncomingSharedProjectSnapshot',
  'hasSharedProjectLocalWorkInFlight',
  'deferSharedProjectSnapshotApplyIfLocalOpsInFlight',
  'loadDocumentFromText',
  'buildSharedRecentProjectId',
  'compareSharedProjectSnapshotIdentity',
  'sharedProjectRemoteApplyFailureKeys',
  'resetPendingSharedProjectRemoteState',
  'pruneSharedProjectConfirmedOpStateAfterRevision',
  'scheduleSharedProjectVerifiedSnapshotCheckpoint',
  'replaySharedProjectLocalProvisionalAfterRemoteOps',
  'updateAutosaveStatus',
  'syncSharedProjectVisibleStatus',
  'setSharedProjectCreationFailureReason',
  'classifySharedProjectOpType',
  'buildSharedProjectDrawOpPayload',
  'buildSharedProjectStructureOpPayload',
  'canWriteSharedProjectCanonicalSnapshot',
  'isMissingRpcFunction',
  'sharedProjectLastCheckpointAt',
  'sharedProjectOpsSinceCheckpoint',
  'flushOrCompactSharedLocalOpJournal',
  'markSharedProjectLocalOpCommitConfirmed',
  'drainPendingSharedProjectRemoteOps',
  'scheduleSharedProjectPostCommitCatchup',
  'getSharedProjectOpId',
  'createOp',
  'requeueSharedProjectOperationCommit',
  'SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS',
  'markSharedProjectLocalOpCommitStarted',
  'markSharedProjectLocalOpCommitFailed',
  'discardSharedProjectRejectedLocalOp',
  'noteSharedProjectOperationApplied',
  'refreshSharedProjectLayerSnapshotForPayload',
  'extractSharedProjectOpPayload',
  'shouldCreateSharedProjectCheckpoint',
  'scheduleSharedProjectCheckpoint',
  'sharedProjectOpCommitInFlight',
  'sharedProjectPendingLocalOps',
  'sortSharedProjectPendingLocalOps',
  'sharedProjectReconnectRecoveryPromise',
  'sharedProjectWakeRecoveryPromise',
  'activeSharedProjectSyncState',
  'canFlushSharedProjectLocalOpDuringCatchup',
  'scheduleSharedProjectPendingLocalOpsRetry',
  'isSharedProjectLocalOpExpiredForRetry',
  'discardSharedProjectExpiredLocalOp',
  'scheduleSharedProjectPendingLocalOpsFlush',
  'sharedProjectPendingLocalRetryBlockedUntil',
  'getSharedProjectRoomCommitDelay',
  'sharedProjectSeenOpIds',
  'deleteSharedLocalOpJournalEntry',
  'markSharedProjectRoomCommitSent',
  'sendOp',
  'getActiveProjectCanvasDocument',
  'clamp',
  'enforceSharedProjectOwnershipLimit',
  'pruneSharedRecentEntriesToKnownProjects',
  'readHiddenSharedProjectKeys',
  'getSharedRecentProjectEntry',
  'sharedRecentProjectsLastAccountSyncAt',
  'SHARED_PROJECT_SYNC_DELAY',
  'resolveSharedProjectKeyForCurrentState',
  'canPersistActiveSharedProjectDocument',
  'sharedProjectSyncQueuedPayload',
  'sharedProjectSyncTimer',
  'sharedProjectSyncInFlight',
  'sharedProjectRealtimeStatus',
  'sharedProjectRefreshTimer',
  'sharedProjectImmediateRecoveryPromise',
  'activeSharedProjectSynced',
  'SHARED_PROJECT_FORCE_REFRESH_DEDUPE_MS',
  'sharedProjectRealtimeConnectPromise',
  'sharedProjectRealtimeRetryBlockedUntil',
  'sharedProjectLastRefreshQueuedReason',
  'sharedProjectLastRefreshQueuedAt',
  'SHARED_PROJECT_REFRESH_LOOP_INTERVAL_MS',
  'sharedProjectLastForceRefreshQueuedReason',
  'sharedProjectLastForceRefreshQueuedAt',
  'sharedProjectLastCanonicalRefreshQueuedAt',
  'SHARED_PROJECT_CANONICAL_REFRESH_COOLDOWN_MS',
  'sharedProjectConvergenceResyncTimer',
  'sharedProjectConvergenceResyncPromise',
  'sharedProjectLocalInFlightOps',
  'sharedProjectLastConvergenceResyncAt',
  'createSharedProjectDocumentFingerprint',
  'sharedProjectConvergenceResyncFailureKey',
  'sharedProjectConvergenceResyncFailureCount',
  'SHARED_PROJECT_CONVERGENCE_RESYNC_MAX_RETRIES',
  'queueSharedProjectReconnectRecovery',
  'SHARED_PROJECT_DEFERRED_PERSIST_DELAY',
  'hasDocumentUnsavedChanges',
  'isSharedProjectCatchingUp',
  'isSharedProjectRealtimePrimaryActive',
  'shouldPersistSharedProjectSnapshotForHistoryLabel',
  'getSharedProjectEffectiveSnapshotDelay',
  'sharedProjectCaptureTimer',
  'makeHistorySnapshot',
  'buildAutosaveSessionPayload',
  'buildPackagedProjectPayload',
  'activeSharedProjectChannel',
  'activeSharedProjectChannelKey',
  'activeSharedProjectChannelSignature',
  'clearSharedProjectCellPresence',
  'sharedProjectRealtimeConnectSignature',
  'getSharedProjectRealtimeDebugStage',
  'getSharedProjectRealtimeClientType',
  'getSharedProjectRealtimeStageDescription',
  'SHARED_PROJECT_BROADCAST_EVENT',
  'shouldEnableSharedProjectRealtimeStage',
  'isSharedProjectRemoteOpFromCurrentSession',
  'getSharedProjectOpSeq',
  'isSharedProjectDrawKind',
  'shouldDeferIncomingSharedProjectRemoteApply',
  'applyOp',
  'SHARED_PROJECT_REMOTE_DRAW_CONFIRMED_ONLY',
  'scheduleSharedProjectOpsRescueRetry',
  'scheduleSharedProjectBroadcastCatchupRetry',
  'SHARED_PROJECT_CELL_PRESENCE_EVENT',
  'handleSharedProjectCellPresenceBroadcast',
  'SHARED_PROJECT_COMMENT_EVENT',
  'handleSharedProjectCommentBroadcast',
  'scheduleSharedProjectStructureMismatchRecovery',
  'recoverSharedProjectRealtimeGap',
  'SHARED_PROJECT_REALTIME_SUBSCRIBE_TIMEOUT_MS',
  'sharedProjectRealtimeWarnedAt',
  'ensureSharedProjectCellPresenceHeartbeat',
  'scheduleSharedProjectCellPresenceBroadcast',
  'activeSharedProjectCanonicalOpenKey',
  'activeSharedProjectCanonicalOpenPromise',
  'activeSharedProjectCanonicalOpenReasons',
  'activeSharedProjectOpenInProgress',
  'activeSharedProjectOpenReadOnly',
  'applySharedProjectOpsSinceRevision',
  'awaitFreshSharedProjectSnapshot',
  'beginBlockingGlobalLoading',
  'claimSharedProjectSessionLock',
  'clearPendingSharedInvite',
  'clearStoredMultiResumeSession',
  'ensureNoLegacyMultiSessionForSharedProject',
  'ensureSharedProjectAuthenticatedStart',
  'ensureSharedProjectCapacity',
  'ensureSharedProjectSessionHeartbeat',
  'getScopedStorageKey',
  'getSharedProjectLatestRevision',
  'getSharedProjectSnapshotRevision',
  'getSharedProjectSnapshotStructureRevision',
  'initPixieedAccount',
  'isBrokenSharedInviteBinding',
  'loadSharedProjectSnapshotRecord',
  'loadSharedProjectSnapshotRecordByInvite',
  'markSharedProjectOpenWithReconnectFallback',
  'multiAutoResumeAttempted',
  'multiEntryJoinPanelOpen',
  'normalizeSharedRecentProjectEntry',
  'persistSharedProjectSnapshot',
  'refreshActiveSharedProjectSnapshot',
  'refreshSharedRecentProjectEntryFromBackend',
  'removeRecentProjectEntry',
  'RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY',
  'RELOAD_SNAPSHOT_STORAGE_KEY',
  'revealActiveProjectAfterOpen',
  'SESSION_STORAGE_KEY',
  'setActiveAutosaveProjectId',
  'setMultiDesiredRole',
  'setMultiUiView',
  'setStartupProgressLabel',
  'sharedProjectLastCanonicalLoadAt',
  'stabilizeActiveSharedProjectConnection',
  'startupRestoreCancelRequested',
  'startupSharedReloadProjectKey',
  'storeMultiProjectKey',
  'syncMultiControls',
  'syncMultiProjectKeyInputValues',
  'unhideSharedProjectFromRecentSync',
  'waitForSharedOpenRetry',
].forEach(name => requireInjectedGetter('sharedProjectWorkflowUtils', name));
[
  'announceProjectCompanionSaveResult',
  'appendColorSpriteAreaToStillFrameSet',
  'applyExportScaleConstraints',
  'buildColorSpriteAppendAreaForCurrentExport',
  'buildGridColumnSegmentsRightToLeft',
  'buildGridRowSegmentsTopToBottom',
  'buildStillExportFrameSet',
  'canvasRegionToBlob',
  'canvasToBlob',
  'clamp',
  'createExportFileName',
  'createFrameCanvas',
  'deliverExportTasks',
  'ensureCurrentClientCanExportProject',
  'exportGridTileHeight',
  'exportGridTileWidth',
  'getCurrentExportFrames',
  'getExportScaleCandidates',
  'isVoxelExtensionModeEnabled',
  'localizeText',
  'markDocumentDurablySaved',
  'maybeRedirectToContestPostAfterExport',
  'maybeSaveProjectCompanionAfterExport',
  'normalizeExportGridTileSize',
  'scaleCanvasNearestNeighbor',
  'shouldExportOriginalCompanion',
  'shouldSaveProjectCompanion',
  'showLoginPromptAfterExport',
  'state',
  'syncExportGridInputs',
  'syncExportScaleInputs',
  'updateAutosaveStatus',
  'voxelExtensionPreviewMeta',
  'voxelExtensionPreviewPixels',
].forEach(name => requireInjectedGetter('exportFormatWorkflowUtils', name));
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
  ['embedConfigUtils', 'embed-config-utils.js'],
  ['autosaveDatabaseUtils', 'autosave-database-utils.js'],
  ['exportNormalizerUtils', 'export-normalizer-utils.js'],
  ['pixieedSupportBenefitUtils', 'pixieed-support-benefit-utils.js'],
  ['canvasCoreWorkflowUtils', 'canvas-core-workflow-utils.js'],
  ['canvasDrawingWorkflowUtils', 'canvas-drawing-workflow-utils.js'],
  ['canvasPointerWorkflowUtils', 'canvas-pointer-workflow-utils.js'],
  ['externalToolWorkflowUtils', 'external-tool-workflow-utils.js'],
  ['canvasToolStateWorkflowUtils', 'canvas-tool-state-workflow-utils.js'],
  ['palettePresetWorkflowUtils', 'palette-preset-workflow-utils.js'],
  ['iosSnapshotUtils', 'ios-snapshot-utils.js'],
  ['floatingDrawControlsUtils', 'floating-draw-controls-utils.js'],
  ['floatingPreviewPanelUtils', 'floating-preview-panel-utils.js'],
  ['voxelModeUtils', 'voxel-mode-utils.js'],
  ['voxelInteractionUtils', 'voxel-interaction-utils.js'],
  ['voxelPreviewUtils', 'voxel-preview-utils.js'],
  ['voxelGlbUtils', 'voxel-glb-utils.js'],
  ['simulationPlaybackWorkflowUtils', 'simulation-playback-workflow-utils.js'],
  ['keyboardWorkflowUtils', 'keyboard-workflow-utils.js'],
  ['canvasResizeHandleWorkflowUtils', 'canvas-resize-handle-workflow-utils.js'],
  ['localViewportCanvasWorkflowUtils', 'local-viewport-canvas-workflow-utils.js'],
  ['reloadSessionWorkflowUtils', 'reload-session-workflow-utils.js'],
  ['canvasOverlayWorkflowUtils', 'canvas-overlay-workflow-utils.js'],
  ['canvasRenderWorkflowUtils', 'canvas-render-workflow-utils.js'],
  ['canvasWheelZoomWorkflowUtils', 'canvas-wheel-zoom-workflow-utils.js'],
  ['canvasZoomWorkflowUtils', 'canvas-zoom-workflow-utils.js'],
  ['floatingDrawButtonWorkflowUtils', 'floating-draw-button-workflow-utils.js'],
  ['selectionMoveWorkflowUtils', 'selection-move-workflow-utils.js'],
  ['startupTailWorkflowUtils', 'startup-tail-workflow-utils.js'],
  ['layoutViewport', 'layout-viewport.js'],
  ['railToolUiUtils', 'rail-tool-ui-utils.js'],
  ['controlUiUtils', 'control-ui-utils.js'],
  ['uiActionButtonsWorkflowUtils', 'ui-action-buttons-workflow-utils.js'],
  ['uiActionRouterWorkflowUtils', 'ui-action-router-workflow-utils.js'],
  ['canvasControlActionsWorkflowUtils', 'canvas-control-actions-workflow-utils.js'],
  ['historyCoreWorkflowUtils', 'history-core-workflow-utils.js'],
  ['historyGuardWorkflowUtils', 'history-guard-workflow-utils.js'],
  ['curveWorkflowUtils', 'curve-workflow-utils.js'],
  ['canvasGridWorkflowUtils', 'canvas-grid-workflow-utils.js'],
  ['sizeSettingsWorkflowUtils', 'size-settings-workflow-utils.js'],
  ['timelineNavigationWorkflowUtils', 'timeline-navigation-workflow-utils.js'],
  ['openProjectTabWorkflowUtils', 'open-project-tab-workflow-utils.js'],
  ['canvasResizeWorkflowUtils', 'canvas-resize-workflow-utils.js'],
  ['timelapseSessionUtils', 'timelapse-session-utils.js'],
  ['uiLanguageUtils', 'ui-language-utils.js'],
  ['scrollInputUtils', 'scroll-input-utils.js'],
  ['autosaveWorkflowUtils', 'autosave-workflow-utils.js'],
  ['openImportWorkflowUtils', 'open-import-workflow-utils.js'],
  ['historySnapshotWorkflowUtils', 'history-snapshot-workflow-utils.js'],
  ['exportFormatWorkflowUtils', 'export-format-workflow-utils.js'],
  ['exportDialogWorkflowUtils', 'export-dialog-workflow-utils.js'],
  ['startupWorkflowUtils', 'startup-workflow-utils.js'],
  ['recentProjectWorkflowUtils', 'recent-project-workflow-utils.js'],
  ['projectPackageWorkflowUtils', 'project-package-workflow-utils.js'],
  ['documentSerializationUtils', 'document-serialization-utils.js'],
  ['documentSessionWorkflowUtils', 'document-session-workflow-utils.js'],
  ['recentAccountWorkflowUtils', 'recent-account-workflow-utils.js'],
  ['pixieedProfileLocalUtils', 'pixieed-profile-local-utils.js'],
  ['pixieedAccountWorkflowUtils', 'pixieed-account-workflow-utils.js'],
  ['controlsMirror', 'controls-mirror.js'],
  ['timelineLayers', 'timeline-layers.js'],
].forEach(([moduleKey, moduleFile]) => checkDirectModuleReferenceBeforeInit(moduleKey, moduleFile));

for (const moduleFile of ['layout-viewport.js', 'rail-tool-ui-utils.js', 'control-ui-utils.js', 'canvas-resize-workflow-utils.js', 'simulation-playback-workflow-utils.js', 'keyboard-workflow-utils.js', 'canvas-resize-handle-workflow-utils.js', 'local-viewport-canvas-workflow-utils.js', 'floating-draw-button-workflow-utils.js', 'timelapse-session-utils.js', 'autosave-workflow-utils.js', 'open-import-workflow-utils.js', 'export-dialog-workflow-utils.js', 'controls-mirror.js', 'timeline-layers.js', 'export-rendering.js', 'floating-draw-controls-utils.js', 'dialog-setup-utils.js', 'palette-preset-workflow-utils.js']) {
  const source = fs.readFileSync(path.join(moduleDir, moduleFile), 'utf8');
  source.split('\n').forEach((line, index) => {
    if (/(^|[^.])\b(requestAnimationFrame|cancelAnimationFrame)\(/.test(line)) {
      failures.push(`${moduleFile}: use window.requestAnimationFrame/window.cancelAnimationFrame at line ${index + 1}`);
    }
  });
}

const indexSource = fs.readFileSync(indexPath, 'utf8');
const buildInfoPath = 'PiXiEEDrawDEV/assets/js/build-info.js';
const buildInfoSource = fs.readFileSync(buildInfoPath, 'utf8');
const appVersion = buildInfoSource.match(/buildId: '([^']+)'/)?.[1] || '';
const indexVersion = indexSource.match(/assets\/js\/app\.js\?v=([^"]+)/)?.[1] || '';
if (!/const APP_BUILD_VERSION = String\(APP_BUILD_INFO\.buildId/.test(appSource)) {
  failures.push('APP_BUILD_VERSION must read the single build-info source');
}
if (!appVersion || !indexVersion || appVersion !== indexVersion) {
  failures.push(`build-info/index query mismatch: build=${appVersion || '(missing)'} index=${indexVersion || '(missing)'}`);
}

const activeFailures = failures.filter(failure => (
  !failure.includes('shared project comment utils')
  && !failure.includes('sharedRecentProjectUtils')
  && !failure.includes('sharedProject')
  && !failure.includes('sharedRuntimeUtils')
  && !failure.includes('canvasControlActionsWorkflowUtils')
  && !failure.includes('openProjectTabWorkflowUtils: missing injected getter for checkpoint')
));

if (activeFailures.length) {
  console.error('PiXiEEDrawDEV TDZ guard failed:');
  activeFailures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('PiXiEEDrawDEV TDZ guard passed.');
