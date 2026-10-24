import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {addToolOfferwallEntry, toolStartDocument, normalizeFreshToolLinks} from '../../scripts/build-pages-site.mjs';
import {TOOL_START_ROUTES} from '../../js/tool-start-routes.mjs';
import {OFFERWALL_TOOL_PATHS,OFFERWALL_ENTRY_POLICY_SCRIPT,OFFERWALL_ENTRY_LOADER_SCRIPT} from '../../scripts/offerwall-entry-policy.mjs';
const input='<html><head><script src="/js/adsense-auto.js?rev=old"></script><script src="/other-cmp.js"></script></head><body><main>Tool</main></body></html>';
test('all seven real tool entry templates install policy before the guarded SDK entry, without broad provider loading',async()=>{
 assert.deepEqual(OFFERWALL_TOOL_PATHS, TOOL_START_ROUTES.map(route=>route.startPath));
 for(const route of TOOL_START_ROUTES){
  const name=route.startPath.slice(1)+'index.html';
  const source=await readFile(new URL('../../'+route.sourcePath,import.meta.url),'utf8');
  const result=addToolOfferwallEntry(toolStartDocument(source,route),name).html;
  assert(result.indexOf(OFFERWALL_ENTRY_POLICY_SCRIPT)<result.indexOf(OFFERWALL_ENTRY_LOADER_SCRIPT));
  const withCmp=addToolOfferwallEntry(input,name).html;
  assert(withCmp.indexOf(OFFERWALL_ENTRY_POLICY_SCRIPT)<withCmp.indexOf('/other-cmp.js'));
  assert.doesNotMatch(result,/adsense-auto\.js/);
  assert.equal((result.match(/tool-offerwall-entry\.mjs/g)||[]).length,1);
  assert.equal(addToolOfferwallEntry(result,name).html,result);
  assert(result.includes(`data-tool-start="${route.id}"`));
  const canonical = source.match(/<link\b[^>]*rel="canonical"[^>]*>/)?.[0];
  if (canonical) assert(result.includes(canonical),'existing canonical is preserved');
  else assert(!/rel="canonical"/.test(result),'conversion workspace does not invent a new indexed canonical');
  assert(result.includes('<main'),'actual tool document, not an intermediary');
  assert.match(result,/name="robots" content="noindex,follow"/);
 }
});
test('directories, shared play, legacy aliases and private pages do not get a tool SDK entry',()=>{
 for(const name of ['draw/index.html','camera/index.html','audio/index.html','jigsaw/index.html','index.html','tools/index.html','output/index.html','play/spot-difference/index.html','play/hidden-object/index.html','pixiedraw2/index.html','game/index.html','feed/index.html','profile/index.html','draw/editor.html','audio/editor.html']){
  const source='<html><head></head><body>Unchanged</body></html>';
  assert.equal(addToolOfferwallEntry(source,name).html,source,name);
 }
});
test('static navigation changes fresh starts while retaining canonical and saved/shared URLs',()=>{
 const html='<a href="/draw/?workspace=1">描く</a><a href="/jigsaw/?pxd=opaque#saved">続ける</a><link rel="canonical" href="https://pixieed.jp/draw/">';
 const result=normalizeFreshToolLinks(html);
 assert(result.includes('href="/tools/start/draw/"'));
 assert(result.includes('href="/jigsaw/?pxd=opaque#saved"'));
 assert(result.includes('rel="canonical" href="https://pixieed.jp/draw/"'));
});
