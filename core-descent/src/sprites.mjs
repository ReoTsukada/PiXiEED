/**
 * Original, code-native pixel sprites for CORE DESCENT.
 * The source atlas stores thin horizontal slices. Character poses are rendered
 * bottom-to-top into cached images; the game draws those images, not geometry.
 * No downloaded art, network access, simulation state or random generator.
 */
import {paintActorLayers} from './actor-art.mjs';
import {paintTerrainTile,terrainWallProfile,paintTerrainWallLayers} from './terrain-art.mjs';

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
    // Every authored source slice is genuinely 32 × 32; bosses use an explicit scale.
    if (kind === 'crawler') kind = 'slime';
    if (kind === 'stalker') kind = 'bat';
    frame=((frame%(SPRITE_METADATA[kind]?.frames||4))+(SPRITE_METADATA[kind]?.frames||4))%(SPRITE_METADATA[kind]?.frames||4);
    const key = `${kind}:${frame}`;
    if (this.stacks.has(key)) return this.stacks.get(key);
    const layers = [];
    const add = (z, name, paint) => layers.push({ z, rect:this.slice(`${key}:${name}`,32,paint) });
    if (!paintActorLayers(kind,frame,add)) throw new Error(`Unknown sprite: ${kind}`);
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
    c.imageSmoothingEnabled=false;paintTerrainTile(c,size,variant,biome);
    this.tiles.set(key,image);return image;
  }
  wall(size,variant=0,pillar=false,biome='meadow'){
    const {height:tall,shape}=terrainWallProfile(variant,pillar,biome);
    // Some edge and isolated-wall requests select the same artwork. Share those
    // 32px sources and their composited image rather than duplicating an atlas.
    const key=`${size}:${variant}:${shape}:${biome}`;if(this.walls.has(key))return this.walls.get(key);
    const anchorX=8,anchorY=tall+5,image=surface(size+16,Math.ceil(size*SPRITE_Y_SCALE+tall+13)),c=image.getContext('2d');c.imageSmoothingEnabled=false;
    const layers=[];
    const add=(z,paint)=>layers.push({z,rect:this.slice(`env:${key}:${z}`,32,paint)});
    paintTerrainWallLayers(variant,pillar,biome,add);
    for(const {z,rect} of layers){c.save();c.translate(anchorX+size/2,anchorY+size*SPRITE_Y_SCALE/2-z);c.scale(size/32,SPRITE_Y_SCALE*size/32);c.drawImage(rect.image,rect.x,rect.y,32,32,-16,-16,32,32);c.restore();}
    const result={image,anchorX,anchorY,height:tall,width:size,biome,shape,baseSize:32};
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
