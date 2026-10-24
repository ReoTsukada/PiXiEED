import { postingPolicy } from '../../data/posting-policy.mjs?rev=20261022-posting-live-1';

// Test-only affirmative choice bound to the versions shipped by this snapshot.
export const currentPostingConsent = Object.freeze({
  accepted: true,
  termsVersion: postingPolicy.terms.version,
  privacyVersion: postingPolicy.privacy.version,
});

export const withCurrentPostingConsent = post => ({
  ...post,
  postingConsent: currentPostingConsent,
});
