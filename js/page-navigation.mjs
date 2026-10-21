/** Public destinations only; editor actions and project modes have their own UI. */
export const PAGE_DESTINATIONS = Object.freeze([
  { label: 'はじめる', links: [
    ['/', 'ホーム', 'PiXiEEDのトップページです。', 'home'],
    ['/tools/', 'ツール一覧', '使いたいツールを選びます。', 'tools'],
  ] },
  { label: 'つくる', links: [
    ['/draw/', 'ドット絵を描く', 'キャンバスでドット絵を描きます。', 'artwork'],
    ['/camera/', 'カメラ・写真をドット絵に変換', '撮影や画像の読み込みから変換します。', 'camera'],
    ['/audio/', '絵を描いて音楽を作る', 'マス目に色を置いてループ曲を作ります。', 'music'],
    ['/output/', '画像・音声の書き出し', '画像の形式変換や音声・動画の保存をします。', 'artwork'],
  ] },
  { label: '遊ぶ', links: [
    ['/jigsaw/', 'ジグソーパズル', 'ピクセル絵のパズルで遊びます。', 'jigsaw'],
    ['/play/spot-difference/', 'ドット絵間違い探し', '2つの絵を見比べて違いを探します。', 'spot-difference'],
    ['/play/hidden-object/', 'ドット絵もの探し', '絵の中に隠れたものを探します。', 'hidden-object'],
  ] },
  { label: '問題をつくる', links: [
    ['/spot-difference/', '間違い探しをつくる', '自分の絵で間違い探しを作ります。', 'spot-difference'],
    ['/hidden-object/', 'もの探しをつくる', '自分の絵でもの探しを作ります。', 'hidden-object'],
  ] },
  { label: '作品・イベントを探す', links: [
    ['/globe/', '世界地図で公開作品を見る', '地図から公開された作品を見つけます。', 'globe'],
    ['/globe/?post=1', 'ドット絵を投稿する', '作品を地図に投稿します。', 'add'],
    ['/events/', 'ドット絵イベントを探す', '開催されるイベントを探します。', 'telescope'],
    ['/stores/', '絵に会えるお店', 'ドット絵に出会えるお店を探します。', 'artwork'],
    ['/books/', 'ドット絵の本・グッズ', 'ドット絵に関する本やグッズを見ます。', 'artwork'],
  ] },
  { label: '自分のページ', links: [
    ['/profile/', '自分のページ・概要', '投稿や見つけた作品をまとめて確認します。', 'profile'],
    ['/profile/?view=posts', '投稿した絵', '自分が投稿した作品を見ます。', 'artwork'],
    ['/profile/?view=likes', 'いいねした作品', 'いいねした作品を見返します。', 'artwork'],
    ['/profile/?view=history', '読み取ったQR', '読み取ったQRの履歴を確認します。', 'now'],
    ['/collection/', '見つけた作品の記録', 'QRから見つけた作品を一覧で見ます。', 'artwork'],
  ] },
  { label: 'PiXiEEDの案内', links: [
    ['/about/', 'PiXiEEDについて', 'サービスの内容を紹介します。', 'home'],
    ['/guide/', '利用ガイド', '基本的な使い方を確認します。', 'tools'],
    ['/privacy/', 'プライバシー', '個人情報とデータの扱いを確認します。', 'profile'],
  ] }
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
