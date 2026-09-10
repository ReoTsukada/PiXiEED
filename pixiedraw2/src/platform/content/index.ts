/**
 * Canonical, DOM/DB-independent content model for future written works and
 * world expansion. This module intentionally owns no storage or transport.
 *
 * Hashes use the canonical JSON representation without revision.contentHash.
 * The result is a deterministic FNV-1a 64-bit digest, encoded as
 * `fnv1a64:<16 lowercase hex digits>`.
 */

export const CREATOR_CONTENT_SCHEMA_VERSION = 1 as const;

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ContentId = Brand<string, "ContentId">;
export type ProjectId = Brand<string, "ProjectId">;
export type AssetPackageId = Brand<string, "AssetPackageId">;
export type RevisionId = Brand<string, "RevisionId">;
export type CreatorId = Brand<string, "CreatorId">;
export type ContentHash = Brand<string, "ContentHash">;
export type HttpsUrl = Brand<string, "HttpsUrl">;

export type ContentKind =
  | "TEXT_WORK"
  | "NOVEL"
  | "WORLD_NODE"
  | "WORLD_EDGE"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "GAME"
  | "ASSET_PACKAGE";

export type TextFormat = "PLAIN_TEXT" | "MARKDOWN";
export type RightsPermission =
  | "PERSONAL_USE"
  | "COMMERCIAL_USE"
  | "DERIVATIVE_WORKS"
  | "REDISTRIBUTION"
  | "RESALE";

export interface ContentRevision {
  readonly revisionId: RevisionId;
  readonly revisionNumber: number;
  readonly contentHash: ContentHash;
}

export interface ContentProvenance {
  readonly createdBy: CreatorId;
  readonly sourceContentId?: ContentId;
  readonly sourceRevisionId?: RevisionId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContentRights {
  readonly licenseId: string;
  readonly ownerId: CreatorId;
  readonly permissions: readonly RightsPermission[];
  readonly attributionRequired: boolean;
  readonly allowCommercialUse: boolean;
  readonly allowDerivativeWorks: boolean;
}

export interface ProjectContentReference {
  readonly projectId: ProjectId;
  readonly role: "PRIMARY" | "SUPPLEMENT" | "WORLD_CONTEXT";
}

export type ContentReference =
  | {
      readonly kind: "PROJECT";
      readonly projectId: ProjectId;
      readonly relation: "BELONGS_TO" | "USED_BY";
    }
  | {
      readonly kind: "ASSET_PACKAGE";
      readonly assetPackageId: AssetPackageId;
      readonly revisionId: RevisionId;
      readonly contentHash: ContentHash;
      readonly relation: "USES" | "DERIVED_FROM" | "EMBEDS";
    }
  | {
      readonly kind: "CONTENT";
      readonly contentId: ContentId;
      readonly revisionId: RevisionId;
      readonly contentHash: ContentHash;
      readonly relation: "DERIVED_FROM" | "EXPANDS" | "REFERENCES";
    }
  | {
      readonly kind: "MEDIA";
      readonly mediaKind: "IMAGE" | "VIDEO" | "AUDIO" | "GAME";
      readonly assetPackageId?: AssetPackageId;
      readonly contentId?: ContentId;
      readonly revisionId: RevisionId;
      readonly contentHash: ContentHash;
      readonly relation: "ILLUSTRATES" | "SOUNDSCAPES" | "EMBEDDED_GAMEPLAY";
    };

export interface TextWorkFields {
  readonly format: TextFormat;
  readonly body: string;
  readonly language: string;
}

export interface TextWork {
  readonly schemaVersion: typeof CREATOR_CONTENT_SCHEMA_VERSION;
  readonly id: ContentId;
  readonly title: string;
  readonly contentKind: "TEXT_WORK";
  readonly project: ProjectContentReference;
  readonly revision: ContentRevision;
  readonly provenance: ContentProvenance;
  readonly rights: ContentRights;
  readonly references: readonly ContentReference[];
  readonly previewUrl?: HttpsUrl;
  readonly text: TextWorkFields;
}

export interface NovelChapter {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly text: TextWorkFields;
  readonly references: readonly ContentReference[];
}

export interface Novel {
  readonly schemaVersion: typeof CREATOR_CONTENT_SCHEMA_VERSION;
  readonly id: ContentId;
  readonly title: string;
  readonly contentKind: "NOVEL";
  readonly project: ProjectContentReference;
  readonly revision: ContentRevision;
  readonly provenance: ContentProvenance;
  readonly rights: ContentRights;
  readonly references: readonly ContentReference[];
  readonly previewUrl?: HttpsUrl;
  readonly synopsis: string;
  readonly chapters: readonly NovelChapter[];
}

export interface WorldNode {
  readonly schemaVersion: typeof CREATOR_CONTENT_SCHEMA_VERSION;
  readonly id: ContentId;
  readonly title: string;
  readonly contentKind: "WORLD_NODE";
  readonly project: ProjectContentReference;
  readonly revision: ContentRevision;
  readonly provenance: ContentProvenance;
  readonly rights: ContentRights;
  readonly references: readonly ContentReference[];
  readonly previewUrl?: HttpsUrl;
  readonly nodeType: "CHARACTER" | "LOCATION" | "FACTION" | "ITEM" | "EVENT" | "CONCEPT";
  readonly summary: string;
  readonly description: TextWorkFields;
}

export interface WorldEdge {
  readonly schemaVersion: typeof CREATOR_CONTENT_SCHEMA_VERSION;
  readonly id: ContentId;
  readonly title: string;
  readonly contentKind: "WORLD_EDGE";
  readonly project: ProjectContentReference;
  readonly revision: ContentRevision;
  readonly provenance: ContentProvenance;
  readonly rights: ContentRights;
  readonly references: readonly ContentReference[];
  readonly previewUrl?: HttpsUrl;
  readonly fromNodeId: ContentId;
  readonly toNodeId: ContentId;
  readonly relation: "LOCATED_IN" | "KNOWS" | "OWNS" | "CAUSES" | "PART_OF" | "CONTRADICTS" | "CUSTOM";
  readonly customRelation?: string;
  readonly description?: string;
}

export type CreatorContentDocument = TextWork | Novel | WorldNode | WorldEdge;

export interface ContentDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ContentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly ContentDiagnostic[] };

const CONTENT_KINDS = new Set<ContentKind>([
  "TEXT_WORK", "NOVEL", "WORLD_NODE", "WORLD_EDGE", "IMAGE", "VIDEO", "AUDIO", "GAME", "ASSET_PACKAGE",
]);
const RIGHTS = new Set<RightsPermission>([
  "PERSONAL_USE", "COMMERCIAL_USE", "DERIVATIVE_WORKS", "REDISTRIBUTION", "RESALE",
]);
const MAX_TEXT = 2_000_000;
const MAX_REFERENCES = 256;
const MAX_CHAPTERS = 10_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/u;

const diagnostic = (code: string, path: string, message: string): ContentDiagnostic => ({ code, path, message });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const rejectUnknownKeys = (value: Record<string, unknown>, allowed: readonly string[], path: string, out: ContentDiagnostic[]): void => {
  const known = new Set(allowed);
  for (const key of Object.keys(value)) if (!known.has(key)) out.push(diagnostic("UNSUPPORTED_FIELD", `${path}.${key}`, "Unknown fields are rejected and cannot be persisted."));
};
const stringAt = (value: unknown, path: string, out: ContentDiagnostic[], pattern?: RegExp): string | undefined => {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000_000 || (pattern && !pattern.test(value))) {
    out.push(diagnostic("INVALID_STRING", path, "A bounded valid string is required."));
    return undefined;
  }
  return value;
};
const idAt = <T extends string>(value: unknown, path: string, out: ContentDiagnostic[]): Brand<string, T> | undefined =>
  stringAt(value, path, out, ID_PATTERN) as Brand<string, T> | undefined;
const isHttpsUrl = (value: unknown): value is HttpsUrl => {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === "";
  } catch {
    return false;
  }
};

function parseRevision(value: unknown, path: string, out: ContentDiagnostic[]): ContentRevision | undefined {
  if (!isRecord(value)) { out.push(diagnostic("INVALID_REVISION", path, "Revision is required.")); return undefined; }
  rejectUnknownKeys(value, ["revisionId", "revisionNumber", "contentHash"], path, out);
  const revisionId = idAt<"RevisionId">(value.revisionId, `${path}.revisionId`, out);
  const revisionNumber = value.revisionNumber;
  const contentHash = value.contentHash;
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1) out.push(diagnostic("INVALID_REVISION_NUMBER", `${path}.revisionNumber`, "Revision number must be a positive safe integer."));
  if (typeof contentHash !== "undefined" && (typeof contentHash !== "string" || !HASH_PATTERN.test(contentHash))) out.push(diagnostic("INVALID_CONTENT_HASH", `${path}.contentHash`, "Content hash has an invalid format."));
  if (!revisionId || !Number.isSafeInteger(revisionNumber) || revisionNumber < 1) return undefined;
  return { revisionId, revisionNumber, contentHash: (typeof contentHash === "string" ? contentHash : "") as ContentHash };
}

function parseProvenance(value: unknown, path: string, out: ContentDiagnostic[]): ContentProvenance | undefined {
  if (!isRecord(value)) { out.push(diagnostic("INVALID_PROVENANCE", path, "Provenance is required.")); return undefined; }
  rejectUnknownKeys(value, ["createdBy", "sourceContentId", "sourceRevisionId", "createdAt", "updatedAt"], path, out);
  const createdBy = idAt<"CreatorId">(value.createdBy, `${path}.createdBy`, out);
  const sourceContentId = value.sourceContentId === undefined ? undefined : idAt<"ContentId">(value.sourceContentId, `${path}.sourceContentId`, out);
  const sourceRevisionId = value.sourceRevisionId === undefined ? undefined : idAt<"RevisionId">(value.sourceRevisionId, `${path}.sourceRevisionId`, out);
  const createdAt = stringAt(value.createdAt, `${path}.createdAt`, out, ISO_PATTERN);
  const updatedAt = stringAt(value.updatedAt, `${path}.updatedAt`, out, ISO_PATTERN);
  if (!createdBy || !createdAt || !updatedAt) return undefined;
  return { createdBy, ...(sourceContentId ? { sourceContentId } : {}), ...(sourceRevisionId ? { sourceRevisionId } : {}), createdAt, updatedAt };
}

function parseRights(value: unknown, path: string, out: ContentDiagnostic[]): ContentRights | undefined {
  if (!isRecord(value) || !Array.isArray(value.permissions) || value.permissions.length === 0 || value.permissions.length > RIGHTS.size) {
    out.push(diagnostic("INVALID_RIGHTS", path, "Rights with at least one permission are required.")); return undefined;
  }
  rejectUnknownKeys(value, ["licenseId", "ownerId", "permissions", "attributionRequired", "allowCommercialUse", "allowDerivativeWorks"], path, out);
  const ownerId = idAt<"CreatorId">(value.ownerId, `${path}.ownerId`, out);
  const licenseId = stringAt(value.licenseId, `${path}.licenseId`, out, ID_PATTERN);
  const permissions = value.permissions.filter((permission): permission is RightsPermission => typeof permission === "string" && RIGHTS.has(permission as RightsPermission));
  if (permissions.length !== value.permissions.length || new Set(permissions).size !== permissions.length) out.push(diagnostic("INVALID_PERMISSIONS", `${path}.permissions`, "Permissions must be known and unique."));
  if (typeof value.attributionRequired !== "boolean" || typeof value.allowCommercialUse !== "boolean" || typeof value.allowDerivativeWorks !== "boolean") out.push(diagnostic("INVALID_RIGHTS_FLAGS", path, "Rights flags must be booleans."));
  if (!ownerId || !licenseId || permissions.length !== value.permissions.length || typeof value.attributionRequired !== "boolean" || typeof value.allowCommercialUse !== "boolean" || typeof value.allowDerivativeWorks !== "boolean") return undefined;
  if (value.allowCommercialUse !== permissions.includes("COMMERCIAL_USE") || value.allowDerivativeWorks !== permissions.includes("DERIVATIVE_WORKS")) out.push(diagnostic("RIGHTS_FLAG_MISMATCH", path, "Rights flags must agree with permissions."));
  return { licenseId, ownerId, permissions: [...permissions].sort(), attributionRequired: value.attributionRequired, allowCommercialUse: value.allowCommercialUse, allowDerivativeWorks: value.allowDerivativeWorks };
}

function parseText(value: unknown, path: string, out: ContentDiagnostic[]): TextWorkFields | undefined {
  if (!isRecord(value) || (value.format !== "PLAIN_TEXT" && value.format !== "MARKDOWN")) { out.push(diagnostic("INVALID_TEXT", path, "Text format is required.")); return undefined; }
  rejectUnknownKeys(value, ["format", "body", "language"], path, out);
  const body = stringAt(value.body, `${path}.body`, out);
  const language = stringAt(value.language, `${path}.language`, out, LANGUAGE_PATTERN);
  if (!body || body.length > MAX_TEXT || !language) return undefined;
  return { format: value.format, body, language };
}

function parseProject(value: unknown, path: string, out: ContentDiagnostic[]): ProjectContentReference | undefined {
  if (!isRecord(value) || (value.role !== "PRIMARY" && value.role !== "SUPPLEMENT" && value.role !== "WORLD_CONTEXT")) { out.push(diagnostic("INVALID_PROJECT", path, "Project relationship is required.")); return undefined; }
  rejectUnknownKeys(value, ["projectId", "role"], path, out);
  const projectId = idAt<"ProjectId">(value.projectId, `${path}.projectId`, out);
  return projectId ? { projectId, role: value.role } : undefined;
}

function parseReference(value: unknown, path: string, out: ContentDiagnostic[]): ContentReference | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") { out.push(diagnostic("INVALID_REFERENCE", path, "Reference kind is required.")); return undefined; }
  if (value.kind === "PROJECT") {
    rejectUnknownKeys(value, ["kind", "projectId", "relation"], path, out);
    const projectId = idAt<"ProjectId">(value.projectId, `${path}.projectId`, out);
    if (!projectId || (value.relation !== "BELONGS_TO" && value.relation !== "USED_BY")) { out.push(diagnostic("INVALID_REFERENCE", path, "Invalid project reference.")); return undefined; }
    return { kind: "PROJECT", projectId, relation: value.relation };
  }
  if (value.kind === "ASSET_PACKAGE" || value.kind === "CONTENT" || value.kind === "MEDIA") {
    rejectUnknownKeys(value, value.kind === "ASSET_PACKAGE"
      ? ["kind", "assetPackageId", "revisionId", "contentHash", "relation"]
      : value.kind === "CONTENT"
      ? ["kind", "contentId", "revisionId", "contentHash", "relation"]
      : ["kind", "mediaKind", "assetPackageId", "contentId", "revisionId", "contentHash", "relation"], path, out);
    const revisionId = idAt<"RevisionId">(value.revisionId, `${path}.revisionId`, out);
    const contentHash = typeof value.contentHash === "string" && HASH_PATTERN.test(value.contentHash) ? value.contentHash as ContentHash : undefined;
    if (!contentHash) out.push(diagnostic("INVALID_REFERENCE_HASH", `${path}.contentHash`, "Reference must carry a valid content hash."));
    if (!revisionId) return undefined;
    if (value.kind === "ASSET_PACKAGE") {
      const assetPackageId = idAt<"AssetPackageId">(value.assetPackageId, `${path}.assetPackageId`, out);
      if (!assetPackageId || !["USES", "DERIVED_FROM", "EMBEDS"].includes(String(value.relation)) || !contentHash) return undefined;
      return { kind: value.kind, assetPackageId, revisionId, contentHash, relation: value.relation as "USES" | "DERIVED_FROM" | "EMBEDS" };
    }
    if (value.kind === "CONTENT") {
      const contentId = idAt<"ContentId">(value.contentId, `${path}.contentId`, out);
      if (!contentId || !["DERIVED_FROM", "EXPANDS", "REFERENCES"].includes(String(value.relation)) || !contentHash) return undefined;
      return { kind: value.kind, contentId, revisionId, contentHash, relation: value.relation as "DERIVED_FROM" | "EXPANDS" | "REFERENCES" };
    }
    const mediaKind = value.mediaKind;
    const assetPackageId = value.assetPackageId === undefined ? undefined : idAt<"AssetPackageId">(value.assetPackageId, `${path}.assetPackageId`, out);
    const contentId = value.contentId === undefined ? undefined : idAt<"ContentId">(value.contentId, `${path}.contentId`, out);
    if (!CONTENT_KINDS.has(mediaKind as ContentKind) || !["IMAGE", "VIDEO", "AUDIO", "GAME"].includes(String(mediaKind)) || (!assetPackageId && !contentId) || !contentHash) { out.push(diagnostic("INVALID_MEDIA_REFERENCE", path, "Media reference must target an image, video, audio, or game package/content.")); return undefined; }
    const relations = { IMAGE: "ILLUSTRATES", VIDEO: "ILLUSTRATES", AUDIO: "SOUNDSCAPES", GAME: "EMBEDDED_GAMEPLAY" } as const;
    if (value.relation !== relations[mediaKind as keyof typeof relations]) { out.push(diagnostic("INVALID_MEDIA_RELATION", `${path}.relation`, "Media relation does not match media kind.")); return undefined; }
    return { kind: "MEDIA", mediaKind: mediaKind as "IMAGE" | "VIDEO" | "AUDIO" | "GAME", ...(assetPackageId ? { assetPackageId } : {}), ...(contentId ? { contentId } : {}), revisionId, contentHash, relation: value.relation };
  }
  out.push(diagnostic("UNSUPPORTED_REFERENCE", `${path}.kind`, "Reference kind is not supported."));
  return undefined;
}

function parseBase(value: Record<string, unknown>, out: ContentDiagnostic[]) {
  rejectUnknownKeys(value, ["schemaVersion", "id", "title", "contentKind", "project", "revision", "provenance", "rights", "references", "previewUrl", "text", "synopsis", "chapters", "nodeType", "summary", "description", "fromNodeId", "toNodeId", "relation", "customRelation"], "$", out);
  if (value.schemaVersion !== CREATOR_CONTENT_SCHEMA_VERSION) out.push(diagnostic("UNSUPPORTED_SCHEMA", "schemaVersion", "Unsupported content schema version."));
  const id = idAt<"ContentId">(value.id, "id", out);
  const title = stringAt(value.title, "title", out);
  const project = parseProject(value.project, "project", out);
  const revision = parseRevision(value.revision, "revision", out);
  const provenance = parseProvenance(value.provenance, "provenance", out);
  const rights = parseRights(value.rights, "rights", out);
  const previewUrl = value.previewUrl === undefined ? undefined : isHttpsUrl(value.previewUrl) ? value.previewUrl : (out.push(diagnostic("INVALID_PREVIEW_URL", "previewUrl", "Preview URL must be a credential-free HTTPS URL.")), undefined);
  if (!Array.isArray(value.references) || value.references.length > MAX_REFERENCES) out.push(diagnostic("INVALID_REFERENCES", "references", "References must be a bounded array."));
  const references = Array.isArray(value.references) ? value.references.map((item, i) => parseReference(item, `references[${i}]`, out)).filter((item): item is ContentReference => item !== undefined) : [];
  if (Array.isArray(value.references) && references.length !== value.references.length) out.push(diagnostic("DROPPED_REFERENCE", "references", "Invalid references are rejected; they are never silently stored."));
  return { id, title, project, revision, provenance, rights, references, ...(previewUrl ? { previewUrl } : {}) };
}

function parseDocument(value: unknown): { document?: CreatorContentDocument; diagnostics: ContentDiagnostic[] } {
  const out: ContentDiagnostic[] = [];
  if (!isRecord(value) || typeof value.contentKind !== "string") return { diagnostics: [diagnostic("INVALID_DOCUMENT", "$", "A content document with a known contentKind is required.")] };
  const base = parseBase(value, out);
  if (!base.id || !base.title || !base.project || !base.revision || !base.provenance || !base.rights || base.references.length !== (Array.isArray(value.references) ? value.references.length : 0)) return { diagnostics: out };
  const common = { schemaVersion: CREATOR_CONTENT_SCHEMA_VERSION, ...base } as const;
  let document: CreatorContentDocument | undefined;
  if (value.contentKind === "TEXT_WORK") {
    rejectUnknownKeys(value, ["schemaVersion", "id", "title", "contentKind", "project", "revision", "provenance", "rights", "references", "previewUrl", "text"], "$", out);
    const text = parseText(value.text, "text", out);
    if (text) document = { ...common, contentKind: "TEXT_WORK", text };
  } else if (value.contentKind === "NOVEL") {
    rejectUnknownKeys(value, ["schemaVersion", "id", "title", "contentKind", "project", "revision", "provenance", "rights", "references", "previewUrl", "synopsis", "chapters"], "$", out);
    const synopsis = stringAt(value.synopsis, "synopsis", out);
    const chapters = Array.isArray(value.chapters) && value.chapters.length <= MAX_CHAPTERS ? value.chapters.map((chapter, i) => {
      if (!isRecord(chapter)) { out.push(diagnostic("INVALID_CHAPTER", `chapters[${i}]`, "Chapter must be an object.")); return undefined; }
      rejectUnknownKeys(chapter, ["id", "title", "order", "text", "references"], `chapters[${i}]`, out);
      const id = stringAt(chapter.id, `chapters[${i}].id`, out, ID_PATTERN);
      const title = stringAt(chapter.title, `chapters[${i}].title`, out);
      const order = chapter.order;
      const text = parseText(chapter.text, `chapters[${i}].text`, out);
      const refs = Array.isArray(chapter.references) ? chapter.references.map((item, j) => parseReference(item, `chapters[${i}].references[${j}]`, out)).filter((item): item is ContentReference => item !== undefined) : [];
      if (!Array.isArray(chapter.references) || refs.length !== chapter.references.length || !id || !title || !Number.isSafeInteger(order) || order < 0 || !text) { out.push(diagnostic("INVALID_CHAPTER", `chapters[${i}]`, "Chapter fields are invalid.")); return undefined; }
      return { id, title, order, text, references: refs };
    }).filter((item): item is NovelChapter => item !== undefined) : [];
    if (!Array.isArray(value.chapters) || chapters.length !== value.chapters.length) out.push(diagnostic("INVALID_CHAPTERS", "chapters", "Chapters must be valid and bounded."));
    if (synopsis && Array.isArray(value.chapters) && chapters.length === value.chapters.length) document = { ...common, contentKind: "NOVEL", synopsis, chapters: chapters.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) };
  } else if (value.contentKind === "WORLD_NODE") {
    rejectUnknownKeys(value, ["schemaVersion", "id", "title", "contentKind", "project", "revision", "provenance", "rights", "references", "previewUrl", "nodeType", "summary", "description"], "$", out);
    const nodeType = value.nodeType;
    const summary = stringAt(value.summary, "summary", out);
    const description = parseText(value.description, "description", out);
    if (["CHARACTER", "LOCATION", "FACTION", "ITEM", "EVENT", "CONCEPT"].includes(String(nodeType)) && summary && description) document = { ...common, contentKind: "WORLD_NODE", nodeType: nodeType as WorldNode["nodeType"], summary, description };
    else out.push(diagnostic("INVALID_WORLD_NODE", "nodeType", "World node fields are invalid."));
  } else if (value.contentKind === "WORLD_EDGE") {
    rejectUnknownKeys(value, ["schemaVersion", "id", "title", "contentKind", "project", "revision", "provenance", "rights", "references", "previewUrl", "fromNodeId", "toNodeId", "relation", "customRelation", "description"], "$", out);
    const fromNodeId = idAt<"ContentId">(value.fromNodeId, "fromNodeId", out);
    const toNodeId = idAt<"ContentId">(value.toNodeId, "toNodeId", out);
    const relation = value.relation;
    const description = value.description === undefined ? undefined : stringAt(value.description, "description", out);
    const customRelation = value.customRelation === undefined ? undefined : stringAt(value.customRelation, "customRelation", out, ID_PATTERN);
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId || !["LOCATED_IN", "KNOWS", "OWNS", "CAUSES", "PART_OF", "CONTRADICTS", "CUSTOM"].includes(String(relation)) || (relation === "CUSTOM" && !customRelation)) out.push(diagnostic("INVALID_WORLD_EDGE", "relation", "World edge endpoints and relation are invalid."));
    else document = { ...common, contentKind: "WORLD_EDGE", fromNodeId, toNodeId, relation: relation as WorldEdge["relation"], ...(customRelation ? { customRelation } : {}), ...(description ? { description } : {}) };
  } else {
    out.push(diagnostic("UNSUPPORTED_CONTENT_KIND", "contentKind", "Only text and world documents can be persisted by this model."));
  }
  return { document, diagnostics: out };
}

function canonicalize(value: unknown, omitHash = false): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, false)).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value).filter((key) => !(omitHash && key === "contentHash")).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], omitHash && key === "revision")}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function stableContentHash(document: CreatorContentDocument): ContentHash {
  return `fnv1a64:${fnv1a64(canonicalize(document, true))}` as ContentHash;
}

export function validateCreatorContentDocument(value: unknown): ContentResult<true> {
  const parsed = parseDocument(value);
  if (!parsed.document || parsed.diagnostics.length > 0) return { ok: false, diagnostics: parsed.diagnostics };
  const expected = stableContentHash(parsed.document);
  const supplied = parsed.document.revision.contentHash;
  if (supplied !== "" && supplied !== expected) return { ok: false, diagnostics: [diagnostic("HASH_MISMATCH", "revision.contentHash", "Content hash does not match canonical content.")] };
  return { ok: true, value: true };
}

export function normalizeCreatorContentDocument(value: unknown): ContentResult<CreatorContentDocument> {
  const parsed = parseDocument(value);
  if (!parsed.document || parsed.diagnostics.length > 0) return { ok: false, diagnostics: parsed.diagnostics };
  const normalized = { ...parsed.document, revision: { ...parsed.document.revision, contentHash: stableContentHash(parsed.document) } } as CreatorContentDocument;
  return { ok: true, value: normalized };
}

export function cloneCreatorContentDocument(value: unknown): ContentResult<CreatorContentDocument> {
  const normalized = normalizeCreatorContentDocument(value);
  if (!normalized.ok) return normalized;
  const cloned = JSON.parse(JSON.stringify(normalized.value)) as unknown;
  return normalizeCreatorContentDocument(cloned);
}

export function isCreatorContentDocument(value: unknown): value is CreatorContentDocument {
  return validateCreatorContentDocument(value).ok;
}
