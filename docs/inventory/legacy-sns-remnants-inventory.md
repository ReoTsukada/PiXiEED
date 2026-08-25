# Legacy SNS Remnants Inventory — WP-092 handoff

Status: inventory only. No SNS file, Route, Database object, Storage object, URL, or migration was
deleted or changed by WP-092. Classification is a handoff hypothesis, not approval for removal.

| Evidence | Current relation | Preliminary classification | Next SNS Track action |
| --- | --- | --- | --- |
| `index.html`, `scripts/home-social-feed.js`, `scripts/social-posts.js`, `site/home-social.css` | Root home embeds social feed, compose dialog, likes, and current social API | ADAPT | Compare feed/Card contract with Core Card/SNS specification; preserve current route until adapter gate |
| `post/index.html`, `post/post.js`, `post/post.css` | `/post/` detail route has like/comment UI and loads `scripts/social-posts.js` | ADAPT | Inventory public URL, OGP, comment and moderation compatibility before replacement |
| `pixfind/app.js` | Published puzzle cards read social post/like state through `window.PiXiEEDSocialPosts` | ADAPT | Preserve PixFind-to-Card reference and test new Card projection |
| `supabase/migrations/20260803120000_social_home_feed_and_likes.sql` | Defines social post/feed/like database and RLS evidence in the dirty worktree | UNKNOWN | Confirm applied state, table/RPC/RLS dependencies, and rollback before reuse or replacement |
| `supabase/migrations/20260803130000_social_comments_and_seo.sql` | Defines comments/SEO-related database and RLS evidence in the dirty worktree | UNKNOWN | Compare comment, OGP, and public URL contract with future SNS Track |
| `supabase/migrations/20260803145639_social_post_content_metadata.sql` | Defines social post content metadata/trigger evidence in the dirty worktree | UNKNOWN | Confirm source table, trigger, and Market/PixFind dependencies before any change |
| `market/item.html`, `market/index.html`, related Market scripts | Existing Market cards/items expose social/share/favorite-adjacent UI | UNKNOWN | Keep Market Product/Purchase boundary separate; do not treat UI similarity as SNS ownership |

## Current reference signals

- Existing root and `/post/` pages reference the social scripts and cache-buster
  `20260803-social-seo-comments1`.
- `pixfind/app.js` references social post IDs and like state for published puzzles.
- Current migration files are repository evidence only; WP-092 did not apply or verify production
  Database/RLS state.
- No Storage bucket or live production object count was inferred from this static inventory.

## Classification rules for SNS Track

```text
REUSE          proven compatible contract with unchanged ownership/privacy semantics
ADAPT          active reference or useful behavior requiring a Core Card/SNS adapter
REPLACE        current behavior conflicts with the new specification but dependency is known
DELETE_CANDIDATE no runtime/DB/Storage/public-URL dependency proven after scoped audit
UNKNOWN        evidence incomplete; retain
```

The presence of a file name, an old route, or a visually similar component is not proof of safe
deletion. The next SNS Work Package must reconcile Post/Comment/Follow/Like/Notification, RLS,
Storage, OGP, User Profile, Market Card, Moderation, Analytics, and public URL dependencies.
