/** Local benchmark server: unchanged source bytes, real HTTP cache, external requests denied by CSP. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PIXIEED_BENCH_PORT || 4198);
const types = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const csp = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; form-action 'none'";
createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', csp);
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Outside root');
    let info = await stat(path);
    if (info.isDirectory()) { path = resolve(path, 'index.html'); info = await stat(path); }
    if (!info.isFile()) throw new Error('Not a file');
    response.setHeader('Cache-Control', /\.(?:m?js|css|png|svg|woff2|json)$/.test(path) ? 'public, max-age=3600' : 'no-cache');
    response.setHeader('Last-Modified', info.mtime.toUTCString());
    if (request.headers['if-modified-since'] && Date.parse(request.headers['if-modified-since']) >= Math.floor(info.mtimeMs / 1000) * 1000) { response.writeHead(304); response.end(); return; }
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.setHeader('Content-Length', info.size);
    response.writeHead(200);
    if (request.method === 'HEAD') response.end(); else createReadStream(path).pipe(response);
  } catch { response.writeHead(404); response.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Local-only CSP/cache benchmark: http://127.0.0.1:${port}`));
