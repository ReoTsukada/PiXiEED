import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const unit = 10;
const palette = { blue: '#7797de', deepBlue: '#537bc5', teal: '#5aacac', paleTeal: '#a0d3c7', amber: '#e4bb73', pale: '#d6e5e5' };
const occupied = new Map();
const groups = {};
function cell(x,y,color,group) {
  assert.ok(Number.isInteger(x)&&Number.isInteger(y));
  assert.ok(x>=0&&y>=0&&x*unit+unit<=1200&&y*unit+unit<=630);
  const key=`${x},${y}`;
  if(occupied.has(key))return;
  const value={x:x*unit,y:y*unit,color:palette[color],group};
  assert.ok(value.color); occupied.set(key,value); (groups[group]??=[]).push(value);
}
// One square becomes an increasingly dense stream before joining formed objects.
cell(8,53,'amber','origin');
const controllerRows = [
  [10,21],[7,24],[5,26],[3,28],[2,29],[1,30],[1,30],[0,31],[0,31],
  [0,31],[0,31],[0,31],[0,31],[0,31],[0,31],[1,30],[1,30],[2,29],[3,28]
];
for(let row=0;row<controllerRows.length;row++) {
  const [from,to]=controllerRows[row];
  for(let column=from;column<=to;column++) {
    if(row>=12&&column>=11-(row-12)&&column<=20+(row-12))continue;
    // The upper-right housing is still gathering its last squares.
    if(row<5&&column>22&&((column*7+row*11)%5===0))continue;
    const face=row>=4&&row<=10&&column>=5&&column<=26;
    let color=face?'deepBlue':'teal';
    if(row===3&&column>=6&&column<=25)color='paleTeal';
    if(row>=5&&row<=9&&column>=6&&column<=10){
      if((column>=7&&column<=8)||(row>=6&&row<=7))color='pale';
    }
    if((row===5||row===6)&&(column===22||column===23))color='amber';
    if((row===8||row===9)&&(column===22||column===23))color='paleTeal';
    if((row===6||row===7)&&(column===19||column===20))color='blue';
    if((row===6||row===7)&&(column===25||column===26))color='pale';
    if(row===9&&column>=13&&column<=16)color='paleTeal';
    cell(48+column,36+row,color,'controller');
  }
}
// The eighth note: a stepped flag, a solid stem and a gently stepped note head.
for(let row=0;row<20;row++)for(let column=13;column<=15;column++)cell(85+column,17+row,'amber','music');
const flag=[[16,18],[16,20],[16,22],[17,23],[18,24],[19,24],[20,24],[21,24],[22,24],[23,24]];
for(let row=0;row<flag.length;row++)for(let column=flag[row][0];column<=flag[row][1];column++)cell(85+column,18+row,row<3?'amber':'paleTeal','music');
const head=[[4,15],[2,15],[1,15],[0,15],[0,15],[0,15],[0,14],[1,12],[3,10]];
for(let row=0;row<head.length;row++)for(let column=head[row][0];column<=head[row][1];column++){
  if(column<4&&((row*11+column*7)%7===0))continue;
  cell(85+column,36+row,column<3?'paleTeal':'amber','music');
}
// A stream, not random confetti: three colour lanes with deliberate breaks.
for(let x=14;x<=104;x++){
  const center=53-Math.floor((x-8)*0.19);
  const width=x<33?3:x<48?5:4;
  for(let dy=-width;dy<=width;dy++){
    const value=(x*31+(center+dy)*19)%23;
    const threshold=x<22?2:x<32?4:x<46?7:x<82?5:6;
    if(value>=threshold)continue;
    const y=center+dy;
    if(x>=45&&x<=80&&y>=36)continue;
    if(x>=85&&x<=110&&y<45)continue;
    cell(x,y,dy<-1?'paleTeal':dy>1?'blue':'teal','stream');
  }
}
// Squares from the unfinished controller bridge into the gathering note head.
const bridge=[
  [77,32,'teal'],[80,33,'teal'],[83,31,'paleTeal'],[84,34,'teal'],[81,36,'blue'],
  [83,38,'paleTeal'],[82,40,'blue'],[84,41,'teal'],[86,34,'amber'],[88,33,'amber'],
  [86,35,'paleTeal'],[88,35,'amber'],[90,34,'amber'],[87,37,'paleTeal'],[84,39,'teal'],
  [82,34,'teal'],[79,35,'paleTeal'],[80,31,'blue'],[85,32,'teal'],[89,31,'amber'],
];
for(const [x,y,color]of bridge)cell(x,y,color,'gathering');
const puzzle=['...###.....','...###.....','.########..','.########..','.########..','.##########','.##########','.########..','.##...###..','.##...###..'];
for(let y=0;y<puzzle.length;y++)for(let x=0;x<puzzle[y].length;x++)if(puzzle[y][x]==='#'){
  if(x<3&&y>6&&(x+y)%3===0)continue;
  cell(34+x,41+y,y<2?'amber':x<5?'paleTeal':'teal','puzzle');
}
const camera=['..####.....','.#########.','###########','###.###.###','##.#...#.##','##.#.#.#.##','##.#...#.##','###.###.###','.#########.'];
for(let y=0;y<camera.length;y++)for(let x=0;x<camera[y].length;x++)if(camera[y][x]==='#')cell(103+x,49+y,y<2?'amber':x>=3&&x<=7&&y>=3?'paleTeal':'blue','camera');
for(let y=0;y<7;y++)for(let x=0;x<9;x++){
  if(x===0||x===8||y===0||y===6)cell(89+x,51+y,'teal','picture');
  else if(x===6&&y===1)cell(89+x,51+y,'amber','picture');
  else if((y>=3&&x<=3)||(y>=4&&x<=6))cell(89+x,51+y,'blue','picture');
}
const cells=[...occupied.values()];
const logo=(await readFile(resolve(directory,'../../../assets/brand/pixieed-logo-48.png'))).toString('base64');
const themes={dark:{background:'#101e2a',text:'#f4f1e8',muted:'#a5bbc6'},light:{background:'#f4f1e8',text:'#172a38',muted:'#566b78'}};
function svg(theme){
  const t=themes[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
<title id="title">一つのドットから、ひろがる。ドットであそぼう</title>
<desc id="desc">左下の一つの四角から粒の流れが育ち、中央のコントローラーと右上の音符へ集まるPiXiEEDのグラフィックポスター。パズル、絵、写真が小さく続く。</desc>
<style>text{font-family:"Hiragino Sans","Yu Gothic",Meiryo,sans-serif}.cell{shape-rendering:crispEdges}</style>
<rect width="1200" height="630" fill="${t.background}"/>
<rect x="60" y="40" width="48" height="48" fill="#101e2a"/>
<image id="official-logo" x="60" y="40" width="48" height="48" href="data:image/png;base64,${logo}" style="image-rendering:pixelated"/>
<text x="126" y="73" fill="${t.text}" font-size="26" font-weight="700">PiXiEED</text>
<text x="1140" y="73" fill="${t.muted}" text-anchor="end" font-size="16">pixieed.jp</text>
<text id="headline" x="60" y="170" fill="${t.text}" font-size="48" font-weight="800">一つのドットから、ひろがる。</text>
<text id="subheadline" x="64" y="233" fill="${t.muted}" font-size="32" font-weight="500">ドットであそぼう</text>
<g id="composition">${cells.map(c=>`<rect class="cell" data-group="${c.group}" x="${c.x}" y="${c.y}" width="10" height="10" fill="${c.color}"/>`).join('\n')}</g>
</svg>\n`;
}
const modulePath=process.env.PIXIEED_PLAYWRIGHT_MODULE;
if(!modulePath)throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright entry module.');
const {chromium}=await import(pathToFileURL(modulePath).href);
const browser=await chromium.launch({headless:true});
const checks={unit,cells:cells.length,groups:Object.fromEntries(Object.entries(groups).map(([name,v])=>[name,v.length])),variants:{}};
try{
 const context=await browser.newContext({viewport:{width:1200,height:630},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',route=>route.abort());
 const page=await context.newPage();
 for(const theme of ['dark','light']){
  const source=svg(theme);await writeFile(resolve(directory,`ogp-pixel-poster-${theme}.svg`),source);
  await page.setViewportSize({width:1200,height:630});
  await page.setContent(`<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style>${source}`);
  await page.evaluate(()=>document.fonts.ready);
  const textBounds=await page.locator('svg text').evaluateAll(es=>es.map(e=>{const b=e.getBBox();return {text:e.textContent,x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height};}));
  for(const b of textBounds)assert.ok(b.x>=0&&b.y>=0&&b.right<=1200&&b.bottom<=630);
  assert.equal(await page.locator('#headline').textContent(),'一つのドットから、ひろがる。');
  assert.equal(await page.locator('#subheadline').textContent(),'ドットであそぼう');
  await page.screenshot({path:resolve(directory,`ogp-pixel-poster-${theme}-1200x630.png`)});
  const png=await readFile(resolve(directory,`ogp-pixel-poster-${theme}-1200x630.png`));
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1200,630]);
  const pixelChecks=await page.evaluate(async({data,cells})=>{
   const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=630;const c=canvas.getContext('2d');c.drawImage(image,0,0);const p=c.getImageData(0,0,1200,630).data;let count=0;
   for(const cell of cells){const rgb=[1,3,5].map(i=>parseInt(cell.color.slice(i,i+2),16));for(let y=cell.y;y<cell.y+10;y++)for(let x=cell.x;x<cell.x+10;x++){const o=(y*1200+x)*4;if(rgb.some((v,k)=>p[o+k]!==v)||p[o+3]!==255)throw new Error('Cell mismatch at '+x+','+y);count++;}}
   return count;
  },{data:'data:image/png;base64,'+png.toString('base64'),cells});
  await page.setViewportSize({width:600,height:315});
  await page.setContent(`<style>html,body{margin:0;width:600px;height:315px;overflow:hidden}img{display:block;width:600px;height:315px}</style><img src="data:image/png;base64,${png.toString('base64')}">`);
  await page.locator('img').evaluate(i=>i.decode());
  await page.screenshot({path:resolve(directory,`ogp-pixel-poster-${theme}-preview-600x315.png`)});
  checks.variants[theme]={textBounds,pixelChecks,width:1200,height:630};
 }
 await writeFile(resolve(directory,'ogp-pixel-poster-verification.json'),JSON.stringify({...checks,generatedAt:new Date().toISOString(),network:'blocked',status:'review_only'},null,2)+'\n');
 console.log(JSON.stringify({variants:['dark','light'],unit,cells:cells.length,pixelChecks:checks.variants.dark.pixelChecks,copy:'PASS',bounds:'PASS'}));
}finally{await browser.close();}
