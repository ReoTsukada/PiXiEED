/** Auction reference model for tests / LOCAL demo only. NOT a network service.
 * Real integration must move ownership, reservations and wallets into a DB transaction.
 */
export class AuctionBook {
 constructor({feeBps=500,clock=()=>Date.now()}={}){if(!Number.isInteger(feeBps)||feeBps<0||feeBps>10000)throw Error('手数料が不正');this.feeBps=feeBps;this.clock=clock;this.wallets=new Map();this.items=new Map();this.listings=new Map();this.receipts=new Map();this.treasury=0;this.seq=0;}
 money(n){if(!Number.isSafeInteger(n)||n<1||n>1_000_000_000)throw Error('価格は1〜10億の整数');}
 account(id,balance){if(!Number.isSafeInteger(balance)||balance<0)throw Error('残高が不正');this.wallets.set(id,balance);}
 put(item,owner){if(this.items.has(item.id))throw Error('アイテム重複');this.items.set(item.id,{...item,owner,locked:null});}
 list(seller,itemId,{start,buyout=null,duration=60_000}){
  this.money(start);if(buyout!==null){this.money(buyout);if(buyout<start)throw Error('即決価格が開始価格未満');}if(!Number.isSafeInteger(duration)||duration<1000||duration>7*86400000)throw Error('期限が不正');
  const item=this.items.get(itemId);if(!item||item.owner!==seller||item.locked)throw Error('出品できないアイテム');
  const id=`auction-${++this.seq}`,l={id,seller,itemId,start,buyout,end:this.clock()+duration,state:'active',bid:null};item.locked=id;this.listings.set(id,l);return {...l};
 }
 active(id,buyer){const l=this.listings.get(id);if(!l||l.state!=='active'||this.clock()>=l.end)throw Error('終了した出品');if(l.seller===buyer)throw Error('自己購入・自己入札は不可');if(!this.wallets.has(buyer))throw Error('口座なし');return l;}
 bid(id,buyer,amount){
  const l=this.active(id,buyer);this.money(amount);if(amount<(l.bid?l.bid.amount+1:l.start))throw Error('入札額不足');if(l.buyout!==null&&amount>=l.buyout)throw Error('即決価格以上は即決購入を使用');
  const refund=l.bid?.buyer===buyer?l.bid.amount:0;if(this.wallets.get(buyer)+refund<amount)throw Error('残高不足');
  if(l.bid)this.wallets.set(l.bid.buyer,this.wallets.get(l.bid.buyer)+l.bid.amount);
  this.wallets.set(buyer,this.wallets.get(buyer)-amount);l.bid={buyer,amount};return {...l};
 }
 transfer(l,buyer,amount){const item=this.items.get(l.itemId),fee=Math.floor(amount*this.feeBps/10000);item.owner=buyer;item.locked=null;this.wallets.set(l.seller,(this.wallets.get(l.seller)||0)+amount-fee);this.treasury+=fee;l.state='sold';l.winner=buyer;return {listing:l.id,itemId:l.itemId,buyer,paid:amount,fee};}
 buy(id,buyer,key){
  if(typeof key!=='string'||!key)throw Error('冪等キー必須');const receiptKey=JSON.stringify([buyer,key]);if(this.receipts.has(receiptKey)){const previous=this.receipts.get(receiptKey);if(previous.listing!==id)throw Error('キーの再利用');return {...previous};}
  const l=this.active(id,buyer);if(l.buyout===null)throw Error('即決なし');const own=l.bid?.buyer===buyer?l.bid.amount:0;
  if(this.wallets.get(buyer)+own<l.buyout)throw Error('残高不足');
  if(l.bid)this.wallets.set(l.bid.buyer,this.wallets.get(l.bid.buyer)+l.bid.amount);
  this.wallets.set(buyer,this.wallets.get(buyer)-l.buyout);const result=this.transfer(l,buyer,l.buyout);this.receipts.set(receiptKey,result);return {...result};
 }
 settle(id){const l=this.listings.get(id);if(!l||l.state!=='active'||this.clock()<l.end)throw Error('精算できない出品');if(l.bid)return this.transfer(l,l.bid.buyer,l.bid.amount);l.state='expired';this.items.get(l.itemId).locked=null;return {listing:id,state:'expired'};}
 cancel(id,seller){const l=this.listings.get(id);if(!l||l.state!=='active'||l.seller!==seller||l.bid)throw Error('取消不可');l.state='cancelled';this.items.get(l.itemId).locked=null;}
}
