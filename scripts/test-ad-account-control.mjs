import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./ad-account-control.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.children = [];
    this.id = '';
    this.textContent = '';
  }

  addEventListener() {}
  appendChild(node) { this.children.push(node); return node; }
  matches() { return false; }
  querySelectorAll() { return []; }
  remove() { this.removed = true; }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html');
    this.head = new FakeElement('head');
  }

  createElement(tagName) { return new FakeElement(tagName); }
  dispatchEvent() {}
  getElementById(id) {
    return this.head.children.find((node) => node.id === id) || null;
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}

function storedSession(userId = 'user-1') {
  const payload = Buffer.from(JSON.stringify({ sub: userId })).toString('base64url');
  return JSON.stringify({ user: { id: userId }, access_token: `x.${payload}.x` });
}

function runController({ remoteDisabled = false, loggedOut = false, cachedDisabled = null } = {}) {
  const document = new FakeDocument();
  const values = new Map();
  const fetchCalls = [];
  if (!loggedOut) values.set('sb-kyyiuakrqomzlikfaire-auth-token', storedSession());
  if (cachedDisabled !== null) {
    values.set('pixieed:site-ad-free:v1', JSON.stringify({
      userId: 'user-1',
      disabled: cachedDisabled,
      checkedAt: Date.now()
    }));
  }
  const window = { addEventListener() {} };
  const context = vm.createContext({
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    CustomEvent: class CustomEvent {},
    Document: FakeDocument,
    document,
    Element: FakeElement,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return { ok: true, json: async () => remoteDisabled };
    },
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    MutationObserver: FakeMutationObserver,
    Promise,
    window,
  });
  vm.runInContext(source, context);
  return { document, fetchCalls, values, window };
}

const grantedAccount = runController({ remoteDisabled: true });
assert.equal(grantedAccount.document.documentElement.dataset.pixieedAdAccountState, 'pending');
await grantedAccount.window.PiXiEEDAdAccountControl.resolve();
assert.equal(grantedAccount.window.__PIXIEED_AD_FREE_ACCOUNT__, true);
assert.equal(grantedAccount.window.__PIXIEED_ADS_DISABLED__, true);
assert.equal(grantedAccount.window.__PIXIEED_DISABLE_AUTO_ADS__, true);
assert.equal(grantedAccount.document.documentElement.dataset.pixieedAdFreeAccount, 'true');
assert.match(grantedAccount.fetchCalls[0].url, /\/rest\/v1\/rpc\/site_current_user_ad_free$/);
assert.match(grantedAccount.fetchCalls[0].options.headers.Authorization, /^Bearer /);

const ordinaryAccount = runController({ remoteDisabled: false });
await ordinaryAccount.window.PiXiEEDAdAccountControl.resolve();
assert.equal(ordinaryAccount.window.__PIXIEED_AD_FREE_ACCOUNT__, false);
assert.notEqual(ordinaryAccount.window.__PIXIEED_ADS_DISABLED__, true);
assert.equal(ordinaryAccount.document.documentElement.dataset.pixieedAdFreeAccount, 'false');

const cachedGrantedAccount = runController({ cachedDisabled: true });
assert.equal(cachedGrantedAccount.window.__PIXIEED_AD_FREE_ACCOUNT__, true);
assert.equal(cachedGrantedAccount.fetchCalls.length, 0);

const loggedOut = runController({ loggedOut: true });
assert.equal(loggedOut.window.__PIXIEED_AD_FREE_ACCOUNT__, false);
assert.equal(loggedOut.fetchCalls.length, 0);

assert.doesNotMatch(source, /rgaydm03|3917bf57/i, 'an administrator identity must not control ad suppression');
assert.match(source, /site_current_user_ad_free/);
assert.match(source, /loadAdsense/);
assert.match(source, /__PIXIEED_DISABLE_AUTO_ADS__/);

console.log('Ad account control guard passed.');
