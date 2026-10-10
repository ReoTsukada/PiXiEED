const esc = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export const TOOL_OGP_CARDS = Object.freeze([
  { name: 'draw', title: 'ドット絵を描く', icon: 'artwork', alt: '画像を表す線画アイコン' },
  { name: 'camera', title: '写真をドット絵に変換', icon: 'camera', alt: '写真変換を表すカメラの線画アイコン' },
  { name: 'audio', title: '音をつくる', icon: 'music', alt: '音楽を表す音符の線画アイコン' },
  { name: 'output', title: '画像・動画と音楽を合成', icon: 'output', alt: '画像と音楽の合成を表す線画アイコン' },
  { name: 'jigsaw', title: 'ジグソーパズル', icon: 'jigsaw', alt: 'ジグソーパズルのピースの線画アイコン' },
  { name: 'spot-game', title: 'ドット絵間違い探し', icon: 'spot-difference', alt: '二枚の絵を見比べる線画アイコン' },
  { name: 'find-game', title: 'ドット絵もの探し', icon: 'hidden-object', alt: '絵の中からものを探す線画アイコン' },
  { name: 'globe', title: '世界地図で作品を探す', icon: 'globe', alt: '世界地図の線画アイコン' },
  { name: 'events', title: 'ドット絵イベント', icon: 'calendar', alt: 'イベントの日付を示すカレンダーの線画アイコン' },
  { name: 'stores', title: '作品に会えるお店', icon: 'store', alt: '作品に会えるお店の線画アイコン' },
].map((card) => Object.freeze({ ...card })));

export const TOOL_OGP_EXTRA_ICONS = Object.freeze({
  output: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><g stroke="#0B232F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="13" height="12" rx="1.5"/><path d="m4.5 13 3.2-3.2 2.4 2.4 2.1-2.1 2 2"/><path d="M18 17V8L22 7V15M18 10L22 9"/><ellipse cx="17" cy="18" rx="1.5" ry="1.1"/><ellipse cx="21" cy="16" rx="1.5" ry="1.1"/></g></svg>`,
  camera: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><g stroke="#0B232F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7l2-3h6l2 3M5.5 10h1"/><circle cx="12" cy="13" r="4"/></g></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><g stroke="#0B232F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 9h18"/><circle cx="8" cy="13" r=".7"/><circle cx="12" cy="13" r=".7"/><circle cx="16" cy="13" r=".7"/><circle cx="8" cy="17" r=".7"/><circle cx="12" cy="17" r=".7"/><circle cx="16" cy="17" r=".7"/></g></svg>`,
  store: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><g stroke="#0B232F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v11h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M8 21v-6h5v6M16 16h2v2h-2Z"/></g></svg>`,
});

export function toolOgpMarkup(card, { logoData, iconData } = {}) {
  if (!card || typeof card.title !== 'string' || typeof card.icon !== 'string') {
    throw new TypeError('toolOgpMarkup requires a card with title and icon');
  }
  if (typeof logoData !== 'string' || !logoData.startsWith('data:image/')) {
    throw new TypeError('toolOgpMarkup requires logoData image data URI');
  }
  if (typeof iconData !== 'string' || !iconData.startsWith('data:image/')) {
    throw new TypeError('toolOgpMarkup requires iconData image data URI');
  }
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}
    body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif;color:#172333;background:#f7f4ec}
    .frame{position:relative;width:1200px;height:630px;padding:72px 86px;background:
      radial-gradient(circle at 12px 12px,rgba(16,59,80,.09) 1.5px,transparent 1.7px) 0 0/24px 24px,#f7f4ec;}
    .frame:before{content:"";position:absolute;inset:28px;border:2px solid rgba(16,59,80,.14);border-radius:24px;pointer-events:none}
    .eyebrow{position:relative;display:flex;align-items:center;gap:14px;font:700 18px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#185d78}
    .eyebrow:before{content:"";width:28px;height:7px;background:#dd6a4d;box-shadow:8px 0 #e9bd55}
    .wordmark{position:relative;margin-top:54px;font:800 78px/.98 ui-monospace,monospace;letter-spacing:-.075em;color:#103b50}
    .wordmark b{color:#dd6a4d;font-weight:800}
    .title{position:relative;width:max-content;max-width:710px;margin-top:26px;font-size:38px;font-weight:750;letter-spacing:.035em;line-height:1.35}
    .rule{position:relative;width:150px;height:8px;margin-top:32px;background:#103b50;box-shadow:12px 0 #dd6a4d,24px 0 #e9bd55}
    .tap-hint{position:absolute;left:50%;bottom:72px;transform:translateX(-50%);margin:0;font:700 28px/1.2 ui-monospace,monospace;letter-spacing:.08em;color:#185d78;white-space:nowrap;text-align:center}
    .icon-card{position:absolute;right:105px;top:158px;display:grid;place-items:center;width:264px;height:264px;border:2px solid rgba(16,59,80,.18);border-radius:34px;background:#fffdf8;box-shadow:12px 12px 0 #e9bd55}
    .icon-card:before{content:"";position:absolute;inset:17px;border:1px dashed rgba(16,59,80,.22);border-radius:22px}
    .tool-icon{position:relative;width:150px;height:150px;image-rendering:pixelated}
    .mini-logo{position:absolute;right:16px;bottom:14px;width:30px;height:30px;padding:4px;border-radius:50%;background:#103b50;image-rendering:pixelated}
  </style><body><main class="frame" data-ogp-card="${esc(card.name || '')}">
    <div class="eyebrow" data-ogp-bound="eyebrow">PIXEL CREATION STUDIO</div>
    <div class="wordmark" data-ogp-bound="brand">PiXi<b>EED</b></div>
    <div class="title" data-ogp-bound="title" aria-label="${esc(card.alt || '')}">${esc(card.title)}</div>
    <div class="rule"></div>
    <div class="tap-hint" data-ogp-bound="tap-hint">TAP TO START</div>
    <div class="icon-card" data-ogp-bound="tile"><img class="tool-icon" src="${esc(iconData)}" alt="${esc(card.alt || '')}"><img class="mini-logo" src="${esc(logoData)}" alt="PiXiEED"></div>
  </main></body></html>`;
}
