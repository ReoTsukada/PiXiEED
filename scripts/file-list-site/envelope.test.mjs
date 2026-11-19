import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEnvelope, isEnvelope } from './envelope.mjs';

const example = { v: 1, id: 'e0c0195a-34dc-48bb-a495-7a3182be1a96',
  iv: 'AE2yBooT5AlVVnA2', cipher: 'A'.repeat(44) };
function pack(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }

test('only the current encrypted envelope, with no extra fields, is accepted', () => {
  assert.deepEqual(decodeEnvelope(pack(example)), example);
  for (const changed of [{ ...example, title: 'private' }, { ...example, v: 2 },
    { ...example, id: 'old-project' }, { ...example, iv: 'x' }, { ...example, cipher: 'x' },
    { ...example, cipher: '#'.repeat(32) }]) {
    assert.equal(isEnvelope(changed), false);
    assert.equal(decodeEnvelope(pack(changed)), null);
  }
  for (const input of ['', '!', 'a'.repeat(131073), pack(null), pack([example])])
    assert.equal(decodeEnvelope(input), null);
});
