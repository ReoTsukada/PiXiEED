/**
 * supabase-js 2.106.2 falls back to Authorization: Bearer <api key> when no
 * user session exists. New sb_ API keys are not JWTs; the gateway accepts
 * them on apikey but rejects them in Authorization. Keep real user JWTs.
 */
export function keyAwareFetch(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  if (!/^sb_(?:publishable|secret)_/.test(apiKey)) return fetchImpl;
  return (input, init) => {
    const headers = new Headers((init as { headers?: HeadersInit } | undefined)?.headers);
    if (headers.get("authorization") === `Bearer ${apiKey}`) {
      headers.delete("authorization");
    }
    return fetchImpl(input, { ...init, headers });
  };
}
