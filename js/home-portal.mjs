/**
 * PiXiEED home: small, local-only intent finder.
 * Search text stays in the browser. No API, account, upload or query analytics.
 */
export const HOME_DESTINATIONS = Object.freeze([
  { title:'ドット絵を描く', href:'/tools/start/draw/', group:'制作', terms:'ドット ピクセル アニメ イラスト 絵を描く レイヤー えをかく drawing art pixel draw' },
  { title:'写真をドット絵にする', href:'/tools/start/camera/', group:'制作', terms:'カメラ 写真 撮影 加工 ピクセル化 pixel camera photo filter' },
  { title:'音楽をつくる', href:'/tools/start/audio/', group:'制作', terms:'音 音楽 効果音 BGM ループ 作曲 audio music sound' },
  { title:'ファイルを変換する', href:'/tools/start/convert/', group:'変換', terms:'変換 画像 動画 音声 gif png jpg jpeg webp mp4 mp3 wav svg qoi tga tiff ico bmp テキスト 文字 convert format' },
  { title:'文字から画像・文字アート', href:'/output/text/', group:'変換', terms:'文字 アスキー アスキーアート text ascii braille 点字 メモ txt 復元 base64' },
  { title:'GIFの速度を変える', href:'/output/gif-speed/', group:'変換', terms:'gif 動画 アニメ フレーム 速度 再生 スピード' },
  { title:'形式から探す', href:'/output/formats/', group:'変換', terms:'拡張子 形式 qoi tga tiff ico netpbm pbm pgm ppm pam aiff au bmp' },
  { title:'QOIを変換', href:'/output/formats/qoi/', group:'変換', terms:'qoi png 画像 rgba' },
  { title:'TIFFを変換', href:'/output/formats/tiff/', group:'変換', terms:'tiff tif 画像' },
  { title:'ICOを変換', href:'/output/formats/ico/', group:'変換', terms:'ico アイコン favicon' },
  { title:'BMPを変換', href:'/output/formats/bmp/', group:'変換', terms:'bmp bitmap' },
  { title:'TGAを変換', href:'/output/formats/tga/', group:'変換', terms:'tga 画像' },
  { title:'AIFFを変換', href:'/output/formats/aiff/', group:'変換', terms:'aiff 音声' },
  { title:'AUを変換', href:'/output/formats/au/', group:'変換', terms:'au sun 音声' },
  { title:'Netpbmを変換', href:'/output/formats/netpbm/', group:'変換', terms:'netpbm pbm pgm ppm pam' },
  { title:'ジグソーパズル', href:'/tools/start/jigsaw/', group:'遊ぶ・制作', terms:'パズル ピース ジグソー puzzle jigsaw' },
  { title:'間違い探しで遊ぶ', href:'/play/spot-difference/', group:'遊ぶ', terms:'間違い探し ちがい spot difference' },
  { title:'もの探しで遊ぶ', href:'/play/hidden-object/', group:'遊ぶ', terms:'かくし絵 隠れたもの もの探し hidden object' },
  { title:'間違い探しを作る', href:'/tools/start/spot-difference/', group:'制作', terms:'間違い探し 作成 つくる spot difference' },
  { title:'もの探しを作る', href:'/tools/start/hidden-object/', group:'制作', terms:'かくし絵 作成 つくる hidden object' },
  { title:'ゲームで遊ぶ', href:'/play/', group:'遊ぶ', terms:'ゲーム 遊び パズル play game' },
  { title:'PixFiND', href:'/pixfind/', group:'遊ぶ', terms:'ピックスファインド ピクスファインド 間違い探し pixfind' },
  { title:'望遠鏡', href:'/telescope/', group:'遊ぶ', terms:'星 月 空 宇宙 telescope' },
  { title:'みんなの作品・SNS', href:'/explore/', group:'コミュニティ', terms:'sns コミュニティ 投稿 作品 作者 検索 フィード いいね 保存 explore' },
  { title:'地図で作品を見る', href:'/globe/', group:'見つける', terms:'地図 マップ 世界 ドットマップ globe map' },
  { title:'イベント', href:'/events/', group:'見つける', terms:'展示 出展 催し イベント event' },
  { title:'お店', href:'/stores/', group:'見つける', terms:'ショップ お店 店舗 カフェ store' },
  { title:'本・グッズ', href:'/books/', group:'見つける', terms:'本 ブック 書籍 グッズ 商品 books' },
  { title:'コレクション', href:'/collection/', group:'自分', terms:'qr 保存 記録 集める collection' },
  { title:'マイページ', href:'/profile/', group:'自分', terms:'自分 アカウント 投稿 履歴 プロフィール ログイン profile' },
  { title:'ツール一覧', href:'/tools/', group:'入口', terms:'全て 全部 一覧 ツール 道具 tools' },
  { title:'使い方・ガイド', href:'/guide/', group:'案内', terms:'使い方 ガイド 初心者 操作 方法 guide' },
  { title:'ヘルプ', href:'/help/', group:'案内', terms:'困った 質問 help 問い合わせ' },
  { title:'PiXiEEDについて', href:'/about/', group:'案内', terms:'説明 何ができる about' },
]);
export function normalizeHomeQuery(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g,' ').trim().slice(0,100);
}
export function findHomeDestinations(query, limit = 5) {
  const q = normalizeHomeQuery(query);
  if (!q) return [];
  const tokens = q.split(/[\s,、・]+/).filter(Boolean);
  if (!tokens.length) return [];
  const matches = [];
  for (let i=0;i<HOME_DESTINATIONS.length;i++) {
    const item = HOME_DESTINATIONS[i];
    const title = normalizeHomeQuery(item.title);
    const terms = normalizeHomeQuery(item.terms);
    const group = normalizeHomeQuery(item.group);
    if (!tokens.every(token => title.includes(token) || terms.includes(token) || group.includes(token))) continue;
    let score = 0;
    for (const token of tokens) {
      score += title === token ? 110 : title.startsWith(token) ? 55 : title.includes(token) ? 32 : 0;
      score += terms.split(' ').includes(token) ? 18 : terms.includes(token) ? 7 : 0;
      score += group.includes(token) ? 5 : 0;
    }
    matches.push({ item, score, order:i });
  }
  return matches.sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,Math.max(0,Math.min(10,limit))).map(x=>x.item);
}
export function initHomePortal(doc=globalThis.document, win=globalThis.window) {
  const input=doc?.getElementById?.('portal-query');
  const results=doc?.getElementById?.('portal-results');
  if (!input || !results) return null;
  let found=[];
  const setOpen=open=>{
    results.hidden=!open;
    input.setAttribute('aria-expanded',String(open));
  };
  const render=()=>{
    found=findHomeDestinations(input.value);
    results.replaceChildren();
    if (!normalizeHomeQuery(input.value)) { setOpen(false);return; }
    if (!found.length) {
      const empty=doc.createElement('p');
      empty.className='portal-search-empty';
      empty.textContent='見つかりません。ほかの言葉か「すべての機能・ページ」を試してください。';
      results.append(empty);
      setOpen(true);
      return;
    }
    for(const {title,href,group} of found){
      const a=doc.createElement('a');a.href=href;a.className='portal-search-result';
      const label=doc.createElement('span');label.textContent=title;
      const note=doc.createElement('small');note.textContent=group;
      const arrow=doc.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
      a.append(label,note,arrow);results.append(a);
    }
    setOpen(true);
  };
  input.addEventListener('input',render);
  input.addEventListener('focus',()=>{if(input.value.trim())render()});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){setOpen(false);return}
    if(event.key==='ArrowDown'&&!results.hidden){const link=results.querySelector('a');if(link){event.preventDefault();link.focus()}}
    if(event.key==='Enter'&&!event.isComposing&&found.length&&!results.hidden){
      event.preventDefault();win.location.assign(found[0].href);
    }
  });
  results.addEventListener('keydown',event=>{
    if(event.key==='Escape'){setOpen(false);input.focus();return}
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    const links=[...results.querySelectorAll('a')];
    const at=links.indexOf(doc.activeElement);
    if(at===-1)return;
    event.preventDefault();
    (links[Math.min(links.length-1,Math.max(0,at+(event.key==='ArrowDown'?1:-1)))]||input).focus();
  });
  doc.addEventListener('pointerdown',event=>{
    if(!input.contains(event.target)&&!results.contains(event.target))setOpen(false);
  });
  return { render, getResults:()=>found };
}
if(typeof document!=='undefined')initHomePortal();
