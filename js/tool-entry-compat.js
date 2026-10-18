(() => {
  const params = new URLSearchParams(location.search);
  const validBridge = value => value.get('embed') === '1' && ['draw', 'camera', 'audio'].includes(value.get('embedRole')) && value.get('channel');
  // A tool's own return link can reach its public URL inside the retained
  // iframe. Recover only this same-origin controller's transport channel.
  try {
    const frame = window.frameElement;
    const original = frame && new URL(frame.src, location.href);
    const independentLegacy = /\/(?:audio|camera)(?:\/index\.html)?\/?$/.test(location.pathname) && (params.get('standalone') === '1' || ['draw', 'audio'].includes(params.get('to')) || ['drawRequest', 'audioRequest', 'drawCamera', 'audioCamera'].some(key => params.has(key)));
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
