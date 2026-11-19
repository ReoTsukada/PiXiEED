import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
const loader = await readFile(new URL('js/home-auto-ads.js', root), 'utf8');
const policy = await readFile(new URL('js/adsense-offerwall-policy.js', root), 'utf8');
function context(path = '/', overrides = {}) {
  const scripts = [];
  const window = { location: { origin:'https://pixieed.jp', protocol:'https:', pathname:path, search:'', hash:'', ...overrides }, history:{ state:null } };
  window.top = window.self = window;
  const document = {
    head:{ append(script) { scripts.push(script); } },
    querySelector() { return scripts[0] || null; },
    createElement() { return { setAttribute(name,value) { this[name]=value; } }; }
  };
  return { window, document, scripts, URL, URLSearchParams };
}

test('public home loads the official async SDK once, after message policy', () => {
  for (const path of ['/', '/index.html', '/tools/', '/tools/index.html']) {
    const ctx = context(path);
    runInNewContext(loader,ctx);
    assert.equal(ctx.scripts.length,0,'policy required before provider');
    runInNewContext(policy,ctx);
    runInNewContext(loader,ctx); runInNewContext(loader,ctx);
    assert.equal(ctx.scripts.length,1);
    assert.equal(ctx.scripts[0].async,true);
    assert.equal(ctx.scripts[0].crossOrigin,'anonymous');
    assert.equal(ctx.scripts[0].src,'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253');
    ctx.window.googlefc.MessageTypeEnum={OFFERWALL:1,AD_BLOCKING:2,CONSENT:3};
    let result;
    ctx.window.googlefc.controlledMessagingFunction({proceed(...args){result=args;}});
    assert.equal(result[0],false);
    assert.deepEqual([...result[1]],[1,2],'required consent is not suppressed');
  }
});
test('private URLs, non-production pages and frames never request a provider', () => {
  for (const [path,override,framed] of [
    ['/tools/start/draw/',{},false], ['/feed/',{},false], ['/',{origin:'http://localhost:8000'},false],
    ['/',{origin:'https://www.pixieed.jp'},false], ['/',{search:'?pxd=secret'},false],
    ['/',{hash:'#secret'},false], ['/',{},true]
  ]) {
    const ctx=context(path,override);
    if(framed)ctx.window.top={};
    runInNewContext(policy,ctx);runInNewContext(loader,ctx);
    assert.equal(ctx.scripts.length,0,`${path} ${JSON.stringify(override)} frame=${framed}`);
  }
});
test('the public portal includes the guarded deferred entry after the policy',async()=>{
  const html=await readFile(new URL('index.html',root),'utf8');
  const head=html.match(/<head>[\s\S]*?<\/head>/)[0];
  assert.equal((head.match(/name="google-adsense-account"/g)||[]).length,1);
  assert.equal((head.match(/src="\/js\/home-auto-ads.js/g)||[]).length,1);
  assert.match(head,/<script defer src="\/js\/adsense-offerwall-policy[^>]+><\/script>\s*<script defer src="\/js\/home-auto-ads/);
  assert.ok(head.indexOf('meta charset=') < head.indexOf('google-adsense-account'));
  assert.ok(head.indexOf('name="viewport"') < head.indexOf('google-adsense-account'));
  for(const path of ['draw/editor.html','audio/editor.html','feed/index.html','explore/index.html','privacy/index.html']) {
    assert.doesNotMatch(await readFile(new URL(path,root),'utf8'),/home-auto-ads/);
  }
});
