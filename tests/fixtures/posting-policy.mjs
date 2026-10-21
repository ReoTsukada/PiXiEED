// Synthetic contract only; these document hashes/versions are not issued policies.
export const testPostingPolicy = {state:'published',contactConfirmed:true,terms:{url:'https://pixieed.jp/terms/',version:'synthetic-terms-1',sha256:'a'.repeat(64)},privacy:{url:'https://pixieed.jp/privacy/',version:'synthetic-privacy-1',sha256:'b'.repeat(64)}};
export const testPostingConsent = {accepted:true,termsVersion:testPostingPolicy.terms.version,privacyVersion:testPostingPolicy.privacy.version};

export function consentedStore(store) { const add = store.add.bind(store); store.add = post => add({...post,postingConsent:testPostingConsent}); return store; }
