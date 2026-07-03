(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportDeliveryUtils({
    SHARE_HASHTAG,
    IS_IOS_DEVICE,
    IS_ANDROID_DEVICE,
    DISABLE_FILE_SYSTEM_ACCESS_SAVE,
    SUPPORTS_ANCHOR_DOWNLOAD,
    DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS,
    CAN_USE_WEB_SHARE,
    NATIVE_FILESYSTEM_DIRECTORY_DOCUMENTS,
    NATIVE_FILESYSTEM_DIRECTORY_DATA,
    NATIVE_EXPORTS_SUBDIRECTORY,
    isNativeAppRuntime,
    sanitizeNativeFilename,
    normalizeNativeSubdirectory,
    isLikelyFileAlreadyExistsError,
    isNativePhotoLibraryExportMimeType,
    buildNumberedFilename,
    resolveUniqueExportDirectoryFilename,
    getFileHandleInExportDirectory,
    getExportDirectoryHandle,
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
  
    let nativeFilesystemPlugin = undefined;
    let nativeMediaPlugin = undefined;
  
    function getCapacitorRuntime() {
      if (typeof window === 'undefined') {
        return null;
      }
      return window.Capacitor || globalThis.Capacitor || null;
    }
  
    function getNativeFilesystemPlugin() {
      if (nativeFilesystemPlugin !== undefined) {
        return nativeFilesystemPlugin || null;
      }
      nativeFilesystemPlugin = null;
      const capacitor = getCapacitorRuntime();
      if (!capacitor || typeof capacitor.registerPlugin !== 'function') {
        return null;
      }
      try {
        nativeFilesystemPlugin = capacitor.registerPlugin('Filesystem');
      } catch (error) {
        console.warn('Filesystem plugin registration failed', error);
        nativeFilesystemPlugin = null;
      }
      return nativeFilesystemPlugin || null;
    }
  
    function getNativeMediaPlugin() {
      if (nativeMediaPlugin !== undefined) {
        return nativeMediaPlugin || null;
      }
      nativeMediaPlugin = null;
      const capacitor = getCapacitorRuntime();
      if (!capacitor || typeof capacitor.registerPlugin !== 'function') {
        return null;
      }
      try {
        nativeMediaPlugin = capacitor.registerPlugin('PiXiEEDMedia');
      } catch (error) {
        console.warn('PiXiEEDMedia plugin registration failed', error);
        nativeMediaPlugin = null;
      }
      return nativeMediaPlugin || null;
    }
  
    async function blobToBase64Payload(blob) {
      const dataUrl = await blobToDataUrl(blob);
      if (typeof dataUrl !== 'string' || !dataUrl) {
        throw new Error('Failed to convert blob to base64 payload');
      }
      const commaIndex = dataUrl.indexOf(',');
      return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    }
  
    async function ensureNativeFilesystemDocumentsAccess(filesystem) {
      if (!filesystem) {
        return false;
      }
      const capacitor = getCapacitorRuntime();
      const platform = capacitor && typeof capacitor.getPlatform === 'function'
        ? capacitor.getPlatform()
        : 'web';
      if (platform !== 'android') {
        return true;
      }
      if (typeof filesystem.checkPermissions !== 'function' && typeof filesystem.requestPermissions !== 'function') {
        return true;
      }
      try {
        if (typeof filesystem.checkPermissions === 'function') {
          const current = await filesystem.checkPermissions();
          if (current?.publicStorage === 'granted') {
            return true;
          }
        }
        if (typeof filesystem.requestPermissions === 'function') {
          const requested = await filesystem.requestPermissions();
          if (requested?.publicStorage === 'granted') {
            return true;
          }
        }
      } catch (error) {
        console.warn('Filesystem permission request failed', error);
      }
      return false;
    }
  
    async function writeBlobToNativeFilesystem(blob, filename, options = {}) {
      if (!(blob instanceof Blob) || blob.size <= 0 || !isNativeAppRuntime()) {
        return null;
      }
      const filesystem = getNativeFilesystemPlugin();
      if (!filesystem || typeof filesystem.writeFile !== 'function') {
        return null;
      }
      const safeFilename = sanitizeNativeFilename(filename);
      const subdirectory = normalizeNativeSubdirectory(
        options.subdirectory || NATIVE_EXPORTS_SUBDIRECTORY
      );
      const preferredDirectory = typeof options.directory === 'string' && options.directory
        ? options.directory
        : NATIVE_FILESYSTEM_DIRECTORY_DOCUMENTS;
      const directoryCandidates = preferredDirectory === NATIVE_FILESYSTEM_DIRECTORY_DOCUMENTS
        ? [NATIVE_FILESYSTEM_DIRECTORY_DOCUMENTS, NATIVE_FILESYSTEM_DIRECTORY_DATA]
        : [preferredDirectory, NATIVE_FILESYSTEM_DIRECTORY_DATA];
      let base64Data = null;
      let documentsPermissionResolved = false;
      let lastError = null;
      for (const directory of directoryCandidates) {
        try {
          if (directory === NATIVE_FILESYSTEM_DIRECTORY_DOCUMENTS && !documentsPermissionResolved) {
            documentsPermissionResolved = true;
            const granted = await ensureNativeFilesystemDocumentsAccess(filesystem);
            if (!granted) {
              continue;
            }
          }
          if (base64Data === null) {
            base64Data = await blobToBase64Payload(blob);
          }
          for (let sequence = 0; sequence <= 256; sequence += 1) {
            const resolvedFilename = buildNumberedFilename(safeFilename, sequence);
            const targetPath = subdirectory ? `${subdirectory}/${resolvedFilename}` : resolvedFilename;
            try {
              const result = await filesystem.writeFile({
                path: targetPath,
                data: base64Data,
                directory,
                recursive: true,
              });
              let uri = typeof result?.uri === 'string' ? result.uri : '';
              if (!uri && typeof filesystem.getUri === 'function') {
                try {
                  const uriResult = await filesystem.getUri({ path: targetPath, directory });
                  uri = typeof uriResult?.uri === 'string' ? uriResult.uri : '';
                } catch (uriError) {
                  console.warn('Failed to resolve native file URI', uriError);
                }
              }
              return { directory, path: targetPath, uri };
            } catch (writeError) {
              lastError = writeError;
              if (isLikelyFileAlreadyExistsError(writeError) && sequence < 256) {
                continue;
              }
              throw writeError;
            }
          }
        } catch (error) {
          lastError = error;
          console.warn(`Native file save failed (${directory})`, error);
        }
      }
      if (lastError) {
        console.warn('All native file save attempts failed', lastError);
      }
      return null;
    }
  
    async function writeBlobToNativePhotoLibrary(blob, filename, mimeType) {
      if (!(blob instanceof Blob) || blob.size <= 0 || !isNativeAppRuntime()) {
        return null;
      }
      if (!isNativePhotoLibraryExportMimeType(mimeType)) {
        return null;
      }
      const mediaPlugin = getNativeMediaPlugin();
      if (!mediaPlugin || typeof mediaPlugin.saveImageToLibrary !== 'function') {
        return null;
      }
      try {
        const data = await blobToBase64Payload(blob);
        const result = await mediaPlugin.saveImageToLibrary({
          data,
          filename: sanitizeNativeFilename(filename, 'PiXiEED.png'),
          mimeType,
        });
        return result || { saved: true };
      } catch (error) {
        console.warn('Native photo library save failed', error);
        return null;
      }
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
  
    async function writeBlobToExportDirectory(blob, filename) {
      if (!blob || !filename) {
        return null;
      }
      const resolvedFilename = await resolveUniqueExportDirectoryFilename(filename, {
        requestPermission: true,
      });
      if (!resolvedFilename) {
        return null;
      }
      const fileHandle = await getFileHandleInExportDirectory(resolvedFilename, {
        create: true,
        requestPermission: true,
      });
      if (!fileHandle) {
        return null;
      }
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'directory';
      } catch (error) {
        console.warn('Export directory write failed', error);
        // On some Android environments a zero-byte file can remain when createWritable fails.
        // Best-effort cleanup prevents an extra "broken" file from being left behind.
        try {
          const exportDirectoryHandle = getExportDirectoryHandle();
          if (exportDirectoryHandle && typeof exportDirectoryHandle.removeEntry === 'function') {
            await exportDirectoryHandle.removeEntry(resolvedFilename, { recursive: false });
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup partial export file', cleanupError);
        }
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
      const fileExtensions = Array.isArray(options.fileExtensions) && options.fileExtensions.length
        ? options.fileExtensions
        : (() => {
            const match = filename.match(/(\.[^./]+)$/);
            return match ? [match[1].toLowerCase()] : [];
          })();
  
      if (options.allowNativePhotoLibrary !== false) {
        const nativePhotoResult = await writeBlobToNativePhotoLibrary(blob, filename, mimeType);
        if (nativePhotoResult) {
          return 'gallery';
        }
      }
  
      if (options.allowNativeSave !== false) {
        const nativeSaveResult = await writeBlobToNativeFilesystem(blob, filename, {
          directory: options.nativeDirectory,
          subdirectory: options.nativeSubdirectory || NATIVE_EXPORTS_SUBDIRECTORY,
        });
        if (nativeSaveResult) {
          return 'native';
        }
      }
  
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
  
      if (!DISABLE_FILE_SYSTEM_ACCESS_SAVE && options.allowBoundDirectory !== false) {
        const directoryResult = await writeBlobToExportDirectory(blob, filename);
        if (directoryResult) {
          return directoryResult;
        }
      }
  
      if (!DISABLE_FILE_SYSTEM_ACCESS_SAVE && typeof window.showSaveFilePicker === 'function' && options.allowFilePicker !== false) {
        try {
          const pickerTypes =
            mimeType && fileExtensions.length
              ? [
                  {
                    description: `${mimeType} file`,
                    accept: { [mimeType]: fileExtensions },
                  },
                ]
              : undefined;
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: pickerTypes,
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return 'picker';
        } catch (error) {
          if (error && error.name === 'AbortError') {
            return 'picker-cancel';
          }
          console.warn('showSaveFilePicker failed', error);
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
      getCapacitorRuntime,
      getNativeFilesystemPlugin,
      getNativeMediaPlugin,
      blobToBase64Payload,
      ensureNativeFilesystemDocumentsAccess,
      writeBlobToNativeFilesystem,
      writeBlobToNativePhotoLibrary,
      shareBlobFile,
      writeBlobToExportDirectory,
      triggerDownloadFromBlob,
    };
  }

  root.exportDeliveryUtils = {
    createExportDeliveryUtils,
  };
})();
