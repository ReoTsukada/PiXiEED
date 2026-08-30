(function () {
  'use strict';

  const status = document.getElementById('postStatus');
  const empty = document.getElementById('postEmpty');
  const content = document.getElementById('postContent');
  const title = document.getElementById('postTitle');
  const kindBadge = document.getElementById('postKindBadge');
  const tags = document.getElementById('postTags');
  const avatar = document.getElementById('postAuthorAvatar');
  const authorName = document.getElementById('postAuthorName');
  const image = document.getElementById('postImage');
  const like = document.getElementById('postLike');
  const likeIcon = document.getElementById('postLikeIcon');
  const likeCount = document.getElementById('postLikeCount');
  const caption = document.getElementById('postCaption');
  const distributionLabel = document.getElementById('postDistributionLabel');
  const distributionNote = document.getElementById('postDistributionNote');
  const primaryAction = document.getElementById('postPrimaryAction');
  const commentsSection = document.getElementById('postCommentsSection');
  const commentCount = document.getElementById('postCommentCount');
  const commentForm = document.getElementById('postCommentForm');
  const commentBody = document.getElementById('postCommentBody');
  const commentLength = document.getElementById('postCommentLength');
  const commentSubmit = document.getElementById('postCommentSubmit');
  const commentNotice = document.getElementById('postCommentNotice');
  const commentList = document.getElementById('postCommentList');
  let post = null;
  let imageUrl = '';
  let currentUserId = '';

  function api() { return window.PiXiEEDSocialPosts; }

  function postId() {
    const embedded = String(document.body?.dataset?.socialPostId || '').trim();
    const queried = new URLSearchParams(location.search).get('id') || '';
    const matched = location.pathname.match(/\/posts\/([0-9a-f-]{36})\/?$/i)?.[1] || '';
    return embedded || queried || matched;
  }

  function updateLike() {
    like.setAttribute('aria-pressed', String(Boolean(post?.liked_by_me)));
    likeIcon.textContent = post?.liked_by_me ? '♥' : '♡';
    likeCount.textContent = Math.max(0, Number(post?.like_count) || 0).toLocaleString('ja-JP');
  }

  function contentKindLabel() {
    const kind = String(post?.content_kind || '').toLowerCase();
    if (post?.post_kind === 'market' || post?.distribution_mode === 'paid') return '有料素材';
    if (post?.post_kind === 'pixfind' || kind === 'game') return 'ゲーム作品';
    if (kind === 'wip') return '制作途中';
    if (post?.distribution_mode === 'free') return '無料配布（旧投稿）';
    if (kind === 'material') return '素材';
    return '完成作品';
  }

  function configureDistribution() {
    primaryAction.hidden = true;
    primaryAction.removeAttribute('download');
    if (post.post_kind === 'market') {
      const price = Number(post.sale_price_yen);
      distributionLabel.textContent = Number.isFinite(price) && price >= 500
        ? `販売素材　${price.toLocaleString('ja-JP')}円`
        : '販売素材';
      distributionNote.textContent = '価格、収録形式、利用条件は商品詳細で確認できます。';
      primaryAction.textContent = '商品詳細を見る';
      primaryAction.href = `/market/items/${encodeURIComponent(post.market_asset_id)}/`;
      primaryAction.hidden = false;
      return;
    }
    if (post.post_kind === 'pixfind') {
      distributionLabel.textContent = '旧ゲーム投稿（閲覧のみ）';
      distributionNote.textContent = '旧形式の投稿データです。現在は作品画像と説明のみ表示します。';
      return;
    }
    if (post.distribution_mode === 'free') {
      distributionLabel.textContent = '無料配布（旧投稿）';
      distributionNote.textContent = post.derivative_allowed
        ? '無料でダウンロードできます。派生作品の投稿も許可されています。'
        : '無料でダウンロードできます。';
      primaryAction.textContent = '無料ダウンロード';
      primaryAction.href = imageUrl;
      primaryAction.hidden = false;
      return;
    }
    distributionLabel.textContent = post.content_kind === 'material' ? '素材（ダウンロードなし）' : '作品公開のみ';
    distributionNote.textContent = post.content_kind === 'material'
      ? '素材として紹介されていますが、作者がダウンロードを許可していない作品です。'
      : 'この作品は閲覧用に公開されています。';
  }

  async function downloadImage(event) {
    if (!post || post.distribution_mode !== 'free') return;
    event.preventDefault();
    if (!imageUrl) return;
    const originalLabel = primaryAction.textContent;
    primaryAction.textContent = '準備しています…';
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`download failed: ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `pixieed-${post.id}.${blob.type === 'image/gif' ? 'gif' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (_error) {
      window.open(imageUrl, '_blank', 'noopener');
    } finally {
      primaryAction.textContent = originalLabel;
    }
  }

  function renderTags(values) {
    const safeTags = Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 5) : [];
    tags.replaceChildren(...safeTags.map((value) => {
      const label = document.createElement('span');
      label.textContent = `#${value}`;
      return label;
    }));
    tags.hidden = safeTags.length === 0;
  }

  function renderPost() {
    const postTitle = String(post.title || '').trim() || `${post.creator_display_name || 'PiXiEEDクリエイター'}のドット絵`;
    title.textContent = postTitle;
    if (kindBadge) kindBadge.textContent = contentKindLabel();
    document.title = `${postTitle} | PiXiEED`;
    avatar.src = api().avatarUrl(post.creator_avatar);
    authorName.textContent = post.creator_display_name || 'PiXiEEDクリエイター';
    image.src = imageUrl;
    image.alt = `${postTitle} - ${authorName.textContent}のドット絵`;
    const captionText = String(post.caption || '').trim();
    caption.textContent = captionText;
    caption.hidden = !captionText;
    renderTags(post.tags);
    updateLike();
    configureDistribution();
    status.hidden = true;
    if (empty) empty.hidden = true;
    content.hidden = false;
  }

  function showEmpty(messageKey) {
    status.hidden = true;
    if (empty) empty.hidden = false;
    if (messageKey) status.dataset.i18nKey = messageKey;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function setCommentNotice(message, isError = false) {
    commentNotice.textContent = message || '';
    commentNotice.classList.toggle('is-error', Boolean(message && isError));
  }

  function canRemove(comment) {
    return Boolean(currentUserId && (comment.is_mine || post?.creator_is_me));
  }

  function createCommentElement(comment) {
    const item = document.createElement('article');
    item.className = 'post-comment';
    const commentAvatar = new Image();
    commentAvatar.className = 'post-comment__avatar';
    commentAvatar.src = api().avatarUrl(comment.author_avatar);
    commentAvatar.alt = '';
    const meta = document.createElement('div');
    meta.className = 'post-comment__meta';
    const name = document.createElement('strong');
    name.textContent = comment.author_display_name || 'PiXiEEDクリエイター';
    const time = document.createElement('time');
    time.dateTime = String(comment.created_at || '');
    time.textContent = formatDate(comment.created_at);
    meta.append(name, time);
    const body = document.createElement('p');
    body.className = 'post-comment__body';
    body.textContent = String(comment.body || '');
    item.append(commentAvatar, meta);
    if (canRemove(comment)) {
      const remove = document.createElement('button');
      remove.className = 'post-comment__remove';
      remove.type = 'button';
      remove.textContent = comment.is_mine ? '削除' : '非表示';
      remove.addEventListener('click', async () => {
        if (remove.disabled || !confirm(`${remove.textContent}にしますか？`)) return;
        remove.disabled = true;
        try {
          await api().removeComment(comment.id);
          await loadComments();
        } catch (_error) {
          setCommentNotice('コメントを変更できませんでした。', true);
          remove.disabled = false;
        }
      });
      item.appendChild(remove);
    }
    item.appendChild(body);
    return item;
  }

  async function loadComments() {
    if (!post?.comments_enabled) {
      commentForm.hidden = true;
      commentList.replaceChildren();
      commentCount.textContent = '0';
      setCommentNotice('この作品はコメントを受け付けていません。');
      return;
    }
    try {
      const comments = await api().loadComments(post.id, 50);
      commentList.replaceChildren(...comments.map(createCommentElement));
      const total = Math.max(comments.length, Number(post.comment_count) || 0);
      commentCount.textContent = total.toLocaleString('ja-JP');
      if (!comments.length) setCommentNotice('まだコメントはありません。');
      else setCommentNotice('');
    } catch (error) {
      console.warn('social comments load failed', error);
      setCommentNotice('コメントを読み込めませんでした。', true);
    }
  }

  function commentErrorMessage(error) {
    const message = String(error?.message || '');
    if (/too many lines/i.test(message)) return 'コメントは4行までにしてください。';
    if (/links are not allowed/i.test(message)) return 'コメントにURLは入力できません。';
    if (/please wait/i.test(message)) return '連続投稿はできません。20秒ほど待ってください。';
    if (/hourly comment limit/i.test(message)) return '1時間の投稿上限に達しました。時間をおいてください。';
    if (/comments are unavailable/i.test(message)) return 'この作品にはコメントできません。';
    return 'コメントを投稿できませんでした。';
  }

  async function init() {
    const id = postId();
    if (!id) {
      showEmpty('postMissing');
      return;
    }
    try {
      const currentSession = await api().session().catch(() => null);
      currentUserId = String(currentSession?.user?.id || '');
      post = await api().loadPost(id);
      if (!post) throw new Error('post not found');
      let previews = {};
      if (post.post_kind === 'market') {
        try { previews = await api().marketPreviews([post.market_asset_id]); } catch (_error) {}
      }
      imageUrl = api().postImageUrl(post, previews) || '/icon/icon-512-4.png';
      renderPost();
      commentsSection.hidden = false;
      await loadComments();
    } catch (error) {
      console.warn('social post detail load failed', error);
      showEmpty('postLoadError');
    }
  }

  like?.addEventListener('click', async () => {
    if (!post || like.disabled) return;
    like.disabled = true;
    try {
      const result = await api().toggleLike(post.id);
      post.liked_by_me = Boolean(result?.liked);
      post.like_count = Number(result?.like_count) || 0;
      updateLike();
    } catch (error) {
      if (error?.code === 'LOGIN_REQUIRED' || /login required/i.test(error?.message || '')) location.href = api().loginUrl();
    } finally {
      like.disabled = false;
    }
  });

  primaryAction?.addEventListener('click', downloadImage);
  commentBody?.addEventListener('input', () => {
    const value = String(commentBody.value || '');
    commentLength.textContent = `${Array.from(value).length} / 200`;
  });
  commentForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = String(commentBody.value || '').trim();
    if (!body) {
      setCommentNotice('コメントを入力してください。', true);
      return;
    }
    if (body.split(/\r?\n/).length > 4) {
      setCommentNotice('コメントは4行までにしてください。', true);
      return;
    }
    commentSubmit.disabled = true;
    setCommentNotice('投稿しています。');
    try {
      await api().createComment(post.id, body);
      commentBody.value = '';
      commentLength.textContent = '0 / 200';
      post.comment_count = (Number(post.comment_count) || 0) + 1;
      await loadComments();
    } catch (error) {
      if (error?.code === 'LOGIN_REQUIRED' || /login required/i.test(error?.message || '')) {
        location.href = api().loginUrl();
        return;
      }
      setCommentNotice(commentErrorMessage(error), true);
    } finally {
      commentSubmit.disabled = false;
    }
  });

  init();
})();
