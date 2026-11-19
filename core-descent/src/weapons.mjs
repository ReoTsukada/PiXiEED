/** A weapon is a property of the root emitter's fixed digit, never a character class.
 * Distances are ground-plane pixels; the current dungeon uses 32 px tiles.
 */
export const WEAPONS = [
 {digit:0,id:'sword',name:'旅人の剣',glyph:'⚔',color:'#bfddbd',kind:'melee',style:'sword',baseDamage:27,baseRate:1.6,range:64,arc:2.0,cleave:3,description:'前方を薙ぐ、扱いやすい剣。1振りで最大3体に命中。',mechanic:'前方115°の斬撃 / 巻き込み3体'},
 {digit:1,id:'dagger',name:'双牙の短剣',glyph:'†',color:'#eee0ae',kind:'melee',style:'dagger',baseDamage:11,baseRate:3.6,range:43,arc:1.1,cleave:1,combo:3,comboDamage:1.8,description:'近距離を素早く刺す。3撃目の威力は1.8倍。連撃は2秒で途切れる。',mechanic:'高速3連撃 / 3撃目1.8倍'},
 {digit:2,id:'greatsword',name:'巨人の大剣',glyph:'╋',color:'#b4c8d5',kind:'melee',style:'greatsword',baseDamage:90,baseRate:.72,range:87,arc:2.45,cleave:6,stationarySeconds:.18,description:'移動を止めて0.18秒構えると、高威力の重斬撃。長い間合いから最大6体を薙ぐ。攻撃後はすぐ移動できる。',mechanic:'停止0.18秒で攻撃 / 前方140°・巻き込み6体'},
 {digit:3,id:'spear',name:'銀枝の槍',glyph:'↑',color:'#c4dfb2',kind:'melee',style:'spear',baseDamage:33,baseRate:1.45,range:116,arc:.3,width:12,cleave:4,description:'細長い直線上を貫く突き。離れた敵にも届き、最大4体に命中。',mechanic:'長射程の直線突き / 巻き込み4体'},
 {digit:4,id:'axe',name:'月輪の斧',glyph:'☽',color:'#f0b17e',kind:'melee',style:'axe',baseDamage:43,baseRate:1.05,range:68,arc:3.7,cleave:5,description:'左右を巻き込む広い斧の一振り。前方212°、最大5体に命中。',mechanic:'広い扇形斬撃 / 巻き込み5体'},
 {digit:5,id:'hammer',name:'岩砕きの槌',glyph:'▣',color:'#cfb796',kind:'melee',style:'hammer',baseDamage:88,baseRate:.7,range:61,arc:1.8,cleave:3,knockback:24,stationarySeconds:.28,description:'移動を止めて0.28秒構えると、重い打撃で最大3体を24px押し戻す。ボスは押せない。攻撃後はすぐ移動できる。',mechanic:'停止0.28秒で攻撃 / 重打撃・ノックバック'},
 {digit:6,id:'bow',name:'風読みの弓',glyph:')',color:'#d7c58e',kind:'projectile',style:'arrow',baseDamage:12,baseRate:3,range:460,projectileSpeed:560,projectileRadius:3,innatePierce:1,description:'速く長い射程の矢。素の状態で1体を貫通し、2体目まで届く。',mechanic:'高速直線矢 / 基礎貫通1回'},
 {digit:7,id:'chakram',name:'帰還の刃輪',glyph:'◌',color:'#e7bc83',kind:'projectile',style:'chakram',baseDamage:24,baseRate:1.1,range:220,projectileSpeed:310,projectileRadius:8,description:'敵を抜け、射程の端で戻る刃。往路と復路にそれぞれ1回ずつ同じ敵へ命中できる。壁で帰還を始める。',mechanic:'往復投擲 / 同じ敵へ最大2回'},
 {digit:8,id:'staff',name:'星火の杖',glyph:'✦',color:'#87cfdf',kind:'projectile',style:'orb',baseDamage:45,baseRate:1.35,range:350,projectileSpeed:245,projectileRadius:7,burstRadius:55,burstDamage:.7,stationarySeconds:.35,description:'移動を止めて0.35秒詠唱し、高威力の魔力球を放つ。初回命中時、周囲の別の敵へ70%威力の魔力爆発。発射後はすぐ移動できる。',mechanic:'停止0.35秒で詠唱 / 高威力の魔力球・周囲へ70%爆発'},
 {digit:9,id:'spellbook',name:'古代の魔導書',glyph:'▤',color:'#c4a7ed',kind:'projectile',style:'rune',baseDamage:12,baseRate:1.1,range:300,projectileSpeed:300,projectileRadius:4,burst:3,burstGap:.1,innateHoming:1.2,description:'移動しながら、0.1秒間隔で3つの魔弾を放つ。魔弾は毎秒1.2ラジアンの速度で敵を追う。',mechanic:'移動詠唱 / 3連魔弾・基礎追尾あり'}
].map(weapon=>Object.freeze({stationarySeconds:0,...weapon}));
export function weaponForDigit(digit) {
 if(!Number.isInteger(digit)||digit<0||digit>9)throw Error('武器の数字は0〜9');
 return WEAPONS[digit];
}
