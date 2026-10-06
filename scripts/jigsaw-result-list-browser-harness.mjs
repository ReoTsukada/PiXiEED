import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required');
const out = '/tmp/pixieed-jigsaw-result-list-20261006'; await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true}); const results=[];
try {
  for (const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
    const context=await browser.newContext({viewport:{width,height}}); const page=await context.newPage(); const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await page.addInitScript(()=>document.addEventListener('jigsaw:state',event=>{window.fixtureJigsawState=event.detail;}));
    await page.goto(`${base}/jigsaw/`);
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=3;const g=c.getContext('2d');for(let y=0;y<3;y++)for(let x=0;x<3;x++){g.fillStyle=`rgb(${x*80},${y*80},${(x+y)*40})`;g.fillRect(x,y,1,1);}return c.toDataURL('image/png').split(',')[1];});
    await page.locator('#jigsaw-source-kind').selectOption('file');
    await page.locator('#jigsaw-file').setInputFiles({name:'owned-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>!document.querySelector('#jigsaw-start').disabled);
    await page.waitForFunction(()=>!document.querySelector('.arc-card').disabled);
    assert.equal(await page.locator('#jigsaw-grid-size').isVisible(),false);
    await page.locator('.arc-card').first().click(); await page.locator('#jigsaw-start').click();
    try {await page.waitForFunction(()=>window.fixtureJigsawState?.pieces===1,undefined,{timeout:5000});}
    catch(error){console.log(await page.evaluate(()=>({state:window.fixtureJigsawState,status:document.querySelector('#jigsaw-status').textContent,grid:document.querySelector('#jigsaw-grid-size').value})));await page.screenshot({path:`${out}/jigsaw-${width}-failure.png`});throw error;}
    const geometry=await page.evaluate(()=>{
      const r=document.querySelector('#jigsaw-workspace').getBoundingClientRect(); const h=document.querySelector('.site-header').getBoundingClientRect(); const n=document.querySelector('.app-tabs').getBoundingClientRect();
      return {workspace:r.toJSON(),header:h.toJSON(),nav:n.toJSON(),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(geometry.overflow,false); assert.ok(geometry.workspace.top>=geometry.header.bottom && geometry.workspace.bottom<=geometry.nav.top);
    assert.ok(geometry.workspace.height>(height<500?160:height*.55),JSON.stringify(geometry));
    await page.locator('#jigsaw-preview-toggle').click(); assert.equal(await page.locator('#jigsaw-preview').isVisible(),true);
    await page.screenshot({path:`${out}/jigsaw-${width}-play.png`});
    await page.locator('#jigsaw-preview-close').click();
    await page.locator('#jigsaw-tray .jigsaw-piece').click();
    await page.locator('#jigsaw-workspace').focus(); await page.keyboard.press('Enter');
    const result=page.locator('[data-tool-result-view="jigsaw-result"]'); await result.waitFor({state:'visible'});
    const state=await page.evaluate(()=>window.fixtureJigsawState); assert.equal(state.complete,true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1')),null,'completion did not silently save');
    assert.equal(await result.getByRole('button',{name:/パズルに戻る|もういちど|もう一度遊ぶ/}).count(),0);
    const link=result.getByRole('link',{name:'問題一覧に戻る',exact:true}); assert.equal(await link.getAttribute('href'),'/jigsaw/');
    assert.equal(await page.locator('#jigsaw-preview').isVisible(),false);
    await page.screenshot({path:`${out}/jigsaw-${width}-result.png`});
    if(width===320) await link.click();
    else if(width===390){await link.focus();await page.keyboard.press('Enter');}
    else if(width===844) await page.keyboard.press('Escape');
    else await page.locator('#jigsaw-save').click();
    assert.equal(page.url(),`${base}/jigsaw/`); assert.equal(await page.locator('#jigsaw-setup').isVisible(),true);
    assert.equal(await page.locator('#jigsaw-play').isVisible(),false); assert.equal(await page.locator('#jigsaw-preview').isVisible(),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1')),null);
    await page.screenshot({path:`${out}/jigsaw-${width}-list.png`});
    await page.locator('#jigsaw-current').click();
    assert.deepEqual(await page.evaluate(()=>window.fixtureJigsawState),state,'unsaved game identity and complete grouping survive list return');
    await page.locator('#jigsaw-save').click();
    try{await page.waitForFunction(()=>!!localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'),undefined,{timeout:5000});}
    catch(error){console.log(await page.evaluate(()=>({status:document.querySelector('#jigsaw-status').textContent,result:document.body.dataset.toolResultOpen,disabled:document.querySelector('#jigsaw-save').disabled})));await page.screenshot({path:`${out}/jigsaw-${width}-save-failure.png`});throw error;}
    assert.equal(await page.evaluate(()=>localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1')),state.gameId);
    assert.deepEqual(errors,[]);
    results.push({width,height,workspaceHeight:geometry.workspace.height,listHref:'/jigsaw/',checks:'link/Enter/Escape/nav, preview closure, in-memory unsaved game and subsequent save PASS'});
    console.log(JSON.stringify(results.at(-1))); await context.close();
  }
} finally {await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
