/** Draw panel dismissal, input isolation and the shared placement toggle. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_DRAW_PANELS_OUTPUT || '/tmp/pixieed-draw-panel-dismissals-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch(), results = [];
try {
  for (const [width, height] of [[320,568],[390,844],[1280,800],[844,390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [], checks = [];
    page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/draw/`);
    await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool && !document.querySelector('#main').inert);
    const canvas = page.locator('#draw-canvas');
    const pixels = () => canvas.evaluate(n => [...n.getContext('2d').getImageData(0,0,n.width,n.height).data]);
    const settings = page.locator('#draw-settings-picker');
    const openSettings = async () => { if (!await settings.evaluate(n => n.open)) await page.locator('#draw-settings-summary').click(); };
    const command = async id => {
      await openSettings(); await page.locator('#draw-shortcuts-open').click();
      await page.locator(`[data-command-run="${id}"]`).click(); await page.waitForTimeout(30);
    };
    const reachable = async selector => {
      const r = await page.locator(selector).boundingBox(); assert.ok(r, `${selector} exists`);
      assert.ok(r.width >= 44 && r.height >= 44, `${selector} has a 44px target`);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x+r.width <= width+.5 && r.y+r.height <= height+.5, `${selector} in viewport: ${JSON.stringify(r)}`);
      const hit = await page.locator(selector).evaluate(n => { const r=n.getBoundingClientRect(); const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {ok:n===target || n.contains(target), target:target?.outerHTML.slice(0,300), rect:{x:r.x,y:r.y}}; });
      if(!hit.ok)await page.screenshot({path:`${output}/${width}x${height}-blocked.png`});
      assert.ok(hit.ok, `${selector} receives clicks: ${JSON.stringify(hit)}`);
    };
    const floating = [
      ['#draw-settings-picker','#draw-settings-summary','.draw-settings-panel'],
      ['#draw-tool-picker','#draw-tool-summary','.draw-tool-menu'],
      ['#draw-output','#draw-output > summary','.creation-output__panel'],
      ['.draw-import','#draw-import-summary','.draw-canvas-panel'],
    ];
    for (const virtual of [false,true]) {
      await openSettings();
      if (await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed') !== String(virtual)) await page.locator('#draw-virtual-toggle').click();
      await page.locator('.draw-settings-panel .draw-panel-close').click();
      for (const side of ['right','left']) {
        await openSettings();
        if (await page.locator('#draw-controls-side-toggle').getAttribute('data-side') !== side) await page.locator('#draw-controls-side-toggle').click();
        const placement = page.locator('#draw-controls-side-toggle');
        assert.equal(await placement.textContent(), ''); assert.equal(await page.locator('button[data-draw-controls-side]').count(), 0);
        assert.equal(await placement.getAttribute('aria-pressed'), String(side === 'left'));
        assert.match(await placement.getAttribute('aria-label'), new RegExp(`操作欄は${side==='left'?'左':'右'}。${side==='left'?'右':'左'}に移動`));
        await page.locator('.draw-settings-panel .draw-panel-close').click();
        for (const [details, summary, panel] of floating) {
          const before = await pixels(), close = `${panel} .draw-panel-close`;
          await page.locator(summary).click(); assert.equal(await page.locator(details).evaluate(n=>n.open), true);
          assert.equal(await page.locator(close).count(),1);
          await page.locator(panel).evaluate(n => n.scrollTop=n.scrollHeight);
          await reachable(close); await page.locator(close).tap();
          assert.equal(await page.locator(details).evaluate(n=>n.open),false);
          assert.equal(await page.locator(summary).evaluate(n=>n===document.activeElement),true);
          assert.deepEqual(await pixels(),before); assert.equal(await canvas.getAttribute('data-virtual-pressed'),'false');
          await page.locator(summary).click(); await page.keyboard.press('Escape');
          assert.equal(await page.locator(details).evaluate(n=>n.open),false);
          assert.equal(await page.locator(summary).evaluate(n=>n===document.activeElement),true);
          await page.locator(summary).click();
          await page.locator('#draw-virtual-toggle').evaluate(n=>n.click());
          assert.equal(await canvas.getAttribute('data-virtual-pressed'),'false');
          await page.locator(close).click(); assert.deepEqual(await pixels(),before);
          await page.locator('#draw-virtual-toggle').evaluate(n=>n.click());
          await page.locator(summary).click();
          const outside=await page.locator('.draw-board').evaluate(n=>{const r=n.getBoundingClientRect();for(const fx of [.03,.97,.5])for(const fy of [.03,.97,.5]){const x=r.x+r.width*fx,y=r.y+r.height*fy;if(document.elementFromPoint(x,y)?.closest('.draw-board')===n)return{x,y};}return null;});
          if(outside)await page.mouse.click(outside.x,outside.y);else await page.locator(close).click();
          assert.equal(await page.locator(details).evaluate(n=>n.open),false,'viewport dismisses before virtual capture');
          assert.deepEqual(await pixels(),before,`dismissal does not draw: ${width} / ${virtual} / ${side} / ${details} at ${JSON.stringify(outside)}`);
          checks.push(`${virtual?'ON':'OFF'}/${side}/${details}: scrolled native touch close, reopen, Escape/focus, mode switch, outside dismissal, no pixel change`);
        }
        await command('open.colorEditor');
        await page.locator('#draw-color-editor .dce-content').evaluate(n=>n.scrollTop=n.scrollHeight);
        await reachable('#dce-done'); await page.locator('#dce-done').click();
        assert.equal(await page.locator('#draw-color-editor').isVisible(),false);
        await command('open.colorEditor'); await page.keyboard.press('Escape'); assert.equal(await page.locator('#draw-color-editor').isVisible(),false);
        await openSettings(); await page.locator('#draw-shortcuts-open').click();
        await page.locator('.draw-shortcuts-list').evaluate(n=>n.scrollTop=n.scrollHeight);
        await reachable('.draw-shortcuts-dialog__header button'); await page.locator('.draw-shortcuts-dialog__header button').click();
        assert.equal(await page.locator('.draw-shortcuts-dialog').count(),0);
        assert.equal(await canvas.evaluate(n=>n===document.activeElement),true);
        const workspace = page.locator('.animation-controls__workspace-panel');
        await page.locator('[data-action="toggle-frames"]').click();
        await page.locator('.animation-controls__frames').evaluate(n=>n.scrollTop=n.scrollHeight);
        await reachable('[data-action="close-animation"]');
        for (const kind of ['frame','layer']) {
          const target=page.locator(kind==='frame'?'[data-action="select-frame"]':'[data-action="select-layer"]').first();
          await target.click({button:'right'});
          await page.locator('.animation-controls__frame-menu').evaluate(n=>n.scrollTop=n.scrollHeight);
          await reachable('[data-action="close-frame-menu"]'); await page.locator('[data-action="close-frame-menu"]').click();
          assert.equal(await page.locator('.animation-controls__frame-menu').isVisible(),false);
          assert.equal(await target.evaluate(n=>n===document.activeElement),true);
          await target.click({button:'right'}); await page.keyboard.press('Escape');
          assert.equal(await workspace.isVisible(),true,'Escape closes context menu before parent');
          assert.equal(await page.locator('.animation-controls__frame-menu').isVisible(),false);
        }
        await page.locator('[data-action="select-frame"]').first().click({button:'right'});
        await page.locator('[data-frame-menu-action="duration"]').click();
        await reachable('[data-action="close-duration"]'); await page.locator('[data-action="close-duration"]').click();
        assert.equal(await page.locator('.animation-controls__timing').isVisible(),false);
        await page.locator('[data-action="close-animation"]').click();
        await page.locator('[data-action="toggle-frames"]').click(); await page.keyboard.press('Escape'); assert.equal(await workspace.isVisible(),false);
        await page.locator('#project-open').click();
        await reachable('#project-close'); await page.locator('#project-tab-current').click();
        const submenus=['.project-more','.project-imports','.project-trash'];
        for(const selector of submenus){
          if(selector!=='.project-more')await page.locator('#project-tab-library').click();
          const d=page.locator(selector);if(selector==='.project-trash')await d.evaluate(n=>n.hidden=false);if(!await d.evaluate(n=>n.open))await d.locator(':scope > summary').click();assert.equal(await d.evaluate(n=>n.open),true);
          await page.locator('#pxd-panel').evaluate(n=>n.scrollTop=n.scrollHeight);
          await reachable(`${selector} .draw-panel-close`); await d.locator('.draw-panel-close').click();assert.equal(await d.evaluate(n=>n.open),false);
          await d.locator(':scope > summary').click(); await page.keyboard.press('Escape');assert.equal(await d.evaluate(n=>n.open),false);assert.equal(await page.locator('#pxd-panel').evaluate(n=>n.open),true);
        }
        await page.locator('#project-tab-current').click(); await page.locator('.project-more > summary').click();
        await reachable('#project-close'); await page.locator('#project-close').click();
        assert.equal(await page.locator('#pxd-panel').evaluate(n=>n.open),false);
        checks.push(`${virtual?'ON':'OFF'}/${side}: color, shortcut, workspace, frame/layer menus, duration, project + 3 nested disclosures`);
      }
    }
    // Native simultaneous contacts: touching UI cancels the held click/pad and
    // releasing/moving old contacts cannot draw or leave a pressed button behind.
    await openSettings(); if(await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed')!=='true')await page.locator('#draw-virtual-toggle').click(); await page.locator('.draw-settings-panel .draw-panel-close').click();
    const cdp=await context.newCDPSession(page), point=async(selector,id)=>{const r=await page.locator(selector).boundingBox();return{id,x:r.x+r.width/2,y:r.y+r.height/2};};
    const left=await point('[data-virtual-left]',1),pad=await point('.draw-board',2),ui=await point('#draw-settings-summary',3);
    const send=async(type,touchPoints)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});await page.waitForTimeout(25);};
    await send('touchStart',[left]);await send('touchStart',[left,pad]);await send('touchMove',[left,{...pad,x:pad.x+12}]);
    assert.equal(await canvas.getAttribute('data-virtual-pressed'),'true');
    await send('touchStart',[left,{...pad,x:pad.x+12},ui]); assert.equal(await canvas.getAttribute('data-virtual-pressed'),'false');
    const cancelled=await pixels(); await send('touchMove',[left,{...pad,x:pad.x+28},ui]);await send('touchEnd',[left,{...pad,x:pad.x+28},ui]);assert.deepEqual(await pixels(),cancelled);
    if(await settings.evaluate(n=>n.open))await page.locator('.draw-settings-panel .draw-panel-close').click();
    await send('touchStart',[left]);await send('touchEnd',[left]);assert.equal(await canvas.getAttribute('data-virtual-pressed'),'false');
    checks.push('native multi-touch UI contact cancels held stroke; stale moves/up stay inert; next contact works');
    const canMoveLeft=await page.locator('.draw-virtual-marker').evaluate(n=>{const r=n.getBoundingClientRect(),c=document.querySelector('#draw-canvas'),b=c.getBoundingClientRect();return (r.x+r.width/2-b.x)/b.width*c.width>=1;});await canvas.focus();await page.keyboard.press(canMoveLeft?'ArrowLeft':'ArrowRight');
    const beforeOff=await pixels();await send('touchStart',[left]);assert.equal(await canvas.getAttribute('data-virtual-pressed'),'true');const accepted=await pixels();assert.notDeepEqual(accepted,beforeOff,'mode OFF test adds a distinct pixel before release');
    // The mobile settings sheet covers the click panel. Switch through the same
    // button's DOM activation while retaining a real captured native touch.
    await page.locator('#draw-virtual-toggle').evaluate(n=>n.click());assert.equal(await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed'),'false');assert.equal(await canvas.getAttribute('data-virtual-pressed'),'false');assert.deepEqual(await pixels(),accepted,'mode OFF commits already accepted native touch pixels');await send('touchEnd',[left]);
    await page.locator('#draw-undo').click();assert.deepEqual(await pixels(),beforeOff,'mode OFF commit remains one Undo');checks.push('native touch held + shared DOM mode OFF: accepted pixels committed, old contact released, one Undo');

    // Placement persistence and command list use the same state without swapping assignments.
    // Existing native modal close controls are reused, including cancellation.
    for(const virtual of [false,true]) {
      await openSettings();if(await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed')!==String(virtual))await page.locator('#draw-virtual-toggle').click();await page.locator('.draw-settings-panel .draw-panel-close').click();
      const conversion=async()=>{await page.locator('#draw-canvas').focus();await page.evaluate(async()=>{const {confirmPxdConversion}=await import('/js/creation/pxd-ui.mjs?rev=20261006-panel-close-1');window.__conversionResult='pending';void confirmPxdConversion({image:{width:2,height:2,rgba:new Uint8Array(16)},document:{schemaVersion:1,width:2,height:2,palette:['#112233'],pixels:[-1,0,0,-1]}}).then(value=>window.__conversionResult=value);});await page.waitForSelector('.pxd-conversion[open]');};
      await conversion();await reachable('#pxd-conversion-cancel');await page.locator('#pxd-conversion-cancel').click();assert.equal(await page.evaluate(()=>window.__conversionResult),false);
      await conversion();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__conversionResult),false);
      assert.equal(await canvas.evaluate(n=>n===document.activeElement),true);
      await page.locator('#project-open').click();await page.locator('#project-tab-current').click();if(!await page.locator('.project-more').evaluate(n=>n.open))await page.locator('.project-more > summary').click();await page.locator('#pxd-save').click();await page.waitForFunction(()=>!document.querySelector('#project-close').disabled);await page.locator('#project-tab-library').click();
      if(!await page.locator('.project-imports').evaluate(n=>n.open))await page.locator('.project-imports > summary').click();
      const remove=page.locator('.project-card__delete').first();await remove.click();await reachable('#project-delete-dismiss');await page.locator('#project-delete-dismiss').click();assert.equal(await page.locator('.project-delete-dialog').count(),0);
      await remove.click();await page.keyboard.press('Escape');assert.equal(await page.locator('.project-delete-dialog').count(),0);assert.equal(await page.locator('.project-imports').evaluate(n=>n.open),true,'child modal owns Escape before underlying disclosures');
      const card=page.locator('.project-card').first();await card.click({button:'right'});await reachable('#project-card-actions-dismiss');await page.locator('#project-card-actions-dismiss').click();assert.equal(await page.locator('.project-card-actions').count(),0);
      await card.click({button:'right'});await page.keyboard.press('Escape');assert.equal(await page.locator('.project-card-actions').count(),0);
      await page.locator('#project-close').click();checks.push(`${virtual?'ON':'OFF'}: existing conversion cancel (fixture), project deletion cancel and card actions close/Escape; no deletion`);
    }
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:draw:input-settings:v1')));
    await command('controls.right'); await command('controls.left');
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:draw:input-settings:v1')));
    assert.equal(after.controlsSide,'left');assert.deepEqual(after.bindings,saved.bindings);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#main').inert);
    if(await page.locator('#pxd-panel').evaluate(n=>n.open))await page.locator('#project-close').click();
    assert.equal(await page.locator('#draw-controls-side-toggle').getAttribute('data-side'),'left');
    await openSettings(); await page.screenshot({path:`${output}/${width}x${height}-settings.png`});
    assert.deepEqual(errors,[]);results.push({width,height,checks,errors});console.log(JSON.stringify({width,height,checks:checks.length}));await context.close();
  }
} finally {await browser.close();await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));}
