/**
 * Original, code-native pixel sprites for CORE DESCENT.
 * The source atlas stores thin horizontal slices. Character poses are rendered
 * bottom-to-top into cached images; the game draws those images, not geometry.
 * No downloaded art, network access, simulation state or random generator.
 */
export const SPRITE_Y_SCALE = 0.78;
export const SPRITE_BASE_SIZE = 32;
export const SPRITE_TILE_SIZE = 32;
export const SPRITE_METADATA = Object.freeze({
  player: Object.freeze({ baseWidth:32, baseHeight:32, directions:8, frames:4, scale:1, layers:'boots, leather, cloak, face, hood' }),
  slime: Object.freeze({ baseWidth:32, baseHeight:32, directions:8, frames:4, scale:1, layers:'puddle, jelly, eyes, highlights' }),
  bat: Object.freeze({ baseWidth:32, baseHeight:32, directions:8, frames:4, scale:1, layers:'wing membrane, body, ears, eyes' }),
  skeleton: Object.freeze({ baseWidth:32, baseHeight:32, directions:8, frames:4, scale:1, layers:'feet, shins, ribs, arms, skull' }),
  warden: Object.freeze({ baseWidth:32, baseHeight:32, directions:8, frames:4, scale:1, layers:'boots, tattered cloak, chainmail, horned helm' }),
  boss: Object.freeze({ baseWidth:32, baseHeight:32, directions:8, frames:1, scale:2.5, layers:'stone base, moss, carved arms, guardian head' }),
  weapon: Object.freeze({ baseWidth:32, baseHeight:32, directions:8, frames:3, variants:10, scale:1 }),
  goblin: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  wolf: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  scarab: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  sand_archer: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  sand_worm: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  ember_bat: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  fire_imp: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  lava_golem: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  bog_slime: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  spore_shaman: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  marsh_stalker: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  frost_wolf: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  ice_archer: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  ice_guardian: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:4,scale:1}),
  elder_treant: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:2,scale:2.5}),
  dune_scorpion: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:2,scale:2.5}),
  cinder_drake: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:2,scale:2.5}),
  mire_hydra: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:2,scale:2.5}),
  frost_giant: Object.freeze({baseWidth:32,baseHeight:32,directions:8,frames:2,scale:2.5})
});

function surface(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Sprite rendering requires a Canvas2D environment.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

/** Integer scanlines retain a deliberately small, crisp pixel palette. */
function disc(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  for (let row = -Math.ceil(ry); row <= Math.ceil(ry); row++) {
    const ratio = (row + .5) / ry;
    if (Math.abs(ratio) > 1) continue;
    const span = Math.round(rx * Math.sqrt(1 - ratio * ratio));
    ctx.fillRect(Math.round(x - span), Math.round(y + row), span * 2, 1);
  }
}
function block(ctx, x, y, w, h, color, bevel = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x + bevel, y, Math.max(0, w - bevel * 2), h);
  ctx.fillRect(x, y + bevel, w, Math.max(0, h - bevel * 2));
}
function pixel(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

/** Each recipe paints original 32px slices; silhouette details differ by species. */
function monsterLayers(kind,frame,add){
  const stride=[0,2,0,-2][frame%4];
  if(['wolf','frost_wolf','marsh_stalker'].includes(kind)){
    const frost=kind==='frost_wolf',lizard=kind==='marsh_stalker';
    const dark=frost?'#465d72':lizard?'#384f3e':'#4b3d36',mid=frost?'#96bdc9':lizard?'#647c49':'#88725a',light=frost?'#d6e8df':lizard?'#b5af6a':'#b4a086';
    for(let z=1;z<=5;z+=2)add(z,`legs${z}`,c=>{for(const x of [-9,7])for(const y of [-7,5]){pixel(c,x+(y<0?stride:-stride),y,5,3,z<3?dark:mid);}});
    for(let z=6;z<=14;z+=2)add(z,`fur${z}`,c=>{block(c,-12,-7,23,14,z>11?light:mid,3);block(c,7,-5,8,10,z>11?light:mid,2);pixel(c,-16,-2,7,4,dark);if(z===10){pixel(c,12,-5,2,2,'#deb872');pixel(c,12,3,2,2,'#deb872');}if(z===14){pixel(c,7,-8,4,4,dark);pixel(c,7,4,4,4,dark);pixel(c,-7,-3,3,6,light);}});
    if(lizard||frost)add(16,'crest',c=>{for(let x=-10;x<=6;x+=4){pixel(c,x,-2,2,4,frost?'#b5eeed':'#a5a668');}if(lizard){pixel(c,-16,-1,8,2,'#7b9853');pixel(c,9,-8,4,2,'#9a9360');pixel(c,9,6,4,2,'#9a9360');}});
    return true;
  }
  if(['goblin','sand_archer','ice_archer','fire_imp','spore_shaman'].includes(kind)){
    const gob=kind==='goblin',ice=kind==='ice_archer',imp=kind==='fire_imp',shaman=kind==='spore_shaman';
    const skin=gob?'#8eae62':imp?'#c46b48':ice?'#a6cbc8':shaman?'#8ca989':'#bf9f70';
    const cloth=gob?'#775234':ice?'#537e91':imp?'#6f3e35':shaman?'#644e78':'#b18d5d';
    const bright=gob?'#b3c281':ice?'#bfd2d0':imp?'#e6a264':shaman?'#b08db2':'#e3cc99';
    for(let z=1;z<=7;z+=2)add(z,`feet${z}`,c=>{block(c,-5+stride,-8,9,5,z<3?'#352d2b':cloth);block(c,-5-stride,3,9,5,z<3?'#352d2b':cloth);});
    for(let z=8;z<=17;z+=2)add(z,`robe${z}`,c=>{block(c,-8,-9,15,18,z>13?cloth:'#48403c',2);if(shaman||ice||!gob&&!imp){block(c,-12,-10,8,20,cloth,1);pixel(c,-11,-6,2,12,bright);}block(c,1,-12,8,5,skin);block(c,1,7,8,5,skin);pixel(c,-2,-7,3,14,z>13?bright:cloth);if(!imp&&!gob){pixel(c,11,-13,2,26,'#b7a16c');if(shaman){block(c,9,-15,6,5,'#bd92ab',1);}else{pixel(c,14,-9,2,18,bright);pixel(c,12,-12,2,4,bright);pixel(c,12,8,2,4,bright);}}});
    for(let z=18;z<=24;z++)add(z,`head${z}`,c=>{block(c,-6,-7,14,14,z>22?bright:skin,2);if(z>=20&&z<=22){pixel(c,7,-5,2,3,'#312c2d');pixel(c,7,2,2,3,'#312c2d');pixel(c,9,-1,4,3,skin);}if(gob){pixel(c,-1,-12,5,6,skin);pixel(c,-1,6,5,6,skin);}if(imp){pixel(c,-3,-11,3,7,'#ecd5a3');pixel(c,-3,4,3,7,'#ecd5a3');}if(ice&&z===24){pixel(c,-6,-8,4,3,'#d7e8dd');pixel(c,-3,5,6,3,'#d7e8dd');}});
    if(shaman)for(let z=25;z<=28;z++)add(z,`mushroom${z}`,c=>{disc(c,0,0,z>26?12:15,z>26?10:13,z>26?'#b58baf':'#684b73');pixel(c,-7,-5,3,3,'#e1ceb2');pixel(c,2,-7,3,2,'#e1ceb2');pixel(c,5,3,4,3,'#e1ceb2');});
    if(imp)add(9,'tail',c=>{pixel(c,-15,-1,7,3,'#ce8350');pixel(c,-15,-5,2,6,'#e4ad6b');});
    return true;
  }
  if(kind==='scarab'){
    add(1,'legs',c=>{for(const y of [-1,1])for(let x=-10;x<=8;x+=6){pixel(c,x+stride,y<0?-13:9,5,4,'#604d37');pixel(c,x+1,y<0?-10:6,3,4,'#a88c4e');}});
    for(let z=2;z<=13;z++)add(z,`shell${z}`,c=>{const r=Math.max(7,14-Math.floor(z/3));disc(c,0,0,r,r-2,z>9?'#bdad66':z>5?'#8f8d47':'#665a38');pixel(c,-10,-1,20,2,'#514a2e');if(z===10){pixel(c,-6,-6,4,3,'#ded09b');pixel(c,6,-4,4,2,'#eac282');pixel(c,6,2,4,2,'#eac282');}});
    return true;
  }
  if(kind==='sand_worm'){
    for(let z=1;z<=28;z+=2)add(z,`segment${z}`,c=>{const radius=z<8?12:z<20?9:11;disc(c,Math.round(Math.sin(z*.2+frame)*2),0,radius,radius-2,z%6===1?'#8f6143':z>20?'#c99b68':'#b38354');if(z===27){disc(c,2,0,8,6,'#663a37');for(const y of [-5,4])for(let x=-3;x<9;x+=4)pixel(c,x,y,2,2,'#e1c69a');}});
    return true;
  }
  if(kind==='ember_bat'||kind==='cinder_drake'){
    const dragon=kind==='cinder_drake',lift=frame%2?3:0;
    add(8+lift,'wings',c=>{for(const side of [-1,1]){block(c,-10,side<0?-16:6,24,10,'#593c46',1);pixel(c,-7,side<0?-14:8,17,4,'#9a5347');pixel(c,3,side<0?-15:11,9,2,'#d08251');pixel(c,-13,side<0?-11:7,6,5,'#4a303c');}});
    for(let z=8;z<=(dragon?22:16);z+=2)add(z,`scales${z}`,c=>{block(c,-10,-6,22,12,z>14?'#b47750':'#714a41',3);block(c,7,-5,8,10,'#c09261',2);pixel(c,-16,-2,8,4,'#8b523e');if(z>12){pixel(c,12,-4,2,2,'#f7d494');pixel(c,12,2,2,2,'#f7d494');}});
    if(dragon){for(let z=1;z<=7;z+=2)add(z,`claws${z}`,c=>{for(const x of [-9,5]){pixel(c,x,-11,7,4,'#8b6451');pixel(c,x,7,7,4,'#8b6451');pixel(c,x+5,-10,2,2,'#dfc79c');pixel(c,x+5,8,2,2,'#dfc79c');}});add(24,'horns',c=>{pixel(c,2,-9,3,6,'#e5bd80');pixel(c,2,3,3,6,'#e5bd80');for(let x=-12;x<=2;x+=4)pixel(c,x,-1,2,3,'#da9659');});}
    return true;
  }
  if(kind==='lava_golem'||kind==='ice_guardian'||kind==='frost_giant'){
    const ice=kind!=='lava_golem',giant=kind==='frost_giant';
    const dark=ice?'#49687c':'#3f3c45',mid=ice?'#83aeba':'#625963',light=ice?'#c4dce0':'#9e7260',glow=ice?'#dbf6e9':'#f0aa69';
    for(let z=1;z<=8;z+=2)add(z,`feet${z}`,c=>{block(c,-9+stride,-12,15,9,z<4?dark:mid,2);block(c,-9-stride,3,15,9,z<4?dark:mid,2);});
    for(let z=9;z<=23;z+=2)add(z,`rock${z}`,c=>{block(c,-11,-11,22,22,z>17?light:mid,3);block(c,-7,-16,16,7,z>18?light:dark,2);block(c,-7,9,16,7,z>18?light:dark,2);pixel(c,-3,-9,2,18,dark);pixel(c,3,-7,2,14,glow);if(giant&&z>18){pixel(c,-10,-11,18,3,'#e2e2cc');pixel(c,-10,8,18,3,'#e2e2cc');}});
    for(let z=24;z<=30;z++)add(z,`head${z}`,c=>{block(c,-7,-8,15,16,z>27?light:mid,2);if(z>25&&z<28){pixel(c,7,-5,2,3,dark);pixel(c,7,2,2,3,dark);pixel(c,8,-4,1,1,glow);pixel(c,8,3,1,1,glow);}if(ice){pixel(c,-4,-13,3,7,glow);pixel(c,-4,6,3,7,glow);}if(giant&&z<27)block(c,8,-5,6,10,'#c0d4d0',2);});
    return true;
  }
  if(kind==='bog_slime'){
    add(1,'puddle',c=>{disc(c,0,0,15,13,'#384d46');pixel(c,-14,7,7,5,'#4e5e48');});
    for(let z=2;z<=17;z+=2)add(z,`jelly${z}`,c=>{const r=14-Math.floor(z/3);disc(c,-2,0,r,r-1,z>10?'#859977':'#576d59');if(z===10){pixel(c,7,-6,4,3,'#252d2f');pixel(c,7,2,4,3,'#252d2f');pixel(c,10,-5,1,1,'#d7a9d7');pixel(c,10,3,1,1,'#d7a9d7');}if(z===16){disc(c,-5,-4,5,4,'#9e799c');pixel(c,-7,-5,2,2,'#d4c3b6');disc(c,2,3,4,3,'#b18aa0');}});
    return true;
  }
  if(kind==='elder_treant'){
    for(let z=1;z<=11;z+=2)add(z,`roots${z}`,c=>{block(c,-9,-8,18,16,'#695039',3);if(z<6){for(const y of [-12,9])pixel(c,-11,y,24,4,'#85704b');pixel(c,-15,-2,30,5,'#765b3d');}});
    for(let z=12;z<=27;z+=2)add(z,`trunk${z}`,c=>{block(c,-9,-9,18,18,z>20?'#9b8256':'#78623e',2);pixel(c,-5,-7,2,14,'#4d432f');pixel(c,2,-7,2,14,'#c0a66b');block(c,-5,-15,12,6,'#7d7048',2);block(c,-5,9,12,6,'#7d7048',2);if(z===24){pixel(c,8,-6,3,4,'#2a3b2e');pixel(c,8,2,3,4,'#2a3b2e');pixel(c,10,-5,1,2,'#e8d78d');pixel(c,10,3,1,2,'#e8d78d');}});
    for(let z=28;z<=34;z+=2)add(z,`canopy${z}`,c=>{disc(c,-3,-7,12,8,z>30?'#7e9d58':'#42653f');disc(c,-4,7,12,8,z>30?'#94aa62':'#507747');disc(c,2,0,12,10,z>30?'#7c9c52':'#567f44');pixel(c,-7,-8,4,3,'#bac679');pixel(c,0,4,3,3,'#b3c16d');});
    return true;
  }
  if(kind==='dune_scorpion'){
    for(let z=1;z<=5;z+=2)add(z,`legs${z}`,c=>{for(const y of [-1,1])for(let x=-12;x<8;x+=6)pixel(c,x+stride,y<0?-13:9,6,4,z>2?'#b58f5b':'#775a3c');block(c,7,-15,8,8,'#c5a26c',2);block(c,7,7,8,8,'#c5a26c',2);pixel(c,13,-12,3,2,'#f0d49b');pixel(c,13,10,3,2,'#f0d49b');});
    for(let z=6;z<=14;z+=2)add(z,`shell${z}`,c=>{disc(c,-2,0,12,10,z>10?'#d3af72':'#aa8350');pixel(c,-9,-1,18,2,'#7c603d');pixel(c,7,-4,3,2,'#613c3a');pixel(c,7,2,3,2,'#613c3a');});
    for(let z=7;z<=30;z+=2)add(z,`tail${z}`,c=>{const x=z<18?-13:-13+Math.floor((z-18)*.8);disc(c,x,0,4,4,z%4===1?'#e0c58d':'#ab814d');if(z>=27)pixel(c,x+2,-1,5,3,'#5e483e');});
    return true;
  }
  if(kind==='mire_hydra'){
    for(let z=1;z<=9;z+=2)add(z,`body${z}`,c=>{disc(c,-4,0,12,13,z>5?'#647e5c':'#3b5945');pixel(c,-15,-2,8,4,'#51704f');for(const y of [-13,9])pixel(c,-10,y,17,4,'#779370');});
    for(let z=10;z<=31;z+=2)add(z,`necks${z}`,c=>{for(let head=0;head<3;head++){const y=(head-1)*10,x=Math.min(10,Math.floor((z-10)*.5));const peak=head===1?31:27;if(z>peak)continue;block(c,x-5,y-4,8,8,z>peak-4?'#acbb86':'#678762',2);if(z>=peak-2){block(c,x,y-4,5,8,'#9bac76',1);pixel(c,x+2,y-3,2,2,'#e4c895');pixel(c,x+2,y+1,2,2,'#e4c895');}}});
    return true;
  }
  return false;
}

export class SpriteAtlas {
  constructor() {
    this.sheet = surface(1024, 1024);
    this.activeSheet=this.sheet;this.pages=[this.sheet];
    this.ctx = this.sheet.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.cursor = { x: 0, y: 0, row: 0 };
    this.layers = new Map(); this.stacks = new Map(); this.poses = new Map();
    this.tiles = new Map(); this.walls = new Map(); this.glows = new Map(); this.weapons = new Map(); this.lootIcons = new Map();
  }
  slice(key, size, paint) {
    if (this.layers.has(key)) return this.layers.get(key);
    let p = this.cursor;
    if (p.x + size + 2 > this.sheet.width) { p.x = 0; p.y += p.row + 2; p.row = 0; }
    if(p.y+size+2>this.sheet.height){this.activeSheet=surface(1024,1024);this.pages.push(this.activeSheet);this.ctx=this.activeSheet.getContext('2d');this.ctx.imageSmoothingEnabled=false;this.cursor={x:0,y:0,row:0};p=this.cursor;}
    const rect = { x:p.x,y:p.y,w:size,h:size,image:this.activeSheet };
    this.ctx.save(); this.ctx.translate(p.x + size / 2, p.y + size / 2);
    this.ctx.beginPath(); this.ctx.rect(-size/2,-size/2,size,size); this.ctx.clip();
    paint(this.ctx); this.ctx.restore();
    p.x += size + 2; p.row = Math.max(p.row, size);
    this.layers.set(key, rect); return rect;
  }
  stack(kind, frame = 0) {
    // Every authored source slice is genuinely 32 × 32; only the guardian is scaled.
    if (kind === 'crawler') kind = 'slime';
    if (kind === 'stalker') kind = 'bat';
    frame=((frame%(SPRITE_METADATA[kind]?.frames||4))+(SPRITE_METADATA[kind]?.frames||4))%(SPRITE_METADATA[kind]?.frames||4);
    const key = `${kind}:${frame}`;
    if (this.stacks.has(key)) return this.stacks.get(key);
    const layers = [], stride = [0, 2, 0, -2][frame % 4];
    const add = (z, name, paint) => layers.push({ z, rect:this.slice(`${key}:${name}`,32,paint) });
    if (monsterLayers(kind,frame,add)) {
      // World-specific silhouettes share the same 32px slice contract.
    } else if (kind === 'player') {
      for (let z=1;z<=5;z+=2) add(z,`boots${z}`,c=>{
        block(c,-5+stride,-7,10,5,z<4?'#29221e':'#5f4431');
        block(c,-5-stride,2,10,5,z<4?'#29221e':'#79583c');
        pixel(c,2+stride,-6,3,3,'#ad8960');pixel(c,2-stride,3,3,3,'#ad8960');
      });
      for (let z=6;z<=16;z+=2) add(z,`cloak${z}`,c=>{
        // Wide scalloped cloth silhouette, leather jerkin, exposed warm hands.
        const tail=z<11?-14:-12;
        block(c,tail,-10,-tail+7,20,z>13?'#547d69':'#2a4a43',2);
        pixel(c,tail,-7,3,5,'#1a3331');pixel(c,tail,2,3,5,'#1a3331');
        pixel(c,tail+3,-8,2,16,z>11?'#709780':'#3d6254');
        block(c,-5,-7,12,14,z>13?'#9b7950':'#6e4d35',2);
        if(z===10){pixel(c,-4,-6,12,2,'#342b24');pixel(c,3,-6,3,2,'#c7b784');}
        if(z===14){pixel(c,-2,-5,2,10,'#c2a26d');pixel(c,4,-5,2,10,'#503b2c');}
        block(c,2,-12,7,5,z>11?'#a78354':'#486c58');
        block(c,2,7,7,5,z>11?'#a78354':'#486c58');
        if(z===12){pixel(c,8,-10,3,3,'#e4bd85');pixel(c,8,8,3,3,'#e4bd85');}
      });
      for(let z=17;z<=23;z++)add(z,`hood${z}`,c=>{
        const top=z>=22;
        block(c,-8,-8,15,16,top?'#74957b':'#3e6654',3);
        if(z>=18&&z<=21){block(c,3,-5,7,10,'#7d553b');block(c,6,-4,4,8,'#d4aa75');pixel(c,9,-3,1,1,'#2c2924');pixel(c,9,2,1,1,'#2c2924');}
        if(z===23){pixel(c,-5,-6,2,12,'#9bae87');pixel(c,0,-5,3,10,'#587c65');}
      });
    } else if(kind==='slime') {
      const squash=frame%2;
      add(1,'puddle',c=>{disc(c,0,0,14,12,'#294d3c');disc(c,-2,2,11,9,'#497346');});
      for(let z=2;z<=14;z+=2)add(z,`jelly${z}`,c=>{
        const r=Math.max(6,15-Math.floor(z/2))+squash;
        disc(c,0,0,r,Math.max(5,r-2),z>10?'#a6be65':z>6?'#7b9f4e':'#527c40');
        if(z===8){pixel(c,7,-5,4,3,'#1a302c');pixel(c,7,2,4,3,'#1a302c');pixel(c,10,-4,1,1,'#f0d58b');pixel(c,10,3,1,1,'#f0d58b');}
        if(z===14){pixel(c,-3,-5,4,3,'#d4d995');pixel(c,2,-3,2,2,'#bccd79');}
      });
    } else if(kind==='bat') {
      const lift=[0,3,1,-2][frame%4];
      add(8+lift,'wings',c=>{
        for(const side of [-1,1]){
          block(c,-7,side>0?5:-15,16,10,'#4d3a55',1);
          pixel(c,-11,side>0?8:-14,7,5,'#2b2639');
          pixel(c,-8,side>0?8:-12,13,3,'#85516c');
          pixel(c,-3,side>0?6:-11,9,2,'#bd7c8b');
          pixel(c,6,side>0?5:-9,3,4,'#5e425e');
        }
      });
      for(let z=9;z<=16;z+=2)add(z,`body${z}`,c=>{
        disc(c,-1,0,8,6,z>13?'#9b6b81':'#503b53');
        block(c,4,-5,7,10,z>13?'#c18a95':'#69435c',2);
        if(z===15){pixel(c,10,-4,2,2,'#f5c985');pixel(c,10,2,2,2,'#f5c985');pixel(c,4,-7,3,3,'#8e5a75');pixel(c,4,4,3,3,'#8e5a75');}
      });
    } else if(kind==='skeleton') {
      for(let z=1;z<=7;z+=2)add(z,`bones${z}`,c=>{
        pixel(c,-5+stride,-7,8,4,z<3?'#5d5547':'#b1a587');pixel(c,-5-stride,3,8,4,z<3?'#5d5547':'#c9ba94');
        if(z>3){pixel(c,-1+stride,-6,2,2,'#e4d8b0');pixel(c,-1-stride,4,2,2,'#e4d8b0');}
      });
      for(let z=8;z<=17;z+=2)add(z,`ribs${z}`,c=>{
        block(c,-5,-7,10,14,'#6e6652',2);pixel(c,-2,-5,3,10,'#d5c49a');
        pixel(c,-4,-7,9,2,'#bcad87');pixel(c,-4,5,9,2,'#bcad87');
        if(z%4===0){pixel(c,4,-5,2,3,'#e0d3a8');pixel(c,4,2,2,3,'#e0d3a8');}
        pixel(c,-1,-12,9,3,'#bdae87');pixel(c,-1,9,9,3,'#cabb95');pixel(c,6,-10,3,5,'#e1d1a5');pixel(c,6,6,3,5,'#e1d1a5');
      });
      for(let z=18;z<=24;z++)add(z,`skull${z}`,c=>{
        block(c,-6,-7,13,14,z>22?'#e0d2ad':'#b8a67f',3);
        if(z>=19&&z<=21){pixel(c,5,-5,3,4,'#3b3933');pixel(c,5,1,3,4,'#3b3933');pixel(c,7,-4,1,1,'#d9a26b');pixel(c,7,2,1,1,'#d9a26b');}
        if(z===18){pixel(c,5,-4,4,8,'#d4c49d');pixel(c,7,-3,1,1,'#685b45');pixel(c,7,0,1,1,'#685b45');pixel(c,7,3,1,1,'#685b45');}
        if(z===24)pixel(c,-3,-5,3,10,'#f3e8c4');
      });
    } else if(kind==='warden') {
      for(let z=1;z<=7;z+=2)add(z,`boots${z}`,c=>{block(c,-7+stride,-10,12,7,z<3?'#272b30':'#615c64',2);block(c,-7-stride,3,12,7,z<3?'#272b30':'#77717a',2);});
      for(let z=8;z<=20;z+=2)add(z,`mail${z}`,c=>{
        block(c,-14,-12,18,24,z>15?'#7a5164':'#492f44',2);
        pixel(c,-14,-10,3,4,'#2b2835');pixel(c,-13,5,3,5,'#2b2835');
        block(c,-7,-10,16,20,z>17?'#99918c':'#625e66',2);
        block(c,-5,-15,13,6,z>17?'#b5a9a0':'#716878',2);block(c,-5,9,13,6,z>17?'#b5a9a0':'#716878',2);
        if(z===18){pixel(c,-1,-8,3,16,'#bbaa84');pixel(c,6,-6,2,12,'#3d3e49');}
      });
      for(let z=21;z<=28;z++)add(z,`helm${z}`,c=>{
        block(c,-7,-8,14,16,z>25?'#b8b3a1':'#797a79',2);
        if(z>=23&&z<=25){pixel(c,6,-5,2,10,'#31323a');pixel(c,7,-4,1,2,'#e6a478');pixel(c,7,2,1,2,'#e6a478');}
        pixel(c,-6,-13,3,7,'#a6a28c');pixel(c,-6,6,3,7,'#a6a28c');
        if(z===28)pixel(c,-3,-6,3,12,'#d8cbb0');
      });
    } else if(kind==='boss') {
      for(let z=1;z<=7;z+=2)add(z,`base${z}`,c=>{
        block(c,-11,-13,20,10,z<3?'#303d36':'#71796a',2);block(c,-11,3,20,10,z<3?'#303d36':'#71796a',2);
        pixel(c,-8,-10,3,6,'#9ca181');pixel(c,-8,6,3,5,'#9ca181');
      });
      for(let z=8;z<=20;z+=2)add(z,`stone${z}`,c=>{
        block(c,-10,-10,20,20,z>15?'#929982':'#586958',3);
        block(c,-8,-16,16,7,z>17?'#b4b18c':'#647365',2);block(c,-8,9,16,7,z>17?'#b4b18c':'#647365',2);
        pixel(c,-7,-8,3,16,'#384d42');pixel(c,1,-8,2,16,'#6b7d5f');
        if(z===14){block(c,9,-5,3,10,'#243b33');pixel(c,11,-3,1,6,'#d1c28b');}
        if(z>=18){pixel(c,-6,-14,4,3,'#91a46e');pixel(c,-7,11,5,3,'#658452');pixel(c,-8,-6,4,3,'#7f9a63');}
      });
      for(let z=21;z<=28;z++)add(z,`face${z}`,c=>{
        block(c,-7,-8,15,16,z>25?'#b3b397':'#7c8b73',2);
        if(z>=23&&z<=25){pixel(c,7,-6,2,4,'#293e35');pixel(c,7,2,2,4,'#293e35');pixel(c,8,-5,1,2,'#edcd84');pixel(c,8,3,1,2,'#edcd84');}
        pixel(c,-5,-13,3,8,'#728b62');pixel(c,-5,5,3,8,'#728b62');
        if(z===28){pixel(c,-5,-5,3,10,'#d2cdb0');pixel(c,0,-7,3,3,'#75965e');}
      });
    } else throw new Error(`Unknown sprite: ${kind}`);
    const scale=SPRITE_METADATA[kind].scale,big=scale>1;
    layers.sort((a,b)=>a.z-b.z);
    const result={layers,width:big?160:72,height:big?176:84,
      anchorX:big?80:36,anchorY:big?136:64,baseSize:32,scale};
    this.stacks.set(key,result);return result;
  }
  get(kind,direction=0,frame=0) {
    direction=((Math.round(direction)%8)+8)%8;frame=((frame%4)+4)%4;
    frame%=SPRITE_METADATA[kind]?.frames||4;
    const key=`${kind}:${direction}:${frame}`;
    if(this.poses.has(key))return this.poses.get(key);
    const source=this.stack(kind,frame),image=surface(source.width,source.height),ctx=image.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    for(const {z,rect} of source.layers){
      ctx.save();ctx.translate(source.anchorX,source.anchorY-z*source.scale);
      ctx.scale(source.scale,SPRITE_Y_SCALE*source.scale);ctx.rotate(direction*Math.PI/4);
      ctx.drawImage(rect.image,rect.x,rect.y,32,32,-16,-16,32,32);ctx.restore();
    }
    const result={image,anchorX:source.anchorX,anchorY:source.anchorY,width:source.width,height:source.height,baseSize:32,scale:source.scale};
    this.poses.set(key,result);return result;
  }
  weapon(id=0,direction=0,phase=0){
    id=Math.max(0,Math.min(9,Number(id)||0));direction=((Math.round(direction)%8)+8)%8;phase=Math.max(0,Math.min(2,phase|0));
    const key=`${id}:${direction}:${phase}`;if(this.weapons.has(key))return this.weapons.get(key);
    const rect=this.slice(`weapon:${id}`,32,c=>{
      if(id===0||id===1||id===2){
        const start=id===1?4:0,end=id===1?13:15,half=id===2?3:1;
        pixel(c,start-5,-1,6,3,'#785237');pixel(c,start-1,-4,2,9,'#c2a467');
        block(c,start+1,-half,end-start,half*2+1,'#afb9ad');pixel(c,start+1,-half,end-start-1,1,'#e4e4c4');pixel(c,end-1,-half+1,2,1,'#f5eed2');
      }else if(id===3){pixel(c,-15,-1,26,3,'#93704a');pixel(c,-14,-1,24,1,'#b59860');block(c,9,-3,6,7,'#bac5b2');pixel(c,13,-1,3,3,'#e9e6c2');
      }else if(id===4){pixel(c,-13,-1,25,3,'#8a6440');block(c,6,-8,8,17,'#9a9d93',2);pixel(c,12,-6,2,13,'#e0d8b6');pixel(c,6,-2,5,5,'#685342');
      }else if(id===5){pixel(c,-13,-1,23,3,'#99724a');block(c,7,-8,8,17,'#8d8e82',1);pixel(c,8,-7,6,2,'#c6c5a7');pixel(c,8,6,6,2,'#575e59');
      }else if(id===6){
        pixel(c,2,-13,2,27,'#c2b18b');pixel(c,4,-13,3,3,'#a77f4a');pixel(c,7,-10,3,5,'#a77f4a');pixel(c,10,-5,3,10,'#b8945d');pixel(c,7,5,3,5,'#a77f4a');pixel(c,4,10,3,3,'#a77f4a');pixel(c,-5,0,20,1,'#d2c1a1');pixel(c,12,-2,3,5,'#b9c8b9');
      }else if(id===7){disc(c,3,0,11,11,'#b59a62');disc(c,3,0,8,8,'#e0c58c');disc(c,3,0,5,5,'#243932');pixel(c,11,-3,3,6,'#eee0b4');
      }else if(id===8){pixel(c,-15,-1,25,3,'#866848');pixel(c,-13,-1,22,1,'#bd9d68');block(c,8,-5,7,11,'#7a6685',2);block(c,10,-3,5,7,'#9fc8bd',1);pixel(c,11,-2,2,4,'#dfefd4');
      }else{block(c,-9,-10,23,20,'#65485b',2);block(c,-7,-8,9,16,'#d1c29a');block(c,3,-8,9,16,'#e4d4aa');pixel(c,2,-8,1,16,'#8e7253');for(let y=-5;y<=5;y+=3){pixel(c,-5,y,5,1,'#9f8363');pixel(c,5,y,5,1,'#9f8363');}pixel(c,0,-11,4,2,'#baa275');}
    });
    const image=surface(80,76),ctx=image.getContext('2d');ctx.imageSmoothingEnabled=false;
    const sweep=id<=2||id===4?(phase===2?-.65:phase===1?.5:-.12):0;
    ctx.translate(40,55-13);ctx.scale(1,SPRITE_Y_SCALE);ctx.rotate(direction*Math.PI/4+sweep);
    ctx.translate(9+(id===3&&phase?6:0),4);
    ctx.drawImage(rect.image,rect.x,rect.y,32,32,-16,-16,32,32);
    const result={image,anchorX:40,anchorY:55,baseSize:32};this.weapons.set(key,result);return result;
  }
  tile(size,variant,biome='meadow'){
    const key=`${size}:${variant}:${biome}`;if(this.tiles.has(key))return this.tiles.get(key);
    const image=surface(size,size),c=image.getContext('2d');
    if(biome==='desert'){
      pixel(c,0,0,size,size,['#b29c6e','#baa675','#ae986a','#c0ad7b'][variant%4]);
      for(let row=3;row<size;row+=7){const offset=(row+variant*3)%5;pixel(c,2+offset,row,size-7-offset,1,'#cfbb8a');pixel(c,4+offset,row+1,size-10-offset,1,'#a48a60');}
      for(let i=0;i<7;i++)pixel(c,(i*11+variant*3)%size,(i*7+variant)%size,1,1,i%2?'#927b54':'#e0c99a');
      if(variant%5===0){block(c,5,11,10,7,'#9c8863',2);pixel(c,7,12,6,1,'#d9c394');}
    }else if(biome==='volcano'){
      pixel(c,0,0,size,size,['#393943','#353640','#403c44','#34323d'][variant%4]);
      for(let i=0;i<5;i++){const x=(i*11+variant*3)%26,y=(i*7+variant*2)%26;block(c,x,y,8,7,'#4b444b',2);pixel(c,x+2,y+1,4,1,'#61545a');}
      let x=(variant*7)%20+3;for(let y=0;y<size;y+=3){pixel(c,x,y,1,3,'#211f2c');if(y%6===0)x+=(variant%2?1:-1);}
      if(variant%4===0){pixel(c,9,19,2,1,'#99624e');pixel(c,23,7,1,2,'#a76e54');}
    }else if(biome==='swamp'){
      pixel(c,0,0,size,size,['#46564a','#485c4c','#40554a','#4d5c48'][variant%4]);
      disc(c,16+(variant%5)-2,15,variant%2?11:7,variant%2?8:11,'#2d4944');
      pixel(c,10,12,8,1,'#5f7b62');pixel(c,19,19,6,1,'#58745d');
      for(let i=0;i<5;i++){const x=(i*7+variant*3)%29,y=(i*13+variant)%28;pixel(c,x,y,2,4,'#72855b');pixel(c,x+2,y+1,1,3,'#91a06c');}
      if(variant%5===0){pixel(c,3,22,13,3,'#514b39');pixel(c,5,22,10,1,'#857554');}
    }else if(biome==='tundra'){
      pixel(c,0,0,size,size,['#a9c3c8','#b5cbd0','#a4bdc6','#c3d3d1'][variant%4]);
      disc(c,9,8,11,8,'#d7e0d8');disc(c,27,27,13,8,'#cddbd7');
      for(let i=0;i<4;i++)pixel(c,(i*11+variant*5)%29,(i*7+variant)%29,2,1,'#ebede0');
      if(variant%3===0){pixel(c,11,7,1,8,'#7ca1b1');pixel(c,12,15,5,1,'#7ca1b1');pixel(c,17,16,1,10,'#7ca1b1');pixel(c,18,25,4,1,'#7ca1b1');}
    }else{
      pixel(c,0,0,size,size,['#526a3e','#597245','#4e693d','#60764a'][variant%4]);
      for(let i=0;i<13;i++){const x=(i*11+variant*5)%30,y=(i*7+variant*3)%28;pixel(c,x,y,1,4,i%2?'#7c9257':'#394f32');pixel(c,x+1,y+2,2,1,i%2?'#95a765':'#6c8350');}
      if(variant%5===0){block(c,6,9,17,13,'#7a7f63',3);pixel(c,9,10,10,2,'#a4a886');pixel(c,19,14,3,5,'#596850');}
      if(variant%7===0){pixel(c,9,7,2,2,'#e4c587');pixel(c,23,23,2,2,'#d5b5bd');}
    }
    this.tiles.set(key,image);return image;
  }
  wall(size,variant=0,pillar=false,biome='meadow'){
    const key=`${size}:${variant}:${pillar}:${biome}`;if(this.walls.has(key))return this.walls.get(key);
    const tree=(biome==='meadow'||biome==='tundra')&&(pillar||variant%3===0);
    const cactus=biome==='desert'&&(pillar||variant%3===0);
    const reeds=biome==='swamp'&&(pillar||variant%3===0);
    const tall=tree?(biome==='tundra'?44:40):cactus?37:reeds?31:biome==='volcano'?27:biome==='tundra'?29:24;
    const anchorX=8,anchorY=tall+5,image=surface(size+16,Math.ceil(size*SPRITE_Y_SCALE+tall+13)),c=image.getContext('2d');c.imageSmoothingEnabled=false;
    const layers=[];
    const add=(z,paint)=>layers.push({z,rect:this.slice(`env:${key}:${z}`,32,paint)});
    for(let z=0;z<=tall;z+=2)add(z,p=>{
      if(tree){
        if(z<12){block(p,-6,-6,12,12,z<4?'#414b34':'#716047',2);if(z<4){pixel(p,-16,-3,32,6,'#596040');pixel(p,-4,-15,7,30,'#626749');}}
        else if(biome==='tundra'){
          const r=Math.max(3,16-Math.floor((z-12)/3)),t=(z-12)%8;
          disc(p,0,0,r+(t<3?1:0),Math.max(2,r-2),t<3?'#c8dcd7':z>32?'#bdd6d0':'#3c6b60');
          if(t<3){pixel(p,-r+2,-3,r,2,'#e8eadd');pixel(p,1,2,Math.max(1,r-3),2,'#d7e4dc');}
        }else{
          const r=z<18?10:z<31?16:Math.max(7,18-Math.floor((z-28)/2));
          disc(p,-2,0,r,Math.max(5,r-2),z%6===0?'#78944d':z>30?'#829b50':'#4d743e');
          disc(p,5,-5,Math.max(4,r-7),Math.max(3,r-9),z>30?'#a9b86a':'#628748');
          if(z===tall)pixel(p,-7,-3,6,3,'#c1c984');
        }
      }else if(cactus){
        if(z<4){block(p,-16,-16,32,32,'#a58e62',3);block(p,-11,-11,22,22,'#c0a877',3);}
        block(p,-4,-5,9,11,z===tall?'#a9af70':'#6d8a55',2);pixel(p,-2,-4,2,8,'#9fa56a');
        if(z>=10&&z<26){block(p,-13,-3,9,7,'#68824d',2);pixel(p,-12,-1,3,2,'#a4b473');}
        if(z>=17&&z<31){block(p,4,-3,9,7,'#799153',2);pixel(p,10,-1,2,2,'#aeb979');}
        if(z%6===0){pixel(p,-6,1,2,1,'#e2d3a0');pixel(p,5,-2,2,1,'#e2d3a0');}
      }else if(reeds){
        if(z<4){block(p,-16,-16,32,32,'#344d3e',3);disc(p,0,0,15,13,'#566544');}
        for(let i=0;i<7;i++){const x=(i*7+variant*3)%27-13,y=(i*11+variant)%26-13,peak=17+i*2;
          if(z<=peak){pixel(p,x,y,2,2,z>peak-5?'#8c8760':'#547447');if(z%8===0)pixel(p,x-3,y,4,1,'#8b9c61');}}
        if(z<26){pixel(p,0,-3,5,7,'#554c3c');pixel(p,1,-2,1,5,'#988663');}
      }else{
        const desert=biome==='desert',volcano=biome==='volcano',ice=biome==='tundra';
        const radius=z<5?16:z>tall-4?12:15;
        const dark=desert?'#a3855c':volcano?'#3a3541':ice?'#6d98b0':biome==='swamp'?'#43574a':'#5e6855';
        const mid=desert?'#c6a875':volcano?'#55434a':ice?'#a1c7d1':biome==='swamp'?'#64735a':'#858a6b';
        const light=desert?'#dfc695':volcano?'#71606a':ice?'#d6e8e1':biome==='swamp'?'#8b9570':'#abb18a';
        block(p,-radius,-radius,radius*2,radius*2,z===tall?light:z%8===0?dark:mid,3);
        pixel(p,-radius+2,-radius+2,2,radius*2-5,light);
        if(volcano&&z>4){pixel(p,3,-4,2,9,z%6===0?'#e6a064':'#a95e48');pixel(p,-6,8,7,1,'#b47355');}
        if(ice&&z>10){pixel(p,-4,-7,2,11,'#e6f2e8');pixel(p,5,1,3,7,'#8ebbc9');}
        if(desert&&z%6===0){pixel(p,-9,-7,18,1,'#96794e');pixel(p,-3,1,12,1,'#ae8b59');}
        if(!desert&&!ice&&!volcano&&z>=tall-2){block(p,-10,-11,9,7,'#718b4d',2);pixel(p,-7,-9,3,3,'#9ca961');}
      }
    });
    for(const {z,rect} of layers){c.save();c.translate(anchorX+size/2,anchorY+size*SPRITE_Y_SCALE/2-z);c.scale(size/32,SPRITE_Y_SCALE*size/32);c.drawImage(rect.image,rect.x,rect.y,32,32,-16,-16,32,32);c.restore();}
    const result={image,anchorX,anchorY,height:tall,width:size,biome,shape:tree?'tree':cactus?'cactus':reeds?'reeds':'rock',baseSize:32};
    this.walls.set(key,result);return result;
  }
  loot(kind,variant=''){
    const key=`${kind}:${variant}`;if(this.lootIcons.has(key))return this.lootIcons.get(key);
    const image=surface(32,32),c=image.getContext('2d');c.translate(16,16);
    if(kind==='gold'){
      disc(c,-2,3,7,5,'#80613d');disc(c,-2,1,7,5,'#d7b366');disc(c,2,-3,7,5,'#ead08a');disc(c,2,-4,5,3,'#b88e4e');pixel(c,1,-6,2,5,'#f4e2a1');
    }else if(kind==='material'){
      block(c,-8,-6,16,16,'#785c3e',3);block(c,-6,-5,12,13,'#b89964',2);pixel(c,-6,-7,12,3,'#4f4635');pixel(c,-4,-11,8,4,'#d0ba83');pixel(c,-4,-2,2,8,'#e0c792');
    }else if(kind==='consumable'&&variant==='ward_scroll'){
      block(c,-8,-10,16,20,'#aa8c61',1);pixel(c,-6,-9,12,18,'#e3d2a9');pixel(c,-9,-10,18,3,'#f0e0b9');pixel(c,-9,7,18,3,'#b99664');block(c,-3,-5,6,10,'#719fae',1);pixel(c,-1,-4,2,7,'#bce3df');
    }else if(kind==='consumable'){
      pixel(c,-3,-12,6,3,'#99724b');pixel(c,-3,-9,6,6,'#9eb7b6');block(c,-7,-4,14,16,'#b9ccc6',3);block(c,-5,0,10,10,'#b36f6b',2);pixel(c,-4,0,2,6,'#ebc0aa');pixel(c,0,9,3,1,'#7f484f');
    }else if(variant==='boots'){
      block(c,-10,-8,8,13,'#614c3c',1);block(c,2,-8,8,13,'#725640',1);block(c,-10,3,11,7,'#a68b60',1);block(c,2,3,11,7,'#b49a6e',1);pixel(c,-9,-6,5,2,'#d1b778');pixel(c,3,-6,5,2,'#d1b778');
    }else if(variant==='charm'){
      c.strokeStyle='#ad9d72';c.lineWidth=2;c.beginPath();c.arc(0,-3,7,Math.PI,0);c.stroke();disc(c,0,3,7,8,'#b59a61');disc(c,0,3,4,5,'#78a5a0');pixel(c,-1,0,2,5,'#ccdfcc');
    }else{
      block(c,-7,-8,14,19,'#7f8d82',1);block(c,-12,-9,8,8,'#b1b8a0',1);block(c,4,-9,8,8,'#a1ad98',1);pixel(c,-4,-9,8,5,'#2e423b');pixel(c,-4,-2,3,11,'#ccd1ad');pixel(c,3,-2,2,11,'#50685b');pixel(c,-6,8,12,2,'#b49e6b');
    }
    const result={image,baseSize:32,anchorX:16,anchorY:16};this.lootIcons.set(key,result);return result;
  }
  glow(color, radius = 48) {
    const key = `${color}:${radius}`;
    if (this.glows.has(key)) return this.glows.get(key);
    const image = surface(radius * 2, radius * 2), ctx = image.getContext('2d');
    const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, radius * 2, radius * 2);
    this.glows.set(key, image); return image;
  }
}
let shared;
export function getSpriteAtlas() { return shared ||= new SpriteAtlas(); }
export function createRenderSurface(width, height) { return surface(width, height); }
