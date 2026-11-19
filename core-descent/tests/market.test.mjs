import test from 'node:test';import assert from 'node:assert/strict';import {AuctionBook} from '../src/market.mjs';
function book(){const b=new AuctionBook({clock:()=>100});for(const id of ['seller','alice','bob'])b.account(id,1000);b.put({id:'item',kind:'material'},'seller');const l=b.list('seller','item',{start:100,buyout:400,duration:1000});return {b,l};}
test('コア以外の素材も同じ所有権方式で出品可',()=>{const {b}=book();assert.equal(b.items.get('item').locked,'auction-1');});
test('即決は通貨と所有権を移し手数料を控除',()=>{const {b,l}=book();b.buy(l.id,'alice','key1');assert.equal(b.items.get('item').owner,'alice');assert.equal(b.wallets.get('alice'),600);assert.equal(b.wallets.get('seller'),1380);assert.equal(b.treasury,20);});
test('同じ即決リクエストの再送は二重課金しない',()=>{const {b,l}=book();const a=b.buy(l.id,'alice','key1'),c=b.buy(l.id,'alice','key1');assert.deepEqual(a,c);assert.equal(b.wallets.get('alice'),600);});
test('同じ品物を2人へ売れない（逐次参照モデル）',()=>{const {b,l}=book();b.buy(l.id,'alice','key1');assert.throws(()=>b.buy(l.id,'bob','key2'));assert.equal(b.wallets.get('bob'),1000);});
test('自己購入・自己入札禁止',()=>{const {b,l}=book();assert.throws(()=>b.buy(l.id,'seller','key'));assert.throws(()=>b.bid(l.id,'seller',150));});
test('残高不足で状態を一切変更しない',()=>{const {b,l}=book();b.account('alice',50);assert.throws(()=>b.buy(l.id,'alice','key'));assert.equal(b.items.get('item').owner,'seller');assert.equal(b.wallets.get('alice'),50);});
test('入札額を確保し上書き時に前入札者へ返金',()=>{const {b,l}=book();b.bid(l.id,'alice',150);assert.equal(b.wallets.get('alice'),850);b.bid(l.id,'bob',200);assert.equal(b.wallets.get('alice'),1000);assert.equal(b.wallets.get('bob'),800);});
test('同じ入札者の上積みは差額のみ',()=>{const {b,l}=book();b.bid(l.id,'alice',150);b.bid(l.id,'alice',200);assert.equal(b.wallets.get('alice'),800);});
test('入札後の本人即決は確保済み額を精算',()=>{const {b,l}=book();b.bid(l.id,'alice',150);b.buy(l.id,'alice','key');assert.equal(b.wallets.get('alice'),600);});
test('他者即決時に入札者へ返金',()=>{const {b,l}=book();b.bid(l.id,'alice',150);b.buy(l.id,'bob','key');assert.equal(b.wallets.get('alice'),1000);});
test('期限後の購入不可・落札精算は1回だけ',()=>{const {b,l}=book();b.bid(l.id,'alice',150);b.clock=()=>1200;assert.throws(()=>b.buy(l.id,'bob','key'));b.settle(l.id);assert.equal(b.items.get('item').owner,'alice');assert.throws(()=>b.settle(l.id));});
test('未入札で期限切れならアイテムを返却',()=>{const {b,l}=book();b.clock=()=>1200;b.settle(l.id);assert.equal(b.items.get('item').owner,'seller');assert.equal(b.items.get('item').locked,null);});
test('出品中は同じ品を再出品不可',()=>{const {b}=book();assert.throws(()=>b.list('seller','item',{start:1,buyout:10}));});
test('入札後の取消は不可',()=>{const {b,l}=book();b.bid(l.id,'alice',100);assert.throws(()=>b.cancel(l.id,'seller'));});
test('価格の小数・負数・無限・即決価格逆転を拒否',()=>{const b=new AuctionBook();b.account('x',0);b.put({id:'x'},'x');for(const price of[-1,1.5,Infinity,0])assert.throws(()=>b.list('x','x',{start:price}));assert.throws(()=>b.list('x','x',{start:200,buyout:100}));});
