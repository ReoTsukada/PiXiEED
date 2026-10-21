const ROUTES = Object.freeze({
  draw: ['/draw/', '/draw/editor.html', '/audio/', '/audio/editor.html'],
  'pixel-camera': ['/camera/', '/pixel-camera.html', '/pixel-camera-studio.html', '/pixiee-lens/'],
  'spot-difference': ['/spot-difference/'],
  'hidden-object': ['/hidden-object/'],
  jigsaw: ['/jigsaw/']
});

export function isValidatedSocialHost(windowRef, locationRef) {
  if (!windowRef || windowRef.parent === windowRef) return true;
  const direct = windowRef.__PIXIEED_CREATION_HOST__;
  if (direct?.kind === 'direct' && direct.active === true) {
    try {
      return windowRef.location?.origin === locationRef?.origin
        && windowRef.parent.location?.origin === locationRef?.origin;
    } catch { return false; }
  }
  const boot = windowRef.__PIXIEED_TOOL_EMBED__;
  if (!boot || !['draw', 'camera', 'audio'].includes(boot.role)
    || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(boot.channel || ''))) return false;
  try {
    return windowRef.location?.origin === locationRef?.origin
      && windowRef.parent.location?.origin === locationRef?.origin;
  } catch { return false; }
}

function parentOrSelf(windowRef, locationRef) {
  if (!windowRef || windowRef.parent === windowRef) return windowRef;
  return isValidatedSocialHost(windowRef, locationRef) ? windowRef.parent : null;
}

export function navigateToSocialReturn({ windowRef = globalThis.window, locationRef = globalThis.location, kind } = {}) {
  const targetUrl = getSocialReturnUrl({ windowRef, locationRef, kind });
  if (!targetUrl) return false;
  const page = parentOrSelf(windowRef, locationRef);
  if (!page?.location || typeof page.location.assign !== 'function') return false;
  page.location.assign(targetUrl);
  return true;
}

export function getSocialReturnUrl({ pathname, search, hash, windowRef = globalThis.window, locationRef = globalThis.location, kind: sourceKind } = {}) {
  let path = String(pathname || locationRef?.pathname || '');
  let query = String(search ?? locationRef?.search ?? '');
  let fragment = String(hash ?? locationRef?.hash ?? '');
  if (!isValidatedSocialHost(windowRef, locationRef)) return null;
  if (windowRef && windowRef.parent !== windowRef && path === '/pixel-camera-studio.html') {
    try {
      const outer = windowRef.parent.location;
      if (outer.origin !== locationRef?.origin) return null;
      path = outer.pathname;
      query = outer.search;
      fragment = outer.hash;
    } catch { return null; }
  }
  const routeKind = Object.keys(ROUTES).find((name) => ROUTES[name].includes(path));
  // The shared studio can change mode without changing its entry pathname.
  // Use the actual producer when supplied, while retaining the explicit host flag.
  const kind = routeKind && sourceKind ? (Object.hasOwn(ROUTES, sourceKind) ? sourceKind : null) : routeKind;
  const params = new URLSearchParams(query);
  if (!kind || params.get('social') !== '1') return null;
  for (const key of ['social', 'workspace', 'mode', 'embed', 'embedRole', 'channel', 'returnToAudio', 'compose']) params.delete(key);
  params.set('compose', kind);
  const serialized = params.toString();
  return '/feed/' + (serialized ? '?' + serialized : '') + fragment;
}
