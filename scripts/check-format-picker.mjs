/** CI-only regression; never run to bypass a denied local listen route.
 * Shipped visible controls are tested without injecting the optional picker.
 * That currently unmounted component has separate synthetic fixture coverage.
 * No screenshots, public visits, image uploads or external service requests.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const repository=resolve(fileURLToPath(new URL('../',import.meta.url)));
const root=resolve(process.env.PIXIEED_BROWSER_ROOT||repository);
const output=resolve(process.env.PIXIEED_BROWSER_ARTIFACTS||'/tmp/pixieed-format-picker-browser');
await mkdir(output,{recursive:true});
const report={status:'RUNNING',source:root,cases:[],errors:[],blockedRequests:[],limitations:['Synthetic Chrome, not physical devices/software keyboard/assistive technology','Optional picker fixture is component coverage, not shipped workspace activation']};
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.woff2':'font/woff2'};
const fixture='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px}label{display:block;max-width:480px}</style><main id="main"><label>Fixture formats<select id="output-format-select"><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="ascii">ASCII</option><option value="braille">点字</option><option value="m4a" disabled title="fixture encoder unavailable">M4A</option></select></label></main>';
const server=createServer(async(req,res)=>{try{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/__format-picker-fixture/'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
  if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error('path');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
let browser;
try{
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  const base=`http://127.0.0.1:${server.address().port}`;
  const {chromium}=await import(process.env.PIXIEED_PLAYWRIGHT_MODULE?pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launch({executablePath:process.env.PIXIEED_CHROME_EXECUTABLE||undefined,args:['--no-sandbox']});report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();report.blockedRequests.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  let downloads=0;page.on('download',()=>downloads++);
  const pass=name=>{report.cases.push(name);console.log('PASS '+name);};
  const paint=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const open=async query=>{await page.goto(base+'/output/work/'+query,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{
    const main=document.querySelector('#main'),recovery=main?.querySelector('.sc-local-recovery');
    return document.body.dataset.conversionStartup==='ready'&&main?.dataset.unifiedInput==='true'&&recovery?.getAttribute('aria-busy')==='false'&&['idle','saved'].includes(recovery.dataset.phase);
  });};
  const ready=()=>page.waitForFunction(()=>document.querySelector('[data-text-tools]')?.dataset.txLiveState==='ready');
  const text=()=>page.locator('[data-tx-art-content]').textContent();
  const bytes=async download=>{assert.equal(await download.failure(),null);return readFile(await download.path());};
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const art=async style=>{
    await page.locator('[data-sc-unified-format]').selectOption('text-art');
    await page.locator('[data-sc-unified-art-style]').waitFor({state:'visible'});
    await page.locator('[data-sc-unified-art-style]').selectOption(style);await ready();
    assert.equal(await page.locator('[data-tx-style]').inputValue(),style);
  };
  const checkFit=async label=>{await page.waitForFunction(()=>{
    const v=document.querySelector('[data-tx-art-viewport]'),p=document.querySelector('[data-tx-art-content]');if(!v||!p)return false;
    const a=v.getBoundingClientRect(),b=p.getBoundingClientRect();return b.width>0&&b.height>0&&b.left>=a.left-.1&&b.top>=a.top-.1&&b.right<=a.right+.1&&b.bottom<=a.bottom+.1&&document.documentElement.scrollWidth<=innerWidth+1;
  });pass(label);};
  // Real workspace: actual chooser, visible destinations, real codec/download.
  await open('?mode=convert');
  const png=Buffer.from(await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=320;c.height=240;const x=c.getContext('2d'),image=x.createImageData(320,240);
    for(let y=0;y<240;y++)for(let n=0;n<320;n++){const a=Math.floor(n/10),b=Math.floor(y/10);image.data.set([(a*17+b*11)%256,(a*33+b*29)%256,(a*7+b*53)%256,255],(y*320+n)*4);}x.putImageData(image,0,0);
    return [...new Uint8Array(await(await new Promise(done=>c.toBlob(done,'image/png'))).arrayBuffer())];
  }));
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('[data-sc-unified-add]').click()]);await chooser.setFiles({name:'fixture-10x.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>[...document.querySelector('[data-sc-unified-format]').options].some(option=>option.value==='text-art'&&!option.disabled));
  await art('ascii');assert.equal(await page.locator('.px-format-dialog').count(),0,'shipped workspace needs no test-injected picker');
  assert.match(await page.locator('[data-tx-native-hint]').textContent(),/読み込み 32 × 24px/);assert.equal(await page.locator('[data-sc-unified-format]').inputValue(),'text-art');
  pass('visible output format → text art → ASCII reaches the real engine without component injection');
  await page.locator('[data-tx-attach]').uncheck();await ready();assert.equal(await page.evaluate(async()=>await(await fetch(document.querySelector('[data-tx-txt]').href)).text()),await text());
  for(const [width,height]of [[320,568],[390,844],[844,390],[1366,900]]){await page.setViewportSize({width,height});await page.locator('[data-tx-view="fit"]').click();await checkFit(`current text-art result fits ${width}x${height}`);}
  await page.locator('[data-tx-view="actual"]').click();const before=await text();await page.locator('[data-tx-view="in"]').click();await paint();
  const zoom=await page.locator('[data-tx-art-viewer]').getAttribute('data-view-scale');assert.equal(await text(),before);
  await page.locator('[data-tx-invert]').check();await ready();assert.notEqual(await text(),before);assert.equal(await page.locator('[data-tx-art-viewer]').getAttribute('data-view-scale'),zoom);
  pass('viewer zoom changes no output bytes and live art changes retain manual zoom');
  await page.locator('[data-tx-attach]').check();await ready();const full=await page.evaluate(async()=>await(await fetch(document.querySelector('[data-tx-txt]').href)).text());assert.ok(full.startsWith(await text()+'\n\n'));
  const restored=await page.evaluate(async value=>{const {decodeRestore}=await import('/js/creation/text-codec.mjs');return [...(await decodeRestore(value)).bytes];},full);assert.equal(hash(Buffer.from(restored)),hash(png));
  await page.locator('[data-tx-select]').click();assert.equal(await page.locator('[data-tx-raw-text]').evaluate(node=>node.open),true);assert.equal(await page.locator('[data-tx-text-result]').inputValue(),full);
  pass('attached restore code and select-all preserve complete original bytes and output text');
  await page.locator('[data-tx-native-grid]').uncheck();await ready();assert.match(await page.locator('[data-tx-native-hint]').textContent(),/ファイル寸法 320 × 240px/);
  await page.locator('[data-tx-native-grid]').check();await ready();await page.locator('.sc-unified-code-tools > summary').click();await page.locator('[data-sc-unified-code-open]').click();await page.locator('[data-sc-unified-code-format]').selectOption('pixels');await ready();assert.match(await page.locator('[data-tx-result-note]').textContent(),/^32 × 24px/);
  pass('original-size opt-out and separate pixel-code purpose keep the native-grid contract');
  for(const style of ['ascii','block','braille','emoji','custom']){await art(style);await page.locator('[data-tx-view="fit"]').click();await checkFit(style+' is reachable through the visible art-style control');}
  assert.equal(downloads,0,'previews and format choices never download');const saved=await page.evaluate(async()=>await(await fetch(document.querySelector('[data-tx-txt]').href)).text());
  const [txtDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);assert.equal((await bytes(txtDownload)).toString('utf8'),saved);assert.equal(downloads,1);pass('one explicit Save downloads exactly the current full TXT output');
  await page.locator('[data-sc-unified-format]').selectOption('jpeg');await page.waitForFunction(()=>document.querySelector('[data-format]')?.value==='jpeg'&&document.querySelector('.sc-result-surface')?.dataset.current==='true');
  const [jpegDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);assert.equal((await bytes(jpegDownload)).subarray(0,3).toString('hex'),'ffd8ff');assert.equal(downloads,2);pass('visible output destination returns to JPEG and saves actual JPEG bytes');
  await page.locator('[data-tx-source]').fill('Retained synthetic draft');await page.locator('[data-sc-unified-purpose]').selectOption('text');await page.locator('[data-sc-unified-format]').selectOption('svg');await page.locator('[data-sc-text-size-edit]').click();
  assert.equal(await page.locator('[data-tx-width]').isVisible(),true);assert.equal(await page.locator('[data-sc-unified-format]').inputValue(),'svg');assert.equal(await page.locator('[data-tx-source]').inputValue(),'Retained synthetic draft');pass('text input keeps render formats, editable width and the draft');
  const advancedQuery=await page.evaluate(async()=>{
    const {stageToolOutput}=await import('/js/creation/output-handoff.mjs');const data=new Uint8ClampedArray(16*12*4);data.fill(255);
    const c=document.createElement('canvas');c.width=16;c.height=12;c.getContext('2d').putImageData(new ImageData(data,16,12),0,0);
    const blob=await new Promise(done=>c.toBlob(done,'image/png'));
    const staged=await stageToolOutput({blob,filename:'picker-fixture.png',title:'Synthetic picker fixture',returnUrl:'/draw/',metadata:{width:16,height:12},mediaSources:[{id:'fixture',label:'Synthetic',kind:'rgba-frames',mediaSource:{kind:'rgba-frames',frames:[{width:16,height:12,data,delayMs:100}],totalPlays:1}}],mediaSettings:{playbackRate:1,totalPlays:1,musicTotalPlays:1}});
    const url=new URL(staged.url,location.origin);url.searchParams.set('view','advanced');return url.search;
  });
  await open(advancedQuery);await page.locator('[data-sc-unified-format]').selectOption('jpeg');
  await page.waitForFunction(()=>{
    const main=document.querySelector('#main'),layout=document.querySelector('#output-layout'),link=document.querySelector('#output-download');
    return document.querySelector('#output-format-select')?.value==='jpeg'&&document.querySelector('[data-sc-format]')?.value==='jpeg'
      && !layout?.conversionActions?.busy && main?.getAttribute('aria-busy')!=='true' && !document.querySelector('#output-nav-export')?.disabled
      && /\.(jpe?g)$/i.test(link?.download||'') && document.querySelector('.sc-result-surface')?.dataset.current==='true';
  });
  const [advancedDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);assert.equal((await bytes(advancedDownload)).subarray(0,3).toString('hex'),'ffd8ff');assert.equal(downloads,3);
  pass('advanced handoff uses the visible destination, synchronizes native settings and saves JPEG');
  // Optional component fixture. Its injection is NOT production UI evidence.
  await page.goto(base+'/__format-picker-fixture/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{window.fixturePicker=await(await import('/js/creation/format-picker.mjs')).mountConversionFormatPicker();window.fixtureChanges=0;document.querySelector('select').addEventListener('change',()=>window.fixtureChanges++);});
  const trigger=page.locator('#output-format-select + .px-format-trigger'),dialog=page.locator('.px-format-dialog');
  for(const [width,height]of [[320,568],[390,844],[844,390],[768,1024],[1366,900]]){
    await page.setViewportSize({width,height});await trigger.click();await page.waitForFunction(()=>{const d=document.querySelector('.px-format-dialog'),r=d.getBoundingClientRect();return d.open&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    assert.equal(await page.locator('.px-format-option').count(),await page.locator('#output-format-select').evaluate(node=>node.options.length));await page.locator('.px-format-close').click();pass(`isolated picker fits ${width}x${height} and preserves all native choices`);
  }
  await trigger.click();await page.locator('.px-format-search').fill('点字');assert.equal(await page.locator('.px-format-option').count(),1);assert.equal(await page.locator('.px-format-option').getAttribute('data-value'),'braille');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(node=>node===document.activeElement),true);
  await trigger.click();await page.locator('.px-format-search').fill('not-a-format');assert.equal(await page.locator('.px-format-empty').isVisible(),true);await page.locator('.px-format-empty button').click();assert.equal(await page.locator('.px-format-option').count(),5);
  await page.locator('.px-format-close').click();await trigger.click();await page.locator('.px-format-search').fill('ＪＰＧ');assert.equal(await page.locator('.px-format-option').getAttribute('data-value'),'jpeg');await page.locator('.px-format-option').click();assert.equal(await page.locator('#output-format-select').inputValue(),'jpeg');pass('isolated picker semantic/full-width search, empty recovery and Escape focus return');
  await trigger.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('End');await page.keyboard.press('Enter');assert.equal(await dialog.evaluate(node=>node.open),true,'disabled last option cannot commit');assert.equal(await page.locator('#output-format-select').inputValue(),'jpeg');
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('#output-format-select').inputValue(),'ascii');assert.equal(await page.evaluate(()=>window.fixtureChanges),2,'one native change per committed new choice');pass('isolated picker keyboard selection respects disabled capabilities and one native change');
  await trigger.click();await page.evaluate(()=>{const select=document.querySelector('select');select.querySelector('[value="png"]').disabled=true;select.append(new Option('WAV','wav'));});
  await page.locator('.px-format-option[data-value="wav"]').waitFor({state:'visible'});assert.equal(await page.locator('.px-format-option[data-value="png"]').getAttribute('aria-disabled'),'true');await page.locator('.px-format-option[data-value="wav"]').click();assert.equal(await page.locator('#output-format-select').inputValue(),'wav');assert.equal(await page.evaluate(()=>window.fixtureChanges),3);pass('isolated picker follows live native capability changes while open');
  await page.evaluate(()=>window.fixturePicker.refresh());await paint();assert.equal(await page.locator('.px-format-dialog').count(),1);assert.equal(await page.locator('.px-format-trigger').count(),1);await page.evaluate(()=>window.fixturePicker.destroy());assert.equal(await page.locator('.px-format-dialog').count(),0);assert.equal(await page.locator('#output-format-select').isVisible(),true);assert.equal(await page.locator('#output-format-select').getAttribute('aria-hidden'),null);pass('isolated picker stays idempotent and cleanup restores native access');
  await page.goto(base+'/__format-picker-fixture/?fallback=1',{waitUntil:'domcontentloaded'});await page.route('**/css/format-picker.css*',route=>route.abort());
  assert.equal(await page.evaluate(async()=>await(await import('/js/creation/format-picker.mjs')).mountConversionFormatPicker()),null);assert.equal(await page.locator('#output-format-select').isVisible(),true);assert.equal(await page.locator('.px-format-trigger').count(),0);pass('isolated picker stylesheet failure keeps the native selector usable');
  assert.deepEqual(report.errors,[]);assert.equal(downloads,3,'fixture cannot add a download');report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;
  if(browser){try{
    const page=browser.contexts().flatMap(context=>context.pages()).at(-1);if(page)report.failureDom=await page.evaluate(()=>({url:location.href,mode:document.querySelector('.text-mode-nav [aria-pressed="true"]')?.dataset.textMode,
      nativeFormat:document.querySelector('#output-format-select,[data-format]')?.value,visibleFormat:document.querySelector('[data-sc-unified-format]')?.value,
      nativeStatus:document.querySelector('#output-status,[data-status]')?.textContent,saveStatus:document.querySelector('.sc-export-message')?.textContent,
      busy:document.querySelector('#main')?.getAttribute('aria-busy'),detailBusy:document.querySelector('#output-layout')?.conversionActions?.busy,
      download:document.querySelector('#output-download')?.download,saveDisabled:document.querySelector('#output-nav-export')?.disabled,
      resultState:document.querySelector('.sc-result-surface')?.dataset.state,current:document.querySelector('.sc-result-surface')?.dataset.current,
      invalid:[...document.querySelectorAll('input,select,textarea')].filter(node=>node.willValidate&&!node.checkValidity()).map(node=>({id:node.id,type:node.type,message:node.validationMessage}))}));
  }catch{} }
}
finally{if(browser)await browser.close();if(server.listening)server.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));}
