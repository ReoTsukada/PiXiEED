import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { createDrawDocument, documentRgba, encodePng } from '../../js/creation/draw-core.mjs';
import { buildPuzzleShareArtifacts } from '../../scripts/lib/puzzle-ogp-artifacts.mjs';

const id = '123e4567-e89b-42d3-a456-426614174000';
const options = { postId: id, supabaseUrl: 'https://project.supabase.co' };
function payload(mode = 'spot_difference') {
  const url = name => `${options.supabaseUrl}/storage/v1/object/public/post-public/${id}/${name}.png`;
  return { ok: true, puzzle: { postId: id, title: '小さな町', author: '作者', mode,
    originalImage: { url: url('original'), width: 32, height: 32 },
    ...(mode === 'spot_difference' ? { changedImage: { url: url('changed'), width: 32, height: 32 } } : {}),
    definition: { secret: 'ANSWER-MASK-NEVER-EXPORT', targets: [{ name: 'りんご', pixels: [44] }] } } };
}
function decodeOutput(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), parts = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  assert.equal(raw.length, (width * 4 + 1) * height);
  const at = (x, y) => [...raw.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 1 + x * 4 + 4)];
  for (let y = 0; y < height; y += 1) assert.equal(raw[y * (width * 4 + 1)], 0);
  return { width, height, at };
}
function sources() {
  const original = createDrawDocument(32);
  original.palette = ['#14283e', '#e75445', '#ffdd6680'];
  original.pixels = original.pixels.map((_, i) => i % 11 === 0 ? -1 : i % 3);
  const changed = structuredClone(original); changed.pixels[5 * 32 + 7] = 1;
  return { original, changed };
}

test('OGP PNG preserves every cell of both drawings at the same integer scale, without answers or decoration', async () => {
  const { original, changed } = sources();
  const result = await buildPuzzleShareArtifacts(payload(), options, { originalBytes: encodePng(original), changedBytes: encodePng(changed) });
  const decoded = decodeOutput(result.images[0].bytes);
  assert.equal(decoded.width, 1200); assert.equal(decoded.height, 630);
  assert.deepEqual(decoded.at(0, 0), [247, 248, 246, 255]);
  assert.doesNotMatch(result.html, /ANSWER-MASK-NEVER-EXPORT/);
  assert.match(result.html, new RegExp(result.images[0].name.replace('.', '\\.')));
  const tags = [...result.html.matchAll(/(?:og:image|twitter:image)" content="([^"]+)"/g)].map(match => match[1]);
  assert.equal(tags.length, 2); assert.equal(tags[0], tags[1]);
  for (const [doc, bounds] of [[original, result.layout.original], [changed, result.layout.changed]]) {
    const source = documentRgba(doc);
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
      const offset = (y * 32 + x) * 4, alpha = source[offset + 3] / 255;
      const expected = [247, 248, 246].map((background, c) => Math.round(source[offset + c] * alpha + background * (1 - alpha))).concat(255);
      for (const [dx, dy] of [[0, 0], [result.layout.scale - 1, result.layout.scale - 1]]) assert.deepEqual(decoded.at(bounds.x + x * result.layout.scale + dx, bounds.y + y * result.layout.scale + dy), expected);
    }
  }
});

test('changed pixels change the image URL; repeated builds of fixed drawings stay identical', async () => {
  const { original, changed } = sources();
  const bytes = { originalBytes: encodePng(original), changedBytes: encodePng(changed) };
  const first = await buildPuzzleShareArtifacts(payload(), options, bytes);
  const second = await buildPuzzleShareArtifacts(payload(), options, bytes);
  assert.deepEqual(first.images[0], second.images[0]);
  changed.pixels[6] = 1;
  const third = await buildPuzzleShareArtifacts(payload(), options, { ...bytes, changedBytes: encodePng(changed) });
  assert.notEqual(first.images[0].name, third.images[0].name);
});

test('fails closed for missing/corrupt/mismatched source PNG and missing text renderer', async () => {
  const { original, changed } = sources();
  await assert.rejects(buildPuzzleShareArtifacts(payload(), options, { originalBytes: encodePng(original) }));
  await assert.rejects(buildPuzzleShareArtifacts(payload(), options, { originalBytes: encodePng(original), changedBytes: new Uint8Array([1]) }));
  await assert.rejects(buildPuzzleShareArtifacts(payload(), options, { originalBytes: encodePng(createDrawDocument(16)), changedBytes: encodePng(changed) }), /dimensions_mismatch/);
  await assert.rejects(buildPuzzleShareArtifacts(payload('hidden_object'), options, { originalBytes: encodePng(original) }), /text_renderer_required/);
  await assert.rejects(buildPuzzleShareArtifacts(payload('hidden_object'), options, { originalBytes: encodePng(createDrawDocument(16)), renderHidden() { throw new Error('must-not-render'); } }), /dimensions_mismatch/);
});

test('Hidden renderer receives only the verified image and public wording; its hash is used in both meta tags', async () => {
  const { original, changed } = sources();
  const output = await buildPuzzleShareArtifacts(payload(), options, { originalBytes: encodePng(original), changedBytes: encodePng(changed) });
  const hiddenPayload = payload('hidden_object'); hiddenPayload.puzzle.definition.prompt = '鍵が6こ';
  let received;
  const hidden = await buildPuzzleShareArtifacts(hiddenPayload, options, { originalBytes: encodePng(original), renderHidden: async data => { received = data; return output.images[0].bytes; } });
  assert.deepEqual(received.text, { prompt: '鍵が6こ', names: ['りんご'] });
  assert.doesNotMatch(JSON.stringify(received.text), /pixels|ANSWER-MASK/);
  assert.equal(hidden.images.length, 1); assert.match(hidden.html, /\/hidden-object\/puzzles\//);
  assert.match(hidden.html, new RegExp(hidden.images[0].name.replace('.', '\\.')));
  assert.doesNotMatch(hidden.html, /ANSWER-MASK-NEVER-EXPORT/);
});
