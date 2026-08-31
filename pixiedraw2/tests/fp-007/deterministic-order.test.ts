import { canonicalJson } from "../../src/fp-007/build-manifest.ts";
import { canonicalize } from "../../src/fp-007/dependency-inventory.ts";
import {
  compareCodePointStrings,
  sortStringsByCodePoint,
} from "../../src/fp-007/stable-order.ts";
import {
  redactAuditValue,
  redactEnvironmentNames,
} from "../../src/fp-007/secret-redaction.ts";
import { createRepeatBuildSnapshot } from "../../src/fp-007/repeat-build-record.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

const UNICODE_KEYS = [
  "z",
  "A",
  "a",
  "é",
  "e\u0301",
  "😀",
  "🦄",
  "\uD800",
  "\uDC00",
  "same",
  "same",
];

Deno.test("FP007 deterministic ordering is locale-independent and code-point based", () => {
  const sorted = sortStringsByCodePoint(UNICODE_KEYS);
  const expected = [
    "A",
    "a",
    "e\u0301",
    "same",
    "same",
    "z",
    "é",
    "\uD800",
    "\uDC00",
    "😀",
    "🦄",
  ];
  assert(
    JSON.stringify(sorted) === JSON.stringify(expected),
    "unexpected Unicode code-point order",
  );
  assert(compareCodePointStrings("same", "same") === 0);
  assert(compareCodePointStrings("😀", "🦄") < 0);
  assert(compareCodePointStrings("e\u0301", "é") < 0);
});

Deno.test("FP007 canonical, redaction, and repeat-build hashes ignore insertion order", async () => {
  const first = {
    z: { "😀": 1, "e\u0301": 2, nested: { b: 3, A: 4 } },
    A: "value",
    "é": "accent",
  };
  const second = {
    "é": "accent",
    A: "value",
    z: { nested: { A: 4, b: 3 }, "e\u0301": 2, "😀": 1 },
  };
  assert(
    JSON.stringify(canonicalize(first)) ===
      JSON.stringify(canonicalize(second)),
    "canonical object order differs",
  );
  assert(canonicalJson(first) === canonicalJson(second));
  assert(
    JSON.stringify(redactAuditValue(first)) ===
      JSON.stringify(redactAuditValue(second)),
    "redaction order differs",
  );

  const environmentA = redactEnvironmentNames({
    z: "1",
    "é": "2",
    "e\u0301": "3",
    "😀": "4",
  });
  const environmentB = redactEnvironmentNames({
    "😀": "4",
    "e\u0301": "3",
    "é": "2",
    z: "1",
  });
  assert(JSON.stringify(environmentA) === JSON.stringify(environmentB));

  const snapshotInput = {
    inputHash: "a".repeat(64),
    buildManifestHash: "b".repeat(64),
    manifestCanonicalJson: "{}",
    toolchainHash: "c".repeat(64),
    artifactManifestHash: "d".repeat(64),
    artifacts: [
      {
        path: "😀.js",
        bytes: 2,
        size: 2,
        sha256: "e".repeat(64),
        compression: "NONE" as const,
      },
      {
        path: "e\u0301.js",
        bytes: 1,
        size: 1,
        sha256: "f".repeat(64),
        compression: "NONE" as const,
      },
    ],
  };
  const snapshotA = await createRepeatBuildSnapshot(snapshotInput);
  const snapshotB = await createRepeatBuildSnapshot({
    ...snapshotInput,
    artifacts: [...snapshotInput.artifacts].reverse(),
  });
  assert(snapshotA.snapshotHash === snapshotB.snapshotHash);
});
