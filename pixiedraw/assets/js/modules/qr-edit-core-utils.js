(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createQrEditCoreUtils({
    dom,
    state,
    qrEditModeState,
    qrEditScanCanvas,
    qrEditScanCtx,
    qrEditSourceCanvas,
    qrEditSourceCtx,
    QR_EDIT_SCAN_CANVAS_SIZE,
    QR_EDIT_CHECK_DELAY_MS,
    getQrEditBarcodeDetector,
    setQrEditBarcodeDetector,
    getQrEditBarcodeSupport,
    setQrEditBarcodeSupport,
    getAutosaveProjectId,
    getActiveFrame,
    compositeFramePixels,
    normalizeQrEditPayload,
    normalizeAutosaveProjectId,
    canUseQrEditJsQrDecoder,
    updateQrEditPanel,
    updateActiveOpenProjectTabQrEditPayload,
  } = {}) {
    function clearQrEditPreviewCanvas() {
      const preview = dom.qrEditPanelPreview;
      if (!(preview instanceof HTMLCanvasElement)) {
        return;
      }
      const previewCtx = preview.getContext('2d');
      if (!previewCtx) {
        return;
      }
      previewCtx.clearRect(0, 0, preview.width, preview.height);
    }

    function syncQrEditPreviewCanvas(sourceCanvas = null) {
      const preview = dom.qrEditPanelPreview;
      if (!(preview instanceof HTMLCanvasElement)) {
        return;
      }
      const previewCtx = preview.getContext('2d');
      if (!previewCtx) {
        return;
      }
      previewCtx.clearRect(0, 0, preview.width, preview.height);
      previewCtx.fillStyle = '#ffffff';
      previewCtx.fillRect(0, 0, preview.width, preview.height);
      if (!(sourceCanvas instanceof HTMLCanvasElement) || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
        return;
      }
      previewCtx.imageSmoothingEnabled = false;
      previewCtx.drawImage(sourceCanvas, 0, 0, preview.width, preview.height);
    }

    async function ensureQrEditBarcodeDetector() {
      if (getQrEditBarcodeDetector?.()) {
        setQrEditBarcodeSupport?.(true);
        return getQrEditBarcodeDetector?.();
      }
      if (getQrEditBarcodeSupport?.() === false) {
        return null;
      }
      if (!('BarcodeDetector' in window)) {
        setQrEditBarcodeSupport?.(false);
        return null;
      }
      try {
        if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          if (Array.isArray(supported) && !supported.includes('qr_code')) {
            setQrEditBarcodeSupport?.(false);
            return null;
          }
        }
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        setQrEditBarcodeDetector?.(detector);
        setQrEditBarcodeSupport?.(true);
        return detector;
      } catch (error) {
        setQrEditBarcodeSupport?.(false);
        console.warn('QR edit mode detector unavailable', error);
        return null;
      }
    }

    function buildQrEditSourceImageData() {
      const width = Math.max(1, Math.round(Number(state.width) || 1));
      const height = Math.max(1, Math.round(Number(state.height) || 1));
      const frame = getActiveFrame();
      if (!frame || width <= 0 || height <= 0 || !qrEditSourceCtx) {
        return null;
      }
      const pixels = compositeFramePixels(frame, width, height, state.palette);
      if (!(pixels instanceof Uint8ClampedArray) || pixels.length < width * height * 4) {
        return null;
      }
      const imageData = qrEditSourceCtx.createImageData(width, height);
      const data = imageData.data;
      for (let i = 0; i < width * height; i += 1) {
        const base = i * 4;
        const alpha = pixels[base + 3];
        if (alpha >= 255) {
          data[base] = pixels[base];
          data[base + 1] = pixels[base + 1];
          data[base + 2] = pixels[base + 2];
        } else if (alpha > 0) {
          const inverse = 255 - alpha;
          data[base] = Math.round(((pixels[base] * alpha) + (255 * inverse)) / 255);
          data[base + 1] = Math.round(((pixels[base + 1] * alpha) + (255 * inverse)) / 255);
          data[base + 2] = Math.round(((pixels[base + 2] * alpha) + (255 * inverse)) / 255);
        } else {
          data[base] = 255;
          data[base + 1] = 255;
          data[base + 2] = 255;
        }
        data[base + 3] = 255;
      }
      return imageData;
    }

    function deactivateQrEditMode({ clearTab = false } = {}) {
      if (qrEditModeState.pendingTimer !== null) {
        window.clearTimeout(qrEditModeState.pendingTimer);
        qrEditModeState.pendingTimer = null;
      }
      qrEditModeState.active = false;
      qrEditModeState.source = '';
      qrEditModeState.expectedText = '';
      qrEditModeState.projectId = '';
      qrEditModeState.panelVisible = true;
      qrEditModeState.lastDecodedText = '';
      qrEditModeState.readable = null;
      qrEditModeState.exactMatch = null;
      qrEditModeState.detectorAvailable = getQrEditBarcodeSupport?.();
      qrEditModeState.checking = false;
      qrEditModeState.checkToken += 1;
      clearQrEditPreviewCanvas();
      updateQrEditPanel?.();
      if (clearTab) {
        updateActiveOpenProjectTabQrEditPayload?.(null);
      }
    }

    function activateQrEditMode(payload = null) {
      const normalized = normalizeQrEditPayload(payload, getAutosaveProjectId?.() || '');
      if (!normalized) {
        deactivateQrEditMode();
        return;
      }
      qrEditModeState.active = true;
      qrEditModeState.source = normalized.source;
      qrEditModeState.expectedText = normalized.rawValue || '';
      qrEditModeState.projectId = normalized.projectId || normalizeAutosaveProjectId(getAutosaveProjectId?.() || '');
      qrEditModeState.panelVisible = normalized.panelVisible !== false;
      qrEditModeState.lastDecodedText = '';
      qrEditModeState.readable = null;
      qrEditModeState.exactMatch = null;
      qrEditModeState.detectorAvailable = getQrEditBarcodeSupport?.();
      qrEditModeState.checking = false;
      clearQrEditPreviewCanvas();
      updateQrEditPanel?.();
      scheduleQrEditReadabilityCheck({ immediate: true });
    }

    function renderQrEditScanSource() {
      if (!qrEditScanCtx || !qrEditSourceCtx) {
        return null;
      }
      const sourceImage = buildQrEditSourceImageData();
      if (!sourceImage || sourceImage.width <= 0 || sourceImage.height <= 0) {
        return null;
      }
      const sourceWidth = Math.max(1, Math.round(sourceImage.width));
      const sourceHeight = Math.max(1, Math.round(sourceImage.height));
      if (qrEditSourceCanvas.width !== sourceWidth) {
        qrEditSourceCanvas.width = sourceWidth;
      }
      if (qrEditSourceCanvas.height !== sourceHeight) {
        qrEditSourceCanvas.height = sourceHeight;
      }
      qrEditSourceCtx.putImageData(sourceImage, 0, 0);
      const maxSourceSize = Math.max(sourceWidth, sourceHeight);
      const scale = Math.max(1, Math.floor(QR_EDIT_SCAN_CANVAS_SIZE / maxSourceSize));
      const targetWidth = sourceWidth * scale;
      const targetHeight = sourceHeight * scale;
      if (qrEditScanCanvas.width !== targetWidth) {
        qrEditScanCanvas.width = targetWidth;
      }
      if (qrEditScanCanvas.height !== targetHeight) {
        qrEditScanCanvas.height = targetHeight;
      }
      qrEditScanCtx.clearRect(0, 0, qrEditScanCanvas.width, qrEditScanCanvas.height);
      qrEditScanCtx.fillStyle = '#ffffff';
      qrEditScanCtx.fillRect(0, 0, qrEditScanCanvas.width, qrEditScanCanvas.height);
      qrEditScanCtx.imageSmoothingEnabled = false;
      qrEditScanCtx.drawImage(qrEditSourceCanvas, 0, 0, targetWidth, targetHeight);
      syncQrEditPreviewCanvas(qrEditScanCanvas);
      return qrEditScanCanvas;
    }

    async function decodeQrEditWithBarcodeDetector(scanCanvas) {
      const detector = await ensureQrEditBarcodeDetector();
      if (!detector) {
        return null;
      }
      const results = await detector.detect(scanCanvas);
      const decoded = Array.isArray(results)
        ? results.find(item => typeof item?.rawValue === 'string' && item.rawValue.length > 0)
        : null;
      return typeof decoded?.rawValue === 'string' ? decoded.rawValue : '';
    }

    function decodeQrEditWithJsQr(scanCanvas) {
      if (!canUseQrEditJsQrDecoder() || !qrEditScanCtx || !(scanCanvas instanceof HTMLCanvasElement)) {
        return null;
      }
      try {
        const image = qrEditScanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
        const decoded = window.jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'attemptBoth',
        });
        return typeof decoded?.data === 'string' ? decoded.data : '';
      } catch (error) {
        console.warn('QR edit mode jsQR detect failed', error);
        return '';
      }
    }

    async function decodeQrEditScanCanvas(scanCanvas) {
      let detectorTried = false;
      try {
        const decodedByDetector = await decodeQrEditWithBarcodeDetector(scanCanvas);
        detectorTried = decodedByDetector !== null;
        if (typeof decodedByDetector === 'string' && decodedByDetector.length > 0) {
          return { supported: true, text: decodedByDetector, method: 'barcode-detector' };
        }
      } catch (error) {
        detectorTried = true;
        console.warn('QR edit mode BarcodeDetector failed', error);
      }

      const decodedByJsQr = decodeQrEditWithJsQr(scanCanvas);
      if (typeof decodedByJsQr === 'string') {
        return { supported: true, text: decodedByJsQr, method: 'jsqr' };
      }
      return { supported: detectorTried, text: '', method: detectorTried ? 'barcode-detector' : '' };
    }

    async function runQrEditReadabilityCheck() {
      if (!qrEditModeState.active) {
        return;
      }
      const token = ++qrEditModeState.checkToken;
      qrEditModeState.checking = true;
      updateQrEditPanel?.();
      const scanCanvas = renderQrEditScanSource();
      if (!scanCanvas) {
        qrEditModeState.checking = false;
        qrEditModeState.readable = false;
        qrEditModeState.exactMatch = null;
        qrEditModeState.lastDecodedText = '';
        updateQrEditPanel?.();
        return;
      }
      try {
        const result = await decodeQrEditScanCanvas(scanCanvas);
        if (token !== qrEditModeState.checkToken || !qrEditModeState.active) {
          return;
        }
        if (!result.supported) {
          qrEditModeState.detectorAvailable = false;
          qrEditModeState.lastDecodedText = '';
          qrEditModeState.readable = null;
          qrEditModeState.exactMatch = null;
          return;
        }
        qrEditModeState.detectorAvailable = true;
        const decodedText = typeof result.text === 'string' ? result.text.trim() : '';
        qrEditModeState.lastDecodedText = decodedText;
        qrEditModeState.readable = Boolean(decodedText);
        qrEditModeState.exactMatch = qrEditModeState.expectedText
          ? decodedText === qrEditModeState.expectedText
          : null;
      } catch (error) {
        console.warn('QR edit mode detect failed', error);
        qrEditModeState.lastDecodedText = '';
        qrEditModeState.readable = false;
        qrEditModeState.exactMatch = null;
      } finally {
        if (token === qrEditModeState.checkToken) {
          qrEditModeState.checking = false;
          updateQrEditPanel?.();
        }
      }
    }

    function scheduleQrEditReadabilityCheck({ immediate = false } = {}) {
      if (!qrEditModeState.active) {
        return;
      }
      if (qrEditModeState.pendingTimer !== null) {
        window.clearTimeout(qrEditModeState.pendingTimer);
        qrEditModeState.pendingTimer = null;
      }
      const run = () => {
        qrEditModeState.pendingTimer = null;
        window.requestAnimationFrame(() => {
          void runQrEditReadabilityCheck();
        });
      };
      if (immediate) {
        run();
        return;
      }
      qrEditModeState.pendingTimer = window.setTimeout(run, QR_EDIT_CHECK_DELAY_MS);
    }

    return {
      clearQrEditPreviewCanvas,
      syncQrEditPreviewCanvas,
      ensureQrEditBarcodeDetector,
      buildQrEditSourceImageData,
      deactivateQrEditMode,
      activateQrEditMode,
      renderQrEditScanSource,
      decodeQrEditWithBarcodeDetector,
      decodeQrEditWithJsQr,
      decodeQrEditScanCanvas,
      runQrEditReadabilityCheck,
      scheduleQrEditReadabilityCheck,
    };
  }

  root.qrEditCoreUtils = {
    createQrEditCoreUtils,
  };
})();
