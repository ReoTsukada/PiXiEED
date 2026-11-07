#!/usr/bin/env node
/** Original, lightweight explanatory drawings. No product imagery or reused previews. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../assets/home/', import.meta.url);
const check = process.argv.includes('--check');
const ink='#28453e', paper='#fffdf5';
const rect=(x,y,w,h,fill,rx=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const line=(x1,y1,x2,y2,color=ink,w=3,extra='')=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const label=(x,y,str,color=ink,size=12,extra='')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="700" ${extra}>${str}</text>`;
const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const arrow=(x,y,color=ink)=>`<path d="M${x} ${y}h28m-8-8 8 8-8 8" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const chip=(x,y,w,str,fill='#fffdf5',color=ink)=>rect(x,y,w,25,fill,12)+label(x+w/2,y+17,str,color,11,'text-anchor="middle"');
const pixels=(rows,x,y,size,palette)=>rows.map((r,j)=>[...r].map((p,i)=>p==='.'?'':rect(x+i*size,y+j*size,size,size,palette[p]||p)).join('')).join('');
const flower=['...gg...','..gggg..','...gg...','.rrrrrr.','rrrrrrrr','rryrryrr','.rrrrrr.','..rrrr..','...rr...'];
const flowerArt=(x,y,s)=>pixels(flower,x,y,s,{g:'#43805d',r:'#e67d6c',y:'#ffe1a0'});
const cat=['.yy...yy.','.yyy.yyy.','.yyyyyyy.','yyyyyyyyy','yybyyybyy','yyyyryyyy','.yyyyyyy.','..yyyyy..'];
const catArt=(x,y,s)=>pixels(cat,x,y,s,{y:'#efc063',b:'#36534b',r:'#d77e71'});
const mountain=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})">${rect(0,0,120,80,'#a8d5d3',4)}${circle(92,21,12,'#ffe3a0')}<path d="M0 65 40 19 78 65Z" fill="#7daba4"/><path d="m46 68 42-41 32 39v14H0V66Z" fill="#467d72"/><path d="M0 68Q35 59 63 72T120 70V80H0Z" fill="#d6e3b3"/></g>`;
const pixelMountain=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})">${pixels(['aaaaaaaaaaaa','aaaaaaaaaaaa','aaaabaaaaccc','aaabbbaaaccc','aabbbbbaaaaa','abbbbbbaadda','bbbbbbaddddd','bbbbaddddddd','eeeeeeeeeeee'],0,0,10,{a:'#a8d5d3',b:'#7daba4',c:'#ffe3a0',d:'#467d72',e:'#d6e3b3'})}</g>`;
const frame=(x,y,w,h,content,angle=0)=>`<g transform="rotate(${angle} ${x+w/2} ${y+h/2})">${rect(x,y+6,w,h,'#243d3712',14)}${rect(x,y,w,h,paper,14,`stroke="#ffffff" stroke-width="2"`)}${content}</g>`;
const svg=(name,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240" fill="none"><title>${name}</title><defs><pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" fill="none" stroke="#7daca0" stroke-opacity=".23" stroke-width="1"/></pattern><pattern id="audioGrid" width="24" height="23" patternUnits="userSpaceOnUse"><path d="M24 0H0V23" fill="none" stroke="#d9cbb5" stroke-width="1"/></pattern></defs><g font-family="-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif">${body}</g></svg>\n`;
const arts={};
arts.draw=svg('ドットを描いて、コマをつなぐ',
  `<ellipse cx="252" cy="218" rx="187" ry="12" fill="#568d731c"/>`+
  frame(71,18,293,183,
    rect(83,30,269,22,'#e6f0e6',6)+circle(95,41,3,'#8ab5a1')+circle(106,41,3,'#b2ceaa')+label(119,45,'PIXEL EDITOR','#527565',10)+
    rect(83,61,28,121,'#edf3e9',6)+[ '#e67d6c','#efc063','#43805d','#7eaea2','#8f86ba'].map((c,i)=>rect(91,69+i*21,12,12,c,3)).join('')+
    rect(120,61,165,121,'#e8f1e7',4)+rect(120,61,165,121,'url(#grid)')+flowerArt(165,79,10)+
    label(296,76,'LAYERS','#718b7f',7)+[0,1,2].map((i)=>rect(295,84+i*29,46,23,i===0?'#d7e8d9':'#edf3e9',4)+rect(302,89+i*29,11,11,i===0?'#e67d6c':'#b5d2bd',2)+line(319,94+i*29,334,94+i*29,'#9db6a7',2)).join(''),-3)+
  `<g transform="translate(267 113) rotate(34)">${rect(0,-42,14,84,'#f5c766',3)}${rect(0,-42,14,12,'#e19d93',3)}<path d="M0 42 7 56 14 42Z" fill="#f6dfba"/><path d="m4 50 3 6 3-6Z" fill="${ink}"/>${line(5,-27,5,37,'#ffe8a6',2)}</g>`+
  frame(310,128,127,85,label(322,145,'ANIMATION','#698775',8)+[0,1,2].map(i=>rect(321+i*36,153,31,32,i===1?'#e7f1df':'#f2f3e7',4)+`<g transform="translate(${325+i*36} ${158-i%2*3}) scale(.3)">${flowerArt(0,0,3.6)}</g>`).join('')+`<path d="m322 197 6-4v8Z" fill="#49866c"/>`+line(338,197,422,197,'#b2c9b3',3),5));
arts.convert=svg('同じ内容を、使いたいファイル形式へ',
  `<ellipse cx="240" cy="219" rx="172" ry="10" fill="#6975a41a"/>`+
  frame(62,25,137,151,mountain(75,39,.9)+chip(80,133,99,'PNG','#e3e9fa','#4d608e'),-5)+
  frame(281,25,137,151,mountain(294,39,.9)+chip(299,133,99,'JPG','#51689d','#ffffff'),5)+
  circle(240,99,24,'#ffffffb3')+arrow(226,99,'#586da3')+
  chip(118,191,113,'MP4 → GIF','#ffffff9c','#516492')+chip(246,191,116,'MP3 → WAV','#ffffff9c','#516492'));
arts.camera=svg('写真の風景がドット絵になる',
  `<ellipse cx="241" cy="219" rx="192" ry="10" fill="#b8775a19"/>`+
  frame(27,34,181,161,mountain(39,47,1.3)+label(118,178,'写真','#97634f',13,'text-anchor="middle"'),-4)+
  frame(272,34,181,161,pixelMountain(284,47,1.3)+label(363,178,'ドット絵','#97634f',13,'text-anchor="middle"'),4)+
  circle(240,112,22,'#fffdf5')+arrow(226,112,'#b2785e')+
  chip(168,209,144,'粗さ・色数を調整','#fffdf5','#97634f'));
arts.audio=svg('マス目に音を置いてループ曲をつくる',
  `<ellipse cx="240" cy="221" rx="179" ry="10" fill="#9b79331c"/>`+
  frame(45,23,335,183,label(64,46,'COLOR → SOUND','#95713a',10)+
    [0,1,2,3].map((n)=>rect(62,65+n*26,18,19,['#df9b6c','#8fb9aa','#b5a4cc','#e3c269'][n],4)).join('')+
    rect(91,59,264,103,'#f6f0e1',5)+rect(91,59,264,103,'url(#audioGrid)')+
    [[0,0,2],[3,0,1],[7,0,2],[1,1,2],[5,1,2],[9,1,1],[3,2,2],[8,2,2],[0,3,1],[4,3,1],[7,3,1],[10,3,1]].map(([x,y,w])=>rect(94+x*23,65+y*23,w*21,16,['#df9b6c','#8fb9aa','#b5a4cc','#e3c269'][y],3)).join('')+
    line(222,58,222,164,'#af8843',2)+`<path d="m218 57 4 6 4-6Z" fill="#af8843"/>`+
    circle(73,184,11,'#ba904d')+`<path d="m70 179 7 5-7 5Z" fill="#fffdf5"/>`+
    label(96,188,'再生して確かめる','#917447',11),-2)+
  `<g transform="translate(353 119) rotate(8)">${circle(30,39,40,'#fffdf5')}<path d="M7 38v-9a23 23 0 0 1 46 0v9" stroke="#8b724d" stroke-width="7"/>${rect(0,32,14,25,'#b38d51',6)}${rect(46,32,14,25,'#b38d51',6)}</g>`+
  chip(300,203,122,'短いループ曲','#fffdf5','#8f7041'));
arts.play=svg('2枚の絵を比べて、違いを見つける',
  `<ellipse cx="241" cy="223" rx="187" ry="10" fill="#5d68a31c"/>`+
  frame(32,31,183,161,rect(43,43,161,112,'#e8edf9',7)+catArt(80,58,9)+label(124,178,'よく見て…','#5b6493',12,'text-anchor="middle"'),-3)+
  frame(265,31,183,161,rect(276,43,161,112,'#e8edf9',7)+catArt(313,58,9)+rect(367,103,9,9,'#efc063')+rect(330,103,9,9,'#e88a7b')+circle(335,107,23,'none','stroke="#d87f70" stroke-width="3"')+label(357,178,'ちがいを発見！','#5b6493',12,'text-anchor="middle"'),3)+
  label(240,118,'？','#7f87b0',24,'text-anchor="middle"')+
  chip(146,207,188,'間違い探し・もの探し・パズル','#fffdf5','#5b6493'));
arts.community=svg('作品を見つけて、自分の作品も投稿する',
  `<ellipse cx="239" cy="223" rx="197" ry="10" fill="#427b5e19"/>`+
  frame(37,40,130,157,rect(48,51,108,104,'#d8e8d6',6)+flowerArt(70,62,8)+circle(59,177,6,'#aac9ae')+line(72,177,125,177,'#bdd2bd',4),-6)+
  frame(177,20,130,172,rect(188,31,108,117,'#e2d9eb',6)+catArt(203,54,9)+circle(199,173,6,'#b1a0c2')+line(212,173,272,173,'#d0c5da',4),0)+
  frame(317,40,130,157,mountain(327,55,.92)+line(335,153,427,153,'#edf2e7',4)+circle(339,177,6,'#acc4ce')+line(352,177,413,177,'#c4d8da',4),6)+
  chip(115,207,99,'作品を探す','#fffdf5','#4f7e62')+
  rect(228,200,139,33,'#4c8266',16)+label(297,222,'＋ 自分の絵を投稿','#fffdf5',12,'text-anchor="middle"'));
arts.globe=svg('世界地図のピンから作品やイベントを見つける',
  `<ellipse cx="240" cy="119" rx="184" ry="96" fill="#a9d1d0"/>`+
  `<g stroke="#deeddf" stroke-width="1.5" opacity=".8"><ellipse cx="240" cy="119" rx="102" ry="96"/><ellipse cx="240" cy="119" rx="48" ry="96"/><path d="M60 95h360M64 150h352M240 23v192"/></g>`+
  `<path d="m107 63 33-13 33 11 12 26-18 18-28 1-11-17-22-6ZM147 116l29 7 14 27-18 38-15-10-10-31ZM226 72l22-17 22 9 7 15 35-15 53 13 22 26-30 13-32-8-27 17-18-17-19 4-13 39-25-19-8-36ZM332 162l28-9 24 13-3 18-39 3Z" fill="#d0dfac"/>`+
  `<path d="m141 96 25 25m141-40-18 30m59 62-24-18" stroke="#487d7b" stroke-width="2" stroke-dasharray="4 5"/>`+
  frame(83,31,78,79,rect(92,40,60,50,'#f7e4c4',4)+catArt(103,45,4.5)+`<path d="m116 99 6 8 6-8Z" fill="#467c75"/>`,-6)+
  frame(296,20,85,86,rect(305,29,67,59,'#e5eed9',4)+flowerArt(321,34,4.7)+`<path d="m332 96 6 8 6-8Z" fill="#467c75"/>`,6)+
  rect(231,136,100,48,paper,9)+rect(242,146,24,26,'#d5937c',3)+line(247,144,247,149,'#8a5e55',2)+line(260,144,260,149,'#8a5e55',2)+label(275,164,'EVENT','#66817b',10)+
  chip(143,211,194,'地域から作品・イベントを発見','#fffdf5','#477979'));
arts.shop=svg('本や制作道具、ガジェットを外部ショップで探す',
  `<ellipse cx="240" cy="219" rx="206" ry="10" fill="#99744c1b"/>`+
  `<g transform="rotate(-7 104 120)">${rect(44,34,110,153,'#81ab95',6)}${rect(52,40,110,153,'#e5a17c',6)}${rect(58,40,7,153,'#c8815c')}${label(77,64,'PIXEL ART','#fff3cf',10)}${rect(78,80,69,73,'#f4c6a0',3)}${flowerArt(94,87,5.5)}${line(77,170,140,170,'#fff0cc',3)}</g>`+
  `<g transform="rotate(5 226 120)">${rect(179,61,93,129,'#fff8df',7)}${rect(189,72,72,102,'#f6ecd2',3)}${rect(189,72,72,102,'url(#grid)')}${pixels(['.rr.....','rrrr....','rrrrg...','.rrggg..','...gg...','........'],200,92,7,{r:'#d8967e',g:'#7aab93'})}${line(184,78,184,174,'#c5b391',2)}${rect(250,45,10,116,'#c7a954',2)}<path d="m250 161 5 13 5-13Z" fill="#f6dfba"/></g>`+
  `<g transform="rotate(5 364 111)">${rect(301,46,121,122,'#fff9e9',13)}${rect(311,56,101,87,'#3c5d56',6)}${catArt(332,66,6.6)}${rect(336,168,52,8,'#c8b58f',4)}${circle(361,155,3,'#c8b58f')}</g>`+
  [0,1,2].map((i)=>rect(397+i*17,179-i%2*17,17,17,['#d8b153','#b899b2','#8daeb5'][i],3)).join('')+
  chip(58,211,80,'本','#fffdf5','#816348')+chip(178,211,96,'制作道具','#fffdf5','#816348')+chip(315,211,110,'ガジェット','#fffdf5','#816348'));
await mkdir(root,{recursive:true});
for (const [name,content] of Object.entries(arts)) {
  const path = new URL(`${name}.svg`,root);
  if (check) {
    if (await readFile(path,'utf8') !== content) throw new Error(`${name}.svg is out of date`);
  } else await writeFile(path,content);
}
console.log(`${check?'Verified':'Wrote'} ${Object.keys(arts).length} original home illustrations (${Object.values(arts).reduce((n,s)=>n+Buffer.byteLength(s),0)} bytes).`);
