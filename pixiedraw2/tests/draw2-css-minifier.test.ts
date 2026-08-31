import { minifyCss } from "../tools/minify-draw2-css.ts";

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertStringIncludes(value: string, expected: string): void {
  assert(value.includes(expected), `Expected ${expected} to be present`);
}

Deno.test("minifyCss preserves quoted content and removes ordinary comments", () => {
  const source =
    `/* docs */\n.foo {\n  content: "two  spaces";\n  width: calc(100% - 2rem);\n}`;
  const minified = minifyCss(source);

  assertEquals(
    minified,
    '.foo { content: "two  spaces"; width: calc(100% - 2rem); }\n',
  );
  assert(!minified.includes("docs"));
});

Deno.test("minifyCss keeps CSS contracts and reduces the source size", async () => {
  const source = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  const minified = minifyCss(source);

  assert(minified.length < source.length);
  assertStringIncludes(minified, ".draw2-canvas-stack");
  assertStringIncludes(minified, "--draw2-color-map-size");
  assertStringIncludes(minified, "@media (prefers-reduced-motion: reduce)");
});
