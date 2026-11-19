/**
 * Pure, tile-cached exploration. Masks are flat Uint8Arrays, indexed y*w+x.
 * Radius is measured in tiles. No game RNG, stats, saves or DOM are accessed.
 * A boundary wall is visible; a cell behind it is not. Diagonal corner peeking
 * is blocked if either side of the crossed corner is solid.
 */
function validFogMap(map){
 if(!map||!Number.isInteger(map.w)||!Number.isInteger(map.h)||map.w<1||map.h<1||!Number.isFinite(map.tile)||map.tile<=0||!Array.isArray(map.cells)||map.cells.length!==map.h)throw new TypeError('Exploration requires a tile map');
}
function inFogMap(map,x,y){return x>=0&&y>=0&&x<map.w&&y<map.h;}
function fogOpen(map,x,y){return inFogMap(map,x,y)&&map.cells[y]?.[x]===0;}

export function createExploration(map,{revealAll=false}={}){
 validFogMap(map);
 const state={width:map.w,height:map.h,visible:new Uint8Array(map.w*map.h),explored:new Uint8Array(map.w*map.h),revision:0,
  revealAll:!!revealAll,radius:6,originX:0,originY:0,_map:map,_tileX:null,_tileY:null,_cachedRadius:null,_cachedReveal:null};
 if(revealAll){state.visible.fill(1);state.explored.fill(1);state.revision=1;state._cachedReveal=true;}
 return state;
}

/** World-space supercover ray, with the endpoint wall itself included. */
export function lineOfSight(map,x1,y1,x2,y2){
 if(!map||![x1,y1,x2,y2].every(Number.isFinite)||!Number.isFinite(map.tile)||map.tile<=0)return false;
 const x0=x1/map.tile,y0=y1/map.tile,xEnd=x2/map.tile,yEnd=y2/map.tile;
 let x=Math.floor(x0),y=Math.floor(y0);const tx=Math.floor(xEnd),ty=Math.floor(yEnd);
 if(!fogOpen(map,x,y)||!inFogMap(map,tx,ty))return false;
 if(x===tx&&y===ty)return true;
 const dx=xEnd-x0,dy=yEnd-y0,sx=Math.sign(dx),sy=Math.sign(dy);
 const deltaX=sx?1/Math.abs(dx):Infinity,deltaY=sy?1/Math.abs(dy):Infinity;
 let nextX=sx>0?(x+1-x0)*deltaX:sx<0?(x0-x)*deltaX:Infinity;
 let nextY=sy>0?(y+1-y0)*deltaY:sy<0?(y0-y)*deltaY:Infinity;
 for(let i=0;i<map.w+map.h+2;i++){
  if(Math.abs(nextX-nextY)<1e-10){
   if(!fogOpen(map,x+sx,y)||!fogOpen(map,x,y+sy))return false;
   x+=sx;y+=sy;nextX+=deltaX;nextY+=deltaY;
  }else if(nextX<nextY){x+=sx;nextX+=deltaX;}
  else{y+=sy;nextY+=deltaY;}
  if(!inFogMap(map,x,y))return false;
  if(x===tx&&y===ty)return true;
  if(!fogOpen(map,x,y))return false;
 }
 return false;
}

/** Updates in place and returns the same state. revision changes with its mask. */
export function updateExploration(map,player,state,options={}){
 validFogMap(map);
 if(!state||typeof state!=='object')throw new TypeError('An exploration state is required');
 const sameMap=state._map===map;
 const revealAll=options.revealAll??(sameMap&&state.revealAll);
 const radius=options.radius??6;
 if(!Number.isFinite(radius)||radius<0)throw new RangeError('Exploration radius must be finite and nonnegative');
 if(!player||!Number.isFinite(player.x)||!Number.isFinite(player.y))throw new TypeError('Player position must be finite');
 if(!sameMap||state.width!==map.w||state.height!==map.h){
  const revision=Number.isInteger(state.revision)?state.revision:0;
  Object.assign(state,createExploration(map));state.revision=revision;
 }
 const tx=Math.floor(player.x/map.tile),ty=Math.floor(player.y/map.tile);
 state.originX=player.x;state.originY=player.y;state.radius=radius;state.revealAll=!!revealAll;
 if(state._tileX===tx&&state._tileY===ty&&state._cachedRadius===radius&&state._cachedReveal===!!revealAll)return state;
 state.visible.fill(0);
 if(revealAll){state.visible.fill(1);state.explored.fill(1);}
 else if(fogOpen(map,tx,ty)){
  const centerX=(tx+.5)*map.tile,centerY=(ty+.5)*map.tile;
  const extent=Math.ceil(Math.min(radius,Math.max(map.w,map.h)));
  for(let y=Math.max(0,ty-extent);y<=Math.min(map.h-1,ty+extent);y++)for(let x=Math.max(0,tx-extent);x<=Math.min(map.w-1,tx+extent);x++){
   if((x-tx)**2+(y-ty)**2>radius*radius)continue;
   if(lineOfSight(map,centerX,centerY,(x+.5)*map.tile,(y+.5)*map.tile)){
    const index=y*map.w+x;state.visible[index]=1;state.explored[index]=1;
   }
  }
 }
 state._tileX=tx;state._tileY=ty;state._cachedRadius=radius;state._cachedReveal=!!revealAll;state.revision++;
 return state;
}

function fogLookup(map,state,mask,worldX,worldY){
 if(!map||!state||state._map!==map||![worldX,worldY].every(Number.isFinite))return false;
 const x=Math.floor(worldX/map.tile),y=Math.floor(worldY/map.tile);
 return inFogMap(map,x,y)&&state[mask]?.[y*map.w+x]===1;
}
export function isVisible(map,state,worldX,worldY){return fogLookup(map,state,'visible',worldX,worldY);}
export function isExplored(map,state,worldX,worldY){return fogLookup(map,state,'explored',worldX,worldY);}
