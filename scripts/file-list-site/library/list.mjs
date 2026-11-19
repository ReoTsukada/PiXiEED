import { isEnvelope, sessionKey } from '/envelope.mjs';
const editor = 'https://pixieed.jp';
const status = document.getElementById('status');
const ad = document.getElementById('ad');

async function start() {
  if (self !== top || location.href !== 'https://draw.pixieed.jp/library/'
    || window.name || window.opener || document.referrer || history.state) throw new Error();
  const envelope = JSON.parse(sessionStorage.getItem(sessionKey));
  if (!isEnvelope(envelope)) throw new Error();
  const frame = document.createElement('iframe');
  frame.title = '保存した作品';
  frame.referrerPolicy = 'no-referrer';
  frame.src = editor + '/draw/library-private/';
  let requested = false;
  let ready = false;
  let timeout;
  frame.addEventListener('load', () => {
    ready = false;
    ad.hidden = true;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (!ready) status.textContent = '作品が表示されない場合は、編集画面に戻ってください。';
    }, 12000);
    frame.contentWindow.postMessage({ type: 'pixieed:list-open', envelope }, editor);
  });
  async function showAd() {
    if (requested || !ready || document.visibilityState !== 'visible') return;
    const width = document.querySelector('main').clientWidth;
    if (width < 300) return;
    requested = true;
    try {
      const { mount } = await import('/library/advert.mjs');
      if (ready && document.querySelector('main').clientWidth >= 300) mount(ad);
    } catch { ad.hidden = true; }
  }
  addEventListener('message', event => {
    if (event.origin !== editor || event.source !== frame.contentWindow
      || !event.data || Object.keys(event.data).length !== 1 || event.data.type !== 'pixieed:list-ready') return;
    ready = true;
    clearTimeout(timeout);
    status.hidden = true;
    void showAd();
  });
  document.addEventListener('visibilitychange', showAd);
  const size = new ResizeObserver(() => {
    if (document.querySelector('main').clientWidth >= 300) void showAd();
    else if (requested) ad.hidden = true;
  });
  size.observe(document.querySelector('main'));
  document.getElementById('list').append(frame);
}
start().catch(() => { status.textContent = 'Drawの編集画面から作品一覧を開いてください。'; });
