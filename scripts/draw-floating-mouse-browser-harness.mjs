/** Isolated native-touch acceptance for compact controls and movable virtual mouse. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_FLOATING_MOUSE_OUTPUT || '/tmp/pixieed-floating-mouse-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }), results = [];
const variants = [{ width: 320, height: 568, dpr: 2 }, { width: 390, height: 844, dpr: 3 }, { width: 844, height: 390, dpr: 2 }, { width: 1280, height: 800, dpr: 1 }];
try {
for (const v of variants) {
 const label = `${v.width}x${v.height}-dpr${v.dpr}`, checks = [], errors = [], httpErrors = [];
 const context = await browser.newContext({ viewport: v, deviceScaleFactor: v.dpr, hasTouch: true });
 await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
 await context.addInitScript(() => { window.__rejections = []; window.addEventListener('unhandledrejection', e => window.__rejections.push(String(e.reason))); window.__events = []; for (const type of ["pointerdown","pointermove","pointerup","click","lostpointercapture"]) document.addEventListener(type,e=>window.__events.push({type,id:e.pointerId,target:e.target.closest("button")?.outerHTML || e.target.id, x:e.clientX,y:e.clientY,detail:e.detail}),true); window.__touchIds = {}; document.addEventListener('pointerdown', e => { if (e.target.closest('[data-virtual-left]')) window.__touchIds.left = e.pointerId; if (e.target.closest('[data-virtual-right]')) window.__touchIds.right = e.pointerId; }, true); });
 const p = await context.newPage(); p.setDefaultTimeout(10000);
 p.on('pageerror', e => errors.push(e.message)); p.on('response', r => { if (new URL(r.url()).origin === new URL(base).origin && r.status() >= 400) httpErrors.push([r.url(), r.status()]); });
 const cdp = await context.newCDPSession(p);
 const touch = async (type, points) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(q => ({ ...q, radiusX: 1, radiusY: 1, force: 1 })) }); await p.waitForTimeout(25); };
 const ready = () => p.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main').inert);
 const rgba = () => p.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
 const count = async () => (await rgba()).filter((a, i) => i % 4 === 3 && a).length;
 const history = async () => [await p.locator('#draw-undo').isDisabled(), await p.locator('#draw-redo').isDisabled()];
 const box = selector => p.locator(selector).boundingBox();
 const center = async (selector, id) => { const r = await box(selector); assert.ok(r, `${selector} visible`); return { id, x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
 const point = async (x, y) => { const r = await box('#draw-canvas'); return { x: r.x + (x + .5) * r.width / 16, y: r.y + (y + .5) * r.height / 16 }; };
 const panel = () => box('#draw-virtual-controls');
 const state = () => p.locator('#draw-virtual-controls').getAttribute('data-floating-state');
 const fixed = () => p.locator('.draw-board,#draw-canvas,.draw-controls,#draw-palette,.draw-fixed-left,.draw-fixed-right,#draw-selection-controls,#draw-undo,#draw-redo,.px-tool-header-controls,.app-tabs').evaluateAll(ns => ns.map(n => { const r = n.getBoundingClientRect(); return [n.id || n.classList[0], r.x, r.y, r.width, r.height]; }));
 const key = async k => { await p.locator('#draw-canvas').focus(); await p.keyboard.press(k); };
 const undo = () => key(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
 const redo = () => key(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
 const virtual = async enabled => { await p.locator('#draw-settings-summary').click(); if ((await p.locator('#draw-virtual-toggle').getAttribute('aria-pressed') === 'true') !== enabled) await p.locator('#draw-virtual-toggle').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(30); };
 const choose = async (tool, side = 'left') => { if (!await p.locator('#draw-tool-picker').evaluate(n => n.open)) await p.locator('#draw-tool-summary').click(); await p.locator(`[data-draw-tool="${tool}"]`).click({ button: side }); await p.keyboard.press('Escape'); };
 const cleanPress = async () => { assert.equal(await p.locator('#draw-canvas').getAttribute('data-virtual-pressed'), 'false'); for (const side of ['left', 'right']) assert.equal(await p.locator(`[data-virtual-${side}]`).getAttribute('aria-pressed'), 'false'); };
 const pad = async id => { const r = await box('.draw-board'); return { id, x: r.x + r.width / 3, y: r.y + Math.min(60, r.height / 3) }; };
 const placeCursor = async (x, y) => { const target = await point(x, y), r = await box('.draw-virtual-marker'), board = await box('.draw-board'); const dx = target.x - r.x - r.width / 2, dy = target.y - r.y - r.height / 2; const clamp = (q, min, max) => Math.max(min, Math.min(max, q)); const a = { id: 71, x: clamp(board.x + board.width / 2, board.x + 4 - Math.min(dx, 0), board.x + board.width - 4 - Math.max(dx, 0)), y: clamp(board.y + board.height / 3, board.y + 4 - Math.min(dy, 0), board.y + board.height - 4 - Math.max(dy, 0)) }; assert.equal(await p.evaluate(a => Boolean(document.elementFromPoint(a.x, a.y)?.closest('.draw-board')), a), true, 'cursor positioning starts on the pad'); await touch('touchStart', [a]); await touch('touchMove', [{ ...a, x: a.x + dx, y: a.y + dy }]); await touch('touchEnd', []); };
 const tap = async side => { const b = await center(`[data-virtual-${side}]`, 11); await touch('touchStart', [b]); await touch('touchEnd', []); };
 const relocate = async (dx, dy, cancelled = false, side = 'left') => { const b = await center(`[data-virtual-${side}]`, 11); await touch('touchStart', [b]); await touch('touchMove', [{ ...b, x: b.x + dx, y: b.y + dy }]); assert.equal(await state(), 'moving'); await touch(cancelled ? 'touchCancel' : 'touchEnd', []); await cleanPress(); };
 const group = async (name, run) => { await run(); checks.push(name); console.log(label, name); };
 try {
 await p.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' }); await ready();
 await group('three palette rows, fixed side columns, tools in picker and two contextual slots', async () => {
  assert.equal(await p.locator('#draw-tool-picker [data-draw-tool="pen"],#draw-tool-picker [data-draw-tool="eraser"]').count(), 2);
  assert.equal(await p.locator('.draw-toolbar,.draw-input-action-strip,[data-virtual-drag],[data-virtual-move]').count(), 0);
  const rows = await p.locator('#draw-palette').evaluate(n => getComputedStyle(n).gridTemplateRows); assert.equal(rows, '44px 44px 44px');
  for (const s of ['#draw-tool-summary','#draw-undo','#draw-redo','.animation-controls__workspace-launcher','#draw-selection-controls [data-selection-slot="0"]','#draw-selection-controls [data-selection-slot="1"]']) { const r = await box(s); assert.ok(r.width >= 44 && r.height >= 44, s); }
  const before = await fixed();
  for (let mask = 0; mask < 16; mask++) for (const on of [false, true]) { await p.locator('#draw-settings-summary').click(); for (const [i, name] of ['horizontal','vertical','diagonalDown','diagonalUp'].entries()) { const b = p.locator(`[data-symmetry="${name}"]`); if ((await b.getAttribute('aria-pressed') === 'true') !== Boolean(mask & (1 << i))) await b.click(); } if ((await p.locator('#draw-virtual-toggle').getAttribute('aria-pressed') === 'true') !== on) await p.locator('#draw-virtual-toggle').click(); await p.keyboard.press('Escape'); assert.deepEqual(await fixed(), before, `all 32 mirror/mouse combinations: ${mask}/${on}`); }
  await p.locator('#draw-settings-summary').click(); for (const name of ['horizontal','vertical','diagonalDown','diagonalUp']) if (await p.locator(`[data-symmetry="${name}"]`).getAttribute('aria-pressed') === 'true') await p.locator(`[data-symmetry="${name}"]`).click(); await p.keyboard.press('Escape'); await virtual(false);
  await choose('eraser'); await choose('eraser'); await choose('pen'); assert.equal(await p.locator('#draw-canvas').getAttribute('data-tool'), 'pen');
  await p.locator('.animation-controls__workspace-launcher').click(); assert.equal(await p.locator('.animation-controls__workspace-panel').isVisible(), true); await p.keyboard.press('Escape'); assert.deepEqual(await fixed(), before);
  const pal = await p.locator('#draw-palette').evaluate(n => { n.scrollLeft = n.scrollWidth; return { end: n.scrollLeft, width: n.clientWidth, full: n.scrollWidth }; }); assert.ok(pal.end > 0); await p.locator('#draw-palette').evaluate(n => { n.scrollLeft = 0; });
 });
 await group('placement cancellation preserves committed art and the Undo/Redo branch', async () => {
  for (const xy of [[1,1],[2,1]]) { const q = await point(...xy); await p.mouse.click(q.x,q.y); }
  await undo(); const baseline = await rgba(), branch = await history(); assert.deepEqual(branch, [false,false]); await virtual(true);
  const before = await panel(), b = await center('[data-virtual-left]',11); await touch('touchStart',[b]); assert.ok(await count() >= 2, 'button immediately starts tentative stroke');
  await touch('touchMove',[{...b,x:b.x+8,y:b.y+2}]); assert.equal(await state(),'pressing'); assert.deepEqual(await panel(),before,'button jitter leaves panel still');
  await touch('touchMove',[{...b,x:b.x-30,y:b.y-22}]); assert.equal(await state(),'moving'); assert.deepEqual(await rgba(),baseline); assert.deepEqual(await history(),[true,true], 'history buttons are inert during relocation'); assert.notDeepEqual(await panel(),before);
  const other = await pad(22); await touch('touchStart',[{...b,x:b.x-30,y:b.y-22},other]); await touch('touchMove',[{...b,x:b.x-34,y:b.y-22},{...other,x:other.x+20}]); assert.deepEqual(await rgba(),baseline); assert.equal(await state(),'moving','pad cannot steal panel relocation'); await touch('touchEnd',[]); await cleanPress(); assert.deepEqual(await history(),branch);
  await redo(); assert.equal(await count(),2,'original redo branch survives relocation'); await undo(); await undo(); assert.equal(await count(),0); await cleanPress();
 });
 await group('static fast clicks and both buttons commit exactly one operation', async () => {
  await placeCursor(8,8);
  for (const side of ['left','right']) { await tap(side); assert.equal(await count(),1); await undo(); assert.equal(await count(),0); await cleanPress(); }
 });
 await group('first intentional pad movement locks position, including button-finger drift and either release order', async () => {
  for (const first of ['button','pad']) { await placeCursor(6,6); const before = await panel(), b = await center('[data-virtual-left]',11), a = await pad(22); await touch('touchStart',[b]); await touch('touchStart',[b,a]); await touch('touchMove',[b,{...a,x:a.x+2}]); assert.equal(await state(),'pressing','pad jitter is not drawing intent'); const q={...a,x:a.x+35}; await touch('touchMove',[b,q]); assert.equal(await state(),'fixed'); await touch('touchMove',[{...b,x:b.x+35,y:b.y-20},{...q,x:q.x+10}]); assert.deepEqual(await panel(),before,'drawing keeps panel fixed'); assert.ok(await count()>1); const remaining=first==='button'?[{...q,x:q.x+10}]:[{...b,x:b.x+35,y:b.y-20}]; await touch('touchEnd',first==='button'?[{...b,x:b.x+35,y:b.y-20}]:[{...q,x:q.x+10}]); await cleanPress(); const committed=await rgba(); await touch('touchMove',remaining.map(q=>({...q,x:q.x+10}))); assert.deepEqual(await rgba(),committed,'remaining finger cannot resume stroke'); await touch('touchEnd',[]); await undo(); assert.equal(await count(),0,'one Undo for whole drag'); }
 });
 await group('edge-clamped cursor still locks panel on intended pad motion', async () => {
  await placeCursor(15,8); const a=await pad(22); await touch('touchStart',[a]); await touch('touchMove',[{...a,x:a.x+70}]); await touch('touchEnd',[]);
  const before=await panel(), mark=await box('.draw-virtual-marker'), b=await center('[data-virtual-left]',11), q=await pad(22); await touch('touchStart',[b]); await touch('touchStart',[b,q]); await touch('touchMove',[b,{...q,x:q.x+20}]); assert.equal(await state(),'fixed'); assert.equal((await box('.draw-virtual-marker')).x,mark.x); await touch('touchMove',[{...b,x:b.x-40,y:b.y-25},{...q,x:q.x+20}]); assert.deepEqual(await panel(),before); await touch('touchEnd',[]); await undo(); assert.equal(await count(),0);
 });
 await group('cancel, blur, capture loss and mode OFF release ownership; fresh input recovers', async () => {
  for (const cancellation of ['touchCancel','blur','off']) { await placeCursor(6,6); const b=await center('[data-virtual-left]',11), a=await pad(22); await touch('touchStart',[b]); await touch('touchStart',[b,a]); await touch('touchMove',[b,{...a,x:a.x+25}]); if(cancellation==='touchCancel') await touch('touchCancel',[]); else if(cancellation==='blur') await p.evaluate(()=>window.dispatchEvent(new Event('blur'))); else { await p.locator('#draw-virtual-toggle').evaluate(n=>n.click()); } if(cancellation!=='touchCancel') await touch('touchEnd',[]); await cleanPress(); if(cancellation==='off') { assert.equal(await p.locator('#draw-virtual-controls').isVisible(),false); if(await count()) await undo(); await virtual(true); } assert.equal(await count(),0,cancellation+' restores tentative stroke'); await tap('left'); assert.equal(await count(),1,cancellation+' re-entry works'); await undo(); }
 });
 await group('browser-generated mouse-button capture loss rolls back and releases both inputs', async () => {
  for (const side of ['left','right']) { await placeCursor(6,6); const b=await center(`[data-virtual-${side}]`,11), a=await pad(22); await p.mouse.move(b.x,b.y); await p.mouse.down(); await touch('touchStart',[a]); await touch('touchMove',[{...a,x:a.x+25}]); assert.equal(await state(),'fixed'); const id=await p.evaluate(side=>window.__touchIds[side],side), before=await p.evaluate(()=>window.__events.length); await p.locator(`[data-virtual-${side}]`).evaluate((n,id)=>n.releasePointerCapture(id),id); await p.mouse.move(b.x+2,b.y); assert.ok(await p.evaluate(({id,before})=>window.__events.slice(before).some(e=>e.type==='lostpointercapture'&&e.id===id),{id,before}),'browser generated capture loss'); await cleanPress(); assert.equal(await count(),0); await p.mouse.up(); await touch('touchEnd',[]); await tap(side); assert.equal(await count(),1); await undo(); }
 });
 await group('fill and eraser tentative relocation/cancel retain atomic history', async () => {
  await choose('fill'); const initial=await rgba(), before=await history(); await relocate(-20,-15); assert.deepEqual(await rgba(),initial); assert.deepEqual(await history(),before); await tap('left'); assert.equal(await count(),256); const filled=await rgba(); await choose('eraser'); await relocate(20,15); assert.deepEqual(await rgba(),filled); await tap('left'); assert.equal(await count(),255); await undo(); assert.deepEqual(await rgba(),filled); await undo(); assert.equal(await count(),0); await choose('pen');
 });
 await group('movement cancel restores prior placement; reload, orientation and reset keep panel reachable', async () => {
  const before=await panel(), art=await rgba(); await relocate(30,-20,true); assert.deepEqual(await panel(),before); assert.deepEqual(await rgba(),art); await relocate(-20,-20); const saved=await panel(); await p.reload(); await ready(); await virtual(true); const restored=await panel(); assert.ok(Math.abs(restored.x-saved.x)<1 && Math.abs(restored.y-saved.y)<1,'placement survives reload');
  await p.setViewportSize({width:v.height,height:v.width}); await p.waitForTimeout(100); const rotated=await panel(), nav=await box('.app-tabs'); assert.ok(rotated.x>=8 && rotated.x+rotated.width<=v.height-8+.1); assert.ok(rotated.y>=64 && rotated.y+rotated.height<=nav.y-8+.1); await p.setViewportSize(v); await p.waitForTimeout(100);
  await p.locator('#draw-settings-summary').click(); await p.locator('#draw-mouse-position-reset').click(); await p.keyboard.press('Escape'); assert.equal(await p.evaluate(()=>localStorage.getItem('pixieed.draw.floating-mouse.position.v1')),null);
  const left=await box('[data-virtual-left]'),right=await box('[data-virtual-right]'); assert.equal(left.width,right.width); assert.ok(left.width>=44 && left.height>=44);
  await p.locator('#project-open').click(); assert.equal(await p.locator('#draw-virtual-controls').isVisible(),false,'floating input hidden while workspace is inert'); await p.locator('#project-close').click(); assert.equal(await p.locator('#draw-virtual-controls').isVisible(),true,'input returns on workspace close');
 });
 await group('screenshots show three-row controls, equal mouse buttons and unchanged OFF geometry',async()=>{ await p.screenshot({path:`${output}/compact-mouse-${label}.png`}); const before=await fixed(); await virtual(false); assert.deepEqual(await fixed(),before); await p.screenshot({path:`${output}/compact-off-${label}.png`}); await virtual(true); });
 assert.deepEqual(errors,[]); assert.deepEqual(httpErrors,[]); assert.deepEqual(await p.evaluate(()=>window.__rejections),[]);
 results.push({label,status:'passed',checks,errors,httpErrors,geometry:await fixed()});
 } catch(error) { await p.screenshot({path:`${output}/failure-${label}.png`}).catch(()=>{}); results.push({label,status:'failed',checks,error:error.stack,errors,httpErrors}); throw error; }
 finally { await context.close(); await writeFile(`${output}/report.json`,JSON.stringify(results,null,2)); }
}
} finally { await browser.close(); }
console.log(JSON.stringify({passed:results.length,groups:results.reduce((n,r)=>n+r.checks.length,0),output}));
