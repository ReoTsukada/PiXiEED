const extensionOf = filename => String(filename || '').split('.').pop().toLowerCase();

export function classifyConversionPreview(filename, audioHint = false) {
  const extension = extensionOf(filename);
  if ((extension === 'webm' && audioHint) || /^(wav|mp3|ogg|opus|flac|aiff|m4a)$/.test(extension)) return 'audio';
  if (/^(mp4|webm)$/.test(extension)) return 'video';
  if (/^(png|jpg|jpeg|webp|gif|apng|svg|bmp|ico)$/.test(extension)) return 'img';
  return null;
}

export function createConversionPreviewController() {
  let resultKey = '', identity = '', attempt = 0, href = '', filename = '', type = null;
  let eligible = false, inspectResult = false, failed = false;

  const snapshot = load => Object.freeze({ identity, href, filename, type, eligible, inspectResult, failed, load });
  const beginAttempt = () => { identity = `${resultKey}#${++attempt}`; failed = false; };

  return Object.freeze({
    update({ media = false, ready = false, stageAvailable = false, result = null, audioHint = false } = {}) {
      const nextType = classifyConversionPreview(result?.filename, audioHint);
      const nextHref = String(result?.href || '');
      const nextFilename = String(result?.filename || '');
      const nextKey = nextHref ? JSON.stringify([nextHref, nextType]) : '';
      const changed = nextKey !== resultKey;
      resultKey = nextKey; href = nextHref; filename = nextFilename; type = nextType;
      eligible = Boolean(media && ready && nextHref && stageAvailable);
      if (changed) { failed = false; identity = ''; }
      if (!eligible) inspectResult = false;
      const load = Boolean(eligible && inspectResult && changed);
      if (load) beginAttempt();
      return snapshot(load);
    },
    selectInspect(value) {
      const next = Boolean(value && eligible);
      const changed = next !== inspectResult;
      inspectResult = next;
      // A healthy resource remains loaded while the user inspects the source.
      // Only the first inspection or an explicit retry after failure starts a load.
      const load = Boolean(next && (!identity || failed));
      if (load) beginAttempt();
      return snapshot(load);
    },
    fail(capturedIdentity) {
      if (!capturedIdentity || capturedIdentity !== identity) return snapshot(false);
      failed = true;
      return snapshot(false);
    },
  });
}
