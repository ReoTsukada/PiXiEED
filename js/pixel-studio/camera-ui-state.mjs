const labels = {
  retake: 'もう一度撮影する',
  reload: 'ページを再読み込みする',
  retry: 'プレビューを再試行する',
  resume: 'カメラを再開する',
  capture: '表示中の画像を撮影',
  waiting: '画像を準備しています'
};

/** Derives one primary action for both the button and its click handler. */
export function deriveCameraPrimaryAction({ mode, hasResult = false, error = '', workerUnavailable = false } = {}) {
  if (mode === 'captured') return { action: 'retake', disabled: false, label: labels.retake };
  if (workerUnavailable || error === 'worker') return { action: 'reload', disabled: false, label: labels.reload };
  if (error) return { action: 'retry', disabled: false, label: labels.retry };
  if (mode === 'idle') return { action: 'resume', disabled: false, label: labels.resume };
  if (mode === 'loading') return { action: 'waiting', disabled: true, label: labels.waiting };
  if (mode === 'live' && hasResult) return { action: 'capture', disabled: false, label: labels.capture };
  return { action: 'waiting', disabled: true, label: labels.waiting };
}

/** Maps common camera failures to a useful Japanese action prompt. */
export function cameraStartErrorMessage(error, { secureContext = true, supported = true } = {}) {
  if (!secureContext) return '安全な接続で開くとカメラを利用できます。ページを開き直してください。';
  if (!supported) return 'このブラウザーではカメラを利用できません。';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'カメラへのアクセスが許可されていません。ブラウザーで許可してから中央のボタンを押してください。';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return '利用できるカメラが見つかりません。カメラを接続して中央のボタンを押してください。';
  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') return 'カメラを別のアプリが使用中の可能性があります。閉じてから中央のボタンを押してください。';
  return 'カメラを起動できませんでした。設定を確認して中央のボタンで再試行してください。';
}
