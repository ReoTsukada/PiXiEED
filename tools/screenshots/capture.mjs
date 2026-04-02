#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

async function loadConfig(configArg) {
  const configPath = path.resolve(process.cwd(), configArg || './pages.json');
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    configPath,
    port: Number(parsed.port) || 4173,
    entries: Array.isArray(parsed.entries) ? parsed.entries : []
  };
}

function startStaticServer(port) {
  const serverScript = path.join(projectRoot, 'scripts', 'static-server.mjs');
  const child = spawn(process.execPath, [serverScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let settled = false;

  const ready = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const text = String(chunk || '');
      if (text.includes(`http://localhost:${port}/`)) {
        settled = true;
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => {
      if (!settled) {
        reject(new Error(String(chunk || '').trim() || 'Static server failed to start'));
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        reject(new Error(`Static server exited before ready: ${code}`));
      }
    });
  });

  return { child, ready };
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function seedStorage(page, entry) {
  const local = entry && typeof entry.initLocalStorage === 'object' && entry.initLocalStorage
    ? entry.initLocalStorage
    : null;
  const session = entry && typeof entry.initSessionStorage === 'object' && entry.initSessionStorage
    ? entry.initSessionStorage
    : null;
  if (!local && !session) return;
  await page.addInitScript(({ localEntries, sessionEntries }) => {
    if (localEntries && typeof localEntries === 'object') {
      Object.entries(localEntries).forEach(([key, value]) => {
        window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    }
    if (sessionEntries && typeof sessionEntries === 'object') {
      Object.entries(sessionEntries).forEach(([key, value]) => {
        window.sessionStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    }
  }, {
    localEntries: local,
    sessionEntries: session
  });
}

async function hideSelectors(page, selectors = []) {
  if (!Array.isArray(selectors) || !selectors.length) return;
  await page.evaluate((items) => {
    items.forEach((selector) => {
      if (typeof selector !== 'string' || !selector.trim()) return;
      document.querySelectorAll(selector).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.hidden = true;
        node.setAttribute('aria-hidden', 'true');
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');
        node.style.setProperty('opacity', '0', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
      });
    });
  }, selectors);
}

async function clickSelectors(page, selectors = []) {
  if (!Array.isArray(selectors) || !selectors.length) return;
  for (const selector of selectors) {
    if (typeof selector !== 'string' || !selector.trim()) continue;
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (!count) continue;
    try {
      await locator.click({ timeout: 3000 });
    } catch (error) {
      // ignore optional UI actions
    }
  }
}

async function setInputFiles(page, items = []) {
  if (!Array.isArray(items) || !items.length) return;
  for (const item of items) {
    if (!item || typeof item.selector !== 'string' || !item.selector.trim()) continue;
    const paths = Array.isArray(item.paths) ? item.paths : [];
    const resolved = paths
      .filter((entry) => typeof entry === 'string' && entry.trim())
      .map((entry) => path.join(projectRoot, entry));
    if (!resolved.length) continue;
    const locator = page.locator(item.selector).first();
    const count = await locator.count();
    if (!count) continue;
    await locator.setInputFiles(resolved);
  }
}

async function showSelectors(page, selectors = []) {
  if (!Array.isArray(selectors) || !selectors.length) return;
  await page.evaluate((items) => {
    items.forEach((selector) => {
      if (typeof selector !== 'string' || !selector.trim()) return;
      document.querySelectorAll(selector).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.hidden = false;
        node.removeAttribute('hidden');
        node.setAttribute('aria-hidden', 'false');
        node.style.removeProperty('display');
        node.style.removeProperty('visibility');
        node.style.removeProperty('opacity');
        node.style.removeProperty('pointer-events');
      });
    });
  }, selectors);
}

async function runEvaluateScripts(page, scripts = []) {
  if (!Array.isArray(scripts) || !scripts.length) return;
  for (const script of scripts) {
    if (typeof script !== 'string' || !script.trim()) continue;
    await page.evaluate(async (source) => {
      return await window.eval(source);
    }, script);
  }
}

async function runEntrySetup(page, entry) {
  await hideSelectors(page, [
    '#updateToast',
    '#capturePreviewOverlay',
    '#creatorOverlay',
    '#rankingModal',
    '#statusSheet',
    '.update-toast',
    '.modal[open]',
    '.modal.is-open',
    '.sheet-overlay.is-open',
    '.completion-overlay',
    '.battle-overlay.is-open',
    '.choice-overlay.is-open',
    ...(Array.isArray(entry.hideSelectors) ? entry.hideSelectors : [])
  ]);

  await clickSelectors(page, Array.isArray(entry.clickSelectors) ? entry.clickSelectors : []);
  await setInputFiles(page, Array.isArray(entry.setInputFiles) ? entry.setInputFiles : []);
  await showSelectors(page, Array.isArray(entry.showSelectors) ? entry.showSelectors : []);
  await runEvaluateScripts(page, Array.isArray(entry.evaluateScripts) ? entry.evaluateScripts : []);

  if (typeof entry.postWaitFor === 'string' && entry.postWaitFor.trim()) {
    await page.waitForSelector(entry.postWaitFor, { timeout: 15000 });
  }

  if (typeof entry.waitAfterActionsMs === 'number' && entry.waitAfterActionsMs > 0) {
    await page.waitForTimeout(entry.waitAfterActionsMs);
  }

  await hideSelectors(page, Array.isArray(entry.hideSelectorsAfterClick) ? entry.hideSelectorsAfterClick : []);
}

async function captureEntries(config) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  try {
    for (const entry of config.entries) {
      const viewport = entry.viewport && typeof entry.viewport === 'object'
        ? entry.viewport
        : { width: 1280, height: 900 };
      const page = await browser.newPage({ viewport });
      await seedStorage(page, entry);
      const targetUrl = `http://localhost:${config.port}${entry.urlPath}`;
      await page.goto(targetUrl, { waitUntil: 'networkidle' });

      if (typeof entry.waitFor === 'string' && entry.waitFor.trim()) {
        await page.waitForSelector(entry.waitFor, { timeout: 15000 });
      }

      await runEntrySetup(page, entry);

      if (typeof entry.delayMs === 'number' && entry.delayMs > 0) {
        await page.waitForTimeout(entry.delayMs);
      }

      const outputPath = path.join(projectRoot, entry.output);
      await ensureDir(outputPath);

      if (typeof entry.selector === 'string' && entry.selector.trim()) {
        const locator = page.locator(entry.selector).first();
        await locator.screenshot({ path: outputPath });
      } else {
        await page.screenshot({
          path: outputPath,
          fullPage: Boolean(entry.fullPage)
        });
      }

      console.log(`[capture] ${entry.id || entry.urlPath} -> ${path.relative(projectRoot, outputPath)}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const config = await loadConfig(process.argv[2] || path.join(__dirname, 'pages.json'));
  if (!config.entries.length) {
    throw new Error('No screenshot entries configured');
  }

  const server = startStaticServer(config.port);
  try {
    await server.ready;
    await captureEntries(config);
  } finally {
    server.child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(`[capture] ${error.message}`);
  process.exitCode = 1;
});
