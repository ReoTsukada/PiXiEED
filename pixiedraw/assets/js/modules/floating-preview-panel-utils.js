(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createFloatingPreviewPanelUtils(rawScope = {}) {
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
  function getFloatingPreviewViewportSize() {
    const host = dom.canvasViewport;
    if (!(host instanceof HTMLElement)) {
      return { width: 0, height: 0 };
    }
    return {
      width: Math.max(0, Math.round(host.clientWidth || host.getBoundingClientRect().width || 0)),
      height: Math.max(0, Math.round(host.clientHeight || host.getBoundingClientRect().height || 0)),
    };
  }

  function isFloatingVoxelPreviewActive() {
    return Boolean(
      isVoxelExtensionModeEnabled()
      && voxelExtensionPreviewMeta
      && voxelExtensionPreviewPixels instanceof Uint8ClampedArray
    );
  }

  function normalizeFloatingPreviewTab(tab = '') {
    return tab === 'reference' ? 'reference' : 'preview';
  }

  function applyFloatingPreviewTabUI() {
    const activeTab = normalizeFloatingPreviewTab(floatingPreviewReferenceState.tab);
    const previewPane = dom.floatingPreviewPaneCanvas;
    const referencePane = dom.floatingPreviewPaneReference;
    if (previewPane instanceof HTMLElement) {
      const visible = activeTab === 'preview';
      previewPane.hidden = !visible;
      previewPane.classList.toggle('is-active', visible);
      previewPane.setAttribute('aria-hidden', String(!visible));
    }
    if (referencePane instanceof HTMLElement) {
      const visible = activeTab === 'reference';
      referencePane.hidden = !visible;
      referencePane.classList.toggle('is-active', visible);
      referencePane.setAttribute('aria-hidden', String(!visible));
    }
    if (Array.isArray(dom.floatingPreviewTabButtons)) {
      dom.floatingPreviewTabButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) return;
        const tab = normalizeFloatingPreviewTab(button.dataset.floatingPreviewTab || '');
        const active = tab === activeTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
        button.setAttribute('tabindex', active ? '0' : '-1');
      });
    }
    renderFloatingPreviewReferenceSlots();
  }

  function setFloatingPreviewTab(tab = '', { requestFilePicker = false } = {}) {
    const nextTab = normalizeFloatingPreviewTab(tab);
    if (floatingPreviewReferenceState.tab !== nextTab) {
      floatingPreviewReferenceState.tab = nextTab;
      applyFloatingPreviewTabUI();
      fitFloatingPreviewCanvasToPanel();
      updateFloatingPreviewPanelPlaybackButtons();
      applyFloatingPreviewMediaTransform();
    }
    if (nextTab === 'reference' && requestFilePicker && dom.floatingPreviewReferenceInput instanceof HTMLInputElement) {
      dom.floatingPreviewReferenceInput.click();
    }
  }

  function setFloatingPreviewReferenceImageUrl(url = '') {
    const image = dom.floatingPreviewReferenceImage;
    const video = dom.floatingPreviewReferenceVideo;
    const audio = dom.floatingPreviewReferenceAudio;
    if (image instanceof HTMLImageElement) {
      image.hidden = true;
      image.removeAttribute('src');
    }
    if (video instanceof HTMLVideoElement) {
      video.hidden = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (audio instanceof HTMLAudioElement) {
      audio.hidden = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    const item = floatingPreviewReferenceState.items[floatingPreviewReferenceState.activeIndex] || null;
    if (url && item?.kind === 'video' && video instanceof HTMLVideoElement) {
      video.src = url;
      video.hidden = false;
      video.currentTime = 0;
      video.load();
    } else if (url && item?.kind === 'audio' && audio instanceof HTMLAudioElement) {
      audio.src = url;
      audio.hidden = false;
      audio.currentTime = 0;
      audio.load();
    } else if (url && image instanceof HTMLImageElement) {
      image.src = url;
      image.hidden = false;
    }
    if (dom.floatingPreviewReferenceEmpty instanceof HTMLElement) {
      dom.floatingPreviewReferenceEmpty.hidden = Boolean(url);
    }
    applyFloatingPreviewMediaTransform();
  }

  function clearFloatingPreviewReferenceObjectUrls() {
    floatingPreviewReferenceState.objectUrls.forEach(url => {
      if (!url) return;
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        // ignore url revoke errors
      }
    });
    floatingPreviewReferenceState.objectUrls = [];
    floatingPreviewReferenceState.items = [];
    floatingPreviewReferenceState.blobs = [];
    floatingPreviewReferenceState.activeIndex = -1;
  }

  function applyFloatingPreviewReferenceMediaPayload(payload) {
    clearFloatingPreviewReferenceObjectUrls();
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    entries.forEach(entry => {
      const safeIndex = clamp(Math.round(Number(entry?.index) || 0), 0, 4);
      const blob = entry?.blob instanceof Blob ? entry.blob : null;
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      floatingPreviewReferenceState.objectUrls[safeIndex] = objectUrl;
      floatingPreviewReferenceState.blobs[safeIndex] = blob;
      floatingPreviewReferenceState.items[safeIndex] = {
        kind: typeof entry?.kind === 'string' ? entry.kind : getFloatingPreviewReferenceKind({ type: entry?.type || '', name: entry?.name || '' }),
        name: typeof entry?.name === 'string' ? entry.name : '',
        type: typeof entry?.type === 'string' ? entry.type : blob.type || '',
        size: Math.max(0, Math.round(Number(entry?.size || blob.size || 0))),
      };
    });
    const hasAny = floatingPreviewReferenceState.objectUrls.some(url => Boolean(url));
    const initialIndex = hasAny
      ? clamp(Math.round(Number(payload?.activeIndex) || 0), 0, 4)
      : -1;
    setFloatingPreviewReferenceActiveIndex(initialIndex);
  }

  async function restoreFloatingPreviewReferenceMediaForActiveProject() {
    const projectId = normalizeAutosaveProjectId(autosaveProjectId || '');
    const token = (floatingPreviewReferenceRestoreToken += 1);
    if (!projectId) {
      clearFloatingPreviewReferenceObjectUrls();
      setFloatingPreviewReferenceImageUrl('');
      renderFloatingPreviewReferenceSlots();
      return;
    }
    const payload = await loadFloatingPreviewReferenceMediaForProject(projectId);
    if (token !== floatingPreviewReferenceRestoreToken) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      clearFloatingPreviewReferenceObjectUrls();
      setFloatingPreviewReferenceImageUrl('');
      renderFloatingPreviewReferenceSlots();
      return;
    }
    applyFloatingPreviewReferenceMediaPayload(payload);
  }

  function renderFloatingPreviewReferenceSlots() {
    const host = dom.floatingPreviewReferenceSlots;
    if (!(host instanceof HTMLElement)) {
      return;
    }
    host.textContent = '';
    for (let index = 0; index < 5; index += 1) {
      const slotWrap = document.createElement('div');
      slotWrap.className = 'floating-preview-panel__reference-slot-wrap';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'floating-preview-panel__reference-slot';
      const hasImage = Boolean(floatingPreviewReferenceState.objectUrls[index]);
      const isActive = index === floatingPreviewReferenceState.activeIndex;
      const item = floatingPreviewReferenceState.items[index] || null;
      if (isActive) {
        button.classList.add('is-active');
      }
      const marker = item?.kind === 'video' ? 'V' : item?.kind === 'audio' ? 'A' : `${index + 1}`;
      button.textContent = hasImage ? marker : '+';
      button.setAttribute('aria-label', hasImage
        ? localizeText(`参考画像${index + 1}を表示`, `Show reference ${index + 1}`)
        : localizeText(`参考画像${index + 1}を追加`, `Add reference ${index + 1}`));
      button.addEventListener('pointerdown', event => {
        event.stopPropagation();
      });
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (hasImage) {
          setFloatingPreviewReferenceActiveIndex(index);
          return;
        }
        floatingPreviewReferenceState.activeIndex = index;
        if (dom.floatingPreviewReferenceInput instanceof HTMLInputElement) {
          dom.floatingPreviewReferenceInput.click();
        }
      });
      slotWrap.appendChild(button);
      if (hasImage) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'floating-preview-panel__reference-remove';
        removeButton.textContent = '×';
        removeButton.setAttribute('aria-label', localizeText(`参考画像${index + 1}を削除`, `Remove reference ${index + 1}`));
        removeButton.addEventListener('pointerdown', event => {
          event.stopPropagation();
        });
        removeButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          removeFloatingPreviewReferenceAtIndex(index);
        });
        slotWrap.appendChild(removeButton);
      }
      host.appendChild(slotWrap);
    }
  }

  function removeFloatingPreviewReferenceAtIndex(index = -1) {
    const safeIndex = clamp(Math.round(Number(index) || 0), 0, 4);
    const previousUrl = floatingPreviewReferenceState.objectUrls[safeIndex];
    if (previousUrl) {
      try {
        URL.revokeObjectURL(previousUrl);
      } catch (error) {
        // ignore url revoke errors
      }
    }
    floatingPreviewReferenceState.objectUrls[safeIndex] = '';
    floatingPreviewReferenceState.blobs[safeIndex] = null;
    floatingPreviewReferenceState.items[safeIndex] = null;
    const nextIndex = floatingPreviewReferenceState.objectUrls.findIndex(url => Boolean(url));
    setFloatingPreviewReferenceActiveIndex(nextIndex);
    persistFloatingPreviewReferenceMediaForProject().catch(error => {
      console.warn('Failed to persist floating preview reference media after remove', error);
    });
  }

  function setFloatingPreviewReferenceActiveIndex(index = -1) {
    const hasAnyReference = floatingPreviewReferenceState.objectUrls.some(url => Boolean(url));
    if (!hasAnyReference) {
      floatingPreviewReferenceState.activeIndex = -1;
      setFloatingPreviewReferenceImageUrl('');
      renderFloatingPreviewReferenceSlots();
      return;
    }
    const maxIndex = Math.max(0, floatingPreviewReferenceState.objectUrls.length - 1);
    let safeIndex = clamp(Math.round(Number(index) || 0), 0, maxIndex);
    if (!floatingPreviewReferenceState.objectUrls[safeIndex]) {
      safeIndex = floatingPreviewReferenceState.objectUrls.findIndex(url => Boolean(url));
    }
    floatingPreviewReferenceState.activeIndex = safeIndex;
    setFloatingPreviewReferenceImageUrl(floatingPreviewReferenceState.objectUrls[safeIndex] || '');
    renderFloatingPreviewReferenceSlots();
  }

  function getFloatingPreviewReferenceKind(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov')) {
      return 'video';
    }
    if (type.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a')) {
      return 'audio';
    }
    return 'image';
  }

  async function optimizeReferenceImageFile(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (!(file instanceof File)) return file;
    if (type.includes('svg') || name.endsWith('.svg') || name.endsWith('.svgz') || type.includes('gif') || name.endsWith('.gif')) {
      return file;
    }
    if (!type.startsWith('image/')) {
      return file;
    }
    const needsDownscale = file.size > 3 * 1024 * 1024;
    if (!needsDownscale) {
      return file;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const maxEdge = 1920;
      const width = bitmap.width;
      const height = bitmap.height;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close?.();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close?.();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!(blob instanceof Blob) || !blob.size) {
        return file;
      }
      return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
    } catch (error) {
      return file;
    }
  }

  async function setFloatingPreviewReferenceImageFromFile(file) {
    if (!(file instanceof File)) {
      return;
    }
    const kind = getFloatingPreviewReferenceKind(file);
    const preparedFile = kind === 'image' ? await optimizeReferenceImageFile(file) : file;
    const nextUrl = URL.createObjectURL(preparedFile);
    let firstEmptyIndex = -1;
    for (let index = 0; index < 5; index += 1) {
      if (!floatingPreviewReferenceState.objectUrls[index]) {
        firstEmptyIndex = index;
        break;
      }
    }
    let targetIndex = firstEmptyIndex;
    if (targetIndex < 0) {
      targetIndex = Number.isInteger(floatingPreviewReferenceState.activeIndex)
        ? floatingPreviewReferenceState.activeIndex
        : floatingPreviewReferenceState.objectUrls.length - 1;
    }
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= 5) targetIndex = 4;
    const previousUrl = floatingPreviewReferenceState.objectUrls[targetIndex];
    if (previousUrl) {
      try {
        URL.revokeObjectURL(previousUrl);
      } catch (error) {
        // ignore url revoke errors
      }
    }
    floatingPreviewReferenceState.objectUrls[targetIndex] = nextUrl;
    floatingPreviewReferenceState.blobs[targetIndex] = preparedFile;
    floatingPreviewReferenceState.items[targetIndex] = {
      kind,
      name: preparedFile.name || file.name || '',
      type: preparedFile.type || file.type || '',
      size: Number(preparedFile.size || file.size || 0),
    };
    setFloatingPreviewReferenceActiveIndex(targetIndex);
    setFloatingPreviewTab('reference');
    persistFloatingPreviewReferenceMediaForProject().catch(error => {
      console.warn('Failed to persist floating preview reference media after file import', error);
    });
  }

  function getFloatingPreviewActiveMediaNode() {
    const activeTab = normalizeFloatingPreviewTab(floatingPreviewReferenceState.tab);
    if (activeTab === 'preview') {
      return dom.floatingPreviewCanvas instanceof HTMLCanvasElement ? dom.floatingPreviewCanvas : null;
    }
    if (dom.floatingPreviewReferenceVideo instanceof HTMLVideoElement && !dom.floatingPreviewReferenceVideo.hidden) {
      return dom.floatingPreviewReferenceVideo;
    }
    if (dom.floatingPreviewReferenceAudio instanceof HTMLAudioElement && !dom.floatingPreviewReferenceAudio.hidden) {
      return dom.floatingPreviewReferenceAudio;
    }
    if (dom.floatingPreviewReferenceImage instanceof HTMLImageElement && !dom.floatingPreviewReferenceImage.hidden) {
      return dom.floatingPreviewReferenceImage;
    }
    return null;
  }

  function syncFloatingPreviewZoomUI() {
    const zoomPercent = Math.round(clamp(floatingPreviewViewportState.zoom, 0.25, 4) * 100);
    if (dom.floatingPreviewZoomInput instanceof HTMLInputElement) {
      dom.floatingPreviewZoomInput.value = String(zoomPercent);
    }
    if (dom.floatingPreviewZoomValue instanceof HTMLOutputElement || dom.floatingPreviewZoomValue instanceof HTMLElement) {
      dom.floatingPreviewZoomValue.textContent = `${zoomPercent}%`;
    }
  }

  function getFloatingPreviewMediaBaseDisplaySize() {
    const activeTab = normalizeFloatingPreviewTab(floatingPreviewReferenceState.tab);
    const pane = activeTab === 'preview'
      ? dom.floatingPreviewPaneCanvas
      : dom.floatingPreviewPaneReference;
    if (!(pane instanceof HTMLElement)) {
      return { paneWidth: 0, paneHeight: 0, mediaWidth: 0, mediaHeight: 0 };
    }
    const paneWidth = Math.max(1, Math.floor(pane.clientWidth || 0));
    const paneHeight = Math.max(1, Math.floor(pane.clientHeight || 0));
    if (activeTab === 'preview') {
      const sourceWidth = isFloatingVoxelPreviewActive()
        ? Math.max(1, Math.round(Number(voxelExtensionPreviewMeta?.width) || 1))
        : Math.max(1, Math.round(Number(state.width) || 1));
      const sourceHeight = isFloatingVoxelPreviewActive()
        ? Math.max(1, Math.round(Number(voxelExtensionPreviewMeta?.height) || 1))
        : Math.max(1, Math.round(Number(state.height) || 1));
      const sourceAspect = sourceWidth / sourceHeight;
      const paneAspect = paneWidth / paneHeight;
      let mediaWidth = paneWidth;
      let mediaHeight = paneHeight;
      if (paneAspect > sourceAspect) {
        mediaHeight = paneHeight;
        mediaWidth = Math.max(1, Math.round(mediaHeight * sourceAspect));
      } else {
        mediaWidth = paneWidth;
        mediaHeight = Math.max(1, Math.round(mediaWidth / sourceAspect));
      }
      return { paneWidth, paneHeight, mediaWidth, mediaHeight };
    }
    if (dom.floatingPreviewReferenceVideo instanceof HTMLVideoElement && !dom.floatingPreviewReferenceVideo.hidden) {
      const sourceWidth = Math.max(1, Math.round(Number(dom.floatingPreviewReferenceVideo.videoWidth) || paneWidth));
      const sourceHeight = Math.max(1, Math.round(Number(dom.floatingPreviewReferenceVideo.videoHeight) || paneHeight));
      const sourceAspect = sourceWidth / sourceHeight;
      const paneAspect = paneWidth / paneHeight;
      let mediaWidth = paneWidth;
      let mediaHeight = paneHeight;
      if (paneAspect > sourceAspect) {
        mediaHeight = paneHeight;
        mediaWidth = Math.max(1, Math.round(mediaHeight * sourceAspect));
      } else {
        mediaWidth = paneWidth;
        mediaHeight = Math.max(1, Math.round(mediaWidth / sourceAspect));
      }
      return { paneWidth, paneHeight, mediaWidth, mediaHeight };
    }
    if (dom.floatingPreviewReferenceImage instanceof HTMLImageElement && !dom.floatingPreviewReferenceImage.hidden) {
      const sourceWidth = Math.max(1, Math.round(Number(dom.floatingPreviewReferenceImage.naturalWidth) || paneWidth));
      const sourceHeight = Math.max(1, Math.round(Number(dom.floatingPreviewReferenceImage.naturalHeight) || paneHeight));
      const sourceAspect = sourceWidth / sourceHeight;
      const paneAspect = paneWidth / paneHeight;
      let mediaWidth = paneWidth;
      let mediaHeight = paneHeight;
      if (paneAspect > sourceAspect) {
        mediaHeight = paneHeight;
        mediaWidth = Math.max(1, Math.round(mediaHeight * sourceAspect));
      } else {
        mediaWidth = paneWidth;
        mediaHeight = Math.max(1, Math.round(mediaWidth / sourceAspect));
      }
      return { paneWidth, paneHeight, mediaWidth, mediaHeight };
    }
    return { paneWidth, paneHeight, mediaWidth: paneWidth, mediaHeight: paneHeight };
  }

  function clampFloatingPreviewPan() {
    const zoom = clamp(floatingPreviewViewportState.zoom, 0.25, 4);
    const { paneWidth, paneHeight, mediaWidth, mediaHeight } = getFloatingPreviewMediaBaseDisplaySize();
    if (!paneWidth || !paneHeight || !mediaWidth || !mediaHeight) {
      floatingPreviewViewportState.panX = 0;
      floatingPreviewViewportState.panY = 0;
      return;
    }
    const scaledWidth = mediaWidth * zoom;
    const scaledHeight = mediaHeight * zoom;
    const maxPanX = Math.max(0, (scaledWidth - paneWidth) / 2);
    const maxPanY = Math.max(0, (scaledHeight - paneHeight) / 2);
    floatingPreviewViewportState.panX = clamp(floatingPreviewViewportState.panX, -maxPanX, maxPanX);
    floatingPreviewViewportState.panY = clamp(floatingPreviewViewportState.panY, -maxPanY, maxPanY);
  }

  function applyFloatingPreviewMediaTransform() {
    const zoom = clamp(floatingPreviewViewportState.zoom, 0.25, 4);
    floatingPreviewViewportState.zoom = zoom;
    clampFloatingPreviewPan();
    const transform = `translate(${Math.round(floatingPreviewViewportState.panX)}px, ${Math.round(floatingPreviewViewportState.panY)}px) scale(${zoom})`;
    const nodes = [
      dom.floatingPreviewCanvas,
      dom.floatingPreviewReferenceImage,
      dom.floatingPreviewReferenceVideo,
      dom.floatingPreviewReferenceAudio,
    ];
    nodes.forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      if (node.hidden) return;
      node.style.transform = transform;
    });
    syncFloatingPreviewZoomUI();
  }

  function resetFloatingPreviewViewportTransform() {
    floatingPreviewViewportState.zoom = 1;
    floatingPreviewViewportState.panX = 0;
    floatingPreviewViewportState.panY = 0;
    applyFloatingPreviewMediaTransform();
  }

  function setFloatingPreviewZoomFromPercent(percent) {
    const zoomPercent = clamp(Math.round(Number(percent) || 100), 25, 400);
    floatingPreviewViewportState.zoom = zoomPercent / 100;
    applyFloatingPreviewMediaTransform();
  }

  function beginFloatingPreviewMediaPan(event) {
    if (!(event.target instanceof Element)) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('.floating-preview-panel__reference-slots')) return;
    if (event.target.closest('.floating-preview-panel__zoom-row')) return;
    const activeMedia = getFloatingPreviewActiveMediaNode();
    if (!activeMedia) return;
    floatingPreviewViewportState.pointerId = event.pointerId ?? -1;
    floatingPreviewViewportState.startClientX = Number(event.clientX) || 0;
    floatingPreviewViewportState.startClientY = Number(event.clientY) || 0;
    floatingPreviewViewportState.startPanX = floatingPreviewViewportState.panX;
    floatingPreviewViewportState.startPanY = floatingPreviewViewportState.panY;
    floatingPreviewViewportState.isPanning = true;
    const pane = event.currentTarget;
    if (pane instanceof HTMLElement) {
      pane.classList.add('is-panning');
      try {
        pane.setPointerCapture?.(event.pointerId);
      } catch (error) {
        // ignore pointer capture errors
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function updateFloatingPreviewMediaPan(event) {
    if (!floatingPreviewViewportState.isPanning) return;
    if (floatingPreviewViewportState.pointerId !== (event.pointerId ?? -1)) return;
    const dx = (Number(event.clientX) || 0) - floatingPreviewViewportState.startClientX;
    const dy = (Number(event.clientY) || 0) - floatingPreviewViewportState.startClientY;
    floatingPreviewViewportState.panX = floatingPreviewViewportState.startPanX + dx;
    floatingPreviewViewportState.panY = floatingPreviewViewportState.startPanY + dy;
    clampFloatingPreviewPan();
    applyFloatingPreviewMediaTransform();
    event.preventDefault();
  }

  function endFloatingPreviewMediaPan(event) {
    if (!floatingPreviewViewportState.isPanning) return;
    if (event && floatingPreviewViewportState.pointerId !== (event.pointerId ?? -1)) return;
    floatingPreviewViewportState.isPanning = false;
    floatingPreviewViewportState.pointerId = null;
    const panes = [dom.floatingPreviewPaneCanvas, dom.floatingPreviewPaneReference];
    panes.forEach(pane => {
      if (!(pane instanceof HTMLElement)) return;
      pane.classList.remove('is-panning');
      try {
        if (event) {
          pane.releasePointerCapture?.(event.pointerId);
        }
      } catch (error) {
        // ignore pointer release errors
      }
    });
  }

  function clampFloatingPreviewRect(rectLike) {
    const base = normalizeFloatingPreviewState(rectLike, state.floatingPreview);
    const viewport = getFloatingPreviewViewportSize();
    const margin = 6;
    const viewportWidth = Math.max(0, viewport.width);
    const viewportHeight = Math.max(0, viewport.height);
    const minWidth = viewportWidth > 0
      ? Math.min(FLOATING_PREVIEW_MIN_SIZE, Math.max(80, viewportWidth - margin * 2))
      : FLOATING_PREVIEW_MIN_SIZE;
    const minHeight = viewportHeight > 0
      ? Math.min(FLOATING_PREVIEW_MIN_SIZE, Math.max(80, viewportHeight - margin * 2))
      : FLOATING_PREVIEW_MIN_SIZE;
    const maxWidth = viewportWidth > 0
      ? Math.max(minWidth, Math.min(FLOATING_PREVIEW_MAX_SIZE, viewportWidth - margin * 2))
      : FLOATING_PREVIEW_MAX_SIZE;
    const maxHeight = viewportHeight > 0
      ? Math.max(minHeight, Math.min(FLOATING_PREVIEW_MAX_SIZE, viewportHeight - margin * 2))
      : FLOATING_PREVIEW_MAX_SIZE;
    const width = clamp(Math.round(base.width), minWidth, maxWidth);
    const height = clamp(Math.round(base.height), minHeight, maxHeight);
    const maxX = viewportWidth > 0 ? Math.max(margin, viewportWidth - width - margin) : base.x;
    const maxY = viewportHeight > 0 ? Math.max(margin, viewportHeight - height - margin) : base.y;
    const minX = viewportWidth > 0 ? margin : base.x;
    const minY = viewportHeight > 0 ? margin : base.y;
    return {
      enabled: Boolean(base.enabled),
      x: clamp(Math.round(base.x), minX, maxX),
      y: clamp(Math.round(base.y), minY, maxY),
      width,
      height,
    };
  }

  function fitFloatingPreviewCanvasToPanel() {
    const body = dom.floatingPreviewPaneCanvas || dom.floatingPreviewBody;
    const canvas = dom.floatingPreviewCanvas;
    if (!(body instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    const sourceWidth = isFloatingVoxelPreviewActive()
      ? Math.max(1, Math.round(Number(voxelExtensionPreviewMeta?.width) || 1))
      : Math.max(1, Math.round(Number(state.width) || 1));
    const sourceHeight = isFloatingVoxelPreviewActive()
      ? Math.max(1, Math.round(Number(voxelExtensionPreviewMeta?.height) || 1))
      : Math.max(1, Math.round(Number(state.height) || 1));
    const availableWidth = Math.max(1, Math.floor(body.clientWidth));
    const availableHeight = Math.max(1, Math.floor(body.clientHeight));
    const sourceAspect = sourceWidth / sourceHeight;
    const availableAspect = availableWidth / availableHeight;
    let drawWidth = availableWidth;
    let drawHeight = availableHeight;
    if (availableAspect > sourceAspect) {
      drawHeight = availableHeight;
      drawWidth = Math.max(1, Math.round(drawHeight * sourceAspect));
    } else {
      drawWidth = availableWidth;
      drawHeight = Math.max(1, Math.round(drawWidth / sourceAspect));
    }
    drawWidth = Math.min(availableWidth, Math.max(1, drawWidth));
    drawHeight = Math.min(availableHeight, Math.max(1, drawHeight));
    canvas.style.aspectRatio = `${sourceWidth} / ${sourceHeight}`;
    canvas.style.width = `${drawWidth}px`;
    canvas.style.height = `${drawHeight}px`;
    applyFloatingPreviewMediaTransform();
  }

  function applyFloatingPreviewPanelRect({ persist = false, render = true } = {}) {
    const panel = dom.floatingPreviewPanel;
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    state.floatingPreview = clampFloatingPreviewRect(state.floatingPreview);
    const { x, y, width, height } = state.floatingPreview;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    fitFloatingPreviewCanvasToPanel();
    if (render) {
      renderFloatingPreviewPanel();
    }
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function updateFloatingPreviewPanelPlaybackButtons() {
    const isVoxelPreview = isVoxelExtensionModeEnabled();
    const isPlaying = Boolean(state.playback?.isPlaying);
    const showPlayback = normalizeFloatingPreviewTab(floatingPreviewReferenceState.tab) === 'preview';
    const activeReference = floatingPreviewReferenceState.items[floatingPreviewReferenceState.activeIndex] || null;
    const canPlayReference = Boolean(
      !showPlayback
      && activeReference
      && (activeReference.kind === 'video' || activeReference.kind === 'audio')
    );
    const referenceMediaPlaying = Boolean(
      (dom.floatingPreviewReferenceVideo instanceof HTMLVideoElement
        && !dom.floatingPreviewReferenceVideo.hidden
        && !dom.floatingPreviewReferenceVideo.paused)
      || (dom.floatingPreviewReferenceAudio instanceof HTMLAudioElement
        && !dom.floatingPreviewReferenceAudio.hidden
        && !dom.floatingPreviewReferenceAudio.paused)
    );
    const previewShouldShowStop = showPlayback && !isVoxelPreview && isPlaying;
    const referenceShouldShowStop = !showPlayback && canPlayReference && referenceMediaPlaying;
    const showStop = previewShouldShowStop || referenceShouldShowStop;
    const showPlay = !showStop;
    if (dom.controls.floatingPreviewPlay instanceof HTMLButtonElement) {
      const disabled = showPlayback
        ? (isVoxelPreview || isPlaying)
        : !canPlayReference;
      dom.controls.floatingPreviewPlay.hidden = !showPlay;
      dom.controls.floatingPreviewPlay.disabled = disabled;
      dom.controls.floatingPreviewPlay.setAttribute('aria-hidden', String(!showPlay));
    }
    if (dom.controls.floatingPreviewStop instanceof HTMLButtonElement) {
      const disabled = showPlayback
        ? (isVoxelPreview || !isPlaying)
        : (!canPlayReference || !referenceMediaPlaying);
      dom.controls.floatingPreviewStop.hidden = !showStop;
      dom.controls.floatingPreviewStop.disabled = disabled;
      dom.controls.floatingPreviewStop.setAttribute('aria-hidden', String(!showStop));
    }
  }

  function renderFloatingPreviewPanel() {
    const panel = dom.floatingPreviewPanel;
    const canvas = dom.floatingPreviewCanvas;
    if (!(panel instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (panel.hidden || (!state.floatingPreview?.enabled && !isVoxelExtensionModeEnabled())) {
      return;
    }
    const isVoxelPreview = isFloatingVoxelPreviewActive();
    const width = isVoxelPreview
      ? Math.max(1, Math.round(Number(voxelExtensionPreviewMeta?.width) || 1))
      : Math.max(1, Math.round(Number(state.width) || 1));
    const height = isVoxelPreview
      ? Math.max(1, Math.round(Number(voxelExtensionPreviewMeta?.height) || 1))
      : Math.max(1, Math.round(Number(state.height) || 1));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      floatingPreviewCtx = null;
    }
    if (!floatingPreviewCtx) {
      floatingPreviewCtx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
      if (!floatingPreviewCtx) {
        return;
      }
      floatingPreviewCtx.imageSmoothingEnabled = false;
    }
    const pixels = isVoxelPreview
      ? voxelExtensionPreviewPixels
      : compositeFramePixels(getActiveFrame(), width, height, state.palette, {
        useLocalLayerPreviewVisibility: true,
        useLocalLayerPreviewOpacity: true,
      });
    let imageData = null;
    try {
      imageData = new ImageData(pixels, width, height);
    } catch (error) {
      imageData = floatingPreviewCtx.createImageData(width, height);
      imageData.data.set(pixels);
    }
    floatingPreviewCtx.putImageData(imageData, 0, 0);
    fitFloatingPreviewCanvasToPanel();
    renderFloatingPreviewGizmo();
  }

  function syncFloatingPreviewPanelVisibility({ persist = false } = {}) {
    const panel = dom.floatingPreviewPanel;
    const voxelModeEnabled = isVoxelExtensionModeEnabled();
    const enabled = Boolean(state.floatingPreview?.enabled) || voxelModeEnabled;
    if (dom.controls.toggleFloatingPreview instanceof HTMLInputElement) {
      dom.controls.toggleFloatingPreview.checked = enabled;
      dom.controls.toggleFloatingPreview.disabled = voxelModeEnabled;
    }
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    if (!enabled) {
      panel.classList.add('is-hidden');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      renderFloatingPreviewGizmo();
      updateFloatingPreviewPanelPlaybackButtons();
      if (persist) {
        scheduleSessionPersist({ includeSnapshots: false });
      }
      return;
    }
    panel.classList.remove('is-hidden');
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.toggle('is-voxel-preview', voxelModeEnabled);
    applyFloatingPreviewTabUI();
    applyFloatingPreviewPanelRect({ persist, render: true });
    updateFloatingPreviewPanelPlaybackButtons();
  }

  function setFloatingPreviewEnabled(enabled, { persist = true } = {}) {
    const next = Boolean(enabled);
    const previous = Boolean(state.floatingPreview?.enabled);
    state.floatingPreview = normalizeFloatingPreviewState(state.floatingPreview, FLOATING_PREVIEW_DEFAULT_STATE);
    state.floatingPreview.enabled = next;
    syncFloatingPreviewPanelVisibility({ persist });
    updateFloatingPreviewActionToolButtons();
    if (next && !previous) {
      updateAutosaveStatus(localizeText('小窓プレビューを表示しました', 'Floating preview enabled'), 'info');
    } else if (!next && previous) {
      updateAutosaveStatus(localizeText('小窓プレビューを非表示にしました', 'Floating preview hidden'), 'info');
    }
  }

  function teardownFloatingPreviewPanelPointerHandlers() {
    window.removeEventListener('pointermove', handleFloatingPreviewPanelPointerMove);
    window.removeEventListener('pointerup', handleFloatingPreviewPanelPointerUp);
    window.removeEventListener('pointercancel', handleFloatingPreviewPanelPointerCancel);
  }

  function stopFloatingPreviewPanelInteraction({ persist = true } = {}) {
    if (!floatingPreviewPanelState.mode) {
      return;
    }
    const panel = dom.floatingPreviewPanel;
    if (panel instanceof HTMLElement) {
      panel.classList.remove('is-moving');
    }
    const target = floatingPreviewPanelState.target;
    if (target instanceof HTMLElement && Number.isFinite(floatingPreviewPanelState.pointerId)) {
      try {
        target.releasePointerCapture?.(floatingPreviewPanelState.pointerId);
      } catch (error) {
        // ignore pointer capture release errors
      }
    }
    floatingPreviewPanelState.pointerId = null;
    floatingPreviewPanelState.mode = null;
    floatingPreviewPanelState.target = null;
    floatingPreviewPanelState.startRect = null;
    teardownFloatingPreviewPanelPointerHandlers();
    applyFloatingPreviewPanelRect({ persist, render: true });
  }

  function beginFloatingPreviewPanelInteraction(event, mode) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    if ((!(state.floatingPreview?.enabled) && !isVoxelExtensionModeEnabled()) || floatingPreviewPanelState.mode) {
      return;
    }
    const panel = dom.floatingPreviewPanel;
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    state.floatingPreview = clampFloatingPreviewRect(state.floatingPreview);
    floatingPreviewPanelState.pointerId = event.pointerId ?? -1;
    floatingPreviewPanelState.mode = mode;
    floatingPreviewPanelState.target = target;
    floatingPreviewPanelState.startClientX = event.clientX;
    floatingPreviewPanelState.startClientY = event.clientY;
    floatingPreviewPanelState.startRect = { ...state.floatingPreview };
    panel.classList.add('is-moving');
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // ignore pointer capture errors
    }
    window.addEventListener('pointermove', handleFloatingPreviewPanelPointerMove, { passive: false });
    window.addEventListener('pointerup', handleFloatingPreviewPanelPointerUp);
    window.addEventListener('pointercancel', handleFloatingPreviewPanelPointerCancel);
  }

  function handleFloatingPreviewPanelPointerMove(event) {
    if (floatingPreviewPanelState.pointerId !== event.pointerId || !floatingPreviewPanelState.mode) {
      return;
    }
    const baseRect = floatingPreviewPanelState.startRect;
    if (!baseRect) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - floatingPreviewPanelState.startClientX;
    const dy = event.clientY - floatingPreviewPanelState.startClientY;
    const next = { ...baseRect };
    if (floatingPreviewPanelState.mode === 'drag') {
      next.x = baseRect.x + dx;
      next.y = baseRect.y + dy;
    } else {
      next.width = baseRect.width + dx;
      next.height = baseRect.height + dy;
    }
    next.enabled = true;
    state.floatingPreview = clampFloatingPreviewRect(next);
    applyFloatingPreviewPanelRect({ persist: false, render: false });
  }

  function handleFloatingPreviewPanelPointerUp(event) {
    if (floatingPreviewPanelState.pointerId !== event.pointerId) {
      return;
    }
    stopFloatingPreviewPanelInteraction({ persist: true });
  }

  function handleFloatingPreviewPanelPointerCancel(event) {
    if (floatingPreviewPanelState.pointerId !== event.pointerId) {
      return;
    }
    stopFloatingPreviewPanelInteraction({ persist: true });
  }

  function handleFloatingPreviewPanelViewportChange() {
    if (!state.floatingPreview?.enabled && !isVoxelExtensionModeEnabled()) {
      return;
    }
    applyFloatingPreviewPanelRect({ persist: false, render: true });
  }

  function setupFloatingPreviewPanel() {
    const panel = dom.floatingPreviewPanel;
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    applyFloatingPreviewTabUI();
    setFloatingPreviewReferenceImageUrl('');
    syncFloatingPreviewZoomUI();
    panel.addEventListener('pointerdown', event => {
      event.stopPropagation();
    });
    panel.addEventListener('click', event => {
      event.stopPropagation();
    });
    if (dom.floatingPreviewPaneCanvas instanceof HTMLElement) {
      dom.floatingPreviewPaneCanvas.addEventListener('pointerdown', beginFloatingPreviewMediaPan);
    }
    if (dom.floatingPreviewPaneReference instanceof HTMLElement) {
      dom.floatingPreviewPaneReference.addEventListener('pointerdown', beginFloatingPreviewMediaPan);
    }
    window.addEventListener('pointermove', updateFloatingPreviewMediaPan, { passive: false });
    window.addEventListener('pointerup', endFloatingPreviewMediaPan);
    window.addEventListener('pointercancel', endFloatingPreviewMediaPan);
    if (dom.floatingPreviewZoomInput instanceof HTMLInputElement) {
      dom.floatingPreviewZoomInput.addEventListener('input', event => {
        const input = event.currentTarget;
        if (!(input instanceof HTMLInputElement)) return;
        setFloatingPreviewZoomFromPercent(input.value);
      });
    }
    if (dom.floatingPreviewPanReset instanceof HTMLButtonElement) {
      dom.floatingPreviewPanReset.addEventListener('pointerdown', event => {
        event.stopPropagation();
      });
      dom.floatingPreviewPanReset.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        resetFloatingPreviewViewportTransform();
      });
    }
    if (dom.floatingPreviewCanvas instanceof HTMLCanvasElement) {
      dom.floatingPreviewCanvas.addEventListener('pointerdown', event => {
        if (!isVoxelExtensionModeEnabled()) {
          return;
        }
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startVoxelPreviewRotateInteraction(event, {
          kind: 'floating-voxel-preview',
          drawing: dom.floatingPreviewCanvas,
        });
      });
      dom.floatingPreviewCanvas.addEventListener('dblclick', event => {
        if (!isVoxelExtensionModeEnabled()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        voxelExtensionState = normalizeVoxelExtensionState({
          ...voxelExtensionState,
          previewYawDeg: VOXEL_EXTENSION_DEFAULT_YAW_DEG,
          previewPitchDeg: VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG,
        }, VOXEL_EXTENSION_DEFAULT_STATE);
        setVoxelPreviewOrientationForFrameIndex(
          state.activeFrame,
          VOXEL_EXTENSION_DEFAULT_YAW_DEG,
          VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG
        );
        syncVoxelExtensionPreviewFromSource({ updateViewport: true });
        requestRender();
        requestOverlayRender();
        markAutosaveDirty();
        scheduleAutosaveSnapshot();
        scheduleSessionPersist();
      });
    }
    if (dom.floatingPreviewHeader instanceof HTMLElement) {
      dom.floatingPreviewHeader.addEventListener('pointerdown', event => {
        beginFloatingPreviewPanelInteraction(event, 'drag');
      });
    }
    if (dom.floatingPreviewResizeHandle instanceof HTMLButtonElement) {
      dom.floatingPreviewResizeHandle.addEventListener('pointerdown', event => {
        beginFloatingPreviewPanelInteraction(event, 'resize');
      });
    }
    if (dom.controls.floatingPreviewPlay instanceof HTMLButtonElement) {
      dom.controls.floatingPreviewPlay.addEventListener('pointerdown', event => {
        event.stopPropagation();
      });
      dom.controls.floatingPreviewPlay.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (normalizeFloatingPreviewTab(floatingPreviewReferenceState.tab) === 'reference') {
          if (dom.floatingPreviewReferenceVideo instanceof HTMLVideoElement && !dom.floatingPreviewReferenceVideo.hidden) {
            dom.floatingPreviewReferenceVideo.load();
            dom.floatingPreviewReferenceVideo.play().catch(error => {
              console.warn('[floating-preview] reference-video-play-failed', {
                message: String(error?.message || error || ''),
                type: dom.floatingPreviewReferenceVideo?.currentSrc || '',
              });
              updateAutosaveStatus(
                localizeText('参考動画を再生できませんでした', 'Failed to play reference video'),
                'warn'
              );
            });
          } else if (dom.floatingPreviewReferenceAudio instanceof HTMLAudioElement && !dom.floatingPreviewReferenceAudio.hidden) {
            dom.floatingPreviewReferenceAudio.load();
            dom.floatingPreviewReferenceAudio.play().catch(error => {
              console.warn('[floating-preview] reference-audio-play-failed', {
                message: String(error?.message || error || ''),
                type: dom.floatingPreviewReferenceAudio?.currentSrc || '',
              });
              updateAutosaveStatus(
                localizeText('参考音声を再生できませんでした', 'Failed to play reference audio'),
                'warn'
              );
            });
          } else if (dom.floatingPreviewReferenceImage instanceof HTMLImageElement && !dom.floatingPreviewReferenceImage.hidden) {
            const src = dom.floatingPreviewReferenceImage.getAttribute('src') || '';
            if (src) {
              dom.floatingPreviewReferenceImage.setAttribute('src', '');
              dom.floatingPreviewReferenceImage.setAttribute('src', src);
            }
          }
          updateFloatingPreviewPanelPlaybackButtons();
          return;
        }
        if (!state.playback.isPlaying) {
          startPlayback();
        }
      });
    }
    if (dom.controls.floatingPreviewStop instanceof HTMLButtonElement) {
      dom.controls.floatingPreviewStop.addEventListener('pointerdown', event => {
        event.stopPropagation();
      });
      dom.controls.floatingPreviewStop.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (normalizeFloatingPreviewTab(floatingPreviewReferenceState.tab) === 'reference') {
          if (dom.floatingPreviewReferenceVideo instanceof HTMLVideoElement && !dom.floatingPreviewReferenceVideo.hidden) {
            dom.floatingPreviewReferenceVideo.pause();
          }
          if (dom.floatingPreviewReferenceAudio instanceof HTMLAudioElement && !dom.floatingPreviewReferenceAudio.hidden) {
            dom.floatingPreviewReferenceAudio.pause();
          }
          updateFloatingPreviewPanelPlaybackButtons();
          return;
        }
        stopPlayback();
      });
    }
    if (Array.isArray(dom.floatingPreviewTabButtons)) {
      dom.floatingPreviewTabButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) return;
        button.addEventListener('pointerdown', event => {
          event.stopPropagation();
        });
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const tab = button.dataset.floatingPreviewTab || '';
          const hasAnyReference = floatingPreviewReferenceState.objectUrls
            .slice(0, 5)
            .some(url => Boolean(url));
          setFloatingPreviewTab(tab, {
            requestFilePicker: normalizeFloatingPreviewTab(tab) === 'reference' && !hasAnyReference,
          });
        });
      });
    }
    if (dom.floatingPreviewReferenceInput instanceof HTMLInputElement) {
      dom.floatingPreviewReferenceInput.addEventListener('change', event => {
        const input = event.currentTarget;
        if (!(input instanceof HTMLInputElement) || !input.files || !input.files.length) {
          return;
        }
        void setFloatingPreviewReferenceImageFromFile(input.files[0]);
        input.value = '';
      });
    }
    if (dom.floatingPreviewReferenceVideo instanceof HTMLVideoElement) {
      dom.floatingPreviewReferenceVideo.addEventListener('play', updateFloatingPreviewPanelPlaybackButtons);
      dom.floatingPreviewReferenceVideo.addEventListener('pause', updateFloatingPreviewPanelPlaybackButtons);
      dom.floatingPreviewReferenceVideo.addEventListener('ended', updateFloatingPreviewPanelPlaybackButtons);
    }
    if (dom.floatingPreviewReferenceAudio instanceof HTMLAudioElement) {
      dom.floatingPreviewReferenceAudio.addEventListener('play', updateFloatingPreviewPanelPlaybackButtons);
      dom.floatingPreviewReferenceAudio.addEventListener('pause', updateFloatingPreviewPanelPlaybackButtons);
      dom.floatingPreviewReferenceAudio.addEventListener('ended', updateFloatingPreviewPanelPlaybackButtons);
    }
    window.addEventListener('resize', handleFloatingPreviewPanelViewportChange);
    window.addEventListener('orientationchange', handleFloatingPreviewPanelViewportChange);
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', handleFloatingPreviewPanelViewportChange);
      window.visualViewport.addEventListener('scroll', handleFloatingPreviewPanelViewportChange);
    }
    syncFloatingPreviewPanelVisibility({ persist: false });
  }

  return Object.freeze({
    getFloatingPreviewViewportSize,
    isFloatingVoxelPreviewActive,
    normalizeFloatingPreviewTab,
    applyFloatingPreviewTabUI,
    setFloatingPreviewTab,
    setFloatingPreviewReferenceImageUrl,
    clearFloatingPreviewReferenceObjectUrls,
    applyFloatingPreviewReferenceMediaPayload,
    restoreFloatingPreviewReferenceMediaForActiveProject,
    renderFloatingPreviewReferenceSlots,
    removeFloatingPreviewReferenceAtIndex,
    setFloatingPreviewReferenceActiveIndex,
    getFloatingPreviewReferenceKind,
    optimizeReferenceImageFile,
    setFloatingPreviewReferenceImageFromFile,
    getFloatingPreviewActiveMediaNode,
    syncFloatingPreviewZoomUI,
    getFloatingPreviewMediaBaseDisplaySize,
    clampFloatingPreviewPan,
    applyFloatingPreviewMediaTransform,
    resetFloatingPreviewViewportTransform,
    setFloatingPreviewZoomFromPercent,
    beginFloatingPreviewMediaPan,
    updateFloatingPreviewMediaPan,
    endFloatingPreviewMediaPan,
    clampFloatingPreviewRect,
    fitFloatingPreviewCanvasToPanel,
    applyFloatingPreviewPanelRect,
    updateFloatingPreviewPanelPlaybackButtons,
    renderFloatingPreviewPanel,
    syncFloatingPreviewPanelVisibility,
    setFloatingPreviewEnabled,
    teardownFloatingPreviewPanelPointerHandlers,
    stopFloatingPreviewPanelInteraction,
    beginFloatingPreviewPanelInteraction,
    handleFloatingPreviewPanelPointerMove,
    handleFloatingPreviewPanelPointerUp,
    handleFloatingPreviewPanelPointerCancel,
    handleFloatingPreviewPanelViewportChange,
    setupFloatingPreviewPanel,
  });
      }
    })(scope);
  }

  root.floatingPreviewPanelUtils = Object.freeze({
    createFloatingPreviewPanelUtils,
  });
})();
