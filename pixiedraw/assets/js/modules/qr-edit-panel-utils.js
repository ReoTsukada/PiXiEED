(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createQrEditPanelUtils({
    dom,
    qrEditModeState,
    qrEditPanelDragState,
    getProjectHomeVisible,
    clamp,
    getViewportBounds,
    getSafeAreaInsets,
    getActiveOpenProjectTab,
    normalizeQrEditPayload,
    normalizeAutosaveProjectId,
    getAutosaveProjectId,
    deactivateQrEditMode,
    activateQrEditMode,
    scheduleQrEditReadabilityCheck,
    findOpenProjectTabIndex,
    getActiveOpenProjectTabId,
    openProjectTabs,
    renderOpenProjectTabs,
  } = {}) {
    function getActiveQrEditPayload() {
      const activeTab = getActiveOpenProjectTab();
      return normalizeQrEditPayload(activeTab?.qrEditPayload || null, getAutosaveProjectId?.() || '');
    }

    function doesQrEditModeMatchPayload(payload = null) {
      const normalized = normalizeQrEditPayload(payload, getAutosaveProjectId?.() || '');
      if (!normalized || !qrEditModeState.active) {
        return false;
      }
      return qrEditModeState.source === normalized.source
        && qrEditModeState.projectId === (normalized.projectId || normalizeAutosaveProjectId(getAutosaveProjectId?.() || ''))
        && qrEditModeState.expectedText === (normalized.rawValue || '')
        && qrEditModeState.panelVisible === (normalized.panelVisible !== false);
    }

    function syncQrEditModeWithActivePayload({ scheduleCheck = false } = {}) {
      const payload = getActiveQrEditPayload();
      if (!payload) {
        if (qrEditModeState.active) {
          deactivateQrEditMode?.();
        }
        return null;
      }
      if (!doesQrEditModeMatchPayload(payload)) {
        activateQrEditMode?.(payload);
        return payload;
      }
      updateQrEditPanel();
      if (scheduleCheck && payload.panelVisible !== false) {
        scheduleQrEditReadabilityCheck?.();
      }
      return payload;
    }

    function setQrEditPanelVisibility(visible) {
      const panel = dom.qrEditPanel;
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const nextVisible = Boolean(visible) && qrEditModeState.panelVisible !== false && !getProjectHomeVisible?.();
      panel.hidden = !nextVisible;
      panel.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
    }

    function clampQrEditPanelPosition(x, y) {
      const panel = dom.qrEditPanel;
      if (!(panel instanceof HTMLElement)) {
        return { x: 0, y: 0 };
      }
      const viewportBounds = getViewportBounds();
      const safeArea = getSafeAreaInsets();
      const margin = 8;
      const panelWidth = Math.max(1, panel.offsetWidth || panel.clientWidth || 1);
      const panelHeight = Math.max(1, panel.offsetHeight || panel.clientHeight || 1);
      const minX = Math.round(viewportBounds.left + safeArea.left + margin);
      const minY = Math.round(viewportBounds.top + safeArea.top + margin);
      const maxX = Math.max(minX, Math.round(viewportBounds.right - safeArea.right - panelWidth - margin));
      const maxY = Math.max(minY, Math.round(viewportBounds.bottom - safeArea.bottom - panelHeight - margin));
      return {
        x: clamp(Math.round(Number(x) || 0), minX, maxX),
        y: clamp(Math.round(Number(y) || 0), minY, maxY),
      };
    }

    function applyQrEditPanelPosition() {
      const panel = dom.qrEditPanel;
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      if (!qrEditPanelDragState.hasCustomPosition) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        return;
      }
      const next = clampQrEditPanelPosition(qrEditPanelDragState.x, qrEditPanelDragState.y);
      qrEditPanelDragState.x = next.x;
      qrEditPanelDragState.y = next.y;
      panel.style.left = `${next.x}px`;
      panel.style.top = `${next.y}px`;
      panel.style.right = 'auto';
    }

    function updateQrEditPanel() {
      const active = Boolean(qrEditModeState.active);
      setQrEditPanelVisibility(active);
      if (!active) {
        return;
      }
      applyQrEditPanelPosition();
      if (dom.qrEditPanelStatus) {
        let label = '待機中';
        let tone = 'idle';
        if (qrEditModeState.checking) {
          label = '判定中';
        } else if (qrEditModeState.readable === true) {
          label = '読取OK';
          tone = 'ok';
        } else if (qrEditModeState.readable === false) {
          label = '読取NG';
          tone = 'error';
        } else if (qrEditModeState.detectorAvailable === false) {
          label = '未対応';
          tone = 'warn';
        }
        dom.qrEditPanelStatus.textContent = label;
        dom.qrEditPanelStatus.dataset.tone = tone;
      }
      if (dom.qrEditPanelMatch) {
        const showMatch = qrEditModeState.expectedText.length > 0 && qrEditModeState.exactMatch !== null;
        dom.qrEditPanelMatch.hidden = !showMatch;
        if (showMatch) {
          dom.qrEditPanelMatch.textContent = qrEditModeState.exactMatch ? '内容一致' : '内容差分';
        }
      }
      if (dom.qrEditPanelMessage) {
        let message = '1操作ごとに今の見た目から読取判定します。';
        if (qrEditModeState.checking) {
          message = '現在の描画結果からQRを再判定しています。';
        } else if (qrEditModeState.detectorAvailable === false) {
          message = 'この端末ではリアルタイムQR判定に未対応です。';
        } else if (qrEditModeState.readable === true && qrEditModeState.exactMatch === false) {
          message = 'QR自体は読めますが、元テキストとは異なる内容です。';
        } else if (qrEditModeState.readable === true) {
          message = '今の状態なら読み取れます。';
        } else if (qrEditModeState.readable === false) {
          message = '今の状態では読取に失敗しています。';
        }
        dom.qrEditPanelMessage.textContent = message;
      }
      if (dom.qrEditPanelDecoded) {
        dom.qrEditPanelDecoded.textContent = qrEditModeState.lastDecodedText || '未判定';
      }
    }

    function updateActiveOpenProjectTabQrEditPayload(payload = null) {
      const normalized = normalizeQrEditPayload(payload, getAutosaveProjectId?.() || '');
      const index = findOpenProjectTabIndex(getActiveOpenProjectTabId?.());
      if (index < 0 || !openProjectTabs[index]) {
        return;
      }
      openProjectTabs[index] = {
        ...openProjectTabs[index],
        qrEditPayload: normalized,
      };
      renderOpenProjectTabs?.();
    }

    function setQrEditPanelVisibleForActiveProject(visible) {
      const payload = getActiveQrEditPayload();
      if (!payload) {
        return;
      }
      const nextPayload = {
        ...payload,
        panelVisible: Boolean(visible),
      };
      qrEditModeState.panelVisible = nextPayload.panelVisible;
      updateActiveOpenProjectTabQrEditPayload(nextPayload);
      if (nextPayload.panelVisible) {
        activateQrEditMode?.(nextPayload);
      } else {
        updateQrEditPanel();
      }
    }

    function stopQrEditPanelDrag(event = null) {
      const panel = dom.qrEditPanel;
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const activePointerId = qrEditPanelDragState.pointerId;
      if (event && activePointerId !== null && (event.pointerId ?? null) !== activePointerId) {
        return;
      }
      try {
        panel.releasePointerCapture?.(activePointerId);
      } catch (_error) {
        // ignore pointer capture release errors
      }
      qrEditPanelDragState.pointerId = null;
      panel.classList.remove('is-dragging');
      window.removeEventListener('pointermove', handleQrEditPanelPointerMove);
      window.removeEventListener('pointerup', handleQrEditPanelPointerUp);
      window.removeEventListener('pointercancel', handleQrEditPanelPointerCancel);
    }

    function handleQrEditPanelPointerMove(event) {
      if (qrEditPanelDragState.pointerId === null || qrEditPanelDragState.pointerId !== (event.pointerId ?? null)) {
        return;
      }
      event.preventDefault();
      const clientX = Number(event.clientX) || 0;
      const clientY = Number(event.clientY) || 0;
      qrEditPanelDragState.hasCustomPosition = true;
      qrEditPanelDragState.x = clientX - qrEditPanelDragState.pointerOffsetX;
      qrEditPanelDragState.y = clientY - qrEditPanelDragState.pointerOffsetY;
      applyQrEditPanelPosition();
    }

    function handleQrEditPanelPointerUp(event) {
      stopQrEditPanelDrag(event);
    }

    function handleQrEditPanelPointerCancel(event) {
      stopQrEditPanelDrag(event);
    }

    function beginQrEditPanelDrag(event) {
      const panel = dom.qrEditPanel;
      if (!(panel instanceof HTMLElement) || event.button !== undefined && event.button !== 0) {
        return;
      }
      if (event.target instanceof Element && event.target.closest('#qrEditPanelClose')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      const clientX = Number(event.clientX) || 0;
      const clientY = Number(event.clientY) || 0;
      qrEditPanelDragState.pointerId = event.pointerId ?? -1;
      qrEditPanelDragState.startClientX = clientX;
      qrEditPanelDragState.startClientY = clientY;
      qrEditPanelDragState.startX = Math.round(rect.left);
      qrEditPanelDragState.startY = Math.round(rect.top);
      qrEditPanelDragState.pointerOffsetX = clamp(clientX - rect.left, 0, Math.max(1, rect.width || panel.offsetWidth || 1));
      qrEditPanelDragState.pointerOffsetY = clamp(clientY - rect.top, 0, Math.max(1, rect.height || panel.offsetHeight || 1));
      qrEditPanelDragState.x = Math.round(rect.left);
      qrEditPanelDragState.y = Math.round(rect.top);
      qrEditPanelDragState.hasCustomPosition = true;
      panel.classList.add('is-dragging');
      try {
        panel.setPointerCapture?.(event.pointerId);
      } catch (_error) {
        // ignore pointer capture errors
      }
      window.addEventListener('pointermove', handleQrEditPanelPointerMove, { passive: false });
      window.addEventListener('pointerup', handleQrEditPanelPointerUp);
      window.addEventListener('pointercancel', handleQrEditPanelPointerCancel);
    }

    function refreshQrEditPanelViewportPosition() {
      if (!qrEditModeState.active) {
        return;
      }
      applyQrEditPanelPosition();
    }

    return {
      getActiveQrEditPayload,
      syncQrEditModeWithActivePayload,
      updateQrEditPanel,
      updateActiveOpenProjectTabQrEditPayload,
      setQrEditPanelVisibleForActiveProject,
      beginQrEditPanelDrag,
      refreshQrEditPanelViewportPosition,
    };
  }

  root.qrEditPanelUtils = {
    createQrEditPanelUtils,
  };
})();
