import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  root,
  "docs/inventory/baseline-failure-identity-wp080.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const records = manifest.failures.map((expected) => {
  const result = spawnSync(process.execPath, [expected.test], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 24 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const missing = expected.signature.filter((token) => !output.includes(token));
  return {
    test: expected.test,
    target: expected.target,
    exitCode: result.status,
    missing,
    sameIdentity: result.status === 1 && missing.length === 0,
  };
});

assert.equal(
  records.length,
  manifest.expected_failure_count,
  "baseline failure manifest count changed",
);
assert.equal(
  records.filter((record) => !record.sameIdentity).length,
  0,
  JSON.stringify(records, null, 2),
);
console.log(
  `Baseline failure identity passed: ${records.length}/${manifest.expected_failure_count} existing failures match test, target, and signature; new failure identities: 0`,
);
