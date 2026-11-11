#!/usr/bin/env node
// Isolated loopback verification; block external traffic and all non-read requests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4392';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_GUIDANCE_OUTPUT || '/tmp/pixieed-creation-guidance';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({headless:true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? {executablePath:process.env.PIXIEED_CHROME_EXECUTABLE} : {})});
const report = {cases:[], limitations:['Local Chromium only; no real account, publication, Safari or physical-device test.']};
try {
for (const width of [320,390,1280]) {
 const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.route('**/*',route => new URL(route.request().url()).origin === new URL(base).origin && ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
 const page = await context.newPage();
 await page.goto(base+'/');
 const choices = page.locator('.portal-work-actions a');
 assert.equal(await choices.count(),2);
 assert.ok((await choices.nth(1).innerText()).includes('保存した絵を開く'));
 assert.ok((await page.locator('.portal-work-entry').innerText()).includes('ゲームなどの続きは'));
 assert.equal(await page.locator('.portal-work-entry p a[href="/tools/"]').count(),1);
 for(const a of await choices.all()) {await a.focus();assert.ok(await a.evaluate(n=>n===document.activeElement)); const box=await a.boundingBox();assert.ok(box.height>=44 && box.width>=44);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:join(output,`home-${width}.png`),fullPage:true});
 await choices.first().click();
 assert.equal(new URL(page.url()).hash,'#portal-create');
 await page.goBack();
 await page.locator('#portal-query').fill('続き');
 await page.locator('#portal-results a').first().waitFor();
 assert.equal(await page.locator('#portal-results a').first().getAttribute('href'),'/draw/?workspace=1');
 await page.locator('#portal-query').press('Escape');
 await choices.nth(1).click();
 let found=false;
 for(let i=0;i<150&&!found;i++) {for(const frame of page.frames()) if(await frame.locator('#project-start-picker').isVisible().catch(()=>false)) found=true; if(!found)await page.waitForTimeout(100);}
 assert.ok(found,'resume entry must show the gallery, not launch an editor');
 await page.reload();
 found=false;
 for(let i=0;i<150&&!found;i++) {for(const frame of page.frames()) if(await frame.locator('#project-start-picker').isVisible().catch(()=>false)) found=true; if(!found)await page.waitForTimeout(100);}
 assert.ok(found,'reload must retain gallery-first entry');
 await page.goto(base+'/guide/#save-work');
 await page.locator('#save-work summary').click();
 assert.ok(await page.locator('#save-work').evaluate(n=>n.open));
 assert.ok((await page.locator('#save-work').innerText()).includes('自動同期されません'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:join(output,`guide-${width}.png`),fullPage:true});
 await page.locator('#publish-work summary').click();
 await page.locator('#publish-work a[href="/explore/"]').click();
 await page.locator('.prompt-open').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('.prompt-open')?.disabled);
 await page.locator('.prompt-open').click();
 assert.ok(await page.locator('#composerDialog').evaluate(n=>n.open));
 await page.locator('#composerClose').click();
 await page.waitForFunction(()=>!document.querySelector('#composerDialog').open);
 assert.equal(await page.locator('#composerDialog').evaluate(n=>n.open),false);
 await page.locator('.prompt-open').click();
 assert.ok(await page.locator('#composerDialog').evaluate(n=>n.open));
 await page.locator('#composerClose').click();
 await page.waitForFunction(()=>!document.querySelector('#composerDialog').open);
 report.cases.push({width, keyboard:true,noHorizontalOverflow:true,resumeGallery:true,reloadGallery:true,guide:true,composerOpenCloseRepeat:true});
 await context.close();
}
} finally {await browser.close();}
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
