/** Local experiment only: align iframe startup with direct host, leaving product files unchanged. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PIXIEED_BENCH_PORT || 4221);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const served = new Map();
const types = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const csp = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; form-action 'none'";
const condition = 'matched deferred mount + awaited first activation; no first save or decorative transition';

createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', csp);
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/__bench_control.json') {
      response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ condition, transformedOnly: '/js/creation/draw-entry.mjs', served: [...served.values()] })); return;
    }
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Outside root');
    let info = await stat(path);
    if (info.isDirectory()) { path = resolve(path, 'index.html'); info = await stat(path); }
    if (!info.isFile()) throw new Error('Not a file');
    const source = await readFile(path); let body = source;
    if (url.pathname === '/js/creation/draw-entry.mjs') {
      const old = 'const runtime = await mountCreationRuntime({ requestedMode, search: location.search, role: requestedMode || \'draw\' });';
      const replacement = 'const runtime = await mountCreationRuntime({ requestedMode, search: location.search, role: requestedMode || \'draw\', deferInitialMode: true });\n  await runtime.activate(requestedMode);\n  delete document.documentElement.dataset.creationStartup;';
      const text = source.toString('utf8');
      if (text.split(old).length !== 2) throw new Error('Controlled startup fixture no longer matches source');
      body = Buffer.from(text.replace(old, replacement));
    }
    served.set(request.url, { url: request.url, sourcePath: path.slice(root.length + 1), sourceSha256: hash(source), servedSha256: hash(body), bytes: body.length, transformed: body !== source });
    response.setHeader('Cache-Control', /\.(?:m?js|css|png|svg|woff2|json)$/.test(path) ? 'public, max-age=3600' : 'no-cache');
    response.setHeader('Last-Modified', info.mtime.toUTCString());
    if (request.headers['if-modified-since'] && Date.parse(request.headers['if-modified-since']) >= Math.floor(info.mtimeMs / 1000) * 1000) { response.writeHead(304); response.end(); return; }
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.setHeader('Content-Length', body.length); response.writeHead(200); response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404); response.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Controlled startup only: http://127.0.0.1:${port}`));
