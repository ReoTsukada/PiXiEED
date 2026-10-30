/** Explicit, one-navigation production diagnostic. Never clicks ads, reloads,
 * uploads source files, captures screenshots or edits an AdSense account.
 * Run only on a site-owner request: node scripts/check-converter-ad-delivery.mjs --once
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (!process.argv.includes('--once')) throw new Error('Explicit --once is required; do not run as a traffic generator.');
const executable = process.env.PIXIEED_CHROME_EXECUTABLE;
if (!executable) throw new Error('Set PIXIEED_CHROME_EXECUTABLE to the existing Chrome binary.');
const profile = await mkdtemp(path.join(tmpdir(), 'pixieed-ad-once-'));
const chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const outstanding = new Map();
const network = [], errors = [];
let counter = 0, sessionId;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeUrl = value => { try { const u = new URL(value); return u.origin + u.pathname; } catch { return ''; } };
const isAd = value => /googlesyndication\.com|doubleclick\.net|googleadservices\.com|fundingchoicesmessages\.google\.com/.test(value || '');
const clip = value => String(value || '').replace(/\?[^\s)]+/g, '?[omitted]').slice(0, 240);
try {
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('Chrome debug endpoint unavailable')), 15000);
    chrome.once('error', reject);
    chrome.once('exit', code => { clearTimeout(timeout); reject(new Error(`Chrome exited before connection: ${code}`)); });
    chrome.stderr.on('data', data => {
      buffer += data.toString(); const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const requests = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id && outstanding.has(message.id)) {
      const task = outstanding.get(message.id); outstanding.delete(message.id); clearTimeout(task.timeout);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
      return;
    }
    if (message.sessionId !== sessionId) return;
    const p = message.params || {};
    if (message.method === 'Network.requestWillBeSent' && isAd(p.request?.url)) requests.set(p.requestId, safeUrl(p.request.url));
    if (message.method === 'Network.responseReceived' && isAd(p.response?.url) && network.length < 80)
      network.push({ url: safeUrl(p.response.url), status: p.response.status, type: p.type });
    if (message.method === 'Network.loadingFailed' && requests.has(p.requestId) && network.length < 80)
      network.push({ url: requests.get(p.requestId), error: p.errorText, blockedReason: p.blockedReason || null });
    if (message.method === 'Runtime.exceptionThrown' && errors.length < 20)
      errors.push(clip(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
    if (message.method === 'Log.entryAdded' && p.entry?.level === 'error' && errors.length < 20)
      errors.push(clip(p.entry.text));
  });
  function send(method, params = {}, session = sessionId) {
    const id = ++counter;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { outstanding.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      outstanding.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
    });
  }
  const target = await send('Target.createTarget', { url: 'about:blank' }, null);
  ({ sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null));
  for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']) await send(method);
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const navigation = await send('Page.navigate', { url: 'https://pixieed.jp/tools/start/convert/' });
  if (navigation.errorText) throw new Error(navigation.errorText);
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await evaluate("Boolean(document.querySelector('.conversion-companion'))")) break;
    await delay(500);
  }
  // One normal scroll to inspect the manual slot. No reload or advertisement click.
  await evaluate("(document.querySelector('.conversion-display-ad') || document.querySelector('.conversion-companion'))?.scrollIntoView({block:'center'})");
  await delay(12000);
  const observed = await evaluate(`(() => {
    const host = document.querySelector('.conversion-display-ad');
    const unit = document.querySelector('ins.conversion-display-ad__unit');
    const main = document.querySelector('main#main');
    const rect = element => element?.getBoundingClientRect().toJSON() || null;
    const style = element => element ? {display:getComputedStyle(element).display, visibility:getComputedStyle(element).visibility} : null;
    return {
      title:document.title, pathname:location.pathname, readyState:document.readyState, visibility:document.visibilityState,
      viewport:{width:innerWidth,height:innerHeight},
      host:host ? {hidden:host.hidden,state:host.dataset.adState,reason:host.dataset.adReason,rect:rect(host),style:style(host)} : null,
      unit:unit ? {status:unit.dataset.adStatus,processed:unit.dataset.adsbygoogleStatus,slot:unit.dataset.adSlot,
        rect:rect(unit),style:style(unit),iframes:unit.querySelectorAll('iframe').length} : null,
      adScriptPresent:Boolean(document.querySelector('script[src*="pagead/js/adsbygoogle.js"]')),
      adLibraryLoaded:Boolean(window.adsbygoogle?.loaded),
      converterReady:Boolean(main?.querySelector('#output-start,[data-editor],[data-text-tools]')),
      exportPresent:Boolean(document.querySelector('#output-nav-export')),
      openDialog:Boolean(document.querySelector('dialog[open]')),
      adModule:performance.getEntriesByType('resource').filter(e=>e.name.includes('/js/ads/conversion-display-ad.mjs')).map(e=>new URL(e.name).pathname+new URL(e.name).search),
      visibleErrors:[...document.querySelectorAll('[role="alert"]')].filter(e=>e.getClientRects().length&&e.textContent.trim()).map(e=>e.textContent.slice(0,160))
    };
  })()`);
  console.log('PIXIEED_AD_DIAGNOSTIC_BEGIN');
  console.log(JSON.stringify({ observation: observed, adNetwork: network, browserErrors: errors,
    note: 'One read-only page session from CI. No ad clicks, reloads, screenshots or uploads. This observation does not establish delivery in every user environment.' }, null, 2));
  console.log('PIXIEED_AD_DIAGNOSTIC_END');
  await send('Target.closeTarget', { targetId: target.targetId }, null);
} finally {
  for (const task of outstanding.values()) { clearTimeout(task.timeout); task.reject(new Error('Diagnostic finished')); }
  outstanding.clear(); socket?.close();
  chrome.kill('SIGTERM');
  await delay(400);
  await rm(profile, { recursive: true, force: true });
}
