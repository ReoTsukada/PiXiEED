(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createVirtualCursorWorkflowUtils(rawScope = {}) {
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
  function getVirtualCursorCellPosition(cursor = virtualCursor) {
    if (!cursor) {
      return null;
    }
    const width = Math.max(1, Number(state.width) || 0);
    const height = Math.max(1, Number(state.height) || 0);
    if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
      return null;
    }
    const x = clamp(Math.floor(cursor.x), 0, width - 1);
    const y = clamp(Math.floor(cursor.y), 0, height - 1);
    return { x, y };
  }

  function updateVirtualCursorPosition(nextX, nextY, { requestRender = true } = {}) {
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return false;
    }
    if (virtualCursor && virtualCursor.x === nextX && virtualCursor.y === nextY) {
      return false;
    }
    virtualCursor = { x: nextX, y: nextY };
    if (state.showVirtualCursor && requestRender) {
      requestOverlayRender();
    }
    handleVirtualCursorPositionChanged(virtualCursor);
    return true;
  }

  function setVirtualCursor(position) {
    if (!position) {
      return;
    }
    const nextX = Number(position.x);
    const nextY = Number(position.y);
    updateVirtualCursorPosition(nextX, nextY);
  }

  function handleVirtualCursorPositionChanged(next) {
    if (!virtualCursorDrawState.active) {
      return;
    }
    if (!state.showVirtualCursor) {
      return;
    }
    if (!next) {
      return;
    }
    const currentCell = getVirtualCursorCellPosition(next);
    if (!currentCell) {
      if (!pointerState.active && hoverPixel) {
        hoverPixel = null;
        requestOverlayRender();
      }
      return;
    }

    if (!pointerState.active) {
      if (!hoverPixel || hoverPixel.x !== currentCell.x || hoverPixel.y !== currentCell.y) {
        hoverPixel = { ...currentCell };
        requestOverlayRender();
      }
    }
    if (
      floatingDrawButtonState.pointerId !== null
      && floatingDrawButtonState.drawSessionStarted
      && !floatingDrawButtonState.dragging
      && floatingDrawButtonState.startCursorCell
      && (
        floatingDrawButtonState.startCursorCell.x !== currentCell.x
        || floatingDrawButtonState.startCursorCell.y !== currentCell.y
      )
    ) {
      floatingDrawButtonState.drawMoved = true;
    }

    const tool = virtualCursorDrawState.tool;
    if (!virtualCursorDrawState.active || !tool) {
      return;
    }
    if (pointerState.tool !== tool) {
      pointerState.tool = tool;
    }

    if (BRUSH_TOOLS.has(tool)) {
      const last = virtualCursorDrawState.lastPosition;
      if (!last) {
        applyBrushStroke(currentCell.x, currentCell.y, currentCell.x, currentCell.y);
        virtualCursorDrawState.lastPosition = { ...currentCell };
        return;
      }
      if (last.x === currentCell.x && last.y === currentCell.y) {
        return;
      }
      applyBrushStroke(last.x, last.y, currentCell.x, currentCell.y);
      virtualCursorDrawState.lastPosition = { ...currentCell };
      return;
    }

    if (VIRTUAL_CURSOR_SHAPE_TOOLS.has(tool)) {
      const previous = virtualCursorDrawState.currentPosition;
      if (previous && previous.x === currentCell.x && previous.y === currentCell.y) {
        return;
      }
      virtualCursorDrawState.currentPosition = { ...currentCell };
      pointerState.current = { ...currentCell };
      pointerState.last = { ...currentCell };
      const lastPoint = pointerState.path[pointerState.path.length - 1];
      if (!lastPoint || lastPoint.x !== currentCell.x || lastPoint.y !== currentCell.y) {
        pointerState.path.push({ ...currentCell });
      }
      pointerState.preview = {
        start: { ...(virtualCursorDrawState.startPosition || currentCell) },
        end: { ...pointerState.current },
        points: pointerState.path.slice(),
      };
      virtualCursorDrawState.path = pointerState.path.slice();
      requestOverlayRender();
      return;
    }

    if (VIRTUAL_CURSOR_SELECTION_TOOLS.has(tool)) {
      const previous = virtualCursorDrawState.currentPosition;
      if (previous && previous.x === currentCell.x && previous.y === currentCell.y) {
        return;
      }
      virtualCursorDrawState.currentPosition = { ...currentCell };
      pointerState.current = { ...currentCell };
      pointerState.last = { ...currentCell };
      const lastPathPoint = pointerState.path[pointerState.path.length - 1];
      if (!lastPathPoint || lastPathPoint.x !== currentCell.x || lastPathPoint.y !== currentCell.y) {
        pointerState.path.push({ ...currentCell });
      }
      if (!pointerState.selectionPreview) {
        pointerState.selectionPreview = {
          start: { ...(virtualCursorDrawState.startPosition || currentCell) },
          end: { ...currentCell },
          points: [{ ...(virtualCursorDrawState.startPosition || currentCell) }],
        };
      }
      if (tool === 'selectLasso') {
        const selectionPoints = pointerState.selectionPreview.points;
        const lastSelectionPoint = selectionPoints[selectionPoints.length - 1];
        if (!lastSelectionPoint || lastSelectionPoint.x !== currentCell.x || lastSelectionPoint.y !== currentCell.y) {
          selectionPoints.push({ ...currentCell });
        }
        pointerState.selectionPreview.end = { ...currentCell };
        virtualCursorDrawState.points = selectionPoints.map(point => ({ ...point }));
      } else {
        pointerState.selectionPreview.end = { ...currentCell };
        virtualCursorDrawState.points = [
          { ...(pointerState.selectionPreview.start || virtualCursorDrawState.startPosition || currentCell) },
          { ...currentCell },
        ];
      }
      virtualCursorDrawState.path = pointerState.path.slice();
      requestOverlayRender();
      return;
    }

    if (VIRTUAL_CURSOR_MOVE_TOOLS.has(tool)) {
      const previous = virtualCursorDrawState.currentPosition;
      if (previous && previous.x === currentCell.x && previous.y === currentCell.y) {
        return;
      }
      virtualCursorDrawState.currentPosition = { ...currentCell };
      pointerState.current = { ...currentCell };
      pointerState.last = { ...currentCell };
      const lastPathPoint = pointerState.path[pointerState.path.length - 1];
      if (!lastPathPoint || lastPathPoint.x !== currentCell.x || lastPathPoint.y !== currentCell.y) {
        pointerState.path.push({ ...currentCell });
      }
      if (pointerState.selectionMove) {
        handleSelectionMoveDrag(currentCell);
      }
      requestOverlayRender();
      return;
    }

    if (tool === 'curve') {
      virtualCursorDrawState.currentPosition = { ...currentCell };
      pointerState.current = { ...currentCell };
      pointerState.last = { ...currentCell };
      const stage = virtualCursorDrawState.curveStage || (curveBuilder ? curveBuilder.stage : null);
      if (!curveBuilder || !stage) {
        return;
      }
      if (stage === 'line') {
        const lastPoint = pointerState.path[pointerState.path.length - 1];
        if (!lastPoint || lastPoint.x !== currentCell.x || lastPoint.y !== currentCell.y) {
          pointerState.path.push({ ...currentCell });
        }
        curveBuilder.end = { ...currentCell };
        pointerState.preview = {
          start: { ...(curveBuilder.start || virtualCursorDrawState.startPosition || currentCell) },
          end: { ...currentCell },
        };
      } else if (stage === 'control1') {
        curveBuilder.control1 = { ...currentCell };
      } else if (stage === 'control2') {
        curveBuilder.control2 = { ...currentCell };
      }
      virtualCursorDrawState.curveStage = stage;
      requestOverlayRender();
    }
  }

  function startVirtualCursorDrawSession({ drawPaletteIndex = null } = {}) {
    if (virtualCursorDrawState.active) {
      return false;
    }
    if (state.playback.isPlaying) {
      return false;
    }
    if (!state.showVirtualCursor || !virtualCursor) {
      return false;
    }
    const activeTool = state.tool;
    if (!VIRTUAL_CURSOR_SUPPORTED_TOOLS.has(activeTool)) {
      return false;
    }
    const cell = getVirtualCursorCellPosition();
    if (!cell) {
      return false;
    }
    const requiresLayer = HISTORY_DRAW_TOOLS.has(activeTool);
    if (requiresLayer) {
      if (isMultiSpectatorMode()) {
        setMultiStatus(localizeText('視聴モードでは描画できません', 'Drawing is disabled in viewer mode'), 'warn');
        return false;
      }
      if (isMultiAssignedCellRestrictedEditorMode() && !enforceGuestAssignedLayerSelection({ announce: true })) {
        return false;
      }
    }
    const layer = getActiveLayer();
    if (requiresLayer && !layer) {
      return false;
    }
    const shouldMoveSelectionWithSelectionTool = Boolean(
      VIRTUAL_CURSOR_SELECTION_TOOLS.has(activeTool)
      && selectionMaskHasPixels(state.selectionMask)
      && isPositionInCurrentSelectionInteractionArea(cell)
    );
    const sessionTool = shouldMoveSelectionWithSelectionTool ? 'move' : activeTool;

    resetPointerStateForVirtualCursor();
    hoverPixel = null;

    virtualCursorDrawState.active = true;
    virtualCursorDrawState.tool = sessionTool;
    virtualCursorDrawState.historyStarted = false;
    virtualCursorDrawState.lastPosition = BRUSH_TOOLS.has(sessionTool) ? { ...cell } : null;
    virtualCursorDrawState.startPosition = { ...cell };
    virtualCursorDrawState.currentPosition = { ...cell };
    virtualCursorDrawState.path = [{ ...cell }];
    virtualCursorDrawState.points = [{ ...cell }];
    virtualCursorDrawState.selectionClearedOnStart = false;
    virtualCursorDrawState.curveStage = null;

    pointerState.tool = sessionTool;
    pointerState.start = { ...cell };
    pointerState.current = { ...cell };
    pointerState.last = { ...cell };
    pointerState.path = [{ ...cell }];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.drawPaletteIndex = HISTORY_DRAW_TOOLS.has(sessionTool) && Number.isFinite(drawPaletteIndex)
      ? normalizePaletteIndex(drawPaletteIndex, state.activePaletteIndex)
      : null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionRestartedOnDown = false;
    pointerState.curveHandle = null;

    if (HISTORY_DRAW_TOOLS.has(sessionTool)) {
      beginHistory(sessionTool);
      virtualCursorDrawState.historyStarted = true;
    }
    if (BRUSH_TOOLS.has(sessionTool)) {
      applyBrushStroke(cell.x, cell.y, cell.x, cell.y);
      requestOverlayRender();
      return true;
    }

    if (VIRTUAL_CURSOR_SHAPE_TOOLS.has(sessionTool)) {
      pointerState.preview = {
        start: { ...virtualCursorDrawState.startPosition },
        end: { ...virtualCursorDrawState.currentPosition },
        points: pointerState.path.slice(),
      };
      requestOverlayRender();
      return true;
    }

    if (VIRTUAL_CURSOR_SELECTION_TOOLS.has(sessionTool)) {
      if (state.selectionMask) {
        clearSelection();
        virtualCursorDrawState.selectionClearedOnStart = true;
        pointerState.selectionClearedOnDown = true;
      }
      const preview = {
        start: { ...virtualCursorDrawState.startPosition },
        end: { ...virtualCursorDrawState.currentPosition },
        points: [{ ...virtualCursorDrawState.startPosition }],
      };
      pointerState.selectionPreview = preview;
      pointerState.tool = activeTool;
      virtualCursorDrawState.points = preview.points.map(point => ({ ...point }));
      requestOverlayRender();
      return true;
    }

    if (VIRTUAL_CURSOR_MOVE_TOOLS.has(sessionTool)) {
      if (!selectionMaskHasPixels(state.selectionMask)) {
        updateAutosaveStatus(localizeText('移動するには範囲選択が必要です', 'Selection is required to move'), 'warn');
        virtualCursorDrawState.active = false;
        virtualCursorDrawState.historyStarted = false;
        virtualCursorDrawState.lastPosition = null;
        virtualCursorDrawState.tool = null;
        virtualCursorDrawState.startPosition = null;
        virtualCursorDrawState.currentPosition = null;
        virtualCursorDrawState.path = [];
        virtualCursorDrawState.points = [];
        virtualCursorDrawState.selectionClearedOnStart = false;
        virtualCursorDrawState.curveStage = null;
        pointerState.tool = state.tool;
        return false;
      }
      const started = beginSelectionMoveFromVirtualCursor(
        cell,
        { reuseOffset: Boolean(state.pendingPasteMoveState) }
      );
      if (!started) {
        updateAutosaveStatus(localizeText('選択範囲の移動を開始できませんでした', 'Failed to start selection move'), 'warn');
        virtualCursorDrawState.active = false;
        virtualCursorDrawState.historyStarted = false;
        virtualCursorDrawState.lastPosition = null;
        virtualCursorDrawState.tool = null;
        virtualCursorDrawState.startPosition = null;
        virtualCursorDrawState.currentPosition = null;
        virtualCursorDrawState.path = [];
        virtualCursorDrawState.points = [];
        virtualCursorDrawState.selectionClearedOnStart = false;
        virtualCursorDrawState.curveStage = null;
        pointerState.tool = state.tool;
        return false;
      }
      pointerState.tool = 'selectionMove';
      virtualCursorDrawState.currentPosition = { ...cell };
      virtualCursorDrawState.path = pointerState.path.slice();
      requestOverlayRender();
      return true;
    }

    if (sessionTool === 'curve') {
      if (!curveBuilder) {
        beginHistory('curve');
        curveBuilder = {
          stage: 'line',
          start: { ...cell },
          end: { ...cell },
          control1: null,
          control2: null,
          awaitingEndPoint: true,
        };
      }
      virtualCursorDrawState.curveStage = curveBuilder.stage;
      pointerState.tool = 'curve';
      if (curveBuilder.stage === 'line') {
        if (!curveBuilder.start) {
          curveBuilder.start = { ...cell };
        }
        curveBuilder.end = { ...cell };
        pointerState.start = { ...curveBuilder.start };
        pointerState.current = { ...curveBuilder.end };
        pointerState.last = { ...curveBuilder.end };
        pointerState.path = [{ ...curveBuilder.start }, { ...curveBuilder.end }];
        pointerState.preview = {
          start: { ...curveBuilder.start },
          end: { ...curveBuilder.end },
        };
      } else if (curveBuilder.stage === 'control1') {
        pointerState.curveHandle = 'control1';
        pointerState.start = { ...cell };
        pointerState.current = { ...cell };
        pointerState.last = { ...cell };
        pointerState.path = [{ ...cell }];
        curveBuilder.control1 = { ...cell };
        pointerState.preview = null;
      } else if (curveBuilder.stage === 'control2') {
        pointerState.curveHandle = 'control2';
        pointerState.start = { ...cell };
        pointerState.current = { ...cell };
        pointerState.last = { ...cell };
        pointerState.path = [{ ...cell }];
        curveBuilder.control2 = { ...cell };
        pointerState.preview = null;
      }
      requestOverlayRender();
      return true;
    }

    virtualCursorDrawState.active = false;
    virtualCursorDrawState.historyStarted = false;
    virtualCursorDrawState.lastPosition = null;
    virtualCursorDrawState.tool = null;
    virtualCursorDrawState.startPosition = null;
    virtualCursorDrawState.currentPosition = null;
    virtualCursorDrawState.path = [];
    virtualCursorDrawState.points = [];
    virtualCursorDrawState.selectionClearedOnStart = false;
    virtualCursorDrawState.curveStage = null;
    return false;
  }

  function finishVirtualCursorDrawSession({ commit = true } = {}) {
    if (!virtualCursorDrawState.active) {
      return;
    }
    const tool = virtualCursorDrawState.tool;
    let actionPerformed = false;
    let shouldCommitHistory = false;
    let shouldRollbackHistory = false;

    if (tool === 'curve') {
      if (!curveBuilder) {
        if (!commit && history.pending && history.pending.label === 'curve') {
          rollbackPendingHistory({ reRender: false });
        }
      } else if (!commit) {
        if (history.pending && history.pending.label === 'curve') {
          rollbackPendingHistory({ reRender: false });
        }
        resetCurveBuilder();
      } else {
        const stage = virtualCursorDrawState.curveStage || curveBuilder.stage;
        const currentPoint = virtualCursorDrawState.currentPosition || pointerState.current || curveBuilder.end;
        if (stage === 'line') {
          if (currentPoint) {
            curveBuilder.end = { ...currentPoint };
          }
          const start = curveBuilder.start;
          const moved = start && currentPoint && (start.x !== currentPoint.x || start.y !== currentPoint.y);
          pointerState.preview = null;
          pointerState.path = [];
          pointerState.curveHandle = null;
          pointerState.tool = null;
          if (!moved) {
            curveBuilder.awaitingEndPoint = true;
          } else {
            curveBuilder.awaitingEndPoint = false;
            if (!curveBuilder.control1) {
              curveBuilder.control1 = { ...curveBuilder.start };
            }
            if (!curveBuilder.control2) {
              curveBuilder.control2 = { ...curveBuilder.end };
            }
            curveBuilder.stage = 'control1';
          }
          requestOverlayRender();
        } else if (stage === 'control1') {
          if (currentPoint) {
            curveBuilder.control1 = { ...currentPoint };
          }
          curveBuilder.stage = 'control2';
          pointerState.curveHandle = null;
          pointerState.path = [];
          pointerState.tool = null;
          requestOverlayRender();
          scheduleSessionPersist();
        } else if (stage === 'control2') {
          if (currentPoint) {
            curveBuilder.control2 = { ...currentPoint };
          }
          pointerState.curveHandle = null;
          pointerState.path = [];
          pointerState.tool = null;
          finalizeCurve();
        }
      }
    } else if (BRUSH_TOOLS.has(tool)) {
      if (virtualCursorDrawState.historyStarted) {
        if (commit) {
          shouldCommitHistory = true;
        } else {
          shouldRollbackHistory = true;
        }
      }
    } else if (VIRTUAL_CURSOR_SHAPE_TOOLS.has(tool)) {
      const start = virtualCursorDrawState.startPosition;
      const end = virtualCursorDrawState.currentPosition;
      if (commit && start && end) {
        switch (tool) {
          case 'line':
            drawLine(start, end);
            actionPerformed = true;
            break;
          case 'rect':
            drawRectangle(start, end, false);
            actionPerformed = true;
            break;
          case 'rectFill':
            drawRectangle(start, end, true);
            actionPerformed = true;
            break;
          case 'ellipse':
            drawEllipse(start, end, false);
            actionPerformed = true;
            break;
          case 'ellipseFill':
            drawEllipse(start, end, true);
            actionPerformed = true;
            break;
          case 'oval':
            drawOval(start, end, false);
            actionPerformed = true;
            break;
          case 'ovalFill':
            drawOval(start, end, true);
            actionPerformed = true;
            break;
          default:
            break;
        }
        if (virtualCursorDrawState.historyStarted) {
          if (actionPerformed) {
            shouldCommitHistory = true;
          } else {
            shouldRollbackHistory = true;
          }
        }
      } else if (virtualCursorDrawState.historyStarted) {
        shouldRollbackHistory = true;
      }
    } else if (VIRTUAL_CURSOR_MOVE_TOOLS.has(tool)) {
      const moveState = pointerState.selectionMove;
      if (!moveState) {
        actionPerformed = false;
      } else if (commit) {
        if (moveState.hasCleared) {
          // Keep virtual-cursor move behavior aligned with pointer drag:
          // stay in pending preview state until explicit confirm/cancel or outside click.
          promotePendingSelectionMove(moveState, {
            hover: virtualCursorDrawState.currentPosition || pointerState.current || getVirtualCursorCellPosition(),
          });
        } else {
          pointerState.selectionMove = null;
          pointerState.tool = state.tool;
        }
      } else {
        if (moveState.hasCleared && history.pending && history.pending.label === 'selectionMove') {
          rollbackPendingHistory({ reRender: false });
        }
        pointerState.selectionMove = null;
        pointerState.tool = state.tool;
      }
      updateCanvasControlButtons();
      if (actionPerformed) {
        scheduleSessionPersist();
      }
    } else if (VIRTUAL_CURSOR_SELECTION_TOOLS.has(tool)) {
      if (commit) {
        const pathLength = virtualCursorDrawState.path.length;
        if (tool === 'selectRect') {
          const start = virtualCursorDrawState.startPosition;
          const end = virtualCursorDrawState.currentPosition;
          if (start && end && !(virtualCursorDrawState.selectionClearedOnStart && pathLength <= 1)) {
            createSelectionRect(start, end);
            actionPerformed = true;
          }
        } else if (tool === 'selectLasso') {
          const points = pointerState.selectionPreview?.points || virtualCursorDrawState.points || [];
          const effectivePoints = points.map(point => ({ ...point })).filter(Boolean);
          if (effectivePoints.length > 1 && !(virtualCursorDrawState.selectionClearedOnStart && effectivePoints.length <= 1)) {
            createSelectionLasso(effectivePoints);
            actionPerformed = true;
          }
        }
        if (actionPerformed) {
          scheduleSessionPersist();
        }
      }
    } else if (virtualCursorDrawState.historyStarted) {
      if (commit) {
        shouldCommitHistory = true;
      } else {
        shouldRollbackHistory = true;
      }
    }

    if (shouldCommitHistory) {
      commitHistory();
    } else if (shouldRollbackHistory) {
      rollbackPendingHistory({ reRender: false });
    }

    if (commit && virtualCursorDrawState.currentPosition) {
      hoverPixel = { ...virtualCursorDrawState.currentPosition };
    }

    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.path = [];
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    if (tool !== 'curve') {
      pointerState.tool = state.tool;
      pointerState.curveHandle = null;
    }

    virtualCursorDrawState.active = false;
    virtualCursorDrawState.historyStarted = false;
    virtualCursorDrawState.lastPosition = null;
    virtualCursorDrawState.tool = null;
    virtualCursorDrawState.startPosition = null;
    virtualCursorDrawState.currentPosition = null;
    virtualCursorDrawState.path = [];
    virtualCursorDrawState.points = [];
    virtualCursorDrawState.selectionClearedOnStart = false;
    virtualCursorDrawState.curveStage = null;
    requestOverlayRender();
  }

  function cancelVirtualCursorDrawSession() {
    finishVirtualCursorDrawSession({ commit: false });
  }

  function getClampedPointerPosition(event) {
    const metrics = getCanvasInteractionSurfaceMetrics(event?.target || null);
    const drawing = metrics.surface?.drawing instanceof HTMLCanvasElement ? metrics.surface.drawing : dom.canvases.drawing;
    if (!drawing) {
      return null;
    }
    const rect = drawing.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    if (!Number.isFinite(relativeX) || !Number.isFinite(relativeY)) {
      return null;
    }
    const x = relativeX * metrics.width;
    const y = relativeY * metrics.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  function updateVirtualCursorFromEvent(event) {
    const position = getClampedPointerPosition(event);
    if (position) {
      setVirtualCursor(position);
    }
  }

  function resizeVirtualCursorCanvas() {
    const canvas = dom.canvases.virtualCursor;
    const viewport = dom.canvasViewport;
    if (!canvas || !viewport) {
      return;
    }
    if (!ctx.virtual && typeof canvas.getContext === 'function') {
      ctx.virtual = canvas.getContext('2d');
      if (ctx.virtual) {
        ctx.virtual.imageSmoothingEnabled = true;
      }
    }
    const rect = viewport.getBoundingClientRect();
    const cssWidth = rect.width || viewport.clientWidth || 0;
    const cssHeight = rect.height || viewport.clientHeight || 0;
    if (cssWidth <= 0 || cssHeight <= 0) {
      const needsReset = canvas.width !== 1 || canvas.height !== 1;
      if (needsReset) {
        canvas.width = 1;
        canvas.height = 1;
        if (ctx.virtual) {
          ctx.virtual.imageSmoothingEnabled = true;
        }
      }
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
    const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      if (ctx.virtual) {
        ctx.virtual.imageSmoothingEnabled = true;
      }
    }
  }


  function captureVirtualCursorPointer(pointerId, pointerType, element, event) {
    if (!Number.isFinite(pointerId)) {
      return;
    }
    if (virtualCursorControl.pointerId !== null && virtualCursorControl.pointerId !== pointerId) {
      releaseVirtualCursorPointer();
    }
    virtualCursorControl.pointerId = pointerId;
    virtualCursorControl.pointerType = pointerType || null;
    const captureTarget = element || dom.canvases.drawing || dom.canvasViewport || null;
    virtualCursorControl.captureElement = captureTarget;
    virtualCursorControl.startClient = event ? { x: event.clientX, y: event.clientY } : null;
    virtualCursorControl.baseCursor = virtualCursor ? { x: virtualCursor.x, y: virtualCursor.y } : { x: 0, y: 0 };
    if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
      try {
        captureTarget.setPointerCapture(pointerId);
      } catch (error) {
        // Ignore pointer capture errors; some browsers may not allow it.
      }
    }
    refreshViewportCursorStyle();
  }

  function releaseVirtualCursorPointer() {
    if (virtualCursorControl.pointerId === null) {
      return;
    }
    const captureTarget = virtualCursorControl.captureElement;
    if (captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
      try {
        captureTarget.releasePointerCapture(virtualCursorControl.pointerId);
      } catch (error) {
        // Ignore capture release errors.
      }
    }
    virtualCursorControl.pointerId = null;
    virtualCursorControl.pointerType = null;
    virtualCursorControl.captureElement = null;
    virtualCursorControl.startClient = null;
    virtualCursorControl.baseCursor = null;
    refreshViewportCursorStyle();
  }

  function updateVirtualCursorFromControlDelta(event) {
    if (!dom.canvases.drawing || !virtualCursor) {
      return;
    }
    const start = virtualCursorControl.startClient;
    const base = virtualCursorControl.baseCursor;
    if (!start || !base) {
      return;
    }
    const rect = dom.canvases.drawing.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const unitX = rect.width / Math.max(1, state.width);
    const unitY = rect.height / Math.max(1, state.height);
    const deltaX = unitX ? dx / unitX : 0;
    const deltaY = unitY ? dy / unitY : 0;
    // Allow the virtual cursor to reach the right/bottom edge while keeping
    // actual drawing cell resolution unchanged via getVirtualCursorCellPosition().
    const nextX = clamp(base.x + deltaX, 0, state.width);
    const nextY = clamp(base.y + deltaY, 0, state.height);
    updateVirtualCursorPosition(nextX, nextY);
  }


  return Object.freeze({
    getVirtualCursorCellPosition,
    updateVirtualCursorPosition,
    setVirtualCursor,
    handleVirtualCursorPositionChanged,
    startVirtualCursorDrawSession,
    finishVirtualCursorDrawSession,
    cancelVirtualCursorDrawSession,
    getClampedPointerPosition,
    updateVirtualCursorFromEvent,
    resizeVirtualCursorCanvas,
    captureVirtualCursorPointer,
    releaseVirtualCursorPointer,
    updateVirtualCursorFromControlDelta,
  });
      }
    })(scope);
  }

  root.virtualCursorWorkflowUtils = Object.freeze({
    createVirtualCursorWorkflowUtils,
  });
})();
