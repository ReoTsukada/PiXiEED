#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts", "validate_pixieed_program.py");
const promptBuilder = path.join(repoRoot, "scripts", "build_work_package_prompt.py");
const contextBuilder = path.join(repoRoot, "scripts", "build_work_package_context.py");
const schema = path.join(repoRoot, "00_START_HERE", "work-package-registry-v2.schema.json");

function runPython(script, args) {
  return spawnSync("python3", [script, ...args], { cwd: repoRoot, encoding: "utf8" });
}

function expectFailure(result, label) {
  assert.notEqual(result.status, 0, `${label} must fail`);
}

function validRegistry() {
  const actions = ["production migration", "deploy", "publish", "commit", "push", "route cutover"];
  return {
    schemaVersion: 2,
    programId: "TEST-PROGRAM-V2",
    updatedAt: "2026-08-10T00:00:00Z",
    authority: { owner: "test", source: "fixture", parentIntegrationReady: false },
    globalContext: ["context/global.md"],
    historicalCompleted: ["HIST-001"],
    phases: [{ id: "TEST", title: "Test phase", order: 1 }],
    packages: [{
      id: "TEST-001",
      title: "Ready test package",
      phase: "TEST",
      status: "READY",
      kind: "verification",
      dependsOn: ["HIST-001"],
      definition: "definitions/TEST-001.md",
      contextFiles: ["context/package.md"],
      allowedWriteGlobs: ["scripts/**"],
      forbiddenActions: actions,
      acceptanceIds: ["test.acceptance.001"],
      verificationLevel: "L1_UNIT_CONTRACT",
      implementationRoute: { model: "luna_high", reasoning: "small deterministic fixture", parallelism: 1 },
      reviewRoute: { model: "terra_high", reasoning: "independent framework review", independent: true },
      nextPackage: null,
      autoStartNext: false,
    }],
  };
}

async function writeRegistry(root, registry) {
  await mkdir(path.join(root, "00_START_HERE"), { recursive: true });
  await mkdir(path.join(root, "context"), { recursive: true });
  await mkdir(path.join(root, "definitions"), { recursive: true });
  await writeFile(path.join(root, "context", "global.md"), "# Global\n", "utf8");
  await writeFile(path.join(root, "context", "package.md"), "# Package\n", "utf8");
  await writeFile(path.join(root, "definitions", "TEST-001.md"), "# Definition\n", "utf8");
  await writeFile(path.join(root, "00_START_HERE", "work-package-registry-v2.json"), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pixieed-program-v2-"));
  try {
    const registry = validRegistry();
    await writeRegistry(tempRoot, registry);

    const valid = runPython(validator, ["--root", tempRoot, "--schema", schema]);
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);

    const unknown = runPython(contextBuilder, ["--root", tempRoot, "--schema", schema, "--work-package", "NO-SUCH-ID"]);
    expectFailure(unknown, "unknown package");

    const cycleRegistry = structuredClone(registry);
    cycleRegistry.packages = [
      { ...registry.packages[0], id: "A", dependsOn: ["B"], nextPackage: "B" },
      { ...registry.packages[0], id: "B", dependsOn: ["A"], nextPackage: null },
    ];
    await writeFile(path.join(tempRoot, "00_START_HERE", "work-package-registry-v2.json"), `${JSON.stringify(cycleRegistry, null, 2)}\n`, "utf8");
    expectFailure(runPython(validator, ["--root", tempRoot, "--schema", schema]), "dependency cycle");

    const missingRegistry = structuredClone(registry);
    missingRegistry.packages[0].contextFiles = ["context/missing.md"];
    await writeFile(path.join(tempRoot, "00_START_HERE", "work-package-registry-v2.json"), `${JSON.stringify(missingRegistry, null, 2)}\n`, "utf8");
    expectFailure(runPython(validator, ["--root", tempRoot, "--schema", schema]), "missing context path");

    const historicalRegistry = structuredClone(registry);
    historicalRegistry.packages[0].status = "HISTORICAL";
    await writeFile(path.join(tempRoot, "00_START_HERE", "work-package-registry-v2.json"), `${JSON.stringify(historicalRegistry, null, 2)}\n`, "utf8");
    expectFailure(runPython(contextBuilder, ["--root", tempRoot, "--schema", schema, "--work-package", "TEST-001"]), "historical package refusal");

    await writeRegistry(tempRoot, registry);
    const promptOutput = path.join(tempRoot, ".codex", "prompts", "TEST-001.md");
    const prompt = runPython(promptBuilder, ["--root", tempRoot, "--schema", schema, "--work-package", "TEST-001", "--output", promptOutput]);
    assert.equal(prompt.status, 0, `${prompt.stdout}\n${prompt.stderr}`);
    const promptText = await readFile(promptOutput, "utf8");
    assert.match(promptText, /TEST-001/);
    assert.match(promptText, /autoStartNext.*false/);
    assert.match(promptText, /test\.acceptance\.001/);
    assert.match(promptText, /production migration/);

    const contextOutput = path.join(tempRoot, ".codex", "context", "TEST-001.md");
    const context = runPython(contextBuilder, ["--root", tempRoot, "--schema", schema, "--work-package", "TEST-001", "--output", contextOutput, "--max-bytes", "50000"]);
    assert.equal(context.status, 0, `${context.stdout}\n${context.stderr}`);
    const manifestOutput = path.join(tempRoot, ".codex", "context", "TEST-001.manifest.json");
    const manifest = JSON.parse(await readFile(manifestOutput, "utf8"));
    const contextBytes = await readFile(contextOutput);
    assert.deepEqual(manifest.exactFiles, ["context/global.md", "definitions/TEST-001.md", "context/package.md"]);
    assert.equal(manifest.contextBytes, contextBytes.byteLength);
    assert.equal(manifest.contextSha256, createHash("sha256").update(contextBytes).digest("hex"));
    assert.equal(manifest.sourceFiles.length, manifest.exactFiles.length);
    assert.equal(manifest.status, "GENERATED_EXACT_NO_TRUNCATION");

    const liveRegistryCandidates = [
      path.join(repoRoot, "00_START_HERE", "WORK_PACKAGE_REGISTRY.json"),
      path.join(repoRoot, "00_START_HERE", "work-package-registry-v2.json"),
      path.join(repoRoot, "00_START_HERE", "WORK_PACKAGE_REGISTRY_V2.json"),
      path.join(repoRoot, "00_START_HERE", "work-package-registry.json"),
    ];
    const liveRegistry = liveRegistryCandidates.find((candidate) => existsSync(candidate));
    if (liveRegistry) {
      const live = runPython(validator, ["--root", repoRoot, "--registry", liveRegistry, "--schema", schema]);
      assert.equal(live.status, 0, `${live.stdout}\n${live.stderr}`);
    }

    console.log(JSON.stringify({
      status: "PASS",
      temporaryRegistry: "validated",
      checks: ["unknown-id", "cycle", "missing-path", "historical-refusal", "prompt-generation", "context-manifest"],
      liveRegistry: liveRegistry ? "validated-without-generation" : "absent-skipped",
    }, null, 2));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
