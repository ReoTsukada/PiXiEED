import {makeRng} from './core.mjs';
/** Seeded connected labyrinth. Every open tile is in the same component. */
export function makeMap(seed,floor) {
 const rng=makeRng((seed+Math.imul(floor,1013904223))>>>0),w=31,h=23,tile=36;
 const cells=Array.from({length:h},()=>Array(w).fill(1));const stack=[[1,1]];cells[1][1]=0;
 while(stack.length){const [x,y]=stack.at(-1);const options=[[2,0],[-2,0],[0,2],[0,-2]].filter(([dx,dy])=>x+dx>0&&x+dx<w-1&&y+dy>0&&y+dy<h-1&&cells[y+dy][x+dx]===1);
 if(!options.length){stack.pop();continue;}const [dx,dy]=options[Math.floor(rng()*options.length)];cells[y+dy/2][x+dx/2]=0;cells[y+dy][x+dx]=0;stack.push([x+dx,y+dy]);}
 // Open a central starting arena, then widen some corridors into rooms.
 for(let y=1;y<=7;y++)for(let x=1;x<=9;x++)cells[y][x]=0;
 for(let i=0;i<25;i++){const x=1+2*Math.floor(rng()*14),y=1+2*Math.floor(rng()*10);for(let yy=y;yy<Math.min(h-1,y+3);yy++)for(let xx=x;xx<Math.min(w-1,x+3);xx++)cells[yy][xx]=0;}
 const spawn={x:4.5*tile,y:4.5*tile};const spawnTile={x:4,y:4};
 const dist=distanceGrid({w,h,cells},spawnTile.x,spawnTile.y);const open=[];
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(!cells[y][x])open.push({x:(x+.5)*tile,y:(y+.5)*tile,tx:x,ty:y,d:dist[y][x]});
 const far=[...open].sort((a,b)=>b.d-a.d);const stairs=far[0];const portal={x:2.5*tile,y:4.5*tile};
 return {seed,floor,w,h,tile,cells,spawn,stairs,portal,open,width:w*tile,height:h*tile};
}
export function distanceGrid(map,sx,sy) {const d=Array.from({length:map.h},()=>Array(map.w).fill(-1));if(map.cells[sy]?.[sx]!==0)return d;const q=[[sx,sy]];d[sy][sx]=0;for(let i=0;i<q.length;i++){const[x,y]=q[i];for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(map.cells[ny]?.[nx]===0&&d[ny][nx]<0){d[ny][nx]=d[y][x]+1;q.push([nx,ny]);}}}return d;}
export function mapWall(map,x,y,r=0) {return [[-r,-r],[r,-r],[-r,r],[r,r]].some(([dx,dy])=>map.cells[Math.floor((y+dy)/map.tile)]?.[Math.floor((x+dx)/map.tile)]!==0);}
