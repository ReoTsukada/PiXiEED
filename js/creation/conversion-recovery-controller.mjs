const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export function conversionRecoveryIdentity(win, idFactory = () => win.crypto.randomUUID()) {
  const current = win.history.state?.pixieedConversionRecovery;
  const id = safeId(current) ? current : idFactory();
  const previous = () => Array.isArray(win.history.state?.pixieedConversionRecoveryPrevious) ? win.history.state.pixieedConversionRecoveryPrevious.filter(safeId) : [];
  const adopt = value => {
    if (!safeId(value)) throw new Error('端末内保存の識別子を作れませんでした。');
    const from = win.history.state?.pixieedConversionRecovery;
    const kept = [...new Set(previous().filter(id=>id!==value))];
    if(safeId(from)&&from!==value&&!kept.includes(from))kept.push(from);
    win.history.replaceState({ ...win.history.state, pixieedConversionRecovery: value, pixieedConversionRecoveryPrevious: kept }, '', win.location.href);
  };
  if (id !== current) adopt(id);
  return { id, adopt, previous };
}

/** Local-only serialized autosave. A loaded snapshot never overwrites edits made while reading. */
export function createConversionRecoveryController({ store, id, adoptId = () => {}, capture, apply, canSave = () => true, onState = () => {}, idFactory = () => globalThis.crypto.randomUUID(), setTimer = setTimeout, clearTimer = clearTimeout, delay = 500, initiallyPaused = false } = {}) {
  let key = id, head = null, generation = 0, savedGeneration = 0, timer = null, writing = null, aborter = null;
  let loading = false, restoring = false, paused = Boolean(initiallyPaused), blocked = false, mustFork = false, disposed = false, loadEpoch = 0, phase = 'idle', message = '変更はこの端末だけに保存します。';
  const state = () => ({ id:key, phase, message, dirty:generation !== savedGeneration, loading, restoring, saving:Boolean(writing), paused, blocked, mustFork, revision:head });
  const notify = () => { if (!disposed) onState(state()); };
  const describe = (next, text) => { phase=next;message=text;notify(); };
  const clear = () => { if(timer!==null)clearTimer(timer);timer=null; };
  function schedule(urgent = false) { clear();if(!disposed&&!paused&&!blocked&&!loading&&!restoring)timer=setTimer(()=>{timer=null;void flush();},urgent?0:delay); }
  function changed({ urgent = false } = {}) {
    if(disposed||restoring)return;
    generation++;if(loading){notify();return;}if(!blocked&&!paused)describe('pending','端末内の保存待ちです。完了前に閉じると最新の変更を復元できません。');
    schedule(urgent);
  }
  async function start() {
    if(disposed||loading)return false;
    const ticket=++loadEpoch, before=generation;loading=true;describe('loading','この画面の端末内保存を確認しています。');
    try {
      const record=await store.load(key);
      if(disposed||ticket!==loadEpoch)return false;
      head=record?.revision??null;
      if(!record){loading=false;describe('idle','変更はこの端末だけに保存します。共有端末では保存データが残ります。');if(generation!==savedGeneration)schedule();return true;}
      if(generation!==before){blocked=true;mustFork=true;loading=false;describe('restore-blocked','読み込み中に編集されたため復元を止めました。保存版は残っています。今の内容は別の復元版として保存できます。');return false;}
      restoring=true;notify();
      const restored = await apply(record.snapshot);
      if(disposed||ticket!==loadEpoch)return false;
      savedGeneration=generation;loading=false;restoring=false;describe('saved',restored?.warning || '端末内の保存版を復元しました。生成結果は必要に応じて作り直します。');return true;
    } catch(error){
      if(disposed||ticket!==loadEpoch)return false;
      loading=false;restoring=false;blocked=true;mustFork=true;describe('restore-error',`${error?.message||'復元できませんでした。'} 保存版は消していません。今の内容は別の復元版として保存できます。`);return false;
    } finally { if(ticket===loadEpoch){loading=false;restoring=false;notify();} }
  }
  async function flush({ fork = false } = {}) {
    clear();if(disposed||loading||restoring||writing||(!fork&&(paused||blocked)))return false;
    if(!canSave()){describe('pending','文字入力の確定後に端末内へ保存します。');return false;}
    if(fork)mustFork=true;
    const expected=fork?null:head, version=generation;
    let snapshot,target;
    try{target=fork?idFactory():key;snapshot=capture();}catch(error){blocked=true;describe('error',`${error?.message||'保存の準備ができません。'} 現在の内容と前回保存版は残っています。`);return false;}
    aborter=new AbortController();
    let resolveWriting;writing=new Promise(resolve=>{resolveWriting=resolve;});describe('saving','端末内へ保存しています…');
    try{
      const record=await store.save(target,snapshot,{expectedRevision:expected,signal:aborter.signal});
      // Transaction completion is authoritative even if cancel was clicked at the same time.
      head=record.revision;key=target;savedGeneration=version;blocked=false;
      try{if(fork)adoptId(key);}catch(error){blocked=true;describe('error','保存は完了しましたが、再読込用の識別子を設定できませんでした。この画面を閉じる前に元ファイルを保存してください。');return false;}
      mustFork=false;
      if(disposed)return true;
      describe(paused?'paused':generation!==version?'pending':'saved',paused?'保存は既に完了していました。今後の自動保存は停止しています。':generation!==version?'前の状態を保存しました。最新の変更を続けて保存します。':'端末内に保存済みです。共有端末ではデータが残ります。');return true;
    }catch(error){
      if(!disposed){
        if(error?.name==='AbortError'){paused=true;describe('paused','保存を中止しました。前回保存版は残っています。現在の変更は未保存です。');}
        else{blocked=true;if(error?.code==='CONVERSION_RECOVERY_CONFLICT')mustFork=true;describe(error?.code==='CONVERSION_RECOVERY_CONFLICT'?'conflict':'error',`${error?.message||'端末内に保存できませんでした。'} 現在の内容と前回保存版は残っています。`);}
      }return false;
    }finally{writing=null;aborter=null;resolveWriting();if(!disposed&&!paused&&!blocked&&generation!==savedGeneration)schedule();notify();}
  }
  function cancel(){
    if(restoring){describe('restoring','復元内容の適用中です。完了までお待ちください。');return false;}
    clear();paused=true;
    if(loading){loadEpoch++;loading=false;blocked=true;mustFork=true;describe('paused','復元を中止しました。保存版は消していません。');return true;}
    if(writing){aborter.abort();return true;}
    describe('paused','自動保存を停止しています。前回保存版はこの端末に残ります。');return true;
  }
  function resume(){if(mustFork)return flush({fork:true});blocked=false;paused=false;return flush();}
  function dispose(){disposed=true;loadEpoch++;clear();aborter?.abort();}
  return {start,changed,flush,cancel,resume,fork:()=>flush({fork:true}),dispose,snapshot:state,get restoring(){return restoring;},get dirty(){return generation!==savedGeneration;}};
}
