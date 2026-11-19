import { SPRITE_Y_SCALE, SPRITE_METADATA, getSpriteAtlas, createRenderSurface } from './sprites.mjs';
import { isVisible, isExplored } from './fog.mjs';
import { equipmentDefinition } from './items.mjs';

/** Rendering only. No mutations of GameEngine, items, scores or its RNG. */
export const Y_SCALE = SPRITE_Y_SCALE;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

export function screenVectorToWorld(x, y) {
  return { x: finite(x), y: finite(y) / Y_SCALE };
}
export function projectWorld(x, y, z = 0, view = {}) {
  const zoom = view.zoom ?? 1;
  return { x: (x - (view.x ?? 0)) * zoom + (view.centerX ?? 0),
    y: ((y - (view.y ?? 0)) * Y_SCALE - z) * zoom + (view.centerY ?? 0) };
}
export function unprojectScreen(x, y, z = 0, view = {}) {
  const zoom = view.zoom ?? 1;
  return { x: (x - (view.centerX ?? 0)) / zoom + (view.x ?? 0),
    y: ((y - (view.centerY ?? 0)) / zoom + z) / Y_SCALE + (view.y ?? 0) };
}
export function compareDepth(a, b) { return a.depth - b.depth || a.order - b.order; }
export function explorationLevel(map, state, x, y) {
  return isVisible(map,state,x,y) ? 2 : isExplored(map,state,x,y) ? 1 : 0;
}
export function resolveWeaponDigit(weapon) {
  if(Number.isInteger(weapon?.digit))return clamp(weapon.digit,0,9);
  if(Number.isInteger(weapon))return clamp(weapon,0,9);
  const names=['sword','dagger','greatsword','spear','axe','hammer','bow','chakram','staff','spellbook'];
  return Math.max(0,names.indexOf(typeof weapon==='string'?weapon:weapon?.id));
}

/** Is a foreground wall's projected solid hiding the player's body? */
export function wallOccludesPlayer(wall, player, tile = 32) {
  const foot = (wall.y + tile) * Y_SCALE, top = wall.y * Y_SCALE - wall.height;
  const py = player.y * Y_SCALE;
  return wall.y + tile > player.y && wall.x < player.x + 13 && wall.x + tile > player.x - 13
    && foot > py - 29 && top < py - 3;
}
export function makeCamera(player, map, width, height) {
  const zoom = width < 620 ? 1.65 : clamp(Math.min(width / 520, height / 305), 1.65, 2.1);
  const centerX = width * .5, centerY = height * .57;
  const left = centerX / zoom, right = (width - centerX) / zoom;
  const above = centerY / (zoom * Y_SCALE), below = (height - centerY) / (zoom * Y_SCALE);
  const x = map.width > left + right - 40 ? clamp(player.x, left - 20, map.width - right + 20) : map.width / 2;
  const y = map.height > above + below - 40 ? clamp(player.y, above - 30, map.height - below + 24) : map.height / 2;
  return { x, y, zoom, centerX, centerY, width, height };
}
/** Fit both combatants, including the boss crown, into a short landscape view. */
export function makeBossCamera(player, boss, map, width, height) {
  const base = makeCamera(player, map, width, height);
  // Bounds are in projected world units, before camera translation and zoom.
  const left = Math.min(player.x - 26, boss.x - 55);
  const right = Math.max(player.x + 26, boss.x + 55);
  const top = Math.min(player.y * Y_SCALE - 36, boss.y * Y_SCALE - (boss.isFloorBoss ? 132 : 98));
  const bottom = Math.max(player.y * Y_SCALE + 14, boss.y * Y_SCALE + 38);
  const sideMargin = Math.min(40, width * .08);
  const topMargin = Math.min(55, height * .17);
  const bottomMargin = Math.min(32, height * .1);
  const zoom = Math.min(base.zoom,
    Math.max(1, width - sideMargin * 2) / (right - left),
    Math.max(1, height - topMargin - bottomMargin) / (bottom - top));
  return { x: (left + right) / 2, y: (top + bottom) / (2 * Y_SCALE), zoom,
    centerX: width / 2, centerY: (topMargin + height - bottomMargin) / 2,
    width, height };
}
function hash(x, y, seed = 0) {
  let n = Math.imul(x + 113, 374761393) ^ Math.imul(y + 59, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177); return (n ^ n >>> 16) >>> 0;
}
function ellipse(ctx, x, y, rx, ry, color, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
}
const FOG_COLOR = '#071311';
const RARITY_COLORS = { common: '#b6c9c3', uncommon: '#82c59a', rare: '#79bfe5', epic: '#c399e5', legendary: '#e9bd71' };

export class DungeonRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.atlas = getSpriteAtlas(); this.scenes = new WeakMap(); this.scene = null;
    this.view = null; this.lastPlayer = null; this.angle = -.25 * Math.PI;
    this.occlusion = new Map(); this.lastTime = null; this.mapRef = null;
  }
  screenInput(x, y) { return screenVectorToWorld(x, y); }
  worldToScreen(x, y, z = 0) { return projectWorld(x, y, z, this.view ?? {}); }
  screenToWorld(x, y, z = 0) { return unprojectScreen(x, y, z, this.view ?? {}); }
  getScene(map) {
    if (this.scenes.has(map)) return this.scenes.get(map);
    const floor = createRenderSurface(map.width, Math.ceil(map.height * Y_SCALE));
    const ctx = floor.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#10212b'; ctx.fillRect(0, 0, floor.width, floor.height);
    const walls = [], markings = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const n = hash(x, y, map.seed ?? 42), px = x * map.tile, py = y * map.tile;
      if (map.cells[y][x]) {
        const touching = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => map.cells[y + dy]?.[x + dx] === 0).length;
        const pillar = touching >= 3 || (touching >= 2 && n % 5 === 0);
        const sprite = this.atlas.wall(map.tile,n%6,pillar,map.biomeId||'meadow');
        walls.push({ x: px, y: py, sprite, height: sprite.height, pillar, depth: py + map.tile, order: y * map.w + x, kind: 'wall' });
      } else {
        ctx.drawImage(this.atlas.tile(map.tile,n%16,map.biomeId||'meadow'), px, py * Y_SCALE, map.tile, map.tile * Y_SCALE);
        if (n % 41 === 0) markings.push({ x: px + map.tile / 2, y: py + map.tile / 2, value: n % 3 });
      }
    }
    for (const m of markings) {
      ctx.strokeStyle = '#50736b'; ctx.globalAlpha = .34; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.x - 6, m.y * Y_SCALE); ctx.lineTo(m.x, m.y * Y_SCALE - 6);
      ctx.lineTo(m.x + 6, m.y * Y_SCALE); ctx.lineTo(m.x, m.y * Y_SCALE + 6); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#629083'; ctx.fillRect(m.x - 1, m.y * Y_SCALE - 2, 2, 4); ctx.globalAlpha = 1;
    }
    const result = { floor, walls, markings }; this.scenes.set(map, result); return result;
  }
  knowledge(x,y) {
    const e=this.currentEngine;
    if(!e)return 0;
    if(e.exploration)return explorationLevel(e.map,e.exploration,x,y);
    // Failing closed avoids leaking a future map from an old/incomplete caller.
    return Math.floor(x/e.map.tile)===Math.floor(e.player.x/e.map.tile)
      && Math.floor(y/e.map.tile)===Math.floor(e.player.y/e.map.tile) ? 2 : 0;
  }
  canSee(x,y) { return this.knowledge(x,y)===2; }
  getObservedFloor(engine) {
    const scene=this.scene,m=engine.map,state=engine.exploration;
    const fallbackKey=`${Math.floor(engine.player.x/m.tile)},${Math.floor(engine.player.y/m.tile)}`;
    const revision=state?.revision ?? fallbackKey;
    if(scene.observed && scene.exploration===state && scene.revision===revision)return scene.observed;
    const observed=scene.observed ||= createRenderSurface(scene.floor.width,scene.floor.height);
    const ctx=observed.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
    ctx.fillStyle=FOG_COLOR;ctx.fillRect(0,0,observed.width,observed.height);
    const tileH=m.tile*Y_SCALE,levels=new Uint8Array(m.w*m.h);
    for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){
      const level=this.knowledge((x+.5)*m.tile,(y+.5)*m.tile);levels[y*m.w+x]=level;
      if(!level)continue;
      ctx.globalAlpha=level===2?1:.26;
      ctx.drawImage(scene.floor,x*m.tile,y*tileH,m.tile,tileH,x*m.tile,y*tileH,m.tile,tileH);
    }
    ctx.globalAlpha=1;
    const bands=[];
    for(let y=0;y<m.h;y++){
      let start=-1;
      for(let x=0;x<=m.w;x++){
        const lit=x<m.w&&levels[y*m.w+x]===2;
        if(lit&&start<0)start=x;
        if(!lit&&start>=0){bands.push([start*m.tile,y*tileH,(x-start)*m.tile,tileH]);start=-1;}
      }
    }
    // Gradients stay INSIDE a known lit tile: black unexplored cells stay opaque.
    for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){
      if(levels[y*m.w+x]!==2)continue;
      const px=x*m.tile,py=y*tileH,feather=7;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
        if(levels[(y+dy)*m.w+x+dx]===2&&x+dx>=0&&x+dx<m.w&&y+dy>=0&&y+dy<m.h)continue;
        let gradient;
        if(dx){const edge=dx<0?px:px+m.tile;gradient=ctx.createLinearGradient(edge,py,edge-dx*feather,py);}
        else {const edge=dy<0?py:py+tileH;gradient=ctx.createLinearGradient(px,edge,px,edge-dy*feather);}
        gradient.addColorStop(0,'#071311b3');gradient.addColorStop(1,'#07131100');ctx.fillStyle=gradient;
        if(dx)ctx.fillRect(dx<0?px:px+m.tile-feather,py,feather,tileH);
        else ctx.fillRect(px,dy<0?py:py+tileH-feather,m.tile,feather);
      }
    }
    scene.exploration=state;scene.revision=revision;scene.levels=levels;scene.visibleBands=bands;return observed;
  }
  clipVisible(zOffset=0) {
    const ctx=this.ctx;ctx.beginPath();
    for(const [x,y,w,h] of this.scene.visibleBands??[])ctx.rect(x,y+zOffset,w,h);
    ctx.clip();
  }
  visible(x, y, z = 0, margin = 85) {
    const p = this.worldToScreen(x, y, z);
    return p.x > -margin && p.x < this.view.width + margin && p.y > -margin && p.y < this.view.height + margin;
  }
  render(engine, { width = this.canvas.clientWidth || 800, height = this.canvas.clientHeight || 600,
    dpr = 1, paused = false, stick, quality = 'auto', reduced = false, showcase = false,
    showMinimap = !showcase, showLabels = !showcase } = {}) {
    if (!engine?.map || !engine?.player || width <= 0 || height <= 0) return;
    const canvas = this.canvas, ctx = this.ctx, m = engine.map, p = engine.player;
    this.reduced = !!reduced;
    const low = quality === 'low' || (quality === 'auto' && width < 620);
    const density = clamp(finite(dpr, 1), 1, low ? 1.5 : 2);
    const pixelWidth = Math.round(width * density), pixelHeight = Math.round(height * density);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    ctx.setTransform(density, 0, 0, density, 0, 0); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1;
    ctx.fillStyle = FOG_COLOR; ctx.fillRect(0, 0, width, height);
    const time = finite(engine.totalTime);
    if (m !== this.mapRef) { this.occlusion.clear(); this.lastPlayer = null; this.mapRef = m; this.lastTime = time; }
    const dt = clamp(time - (this.lastTime ?? time), 0, .1); this.lastTime = time;
    const encounterBoss=engine.isBoss ? engine.boss : engine.floorBoss?.hp>0&&isVisible(m,engine.exploration,engine.floorBoss.x,engine.floorBoss.y) ? engine.floorBoss : null;
    this.view=encounterBoss ? makeBossCamera(p,encounterBoss,m,width,height) : makeCamera(p,m,width,height);
    this.scene = this.getScene(m);
    this.currentEngine = engine;
    this.weaponDigit = resolveWeaponDigit(engine.spec?.weapon);
    const observedFloor = this.getObservedFloor(engine);
    const view = this.view;
    ctx.save(); ctx.translate(view.centerX - view.x * view.zoom, view.centerY - view.y * Y_SCALE * view.zoom); ctx.scale(view.zoom, view.zoom);
    ctx.drawImage(observedFloor, 0, 0);
    this.drawHazards(engine,low);
    this.drawTelegraphs(engine);
    // Portal lighting is soft and local; it never changes collision or aim.
    if (!engine.isBoss) this.drawGates(engine, showLabels);
    else this.drawBossGround(engine, time, showLabels);
    // Only currently observed walls cast contact shadows; unknown geometry is never sampled.
    ctx.save();this.clipVisible();ctx.fillStyle='#040d1460';
    for(const wall of this.scene.walls)if(this.canSee(wall.x+m.tile/2,wall.y+m.tile/2)&&this.visible(wall.x,wall.y))
      ctx.fillRect(wall.x+3,(wall.y+m.tile)*Y_SCALE,m.tile+3,wall.pillar?10:6);
    ctx.restore();
    const entities = [], wallBase = m.w * m.h;
    for (const wall of this.scene.walls) if (this.knowledge(wall.x+m.tile/2,wall.y+m.tile/2)>0 && this.visible(wall.x + m.tile / 2, wall.y + m.tile / 2, wall.height / 2)) entities.push(wall);
    for (const enemy of engine.enemies ?? []) {
      if (enemy.hp <= 0 || !this.canSee(enemy.x,enemy.y) || !this.visible(enemy.x, enemy.y, 20)) continue;
      const given = enemy.sprite || enemy.kind;
      const kind = enemy.immortal || enemy === engine.boss ? 'boss' : given && SPRITE_METADATA[given] ? given : enemy.elite ? 'warden' : enemy.r < 9 ? 'bat' : finite(enemy.id)%2 ? 'skeleton' : 'slime';
      const radius = enemy.isFloorBoss ? (enemy.r||32) : kind==='boss'?35:kind==='warden'?14:10;
      ellipse(ctx, enemy.x + 2, enemy.y * Y_SCALE + 3, radius, radius * .5, '#030b11', .46);
      entities.push({ kind, ref: enemy, depth: enemy.y + 4, order: wallBase + 100 + finite(enemy.id) });
    }
    for (let i = 0; i < (engine.pickups ?? []).length; i++) {
      const drop = engine.pickups[i]; if (!this.canSee(drop.x,drop.y) || !this.visible(drop.x, drop.y, 8)) continue;
      ellipse(ctx, drop.x, drop.y * Y_SCALE + 3, 8, 3, '#030b11', .5);
      entities.push({ kind: 'pickup', ref: drop, depth: drop.y, order: wallBase + 40 + i });
    }
    ellipse(ctx, p.x + 2, p.y * Y_SCALE + 3, 12, 6, '#030b11', .67);
    ctx.strokeStyle = '#8adbc144'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.ellipse(p.x, p.y * Y_SCALE, 14, 9, 0, 0, TAU); ctx.stroke();
    entities.push({ kind: 'player', ref: p, depth: p.y + 4, order: wallBase + 1 });
    const visibleBullets = (engine.bullets ?? []).filter(b => b.life > 0 && this.canSee(b.x,b.y) && this.visible(b.x, b.y, b.z??14, 24));
    const bulletStride = Math.max(1, Math.ceil(visibleBullets.length / (low ? 420 : 950)));
    for (let i = 0; i < visibleBullets.length; i += bulletStride) {
      const b = visibleBullets[i]; entities.push({ kind: 'bullet', ref: b, depth: b.y + 3, order: wallBase + 5000 + i });
    }
    for(const b of engine.hostileBullets??[])if(b.life>0&&this.canSee(b.x,b.y)&&this.visible(b.x,b.y,10,30))
      entities.push({kind:'hostile',ref:b,depth:b.y+3,order:wallBase+10000+finite(b.id)});
    let nearest = null, nearestDist = Infinity;
    for (const e of engine.enemies ?? []) {
      if (e.hp <= 0 || e.warm > 0 || !this.canSee(e.x,e.y)) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < nearestDist) { nearestDist = d; nearest = e; }
    }
    if (Number.isFinite(p.facing)) this.angle=p.facing;
    else if (nearest) this.angle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    else if (this.lastPlayer && Math.hypot(p.x - this.lastPlayer.x, p.y - this.lastPlayer.y) > .08) this.angle = Math.atan2(p.y - this.lastPlayer.y, p.x - this.lastPlayer.x);
    const walking = p.still < .1 && engine.status === 'playing';
    entities.sort(compareDepth);
    for (const entity of entities) {
      if (entity.kind === 'wall') this.drawWall(entity, p, m.tile, dt, low);
      else if (entity.kind === 'bullet') this.drawBullet(entity.ref, low);
      else if(entity.kind==='hostile')this.drawHostileBullet(entity.ref);
      else if (entity.kind === 'pickup') this.drawPickup(entity.ref, time);
      else if (entity.kind === 'player') this.drawActor(entity.ref, 'player', this.angle, walking && !reduced ? Math.floor(time * 9) % 4 : 0, time);
      else {
        const e = entity.ref;
        const angle=Number.isFinite(e.facing)?e.facing:Math.atan2(p.y-e.y,p.x-e.x);
        const frame = entity.kind === 'boss' || reduced ? 0 : Math.floor(time * (entity.kind === 'bat' ? 13 : 7) + finite(e.id)) % 4;
        this.drawActor(e, entity.kind, angle, frame, time);
      }
    }
    ctx.save(); this.clipVisible(-12);
    this.drawEffects(engine.fx ?? [], low);
    ctx.restore();
    if (engine.isBoss && !reduced) this.drawBossHighlight(engine, time);
    // A thin outline at the player's feet remains visible through cutaway walls.
    if ([...this.occlusion.values()].some(alpha => alpha < .5)) {
      ctx.strokeStyle = '#a1e4cd99'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(p.x, p.y * Y_SCALE, 10, 6, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    this.drawVignette(width, height, low);
    if (showMinimap) this.drawMinimap(engine, width, height);
    if (stick?.active) this.drawStick(stick);
    if (paused && engine.status === 'playing') this.drawPause(width, height);
    this.lastPlayer = { x: p.x, y: p.y };
  }
  drawWall(wall, p, tile, dt) {
    const ctx = this.ctx, sprite = wall.sprite;
    const target = wallOccludesPlayer(wall, p, tile) ? .19 : 1;
    const previous = this.occlusion.get(wall.order) ?? target;
    const alpha = previous + (target - previous) * Math.min(1, dt * 16 || 1);
    this.occlusion.set(wall.order, alpha);
    ctx.globalAlpha = alpha * (this.knowledge(wall.x+tile/2,wall.y+tile/2)===2 ? 1 : .22);
    ctx.drawImage(sprite.image, wall.x - sprite.anchorX, wall.y * Y_SCALE - sprite.anchorY);
    ctx.globalAlpha = 1;
    if (alpha < .7 && this.knowledge(wall.x+tile/2,wall.y+tile/2)===2) {
      ctx.strokeStyle = '#5b7e7866'; ctx.lineWidth = .7;
      ctx.strokeRect(wall.x + 1, wall.y * Y_SCALE + 1, tile - 2, tile * Y_SCALE - 2);
    }
  }
  drawActor(actor, kind, angle, frame, time) {
    const ctx = this.ctx;
    if (actor.warm > .12) {
      const progress = 1 - actor.warm / .7;
      ctx.strokeStyle = '#db866b'; ctx.lineWidth = 1; ctx.globalAlpha = .25 + progress * .4;
      ctx.beginPath(); ctx.ellipse(actor.x, actor.y * Y_SCALE, 8 + progress * 9, 5 + progress * 5, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = time * 2 + i * Math.PI / 2; ctx.fillStyle = '#e7a682'; ctx.fillRect(actor.x + Math.cos(a) * 13 - 1, actor.y * Y_SCALE + Math.sin(a) * 8 - 1, 2, 2); }
      ctx.globalAlpha = 1; return;
    }
    const direction = Math.round(angle / (Math.PI / 4));
    const sprite = this.atlas.get(kind, direction, frame);
    const bob = this.reduced ? 0 : kind === 'boss' ? Math.sin(time * 1.4) * 1.1 : kind === 'player' ? (frame % 2) * .8 : (frame % 2) * .5;
    if (!this.reduced && kind === 'player' && actor.invuln > 0) ctx.globalAlpha = .62 + .3 * Math.abs(Math.sin(time * 24));
    if (!this.reduced && actor.flash > 0) ctx.globalAlpha = .72 + .28 * Math.cos(time * 80);
    const held=kind==='player' ? this.atlas.weapon(this.weaponDigit,direction,actor.attackTime>.12?2:actor.attackTime>0?1:0) : null;
    const drawHeld=()=>{if(held)ctx.drawImage(held.image,Math.round(actor.x-held.anchorX),Math.round(actor.y*Y_SCALE-held.anchorY-bob));};
    if(held&&Math.sin(angle)<-.2)drawHeld();
    ctx.drawImage(sprite.image, Math.round(actor.x - sprite.anchorX), Math.round(actor.y * Y_SCALE - sprite.anchorY - bob));
    if(held&&Math.sin(angle)>=-.2)drawHeld();
    ctx.globalAlpha = 1;
    if (actor.flash > 0) {
      ctx.fillStyle = '#f5e5c9'; ctx.fillRect(actor.x - 1.5, actor.y * Y_SCALE - (kind === 'boss' ? 42 : 15), 3, 3);
    }
    if (actor.slow > 0) { ctx.strokeStyle = '#8fcee0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(actor.x, actor.y * Y_SCALE, actor.r + 3, (actor.r + 3) * .55, 0, 0, TAU); ctx.stroke(); }
    if(actor.isFloorBoss){
      const py=actor.y*Y_SCALE-124,ratio=clamp(actor.hp/actor.maxHp,0,1);
      ctx.fillStyle='#1b2423';ctx.fillRect(actor.x-43,py,86,5);ctx.fillStyle=actor.phase===2?'#ed996b':'#d3b67e';ctx.fillRect(actor.x-42,py+1,84*ratio,3);
      ctx.font='600 8px system-ui, sans-serif';ctx.textAlign='center';ctx.fillStyle='#e1d6b8';ctx.fillText(actor.name||'階層の主',actor.x,py-5);
      if(actor.phase===2){ctx.font='6px system-ui, sans-serif';ctx.fillStyle='#eab98b';ctx.fillText('激昂',actor.x,py+14);}
    } else if (kind !== 'player' && kind !== 'boss' && actor.hp < actor.maxHp) {
      const y = actor.y * Y_SCALE - (kind === 'warden' ? 36 : kind === 'skeleton' ? 32 : kind === 'bat' ? 25 : 21);
      ctx.fillStyle = '#0c1920'; ctx.fillRect(actor.x - 11, y, 22, 2);
      ctx.fillStyle = kind === 'warden' ? '#c0a3bb' : '#dd977d'; ctx.fillRect(actor.x - 11, y, 22 * clamp(actor.hp / actor.maxHp, 0, 1), 2);
    }
  }
  drawBullet(b, low) {
    const ctx=this.ctx,x=b.x,y=b.y*Y_SCALE-(b.z??13),angle=Math.atan2(b.vy*Y_SCALE,b.vx);
    const color=b.color||(b.noHeal?'#d8add9':b.gen?'#dec48c':'#c3dbaa');
    const kind=b.kind||'arrow',radius=clamp(b.radius??3,2,8);
    ctx.save();ctx.translate(x,y);
    if(kind==='arrow'||kind==='shard'){
      ctx.rotate(angle);ctx.strokeStyle=kind==='arrow'?'#b89b6d':color;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(-11,0);ctx.lineTo(2,0);ctx.stroke();ctx.fillStyle=kind==='arrow'?'#d8dfc9':color;
      ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(0,-2.5);ctx.lineTo(0,2.5);ctx.closePath();ctx.fill();
      if(kind==='arrow'){ctx.strokeStyle='#d1c3a1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(-11,-3);ctx.moveTo(-8,0);ctx.lineTo(-11,3);ctx.stroke();}
    }else if(kind==='chakram'){
      ctx.rotate(finite(b.angle,angle));ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,radius+3,(radius+3)*.75,0,0,TAU);ctx.stroke();
      ctx.fillStyle='#f0dfae';ctx.fillRect(radius+1,-1,3,2);ctx.fillRect(-radius-4,-1,3,2);
    }else{
      if(!low){ctx.globalAlpha=.2;ctx.drawImage(this.atlas.glow(color),-radius*4,-radius*4,radius*8,radius*8);ctx.globalAlpha=1;}
      if(kind==='rune'){
        ctx.rotate(finite(b.angle));ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.strokeRect(-radius,-radius,radius*2,radius*2);ctx.rotate(Math.PI/4);ctx.strokeRect(-radius*.7,-radius*.7,radius*1.4,radius*1.4);
      }else{ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fill();ctx.fillStyle='#e8e7cd';ctx.fillRect(-1,-1,2,2);}
    }
    ctx.restore();
  }
  drawPickup(drop,time) {
    const ctx=this.ctx,kind=drop.kind||(drop.core?'core':drop.item?'equipment':'material');
    const rarity=drop.core?.rarity||drop.item?.rarity;
    const color=kind==='gold'?'#e6c780':kind==='consumable'?drop.itemId==='ward_scroll'?'#9ecbd5':'#dfa59d':kind==='material'?'#c7b58b':RARITY_COLORS[rarity]||'#a7c6ac';
    const x=drop.x,y=drop.y*Y_SCALE-8-(this.reduced?0:Math.sin(time*3+drop.x)*1.5);
    ctx.globalAlpha=.12;ctx.drawImage(this.atlas.glow(color),x-23,y-23,46,46);ctx.globalAlpha=1;
    if(kind==='core'){
      ctx.fillStyle='#1a302d';ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x+7,y);ctx.lineTo(x,y+9);ctx.lineTo(x-7,y);ctx.closePath();ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.stroke();
      ctx.fillStyle=color;ctx.font='bold 8px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText(String(drop.core?.digit??''),x,y+2.5);
    }else{
      let variant=kind==='consumable'?drop.itemId:'';
      if(kind==='equipment'){try{variant=equipmentDefinition(drop.item).slot;}catch{variant='armor';}}
      const icon=this.atlas.loot(kind,variant);ctx.drawImage(icon.image,x-icon.anchorX,y-icon.anchorY);
    }
  }
  drawHazards(engine,low){
    const ctx=this.ctx,time=this.reduced?0:finite(engine.totalTime);
    ctx.save();this.clipVisible();
    for(const h of engine.map.hazards??[]){
      if(!this.canSee(h.x,h.y)||!this.visible(h.x,h.y))continue;
      const r=Math.max(2,finite(h.radius,18)),y=h.y*Y_SCALE;
      if(h.kind==='lava'){
        ellipse(ctx,h.x,y,r,r*Y_SCALE,'#8f4b3e',.85);ellipse(ctx,h.x-2,y-1,r*.78,r*.58,'#dd8c50',.85);
        ctx.strokeStyle='#f1bd6e';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(h.x,y,r*.7,r*.45,0,.3+time*.12,4.8+time*.12);ctx.stroke();
        for(let i=0;i<5;i++){const a=i*TAU/5;ctx.fillStyle='#f6cb84';ctx.fillRect(h.x+Math.cos(a)*r*.45-1,y+Math.sin(a)*r*.32-1,2,2);}
      }else if(h.kind==='poison'){
        ellipse(ctx,h.x,y,r,r*Y_SCALE,'#44593e',.85);ellipse(ctx,h.x,y,r*.78,r*.58,'#87945a',.56);
        for(let i=0;i<4;i++){const a=i*TAU/4+time*.1;ctx.strokeStyle='#b1b77a';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(h.x+Math.cos(a)*r*.5,y+Math.sin(a)*r*.35,2.5,1.8,0,0,TAU);ctx.stroke();}
      }else if(h.kind==='ice'){
        ellipse(ctx,h.x,y,r,r*Y_SCALE,'#7fa7be',.72);ctx.strokeStyle='#d6e8e0';ctx.lineWidth=1;
        for(let i=0;i<3;i++){const a=i*TAU/3;ctx.beginPath();ctx.moveTo(h.x,h.y*Y_SCALE);ctx.lineTo(h.x+Math.cos(a)*r*.8,y+Math.sin(a)*r*.6);ctx.stroke();}
      }else{
        ellipse(ctx,h.x,y,r,r*Y_SCALE,'#927249',.48);ctx.strokeStyle='#dbc18a';ctx.lineWidth=1;
        for(const n of [.4,.7,1]){ctx.beginPath();ctx.ellipse(h.x,y,r*n,r*n*Y_SCALE,0,.3+time*.08,5.5+time*.08);ctx.stroke();}
      }
    }
    ctx.restore();
  }
  drawTelegraphs(engine){
    const ctx=this.ctx;ctx.save();this.clipVisible();
    for(const t of engine.telegraphs??[]){
      if(!this.canSee(t.x,t.y)&&!(Number.isFinite(t.tx)&&this.canSee(t.tx,t.ty)))continue;
      const left=clamp(t.remaining/Math.max(.001,t.total),0,1),charge=1-left;
      const color=t.color||'#e4a478',r=Math.max(2,finite(t.radius,40));
      ctx.save();ctx.translate(t.x,t.y*Y_SCALE);ctx.scale(1,Y_SCALE);
      ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.globalAlpha=.12+charge*.13;
      if(t.type==='line'){
        const angle=Number.isFinite(t.tx)?Math.atan2(t.ty-t.y,t.tx-t.x):finite(t.angle);
        const length=Number.isFinite(t.tx)?Math.hypot(t.tx-t.x,t.ty-t.y):finite(t.range,r),width=Math.max(3,finite(t.width,12));
        ctx.rotate(angle);ctx.fillRect(0,-width/2,length,width);ctx.globalAlpha=.72;ctx.strokeRect(0,-width/2,length,width);
        ctx.globalAlpha=.2+charge*.5;ctx.fillRect(0,-width/2,length*charge,width);
      }else if(t.type==='cone'){
        const angle=finite(t.angle),arc=Math.min(TAU,finite(t.arc,1.2));
        ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,angle-arc/2,angle+arc/2);ctx.closePath();ctx.fill();ctx.globalAlpha=.78;ctx.stroke();
      }else{
        ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.globalAlpha=.75;ctx.stroke();
        ctx.globalAlpha=.2+charge*.25;ctx.beginPath();ctx.arc(0,0,Math.max(1,r*charge),0,TAU);ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  drawHostileBullet(b){
    const ctx=this.ctx,x=b.x,y=b.y*Y_SCALE-9,r=Math.max(2,finite(b.radius,4)),color=b.color||'#e49376';
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy*Y_SCALE,b.vx));
    ctx.strokeStyle='#502c35';ctx.lineWidth=3;ctx.fillStyle=color;
    if(b.kind==='arrow'){
      ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(5,0);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.stroke();ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(0,-3);ctx.lineTo(0,3);ctx.closePath();ctx.fill();
    }else{
      ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#f4d8b3';ctx.fillRect(-1,-1,2,2);
      ctx.globalAlpha=.4;ctx.fillStyle=color;ctx.fillRect(-r-8,-1,6,2);
    }
    ctx.restore();
  }
  drawGates(engine, labels) {
    const ctx=this.ctx,m=engine.map,time=this.reduced?0:finite(engine.totalTime),active=!!engine.gates;
    const g=m.portal,s=m.stairs;
    if(g&&this.canSee(g.x,g.y)){
      const x=g.x,y=g.y*Y_SCALE;
      ctx.save();this.clipVisible();ctx.globalAlpha=active?.23:.07;ctx.drawImage(this.atlas.glow('#80d8b1',64),x-48,y-34,96,68);ctx.globalAlpha=1;
      ellipse(ctx,x,y,20,15,'#183329');
      for(let i=0;i<3;i++){ctx.strokeStyle=active?['#8cd4b0','#3d8e7f','#b4dbc0'][i]:'#516e58';ctx.lineWidth=i===0?1.3:.8;ctx.beginPath();ctx.ellipse(x,y-i*.7,20-i*4.5,15-i*3.3,0,0,TAU);ctx.stroke();}
      for(let i=0;i<8;i++){const a=i*Math.PI/4+time*(active?.16:0);ctx.fillStyle=active?'#bce5b8':'#6a8264';ctx.fillRect(x+Math.cos(a)*17-1,y+Math.sin(a)*11-1,2,2);}
      ctx.restore();
      if(active&&!this.reduced)for(let i=0;i<4;i++){const lift=(time*10+i*8)%28;ctx.globalAlpha=.4*(1-lift/28);ctx.fillStyle='#bce5b8';ctx.fillRect(x+(i-1.5)*6,y-lift,1,2);ctx.globalAlpha=1;}
      if(labels){ctx.font='600 8px system-ui, sans-serif';ctx.textAlign='center';ctx.fillStyle=active?'#b7d9c1':'#80948f';ctx.fillText(active?'帰還':'帰還 / 封鎖中',x,y+26);}
    }
    if(s&&this.canSee(s.x,s.y)){
      const sx=s.x,sy=s.y*Y_SCALE;
      ctx.save();this.clipVisible();ctx.fillStyle='#0c1716';ctx.fillRect(sx-15,sy-12,30,25);ctx.strokeStyle=active?'#bca178':'#64705d';ctx.lineWidth=2;ctx.strokeRect(sx-16,sy-13,32,26);
      for(let i=0;i<5;i++){ctx.fillStyle=['#79816b','#646f60','#515f52','#3b4b40','#29392f'][i];ctx.fillRect(sx-13+i,sy-10+i*4.2,26-i*2,3.5);}
      if(active){ctx.globalAlpha=.15;ctx.drawImage(this.atlas.glow('#dec38e'),sx-34,sy-30,68,50);ctx.globalAlpha=1;}ctx.restore();
      if(labels){ctx.font='600 8px system-ui, sans-serif';ctx.textAlign='center';ctx.fillStyle=active?'#d3c099':'#80948f';ctx.fillText(active?'次の階層':'階段 / 封鎖中',sx,sy+26);}
    }
  }
  drawBossGround(engine, time, labels) {
    const ctx = this.ctx, boss = engine.boss;
    if (!boss || !this.canSee(boss.x,boss.y)) return;
    const x = boss.x, y = boss.y * Y_SCALE;
    ctx.strokeStyle = '#65786b66'; ctx.lineWidth = 1;
    for (const radius of [54, 66, 123]) { ctx.beginPath(); ctx.ellipse(x, y, radius, radius * Y_SCALE, 0, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.fillStyle = '#8e95714d'; ctx.fillRect(x + Math.cos(a) * 65 - 2, y + Math.sin(a) * 65 * Y_SCALE - 2, 4, 4); }
    for (const wave of engine.waves ?? []) {
      ctx.strokeStyle = '#b95940'; ctx.lineWidth = 9; ctx.globalAlpha = .27;
      ctx.beginPath(); ctx.ellipse(wave.x, wave.y * Y_SCALE, Math.max(0, wave.r), Math.max(0, wave.r) * Y_SCALE, 0, wave.gap + wave.halfGap, wave.gap + TAU - wave.halfGap); ctx.stroke();
      ctx.strokeStyle = '#f5b180'; ctx.lineWidth = 2.3; ctx.globalAlpha = .9; ctx.stroke(); ctx.globalAlpha = 1;
    }
    const nextGap = ((engine.waveId ?? 0) * 2.3999632297) % TAU;
    ctx.strokeStyle = (engine.nextWaveAt ?? 4) - time < 1 ? '#f3c88c' : '#6cba9b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 55, 55 * Y_SCALE, 0, nextGap - .7, nextGap + .7); ctx.stroke();
    if (labels) { ctx.fillStyle = '#d5c6a2'; ctx.font = '600 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(time >= 120 ? '無限の守護者 / 終盤' : '無限の守護者', x, y - 91); }
  }
  drawBossHighlight(engine, time) {
    if (!engine.boss || !this.canSee(engine.boss.x,engine.boss.y)) return;
    const ctx = this.ctx, b = engine.boss;
    ctx.globalAlpha = .08 + Math.sin(time * 1.5) * .02;
    ctx.drawImage(this.atlas.glow('#d8b47b', 64), b.x - 52, b.y * Y_SCALE - 76, 104, 88); ctx.globalAlpha = 1;
  }
  drawEffects(effects, low) {
    const ctx = this.ctx, stride = Math.max(1, Math.ceil(effects.length / (low ? 65 : 140)));
    for (let i = 0; i < effects.length; i += stride) {
      const f = effects[i]; if (!this.canSee(f.x,f.y) || !this.visible(f.x, f.y, 15)) continue;
      if(f.type==='arc'&&!this.canSee(f.tx,f.ty))continue;
      const life = clamp(f.life / f.total, 0, 1), y = f.y * Y_SCALE - 12;
      ctx.globalAlpha = life * .75; ctx.strokeStyle = f.color || '#9addc6'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.1;
      if (f.type === 'slash' || f.type === 'thrust' || f.type === 'slam') {
        this.drawMeleeEffect(f,life);
      } else if (f.type === 'arc') {
        const tx = f.tx, ty = f.ty * Y_SCALE - 12;
        ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x + (tx - f.x) * .37 + 4, y + (ty - y) * .37 - 5);
        ctx.lineTo(f.x + (tx - f.x) * .6 - 3, y + (ty - y) * .6 + 4); ctx.lineTo(tx, ty); ctx.stroke();
      } else {
        const radius = (f.radius || (f.type === 'death' ? 14 : 6)) * (1.4 - life);
        ctx.beginPath(); ctx.ellipse(f.x, y, radius, radius * .72, 0, 0, TAU); ctx.stroke();
        if (f.type === 'death' || f.type === 'blast') for (let q = 0; q < 5; q++) {
          const a = q * TAU / 5 + f.x; ctx.fillRect(f.x + Math.cos(a) * radius - 1, y + Math.sin(a) * radius * .72 - 1, 2, 2);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  drawMeleeEffect(f,life) {
    const ctx=this.ctx,range=finite(f.range,45),angle=finite(f.angle),arc=finite(f.arc,1.3),progress=1-life;
    ctx.save();ctx.translate(f.x,f.y*Y_SCALE-(f.type==='slam'?1:12));ctx.scale(1,Y_SCALE);
    ctx.strokeStyle=f.color||'#ded9b1';ctx.fillStyle=ctx.strokeStyle;ctx.lineCap='round';
    if(f.type==='slash'){
      const start=angle-arc/2+progress*arc*.25,end=angle+arc/2;
      ctx.globalAlpha=life*.18;ctx.lineWidth=11;ctx.beginPath();ctx.arc(0,0,range*.72,start,end);ctx.stroke();
      ctx.globalAlpha=life*.85;ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,0,range*.78,start,end);ctx.stroke();
      ctx.globalAlpha=life*.35;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,range*.58,start+.15,end-.1);ctx.stroke();
    }else if(f.type==='thrust'){
      ctx.rotate(angle);ctx.globalAlpha=life*.25;ctx.fillRect(9,-5,range*(.7+.3*progress)-9,10);
      ctx.globalAlpha=life*.9;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(range*(.8+.2*progress),0);ctx.stroke();
      ctx.beginPath();ctx.moveTo(range,0);ctx.lineTo(range-7,-3);ctx.moveTo(range,0);ctx.lineTo(range-7,3);ctx.stroke();
    }else{
      ctx.globalAlpha=life*.7;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,range*(.5+.5*progress),0,TAU);ctx.stroke();
      for(let i=0;i<7;i++){const a=i*TAU/7+angle;const r=range*(.4+.6*progress);ctx.fillRect(Math.cos(a)*r-2,Math.sin(a)*r-2,4,3);}
    }
    ctx.restore();
  }
  drawVignette(width, height, low) {
    const ctx = this.ctx;
    if (!low) {
      const gradient = ctx.createRadialGradient(width * .5, height * .5, Math.min(width, height) * .21, width * .5, height * .5, Math.max(width, height) * .68);
      gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, '#06101999');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = '#07151b2b'; ctx.fillRect(0, 0, width, 1);
  }
  drawMinimap(engine, width, height) {
    const ctx = this.ctx, m = engine.map, p = engine.player;
    const size=height<300?1.6:width<620?2.1:2.6,mw=m.w*size,mh=m.h*size;
    const mx = width - mw - 19, my = Math.max(18, height - mh - 86);
    ctx.fillStyle = '#07151bd9'; ctx.fillRect(mx - 7, my - 7, mw + 14, mh + 14);
    ctx.strokeStyle = '#789a8544'; ctx.lineWidth = 1; ctx.strokeRect(mx - 7, my - 7, mw + 14, mh + 14);
    for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){
      const level=this.knowledge((x+.5)*m.tile,(y+.5)*m.tile);if(!level)continue;
      ctx.fillStyle=m.cells[y][x]===0?(level===2?'#59775e':'#293e32'):(level===2?'#7d8767':'#3d4b3b');
      ctx.fillRect(mx+x*size,my+y*size,size-.2,size-.2);
    }
    const markers = engine.isBoss ? [[engine.boss, '#e3b471'], [p, '#eef1d4']] : [[m.portal, '#86d2ac'], [m.stairs, '#d2b988'], [p, '#eef1d4']];
    for (const [o, color] of markers) { if (!o || (o!==p&&!this.canSee(o.x,o.y))) continue; ctx.fillStyle = color; ctx.fillRect(mx + o.x / m.tile * size - 1.7, my + o.y / m.tile * size - 1.7, 3.4, 3.4); }
  }
  drawStick(stick) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#c7dfd16b'; ctx.lineWidth = 1.5; ctx.fillStyle = '#10282955';
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 38, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9e5d59e'; ctx.beginPath(); ctx.arc(stick.ox + stick.x * 30, stick.oy + stick.y * 30, 12, 0, TAU); ctx.fill();
  }
  drawPause(width, height) {
    const ctx = this.ctx; ctx.fillStyle = '#07151dc9'; ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center'; ctx.fillStyle = '#dbe6cf'; ctx.font = '500 25px system-ui, sans-serif'; ctx.fillText('一時停止', width / 2, height / 2);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#a2b9b0'; ctx.fillText('再開ボタン / Space', width / 2, height / 2 + 30);
  }
}
