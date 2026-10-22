import { postingPolicy, requirePostingConsent } from '../../../data/posting-policy.mjs';

export { postingPolicy, requirePostingConsent };

/** The caller must already have verified getUser; no client identity/time survives. */
export async function persistPostingConsent(admin: any, record: Record<string, unknown>) {
  const keys = ['owner_id', 'purpose', 'request_key', 'terms_version', 'privacy_version'];
  const written = await admin.from('posting_consents').upsert(record, { onConflict: keys.join(','), ignoreDuplicates: true });
  if (written.error) throw new Error('posting_consent_save_failed');
  let query = admin.from('posting_consents').select('owner_id,purpose,request_key,request_digest,terms_version,privacy_version,terms_sha256,privacy_sha256,accepted_at');
  for (const key of keys) query = query.eq(key, record[key]);
  const saved = await query.maybeSingle();
  if (saved.error || !saved.data) throw new Error('posting_consent_save_failed');
  for (const key of [...keys, 'request_digest', 'terms_sha256', 'privacy_sha256']) {
    if (saved.data[key] !== record[key]) throw new Error('posting_consent_request_conflict');
  }
  return saved.data;
}

export function postingConsentRecord(ownerId: string, purpose: string, requestKey: string, digest: string, policy: any = postingPolicy) {
  return { owner_id: ownerId, purpose, request_key: requestKey, request_digest: digest,
    terms_version: policy.terms.version, privacy_version: policy.privacy.version,
    terms_sha256: policy.terms.sha256, privacy_sha256: policy.privacy.sha256,
    accepted_at: new Date().toISOString() };
}
