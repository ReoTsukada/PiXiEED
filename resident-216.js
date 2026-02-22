// resident-216.js removed per user request. This file intentionally contains no runtime logic.
// All resident-room functionality was deleted. If you need to restore it later, please
// recover from version control or request the feature to be reimplemented.

let sendBuf = [];
function buffer(p){ sendBuf.push({x:p.x,y:p.y,c:color,s:brushSize}); const ts = tilesForPoint(p); for(const t of ts) pendingClaim.add(t); if(!pendingTimer) pendingTimer = setTimeout(flushClaims, 80); if(!sendTimer) sendTimer=setTimeout(flushBuffer, 60); }
let sendTimer=null;
function flushBuffer(){ if(!sendBuf.length) return; const payload={clientId, points: sendBuf.splice(0), ts:Date.now()}; sendDraw(payload); if(sendTimer){ clearTimeout(sendTimer); sendTimer=null; } }
function tilesForPoint(p){ const tx=Math.floor(p.x/TILE), ty=Math.floor(p.y/TILE); const out=[]; for(let y=Math.max(0,ty); y<=Math.min(tilesY-1,ty); y++){ for(let x=Math.max(0,tx); x<=Math.min(tilesX-1,tx); x++){ out.push(x+y*tilesX); } } return out; }

function flushClaims(){ if(!pendingClaim.size){ pendingTimer=null; return; } const toSend = Array.from(pendingClaim).filter(t=>!localClaimed.has(t)); if(toSend.length){ toSend.forEach(t=>{ localClaimed.add(t); tileOwners.set(t,{clientId, lastSeen:Date.now()}); }); sendClaimTiles(toSend); } pendingClaim.clear(); pendingTimer=null; }
function sendClaimTiles(tiles){ try{ channel.send({ type:'broadcast', event:'claim-tiles', payload:{clientId, tiles, ts:Date.now()} }); }catch(e){} }
function sendReleaseTiles(tiles){ try{ channel.send({ type:'broadcast', event:'release-tiles', payload:{clientId, tiles, ts:Date.now()} }); }catch(e){} }

async function sendDraw(payload){ try{ await channel.send({ type:'broadcast', event:'draw', payload }); }catch(e){ console.warn(e); } }
async function sendClear(){ try{ await channel.send({ type:'broadcast', event:'clear', payload:{clientId, ts:Date.now()} }); }catch(e){} }

function onRemoteDraw(payload){ try{ if(!payload || payload.clientId===clientId) return; const pts = payload.points||[]; let prev=pts[0]; for(let i=1;i<pts.length;i++){ const cur=pts[i]; // check ownership
    const tilesPrev=tilesForPoint(prev), tilesCur=tilesForPoint(cur); let blocked=false; const now=Date.now(); for(const t of tilesPrev.concat(tilesCur)){ const info=tileOwners.get(t); if(info && info.clientId!==payload.clientId && (now-(info.lastSeen||0))<=ownerTimeout){ blocked=true; break; } }
    if(!blocked) drawLine(prev,cur,cur.c||'#fff',cur.s||1); prev=cur; }
    // update owners
    const touched=new Set(); for(const p of pts){ tilesForPoint(p).forEach(t=>touched.add(t)); }
    const now=Date.now(); for(const t of touched){ const cur=tileOwners.get(t); if(!cur || cur.clientId===payload.clientId) tileOwners.set(t,{clientId:payload.clientId, lastSeen:now}); }
  }catch(e){ console.warn(e); } }

function onRemoteClear(){ ctx.fillStyle='#000'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H); }

function isCanvasBlank(){ const d=ctx.getImageData(0,0,CANVAS_W,CANVAS_H).data; for(let i=0;i<d.length;i++) if(d[i]!==0) return false; return true; }

// connection
async function start(){ initUI(); clearLocal(); setStatus('接続中…'); try{ const mod=await import(MULTI_SUPABASE_MODULE_URL); supabase = mod.createClient(MULTI_SUPABASE_URL, MULTI_SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 48 } } }); channel = supabase.channel(CHANNEL, { config:{ broadcast:{ack:false}, presence:{ key: clientId } } });
  channel.on('broadcast', { event:'draw' }, ({payload})=>{ onRemoteDraw(payload); });
  channel.on('broadcast', { event:'clear' }, ({payload})=>{ onRemoteClear(payload); });
  channel.on('broadcast', { event:'claim-tiles' }, ({payload})=>{ try{ if(!payload) return; const now=Date.now(); for(const t of (payload.tiles||[])) tileOwners.set(t,{clientId:payload.clientId, lastSeen:now}); }catch(e){} });
  channel.on('broadcast', { event:'release-tiles' }, ({payload})=>{ try{ if(!payload) return; for(const t of (payload.tiles||[])){ const cur=tileOwners.get(t); if(cur && cur.clientId===payload.clientId) tileOwners.delete(t); } }catch(e){} });
  channel.on('broadcast', { event:'heartbeat' }, ({payload})=>{ try{ if(!payload) return; const now=Date.now(); for(const [t,info] of Array.from(tileOwners.entries())){ if(info && info.clientId===payload.clientId){ info.lastSeen=now; tileOwners.set(t,info);} } }catch(e){} });
  channel.on('broadcast', { event:'status-request' }, ({payload})=>{ try{ if(!payload) return; const resp={ room: CHANNEL, ts:Date.now() }; if (!isCanvasBlank()){ resp.data = canvas.toDataURL('image/png'); } channel.send({ type:'broadcast', event:'status-response', payload: resp }); }catch(e){} });

  await channel.subscribe(async (status)=>{
    if(status==='SUBSCRIBED'){ setStatus('接続済み'); setTimeout(()=>{ requestSync(); }, 600); // announce presence via track
      await channel.track({ clientId, role:'participant', name: clientId, joinedAt: Date.now() });
      // attempt to become master if none (first in)
      // we'll let presence-based master selection be handled by others; not enforcing authoritative master rights here
    }
  });
  // presence refresh
  setInterval(()=>{
    try{ const pres = channel.presenceState ? channel.presenceState() : null; renderParticipants(pres); }catch(e){}
  }, 2000);
  // sweep owners
  setInterval(()=>{ const now=Date.now(); for(const [t,info] of Array.from(tileOwners.entries())){ if(now - (info.lastSeen||0) > ownerTimeout) tileOwners.delete(t); } }, 10*1000);
  // heartbeat claimed tiles
  setInterval(()=>{ try{ channel.send({ type:'broadcast', event:'heartbeat', payload:{ clientId, ts:Date.now() } }); }catch(e){} }, 10*1000);
}catch(e){ console.warn('start fail', e); setStatus('接続失敗'); }
}

function renderParticipants(pres){ try{ participantsEl.innerHTML=''; const list = []; if(pres && typeof pres === 'object'){ Object.keys(pres).forEach(key=>{ const entries = Array.isArray(pres[key])? pres[key] : []; entries.forEach(ent=>{ if(!ent || typeof ent !== 'object') return; list.push({ clientId: ent.clientId || key, name: ent.name || key, joinedAt: Number(ent.joinedAt) || Date.now() }); }); }); } const sorted = list.sort((a,b)=> (a.joinedAt - b.joinedAt)); for(const p of sorted){ const d = document.createElement('div'); d.textContent = `${p.name}`; participantsEl.appendChild(d); } }catch(e){}
}

function requestSync(){ try{ channel.send({ type:'broadcast', event:'sync-request', payload:{ clientId, ts:Date.now() } }); }catch(e){} }
function handleSyncRequest(payload){ try{ if(!payload) return; if(payload.clientId===clientId) return; // if we have non-blank canvas, respond
  if(!isCanvasBlank()){ try{ const data = canvas.toDataURL('image/png'); channel.send({ type:'broadcast', event:'sync-response', payload:{ clientId, data, ts:Date.now() } }); }catch(e){} }
}catch(e){} }
function handleSyncResponse(payload){ try{ if(!payload || !payload.data) return; const img = new Image(); img.onload = ()=>{ ctx.drawImage(img,0,0); }; img.src=payload.data; }catch(e){} }

channel && channel.on && channel.on('broadcast', { event:'sync-request' }, ({payload})=>{ handleSyncRequest(payload); });

start().catch(e=>{ console.error(e); });

// util
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
