function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("DRAW-170 keeps Export out of the initial editor entry", async () => {
  const source = await Deno.readTextFile(new URL("../../src/draw2-entry.ts", import.meta.url));
  const bundle = await Deno.readTextFile(new URL("../../dist/draw2-entry.js", import.meta.url));
  const config = await Deno.readTextFile(new URL("../../deno.json", import.meta.url));

  assert(!source.includes('from "./draw2-export.ts"'), "Initial source must not statically import the Export module.");
  const lazyExportUrl = /new URL\(\s*"draw2-export\.js(?:\?[^"\\]+)?"\s*,\s*import\.meta\.url\s*,?\s*\)\.href/s;
  assert(lazyExportUrl.test(source), "Initial source must declare the Export lazy URL.");
  assert(!bundle.includes("// src/draw2-export.ts"), "Initial bundle must not contain the Export implementation.");
  assert(lazyExportUrl.test(bundle), "Initial bundle must retain the Export lazy boundary.");
  assert(config.includes('"build:export"'), "The isolated Export chunk must have an explicit build task.");
});
