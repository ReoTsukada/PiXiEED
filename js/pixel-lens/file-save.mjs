function isCurrentSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.isCurrent !== 'function') return false;
  try {
    return snapshot.isCurrent() === true;
  } catch {
    return false;
  }
}

function clearLink(link) {
  link?.removeAttribute?.('href');
  link?.removeAttribute?.('download');
}

function trackSaveMethod(entry, method) {
  try {
    if (typeof globalThis.gtag === 'function') {
      globalThis.gtag('event', 'file_export', {
        file_type: String(entry.filename).split('.').pop().toLowerCase(),
        method
      });
    }
  } catch {
    // Analytics must never interfere with saving.
  }
}

export function createCameraFileSave({
  dialog,
  navigatorRef = globalThis.navigator,
  FileRef = globalThis.File
} = {}) {
  const shareButton = dialog?.querySelector?.('#cameraShareFile');
  const downloadLink = dialog?.querySelector?.('#cameraDownloadFile');
  const openLink = dialog?.querySelector?.('#cameraOpenFile');
  const status = dialog?.querySelector?.('#cameraSaveStatus');
  const help = dialog?.querySelector?.('#cameraSaveHelp');
  const initialHelp = help?.textContent ?? '';

  let current = null;
  let generation = 0;
  let shareBusy = false;

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const isLive = (entry) => current === entry
    && generation === entry.generation
    && isCurrentSnapshot(entry)
    && dialog?.open === true;

  const updateShareButton = () => {
    if (!shareButton) return;
    if (!current) {
      shareButton.hidden = true;
      shareButton.disabled = true;
      return;
    }
    shareButton.hidden = !current.shareSupported;
    shareButton.disabled = !current.shareSupported || shareBusy;
  };

  const clear = () => {
    generation++;
    current = null;
    clearLink(downloadLink);
    clearLink(openLink);
    setStatus('');
    if (help) help.textContent = initialHelp;
    updateShareButton();
  };

  const onDownload = (event) => {
    const entry = current;
    if (!entry || !isLive(entry)) {
      event.preventDefault();
      return;
    }
    setStatus('ダウンロードを開始しました。見つからない場合は「画像を開く」から長押し、または右クリックして保存してください。');
    trackSaveMethod(entry, 'downloaded');
  };

  const onOpen = (event) => {
    const entry = current;
    if (!entry || !isLive(entry)) {
      event.preventDefault();
      return;
    }
    setStatus('画像を開きました。長押し、または右クリックして保存してください。');
  };

  const onShare = () => {
    const entry = current;
    if (!entry || !isLive(entry) || !entry.shareSupported || shareBusy) return;

    // Invoke share directly from the gesture: asynchronous preparation or ownership
    // checks can outlast the browser's transient user activation.
    shareBusy = true;
    updateShareButton();
    setStatus('共有画面で保存先を選んでください。');
    let shareResult;
    try {
      shareResult = navigatorRef.share({ files: [entry.file] });
    } catch (error) {
      shareBusy = false;
      updateShareButton();
      if (isLive(entry)) {
        if (error?.name === 'AbortError') {
          setStatus('共有をキャンセルしました。別の保存方法を選べます。');
        } else {
          setStatus('共有できませんでした。「ファイルを保存」または「画像を開く」を選んでください。');
        }
      }
      return;
    }
    Promise.resolve(shareResult).then(() => {
      if (isLive(entry)) {
        setStatus('共有画面にファイルを渡しました。');
        trackSaveMethod(entry, 'shared');
      }
    }, (error) => {
      if (!isLive(entry)) return;
      if (error?.name === 'AbortError') {
        setStatus('共有をキャンセルしました。別の保存方法を選べます。');
      } else {
        setStatus('共有できませんでした。「ファイルを保存」または「画像を開く」を選んでください。');
      }
    }).finally(() => {
      shareBusy = false;
      updateShareButton();
    });
  };

  downloadLink?.addEventListener?.('click', onDownload);
  openLink?.addEventListener?.('click', onOpen);
  shareButton?.addEventListener?.('click', onShare);
  dialog?.addEventListener?.('close', () => {
    // A close event queued by a previous reset must not clear a newer modal.
    if (dialog.open === false) clear();
  });

  return {
    show({ blob, url, filename, isCurrent } = {}) {
      if (!dialog || !blob || typeof url !== 'string' || !url
        || typeof filename !== 'string' || !filename
        || typeof isCurrent !== 'function' || !isCurrentSnapshot({ isCurrent })) {
        return false;
      }

      // Retire any prior snapshot before preparing links for this one.
      generation++;
      const entry = { blob, url, filename, isCurrent, generation, file: null, shareSupported: false };
      current = entry;

      if (downloadLink) {
        downloadLink.href = url;
        downloadLink.download = filename;
      }
      if (openLink) openLink.href = url;

      try {
        if (typeof FileRef === 'function') {
          entry.file = new FileRef([blob], filename, { type: blob.type || 'image/png' });
        }
      } catch {
        entry.file = null;
      }

      try {
        entry.shareSupported = Boolean(
          entry.file
          && typeof navigatorRef?.share === 'function'
          && typeof navigatorRef?.canShare === 'function'
          && navigatorRef.canShare({ files: [entry.file] })
        );
      } catch {
        entry.shareSupported = false;
      }
      updateShareButton();
      if (help) {
        help.textContent = entry.shareSupported
          ? initialHelp
          : '「ファイルを保存」を選んでください。保存できない場合は「画像を開く」から長押し、または右クリックして保存できます。';
      }
      setStatus('');

      try {
        if (typeof dialog.showModal !== 'function') {
          clear();
          return false;
        }
        dialog.showModal();
        return true;
      } catch {
        clear();
        return false;
      }
    },

    reset() {
      if (dialog?.open && typeof dialog.close === 'function') {
        try { dialog.close(); } catch { /* The state still needs clearing. */ }
      }
      clear();
    }
  };
}
