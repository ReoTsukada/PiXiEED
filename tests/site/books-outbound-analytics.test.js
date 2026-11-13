import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map([['PiXiEED:analytics-consent:v1', 'granted']]);
const documentEvents = new Map();
const windowEvents = new Map();
globalThis.localStorage = { getItem(key) { return storage.get(key) ?? null; } };
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.location = { hostname: 'pixieed.jp', protocol: 'https:', origin: 'https://pixieed.jp', pathname: '/books/', search: '' };
globalThis.history = {};
globalThis.window = {
  location: globalThis.location,
  addEventListener(name, listener) { windowEvents.set(name, listener); },
  dataLayer: []
};
window.top = window.self = window;
globalThis.document = {
  body: { dataset: {} },
  head: { append() {} },
  addEventListener(name, listener) { documentEvents.set(name, listener); },
  createElement() { return {}; }
};

const analytics = await import('../../js/site-analytics.mjs?books-outbound-test');
const clickListener = documentEvents.get('click');
const eventRows = () => window.dataLayer.filter(entry => entry?.[0] === 'event');
const affiliateRows = () => eventRows().filter(entry => entry[1] === 'affiliate_outbound');

function click({
  kind = 'amazon', href = 'https://www.amazon.co.jp/dp/B0ABC12345?tag=pixieed-22', trusted = true,
  prevented = false, button = 0, hiddenLink = false, hiddenCard = false, noCard = false
} = {}) {
  const card = { hidden: hiddenCard };
  const link = {
    hidden: hiddenLink,
    matches(selector) {
      return selector === '[data-commerce-link]' ? kind === 'amazon'
        : selector === '[data-yahoo-commerce-link]' ? kind === 'yahoo' : false;
    },
    getAttribute(name) { return name === 'href' ? href : null; },
    closest(selector) { return selector === '[data-books-product-id]' && !noCard ? card : null; }
  };
  return {
    target: { closest(selector) { return selector === '[data-commerce-link], [data-yahoo-commerce-link]' ? link : null; } },
    isTrusted: trusted, defaultPrevented: prevented, button
  };
}
async function dispatch(options) {
  const event = click(options);
  clickListener(event);
  await new Promise(resolve => setTimeout(resolve, 0));
  return event;
}
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

test('valid Amazon and Yahoo purchase clicks send only a fixed anonymous merchant value', async () => {
  await dispatch();
  await dispatch({ kind: 'yahoo', href: 'https://yahoo.jp/VcagnL' });
  assert.deepEqual(affiliateRows().slice(-2).map(entry => ({ name: entry[1], params: { ...entry[2] } })), [
    { name: 'affiliate_outbound', params: { tool: 'books', merchant: 'amazon' } },
    { name: 'affiliate_outbound', params: { tool: 'books', merchant: 'yahoo' } }
  ]);
});

test('cloned modal purchase links count for both merchants without a product-card ancestor', async () => {
  const before = affiliateRows().length;
  await dispatch({ noCard: true });
  await dispatch({ kind: 'yahoo', href: 'https://yahoo.jp/QGVY75', noCard: true });
  assert.deepEqual(affiliateRows().slice(before).map(entry => entry[2].merchant), ['amazon', 'yahoo']);
});

test('unlisted merchant and sensitive values are discarded at the analytics boundary', () => {
  const before = affiliateRows().length;
  analytics.trackSiteEvent('affiliate_outbound', {
    tool: 'private-tool', merchant: 'unlisted-shop', product: 'private title', search: 'private query',
    id: 'private-id', url: 'https://example.com/?email=person@example.com'
  });
  assert.deepEqual({ ...affiliateRows().at(-1)[2] }, { tool: 'books' });
  assert.equal(affiliateRows().length, before + 1);
});

test('hidden, malformed, cancelled, non-primary, and synthetic clicks are not sent', async () => {
  const before = affiliateRows().length;
  await dispatch({ hiddenLink: true });
  await dispatch({ hiddenCard: true });
  await dispatch({ href: '' });
  await dispatch({ href: '#' });
  await dispatch({ href: 'javascript:alert(1)' });
  await dispatch({ href: 'https://attacker.example/dp/B0ABC12345' });
  await dispatch({ kind: 'amazon', href: 'https://yahoo.jp/VcagnL' });
  await dispatch({ kind: 'yahoo', href: 'https://www.amazon.co.jp/dp/B0ABC12345' });
  await dispatch({ trusted: false });
  await dispatch({ button: 1 });
  await dispatch({ prevented: true });
  const beforeCancelledDispatch = affiliateRows().length;
  const cancelled = click();
  clickListener(cancelled);
  await Promise.resolve();
  assert.equal(affiliateRows().length, beforeCancelledDispatch, 'the outbound event waits for a later task');
  cancelled.defaultPrevented = true;
  await nextTask();
  assert.equal(affiliateRows().length, beforeCancelledDispatch, 'a later target/bubble cancellation suppresses it');
  assert.equal(affiliateRows().length, before);
});

test('the books purchase signal is blocked on localhost, in frames, and after consent denial', async () => {
  const before = affiliateRows().length;
  location.hostname = 'localhost';
  await dispatch();
  location.hostname = 'pixieed.jp';

  window.self = {};
  await dispatch();
  window.self = window.top;

  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  await dispatch();
  assert.equal(affiliateRows().length, before);
});
