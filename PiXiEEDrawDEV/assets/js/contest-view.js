import { supabase } from './contest-supabase.js';

const ENTRY_IMAGE_ID = 'entryImage';
const ENTRY_TITLE_ID = 'entryTitle';
const ENTRY_META_ID = 'entryMeta';
const ENTRY_LIKE_BUTTON_ID = 'entryLikeButton';
const ENTRY_LIKE_COUNT_ID = 'entryLikeCount';
const COMMENT_LIST_ID = 'commentList';
const COMMENT_EMPTY_ID = 'commentEmpty';
const COMMENT_FORM_ID = 'commentForm';
const COMMENT_BODY_ID = 'commentBody';
const COMMENT_STATUS_ID = 'commentStatus';
const REPLY_TARGET_ID = 'replyTarget';
const REPLY_TARGET_TEXT_ID = 'replyTargetText';
const REPLY_TO_COMMENT_ID = 'replyToCommentId';
const CLEAR_REPLY_BUTTON_ID = 'clearReplyButton';
const CLIENT_KEY = 'pixiedraw_lite_client';
const NICKNAME_KEY = 'pixieed_nickname';

let clientId = '';
let entryId = null;
let currentEntry = null;
let currentComments = [];
let liked = false;

function $(id){
  return document.getElementById(id);
}

function ensureClientId(){
  try{
    const saved = localStorage.getItem(CLIENT_KEY);
    if(saved){
      clientId = saved;
      return;
    }
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, clientId);
  }catch(_){
    clientId = `guest-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function getNickname(){
  try{
    return localStorage.getItem(NICKNAME_KEY) || '名無し';
  }catch(_){
    return '名無し';
  }
}

function setStatus(message){
  const el = $(COMMENT_STATUS_ID);
  if(el) el.textContent = message || '';
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
  ));
}

function formatDate(value){
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit'
  }).format(date);
}

function resolveImage(entry){
  return entry?.image_url || entry?.image_base64 || entry?.thumb_url || '';
}

function getEntryIdFromLocation(){
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('id');
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function getCommentPreview(commentId){
  const comment = currentComments.find(item => item.id === commentId);
  if(!comment) return `#${commentId}`;
  const text = String(comment.body || '').trim().replace(/\s+/g, ' ');
  return text ? `${comment.name || '名無し'}: ${text.slice(0, 40)}` : `${comment.name || '名無し'}`;
}

function syncReplyTarget(){
  const wrap = $(REPLY_TARGET_ID);
  const text = $(REPLY_TARGET_TEXT_ID);
  const input = $(REPLY_TO_COMMENT_ID);
  if(!wrap || !text || !input) return;
  const value = Number(input.value);
  if(!Number.isFinite(value) || value <= 0){
    wrap.classList.remove('is-active');
    text.textContent = '';
    return;
  }
  wrap.classList.add('is-active');
  text.textContent = `返信先: ${getCommentPreview(value)}`;
}

function setReplyTarget(commentId){
  const input = $(REPLY_TO_COMMENT_ID);
  if(!input) return;
  input.value = String(commentId || '');
  syncReplyTarget();
  $(COMMENT_BODY_ID)?.focus();
}

function renderEntry(){
  if(!currentEntry) return;
  const image = $(ENTRY_IMAGE_ID);
  const title = $(ENTRY_TITLE_ID);
  const meta = $(ENTRY_META_ID);
  const likeButton = $(ENTRY_LIKE_BUTTON_ID);
  const likeCount = $(ENTRY_LIKE_COUNT_ID);
  if(image){
    image.src = resolveImage(currentEntry);
    image.alt = currentEntry.title || '作品画像';
  }
  if(title) title.textContent = currentEntry.title || '無題';
  if(meta){
    meta.textContent = `${currentEntry.name || '名無し'} / ${formatDate(currentEntry.submitted_at)}`;
  }
  if(likeCount) likeCount.textContent = String(currentEntry.likeCount || 0);
  if(likeButton){
    likeButton.classList.toggle('is-liked', liked);
    likeButton.innerHTML = `${liked ? '♥' : '♡'} <span id="${ENTRY_LIKE_COUNT_ID}">${currentEntry.likeCount || 0}</span>`;
  }
}

function renderComments(){
  const list = $(COMMENT_LIST_ID);
  const empty = $(COMMENT_EMPTY_ID);
  if(!list || !empty) return;
  if(!currentComments.length){
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = '';
  currentComments.forEach(comment => {
    const item = document.createElement('article');
    item.className = 'comment';
    const replyLabel = comment.reply_to_comment_id
      ? `<div class="reply-label">返信先: ${escapeHtml(getCommentPreview(comment.reply_to_comment_id))}</div>`
      : '';
    const avatarContent = comment.avatar_url
      ? `<img src="${escapeHtml(comment.avatar_url)}" alt="">`
      : escapeHtml(String(comment.name || '名').trim().charAt(0) || '名');
    item.innerHTML = `
      <div class="comment-head">
        <div class="avatar">${avatarContent}</div>
        <div class="comment-meta">
          <div class="comment-name">${escapeHtml(comment.name || '名無し')}</div>
          <div class="comment-date">${escapeHtml(formatDate(comment.created_at))}</div>
        </div>
      </div>
      ${replyLabel}
      <p class="comment-body">${escapeHtml(comment.body || '')}</p>
      <button class="comment-reply" type="button" data-reply-id="${comment.id}">返信</button>
    `;
    list.appendChild(item);
  });
  list.querySelectorAll('[data-reply-id]').forEach(button => {
    button.addEventListener('click', () => setReplyTarget(Number(button.dataset.replyId)));
  });
}

async function fetchEntry(){
  const { data, error } = await supabase
    .from('contest_entries')
    .select('id,name,title,submitted_at,image_url,thumb_url,image_base64')
    .eq('id', entryId)
    .maybeSingle();
  if(error) throw error;
  if(!data) throw new Error('entry not found');
  currentEntry = data;
}

async function fetchLikes(){
  const { data, error } = await supabase
    .from('contest_likes')
    .select('client_id')
    .eq('entry_id', entryId);
  if(error) throw error;
  const rows = Array.isArray(data) ? data : [];
  currentEntry.likeCount = rows.length;
  liked = rows.some(row => row.client_id === clientId);
}

async function fetchComments(){
  const { data, error } = await supabase
    .from('contest_comments')
    .select('id,entry_id,client_id,name,avatar_url,body,created_at,reply_to_comment_id,deleted_at')
    .eq('entry_id', entryId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if(error) throw error;
  currentComments = Array.isArray(data) ? data : [];
}

async function refresh(){
  await Promise.all([fetchEntry(), fetchLikes(), fetchComments()]);
  renderEntry();
  renderComments();
  syncReplyTarget();
}

async function likeEntry(){
  if(liked){
    setStatus('既にいいね済みです');
    return;
  }
  const { error } = await supabase
    .from('contest_likes')
    .insert({ entry_id: entryId, client_id: clientId });
  if(error){
    if(String(error.message || '').includes('duplicate')){
      liked = true;
      setStatus('既にいいね済みです');
      await fetchLikes();
      renderEntry();
      return;
    }
    setStatus('いいねに失敗しました');
    return;
  }
  await fetchLikes();
  renderEntry();
  setStatus('いいねしました');
}

async function handleCommentSubmit(event){
  event.preventDefault();
  const bodyEl = $(COMMENT_BODY_ID);
  const replyEl = $(REPLY_TO_COMMENT_ID);
  const body = String(bodyEl?.value || '').trim();
  if(!body){
    setStatus('コメントを入力してください');
    return;
  }
  const replyTo = Number(replyEl?.value || '');
  const payload = {
    entry_id: entryId,
    client_id: clientId,
    name: getNickname(),
    avatar_url: null,
    body,
    reply_to_comment_id: Number.isFinite(replyTo) && replyTo > 0 ? replyTo : null,
  };
  const { error } = await supabase.from('contest_comments').insert(payload);
  if(error){
    console.error(error);
    setStatus('コメント送信に失敗しました');
    return;
  }
  if(bodyEl) bodyEl.value = '';
  if(replyEl) replyEl.value = '';
  setStatus('コメントを送信しました');
  await fetchComments();
  renderComments();
  syncReplyTarget();
}

async function init(){
  ensureClientId();
  entryId = getEntryIdFromLocation();
  if(!entryId){
    setStatus('作品IDが見つかりません');
    return;
  }
  $(ENTRY_LIKE_BUTTON_ID)?.addEventListener('click', likeEntry);
  $(COMMENT_FORM_ID)?.addEventListener('submit', handleCommentSubmit);
  $(CLEAR_REPLY_BUTTON_ID)?.addEventListener('click', () => setReplyTarget(null));
  try{
    await refresh();
    setStatus('');
  }catch(error){
    console.error(error);
    setStatus('作品の読み込みに失敗しました');
  }
}

window.addEventListener('DOMContentLoaded', init);
