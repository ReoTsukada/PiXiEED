import { createServer } from 'node:http';
import worker from './worker.mjs';

const rawPort = process.env.PORT ?? '4199';
if (!/^\d+$/.test(rawPort)) throw new TypeError('PORT must be a decimal port number.');
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('PORT must be between 1 and 65535.');
const siteOrigin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4198';

function isAllowedHost(host) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

const server = createServer(async (incoming, outgoing) => {
  try {
    if (!isAllowedHost(incoming.headers.host || '')) {
      outgoing.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      outgoing.end('{"error":"Host not allowed."}');
      incoming.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 32 * 1024) {
        outgoing.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        outgoing.end('{"error":"Request body too large."}');
        incoming.destroy();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, { method: incoming.method, headers, ...(incoming.method === 'GET' || incoming.method === 'HEAD' ? {} : { body }) });
    const response = await worker.fetch(request, { ALLOW_LOCAL_ORIGIN: '1', SITE_ORIGIN: siteOrigin });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  } catch {
    outgoing.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    outgoing.end('{"error":"Bad request."}');
  }
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`PiXiEED MCP dev server: http://127.0.0.1:${port}\n`));
