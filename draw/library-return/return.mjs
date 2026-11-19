const storageKey = 'pixieed:private-list:return:v1';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function destination(raw) {
  if (typeof raw !== 'string') throw Error('url');
  const url = new URL(raw);
  if (url.origin !== 'https://pixieed.jp' || url.username || url.password ||
      !['/draw/', '/draw/editor.html', '/tools/start/draw/'].includes(url.pathname)) throw Error('destination');
  return url.href;
}
try {
  if (window !== top || window.opener || location.origin !== 'https://pixieed.jp') throw Error('context');
  const state = JSON.parse(sessionStorage.getItem(storageKey));
  if (!state || !uuid.test(state.id)) throw Error('state');
  const ticket = location.hash.slice(1);
  const manage = ticket === 'manage';
  if (ticket && !manage && (!uuid.test(ticket) || !Object.hasOwn(state.choices, ticket))) throw Error('selection');
  const next = destination(ticket && !manage ? state.choices[ticket] : state.original);
  if (manage) sessionStorage.setItem('pixieed:private-list:manage:v1', '1');
  sessionStorage.removeItem(storageKey);
  document.cookie = '__Host-pxl-' + state.id + '=; Path=/; Max-Age=0; Secure; SameSite=Strict';
  location.replace(next);
} catch {
  document.querySelector('#status').textContent = 'このタブで作品を確認できませんでした。Drawの作品一覧から開き直してください。';
}
