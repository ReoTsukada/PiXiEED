import { getCellById } from './geometry.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function publicImageUrl(projectUrl, path) {
  if (typeof path !== 'string' || path.length > 512 || path.startsWith('/') ||
    path.split('/').some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) return null;
  try {
    const url = new URL(projectUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return `${url.origin}/storage/v1/object/public/social-posts/${path.split('/').map(encodeURIComponent).join('/')}`;
  } catch { return null; }
}

/** A placed showcase keeps its original post, public image, and author credit. */
export function projectLegacyShowcase(point, post, projectUrl) {
  if (!point || !post || !UUID.test(String(point.social_post_id || '')) || point.social_post_id !== post.id ||
    post.status !== 'published' || post.post_kind !== 'image' || post.distribution_mode !== 'showcase') return null;
  const imageUrl = publicImageUrl(projectUrl, post.media_object_path);
  const publishedAt = Date.parse(post.published_at);
  if (!imageUrl || !Number.isFinite(publishedAt)) return null;
  try {
    const cell = getCellById(String(point.globe_cell_id || ''));
    return Object.freeze({
      id: `showcase:${post.id}`,
      title: String(post.title || post.caption || '公開作品').slice(0, 160),
      caption: String(post.caption || '').slice(0, 180),
      postKind: 'pixel_art',
      image: { dataUrl: imageUrl, width: 32, height: 32, colorCount: 0 },
      pin: { latitude: cell.center.latitude, longitude: cell.center.longitude, cellId: cell.id, source: 'cell' },
      author: { id: '', name: String(post.creator_display_name || '作者').slice(0, 80) },
      status: 'published',
      createdAt: publishedAt,
    });
  } catch { return null; }
}
