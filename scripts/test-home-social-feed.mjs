import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [homeHtml, communityHtml, homeScript, socialScript, migration, metadataMigration, pixfindHtml] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../community/index.html', import.meta.url), 'utf8'),
  readFile(new URL('./home-social-feed.js', import.meta.url), 'utf8'),
  readFile(new URL('./social-posts.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260803120000_social_home_feed_and_likes.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260803145639_social_post_content_metadata.sql', import.meta.url), 'utf8'),
  readFile(new URL('../pixfind/index.html', import.meta.url), 'utf8'),
]);

assert.doesNotMatch(homeHtml, /id="socialFeed"/);
assert.doesNotMatch(homeHtml, /home-social-feed\.js/);
assert.match(communityHtml, /id="socialFeed"/);
assert.match(communityHtml, /id="socialComposeDialog"/);
assert.match(communityHtml, /market\/market\.css\?v=20260730-row-ad-reserve1/);
assert.match(communityHtml, /market-section market-grid social-feed/);
assert.match(communityHtml, /market-quick-actions__toggle social-home__compose/);
assert.match(communityHtml, /id="socialComposeOpen"[^>]*aria-label="作品を投稿する"/);
assert.doesNotMatch(communityHtml, /market-sell-button social-home__compose/);
assert.match(communityHtml, /home-social\.css\?v=20260825-social-empty-state1/);
assert.match(communityHtml, /home-social-feed\.js\?v=20260825-social-empty-state1/);
assert.match(communityHtml, /id="socialComposeContentKind"/);
assert.match(communityHtml, /value="finished"[^>]*>完成作品/);
assert.match(communityHtml, /value="wip"[^>]*>制作途中/);
assert.match(communityHtml, /<details class="social-compose__details">/);
assert.match(communityHtml, /id="socialComposeTitleInput"[^>]*maxlength="50"/);
assert.match(communityHtml, /id="socialComposeTags"/);
assert.match(communityHtml, /id="socialComposeComments"/);
assert.doesNotMatch(communityHtml, /socialComposeFree/);
assert.doesNotMatch(communityHtml, /無料マーケット/);
assert.doesNotMatch(homeHtml, /home-hero-card/);
assert.doesNotMatch(homeHtml, /home-app-grid--launcher/);

assert.match(homeScript, /market-card social-post-card/);
assert.match(homeScript, /market-favorite-button market-card__favorite social-post-card__like/);
assert.match(homeScript, /card\.append\(author, previewBox\)/);
assert.match(homeScript, /contentKind/);
assert.match(homeScript, /social-post-card__kind/);
assert.match(homeScript, /PiXiEEDCardFeedAds\?\.renderProgressively/);

assert.match(socialScript, /social_toggle_like_v1/);
assert.match(socialScript, /social_posts_for_sources_v1/);
assert.match(socialScript, /social_create_image_post_v2/);
assert.match(socialScript, /input_content_kind/);
assert.match(socialScript, /legacyPayload/);
assert.match(migration, /create table if not exists public\.social_posts/);
assert.match(migration, /create table if not exists public\.social_post_likes/);
assert.match(migration, /create trigger pixfind_puzzles_sync_social_post/);
assert.match(migration, /create trigger market_assets_sync_social_post/);
assert.match(migration, /from public\.market_assets asset[\s\S]*where asset\.status = 'published' and asset\.withdrawn_at is null[\s\S]*on conflict \(market_asset_id\) do nothing/);
assert.match(migration, /from public\.pixfind_puzzles puzzle[\s\S]*on conflict \(pixfind_puzzle_id\) do nothing/);
assert.match(metadataMigration, /add column if not exists content_kind/);
assert.match(metadataMigration, /input_content_kind text default 'finished'/);
assert.match(metadataMigration, /'content_kind', post\.content_kind/);

assert.match(pixfindHtml, /id="gameLikeButton"/);
assert.match(pixfindHtml, /social-posts\.js\?v=20260803-social-seo-comments1/);

console.log('Home social feed and shared-like guards passed.');
