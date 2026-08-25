import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { staticPage } from './generate-social-seo-pages.mjs';

const [generator, migration, template, detailScript, socialScript, workflow, marketWorkflow, sitemap] = await Promise.all([
  readFile(new URL('./generate-social-seo-pages.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260803130000_social_comments_and_seo.sql', import.meta.url), 'utf8'),
  readFile(new URL('../post/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../post/post.js', import.meta.url), 'utf8'),
  readFile(new URL('./social-posts.js', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/generate-social-seo-pages.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/generate-market-ogp.yml', import.meta.url), 'utf8'),
  readFile(new URL('../sitemap.xml', import.meta.url), 'utf8'),
]);

assert.match(template, /meta name="robots" content="noindex,follow"/);
assert.match(template, /id="postTitle"/);
assert.match(template, /id="postCommentForm"/);
assert.match(template, /maxlength="200"/);
assert.match(detailScript, /data-social-post-id|socialPostId/);
assert.match(detailScript, /loadComments\(post\.id, 50\)/);
assert.match(detailScript, /body\.split\(\/\\r\?\\n\//);
assert.match(socialScript, /social_create_image_post_v2/);
assert.match(socialScript, /social_create_comment_v1/);
assert.match(socialScript, /social_remove_comment_v1/);

assert.match(migration, /create table if not exists public\.social_post_comments/);
assert.match(migration, /enable row level security/);
assert.match(migration, /char_length\(v_body\) not between 1 and 200/);
assert.match(migration, /links are not allowed in comments/);
assert.match(migration, /interval '20 seconds'/);
assert.match(migration, /social_public_seo_catalog_v1/);
assert.match(migration, /'is_mine', comment\.user_id = auth\.uid\(\)/);
assert.doesNotMatch(migration, /'creator_user_id', post\.creator_user_id/);

assert.match(generator, /social_public_seo_catalog_v1/);
assert.match(generator, /@type': 'SocialMediaPosting'/);
assert.match(generator, /@type': 'ImageObject'/);
assert.match(generator, /InteractionCounter/);
assert.match(generator, /meta name="robots" content="index,follow"/);
assert.match(generator, /social-seo-posts:start/);
assert.match(generator, /removeStalePostPages/);
assert.match(generator, /\/posts\/\$\{encodeURIComponent\(id\)\}\//);
assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
assert.match(workflow, /node scripts\/generate-social-seo-pages\.mjs/);
assert.match(workflow, /git add posts sitemap\.xml/);
assert.match(workflow, /group: generate-seo-pages/);
assert.match(marketWorkflow, /group: generate-seo-pages/);
assert.match(sitemap, /social-seo-posts:start[\s\S]*social-seo-posts:end/);

const rendered = staticPage(template, {
  id: '11111111-1111-4111-8111-111111111111',
  title: '夜の街 <テスト>',
  caption: 'ドット絵の説明です。',
  tags: ['街', '夜'],
  creator_display_name: '作者 & 名前',
  creator_avatar: 'mao',
  media_object_path: '11111111-1111-4111-8111-111111111111/2026-08-03/work.png',
  distribution_mode: 'free',
  derivative_allowed: true,
  like_count: 12,
  comment_count: 3,
  published_at: '2026-08-03T00:00:00Z',
  updated_at: '2026-08-03T01:00:00Z',
});
assert.match(rendered, /meta name="robots" content="index,follow"/);
assert.doesNotMatch(rendered, /meta name="robots" content="noindex,follow"/);
assert.match(rendered, /<body data-social-post-id="11111111-1111-4111-8111-111111111111">/);
assert.match(rendered, /<h1 id="postTitle">夜の街 &lt;テスト&gt;<\/h1>/);
assert.match(rendered, /<span>#街<\/span><span>#夜<\/span>/);
assert.match(rendered, /src="\/character-dots\/maousama\.png"/);
assert.match(rendered, /"@type":"SocialMediaPosting"/);
assert.match(rendered, /無料ダウンロード/);

const commentsOff = staticPage(template, {
  id: '22222222-2222-4222-8222-222222222222', title: 'コメントOFF', creator_display_name: '作者',
  media_object_path: '22222222-2222-4222-8222-222222222222/work.png', comments_enabled: false,
});
assert.match(commentsOff, /id="postCommentForm" hidden/);
assert.match(commentsOff, /この作品はコメントを受け付けていません。/);

console.log('Social comments and SEO page guards passed.');
