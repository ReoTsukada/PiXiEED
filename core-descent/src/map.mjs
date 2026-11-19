import {makeRng} from './core.mjs';
import {biomeForFloor} from './world.mjs';

/**
 * Seeded rooms, joined by short two-tile-wide passages. World units stay in
 * pixels; room bounds, corridor points and door tiles use tile coordinates.
 * The simulation remains two-dimensional and never depends on the artwork.
 */
export function makeMap(seed,floor) {
 const rng=makeRng((seed+Math.imul(floor,1013904223))>>>0);
 const w=47,h=35,tile=32,columns=3,rows=3,sectorW=15,sectorH=11;
 const cells=Array.from({length:h},()=>Array(w).fill(1));
 const integer=(min,max)=>min+Math.floor(rng()*(max-min+1));
 const choose=list=>list[Math.floor(rng()*list.length)];
 const neighbors=id=>[id%columns>0?id-1:-1,id%columns<columns-1?id+1:-1,id>=columns?id-columns:-1,id<columns*(rows-1)?id+columns:-1].filter(n=>n>=0);

 // Begin with a 2x2 cluster: a loop can always be added, even on a six-room floor.
 const origin=integer(0,1)+integer(0,1)*columns;
 const selected=new Set([origin,origin+1,origin+columns,origin+columns+1]);
 const roomCount=integer(6,9);
 while(selected.size<roomCount){
  const frontier=[...new Set([...selected].flatMap(neighbors))].filter(id=>!selected.has(id));
  selected.add(choose(frontier));
 }
 const sectors=[...selected].sort((a,b)=>a-b);
 const startSector=choose([...selected]);
 const rooms=sectors.map((sector,id)=>{
  const rw=integer(8,11),rh=integer(6,8);
  const x=1+(sector%columns)*sectorW+integer(1,sectorW-rw-1);
  const y=1+Math.floor(sector/columns)*sectorH+integer(1,sectorH-rh-1);
  const kind=sector===startSector?'entrance':choose(['chamber','hall','vault','pillared']);
  const room={id,sector,x,y,w:rw,h:rh,kind,doors:[]};
  room.center={tx:x+Math.floor(rw/2),ty:y+Math.floor(rh/2)};
  room.center.x=(room.center.tx+.5)*tile;room.center.y=(room.center.ty+.5)*tile;
  for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++){
   const corner=(xx===x||xx===x+rw-1)&&(yy===y||yy===y+rh-1);
   if(kind!=='vault'||!corner)cells[yy][xx]=0;
  }
  if(kind==='pillared'&&rw>=10&&rh>=7){cells[y+2][x+2]=1;cells[y+rh-3][x+rw-3]=1;}
  return room;
 });
 const bySector=new Map(rooms.map(room=>[room.sector,room]));
 const entryRoom=bySector.get(startSector);

 // A random spanning tree guarantees connected rooms; extra adjacent links
 // introduce alternate escape paths without carving a maze across the floor.
 const visited=new Set([startSector]),connections=[];
 while(visited.size<rooms.length){
  const frontier=[];
  for(const from of visited)for(const to of neighbors(from))if(selected.has(to)&&!visited.has(to))frontier.push([from,to]);
  const edge=choose(frontier);connections.push(edge);visited.add(edge[1]);
 }
 const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
 const existing=new Set(connections.map(([a,b])=>edgeKey(a,b)));
 const extras=[];
 for(const from of sectors)for(const to of neighbors(from))if(to>from&&selected.has(to)&&!existing.has(edgeKey(from,to)))extras.push([from,to]);
 const extraCount=Math.min(extras.length,integer(1,3));
 for(let i=0;i<extraCount;i++){const at=integer(0,extras.length-1);connections.push(extras.splice(at,1)[0]);}

 const doors=[],corridors=[];
 function door(room,tx,ty,axis,corridorId){
  const tiles=axis==='vertical'?[[tx,ty],[tx,ty+1]]:[[tx,ty],[tx+1,ty]];
  const value={id:doors.length,roomId:room.id,corridorId,tx,ty,axis,tiles,
   x:(tx+(axis==='vertical'?.5:1))*tile,y:(ty+(axis==='vertical'?1:.5))*tile};
  room.doors.push(value.id);doors.push(value);
 }
 for(const [from,to]of connections){
  let a=bySector.get(from),b=bySector.get(to);const id=corridors.length;
  let points;
  if(Math.floor(from/columns)===Math.floor(to/columns)){
   if(a.x>b.x)[a,b]=[b,a];
   const ay=a.center.ty-1,by=b.center.ty-1,middle=Math.floor((a.x+a.w+b.x-2)/2);
   points=[[a.x+a.w-1,ay],[middle,ay],[middle,by],[b.x,by]];
   door(a,a.x+a.w-1,ay,'vertical',id);door(b,b.x,by,'vertical',id);
  }else{
   if(a.y>b.y)[a,b]=[b,a];
   const ax=a.center.tx-1,bx=b.center.tx-1,middle=Math.floor((a.y+a.h+b.y-2)/2);
   points=[[ax,a.y+a.h-1],[ax,middle],[bx,middle],[bx,b.y]];
   door(a,ax,a.y+a.h-1,'horizontal',id);door(b,bx,b.y,'horizontal',id);
  }
  const carved=new Set();
  for(let i=1;i<points.length;i++){
   let [x,y]=points[i-1];const [tx,ty]=points[i],dx=Math.sign(tx-x),dy=Math.sign(ty-y);
   for(;;){
    for(let yy=y;yy<=y+1;yy++)for(let xx=x;xx<=x+1;xx++)if(xx>0&&yy>0&&xx<w-1&&yy<h-1){cells[yy][xx]=0;carved.add(yy*w+xx);}
    if(x===tx&&y===ty)break;x+=dx;y+=dy;
   }
  }
  corridors.push({id,from:a.id,to:b.id,width:2,points,tiles:[...carved].map(index=>({tx:index%w,ty:Math.floor(index/w)}))});
 }

 const spawn={x:entryRoom.center.x,y:entryRoom.center.y};
 const portal={x:(entryRoom.x+1.5)*tile,y:entryRoom.center.y,roomId:entryRoom.id};
 const dist=distanceGrid({w,h,cells},entryRoom.center.tx,entryRoom.center.ty);
 const open=[];
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(cells[y][x]===0)open.push({x:(x+.5)*tile,y:(y+.5)*tile,tx:x,ty:y,d:dist[y][x]});
 // Exits belong to rooms, rather than ending in a corridor or one-cell dead end.
 let stairs=null;
 for(const room of rooms)if(room!==entryRoom){
  for(let y=room.y+1;y<room.y+room.h-1;y++)for(let x=room.x+1;x<room.x+room.w-1;x++){
   if(cells[y][x]===0&&(!stairs||dist[y][x]>stairs.d))stairs={x:(x+.5)*tile,y:(y+.5)*tile,tx:x,ty:y,d:dist[y][x],roomId:room.id};
  }
 }
 const biome=biomeForFloor(floor),hazards=[];
 // Terrain never blocks a route. Keep the entrance, all exits, and boss landing clear.
 if(biome.hazard)for(const room of rooms){
  if(room.id===entryRoom.id)continue;
  const spots=open.filter(t=>t.tx>room.x&&t.tx<room.x+room.w-1&&t.ty>room.y&&t.ty<room.y+room.h-1&&[spawn,portal,stairs,room.center].every(p=>Math.hypot(t.x-p.x,t.y-p.y)>76));
  if(!spots.length)continue;const at=choose(spots),radius=biome.hazard==='lava'?21:25;
  hazards.push({id:hazards.length,x:at.x,y:at.y,kind:biome.hazard,radius,damageFactor:biome.hazard==='lava'?.38:biome.hazard==='poison'?.18:0,slowFactor:biome.hazard==='sand'?.62:biome.hazard==='ice'?.72:biome.hazard==='poison'?.82:1});
 }
 return {seed,floor,w,h,tile,cells,spawn,stairs,portal,open,rooms,corridors,doors,hazards,biomeId:biome.id,entryRoomId:entryRoom.id,
  width:w*tile,height:h*tile,layoutVersion:'biomes-1'};
}
export function distanceGrid(map,sx,sy) {const d=Array.from({length:map.h},()=>Array(map.w).fill(-1));if(map.cells[sy]?.[sx]!==0)return d;const q=[[sx,sy]];d[sy][sx]=0;for(let i=0;i<q.length;i++){const[x,y]=q[i];for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(map.cells[ny]?.[nx]===0&&d[ny][nx]<0){d[ny][nx]=d[y][x]+1;q.push([nx,ny]);}}}return d;}
export function mapWall(map,x,y,r=0) {
 // Large guardians span more than two tiles: testing four corners alone can miss a pillar inside their footprint.
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r)||r<0)return true;
 const minX=Math.floor((x-r)/map.tile),maxX=Math.floor((x+r)/map.tile),minY=Math.floor((y-r)/map.tile),maxY=Math.floor((y+r)/map.tile);
 for(let ty=minY;ty<=maxY;ty++)for(let tx=minX;tx<=maxX;tx++)if(map.cells[ty]?.[tx]!==0)return true;
 return false;
}
