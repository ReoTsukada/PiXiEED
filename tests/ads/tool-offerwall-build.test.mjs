import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {addToolOfferwallEntry} from '../../scripts/build-pages-site.mjs';
import {OFFERWALL_TOOL_PATHS,OFFERWALL_ENTRY_POLICY_SCRIPT,OFFERWALL_ENTRY_LOADER_SCRIPT} from '../../scripts/offerwall-entry-policy.mjs';
const input='<html><head><script src="/js/adsense-auto.js?rev=old"></script><script src="/other-cmp.js"></script></head><body><main>Tool</main></body></html>';
test('all seven real tool entry templates install policy before the guarded SDK entry, without broad provider loading',async()=>{
 assert.deepEqual(OFFERWALL_TOOL_PATHS,['/draw/','/camera/','/audio/','/spot-difference/','/hidden-object/','/jigsaw/','/output/work/']);
 for(const route of OFFERWALL_TOOL_PATHS){
  const name=route.slice(1)+'index.html';const result=addToolOfferwallEntry(input,name).html;
  assert(result.indexOf(OFFERWALL_ENTRY_POLICY_SCRIPT)<result.indexOf(OFFERWALL_ENTRY_LOADER_SCRIPT));
  assert(result.indexOf(OFFERWALL_ENTRY_POLICY_SCRIPT)<result.indexOf('/other-cmp.js'));
  assert.doesNotMatch(result,/adsense-auto\.js|adsbygoogle\.js/);
  assert.equal((result.match(/tool-offerwall-entry\.mjs/g)||[]).length,1);
  assert.equal(addToolOfferwallEntry(result,name).html,result);
  const source=await readFile(new URL('../../'+name,import.meta.url),'utf8');
  assert(source.includes(OFFERWALL_ENTRY_LOADER_SCRIPT),name);
 }
});
test('directories, shared play, legacy aliases and private pages do not get a tool SDK entry',()=>{
 for(const name of ['index.html','tools/index.html','output/index.html','play/spot-difference/index.html','play/hidden-object/index.html','pixiedraw2/index.html','game/index.html','feed/index.html','profile/index.html','draw/editor.html','audio/editor.html']){
  const source='<html><head></head><body>Unchanged</body></html>';
  assert.equal(addToolOfferwallEntry(source,name).html,source,name);
 }
});
