// Set this only to the verified public HTTPS endpoint for PiXiEED's MCP service.
// An empty value means the service has not been configured for public use.
export const LEGACY_MCP_ENDPOINT = 'https://pixieed-mcp.rgaydm03.workers.dev/mcp';
export const MCP_ENDPOINT = LEGACY_MCP_ENDPOINT;
export const STORE_MCP_ENDPOINT = `${new URL(LEGACY_MCP_ENDPOINT).origin}/mcp/store`;

// Store listing is intentionally unavailable until the public listing has been verified.
export const PLUGIN_PUBLICATION = Object.freeze({ status: 'not_published', publicPluginUrl: null });
export const PLUGIN_REVIEW = Object.freeze({ version: '1.1.0', status: 'in_review', estimatedCompletion: '2026-12-01' });

export function isPluginReviewEstimateCurrent(now = new Date()) {
  const timestamp = Number(now);
  const endOfEstimate = Date.parse(`${PLUGIN_REVIEW.estimatedCompletion}T23:59:59.999+09:00`);
  return Number.isFinite(timestamp) && timestamp <= endOfEstimate;
}

export function verifiedPublicPluginUrl(config = PLUGIN_PUBLICATION) {
  if (config?.status !== 'published' || typeof config.publicPluginUrl !== 'string') return null;
  try {
    const url = new URL(config.publicPluginUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !['chatgpt.com', 'www.chatgpt.com'].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export function verifiedMcpEndpoint(value = MCP_ENDPOINT) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
