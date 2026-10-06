/** A real HTTP-cache upgrade: committed old Draw, same-origin fresh HTML, current revisioned children. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const output = process.env.PIXIEED_DRAW_CACHE_OUTPUT || '/tmp/pixieed-draw-cache-upgrade-20261006';
await mkdir(output, { recursive: true });
const oldRoot = output + '/old-source', marker = output + '/root-marker.txt', logFile = output + '/server-requests.jsonl';
await mkdir(oldRoot, { recursive: true });
execFileSync('git', ['archive', '--format=tar', '--output=' + output + '/old-source.tar', '297e94b2'], { stdio: ['ignore', 'ignore', 'pipe'] });
execFileSync('tar', ['-xf', output + '/old-source.tar', '-C', oldRoot], { stdio: ['ignore', 'ignore', 'pipe'] });
await writeFile(marker, 'old'); await writeFile(logFile, '');
const python = `import http.server,sys,json,pathlib,time,threading,urllib.parse
old,new,marker,log=sys.argv[1:]
lock=threading.Lock()
class Handler(http.server.SimpleHTTPRequestHandler):
 def do_GET(self):
  phase=pathlib.Path(marker).read_text().strip()
  self.directory=old if phase=='old' else new
  with lock:
   with open(log,'a') as stream: stream.write(json.dumps({'phase':phase,'url':self.path,'time':time.time()})+'\\n')
  super().do_GET()
 def end_headers(self):
  path=urllib.parse.urlparse(self.path).path
  self.send_header('Cache-Control','no-store' if path.endswith('/') or path.endswith('.html') else 'public, max-age=600')
  super().end_headers()
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
print('SERVER_PORT='+str(server.server_port),flush=True)
server.serve_forever()`;
const server = spawn('python3', ['-u', '-c', python, oldRoot, process.cwd(), marker, logFile], { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => { let text = ''; server.stdout.on('data', bytes => { text += bytes; const match = /SERVER_PORT=(\d+)/.exec(text); if (match) resolve(Number(match[1])); }); server.once('error', reject); server.once('exit', code => reject(Error('Server exited: ' + code))); });
const base = `http://127.0.0.1:${port}`;
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch();
const checks = [], errors = [], cachedRequests = [], responses = [];
try {
 const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, serviceWorkers: 'block' }), p = await context.newPage();
 // Playwright routing intentionally is not used: it disables browser HTTP caching.
 const cdp = await context.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: false }); await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
 cdp.on('Network.requestServedFromCache', e => cachedRequests.push(e.requestId));
 cdp.on('Network.responseReceived', e => responses.push({ url: e.response.url, fromDiskCache: e.response.fromDiskCache, fromPrefetchCache: e.response.fromPrefetchCache, mimeType: e.response.mimeType }));
 p.on('pageerror', e => errors.push(e.message)); p.setDefaultTimeout(10000);
 const rgba = () => p.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
 const at = async (x, y) => { const b = await p.locator('#draw-canvas').boundingBox(), size = await p.locator('#draw-canvas').evaluate(c => c.width); return { x: b.x + x * b.width / size, y: b.y + y * b.height / size }; };
 const key = async value => { await p.locator('#draw-canvas').focus(); await p.keyboard.press(value); };
 const drag = async (a, b) => { await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(40); };
 const save = async () => { await p.locator('#pxd-save').evaluate(n => n.click()); await p.waitForFunction(() => !document.querySelector('#main').inert && !document.querySelector('#pxd-save').disabled); };
 const records = async () => (await readFile(logFile, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
 const action = async name => { await p.locator(`[data-selection-action="${name}"]`).click(); await p.waitForTimeout(50); };
 const command = async id => { await p.locator('#draw-settings-summary').click(); await p.locator('#draw-shortcuts-open').click(); await p.locator(`[data-command-run="${id}"]`).click(); await p.waitForTimeout(50); };
 try {
  await p.goto(base + '/draw/?cache-upgrade=old', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => !document.querySelector('#main').inert && document.querySelector('#draw-canvas').dataset.tool === 'pen');
  assert.equal(await p.locator('#draw-selection-open').count(), 1); for (const [x, y] of [[3.5,4.5],[4.5,5.5],[5.5,6.5]]) { const q = await at(x, y); await p.mouse.click(q.x, q.y); } await save(); const oldPixels = await rgba(); await p.waitForTimeout(400);
  const warm = await records(); assert.ok(warm.some(r => r.url === '/js/creation/draw-selection-geometry.mjs')); assert.ok(warm.some(r => r.url.includes('/draw-core.mjs?rev=20261001-animation-1'))); checks.push('old committed 297e94b2 modules populate real max-age=600 HTTP cache and save an isolated PXD');
  await writeFile(marker, 'new');
  const nextUrl = new URL(p.url()); nextUrl.searchParams.set('cache-upgrade', 'new'); await p.goto(nextUrl.href, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main').inert);
  assert.equal(await p.locator('#draw-selection-open').count(), 0); assert.equal(await p.locator('#draw-selection-controls').count(), 1); assert.deepEqual(await rgba(), oldPixels); checks.push('fresh same-origin HTML loads current entry/page and restores old saved pixels without missing geometry exports');
  const after = await records(), latest = after.filter(r => r.phase === 'new'), revision = '20261006-draw-startup-1';
  for (const name of ['draw-entry','draw-page','draw-core','draw-tool-operations','draw-selection-geometry','draw-selection-operations','draw-selection-session','draw-selection-overlay','draw-selection-panel','draw-shortcuts','project-workspace','project-components','tool-project-import']) assert.ok(latest.some(r => r.url === `/js/creation/${name}.mjs?rev=${revision}`), name + ' fetched with current revision');
  const scope = '/js/creation/mode-scope.mjs?rev=20261001-independent-editors-1'; assert.ok(warm.some(r => r.url === scope)); assert.ok(!latest.some(r => r.url === scope), 'unchanged scope reused old cache, so navigation did not flush HTTP cache');
  const timing = await p.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('mode-scope.mjs')).map(r => ({ url: r.name, transferSize: r.transferSize, decodedBodySize: r.decodedBodySize }))); assert.ok(timing.some(r => r.transferSize === 0 && r.decodedBodySize > 0)); checks.push('updated child URLs fetch new source while unchanged mode-scope remains cached with transferSize=0');
  await key('v'); await drag(await at(3.5,4.5), await at(6.5,6.5)); assert.deepEqual(await p.locator('#draw-selection-controls [data-selection-action]').evaluateAll(ns => ns.map(n => n.dataset.selectionAction)), ['copy','cut']); await action('copy'); assert.deepEqual(await p.locator('#draw-selection-controls [data-selection-action]').evaluateAll(ns => ns.map(n => n.dataset.selectionAction)), ['paste','back']); await action('paste'); await action('cancel'); await action('back'); checks.push('new contextual Copy/Cut to Paste/Back and Confirm/Cancel transition works after upgrade');
  for (const tool of ['b','g','l','r','Shift+r','o','Shift+o','a']) { await key(tool); const before = await rgba(); await drag(await at(5.5,5.5), await at(14.5,13.5)); const changed = await rgba(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x < 3 || x > 6 || y < 4 || y > 6) assert.deepEqual(changed.slice((y*16+x)*4,(y*16+x)*4+4), before.slice((y*16+x)*4,(y*16+x)*4+4), tool + ' mask outside ' + x + ',' + y); }
  await key('v'); const corner = await p.locator('[data-selection-control="se"]').boundingBox(), pivot = await p.locator('[data-selection-control="pivot"]').boundingBox(), a = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }, center = { x: pivot.x + pivot.width / 2, y: pivot.y + pivot.height / 2 }, theta = 37 * Math.PI / 180, dx = a.x - center.x, dy = a.y - center.y; await drag(a, { x: center.x + 1.6 * (dx*Math.cos(theta)-dy*Math.sin(theta)), y: center.y + 1.6 * (dx*Math.sin(theta)+dy*Math.cos(theta)) }); const angle = Number(await p.locator('.draw-selection').getAttribute('data-angle')); assert.ok(Math.abs(angle - 37) < 1); await action('cancel'); await key('Escape'); checks.push('new pen/fill/line/shape/spray mask code and simultaneous corner transform are used instead of cached old implementations');
  await save();
  const fixture = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.fillStyle = '#e75445'; x.fillRect(2, 2, 3, 2); x.fillStyle = '#4c82c3'; x.fillRect(5, 4, 2, 3); return { png: c.toDataURL('image/png').split(',')[1], rgba: [...x.getImageData(0,0,16,16).data] }; }); const png = output + '/upgrade-import.png'; await writeFile(png, Buffer.from(fixture.png,'base64')); await p.locator('#draw-import-file').setInputFiles(png); await p.waitForFunction(() => !document.querySelector('#draw-import-local').disabled && document.querySelector('#draw-canvas').getContext('2d').getImageData(2,2,1,1).data[0] === 231); assert.deepEqual(await rgba(), fixture.rgba); checks.push('on-demand PNG import succeeds against the warm old HTTP cache with exact decoded pixels');
  await command('animation.addBlankFrame'); await key('b'); const q = await at(12.5,12.5); await p.mouse.click(q.x,q.y); const downloaded = p.waitForEvent('download'); await p.locator('#draw-animation-export').evaluate(n => n.click()); const gif = await downloaded, gifPath = output + '/upgrade-animation.gif'; await gif.saveAs(gifPath); assert.equal((await readFile(gifPath)).subarray(0,6).toString(),'GIF89a'); checks.push('lazy GIF export downloads a real GIF89a after cache upgrade');
  const saved = await rgba(); await save(); await p.reload({waitUntil:'domcontentloaded'}); await p.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main').inert); assert.deepEqual(await rgba(),saved); assert.deepEqual(errors,[]); await p.screenshot({path:output+'/upgraded-restored.png'}); checks.push('new PXD save and same-URL reload restore exact pixels without runtime errors');
  const files=['draw/index.html','css/draw-viewport.css','js/creation/draw-entry.mjs','js/creation/draw-page.mjs','js/creation/draw-core.mjs','js/creation/draw-selection-geometry.mjs','js/creation/draw-selection-operations.mjs','js/creation/draw-selection-session.mjs','js/creation/draw-selection-overlay.mjs','js/creation/draw-selection-panel.mjs','js/creation/draw-tool-operations.mjs','js/creation/project-workspace.mjs','js/creation/project-components.mjs','js/creation/tool-project-import.mjs','scripts/draw-cache-upgrade-browser-harness.mjs']; const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
  await writeFile(output+'/results.json',JSON.stringify({checks,errors,baseline:'297e94b2',httpCacheControl:'public, max-age=600',origin:base,routing:false,timing,cachedRequestEvents:cachedRequests.length,responses,requests:await records(),sourceHashes},null,2)); console.log('PASS',checks.length,'real HTTP cache upgrade groups');
 }catch(e){await p.screenshot({path:output+'/failure.png'}).catch(()=>{});throw e;}finally{await context.close();}
}finally{await browser.close();server.kill('SIGTERM');}
