/** Public destinations only; editor actions and project modes have their own UI. */
export const PAGE_DESTINATIONS = Object.freeze([
  { label: 'はじめる', links: [['/', 'ホーム'], ['/tools/', 'ツール一覧']] },
  { label: 'つくる', links: [['/draw/', 'ドット絵を描く'], ['/camera/', 'カメラ・写真をドット絵に変換'], ['/audio/', '絵を描いて音楽を作る'], ['/output/', '変換・書き出し']] },
  { label: 'あそぶ', links: [['/jigsaw/', 'ジグソーパズル'], ['/play/spot-difference/', 'ドット絵間違い探し'], ['/play/hidden-object/', 'ドット絵もの探し']] },
  { label: '問題をつくる', links: [['/spot-difference/', '間違い探しをつくる'], ['/hidden-object/', 'もの探しをつくる']] },
  { label: '見つける・参加する', links: [['/globe/', '世界地図で公開作品を見る'], ['/globe/?post=1', 'ドット絵を投稿する'], ['/events/', 'ドット絵イベントを探す'], ['/stores/', '絵に会えるお店'], ['/books/', 'ドット絵の本・グッズ']] },
  { label: 'マイページ', links: [['/profile/', '自分のページ'], ['/profile/?view=posts', '投稿した絵'], ['/profile/?view=likes', 'いいねした作品'], ['/profile/?view=history', '読み取ったQR'], ['/collection/', '集めた作品']] },
  { label: '案内', links: [['/about/', 'PiXiEEDについて'], ['/guide/', '利用ガイド'], ['/privacy/', 'プライバシー']] }
].map(group => Object.freeze({ ...group, links: Object.freeze(group.links.map(link => Object.freeze(link))) })));

const canonicalPath = path => path.replace(/\/index\.html$/, '/') || '/';

/** Identify one destination, including mode/view queries, rather than marking all siblings current. */
export function currentPageDestination(location, creationMode) {
  const url = new URL(location.href || String(location), 'https://pixieed.invalid');
  let path = canonicalPath(url.pathname);
  let mode = creationMode || url.searchParams.get('mode') || 'draw';
  if (path === '/works/') path = '/globe/';
  if (path === '/pixel-camera.html' && !url.searchParams.has('standalone')) { path = '/camera/'; mode = 'camera'; }
  if (path === '/draw/') return mode === 'camera' ? '/camera/' : mode === 'audio' ? '/audio/' : '/draw/';
  if (path === '/profile/') {
    const view = url.searchParams.get('view');
    return ['posts', 'likes', 'history'].includes(view) ? `/profile/?view=${view}` : '/profile/';
  }
  if (path === '/globe/' && url.searchParams.get('post') === '1') return '/globe/?post=1';
  return PAGE_DESTINATIONS.flatMap(group => group.links).find(([href]) => href === path)?.[0] || null;
}

/** Only ordinary same-shell mode links may avoid a document navigation. */
export function creationModeDestination(href, location) {
  const origin = new URL(location.href || String(location), 'https://pixieed.invalid');
  const destination = new URL(href, origin);
  if (destination.origin !== origin.origin || destination.hash) return null;
  const path = canonicalPath(destination.pathname);
  if (path === '/camera/' || path === '/audio/') {
    if (destination.search) return null;
    return path === '/camera/' ? 'camera' : 'audio';
  }
  if (path !== '/draw/' || [...destination.searchParams.keys()].some(key => key !== 'mode')) return null;
  const mode = destination.searchParams.get('mode') || 'draw';
  return ['draw', 'camera', 'audio'].includes(mode) ? mode : null;
}
