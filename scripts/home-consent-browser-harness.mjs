#!/usr/bin/env node
/** Isolated UI contract tests. No real authentication, user settings or network writes. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(process.env.PIXIEED_BROWSER_ROOT||fileURLToPath(new URL('..',import.meta.url)));
const out=process.env.PIXIEED_BROWSER_ARTIFACTS||'/tmp/pixieed-posted-art-random/settings-browser';
const {chromium}=await import(pathToFileURL(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{let f=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(f!==root&&!f.startsWith(root+'/'))throw Error();if((await stat(f)).isDirectory())f+='/index.html';res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json','.ttf':'font/ttf'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});const report={cases:[],limits:['UI backend is synthetic. No real sign-in or consent is performed.']};
try{
 for(const width of[320,390,1280]){
 const state={account:{sessionScope:'account',enabled:false,revision:0,needsReconfirmation:false},device:{sessionScope:'device',enabled:false,revision:0,needsReconfirmation:false}};let failure=false,saves=0;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<600,serviceWorkers:'block'});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
 if(url.pathname==='/js/globe/my-posts.mjs'&&url.search.includes('20261112-home-consent-1'))return route.fulfill({contentType:'text/javascript',body:`export function createMyPostsApi(){return {listHomeArtworkPreferences:async()=>{const r=await fetch('/__test/preferences');if(!r.ok)throw Error();return r.json()},saveHomeArtworkPreference:async(scope,enabled,revision)=>{const r=await fetch('/__test/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,enabled,revision})});if(!r.ok)throw Error();return r.json()}}}`});
 if(url.pathname==='/__test/preferences'){
 if(route.request().method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify(Object.values(state))});
 const value=route.request().postDataJSON();saves++;await new Promise(r=>setTimeout(r,100));if(failure)return route.fulfill({status:503,body:'uncertain'});
 assert.equal(value.revision,state[value.scope].revision);state[value.scope]={...state[value.scope],enabled:value.enabled,revision:value.revision+1,needsReconfirmation:false};return route.fulfill({contentType:'application/json',body:JSON.stringify(state[value.scope])});}
 return route.continue();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/profile/');const host=page.locator('[data-home-artwork-settings]');await host.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await host.locator('form').first().waitFor();const account=host.locator('form').nth(0),guest=host.locator('form').nth(1);
 assert.equal(await account.locator('input').isChecked(),false);assert.equal(await guest.locator('input').isChecked(),false);assert.match(await account.innerText(),/このアカウント/);assert.match(await guest.innerText(),/この端末/);
 await account.locator('input').check();await account.evaluate(form=>{form.requestSubmit();form.requestSubmit();});await account.locator('[role=status]').filter({hasText:'許可しました'}).waitFor();assert.match(await account.locator('[role=status]').innerText(),/運営確認後/);assert.equal(saves,1);assert.equal(state.account.enabled,true);assert.equal(state.device.enabled,false);
 await page.reload();await host.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await host.locator('form').first().waitFor();assert.equal(await account.locator('input').isChecked(),true);assert.equal(await guest.locator('input').isChecked(),false);
 await account.locator('input').uncheck();await account.locator('button[type=submit]').click();await account.locator('[role=status]').filter({hasText:'OFFにしました'}).waitFor();assert.equal(state.account.enabled,false);assert.equal(state.device.enabled,false);
 failure=true;await guest.locator('input').check();await guest.locator('button[type=submit]').click();await guest.getByRole('button',{name:'設定を読み直す'}).waitFor();assert.equal(await guest.locator('input').isDisabled(),true);assert.equal(state.device.enabled,false);failure=false;await guest.getByRole('button',{name:'設定を読み直す'}).click();await host.locator('form').nth(1).waitFor();assert.equal(await guest.locator('input').isChecked(),false);
 state.account={...state.account,enabled:true,revision:3,needsReconfirmation:true};await page.reload();await host.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await host.locator('form').first().waitFor();assert.equal(await account.locator('input').isChecked(),false);assert.match(await account.locator('[role=status]').innerText(),/もう一度/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await host.screenshot({path:join(out,`home-consent-settings-${width}.png`)});
 await account.locator('input').check();await account.locator('button[type=submit]').click();await account.locator('[role=status]').filter({hasText:'許可しました'}).waitFor();assert.equal(state.account.needsReconfirmation,false);
 await page.goto(base+'/');await page.goBack();await host.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await host.locator('form').first().waitFor();assert.equal(await account.locator('input').isChecked(),true);assert.equal(state.device.enabled,false);assert.deepEqual(errors,[]);report.cases.push({width,initialOff:true,ownersSeparate:true,doubleSubmitOneSave:true,reload:true,offDoesNotDelete:true,uncertainSaveReadback:true,reconfirmation:true,back:true,noOverflow:true});await context.close();
 }
 report.status='PASS';console.log(JSON.stringify(report,null,2));
}catch(error){report.status='FAIL';report.error=error.message;throw error;}finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
