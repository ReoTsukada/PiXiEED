import { randomBytes } from 'node:crypto';
import { LocalDrawAdmission } from './draw-session-admission.mjs';
import { createServer } from 'node:http';
import worker from './worker.mjs';
import { DRAW_MAX_RESULT_BYTES, LocalDrawSessionRelay } from './draw-session-relay.mjs';

const rawPort = process.env.PORT ?? '4199';
if (!/^\d+$/.test(rawPort)) throw new TypeError('PORT must be a decimal port number.');
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('PORT must be between 1 and 65535.');
const siteOrigin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4198';
const localDrawRelay = new LocalDrawSessionRelay();
const localDrawAdmission = new LocalDrawAdmission();
const localAdmissionSecret = randomBytes(32).toString('hex');

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
    const bodyLimit = incoming.method === 'POST' && /^\/draw-sessions\/[0-9a-f-]{36}\/commands\/[0-9a-f-]{36}\/result$/i.test(incoming.url || '')
      ? DRAW_MAX_RESULT_BYTES : 32 * 1024;
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > bodyLimit) {
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
    const response = await worker.fetch(request, { ALLOW_LOCAL_ORIGIN: '1', SITE_ORIGIN: siteOrigin, LOCAL_DRAW_RELAY: localDrawRelay, LOCAL_DRAW_ADMISSION: localDrawAdmission, DRAW_ADMISSION_SECRET: localAdmissionSecret, LOCAL_DRAW_IP: '127.0.0.1' });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  } catch {
    outgoing.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    outgoing.end('{"error":"Bad request."}');
  }
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`PiXiEED MCP dev server: http://127.0.0.1:${port}\n`));
