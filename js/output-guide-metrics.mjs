/** Finite public-page metrics only. Never accept URLs, file names, text or IDs as dimensions. */
export const OUTPUT_GUIDE_SLUGS = Object.freeze([
  'output', 'output-text', 'output-gif-speed', 'output-formats',
  ...['qoi', 'tga', 'tiff', 'ico', 'netpbm', 'aiff', 'au', 'bmp'].map(slug => `output-formats-${slug}`)
]);
const targets = new Set(['choose', 'png', 'jpeg', 'webp', 'gif', 'apng', 'svg', 'bmp', 'tiff', 'tga', 'qoi', 'ico', 'ppm', 'pgm', 'pbm', 'pam', 'wav', 'aiff', 'au']);
export function publicGuideSlug(pathname) {
  if (typeof pathname !== 'string') return null;
  const path = pathname.replace(/index\.html$/, '');
  if (!/^\/output\/(?:text\/|gif-speed\/|formats\/(?:[a-z]+\/)?)?$/.test(path)) return null;
  const slug = path.split('/').filter(Boolean).join('-');
  return OUTPUT_GUIDE_SLUGS.includes(slug) ? slug : null;
}
export function guideEntryParameters(pathname, input = {}) {
  const slug = publicGuideSlug(pathname);
  if (!slug) return null;
  return { guide_slug: slug, target_format: targets.has(input?.target_format) ? input.target_format : 'choose' };
}
export function guideLinkTarget(href) {
  try {
    const url = new URL(href, 'https://pixieed.jp');
    if (url.origin !== 'https://pixieed.jp' || url.pathname !== '/output/work/' || url.searchParams.has('id') || url.searchParams.has('file')) return null;
    const values = url.searchParams.getAll('to');
    return values.length === 1 && targets.has(values[0]) ? values[0] : 'choose';
  } catch { return null; }
}
