import { postingPolicy, isPostingPolicyReady, requirePostingConsent } from '../data/posting-policy.mjs?rev=20261024-posting-policy-1';

/** A fresh, non-persistent decision for one form. No consent is stored in drafts. */
export function createPostingConsentUi(host, { policy = postingPolicy, documentRef = host?.ownerDocument, windowRef = documentRef?.defaultView, onChange = () => {} } = {}) {
  if (!host || !documentRef) throw new TypeError('Consent host is required');
  if (documentRef.head && !documentRef.querySelector?.('link[data-posting-consent-style]') && !documentRef.querySelector?.('link[href*="posting-consent.css"]')) {
    const css = documentRef.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/posting-consent.css?rev=20261022-posting-live-1'; css.setAttribute('data-posting-consent-style', ''); documentRef.head.append(css);
  }
  policy = structuredClone(policy);
  const ready = isPostingPolicyReady(policy);
  host.classList.add('posting-consent'); host.setAttribute('aria-label', '公開投稿の条件'); host.setAttribute('role', 'group');
  const status = documentRef.createElement('p'); status.setAttribute('role', 'status'); status.tabIndex = -1;
  status.textContent = ready ? '公開前に2つの文書を確認してください。' : '公開投稿機能の準備・検証中です。公開送信はできません。自分用保存・試しプレイは利用できます。';
  host.append(status);
  let input = null;
  if (ready) {
    const links = documentRef.createElement('p');
    for (const [title, doc] of [['利用規約', policy.terms], ['プライバシーポリシー', policy.privacy]]) {
      const link = documentRef.createElement('a'); link.href = doc.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = `${title}（${doc.version}・別タブ）`; links.append(link, documentRef.createTextNode(' '));
    }
    const label = documentRef.createElement('label'); input = documentRef.createElement('input'); input.type = 'checkbox'; input.checked = false; input.autocomplete = 'off';
    label.append(input, documentRef.createTextNode(' 上記の利用規約とプライバシーポリシーに同意して公開投稿します。未成年の場合は保護者の同意を得ています。'));
    host.append(links, label);
  }
  const sessionStamp = () => { try { return ['PiXiEED:supabase-session:v1', 'PiXiEED:auth-session-recovery:v1', 'PiXiEED:legacy-owner-session:v1'].map(key => windowRef?.localStorage?.getItem(key) || '').join('\0'); } catch { return ''; } };
  let identityStamp = sessionStamp();
  // Bind the user's new decision before consumers render its enabled state.
  input?.addEventListener('change', () => { identityStamp = sessionStamp(); onChange(); });
  const reset = () => { if (input) input.checked = false; onChange(); };
  const onStorage = event => { if (!event.key || /supabase-session|auth-session|legacy-owner-session|guest-account/i.test(event.key)) reset(); };
  host.closest?.('form')?.addEventListener('reset', reset);
  windowRef?.addEventListener('storage', onStorage);
  windowRef?.addEventListener('pixieed:account-changed', reset);
  return {
    get ready() { return ready; },
    get accepted() { if (input?.checked && identityStamp !== sessionStamp()) reset(); return ready && input?.checked === true; },
    setPublic(value) { const wasPublic = !host.hidden; host.hidden = !value; if (!value && wasPublic) reset(); }, reset,
    read() { if (input?.checked && identityStamp !== sessionStamp()) reset(); return requirePostingConsent({ accepted: input?.checked === true, termsVersion: policy.terms.version, privacyVersion: policy.privacy.version }, policy); },
    focus() { (input || status).focus(); },
    destroy() { host.closest?.('form')?.removeEventListener('reset', reset); windowRef?.removeEventListener('storage', onStorage); windowRef?.removeEventListener('pixieed:account-changed', reset); }
  };
}
