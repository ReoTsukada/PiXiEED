import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Reuse the installed browser renderer for Japanese text. Never install dependencies. */
export function createHiddenObjectOgpRenderer() {
  let browserPromise;
  let chromePromise;
  const modulePromise = readFile(new URL('../../js/creation/puzzle-share-page.mjs', import.meta.url)).then(bytes => `data:text/javascript;base64,${bytes.toString('base64')}`);

  async function playwrightBrowser() {
    if (!browserPromise) browserPromise = (async () => {
      let runtime;
      try { runtime = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright'); }
      catch { throw new Error('Japanese OGP text requires an existing Playwright installation. Set PIXIEED_PLAYWRIGHT_MODULE; no dependency was installed.'); }
      return runtime.chromium.launch({ headless: true });
    })();
    return browserPromise;
  }

  async function chromeBrowser() {
    if (!chromePromise) chromePromise = launchChrome(process.env.PIXIEED_CHROME_EXECUTABLE);
    return chromePromise;
  }

  return {
    async render({ originalBytes, text }) {
      if (process.env.PIXIEED_CHROME_EXECUTABLE) {
        return (await chromeBrowser()).render(await modulePromise, originalBytes, text);
      }
      const instance = await playwrightBrowser(), page = await instance.newPage();
      try {
        await page.route('**/*', route => route.abort());
        const result = await page.evaluate(async ({ moduleUrl, imageUrl, text }) => {
          const { drawHiddenObjectPuzzleOgp } = await import(moduleUrl);
          const image = new Image(); image.src = imageUrl; await image.decode();
          await document.fonts.ready;
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
          drawHiddenObjectPuzzleOgp(canvas.getContext('2d'), image, text);
          return canvas.toDataURL('image/png').split(',')[1];
        }, { moduleUrl: await modulePromise, imageUrl: `data:image/png;base64,${Buffer.from(originalBytes).toString('base64')}`, text });
        return Buffer.from(result, 'base64');
      } finally { await page.close(); }
    },
    async close() {
      if (browserPromise) { const instance = await browserPromise.catch(() => null); await instance?.close(); }
      if (chromePromise) { const instance = await chromePromise.catch(() => null); await instance?.close(); }
    },
  };
}

async function launchChrome(executable) {
  if (!executable) throw new Error('PIXIEED_CHROME_EXECUTABLE must name an existing Google Chrome executable.');
  const profile = await mkdtemp(join(tmpdir(), 'pixieed-ogp-chrome-'));
  let child;
  let socket;
  try {
    child = spawn(executable, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--disable-default-apps', '--no-first-run', '--no-default-browser-check',
      '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE localhost',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let spawnError;
    child.once('error', error => { spawnError = error; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    const endpoint = await waitForDebuggerEndpoint(child, profile, () => spawnError ? `${spawnError.message}\n${stderr}` : stderr, () => spawnError);
    socket = new ChromeCdp(endpoint);
    await socket.connect();
    const target = await socket.send('Target.createTarget', { url: 'about:blank' });
    const attached = await socket.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await socket.send('Page.enable', {}, sessionId);
    await socket.send('Runtime.enable', {}, sessionId);
    await socket.send('Network.enable', {}, sessionId);
    await socket.send('Network.setBlockedURLs', { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, sessionId);
    return {
      async render(moduleUrl, originalBytes, text) {
        const imageUrl = `data:image/png;base64,${Buffer.from(originalBytes).toString('base64')}`;
        const expression = `((async () => {
          const { drawHiddenObjectPuzzleOgp } = await import(${JSON.stringify(moduleUrl)});
          const image = new Image(); image.src = ${JSON.stringify(imageUrl)}; await image.decode();
          await document.fonts.ready;
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
          drawHiddenObjectPuzzleOgp(canvas.getContext('2d'), image, ${JSON.stringify(text)});
          return canvas.toDataURL('image/png').split(',')[1];
        })())`;
        const evaluated = await socket.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (evaluated.exceptionDetails) throw new Error(`Chrome OGP rendering failed: ${evaluated.exceptionDetails.text || evaluated.exceptionDetails.exception?.description || 'evaluation error'}`);
        const base64 = evaluated.result?.value;
        if (typeof base64 !== 'string' || !base64.startsWith('iVBOR')) throw new Error('Chrome OGP rendering returned no PNG data.');
        return Buffer.from(base64, 'base64');
      },
      async close() {
        try { await socket.send('Browser.close', {}, undefined, 2000); } catch {}
        try { await socket.close(); } finally {
          try { await stopChild(child); } finally { await rm(profile, { recursive: true, force: true }); }
        }
      },
    };
  } catch (error) {
    await socket?.close().catch(() => {});
    if (child) await stopChild(child);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function waitForDebuggerEndpoint(child, profile, getStderr, getSpawnError) {
  const activePort = join(profile, 'DevToolsActivePort');
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (getSpawnError()) throw new Error(`Could not start Chrome: ${getStderr()}`);
    if (child.exitCode !== null) throw new Error(`Chrome exited before CDP startup: ${getStderr()}`);
    try {
      const [port, path] = (await readFile(activePort, 'utf8')).trim().split(/\r?\n/);
      if (port && path?.startsWith('/devtools/browser/')) return `ws://127.0.0.1:${port}${path}`;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Chrome CDP startup: ${getStderr()}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForExit(child, 2000)) return;
  child.kill('SIGKILL');
  await waitForExit(child, 2000);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = exited => { clearTimeout(timer); child.off('exit', onExit); resolve(exited); };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}

export class ChromeCdp {
  constructor(endpoint, { WebSocketImpl = WebSocket, connectTimeoutMs = 10000, commandTimeoutMs = 30000, closeTimeoutMs = 2000 } = {}) {
    this.endpoint = endpoint;
    this.WebSocketImpl = WebSocketImpl;
    this.connectTimeoutMs = connectTimeoutMs;
    this.commandTimeoutMs = commandTimeoutMs;
    this.closeTimeoutMs = closeTimeoutMs;
    this.nextId = 0;
    this.pending = new Map();
  }
  async connect() {
    this.socket = new this.WebSocketImpl(this.endpoint);
    this.socket.addEventListener('message', event => this.#message(event.data));
    this.socket.addEventListener('close', () => this.#rejectPending(new Error('Chrome CDP connection closed.')));
    this.socket.addEventListener('error', () => this.#rejectPending(new Error('Chrome CDP connection failed.')));
    await this.#waitForSocketEvent('open', this.connectTimeoutMs, 'Timed out connecting to Chrome CDP.', true);
  }
  send(method, params = {}, sessionId, timeoutMs = this.commandTimeoutMs) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Chrome CDP ${method}.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch (error) { this.#settle(id, reject, error); }
    });
  }
  #message(data) {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(`Chrome CDP ${message.error.code}: ${message.error.message}`));
    else pending.resolve(message.result || {});
  }
  #settle(id, callback, value) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    callback(value);
  }
  #rejectPending(error) {
    for (const [id, pending] of this.pending) this.#settle(id, pending.reject, error);
  }
  #waitForSocketEvent(eventName, timeoutMs, message, failOnError = false) {
    return new Promise((resolve, reject) => {
      let timer;
      const finish = (error) => {
        clearTimeout(timer);
        this.socket.removeEventListener(eventName, onEvent);
        this.socket.removeEventListener('error', onError);
        this.socket.removeEventListener('close', onClose);
        error ? reject(error) : resolve();
      };
      const onEvent = () => finish();
      const onError = () => finish(new Error(failOnError ? 'Could not connect to Chrome CDP.' : message));
      const onClose = () => finish(new Error('Chrome CDP connection closed.'));
      this.socket.addEventListener(eventName, onEvent, { once: true });
      this.socket.addEventListener('error', onError, { once: true });
      this.socket.addEventListener('close', onClose, { once: true });
      timer = setTimeout(() => finish(new Error(message)), timeoutMs);
    });
  }
  async close() {
    if (!this.socket || this.socket.readyState === this.WebSocketImpl.CLOSED) return;
    try {
      this.socket.close();
      await this.#waitForSocketEvent('close', this.closeTimeoutMs, 'Timed out closing Chrome CDP.');
    } catch {
      // Socket teardown is best-effort; callers still terminate Chrome and remove its profile.
    } finally {
      this.#rejectPending(new Error('Chrome CDP connection closed.'));
    }
  }
}
