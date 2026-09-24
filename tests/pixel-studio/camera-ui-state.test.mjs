import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraStartErrorMessage, deriveCameraPrimaryAction } from '../../js/pixel-studio/camera-ui-state.mjs';

test('primary action never captures an old result while processing has failed', () => {
  assert.equal(deriveCameraPrimaryAction({ mode: 'live', hasResult: true, error: 'frame' }).action, 'retry');
  assert.equal(deriveCameraPrimaryAction({ mode: 'live', hasResult: true, error: 'preview' }).action, 'retry');
  assert.equal(deriveCameraPrimaryAction({ mode: 'live', hasResult: true, error: 'worker' }).action, 'reload');
  assert.equal(deriveCameraPrimaryAction({ mode: 'live', hasResult: true, workerUnavailable: true }).action, 'reload');
});

test('primary action follows camera lifecycle and waits until a fresh result is ready', () => {
  assert.deepEqual(deriveCameraPrimaryAction({ mode: 'captured', hasResult: true }), { action: 'retake', disabled: false, label: 'もう一度撮影する' });
  assert.equal(deriveCameraPrimaryAction({ mode: 'idle' }).action, 'resume');
  assert.equal(deriveCameraPrimaryAction({ mode: 'loading' }).disabled, true);
  assert.equal(deriveCameraPrimaryAction({ mode: 'live', hasResult: false }).disabled, true);
  assert.equal(deriveCameraPrimaryAction({ mode: 'live', hasResult: true }).action, 'capture');
});

test('camera startup failures explain the recovery action in user language', () => {
  assert.match(cameraStartErrorMessage({ name: 'NotAllowedError' }), /許可/);
  assert.match(cameraStartErrorMessage({ name: 'NotFoundError' }), /見つかりません/);
  assert.match(cameraStartErrorMessage({ name: 'NotReadableError' }), /別のアプリ/);
  assert.match(cameraStartErrorMessage(new Error(), { secureContext: false }), /安全な接続/);
  assert.match(cameraStartErrorMessage(new Error(), { supported: false }), /利用できません/);
});
