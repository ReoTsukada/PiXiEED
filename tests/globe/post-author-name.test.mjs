import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCell } from '../../js/globe/geometry.mjs';
import { createSupabaseGlobeStore, loadPublishedMapPostsByIds } from '../../js/globe/post-supabase.mjs';

const postId = '3a0f26f8-8309-4fe3-9b9c-03f977e8b952';
const cell = lookupCell(139.69, 35.68);
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });
const row = (extras = {}) => ({
  post_id: postId, title: '公開作品', caption: '', public_image_path: 'public/test.png',
  published_at: '2026-10-06T00:00:00Z', globe_cell_id: cell.id, post_kind: 'pixel_art',
  puzzle_mode: null, ...extras
});

test('public author projection trims, normalizes, and caps names by Unicode code point', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const fullName = `  Cafe\u0301🙂${'あ'.repeat(38)}  `;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url);
    return response([row({ author_name: fullName })]);
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const [post] = await loadPublishedMapPostsByIds([postId]);
  assert.equal(post.author.name, `Café🙂${'あ'.repeat(35)}`);
  assert.equal(Array.from(post.author.name).length, 40);
  assert.equal(calls[0].searchParams.get('select').split(',').includes('author_name'), true);
});

test('legacy public rows without author_name remain readable and keep puzzle metadata', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url);
    if (url.searchParams.get('select').split(',').includes('author_name')) return response({ message: 'author_name column missing' }, 400);
    return response([row({ post_kind: 'pixel_art', puzzle_mode: 'spot_difference' })]);
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const [post] = await loadPublishedMapPostsByIds([postId]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get('select').split(',').includes('author_name'), false);
  assert.equal(post.author.name, '');
  assert.equal(post.puzzleMode, 'spot_difference');
  assert.equal(post.postKind, 'pixel_art');
});

test('initial public map loads project author_name through the same row mapper', async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/post_map_points')) return response([row({ author_name: '  地図作者  ' })]);
    if (url.pathname.endsWith('/social_post_map_points')) return response([]);
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const store = createSupabaseGlobeStore();
  await store.ready;
  assert.equal(store.list()[0].author.name, '地図作者');
});
