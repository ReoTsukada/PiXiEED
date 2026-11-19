import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMap,distanceGrid,mapWall} from '../src/map.mjs';
import {createExploration,updateExploration,isVisible,isExplored,lineOfSight} from '../src/fog.mjs';

function fixture(lines){return {w:lines[0].length,h:lines.length,tile:32,cells:lines.map(row=>[...row].map(c=>c==='#'?1:0))};}
const center=(x,y)=>({x:(x+.5)*32,y:(y+.5)*32});
const sight=(map,ax,ay,bx,by)=>lineOfSight(map,...Object.values(center(ax,ay)),...Object.values(center(bx,by)));
const contains=(room,tx,ty)=>tx>=room.x&&ty>=room.y&&tx<room.x+room.w&&ty<room.y+room.h;

test('部屋構成・通路・扉・出口は同じシードと階層で再現する',()=>{
 assert.deepEqual(makeMap(90210,12),makeMap(90210,12));
 const layouts=new Set(Array.from({length:12},(_,i)=>JSON.stringify(makeMap(90210,i+1).cells)));
 assert.equal(layouts.size,12);
 assert.notDeepEqual(makeMap(1,12).cells,makeMap(2,12).cells);
});

test('300階の生成で全床が連結し、外周と開始点・出口が安全',()=>{
 for(let seed=0;seed<300;seed++){
  const map=makeMap(seed,seed*3+1),sx=Math.floor(map.spawn.x/map.tile),sy=Math.floor(map.spawn.y/map.tile);
  const distances=distanceGrid(map,sx,sy);
  assert.equal(map.tile,32);assert.equal(map.width,map.w*32);assert.equal(map.height,map.h*32);
  for(const cell of map.open){assert.ok(distances[cell.ty][cell.tx]>=0,`seed=${seed}`);assert.equal(cell.d,distances[cell.ty][cell.tx]);}
  assert.equal(map.cells.flat().filter(v=>v===0).length,map.open.length);
  assert.ok(map.cells[0].every(v=>v===1)&&map.cells.at(-1).every(v=>v===1));
  assert.ok(map.cells.every(row=>row[0]===1&&row.at(-1)===1));
  for(const point of [map.spawn,map.portal,map.stairs])assert.equal(mapWall(map,point.x,point.y,9),false);
  assert.ok(Math.hypot(map.spawn.x-map.portal.x,map.spawn.y-map.portal.y)>=64);
 }
});

test('広い6〜9室を短い通路で接続し、必ず別経路を持つ',()=>{
 const counts=new Set(),shapes=new Set();
 for(let seed=0;seed<100;seed++){
  const map=makeMap(seed,19),{rooms,corridors}=map;
  counts.add(rooms.length);
  assert.ok(rooms.length>=6&&rooms.length<=9);
  for(const room of rooms){assert.ok(room.w>=8&&room.h>=6);shapes.add(room.kind);assert.equal(map.cells[room.center.ty][room.center.tx],0);}
  // A connected graph with at least N edges has a cycle; routes are unique.
  assert.ok(corridors.length>=rooms.length);
  assert.equal(new Set(corridors.map(c=>[c.from,c.to].sort((a,b)=>a-b).join(':'))).size,corridors.length);
  const roomFloor=map.open.filter(cell=>rooms.some(room=>contains(room,cell.tx,cell.ty))).length;
  assert.ok(roomFloor/map.open.length>.65,`rooms must dominate floor area: ${seed}`);
  const corridorTiles=new Set(corridors.flatMap(c=>c.tiles.map(p=>p.ty*map.w+p.tx)));
  assert.ok(map.open.every(cell=>rooms.some(room=>contains(room,cell.tx,cell.ty))||corridorTiles.has(cell.ty*map.w+cell.tx)));
 }
 assert.deepEqual([...counts].sort(),[6,7,8,9]);
 assert.ok(shapes.has('vault')&&shapes.has('pillared'));
});

test('通路は2マス幅で、接続先の各室に通れる入口を持つ',()=>{
 for(let seed=0;seed<30;seed++){
  const map=makeMap(seed,7);
  assert.equal(map.doors.length,map.corridors.length*2);
  for(const corridor of map.corridors){
   assert.equal(corridor.width,2);
   assert.ok(corridor.tiles.length<80,'corridor stays short between neighboring rooms');
   for(const point of corridor.tiles)assert.equal(map.cells[point.ty][point.tx],0);
   for(let i=1;i<corridor.points.length;i++){
    const [x0,y0]=corridor.points[i-1],[x1,y1]=corridor.points[i];
    assert.ok(x0===x1||y0===y1);
    for(let y=Math.min(y0,y1);y<=Math.max(y0,y1)+1;y++)for(let x=Math.min(x0,x1);x<=Math.max(x0,x1)+1;x++)assert.equal(map.cells[y][x],0);
   }
  }
  for(const door of map.doors){
   assert.equal(door.tiles.length,2);
   assert.ok(map.rooms[door.roomId].doors.includes(door.id));
   for(const [tx,ty]of door.tiles){assert.equal(map.cells[ty][tx],0);assert.ok(contains(map.rooms[door.roomId],tx,ty));}
  }
 }
});

test('帰還陣は開始室、階段は到達距離が最大の別室内',()=>{
 for(let seed=0;seed<40;seed++){
  const map=makeMap(seed,5),room=map.rooms[map.entryRoomId];
  assert.equal(map.portal.roomId,room.id);assert.notEqual(map.stairs.roomId,room.id);
  assert.ok(contains(room,Math.floor(map.spawn.x/32),Math.floor(map.spawn.y/32)));
  assert.ok(contains(room,Math.floor(map.portal.x/32),Math.floor(map.portal.y/32)));
  assert.ok(contains(map.rooms[map.stairs.roomId],map.stairs.tx,map.stairs.ty));
  const eligible=map.open.filter(c=>map.rooms.some(r=>r.id!==room.id&&c.tx>r.x&&c.ty>r.y&&c.tx<r.x+r.w-1&&c.ty<r.y+r.h-1));
  assert.equal(map.stairs.d,Math.max(...eligible.map(c=>c.d)));
 }
});

test('壁自身まで見え、壁の背後と範囲外への視線は通らない',()=>{
 const map=fixture(['#######','#..#..#','#..#..#','#..#..#','#######']);
 assert.equal(sight(map,1,2,2,2),true);
 assert.equal(sight(map,1,2,3,2),true);
 assert.equal(sight(map,1,2,4,2),false);
 assert.equal(sight(map,1,2,5,2),false);
 assert.equal(lineOfSight(map,48,80,-10,80),false);
 assert.equal(lineOfSight(map,NaN,80,48,80),false);
});

test('斜めの壁角から隣室を覗けない（片側だけ壁でも遮断）',()=>{
 const one=fixture(['#####','#.#.#','#...#','#...#','#####']);
 assert.equal(sight(one,1,1,2,2),false);
 assert.equal(sight(one,2,2,1,1),false);
 const both=fixture(['#####','#.#.#','##..#','#...#','#####']);
 assert.equal(sight(both,1,1,2,2),false);
 const open=fixture(['#####','#...#','#...#','#...#','#####']);
 assert.equal(sight(open,1,1,3,3),true);
 assert.equal(sight(open,3,3,1,1),true);
});

test('部屋間の開口部越しは見え、同じ壁の閉じた部分では遮る',()=>{
 const map=fixture(['#########','#...#...#','#.......#','#.......#','#...#...#','#########']);
 assert.equal(sight(map,2,2,6,2),true);
 assert.equal(sight(map,2,3,6,3),true);
 assert.equal(sight(map,2,1,6,1),false);
 assert.equal(sight(map,2,4,6,4),false);
});

test('視線は実際の世界座標で壁との交差を判定する',()=>{
 const map=fixture(['######','#....#','#.#..#','#....#','######']);
 assert.equal(lineOfSight(map,35,61,155,61),true);
 assert.equal(lineOfSight(map,35,66,155,66),false);
});

test('未踏の地図は初期状態で非表示、照らされた円の範囲だけを開く',()=>{
 const map=fixture(['#########','#.......#','#.......#','#.......#','#.......#','#.......#','#########']);
 const state=createExploration(map),p=center(4,3);
 assert.ok(state.visible instanceof Uint8Array&&state.explored instanceof Uint8Array);
 assert.equal(state.visible.some(Boolean),false);assert.equal(state.explored.some(Boolean),false);
 updateExploration(map,p,state,{radius:2});
 assert.equal(isVisible(map,state,p.x,p.y),true);
 assert.equal(isVisible(map,state,...Object.values(center(6,3))),true);
 assert.equal(isVisible(map,state,...Object.values(center(6,5))),false);
 assert.equal(isExplored(map,state,...Object.values(center(7,3))),false);
});

test('探索光は壁の後ろへ漏れないが、手前の壁は地図へ残す',()=>{
 const map=fixture(['#########','#...#...#','#...#...#','#...#...#','#########']),state=createExploration(map);
 updateExploration(map,center(2,2),state,{radius:12});
 assert.equal(isVisible(map,state,...Object.values(center(4,2))),true);
 assert.equal(isExplored(map,state,...Object.values(center(4,2))),true);
 assert.equal(isVisible(map,state,...Object.values(center(5,2))),false);
 assert.equal(isExplored(map,state,...Object.values(center(5,2))),false);
});

test('移動すると可視範囲は変わり、探索済み範囲は消えない',()=>{
 const map=fixture(['############','#..........#','#..........#','#..........#','############']),state=createExploration(map);
 const left=center(2,2),right=center(9,2);
 updateExploration(map,left,state,{radius:2});const before=state.explored.slice();
 updateExploration(map,right,state,{radius:2});
 assert.equal(isVisible(map,state,left.x,left.y),false);
 assert.equal(isExplored(map,state,left.x,left.y),true);
 assert.equal(isVisible(map,state,right.x,right.y),true);
 for(let i=0;i<before.length;i++)if(before[i])assert.equal(state.explored[i],1);
});

test('同一タイル内の移動はマスクを再計算せず、半径変更では更新',()=>{
 const map=makeMap(8,1),state=createExploration(map),p=map.spawn;
 assert.equal(updateExploration(map,p,state,{radius:6}),state);const revision=state.revision;
 const visible=state.visible,mask=visible.slice();
 updateExploration(map,{x:p.x+3,y:p.y+3},state,{radius:6});
 assert.equal(state.revision,revision);assert.equal(state.visible,visible);assert.deepEqual(state.visible,mask);
 updateExploration(map,p,state,{radius:12});assert.equal(state.revision,revision+1);
});

test('別の階層へ移った時は探索済みをリセットする（同サイズでも）',()=>{
 const first=makeMap(2,1),next=makeMap(2,2),state=createExploration(first,{revealAll:true});
 assert.ok(state.explored.every(Boolean));
 updateExploration(next,next.spawn,state,{radius:3});
 assert.equal(state.revealAll,false);assert.ok(state.explored.some(v=>v===0));
 assert.equal(isVisible(next,state,next.spawn.x,next.spawn.y),true);
 assert.equal(isVisible(first,state,first.spawn.x,first.spawn.y),false);
 const fresh=createExploration(next);assert.equal(fresh.explored.some(Boolean),false);
});

test('ボス用の全開示を保持でき、通常光へ切り替えても既探索は残る',()=>{
 const map=makeMap(9,1),state=createExploration(map,{revealAll:true});
 assert.ok(state.visible.every(Boolean)&&state.explored.every(Boolean));
 updateExploration(map,map.spawn,state);
 assert.ok(state.visible.every(Boolean)&&state.explored.every(Boolean));
 updateExploration(map,map.spawn,state,{revealAll:false,radius:2});
 assert.ok(state.visible.some(v=>v===0));assert.ok(state.explored.every(Boolean));
});

test('範囲外照会は非表示とし、無効な半径・座標を拒否する',()=>{
 const map=makeMap(1,1),state=createExploration(map);
 assert.equal(isVisible(map,state,-1,-1),false);
 assert.equal(isExplored(map,state,map.width+1,map.height+1),false);
 assert.equal(isVisible(map,null,10,10),false);
 assert.throws(()=>updateExploration(map,map.spawn,state,{radius:-1}),RangeError);
 assert.throws(()=>updateExploration(map,map.spawn,state,{radius:Infinity}),RangeError);
 assert.throws(()=>updateExploration(map,{x:NaN,y:0},state),TypeError);
});

test('探索更新が地形や乱数に依存するマップ情報を書き換えない',()=>{
 const map=makeMap(121,15),before=JSON.stringify(map),state=createExploration(map);
 for(const room of map.rooms)updateExploration(map,room.center,state,{radius:7});
 assert.equal(JSON.stringify(map),before);
});
