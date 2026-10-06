import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { saveCurrentProject } from './lib/project-panel-browser.mjs';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output = '/tmp/pixieed-draw-buttons-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({headless:true}), results = [];
await mkdir(output,{recursive:true});
try {
  for (const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:568},{width:844,height:390}].filter(v=>!process.env.PIXIEED_BUTTON_VARIANT || process.env.PIXIEED_BUTTON_VARIANT.includes(`${v.width}x${v.height}`))) {
    const context=await browser.newContext({viewport,hasTouch:true}), page=await context.newPage(), errors=[], checks=[];
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
    page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(10000);
    const ready=()=>page.waitForFunction(()=>document.querySelector('#draw-canvas')?.dataset.tool && !document.querySelector('#main').inert);
    const pixels=()=>page.locator('#draw-canvas').evaluate(c=>[...c.getContext('2d').getImageData(0,0,c.width,c.height).data]);
    const painted=async()=>{const p=await pixels();return Array.from({length:p.length/4},(_,i)=>p.slice(i*4,i*4+4)).map((rgba,i)=>({rgba,x:i%16,y:Math.floor(i/16)})).filter(p=>p.rgba[3]);};
    const pixelPoint=async(x,y)=>{const r=await page.locator('#draw-canvas').boundingBox();return{x:r.x+(x+.5)*r.width/16,y:r.y+(y+.5)*r.height/16};};
    const stroke=async(side,points)=>{const a=await pixelPoint(...points[0]);await page.mouse.move(a.x,a.y);await page.mouse.down({button:side});for(const point of points.slice(1)){const p=await pixelPoint(...point);await page.mouse.move(p.x,p.y);}await page.mouse.up({button:side});};
    const undo=async()=>{await page.locator('#draw-undo').click();};
    const targetClick=async(side,target)=>target.click({button:side==='right'?'right':'left'});
    const assignByContext=async target=>target.evaluate(node=>node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,buttons:2})));
    const assign=async(side,tool,color)=>{
      const priorLeftTool=side==='right'?(await bindings()).bindings.left.tool:null;
      const toolTarget=async name=>{
        if(!(await page.locator('#draw-tool-picker').evaluate(n=>n.open))) await page.locator('#draw-tool-summary').click();
        return page.locator(`[data-draw-tool="${name}"]`);
      };
      if(side==='left'){
        if(tool==='pen'||tool==='eraser'){await page.locator('#draw-canvas').focus();await page.keyboard.press(tool==='pen'?'b':'e');}
        else {const target=await toolTarget(tool);await targetClick('left',target);}
      } else {
        if(tool==='pen'||tool==='eraser'){
          await page.locator('#draw-canvas').focus();await page.keyboard.press(tool==='pen'?'b':'e');
          const target=await toolTarget(tool);await target.focus();await target.press('Shift+Enter');
          const restoreKey={pen:'b',eraser:'e',fill:'g',line:'l',rectangle:'r','rectangle-fill':'Shift+r',ellipse:'o','ellipse-fill':'Shift+o',spray:'a',select:'v',picker:'i'}[priorLeftTool];
          if(restoreKey){await page.locator('#draw-canvas').focus();await page.keyboard.press(restoreKey);}
        } else {const target=await toolTarget(tool);await targetClick('right',target);}
      }
      const colorTarget=page.locator(`.draw-color[data-color-index="${color}"]`);await targetClick(side,colorTarget);
      await page.keyboard.press('Escape');
    };
    const virtual=async on=>{await page.locator('#draw-settings-summary').click();if((await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed')==='true')!==on)await page.locator('#draw-virtual-toggle').click();await page.keyboard.press('Escape');};
    const placement=async side=>{await page.locator('#draw-settings-summary').click();if (await page.locator('#draw-controls-side-toggle').getAttribute('data-side') !== side) await page.locator('#draw-controls-side-toggle').click();await page.keyboard.press('Escape');await page.waitForTimeout(60);};
    const bindings=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:draw:input-settings:v1')));
    const session=await context.newCDPSession(page);
    const touch=async(type,touchPoints)=>{await session.send('Input.dispatchTouchEvent',{type,touchPoints});await page.waitForTimeout(25);};
    const rectCenter=async(selector,id)=>{const r=await page.locator(selector).boundingBox();return{id,x:r.x+r.width/2,y:r.y+r.height/2};};
    try {
      await page.goto(`${base}/draw/`,{waitUntil:'domcontentloaded'});await ready();
      await page.evaluate(()=>document.addEventListener('pointerdown',e=>{if(e.target.closest('.draw-board'))window.__testPointer=e.pointerId;},{capture:true}));
      await assign('right','pen',4);await assign('left','line',2);
      assert.equal((await bindings()).bindings.left.tool,'line');assert.equal((await bindings()).bindings.right.tool,'pen');
      await virtual(true);
      const l=await page.locator('[data-virtual-left]').boundingBox(),r=await page.locator('[data-virtual-right]').boundingBox();assert.ok(Math.abs(l.width-r.width)<=1/32,'equal grid tracks allow browser subpixel rounding'); await virtual(false);
      assert.equal(await page.locator('[data-button-tool-icon="left"] svg').count(),1);
      assert.equal(await page.locator('[data-button-swatch="right"]').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(76, 130, 195)');
      const path=[[2,3],[2,8],[10,8]];
      await stroke('left',path);const nativeLeft=await pixels();assert.equal((await painted()).some(p=>p.x===2&&p.y===8),false,'line preview replaces the corner rather than painting a pen path');assert.ok((await painted()).every(p=>p.rgba.join(',')==='231,84,69,255'));await undo();
      await page.locator('#draw-redo').click();assert.deepEqual(await pixels(),nativeLeft);await undo();
      await stroke('right',path);const nativeRight=await pixels();assert.equal((await painted()).some(p=>p.x===2&&p.y===8),true);assert.ok((await painted()).every(p=>p.rgba.join(',')==='76,130,195,255'));await undo();
      checks.push('independent red line / blue pen native buttons, shape preview, right drag, atomic Undo/Redo');
      // First logical button wins through a native mouse chord, regardless of editor target.
      const a=await pixelPoint(2,3),b=await pixelPoint(8,6),d=await pixelPoint(11,9);
      for(const first of ['left','right']) {
        const second=first==='left'?'right':'left';await page.mouse.move(a.x,a.y);await page.mouse.down({button:first});await page.mouse.down({button:second});await page.mouse.move(b.x,b.y);await page.mouse.up({button:first});
        const firstEnded=await pixels();await page.mouse.move(d.x,d.y);await page.mouse.up({button:second});assert.deepEqual(await pixels(),firstEnded);assert.ok((await painted()).every(p=>p.rgba.join(',')===(first==='left'?'231,84,69,255':'76,130,195,255')));await undo();
      }
      // Editing assignments during a held right stroke affects only the next stroke.
      await page.mouse.move(a.x,a.y);await page.mouse.down({button:'right'});
      await assignByContext(page.locator('.draw-color[data-color-index="3"]'));
      await page.locator('#draw-tool-picker').evaluate(n=>n.open=true);await assignByContext(page.locator('[data-draw-tool="line"]'));
      await page.mouse.move(b.x,b.y);await page.mouse.up({button:'right'});assert.ok((await painted()).every(p=>p.rgba.join(',')==='76,130,195,255'));await undo();await assign('right','pen',4);await assign('left','line',2);
      for(const cancel of ['blur','pointercancel','escape']) {
        await page.mouse.move(a.x,a.y);await page.mouse.down({button:'right'});await page.mouse.move(b.x,b.y);
        if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
        else if(cancel==='escape')await page.keyboard.press('Escape');
        else await page.locator('#draw-canvas').evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.__testPointer,pointerType:'mouse',bubbles:true})));
        await page.mouse.up({button:'right'});assert.equal((await painted()).length,0);
      }
      // Enabling virtual mode during a native right stroke must finish and release it.
      await page.mouse.move(a.x,a.y);await page.mouse.down({button:'right'});await page.mouse.move(b.x,b.y);
      await page.locator('#draw-virtual-toggle').evaluate(n=>n.click());const modeEnded=await pixels();
      await page.mouse.move(d.x,d.y);await page.mouse.up({button:'right'});assert.deepEqual(await pixels(),modeEnded);assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-pressed'),'false');await undo();await virtual(false);
      checks.push('native chord ownership, frozen assignment during edit, right blur/pointercancel rollback');
      // Exact native/virtual parity starts each virtual gesture at the same pixel.
      await virtual(true);
      const moveHotspot=async(x,y)=>{
        const current=await page.locator('.draw-virtual-marker').boundingBox(),p=await pixelPoint(x,y),board=await page.locator('.draw-board').boundingBox();
        const dx=p.x-(current.x+current.width/2),dy=p.y-(current.y+current.height/2),clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
        const left=board.x+5,right=board.x+board.width-5,top=board.y+5,bottom=board.y+board.height-5;
        const q={id:22,x:clamp((left+right)/2,left-Math.min(0,dx),right-Math.max(0,dx)),y:clamp((top+bottom)/2,top-Math.min(0,dy),bottom-Math.max(0,dy))};
        await touch('touchStart',[q]);await touch('touchMove',[{...q,x:q.x+dx,y:q.y+dy}]);await touch('touchEnd',[q]);
      };
      const virtualStroke=async side=>{
        await moveHotspot(...path[0]);const button=await rectCenter(`[data-virtual-${side}]`,11),q=await rectCenter('.draw-board',22);
        await touch('touchStart',[button]);await touch('touchStart',[button,q]);let prev=await pixelPoint(...path[0]),pad={...q};
        for(const xy of path.slice(1)){const next=await pixelPoint(...xy);pad={...pad,x:pad.x+next.x-prev.x,y:pad.y+next.y-prev.y};await touch('touchMove',[button,pad]);prev=next;}
        await touch('touchEnd',[button]);assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-pressed'),'false');await touch('touchEnd',[q]);
      };
      // Use a near top-left anchor so the relative path fits the viewport even on 320px.
      await virtualStroke('left');assert.deepEqual(await pixels(),nativeLeft);await undo();
      await virtualStroke('right');assert.deepEqual(await pixels(),nativeRight);await undo();
      // With virtual mode enabled, physical mouse buttons draw at the relative hotspot too.
      for(const side of ['left','right']) {
        await page.mouse.move(2,2);const anchor=await rectCenter('.draw-board',99);await page.mouse.move(anchor.x,anchor.y);await moveHotspot(...path[0]);
        await page.mouse.down({button:side});let prev=await pixelPoint(...path[0]),mouse={...anchor};
        for(const xy of path.slice(1)){const next=await pixelPoint(...xy);mouse={...mouse,x:mouse.x+next.x-prev.x,y:mouse.y+next.y-prev.y};await page.mouse.move(mouse.x,mouse.y);prev=next;}
        await page.mouse.up({button:side});assert.deepEqual(await pixels(),side==='left'?nativeLeft:nativeRight);await undo();
      }
      const right=await rectCenter('[data-virtual-right]',11),pad=await rectCenter('.draw-board',22);
      await touch('touchStart',[right]);await touch('touchStart',[right,pad]);const competingLeft=await rectCenter('[data-virtual-left]',33);
      await touch('touchStart',[right,pad,competingLeft]);await touch('touchMove',[right,{...pad,x:pad.x+12},competingLeft]);
      assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'),'false');assert.ok((await painted()).every(p=>p.rgba.join(',')==='76,130,195,255'));
      await touch('touchEnd',[competingLeft]);assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'),'true');
      await touch('touchCancel',[]);assert.equal((await painted()).length,0);assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'),'false');
      checks.push('exact native/virtual and enabled-mode real mouse pixel parity for left line and right pen; virtual right cancellation');
      await virtual(false);
      await page.locator('#draw-canvas').click({button:'right'});assert.equal(await page.locator('#draw-tool-picker').evaluate(n=>n.open),false);assert.equal((await painted()).length,1);await undo();
      await page.locator('#draw-tool-summary').click();assert.equal(await page.locator('[data-draw-tool="select"]').isVisible(),true);await page.keyboard.press('Escape');
      // Suppression is scoped to the viewport, not the document.
      assert.equal(await page.evaluate(()=>!document.querySelector('.site-header').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))),false);
      checks.push('right paints instead of opening a menu; existing tool picker reachable; context menu scope');
      // Representative non-pen tools retain their own commit/preview/Undo meanings on right.
      await assign('right','rectangle-fill',4);await stroke('right',[[2,2],[5,5]]);assert.equal((await painted()).length,16);await undo();
      await assign('right','fill',4);await stroke('right',[[1,1]]);assert.equal((await painted()).length,256);await undo();
      const fillPoint=await pixelPoint(1,1);await page.mouse.move(fillPoint.x,fillPoint.y);await page.mouse.down({button:'right'});await page.keyboard.press('Escape');await page.mouse.up({button:'right'});assert.equal((await painted()).length,0);
      await page.mouse.down({button:'right'});await page.locator('#draw-virtual-toggle').evaluate(n=>n.click());assert.equal((await painted()).length,256);await page.mouse.up({button:'right'});await undo();await virtual(false);
      await stroke('left',path);const eraserBefore=await pixels();await assign('right','eraser',4);await stroke('right',[[2,3]]);assert.equal((await painted()).length,(eraserBefore.filter((_,i)=>i%4===3&&eraserBefore[i]).length)-1);await undo();assert.deepEqual(await pixels(),eraserBefore);await undo();
      await stroke('left',path);assert.ok((await painted()).length,'left line provides pixels for picker');await assign('right','picker',4);await assign('left','line',2);await stroke('right',[[2,3]]);assert.equal((await bindings()).bindings.right.color,2);assert.equal((await bindings()).bindings.right.tool,'pen');assert.equal((await bindings()).bindings.left.tool,'line');await undo();
      await stroke('left',[[2,3],[3,3]]);await assign('right','select',4);await assign('left','line',2);await stroke('right',[[2,3],[3,3]]);assert.equal(await page.locator('.draw-selection').isVisible(),true);const selectedBefore=await pixels();await page.keyboard.down('Alt');await stroke('right',[[2.5,3],[4.5,3]]);await page.keyboard.up('Alt');assert.notDeepEqual(await pixels(),selectedBefore);await page.locator('#draw-canvas').focus();await page.keyboard.press('Enter');await undo();assert.deepEqual(await pixels(),selectedBefore);await page.keyboard.press('Escape');await undo();await assign('right','pen',4);await assign('left','line',2);
      checks.push('right rectangle-fill, fill, eraser, picker, selection move and their atomic Undo semantics');
      const portrait=viewport.width<viewport.height;
      for(const side of ['left','right']) {
        await placement(side);const v=await page.locator('.draw-viewport').boundingBox(),dock=await page.locator('.draw-control-dock').boundingBox();
        assert.equal((await bindings()).bindings.left.tool,'line');assert.equal((await bindings()).bindings.right.tool,'pen');
        if(portrait)assert.ok(v.y<dock.y);else assert.equal(dock.x<v.x,side==='left');
        assert.equal(await page.evaluate(()=>{const v=document.querySelector('.draw-viewport'),d=document.querySelector('.draw-control-dock');return Boolean(d.compareDocumentPosition(v)&Node.DOCUMENT_POSITION_FOLLOWING);}),!portrait&&side==='left');
        const geometry=await page.locator('.draw-board').boundingBox();await virtual(true);assert.deepEqual(await page.locator('.draw-board').boundingBox(),geometry);await virtual(false);assert.deepEqual(await page.locator('.draw-board').boundingBox(),geometry);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:`${output}/${viewport.width}x${viewport.height}-controls-${side}.png`});
      }
      await placement('left');await page.reload({waitUntil:'domcontentloaded'});await ready();
      const restored=await bindings();assert.equal(restored.controlsSide,'left');assert.equal(restored.bindings.left.tool,'line');assert.equal(restored.bindings.right.tool,'pen');assert.equal(restored.bindings.left.color,2);assert.equal(restored.bindings.right.color,4);
      await saveCurrentProject(page);await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#project-open').dataset.state==='saved');const savedUrl=page.url();
      // Make device preferences disagree with the saved project, proving PXD restores its own assignments.
      await page.evaluate(()=>{const key='pixieed:draw:input-settings:v1',state=JSON.parse(localStorage.getItem(key));state.bindings.left={tool:'eraser',color:0,colorHex:'#263238'};state.bindings.right={tool:'line',color:2,colorHex:'#e75445'};state.editedSide='right';state.controlsSide='right';localStorage.setItem(key,JSON.stringify(state));});
      await page.goto(savedUrl,{waitUntil:'domcontentloaded'});await ready();assert.equal((await bindings()).bindings.left.tool,'line');assert.equal((await bindings()).bindings.right.tool,'pen');assert.equal((await bindings()).bindings.right.color,4);assert.equal((await bindings()).controlsSide,'left');assert.equal((await bindings()).editedSide,'left');
      await page.locator('#draw-settings-summary').click();await page.locator('#draw-input-reset').click();await page.keyboard.press('Escape');const reset=await bindings();assert.equal(reset.controlsSide,'right');assert.equal(reset.editedSide,'left');assert.equal(reset.bindings.left.tool,'pen');assert.equal(reset.bindings.right.tool,'pen');
      checks.push('both placements, portrait stability, matching tab order, ON/OFF geometry, local/PXD reload and defaults reset');
      assert.deepEqual(errors,[]);results.push({viewport,checks,errors});console.log(`PASS ${viewport.width}x${viewport.height}: ${checks.length} dual-button cases`);
    }catch(error){await page.screenshot({path:`${output}/${viewport.width}x${viewport.height}-failure.png`}).catch(()=>{});throw error;}finally{await context.close();}
  }
  await writeFile(`${output}/results.json`,JSON.stringify({results},null,2));
}finally{await browser.close();}
