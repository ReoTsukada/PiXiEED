(function () {
  'use strict';

  const feed = document.getElementById('socialFeed');
  const feedStatus = document.getElementById('socialFeedStatus');
  const emptyState = document.getElementById('socialFeedEmpty');
  const openButton = document.getElementById('socialComposeOpen');
  const dialog = document.getElementById('socialComposeDialog');
  const closeButton = document.getElementById('socialComposeClose');
  const form = document.getElementById('socialComposeForm');
  const fileInput = document.getElementById('socialComposeFile');
  const preview = document.getElementById('socialComposePreview');
  const pickerLabel = document.getElementById('socialComposePickerLabel');
  const contentKindInput = document.getElementById('socialComposeContentKind');
  const titleInput = document.getElementById('socialComposeTitleInput');
  const caption = document.getElementById('socialComposeCaption');
  const tagsInput = document.getElementById('socialComposeTags');
  const commentsEnabled = document.getElementById('socialComposeComments');
  const composeStatus = document.getElementById('socialComposeStatus');
  const submit = document.getElementById('socialComposeSubmit');
  let previewUrl = '';
  let renderId = 0;
  let activeFeedFilter = 'recommended';
  let loadedPosts = null;
  let loadedMarketPreviews = {};

  function api() {
    return window.PiXiEEDSocialPosts;
  }

  function setFeedStatus(message) {
    if (feedStatus) feedStatus.textContent = message || '';
  }

  function setEmptyState(visible) {
    if (emptyState) emptyState.hidden = !visible;
  }

  function setComposeStatus(message) {
    if (composeStatus) composeStatus.textContent = message || '';
  }

  function feedCopy(key) {
    const english = document.documentElement.dataset.pixieedLocale === 'en';
    const messages = english ? {
      loading: 'Loading posts.',
      empty: 'No posts yet. Be the first to share your work.',
      following: 'No followed posts are available yet.',
      error: 'Posts could not be loaded. Please try again later.',
    } : {
      loading: '作品を読み込んでいます。',
      empty: 'まだ作品がありません。最初の作品を投稿してみましょう。',
      following: 'フォロー中の作品はまだありません。',
      error: '作品を読み込めませんでした。時間をおいてもう一度お試しください。',
    };
    return messages[key] || '';
  }

  function postDate(post) {
    const value = post?.created_at || post?.published_at || post?.updated_at || '';
    const timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function postsForFilter(posts) {
    const source = Array.isArray(posts) ? posts : [];
    if (activeFeedFilter === 'popular') {
      return [...source].sort((a, b) => (Number(b?.like_count) || 0) - (Number(a?.like_count) || 0));
    }
    if (activeFeedFilter === 'new') {
      return [...source].sort((a, b) => postDate(b) - postDate(a));
    }
    if (activeFeedFilter === 'following') {
      return source.filter((post) => Boolean(post?.is_following || post?.following || post?.creator_is_following));
    }
    return source;
  }

  function updateLike(button, liked, count) {
    button.setAttribute('aria-pressed', String(Boolean(liked)));
    button.querySelector('[data-like-icon]').textContent = liked ? '♥' : '♡';
    button.querySelector('[data-like-count]').textContent = Math.max(0, Number(count) || 0).toLocaleString('ja-JP');
  }

  function contentKindLabel(post) {
    const kind = String(post?.content_kind || '').toLowerCase();
    if (post?.post_kind === 'market' || post?.distribution_mode === 'paid') return '有料素材';
    if (kind === 'wip') return '制作途中';
    if (post?.distribution_mode === 'free') return '無料配布（旧投稿）';
    if (kind === 'material') return '素材';
    if (kind === 'game' || post?.post_kind === 'pixfind') return 'ゲーム';
    return '完成作品';
  }

  function createCard(post, marketPreviews) {
    const card = document.createElement('article');
    card.className = 'market-card social-post-card';

    const author = document.createElement('div');
    author.className = 'market-card__author social-post-card__author';
    const avatar = new Image();
    avatar.src = api().avatarUrl(post.creator_avatar);
    avatar.alt = '';
    avatar.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = post.creator_display_name || 'PiXiEEDクリエイター';
    author.append(avatar, name);

    const kind = document.createElement('span');
    kind.className = 'social-post-card__kind';
    kind.textContent = contentKindLabel(post);
    kind.setAttribute('aria-label', `作品種別: ${kind.textContent}`);
    author.appendChild(kind);

    const previewBox = document.createElement('div');
    previewBox.className = 'market-card__preview social-post-card__preview';
    const imageLink = document.createElement('a');
    imageLink.className = 'social-post-card__image';
    imageLink.href = api().detailUrl(post);
    imageLink.setAttribute('aria-label', `${name.textContent}の作品を開く`);
    const image = new Image();
    image.src = api().postImageUrl(post, marketPreviews) || '/icon/icon-512-4.png';
    image.alt = `${name.textContent}の作品`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('error', () => { image.src = '/icon/icon-512-4.png'; }, { once: true });
    imageLink.appendChild(image);

    const like = document.createElement('button');
    like.type = 'button';
    like.className = 'market-favorite-button market-card__favorite social-post-card__like';
    like.setAttribute('aria-label', 'この作品にいいね');
    like.innerHTML = '<span data-like-icon aria-hidden="true">♡</span><small data-like-count>0</small>';
    updateLike(like, post.liked_by_me, post.like_count);
    like.addEventListener('click', async () => {
      if (like.disabled) return;
      like.disabled = true;
      try {
        const result = await api().toggleLike(post.id);
        post.liked_by_me = Boolean(result?.liked);
        post.like_count = Number(result?.like_count) || 0;
        updateLike(like, post.liked_by_me, post.like_count);
      } catch (error) {
        if (error?.code === 'LOGIN_REQUIRED' || /login required/i.test(error?.message || '')) {
          location.href = api().loginUrl();
          return;
        }
        setFeedStatus('いいねを更新できませんでした。時間をおいてお試しください。');
      } finally {
        like.disabled = false;
      }
    });

    previewBox.append(imageLink, like);
    card.append(author, previewBox);
    return card;
  }

  function createFeedAd() {
    const ad = document.createElement('aside');
    ad.className = 'market-ad market-ad--list social-feed-ad';
    ad.setAttribute('aria-label', '広告');
    window.PiXiEEDCardFeedAds?.reserve(ad, '180px');
    ad.innerHTML = '<small class="market-ad__label">広告</small><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9801602250480253" data-ad-slot="2141591954" data-ad-format="auto" data-full-width-responsive="true"></ins>';
    return ad;
  }

  async function render({ reload = true } = {}) {
    if (!feed || !api()) return;
    const currentRenderId = ++renderId;
    setEmptyState(false);
    if (reload || !Array.isArray(loadedPosts)) setFeedStatus(feedCopy('loading'));
    try {
      if (reload || !Array.isArray(loadedPosts)) {
        loadedPosts = await api().loadFeed(120);
        const marketIds = loadedPosts.filter((post) => post.post_kind === 'market').map((post) => post.market_asset_id);
        loadedMarketPreviews = {};
        try {
          loadedMarketPreviews = await api().marketPreviews(marketIds);
        } catch (error) {
          console.warn('market previews unavailable in social feed', error);
        }
      }
      if (currentRenderId !== renderId) return;
      const posts = postsForFilter(loadedPosts);
      if (!posts.length) {
        feed.replaceChildren();
        setFeedStatus(activeFeedFilter === 'following' ? feedCopy('following') : feedCopy('empty'));
        setEmptyState(true);
        return;
      }
      const cards = posts.map((post) => createCard(post, loadedMarketPreviews));
      const progressive = window.PiXiEEDCardFeedAds?.renderProgressively;
      if (typeof progressive === 'function') {
        const progressiveRender = progressive({
          grid: feed,
          cards,
          createAd: createFeedAd,
          requestAd: (ad) => window.pixieedObserveAds?.(ad),
          isCurrent: () => currentRenderId === renderId,
        });
        // The first batch is appended synchronously by the progressive
        // renderer. Do not keep a page-level loading message visible while
        // later ad batches are waiting for their own outcome.
        setFeedStatus('');
        await progressiveRender;
      } else {
        feed.replaceChildren(...cards);
        setFeedStatus('');
      }
    } catch (error) {
      console.warn('social feed load failed', error);
      feed.replaceChildren();
      setFeedStatus(feedCopy('error'));
      setEmptyState(false);
    }
  }

  document.querySelectorAll('[data-social-feed-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFeedFilter = String(button.dataset.socialFeedFilter || 'recommended');
      document.querySelectorAll('[data-social-feed-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      void render({ reload: false });
    });
  });

  function resetCompose() {
    form?.reset();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
    if (pickerLabel) pickerLabel.hidden = false;
    if (contentKindInput) contentKindInput.value = 'finished';
    setComposeStatus('');
  }

  openButton?.addEventListener('click', async () => {
    try {
      const currentSession = await api().session();
      if (!currentSession?.user) {
        location.href = api().loginUrl();
        return;
      }
      dialog?.showModal();
    } catch (_error) {
      location.href = api().loginUrl();
    }
  });

  closeButton?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('close', resetCompose);
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  fileInput?.addEventListener('change', () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = fileInput.files?.[0];
    previewUrl = file ? URL.createObjectURL(file) : '';
    if (preview) {
      preview.hidden = !previewUrl;
      if (previewUrl) preview.src = previewUrl;
    }
    if (pickerLabel) pickerLabel.hidden = Boolean(previewUrl);
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput?.files?.[0];
    if (!file) {
      setComposeStatus('投稿する画像を選択してください。');
      return;
    }
    const contentKindValues = new Set(['finished', 'wip', 'material', 'game']);
    const contentKind = contentKindValues.has(String(contentKindInput?.value || ''))
      ? String(contentKindInput.value)
      : 'finished';
    const title = String(titleInput?.value || '').trim() || ({
      finished: '完成作品', wip: '制作途中の作品', material: 'ドット絵素材', game: 'ゲーム作品'
    }[contentKind] || 'ドット絵作品');
    const tags = String(tagsInput?.value || '').split(/[,、]/).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 5) {
      setComposeStatus('タグは5個までにしてください。');
      return;
    }
    if (tags.some((tag) => Array.from(tag).length > 24)) {
      setComposeStatus('タグは1個24文字までにしてください。');
      return;
    }
    submit.disabled = true;
    setComposeStatus('投稿しています。');
    try {
      const postId = await api().createImagePost(file, {
        title,
        contentKind,
        caption: caption?.value || '',
        tags,
        commentsEnabled: Boolean(commentsEnabled?.checked),
      });
      dialog?.close();
      await render();
      if (postId) history.replaceState(history.state, '', `${location.pathname}#post-${postId}`);
    } catch (error) {
      if (error?.code === 'LOGIN_REQUIRED' || /login required/i.test(error?.message || '')) {
        location.href = api().loginUrl();
        return;
      }
      setComposeStatus(error?.message || '投稿できませんでした。');
    } finally {
      submit.disabled = false;
    }
  });

  render();
})();
