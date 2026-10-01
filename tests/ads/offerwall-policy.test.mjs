import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../js/adsense-offerwall-policy.js', import.meta.url), 'utf8');
test('suppress only Offerwall and leave ordinary ads and consent messages to Google', () => {
  const frame = {};
  const googlefc = { MessageTypeEnum: { OFFERWALL: 3 }, callbackQueue: ['keep-consent-callback'] };
  const context = vm.createContext({ window: { top: frame, self: frame, googlefc } });
  vm.runInContext(source, context);
  let args;
  googlefc.controlledMessagingFunction({ proceed: (...value) => { args = value; } });
  assert.equal(args[0], false);
  assert.deepEqual(Array.from(args[1]), [3]);
  assert.deepEqual(googlefc.callbackQueue, ['keep-consent-callback']);
});
test('a missing Offerwall enum never holds or blocks consent', () => {
  const frame = {}; const window = { top: frame, self: frame };
  vm.runInContext(source, vm.createContext({ window }));
  let args;
  window.googlefc.controlledMessagingFunction({ proceed: (...value) => { args = value; } });
  assert.deepEqual(args, [true]);
});
test('embedded tools do not replace their host messaging policy', () => {
  const sentinel = () => {}; const googlefc = { controlledMessagingFunction: sentinel };
  vm.runInContext(source, vm.createContext({ window: { top: {}, self: {}, googlefc } }));
  assert.equal(googlefc.controlledMessagingFunction, sentinel);
});
