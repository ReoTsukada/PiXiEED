import test from 'node:test';
import assert from 'node:assert/strict';
import { copyVerifiedPuzzleShareUrl, puzzleShareUrl, verifyPuzzleSharePage } from '../../js/creation/puzzle-share-client.mjs';

const id = '123e4567-e89b-42d3-a456-426614174000';
const origin = 'https://pixieed.example';

function htmlDocument(markup) {
  return class {
    parseFromString() {
      return { querySelector(selector) {
        const match = selector.startsWith('link')
          ? markup.match(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?\s*>/i)
            : selector.includes('og:url')
              ? markup.match(/<meta\s+property="og:url"\s+content="([^"]+)"\s*\/?\s*>/i)
              : selector.includes('og:title')
                ? markup.match(/<meta\s+property="og:title"\s+content="([^"]+)"\s*\/?\s*>/i)
                : selector.includes('og:description')
                  ? markup.match(/<meta\s+property="og:description"\s+content="([^"]+)"\s*\/?\s*>/i)
            : markup.match(/<meta\s+property="og:image"\s+content="([^"]+)"\s*\/?\s*>/i);
        return match ? { getAttribute: () => match[1] } : null;
      } };
    }
  };
}

function response({ status = 200, body = '', type = 'text/html', url = '' } = {}) {
  return { status, ok: status >= 200 && status < 300, url, headers: { get: (name) => name === 'content-type' ? type : null }, text: async () => body };
}

function publishedFetch({ canonical = `${origin}/play/spot-difference/puzzles/${id}/`, ogUrl = canonical, image = `${origin}/play/spot-difference/puzzles/${id}/ogp.png`, imageStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    if (url === image) return response({ status: imageStatus, type: 'image/png', url });
    if (url === canonical) {
      if (init.method === 'HEAD') return response({ url });
      return response({ url, body: `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${ogUrl}"><meta property="og:image" content="${image}">` });
    }
    return response({ status: 404, url });
  };
  return { fetchImpl, calls };
}

test('share URL is rooted under the matching game and canonical public ID', () => {
  assert.equal(puzzleShareUrl({ mode: 'spot-difference', postId: id, origin }), `${origin}/play/spot-difference/puzzles/${id}/`);
  assert.equal(puzzleShareUrl({ mode: 'hidden_object', postId: id, origin }), `${origin}/play/hidden-object/puzzles/${id}/`);
  assert.throws(() => puzzleShareUrl({ mode: 'localOnly', postId: id, origin }), { code: 'puzzle_unavailable' });
  assert.throws(() => puzzleShareUrl({ mode: 'hidden-object', postId: '../bad', origin }), { code: 'puzzle_unavailable' });
});

test('published page and its same-origin PNG are verified before returning a URL', async () => {
  const { fetchImpl, calls } = publishedFetch();
  const readyHtml = `<link rel="canonical" href="${origin}/play/spot-difference/puzzles/${id}/"><meta property="og:url" content="${origin}/play/spot-difference/puzzles/${id}/"><meta property="og:title" content="Test"><meta property="og:description" content="Test"><meta property="og:image" content="${origin}/play/spot-difference/puzzles/${id}/ogp.png">`;
  const url = await verifyPuzzleSharePage({ mode: 'spot-difference', postId: id, origin, fetchImpl, DOMParserImpl: htmlDocument(readyHtml) });
  assert.equal(url, `${origin}/play/spot-difference/puzzles/${id}/`);
  assert.deepEqual(calls.map((call) => call.method), ['HEAD', 'GET', 'HEAD']);
});

test('404, missing metadata, and wrong puzzle canonical never become share success', async () => {
  const { fetchImpl } = publishedFetch();
  await assert.rejects(() => verifyPuzzleSharePage({ mode: 'spot-difference', postId: id, origin, fetchImpl: async () => response({ status: 404 }), DOMParserImpl: htmlDocument('') }), { code: 'share_page_not_ready' });
  const mismatch = publishedFetch({ canonical: `${origin}/play/spot-difference/puzzles/${id}/`, ogUrl: `${origin}/play/spot-difference/puzzles/123e4567-e89b-42d3-a456-426614174001/` });
  await assert.rejects(() => verifyPuzzleSharePage({ mode: 'spot-difference', postId: id, origin, fetchImpl: mismatch.fetchImpl, DOMParserImpl: htmlDocument(`<link rel="canonical" href="${origin}/play/spot-difference/puzzles/${id}/"><meta property="og:url" content="${origin}/play/spot-difference/puzzles/123e4567-e89b-42d3-a456-426614174001/"><meta property="og:title" content="Test"><meta property="og:description" content="Test"><meta property="og:image" content="${origin}/play/spot-difference/puzzles/${id}/ogp.png">`) }), { code: 'share_page_not_ready' });
  const missingImage = publishedFetch({ imageStatus: 404 });
  await assert.rejects(() => verifyPuzzleSharePage({ mode: 'spot-difference', postId: id, origin, fetchImpl: missingImage.fetchImpl, DOMParserImpl: htmlDocument(`<link rel="canonical" href="${origin}/play/spot-difference/puzzles/${id}/"><meta property="og:url" content="${origin}/play/spot-difference/puzzles/${id}/"><meta property="og:title" content="Test"><meta property="og:description" content="Test"><meta property="og:image" content="${origin}/play/spot-difference/puzzles/${id}/ogp.png">`) }), { code: 'share_image_not_ready' });
});

test('clipboard failure returns a verified URL for manual selection without claiming it was copied', async () => {
  const { fetchImpl } = publishedFetch();
  await assert.rejects(() => copyVerifiedPuzzleShareUrl({ mode: 'spot-difference', postId: id, origin, fetchImpl, DOMParserImpl: htmlDocument(`<link rel="canonical" href="${origin}/play/spot-difference/puzzles/${id}/"><meta property="og:url" content="${origin}/play/spot-difference/puzzles/${id}/"><meta property="og:title" content="Test"><meta property="og:description" content="Test"><meta property="og:image" content="${origin}/play/spot-difference/puzzles/${id}/ogp.png">`) }, { writeText: async () => { throw new Error('denied'); } }), (error) => error.code === 'clipboard_unavailable' && error.url === `${origin}/play/spot-difference/puzzles/${id}/`);
});


test('legacy IDs share within their own game without entering the modern ID namespace', () => {
  for (const [mode, legacyId] of [['spot-difference', `pixfind-${id}`], ['spot_difference', `pixfind-sd-${id}`], ['hidden-object', `pixfind-ho-${id}`]]) {
    const game = mode === 'hidden-object' ? 'hidden-object' : 'spot-difference';
    assert.equal(puzzleShareUrl({ mode, postId: legacyId, origin }), `${origin}/play/${game}/puzzles/${legacyId}/`);
  }
  for (const [mode, legacyId] of [['hidden-object', `pixfind-${id}`], ['spot-difference', `pixfind-ho-${id}`], ['hidden-object', `pixfind-ho-${id}/../other`], ['spot-difference', `pixfind-${id}%2f`]]) {
    assert.throws(() => puzzleShareUrl({ mode, postId: legacyId, origin }), { code: 'puzzle_unavailable' });
  }
});

test('a published legacy page and PNG are verified before copying', async () => {
  const legacyId = `pixfind-ho-${id}`;
  const url = `${origin}/play/hidden-object/puzzles/${legacyId}/`;
  const image = `${url}ogp-1234567890abcdef.png`;
  const markup = `<link rel="canonical" href="${url}"><meta property="og:url" content="${url}"><meta property="og:title" content="Test"><meta property="og:description" content="Test"><meta property="og:image" content="${image}">`;
  const { fetchImpl, calls } = publishedFetch({ canonical: url, image });
  const copied = [];
  assert.equal(await copyVerifiedPuzzleShareUrl({ mode: 'hidden-object', postId: legacyId, origin, fetchImpl, DOMParserImpl: htmlDocument(markup) }, { writeText: async value => copied.push(value) }), url);
  assert.deepEqual(copied, [url]);
  assert.deepEqual(calls.map(call => call.method), ['HEAD', 'GET', 'HEAD']);
});
