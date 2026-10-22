const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const BUCKET = "sns-audio";

function result(status, headers = {}, body = null) {
  return { status, headers: new Headers(headers), body };
}

function parseRange(header, total) {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return false;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
    end = Math.min(end, total - 1);
  }
  if (start >= total || start > end) return false;
  return { start, end, length: end - start + 1 };
}

function limitedBody(body, expected, signal) {
  if (!body) return null;
  const reader = body.getReader();
  let seen = 0;
  let ended = false;
  const stream = new ReadableStream({
    async pull(controller) {
      if (signal?.aborted) {
        await reader.cancel(signal.reason).catch(() => {});
        controller.error(signal.reason || new Error("aborted"));
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          ended = true;
          if (seen !== expected) controller.error(new Error("audio_length_mismatch"));
          else controller.close();
          return;
        }
        seen += value.byteLength;
        if (seen > expected || seen > MAX_AUDIO_BYTES) {
          await reader.cancel().catch(() => {});
          controller.error(new Error("audio_stream_overflow"));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (!ended) await reader.cancel(reason).catch(() => {});
    },
  });
  return stream;
}

/** Fetch a private audio object after the caller has completed DB/owner authorization.
 * @param {{projectUrl:string,serviceKey:string,path:string,expectedBytes:number,rangeHeader?:string|null,fetchImpl?:typeof fetch,signal?:AbortSignal,allowLocalSupabaseHttp?:boolean}} options
 */
export async function fetchSocialAudioRange({
  projectUrl,
  serviceKey,
  path,
  expectedBytes,
  rangeHeader = null,
  fetchImpl = fetch,
  signal,
  allowLocalSupabaseHttp = false,
}) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_AUDIO_BYTES) {
    return result(503);
  }
  if (typeof serviceKey !== "string" || !serviceKey || typeof path !== "string" ||
      !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.wav$/i.test(path)) return result(503);

  let origin;
  try {
    const parsed = new URL(projectUrl);
    // Opt-in development transport for the CLI's isolated Docker bridge only.
    // A flag never permits arbitrary HTTP origins or disables owner checks.
    const localHttp = allowLocalSupabaseHttp === true && parsed.origin === 'http://kong:8000';
    if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return result(503);
    }
    origin = parsed.origin;
  } catch {
    return result(503);
  }

  const range = parseRange(rangeHeader, expectedBytes);
  if (range === false) {
    return result(416, { "Accept-Ranges": "bytes", "Content-Range": `bytes */${expectedBytes}` });
  }
  const expectedLength = range ? range.length : expectedBytes;
  const url = `${origin}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const headers = new Headers({ apikey: serviceKey, authorization: `Bearer ${serviceKey}` });
  if (/^sb_secret_/.test(serviceKey)) headers.delete("authorization");
  if (range) headers.set("range", `bytes=${range.start}-${range.end}`);

  try {
    const upstream = await fetchImpl(url, { method: "GET", headers, redirect: "manual", cache: "no-store", signal });
    if (upstream.url && new URL(upstream.url).origin !== origin) {
      await upstream.body?.cancel();
      return result(503);
    }
    const wantedStatus = range ? 206 : 200;
    const contentRange = upstream.headers.get("content-range");
    const contentLength = Number(upstream.headers.get("content-length"));
    const rangeValid = !range || contentRange === `bytes ${range.start}-${range.end}/${expectedBytes}`;
    if (upstream.status !== wantedStatus || !rangeValid || contentLength !== expectedLength || !upstream.body) {
      await upstream.body?.cancel();
      return result(503);
    }
    const responseHeaders = {
      "Accept-Ranges": "bytes",
      "Content-Length": String(expectedLength),
      "Content-Type": "audio/wav",
    };
    if (range) responseHeaders["Content-Range"] = contentRange;
    return result(wantedStatus, responseHeaders, limitedBody(upstream.body, expectedLength, signal));
  } catch {
    return result(503);
  }
}
