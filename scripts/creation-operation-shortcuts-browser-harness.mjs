/** Exercise real custom keyboard bindings after removing duplicate launchers. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4252',origin=new URL(base).origin;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=process.env.PIXIEED_OPERATION_SHORTCUT_OUTPUT||'/tmp/pixieed-operation-bar-dedup-20261013/shortcuts';await mkdir(output,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),report={checks:[],errors:[],externalRequests:'blocked',userStorage:false};
await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
try {
 await page.goto(base+'/draw/');await page.waitForFunction(()=>document.documentElement.dataset.creationModesReady==='true'&&!document.querySelector('#main').inert);
 assert.doesNotMatch(await page.locator('#draw-status').textContent(),/準備できません|開けません/);
 await page.locator('#creation-settings-open').click();await page.locator('#creation-mode-settings-open').click();await page.locator('#draw-shortcuts-open').click();
 await page.locator('#draw-shortcuts-dialog').waitFor({state:'visible'});
 for(const [id,key] of [['focus.fileMenu','Alt+Shift+j'],['focus.settings','Alt+Shift+s'],['open.canvasSettings','Alt+Shift+c']]) {
  await page.locator(`[data-capture="${id}"]`).click();await page.keyboard.press(key);
  assert.doesNotMatch(await page.locator('[data-capture-status]').textContent(),/使用中|使われ|ブラウザー|OS/);
 }
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.locator('#draw-canvas').focus();await page.keyboard.press('Alt+Shift+j');await page.locator('#pxd-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#draw-output').evaluate(n=>n.open),false);report.checks.push('custom file shortcut opens unified file dialog');
 await page.keyboard.press('Escape');await page.locator('#pxd-panel').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement.id==='creation-file-open');await page.locator('#draw-canvas').focus();await page.keyboard.press('Alt+Shift+s');
 await page.waitForFunction(()=>document.querySelector('#draw-settings-picker').open);report.checks.push('custom settings shortcut opens real drawing settings');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#draw-settings-picker').open&&document.activeElement.id==='creation-settings-open');await page.locator('#draw-canvas').focus();await page.keyboard.press('Alt+Shift+c');
 await page.locator('#creation-project-settings-panel').waitFor({state:'visible'});assert.equal(await page.locator('.draw-import').evaluate(n=>n.open),false);
 report.checks.push('custom canvas shortcut opens shared canvas/palette settings');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.id==='creation-settings-open');
 await page.locator('#creation-settings-open .px-nav-icon').click();await page.locator('#creation-settings-panel').waitFor({state:'visible'});
 await page.locator('#creation-settings-open .px-nav-icon').click();await page.locator('#creation-settings-panel').waitFor({state:'hidden'});
 report.checks.push('settings icon toggles panel without reopening on its child click');
 assert.deepEqual(report.errors,[]);report.passed=true;await page.screenshot({path:output+'/shortcuts-verified.png'});
}catch(error){report.passed=false;report.failure=error.message;await page.screenshot({path:output+'/failure.png'});throw error;}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
