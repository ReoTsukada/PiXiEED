import { createGuestAccountController } from './guest-account.mjs';
import { createGuestAuthAdapter } from './guest-auth-adapter.mjs';
import { createLocalLoginTransfer } from './local-login-transfer.mjs';

const mounted = new WeakMap();

/** Loaded only when the account panel is explicitly opened. */
export function initGuestAccountUi({ documentRef = document, controller, auth, localTransfer, storage = globalThis.localStorage } = {}) {
  const dialog = documentRef.querySelector('#guestAccountDialog');
  if (!dialog || mounted.has(dialog)) return mounted.get(dialog);
  const form = dialog.querySelector('#guestAccountForm');
  const status = dialog.querySelector('#guestAccountStatus');
  if (!form || !status) return null;
  const authApi = auth || createGuestAuthAdapter({storage});
  const api = controller || createGuestAccountController({ auth: authApi, storage });
  const local = localTransfer || createLocalLoginTransfer({auth:authApi,storage});
  let busy = false;
  const buttons = [...form.querySelectorAll('button')];
  const tell = (message) => { status.textContent = message; };
  const run = async (operation) => {
    if (busy) return;
    busy = true;
    buttons.forEach(button => { button.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    try { await operation(); }
    catch (error) { tell(error?.message || '確認できませんでした。元の作品とセッションを保持しています。'); }
    finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
      form.removeAttribute('aria-busy');
    }
  };
  async function prepare() {
    const pending = local.pending;
    if (pending && pending.phase !== 'completed') return pending;
    let sourceGuestId;
    // Do not create a guest merely to log in. A retained guest proof must verify.
    if (storage?.getItem('PiXiEED:supabase-session:v1') != null) {
      const source = await api.captureSource();
      if (source.user?.is_anonymous === true) sourceGuestId = source.guestId;
      else if (source.user?.is_anonymous !== false) throw new Error('元のアカウントを確認できません。');
    }
    return local.prepareLocal({includeLegacy:form.elements.namedItem('includeLegacy')?.checked === true,sourceGuestId});
  }
  async function finish(snapshot, {claimPosts = false} = {}) {
    const session = await authApi.getSession();
    const owner = session?.user;
    if (!owner?.id || owner.is_anonymous !== false || !owner.email_confirmed_at) throw new Error('登録済みアカウントの本人確認が必要です。');
    let claimed = false;
    if (claimPosts && snapshot.sourceGuestId && snapshot.sourceGuestId !== owner.id) {
      tell('両方のアカウントと投稿の引き継ぎ結果を確認しています…');
      const result = await api.claimForCurrentAccount({expectedTargetId:owner.id,expectedGuestId:snapshot.sourceGuestId,beforeDispatch:()=>local.markServerDispatch(snapshot)});
      if (result?.status !== 'claimed' || result.userId !== owner.id || result.guestId !== snapshot.sourceGuestId) throw new Error('投稿の引き継ぎを確認できませんでした。元の情報を保持しています。');
      claimed = true;
    }
    tell('この端末の絵・下書きの関連付けを確認しています…');
    const result = await local.completeLocal({verifiedOwnerId:owner.id,requestKey:snapshot.requestNonce,snapshot,guestClaimed:claimed});
    if (result?.status !== 'bound' || result.ownerId !== owner.id) throw new Error('端末内作品の関連付けが未完了です。再試行してください。');
    tell(`ログイン先への引き継ぎを確認しました。この端末の作品 ${result.count}件を関連付けました。旧作品の未選択分 ${result.legacyUnclaimedCount}件は各ツールに残っています。作品の公開状態は変えず、別端末へは自動同期しません。`);
    documentRef.dispatchEvent(new CustomEvent('pixieed:guest-account-confirmed', {bubbles:true}));
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const action = event.submitter?.value;
    if (!['send', 'verify', 'claim', 'cancel'].includes(action)) return;
    const email = form.elements.namedItem('email').value.trim();
    const mode = form.elements.namedItem('accountMode').value;
    const code = form.elements.namedItem('code').value.trim();
    void run(async () => {
      if (action === 'cancel') {
        local.cancel();
        tell('端末内作品の引き継ぎ準備を取り消しました。作品とログイン状態は保持しています。');
        return;
      }
      if (action === 'claim') { await finish(await prepare(), {claimPosts:true}); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('メールアドレスを確認してください。');
      if (action === 'verify' && !/^\d{6,10}$/.test(code)) throw new Error('メールの確認コードを入力してください。');
      const snapshot = await prepare();
      if (action === 'send') {
        tell('確認用メールを依頼しています…');
        if (mode === 'new') await api.promoteCurrent({ email });
        else await api.sendExistingLoginCode(email);
        tell('確認メールを依頼しました。本文に確認コードがある場合は入力してください。コードがないメール形式の場合は、ここでの引き継ぎを完了できません。作品はそのまま保持します。');
        form.elements.namedItem('code').focus();
      } else {
        tell('アカウントを確認しています…');
        if (mode === 'new') await api.verifyEmailRegistration({ email, code });
        else await api.verifyExistingLoginCode({ email, code });
        await finish(snapshot, {claimPosts:mode === 'existing'});
        form.elements.namedItem('code').value = '';
      }
    });
  });
  buttons.forEach(button => { button.disabled = false; });
  tell('端末内の作品はログイン後も各ツールに残ります。登録・ログインを始めると、確認済みの投稿と端末内作品を関連付けます。');
  const value = Object.freeze({ get busy() { return busy; } });
  mounted.set(dialog, value);
  return value;
}
