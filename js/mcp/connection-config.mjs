// Set this only to the verified public HTTPS endpoint for PiXiEED's MCP service.
// An empty value means the service has not been configured for public use.
export const MCP_ENDPOINT = 'https://pixieed-mcp.rgaydm03.workers.dev/mcp';

export function verifiedMcpEndpoint(value = MCP_ENDPOINT) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
