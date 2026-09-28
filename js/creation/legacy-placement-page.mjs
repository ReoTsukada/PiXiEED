import { supabaseConfig } from '../../data/site-config.js';
import { getCellById } from '../globe/geometry.mjs';
import { publicImageUrl } from '../globe/legacy-showcase.mjs';
import { cellFromPlaceInput, createLegacyPlacementApi, readOwnerAuthCallback } from './legacy-placement.mjs';

const root = document.querySelector('#legacy-placement-root');
if (root && new URLSearchParams(location.search).get('view') === 'posts') {
  root.hidden = false;
  const api = createLegacyPlacementApi();
  const callback = readOwnerAuthCallback(location.hash);
  if (callback) {
    const cleanUrl = new URL(location.href);
    cleanUrl.hash = '';
    history.replaceState(history.state, '', cleanUrl);
  }

  const redirectTo = new URL('/profile/?view=posts', location.origin).toString();
  const element = (tag, className, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const showMessage = (text, error = false) => {
    const message = root.querySelector('[data-placement-message]');
    if (!message) return;
    message.textContent = text;
    message.dataset.error = String(error);
  };

  function renderLogin() {
    root.innerHTML = `<header><h2>投稿した絵を確認</h2><p>以前の投稿に使ったアカウントでログインすると、新しい投稿の審査状況と以前の公開作品を確認できます。以前の公開作品には、地球儀で表示する場所を設定できます。</p></header>
      <div class="legacy-placement__signin"><button type="button" data-google>Googleでログイン</button>
      <form data-email-form><label>以前使ったメールアドレス<input type="email" name="email" required autocomplete="email" inputmode="email"></label><button type="submit">ログイン用リンクを送る</button></form></div>
      <p class="legacy-placement__message" data-placement-message role="status" aria-live="polite"></p>`;
    root.querySelector('[data-google]').addEventListener('click', () => location.assign(api.oauthUrl(redirectTo)));
    root.querySelector('[data-email-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button');
      button.disabled = true;
      showMessage('ログイン用リンクを送っています…');
      try {
        await api.sendEmailLink(form.elements.email.value, redirectTo);
        showMessage('メールを確認してください。リンクから戻ると作品を表示します。');
      } catch (error) { showMessage(error.message || 'メールを送れませんでした。', true); }
      finally { button.disabled = false; }
    });
  }

  function userPostCard(post) {
    const article = element('article', 'legacy-placement__user-post');
    article.append(element('h4', '', post.title));
    article.append(element('p', 'legacy-placement__user-post-meta', post.postKind === 'pixel_camera' ? '投稿方法：ドット絵カメラ' : '投稿方法：手描き'));
    const statusLabel = {
      pending: '審査中',
      published: '公開中',
      rejected: '今回は掲載されませんでした',
      hidden: '非公開'
    }[post.status];
    article.append(element('p', 'legacy-placement__user-post-status', `審査状態：${statusLabel}`));
    if (post.status === 'published') {
      const link = element('a', 'legacy-placement__globe-link', '地球儀でこの作品を見る');
      link.href = `/?art=${encodeURIComponent(post.id)}`;
      article.append(link);
    }
    return article;
  }

  function workCard(work, placedCellId, canPlace) {
    const article = element('article', 'legacy-placement__work');
    const heading = element('h3', '', String(work.title || work.caption || '公開作品').slice(0, 160));
    const imageUrl = publicImageUrl(supabaseConfig.url, work.media_object_path);
    if (imageUrl) {
      const image = element('img', 'legacy-placement__image');
      image.src = imageUrl; image.alt = ''; image.loading = 'lazy';
      article.append(image);
    }
    article.append(heading);
    const placed = element('p', 'legacy-placement__current');
    const globeLink = element('a', 'legacy-placement__globe-link', '地球儀でこの作品を見る');
    globeLink.href = `/?art=${encodeURIComponent(`showcase:${work.id}`)}`;
    globeLink.hidden = true;
    try {
      const center = getCellById(placedCellId).center;
      placed.textContent = `地球儀に表示中：${center.latitude.toFixed(2)}°, ${center.longitude.toFixed(2)}°`;
      globeLink.hidden = false;
    } catch { placed.textContent = '地球儀の場所は未設定です。'; }
    article.append(placed, globeLink);
    const form = element('form', 'legacy-placement__form');
    const label = element('label', '', '表示する場所（Googleマップのリンクか「緯度, 経度」）');
    const input = document.createElement('input');
    input.type = 'text'; input.required = true; input.autocomplete = 'off';
    input.placeholder = '35.6895, 139.6917'; input.setAttribute('aria-label', `${heading.textContent}の表示場所`);
    label.append(input);
    const preview = element('p', 'legacy-placement__preview', '正確な座標は保存せず、選んだ地球儀セルだけを公開します。');
    const save = element('button', '', placedCellId ? '場所を変更' : '地球儀へ置く');
    save.type = 'submit'; save.disabled = true;
    input.addEventListener('input', () => {
      try {
        const cell = cellFromPlaceInput(input.value);
        preview.textContent = `公開位置：${cell.center.latitude.toFixed(2)}°, ${cell.center.longitude.toFixed(2)}° のセル`;
        save.disabled = !canPlace;
      } catch { preview.textContent = 'Googleマップのリンクか緯度・経度を入力してください。'; save.disabled = true; }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      save.disabled = true;
      showMessage('場所を保存しています…');
      try {
        const cell = await api.place(work.id, input.value);
        placed.textContent = `地球儀に表示中：${cell.center.latitude.toFixed(2)}°, ${cell.center.longitude.toFixed(2)}°`;
        globeLink.hidden = false;
        save.textContent = '場所を変更';
        showMessage('地球儀の場所を保存しました。');
      } catch (error) { showMessage(error.message || '保存できませんでした。', true); }
      finally { input.dispatchEvent(new Event('input')); }
    });
    form.append(label, preview, save); article.append(form);
    return article;
  }

  async function renderWorks() {
    root.innerHTML = `<header><h2>投稿した絵</h2><p>新しい投稿の審査状態と、以前の公開作品を確認できます。</p></header>
      <div class="legacy-placement__toolbar"><button type="button" data-signout>ログアウト</button></div>
      <section class="legacy-placement__section" aria-labelledby="legacy-new-posts-title"><h3 id="legacy-new-posts-title">新しい投稿</h3><div class="legacy-placement__user-posts" data-user-posts></div><p class="legacy-placement__message" data-user-posts-message role="status" aria-live="polite"></p></section>
      <section class="legacy-placement__section" aria-labelledby="legacy-old-posts-title"><h3 id="legacy-old-posts-title">以前の公開作品</h3><p class="legacy-placement__section-intro">場所を決めると、地球儀に表示できます。</p><div class="legacy-placement__works" data-works></div><p class="legacy-placement__message" data-placement-message role="status" aria-live="polite"></p></section>`;
    root.querySelector('[data-signout]').addEventListener('click', () => { api.signOut(); renderLogin(); });
    const userPostsList = root.querySelector('[data-user-posts]');
    const userPostsMessage = root.querySelector('[data-user-posts-message]');
    const setUserPostsMessage = (text, error = false) => {
      userPostsMessage.textContent = text;
      userPostsMessage.dataset.error = String(error);
    };
    setUserPostsMessage('新しい投稿を読み込んでいます…');
    try {
      const userPosts = await api.listUserPosts();
      userPostsList.replaceChildren(...userPosts.map(userPostCard));
      setUserPostsMessage(userPosts.length ? `${userPosts.length}件の新しい投稿があります。` : '新しい投稿はまだありません。');
    } catch (error) {
      userPostsList.replaceChildren();
      setUserPostsMessage(error.message || '新しい投稿を読み込めませんでした。', true);
    }

    const oldPostsMessage = root.querySelector('[data-placement-message]');
    const oldList = root.querySelector('[data-works]');
    oldPostsMessage.textContent = '以前の公開作品を読み込んでいます…';
    try {
      const works = await api.listWorks();
      let placements = new Map(); let canPlace = true;
      try { placements = await api.listPlacements(works.map((work) => work.id)); }
      catch { canPlace = false; }
      oldList.replaceChildren(...works.map((work) => workCard(work, placements.get(work.id), canPlace)));
      if (!works.length) oldPostsMessage.textContent = '以前の公開作品はまだありません。';
      else if (!canPlace) oldPostsMessage.textContent = '旧作品の配置機能を読み込めませんでした。作品の表示だけ確認できます。';
      else oldPostsMessage.textContent = `${works.length}件の以前の公開作品を確認しました。`;
    } catch (error) {
      oldList.replaceChildren();
      oldPostsMessage.textContent = error.message || '以前の公開作品を読み込めませんでした。';
      oldPostsMessage.dataset.error = 'true';
    }
  }

  renderLogin();
  if (callback?.error) showMessage(callback.error, true);
  else {
    try {
      if (await api.restore(callback?.session || null)) await renderWorks();
    } catch { showMessage('ログイン状態を確認できませんでした。通信を確認して再度お試しください。', true); }
  }
}
