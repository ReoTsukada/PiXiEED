import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { addToolOfferwallEntry } from '../../scripts/build-pages-site.mjs';
const source = await readFile(new URL('../../js/ad-recovery-entry.js', import.meta.url), 'utf8');
const policy = await readFile(new URL('../../js/adsense-offerwall-policy.js', import.meta.url), 'utf8');
const KEY = 'pixieed.ad-recovery.next-entry.v1';
function setup({ url='https://pixieed.jp/tools/start/draw/', storage=new Map(), storageBlocked=false, fine=true, history={} }={}) {
  const win = new EventTarget(), doc = new EventTarget(), timers = [], scripts=[];
  win.location = new URL(url); win.self = win.top = win; win.history={state:history}; win.frames={};
  win.localStorage={getItem:k=>{if(storageBlocked)throw Error();return storage.get(k)||null;},setItem:(k,v)=>{if(storageBlocked)throw Error();storage.set(k,v);}};
  win.matchMedia=()=>({matches:fine}); win.setTimeout=fn=>{timers.push(fn);return timers.length;};win.clearTimeout=()=>{};
  doc.readyState='complete';doc.visibilityState='visible';doc.querySelector=()=>null;doc.body={append(){}};doc.head={append:s=>scripts.push(s)};
  doc.createElement=()=>Object.assign(new EventTarget(),{dataset:{},setAttribute(){}});
  win.googlefc={MessageTypeEnum:{OFFERWALL:3,AD_BLOCKING:1}};
  const context=vm.createContext({window:win,document:doc,URL,URLSearchParams,Date});
  vm.runInContext(policy,context);vm.runInContext(source,context);
  return {win,doc,scripts,storage,context,flush(){for(const fn of timers.splice(0))fn();},allow:()=>win.__PIXIEED_AD_RECOVERY_ENTRY__.allowMessage(), message(){let result;win.googlefc.controlledMessagingFunction({proceed:(...v)=>result=v});return JSON.parse(JSON.stringify(result));}};
}
test('recovery uses one official asynchronous tag only on a fresh idle tool entry',()=>{
  const s=setup();assert.equal(s.scripts.length,0);s.flush();assert.equal(s.scripts.length,1);
  assert.equal(s.scripts[0].src,'https://fundingchoicesmessages.google.com/i/pub-9801602250480253?ers=1');
  assert.equal(s.scripts[0].async,true);assert.equal(s.scripts[0].referrerPolicy,'no-referrer');
  assert.deepEqual(s.message(),[false,[3]],'Offerwall stays suppressed while recovery can proceed');
  assert.equal(s.allow(),true);vm.runInContext(source,s.context);s.flush();assert.equal(s.scripts.length,1);
});
test('first interaction cancels loading and late recovery messaging without blocking consent',()=>{
  for(const type of ['pointerdown','keydown','beforeinput','paste','drop','wheel','scroll']) {
    const s=setup();s.doc.dispatchEvent(new Event(type));s.flush();assert.equal(s.scripts.length,0,type);assert.equal(s.allow(),false);
    assert.deepEqual(s.message(),[false,[3,1]]);
  }
  const late=setup();late.flush();late.doc.dispatchEvent(new Event('pointerdown'));assert.equal(late.allow(),false);
});
test('wheel and scroll retire recovery both before and after the vendor script loads',()=>{
  for(const type of ['wheel','scroll']) {
    const beforeLoad=setup();beforeLoad.doc.dispatchEvent(new Event(type));beforeLoad.flush();
    assert.equal(beforeLoad.scripts.length,0,`${type} before load`);assert.equal(beforeLoad.allow(),false);

    const afterLoad=setup();afterLoad.flush();assert.equal(afterLoad.scripts.length,1);
    afterLoad.doc.dispatchEvent(new Event(type));assert.equal(afterLoad.allow(),false,`${type} after load`);
    assert.deepEqual(afterLoad.message(),[false,[3,1]],`${type} blocks late ad-block recovery only`);
  }
});
test('cooldown persists across tool pages and unavailable storage fails closed',()=>{
  const storage=new Map(),one=setup({storage});assert.equal(one.allow(),true);
  assert.ok(Number(storage.get(KEY))>=Date.now()+86399000);
  const two=setup({storage,url:'https://pixieed.jp/tools/start/camera/'});two.flush();assert.equal(two.scripts.length,0);assert.equal(two.allow(),false);
  const blocked=setup({storageBlocked:true});blocked.flush();assert.equal(blocked.scripts.length,0);assert.equal(blocked.allow(),false);
});
test('local, shared/private, small-pointer and non-entry pages never load the recovery vendor',()=>{
  for(const opts of [
    {url:'http://localhost:4589/tools/start/draw/'},{url:'https://pixieed.jp/tools/start/draw/?code=secret'},
    {url:'https://pixieed.jp/tools/start/draw/#secret'},{url:'https://pixieed.jp/draw/editor.html'},
    {url:'https://pixieed.jp/output/work/'},{url:'https://pixieed.jp/tools/start/draw/?workspace=1&workspace=1'},
    {fine:false},{history:{projectWorkspaceSelection:true}},{history:{pixieedWorkspace:true}},
    {history:{toolStartActive:true}}
  ]) {const s=setup(opts);s.flush();assert.equal(s.scripts.length,0,JSON.stringify(opts));assert.equal(s.allow(),false);}
});
test('recovery bootstrap occurs after policy, only on tool starts, and build injection is idempotent',()=>{
  const html='<html><head></head><body></body></html>';
  const start=addToolOfferwallEntry(html,'tools/start/draw/index.html').html;
  assert.ok(start.indexOf('adsense-offerwall-policy.js')<start.indexOf('ad-recovery-entry.js'));
  assert.equal(addToolOfferwallEntry(start,'tools/start/draw/index.html').html,start);
  for(const path of ['output/work/index.html','draw/editor.html','index.html'])assert.ok(!addToolOfferwallEntry(html,path).html.includes('ad-recovery-entry.js'));
});
