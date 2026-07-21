import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Project storage worker bridge</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({
    path: path.join(repoRoot, 'pixiedraw/assets/js/modules/project-storage-v2-worker-bridge.js'),
  });
  const result = await page.evaluate(() => {
    const createBridge = window.PiXiEEDrawModules.projectStorageV2WorkerBridge
      .createProjectStorageV2WorkerBridge;
    const WorkerStub = function WorkerStub() {};
    return {
      http: createBridge({
        workerUrl: 'worker.js',
        WorkerCtor: WorkerStub,
        location: { protocol: 'https:', origin: 'https://pixieed.jp' },
      }).isSupported(),
      file: createBridge({
        workerUrl: 'worker.js',
        WorkerCtor: WorkerStub,
        location: { protocol: 'file:', origin: 'null' },
      }).isSupported(),
      opaque: createBridge({
        workerUrl: 'worker.js',
        WorkerCtor: WorkerStub,
        location: { protocol: 'https:', origin: 'null' },
      }).isSupported(),
    };
  });
  assert.deepEqual(result, { http: true, file: false, opaque: false });
  console.log('Project storage worker bridge local-file guard checks passed');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
