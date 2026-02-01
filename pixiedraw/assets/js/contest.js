import { supabase } from './contest-supabase.js';

const FORM_ID = 'contestForm';
const FILE_INPUT_ID = 'contestFile';
const STATUS_ID = 'contestStatus';
const GALLERY_ID = 'contestGallery';
const START_BTN_ID = 'startTimedBtn';
const TIMER_LABEL_ID = 'timerLabel';
const TIMED_CHECKBOX_ID = 'timedMode';
const PROMPT_TEXT = '今日のお題: 「自由投稿」 (本番用に差し替えてください)';
const MAX_SIZE = 512;
const MAX_COLORS = 256;
const NORMALIZE_COLOR_TOLERANCE = 12;
const NORMALIZE_MATCH_RATIO = 0.985;
const STORAGE_BUCKET = 'pixieed-contest';
const THUMB_SIZE = 256;
const CONTEST_SHARE_BASE_URL = 'https://pixieed.jp/contest/view.html';
const CONTEST_SHARE_OGP_WIDTH = 1200;
const CONTEST_SHARE_OGP_HEIGHT = 630;
const CONTEST_SHARE_PADDING = 60;
const CONTEST_SHARE_TITLE_SIZE = 32;
const SUPABASE_MAINTENANCE_KEY = 'pixieed_supabase_maintenance';
const CONTEST_CACHE_KEY = 'pixiedraw_contest_cache';
const CONTEST_CACHE_LIMIT = 60;
const CONTEST_SHARE_QUEUE_KEY = 'contest_share_queue';
const CONTEST_SHARE_QUEUE_LIMIT = 20;
const POST_QUEUE_KEY = 'contest_post_queue';
const POST_QUEUE_LIMIT = 20;
const POST_QUEUE_RETRY_MS = 60000;
const TIMED_DURATION_MS = 10 * 60 * 1000;
const NAME_DISPLAY_ID = 'contestNameDisplay';
const NICKNAME_KEY = 'pixieed_nickname';

let deadline = null;
let timerHandle = null;
let timedStartedAt = null;
let clientId = null;
let likedEntries = new Set();
let supportsImageUrls = true;
let supportsStorageUploads = true;
let cachedEntries = [];
let supabaseMaintenance = Boolean(readSupabaseMaintenance());
let postQueueBusy = false;

function $(id){
  return document.getElementById(id);
}

function loadNickname(){
  try{
    return localStorage.getItem(NICKNAME_KEY) || '';
  }catch(_){
    return '';
  }
}

function updateNameDisplay(){
  const el = $(NAME_DISPLAY_ID);
  if(!el) return;
  const nick = loadNickname();
  el.textContent = nick || '未設定';
}

function ensureClientId(){
  const KEY = 'pixiedraw_lite_client';
  try{
    const saved = localStorage.getItem(KEY);
    if(saved){
      clientId = saved;
      return;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    clientId = id;
  }catch(_){
    clientId = `guest-${Math.random().toString(36).slice(2,8)}`;
  }
}

function readSupabaseMaintenance(){
  try{
    const raw = localStorage.getItem(SUPABASE_MAINTENANCE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(data && data.active) return data;
  }catch(_){
    // ignore
  }
  return null;
}

function isSupabaseMaintenance(){
  return supabaseMaintenance;
}

function setSupabaseMaintenance(active, reason = ''){
  supabaseMaintenance = active;
  try{
    if(active){
      localStorage.setItem(SUPABASE_MAINTENANCE_KEY, JSON.stringify({ active: true, reason, ts: Date.now() }));
    }else{
      localStorage.removeItem(SUPABASE_MAINTENANCE_KEY);
    }
  }catch(_){
    // ignore
  }
  if(active){
    setStatus('メンテ中のため投稿はキューに保存されます');
  }
  updatePostControls();
}

function noteSupabaseSuccess(){
  if(supabaseMaintenance){
    setSupabaseMaintenance(false);
  }
  if(!supabaseMaintenance && loadPostQueue().length){
    flushPostQueue().catch(err => console.warn('post queue flush failed', err));
  }
  if(!supabaseMaintenance && loadShareQueue().length){
    flushShareQueue().catch(err => console.warn('share queue flush failed', err));
  }
}

function shouldMarkSupabaseMaintenance(error){
  const status = Number(error?.status || error?.statusCode || 0);
  if(status >= 500) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch failed') || msg.includes('503') || msg.includes('502') || msg.includes('504');
}

function markSupabaseMaintenanceFromError(error){
  if(shouldMarkSupabaseMaintenance(error)){
    setSupabaseMaintenance(true, 'network');
  }
}

async function probeSupabaseAvailability(){
  try{
    const { error } = await supabase
      .from('contest_entries')
      .select('id')
      .limit(1);
    if(error){
      markSupabaseMaintenanceFromError(error);
      return false;
    }
    noteSupabaseSuccess();
    return true;
  }catch(err){
    markSupabaseMaintenanceFromError(err);
    return false;
  }
}

function loadContestCache(){
  try{
    const raw = localStorage.getItem(CONTEST_CACHE_KEY);
    if(!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data?.items) ? data.items : [];
  }catch(_){
    return [];
  }
}

function saveContestCache(items){
  try{
    const trimmed = Array.isArray(items) ? items.slice(0, CONTEST_CACHE_LIMIT) : [];
    localStorage.setItem(CONTEST_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: trimmed }));
  }catch(_){
    // ignore
  }
}

function loadShareQueue(){
  try{
    const raw = localStorage.getItem(CONTEST_SHARE_QUEUE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(_){
    return [];
  }
}

function saveShareQueue(queue){
  try{
    localStorage.setItem(CONTEST_SHARE_QUEUE_KEY, JSON.stringify(queue.slice(0, CONTEST_SHARE_QUEUE_LIMIT)));
  }catch(_){
    // ignore
  }
}

function queueShareTask(task){
  if(!task?.entryId) return;
  const queue = loadShareQueue();
  const next = queue.filter(item => item.entryId !== task.entryId);
  next.unshift(task);
  saveShareQueue(next);
}

function updatePostControls(){
  const form = $(FORM_ID);
  if(form){
    const submit = form.querySelector('button[type="submit"]');
    if(submit) submit.disabled = false;
  }
}

async function resolveEntryImageBlob(entry){
  const src = entry?.image_url || entry?.image_base64 || entry?.thumb_url || '';
  if(!src) return null;
  try{
    const res = await fetch(src);
    if(!res.ok) throw new Error(`image fetch failed: ${res.status}`);
    return await res.blob();
  }catch(err){
    markSupabaseMaintenanceFromError(err);
    return null;
  }
}

async function flushShareQueue(){
  if(isSupabaseMaintenance() || !supabase?.storage || !supportsStorageUploads) return;
  const queue = loadShareQueue();
  if(!queue.length) return;
  const remaining = [];
  for(const task of queue){
    try{
      const { data, error } = await supabase
        .from('contest_entries')
        .select('id,title,image_url,thumb_url,image_base64')
        .eq('id', task.entryId)
        .maybeSingle();
      if(error || !data){
        if(error) throw error;
        continue;
      }
      const imageBlob = await resolveEntryImageBlob(data);
      if(!imageBlob) throw new Error('image missing');
      const shareResult = await uploadContestShareAssets({
        entryId: data.id,
        title: data.title || task.title,
        imageInfo: { imageBlob }
      });
      if(!shareResult?.shareUrl){
        throw new Error('share upload failed');
      }
      noteSupabaseSuccess();
    }catch(err){
      remaining.push(task);
      markSupabaseMaintenanceFromError(err);
    }
  }
  saveShareQueue(remaining);
}

function setStatus(msg){
  const el = $(STATUS_ID);
  if(el) el.textContent = msg || '';
}

function resolveEntryThumb(entry){
  if(!entry) return '';
  return entry.thumb_url || entry.image_url || entry.image_base64 || '';
}

function resolveEntryImage(entry){
  if(!entry) return '';
  return entry.image_url || entry.image_base64 || entry.thumb_url || '';
}

function createStorageKey(prefix){
  const seed = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const date = new Date().toISOString().slice(0,10).replace(/-/g, '');
  return `${prefix}/${date}/${seed}`;
}

function canvasToBlob(canvas, type = 'image/png'){
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if(blob) resolve(blob);
      else reject(new Error('blob create failed'));
    }, type);
  });
}

function createThumbnailCanvas(source){
  const max = Math.max(source.width, source.height);
  const scale = Math.min(1, THUMB_SIZE / max);
  if(scale >= 1) return source;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function dataUrlToBlob(dataUrl){
  const response = await fetch(dataUrl);
  if(!response.ok) throw new Error('data url parse failed');
  return await response.blob();
}

function loadPostQueue(){
  try{
    const raw = localStorage.getItem(POST_QUEUE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(_){
    return [];
  }
}

function savePostQueue(queue){
  try{
    localStorage.setItem(POST_QUEUE_KEY, JSON.stringify(queue.slice(0, POST_QUEUE_LIMIT)));
  }catch(_){
    // ignore
  }
}

function normalizePostTask(task){
  if(!task) return null;
  const dataUrl = typeof task.dataUrl === 'string' ? task.dataUrl : '';
  if(!dataUrl) return null;
  const queueId = task.queueId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
  return {
    queueId,
    name: task.name || '名無し',
    title: task.title || '無題',
    prompt: task.prompt || PROMPT_TEXT,
    mode: task.mode || 'free',
    started_at: task.started_at || null,
    submitted_at: task.submitted_at || new Date().toISOString(),
    width: Number.isFinite(task.width) ? task.width : null,
    height: Number.isFinite(task.height) ? task.height : null,
    colors: Number.isFinite(task.colors) ? task.colors : null,
    dataUrl,
  };
}

function queuePostTask(task){
  const normalized = normalizePostTask(task);
  if(!normalized) return false;
  const queue = loadPostQueue();
  const next = queue.filter(item => item.queueId !== normalized.queueId);
  next.unshift(normalized);
  savePostQueue(next);
  return true;
}

async function buildImageInfoFromTask(task){
  const imageBlob = await dataUrlToBlob(task.dataUrl);
  const img = await createImageBitmap(imageBlob);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if(!ctx) throw new Error('canvas init failed');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const thumbCanvas = createThumbnailCanvas(canvas);
  const thumbBlob = await canvasToBlob(thumbCanvas, 'image/png');
  return {
    width: Number.isFinite(task.width) ? task.width : img.width,
    height: Number.isFinite(task.height) ? task.height : img.height,
    colors: Number.isFinite(task.colors) ? task.colors : null,
    dataUrl: task.dataUrl,
    imageBlob,
    thumbBlob,
  };
}

async function flushPostQueue(){
  if(postQueueBusy) return;
  const queue = loadPostQueue();
  if(!queue.length) return;
  if(isSupabaseMaintenance()){
    const recovered = await probeSupabaseAvailability();
    if(!recovered) return;
  }
  postQueueBusy = true;
  const remaining = [];
  let posted = false;
  for(const task of queue){
    try{
      const normalized = normalizePostTask(task);
      if(!normalized) continue;
      const imageInfo = await buildImageInfoFromTask(normalized);
      let uploadResult = null;
      if(supportsImageUrls){
        uploadResult = await uploadContestImages(imageInfo);
      }
      const payload = {
        name: normalized.name,
        title: normalized.title,
        prompt: normalized.prompt,
        mode: normalized.mode,
        started_at: normalized.started_at,
        submitted_at: normalized.submitted_at,
        width: imageInfo.width,
        height: imageInfo.height,
        colors: imageInfo.colors
      };
      if(supportsImageUrls && uploadResult){
        payload.image_url = uploadResult.imageUrl;
        payload.thumb_url = uploadResult.thumbUrl;
      }else{
        payload.image_base64 = imageInfo.dataUrl;
      }
      let { data, error } = await supabase.from('contest_entries').insert(payload).select('id');
      if(error){
        const msg = String(error.message || '').toLowerCase();
        if(supportsImageUrls && (msg.includes('image_url') || msg.includes('thumb_url'))){
          supportsImageUrls = false;
          delete payload.image_url;
          delete payload.thumb_url;
          payload.image_base64 = imageInfo.dataUrl;
          ({ data, error } = await supabase.from('contest_entries').insert(payload).select('id'));
        }
      }
      if(error){
        throw error;
      }
      noteSupabaseSuccess();
      const entryId = Array.isArray(data) ? data[0]?.id : null;
      if(entryId){
        const shareResult = await uploadContestShareAssets({ entryId, title: normalized.title, imageInfo });
        if(!shareResult?.shareUrl && isSupabaseMaintenance()){
          queueShareTask({ entryId, title: normalized.title });
        }
      }
      posted = true;
    }catch(err){
      remaining.push(task);
      markSupabaseMaintenanceFromError(err);
      if(isSupabaseMaintenance()) break;
    }
  }
  savePostQueue(remaining);
  postQueueBusy = false;
  if(posted){
    setStatus('キューに保存した投稿を自動送信しました。');
    await fetchAndRender();
  }
}

function schedulePostQueueFlush(){
  if(typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    flushPostQueue().catch(err => console.warn('post queue flush failed', err));
  });
  window.setInterval(() => {
    if(isSupabaseMaintenance() || loadPostQueue().length){
      flushPostQueue().catch(err => console.warn('post queue flush failed', err));
    }
  }, POST_QUEUE_RETRY_MS);
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
  ));
}

function truncateText(ctx, text, maxWidth){
  let output = String(text ?? '');
  if(!output) return '';
  if(ctx.measureText(output).width <= maxWidth) return output;
  while(output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth){
    output = output.slice(0, -1);
  }
  return output.length > 1 ? `${output}…` : output;
}

function getContestPublicUrl(path){
  if(!supabase?.storage) return '';
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function buildShareHtml({ title, description, imageUrl, shareUrl, targetUrl }){
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(imageUrl);
  const safeShareUrl = escapeHtml(shareUrl);
  const safeTargetUrl = escapeHtml(targetUrl);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${safeTitle}"/>
  <meta property="og:description" content="${safeDescription}"/>
  <meta property="og:image" content="${safeImage}"/>
  <meta property="og:image:width" content="${CONTEST_SHARE_OGP_WIDTH}"/>
  <meta property="og:image:height" content="${CONTEST_SHARE_OGP_HEIGHT}"/>
  <meta property="og:url" content="${safeShareUrl}"/>
  <meta property="og:site_name" content="PiXiEED"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${safeTitle}"/>
  <meta name="twitter:description" content="${safeDescription}"/>
  <meta name="twitter:image" content="${safeImage}"/>
  <meta http-equiv="refresh" content="0; url=${safeTargetUrl}"/>
  <link rel="canonical" href="${safeTargetUrl}"/>
  <style>body{margin:0;font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}</style>
</head>
<body>
  <p>Redirecting...</p>
  <script>window.location.replace('${safeTargetUrl}');</script>
</body>
</html>`;
}

function drawContainImage(ctx, image, x, y, width, height){
  if(!ctx || !image) return;
  const iw = image.width || 1;
  const ih = image.height || 1;
  const scale = Math.min(width / iw, height / ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const dx = Math.round(x + (width - dw) / 2);
  const dy = Math.round(y + (height - dh) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, dx, dy, dw, dh);
}

async function createContestOgpBlob({ title, imageBlob }){
  if(!imageBlob) return null;
  let bitmap = null;
  try{
    bitmap = await createImageBitmap(imageBlob);
  }catch(_){
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = CONTEST_SHARE_OGP_WIDTH;
  canvas.height = CONTEST_SHARE_OGP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if(!ctx) return null;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f8fafc';
  ctx.font = `600 ${CONTEST_SHARE_TITLE_SIZE}px 'DotGothic16', sans-serif`;
  ctx.textBaseline = 'top';
  const maxTitleWidth = canvas.width - CONTEST_SHARE_PADDING * 2;
  const titleText = truncateText(ctx, title || '作品', maxTitleWidth);
  ctx.fillText(titleText, CONTEST_SHARE_PADDING, CONTEST_SHARE_PADDING);
  const top = CONTEST_SHARE_PADDING + CONTEST_SHARE_TITLE_SIZE + 20;
  const availableHeight = canvas.height - top - CONTEST_SHARE_PADDING;
  const availableWidth = canvas.width - CONTEST_SHARE_PADDING * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.fillRect(CONTEST_SHARE_PADDING, top, availableWidth, availableHeight);
  ctx.strokeRect(CONTEST_SHARE_PADDING, top, availableWidth, availableHeight);
  drawContainImage(ctx, bitmap, CONTEST_SHARE_PADDING, top, availableWidth, availableHeight);
  return await canvasToBlob(canvas, 'image/png');
}

async function uploadContestShareAssets({ entryId, title, imageInfo }){
  if(!supabase || !supportsStorageUploads || !entryId || !imageInfo?.imageBlob) return null;
  const ogpBlob = await createContestOgpBlob({ title, imageBlob: imageInfo.imageBlob });
  if(!ogpBlob) return null;
  const ogpPath = `share/${entryId}.png`;
  const sharePath = `share/${entryId}.html`;
  const ogpUrl = getContestPublicUrl(ogpPath);
  const shareUrl = getContestPublicUrl(sharePath);
  const targetUrl = `${CONTEST_SHARE_BASE_URL}?id=${entryId}`;
  const html = buildShareHtml({
    title: `PiXiEED | ${title || '作品'}`,
    description: 'PiXiEEDのドット作品',
    imageUrl: ogpUrl,
    shareUrl,
    targetUrl,
  });
  const htmlBlob = new Blob([html], { type: 'text/html' });
  try{
    const bucket = supabase.storage.from(STORAGE_BUCKET);
    const { error: ogpError } = await bucket.upload(ogpPath, ogpBlob, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false
    });
    if(ogpError) throw ogpError;
    const { error: htmlError } = await bucket.upload(sharePath, htmlBlob, {
      contentType: 'text/html',
      cacheControl: '31536000',
      upsert: false
    });
    if(htmlError) throw htmlError;
    return { shareUrl, ogpUrl };
  }catch(err){
    console.warn('share upload failed', err);
    markSupabaseMaintenanceFromError(err);
    const msg = String(err?.message || '').toLowerCase();
    if(msg.includes('bucket') || msg.includes('storage') || msg.includes('not found')){
      supportsStorageUploads = false;
    }
    return null;
  }
}

function normalizePixelCanvas(sourceCanvas){
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sourceCtx = sourceCanvas.getContext('2d');
  if(!sourceCtx) return { canvas: sourceCanvas, ctx: sourceCtx, width, height };
  let imageData;
  try{
    imageData = sourceCtx.getImageData(0, 0, width, height);
  }catch(_){
    return { canvas: sourceCanvas, ctx: sourceCtx, width, height };
  }
  const scaleX = detectScaleFactor(imageData, width, height, 'x');
  const scaleY = detectScaleFactor(imageData, width, height, 'y');
  let scale = Math.max(1, Math.min(scaleX, scaleY));
  const blockScale = detectScaleFactorByBlocks(imageData, width, height);
  if(blockScale > scale){
    scale = blockScale;
  }
  if(scale <= 1){
    return { canvas: sourceCanvas, ctx: sourceCtx, width, height };
  }
  const targetWidth = Math.max(1, Math.round(width / scale));
  const targetHeight = Math.max(1, Math.round(height / scale));
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetCtx = targetCanvas.getContext('2d');
  if(!targetCtx) return { canvas: sourceCanvas, ctx: sourceCtx, width, height };
  const targetData = targetCtx.createImageData(targetWidth, targetHeight);
  const src = imageData.data;
  const dest = targetData.data;
  for(let y=0; y<targetHeight; y++){
    for(let x=0; x<targetWidth; x++){
      const srcIndex = ((y * scale) * width + (x * scale)) * 4;
      const destIndex = (y * targetWidth + x) * 4;
      dest[destIndex] = src[srcIndex];
      dest[destIndex + 1] = src[srcIndex + 1];
      dest[destIndex + 2] = src[srcIndex + 2];
      dest[destIndex + 3] = src[srcIndex + 3];
    }
  }
  targetCtx.putImageData(targetData, 0, 0);
  return { canvas: targetCanvas, ctx: targetCtx, width: targetWidth, height: targetHeight };
}

function detectScaleFactor(imageData, width, height, axis){
  const { data } = imageData;
  const length = axis === 'x' ? width : height;
  const compare = axis === 'x'
    ? (indexA, indexB) => columnsMatch(data, width, height, indexA, indexB)
    : (indexA, indexB) => rowsMatch(data, width, height, indexA, indexB);

  let run = 1;
  let best = 0;
  for(let i=1; i<length; i++){
    if(compare(i, i - 1)){
      run += 1;
    }else{
      best = best ? gcd(best, run) : run;
      run = 1;
    }
  }
  best = best ? gcd(best, run) : run;
  return Math.max(1, best);
}

function detectScaleFactorByBlocks(imageData, width, height){
  const common = gcd(width, height);
  if(common <= 1) return 1;
  const candidates = getDivisors(common).filter(value => value > 1).sort((a, b) => b - a);
  for(const factor of candidates){
    if(isLikelyUpscaledByFactor(imageData.data, width, height, factor)){
      return factor;
    }
  }
  return 1;
}

function isLikelyUpscaledByFactor(data, width, height, factor){
  const totalPixels = width * height;
  const allowedMismatch = Math.floor(totalPixels * (1 - NORMALIZE_MATCH_RATIO));
  let mismatches = 0;
  for(let blockY=0; blockY<height; blockY+=factor){
    for(let blockX=0; blockX<width; blockX+=factor){
      const baseIndex = (blockY * width + blockX) * 4;
      const baseR = data[baseIndex];
      const baseG = data[baseIndex + 1];
      const baseB = data[baseIndex + 2];
      const baseA = data[baseIndex + 3];
      for(let y=0; y<factor; y++){
        const rowStart = (blockY + y) * width;
        for(let x=0; x<factor; x++){
          const idx = (rowStart + blockX + x) * 4;
          if(!isColorNear(data, idx, baseR, baseG, baseB, baseA)){
            mismatches += 1;
            if(mismatches > allowedMismatch){
              return false;
            }
          }
        }
      }
    }
  }
  return true;
}

function isColorNear(data, idx, r, g, b, a){
  return (
    Math.abs(data[idx] - r) <= NORMALIZE_COLOR_TOLERANCE &&
    Math.abs(data[idx + 1] - g) <= NORMALIZE_COLOR_TOLERANCE &&
    Math.abs(data[idx + 2] - b) <= NORMALIZE_COLOR_TOLERANCE &&
    Math.abs(data[idx + 3] - a) <= NORMALIZE_COLOR_TOLERANCE
  );
}

function getDivisors(value){
  const divisors = new Set();
  for(let i=2; i<=Math.sqrt(value); i+=1){
    if(value % i === 0){
      divisors.add(i);
      divisors.add(value / i);
    }
  }
  divisors.add(value);
  return Array.from(divisors);
}

function columnsMatch(data, width, height, a, b){
  for(let y=0; y<height; y++){
    const idxA = (y * width + a) * 4;
    const idxB = (y * width + b) * 4;
    if(
      data[idxA] !== data[idxB] ||
      data[idxA + 1] !== data[idxB + 1] ||
      data[idxA + 2] !== data[idxB + 2] ||
      data[idxA + 3] !== data[idxB + 3]
    ){
      return false;
    }
  }
  return true;
}

function rowsMatch(data, width, height, a, b){
  const rowLength = width * 4;
  const startA = a * rowLength;
  const startB = b * rowLength;
  for(let offset=0; offset<rowLength; offset++){
    if(data[startA + offset] !== data[startB + offset]){
      return false;
    }
  }
  return true;
}

function gcd(a, b){
  while(b !== 0){
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

async function uploadContestImages(imageInfo){
  if(!supabase || !supportsStorageUploads || !imageInfo?.imageBlob || !imageInfo?.thumbBlob) return null;
  const baseKey = createStorageKey('entries');
  const imagePath = `${baseKey}.png`;
  const thumbPath = `${baseKey}_thumb.png`;
  try{
    const { error: imageError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(imagePath, imageInfo.imageBlob, {
        contentType: 'image/png',
        cacheControl: '31536000',
        upsert: false
      });
    if(imageError) throw imageError;
    const { error: thumbError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(thumbPath, imageInfo.thumbBlob, {
        contentType: 'image/png',
        cacheControl: '31536000',
        upsert: false
      });
    if(thumbError) throw thumbError;
    const imageUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(imagePath).data.publicUrl;
    const thumbUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(thumbPath).data.publicUrl;
    return { imageUrl, thumbUrl };
  }catch(err){
    console.warn('storage upload failed', err);
    markSupabaseMaintenanceFromError(err);
    const msg = String(err?.message || '').toLowerCase();
    if(msg.includes('bucket') || msg.includes('storage') || msg.includes('not found')){
      supportsStorageUploads = false;
    }
    return null;
  }
}

function formatTimer(ms){
  if(ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2,'0');
  const s = String(totalSec % 60).padStart(2,'0');
  return `${m}:${s}`;
}

function updateTimer(){
  const label = $(TIMER_LABEL_ID);
  if(!label){
    clearInterval(timerHandle);
    return;
  }
  if(!deadline){
    label.textContent = '未開始';
    return;
  }
  const remain = deadline - Date.now();
  label.textContent = remain > 0 ? `${formatTimer(remain)} / 10:00` : '00:00 (投稿締切)';
  if(remain <= 0){
    clearInterval(timerHandle);
  }
}

function startTimedMode(){
  timedStartedAt = Date.now();
  deadline = timedStartedAt + TIMED_DURATION_MS;
  clearInterval(timerHandle);
  timerHandle = setInterval(updateTimer, 1000);
  updateTimer();
}

async function fileToImageInfo(file){
  const blob = file;
  const img = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const normalized = normalizePixelCanvas(canvas);
  const nCanvas = normalized.canvas;
  const nWidth = normalized.width;
  const nHeight = normalized.height;
  if(nWidth > MAX_SIZE || nHeight > MAX_SIZE){
    throw new Error(`元サイズは${MAX_SIZE}x${MAX_SIZE}以内にしてください`);
  }
  const nCtx = normalized.ctx || nCanvas.getContext('2d');
  if(!nCtx) throw new Error('画像の解析に失敗しました');
  const data = nCtx.getImageData(0,0,nWidth,nHeight).data;
  const colors = new Set();
  for(let i=0;i<data.length;i+=4){
    colors.add(`${data[i]}-${data[i+1]}-${data[i+2]}-${data[i+3]}`);
    if(colors.size > MAX_COLORS){
      throw new Error(`色数は${MAX_COLORS}色以内にしてください`);
    }
  }
  const dataUrl = nCanvas.toDataURL('image/png');
  const thumbCanvas = createThumbnailCanvas(nCanvas);
  const imageBlob = await canvasToBlob(nCanvas, 'image/png');
  const thumbBlob = await canvasToBlob(thumbCanvas, 'image/png');
  return { width: nWidth, height: nHeight, colors: colors.size, dataUrl, imageBlob, thumbBlob };
}

async function handleSubmit(e){
  e.preventDefault();
  const form = e.currentTarget;
  const name = loadNickname() || '名無し';
  const title = form.title.value.trim() || '無題';
  const isTimed = form[TIMED_CHECKBOX_ID]?.checked;
  const file = form[FILE_INPUT_ID]?.files?.[0];
  if(!file){
    setStatus('画像ファイルを選択してください');
    return;
  }
  if(isTimed){
    if(!deadline){
      setStatus('10分モードを開始してください');
      return;
    }
    if(Date.now() > deadline){
      setStatus('10分を超えたため投稿できません');
      return;
    }
  }
  setStatus('画像を確認しています...');
  let imageInfo;
  try{
    imageInfo = await fileToImageInfo(file);
  }catch(err){
    setStatus(err.message || '画像の解析に失敗しました');
    return;
  }
  const submittedAt = new Date().toISOString();
  const startedAt = isTimed ? new Date(timedStartedAt).toISOString() : null;
  if(isSupabaseMaintenance()){
    const queued = queuePostTask({
      name,
      title,
      prompt: PROMPT_TEXT,
      mode: isTimed ? 'timed10' : 'free',
      started_at: startedAt,
      submitted_at: submittedAt,
      width: imageInfo.width,
      height: imageInfo.height,
      colors: imageInfo.colors,
      dataUrl: imageInfo.dataUrl,
    });
    if(queued){
      setStatus('メンテ中のためキューに保存しました。復旧後に自動投稿します。');
      form.reset();
    }else{
      setStatus('キューへの保存に失敗しました。時間を置いて再試行してください。');
    }
    return;
  }
  let uploadResult = null;
  if(supportsImageUrls){
    setStatus('アップロード中...');
    uploadResult = await uploadContestImages(imageInfo);
  }
  setStatus('投稿しています...');
  const payload = {
    name,
    title,
    prompt: PROMPT_TEXT,
    mode: isTimed ? 'timed10' : 'free',
    started_at: startedAt,
    submitted_at: submittedAt,
    width: imageInfo.width,
    height: imageInfo.height,
    colors: imageInfo.colors
  };
  if(supportsImageUrls && uploadResult){
    payload.image_url = uploadResult.imageUrl;
    payload.thumb_url = uploadResult.thumbUrl;
  }else{
    payload.image_base64 = imageInfo.dataUrl;
  }
  let { data, error } = await supabase.from('contest_entries').insert(payload).select('id');
  if(error){
    const msg = String(error.message || '').toLowerCase();
    if(supportsImageUrls && (msg.includes('image_url') || msg.includes('thumb_url'))){
      supportsImageUrls = false;
      delete payload.image_url;
      delete payload.thumb_url;
      payload.image_base64 = imageInfo.dataUrl;
      ({ data, error } = await supabase.from('contest_entries').insert(payload).select('id'));
    }
  }
  if(error){
    console.error(error);
    markSupabaseMaintenanceFromError(error);
    if(isSupabaseMaintenance()){
      const queued = queuePostTask({
        name,
        title,
        prompt: PROMPT_TEXT,
        mode: isTimed ? 'timed10' : 'free',
        started_at: startedAt,
        submitted_at: submittedAt,
        width: imageInfo.width,
        height: imageInfo.height,
        colors: imageInfo.colors,
        dataUrl: imageInfo.dataUrl,
      });
      if(queued){
        setStatus('メンテ中のためキューに保存しました。復旧後に自動投稿します。');
        form.reset();
      }else{
        setStatus('投稿に失敗しました。キュー保存にも失敗しました。');
      }
    }else{
      setStatus('投稿に失敗しました');
    }
    return;
  }
  noteSupabaseSuccess();
  const entryId = Array.isArray(data) ? data[0]?.id : null;
  let shareUrl = null;
  if(entryId){
    const shareResult = await uploadContestShareAssets({ entryId, title, imageInfo });
    shareUrl = shareResult?.shareUrl || null;
    if(!shareUrl && isSupabaseMaintenance()){
      queueShareTask({ entryId, title });
    }
  }
  form.reset();
  if(shareUrl){
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(shareUrl);
      setStatus('投稿しました！共有リンクをコピーしました。');
    }else{
      window.prompt('共有リンクをコピーしてください。', shareUrl);
      setStatus('投稿しました！');
    }
  }else if(isSupabaseMaintenance()){
    setStatus('投稿しました！共有リンクはメンテナンス復旧後に生成されます。');
  }else{
    setStatus('投稿しました！');
  }
  await fetchAndRender();
}

function renderEntries(entries){
  const gallery = $(GALLERY_ID);
  if(!gallery) return;
  if(!entries.length){
    gallery.innerHTML = '<p class="empty">まだ投稿がありません。</p>';
    return;
  }
  gallery.innerHTML = '';
  const placeholderSrc = makePlaceholder('#334155');
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'entry-card';
    item.innerHTML = `
      <div class="entry-imgwrap"><img src="${resolveEntryThumb(entry)}" alt="${entry.title}" loading="lazy" decoding="async"></div>
      <div class="entry-meta">
        <div class="entry-meta__top">
          <span class="entry-title">${escapeHtml(entry.title || '無題')}</span>
          <span class="entry-like">❤ ${entry.likeCount || 0}</span>
        </div>
        <p class="entry-author">by ${escapeHtml(entry.name || '名無し')}</p>
        <p class="entry-info">${entry.width}x${entry.height} / ${entry.colors}色 ${entry.mode === 'timed10' ? '（10分）' : ''}</p>
        <button class="like-btn" data-id="${entry.id}" ${likedEntries.has(entry.id) ? 'disabled' : ''}>
          ${likedEntries.has(entry.id) ? 'いいね済み' : 'いいね'}
        </button>
      </div>
    `;
    gallery.appendChild(item);
  });
  gallery.querySelectorAll('.entry-imgwrap img').forEach(img => {
    img.addEventListener('error', () => {
      img.src = placeholderSrc;
    });
  });
  gallery.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', () => likeEntry(Number(btn.dataset.id)));
  });
}

async function hydrateLegacyImages(entries){
  if(!supportsImageUrls) return entries;
  const missingIds = entries.filter(e => !e.thumb_url && !e.image_url).map(e => e.id);
  if(!missingIds.length) return entries;
  const { data, error } = await supabase
    .from('contest_entries')
    .select('id,image_base64')
    .in('id', missingIds);
  if(error || !Array.isArray(data)) return entries;
  const legacyMap = new Map(data.map(row => [row.id, row.image_base64]));
  return entries.map(e => (
    legacyMap.has(e.id) ? { ...e, image_base64: legacyMap.get(e.id) } : e
  ));
}

async function fetchAndRender(){
  ensureClientId();
  setStatus('読み込み中...');
  const baseSelect = supportsImageUrls
    ? 'id,name,title,prompt,mode,submitted_at,width,height,colors,image_url,thumb_url'
    : 'id,name,title,prompt,mode,submitted_at,width,height,colors,image_base64';
  let entries = null;
  let error = null;
  try{
    ({ data: entries, error } = await supabase
      .from('contest_entries')
      .select(baseSelect)
      .order('submitted_at', { ascending:false })
      .limit(100));
  }catch(err){
    error = err;
  }
  if(error && supportsImageUrls){
    const msg = String(error.message || '').toLowerCase();
    if(msg.includes('image_url') || msg.includes('thumb_url')){
      supportsImageUrls = false;
      try{
        ({ data: entries, error } = await supabase
          .from('contest_entries')
          .select('id,name,title,prompt,mode,submitted_at,width,height,colors,image_base64')
          .order('submitted_at', { ascending:false })
          .limit(100));
      }catch(err){
        error = err;
      }
    }
  }
  if(!error && Array.isArray(entries)){
    entries = await hydrateLegacyImages(entries);
  }
  if(error){
    setStatus('投稿の取得に失敗しました');
    console.error(error);
    markSupabaseMaintenanceFromError(error);
  }
  let likes = null;
  let likeError = null;
  try{
    ({ data: likes, error: likeError } = await supabase
      .from('contest_likes')
      .select('entry_id, client_id')
      .limit(1000));
  }catch(err){
    likeError = err;
  }
  if(likeError){
    setStatus('いいね取得に失敗しました');
    console.error(likeError);
    markSupabaseMaintenanceFromError(likeError);
  }
  const likeCounts = {};
  likedEntries = new Set();
  likes?.forEach(l => {
    likeCounts[l.entry_id] = (likeCounts[l.entry_id] || 0) + 1;
    if(l.client_id === clientId){
      likedEntries.add(l.entry_id);
    }
  });
  let useEntries = Array.isArray(entries) ? entries : [];
  if(useEntries.length === 0){
    const cached = loadContestCache();
    useEntries = cached.length ? cached : [];
  }
  const enriched = useEntries.map(e => ({
    ...e,
    likeCount: likeCounts[e.id] || e.likeCount || 0
  })).sort((a,b) => {
    if(b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
    return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
  });
  cachedEntries = enriched;
  renderEntries(enriched);
  if(!error && !likeError){
    saveContestCache(enriched);
    noteSupabaseSuccess();
    setStatus('');
  }
}

async function likeEntry(id){
  if(!clientId) ensureClientId();
  if(isSupabaseMaintenance()){
    setStatus('メンテナンス中のためいいねできません');
    return;
  }
  if(likedEntries.has(id)){
    setStatus('既にいいね済みです');
    return;
  }
  const { error } = await supabase.from('contest_likes').insert({ entry_id:id, client_id: clientId });
  if(error){
    if(String(error.message || '').includes('duplicate')){
      setStatus('既にいいね済みです');
    }else{
      setStatus('いいねに失敗しました');
      console.error(error);
      markSupabaseMaintenanceFromError(error);
    }
    return;
  }
  noteSupabaseSuccess();
  setStatus('いいねしました');
  await fetchAndRender();
}

function initUI(){
  const form = $(FORM_ID);
  if(form){
    form.addEventListener('submit', handleSubmit);
  }
  updateNameDisplay();
  const startBtn = $(START_BTN_ID);
  if(startBtn){
    startBtn.addEventListener('click', () => {
      startTimedMode();
      setStatus('10分ドットモードを開始しました');
    });
  }
  const promptEl = document.getElementById('promptText');
  if(promptEl){
    promptEl.textContent = PROMPT_TEXT;
  }
  updateTimer();
  if(supabaseMaintenance){
    setSupabaseMaintenance(true, 'cached');
  }
  updatePostControls();
  fetchAndRender();
  flushPostQueue().catch(err => console.warn('post queue flush failed', err));
  flushShareQueue().catch(err => console.warn('share queue flush failed', err));
  schedulePostQueueFlush();
}

window.addEventListener('DOMContentLoaded', initUI);
