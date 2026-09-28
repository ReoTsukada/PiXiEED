import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptLegacyCards } from '../../js/creation/legacy-cards.mjs';

const date = '2026-09-27T03:00:00.000Z';
const puzzles = Array.from({ length: 6 }, (_, index) => ({
  id: `puzzle-${index + 1}`, slug: `old-${index + 1}`, label: `Puzzle ${index + 1}`,
  author_name: `Artist ${index + 1}`, original_url: `https://cdn.example.test/p/${index + 1}.png`,
  diff_url: `https://cdn.example.test/d/${index + 1}.png`, thumbnail_url: `https://cdn.example.test/t/${index + 1}.png`,
  targets: [], regions: [],
}));
const markets = Array.from({ length: 4 }, (_, index) => ({
  id: `market-${index + 1}`, title: `For sale ${index + 1}`, status: 'published', published_at: date,
  sale_price_yen: 500, preview_object_path: `previews/item-${index + 1}.png`, creator_display_name: `Maker ${index + 1}`,
}));
const socialPosts = [
  { id: 'showcase-1', post_kind: 'image', distribution_mode: 'showcase', status: 'published', media_object_path: 'posts/art.png', title: 'Pixel art', creator_display_name: 'A', published_at: date, derivative_allowed: false },
  ...puzzles.map((puzzle, index) => ({ id: `social-p-${index}`, post_kind: 'pixfind', distribution_mode: 'pixfind', status: 'published', pixfind_puzzle_id: puzzle.id, published_at: date })),
  ...markets.map((asset, index) => ({ id: `social-m-${index}`, post_kind: 'market', distribution_mode: 'paid', status: 'published', market_asset_id: asset.id, published_at: date })),
];

test('projects the 1 showcase, 6 puzzle references, and 4 paid market references as distinct card kinds', () => {
  const cards = adaptLegacyCards({ socialPosts, pixfindPuzzles: puzzles, marketAssets: markets });
  assert.equal(cards.length, 11);
  assert.equal(cards.filter((item) => item.kind === 'showcase').length, 1);
  assert.equal(cards.filter((item) => item.kind === 'pixfind').length, 6);
  assert.equal(cards.filter((item) => item.kind === 'market-reference').length, 4);
  assert.equal(cards.filter((item) => item.kind === 'showcase').length, 1, 'references do not become free art copies');
  assert.equal(cards[0].id, 'showcase-1');
  assert.equal(cards[0].author, 'A');
  assert.equal(cards[0].publishedAt, date);
});

test('projects 503 published rows and removes duplicate canonical references without losing stable input order', () => {
  const many = Array.from({ length: 503 }, (_, index) => ({
    id: `showcase-${index}`, post_kind: 'image', distribution_mode: 'showcase', status: 'published',
    media_object_path: `posts/${index}.png`, title: `Work ${index}`, creator_display_name: 'Artist',
    published_at: new Date(Date.parse(date) - index * 1000).toISOString(),
  }));
  const cards = adaptLegacyCards({ socialPosts: [...many, many[0]] });
  assert.equal(cards.length, 503);
  assert.equal(new Set(cards.map((item) => item.id)).size, 503);
  assert.deepEqual(cards.slice(0, 3).map((item) => item.id), ['showcase-0', 'showcase-1', 'showcase-2']);
});

test('fails closed on unknown status, missing/bad images, URLs, and unresolved references', () => {
  const bad = [
    { ...socialPosts[0], id: 'hidden', status: 'hidden' },
    { ...socialPosts[0], id: 'unknown', status: 'reviewing' },
    { ...socialPosts[0], id: 'missing', media_object_path: null },
    { ...socialPosts[0], id: 'traversal', media_object_path: '../private/file.png' },
    { ...socialPosts[1], id: 'unresolved', pixfind_puzzle_id: 'absent' },
    { ...socialPosts[1], id: 'bad-url', pixfind_puzzle_id: 'broken' },
    { ...socialPosts.at(-1), id: 'bad-market', market_asset_id: 'not-published' },
  ];
  const cards = adaptLegacyCards({ socialPosts: bad, pixfindPuzzles: [...puzzles, { ...puzzles[0], id: 'broken', thumbnail_url: 'javascript:alert(1)', original_url: null }], marketAssets: [...markets, { ...markets[0], id: 'not-published', status: 'rejected' }] });
  assert.deepEqual(cards, []);
});

test('deduplicates references by canonical puzzle/market ID and keeps reuse rights explicit', () => {
  const duplicated = [socialPosts[0], socialPosts[1], { ...socialPosts[1], id: 'second-ref' }, socialPosts.at(-1), { ...socialPosts.at(-1), id: 'second-sale-ref' }];
  const cards = adaptLegacyCards({ socialPosts: duplicated, pixfindPuzzles: puzzles, marketAssets: markets });
  assert.equal(cards.length, 3);
  assert.equal(cards[1].id, 'puzzle-1');
  assert.equal(cards[2].id, 'market-4');
  assert.equal(cards[0].reuseAllowed, false);
  assert.equal(cards[1].reuseAllowed, false);
  assert.equal(cards[2].reuseAllowed, false);
});

test('accepts no-preview market catalog rows only through published paid references', () => {
  const paidPosts = socialPosts.filter((row) => row.post_kind === 'market');
  const catalog = markets.map(({ id, title, creator_display_name, sale_price_yen, published_at }) => ({ id, title, creator_display_name, sale_price_yen, published_at }));
  const cards = adaptLegacyCards({ socialPosts: paidPosts, marketPublicCatalog: catalog });
  assert.equal(cards.length, 4);
  assert.equal(cards[0].source, 'market_public_catalog_v1');
  assert.equal(cards[0].id, 'market-1');
  assert.equal(cards[0].image, null, 'catalog response contains no preview locator');
  assert.equal(cards[0].priceYen, 500);
  assert.equal(cards[0].reuseAllowed, false);
  assert.deepEqual(adaptLegacyCards({ socialPosts: [], marketPublicCatalog: catalog }), []);
  assert.deepEqual(adaptLegacyCards({ socialPosts: paidPosts, marketPublicCatalog: [{ ...catalog[0], sale_price_yen: 0 }] }), []);
  assert.deepEqual(adaptLegacyCards({ socialPosts: paidPosts, marketAssets: [{ ...markets[0], sale_price_yen: null }] }), []);
});

test('future user posts require a published row and public map image; private fields never leak', () => {
  const cards = adaptLegacyCards({ userPosts: [
    { id: 'future-1', title: 'Map work', status: 'published', published_at: date, author_display_name: 'B', private_latitude: 12.3, author_id: 'secret', post_map_point: { public_image_path: 'public/future.png', exact_latitude: 12.345 } },
    { id: 'pending', title: 'Pending', status: 'pending', published_at: date, post_map_point: { public_image_path: 'public/pending.png' } },
    { id: 'no-image', title: 'No image', status: 'published', published_at: date, post_map_point: { public_image_path: null } },
  ] });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, 'future-1');
  assert.equal(cards[0].image, 'public/future.png');
  assert.equal(cards[0].reuseAllowed, false);
  assert.equal(JSON.stringify(cards).includes('secret'), false);
  assert.equal(JSON.stringify(cards).includes('latitude'), false);
});

test('legacy client IDs never grant edit authority and public cards never grant reuse', () => {
  const cards = adaptLegacyCards({ socialPosts: [{ ...socialPosts[0], derivative_allowed: true, client_id: 'old-client' }] });
  assert.equal(cards[0].reuseAllowed, false);
  assert.equal('client_id' in cards[0], false);
});
