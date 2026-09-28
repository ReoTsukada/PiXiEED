// Real PostgreSQL + actual Function code; auth/storage are explicit test adapters.
import assert from 'node:assert/strict';
import { createPostHandler } from '../../supabase/functions/create-post/index.ts';
import { moderatePost } from '../../supabase/functions/moderate-post/index.ts';
import { publicPostPuzzleHandler } from '../../supabase/functions/public-post-puzzle/index.ts';
import { createDrawDocument, encodePng } from '../../js/creation/draw-core.mjs';
import { inspectPixelPng } from '../../supabase/functions/_shared/pixel-png.mjs';
import { preparePublicPostPuzzle } from '../../js/creation/pixfind-play.mjs';

const socket = Deno.env.get('PIXIEED_TEST_PG_SOCKET');
if (!socket || !socket.includes('pixieed-puzzle-db-')) throw new Error('Run only through scripts/puzzle-db-harness.mjs --integration');
const author = '11111111-1111-4111-8111-111111111101';
const other = '11111111-1111-4111-8111-111111111102';
const projectUrl = 'https://test.supabase.co';
const publicFixtures: unknown[] = [];
const quote = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const jsonValue = (value: unknown) => value == null ? 'null' : `${quote(JSON.stringify(value))}::jsonb`;

async function sql(source: string) {
  const result = await new Deno.Command('psql', { args: ['-X', '-qAt', '-h', socket!, '-p', '55439', '-U', 'pixieed_test_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', source], stdout: 'piped', stderr: 'piped' }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}

function adapter(userId = author) {
  const images = new Map<string, Blob>();
  const calls: string[] = [];
  const admin: any = {
    async rpc(name: string, params: Record<string, unknown>) {
      const allowed: Record<string, string[]> = {
        pixieed_create_post: ['p_post', 'p_location', 'p_puzzle'],
        pixieed_lookup_post_request: ['p_author_id', 'p_request_key', 'p_request_digest'],
        pixieed_moderate_post: ['p_post_id', 'p_action', 'p_note', 'p_point', 'p_changed_public_path'],
        pixieed_read_public_puzzle: ['p_post_id'],
      };
      if (!allowed[name]) throw new Error(`Unexpected RPC ${name}`);
      const args = allowed[name].map((key) => `${key} => ${['p_post', 'p_location', 'p_puzzle', 'p_point'].includes(key) ? jsonValue(params[key]) : params[key] == null ? 'null' : quote(params[key])}`).join(',');
      try {
        const result = await sql(`set role service_role; select public.${name}(${args})::text;`);
        return { data: JSON.parse(result.replace(/^SET\s*/, '') || 'null'), error: null };
      } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    },
    from(table: string) {
      if (!['user_posts', 'post_locations_private', 'post_map_points', 'user_post_puzzles'].includes(table)) throw new Error(`Unexpected table ${table}`);
      const filters: string[] = []; let columns = '*';
      const chain: any = {
        select(value: string) { columns = value; return chain; },
        eq(key: string, value: unknown) { if (!/^[a-z_]+$/.test(key)) throw new Error('Unsafe test column'); filters.push(`${key}=${quote(value)}`); return chain; },
        async maybeSingle() {
          if (!/^[a-z_,*]+$/.test(columns)) throw new Error('Unsafe test projection');
          try { const result = await sql(`set role service_role; select row_to_json(x) from (select ${columns} from public.${table}${filters.length ? ' where ' + filters.join(' and ') : ''}) x;`); return { data: JSON.parse(result.replace(/^SET\s*/, '') || 'null'), error: null }; }
          catch (error) { return { data: null, error }; }
        },
      }; return chain;
    },
    storage: { from(bucket: string) { return {
      async upload(path: string, blob: Blob, options: { upsert: boolean }) {
        assert.equal(options.upsert, false); const key = `${bucket}/${path}`;
        if (images.has(key)) return { data: null, error: new Error('exists') };
        calls.push(`upload:${key}`); images.set(key, blob); return { data: { path }, error: null };
      },
      async download(path: string) { const blob = images.get(`${bucket}/${path}`); return { data: blob || null, error: blob ? null : new Error('missing test image') }; },
      async remove(paths: string[]) { for (const path of paths) { calls.push(`remove:${bucket}/${path}`); images.delete(`${bucket}/${path}`); } return { data: paths.map(name => ({ name })), error: null }; },
    }; } },
  };
  const makeClient: any = (_url: string, key: string) => key === 'test-service' ? admin : { auth: { getUser: async () => ({ data: { user: { id: userId, is_anonymous: false, app_metadata: {} } }, error: null }) } };
  return { admin, images, calls, deps: { createClient: makeClient, projectUrl, publishableKey: 'test-public', serviceKey: 'test-service' } };
}

async function bodyFor(mode: 'spot_difference' | 'hidden_object' | null, key = crypto.randomUUID()) {
  const original = createDrawDocument(16); original.pixels.fill(0); original.pixels[0] = 1;
  const bytes = encodePng(original);
  const image = { mimeType: 'image/png', size: bytes.length, ...await inspectPixelPng(bytes), base64: btoa(String.fromCharCode(...bytes)) };
  const ref = { draftId: 'source-draft', assetId: 'source-asset', revisionId: 'first-version', contentHash: '1'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  let puzzle;
  if (mode === 'spot_difference') {
    const changed = structuredClone(original); changed.pixels[4] = 2; const changedBytes = encodePng(changed);
    puzzle = { mode, source: { schemaVersion: 1, original: ref, changed: { ...ref, revisionId: 'second-version', contentHash: '2'.repeat(64) } }, definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'change', pixels: [4] }] }, changedImage: { mimeType: 'image/png', size: changedBytes.length, ...await inspectPixelPng(changedBytes), base64: btoa(String.fromCharCode(...changedBytes)) } };
  } else if (mode) {
    const pixels = Array.from({ length: 25 }, (_, i) => (5 + Math.floor(i / 5)) * 16 + 5 + i % 5);
    puzzle = { mode, source: { schemaVersion: 1, original: ref }, definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets: [{ id: 'star', name: '星', pixels }] } };
  }
  return { title: '統合テスト', caption: '', postKind: 'pixel_art', requestKey: key, image, location: { globeCell: { id: 'globe:v11-meridian-parallel-quarter-degree:216:10', version: 'v11-meridian-parallel-quarter-degree', band: 216, column: 10 } }, ...(puzzle ? { puzzle } : {}) };
}

function request(body: unknown) { return new Request(`${projectUrl}/functions/v1/create-post`, { method: 'POST', headers: { authorization: 'Bearer fixture-session', 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function readRequest(id: string) { return new Request(`${projectUrl}/functions/v1/public-post-puzzle?postId=${id}`); }

Deno.test('actual Function → atomic PostgreSQL → moderation → public player (both modes)', async () => {
  await sql(`insert into auth.users(id) values (${quote(author)}),(${quote(other)}) on conflict do nothing;`);
  for (const mode of ['spot_difference', 'hidden_object'] as const) {
    const fixture = adapter(); const body = await bodyFor(mode);
    const created = await createPostHandler(request(body), fixture.deps);
    assert.equal(created.status, 201, await created.clone().text());
    const result = await created.json();
    assert.equal((await publicPostPuzzleHandler(readRequest(result.postId), fixture.deps)).status, 404);
    const retry = await createPostHandler(request(body), fixture.deps);
    assert.equal(retry.status, 200, await retry.clone().text()); assert.equal((await retry.json()).postId, result.postId);
    const changed = await createPostHandler(request({ ...body, title: '異なる内容' }), fixture.deps);
    assert.equal(changed.status, 409, await changed.clone().text());
    const approved = await moderatePost(fixture.admin, { postId: result.postId, action: 'approve' });
    assert.equal(approved.status, 'published');
    const published = await publicPostPuzzleHandler(readRequest(result.postId), fixture.deps);
    assert.equal(published.status, 200, await published.clone().text());
    const publicBody = await published.json();
    const publicImages: Record<string, string> = {};
    for (const [path, blob] of fixture.images) {
      if (path.startsWith('post-public/')) publicImages[path.slice('post-public/'.length)] = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
    }
    publicFixtures.push({ mode, response: publicBody, images: publicImages });
    assert.equal(preparePublicPostPuzzle(publicBody, result.postId, projectUrl).publicPostOnly, true);
    assert.equal(publicBody.puzzle.mode, mode);
    assert.equal(JSON.stringify(publicBody).includes('source-draft'), false);
    assert.equal(JSON.stringify(publicBody).includes(author), false);
    assert.equal(publicBody.puzzle.definition.confirmed, true);
    await sql(`update public.user_posts set status='hidden' where id=${quote(result.postId)};`);
    assert.equal((await publicPostPuzzleHandler(readRequest(result.postId), fixture.deps)).status, 404);
    assert.equal(await sql(`set role anon; select count(*) from public.post_map_points where post_id=${quote(result.postId)};`), '0');
  }
  const fixturePath = Deno.env.get('PIXIEED_TEST_PUBLIC_FIXTURES');
  if (fixturePath) await Deno.writeTextFile(fixturePath, JSON.stringify(publicFixtures));
});

Deno.test('real DB allows same PNG from other author and ordinary legacy requests', async () => {
  await sql(`insert into auth.users(id) values (${quote(author)}),(${quote(other)}) on conflict do nothing;`);
  const one = adapter(author); const two = adapter(other); const body = await bodyFor(null);
  const first = await createPostHandler(request(body), one.deps); const second = await createPostHandler(request(body), two.deps);
  assert.equal(first.status, 201, await first.clone().text()); assert.equal(second.status, 201, await second.clone().text());
  assert.notEqual((await first.json()).postId, (await second.json()).postId);
  const old = { ...body, requestKey: undefined };
  for (let i = 0; i < 2; i++) { const response = await createPostHandler(request(old), one.deps); assert.equal(response.status, 201, await response.clone().text()); }
});
