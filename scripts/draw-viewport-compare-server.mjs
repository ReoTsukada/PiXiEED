import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const port = Number(args.port || 8936);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
const revision = execFileSync('git', ['rev-parse', '--verify', (args.baseline || 'HEAD') + '^{commit}'], { cwd: root, encoding: 'utf8' }).trim();
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const cache = new Map();
const server = http.createServer(async (request, response) => {
 try {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const prefixed = path.startsWith('/__baseline/');
  const fixture = path.startsWith('/tests/creation-suite/draw-viewport-') && path.endsWith('.browser.html');
  const baseline = prefixed || (args['baseline-only'] === 'true' && !fixture);
  if (prefixed) path = path.slice('/__baseline'.length);
  if (path.split('/').some(part => part.startsWith('.'))) { response.writeHead(403); response.end(); return; }
  if (path.endsWith('/')) path += 'index.html';
  const filename = resolve(root, '.' + path);
  if (!filename.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
  const relative = filename.slice(root.length + 1);
  let data;
  if (baseline) {
   if (!cache.has(relative)) cache.set(relative, execFileSync('git', ['show', revision + ':' + relative], { cwd: root, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
   data = cache.get(relative);
  } else {
   const canonical = await realpath(filename);
   if (!canonical.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
   data = await readFile(canonical);
  }
  response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : data);
 } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log('Local comparison: http://127.0.0.1:' + port + '/tests/creation-suite/draw-viewport-performance.browser.html\nBaseline: ' + revision));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
