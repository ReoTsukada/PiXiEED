import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suite = JSON.parse(
  await readFile(
    path.join(root, "docs/inventory/baseline-suite-wp000.json"),
    "utf8",
  ),
);
const failureIdentity = JSON.parse(
  await readFile(
    path.join(root, "docs/inventory/baseline-failure-identity-wp080.json"),
    "utf8",
  ),
);
const expectedFailures = new Map(
  failureIdentity.failures.map((record) => [record.test, record]),
);

assert.equal(suite.schema_version, 1, "baseline suite schema changed");
assert.equal(suite.baseline, "WP-000/WP-005", "baseline suite scope changed");
assert.match(
  suite.baseline_commit,
  /^[0-9a-f]{40}$/u,
  "baseline commit must remain a full Git identity",
);
assert.equal(
  suite.selection_rule,
  "scripts/test-*.mjs files that did not contain playwright, chromium, page.goto, http.createServer, or fetch( at capture time",
  "baseline selection rule changed",
);
assert.equal(
  suite.expected_total,
  suite.expected_pass_count + suite.expected_failure_count,
  "baseline suite counts do not add up",
);
assert.equal(
  suite.tests.length,
  suite.expected_total,
  "baseline suite size changed",
);
assert.equal(
  new Set(suite.tests).size,
  suite.expected_total,
  "baseline suite contains duplicate tests",
);
assert.equal(
  expectedFailures.size,
  suite.expected_failure_count,
  "baseline failure count changed",
);
assert(
  suite.tests.every((test) => /^scripts\/test-[^/]+\.mjs$/u.test(test)),
  "baseline suite contains a non-test path",
);
assert(
  [...expectedFailures.keys()].every((test) => suite.tests.includes(test)),
  "baseline failure identity contains a test outside the fixed suite",
);

for (const test of suite.tests) {
  await access(path.join(root, test), constants.R_OK);
  assert(
    (await stat(path.join(root, test))).isFile(),
    `baseline test is not a file: ${test}`,
  );
}

const records = suite.tests.map((test) => {
  const result = spawnSync(process.execPath, [test], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 24 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const expectedFailure = expectedFailures.get(test);
  const missingSignatures = expectedFailure
    ? expectedFailure.signature.filter((token) => !output.includes(token))
    : [];
  const expectedIdentity = expectedFailure
    ? result.status === 1 && missingSignatures.length === 0
    : result.status === 0;
  return {
    test,
    target: expectedFailure?.target ?? null,
    expected: expectedFailure ? "FAIL" : "PASS",
    exitCode: result.status,
    signal: result.signal,
    spawnError: result.error?.code ?? null,
    missingSignatures,
    expectedIdentity,
  };
});

const passed = records.filter((record) => record.exitCode === 0).length;
const failed = records.filter((record) => record.exitCode !== 0).length;
const regressions = records.filter((record) => !record.expectedIdentity);

assert.equal(
  passed,
  suite.expected_pass_count,
  JSON.stringify(records, null, 2),
);
assert.equal(
  failed,
  suite.expected_failure_count,
  JSON.stringify(records, null, 2),
);
assert.equal(regressions.length, 0, JSON.stringify(regressions, null, 2));

console.log(
  `WP-000 baseline suite passed: ${passed}/${suite.expected_total} successful; ` +
    `${failed} inherited failures match test, target, and major error signature; new failures: 0`,
);
