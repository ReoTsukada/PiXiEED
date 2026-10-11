import test from 'node:test';
import assert from 'node:assert/strict';
import { drawSelectionActionSlots } from '../../js/creation/draw-selection-panel.mjs';
import { brushSettingForTool } from '../../js/creation/draw-brush-settings.mjs';
const keys = slots => slots.map(s => s.key);
test('selection transactions override shape and fill settings, including an empty selection', () => {
 for (const binding of [{tool:'rectangle'}, {tool:'fill',contiguous:false}]) {
  assert.deepEqual(keys(drawSelectionActionSlots({pending:true,hasClipboard:true},'paste',binding)), ['confirm','cancel']);
  assert.deepEqual(keys(drawSelectionActionSlots({bounds:{width:2},canCopy:false,canCut:false},'select',binding)), ['copy','cut']);
  assert.deepEqual(keys(drawSelectionActionSlots({selectTool:true},'select',binding)), ['copy','cut']);
  assert.deepEqual(keys(drawSelectionActionSlots({bounds:{width:2},hasClipboard:true,canPaste:true},'paste',binding)), ['paste','back']);
 }
});
test('shape aliases expose exactly one independent filled toggle and an empty second slot', () => {
 for (const base of ['rectangle','ellipse']) for (const filled of [false,true]) {
  const [option,empty]=drawSelectionActionSlots({},'select',{tool:base+(filled?'-fill':'')},'right');
  assert.equal(option.key,'filled');assert.equal(option.value,filled);assert.equal(option.side,'right');assert.match(option.label,/右 塗り (ON|OFF)/);assert.equal(option.enabled,true);
  assert.equal(empty.kind,'empty');assert.equal(empty.enabled,false);
 }
});
test('fill contiguous preference is independent and other tools do not invent settings', () => {
 for (const value of [undefined,true,false]) assert.equal(drawSelectionActionSlots({},'select',{tool:'fill',contiguous:value})[0].value,value!==false);
 for(const tool of ['pen','eraser','line','spray','picker','unknown']) assert.deepEqual(drawSelectionActionSlots({},'select',{tool}).map(s=>[s.kind,s.enabled]),[['empty',false],['empty',false]]);
 assert.equal(drawSelectionActionSlots({busy:true},'select',{tool:'fill'})[0].enabled,false);
 assert.equal(drawSelectionActionSlots({canConfigure:false},'select',{tool:'rectangle'})[0].enabled,false);
});
test('size descriptors distinguish outline thickness, filled shape geometry and spray diameter', () => {
 for(const tool of ['pen','eraser','line','rectangle','ellipse','rectangle-fill','ellipse-fill']) {
  const setting=brushSettingForTool({tool,brushSize:4});assert.equal(setting.supported,true);assert.equal(setting.value,4);assert.equal(setting.key,'brushSize');assert.equal(setting.max,16);assert.equal(setting.filled,tool.endsWith('-fill'));
 }
 const spray=brushSettingForTool({tool:'spray'});assert.equal(spray.value,5);assert.equal(spray.key,'spraySize');assert.equal(spray.step,2);assert.equal(spray.max,33);
 for (const tool of ['select','picker','fill']) assert.equal(brushSettingForTool({tool}).supported,false);
});
