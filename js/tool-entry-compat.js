(() => {
  const params = new URLSearchParams(location.search);
  const validBridge = value => value.get('embed') === '1' && ['draw', 'camera', 'audio'].includes(value.get('embedRole')) && value.get('channel');
  const independentLegacy = /\/(?:audio|camera)(?:\/index\.html)?\/?$/.test(location.pathname) && (params.get('standalone') === '1' || ['draw', 'audio'].includes(params.get('to')) || ['drawRequest', 'audioRequest', 'drawCamera', 'audioCamera'].some(key => params.has(key)));
  // A tiny parser-time cue for direct workspace links. Query state wins over
  // history state, as it does in the retained host; bridges and legacy routes
  // keep their existing independent entry behavior.
  const workspace = params.has('workspace') ? params.get('workspace') === '1' : typeof history !== 'undefined' && history.state?.pixieedWorkspace === true;
  if (workspace && params.get('runtime') !== 'iframe' && !validBridge(params) && !independentLegacy && typeof document !== 'undefined') {
    document.documentElement.dataset.directBootstrap = '';
    const restoreShellStylesheet = link => {
      if (link.dataset.directShellState) return;
      link.dataset.directShellRequired = '';
      link.dataset.directShellHadMedia = link.hasAttribute('media') ? 'true' : 'false';
      link.dataset.directShellMedia = link.getAttribute('media') || '';
      link.dataset.directShellState = 'pending';
      link.addEventListener('load', () => { link.dataset.directShellState = 'loaded'; }, { once: true });
      link.addEventListener('error', () => {
        link.dataset.directShellState = 'error';
        document.documentElement.dataset.directShellStylesFailed = '';
        const status = document.querySelector('[data-embed-status]');
        const retry = document.querySelector('[data-direct-bootstrap-retry]');
        if (status) status.textContent = '画面の表示を読み込めませんでした。再読み込みして再試行してください。';
        if (retry) retry.hidden = false;
      }, { once: true });
      // Keep downloads concurrent but remove their render-blocking status. The
      // critical inline shell stays visible until all page and editor CSS loads.
      link.media = 'not all';
    };
    const deferShellStyles = node => {
      if (node.nodeType === 1 && node.matches('link[rel="stylesheet"]')) restoreShellStylesheet(node);
      if (node.querySelectorAll) node.querySelectorAll('link[rel="stylesheet"]').forEach(restoreShellStylesheet);
    };
    const headObserver = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) deferShellStyles(node);
    });
    headObserver.observe(document.head || document.documentElement, { childList: true, subtree: true });
    window.__PIXIEED_DIRECT_SHELL_CSS__ = {
      release() {
        headObserver.disconnect();
        document.querySelectorAll('link[data-direct-shell-required]').forEach(link => {
          if (link.dataset.directShellHadMedia === 'true') link.setAttribute('media', link.dataset.directShellMedia);
          else link.removeAttribute('media');
          delete link.dataset.directShellRequired;
          delete link.dataset.directShellHadMedia;
          delete link.dataset.directShellMedia;
          delete link.dataset.directShellState;
        });
      }
    };
    const markStatus = () => {
      const start = document.querySelector('[data-embed-start]');
      const status = document.querySelector('[data-embed-status]');
      const back = document.querySelector('[data-direct-bootstrap-back]');
      if (!start || !status || !back) return false;
      start.setAttribute('aria-busy', 'true');
      status.setAttribute('role', 'status');
      const failed = document.documentElement.dataset.directShellStylesFailed === '';
      status.textContent = failed ? '画面の表示を読み込めませんでした。再読み込みして再試行してください。' : '制作画面を準備しています…';
      const returnUrl = new URL(location.href);
      returnUrl.searchParams.set('workspace', '0');
      back.href = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
      back.hidden = false;
      const retry = document.querySelector('[data-direct-bootstrap-retry]');
      if (retry) {
        retry.hidden = !failed;
        retry.addEventListener('click', () => location.reload(), { once: true });
      }
      // Only parser-discovered shell links are deferred. Stop before the
      // direct host can append editor or mode stylesheets to the same head.
      headObserver.disconnect();
      return true;
    };
    if (!markStatus()) {
      const observer = new MutationObserver(() => { if (markStatus()) observer.disconnect(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  // A tool's own return link can reach its public URL inside the retained
  // iframe. Recover only this same-origin controller's transport channel.
  try {
    const frame = window.frameElement;
    const original = frame && new URL(frame.src, location.href);
    if (!validBridge(params) && !independentLegacy && frame?.matches('.tool-embed__frame') && original.origin === location.origin && validBridge(original.searchParams)) {
      const mode = ['draw', 'camera', 'audio'].includes(params.get('mode')) ? params.get('mode') : /\/audio(?:\/index\.html)?\/?$/.test(location.pathname) ? 'audio' : /\/camera(?:\/index\.html)?\/?$/.test(location.pathname) ? 'camera' : 'draw';
      params.set('embed', '1'); params.set('embedRole', mode); params.set('channel', original.searchParams.get('channel'));
    }
  } catch { /* Foreign frames do not inherit an editor channel. */ }
  if (validBridge(params)) {
    if (!params.has('mode')) params.set('mode', params.get('embedRole'));
    location.replace(`/draw/editor.html?${params}${location.hash}`);
  }
})();
