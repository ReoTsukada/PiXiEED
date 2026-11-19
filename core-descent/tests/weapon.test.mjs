import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS,weaponForDigit} from '../src/weapons.mjs';
import {CORE_DEFS} from '../src/catalog.mjs';
import {compileBoard,makeItem,makeProfile,checkProfile,ensureStarterWeapons,laboratory,validateBoard} from '../src/core.mjs';
import {GameEngine} from '../src/engine.mjs';
import {BossTrial} from '../src/boss.mjs';
import {createExploration} from '../src/fog.mjs';
import {expectedDirect} from '../src/combat-math.mjs';
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
function spec(digit){const item=makeItem('root',digit,'emitter');return {...compileBoard([['root']],[item]),crit:0};}
function arena(digit=0){
 const e=new GameEngine(spec(digit),{seed:711}),w=35,h=25,tile=32;
 const cells=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>+(x===0||y===0||x===w-1||y===h-1)));
 e.map={w,h,tile,cells,width:w*tile,height:h*tile,spawn:{x:400,y:400},portal:{x:48,y:48},stairs:{x:1000,y:720},open:[]};
 Object.assign(e.player,e.map.spawn,{still:1});e.exploration=createExploration(e.map);e.spec.vision=24;e.updateSight();e.enemies=[];e.spawn=()=>{};e.goalTime=Infinity;
 return e;
}
function foe(e,x,y=0,id=e.enemies.length+500){const enemy={id,x:e.player.x+x,y:e.player.y+y,hp:1e8,maxHp:1e8,r:8,warm:0,speed:0,poison:0,poisonDps:0,slow:0,flash:0,color:'#fff'};e.enemies.push(enemy);return enemy;}
function run(e,seconds){for(let n=0;n<Math.ceil(seconds*60);n++)e.tick(1/60);}
function travel(e,b,seconds){for(let n=0;n<Math.ceil(seconds*120)&&b.life>0;n++)e.stepBullet(b,1/120);}

test('固定数字0〜9はクラスではなく頂点の10武器に対応する',()=>{
 assert.deepEqual(WEAPONS.map(w=>w.id),['sword','dagger','greatsword','spear','axe','hammer','bow','chakram','staff','spellbook']);
 for(let d=0;d<10;d++){const s=spec(d);assert.ok(s.weapon);assert.equal(s.weapon.id,weaponForDigit(d).id);near(s.damage,WEAPONS[d].baseDamage*1.02);near(s.rate,WEAPONS[d].baseRate);near(s.range,WEAPONS[d].range);}
 for(const invalid of[-1,10,.2,NaN])assert.throws(()=>weaponForDigit(invalid));
});
test('10武器の全段数の実験用配置は数字条件が成立する',()=>{
 for(let digit=0;digit<10;digit++)for(let depth=3;depth<=9;depth++){
  const p=laboratory('storm',depth,digit);assert.ok(validateBoard(p.board,p.inventory).valid);assert.equal(compileBoard(p.board,p.inventory).weapon.digit,digit);
 }
});
test('通常の頂点交換は自動でパズルを解かない',()=>{
 const p=makeProfile(),before=structuredClone(p.board.slice(1));p.board[0][0]=p.inventory.find(i=>i.type==='emitter'&&i.digit===0).id;
 assert.deepEqual(p.board.slice(1),before);assert.equal(validateBoard(p.board,p.inventory).valid,false);
});
test('スターター武器移行は冪等で既存の個体値・所持品・プリセットを保持',()=>{
 const old=makeProfile();old.inventory=old.inventory.filter(it=>!it.id.startsWith('starter-weapon-'));
 old.inventory.push(makeItem('rare-sword',0,'emitter',{rarity:'legendary',rolls:{damage:10456}}));
 old.presets=[{name:'旧編成',board:structuredClone(old.board)}];const original=structuredClone(old.inventory),presets=structuredClone(old.presets);
 const migrated=checkProfile(old),count=migrated.inventory.length;
 for(const it of original)assert.deepEqual(migrated.inventory.find(x=>x.id===it.id),it);
 ensureStarterWeapons(migrated);checkProfile(migrated);assert.equal(migrated.inventory.length,count);assert.deepEqual(migrated.presets,presets);
 for(let d=0;d<10;d++)assert.ok(migrated.inventory.some(x=>x.type==='emitter'&&x.digit===d));
});
test('下段の武装の核は武器を変更せず従来どおり加算する',()=>{
 const p=makeProfile();const before=compileBoard(p.board,p.inventory);p.inventory.push(makeItem('low-root',2,'emitter'));p.board[2][1]='low-root';
 const after=compileBoard(p.board,p.inventory);assert.equal(after.weapon.id,before.weapon.id);assert.equal(after.weapon.digit,9);near(after.raw.damage,before.raw.damage+.04);
});
test('全10武器が実シミュレーションで敵へダメージを与える',()=>{
 for(let digit=0;digit<10;digit++){
  const e=arena(digit),target=foe(e,Math.max(28,Math.min(130,e.spec.range*.65)));run(e,1.4);
  assert.ok(target.hp<target.maxHp,`${weaponForDigit(digit).id} did not hit`);assert.ok(Number.isFinite(e.totalDamage));
 }
});
test('6種の近接は弾丸ではなく攻撃範囲で命中判定する',()=>{
 for(let digit=0;digit<6;digit++){const e=arena(digit);foe(e,35);assert.ok(e.volley());assert.ok(e.totalDamage>0);assert.equal(e.bullets.length,0);assert.ok(e.fx.some(f=>['slash','thrust','slam'].includes(f.type)));}
});
test('短剣は3打目1.8倍、2秒空くと連撃が途切れる',()=>{
 const e=arena(1);foe(e,30);for(let i=0;i<3;i++)e.volley();near(e.totalDamage,e.spec.damage*3.8);
 const before=e.totalDamage;e.totalTime=3;e.volley();near(e.totalDamage-before,e.spec.damage);
 near(expectedDirect({...e.spec,crit:0}).dps,e.spec.damage*e.spec.rate*(1+.8/3));
});
test('剣は背後に当たらず3体を巻き込み、貫通で上限が伸びる',()=>{
 const e=arena(0),front=foe(e,30),others=[foe(e,40,10),foe(e,40,-10),foe(e,50)],back=foe(e,-40);
 e.volley();assert.ok(front.hp<front.maxHp);assert.equal(others.filter(x=>x.hp<x.maxHp).length,2);assert.equal(back.hp,back.maxHp);
 for(const t of e.enemies)t.hp=t.maxHp;e.spec.pierce=1;e.volley();assert.ok(others.every(x=>x.hp<x.maxHp));assert.equal(back.hp,back.maxHp);
});
test('槍は直線を複数貫き、横の敵を巻き込まない',()=>{
 const e=arena(3),a=foe(e,35),b=foe(e,80),c=foe(e,105),side=foe(e,50,34);e.volley();
 for(const t of[a,b,c])assert.ok(t.hp<t.maxHp);assert.equal(side.hp,side.maxHp);
});
test('斧は剣より左右の広い範囲に届く',()=>{
 for(const digit of[0,4]){const e=arena(digit);foe(e,25);const side=foe(e,-12,40);e.volley();assert.equal(side.hp<side.maxHp,digit===4);}
});
test('槌は敵を押し戻し、無限ボスには位置を変更しない',()=>{
 const e=arena(5),a=foe(e,35);const x=a.x;e.volley();near(a.x-x,24);
 const b=new BossTrial(spec(5));Object.assign(b.player,{x:b.boss.x,y:b.boss.y+60,still:1});const original={x:b.boss.x,y:b.boss.y};b.volley();assert.deepEqual({x:b.boss.x,y:b.boss.y},original);assert.ok(b.totalDamage>0);
});
test('近接への追尾は薙ぎ幅を増やす',()=>{
 const e=arena(0);foe(e,25);const side=foe(e,0,48);e.volley();assert.equal(side.hp,side.maxHp);e.spec.homing=5;e.volley();assert.ok(side.hp<side.maxHp);
});
test('近接の反射は45%反響斬、分裂は魔力の欠片になる',()=>{
 const e=arena(0),main=foe(e,25),side=foe(e,25,80);e.spec.bounce=1;e.spec.split=2;e.volley();
 near(main.maxHp-main.hp,e.spec.damage,1e-6);near(side.maxHp-side.hp,e.spec.damage*.45,1e-6);assert.equal(e.bullets.length,2);assert.ok(e.bullets.every(b=>b.kind==='shard'&&b.gen===1));
});
test('全武器で毒・鈍足・吸収・回復連撃の共通効果を引き継ぐ',()=>{
 for(const digit of[0,3,6,8,9]){const e=arena(digit);e.spec.poison=.5;e.spec.slow=.5;e.spec.drain=.3;e.spec.recovery=1;e.player.hp-=30;const enemy=foe(e,35);run(e,.25);assert.ok(enemy.poison>0);assert.ok(enemy.slow>0);assert.ok(e.player.hp>70);}
});
test('弓の矢は基礎貫通で2体目に命中する',()=>{
 const e=arena(6),a=foe(e,70),b=foe(e,140),shot=e.bullet(e.player.x,e.player.y,0);travel(e,shot,.5);assert.ok(a.hp<a.maxHp);assert.ok(b.hp<b.maxHp);
});
test('矢は射程の終端を越えて飛ばない',()=>{
 const e=arena(6);e.spec.range=100;const far=foe(e,140),shot=e.bullet(e.player.x,e.player.y,0);travel(e,shot,1);assert.equal(far.hp,far.maxHp);near(shot.distance,100);assert.ok(shot.life<=0);
});
test('刃輪は往路と復路に同じ敵へ一度ずつ命中する',()=>{
 const e=arena(7),a=foe(e,100),shot=e.bullet(e.player.x,e.player.y,0);travel(e,shot,2);near(a.maxHp-a.hp,e.spec.damage*2,1e-6);assert.ok(shot.returning);assert.ok(shot.life<=0);
});
test('刃輪の貫通強化は命中時35%の追加斬撃へ変換',()=>{
 const e=arena(7);e.spec.pierce=2;const a=foe(e,100),shot=e.bullet(e.player.x,e.player.y,0);travel(e,shot,2);near(a.maxHp-a.hp,e.spec.damage*2*(1+.35*2),1e-6);
});
test('杖の魔力球は初回命中で別の敵へ70%の爆発',()=>{
 const e=arena(8),a=foe(e,90),b=foe(e,100,30),shot=e.bullet(e.player.x,e.player.y,0);travel(e,shot,.6);near(a.maxHp-a.hp,e.spec.damage,1e-6);near(b.maxHp-b.hp,e.spec.damage*.7,1e-6);
});
test('魔導書は0.1秒間隔で3つの魔弾を発射する',()=>{
 const e=arena(9);foe(e,180);e.volley();assert.equal(e.bullets.length,1);assert.equal(e.pendingBursts.length,2);e.shotTimer=100;run(e,.22);assert.equal(e.bullets.length,3);assert.equal(e.pendingBursts.length,0);assert.ok(e.bullets.every(b=>b.kind==='rune'));
});
test('射程内でも壁・霧の背後へ自動照準しない',()=>{
 const e=arena(6),target=foe(e,300);e.spec.vision=8;e.updateSight();assert.equal(e.target(e.player.x,e.player.y),null);assert.equal(e.volley(),false);
 e.spec.vision=12;e.updateSight();assert.equal(e.target(e.player.x,e.player.y),target);
 e.map.cells[Math.floor(e.player.y/32)][Math.floor((e.player.x+64)/32)]=1;assert.equal(e.target(e.player.x,e.player.y),null);assert.equal(e.volley(),false);
});
test('近接・弾・周辺爆発は壁越しに命中しない',()=>{
 for(const digit of[0,3,6,8]){const e=arena(digit),far=foe(e,100);e.map.cells[12][14]=1;e.updateSight();e.spec.blast=1;
  if(digit<6){e.spec.range=200;e.meleeAttack(0);}else{const b=e.bullet(e.player.x,e.player.y,0);travel(e,b,1);}
  assert.equal(far.hp,far.maxHp,`wall blocked weapon ${digit}`);
 }
});
test('超高速弾も薄い壁をすり抜けない',()=>{
 const e=arena(6),far=foe(e,160);e.map.cells[12][14]=1;const b=e.bullet(e.player.x,e.player.y,0);b.speed=10000;b.vx=10000;e.stepBullet(b,1/30);assert.equal(far.hp,far.maxHp);assert.ok(b.life<=0);
});
test('射程・視界のコアは独立し、レア度と増幅の合成に参加する',()=>{
 assert.ok(CORE_DEFS.some(c=>c.id==='reach'));assert.ok(CORE_DEFS.some(c=>c.id==='vision'));
 const p=laboratory('storm',3,0),before=compileBoard(p.board,p.inventory),id=p.board[2][1],item=p.inventory.find(x=>x.id===id);
 p.inventory[p.inventory.indexOf(item)]=makeItem(id,item.digit,'reach',{rarity:'legendary'});let s=compileBoard(p.board,p.inventory);near(s.range,before.range*(1+.004*3*2));near(s.vision,8);
 p.inventory[p.inventory.findIndex(x=>x.id===id)]=makeItem(id,item.digit,'vision',{rarity:'legendary'});s=compileBoard(p.board,p.inventory);near(s.range,WEAPONS[0].range);near(s.vision,8+.025*3*2);
});
test('武器変更後もボスの攻撃・属性・記録用ダメージは有限で同じ入力を再現',()=>{
 for(const digit of[0,1,2,3,4,5,6,7,8,9]){const a=new BossTrial(spec(digit),{seed:314}),b=new BossTrial(spec(digit),{seed:314});for(const e of[a,b]){Object.assign(e.player,{x:e.boss.x,y:e.boss.y+60});run(e,2);}assert.ok(a.totalDamage>0,`weapon ${digit}`);assert.equal(a.totalDamage,b.totalDamage);assert.ok(Number.isFinite(a.totalDamage));}
});
