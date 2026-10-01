#!/usr/bin/env node
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright module.');
const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4184';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('Only a local test server is allowed.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1280, height: 800 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__gyroPermissions = 0;
      window.DeviceOrientationEvent = class extends Event {
        static requestPermission() { __gyroPermissions++; return Promise.resolve('granted'); }
      };
      window.DeviceMotionEvent = class extends Event { static requestPermission() { return Promise.resolve('denied'); } };
      window.__gyroSample = (beta, gamma) => {
        const event = new Event('deviceorientation'); Object.assign(event, { beta, gamma, alpha: 0 });
        window.dispatchEvent(event);
      };
    });
    await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#hpColors button').length === 7);
    await page.locator('#hpSound').click();
    await page.locator('#hpCanvas').click({ position: { x: 12, y: 12 } });
    await page.waitForFunction(() => __gyroPermissions === 1);
    const statusVisual = await page.locator('#hpGyroStatus').evaluate((node) => {
      const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      return { clip: style.clip, width: rect.width, height: rect.height };
    });
    assert.equal(statusVisual.clip, 'rect(0px, 0px, 0px, 0px)', 'motion status is clipped from visual layout');
    assert.ok(statusVisual.width <= 1 && statusVisual.height <= 1, 'motion status occupies no visible area'); checks++;
    assert.equal(await page.locator('#hpGyro').count(), 0, 'there is no visible motion start control'); checks++;
    await page.evaluate(() => {
      const stage = document.querySelector('#hpStage');
      const invite = document.createElement('a'); invite.id = 'hpInvite'; invite.className = 'hp-invite is-in'; invite.href = '/audio/'; invite.textContent = 'ドットで音楽つくってみる？'; stage.appendChild(invite);
      document.querySelector('#hpScore').hidden = false;
    });
    await page.locator('#hpColors button').nth(4).click();
    const sample = (beta, gamma) => page.evaluate(([b, g]) => { for (let i = 0; i < 48; i++) __gyroSample(b, g); }, [beta, gamma]);
    const center = () => page.evaluate(() => {
      const canvas = document.querySelector('#hpCanvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let x = 0; let y = 0; let count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] === 49 && data[i + 1] === 95 && data[i + 2] === 208) {
        const cell = i / 4; x += cell % canvas.width; y += Math.floor(cell / canvas.width); count++;
      }
      return count ? { x: x / count, y: y / count, count } : null;
    });
    for (const direction of [
      { name: 'down', beta: 90, gamma: 0, axis: 'y', sign: 1 },
      { name: 'right', beta: 0, gamma: 90, axis: 'x', sign: 1 },
      { name: 'up', beta: -90, gamma: 0, axis: 'y', sign: -1 },
      { name: 'left', beta: 0, gamma: -90, axis: 'x', sign: -1 },
    ]) {
      await page.locator('#hpClear').click();
      await sample(direction.beta, direction.gamma);
      if (viewport.height < 400) await page.evaluate(() => {
        const box = document.querySelector('#hpCanvas').getBoundingClientRect();
        scrollTo({ top: Math.max(0, box.top + scrollY + box.height * 0.53 - innerHeight * 0.5), behavior: 'instant' });
      });
      const box = await page.locator('#hpCanvas').boundingBox();
      const x = box.x + box.width * 0.48; const y = box.y + box.height * 0.53;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 12, y, { steps: 3 }); await page.mouse.up();
      await page.waitForTimeout(140); const before = await center();
      await page.waitForTimeout(480); const after = await center();
      assert.ok(before && after, `${direction.name}: drawing is visible`);
      assert.ok((after[direction.axis] - before[direction.axis]) * direction.sign > 2, `${JSON.stringify(viewport)} ${direction.name}: pixels follow sensor gravity ${JSON.stringify({ before, after })}`);
      // The score sweep briefly paints a grain white; exact colour counts are
      // deliberately covered by the pure sand tests instead of this overlay.
      assert.ok(after.count >= 4, 'drawing remains visible after rotation'); checks++;
    }
    // Settled grains, rather than only newly released pieces, must leave the old floor.
    await sample(90, 0); await page.waitForTimeout(1100); const bottom = await center();
    await sample(-90, 0); await page.waitForTimeout(650); const rising = await center();
    assert.ok(bottom && rising && rising.y < bottom.y - 3, `a settled pile travels upward after inversion ${JSON.stringify({ viewport, bottom, rising })}`); checks++;
    await page.waitForTimeout(1100); await sample(0, 0); const flatBefore = await center();
    await page.waitForTimeout(300); const flatAfter = await center();
    assert.ok(flatAfter && flatBefore && Math.abs(flatAfter.x - flatBefore.x) < 1 && Math.abs(flatAfter.y - flatBefore.y) < 1, 'a flat device has no invented gravity'); checks++;
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(100);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow')));
    await sample(90, 0); await page.waitForTimeout(500); const resumed = await center();
    assert.ok(resumed && resumed.y > flatAfter.y + 3, 'always-on gyro resumes after page restoration'); checks++;
    assert.equal(await page.evaluate(() => __gyroPermissions), 1, 'rotations do not repeat permission prompts'); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const invite = await page.evaluate(() => {
      const scoreNode = document.querySelector('#hpScore'); scoreNode.textContent = '★ 0'; scoreNode.hidden = false;
      const box = document.querySelector('#hpInvite'); const rect = box.getBoundingClientRect();
      const score = document.querySelector('#hpScore').getBoundingClientRect();
      return { shown: !box.hidden, top: rect.top, left: rect.left, right: rect.right, scoreLeft: score.left, scoreRight: score.right, stage: document.querySelector('#hpStage').getBoundingClientRect().toJSON() };
    });
    assert.ok(invite.top >= invite.stage.top + 12 && invite.left >= invite.stage.left + 12, `invite sits at the upper left with inset ${JSON.stringify({ viewport, invite })}`);
    assert.ok(invite.right < invite.scoreLeft, `invite clears the upper-right score ${JSON.stringify({ viewport, invite })}`);
    assert.ok(invite.right <= invite.scoreLeft || invite.scoreRight <= invite.left, `invite does not overlap the score ${JSON.stringify({ viewport, invite })}`); checks++;
    checks++;
    assert.deepEqual(errors, []); checks++;
    console.log(JSON.stringify({ viewport, directions: 'PASS', invertedPile: 'PASS', flat: 'PASS', alwaysOn: 'PASS', exceptions: 0 }));
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ checks, result: 'PASS', evidence: 'Chromium with synthetic sensor events; physical devices untested' }));
