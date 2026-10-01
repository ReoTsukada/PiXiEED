/** Legacy /pass/ links now provide a free-use notice without loading pass or ad code. */
const back = document.getElementById('passBack');
const requested = new URLSearchParams(location.search).get('return');
if (back && requested?.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\')) {
  try {
    const target = new URL(requested, location.origin);
    if (target.origin === location.origin && !/^\/pass(?:\/|$)/.test(target.pathname)) {
      back.href = `${target.pathname}${target.search}${target.hash}`;
    }
  } catch { /* retain the safe home link */ }
}
