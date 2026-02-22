// Resident 128x128 room - 4x4 slots of 32x32 each, max 16 participants, queueing
const MULTI_SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
const MULTI_SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
const MULTI_SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';

const CANVAS_W = 128, CANVAS_H = 128;
const SLOT_SIZE = 32, SLOTS_PER_ROW = 4, MAX_SLOTS = 16;
const CHANNEL = (new URLSearchParams(location.search).get('room')) || 'resident-128-room';

const clientId = `r128_${Math.random().toString(36).slice(2,9)}`;
let supabase=null, channel=null;

const canvas = document.getElementById('resident128');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const participantsEl = document.getElementById('participants');
const slotInfoEl = document.getElementById('slotInfo');
const brushSizeEl = document.getElementById('brushSize');
const paletteEl = document.getElementById('palette');

let brushSize = Number(brushSizeEl.value) || 3;
let color = '#fff';
let slotIndex = null; // assigned slot
let readOnly=false;

const DEFAULT_COLORS = ['#ffffff','#000000','#ff3b30','#ff9500','#ffcc00','#4cd964','#34c759','#007aff','#5856d6','#af52de'];

let sendBuf=[]; let sendTimer=null; let drawing=false, last=null;

function initUI(){ DEFAULT_COLORS.forEach(c=>{ const b=document.createElement('button'); b.style.background=c; b.style.width='28px'; b.style.height='28px'; b.style.border='0'; b.addEventListener('click', ()=>{ color=c; }); paletteEl.appendChild(b); }); brushSizeEl.addEventListener('input', ()=>{ brushSize = Number(brushSizeEl.value) || 1; }); document.getElementById('clearBtn').addEventListener('click', ()=>{ clearOwnSlot(); sendClearSlot(); }); document.getElementById('leaveBtn').addEventListener('click', ()=>{ window.close(); }); canvas.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); canvas.addEventListener('contextmenu', e=>{ e.preventDefault(); setStatus('右クリックでの保存は無効'); }); }
function setStatus(t){ statusEl.textContent = t; }
function clearOwnSlot(){ if(slotIndex===null) return; const x=(slotIndex%SLOTS_PER_ROW)*SLOT_SIZE; const y=Math.floor(slotIndex/SLOTS_PER_ROW)*SLOT_SIZE; ctx.fillStyle='#000'; ctx.fillRect(x,y,SLOT_SIZE,SLOT_SIZE); }
function toCanvas(e){ const r=canvas.getBoundingClientRect(); const x=Math.floor((e.clientX-r.left)*(CANVAS_W/r.width)); const y=Math.floor((e.clientY-r.top)*(CANVAS_H/r.height)); return {x:clamp(x,0,CANVAS_W-1), y:clamp(y,0,CANVAS_H-1)}; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function pointToSlot(p){ const tx=Math.floor(p.x/SLOT_SIZE), ty=Math.floor(p.y/SLOT_SIZE); return tx + ty * SLOTS_PER_ROW; }
function canDrawAtPoint(p){ return slotIndex === pointToSlot(p); }
function drawLine(p1,p2,col,sz){ ctx.strokeStyle=col; ctx.lineWidth=sz; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(p1.x+0.5,p1.y+0.5); ctx.lineTo(p2.x+0.5,p2.y+0.5); ctx.stroke(); }
function onDown(e){ if(readOnly){ setStatus('閲覧モードです'); return; } const p=toCanvas(e); if(!canDrawAtPoint(p)){ setStatus('割当領域以外は描けません'); return; } drawing=true; last=p; drawLine(p,p,color,brushSize); buffer(p); }
function onMove(e){ if(!drawing) return; const p=toCanvas(e); drawLine(last,p,color,brushSize); buffer(p); last=p; }
function onUp(e){ if(!drawing) return; drawing=false; flushBuffer(); }
function buffer(p){ sendBuf.push({x:p.x,y:p.y,c:color,s:brushSize}); if(!sendTimer) sendTimer=setTimeout(flushBuffer, 60); }
function flushBuffer(){ if(!sendBuf.length) return; const payload={clientId, slot: slotIndex, points: sendBuf.splice(0), ts:Date.now()}; sendDraw(payload); if(sendTimer){ clearTimeout(sendTimer); sendTimer=null; } }
async function sendDraw(payload){ try{ await channel.send({ type:'broadcast', event:'draw', payload }); }catch(e){} }
async function sendClearSlot(){ try{ await channel.send({ type:'broadcast', event:'clear-slot', payload:{ clientId, slot: slotIndex, ts:Date.now() } }); }catch(e){} }

function onRemoteDraw(payload){ try{ if(!payload) return; if(payload.slot===undefined) return; if(payload.slot<0||payload.slot>=MAX_SLOTS) return; const pts=payload.points||[]; if(!pts.length) return; let prev=pts[0]; for(let i=1;i<pts.length;i++){ const cur=pts[i]; drawLine(prev,cur,cur.c||'#fff',cur.s||1); prev=cur; } }catch(e){} }
function onRemoteClearSlot(payload){ try{ if(!payload || payload.slot===undefined) return; const s=payload.slot; const x=(s%SLOTS_PER_ROW)*SLOT_SIZE; const y=Math.floor(s/SLOTS_PER_ROW)*SLOT_SIZE; ctx.fillStyle='#000'; ctx.fillRect(x,y,SLOT_SIZE,SLOT_SIZE); }catch(e){} }

function renderParticipants(pres){ try{ participantsEl.innerHTML=''; const list=[]; if(pres && typeof pres === 'object'){ Object.keys(pres).forEach(key=>{ const entries = Array.isArray(pres[key])? pres[key] : []; entries.forEach(ent=>{ if(!ent || typeof ent !== 'object') return; list.push({ clientId: ent.clientId || key, name: ent.name || key, joinedAt: Number(ent.joinedAt) || Date.now() }); }); }); } const sorted=list.sort((a,b)=> (a.joinedAt - b.joinedAt)); for(const p of sorted){ const d=document.createElement('div'); d.textContent = `${p.name}`; participantsEl.appendChild(d); } }catch(e){} }

// slot handshake: request slots, receive slots-response, claim lowest free
function requestSlots(){ try{ channel.send({ type:'broadcast', event:'request-slots', payload:{ clientId, ts:Date.now() } }); }catch(e){} }
function respondSlots(to){ try{ const mySlots = slotIndex===null?[]:[slotIndex]; channel.send({ type:'broadcast', event:'slots-response', payload:{ clientId, slots: mySlots, ts:Date.now(), to } }); }catch(e){} }
function handleSlotsResponse(payload){ try{ if(!payload) return; // merge simple
  // note: in this simplified model we don't maintain slotOwners map; we just rely on claiming when no one uses a slot
  // no-op for now
}catch(e){} }
function claimMySlot(){ try{ // ask presence for slots and pick lowest free locally
  const pres = channel.presenceState ? channel.presenceState() : {}; const used=new Set(); Object.keys(pres).forEach(k=>{ const entries = Array.isArray(pres[k]) ? pres[k] : []; entries.forEach(ent=>{ if(ent && ent.slot !== undefined) used.add(Number(ent.slot)); }); }); let found=null; for(let i=0;i<MAX_SLOTS;i++){ if(!used.has(i)){ found=i; break; } } if(found===null){ readOnly=true; slotInfoEl.textContent='参加上限に達しています（閲覧モード）'; setStatus('読み取り専用'); return; } slotIndex=found; // track via presence
  channel.track({ clientId, role:'participant', name: clientId, joinedAt: Date.now(), slot: slotIndex }).catch(()=>{});
  channel.send({ type:'broadcast', event:'claim-slot', payload:{ clientId, slot: slotIndex, ts:Date.now() } }).catch(()=>{});
  slotInfoEl.textContent = `あなたのスロット: ${slotIndex}`;
  setStatus('スロット確保済み'); }catch(e){} }

async function start(){ initUI(); ctx.fillStyle='#000'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H); setStatus('接続中…'); try{ const mod = await import(MULTI_SUPABASE_MODULE_URL); supabase = mod.createClient(MULTI_SUPABASE_URL, MULTI_SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 48 } } }); channel = supabase.channel(CHANNEL, { config:{ broadcast:{ ack:false }, presence:{ key: clientId } } }); channel.on('broadcast', { event:'draw' }, ({payload})=>{ onRemoteDraw(payload); }); channel.on('broadcast', { event:'clear-slot' }, ({payload})=>{ onRemoteClearSlot(payload); }); channel.on('broadcast', { event:'request-slots' }, ({payload})=>{ respondSlots(payload && payload.clientId); }); channel.on('broadcast', { event:'slots-response' }, ({payload})=>{ handleSlotsResponse(payload); }); channel.on('broadcast', { event:'claim-slot' }, ({payload})=>{ /* could update UI */ }); channel.on('broadcast', { event:'status-request' }, ({payload})=>{ try{ if(!payload) return; const resp = { room: CHANNEL, ts:Date.now() }; const data = canvas.toDataURL('image/png'); resp.data = data; channel.send({ type:'broadcast', event:'status-response', payload: resp }); }catch(e){} });
  await waitForSubscribe(channel);
  await channel.track({ clientId, role:'participant', name: clientId, joinedAt: Date.now() });
  // request slots and claim
  requestSlots(); setTimeout(()=>{ claimMySlot(); }, 400);
  // presence render interval
  setInterval(()=>{ try{ const pres = channel.presenceState ? channel.presenceState() : null; renderParticipants(pres); }catch(e){} }, 2000);
  // periodic host heartbeat placeholder
}catch(e){ console.warn('start fail', e); setStatus('接続失敗'); }
}

async function waitForSubscribe(ch){ return new Promise(res=>{ const t = setInterval(()=>{ try{ const st = ch && ch.status ? ch.status : null; if(st === 'SUBSCRIBED'){ clearInterval(t); res(true); } }catch(e){} }, 120); setTimeout(()=>{ clearInterval(t); res(false); }, 3000); }); }

start().catch(e=>{ console.error(e); });
