import { decodeEnvelope, sessionKey } from '/envelope.mjs';

const value = decodeEnvelope(location.hash.slice(1));
if (location.origin === 'https://draw.pixieed.jp' && location.pathname === '/library-import/' && self === top) {
  const safe = !location.search;
  history.replaceState(null, '', '/library-import/');
  try {
    sessionStorage.removeItem(sessionKey);
    if (!safe || !value) throw new Error();
    sessionStorage.setItem(sessionKey, JSON.stringify(value));
    location.replace('/library/');
  } catch {
    document.getElementById('status').textContent = '作品一覧を開けませんでした。編集画面に戻って、もう一度お試しください。';
  }
}
