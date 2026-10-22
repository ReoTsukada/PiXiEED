// Approved final text. Keep draft until release gates are complete; activation also needs real
// DB/Auth/Gateway/browser verification. Never fill these from localStorage.
export const postingPolicy = Object.freeze({
  state: 'draft', contactConfirmed: true, effectiveCandidateDate: '2026-10-22',
  terms: Object.freeze({ url: 'https://pixieed.jp/terms/', version: 'terms-20261022-1', sha256: '4ef3e799ee9828c3797b0fdb0dfc52528313f054eda54421f487d5bf13d436d3' }),
  privacy: Object.freeze({ url: 'https://pixieed.jp/privacy/', version: 'privacy-20261022-1', sha256: 'b5c257857c67ca70c54f072ebe7d9aff41d8cf86766c8314bd74682caf7fe7e9' }),
});

export class PostingConsentError extends Error {
  constructor(code) {
    super(code === 'posting_policy_unavailable'
      ? '公開投稿機能の準備・検証中です。公開送信はできません。自分用保存は利用できます。'
      : '現在の利用規約とプライバシーポリシーを確認し、同意してから投稿してください。');
    this.name = 'PostingConsentError'; this.code = code;
  }
}

export function isPostingPolicyReady(policy = postingPolicy) {
  if (policy?.state !== 'published' || policy.contactConfirmed !== true) return false;
  const documents = [policy.terms, policy.privacy];
  return documents.every(doc => {
    try {
      const url = new URL(doc.url);
      return typeof doc.url === 'string' && typeof doc.version === 'string' && typeof doc.sha256 === 'string' && url.origin === 'https://pixieed.jp' && url.pathname !== '/' && !url.search && !url.hash && !url.username && !url.password
        && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(doc.version) && /^[a-f0-9]{64}$/.test(doc.sha256);
    } catch { return false; }
  }) && policy.terms.url !== policy.privacy.url;
}

export function requirePostingConsent(consent, policy = postingPolicy) {
  if (!isPostingPolicyReady(policy)) throw new PostingConsentError('posting_policy_unavailable');
  if (!consent || consent.accepted !== true) throw new PostingConsentError('posting_consent_required');
  if (consent.termsVersion !== policy.terms.version || consent.privacyVersion !== policy.privacy.version)
    throw new PostingConsentError('posting_consent_version_mismatch');
  // Whitelist only the explicit decision and versions; never carry identity/time/IP.
  return { accepted: true, termsVersion: policy.terms.version, privacyVersion: policy.privacy.version };
}
