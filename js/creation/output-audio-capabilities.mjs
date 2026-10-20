const RECORDER_FORMATS = [
  { value: 'm4a', extension: 'm4a', mimeType: 'audio/mp4;codecs=mp4a.40.2', label: 'M4A (AAC)' },
  { value: 'webm', extension: 'webm', mimeType: 'audio/webm;codecs=opus', label: 'WebM (Opus)' },
  { value: 'ogg', extension: 'ogg', mimeType: 'audio/ogg;codecs=opus', label: 'Ogg (Opus)' },
  { value: 'mp3', extension: 'mp3', mimeType: 'audio/mpeg', label: 'MP3' },
  { value: 'flac', extension: 'flac', mimeType: 'audio/flac', label: 'FLAC' }
];

/** Report formats this browser can record. WAV uses PiXiEED's built-in PCM encoder. */
export function listAudioOutputFormats({ MediaRecorderImpl = globalThis.MediaRecorder } = {}) {
  const hasRecorder = typeof MediaRecorderImpl === 'function' && typeof MediaRecorderImpl.isTypeSupported === 'function';
  const formats = [{ value: 'wav', extension: 'wav', mimeType: 'audio/wav', label: 'WAV (PCM)', available: true, reason: '' }];
  for (const format of RECORDER_FORMATS) {
    if (format.value === 'mp3' || format.value === 'flac') {
      formats.push({ ...format, available: false, reason: `${format.label}の音声エンコーダーは搭載していません。` });
      continue;
    }
    let available = false;
    if (hasRecorder) {
      try { available = MediaRecorderImpl.isTypeSupported(format.mimeType) === true; } catch { available = false; }
    }
    formats.push({
      ...format,
      available,
      reason: available ? '' : hasRecorder ? 'このブラウザーではこの形式を作成できません。' : 'このブラウザーでは音声の記録機能を利用できません。'
    });
  }
  return formats;
}
