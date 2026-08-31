import { analyzeCleanRoom } from "../../src/fp-007/clean-room-policy.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function auditWithOrder(reverse: boolean) {
  const generatedFiles = [
    "z/asset.js",
    "A/asset.js",
    "a/asset.js",
    "e\u0301/asset.js",
    "é/asset.js",
    "😀/asset.js",
    "🦄/asset.js",
    "/tmp/generated.js",
    "C:\\build\\generated.js",
  ];
  const usedEnvironmentNames = [
    "é_ENV",
    "e\u0301_ENV",
    "A_ENV",
    "a_ENV",
    "😀_ENV",
  ];
  const sourceTexts = [
    { path: "z/source.ts", content: "Math.random()" },
    { path: "A/source.ts", content: "Date.now()" },
    { path: "e\u0301/source.ts", content: "Intl.NumberFormat()" },
    { path: "é/source.ts", content: "os.hostname()" },
  ];
  const commands = [
    "z-build",
    "A-build",
    "a-build",
    "e\u0301-build",
    "é-build",
    "😀-build",
    "🦄-build",
  ];
  const order = <T>(items: T[]) => reverse ? [...items].reverse() : items;
  return analyzeCleanRoom({
    workspaceStatus: "clean",
    generatedFiles: order(generatedFiles),
    declaredGeneratedFiles: [],
    sourceTexts: order(sourceTexts),
    usedEnvironmentNames: order(usedEnvironmentNames),
    declaredEnvironmentNames: [],
    commands: order(commands),
    networkMode: "disabled",
    cacheMode: "disabled",
  });
}

Deno.test("FP007 clean-room ordering is stable for Unicode and path forms", () => {
  const first = auditWithOrder(false);
  const second = auditWithOrder(true);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "clean-room evidence order changed with input order",
  );
  assert(first.findings.length > 0, "expected clean-room findings");
  assert(
    first.findings.some((item) => item.code === "ABSOLUTE_PATH"),
    "POSIX/Windows absolute paths were not classified",
  );
  assert(
    first.findings[0] !== undefined &&
      first.findings.at(-1) !== undefined &&
      first.findings[0].subject <= first.findings.at(-1)!.subject,
    "findings are not deterministically ordered",
  );
});

Deno.test("FP007 clean-room implementation contains no localeCompare dependency", async () => {
  const source = await Deno.readTextFile(
    new URL("../../src/fp-007/clean-room-policy.ts", import.meta.url),
  );
  assert(!source.includes("localeCompare"), "localeCompare must be absent");
});
