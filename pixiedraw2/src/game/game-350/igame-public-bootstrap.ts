/// <reference lib="dom" />

import {
  createIGamePlayerManifest,
  type IGamePlayerManifest,
} from "./igame-player-contract.ts";
import {
  requireAuthorizationProofV1,
  type AuthorizationProofV1,
} from "../../wp160-contracts.ts";

export const IGAME_PUBLIC_BOOTSTRAP_SCHEMA =
  "pixieed-igame-player-bootstrap/v1" as const;

export interface IGamePublicBootstrapInput {
  readonly schema: typeof IGAME_PUBLIC_BOOTSTRAP_SCHEMA;
  readonly product: { readonly id: string; readonly title: string };
  readonly revision: {
    readonly id: string;
    readonly number: number;
    readonly content_hash?: string | null;
    readonly package_hash: string;
  };
  readonly manifest: unknown;
  readonly package: {
    readonly url: string;
    readonly sha256: string;
    readonly mime_type: string;
    readonly expires_in: number;
  };
  readonly proof: unknown;
}

export interface IGamePublicBootstrap {
  readonly schema: typeof IGAME_PUBLIC_BOOTSTRAP_SCHEMA;
  readonly product: { readonly id: string; readonly title: string };
  readonly revision: IGamePublicBootstrapInput["revision"];
  readonly manifest: IGamePlayerManifest;
  readonly package: IGamePublicBootstrapInput["package"];
  readonly proof: AuthorizationProofV1;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID.test(value);
}

function safeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return url.protocol === "https:" || localHttp;
  } catch {
    return false;
  }
}

/**
 * Validate the server response before any package bytes are interpreted.
 * The signed URL is still independently hash-checked by the Player.
 */
export function parseIGamePublicBootstrap(
  value: unknown,
  principalId: string,
): IGamePublicBootstrap {
  const candidate = record(value);
  if (candidate.schema !== IGAME_PUBLIC_BOOTSTRAP_SCHEMA) {
    throw new Error("iGAME公開Bootstrapのスキーマが対応していません。");
  }
  if (!safeId(principalId)) throw new Error("iGAME公開Bootstrapの利用者IDが不正です。");
  const product = record(candidate.product);
  const revision = record(candidate.revision);
  const packageInfo = record(candidate.package);
  const productId = product.id;
  const revisionId = revision.id;
  const packageHash = revision.package_hash;
  const packageBytesHash = packageInfo.sha256;
  const revisionNumber = typeof revision.number === "number" ? revision.number : NaN;
  const expiresIn = typeof packageInfo.expires_in === "number" ? packageInfo.expires_in : NaN;
  if (!safeId(productId) || typeof product.title !== "string" ||
    product.title.trim().length === 0 || !safeId(revisionId) ||
    !Number.isSafeInteger(revisionNumber) || revisionNumber < 1 ||
    !SHA256.test(String(packageHash)) || !SHA256.test(String(packageBytesHash)) ||
    !safeUrl(packageInfo.url) || typeof packageInfo.mime_type !== "string" ||
    packageInfo.mime_type.length > 256 || !Number.isSafeInteger(expiresIn) ||
    expiresIn < 1 || expiresIn > 300) {
    throw new Error("iGAME公開BootstrapのRevisionまたはPackage情報が不正です。");
  }
  const manifest = createIGamePlayerManifest(
    record(candidate.manifest) as unknown as Parameters<typeof createIGamePlayerManifest>[0],
  );
  if (manifest.productId !== productId || manifest.revisionId !== revisionId) {
    throw new Error("iGAME公開Bootstrapの商品とRevisionが一致しません。");
  }
  const proof = requireAuthorizationProofV1(candidate.proof, {
    principalId,
    resourceType: "igame-product",
    resourceId: manifest.productId,
    action: "play",
    capability: "game.play",
    tenantId: manifest.tenantId,
  });
  if (proof.expiresAt !== undefined && Date.parse(proof.expiresAt) <= Date.now()) {
    throw new Error("iGAME公開Bootstrapのプレイ権限が期限切れです。");
  }
  return Object.freeze({
    schema: IGAME_PUBLIC_BOOTSTRAP_SCHEMA,
    product: { id: productId, title: product.title.trim() },
    revision: {
      id: revisionId,
      number: revisionNumber,
      content_hash: typeof revision.content_hash === "string" ? revision.content_hash : null,
      package_hash: String(packageHash),
    },
    manifest,
    package: {
      url: packageInfo.url,
      sha256: String(packageBytesHash),
      mime_type: packageInfo.mime_type,
      expires_in: expiresIn,
    },
    proof,
  });
}

export async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer as ArrayBuffer,
  ));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function fetchIGamePublicPackage(
  bootstrap: IGamePublicBootstrap,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const response = await fetcher(bootstrap.package.url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`iGAME Packageの取得に失敗しました (${response.status})。`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (await sha256BytesHex(bytes) !== bootstrap.package.sha256) {
    throw new Error("iGAME PackageのHashが一致しません。");
  }
  return bytes;
}
