#!/usr/bin/env node
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../tools/screenshots/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const staticServerScript = path.join(projectRoot, 'scripts', 'static-server.mjs');

function assert(condition, message, details = null) {
  if (condition) return;
  const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : '';
  throw new Error(`${message}${suffix}`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findFreePort(start = 4173) {
  for (let port = start; port < start + 80; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for plaza verification');
}

function startStaticServer(port) {
  const child = spawn(process.execPath, [staticServerScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += String(chunk || '');
  });

  return {
    child,
    async stop() {
      if (child.exitCode !== null || child.signalCode) return;
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    },
    getErrorOutput() {
      return stderr.trim();
    }
  };
}

async function waitForHttp(url, server) {
  const deadline = Date.now() + 6000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode) {
      throw new Error(server.getErrorOutput() || 'Static server exited before responding');
    }
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function openPlaza(page, url) {
  await page.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.protocol === 'file:' || requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === 'localhost') {
      route.continue();
      return;
    }
    route.abort();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#plazaWorld', { timeout: 15000 });
  await page.waitForSelector('#zoomInButton', { timeout: 15000 });
  // The self avatar is created by renderAvatars(); there is no #localAvatar id.
  await page.waitForSelector('.plaza-avatar.is-self', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const scene = document.querySelector('#plazaScene');
    const world = document.querySelector('#plazaWorld');
    const commandbar = document.querySelector('.plaza-commandbar');
    const zoomControls = document.querySelector('.plaza-zoom-controls');
    return {
      clientWidth: html.clientWidth,
      clientHeight: html.clientHeight,
      scrollWidth: html.scrollWidth,
      scrollHeight: html.scrollHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      touchAction: scene ? getComputedStyle(scene).touchAction : '',
      worldTransform: world ? getComputedStyle(world).transform : '',
      zoomLabel: document.querySelector('#zoomLabel')?.textContent || '',
      adFooter: Boolean(document.querySelector('.ad-footer ins.adsbygoogle')),
      bottomNav: Boolean(document.querySelector('.bottom-nav')),
      moveButtons: document.querySelectorAll('.move-pad button').length,
      giftControls: document.querySelectorAll('#giftButton,.plaza-terminal--gift').length,
      avatarCount: document.querySelectorAll('.plaza-avatar').length,
      selfAvatar: Boolean(document.querySelector('.plaza-avatar.is-self')),
      selfAvatarSrc: document.querySelector('.plaza-avatar.is-self .plaza-avatar__sprite')?.getAttribute('src') || '',
      selfWalking: Boolean(document.querySelector('.plaza-avatar.is-self.is-walking')),
      selfBubble: document.querySelector('.plaza-avatar.is-self .plaza-avatar__bubble:not([hidden])')?.textContent || '',
      selfWorld: (() => {
        const self = document.querySelector('.plaza-avatar.is-self');
        if (!self) return null;
        return {
          x: Number.parseFloat(self.style.left || '0'),
          y: Number.parseFloat(self.style.top || '0')
        };
      })(),
      moveTargetVisible: Boolean(document.querySelector('#moveTargetMarker:not([hidden])')),
      plazaStatus: document.querySelector('#plazaStatus')?.textContent || '',
      selfScreen: (() => {
        const self = document.querySelector('.plaza-avatar.is-self');
        if (!self || !scene || !world) return null;
        const floor = document.querySelector('.plaza-floor');
        const sceneRect = scene.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);
        const worldX = Number.parseFloat(self.style.left || '0');
        const worldY = Number.parseFloat(self.style.top || '0');
        const screenX = sceneRect.left + matrix.a * worldX + matrix.e;
        const screenY = sceneRect.top + matrix.d * worldY + matrix.f;
        const floorTop = floor ? floor.getBoundingClientRect().top - sceneRect.top : null;
        return {
          x: Math.round((screenX - sceneRect.left) * 10) / 10,
          y: Math.round((screenY - sceneRect.top) * 10) / 10,
          xCenterDelta: Math.round((screenX - (sceneRect.left + sceneRect.width / 2)) * 10) / 10,
          yRatio: Math.round(((screenY - sceneRect.top) / sceneRect.height) * 1000) / 1000,
          floorTop: floorTop === null ? null : Math.round(floorTop * 10) / 10,
          groundDelta: floorTop === null ? null : Math.round((screenY - sceneRect.top - floorTop) * 10) / 10
        };
      })(),
      sideScrollerMap: (() => {
        const floor = document.querySelector('.plaza-floor');
        const floorRect = floor?.getBoundingClientRect();
        const sceneRect = scene?.getBoundingClientRect();
        return {
          skyPanels: document.querySelectorAll('.plaza-sky-panel').length,
          horizons: document.querySelectorAll('.plaza-horizon').length,
          flightLine: Boolean(document.querySelector('.plaza-flight-line')),
          floorTopRatio: floorRect && sceneRect ? Math.round(((floorRect.top - sceneRect.top) / sceneRect.height) * 1000) / 1000 : null
        };
      })(),
      commandbar: commandbar?.getBoundingClientRect().toJSON() || null,
      zoomControls: zoomControls?.getBoundingClientRect().toJSON() || null
    };
  });
}

function zoomNumber(snapshotValue) {
  return Number(String(snapshotValue.zoomLabel || '').replace('%', ''));
}

function assertCommon(snapshotValue, label) {
  assert(snapshotValue.scrollHeight === snapshotValue.clientHeight, `${label}: page must not scroll vertically`, snapshotValue);
  assert(snapshotValue.scrollWidth === snapshotValue.clientWidth, `${label}: page must not scroll horizontally`, snapshotValue);
  assert(snapshotValue.bodyOverflow === 'hidden', `${label}: body overflow must be hidden`, snapshotValue);
  assert(snapshotValue.touchAction === 'none', `${label}: plaza scene must reserve touch gestures for map controls`, snapshotValue);
  assert(snapshotValue.adFooter, `${label}: shared AdSense footer slot is missing`, snapshotValue);
  assert(snapshotValue.bottomNav, `${label}: shared bottom navigation is missing`, snapshotValue);
  assert(snapshotValue.moveButtons === 0, `${label}: directional move buttons must not exist`, snapshotValue);
  assert(snapshotValue.giftControls === 0, `${label}: gift comment UI must not exist in the current MVP`, snapshotValue);
  assert(snapshotValue.avatarCount >= 1 && snapshotValue.selfAvatar, `${label}: self avatar was not rendered`, snapshotValue);
  assert(snapshotValue.selfAvatarSrc.includes('character-dots/'), `${label}: self character must use the selected avatar sprite`, snapshotValue);
  assert(snapshotValue.selfWorld && Number.isFinite(snapshotValue.selfWorld.x) && Number.isFinite(snapshotValue.selfWorld.y), `${label}: self avatar world position was not readable`, snapshotValue);
  assert(snapshotValue.selfScreen && Math.abs(snapshotValue.selfScreen.xCenterDelta) <= 2, `${label}: self avatar must stay horizontally centered by side-scroll camera`, snapshotValue);
  assert(snapshotValue.selfScreen && snapshotValue.selfScreen.yRatio >= 0.58 && snapshotValue.selfScreen.yRatio <= 0.86, `${label}: self avatar must stand in the lower side-scroll play area`, snapshotValue);
  assert(snapshotValue.selfScreen && Math.abs(snapshotValue.selfScreen.groundDelta) <= 3, `${label}: self avatar feet must stay on the ground line`, snapshotValue);
  assert(snapshotValue.sideScrollerMap?.skyPanels >= 2 && snapshotValue.sideScrollerMap?.horizons >= 2 && snapshotValue.sideScrollerMap?.flightLine, `${label}: side-scroll background layers are missing`, snapshotValue);
  assert(snapshotValue.sideScrollerMap.floorTopRatio >= 0.58 && snapshotValue.sideScrollerMap.floorTopRatio <= 0.86, `${label}: ground line must be visible in lower viewport`, snapshotValue);
  assert(snapshotValue.commandbar && snapshotValue.commandbar.bottom <= snapshotValue.clientHeight, `${label}: command bar is outside viewport`, snapshotValue);
  assert(snapshotValue.zoomControls && snapshotValue.zoomControls.right <= snapshotValue.clientWidth, `${label}: zoom controls overflow viewport`, snapshotValue);
}

function assertHorizontalOnly(label, baseline, snapshots) {
  assert(baseline.selfWorld, `${label}: missing baseline world position`, baseline);
  snapshots.forEach((item, index) => {
    assert(item.selfWorld && Math.abs(item.selfWorld.y - baseline.selfWorld.y) <= 0.5, `${label}:${index}: tap movement must stay on the horizontal plaza lane`, {
      baseline: baseline.selfWorld,
      current: item.selfWorld
    });
  });
}

async function runDesktop(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openPlaza(page, url);
  const before = await snapshot(page);
  await page.click('#zoomInButton');
  await page.waitForTimeout(120);
  const button = await snapshot(page);

  const sceneBox = await page.locator('#plazaScene').boundingBox();
  assert(sceneBox, 'desktop: plaza scene was not measurable');
  // Use raw coordinates inside the left side of the scene; locator.click can hit the right chat panel.
  await page.mouse.move(sceneBox.x + sceneBox.width * 0.4, sceneBox.y + sceneBox.height * 0.45);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(120);
  const wheel = await snapshot(page);

  await page.mouse.click(sceneBox.x + sceneBox.width * 0.24, sceneBox.y + sceneBox.height * 0.74);
  await page.waitForTimeout(140);
  const walking = await snapshot(page);
  await page.waitForTimeout(420);
  const tap = await snapshot(page);

  const bubbleText = 'ふきだし確認';
  await page.fill('#chatInput', bubbleText);
  await page.press('#chatInput', 'Enter');
  await page.waitForTimeout(120);
  const bubble = await snapshot(page);

  const screenshot = path.join(os.tmpdir(), 'pixieed-plaza-verify-desktop.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  await page.close();

  [before, button, wheel, walking, tap, bubble].forEach((item, index) => assertCommon(item, `desktop:${index}`));
  assert(zoomNumber(before) === 100, 'desktop: initial zoom must be 100%', before);
  assert(before.plazaStatus.includes('オフライン') || before.plazaStatus.includes('広場に接続中') || before.plazaStatus.includes('投稿待ち'), 'desktop: plaza status should expose online/offline mode', before);
  assert(zoomNumber(button) > zoomNumber(before), 'desktop: + button did not zoom in', { before, button });
  assert(zoomNumber(wheel) > zoomNumber(button), 'desktop: mouse wheel did not zoom in', { button, wheel });
  assert(walking.selfWalking || walking.moveTargetVisible, 'desktop: tap did not start walking or show destination marker', walking);
  assert(tap.worldTransform !== wheel.worldTransform, 'desktop: tap movement did not move camera/avatar view', { wheel, tap });
  assertHorizontalOnly('desktop', before, [walking, tap, bubble]);
  assert(bubble.selfBubble.includes(bubbleText), 'desktop: submitted comment did not appear as avatar bubble', bubble);

  return { before, button, wheel, walking, tap, bubble, screenshot };
}

async function runMobile(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await openPlaza(page, url);
  const before = await snapshot(page);
  await page.tap('#zoomInButton');
  await page.waitForTimeout(120);
  const button = await snapshot(page);

  const sceneBox = await page.locator('#plazaScene').boundingBox();
  assert(sceneBox, 'mobile: plaza scene was not measurable');
  await page.touchscreen.tap(sceneBox.x + sceneBox.width * 0.3, sceneBox.y + sceneBox.height * 0.68);
  await page.waitForTimeout(140);
  const walking = await snapshot(page);
  await page.waitForTimeout(420);
  const tap = await snapshot(page);

  const screenshot = path.join(os.tmpdir(), 'pixieed-plaza-verify-mobile.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  await page.close();

  [before, button, walking, tap].forEach((item, index) => assertCommon(item, `mobile:${index}`));
  assert(zoomNumber(before) === 100, 'mobile: initial zoom must be 100%', before);
  assert(zoomNumber(button) > zoomNumber(before), 'mobile: + button did not zoom in', { before, button });
  assert(walking.selfWalking || walking.moveTargetVisible, 'mobile: tap did not start walking or show destination marker', walking);
  assert(tap.worldTransform !== button.worldTransform, 'mobile: tap movement did not move camera/avatar view', { button, tap });
  assertHorizontalOnly('mobile', before, [walking, tap]);

  return { before, button, walking, tap, screenshot };
}

async function runFileSmoke(browser) {
  const fileUrl = pathToFileURL(path.join(projectRoot, 'contest', 'index.html')).href;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openPlaza(page, fileUrl);
  const before = await snapshot(page);
  const sceneBox = await page.locator('#plazaScene').boundingBox();
  assert(sceneBox, 'file: plaza scene was not measurable');
  await page.mouse.click(sceneBox.x + sceneBox.width * 0.28, sceneBox.y + sceneBox.height * 0.7);
  await page.waitForTimeout(160);
  const walking = await snapshot(page);
  const bubbleText = 'file確認';
  await page.fill('#chatInput', bubbleText);
  await page.press('#chatInput', 'Enter');
  await page.waitForTimeout(120);
  const bubble = await snapshot(page);
  await page.close();

  [before, walking, bubble].forEach((item, index) => assertCommon(item, `file:${index}`));
  assert(walking.selfWalking || walking.moveTargetVisible, 'file: tap did not start walking or show destination marker', walking);
  assertHorizontalOnly('file', before, [walking, bubble]);
  assert(bubble.selfBubble.includes(bubbleText), 'file: submitted comment did not appear as avatar bubble', bubble);
  return { before, walking, bubble, fileUrl };
}

async function main() {
  const port = await findFreePort(Number(process.env.PLAZA_VERIFY_PORT) || 4173);
  const url = `http://127.0.0.1:${port}/contest/`;
  const server = startStaticServer(port);
  try {
    await waitForHttp(url, server);
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const desktop = await runDesktop(browser, url);
      const mobile = await runMobile(browser, url);
      const fileSmoke = await runFileSmoke(browser);
      console.log(`[plaza-verify] ${url}`);
      console.log(`[plaza-verify] desktop zoom ${desktop.before.zoomLabel} -> ${desktop.button.zoomLabel} -> ${desktop.wheel.zoomLabel}`);
      console.log(`[plaza-verify] desktop bubble "${desktop.bubble.selfBubble}"`);
      console.log(`[plaza-verify] mobile zoom ${mobile.before.zoomLabel} -> ${mobile.button.zoomLabel}`);
      console.log(`[plaza-verify] file smoke ${fileSmoke.before.selfAvatarSrc} / "${fileSmoke.bubble.selfBubble}"`);
      console.log(`[plaza-verify] screenshots ${desktop.screenshot} ${mobile.screenshot}`);
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
}

main().catch(error => {
  console.error(`[plaza-verify] ${error.message}`);
  process.exitCode = 1;
});
