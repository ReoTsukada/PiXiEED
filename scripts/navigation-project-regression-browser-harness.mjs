#!/usr/bin/env node
/** Local-only project output and real beforeunload cancellation regression checks. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { createDrawDocument } from '../js/creation/draw-core.mjs';
import { putPxdDrawDocument } from '../js/creation/pxd-project.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4210';
const origin = new URL(base).origin;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname), 'Localhost only');
const output = process.env.PIXIEED_NAV_PROJECT_OUTPUT || '/tmp/pixieed-nav-roles-20261012/project-regressions';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(modulePath === 'playwright' ? modulePath : pathToFileURL(modulePath).href);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding:'utf8' }).trim();
const sourceFingerprint = process.env.PIXIEED_SOURCE_FINGERPRINT || null;
const viewports = [{width:320,height:568},{width:390,height:844}];
const results = [], failures = [];
const startedAt = new Date().toISOString();
await mkdir(output,{recursive:true});
let drawing = createDrawDocument(16);
drawing.pixels[17] = 2; drawing.pixels[18] = 2; drawing.pixels[33] = 4;
const fixture = await encodePxd(await putPxdDrawDocument(createPxdProject({manifest:{title:'Navigation regression fixture'}}), drawing));

const browser = await chromium.launch({headless:true});
async function newPage(viewport) {
  const context = await browser.newContext({viewport, acceptDownloads:true});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['blob:','data:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  await context.addInitScript(() => {
    window.__projectMediaRequests = 0;
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { window.__projectMediaRequests++; throw new DOMException('Synthetic project QA camera', 'NotFoundError'); } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  return {context,page};
}
async function loadFixture(page) {
  await page.goto(`${base}/draw/`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.dataset.creationModesReady==='true' && !document.body.hasAttribute('data-creation-transition'), null, {timeout:30000});
  await page.locator('#project-open').click();
  await page.locator('#project-tab-library').click();
  const imports = page.locator('.project-imports');
  if (!await imports.evaluate(n=>n.open)) await imports.locator(':scope > summary').click();
  await page.locator('#pxd-file-input').setInputFiles({name:'navigation-regression.pxd',mimeType:'application/octet-stream',buffer:Buffer.from(fixture)});
  await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.querySelector('.project-bar__open')?.dataset.state==='saved', null, {timeout:30000});
  if (await page.locator('#pxd-panel').evaluate(n=>n.open)) await page.locator('#project-close').click();
  await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.body.dataset.creationMode==='draw');
}
async function projectSnapshot(page) {
  return page.evaluate(async () => {
    const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || localStorage.getItem('pixieed:pxd:last:draw') || 'null');
    if (!pointer?.projectId || !pointer?.revisionId) throw new Error('Missing current project pointer');
    const {createToolProjectStore} = await import('/js/creation/tool-project-store.mjs');
    const {readPxdDrawDocument} = await import('/js/creation/pxd-project.mjs');
    const project = await createToolProjectStore('draw').load(pointer.projectId,pointer.revisionId);
    const doc = await readPxdDrawDocument(project);
    return {pointer,projectId:project.projectId,revisionId:project.revisionId,title:project.manifest?.title,pixels:doc?.pixels||null,palette:doc?.palette||null};
  });
}
async function editCanvas(page) {
  const canvas=page.locator('#draw-canvas'), box=await canvas.boundingBox();
  assert.ok(box,'Draw canvas has a hit box');
  const before=await canvas.evaluate(n=>({width:n.width,height:n.height,pixels:[...n.getContext('2d').getImageData(0,0,n.width,n.height).data]}));
  await page.mouse.click(box.x+box.width*.72,box.y+box.height*.69);
  const editedAt=Date.now();
  await page.waitForFunction(()=>document.querySelector('.project-bar__open')?.dataset.state==='editing',null,{timeout:1500}).catch(()=>{});
  const after=await canvas.evaluate(n=>({width:n.width,height:n.height,pixels:[...n.getContext('2d').getImageData(0,0,n.width,n.height).data]}));
  assert.notDeepEqual(after.pixels,before.pixels,'Canvas gesture changed the fixture');
  return {before,after,editedAt};
}

try {
  for (const viewport of viewports) {
    {
      const label=`project-output-return-${viewport.width}x${viewport.height}`, {context,page}=await newPage(viewport), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try {
        await loadFixture(page);
        const initial=await projectSnapshot(page);
        const edit=await editCanvas(page);
        const editorOrigin=await page.evaluate(()=>performance.timeOrigin);
        for (const mode of ['audio','camera','draw']) {
          await page.locator(`.app-tabs > button[data-creation-mode="${mode}"]`).click();
          await page.waitForFunction(expected=>document.body.dataset.creationMode===expected&&!document.body.hasAttribute('data-creation-transition'),mode,{timeout:30000});
        }
        assert.equal(await page.evaluate(()=>performance.timeOrigin),editorOrigin,'Mode changes retain the actual editor document');
        const rgba=()=>page.locator('#draw-canvas').evaluate(n=>[...n.getContext('2d').getImageData(0,0,n.width,n.height).data]);
        assert.deepEqual(await rgba(),edit.after.pixels,'Mode changes retain the edited pixels');
        await page.locator('#draw-undo').click();
        assert.deepEqual(await rgba(),edit.before.pixels,'Undo after three mode changes restores the pre-stroke pixels');
        await page.locator('#draw-redo').click();
        assert.deepEqual(await rgba(),edit.after.pixels,'Redo after three mode changes restores the edited pixels');
        await page.locator('#draw-output > summary').click();
        await page.locator('#draw-export').click();
        await page.waitForURL(url=>url.pathname==='/output/work/'&&Boolean(url.searchParams.get('id')),{timeout:30000});
        const outputId=new URL(page.url()).searchParams.get('id');
        await page.locator('#output-return').waitFor({state:'visible'});
        const record=await page.evaluate(async id=>{
          const {readToolOutput}=await import('/js/creation/output-handoff.mjs?rev=20261018-direct-runtime-1');
          const r=await readToolOutput(id);
          return {id:r.id,returnUrl:r.returnUrl,source:r.source,title:r.title,filename:r.filename,metadata:r.metadata,mediaSourceCount:r.mediaSources?.length||0};
        },outputId);
        const savedBeforeReturn=await projectSnapshot(page);
        const returnUrl=new URL(record.returnUrl,origin);
        assert.equal(record.source,'PiXiEEDraw','Output record came from Draw project export');
        assert.equal(returnUrl.pathname,'/draw/','Draw output returns to Draw');
        assert.ok(!returnUrl.searchParams.has('mode')||returnUrl.searchParams.get('mode')==='draw','Return URL retains the Draw mode');
        if(returnUrl.searchParams.has('modeProjectTool'))assert.equal(returnUrl.searchParams.get('modeProjectTool'),'draw','Return URL retains Draw project mode when encoded');
        if(returnUrl.searchParams.has('modePxd'))assert.equal(returnUrl.searchParams.get('modePxd'),initial.projectId,'Return URL preserves project identity when encoded');
        if(returnUrl.searchParams.has('modePxdRevision'))assert.equal(returnUrl.searchParams.get('modePxdRevision'),savedBeforeReturn.revisionId,'Return URL points at the saved project revision when encoded');
        assert.equal(savedBeforeReturn.projectId,initial.projectId,'Saving the edited export keeps the same project ID');
        assert.notEqual(savedBeforeReturn.revisionId,initial.revisionId,'Export flushes edits to a new project revision');
        assert.notDeepEqual(savedBeforeReturn.pixels,initial.pixels,'Saved project includes the canvas edit');
        await page.locator('#output-return').click();
        await page.waitForURL(url=>url.pathname==='/draw/',{timeout:30000});
        await page.waitForFunction(()=>document.documentElement.dataset.creationModesReady==='true'&&document.body.dataset.creationMode==='draw'&&!document.body.hasAttribute('data-creation-transition'),null,{timeout:30000});
        const returned=await projectSnapshot(page);
        assert.equal(returned.projectId,savedBeforeReturn.projectId,'Return opens the same current project');
        assert.equal(returned.revisionId,savedBeforeReturn.revisionId,'Return opens the revision used for output');
        assert.deepEqual(returned.pixels,savedBeforeReturn.pixels,'Return preserves current project pixels');
        assert.ok(!new URL(page.url()).searchParams.has('mode')||new URL(page.url()).searchParams.get('mode')==='draw','Return mode is Draw');
        assert.deepEqual(errors,[],'No page errors during export and return');
        const evidence={viewport,initial,editPixelsChanged:!deepEqualJSON(edit.before.pixels,edit.after.pixels),outputId,record,savedBeforeReturn,returned,returnUrl:page.url(),errors};
        results.push({scenario:label,status:'PASS',...evidence});
        await page.screenshot({path:`${output}/${label}.png`});
        console.log(`PASS ${label}`);
      } catch(error) { failures.push({scenario:label,error:error.stack}); console.error(`FAIL ${label}: ${error.message}`); }
      finally { await context.close(); }
    }
    {
      const label=`cancel-unsaved-navigation-${viewport.width}x${viewport.height}`, {context,page}=await newPage(viewport);
      let promptType=null, promptDismissed=false;
      page.on('dialog',async dialog=>{promptType=dialog.type(); if(dialog.type()==='beforeunload'){await dialog.dismiss();promptDismissed=true;} else await dialog.dismiss();});
      try {
        await loadFixture(page);
        const beforePointer=await projectSnapshot(page), edit=await editCanvas(page);
        const beforeUrl=page.url(), timeOrigin=await page.evaluate(()=>performance.timeOrigin);
        await page.locator('[data-menu-toggle]').click();
        const outputDestination=page.locator('[data-site-menu] a[data-menu-link][href="/output/"]');
        await outputDestination.click();
        const editDuration=Date.now()-edit.editedAt;
        assert.ok(editDuration<1000,`Page transition was attempted before the 1s autosave (${editDuration}ms)`);
        await page.waitForFunction(()=>document.visibilityState==='visible'&&location.pathname==='/draw/',null,{timeout:5000});
        assert.equal(promptType,'beforeunload','Dirty project triggers the browser beforeunload prompt');
        assert.equal(promptDismissed,true,'User dismisses the genuine beforeunload prompt');
        assert.equal(page.url(),beforeUrl,'Cancelled page transition stays on the editor URL');
        assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin,'Cancelled transition retains the current document');
        const afterCanvas=await page.locator('#draw-canvas').evaluate(n=>({width:n.width,height:n.height,pixels:[...n.getContext('2d').getImageData(0,0,n.width,n.height).data]}));
        assert.deepEqual(afterCanvas.pixels,edit.after.pixels,'Cancelled transition preserves the in-progress canvas');
        const afterPointer=await projectSnapshot(page);
        assert.equal(afterPointer.projectId,beforePointer.projectId,'Cancelled transition preserves project identity');
        assert.equal(afterPointer.revisionId,beforePointer.revisionId,'Cancelled transition does not replace the current revision');
        results.push({scenario:label,status:'PASS',viewport,promptType,promptDismissed,editDuration,beforeUrl,project:afterPointer,canvasChanged:!deepEqualJSON(edit.before.pixels,edit.after.pixels)});
        await page.screenshot({path:`${output}/${label}.png`});
        console.log(`PASS ${label}`);
      } catch(error) { failures.push({scenario:label,error:error.stack,promptType,promptDismissed}); console.error(`FAIL ${label}: ${error.message}`); }
      finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  await mkdir(output,{recursive:true});
  await writeFile(`${output}/report.json`,JSON.stringify({head,sourceFingerprint,base,startedAt,finishedAt:new Date().toISOString(),externalRequests:'blocked',externalStorage:'mocked/unused',mediaPermission:'not requested',viewports,results,failures},null,2));
}
console.log(JSON.stringify({results:results.length,failures:failures.length,output},null,2));
if(failures.length)process.exitCode=1;

function deepEqualJSON(a,b){return JSON.stringify(a)===JSON.stringify(b);}
