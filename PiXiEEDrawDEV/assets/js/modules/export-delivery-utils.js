(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportDeliveryUtils({
    SHARE_HASHTAG,
    IS_IOS_DEVICE,
    IS_ANDROID_DEVICE,
    SUPPORTS_ANCHOR_DOWNLOAD,
    DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS,
    CAN_USE_WEB_SHARE,
  } = {}) {
    function canvasToBlob(canvas, mimeType, quality) {
      return new Promise((resolve, reject) => {
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(blob => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob returned null'));
            }
          }, mimeType, quality);
          return;
        }
        try {
          const dataUrl = canvas.toDataURL(mimeType, quality);
          const blob = dataUrlToBlob(dataUrl, mimeType);
          resolve(blob);
        } catch (error) {
          reject(error);
        }
      });
    }
  
    function dataUrlToBlob(dataUrl, mimeType) {
      const parts = dataUrl.split(',');
      if (parts.length < 2) {
        throw new Error('Invalid data URL');
      }
      const byteString = window.atob(parts[1]);
      const length = byteString.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = byteString.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    }
  
    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => {
          const result = event?.target?.result;
          if (typeof result === 'string') {
            resolve(result);
          } else {
            reject(new Error('Failed to convert blob to data URL'));
          }
        };
        reader.onerror = () => {
          reject(reader.error || new Error('Failed to read blob as data URL'));
        };
        reader.readAsDataURL(blob);
      });
    }
  
    function appendShareHashtag(text) {
      if (!text) return SHARE_HASHTAG;
      return text.includes(SHARE_HASHTAG) ? text : `${text}\n${SHARE_HASHTAG}`;
    }
  
    function isStandaloneAppDisplayMode() {
      if (typeof window === 'undefined') {
        return false;
      }
      if (typeof window.matchMedia === 'function') {
        try {
          if (window.matchMedia('(display-mode: standalone)').matches) {
            return true;
          }
        } catch (error) {
          // Ignore display-mode detection errors and continue with fallback checks.
        }
      }
      return typeof navigator !== 'undefined' && navigator.standalone === true;
    }
  
    function isLightweightPersistenceMode() {
      return Boolean(IS_IOS_DEVICE || IS_ANDROID_DEVICE || isStandaloneAppDisplayMode());
    }
  
    async function shareBlobFile(blob, filename, { mimeType, shareTitle, shareText } = {}) {
      if (!CAN_USE_WEB_SHARE) {
        return null;
      }
      try {
        const file = new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' });
        if (!navigator.canShare({ files: [file] })) {
          return null;
        }
        await navigator.share({
          files: [file],
          title: shareTitle || filename,
          text: shareText || undefined,
        });
        return 'share';
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return 'share-cancel';
        }
        console.warn('navigator.share failed', error);
        return null;
      }
    }
  
    async function triggerDownloadFromBlob(blob, filename, options = {}) {
      if (!(blob instanceof Blob)) {
        throw new Error('Cannot download a non-blob value');
      }
      if (blob.size <= 0) {
        throw new Error('Cannot download an empty blob');
      }
      const mimeType = options.mimeType || blob.type || 'application/octet-stream';
      const shareTitle = options.shareTitle || filename;
      const shareText = appendShareHashtag(options.shareText || '');
      const shouldPreferShare = options.preferShare !== false && IS_IOS_DEVICE;
      const shouldAvoidAnchorDownload =
        options.allowAnchorDownload === false || (IS_IOS_DEVICE && isStandaloneAppDisplayMode());
      const forceAnchorDownload = IS_ANDROID_DEVICE || options.forceAnchorDownload === true;
  
      if (forceAnchorDownload && SUPPORTS_ANCHOR_DOWNLOAD && !shouldAvoidAnchorDownload) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
          anchor.remove();
          URL.revokeObjectURL(url);
        }, DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS);
        return 'download';
      }
  
      if (shouldPreferShare) {
        const shareResult = await shareBlobFile(blob, filename, { mimeType, shareTitle, shareText });
        if (shareResult) {
          return shareResult;
        }
      }
  
      if (SUPPORTS_ANCHOR_DOWNLOAD && !shouldAvoidAnchorDownload) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
          anchor.remove();
          URL.revokeObjectURL(url);
        }, DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS);
        return 'download';
      }
  
      if (!shouldPreferShare) {
        const shareResult = await shareBlobFile(blob, filename, { mimeType, shareTitle, shareText });
        if (shareResult) {
          return shareResult;
        }
      }
  
      const dataUrl = await blobToDataUrl(blob);
      const opened = window.open(dataUrl, '_blank', 'noopener');
      if (!opened) {
        window.location.href = dataUrl;
      }
      return 'window';
    }
  

    return {
      canvasToBlob,
      dataUrlToBlob,
      blobToDataUrl,
      appendShareHashtag,
      isStandaloneAppDisplayMode,
      isLightweightPersistenceMode,
      shareBlobFile,
      triggerDownloadFromBlob,
    };
  }

  root.exportDeliveryUtils = {
    createExportDeliveryUtils,
  };
})();
