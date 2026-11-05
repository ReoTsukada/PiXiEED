import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyConversionFile, planConversionImport } from '../../js/creation/conversion-input-router.mjs';

const file = (name, type = '') => ({ name, type });

test('empty chooser cancellation returns an empty plan', () => {
  assert.deepEqual(planConversionImport([]), { kind: 'empty', files: [] });
  assert.deepEqual(planConversionImport(null), { kind: 'empty', files: [] });
});

test('known media extensions and strong media MIME types route as media', () => {
  for (const ext of ['png','jpg','jpeg','webp','gif','apng','bmp','tif','tiff','tga','targa','qoi','ico','ppm','pgm','pbm','pnm','pam','svg','mp4','webm','wav','mp3','aif','aiff','aifc','au','snd','flac','ogg','opus','m4a']) {
    assert.equal(classifyConversionFile(file(`art.${ext}`)), 'media', ext);
  }
  assert.equal(classifyConversionFile(file('picture.data', 'image/png')), 'media');
  assert.equal(classifyConversionFile(file('track.data', 'audio/wav')), 'media');
  assert.equal(classifyConversionFile(file('movie.data', 'video/mp4')), 'media');
});

test('known media extensions outrank misleading text MIME, while media MIME remains strongest', () => {
  assert.equal(classifyConversionFile(file('actual.png', 'text/plain')), 'media');
  assert.equal(classifyConversionFile(file('actual.txt', 'image/png')), 'media');
  assert.equal(classifyConversionFile(file('notes.txt', '')), 'text');
  assert.equal(classifyConversionFile(file('notes', 'application/json')), 'text');
  assert.equal(classifyConversionFile(file('notes', 'text/csv')), 'text');
});

test('single unknown binary remains eligible for restore-code input', () => {
  const item = file('archive.bin', 'application/octet-stream');
  assert.equal(classifyConversionFile(item), 'binary');
  assert.deepEqual(planConversionImport([item]), { kind: 'binary', files: [item], kinds: ['binary'] });
});

test('all-media batches retain order and original file identities', () => {
  const image = file('one.png', 'image/png'), audio = file('two.wav', 'audio/wav'), video = file('three.mp4', 'video/mp4');
  const inputs = [image, audio, video], plan = planConversionImport(inputs);
  assert.equal(plan.kind, 'media');
  assert.deepEqual(plan.files, inputs);
  assert.notEqual(plan.files, inputs, 'the result owns a separate array');
  assert.deepEqual(plan.files.map((item, index) => item === inputs[index]), [true, true, true]);
  assert.deepEqual(inputs, [image, audio, video], 'planning does not mutate the caller array');
});

test('media routes independently of the current text-input route and leaves drafts untouched', () => {
  const draft = { value: 'unsaved text remains in its native field' };
  const image = file('while-typing.png', 'image/png');
  const plan = planConversionImport([image]);
  assert.equal(plan.kind, 'media');
  assert.equal(draft.value, 'unsaved text remains in its native field');
  assert.equal(plan.files[0], image);
});

test('mixed batches retain ordered file identities and matching metadata classifications', () => {
  const image = file('image.png', 'image/png'), note = file('note.txt', 'text/plain'), binary = file('restore.bin', 'application/octet-stream');
  const batch = [image, note, binary, file('later.png', 'image/png')];
  const plan = planConversionImport(batch);
  assert.equal(plan.kind, 'mixed');
  assert.deepEqual(plan.kinds, ['media','text','binary','media']);
  assert.deepEqual(plan.files, batch);
  assert.deepEqual(plan.files.map((item,index) => item === batch[index]), [true,true,true,true]);
  assert.notEqual(plan.files, batch);
});
