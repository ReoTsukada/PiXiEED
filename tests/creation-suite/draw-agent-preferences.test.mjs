import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDrawAgentPreferences } from '../../js/creation/draw-agent-preferences.mjs';
test('lighting and view preferences preserve explicit false and zero without accepting hidden commands', () => {
  assert.deepEqual(normalizeDrawAgentPreferences({type:'normal.configure',settings:{ambient:0,previewLighting:false,lightColor:'#ff0000'}}),{ambient:0,previewLighting:false,lightColor:'#ff0000'});
  assert.deepEqual(normalizeDrawAgentPreferences({type:'view.configure',panX:0,showGrid:false}),{panX:0,showGrid:false});
  for(const value of [{type:'view.configure'}, {type:'view.configure',zoom:Infinity}, {type:'normal.configure',settings:{roughness:0}}, {type:'normal.configure',settings:{previewLighting:'true'}}, {type:'view.configure',command:'post.globe'}]) assert.throws(()=>normalizeDrawAgentPreferences(value));
});
