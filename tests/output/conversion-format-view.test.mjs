import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversionFormatOptions } from '../../js/creation/conversion-format-view.mjs';
const doc = { createElement(tagName) { return { tagName, children: [], append(child) { this.children.push(child); } }; } };

test('visible options retain order, exact text and disabled state without reusing engine nodes', () => {
  const choices = [{ value:'png',label:'PNG <透過>',disabled:false },{value:'gif',label:'GIF',disabled:true}];
  const nodes = createConversionFormatOptions(doc, choices);
  assert.deepEqual(nodes.map(n=>[n.tagName,n.value,n.textContent,n.disabled]), [['option','png','PNG <透過>',false],['option','gif','GIF',true]]);
  assert.notEqual(nodes[0], choices[0]); assert.equal(choices[0].tagName, undefined);
});

test('grouped and ungrouped formats keep their exact source sequence', () => {
  const choices = [{value:'png',label:'PNG',group:'画像'},{value:'gif',label:'GIF',group:'画像'},
    {value:'raw',label:'元ファイル'},{value:'jpeg',label:'JPEG',group:'画像'},{value:'wav',label:'WAV',group:'音声'}];
  const nodes = createConversionFormatOptions(doc, choices);
  assert.deepEqual(nodes.map(n=>[n.tagName,n.label||n.value]), [['optgroup','画像'],['option','raw'],['optgroup','画像'],['optgroup','音声']]);
  assert.deepEqual(nodes.filter(n=>n.tagName==='optgroup').map(n=>n.children.map(c=>c.value)), [['png','gif'],['jpeg'],['wav']]);
});

test('empty and switched capability lists do not retain prior groups', () => {
  assert.deepEqual(createConversionFormatOptions(doc, []), []);
  createConversionFormatOptions(doc,[{value:'png',label:'PNG',group:'画像'}]);
  assert.deepEqual(createConversionFormatOptions(doc,[{value:'ascii',label:'ASCII'}]).map(n=>n.tagName),['option']);
});
