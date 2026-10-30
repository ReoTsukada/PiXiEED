/** Extend the existing real-converter harness without changing its regression checks.
 * All inputs are generated in a localhost browser. No public visits, ads or screenshots.
 */
import {readFile,writeFile,rm} from 'node:fs/promises';
const original = new URL('./check-text-art-fit.mjs', import.meta.url);
const temporary = new URL('./.format-picker-check-tmp.mjs', import.meta.url);
let source = await readFile(original,'utf8');
function replace(from,to){if(!source.includes(from))throw new Error('Regression harness changed: '+from.slice(0,100));source=source.replace(from,to);}
replace("await send('Fetch.enable'", "await send('Page.bringToFront');\n await send('Fetch.enable'");
replace('const ready=async()=>', 'const paint=async()=>evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));\n const ready=async()=>');
source=source.replaceAll('await delay(120)','await paint()').replaceAll('await delay(160)','await paint()').replaceAll('await delay(80)','await paint()');
replace("await change('[data-sc-format]','ascii');", `await evaluate(async()=>{window.formatPickerTest=await(await import('/js/creation/format-picker.mjs?rev=20261030-format-picker-1')).mountConversionFormatPicker();});
 await wait(()=>Boolean(document.querySelector('[data-sc-format-row] .px-format-trigger')),'custom picker');
 await change('[data-sc-format]','ascii');`);
replace('const change=async(selector,value)=>evaluate(', `const change=async(selector,value)=>{
   if(selector==='[data-sc-format]'){
     await evaluate(()=>document.querySelector('[data-sc-format-row] .px-format-trigger').click());
     await evaluate(value=>{const row=[...document.querySelectorAll('.px-format-option')].find(e=>e.dataset.value===value);if(!row)throw Error('Missing choice '+value);row.click();},value);
     await paint(); return;
   }
   return evaluate(`);
replace('},selector,value);\n const paint=', '},selector,value);};\n const paint=');
const extra = `
 // The same end-to-end suite above now uses the custom picker for every format change.
 const latestBeforePicker=await text();
 for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1366,900]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await paint();
   await click('[data-sc-format-row] .px-format-trigger');await paint();
   await wait(()=>{const d=document.querySelector('.px-format-dialog'),r=d.getBoundingClientRect();return d.open&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;},'settled picker geometry');
   const g=await evaluate(()=>{const d=document.querySelector('.px-format-dialog'),r=d.getBoundingClientRect();return {open:d.open,x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,options:document.querySelectorAll('.px-format-option').length,native:document.querySelector('[data-sc-format]').options.length};});
   check('picker fits '+width+'x'+height,g.open&&g.x>=0&&g.y>=0&&g.x+g.w<=g.vw+1&&g.y+g.h<=g.vh+1&&!g.overflow);
   check('native choices preserved '+width+'x'+height,g.options===g.native);
   await click('.px-format-close');await paint();
 }
 check('opening and closing never re-encodes',latestBeforePicker===await text());
 await click('[data-sc-format-row] .px-format-trigger');
 await evaluate(()=>{const q=document.querySelector('.px-format-search');q.value='点字';q.dispatchEvent(new Event('input',{bubbles:true}));});
 check('Japanese semantic search finds braille',await evaluate(()=>document.querySelectorAll('.px-format-option').length===1&&document.querySelector('.px-format-option').dataset.value==='braille'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await paint();
 check('Escape restores trigger focus',await evaluate(()=>!document.querySelector('.px-format-dialog').open&&document.activeElement.matches('[data-sc-format-row] .px-format-trigger')));
 await click('[data-sc-format-row] .px-format-trigger');
 await evaluate(()=>{const q=document.querySelector('.px-format-search');q.value='not-a-format';q.dispatchEvent(new Event('input',{bubbles:true}));});
 check('empty search has recovery',await evaluate(()=>!document.querySelector('.px-format-empty').hidden));
 await click('.px-format-empty button');check('reset restores all formats',await evaluate(()=>document.querySelectorAll('.px-format-option').length===document.querySelector('[data-sc-format]').options.length));
 await click('.px-format-close');await paint();
 await change('[data-sc-format]','braille');await ready();
 check('custom selection updates text engine and shared value',await evaluate(()=>document.querySelector('[data-sc-format]').value==='braille'&&document.querySelector('[data-tx-style]').value==='braille'));
 check('picker does not add a download',downloads.length===1);
 // Input mode carries its own action list, not media extensions.
 await change('[data-sc-source]','text');await paint();await change('[data-sc-format]','text');
 check('text input action is synchronized',await evaluate(()=>document.querySelector('[data-tx-action]').value==='text'));
 // A fresh simple-converter page uses the same custom component and actual JPEG encoder.
 await send('Page.navigate',{url:base+'/output/work/?mode=convert'});
 await wait(()=>location.search==='?mode=convert'&&Boolean(document.querySelector('[data-editor]'))&&Boolean(document.querySelector('[data-sc-format]')),'simple converter');
 await evaluate(async()=>{window.formatPickerTest=await(await import('/js/creation/format-picker.mjs?rev=20261030-format-picker-1')).mountConversionFormatPicker();});
 await click('[data-demo]');
 await wait(()=>document.querySelector('[data-editor]')?.hidden===false&&document.querySelector('[data-sc-format]')?.options.length>0,'demo source');
 await paint();await click('[data-sc-format-row] .px-format-trigger');
 await evaluate(()=>{const q=document.querySelector('.px-format-search');q.value='ＪＰＧ';q.dispatchEvent(new Event('input',{bubbles:true}));});
 check('full-width JPG alias finds JPEG on actual engine',await evaluate(()=>document.querySelectorAll('.px-format-option').length===1&&document.querySelector('.px-format-option').dataset.value==='jpeg'));
 await click('.px-format-option');await paint();
 check('simple converter receives JPEG selection',await evaluate(()=>document.querySelector('[data-format]').value==='jpeg'));
 await click('#output-nav-export');for(let i=0;i<100&&downloads.length<2;i++)await delay(100);
 check('JPEG selection exports once',downloads.length===2);
 const jpeg=await readFile(temp+'/downloads/'+downloads[1]);check('JPEG output contains actual JPEG bytes',jpeg[0]===255&&jpeg[1]===216&&jpeg[2]===255);
 // Use the real advanced handoff. Empty-workspace import deliberately redirects to simple view.
 const advancedUrl=await evaluate(async()=>{
   const {stageToolOutput}=await import('/js/creation/output-handoff.mjs?rev=20261028-unified-output-1');
   const c=document.createElement('canvas');c.width=16;c.height=12;const x=c.getContext('2d');
   const frame=x.createImageData(16,12);for(let y=0;y<12;y++)for(let n=0;n<16;n++)frame.data.set([(n*17+y*11)%256,(n*33+y*29)%256,(n*7+y*53)%256,255],(y*16+n)*4);
   x.putImageData(frame,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));
   const staged=await stageToolOutput({blob,filename:'local.png',title:'Local fixture',returnUrl:'/draw/',metadata:{width:16,height:12},mediaSources:[{id:'fixture',label:'Local fixture',kind:'rgba-frames',mediaSource:{kind:'rgba-frames',frames:[{width:16,height:12,data:frame.data,delayMs:100}],totalPlays:1}}],mediaSettings:{playbackRate:1,totalPlays:1,musicTotalPlays:1}});
   const u=new URL(staged.url,location.origin);u.searchParams.set('view','advanced');return u.href;
 });
 await send('Page.navigate',{url:advancedUrl});
 await wait(()=>new URLSearchParams(location.search).get('view')==='advanced'&&document.querySelector('#output-layout')?.hidden===false&&document.querySelector('[data-sc-format]')?.options.length>0&&!document.querySelector('[data-sc-format]')?.disabled,'advanced source');
 await evaluate(async()=>{window.formatPickerTest=await(await import('/js/creation/format-picker.mjs?rev=20261030-format-picker-1')).mountConversionFormatPicker();});await paint();
 await click('#output-extension');await paint();
 check('secondary format selector enhanced',await evaluate(()=>{const s=document.querySelector('#output-format-select');return s.hidden&&s.nextElementSibling.matches('.px-format-trigger');}));
 await click('#output-format-select + .px-format-trigger');await paint();
 await click('.px-format-option[data-value="jpeg"]');
 await wait(()=>document.querySelector('#output-format-select')?.value==='jpeg'&&document.querySelector('[data-sc-format]')?.value==='jpeg','two-way format sync');
 check('secondary selector keeps top selection in sync',true);
 check('no duplicate dialogs',await evaluate(()=>document.querySelectorAll('.px-format-dialog').length===1));
 check('custom component adds no remote dependency',await evaluate(()=>!performance.getEntriesByType('resource').some(r=>r.initiatorType==='script'&&r.name.includes('format-picker')&&!r.name.startsWith(location.origin))));
 await evaluate(()=>window.formatPickerTest.destroy());
 check('cleanup restores native selectors',await evaluate(()=>!document.querySelector('.px-format-dialog')&&!document.querySelector('#output-format-select').hidden));
`;
replace(" check('no browser exceptions',errors.length===0);", extra+"\n check('no browser exceptions',errors.length===0);");
replace("console.log('TEXT_ART_FIT_CHECK '", "console.log('FORMAT_PICKER_CHECK '");
try {await writeFile(temporary,source);await import(temporary.href);}finally{await rm(temporary,{force:true});}
