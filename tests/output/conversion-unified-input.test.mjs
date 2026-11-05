import test from 'node:test';
import assert from 'node:assert/strict';
import { unifiedFormatOptions, unifiedPurposeOptions, unifiedPurposeForMode, unifiedNativeFormatForPurpose, unifiedMaterialLabel, unifiedFilePurposeAvailability } from '../../js/creation/conversion-unified-input.mjs';

const opts = values => values.map(value => ({ value, label: value }));

test('purposes separate file conversion, text art and explicit restore intent', () => {
  assert.deepEqual(unifiedPurposeOptions('file').map(item => item.value), ['media', 'art', 'restore']);
  assert.deepEqual(unifiedPurposeOptions('text').map(item => item.action), ['text', 'restore']);
  assert.equal(unifiedPurposeOptions('text')[0].action, 'text');
});

test('text art never offers automatic or Base64 decoding; restore remains explicit', () => {
  const native = opts(['auto', 'text', 'restore', 'pixels', 'document', 'dataurl', 'base64']);
  assert.deepEqual(unifiedFormatOptions('text', 'text', native).map(item => item.value), ['text']);
  assert.deepEqual(unifiedFormatOptions('text', 'restore', native).map(item => item.value), ['auto', 'restore', 'pixels', 'document', 'dataurl', 'base64']);
});

test('file purpose filters existing choices and preserves native order', () => {
  const native = opts(['jpg', 'encode', 'ascii', 'base64', 'pixels', 'png', 'dataurl', 'emoji']);
  assert.deepEqual(unifiedFormatOptions('file', 'art', native).map(item => item.value), ['ascii', 'emoji']);
  assert.deepEqual(unifiedFormatOptions('file', 'restore', native).map(item => item.value), ['encode', 'base64', 'pixels', 'dataurl']);
  assert.deepEqual(unifiedFormatOptions('file', 'media', native).map(item => item.value), native.map(item => item.value));
});

test('disabled native choices are not presented as selectable formats', () => {
  const native = [{ value: 'text', label: '文章', disabled: false }, { value: 'restore', label: '復元', disabled: true }];
  assert.deepEqual(unifiedFormatOptions('text', 'restore', native), []);
});

test('purpose follows the actual mode and native choice, including external binary activation', () => {
  assert.equal(unifiedPurposeForMode({ mode: 'media', source: 'file', nativeValue: 'jpg' }), 'media');
  assert.equal(unifiedPurposeForMode({ mode: 'output', source: 'file', nativeValue: 'encode' }), 'restore');
  assert.equal(unifiedPurposeForMode({ mode: 'output', source: 'file', nativeValue: 'ascii' }), 'art');
  assert.equal(unifiedPurposeForMode({ mode: 'input', source: 'text', nativeValue: 'text' }), 'text');
  assert.equal(unifiedPurposeForMode({ mode: 'input', source: 'text', nativeValue: 'auto' }), 'restore');
});

test('file purpose chooses a real compatible engine format before saving', () => {
  const native = opts(['encode', 'ascii', 'block']);
  assert.equal(unifiedNativeFormatForPurpose('art', native), 'ascii');
  assert.equal(unifiedNativeFormatForPurpose('restore', native), 'encode');
  assert.equal(unifiedNativeFormatForPurpose('media', native), null);
  assert.equal(unifiedNativeFormatForPurpose('art', [{ value: 'encode', disabled: false }, { value: 'ascii', disabled: true }]), null);
});

test('media material labels use the actual assets state and retain a useful multi-file label', () => {
  assert.equal(unifiedMaterialLabel({ loaded: true, assets: [{ id: 'a', name: 'scene.gif' }, { id: 'b', name: 'sound.wav' }], activeId: 'b' }), 'sound.wav · 2件');
  assert.equal(unifiedMaterialLabel({ loaded: true, assets: [{ id: 'a' }, { id: 'b' }] }), 'ファイル素材 2件');
  assert.equal(unifiedMaterialLabel({ loaded: false, assets: [] }), '');
});

test('art and restore require a suitable single raw file, independently of media asset groups', () => {
  assert.deepEqual(unifiedFilePurposeAvailability(null), { art: false, restore: false, artReason: 'ファイルを1つ選んでください。', restoreReason: 'ファイルを1つ選んでください。' });
  assert.equal(unifiedFilePurposeAvailability({ name: 'movie.mp4', type: 'video/mp4', size: 200 }).art, false);
  assert.equal(unifiedFilePurposeAvailability({ name: 'photo.png', type: 'image/png', size: 200 }).art, true);
  assert.equal(unifiedFilePurposeAvailability({ name: 'huge.png', type: 'image/png', size: 17 * 1024 * 1024 }).restore, false);
});


test('cleanup restores native nodes in their original sibling order before wrapper removal', async () => {
  const { restoreUnifiedNodePositions } = await import('../../js/creation/conversion-unified-input.mjs');
  const parent = () => ({ children: [], insertBefore(node, next) {
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    const index = next ? this.children.indexOf(next) : this.children.length;
    this.children.splice(index, 0, node); node.parentNode = this;
  } });
  const original = parent(), wrapper = parent();
  const [label, source, meta, action] = ['label','source','meta','action'].map(name => ({ name }));
  for (const node of [label, source, meta, action]) original.insertBefore(node, null);
  const positions = [{node:source,parent:original,next:meta},{node:label,parent:original,next:source},{node:meta,parent:original,next:action}];
  for (const node of [label,source,meta]) wrapper.insertBefore(node,null);
  restoreUnifiedNodePositions(positions);
  assert.deepEqual(original.children.map(n=>n.name),['label','source','meta','action']);
  assert.equal(wrapper.children.length,0);
});


test('editing a text material retains the separate file conversion or code intent', async () => {
  const { createUnifiedSourceSelection } = await import('../../js/creation/conversion-unified-input.mjs');
  const state = createUnifiedSourceSelection();
  state.remember('output'); state.remember('input'); assert.equal(state.fileMode,'output');
  state.remember('media'); state.remember('input'); assert.equal(state.fileMode,'media');
});


test('an empty active text draft still offers the retained file material as an exit',async()=>{
  const { showUnifiedMaterialChoices } = await import('../../js/creation/conversion-unified-input.mjs');
  assert.equal(showUnifiedMaterialChoices({mode:'input',hasText:false,hasFiles:true}),true);
  assert.equal(showUnifiedMaterialChoices({mode:'media',hasText:false,hasFiles:true}),false);
  assert.equal(showUnifiedMaterialChoices({mode:'input',hasText:true,hasFiles:false}),false);
});


test('one output control set follows the media modal and returns to the shared surface',async()=>{
  const { unifiedControlsInPanel }=await import('../../js/creation/conversion-unified-input.mjs');
  assert.equal(unifiedControlsInPanel({mode:'media',modal:true}),true);
  assert.equal(unifiedControlsInPanel({mode:'media',modal:false}),false);
  assert.equal(unifiedControlsInPanel({mode:'input',modal:true}),false);
});


test('stable hidden, disabled, labels and pressed state do not repeat observable DOM writes', async () => {
  const { writeUnifiedProperty, writeUnifiedAttribute } = await import('../../js/creation/conversion-unified-input.mjs');
  let writes = 0;
  const node = new Proxy({ hidden: true, disabled: false, textContent: 'ready' }, { set(target, key, value) { writes++; target[key] = value; return true; } });
  for (let frame = 0; frame < 3; frame++) {
    writeUnifiedProperty(node, 'hidden', true); writeUnifiedProperty(node, 'disabled', false); writeUnifiedProperty(node, 'textContent', 'ready');
  }
  assert.equal(writes, 0);
  writeUnifiedProperty(node, 'hidden', false); assert.equal(writes, 1);
  const attrs = new Map([['aria-pressed', 'false']]); let attrWrites = 0;
  const element = { getAttribute: key => attrs.get(key), setAttribute(key,value) { attrWrites++; attrs.set(key,value); } };
  writeUnifiedAttribute(element, 'aria-pressed', 'false'); assert.equal(attrWrites, 0);
  writeUnifiedAttribute(element, 'aria-pressed', 'true'); writeUnifiedAttribute(element, 'aria-pressed', 'true'); assert.equal(attrWrites, 1);
});


test('mixed or audio intake keeps a one-image art chooser reachable from the media workspace', async () => {
  const {needsUnifiedRawFileChoice}=await import('../../js/creation/conversion-unified-input.mjs');
  const base={mode:'media',loaded:true};
  assert.equal(needsUnifiedRawFileChoice(base),true);
  assert.equal(needsUnifiedRawFileChoice({...base,file:{name:'data.bin',size:10}}),true);
  assert.equal(needsUnifiedRawFileChoice({...base,file:{name:'tone.wav',type:'audio/wav',size:10}}),true);
  assert.equal(needsUnifiedRawFileChoice({...base,file:{name:'image.png',type:'image/png',size:10}}),false);
  assert.equal(needsUnifiedRawFileChoice({...base,mode:'input'}),false);
});
