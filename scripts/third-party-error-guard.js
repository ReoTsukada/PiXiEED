(function () {
  function isIgnoredThirdPartyFrameError(message, filename) {
    const normalizedMessage = String(message || '');
    const normalizedFilename = String(filename || '');
    return normalizedMessage.includes('Blocked a frame with origin "https://googleads.g.doubleclick.net"')
      && normalizedMessage.includes('from accessing a frame with origin "https://pixieed.jp"')
      && /score\.min\.js(?:[?#]|$)/.test(normalizedFilename);
  }

  function isIgnoredAdsbygoogleTagError(message, filename) {
    const normalizedMessage = String(message || '');
    const normalizedFilename = String(filename || '');
    return normalizedMessage.includes("adsbygoogle.push() error: All 'ins' elements in the DOM with class=adsbygoogle already have ads in them.")
      && /pagead\/js\/adsbygoogle\.js(?:[?#]|$)/.test(normalizedFilename);
  }

  function isIgnoredThirdPartyError(message, filename) {
    return isIgnoredThirdPartyFrameError(message, filename)
      || isIgnoredAdsbygoogleTagError(message, filename);
  }

  window.addEventListener('error', (event) => {
    const message = event?.message || event?.error?.message || '';
    const filename = event?.filename || event?.error?.fileName || '';
    if (!isIgnoredThirdPartyError(message, filename)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = typeof reason === 'string'
      ? reason
      : reason?.message || '';
    const filename = reason?.fileName || '';
    if (!isIgnoredThirdPartyError(message, filename)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
