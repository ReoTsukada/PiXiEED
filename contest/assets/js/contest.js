import { supabase } from './supabase.js';

const FORM_ID = 'contestForm';
const FILE_INPUT_ID = 'contestFile';
const STATUS_ID = 'contestStatus';
const GALLERY_ID = 'contestGallery';
const PROMPT_TEXT = '自由投稿';
const MAX_SIZE = 512;
const MAX_COLORS = 256;

let clientId = null;
let likedEntries = new Set();
let currentFilter = 'all';
let currentSort = 'new';
let cachedEntries = [];
let placeholderCache = null;

const PLACEHOLDERS = new Array(10).fill(0).map((_, i) => ({
  title: `サンプル${i + 1}`,
  name: `サンプル${i + 1}`,
  mode: i % 2 === 0 ? 'timed10' : 'free'
}));

function $(id){
  return document.getElementById(id);
}

function ensureClientId(){
  const KEY = 'pixieed_client_id'; // サイト共通ID
  try{
    const saved = localStorage.getItem(KEY) || window.PIXIEED_CLIENT_ID;
    if(saved){
      clientId = saved;
      if(!localStorage.getItem(KEY)) localStorage.setItem(KEY, saved);
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

function setupTabs(){
  const filterTabs = document.getElementById('filterTabs');
  const sortTabs = document.getElementById('sortTabs');
  if(filterTabs){
    filterTabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter || 'all';
        filterTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        renderEntries(applyFilterAndSort(cachedEntries));
      });
    });
  }
  if(sortTabs){
    sortTabs.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSort = btn.dataset.sort || 'new';
        sortTabs.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        renderEntries(applyFilterAndSort(cachedEntries));
      });
    });
  }
}

async function fileToImageInfo(file){
  const img = await createImageBitmap(file);
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
  const file = form[FILE_INPUT_ID]?.files?.[0];
  if(!file){
    setStatus('画像ファイルを選択してください');
    return;
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
    mode: 'free',
    started_at: null,
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
          <div class="entry-imgwrap">
            <img src="${entry.image_base64}" alt="${entry.title}">
            <button class="heart-btn" data-id="${entry.id}" aria-label="いいね" ${likedEntries.has(entry.id) ? 'disabled' : ''}>
              <img src="${likedEntries.has(entry.id) ? '../pixiedraw/assets/Fav.svg' : '../pixiedraw/assets/NFav.svg'}" alt="like icon">
            </button>
          </div>
        <div class="entry-meta">
          <div class="entry-meta__top">
            <span class="entry-title">${escapeHtml(entry.title || '無題')}</span>
            <span class="entry-like">❤ ${entry.likeCount || 0}</span>
          </div>
        <p class="entry-author">by ${escapeHtml(entry.name || '名無し')}</p>
        </div>
      `;
      gallery.appendChild(item);
    });
    gallery.querySelectorAll('.heart-btn').forEach(btn => {
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
    // 失敗時もダミーを表示して静かに続行
  }
  const { data: likes, error: likeError } = await supabase
    .from('contest_likes')
    .select('entry_id, client_id')
    .limit(1000);
  if(likeError){
    setStatus('いいね取得に失敗しました');
    console.error(likeError);
    // 失敗時はlikeなしで進む
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
    useEntries = await buildPlaceholders();
  }
  const enriched = useEntries.map(e => ({
    ...e,
    likeCount: likeCounts[e.id] || e.likeCount || 0
  }));
  cachedEntries = enriched;
  renderEntries(applyFilterAndSort(cachedEntries));
  setStatus('');
}

async function buildPlaceholders(){
  if(placeholderCache) return placeholderCache;
  const entries = [];
  for(const p of PLACEHOLDERS){
    entries.push({
      id: 100000 + entries.length,
      name: p.name,
      title: p.title,
      width: 128,
      height: 128,
      colors: 1,
      image_base64: makePlaceholder('#e5e7eb'),
      submitted_at: new Date().toISOString(),
      likeCount: 0,
      mode: p.mode || 'free'
    });
  }
  placeholderCache = entries;
  return entries;
}

function applyFilterAndSort(entries){
  let filtered = entries.slice();
  if(currentFilter === 'timed10'){
    filtered = filtered.filter(e => e.mode === 'timed10');
  }else if(currentFilter === 'px32'){
    filtered = filtered.filter(e => (e.width || 999) <= 32 && (e.height || 999) <= 32);
  }
  if(currentSort === 'popular'){
    filtered.sort((a,b) => {
      if(b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    });
  }else{
    filtered.sort((a,b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  }
  return filtered;
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

function makePlaceholder(color){
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/><rect x="20" y="20" width="160" height="160" fill="rgba(255,255,255,0.22)"/><text x="50%" y="52%" text-anchor="middle" fill="#fff" font-family="DotGothic16,monospace" font-size="16">SAMPLE</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function initUI(){
  const form = $(FORM_ID);
  if(form){
    form.addEventListener('submit', handleSubmit);
  }
  const promptEl = document.getElementById('promptText');
  if(promptEl){
    promptEl.textContent = PROMPT_TEXT;
  }
  fetchAndRender();
  setupPostPanel();
  setupTabs();
}

window.addEventListener('DOMContentLoaded', initUI);
function setupPostPanel(){
  const openBtn = document.getElementById('openPostPanel');
  const panel = document.getElementById('postPanel');
  const closeBtn = document.getElementById('closePostPanel');
  if(!openBtn || !panel) return;
  const open = () => {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden','false');
  };
  const close = () => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden','true');
  };
  openBtn.addEventListener('click', open);
  if(closeBtn){
    closeBtn.addEventListener('click', close);
  }
  panel.addEventListener('click', (e) => {
    if(e.target === panel) close();
  });
}
