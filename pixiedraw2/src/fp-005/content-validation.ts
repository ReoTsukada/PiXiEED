/** FP-005 content boundary: inspect the actual byte payload, not attacker metadata. */
import { FP005_ERROR_CODES } from "./error-codes.ts";
import { fp005Failure, fp005Success, type Fp005Result } from "./contracts.ts";
import { validateBinarySize, validateJsonInput, type Fp005BinarySummary } from "./input-limits.ts";
import { validateArchiveBytes } from "./archive-validation.ts";

export interface Fp005ContentInput {
  readonly data?: ArrayBuffer | Uint8Array;
  readonly bytes?: ArrayBuffer | Uint8Array;
  readonly mimeType: string;
  readonly declaredByteLength?: number;
}

export interface Fp005ContentSummary extends Fp005BinarySummary {
  readonly mimeType: string;
  readonly verifiedFromBytes?: boolean;
}

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/iu;
const ACTIVE_MIME = /^(?:application\/(?:javascript|java-archive|x-httpd-php|wasm|x-sh)|image\/svg\+xml|text\/(?:html|javascript|x-shellscript))$/iu;
const ZIP_MIME = /^(?:application\/(?:zip|x-zip-compressed)|application\/vnd\.(?:ms-|openxmlformats-).+)$/iu;
const UNSUPPORTED_ARCHIVE_MIME = /^(?:application\/(?:gzip|x-7z-compressed|x-rar(?:-compressed)?|x-tar|java-archive)|application\/x-bzip2)$/iu;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function fail<T>(code: typeof FP005_ERROR_CODES[keyof typeof FP005_ERROR_CODES], message: string, path?: string): Fp005Result<T> {
  return fp005Failure(code, message, path);
}

function actualBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return undefined;
}

function inputBytes(value: Record<string, unknown>): Uint8Array | undefined {
  return actualBytes(value.data) ?? actualBytes(value.bytes);
}

function startsWith(value: Uint8Array, prefix: readonly number[]): boolean {
  return value.byteLength >= prefix.length && prefix.every((byte, index) => value[index] === byte);
}

function endsWith(value: Uint8Array, suffix: readonly number[]): boolean {
  return value.byteLength >= suffix.length && suffix.every((byte, index) => value[value.byteLength - suffix.length + index] === byte);
}

function asciiToken(value: Uint8Array, token: string): boolean {
  if (token.length === 0 || value.byteLength < token.length) return false;
  for (let offset = 0; offset <= value.byteLength - token.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < token.length; index += 1) {
      const byte = value[offset + index] ?? 0;
      const expected = token.charCodeAt(index);
      if ((byte | 0x20) !== (expected | 0x20)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function activeBytes(value: Uint8Array): boolean {
  for (const token of ["<svg", "<html", "<script", "<!doctype", "<iframe", "<object", "<embed", "javascript:", "onerror=", "onload=", "<?php", "#!/bin/sh"]) {
    if (asciiToken(value, token)) return true;
  }
  // Bare JavaScript in an octet-stream is also not a safe opaque blob. These
  // markers are checked in bytes so no attacker-controlled metadata is trusted.
  return ["function ", "const ", "let ", "var ", "console.", "document.", "window.", "=>"].some((token) => asciiToken(value, token));
}

function validPng(value: Uint8Array): boolean {
  if (!startsWith(value, PNG_SIGNATURE) || value.byteLength < 20) return false;
  let offset = 8;
  let sawHeader = false;
  let sawEnd = false;
  while (offset < value.byteLength) {
    if (offset + 12 > value.byteLength) return false;
    const length = (value[offset] ?? 0) * 0x1000000 + ((value[offset + 1] ?? 0) << 16) + ((value[offset + 2] ?? 0) << 8) + (value[offset + 3] ?? 0);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(length) || end < offset || end > value.byteLength) return false;
    const type = String.fromCharCode(value[offset + 4] ?? 0, value[offset + 5] ?? 0, value[offset + 6] ?? 0, value[offset + 7] ?? 0);
    if (type === "IHDR") {
      if (sawHeader || length !== 13 || offset !== 8) return false;
      sawHeader = true;
    }
    if (type === "IEND") {
      if (!sawHeader || length !== 0 || end !== value.byteLength) return false;
      sawEnd = true;
    }
    offset = end;
    if (sawEnd) break;
  }
  return sawHeader && sawEnd && offset === value.byteLength;
}

function validJpeg(value: Uint8Array): boolean {
  return value.byteLength >= 4 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff && endsWith(value, [0xff, 0xd9]);
}

function validGif(value: Uint8Array): boolean {
  const header = startsWith(value, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(value, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  return header && value.byteLength >= 14 && value[value.byteLength - 1] === 0x3b;
}

function knownMime(mime: string): boolean {
  return ["application/octet-stream", "application/json", "application/pdf", "image/png", "image/jpeg", "image/gif", "text/plain", "text/csv"].includes(mime) || ZIP_MIME.test(mime);
}

function validateContentInternal(input: unknown, strict: boolean): Fp005Result<Fp005ContentSummary> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Content input is invalid.");
  const value = input as Record<string, unknown>;
  if (typeof value.mimeType !== "string" || !MIME.test(value.mimeType)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Content MIME type is invalid.", "mimeType");
  const bytes = inputBytes(value);
  if (bytes === undefined) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Content requires a real Uint8Array or ArrayBuffer payload.", "data");
  const mimeType = value.mimeType.toLowerCase();
  if (ACTIVE_MIME.test(mimeType)) return fail(FP005_ERROR_CODES.ACTIVE_CONTENT_REJECTED, "Active content is not accepted.", "mimeType");
  if (!knownMime(mimeType)) {
    return fail(UNSUPPORTED_ARCHIVE_MIME.test(mimeType) ? FP005_ERROR_CODES.ARCHIVE_INVALID : FP005_ERROR_CODES.INPUT_INVALID, "MIME type has no bounded parser.", "mimeType");
  }
  const binary = validateBinarySize(bytes);
  if (!binary.ok) return binary;
  if (value.declaredByteLength !== undefined && (!Number.isSafeInteger(value.declaredByteLength) || value.declaredByteLength !== bytes.byteLength)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Content length does not match the declared length.", "declaredByteLength");
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed" || ZIP_MIME.test(mimeType)) {
    const archive = validateArchiveBytes(bytes);
    if (!archive.ok) return archive;
  } else if (mimeType === "image/png") {
    // The old facade accepted an eight-byte signature fixture. Keep that
    // compatibility result explicitly unverified; finalization uses the strict alias.
    if (!(validPng(bytes) || !strict && bytes.byteLength === PNG_SIGNATURE.length && startsWith(bytes, PNG_SIGNATURE))) return fail(FP005_ERROR_CODES.INPUT_INVALID, "PNG payload is truncated or malformed.", "data");
  } else if (mimeType === "image/jpeg" && !validJpeg(bytes)) {
    return fail(FP005_ERROR_CODES.INPUT_INVALID, "JPEG payload is truncated or missing EOI.", "data");
  } else if (mimeType === "image/gif" && !validGif(bytes)) {
    return fail(FP005_ERROR_CODES.INPUT_INVALID, "GIF payload is truncated or missing trailer.", "data");
  } else if (mimeType === "application/json") {
    const json = validateJsonInput(bytes);
    if (!json.ok) return json;
  } else if (mimeType === "application/pdf" && (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) || !asciiToken(bytes, "%%EOF"))) {
    return fail(FP005_ERROR_CODES.INPUT_INVALID, "PDF payload is truncated or malformed.", "data");
  } else if (mimeType === "application/octet-stream" || mimeType.startsWith("text/")) {
    if (activeBytes(bytes)) return fail(FP005_ERROR_CODES.ACTIVE_CONTENT_REJECTED, "Active SVG, HTML, or script content is not accepted in an opaque payload.", "data");
    if (mimeType.startsWith("text/")) {
      try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail(FP005_ERROR_CODES.INPUT_INVALID, "Text payload is not valid UTF-8.", "data"); }
    }
  }
  return fp005Success({ ...binary.value, mimeType, verifiedFromBytes: strict || validPng(bytes) || mimeType !== "image/png" });
}

/** Public content boundary; every accepted MIME is verified from actual bytes. */
export function validateContent(input: unknown): Fp005Result<Fp005ContentSummary> {
  return validateContentInternal(input, true);
}

/** Strict finalization entry point. Every supported MIME is parsed from bytes. */
export function validateContentBytes(input: unknown): Fp005Result<Fp005ContentSummary> {
  return validateContentInternal(input, true);
}

export const validateContentInput = validateContent;
export const validateContentBlob = validateContent;
export const validateContentFinalization = validateContentBytes;
