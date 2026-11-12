import { loadHomeArtworkImage } from '../js/home-artworks.mjs?rev=20261112-posted-random-1';
import { loadReviewArtworks, submitReviewAction } from './home-artwork-review-api.mjs?rev=20261112-home-review-1';
import { getAdminSession, subscribeAdminSession, clearAdminSession } from './moderation.js?rev=20261112-home-review-1';
const LABELS = { pending: '未確認', approved: '承認済み', held: '見送り' };
/** One deliberately reviewed image at a time; a generation invalidates all stale work. */
export function bindHomeArtworkReview(root) {
  if (!root) return null;
  const doc = root.ownerDocument, win = doc.defaultView;
  let session = null, epoch = 0, active = null, imageActive = null, objectURL = '', disposed = false, paused = false;
  let filter = 'pending', rows = [], index = 0, nextCursor = null, cursors = [null], busy = false, locked = false, verified = false;
  let currentDialog = null;
  root.innerHTML = `<div class="admin-section-heading"><div><span class="eyebrow">home selection</span><h2>ホーム掲載</h2></div><p>本人が掲載を許可した公開作品を確認します。掲載には、画像・権利・内容の運営確認が必要です。</p></div>
    <p class="home-review__note">見送りはホームの掲載対象から外す操作です。元の投稿を削除したり、非公開にしたりしません。</p>
    <div class="home-review__toolbar"><div class="home-review__tabs" role="group" aria-label="掲載状態">${Object.entries(LABELS).map(([value, label]) => `<button class="button button--quiet" type="button" data-home-filter="${value}" aria-pressed="${value === 'pending'}">${label}</button>`).join('')}</div><button class="button button--quiet" type="button" data-home-refresh>再読み込み</button></div>
    <p class="home-review__status" data-home-status role="status" aria-live="polite"></p><button class="button button--quiet" type="button" data-home-login-guide hidden>管理者ログインへ</button><div data-home-card></div><div class="home-review__pagination" data-home-pagination></div>`;
  const host = root.querySelector('[data-home-card]'), status = root.querySelector('[data-home-status]'), pagination = root.querySelector('[data-home-pagination]');
  const alive = generation => !disposed && !paused && root.isConnected && generation === epoch;
  const message = (text, error = false) => { status.textContent = text; status.classList.toggle('is-error', error); };
  const closeDialog = () => { if (currentDialog) { currentDialog.close(); currentDialog.remove(); currentDialog = null; } };
  const clearImage = () => { imageActive?.abort(); imageActive = null; if (objectURL) win.URL.revokeObjectURL(objectURL); objectURL = ''; verified = false; };
  const invalidate = () => { ++epoch; active?.abort(); active = null; clearImage(); closeDialog(); };
  const controls = () => {
    root.querySelectorAll('[data-home-filter]').forEach(button => { button.disabled = !session || busy || locked; button.setAttribute('aria-pressed', String(button.dataset.homeFilter === filter)); });
    root.querySelector('[data-home-refresh]').disabled = !session || busy;
    root.querySelector('[data-home-login-guide]').hidden = Boolean(session);
    host.querySelectorAll('input').forEach(input => { input.disabled = busy || locked; });
    const approved = host.querySelector('[data-home-approve]');
    if (approved) approved.disabled = !verified || !rows[index]?.approvalEligible || busy || locked || [...host.querySelectorAll('input')].some(input => !input.checked);
    const hold = host.querySelector('[data-home-hold]'); if (hold) hold.disabled = busy || locked;
    pagination.querySelectorAll('button').forEach(button => { button.disabled = busy || locked; });
  };
  const clear = (text) => { invalidate(); rows = []; nextCursor = null; busy = false; locked = false; host.replaceChildren(); pagination.replaceChildren(); message(text); controls(); };
  const authFailure = () => { clearAdminSession(); clear('管理者としてログインし直してください。投稿審査と共通のログインを使います。'); };
  const button = (label, callback) => { const node = doc.createElement('button'); node.type = 'button'; node.className = 'button button--quiet'; node.textContent = label; node.addEventListener('click', callback); return node; };
  const load = async () => {
    if (!session || disposed || paused || busy) return;
    invalidate(); const generation = epoch; active = new AbortController(); busy = true; locked = false; rows = []; index = 0;
    host.replaceChildren(); pagination.replaceChildren(); message('掲載候補を読み込んでいます…'); controls();
    try {
      const page = await loadReviewArtworks(session, { state: filter, after: cursors.at(-1), signal: active.signal });
      if (!alive(generation)) return;
      rows = page.artworks; nextCursor = page.nextCursor; busy = false;
      renderCard();
      const summary = rows.length ? `${LABELS[filter]}の作品を、1点ずつ確認できます。` : page.skippedCount ? 'このページに確認できる候補はありません。' : filter === 'pending' ? 'ホーム掲載を許可した公開作品で、未確認の作品はありません。' : `${LABELS[filter]}のホーム掲載候補はありません。`;
      message(summary + (page.skippedCount ? ` 情報を確認できない${page.skippedCount}点は表示していません。` : ''));
    } catch (error) {
      if (!alive(generation)) return;
      if ([401, 403].includes(error.status)) return authFailure();
      busy = false; locked = true; message('掲載候補を読み込めませんでした。再読み込みしてください。', true); controls();
    }
  };
  const confirm = (action) => {
    const artwork = rows[index];
    if (!artwork || busy || locked || currentDialog || action === 'approve' && (!verified || !artwork.approvalEligible || [...host.querySelectorAll('input')].some(input => !input.checked))) return;
    const generation = epoch, dialog = doc.createElement('dialog'); currentDialog = dialog; dialog.className = 'home-review__dialog';
    const heading = doc.createElement('h3'); heading.textContent = action === 'approve' ? 'ホーム掲載を承認しますか？' : 'ホーム掲載を見送りますか？';
    const target = doc.createElement('p'); target.className = 'home-review__target'; target.textContent = `「${artwork.title}」 / ${artwork.authorName}`;
    const help = doc.createElement('p'); help.textContent = action === 'approve' ? 'この画像を確認済みとして、ホームの掲載対象にします。本人の許可や公開状態が変わった場合は掲載されません。' : 'ホームの掲載対象から外します。元の投稿の公開状態は変更しません。';
    const actions = doc.createElement('div'); actions.className = 'home-review__actions';
    const cancel = button('キャンセル', closeDialog), submit = button(action === 'approve' ? '承認する' : '見送る', async () => {
      if (!alive(generation) || busy || locked || rows[index] !== artwork) return closeDialog();
      closeDialog(); busy = true; controls(); message('保存しています…');
      const values = { postId: artwork.postId, snapshotToken: artwork.snapshotToken, action, ...(action === 'approve' ? { confirmedStillImage: true, confirmedRights: true, confirmedContent: true } : {}) };
      try {
        await submitReviewAction(session, values, { signal: active?.signal });
        if (!alive(generation)) return;
        busy = false; await load();
      } catch (error) {
        if (!alive(generation)) return;
        if ([401, 403].includes(error.status)) return authFailure();
        busy = false; locked = true;
        message(error.status === 409 ? '作品や同意の状態が変わりました。再読み込みして、もう一度画像を確認してください。' : '保存結果を確認できません。再操作せず、再読み込みで現在の状態を確かめてください。', true);
        controls();
      }
    });
    submit.className = 'button button--primary'; submit.dataset.homeConfirm = action; cancel.dataset.homeCancel = '';
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    actions.append(cancel, submit); dialog.append(heading, target, help, actions); root.append(dialog); dialog.showModal(); cancel.focus();
  };
  const renderCard = () => {
    clearImage(); closeDialog(); host.replaceChildren(); pagination.replaceChildren();
    const artwork = rows[index];
    if (!artwork) {
      if (cursors.length > 1) pagination.append(button('前のページ', () => { cursors.pop(); void load(); }));
      if (nextCursor) pagination.append(button('次のページ', () => { cursors.push(nextCursor); void load(); }));
      controls(); return;
    }
    const card = doc.createElement('article'); card.className = 'home-review__card'; card.dataset.homePost = artwork.postId;
    const stage = doc.createElement('div'); stage.className = 'home-review__image-stage';
    const image = doc.createElement('img'); image.alt = artwork.title; image.decoding = 'async'; image.hidden = true; image.referrerPolicy = 'no-referrer';
    const imageStatus = doc.createElement('p'); imageStatus.textContent = '画像の一致と表示を確認しています…'; imageStatus.setAttribute('role', 'status'); stage.append(image, imageStatus);
    const detail = doc.createElement('div'); detail.className = 'home-review__detail';
    const badge = doc.createElement('span'); badge.className = 'home-review__badge'; badge.textContent = LABELS[artwork.reviewState] + (artwork.eligible ? '' : '・掲載対象外');
    const title = doc.createElement('h3'); title.textContent = artwork.title;
    const author = doc.createElement('p'); author.className = 'home-review__author'; author.textContent = `作者：${artwork.authorName}`;
    const time = doc.createElement('p'); time.className = 'home-review__date'; time.textContent = artwork.eligible ? `公開日：${new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(artwork.publishedAt))}` : '本人の許可または公開条件を満たしていないため、画像は表示しません。';
    detail.append(badge, title, author, time);
    if (artwork.eligible && !artwork.approvalEligible) { const note = doc.createElement('p'); note.className = 'is-error'; note.textContent = '公開作品名・公開作者名を設定してから確認してください。現在は承認できません。'; detail.append(note); }
    if (artwork.eligible && artwork.reviewState !== 'approved') {
      const checks = doc.createElement('fieldset'); checks.className = 'home-review__checks';
      const legend = doc.createElement('legend'); legend.textContent = '承認前に3項目を確認'; checks.append(legend);
      for (const text of ['静止画像として表示できている', '掲載に必要な権利と本人の同意を確認した', 'ホームへの掲載内容に問題がない']) {
        const label = doc.createElement('label'), input = doc.createElement('input'), span = doc.createElement('span'); input.type = 'checkbox'; span.textContent = text; input.addEventListener('change', controls); label.append(input, span); checks.append(label);
      }
      detail.append(checks);
    }
    const actions = doc.createElement('div'); actions.className = 'home-review__actions';
    if (artwork.eligible && artwork.reviewState !== 'approved') { const approve = button('掲載を承認', () => confirm('approve')); approve.className = 'button button--primary'; approve.dataset.homeApprove = ''; actions.append(approve); }
    if (artwork.reviewState !== 'held') { const hold = button('見送る', () => confirm('hold')); hold.dataset.homeHold = ''; actions.append(hold); }
    detail.append(actions); card.append(stage, detail); host.append(card);
    const count = doc.createElement('span'); count.textContent = `${cursors.length}ページ目 · ${index + 1} / ${rows.length}作品`;
    if (cursors.length > 1) pagination.append(button('前のページ', () => { cursors.pop(); void load(); }));
    if (index > 0) pagination.append(button('前の作品', () => { if (!busy && !locked) { index--; renderCard(); } }));
    pagination.append(count);
    if (index + 1 < rows.length) pagination.append(button('次の作品', () => { if (!busy && !locked) { index++; renderCard(); } }));
    if (nextCursor) pagination.append(button('次のページ', () => { cursors.push(nextCursor); void load(); }));
    controls();
    if (!artwork.eligible) { image.remove(); imageStatus.textContent = '掲載対象外のため、画像を表示しません。'; return; }
    const generation = epoch; imageActive = new AbortController(); const imageSignal = imageActive.signal;
    void (async () => {
      let url = '';
      try {
        url = await loadHomeArtworkImage(artwork, { signal: imageSignal });
        if (!alive(generation) || imageSignal.aborted) { win.URL.revokeObjectURL(url); return; }
        objectURL = url; image.src = url; await image.decode();
        if (!alive(generation) || imageSignal.aborted || !image.naturalWidth || !image.naturalHeight) return;
        verified = true; image.hidden = false; imageStatus.textContent = '画像を確認できます。'; imageStatus.className = 'home-review__verified'; controls();
      } catch {
        if (!alive(generation) || imageSignal.aborted) return;
        if (url) win.URL.revokeObjectURL(url); if (objectURL === url) objectURL = '';
        image.removeAttribute('src'); imageStatus.textContent = '画像を確認できません。再読み込みしてください。承認はできません。'; imageStatus.className = 'is-error'; verified = false; controls();
      }
    })();
  };
  root.querySelector('[data-home-login-guide]').addEventListener('click', () => { const login = doc.querySelector('[data-moderation-email]'); login?.scrollIntoView({ block: 'center', behavior: 'auto' }); login?.focus({ preventScroll: true }); });
  root.querySelector('[data-home-refresh]').addEventListener('click', () => { if (!busy) void load(); });
  root.querySelectorAll('[data-home-filter]').forEach(button => button.addEventListener('click', () => { if (busy || locked || filter === button.dataset.homeFilter) return; filter = button.dataset.homeFilter; cursors = [null]; void load(); }));
  const unsubscribe = subscribeAdminSession(value => {
    session = value; cursors = [null]; clear(value ? '掲載候補を読み込んでいます…' : '投稿審査の管理者ログイン後に利用できます。'); if (session) void load();
  });
  const onHide = () => { paused = true; clear('画面を再確認しています。'); };
  const onShow = () => { paused = false; session = getAdminSession(); if (session) void load(); else clear('投稿審査の管理者ログイン後に利用できます。'); };
  win.addEventListener('pagehide', onHide); win.addEventListener('pageshow', onShow);
  return { dispose() { disposed = true; unsubscribe(); clear(''); win.removeEventListener('pagehide', onHide); win.removeEventListener('pageshow', onShow); } };
}
