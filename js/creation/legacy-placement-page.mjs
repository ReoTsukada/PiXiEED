import { supabaseConfig } from '../../data/site-config.js?rev=20261001-free-tools-1';
import { getCellById } from '../globe/geometry.mjs';
import { publicImageUrl } from '../globe/legacy-showcase.mjs';
import { cellFromPlaceInput, createLegacyPlacementApi, readOwnerAuthCallback } from './legacy-placement.mjs?rev=20261001-free-tools-1';
import { createMyPostsApi } from '../globe/my-posts.mjs?rev=20261006-profile-artwork-1';

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
    root.innerHTML = `<header><h2>以前の公開作品を管理</h2><p>以前のPiXiEEDアカウントに保存した公開作品を確認し、世界地図に表示する場所を設定できます。投稿した新しい絵は、上の一覧で確認できます。</p></header>
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
    const globeLink = element('a', 'legacy-placement__globe-link', '世界地図でこの作品を見る');
    globeLink.href = `/globe/?art=${encodeURIComponent(`showcase:${work.id}`)}`;
    globeLink.hidden = true;
    try {
      const center = getCellById(placedCellId).center;
      placed.textContent = `世界地図に表示中：${center.latitude.toFixed(2)}°, ${center.longitude.toFixed(2)}°`;
      globeLink.hidden = false;
    } catch { placed.textContent = '世界地図の場所は未設定です。'; }
    article.append(placed, globeLink);
    const form = element('form', 'legacy-placement__form');
    const label = element('label', '', '表示する場所（Googleマップのリンクか「緯度, 経度」）');
    const input = document.createElement('input');
    input.type = 'text'; input.required = true; input.autocomplete = 'off';
    input.placeholder = '35.6895, 139.6917'; input.setAttribute('aria-label', `${heading.textContent}の表示場所`);
    label.append(input);
    const preview = element('p', 'legacy-placement__preview', '正確な座標は保存せず、選んだ世界地図セルだけを公開します。');
    const save = element('button', '', placedCellId ? '場所を変更' : '世界地図へ置く');
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
        placed.textContent = `世界地図に表示中：${cell.center.latitude.toFixed(2)}°, ${cell.center.longitude.toFixed(2)}°`;
        globeLink.hidden = false;
        save.textContent = '場所を変更';
        showMessage('世界地図の場所を保存しました。');
      } catch (error) { showMessage(error.message || '保存できませんでした。', true); }
      finally { input.dispatchEvent(new Event('input')); }
    });
    form.append(label, preview, save); article.append(form);
    return article;
  }

  async function renderWorks() {
    root.innerHTML = `<header><h2>以前の公開作品</h2><p>過去のアカウントに保存された公開作品の表示場所を設定できます。</p></header>
      <div class="legacy-placement__toolbar"><button type="button" data-signout>ログアウト</button></div>
      <section class="legacy-placement__section" aria-labelledby="legacy-old-posts-title"><h3 id="legacy-old-posts-title">以前の公開作品</h3><p class="legacy-placement__section-intro">場所を決めると、世界地図に表示できます。</p><div class="legacy-placement__works" data-works></div><p class="legacy-placement__message" data-placement-message role="status" aria-live="polite"></p></section>`;
    root.querySelector('[data-signout]').addEventListener('click', () => {
      api.signOut();
      document.dispatchEvent(new Event('pixieed:legacy-owner-signed-out'));
      renderLogin();
    });
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

let activeMyPostsRefresh = null;
let myPostsMountPromise = null;

async function mountMyPosts() {
  let myPostsRoots = [...document.querySelectorAll('[data-my-posts-root]')];
  if (!myPostsRoots.length) return false;
  const api = createMyPostsApi();
  let profileRoot = document.querySelector('[data-profile-root]');
  const statusLabels = {
    pending: '公開処理中', published: '公開中', rejected: '非掲載', hidden: '非公開'
  };
  const postStatusLabel = (post) => post.deletionPending
    ? '画像の削除待ち'
    : post.status === 'pending' && post.puzzleMode
    ? 'パズル内容確認中'
    : statusLabels[post.status] || '状態不明';
  const formatDate = (timestamp) => {
    const date = new Date(Number(timestamp) || 0);
    return Number.isFinite(date.getTime()) && date.getTime() > 0
      ? new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
      : '日付不明';
  };
  const make = (tag, className, text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  let posts = [];
  let authorProfiles = [];
  let authorProfilesError = '';
  let viewer = null;
  let loadError = '';
  let loadBusy = false;
  let pendingDeleteId = '';
  let deleteBusy = false;
  let lastTrigger = null;
  let loadGeneration = 0;
  let likeGeneration = 0;
  const authorSaves = new Set();
  const authorMessages = new Map();
  const authorDrafts = new Map();

  const addLoginLink = (container) => {
    const link = make('a', 'button button--quiet', 'アカウントでログイン');
    link.href = '/profile/?view=posts';
    container.append(link);
  };

  function makeCard(post) {
    const card = make('article', 'profile-post-card');
    card.dataset.postId = post.id;
    const preview = make('button', 'profile-post-card__preview');
    preview.type = 'button';
    preview.setAttribute('aria-label', `${post.title}の詳細と画像を表示`);
    if (post.image?.dataUrl) {
      const image = make('img');
      image.src = post.image.dataUrl;
      image.alt = `${post.title}の投稿画像`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => image.replaceWith(make('span', 'profile-post-card__placeholder', post.deletionPending ? '公開は停止済みです' : '画像を読み込めませんでした')));
      preview.append(image);
    } else preview.append(make('span', 'profile-post-card__placeholder', post.deletionPending ? '公開は停止済みです' : '画像を読み込めませんでした'));
    preview.addEventListener('click', () => openPost(post, preview));
    const title = make('h3', 'profile-post-card__title', post.title || '無題');
    const meta = make('div', 'profile-post-card__meta');
    meta.append(make('span', 'profile-post-card__badge', postStatusLabel(post)));
    meta.lastElementChild.dataset.status = post.status || '';
    meta.append(make('span', '', formatDate(post.createdAt)));
    if (post.authorName) meta.append(make('span', 'profile-post-card__author', post.authorName));
    const ownership = make('span', '', post.sessionScope === 'device' ? 'この端末' : 'アカウント');
    ownership.setAttribute('aria-label', post.sessionScope === 'device' ? 'この端末のゲスト投稿' : 'アカウントの投稿');
    meta.append(ownership);
    const detail = make('button', 'profile-post-card__detail', '詳細を見る');
    detail.type = 'button';
    detail.addEventListener('click', () => openPost(post, detail));
    card.append(preview, title, meta, detail);
    return card;
  }

  function renderRoots() {
    myPostsRoots = [...document.querySelectorAll('[data-my-posts-root]')];
    profileRoot = document.querySelector('[data-profile-root]');
    const sorted = posts.filter((post) => post.status !== 'deleted');
    renderAuthorProfiles();
    for (const container of myPostsRoots) {
      const recent = container.dataset.myPostsView === 'recent';
      const visible = recent ? sorted.slice(0, 3) : sorted;
      container.replaceChildren();
      if (loadBusy && !sorted.length) {
        container.append(make('p', 'profile-my-posts__loading', '投稿を読み込んでいます…'));
        continue;
      }
      if (loadError && !sorted.length) {
        const error = make('p', 'profile-my-posts__message', loadError);
        error.dataset.error = 'true';
        const retry = make('button', 'profile-post-card__detail', 'もう一度読み込む');
        retry.type = 'button';
        retry.addEventListener('click', loadPosts);
        container.append(error, retry);
        continue;
      }
      if (!viewer && !sorted.length) {
        const empty = make('div', 'profile-my-posts__empty');
        empty.append(make('strong', '', '投稿した絵はまだありません'));
        empty.append(make('p', '', 'ログインして投稿を確認するか、地図から新しい作品を投稿できます。'));
        const actions = make('div', 'profile-overview__actions');
        const postLink = make('a', 'button button--primary', '作品を投稿する');
        postLink.href = '/globe/?post=1';
        actions.append(postLink);
        addLoginLink(actions);
        empty.append(actions);
        container.append(empty);
        continue;
      }
      if (!sorted.length) {
        const empty = make('div', 'profile-my-posts__empty');
        empty.append(make('strong', '', '投稿した絵はまだありません'));
        empty.append(make('p', '', '地図から作品を投稿すると、ここで画像や公開状態を確認できます。'));
        const postLink = make('a', 'button button--primary', '作品を投稿する');
        postLink.href = '/globe/?post=1';
        empty.append(postLink);
        container.append(empty);
        continue;
      }
      if (loadError && sorted.length) {
        const warning = make('p', 'profile-my-posts__message', `投稿の更新に失敗しました。表示中の一覧を保っています。${loadError}`);
        warning.dataset.error = 'true';
        const retry = make('button', 'profile-post-card__detail', '再読み込み');
        retry.type = 'button';
        retry.addEventListener('click', loadPosts);
        container.append(warning, retry);
      }
      for (const post of visible) container.append(makeCard(post));
    }
    const count = profileRoot?.querySelector('[data-profile-post-count]');
    if (count) count.textContent = loadError ? '—' : String(sorted.length);
    const greeting = profileRoot?.querySelector('[data-profile-greeting]');
    if (greeting && viewer) {
      greeting.textContent = viewer.isAnonymous
        ? 'この端末のゲスト記録と、見つけた絵を確認できます。'
        : `${viewer.name || 'あなた'}の投稿した作品や、見つけた絵をまとめて確認できます。`;
    }
  }

  function renderAuthorProfiles() {
    const hosts = [...document.querySelectorAll('[data-author-profiles-root]')];
    for (const host of hosts) {
      const formList = host.querySelector('[data-author-profiles-forms]');
      if (!formList) continue;
      formList.replaceChildren();
      host.hidden = !authorProfiles.length && !authorProfilesError;
      if (authorProfilesError) {
        const message = make('p', 'profile-author-settings__message', authorProfilesError);
        message.dataset.error = 'true';
        const retry = make('button', '', '作者名を読み直す');
        retry.type = 'button';
        retry.addEventListener('click', () => { void loadAuthorProfiles(); });
        formList.append(message, retry);
        continue;
      }
      for (const profile of authorProfiles) {
        const scope = profile.sessionScope === 'device' ? 'device' : 'account';
        const labelText = scope === 'device' ? 'この端末の投稿の作者名' : 'アカウントの作者名';
        const form = make('form', 'profile-author-settings__form');
        form.dataset.authorScope = scope;
        const label = make('label', '', labelText);
        const input = make('input');
        input.type = 'text';
        input.name = `author-name-${scope}`;
        input.value = authorDrafts.has(scope) ? authorDrafts.get(scope) : String(profile.name || '');
        input.required = true;
        input.maxLength = 80;
        input.autocomplete = 'nickname';
        input.disabled = authorSaves.has(scope);
        input.setAttribute('aria-describedby', `profile-author-help-${scope} profile-author-message-${scope}`);
        label.append(input);
        const help = make('span', 'profile-author-settings__help', '1〜40文字。地図と投稿済みの作品にも反映されます。');
        help.id = `profile-author-help-${scope}`;
        const controls = make('div', 'profile-author-settings__controls');
        const save = make('button', 'button button--quiet', '保存');
        save.type = 'submit';
        save.disabled = authorSaves.has(scope);
        const savedMessage = authorMessages.get(scope) || { text: '', error: false };
        const message = make('p', 'profile-author-settings__message', savedMessage.text);
        message.id = `profile-author-message-${scope}`;
        message.setAttribute('role', 'status');
        message.setAttribute('aria-live', 'polite');
        message.dataset.error = String(savedMessage.error);
        controls.append(save, message);
        form.append(label, help, controls);
        input.addEventListener('input', () => {
          authorDrafts.set(scope, input.value);
          authorMessages.delete(scope);
          message.textContent = '';
          message.dataset.error = 'false';
        });
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (authorSaves.has(scope)) return;
          const value = input.value.normalize('NFC').trim();
          const length = Array.from(value).length;
          if (length < 1 || length > 40 || /[\u0000-\u001f\u007f]/u.test(value)) {
            const text = '作者名は改行を含めず、前後の空白を除いて1〜40文字で入力してください。';
            authorMessages.set(scope, { text, error: true });
            message.textContent = text;
            message.dataset.error = 'true';
            input.focus();
            return;
          }
          const saveGeneration = loadGeneration;
          authorSaves.add(scope);
          authorMessages.set(scope, { text: '作者名を保存しています…', error: false });
          save.disabled = true;
          input.disabled = true;
          message.textContent = '作者名を保存しています…';
          message.dataset.error = 'false';
          try {
            if (typeof api.saveAuthorName !== 'function') throw new Error('作者名の保存機能を読み込めませんでした。');
            const result = await api.saveAuthorName(scope, value);
            if (saveGeneration !== loadGeneration) return;
            if (result?.ok !== true) throw new Error(result?.error || '作者名を保存できませんでした。');
            const savedName = String(result.name || value);
            authorDrafts.delete(scope);
            authorMessages.set(scope, { text: '作者名を保存しました。投稿済みの作品にも反映されます。', error: false });
            const profileIndex = authorProfiles.findIndex((candidate) => candidate.sessionScope === scope);
            if (profileIndex >= 0) authorProfiles[profileIndex] = { ...authorProfiles[profileIndex], name: savedName };
            posts = posts.map((post) => post.sessionScope === scope ? { ...post, authorName: savedName } : post);
            for (const matchingInput of document.querySelectorAll(`[data-author-scope="${scope}"] input`)) matchingInput.value = savedName;
            for (const matchingMessage of document.querySelectorAll(`[data-author-scope="${scope}"] [role="status"]`)) {
              matchingMessage.textContent = '作者名を保存しました。投稿済みの作品にも反映されます。';
              matchingMessage.dataset.error = 'false';
            }
            authorSaves.delete(scope);
            renderRoots();
            await loadPosts();
          } catch (error) {
            if (saveGeneration !== loadGeneration) return;
            message.textContent = error?.message || '作者名を保存できませんでした。もう一度お試しください。';
            authorMessages.set(scope, { text: message.textContent, error: true });
            message.dataset.error = 'true';
          } finally {
            authorSaves.delete(scope);
            if (saveGeneration === loadGeneration && save.isConnected) {
              save.disabled = false;
              input.disabled = false;
            } else if (saveGeneration === loadGeneration) {
              renderAuthorProfiles();
            }
          }
        });
        formList.append(form);
      }
    }
  }

  async function loadAuthorProfiles(expectedGeneration = loadGeneration) {
    if (typeof api.listAuthorProfiles !== 'function') {
      authorProfiles = [];
      authorProfilesError = '作者名設定を読み込めませんでした。';
      renderAuthorProfiles();
      return;
    }
    try {
      const result = await api.listAuthorProfiles();
      if (expectedGeneration !== loadGeneration) return;
      authorProfiles = Array.isArray(result) ? result.filter((profile) => ['account', 'device'].includes(profile.sessionScope)) : [];
      viewer = api.user;
      authorProfilesError = '';
    } catch (error) {
      if (expectedGeneration !== loadGeneration) return;
      authorProfilesError = error?.message || '作者名設定を読み込めませんでした。';
    }
    renderAuthorProfiles();
  }

  function ensureDialog() {
    if (document.querySelector('[data-profile-post-dialog]')) return document.querySelector('[data-profile-post-dialog]');
    const dialog = make('dialog', 'profile-post-dialog');
    dialog.dataset.profilePostDialog = '';
    dialog.setAttribute('aria-labelledby', 'profile-post-dialog-title');
    const inner = make('div', 'profile-post-dialog__inner');
    const header = make('header', 'profile-post-dialog__header');
    const title = make('h3', '', '投稿の詳細');
    title.id = 'profile-post-dialog-title';
    const close = make('button', 'profile-post-dialog__close', '閉じる');
    close.type = 'button';
    close.dataset.dialogClose = '';
    close.addEventListener('click', () => dialog.close());
    header.append(title, close);
    const status = make('span', 'profile-post-dialog__status');
    status.dataset.dialogStatus = '';
    const imageWrap = make('div', 'profile-post-dialog__image-wrap');
    imageWrap.dataset.dialogImage = '';
    const date = make('p', 'profile-post-dialog__meta');
    date.dataset.dialogDate = '';
    const kind = make('p', 'profile-post-dialog__meta');
    kind.dataset.dialogKind = '';
    const author = make('p', 'profile-post-dialog__meta');
    author.dataset.dialogAuthor = '';
    const caption = make('p', 'profile-post-dialog__caption');
    caption.dataset.dialogCaption = '';
    const actions = make('div', 'profile-post-dialog__actions');
    actions.dataset.dialogActions = '';
    const message = make('p', 'profile-post-dialog__message');
    message.dataset.dialogMessage = '';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    const confirm = make('section', 'profile-post-dialog__confirm');
    confirm.hidden = true;
    confirm.dataset.deleteConfirm = '';
    confirm.append(make('p', '', 'この投稿を削除しますか？削除すると地図からも表示されなくなります。'));
    confirm.firstElementChild.dataset.deleteConfirmCopy = '';
    const confirmActions = make('div', 'profile-post-dialog__confirm-actions');
    const cancel = make('button', '', '戻る');
    cancel.type = 'button';
    cancel.dataset.deleteCancel = '';
    cancel.addEventListener('click', () => { pendingDeleteId = ''; confirm.hidden = true; dialog.querySelector('[data-dialog-actions] button')?.focus(); });
    const remove = make('button', 'is-danger', '投稿を削除');
    remove.type = 'button';
    remove.dataset.deleteAction = '';
    remove.addEventListener('click', performDelete);
    confirmActions.append(cancel, remove);
    confirm.append(confirmActions);
    inner.append(header, status, imageWrap, date, author, kind, caption, actions, confirm, message);
    dialog.append(inner);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      pendingDeleteId = '';
      if (lastTrigger?.isConnected) lastTrigger.focus();
      lastTrigger = null;
    });
    document.body.append(dialog);
    return dialog;
  }

  let selectedPost = null;
  function openPost(post, trigger) {
    const dialog = ensureDialog();
    selectedPost = post;
    lastTrigger = trigger;
    pendingDeleteId = '';
    const title = dialog.querySelector('#profile-post-dialog-title');
    title.textContent = post.title || '無題';
    const status = dialog.querySelector('[data-dialog-status]');
    status.textContent = postStatusLabel(post);
    status.dataset.status = post.status || '';
    const imageWrap = dialog.querySelector('[data-dialog-image]');
    imageWrap.replaceChildren();
    if (post.image?.dataUrl) {
      const image = make('img', 'profile-post-dialog__image');
      image.src = post.image.dataUrl;
      image.alt = `${post.title || '投稿作品'}の画像`;
      image.decoding = 'async';
      image.addEventListener('error', () => image.replaceWith(make('p', 'profile-post-dialog__missing', post.deletionPending ? '公開は停止済みです。画像の削除を完了してください。' : '画像を読み込めませんでした。投稿情報は引き続き確認できます。')));
      imageWrap.append(image);
    } else imageWrap.append(make('p', 'profile-post-dialog__missing', post.deletionPending ? '公開は停止済みです。画像の削除を完了してください。' : '画像を読み込めませんでした。投稿情報は引き続き確認できます。'));
    dialog.querySelector('[data-dialog-date]').textContent = `投稿日時：${formatDate(post.createdAt)}`;
    dialog.querySelector('[data-dialog-author]').textContent = post.authorName ? `作者：${post.authorName}` : '作者名未設定';
    const kindLabel = post.postKind === 'pixel_camera' ? 'ドット絵カメラ' : '手描きのドット絵';
    const scopeLabel = post.sessionScope === 'device' ? 'この端末に保存' : 'アカウントに保存';
    const puzzleLabel = post.puzzleMode ? 'パズル作品・内容確認後に公開' : '';
    dialog.querySelector('[data-dialog-kind]').textContent = [kindLabel, scopeLabel, puzzleLabel].filter(Boolean).join(' ・ ');
    dialog.querySelector('[data-dialog-caption]').textContent = post.caption || '';
    const actions = dialog.querySelector('[data-dialog-actions]');
    actions.replaceChildren();
    if (post.status === 'published') {
      const globe = make('a', '', '地図で見る');
      globe.href = `/globe/?art=${encodeURIComponent(post.id)}`;
      actions.append(globe);
    }
    const deleteButton = make('button', 'is-danger', '削除する');
    deleteButton.textContent = post.deletionPending ? '削除を完了する' : '削除する';
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => {
      pendingDeleteId = post.id;
      dialog.querySelector('[data-delete-confirm]').hidden = false;
      dialog.querySelector('[data-delete-cancel]').focus();
    });
    actions.append(deleteButton);
    dialog.querySelector('[data-delete-confirm-copy]').textContent = post.deletionPending
      ? '公開停止済みの投稿画像を削除します。処理が完了すると一覧から消えます。'
      : 'この投稿を削除しますか？削除すると地図からも表示されなくなります。';
    dialog.querySelector('[data-delete-confirm]').hidden = true;
    const message = dialog.querySelector('[data-dialog-message]');
    message.textContent = '';
    message.dataset.error = 'false';
    dialog.showModal();
    dialog.querySelector('[data-dialog-close]').focus();
  }

  async function performDelete() {
    const dialog = ensureDialog();
    if (!pendingDeleteId || deleteBusy) return;
    const id = pendingDeleteId;
    const remove = dialog.querySelector('[data-delete-action]');
    const cancel = dialog.querySelector('[data-delete-cancel]');
    const message = dialog.querySelector('[data-dialog-message]');
    deleteBusy = true;
    remove.disabled = true;
    cancel.disabled = true;
    message.textContent = '投稿を削除しています…';
    message.dataset.error = 'false';
    try {
      const result = await api.remove(id);
      if (result?.ok !== true || result?.deleted !== true) throw new Error('削除結果を確認できませんでした。再読み込みしてご確認ください。');
      posts = posts.filter((post) => post.id !== id);
      selectedPost = null;
      renderRoots();
      dialog.close();
      myPostsRoots[0]?.focus();
    } catch (error) {
      message.textContent = error?.message || '投稿を削除できませんでした。もう一度お試しください。';
      message.dataset.error = 'true';
    } finally {
      deleteBusy = false;
      remove.disabled = false;
      cancel.disabled = false;
    }
  }

  async function loadPosts() {
    const generation = ++loadGeneration;
    loadBusy = true;
    loadError = '';
    renderRoots();
    try {
      const loadedPosts = (await api.listPosts()).filter((post) => post.status !== 'deleted');
      if (generation !== loadGeneration) return;
      posts = loadedPosts;
      viewer = api.user;
      loadError = '';
    } catch (error) {
      if (generation !== loadGeneration) return;
      loadError = error?.message || '投稿を読み込めませんでした。';
      viewer = api.user;
    } finally {
      if (generation !== loadGeneration) return;
      await loadAuthorProfiles(generation);
      if (generation !== loadGeneration) return;
      loadBusy = false;
      renderRoots();
    }
  }

  async function updateLikeCount() {
    const count = profileRoot?.querySelector('[data-profile-like-count]');
    if (!count) return;
    const generation = ++likeGeneration;
    count.textContent = '—';
    try {
      const { listMyPublishedLikes } = await import('../globe/post-supabase.mjs?rev=20261006-profile-artwork-1');
      const ids = await listMyPublishedLikes();
      if (generation === likeGeneration && count.isConnected) {
        count.textContent = String(Number(count.dataset.localLikes) + new Set(ids).size);
      }
    } catch {
      if (generation === likeGeneration && count.isConnected) count.textContent = '—';
    }
  }

  activeMyPostsRefresh = () => {
    myPostsRoots = [...document.querySelectorAll('[data-my-posts-root]')];
    profileRoot = document.querySelector('[data-profile-root]');
    renderRoots();
    if (!loadBusy) void updateLikeCount();
  };

  const refreshAfterSessionChange = () => {
    loadGeneration += 1;
    likeGeneration += 1;
    posts = [];
    viewer = null;
    loadError = '';
    authorProfiles = [];
    authorProfilesError = '';
    authorMessages.clear();
    authorDrafts.clear();
    profileRoot?.querySelector('[data-profile-like-count]')?.replaceChildren('—');
    const dialog = document.querySelector('[data-profile-post-dialog]');
    if (dialog?.open) dialog.close();
    renderRoots();
    myPostsRoots[0]?.focus();
    void (async () => { await loadPosts(); await updateLikeCount(); })();
  };
  document.addEventListener('pixieed:legacy-owner-signed-out', refreshAfterSessionChange);
  window.addEventListener('storage', (event) => {
    if (event.key == null || event.key === 'PiXiEED:legacy-owner-session:v1' || event.key === 'PiXiEED:supabase-session:v1' || /^sb-.+-auth-token$/.test(event.key)) {
      refreshAfterSessionChange();
    }
  });
  await loadPosts();
  await updateLikeCount();
  return true;
}

function startMyPosts() {
  if (activeMyPostsRefresh) {
    activeMyPostsRefresh();
    return;
  }
  if (myPostsMountPromise || !document.querySelector('[data-my-posts-root]')) return;
  myPostsMountPromise = mountMyPosts().catch((error) => {
    for (const host of document.querySelectorAll('[data-my-posts-root]')) {
      const message = document.createElement('p');
      message.className = 'profile-my-posts__message';
      message.dataset.error = 'true';
      message.textContent = error?.message || '投稿を読み込めませんでした。ページを再読み込みしてください。';
      host.replaceChildren(message);
    }
  });
}

document.addEventListener('pixieed:profile-rendered', startMyPosts);
document.addEventListener('DOMContentLoaded', startMyPosts);
if (document.querySelector('[data-my-posts-root]')) startMyPosts();
