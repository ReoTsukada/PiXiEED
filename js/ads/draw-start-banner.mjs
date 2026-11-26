const { origin, pathname, search, hash } = window.location;
const publicPath = pathname === '/tools/start/draw/' || pathname === '/tools/start/draw/index.html';

function cleanReferrer() {
  try {
    const previous = document.referrer && new URL(document.referrer);
    return !previous || (!previous.search && !previous.hash);
  } catch {
    return false;
  }
}

if (publicPath && (search || hash)) {
  // Existing handoffs enter the editor without loading a third-party script.
  const destination = new URL('/draw/' + search + hash, origin);
  if (!destination.searchParams.has('workspace')) destination.searchParams.set('workspace', '1');
  window.location.replace(destination);
} else if (publicPath && origin === 'https://pixieed.jp' && window.top === window.self
  && cleanReferrer() && !history.state) {
  const banner = document.getElementById('draw-start-ad');
  if (banner && window.innerWidth >= 316) {
    const width = window.innerWidth >= 1120 ? 728 : window.innerWidth >= 336 ? 320 : 300;
    const unit = document.createElement('ins');
    unit.className = 'adsbygoogle';
    unit.dataset.adClient = 'ca-pub-9801602250480253';
    unit.dataset.adSlot = '5782937881';
    unit.style.width = width + 'px';
    unit.style.height = (width === 728 ? 90 : 50) + 'px';
    banner.append(unit);
    banner.hidden = false;

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + unit.dataset.adClient;
    script.addEventListener('error', () => { banner.hidden = true; }, { once: true });
    document.head.append(script);
    (window.adsbygoogle ||= []).push({});
  }
}
