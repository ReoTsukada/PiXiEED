export const OFFERWALL_ENTRY_POLICY_VERSION = '20261024-common-tool-start-1';
export const OFFERWALL_TOOL_PATHS = Object.freeze([
  '/tools/start/draw/', '/tools/start/camera/', '/tools/start/audio/',
  '/tools/start/spot-difference/', '/tools/start/hidden-object/',
  '/tools/start/jigsaw/', '/tools/start/convert/',
]);
export const OFFERWALL_ENTRY_POLICY_SCRIPT = `<script src="/js/adsense-offerwall-policy.js?rev=${OFFERWALL_ENTRY_POLICY_VERSION}"></script>`;
export const OFFERWALL_ENTRY_LOADER_SCRIPT = `<script type="module" src="/js/tool-offerwall-entry.mjs?rev=${OFFERWALL_ENTRY_POLICY_VERSION}"></script>`;

/** Put the synchronous Offerwall policy first in the head, without removing other CMP scripts. */
export function addOfferwallEntryPolicy(html) {
  if (typeof html !== 'string') throw new TypeError('Page HTML must be a string');
  if (!/<head\b[^>]*>[\s\S]*?<\/head\s*>/i.test(html)) return { html, added: false, skipped: true };

  const withoutPolicy = html.replace(/<script\b(?=[^>]*\bsrc\s*=\s*(["'])\/js\/adsense-offerwall-policy\.js(?:\?[^"']*)?\1)[^>]*>\s*<\/script\s*>\s*/gi, '');
  const output = withoutPolicy.replace(/(<head\b[^>]*>)\s*/i, `$1\n${OFFERWALL_ENTRY_POLICY_SCRIPT}\n`);
  return { html: output, added: output !== html, skipped: false };
}
