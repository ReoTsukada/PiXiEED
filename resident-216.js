// Resident 216x216 room - max 10 users, tile ownership prevents overwriting others' tiles
const MULTI_SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
const MULTI_SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
const MULTI_SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';

const CANVAS_W = 216, CANVAS_H = 216;
const TILE = 12; // tile size to reduce contention (12x12 tiles -> 18x18 grid)
const MAX_USERS = 10;
const CHANNEL = (new URLSearchParams(location.search).get('room')) || 'resident-216-room';

const clientId = `r216_${Math.random().toString(36).slice(2,9)}`;
let supabase = null, channel = null;

const canvas = document.getElementById('resident216');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const participantsEl = document.getElementById('participants');
const brushSizeEl = document.getElementById('brushSize');
const paletteEl = document.getElementById('palette');

let brushSize = Number(brushSizeEl.value) || 2;
let color = '#ffffff';
let drawing=false, last=null;

const DEFAULT_COLORS = ['#ffffff','#000000','#ff3b30','#ff9500','#ffcc00','#4cd964','#34c759','#007aff','#5856d6','#af52de'];

const tilesX = Math.ceil(CANVAS_W / TILE);
const tilesY = Math.ceil(CANVAS_H / TILE);
const ownerTimeout = 30*1000;
const tileOwners = new Map(); // index -> {clientId, lastSeen}

let localClaimed = new Set();
let pendingClaim = new Set();
let pendingTimer = null;

function setStatus(t){ statusEl.textContent = t; }

function initUI(){
  DEFAULT_COLORS.forEach(c=>{
    const b = document.createElement('button'); b.style.background=c; b.style.width='28px'; b.style.height='28px'; b.style.border='0'; b.addEventListener('click', ()=>{ color=c; });
    paletteEl.appendChild(b);
  });
  brushSizeEl.addEventListener('input', ()=>{ brushSize = Number(brushSizeEl.value) || 1; });
  document.getElementById('clearBtn').addEventListener('click', ()=>{ clearLocal(); sendClear(); });
  document.getElementById('leaveBtn').addEventListener('click', ()=>{ window.close(); });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('contextmenu', e=>{ e.preventDefault(); setStatus('右クリックでの保存は無効'); });
}

function clearLocal(){ ctx.fillStyle='#000'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H); }
function drawLine(p1,p2,col,sz){ ctx.strokeStyle=col; ctx.lineWidth=sz; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(p1.x+0.5,p1.y+0.5); ctx.lineTo(p2.x+0.5,p2.y+0.5); ctx.stroke(); }

function onDown(e){ const p = toCanvas(e); const tiles = tilesForPoint(p); for(const t of tiles){ const o = tileOwners.get(t); if (o && o.clientId !== clientId && (Date.now()- (o.lastSeen||0)) <= ownerTimeout){ setStatus('他の参加者が編集中の領域です'); return; } } drawing=true; last=p; drawLine(p,p,color,brushSize); buffer(p); }
function onMove(e){ if(!drawing) return; const p=toCanvas(e); drawLine(last,p,color,brushSize); buffer(p); last=p; }
function onUp(e){ if(!drawing) return; drawing=false; flushBuffer(); }

function toCanvas(e){ const r = canvas.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) * (CANVAS_W / r.width)); const y = Math.floor((e.clientY - r.top) * (CANVAS_H / r.height)); return {x:clamp(x,0,CANVAS_W-1), y:clamp(y,0,CANVAS_H-1)}; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

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
