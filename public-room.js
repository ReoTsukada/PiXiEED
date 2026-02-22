// Lightweight public shared room using Supabase realtime broadcasts.
// - Canvas: 256x256 fixed
// - Single layer/frame
// - This page disables image export (no save button, disables right-click and Ctrl/Cmd+S)

const MULTI_SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
const MULTI_SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
const MULTI_SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';

const CANVAS_W = 256;
const CANVAS_H = 256;
const CHANNEL_NAME = 'public-room';

const clientId = `c_${Math.random().toString(36).slice(2,9)}`;
let supabase = null;
let channel = null;

const canvas = document.getElementById('publicCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const paletteEl = document.getElementById('palette');
const brushSizeEl = document.getElementById('brushSize');

const DEFAULT_COLORS = ['#ffffff','#000000','#ff3b30','#ff9500','#ffcc00','#4cd964','#34c759','#007aff','#5856d6','#af52de'];
let color = '#ffffff';
let brushSize = 1;

// drawing state
let drawing = false;
let lastPoint = null;
let sendBuffer = [];
let sendTimer = null;

// ownership (tile) locking to avoid overwrites while someone is drawing
const TILE_SIZE = 16; // pixels
const TILES_X = Math.ceil(CANVAS_W / TILE_SIZE); // 16
const TILES_Y = Math.ceil(CANVAS_H / TILE_SIZE);
const ownerTimeoutMs = 30 * 1000; // consider owner gone after 30s of inactivity
const tileOwners = new Map(); // tileIndex -> { clientId, lastSeen }
const localClaimedTiles = new Set();
let pendingClaimTiles = new Set();
let pendingClaimTimer = null;

function setStatus(text){ statusEl.textContent = text; }

function initUI(){
  DEFAULT_COLORS.forEach(c=>{
    const el = document.createElement('button');
    el.className = 'sw';
    el.style.background = c;
    el.title = c;
    el.addEventListener('click', ()=>{ color = c; });
    paletteEl.appendChild(el);
  });
  brushSizeEl.addEventListener('change', ()=>{ brushSize = Number(brushSizeEl.value) || 1; });
  document.getElementById('clearBtn').addEventListener('click', ()=>{
    clearLocal();
    sendClear();
  });
  // disable context menu on canvas to block "Save image as"
  canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); setStatus('右クリックによる保存は無効です'); });

  // disable common page-save shortcut: Ctrl/Cmd+S
  window.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')){
      e.preventDefault();
      setStatus('このページではページ保存/画像保存は無効です');
    }
  });

  // protect canvas export APIs — return a blank image unless explicit internal flag is set on the element
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';

  HTMLCanvasElement.prototype.toDataURL = function(...args){
    if (this._allowCanvasExport){
      return origToDataURL.apply(this, args);
    }
    // otherwise return a 1x1 transparent PNG data URL
    return BLANK_PNG;
  };
  HTMLCanvasElement.prototype.toBlob = function(cb, ...args){
    if (this._allowCanvasExport){
      return origToBlob.call(this, cb, ...args);
    }
    // return an empty transparent blob
    try{
      const bin = atob(BLANK_PNG.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
      const blob = new Blob([arr], {type:'image/png'});
      if (typeof cb === 'function') cb(blob);
    }catch(e){ if (typeof cb === 'function') cb(null); }
  };
}

function clearLocal(){
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
}

function drawLine(p1,p2, col, size){
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(p1.x+0.5, p1.y+0.5);
  ctx.lineTo(p2.x+0.5, p2.y+0.5);
  ctx.stroke();
}

function handlePointerDown(e){
  const pos = pointerToCanvas(e);
  // check ownership of the tile(s) for this point
  const tiles = tilesForPoint(pos);
  for (const t of tiles){
    const owner = tileOwners.get(t);
    if (owner && owner.clientId !== clientId){
      // someone else currently owns this tile — block drawing
      setStatus('この領域は他の参加者が編集中です');
      return;
    }
  }
  drawing = true;
  lastPoint = pos;
  // immediate dot
  drawLine(pos,pos,color,brushSize);
  bufferPoint(pos);
}
function handlePointerMove(e){
  if (!drawing) return;
  const pos = pointerToCanvas(e);
  drawLine(lastPoint,pos,color,brushSize);
  bufferPoint(pos);
  lastPoint = pos;
}
function handlePointerUp(e){
  if (!drawing) return;
  drawing = false;
  flushBuffer();
}

function pointerToCanvas(ev){
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) * (CANVAS_W / rect.width));
  const y = Math.floor((ev.clientY - rect.top) * (CANVAS_H / rect.height));
  return {x: clamp(x,0,CANVAS_W-1), y: clamp(y,0,CANVAS_H-1)};
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

function bufferPoint(p){
  sendBuffer.push({x:p.x,y:p.y,c:color,s:brushSize});
  // mark tiles for claim (batching)
  const tiles = tilesForPoint(p);
  for (const t of tiles) pendingClaimTiles.add(t);
  if (!pendingClaimTimer) pendingClaimTimer = setTimeout(() => { flushPendingClaims(); }, 80);
  if (!sendTimer) sendTimer = setTimeout(() => { flushBuffer(); }, 50);
}

function tilesForPoint(p){
  const tx = Math.floor(p.x / TILE_SIZE);
  const ty = Math.floor(p.y / TILE_SIZE);
  const tiles = [];
  for (let y = Math.max(0, ty-0); y <= Math.min(TILES_Y-1, ty+0); y++){
    for (let x = Math.max(0, tx-0); x <= Math.min(TILES_X-1, tx+0); x++){
      tiles.push(x + y * TILES_X);
    }
  }
  return tiles;
}

function flushPendingClaims(){
  if (!pendingClaimTiles.size) { pendingClaimTimer = null; return; }
  const toSend = Array.from(pendingClaimTiles).filter(t => !localClaimedTiles.has(t));
  if (toSend.length){
    // claim locally
    toSend.forEach(t=>{ localClaimedTiles.add(t); tileOwners.set(t, {clientId, lastSeen: Date.now()}); });
    sendClaimTiles(toSend);
  }
  pendingClaimTiles.clear();
  pendingClaimTimer = null;
}

function sendClaimTiles(tiles){
  try{ channel.send({ type:'broadcast', event:'claim-tiles', payload:{ clientId, tiles, ts: Date.now() } }); }catch(e){/*ignore*/}
}

function sendReleaseTiles(tiles){
  try{ channel.send({ type:'broadcast', event:'release-tiles', payload:{ clientId, tiles, ts: Date.now() } }); }catch(e){/*ignore*/}
}

function flushBuffer(){
  if (!sendBuffer.length) return;
  const payload = { clientId, points: sendBuffer.splice(0), ts: Date.now() };
  sendDraw(payload);
  if (sendTimer){ clearTimeout(sendTimer); sendTimer = null; }
}

async function sendDraw(payload){
  try{
    await channel.send({ type: 'broadcast', event: 'draw', payload });
  }catch(e){ console.warn('sendDraw failed', e); }
}

async function sendClear(){
  try{ await channel.send({ type:'broadcast', event:'clear', payload:{clientId,ts:Date.now()} }); }catch(e){/*ignore*/}
}

function onRemoteDraw(payload){
  try{
    if (!payload || payload.clientId === clientId) return; // ignore own
    const pts = payload.points || [];
    if (!pts.length) return;
    let prev = pts[0];
    for (let i=1;i<pts.length;i++){
      const cur = pts[i];
      // determine if either end is owned by someone else (active)
      const tilesPrev = tilesForPoint(prev);
      const tilesCur = tilesForPoint(cur);
      let blocked = false;
      const now = Date.now();
      for (const t of tilesPrev.concat(tilesCur)){
        const info = tileOwners.get(t);
        if (info && info.clientId !== payload.clientId && (now - (info.lastSeen||0)) <= ownerTimeoutMs){ blocked = true; break; }
      }
      if (!blocked){
        drawLine(prev,cur,cur.c || '#fff', cur.s || 1);
      }
      prev = cur;
    }
    // update ownership lastSeen for tiles touched by remote drawer
    try{
      const touched = new Set();
      for (const p of pts){
        const ts = tilesForPoint(p);
        for (const t of ts) touched.add(t);
      }
      const now = Date.now();
      for (const t of touched){
        const cur = tileOwners.get(t);
        if (!cur || cur.clientId === payload.clientId){
          tileOwners.set(t, { clientId: payload.clientId, lastSeen: now });
        }
      }
    }catch(e){}
  }catch(e){ console.warn('onRemoteDraw', e); }
}

function onRemoteClear(){ clearLocal(); }

// Sync on join: request current canvas as dataURL. First client who has non-empty canvas responds.
let synced = false;
function requestSync(){
  try{ channel.send({ type:'broadcast', event:'sync-request', payload:{clientId,ts:Date.now()} }); }catch(e){}
}
function handleSyncRequest(payload){
  try{
    if (!payload || payload.clientId === clientId) return;
    // if our canvas is not blank, respond with dataURL — allow export temporarily
    const isBlank = isCanvasBlank();
    if (!isBlank){
      try{
        canvas._allowCanvasExport = true;
        const data = canvas.toDataURL('image/png');
        canvas._allowCanvasExport = false;
        channel.send({ type:'broadcast', event:'sync-response', payload:{clientId, data, ts:Date.now()} });
      }catch(e){ canvas._allowCanvasExport = false; }
    }
  }catch(e){/*ignore*/}
}
function handleSyncResponse(payload){
  try{
    if (synced) return; // already applied
    if (!payload || !payload.data) return;
    const img = new Image();
    img.onload = ()=>{ ctx.drawImage(img,0,0); synced = true; };
    img.src = payload.data;
  }catch(e){/*ignore*/}
}

function isCanvasBlank(){
  const data = ctx.getImageData(0,0,CANVAS_W,CANVAS_H).data;
  for (let i=0;i<data.length;i++) if (data[i]!==0) return false;
  return true;
}

async function start(){
  initUI();
  clearLocal();
  // pointer handlers
  canvas.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerUp);

  // beforeunload: release our claimed tiles so others can draw
  window.addEventListener('beforeunload', ()=>{
    if (localClaimedTiles.size){
      try{ sendReleaseTiles(Array.from(localClaimedTiles)); }catch(e){}
      localClaimedTiles.clear();
    }
  });

  // periodic sweep to free stale owners
  setInterval(()=>{
    const now = Date.now();
    for (const [t,info] of Array.from(tileOwners.entries())){
      if (info && (now - (info.lastSeen || 0)) > ownerTimeoutMs){
        tileOwners.delete(t);
      }
    }
  }, 10 * 1000);

  setStatus('接続中…');
  try{
    const mod = await import(MULTI_SUPABASE_MODULE_URL);
    supabase = mod.createClient(MULTI_SUPABASE_URL, MULTI_SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 48 } } });
    channel = supabase.channel(CHANNEL_NAME);
    channel.on('broadcast', { event: 'draw' }, ({payload})=>{ onRemoteDraw(payload); });
    channel.on('broadcast', { event: 'clear' }, ({payload})=>{ onRemoteClear(payload); });
    channel.on('broadcast', { event: 'sync-request' }, ({payload})=>{ handleSyncRequest(payload); });
    channel.on('broadcast', { event: 'sync-response' }, ({payload})=>{ handleSyncResponse(payload); });
    channel.on('broadcast', { event: 'status' }, ({payload})=>{ /* ignore for now */ });
  channel.on('broadcast', { event: 'claim-tiles' }, ({payload})=>{ try{ if (!payload) return; const now = Date.now(); for (const t of (payload.tiles||[])) tileOwners.set(t, { clientId: payload.clientId, lastSeen: now }); }catch(e){} });
  channel.on('broadcast', { event: 'release-tiles' }, ({payload})=>{ try{ if (!payload) return; for (const t of (payload.tiles||[])) { const cur = tileOwners.get(t); if (cur && cur.clientId === payload.clientId) tileOwners.delete(t); } }catch(e){} });
  channel.on('broadcast', { event: 'heartbeat' }, ({payload})=>{ try{ if (!payload) return; const now = Date.now(); for (const [t,info] of Array.from(tileOwners.entries())){ if (info && info.clientId === payload.clientId){ info.lastSeen = now; tileOwners.set(t, info); } } }catch(e){} });

    await channel.subscribe(async (status)=>{
      if (status === 'SUBSCRIBED'){
        setStatus('接続済み');
        // ask for sync
        requestSync();
        // send periodic heartbeat so our claimed tiles remain reserved while we're present
        setInterval(()=>{ try{ channel.send({ type:'broadcast', event:'heartbeat', payload:{ clientId, ts: Date.now() } }); }catch(e){} }, 10 * 1000);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
        setStatus('接続失敗');
      }
    });
  }catch(e){ console.warn('supabase start failed', e); setStatus('接続失敗'); }
}

start().catch(e=>{ console.error(e); setStatus('エラー'); });
