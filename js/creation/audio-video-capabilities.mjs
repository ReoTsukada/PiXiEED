export function chooseAudioVideoMimeType(MediaRecorderImpl = globalThis.MediaRecorder, { includeAudio = true } = {}) {
  if (typeof MediaRecorderImpl !== 'function') return null;
  if (typeof MediaRecorderImpl.isTypeSupported !== 'function') return null;
  const choices = includeAudio ? [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm']
  ] : [
    ['video/mp4;codecs=avc1.42E01E', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm']
  ];
  return choices.find(([mimeType]) => MediaRecorderImpl.isTypeSupported(mimeType))?.reduce((result, value, index) => {
    if (index === 0) result.mimeType = value;
    if (index === 1) result.extension = value;
    return result;
  }, {}) || null;
}
