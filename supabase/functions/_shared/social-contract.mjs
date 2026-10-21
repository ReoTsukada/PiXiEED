export const SOCIAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSocialUuid(value) {
  return typeof value === "string" && SOCIAL_UUID.test(value);
}

export function cleanSocialText(
  value,
  max,
  { required = false, multiline = false } = {},
) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n");
  const text = normalized.trim();
  const length = Array.from(text).length;
  const hasControls = multiline
    ? /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(text)
    : /\p{Cc}/u.test(text);
  if ((required && length < 1) || length > max || hasControls) return null;
  return text;
}

export function parseSocialTarget(value, { report = false } = {}) {
  if (typeof value !== "string") return null;
  const match = /^(sns|map|showcase|comment):([0-9a-f-]{36})$/i.exec(value);
  if (!match || !isSocialUuid(match[2])) return null;
  if (match[1] === "comment" && !report) return null;
  return { type: match[1].toLowerCase(), id: match[2] };
}

export function cursorDate(value) {
  if (value === undefined) return "";
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    )
  ) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? value : null;
}

export function publicSocialPost(row, ownerId = "") {
  const post = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    visibility: row.visibility,
    version: row.version,
  };
  if (row.kind === "music") {
    post.audio = {
      mime: "audio/wav",
      bytes: Number(row.audio_bytes),
      duration: Number(row.audio_duration),
      sha256: row.audio_sha256,
    };
  }
  if (ownerId && row.owner_id === ownerId) post.owned = true;
  return post;
}

export function publicSocialComment(row, ownerId = "") {
  const comment = {
    id: row.id,
    target: row.target,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
  if (ownerId && row.owner_id === ownerId) comment.owned = true;
  return comment;
}
