import { createRenderSurface } from './sprites.mjs';

/** Original scenic dressing. It reads map geometry, never simulation RNG or saves. */
export const SCENERY_MOTIFS = Object.freeze({
  meadow:['花咲く旧庭','苔むす星の石畳','白花の回廊'],
  desert:['砂に眠る太陽紋','砕けた青金のモザイク','風紋の中庭'],
  volcano:['黒曜石の花','冷えた鉱脈の広場','紫晶の断層'],
  swamp:['蛍苔の庭','古根の紋様','月光茸の群生'],
  tundra:['白霜の風配図','凍りついた星の庭','青氷の花紋']
});
const PATCHES={meadow:['#78915c','#324f3b','#b1a974'],desert:['#e4c797','#a78a65','#d2b582'],volcano:['#655363','#272c3c','#61627a'],swamp:['#254c46','#68815b','#668b7a'],tundra:['#eff0df','#94b4c5','#d4e5e3']};
function hash(x,y,seed=0){let n=Math.imul(x+113,374761393)^Math.imul(y+59,668265263)^seed;n=Math.imul(n^n>>>13,1274126177);return(n^n>>>16)>>>0;}
const biomeOf=map=>SCENERY_MOTIFS[map.biomeId]?map.biomeId:'meadow';
const px=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};
function disc(c,x,y,rx,ry,color,step=2){for(let row=-ry;row<ry;row+=step){const f=(row+step/2)/ry,span=Math.round(Math.sqrt(Math.max(0,1-f*f))*rx);if(span)px(c,x-span,y+row,span*2,step,color);}}
function stone(c,x,y,w,h,base,light,shade){px(c,x+2,y,w-4,h,base);px(c,x,y+2,w,h-4,base);px(c,x+2,y,w-5,1,light);px(c,x+w-2,y+3,1,h-5,shade);px(c,x+3,y+h-2,w-6,1,shade);}

/** Neighboring tiles share a broad tone; small details still have 16 variants. */
export function sceneryTileVariant(map,x,y){
  const coarse=hash(Math.floor(x/4),Math.floor(y/4),map.seed??42)%4;
  return coarse+4*(hash(x,y,(map.seed??42)^0x6c89cf5)%4);
}
function clearGround(map,x,y,padding=0){
  const tx=Math.floor(x/map.tile),ty=Math.floor(y/map.tile);
  if(map.cells[ty]?.[tx]!==0)return false;
  for(const p of [map.portal,map.stairs].filter(Boolean))if(Math.hypot(x-p.x,y-p.y)<padding+36)return false;
  for(const h of map.hazards??[])if(Math.hypot(x-h.x,y-h.y)<padding+h.radius+12)return false;
  return true;
}
export function buildScenery(map){
  const biome=biomeOf(map),seed=map.seed??42,tile=map.tile;
  const patches=[],paths=[],landmarks=[],props=[],motes=[];
  for(const room of map.rooms??[]){
    const cx=(room.x+room.w/2)*tile,cy=(room.y+room.h/2)*tile,n=hash(room.id,room.sector??0,seed);
    for(let k=0;k<3;k++){
      const q=hash(room.id,k,seed^0x7b41);patches.push({x:cx+((q%13)-6)*tile/9,y:cy+(((q>>>5)%11)-5)*tile/8,rx:room.w*tile*(.28+k*.025),ry:room.h*tile*(.24+k*.025),tone:(n+k)%3,phase:q%31});
    }
    // Broken low paving marks the room's former routes. All paving is walkable.
    for(const id of room.doors??[]){
      const door=map.doors?.[id];if(!door)continue;
      const dx=door.x-cx,dy=door.y-cy,steps=Math.ceil(Math.hypot(dx,dy)/19);
      for(let i=1;i<steps;i++){
        const q=hash(id,i,seed),t=i/steps,x=cx+dx*t+(q%5)-2,y=cy+dy*t+((q>>>4)%5)-2;
        if(q%5!==0&&clearGround(map,x,y))paths.push({x,y,w:12+q%7,h:9+(q>>>3)%5,variant:q%3});
      }
    }
    const candidates=[[cx,cy],[cx+tile,cy-tile],[cx-tile,cy+tile],[cx-tile,cy-tile],[cx+tile,cy+tile]];
    const point=candidates.find(([x,y])=>clearGround(map,x,y,42));
    if(point)landmarks.push({x:point[0],y:point[1],radius:42,variant:n%3,roomId:room.id,name:SCENERY_MOTIFS[biome][n%3],seed:n});
    // Small plants and crystals live against the room edge, away from gates/hazards.
    const edge=[];
    for(let y=room.y+1;y<room.y+room.h-1;y++)for(let x=room.x+1;x<room.x+room.w-1;x++){
      if(x!==room.x+1&&x!==room.x+room.w-2&&y!==room.y+1&&y!==room.y+room.h-2)continue;
      const q=hash(x,y,seed^0x5ae1),wx=(x+.5)*tile,wy=(y+.5)*tile;
      if(clearGround(map,wx,wy,12))edge.push({x:wx+(q%7)-3,y:wy+((q>>>4)%7)-3,variant:q%4,rank:q,roomId:room.id});
    }
    edge.sort((a,b)=>a.rank-b.rank);
    props.push(...edge.slice(0,4));
    for(let k=0;k<6;k++){
      const q=hash(room.id,k,seed^0x71df),x=(room.x+1.5+(q%100)/100*(room.w-3))*tile,y=(room.y+1.5+((q>>>8)%100)/100*(room.h-3))*tile;
      if(clearGround(map,x,y))motes.push({x,y,phase:(q%628)/100,speed:.3+(q%7)*.06,size:q%4===0?2:1});
    }
  }
  return {biome,patches,paths,landmarks,props,motes};
}
function paintFlowers(c,x,y,n,muted=false){
  const petal=muted?'#cbcda6':n%3===0?'#eacbc4':n%3===1?'#e4dba6':'#b8d6e2';
  px(c,x,y+2,1,4,'#4c6b44');px(c,x-2,y,5,2,petal);px(c,x,y-2,2,6,petal);px(c,x,y,1,1,'#c9ab65');px(c,x+1,y+4,3,1,'#83a061');
}
function paintLandmark(c,biome,l){
  const {x,y,variant:v,seed}=l;
  if(biome==='meadow'){
    disc(c,x,y,46,35,'#506640',3);disc(c,x-8,y-5,33,24,'#637a49',3);
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12,r=v===0?21+i%4*5:33+(i%3)*3,xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r*.8;
      if(v===0||i%3===0)paintFlowers(c,xx,yy,i);
      else stone(c,xx-5,yy-4,10,8,'#858c6b','#adb18a','#5f7054');
    }
    if(v!==0){
      for(let i=-2;i<=2;i++)stone(c,x+i*11-4,y+(i%2)*3-3,9,8,'#7e8869','#a8af89','#556d50');
      px(c,x-1,y-16,2,31,'#a7b48a');px(c,x-14,y-1,28,2,'#a7b48a');
    }
    for(let i=0;i<16;i++){const q=hash(i,v,seed),xx=x+(q%67)-33,yy=y+((q>>>8)%49)-24;px(c,xx,yy,2,4,'#83965a');px(c,xx-2,yy+2,5,1,'#91a365');}
  }else if(biome==='desert'){
    disc(c,x,y,46,35,'#b79869',3);
    for(let row=-2;row<=2;row++)for(let col=-3;col<=3;col++){
      const q=hash(col,row,seed);if(q%6===0||col*col+row*row>11)continue;
      stone(c,x+col*11-5,y+row*12-5,10,11,q%3?'#cdb17c':'#bfa071','#ead09a','#a68a5e');
    }
    for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?26:19;px(c,x+Math.cos(a)*r-2,y+Math.sin(a)*r-1,4,3,v===1?'#648d92':'#987c55');}
    for(let i=-5;i<=5;i++)px(c,x+i*2,y-Math.abs(i)*2,2,Math.max(1,20-Math.abs(i)*4),i<0?'#8ca29c':'#648c8d');
    px(c,x-3,y-3,7,7,'#d7bc7e');px(c,x-1,y-1,3,3,'#f0dba7');
    for(let i=0;i<7;i++)px(c,x-36+i*9,y+24+(i%3)*2,7,1,'#dfc18a');
  }else if(biome==='volcano'){
    disc(c,x,y,46,34,'#292d3b',3);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,r=18+(i%3)*6;
      for(let t=0;t<4;t++){const xx=x+Math.cos(a)*(r+t*3),yy=y+Math.sin(a)*(r+t*3)*.8;stone(c,xx-4,yy-3,8,6,i%2?'#525164':'#494859','#797388','#292c3c');}
    }
    for(let i=0;i<7;i++){const q=hash(i,v,seed),xx=x+(q%36)-18,yy=y+((q>>>6)%28)-14;stone(c,xx-5,yy-3,11,7,v===2?'#73617d':'#606777','#9a8ea5','#353547');px(c,xx-3,yy-2,4,1,'#a4a4b1');}
    for(let i=0;i<5;i++){px(c,x-23+i*7,y+25-i*4,5,1,'#8e758a');px(c,x-18+i*7,y+22-i*4,1,3,'#716276');}
  }else if(biome==='swamp'){
    disc(c,x,y,45,32,'#2a4943',3);disc(c,x-10,y-5,29,22,'#3a6051',3);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      for(let t=0;t<6;t++){const r=10+t*5,xx=x+Math.cos(a+t*.1)*r,yy=y+Math.sin(a+t*.1)*r*.7;px(c,xx,yy,4,2,t%2?'#6a7953':'#556845');px(c,xx,yy-1,2,1,'#95a06b');}
    }
    for(let i=0;i<15;i++){const q=hash(i,v,seed),xx=x+(q%68)-34,yy=y+((q>>>8)%46)-23;disc(c,xx,yy,4,2,'#79a288',1);px(c,xx-1,yy-1,2,1,'#b5cdb0');if(i%3===0){px(c,xx,yy-3,2,2,'#acd7cb');px(c,xx+2,yy-2,2,1,'#c6d5b9');}}
  }else{
    disc(c,x,y,47,36,'#9cbcc9',3);disc(c,x-5,y-4,38,29,'#bdd7db',3);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      for(let t=0;t<8;t++){const r=t*4,xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r*.85;px(c,xx,yy,2,2,i%2?'#e4ece3':'#7c9fb4');if(t===5){px(c,xx-3,yy-2,7,1,'#e9efe5');}}
    }
    for(let i=0;i<12;i++){const q=hash(i,v,seed),a=i*Math.PI/6,r=35+q%8;disc(c,x+Math.cos(a)*r,y+Math.sin(a)*r*.8,7,4,'#e0e8de',1);px(c,x+Math.cos(a)*r-2,y+Math.sin(a)*r*.8-2,5,1,'#f4f2e4');}
    stone(c,x-5,y-4,11,9,'#b0ccd5','#f0f2e8','#8fb0c0');
  }
}
export function paintSceneryFloor(ctx,map,scenery,yScale){
  ctx.save();ctx.scale(1,yScale);ctx.beginPath();
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(map.cells[y][x]===0)ctx.rect(x*map.tile,y*map.tile,map.tile,map.tile);
  ctx.clip();
  for(const p of scenery.patches){
    ctx.globalAlpha=.14;
    for(let row=-p.ry;row<p.ry;row+=4){const f=(row+2)/p.ry,span=Math.sqrt(Math.max(0,1-f*f))*p.rx,edge=Math.sin(row*.14+p.phase)*5;px(ctx,p.x-span+edge,p.y+row,span*2,4,PATCHES[scenery.biome][p.tone]);}
  }
  ctx.globalAlpha=scenery.biome==='desert'?.54:scenery.biome==='volcano'?.32:.38;
  const stonePalette=scenery.biome==='desert'?['#cdb385','#ead2a0','#a78d66']:scenery.biome==='tundra'?['#bdd3d8','#edf0e4','#91afbd']:scenery.biome==='volcano'?['#605766','#8b7b88','#323141']:scenery.biome==='swamp'?['#78836c','#a0b08f','#465e50']:['#969677','#c1bc94','#617353'];
  for(const p of scenery.paths)stone(ctx,p.x-p.w/2,p.y-p.h/2,p.w,p.h,...stonePalette);
  ctx.globalAlpha=1;
  for(const l of scenery.landmarks)paintLandmark(ctx,scenery.biome,l);
  ctx.restore();
}

const propCache=new Map();
/** A complete small environmental accent is authored inside a 32px canvas. */
export function sceneryPropSprite(biome,variant=0){
  const key=`${biome}:${variant}`;if(propCache.has(key))return propCache.get(key);
  const image=createRenderSurface(32,32),c=image.getContext('2d');c.imageSmoothingEnabled=false;
  disc(c,16,26,11,3,'#142a2a',1);
  if(biome==='meadow'){
    for(let i=0;i<6;i++){const x=5+i*4,y=21+(i%3)*2;px(c,x,y-5-i%2*3,1,10,'#426143');px(c,x-3,y-3,4,2,'#7f995a');px(c,x+1,y-5,3,2,'#91a968');}
    for(let i=0;i<3;i++)paintFlowers(c,9+i*7,12+(i%2)*5,variant+i);
    if(variant===3){stone(c,7,21,17,7,'#838d73','#b8bc92','#576c55');px(c,10,21,7,2,'#6f8a58');}
  }else if(biome==='desert'){
    if(variant%2===0){stone(c,5,17,22,11,'#b7a077','#e1c994','#8c7859');px(c,11,20,2,5,'#648b89');px(c,13,19,6,2,'#7c9c97');px(c,19,20,2,4,'#648b89');px(c,12,25,7,1,'#eedca7');}
    else{for(let i=0;i<7;i++){const x=8+i*3;px(c,x,16+i%3,1,10-i%3,'#9b8d58');px(c,x-1,14+i%3,2,3,'#d8bd7f');}px(c,7,27,19,1,'#d7ba80');}
  }else if(biome==='volcano'||biome==='tundra'){
    const ice=biome==='tundra';
    for(let i=0;i<4;i++){
      const x=5+i*6,y=25-i%2*3,h=8+(i*3+variant)%9;
      for(let row=0;row<h;row++){const w=row<3?row+1:3;px(c,x-w,y-h+row,w,1,ice?'#9cc3d4':'#67617e');px(c,x,y-h+row,w,1,ice?'#d3e8e7':'#90839f');}
      px(c,x,y-h+2,1,h-3,ice?'#f1f6e9':'#b1a7bd');
    }
    if(ice){disc(c,16,27,12,3,'#dae7df',1);px(c,7,25,9,1,'#f5f3e8');}
    else{px(c,6,27,19,1,'#44404f');px(c,12,25,6,1,'#80788e');}
  }else{
    for(let i=0;i<4;i++){const x=6+i*6,y=24-i%2*3;px(c,x,y-5-i%2*4,2,8+i%2*2,'#6d9683');disc(c,x+1,y-7-i%2*4,5,3,i%2?'#8abdb1':'#6e9c92',1);px(c,x-2,y-8-i%2*4,3,1,'#cae4cd');px(c,x+2,y-7-i%2*4,1,1,'#dcecd4');}px(c,5,27,20,1,'#405f4b');
  }
  const sprite={image,anchorX:16,anchorY:28,baseSize:32};propCache.set(key,sprite);return sprite;
}

export function sceneryMotePosition(mote,time,biome){
  const x=mote.x+Math.sin(time*mote.speed+mote.phase)*8;
  const y=mote.y+Math.cos(time*mote.speed*.7+mote.phase)*5;
  const z=biome==='tundra'?5+((mote.phase*8-time*4)%20+20)%20:biome==='volcano'?6+((time*4+mote.phase*5)%18):8+Math.sin(time*.7+mote.phase)*4;
  return {x,y,z,alpha:.22+(Math.sin(time*.9+mote.phase)+1)*.15};
}
