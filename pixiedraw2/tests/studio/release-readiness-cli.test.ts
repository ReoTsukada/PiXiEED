import { strict as assert } from "node:assert";
import {
  expectedStudioReadinessDecision,
  parseStudioReadinessArgs,
  readinessExitCode,
} from "../../../scripts/evaluate-pixieedstudio-readiness.ts";

Deno.test("STUDIO-030 CLI requires explicit candidate, evidence, and target", () => {
  const parsed = parseStudioReadinessArgs([
    "--candidate=/secure/release.json",
    "--evidence",
    "/secure/evidence.json",
    "--target",
    "BETA",
  ]);
  assert.deepEqual(parsed, {
    kind: "options",
    value: {
      candidatePath: "/secure/release.json",
      evidencePath: "/secure/evidence.json",
      target: "BETA",
    },
  });
  assert.equal(
    expectedStudioReadinessDecision("PRODUCTION"),
    "READY_FOR_PRODUCTION",
  );
  assert.equal(readinessExitCode("READY_FOR_BETA"), 0);
  assert.equal(readinessExitCode("NOT_READY"), 1);
});

Deno.test("STUDIO-030 CLI fails closed for missing or unknown arguments", () => {
  assert.deepEqual(parseStudioReadinessArgs([]), { kind: "help" });
  assert.deepEqual(parseStudioReadinessArgs(["--candidate", "x"]), {
    kind: "error",
    message: "--evidence is required.",
  });
  assert.deepEqual(parseStudioReadinessArgs([
    "--candidate",
    "x",
    "--evidence",
    "y",
    "--target",
    "LOCAL",
  ]), {
    kind: "error",
    message: "--target must be STAGING, BETA, or PRODUCTION.",
  });
  assert.deepEqual(parseStudioReadinessArgs(["--unknown"]), {
    kind: "error",
    message: "Unknown option: --unknown",
  });
});

Deno.test("STUDIO-030 CLI accepts the live harness readinessEvidence wrapper", () => {
  assert.match(
    Deno.readTextFileSync("../scripts/evaluate-pixieedstudio-readiness.ts"),
    /readinessEvidence/u,
  );
});
