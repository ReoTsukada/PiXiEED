import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSocialApi, SocialApiError } from '../../js/social/api.mjs';

const project = { url: 'https://project.example.test', publishableKey: 'public-test-key', publicMapTable: 'post_map_points', publicStorageBucket: 'post-public' };
const mapId = '3a0f26f8-8309-4fe3-9b9c-03f977e8b952';
const showcaseId = '68e6216a-7597-4cb4-8979-8a6c021737cb';
const cell = 'globe:v11-meridian-parallel-quarter-degree:360:720';
const mapRow = {
  post_id: mapId, title: '公開作品', caption: '説明', public_image_path: `${mapId}/public.png`,
  published_at: '2026-09-01T00:00:00Z', globe_cell_id: cell, map_space: 'globe', post_kind: 'pixel_art', puzzle_mode: null, author_name: '作家'
};
const point = { social_post_id: showcaseId, globe_cell_id: cell };
const showcaseRow = {
  id: showcaseId, title: 'ショーケース', caption: '紹介', creator_display_name: '作者',
  media_object_path: 'published/art.png', published_at: '2026-09-02T00:00:00Z',
  status: 'published', post_kind: 'image', distribution_mode: 'showcase'
};
const response = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });

function fixtureFetch({ mapRows = [mapRow], placements = [point], socialRows = [showcaseRow], inspect = () => {} } = {}) {
  return async (input, options = {}) => {
    const url = new URL(input);
    inspect(url, options);
    if (url.pathname === '/rest/v1/post_map_points') return response(mapRows);
    if (url.pathname === '/rest/v1/social_post_map_points') return response(placements);
    if (url.pathname === '/rest/v1/social_posts') return response(socialRows);
    throw new Error(`Unexpected endpoint ${url.pathname}`);
  };
}

test('social reader stays light and does not import map, editor, or player modules', async () => {
  const source = await readFile(new URL('../../js/social/api.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"].*(?:geometry|renderer|post-ui|editor|music|player)/);
});
test('published jigsaw cards point to the public puzzle reader without embedding local material',async()=>{
 const api=createSocialApi({config:project,fetchImpl:fixtureFetch({mapRows:[{...mapRow,puzzle_mode:'jigsaw'}],placements:[],socialRows:[]})});
 const posts=await api.list();assert.equal(posts.length,1);assert.equal(posts[0].kind,'puzzle');
 assert.equal(posts[0].href,`/jigsaw/?postPuzzle=${mapId}`);assert.doesNotMatch(posts[0].href,/data:|draft|seed/);
});

test('list applies the existing public filters, bounds rows, maps both sources and merges latest first', async () => {
  const calls = [];
  const api = createSocialApi({ config: project, fetchImpl: fixtureFetch({ inspect: (url) => calls.push(url) }) });
  const posts = await api.list({ limit: 3 });
  assert.deepEqual(posts.map((post) => post.id), [`showcase:${showcaseId}`, `map:${mapId}`]);
  assert.equal(posts[0].kind, 'art');
  assert.equal(posts[0].likeable, false);
  assert.equal(posts[0].image.src, `https://project.example.test/storage/v1/object/public/social-posts/published/art.png`);
  assert.equal(posts[1].source, 'map');
  assert.equal(posts[1].href, `/feed/?post=${encodeURIComponent(`map:${mapId}`)}`);
  assert.equal(posts[1].mapHref, `/globe/?art=${mapId}`);
  const mapQuery = calls.find((url) => url.pathname === '/rest/v1/post_map_points');
  assert.equal(mapQuery.searchParams.get('map_space'), 'eq.globe');
  assert.equal(mapQuery.searchParams.get('published_at'), 'not.is.null');
  assert.equal(mapQuery.searchParams.get('order'), 'published_at.desc');
  assert.equal(mapQuery.searchParams.get('limit'), '3');
  const socialQuery = calls.find((url) => url.pathname.endsWith('/social_posts'));
  assert.equal(socialQuery.searchParams.get('status'), 'eq.published');
  assert.equal(socialQuery.searchParams.get('post_kind'), 'eq.image');
  assert.equal(socialQuery.searchParams.get('distribution_mode'), 'eq.showcase');
  assert.equal(socialQuery.searchParams.get('order'), 'published_at.desc');
  assert.equal(socialQuery.searchParams.get('limit'), '3');
  assert.equal(posts[0].mapHref, `/globe/?art=${encodeURIComponent(`showcase:${showcaseId}`)}`);
});

test('map rows retry only missing optional columns and default safely when older columns are absent', async () => {
  const selects = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname === '/rest/v1/post_map_points') {
      const select = url.searchParams.get('select');
      selects.push(select);
      if (select.includes('author_name')) return response({ message: 'column author_name does not exist' }, 400);
      return response([{ ...mapRow, post_kind: undefined, puzzle_mode: undefined, author_name: undefined }]);
    }
    if (url.pathname === '/rest/v1/social_post_map_points') return response([]);
    throw new Error(`Unexpected endpoint ${url.pathname}`);
  };
  const [post] = await createSocialApi({ config: project, fetchImpl }).list();
  assert.ok(selects.length >= 2);
  assert.equal(selects[0].includes('author_name'), true);
  assert.equal(selects.at(-1).includes('author_name'), false);
  assert.equal(post.kind, 'art');
  assert.deepEqual(post.author, { name: '' });
});

test('malformed and non-public rows never become posts or private image URLs', async () => {
  const invalidMap = [
    { ...mapRow, public_image_path: '../private.png' },
    { ...mapRow, public_image_path: 'https://elsewhere.example/image.png' },
    { ...mapRow, published_at: null },
    { ...mapRow, globe_cell_id: 'globe:wrong:1:2' },
    { ...mapRow, map_space: 'japan' },
    { ...mapRow, post_id: 'not-a-uuid' },
    { ...mapRow, post_kind: 'music' },
    { ...mapRow, puzzle_mode: 'unsupported-puzzle' }
  ];
  const invalidShowcase = [
    { ...showcaseRow, status: 'pending' },
    { ...showcaseRow, post_kind: 'music' },
    { ...showcaseRow, distribution_mode: 'paid' },
    { ...showcaseRow, media_object_path: '../private.png' }
  ];
  const api = createSocialApi({
    config: project,
    fetchImpl: fixtureFetch({ mapRows: invalidMap, socialRows: invalidShowcase })
  });
  assert.deepEqual(await api.list(), []);
});

test('detail lookup is source-qualified and still requires public visibility filters', async () => {
  const calls = [];
  const api = createSocialApi({ config: project, fetchImpl: fixtureFetch({ inspect: (url) => calls.push(url) }) });
  assert.equal((await api.get(`map:${mapId}`))?.id, `map:${mapId}`);
  assert.equal((await api.get(`showcase:${showcaseId}`))?.id, `showcase:${showcaseId}`);
  assert.equal(await api.get('map:not-a-uuid'), null);
  assert.ok(calls.filter((url) => url.pathname === '/rest/v1/post_map_points').every((url) => url.searchParams.get('published_at') === 'not.is.null' && url.searchParams.get('map_space') === 'eq.globe'));
  const detail = calls.find((url) => url.pathname === '/rest/v1/post_map_points');
  assert.equal(detail.searchParams.get('post_id'), `eq.${mapId}`);
});

test('unplaced public showcases stay in feed and detail with no map link', async () => {
  const api = createSocialApi({ config: project, fetchImpl: fixtureFetch({ placements: [] }) });
  const [post] = await api.list();
  assert.equal(post.id, `showcase:${showcaseId}`);
  assert.equal(post.mapHref, null);
  assert.equal((await api.get(`showcase:${showcaseId}`))?.mapHref, null);
  assert.deepEqual(api.getReadWarnings(), []);
});

test('a placement lookup failure preserves a published showcase and reports a warning', async () => {
  const api = createSocialApi({
    config: project,
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === '/rest/v1/post_map_points') return response([]);
      if (url.pathname === '/rest/v1/social_posts') return response([showcaseRow]);
      if (url.pathname === '/rest/v1/social_post_map_points') return response({ message: 'unavailable' }, 503);
      throw new Error(`Unexpected endpoint ${url.pathname}`);
    }
  });
  const [post] = await api.list();
  assert.equal(post.id, `showcase:${showcaseId}`);
  assert.equal(post.mapHref, null);
  assert.match(api.getReadWarnings()[0], /地図配置リンク/);
});

test('one primary feed failure returns the other source with a readable warning', async () => {
  const api = createSocialApi({
    config: project,
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === '/rest/v1/post_map_points') return response({ message: 'map unavailable' }, 503);
      if (url.pathname === '/rest/v1/social_posts') return response([showcaseRow]);
      if (url.pathname === '/rest/v1/social_post_map_points') return response([]);
      throw new Error(`Unexpected endpoint ${url.pathname}`);
    }
  });
  const posts = await api.list();
  assert.deepEqual(posts.map((post) => post.id), [`showcase:${showcaseId}`]);
  assert.match(api.getReadWarnings()[0], /地図の投稿/);
});

test('both primary public feed failures reject and remain visible as warnings', async () => {
  const api = createSocialApi({
    config: project,
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path === '/rest/v1/post_map_points') return response({ message: 'map unavailable' }, 503);
      if (path === '/rest/v1/social_posts') return response({ message: 'showcase unavailable' }, 502);
      throw new Error(`Unexpected endpoint ${path}`);
    }
  });
  await assert.rejects(api.list(), (error) => error instanceof SocialApiError && error.code === 'feed_unavailable');
  assert.equal(api.getReadWarnings().length, 2);
});

test('timeout is reported separately and can be retried with a new call', async () => {
  let calls = 0;
  const api = createSocialApi({
    config: project,
    timeoutMs: 5,
    fetchImpl: (input, { signal }) => {
      calls += 1;
      if (calls > 2) return Promise.resolve(response([]));
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    }
  });
  await assert.rejects(api.list(), (error) => error instanceof SocialApiError && error.code === 'timeout');
  assert.deepEqual(await api.list(), []);
});

test('submit lazily passes the unchanged globe payload to production actions; likes accept map refs only', async () => {
  let imports = 0;
  const calls = [];
  const api = createSocialApi({
    config: project,
    fetchImpl: fixtureFetch(),
    loadActions: async () => {
      imports += 1;
      return { createSupabasePostActions: () => ({
        submit: async (post) => { calls.push(['submit', post]); return { id: mapId }; },
        hasLiked: async (id) => { calls.push(['hasLiked', id]); return true; },
        setLike: async (id, liked) => { calls.push(['setLike', id, liked]); }
      }) };
    }
  });
  const payload = { title: 'Title', caption: '', image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' }, pin: { cellId: cell }, requestKey: 'local-key' };
  assert.equal(imports, 0);
  await assert.rejects(api.submit({ ...payload, kind: 'music' }), /投稿形式は送信できません/);
  assert.equal(imports, 0);
  assert.deepEqual(await api.submit(payload), { id: mapId });
  assert.equal(await api.hasLiked(`map:${mapId}`), true);
  await assert.rejects(api.setLike(`showcase:${showcaseId}`, true), /いいねできません/);
  await api.setLike(`map:${mapId}`, false);
  assert.equal(imports, 1);
  assert.deepEqual(calls, [['submit', payload], ['hasLiked', mapId], ['setLike', mapId, false]]);
});

test('invalid public project configuration fails without a fetch', async () => {
  let calls = 0;
  const api = createSocialApi({ config: { ...project, url: 'http://project.example.test' }, fetchImpl: async () => { calls += 1; return response([]); } });
  await assert.rejects(api.list(), (error) => error instanceof SocialApiError && error.code === 'not_configured');
  assert.equal(calls, 0);
});

test('comment compatibility methods fail explicitly without a network request', async () => {
  let calls = 0;
  const api = createSocialApi({ config: project, fetchImpl: async () => { calls += 1; return response([]); } });
  for (const action of [() => api.comments(`map:${mapId}`), () => api.getComments(`map:${mapId}`), () => api.createComment({}), () => api.editComment({}), () => api.removeComment(mapId)]) {
    await assert.rejects(action, (error) => error instanceof SocialApiError && error.code === 'comments_disabled');
  }
  assert.equal(calls, 0);
});
