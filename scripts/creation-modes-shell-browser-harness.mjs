/** Local-only layout parity audit across shared creation modes. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only localhost QA is allowed');
const out = process.env.PIXIEED_SHELL_OUTPUT || '/tmp/pixieed-shell-parity'; await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const viewports = [{ width:320,height:568 }, { width:390,height:844 }, { width:844,height:390 }, { width:1280,height:800 }];
const selectors = { header: 'body > .site-header', main: '#main', viewport: '.draw-viewport', board: '.draw-board', dock: '.draw-control-dock', nav: 'nav.app-tabs' };
const report = { base, viewports: [], parityViolations: [], externalRequests: 'blocked', realCamera: 'UNTESTED', permissions: 'never granted' };
const round = n => Math.round(n * 100) / 100;
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await context.addInitScript(() => { window.__shellQA = { mediaRequests:0 }; Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable:true, value:async () => { window.__shellQA.mediaRequests++; throw new Error('Device access disabled'); } }); });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const sample = async mode => page.evaluate(({ mode, selectors }) => {
      const rect = element => { if (!element) return null; const r=element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
      const style = element => { if (!element) return null; const s=getComputedStyle(element); return { backgroundColor:s.backgroundColor, color:s.color, borderColor:s.borderColor, borderRadius:s.borderRadius, padding:s.padding, gap:s.gap, display:s.display, fontFamily:s.fontFamily, fontSize:s.fontSize, fontWeight:s.fontWeight, lineHeight:s.lineHeight }; };
      const get = selector => document.querySelector(selector);
      const elements = Object.fromEntries(Object.entries(selectors).map(([key,selector]) => [key,get(selector)]));
      const bodyStyle=getComputedStyle(document.body), main=get('#main'), header=elements.header, nav=elements.nav, board=elements.board, dock=elements.dock;
      const buttons=[...document.querySelectorAll('#draw-bottom-nav button, .draw-bottom-nav button, #draw-undo, #draw-redo, #draw-save, #capture, #draw-music-play')].filter(n=>n.getClientRects().length).map(n=>({id:n.id||n.getAttribute('aria-label')||n.textContent.trim(), color:getComputedStyle(n).color, background:getComputedStyle(n).backgroundColor, border:getComputedStyle(n).borderColor, rect:rect(n)}));
      const vars=['--creation-editor-header','--creation-editor-bottom','--px-header-height','--lc-nav-h','--lc-safe-t','--lc-safe-b'];
      const stage=get('#stage'), bottom=get('.lc-bottom'), controlHost=get('.creation-camera-controls'), toolbar=get('#toolbarHome'), shutter=get('#capture');
      const transport=[...document.querySelectorAll('.app-tabs #draw-animation-play, .app-tabs #draw-music-play, .app-tabs #capture')].find(n=>n.getClientRects().length);
      return { mode, body:{background:bodyStyle.backgroundColor,color:bodyStyle.color,classes:document.body.className}, vars:Object.fromEntries(vars.map(v=>[v,bodyStyle.getPropertyValue(v).trim()])),
        colorSources:{body:{background:bodyStyle.backgroundColor,color:bodyStyle.color},header:style(header),nav:style(nav),board:style(board),dock:style(dock),centralTransport:style(transport)},
        centralTransport:transport?{id:transport.id,rect:rect(transport),style:style(transport)}:null,
        elements:Object.fromEntries(Object.entries(elements).map(([k,e])=>[k,{rect:rect(e),style:style(e)}])),
        boardContent:board?{x:board.getBoundingClientRect().x+board.clientLeft,y:board.getBoundingClientRect().y+board.clientTop,width:board.clientWidth,height:board.clientHeight}:null,
        camera:{stage:rect(stage),stageStyle:style(stage),bottom:rect(bottom),bottomStyle:style(bottom),controlHost:rect(controlHost),controlHostStyle:style(controlHost),toolbar:rect(toolbar),shutter:rect(shutter)}, buttons };
    }, { mode, selectors });
    const setMode = async mode => {
      if (!await page.locator('#creation-mode-menu').evaluate(el => el.open)) await page.locator('#creation-mode-menu > summary').click();
      await page.locator(`[data-creation-mode="${mode}"]`).click();
      await page.waitForFunction(mode => document.body.dataset.creationMode===mode && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy'), mode);
      const immediate=await sample(`${mode}-ready`);
      await page.evaluate(async()=>{await document.fonts.ready; await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));});
      return {immediate,stable:await sample(mode)};
    };
    await page.goto(`${base}/draw/`); await page.waitForFunction(()=>document.documentElement.dataset.creationModesReady==='true');
    const drawImmediate=await sample('draw-ready'); await page.evaluate(async()=>{await document.fonts.ready; await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));});
    const draw1=await sample('draw');
    await page.evaluate(selectors=>{window.__shellRefs=Object.fromEntries(Object.entries(selectors).map(([k,s])=>[k,document.querySelector(s)]));},selectors);
    await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}-draw.png`});
    const audioPair=await setMode('audio'), audio=audioPair.stable; await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}-audio.png`});
    const cameraPair=await setMode('camera'), camera=cameraPair.stable; await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}-camera.png`});
    const returnPair=await setMode('draw'), draw2=returnPair.stable; await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}-draw-return.png`});
    const identity=await page.evaluate(selectors=>Object.fromEntries(Object.entries(selectors).map(([k,s])=>[k,window.__shellRefs[k]===document.querySelector(s)])),selectors);
    const identityStable=Object.values(identity).every(Boolean);
    // Measure mode-to-Draw deltas for all shared rectangles and their visual styles.
    const diff=(a,b)=>a&&b?Object.fromEntries(['x','y','width','height'].map(k=>[k,round(b[k]-a[k])])):null;
    const deltas={};
    for(const mode of ['audio','camera','draw-return']) {
      deltas[mode]={}; for(const key of Object.keys(selectors)) deltas[mode][key]=diff(draw1.elements[key]?.rect,({audio,camera,'draw-return':draw2})[mode].elements[key]?.rect);
      deltas[mode].cameraStage=mode==='camera'?diff(draw1.boardContent,camera.camera.stage):null;
      deltas[mode].cameraBottom=mode==='camera'?diff(draw1.elements.dock?.rect,camera.camera.bottom):null;
    }
    const sharedStyles={}; for(const mode of ['audio','camera']) sharedStyles[mode]=Object.fromEntries(Object.keys(selectors).map(key=>[key,{draw:draw1.elements[key]?.style,mode:({audio,camera})[mode].elements[key]?.style}]));
    const mediaRequests=await page.evaluate(()=>window.__shellQA.mediaRequests);
    const parity={identityStable,geometry:{},style:{}};
    for(const mode of ['audio','camera']) {
      const measured={audio,camera}[mode]; parity.geometry[mode]={}; parity.style[mode]={};
      for(const key of Object.keys(selectors)) {
        const d=deltas[mode][key]; parity.geometry[mode][key]=Boolean(d)&&Object.values(d).every(value=>Math.abs(value)<=.5);
        const a=draw1.elements[key]?.style,b=measured.elements[key]?.style;
        parity.style[mode][key]=Boolean(a&&b)&&['backgroundColor','color','borderColor','borderRadius','padding','gap','display','fontFamily','fontSize','fontWeight','lineHeight'].every(prop=>a[prop]===b[prop]);
      }
      if(mode==='camera') {
        parity.geometry.cameraStage=Boolean(deltas.camera.cameraStage)&&Object.values(deltas.camera.cameraStage).every(value=>Math.abs(value)<=.5);
        parity.geometry.cameraBottom=Boolean(deltas.camera.cameraBottom)&&Object.values(deltas.camera.cameraBottom).every(value=>Math.abs(value)<=.5);
      }
      const tA=draw1.centralTransport,tB=measured.centralTransport;
      parity.geometry.transport=Boolean(tA&&tB)&&Object.values(diff(tA.rect,tB.rect)).every(value=>Math.abs(value)<=.5);
      parity.style.transport=Boolean(tA&&tB)&&['backgroundColor','color','borderColor','borderRadius','padding','display','fontFamily','fontSize','fontWeight','lineHeight'].every(prop=>tA.style[prop]===tB.style[prop]);
      parity.style.colorSources=['body','header','nav','board','dock'].every(key=>JSON.stringify(draw1.colorSources[key])===JSON.stringify(measured.colorSources[key]));
      if(!Object.values(parity.geometry[mode]).every(Boolean)||!Object.values(parity.style[mode]).every(Boolean)||!parity.geometry.transport||!parity.style.transport||!parity.style.colorSources)
        report.parityViolations.push({viewport,mode,geometry:parity.geometry[mode],style:parity.style[mode],transportGeometry:parity.geometry.transport,transportStyle:parity.style.transport,colorSources:parity.style.colorSources});
    }
    if(!identityStable) report.parityViolations.push({viewport,mode:'identity',identity});
    const readiness={draw:drawImmediate,audio:audioPair.immediate,camera:cameraPair.immediate,drawReturn:returnPair.immediate};
    const readinessShift=Object.fromEntries(Object.entries({draw:{from:drawImmediate,to:draw1},audio:{from:audioPair.immediate,to:audio},camera:{from:cameraPair.immediate,to:camera},drawReturn:{from:returnPair.immediate,to:draw2}}).map(([mode,pair])=>[mode,Object.fromEntries(['header','main','viewport','board','dock','nav'].map(key=>[key,diff(pair.from.elements[key]?.rect,pair.to.elements[key]?.rect)]))]));
    report.viewports.push({viewport,identityStable,deltas,parity,sharedStyles,readiness,readinessShift,measurements:{draw:draw1,audio,camera,drawReturn:draw2},mediaRequests});
    await context.close();
  }
  await writeFile(`${out}/results.json`,JSON.stringify(report,null,2));
  assert.deepEqual(report.parityViolations, [], 'shared shell geometry and computed styles must match within 0.5px across modes');
  console.log(JSON.stringify({output:`${out}/results.json`,parityViolations:report.parityViolations,viewports:report.viewports.map(v=>({viewport:v.viewport,identityStable:v.identityStable,deltas:v.deltas,parity:v.parity,mediaRequests:v.mediaRequests}))},null,2));
} catch(error) { report.failure={message:error.message,stack:error.stack}; await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)); throw error; }
finally { await browser.close(); }
