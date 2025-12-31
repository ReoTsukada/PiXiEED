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
const TIMED_DURATION_MS = 10 * 60 * 1000;

let deadline = null;
let timerHandle = null;
let timedStartedAt = null;
let clientId = null;
let likedEntries = new Set();

function $(id){
  return document.getElementById(id);
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

function setStatus(msg){
  const el = $(STATUS_ID);
  if(el) el.textContent = msg || '';
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
  const { width, height } = img;
  if(width > MAX_SIZE || height > MAX_SIZE){
    throw new Error(`画像サイズは${MAX_SIZE}x${MAX_SIZE}以内にしてください`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0,0,width,height).data;
  const colors = new Set();
  for(let i=0;i<data.length;i+=4){
    colors.add(`${data[i]}-${data[i+1]}-${data[i+2]}-${data[i+3]}`);
    if(colors.size > MAX_COLORS){
      throw new Error(`色数は${MAX_COLORS}色以内にしてください`);
    }
  }
  const dataUrl = canvas.toDataURL('image/png');
  return { width, height, colors: colors.size, dataUrl };
}

async function handleSubmit(e){
  e.preventDefault();
  const form = e.currentTarget;
  const name = form.name.value.trim() || '名無し';
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
  setStatus('投稿しています...');
  const payload = {
    name,
    title,
    prompt: PROMPT_TEXT,
    mode: isTimed ? 'timed10' : 'free',
    started_at: isTimed ? new Date(timedStartedAt).toISOString() : null,
    submitted_at: new Date().toISOString(),
    width: imageInfo.width,
    height: imageInfo.height,
    colors: imageInfo.colors,
    image_base64: imageInfo.dataUrl
  };
  const { error } = await supabase.from('contest_entries').insert(payload);
  if(error){
    setStatus('投稿に失敗しました');
    console.error(error);
    return;
  }
  form.reset();
  setStatus('投稿しました！');
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
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'entry-card';
    item.innerHTML = `
      <div class="entry-imgwrap"><img src="${entry.image_base64}" alt="${entry.title}"></div>
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
  gallery.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', () => likeEntry(Number(btn.dataset.id)));
  });
}

async function fetchAndRender(){
  ensureClientId();
  setStatus('読み込み中...');
  const { data: entries, error } = await supabase
    .from('contest_entries')
    .select('id,name,title,prompt,mode,submitted_at,width,height,colors,image_base64')
    .order('submitted_at', { ascending:false })
    .limit(100);
  if(error){
    setStatus('投稿の取得に失敗しました');
    console.error(error);
    return;
  }
  const { data: likes, error: likeError } = await supabase
    .from('contest_likes')
    .select('entry_id, client_id')
    .limit(1000);
  if(likeError){
    setStatus('いいね取得に失敗しました');
    console.error(likeError);
    return;
  }
  const likeCounts = {};
  likedEntries = new Set();
  likes?.forEach(l => {
    likeCounts[l.entry_id] = (likeCounts[l.entry_id] || 0) + 1;
    if(l.client_id === clientId){
      likedEntries.add(l.entry_id);
    }
  });
  const enriched = entries.map(e => ({
    ...e,
    likeCount: likeCounts[e.id] || 0
  })).sort((a,b) => {
    if(b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
    return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
  });
  renderEntries(enriched);
  setStatus('');
}

async function likeEntry(id){
  if(!clientId) ensureClientId();
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
    }
    return;
  }
  setStatus('いいねしました');
  await fetchAndRender();
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, s => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s] || s
  ));
}

function initUI(){
  const form = $(FORM_ID);
  if(form){
    form.addEventListener('submit', handleSubmit);
  }
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
  fetchAndRender();
}

window.addEventListener('DOMContentLoaded', initUI);
