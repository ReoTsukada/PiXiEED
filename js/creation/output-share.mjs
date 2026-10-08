/** Start a native file share synchronously from the click gesture and normalize its outcome. */
export function shareOutputFile(file, { navigatorRef = globalThis.navigator } = {}) {
  if (!file || typeof navigatorRef?.share !== 'function') return Promise.resolve({ status: 'unavailable' });
  try {
    if (typeof navigatorRef.canShare === 'function' && !navigatorRef.canShare({ files: [file] })) return Promise.resolve({ status: 'unavailable' });
    return Promise.resolve(navigatorRef.share({ files: [file] })).then(
      () => ({ status: 'shared' }),
      (error) => ({ status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error })
    );
  } catch (error) { return Promise.resolve({ status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error }); }
}
