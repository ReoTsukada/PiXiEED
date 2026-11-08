#!/usr/bin/env node
/** Local-only alignment regression. Never reads user projects or reaches production. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:8941';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'localhost only');
const output = process.env.PIXIEED_ALIGNMENT_OUTPUT || '/tmp/pixieed-draw-alignment';
const baseline = process.env.PIXIEED_ALIGNMENT_BASELINE === '1';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
await mkdir(output, { recursive: true });
const report = { status: 'RUNNING', baseline, base, cases: [], errors: [], blockedRequests: [], limitations: ['Headless Chromium, isolated synthetic projects. Physical phones and Safari not tested.'] };
const settle = async page => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(160); };
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < .1, label + ': ' + actual + ' vs ' + expected);
async function geometry(page) {
  return page.evaluate(() => {
    const box = node => { if (!node || !node.checkVisibility()) return null; const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,centerY:r.y+r.height/2,transform:getComputedStyle(node).transform }; };
    return {
      desktop: document.body.classList.contains('draw-desktop-active'),
      controls: box(document.querySelector('.draw-controls')),
      left: ['#draw-tool-summary','.animation-controls__workspace-launcher','.draw-color-adjustment-open'].map(s => box(document.querySelector(s))),
      right: [...document.querySelectorAll('#draw-selection-controls [data-selection-slot]')].map(box),
      palette: [...document.querySelectorAll('#draw-palette .draw-color')].map(box),
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      desktopButtons: [...document.querySelectorAll('.draw-desktop-button')].map(box).filter(Boolean),
      safeArea: (() => { const e=document.createElement('div'); e.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.append(e); const s=getComputedStyle(e); const value=[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft];e.remove();return value;})()
    };
  });
}
function check(g, label) {
  assert.ok(g.palette.length >= 9, label + ' has default palette');
  assert.ok(g.documentWidth <= g.viewportWidth, label + ' no page horizontal overflow');
  if (g.desktop) {
    for (const p of g.palette) { near(p.width,44,label+' desktop swatch width');near(p.height,44,label+' desktop swatch height'); }
    assert.ok(g.desktopButtons.length > 10, label+' desktop controls preserved');
    return;
  }
  near(g.controls.height,158,label+' control height preserved');
  for(let row=0;row<3;row++) {
    assert.ok(g.left[row], label+' left row '+row);
    if (!baseline) near(g.left[row].centerY,g.palette[row].centerY,label+' left row '+row+' aligns with palette');
    near(g.left[row].height,44,label+' left target size');
    near(g.left[row].width,44,label+' left target width');
  }
  g.right.forEach((r,row)=> { if (r && !baseline) { near(r.centerY,g.palette[row].centerY,label+' right row '+row);near(r.height,44,label+' right target size'); } });
  if (!baseline) for (const p of g.palette) {near(p.width,44,label+' swatch width');near(p.height,44,label+' swatch height');assert.equal(p.transform,'none',label+' selection does not shift');}
}
async function tool(page, name) {
  const desktop = await page.locator('body').evaluate(n=>n.classList.contains('draw-desktop-active'));
  const selector = name==='select' ? '[data-selection-mode="rectangle"]' : '';
  if (desktop) await page.locator('[data-desktop-tool="'+name+'"]'+(name==='select'?'[data-desktop-selection-mode="rectangle"]':'')).click();
  else { await page.locator('#draw-tool-summary').click(); await page.locator('.draw-tool-menu [data-draw-tool="'+name+'"]'+selector).click(); }
  await settle(page);
}
async function drag(page, from, to) {
  const r=await page.locator('#draw-canvas').boundingBox();
  await page.mouse.move(r.x+r.width*from[0],r.y+r.height*from[1]);await page.mouse.down();
  await page.mouse.move(r.x+r.width*to[0],r.y+r.height*to[1],{steps:8});await page.mouse.up();await settle(page);
}
try {
 for(const viewport of [
   {width:320,height:568},{width:390,height:844},{width:412,height:750},{width:430,height:932},
   {width:568,height:320},{width:844,height:390},{width:1024,height:768},
   {width:1100,height:620},{width:1440,height:900}
 ]) {
   const label=viewport.width+'x'+viewport.height, row={label,states:[]};report.cases.push(row);
   const context=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:false});
   await context.route('**/*',r=>{const req=r.request();if(new URL(req.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(req.method()))return r.continue();report.blockedRequests.push(req.url());return r.abort();});
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push({label,message:e.message}));
   await page.goto(base+'/draw/?workspace=1',{waitUntil:'domcontentloaded'});
   await page.locator('#project-start-new').click();
   await page.waitForFunction(()=>window.__PIXIEED_CREATION_HOST__?.runtime&&!document.querySelector('#main')?.inert);
   await settle(page);
   const record=async state=>{const g=await geometry(page);check(g,label+' '+state);row.states.push({state,...g});return g;};
   const initial=await record('pen');
   await page.screenshot({path:join(output,(baseline?'before-':'after-')+label+'.png')});
   if (!initial.desktop) {
     for(const index of [3,4,5]) { await page.locator('#draw-palette .draw-color').nth(index).click();await settle(page);await record('selected-row-'+index%3); }
     await tool(page,'rectangle'); await record('one-right-action');
     await page.locator('#draw-selection-controls [data-selection-slot="0"]').click();await settle(page);await record('right-option-toggled');
     await tool(page,'select'); await drag(page,[.2,.2],[.55,.55]); const selected=await record('two-right-actions');
     assert.ok(selected.right.every(Boolean),'copy and cut slots visible');
     await page.screenshot({path:join(output,(baseline?'before-':'after-')+label+'-actions.png')});
     await page.locator('[data-selection-action="deselect"]').click();await settle(page);await record('selection-dismissed');
     await tool(page,'pen');await record('pen-restored');
     if(viewport.width===390 || viewport.width===844) {
       const cdp=await context.newCDPSession(page);
       try {
         const insets=viewport.width===390?{top:47,bottom:34,left:0,right:0}:{top:0,bottom:21,left:44,right:44};
         await cdp.send('Emulation.setSafeAreaInsets',{insets});await settle(page);const safe=await record('safe-area-insets');
         assert.ok(safe.safeArea.some(v=>v!=='0px'),'safe area emulation applied');row.safeAreaInsets=insets;
         await page.screenshot({path:join(output,(baseline?'before-':'after-')+label+'-safe-area.png')});
       } catch(error) {
         if (!error.message.includes('wasn\'t found')) throw error;
         // Older Chromium has no native safe-area emulation. Substitute only
         // CSS env() values in this isolated page; this is not device coverage.
         const insets=viewport.width===390?{top:47,bottom:34,left:0,right:0}:{top:0,bottom:21,left:44,right:44};
         const substitutions=await page.evaluate(insets=>{
           let count=0;
           for(const sheet of document.styleSheets) for(let i=0;i<sheet.cssRules.length;i++) {
             const before=sheet.cssRules[i].cssText;
             const after=before.replace(/env\(safe-area-inset-(top|right|bottom|left)(?:,[^)]*)?\)/g,(_,side)=>{count++;return insets[side]+'px';});
             if(after!==before){sheet.deleteRule(i);sheet.insertRule(after,i);}
           }
           return count;
         },insets);
         assert.ok(substitutions>0,'safe area CSS substitutions applied');await settle(page);await record('safe-area-css-simulation');
         row.safeAreaSimulation={insets,substitutions};
         await page.screenshot({path:join(output,(baseline?'before-':'after-')+label+'-safe-area-simulation.png')});
       }
       await cdp.detach();
     }
   } else {
     await page.setViewportSize({width:390,height:844});await settle(page);await record('desktop-to-mobile');
     await page.setViewportSize(viewport);await settle(page);await record('mobile-to-desktop');
   }
   await context.close();console.log('PASS '+label);
 }
 assert.deepEqual(report.errors,[],'no application exceptions');report.status='PASS';
} catch(error) {report.status='FAIL';report.failure=error.stack;throw error;}
finally {await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}

