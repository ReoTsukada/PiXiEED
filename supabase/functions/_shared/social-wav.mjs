const MAX_WAV_BYTES = 16 * 1024 * 1024;
const MAX_SECONDS = 600;

export class SocialWavError extends Error {
  constructor(code) {
    super(code);
    this.name = "SocialWavError";
    this.code = code;
  }
}

/** Validate the original RIFF container and return facts derived from its bytes. */
export async function inspectSocialWav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_WAV_BYTES) {
    throw new SocialWavError("audio_size_invalid");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const four = (at) =>
    String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (
    four(0) !== "RIFF" || four(8) !== "WAVE" ||
    view.getUint32(4, true) + 8 !== bytes.byteLength
  ) throw new SocialWavError("audio_wav_invalid");
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) {
      throw new SocialWavError("audio_wav_invalid");
    }
    const tag = four(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    const padded = end + (size & 1);
    if (end > bytes.byteLength || padded > bytes.byteLength) {
      throw new SocialWavError("audio_wav_invalid");
    }
    if (tag === "fmt ") {
      if (fmt || size < 16) throw new SocialWavError("audio_wav_ambiguous");
      fmt = {
        format: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        rate: view.getUint32(start + 4, true),
        byteRate: view.getUint32(start + 8, true),
        align: view.getUint16(start + 12, true),
        bits: view.getUint16(start + 14, true),
        size,
      };
    } else if (tag === "data") {
      if (data || size < 1) throw new SocialWavError("audio_wav_ambiguous");
      data = { start, size };
    }
    offset = padded;
  }
  if (offset !== bytes.byteLength || !fmt || !data) {
    throw new SocialWavError("audio_wav_invalid");
  }
  const { format, channels, rate, byteRate, align, bits } = fmt;
  if (
    fmt.size !== 16 || (format !== 1 && format !== 3) ||
    (format === 3 && bits !== 32) ||
    (format === 1 && ![8, 16, 24, 32].includes(bits))
  ) throw new SocialWavError("audio_format_unsupported");
  if (
    ![1, 2].includes(channels) || rate < 8000 || rate > 192000 ||
    align !== channels * bits / 8 || byteRate !== rate * align ||
    data.size % align !== 0
  ) throw new SocialWavError("audio_wav_invalid");
  const duration = data.size / byteRate;
  if (!(duration > 0 && duration <= MAX_SECONDS)) {
    throw new SocialWavError("audio_duration_invalid");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return { bytes: bytes.byteLength, duration, sha256 };
}

export async function readSocialRequestBody(request) {
  const type = request.headers.get("content-type") || "";
  const multipart = /^multipart\/form-data\s*;/i.test(type);
  const max = multipart ? 16 * 1024 * 1024 + 64 * 1024 : 32 * 1024;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    throw new SocialWavError("request_too_large");
  }
  if (!request.body) throw new SocialWavError("request_body_invalid");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new SocialWavError("request_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SocialWavError) throw error;
    throw new SocialWavError("request_body_invalid");
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  if (!multipart) {
    let value;
    try {
      value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new SocialWavError("request_json_invalid");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new SocialWavError("request_json_invalid");
    }
    return { payload: value, audio: null };
  }
  if (
    !/^multipart\/form-data\s*;\s*boundary=(?:"[^"]{1,70}"|[^;\s]{1,70})/i.test(
      type,
    )
  ) throw new SocialWavError("request_multipart_invalid");
  try {
    const form = await new Response(bytes, {
      headers: { "content-type": type },
    }).formData();
    const entries = Array.from(form.entries());
    if (
      entries.length !== 2 || entries.filter(([key]) =>
          key === "payload"
        ).length !== 1 ||
      entries.filter(([key]) => key === "audio").length !== 1
    ) throw new Error();
    const payloadEntry = form.get("payload");
    const audioEntry = form.get("audio");
    if (
      typeof payloadEntry !== "string" || !(audioEntry instanceof File) ||
      !["audio/wav", "audio/x-wav", "audio/wave"].includes(
        audioEntry.type.toLowerCase(),
      )
    ) throw new Error();
    const payload = JSON.parse(payloadEntry);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error();
    }
    return { payload, audio: new Uint8Array(await audioEntry.arrayBuffer()) };
  } catch {
    throw new SocialWavError("request_multipart_invalid");
  }
}
