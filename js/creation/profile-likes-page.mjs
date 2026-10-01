if (new URLSearchParams(location.search).get('view') === 'likes') {
  let loaded = null;
  let loading = null;
  let failed = false;

  function card(post) {
    const article = document.createElement('article');
    article.className = 'art-card profile-liked-post';
    const imageLink = document.createElement('a');
    imageLink.className = 'art-card__image';
    imageLink.href = `/globe/?art=${encodeURIComponent(post.id)}`;
    imageLink.setAttribute('aria-label', `地球儀で「${post.title}」を見る`);
    const image = document.createElement('img');
    image.src = post.image.dataUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    imageLink.append(image);
    const body = document.createElement('div');
    body.className = 'art-card__body';
    const title = document.createElement('h3');
    const titleLink = document.createElement('a');
    titleLink.href = imageLink.href;
    titleLink.textContent = post.title;
    title.append(titleLink);
    const kind = document.createElement('p');
    kind.textContent = post.postKind === 'pixel_camera' ? 'ドット絵カメラの作品' : '手描きのドット絵';
    body.append(title, kind);
    article.append(imageLink, body);
    return article;
  }

  function render() {
    const host = document.querySelector('[data-profile-liked-posts]');
    if (!host || loaded === null) return;
    if (loaded.length) {
      const grid = document.createElement('div');
      grid.className = 'art-grid';
      grid.append(...loaded.map(card));
      host.replaceChildren(grid);
      host.removeAttribute('role');
    } else {
      host.textContent = host.dataset.hasLegacyLikes === 'true' ? '' : 'いいねした作品はまだありません。';
    }
  }

  function mount() {
    const host = document.querySelector('[data-profile-liked-posts]');
    if (!host) return;
    if (loaded !== null) { render(); return; }
    if (failed) { host.textContent = 'いいねした作品を読み込めませんでした。再読み込みしてください。'; return; }
    if (loading) return;
    loading = (async () => {
      const { listMyPublishedLikes, loadPublishedMapPostsByIds } = await import('../globe/post-supabase.mjs?rev=20261001-free-tools-1');
      const ids = await listMyPublishedLikes();
      return ids.length ? loadPublishedMapPostsByIds(ids) : [];
    })();
    loading.then((posts) => {
      loaded = Array.isArray(posts) ? posts : [];
      render();
    }).catch(() => {
      failed = true;
      const current = document.querySelector('[data-profile-liked-posts]');
      if (current) current.textContent = 'いいねした作品を読み込めませんでした。再読み込みしてください。';
    });
  }

  document.addEventListener('pixieed:profile-rendered', mount);
  mount();
}
