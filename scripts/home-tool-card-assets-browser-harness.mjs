import {chromium} from '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:1366,height:900},serviceWorkers:'block',acceptDownloads:true});
await ctx.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4197'&&r.request().method()==='GET'?r.continue():r.abort());
await ctx.addInitScript(()=>{if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw Error('local asset QA media disabled');}});});
const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:4197/output/work/');await p.locator('#output-file-input').setInputFiles('assets/samples/maou.png');
await p.locator('#output-image:not([hidden])').waitFor();await p.locator('#output-extension').click();await p.locator('#output-png-background-mode').selectOption('color');
await p.waitForTimeout(300);await p.locator('#output-extension').click();
const downloadPromise=p.waitForEvent('download');await p.locator('#output-download').click();const downloaded=await downloadPromise;await downloaded.saveAs('/tmp/pixieed-maou-white-for-audio.png');
console.log('opaque copy saved by real output tool');
await p.goto('http://127.0.0.1:4197/draw/');await p.waitForFunction(()=>document.querySelector('.tool-embed__frame')?.contentDocument?.documentElement.dataset.creationModesReady==='true');
const f=p.frames().find(f=>new URL(f.url()).pathname==='/draw/editor.html');
await f.locator('#draw-import-file').setInputFiles('/tmp/pixieed-maou-white-for-audio.png');await p.waitForTimeout(700);
await p.locator('[data-embed-expand]').click();await f.locator('#creation-mode-menu > summary').click();await f.locator('button[data-creation-mode="audio"]').click();
try{await f.waitForFunction(()=>document.body.dataset.creationMode==='audio'&&!document.body.hasAttribute('data-creation-transition'),null,{timeout:7000});}catch(e){console.log('audio failure',await f.locator('body').getAttribute('data-creation-mode'),await f.locator('.creation-mode-error').textContent());throw e;}
await f.locator('#draw-import-file').setInputFiles('/tmp/pixieed-maou-white-for-audio.png');await p.waitForTimeout(500);
console.log('audio visiblecanvas',await f.locator('canvas').evaluateAll(ns=>ns.filter(n=>n.checkVisibility()).map(n=>({id:n.id,width:n.width,height:n.height}))));
await f.locator('#creation-settings-open').click();await f.locator('#creation-mode-settings-open').click();await f.locator('#draw-music-instrument').selectOption({index:1});
const notices=await f.locator('button').filter({hasText:'閉じる'}).all();for(const node of notices){if(await node.isVisible()&&await node.evaluate(n=>n.parentElement.textContent.includes('音の設定を変更')))await node.click();}
await p.waitForTimeout(200);await f.locator('body').screenshot({path:'assets/screenshots/audio-pc-maou.png'});
await writeFile('docs/home-grid-20261017/asset-capture.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'/assets/samples/maou.png',method:'real output tool PNG background-color composition → download a new opaque copy → real Draw image import → shared audio mode → music-layer image import and instrument selection; isolated new context; external requests aborted; no original asset edits; no service writes',errors},null,2));
await b.close();
