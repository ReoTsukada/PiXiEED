import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";
import { FP005_INPUT_LIMITS } from "../../src/fp-005/policies.ts";
import { validateArchive } from "../../src/fp-005/archive-validation.ts";
import { validateContent } from "../../src/fp-005/content-validation.ts";
import { validateJsonInput } from "../../src/fp-005/input-limits.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function code(result: { readonly ok: boolean; readonly diagnostics: readonly { readonly code: string }[] }): string | undefined {
  return result.diagnostics[0]?.code;
}

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
]);
const entry = (path: string, compressedByteLength = 10, expandedByteLength = 10) => ({ path, compressedByteLength, expandedByteLength });

Deno.test("FP005 input limits accept bounded JSON and binary content", () => {
  const json = validateJsonInput({ layers: [{ name: "ok" }] });
  assert(json.ok);
  const content = validateContent({ data: png, mimeType: "image/png", declaredByteLength: png.byteLength });
  assert(content.ok && content.value.byteLength === png.byteLength);
});

Deno.test("FP005 content rejects active content, MIME mismatch, and truncation", () => {
  assert(code(validateContent({ data: new TextEncoder().encode("<svg></svg>"), mimeType: "image/svg+xml" })) === FP005_ERROR_CODES.ACTIVE_CONTENT_REJECTED);
  assert(code(validateContent({ data: png, mimeType: "image/jpeg" })) === FP005_ERROR_CODES.INPUT_INVALID);
  assert(code(validateContent({ data: png, mimeType: "image/png", declaredByteLength: png.byteLength + 1 })) === FP005_ERROR_CODES.INPUT_INVALID);
});

Deno.test("FP005 JSON rejects cycles, excessive depth, and oversize input", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert(code(validateJsonInput(cycle)) === FP005_ERROR_CODES.INPUT_INVALID);
  assert(code(validateJsonInput({ nested: { value: true } }, { maxJsonDepth: 1 })) === FP005_ERROR_CODES.INPUT_INVALID);
  assert(code(validateJsonInput("x".repeat(FP005_INPUT_LIMITS.maxEnvelopeBytes + 1))) === FP005_ERROR_CODES.INPUT_TOO_LARGE);
});

Deno.test("FP005 archive accepts bounded entries and rejects active content", () => {
  const result = validateArchive([entry("project/data.dat")]);
  assert(result.ok && result.value.entryCount === 1 && result.value.expandedByteLength === 10);
  assert(code(validateArchive([entry("project/run.js")])) === FP005_ERROR_CODES.ARCHIVE_INVALID);
});

Deno.test("FP005 archive rejects zip bombs, excessive ratio, count, and total expansion", () => {
  assert(code(validateArchive([entry("project/bomb.bin", 1, FP005_INPUT_LIMITS.maxCompressionRatio + 1)])) === FP005_ERROR_CODES.ARCHIVE_INVALID);
  assert(code(validateArchive([entry("project/ratio.bin", 1, FP005_INPUT_LIMITS.maxCompressionRatio + 1)])) === FP005_ERROR_CODES.ARCHIVE_INVALID);
  assert(code(validateArchive(new Array(FP005_INPUT_LIMITS.maxArchiveEntries + 1).fill(entry("project/item.bin")))) === FP005_ERROR_CODES.ARCHIVE_INVALID);
  assert(code(validateArchive([entry("project/total-a.bin", 1, FP005_INPUT_LIMITS.maxExpandedArchiveBytes), entry("project/total-b.bin", 1, 1)])) === FP005_ERROR_CODES.ARCHIVE_INVALID);
});
