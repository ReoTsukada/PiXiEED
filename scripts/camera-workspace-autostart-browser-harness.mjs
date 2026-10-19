#!/usr/bin/env node
/** Local-only synthetic-media checks for explicit camera WORK activation. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only localhost is allowed');
const out = process.env.PIXIEED_CAMERA_AUTOSTART_OUTPUT || '/tmp/pixieed-stage4/camera-autostart';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE
  || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
await mkdir(out, { recursive:true });
const browser = await chromium.launch({ headless:true });
const report = { engine:'chromium', engineVersion:browser.version(), base, externalRequestsSent:0, blockedRequests:[], mediaAudioContract:'every observed getUserMedia request must set audio:false', cases:[], failures:[] };
const selectedCases=new Set((process.env.PIXIEED_CAMERA_AUTOSTART_CASES||'').split(',').map(name=>name.trim()).filter(Boolean));

async function fresh(name, behavior = 'allow') {
  const row = { name, checks:[], errors:[], blocked:[] }; report.cases.push(row);
  const context = await browser.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || !['GET','HEAD'].includes(request.method())) {
      const blocked = { method:request.method(), url:request.url() }; row.blocked.push(blocked); report.blockedRequests.push(blocked); return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(({ behavior }) => {
    const qa = window.__cameraWorkspaceQA = { behavior, requests:0, constraints:[], streams:[], tracks:[], startedAt:[], settled:0, hidden:false };
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>qa.hidden});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>qa.hidden?'hidden':'visible'});
    navigator.mediaDevices.getUserMedia = constraints => {
      qa.requests++; qa.constraints.push(constraints); qa.startedAt.push(performance.now());
      if (qa.behavior === 'deny') return Promise.reject(new DOMException('Synthetic denial', 'NotAllowedError'));
      if (qa.behavior === 'no-device') return Promise.reject(new DOMException('Synthetic no device', 'NotFoundError'));
      if (qa.behavior === 'busy') return Promise.reject(new DOMException('Synthetic device busy', 'NotReadableError'));
      if (qa.behavior === 'pending' || (qa.behavior === 'pending-once' && qa.requests === 1)) {
        return new Promise(resolve => { qa.grant = () => resolve(makeStream()); }).finally(() => { qa.settled++; });
      }
      qa.settled++;
      return Promise.resolve(makeStream());
      function makeStream() {
        const canvas = document.createElement('canvas'); canvas.width=48; canvas.height=48;
        const ctx = canvas.getContext('2d'); ctx.fillStyle='#d94162'; ctx.fillRect(0,0,24,48); ctx.fillStyle='#3278d4'; ctx.fillRect(24,0,24,48);
        const stream = canvas.captureStream(8); qa.streams.push(stream);
        for (const track of stream.getTracks()) qa.tracks.push(track);
        return stream;
      }
    };
  }, { behavior });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => row.errors.push(e.message));
  return { context, page, row };
}

async function ready(page, mode) {
  await page.waitForFunction(expected => {
    const host=window.__PIXIEED_CREATION_HOST__;
    return document.documentElement.dataset.toolDirect==='work' && host?.runtime?.state.ready
      && host.runtime.state.mode===expected && document.querySelector('[data-embed-start]')?.getAttribute('aria-busy')==='false';
  }, mode);
  assert.equal(await page.locator('iframe').count(), 0);
}
async function waitForRequest(page, n) { await page.waitForFunction(count => window.__cameraWorkspaceQA?.requests===count, n); }
function check(row, label) { row.checks.push(label); }

async function run(name, behavior, body) {
  if (selectedCases.size && !selectedCases.has(name)) return;
  const { context, page, row } = await fresh(name, behavior);
  try {
    await body({ context, page, row });
    const audioConstraints=[];
    for (const frame of page.frames()) {
      const seen=await frame.evaluate(()=>window.__cameraWorkspaceQA?.constraints || []).catch(()=>[]);
      audioConstraints.push(...seen.map(constraints=>constraints.audio));
    }
    assert.ok(audioConstraints.length>0, 'scenario must observe at least one synthetic media request');
    assert.ok(audioConstraints.every(audio=>audio===false), `every getUserMedia request must set audio:false: ${JSON.stringify(audioConstraints)}`);
    row.mediaRequests=audioConstraints.length; row.mediaAudioValues=audioConstraints;
    assert.deepEqual(row.errors, []); console.log('PASS', name, row.checks.length);
  }
  catch (error) {
    row.failure=error.stack || String(error); report.failures.push(name);
    row.diagnostics=await page.evaluate(()=>({mode:document.body.dataset.creationMode,resultOpen:document.body.getAttribute('data-tool-result-open'),dialogs:[...document.querySelectorAll('dialog[open]')].map(node=>node.outerHTML.slice(0,300)),cameraMode:document.querySelector('#pixelStudio')?.dataset.mode,cameraResultHidden:document.querySelector('[data-tool-result-view="camera-result"]')?.hidden,modeError:document.querySelector('.creation-mode-error')?.textContent})).catch(()=>null);
    console.error('FAIL',name,error.message); await page.screenshot({path:`${out}/${name}-failure.png`,fullPage:true}).catch(()=>{});
  }
  finally {
    await context.close();
    await writeFile(`${out}/results.json`,JSON.stringify(report,null,2));
  }
}

await run('explanation-is-passive-home-cta-starts-once','allow', async ({page,row}) => {
  await page.goto(`${base}/camera/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[data-embed-start]'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),0);
  await page.evaluate(()=>{window.__cameraWorkspaceQA.hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(100);
  await page.evaluate(()=>{window.__cameraWorkspaceQA.hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),0);
  check(row,'ordinary /camera/ explanation requests no media even across hide/show');
  await page.locator('[data-embed-start]').click(); await ready(page,'camera'); await waitForRequest(page,1);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');
  await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode('camera'));
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  assert.deepEqual(await page.evaluate(()=>window.__cameraWorkspaceQA.constraints.map(c=>c.audio)),[false]);
  check(row,'explicit home CTA enters WORK and starts exactly one video-only request, including duplicate activation');
});

await run('homepage-camera-card-enters-camera-work','allow', async ({page,row}) => {
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('a[data-static-tool="camera"][href="/camera/?workspace=1"]').click();
  await page.waitForURL(url=>url.pathname==='/camera/'&&url.searchParams.get('workspace')==='1');
  await ready(page,'camera'); await waitForRequest(page,1);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  check(row,'real homepage camera card opens workspace=1 and starts one video-only camera request');
});

await run('direct-camera-workspace-autostarts','allow', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera');
  await waitForRequest(page,1); await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');
  assert.deepEqual(await page.evaluate(()=>window.__cameraWorkspaceQA.constraints.map(c=>c.audio)),[false]);
  check(row,'direct camera WORK starts once with audio disabled');
});

await run('iframe-camera-workspace-autostarts','allow', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=iframe`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('#pixelStudio'));
  const frame=page.frames().find(f=>f.url().includes('/draw/editor.html')); assert.ok(frame,'iframe fallback mounts the shared editor');
  await frame.waitForFunction(()=>document.body.dataset.creationMode==='camera'&&document.querySelector('#main')&&!document.querySelector('#main').inert);
  await frame.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');
  assert.equal(await frame.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  assert.deepEqual(await frame.evaluate(()=>window.__cameraWorkspaceQA.constraints.map(c=>c.audio)),[false]);
  check(row,'iframe camera WORK starts once after the shared runtime is active, with audio disabled');
});

await run('editor-camera-selection-autostarts-preserving-draw','allow', async ({page,row}) => {
  await page.goto(`${base}/draw/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'draw');
  const blank=await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.getState());
  const canvasBox=await page.locator('#draw-canvas').boundingBox();
  const canvasSize=await page.locator('#draw-canvas').evaluate(node=>({width:node.width,height:node.height}));
  await page.mouse.click(canvasBox.x+canvasBox.width*3.5/canvasSize.width,canvasBox.y+canvasBox.height*4.5/canvasSize.height);
  const before=await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.getState());
  assert.notEqual(before.image.hash,blank.image.hash,'test fixture creates nonblank artwork');
  await page.locator('[aria-controls="creation-mode-panel"]').click();
  await page.locator('#creation-mode-panel button[data-creation-mode="camera"]').click(); await ready(page,'camera'); await waitForRequest(page,1);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');
  const after=await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.getState());
  assert.equal(after.image.hash,before.image.hash,'live preview must not replace the shared Draw artwork');
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  check(row,'editor camera selection starts once while preserving the nonblank shared project');
});

await run('reenter-keeps-imported-camera-image','allow', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  const bytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#e15268';ctx.fillRect(0,0,20,40);ctx.fillStyle='#315fc4';ctx.fillRect(20,0,20,40);
    return [...new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))).arrayBuffer())];
  });
  await page.locator('#cameraImageInput').setInputFiles({name:'synthetic-import.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.source==='image'&&document.querySelector('#pixelStudio')?.dataset.ready==='true');
  await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode('draw')); await ready(page,'draw');
  await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode('camera')); await ready(page,'camera');
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.source==='image');
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1,'re-entry must not replace the chosen image with a second camera request');
  check(row,'manual image import survives camera-mode exit/re-entry without another media request');
});

await run('reenter-keeps-captured-camera-result','allow', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.waitForFunction(()=>document.querySelector('#capture')?.dataset.action==='capture'&&!document.querySelector('#capture').disabled);
  await page.locator('#capture').click(); await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured'&&document.body.dataset.toolResultOpen==='camera-result');
  const captured=await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.state.camera?.mode||document.querySelector('#pixelStudio')?.dataset.mode);
  assert.equal(captured,'captured');
  await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode('draw')); await ready(page,'draw');
  row.afterDraw=await page.evaluate(()=>({mode:document.body.dataset.creationMode,resultOpen:document.body.getAttribute('data-tool-result-open'),dialogs:[...document.querySelectorAll('dialog[open]')].map(node=>node.id)}));
  await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode('camera')); await ready(page,'camera');
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured');
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1,'captured result must not be replaced by a fresh camera stream');
  check(row,'retained captured result survives re-entry without another camera request');
});

await run('denial-has-one-shot-entry-and-explicit-retry','deny', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='idle');
  assert.ok(await page.locator('#cameraFallbackChoose').isEnabled());
  assert.match(await page.locator('#stageMsg').textContent(),/許可|カメラ/);
  await page.waitForTimeout(200); assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  await page.evaluate(()=>window.__cameraWorkspaceQA.behavior='allow'); await page.locator('#capture').click(); await waitForRequest(page,2);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),2);
  check(row,'denial offers import and does not loop; only explicit retry issues a second request');
});

await run('late-grant-after-explanation-is-stopped','pending', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.locator('[data-shell-explanation]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.toolDirect==='explanation');
  await page.evaluate(()=>window.__cameraWorkspaceQA.grant());
  await page.waitForFunction(()=>window.__cameraWorkspaceQA.tracks.length===1 && window.__cameraWorkspaceQA.tracks.every(t=>t.readyState==='ended'));
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  await page.locator('[data-embed-start]').click(); await ready(page,'camera'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1,'resume from explanation must not implicitly request again');
  check(row,'a permission result arriving after leave has its tracks stopped, and ordinary resume does not retry');
});

await run('late-grant-after-hide-is-stopped','pending', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.evaluate(()=>{window.__cameraWorkspaceQA.hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='idle');
  await page.evaluate(()=>window.__cameraWorkspaceQA.grant());
  await page.waitForFunction(()=>window.__cameraWorkspaceQA.tracks.length===1 && window.__cameraWorkspaceQA.tracks.every(t=>t.readyState==='ended'));
  await page.evaluate(()=>{window.__cameraWorkspaceQA.hidden=false;document.dispatchEvent(new Event('visibilitychange'));}); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  check(row,'hide invalidates a pending permission result, stops its tracks, and visibility restore does not repeat it');
});

await run('late-grant-after-dispose-is-stopped','pending', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.dispose());
  await page.waitForFunction(()=>!window.__PIXIEED_CREATION_HOST__);
  await page.evaluate(()=>window.__cameraWorkspaceQA.grant());
  await page.waitForFunction(()=>window.__cameraWorkspaceQA.tracks.length===1 && window.__cameraWorkspaceQA.tracks.every(t=>t.readyState==='ended'));
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  check(row,'disposing the active host invalidates a pending permission result and stops its tracks');
});

await run('no-device-shows-recovery-without-loop','no-device', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='idle');
  assert.ok(await page.locator('#cameraFallbackChoose').isEnabled());
  await page.waitForTimeout(200); assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  check(row,'missing-device failure leaves the image-import fallback available without another request');
});

await run('busy-device-shows-recovery-without-loop','busy', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='idle');
  assert.match(await page.locator('#stageMsg').textContent(),/別のアプリ/);
  assert.ok(await page.locator('#cameraFallbackChoose').isEnabled());
  await page.waitForTimeout(200); assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1);
  check(row,'NotReadableError/device busy gives recovery guidance and does not auto-retry');
});

await run('pending-hide-reenter-waits-then-explicit-retry','pending-once', async ({page,row}) => {
  await page.goto(`${base}/camera/?workspace=1&runtime=direct`,{waitUntil:'domcontentloaded'}); await ready(page,'camera'); await waitForRequest(page,1);
  await page.evaluate(()=>{window.__cameraWorkspaceQA.hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='idle');
  await page.evaluate(()=>{window.__cameraWorkspaceQA.hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode('draw'));
  await ready(page,'draw'); await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode('camera')); await ready(page,'camera');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),1,'re-enter must not stack a second request while first permission is pending');
  await page.evaluate(()=>window.__cameraWorkspaceQA.grant());
  await page.waitForFunction(()=>window.__cameraWorkspaceQA.settled===1 && window.__cameraWorkspaceQA.tracks.length===1 && window.__cameraWorkspaceQA.tracks.every(t=>t.readyState==='ended'));
  assert.equal(await page.evaluate(()=>document.querySelector('#pixelStudio')?.dataset.mode), 'idle');
  await page.evaluate(()=>window.__cameraWorkspaceQA.behavior='allow'); await page.locator('#capture').click(); await waitForRequest(page,2);
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');
  assert.equal(await page.evaluate(()=>window.__cameraWorkspaceQA.requests),2);
  check(row,'hide invalidates pending prompt; deliberate re-entry waits without stacking; late grant is stopped; manual retry starts the next stream');
});

await browser.close();
await writeFile(`${out}/results.json`,JSON.stringify(report,null,2));
if (report.failures.length || report.blockedRequests.length || report.externalRequestsSent) process.exitCode=1;
console.log(JSON.stringify({ cases:report.cases.map(c=>({name:c.name,checks:c.checks.length,failure:Boolean(c.failure)})), failures:report.failures, externalRequestsSent:report.externalRequestsSent, blockedRequests:report.blockedRequests.length }));
