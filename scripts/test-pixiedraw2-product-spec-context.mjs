import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const draw2Packages = ["WP-110", "WP-120", "WP-130", "WP-140", "WP-150", "WP-160", "WP-170", "WP-180", "WP-190"];
const map = JSON.parse(await fs.readFile(path.join(root, "00_START_HERE/WORK_PACKAGE_CONTEXT_MAP.json"), "utf8"));
const spec = await fs.readFile(path.join(root, "03_PRODUCTS/PIXIEEDRAW2_SPEC.md"), "utf8");
const provenance = JSON.parse(await fs.readFile(path.join(root, "docs/inventory/pixiedraw2-product-spec-provenance.json"), "utf8"));
const builder = await fs.readFile(path.join(root, "scripts/build_work_package_context.py"), "utf8");

assert.match(spec, /status: RECONSTRUCTED_CANONICAL/);
assert.match(spec, /original `03_PRODUCTS\/PIXIEEDRAW2_SPEC\.md` was not found/);
assert.equal(provenance.originalFound, false);
assert.deepEqual(provenance.requirementCoverage.missing, []);
assert.equal(provenance.requirementCoverage.inventedAsImplemented.length, 0);
assert.match(builder, /DRAW2_PRODUCT_SPEC_REQUIRED/);
assert.match(builder, /Validation Error: mandatory Draw2 product specification is missing/);
for (const workPackage of draw2Packages) {
  assert.ok(map.work_packages[workPackage]?.includes("03_PRODUCTS/PIXIEEDRAW2_SPEC.md"), `${workPackage} must include the mandatory Draw2 product spec`);
}

const run = (args) => new Promise((resolve) => {
  const child = spawn("python3", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
});

for (const workPackage of ["WP-110", "WP-120"]) {
  const result = await run(["scripts/build_work_package_context.py", "--work-package", workPackage, "--max-bytes", "750000"]);
  assert.equal(result.code, 0, `${workPackage} context generation failed:\n${result.stdout}\n${result.stderr}`);
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pixieedraw2-product-spec-"));
try {
  await fs.mkdir(path.join(tempRoot, "00_START_HERE"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, "00_START_HERE/WORK_PACKAGE_CONTEXT_MAP.json"), JSON.stringify({ global: [], work_packages: { "WP-110": [] } }), "utf8");
  const missing = await run(["scripts/build_work_package_context.py", "--root", tempRoot, "--work-package", "WP-110"]);
  assert.equal(missing.code, 3);
  assert.match(missing.stderr, /Validation Error/);
  assert.match(missing.stderr, /PIXIEEDRAW2_SPEC/);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

console.log("PiXiEEDraw2 mandatory product-spec/context validation passed");
