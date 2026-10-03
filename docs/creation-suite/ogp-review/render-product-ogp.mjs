import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const img=async path=>'data:image/png;base64,'+(await readFile(resolve(dir,path))).toString('base64');
const [logo,draw,audio,globe,piece0,piece3,piece5]=await Promise.all(['../../../assets/brand/pixieed-logo-48.png','product-materials/draw-ui.png','product-materials/audio-ui.png','product-materials/globe-ui.png','product-materials/jigsaw-piece-0.png','product-materials/jigsaw-piece-3.png','product-materials/jigsaw-piece-5.png'].map(img));
// Reuse the actual home wordmark's exact character masks and colours (js/home-play.mjs).
const FONT={P:['###','#.#','###','#..','#..'],i:['.','#','.','#','#'],X:['#.#','#.#','.#.','#.#','#.#'],E:['###','#..','##.','#..','###'],D:['##.','#.#','#.#','#.#','##.']};
const word=['P','i','X','i','E','E','D'],colors=['#e75445','#ffd35a','#8ecdf0','#ffd35a','#5fb36b','#f3a6c0','#f29b52'];
let xx=0,rects='';for(let k=0;k<word.length;k++){FONT[word[k]].forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='#')rects+=`<rect x="${(xx+x)*7}" y="${y*7}" width="7" height="7" fill="${colors[k]}"/>`;}));xx+=FONT[word[k]][0].length+1;}
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>PiXiEED OGP / product composition</title><style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;color:#fff;background:#f7f8f6}main{position:relative;width:1200px;height:630px;overflow:hidden}
.ink{position:absolute;inset:0;background:#0f1822;clip-path:polygon(0 0,57% 0,48% 100%,0 100%)}
.brand{position:absolute;left:60px;top:44px;display:flex;align-items:center;gap:20px}.logo{width:48px;height:48px;background:#05090c;border-radius:10px;image-rendering:pixelated}.word{width:${(xx-1)*7}px;height:35px}
.eyebrow{position:absolute;left:62px;top:132px;color:#aebcc8;font-size:14px;letter-spacing:.13em;font-weight:600}
h1{position:absolute;left:58px;top:176px;margin:0;font-weight:800;letter-spacing:-.045em;line-height:1.3}h1 .first{display:block;font-size:40px}h1 .second{display:block;font-size:78px;letter-spacing:-.065em;margin-top:4px}
.sub{position:absolute;left:62px;top:331px;margin:0;color:#ffd35a;font-size:31px;font-weight:700;letter-spacing:.02em}
.explain{position:absolute;left:63px;top:415px;margin:0;font-size:21px;line-height:1.8;color:#d9e1e8;font-weight:500}.explain em{font-style:normal;color:#fff;font-weight:700}.origin{display:inline-block;width:10px;height:10px;border-radius:3px;background:#e75445;margin-right:12px;vertical-align:2px}
.domain{position:absolute;left:63px;top:561px;font-size:18px;color:#a7b7c4;letter-spacing:.02em}
.editor{position:absolute;left:617px;top:44px;width:384px;border-radius:23px;background:#17232d;padding:9px;box-shadow:0 30px 70px #101e2a35,0 2px 0 #fff9 inset;z-index:3;border:1px solid #33424e}.editor header{height:34px;padding:0 8px 9px;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:700;color:#e8eef1}.editor header span{color:#ffd35a;font-size:11px;font-family:monospace}.editor img{display:block;width:364px;height:auto;border-radius:4px 4px 15px 15px;image-rendering:pixelated}
.music{position:absolute;left:834px;top:365px;width:316px;z-index:5;padding:8px;border:1px solid #30414f;border-radius:17px;background:#17232d;box-shadow:0 18px 40px #0f18224a}.music header{padding:2px 5px 10px;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:#fff}.music header .play{background:#e75445;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:10px}.music img{display:block;width:298px;height:auto;border-radius:6px;image-rendering:pixelated}
.earth{position:absolute;left:1014px;top:102px;width:166px;height:166px;overflow:hidden;border-radius:50%;box-shadow:0 16px 28px #17232d25;z-index:1;border:5px solid #fff}.earth img{position:absolute;width:188px;height:188px;left:-11px;top:-23px;object-fit:cover}.earth-label{position:absolute;left:1044px;top:279px;font-size:12px;color:#526875;font-weight:700;letter-spacing:.06em}
.piece{position:absolute;image-rendering:pixelated;filter:drop-shadow(0 12px 10px #0003);z-index:4}.p0{left:520px;top:420px;width:156px;height:156px}.p3{left:628px;top:481px;width:104px;height:104px}.p5{left:741px;top:508px;width:104px;height:104px}
.puzzle-label{position:absolute;left:661px;top:584px;font-size:13px;font-weight:700;color:#536c76;z-index:5}.bridge{position:absolute;left:536px;top:442px;width:315px;height:140px;z-index:2}.note{position:absolute;right:52px;top:38px;font-size:11px;color:#7b858d;letter-spacing:.11em;font-weight:600}
</style><main aria-label="PiXiEEDで描く、色で作曲する、絵でパズルを遊ぶ"><div class="ink"></div>
<div class="brand"><img class="logo" src="${logo}" alt="PiXiEED正式ロゴ"><svg class="word" viewBox="0 0 ${(xx-1)*7} 35" aria-label="ホーム由来のPiXiEEDワードマーク">${rects}</svg></div>
<div class="eyebrow">ブラウザで、つくってあそぶ。</div><h1 id="headline"><span class="first">一つのドットから、</span><span class="second">ひろがる。</span></h1><p id="subheadline" class="sub">ドットであそぼう</p>
<p class="explain"><span class="origin"></span><em>描いた絵が、次のあそびに。</em><br>色で作曲。自分の絵でパズル。</p><div class="domain">pixieed.jp</div>

<div class="earth"><img src="${globe}" alt="本物の地球儀画面"></div><div class="earth-label">街のドット絵を探す</div>
<svg class="bridge" viewBox="0 0 315 140" aria-hidden="true"><path d="M30 12C55 130 180 132 306 106" fill="none" stroke="#9fb8bd" stroke-width="1.5" stroke-dasharray="4 7"/></svg>
<section class="editor"><header>かんたんドット<span>32 × 32</span></header><img src="${draw}" alt="自作の風景と実際の描画道具・パレット"></section>
<img class="piece p0" src="${piece0}" alt="自作の絵から作った実パズル片"><img class="piece p3" src="${piece3}" alt=""><img class="piece p5" src="${piece5}" alt="">
<section class="music"><header>ドットで音楽<span class="play">▶</span></header><img src="${audio}" alt="実際の色の譜面と音色パレット"></section>
</main></html>`;
await writeFile(resolve(dir,'ogp-product-workbench.html'),html);
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});await page.route('**/*',r=>r.abort());await page.setContent(html);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
const checks=await page.evaluate(()=>{const h=document.querySelector('#headline').textContent,s=document.querySelector('#subheadline').textContent;const text=[...document.querySelectorAll('h1,.sub,.brand,.explain,.domain')].map(n=>{const r=n.getBoundingClientRect();return{selector:n.className||n.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};});return{headline:h,subheadline:s,textBounds:text,imageCount:document.images.length};});assert.equal(checks.headline,'一つのドットから、ひろがる。');assert.equal(checks.subheadline,'ドットであそぼう');for(const r of checks.textBounds)assert.ok(r.x>=0&&r.y>=0&&r.right<=1200&&r.bottom<=630);
await page.screenshot({path:resolve(dir,'ogp-product-workbench-1200x630.png')});await page.evaluate(()=>{document.body.style.transform='scale(.5)';document.body.style.transformOrigin='top left';});await page.setViewportSize({width:600,height:315});await page.screenshot({path:resolve(dir,'ogp-product-workbench-preview-600x315.png')});
const bytes=await readFile(resolve(dir,'ogp-product-workbench-1200x630.png'));assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),630);const record={...checks,width:1200,height:630,source:'current local UI, official logo, exact home wordmark, self-authored landscape and score',network:'all external requests blocked',userWorks:'none',status:'review_only',generatedAt:new Date().toISOString()};await writeFile(resolve(dir,'ogp-product-workbench-verification.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));
}finally{await browser.close();}
