#!/usr/bin/env node
/** Maintained, finite format references. No pair-per-keyword or query-string pages.
 * Generated into the existing build directory; repository templates remain untouched.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversionHref, CONVERSION_TARGETS, FORMAT_GUIDES } from '../js/creation/conversion-intent.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://pixieed.jp';
const start = '/output/work/?mode=convert';
const css = '/css/conversion-references.css?rev=20261028-discovery-1';
const catalogPath = 'data/conversion-format-guides.json';
export const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const e = escapeHtml;
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const pathFor = slug => `/output/formats/${slug ? slug + '/' : ''}`;
const link = (href, text) => `<a href="${e(href)}">${e(text)}</a>`;
const para = text => `<p>${e(text)}</p>`;

export function validateCatalog(catalog) {
  if (!catalog || catalog.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(catalog.updated)) throw new Error('Invalid catalog version/date');
  if (!Array.isArray(catalog.guides) || catalog.guides.length !== 8) throw new Error('Review the explicit eight-format scope before expanding');
  const slugs = new Set();
  for (const guide of catalog.guides) {
    if (!FORMAT_GUIDES.includes(guide.slug) || slugs.has(guide.slug)) throw new Error('Invalid/duplicate slug');
    slugs.add(guide.slug);
    if (!Object.hasOwn(CONVERSION_TARGETS, guide.target)) throw new Error('Invalid target');
    for (const key of ['name','title','description','lead','input','output','loss','tip']) if (typeof guide[key] !== 'string' || guide[key].length < 2) throw new Error(`Missing ${guide.slug}.${key}`);
    if (!['image','audio'].includes(guide.category) || !guide.routes?.length || !guide.faq?.length) throw new Error('Missing useful format content');
    if (!guide.extensions?.every(value => /^\.[a-z0-9]+$/.test(value))) throw new Error('Invalid extension');
    for (const r of guide.routes) if (!r.from || !Object.hasOwn(CONVERSION_TARGETS, r.to.toLowerCase()) || !r.note) throw new Error('Invalid route');
  }
  for (const g of catalog.guides) for (const related of g.related) if (!slugs.has(related) || related === g.slug) throw new Error('Invalid related format');
  return catalog;
}
function breadcrumbs(items) {
  return `<nav class="format-breadcrumbs" aria-label="パンくずリスト">${items.map((item, i) => (i ? '<span aria-hidden="true">/</span>' : '') + (i === items.length - 1 ? `<span aria-current="page">${e(item.name)}</span>` : link(item.path, item.name))).join('')}</nav>`;
}
function schemaFor({title,description,path,items,date,index=false}) {
  const url = origin + path;
  return { '@context':'https://schema.org', '@graph':[
    { '@type': index ? 'CollectionPage' : 'TechArticle', '@id':url+'#page', url, name:title, headline:title,
      description, inLanguage:'ja', dateModified:date, isPartOf:{'@id':origin+'/output/#page'},
      author:{'@type':'Organization',name:'PiXiEED',url:origin+'/'}, breadcrumb:{'@id':url+'#breadcrumb'} },
    { '@type':'BreadcrumbList','@id':url+'#breadcrumb', itemListElement:items.map((item,i) => ({'@type':'ListItem',position:i+1,name:item.name,item:origin+item.path})) }
  ]};
}
function shell({title,description,path,items,date,content,index=false}) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f6f7f4">
  <title>${e(title)}｜PiXiEED</title>
  <meta name="description" content="${e(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${origin}${path}">
  <meta property="og:type" content="${index ? 'website' : 'article'}">
  <meta property="og:site_name" content="PiXiEED">
  <meta property="og:locale" content="ja_JP">
  <meta property="og:title" content="${e(title)}｜PiXiEED">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:url" content="${origin}${path}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${e(title)}｜PiXiEED">
  <meta name="twitter:description" content="${e(description)}">
  <link rel="icon" href="/favicon-96.png" sizes="96x96" type="image/png">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="stylesheet" href="/css/site.css?rev=20261019-site-gothic-1">
  <link rel="stylesheet" href="/css/site-header.css?rev=20261024-free-tools-1">
  <link rel="stylesheet" href="${css}">
  <script type="application/ld+json">${json(schemaFor({title,description,path,items,date,index}))}</script>
</head>
<body class="app-page conversion-reference-page" data-page="tools" data-conversion-reference="format-v1" data-output-monetization="guide-v1">
  <a class="skip-link" href="#main">本文へ移動</a>
  <header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="PiXiEED ホーム"><span class="brand-mark" aria-hidden="true">P</span><span>PiXiEED</span></a><nav class="site-nav" aria-label="メインナビゲーション"><a href="/tools/">ツール</a><a href="/output/">ファイル変換</a><a href="/output/formats/"${index?' aria-current="page"':''}>対応形式</a></nav></div></header>
  <main id="main" class="format-main">
    ${breadcrumbs(items)}
    <div class="format-content">${content}</div>
    <aside class="output-guide-ad" data-output-guide-ad aria-label="広告" hidden><p class="output-guide-ad__label">広告</p><div class="output-guide-ad__slot" data-output-guide-ad-slot></div></aside>
    <p class="format-updated">対応内容の確認日：<time datetime="${e(date)}">${e(date)}</time> · 登録不要・無料保存。元のファイルは変更しません。</p>
  </main>
  <footer class="format-footer"><a href="/output/">ファイル変換</a><a href="/tools/">ツール一覧</a><a href="/privacy/">プライバシー</a><a href="/terms/">利用規約</a><span>© PiXiEED</span></footer>
  <script type="module" src="/js/app.js?rev=20261024-common-tool-start-1"></script>
  <script type="module" src="/js/ads/output-guide-ad.mjs?rev=20261028-discovery-1"></script>
  ${index ? '<script type="module" src="/js/conversion-guide-filter.mjs?rev=20261028-discovery-1"></script>' : ''}
  <script type="module" src="/js/site-header.mjs?rev=20261024-common-tool-start-1"></script>
</body>
</html>
`;
}
export function renderGuide(guide,catalog) {
  const isAudio=guide.category==='audio', items=[{name:'ホーム',path:'/'},{name:'ファイル変換',path:'/output/'},{name:'対応形式',path:pathFor('')},{name:guide.name,path:pathFor(guide.slug)}];
  const routes=guide.routes.map((r,i)=>`<li id="conversion-${i+1}"><h3>${e(r.from)}から${e(r.to)}へ変換</h3>${para(r.note)}<a class="format-route-start" data-output-start href="${e(conversionHref(r.to.toLowerCase()))}">${e(r.to)}に変換する <span aria-hidden="true">→</span></a></li>`).join('\n');
  const related=guide.related.map(slug=>{const g=catalog.guides.find(g=>g.slug===slug);return `<li>${link(pathFor(slug),g.name+'の変換と対応条件')}</li>`;}).join('');
  const content=`<header class="format-intro"><p class="format-kicker">${isAudio?'音声':'画像'}の形式ガイド</p><h1>${e(guide.title)}</h1>${para(guide.lead)}<a class="format-start" data-output-start href="${e(conversionHref(guide.target))}">${e(guide.name.split(' / ')[0])}の変換を始める <span aria-hidden="true">→</span></a><p class="format-helper">次の画面で素材を選ぶと、対応する場合は${e(CONVERSION_TARGETS[guide.target])}を自動選択します。あとから変更できます。</p></header>
    <p class="format-limit">${e(isAudio?catalog.audioLimit:catalog.imageLimit)}</p>
    <section aria-labelledby="support-title"><h2 id="support-title">${e(guide.name)}の対応範囲</h2><dl class="format-spec"><div><dt>拡張子</dt><dd>${guide.extensions.map(e).join(' / ')}</dd></div><div><dt>読み込み</dt><dd>${e(guide.input)}</dd></div><div><dt>書き出し</dt><dd>${e(guide.output)}</dd></div><div><dt>保持しない情報</dt><dd>${e(guide.loss)}</dd></div></dl></section>
    <section aria-labelledby="routes-title"><h2 id="routes-title">この形式でできる変換</h2><ul class="format-routes">${routes}</ul></section>
    <section aria-labelledby="steps-title"><h2 id="steps-title">変換して保存する手順</h2><ol class="format-steps"><li>「変換を始める」から素材のファイルを1つ選びます。</li><li>読み込み後、保存形式を選びます。${isAudio?'PCMのビット深度':'画像サイズ・背景色など'}は詳細設定で調整できます。</li><li>「変換する」を押し、結果が表示されたら「保存する」で端末に保存します。</li></ol><aside class="format-tip"><h3>選ぶ前に確認</h3>${para(guide.tip)}</aside></section>
    <section aria-labelledby="faq-title"><h2 id="faq-title">変換できないとき・よくある質問</h2>${guide.faq.map(f=>`<details><summary>${e(f.q)}</summary>${para(f.a)}</details>`).join('\n')}</section>
    <section aria-labelledby="related-title"><h2 id="related-title">関連する保存形式</h2><ul class="format-related">${related}<li>${link(pathFor(''),'すべての対応形式と変換例を見る')}</li></ul></section>
    <div class="format-end"><a class="format-start" data-output-start href="${e(conversionHref(guide.target))}">ファイルを選んで変換</a>${link('/output/','変換ツールの案内へ戻る')}</div>`;
  return shell({title:guide.title,description:guide.description,path:pathFor(guide.slug),items,date:catalog.updated,content});
}
export function renderIndex(catalog) {
  const items=[{name:'ホーム',path:'/'},{name:'ファイル変換',path:'/output/'},{name:'対応形式',path:pathFor('')}];
  const groups=[['image','画像の変換形式'],['audio','音声の変換形式']].map(([type,title])=>`<section aria-labelledby="group-${type}"><h2 id="group-${type}">${title}</h2><ul class="format-index-list">${catalog.guides.filter(g=>g.category===type).map(g=>`<li data-format-card><h3>${link(pathFor(g.slug),g.name+'の変換')}</h3><p>${g.routes.slice(0,2).map(r=>e(`${r.from}から${r.to}`)).join(' / ')}</p>${para(g.output)}</li>`).join('\n')}</ul></section>`).join('\n');
  return shell({title:'画像・音声の変換形式一覧｜QOI・TGA・TIFF・AIFFなど',description:'QOI、TGA、TIFF、ICO、BMP、PBM・PGM・PPM・PAM、AIFF、AUの変換例と対応条件を確認。読み込みと書き出しを分けて、透過・ページ数・音声ビット深度などの制限を案内します。',path:pathFor(''),items,date:catalog.updated,index:true,content:`<header class="format-intro"><p class="format-kicker">PIXIEED CONVERT</p><h1>変換したい形式から探す。</h1><p>ファイル名に書かれた拡張子や、保存したい形式から選べます。各ページで、読み込みと書き出しの条件を確認できます。</p><a class="format-start" data-output-start href="${start}">形式を確認せずに変換を始める <span aria-hidden="true">→</span></a></header><div class="format-search" data-format-search hidden><label for="format-search">拡張子・形式名・用途で絞り込む</label><input id="format-search" type="search" data-format-filter placeholder="例：QOI、透過、音声" autocomplete="off"><p data-format-count role="status" aria-live="polite"></p><p data-format-empty hidden>一致する形式がありません。<a href="/output/">基本形式やGIF・文字変換の案内を見る</a></p></div>${groups}<section aria-labelledby="limits-title"><h2 id="limits-title">変換前に知っておくこと</h2><p>${e(catalog.imageLimit)} ${e(catalog.audioLimit)}</p><p>同じ拡張子でも内部方式が異なるため、すべてのファイルを変換できるわけではありません。作業画面には素材に合う保存形式を表示します。ブラウザーに依存する形式は、利用環境で選べる場合に対応します。</p><p>ファイルの変換は端末内で行います。原本を上書きせず、変換結果を別ファイルとして保存します。色プロファイル・EXIF・音声タグ・レイヤーなどは保持しません。</p><p>HEIC/HEIF・PSD・カメラRAWの入力、MP3への出力は未対応です。未対応の変換をできるものとして案内しません。</p><p>${link('/output/','PNG・JPEG・WebP・GIF・動画合成を含む変換案内へ')}</p></section>`});
}
function replaceBlock(source,id,block,insert) {
  const start=`<!-- ${id}:start -->`, end=`<!-- ${id}:end -->`, wrapped=`${start}\n${block}\n${end}`;
  const a=source.indexOf(start), b=source.indexOf(end);
  if (a>=0 || b>=0) { if(a<0||b<a)throw new Error(`Incomplete ${id} marker`); return source.slice(0,a)+wrapped+source.slice(b+end.length); }
  return insert(source,wrapped);
}
function replaceOnce(source,pattern,replacement,label) {
  const matches=[...source.matchAll(new RegExp(pattern.source,pattern.flags.replace('g','')+'g'))];
  if(matches.length!==1)throw new Error(`${label}: expected exactly one anchor, found ${matches.length}`);
  return source.replace(pattern,replacement);
}
export function integrateOutput(html,catalog) {
  if (!html.includes('data-output-monetization="guide-v1"') || !html.includes('mode=convert')) throw new Error('Unexpected output guide; stop rather than replace a changed layout');
  if(!html.includes(css))html=html.replace('</head>',`  <link rel="stylesheet" href="${css}">\n</head>`);
  const block=`<nav class="conversion-reference-links" aria-label="形式別の変換ガイド">\n  <span>形式別の変換例：</span> ${catalog.guides.map(g=>link(pathFor(g.slug),g.name)).join(' ')} ${link(pathFor(''),'一覧を見る')}\n</nav>`;
  return replaceBlock(html,'conversion-references',block,(source,value)=>replaceOnce(source,/<details id="guide-format-details"/,`${value}\n      <details id="guide-format-details"`,'format summary'));
}
export function integrateSitemap(xml,catalog) {
  if(!xml.includes('<urlset ')||!xml.includes('</urlset>'))throw new Error('Expected sitemap urlset');
  const urls=[pathFor(''),...catalog.guides.map(g=>pathFor(g.slug))].map(path=>origin+path);
  for(const url of urls) {
    const pattern=new RegExp(`<url>\\s*<loc>${url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}</loc>[\\s\\S]*?</url>`,'g');
    const entries=xml.match(pattern)||[];
    if(entries.length>1)throw new Error('Duplicate reference URL in sitemap');
    const entry=`<url><loc>${url}</loc><lastmod>${catalog.updated}</lastmod></url>`;
    xml=entries.length?xml.replace(pattern,entry):xml.replace('</urlset>',`  ${entry}\n</urlset>`);
  }
  // This date reflects this content update, not the build date of unrelated pages.
  xml=xml.replace(/<url>\s*<loc>https:\/\/pixieed.jp\/output\/<\/loc>[\s\S]*?<\/url>/,`<url><loc>${origin}/output/</loc><lastmod>${catalog.updated}</lastmod></url>`);
  return xml;
}
export async function generateConversionGuides({root=projectRoot,write=false}={}) {
  const read=path=>readFile(resolve(root,path),'utf8');
  const catalog=validateCatalog(JSON.parse(await read(catalogPath)));
  const outputs=new Map([[pathFor('').slice(1)+'index.html',renderIndex(catalog)],...catalog.guides.map(g=>[pathFor(g.slug).slice(1)+'index.html',renderGuide(g,catalog)])]);
  outputs.set('output/index.html',integrateOutput(await read('output/index.html'),catalog));
  outputs.set('output/sitemap.xml',integrateSitemap(await read('output/sitemap.xml'),catalog));
  const changed=[];
  for(const [path,content] of outputs) {
    const previous=await read(path).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(path.startsWith('output/formats/')&&previous&&!previous.includes('data-conversion-reference="format-v1"'))throw new Error(`Refusing to overwrite an independently authored page: ${path}`);
    if(previous!==content)changed.push(path);
  }
  // Validate every target before writing anything. No files are removed.
  if(write)for(const path of changed){await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),outputs.get(path));}
  return {pages:catalog.guides.length+1,routes:catalog.guides.reduce((n,g)=>n+g.routes.length,0),changed};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==4||process.argv[2]!=='--output')throw new Error('Usage: node scripts/generate-conversion-guides.mjs --output <built directory>');
  console.log(JSON.stringify(await generateConversionGuides({root:resolve(process.argv[3]),write:true}),null,2));
}
